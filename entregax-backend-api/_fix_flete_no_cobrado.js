/**
 * TKT-2026-2266 — Flete nacional no generado cuando el ASESOR asignaba instrucciones.
 *
 * El handler del asesor (advisorPanelController, rama DHL) solo guardaba
 * delivery_address_id: nunca national_carrier ni national_cost_mxn. Resultado:
 * se generaba la guía real de Paquete Express y la orden de pago salía sin
 * flete nacional. Corregido en el commit 3f501b5.
 *
 * Este script repara SOLO las guías que aún NO están pagadas (instrucción de
 * Aldo: "los ya cerrados se quedan como están"). Precio al cliente = la misma
 * regla del sistema (pqtxPricePerBox): costo/caja < $300 → $400; si no,
 * ceil(costo) + $100. El costo real del proveedor sale de pqtx_shipments.
 *
 * Dry-run por defecto. node _fix_flete_no_cobrado.js --apply para escribir.
 */
const { Pool } = require('pg');
require('dotenv').config();
const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const precioPorCaja = (costoPorCaja) => costoPorCaja < 300 ? 400 : Math.ceil(costoPorCaja) + 100;

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(`
      SELECT ds.id, ds.secondary_tracking AS envio, u.box_id, ds.national_tracking,
             ds.import_cost_usd, ds.exchange_rate, ds.import_tax_mxn, ds.total_cost_mxn,
             px.total AS costo_prov, px.pieces AS piezas
        FROM dhl_shipments ds
        JOIN users u ON u.id = ds.user_id
        JOIN pqtx_shipments px ON px.tracking_number = ds.national_tracking
       WHERE ds.national_tracking IS NOT NULL AND ds.national_tracking <> ''
         AND COALESCE(ds.national_cost_mxn, 0) = 0
         AND LOWER(COALESCE(ds.national_carrier,'')) NOT IN ('local','por cobrar','pqtx_cod','otra')
         AND ds.paid_at IS NULL
         AND COALESCE(px.total, 0) > 0
       ORDER BY u.box_id, ds.secondary_tracking, ds.id
       FOR UPDATE OF ds`);

    // Guardas: ninguna puede estar dentro de una orden de pago ya emitida, ni
    // traer abono parcial. Si alguna lo estuviera, subir el total la desincroniza.
    const ids = rows.map(r => r.id);
    if (ids.length === 0) { console.log('Nada que corregir.'); await client.query('ROLLBACK'); return; }
    const bloqueo = await client.query(
      `SELECT id, folio, status FROM advisor_payment_orders
        WHERE package_uids ?| $1::text[] AND status NOT IN ('cancelado')`, [ids.map(i => 'DHL-' + i)]);
    const conSaldo = await client.query(
      `SELECT id FROM dhl_shipments WHERE id = ANY($1)
         AND (COALESCE(saldo_pendiente,0) <> 0 OR COALESCE(monto_pagado,0) <> 0)`, [ids]);
    if (bloqueo.rows.length || conSaldo.rows.length) {
      console.error('ABORTA: hay guías en orden de pago o con abono parcial.',
        { ordenes: bloqueo.rows, conSaldo: conSaldo.rows.map(r => r.id) });
      await client.query('ROLLBACK'); return;
    }

    let totalFlete = 0;
    for (const r of rows) {
      const piezas = Math.max(1, Number(r.piezas) || 1);
      const perBox = precioPorCaja(Number(r.costo_prov) / piezas);
      const nuevoTotal = Math.round(
        (Number(r.import_cost_usd) * Number(r.exchange_rate) + Number(r.import_tax_mxn) + perBox) * 100) / 100;
      console.log(`${r.box_id.padEnd(6)} envío ${r.envio}  id=${String(r.id).padStart(3)}  ` +
        `guía nac ${r.national_tracking}  prov $${Number(r.costo_prov).toFixed(2)}/${piezas}  ` +
        `→ flete $${perBox}  total ${Number(r.total_cost_mxn).toFixed(2)} → ${nuevoTotal.toFixed(2)}`);
      totalFlete += perBox;
      await client.query(
        `UPDATE dhl_shipments
            SET national_cost_mxn = $2,
                total_cost_mxn = ROUND(
                  COALESCE(import_cost_usd,0)::numeric * COALESCE(exchange_rate,0)::numeric
                  + COALESCE(import_tax_mxn,0)::numeric + $2::numeric, 2),
                updated_at = NOW()
          WHERE id = $1 AND COALESCE(national_cost_mxn,0) = 0 AND paid_at IS NULL`,
        [r.id, perBox]);
    }

    console.log(`\n${rows.length} guías · flete nacional recuperado $${totalFlete.toFixed(2)}`);
    if (APPLY) { await client.query('COMMIT'); console.log('APLICADO.'); }
    else { await client.query('ROLLBACK'); console.log('DRY-RUN (sin cambios). Usa --apply para escribir.'); }
  } catch (e) {
    await client.query('ROLLBACK'); console.error('ERROR, rollback:', e.message);
  } finally { client.release(); await pool.end(); }
})();
