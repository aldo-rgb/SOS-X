require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const userId = 75;
  const boxId = 'S87';
  const q = async (label, sql) => {
    try { const r = await pool.query(sql); console.log(`\n=== ${label} ===`); console.table(r.rows); }
    catch (e) { console.log(`${label} ERROR:`, e.message); }
  };

  // Find all tables with user_id or box_id columns
  await q('tables with relevant columns', `
    SELECT table_name, column_name FROM information_schema.columns
    WHERE column_name IN ('user_id','client_user_id','box_id','client_box_id','shipping_mark')
      AND table_schema='public'
    ORDER BY table_name
  `);

  // Look for maritime-related tables
  await q('maritime-related tables', `
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema='public' AND (table_name ILIKE '%maritim%' OR table_name ILIKE '%container%' OR table_name ILIKE '%order%')
    ORDER BY table_name
  `);

  await q('packages by box_id', `SELECT COUNT(*) FROM packages WHERE box_id = '${boxId}'`);

  await pool.end();
})();
