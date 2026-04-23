require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'add_accountant_role.sql'), 'utf-8');
    const r = await pool.query(sql);
    console.log('✅ Migración ejecutada');
    console.log(Array.isArray(r) ? r[r.length - 1].rows : r.rows);
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
