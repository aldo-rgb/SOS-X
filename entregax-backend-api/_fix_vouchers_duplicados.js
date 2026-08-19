// Marca los comprobantes duplicados ya existentes: el mismo pago subido dos
// veces (una por el cliente, otra por su asesor). Solo los MARCA con
// duplicate_of_voucher_id — no los rechaza ni mueve saldos, porque decidir si
// realmente hubo uno o dos pagos requiere ver el estado de cuenta.
//
// Con la marca puesta, aprobarlos exige confirmación explícita, así que ya no
// pueden acreditar saldo a favor por accidente.
//   node _fix_vouchers_duplicados.js            (dry-run)
//   node _fix_vouchers_duplicados.js --apply
const { Pool } = require('pg');
require('dotenv').config();
const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    // Pares del mismo monto en la misma orden, ninguno rechazado.
    const r = await c.query(`
      SELECT v2.id AS dup_id, v1.id AS orig_id, v2.declared_amount monto,
             o.payment_reference ref, u.box_id, u.full_name cliente,
             v1.user_id orig_user, v2.user_id dup_user,
             uo.full_name orig_nombre, ud.full_name dup_nombre, ud.role dup_role
        FROM payment_vouchers v1
        JOIN payment_vouchers v2
          ON v2.payment_order_id = v1.payment_order_id
         AND v2.id > v1.id
         AND ABS(COALESCE(v2.declared_amount,0) - COALESCE(v1.declared_amount,0)) < 0.01
        JOIN pobox_payments o ON o.id = v1.payment_order_id
        JOIN users u ON u.id = o.user_id
        LEFT JOIN users uo ON uo.id = v1.user_id
        LEFT JOIN users ud ON ud.id = v2.user_id
       WHERE v1.status <> 'rejected' AND v2.status <> 'rejected'
         AND v2.duplicate_of_voucher_id IS NULL
       ORDER BY v2.declared_amount DESC`);

    for (const x of r.rows) {
      await c.query(`UPDATE payment_vouchers SET duplicate_of_voucher_id = $1 WHERE id = $2`, [x.orig_id, x.dup_id]);
    }
    console.log('=== COMPROBANTES MARCADOS COMO POSIBLE DUPLICADO ===');
    console.table(r.rows.map(x => ({ ref: x.ref, box: x.box_id, monto: x.monto,
      original: `#${x.orig_id} ${(x.orig_nombre||'').slice(0,18)}`,
      duplicado: `#${x.dup_id} ${(x.dup_nombre||'').slice(0,18)} (${x.dup_role||'?'})` })));
    console.log('marcados:', r.rows.length,
      '| saldo falso que se evita: $' + r.rows.reduce((s,x)=>s+Number(x.monto),0).toFixed(2));

    if (APPLY) { await c.query('COMMIT'); console.log('\n✅ APLICADO'); }
    else { await c.query('ROLLBACK'); console.log('\n🔎 DRY-RUN'); }
  } catch (e) { await c.query('ROLLBACK').catch(()=>{}); console.error('ERROR:', e.message); process.exit(1); }
  finally { c.release(); await pool.end(); }
})();
