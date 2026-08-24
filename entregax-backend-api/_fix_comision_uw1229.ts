/**
 * Caja DHL 514 (guía 4064839542, S2638) pagada pero nunca marcada — TKT-2026-2287.
 *
 * La orden UW-1229F712 quedó cubierta al centavo:
 *   $3,113.00 de transferencia + $1,153.75 de saldo a favor = $4,266.75
 *
 * El saldo a favor lo aplicó a mano el script _fix_saldo_uw1229.js (commit
 * 9405186), que regularizó el dinero pero NO hizo las dos cosas que sí hace el
 * flujo normal de pago:
 *   · markDhlGroupPaid → la caja se quedó con paid_at NULL y monto_pagado 0
 *   · generar la comisión del asesor
 *
 * Por eso Mario Alberto Campos Salas (asesor de S2638) no ve la comisión y la
 * guía sigue apareciendo sin pagar.
 *
 * Barrido de todas las órdenes pagadas del sistema: este es el ÚNICO caso.
 * No hay bug vivo en el flujo normal; es residuo de aquella corrección manual.
 *
 * Se usan las funciones REALES de producción (markDhlGroupPaid y
 * generateCommissionForShipment) para que el monto, la tarifa y el reparto con
 * el líder salgan del mismo código que cualquier pago normal.
 *
 * Dry-run por defecto. --apply para escribir.
 */
require('dotenv').config();
import { Pool } from 'pg';
import { markDhlGroupPaid } from './src/dhlGroup';
import { generateCommissionForShipment } from './src/commissionService';

const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const CAJA = 514;
const ORDEN = 'UW-1229F712';

(async () => {
  try {
    // ── Guardas: la orden tiene que estar realmente cubierta
    const o = (await pool.query(
      `SELECT id, user_id, amount::numeric AS amount, status, package_ids,
              COALESCE(voucher_total, 0)::numeric AS vt,
              COALESCE(wallet_applied, 0)::numeric AS wa,
              COALESCE(credit_applied, 0)::numeric AS ca
         FROM pobox_payments WHERE payment_reference = $1`,
      [ORDEN]
    )).rows[0];
    if (!o) throw new Error(`no existe la orden ${ORDEN}`);
    const cubierto = Number(o.vt) + Number(o.wa) + Number(o.ca);
    console.log(`orden ${ORDEN} · $${Number(o.amount).toFixed(2)} · ${o.status}`);
    console.log(`  transferencia $${Number(o.vt).toFixed(2)} + saldo a favor $${Number(o.wa).toFixed(2)} + crédito $${Number(o.ca).toFixed(2)} = $${cubierto.toFixed(2)}`);
    if (Math.abs(cubierto - Number(o.amount)) > 0.01) {
      throw new Error(`la orden NO está cubierta: faltan $${(Number(o.amount) - cubierto).toFixed(2)}`);
    }
    if (!(o.package_ids || []).map(Number).includes(CAJA)) {
      throw new Error(`la orden no referencia la caja ${CAJA}`);
    }

    const c = (await pool.query(
      `SELECT d.id, d.inbound_tracking, d.secondary_tracking, d.user_id,
              d.total_cost_mxn::numeric AS total, d.monto_pagado::numeric AS pagado,
              d.paid_at, d.status, u.box_id, u.full_name,
              a.id AS asesor_id, a.full_name AS asesor
         FROM dhl_shipments d
         JOIN users u ON u.id = d.user_id
         LEFT JOIN users a ON a.id = COALESCE(u.advisor_id, u.referred_by_id)
        WHERE d.id = $1`, [CAJA]
    )).rows[0];
    if (!c) throw new Error(`no existe la caja ${CAJA}`);
    if (Number(c.user_id) !== Number(o.user_id)) throw new Error('la caja no es del cliente de la orden');
    if (c.paid_at) throw new Error('la caja YA está marcada como pagada; nada que hacer');
    if (!c.asesor_id) throw new Error('el cliente no tiene asesor: no habría comisión');

    console.log(`\ncaja ${c.id} · ${c.inbound_tracking} · guía ${c.secondary_tracking}`);
    console.log(`  cliente ${c.box_id} ${c.full_name} · asesor ${c.asesor}`);
    console.log(`  costo $${Number(c.total).toFixed(2)} · pagado $${Number(c.pagado).toFixed(2)} · paid_at ${c.paid_at || 'NULL'} · ${c.status}`);

    const yaTiene = (await pool.query(
      `SELECT COUNT(*)::int AS n FROM advisor_commissions WHERE shipment_type='DHL' AND shipment_id=$1`, [CAJA]
    )).rows[0].n;
    if (yaTiene > 0) throw new Error('la caja ya tiene comisión');

    const tarifa = (await pool.query(
      `SELECT percentage FROM commission_rates WHERE service_type='liberacion_aa_dhl'`
    )).rows[0];
    const pct = Number(tarifa?.percentage) || 0;
    console.log(`\ntarifa liberacion_aa_dhl: ${pct}% → comisión bruta estimada $${(Number(c.total) * pct / 100).toFixed(2)}`);
    console.log(`  (el reparto con el líder lo decide el generador de producción)`);

    if (!APPLY) {
      console.log('\nDRY-RUN (sin cambios). Usa --apply para escribir.');
      await pool.end();
      return;
    }

    // ── Marcar la caja pagada con el helper de producción (expande el grupo)
    const marcadas = await markDhlGroupPaid(pool, [CAJA], { onlyUnpaid: true });
    console.log(`\ncajas marcadas como pagadas: ${marcadas.join(', ')}`);

    // ── Comisión con el generador REAL, tipo y dueño explícitos
    const ok = await generateCommissionForShipment('DHL', CAJA, undefined, {
      expectedUserId: Number(c.user_id),
    });
    if (!ok) console.warn(`  ⚠️ el generador no reconoció DHL-${CAJA}`);

    const ver = await pool.query(
      `SELECT ac.id, ac.advisor_id, a.full_name AS asesor,
              ac.commission_amount_mxn::numeric AS al_asesor,
              COALESCE(ac.leader_override_amount, 0)::numeric AS al_lider
         FROM advisor_commissions ac
         LEFT JOIN users a ON a.id = ac.advisor_id
        WHERE ac.shipment_type='DHL' AND ac.shipment_id=$1`, [CAJA]
    );
    console.log(`\ncomisiones creadas: ${ver.rows.length}`);
    for (const r of ver.rows) {
      console.log(`  ${r.asesor}: $${Number(r.al_asesor).toFixed(2)} · al líder $${Number(r.al_lider).toFixed(2)}`);
    }
    const est = (await pool.query(
      `SELECT paid_at, monto_pagado::numeric AS pagado, saldo_pendiente::numeric AS saldo
         FROM dhl_shipments WHERE id=$1`, [CAJA]
    )).rows[0];
    console.log(`caja ${CAJA}: pagada ${est.paid_at?.toISOString?.() || est.paid_at} · monto_pagado $${Number(est.pagado).toFixed(2)} · saldo $${Number(est.saldo).toFixed(2)}`);
    console.log('\nAPLICADO.');
  } catch (e: any) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
})();
