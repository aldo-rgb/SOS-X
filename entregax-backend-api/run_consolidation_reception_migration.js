const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway',
});

(async () => {
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', 'add_consolidation_reception.sql'),
      'utf8'
    );
    console.log('🚀 Ejecutando migración add_consolidation_reception.sql...');
    await pool.query(sql);
    console.log('✅ Migración completada');

    // Verificar columnas
    const check = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE (table_name='packages' AND column_name IN ('missing_on_arrival','missing_reported_at'))
         OR (table_name='consolidations' AND column_name IN ('received_mty_at','received_mty_by'))
      ORDER BY table_name, column_name
    `);
    console.log('📋 Columnas:', check.rows);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
