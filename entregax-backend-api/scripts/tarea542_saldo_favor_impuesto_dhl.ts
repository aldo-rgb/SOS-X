/**
 * Tarea 542 — devolver como SALDO A FAVOR el impuesto DHL cobrado de más.
 *
 * La nota de aduana se repartía entre las `pieces` que declara Caja Chica pero
 * se escribía en TODAS las cajas de la guía. Con `pieces` en 1 —el default— una
 * guía de 3 bultos cobraba la nota tres veces (TKT-2026-2620). La causa ya quedó
 * cerrada en `crossDhlTaxNote`; esto corrige el dinero.
 *
 * Regla de Aldo: no se modifica lo ya cobrado. La diferencia se abona como saldo
 * a favor, con el motivo escrito.
 *
 * El exceso se mide POR GUÍA, no por caja: lo que de verdad quedó en
 * `import_tax_mxn` sumado en todas sus cajas, contra lo que debió cobrarse —la
 * nota, nunca por debajo del piso de $390 por caja—. Medirlo caja por caja
 * inflaba la devolución, porque hay guías donde una caja se cobró de más y otra
 * de menos y solo importa el neto.
 *
 * Solo entran las guías con TODAS sus cajas pagadas: si el cliente aún no paga,
 * lo que corresponde es bajarle el cobro, no abonarle saldo. Y no repite: se
 * salta las que ya tienen su abono.
 *
 *   npx ts-node scripts/tarea542_saldo_favor_impuesto_dhl.ts            (simulación)
 *   npx ts-node scripts/tarea542_saldo_favor_impuesto_dhl.ts --aplicar
 */
import { pool } from '../src/db';

const APLICAR = process.argv.includes('--aplicar');
// `--guia=XXXX` abona solo esa. Sirve para dejar fuera las que necesitan
// revisión aparte: a Ramón (S2031) ya le habían compensado a mano y no hay
// renglón que diga cuánto, así que abonarle a ciegas lo pagaría dos veces.
const SOLO = (process.argv.find(a => a.startsWith('--guia=')) || '').split('=')[1] || null;

/**
 * Lo que ya se compensó a mano y NO dejó renglón en el monedero. Sin esto el
 * abono se pagaría dos veces. Yliana le aplicó a Ramón (S2031) $908.94 de
 * descuento por la 4164740403 al atender el ticket; lo dejó escrito en la
 * tarea 542 pero el movimiento nunca se registró. Confirmado por Aldo.
 */
const YA_COMPENSADO: Record<string, number> = {
  '4164740403': 908.94,
};
const f = (n: number) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 });

const SQL = `
WITH nota AS (
  SELECT DISTINCT ON (TRIM(concept)) TRIM(concept) AS guia,
         amount_mxn::numeric AS monto, GREATEST(1, COALESCE(pieces,1)) AS piezas
    FROM petty_cash_movements
   WHERE category='impuestos_dhl' AND status='approved' AND COALESCE(TRIM(concept),'')<>''
   ORDER BY TRIM(concept), id
), caja AS (
  SELECT n.guia, n.monto, d.user_id,
         COALESCE(d.import_tax_mxn,0)::numeric AS cobrado,
         COALESCE(d.monto_pagado,0)::numeric   AS pagado,
         COUNT(*) OVER (PARTITION BY n.guia)   AS cajas
    FROM nota n
    JOIN dhl_shipments d
      ON d.inbound_tracking = n.guia OR d.secondary_tracking = n.guia
)
SELECT c.guia, c.monto AS nota, c.cajas, c.user_id, u.full_name, u.box_id,
       SUM(c.cobrado)::numeric(12,2)                                AS cobrado,
       GREATEST(c.monto, 390*c.cajas)::numeric(12,2)                AS debio,
       (SUM(c.cobrado) - GREATEST(c.monto, 390*c.cajas))::numeric(12,2) AS de_mas,
       COUNT(*) FILTER (WHERE c.pagado > 0)                         AS cajas_pagadas
  FROM caja c JOIN users u ON u.id = c.user_id
 GROUP BY c.guia, c.monto, c.cajas, c.user_id, u.full_name, u.box_id
HAVING SUM(c.cobrado) - GREATEST(c.monto, 390*c.cajas) > 0.5
   AND COUNT(*) FILTER (WHERE c.pagado > 0) = c.cajas
 ORDER BY 9 DESC`;

async function main() {
  const { rows } = await pool.query(SQL);

  // Las que ya recibieron su abono (por esta tarea o por la 492) no se repiten.
  const pendientes: any[] = [];
  for (const r of rows) {
    if (SOLO && String(r.guia) !== SOLO) continue;
    const ya = await pool.query(
      `SELECT 1 FROM financial_transactions
        WHERE user_id = $1 AND reference_type = 'saldo_a_favor'
          AND description LIKE '%' || $2 || '%' LIMIT 1`, [r.user_id, r.guia]);
    if (ya.rowCount) {
      console.log(`· ${r.guia} (${r.box_id}) ya tiene su abono de antes — se salta`);
      continue;
    }
    const previo = YA_COMPENSADO[String(r.guia)] || 0;
    if (previo > 0) {
      const resto = +(Number(r.de_mas) - previo).toFixed(2);
      console.log(`· ${r.guia} (${r.box_id}) ya recibió ${f(previo)} a mano; quedan ${f(resto)}`);
      if (resto <= 0.5) continue;
      r.de_mas = resto;
      r.previo = previo;
    }
    pendientes.push(r);
  }

  console.log('\nGUIA            CLIENTE                     NOTA      CAJAS   COBRADO     DEVOLVER');
  console.log('─'.repeat(86));
  for (const r of pendientes) {
    console.log(String(r.guia).padEnd(16) +
      `${r.box_id} ${r.full_name}`.slice(0, 26).padEnd(28) +
      f(r.nota).padStart(10) + '  ' + String(r.cajas).padStart(4) + '  ' +
      f(r.cobrado).padStart(10) + '  ' + f(r.de_mas).padStart(11));
  }
  const total = pendientes.reduce((n, r) => n + Number(r.de_mas), 0);
  console.log('─'.repeat(86));
  console.log(`${pendientes.length} guías · ${new Set(pendientes.map(r => r.user_id)).size} clientes · ${f(total)}\n`);

  if (!APLICAR) {
    console.log('Simulación: no se abonó nada. Corre con --aplicar.');
    await pool.end();
    return;
  }

  const cx = await pool.connect();
  try {
    await cx.query('BEGIN');
    for (const r of pendientes) {
      const monto = Number(r.de_mas);
      const motivo =
        `Saldo a favor por corrección tarea 542: el impuesto DHL de la guía ${r.guia} ` +
        `se cobró una vez por caja. La nota de aduana fue de ${f(Number(r.nota))} y en las ` +
        `${r.cajas} cajas se cobraron ${f(Number(r.cobrado))}; correspondían ` +
        `${f(Number(r.debio))}. ` +
        (r.previo
          ? `Ya se le habían aplicado ${f(Number(r.previo))} de descuento a mano, así que se ` +
            `devuelve el resto: ${f(monto)}. `
          : `Se devuelve la diferencia de ${f(monto)}. `) +
        `Autorizado por Aldo.`;

      await cx.query(
        `UPDATE users SET wallet_balance = COALESCE(wallet_balance,0) + $1 WHERE id = $2`,
        [monto, r.user_id]);
      const s = await cx.query('SELECT wallet_balance FROM users WHERE id = $1', [r.user_id]);
      await cx.query(
        `INSERT INTO financial_transactions
           (user_id, type, amount, balance_after, description, reference_type, created_at)
         VALUES ($1, 'adjustment'::tx_type, $2, $3, $4, 'saldo_a_favor', NOW())`,
        [r.user_id, monto, s.rows[0]?.wallet_balance ?? null, motivo]);
      console.log(`· ${r.guia}  ${r.box_id}  +${f(monto)}  → saldo ${f(Number(s.rows[0]?.wallet_balance ?? 0))}`);
    }
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
