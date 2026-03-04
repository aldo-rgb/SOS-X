// Script para agregar columnas de seguimiento de pagos
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('🚀 Ejecutando migración: columnas de seguimiento de pagos...\n');

        // 1. Agregar columna saldo_pendiente
        console.log('1️⃣ Agregando columna saldo_pendiente...');
        await client.query(`
            ALTER TABLE packages 
            ADD COLUMN IF NOT EXISTS saldo_pendiente DECIMAL(10,2) DEFAULT 0
        `);
        console.log('   ✅ Columna saldo_pendiente agregada\n');

        // 2. Agregar columna monto_pagado
        console.log('2️⃣ Agregando columna monto_pagado...');
        await client.query(`
            ALTER TABLE packages 
            ADD COLUMN IF NOT EXISTS monto_pagado DECIMAL(10,2) DEFAULT 0
        `);
        console.log('   ✅ Columna monto_pagado agregada\n');

        // 3. Inicializar saldo_pendiente con assigned_cost_mxn para paquetes existentes
        console.log('3️⃣ Inicializando saldo_pendiente para paquetes existentes...');
        const result = await client.query(`
            UPDATE packages 
            SET saldo_pendiente = COALESCE(assigned_cost_mxn, 0)
            WHERE (saldo_pendiente IS NULL OR saldo_pendiente = 0)
              AND assigned_cost_mxn IS NOT NULL
              AND assigned_cost_mxn > 0
        `);
        console.log(`   ✅ ${result.rowCount} paquetes actualizados\n`);

        // 4. Verificar las columnas
        console.log('4️⃣ Verificando estructura...');
        const verify = await client.query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns 
            WHERE table_name = 'packages' 
              AND column_name IN ('saldo_pendiente', 'monto_pagado')
        `);
        console.log('   Columnas encontradas:');
        verify.rows.forEach(col => {
            console.log(`   - ${col.column_name}: ${col.data_type} (default: ${col.column_default})`);
        });

        console.log('\n✅ Migración completada exitosamente!');

    } catch (error) {
        console.error('❌ Error en migración:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
