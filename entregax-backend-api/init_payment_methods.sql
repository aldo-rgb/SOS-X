-- ============================================================
-- Script para crear la tabla de métodos de pago
-- Ejecutar en PostgreSQL
-- ============================================================

-- Tabla de métodos de pago del usuario
CREATE TABLE IF NOT EXISTS payment_methods (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('card', 'paypal', 'bank_transfer')),
    alias VARCHAR(100),
    
    -- Para tarjetas
    last_four VARCHAR(4),
    card_brand VARCHAR(20),
    holder_name VARCHAR(100),
    
    -- Para PayPal
    paypal_email VARCHAR(100),
    
    -- Para transferencia bancaria
    bank_name VARCHAR(100),
    clabe VARCHAR(18),
    beneficiary VARCHAR(100),
    
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_default ON payment_methods(user_id, is_default);

-- Asegurar que la tabla de direcciones exista con las columnas necesarias
-- (si ya existe, esto no hará nada)
CREATE TABLE IF NOT EXISTS addresses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alias VARCHAR(100) DEFAULT 'Principal',
    recipient_name VARCHAR(100),
    street VARCHAR(200) NOT NULL,
    exterior_number VARCHAR(20),
    interior_number VARCHAR(20),
    neighborhood VARCHAR(100),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    zip_code VARCHAR(10) NOT NULL,
    phone VARCHAR(20),
    reference TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_default ON addresses(user_id, is_default);

-- Mensaje de éxito
SELECT 'Tablas payment_methods y addresses creadas/verificadas correctamente' as status;
