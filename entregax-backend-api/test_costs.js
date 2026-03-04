require('dotenv').config();
const jwt = require('jsonwebtoken');
const http = require('http');

const token = jwt.sign({ id: 54, role: 'cliente', role_level: 10 }, process.env.JWT_SECRET, { expiresIn: '1h' });

const req = http.request({
  hostname: 'localhost', 
  port: 3001,
  path: '/api/client/packages/54',
  headers: { 'Authorization': 'Bearer ' + token }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const pkgs = JSON.parse(data);
    console.log('Total packages:', pkgs.length);
    const p = pkgs.find(x => x.id === 163);
    if (p) {
      console.log('Package 163:');
      console.log('  assigned_cost_mxn:', p.assigned_cost_mxn);
      console.log('  saldo_pendiente:', p.saldo_pendiente);
      console.log('  monto_pagado:', p.monto_pagado);
    } else {
      console.log('Package 163 not found');
      console.log('First package:', JSON.stringify(pkgs[0], null, 2));
    }
  });
});
req.end();
