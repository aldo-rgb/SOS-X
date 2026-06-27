// Hotfix: refresca tarifas/costos/mínimos de proveedores ENTANGLED desde el API.
// Replica la lógica del cron (post-fix) sin necesidad de TS compile.
require('dotenv').config();
const axios = require('axios');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway',
  ssl: { rejectUnauthorized: false },
});

const extractTC = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') {
    const ef = v.valor_efectivo ?? v.valor_base ?? v.valor;
    return ef != null ? Number(ef) : null;
  }
  return null;
};

(async () => {
  const r = await axios.get('https://api.entangledclothing.com/api/v1/proveedores', {
    headers: { Authorization: 'Bearer ' + process.env.ENTANGLED_API_KEY, 'X-Source': 'XPAY' },
    timeout: 20000,
  });
  const proveedores = (r.data && r.data.proveedores) || [];
  console.log('Proveedores remotos:', proveedores.length);

  for (const p of proveedores) {
    const provTcUsd = extractTC(p.tipos_cambio?.USD) ?? 0;
    const provTcRmb = extractTC(p.tipos_cambio?.RMB) ?? 0;
    const pctConFactura = (() => {
      const t = (p.tarifas || []).find((x) => x.servicio_codigo === 'pago_con_factura');
      return t && t.comision_cliente_porcentaje != null ? Number(t.comision_cliente_porcentaje) : 0;
    })();
    const co = p.costo_operacion || {};
    const coUsd = co.USD || (String(co.moneda || 'USD').toUpperCase() === 'USD' ? co : null) || {};
    const coRmb = co.RMB || (String(co.moneda || '').toUpperCase() === 'RMB' ? co : null) || {};
    const costoOpFijoUsd = coUsd.monto_fijo != null ? Number(coUsd.monto_fijo) : 0;
    const costoOpPctUsd = coUsd.porcentaje != null ? Number(coUsd.porcentaje) : 0;
    const costoOpFijoRmb = coRmb.monto_fijo != null ? Number(coRmb.monto_fijo) : 0;
    const costoOpPctRmb = coRmb.porcentaje != null ? Number(coRmb.porcentaje) : 0;
    const costoOpMoneda = (co.moneda || 'USD').toString().slice(0, 8);
    const tarifaRef = (p.tarifas || []).find((x) => x.servicio_codigo === 'pago_con_factura') || (p.tarifas || [])[0];
    const minUsd = tarifaRef?.monto_minimo?.USD != null ? Number(tarifaRef.monto_minimo.USD) : 0;
    const minRmb = tarifaRef?.monto_minimo?.RMB != null ? Number(tarifaRef.monto_minimo.RMB) : 0;

    const upd = await pool.query(
      `UPDATE entangled_providers
          SET name                            = $1,
              descripcion                     = $2,
              tarifas                         = $3::jsonb,
              tipo_cambio_usd                 = $5,
              tipo_cambio_rmb                 = $6,
              porcentaje_compra               = $7,
              total_empresas_activas          = $8,
              remote_activo                   = $9,
              is_active                       = $9,
              costo_operacion_usd             = $10,
              costo_operacion_porcentaje      = $11,
              costo_operacion_moneda          = $12,
              min_operacion_usd               = $13,
              min_operacion_rmb               = $14,
              costo_operacion_rmb             = $15,
              costo_operacion_porcentaje_rmb  = $16,
              last_synced_at                  = NOW(),
              updated_at                      = NOW()
        WHERE external_id = $4
        RETURNING name, jsonb_array_length(tarifas) AS n_tarifas, is_active, total_empresas_activas`,
      [
        p.nombre,
        p.descripcion ?? null,
        JSON.stringify(p.tarifas || []),
        p.id,
        provTcUsd,
        provTcRmb,
        pctConFactura,
        Number(p.total_empresas_activas ?? 0) || 0,
        p.activo !== false,
        costoOpFijoUsd,
        costoOpPctUsd,
        costoOpMoneda,
        minUsd,
        minRmb,
        costoOpFijoRmb,
        costoOpPctRmb,
      ]
    );
    if (upd.rows[0]) {
      console.log('  ✓', upd.rows[0].name, '· tarifas:', upd.rows[0].n_tarifas, '· activo:', upd.rows[0].is_active, '· empresas:', upd.rows[0].total_empresas_activas);
    } else {
      console.log('  ⚠ external_id no encontrado en DB:', p.id, p.nombre);
    }
  }

  await pool.end();
})().catch((e) => { console.error('ERR', e); process.exit(1); });
