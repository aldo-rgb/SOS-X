const http = require('http');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  // Login as client
  const loginData = JSON.stringify({ email: 'aldocampos@grupolsd.com', password: 'Quantum123' });
  const loginRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/auth/login',
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': loginData.length }
  }, loginData);
  
  console.log('Login status:', loginRes.status);
  if (loginRes.status !== 200) {
    console.log('Login failed:', loginRes.body.substring(0, 300));
    process.exit(1);
  }
  
  const login = JSON.parse(loginRes.body);
  console.log('Role:', login.user?.role);
  console.log('canAccessWebAdmin:', login.access?.canAccessWebAdmin);
  const token = login.access?.token;
  
  if (!token) {
    console.log('No token found. Keys:', Object.keys(login));
    process.exit(1);
  }
  
  // Test dashboard/client
  console.log('\n--- Testing /api/dashboard/client ---');
  const dashRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/dashboard/client',
    method: 'GET', headers: { 'Authorization': 'Bearer ' + token }
  });
  console.log('Dashboard status:', dashRes.status);
  if (dashRes.status !== 200) {
    console.log('Dashboard error:', dashRes.body.substring(0, 500));
  } else {
    const data = JSON.parse(dashRes.body);
    console.log('Dashboard OK');
    console.log('  packages:', data.packages?.length);
    console.log('  stats keys:', Object.keys(data.stats || {}));
  }

  // Test other endpoints clients use
  const endpoints = [
    '/api/auth/profile',
    '/api/carousel/slides',
    '/api/wallet/status',
    '/api/referidos/mi-codigo',
    '/api/referidos/mis-referidos',
    '/api/payments/pending',
    '/api/addresses',
  ];

  console.log('\n--- Testing other client endpoints ---');
  for (const path of endpoints) {
    try {
      const res = await request({
        hostname: 'localhost', port: 3001, path,
        method: 'GET', headers: { 'Authorization': 'Bearer ' + token }
      });
      const icon = res.status === 200 ? '✅' : `⚠️ ${res.status}`;
      console.log(`${icon} ${path}${res.status !== 200 ? ': ' + res.body.substring(0, 100) : ''}`);
    } catch (e) {
      console.log(`❌ ${path}: ${e.message}`);
    }
  }
}

main().catch(e => console.error('Fatal:', e.message));
