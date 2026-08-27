/**
 * Corrige el RFC del perfil fiscal XPAY del cliente 738 (Johan Froese
 * Knelssen). El capturado venía sin un dígito, por eso el proveedor rechazaba
 * las solicitudes con rfc_no_coincide_constancia. El valor bueno es el que el
 * propio proveedor reporta como el de la constancia.
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const MALO = 'FOKJ940527X6';
const BUENO = 'FOKJ9405272X6';
(async () => {
  const aplicar = process.argv.includes('--aplicar');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const antes = (await c.query('SELECT id, user_id, rfc, razon_social FROM entangled_fiscal_profiles WHERE user_id = 738')).rows;
    console.log('antes:'); console.table(antes);
    if (antes.length !== 1 || antes[0].rfc !== MALO) throw new Error('El perfil no está como se esperaba; no se toca.');

    const r = await c.query(
      `UPDATE entangled_fiscal_profiles SET rfc = $2, updated_at = NOW() WHERE user_id = 738 AND rfc = $1 RETURNING id, rfc`,
      [MALO, BUENO]);
    console.log('después:'); console.table(r.rows);

    // Las solicitudes ya rechazadas conservan el RFC malo: son el registro de
    // lo que se mandó y no se tocan. Se listan para saber cuáles reenviar.
    const sol = await c.query(
      `SELECT id, cf_rfc, estatus_global, error_message, created_at
         FROM entangled_payment_requests WHERE user_id = 738 ORDER BY id`);
    console.log('solicitudes del cliente (no se modifican):'); console.table(sol.rows);

    if (aplicar) { await c.query('COMMIT'); console.log('COMMIT'); }
    else { await c.query('ROLLBACK'); console.log('ROLLBACK (ensayo)'); }
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); await pool.end(); }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
