const { pool } = require('./dist/db');
const axios = require('axios');
(async () => {
  const { rows } = await pool.query("SELECT id, alias, rfc, facturapi_api_key, facturapi_environment FROM fiscal_emitters WHERE id = 3");
  if (!rows[0]) { console.log('No emitter'); process.exit(0); }
  const e = rows[0];
  console.log('Emitter:', e.alias, e.rfc, 'env:', e.facturapi_environment, 'keyPrefix:', e.facturapi_api_key?.slice(0,12));
  const r = await axios.get('https://www.facturapi.io/v2/invoices', {
    auth: { username: e.facturapi_api_key, password: '' },
    params: { page: 1, limit: 2, issuer_type: 'receiving' },
    validateStatus: () => true,
  });
  console.log('Status:', r.status);
  console.log('Total results:', r.data?.total_results);
  console.log('First item keys:', r.data?.data?.[0] ? Object.keys(r.data.data[0]) : 'NONE');
  console.log('First item sample:', JSON.stringify(r.data?.data?.[0], null, 2));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
