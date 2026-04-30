-- ============================================================================
-- ENTANGLED — Proveedores con TC, % de compra y cuentas bancarias propias
-- ============================================================================
-- Reemplaza el singleton entangled_pricing_config por una tabla de proveedores.
-- Cada proveedor tiene su propio TC USD/RMB, % de compra y un arreglo JSONB de
-- cuentas bancarias (donde el cliente XOX deposita el MXN para pagar la
-- triangulación). Cada solicitud queda asociada al proveedor seleccionado.
-- ============================================================================

CREATE TABLE IF NOT EXISTS entangled_providers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(40),                       -- código corto opcional (ej. XOX, ALPHA)
  tipo_cambio_usd NUMERIC(10,4) NOT NULL DEFAULT 18.50,
  tipo_cambio_rmb NUMERIC(10,4) NOT NULL DEFAULT 2.85,
  porcentaje_compra NUMERIC(5,2) NOT NULL DEFAULT 6.00,
  -- Arreglo de cuentas: [{ alias, bank_name, holder, account_number, clabe, swift, currency, notes }]
  bank_accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entangled_providers_active ON entangled_providers(is_active);

-- Migrar el singleton existente como primer proveedor (si aún no hay ninguno)
INSERT INTO entangled_providers (name, code, tipo_cambio_usd, tipo_cambio_rmb, porcentaje_compra, is_active, is_default, sort_order)
SELECT 'XOX (Default)', 'XOX', tipo_cambio_usd, tipo_cambio_rmb, porcentaje_compra, true, true, 0
FROM entangled_pricing_config
WHERE id = 1
  AND NOT EXISTS (SELECT 1 FROM entangled_providers);

-- Si todavía no hay providers (porque el singleton tampoco existía), creamos uno default vacío
INSERT INTO entangled_providers (name, code, tipo_cambio_usd, tipo_cambio_rmb, porcentaje_compra, is_active, is_default, sort_order)
SELECT 'Proveedor Default', 'DEF', 18.50, 2.85, 6.00, true, true, 0
WHERE NOT EXISTS (SELECT 1 FROM entangled_providers);

-- Asociar solicitudes y overrides al proveedor
ALTER TABLE entangled_payment_requests
  ADD COLUMN IF NOT EXISTS provider_id INTEGER REFERENCES entangled_providers(id);

ALTER TABLE entangled_user_pricing
  ADD COLUMN IF NOT EXISTS provider_id INTEGER REFERENCES entangled_providers(id) ON DELETE CASCADE;

-- El override puede ser global (provider_id = NULL) o específico por proveedor.
-- Eliminamos la PK simple y usamos llave única compuesta (user_id, provider_id NULLS NOT DISTINCT)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'entangled_user_pricing'::regclass
      AND contype = 'p'
  ) THEN
    -- Si la PK actual es solo user_id, la quitamos
    BEGIN
      ALTER TABLE entangled_user_pricing DROP CONSTRAINT entangled_user_pricing_pkey;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_entangled_user_pricing_user_provider
  ON entangled_user_pricing(user_id, COALESCE(provider_id, 0));
