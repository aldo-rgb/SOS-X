const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkColumns() {
  try {
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'openpay_webhook_logs'
    `);
    console.log('Columnas de openpay_webhook_logs:');
    result.rows.forEach(r => console.log(`  - ${r.column_name}`));
    
    // Agregar columna branch_id si no existe
    await pool.query(`
      ALTER TABLE openpay_webhook_logs 
      ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id)
    `);
    console.log('\n✅ Columna branch_id agregada/verificada');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkColumns();
