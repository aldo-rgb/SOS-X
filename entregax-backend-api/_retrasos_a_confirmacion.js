/**
 * Pasa a ESPERANDO CONFIRMACIÓN las tareas de retraso cuyo ticket ya está
 * resuelto. Es lo que de aquí en adelante hace solo resolveTicket; esto alcanza
 * a las que quedaron abiertas antes del cambio.
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const aplicar = process.argv.includes('--aplicar');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const objetivo = await c.query(`
      SELECT t.id, t.title, t.status, t.assignee_id, s.ticket_folio, s.resolved_at
        FROM tasks t
        JOIN support_tickets s ON s.ticket_folio = REPLACE(t.title, 'Retraso ', '')
       WHERE t.title LIKE 'Retraso TKT-%'
         AND t.status NOT IN ('completed', 'cancelled', 'awaiting_confirmation')
         AND s.status = 'resolved'
       ORDER BY t.id`);
    console.log('tareas a mover:', objetivo.rowCount);
    console.table(objetivo.rows.map(r => ({ id: r.id, tarea: r.title, estado: r.status, ticket_resuelto: r.resolved_at })));
    if (objetivo.rowCount === 0) { await c.query('ROLLBACK'); return; }

    const ids = objetivo.rows.map(r => r.id);
    await c.query(
      `UPDATE tasks SET status = 'awaiting_confirmation', updated_at = NOW() WHERE id = ANY($1::int[])`, [ids]);
    for (const t of objetivo.rows) {
      await c.query(
        `INSERT INTO task_activity (task_id, actor_id, action, meta)
         VALUES ($1, NULL, 'awaiting_confirmation', $2::jsonb)`,
        [t.id, JSON.stringify({ reason: 'ticket_resuelto', folio: t.ticket_folio, backfill: true })]
      ).catch(() => {});
    }
    console.log('después:');
    console.table((await c.query(`SELECT id, title, status FROM tasks WHERE id = ANY($1::int[]) ORDER BY id`, [ids])).rows);

    if (aplicar) { await c.query('COMMIT'); console.log('COMMIT'); }
    else { await c.query('ROLLBACK'); console.log('ROLLBACK (ensayo)'); }
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); await pool.end(); }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
