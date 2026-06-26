// Opcion 1: cerrar gap subiendo Nivel 2 max a 0.0999.
// Corregir US-3863246710 a Nivel 2 ($79 USD).
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // 1) Cerrar el gap entre Nivel 2 y Nivel 3
    await c.query('UPDATE pobox_tarifas_volumen SET cbm_max = 0.0999, updated_at = NOW() WHERE nivel = 2');

    // 2) Corregir US-3863246710 a Nivel 2 = $79 USD
    const newVentaUsd = 79;
    const tc = 17.55;
    const newServiceMxn = +(newVentaUsd * tc).toFixed(2);

    await c.query(
      `UPDATE packages
          SET pobox_venta_usd     = $1,
              pobox_tarifa_nivel  = 2,
              pobox_service_cost  = $2,
              updated_at          = NOW()
        WHERE tracking_internal = 'US-3863246710'`,
      [newVentaUsd, newServiceMxn]
    );

    await c.query('COMMIT');

    const t = await pool.query('SELECT nivel, cbm_min, cbm_max, costo, tipo_cobro FROM pobox_tarifas_volumen ORDER BY nivel');
    console.log('\nTARIFAS:');
    console.table(t.rows);

    const pkg = await pool.query(
      `SELECT id, tracking_internal, pobox_venta_usd, pobox_tarifa_nivel,
              pobox_service_cost, registered_exchange_rate
         FROM packages WHERE tracking_internal = 'US-3863246710'`
    );
    console.log('\nPAQUETE DESPUES:');
    console.table(pkg.rows);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('ERROR:', e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
