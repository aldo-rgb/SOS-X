const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const tiers = await pool.query(`
    SELECT pc.name AS category, pt.min_cbm, pt.max_cbm, pt.price, pt.is_flat_fee, pt.is_active
    FROM pricing_tiers pt
    JOIN pricing_categories pc ON pt.category_id = pc.id
    WHERE pc.name ILIKE '%logo%' OR pt.price BETWEEN 740 AND 760
    ORDER BY pc.name, pt.min_cbm
  `);
  console.log('Tiers candidatos ($740-760 / Logo):');
  console.table(tiers.rows);

  // Y la categoria Logotipo completa
  const logo = await pool.query(`
    SELECT pc.name, pt.min_cbm, pt.max_cbm, pt.price, pt.is_flat_fee
    FROM pricing_tiers pt
    JOIN pricing_categories pc ON pt.category_id = pc.id
    WHERE pc.name = 'Logotipo' AND pt.is_active=TRUE
    ORDER BY pt.min_cbm
  `);
  console.log('\nTodos los tiers Logotipo activos:');
  console.table(logo.rows);
  await pool.end();
})();
