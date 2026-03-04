// Script para verificar datos de un paquete específico
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkPackage() {
    try {
        // Verificar tarifas de PO Box
        const tarifas = await pool.query('SELECT * FROM pobox_tarifas_volumen WHERE estado = TRUE ORDER BY nivel');
        console.log('\n📊 Tarifas PO Box activas:', tarifas.rows.length);
        tarifas.rows.forEach(t => {
            console.log(`  Nivel ${t.nivel}: CBM ${t.cbm_min}-${t.cbm_max || '∞'} = $${t.costo} USD (${t.tipo_cobro})`);
        });

        // Verificar tipo de cambio
        const tc = await pool.query("SELECT * FROM exchange_rate_config WHERE servicio = 'pobox_usa' AND estado = TRUE");
        console.log('\n💱 Tipo de cambio PO Box:', tc.rows[0]?.tipo_cambio_final || 'NO CONFIGURADO');

        // Buscar el paquete más reciente
        const result = await pool.query(`
            SELECT 
                id,
                tracking_internal,
                tracking_provider,
                description,
                weight,
                pkg_length,
                pkg_width,
                pkg_height,
                long_cm,
                width_cm,
                height_cm,
                dimensions,
                single_cbm,
                assigned_cost_mxn,
                saldo_pendiente,
                carrier,
                service_type,
                status,
                created_at
            FROM packages 
            WHERE tracking_internal LIKE 'US-%'
            ORDER BY created_at DESC 
            LIMIT 5
        `);

        console.log('\n📦 Últimos paquetes PO Box USA:\n');
        result.rows.forEach((pkg, i) => {
            console.log(`--- Paquete ${i + 1}: ${pkg.tracking_internal} ---`);
            console.log(`  Weight: ${pkg.weight}`);
            console.log(`  pkg_length: ${pkg.pkg_length}, pkg_width: ${pkg.pkg_width}, pkg_height: ${pkg.pkg_height}`);
            console.log(`  long_cm: ${pkg.long_cm}, width_cm: ${pkg.width_cm}, height_cm: ${pkg.height_cm}`);
            console.log(`  dimensions JSON: ${JSON.stringify(pkg.dimensions)}`);
            console.log(`  single_cbm: ${pkg.single_cbm}`);
            console.log(`  assigned_cost_mxn: ${pkg.assigned_cost_mxn}`);
            console.log(`  saldo_pendiente: ${pkg.saldo_pendiente}`);
            console.log(`  carrier: ${pkg.carrier}`);
            console.log(`  service_type: ${pkg.service_type}`);
            console.log(`  status: ${pkg.status}`);
            console.log('');
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

checkPackage();
