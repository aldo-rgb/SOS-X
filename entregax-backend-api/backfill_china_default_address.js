// Backfill: asigna direccion default 'air' a china_receipts huerfanos cuando el usuario tenga una configurada.
// Uso: node backfill_china_default_address.js [--apply]
const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const APPLY = process.argv.includes('--apply');

(async () => {
  const orphans = await pool.query(`
    SELECT cr.id, cr.fno, cr.user_id,
           (SELECT a.id FROM addresses a
              WHERE a.user_id = cr.user_id
                AND (a.default_for_service ILIKE '%air%' OR a.default_for_service ILIKE '%all%')
              ORDER BY a.is_default DESC, a.id ASC LIMIT 1) AS candidate
    FROM china_receipts cr
    WHERE cr.user_id IS NOT NULL AND cr.delivery_address_id IS NULL
  `);
  const fixable = orphans.rows.filter(r => r.candidate);
  console.log(`Huerfanos: ${orphans.rows.length} | con candidato 'air': ${fixable.length}`);
  fixable.forEach(r => console.log(`  cr#${r.id} fno=${r.fno} user=${r.user_id} -> addr#${r.candidate}`));
  if (!APPLY) { console.log('\n(dry-run) usa --apply para escribir'); await pool.end(); return; }
  let n = 0;
  for (const r of fixable) {
    await pool.query(`UPDATE china_receipts SET delivery_address_id=$1, updated_at=NOW() WHERE id=$2 AND delivery_address_id IS NULL`, [r.candidate, r.id]);
    n++;
  }
  console.log(`\nActualizados: ${n}`);
  await pool.end();
})();
