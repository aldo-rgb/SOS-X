const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    // Ver estructura de la tabla
    const cols = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_name = 'china_callback_logs' ORDER BY ordinal_position
    `);
    console.log('=== COLUMNAS ===');
    cols.rows.forEach(c => console.log(c.column_name, '-', c.data_type));

    // Ver últimos registros
    const logs = await pool.query(`SELECT * FROM china_callback_logs ORDER BY id DESC LIMIT 10`);
    console.log('\n=== ÚLTIMOS CALLBACKS ===');
    logs.rows.forEach(r => {
      console.log('---');
      console.log(JSON.stringify(r, null, 2));
    });
  } catch(e) { console.error(e); }
  process.exit(0);
})();
