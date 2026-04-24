-- =====================================================================
-- Migración: deprecar Facturapi → migrar todo a Facturama
-- =====================================================================
-- - Agrega facturama_id a las tablas que usan facturapi_id
-- - Mantiene facturapi_id como columna legacy (por si quedan registros viejos)
-- - Agrega columnas pdf_url / xml_url donde falten
-- =====================================================================

-- facturas_emitidas
ALTER TABLE facturas_emitidas ADD COLUMN IF NOT EXISTS facturama_id VARCHAR(80);
CREATE INDEX IF NOT EXISTS idx_facturas_emitidas_facturama_id ON facturas_emitidas(facturama_id);

-- invoices (consolidaciones)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS facturama_id VARCHAR(80);
CREATE INDEX IF NOT EXISTS idx_invoices_facturama_id ON invoices(facturama_id);

-- service_invoices
ALTER TABLE service_invoices ADD COLUMN IF NOT EXISTS facturama_id VARCHAR(80);
CREATE INDEX IF NOT EXISTS idx_service_invoices_facturama_id ON service_invoices(facturama_id);

-- fiscal_emitters: api_key (Facturapi) ya no se usa para emitir; lo dejamos pero
-- documentamos que la emisión ahora usa facturama_username/facturama_password.
COMMENT ON COLUMN fiscal_emitters.api_key IS 'DEPRECATED (Facturapi). La emisión ahora se hace con facturama_username/facturama_password.';

-- Nota: Si quieres rellenar facturama_id desde el verification_url o algún otro
-- campo legacy, ejecuta manualmente. Para registros nuevos no es necesario.
