-- Migración para agregar columnas de configuración de pagos a fiscal_emitters
-- Esto permite configurar cuentas bancarias y PayPal diferentes por empresa

DO $$
BEGIN
    -- ==========================================
    -- COLUMNAS PARA CUENTA BANCARIA
    -- ==========================================
    
    -- Nombre del banco
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fiscal_emitters' AND column_name = 'bank_name') THEN
        ALTER TABLE fiscal_emitters ADD COLUMN bank_name VARCHAR(100);
        RAISE NOTICE 'Columna bank_name agregada a fiscal_emitters';
    END IF;

    -- CLABE interbancaria (18 dígitos)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fiscal_emitters' AND column_name = 'bank_clabe') THEN
        ALTER TABLE fiscal_emitters ADD COLUMN bank_clabe VARCHAR(18);
        RAISE NOTICE 'Columna bank_clabe agregada a fiscal_emitters';
    END IF;

    -- Número de cuenta (opcional, 10 últimos dígitos de CLABE)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fiscal_emitters' AND column_name = 'bank_account') THEN
        ALTER TABLE fiscal_emitters ADD COLUMN bank_account VARCHAR(20);
        RAISE NOTICE 'Columna bank_account agregada a fiscal_emitters';
    END IF;

    -- ==========================================
    -- COLUMNAS PARA PAYPAL
    -- ==========================================
    
    -- Client ID de PayPal
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fiscal_emitters' AND column_name = 'paypal_client_id') THEN
        ALTER TABLE fiscal_emitters ADD COLUMN paypal_client_id VARCHAR(255);
        RAISE NOTICE 'Columna paypal_client_id agregada a fiscal_emitters';
    END IF;

    -- Secret de PayPal (encriptado o en variables de entorno en producción)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fiscal_emitters' AND column_name = 'paypal_secret') THEN
        ALTER TABLE fiscal_emitters ADD COLUMN paypal_secret VARCHAR(255);
        RAISE NOTICE 'Columna paypal_secret agregada a fiscal_emitters';
    END IF;

    -- Modo sandbox (true) o producción (false)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fiscal_emitters' AND column_name = 'paypal_sandbox') THEN
        ALTER TABLE fiscal_emitters ADD COLUMN paypal_sandbox BOOLEAN DEFAULT TRUE;
        RAISE NOTICE 'Columna paypal_sandbox agregada a fiscal_emitters';
    END IF;

    -- Flag para indicar si PayPal está configurado y verificado
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fiscal_emitters' AND column_name = 'paypal_configured') THEN
        ALTER TABLE fiscal_emitters ADD COLUMN paypal_configured BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Columna paypal_configured agregada a fiscal_emitters';
    END IF;

    -- ==========================================
    -- COLUMNA payment_method EN openpay_webhook_logs
    -- Para distinguir el método de pago en el dashboard
    -- ==========================================
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'openpay_webhook_logs' AND column_name = 'payment_method') THEN
        ALTER TABLE openpay_webhook_logs ADD COLUMN payment_method VARCHAR(30);
        RAISE NOTICE 'Columna payment_method agregada a openpay_webhook_logs';
    END IF;

END $$;

-- Agregar comentarios a las columnas
COMMENT ON COLUMN fiscal_emitters.bank_name IS 'Nombre del banco para pagos SPEI/efectivo';
COMMENT ON COLUMN fiscal_emitters.bank_clabe IS 'CLABE interbancaria de 18 dígitos';
COMMENT ON COLUMN fiscal_emitters.bank_account IS 'Número de cuenta bancaria';
COMMENT ON COLUMN fiscal_emitters.paypal_client_id IS 'Client ID de la aplicación PayPal';
COMMENT ON COLUMN fiscal_emitters.paypal_secret IS 'Secret de la aplicación PayPal';
COMMENT ON COLUMN fiscal_emitters.paypal_sandbox IS 'True para sandbox, False para producción';
COMMENT ON COLUMN fiscal_emitters.paypal_configured IS 'Indica si las credenciales PayPal fueron verificadas';
COMMENT ON COLUMN openpay_webhook_logs.payment_method IS 'Método de pago: card, spei, cash, paypal';

-- ==========================================
-- ÍNDICES PARA BÚSQUEDA RÁPIDA
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_openpay_logs_pending 
    ON openpay_webhook_logs(estatus_procesamiento) 
    WHERE estatus_procesamiento = 'pending_payment';

CREATE INDEX IF NOT EXISTS idx_openpay_logs_payment_method 
    ON openpay_webhook_logs(payment_method);

-- Mensaje de éxito (usando comentario ya que RAISE no funciona fuera de DO block)
-- ✅ Migración de configuración de pagos completada
