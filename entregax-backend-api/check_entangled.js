const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'entangled_providers' ORDER BY ordinal_position`);
  console.log('Cols entangled_providers:', cols.rows.map(r => r.column_name).join(', '));
  const providers = await pool.query(`SELECT * FROM entangled_providers`);
  console.log('PROVIDERS:', providers.rows);
  const reqs = await pool.query(`SELECT id, status, transaccion_id, last_webhook_at, error_message, created_at FROM entangled_payment_requests ORDER BY created_at DESC LIMIT 10`);
  console.log('REQUESTS recientes:', reqs.rows);
  await pool.end();
})();
