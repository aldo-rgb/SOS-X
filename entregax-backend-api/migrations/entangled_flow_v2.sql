-- ============================================================================
-- ENTANGLED Flow v2: factura opcional, comprobante diferido, cotización con TC
-- ============================================================================

-- Perfil fiscal reutilizable del cliente final
CREATE TABLE IF NOT EXISTS entangled_fiscal_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  rfc VARCHAR(20),
  razon_social VARCHAR(255),
  regimen_fiscal VARCHAR(10),
  cp VARCHAR(10),
  uso_cfdi VARCHAR(10),
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Configuración singleton de pricing ENTANGLED
CREATE TABLE IF NOT EXISTS entangled_pricing_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tipo_cambio_usd NUMERIC(10,4) NOT NULL DEFAULT 18.50,
  tipo_cambio_rmb NUMERIC(10,4) NOT NULL DEFAULT 2.85,
  porcentaje_compra NUMERIC(5,2) NOT NULL DEFAULT 6.00,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO entangled_pricing_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Hacer fiscal y comprobante opcionales (factura sí/no, comprobante diferido)
ALTER TABLE entangled_payment_requests
  ALTER COLUMN cf_rfc DROP NOT NULL,
  ALTER COLUMN cf_razon_social DROP NOT NULL,
  ALTER COLUMN cf_regimen_fiscal DROP NOT NULL,
  ALTER COLUMN cf_cp DROP NOT NULL,
  ALTER COLUMN cf_uso_cfdi DROP NOT NULL,
  ALTER COLUMN cf_email DROP NOT NULL,
  ALTER COLUMN op_comprobante_cliente_url DROP NOT NULL;

-- Nuevas columnas para flujo v2
ALTER TABLE entangled_payment_requests
  ADD COLUMN IF NOT EXISTS requiere_factura BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS tipo_cambio_aplicado NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS porcentaje_compra_aplicado NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS monto_mxn_base NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS monto_mxn_total NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS instrucciones_pago JSONB,
  ADD COLUMN IF NOT EXISTS comprobante_subido_at TIMESTAMP;

-- Índice para búsquedas por estatus + fecha
CREATE INDEX IF NOT EXISTS idx_entangled_requests_user_created
  ON entangled_payment_requests(user_id, created_at DESC);
