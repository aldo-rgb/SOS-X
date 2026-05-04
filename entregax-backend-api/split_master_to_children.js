/**
 * Convierte un paquete master en N hijos (uno por caja) para que el chofer
 * pueda escanear cada caja al cargar la camioneta.
 *
 * Uso:
 *   node split_master_to_children.js <tracking_internal>
 * Ejemplo:
 *   node split_master_to_children.js LOG26CNMX00077
 *
 * Reglas:
 *  - El master se marca is_master=TRUE (driverController lo excluye de la lista).
 *  - Cada hijo:
 *      tracking_internal = `${ordersn}-${i:0000}`   (i = 1..total_boxes)
 *      master_id = master.id
 *      box_number/child_no = i
 *      hereda payment, address, branch, national_tracking/label, service_type
 *      status = 'received_mty', is_master=FALSE
 */
const { Pool } = require('pg');
require('dotenv').config();

(async () => {
  const tracking = process.argv[2];
  if (!tracking) {
    console.error('Uso: node split_master_to_children.js <tracking_internal>');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const m = await client.query(
      'SELECT * FROM packages WHERE tracking_internal = $1',
      [tracking]
    );
    if (m.rows.length === 0) {
      console.error('❌ No se encontró el paquete', tracking);
      process.exit(1);
    }
    const p = m.rows[0];
    const ordersn = p.tracking_internal;
    const total = Number(p.total_boxes || p.box_count || 0);
    if (!total || total < 1) {
      console.error('❌ total_boxes inválido:', total);
      process.exit(1);
    }
    console.log(`Master id=${p.id} ${ordersn}  →  ${total} cajas`);

    await client.query('BEGIN');
    await client.query(
      'UPDATE packages SET is_master = TRUE, updated_at = NOW() WHERE id = $1',
      [p.id]
    );
    const del = await client.query(
      'DELETE FROM packages WHERE master_id = $1 RETURNING id',
      [p.id]
    );
    console.log(`  · hijos previos eliminados: ${del.rowCount}`);

    const insertSql = `
      INSERT INTO packages (
        user_id, tracking_internal, description, weight,
        status, payment_status, client_paid, client_paid_at,
        monto_pagado, saldo_pendiente, assigned_cost_mxn,
        national_carrier, national_tracking, national_label_url,
        assigned_address_id, current_branch_id,
        total_boxes, box_count, box_number, child_no,
        service_type, received_at, is_master, master_id
      ) VALUES (
        $1,$2,$3,$4,
        'received_mty','paid',TRUE,$5,
        0,0,0,
        $6,$7,$8,
        $9,$10,
        1,1,$11::int,$11::int,
        'china_sea', NOW(), FALSE, $12
      )
    `;

    let inserted = 0;
    for (let i = 1; i <= total; i++) {
      const childTracking = `${ordersn}-${String(i).padStart(4, '0')}`;
      await client.query(insertSql, [
        p.user_id,
        childTracking,
        `${p.description || ordersn} (caja ${i}/${total})`,
        null,
        p.client_paid_at,
        p.national_carrier,
        p.national_tracking,
        p.national_label_url,
        p.assigned_address_id,
        p.current_branch_id,
        i,
        p.id,
      ]);
      inserted++;
    }
    await client.query('COMMIT');
    console.log(`✅ Hijos insertados: ${inserted}`);

    const c = await client.query(
      'SELECT COUNT(*)::int AS n FROM packages WHERE master_id = $1',
      [p.id]
    );
    console.log(`   Verificación: ${c.rows[0].n} hijos en DB`);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('❌ Error:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
