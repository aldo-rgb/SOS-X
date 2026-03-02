/**
 * Script para resetear el estado de pago de paquetes PO Box
 * Marca todos los paquetes de usa_pobox como NO pagados (para pruebas)
 * 
 * Ejecutar: node reset_pobox_payments.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function resetPoboxPayments() {
    const client = await pool.connect();
    
    try {
        console.log('🔄 Reseteando estado de pago de paquetes PO Box...\n');
        
        // Ver cuántos hay pagados actualmente
        const countResult = await client.query(`
            SELECT COUNT(*) as total,
                   COUNT(CASE WHEN costing_paid = TRUE THEN 1 END) as pagados
            FROM packages 
            WHERE warehouse_location = 'usa_pobox'
        `);
        
        console.log(`📦 Total paquetes PO Box: ${countResult.rows[0].total}`);
        console.log(`💰 Actualmente pagados: ${countResult.rows[0].pagados}`);
        
        // Resetear todos a sin pagar
        const result = await client.query(`
            UPDATE packages 
            SET costing_paid = FALSE,
                costing_paid_at = NULL,
                costing_paid_by = NULL,
                payment_reference = NULL,
                updated_at = NOW()
            WHERE warehouse_location = 'usa_pobox'
            AND costing_paid = TRUE
            RETURNING id, tracking_internal
        `);
        
        console.log(`\n✅ ${result.rows.length} paquetes marcados como NO pagados`);
        
        if (result.rows.length > 0) {
            console.log('\nPaquetes actualizados:');
            result.rows.slice(0, 10).forEach((pkg, i) => {
                console.log(`  ${i + 1}. ${pkg.tracking_internal || pkg.id}`);
            });
            if (result.rows.length > 10) {
                console.log(`  ... y ${result.rows.length - 10} más`);
            }
        }
        
        // Opcional: también limpiar el historial de pagos
        // await client.query('DELETE FROM pobox_payment_history');
        // console.log('\n🗑️ Historial de pagos limpiado');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

resetPoboxPayments();
