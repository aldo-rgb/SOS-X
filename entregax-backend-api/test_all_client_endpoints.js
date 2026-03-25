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
  const token = login.access?.token;
  console.log('Login OK, token:', !!token);

  if (!token) { console.log('NO TOKEN'); process.exit(1); }

  const headers = { 'Authorization': 'Bearer ' + token };

  // All endpoints DashboardClient calls on mount
  const endpoints = [
    { name: 'dashboard/client', path: '/api/dashboard/client' },
    { name: 'auth/profile', path: '/api/auth/profile' },
    { name: 'carousel/slides', path: '/api/carousel/slides' },
    { name: 'fiscal/data', path: '/api/fiscal/data' },
    { name: 'addresses', path: '/api/addresses' },
    { name: 'payment-methods', path: '/api/payment-methods' },
    { name: 'wallet/status', path: '/api/wallet/status' },
    { name: 'referidos/mi-codigo', path: '/api/referidos/mi-codigo' },
    { name: 'referidos/mis-referidos', path: '/api/referidos/mis-referidos' },
    { name: 'payments/pending', path: '/api/payments/pending' },
    { name: 'notifications', path: '/api/notifications?limit=10' },
    { name: 'panels/me', path: '/api/panels/me' },
    { name: 'carrier-options', path: '/api/carrier-options/by-service/usa_pobox' },
    { name: 'services/usa_pobox/info', path: '/api/services/usa_pobox/info' },
    { name: 'services/china_air/info', path: '/api/services/china_air/info' },
    { name: 'services/china_sea/info', path: '/api/services/china_sea/info' },
    { name: 'services/dhl/info', path: '/api/services/dhl/info' },
  ];

  console.log('\n=== Testing all client endpoints ===\n');

  for (const ep of endpoints) {
    try {
      const res = await request({
        hostname: 'localhost', port: 3001, path: ep.path,
        method: 'GET', headers
      });
      const icon = res.status === 200 ? '✅' : res.status === 401 ? '🔴 401!' : res.status === 403 ? '🟡 403' : `⚠️  ${res.status}`;
      const errorMsg = res.status !== 200 ? ` → ${res.body.substring(0, 100)}` : '';
      console.log(`${icon} ${ep.name} (${res.status})${errorMsg}`);
    } catch (e) {
      console.log(`❌ ${ep.name} → ERROR: ${e.message}`);
    }
  }
}

main().catch(e => console.error('Fatal:', e.message));
