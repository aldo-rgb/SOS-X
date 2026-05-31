-- Correo exclusivo para recepción de facturas CFDI.
-- Por defecto NULL → se usa el email principal del usuario.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS fiscal_email VARCHAR(255);
