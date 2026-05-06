-- =====================================================================
-- Separación clara de COSTO PROVEEDOR vs PRECIO VENTA en PO Box
-- =====================================================================
-- Antes:
--   pobox_service_cost  = costo INTERNO MXN (mal nombrado)
--   pobox_cost_usd      = costo INTERNO USD
--   pobox_venta_usd     = precio venta USD por caja
--
-- Después:
--   pobox_provider_cost_mxn = lo que NOS cuesta (provider/AeroPost) en MXN
--   pobox_provider_cost_usd = lo que NOS cuesta en USD
--   pobox_service_cost      = PRECIO DE VENTA MXN (lo que paga el cliente)
--   pobox_venta_usd         = precio venta USD por caja (sin cambios)
--   pobox_cost_usd          = DEPRECATED, se mantiene espejo de pobox_provider_cost_usd
-- =====================================================================

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS pobox_provider_cost_mxn NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS pobox_provider_cost_usd NUMERIC(12, 2);

COMMENT ON COLUMN packages.pobox_provider_cost_mxn IS 'Costo INTERNO en MXN (lo que paga EntregaX al proveedor PO Box)';
COMMENT ON COLUMN packages.pobox_provider_cost_usd IS 'Costo INTERNO en USD (lo que paga EntregaX al proveedor PO Box)';
COMMENT ON COLUMN packages.pobox_service_cost      IS 'PRECIO DE VENTA en MXN (lo que cobra al cliente). = pobox_venta_usd * registered_exchange_rate';
COMMENT ON COLUMN packages.pobox_venta_usd         IS 'Precio de venta unitario en USD por caja (según tarifa: $39 N1, $79 N2, etc.)';
COMMENT ON COLUMN packages.pobox_cost_usd          IS 'DEPRECATED: usar pobox_provider_cost_usd';

-- Backfill 1: mover lo que hoy está en pobox_service_cost (costo interno) → pobox_provider_cost_mxn
UPDATE packages
SET pobox_provider_cost_mxn = pobox_service_cost
WHERE pobox_provider_cost_mxn IS NULL
  AND pobox_service_cost IS NOT NULL
  AND pobox_service_cost > 0;

-- Backfill 2: copiar pobox_cost_usd → pobox_provider_cost_usd
UPDATE packages
SET pobox_provider_cost_usd = pobox_cost_usd
WHERE pobox_provider_cost_usd IS NULL
  AND pobox_cost_usd IS NOT NULL
  AND pobox_cost_usd > 0;

-- Backfill 3: recalcular pobox_service_cost = precio de venta = venta_usd * tc
-- Solo para HIJAS o standalone (master multipieza se recalcula sumando hijas en backfill 4)
UPDATE packages
SET pobox_service_cost = ROUND((pobox_venta_usd * registered_exchange_rate)::numeric, 2)
WHERE pobox_venta_usd IS NOT NULL
  AND pobox_venta_usd > 0
  AND registered_exchange_rate IS NOT NULL
  AND registered_exchange_rate > 0
  AND (is_master = FALSE OR is_master IS NULL OR master_id IS NULL);

-- Backfill 4: para MASTERS multipieza, sumar pobox_service_cost de hijas
WITH child_sums AS (
  SELECT master_id,
         SUM(COALESCE(pobox_service_cost, 0))      AS sum_service,
         SUM(COALESCE(pobox_provider_cost_mxn, 0)) AS sum_provider_mxn,
         SUM(COALESCE(pobox_provider_cost_usd, 0)) AS sum_provider_usd,
         SUM(COALESCE(pobox_venta_usd, 0))         AS sum_venta_usd
  FROM packages
  WHERE master_id IS NOT NULL
  GROUP BY master_id
)
UPDATE packages p
SET pobox_service_cost      = cs.sum_service,
    pobox_provider_cost_mxn = cs.sum_provider_mxn,
    pobox_provider_cost_usd = cs.sum_provider_usd,
    pobox_venta_usd         = cs.sum_venta_usd,
    pobox_cost_usd          = cs.sum_provider_usd
FROM child_sums cs
WHERE p.id = cs.master_id
  AND p.is_master = TRUE
  AND cs.sum_service > 0;

-- Sincronizar pobox_cost_usd con pobox_provider_cost_usd (espejo deprecado)
UPDATE packages
SET pobox_cost_usd = pobox_provider_cost_usd
WHERE pobox_provider_cost_usd IS NOT NULL
  AND (pobox_cost_usd IS NULL OR pobox_cost_usd <> pobox_provider_cost_usd);

-- Índice para reportes a proveedor
CREATE INDEX IF NOT EXISTS idx_packages_pobox_provider_cost
  ON packages (pobox_provider_cost_mxn)
  WHERE pobox_provider_cost_mxn IS NOT NULL;
