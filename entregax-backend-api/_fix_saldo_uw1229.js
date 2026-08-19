// Aplica el saldo a favor que el cliente creía haber usado en UW-1229F712.
// El saldo se aplicó y se revirtió 8 minutos después (flujo de "ajustar monto a
// pagar por pasarela" que se rompió a media secuencia), pero el cliente ya había
// pagado $3,113 — el monto que quedaba CON el saldo aplicado. La orden se marcó
// pagada aunque faltaban $1,153.75.
//   node _fix_saldo_uw1229.js [--apply]
const { Pool } = require('pg');
require('dotenv').config();
const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const o = (await c.query(
      `SELECT pp.id, pp.user_id, pp.amount, pp.voucher_total, pp.wallet_applied, pp.payment_reference,
              u.wallet_balance, u.box_id, u.full_name
         FROM pobox_payments pp JOIN users u ON u.id=pp.user_id
        WHERE pp.payment_reference='UW-1229F712' FOR UPDATE`)).rows[0];
    const falta = +(Number(o.amount) - Number(o.voucher_total)).toFixed(2);
    const saldo = Number(o.wallet_balance);
    const aplicar = Math.min(saldo, falta);
    console.log(`cliente        : ${o.box_id} ${o.full_name}`);
    console.log(`orden          : $${o.amount}`);
    console.log(`ya pagado      : $${o.voucher_total}`);
    console.log(`falta          : $${falta.toFixed(2)}`);
    console.log(`saldo dispon.  : $${saldo.toFixed(2)}`);
    console.log(`se aplicará    : $${aplicar.toFixed(2)}   → saldo final $${(saldo-aplicar).toFixed(2)}`);

    const nuevoSaldo = +(saldo - aplicar).toFixed(2);
    await c.query(`UPDATE users SET wallet_balance = $1 WHERE id = $2`, [nuevoSaldo, o.user_id]);
    await c.query(
      `UPDATE pobox_payments SET wallet_applied = COALESCE(wallet_applied,0) + $1,
              wallet_applied_at = CURRENT_TIMESTAMP WHERE id = $2`, [aplicar, o.id]);
    await c.query(
      `INSERT INTO financial_transactions
         (user_id, type, amount, balance_after, description, reference_id, reference_type, created_at)
       VALUES ($1,'payment_wallet',$2,$3,$4,$5,'pobox_payment',NOW())`,
      [o.user_id, -aplicar, nuevoSaldo,
       `Saldo a favor aplicado a orden ${o.payment_reference} (regularización: la reversa dejó la orden pagada de menos)`, o.id]);

    const v = (await c.query(`SELECT wallet_applied, voucher_total, amount FROM pobox_payments WHERE id=$1`,[o.id])).rows[0];
    const u = (await c.query(`SELECT wallet_balance FROM users WHERE id=$1`,[o.user_id])).rows[0];
    console.log(`\n=== DESPUÉS ===`);
    console.log(`  cubierto: $${v.voucher_total} + $${v.wallet_applied} = $${(Number(v.voucher_total)+Number(v.wallet_applied)).toFixed(2)} vs orden $${v.amount}`);
    console.log(`  saldo del cliente: $${u.wallet_balance}`);
    if (APPLY) { await c.query('COMMIT'); console.log('\n✅ APLICADO'); }
    else { await c.query('ROLLBACK'); console.log('\n🔎 DRY-RUN'); }
  } catch(e){ await c.query('ROLLBACK').catch(()=>{}); console.error('ERROR:',e.message); process.exit(1); }
  finally { c.release(); await pool.end(); }
})();
