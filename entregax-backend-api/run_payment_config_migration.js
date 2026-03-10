// Script para ejecutar la migración de configuración de pagos
// Ejecutar: node run_payment_config_migration.js

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function runMigration() {
  console.log('🚀 Ejecutando migración de configuración de pagos...\n');
  
  const client = await pool.connect();
  try {
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations', 'add_payment_config_to_fiscal_emitters.sql'),
      'utf8'
    );
    
    await client.query(migrationSQL);
    
    console.log('✅ Migración ejecutada exitosamente\n');
    
    // Verificar que las columnas fueron agregadas
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'fiscal_emitters' 
        AND column_name IN ('bank_name', 'bank_clabe', 'bank_account', 'paypal_client_id', 'paypal_secret', 'paypal_sandbox', 'paypal_configured')
      ORDER BY column_name
    `);
    
    console.log('📋 Columnas en fiscal_emitters:');
    result.rows.forEach(r => console.log(`   - ${r.column_name} (${r.data_type})`));
    
    // Verificar columna payment_method en openpay_webhook_logs
    const paymentMethodCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'openpay_webhook_logs' AND column_name = 'payment_method'
    `);
    
    if (paymentMethodCheck.rows.length > 0) {
      console.log('\n✅ Columna payment_method existe en openpay_webhook_logs');
    }
    
    console.log('\n🎉 ¡Migración completada!');
    console.log('\n📌 Próximos pasos:');
    console.log('   1. Ve a Configuración > Empresas en el admin');
    console.log('   2. Configura la cuenta bancaria para cada empresa');
    console.log('   3. Configura las credenciales de PayPal si aplica');
    console.log('   4. Los pagos en efectivo ahora aparecerán en el Dashboard de Cobranza');
    
  } catch (error) {
    console.error('❌ Error ejecutando migración:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
