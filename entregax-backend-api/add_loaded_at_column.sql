-- Migración: Agregar columna loaded_at para tracking de carga en unidad
-- Ejecutar: psql -h localhost -d [tu_db] -f add_loaded_at_column.sql

-- Columna para registrar el momento exacto en que el chofer carga el paquete a su unidad
ALTER TABLE packages ADD COLUMN IF NOT EXISTS loaded_at TIMESTAMP;

-- Índice para consultas de paquetes cargados por fecha
CREATE INDEX IF NOT EXISTS idx_packages_loaded_at ON packages(loaded_at) WHERE loaded_at IS NOT NULL;

-- Comentario descriptivo
COMMENT ON COLUMN packages.loaded_at IS 'Timestamp de cuando el chofer escaneó y cargó el paquete en su unidad';
