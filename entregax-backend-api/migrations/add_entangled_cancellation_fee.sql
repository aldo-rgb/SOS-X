-- ==========================================================================
-- ENTANGLED — Comisión por cancelación configurable por proveedor
-- ==========================================================================

ALTER TABLE entangled_providers
  ADD COLUMN IF NOT EXISTS cancellation_fee_usd NUMERIC(10,2) NOT NULL DEFAULT 1;
