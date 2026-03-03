const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    // Ver columnas de packages
    const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'packages' ORDER BY ordinal_position
    `);
    console.log('=== COLUMNAS EN PACKAGES ===');
    cols.rows.forEach(c => console.log(c.column_name));

  } catch(e) { console.error(e); }
  process.exit(0);
})();
