const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'add_relabeling_panel.sql'), 'utf-8');
    await pool.query(sql);
    console.log('✅ Migration applied: add_relabeling_panel');

    // Check
    const r = await pool.query("SELECT * FROM admin_panels WHERE panel_key = 'ops_relabeling'");
    console.log('Panel:', r.rows[0]);
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
