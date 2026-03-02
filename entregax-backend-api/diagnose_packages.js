/**
 * Script para diagnosticar y corregir paquetes mal clasificados
 * Verifica los service_type de los paquetes y corrige si es necesario
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function diagnoseAndFixPackages() {
    const client = await pool.connect();
    
    try {
        console.log('🔍 Diagnosticando paquetes...\n');
        
        // 1. Ver distribución de service_type y warehouse_location
        const distResult = await client.query(`
            SELECT 
                service_type, 
                warehouse_location,
                COUNT(*) as total,
                COUNT(CASE WHEN costing_paid = TRUE THEN 1 END) as pagados
            FROM packages 
            GROUP BY service_type, warehouse_location
            ORDER BY total DESC
        `);
        
        console.log('📊 Distribución de paquetes:');
        console.log('─'.repeat(80));
        console.log('SERVICE_TYPE'.padEnd(20) + 'WAREHOUSE'.padEnd(20) + 'TOTAL'.padEnd(10) + 'PAGADOS');
        console.log('─'.repeat(80));
        distResult.rows.forEach(row => {
            console.log(
                (row.service_type || 'NULL').padEnd(20) + 
                (row.warehouse_location || 'NULL').padEnd(20) + 
                String(row.total).padEnd(10) + 
                row.pagados
            );
        });
        
        // 2. Buscar paquetes con warehouse_location = 'usa_pobox' pero service_type diferente
        const mismatchResult = await client.query(`
            SELECT id, tracking_internal, service_type, warehouse_location
            FROM packages 
            WHERE warehouse_location = 'usa_pobox' 
            AND (service_type != 'POBOX_USA' OR service_type IS NULL)
            LIMIT 20
        `);
        
        if (mismatchResult.rows.length > 0) {
            console.log('\n⚠️ Paquetes con warehouse usa_pobox pero service_type incorrecto:');
            mismatchResult.rows.forEach(pkg => {
                console.log(`  - ${pkg.tracking_internal}: service_type=${pkg.service_type}`);
            });
        }
        
        // 3. Ver paquetes que aparecen en costeo PO Box (marcados como pagados con costing)
        const poboxPaidResult = await client.query(`
            SELECT id, tracking_internal, service_type, warehouse_location, costing_paid
            FROM packages 
            WHERE costing_paid = TRUE
            ORDER BY costing_paid_at DESC
            LIMIT 30
        `);
        
        console.log('\n💰 Últimos paquetes marcados como pagados (costeo):');
        console.log('─'.repeat(80));
        poboxPaidResult.rows.forEach(pkg => {
            console.log(`  ${pkg.tracking_internal} | service: ${pkg.service_type} | warehouse: ${pkg.warehouse_location}`);
        });
        
        // 4. Verificar si hay paquetes AA_DHL marcados como pagados en costeo
        const dhlPaidResult = await client.query(`
            SELECT COUNT(*) as total
            FROM packages 
            WHERE service_type = 'AA_DHL'
            AND costing_paid = TRUE
        `);
        
        console.log(`\n📍 Paquetes AA_DHL marcados como pagados en costeo: ${dhlPaidResult.rows[0].total}`);
        
        // 5. CORRECCIÓN: Quitar costing_paid de paquetes que NO son POBOX_USA
        console.log('\n🔧 Corrigiendo: quitando costing_paid de paquetes que NO son POBOX_USA...');
        
        const fixResult = await client.query(`
            UPDATE packages 
            SET costing_paid = FALSE,
                costing_paid_at = NULL,
                costing_paid_by = NULL
            WHERE costing_paid = TRUE
            AND service_type != 'POBOX_USA'
            RETURNING id, tracking_internal, service_type
        `);
        
        console.log(`✅ ${fixResult.rows.length} paquetes corregidos (costing_paid removido)`);
        
        if (fixResult.rows.length > 0) {
            fixResult.rows.slice(0, 10).forEach(pkg => {
                console.log(`  - ${pkg.tracking_internal} (${pkg.service_type})`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

diagnoseAndFixPackages();
