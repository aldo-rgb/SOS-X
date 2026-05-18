#!/usr/bin/env node
// Ejecuta migrations/add_pettycash_currency.sql contra la BD del backend.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const sqlPath = path.join(__dirname, 'migrations', 'add_pettycash_currency.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const conn = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || undefined,
      database: process.env.DB_NAME,
    };

const pool = new Pool(conn);

(async () => {
  try {
    console.log('Ejecutando migración:', sqlPath);
    await pool.query(sql);
    const r = await pool.query(`
      SELECT owner_type, owner_id, currency, balance_mxn
        FROM petty_cash_wallets
       WHERE owner_type='branch'
       ORDER BY owner_id
    `);
    console.log('petty_cash_wallets (branch) tras migración:');
    console.table(r.rows);
    console.log('OK');
    process.exit(0);
  } catch (err) {
    console.error('Error ejecutando migración:', err.message);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
})();
