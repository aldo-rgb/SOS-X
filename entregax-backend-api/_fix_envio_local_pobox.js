/**
 * Envío local no cobrado en guías PO Box con "Entregax Local" (entregax_pobox).
 *
 * El carrier se dio de alta el 5-ago con $99 por paquete y gratis desde 3, pero
 * el flujo del ASESOR no leía esos campos, así que national_shipping_cost quedó
 * en 0. Causa corregida en b5e9a79.
 *
 * Por decisión de Aldo este script corrige SOLO las que el cliente aún NO ha
 * pagado. Las 55 ya pagadas de menos se quedan como están.
 *
 * Qué hace, por guía:
 *   · national_shipping_cost = $99 × cajas  (cajas < 3; desde 3 es gratis)
 *
 * NUNCA modifica una orden de pago ya generada. Decisión de Aldo: si la orden
 * ya salió, el cliente no debe pagar ese costo de más.
 *
 * Guardas:
 *   · nunca toca guías ya pagadas
 *   · si la guía tiene una orden VIVA con el monto viejo, se SALTA completa:
 *     ni la orden ni la guía, para no descuadrarlas entre sí
 *   · si la orden viva YA incluye el envío (US-4157064725, reemitida a mano),
 *     sí se alinea el campo de la guía: el cliente ya lo va a pagar
 *
 * Dry-run por defecto. --apply para escribir.
 */
const { Pool } = require('pg');
require('dotenv').config();

const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const PRECIO = 99, GRATIS_DESDE = 3;

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT p.id, p.tracking_internal, u.box_id, a.full_name AS asesor,
              GREATEST(COALESCE(p.total_boxes, 1), 1) AS cajas,
              COALESCE(p.pobox_service_cost, 0)::numeric AS servicio,
              COALESCE(p.national_shipping_cost, 0)::numeric AS envio_actual,
              p.payment_status, COALESCE(p.client_paid, false) AS client_paid
         FROM packages p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN users a ON a.id = COALESCE(u.advisor_id, u.referred_by_id)
        WHERE p.national_carrier = 'entregax_pobox'
          AND COALESCE(p.national_shipping_cost, 0) = 0
          AND p.master_id IS NULL
          AND GREATEST(COALESCE(p.total_boxes, 1), 1) < $1
          AND p.payment_status <> 'paid'
          AND COALESCE(p.client_paid, false) = false
        ORDER BY p.created_at DESC
        FOR UPDATE OF p`,
      [GRATIS_DESDE]
    );

    console.log(`guías por corregir: ${rows.length}\n`);
    let totalEnvio = 0, corregidas = 0, saltadas = 0;

    for (const g of rows) {
      const cajas = Number(g.cajas);
      const envio = PRECIO * cajas;
      const esperado = Number(g.servicio) + envio;
      const etiqueta = `${g.tracking_internal}  ${String(g.box_id).padEnd(7)} ${String(g.asesor).slice(0, 22).padEnd(22)} ${cajas} caja`;

      // Órdenes vivas de esa guía. Si hay una con el monto VIEJO, la guía se
      // salta completa: no se modifica una orden ya generada, y dejar solo el
      // campo la descuadraría contra su propia orden.
      const ords = await client.query(
        `SELECT id, payment_reference, amount::numeric AS amount, status
           FROM pobox_payments
          WHERE package_ids @> $1::jsonb
            AND status IN ('pending', 'pending_payment', 'vouchers_partial', 'vouchers_submitted')`,
        [JSON.stringify([g.id])]
      );
      const desactualizada = ords.rows.find(
        (o) => Math.abs(Number(o.amount) - esperado) >= 0.02
      );
      if (desactualizada) {
        saltadas++;
        console.log(`${etiqueta} → SE SALTA: ya tiene la orden ${desactualizada.payment_reference} por $${Number(desactualizada.amount).toFixed(2)} (${desactualizada.status})`);
        continue;
      }

      totalEnvio += envio;
      const yaEmitida = ords.rows.length > 0;
      console.log(`${etiqueta} · servicio $${Number(g.servicio).toFixed(2)} + envío $${envio.toFixed(2)} = $${esperado.toFixed(2)}` +
        (yaEmitida ? `   (orden ${ords.rows[0].payment_reference} ya la incluye)` : ''));

      const upd = await client.query(
        `UPDATE packages SET national_shipping_cost = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND COALESCE(national_shipping_cost, 0) = 0`,
        [g.id, envio]
      );
      corregidas += upd.rowCount;
    }

    console.log(`\nguías corregidas: ${corregidas} · envío local aplicado $${totalEnvio.toFixed(2)}`);
    console.log(`saltadas por tener orden ya generada: ${saltadas}`);
    console.log('órdenes de pago modificadas: 0 (nunca se tocan)');

    if (APPLY) { await client.query('COMMIT'); console.log('\nAPLICADO.'); }
    else { await client.query('ROLLBACK'); console.log('\nDRY-RUN (sin cambios). Usa --apply para escribir.'); }
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ERROR, rollback:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
