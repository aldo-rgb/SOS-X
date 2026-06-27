// Diagnóstico providers ENTANGLED: comparar local vs API remoto
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway',
  ssl: { rejectUnauthorized: false },
});
(async () => {
  const r = await pool.query(
    `SELECT id, name, code, external_id, is_active, is_default, remote_activo,
            total_empresas_activas, last_synced_at, updated_at
       FROM entangled_providers
      ORDER BY id`
  );
  console.log('=== LOCAL DB ===');
  console.table(r.rows);
  await pool.end();
})();
