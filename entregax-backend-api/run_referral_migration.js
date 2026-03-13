// Script para ejecutar la migración del sistema de referidos y billetera
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Iniciando migración del Sistema de Referidos y Monedero Digital...\n');
    
    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, 'migrations', 'create_referral_wallet_system.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Ejecutar la migración
    await client.query('BEGIN');
    
    console.log('📦 Creando tablas y estructuras...');
    await client.query(sql);
    
    await client.query('COMMIT');
    
    console.log('\n✅ Migración completada exitosamente!\n');
    
    // Verificar resultados
    console.log('📊 Verificando resultados:\n');
    
    // Contar billeteras creadas
    const billeteras = await client.query('SELECT COUNT(*) FROM billetera_digital');
    console.log(`   💰 Billeteras creadas: ${billeteras.rows[0].count}`);
    
    // Contar códigos generados
    const codigos = await client.query('SELECT COUNT(*) FROM codigos_referido');
    console.log(`   🎟️  Códigos de referido: ${codigos.rows[0].count}`);
    
    // Contar usuarios con código
    const usersConCodigo = await client.query('SELECT COUNT(*) FROM users WHERE referral_code IS NOT NULL');
    console.log(`   👤 Usuarios con código: ${usersConCodigo.rows[0].count}`);
    
    // Mostrar configuración de referidos
    const config = await client.query("SELECT config_value FROM system_configurations WHERE config_key = 'referral_settings'");
    if (config.rows.length > 0) {
      const settings = config.rows[0].config_value;
      console.log('\n📋 Configuración de Referidos:');
      console.log(`   • Bono para quien refiere: $${settings.referrer_bonus} ${settings.currency}`);
      console.log(`   • Bono para el referido: $${settings.referred_bonus} ${settings.currency}`);
      console.log(`   • Monto mínimo de primera compra: $${settings.minimum_order_amount} ${settings.currency}`);
      console.log(`   • Requiere primer pago: ${settings.require_first_payment ? 'Sí' : 'No'}`);
    }
    
    // Mostrar algunos códigos de ejemplo
    const ejemplos = await client.query(`
      SELECT u.full_name, cr.codigo 
      FROM codigos_referido cr 
      JOIN users u ON cr.usuario_id = u.id 
      WHERE cr.tipo = 'personal' 
      LIMIT 5
    `);
    if (ejemplos.rows.length > 0) {
      console.log('\n🎯 Ejemplos de códigos generados:');
      ejemplos.rows.forEach(e => {
        console.log(`   ${e.full_name}: ${e.codigo}`);
      });
    }
    
    console.log('\n🎉 Sistema de Referidos y Monedero Digital configurado correctamente!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en la migración:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
