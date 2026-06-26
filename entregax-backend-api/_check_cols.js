const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway',
  ssl: { rejectUnauthorized: false },
});
(async () => {
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'packages'
         AND (column_name ILIKE '%length%'
              OR column_name ILIKE '%width%'
              OR column_name ILIKE '%height%'
              OR column_name ILIKE '%long%'
              OR column_name ILIKE '%ancho%'
              OR column_name ILIKE '%alto%'
              OR column_name ILIKE '%largo%')
       ORDER BY column_name`
  );
  console.table(r.rows);
  await pool.end();
})();
