const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') || process.env.DATABASE_URL?.includes('amazonaws')
    ? { rejectUnauthorized: false }
    : false
});

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations/add_china_status_history.sql'), 'utf8');
    console.log('🔄 Ejecutando migración china_status_history...');
    await pool.query(sql);
    console.log('✅ Migración aplicada correctamente');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
