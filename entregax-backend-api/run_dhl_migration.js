// Migración para crear tablas DHL e inventario
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function runMigration() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 Iniciando migración DHL e Inventario...');
        
        // Agregar campo supervisor_pin a usuarios
        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS supervisor_pin VARCHAR(10)
        `);
        console.log('✅ Campo supervisor_pin agregado');
        
        // PIN por defecto para super_admin
        await client.query(`
            UPDATE users SET supervisor_pin = '1234' WHERE role = 'super_admin' AND supervisor_pin IS NULL
        `);
        console.log('✅ PIN de supervisor asignado a super_admin');
        
        // Tabla de paquetes DHL
        await client.query(`
            CREATE TABLE IF NOT EXISTS dhl_packages (
                id SERIAL PRIMARY KEY,
                tracking_number VARCHAR(20) UNIQUE NOT NULL,
                weight_kg DECIMAL(10,2),
                pieces INTEGER DEFAULT 1,
                client_name VARCHAR(255),
                client_phone VARCHAR(50),
                description TEXT,
                branch_id INTEGER,
                received_by INTEGER,
                received_at TIMESTAMP DEFAULT NOW(),
                released_by INTEGER,
                released_at TIMESTAMP,
                status VARCHAR(50) DEFAULT 'received',
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Tabla dhl_packages creada');
        
        // Índices para DHL
        await client.query(`CREATE INDEX IF NOT EXISTS idx_dhl_packages_tracking ON dhl_packages(tracking_number)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_dhl_packages_branch ON dhl_packages(branch_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_dhl_packages_status ON dhl_packages(status)`);
        console.log('✅ Índices de dhl_packages creados');
        
        // Tabla de inventario por sucursal
        await client.query(`
            CREATE TABLE IF NOT EXISTS branch_inventory (
                id SERIAL PRIMARY KEY,
                branch_id INTEGER NOT NULL,
                package_type VARCHAR(50) NOT NULL,
                package_id INTEGER NOT NULL,
                tracking_number VARCHAR(100) NOT NULL,
                status VARCHAR(50) DEFAULT 'in_stock',
                received_at TIMESTAMP DEFAULT NOW(),
                received_by INTEGER,
                released_at TIMESTAMP,
                released_by INTEGER,
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Tabla branch_inventory creada');
        
        // Índice único
        try {
            await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_inventory_unique ON branch_inventory(branch_id, package_type, package_id)`);
        } catch (e) { console.log('ℹ️ Índice único ya existe'); }
        
        // Índices para inventario
        await client.query(`CREATE INDEX IF NOT EXISTS idx_branch_inventory_branch ON branch_inventory(branch_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_branch_inventory_tracking ON branch_inventory(tracking_number)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_branch_inventory_status ON branch_inventory(status)`);
        console.log('✅ Índices de branch_inventory creados');
        
        // Verificar si existe warehouse_scan_history, si no, crearla
        const checkTable = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'warehouse_scan_history'
            )
        `);
        
        if (!checkTable.rows[0].exists) {
            await client.query(`
                CREATE TABLE warehouse_scan_history (
                    id SERIAL PRIMARY KEY,
                    package_id INTEGER,
                    package_type VARCHAR(50) DEFAULT 'package',
                    tracking_number VARCHAR(100) NOT NULL,
                    scan_type VARCHAR(20) NOT NULL,
                    branch_id INTEGER,
                    scanned_by INTEGER,
                    scanned_at TIMESTAMP DEFAULT NOW(),
                    notes TEXT
                )
            `);
            console.log('✅ Tabla warehouse_scan_history creada');
        } else {
            console.log('ℹ️ Tabla warehouse_scan_history ya existe');
        }
        
        // Índices para historial
        try {
            await client.query(`CREATE INDEX IF NOT EXISTS idx_warehouse_scan_branch ON warehouse_scan_history(branch_id)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_warehouse_scan_tracking ON warehouse_scan_history(tracking_number)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_warehouse_scan_date ON warehouse_scan_history(scanned_at)`);
            console.log('✅ Índices de warehouse_scan_history creados');
        } catch (e) {
            console.log('ℹ️ Algunos índices ya existen');
        }
        
        console.log('\n🎉 Migración completada exitosamente!');
        
    } catch (error) {
        console.error('❌ Error en migración:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration().catch(console.error);
