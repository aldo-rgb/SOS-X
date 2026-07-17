/**
 * Reprocesa localmente los webhooks de pago.proveedor.confirmado que quedaron
 * con processed=false en entangled_webhook_logs (por el bug del UPDATE con
 * tipos inconsistentes).
 *
 * NO consulta a ENTANGLED: usa el payload que ya está guardado en el log —
 * ellos ya lo firmaron y aceptamos que es válido en su momento.
 *
 * Uso:
 *   node replay_pago_proveedor_logs.js --dry
 *   node replay_pago_proveedor_logs.js
 *   node replay_pago_proveedor_logs.js --transaccion 7f5e1d0e-d59e-489c-bb38-4ff49162c1ae
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const txIdx = args.indexOf('--transaccion');
const txFilter = txIdx >= 0 ? args[txIdx + 1] : null;

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Traer logs pendientes (processed=false) del evento pago.proveedor.confirmado
    const params = [];
    let extraWhere = '';
    if (txFilter) {
      params.push(txFilter);
      extraWhere = ` AND transaccion_id = $${params.length}`;
    }
    const logs = await client.query(
      `SELECT id, transaccion_id, evento, payload, process_error, received_at
         FROM entangled_webhook_logs
        WHERE processed = false
          AND evento = 'pago.proveedor.confirmado'
          ${extraWhere}
        ORDER BY received_at ASC`,
      params
    );

    console.log(`Logs pendientes: ${logs.rows.length}`);
    if (logs.rows.length === 0) {
      console.log('Nada que reprocesar.');
      await client.query('COMMIT');
      return;
    }

    let ok = 0;
    let skipped = 0;
    let failed = 0;

    for (const log of logs.rows) {
      const payload = log.payload || {};
      const transaccionId = payload.transaccion_id || log.transaccion_id;
      const referencia = payload.referencia_xpay || null;
      if (!transaccionId) {
        console.log(`  ⚠️  #${log.id} sin transaccion_id — skip`);
        skipped++;
        continue;
      }

      const found = await client.query(
        `SELECT id, servicio, estatus_global
           FROM entangled_payment_requests
          WHERE entangled_transaccion_id = $1`,
        [transaccionId]
      );
      if (found.rows.length === 0) {
        console.log(`  ⚠️  #${log.id} tx=${transaccionId} ref=${referencia} — request no existe, skip`);
        skipped++;
        continue;
      }
      const reqRow = found.rows[0];

      const docs = payload.documentos || {};
      const detalles = payload.detalles || {};
      const comprobanteUrl = docs.comprobante_proveedor || docs.url_comprobante_proveedor || null;
      const moneda = detalles.moneda_enviada || null;
      const monto = detalles.monto_enviado != null ? Number(detalles.monto_enviado) : null;
      const cuenta = detalles.cuenta_destino || null;
      const estatus = String(payload.estatus || detalles.estatus || 'completado').toLowerCase();
      const servicio = reqRow.servicio;

      console.log(
        `  → #${log.id} tx=${transaccionId} ref=${referencia}  estatus=${estatus} · comprobante=${comprobanteUrl ? 'sí' : 'no'}`
      );

      if (dryRun) continue;

      try {
        await client.query(
          `UPDATE entangled_payment_requests
              SET estatus_proveedor = $1::text,
                  comprobante_proveedor_url = COALESCE($2::text, comprobante_proveedor_url),
                  proveedor_moneda_enviada = COALESCE($3::text, proveedor_moneda_enviada),
                  proveedor_monto_enviado = COALESCE($4::numeric, proveedor_monto_enviado),
                  proveedor_cuenta_destino = COALESCE($5::text, proveedor_cuenta_destino),
                  proveedor_pagado_at = NOW(),
                  estatus_global = CASE
                    WHEN $1::text = 'completado' AND ($6::text = 'pago_sin_factura' OR estatus_factura = 'emitida') THEN 'completado'
                    WHEN $1::text = 'rechazado' THEN 'rechazado'
                    ELSE 'en_proceso'
                  END,
                  es_hibrida = COALESCE($8::boolean, es_hibrida),
                  es_pesos = COALESCE($9::boolean, es_pesos),
                  last_webhook_at = NOW(),
                  updated_at = NOW()
            WHERE id = $7::int`,
          [
            estatus,
            comprobanteUrl,
            moneda,
            monto,
            cuenta,
            servicio,
            reqRow.id,
            payload.es_hibrida != null ? Boolean(payload.es_hibrida) : null,
            payload.es_pesos != null ? Boolean(payload.es_pesos) : null,
          ]
        );

        // Marcar el log como procesado
        await client.query(
          `UPDATE entangled_webhook_logs
              SET processed = true,
                  process_error = 'replay OK — ' || COALESCE(process_error, '')
            WHERE id = $1`,
          [log.id]
        );
        ok++;
      } catch (e) {
        console.error(`     ❌ error UPDATE:`, e.message);
        failed++;
      }
    }

    if (dryRun) {
      console.log(`\n(dry-run) Habría reprocesado ${logs.rows.length} logs. No se aplicaron cambios.`);
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
      console.log(`\n✅ Reprocesados OK: ${ok} · Skipped: ${skipped} · Fallidos: ${failed}`);
    }
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
