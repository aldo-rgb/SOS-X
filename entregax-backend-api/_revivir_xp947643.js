/**
 * Reactiva la solicitud XPAY XP947643 (id 204) para que el cliente pueda subir
 * su comprobante. La canceló el cron por congelamiento vencido: pasó el
 * payment_deadline_at sin comprobante.
 *
 * No basta con cambiar el estatus: si el deadline sigue vencido, el propio
 * endpoint de subida la vuelve a cancelar en el acto y el cron la remata a los
 * 15 minutos. Se le da una ventana nueva con las horas de congelamiento
 * configuradas (24).
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const REF = 'XP947643';
(async () => {
  const aplicar = process.argv.includes('--aplicar');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const horas = Number((await c.query('SELECT congelamiento_horas FROM entangled_service_config WHERE id=1')).rows[0]?.congelamiento_horas) || 24;
    const antes = (await c.query(
      `SELECT id, referencia_pago, estatus_global, error_message, payment_deadline_at, comprobante_subido_at, tc_aplicado_usd, op_monto, monto_mxn_total
         FROM entangled_payment_requests WHERE referencia_pago = $1`, [REF])).rows;
    console.log('antes:'); console.table(antes);
    if (antes.length !== 1 || antes[0].estatus_global !== 'cancelado') throw new Error('No está cancelada como se esperaba; no se toca.');
    if (antes[0].comprobante_subido_at) throw new Error('Ya tiene comprobante; no se toca.');

    const r = await c.query(
      `UPDATE entangled_payment_requests
          SET estatus_global = 'esperando_comprobante',
              error_message = NULL,
              payment_deadline_at = NOW() + ($2 || ' hours')::interval,
              updated_at = NOW()
        WHERE referencia_pago = $1 AND estatus_global = 'cancelado'
        RETURNING id, referencia_pago, estatus_global, error_message, payment_deadline_at`,
      [REF, String(horas)]);
    console.log(`después (ventana nueva de ${horas} h):`); console.table(r.rows);

    if (aplicar) { await c.query('COMMIT'); console.log('COMMIT'); }
    else { await c.query('ROLLBACK'); console.log('ROLLBACK (ensayo)'); }
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); await pool.end(); }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
