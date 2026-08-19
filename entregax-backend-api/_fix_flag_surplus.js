// Marca surplus_credited=true en las órdenes cuyo excedente YA está abonado en
// billetera_servicio pero quedó con la bandera en false, porque
// completeVoucherPayment acreditaba sin marcarla. NO toca ningún saldo: solo
// sincroniza la bandera para que dejen de figurar como pendientes y para que
// nadie las vuelva a acreditar.
//   node _fix_flag_surplus.js            (dry-run)
//   node _fix_flag_surplus.js --apply
const { Pool } = require('pg');
require('dotenv').config();
const APPLY = process.argv.includes('--apply');
// Solo las 7 autorizadas: las que aparecieron en la revisión del grupo A.
const REFS = ['UW-54660189','UW-96135E3F','RO-65986488','RO-329459B5','UW-6247817E','RO-44893063','RO-31241E0E'];
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await c.query(`
      SELECT pp.id, pp.payment_reference ref, u.box_id, pp.amount orden,
             pp.surplus_amount actual,
             COALESCE((SELECT SUM(monto) FROM billetera_servicio_transacciones t
                        WHERE t.payment_order_id=pp.id AND t.tipo='excedente'),0) abonado,
             (SELECT saldo FROM billetera_servicio b WHERE b.user_id=pp.user_id LIMIT 1) saldo_cliente
        FROM pobox_payments pp JOIN users u ON u.id=pp.user_id
       WHERE COALESCE(pp.surplus_credited,false)=false
         AND pp.payment_reference = ANY($1)
         AND EXISTS (SELECT 1 FROM billetera_servicio_transacciones t
                      WHERE t.payment_order_id=pp.id AND t.tipo='excedente' AND t.monto > 0)
       ORDER BY 6 DESC`, [REFS]);
    const cambios=[];
    for (const x of r.rows) {
      await c.query(
        `UPDATE pobox_payments SET surplus_amount = $1, surplus_credited = TRUE WHERE id = $2`,
        [x.abonado, x.id]);
      cambios.push({ ref:x.ref, box:x.box_id, orden:x.orden,
        surplus_antes:x.actual, surplus_despues:x.abonado,
        saldo_cliente:x.saldo_cliente, nota:'saldo NO se toca' });
    }
    console.log('=== BANDERA CORREGIDA (sin mover saldos) ===');
    console.table(cambios);
    console.log('órdenes:', cambios.length, '| total ya abonado que representan: $' +
      cambios.reduce((s,x)=>s+Number(x.surplus_despues),0).toFixed(2));
    const saldos = await c.query(`SELECT COALESCE(SUM(saldo),0)::numeric t FROM billetera_servicio`);
    console.log('suma de TODAS las billeteras (debe ser igual antes y después): $' + saldos.rows[0].t);
    if (APPLY) { await c.query('COMMIT'); console.log('\n✅ APLICADO'); }
    else { await c.query('ROLLBACK'); console.log('\n🔎 DRY-RUN'); }
  } catch(e){ await c.query('ROLLBACK').catch(()=>{}); console.error('ERROR:', e.message); process.exit(1); }
  finally { c.release(); await pool.end(); }
})();
