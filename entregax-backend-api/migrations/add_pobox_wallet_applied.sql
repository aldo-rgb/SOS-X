-- Soporte de pago parcial con saldo a favor (wallet) para pobox_payments
ALTER TABLE pobox_payments
  ADD COLUMN IF NOT EXISTS wallet_applied NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_applied_at TIMESTAMP;
