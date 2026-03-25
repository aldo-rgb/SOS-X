const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway'
});

async function run() {
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', 'add_advisor_commissions.sql'),
      'utf8'
    );
    console.log('Ejecutando migración: add_advisor_commissions.sql ...');
    await pool.query(sql);
    console.log('✅ Migración ejecutada exitosamente');

    // Verificar la tabla
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'advisor_commissions' 
      ORDER BY ordinal_position
    `);
    console.log('\nColumnas de advisor_commissions:');
    res.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

    // Verificar commission_rates existentes
    const rates = await pool.query('SELECT id, service_type, label, percentage, leader_override, fixed_fee, is_gex FROM commission_rates ORDER BY id');
    console.log('\nCommission rates actuales:');
    rates.rows.forEach(r => console.log(`  [${r.id}] ${r.service_type} (${r.label}) - ${r.percentage}% | leader: ${r.leader_override}% | fixed: ${r.fixed_fee} | gex: ${r.is_gex}`));
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

run();
