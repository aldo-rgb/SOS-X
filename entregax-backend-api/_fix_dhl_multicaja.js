// Repara envíos DHL multicaja que quedaron a medias: una caja pagada / con
// etiqueta y sus hermanas no, porque las rutas de pago e impresión marcaban
// solo la caja referenciada por la orden en vez del envío completo.
//
// El grupo es (secondary_tracking + user_id): hay al menos un secondary_tracking
// compartido por dos clientes distintos, y propagar sin el cliente marcaría
// pagada la caja de un tercero.
//
// Corre en DRY-RUN salvo que se pase --apply.
const { Pool } = require('pg');
require('dotenv').config();
const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // ── 1) PAGO: grupos donde alguna caja está pagada y otras no ──
    const pagoAntes = await c.query(`
      SELECT s.id, s.secondary_tracking, s.user_id, s.inbound_tracking, s.cost_payment_status
        FROM dhl_shipments s
       WHERE COALESCE(s.secondary_tracking,'') <> ''
         AND s.cost_payment_status IS DISTINCT FROM 'paid'
         AND EXISTS (
              SELECT 1 FROM dhl_shipments h
               WHERE h.secondary_tracking = s.secondary_tracking
                 AND h.user_id IS NOT DISTINCT FROM s.user_id
                 AND h.cost_payment_status = 'paid'
         )
       ORDER BY s.secondary_tracking, s.id`);
    console.log('=== CAJAS SIN PAGO cuyo envío YA está pagado ===', pagoAntes.rows.length);
    console.table(pagoAntes.rows);

    await c.query(`
      UPDATE dhl_shipments s
         SET paid_at = COALESCE(s.paid_at, CURRENT_TIMESTAMP),
             cost_payment_status = 'paid',
             monto_pagado = COALESCE(s.total_cost_mxn, s.saldo_pendiente, 0),
             saldo_pendiente = 0
       WHERE COALESCE(s.secondary_tracking,'') <> ''
         AND s.cost_payment_status IS DISTINCT FROM 'paid'
         AND EXISTS (
              SELECT 1 FROM dhl_shipments h
               WHERE h.secondary_tracking = s.secondary_tracking
                 AND h.user_id IS NOT DISTINCT FROM s.user_id
                 AND h.cost_payment_status = 'paid'
         )`);

    // ── 2) ETIQUETA: grupos donde alguna caja tiene etiqueta y otras no ──
    const lblAntes = await c.query(`
      SELECT s.id, s.secondary_tracking, s.user_id, s.inbound_tracking
        FROM dhl_shipments s
       WHERE COALESCE(s.secondary_tracking,'') <> ''
         AND COALESCE(s.national_label_url,'') = ''
         AND EXISTS (
              SELECT 1 FROM dhl_shipments h
               WHERE h.secondary_tracking = s.secondary_tracking
                 AND h.user_id IS NOT DISTINCT FROM s.user_id
                 AND COALESCE(h.national_label_url,'') <> ''
         )
       ORDER BY s.secondary_tracking, s.id`);
    console.log('\n=== CAJAS SIN ETIQUETA cuyo envío YA tiene etiqueta ===', lblAntes.rows.length);
    console.table(lblAntes.rows);

    await c.query(`
      UPDATE dhl_shipments s
         SET national_label_url = (
               SELECT h.national_label_url FROM dhl_shipments h
                WHERE h.secondary_tracking = s.secondary_tracking
                  AND h.user_id IS NOT DISTINCT FROM s.user_id
                  AND COALESCE(h.national_label_url,'') <> ''
                ORDER BY h.id LIMIT 1
             ),
             updated_at = NOW()
       WHERE COALESCE(s.secondary_tracking,'') <> ''
         AND COALESCE(s.national_label_url,'') = ''
         AND EXISTS (
              SELECT 1 FROM dhl_shipments h
               WHERE h.secondary_tracking = s.secondary_tracking
                 AND h.user_id IS NOT DISTINCT FROM s.user_id
                 AND COALESCE(h.national_label_url,'') <> ''
         )`);

    // ── Verificación ──
    const resto = await c.query(`
      SELECT COUNT(*)::int n FROM (
        SELECT secondary_tracking, user_id FROM dhl_shipments
         WHERE COALESCE(secondary_tracking,'') <> ''
         GROUP BY secondary_tracking, user_id
        HAVING (COUNT(*) FILTER (WHERE cost_payment_status='paid') > 0
                AND COUNT(*) FILTER (WHERE cost_payment_status IS DISTINCT FROM 'paid') > 0)
            OR (COUNT(*) FILTER (WHERE COALESCE(national_label_url,'') <> '') > 0
                AND COUNT(*) FILTER (WHERE COALESCE(national_label_url,'') = '') > 0)
      ) t`);
    console.log('\n>>> Grupos que siguen inconsistentes despues del fix:', resto.rows[0].n);

    if (APPLY) { await c.query('COMMIT'); console.log('\n✅ APLICADO'); }
    else { await c.query('ROLLBACK'); console.log('\n🔎 DRY-RUN — nada se escribio. Correr con --apply para aplicar.'); }
  } catch (e) {
    await c.query('ROLLBACK'); console.error('ERROR:', e.message); process.exit(1);
  } finally { c.release(); await pool.end(); }
})();
