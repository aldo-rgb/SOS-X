-- Tabla para guardar movimientos de estados de cuenta bancarios
CREATE TABLE IF NOT EXISTS bank_statement_entries (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER REFERENCES fiscal_emitters(id),
  service_type VARCHAR(50),
  banco VARCHAR(50) NOT NULL, -- bbva, banorte, hsbc, santander
  fecha DATE NOT NULL,
  concepto VARCHAR(500) NOT NULL,
  referencia VARCHAR(500),
  cargo NUMERIC(14,2),
  abono NUMERIC(14,2),
  saldo NUMERIC(14,2),
  -- Para deduplicación: hash de fecha+concepto+referencia+cargo+abono+saldo
  entry_hash VARCHAR(64) NOT NULL,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(empresa_id, entry_hash)
);

CREATE INDEX IF NOT EXISTS idx_bank_entries_empresa ON bank_statement_entries(empresa_id);
CREATE INDEX IF NOT EXISTS idx_bank_entries_fecha ON bank_statement_entries(fecha);
CREATE INDEX IF NOT EXISTS idx_bank_entries_hash ON bank_statement_entries(empresa_id, entry_hash);
