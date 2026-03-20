-- ============================================
-- TABLA: air_cost_brackets
-- Tarifas de costo por proveedor (lo que nos cobran)
-- Escalonado por peso: a más kilos, menor costo/kg
-- AMAZON = Genérico (G), MARCA = Logo (L)
-- ============================================

CREATE TABLE IF NOT EXISTS air_cost_brackets (
    id SERIAL PRIMARY KEY,
    route_id INTEGER NOT NULL REFERENCES air_routes(id) ON DELETE CASCADE,
    tariff_type VARCHAR(1) NOT NULL CHECK (tariff_type IN ('L', 'G', 'S', 'F')),
    min_kg NUMERIC(10,2) NOT NULL,
    cost_per_kg NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(route_id, tariff_type, min_kg)
);

-- Índice para consultas rápidas por ruta
CREATE INDEX IF NOT EXISTS idx_air_cost_brackets_route ON air_cost_brackets(route_id);

-- Comentario
COMMENT ON TABLE air_cost_brackets IS 'Tarifas de costo escalonadas por peso para rutas aéreas (lo que cobra el proveedor)';
COMMENT ON COLUMN air_cost_brackets.tariff_type IS 'Tipo: L=Logo/Marca, G=Genérico/Amazon, S=Sensible, F=Flat';
COMMENT ON COLUMN air_cost_brackets.min_kg IS 'Peso mínimo del bracket (ej: 500, 1000, 1500...)';
COMMENT ON COLUMN air_cost_brackets.cost_per_kg IS 'Costo por KG en USD para este bracket';
