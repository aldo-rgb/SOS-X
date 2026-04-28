// Backfill: actualiza paquetes master a 'received_mty' cuando todas sus hijas ya lo están.
// También sincroniza branch_inventory en CEDIS MTY.

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
    console.log('CEDIS MTY branch_id =', mtyBranchId);

    const candidates = await client.query(`
      SELECT m.id, m.tracking_internal, m.status::text AS status,
             COUNT(c.id)::int AS total_children,
             COUNT(c.id) FILTER (WHERE c.status::text = 'received_mty')::int AS received_children
        FROM packages m
        JOIN packages c ON c.master_id = m.id
       WHERE m.is_master = TRUE
         AND m.tracking_internal LIKE 'US-%'
         AND m.status::text <> 'received_mty'
       GROUP BY m.id
      HAVING COUNT(c.id) > 0
         AND COUNT(c.id) FILTER (WHERE c.status::text = 'received_mty') = COUNT(c.id)
    `);

    console.log(`Masters a actualizar: ${candidates.rows.length}`);
    for (const r of candidates.rows) {
      console.log(`  - #${r.id} ${r.tracking_internal} (status=${r.status}, hijas=${r.received_children}/${r.total_children})`);
    }

    if (candidates.rows.length === 0) {
      console.log('Nada que hacer.');
      await client.query('COMMIT');
      return;
    }

    const ids = candidates.rows.map((r) => r.id);

    await client.query(
      `UPDATE packages
          SET status = 'received_mty',
              received_at = COALESCE(received_at, NOW()),
              dispatched_at = COALESCE(dispatched_at, NOW()),
              missing_on_arrival = FALSE,
              missing_reported_at = NULL,
              current_branch_id = COALESCE($2::int, current_branch_id),
              updated_at = NOW()
        WHERE id = ANY($1::int[])`,
      [ids, mtyBranchId]
    );

    if (mtyBranchId) {
      await client.query(
        `INSERT INTO branch_inventory (branch_id, package_type, package_id, tracking_number, status, received_at, received_by, released_at, released_by)
         SELECT $1, 'package', p.id, COALESCE(p.tracking_internal, p.tracking_provider, p.id::text), 'in_stock', NOW(), NULL, NULL, NULL
           FROM packages p WHERE p.id = ANY($2::int[])
         ON CONFLICT (branch_id, package_type, package_id)
         DO UPDATE SET status='in_stock', received_at=NOW(), released_at=NULL, released_by=NULL`,
        [mtyBranchId, ids]
      );
    }

    await client.query('COMMIT');
    console.log(`✅ Actualizados ${ids.length} masters a received_mty.`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
