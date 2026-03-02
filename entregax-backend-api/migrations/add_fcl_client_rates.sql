-- ============================================
-- MIGRACIÓN: Sistema de Tarifas FCL por Cliente/Ruta
-- Fecha: 2026-03-02
-- ============================================

-- 1. Agregar columna fcl_price_usd a maritime_routes
-- Permite configurar un precio FCL diferente por ruta
ALTER TABLE maritime_routes 
ADD COLUMN IF NOT EXISTS fcl_price_usd DECIMAL(12, 2) DEFAULT NULL;

COMMENT ON COLUMN maritime_routes.fcl_price_usd IS 'Precio FCL personalizado para esta ruta. Si es NULL, se usa el precio base de FCL 40 Pies';

-- 2. Crear tabla fcl_client_rates para tarifas personalizadas por cliente/ruta
CREATE TABLE IF NOT EXISTS fcl_client_rates (
  id SERIAL PRIMARY KEY,
  legacy_client_id INTEGER NOT NULL REFERENCES legacy_clients(id) ON DELETE CASCADE,
  route_id INTEGER REFERENCES maritime_routes(id) ON DELETE SET NULL,
  custom_price_usd DECIMAL(12, 2),
  is_wholesale BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(legacy_client_id, route_id)
);

COMMENT ON TABLE fcl_client_rates IS 'Tarifas FCL personalizadas por cliente y ruta';
COMMENT ON COLUMN fcl_client_rates.legacy_client_id IS 'Cliente legacy al que aplica la tarifa';
COMMENT ON COLUMN fcl_client_rates.route_id IS 'Ruta específica (NULL = tarifa global para el cliente)';
COMMENT ON COLUMN fcl_client_rates.custom_price_usd IS 'Precio personalizado en USD';
COMMENT ON COLUMN fcl_client_rates.is_wholesale IS 'Si es TRUE, el cliente puede enviar desde 1 CBM al precio de 20.01 CBM';

-- 3. Crear índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_fcl_client_rates_client ON fcl_client_rates(legacy_client_id);
CREATE INDEX IF NOT EXISTS idx_fcl_client_rates_route ON fcl_client_rates(route_id);

-- ============================================
-- LÓGICA DE PRIORIDAD DE PRECIOS FCL:
-- 1. Tarifa cliente + ruta específica
-- 2. Tarifa cliente global (route_id = NULL)
-- 3. Tarifa de la ruta (fcl_price_usd en maritime_routes)
-- 4. Precio base FCL 40 Pies (pricing_tiers)
-- ============================================
