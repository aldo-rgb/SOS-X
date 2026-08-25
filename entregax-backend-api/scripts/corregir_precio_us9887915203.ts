/**
 * Repreciar la guía US-9887915203 (tarea 369 / TKT-2026-2347).
 *
 * Se cotizó en $650 USD por el bug del piso del nivel anterior: la tarifa N3
 * personalizada del cliente ($650/m³) se usó como piso plano en vez de como
 * precio por metro cúbico. Con el tabulador vigente la caja vale
 * 0.15249 m³ × $750/m³ = $114.37 USD.
 *
 * Hace lo mismo que PATCH /api/admin/packages/:id/pobox-costo, incluido
 * recalcular el master si fuera una guía hija (si no, el cambio no se refleja
 * en lo que se le cobra al cliente).
 *
 * Uso:  npx ts-node scripts/corregir_precio_us9887915203.ts          → simulacro
 *       npx ts-node scripts/corregir_precio_us9887915203.ts --apply
 */
require('dotenv').config();
import { pool } from '../src/db';

const APPLY = process.argv.includes('--apply');
const GUIA = 'US-9887915203';
const f = (n: any) => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });

(async () => {
  const pkg = (await pool.query(
    `SELECT id, tracking_internal, master_id, user_id, pkg_length l, pkg_width w, pkg_height h,
            pobox_venta_usd, pobox_service_cost, pobox_tarifa_nivel,
            registered_exchange_rate, payment_status, client_paid
       FROM packages WHERE tracking_internal = $1`, [GUIA])).rows[0];
  if (!pkg) { console.log('guía no encontrada'); await pool.end(); return; }

  if (pkg.client_paid || pkg.payment_status === 'paid') {
    console.log('La guía ya está PAGADA: no se reprecia. Requiere decisión aparte.');
    await pool.end(); return;
  }

  // Precio con el tabulador vigente (mismo algoritmo que calculatePOBoxCost,
  // ya con el piso corregido).
  const tarifas = (await pool.query(
    `SELECT nivel, cbm_min, cbm_max, costo, tipo_cobro FROM pobox_tarifas_volumen WHERE estado ORDER BY nivel`)).rows;
  const ovs = (await pool.query(
    `SELECT nivel, costo, tipo_cobro FROM pobox_client_tarifas WHERE client_user_id = $1 AND estado`, [pkg.user_id])).rows;
  for (const o of ovs) {
    const t = tarifas.find((x: any) => Number(x.nivel) === Number(o.nivel));
    if (t) { t.costo = o.costo; t.tipo_cobro = o.tipo_cobro || t.tipo_cobro; }
  }

  const cbmReal = (Number(pkg.l) * Number(pkg.w) * Number(pkg.h)) / 1000000;
  const cbm = cbmReal < 0.010 ? 0.010 : cbmReal;
  const ap = tarifas.find((x: any) =>
    cbm >= (parseFloat(x.cbm_min) || 0) && cbm < (x.cbm_max ? parseFloat(x.cbm_max) : Infinity));
  if (!ap) { console.log('el CBM no cae en ningún nivel del tabulador'); await pool.end(); return; }

  let ventaUsd = ap.tipo_cobro === 'fijo' ? parseFloat(ap.costo) : cbm * parseFloat(ap.costo);
  const ant = tarifas.find((x: any) => Number(x.nivel) === Number(ap.nivel) - 1);
  if (ant) {
    const piso = ant.tipo_cobro === 'fijo'
      ? parseFloat(ant.costo)
      : (ant.cbm_max ? parseFloat(ant.cbm_max) * parseFloat(ant.costo) : parseFloat(ant.costo));
    if (ventaUsd < piso) ventaUsd = piso;
  }
  ventaUsd = +ventaUsd.toFixed(2);

  let tc = parseFloat(pkg.registered_exchange_rate) || 0;
  if (!tc) {
    const r = await pool.query(
      "SELECT tipo_cambio_final FROM exchange_rate_config WHERE servicio = 'pobox_usa' AND estado = TRUE LIMIT 1");
    tc = parseFloat(r.rows[0]?.tipo_cambio_final) || 0;
  }
  const ventaMxn = +(ventaUsd * tc).toFixed(2);

  console.log(`${APPLY ? 'APLICANDO' : 'SIMULACRO'}\n`);
  console.log(`   ${GUIA} · ${pkg.l}×${pkg.w}×${pkg.h} cm = ${cbmReal.toFixed(5)} m³ · Nivel ${ap.nivel}`);
  console.log(`   overrides del cliente: ${ovs.length || 'ninguno'}`);
  console.log(`   tarifa aplicada: ${f(ap.costo)} ${ap.tipo_cobro}`);
  console.log(`   ANTES:   ${f(pkg.pobox_venta_usd)} USD = ${f(pkg.pobox_service_cost)} MXN`);
  console.log(`   DESPUES: ${f(ventaUsd)} USD × ${tc} = ${f(ventaMxn)} MXN`);
  console.log(`   baja ${f(Number(pkg.pobox_venta_usd) - ventaUsd)} USD = ${f(Number(pkg.pobox_service_cost) - ventaMxn)} MXN`);
  console.log(`   guía hija: ${pkg.master_id ? 'sí, master ' + pkg.master_id : 'no'}`);

  if (!APPLY) { console.log('\nSin cambios. Corre con --apply.'); await pool.end(); return; }

  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `UPDATE packages
          SET pobox_venta_usd = $1, pobox_service_cost = $2,
              pobox_tarifa_nivel = $3,
              registered_exchange_rate = COALESCE(NULLIF(registered_exchange_rate, 0), $4),
              updated_at = NOW()
        WHERE id = $5`,
      [ventaUsd.toFixed(2), ventaMxn, ap.nivel, tc || null, pkg.id]);

    if (pkg.master_id) {
      await c.query(
        `UPDATE packages m
            SET pobox_venta_usd    = COALESCE((SELECT SUM(COALESCE(pobox_venta_usd,0))    FROM packages WHERE master_id = $1), 0),
                pobox_service_cost = COALESCE((SELECT SUM(COALESCE(pobox_service_cost,0)) FROM packages WHERE master_id = $1), 0),
                updated_at = NOW()
          WHERE m.id = $1`, [pkg.master_id]);
    }
    await c.query('COMMIT');
  } catch (e: any) {
    await c.query('ROLLBACK');
    console.error('ERROR, se revirtió todo:', e.message);
    c.release(); await pool.end(); return;
  }
  c.release();

  const v = (await pool.query(
    `SELECT pobox_venta_usd, pobox_service_cost, pobox_tarifa_nivel FROM packages WHERE id = $1`, [pkg.id])).rows[0];
  console.log(`\nVERIFICACION: ${f(v.pobox_venta_usd)} USD = ${f(v.pobox_service_cost)} MXN · Nivel ${v.pobox_tarifa_nivel}`);
  await pool.end();
})();
