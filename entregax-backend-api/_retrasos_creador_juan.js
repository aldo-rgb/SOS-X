/**
 * Pone a Juan Segura como CREADOR de las tareas de retraso que ya existían.
 *
 * Nacieron con el primer super_admin activo (Aldo) como creador y responsable;
 * después se reasignaron a Juan, pero el creador se quedó igual. Como quien
 * confirma es el creador, a Aldo le salían como "Esperando TU confirmación"
 * aunque el trabajo sea de Juan. Las nuevas ya nacen con creador = responsable.
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const aplicar = process.argv.includes('--aplicar');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const antes = await c.query(`
      SELECT t.id, t.title, t.status, t.created_by, t.assignee_id
        FROM tasks t
       WHERE t.title LIKE 'Retraso TKT-%'
         AND t.assignee_id IS NOT NULL
         AND t.created_by <> t.assignee_id
       ORDER BY t.id`);
    console.log('tareas a corregir:', antes.rowCount);
    console.table(antes.rows);
    if (antes.rowCount === 0) { await c.query('ROLLBACK'); return; }

    const r = await c.query(`
      UPDATE tasks SET created_by = assignee_id, updated_at = NOW()
       WHERE title LIKE 'Retraso TKT-%' AND assignee_id IS NOT NULL AND created_by <> assignee_id
      RETURNING id`);
    // El creador tiene que seguir siendo participante para no perder la tarea
    // de vista; y el anterior también, que la venía siguiendo.
    for (const t of antes.rows) {
      await c.query(
        `INSERT INTO task_participants (task_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [t.id, t.assignee_id]).catch(() => {});
    }
    console.log('corregidas:', r.rowCount);
    console.table((await c.query(`
      SELECT t.id, t.status, c2.full_name creador, u.full_name responsable
        FROM tasks t LEFT JOIN users c2 ON c2.id=t.created_by LEFT JOIN users u ON u.id=t.assignee_id
       WHERE t.title LIKE 'Retraso TKT-%' ORDER BY t.id`)).rows);

    if (aplicar) { await c.query('COMMIT'); console.log('COMMIT'); }
    else { await c.query('ROLLBACK'); console.log('ROLLBACK (ensayo)'); }
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); await pool.end(); }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
