/**
 * Migration runner: facturapi → facturama
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

(async () => {
    try {
        const sql = fs.readFileSync(
            path.join(__dirname, 'migrations', 'migrate_facturapi_to_facturama.sql'),
            'utf8'
        );
        await pool.query(sql);
        console.log('✅ Migración facturapi → facturama aplicada');

        const r = await pool.query(`
            SELECT table_name, column_name FROM information_schema.columns
             WHERE column_name IN ('facturama_id','facturapi_id')
               AND table_name IN ('facturas_emitidas','invoices','service_invoices')
             ORDER BY table_name, column_name
        `);
        console.table(r.rows);
    } catch (e) {
        console.error('❌ error:', e.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
