const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', 'rename_scanner_unificado_to_multi_sucursal.sql'),
      'utf-8'
    );
    await pool.query(sql);
    console.log('✅ Migration applied: rename_scanner_unificado_to_multi_sucursal');

    const r = await pool.query("SELECT panel_key, panel_name, description, icon FROM admin_panels WHERE panel_key = 'ops_scanner'");
    console.log('Panel actualizado:', r.rows[0]);
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
