-- Sincronización de proveedores ENTANGLED desde el API externo
-- Agrega campos para identificar el proveedor remoto y guardar sus tarifas.

ALTER TABLE entangled_providers
  ADD COLUMN IF NOT EXISTS external_id VARCHAR(64) UNIQUE,
  ADD COLUMN IF NOT EXISTS descripcion TEXT,
  ADD COLUMN IF NOT EXISTS tarifas JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITHOUT TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_entangled_providers_external_id
  ON entangled_providers(external_id);
