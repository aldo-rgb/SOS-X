/**
 * Sincroniza maritime_orders pagadas + etiquetadas (con guía de paquetería nacional)
 * a la tabla `packages`, para que entren al flujo del chofer (route-today, scan-load,
 * confirm-delivery con escaneo de guía PQTX).
 *
 * Reglas:
 *  - Solo sincroniza órdenes con payment_status='paid' AND national_tracking IS NOT NULL.
 *  - Si ya existe un row en packages con tracking_internal = ordersn, hace UPDATE.
 *  - branch_id se determina por el ZIP de la dirección de entrega:
 *      64-67 → CEDIS MONTERREY (1)
 *      01-16, 50-57 → CEDIS CDMX (2)
 *      otro → CEDIS MONTERREY (1) por defecto
 *
 * Uso:
 *   DATABASE_URL=... node sync_maritime_to_packages.js                # sincroniza todas
 *   DATABASE_URL=... node sync_maritime_to_packages.js LOG26CNMX00077 # solo una
 */
const { Pool } = require('pg');
require('dotenv').config();

const branchByZip = (zip) => {
  const z = String(zip || '').trim().padStart(5, '0').slice(0, 2);
  if (['64','65','66','67'].includes(z)) return 1; // CEDIS MTY
  if (['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','50','51','52','53','54','55','56','57'].includes(z)) return 2; // CEDIS CDMX
  return 1; // default MTY
};

(async () => {
  const filterTracking = process.argv[2];
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const params = [];
    let where = `mo.payment_status = 'paid' AND mo.national_tracking IS NOT NULL AND mo.delivered_at IS NULL`;
    if (filterTracking) {
      params.push(filterTracking);
      where += ` AND mo.ordersn = $1`;
    }
    const r = await pool.query(`
      SELECT mo.*, a.zip_code AS addr_zip
        FROM maritime_orders mo
        LEFT JOIN addresses a ON a.id = mo.delivery_address_id
       WHERE ${where}`, params);

    console.log(`Encontradas ${r.rows.length} maritime_orders para sincronizar`);

    let synced = 0, skipped = 0;
    for (const mo of r.rows) {
      const branchId = branchByZip(mo.addr_zip);
      const totalBoxes = Array.isArray(mo.box_dimensions) ? mo.box_dimensions.length : (mo.summary_boxes || mo.goods_num || 1);

      const existing = await pool.query(
        `SELECT id FROM packages WHERE tracking_internal = $1`,
        [mo.ordersn]
      );

      if (existing.rows.length > 0) {
        await pool.query(`
          UPDATE packages SET
            user_id = $2,
            description = $3,
            weight = $4,
            single_volume = $5,
            single_cbm = $5,
            status = COALESCE(NULLIF(status::text, ''), 'received_mty')::package_status,
            payment_status = 'paid',
            client_paid = TRUE,
            client_paid_at = COALESCE(client_paid_at, $6),
            monto_pagado = $7,
            saldo_pendiente = 0,
            assigned_cost_mxn = $8,
            national_carrier = $9,
            national_tracking = $10,
            national_label_url = $11,
            assigned_address_id = $12,
            current_branch_id = COALESCE(current_branch_id, $13),
            total_boxes = $14,
            box_count = $14,
            service_type = COALESCE(NULLIF(service_type, ''), 'china_sea'),
            received_at = COALESCE(received_at, NOW()),
            updated_at = NOW()
          WHERE id = $1
        `, [
          existing.rows[0].id,
          mo.user_id, mo.summary_description || mo.goods_name || 'Marítimo',
          mo.weight, mo.volume,
          mo.paid_at, mo.monto_pagado || mo.assigned_cost_mxn,
          mo.assigned_cost_mxn,
          mo.national_carrier, mo.national_tracking, mo.national_label_url,
          mo.delivery_address_id, branchId, totalBoxes,
        ]);
        console.log(`  ↻ updated  ${mo.ordersn} (id=${existing.rows[0].id}) → branch=${branchId}`);
      } else {
        const ins = await pool.query(`
          INSERT INTO packages (
            user_id, tracking_internal, description, weight,
            single_volume, single_cbm,
            status, payment_status, client_paid, client_paid_at,
            monto_pagado, saldo_pendiente, assigned_cost_mxn,
            national_carrier, national_tracking, national_label_url,
            assigned_address_id, current_branch_id,
            total_boxes, box_count, service_type, received_at, box_id,
            is_master, master_id
          ) VALUES (
            $1, $2, $3, $4,
            $5, $5,
            'received_mty', 'paid', TRUE, $6,
            $7, 0, $8,
            $9, $10, $11,
            $12, $13,
            $14, $14, 'china_sea', NOW(), $15,
            FALSE, NULL
          ) RETURNING id
        `, [
          mo.user_id, mo.ordersn, mo.summary_description || mo.goods_name || 'Marítimo', mo.weight,
          mo.volume,
          mo.paid_at, mo.monto_pagado || mo.assigned_cost_mxn,
          mo.assigned_cost_mxn,
          mo.national_carrier, mo.national_tracking, mo.national_label_url,
          mo.delivery_address_id, branchId,
          totalBoxes, mo.bl_client_code,
        ]);
        console.log(`  ✚ inserted ${mo.ordersn} (id=${ins.rows[0].id}) → branch=${branchId}, boxes=${totalBoxes}`);
      }
      synced++;
    }

    console.log(`\n✅ Sincronizados: ${synced}, omitidos: ${skipped}`);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
