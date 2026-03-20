require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function testInstructions() {
  try {
    console.log('=== VERIFICANDO INSTRUCCIONES DVLR2765 ===\n');
    
    const result = await pool.query(`
      SELECT 
        tracking_internal,
        status,
        assigned_address_id,
        destination_address,
        destination_city,
        destination_contact,
        needs_instructions
      FROM packages 
      WHERE tracking_internal IN ('US-DVLR2765', 'US-D4ZI9057')
    `);
    
    result.rows.forEach(pkg => {
      console.log(`${pkg.tracking_internal}:`);
      console.log(`  assigned_address_id: ${pkg.assigned_address_id}`);
      console.log(`  destination_address: ${pkg.destination_address}`);
      console.log(`  destination_city: ${pkg.destination_city}`);
      console.log(`  destination_contact: ${pkg.destination_contact}`);
      console.log(`  needs_instructions: ${pkg.needs_instructions}`);
      
      const hasInstructions = !!(
        pkg.assigned_address_id ||
        (pkg.destination_address && 
         pkg.destination_address !== 'Pendiente de asignar' && 
         pkg.destination_contact)
      );
      console.log(`  ✅ ¿Tiene instrucciones?: ${hasInstructions ? 'SÍ' : 'NO'}`);
      console.log();
    });
    
    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
  }
}

testInstructions();
