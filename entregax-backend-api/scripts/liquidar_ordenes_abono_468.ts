/**
 * Tarea 468 · marcar como pagadas las órdenes que ya cubrió el abono de Nancy.
 *
 * El 10-sep-2026 Nancy Robledo (S96) abonó $211,227 desde su monedero a su
 * crédito DHL. La deuda bajó y las comisiones se liberaron, pero ninguna orden
 * pasó de "Crédito" a "Crédito Pagado": la regla de entonces solo las marcaba
 * cuando el cliente ya no debía nada en ningún servicio. El código ya se
 * corrigió; esto pone al día lo que ese abono dejó pendiente.
 *
 * Usa la MISMA función que ahora usa el abono (marcarOrdenesLiquidadasPorAbono):
 * de la más vieja a la más nueva, solo las que el monto cubre completas. Sin
 * soltar comisiones: las 45 de esas órdenes ya están liberadas.
 *
 * No toca la deuda ni el monedero: solo el estatus de las órdenes.
 *
 *   npx ts-node scripts/liquidar_ordenes_abono_468.ts            (simulación)
 *   npx ts-node scripts/liquidar_ordenes_abono_468.ts --aplicar
 */
import { pool } from '../src/db';
import { marcarOrdenesLiquidadasPorAbono } from '../src/voucherController';

const APLICAR = process.argv.includes('--aplicar');
const USER_ID = 113;          // NANCY ROBLEDO · S96
const SERVICIO = 'dhl_liberacion';
const ABONO = 211227;          // financial_transactions credit_settlement del 10-sep
const ESPERADAS = 13;          // lo que dio la simulación revisada con Aldo

async function main() {
  const cx = await pool.connect();
  try {
    await cx.query('BEGIN');
    const antes = await cx.query(
      `SELECT COUNT(*)::int n FROM pobox_payments
        WHERE user_id = $1 AND payment_method = 'credit' AND COALESCE(credit_settled,false) = true`, [USER_ID]);
    const comisionesAntes = await cx.query(
      `SELECT COUNT(*) FILTER (WHERE awaiting_client_payment)::int retenidas,
              COUNT(*) FILTER (WHERE NOT COALESCE(awaiting_client_payment,false))::int liberadas
         FROM advisor_commissions WHERE client_id = $1`, [USER_ID]);

    const marcadas = await marcarOrdenesLiquidadasPorAbono(cx, {
      userId: USER_ID, servicioCredito: SERVICIO, monto: ABONO,
      referencia: 'corrección tarea 468 (abono del 10-sep)', soltarComisiones: false,
    });

    const lista = await cx.query(
      `SELECT payment_reference, amount, created_at FROM pobox_payments
        WHERE user_id = $1 AND payment_method = 'credit' AND credit_settled_at > NOW() - INTERVAL '1 minute'
        ORDER BY created_at`, [USER_ID]);
    const suma = lista.rows.reduce((n: number, r: any) => n + Number(r.amount), 0);
    const comisionesDespues = await cx.query(
      `SELECT COUNT(*) FILTER (WHERE awaiting_client_payment)::int retenidas,
              COUNT(*) FILTER (WHERE NOT COALESCE(awaiting_client_payment,false))::int liberadas
         FROM advisor_commissions WHERE client_id = $1`, [USER_ID]);

    console.log(`Órdenes ya pagadas antes: ${antes.rows[0].n}`);
    console.log(`Se marcan como pagadas: ${marcadas} · $${suma.toFixed(2)}`);
    for (const r of lista.rows) {
      console.log(`  ${r.payment_reference}  $${Number(r.amount).toFixed(2)}  ${new Date(r.created_at).toISOString().slice(0, 10)}`);
    }
    console.log(`Comisiones antes ${JSON.stringify(comisionesAntes.rows[0])} · después ${JSON.stringify(comisionesDespues.rows[0])}`);

    if (marcadas !== ESPERADAS) {
      throw new Error(`Se esperaban ${ESPERADAS} órdenes y salieron ${marcadas}: algo cambió desde la revisión, no se aplica.`);
    }
    if (JSON.stringify(comisionesAntes.rows[0]) !== JSON.stringify(comisionesDespues.rows[0])) {
      throw new Error('Las comisiones cambiaron y no debían: no se aplica.');
    }

    if (!APLICAR) { await cx.query('ROLLBACK'); console.log('\nSimulación: no se tocó nada. Corre con --aplicar.'); return; }
    await cx.query('COMMIT');
    console.log(`\nAplicado: ${marcadas} órdenes de Nancy quedaron como "Crédito Pagado".`);
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
