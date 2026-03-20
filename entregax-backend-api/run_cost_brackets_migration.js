const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const sql = fs.readFileSync('./migrations/add_air_cost_brackets.sql', 'utf8');
  console.log('Running migration: add_air_cost_brackets.sql');
  await pool.query(sql);
  console.log('✅ Migration completed successfully!');
  
  // Verify
  const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'air_cost_brackets' ORDER BY ordinal_position");
  console.log('Table columns:', res.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));
  
  await pool.end();
}

run().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
