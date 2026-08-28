/**
 * Alinea el ENUM `status` de las hijas de un REPACK con lo que ya dice su
 * `delivery_status`. La propagación al enviar el master solo escribía
 * delivery_status, así que quedaron en 'received_mty' aunque ya habían salido.
 *
 * Solo toca hijas de masters US-REPACK-* donde las dos columnas discrepan. No
 * inventa nada: copia el valor que ya estaba registrado.
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const aplicar = process.argv.includes('--aplicar');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const objetivo = `
      FROM packages ch JOIN packages m ON m.id = ch.master_id
      WHERE m.tracking_internal LIKE 'US-REPACK-%'
        AND ch.delivery_status IS NOT NULL
        AND ch.status::text <> ch.delivery_status`;
    console.log('antes:');
    console.table((await c.query(`SELECT ch.status::text estado, ch.delivery_status entrega, COUNT(*)::int n ${objetivo} GROUP BY 1,2`)).rows);

    const r = await c.query(`
      UPDATE packages p
         SET status = ch.delivery_status::text::package_status, updated_at = NOW()
        FROM packages ch JOIN packages m ON m.id = ch.master_id
       WHERE p.id = ch.id
         AND m.tracking_internal LIKE 'US-REPACK-%'
         AND ch.delivery_status IS NOT NULL
         AND ch.status::text <> ch.delivery_status
      RETURNING p.id`);
    console.log('hijas alineadas:', r.rowCount);
    console.log('después (debe quedar vacío):');
    console.table((await c.query(`SELECT ch.status::text estado, ch.delivery_status entrega, COUNT(*)::int n ${objetivo} GROUP BY 1,2`)).rows);

    if (aplicar) { await c.query('COMMIT'); console.log('COMMIT'); }
    else { await c.query('ROLLBACK'); console.log('ROLLBACK (ensayo)'); }
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); await pool.end(); }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
