// Cotiza PQTX para los paquetes de RO-45496271 y asigna national_shipping_cost
// + actualiza el total de la orden RO + el pobox_payments correspondiente.
// Para casos aislados como éste donde el carrier quedó asignado pero el costo
// nunca se calculó (porque la dirección de los hijos era huérfana).
require('dotenv').config();
const axios = require('axios');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway',
  ssl: { rejectUnauthorized: false },
});

const PQTX_BASE = process.env.PQTX_BASE_URL || 'https://qaglp.paquetexpress.com.mx';
const QUSER = process.env.PQTX_QUOTE_USER || 'WSQURBANWOD';
const QPASS = process.env.PQTX_QUOTE_PASSWORD || '1234';
const QTOKEN = process.env.PQTX_QUOTE_TOKEN || '4DB7391907B749C5E063350AA8C0215D';
const ORIG_ZIP = process.env.PQTX_ORIGIN_ZIP || '64410';

async function quotePqtx(destZip, packageCount, weight, length, width, height) {
  const shipments = [];
  for (let i = 0; i < packageCount; i++) {
    shipments.push({ sequence: i + 1, quantity: 1, shpCode: '2', weight, longShip: length, widthShip: width, highShip: height });
  }
  const body = {
    header: {
      security: { user: QUSER, password: QPASS, type: 1, token: QTOKEN },
      device: { appName: 'EntregaX', type: 'Web', ip: '', idDevice: '' },
      target: { module: 'QUOTER', version: '1.0', service: 'quoter', uri: 'quotes', event: 'R' },
      output: 'JSON', language: null,
    },
    body: {
      request: {
        data: {
          clientAddrOrig: { zipCode: ORIG_ZIP, colonyName: 'CENTRO' },
          clientAddrDest: { zipCode: destZip, colonyName: 'CENTRO' },
          services: { dlvyType: '1', ackType: 'N', totlDeclVlue: 1000, invType: 'A', radType: '1' },
          otherServices: { otherServices: [] },
          shipmentDetail: { shipments },
          quoteServices: ['ALL'],
        },
        objectDTO: null,
      },
      response: null,
    },
  };
  const url = `${PQTX_BASE}/WsQuotePaquetexpress/api/apiQuoter/v2/getQuotation`;
  const r = await axios.post(url, body, { headers: { 'Content-Type': 'application/json' }, timeout: 25000 });
  const respBody = r.data?.body?.response;
  const quotations = respBody?.data?.quotations || [];
  if (!respBody?.success || quotations.length === 0) {
    return { ok: false };
  }
  const cheapest = quotations.reduce((min, q) => {
    const qt = parseFloat(q.amount?.totalAmnt || q.totalAmnt || '0');
    const mt = parseFloat(min.amount?.totalAmnt || min.totalAmnt || '0');
    return qt < mt ? q : min;
  }, quotations[0]);
  const pqtxTotal = parseFloat(cheapest.amount?.totalAmnt || cheapest.totalAmnt || '0');
  // Regla actual del backend: precio fijo $400/caja al cliente.
  return { ok: true, pqtxTotal, pricePerBox: 400, clientTotal: 400 * packageCount, packageCount };
}

(async () => {
  const c = await pool.connect();
  try {
    // 1. Leer paquetes
    const pkgs = await c.query(
      `SELECT id, tracking_internal, is_master, master_id, weight,
              pkg_length, pkg_width, pkg_height, total_boxes,
              national_shipping_cost
         FROM packages
        WHERE id IN (10305, 10752)
        ORDER BY id`
    );

    const DEST_ZIP = '81200';
    const updates = [];

    for (const m of pkgs.rows) {
      const boxes = m.is_master ? Number(m.total_boxes) : 1;
      // Para multi-pieza usar dimensiones/peso PROMEDIO de las hijas
      let perWeight, avgL, avgW, avgH;
      if (m.is_master) {
        const ch = await c.query(
          `SELECT weight, pkg_length, pkg_width, pkg_height FROM packages WHERE master_id=$1`,
          [m.id]
        );
        const arr = ch.rows;
        const tot = arr.reduce((s, x) => s + (parseFloat(x.weight) || 0), 0) || boxes;
        perWeight = tot / Math.max(boxes, 1);
        avgL = Math.round(arr.reduce((s, x) => s + (parseFloat(x.pkg_length) || 0), 0) / arr.length || 30);
        avgW = Math.round(arr.reduce((s, x) => s + (parseFloat(x.pkg_width) || 0), 0) / arr.length || 30);
        avgH = Math.round(arr.reduce((s, x) => s + (parseFloat(x.pkg_height) || 0), 0) / arr.length || 30);
      } else {
        perWeight = parseFloat(m.weight) || 1;
        avgL = Math.round(parseFloat(m.pkg_length) || 30);
        avgW = Math.round(parseFloat(m.pkg_width) || 30);
        avgH = Math.round(parseFloat(m.pkg_height) || 30);
      }

      console.log(`\n📦 ${m.tracking_internal} (${boxes} caja${boxes > 1 ? 's' : ''}, ${perWeight.toFixed(1)} kg/caja, ${avgL}×${avgW}×${avgH} cm)`);

      const q = await quotePqtx(DEST_ZIP, boxes, perWeight, avgL, avgW, avgH);
      if (!q.ok) {
        console.log(`   ❌ Sin cobertura PQTX para CP ${DEST_ZIP}`);
        continue;
      }
      console.log(`   PQTX cotizó: $${q.pqtxTotal.toFixed(2)} → CLIENTE: $${q.clientTotal} ($${q.pricePerBox}/caja)`);
      updates.push({ id: m.id, tracking: m.tracking_internal, cost: q.clientTotal });
    }

    if (updates.length === 0) {
      console.log('\nNo se aplican cambios.');
      return;
    }

    // 2. Actualizar national_shipping_cost de cada master
    await c.query('BEGIN');
    let extra = 0;
    for (const u of updates) {
      await c.query(
        `UPDATE packages SET national_shipping_cost = $1, updated_at = NOW() WHERE id = $2`,
        [u.cost, u.id]
      );
      extra += u.cost;
      console.log(`   ✓ ${u.tracking}: national_shipping_cost = $${u.cost.toFixed(2)}`);
    }

    // 3. Recalcular total de la orden RO-45496271 y pobox_payment ligado
    const order = await c.query(
      `SELECT id, total_mxn, pobox_payment_id FROM advisor_payment_orders
        WHERE payment_reference = 'RO-45496271'`
    );
    if (order.rows.length > 0) {
      const oldTotal = Number(order.rows[0].total_mxn);
      const newTotal = +(oldTotal + extra).toFixed(2);
      await c.query(
        `UPDATE advisor_payment_orders SET total_mxn = $1, updated_at = NOW() WHERE id = $2`,
        [newTotal, order.rows[0].id]
      );
      console.log(`\n💳 RO-45496271: total_mxn $${oldTotal.toFixed(2)} → $${newTotal.toFixed(2)} (+$${extra.toFixed(2)})`);
      const poboxId = order.rows[0].pobox_payment_id;
      if (poboxId) {
        await c.query(
          `UPDATE pobox_payments SET amount = $1 WHERE id = $2`,
          [newTotal, poboxId]
        );
        console.log(`   ✓ pobox_payments.id=${poboxId} actualizado`);
      }
    } else {
      console.log('\n⚠️ Orden RO-45496271 no encontrada (¿se canceló?)');
    }

    await c.query('COMMIT');
    console.log('\n✅ Listo. El cliente verá el nuevo total al recargar.');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('ERROR:', e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
