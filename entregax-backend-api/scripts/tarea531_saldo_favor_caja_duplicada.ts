/**
 * Tarea 531 — devolverle a Jair Espinoza (S1708) la caja que se le cobró dos veces.
 *
 * La caja US-8526838544-0008 es un doble envío del formulario de recepción: nació
 * 43 milisegundos después de la -0009, con la misma guía de origen, el mismo peso
 * y las mismas medidas. La 0009 viajó y se entregó; la 0008 se quedó en bodega,
 * sin consolidación, sin moverse nunca — y aun así entró en la orden RO-7792E066.
 *
 * Recibió 14 cajas y se le cobraron 15. La causa ya quedó cerrada en la recepción.
 *
 * Regla de Aldo: no se modifica lo ya cobrado; la diferencia va como saldo a favor.
 *
 *   npx ts-node scripts/tarea531_saldo_favor_caja_duplicada.ts            (simulación)
 *   npx ts-node scripts/tarea531_saldo_favor_caja_duplicada.ts --aplicar
 */
import { pool } from '../src/db';

const APLICAR = process.argv.includes('--aplicar');
const CAJA_FANTASMA = 'US-8526838544-0008';
const GEMELA = 'US-8526838544-0009';
const ORDEN = 'RO-7792E066';
const f = (n: number) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 });

async function main() {
  const cx = await pool.connect();
  try {
    await cx.query('BEGIN');

    const p = await cx.query(
      `SELECT p.id, p.user_id, p.tracking_internal, p.tracking_provider, p.status,
              p.weight, p.pkg_length, p.pkg_width, p.pkg_height,
              p.pobox_service_cost::numeric AS costo, p.consolidation_id,
              u.full_name, u.box_id, u.wallet_balance::numeric AS saldo
         FROM packages p JOIN users u ON u.id = p.user_id
        WHERE p.tracking_internal IN ($1, $2) ORDER BY p.tracking_internal`,
      [CAJA_FANTASMA, GEMELA]);
    if (p.rows.length !== 2) throw new Error('No encontré las dos cajas');
    const [fantasma, gemela] = p.rows;

    // Que sigan siendo gemelas: si algo cambió desde que se midió, no se toca.
    const igual = fantasma.tracking_provider === gemela.tracking_provider
      && String(fantasma.weight) === String(gemela.weight)
      && String(fantasma.pkg_length) === String(gemela.pkg_length)
      && String(fantasma.pkg_width) === String(gemela.pkg_width)
      && String(fantasma.pkg_height) === String(gemela.pkg_height);
    if (!igual) throw new Error('Las dos cajas ya no son idénticas; revisar a mano antes de abonar');
    if (fantasma.consolidation_id) throw new Error('La caja fantasma sí viajó; no procede devolver');

    const monto = Number(fantasma.costo);
    console.log(`${fantasma.box_id} ${fantasma.full_name}`);
    console.log(`  ${GEMELA}       viajó   ${gemela.status.padEnd(10)} ${f(Number(gemela.costo))}`);
    console.log(`  ${CAJA_FANTASMA}  se quedó ${fantasma.status.padEnd(10)} ${f(monto)}  ← se devuelve`);
    console.log(`  guía de origen ${fantasma.tracking_provider} · ${fantasma.weight}kg ` +
      `${fantasma.pkg_length}x${fantasma.pkg_width}x${fantasma.pkg_height} (idénticas)`);
    console.log(`  saldo a favor: ${f(Number(fantasma.saldo))} → ${f(Number(fantasma.saldo) + monto)}`);

    const ya = await cx.query(
      `SELECT 1 FROM financial_transactions
        WHERE user_id = $1 AND reference_type = 'saldo_a_favor'
          AND description LIKE '%' || $2 || '%' LIMIT 1`, [fantasma.user_id, CAJA_FANTASMA]);
    if (ya.rowCount) { console.log('\nYa tenía su abono. No se hace nada.'); await cx.query('ROLLBACK'); return; }

    if (!APLICAR) { await cx.query('ROLLBACK'); console.log('\nSimulación: no se abonó nada. Corre con --aplicar.'); return; }

    const motivo =
      `Saldo a favor por corrección tarea 531: la caja ${CAJA_FANTASMA} se registró dos veces ` +
      `por un doble envío en la recepción —nació 43 milisegundos después de ${GEMELA}, con la ` +
      `misma guía de origen, el mismo peso y las mismas medidas—. Recibiste 14 cajas y la orden ` +
      `${ORDEN} cobró 15. Se devuelve ${f(monto)}. Autorizado por Aldo.`;

    await cx.query(
      `UPDATE users SET wallet_balance = COALESCE(wallet_balance,0) + $1 WHERE id = $2`,
      [monto, fantasma.user_id]);
    const s = await cx.query('SELECT wallet_balance FROM users WHERE id = $1', [fantasma.user_id]);
    await cx.query(
      `INSERT INTO financial_transactions
         (user_id, type, amount, balance_after, description, reference_type, reference_id, created_at)
       VALUES ($1, 'adjustment'::tx_type, $2, $3, $4, 'saldo_a_favor', $5, NOW())`,
      [fantasma.user_id, monto, Number(s.rows[0].wallet_balance), motivo, ORDEN]);

    await cx.query('COMMIT');
    console.log(`\nAbonado. Saldo a favor de ${fantasma.box_id}: ${f(Number(s.rows[0].wallet_balance))}`);
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
