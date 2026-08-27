/**
 * Alinea la prioridad de las programaciones ACTIVAS con la regla nueva:
 * una programación es "estrella" (Importante) salvo que sea ir a pagar o
 * depositar, que es "fuego" (Urgente). Solo toca las que difieren.
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const RE = /\b(pag(?:o|os|ar|are|aran|ando)|depos(?:ito|itos|itar)|abon(?:o|os|ar)|transferenc|liquidar|mensualidad|quincena|nomina)\b/;
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const debeSer = t => (/^(error|problema|falla|bug)\b/.test(norm(t)) ? 'estrella' : (RE.test(norm(t)) ? 'fuego' : 'estrella'));

(async () => {
  const aplicar = process.argv.includes('--aplicar');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await c.query(`SELECT id, title, eisenhower FROM task_schedules WHERE active = true ORDER BY id`);
    const cambios = r.rows.filter(s => s.eisenhower !== debeSer(s.title));
    for (const s of cambios) {
      await c.query(`UPDATE task_schedules SET eisenhower = $2 WHERE id = $1`, [s.id, debeSer(s.title)]);
      console.log(`  #${s.id} "${s.title}": ${s.eisenhower} → ${debeSer(s.title)}`);
    }
    const ver = await c.query(`SELECT id, title, eisenhower FROM task_schedules WHERE active = true ORDER BY id`);
    console.log(`\nActivas: ${r.rows.length} · cambiadas: ${cambios.length}`);
    console.table(ver.rows);
    const mal = ver.rows.filter(s => s.eisenhower !== debeSer(s.title));
    console.log(mal.length ? `⚠️ quedan ${mal.length} sin alinear` : '✅ todas alineadas');
    if (aplicar) { await c.query('COMMIT'); console.log('COMMIT'); }
    else { await c.query('ROLLBACK'); console.log('ROLLBACK (ensayo)'); }
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); await pool.end(); }
})().catch(e => { console.error(e.message); process.exit(1); });
