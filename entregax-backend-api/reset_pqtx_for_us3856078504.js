const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  try {
    const r = await pool.query(
      `UPDATE packages
          SET national_tracking = NULL,
              national_label_url = NULL
        WHERE tracking_internal = 'US-3856078504'
           OR master_id = (SELECT id FROM packages WHERE tracking_internal = 'US-3856078504')
        RETURNING id, tracking_internal, national_tracking`
    );
    console.log('Limpiados', r.rowCount, 'paquetes:', r.rows);
  } catch (e) { console.error(e.message); } finally { await pool.end(); }
})();
