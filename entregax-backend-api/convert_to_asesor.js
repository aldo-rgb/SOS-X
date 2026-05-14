// Convierte un empleado a rol "asesor" buscando por teléfono o nombre.
// Uso: node convert_to_asesor.js
const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const PHONE = '8113814329';
const NAME_HINT = 'Jaqueline Minero';
const NEW_ROLE = 'asesor';

(async () => {
  try {
    // Localizar usuario por teléfono (varias columnas posibles) o por nombre
    const found = await pool.query(
      `SELECT id, full_name, email, role, phone
         FROM users
        WHERE phone = $1 OR full_name ILIKE $2
        ORDER BY id ASC`,
      [PHONE, `%${NAME_HINT}%`]
    );

    if (found.rows.length === 0) {
      console.log('❌ No se encontró ningún usuario con tel', PHONE, 'o nombre', NAME_HINT);
      process.exit(1);
    }

    console.log('🔎 Candidatos encontrados:');
    found.rows.forEach((u) => console.log(`  · #${u.id} ${u.full_name} · rol=${u.role} · tel=${u.phone || '—'}`));

    const target = found.rows[0];
    console.log(`\n✏️  Cambiando rol de #${target.id} (${target.full_name}) de "${target.role}" → "${NEW_ROLE}"`);

    const upd = await pool.query(
      `UPDATE users SET role = $1 WHERE id = $2 RETURNING id, full_name, role`,
      [NEW_ROLE, target.id]
    );
    console.log('✅ Actualizado:', upd.rows[0]);
  } catch (err) {
    console.error('💥 Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
