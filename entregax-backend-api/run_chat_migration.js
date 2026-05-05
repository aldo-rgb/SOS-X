// Script para ejecutar migración del chat interno
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
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'create_internal_chat.sql'), 'utf8');
    console.log('🔄 Ejecutando migración de chat interno...');
    await pool.query(sql);
    console.log('✅ Migración de chat completada');
  } catch (error) {
    console.error('❌ Error en migración:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
