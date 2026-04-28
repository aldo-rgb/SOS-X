/**
 * Sincroniza payment_status (y monto_pagado / saldo) de las hijas con sus masters.
 * Para PO Box, el master es la fuente de verdad del cobro.
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : undefined,
});

(async () => {
  try {
    const r = await pool.query(`
      UPDATE packages c
      SET payment_status = m.payment_status,
          client_paid = m.client_paid,
          client_paid_at = m.client_paid_at,
          updated_at = CURRENT_TIMESTAMP
      FROM packages m
      WHERE c.master_id = m.id
        AND (
          COALESCE(c.payment_status, '') <> COALESCE(m.payment_status, '')
          OR COALESCE(c.client_paid, FALSE) <> COALESCE(m.client_paid, FALSE)
        )
      RETURNING c.id, c.tracking_internal, m.payment_status
    `);
    console.log(`✅ ${r.rowCount} hijas sincronizadas con payment del master.`);
    r.rows.forEach((x) => console.log(`   ${x.tracking_internal} → ${x.payment_status}`));
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e);
    process.exit(1);
  }
})();
