/**
 * RECONSTRUIR EL LEDGER DE CONCILIACIÓN CON LO QUE YA PASÓ
 *
 * El ledger (bank_entry_applications) arrancó vacío, así que el estado de
 * cuenta mostraba los 4,182 movimientos como disponibles aunque cientos ya
 * respaldaban una orden. Esto lo rellena SOLO donde el vínculo ya está
 * registrado y no hay que adivinar nada:
 *
 *   syncfy_transactions.matched_payment_id → la orden que ese abono pagó.
 *
 * Son 319 transacciones casadas por el cron. Para llegar de la transacción a la
 * fila del estado de cuenta se empareja por empresa + fecha + monto exacto:
 *   · 271 dan UN solo candidato → se registran.
 *   ·  48 dan varios (mismo monto, mismo día) → NO se tocan. Adivinar cuál es
 *     sería exactamente el error que este ledger existe para evitar.
 *
 * Las 323 órdenes autorizadas a mano desde el estado de cuenta NO se pueden
 * reconstruir: nunca se guardó contra qué movimiento se aplicaron — que es la
 * razón por la que hizo falta el ledger. Se quedan sin marcar.
 *
 * No modifica órdenes, saldos ni pagos: solo registra lo que ya ocurrió.
 *
 * Uso:  npx ts-node scripts/backfill_ledger_conciliacion.ts          → simulacro
 *       npx ts-node scripts/backfill_ledger_conciliacion.ts --apply  → aplica
 */
require('dotenv').config();
import { pool } from '../src/db';
import { ensureLedgerSchema } from '../src/bankEntryLedger';

const APPLY = process.argv.includes('--apply');
const f = (n: any) => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });

/** Transacción casada → la ÚNICA fila del estado de cuenta que le corresponde. */
const CANDIDATOS = `
  SELECT st.id                AS syncfy_tx_id,
         st.matched_payment_id AS orden_id,
         st.matched_at,
         ABS(st.amount)       AS monto,
         p.payment_reference,
         p.amount             AS monto_orden,
         p.status             AS estado_orden,
         (SELECT ARRAY_AGG(b.id)
            FROM bank_statement_entries b
           WHERE b.empresa_id = st.emitter_id
             AND b.fecha = COALESCE(st.value_date, st.accounting_date)::date
             AND b.abono IS NOT NULL
             AND ABS(CAST(b.abono AS numeric) - ABS(st.amount)) < 0.01) AS entry_ids
    FROM syncfy_transactions st
    JOIN pobox_payments p ON p.id = st.matched_payment_id
   WHERE st.match_status = 'matched'
     AND st.matched_payment_id IS NOT NULL
   ORDER BY st.value_date`;

(async () => {
  await ensureLedgerSchema();
  const rows = (await pool.query(CANDIDATOS)).rows;

  const unicos = rows.filter(r => (r.entry_ids || []).length === 1);
  const ambiguos = rows.filter(r => (r.entry_ids || []).length > 1);
  const huerfanos = rows.filter(r => (r.entry_ids || []).length === 0);

  console.log(`${APPLY ? 'APLICANDO' : 'SIMULACRO'}\n`);
  console.log(`  ${rows.length} transacciones casadas por el cron`);
  console.log(`  ${unicos.length} con UN solo movimiento posible  → se registran`);
  console.log(`  ${ambiguos.length} con varios candidatos          → se DEJAN sin marcar`);
  console.log(`  ${huerfanos.length} sin movimiento en el estado de cuenta`);
  console.log(`  suma a conciliar: ${f(unicos.reduce((s, r) => s + Number(r.monto), 0))}\n`);

  if (ambiguos.length) {
    console.log('  Ambiguas (mismo monto el mismo día, no se adivina):');
    ambiguos.slice(0, 6).forEach(r =>
      console.log(`    ${r.payment_reference} ${f(r.monto)} → candidatos ${r.entry_ids.join(', ')}`));
    if (ambiguos.length > 6) console.log(`    ... y ${ambiguos.length - 6} más\n`);
  }

  if (!APPLY) {
    console.log('\nSin cambios. Corre con --apply para registrar.');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  let ok = 0, yaEstaba = 0, noCupo = 0;
  try {
    await client.query('BEGIN');
    for (const r of unicos) {
      const entryId = r.entry_ids[0];
      // Idempotente: si ya se registró (por ejemplo en una corrida anterior o
      // por una conciliación nueva) no se duplica.
      const dup = await client.query(
        `SELECT 1 FROM bank_entry_applications
          WHERE bank_entry_id = $1 AND payment_order_id = $2 AND reversed_at IS NULL`,
        [entryId, r.orden_id]
      );
      if (dup.rowCount) { yaEstaba++; continue; }

      // Se respeta el candado igual que en vivo: si el abono ya no alcanza es
      // porque otra aplicación se lo llevó, y eso hay que reportarlo, no forzarlo.
      const libre = await client.query(
        `SELECT COALESCE(CAST(b.abono AS numeric), 0)
                - COALESCE((SELECT SUM(a.monto_aplicado) FROM bank_entry_applications a
                             WHERE a.bank_entry_id = b.id AND a.reversed_at IS NULL), 0) AS disponible
           FROM bank_statement_entries b WHERE b.id = $1 FOR UPDATE`,
        [entryId]
      );
      const disponible = Number(libre.rows[0]?.disponible || 0);
      const aplicar = Math.min(Number(r.monto), disponible);
      if (aplicar <= 0.01) { noCupo++; continue; }

      await client.query(
        `INSERT INTO bank_entry_applications
           (bank_entry_id, payment_order_id, payment_reference, monto_aplicado,
            origen, aplicado_por_nombre, nota, created_at)
         VALUES ($1, $2, $3, $4, 'auto_syncfy', 'Sistema (auto-sync banco)', $5, $6)`,
        [entryId, r.orden_id, r.payment_reference, aplicar,
         'Reconstruido desde syncfy_transactions.matched_payment_id', r.matched_at || new Date()]
      );
      ok++;
    }
    await client.query('COMMIT');
  } catch (e: any) {
    await client.query('ROLLBACK');
    console.error('ERROR, se revirtió todo:', e.message);
    client.release();
    await pool.end();
    return;
  }
  client.release();

  console.log(`\nRegistrados: ${ok}   ya estaban: ${yaEstaba}   sin saldo libre: ${noCupo}`);
  const v = await pool.query(
    `SELECT COUNT(*) aplicaciones, COUNT(DISTINCT bank_entry_id) movimientos,
            SUM(monto_aplicado) total
       FROM bank_entry_applications WHERE reversed_at IS NULL`);
  console.log('Ledger ahora:', v.rows[0]);
  await pool.end();
})();
