-- ============================================
-- MIGRACIÓN: Agregar columnas referencia y evidencia a caja_chica_transacciones
-- Fecha: 2026-03-10
-- ============================================

-- Agregar columna referencia (número de factura/recibo)
ALTER TABLE caja_chica_transacciones 
ADD COLUMN IF NOT EXISTS referencia VARCHAR(100);

-- Agregar columna evidencia_url (URL de la foto del ticket/factura)
ALTER TABLE caja_chica_transacciones 
ADD COLUMN IF NOT EXISTS evidencia_url TEXT;

-- Índice para búsqueda por referencia
CREATE INDEX IF NOT EXISTS idx_caja_chica_referencia 
ON caja_chica_transacciones(referencia) 
WHERE referencia IS NOT NULL;

-- Comentarios
COMMENT ON COLUMN caja_chica_transacciones.referencia IS 'Número de factura o recibo para egresos';
COMMENT ON COLUMN caja_chica_transacciones.evidencia_url IS 'URL de la foto del ticket o factura como evidencia';

-- Mensaje de confirmación
DO $$ BEGIN RAISE NOTICE 'Migración completada: columnas referencia y evidencia_url agregadas a caja_chica_transacciones'; END $$;
