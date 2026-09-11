/**
 * Tarea 522 — dejar en el monedero el renglón del excedente de UW-528767C4.
 *
 * Javier Silva (S1656) pagó $13,996.30 por una orden de $13,483.35. Los $512.95
 * de sobrante se aplicaron bien —bajaron su deuda de DHL, que es la regla cuando
 * el cliente debe— pero no dejaron rastro en ningún lado, y por eso Angel levantó
 * la tarea creyendo que el dinero se había perdido.
 *
 * El arreglo de fondo ya está (los excedentes nuevos anotan solos), pero esta
 * orden se procesó antes. Este script pone el renglón que le faltó.
 *
 * Es un ASIENTO: no mueve un peso. `balance_after` va con el saldo tal cual está.
 *
 *   npx ts-node scripts/tarea522_renglon_excedente.ts            (simulación)
 *   npx ts-node scripts/tarea522_renglon_excedente.ts --aplicar
 */
import { pool } from '../src/db';

const APLICAR = process.argv.includes('--aplicar');
const REFERENCIA = 'UW-528767C4';
const f = (n: number) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 });

async function main() {
  try {
    const o = await pool.query(
      `SELECT id, user_id, amount::numeric AS monto, voucher_total::numeric AS pagado,
              surplus_amount::numeric AS excedente
         FROM pobox_payments WHERE payment_reference = $1`, [REFERENCIA]);
    if (!o.rows[0]) throw new Error(`No existe la orden ${REFERENCIA}`);
    const { id, user_id, monto, pagado, excedente } = o.rows[0];
    const exc = Number(excedente);

    const u = await pool.query(
      'SELECT full_name, box_id, wallet_balance FROM users WHERE id = $1', [user_id]);
    const cli = u.rows[0];

    console.log(`${cli.box_id} ${cli.full_name}`);
    console.log(`  orden ${REFERENCIA}: ${f(Number(monto))} · pagó ${f(Number(pagado))} · sobrante ${f(exc)}`);
    console.log(`  saldo del monedero: ${f(Number(cli.wallet_balance))} (no se toca)`);

    const ya = await pool.query(
      `SELECT 1 FROM financial_transactions
        WHERE user_id = $1 AND description LIKE '%' || $2 || '%'
          AND type = 'credit_settlement' LIMIT 1`, [user_id, REFERENCIA]);
    if (ya.rowCount) { console.log('\nYa tenía su renglón. No se hace nada.'); return; }

    const texto =
      `Pagaste de más en la orden ${REFERENCIA}: ${f(exc)} se aplicaron a tu línea de ` +
      `crédito de DHL. No pasó por tu saldo a favor.`;
    console.log(`\n  renglón a poner: credit_settlement ${f(-exc)}`);
    console.log(`  "${texto}"`);

    if (!APLICAR) { console.log('\nSimulación: no se escribió nada. Corre con --aplicar.'); return; }

    await pool.query(
      `INSERT INTO financial_transactions
         (user_id, type, amount, balance_after, description, reference_type, reference_id, created_at)
       VALUES ($1, 'credit_settlement'::tx_type, $2, $3, $4, 'excedente_orden', $5, NOW())`,
      [user_id, -exc, Number(cli.wallet_balance), texto, REFERENCIA]);
    console.log('\nPuesto.');
  } catch (e: any) {
    console.error('ERR:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
