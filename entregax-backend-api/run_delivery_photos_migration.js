const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'add_delivery_photos_columns.sql'), 'utf-8');
    await pool.query(sql);
    console.log('✅ Migration applied: add_delivery_photos_columns');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
