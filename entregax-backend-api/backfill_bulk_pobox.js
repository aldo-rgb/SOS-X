/**
 * Backfill: rellena pobox_* en hijas de bulk masters que quedaron en 0.
 * Reusa exactamente la lógica de calculatePOBoxCost del controller.
 *
 * Uso: node backfill_bulk_pobox.js [--dry-run] [--master-id=2066]
 */
require('dotenv').config();
const { Pool } = require('pg');

const DRY = process.argv.includes('--dry-run');
const masterArg = process.argv.find((a) => a.startsWith('--master-id='));
const targetMaster = masterArg ? parseInt(masterArg.split('=')[1], 10) : null;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function loadConfig(client) {
  const cfg = await client.query(
    'SELECT * FROM pobox_costing_config WHERE is_active = TRUE LIMIT 1'
  );
  const config = cfg.rows[0] || { dimensional_divisor: 10780, base_rate: 75, min_cost: 10 };

  const tcRow = await client.query(
    "SELECT tipo_cambio_final FROM exchange_rate_config WHERE servicio = 'pobox_usa' AND estado = TRUE LIMIT 1"
  );
  const tcFinal = parseFloat(tcRow.rows[0]?.tipo_cambio_final) || 17.65;

  const tar = await client.query(
    'SELECT * FROM pobox_tarifas_volumen WHERE estado = TRUE ORDER BY nivel'
  );
  return { config, tcFinal, tarifas: tar.rows };
}

function calcOneBox({ config, tcFinal, tarifas }, { length, width, height }) {
  const l = parseFloat(length) || 0;
  const w = parseFloat(width)  || 0;
  const h = parseFloat(height) || 0;

  const boxCbm = (l * w * h) / 1_000_000;
  let cbmTar = boxCbm < 0.010 ? 0.010 : boxCbm;

  let nivel = 1, ventaUsd = 0;
  for (const t of tarifas) {
    const cMin = parseFloat(t.cbm_min) || 0;
    const cMax = t.cbm_max ? parseFloat(t.cbm_max) : Infinity;
    if (cbmTar >= cMin && cbmTar <= cMax) {
      nivel = t.nivel;
      if (t.tipo_cobro === 'fijo') {
        ventaUsd = parseFloat(t.costo);
      } else {
        ventaUsd = cbmTar * parseFloat(t.costo);
        const prev = tarifas.find((x) => x.nivel === t.nivel - 1);
        if (prev && ventaUsd < parseFloat(prev.costo)) ventaUsd = parseFloat(prev.costo);
      }
      break;
    }
  }

  const lp = l / 2.54, wp = w / 2.54, hp = h / 2.54;
  const pie3 = (lp * wp * hp) / parseFloat(config.dimensional_divisor);
  let costUsd = pie3 * parseFloat(config.base_rate);
  let costMxn = costUsd * tcFinal;
  const minCost = parseFloat(config.min_cost) || 10;
  if (costMxn < minCost) {
    costMxn = minCost;
    costUsd = minCost / tcFinal;
  }

  return {
    poboxCostUsd: Math.round(costUsd * 100) / 100,
    poboxProviderCostMxn: Math.round(costMxn * 100) / 100,
    precioVentaUsd: Math.round(ventaUsd * 100) / 100,
    poboxServiceCostMxn: Math.round(ventaUsd * tcFinal * 100) / 100,
    nivelTarifa: nivel,
    registeredExchangeRate: tcFinal,
    cbm: Math.round(boxCbm * 10000) / 10000,
  };
}

(async () => {
  const client = await pool.connect();
  try {
    console.log(`🔧 Backfill bulk PO Box — modo: ${DRY ? 'DRY-RUN' : 'APLICAR'}`);
    if (targetMaster) console.log(`   Limitado al master ${targetMaster}`);

    const ctx = await loadConfig(client);
    console.log(`   TC=${ctx.tcFinal}, base_rate=${ctx.config.base_rate}, divisor=${ctx.config.dimensional_divisor}`);
    console.log(`   ${ctx.tarifas.length} tarifas: ${ctx.tarifas.map(t => `N${t.nivel}=${t.tipo_cobro}/$${t.costo}`).join(', ')}`);

    const filter = targetMaster ? `AND m.id = ${targetMaster}` : '';
    const masters = await client.query(`
      SELECT m.id, m.tracking_internal, m.total_boxes
      FROM packages m
      WHERE m.is_master = TRUE
        AND COALESCE(m.service_type, 'POBOX_USA') = 'POBOX_USA'
        ${filter}
        AND EXISTS (
          SELECT 1 FROM packages c
          WHERE c.master_id = m.id
            AND (c.pobox_service_cost IS NULL OR c.pobox_service_cost = 0)
        )
      ORDER BY m.id
    `);
    console.log(`📦 Masters a procesar: ${masters.rows.length}`);
    if (masters.rows.length === 0) { client.release(); await pool.end(); return; }

    await client.query('BEGIN');

    for (const m of masters.rows) {
      const children = await client.query(
        `SELECT id, weight, pkg_length, pkg_width, pkg_height, pobox_service_cost
         FROM packages WHERE master_id = $1 ORDER BY box_number`,
        [m.id]
      );

      let touched = 0, skipped = 0;
      for (const ch of children.rows) {
        if (parseFloat(ch.pobox_service_cost) > 0) continue;
        if (!ch.pkg_length || !ch.pkg_width || !ch.pkg_height) {
          skipped++; continue;
        }
        const r = calcOneBox(ctx, {
          length: ch.pkg_length, width: ch.pkg_width, height: ch.pkg_height,
        });
        await client.query(
          `UPDATE packages SET
             pobox_service_cost      = $2,
             pobox_provider_cost_mxn = $3,
             pobox_provider_cost_usd = $4,
             pobox_cost_usd          = $4,
             pobox_venta_usd         = $5,
             pobox_tarifa_nivel      = $6,
             registered_exchange_rate = $7,
             single_cbm              = $8,
             updated_at              = NOW()
           WHERE id = $1`,
          [ch.id, r.poboxServiceCostMxn, r.poboxProviderCostMxn, r.poboxCostUsd,
           r.precioVentaUsd, r.nivelTarifa, r.registeredExchangeRate, r.cbm]
        );
        touched++;
      }

      await client.query(
        `UPDATE packages SET
           pobox_service_cost      = COALESCE((SELECT SUM(pobox_service_cost)      FROM packages WHERE master_id = $1), 0),
           pobox_provider_cost_mxn = COALESCE((SELECT SUM(pobox_provider_cost_mxn) FROM packages WHERE master_id = $1), 0),
           pobox_provider_cost_usd = COALESCE((SELECT SUM(pobox_provider_cost_usd) FROM packages WHERE master_id = $1), 0),
           pobox_cost_usd          = COALESCE((SELECT SUM(pobox_provider_cost_usd) FROM packages WHERE master_id = $1), 0),
           pobox_venta_usd         = COALESCE((SELECT SUM(pobox_venta_usd)         FROM packages WHERE master_id = $1), 0),
           weight                  = COALESCE((SELECT SUM(weight)                  FROM packages WHERE master_id = $1), 0),
           registered_exchange_rate = COALESCE((SELECT MAX(registered_exchange_rate) FROM packages WHERE master_id = $1 AND registered_exchange_rate > 0), registered_exchange_rate),
           updated_at = NOW()
         WHERE id = $1`,
        [m.id]
      );

      console.log(`   ✓ Master ${m.id} (${m.tracking_internal}): ${touched} ok, ${skipped} sin dimensiones`);
    }

    if (DRY) {
      await client.query('ROLLBACK');
      console.log('🔄 ROLLBACK (dry-run)');
    } else {
      await client.query('COMMIT');
      console.log('✅ COMMIT aplicado');
    }

    if (masters.rows.length > 0) {
      const sid = masters.rows[0].id;
      const r = await pool.query(
        `SELECT id,is_master,pobox_service_cost,pobox_provider_cost_mxn,pobox_venta_usd,pobox_tarifa_nivel,registered_exchange_rate
         FROM packages WHERE id = $1 OR master_id = $1 ORDER BY id`,
        [sid]
      );
      console.log(`\nSample master ${sid}:`);
      console.table(r.rows);
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
