// Verificar consolidaciones pendientes
const { Pool } = require('pg');
require('dotenv').config();

async function check() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    // Ver paquetes de consolidación 38
    const result = await pool.query(`
      SELECT 
        p.tracking_internal,
        p.consolidation_id,
        p.supplier_id,
        p.costing_paid,
        s.name as supplier_name
      FROM packages p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.consolidation_id = 38
    `);
    
    console.log('Paquetes en consolidación #38:', result.rows.length);
    result.rows.forEach(r => {
      console.log(`  ${r.tracking_internal} - supplier_id=${r.supplier_id} (${r.supplier_name || 'N/A'}) - costing_paid=${r.costing_paid}`);
    });
    
    // Verificar consulta del endpoint
    const consolidacionesResult = await pool.query(`
      SELECT 
        c.id,
        c.status,
        s.id as supplier_id,
        s.name as supplier_name,
        COUNT(p.id) as package_count
      FROM consolidations c
      JOIN packages p ON p.consolidation_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE (p.costing_paid IS NULL OR p.costing_paid = FALSE)
      AND p.supplier_id IS NOT NULL
      GROUP BY c.id, c.status, s.id, s.name
    `);
    
    console.log('\nConsolidaciones pendientes (query del endpoint):');
    if (consolidacionesResult.rows.length === 0) {
      console.log('  No hay consolidaciones pendientes');
    } else {
      consolidacionesResult.rows.forEach(r => {
        console.log(`  #${r.id} - ${r.supplier_name} - ${r.package_count} paquetes`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

check();
