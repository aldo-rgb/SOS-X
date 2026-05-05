-- ============================================================================
-- ENTANGLED v2 — Modelo de dos servicios (pago_con_factura / pago_sin_factura)
-- ============================================================================
-- Cambios principales:
--   * Se deprecan los proveedores ENTANGLED (entangled_providers / user_pricing).
--     Se conservan en BD para histórico, pero el flujo nuevo NO los usa.
--   * Cada solicitud queda asociada a un `servicio` y guarda:
--       - comision_cliente_final_porcentaje  (la que XPAY le cobra al cliente)
--       - comision_cobrada_porcentaje        (la que ENTANGLED nos cobra a XPAY)
--       - tc_aplicado_usd                    (TC reportado por ENTANGLED)
--       - empresas_asignadas (JSONB)         (cuentas bancarias asignadas)
--       - url_comprobante_cliente            (URL del comprobante recibido)
--   * Nueva tabla singleton `entangled_service_config` con la comisión global
--     que XPAY le cobra al cliente final por cada servicio.
--   * Nueva tabla `entangled_user_service_pricing` con override por usuario.
-- ============================================================================

-- 1) Columnas nuevas en entangled_payment_requests
ALTER TABLE entangled_payment_requests
  ADD COLUMN IF NOT EXISTS servicio VARCHAR(20) NOT NULL DEFAULT 'pago_con_factura',
  ADD COLUMN IF NOT EXISTS comision_cliente_final_porcentaje NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS comision_cobrada_porcentaje NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS tc_aplicado_usd NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS empresas_asignadas JSONB,
  ADD COLUMN IF NOT EXISTS url_comprobante_cliente TEXT;

-- Validación de servicios permitidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entangled_payment_requests_servicio_check'
  ) THEN
    ALTER TABLE entangled_payment_requests
      ADD CONSTRAINT entangled_payment_requests_servicio_check
      CHECK (servicio IN ('pago_con_factura', 'pago_sin_factura'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_entangled_requests_servicio
  ON entangled_payment_requests(servicio);

-- Backfill: solicitudes existentes con requiere_factura=false → pago_sin_factura
UPDATE entangled_payment_requests
   SET servicio = 'pago_sin_factura'
 WHERE requiere_factura = FALSE
   AND servicio = 'pago_con_factura';

-- 2) Configuración global singleton de comisiones XPAY por servicio
CREATE TABLE IF NOT EXISTS entangled_service_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  comision_pago_con_factura NUMERIC(5,2) NOT NULL DEFAULT 6.00,
  comision_pago_sin_factura NUMERIC(5,2) NOT NULL DEFAULT 4.00,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO entangled_service_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 3) Override por usuario, opcional, por servicio
CREATE TABLE IF NOT EXISTS entangled_user_service_pricing (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  servicio VARCHAR(20) NOT NULL CHECK (servicio IN ('pago_con_factura','pago_sin_factura')),
  comision_porcentaje NUMERIC(5,2) NOT NULL,
  notes TEXT,
  set_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, servicio)
);

CREATE INDEX IF NOT EXISTS idx_entangled_user_service_pricing_user
  ON entangled_user_service_pricing(user_id);
