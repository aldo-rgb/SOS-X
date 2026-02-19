-- ============================================
-- MÓDULO DE CONTROL DE ANTICIPOS A PROVEEDORES
-- Sistema Ledger para gestión de saldos a favor
-- ============================================

-- Tabla 1: Proveedores de Anticipos (Agentes Aduanales, Proveedores de Servicios)
CREATE TABLE IF NOT EXISTS proveedores_anticipos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    referencia VARCHAR(100), -- RFC, código interno, etc.
    tipo VARCHAR(50) DEFAULT 'agente_aduanal', -- agente_aduanal, proveedor_logistica, naviera, otro
    contacto_nombre VARCHAR(255),
    contacto_email VARCHAR(255),
    contacto_telefono VARCHAR(50),
    banco VARCHAR(100),
    cuenta_bancaria VARCHAR(50),
    clabe VARCHAR(20),
    notas TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla 2: Bolsas de Anticipos (Depósitos globales)
CREATE TABLE IF NOT EXISTS bolsas_anticipos (
    id SERIAL PRIMARY KEY,
    proveedor_id INTEGER NOT NULL REFERENCES proveedores_anticipos(id) ON DELETE RESTRICT,
    monto_original DECIMAL(12,2) NOT NULL,
    saldo_disponible DECIMAL(12,2) NOT NULL,
    fecha_pago DATE NOT NULL,
    comprobante_url TEXT, -- URL del PDF/imagen del comprobante
    referencia_pago VARCHAR(255), -- "Anticipo operaciones mayo", "Transferencia SPEI #123456"
    numero_operacion VARCHAR(100), -- Número de operación bancaria
    banco_origen VARCHAR(100),
    estado VARCHAR(20) DEFAULT 'con_saldo' CHECK (estado IN ('con_saldo', 'agotado', 'cancelado')),
    notas TEXT,
    created_by INTEGER, -- ID del usuario que creó (sin FK para evitar conflictos)
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla 3: Asignaciones de Anticipos (Historial de gastos por contenedor)
CREATE TABLE IF NOT EXISTS asignaciones_anticipos (
    id SERIAL PRIMARY KEY,
    bolsa_anticipo_id INTEGER NOT NULL REFERENCES bolsas_anticipos(id) ON DELETE RESTRICT,
    container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE RESTRICT,
    campo_anticipo VARCHAR(20) NOT NULL CHECK (campo_anticipo IN ('advance_1', 'advance_2', 'advance_3', 'advance_4')),
    monto_asignado DECIMAL(12,2) NOT NULL,
    concepto VARCHAR(255), -- Descripción del gasto
    fecha_asignacion TIMESTAMP DEFAULT NOW(),
    usuario_id INTEGER, -- ID del usuario que asignó (sin FK)
    is_active BOOLEAN DEFAULT TRUE, -- FALSE si fue revertido
    revertido_at TIMESTAMP,
    revertido_por INTEGER, -- ID del usuario que revirtió
    notas TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_bolsas_proveedor ON bolsas_anticipos(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_bolsas_estado ON bolsas_anticipos(estado);
CREATE INDEX IF NOT EXISTS idx_asignaciones_bolsa ON asignaciones_anticipos(bolsa_anticipo_id);
CREATE INDEX IF NOT EXISTS idx_asignaciones_container ON asignaciones_anticipos(container_id);
CREATE INDEX IF NOT EXISTS idx_asignaciones_active ON asignaciones_anticipos(is_active);

-- Vista útil para resumen de bolsas con proveedor
CREATE OR REPLACE VIEW vista_bolsas_anticipos AS
SELECT 
    ba.id,
    ba.proveedor_id,
    pa.nombre as proveedor_nombre,
    pa.tipo as proveedor_tipo,
    ba.monto_original,
    ba.saldo_disponible,
    ba.monto_original - ba.saldo_disponible as monto_utilizado,
    ROUND(((ba.monto_original - ba.saldo_disponible) / ba.monto_original) * 100, 2) as porcentaje_utilizado,
    ba.fecha_pago,
    ba.comprobante_url,
    ba.referencia_pago,
    ba.numero_operacion,
    ba.estado,
    ba.created_at,
    (SELECT COUNT(*) FROM asignaciones_anticipos aa WHERE aa.bolsa_anticipo_id = ba.id AND aa.is_active = TRUE) as total_asignaciones
FROM bolsas_anticipos ba
JOIN proveedores_anticipos pa ON pa.id = ba.proveedor_id;

-- Vista para historial de asignaciones con detalles
CREATE OR REPLACE VIEW vista_asignaciones_anticipos AS
SELECT 
    aa.id,
    aa.bolsa_anticipo_id,
    ba.referencia_pago as bolsa_referencia,
    pa.nombre as proveedor_nombre,
    aa.container_id,
    c.container_number,
    aa.campo_anticipo,
    aa.monto_asignado,
    aa.concepto,
    aa.fecha_asignacion,
    u.full_name as asignado_por,
    aa.is_active,
    aa.revertido_at
FROM asignaciones_anticipos aa
JOIN bolsas_anticipos ba ON ba.id = aa.bolsa_anticipo_id
JOIN proveedores_anticipos pa ON pa.id = ba.proveedor_id
JOIN containers c ON c.id = aa.container_id
LEFT JOIN users u ON u.id = aa.usuario_id;

-- Función para actualizar estado de bolsa automáticamente
CREATE OR REPLACE FUNCTION actualizar_estado_bolsa()
RETURNS TRIGGER AS $$
BEGIN
    -- Si el saldo llega a 0, marcar como agotado
    IF NEW.saldo_disponible <= 0 THEN
        NEW.estado := 'agotado';
    ELSIF NEW.saldo_disponible > 0 AND OLD.estado = 'agotado' THEN
        NEW.estado := 'con_saldo';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar estado
DROP TRIGGER IF EXISTS trigger_estado_bolsa ON bolsas_anticipos;
CREATE TRIGGER trigger_estado_bolsa
    BEFORE UPDATE ON bolsas_anticipos
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_estado_bolsa();

-- Insertar algunos proveedores de ejemplo (opcional)
-- INSERT INTO proveedores_anticipos (nombre, referencia, tipo) VALUES 
-- ('Agente Aduanal Manzanillo', 'AA-MZT-001', 'agente_aduanal'),
-- ('Logística Pacific', 'LOG-PAC-001', 'proveedor_logistica');

COMMENT ON TABLE proveedores_anticipos IS 'Catálogo de proveedores/agentes a los que se les depositan anticipos';
COMMENT ON TABLE bolsas_anticipos IS 'Depósitos globales (lump sums) realizados a proveedores';
COMMENT ON TABLE asignaciones_anticipos IS 'Historial de asignaciones de fondos a contenedores específicos';
