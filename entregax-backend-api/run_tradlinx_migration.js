/**
 * Ejecutar migración de Tradlinx
 * node run_tradlinx_migration.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false
});

async function runMigration() {
    console.log('🛰️  Ejecutando migración de Tradlinx...\n');
    
    const sqlPath = path.join(__dirname, 'migrations', 'add_tradlinx_columns.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    try {
        const result = await pool.query(sql);
        console.log('✅ Migración completada exitosamente!\n');
        
        // Verificar columnas
        const check = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'containers' 
            AND column_name LIKE '%tradlinx%' OR column_name LIKE '%foreign_tracking%' OR column_name LIKE '%reverse_logistics%'
        `);
        
        console.log('📋 Columnas agregadas:');
        check.rows.forEach(row => console.log(`   ✓ ${row.column_name}`));
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

runMigration();
