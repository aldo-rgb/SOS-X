-- ============================================
-- MIGRACIÓN: Agregar Costo de Operación
-- Fecha: 30 de abril de 2026
-- Propósito: Agregar costo fijo por operación en USD a proveedores ENTANGLED
-- ============================================

-- Agregar columna de costo fijo por operación al proveedor
ALTER TABLE entangled_providers 
  ADD COLUMN IF NOT EXISTS costo_operacion_usd NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Agregar columna de override del costo de operación
ALTER TABLE entangled_providers 
  ADD COLUMN IF NOT EXISTS override_costo_operacion_usd NUMERIC(10,2);

-- Crear índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_entangled_providers_costo_operacion 
  ON entangled_providers(is_active, costo_operacion_usd);

-- Comentarios para documentación
COMMENT ON COLUMN entangled_providers.costo_operacion_usd IS 'Costo fijo por operación en USD que se cobra en cada transacción';
COMMENT ON COLUMN entangled_providers.override_costo_operacion_usd IS 'Override (incremento) sobre el costo de operación del API';

SELECT 'Migración de costo de operación completada' as resultado;
