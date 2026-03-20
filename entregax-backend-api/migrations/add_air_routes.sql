-- ============================================
-- MIGRACIÓN: Tabla de Rutas Aéreas
-- Para gestionar rutas de carga aérea China
-- ============================================

CREATE TABLE IF NOT EXISTS air_routes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,           -- Ej: HKG-MEX, PVG-GDL, CAN-MTY
    name VARCHAR(255) NOT NULL,                 -- Nombre descriptivo
    origin_airport VARCHAR(10) NOT NULL,        -- Código IATA origen (HKG, PVG, CAN, SZX)
    origin_city VARCHAR(100) DEFAULT '',        -- Ciudad origen (Hong Kong, Shanghai, Guangzhou)
    destination_airport VARCHAR(10) NOT NULL,   -- Código IATA destino (MEX, GDL, MTY)
    destination_city VARCHAR(100) DEFAULT '',   -- Ciudad destino (CDMX, Guadalajara, Monterrey)
    carrier VARCHAR(100) DEFAULT '',            -- Aerolínea principal (Kalitta Air, Cargolux, etc.)
    flight_prefix VARCHAR(20) DEFAULT '',       -- Prefijo de vuelo (K4, CV, etc.)
    estimated_days INTEGER DEFAULT 5,           -- Días estimados de tránsito
    cost_per_kg_usd DECIMAL(10,2) DEFAULT NULL, -- Costo por KG en USD (tarifa de la ruta)
    email VARCHAR(255),                         -- Email de contacto/proveedor de la ruta
    notes TEXT DEFAULT '',                      -- Notas adicionales
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_air_routes_code ON air_routes(code);
CREATE INDEX IF NOT EXISTS idx_air_routes_active ON air_routes(is_active);
CREATE INDEX IF NOT EXISTS idx_air_routes_origin ON air_routes(origin_airport);
CREATE INDEX IF NOT EXISTS idx_air_routes_destination ON air_routes(destination_airport);

-- Agregar columna route_id a air_reception_drafts (FK opcional)
ALTER TABLE air_reception_drafts ADD COLUMN IF NOT EXISTS route_id INTEGER REFERENCES air_routes(id);
CREATE INDEX IF NOT EXISTS idx_air_drafts_route ON air_reception_drafts(route_id);
