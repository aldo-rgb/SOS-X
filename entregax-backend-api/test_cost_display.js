const http = require('http');
function post(url, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(data);
    const req = http.request({hostname:u.hostname,port:u.port,path:u.pathname,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}}, res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d)));
    });
    req.on('error',reject);
    req.write(body); req.end();
  });
}
function get(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({hostname:u.hostname,port:u.port,path:u.pathname,method:'GET',headers:{'Authorization':'Bearer '+token}}, res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d)));
    });
    req.on('error',reject);
    req.end();
  });
}

(async()=>{
  const login = await post('http://localhost:3001/api/auth/login', {email:'aldocampos@grupolsd.com',password:'admin123'});
  const token = login.access && login.access.token;
  if (!token) { console.log('Login failed'); return; }
  
  const dash = await get('http://localhost:3001/api/dashboard/client', token);
  
  console.log('=== TC por servicio ===');
  console.log(dash.tipo_cambio_por_servicio);
  console.log('TC base:', dash.tipo_cambio_base);
  
  const pkgs = dash.packages || [];
  const maritime = pkgs.filter(p => p.servicio === 'SEA_CHN_MX');
  const air = pkgs.filter(p => p.servicio === 'AIR_CHN_MX');
  const pobox = pkgs.filter(p => p.servicio === 'POBOX_USA');
  const dhl = pkgs.filter(p => p.servicio === 'AA_DHL' || p.servicio === 'DHL_MTY');
  
  console.log('\n=== Maritime (' + maritime.length + ') ===');
  maritime.slice(0,3).forEach(p => {
    const tc = dash.tipo_cambio_por_servicio.maritimo || 18;
    const usd = p.maritime_sale_price_usd ? Number(p.maritime_sale_price_usd) : 0;
    const mxn = Number(p.monto) || 0;
    const derivedTC = usd > 0 ? (mxn / usd).toFixed(4) : 'N/A';
    console.log({tracking: p.tracking, monto_mxn: mxn, usd: usd, currency: p.monto_currency, reg_tc: p.registered_exchange_rate, derived_tc: derivedTC, cbm: p.cbm});
  });
  
  console.log('\n=== Air China (' + air.length + ') ===');
  air.slice(0,3).forEach(p => {
    console.log({tracking: p.tracking, monto: p.monto, air_sale_usd: p.air_sale_price, weight: p.weight, reg_tc: p.registered_exchange_rate});
  });
  
  console.log('\n=== PO Box (' + pobox.length + ') ===');
  pobox.slice(0,3).forEach(p => {
    console.log({tracking: p.tracking, monto: p.monto, pobox_usd: p.pobox_venta_usd, reg_tc: p.registered_exchange_rate});
  });
  
  console.log('\n=== DHL (' + dhl.length + ') ===');
  dhl.slice(0,3).forEach(p => {
    console.log({tracking: p.tracking, monto: p.monto, currency: p.monto_currency, dhl_usd: p.dhl_sale_price_usd});
  });
})().catch(e => console.error(e.message));
