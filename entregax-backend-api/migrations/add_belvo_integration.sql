-- ============================================
-- BELVO INTEGRATION TABLES
-- Automatic bank statement extraction
-- ============================================

-- 1. Belvo Links: cada conexión bancaria vinculada a una empresa emisora
CREATE TABLE IF NOT EXISTS belvo_links (
  id SERIAL PRIMARY KEY,
  emitter_id INTEGER NOT NULL REFERENCES fiscal_emitters(id) ON DELETE CASCADE,
  belvo_link_id VARCHAR(100) NOT NULL UNIQUE, -- UUID from Belvo
  institution VARCHAR(100) NOT NULL, -- e.g. "erebor_mx_retail" (sandbox), "banregio_mx_business"
  institution_name VARCHAR(100), -- Display: "Banregio", "BBVA"
  access_mode VARCHAR(20) DEFAULT 'recurrent', -- 'single' or 'recurrent'
  status VARCHAR(30) DEFAULT 'valid', -- 'valid', 'invalid', 'unconfirmed', 'token_required'
  last_accessed_at TIMESTAMP,
  refresh_rate VARCHAR(20) DEFAULT '24h', -- How often Belvo refreshes
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_belvo_links_emitter ON belvo_links(emitter_id);

-- 2. Belvo Transactions: raw transactions received from Belvo API/webhooks
CREATE TABLE IF NOT EXISTS belvo_transactions (
  id SERIAL PRIMARY KEY,
  belvo_link_id INTEGER NOT NULL REFERENCES belvo_links(id) ON DELETE CASCADE,
  belvo_transaction_id VARCHAR(100) UNIQUE, -- UUID from Belvo
  emitter_id INTEGER NOT NULL REFERENCES fiscal_emitters(id),
  account_id VARCHAR(100), -- Belvo account UUID
  value_date DATE NOT NULL,
  accounting_date DATE,
  amount NUMERIC(14,2) NOT NULL,
  balance NUMERIC(14,2),
  currency VARCHAR(3) DEFAULT 'MXN',
  description TEXT,
  reference VARCHAR(500),
  type VARCHAR(20) NOT NULL, -- 'INFLOW' or 'OUTFLOW'
  category VARCHAR(100), -- Belvo category
  subcategory VARCHAR(100),
  merchant_name VARCHAR(255),
  status VARCHAR(20) DEFAULT 'PROCESSED', -- Belvo status: PROCESSED, PENDING, UNCATEGORIZED
  -- Matching fields
  match_status VARCHAR(30) DEFAULT 'pending', -- 'pending', 'matched', 'unmatched', 'ignored'
  matched_payment_id INTEGER, -- FK to pobox_payments if matched
  matched_webhook_id INTEGER, -- FK to openpay_webhook_logs if matched
  matched_at TIMESTAMP,
  matched_by INTEGER, -- user who manually matched or NULL for auto
  bank_entry_id INTEGER, -- FK to bank_statement_entries if synced there
  -- Metadata
  raw_data JSONB, -- Full Belvo transaction object
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_belvo_tx_link ON belvo_transactions(belvo_link_id);
CREATE INDEX IF NOT EXISTS idx_belvo_tx_emitter ON belvo_transactions(emitter_id);
CREATE INDEX IF NOT EXISTS idx_belvo_tx_date ON belvo_transactions(value_date);
CREATE INDEX IF NOT EXISTS idx_belvo_tx_match ON belvo_transactions(match_status);
CREATE INDEX IF NOT EXISTS idx_belvo_tx_amount ON belvo_transactions(amount) WHERE type = 'INFLOW';

-- 3. Belvo Webhook Events: audit log of all incoming Belvo webhooks
CREATE TABLE IF NOT EXISTS belvo_webhook_events (
  id SERIAL PRIMARY KEY,
  webhook_id VARCHAR(100), -- Belvo webhook event id
  webhook_type VARCHAR(50) NOT NULL, -- 'TRANSACTIONS', 'ACCOUNTS', 'LINKS' etc.
  event_code VARCHAR(50) NOT NULL, -- 'transactions_created', 'historical_update', etc.
  link_id VARCHAR(100), -- Belvo link UUID
  data JSONB, -- Full webhook payload
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_belvo_wh_type ON belvo_webhook_events(webhook_type);
CREATE INDEX IF NOT EXISTS idx_belvo_wh_processed ON belvo_webhook_events(processed) WHERE NOT processed;

-- 4. Add source column to bank_statement_entries to distinguish manual vs Belvo
ALTER TABLE bank_statement_entries ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual';
-- 'manual' = pasted/CSV upload, 'belvo' = auto-fetched from Belvo
ALTER TABLE bank_statement_entries ADD COLUMN IF NOT EXISTS belvo_transaction_id INTEGER REFERENCES belvo_transactions(id);

-- 5. Add belvo fields to fiscal_emitters
ALTER TABLE fiscal_emitters ADD COLUMN IF NOT EXISTS belvo_connected BOOLEAN DEFAULT FALSE;
ALTER TABLE fiscal_emitters ADD COLUMN IF NOT EXISTS belvo_institution VARCHAR(100);
ALTER TABLE fiscal_emitters ADD COLUMN IF NOT EXISTS belvo_last_sync TIMESTAMP;
