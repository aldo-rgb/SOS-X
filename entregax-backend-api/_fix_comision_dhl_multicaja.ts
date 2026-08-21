/**
 * Comisión de asesor pagada por UNA sola caja de un envío DHL multicaja.
 *
 * Reportado en TKT-2026-2271 (Jesús Campos, orden UW-6371B9DE): el cliente pagó
 * $12,918.60 por 3 cajas (DHL-517/529/548, guía madre 8350500432) y solo se le
 * comisionó la caja 517.
 *
 * Causa: un envío multicaja vive como VARIAS filas en dhl_shipments que comparten
 * secondary_tracking, y la orden de pago referencia UNA sola. Las rutas de pago ya
 * expandían el grupo para marcarlo pagado (dhlGroup.markDhlGroupPaid), pero
 * generateCommissionsForPackages recibía los ids SIN expandir, así que solo nacía
 * la comisión de la caja referenciada. El bug de origen ya está corregido en
 * commissionService (la generación expande el grupo).
 *
 * Este script repara lo ya ocurrido: genera las comisiones faltantes de las cajas
 * hermanas PAGADAS. Usa la misma función del servicio, así que respeta tarifa,
 * split con líder y el ON CONFLICT que evita duplicados. Nacen en 'pending': se
 * acreditan, no se reembolsa nada.
 *
 * Dry-run por defecto. --apply para escribir.
 *
 *   npx ts-node _fix_comision_dhl_multicaja.ts
 *   npx ts-node _fix_comision_dhl_multicaja.ts --apply
 */
import { pool } from './src/db';
import { generateCommissionForShipment } from './src/commissionService';

const APPLY = process.argv.includes('--apply');

// Cajas DHL pagadas, de cliente con asesor, SIN fila de comisión, que pertenecen a
// un envío donde alguna hermana SÍ la tiene (= el pago cubrió el envío completo).
const FALTANTES = `
  SELECT s.id, s.user_id, u.full_name AS cliente,
         COALESCE(u.advisor_id, u.referred_by_id) AS asesor_id,
         a.full_name AS asesor, s.secondary_tracking, s.inbound_tracking,
         s.monto_pagado, s.paid_at
    FROM dhl_shipments s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users a ON a.id = COALESCE(u.advisor_id, u.referred_by_id)
   WHERE COALESCE(s.secondary_tracking, '') <> ''
     AND COALESCE(s.saldo_pendiente, 0) <= 0.01
     AND COALESCE(s.monto_pagado, 0) > 0
     AND COALESCE(u.advisor_id, u.referred_by_id) IS NOT NULL
     AND NOT EXISTS (
          SELECT 1 FROM advisor_commissions ac
           WHERE ac.shipment_type = 'DHL' AND ac.shipment_id = s.id)
     AND EXISTS (
          SELECT 1 FROM dhl_shipments h
            JOIN advisor_commissions ac2 ON ac2.shipment_type = 'DHL' AND ac2.shipment_id = h.id
           WHERE h.secondary_tracking = s.secondary_tracking
             AND h.user_id IS NOT DISTINCT FROM s.user_id
             AND h.id <> s.id)
   ORDER BY a.full_name, s.secondary_tracking, s.id`;

(async () => {
  const { rows } = await pool.query(FALTANTES);
  if (rows.length === 0) {
    console.log('No hay comisiones multicaja pendientes de generar.');
    await pool.end();
    return;
  }

  console.log(`${APPLY ? 'APLICANDO' : 'DRY-RUN'} — ${rows.length} caja(s) sin comisión:\n`);
  for (const r of rows) {
    console.log(
      `  DHL-${r.id}  ${r.asesor} · ${r.cliente} · madre ${r.secondary_tracking} · ` +
      `${r.inbound_tracking} · base $${Number(r.monto_pagado).toFixed(2)}`
    );
  }
  const base = rows.reduce((s: number, r: any) => s + Number(r.monto_pagado), 0);
  console.log(`\n  Base total: $${base.toFixed(2)} MXN (comisión al 10% ≈ $${(base * 0.1).toFixed(2)})`);

  if (!APPLY) {
    console.log('\nDry-run: no se escribió nada. Corre con --apply para generarlas.');
    await pool.end();
    return;
  }

  let creadas = 0;
  for (const r of rows) {
    const ok = await generateCommissionForShipment('DHL', r.id);
    if (!ok) { console.warn(`  ⚠️  DHL-${r.id}: el servicio no la generó (revisar a mano)`); continue; }
    const chk = await pool.query(
      `SELECT commission_amount_mxn FROM advisor_commissions WHERE shipment_type='DHL' AND shipment_id=$1`,
      [r.id]
    );
    if (chk.rowCount) { creadas++; console.log(`  ✅ DHL-${r.id}: $${chk.rows[0].commission_amount_mxn}`); }
    else console.warn(`  ⚠️  DHL-${r.id}: sin fila tras generar (revisar a mano)`);
  }
  console.log(`\nListo: ${creadas}/${rows.length} comisiones generadas.`);
  await pool.end();
})().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
