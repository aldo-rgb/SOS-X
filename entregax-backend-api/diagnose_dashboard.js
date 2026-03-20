require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function exactDashboardQuery() {
  try {
    console.log('=== DIAGNÓSTICO DEL DASHBOARD ===\n');
    
    const userId = 54;
    
    // Primero todos los paquetes del usuario
    const allPackages = await pool.query('SELECT tracking_internal, status, is_master, master_id FROM packages WHERE user_id = $1', [userId]);
    console.log(`Total paquetes del usuario S1: ${allPackages.rows.length}`);
    
    allPackages.rows.forEach(pkg => {
      const statusOK = !['delivered', 'cancelled', 'returned'].includes(pkg.status);
      const masterOK = pkg.is_master === true || pkg.master_id === null;
      console.log(`- ${pkg.tracking_internal}: status=${pkg.status} (${statusOK ? '✅' : '❌'}), master=${pkg.is_master}/${pkg.master_id} (${masterOK ? '✅' : '❌'})`);
    });
    
    // Luego la query exacta del dashboard
    console.log('\n=== QUERY DEL DASHBOARD ===');
    const dashboardQuery = await pool.query(`
      SELECT tracking_internal, status::text, is_master, master_id, created_at
      FROM packages
      WHERE user_id = $1
        AND status::text NOT IN ('delivered', 'cancelled', 'returned')
        AND (is_master = true OR master_id IS NULL)
      ORDER BY created_at DESC
    `, [userId]);
    
    console.log(`Paquetes que pasan filtros: ${dashboardQuery.rows.length}`);
    dashboardQuery.rows.forEach(pkg => {
      console.log(`- ${pkg.tracking_internal} (${pkg.status})`);
    });
    
    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
  }
}

exactDashboardQuery();
