-- ============================================
-- MIGRACIÓN: Openpay Multi-Empresa
-- Cada empresa emisora tiene su propia cuenta Openpay
-- ============================================

-- 1. Agregar columnas de Openpay a fiscal_emitters
ALTER TABLE fiscal_emitters ADD COLUMN IF NOT EXISTS openpay_merchant_id VARCHAR(50);
ALTER TABLE fiscal_emitters ADD COLUMN IF NOT EXISTS openpay_private_key TEXT;
ALTER TABLE fiscal_emitters ADD COLUMN IF NOT EXISTS openpay_public_key TEXT;
ALTER TABLE fiscal_emitters ADD COLUMN IF NOT EXISTS openpay_production_mode BOOLEAN DEFAULT FALSE;
ALTER TABLE fiscal_emitters ADD COLUMN IF NOT EXISTS openpay_webhook_secret VARCHAR(100);
ALTER TABLE fiscal_emitters ADD COLUMN IF NOT EXISTS openpay_commission_fee DECIMAL(10,2) DEFAULT 10.00; -- Comisión por transacción
ALTER TABLE fiscal_emitters ADD COLUMN IF NOT EXISTS openpay_configured BOOLEAN DEFAULT FALSE;

-- Comentarios
COMMENT ON COLUMN fiscal_emitters.openpay_merchant_id IS 'ID del comercio en Openpay';
COMMENT ON COLUMN fiscal_emitters.openpay_private_key IS 'Llave privada de API Openpay (encriptada)';
COMMENT ON COLUMN fiscal_emitters.openpay_public_key IS 'Llave pública de API Openpay';
COMMENT ON COLUMN fiscal_emitters.openpay_production_mode IS 'TRUE = Producción, FALSE = Sandbox';
COMMENT ON COLUMN fiscal_emitters.openpay_webhook_secret IS 'Secreto para validar webhooks';
COMMENT ON COLUMN fiscal_emitters.openpay_commission_fee IS 'Comisión STP por transacción (aprox $8-12 MXN)';

-- 2. Crear tabla de logs de webhooks de Openpay
CREATE TABLE IF NOT EXISTS openpay_webhook_logs (
    id SERIAL PRIMARY KEY,
    transaction_id VARCHAR(100) NOT NULL,
    empresa_id INTEGER REFERENCES fiscal_emitters(id),
    user_id INTEGER REFERENCES users(id),
    clabe_virtual VARCHAR(18),
    monto_recibido DECIMAL(12,2) NOT NULL,
    monto_neto DECIMAL(12,2), -- Después de comisión
    concepto TEXT,
    fecha_pago TIMESTAMP NOT NULL,
    estatus_procesamiento VARCHAR(20) DEFAULT 'pendiente', -- pendiente, procesado, error
    error_message TEXT,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_openpay_logs_transaction ON openpay_webhook_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_openpay_logs_user ON openpay_webhook_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_openpay_logs_empresa ON openpay_webhook_logs(empresa_id);
CREATE INDEX IF NOT EXISTS idx_openpay_logs_clabe ON openpay_webhook_logs(clabe_virtual);
CREATE INDEX IF NOT EXISTS idx_openpay_logs_status ON openpay_webhook_logs(estatus_procesamiento);

-- 3. Agregar relación empresa a CLABE de usuarios
ALTER TABLE users ADD COLUMN IF NOT EXISTS openpay_empresa_id INTEGER REFERENCES fiscal_emitters(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS clabe_created_at TIMESTAMP;

COMMENT ON COLUMN users.openpay_empresa_id IS 'Empresa que gestiona la CLABE virtual de este cliente';
COMMENT ON COLUMN users.clabe_created_at IS 'Fecha de creación de la CLABE virtual';

-- 4. Tabla de conciliación de pagos (historial de aplicación de pagos)
CREATE TABLE IF NOT EXISTS openpay_payment_applications (
    id SERIAL PRIMARY KEY,
    webhook_log_id INTEGER REFERENCES openpay_webhook_logs(id),
    user_id INTEGER REFERENCES users(id),
    package_id INTEGER REFERENCES packages(id),
    monto_aplicado DECIMAL(12,2) NOT NULL,
    saldo_anterior DECIMAL(12,2),
    saldo_nuevo DECIMAL(12,2),
    tipo_documento VARCHAR(20), -- 'guia', 'factura', 'consolidado'
    documento_referencia VARCHAR(50), -- tracking, folio factura, etc
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_app_webhook ON openpay_payment_applications(webhook_log_id);
CREATE INDEX IF NOT EXISTS idx_payment_app_user ON openpay_payment_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_app_package ON openpay_payment_applications(package_id);

-- 5. Vista para reporte de pagos SPEI
CREATE OR REPLACE VIEW vw_openpay_payments AS
SELECT 
    owl.id,
    owl.transaction_id,
    owl.monto_recibido,
    owl.monto_neto,
    owl.fecha_pago,
    owl.estatus_procesamiento,
    fe.alias as empresa_alias,
    fe.rfc as empresa_rfc,
    u.full_name as cliente_nombre,
    u.email as cliente_email,
    u.virtual_clabe,
    owl.created_at
FROM openpay_webhook_logs owl
LEFT JOIN fiscal_emitters fe ON owl.empresa_id = fe.id
LEFT JOIN users u ON owl.user_id = u.id
ORDER BY owl.fecha_pago DESC;

COMMENT ON VIEW vw_openpay_payments IS 'Vista de pagos SPEI recibidos por Openpay';

SELECT 'Migración Openpay Multi-Empresa completada' as resultado;
