-- Migración: Agregar soporte multi-moneda a caja chica
-- Permite separar transacciones en USD y MXN

-- Agregar columna currency a caja_chica_transacciones
ALTER TABLE caja_chica_transacciones 
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'MXN';

-- Agregar columna currency a caja_chica_cortes
ALTER TABLE caja_chica_cortes 
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'MXN';

-- Actualizar transacciones existentes como MXN (asumiendo que todo era en pesos)
UPDATE caja_chica_transacciones 
SET currency = 'MXN' 
WHERE currency IS NULL;

-- Crear índice para búsquedas por moneda
CREATE INDEX IF NOT EXISTS idx_caja_chica_transacciones_currency 
ON caja_chica_transacciones(currency);

CREATE INDEX IF NOT EXISTS idx_caja_chica_cortes_currency 
ON caja_chica_cortes(currency);

-- Comentario de la migración
COMMENT ON COLUMN caja_chica_transacciones.currency IS 'Moneda de la transacción: MXN o USD';
COMMENT ON COLUMN caja_chica_cortes.currency IS 'Moneda del corte: MXN o USD';
