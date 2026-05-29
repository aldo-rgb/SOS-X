require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const c = await pool.query(
    `SELECT id, container_number, bl_number, reference_code, status, packages_count, total_weight, route, week_number
       FROM containers WHERE reference_code = 'JSM26-0001'`);
  console.log('containers JSM26-0001:', c.rows);
  const d = await pool.query(
    `SELECT id, status, container_number, bl_number, document_type, container_id_found,
            extracted_data->>'reference_code' as ref
       FROM maritime_reception_drafts
      WHERE extracted_data->>'reference_code' = 'JSM26-0001'
         OR container_number = 'WHSU6463903'
         OR bl_number = '024G506094'`);
  console.log('drafts JSM26-0001:', d.rows);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
