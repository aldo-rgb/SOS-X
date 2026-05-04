/**
 * Reset de recepción marítima China para pruebas.
 *
 * Marca todas las maritime_orders del contenedor indicado como NO escaneadas
 * (status -> customs_cleared, missing_on_arrival -> FALSE, received_boxes -> NULL).
 * Y deja el contenedor en su status original ('arrived' / no recibido) para
 * volver a aparecer en el wizard de recepción.
 *
 * USO:
 *   node reset_maritime_reception.js <container_reference>
 *   node reset_maritime_reception.js JSM26-0061
 *   node reset_maritime_reception.js ALL    (⚠ resetea TODOS los contenedores con status received_mty/received_partial)
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
});

async function reset(arg) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let containers;
    if (!arg || arg.toUpperCase() === 'ALL') {
      containers = await client.query(
        `SELECT id, reference_code, container_number, status
           FROM containers
          WHERE status IN ('received_mty', 'received_partial', 'arrived')
            AND mode = 'sea'
          ORDER BY id`
      );
    } else {
      containers = await client.query(
        `SELECT id, reference_code, container_number, status
           FROM containers
          WHERE reference_code = $1 OR container_number = $1 OR bl_number = $1
          LIMIT 1`,
        [arg]
      );
    }

    if (containers.rows.length === 0) {
      console.log(`⚠️  No se encontró ningún contenedor con referencia "${arg}"`);
      await client.query('ROLLBACK');
      return;
    }

    let totalOrders = 0;
    for (const c of containers.rows) {
      const updateOrders = await client.query(
        `UPDATE maritime_orders
            SET status = 'customs_cleared',
                missing_on_arrival = FALSE,
                received_boxes = NULL,
                updated_at = NOW()
          WHERE container_id = $1
            AND status IN ('received_mty', 'received_partial')`,
        [c.id]
      );
      const updateContainer = await client.query(
        `UPDATE containers
            SET status = 'arrived',
                received_at = NULL,
                received_by = NULL,
                reception_notes = NULL,
                updated_at = NOW()
          WHERE id = $1`,
        [c.id]
      );
      console.log(`📦 ${c.reference_code || c.container_number} (id=${c.id}) → ${updateOrders.rowCount} órden(es) reseteadas, contenedor reabierto.`);
      totalOrders += updateOrders.rowCount;
    }

    await client.query('COMMIT');
    console.log(`\n✅ Reset completo: ${containers.rows.length} contenedor(es), ${totalOrders} orden(es) marcadas como NO escaneadas.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

const arg = process.argv[2];
if (!arg) {
  console.log('Uso: node reset_maritime_reception.js <container_reference|ALL>');
  console.log('Ejemplo: node reset_maritime_reception.js JSM26-0061');
  process.exit(1);
}
reset(arg).catch(() => process.exit(1));
