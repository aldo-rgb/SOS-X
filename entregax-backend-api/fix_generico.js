const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const cat = await pool.query("SELECT id FROM pricing_categories WHERE name='Generico'");
  const catId = cat.rows[0].id;
  console.log('Generico id =', catId);
  const before = await pool.query("SELECT id,min_cbm,max_cbm,price,notes FROM pricing_tiers WHERE category_id=$1 ORDER BY min_cbm",[catId]);
  console.log('ANTES:'); before.rows.forEach(r=>console.log(r));
  // 1) actualizar la ultima (>=9999) a $649
  await pool.query("UPDATE pricing_tiers SET price=649 WHERE category_id=$1 AND max_cbm>=9999",[catId]);
  // 2) insertar 15.01 - 20.00 en $699
  await pool.query(`INSERT INTO pricing_tiers (category_id,min_cbm,max_cbm,price,is_flat_fee,is_active,notes) VALUES ($1,15.01,20.00,699,false,true,'Mayoreo grande')`,[catId]);
  const after = await pool.query("SELECT id,min_cbm,max_cbm,price,notes FROM pricing_tiers WHERE category_id=$1 ORDER BY min_cbm",[catId]);
  console.log('DESPUES:'); after.rows.forEach(r=>console.log(r));
  await pool.end();
})().catch(e=>{console.error(e);process.exit(1)});
