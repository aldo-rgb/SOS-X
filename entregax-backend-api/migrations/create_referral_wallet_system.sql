-- ============================================
-- MIGRACIÓN: SISTEMA DE REFERIDOS Y MONEDERO DIGITAL
-- Fecha: 2026-03-12
-- ============================================

-- 0. ASEGURAR PK EN USERS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'users' AND constraint_type = 'PRIMARY KEY'
    ) THEN
        ALTER TABLE users ADD PRIMARY KEY (id);
    END IF;
END $$;

-- 1. TABLA DE CONFIGURACIÓN GENERAL
CREATE TABLE IF NOT EXISTS system_configurations (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value JSONB NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER
);

INSERT INTO system_configurations (config_key, config_value, description) VALUES
('referral_settings', '{"referrer_bonus": 500, "referred_bonus": 500, "currency": "MXN", "minimum_order_amount": 1000, "is_active": true, "require_first_payment": true, "max_referrals_per_user": 100, "bonus_expiry_days": 365}', 'Configuración del programa de referidos'),
('antifraud_settings', '{"check_duplicate_card": true, "check_duplicate_rfc": true, "check_duplicate_email_domain": false, "check_duplicate_device": true, "min_days_between_referrals": 1, "max_referrals_same_ip": 5}', 'Configuración anti-fraude para referidos')
ON CONFLICT (config_key) DO NOTHING;

-- 2. TABLA BILLETERA_DIGITAL
CREATE TABLE IF NOT EXISTS billetera_digital (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER UNIQUE NOT NULL,
    saldo_actual DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    saldo_pendiente DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    moneda VARCHAR(3) DEFAULT 'MXN',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billetera_usuario ON billetera_digital(usuario_id);

-- 3. TIPO Y TABLA DE TRANSACCIONES
DO $$ BEGIN
    CREATE TYPE billetera_tipo_transaccion AS ENUM ('ingreso', 'egreso', 'pendiente', 'liberacion', 'expiracion');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS billetera_transacciones (
    id SERIAL PRIMARY KEY,
    billetera_id INTEGER NOT NULL,
    tipo billetera_tipo_transaccion NOT NULL,
    monto DECIMAL(12, 2) NOT NULL,
    saldo_anterior DECIMAL(12, 2) NOT NULL,
    saldo_posterior DECIMAL(12, 2) NOT NULL,
    concepto VARCHAR(255) NOT NULL,
    referencia_tipo VARCHAR(50),
    referencia_id INTEGER,
    metadata JSONB DEFAULT '{}',
    fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER
);

CREATE INDEX IF NOT EXISTS idx_billetera_trans_billetera ON billetera_transacciones(billetera_id);
CREATE INDEX IF NOT EXISTS idx_billetera_trans_fecha ON billetera_transacciones(fecha_movimiento DESC);

-- 4. TIPO Y TABLA DE REFERIDOS
DO $$ BEGIN
    CREATE TYPE estado_referido AS ENUM ('registrado', 'primer_pago', 'validado', 'rechazado', 'expirado');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS referidos (
    id SERIAL PRIMARY KEY,
    referidor_id INTEGER NOT NULL,
    referido_id INTEGER NOT NULL UNIQUE,
    codigo_usado VARCHAR(20) NOT NULL,
    estado estado_referido DEFAULT 'registrado',
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_primer_pago TIMESTAMP,
    fecha_validacion TIMESTAMP,
    monto_primer_pago DECIMAL(12, 2),
    orden_id INTEGER,
    bono_referidor DECIMAL(12, 2) DEFAULT 500.00,
    bono_referido DECIMAL(12, 2) DEFAULT 500.00,
    bonos_pagados BOOLEAN DEFAULT FALSE,
    ip_registro VARCHAR(45),
    user_agent TEXT,
    device_fingerprint VARCHAR(255),
    tarjeta_hash VARCHAR(64),
    razon_rechazo TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_referidos_referidor ON referidos(referidor_id);
CREATE INDEX IF NOT EXISTS idx_referidos_estado ON referidos(estado);

-- 5. TABLA DE CÓDIGOS DE REFERIDO
CREATE TABLE IF NOT EXISTS codigos_referido (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    codigo VARCHAR(20) UNIQUE NOT NULL,
    tipo VARCHAR(20) DEFAULT 'personal',
    usos_totales INTEGER DEFAULT 0,
    limite_usos INTEGER,
    bono_especial_referidor DECIMAL(12, 2),
    bono_especial_referido DECIMAL(12, 2),
    fecha_expiracion DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_codigos_usuario ON codigos_referido(usuario_id);

-- 6. TABLA ANTI-FRAUDE
CREATE TABLE IF NOT EXISTS antifraud_checks (
    id SERIAL PRIMARY KEY,
    referido_id INTEGER,
    usuario_id INTEGER NOT NULL,
    check_type VARCHAR(50) NOT NULL,
    check_result BOOLEAN NOT NULL,
    check_details JSONB,
    risk_score INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. AGREGAR COLUMNAS A USERS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'referrals_count') THEN
        ALTER TABLE users ADD COLUMN referrals_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'referrals_earnings') THEN
        ALTER TABLE users ADD COLUMN referrals_earnings DECIMAL(12, 2) DEFAULT 0.00;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'first_payment_date') THEN
        ALTER TABLE users ADD COLUMN first_payment_date TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'first_payment_amount') THEN
        ALTER TABLE users ADD COLUMN first_payment_amount DECIMAL(12, 2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'card_hashes') THEN
        ALTER TABLE users ADD COLUMN card_hashes TEXT[] DEFAULT ARRAY[]::TEXT[];
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'device_fingerprint') THEN
        ALTER TABLE users ADD COLUMN device_fingerprint VARCHAR(255);
    END IF;
END $$;

-- 8. FUNCIÓN PARA GENERAR CÓDIGOS
CREATE OR REPLACE FUNCTION generate_referral_code(user_id INTEGER, user_name VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    base_code VARCHAR(20);
    final_code VARCHAR(20);
    attempts INTEGER := 0;
BEGIN
    IF user_name IS NOT NULL AND LENGTH(TRIM(user_name)) > 0 THEN
        base_code := UPPER(SUBSTRING(REGEXP_REPLACE(user_name, '[^a-zA-Z]', '', 'g') FROM 1 FOR 4));
        IF LENGTH(base_code) < 2 THEN base_code := 'GEX'; END IF;
        final_code := base_code || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');
    ELSE
        final_code := 'GEX' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    END IF;
    
    WHILE EXISTS (SELECT 1 FROM codigos_referido WHERE codigo = final_code) AND attempts < 10 LOOP
        final_code := 'GEX' || LPAD(FLOOR(RANDOM() * 100000)::TEXT, 5, '0');
        attempts := attempts + 1;
    END LOOP;
    
    RETURN final_code;
END;
$$ LANGUAGE plpgsql;

-- 9. CREAR BILLETERAS PARA USUARIOS EXISTENTES
INSERT INTO billetera_digital (usuario_id, saldo_actual, moneda)
SELECT id, COALESCE(wallet_balance, 0), 'MXN' FROM users
WHERE id NOT IN (SELECT usuario_id FROM billetera_digital)
ON CONFLICT (usuario_id) DO UPDATE SET saldo_actual = EXCLUDED.saldo_actual;

-- 10. GENERAR CÓDIGOS PARA USUARIOS SIN CÓDIGO
INSERT INTO codigos_referido (usuario_id, codigo, tipo)
SELECT u.id, generate_referral_code(u.id, u.full_name), 'personal'
FROM users u
WHERE u.id NOT IN (SELECT usuario_id FROM codigos_referido WHERE tipo = 'personal')
ON CONFLICT (codigo) DO NOTHING;

-- Actualizar referral_code en users
UPDATE users u
SET referral_code = cr.codigo
FROM codigos_referido cr
WHERE u.id = cr.usuario_id AND cr.tipo = 'personal'
  AND (u.referral_code IS NULL OR u.referral_code = '');

-- 11. VISTAS
CREATE OR REPLACE VIEW v_usuarios_billetera AS
SELECT u.id AS usuario_id, u.full_name, u.email, u.referral_code,
    COALESCE(bd.saldo_actual, 0) AS saldo_actual,
    COALESCE(bd.saldo_pendiente, 0) AS saldo_pendiente,
    COALESCE(bd.moneda, 'MXN') AS moneda
FROM users u LEFT JOIN billetera_digital bd ON u.id = bd.usuario_id;

CREATE OR REPLACE VIEW v_top_referidores AS
SELECT u.id, u.full_name, u.email, u.referral_code, COUNT(r.id) AS total_referidos,
    SUM(CASE WHEN r.estado = 'validado' THEN 1 ELSE 0 END) AS referidos_validados,
    COALESCE(SUM(CASE WHEN r.estado = 'validado' THEN r.bono_referidor ELSE 0 END), 0) AS total_ganado
FROM users u LEFT JOIN referidos r ON u.id = r.referidor_id
GROUP BY u.id, u.full_name, u.email, u.referral_code ORDER BY total_ganado DESC;
