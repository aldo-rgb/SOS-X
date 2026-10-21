import { pool } from '../src/db';
(async () => {
  const r = await pool.query(`
    SELECT c.id, c.task_id, t.title, c.author_id, u.full_name,
           to_char(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Monterrey','MM-DD HH24:MI') AS mty,
           c.body
      FROM task_comments c LEFT JOIN users u ON u.id=c.author_id LEFT JOIN tasks t ON t.id=c.task_id
     WHERE c.id > 1469 ORDER BY c.id`);
  if (!r.rows.length) console.log('(nada nuevo despues del 1469)');
  for (const x of r.rows) {
    console.log(`\n========== #${x.id}  tarea ${x.task_id} (${x.title})  —  ${x.full_name} [${x.author_id}]  ${x.mty}`);
    console.log(x.author_id === 3 ? '(mio)' : x.body);
  }
  await pool.end();
})();
