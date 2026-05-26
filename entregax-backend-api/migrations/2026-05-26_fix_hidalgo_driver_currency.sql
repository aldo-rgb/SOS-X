-- ============================================================
-- Corregir moneda de wallets de choferes de Hidalgo TX
-- Fecha: 2026-05-26
-- ============================================================
-- Los choferes de Hidalgo TX deben operar en USD, no MXN.
-- Esta migración actualiza las wallets existentes que se
-- crearon antes de implementar la herencia automática de moneda.
-- ============================================================

BEGIN;

-- Actualizar wallets de choferes asignados a Mostrador Hidalgo TX (branch_id = 6)
-- que aún tienen currency = 'MXN' para que usen 'USD'
UPDATE petty_cash_wallets
   SET currency = 'USD',
       updated_at = CURRENT_TIMESTAMP
 WHERE owner_type = 'driver'
   AND branch_id = 6
   AND currency = 'MXN';

-- Verificar que la sucursal Hidalgo TX tenga currency = 'USD' en la tabla branches
UPDATE branches
   SET currency = 'USD'
 WHERE id = 6
   AND (currency IS NULL OR currency != 'USD');

COMMIT;
