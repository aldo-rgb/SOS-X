const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:ApwbUFYQLQuDMihfDKxAJGNquMRfJsgj@switchyard.proxy.rlwy.net:47527/railway'
});

async function run() {
  try {
    console.log('Ejecutando migración: legacy_clients last_send + chartback columns ...');

    await pool.query(`
      ALTER TABLE legacy_clients
        ADD COLUMN IF NOT EXISTS last_send JSONB DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS last_send_maritimo JSONB DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS chartback BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS chartback_status VARCHAR(20) DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS next_contact_at TIMESTAMPTZ DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS chartback_notes TEXT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS chartback_activity JSONB DEFAULT '[]'
    `);

    console.log('✅ Columnas agregadas (o ya existían)');

    const res = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'legacy_clients'
        AND column_name IN ('last_send','last_send_maritimo','chartback','chartback_status','next_contact_at','chartback_notes','chartback_activity')
      ORDER BY column_name
    `);
    console.log('\nColumnas en legacy_clients:');
    res.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

  } catch (err) {
    console.error('❌ Error en migración:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
