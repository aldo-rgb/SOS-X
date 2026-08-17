// Revierte órdenes marcadas como PAGADAS cuyo depósito NO cubría el monto.
// TKT-2026-2191 (S3442 / Víctor García) y TKT-2026-2180 (S3128 / Marcelo).
//
// Al revertir, la orden vuelve a 'pending_payment' y sus guías dejan de estar
// pagadas: el cliente vuelve a deber la diferencia. Por eso NO se corre sobre
// todo lo que detecta — hay que pasar los ids de orden explícitamente:
//
//   node _fix_pagos_parciales.js --ids=310,795            (dry-run)
//   node _fix_pagos_parciales.js --ids=310,795 --apply
//
// Sin --ids solo LISTA las órdenes con depósito insuficiente y no toca nada.
const { Pool } = require('pg');
require('dotenv').config();
const APPLY = process.argv.includes('--apply');
const idsArg = (process.argv.find(a => a.startsWith('--ids=')) || '').replace('--ids=', '');
const IDS = idsArg ? idsArg.split(',').map(n => parseInt(n.trim(), 10)).filter(Boolean) : [];
const TOLERANCIA = 5; // centavos de redondeo, no son pagos parciales
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const c = await pool.connect();
  try {
    const lista = await c.query(`
      SELECT pp.id, u.box_id, u.full_name, pp.payment_reference,
             pp.amount AS orden, pp.voucher_total AS depositado,
             (pp.amount - pp.voucher_total) AS faltante, pp.status, pp.package_ids,
             to_char(pp.paid_at AT TIME ZONE 'America/Monterrey','YYYY-MM-DD HH24:MI') pagada
        FROM pobox_payments pp LEFT JOIN users u ON u.id = pp.user_id
       WHERE pp.status IN ('paid','completed')
         AND COALESCE(pp.voucher_total,0) > 0
         AND pp.voucher_total < pp.amount - $1
       ORDER BY (pp.amount - pp.voucher_total) DESC`, [TOLERANCIA]);

    console.log(`=== ORDENES PAGADAS CON DEPOSITO INSUFICIENTE (faltante > $${TOLERANCIA}) ===`);
    console.table(lista.rows.map(r => ({ ...r, package_ids: JSON.stringify(r.package_ids) })));

    if (IDS.length === 0) {
      console.log('\nSin --ids: no se revierte nada. Elige cuáles revertir y vuelve a correr:');
      console.log(`  node _fix_pagos_parciales.js --ids=${lista.rows.map(r => r.id).join(',')} [--apply]`);
      return;
    }

    await c.query('BEGIN');
    const hechos = [];
    for (const id of IDS) {
      const o = lista.rows.find(r => Number(r.id) === id);
      if (!o) { console.warn(`  ⚠️  orden ${id} no está en la lista de insuficientes — se omite`); continue; }

      const raw = typeof o.package_ids === 'string' ? JSON.parse(o.package_ids) : (o.package_ids || []);
      const pkgIds = (Array.isArray(raw) ? raw : []).map(Number).filter(Number.isFinite);

      // La orden vuelve a pendiente, conservando lo ya abonado.
      await c.query(
        `UPDATE pobox_payments
            SET status = 'pending_payment', paid_at = NULL,
                confirmation_notes = COALESCE(confirmation_notes,'') ||
                  ' | REVERTIDO: el deposito ($' || COALESCE(voucher_total,0)::text ||
                  ') no cubria la orden ($' || amount::text || ').'
          WHERE id = $1`, [id]
      );

      // Las guías (y sus hijas) vuelven a deber, con el abono ya aplicado.
      let afectadas = 0;
      if (pkgIds.length > 0) {
        const r = await c.query(
          `UPDATE packages
              SET client_paid = FALSE, client_paid_at = NULL, payment_status = 'pending',
                  monto_pagado = $2::numeric,
                  saldo_pendiente = GREATEST(0, COALESCE(NULLIF(pobox_service_cost,0), NULLIF(assigned_cost_mxn,0), 0) - $2::numeric),
                  updated_at = NOW()
            WHERE id = ANY($1::int[]) OR master_id = ANY($1::int[])`,
          [pkgIds, Number(o.depositado) || 0]
        );
        afectadas = r.rowCount || 0;
      }
      hechos.push({ orden: id, ref: o.payment_reference, cliente: o.box_id,
                    monto: o.orden, depositado: o.depositado, faltante: o.faltante, guias_afectadas: afectadas });
    }

    console.log('\n=== ORDENES REVERTIDAS ===');
    console.table(hechos);

    if (APPLY) { await c.query('COMMIT'); console.log('\n✅ APLICADO'); }
    else { await c.query('ROLLBACK'); console.log('\n🔎 DRY-RUN — nada se escribio. Agregar --apply para aplicar.'); }
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('ERROR:', e.message); process.exit(1);
  } finally { c.release(); await pool.end(); }
})();
