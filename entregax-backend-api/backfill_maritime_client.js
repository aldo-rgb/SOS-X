// Backfill: para maritime_orders con bl_client_name/bl_client_code vacíos,
// intenta resolver el cliente desde shipping_mark (extrayendo S\d+) o desde user_id
// ya asignado y llena esos campos para que la UI muestre el nombre en vez de "Sin asignar".
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  try {
    // Paso 1: llenar bl_client_code / bl_client_name desde users cuando user_id ya está y faltan
    const step1 = await pool.query(`
      UPDATE maritime_orders mo
      SET bl_client_code = COALESCE(NULLIF(mo.bl_client_code, ''), u.box_id),
          bl_client_name = COALESCE(NULLIF(mo.bl_client_name, ''), u.full_name),
          updated_at = NOW()
      FROM users u
      WHERE mo.user_id = u.id
        AND (mo.bl_client_code IS NULL OR mo.bl_client_code = ''
          OR mo.bl_client_name IS NULL OR mo.bl_client_name = '')
      RETURNING mo.ordersn
    `);
    console.log(`Paso 1 (por user_id): ${step1.rowCount} órdenes actualizadas`);

    // Paso 2: para los que aún no tienen datos, extraer S\d+ del shipping_mark y buscar user
    const step2 = await pool.query(`
      WITH candidates AS (
        SELECT mo.id, mo.ordersn, UPPER(SUBSTRING(mo.shipping_mark FROM 'S[0-9]+')) AS box_key
        FROM maritime_orders mo
        WHERE mo.shipping_mark IS NOT NULL AND mo.shipping_mark <> ''
          AND (mo.bl_client_name IS NULL OR mo.bl_client_name = ''
            OR mo.bl_client_code IS NULL OR mo.bl_client_code = '')
      )
      UPDATE maritime_orders mo
      SET bl_client_code = COALESCE(NULLIF(mo.bl_client_code, ''), u.box_id),
          bl_client_name = COALESCE(NULLIF(mo.bl_client_name, ''), u.full_name),
          user_id = COALESCE(mo.user_id, u.id),
          updated_at = NOW()
      FROM candidates c
      JOIN users u ON UPPER(u.box_id) = c.box_key
      WHERE mo.id = c.id AND c.box_key IS NOT NULL
      RETURNING mo.ordersn
    `);
    console.log(`Paso 2 (por shipping_mark → users): ${step2.rowCount} órdenes actualizadas`);

    // Paso 3: fallback a legacy_clients para nombres (sin user_id)
    const step3 = await pool.query(`
      WITH candidates AS (
        SELECT mo.id, mo.ordersn, UPPER(SUBSTRING(mo.shipping_mark FROM 'S[0-9]+')) AS box_key
        FROM maritime_orders mo
        WHERE mo.shipping_mark IS NOT NULL AND mo.shipping_mark <> ''
          AND (mo.bl_client_name IS NULL OR mo.bl_client_name = ''
            OR mo.bl_client_code IS NULL OR mo.bl_client_code = '')
      )
      UPDATE maritime_orders mo
      SET bl_client_code = COALESCE(NULLIF(mo.bl_client_code, ''), lc.box_id),
          bl_client_name = COALESCE(NULLIF(mo.bl_client_name, ''), lc.full_name),
          updated_at = NOW()
      FROM candidates c
      JOIN legacy_clients lc ON UPPER(lc.box_id) = c.box_key
      WHERE mo.id = c.id AND c.box_key IS NOT NULL
      RETURNING mo.ordersn
    `);
    console.log(`Paso 3 (por shipping_mark → legacy_clients): ${step3.rowCount} órdenes actualizadas`);

    // Reporte final
    const remaining = await pool.query(`
      SELECT COUNT(*)::int AS n
      FROM maritime_orders
      WHERE (bl_client_name IS NULL OR bl_client_name = '')
    `);
    console.log(`Órdenes que siguen 'Sin asignar' en CLIENTE: ${remaining.rows[0].n}`);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
