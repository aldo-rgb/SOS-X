-- Asegura columnas de paquetería nacional y costos en maritime_orders
ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS national_carrier TEXT;
ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS national_tracking TEXT;
ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS national_label_url TEXT;
ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS national_shipping_cost NUMERIC(12,2);

-- Mismas columnas para china_receipts (TDI Aéreo China)
ALTER TABLE china_receipts ADD COLUMN IF NOT EXISTS national_carrier TEXT;
ALTER TABLE china_receipts ADD COLUMN IF NOT EXISTS national_tracking TEXT;
ALTER TABLE china_receipts ADD COLUMN IF NOT EXISTS national_label_url TEXT;
ALTER TABLE china_receipts ADD COLUMN IF NOT EXISTS national_shipping_cost NUMERIC(12,2);
ALTER TABLE china_receipts ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(12,2);
ALTER TABLE china_receipts ADD COLUMN IF NOT EXISTS assigned_cost_mxn NUMERIC(12,2);
ALTER TABLE china_receipts ADD COLUMN IF NOT EXISTS saldo_pendiente NUMERIC(12,2);
ALTER TABLE china_receipts ADD COLUMN IF NOT EXISTS monto_pagado NUMERIC(12,2);
