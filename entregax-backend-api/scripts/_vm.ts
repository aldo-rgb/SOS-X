import { pool } from '../src/db';
(async () => {
  const u = await pool.query(
    `SELECT id, full_name, email, role, warehouse_location, branch_id, is_active
       FROM users WHERE email ILIKE '%china@entregax%'`);
  console.log('=== USUARIO CHINA ===', JSON.stringify(u.rows, null, 2));
  const t = await pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_name ILIKE '%panel%permission%' OR table_name ILIKE '%permission%'`);
  console.log('\nTABLAS de permisos:', t.rows.map(r => r.table_name).join(' '));
  for (const n of t.rows.map(r => r.table_name)) {
    const c = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [n]);
    console.log(`\n== ${n}: ` + c.rows.map(r => r.column_name).join(' '));
  }
  if (u.rows[0]) {
    for (const n of t.rows.map(r => r.table_name)) {
      try {
        const p = await pool.query(`SELECT * FROM ${n} WHERE user_id = $1`, [u.rows[0].id]);
        if (p.rowCount) { console.log(`\npermisos en ${n}:`); for (const x of p.rows) console.log('  ' + JSON.stringify(x)); }
      } catch {}
    }
  }
  await pool.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
