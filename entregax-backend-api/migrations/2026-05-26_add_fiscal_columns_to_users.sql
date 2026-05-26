-- Agregar columnas fiscales a la tabla users para pre-llenar facturas
-- Estas columnas almacenan los datos fiscales del cliente cuando solicita factura

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS fiscal_rfc VARCHAR(13),
ADD COLUMN IF NOT EXISTS fiscal_razon_social VARCHAR(255),
ADD COLUMN IF NOT EXISTS fiscal_regimen_fiscal VARCHAR(10),
ADD COLUMN IF NOT EXISTS fiscal_codigo_postal VARCHAR(10),
ADD COLUMN IF NOT EXISTS fiscal_uso_cfdi VARCHAR(10);

-- Índice para búsquedas por RFC
CREATE INDEX IF NOT EXISTS idx_users_fiscal_rfc ON users(fiscal_rfc);

COMMENT ON COLUMN users.fiscal_rfc IS 'RFC del cliente para facturación (formato: XAXX010101000)';
COMMENT ON COLUMN users.fiscal_razon_social IS 'Razón social del cliente para facturación';
COMMENT ON COLUMN users.fiscal_regimen_fiscal IS 'Régimen fiscal del cliente (601=General de Ley, 616=Sin obligaciones)';
COMMENT ON COLUMN users.fiscal_codigo_postal IS 'Código postal del domicilio fiscal';
COMMENT ON COLUMN users.fiscal_uso_cfdi IS 'Uso de CFDI (G03=Gastos en general, S01=Sin efectos fiscales)';
