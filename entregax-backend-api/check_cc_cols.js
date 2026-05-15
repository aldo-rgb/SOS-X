const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const r = await pool.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='caja_chica_transacciones' ORDER BY ordinal_position`);
  console.table(r.rows);
  await pool.end();
})();
