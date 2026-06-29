// Verifica estado de las 3 guías de prueba PQTX
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const trks = ['US-9533124971', 'US-9283207121', 'US-9085063287'];
  console.log('=== PAQUETES ===');
  const pkgs = await pool.query(
    `SELECT p.id, p.tracking_internal, p.weight,
            COALESCE(p.pkg_length, p.long_cm, 0) AS pkg_length,
            COALESCE(p.pkg_width, p.width_cm, 0) AS pkg_width,
            COALESCE(p.pkg_height, p.height_cm, 0) AS pkg_height,
            p.assigned_address_id, p.national_tracking, p.national_carrier,
            p.status, p.service_type
       FROM packages p
      WHERE p.tracking_internal = ANY($1::text[])
      ORDER BY p.tracking_internal`,
    [trks]
  );
  console.table(pkgs.rows);

  console.log('\n=== DIRECCIONES ASIGNADAS ===');
  const addrIds = pkgs.rows.map((p) => p.assigned_address_id).filter(Boolean);
  if (addrIds.length > 0) {
    const addrs = await pool.query(
      `SELECT id, alias, recipient_name, street, exterior_number, neighborhood, city, state, zip_code, phone
         FROM addresses WHERE id = ANY($1::int[])`,
      [addrIds]
    );
    console.table(addrs.rows);
  } else {
    console.log('(ninguno tiene dirección asignada)');
  }

  console.log('\n=== pqtx_shipments existentes para estos trackings ===');
  const sh = await pool.query(
    `SELECT tracking_number, folio_porte, cancel_response IS NOT NULL AS cancelada, created_at
       FROM pqtx_shipments
      WHERE EXISTS (
        SELECT 1 FROM packages pp
         WHERE pp.tracking_internal = ANY($1::text[])
           AND pp.national_tracking = pqtx_shipments.tracking_number
      )
      ORDER BY created_at DESC`,
    [trks]
  );
  console.table(sh.rows);

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
