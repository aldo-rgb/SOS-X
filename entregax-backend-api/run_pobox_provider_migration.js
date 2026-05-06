/**
 * Aplica la migración add_pobox_provider_cost.sql
 * Uso: node run_pobox_provider_migration.js [--dry-run]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DRY = process.argv.includes('--dry-run');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'add_pobox_provider_cost.sql'), 'utf8');
  const client = await pool.connect();
  try {
    console.log(`📦 Migración pobox_provider_cost — modo: ${DRY ? 'DRY-RUN' : 'APLICAR'}`);
    await client.query('BEGIN');

    // Stats antes (sin columnas nuevas)
    const before = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE pobox_service_cost > 0) AS con_service,
        COUNT(*) FILTER (WHERE pobox_venta_usd > 0)    AS con_venta,
        COUNT(*) FILTER (WHERE is_master = TRUE)       AS masters,
        COUNT(*)                                       AS total
      FROM packages
    `);
    console.log('ANTES:', before.rows[0]);

    await client.query(sql);

    // Stats después
    const after = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE pobox_service_cost > 0)              AS con_service,
        COUNT(*) FILTER (WHERE pobox_provider_cost_mxn IS NOT NULL) AS con_provider_mxn,
        COUNT(*) FILTER (WHERE pobox_venta_usd > 0)                 AS con_venta
      FROM packages
    `);
    console.log('DESPUÉS:', after.rows[0]);

    // Sample del master 1894
    const sample = await client.query(`
      SELECT id, is_master, master_id,
             pobox_service_cost, pobox_provider_cost_mxn,
             pobox_venta_usd, pobox_cost_usd, pobox_provider_cost_usd,
             pobox_tarifa_nivel, registered_exchange_rate
      FROM packages WHERE id = 1894 OR master_id = 1894 ORDER BY id
    `);
    console.log('Master 1894 + hijas:');
    console.table(sample.rows);

    if (DRY) {
      await client.query('ROLLBACK');
      console.log('🔄 ROLLBACK (dry-run)');
    } else {
      await client.query('COMMIT');
      console.log('✅ COMMIT aplicado');
    }
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
