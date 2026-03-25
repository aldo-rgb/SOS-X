const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:lMgXIwNKGRSQQWJaLgmsjWoOrFTZBnIj@switchyard.proxy.rlwy.net:47527/railway' });

async function test() {
  try {
    // Verificar si existe la tabla
    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name IN ('codigos_referido', 'referrals', 'referidos')");
    console.log('Tablas encontradas:', tables.rows);
    
    // Verificar usuarios con referral_code
    const users = await pool.query("SELECT id, name, email, referral_code FROM users WHERE role = 'client' AND referral_code IS NOT NULL LIMIT 5");
    console.log('\nUsuarios cliente con código:', users.rows);
    
    // Ver columnas de users
    const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name LIKE '%referr%'");
    console.log('\nColumnas referral en users:', cols.rows);
    
    // Si existe codigos_referido, ver contenido
    if (tables.rows.some(t => t.table_name === 'codigos_referido')) {
      const codigos = await pool.query('SELECT * FROM codigos_referido LIMIT 5');
      console.log('\nCódigos referido:', codigos.rows);
    }
    
    // Ver si existe la función generate_referral_code
    const func = await pool.query("SELECT proname FROM pg_proc WHERE proname = 'generate_referral_code'");
    console.log('\nFunción generate_referral_code existe:', func.rows.length > 0);
    
  } catch (err) {
    console.error('Error:', err.message);
  }
  pool.end();
}
test();
