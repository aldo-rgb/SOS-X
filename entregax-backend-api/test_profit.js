const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function testProfitBreakdown() {
  const containerId = 12;
  
  try {
    // Query principal
    const containerRes = await pool.query(`
      SELECT c.*, 
        c.exchange_rate_usd_mxn,
        c.collected_amount_usd,
        cc.calculated_release_cost as total_cost,
        cc.debit_note_amount, cc.demurrage_amount, cc.storage_amount,
        cc.maneuvers_amount, cc.custody_amount, cc.transport_amount,
        cc.advance_1_amount, cc.advance_2_amount, cc.advance_3_amount, cc.advance_4_amount,
        cc.other_amount, cc.calculated_aa_cost, cc.is_fully_costed,
        mr.fcl_price_usd as route_fcl_price
      FROM containers c
      LEFT JOIN container_costs cc ON cc.container_id = c.id
      LEFT JOIN maritime_routes mr ON mr.id = c.route_id
      WHERE c.id = $1
    `, [containerId]);

    if (containerRes.rows.length === 0) {
      console.log('Contenedor no encontrado');
      return;
    }

    const container = containerRes.rows[0];
    console.log('✅ Container encontrado');
    
    // Anticipos
    const anticiposRes = await pool.query(`
      SELECT COALESCE(SUM(ar.monto), 0) as total_anticipos
      FROM anticipo_referencias ar
      WHERE ar.container_id = $1
    `, [containerId]);
    console.log('✅ Anticipos:', anticiposRes.rows[0].total_anticipos);
    
    // Shipments
    const shipmentsRes = await pool.query(`
      SELECT * FROM maritime_orders WHERE container_id = $1
    `, [containerId]);
    console.log('✅ Shipments:', shipmentsRes.rows.length);
    
    // Es FCL si no hay LOGs
    const isFCL = shipmentsRes.rows.length === 0;
    console.log('✅ Es FCL:', isFCL);
    
    if (isFCL) {
      // Buscar tarifa FCL
      console.log('🔍 Buscando tarifa FCL...');
      console.log('   client_user_id:', container.client_user_id);
      console.log('   route_id:', container.route_id);
      console.log('   consignee:', container.consignee);
      
      // Buscar cliente por consignee
      if (container.consignee) {
        const clientSearch = await pool.query(`
          SELECT id, company_name FROM legacy_clients 
          WHERE company_name ILIKE $1 OR rfc ILIKE $1
          LIMIT 1
        `, [`%${container.consignee.split(',')[0].trim()}%`]);
        console.log('✅ Cliente encontrado:', clientSearch.rows[0] || 'No');
      }
    }
    
    console.log('\n✅ TODO OK - No hay error en las queries');
    
  } catch (e) {
    console.log('❌ ERROR:', e.message);
    console.log(e.stack);
  }
  
  await pool.end();
}

testProfitBreakdown();
