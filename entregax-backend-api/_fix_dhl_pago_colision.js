// Aplica el pago a las guías DHL de órdenes que se liquidaron pero cuyo pago
// nunca llegó a dhl_shipments: sin orden de asesor, el auto-match trataba los
// package_ids como ids de `packages` y marcaba paquetes aéreos ajenos por
// colisión de id (TKT-2026-2113 / tarea #259).
//
// NO toca los packages mal marcados: por indicación expresa solo se corrigen
// las guías DHL. Expande a todas las cajas del envío (multicaja).
//
//   node _fix_dhl_pago_colision.js            (dry-run)
//   node _fix_dhl_pago_colision.js --apply
const { Pool } = require('pg');
require('dotenv').config();
const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // Órdenes pagadas cuyo servicio autoritativo es DHL.
    const ordenes = await c.query(`
      SELECT pp.id, pp.payment_reference, pp.user_id, u.box_id, pp.amount, pp.package_ids,
             to_char(pp.paid_at AT TIME ZONE 'America/Monterrey','MM-DD HH24:MI') pagada
        FROM pobox_payments pp
        JOIN users u ON u.id = pp.user_id
        JOIN LATERAL (SELECT service_type FROM openpay_webhook_logs
                       WHERE transaction_id = pp.payment_reference AND service_type IS NOT NULL
                       ORDER BY id DESC LIMIT 1) owl ON TRUE
       WHERE pp.status IN ('paid','completed')
         AND UPPER(owl.service_type) = 'AA_DHL'
       ORDER BY pp.paid_at`);

    const cambios = [];
    for (const o of ordenes.rows) {
      const raw = typeof o.package_ids === 'string' ? JSON.parse(o.package_ids) : (o.package_ids || []);
      const ids = (Array.isArray(raw) ? raw : []).map(Number).filter(Number.isFinite);
      if (!ids.length) continue;

      // Solo las guías DHL de ESTE cliente: si un id no le pertenece, es
      // colisión con otra tabla y no se toca.
      const grupo = await c.query(
        `SELECT DISTINCT s.id, s.secondary_tracking, s.cost_payment_status
           FROM dhl_shipments s
          WHERE s.user_id = $2
            AND (s.id = ANY($1::int[])
                 OR EXISTS (SELECT 1 FROM dhl_shipments seed
                             WHERE seed.id = ANY($1::int[])
                               AND seed.user_id = $2
                               AND COALESCE(seed.secondary_tracking,'') <> ''
                               AND seed.secondary_tracking = s.secondary_tracking))`,
        [ids, o.user_id]
      );
      const pendientes = grupo.rows.filter(g => g.cost_payment_status !== 'paid');
      if (!pendientes.length) continue;

      await c.query(
        `UPDATE dhl_shipments
            SET paid_at = CURRENT_TIMESTAMP, cost_payment_status = 'paid',
                monto_pagado = COALESCE(total_cost_mxn, saldo_pendiente, 0), saldo_pendiente = 0
          WHERE id = ANY($1::int[])`,
        [pendientes.map(p => p.id)]
      );
      cambios.push({ orden: o.id, ref: o.payment_reference, cliente: o.box_id, monto: o.amount,
                     pagada: o.pagada, guias_corregidas: pendientes.length,
                     trackings: pendientes.map(p => p.secondary_tracking).join(', ').slice(0, 60) });
    }

    console.log('=== GUIAS DHL A LAS QUE SE APLICA EL PAGO ===');
    console.table(cambios);
    console.log('Ordenes DHL revisadas:', ordenes.rows.length,
                '| con guias por corregir:', cambios.length,
                '| guias totales:', cambios.reduce((s,x)=>s+x.guias_corregidas,0));

    if (APPLY) { await c.query('COMMIT'); console.log('\n✅ APLICADO'); }
    else { await c.query('ROLLBACK'); console.log('\n🔎 DRY-RUN — nada se escribio.'); }
  } catch (e) {
    await c.query('ROLLBACK').catch(()=>{});
    console.error('ERROR:', e.message); process.exit(1);
  } finally { c.release(); await pool.end(); }
})();
