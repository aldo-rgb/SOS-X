require('dotenv').config();
const fetch = require('node-fetch');

async function test() {
  try {
    // Primero hacemos login
    console.log('1. Haciendo login...');
    const loginRes = await fetch('http://localhost:3001/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'aldo@entregax.com', password: 'a123' })
    });
    
    const loginData = await loginRes.json();
    
    if (!loginData.token) {
      console.log('Login failed:', loginData);
      return;
    }
    
    console.log('Login OK, role:', loginData.user ? loginData.user.role : 'N/A');
    console.log('Token (first 50 chars):', loginData.token.substring(0, 50) + '...');
    
    // Probamos el endpoint de paneles
    console.log('\n2. Probando /api/admin/panels...');
    const panelsRes = await fetch('http://localhost:3001/api/admin/panels', {
      headers: { 'Authorization': 'Bearer ' + loginData.token }
    });
    console.log('Status:', panelsRes.status);
    const panelsData = await panelsRes.json();
    console.log('Paneles:', panelsData.panels ? panelsData.panels.length : 'Error');
    
    // Probamos el endpoint de usuarios
    console.log('\n3. Probando /api/admin/panels/users...');
    const usersRes = await fetch('http://localhost:3001/api/admin/panels/users', {
      headers: { 'Authorization': 'Bearer ' + loginData.token }
    });
    console.log('Status:', usersRes.status);
    const usersData = await usersRes.json();
    
    if (usersData.error) {
      console.log('Error:', usersData.error);
    } else if (usersData.users) {
      console.log('Usuarios encontrados:', usersData.users.length);
      usersData.users.slice(0, 5).forEach(u => {
        console.log('  -', u.full_name, '|', u.role, '| panels:', u.panel_count);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
