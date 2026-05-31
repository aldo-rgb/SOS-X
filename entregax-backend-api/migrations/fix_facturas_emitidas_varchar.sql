-- Ampliar columnas VARCHAR angostas en facturas_emitidas que causan
-- "value too long for type character varying(N)" al insertar datos de Facturama.
ALTER TABLE facturas_emitidas
    ALTER COLUMN currency     TYPE VARCHAR(10),
    ALTER COLUMN payment_form TYPE VARCHAR(10),
    ALTER COLUMN serie        TYPE VARCHAR(50);

-- Agregar payment_method si no existe (era dato omitido en el schema original)
ALTER TABLE facturas_emitidas
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(10);
