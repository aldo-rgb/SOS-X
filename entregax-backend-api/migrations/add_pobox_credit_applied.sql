-- Soporte de pago parcial con crédito para pobox_payments
ALTER TABLE pobox_payments
  ADD COLUMN IF NOT EXISTS credit_applied NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_service VARCHAR(50),
  ADD COLUMN IF NOT EXISTS credit_applied_at TIMESTAMP;
