/**
 * Backfill: sincroniza el `status` de las guías master con el estado efectivo
 * calculado a partir de sus hijas (regla conservadora = estado MENOS avanzado).
 *
 * Contexto: cuando una guía hija avanza de estado (p.ej. 'received_mty' →
 * 'shipped') el master NO se actualiza automáticamente y queda stale. Este
 * script recorre todos los masters y corrige los que tienen un status distinto
 * al agregado desde hijas.
 *
 * Uso:
 *   cd entregax-backend-api && node backfill_master_effective_status.js
 *   cd entregax-backend-api && node backfill_master_effective_status.js --dry
 *   cd entregax-backend-api && node backfill_master_effective_status.js --tracking US-8711863339
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const trackingIdx = args.indexOf('--tracking');
const trackingFilter = trackingIdx >= 0 ? args[trackingIdx + 1] : null;

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const params = [];
    let extraWhere = '';
    if (trackingFilter) {
      params.push(trackingFilter);
      extraWhere = ` AND m.tracking_internal = $${params.length}`;
    }

    const rankExpr = `
      CASE c.status::text
        WHEN 'pending' THEN 0
        WHEN 'registered' THEN 0
        WHEN 'received_china' THEN 1
        WHEN 'received_origin' THEN 1
        WHEN 'received' THEN 2
        WHEN 'in_transit' THEN 3
        WHEN 'customs' THEN 3
        WHEN 'consolidated' THEN 3
        WHEN 'received_mty' THEN 4
        WHEN 'received_cdmx' THEN 4
        WHEN 'received_gdl' THEN 4
        WHEN 'received_qro' THEN 4
        WHEN 'received_pue' THEN 4
        WHEN 'received_tij' THEN 4
        WHEN 'received_mid' THEN 4
        WHEN 'received_cun' THEN 4
        WHEN 'received_leo' THEN 4
        WHEN 'received_hgo' THEN 4
        WHEN 'received_cc' THEN 4
        WHEN 'reempacado' THEN 4
        WHEN 'shipped' THEN 5
        WHEN 'ready_pickup' THEN 6
        WHEN 'out_for_delivery' THEN 7
        WHEN 'delivered' THEN 8
        WHEN 'returned_to_warehouse' THEN 9
        WHEN 'lost' THEN 9
        ELSE 99
      END
    `;

    const candidates = await client.query(
      `
      WITH agg AS (
        SELECT
          m.id AS master_id,
          m.tracking_internal,
          m.status::text AS master_status,
          (
            SELECT c.status::text
              FROM packages c
             WHERE c.master_id = m.id
             ORDER BY ${rankExpr} ASC, c.updated_at ASC
             LIMIT 1
          ) AS agg_status,
          COUNT(c.id)::int AS total_children
          FROM packages m
          JOIN packages c ON c.master_id = m.id
         WHERE m.is_master = TRUE${extraWhere}
         GROUP BY m.id
        HAVING COUNT(c.id) > 0
      )
      SELECT master_id, tracking_internal, master_status, agg_status, total_children
        FROM agg
       WHERE agg_status IS NOT NULL
         AND agg_status <> master_status
      `,
      params
    );

    console.log(`Masters con estado stale: ${candidates.rows.length}`);
    for (const r of candidates.rows) {
      console.log(
        `  - #${r.master_id} ${r.tracking_internal}: ${r.master_status} → ${r.agg_status} (${r.total_children} hijas)`
      );
    }

    if (candidates.rows.length === 0) {
      console.log('Nada que actualizar.');
      await client.query('COMMIT');
      return;
    }

    if (dryRun) {
      console.log('(dry-run) No se aplicaron cambios.');
      await client.query('ROLLBACK');
      return;
    }

    for (const r of candidates.rows) {
      await client.query(
        `UPDATE packages
            SET status = $1::package_status,
                updated_at = NOW()
                ${r.agg_status === 'delivered' ? ', delivered_at = COALESCE(delivered_at, NOW())' : ''}
          WHERE id = $2`,
        [r.agg_status, r.master_id]
      );

      try {
        await client.query(
          `INSERT INTO package_history (package_id, status, notes, created_by, created_at)
           VALUES ($1, $2, $3, NULL, NOW())`,
          [
            r.master_id,
            r.agg_status,
            `Backfill: estado agregado desde guías hijas (${r.master_status} → ${r.agg_status})`,
          ]
        );
      } catch (e) {
        console.warn(`  ⚠️  No se registró package_history para master #${r.master_id}:`, e.message);
      }
    }

    await client.query('COMMIT');
    console.log(`✅ Actualizados ${candidates.rows.length} masters.`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
