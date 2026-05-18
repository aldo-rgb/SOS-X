const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const r = await pool.query(`
    SELECT p.id, p.tracking_internal, p.status, p.missing_on_arrival,
      to_char((p.received_at AT TIME ZONE 'America/Monterrey')::timestamp,'YYYY-MM-DD HH24:MI') as recv_at,
      (SELECT to_char((MAX(created_at) AT TIME ZONE 'America/Monterrey')::timestamp,'YYYY-MM-DD HH24:MI') FROM package_history WHERE package_id=p.id AND status::text='received_mty') AS mty_max,
      (SELECT to_char((MIN(created_at) AT TIME ZONE 'America/Monterrey')::timestamp,'YYYY-MM-DD HH24:MI') FROM package_history WHERE package_id=p.id AND status::text='received_mty') AS mty_min,
      (SELECT COUNT(*) FROM package_history WHERE package_id=p.id AND status::text='received_mty') AS mty_cnt
    FROM packages p WHERE p.consolidation_id=45 ORDER BY p.tracking_internal
  `);
  console.table(r.rows);
  const ph = await pool.query(`
    SELECT package_id, status,
      to_char((created_at AT TIME ZONE 'America/Monterrey')::timestamp,'YYYY-MM-DD HH24:MI') as at,
      notes
    FROM package_history
    WHERE package_id IN (SELECT id FROM packages WHERE consolidation_id=45)
    ORDER BY package_id, created_at
  `);
  console.log('\nHISTORY:');
  console.table(ph.rows);
  await pool.end();
})();
