-- Tracking del inicio de monitoreo del contenedor (rol Monitoreo).
-- Cuando un monitorista sube las 2 fotos requeridas (ej. operador + unidad),
-- el contenedor se considera "Cargado" en su tablero.
ALTER TABLE containers ADD COLUMN IF NOT EXISTS monitoring_started_at TIMESTAMP;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS monitoring_started_by INT REFERENCES users(id);
ALTER TABLE containers ADD COLUMN IF NOT EXISTS monitoring_photo_1_url TEXT;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS monitoring_photo_2_url TEXT;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS monitoring_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_containers_monitoring_started_at
  ON containers (monitoring_started_at);
