-- ============================================================================
-- ENTANGLED — Comisiones desglosadas por asesor y EntregaX
-- ============================================================================
-- Agrega campos de comisión configurables al proveedor y registros de desglose
-- en cada solicitud: XOX (costo API), EntregaX (margen), Asesor y Override.
-- ============================================================================

-- Porcentajes configurables en el proveedor
ALTER TABLE entangled_providers
  ADD COLUMN IF NOT EXISTS asesor_pct           NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS over_pct             NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS over_split_asesor    NUMERIC(5,2) NOT NULL DEFAULT 90;
  -- over_split_asesor: % del override que va al asesor (el resto va a EntregaX)

-- Desglose de comisiones en cada solicitud
ALTER TABLE entangled_payment_requests
  ADD COLUMN IF NOT EXISTS comision_entregax      NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comision_over_asesor   NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comision_over_entregax NUMERIC(14,2) NOT NULL DEFAULT 0;
