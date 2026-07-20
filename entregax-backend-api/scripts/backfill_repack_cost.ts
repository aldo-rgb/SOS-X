import 'dotenv/config';
import { pool } from '../src/db';
import { calculatePOBoxCost } from '../src/packageController';

// Recomputa el costo de PROVEEDOR de las repacks existentes por el TAMAÑO FINAL
// de la caja (misma tarifa que un paquete individual). Solo toca repacks con
// pobox_provider_cost_usd NULL y no pagadas.
(async () => {
  const { rows } = await pool.query(`
    SELECT id, tracking_internal, weight, pkg_length, pkg_width, pkg_height
      FROM packages
     WHERE is_master = TRUE
       AND COALESCE(total_boxes, 1) > 1
       AND tracking_internal ILIKE 'US-REPACK-%'
       AND pobox_provider_cost_usd IS NULL
       AND COALESCE(costing_paid, FALSE) = FALSE
     ORDER BY id ASC
  `);
  console.log(`Repacks a recalcular: ${rows.length}`);
  let ok = 0, skip = 0;
  for (const r of rows) {
    const L = Number(r.pkg_length) || 0, W = Number(r.pkg_width) || 0, H = Number(r.pkg_height) || 0;
    const wgt = Number(r.weight) || 0;
    if (!L || !W || !H) { console.log(`  SKIP ${r.tracking_internal} (sin medidas)`); skip++; continue; }
    const volumetric = (L * W * H) / 5000;
    const billed = Math.max(wgt, volumetric);
    let cost: any;
    try {
      cost = await calculatePOBoxCost(pool as any, [{ length: L, width: W, height: H, weight: billed }] as any);
    } catch (e: any) {
      console.log(`  SKIP ${r.tracking_internal} (calc error: ${e.message})`); skip++; continue;
    }
    const usd = Number(cost.poboxCostUsd || 0);
    const mxn = Number(cost.poboxServiceCost || (usd * (cost.registeredExchangeRate || 0)) || 0);
    if (usd <= 0) { console.log(`  SKIP ${r.tracking_internal} (costo 0)`); skip++; continue; }
    const APPLY = process.env.APPLY === '1';
    if (APPLY) {
      await pool.query(
        `UPDATE packages SET pobox_provider_cost_usd = $2, pobox_provider_cost_mxn = $3, updated_at = NOW() WHERE id = $1`,
        [r.id, usd.toFixed(2), mxn.toFixed(2)]
      );
    }
    console.log(`  ${APPLY ? 'OK' : 'DRY'} ${r.tracking_internal} (${L}x${W}x${H}, ${billed.toFixed(1)}) → $${usd.toFixed(2)} USD / $${mxn.toFixed(2)} MXN`);
    ok++;
  }
  console.log(`\nHecho. Actualizadas: ${ok} · Omitidas: ${skip}`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
