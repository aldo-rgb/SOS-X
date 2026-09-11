/**
 * Tarea 531 — marcar la caja US-8526838544-0008 como duplicada.
 *
 * NO se borra: es la evidencia de que el doble envío ocurrió, y borrarla dejaría
 * la orden RO-7792E066 cobrando 15 cajas contra 14 filas, sin nada que lo
 * explique. Se marca con `duplicado_de` apuntando a la caja real (la -0009) y
 * las vistas la dejan fuera del conteo.
 *
 * La columna es nueva y se crea aquí mismo; sirve para cualquier caso futuro.
 *
 *   npx ts-node scripts/tarea531_marcar_caja_duplicada.ts            (simulación)
 *   npx ts-node scripts/tarea531_marcar_caja_duplicada.ts --aplicar
 */
import { pool } from '../src/db';

const APLICAR = process.argv.includes('--aplicar');
const FANTASMA = 'US-8526838544-0008';
const REAL = 'US-8526838544-0009';

async function main() {
  const cx = await pool.connect();
  try {
    await cx.query('BEGIN');
    await cx.query(`ALTER TABLE packages ADD COLUMN IF NOT EXISTS duplicado_de INTEGER`);
    await cx.query(`COMMENT ON COLUMN packages.duplicado_de IS
      'Caja registrada dos veces por doble envío en la recepción. Apunta a la caja real. Las vistas la excluyen del conteo; no se borra para conservar la evidencia.'`);
    await cx.query(`CREATE INDEX IF NOT EXISTS idx_packages_duplicado_de
                      ON packages (duplicado_de) WHERE duplicado_de IS NOT NULL`);

    const r = await cx.query(
      `SELECT id, tracking_internal, status, consolidation_id, duplicado_de
         FROM packages WHERE tracking_internal IN ($1,$2) ORDER BY tracking_internal`,
      [FANTASMA, REAL]);
    if (r.rows.length !== 2) throw new Error('No encontré las dos cajas');
    const [fantasma, real] = r.rows;
    if (fantasma.consolidation_id) throw new Error('La caja fantasma sí viajó; no se marca');
    if (fantasma.duplicado_de) { console.log('Ya estaba marcada.'); await cx.query('ROLLBACK'); return; }

    console.log(`  ${real.tracking_internal} (id ${real.id}) — la real, ${real.status}`);
    console.log(`  ${fantasma.tracking_internal} (id ${fantasma.id}) — duplicada, ${fantasma.status}`);
    console.log(`  → packages.duplicado_de = ${real.id}`);

    if (!APLICAR) { await cx.query('ROLLBACK'); console.log('\nSimulación: no se marcó. Corre con --aplicar.'); return; }

    await cx.query(
      `UPDATE packages
          SET duplicado_de = $1,
              notes = TRIM(BOTH E'\n' FROM COALESCE(notes,'') || E'\n' ||
                'Caja duplicada por doble envío en la recepción (tarea 531). La caja real es ' || $2 ||
                '. Se le devolvió el cobro al cliente como saldo a favor.'),
              updated_at = NOW()
        WHERE id = $3`,
      [real.id, real.tracking_internal, fantasma.id]);

    await cx.query('COMMIT');
    console.log('\nMarcada.');
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
