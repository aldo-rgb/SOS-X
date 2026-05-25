-- Agrega columna de guía secundaria a dhl_shipments
-- Usada para guardar el segundo código de barras escaneado durante la recepción
ALTER TABLE dhl_shipments
  ADD COLUMN IF NOT EXISTS secondary_tracking VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_dhl_shipments_secondary_tracking
  ON dhl_shipments (secondary_tracking)
  WHERE secondary_tracking IS NOT NULL;
