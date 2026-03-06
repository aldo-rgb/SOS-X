// Script para ejecutar la migración de pagos PO Box - Multisucursal
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function runMigration() {
  try {
    const migrationPath = path.join(__dirname, 'migrations', 'create_pobox_payments_table.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('🚀 Ejecutando migración de tabla pobox_payments (Multisucursal)...');
    await pool.query(sql);
    console.log('✅ Migración completada exitosamente');
    
    // Verificar que se creó
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'pobox_payments' 
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Columnas de la tabla pobox_payments:');
    result.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });
    
    // Verificar service_companies
    const scResult = await pool.query(`
      SELECT service, company_name, bank_clabe FROM service_companies WHERE service = 'po_box'
    `);
    console.log('\n📋 Configuración service_companies para po_box:', scResult.rows[0] || 'No encontrada');
    
  } catch (error) {
    console.error('❌ Error ejecutando migración:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
