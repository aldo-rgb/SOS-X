require('dotenv').config();
const fetch = require('node-fetch');

const API_URL = 'http://localhost:3001';

async function testReferidos() {
  try {
    // Login como cliente
    const loginRes = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'aldocampos@grupolsd.com',
        password: 'Quantum123'
      })
    });
    
    const loginData = await loginRes.json();
    console.log('Login status:', loginRes.status);
    
    const token = loginData.token || loginData.access?.token;
    if (!token) {
      console.log('Error login - no token:', loginData);
      return;
    }
    
    console.log('User ID:', loginData.user?.id);
    console.log('Role:', loginData.user?.role);
    
    // Probar endpoint de código referido
    console.log('\n--- Probando /api/referidos/mi-codigo ---');
    const codigoRes = await fetch(`${API_URL}/api/referidos/mi-codigo`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('Status:', codigoRes.status);
    const codigoData = await codigoRes.json();
    console.log('Response:', JSON.stringify(codigoData, null, 2));
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testReferidos();
