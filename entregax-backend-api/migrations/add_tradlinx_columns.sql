-- ============================================
-- MIGRACIÓN: Agregar columnas de Tradlinx a containers
-- Fecha: 2 de marzo de 2026
-- ============================================

-- Columna para reference ID de Tradlinx
ALTER TABLE containers ADD COLUMN IF NOT EXISTS tradlinx_reference_id VARCHAR(100);
ALTER TABLE containers ADD COLUMN IF NOT EXISTS tradlinx_subscribed_at TIMESTAMP;

-- Columnas para tracking foráneo (Gate-Out trigger)
ALTER TABLE containers ADD COLUMN IF NOT EXISTS foreign_tracking_started BOOLEAN DEFAULT false;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS foreign_tracking_start_date TIMESTAMP;

-- Columnas para logística inversa (Empty Return trigger)
ALTER TABLE containers ADD COLUMN IF NOT EXISTS reverse_logistics_closed BOOLEAN DEFAULT false;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS reverse_logistics_close_date TIMESTAMP;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS empty_return_date TIMESTAMP;

-- Índice para búsqueda por tradlinx_reference_id
CREATE INDEX IF NOT EXISTS idx_containers_tradlinx_ref ON containers(tradlinx_reference_id);

-- Verificar columnas existentes de tracking (asegurar que existen)
ALTER TABLE containers ADD COLUMN IF NOT EXISTS last_tracking_event TEXT;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS last_tracking_date TIMESTAMP;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS last_tracking_location TEXT;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS eta TIMESTAMP;

-- ✅ Migración completada
SELECT 'Migración Tradlinx completada' as status;
