// Run AWB Costs + CAJO migration
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://kmpsdeveloper@localhost:5432/entregax_db'
});

async function run() {
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', 'add_awb_costs_and_cajo.sql'),
      'utf-8'
    );
    await pool.query(sql);
    console.log('✅ Migration add_awb_costs_and_cajo.sql executed successfully');
    
    // Verify tables
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('cajo_guides', 'air_waybill_costs')
      ORDER BY table_name
    `);
    console.log('📋 Tables created:', tables.rows.map(r => r.table_name).join(', '));
    
    // Verify columns added to packages
    const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'packages' 
      AND column_name IN ('awb_cost_id', 'air_source')
    `);
    console.log('📋 Columns added to packages:', cols.rows.map(r => r.column_name).join(', '));
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    await pool.end();
  }
}

run();
