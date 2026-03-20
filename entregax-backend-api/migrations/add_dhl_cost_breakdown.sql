-- ============================================
-- MIGRACIÓN: Desglose de Costos DHL
-- Fecha: 19 de marzo de 2026
-- Propósito: Agregar desglose por categorías (agencia, liberación, otros)
-- ============================================

-- Agregar columnas de desglose de costo
ALTER TABLE dhl_cost_rates ADD COLUMN IF NOT EXISTS costo_agencia DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE dhl_cost_rates ADD COLUMN IF NOT EXISTS costo_liberacion DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE dhl_cost_rates ADD COLUMN IF NOT EXISTS costo_otros DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Migrar los datos existentes: el cost_usd actual pasa a costo_agencia
UPDATE dhl_cost_rates 
SET costo_agencia = cost_usd 
WHERE cost_usd > 0 AND costo_agencia = 0;

COMMENT ON COLUMN dhl_cost_rates.costo_agencia IS 'Costo de agencia aduanal';
COMMENT ON COLUMN dhl_cost_rates.costo_liberacion IS 'Costo de liberación del paquete';
COMMENT ON COLUMN dhl_cost_rates.costo_otros IS 'Otros costos adicionales';

SELECT 'Migración de desglose de costos DHL completada' as resultado;
