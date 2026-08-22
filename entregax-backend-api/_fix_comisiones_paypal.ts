/**
 * Comisiones de asesor que nunca se generaron en pagos por PayPal.
 *
 * El webhook de PayPal marcaba los paquetes como pagados pero no llamaba a
 * generateCommissionsForPackages; todas las demás vías sí lo hacen. Corregido
 * hacia adelante en el commit 75164b5. Esto genera las que quedaron pendientes.
 *
 * Lo detectó el asesor Jesús Campos en TKT-2026-2273 (tarea 316) con la guía
 * US-0185033447, orden PP-5652F622.
 *
 * En --apply NO se replica la lógica: se llama al MISMO generador que usa el
 * sistema (generateCommissionForShipment), así el monto, la tarifa y el reparto
 * con el líder salen del código real y no de una copia que pueda divergir.
 * Es idempotente: el INSERT usa ON CONFLICT DO NOTHING.
 *
 * El dry-run sí simula, para poder ver los montos antes de escribir.
 *
 * Dry-run por defecto. --apply para escribir.
 */
require('dotenv').config();
import { Pool } from 'pg';
import { generateCommissionForShipment } from './src/commissionService';

const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Mismo mapeo que commissionService.SERVICE_TYPE_MAP (solo para el dry-run).
const MAP: Record<string, string> = {
  POBOX_USA: 'pobox_usa_mx', usa: 'pobox_usa_mx', pobox: 'pobox_usa_mx',
  AIR_CHN_MX: 'aereo_china_mx', air_china: 'aereo_china_mx',
  SEA_CHN_MX: 'maritimo_china_mx', sea_china: 'maritimo_china_mx',
  AA_DHL: 'liberacion_aa_dhl', dhl: 'liberacion_aa_dhl',
  TDI_EXPRESS: 'tdi_express', tdi_express: 'tdi_express', tdi: 'tdi_express',
  NACIONAL: 'nacional_mx', nacional: 'nacional_mx',
};

(async () => {
  const { rows } = await pool.query(`
    WITH pagos AS (
      SELECT o.payment_reference, o.created_at,
             jsonb_array_elements_text(o.package_ids)::int AS pkg_id
        FROM pobox_payments o
       WHERE o.status IN ('completed', 'paid') AND o.payment_method = 'paypal'
    )
    SELECT DISTINCT pagos.pkg_id, pagos.payment_reference, pagos.created_at::date AS dia,
           pk.tracking_internal, pk.service_type,
           COALESCE(NULLIF(pk.assigned_cost_mxn, 0), pk.pobox_service_cost, pk.monto_pagado, 0)::numeric AS base,
           u.box_id, a.id AS advisor_id, a.full_name AS asesor,
           l.id AS leader_id, l.full_name AS lider
      FROM pagos
      JOIN packages pk ON pk.id = pagos.pkg_id
      JOIN users u ON u.id = pk.user_id
      LEFT JOIN users a ON a.id = COALESCE(u.advisor_id, u.referred_by_id)
      LEFT JOIN users l ON l.id = a.referred_by_id AND l.role IN ('advisor', 'asesor_lider')
      LEFT JOIN advisor_commissions c ON c.shipment_type = 'PKG' AND c.shipment_id = pagos.pkg_id
     WHERE c.id IS NULL
       AND (pk.payment_status = 'paid' OR pk.client_paid = true)
     ORDER BY dia DESC, pk.tracking_internal
  `);

  console.log(`guías pagadas por PayPal sin comisión: ${rows.length}\n`);
  let total = 0, generadas = 0, saltadas = 0;

  for (const r of rows) {
    const base = Number(r.base);
    const motivo = !r.advisor_id ? 'el cliente no tiene asesor'
      : base <= 0 ? 'la guía no tiene costo asignado'
      : null;
    if (motivo) {
      saltadas++;
      console.log(`  ${String(r.tracking_internal).padEnd(22)} ${String(r.box_id).padEnd(7)} — se salta: ${motivo}`);
      continue;
    }

    const clave = /^TDX-/i.test(String(r.tracking_internal || '').trim())
      ? 'tdi_express'
      : (MAP[String(r.service_type || '')] || 'pobox_usa_mx');
    const tarifa = await pool.query(
      `SELECT percentage FROM commission_rates WHERE service_type = $1`, [clave]
    );
    if (tarifa.rows.length === 0) {
      saltadas++;
      console.log(`  ${String(r.tracking_internal).padEnd(22)} ${String(r.box_id).padEnd(7)} — se salta: no hay tarifa para "${clave}"`);
      continue;
    }

    const pct = Number(tarifa.rows[0].percentage) || 0;
    const comision = base * pct / 100;
    const paraAsesor = r.leader_id ? comision * 0.5 : comision;
    total += comision;
    generadas++;
    console.log(
      `  ${String(r.tracking_internal).padEnd(22)} ${String(r.box_id).padEnd(7)} ` +
      `${String(r.asesor).slice(0, 20).padEnd(20)} base $${base.toFixed(2).padStart(10)} ` +
      `· ${pct}% = $${comision.toFixed(2)}` +
      (r.leader_id ? `  (asesor $${paraAsesor.toFixed(2)} · líder ${r.lider} $${paraAsesor.toFixed(2)})` : '')
    );

    if (APPLY) {
      // Se usa el generador REAL para que el monto salga del código de producción.
      const ok = await generateCommissionForShipment('PKG', r.pkg_id);
      if (!ok) console.warn(`     ⚠️ el generador no reconoció PKG-${r.pkg_id}`);
    }
  }

  console.log(`\ncomisiones a generar: ${generadas} · monto total $${total.toFixed(2)}`);
  console.log(`saltadas: ${saltadas}`);

  if (APPLY) {
    const ver = await pool.query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(commission_amount_mxn), 0)::numeric AS monto
         FROM advisor_commissions
        WHERE shipment_type = 'PKG' AND shipment_id = ANY($1::int[])`,
      [rows.map((r: any) => r.pkg_id)]
    );
    console.log(`\nAPLICADO. Comisiones existentes para esas guías: ${ver.rows[0].n} por $${Number(ver.rows[0].monto).toFixed(2)}`);
  } else {
    console.log('\nDRY-RUN (sin cambios). Usa --apply para escribir.');
  }
  await pool.end();
})();
