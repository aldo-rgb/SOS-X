-- ============================================
-- MIGRACIÓN: Columnas de seguimiento de pagos en packages
-- Fecha: 2026-03-03
-- ============================================

-- Agregar columna para saldo pendiente (lo que falta por pagar)
ALTER TABLE packages ADD COLUMN IF NOT EXISTS saldo_pendiente DECIMAL(10,2) DEFAULT 0;

-- Agregar columna para monto pagado
ALTER TABLE packages ADD COLUMN IF NOT EXISTS monto_pagado DECIMAL(10,2) DEFAULT 0;

-- Inicializar saldo_pendiente con el costo asignado para paquetes existentes
UPDATE packages 
SET saldo_pendiente = COALESCE(assigned_cost_mxn, 0)
WHERE saldo_pendiente IS NULL OR saldo_pendiente = 0;

-- Comentario: saldo_pendiente = assigned_cost_mxn - monto_pagado
-- Cuando el cliente paga, se actualiza monto_pagado y se recalcula saldo_pendiente
