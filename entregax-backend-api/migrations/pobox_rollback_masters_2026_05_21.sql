-- ============================================================
-- ROLLBACK MASTERS PO BOX – 2026-05-21
--
-- Problema: la actualización masiva del 2026-05-21 marcó como
-- 'delivered' los paquetes MASTER cuyas guías hijas estaban
-- en el keep_list. Solo se normalizaron las guías hijas
-- (ej. US0940622929-0007) pero no los masters (US0940622929).
--
-- Este script revierte solo esos masters a received_mty.
--
-- Masters afectados (10):
--   US2233548888   → tiene hijo US2233548888-0004
--   US0940622929   → tiene hijos -0001 a -0012
--   US5185071749   → tiene hijos -0001, -0002
--   US5366391804   → tiene hijos -0001 a -0010
--   US8998455434   → tiene hijos -0001, -0002
--   US6429367561   → tiene hijos -0001 a -0005
--   US1914457871   → tiene hijos -0001, -0002
--   US7623596432   → tiene hijos -0001, -0002
--   US1787344683   → tiene hijos -0001, -0002
--   US8830573846   → tiene hijo  -0001
-- ============================================================

BEGIN;

-- ─── 1. VERIFICACIÓN: qué se va a revertir ─────────────────
SELECT
    p.id,
    p.tracking_internal,
    REGEXP_REPLACE(UPPER(p.tracking_internal), '[^A-Z0-9]', '', 'g') AS tracking_norm,
    p.status,
    p.client_paid,
    p.payment_status,
    p.saldo_pendiente,
    p.monto_pagado,
    p.assigned_cost_mxn,
    p.delivered_at,
    u.full_name AS cliente,
    u.box_id    AS casillero
FROM packages p
JOIN users u ON u.id = p.user_id
WHERE
    (p.service_type = 'POBOX_USA' OR p.tracking_internal LIKE 'US-%')
    AND p.status = 'delivered'
    AND p.delivered_at >= '2026-05-21'
    AND REGEXP_REPLACE(UPPER(p.tracking_internal), '[^A-Z0-9]', '', 'g') IN (
        'US2233548888',
        'US0940622929',
        'US5185071749',
        'US5366391804',
        'US8998455434',
        'US6429367561',
        'US1914457871',
        'US7623596432',
        'US1787344683',
        'US8830573846'
    )
ORDER BY p.tracking_internal;

-- ─── 2. CONTEO ─────────────────────────────────────────────
SELECT COUNT(*) AS masters_a_revertir
FROM packages p
WHERE
    (p.service_type = 'POBOX_USA' OR p.tracking_internal LIKE 'US-%')
    AND p.status = 'delivered'
    AND p.delivered_at >= '2026-05-21'
    AND REGEXP_REPLACE(UPPER(p.tracking_internal), '[^A-Z0-9]', '', 'g') IN (
        'US2233548888','US0940622929','US5185071749','US5366391804','US8998455434',
        'US6429367561','US1914457871','US7623596432','US1787344683','US8830573846'
    );

-- ─── 3. ROLLBACK (descomentar cuando hayas visto el SELECT) ─
/*
UPDATE packages
SET
    status          = 'received_mty',
    client_paid     = FALSE,
    payment_status  = 'pending',
    saldo_pendiente = COALESCE(NULLIF(assigned_cost_mxn, 0), 0),
    monto_pagado    = 0,
    delivered_at    = NULL,
    updated_at      = CURRENT_TIMESTAMP
WHERE
    (service_type = 'POBOX_USA' OR tracking_internal LIKE 'US-%')
    AND status = 'delivered'
    AND delivered_at >= '2026-05-21'
    AND REGEXP_REPLACE(UPPER(tracking_internal), '[^A-Z0-9]', '', 'g') IN (
        'US2233548888','US0940622929','US5185071749','US5366391804','US8998455434',
        'US6429367561','US1914457871','US7623596432','US1787344683','US8830573846'
    );
*/

-- Si todo está bien: COMMIT. Si no: ROLLBACK.
ROLLBACK;  -- Cambia a COMMIT cuando estés listo.
