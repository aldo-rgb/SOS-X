/**
 * Buscar información de una guía específica en TODAS las tablas
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const tracking = '1234564322';

async function findPackage() {
    const client = await pool.connect();
    
    try {
        console.log(`🔍 Buscando guía: ${tracking}\n`);
        
        // 1. Buscar en packages
        const pkgResult = await client.query(`
            SELECT 
                p.id,
                p.tracking_internal,
                p.tracking_provider,
                p.service_type,
                p.warehouse_location,
                p.status,
                p.costing_paid,
                p.assigned_cost_mxn,
                p.created_at,
                'packages' as tabla
            FROM packages p
            WHERE p.tracking_internal LIKE $1 
               OR p.tracking_provider LIKE $1
            LIMIT 5
        `, [`%${tracking}%`]);
        
        // 2. Buscar en dhl_shipments (DHL Monterrey)
        const dhlResult = await client.query(`
            SELECT 
                ds.id,
                ds.inbound_tracking,
                ds.outbound_tracking,
                ds.shipment_type,
                ds.status,
                ds.assigned_cost_usd,
                ds.created_at,
                u.full_name as user_name,
                'dhl_shipments' as tabla
            FROM dhl_shipments ds
            LEFT JOIN users u ON ds.user_id = u.id
            WHERE ds.inbound_tracking LIKE $1 
               OR ds.outbound_tracking LIKE $1
            LIMIT 5
        `, [`%${tracking}%`]);
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        if (pkgResult.rows.length > 0) {
            console.log(`\n📦 Encontrado en tabla PACKAGES:`);
            pkgResult.rows.forEach(pkg => {
                console.log(`   ID: ${pkg.id}`);
                console.log(`   Tracking: ${pkg.tracking_internal || pkg.tracking_provider}`);
                console.log(`   🏷️ SERVICE TYPE: ${pkg.service_type}`);
                console.log(`   🏠 WAREHOUSE: ${pkg.warehouse_location}`);
                console.log(`   Status: ${pkg.status}`);
            });
        }
        
        if (dhlResult.rows.length > 0) {
            console.log(`\n📮 Encontrado en tabla DHL_SHIPMENTS (AA_DHL):`);
            dhlResult.rows.forEach(ds => {
                console.log(`   ID: ${ds.id}`);
                console.log(`   Inbound Tracking: ${ds.inbound_tracking}`);
                console.log(`   Outbound Tracking: ${ds.outbound_tracking || 'N/A'}`);
                console.log(`   🏷️ SHIPMENT TYPE: ${ds.shipment_type}`);
                console.log(`   Status: ${ds.status}`);
                console.log(`   Costo asignado: $${ds.assigned_cost_usd || 0}`);
                console.log(`   Usuario: ${ds.user_name}`);
                console.log(`   Creado: ${ds.created_at}`);
            });
        }
        
        if (pkgResult.rows.length === 0 && dhlResult.rows.length === 0) {
            console.log('❌ No se encontró en ninguna tabla (packages ni dhl_shipments)');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

findPackage();
