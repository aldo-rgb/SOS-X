// Ajusta tarifas PO Box: Nivel 1 hasta 0.0509, Nivel 2 inicia en 0.0510.
// Corrige US-5910737991 a Nivel 1 ($39 USD).
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    await c.query('UPDATE pobox_tarifas_volumen SET cbm_max = 0.0509, updated_at = NOW() WHERE nivel = 1');
    await c.query('UPDATE pobox_tarifas_volumen SET cbm_min = 0.0510, updated_at = NOW() WHERE nivel = 2');

    const newVentaUsd = 39;
    const tc = 17.53;
    const newServiceMxn = +(newVentaUsd * tc).toFixed(2);

    await c.query(
      `UPDATE packages
          SET pobox_venta_usd     = $1,
              pobox_tarifa_nivel  = 1,
              pobox_service_cost  = $2,
              updated_at          = NOW()
        WHERE tracking_internal = 'US-5910737991'`,
      [newVentaUsd, newServiceMxn]
    );

    await c.query('COMMIT');

    const t = await pool.query('SELECT nivel, cbm_min, cbm_max, costo, tipo_cobro FROM pobox_tarifas_volumen ORDER BY nivel');
    console.log('\nNUEVAS TARIFAS:');
    console.table(t.rows);

    const pkg = await pool.query(
      `SELECT id, tracking_internal, pobox_venta_usd, pobox_tarifa_nivel,
              pobox_service_cost, registered_exchange_rate
         FROM packages WHERE tracking_internal = 'US-5910737991'`
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
