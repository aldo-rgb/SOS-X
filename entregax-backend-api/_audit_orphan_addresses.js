// Saneo retroactivo: packages con assigned_address_id que apunta a una
// dirección eliminada. Aplica la misma lógica del helper:
//   - Si es hija con master con dirección válida → hereda la del master
//   - Si es master/individual → assigned_address_id = NULL
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const c = await pool.connect();
  try {
    // 1. Identificar packages huérfanos
    const orphans = await c.query(
      `SELECT p.id, p.tracking_internal, p.assigned_address_id, p.master_id
         FROM packages p
        WHERE p.assigned_address_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM addresses a WHERE a.id = p.assigned_address_id)
        ORDER BY p.master_id NULLS FIRST, p.id`
    );
    console.log(`📦 Paquetes con dirección huérfana: ${orphans.rows.length}`);
    if (orphans.rows.length === 0) { console.log('Nada que limpiar.'); return; }

    await c.query('BEGIN');

    // 2. Hijos: heredar dirección del master cuando el master tenga una válida
    const r1 = await c.query(
      `UPDATE packages p
          SET assigned_address_id = m.assigned_address_id,
              updated_at = NOW()
         FROM packages m
        WHERE p.master_id = m.id
          AND m.assigned_address_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM addresses a WHERE a.id = m.assigned_address_id)
          AND p.assigned_address_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM addresses a WHERE a.id = p.assigned_address_id)
        RETURNING p.id, p.tracking_internal`
    );
    console.log(`  ✓ ${r1.rowCount} hijos reasignados a la dirección del master`);

    // 3. Restantes (masters o individuales): a NULL + needs_instructions
    let r2;
    try {
      r2 = await c.query(
        `UPDATE packages
            SET assigned_address_id = NULL,
                needs_instructions = TRUE,
                updated_at = NOW()
          WHERE assigned_address_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM addresses a WHERE a.id = packages.assigned_address_id)
          RETURNING id, tracking_internal`
      );
    } catch {
      r2 = await c.query(
        `UPDATE packages
            SET assigned_address_id = NULL,
                updated_at = NOW()
          WHERE assigned_address_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM addresses a WHERE a.id = packages.assigned_address_id)
          RETURNING id, tracking_internal`
      );
    }
    console.log(`  ✓ ${r2.rowCount} paquetes restantes con dirección NULL`);

    await c.query('COMMIT');

    // 4. Confirmación
    const left = await c.query(
      `SELECT COUNT(*)::int AS n FROM packages p
        WHERE p.assigned_address_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM addresses a WHERE a.id = p.assigned_address_id)`
    );
    console.log(`\n✅ Limpieza completa. Quedan ${left.rows[0].n} huérfanos.`);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('ERROR:', e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
