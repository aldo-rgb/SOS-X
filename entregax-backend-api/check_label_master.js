require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const r = await pool.query(`
    SELECT id,
           COALESCE(to_jsonb(p)->>'tracking_number', to_jsonb(p)->>'tracking_internal') as tracking,
           to_jsonb(p)->>'is_master' as is_master,
           to_jsonb(p)->>'master_id' as master_id,
           to_jsonb(p)->>'national_label_url' as national_label_url,
           to_jsonb(p)->>'national_tracking' as national_tracking,
           to_jsonb(p)->>'national_carrier' as national_carrier,
           to_jsonb(p)->>'skydropx_label_id' as skydropx_label_id,
           to_jsonb(p)->>'dhl_awb' as dhl_awb,
           to_jsonb(p)->>'payment_status' as payment_status,
           to_jsonb(p)->>'status' as status,
           to_jsonb(p)->>'assigned_address_id' as assigned_address_id,
           to_jsonb(p)->>'needs_instructions' as needs_instructions
    FROM packages p
    WHERE COALESCE(to_jsonb(p)->>'tracking_number', to_jsonb(p)->>'tracking_internal') IN ('US-M8IW4526','US-M8IW4526-01','US-M8IW4526-02')
    ORDER BY id
  `);
  console.table(r.rows);
  process.exit(0);
})();
