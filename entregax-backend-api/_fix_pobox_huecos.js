// Fix TKT-2026-2190: guias PO Box generadas con venta $0 por huecos en el tabulador.
// Cierra los rangos de pobox_tarifas_volumen (semiabiertos [min,max)) y recotiza
// las guias afectadas. Corre en DRY-RUN salvo que se pase --apply.
const { Pool } = require('pg');
require('dotenv').config();
const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Rangos semiabiertos: el max de un nivel = el min del siguiente.
const RANGOS = [ {nivel:1,max:0.0300}, {nivel:2,max:0.0600}, {nivel:3,max:0.1000}, {nivel:4,max:null} ];

const nivelPara = (cbm, tarifas) => {
  const c = cbm < 0.010 ? 0.010 : cbm;
  return tarifas.find(t => {
    const min = parseFloat(t.cbm_min) || 0;
    const max = t.cbm_max ? parseFloat(t.cbm_max) : Infinity;
    return c >= min && c < max;
  });
};

(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // 1) Cerrar los huecos del tabulador
    for (const r of RANGOS) {
      await c.query('UPDATE pobox_tarifas_volumen SET cbm_max = $1, updated_at = NOW() WHERE nivel = $2', [r.max, r.nivel]);
    }
    const tarifas = (await c.query('SELECT * FROM pobox_tarifas_volumen WHERE estado = TRUE ORDER BY nivel')).rows;
    console.log('=== TABULADOR RESULTANTE ===');
    console.table(tarifas.map(t=>({nivel:t.nivel, desde:t.cbm_min, hasta:t.cbm_max ?? '(sin tope)', costo:t.costo, tipo:t.tipo_cobro})));

    // 2) Recotizar guias con venta $0 que SI tienen dimensiones, creadas desde
    //    el cambio de tabulador del 29-jul, y que NO esten pagadas.
    const afect = (await c.query(`
      SELECT p.id, p.tracking_internal, p.user_id, u.full_name, p.master_id,
             p.pkg_length*p.pkg_width*p.pkg_height/1000000.0 AS cbm,
             p.pobox_venta_usd, p.pobox_tarifa_nivel, p.pobox_service_cost,
             p.registered_exchange_rate, p.client_paid, p.payment_status
        FROM packages p LEFT JOIN users u ON u.id = p.user_id
       WHERE p.service_type = 'POBOX_USA'
         AND COALESCE(p.pobox_venta_usd,0) = 0
         AND COALESCE(p.pkg_length,0) > 0 AND COALESCE(p.pkg_width,0) > 0 AND COALESCE(p.pkg_height,0) > 0
         AND p.created_at >= '2026-07-29'
         AND p.client_paid = FALSE
         -- El costo interno SI se calculo: la guia paso por el cotizador y solo
         -- fallo la venta por el hueco. Esto excluye los Kits de Bienvenida
         -- (USK-), que son regalo y van en $0 a proposito.
         AND COALESCE(p.pobox_cost_usd,0) > 0
         AND p.tracking_internal NOT LIKE 'USK-%'
       ORDER BY p.id`)).rows;

    const cambios = [];
    for (const p of afect) {
      const t = nivelPara(parseFloat(p.cbm), tarifas);
      if (!t) { console.warn('  sin tarifa para', p.tracking_internal); continue; }
      const cbmT = Math.max(parseFloat(p.cbm), 0.010);
      let ventaUsd = t.tipo_cobro === 'fijo' ? parseFloat(t.costo) : cbmT * parseFloat(t.costo);
      if (t.tipo_cobro !== 'fijo') {
        const ant = tarifas.find(x => x.nivel === t.nivel - 1);
        if (ant && ventaUsd < parseFloat(ant.costo)) ventaUsd = parseFloat(ant.costo);
      }
      const tc = parseFloat(p.registered_exchange_rate) || 0;
      const ventaMxn = +(ventaUsd * tc).toFixed(2);
      cambios.push({ id:p.id, guia:p.tracking_internal, cliente:p.full_name, cbm:parseFloat(p.cbm).toFixed(5),
                     nivel_antes:p.pobox_tarifa_nivel, nivel_nuevo:t.nivel,
                     venta_antes:p.pobox_venta_usd, venta_nueva:ventaUsd.toFixed(2), tc, mxn_nuevo:ventaMxn, master:p.master_id });
      await c.query(
        `UPDATE packages SET pobox_venta_usd=$1, pobox_tarifa_nivel=$2, pobox_service_cost=$3, updated_at=NOW() WHERE id=$4`,
        [ventaUsd.toFixed(2), t.nivel, ventaMxn, p.id]
      );
    }
    console.log('\n=== GUIAS RECOTIZADAS ===');
    console.table(cambios);
    console.log('Total recuperado: USD', cambios.reduce((s,x)=>s+parseFloat(x.venta_nueva),0).toFixed(2),
                '| MXN', cambios.reduce((s,x)=>s+x.mxn_nuevo,0).toFixed(2));

    // 3) Recalcular los masters que tenian hijas en $0
    const masters = [...new Set(cambios.filter(x=>x.master).map(x=>x.master))];
    const mres = [];
    for (const mid of masters) {
      const r = await c.query(
        `UPDATE packages m SET
           pobox_venta_usd = COALESCE((SELECT SUM(COALESCE(pobox_venta_usd,0)) FROM packages WHERE master_id=$1),0),
           pobox_service_cost = COALESCE((SELECT SUM(COALESCE(pobox_service_cost,0)) FROM packages WHERE master_id=$1),0),
           updated_at = NOW()
         WHERE m.id=$1 RETURNING id, tracking_internal, pobox_venta_usd, pobox_service_cost`, [mid]);
      mres.push(r.rows[0]);
    }
    if (mres.length) { console.log('\n=== MASTERS RECALCULADOS ==='); console.table(mres); }

    if (APPLY) { await c.query('COMMIT'); console.log('\n✅ APLICADO'); }
    else { await c.query('ROLLBACK'); console.log('\n🔎 DRY-RUN — nada se escribio. Correr con --apply para aplicar.'); }
  } catch (e) {
    await c.query('ROLLBACK'); console.error('ERROR:', e.message); process.exit(1);
  } finally { c.release(); await pool.end(); }
})();
