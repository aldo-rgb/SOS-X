const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

// Configurar conexión
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
        const sqlFile = path.join(__dirname, 'migrations', 'add_costo_operacion.sql');
        const sql = fs.readFileSync(sqlFile, 'utf8');
        
        console.log('Ejecutando migración: add_costo_operacion.sql');
        const result = await pool.query(sql);
        
        console.log('✅ Migración completada exitosamente');
        console.log(result);
        
        await pool.end();
    } catch (error) {
        console.error('❌ Error en la migración:', error.message);
        process.exit(1);
    }
}

runMigration();
