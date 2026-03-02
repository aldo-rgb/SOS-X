-- Migración: Agregar columna source a container_tracking_logs
-- Esto permite identificar de dónde vino cada evento de tracking

-- Agregar columna source si no existe
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'container_tracking_logs' 
        AND column_name = 'source'
    ) THEN
        ALTER TABLE container_tracking_logs ADD COLUMN source VARCHAR(50) DEFAULT 'manual';
        COMMENT ON COLUMN container_tracking_logs.source IS 'Fuente del evento: tradlinx, carrier, manual, webhook';
    END IF;
END $$;

-- Actualizar eventos existentes según su tipo
UPDATE container_tracking_logs 
SET source = 'manual' 
WHERE source IS NULL AND is_manual = true;

UPDATE container_tracking_logs 
SET source = 'carrier' 
WHERE source IS NULL AND is_manual = false;

-- Índice para filtrar por fuente
CREATE INDEX IF NOT EXISTS idx_container_tracking_logs_source 
ON container_tracking_logs(source);

COMMIT;
