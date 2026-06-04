const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  // Consolidación 78
  const c = await pool.query(
    `SELECT * FROM consolidations WHERE id = 78`
  );
  console.log('CONSOLIDATION 78:', JSON.stringify(c.rows, null, 2));

  // Paquetes de la consolidación
  const p = await pool.query(
    `SELECT id, tracking_internal, status, received_at, dispatched_at,
            missing_on_arrival, missing_reported_at, current_branch_id, created_at, updated_at
       FROM packages WHERE consolidation_id = 78
       ORDER BY id`
  );
  console.log('PACKAGES:', JSON.stringify(p.rows, null, 2));

  // Historial COMPLETO de esos paquetes
  const ids = p.rows.map(r => r.id);
  const h = await pool.query(
    `SELECT package_id, status, branch_id, created_at, notes, created_by
       FROM package_history
      WHERE package_id IN (5673, 5674, 5675)
      ORDER BY package_id, created_at ASC`
  );
  console.log('HISTORY:', JSON.stringify(h.rows, null, 2));

  // Branches involucradas
  const b = await pool.query(`SELECT id, code, name FROM branches WHERE id = ANY($1::int[])`,
    [Array.from(new Set(h.rows.map(x => x.branch_id).filter(Boolean)))]);
  console.log('BRANCHES:', JSON.stringify(b.rows, null, 2));

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
