-- ============================================================
-- SYNCFY (Paybook) INTEGRATION - REEMPLAZO DE BELVO
-- Fecha: 2026-05-30
-- Notas:
--   - No borra nada de Belvo (queda deprecated pero funcional).
--   - Crea tablas espejo: syncfy_users, syncfy_credentials,
--     syncfy_transactions, syncfy_webhook_events.
--   - Cada fiscal_emitter puede tener su propia configuración Syncfy
--     (multi-empresa). Se reutiliza bank_statement_entries como
--     fuente unificada (Belvo + Syncfy + manual).
-- ============================================================

BEGIN;

-- 1) Columnas de control Syncfy en fiscal_emitters ------------
ALTER TABLE fiscal_emitters
  ADD COLUMN IF NOT EXISTS syncfy_connected   BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS syncfy_user_id     TEXT,                       -- id_user devuelto por Syncfy
  ADD COLUMN IF NOT EXISTS syncfy_institution TEXT,
  ADD COLUMN IF NOT EXISTS syncfy_last_sync   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS syncfy_env         TEXT DEFAULT 'sandbox';     -- 'sandbox' | 'production'

CREATE INDEX IF NOT EXISTS idx_fiscal_emitters_syncfy_user
  ON fiscal_emitters(syncfy_user_id) WHERE syncfy_user_id IS NOT NULL;

-- 2) syncfy_users: 1 user de Syncfy por empresa fiscal --------
CREATE TABLE IF NOT EXISTS syncfy_users (
  id              SERIAL PRIMARY KEY,
  emitter_id      INTEGER NOT NULL UNIQUE REFERENCES fiscal_emitters(id) ON DELETE CASCADE,
  id_user         TEXT NOT NULL UNIQUE,         -- id_user de Syncfy
  external_id     TEXT,                          -- ej. "emitter-<id>"
  env             TEXT NOT NULL DEFAULT 'sandbox',
  status          TEXT NOT NULL DEFAULT 'active',
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3) syncfy_credentials: 1 por banco conectado por empresa ----
--    (equivalente a belvo_links)
CREATE TABLE IF NOT EXISTS syncfy_credentials (
  id                  SERIAL PRIMARY KEY,
  emitter_id          INTEGER NOT NULL REFERENCES fiscal_emitters(id) ON DELETE CASCADE,
  syncfy_user_id      TEXT NOT NULL,             -- id_user (denormalizado p/JOIN rápido)
  id_credential       TEXT NOT NULL UNIQUE,      -- id_credential de Syncfy
  id_site             TEXT,                      -- id_site Syncfy (BBVA=560..., Banregio=...)
  institution         TEXT,                      -- ej. 'bbva', 'banregio'
  institution_name    TEXT,                      -- ej. 'BBVA México', 'Banregio'
  status              TEXT NOT NULL DEFAULT 'active',  -- active|invalid|expired|locked
  twofa_required      BOOLEAN DEFAULT FALSE,
  is_active           BOOLEAN DEFAULT TRUE,
  last_sync_at        TIMESTAMPTZ,
  last_status_message TEXT,
  created_by          INTEGER REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_syncfy_credentials_emitter
  ON syncfy_credentials(emitter_id, is_active);
CREATE INDEX IF NOT EXISTS idx_syncfy_credentials_user
  ON syncfy_credentials(syncfy_user_id);

-- 4) syncfy_transactions: movimientos crudos ------------------
--    (equivalente a belvo_transactions)
CREATE TABLE IF NOT EXISTS syncfy_transactions (
  id                  SERIAL PRIMARY KEY,
  emitter_id          INTEGER NOT NULL REFERENCES fiscal_emitters(id) ON DELETE CASCADE,
  syncfy_credential_id INTEGER NOT NULL REFERENCES syncfy_credentials(id) ON DELETE CASCADE,
  id_transaction      TEXT NOT NULL UNIQUE,      -- id_transaction Syncfy
  id_account          TEXT,                      -- id_account Syncfy
  account_number      TEXT,                      -- últimos dígitos
  value_date          DATE,
  accounting_date     DATE,
  amount              NUMERIC(18,2) NOT NULL,
  balance             NUMERIC(18,2),
  currency            TEXT DEFAULT 'MXN',
  description         TEXT,
  reference           TEXT,
  merchant_name       TEXT,
  type                TEXT,                      -- 'INFLOW' | 'OUTFLOW'
  category            TEXT,
  subcategory         TEXT,
  status              TEXT,
  raw_data            JSONB,

  -- conciliación
  match_status        TEXT NOT NULL DEFAULT 'pending',  -- matched|pending|unmatched|ignored
  matched_payment_id  INTEGER REFERENCES pobox_payments(id) ON DELETE SET NULL,
  matched_webhook_id  INTEGER,
  matched_at          TIMESTAMPTZ,
  matched_by          INTEGER REFERENCES users(id),

  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_syncfy_tx_emitter_date
  ON syncfy_transactions(emitter_id, value_date DESC);
CREATE INDEX IF NOT EXISTS idx_syncfy_tx_match_status
  ON syncfy_transactions(match_status);
CREATE INDEX IF NOT EXISTS idx_syncfy_tx_credential
  ON syncfy_transactions(syncfy_credential_id);

-- 5) syncfy_webhook_events: log + idempotencia ----------------
CREATE TABLE IF NOT EXISTS syncfy_webhook_events (
  id              SERIAL PRIMARY KEY,
  event_id        TEXT,
  event_type      TEXT,                          -- credentials.refreshed, transactions.created, etc.
  id_user         TEXT,
  id_credential   TEXT,
  payload         JSONB,
  processed       BOOLEAN DEFAULT FALSE,
  processed_at    TIMESTAMPTZ,
  error           TEXT,
  received_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_syncfy_webhook_event_id
  ON syncfy_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_syncfy_webhook_processed
  ON syncfy_webhook_events(processed, received_at);

-- 6) Vista unificada bank_movements (Belvo + Syncfy) ----------
--    Para no romper UI existente, alimenta listBankMovements.
DROP VIEW IF EXISTS v_bank_movements_unified;
CREATE VIEW v_bank_movements_unified AS
  SELECT
    'belvo'::TEXT                        AS source,
    bt.id                                AS source_id,
    bt.emitter_id,
    bt.value_date,
    bt.accounting_date,
    bt.amount,
    bt.balance,
    bt.currency,
    bt.description,
    bt.reference,
    bt.type,
    bt.category,
    bt.subcategory,
    bt.merchant_name,
    bt.status,
    bt.match_status,
    bt.matched_payment_id,
    bt.matched_at,
    bl.institution_name
  FROM belvo_transactions bt
  JOIN belvo_links bl ON bl.id = bt.belvo_link_id

  UNION ALL

  SELECT
    'syncfy'::TEXT                       AS source,
    st.id                                AS source_id,
    st.emitter_id,
    st.value_date,
    st.accounting_date,
    st.amount,
    st.balance,
    st.currency,
    st.description,
    st.reference,
    st.type,
    st.category,
    st.subcategory,
    st.merchant_name,
    st.status,
    st.match_status,
    st.matched_payment_id,
    st.matched_at,
    sc.institution_name
  FROM syncfy_transactions st
  JOIN syncfy_credentials sc ON sc.id = st.syncfy_credential_id;

COMMIT;
