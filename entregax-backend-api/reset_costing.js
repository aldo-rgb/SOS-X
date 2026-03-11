// Reset costing_paid para paquetes que fueron marcados incorrectamente
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function resetCostingPaid() {
  try {
    console.log('🔄 Reseteando costing_paid de paquetes...');
    
    const result = await pool.query(`
      UPDATE packages 
      SET 
        costing_paid = FALSE, 
        costing_paid_at = NULL, 
        costing_payment_reference = NULL
      WHERE tracking_internal IN ('US-REPACK-36GR', 'US-T0KB9245')
      RETURNING tracking_internal, costing_paid, payment_status
    `);
    
    console.log('✅ Paquetes actualizados:', result.rows.length);
    result.rows.forEach(pkg => {
      console.log(`  - ${pkg.tracking_internal}`);
      console.log(`    costing_paid: ${pkg.costing_paid}`);
      console.log(`    payment_status (cliente): ${pkg.payment_status}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

resetCostingPaid();
