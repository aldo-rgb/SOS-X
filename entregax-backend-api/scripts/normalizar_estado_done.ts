/**
 * Normalizar las tareas que quedaron con el estado 'done'.
 *
 * Los estados reales son 'open', 'awaiting_confirmation', 'completed' y
 * 'cancelled'. Hay 5 tareas con 'done', todas de Cajito, todas cerradas en una
 * misma corrida el 5-sep-2026 a las 14:38:57.849 — mismo `completed_at` al
 * milisegundo y sin renglón en la bitácora: fue un UPDATE masivo de una sola vez,
 * no el flujo normal. Nada del código actual escribe 'done'.
 *
 * El daño es que cada pantalla filtra distinto y ninguna acierta:
 *   · la app pide `status IN ('open','awaiting_confirmation')` → NO las muestra,
 *     y por eso las tareas de Cajito no aparecían completas en el teléfono;
 *   · la web pide `status <> 'completed'` → las cuenta como ABIERTAS.
 *
 * Tienen `completed_at`, así que están terminadas: se les pone 'completed'.
 *
 *   npx ts-node scripts/normalizar_estado_done.ts            (simulación)
 *   npx ts-node scripts/normalizar_estado_done.ts --aplicar
 */
import { pool } from '../src/db';

const APLICAR = process.argv.includes('--aplicar');

async function main() {
  const cx = await pool.connect();
  try {
    await cx.query('BEGIN');
    const r = await cx.query(
      `SELECT id, title, completed_at, assignee_id FROM tasks WHERE status = 'done' ORDER BY id FOR UPDATE`);
    if (r.rows.length === 0) { console.log('No hay tareas con estado "done".'); await cx.query('ROLLBACK'); return; }

    const sinCerrar = r.rows.filter((t: any) => !t.completed_at);
    console.log(`Tareas con estado "done": ${r.rows.length}`);
    for (const t of r.rows) {
      console.log(`  #${t.id}  ${t.title}  · cerrada ${t.completed_at ? new Date(t.completed_at).toISOString().slice(0,16).replace('T',' ') : '— SIN FECHA'}`);
    }
    if (sinCerrar.length > 0) {
      // Sin completed_at no se puede afirmar que esté terminada; se para.
      throw new Error(`${sinCerrar.length} no tienen completed_at: hay que revisarlas a mano antes de darlas por cerradas.`);
    }

    if (!APLICAR) { await cx.query('ROLLBACK'); console.log('\nSimulación: no se tocó nada. Corre con --aplicar.'); return; }

    const u = await cx.query(
      `UPDATE tasks SET status = 'completed', updated_at = NOW() WHERE status = 'done' RETURNING id`);
    await cx.query('COMMIT');
    console.log(`\nNormalizadas ${u.rowCount} tarea(s) a 'completed'.`);
  } catch (e: any) {
    await cx.query('ROLLBACK');
    console.error('ERR:', e.message);
    process.exitCode = 1;
  } finally {
    cx.release();
    await pool.end();
  }
}

main();
