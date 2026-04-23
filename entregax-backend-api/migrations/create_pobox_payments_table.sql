-- ============================================
-- MIGRACIÓN: Tabla de Pagos PO Box - MULTISUCURSAL
-- Tabla para rastrear pagos de paquetes PO Box USA
-- Soporta PayPal, OpenPay (tarjeta/SPEI) y Efectivo
-- Integrado con Dashboard de Cobranza y Caja Chica
-- ============================================

-- Crear tabla de pagos PO Box
CREATE TABLE IF NOT EXISTS pobox_payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    package_ids JSONB NOT NULL, -- Array de IDs de paquetes incluidos en el pago
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'MXN',
    
    -- Método de pago
    payment_method VARCHAR(20) NOT NULL,
    payment_reference VARCHAR(50) UNIQUE NOT NULL, -- Referencia única PB-XXX, OP-XXX, EF-XXX, PP-XXX
    
    -- Estado del pago
    status VARCHAR(20) DEFAULT 'pending',
    
    -- IDs externos (PayPal Order ID, OpenPay Checkout ID, etc.)
    external_order_id VARCHAR(100),
    external_transaction_id VARCHAR(100),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP,
    expires_at TIMESTAMP, -- Para pagos en efectivo que tienen límite de tiempo
    
    -- Confirmación manual (para efectivo)
    confirmed_by INTEGER,
    confirmation_notes TEXT,
    
    -- Relación con caja chica (cuando se confirma en efectivo)
    caja_chica_transaccion_id INTEGER,
    
    -- Metadata adicional
    metadata JSONB
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_pobox_payments_user ON pobox_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_pobox_payments_reference ON pobox_payments(payment_reference);
CREATE INDEX IF NOT EXISTS idx_pobox_payments_status ON pobox_payments(status);
CREATE INDEX IF NOT EXISTS idx_pobox_payments_method ON pobox_payments(payment_method);
CREATE INDEX IF NOT EXISTS idx_pobox_payments_external ON pobox_payments(external_order_id);
CREATE INDEX IF NOT EXISTS idx_pobox_payments_created ON pobox_payments(created_at DESC);

-- Agregar columnas de pago a packages si no existen
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'packages' AND column_name = 'payment_status') THEN
        ALTER TABLE packages ADD COLUMN payment_status VARCHAR(20) DEFAULT 'pending';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'packages' AND column_name = 'payment_date') THEN
        ALTER TABLE packages ADD COLUMN payment_date TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'packages' AND column_name = 'pobox_payment_id') THEN
        ALTER TABLE packages ADD COLUMN pobox_payment_id INTEGER REFERENCES pobox_payments(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'packages' AND column_name = 'monto_pagado') THEN
        ALTER TABLE packages ADD COLUMN monto_pagado NUMERIC(10,2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'packages' AND column_name = 'saldo_pendiente') THEN
        ALTER TABLE packages ADD COLUMN saldo_pendiente NUMERIC(10,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'packages' AND column_name = 'costing_paid') THEN
        ALTER TABLE packages ADD COLUMN costing_paid BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'packages' AND column_name = 'costing_paid_at') THEN
        ALTER TABLE packages ADD COLUMN costing_paid_at TIMESTAMP;
    END IF;
END $$;

-- Agregar columna tipo_pago a openpay_webhook_logs si no existe (para diferenciar SPEI de tarjeta)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'openpay_webhook_logs' AND column_name = 'tipo_pago') THEN
        ALTER TABLE openpay_webhook_logs ADD COLUMN tipo_pago VARCHAR(20) DEFAULT 'spei';
    END IF;
END $$;

-- Agregar configuración bancaria a service_companies si no existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_companies' AND column_name = 'bank_name') THEN
        ALTER TABLE service_companies ADD COLUMN bank_name VARCHAR(100);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_companies' AND column_name = 'bank_clabe') THEN
        ALTER TABLE service_companies ADD COLUMN bank_clabe VARCHAR(18);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_companies' AND column_name = 'bank_account') THEN
        ALTER TABLE service_companies ADD COLUMN bank_account VARCHAR(20);
    END IF;
END $$;

-- Insertar configuración para po_box si no existe
-- (usa UNIQUE(service) para evitar duplicados; ON CONFLICT sin target antes no detectaba conflicto)
INSERT INTO service_companies (service, company_name, legal_name, rfc, is_active)
VALUES ('po_box', 'EntregaX PO Box', 'ENTREGAX SERVICIOS POSTALES S.A. DE C.V.', 'ESP000000XXX', TRUE)
ON CONFLICT (service) DO NOTHING;

-- Comentarios para documentación
COMMENT ON TABLE pobox_payments IS 'Pagos de paquetes PO Box USA - Integrado con OpenPay Multi-Empresa, Caja Chica y Dashboard de Cobranza';
COMMENT ON COLUMN pobox_payments.package_ids IS 'Array JSON con IDs de paquetes incluidos en este pago';
COMMENT ON COLUMN pobox_payments.payment_reference IS 'Referencia única para identificar el pago (PP-, OP-, EF- según método)';
COMMENT ON COLUMN pobox_payments.external_order_id IS 'ID de la orden en el sistema externo (PayPal Order ID, OpenPay Checkout ID)';
COMMENT ON COLUMN pobox_payments.external_transaction_id IS 'ID de la transacción completada en el sistema externo';
COMMENT ON COLUMN pobox_payments.expires_at IS 'Fecha límite para pagos en efectivo (generalmente 48 horas)';
COMMENT ON COLUMN pobox_payments.caja_chica_transaccion_id IS 'ID de la transacción en caja_chica_transacciones cuando se confirma pago en efectivo';
