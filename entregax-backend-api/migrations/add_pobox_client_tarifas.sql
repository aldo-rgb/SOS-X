-- ============================================================
-- PO Box: tarifas de VENTA por CLIENTE (precio preferencial)
-- ------------------------------------------------------------
-- Permite sobrescribir el "costo" (precio de venta) de cada NIVEL
-- de pobox_tarifas_volumen para un cliente específico. Los rangos de
-- CBM (cbm_min/cbm_max) siguen viniendo de la tabla global; aquí solo
-- se personaliza el costo y el tipo de cobro por nivel y por cliente.
--
-- Jerarquía de precio en PO Box:
--   1) tarifa del cliente para ese nivel (pobox_client_tarifas)  ← si existe
--   2) tarifa global del nivel (pobox_tarifas_volumen)           ← default
-- ============================================================

CREATE TABLE IF NOT EXISTS pobox_client_tarifas (
    id             SERIAL PRIMARY KEY,
    client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nivel          INTEGER NOT NULL,                 -- corresponde a pobox_tarifas_volumen.nivel
    costo          NUMERIC(10,2) NOT NULL,           -- precio de VENTA para ese nivel (según moneda)
    tipo_cobro     VARCHAR(20) NOT NULL DEFAULT 'fijo', -- 'fijo' | 'por_unidad'
    moneda         VARCHAR(3) DEFAULT 'USD',
    estado         BOOLEAN DEFAULT TRUE,
    notas          TEXT,
    created_by     INTEGER REFERENCES users(id),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (client_user_id, nivel)
);

CREATE INDEX IF NOT EXISTS idx_pobox_client_tarifas_user
    ON pobox_client_tarifas (client_user_id) WHERE estado = TRUE;
