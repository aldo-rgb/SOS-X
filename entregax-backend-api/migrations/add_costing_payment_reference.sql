-- Migración: Agregar columna de referencia de pago a proveedor
-- Fecha: 2026-03-11

-- Agregar columna costing_payment_reference si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'packages' AND column_name = 'costing_payment_reference'
    ) THEN
        ALTER TABLE packages ADD COLUMN costing_payment_reference VARCHAR(100);
        RAISE NOTICE 'Columna costing_payment_reference agregada';
    ELSE
        RAISE NOTICE 'Columna costing_payment_reference ya existe';
    END IF;
END $$;

-- Agregar columna costing_paid_at si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'packages' AND column_name = 'costing_paid_at'
    ) THEN
        ALTER TABLE packages ADD COLUMN costing_paid_at TIMESTAMP;
        RAISE NOTICE 'Columna costing_paid_at agregada';
    ELSE
        RAISE NOTICE 'Columna costing_paid_at ya existe';
    END IF;
END $$;

-- Agregar categoría 'pago_proveedor' a caja_chica_transacciones si es necesario
-- (Por si usa un CHECK constraint)

COMMENT ON COLUMN packages.costing_payment_reference IS 'Referencia del pago al proveedor (ej: CAJA-123, TRANS-456)';
COMMENT ON COLUMN packages.costing_paid_at IS 'Fecha y hora en que se pagó al proveedor';
