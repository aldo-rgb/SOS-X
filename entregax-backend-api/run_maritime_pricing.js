/**
 * Bulk assign prices to all maritime orders that have a container_id but no assigned_cost_usd.
 * Uses the same pricing logic as pricingEngine.assignPriceToMaritimeOrder().
 * 
 * Run: cd entregax-backend-api && npx ts-node run_maritime_pricing.ts
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  console.log('🚢 Bulk Maritime Pricing Assignment\n');

  // Get exchange rate
  const fxRes = await pool.query('SELECT rate FROM exchange_rates ORDER BY created_at DESC LIMIT 1');
  const fxRate = parseFloat(fxRes.rows[0]?.rate || '20.50');
  console.log(`💱 Exchange rate: $${fxRate} MXN/USD\n`);

  // Get all unprice orders with container
  const orders = await pool.query(`
    SELECT mo.id, mo.ordersn, mo.user_id, mo.shipping_mark,
           mo.summary_volume, mo.summary_weight, mo.summary_boxes,
           mo.merchandise_type, mo.container_id, mo.route_id,
           mo.assigned_cost_usd,
           c.type as container_type
    FROM maritime_orders mo
    LEFT JOIN containers c ON mo.container_id = c.id
    WHERE mo.container_id IS NOT NULL
      AND (mo.assigned_cost_usd IS NULL OR mo.assigned_cost_usd = 0)
    ORDER BY mo.id
  `);

  console.log(`📦 Found ${orders.rows.length} orders to price\n`);

  // Get pricing categories + tiers
  const cats = await pool.query(`
    SELECT pc.id, pc.name, pc.surcharge_per_cbm FROM pricing_categories pc
  `);
  const catMap = {};
  cats.rows.forEach(c => { catMap[c.name] = c; });

  const tiers = await pool.query(`
    SELECT pt.*, pc.name as category_name FROM pricing_tiers pt
    JOIN pricing_categories pc ON pt.category_id = pc.id
    WHERE pt.is_active = true
    ORDER BY pc.name, pt.min_cbm
  `);

  let priced = 0, skipped = 0, errors = 0;
  const results = [];

  for (const order of orders.rows) {
    try {
      const containerType = (order.container_type || 'LCL').toUpperCase();
      let finalPriceUsd = 0;
      let appliedCategory = '';
      let breakdown = '';

      // Resolve userId if needed
      let userId = order.user_id;
      if (!userId && order.shipping_mark) {
        const userByMark = await pool.query(
          'SELECT id FROM users WHERE UPPER(box_id) = UPPER($1) LIMIT 1',
          [order.shipping_mark]
        );
        userId = userByMark.rows[0]?.id || null;
      }

      if (containerType === 'FCL') {
        // FCL: client rate or base rate
        if (userId) {
          const lcRes = await pool.query(
            'SELECT id FROM legacy_clients WHERE box_id = (SELECT box_id FROM users WHERE id = $1) LIMIT 1',
            [userId]
          );
          const legacyClientId = lcRes.rows[0]?.id;
          if (legacyClientId) {
            const clientRate = await pool.query(`
              SELECT custom_price_usd, currency 
              FROM fcl_client_rates 
              WHERE legacy_client_id = $1 AND (route_id = $2 OR route_id IS NULL)
              ORDER BY route_id DESC NULLS LAST LIMIT 1
            `, [legacyClientId, order.route_id]);
            if (clientRate.rows.length > 0) {
              const rate = clientRate.rows[0];
              finalPriceUsd = rate.currency === 'MXN' 
                ? parseFloat(rate.custom_price_usd) / fxRate 
                : parseFloat(rate.custom_price_usd);
              appliedCategory = 'FCL (Cliente)';
              breakdown = `FCL tarifa cliente: $${rate.custom_price_usd} ${rate.currency}`;
            }
          }
        }
        if (finalPriceUsd === 0) {
          const fclTier = tiers.rows.find(t => t.category_name === 'FCL 40 Pies');
          if (fclTier) {
            finalPriceUsd = parseFloat(fclTier.price);
            appliedCategory = 'FCL 40 Pies';
            breakdown = `FCL tarifa base: $${fclTier.price} USD`;
          }
        }
      } else {
        // LCL pricing
        const cbm = parseFloat(order.summary_volume || '0');
        const weightKg = parseFloat(order.summary_weight || '0');

        if (cbm <= 0 && weightKg <= 0) {
          console.log(`  ⚠️ ${order.ordersn}: sin volumen ni peso, skip`);
          skipped++;
          continue;
        }

        const volumetricCbm = weightKg / 600;
        let chargeableCbm = Math.max(cbm, volumetricCbm);

        const typeMap = { 'generic': 'Generico', 'sensitive': 'Sensible', 'logo': 'Logotipo', 'startup': 'StartUp' };
        let categoryName = typeMap[order.merchandise_type || 'generic'] || 'Generico';

        if (chargeableCbm <= 0.75) {
          categoryName = 'StartUp';
        } else if (chargeableCbm >= 0.76 && chargeableCbm < 1) {
          chargeableCbm = 1;
        }

        const baseCat = categoryName === 'Logotipo' ? 'Generico' : categoryName;
        const surcharge = categoryName === 'Logotipo' ? 100 : 0;

        // Check VIP
        let isVip = false;
        if (userId) {
          const vipRes = await pool.query('SELECT is_vip_pricing FROM users WHERE id = $1', [userId]);
          isVip = vipRes.rows[0]?.is_vip_pricing === true;
        }

        // Find matching tier
        let matchingTier = null;
        const catTiers = tiers.rows.filter(t => t.category_name === baseCat);
        
        if (isVip && categoryName !== 'StartUp') {
          matchingTier = catTiers.sort((a, b) => parseFloat(a.price) - parseFloat(b.price))[0];
        } else {
          matchingTier = catTiers.find(t => 
            chargeableCbm >= parseFloat(t.min_cbm) && chargeableCbm <= parseFloat(t.max_cbm)
          );
        }

        if (!matchingTier) {
          console.log(`  ⚠️ ${order.ordersn}: no tier for ${chargeableCbm.toFixed(3)} CBM in ${categoryName}, skip`);
          skipped++;
          continue;
        }

        if (matchingTier.is_flat_fee) {
          finalPriceUsd = parseFloat(matchingTier.price);
          appliedCategory = 'StartUp';
          breakdown = `StartUp flat: $${matchingTier.price} USD (${chargeableCbm.toFixed(3)} m³)`;
        } else {
          const ratePerCbm = parseFloat(matchingTier.price) + surcharge;
          finalPriceUsd = chargeableCbm * ratePerCbm;
          appliedCategory = categoryName;
          breakdown = `${chargeableCbm.toFixed(3)} m³ × $${ratePerCbm}/m³ = $${finalPriceUsd.toFixed(2)} USD`;
          if (isVip) breakdown += ' (VIP)';
        }
      }

      if (finalPriceUsd <= 0) {
        console.log(`  ⚠️ ${order.ordersn}: price = $0, skip`);
        skipped++;
        continue;
      }

      const finalPriceMxn = finalPriceUsd * fxRate;

      // Save
      await pool.query(`
        UPDATE maritime_orders SET
          assigned_cost_usd = $1,
          assigned_cost_mxn = $2,
          saldo_pendiente = $2,
          cost_assigned_at = NOW(),
          cost_assigned_by = 1,
          registered_exchange_rate = $3,
          payment_status = 'pending'
        WHERE id = $4
      `, [finalPriceUsd.toFixed(2), finalPriceMxn.toFixed(2), fxRate.toFixed(4), order.id]);

      priced++;
      results.push({ ordersn: order.ordersn, usd: finalPriceUsd.toFixed(2), mxn: finalPriceMxn.toFixed(2), category: appliedCategory });
      
      if (priced <= 20) {
        console.log(`  💰 ${order.ordersn}: $${finalPriceUsd.toFixed(2)} USD / $${finalPriceMxn.toFixed(2)} MXN [${appliedCategory}] ${breakdown}`);
      }
    } catch (err) {
      errors++;
      console.log(`  ❌ ${order.ordersn}: ${err.message}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Priced: ${priced}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`❌ Errors: ${errors}`);
  console.log(`📊 Total: ${orders.rows.length}`);

  // Summary stats
  if (results.length > 0) {
    const totalUsd = results.reduce((s, r) => s + parseFloat(r.usd), 0);
    const totalMxn = results.reduce((s, r) => s + parseFloat(r.mxn), 0);
    console.log(`\n💰 Total priced: $${totalUsd.toFixed(2)} USD / $${totalMxn.toFixed(2)} MXN`);
  }

  // Verify
  const verify = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN assigned_cost_usd > 0 THEN 1 END) as with_price,
      COUNT(CASE WHEN assigned_cost_usd IS NULL OR assigned_cost_usd = 0 THEN 1 END) as without_price
    FROM maritime_orders WHERE container_id IS NOT NULL
  `);
  console.log('\n📊 Final state:');
  console.table(verify.rows);

  await pool.end();
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
