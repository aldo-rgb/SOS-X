const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'accounting_inventory.sql'), 'utf8');
    await pool.query(sql);
    console.log('✅ Migration accounting_inventory ejecutada');
    const r = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'accounting%' ORDER BY table_name");
    console.log('Tablas accounting_*:', r.rows.map(x => x.table_name));
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
