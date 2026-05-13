const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='packages' AND column_name IN ('tracking','tracking_number','guia','guia_unica','merchandise_type','brand_type','applied_category')");
  console.log('cols:', cols.rows.map(c=>c.column_name));
  const r = await pool.query(`SELECT * FROM packages WHERE guia_unica='LOG26CNMX00754' OR guia='LOG26CNMX00754' LIMIT 1`);
  if (!r.rows[0]) { console.log('no encontrado'); await pool.end(); return; }
  const p = r.rows[0];
  console.log({
    guia_unica: p.guia_unica, guia: p.guia,
    merchandise_type: p.merchandise_type, brand_type: p.brand_type,
    applied_category: p.applied_category, applied_rate_per_cbm_usd: p.applied_rate_per_cbm_usd,
    cbm: p.cbm, weight: p.weight, status: p.status,
    monto: p.monto, monto_currency: p.monto_currency,
    maritime_sale_price_usd: p.maritime_sale_price_usd,
    assigned_cost_usd: p.assigned_cost_usd, assigned_cost_mxn: p.assigned_cost_mxn,
    servicio: p.servicio, descripcion: p.descripcion
  });
  await pool.end();
})().catch(e=>{console.error(e);process.exit(1)});
