/**
 * Script para corregir warehouse_location de paquetes POBOX_USA
 * Los paquetes POBOX_USA deben tener warehouse_location = 'usa_pobox'
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function fixPoboxWarehouse() {
    const client = await pool.connect();
    
    try {
        console.log('🔍 Buscando paquetes POBOX_USA con warehouse incorrecto...\n');
        
        // 1. Ver cuántos hay mal configurados
        const countResult = await client.query(`
            SELECT warehouse_location, COUNT(*) as total
            FROM packages 
            WHERE service_type = 'POBOX_USA'
            GROUP BY warehouse_location
            ORDER BY total DESC
        `);
        
        console.log('📊 Distribución actual de POBOX_USA por warehouse:');
        console.log('─'.repeat(50));
        countResult.rows.forEach(row => {
            const status = row.warehouse_location === 'usa_pobox' ? '✅' : '❌';
            console.log(`  ${status} ${(row.warehouse_location || 'NULL').padEnd(20)} : ${row.total} paquetes`);
        });
        
        // 2. Corregir warehouse_location de paquetes POBOX_USA
        const fixResult = await client.query(`
            UPDATE packages 
            SET warehouse_location = 'usa_pobox',
                updated_at = NOW()
            WHERE service_type = 'POBOX_USA'
            AND warehouse_location != 'usa_pobox'
            RETURNING id, tracking_internal, warehouse_location as old_warehouse
        `);
        
        console.log(`\n✅ ${fixResult.rows.length} paquetes corregidos a warehouse 'usa_pobox'`);
        
        if (fixResult.rows.length > 0) {
            console.log('\nPaquetes actualizados:');
            fixResult.rows.slice(0, 20).forEach(pkg => {
                console.log(`  - ${pkg.tracking_internal} (era: ${pkg.old_warehouse})`);
            });
            if (fixResult.rows.length > 20) {
                console.log(`  ... y ${fixResult.rows.length - 20} más`);
            }
        }
        
        // 3. También resetear costing_paid de estos paquetes
        const resetPaidResult = await client.query(`
            UPDATE packages 
            SET costing_paid = FALSE,
                costing_paid_at = NULL,
                costing_paid_by = NULL
            WHERE service_type = 'POBOX_USA'
            AND costing_paid = TRUE
            RETURNING id
        `);
        
        console.log(`\n💰 ${resetPaidResult.rows.length} paquetes POBOX_USA marcados como NO pagados`);
        
        // 4. Verificación final
        const finalCount = await client.query(`
            SELECT warehouse_location, COUNT(*) as total
            FROM packages 
            WHERE service_type = 'POBOX_USA'
            GROUP BY warehouse_location
        `);
        
        console.log('\n📊 Distribución FINAL de POBOX_USA:');
        console.log('─'.repeat(50));
        finalCount.rows.forEach(row => {
            console.log(`  ✅ ${(row.warehouse_location || 'NULL').padEnd(20)} : ${row.total} paquetes`);
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

fixPoboxWarehouse();
