// Diagnóstico XP849003 (id=74)
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const r2 = await pool.query(
    `SELECT id, referencia_pago, estatus_global, estatus_factura, estatus_proveedor,
            error_message, comprobante_subido_at, payment_deadline_at,
            raw_response->>'auto_cancelled' AS auto_cancelled,
            raw_response->>'cancellation_fee_usd' AS fee,
            updated_at, created_at
       FROM entangled_payment_requests
      WHERE id = 74`
  );
  console.log('=== ESTADO ACTUAL ===');
  console.table(r2.rows);

  // Check webhook table existence
  const ck = await pool.query(
    `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'entangled_webhook_logs'`
  );
  if (ck.rows.length > 0) {
    const r1 = await pool.query(
      `SELECT id, evento, recibido_at, raw_payload->>'estatus' AS estatus, error_message
         FROM entangled_webhook_logs
        WHERE payment_request_id = 74
           OR (raw_payload->>'transaccion_id') = '79ca5d44-e97b-4485-b95e-2746f85cfce7'
        ORDER BY recibido_at`
    );
    console.log('\n=== WEBHOOK LOGS ===');
    console.table(r1.rows);
  }
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
