// Run Belvo integration migration
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway'
});

async function runMigration() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'add_belvo_integration.sql'), 'utf8');
    await pool.query(sql);
    console.log('✅ Belvo integration migration completed successfully');
    
    // Verify tables
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name IN ('belvo_links', 'belvo_transactions', 'belvo_webhook_events')
      ORDER BY table_name
    `);
    console.log('📋 Created tables:', tables.rows.map(r => r.table_name));
    
    // Verify new columns
    const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'bank_statement_entries' AND column_name IN ('source', 'belvo_transaction_id')
    `);
    console.log('📋 New columns in bank_statement_entries:', cols.rows.map(r => r.column_name));

    const emitterCols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'fiscal_emitters' AND column_name LIKE 'belvo_%'
    `);
    console.log('📋 Belvo columns in fiscal_emitters:', emitterCols.rows.map(r => r.column_name));

  } catch (error) {
    console.error('❌ Migration error:', error.message);
  } finally {
    await pool.end();
  }
}

runMigration();
