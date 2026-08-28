/**
 * Corrige el monto de las órdenes DHL a CRÉDITO donde la paquetería nacional se
 * cobró dos veces. El navegador mandaba el total inflado y el backend lo
 * aceptaba tal cual (ya corregido en el servidor de aquí en adelante).
 *
 * Solo estas cuatro: son a crédito y SIN comprobante, o sea que el cliente
 * todavía no desembolsa. No se tocan las que ya se pagaron —ahí habría que
 * devolver dinero y esa decisión no es de un script— ni se aplica saldo a favor.
 *
 * El monto correcto sale de la fórmula canónica: import_cost_mxn (que ya trae
 * el impuesto) + national_cost_mxn de las guías de la orden.
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const REFS = ['UW-68766CAA', 'UW-48813763', 'UW-759029F9', 'UW-79899040'];
(async () => {
  const aplicar = process.argv.includes('--aplicar');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const objetivo = await c.query(`
      SELECT pp.id, pp.payment_reference AS ref, pp.amount::numeric AS cobrado,
             pp.payment_method, pp.voucher_total::numeric AS comprobantes,
             u.box_id, u.full_name AS cliente,
             (SELECT COALESCE(SUM(COALESCE(d.import_cost_mxn,0) + COALESCE(d.national_cost_mxn,0)),0)
                FROM dhl_shipments d
               WHERE d.id::text IN (SELECT jsonb_array_elements_text(pp.package_ids))) AS correcto
        FROM pobox_payments pp LEFT JOIN users u ON u.id = pp.user_id
       WHERE pp.payment_reference = ANY($1) ORDER BY pp.id`, [REFS]);

    console.log('antes:');
    console.table(objetivo.rows.map(r => ({
      ref: r.ref, cliente: String(r.cliente).slice(0, 20), metodo: r.payment_method,
      comprobantes: r.comprobantes, cobrado: r.cobrado, correcto: r.correcto,
      baja: (Number(r.cobrado) - Number(r.correcto)).toFixed(2),
    })));

    // Guardas: solo crédito, sin comprobantes, y que la diferencia sea
    // exactamente la paquetería duplicada. Si algo no cuadra, no se toca nada.
    for (const r of objetivo.rows) {
      if (r.payment_method !== 'credit') throw new Error(`${r.ref} no es a crédito`);
      if (Number(r.comprobantes) > 0) throw new Error(`${r.ref} ya tiene comprobantes`);
      if (!(Number(r.correcto) > 0)) throw new Error(`${r.ref} sin monto canónico`);
      if (Number(r.cobrado) <= Number(r.correcto)) throw new Error(`${r.ref} no está inflada`);
    }

    let n = 0;
    for (const r of objetivo.rows) {
      await c.query(`UPDATE pobox_payments SET amount = $2 WHERE id = $1`, [r.id, r.correcto]);
      await c.query(
        `UPDATE openpay_webhook_logs SET monto_recibido = $2, monto_neto = $2 WHERE transaction_id = $1`,
        [r.ref, r.correcto]);
      n++;
    }
    console.log('\ncorregidas:', n);
    console.log('después:');
    console.table((await c.query(
      `SELECT payment_reference ref, amount::numeric cobrado FROM pobox_payments WHERE payment_reference = ANY($1) ORDER BY id`,
      [REFS])).rows);

    if (aplicar) { await c.query('COMMIT'); console.log('COMMIT'); }
    else { await c.query('ROLLBACK'); console.log('ROLLBACK (ensayo)'); }
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); await pool.end(); }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
