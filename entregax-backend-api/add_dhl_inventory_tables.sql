-- ============================================
-- TABLAS PARA SISTEMA DHL E INVENTARIO POR SUCURSAL
-- ============================================

-- Agregar campo supervisor_pin a usuarios (si no existe)
ALTER TABLE users ADD COLUMN IF NOT EXISTS supervisor_pin VARCHAR(10);

-- PIN por defecto para super_admin
UPDATE users SET supervisor_pin = '1234' WHERE role = 'super_admin' AND supervisor_pin IS NULL;

-- Tabla de paquetes DHL
CREATE TABLE IF NOT EXISTS dhl_packages (
    id SERIAL PRIMARY KEY,
    tracking_number VARCHAR(20) UNIQUE NOT NULL,
    weight_kg DECIMAL(10,2),
    pieces INTEGER DEFAULT 1,
    client_name VARCHAR(255),
    client_phone VARCHAR(50),
    description TEXT,
    branch_id INTEGER REFERENCES branches(id),
    received_by INTEGER REFERENCES users(id),
    received_at TIMESTAMP DEFAULT NOW(),
    released_by INTEGER REFERENCES users(id),
    released_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'received', -- received, in_process, released, delivered
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_dhl_packages_tracking ON dhl_packages(tracking_number);
CREATE INDEX IF NOT EXISTS idx_dhl_packages_branch ON dhl_packages(branch_id);
CREATE INDEX IF NOT EXISTS idx_dhl_packages_status ON dhl_packages(status);
CREATE INDEX IF NOT EXISTS idx_dhl_packages_received_at ON dhl_packages(received_at);

-- Tabla de inventario por sucursal (unificada para todos los tipos de paquete)
CREATE TABLE IF NOT EXISTS branch_inventory (
    id SERIAL PRIMARY KEY,
    branch_id INTEGER REFERENCES branches(id) NOT NULL,
    package_type VARCHAR(50) NOT NULL, -- 'dhl', 'package', 'air', 'log', 'us'
    package_id INTEGER NOT NULL, -- ID de la tabla correspondiente
    tracking_number VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'in_stock', -- in_stock, released, delivered
    received_at TIMESTAMP DEFAULT NOW(),
    received_by INTEGER REFERENCES users(id),
    released_at TIMESTAMP,
    released_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(branch_id, package_type, package_id)
);

-- Índices para inventario
CREATE INDEX IF NOT EXISTS idx_branch_inventory_branch ON branch_inventory(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_inventory_tracking ON branch_inventory(tracking_number);
CREATE INDEX IF NOT EXISTS idx_branch_inventory_status ON branch_inventory(status);
CREATE INDEX IF NOT EXISTS idx_branch_inventory_type ON branch_inventory(package_type);

-- Tabla de historial de escaneos de bodega
CREATE TABLE IF NOT EXISTS warehouse_scan_history (
    id SERIAL PRIMARY KEY,
    package_id INTEGER,
    package_type VARCHAR(50) DEFAULT 'package', -- 'dhl', 'package', 'air', 'log', 'us'
    tracking_number VARCHAR(100) NOT NULL,
    scan_type VARCHAR(20) NOT NULL, -- 'INGRESO', 'SALIDA'
    branch_id INTEGER REFERENCES branches(id),
    scanned_by INTEGER REFERENCES users(id),
    scanned_at TIMESTAMP DEFAULT NOW(),
    notes TEXT
);

-- Índices para historial
CREATE INDEX IF NOT EXISTS idx_warehouse_scan_branch ON warehouse_scan_history(branch_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_scan_tracking ON warehouse_scan_history(tracking_number);
CREATE INDEX IF NOT EXISTS idx_warehouse_scan_date ON warehouse_scan_history(scanned_at);

-- Verificar que existan las columnas necesarias en users
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'supervisor_pin') THEN
        ALTER TABLE users ADD COLUMN supervisor_pin VARCHAR(10);
    END IF;
END $$;

-- Confirmar creación
SELECT 'Tablas creadas exitosamente' as resultado;
