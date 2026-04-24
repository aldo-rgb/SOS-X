/* Run Facturama reception migration */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'add_facturama_reception.sql'), 'utf-8');
    console.log('🚀 Aplicando add_facturama_reception.sql ...');
    try {
        await pool.query(sql);
        console.log('✅ Migración Facturama aplicada');

        // Validación
        const cols = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name='fiscal_emitters' AND column_name LIKE 'facturama%'
            ORDER BY column_name
        `);
        console.log('Columnas Facturama en fiscal_emitters:');
        cols.rows.forEach(r => console.log('  -', r.column_name));

        const recInvCols = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name='accounting_received_invoices'
              AND column_name IN ('approval_status','detection_source','facturama_id','due_date','xml_url')
            ORDER BY column_name
        `);
        console.log('Nuevas columnas accounting_received_invoices:');
        recInvCols.rows.forEach(r => console.log('  -', r.column_name));

        const tbl = await pool.query(`SELECT to_regclass('facturama_webhook_logs') as t`);
        console.log('Tabla facturama_webhook_logs:', tbl.rows[0].t);
    } catch (e) {
        console.error('❌ Error:', e.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}
run();
