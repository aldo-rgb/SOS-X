require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  try {
    const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='pobox_payments' ORDER BY ordinal_position");
    console.log(r.rows.map(x => x.column_name).join('\n'));
  } catch (e) { console.error(e); } finally { await pool.end(); }
})();
