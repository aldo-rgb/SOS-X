// Script para ejecutar la migración de tablas PO Box y Exchange Rate
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:Entregax2024@localhost:5432/entregax',
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function runMigration() {
    console.log('🚀 Iniciando migración de tablas PO Box y Exchange Rate...\n');

    try {
        const sqlPath = path.join(__dirname, 'migrations', 'create_pobox_rates_tables.sql');
        let sql = fs.readFileSync(sqlPath, 'utf8');
        
        // Eliminar comentarios de línea
        sql = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');

        // Dividir por statements (separados por ;)
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 10); // Solo statements con contenido

        console.log(`📝 Procesando ${statements.length} statements...\n`);

        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            if (statement.length > 0) {
                try {
                    await pool.query(statement);
                    // Mostrar las primeras 60 chars del statement
                    const preview = statement.substring(0, 60).replace(/\n/g, ' ').replace(/\s+/g, ' ');
                    console.log(`✅ [${i+1}/${statements.length}] ${preview}...`);
                } catch (err) {
                    // Si es error de tabla/columna ya existe, continuar
                    if (err.code === '42P07' || err.code === '42701' || err.code === '42710') {
                        const preview = statement.substring(0, 40).replace(/\n/g, ' ').replace(/\s+/g, ' ');
                        console.log(`⏭️  [${i+1}/${statements.length}] Ya existe: ${preview}...`);
                    } else {
                        console.error(`❌ [${i+1}/${statements.length}] Error: ${err.message}`);
                        console.error(`   Code: ${err.code}`);
                        console.error(`   Statement preview: ${statement.substring(0, 100).replace(/\n/g, ' ')}`);
                    }
                }
            }
        }

        console.log('\n✨ Migración completada!');

        // Verificar que las tablas se crearon
        const tables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('pobox_tarifas_volumen', 'pobox_tarifas_extras', 'exchange_rate_config', 'exchange_rate_history')
        `);

        console.log('\n📋 Tablas verificadas:');
        tables.rows.forEach(row => console.log(`   ✓ ${row.table_name}`));

        // Verificar datos iniciales
        const tarifas = await pool.query('SELECT COUNT(*) as count FROM pobox_tarifas_volumen');
        const extras = await pool.query('SELECT COUNT(*) as count FROM pobox_tarifas_extras');
        const config = await pool.query('SELECT COUNT(*) as count FROM exchange_rate_config');

        console.log('\n📊 Datos iniciales:');
        console.log(`   - Tarifas volumen: ${tarifas.rows[0].count} registros`);
        console.log(`   - Servicios extra: ${extras.rows[0].count} registros`);
        console.log(`   - Config tipo cambio: ${config.rows[0].count} registros`);

    } catch (error) {
        console.error('❌ Error en migración:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
