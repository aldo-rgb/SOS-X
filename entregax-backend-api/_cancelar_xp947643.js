/**
 * Cancela XP947643 (id 204). Quedó a medias: el comprobante se guardó pero la
 * orden nunca avanzó a en_proceso porque su transacción del lado del proveedor
 * ya estaba muerta desde el vencimiento anterior. Se sustituyó por XP144485.
 *
 * Importante: el cron NO la iba a cancelar. Su regla salta cualquier orden con
 * comprobante subido, así que esta se habría quedado viva para siempre.
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const aplicar = process.argv.includes('--aplicar');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const antes = (await c.query(
      `SELECT id, referencia_pago, estatus_global, error_message, comprobante_subido_at, op_monto, op_divisa_destino
         FROM entangled_payment_requests WHERE referencia_pago = 'XP947643'`)).rows;
    console.log('antes:'); console.table(antes);
    if (antes.length !== 1 || antes[0].estatus_global === 'cancelado') throw new Error('No está viva como se esperaba; no se toca.');

    const r = await c.query(
      `UPDATE entangled_payment_requests
          SET estatus_global = 'cancelado',
              error_message = 'duplicada_sustituida_por_XP144485',
              updated_at = NOW()
        WHERE referencia_pago = 'XP947643'
        RETURNING id, referencia_pago, estatus_global, error_message`);
    console.log('después:'); console.table(r.rows);
    // La reemplaza, para que quede claro cuál es la buena.
    console.log('sustituta:');
    console.table((await c.query(
      `SELECT id, referencia_pago, estatus_global, op_monto FROM entangled_payment_requests WHERE referencia_pago = 'XP144485'`)).rows);

    if (aplicar) { await c.query('COMMIT'); console.log('COMMIT'); }
    else { await c.query('ROLLBACK'); console.log('ROLLBACK (ensayo)'); }
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); await pool.end(); }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
