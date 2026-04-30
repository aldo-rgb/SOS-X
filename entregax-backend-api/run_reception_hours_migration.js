// Script para agregar columna reception_hours a tabla addresses
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('🚀 Ejecutando migración: agregar reception_hours a addresses...\n');

        // Agregar columna reception_hours
        console.log('1️⃣ Agregando columna reception_hours a tabla addresses...');
        await client.query(`
            ALTER TABLE addresses 
            ADD COLUMN IF NOT EXISTS reception_hours TEXT
        `);
        console.log('   ✅ Columna reception_hours agregada\n');

        // Agregar comentario
        console.log('2️⃣ Agregando comentario a columna...');
        await client.query(`
            COMMENT ON COLUMN addresses.reception_hours IS 'Reception hours for delivery (e.g., "Monday-Friday 9:00 AM - 6:00 PM")'
        `);
        console.log('   ✅ Comentario agregado\n');

        // Verificar que la columna existe
        const result = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'addresses' AND column_name = 'reception_hours'
        `);

        if (result.rows.length > 0) {
            console.log('✅ ¡Migración completada exitosamente!');
            console.log(`   - Tipo de dato: ${result.rows[0].data_type}`);
            console.log('\n📊 La columna reception_hours está lista para usar en el sistema.\n');
        } else {
            console.error('❌ Error: La columna no fue creada correctamente');
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Error durante la migración:', error.message);
        process.exit(1);
    } finally {
        await client.end();
        await pool.end();
    }
}

runMigration();
