// Revierte el saldo a favor acreditado sobre comprobantes DUPLICADOS: el mismo
// pago subido dos veces (cliente + asesor, o el cliente dos veces). Verificado
// contra los recibos: mismo folio de operación / movimiento bancario, así que
// entró UNA transferencia, no dos.
//
// Deja el comprobante repetido en 'rejected' para que no vuelva a sumar, quita
// el saldo de la billetera, registra el egreso y limpia el excedente de la orden.
//   node _fix_revertir_saldo_falso.js            (dry-run)
//   node _fix_revertir_saldo_falso.js --apply
const { Pool } = require('pg');
require('dotenv').config();
const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
// [orden_ref, voucher duplicado a rechazar, evidencia verificada]
const CASOS = [
  ['UW-96135E3F', 364, 'BBVA depósito mov. 000021464 17-08 14:18:41 — mismo ticket'],
  ['RO-65986488', 128, 'archivo binariamente idéntico (mismo SHA-256)'],
  ['RO-329459B5', 301, 'BBVA folio de operación 0011884477 07-08 10:56 — misma transferencia'],
];
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const hechos = [];
    for (const [ref, dupVoucherId, evidencia] of CASOS) {
      const o = (await c.query(
        `SELECT pp.id, pp.user_id, pp.amount, pp.surplus_amount, pp.currency, pp.service_type,
                u.box_id, u.full_name
           FROM pobox_payments pp JOIN users u ON u.id=pp.user_id
          WHERE pp.payment_reference=$1`, [ref])).rows[0];
      const surplus = Number(o.surplus_amount) || 0;
      const svc = o.service_type || 'POBOX_USA';

      // 1) el comprobante repetido queda rechazado
      await c.query(
        `UPDATE payment_vouchers
            SET status='rejected', rejection_reason=$2, reviewed_at=NOW(), updated_at=NOW()
          WHERE id=$1`,
        [dupVoucherId, `Comprobante duplicado: ${evidencia}. No corresponde a un segundo pago.`]
      );
      // 2) quitar el saldo falso
      await c.query(
        `UPDATE billetera_servicio SET saldo = GREATEST(0, saldo - $1::numeric), updated_at=NOW()
          WHERE user_id=$2 AND service_type=$3`, [surplus, o.user_id, svc]);
      // 3) dejar registrado el egreso
      const w = (await c.query(`SELECT id FROM billetera_servicio WHERE user_id=$1 AND service_type=$2`,
        [o.user_id, svc])).rows[0];
      if (w) await c.query(
        `INSERT INTO billetera_servicio_transacciones
           (billetera_servicio_id, user_id, service_type, tipo, monto, currency, concepto, payment_order_id)
         VALUES ($1,$2,$3,'egreso',$4,$5,$6,$7)`,
        [w.id, o.user_id, svc, surplus, o.currency || 'MXN',
         `Reversión de saldo por comprobante duplicado en orden ${ref}`, o.id]);
      // 4) la orden deja de tener excedente
      await c.query(
        `UPDATE pobox_payments SET surplus_amount=0, surplus_credited=FALSE,
                voucher_total = GREATEST(0, COALESCE(voucher_total,0) - $2::numeric)
          WHERE id=$1`, [o.id, surplus]);

      const saldoFinal = (await c.query(`SELECT saldo FROM billetera_servicio WHERE user_id=$1 AND service_type=$2`,
        [o.user_id, svc])).rows[0]?.saldo;
      hechos.push({ ref, cliente: `${o.box_id} ${(o.full_name||'').slice(0,18)}`,
        saldo_revertido: surplus.toFixed(2), saldo_final: saldoFinal, voucher_rechazado: dupVoucherId });
    }
    console.log('=== SALDOS FALSOS REVERTIDOS ==='); console.table(hechos);
    console.log('Total revertido: $' + hechos.reduce((s,x)=>s+Number(x.saldo_revertido),0).toFixed(2));
    const tot = await c.query(`SELECT COALESCE(SUM(saldo),0)::numeric t FROM billetera_servicio`);
    console.log('Suma de todas las billeteras tras la reversión: $' + tot.rows[0].t);
    if (APPLY) { await c.query('COMMIT'); console.log('\n✅ APLICADO'); }
    else { await c.query('ROLLBACK'); console.log('\n🔎 DRY-RUN'); }
  } catch(e){ await c.query('ROLLBACK').catch(()=>{}); console.error('ERROR:', e.message); process.exit(1); }
  finally { c.release(); await pool.end(); }
})();
