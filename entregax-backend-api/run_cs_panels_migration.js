const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'add_cs_panels.sql'), 'utf-8');
    await pool.query(sql);
    console.log('✅ Migration applied: add_cs_panels');

    const r = await pool.query("SELECT panel_key, panel_name, sort_order FROM admin_panels WHERE category = 'customer_service' ORDER BY sort_order");
    console.log('Paneles de Servicio a Cliente:');
    r.rows.forEach(p => console.log(`  ${p.sort_order}. ${p.panel_key} → ${p.panel_name}`));
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
