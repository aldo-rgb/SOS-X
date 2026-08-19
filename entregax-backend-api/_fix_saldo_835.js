// Recalcula el saldo de la guía 8350500432 tras corregir el impuesto: el saldo
// estaba replicado en las 3 cajas (cada una con el flete nacional completo).
const { Pool } = require('pg');
require('dotenv').config();
const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const NACIONAL = 1146.00; // flete cotizado del envío (3 cajas × $382)
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const f = (await c.query(
      `SELECT id, total_cost_mxn, COALESCE(monto_pagado,0) pagado, saldo_pendiente
         FROM dhl_shipments WHERE secondary_tracking='8350500432' ORDER BY id`)).rows;
    const costoTotal = f.reduce((s,x)=>s+Number(x.total_cost_mxn||0),0);
    const pagado = f.reduce((s,x)=>s+Number(x.pagado||0),0);
    const saldoEnvio = +(costoTotal + NACIONAL - pagado).toFixed(2);
    console.log(`costo 3 cajas (impuesto ya corregido): $${costoTotal.toFixed(2)}`);
    console.log(`+ flete nacional del envío           : $${NACIONAL.toFixed(2)}`);
    console.log(`- pagado                             : $${pagado.toFixed(2)}`);
    console.log(`= SALDO DEL ENVÍO                    : $${saldoEnvio.toFixed(2)}   (antes $15,204.45)`);
    let acum=0; const det=[];
    for (let i=0;i<f.length;i++){
      const prop = costoTotal>0 ? Number(f[i].total_cost_mxn||0)/costoTotal : 1/f.length;
      const parte = i===f.length-1 ? +(saldoEnvio-acum).toFixed(2) : +(saldoEnvio*prop).toFixed(2);
      acum+=parte;
      await c.query(`UPDATE dhl_shipments SET saldo_pendiente=$1, updated_at=NOW() WHERE id=$2`,[parte, f[i].id]);
      det.push({caja:f[i].id, costo:f[i].total_cost_mxn, saldo_antes:f[i].saldo_pendiente, saldo_ahora:parte.toFixed(2)});
    }
    console.table(det);
    console.log('suma repartida: $' + acum.toFixed(2));
    if (APPLY){ await c.query('COMMIT'); console.log('\n✅ APLICADO'); }
    else { await c.query('ROLLBACK'); console.log('\n🔎 DRY-RUN'); }
  } catch(e){ await c.query('ROLLBACK').catch(()=>{}); console.error('ERROR:',e.message); process.exit(1);}
  finally{ c.release(); await pool.end(); }
})();
