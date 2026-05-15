// Script para ejecutar migración de Caja Chica Sucursales (Petty Cash)
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'add_petty_cash_module.sql'), 'utf8');
    console.log('🔄 Ejecutando migración de Caja Chica Sucursales...');
    await pool.query(sql);
    console.log('✅ Migración completada exitosamente');
  } catch (error) {
    console.error('❌ Error en migración:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
