// Diagnóstico orden RO-602601A0
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  console.log('=== fiscal_emitters configurados con cuenta ===');
  const fe = await pool.query(`
    SELECT id, alias, business_name, bank_name, bank_clabe, bank_account
      FROM fiscal_emitters
     ORDER BY id`);
  console.table(fe.rows);

  console.log('\n=== service_company_config ===');
  const scc = await pool.query(`
    SELECT scc.service_type, scc.emitter_id, scc.is_active,
           fe.alias, fe.bank_name, fe.bank_clabe
      FROM service_company_config scc
      LEFT JOIN fiscal_emitters fe ON fe.id = scc.emitter_id
     ORDER BY scc.service_type, scc.is_active DESC`);
  console.table(scc.rows);

  console.log('\n=== ORDEN RO-602601A0 ===');
  const apo = await pool.query(`
    SELECT id, folio, payment_reference, service_type_cfg, pobox_payment_id, total_mxn
      FROM advisor_payment_orders WHERE payment_reference = 'RO-602601A0'`);
  console.table(apo.rows);

  console.log('\n=== pobox_payment correspondiente ===');
  if (apo.rows[0]?.pobox_payment_id) {
    const pp = await pool.query(`
      SELECT id, payment_reference, status, payment_method, amount, package_ids
        FROM pobox_payments WHERE id = $1`, [apo.rows[0].pobox_payment_id]);
    console.table(pp.rows);
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
