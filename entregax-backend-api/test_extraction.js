const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const jwt = require('jsonwebtoken');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function test() {
  console.log('🔧 Iniciando test de extracción...');
  
  const user = await pool.query("SELECT id, email FROM users WHERE email = 'aldo@entregax.com'");
  const token = jwt.sign({ userId: user.rows[0]?.id, email: user.rows[0]?.email, role: 'super_admin' }, process.env.JWT_SECRET);
  const containers = await pool.query("SELECT id FROM containers WHERE container_number = 'WHSU6463903'");
  
  console.log('✅ Token generado');
  console.log('✅ Container ID:', containers.rows[0]?.id);
  
  const form = new FormData();
  form.append('file', fs.createReadStream('/Users/kmpsdeveloper/Desktop/Proyectos/SOS-X/DN-SA26010033-LOGINPC.pdf'));
  form.append('containerId', containers.rows[0].id.toString());
  
  console.log('🚀 Enviando request al endpoint...');
  try {
    const res = await axios.post('http://localhost:3001/api/maritime/containers/extract-debit-note', form, {
      headers: { ...form.getHeaders(), 'Authorization': 'Bearer ' + token },
      timeout: 180000
    });
    console.log('✅ RESPUESTA EXITOSA:');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.log('❌ ERROR:');
    if (err.response) {
      console.log('Status:', err.response.status);
      console.log('Data:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.log('Message:', err.message);
    }
  }
  pool.end();
}

test();
