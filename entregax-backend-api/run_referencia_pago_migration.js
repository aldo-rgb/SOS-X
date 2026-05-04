const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway'
});

async function run() {
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', 'add_referencia_pago_entangled.sql'),
      'utf8'
    );
    console.log('Ejecutando migración: add_referencia_pago_entangled.sql ...');
    await pool.query(sql);
    console.log('✅ Migración ejecutada exitosamente');

    const res = await pool.query(`
      SELECT id, referencia_pago FROM entangled_payment_requests ORDER BY id LIMIT 10
    `);
    console.log('\nPrimeras referencias generadas:');
    res.rows.forEach(r => console.log(`  #${r.id} → ${r.referencia_pago}`));
  } catch (err) {
    console.error('❌ Error en migración:', err.message);
  } finally {
    await pool.end();
  }
}

run();
