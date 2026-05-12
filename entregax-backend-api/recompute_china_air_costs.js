/**
 * 🔁 Recalcula costos de Aéreo China usando tarifario oficial.
 *   Para cada package no pagado bajo china_receipt:
 *     - Si tariff_type ∈ {L,G,F}: USD/kg = tarifario(cliente→general); sale = weight × USD/kg
 *     - Si tariff_type = 'SU' (Startup): NO tocar (precios fijos por rango de peso)
 *     - Si tariff_type = 'S' o NULL: dejar como está (Sensible es manual, NULL no aplica)
 *   Luego china_receipts.assigned_cost_mxn = SUM(packages.air_sale_price USD)
 *   Y saldo_pendiente (MXN) = USD × FX − monto_pagado.
 *
 * Uso:
 *   node recompute_china_air_costs.js                  → dry-run
 *   node recompute_china_air_costs.js --apply
 *   node recompute_china_air_costs.js --apply --user 82
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const APPLY = process.argv.includes('--apply');
const userIdx = process.argv.indexOf('--user');
const ONLY_USER = userIdx > -1 ? Number(process.argv[userIdx + 1]) : null;

(async () => {
  const c = await pool.connect();
  try {
    const fx = (await c.query(`SELECT tipo_cambio_final FROM exchange_rate_config WHERE servicio='maritimo' LIMIT 1`)).rows[0]?.tipo_cambio_final;
    const FX = fx ? parseFloat(fx) : 0;
    console.log(`💱 FX (maritimo): ${FX || '(no config)'}\n`);

    const baseRows = (await c.query(`SELECT tariff_type, price_per_kg FROM air_tariffs WHERE route_id=1 AND is_active=true`)).rows;
    const BASE = {};
    baseRows.forEach(r => { BASE[r.tariff_type] = parseFloat(r.price_per_kg); });
    console.log(`📋 Tarifas base ruta 1:`, BASE);

    const tariffCache = new Map();
    async function getTariffs(userId, boxId) {
      const k = `${userId}|${boxId || ''}`;
      if (tariffCache.has(k)) return tariffCache.get(k);
      let legacyId = null;
      if (boxId) {
        const lc = await c.query(`SELECT id FROM legacy_clients WHERE UPPER(box_id)=UPPER($1) LIMIT 1`, [boxId]);
        if (lc.rows[0]) legacyId = lc.rows[0].id;
      }
      const ct = await c.query(
        `SELECT tariff_type, price_per_kg FROM air_client_tariffs
         WHERE (user_id=$1 OR ($2::int IS NOT NULL AND legacy_client_id=$2::int))
           AND route_id=1 AND is_active=true
         ORDER BY (user_id=$1) DESC`,
        [userId, legacyId]
      );
      const map = { ...BASE };
      const seen = new Set();
      for (const r of ct.rows) {
        if (!seen.has(r.tariff_type)) {
          map[r.tariff_type] = parseFloat(r.price_per_kg);
          seen.add(r.tariff_type);
        }
      }
      tariffCache.set(k, map);
      return map;
    }

    const filterUser = ONLY_USER ? `AND cr.user_id = ${ONLY_USER}` : '';
    const recs = (await c.query(`
      SELECT cr.id, cr.fno, cr.user_id, cr.total_weight, cr.assigned_cost_mxn,
             cr.saldo_pendiente, cr.monto_pagado, cr.payment_status,
             u.box_id
      FROM china_receipts cr
      LEFT JOIN users u ON cr.user_id = u.id
      WHERE cr.user_id IS NOT NULL
        ${filterUser}
      ORDER BY cr.id
    `)).rows;
    console.log(`\n📋 ${recs.length} china_receipts a evaluar\n`);

    let pkgUpd = 0, pkgSkip = 0, pkgPaid = 0, pkgSU = 0;
    let recUpd = 0, recSkip = 0, recPaid = 0;

    for (const r of recs) {
      const paid = parseFloat(r.monto_pagado || 0);
      const recIsPaid = r.payment_status === 'paid' || paid > 0;
      if (recIsPaid) { recPaid++; continue; }

      const tariffs = await getTariffs(r.user_id, r.box_id);
      const pkgs = (await c.query(
        `SELECT id, weight, air_tariff_type, air_price_per_kg, air_sale_price,
                monto_pagado, payment_status
         FROM packages
         WHERE china_receipt_id = $1 AND weight IS NOT NULL AND weight::numeric > 0`,
        [r.id]
      )).rows;
      if (pkgs.length === 0) continue;

      let recChanged = false;
      let totalUsd = 0;
      for (const p of pkgs) {
        const ppaid = parseFloat(p.monto_pagado || 0);
        if (p.payment_status === 'paid' || ppaid > 0) {
          pkgPaid++;
          totalUsd += parseFloat(p.air_sale_price || 0);
          continue;
        }
        const tt = p.air_tariff_type;
        // SU (Startup) y S (Sensible) usan precios manuales / por rango → no recalcular
        if (tt === 'SU' || tt === 'S' || !tt) {
          pkgSU++;
          totalUsd += parseFloat(p.air_sale_price || 0);
          continue;
        }
        const perKg = tariffs[tt];
        if (!perKg || perKg <= 0) { pkgSkip++; totalUsd += parseFloat(p.air_sale_price || 0); continue; }
        const w = parseFloat(p.weight);
        const newSale = +(w * perKg).toFixed(2);
        const oldSale = parseFloat(p.air_sale_price || 0);
        totalUsd += newSale;
        if (Math.abs(oldSale - newSale) < 0.01) { pkgSkip++; continue; }
        if (APPLY) {
          await c.query(
            `UPDATE packages SET air_price_per_kg=$1, air_sale_price=$2 WHERE id=$3`,
            [perKg, newSale, p.id]
          );
        }
        pkgUpd++;
        recChanged = true;
      }

      // Actualizar china_receipts con la suma real
      const newRecUsd = +totalUsd.toFixed(2);
      const newRecMxn = FX > 0 ? +(newRecUsd * FX).toFixed(2) : newRecUsd;
      const newSaldo = Math.max(0, +(newRecMxn - paid).toFixed(2));
      const oldRecStored = r.assigned_cost_mxn ? parseFloat(r.assigned_cost_mxn) : 0;
      if (Math.abs(oldRecStored - newRecUsd) > 0.01 || recChanged) {
        console.log(`📋 #${r.id} ${r.fno} (u${r.user_id}/${r.box_id || '-'}): $${oldRecStored.toFixed(2)} → $${newRecUsd.toFixed(2)} USD  (saldo MXN: ${newSaldo.toFixed(2)})`);
        if (APPLY) {
          await c.query(
            `UPDATE china_receipts SET assigned_cost_mxn=$1, saldo_pendiente=$2 WHERE id=$3`,
            [newRecUsd, newSaldo, r.id]
          );
        }
        recUpd++;
      } else {
        recSkip++;
      }
    }

    console.log(`\n📊 packages: ${pkgUpd} actualizados · ${pkgSkip} sin cambios · ${pkgSU} SU/S/null (skip) · ${pkgPaid} pagados`);
    console.log(`📊 china_receipts: ${recUpd} actualizados · ${recSkip} sin cambios · ${recPaid} pagados`);
    console.log(APPLY ? '\n✅ Aplicado.' : '\n⚠️  DRY-RUN. Re-ejecuta con --apply');
  } finally {
    c.release();
    await pool.end();
  }
})().catch(e => { console.error('❌', e); process.exit(1); });
