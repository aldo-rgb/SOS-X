// Diagnóstico orden US-9180166640: fechas, dirección, RO de pago
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway',
  ssl: { rejectUnauthorized: false },
});
(async () => {
  console.log('=== PAQUETES (master + hijos) ===');
  const pkgs = await pool.query(
    `SELECT p.id, p.tracking_internal, p.is_master, p.master_id, p.user_id,
            p.weight, p.pkg_length, p.pkg_width, p.pkg_height,
            p.assigned_address_id, p.national_carrier, p.national_shipping_cost,
            p.national_tracking, p.pobox_service_cost, p.assigned_cost_mxn,
            p.status, p.created_at, p.received_at, p.updated_at
       FROM packages p
      WHERE p.tracking_internal IN ('US-9180166640','US-2885632633')
         OR p.master_id IN (SELECT id FROM packages WHERE tracking_internal IN ('US-9180166640','US-2885632633'))
      ORDER BY COALESCE(p.master_id, p.id), p.id`
  );
  console.table(pkgs.rows.map((p) => ({
    id: p.id, tracking: p.tracking_internal, is_master: p.is_master,
    addr: p.assigned_address_id, peso: p.weight,
    dims: `${p.pkg_length}×${p.pkg_width}×${p.pkg_height}`,
    carrier: p.national_carrier, ship_cost: p.national_shipping_cost,
    nat_track: p.national_tracking, created: String(p.created_at).slice(0, 19),
  })));

  console.log('\n=== DIRECCIÓN ===');
  const addrIds = [...new Set(pkgs.rows.map((p) => p.assigned_address_id).filter(Boolean))];
  if (addrIds.length > 0) {
    const a = await pool.query(
      `SELECT id, alias, recipient_name, street, exterior_number, neighborhood,
              city, state, zip_code, phone
         FROM addresses WHERE id = ANY($1::int[])`,
      [addrIds]
    );
    console.table(a.rows);
  }

  console.log('\n=== ORDEN DE PAGO ===');
  const apo = await pool.query(
    `SELECT id, folio, payment_reference, status, total_mxn, package_uids,
            service_type_cfg, created_at
       FROM advisor_payment_orders
      WHERE package_uids::text ILIKE ANY(
        SELECT '%' || id::text || '%'
          FROM packages
         WHERE tracking_internal IN ('US-9180166640','US-2885632633')
      )
      ORDER BY created_at DESC LIMIT 5`
  );
  console.table(apo.rows);

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
