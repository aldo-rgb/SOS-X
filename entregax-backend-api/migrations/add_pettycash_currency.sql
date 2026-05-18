-- ============================================================
-- Caja Chica: soporte multimoneda + fondeo con conversión MXN→USD
-- Fecha: 2026-05-18
-- ============================================================
-- Objetivo:
--   - Marcar la moneda nativa de cada wallet (sucursal/chofer).
--   - Registrar conversiones de divisas en fondeos (casa de bolsa).
--   - Mostrador Hidalgo TX se fondea y se gasta en USD.
-- Importante:
--   - balance_mxn / amount_mxn se conservan por compatibilidad, pero
--     representan el monto EN LA MONEDA DEL WALLET (USD para Hidalgo TX).
-- ============================================================

BEGIN;

-- Moneda nativa por wallet (sucursal o chofer)
ALTER TABLE petty_cash_wallets
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'MXN';

-- Metadatos de cada movimiento: moneda, conversión opcional
ALTER TABLE petty_cash_movements
  ADD COLUMN IF NOT EXISTS currency        VARCHAR(3) NOT NULL DEFAULT 'MXN',
  ADD COLUMN IF NOT EXISTS fx_rate         NUMERIC(14,6),   -- MXN por 1 unidad de currency
  ADD COLUMN IF NOT EXISTS source_amount   NUMERIC(14,2),   -- monto egresado en source_currency
  ADD COLUMN IF NOT EXISTS source_currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS fx_provider     TEXT;            -- "casa de bolsa", etc.

-- Mostrador Hidalgo TX (branch_id = 6) opera en USD
UPDATE petty_cash_wallets
   SET currency = 'USD'
 WHERE owner_type = 'branch' AND owner_id = 6;

-- Choferes asignados a Hidalgo TX heredan USD
UPDATE petty_cash_wallets
   SET currency = 'USD'
 WHERE owner_type = 'driver' AND branch_id = 6;

COMMIT;
