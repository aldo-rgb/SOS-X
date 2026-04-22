-- =====================================================================
-- Migración: Recepción de Consolidaciones en MTY (PO Box USA)
-- =====================================================================
-- - Agrega columnas para marcar paquetes faltantes en la recepción
-- - Agrega timestamp de recepción en MTY a consolidaciones
-- =====================================================================

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS missing_on_arrival BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS missing_reported_at TIMESTAMP;

ALTER TABLE consolidations
  ADD COLUMN IF NOT EXISTS received_mty_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS received_mty_by INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_packages_missing_on_arrival
  ON packages(missing_on_arrival)
  WHERE missing_on_arrival = TRUE;

CREATE INDEX IF NOT EXISTS idx_consolidations_status
  ON consolidations(status);
