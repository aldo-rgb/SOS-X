/**
 * Corrige el monto de las dos órdenes DHL que YA se pagaron con la paquetería
 * nacional cobrada dos veces. Se ajusta el importe de la orden a la fórmula
 * canónica, igual que en las de crédito.
 *
 * NO se toca ninguna billetera ni se acredita saldo a favor: eso queda a mano.
 * Tampoco se tocan surplus_amount / surplus_credited, porque decir que se
 * acreditó un excedente que nadie acreditó sería peor que dejarlo desalineado.
 * Lo que queda es un cliente que pagó MÁS de lo que ahora dice su orden, y ese
 * saldo a favor lo aplica una persona.
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const REFS = ['UW-18212D58', 'UW-7621CB2D'];
(async () => {
  const aplicar = process.argv.includes('--aplicar');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const obj = await c.query(`
      SELECT pp.id, pp.payment_reference AS ref, pp.amount::numeric AS cobrado,
             pp.payment_method AS metodo, pp.voucher_total::numeric AS pagado_real,
             pp.surplus_amount::numeric AS excedente, pp.surplus_credited,
             u.box_id, u.full_name AS cliente,
             (SELECT COALESCE(SUM(COALESCE(d.import_cost_mxn,0) + COALESCE(d.national_cost_mxn,0)),0)
                FROM dhl_shipments d
               WHERE d.id::text IN (SELECT jsonb_array_elements_text(pp.package_ids))) AS correcto
        FROM pobox_payments pp LEFT JOIN users u ON u.id = pp.user_id
       WHERE pp.payment_reference = ANY($1) ORDER BY pp.id`, [REFS]);

    console.log('antes:');
    console.table(obj.rows.map(r => ({
      ref: r.ref, cliente: String(r.cliente).slice(0, 20), metodo: r.metodo,
      cobrado: r.cobrado, correcto: r.correcto,
      baja: (Number(r.cobrado) - Number(r.correcto)).toFixed(2),
      pago_el_cliente: r.pagado_real, excedente_marcado: r.excedente,
    })));

    for (const r of obj.rows) {
      if (!(Number(r.correcto) > 0)) throw new Error(`${r.ref} sin monto canónico`);
      if (Number(r.cobrado) <= Number(r.correcto)) throw new Error(`${r.ref} no está inflada`);
    }

    for (const r of obj.rows) {
      await c.query(`UPDATE pobox_payments SET amount = $2 WHERE id = $1`, [r.id, r.correcto]);
      await c.query(
        `UPDATE openpay_webhook_logs SET monto_recibido = $2, monto_neto = $2 WHERE transaction_id = $1`,
        [r.ref, r.correcto]);
    }

    console.log('\ndespués:');
    const fin = await c.query(`
      SELECT pp.payment_reference ref, pp.amount::numeric orden, pp.voucher_total::numeric pago_cliente,
             ROUND(pp.voucher_total::numeric - pp.amount::numeric, 2) a_favor_pendiente
        FROM pobox_payments pp WHERE pp.payment_reference = ANY($1) ORDER BY pp.id`, [REFS]);
    console.table(fin.rows);
    console.log('\nEse "a_favor_pendiente" NO se acreditó: queda para aplicarlo a mano.');

    if (aplicar) { await c.query('COMMIT'); console.log('COMMIT'); }
    else { await c.query('ROLLBACK'); console.log('ROLLBACK (ensayo)'); }
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); await pool.end(); }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
