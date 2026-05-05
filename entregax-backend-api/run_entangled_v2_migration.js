/* eslint-disable */
// Aplica la migración entangled_v2_two_services.sql contra DATABASE_URL.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Falta DATABASE_URL');
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', 'entangled_v2_two_services.sql'),
      'utf8'
    );
    console.log('[MIG] Aplicando entangled_v2_two_services.sql ...');
    await pool.query(sql);
    console.log('[MIG] OK');
  } catch (e) {
    console.error('[MIG] ERROR:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
