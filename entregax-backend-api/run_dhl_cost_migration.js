// Script para ejecutar migración de tarifas de costo DHL
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Iniciando migración de tarifas de costo DHL...\n');

    // Leer archivo SQL
    const sqlPath = path.join(__dirname, 'migrations', 'add_dhl_cost_rates.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Ejecutar migración
    console.log('📝 Ejecutando migración...');
    await client.query(sql);
    
    console.log('✅ Migración completada exitosamente!\n');

    // Mostrar tarifas creadas
    const result = await client.query('SELECT * FROM dhl_cost_rates');
    console.log('📊 Tarifas de costo creadas:');
    console.table(result.rows);

  } catch (error) {
    console.error('❌ Error en migración:', error.message);
    throw error;
  } finally {
    client.release();
  }
  
  await pool.end();
}

runMigration()
  .then(() => {
    console.log('\n🎉 Proceso completado');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 Error:', err);
    process.exit(1);
  });
