// Script para ejecutar la migración de geocerca
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Soporta DATABASE_URL (Railway) o variables individuales
const poolConfig = process.env.DATABASE_URL 
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'entregax',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres'
    };

const pool = new Pool(poolConfig);

async function runMigration() {
    try {
        console.log('🚀 Ejecutando migración de geocerca...\n');
        
        // Leer el archivo SQL
        const sqlFile = path.join(__dirname, 'add_branch_geofence.sql');
        const sql = fs.readFileSync(sqlFile, 'utf8');
        
        // Dividir por comandos (separados por ;)
        const commands = sql.split(';')
            .map(cmd => cmd.trim())
            .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));
        
        for (const command of commands) {
            try {
                // Skip comentarios
                if (command.startsWith('--') || command.startsWith('COMMENT')) {
                    continue;
                }
                console.log(`Ejecutando: ${command.substring(0, 60)}...`);
                await pool.query(command);
                console.log('✅ OK\n');
            } catch (err) {
                // Ignorar errores de "ya existe"
                if (err.message.includes('already exists') || err.message.includes('ya existe')) {
                    console.log('⚠️ Ya existe, continuando...\n');
                } else {
                    console.error('❌ Error:', err.message, '\n');
                }
            }
        }
        
        console.log('\n✅ Migración completada!');
        
        // Verificar que las columnas existen
        const result = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'branches' 
            AND column_name IN ('latitud', 'longitud', 'radio_geocerca_metros', 'wifi_ssid', 'wifi_validation_enabled')
        `);
        
        console.log('\n📋 Columnas de geocerca en branches:');
        result.rows.forEach(row => console.log(`  - ${row.column_name}`));
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

runMigration();
