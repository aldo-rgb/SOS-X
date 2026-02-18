require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

pool.query("SELECT password FROM users WHERE email = $1", ['aldo@entregax.com'])
  .then(async r => {
    if (r.rows.length > 0) {
      const valid = await bcrypt.compare('Admin123!', r.rows[0].password);
      console.log('Password Admin123! válido:', valid);
    } else {
      console.log('Usuario no encontrado');
    }
    pool.end();
  })
  .catch(e => {
    console.error('Error:', e.message);
    pool.end();
  });
