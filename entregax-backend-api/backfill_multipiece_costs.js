/**
 * 🔧 Backfill retroactivo de costos para paquetes MULTI-PIEZA.
 *
 * Problema: en envíos con varias cajas, el master guardó el costo total
 * (pobox_service_cost + pobox_cost_usd) y las hijas quedaron en $0.
 * Esto rompe el reporte de "Pagos a Proveedores" porque agrupa por hijas.
 *
 * Solución: para cada master multi-pieza con costo > 0:
 *   1. Repartir el costo entre sus hijas en proporción a su volumen individual
 *      (length × width × height). Si alguna no tiene dimensiones, repartir
 *      en partes iguales como fallback.
 *   2. Copiar también pobox_tarifa_nivel, pobox_venta_usd, registered_exchange_rate
 *      a cada hija (replicado del master).
 *   3. Poner el master en 0 (pobox_service_cost, pobox_cost_usd, pobox_venta_usd,
 *      pobox_tarifa_nivel = NULL) para evitar doble cobro.
 *
 * SAFE: solo afecta filas donde is_master = TRUE AND total_boxes > 1.
 *       Es idempotente: si el master ya está en 0, lo salta.
 *
 * Uso:  node backfill_multipiece_costs.js              (dry-run)
 *       node backfill_multipiece_costs.js --apply      (aplicar cambios)
 */

require('dotenv').config();
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log(`\n🔧 BACKFILL multi-pieza  ${APPLY ? '(APLICANDO CAMBIOS)' : '(DRY-RUN)'}\n`);

  const client = await pool.connect();
  let masters = 0, children = 0, skipped = 0, errors = 0;

  try {
    // 1) Buscar masters multi-pieza con costos > 0
    const mastersRes = await client.query(`
      SELECT
        id, tracking_internal, total_boxes,
        COALESCE(pobox_service_cost, 0)::float AS pobox_service_cost,
        COALESCE(pobox_cost_usd, 0)::float    AS pobox_cost_usd,
        COALESCE(pobox_venta_usd, 0)::float   AS pobox_venta_usd,
        pobox_tarifa_nivel,
        COALESCE(registered_exchange_rate, 0)::float AS registered_exchange_rate
      FROM packages
      WHERE is_master = TRUE
        AND total_boxes > 1
        AND (COALESCE(pobox_service_cost, 0) > 0 OR COALESCE(pobox_cost_usd, 0) > 0)
        -- ⛔ Excluir REPACK: en repack el master DEBE conservar el costo único (1 caja consolidada)
        AND COALESCE(tracking_internal, '') NOT ILIKE '%REPACK%'
      ORDER BY id
    `);

    console.log(`📦 Masters multi-pieza con costo > 0:  ${mastersRes.rows.length}\n`);

    for (const m of mastersRes.rows) {
      // 2) Hijas del master
      const childrenRes = await client.query(`
        SELECT
          id, tracking_internal, box_number,
          COALESCE(pkg_length, 0)::float AS l,
          COALESCE(pkg_width, 0)::float  AS w,
          COALESCE(pkg_height, 0)::float AS h,
          COALESCE(pobox_service_cost, 0)::float AS current_mxn,
          COALESCE(pobox_cost_usd, 0)::float    AS current_usd
        FROM packages
        WHERE master_id = $1
        ORDER BY box_number
      `, [m.id]);

      if (childrenRes.rows.length === 0) {
        console.log(`⚠️  Master #${m.id} ${m.tracking_internal}: SIN hijas en BD, salto`);
        skipped++;
        continue;
      }

      // 3) Repartir por volumen (fallback: partes iguales)
      const volumes = childrenRes.rows.map(c => c.l * c.w * c.h);
      const totalVolume = volumes.reduce((a, b) => a + b, 0);
      const useEqual = totalVolume <= 0;

      const distribuciones = childrenRes.rows.map((c, i) => {
        const ratio = useEqual ? (1 / childrenRes.rows.length) : (volumes[i] / totalVolume);
        return {
          id: c.id,
          tracking: c.tracking_internal,
          box_number: c.box_number,
          ratio,
          mxn: +(m.pobox_service_cost * ratio).toFixed(2),
          usd: +(m.pobox_cost_usd * ratio).toFixed(4),
          venta_usd: +(m.pobox_venta_usd * ratio).toFixed(4),
          current_mxn: c.current_mxn,
          current_usd: c.current_usd
        };
      });

      console.log(`\n📦 Master #${m.id} ${m.tracking_internal} (${m.total_boxes} cajas)`);
      console.log(`   Total a repartir: $${m.pobox_service_cost.toFixed(2)} MXN  /  $${m.pobox_cost_usd.toFixed(2)} USD  ${useEqual ? '⚖️  (sin dims, partes iguales)' : '📐 (por volumen)'}`);
      distribuciones.forEach(d => {
        const cambio = d.current_mxn === 0 ? '✨ NUEVO' : `(antes $${d.current_mxn.toFixed(2)})`;
        console.log(`   └─ #${d.id} ${d.tracking}  →  $${d.mxn.toFixed(2)} MXN  /  $${d.usd.toFixed(2)} USD   ${cambio}`);
      });

      if (!APPLY) {
        masters++;
        children += distribuciones.length;
        continue;
      }

      // 4) Aplicar transacción
      try {
        await client.query('BEGIN');

        // 4a) Actualizar cada hija
        for (const d of distribuciones) {
          await client.query(`
            UPDATE packages SET
              pobox_service_cost      = $1,
              pobox_cost_usd          = $2,
              pobox_venta_usd         = $3,
              pobox_tarifa_nivel      = COALESCE(pobox_tarifa_nivel, $4),
              registered_exchange_rate = COALESCE(NULLIF(registered_exchange_rate, 0), $5)
            WHERE id = $6
          `, [d.mxn, d.usd, d.venta_usd, m.pobox_tarifa_nivel, m.registered_exchange_rate, d.id]);
        }

        // 4b) Poner master en 0 (sin perder TC ni nivel para histórico)
        await client.query(`
          UPDATE packages SET
            pobox_service_cost = 0,
            pobox_cost_usd     = 0,
            pobox_venta_usd    = 0
          WHERE id = $1
        `, [m.id]);

        await client.query('COMMIT');
        masters++;
        children += distribuciones.length;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`   ❌ ERROR en master #${m.id}:`, err.message);
        errors++;
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 RESUMEN  ${APPLY ? '(APLICADO)' : '(DRY-RUN, no se modificó nada)'}`);
    console.log(`   Masters procesados: ${masters}`);
    console.log(`   Hijas actualizadas: ${children}`);
    console.log(`   Salteados:          ${skipped}`);
    console.log(`   Errores:            ${errors}`);
    console.log(`${'='.repeat(60)}\n`);

    if (!APPLY) {
      console.log('💡 Para aplicar los cambios:  node backfill_multipiece_costs.js --apply\n');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});
