-- ============================================
-- MIGRACIÓN: Tarifas PO Box USA y Tipo de Cambio
-- Fecha: 2026-02-18
-- ============================================

-- 1. Tabla de tarifas por volumen (CBM)
CREATE TABLE IF NOT EXISTS pobox_tarifas_volumen (
    id SERIAL PRIMARY KEY,
    nivel INT NOT NULL,
    cbm_min DECIMAL(8,4) NOT NULL,
    cbm_max DECIMAL(8,4) NULL, -- NULL significa "en adelante"
    costo DECIMAL(10,2) NOT NULL,
    tipo_cobro VARCHAR(20) NOT NULL DEFAULT 'fijo', -- 'fijo' o 'por_unidad'
    moneda VARCHAR(3) DEFAULT 'USD',
    estado BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de servicios extra
CREATE TABLE IF NOT EXISTS pobox_tarifas_extras (
    id SERIAL PRIMARY KEY,
    nombre_servicio VARCHAR(100) NOT NULL,
    descripcion TEXT,
    costo DECIMAL(10,2) NOT NULL,
    moneda VARCHAR(3) DEFAULT 'MXN',
    estado BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de configuración de tipo de cambio por servicio
CREATE TABLE IF NOT EXISTS exchange_rate_config (
    id SERIAL PRIMARY KEY,
    servicio VARCHAR(50) NOT NULL UNIQUE, -- 'tdi', 'maritimo', 'pobox_usa', 'dhl_monterrey', 'pago_proveedores'
    nombre_display VARCHAR(100) NOT NULL,
    tipo_cambio_manual DECIMAL(10,4) NULL, -- Si es NULL, usa API
    sobreprecio DECIMAL(10,4) DEFAULT 0, -- Sobreprecio en pesos sobre el tipo de cambio
    sobreprecio_porcentaje DECIMAL(5,2) DEFAULT 0, -- O sobreprecio en porcentaje
    usar_api BOOLEAN DEFAULT TRUE, -- Si usar API de Banxico
    tipo_cambio_final DECIMAL(10,4), -- Calculado: (api o manual) + sobreprecio
    ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Historial de tipos de cambio (para auditoría)
CREATE TABLE IF NOT EXISTS exchange_rate_history (
    id SERIAL PRIMARY KEY,
    servicio VARCHAR(50) NOT NULL,
    tipo_cambio_api DECIMAL(10,4),
    tipo_cambio_manual DECIMAL(10,4),
    sobreprecio DECIMAL(10,4),
    tipo_cambio_final DECIMAL(10,4),
    fuente VARCHAR(50), -- 'banxico', 'manual', 'fixer'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- DATOS INICIALES
-- ============================================

-- Tarifas de volumen PO Box USA
INSERT INTO pobox_tarifas_volumen (nivel, cbm_min, cbm_max, costo, tipo_cobro, moneda) VALUES
(1, 0.0100, 0.0500, 39.00, 'fijo', 'USD'),
(2, 0.0510, 0.0990, 79.00, 'fijo', 'USD'),
(3, 0.1000, NULL, 750.00, 'por_unidad', 'USD')
ON CONFLICT DO NOTHING;

-- Servicios extra PO Box USA
INSERT INTO pobox_tarifas_extras (nombre_servicio, descripcion, costo, moneda) VALUES
('Envío Foráneo', 'Entrega a domicilio fuera de zona metropolitana', 350.00, 'MXN'),
('Paquete Exprés', 'Procesamiento y envío prioritario', 350.00, 'MXN')
ON CONFLICT DO NOTHING;

-- Configuración de tipo de cambio por servicio
INSERT INTO exchange_rate_config (servicio, nombre_display, tipo_cambio_manual, sobreprecio, usar_api) VALUES
('tdi', 'TDI Aéreo China', NULL, 0.50, TRUE),
('maritimo', 'Marítimo', NULL, 0.30, TRUE),
('pobox_usa', 'PO Box USA', NULL, 0.20, TRUE),
('dhl_monterrey', 'DHL Monterrey', NULL, 0, TRUE),
('pago_proveedores', 'Pago a Proveedores', NULL, 0, TRUE)
ON CONFLICT (servicio) DO NOTHING;

-- Índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_pobox_volumen_nivel ON pobox_tarifas_volumen(nivel);
CREATE INDEX IF NOT EXISTS idx_pobox_volumen_estado ON pobox_tarifas_volumen(estado);
CREATE INDEX IF NOT EXISTS idx_pobox_extras_estado ON pobox_tarifas_extras(estado);
CREATE INDEX IF NOT EXISTS idx_exchange_config_servicio ON exchange_rate_config(servicio);
CREATE INDEX IF NOT EXISTS idx_exchange_history_servicio ON exchange_rate_history(servicio);
CREATE INDEX IF NOT EXISTS idx_exchange_history_fecha ON exchange_rate_history(created_at);
