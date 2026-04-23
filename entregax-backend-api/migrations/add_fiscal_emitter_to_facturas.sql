-- Añadir fiscal_emitter_id a facturas_emitidas para poder filtrar por empresa emisora
-- en el Portal Contable.
ALTER TABLE facturas_emitidas
    ADD COLUMN IF NOT EXISTS fiscal_emitter_id INTEGER REFERENCES fiscal_emitters(id);

CREATE INDEX IF NOT EXISTS idx_facturas_fiscal_emitter_id
    ON facturas_emitidas(fiscal_emitter_id);
