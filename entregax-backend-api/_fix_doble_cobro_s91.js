/**
 * Doble cobro de la guía multicaja DHL a GIL BROKER (S91) — TKT-2026-2178.
 *
 * El panel del asesor cotiza la GUÍA COMPLETA (SUM sobre el grupo
 * secondary_tracking) pero manda un solo uid por guía: el MIN(id) sin pagar.
 * La orden guardaba únicamente ese id, así que las cajas hermanas se quedaban
 * con paid_at NULL, reaparecían como pendientes y se volvían a cobrar.
 *
 *   UW-6368A865 · 14-ago · $42,170.45 · cotizó 8 guías = 12 cajas
 *                                       guardó solo 8 ids
 *   UW-873693D2 · 15-ago · $14,318.60 · volvió a cobrar 4 de esas 12 cajas
 *                                       (469, 463, 480, 481)
 *
 * Cuadra al centavo: las 12 cajas suman $39,244.85 de costo y la primera orden
 * cobró $42,170.45 ($2,925.60 de última milla). Las 4 cajas de la segunda ya
 * estaban dentro de esos $39,244.85.
 *
 * Causa corregida en el commit que acompaña a este script (la orden ahora
 * expande a todas las cajas SIN PAGAR del grupo). El marcado de pago ya se
 * había corregido el 17-ago en dhlGroup.ts, tres días después del incidente.
 *
 * Qué hace:
 *   · devuelve $14,318.60 al crédito dhl_liberacion del cliente
 *     (la orden se pagó con crédito, así que el abono va al mismo servicio;
 *      regla de Aldo: si el cliente debe, el saldo a favor abona a la deuda
 *      del servicio por el que se pagó la referencia)
 *   · deja constancia en financial_transactions y en la propia orden
 *
 * Qué NO hace:
 *   · NO desmarca las cajas como pagadas: sí están pagadas, vía UW-6368A865
 *   · NO cancela la orden: pasó, y el registro se conserva anotado
 *   · NO toca users.wallet_balance: el cliente debe $174,572.60 de crédito DHL
 *
 * Dry-run por defecto. --apply para escribir.
 */
const { Pool } = require('pg');
require('dotenv').config();

const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ORDEN_DUPLICADA = 'UW-873693D2';
const ORDEN_ORIGINAL = 'UW-6368A865';
const CLIENTE = 343;
const SERVICIO = 'dhl_liberacion';
const MONTO = 14318.60;

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Guardas: nada se escribe si el escenario no es exactamente el esperado
    const dup = (await client.query(
      `SELECT id, user_id, amount::numeric AS amount, status, payment_method, package_ids,
              confirmation_notes
         FROM pobox_payments WHERE payment_reference = $1 FOR UPDATE`,
      [ORDEN_DUPLICADA]
    )).rows[0];
    if (!dup) throw new Error(`no existe la orden ${ORDEN_DUPLICADA}`);
    if (Number(dup.user_id) !== CLIENTE) throw new Error('la orden no es del cliente 343');
    if (Math.abs(Number(dup.amount) - MONTO) > 0.01) throw new Error(`monto inesperado: ${dup.amount}`);
    if (dup.payment_method !== 'credit') throw new Error(`método inesperado: ${dup.payment_method}`);
    if (/DOBLE COBRO/.test(String(dup.confirmation_notes || ''))) {
      throw new Error('esta orden ya fue corregida antes');
    }

    const orig = (await client.query(
      `SELECT id, amount::numeric AS amount, package_ids FROM pobox_payments
        WHERE payment_reference = $1`, [ORDEN_ORIGINAL]
    )).rows[0];
    if (!orig) throw new Error(`no existe la orden ${ORDEN_ORIGINAL}`);

    // Las cajas de la orden duplicada deben pertenecer a guías que la orden
    // original ya cobró completas.
    const idsDup = (dup.package_ids || []).map(Number);
    const idsOrig = (orig.package_ids || []).map(Number);
    const verif = await client.query(
      `SELECT d.id, d.secondary_tracking,
              EXISTS (SELECT 1 FROM dhl_shipments o
                       WHERE o.id = ANY($2::int[])
                         AND o.secondary_tracking = d.secondary_tracking
                         AND o.user_id = d.user_id) AS guia_en_la_original
         FROM dhl_shipments d WHERE d.id = ANY($1::int[])`,
      [idsDup, idsOrig]
    );
    const huerfanas = verif.rows.filter((r) => !r.guia_en_la_original);
    if (verif.rows.length !== idsDup.length) throw new Error('alguna caja de la orden no existe');
    if (huerfanas.length > 0) {
      throw new Error(`estas cajas NO estaban en ${ORDEN_ORIGINAL}: ${huerfanas.map((r) => r.id).join(', ')}`);
    }
    console.log(`cajas recobradas: ${verif.rows.map((r) => `${r.id} (${r.secondary_tracking})`).join(', ')}`);
    console.log(`todas pertenecen a guías ya cobradas en ${ORDEN_ORIGINAL} ✓\n`);

    // ── Devolver el crédito del MISMO servicio
    const antes = (await client.query(
      `SELECT COALESCE(used_credit, 0)::numeric AS used, COALESCE(credit_limit, 0)::numeric AS lim
         FROM user_service_credits WHERE user_id = $1 AND service = $2 FOR UPDATE`,
      [CLIENTE, SERVICIO]
    )).rows[0];
    if (!antes) throw new Error(`el cliente no tiene línea de crédito ${SERVICIO}`);
    const usadoAntes = Number(antes.used);
    if (usadoAntes < MONTO) {
      throw new Error(`la deuda ($${usadoAntes.toFixed(2)}) es menor al abono ($${MONTO}). Revisar a mano.`);
    }
    const usadoDespues = +(usadoAntes - MONTO).toFixed(2);

    console.log(`crédito ${SERVICIO}`);
    console.log(`  límite      $${Number(antes.lim).toFixed(2)}`);
    console.log(`  usado antes $${usadoAntes.toFixed(2)}`);
    console.log(`  abono       $${MONTO.toFixed(2)}`);
    console.log(`  usado después $${usadoDespues.toFixed(2)}`);
    console.log(`  disponible  $${(Number(antes.lim) - usadoAntes).toFixed(2)} → $${(Number(antes.lim) - usadoDespues).toFixed(2)}\n`);

    await client.query(
      `UPDATE user_service_credits
          SET used_credit = GREATEST(0, COALESCE(used_credit, 0) - $1), updated_at = NOW()
        WHERE user_id = $2 AND service = $3`,
      [MONTO, CLIENTE, SERVICIO]
    );
    // Campo legacy: solo baja si trae algo (en este cliente está en 0).
    await client.query(
      `UPDATE users SET used_credit = GREATEST(0, COALESCE(used_credit, 0) - $1) WHERE id = $2`,
      [MONTO, CLIENTE]
    );

    // ── Constancia
    const nota = `DOBLE COBRO corregido (TKT-2026-2178): estas 4 cajas ya venían ` +
      `cobradas en ${ORDEN_ORIGINAL}, que cotizó las guías completas. Se devolvieron ` +
      `$${MONTO.toFixed(2)} al crédito ${SERVICIO}.`;
    await client.query(
      `UPDATE pobox_payments
          SET confirmation_notes = TRIM(BOTH ' ' FROM COALESCE(confirmation_notes, '') || ' ' || $1)
        WHERE id = $2`,
      [nota, dup.id]
    );
    await client.query(
      `INSERT INTO financial_transactions
         (user_id, type, amount, description, reference_id, reference_type, created_at)
       VALUES ($1, 'refund', $2, $3, $4, 'doble_cobro_dhl', NOW())`,
      [CLIENTE, MONTO, nota, dup.id]
    );

    const ver = (await client.query(
      `SELECT COALESCE(used_credit, 0)::numeric AS used FROM user_service_credits
        WHERE user_id = $1 AND service = $2`, [CLIENTE, SERVICIO]
    )).rows[0];
    console.log(`verificación: used_credit quedó en $${Number(ver.used).toFixed(2)}`);
    if (Math.abs(Number(ver.used) - usadoDespues) > 0.01) throw new Error('el abono no cuadró');

    if (APPLY) { await client.query('COMMIT'); console.log('\nAPLICADO.'); }
    else { await client.query('ROLLBACK'); console.log('\nDRY-RUN (sin cambios). Usa --apply para escribir.'); }
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ERROR, rollback:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
