const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();
(async () => {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const sql = fs.readFileSync('migrations/add_branch_to_package_history.sql', 'utf8');
    await pool.query(sql);
    console.log('✅ Migración aplicada: branch_id + warehouse_location en package_history');
    const r = await pool.query("SELECT COUNT(*) FROM package_history WHERE branch_id IS NOT NULL OR warehouse_location IS NOT NULL");
    console.log('Filas con ubicación:', r.rows[0].count);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
