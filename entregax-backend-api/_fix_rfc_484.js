/**
 * Corrige el RFC de Claudio Alejandro Ambriz Salas (S3040, user 484).
 * El guardado tenía 12 caracteres —imposible en una persona física— porque se
 * perdió el último dígito. El valor bueno se leyó de su propia constancia de
 * situación fiscal, que ya estaba en S3: AISC870412384.
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const MALO = 'AISC87041238', BUENO = 'AISC870412384';
(async () => {
  const aplicar = process.argv.includes('--aplicar');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    console.log('antes:');
    console.table((await c.query(`SELECT 'client_fiscal_profiles' t, rfc FROM client_fiscal_profiles WHERE user_id=484
                                  UNION ALL SELECT 'entangled_fiscal_profiles', rfc FROM entangled_fiscal_profiles WHERE user_id=484
                                  UNION ALL SELECT 'users.fiscal_rfc', fiscal_rfc FROM users WHERE id=484`)).rows);
    await c.query(`UPDATE client_fiscal_profiles SET rfc=$2 WHERE user_id=484 AND rfc=$1`, [MALO, BUENO]);
    await c.query(`UPDATE entangled_fiscal_profiles SET rfc=$2, updated_at=NOW() WHERE user_id=484 AND rfc=$1`, [MALO, BUENO]);
    await c.query(`UPDATE users SET fiscal_rfc=$2 WHERE id=484 AND fiscal_rfc=$1`, [MALO, BUENO]);
    console.log('después:');
    console.table((await c.query(`SELECT 'client_fiscal_profiles' t, rfc FROM client_fiscal_profiles WHERE user_id=484
                                  UNION ALL SELECT 'entangled_fiscal_profiles', rfc FROM entangled_fiscal_profiles WHERE user_id=484
                                  UNION ALL SELECT 'users.fiscal_rfc', fiscal_rfc FROM users WHERE id=484`)).rows);
    // La solicitud 191 ya está completada: conserva el RFC con el que se mandó.
    if (aplicar) { await c.query('COMMIT'); console.log('COMMIT'); }
    else { await c.query('ROLLBACK'); console.log('ROLLBACK (ensayo)'); }
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); await pool.end(); }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
