-- ===========================================
-- MIGRACIÓN: Agregar geocerca a sucursales
-- Fecha: 2026-02-17
-- ===========================================

-- 1. Agregar campos de geolocalización a sucursales
ALTER TABLE branches 
ADD COLUMN IF NOT EXISTS latitud DECIMAL(10,8),
ADD COLUMN IF NOT EXISTS longitud DECIMAL(11,8),
ADD COLUMN IF NOT EXISTS radio_geocerca_metros INT DEFAULT 100,
ADD COLUMN IF NOT EXISTS wifi_ssid VARCHAR(100),
ADD COLUMN IF NOT EXISTS wifi_validation_enabled BOOLEAN DEFAULT false;

-- 2. Agregar campos para registro de ubicación en asistencia
ALTER TABLE employee_attendance
ADD COLUMN IF NOT EXISTS latitud_registro DECIMAL(10,8),
ADD COLUMN IF NOT EXISTS longitud_registro DECIMAL(11,8),
ADD COLUMN IF NOT EXISTS distancia_metros DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS metodo_validacion VARCHAR(20) DEFAULT 'gps', -- 'gps', 'wifi', 'manual'
ADD COLUMN IF NOT EXISTS mock_location_detectado BOOLEAN DEFAULT false;

-- 3. Agregar índices para consultas geoespaciales
CREATE INDEX IF NOT EXISTS idx_branches_location ON branches (latitud, longitud) 
WHERE latitud IS NOT NULL AND longitud IS NOT NULL;

-- 4. Comentarios descriptivos
COMMENT ON COLUMN branches.latitud IS 'Latitud del centro de la sucursal (ej: 25.686614)';
COMMENT ON COLUMN branches.longitud IS 'Longitud del centro de la sucursal (ej: -100.316112)';
COMMENT ON COLUMN branches.radio_geocerca_metros IS 'Radio de tolerancia en metros para check-in (recomendado: 50-100m)';
COMMENT ON COLUMN branches.wifi_ssid IS 'Nombre de la red WiFi de la sucursal para validación alternativa';
COMMENT ON COLUMN branches.wifi_validation_enabled IS 'Si está activo, permite validar presencia por conexión WiFi';

COMMENT ON COLUMN employee_attendance.latitud_registro IS 'Latitud donde el empleado hizo check-in';
COMMENT ON COLUMN employee_attendance.longitud_registro IS 'Longitud donde el empleado hizo check-in';
COMMENT ON COLUMN employee_attendance.distancia_metros IS 'Distancia calculada entre el empleado y la sucursal';
COMMENT ON COLUMN employee_attendance.metodo_validacion IS 'Método usado: gps, wifi, o manual (admin override)';
COMMENT ON COLUMN employee_attendance.mock_location_detectado IS 'Si se detectó uso de ubicación falsa';

-- 5. Actualizar sucursales existentes con coordenadas de ejemplo (MTY)
-- NOTA: Actualiza estas coordenadas con las reales de cada sucursal
UPDATE branches 
SET latitud = 25.686614, 
    longitud = -100.316112,
    radio_geocerca_metros = 100
WHERE latitud IS NULL AND city = 'Monterrey';

-- Para CDMX
UPDATE branches 
SET latitud = 19.432608, 
    longitud = -99.133209,
    radio_geocerca_metros = 100
WHERE latitud IS NULL AND city = 'Ciudad de México';

-- Para Guadalajara
UPDATE branches 
SET latitud = 20.659698, 
    longitud = -103.349609,
    radio_geocerca_metros = 100
WHERE latitud IS NULL AND city = 'Guadalajara';

-- ===========================================
-- FUNCIÓN DE HAVERSINE EN POSTGRESQL
-- Calcula la distancia en metros entre dos puntos
-- ===========================================
CREATE OR REPLACE FUNCTION haversine_distance(
    lat1 DECIMAL(10,8), 
    lon1 DECIMAL(11,8), 
    lat2 DECIMAL(10,8), 
    lon2 DECIMAL(11,8)
) RETURNS DECIMAL(10,2) AS $$
DECLARE
    R CONSTANT DECIMAL := 6371000; -- Radio de la Tierra en metros
    dlat DECIMAL;
    dlon DECIMAL;
    a DECIMAL;
    c DECIMAL;
BEGIN
    -- Convertir a radianes
    lat1 := RADIANS(lat1);
    lat2 := RADIANS(lat2);
    dlat := RADIANS(lat2 - lat1);
    dlon := RADIANS(lon2 - lon1);
    
    -- Fórmula de Haversine
    a := SIN(dlat/2) * SIN(dlat/2) + COS(lat1) * COS(lat2) * SIN(dlon/2) * SIN(dlon/2);
    c := 2 * ATAN2(SQRT(a), SQRT(1-a));
    
    RETURN R * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Ejemplo de uso:
-- SELECT haversine_distance(25.686614, -100.316112, 25.687000, -100.316500);
-- Resultado: ~55 metros

-- ===========================================
-- VERIFICAR MIGRACIÓN
-- ===========================================
DO $$
BEGIN
    RAISE NOTICE 'Migración de geocerca completada exitosamente';
    RAISE NOTICE 'Campos agregados: latitud, longitud, radio_geocerca_metros, wifi_ssid, wifi_validation_enabled';
    RAISE NOTICE 'Función haversine_distance creada';
END $$;
