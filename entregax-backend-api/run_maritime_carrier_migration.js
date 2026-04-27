// Ejecuta migrations/add_maritime_carrier_columns.sql
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

(async () => {
  try {
    const sqlPath = path.join(__dirname, 'migrations', 'add_maritime_carrier_columns.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('🚀 Ejecutando migración add_maritime_carrier_columns.sql...');
    await pool.query(sql);
    console.log('✅ Migración aplicada correctamente');
  } catch (err) {
    console.error('❌ Error en migración:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
