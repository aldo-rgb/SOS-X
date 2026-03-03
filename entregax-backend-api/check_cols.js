const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'packages' 
      AND column_name LIKE '%cost%' OR column_name LIKE '%price%' OR column_name LIKE '%total%'
      ORDER BY ordinal_position
    `);
    console.log('=== COLUMNAS RELACIONADAS CON COSTO/PRECIO ===');
    cols.rows.forEach(c => console.log(c.column_name));
    
    // Ver todas las columnas
    const allCols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'packages' 
      ORDER BY ordinal_position
    `);
    console.log('\n=== TODAS LAS COLUMNAS ===');
    allCols.rows.forEach(c => console.log(c.column_name));
  } catch(e) { console.error(e); }
  process.exit(0);
})();
