const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'fix_package_history_dup_trigger.sql'), 'utf8');
  await pool.query(sql);
  console.log('✅ Trigger log_package_status_change actualizado: evita duplicar entradas con la app.');

  // Limpieza: eliminar duplicados existentes (mismo package_id, mismo status,
  // mismo segundo) conservando la entrada con created_by NOT NULL si existe.
  const cleanup = await pool.query(`
    WITH dups AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY package_id, status, date_trunc('second', created_at)
               ORDER BY (created_by IS NOT NULL) DESC, id ASC
             ) AS rn
        FROM package_history
    )
    DELETE FROM package_history
     WHERE id IN (SELECT id FROM dups WHERE rn > 1)
    RETURNING id
  `);
  console.log(\`🧹 Limpieza: \${cleanup.rowCount} entradas duplicadas eliminadas.\`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
