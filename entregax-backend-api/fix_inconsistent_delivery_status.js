// Detecta y corrige paquetes con estado inconsistente:
// warehouse_location='usa_pobox' pero delivery_status='out_for_delivery'.
// Esto ocurre cuando un chofer de MTY carga por error una guía que aún
// está físicamente en Hidalgo TX.
//
// Uso:
//   node fix_inconsistent_delivery_status.js --dry
//   node fix_inconsistent_delivery_status.js
//   node fix_inconsistent_delivery_status.js --tracking US-6104458354

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const trackingIdx = args.indexOf('--tracking');
const trackingFilter = trackingIdx >= 0 ? args[trackingIdx + 1] : null;

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Detectar candidatos: paquetes físicamente en origen (usa_pobox, china_air,
    // china_sea) pero marcados como cargados/out_for_delivery, que es imposible.
    const params = [];
    let extraWhere = '';
    if (trackingFilter) {
      params.push(trackingFilter);
      extraWhere = ` AND p.tracking_internal = $${params.length}`;
    }

    const q = `
      SELECT p.id, p.tracking_internal, p.status::text AS status,
             p.warehouse_location, p.delivery_status::text AS delivery_status,
             p.assigned_driver_id, p.service_type, p.current_branch_id,
             p.updated_at
        FROM packages p
       WHERE p.delivery_status::text = 'out_for_delivery'
         AND (
              -- Físicamente aún en origen USA
              p.warehouse_location IN ('usa_pobox', 'hidalgo_tx')
              -- O físicamente aún en China
           OR p.warehouse_location IN ('china_air', 'china_sea', 'china')
              -- O status es 'received' (recibido en origen), lo que contradice
              -- que esté 'cargado en unidad de reparto' en MX
           OR (p.status::text = 'received' AND p.warehouse_location IS NOT NULL
                AND p.warehouse_location NOT LIKE 'cedis%'
                AND p.warehouse_location NOT LIKE 'mty%'
                AND p.warehouse_location NOT LIKE 'monterrey%')
         )
         ${extraWhere}
       ORDER BY p.id
       LIMIT 500
    `;
    const r = await client.query(q, params);
    console.log(`Paquetes inconsistentes: ${r.rows.length}`);
    for (const p of r.rows) {
      console.log(
        `  - #${p.id} ${p.tracking_internal} · status=${p.status} · wh=${p.warehouse_location} · ds=${p.delivery_status} · driver=${p.assigned_driver_id || '—'}`
      );
    }

    if (r.rows.length === 0) {
      console.log('Nada que corregir.');
      await client.query('COMMIT');
      return;
    }

    if (dryRun) {
      console.log('(dry-run) No se aplicaron cambios.');
      await client.query('ROLLBACK');
      return;
    }

    const ids = r.rows.map(x => x.id);
    // Reset: quitar el falso "out_for_delivery" y desasignar chofer.
    // No tocamos status ni warehouse_location porque ésos sí reflejan la
    // ubicación física real (que se dedujo del error inicial).
    await client.query(
      `UPDATE packages
          SET delivery_status = NULL,
              assigned_driver_id = NULL,
              updated_at = NOW()
        WHERE id = ANY($1::int[])`,
      [ids]
    );

    // Log a package_history por transparencia (para que aparezca en tracking).
    await client.query(
      `INSERT INTO package_history (package_id, status, notes, created_by, created_at)
       SELECT id,
              'received'::text,
              'Corrección automática: se removió estado de "cargado en unidad" porque el paquete aún está en origen (Hidalgo TX / China).',
              NULL,
              NOW()
         FROM packages
        WHERE id = ANY($1::int[])`,
      [ids]
    ).catch(e => console.warn('No se pudo registrar package_history:', e.message));

    await client.query('COMMIT');
    console.log(`✅ Corregidos ${ids.length} paquetes.`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
