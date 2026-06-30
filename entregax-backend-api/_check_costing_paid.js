// Diagnóstico costos paquetes US-9180166640 y US-2885632633
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway',
  ssl: { rejectUnauthorized: false },
});
(async () => {
  const r = await pool.query(
    `SELECT id, tracking_internal, master_id, is_master, total_boxes,
            assigned_cost_mxn, pobox_service_cost, national_shipping_cost,
            national_carrier, gex_total_cost, status, payment_status
       FROM packages
      WHERE tracking_internal IN ('US-9180166640','US-2885632633')
         OR master_id IN (SELECT id FROM packages WHERE tracking_internal IN ('US-9180166640','US-2885632633'))
      ORDER BY COALESCE(master_id, id), id`
  );
  console.table(r.rows);
  await pool.end();
})();
