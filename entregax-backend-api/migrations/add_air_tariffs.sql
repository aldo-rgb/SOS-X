-- ============================================
-- MIGRACIÓN: Tarifas Aéreas por Ruta
-- 4 tipos: Logo (L), Genérico (G), Sensible (S), Flat (F)
-- ============================================

CREATE TABLE IF NOT EXISTS air_tariffs (
    id SERIAL PRIMARY KEY,
    route_id INTEGER NOT NULL REFERENCES air_routes(id) ON DELETE CASCADE,
    tariff_type VARCHAR(1) NOT NULL CHECK (tariff_type IN ('L', 'G', 'S', 'F')),
    price_per_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(route_id, tariff_type)
);

CREATE INDEX IF NOT EXISTS idx_air_tariffs_route ON air_tariffs(route_id);
CREATE INDEX IF NOT EXISTS idx_air_tariffs_type ON air_tariffs(tariff_type);
