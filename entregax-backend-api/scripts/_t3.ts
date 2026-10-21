import { pool } from '../src/db';
(async () => {
  for (const id of [873, 872, 794]) {
    const t = await pool.query(`SELECT * FROM tasks WHERE id=$1`, [id]);
    const r = t.rows[0];
    if (!r) { console.log(`\n### ${id}: NO EXISTE`); continue; }
    const u = await pool.query(`SELECT id, full_name FROM users WHERE id = ANY($1)`, [[r.assignee_id, r.created_by].filter(Boolean)]);
    const nom = (i:any) => u.rows.find((x:any)=>x.id===i)?.full_name || i;
    console.log(`\n############################## TAREA ${id} — ${r.title}`);
    console.log(`estado=${r.status} prioridad=${r.priority||'-'} eisenhower=${r.eisenhower||'-'} asignada=${nom(r.assignee_id)} creada por=${nom(r.created_by)} el ${r.created_at?.toISOString().slice(0,16)}`);
    console.log('--- DESCRIPCION ---\n' + String(r.description||'(vacia)'));
    const c = await pool.query(`SELECT c.id, c.author_id, us.full_name, c.attachment_url,
        to_char(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Monterrey','MM-DD HH24:MI') mty, c.body
      FROM task_comments c LEFT JOIN users us ON us.id=c.author_id WHERE c.task_id=$1 ORDER BY c.id`, [id]);
    for (const x of c.rows) console.log(`\n--- comentario #${x.id} ${x.full_name} ${x.mty}${x.attachment_url?' [adjunto]':''}\n${x.body}`);
  }
  await pool.end();
})();
