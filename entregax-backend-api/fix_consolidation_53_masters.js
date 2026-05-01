/**
 * Repara la consolidación 53: sube los masters a 'in_transit' cuando todas
 * sus hijas ya estan in_transit (o received_mty). También copia consolidation_id
 * y supplier_id desde una hija al master.
 *
 * Uso: node fix_consolidation_53_masters.js [consolidationId]
 */
require('dotenv').config();
const { Pool } = require('pg');

const consolidationId = parseInt(process.argv[2] || '53', 10);

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

(async () => {
    try {
        console.log(`🔧 Reparando consolidación #${consolidationId}...`);

        const masters = await pool.query(
            `SELECT DISTINCT m.id, m.tracking_internal, m.status::text AS status
               FROM packages c
               JOIN packages m ON m.id = c.master_id
              WHERE c.consolidation_id = $1
                AND c.master_id IS NOT NULL
                AND m.is_master = TRUE`,
            [consolidationId]
        );
        console.log(`Masters encontrados: ${masters.rows.length}`);
        masters.rows.forEach(m => console.log(` - id=${m.id} ${m.tracking_internal} (${m.status})`));

        if (masters.rows.length === 0) {
            console.log('Nada que hacer.');
            process.exit(0);
        }
        const masterIds = masters.rows.map(r => r.id);

        const upd = await pool.query(
            `UPDATE packages m
                SET status = 'in_transit',
                    consolidation_id = COALESCE(m.consolidation_id, $2::int),
                    supplier_id = COALESCE(m.supplier_id, (
                        SELECT MIN(c.supplier_id) FROM packages c
                         WHERE c.master_id = m.id AND c.supplier_id IS NOT NULL
                    )),
                    dispatched_at = COALESCE(m.dispatched_at, NOW()),
                    updated_at = NOW()
              WHERE m.id = ANY($1::int[])
                AND NOT EXISTS (
                    SELECT 1 FROM packages c2
                     WHERE c2.master_id = m.id
                       AND c2.status::text NOT IN ('in_transit', 'received_mty')
                )
              RETURNING m.id, m.tracking_internal, m.status::text AS status`,
            [masterIds, consolidationId]
        );
        console.log(`✅ Masters actualizados: ${upd.rowCount}`);
        upd.rows.forEach(m => console.log(` ✔ id=${m.id} ${m.tracking_internal} → ${m.status}`));
    } catch (e) {
        console.error('❌ Error:', e.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
})();
