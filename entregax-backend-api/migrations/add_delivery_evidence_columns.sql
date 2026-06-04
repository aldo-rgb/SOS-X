-- Añade columnas faltantes para registro de entrega (firma, foto, receptor, notas)
-- Sin estas columnas el driver descarta silenciosamente los datos al confirmar la entrega
-- (hasPackageColumn() devuelve false y el SET no se incluye en el UPDATE).

ALTER TABLE packages
    ADD COLUMN IF NOT EXISTS delivery_signature       text,
    ADD COLUMN IF NOT EXISTS delivery_photo           text,
    ADD COLUMN IF NOT EXISTS delivery_recipient_name  text,
    ADD COLUMN IF NOT EXISTS delivery_notes           text;
