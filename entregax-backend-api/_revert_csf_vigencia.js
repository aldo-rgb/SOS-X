/**
 * Revierte _fix_csf_vigencia.ts: regresa a NULL el issued_at/valid_until de las
 * 46 constancias que ese script rellenó el 2026-08-21.
 *
 * Se revierte por decisión del dev temporal: prefiere dejar el comportamiento
 * como estaba hasta que Aldo confirme por qué esas filas no tenían vigencia.
 *
 * Ventana EXACTA de la ráfaga del script: 18:28:58 – 18:29:20 del 2026-08-21.
 * Queda fuera a propósito la fila id=140, actualizada a las 18:21:07 por una
 * subida real de un usuario, que NO debe tocarse.
 *
 * Dry-run por defecto. --apply para escribir.
 */
const { Pool } = require('pg');
require('dotenv').config();

const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// updated_at es `timestamp without time zone`: se comparan valores crudos,
// no timestamptz (con tz la conversión desplaza la ventana y no casa nada).
const DESDE = '2026-08-21 18:28:58';
const HASTA = '2026-08-21 18:29:20';
const ESPERADAS = 46;

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT d.id, u.box_id, u.full_name, d.issued_at::date AS emitida, d.valid_until::date AS vence
         FROM user_saved_documents d JOIN users u ON u.id = d.user_id
        WHERE d.document_type = 'constancia_fiscal'
          AND d.updated_at >= $1::timestamp AND d.updated_at < $2::timestamp
        ORDER BY d.id
        FOR UPDATE OF d`,
      [DESDE, HASTA]
    );

    console.log(`filas en la ventana del script: ${rows.length} (se esperaban ${ESPERADAS})`);
    if (rows.length !== ESPERADAS) {
      console.error('ABORTA: el conteo no coincide, no se toca nada.');
      await client.query('ROLLBACK');
      return;
    }
    for (const r of rows) {
      console.log(`  ${String(r.box_id).padEnd(8)} ${String(r.full_name).slice(0, 30).padEnd(30)} ${r.emitida} → ${r.vence}   se regresa a NULL`);
    }

    const upd = await client.query(
      `UPDATE user_saved_documents
          SET issued_at = NULL, valid_until = NULL, updated_at = NOW()
        WHERE document_type = 'constancia_fiscal'
          AND updated_at >= $1::timestamp AND updated_at < $2::timestamp`,
      [DESDE, HASTA]
    );
    console.log(`\nfilas revertidas: ${upd.rowCount}`);

    if (APPLY) {
      await client.query('COMMIT');
      console.log('APLICADO.');
    } else {
      await client.query('ROLLBACK');
      console.log('DRY-RUN (sin cambios). Usa --apply para escribir.');
    }
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ERROR, rollback:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
