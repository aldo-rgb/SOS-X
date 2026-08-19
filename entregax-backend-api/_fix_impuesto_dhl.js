// Corrige el impuesto DHL cobrado por CAJA en guías multicaja: la regla es un
// solo cobro por envío (hasta 5 cajas). Solo toca guías SIN nota de impuestos
// —cuando hay nota, el reparto entre piezas es correcto— y SIN cajas pagadas,
// para no alterar cobros ya cerrados.
//   node _fix_impuesto_dhl.js [--apply]
const { Pool } = require('pg');
require('dotenv').config();
const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const g = await c.query(`
      SELECT ds.secondary_tracking guia, ds.user_id, u.box_id, COUNT(*)::int cajas,
             SUM(ds.import_tax_mxn)::numeric cobrado, MAX(ds.import_tax_mxn)::numeric por_caja
        FROM dhl_shipments ds LEFT JOIN users u ON u.id=ds.user_id
       WHERE COALESCE(ds.secondary_tracking,'')<>'' AND COALESCE(ds.import_tax_mxn,0)>0
       GROUP BY ds.secondary_tracking, ds.user_id, u.box_id
      HAVING COUNT(*)>1
         AND COUNT(*) FILTER (WHERE ds.paid_at IS NOT NULL)=0
         AND NOT EXISTS (
              SELECT 1 FROM petty_cash_movements p
               WHERE p.category='impuestos_dhl' AND p.movement_type='expense' AND p.status='approved'
                 AND p.concept = ds.secondary_tracking)`);

    const cambios=[];
    for (const x of g.rows) {
      const bloques = Math.ceil(Number(x.cajas)/5);
      const correcto = bloques * Number(x.por_caja);
      const exceso = +(Number(x.cobrado) - correcto).toFixed(2);
      if (exceso <= 0.01) continue;
      // Las cajas se ordenan por id: las de inicio de bloque (1, 6, 11...) llevan
      // el impuesto; el resto va a 0. total_cost se recalcula desde usd×TC.
      const cajas = (await c.query(
        `SELECT id FROM dhl_shipments WHERE secondary_tracking=$1 AND user_id IS NOT DISTINCT FROM $2 ORDER BY id`,
        [x.guia, x.user_id])).rows;
      for (let i=0;i<cajas.length;i++){
        const lleva = i % 5 === 0 ? Number(x.por_caja) : 0;
        await c.query(
          `UPDATE dhl_shipments
              SET import_tax_mxn = $1,
                  import_cost_mxn = ROUND(COALESCE(import_cost_usd,0)::numeric*COALESCE(exchange_rate,0)::numeric + $1::numeric, 2),
                  total_cost_mxn  = ROUND(COALESCE(import_cost_usd,0)::numeric*COALESCE(exchange_rate,0)::numeric + $1::numeric + COALESCE(national_cost_mxn,0)::numeric, 2),
                  updated_at = NOW()
            WHERE id = $2`, [lleva, cajas[i].id]);
      }
      cambios.push({ guia:x.guia, box:x.box_id, cajas:x.cajas, antes:x.cobrado,
        despues:correcto.toFixed(2), devuelto:exceso.toFixed(2) });
    }
    console.log('=== IMPUESTO CORREGIDO (guías sin nota y sin cajas pagadas) ===');
    console.table(cambios);
    console.log('Total dejado de cobrar de más: $' + cambios.reduce((s,x)=>s+Number(x.devuelto),0).toFixed(2));
    if (APPLY) { await c.query('COMMIT'); console.log('\n✅ APLICADO'); }
    else { await c.query('ROLLBACK'); console.log('\n🔎 DRY-RUN'); }
  } catch(e){ await c.query('ROLLBACK').catch(()=>{}); console.error('ERROR:',e.message); process.exit(1); }
  finally { c.release(); await pool.end(); }
})();
