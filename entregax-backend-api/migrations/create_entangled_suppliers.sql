-- Migración: Proveedores de envío (beneficiarios) por cliente
-- Datos bancarios internacionales para módulo ENTANGLED

CREATE TABLE IF NOT EXISTS entangled_suppliers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Beneficiario
    nombre_beneficiario VARCHAR(255) NOT NULL,
    nombre_chino VARCHAR(255),                  -- Si es RMB
    direccion_beneficiario TEXT,
    pais_beneficiario VARCHAR(100),

    -- Cuenta
    numero_cuenta VARCHAR(100) NOT NULL,
    iban VARCHAR(100),

    -- Banco receptor
    banco_nombre VARCHAR(255) NOT NULL,
    banco_direccion TEXT,
    banco_pais VARCHAR(100),

    -- Códigos de identificación
    swift_bic VARCHAR(50),
    aba_routing VARCHAR(50),

    -- Banco intermediario (opcional)
    banco_intermediario_nombre VARCHAR(255),
    banco_intermediario_swift VARCHAR(50),
    banco_intermediario_direccion TEXT,

    -- Detalles
    divisa_default VARCHAR(10),                 -- RMB, USD, EUR, etc.
    motivo_default TEXT,

    -- Foto/documento
    foto_url TEXT,

    -- Meta
    alias VARCHAR(100),                         -- Apodo para el cliente
    is_favorite BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_entangled_suppliers_user ON entangled_suppliers(user_id);
CREATE INDEX IF NOT EXISTS idx_entangled_suppliers_active ON entangled_suppliers(user_id, is_active);

-- Extender entangled_payment_requests con datos del proveedor de envío (snapshot + FK)
ALTER TABLE entangled_payment_requests
    ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES entangled_suppliers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sup_nombre_beneficiario VARCHAR(255),
    ADD COLUMN IF NOT EXISTS sup_nombre_chino VARCHAR(255),
    ADD COLUMN IF NOT EXISTS sup_direccion TEXT,
    ADD COLUMN IF NOT EXISTS sup_numero_cuenta VARCHAR(100),
    ADD COLUMN IF NOT EXISTS sup_iban VARCHAR(100),
    ADD COLUMN IF NOT EXISTS sup_banco_nombre VARCHAR(255),
    ADD COLUMN IF NOT EXISTS sup_banco_direccion TEXT,
    ADD COLUMN IF NOT EXISTS sup_swift_bic VARCHAR(50),
    ADD COLUMN IF NOT EXISTS sup_aba_routing VARCHAR(50),
    ADD COLUMN IF NOT EXISTS sup_banco_intermediario_nombre VARCHAR(255),
    ADD COLUMN IF NOT EXISTS sup_banco_intermediario_swift VARCHAR(50),
    ADD COLUMN IF NOT EXISTS sup_motivo TEXT,
    ADD COLUMN IF NOT EXISTS sup_foto_url TEXT;
