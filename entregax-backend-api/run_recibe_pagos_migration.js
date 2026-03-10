const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  try {
    console.log('🚀 Ejecutando migración: agregar columna recibe_pagos...');
    
    await pool.query(`
      ALTER TABLE branches 
      ADD COLUMN IF NOT EXISTS recibe_pagos BOOLEAN DEFAULT TRUE
    `);
    
    console.log('✅ Columna recibe_pagos agregada exitosamente');
    
    // Mostrar sucursales actuales
    const result = await pool.query('SELECT id, name, recibe_pagos FROM branches');
    console.log('\n📍 Sucursales actualizadas:');
    result.rows.forEach(b => {
      console.log(`  - ${b.name}: recibe_pagos = ${b.recibe_pagos}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

runMigration();
