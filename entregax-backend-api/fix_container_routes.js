/**
 * Script para asignar ruta por defecto a contenedores sin ruta
 * Asigna CHN-MZN-MXC a todos los que tienen route_id = NULL
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function fixContainerRoutes() {
    const client = await pool.connect();
    
    try {
        console.log('🔍 Buscando contenedores sin ruta asignada...\n');
        
        // 1. Ver cuántos hay sin ruta
        const countResult = await client.query(`
            SELECT COUNT(*) as total,
                   COUNT(CASE WHEN route_id IS NULL THEN 1 END) as sin_ruta
            FROM containers
        `);
        
        console.log(`📦 Total contenedores: ${countResult.rows[0].total}`);
        console.log(`❌ Sin ruta asignada: ${countResult.rows[0].sin_ruta}`);
        
        // 2. Buscar la ruta CHN-MZN-MXC
        const routeResult = await client.query(`
            SELECT id, code, name FROM maritime_routes 
            WHERE code = 'CHN-MZN-MXC' AND is_active = TRUE
            LIMIT 1
        `);
        
        if (routeResult.rows.length === 0) {
            console.log('\n⚠️ No se encontró la ruta CHN-MZN-MXC');
            
            // Mostrar rutas disponibles
            const allRoutes = await client.query(`
                SELECT id, code, name FROM maritime_routes WHERE is_active = TRUE
            `);
            console.log('\nRutas disponibles:');
            allRoutes.rows.forEach(r => {
                console.log(`  - ${r.code}: ${r.name} (ID: ${r.id})`);
            });
            return;
        }
        
        const defaultRoute = routeResult.rows[0];
        console.log(`\n✅ Ruta por defecto encontrada: ${defaultRoute.code} (ID: ${defaultRoute.id})`);
        
        // 3. Asignar ruta a contenedores sin ruta
        const updateResult = await client.query(`
            UPDATE containers 
            SET route_id = $1,
                updated_at = NOW()
            WHERE route_id IS NULL
            RETURNING id, container_number
        `, [defaultRoute.id]);
        
        console.log(`\n✅ ${updateResult.rows.length} contenedores actualizados con ruta ${defaultRoute.code}`);
        
        if (updateResult.rows.length > 0) {
            console.log('\nContenedores actualizados:');
            updateResult.rows.slice(0, 10).forEach(c => {
                console.log(`  - ${c.container_number}`);
            });
            if (updateResult.rows.length > 10) {
                console.log(`  ... y ${updateResult.rows.length - 10} más`);
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

fixContainerRoutes();
