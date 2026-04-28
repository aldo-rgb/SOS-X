/**
 * Backfill: propaga instrucciones de entrega de los masters PO Box a sus hijas.
 * Si un master tiene assigned_address_id / national_carrier / notes y alguna hija no,
 * se copian al hijo.
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : undefined,
});

(async () => {
  try {
    console.log('🔍 Buscando masters con instrucciones que no se han propagado a sus hijas...');

    const mastersRes = await pool.query(`
      SELECT id, tracking_internal, assigned_address_id, national_carrier,
             national_shipping_cost, notes
      FROM packages
      WHERE (is_master = TRUE OR id IN (SELECT DISTINCT master_id FROM packages WHERE master_id IS NOT NULL))
        AND assigned_address_id IS NOT NULL
    `);

    console.log(`📦 ${mastersRes.rows.length} masters con dirección asignada.`);

    let totalUpdated = 0;
    for (const master of mastersRes.rows) {
      const carrierLabel = master.national_carrier || 'EntregaX Local';
      const upd = await pool.query(`
        UPDATE packages
        SET assigned_address_id = COALESCE(assigned_address_id, $1),
            national_carrier = COALESCE(national_carrier, $2),
            national_shipping_cost = COALESCE(NULLIF(national_shipping_cost, 0), $3, national_shipping_cost),
            notes = COALESCE(notes, $4),
            needs_instructions = FALSE,
            updated_at = CURRENT_TIMESTAMP
        WHERE master_id = $5
          AND (assigned_address_id IS NULL OR national_carrier IS NULL)
        RETURNING id, tracking_internal
      `, [
        master.assigned_address_id,
        carrierLabel,
        master.national_shipping_cost || 0,
        master.notes,
        master.id,
      ]);

      if (upd.rowCount && upd.rowCount > 0) {
        console.log(`  ✅ ${master.tracking_internal} → ${upd.rowCount} hija(s) actualizada(s): ${upd.rows.map(r => r.tracking_internal).join(', ')}`);
        totalUpdated += upd.rowCount;
      }
    }

    console.log(`\n🎉 Backfill completo. ${totalUpdated} hijas heredaron instrucciones.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en backfill:', err);
    process.exit(1);
  }
})();
