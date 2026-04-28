// Backfill package_history para paquetes ya en received_mty sin movimientos.
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const mtyRes = await client.query(
      `SELECT id FROM branches WHERE UPPER(code) = 'MTY' AND is_active = TRUE LIMIT 1`
    );
    const mtyBranchId = mtyRes.rows[0]?.id || null;

    // Paquetes en received_mty sin ningún registro en package_history
    const candidates = await client.query(`
      SELECT p.id, p.tracking_internal, p.updated_at, p.dispatched_at, p.received_at
        FROM packages p
       WHERE p.status::text = 'received_mty'
         AND p.tracking_internal LIKE 'US-%'
         AND NOT EXISTS (SELECT 1 FROM package_history ph WHERE ph.package_id = p.id)
    `);

    console.log(`Paquetes a hidratar: ${candidates.rows.length}`);
    if (candidates.rows.length === 0) {
      await client.query('COMMIT');
      return;
    }

    const ids = candidates.rows.map((r) => r.id);

    // Recibido en Hidalgo (created_at del paquete)
    await client.query(
      `INSERT INTO package_history (package_id, status, notes, branch_id, warehouse_location, created_at)
       SELECT id, 'received', 'Recibido en sucursal Hidalgo TX', NULL, 'hidalgo_tx', created_at
         FROM packages WHERE id = ANY($1::int[])`,
      [ids]
    );

    // En tránsito (dispatched_at o updated_at - 1 min)
    await client.query(
      `INSERT INTO package_history (package_id, status, notes, branch_id, warehouse_location, created_at)
       SELECT id, 'in_transit', 'En ruta a MTY, N.L.', NULL, 'in_transit',
              COALESCE(dispatched_at, updated_at - INTERVAL '1 minute', created_at + INTERVAL '1 minute')
         FROM packages WHERE id = ANY($1::int[])`,
      [ids]
    );

    // Recibido en MTY (updated_at o received_at)
    await client.query(
      `INSERT INTO package_history (package_id, status, notes, branch_id, warehouse_location, created_at)
       SELECT id, 'received_mty', 'Recibido en CEDIS MTY', $2::int, 'cedis_mty',
              COALESCE(received_at, updated_at, NOW())
         FROM packages WHERE id = ANY($1::int[])`,
      [ids, mtyBranchId]
    );

    await client.query('COMMIT');
    console.log(`✅ Hidratados ${ids.length} paquetes con 3 movimientos cada uno.`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
