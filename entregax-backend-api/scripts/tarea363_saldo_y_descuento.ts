/**
 * CIERRE DE LA TAREA 363 — dos correcciones puntuales
 *
 * 1) UW-1165922C (S342 DARSHAN JALIL GARCIA) se generó con el envío nacional
 *    duplicado: $5,229.86 cuando la guía 1120704060 vale $4,755.86. Está
 *    pagada, así que el cliente puso $474.00 de más. Se le acredita a su
 *    billetera del MISMO servicio de la orden (AA_DHL), no a POBOX_USA: la
 *    referencia se pagó por DHL y ahí debe quedar. Tiene además la guía
 *    6932047205 pendiente desde el 29-jul, así que el saldo se aplicará solo
 *    cuando genere esa orden.
 *
 * 2) La guía 1268342213 (S951) tiene un descuento aprobado de $537.00 que ya
 *    NO corresponde: se pidió para compensar el cobro doble de la orden
 *    UW-93944633, pero esa orden se canceló y la vigente —UW-3550240F, con
 *    comprobante ya subido— se generó al precio correcto de $4,779.00. Si el
 *    descuento se aplica encima, el cliente acabaría debiendo $537. Se
 *    desactiva dejando la nota de por qué; no se borra.
 *
 * No se modifica ninguna orden de pago ya generada.
 *
 * Uso:  npx ts-node scripts/tarea363_saldo_y_descuento.ts          → simulacro
 *       npx ts-node scripts/tarea363_saldo_y_descuento.ts --apply
 */
require('dotenv').config();
import { pool } from '../src/db';

const APPLY = process.argv.includes('--apply');
const f = (n: any) => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });

const ORDEN_EXCEDENTE = 'UW-1165922C';
const SERVICIO = 'AA_DHL';
const AJUSTE_ID = 160;              // guias_ajustes_financieros
const DESCUENTO_PENDIENTE_ID = 120; // descuentos_pendientes

(async () => {
  console.log(`${APPLY ? 'APLICANDO' : 'SIMULACRO'}\n`);

  // ── 1) Excedente ──────────────────────────────────────────────────────────
  const o = (await pool.query(
    `SELECT o.id, o.amount, o.status, o.user_id, o.surplus_amount, o.surplus_credited,
            u.box_id, u.full_name
       FROM pobox_payments o LEFT JOIN users u ON u.id = o.user_id
      WHERE o.payment_reference = $1`, [ORDEN_EXCEDENTE])).rows[0];
  const g = (await pool.query(
    `SELECT secondary_tracking, import_cost_mxn, national_cost_mxn, total_cost_mxn
       FROM dhl_shipments WHERE id = 561`)).rows[0];
  const correcto = Number(g.total_cost_mxn);
  const excedente = Math.round((Number(o.amount) - correcto) * 100) / 100;

  console.log('1) EXCEDENTE');
  console.log(`   ${ORDEN_EXCEDENTE} · ${o.box_id} ${o.full_name} · ${o.status}`);
  console.log(`   guia ${g.secondary_tracking}: import ${f(g.import_cost_mxn)} + nacional ${f(g.national_cost_mxn)} = ${f(correcto)}`);
  console.log(`   se cobro ${f(o.amount)}  →  excedente ${f(excedente)}`);
  console.log(`   destino: billetera_servicio de ${SERVICIO} (mismo servicio de la referencia)`);
  if (o.surplus_credited) console.log('   ⚠️ la orden ya esta marcada como acreditada; no se hara nada');

  const yaAcreditado = (await pool.query(
    `SELECT 1 FROM billetera_servicio_transacciones
      WHERE payment_order_id = $1 AND tipo = 'excedente'`, [o.id])).rowCount;
  if (yaAcreditado) console.log('   ⚠️ ya existe una transaccion de excedente para esta orden; no se duplicara');

  // ── 2) Descuento que sobra ────────────────────────────────────────────────
  const aj = (await pool.query(
    `SELECT id, guia_tracking, monto, concepto, activo FROM guias_ajustes_financieros WHERE id = $1`,
    [AJUSTE_ID])).rows[0];
  console.log('\n2) DESCUENTO QUE YA NO CORRESPONDE');
  if (!aj) console.log(`   el ajuste #${AJUSTE_ID} no existe`);
  else {
    console.log(`   ajuste #${aj.id} · guia ${aj.guia_tracking} · ${f(aj.monto)} · "${String(aj.concepto).trim()}" · activo=${aj.activo}`);
    console.log('   la orden vigente UW-3550240F ya se genero en $4,779.00 (precio correcto)');
    console.log('   → se desactiva para que no lo descuente otra vez');
  }

  if (!APPLY) { console.log('\nSin cambios. Corre con --apply.'); await pool.end(); return; }

  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    if (excedente > 0.01 && !o.surplus_credited && !yaAcreditado) {
      const w = (await c.query(
        `INSERT INTO billetera_servicio (user_id, service_type, saldo, currency)
         VALUES ($1, $2, $3, 'MXN')
         ON CONFLICT (user_id, service_type) DO UPDATE
           SET saldo = billetera_servicio.saldo + $3, updated_at = NOW()
         RETURNING id, saldo`,
        [o.user_id, SERVICIO, excedente])).rows[0];
      await c.query(
        `INSERT INTO billetera_servicio_transacciones
           (billetera_servicio_id, user_id, service_type, tipo, monto, currency, concepto, payment_order_id)
         VALUES ($1, $2, $3, 'excedente', $4, 'MXN', $5, $6)`,
        [w.id, o.user_id, SERVICIO, excedente,
         `Excedente de ${ORDEN_EXCEDENTE}: la orden se genero en ${f(o.amount)} con el envio nacional duplicado; la guia ${g.secondary_tracking} vale ${f(correcto)}`,
         o.id]);
      await c.query(
        `UPDATE pobox_payments SET surplus_amount = $2, surplus_credited = TRUE WHERE id = $1`,
        [o.id, excedente]);
      console.log(`\n   ✔ acreditados ${f(excedente)} a ${SERVICIO}. Saldo del cliente: ${f(w.saldo)}`);
    }

    if (aj && aj.activo) {
      await c.query(
        `UPDATE guias_ajustes_financieros
            SET activo = FALSE,
                notas = COALESCE(notas, '') ||
                  ' · DESACTIVADO: se pidio por el cobro doble de UW-93944633, pero esa orden se cancelo y UW-3550240F ya se genero en $4,779.00 (precio correcto). Aplicarlo dejaria al cliente debiendo $537.'
          WHERE id = $1`, [AJUSTE_ID]);
      await c.query(
        `UPDATE descuentos_pendientes
            SET notas = COALESCE(notas, '') || ' · Ajuste desactivado: la orden vigente ya trae el precio correcto.'
          WHERE id = $1`, [DESCUENTO_PENDIENTE_ID]).catch(() => {});
      console.log(`   ✔ descuento #${AJUSTE_ID} desactivado`);
    }

    await c.query('COMMIT');
  } catch (e: any) {
    await c.query('ROLLBACK');
    console.error('\nERROR, se revirtio todo:', e.message);
    c.release(); await pool.end(); return;
  }
  c.release();

  // Verificacion
  const v1 = (await pool.query(
    `SELECT saldo FROM billetera_servicio WHERE user_id = $1 AND service_type = $2`, [o.user_id, SERVICIO])).rows[0];
  const v2 = (await pool.query(`SELECT activo FROM guias_ajustes_financieros WHERE id = $1`, [AJUSTE_ID])).rows[0];
  console.log(`\nVERIFICACION: saldo ${SERVICIO} de ${o.box_id} = ${f(v1?.saldo)} · ajuste #${AJUSTE_ID} activo = ${v2?.activo}`);
  await pool.end();
})();
