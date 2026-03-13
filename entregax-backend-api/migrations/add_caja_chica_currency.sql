-- ============================================
-- MIGRACIÓN: Soporte Multi-Moneda Caja PO Box
-- Agrega columna currency a transacciones y cortes
-- ============================================

-- Agregar columna currency a transacciones
ALTER TABLE caja_chica_transacciones 
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';

-- Agregar columna tipo_cambio para registro histórico
ALTER TABLE caja_chica_transacciones 
ADD COLUMN IF NOT EXISTS tipo_cambio DECIMAL(10,4) DEFAULT NULL;

-- Agregar columna currency a cortes
ALTER TABLE caja_chica_cortes 
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';

-- Actualizar transacciones existentes
-- Si el concepto contiene 'PO Box' o 'Pick Up', es USD
-- De lo contrario, asumimos MXN
UPDATE caja_chica_transacciones 
SET currency = 'USD' 
WHERE currency IS NULL 
  AND (concepto ILIKE '%PO Box%' OR concepto ILIKE '%Pick Up%' OR concepto ILIKE '%USD%');

UPDATE caja_chica_transacciones 
SET currency = 'MXN' 
WHERE currency IS NULL;

-- Crear índice para búsquedas por moneda
CREATE INDEX IF NOT EXISTS idx_caja_chica_transacciones_currency 
ON caja_chica_transacciones(currency);

-- Crear índice para cortes por moneda
CREATE INDEX IF NOT EXISTS idx_caja_chica_cortes_currency 
ON caja_chica_cortes(currency);

-- Verificar cambios
SELECT 'Transacciones por moneda:' as info;
SELECT currency, COUNT(*) as cantidad, SUM(monto) as total
FROM caja_chica_transacciones
GROUP BY currency;
