/**
 * Tarea 522 — quitarle a Javier Silva (S1656, user 668) los $10,000 de deuda
 * que su línea DHL cargaba de más.
 *
 * El descuadre está medido, no supuesto: sus órdenes a crédito menos las
 * liquidadas menos el excedente ya aplicado dan $10,000.00 menos de lo que la
 * línea registra. La brecha se mantuvo exacta aunque su deuda siguió creciendo
 * con órdenes nuevas, así que es un error viejo y fijo, no algo que derive.
 *
 * NO se pudo identificar el evento que lo originó: cuando pasó, el crédito se
 * movía con UPDATEs sin bitácora. Esa parte ya quedó cerrada — de aquí en
 * adelante cada movimiento deja renglón. Aldo autorizó la corrección con eso
 * sabido.
 *
 * El ajuste se aplica como MOVIMIENTO, no como un UPDATE a mano: queda en la
 * bitácora del crédito y también en el monedero, para que se pueda leer después
 * quién lo hizo y por qué. Vuelve a medir la brecha antes de tocar nada y se
 * aborta si ya no es exactamente $10,000.
 *
 *   npx ts-node scripts/tarea522_ajuste_credito_javier.ts          (simulación)
 *   npx ts-node scripts/tarea522_ajuste_credito_javier.ts --aplicar
 */
import { pool } from '../src/db';
import { anotarMovimientoCredito } from '../src/creditoBitacora';

const USER = 668;
const SERVICIO = 'dhl_liberacion';
const ESPERADO = 10000.0;
const APLICAR = process.argv.includes('--aplicar');

const f = (n: number) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 });

async function main() {
  const cx = await pool.connect();
  try {
    await cx.query('BEGIN');

    const linea = await cx.query(
      `SELECT COALESCE(used_credit,0)::numeric AS usado
         FROM user_service_credits
        WHERE user_id=$1 AND service=$2 FOR UPDATE`, [USER, SERVICIO]);
    if (!linea.rows[0]) throw new Error('No existe la línea de crédito');

    const ordenes = await cx.query(
      `SELECT amount::numeric AS amount, COALESCE(credit_settled,false) AS liquidada
         FROM pobox_payments
        WHERE user_id=$1 AND LOWER(COALESCE(payment_method,''))='credit'
          AND status NOT IN ('cancelled','expired')
          AND (payment_reference LIKE 'UW-%' OR service_type='AA_DHL')`, [USER]);
    const exc = await cx.query(
      `SELECT COALESCE(SUM(surplus_amount),0)::numeric AS total
         FROM pobox_payments WHERE user_id=$1 AND COALESCE(surplus_credited,false)=true`, [USER]);

    const total = ordenes.rows.reduce((n: number, o: any) => n + Number(o.amount), 0);
    const liquidadas = ordenes.rows
      .filter((o: any) => o.liquidada)
      .reduce((n: number, o: any) => n + Number(o.amount), 0);
    const esperado = +(total - liquidadas - Number(exc.rows[0].total)).toFixed(2);
    const usado = Number(linea.rows[0].usado);
    const brecha = +(usado - esperado).toFixed(2);

    console.log(`Debería deber   ${f(esperado)}`);
    console.log(`Debe            ${f(usado)}`);
    console.log(`Brecha          ${f(brecha)}\n`);

    if (Math.abs(brecha - ESPERADO) > 0.01) {
      throw new Error(
        `La brecha es ${f(brecha)}, no ${f(ESPERADO)}. Algo cambió desde que se midió; ` +
        `no se aplica nada hasta volver a revisar.`);
    }

    const nuevo = +(usado - ESPERADO).toFixed(2);
    console.log(`Deuda DHL: ${f(usado)} → ${f(nuevo)}`);

    if (!APLICAR) {
      await cx.query('ROLLBACK');
      console.log('\nSimulación: no se tocó nada. Corre con --aplicar.');
      return;
    }

    await cx.query(
      `UPDATE user_service_credits
          SET used_credit = $1::numeric, updated_at = NOW()
        WHERE user_id = $2::int AND service = $3::text`,
      [nuevo, USER, SERVICIO]);

    const concepto =
      'Corrección tarea 522: su línea DHL cargaba $10,000.00 de más. Medido contra ' +
      'sus órdenes a crédito (consumidas menos liquidadas menos el excedente ya ' +
      'aplicado). No se pudo identificar el evento que lo originó porque el crédito ' +
      'se movía sin bitácora. Autorizado por Aldo.';

    await anotarMovimientoCredito(cx, {
      userId: USER, servicio: SERVICIO, monto: -ESPERADO,
      movimiento: 'ajuste', concepto,
    });

    // También en el monedero, que es donde el cliente y Servicio a Cliente miran.
    const w = await cx.query('SELECT wallet_balance FROM users WHERE id=$1', [USER]);
    await cx.query(
      `INSERT INTO financial_transactions
         (user_id, type, amount, balance_after, description, reference_type)
       VALUES ($1, 'adjustment'::tx_type, $2, $3, $4, 'ajuste_credito')`,
      [USER, -ESPERADO, Number(w.rows[0]?.wallet_balance ?? 0), concepto]);

    await cx.query('COMMIT');
    console.log('\nAplicado.');
  } catch (e: any) {
    await cx.query('ROLLBACK');
    console.error('ERR:', e.message);
    process.exitCode = 1;
  } finally {
    cx.release();
    await pool.end();
  }
}

main();
