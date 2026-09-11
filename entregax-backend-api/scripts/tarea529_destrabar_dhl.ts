/**
 * Tarea 529 — destrabar las guías DHL pagadas que nunca se marcaron.
 *
 * Usa la misma función que corre a diario en el cron, así que esto es
 * literalmente la primera pasada de la red de seguridad.
 *
 *   npx ts-node scripts/tarea529_destrabar_dhl.ts            (solo reporte)
 *   npx ts-node scripts/tarea529_destrabar_dhl.ts --aplicar
 */
import { pool } from '../src/db';
import { destrabarPagosRezagados } from '../src/dhlPagoRezagado';

const APLICAR = process.argv.includes('--aplicar');
const f = (n: number) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 });

(async () => {
  try {
    const r = await destrabarPagosRezagados({ soloReportar: !APLICAR });
    console.log(`\nÓrdenes rezagadas encontradas: ${r.revisadas}`);
    for (const x of r.destrabadas) {
      console.log(`  ${x.orden}  ${x.clienteBox}  ${f(x.monto)}  ` +
        `guía(s) ${x.guias.join(', ')}  ·  ${(x.horas / 24).toFixed(1)} días esperando`);
    }
    if (!APLICAR) console.log('\nSolo reporte: no se tocó nada. Corre con --aplicar.');
    else console.log('\nAplicado.');
  } catch (e: any) {
    console.error('ERR:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
