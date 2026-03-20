-- Agregar columnas de precio de venta aéreo a packages
-- Estos campos guardan el precio asignado al momento de aprobar el AWB

-- Precio por kg al momento del registro
ALTER TABLE packages ADD COLUMN IF NOT EXISTS air_price_per_kg NUMERIC(10,2);

-- Tipo de tarifa aplicada (L=Logo, G=Generico, S=Sensible, F=Flete)
ALTER TABLE packages ADD COLUMN IF NOT EXISTS air_tariff_type VARCHAR(1);

-- Precio total de venta (peso * precio_por_kg)
ALTER TABLE packages ADD COLUMN IF NOT EXISTS air_sale_price NUMERIC(12,2);

-- ID de la ruta aérea usada
ALTER TABLE packages ADD COLUMN IF NOT EXISTS air_route_id INTEGER REFERENCES air_routes(id);

-- Si el precio viene de tarifa personalizada del cliente
ALTER TABLE packages ADD COLUMN IF NOT EXISTS air_is_custom_tariff BOOLEAN DEFAULT FALSE;

-- Cuándo se asignó el precio
ALTER TABLE packages ADD COLUMN IF NOT EXISTS air_price_assigned_at TIMESTAMP;

-- Quién asignó el precio
ALTER TABLE packages ADD COLUMN IF NOT EXISTS air_price_assigned_by INTEGER;

-- Comentarios
COMMENT ON COLUMN packages.air_price_per_kg IS 'Precio por kg al momento del registro';
COMMENT ON COLUMN packages.air_tariff_type IS 'Tipo de tarifa: L=Logo, G=Generico, S=Sensible, F=Flete';
COMMENT ON COLUMN packages.air_sale_price IS 'Precio total de venta (peso * precio_por_kg)';
COMMENT ON COLUMN packages.air_route_id IS 'Ruta aérea usada para calcular el precio';
COMMENT ON COLUMN packages.air_is_custom_tariff IS 'Si el precio viene de tarifa personalizada del cliente';
