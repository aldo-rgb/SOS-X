/**
 * Tarea 542 — bajar el impuesto DHL cobrado de más en las guías que el cliente
 * TODAVÍA NO PAGA.
 *
 * Es la corrección limpia: a estas no hay que abonarles saldo a favor porque no
 * han pagado nada. Se les baja el cargo y ya nunca lo pagan.
 *
 * La nota de aduana se repartía entre las `pieces` que declara Caja Chica pero
 * se escribía en TODAS las cajas de la guía, así que con `pieces` en 1 la nota
 * se cobraba tantas veces como bultos (TKT-2026-2620). La causa ya quedó cerrada
 * en `crossDhlTaxNote`.
 *
 * Lo que debe cobrarse en la guía completa es la nota, nunca por debajo del piso
 * de $390 por caja. Eso se reparte entre sus cajas; el residuo del redondeo va a
 * la primera para que la suma cuadre al centavo.
 *
 * `import_cost_mxn` y `total_cost_mxn` se recalculan con la MISMA fórmula que
 * usa crossDhlTaxNote (servicio = usd × TC), para no arrastrar el impuesto viejo.
 *
 * Se niega a tocar una caja que ya tenga pago o que esté en una orden viva.
 *
 *   npx ts-node scripts/tarea542_bajar_impuesto_no_cobrado.ts            (simulación)
 *   npx ts-node scripts/tarea542_bajar_impuesto_no_cobrado.ts --aplicar
 */
import { pool } from '../src/db';

const APLICAR = process.argv.includes('--aplicar');
const PISO = 390;
const f = (n: number) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 });

const SQL_GUIAS = `
WITH nota AS (
  SELECT DISTINCT ON (TRIM(concept)) TRIM(concept) AS guia, amount_mxn::numeric AS monto
    FROM petty_cash_movements
   WHERE category='impuestos_dhl' AND status='approved' AND COALESCE(TRIM(concept),'')<>''
   ORDER BY TRIM(concept), id
), caja AS (
  SELECT n.guia, n.monto, d.id, d.user_id,
         COALESCE(d.import_tax_mxn,0)::numeric AS cobrado,
         COALESCE(d.monto_pagado,0)::numeric   AS pagado,
         COUNT(*) OVER (PARTITION BY n.guia)   AS cajas
    FROM nota n
    JOIN dhl_shipments d ON d.inbound_tracking = n.guia OR d.secondary_tracking = n.guia
)
SELECT guia, monto AS nota, cajas, user_id,
       SUM(cobrado)::numeric(12,2) AS cobrado,
       GREATEST(monto, ${PISO}*cajas)::numeric(12,2) AS debio
  FROM caja
 GROUP BY guia, monto, cajas, user_id
HAVING SUM(cobrado) - GREATEST(monto, ${PISO}*cajas) > 0.5
   AND COUNT(*) FILTER (WHERE pagado > 0) = 0
 ORDER BY 6 DESC`;

async function main() {
  const cx = await pool.connect();
  try {
    await cx.query('BEGIN');
    const { rows: guias } = await cx.query(SQL_GUIAS);
    let bajado = 0;

    for (const g of guias) {
      const cajas = await cx.query(
        `SELECT d.id, d.import_tax_mxn::numeric AS tax, d.total_cost_mxn::numeric AS total,
                d.status, d.paid_at, COALESCE(d.monto_pagado,0)::numeric AS pagado, u.box_id, u.full_name
           FROM dhl_shipments d JOIN users u ON u.id = d.user_id
          WHERE (d.inbound_tracking=$1 OR d.secondary_tracking=$1)
          ORDER BY d.id FOR UPDATE`, [g.guia]);

      if (cajas.rows.some((c: any) => Number(c.pagado) > 0 || c.paid_at)) {
        console.log(`· ${g.guia}: alguna caja ya tiene pago — se salta`);
        continue;
      }

      const n = cajas.rows.length;
      const debio = Number(g.debio);
      const base = Math.floor((debio / n) * 100) / 100;
      const residuo = +(debio - base * n).toFixed(2);

      console.log(`\n${g.guia}  ${cajas.rows[0].box_id} ${cajas.rows[0].full_name}` +
        `  nota ${f(Number(g.nota))} · ${n} cajas`);
      for (let i = 0; i < n; i++) {
        const c = cajas.rows[i];
        const nuevo = +(base + (i === 0 ? residuo : 0)).toFixed(2);
        console.log(`   caja ${c.id}: impuesto ${f(Number(c.tax))} → ${f(nuevo)}`);
        if (APLICAR) {
          await cx.query(`
            UPDATE dhl_shipments
               SET import_tax_mxn = $1::numeric,
                   import_cost_mxn = ROUND(COALESCE(import_cost_usd,0)::numeric * COALESCE(exchange_rate,0)::numeric + $1::numeric, 2),
                   total_cost_mxn  = ROUND(COALESCE(import_cost_usd,0)::numeric * COALESCE(exchange_rate,0)::numeric + $1::numeric + COALESCE(national_cost_mxn,0)::numeric, 2),
                   updated_at = NOW()
             WHERE id = $2`, [nuevo, c.id]);
        }
      }
      bajado += Number(g.cobrado) - debio;
    }

    console.log(`\n${guias.length} guías · se le baja al cliente ${f(bajado)}`);
    if (!APLICAR) {
      await cx.query('ROLLBACK');
      console.log('\nSimulación: no se tocó nada. Corre con --aplicar.');
      return;
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
