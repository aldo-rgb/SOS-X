// Recalcula user_service_credits.used_credit para los clientes cuyo crédito
// quedó retenido: al liquidar una orden pagada a crédito, el servicio se
// deducía de packages.service_type usando los package_ids de la orden, pero en
// DHL esos ids apuntan a dhl_shipments. No se encontraba el servicio, se caía
// al crédito global (users.used_credit, normalmente 0) y el crédito del
// servicio nunca se devolvía. Ticket TKT-2026-2184 (S219 / Andrés Villasana).
//
// used_credit correcto = suma de órdenes a crédito NO liquidadas y no canceladas,
// agrupadas por el servicio REAL de la orden (advisor_payment_orders.service_type_cfg,
// con openpay_webhook_logs.service_type como respaldo).
//
// Corre en DRY-RUN salvo que se pase --apply.
const { Pool } = require('pg');
require('dotenv').config();
const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const norm = (raw) => {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  const m = {
    china_air: 'aereo', air_chn_mx: 'aereo', aereo: 'aereo', air: 'aereo',
    maritime: 'maritimo', china_sea: 'maritimo', sea_chn_mx: 'maritimo', fcl: 'maritimo', maritimo: 'maritimo',
    dhl: 'dhl_liberacion', aa_dhl: 'dhl_liberacion', mx_cedis: 'dhl_liberacion', dhl_liberacion: 'dhl_liberacion',
    pobox_usa: 'po_box', po_box: 'po_box',
  };
  return m[s] || null;
};

(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // Órdenes a crédito vivas, con el servicio autoritativo de la orden.
    const ordenes = await c.query(`
      SELECT pp.id, pp.user_id, pp.amount, COALESCE(pp.credit_settled,false) settled,
             COALESCE(apo.service_type_cfg, owl.service_type) AS svc_raw
        FROM pobox_payments pp
        LEFT JOIN advisor_payment_orders apo ON apo.pobox_payment_id = pp.id
        LEFT JOIN LATERAL (
             SELECT service_type FROM openpay_webhook_logs
              WHERE transaction_id = pp.payment_reference AND service_type IS NOT NULL
              ORDER BY id DESC LIMIT 1
        ) owl ON TRUE
       WHERE LOWER(COALESCE(pp.payment_method,'')) = 'credit'
         AND pp.status NOT IN ('cancelled','expired')`);

    const esperado = new Map();  // "user|service" -> monto pendiente
    const sinServicio = [];
    for (const o of ordenes.rows) {
      const svc = norm(o.svc_raw);
      if (!svc) { if (!o.settled) sinServicio.push(o); continue; }
      if (o.settled) continue;
      const k = `${o.user_id}|${svc}`;
      esperado.set(k, (esperado.get(k) || 0) + (parseFloat(o.amount) || 0));
    }
    if (sinServicio.length) {
      console.log('⚠️  Órdenes a crédito vivas SIN servicio resoluble (se ignoran, revisar a mano):');
      console.table(sinServicio.map(o => ({ orden: o.id, user: o.user_id, monto: o.amount })));
    }

    const filas = await c.query(`
      SELECT c.id, c.user_id, u.box_id, u.full_name, c.service, c.credit_limit, c.used_credit, c.is_blocked
        FROM user_service_credits c JOIN users u ON u.id = c.user_id`);

    const cambios = [];
    for (const f of filas.rows) {
      const esp = +(esperado.get(`${f.user_id}|${f.service}`) || 0).toFixed(2);
      const real = parseFloat(f.used_credit) || 0;
      if (Math.abs(real - esp) < 0.01) continue;
      cambios.push({
        box: f.box_id, cliente: (f.full_name || '').slice(0, 24), servicio: f.service,
        limite: f.credit_limit, usado_antes: real.toFixed(2), usado_despues: esp.toFixed(2),
        libera: (real - esp).toFixed(2),
        disp_antes: (parseFloat(f.credit_limit) - real).toFixed(2),
        disp_despues: (parseFloat(f.credit_limit) - esp).toFixed(2),
      });
      await c.query(
        `UPDATE user_service_credits
            SET used_credit = $1::numeric,
                is_blocked = CASE WHEN $1::numeric <= 0 THEN FALSE ELSE is_blocked END,
                updated_at = NOW()
          WHERE id = $2`,
        [esp, f.id]
      );
    }

    console.log('\n=== CREDITOS RECALCULADOS ===');
    console.table(cambios);
    console.log('Total de crédito liberado: $',
      cambios.reduce((s, x) => s + parseFloat(x.libera), 0).toFixed(2), 'MXN');

    if (APPLY) { await c.query('COMMIT'); console.log('\n✅ APLICADO'); }
    else { await c.query('ROLLBACK'); console.log('\n🔎 DRY-RUN — nada se escribio. Correr con --apply para aplicar.'); }
  } catch (e) {
    await c.query('ROLLBACK'); console.error('ERROR:', e.message); process.exit(1);
  } finally { c.release(); await pool.end(); }
})();
