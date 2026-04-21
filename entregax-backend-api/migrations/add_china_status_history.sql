-- ============================================
-- Historial de cambios de status para guías China/AIR
-- Registra cada cambio detectado desde MoJie o manual
-- ============================================

CREATE TABLE IF NOT EXISTS china_status_history (
    id SERIAL PRIMARY KEY,
    package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE,
    china_receipt_id INTEGER REFERENCES china_receipts(id) ON DELETE CASCADE,
    tracking_internal VARCHAR(100),
    child_no VARCHAR(100),
    fno VARCHAR(100),
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    trajectory_name TEXT,
    source VARCHAR(32) DEFAULT 'mojie_sync', -- mojie_sync | mojie_webhook | manual | recalc
    changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_csh_package ON china_status_history(package_id);
CREATE INDEX IF NOT EXISTS idx_csh_receipt ON china_status_history(china_receipt_id);
CREATE INDEX IF NOT EXISTS idx_csh_tracking ON china_status_history(tracking_internal);
CREATE INDEX IF NOT EXISTS idx_csh_fno ON china_status_history(fno);
CREATE INDEX IF NOT EXISTS idx_csh_created ON china_status_history(created_at DESC);

COMMENT ON TABLE china_status_history IS 'Bitácora de cambios de status para guías China/AIR (MoJie)';
