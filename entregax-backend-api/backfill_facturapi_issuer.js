// backfill_facturapi_issuer.js — Re-consulta Facturapi para llenar emisor_rfc/nombre
// y normalizar metodo_pago/forma_pago/uso_cfdi en filas previamente sincronizadas
// donde emisor_nombre quedó NULL por bug en mapeo (issuer vs issuer_info).
require('dotenv').config();
const { pool } = require('./dist/db');
const axios = require('axios');

const FACTURAPI_BASE = 'https://www.facturapi.io/v2';

(async () => {
  try {
    const { rows: emitters } = await pool.query(
      `SELECT id, alias, rfc, facturapi_api_key
         FROM fiscal_emitters
        WHERE facturapi_api_key IS NOT NULL`
    );

    let totalUpdated = 0;
    for (const e of emitters) {
      const { rows: pending } = await pool.query(
        `SELECT id, facturapi_id
           FROM accounting_received_invoices
          WHERE fiscal_emitter_id = $1
            AND facturapi_id IS NOT NULL
            AND (emisor_nombre IS NULL OR emisor_rfc IS NULL)`,
        [e.id]
      );
      console.log(`Emitter ${e.alias} (${e.rfc}): ${pending.length} rows to backfill`);

      for (const row of pending) {
        const r = await axios.get(`${FACTURAPI_BASE}/invoices/${row.facturapi_id}`, {
          auth: { username: e.facturapi_api_key, password: '' },
          validateStatus: () => true,
          timeout: 30000,
        });
        if (r.status !== 200) {
          console.log(`  ✗ ${row.facturapi_id} → status ${r.status}`);
          continue;
        }
        const cfdi = r.data || {};
        const issuer = cfdi.issuer_info || {};
        const customer = cfdi.customer || {};

        await pool.query(
          `UPDATE accounting_received_invoices
              SET emisor_rfc       = COALESCE($1, emisor_rfc),
                  emisor_nombre    = COALESCE($2, emisor_nombre),
                  receptor_nombre  = COALESCE($3, receptor_nombre),
                  metodo_pago      = COALESCE($4, metodo_pago),
                  forma_pago       = COALESCE($5, forma_pago),
                  uso_cfdi         = COALESCE($6, uso_cfdi),
                  tipo_comprobante = COALESCE($7, tipo_comprobante)
            WHERE id = $8`,
          [
            issuer.tax_id || null,
            issuer.legal_name || null,
            customer.legal_name || null,
            cfdi.payment_method || null,
            cfdi.payment_form || null,
            cfdi.use || null,
            cfdi.type || null,
            row.id,
          ]
        );
        totalUpdated++;
        if (totalUpdated % 10 === 0) console.log(`  …${totalUpdated} rows updated`);
      }
    }

    console.log(`\n✅ Backfill complete. Total rows updated: ${totalUpdated}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Backfill error:', err.message);
    process.exit(1);
  }
})();
