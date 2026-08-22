/**
 * Comisiones DHL que nunca se generaron por la colisión de ids.
 *
 * pobox_payments.package_ids guarda ids crudos de packages, dhl_shipments y
 * maritime_orders, y colisionan. El generador probaba PKG primero: si ese id
 * existía como paquete pagado —normalmente de OTRO cliente— lo daba por válido
 * y nunca miraba dhl_shipments. El asesor de la caja DHL se quedaba sin nada.
 *
 * Lo reportó Jesús Campos en TKT-2026-2271 (tarea 312) con la caja 501.
 * Causa corregida en a18e574 con opts.expectedUserId.
 *
 * Se llama al generador REAL (generateCommissionForShipment) con el tipo DHL
 * explícito y el dueño de la caja, para que el monto y la tarifa salgan del
 * código de producción. Idempotente: ON CONFLICT DO NOTHING.
 *
 * Dry-run por defecto. --apply para escribir.
 */
require('dotenv').config();
import { Pool } from 'pg';
import { generateCommissionForShipment } from './src/commissionService';

const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  // Universo: cajas DHL PAGADAS, referenciadas por una orden pagada, sin comisión.
  const { rows } = await pool.query(`
    WITH pagos AS (
      SELECT DISTINCT jsonb_array_elements_text(o.package_ids)::int AS ref_id
        FROM pobox_payments o WHERE o.status IN ('completed', 'paid')
    )
    SELECT ds.id, ds.inbound_tracking, ds.secondary_tracking, ds.user_id,
           ds.monto_pagado::numeric AS pagado,
           u.box_id, a.full_name AS asesor,
           EXISTS (SELECT 1 FROM packages pk WHERE pk.id = ds.id) AS choca_con_package
      FROM pagos
      JOIN dhl_shipments ds ON ds.id = pagos.ref_id
      JOIN users u ON u.id = ds.user_id
      LEFT JOIN users a ON a.id = COALESCE(u.advisor_id, u.referred_by_id)
      LEFT JOIN advisor_commissions c ON c.shipment_type = 'DHL' AND c.shipment_id = ds.id
     WHERE c.id IS NULL
       AND COALESCE(ds.monto_pagado, 0) > 0
       AND COALESCE(ds.saldo_pendiente, 0) <= 0.01
       AND a.id IS NOT NULL
     ORDER BY a.full_name, ds.id
  `);

  const conChoque = rows.filter((r: any) => r.choca_con_package);
  const sinChoque = rows.filter((r: any) => !r.choca_con_package);

  console.log(`cajas DHL pagadas sin comisión: ${rows.length}`);
  console.log(`  · por colisión de id (causa diagnosticada): ${conChoque.length}`);
  console.log(`  · sin colisión (otra causa, NO se tocan): ${sinChoque.length}\n`);

  const tarifa = await pool.query(
    `SELECT percentage FROM commission_rates WHERE service_type = 'liberacion_aa_dhl'`
  );
  const pct = Number(tarifa.rows[0]?.percentage) || 0;
  console.log(`tarifa liberacion_aa_dhl: ${pct}%\n`);

  const porAsesor: Record<string, { n: number; monto: number }> = {};
  let total = 0;

  for (const r of conChoque) {
    const base = Number(r.pagado);
    const comision = base * pct / 100;
    total += comision;
    porAsesor[r.asesor] = porAsesor[r.asesor] || { n: 0, monto: 0 };
    porAsesor[r.asesor]!.n++;
    porAsesor[r.asesor]!.monto += comision;

    if (APPLY) {
      // Tipo DHL explícito + dueño de la caja: no se le deja adivinar la tabla.
      const ok = await generateCommissionForShipment('DHL', r.id, undefined, {
        expectedUserId: r.user_id,
      });
      if (!ok) console.warn(`  ⚠️ el generador no reconoció DHL-${r.id} (${r.inbound_tracking})`);
    }
  }

  console.log('=== por asesor ===');
  for (const [quien, v] of Object.entries(porAsesor).sort((a, b) => b[1].monto - a[1].monto)) {
    console.log(`  ${quien.padEnd(24)} ${String(v.n).padStart(2)} cajas   $${v.monto.toFixed(2).padStart(10)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(24)} ${String(conChoque.length).padStart(2)} cajas   $${total.toFixed(2).padStart(10)}`);

  if (sinChoque.length > 0) {
    console.log('\n=== NO se tocan (sin colisión, causa no diagnosticada) ===');
    for (const r of sinChoque.slice(0, 10)) {
      console.log(`  DHL-${String(r.id).padEnd(5)} ${r.inbound_tracking} · ${r.box_id} · ${r.asesor} · $${Number(r.pagado).toFixed(2)}`);
    }
    if (sinChoque.length > 10) console.log(`  … y ${sinChoque.length - 10} más`);
  }

  if (APPLY) {
    const ver = await pool.query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(commission_amount_mxn), 0)::numeric AS al_asesor,
              COALESCE(SUM(leader_override_amount), 0)::numeric AS al_lider
         FROM advisor_commissions
        WHERE shipment_type = 'DHL' AND shipment_id = ANY($1::int[])`,
      [conChoque.map((r: any) => r.id)]
    );
    console.log(`\nAPLICADO. Comisiones existentes para esas cajas: ${ver.rows[0].n}`);
    console.log(`  al asesor $${Number(ver.rows[0].al_asesor).toFixed(2)} · al líder $${Number(ver.rows[0].al_lider).toFixed(2)}`);
  } else {
    console.log('\nDRY-RUN (sin cambios). Usa --apply para escribir.');
  }
  await pool.end();
})();
