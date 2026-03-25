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
  // 1. Login
  const loginData = JSON.stringify({ email: 'aldocampos@grupolsd.com', password: 'Quantum123' });
  const loginRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/auth/login',
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': loginData.length }
  }, loginData);

  const login = JSON.parse(loginRes.body);
  console.log('Login status:', loginRes.status);
  console.log('Top-level keys:', Object.keys(login));
  console.log('Role:', login.user?.role, 'ID:', login.user?.id);
  
  const token = login.token || login.access?.token || login.accessToken || login.access_token;
  console.log('HasToken:', !!token, 'TokenField:', token ? 'found' : 'NOT FOUND in: ' + Object.keys(login).join(','));

  if (!token) {
    console.log('Full response (first 500):', loginRes.body.substring(0, 500));
    process.exit(1);
  }

  // 2. Test /dashboard/client
  console.log('\n--- Testing /api/dashboard/client ---');
  const dashRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/dashboard/client',
    method: 'GET', headers: { 'Authorization': 'Bearer ' + token }
  });

  console.log('Dashboard status:', dashRes.status);
  if (dashRes.status !== 200) {
    console.log('ERROR:', dashRes.body.substring(0, 500));
  } else {
    const data = JSON.parse(dashRes.body);
    console.log('Packages:', data.packages?.length);
    console.log('Stats keys:', Object.keys(data.stats || {}));
  }
}

main().catch(e => console.error('Fatal:', e.message));
