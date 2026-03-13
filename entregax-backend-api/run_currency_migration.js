// Script para ejecutar migración de currency en caja chica
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Iniciando migración de currency en caja_chica...');
    
    // Agregar columna currency a caja_chica_transacciones
    await client.query(`
      ALTER TABLE caja_chica_transacciones 
      ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'MXN'
    `);
    console.log('✅ Columna currency agregada a caja_chica_transacciones');
    
    // Agregar columna currency a caja_chica_cortes
    await client.query(`
      ALTER TABLE caja_chica_cortes 
      ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'MXN'
    `);
    console.log('✅ Columna currency agregada a caja_chica_cortes');
    
    // Actualizar transacciones existentes como MXN
    const updateResult = await client.query(`
      UPDATE caja_chica_transacciones 
      SET currency = 'MXN' 
      WHERE currency IS NULL
    `);
    console.log(`✅ ${updateResult.rowCount} transacciones actualizadas a MXN`);
    
    // Crear índices
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_caja_chica_transacciones_currency 
      ON caja_chica_transacciones(currency)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_caja_chica_cortes_currency 
      ON caja_chica_cortes(currency)
    `);
    console.log('✅ Índices creados');
    
    console.log('🎉 Migración completada exitosamente!');
    
  } catch (error) {
    console.error('❌ Error en migración:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
