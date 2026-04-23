require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

(async () => {
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', 'add_fiscal_emitter_to_facturas.sql'),
      'utf8'
    );
    console.log('▶️  Ejecutando migración fiscal_emitter_id en facturas_emitidas...');
    await pool.query(sql);
    console.log('✅ Migración aplicada.');

    const { rows } = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='facturas_emitidas' AND column_name='fiscal_emitter_id'
    `);
    console.log('Columna presente:', rows.length > 0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
