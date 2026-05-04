-- Add referencia_pago column to entangled_payment_requests
-- Format: XP + 6 random digits, unique per row, generated at INSERT time

ALTER TABLE entangled_payment_requests
  ADD COLUMN IF NOT EXISTS referencia_pago VARCHAR(8) UNIQUE;

-- Backfill existing rows with XP + 6 random digits (unique per row)
UPDATE entangled_payment_requests
SET referencia_pago = 'XP' || LPAD(FLOOR(100000 + random() * 899999)::int::text, 6, '0')
WHERE referencia_pago IS NULL;

-- Create index for fast lookup during conciliation
CREATE INDEX IF NOT EXISTS idx_entangled_payment_referencia
  ON entangled_payment_requests (referencia_pago);
