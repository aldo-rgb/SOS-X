require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const q = async (label, sql) => {
    try { const r = await pool.query(sql); console.log(`\n=== ${label} ===`); console.table(r.rows); }
    catch (e) { console.log(`${label} ERROR:`, e.message); }
  };

  await q('maritime_shipments by shipping_mark S87', `SELECT COUNT(*) FROM maritime_shipments WHERE shipping_mark = 'S87'`);
  await q('maritime_orders by shipping_mark S87', `SELECT COUNT(*) FROM maritime_orders WHERE shipping_mark = 'S87'`);
  await q('maritime_shipments sample', `SELECT id,user_id,shipping_mark,container_id,status FROM maritime_shipments WHERE shipping_mark = 'S87' LIMIT 5`);
  await q('maritime_orders sample', `SELECT id,user_id,shipping_mark,status FROM maritime_orders WHERE shipping_mark = 'S87' LIMIT 5`);
  await q('china_receipts by shipping_mark S87', `SELECT COUNT(*) FROM china_receipts WHERE shipping_mark = 'S87'`);

  // Per-container breakdown
  await q('maritime_shipments by container for S87', `
    SELECT container_id, COUNT(*) AS shipments
    FROM maritime_shipments WHERE shipping_mark = 'S87'
    GROUP BY container_id ORDER BY shipments DESC LIMIT 10
  `);

  await pool.end();
})();
