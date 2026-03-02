-- Migración: Crear tabla para logs de callbacks de China
-- Fecha: 28 de febrero de 2026
-- Propósito: Diagnóstico de callbacks de MoJie

-- Tabla para guardar logs de callbacks recibidos de MoJie
CREATE TABLE IF NOT EXISTS china_callback_logs (
    id SERIAL PRIMARY KEY,
    raw_body TEXT,
    content_type VARCHAR(100),
    status VARCHAR(20) DEFAULT 'received', -- received, processed, error
    error_message TEXT,
    fno VARCHAR(100),
    shipping_mark VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para búsqueda por fecha
CREATE INDEX IF NOT EXISTS idx_china_callback_logs_created 
ON china_callback_logs(created_at DESC);

-- Índice para búsqueda por FNO
CREATE INDEX IF NOT EXISTS idx_china_callback_logs_fno 
ON china_callback_logs(fno);

-- Limpiar logs viejos (mantener solo últimos 30 días)
-- Ejecutar manualmente o agregar a cron
-- DELETE FROM china_callback_logs WHERE created_at < NOW() - INTERVAL '30 days';

COMMENT ON TABLE china_callback_logs IS 'Logs de callbacks recibidos de MoJie para diagnóstico';
