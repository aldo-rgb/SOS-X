-- ============================================================
-- PAYMENT VOUCHERS & SERVICE WALLETS MIGRATION
-- Enables multi-receipt payment uploads with OCR extraction
-- and per-service wallet balances
-- ============================================================

-- 1. Payment Vouchers (comprobantes de pago)
CREATE TABLE IF NOT EXISTS payment_vouchers (
  id SERIAL PRIMARY KEY,
  -- Links to either pobox_payments or openpay_webhook_logs
  payment_order_id INTEGER REFERENCES pobox_payments(id) ON DELETE SET NULL,
  webhook_log_id INTEGER REFERENCES openpay_webhook_logs(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  service_type VARCHAR(30) NOT NULL, -- POBOX_USA, AIR_CHN_MX, MARITIME, DHL_MTY, NATIONAL
  
  -- File storage
  file_url TEXT NOT NULL,
  file_key TEXT, -- S3 key for deletion
  file_type VARCHAR(10) NOT NULL DEFAULT 'jpg', -- jpg, png, pdf
  
  -- Amount extraction
  detected_amount DECIMAL(12,2), -- OCR detected
  declared_amount DECIMAL(12,2) NOT NULL, -- User confirmed
  currency VARCHAR(3) NOT NULL DEFAULT 'MXN',
  
  -- Review
  status VARCHAR(20) NOT NULL DEFAULT 'pending_review',
  -- pending_review, approved, rejected
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  
  -- Metadata
  ocr_raw_text TEXT, -- Full OCR text for audit
  ocr_confidence DECIMAL(5,2), -- 0-100
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vouchers_payment_order ON payment_vouchers(payment_order_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_webhook_log ON payment_vouchers(webhook_log_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_user ON payment_vouchers(user_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_status ON payment_vouchers(status);
CREATE INDEX IF NOT EXISTS idx_vouchers_service ON payment_vouchers(service_type);

-- 2. Service-specific wallets (billetera por servicio)
CREATE TABLE IF NOT EXISTS billetera_servicio (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  service_type VARCHAR(30) NOT NULL, -- POBOX_USA, AIR_CHN_MX, MARITIME, DHL_MTY, NATIONAL
  saldo DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(3) NOT NULL DEFAULT 'MXN',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, service_type)
);

CREATE INDEX IF NOT EXISTS idx_billetera_servicio_user ON billetera_servicio(user_id);

-- 3. Service wallet transactions log
CREATE TABLE IF NOT EXISTS billetera_servicio_transacciones (
  id SERIAL PRIMARY KEY,
  billetera_servicio_id INTEGER NOT NULL REFERENCES billetera_servicio(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  service_type VARCHAR(30) NOT NULL,
  tipo VARCHAR(20) NOT NULL, -- ingreso, egreso, excedente
  monto DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'MXN',
  concepto TEXT,
  -- References
  payment_order_id INTEGER REFERENCES pobox_payments(id),
  voucher_id INTEGER REFERENCES payment_vouchers(id),
  created_by INTEGER REFERENCES users(id), -- admin who triggered
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bst_billetera ON billetera_servicio_transacciones(billetera_servicio_id);
CREATE INDEX IF NOT EXISTS idx_bst_user ON billetera_servicio_transacciones(user_id);

-- 4. Add new status to pobox_payments
-- Add 'vouchers_submitted' as valid status (no enum, it's VARCHAR so just document it)
-- pending_payment → vouchers_submitted → completed / rejected

-- 5. Add voucher tracking columns to pobox_payments
ALTER TABLE pobox_payments ADD COLUMN IF NOT EXISTS voucher_total DECIMAL(12,2) DEFAULT 0.00;
ALTER TABLE pobox_payments ADD COLUMN IF NOT EXISTS voucher_count INTEGER DEFAULT 0;
ALTER TABLE pobox_payments ADD COLUMN IF NOT EXISTS surplus_amount DECIMAL(12,2) DEFAULT 0.00;
ALTER TABLE pobox_payments ADD COLUMN IF NOT EXISTS surplus_credited BOOLEAN DEFAULT FALSE;

-- 6. Helper function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_payment_vouchers_updated_at ON payment_vouchers;
CREATE TRIGGER update_payment_vouchers_updated_at
  BEFORE UPDATE ON payment_vouchers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_billetera_servicio_updated_at ON billetera_servicio;
CREATE TRIGGER update_billetera_servicio_updated_at
  BEFORE UPDATE ON billetera_servicio
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
