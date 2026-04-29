-- Agrega valores de status por sucursal MX al enum package_status
-- Permite distinguir en qué CEDIS se recibió un paquete (CDMX, GDL, QRO, etc.)
-- Cada ALTER TYPE ADD VALUE debe ir en su propio statement (no se permite dentro de transacción).

ALTER TYPE package_status ADD VALUE IF NOT EXISTS 'received_cdmx';
ALTER TYPE package_status ADD VALUE IF NOT EXISTS 'received_gdl';
ALTER TYPE package_status ADD VALUE IF NOT EXISTS 'received_qro';
ALTER TYPE package_status ADD VALUE IF NOT EXISTS 'received_pue';
ALTER TYPE package_status ADD VALUE IF NOT EXISTS 'received_tij';
ALTER TYPE package_status ADD VALUE IF NOT EXISTS 'received_mid';
ALTER TYPE package_status ADD VALUE IF NOT EXISTS 'received_cun';
ALTER TYPE package_status ADD VALUE IF NOT EXISTS 'received_leo';
ALTER TYPE package_status ADD VALUE IF NOT EXISTS 'received_hgo';
