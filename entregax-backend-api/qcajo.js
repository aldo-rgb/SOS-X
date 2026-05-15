require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const u = 75, b = 'S87';
  for (const [label, sql, params] of [
    ['containers all statuses', 'SELECT status, COUNT(*) FROM containers WHERE client_user_id=$1 GROUP BY status ORDER BY COUNT(*) DESC', [u]],
    ['china_receipts by box', "SELECT COUNT(*) FROM china_receipts WHERE user_id=$1 OR UPPER(shipping_mark)=UPPER($2)", [u,b]],
    ['packages with shipment_type maritime/fcl', "SELECT COUNT(*) FROM packages WHERE (user_id=$1 OR box_id=$2) AND service_type IN ('SEA_CHN_MX','FCL_CHN_MX')", [u,b]],
    ['containers excluding delivered/cancelled', "SELECT COUNT(*) FROM containers WHERE client_user_id=$1 AND status NOT IN ('delivered','cancelled')", [u]],
  ]) {
    try { const r = await pool.query(sql, params); console.log('\n===', label, '===\n', r.rows); }
    catch(e){ console.log(label,'ERR',e.message); }
  }
  await pool.end();
})();
