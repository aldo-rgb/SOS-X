/** Repone la descripción de la tarea 415 con el mensaje completo del ticket. */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const aplicar = process.argv.includes('--aplicar');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const t = (await c.query(`SELECT id, ticket_folio FROM support_tickets WHERE ticket_folio = 'TKT-2026-2384'`)).rows[0];
    const msg = (await c.query(
      `SELECT message FROM ticket_messages WHERE ticket_id = $1 AND COALESCE(sender_type,'') <> 'agent' ORDER BY id LIMIT 1`,
      [t.id])).rows[0].message;
    const desc = `🐛 Error reportado desde el ticket ${t.ticket_folio} · Oscar Aldana.\n${String(msg).trim()}`;
    await c.query(`UPDATE tasks SET description = $1, updated_at = NOW() WHERE id = 415`, [desc]);
    console.log((await c.query('SELECT description FROM tasks WHERE id=415')).rows[0].description);
    if (aplicar) { await c.query('COMMIT'); console.log('\nCOMMIT'); }
    else { await c.query('ROLLBACK'); console.log('\nROLLBACK (ensayo)'); }
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); await pool.end(); }
})().catch(e => { console.error(e.message); process.exit(1); });
