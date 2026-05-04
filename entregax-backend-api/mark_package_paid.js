/**
 * Marca como pagado un paquete (master + hijas) cuya conciliación de pago no se
 * propagó automáticamente desde el flujo de cobro.
 *
 * Uso:
 *   DATABASE_URL=postgres://...@host/db node mark_package_paid.js LOG26CNMX00077
 *
 * Si no se pasa DATABASE_URL en el ambiente, usa el de .env.
 */
const { Pool } = require('pg');
require('dotenv').config();

(async () => {
  const tracking = process.argv[2];
  if (!tracking) {
    console.error('Uso: node mark_package_paid.js <tracking_internal>');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const masterRes = await client.query(
      `SELECT id, tracking_internal, payment_status, client_paid, monto_pagado,
              saldo_pendiente, national_shipping_cost, total_boxes
         FROM packages
        WHERE tracking_internal = $1`,
      [tracking]
    );
    if (masterRes.rows.length === 0) {
      throw new Error(`No se encontró el paquete con tracking_internal = ${tracking}`);
    }
    const master = masterRes.rows[0];
    console.log('Master encontrado:', master);

    // Hijas (si tiene)
    const childrenRes = await client.query(
      `SELECT id, tracking_internal FROM packages WHERE master_id = $1`,
      [master.id]
    );
    console.log(`Hijas encontradas: ${childrenRes.rows.length}`);

    const ids = [master.id, ...childrenRes.rows.map(r => r.id)];

    const upd = await client.query(
      `UPDATE packages
          SET client_paid = TRUE,
              client_paid_at = COALESCE(client_paid_at, NOW()),
              payment_status = 'paid',
              saldo_pendiente = 0,
              monto_pagado = COALESCE(NULLIF(monto_pagado, 0), saldo_pendiente, 0)
        WHERE id = ANY($1::int[])
        RETURNING id, tracking_internal, payment_status, client_paid, saldo_pendiente, monto_pagado`,
      [ids]
    );
    console.log('Filas actualizadas:', upd.rows);

    await client.query('COMMIT');
    console.log(`✅ ${upd.rowCount} paquete(s) marcados como pagados.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
