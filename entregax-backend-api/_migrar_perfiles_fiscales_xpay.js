/**
 * Etapas A y B de unificar los datos fiscales (pendiente #7).
 *
 * Decisión de Aldo: `client_fiscal_profiles` es la fuente de verdad. Es la
 * única multi-perfil con is_default —lo que el dropdown de razones sociales
 * necesita— y ya hace write-through a users.fiscal_* para la facturación de
 * envíos. `entangled_fiscal_profiles` solo admite un perfil por usuario.
 *
 * A) Prepara el destino:
 *    - agrega la columna `email`, que client_fiscal_profiles no tenía y XPAY
 *      sí exige (el backend valida los 6 campos en pago_con_factura).
 *    - índice único por (user_id, rfc) para que la migración sea idempotente
 *      y no se dupliquen razones sociales.
 *
 * B) Migra los perfiles que hoy SOLO viven en entangled_fiscal_profiles.
 *    Se marcan is_default porque esos clientes no tienen ningún perfil en
 *    EntregaX; a quien ya tenga uno no se le toca el default.
 *
 * NO migra los perfiles de S1 ni S2: los dos son de prueba ("PRueba SA de CV").
 * S1 es la cuenta de Aldo y su perfil real ya está en EntregaX; S2 solo tiene
 * una operación cancelada de junio con esos datos.
 *
 * NO toca todavía de dónde lee ni escribe XPAY: eso son las etapas C y D.
 *
 * Dry-run por defecto. --apply para escribir.
 */
const { Pool } = require('pg');
require('dotenv').config();

const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Perfiles de prueba, no se migran: ambos con razón social "PRueba SA de CV"
// y RFC de prueba. S1 es la cuenta de Aldo; S2 solo tiene una operación
// cancelada de junio con esos datos.
const EXCLUIR_BOX = ['S1', 'S2'];

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── A) Preparar el destino ──────────────────────────────────────────
    console.log('A) Preparando client_fiscal_profiles');
    const tieneEmail = (await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_name = 'client_fiscal_profiles' AND column_name = 'email'`
    )).rowCount > 0;
    if (tieneEmail) {
      console.log('   columna email: ya existe');
    } else {
      await client.query(`ALTER TABLE client_fiscal_profiles ADD COLUMN email TEXT`);
      console.log('   columna email: agregada');
    }

    const dupes = (await client.query(
      `SELECT user_id, UPPER(TRIM(rfc)) AS rfc, COUNT(*)::int AS n
         FROM client_fiscal_profiles GROUP BY 1,2 HAVING COUNT(*) > 1`
    )).rows;
    if (dupes.length) {
      console.error('   ABORTA: ya hay (user_id, rfc) duplicados, el índice único fallaría:', JSON.stringify(dupes));
      await client.query('ROLLBACK'); return;
    }
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_cfp_user_rfc
         ON client_fiscal_profiles (user_id, UPPER(TRIM(rfc)))`
    );
    console.log('   índice único (user_id, rfc): listo');

    // ── B) Migrar los que solo viven en XPAY ────────────────────────────
    console.log('\nB) Perfiles que solo viven en XPAY');
    const { rows } = await client.query(
      `SELECT e.user_id, u.box_id, u.full_name, e.rfc, e.razon_social,
              e.regimen_fiscal, e.cp, e.uso_cfdi, e.email,
              (SELECT COUNT(*)::int FROM client_fiscal_profiles c WHERE c.user_id = e.user_id) AS ya_tiene
         FROM entangled_fiscal_profiles e
         JOIN users u ON u.id = e.user_id
        WHERE NOT EXISTS (SELECT 1 FROM client_fiscal_profiles c WHERE c.user_id = e.user_id)
          AND NOT (u.box_id = ANY($1))
        ORDER BY u.box_id`,
      [EXCLUIR_BOX]
    );

    let migrados = 0;
    for (const r of rows) {
      const esDefault = r.ya_tiene === 0; // no tiene ninguno en EntregaX
      console.log(
        `   ${String(r.box_id).padEnd(7)} ${String(r.full_name).slice(0, 26).padEnd(26)} ` +
        `${r.rfc}  ${String(r.razon_social).slice(0, 24).padEnd(24)} ` +
        `reg ${r.regimen_fiscal} · cp ${r.cp} · ${r.uso_cfdi}${esDefault ? '  [default]' : ''}`
      );
      const ins = await client.query(
        `INSERT INTO client_fiscal_profiles
           (user_id, razon_social, rfc, codigo_postal, regimen_fiscal, uso_cfdi, email, is_default)
         VALUES ($1, $2, UPPER(TRIM($3)), $4, $5, $6, NULLIF($7, ''), $8)
         ON CONFLICT (user_id, UPPER(TRIM(rfc))) DO NOTHING`,
        [r.user_id, r.razon_social, r.rfc, r.cp, r.regimen_fiscal, r.uso_cfdi, r.email, esDefault]
      );
      migrados += ins.rowCount;
    }

    console.log(`\n   candidatos: ${rows.length} · insertados: ${migrados}`);
    console.log(`   excluidos a propósito: ${EXCLUIR_BOX.join(', ')} (perfil de pruebas)`);

    const total = (await client.query(`SELECT COUNT(*)::int AS n FROM client_fiscal_profiles`)).rows[0].n;
    console.log(`   client_fiscal_profiles quedaría con ${total} perfiles`);

    if (APPLY) { await client.query('COMMIT'); console.log('\nAPLICADO.'); }
    else { await client.query('ROLLBACK'); console.log('\nDRY-RUN (sin cambios). Usa --apply para escribir.'); }
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ERROR, rollback:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
