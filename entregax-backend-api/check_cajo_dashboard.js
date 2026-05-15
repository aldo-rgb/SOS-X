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

  // EXACTLY what dashboard /dashboard/client counts for "maritime/china_sea":
  await q('containers (dashboard filter)', `
    SELECT COUNT(*) FROM containers
    WHERE client_user_id = $1 AND status NOT IN ('delivered','cancelled')
  `, [userId]);

  await q('maritime_orders (dashboard filter)', `
    SELECT COUNT(*) FROM maritime_orders
    WHERE (user_id = $1 OR UPPER(shipping_mark) = UPPER($2))
      AND status NOT IN ('delivered','cancelled')
  `, [userId, boxId]);

  await q('maritime_orders breakdown', `
    SELECT user_id, shipping_mark, COUNT(*) FROM maritime_orders
    WHERE (user_id = $1 OR UPPER(shipping_mark) = UPPER($2))
      AND status NOT IN ('delivered','cancelled')
    GROUP BY user_id, shipping_mark ORDER BY COUNT(*) DESC LIMIT 20
  `, [userId, boxId]);

  // legacy_client_id for user
  await q('user legacy_client_id', `SELECT id, full_name, box_id, legacy_client_id FROM users WHERE id=$1`, [userId]);

  // try legacy linkage
  await q('containers via legacy_client_id', `
    SELECT COUNT(*) FROM containers c
    JOIN users u ON u.legacy_client_id = c.legacy_client_id
    WHERE u.id = $1 AND c.status NOT IN ('delivered','cancelled')
  `, [userId]);

  // maritime_orders that might be ILIKE %S87%
  await q('maritime_orders ILIKE S87', `
    SELECT COUNT(*) FROM maritime_orders WHERE shipping_mark ILIKE '%S87%'
  `);

  await pool.end();
})();
