require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  // Revertir master que se cargó por error a 'received' y limpiar loaded_at + assigned_driver_id
  const r = await pool.query(`
    UPDATE packages
    SET status = 'received',
        loaded_at = NULL,
        assigned_driver_id = NULL,
        updated_at = NOW()
    WHERE COALESCE((to_jsonb(packages)->>'is_master')::boolean, false) = true
      AND status = 'out_for_delivery'
    RETURNING id, tracking_number, status
  `);
  console.log(`Masters revertidos: ${r.rowCount}`);
  console.table(r.rows);
  process.exit(0);
})();
