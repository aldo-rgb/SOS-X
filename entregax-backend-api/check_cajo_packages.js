require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const userId = 75;
  const boxId = 'S87';
  const q = async (label, sql, params=[]) => {
    try { const r = await pool.query(sql, params); console.log(`\n=== ${label} ===`); console.table(r.rows); }
    catch (e) { console.log(`${label} ERROR:`, e.message); }
  };

  await q('packages exactly as dashboard returns', `
    SELECT service_type, status::text as status, COUNT(*) 
    FROM packages
    WHERE (user_id = $1 OR box_id = $2)
      AND status::text NOT IN ('cancelled', 'returned')
      AND (status::text NOT IN ('delivered', 'sent') OR updated_at >= NOW() - INTERVAL '7 days')
      AND (is_master = true OR master_id IS NULL)
    GROUP BY service_type, status ORDER BY COUNT(*) DESC
  `, [userId, boxId]);

  await q('packages COUNT dashboard query', `
    SELECT COUNT(*) FROM packages
    WHERE (user_id = $1 OR box_id = $2)
      AND status::text NOT IN ('cancelled', 'returned')
      AND (status::text NOT IN ('delivered', 'sent') OR updated_at >= NOW() - INTERVAL '7 days')
      AND (is_master = true OR master_id IS NULL)
  `, [userId, boxId]);

  await q('packages SEA_CHN_MX shipment_type=maritime by box', `
    SELECT COUNT(*) FROM packages
    WHERE box_id = $1 AND service_type = 'SEA_CHN_MX'
      AND status::text NOT IN ('cancelled', 'returned')
      AND (status::text NOT IN ('delivered', 'sent') OR updated_at >= NOW() - INTERVAL '7 days')
      AND (is_master = true OR master_id IS NULL)
  `, [boxId]);

  await pool.end();
})();
