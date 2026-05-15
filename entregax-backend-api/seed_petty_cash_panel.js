const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  await pool.query(`
    INSERT INTO admin_panels (panel_key, panel_name, category, icon, description, is_active, sort_order)
    VALUES ('admin_petty_cash', 'Caja Chica Sucursales', 'admin', 'LocalAtm', 'Fondeo, anticipos, viáticos y comprobaciones por sucursal', TRUE, 22)
    ON CONFLICT (panel_key) DO UPDATE SET
      panel_name = EXCLUDED.panel_name,
      description = EXCLUDED.description,
      icon = EXCLUDED.icon,
      category = EXCLUDED.category
  `);
  console.log('✅ Panel admin_petty_cash registrado');
  await pool.end();
})();
