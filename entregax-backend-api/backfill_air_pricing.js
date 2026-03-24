/**
 * Backfill air pricing for existing packages that have no price assigned.
 * This assigns frozen prices based on current tariffs (L/G) so future tariff 
 * changes won't affect these packages.
 * 
 * Run: node backfill_air_pricing.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function backfillAirPricing() {
  const client = await pool.connect();
  
  try {
    // 1. Get active air route
    const routeRes = await client.query(`
      SELECT id FROM air_routes WHERE is_active = true LIMIT 1
    `);
    
    if (routeRes.rows.length === 0) {
      console.log('❌ No active air route found. Cannot assign pricing.');
      return;
    }
    const airRouteId = routeRes.rows[0].id;
    console.log(`✅ Air route ID: ${airRouteId}`);

    // 2. Get current tariffs
    const tariffsRes = await client.query(`
      SELECT tariff_type, price_per_kg FROM air_tariffs 
      WHERE route_id = $1 AND is_active = true
    `, [airRouteId]);
    
    const tariffs = {};
    tariffsRes.rows.forEach(t => {
      tariffs[t.tariff_type] = parseFloat(t.price_per_kg);
    });
    console.log('📊 Current tariffs:', tariffs);

    // 3. Get all air packages without pricing
    const packagesRes = await client.query(`
      SELECT id, user_id, pro_name, weight, child_no, description
      FROM packages 
      WHERE service_type = 'AIR_CHN_MX' 
        AND (air_sale_price IS NULL OR air_sale_price = 0)
      ORDER BY created_at
    `);

    console.log(`\n📦 Found ${packagesRes.rows.length} air packages without pricing\n`);

    if (packagesRes.rows.length === 0) {
      console.log('✅ Nothing to backfill!');
      return;
    }

    // 4. Get custom client tariffs
    const customTariffsRes = await client.query(`
      SELECT user_id, tariff_type, price_per_kg FROM air_client_tariffs 
      WHERE route_id = $1 AND is_active = true
    `, [airRouteId]);
    
    const customTariffs = {};
    customTariffsRes.rows.forEach(ct => {
      const key = `${ct.user_id}_${ct.tariff_type}`;
      customTariffs[key] = parseFloat(ct.price_per_kg);
    });
    console.log('👤 Custom tariffs:', Object.keys(customTariffs).length, 'entries');

    // 5. Process each package
    let updated = 0;
    let skipped = 0;
    const stats = { L: 0, G: 0, S: 0, F: 0 };

    await client.query('BEGIN');

    for (const pkg of packagesRes.rows) {
      const proNameLower = (pkg.pro_name || pkg.description || '').toLowerCase();
      
      // Determine tariff type
      let tariffType = 'G'; // Default: Genérico
      if (proNameLower.includes('logo') || proNameLower.includes('鞋') || proNameLower.includes('zapato') || proNameLower.includes('shoes')) {
        tariffType = 'L';
      } else if (proNameLower.includes('medical') || proNameLower.includes('sensible') || proNameLower.includes('medicina')) {
        tariffType = 'S';
      }

      // Check for custom tariff first
      let pricePerKg = 0;
      let isCustom = false;
      
      if (pkg.user_id) {
        const customKey = `${pkg.user_id}_${tariffType}`;
        if (customTariffs[customKey]) {
          pricePerKg = customTariffs[customKey];
          isCustom = true;
        }
      }
      
      // Fall back to general tariff
      if (pricePerKg === 0 && tariffs[tariffType]) {
        pricePerKg = tariffs[tariffType];
      }

      if (pricePerKg === 0) {
        console.log(`  ⚠️ ${pkg.child_no}: No tariff found for type ${tariffType}, skipping`);
        skipped++;
        continue;
      }

      const weight = parseFloat(pkg.weight) || 0;
      const salePrice = weight * pricePerKg;

      await client.query(`
        UPDATE packages SET
          air_route_id = $1,
          air_tariff_type = $2,
          air_price_per_kg = $3,
          air_sale_price = $4,
          air_is_custom_tariff = $5,
          air_price_assigned_at = NOW()
        WHERE id = $6
      `, [airRouteId, tariffType, pricePerKg, salePrice, isCustom, pkg.id]);

      stats[tariffType]++;
      updated++;
      
      if (updated % 50 === 0) {
        console.log(`  ... processed ${updated}/${packagesRes.rows.length}`);
      }
    }

    await client.query('COMMIT');

    console.log(`\n✅ Backfill complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   By type: L(Logo)=${stats.L}, G(Genérico)=${stats.G}, S(Sensible)=${stats.S}, F(Flat)=${stats.F}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

backfillAirPricing();
