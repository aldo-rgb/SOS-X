const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'add_pobox_wallet_applied.sql'), 'utf8');
    console.log('🚀 Running pobox wallet_applied migration...');
    await client.query(sql);
    const cols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pobox_payments' AND column_name IN ('wallet_applied','wallet_applied_at')
      ORDER BY column_name
    `);
    console.log('✅ Columns:', cols.rows.map(r => r.column_name).join(', '));
  } catch (e) {
    console.error('❌', e.message);
  } finally {
    client.release();
    process.exit(0);
  }
})();
