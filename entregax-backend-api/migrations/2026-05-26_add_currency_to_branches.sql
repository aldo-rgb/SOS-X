-- ============================================================
-- Agregar campo currency a la tabla branches
-- Fecha: 2026-05-26
-- ============================================================
-- Permite que cada sucursal tenga su propia moneda configurada.
-- Las wallets de sucursales y choferes heredarán esta moneda.
-- ============================================================

BEGIN;

-- Agregar campo currency a branches si no existe
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'MXN';

-- Configurar Mostrador Hidalgo TX para operar en USD
UPDATE branches
   SET currency = 'USD'
 WHERE id = 6;

COMMIT;
