-- ============================================================
-- ACTUALIZACIÓN MASIVA POBOX USA – 2026-05-21
--
-- Objetivo: de los paquetes en status 'received_mty',
--   • Los de la lista KEEP_LIST → se quedan en received_mty
--   • Todos los demás (que no sean in_transit / received) → delivered + pagado
--
-- Ejecución segura: todo en una transacción.
-- Primero corre el SELECT de verificación, revisa el conteo,
-- y luego corre el bloque UPDATE + COMMIT.
-- ============================================================

BEGIN;

-- ─── 1. VERIFICACIÓN PREVIA ────────────────────────────────
-- Muestra cuántos paquetes se van a marcar como entregados.
-- Deberías ver ~104 filas (157 received_mty - 53 keep_list).
-- Revisa este resultado ANTES de correr el UPDATE.

SELECT
    p.id,
    p.tracking_internal,
    p.status,
    p.assigned_cost_mxn,
    p.saldo_pendiente,
    u.full_name  AS cliente,
    u.box_id     AS casillero
FROM packages p
JOIN users u ON u.id = p.user_id
WHERE
    (p.service_type IN ('POBOX_USA') OR p.tracking_internal LIKE 'US-%')
    AND p.status = 'received_mty'
    AND REGEXP_REPLACE(UPPER(p.tracking_internal), '[^A-Z0-9]', '', 'g') NOT IN (
        -- KEEP_LIST (normalizada: sin guiones, mayúsculas)
        'US22335488880004',
        'US8180874330',
        'US8304599002',
        'US09406229290007',
        'US09406229290012',
        'US09406229290010',
        'US09406229290008',
        'US51850717490001',
        'US09406229290003',
        'US09406229290011',
        'US6326414628',
        'US09406229290002',
        'US09406229290001',
        'US09406229290004',
        'US51850717490002',
        'US09406229290005',
        'US09406229290009',
        'US09406229290006',
        'US53663918040010',
        'US53663918040007',
        'US89984554340001',
        'US89984554340002',
        'US64293675610005',
        'US53663918040005',
        'US64293675610004',
        'US64293675610002',
        'US64293675610003',
        'US64293675610001',
        'US6969894613',
        'US2995145404',
        'US53663918040003',
        'US53663918040002',
        'US53663918040006',
        'US2216553888',
        'US53663918040001',
        'US53663918040004',
        'US53663918040008',
        'US53663918040009',
        'US1495375564',
        'US19144578710001',
        'US76235964320001',
        'US5952617792',
        'US19144578710002',
        'US17873446830001',
        'US5497822982',
        'US17873446830002',
        'US7677963608',
        'US76235964320002',
        'US7842909197',
        'US88305738460001'
    )
ORDER BY p.tracking_internal;

-- ─── 2. CONTEO RÁPIDO ──────────────────────────────────────
SELECT COUNT(*) AS total_a_entregar
FROM packages p
WHERE
    (p.service_type IN ('POBOX_USA') OR p.tracking_internal LIKE 'US-%')
    AND p.status = 'received_mty'
    AND REGEXP_REPLACE(UPPER(p.tracking_internal), '[^A-Z0-9]', '', 'g') NOT IN (
        'US22335488880004','US8180874330','US8304599002',
        'US09406229290007','US09406229290012','US09406229290010','US09406229290008',
        'US51850717490001','US09406229290003','US09406229290011','US6326414628',
        'US09406229290002','US09406229290001','US09406229290004','US51850717490002',
        'US09406229290005','US09406229290009','US09406229290006',
        'US53663918040010','US53663918040007','US89984554340001','US89984554340002',
        'US64293675610005','US53663918040005','US64293675610004','US64293675610002',
        'US64293675610003','US64293675610001','US6969894613','US2995145404',
        'US53663918040003','US53663918040002','US53663918040006','US2216553888',
        'US53663918040001','US53663918040004','US53663918040008','US53663918040009',
        'US1495375564','US19144578710001','US76235964320001','US5952617792',
        'US19144578710002','US17873446830001','US5497822982','US17873446830002',
        'US7677963608','US76235964320002','US7842909197','US88305738460001'
    );

-- ─── 3. UPDATE (ejecutar solo si el conteo es correcto) ────
-- Descomenta este bloque cuando hayas verificado el SELECT de arriba.

/*
UPDATE packages
SET
    status          = 'delivered',
    client_paid     = TRUE,
    payment_status  = 'paid',
    saldo_pendiente = 0,
    monto_pagado    = COALESCE(NULLIF(assigned_cost_mxn, 0), monto_pagado, 0),
    delivered_at    = CURRENT_TIMESTAMP,
    updated_at      = CURRENT_TIMESTAMP
WHERE
    (service_type IN ('POBOX_USA') OR tracking_internal LIKE 'US-%')
    AND status = 'received_mty'
    AND REGEXP_REPLACE(UPPER(tracking_internal), '[^A-Z0-9]', '', 'g') NOT IN (
        'US22335488880004','US8180874330','US8304599002',
        'US09406229290007','US09406229290012','US09406229290010','US09406229290008',
        'US51850717490001','US09406229290003','US09406229290011','US6326414628',
        'US09406229290002','US09406229290001','US09406229290004','US51850717490002',
        'US09406229290005','US09406229290009','US09406229290006',
        'US53663918040010','US53663918040007','US89984554340001','US89984554340002',
        'US64293675610005','US53663918040005','US64293675610004','US64293675610002',
        'US64293675610003','US64293675610001','US6969894613','US2995145404',
        'US53663918040003','US53663918040002','US53663918040006','US2216553888',
        'US53663918040001','US53663918040004','US53663918040008','US53663918040009',
        'US1495375564','US19144578710001','US76235964320001','US5952617792',
        'US19144578710002','US17873446830001','US5497822982','US17873446830002',
        'US7677963608','US76235964320002','US7842909197','US88305738460001'
    );
*/

-- Si todo está bien: COMMIT. Si algo falla o no cuadra: ROLLBACK.
ROLLBACK;  -- Cambia esto a COMMIT cuando estés listo para aplicar.
