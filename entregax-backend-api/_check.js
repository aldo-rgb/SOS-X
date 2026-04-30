const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const r = await p.query(`SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND (table_name ILIKE '%provid%' OR table_name ILIKE '%payment%')
    ORDER BY 1`);
  console.log(r.rows);
  await p.end();
})();
