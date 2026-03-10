// Script para ejecutar migración de Tesorería Sucursal
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function runMigration() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 Ejecutando migración de Tesorería Sucursal...\n');
        
        // Leer archivo SQL
        const sqlPath = path.join(__dirname, 'migrations', 'create_tesoreria_sucursal.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        // Ejecutar migración
        await client.query(sql);
        
        console.log('✅ Migración completada exitosamente!\n');
        
        // Verificar tablas creadas
        const tables = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('billeteras_sucursal', 'categorias_financieras', 'movimientos_financieros', 'cortes_caja_sucursal')
            ORDER BY table_name
        `);
        
        console.log('📊 Tablas verificadas:');
        tables.rows.forEach(t => console.log(`   ✓ ${t.table_name}`));
        
        // Verificar categorías creadas
        const categorias = await client.query('SELECT tipo, COUNT(*) as count FROM categorias_financieras GROUP BY tipo');
        console.log('\n📁 Categorías financieras:');
        categorias.rows.forEach(c => console.log(`   ${c.tipo}: ${c.count} categorías`));
        
        // Verificar billeteras creadas
        const billeteras = await client.query(`
            SELECT bs.nombre, b.name as sucursal 
            FROM billeteras_sucursal bs 
            LEFT JOIN branches b ON bs.sucursal_id = b.id
        `);
        
        if (billeteras.rows.length > 0) {
            console.log('\n💰 Billeteras creadas automáticamente:');
            billeteras.rows.forEach(b => console.log(`   ✓ ${b.nombre} (${b.sucursal || 'Sin sucursal'})`));
        }
        
    } catch (error) {
        console.error('❌ Error en migración:', error.message);
        
        // Si el error es por tablas que ya existen, no es grave
        if (error.message.includes('already exists')) {
            console.log('\n⚠️ Algunas tablas ya existían. La migración continúa...');
        }
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
