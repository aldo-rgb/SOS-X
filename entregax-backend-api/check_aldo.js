const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false });
(async () => {
  const ref = 'GL-664470B9';
  console.log('=== POBOX_PAYMENTS ===');
  const r = await pool.query("SELECT * FROM pobox_payments WHERE payment_reference = $1", [ref]);
  console.log(JSON.stringify(r.rows, null, 2));
  
  console.log('\n=== OPENPAY_WEBHOOK_LOGS ===');
  const w = await pool.query("SELECT * FROM openpay_webhook_logs WHERE transaction_id = $1 OR transaction_id LIKE $2 ORDER BY fecha_pago DESC", [ref, `%${ref}%`]);
  console.log(JSON.stringify(w.rows, null, 2));
  
  console.log('\n=== FINANCIAL_TRANSACTIONS ===');
  const ft = await pool.query("SELECT * FROM financial_transactions WHERE reference_id = $1 OR description ILIKE $2 ORDER BY created_at DESC LIMIT 10", [ref, `%${ref}%`]);
  console.log(JSON.stringify(ft.rows, null, 2));

  console.log('\n=== MOVIMIENTOS_FINANCIEROS ===');
  const mf = await pool.query("SELECT id, tipo_movimiento, monto, nota_descriptiva, referencia, openpay_transaction_id, created_at FROM movimientos_financieros WHERE referencia = $1", [ref]);
  console.log(JSON.stringify(mf.rows, null, 2));
  
  console.log('\n=== USERS (aldo) ===');
  const u = await pool.query("SELECT id, email, full_name, wallet_balance, credit_limit, used_credit FROM users WHERE phone = '8119411324' OR email ILIKE '%aldo%' LIMIT 5");
  console.log(JSON.stringify(u.rows, null, 2));
  
  if (u.rows[0]) {
    const uid = u.rows[0].id;
    console.log(`\n=== USER_SERVICE_CREDITS user=${uid} ===`);
    try {
      const sc = await pool.query("SELECT * FROM user_service_credits WHERE user_id = $1", [uid]);
      console.log(JSON.stringify(sc.rows, null, 2));
    } catch(e) { console.error(e.message); }
  }
  
  // Paquetes asociados
  console.log('\n=== PACKAGES asociados ===');
  const pkgs = await pool.query("SELECT id, payment_reference, payment_status, costing_paid, client_paid, costing_paid_at, monto_pagado, saldo_pendiente, assigned_cost_mxn FROM packages WHERE payment_reference = $1", [ref]);
  console.log(JSON.stringify(pkgs.rows, null, 2));
  
  await pool.end();
})();
