-- ============================================================
-- MÓDULO: Caja Chica de Sucursales (Petty Cash)
-- Fecha: 2026-05-15
-- ============================================================
-- Objetivo: control de fondeo Caja CC -> Sucursal -> Chofer,
-- captura de gastos (con foto + GPS), aprobaciones y arqueos.
-- ============================================================

BEGIN;

-- =========================
-- 1. Wallets (sucursal/chofer)
-- =========================
CREATE TABLE IF NOT EXISTS petty_cash_wallets (
  id              SERIAL PRIMARY KEY,
  owner_type      VARCHAR(20) NOT NULL CHECK (owner_type IN ('branch','driver')),
  owner_id        INTEGER NOT NULL,
  -- Para wallets de chofer guardamos su sucursal padre para visibilidad
  branch_id       INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  balance_mxn     NUMERIC(14,2) NOT NULL DEFAULT 0,
  pending_to_verify_mxn NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_limit_mxn NUMERIC(14,2) NOT NULL DEFAULT 0,
  status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  notes           TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner_type, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_petty_cash_wallets_branch ON petty_cash_wallets(branch_id);
CREATE INDEX IF NOT EXISTS idx_petty_cash_wallets_owner ON petty_cash_wallets(owner_type, owner_id);

-- =========================
-- 2. Movimientos
-- =========================
CREATE TABLE IF NOT EXISTS petty_cash_movements (
  id              SERIAL PRIMARY KEY,
  wallet_id       INTEGER NOT NULL REFERENCES petty_cash_wallets(id) ON DELETE CASCADE,
  movement_type   VARCHAR(20) NOT NULL CHECK (movement_type IN (
    'fund',         -- Caja CC fondea sucursal
    'advance',      -- Sucursal entrega anticipo a chofer (vale digital)
    'expense',      -- Gasto registrado con evidencia
    'return',       -- Devolución de efectivo al cerrar ruta
    'adjustment'    -- Ajuste manual con motivo
  )),
  category        VARCHAR(40),
  -- Monto siempre positivo, el signo se infiere del movement_type
  amount_mxn      NUMERIC(14,2) NOT NULL CHECK (amount_mxn > 0),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','approved','rejected','cancelled','settled'
  )),
  concept         TEXT,
  evidence_url    TEXT,                -- Foto del ticket/factura
  xml_url         TEXT,                -- XML CFDI (opcional)
  odometer_photo_url TEXT,             -- Foto del odómetro (combustible)
  odometer_km     INTEGER,             -- Km capturado
  gps_lat         NUMERIC(10,7),
  gps_lng         NUMERIC(10,7),
  gps_accuracy_m  NUMERIC(8,2),
  vehicle_id      INTEGER,
  advance_id      INTEGER,             -- FK lógica a petty_cash_advances
  related_movement_id INTEGER REFERENCES petty_cash_movements(id) ON DELETE SET NULL,
  route_settlement_id INTEGER,         -- FK lógica a petty_cash_route_settlements
  branch_id       INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMP,
  rejection_reason TEXT,
  caja_chica_transaccion_id INTEGER -- Referencia al egreso de Caja CC (si aplica)
);

CREATE INDEX IF NOT EXISTS idx_pcm_wallet ON petty_cash_movements(wallet_id);
CREATE INDEX IF NOT EXISTS idx_pcm_status ON petty_cash_movements(status);
CREATE INDEX IF NOT EXISTS idx_pcm_type ON petty_cash_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_pcm_branch ON petty_cash_movements(branch_id);
CREATE INDEX IF NOT EXISTS idx_pcm_created ON petty_cash_movements(created_at DESC);

-- =========================
-- 3. Anticipos (Vales digitales)
-- =========================
CREATE TABLE IF NOT EXISTS petty_cash_advances (
  id              SERIAL PRIMARY KEY,
  source_wallet_id INTEGER NOT NULL REFERENCES petty_cash_wallets(id),  -- wallet sucursal
  driver_wallet_id INTEGER NOT NULL REFERENCES petty_cash_wallets(id),  -- wallet chofer
  driver_user_id  INTEGER NOT NULL REFERENCES users(id),
  branch_id       INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  amount_mxn      NUMERIC(14,2) NOT NULL CHECK (amount_mxn > 0),
  status          VARCHAR(25) NOT NULL DEFAULT 'pending_acceptance' CHECK (status IN (
    'pending_acceptance','accepted','rejected','cancelled','settled'
  )),
  issued_by       INTEGER NOT NULL REFERENCES users(id),
  issued_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at     TIMESTAMP,
  accepted_lat    NUMERIC(10,7),
  accepted_lng    NUMERIC(10,7),
  device_info     TEXT,                 -- User agent / dispositivo del chofer
  signature_hash  VARCHAR(128),         -- Hash de firma (timestamp + userId + amount + secret)
  cancelled_reason TEXT,
  route_purpose   TEXT,                 -- Motivo del viaje
  settlement_id   INTEGER,              -- FK lógica
  outflow_movement_id INTEGER REFERENCES petty_cash_movements(id) ON DELETE SET NULL,
  inflow_movement_id  INTEGER REFERENCES petty_cash_movements(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pca_driver ON petty_cash_advances(driver_user_id);
CREATE INDEX IF NOT EXISTS idx_pca_status ON petty_cash_advances(status);
CREATE INDEX IF NOT EXISTS idx_pca_branch ON petty_cash_advances(branch_id);

-- =========================
-- 4. Arqueos / Cierre de ruta
-- =========================
CREATE TABLE IF NOT EXISTS petty_cash_route_settlements (
  id              SERIAL PRIMARY KEY,
  driver_wallet_id INTEGER NOT NULL REFERENCES petty_cash_wallets(id),
  driver_user_id  INTEGER NOT NULL REFERENCES users(id),
  branch_id       INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  total_funded    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_approved_expenses NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_pending_expenses  NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_rejected_expenses NUMERIC(14,2) NOT NULL DEFAULT 0,
  cash_returned   NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance         NUMERIC(14,2) NOT NULL DEFAULT 0,        -- Positivo = a favor del chofer; Negativo = chofer debe
  status          VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','disputed')),
  opened_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at       TIMESTAMP,
  closed_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  opened_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_pcrs_driver ON petty_cash_route_settlements(driver_user_id);
CREATE INDEX IF NOT EXISTS idx_pcrs_status ON petty_cash_route_settlements(status);

-- =========================
-- 5. FKs lógicas
-- =========================
ALTER TABLE petty_cash_movements
  ADD CONSTRAINT fk_pcm_advance
  FOREIGN KEY (advance_id) REFERENCES petty_cash_advances(id) ON DELETE SET NULL;

ALTER TABLE petty_cash_movements
  ADD CONSTRAINT fk_pcm_settlement
  FOREIGN KEY (route_settlement_id) REFERENCES petty_cash_route_settlements(id) ON DELETE SET NULL;

ALTER TABLE petty_cash_advances
  ADD CONSTRAINT fk_pca_settlement
  FOREIGN KEY (settlement_id) REFERENCES petty_cash_route_settlements(id) ON DELETE SET NULL;

COMMIT;
