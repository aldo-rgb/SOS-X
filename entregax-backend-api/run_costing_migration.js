// Script para ejecutar migración de costing payment reference
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🚀 Ejecutando migración de costing payment...');
    
    // Verificar si la columna existe
    const checkResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'packages' 
      AND column_name IN ('costing_payment_reference', 'costing_paid_at', 'costing_paid')
    `);
    
    console.log('Columnas existentes:', checkResult.rows.map(r => r.column_name));
    
    // Agregar costing_paid si no existe
    if (!checkResult.rows.find(r => r.column_name === 'costing_paid')) {
      await client.query(`ALTER TABLE packages ADD COLUMN costing_paid BOOLEAN DEFAULT FALSE`);
      console.log('✅ Columna costing_paid agregada');
    } else {
      console.log('ℹ️ Columna costing_paid ya existe');
    }
    
    // Agregar costing_paid_at si no existe
    if (!checkResult.rows.find(r => r.column_name === 'costing_paid_at')) {
      await client.query(`ALTER TABLE packages ADD COLUMN costing_paid_at TIMESTAMP`);
      console.log('✅ Columna costing_paid_at agregada');
    } else {
      console.log('ℹ️ Columna costing_paid_at ya existe');
    }
    
    // Agregar costing_payment_reference si no existe
    if (!checkResult.rows.find(r => r.column_name === 'costing_payment_reference')) {
      await client.query(`ALTER TABLE packages ADD COLUMN costing_payment_reference VARCHAR(100)`);
      console.log('✅ Columna costing_payment_reference agregada');
    } else {
      console.log('ℹ️ Columna costing_payment_reference ya existe');
    }
    
    console.log('✅ Migración completada exitosamente');
    
  } catch (error) {
    console.error('❌ Error en migración:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
