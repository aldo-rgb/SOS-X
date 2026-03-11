// Script para verificar y resetear costing_paid de paquetes
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkCostingPaid() {
  const client = await pool.connect();
  try {
    console.log('🔍 Verificando paquetes con costing_paid = true...\n');
    
    // Ver paquetes con costing_paid = true
    const result = await client.query(`
      SELECT 
        p.id,
        p.tracking_internal,
        p.service_type,
        p.supplier_id,
        s.name as supplier_name,
        p.costing_paid,
        p.costing_paid_at,
        p.costing_payment_reference,
        p.payment_status,
        p.pobox_cost_usd,
        p.pobox_service_cost
      FROM packages p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.costing_paid = TRUE
      ORDER BY p.costing_paid_at DESC NULLS LAST
      LIMIT 20
    `);
    
    console.log(`📦 Paquetes con costing_paid = TRUE: ${result.rows.length}\n`);
    
    result.rows.forEach(pkg => {
      console.log(`- ${pkg.tracking_internal}`);
      console.log(`  Proveedor: ${pkg.supplier_name || 'N/A'}`);
      console.log(`  Pagado: ${pkg.costing_paid_at || 'Sin fecha'}`);
      console.log(`  Referencia: ${pkg.costing_payment_reference || 'N/A'}`);
      console.log(`  Payment Status (cliente): ${pkg.payment_status || 'N/A'}`);
      console.log('');
    });
    
    // Contar totales
    const countResult = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE costing_paid = TRUE) as pagados,
        COUNT(*) FILTER (WHERE costing_paid IS NULL OR costing_paid = FALSE) as pendientes,
        COUNT(*) as total
      FROM packages
      WHERE service_type = 'POBOX_USA' AND supplier_id IS NOT NULL
    `);
    
    const counts = countResult.rows[0];
    console.log('\n📊 Resumen PO Box USA con proveedor:');
    console.log(`   Total: ${counts.total}`);
    console.log(`   Pagados a proveedor: ${counts.pagados}`);
    console.log(`   Pendientes de pago: ${counts.pendientes}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkCostingPaid();
