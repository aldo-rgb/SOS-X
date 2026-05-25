-- =====================================================================
-- Migration: MJCustomer FCL Sync (pageByClearance)
-- Fecha: 2026-05-25
-- Objetivo: integrar el endpoint /api/cabinet/pageByClearance como
-- fuente automatica de tracking FCL (sustituye a Vizion).
-- =====================================================================

-- 1) Columnas nuevas en containers para capturar datos del API
ALTER TABLE containers ADD COLUMN IF NOT EXISTS mj_container_id BIGINT;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS mj_last_sync TIMESTAMP;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS cn_status_en TEXT;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS cn_status_ch TEXT;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS service_type TEXT;          -- 单清 / 双清
ALTER TABLE containers ADD COLUMN IF NOT EXISTS planned_departure TIMESTAMP; -- planOpenTime
ALTER TABLE containers ADD COLUMN IF NOT EXISTS actual_departure TIMESTAMP;  -- openTime / startTime
ALTER TABLE containers ADD COLUMN IF NOT EXISTS actual_arrival TIMESTAMP;    -- getTime
ALTER TABLE containers ADD COLUMN IF NOT EXISTS unloaded_at TIMESTAMP;       -- cabinetedTime
ALTER TABLE containers ADD COLUMN IF NOT EXISTS delivery_pdf_url TEXT;       -- file
ALTER TABLE containers ADD COLUMN IF NOT EXISTS port_name TEXT;              -- portCodeName
ALTER TABLE containers ADD COLUMN IF NOT EXISTS ship_carrier_code TEXT;      -- shipBno

-- 2) Indice UNIQUE para evitar duplicados por container_number / bl_number
--    Se aplican solo cuando el valor no es NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_containers_container_number
    ON containers (container_number)
    WHERE container_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_containers_bl_number
    ON containers (bl_number)
    WHERE bl_number IS NOT NULL;

-- 3) Indice de busqueda rapida por mj_container_id (idempotencia)
CREATE INDEX IF NOT EXISTS idx_containers_mj_container_id
    ON containers (mj_container_id)
    WHERE mj_container_id IS NOT NULL;

-- 4) Bitacora de sincronizaciones
CREATE TABLE IF NOT EXISTS mjcustomer_sync_log (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMP,
    triggered_by TEXT NOT NULL,                  -- 'cron' | 'manual:<user_id>'
    items_fetched INTEGER NOT NULL DEFAULT 0,
    items_created INTEGER NOT NULL DEFAULT 0,
    items_updated INTEGER NOT NULL DEFAULT 0,
    items_conflict INTEGER NOT NULL DEFAULT 0,
    pages_fetched INTEGER NOT NULL DEFAULT 0,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_mj_sync_log_started_at
    ON mjcustomer_sync_log (started_at DESC);

-- 5) Conflictos detectados (para resolucion manual)
CREATE TABLE IF NOT EXISTS mjcustomer_sync_conflicts (
    id SERIAL PRIMARY KEY,
    detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
    conflict_type TEXT NOT NULL,                 -- 'duplicate_container' | 'duplicate_bl' | 'mapping_error'
    mj_container_id BIGINT,
    cabinet_no TEXT,
    bill_no TEXT,
    existing_container_id INTEGER REFERENCES containers(id) ON DELETE SET NULL,
    payload JSONB,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMP,
    resolved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_mj_sync_conflicts_unresolved
    ON mjcustomer_sync_conflicts (resolved, detected_at DESC);
