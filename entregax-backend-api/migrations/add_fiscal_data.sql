-- ============================================
-- MIGRACIÓN: Datos Fiscales para Facturación CFDI 4.0
-- Fecha: 2026-03-12
-- ============================================

-- 1. Agregar campos fiscales a la tabla users
ALTER TABLE users
ADD COLUMN IF NOT EXISTS fiscal_razon_social VARCHAR(300),
ADD COLUMN IF NOT EXISTS fiscal_rfc VARCHAR(13),
ADD COLUMN IF NOT EXISTS fiscal_codigo_postal VARCHAR(5),
ADD COLUMN IF NOT EXISTS fiscal_regimen_fiscal VARCHAR(3),
ADD COLUMN IF NOT EXISTS fiscal_uso_cfdi VARCHAR(4);

-- Comentarios descriptivos
COMMENT ON COLUMN users.fiscal_razon_social IS 'Razón social o nombre para facturación (sin SA de CV)';
COMMENT ON COLUMN users.fiscal_rfc IS 'RFC del contribuyente';
COMMENT ON COLUMN users.fiscal_codigo_postal IS 'Código postal fiscal';
COMMENT ON COLUMN users.fiscal_regimen_fiscal IS 'Clave del régimen fiscal SAT';
COMMENT ON COLUMN users.fiscal_uso_cfdi IS 'Uso CFDI (G01, G03, etc.)';

-- 2. Agregar campos de facturación a pagos
ALTER TABLE openpay_webhook_logs
ADD COLUMN IF NOT EXISTS requiere_factura BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS facturada BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS factura_uuid VARCHAR(50),
ADD COLUMN IF NOT EXISTS factura_created_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS factura_error TEXT;

-- 3. Agregar campos de facturación a pobox_payments
ALTER TABLE pobox_payments
ADD COLUMN IF NOT EXISTS requiere_factura BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS facturada BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS factura_uuid VARCHAR(50),
ADD COLUMN IF NOT EXISTS factura_created_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS factura_error TEXT;

-- 4. Crear tabla para log de facturas emitidas
-- NOTA: La configuración de Facturapi está en fiscal_emitters (campo api_key)
-- junto con la relación service_company_config para multi-empresa
CREATE TABLE IF NOT EXISTS facturas_emitidas (
    id SERIAL PRIMARY KEY,
    facturapi_id VARCHAR(50) UNIQUE,
    uuid_sat VARCHAR(50) UNIQUE,
    user_id INTEGER REFERENCES users(id),
    payment_id VARCHAR(100), -- ID del pago (openpay o pobox_payment)
    payment_type VARCHAR(20), -- 'openpay', 'pobox', 'paypal'
    
    -- Datos del receptor
    receptor_rfc VARCHAR(13),
    receptor_razon_social VARCHAR(300),
    receptor_codigo_postal VARCHAR(5),
    receptor_regimen_fiscal VARCHAR(3),
    receptor_uso_cfdi VARCHAR(4),
    
    -- Datos de la factura
    subtotal DECIMAL(12, 2),
    total DECIMAL(12, 2),
    currency VARCHAR(3) DEFAULT 'MXN',
    payment_form VARCHAR(2), -- '03' transferencia, '04' tarjeta, '28' débito
    folio VARCHAR(50),
    serie VARCHAR(10),
    
    -- Archivos
    pdf_url TEXT,
    xml_url TEXT,
    
    -- Estados
    status VARCHAR(20) DEFAULT 'valid', -- 'valid', 'canceled'
    canceled_at TIMESTAMP,
    cancellation_reason TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_facturas_user_id ON facturas_emitidas(user_id);
CREATE INDEX IF NOT EXISTS idx_facturas_payment_id ON facturas_emitidas(payment_id);
CREATE INDEX IF NOT EXISTS idx_facturas_uuid ON facturas_emitidas(uuid_sat);
CREATE INDEX IF NOT EXISTS idx_users_fiscal_rfc ON users(fiscal_rfc) WHERE fiscal_rfc IS NOT NULL;

-- 5. Catálogo de regímenes fiscales SAT
CREATE TABLE IF NOT EXISTS sat_regimen_fiscal (
    clave VARCHAR(3) PRIMARY KEY,
    descripcion VARCHAR(200) NOT NULL,
    persona_fisica BOOLEAN DEFAULT TRUE,
    persona_moral BOOLEAN DEFAULT TRUE
);

-- Insertar regímenes fiscales más comunes
INSERT INTO sat_regimen_fiscal (clave, descripcion, persona_fisica, persona_moral) VALUES
('601', 'General de Ley Personas Morales', FALSE, TRUE),
('603', 'Personas Morales con Fines no Lucrativos', FALSE, TRUE),
('605', 'Sueldos y Salarios e Ingresos Asimilados a Salarios', TRUE, FALSE),
('606', 'Arrendamiento', TRUE, FALSE),
('607', 'Régimen de Enajenación o Adquisición de Bienes', TRUE, FALSE),
('608', 'Demás ingresos', TRUE, FALSE),
('610', 'Residentes en el Extranjero sin Establecimiento Permanente en México', TRUE, TRUE),
('611', 'Ingresos por Dividendos (socios y accionistas)', TRUE, FALSE),
('612', 'Personas Físicas con Actividades Empresariales y Profesionales', TRUE, FALSE),
('614', 'Ingresos por intereses', TRUE, FALSE),
('615', 'Régimen de los ingresos por obtención de premios', TRUE, FALSE),
('616', 'Sin obligaciones fiscales', TRUE, FALSE),
('620', 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos', FALSE, TRUE),
('621', 'Incorporación Fiscal', TRUE, FALSE),
('622', 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras', TRUE, TRUE),
('623', 'Opcional para Grupos de Sociedades', FALSE, TRUE),
('624', 'Coordinados', FALSE, TRUE),
('625', 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', TRUE, FALSE),
('626', 'Régimen Simplificado de Confianza', TRUE, TRUE)
ON CONFLICT (clave) DO NOTHING;

-- 6. Catálogo de usos CFDI
CREATE TABLE IF NOT EXISTS sat_uso_cfdi (
    clave VARCHAR(4) PRIMARY KEY,
    descripcion VARCHAR(200) NOT NULL,
    persona_fisica BOOLEAN DEFAULT TRUE,
    persona_moral BOOLEAN DEFAULT TRUE
);

INSERT INTO sat_uso_cfdi (clave, descripcion, persona_fisica, persona_moral) VALUES
('G01', 'Adquisición de mercancías', TRUE, TRUE),
('G02', 'Devoluciones, descuentos o bonificaciones', TRUE, TRUE),
('G03', 'Gastos en general', TRUE, TRUE),
('I01', 'Construcciones', TRUE, TRUE),
('I02', 'Mobiliario y equipo de oficina por inversiones', TRUE, TRUE),
('I03', 'Equipo de transporte', TRUE, TRUE),
('I04', 'Equipo de cómputo y accesorios', TRUE, TRUE),
('I05', 'Dados, troqueles, moldes, matrices y herramental', TRUE, TRUE),
('I06', 'Comunicaciones telefónicas', TRUE, TRUE),
('I07', 'Comunicaciones satelitales', TRUE, TRUE),
('I08', 'Otra maquinaria y equipo', TRUE, TRUE),
('D01', 'Honorarios médicos, dentales y gastos hospitalarios', TRUE, FALSE),
('D02', 'Gastos médicos por incapacidad o discapacidad', TRUE, FALSE),
('D03', 'Gastos funerales', TRUE, FALSE),
('D04', 'Donativos', TRUE, FALSE),
('D05', 'Intereses reales efectivamente pagados por créditos hipotecarios', TRUE, FALSE),
('D06', 'Aportaciones voluntarias al SAR', TRUE, FALSE),
('D07', 'Primas por seguros de gastos médicos', TRUE, FALSE),
('D08', 'Gastos de transportación escolar obligatoria', TRUE, FALSE),
('D09', 'Depósitos en cuentas para el ahorro, primas de pensiones', TRUE, FALSE),
('D10', 'Pagos por servicios educativos (colegiaturas)', TRUE, FALSE),
('P01', 'Por definir', TRUE, TRUE),
('S01', 'Sin efectos fiscales', TRUE, TRUE),
('CP01', 'Pagos', TRUE, TRUE),
('CN01', 'Nómina', TRUE, FALSE)
ON CONFLICT (clave) DO NOTHING;

-- Mensaje de confirmación
DO $$
BEGIN
    RAISE NOTICE '✅ Migración de datos fiscales completada exitosamente';
END $$;
