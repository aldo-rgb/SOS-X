/**
 * Siembra sync_shared_tasks con las tareas que ya se compartieron con Grupo
 * Rino, leyéndolas de la cola de salida. Sin esto, la regla nueva ("una vez
 * compartida, sigue reportando") no aplicaría a lo que ya está en vuelo.
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const aplicar = process.argv.includes('--aplicar');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`CREATE TABLE IF NOT EXISTS sync_shared_tasks (
      task_id INTEGER PRIMARY KEY, shared_at TIMESTAMPTZ DEFAULT NOW(), deleted_at TIMESTAMPTZ, title TEXT)`);
    const r = await c.query(`
      INSERT INTO sync_shared_tasks (task_id, shared_at, title)
      SELECT (payload->'data'->'task'->>'id')::int,
             MIN(created_at),
             (ARRAY_AGG(payload->'data'->'task'->>'title' ORDER BY created_at DESC))[1]
        FROM sync_outbox
       WHERE payload->'data'->'task'->>'id' ~ '^[0-9]+$'
       GROUP BY 1
      ON CONFLICT (task_id) DO NOTHING
      RETURNING task_id`);
    console.log('tareas sembradas:', r.rowCount);
    const v = await c.query(`
      SELECT s.task_id, s.title, t.status, t.updated_at,
             (SELECT u.full_name FROM users u WHERE u.id = t.assignee_id) asignado,
             EXISTS (SELECT 1 FROM task_participants tp JOIN users u ON u.id=tp.user_id
                      WHERE tp.task_id = s.task_id AND u.source_app = 'grupo_rino') tiene_rino
        FROM sync_shared_tasks s LEFT JOIN tasks t ON t.id = s.task_id ORDER BY s.task_id`);
    console.table(v.rows);
    if (aplicar) { await c.query('COMMIT'); console.log('COMMIT'); }
    else { await c.query('ROLLBACK'); console.log('ROLLBACK (ensayo)'); }
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); await pool.end(); }
})().catch(e => { console.error(e.message); process.exit(1); });
