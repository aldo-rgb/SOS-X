require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function test() {
  try {
    // Usuarios cliente con código
    const users = await pool.query("SELECT id, email, referral_code FROM users WHERE role = 'client' LIMIT 5");
    console.log('Usuarios cliente:', users.rows);
    
    // Ver códigos en codigos_referido
    const codigos = await pool.query('SELECT * FROM codigos_referido LIMIT 5');
    console.log('\nCódigos en tabla codigos_referido:', codigos.rows);
    
    // Ver referidos
    const referidos = await pool.query('SELECT * FROM referidos LIMIT 5');
    console.log('\nReferidos:', referidos.rows);
    
    // Ver función
    const func = await pool.query("SELECT proname FROM pg_proc WHERE proname = 'generate_referral_code'");
    console.log('\nFunción generate_referral_code existe:', func.rows.length > 0);
    
    if (func.rows.length === 0) {
      console.log('\n⚠️ La función generate_referral_code NO EXISTE - hay que crearla');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
  pool.end();
}
test();
