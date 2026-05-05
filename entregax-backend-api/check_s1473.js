const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const pkg = await pool.query(`SELECT id, tracking_internal, user_id, box_id, status, service_type FROM packages WHERE UPPER(box_id) = 'S1473' LIMIT 20`);
  console.log('PACKAGES box_id=S1473:', pkg.rows.length);
  pkg.rows.forEach(r => console.log(' ', r));
  const mo = await pool.query(`SELECT id, ordersn, user_id, shipping_mark, status FROM maritime_orders WHERE shipping_mark ILIKE '%S1473%' LIMIT 20`);
  console.log('MARITIME shipping_mark~S1473:', mo.rows.length);
  mo.rows.forEach(r => console.log(' ', r));
  const dhl = await pool.query(`SELECT id, tracking_number, user_id, box_id FROM dhl_shipments WHERE UPPER(box_id) = 'S1473' LIMIT 20`);
  console.log('DHL box_id=S1473:', dhl.rows.length);
  dhl.rows.forEach(r => console.log(' ', r));
  await pool.end();
})();
