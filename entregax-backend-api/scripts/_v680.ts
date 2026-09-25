import { pool } from '../src/db';

const TAREA = 680;

(async () => {
  const t = await pool.query(
    `SELECT t.*, u.full_name AS creador, u.role AS creador_rol, a.full_name AS responsable,
            b.name AS tablero
       FROM tasks t
       LEFT JOIN users u ON u.id = t.created_by
       LEFT JOIN users a ON a.id = t.assignee_id
       LEFT JOIN task_boards b ON b.id = t.board_id
      WHERE t.id = $1`, [TAREA]);
  if (!t.rows[0]) { console.log(`NO EXISTE la tarea ${TAREA}`); await pool.end(); return; }
  const r: any = t.rows[0];
  for (const k of Object.keys(r)) {
    const v = r[k];
    if (v !== null && v !== '' && String(v) !== 'false') console.log(`  ${k}: ${String(v).slice(0, 1200)}`);
  }
  const inv = await pool.query(
    `SELECT u.id, u.full_name, u.role FROM task_participants tp
       JOIN users u ON u.id = tp.user_id WHERE tp.task_id = $1`, [TAREA]).catch(() => ({ rows: [] } as any));
  console.log('\nINVOLUCRADOS:', inv.rows.map((x: any) => `${x.full_name}(${x.role})`).join(', ') || 'ninguno');
  const c = await pool.query(
    `SELECT c.id, u.full_name, c.body, c.attachment_url, to_char(c.created_at,'DD-MM-YY HH24:MI') f
       FROM task_comments c LEFT JOIN users u ON u.id = c.author_id
      WHERE c.task_id = $1 ORDER BY c.id`, [TAREA]);
  console.log(`\nCOMENTARIOS (${c.rowCount}):`);
  c.rows.forEach((x: any) => console.log(`  [${x.f}] ${x.full_name}: ${String(x.body || '').slice(0, 700)}${x.attachment_url ? ' [adjunto]' : ''}`));
  await pool.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
