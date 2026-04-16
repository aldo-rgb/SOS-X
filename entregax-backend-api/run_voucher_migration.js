/**
 * Run payment vouchers + service wallet migration
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'add_payment_vouchers.sql'), 'utf8');
    console.log('🚀 Running payment vouchers migration...');
    await client.query(sql);
    console.log('✅ Migration completed successfully!');
    
    // Verify tables
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('payment_vouchers', 'billetera_servicio', 'billetera_servicio_transacciones')
      ORDER BY table_name
    `);
    console.log('📋 Created tables:', tables.rows.map(r => r.table_name).join(', '));
    
    // Verify columns added to pobox_payments
    const cols = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'pobox_payments' AND column_name IN ('voucher_total', 'voucher_count', 'surplus_amount', 'surplus_credited')
      ORDER BY column_name
    `);
    console.log('📋 New pobox_payments columns:', cols.rows.map(r => r.column_name).join(', '));
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
