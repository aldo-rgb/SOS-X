require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : undefined });
(async () => {
  const r = await pool.query(`
    SELECT id, tracking_internal, status, payment_status, master_id, is_master, saldo_pendiente, monto_pagado, assigned_cost_mxn
    FROM packages WHERE tracking_internal LIKE 'US-M8IW4526%' ORDER BY id
  `);
  console.table(r.rows);
  process.exit(0);
})();
