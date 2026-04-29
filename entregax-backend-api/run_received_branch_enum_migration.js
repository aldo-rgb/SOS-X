// Runner: agrega valores received_<branch> al enum package_status
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

const VALUES = [
  'received_cdmx',
  'received_gdl',
  'received_qro',
  'received_pue',
  'received_tij',
  'received_mid',
  'received_cun',
  'received_leo',
  'received_hgo',
];

(async () => {
  try {
    for (const v of VALUES) {
      try {
        await pool.query(`ALTER TYPE package_status ADD VALUE IF NOT EXISTS '${v}'`);
        console.log(`✅ Agregado ${v}`);
      } catch (e) {
        console.error(`❌ ${v}:`, e.message);
      }
    }
    console.log('Listo.');
  } finally {
    await pool.end();
  }
})();
