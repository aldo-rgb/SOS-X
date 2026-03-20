-- ============================================
-- TARIFAS AÉREAS PERSONALIZADAS POR CLIENTE
-- Permite configurar precios especiales por cliente
-- ============================================

-- Tabla de tarifas personalizadas por cliente
CREATE TABLE IF NOT EXISTS air_client_tariffs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    legacy_client_id INTEGER REFERENCES legacy_clients(id) ON DELETE CASCADE,
    route_id INTEGER REFERENCES air_routes(id) ON DELETE CASCADE,
    tariff_type VARCHAR(10) NOT NULL CHECK (tariff_type IN ('L', 'G', 'S', 'F')),
    price_per_kg DECIMAL(10, 2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    -- Un cliente solo puede tener una tarifa por ruta y tipo
    CONSTRAINT unique_client_route_tariff UNIQUE (user_id, route_id, tariff_type),
    CONSTRAINT unique_legacy_client_route_tariff UNIQUE (legacy_client_id, route_id, tariff_type),
    -- Al menos uno de user_id o legacy_client_id debe existir
    CONSTRAINT client_required CHECK (user_id IS NOT NULL OR legacy_client_id IS NOT NULL)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_air_client_tariffs_user ON air_client_tariffs(user_id);
CREATE INDEX IF NOT EXISTS idx_air_client_tariffs_legacy ON air_client_tariffs(legacy_client_id);
CREATE INDEX IF NOT EXISTS idx_air_client_tariffs_route ON air_client_tariffs(route_id);

-- Comentarios
COMMENT ON TABLE air_client_tariffs IS 'Tarifas aéreas personalizadas por cliente';
COMMENT ON COLUMN air_client_tariffs.tariff_type IS 'Tipo de tarifa: L=Logo, G=Genérico, S=Sensible, F=Flat';
COMMENT ON COLUMN air_client_tariffs.price_per_kg IS 'Precio por KG en USD';
