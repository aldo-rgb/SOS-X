// Corrige la reversion de _fix_pagos_parciales.js: el abono se replico en cada
// guia hija (monto_pagado = deposito en las 21 cajas) en vez de aplicarse una
// sola vez al master. El cobro de un envio multipieza va a nivel master, asi
// que las hijas no deben llevar abono ni saldo propio.
const { Pool } = require('pg');
require('dotenv').config();
const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
// [orden, master_id, monto_orden, depositado]
const CASOS = [ [310, 9529, 35211.80, 1796.72], [795, 14029, 2260.94, 1477.94] ];
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    for (const [orden, masterId, montoOrden, depositado] of CASOS) {
      // Hijas: sin abono ni saldo propio (como estaban antes de la reversion).
      const h = await c.query(
        `UPDATE packages SET monto_pagado = 0, saldo_pendiente = NULL, updated_at = NOW()
          WHERE master_id = $1 RETURNING id`, [masterId]);
      // Master: el abono una sola vez y el saldo contra el monto de la ORDEN
      // (incluye paqueteria y otros conceptos, no solo pobox_service_cost).
      const saldo = +(montoOrden - depositado).toFixed(2);
      await c.query(
        `UPDATE packages SET monto_pagado = $2::numeric, saldo_pendiente = $3::numeric, updated_at = NOW()
          WHERE id = $1`, [masterId, depositado, saldo]);
      console.log(`orden ${orden} · master ${masterId}: abono $${depositado} · saldo $${saldo} · hijas limpiadas: ${h.rowCount}`);
    }
    const v = await c.query(`
      SELECT id, tracking_internal guia, master_id, client_paid, monto_pagado, saldo_pendiente
        FROM packages WHERE id IN (9529,14029) OR master_id IN (9529,14029) ORDER BY id LIMIT 8`);
    console.log('\n=== RESULTADO (muestra) ==='); console.table(v.rows);
    const tot = await c.query(`
      SELECT SUM(COALESCE(saldo_pendiente,0))::numeric s1 FROM packages WHERE id=9529 OR master_id=9529`);
    const tot2 = await c.query(`
      SELECT SUM(COALESCE(saldo_pendiente,0))::numeric s2 FROM packages WHERE id=14029 OR master_id=14029`);
    console.log(`\nS3128 adeuda: $${tot.rows[0].s1}  (esperado 33415.08)`);
    console.log(`S3442 adeuda: $${tot2.rows[0].s2}  (esperado 783.00)`);
    if (APPLY) { await c.query('COMMIT'); console.log('\n✅ APLICADO'); }
    else { await c.query('ROLLBACK'); console.log('\n🔎 DRY-RUN'); }
  } catch (e) { await c.query('ROLLBACK'); console.error('ERROR:', e.message); process.exit(1); }
  finally { c.release(); await pool.end(); }
})();
