const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  // Sincroniza enum `status` con `delivery_status='delivered'` que dejó el flow viejo
  const r = await pool.query(`
    UPDATE packages
       SET status = 'delivered'::package_status,
           delivered_at = COALESCE(delivered_at, NOW()),
           updated_at  = NOW()
     WHERE delivery_status = 'delivered'
       AND status::text <> 'delivered'
    RETURNING id, tracking_internal, status
  `);
  console.log('paquetes resincronizados:', r.rowCount);
  console.log(JSON.stringify(r.rows, null, 2));

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
