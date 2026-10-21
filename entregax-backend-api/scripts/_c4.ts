import { pool } from '../src/db';
(async () => {
  for (const t of ['fiscal_profiles','client_fiscal_profiles']) {
    const c = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`,[t]);
    const n = await pool.query(`SELECT count(*)::int filas, count(DISTINCT user_id)::int clientes FROM ${t}`);
    console.log(`\n### ${t}  -> ${n.rows[0].filas} filas, ${n.rows[0].clientes} clientes`);
    console.log('   ', c.rows.map((r:any)=>r.column_name).join(', '));
  }
  console.log('\n=== los 3 clientes multi-razon, en CADA tabla ===');
  const a = await pool.query(`SELECT user_id, rfc FROM client_fiscal_profiles WHERE user_id IN (240,390,484) ORDER BY user_id`);
  const b = await pool.query(`SELECT user_id, rfc FROM fiscal_profiles WHERE user_id IN (240,390,484) ORDER BY user_id`);
  console.log('client_fiscal_profiles:', a.rows.map((r:any)=>`${r.user_id}/${r.rfc}`).join(' '));
  console.log('fiscal_profiles       :', b.rows.map((r:any)=>`${r.user_id}/${r.rfc}`).join(' ') || '(ninguno)');
  await pool.end();
})();
