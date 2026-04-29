/* eslint-disable */
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
  });
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'add_maritime_box_dimensions.sql'), 'utf8');
    console.log('▶️ Running maritime box dimensions migration...');
    await pool.query(sql);
    console.log('✅ Migration done');
  } catch (e) {
    console.error('❌ Migration failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
