-- ============================================
-- MIGRACIÓN: Sistema de Fallback y Monitoreo de Tipo de Cambio
-- Asegura que siempre haya un tipo de cambio disponible
-- ============================================

-- Agregar columnas para el sistema de fallback
ALTER TABLE exchange_rate_config
ADD COLUMN IF NOT EXISTS ultimo_tc_api DECIMAL(10,4) DEFAULT 17.50,
ADD COLUMN IF NOT EXISTS ultima_conexion_api TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS api_activa BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS horas_sin_api INTEGER DEFAULT 0;

-- Crear tabla para alertas de tipo de cambio
CREATE TABLE IF NOT EXISTS exchange_rate_alerts (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(50) NOT NULL, -- 'api_desconectada', 'alerta_12h', 'reconexion'
    mensaje TEXT NOT NULL,
    servicio VARCHAR(50),
    horas_desconectado INTEGER DEFAULT 0,
    notificado_admin BOOLEAN DEFAULT FALSE,
    notificado_director BOOLEAN DEFAULT FALSE,
    resuelto BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- Crear tabla global para el estado del sistema de tipo de cambio
CREATE TABLE IF NOT EXISTS exchange_rate_system_status (
    id SERIAL PRIMARY KEY,
    ultimo_tc_global DECIMAL(10,4) NOT NULL DEFAULT 17.50,
    ultima_actualizacion_exitosa TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultima_fuente VARCHAR(50) DEFAULT 'default', -- 'banxico', 'exchangerate-api', 'fallback', 'manual'
    intentos_fallidos_consecutivos INTEGER DEFAULT 0,
    api_banxico_activa BOOLEAN DEFAULT TRUE,
    api_fallback_activa BOOLEAN DEFAULT TRUE,
    alerta_activa BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar registro inicial si no existe
INSERT INTO exchange_rate_system_status (ultimo_tc_global, ultima_fuente)
SELECT 17.50, 'default'
WHERE NOT EXISTS (SELECT 1 FROM exchange_rate_system_status);

-- Actualizar registros existentes con valores por defecto
UPDATE exchange_rate_config 
SET ultimo_tc_api = COALESCE(tipo_cambio_final, 17.50),
    ultima_conexion_api = COALESCE(ultima_actualizacion, CURRENT_TIMESTAMP),
    api_activa = TRUE,
    horas_sin_api = 0
WHERE ultimo_tc_api IS NULL;

-- Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_exchange_alerts_tipo ON exchange_rate_alerts(tipo);
CREATE INDEX IF NOT EXISTS idx_exchange_alerts_resuelto ON exchange_rate_alerts(resuelto);
CREATE INDEX IF NOT EXISTS idx_exchange_alerts_created ON exchange_rate_alerts(created_at);

COMMENT ON COLUMN exchange_rate_config.ultimo_tc_api IS 'Último tipo de cambio exitoso de API para fallback';
COMMENT ON COLUMN exchange_rate_config.ultima_conexion_api IS 'Última vez que se conectó exitosamente a API';
COMMENT ON COLUMN exchange_rate_config.api_activa IS 'Si la API está respondiendo correctamente';
COMMENT ON COLUMN exchange_rate_config.horas_sin_api IS 'Horas transcurridas sin conexión a API';
