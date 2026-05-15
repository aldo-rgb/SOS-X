require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    const userId = 75;
    const q = async (label, sql) => {
      try {
        const r = await pool.query(sql);
        console.log(`${label}:`, r.rows);
      } catch (e) {
        console.log(`${label} ERROR:`, e.message);
      }
    };

    await q('containers', `SELECT COUNT(*) FROM containers WHERE client_user_id = ${userId}`);
    await q('maritime_orders by user_id', `SELECT COUNT(*) FROM maritime_orders WHERE user_id = ${userId}`);
    await q('maritime_shipments by user_id', `SELECT COUNT(*) FROM maritime_shipments WHERE user_id = ${userId}`);
    await q('packages by user_id (all)', `SELECT COUNT(*) FROM packages WHERE user_id = ${userId}`);
    await q('packages maritime', `
      SELECT service_type, status, COUNT(*) 
      FROM packages WHERE user_id = ${userId}
      GROUP BY service_type, status ORDER BY COUNT(*) DESC
    `);
    await q('packages china_sea/maritime totals', `
      SELECT COUNT(*) FROM packages 
      WHERE user_id = ${userId} 
        AND (service_type ILIKE '%mar%' OR service_type ILIKE '%sea%' OR service_type ILIKE '%fcl%')
    `);
  } catch (e) { console.error(e); }
  finally { await pool.end(); }
})();
