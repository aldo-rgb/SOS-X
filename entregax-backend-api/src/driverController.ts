/**
 * Driver Controller - Controlador para la App del Repartidor
 * Maneja: Carga de unidad (Scan-to-Load), Retorno a bodega, Estado de ruta
 */

import { Request, Response } from 'express';
import { pool } from './db';

// Compatibilidad de esquema: algunos entornos no tienen tracking_number o tracking_provider.
// Con to_jsonb(p)->>'campo' evitamos errores SQL cuando el campo no existe.
// Aéreo China: la guía pública/impresa es la completa (child_no, p.ej.
// AIR2615662DJOtz-001), NO el código interno CN-...  Preferimos child_no solo
// cuando empieza con AIR para no afectar otros servicios.
const TRACKING_PUBLIC_SQL = `COALESCE(
    CASE WHEN to_jsonb(p)->>'child_no' ~* '^AIR' THEN to_jsonb(p)->>'child_no' END,
    to_jsonb(p)->>'tracking_number',
    to_jsonb(p)->>'tracking_internal',
    to_jsonb(p)->>'tracking_provider'
)`;

const TRACKING_MATCH_SQL = `(
    ${TRACKING_PUBLIC_SQL} = $1
    OR to_jsonb(p)->>'skydropx_label_id' = $1
    OR to_jsonb(p)->>'dhl_awb' = $1
    -- Aceptar tanto la guía completa (child_no AIR...) como el código interno
    -- (tracking_internal CN...) para no romper etiquetas viejas ya impresas.
    OR UPPER(COALESCE(to_jsonb(p)->>'child_no','')) = UPPER($1)
    OR UPPER(COALESCE(to_jsonb(p)->>'tracking_internal','')) = UPPER($1)
    OR REPLACE(UPPER(COALESCE(to_jsonb(p)->>'child_no','')), '-', '') = REPLACE(UPPER($1), '-', '')
    OR REPLACE(UPPER(COALESCE(to_jsonb(p)->>'tracking_internal','')), '-', '') = REPLACE(UPPER($1), '-', '')
    OR REPLACE(UPPER(${TRACKING_PUBLIC_SQL}), '-', '') = REPLACE(UPPER($1), '-', '')
    OR REPLACE(UPPER(COALESCE(to_jsonb(p)->>'skydropx_label_id', '')), '-', '') = REPLACE(UPPER($1), '-', '')
    OR REPLACE(UPPER(COALESCE(to_jsonb(p)->>'dhl_awb', '')), '-', '') = REPLACE(UPPER($1), '-', '')
    OR REGEXP_REPLACE(UPPER(${TRACKING_PUBLIC_SQL}), '-0+([0-9])', '-\\1', 'g')
       = REGEXP_REPLACE(UPPER($1), '-0+([0-9])', '-\\1', 'g')
)`;

const DELIVERY_STATUS_SQL = `COALESCE(
    to_jsonb(p)->>'delivery_status',
    to_jsonb(p)->>'status'
)`;

const ASSIGNED_DRIVER_SQL = `to_jsonb(p)->>'assigned_driver_id'`;
const PAYMENT_STATUS_SQL = `COALESCE(LOWER(to_jsonb(p)->>'payment_status'), 'paid')`;
const DELIVERY_ADDRESS_SQL = `COALESCE(to_jsonb(p)->>'delivery_address', to_jsonb(p)->>'destination_address')`;
const DELIVERY_CITY_SQL = `COALESCE(to_jsonb(p)->>'delivery_city', to_jsonb(p)->>'destination_city')`;
const DELIVERY_ZIP_SQL = `COALESCE(to_jsonb(p)->>'delivery_zip', to_jsonb(p)->>'destination_zip')`;
const RECIPIENT_NAME_SQL = `COALESCE(to_jsonb(p)->>'recipient_name', to_jsonb(p)->>'destination_contact')`;
const RECIPIENT_PHONE_SQL = `COALESCE(to_jsonb(p)->>'recipient_phone', to_jsonb(p)->>'destination_phone')`;
const CLIENT_NUMBER_SQL = `COALESCE(
    NULLIF(TRIM(to_jsonb(p)->>'client_code'), ''),
    NULLIF(TRIM(to_jsonb(p)->>'client_box_id'), ''),
    NULLIF(TRIM(to_jsonb(p)->>'box_id'), ''),
    NULLIF(TRIM(to_jsonb(p)->>'mailbox_number'), ''),
    NULLIF(TRIM(to_jsonb(p)->>'mailbox'), ''),
    NULLIF(TRIM(to_jsonb(u)->>'box_id'), '')
)`;
const REFERENCE_HINT_SQL = `COALESCE(
    NULLIF(TRIM(to_jsonb(p)->>'shipping_mark'), ''),
    NULLIF(TRIM(to_jsonb(p)->>'reference_code'), ''),
    NULLIF(TRIM(to_jsonb(p)->>'reference'), ''),
    NULLIF(TRIM(to_jsonb(p)->>'client_reference'), ''),
    NULLIF(TRIM(to_jsonb(p)->>'bl_client_code'), ''),
    NULLIF(TRIM(to_jsonb(m)->>'shipping_mark'), ''),
    NULLIF(TRIM(to_jsonb(m)->>'reference_code'), ''),
    NULLIF(TRIM(to_jsonb(m)->>'reference'), ''),
    NULLIF(TRIM(to_jsonb(m)->>'client_reference'), ''),
    NULLIF(TRIM(to_jsonb(m)->>'bl_client_code'), '')
)`;
const PACKAGE_GROUP_KEY_SQL = `COALESCE(
    NULLIF(to_jsonb(p)->>'master_id', ''),
    CONCAT('pkg-', p.id::text)
)`;
const NATIONAL_TRACKING_SQL = `COALESCE(
    to_jsonb(p)->>'national_tracking',
    to_jsonb(p)->>'skydropx_label_id',
    to_jsonb(p)->>'dhl_awb'
)`;
const NATIONAL_CARRIER_SQL = `COALESCE(
    to_jsonb(p)->>'national_carrier',
    to_jsonb(p)->>'carrier'
)`;
const LOADED_AT_SQL = `to_jsonb(p)->>'loaded_at'`;
const HAS_LABEL_SQL = `(
    to_jsonb(p)->>'national_label_url' IS NOT NULL
    OR to_jsonb(p)->>'national_tracking' IS NOT NULL
    OR to_jsonb(p)->>'skydropx_label_id' IS NOT NULL
    OR to_jsonb(p)->>'dhl_awb' IS NOT NULL
    OR EXISTS (SELECT 1 FROM package_documents pd WHERE pd.package_id = p.id AND pd.doc_type = 'guia_externa')
)`;

// Incluir: paquetes no-master, O masters sin hijos (standalone como US-1379808951 con PQTX)
const NOT_MASTER_WITH_CHILDREN_SQL = `(
    COALESCE((to_jsonb(p)->>'is_master')::boolean, false) = false
    OR NOT EXISTS (SELECT 1 FROM packages c WHERE c.master_id = p.id LIMIT 1)
)`;

let packageStatusColumnCache: 'delivery_status' | 'status' | null = null;
let packageBranchSqlCache: string | null = null;
const packageColumnsCache = new Set<string>();
let outForDeliveryWriteStatusCache: 'out_for_delivery' | 'in_transit' | null = null;
let inCedisWriteStatusCache: 'in_cedis' | 'received_mty' | null = null;
let sentWriteStatusCache: 'sent' | 'delivered' | null = null;
let pqtxShipmentsTableExistsCache: boolean | null = null;

// Cache de 10s para getDriverRouteToday — evita recalcular cuando el repartidor
// entra/sale de pantallas rápidamente (useFocusEffect dispara en cada foco).
const routeCache = new Map<string, { data: any; expiresAt: number }>();
const ROUTE_CACHE_TTL = 10_000; // 10 segundos

export const invalidateRouteCache = (driverId: number) => {
    for (const key of routeCache.keys()) {
        if (key.startsWith(`${driverId}:`)) routeCache.delete(key);
    }
};

interface LoadingFlags { requirePayment: boolean; requireLabel: boolean; requirePoboxInstructions: boolean; }
let loadingFlagsCache: LoadingFlags | null = null;
let loadingFlagsCacheAt: number | null = null;
const LOADING_FLAGS_TTL_MS = 15_000;

const getLoadingFlags = async (): Promise<LoadingFlags> => {
    const now = Date.now();
    if (loadingFlagsCache && loadingFlagsCacheAt && now - loadingFlagsCacheAt < LOADING_FLAGS_TTL_MS) {
        return loadingFlagsCache;
    }
    try {
        const r = await pool.query(
            `SELECT config_key, config_value FROM system_configurations
             WHERE config_key IN ('require_payment_to_load', 'require_label_to_load', 'require_instructions_to_load_pobox') AND is_active = TRUE`
        );
        const byKey: Record<string, any> = {};
        r.rows.forEach((row: any) => { byKey[row.config_key] = row.config_value; });
        loadingFlagsCache = {
            requirePayment:          byKey['require_payment_to_load']              !== undefined ? byKey['require_payment_to_load']?.enabled              !== false : true,
            requireLabel:            byKey['require_label_to_load']                !== undefined ? byKey['require_label_to_load']?.enabled                !== false : true,
            requirePoboxInstructions: byKey['require_instructions_to_load_pobox']  !== undefined ? byKey['require_instructions_to_load_pobox']?.enabled    === true  : false,
        };
        loadingFlagsCacheAt = now;
    } catch {
        loadingFlagsCache = { requirePayment: true, requireLabel: true, requirePoboxInstructions: false };
        loadingFlagsCacheAt = now;
    }
    return loadingFlagsCache;
};

const getPackageStatusColumn = async (): Promise<'delivery_status' | 'status'> => {
        if (packageStatusColumnCache) return packageStatusColumnCache;

        const result = await pool.query(
                `
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'packages'
                        AND column_name = 'delivery_status'
                    LIMIT 1
                `
        );

        packageStatusColumnCache = result.rows.length > 0 ? 'delivery_status' : 'status';
        return packageStatusColumnCache;
};

const hasPackageColumn = async (columnName: string): Promise<boolean> => {
        if (packageColumnsCache.has(columnName)) return true;

        const result = await pool.query(
                `
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'packages'
                        AND column_name = $1
                    LIMIT 1
                `,
                [columnName]
        );

        const exists = result.rows.length > 0;
        if (exists) packageColumnsCache.add(columnName);
        return exists;
};

    const hasPqtxShipmentsTable = async (): Promise<boolean> => {
        if (pqtxShipmentsTableExistsCache !== null) return pqtxShipmentsTableExistsCache;

        const result = await pool.query(
            `
                SELECT 1
                FROM information_schema.tables
                WHERE table_name = 'pqtx_shipments'
                LIMIT 1
            `
        );

        pqtxShipmentsTableExistsCache = result.rows.length > 0;
        return pqtxShipmentsTableExistsCache;
    };

    const getPaqueteExpressServiceRequestCode = async (nationalTracking: string | null | undefined): Promise<string | null> => {
        const tracking = String(nationalTracking || '').trim();
        if (!tracking) return null;

        const hasTable = await hasPqtxShipmentsTable();
        if (!hasTable) return null;

        try {
            const result = await pool.query(
                `
                    SELECT s.folio_porte
                    FROM pqtx_shipments s
                    WHERE UPPER(s.tracking_number) = UPPER($1)
                      AND COALESCE(s.folio_porte, '') <> ''
                    ORDER BY s.created_at DESC NULLS LAST, s.id DESC
                    LIMIT 1
                `,
                [tracking]
            );

            const rawCode = String(result.rows[0]?.folio_porte || '').trim();
            if (!rawCode) return null;

            const fromToken = rawCode.match(/([A-Z]{2,}\d[A-Z0-9]+)/i);
            const normalized = (fromToken?.[1] || rawCode)
                .replace(/\s+/g, '')
                .toUpperCase();

            return normalized || null;
        } catch (error) {
            console.warn('No se pudo obtener folio_porte desde pqtx_shipments:', error);
            return null;
        }
    };

const getOutForDeliveryWriteStatus = async (): Promise<'out_for_delivery' | 'in_transit'> => {
        const statusColumn = await getPackageStatusColumn();
        if (statusColumn === 'delivery_status') return 'out_for_delivery';

        if (outForDeliveryWriteStatusCache) return outForDeliveryWriteStatusCache;

        const result = await pool.query(
                `
                    SELECT 1
                    FROM pg_type t
                    JOIN pg_enum e ON e.enumtypid = t.oid
                    WHERE t.typname = 'package_status'
                        AND e.enumlabel = 'out_for_delivery'
                    LIMIT 1
                `
        );

        outForDeliveryWriteStatusCache = result.rows.length > 0 ? 'out_for_delivery' : 'in_transit';
        return outForDeliveryWriteStatusCache;
};

const getInCedisWriteStatus = async (): Promise<'in_cedis' | 'received_mty'> => {
        const statusColumn = await getPackageStatusColumn();
        if (statusColumn === 'delivery_status') return 'in_cedis';

        if (inCedisWriteStatusCache) return inCedisWriteStatusCache;

        const result = await pool.query(
                `
                    SELECT 1
                    FROM pg_type t
                    JOIN pg_enum e ON e.enumtypid = t.oid
                    WHERE t.typname = 'package_status'
                        AND e.enumlabel = 'in_cedis'
                    LIMIT 1
                `
        );

        inCedisWriteStatusCache = result.rows.length > 0 ? 'in_cedis' : 'received_mty';
        return inCedisWriteStatusCache;
};

    const getSentWriteStatus = async (): Promise<'shipped' | 'sent' | 'delivered'> => {
        const statusColumn = await getPackageStatusColumn();
        if (statusColumn === 'delivery_status') return 'shipped';

        if (sentWriteStatusCache) return sentWriteStatusCache as any;

        // Preferir 'shipped' (Enviado) sobre 'sent' o 'delivered'
        const result = await pool.query(
            `
                SELECT e.enumlabel
                FROM pg_type t
                JOIN pg_enum e ON e.enumtypid = t.oid
                WHERE t.typname = 'package_status'
                AND e.enumlabel IN ('shipped', 'sent', 'delivered')
                ORDER BY CASE e.enumlabel WHEN 'shipped' THEN 1 WHEN 'sent' THEN 2 ELSE 3 END
                LIMIT 1
            `
        );

        sentWriteStatusCache = result.rows[0]?.enumlabel || 'delivered';
        return sentWriteStatusCache as any;
    };

    const getPackageBranchSql = async (alias: string = 'p'): Promise<string> => {
        if (packageBranchSqlCache) {
            return packageBranchSqlCache.split('__ALIAS__').join(alias);
        }

        const result = await pool.query(
            `
              SELECT column_name
              FROM information_schema.columns
              WHERE table_name = 'packages'
                AND column_name IN ('current_branch_id', 'branch_id')
            `
        );

        const cols = new Set(result.rows.map((r: any) => r.column_name));

        if (cols.has('current_branch_id') && cols.has('branch_id')) {
            packageBranchSqlCache = 'COALESCE(__ALIAS__.current_branch_id, __ALIAS__.branch_id)';
        } else if (cols.has('current_branch_id')) {
            packageBranchSqlCache = '__ALIAS__.current_branch_id';
        } else if (cols.has('branch_id')) {
            packageBranchSqlCache = '__ALIAS__.branch_id';
        } else {
            packageBranchSqlCache = 'NULL::int';
        }

        return packageBranchSqlCache.split('__ALIAS__').join(alias);
    };

const getAuthUserId = (req: Request): number | null => {
    const rawId = (req as any).user?.id ?? (req as any).user?.userId;
    const id = Number(rawId);
    return Number.isFinite(id) && id > 0 ? id : null;
};

const getDriverBranchId = async (driverId: number): Promise<number | null> => {
    const userRes = await pool.query('SELECT branch_id FROM users WHERE id = $1', [driverId]);
    const branchId = Number(userRes.rows[0]?.branch_id);
    return Number.isFinite(branchId) && branchId > 0 ? branchId : null;
};

// ============================================================================
// SCAN TO LOAD - Escaneo para carga de unidad
// ============================================================================

/**
 * Escanear paquete para cargar a la unidad del chofer
 * Valida: existencia, asignación correcta, no duplicados
 */
export const scanPackageToLoad = async (req: Request, res: Response): Promise<any> => {
    let { barcode } = req.body;
    const driverId = getAuthUserId(req);

    if (!barcode) {
        return res.status(400).json({ error: '❌ Código de barras requerido.' });
    }

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    try {
        const packageBranchSql = await getPackageBranchSql('p');

        // Normalización flexible de cajas hijas: si viene `<MASTER>-<n>` (cualquier número de dígitos)
        // y existe una hija con `<MASTER>-<n a 4 dígitos>`, usar ese tracking. Esto evita falsos
        // "es MASTER" cuando el operador escribe `LOG26CNMX00077-001` en lugar de `-0001`.
        try {
            const original = String(barcode).trim();
            const m = original.match(/^(.+?)-(\d+)$/);
            if (m) {
                const prefix = m[1] as string;
                const rawSuffix = m[2] as string;
                const n = parseInt(rawSuffix, 10);
                // 1) Probar variantes con padding exacto (1-4 dígitos).
                if (rawSuffix.length <= 4) {
                    const padded = `${prefix}-${String(n).padStart(4, '0')}`;
                    if (padded.toUpperCase() !== original.toUpperCase()) {
                        const probe = await pool.query(
                            `SELECT 1 FROM packages WHERE UPPER(tracking_internal) = UPPER($1) LIMIT 1`,
                            [padded]
                        );
                        if (probe.rows.length > 0) {
                            barcode = padded;
                        }
                    }
                }
                // 2) Si seguimos sin match (sufijo largo o no había hija exacta),
                //    intentar LIKE: cualquier hija cuyo número empiece por lo
                //    tipeado. Cubre casos como "US-3180293332-000" (falta el
                //    último dígito) que debe resolver a "US-3180293332-0001".
                if (String(barcode).trim().toUpperCase() === original.toUpperCase()) {
                    const fuzzy = await pool.query(
                        `SELECT tracking_internal FROM packages
                         WHERE UPPER(tracking_internal) LIKE UPPER($1)
                         LIMIT 6`,
                        [`${prefix}-${rawSuffix}%`]
                    );
                    if (fuzzy.rows.length === 1) {
                        barcode = fuzzy.rows[0].tracking_internal;
                    } else if (fuzzy.rows.length > 1) {
                        return res.status(400).json({
                            error: `⚠️ Código truncado: hay ${fuzzy.rows.length}${fuzzy.rows.length >= 6 ? '+' : ''} cajas de "${prefix}" cuyo número empieza por "${rawSuffix}". Escanea el QR o captura el código completo manualmente.`,
                            barcode,
                            possibleMatches: fuzzy.rows.map((r: any) => r.tracking_internal),
                        });
                    }
                }
            }
        } catch {}

        // Recuperación del separador y del último dígito perdido por la pistola:
        // las pistolas de mano a veces (a) leen el barcode AIR/LOG/DHL completo
        // sin el guión separador y (b) en barcodes Code128/EAN se pierde el
        // último 0 de la secuencia. Caso real: el cliente escanea
        // "AIR2610265SCHJM040" pero al backend llega "AIR2610265SCHJM04".
        // Si el barcode no trae guión, separamos master + dígitos al final y
        // probamos varias variantes contra la DB en una sola query.
        try {
            const trk = String(barcode).trim().toUpperCase();
            if (!trk.includes('-')) {
                const m = trk.match(/^([A-Z]{2,3}[A-Z0-9]+?)(\d+)$/);
                if (m) {
                    const masterPrefix = m[1] as string;
                    const suffix = m[2] as string;
                    const num = parseInt(suffix, 10);
                    // Orden de prioridad: primero la hipótesis "se perdió un 0
                    // al final" (lo que más reporta la operación), luego las
                    // variantes con padding estándar.
                    const candidates = [
                        `${masterPrefix}-${suffix}0`,
                        `${masterPrefix}-${(suffix + '0').padStart(3, '0')}`,
                        `${masterPrefix}-${(suffix + '0').padStart(4, '0')}`,
                        `${masterPrefix}-${suffix}`,
                        `${masterPrefix}-${String(num).padStart(3, '0')}`,
                        `${masterPrefix}-${String(num).padStart(4, '0')}`,
                    ];
                    const uniq = [...new Set(candidates)];
                    const probe = await pool.query(
                        `SELECT tracking_internal FROM packages
                         WHERE UPPER(tracking_internal) = ANY($1::text[])
                         LIMIT 5`,
                        [uniq.map(c => c.toUpperCase())]
                    );
                    if (probe.rows.length === 1) {
                        barcode = probe.rows[0].tracking_internal;
                    } else if (probe.rows.length > 1) {
                        // Ambigüedad real (ej. existen tanto -004 como -040).
                        // Mejor pedir confirmación que adivinar mal.
                        return res.status(400).json({
                            error: '⚠️ Código truncado / ambiguo. Vuelve a escanear o ingresa el código completo manualmente.',
                            barcode,
                            possibleMatches: probe.rows.map((r: any) => r.tracking_internal),
                        });
                    } else {
                        // Las variantes exactas no matchearon. Caso peor: la
                        // pistola perdió 2+ dígitos finales. Buscamos por
                        // prefijo: cualquier hija que empiece por
                        // "<MASTER>-<digits parciales>". Si solo 1 hija
                        // calza, la usamos. Si hay varias, devolvemos la
                        // lista para que el operador confirme cuál.
                        const likePartials = [
                            `${masterPrefix}-${suffix}%`,
                            `${masterPrefix}-${suffix.replace(/^0+/, '')}%`,
                            `${masterPrefix}-0${suffix}%`,
                            `${masterPrefix}-00${suffix}%`,
                        ];
                        const fuzzy = await pool.query(
                            `SELECT tracking_internal FROM packages
                             WHERE UPPER(tracking_internal) LIKE ANY($1::text[])
                             LIMIT 6`,
                            [likePartials.map(p => p.toUpperCase())]
                        );
                        if (fuzzy.rows.length === 1) {
                            barcode = fuzzy.rows[0].tracking_internal;
                        } else if (fuzzy.rows.length > 1) {
                            return res.status(400).json({
                                error: `⚠️ Código truncado: hay ${fuzzy.rows.length}${fuzzy.rows.length >= 6 ? '+' : ''} cajas de "${masterPrefix}" cuyo número empieza por "${suffix}". Escanea el QR o captura el código completo manualmente.`,
                                barcode,
                                possibleMatches: fuzzy.rows.map((r: any) => r.tracking_internal),
                            });
                        } else if (suffix.length >= 5) {
                            // Caso peor: la pistola perdió el guion separador
                            // entre master y child (y posiblemente el último
                            // dígito). Ej.: tracking real
                            // "US-3180293332-0001" → escaneado como
                            // "US3180293332000" (falta guion y un dígito).
                            // Probamos varios puntos de corte:
                            //   prefix-<master_part>-<child_part>%
                            // donde master_part + child_part = suffix.
                            const splitPatterns: string[] = [];
                            for (let k = Math.max(4, suffix.length - 6); k <= suffix.length - 1; k++) {
                                const masterPart = suffix.slice(0, k);
                                const childPart = suffix.slice(k);
                                splitPatterns.push(`${masterPrefix}-${masterPart}-${childPart}%`);
                            }
                            if (splitPatterns.length > 0) {
                                const splitRes = await pool.query(
                                    `SELECT tracking_internal FROM packages
                                     WHERE UPPER(tracking_internal) LIKE ANY($1::text[])
                                     LIMIT 6`,
                                    [splitPatterns.map(p => p.toUpperCase())]
                                );
                                if (splitRes.rows.length === 1) {
                                    barcode = splitRes.rows[0].tracking_internal;
                                } else if (splitRes.rows.length > 1) {
                                    return res.status(400).json({
                                        error: `⚠️ Código truncado / ambiguo: hay ${splitRes.rows.length}${splitRes.rows.length >= 6 ? '+' : ''} posibles cajas. Escanea el QR o captura el código completo manualmente.`,
                                        barcode,
                                        possibleMatches: splitRes.rows.map((r: any) => r.tracking_internal),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        } catch {}

        // 1. BUSCAR EL PAQUETE POR TRACKING NUMBER O CÓDIGO DE BARRAS
        // Hacemos LEFT JOIN con master para que las hijas hereden payment/label del master.
        const pkgRes = await pool.query(`
            SELECT 
                p.id, 
                ${TRACKING_PUBLIC_SQL} as tracking_number,
                COALESCE((to_jsonb(p)->>'is_master')::boolean, false) as is_master,
                (to_jsonb(p)->>'master_id')::int as master_id,
                (SELECT COUNT(*) FROM packages c WHERE (to_jsonb(c)->>'master_id')::int = p.id) as children_count,
                ${ASSIGNED_DRIVER_SQL} as assigned_driver_id,
                -- Para carga: si delivery_status TEXT dice 'delivered' pero el ENUM status
                -- dice un estado cargable (received_mty, etc.), el ENUM es más reciente.
                -- Usamos el ENUM cuando delivery_status dice 'delivered' para evitar falsos bloqueos.
                CASE
                    WHEN COALESCE(to_jsonb(p)->>'delivery_status','') = 'delivered'
                     AND to_jsonb(p)->>'status' NOT IN ('', 'delivered', 'sent', 'shipped')
                    THEN to_jsonb(p)->>'status'
                    ELSE ${DELIVERY_STATUS_SQL}
                END as delivery_status,
                ${LOADED_AT_SQL} as loaded_at,
                -- Si el MASTER está pagado, las hijas heredan 'paid' (aunque su propio
                -- payment_status haya quedado en 'pending' por desincronización).
                CASE
                    WHEN LOWER(COALESCE(to_jsonb(m)->>'payment_status','')) = 'paid' THEN 'paid'
                    ELSE COALESCE(LOWER(to_jsonb(p)->>'payment_status'), 'pending')
                END as payment_status,
                COALESCE(to_jsonb(p)->>'national_label_url', to_jsonb(m)->>'national_label_url') as national_label_url,
                COALESCE(to_jsonb(p)->>'national_tracking', to_jsonb(m)->>'national_tracking') as national_tracking,
                COALESCE(to_jsonb(p)->>'skydropx_label_id', to_jsonb(m)->>'skydropx_label_id') as skydropx_label_id,
                COALESCE(to_jsonb(p)->>'dhl_awb', to_jsonb(m)->>'dhl_awb') as dhl_awb,
                COALESCE(to_jsonb(p)->>'national_carrier', to_jsonb(p)->>'carrier', to_jsonb(m)->>'national_carrier', to_jsonb(m)->>'carrier') as national_carrier,
                COALESCE(to_jsonb(p)->>'assigned_address_id', to_jsonb(m)->>'assigned_address_id') as assigned_address_id,
                ${packageBranchSql} as package_branch_id,
                NULL::text as driver_name,
                NULL::text as client_name,
                NULL::text as client_email
            FROM packages p
            LEFT JOIN packages m ON m.id = (to_jsonb(p)->>'master_id')::int
            WHERE ${TRACKING_MATCH_SQL}
        `, [barcode]);

        if (pkgRes.rows.length === 0) {
            return res.status(404).json({ 
                error: '❌ Código no encontrado en el sistema.',
                barcode 
            });
        }

        const pkg = pkgRes.rows[0];

        // 1.b RECHAZAR MASTER: el master es lógico, no es una caja física.
        // El chofer debe escanear cada hija (caja real).
        const isMaster = pkg.is_master === true || (Number(pkg.children_count) > 0 && !pkg.master_id);
        if (isMaster) {
            const cc = Number(pkg.children_count) || 0;
            return res.status(400).json({
                error: `📦 Este es un MASTER (${cc} cajas). Escanea cada caja física con el sufijo -0001 a -${String(cc).padStart(4, '0')}.`,
                isMaster: true,
                childrenCount: cc,
                expectedSuffixRange: cc > 0 ? `${pkg.tracking_number}-0001 a ${pkg.tracking_number}-${String(cc).padStart(4, '0')}` : null,
                barcode
            });
        }

        const isPaid = String(pkg.payment_status || '').toLowerCase() === 'paid';
        const carrierLower = String(pkg.national_carrier || '').toLowerCase();
        const isLocalDelivery = carrierLower.includes('entregax') || carrierLower.includes('local') || carrierLower.includes('pick up') || carrierLower.includes('pickup');
        const hasInstructions = Boolean(pkg.assigned_address_id);
        // Etiqueta IMPRESA:
        // - Para paqueterías externas (DHL, Skydropx, Paquete Express, etc.) se
        //   requiere uno de los campos generados al comprar la guía (URL de
        //   etiqueta / número de guía nacional / id Skydropx / AWB DHL).
        // - Para entregas locales (EntregaX Local / Pickup) NO existe una guía
        //   de courier externo; nuestra propia etiqueta interna se imprime en
        //   la bodega junto con las instrucciones de entrega. Por tanto, en
        //   ese flujo la presencia de `assigned_address_id` (instrucciones
        //   asignadas) implica que la etiqueta interna ya fue generada.
        const hasExternalLabel = Boolean(
            pkg.national_label_url ||
            pkg.national_tracking ||
            pkg.skydropx_label_id ||
            pkg.dhl_awb
        );
        const hasPrintedLabel = hasExternalLabel || (isLocalDelivery && hasInstructions);

        const { requirePayment, requireLabel } = await getLoadingFlags();
        if ((requirePayment && !isPaid) || (requireLabel && !hasPrintedLabel)) {
            const missing: string[] = [];
            if (requirePayment && !isPaid) missing.push('pago del cliente');
            if (requireLabel && !hasPrintedLabel) {
                missing.push(hasInstructions ? 'etiqueta impresa (la guía tiene instrucciones pero aún no se imprimió la etiqueta)' : 'instrucciones de entrega y etiqueta');
            }
            const summary = `${isPaid ? '✅' : '❌'} Pago · ${hasPrintedLabel ? '✅' : '❌'} Etiqueta impresa · ${hasInstructions ? '✅' : '❌'} Instrucciones`;
            return res.status(400).json({
                error: `⚠️ Falta: ${missing.join(' y ')}. ${summary}.`,
                paymentStatus: pkg.payment_status || 'pending',
                isPaid,
                hasPrintedLabel,
                hasInstructions,
                missing,
                nationalCarrier: pkg.national_carrier || null,
                isLocalDelivery,
                barcode
            });
        }

        // 2. REGLA DE SEGURIDAD: ¿Le toca a este chofer?
        if (pkg.assigned_driver_id && Number(pkg.assigned_driver_id) !== driverId) {
            // Obtener nombre del chofer asignado para el mensaje
            const assignedDriverName = pkg.driver_name || 'otro chofer';
            return res.status(403).json({ 
                error: `⛔ ALTO: Este paquete está asignado a ${assignedDriverName}. Devuélvelo a bodega.`,
                assignedTo: assignedDriverName,
                barcode
            });
        }

        // Si no está asignado, permitirlo solo si pertenece a la sucursal del chofer
        if (!pkg.assigned_driver_id) {
            const driverBranchId = await getDriverBranchId(driverId);
            if (!driverBranchId || Number(pkg.package_branch_id) !== driverBranchId) {
                return res.status(403).json({
                    error: '⛔ Este paquete no pertenece a tu sucursal asignada.',
                    barcode
                });
            }
        }

        // 3. REGLA DE DUPLICIDAD: ¿Ya lo había escaneado?
        if (pkg.delivery_status === 'out_for_delivery' && pkg.loaded_at) {
            return res.status(400).json({ 
                error: '⚠️ Este paquete ya está cargado en tu unidad.',
                loadedAt: pkg.loaded_at,
                barcode
            });
        }

        // 4. VALIDAR QUE EL PAQUETE ESTÉ EN ESTADO CORRECTO PARA CARGAR
        const validStatusesToLoad = ['received', 'in_cedis', 'ready_for_pickup', 'ready_pickup', 'assigned', 'received_mty', 'received_cdmx', 'received_cdx', 'received_partial', 'inspected', 'pending_inspection', 'returned_to_warehouse'];
        if (!validStatusesToLoad.includes(pkg.delivery_status) && pkg.delivery_status !== 'out_for_delivery') {
            // Incluir contexto completo: si llegó hasta aquí ya pasó las
            // validaciones de pagado/etiquetado, así que el bloqueo es
            // por estado del paquete (no por falta de pago/etiqueta).
            // Aún así devolvemos paid/hasLabel para que el chofer vea
            // que esos requisitos sí están cubiertos y entienda que el
            // problema es otro (estado en bodega no apto para cargar).
            return res.status(400).json({
                error: `⚠️ Este paquete no puede cargarse aún. Estado en bodega: ${pkg.delivery_status}. ✅ Pago: pagado · ✅ Etiqueta: lista.`,
                currentStatus: pkg.delivery_status,
                paymentStatus: pkg.payment_status,
                isPaid: true,
                hasLabel: true,
                hint: 'El paquete está pagado y etiquetado, pero su estado actual no permite cargarlo. Pide a almacén que lo libere (pase a "received" / "ready_pickup").',
                barcode
            });
        }

        // 5. MARCAR COMO CARGADO (OUT FOR DELIVERY)
        const statusColumn = await getPackageStatusColumn();
        const outForDeliveryStatus = await getOutForDeliveryWriteStatus();
        const hasAssignedDriverColumn = await hasPackageColumn('assigned_driver_id');
        const hasLoadedAtColumn = await hasPackageColumn('loaded_at');

        const setParts: string[] = [`${statusColumn} = '${outForDeliveryStatus}'`, 'updated_at = NOW()'];
        const values: any[] = [pkg.id];

        if (hasAssignedDriverColumn) {
            values.push(driverId);
            setParts.push(`assigned_driver_id = COALESCE(assigned_driver_id, $${values.length})`);
        }

        if (hasLoadedAtColumn) {
            setParts.push('loaded_at = NOW()');
        }

        // Auto-detectar vehículo desde la inspección de hoy del chofer
        const hasLoadedVehicleColumn = await hasPackageColumn('loaded_vehicle_id');
        if (hasLoadedVehicleColumn) {
            try {
                const inspRes = await pool.query(`
                    SELECT dvi.vehicle_id FROM daily_vehicle_inspections dvi
                    WHERE dvi.driver_id = $1
                      AND dvi.created_at >= NOW() AT TIME ZONE 'America/Monterrey' - INTERVAL '20 hours'
                    ORDER BY dvi.created_at DESC
                    LIMIT 1
                `, [driverId]);
                if (inspRes.rows[0]?.vehicle_id) {
                    values.push(inspRes.rows[0].vehicle_id);
                    setParts.push(`loaded_vehicle_id = $${values.length}`);
                }
            } catch { /* no crítico */ }
        }

        await pool.query(
            `UPDATE packages SET ${setParts.join(', ')} WHERE id = $1`,
            values
        );

        // 5.b PROPAGAR AL MASTER: si este paquete es hijo, marcar el master como
        // out_for_delivery también para que el cliente lo vea "En Ruta" en la app.
        if (pkg.master_id) {
            try {
                await pool.query(
                    `UPDATE packages SET ${statusColumn} = '${outForDeliveryStatus}', updated_at = NOW() WHERE id = $1`,
                    [pkg.master_id]
                );
            } catch (propErr) {
                console.warn('No se pudo propagar out_for_delivery al master:', propErr);
            }
        }

        // 6. REGISTRAR EN HISTORIAL DE PAQUETE
        try {
            await pool.query(`
                INSERT INTO package_history (package_id, status, notes, created_by, created_at)
                VALUES ($1, 'out_for_delivery', 'Paquete cargado en unidad de reparto', $2, NOW())
            `, [pkg.id, driverId]);
        } catch (historyError) {
            console.warn('No se pudo registrar package_history en scanPackageToLoad:', historyError);
        }

        // TODO: Enviar notificación al cliente
        // await sendPushNotification(pkg.client_id, '🚚 En Camino', 'Tu paquete ha sido cargado en la unidad de reparto.');

        invalidateRouteCache(driverId);
        return res.json({
            success: true,
            message: '✅ Paquete cargado correctamente.',
            package: {
                id: pkg.id,
                trackingNumber: pkg.tracking_number,
                clientName: pkg.client_name
            }
        });

    } catch (error) {
        console.error('Error en scanPackageToLoad:', error);
        res.status(500).json({ error: 'Error al procesar la carga.' });
    }
};

// ============================================================================
// ROUTE INFO - Información de la ruta del día
// ============================================================================

/**
 * Obtener resumen de la ruta del chofer para hoy
 * Incluye: total asignados, cargados, entregados, pendientes
 */
export const getDriverRouteToday = async (req: Request, res: Response): Promise<any> => {
    const driverId = getAuthUserId(req);

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    try {
        const driverBranchId = await getDriverBranchId(driverId);
        // ── Cache de 10s para evitar recalcular en cada useFocusEffect ──────────
        const cacheKey = `${driverId}:${driverBranchId || 'none'}`;
        const cached = routeCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return res.json(cached.data);
        }
        const packageBranchSql = await getPackageBranchSql('p');
        const hasAssignedDriverColumn = await hasPackageColumn('assigned_driver_id');

        // Si el repartidor tiene sucursal, mostrar paquetes listos de su CEDIS
        // (pagados + etiquetados) tal como se ve en panel de etiquetado.
        // IMPORTANTE: excluimos masters (no son cajas físicas). Las hijas heredan
        // payment/label/carrier del master via LEFT JOIN.
        const { requirePayment: reqPay, requireLabel: reqLabel, requirePoboxInstructions: reqPobox } = await getLoadingFlags();
        const paymentWhereClause = reqPay ? `AND (
                        LOWER(COALESCE(to_jsonb(p)->>'payment_status', '')) = 'paid'
                     OR LOWER(COALESCE(to_jsonb(m)->>'payment_status', '')) = 'paid'
                  )` : '';
        const labelWhereClause = reqLabel ? `AND (
                        to_jsonb(p)->>'national_label_url' IS NOT NULL
                     OR to_jsonb(p)->>'national_tracking' IS NOT NULL
                     OR to_jsonb(p)->>'skydropx_label_id' IS NOT NULL
                     OR to_jsonb(p)->>'dhl_awb' IS NOT NULL
                     OR to_jsonb(m)->>'national_label_url' IS NOT NULL
                     OR to_jsonb(m)->>'national_tracking' IS NOT NULL
                     OR to_jsonb(m)->>'skydropx_label_id' IS NOT NULL
                     OR to_jsonb(m)->>'dhl_awb' IS NOT NULL
                  )` : '';
        const pendingPromise = driverBranchId
            ? pool.query(`
                SELECT
                    p.id,
                    ${TRACKING_PUBLIC_SQL} as tracking_number,
                    ${DELIVERY_STATUS_SQL} as delivery_status,
                    ${DELIVERY_ADDRESS_SQL} as delivery_address,
                    ${DELIVERY_CITY_SQL} as delivery_city,
                    ${DELIVERY_ZIP_SQL} as delivery_zip,
                    ${RECIPIENT_NAME_SQL} as recipient_name,
                    ${RECIPIENT_PHONE_SQL} as recipient_phone,
                    COALESCE(p.national_carrier, m.national_carrier) as national_carrier,
                    COALESCE(p.assigned_address_id, m.assigned_address_id) as assigned_address_id,
                    (${HAS_LABEL_SQL}
                     OR (m.id IS NOT NULL AND (
                         to_jsonb(m)->>'national_label_url' IS NOT NULL
                         OR to_jsonb(m)->>'national_tracking' IS NOT NULL
                         OR EXISTS (SELECT 1 FROM package_documents pd WHERE pd.package_id = m.id AND pd.doc_type = 'guia_externa')
                     ))
                    ) as has_label,
                    ${CLIENT_NUMBER_SQL} as client_number,
                    ${REFERENCE_HINT_SQL} as reference_hint,
                    ROW_NUMBER() OVER (PARTITION BY ${PACKAGE_GROUP_KEY_SQL} ORDER BY p.created_at ASC, p.id ASC) as box_number,
                    COUNT(*) OVER (PARTITION BY ${PACKAGE_GROUP_KEY_SQL}) as total_boxes
                FROM packages p
                LEFT JOIN packages m ON m.id = (to_jsonb(p)->>'master_id')::int
                LEFT JOIN users u ON u.id::text = COALESCE(NULLIF(to_jsonb(p)->>'user_id', ''), NULLIF(to_jsonb(m)->>'user_id', ''))
                WHERE ${packageBranchSql} = $1
                  AND ${NOT_MASTER_WITH_CHILDREN_SQL}
                  AND ${DELIVERY_STATUS_SQL} IN ('received', 'in_cedis', 'ready_for_pickup', 'ready_pickup', 'assigned', 'received_mty', 'received_cdmx', 'received_cdx', 'received_partial', 'inspected', 'pending_inspection', 'returned_to_warehouse')
                  AND COALESCE(to_jsonb(p)->>'status', '') NOT IN ('delivered', 'shipped', 'sent')
                  ${paymentWhereClause}
                ORDER BY p.updated_at ASC NULLS LAST, p.created_at ASC
            `, [driverBranchId])
            : pool.query(`
                SELECT
                    p.id,
                    ${TRACKING_PUBLIC_SQL} as tracking_number,
                    ${DELIVERY_STATUS_SQL} as delivery_status,
                    ${DELIVERY_ADDRESS_SQL} as delivery_address,
                    ${DELIVERY_CITY_SQL} as delivery_city,
                    ${DELIVERY_ZIP_SQL} as delivery_zip,
                    ${RECIPIENT_NAME_SQL} as recipient_name,
                    ${RECIPIENT_PHONE_SQL} as recipient_phone,
                    COALESCE(p.national_carrier, m.national_carrier) as national_carrier,
                    COALESCE(p.assigned_address_id, m.assigned_address_id) as assigned_address_id,
                    (${HAS_LABEL_SQL}
                     OR (m.id IS NOT NULL AND (
                         to_jsonb(m)->>'national_label_url' IS NOT NULL
                         OR to_jsonb(m)->>'national_tracking' IS NOT NULL
                         OR EXISTS (SELECT 1 FROM package_documents pd WHERE pd.package_id = m.id AND pd.doc_type = 'guia_externa')
                     ))
                    ) as has_label,
                    ${CLIENT_NUMBER_SQL} as client_number,
                    ${REFERENCE_HINT_SQL} as reference_hint,
                    ROW_NUMBER() OVER (PARTITION BY ${PACKAGE_GROUP_KEY_SQL} ORDER BY p.created_at ASC, p.id ASC) as box_number,
                    COUNT(*) OVER (PARTITION BY ${PACKAGE_GROUP_KEY_SQL}) as total_boxes
                FROM packages p
                LEFT JOIN packages m ON m.id = (to_jsonb(p)->>'master_id')::int
                                LEFT JOIN users u ON u.id::text = COALESCE(NULLIF(to_jsonb(p)->>'user_id', ''), NULLIF(to_jsonb(m)->>'user_id', ''))
                WHERE ${ASSIGNED_DRIVER_SQL} = $1::text
                  AND ${NOT_MASTER_WITH_CHILDREN_SQL}
                  AND ${DELIVERY_STATUS_SQL} IN ('received', 'in_cedis', 'ready_for_pickup', 'ready_pickup', 'assigned', 'received_mty', 'received_cdmx', 'received_cdx', 'received_partial', 'inspected', 'pending_inspection', 'returned_to_warehouse')
                  AND COALESCE(to_jsonb(p)->>'status', '') NOT IN ('delivered', 'shipped', 'sent')
                ORDER BY p.created_at ASC
            `, [driverId]);

        // Obtener lista de paquetes ya cargados (out for delivery)
        const loadedPromise = hasAssignedDriverColumn
            ? pool.query(`
                SELECT 
                    p.id,
                    ${TRACKING_PUBLIC_SQL} as tracking_number,
                    ${DELIVERY_STATUS_SQL} as delivery_status,
                    ${DELIVERY_ADDRESS_SQL} as delivery_address,
                    ${DELIVERY_CITY_SQL} as delivery_city,
                    ${DELIVERY_ZIP_SQL} as delivery_zip,
                    ${RECIPIENT_NAME_SQL} as recipient_name,
                    ${RECIPIENT_PHONE_SQL} as recipient_phone,
                    ${LOADED_AT_SQL} as loaded_at,
                    ${NATIONAL_TRACKING_SQL} as national_tracking,
                    COALESCE(p.national_carrier, m.national_carrier) as national_carrier,
                    ${CLIENT_NUMBER_SQL} as client_number,
                    ${REFERENCE_HINT_SQL} as reference_hint,
                    ROW_NUMBER() OVER (PARTITION BY ${PACKAGE_GROUP_KEY_SQL} ORDER BY p.created_at ASC, p.id ASC) as box_number,
                    COUNT(*) OVER (PARTITION BY ${PACKAGE_GROUP_KEY_SQL}) as total_boxes
                FROM packages p
                LEFT JOIN packages m ON m.id = (to_jsonb(p)->>'master_id')::int
                                LEFT JOIN users u ON u.id::text = COALESCE(NULLIF(to_jsonb(p)->>'user_id', ''), NULLIF(to_jsonb(m)->>'user_id', ''))
                WHERE (
                    ${ASSIGNED_DRIVER_SQL} = $1::text
                    OR (${ASSIGNED_DRIVER_SQL} IS NULL
                        AND p.updated_at >= NOW() - INTERVAL '7 days')
                )
                  AND ${DELIVERY_STATUS_SQL} = 'out_for_delivery'
                  AND ${NOT_MASTER_WITH_CHILDREN_SQL}
                ORDER BY p.updated_at ASC, p.created_at ASC
            `, [driverId])
            : driverBranchId
                ? pool.query(`
                    SELECT
                        p.id,
                        ${TRACKING_PUBLIC_SQL} as tracking_number,
                        ${DELIVERY_STATUS_SQL} as delivery_status,
                        ${DELIVERY_ADDRESS_SQL} as delivery_address,
                        ${DELIVERY_CITY_SQL} as delivery_city,
                        ${DELIVERY_ZIP_SQL} as delivery_zip,
                        ${RECIPIENT_NAME_SQL} as recipient_name,
                        ${RECIPIENT_PHONE_SQL} as recipient_phone,
                        ${LOADED_AT_SQL} as loaded_at,
                        ${NATIONAL_TRACKING_SQL} as national_tracking,
                        COALESCE(p.national_carrier, m.national_carrier) as national_carrier,
                        ${CLIENT_NUMBER_SQL} as client_number,
                        ${REFERENCE_HINT_SQL} as reference_hint,
                        ROW_NUMBER() OVER (PARTITION BY ${PACKAGE_GROUP_KEY_SQL} ORDER BY p.created_at ASC, p.id ASC) as box_number,
                        COUNT(*) OVER (PARTITION BY ${PACKAGE_GROUP_KEY_SQL}) as total_boxes
                    FROM packages p
                    LEFT JOIN packages m ON m.id = (to_jsonb(p)->>'master_id')::int
                                        LEFT JOIN users u ON u.id::text = COALESCE(NULLIF(to_jsonb(p)->>'user_id', ''), NULLIF(to_jsonb(m)->>'user_id', ''))
                    WHERE ${packageBranchSql} = $1
                      AND ${DELIVERY_STATUS_SQL} = 'out_for_delivery'
                      AND ${NOT_MASTER_WITH_CHILDREN_SQL}
                    ORDER BY p.updated_at ASC, p.created_at ASC
                `, [driverBranchId])
                : Promise.resolve({ rows: [] as any[] });

        // CLIENT_NUMBER_SQL usa alias 'u' — no disponible aquí, usar fallback sin 'u'
        const CLIENT_NUMBER_NO_USER_SQL = `COALESCE(
            NULLIF(TRIM(to_jsonb(p)->>'client_code'), ''),
            NULLIF(TRIM(to_jsonb(p)->>'client_box_id'), ''),
            NULLIF(TRIM(to_jsonb(p)->>'box_id'), ''),
            NULLIF(TRIM(to_jsonb(p)->>'mailbox_number'), ''),
            NULLIF(TRIM(to_jsonb(p)->>'mailbox'), '')
        )`;
        const DELIVERED_SELECT = `
            SELECT p.id, ${TRACKING_PUBLIC_SQL} as tracking_number,
                ${DELIVERY_STATUS_SQL} as delivery_status,
                ${DELIVERY_ADDRESS_SQL} as delivery_address,
                ${DELIVERY_CITY_SQL} as delivery_city,
                ${RECIPIENT_NAME_SQL} as recipient_name,
                COALESCE(p.national_carrier, m.national_carrier) as national_carrier,
                ${CLIENT_NUMBER_NO_USER_SQL} as client_number,
                p.updated_at
            FROM packages p
            LEFT JOIN packages m ON m.id = (to_jsonb(p)->>'master_id')::int
        `;
        const deliveredPromise = hasAssignedDriverColumn
            ? pool.query(`${DELIVERED_SELECT}
                WHERE to_jsonb(p)->>'assigned_driver_id' = $1::text
                    AND ${DELIVERY_STATUS_SQL} IN ('delivered', 'sent', 'shipped')
                    AND DATE(p.updated_at) = CURRENT_DATE
                    AND COALESCE((to_jsonb(p)->>'is_master')::boolean, false) = false
                ORDER BY p.updated_at DESC
            `, [driverId])
            : driverBranchId
                ? pool.query(`${DELIVERED_SELECT}
                    WHERE ${packageBranchSql} = $1
                        AND ${DELIVERY_STATUS_SQL} IN ('delivered', 'sent', 'shipped')
                        AND DATE(p.updated_at) = CURRENT_DATE
                        AND COALESCE((to_jsonb(p)->>'is_master')::boolean, false) = false
                    ORDER BY p.updated_at DESC
                `, [driverBranchId])
                : Promise.resolve({ rows: [] as any[] });

        // DHL: incluir para drivers de sucursal MTY o drivers con assigned_driver_id
        // (sistema opera actualmente solo en Monterrey — ampliar con city filter si se expande)
        const isMtyBranch = driverBranchId != null
            ? await pool.query(
                `SELECT 1 FROM branches WHERE id = $1 AND city ILIKE '%monterrey%'`,
                [driverBranchId]
              ).then(r => r.rows.length > 0).catch(() => false)
            : hasAssignedDriverColumn; // si usa assigned_driver_id es driver MTY

        // Query DHL shipments pendientes de entrega local MTY (solo sucursales MTY)
        const dhlPendingPromise = isMtyBranch
            ? pool.query(`
                SELECT
                    'DHL-' || ds.id::text AS id,
                    COALESCE(NULLIF(ds.secondary_tracking,''), ds.inbound_tracking) AS tracking_number,
                    ds.inbound_tracking AS national_tracking,
                    COALESCE(NULLIF(ds.national_carrier, ''), 'DHL') AS national_carrier,
                    ds.status AS delivery_status,
                    COALESCE(
                        a.street || ' ' || a.exterior_number,
                        'Pendiente de asignar'
                    ) AS delivery_address,
                    COALESCE(a.city, 'MTY') AS delivery_city,
                    a.zip_code AS delivery_zip,
                    u.full_name AS recipient_name,
                    u.phone AS recipient_phone,
                    ds.box_id AS client_number,
                    true AS is_dhl_shipment,
                    ds.delivery_address_id AS assigned_address_id,
                    (ds.national_tracking IS NOT NULL OR ds.national_label_url IS NOT NULL) AS has_label
                FROM dhl_shipments ds
                LEFT JOIN users u ON u.id = ds.user_id
                LEFT JOIN addresses a ON a.id = ds.delivery_address_id
                WHERE ds.status = 'received_mty'
                ORDER BY ds.created_at ASC
            `)
            : Promise.resolve({ rows: [] as any[] });

        // Ejecutar las 4 queries en paralelo
        const [pendingRes, loadedRes, deliveredTodayRes, dhlPendingRes] = await Promise.all([
            pendingPromise, loadedPromise, deliveredPromise, dhlPendingPromise
        ]);

        // Combinar pendientes regulares + DHL pendientes
        const allPendingRows = [...pendingRes.rows, ...dhlPendingRes.rows];

        const deliveredToday = deliveredTodayRes.rows.length;

                const isLocalCarrier = (carrier: string) => {
                    const c = String(carrier || '').toLowerCase();
                    return !c || c.includes('local') || c.includes('entregax') || c.includes('pickup') || c.includes('pick up') || c.includes('bodega');
                };
                const isPoBox = (p: any) => /^US-/i.test(String(p.tracking_number || ''));

                // Requerir Instrucciones Asignadas (solo PO Box): ocultar US- sin assigned_address_id
                const visiblePending = reqPobox
                    ? allPendingRows.filter(p => !isPoBox(p) || !!p.assigned_address_id)
                    : allPendingRows;

                // pendingToLoad = paquetes locales visibles con etiqueta impresa (Requerir Etiqueta Impresa)
                const pendingToLoad = reqLabel
                    ? visiblePending.filter(p => p.has_label && isLocalCarrier(String(p.national_carrier || ''))).length
                    : visiblePending.filter(p => isLocalCarrier(String(p.national_carrier || ''))).length;
                const loadedToday = loadedRes.rows.length;
                const totalAssigned = pendingToLoad + loadedToday + deliveredToday;
                const outStatus = await getOutForDeliveryWriteStatus();
                const allPkgs = [...pendingRes.rows, ...loadedRes.rows];
                // paqueteriaCount = paquetes con carrier externo que el front
                // REALMENTE muestra. Debe aplicar el mismo gate de etiqueta que
                // DriverHomeScreen (si requiere etiqueta y no la tiene y no está
                // cargado, no se muestra) para que el número del card cuadre con
                // los grupos del modal.
                const paqueteriaCount = allPkgs.filter(p => {
                    const carrier = p.national_carrier || '';
                    if (!(carrier && !isLocalCarrier(carrier))) return false;
                    const isLoaded = String(p.delivery_status || '').includes('out_for_delivery')
                                  || String(p.delivery_status || '').includes('in_transit');
                    if (!isLoaded && reqLabel && !p.has_label) return false;
                    return true;
                }).length;

        const payload = {
            success: true,
            route: {
                totalAssigned, loadedToday, deliveredToday,
                pendingToLoad, paqueteriaCount, requireLabelToLoad: reqLabel, requirePoboxInstructions: reqPobox,
                pendingPackages: visiblePending,
                loadedPackages: loadedRes.rows,
                deliveredPackages: deliveredTodayRes.rows,
            },
        };
        routeCache.set(cacheKey, { data: payload, expiresAt: Date.now() + ROUTE_CACHE_TTL });
        return res.json(payload);

    } catch (error) {
        console.error('Error en getDriverRouteToday:', error);
        res.status(500).json({ error: 'Error al obtener información de ruta.' });
    }
};

// ============================================================================
// RETURN TO WAREHOUSE - Escaneo de retorno a bodega
// ============================================================================

/**
 * Escanear paquete al regresar a bodega (no entregado)
 * Devuelve el paquete al inventario del CEDIS
 */
export const scanPackageReturn = async (req: Request, res: Response): Promise<any> => {
    const { barcode, returnReason } = req.body;
    const driverId = getAuthUserId(req);

    if (!barcode) {
        return res.status(400).json({ error: '❌ Código de barras requerido.' });
    }

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    // Razones válidas de retorno
    const validReasons = [
        'client_not_home',      // Cliente no estaba
        'wrong_address',        // Dirección incorrecta
        'client_refused',       // Cliente rechazó
        'damaged_package',      // Paquete dañado
        'reschedule_requested', // Reprogramación solicitada
        'access_denied',        // No se pudo acceder
        'other'                 // Otro
    ];

    const reason = returnReason || 'client_not_home';

    try {
        const packageBranchSql = await getPackageBranchSql('p');

        // 1. BUSCAR EL PAQUETE
        const pkgRes = await pool.query(`
            SELECT 
                p.id, 
                ${TRACKING_PUBLIC_SQL} as tracking_number,
                ${ASSIGNED_DRIVER_SQL} as assigned_driver_id,
                ${DELIVERY_STATUS_SQL} as delivery_status,
                ${packageBranchSql} as package_branch_id
            FROM packages p
            WHERE ${TRACKING_MATCH_SQL}
        `, [barcode]);

        if (pkgRes.rows.length === 0) {
            return res.status(404).json({ 
                error: '❌ Código no encontrado en el sistema.',
                barcode 
            });
        }

        const pkg = pkgRes.rows[0];

        // 2. VALIDAR QUE SEA DEL CHOFER QUE LO TENÍA
        if (pkg.assigned_driver_id && Number(pkg.assigned_driver_id) !== driverId) {
            return res.status(403).json({ 
                error: '⛔ Este paquete no estaba asignado a ti.',
                barcode
            });
        }

        if (!pkg.assigned_driver_id) {
            const driverBranchId = await getDriverBranchId(driverId);
            if (!driverBranchId || Number(pkg.package_branch_id) !== driverBranchId) {
                return res.status(403).json({
                    error: '⛔ Este paquete no pertenece a tu sucursal asignada.',
                    barcode
                });
            }
        }

        // 3. VALIDAR QUE ESTABA EN RUTA
        if (pkg.delivery_status !== 'out_for_delivery') {
            return res.status(400).json({ 
                error: `⚠️ Este paquete no estaba en ruta. Estado: ${pkg.delivery_status}`,
                currentStatus: pkg.delivery_status,
                barcode
            });
        }

        // 4. DEVOLVER A BODEGA
        const statusColumn = await getPackageStatusColumn();
        const returnStatus = 'returned_to_warehouse';
        const hasLoadedAtColumn = await hasPackageColumn('loaded_at');
        const hasReturnReasonColumn = await hasPackageColumn('return_reason');
        const hasReturnCountColumn = await hasPackageColumn('return_count');

        const setParts: string[] = [`${statusColumn} = '${returnStatus}'`, 'updated_at = NOW()'];
        const values: any[] = [pkg.id];

        if (hasLoadedAtColumn) {
            setParts.push('loaded_at = NULL');
        }

        if (hasReturnReasonColumn) {
            values.push(reason);
            setParts.push(`return_reason = $${values.length}`);
        }

        if (hasReturnCountColumn) {
            setParts.push('return_count = COALESCE(return_count, 0) + 1');
        }

        await pool.query(
            `UPDATE packages SET ${setParts.join(', ')} WHERE id = $1`,
            values
        );

        // 5. REGISTRAR EN HISTORIAL
        const reasonLabels: Record<string, string> = {
            'client_not_home': 'Cliente no estaba en domicilio',
            'wrong_address': 'Dirección incorrecta o no encontrada',
            'client_refused': 'Cliente rechazó el paquete',
            'damaged_package': 'Paquete dañado',
            'reschedule_requested': 'Cliente solicitó reprogramación',
            'access_denied': 'No se pudo acceder al domicilio',
            'other': 'Otro motivo'
        };

        try {
            await pool.query(`
                INSERT INTO package_history (package_id, status, notes, created_by, created_at)
                VALUES ($1, 'returned_to_warehouse', $2, $3, NOW())
            `, [pkg.id, `Retornado a CEDIS: ${reasonLabels[reason] || reason}`, driverId]);
        } catch (historyError) {
            console.warn('No se pudo registrar package_history en scanPackageReturn:', historyError);
        }

        return res.json({ 
            success: true, 
            message: '✅ Paquete devuelto a bodega correctamente.',
            package: {
                id: pkg.id,
                trackingNumber: pkg.tracking_number,
                returnReason: reason,
                reasonLabel: reasonLabels[reason] || reason
            }
        });

    } catch (error) {
        console.error('Error en scanPackageReturn:', error);
        res.status(500).json({ error: 'Error al procesar el retorno.' });
    }
};

/**
 * Obtener resumen de paquetes a retornar
 * Lista todos los paquetes que el chofer tiene como out_for_delivery
 */
export const getPackagesToReturn = async (req: Request, res: Response): Promise<any> => {
    const driverId = getAuthUserId(req);

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    try {
        const hasAssignedDriverColumn = await hasPackageColumn('assigned_driver_id');
        const driverBranchId = await getDriverBranchId(driverId);
        const packageBranchSql = await getPackageBranchSql('p');

        const packagesRes = hasAssignedDriverColumn
            ? await pool.query(`
                SELECT 
                    p.id,
                    ${TRACKING_PUBLIC_SQL} as tracking_number,
                    ${DELIVERY_ADDRESS_SQL} as delivery_address,
                    ${DELIVERY_CITY_SQL} as delivery_city,
                    ${RECIPIENT_NAME_SQL} as recipient_name,
                    ${LOADED_AT_SQL} as loaded_at
                FROM packages p
                WHERE ${ASSIGNED_DRIVER_SQL} = $1::text
                    AND ${DELIVERY_STATUS_SQL} = 'out_for_delivery'
                    AND COALESCE((to_jsonb(p)->>'is_master')::boolean, false) = false
                ORDER BY p.updated_at ASC, p.created_at ASC
            `, [driverId])
            : driverBranchId
                ? await pool.query(`
                    SELECT 
                        p.id,
                        ${TRACKING_PUBLIC_SQL} as tracking_number,
                        ${DELIVERY_ADDRESS_SQL} as delivery_address,
                        ${DELIVERY_CITY_SQL} as delivery_city,
                        ${RECIPIENT_NAME_SQL} as recipient_name,
                        ${LOADED_AT_SQL} as loaded_at
                    FROM packages p
                    WHERE ${packageBranchSql} = $1
                        AND ${DELIVERY_STATUS_SQL} = 'out_for_delivery'
                        AND COALESCE((to_jsonb(p)->>'is_master')::boolean, false) = false
                    ORDER BY p.updated_at ASC, p.created_at ASC
                `, [driverBranchId])
                : { rows: [] as any[] };

        return res.json({
            success: true,
            totalToReturn: packagesRes.rows.length,
            packages: packagesRes.rows
        });

    } catch (error) {
        console.error('Error en getPackagesToReturn:', error);
        res.status(500).json({ error: 'Error al obtener paquetes pendientes.' });
    }
};

// ============================================================================
// DELIVERY CONFIRMATION - Confirmar entrega
// ============================================================================

/**
 * Confirmar entrega de un paquete
 * Incluye: firma digital, foto de evidencia
 */
export const confirmDelivery = async (req: Request, res: Response): Promise<any> => {
    const { barcode, signatureBase64, photoBase64, recipientName, notes } = req.body;
    const driverId = getAuthUserId(req);
    const recipientNameTrimmed = String(recipientName || '').trim();

    if (!barcode) {
        return res.status(400).json({ error: '❌ Código de barras requerido.' });
    }

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    try {
        const packageBranchSql = await getPackageBranchSql('p');

        // 1. BUSCAR EL PAQUETE (con herencia de master para hijas)
        const pkgRes = await pool.query(`
            SELECT 
                p.id, 
                ${TRACKING_PUBLIC_SQL} as tracking_number,
                ${ASSIGNED_DRIVER_SQL} as assigned_driver_id,
                ${DELIVERY_STATUS_SQL} as delivery_status,
                ${packageBranchSql} as package_branch_id,
                COALESCE(
                    to_jsonb(p)->>'national_tracking',
                    to_jsonb(p)->>'skydropx_label_id',
                    to_jsonb(p)->>'dhl_awb',
                    to_jsonb(m)->>'national_tracking',
                    to_jsonb(m)->>'skydropx_label_id',
                    to_jsonb(m)->>'dhl_awb'
                ) as national_tracking,
                COALESCE(
                    to_jsonb(p)->>'national_carrier',
                    to_jsonb(p)->>'carrier',
                    to_jsonb(m)->>'national_carrier',
                    to_jsonb(m)->>'carrier'
                ) as national_carrier,
                p.user_id,
                p.tracking_internal,
                p.service_type
            FROM packages p
            LEFT JOIN packages m ON m.id = (to_jsonb(p)->>'master_id')::int
            WHERE ${TRACKING_MATCH_SQL}
        `, [barcode]);

        if (pkgRes.rows.length === 0) {
            return res.status(404).json({ 
                error: '❌ Código no encontrado.',
                barcode 
            });
        }

        const pkg = pkgRes.rows[0];
        const nationalCarrier = String(pkg.national_carrier || '').toLowerCase();
        const isEntregaLocal = nationalCarrier.includes('entregax') || nationalCarrier.includes('local');
        const requiresCarrierGuideScan = !!pkg.national_tracking && !isEntregaLocal;

        if (!requiresCarrierGuideScan && !recipientNameTrimmed) {
            return res.status(400).json({ error: '❌ El nombre de quien recibe es obligatorio.' });
        }

        // 2. VALIDAR ASIGNACIÓN
        if (pkg.assigned_driver_id && Number(pkg.assigned_driver_id) !== driverId) {
            return res.status(403).json({ 
                error: '⛔ Este paquete no está asignado a ti.',
                barcode
            });
        }

        if (!pkg.assigned_driver_id) {
            const driverBranchId = await getDriverBranchId(driverId);
            if (!driverBranchId || Number(pkg.package_branch_id) !== driverBranchId) {
                return res.status(403).json({
                    error: '⛔ Este paquete no pertenece a tu sucursal asignada.',
                    barcode
                });
            }
        }

        // 3. VALIDAR ESTADO — idempotente: si ya está entregado, retornar 200 (sync offline)
        if (['delivered', 'sent', 'shipped'].includes(pkg.delivery_status)) {
            return res.json({
                success: true,
                message: '✅ Entrega ya registrada anteriormente (sync offline).',
                package: { id: pkg.id, trackingNumber: pkg.tracking_number, deliveredAt: new Date().toISOString() },
            });
        }
        if (pkg.delivery_status !== 'out_for_delivery') {
            return res.status(400).json({
                error: `⚠️ Este paquete no está en ruta. Estado: ${pkg.delivery_status}`,
                barcode
            });
        }

        // 4. MARCAR COMO ENTREGADO (compatible con esquema legacy)
        // Para paquetería externa usar 'sent' cuando el esquema lo soporte; en legacy usar 'delivered'.
        const finalStatus = requiresCarrierGuideScan
            ? await getSentWriteStatus()
            : 'delivered';
        const statusColumn = await getPackageStatusColumn();
        // Si ambas columnas existen (esquema actual: enum `status` + legacy `delivery_status`),
        // actualizamos las dos. El enum `status` es la fuente de verdad que lee el frontend
        // y demás módulos; `delivery_status` se conserva por compatibilidad con código legacy.
        const hasEnumStatusColumn = statusColumn !== 'status' ? await hasPackageColumn('status') : false;
        const hasDeliveredAtColumn = await hasPackageColumn('delivered_at');
        const hasDeliverySignatureColumn = await hasPackageColumn('delivery_signature');
        const hasDeliveryPhotoColumn = await hasPackageColumn('delivery_photo');
        const hasDeliveryRecipientNameColumn = await hasPackageColumn('delivery_recipient_name');
        const hasDeliveryNotesColumn = await hasPackageColumn('delivery_notes');

        const setParts: string[] = [`${statusColumn} = '${finalStatus}'`, 'updated_at = NOW()'];
        if (hasEnumStatusColumn) {
            setParts.push(`status = '${finalStatus}'`);
        }
        const values: any[] = [pkg.id];

        if (hasDeliveredAtColumn) {
            setParts.push('delivered_at = NOW()');
        }

        // Asegurar que el driver_id quede asignado al paquete entregado
        const hasAssignedDriverColumnConfirm = await hasPackageColumn('assigned_driver_id');
        if (hasAssignedDriverColumnConfirm) {
            values.push(driverId);
            setParts.push(`assigned_driver_id = COALESCE(assigned_driver_id, $${values.length})`);
        }

        if (hasDeliverySignatureColumn && signatureBase64) {
            values.push(signatureBase64);
            setParts.push(`delivery_signature = $${values.length}`);
        }

        if (hasDeliveryPhotoColumn && photoBase64) {
            values.push(photoBase64);
            setParts.push(`delivery_photo = $${values.length}`);
        }

        if (hasDeliveryRecipientNameColumn && recipientNameTrimmed) {
            values.push(recipientNameTrimmed);
            setParts.push(`delivery_recipient_name = $${values.length}`);
        }

        if (hasDeliveryNotesColumn && notes) {
            values.push(notes);
            setParts.push(`delivery_notes = $${values.length}`);
        }

        await pool.query(
            `UPDATE packages SET ${setParts.join(', ')} WHERE id = $1`,
            values
        );

        // 4.b PROPAGAR AL MASTER: si todas las hijas están entregadas, marcar el master también.
        try {
            const masterRes = await pool.query(
                `SELECT (to_jsonb(p)->>'master_id')::int as master_id FROM packages p WHERE p.id = $1`,
                [pkg.id]
            );
            const masterId = masterRes.rows[0]?.master_id;
            if (masterId) {
                const childRes = await pool.query(
                    `SELECT 
                        COUNT(*) as total,
                        SUM(CASE WHEN COALESCE(${statusColumn}::text, '') IN ('delivered', 'sent') THEN 1 ELSE 0 END) as done
                     FROM packages p 
                     WHERE (to_jsonb(p)->>'master_id')::int = $1`,
                    [masterId]
                );
                const total = Number(childRes.rows[0]?.total || 0);
                const done = Number(childRes.rows[0]?.done || 0);
                // Regla: master se marca entregado en cuanto AL MENOS 1 hija esté entregada.
                // Los detalles individuales conservan su propio status.
                if (total > 0 && done >= 1) {
                    const masterSet = hasEnumStatusColumn
                        ? `${statusColumn} = '${finalStatus}', status = '${finalStatus}'`
                        : `${statusColumn} = '${finalStatus}'`;
                    await pool.query(
                        `UPDATE packages SET ${masterSet}, updated_at = NOW() WHERE id = $1`,
                        [masterId]
                    );
                }
            }
        } catch (propErr) {
            console.warn('No se pudo propagar entrega al master:', propErr);
        }

        // 5. REGISTRAR EN HISTORIAL
        try {
            const historyNote = requiresCarrierGuideScan
                ? `Entrega validada con guía de paquetería: ${pkg.national_tracking}. ${notes || ''}`
                : `Entregado a: ${recipientNameTrimmed}. ${notes || ''}`;

            await pool.query(`
                INSERT INTO package_history (package_id, status, notes, created_by, created_at)
                VALUES ($1, $2, $3, $4, NOW())
            `, [pkg.id, finalStatus, historyNote, driverId]);
        } catch (historyError) {
            console.warn('No se pudo registrar package_history en confirmDelivery:', historyError);
        }

        // Notificar al cliente (fire-and-forget, no bloquea la respuesta)
        if (finalStatus === 'delivered' && pkg.user_id) {
            const svcLabels: Record<string, string> = { POBOX_USA: 'PO Box USA', AIR_CHN_MX: 'Aéreo China', SEA_CHN_MX: 'Marítimo China', AA_DHL: 'DHL' };
            const svcLabel = svcLabels[pkg.service_type] || pkg.service_type || 'EntregaX';
            const svcKey = pkg.service_type === 'POBOX_USA' ? 'notif_pobox'
                : pkg.service_type === 'AIR_CHN_MX' ? 'notif_air'
                : pkg.service_type === 'SEA_CHN_MX' ? 'notif_maritime'
                : pkg.service_type === 'AA_DHL' ? 'notif_dhl'
                : 'notif_push';
            pool.query(
                `SELECT u.notif_push, u.notif_whatsapp, u.${svcKey} AS notif_service,
                        u.phone, u.phone_verified, u.whatsapp_verified, u.full_name
                 FROM users u WHERE u.id = $1`,
                [pkg.user_id]
            ).then(async (prefRow: any) => {
                const prefs = prefRow.rows[0] || {};
                const notifTitle = `🎉 ¡Paquete entregado! · ${svcLabel}`;
                const notifBody = `Tu paquete ${pkg.tracking_internal} ha sido entregado exitosamente.`;
                const notifData = { screen: 'Home', tracking: pkg.tracking_internal };
                const { createCustomNotification } = await import('./notificationController');
                await createCustomNotification(pkg.user_id, notifTitle, notifBody, 'success', 'package', notifData);
                if (prefs.notif_push !== false && prefs.notif_service !== false) {
                    const { sendPushToUsers } = await import('./pushService');
                    await sendPushToUsers([pkg.user_id], { title: notifTitle, body: notifBody, data: notifData });
                }
                if (prefs.notif_whatsapp !== false && (prefs.phone_verified === true || prefs.whatsapp_verified === true) && prefs.notif_service !== false && prefs.phone) {
                    const { sendTemplate } = await import('./whatsappService').catch(() => ({ sendTemplate: undefined })) as any;
                    if (typeof sendTemplate === 'function') {
                        const firstName = (prefs.full_name || '').split(' ')[0] || 'Cliente';
                        await sendTemplate({
                            to: prefs.phone,
                            template: process.env.WHATSAPP_PACKAGE_DELIVERED_TEMPLATE || 'paquete_entregado',
                            languageCode: 'es_MX',
                            parameters: [firstName, pkg.tracking_internal],
                        }).catch(() => {});
                    }
                }
            }).catch((e: any) => console.warn('[notif] delivered notify failed:', e?.message));
        }

        invalidateRouteCache(driverId);
        return res.json({
            success: true,
            message: '✅ Entrega confirmada exitosamente.',
            package: {
                id: pkg.id,
                trackingNumber: pkg.tracking_number,
                deliveredAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error en confirmDelivery:', error);
        res.status(500).json({ error: 'Error al confirmar entrega.' });
    }
};

/**
 * Confirmar entrega múltiple (multi-piece o Paquete Express)
 * Recibe array de {internalGuide, carrierGuide} y actualiza packages.
 * Para entrega local marca como 'delivered'; para carrier externo como 'sent'.
 */
export const confirmDeliveryBulk = async (req: Request, res: Response): Promise<any> => {
    const { packages, photoBase64, signatureBase64, recipientName, notes } = req.body;
    const driverId = getAuthUserId(req);
    const recipientNameTrimmed = String(recipientName || '').trim();

    if (!packages || !Array.isArray(packages) || packages.length === 0) {
        return res.status(400).json({ error: '❌ Se requiere al menos un paquete.' });
    }

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    try {
        const confirmed = [];
        const errors = [];
        const statusColumn = await getPackageStatusColumn();
        const sentStatus = await getSentWriteStatus();
        // Si ambas columnas existen (esquema actual: enum `status` + legacy `delivery_status`),
        // actualizamos las dos. El enum `status` es la fuente de verdad que lee el frontend.
        const hasEnumStatusColumnBulk = statusColumn !== 'status' ? await hasPackageColumn('status') : false;
        const hasDeliveredAtColumn = await hasPackageColumn('delivered_at');
        const hasDeliveryPhotoColumn = await hasPackageColumn('delivery_photo');
        const hasDeliverySignatureColumn = await hasPackageColumn('delivery_signature');
        const hasDeliveryRecipientNameColumn = await hasPackageColumn('delivery_recipient_name');
        const hasDeliveryNotesColumn = await hasPackageColumn('delivery_notes');
        const hasNationalTrackingColumn = await hasPackageColumn('national_tracking');
        const hasAssignedDriverColumnBulk = await hasPackageColumn('assigned_driver_id');

        for (const pkg of packages) {
            const { internalGuide, carrierGuide, selectedCarrierName } = pkg;

            if (!internalGuide) {
                errors.push('Guía interna requerida');
                continue;
            }

            try {
                console.log(`📦 [BULK] Procesando: internal="${internalGuide}" carrier="${carrierGuide || 'N/A'}"`);
                // Buscar paquete por guía interna (incluyendo carrier para decidir status)
                const pkgRes = await pool.query(`
                    SELECT
                        p.id,
                        p.${statusColumn} as status,
                        p.user_id,
                        p.tracking_internal,
                        p.service_type,
                        COALESCE(
                            to_jsonb(p)->>'national_carrier',
                            to_jsonb(p)->>'carrier',
                            to_jsonb(m)->>'national_carrier',
                            to_jsonb(m)->>'carrier'
                        ) as national_carrier,
                        COALESCE(
                            to_jsonb(p)->>'national_tracking',
                            to_jsonb(m)->>'national_tracking'
                        ) as national_tracking
                    FROM packages p
                    LEFT JOIN packages m ON m.id = (to_jsonb(p)->>'master_id')::int
                    WHERE ${TRACKING_MATCH_SQL}
                    LIMIT 1
                `, [internalGuide]);

                if (pkgRes.rows.length === 0) {
                    console.warn(`⚠️ [BULK] Paquete NO encontrado: "${internalGuide}"`);
                    errors.push(`Paquete ${internalGuide} no encontrado`);
                    continue;
                }

                const row = pkgRes.rows[0];
                const packageId = row.id;
                const carrierLower = String(row.national_carrier || '').toLowerCase();
                const isLocalDelivery = carrierLower.includes('entregax') || carrierLower.includes('local') || carrierLower.includes('pick up') || carrierLower.includes('pickup');
                // selectedCarrierName = paquetería elegida por el repartidor en el selector
                const hasExternalDelivery = !!carrierGuide || !!selectedCarrierName || !!row.national_tracking;
                const finalStatus = (!isLocalDelivery && hasExternalDelivery) ? sentStatus : 'delivered';

                console.log(`✅ [BULK] Paquete ID=${packageId} carrier="${row.national_carrier || selectedCarrierName || 'local'}" status=${row.status} → '${finalStatus}'`);

                // Construir UPDATE dinámicamente
                const setParts: string[] = [`${statusColumn} = '${finalStatus}'`, 'updated_at = NOW()'];
                if (hasEnumStatusColumnBulk) {
                    setParts.push(`status = '${finalStatus}'`);
                }
                const values: any[] = [packageId];

                // Si el repartidor seleccionó una paquetería y el paquete no tenía una asignada, guardarla
                const hasNationalCarrierColumn = await hasPackageColumn('national_carrier');
                if (selectedCarrierName && hasNationalCarrierColumn && !row.national_carrier) {
                    values.push(selectedCarrierName);
                    setParts.push(`national_carrier = $${values.length}`);
                }

                // Actualizar con guía del carrier si está presente
                if (carrierGuide && hasNationalTrackingColumn) {
                    values.push(carrierGuide);
                    setParts.push(`national_tracking = $${values.length}`);
                }

                if (hasDeliveredAtColumn) {
                    setParts.push('delivered_at = NOW()');
                }

                // Asegurar que el driver_id quede asignado al paquete entregado
                if (hasAssignedDriverColumnBulk) {
                    values.push(driverId);
                    setParts.push(`assigned_driver_id = COALESCE(assigned_driver_id, $${values.length})`);
                }

                if (hasDeliveryPhotoColumn && photoBase64) {
                    values.push(photoBase64);
                    setParts.push(`delivery_photo = $${values.length}`);
                }

                if (hasDeliverySignatureColumn && signatureBase64) {
                    values.push(signatureBase64);
                    setParts.push(`delivery_signature = $${values.length}`);
                }

                if (hasDeliveryRecipientNameColumn && recipientNameTrimmed) {
                    values.push(recipientNameTrimmed);
                    setParts.push(`delivery_recipient_name = $${values.length}`);
                }

                if (hasDeliveryNotesColumn && notes) {
                    values.push(notes);
                    setParts.push(`delivery_notes = $${values.length}`);
                }

                // Ejecutar UPDATE
                await pool.query(
                    `UPDATE packages SET ${setParts.join(', ')} WHERE id = $1`,
                    values
                );

                // Propagar al MASTER si todas las hijas ya están entregadas
                try {
                    const mres = await pool.query(
                        `SELECT (to_jsonb(p)->>'master_id')::int as master_id FROM packages p WHERE p.id = $1`,
                        [packageId]
                    );
                    const masterId = mres.rows[0]?.master_id;
                    if (masterId) {
                        const cres = await pool.query(
                            `SELECT 
                                COUNT(*) as total,
                                SUM(CASE WHEN COALESCE(${statusColumn}::text, '') IN ('delivered', 'sent') THEN 1 ELSE 0 END) as done
                             FROM packages p WHERE (to_jsonb(p)->>'master_id')::int = $1`,
                            [masterId]
                        );
                        const total = Number(cres.rows[0]?.total || 0);
                        const done = Number(cres.rows[0]?.done || 0);
                        // Regla: master entregado en cuanto AL MENOS 1 hija esté entregada.
                        if (total > 0 && done >= 1) {
                            await pool.query(
                                `UPDATE packages SET ${statusColumn} = '${finalStatus}', updated_at = NOW() WHERE id = $1`,
                                [masterId]
                            );
                        }
                    }
                } catch (propErr) {
                    console.warn('[BULK] No se pudo propagar al master:', propErr);
                }

                // Registrar en historial
                try {
                    const histNote = finalStatus === 'delivered'
                        ? `Entregado a: ${recipientNameTrimmed || 'sin nombre'}. ${notes || ''}`
                        : `Enviado con guía ${carrierGuide || row.national_tracking || 'desconocida'}. ${notes || ''}`;
                    await pool.query(`
                        INSERT INTO package_history (package_id, status, notes, created_by, created_at)
                        VALUES ($1, $2, $3, $4, NOW())
                    `, [packageId, finalStatus, histNote, driverId]);
                } catch (historyError) {
                    console.warn('No se pudo registrar package_history:', historyError);
                }

                confirmed.push(internalGuide);

                // Notificar al cliente (fire-and-forget)
                if (finalStatus === 'delivered' && row.user_id) {
                    const svcLabels: Record<string, string> = { POBOX_USA: 'PO Box USA', AIR_CHN_MX: 'Aéreo China', SEA_CHN_MX: 'Marítimo China', AA_DHL: 'DHL' };
                    const svcLabel = svcLabels[row.service_type] || row.service_type || 'EntregaX';
                    const svcKey = row.service_type === 'POBOX_USA' ? 'notif_pobox'
                        : row.service_type === 'AIR_CHN_MX' ? 'notif_air'
                        : row.service_type === 'SEA_CHN_MX' ? 'notif_maritime'
                        : row.service_type === 'AA_DHL' ? 'notif_dhl'
                        : 'notif_push';
                    pool.query(
                        `SELECT u.notif_push, u.notif_whatsapp, u.${svcKey} AS notif_service,
                                u.phone, u.phone_verified, u.whatsapp_verified, u.full_name
                         FROM users u WHERE u.id = $1`,
                        [row.user_id]
                    ).then(async (prefRow: any) => {
                        const prefs = prefRow.rows[0] || {};
                        const notifTitle = `🎉 ¡Paquete entregado! · ${svcLabel}`;
                        const notifBody = `Tu paquete ${row.tracking_internal} ha sido entregado exitosamente.`;
                        const notifData = { screen: 'Home', tracking: row.tracking_internal };
                        const { createCustomNotification } = await import('./notificationController');
                        await createCustomNotification(row.user_id, notifTitle, notifBody, 'success', 'package', notifData);
                        if (prefs.notif_push !== false && prefs.notif_service !== false) {
                            const { sendPushToUsers } = await import('./pushService');
                            await sendPushToUsers([row.user_id], { title: notifTitle, body: notifBody, data: notifData });
                        }
                        if (prefs.notif_whatsapp !== false && (prefs.phone_verified === true || prefs.whatsapp_verified === true) && prefs.notif_service !== false && prefs.phone) {
                            const { sendTemplate } = await import('./whatsappService').catch(() => ({ sendTemplate: undefined })) as any;
                            if (typeof sendTemplate === 'function') {
                                const firstName = (prefs.full_name || '').split(' ')[0] || 'Cliente';
                                await sendTemplate({
                                    to: prefs.phone,
                                    template: process.env.WHATSAPP_PACKAGE_DELIVERED_TEMPLATE || 'paquete_entregado',
                                    languageCode: 'es_MX',
                                    parameters: [firstName, row.tracking_internal],
                                }).catch(() => {});
                            }
                        }
                    }).catch((e: any) => console.warn('[notif] bulk delivered notify failed:', e?.message));
                }
            } catch (pkgError) {
                console.error(`Error procesando ${internalGuide}:`, pkgError);
                errors.push(`Error en ${internalGuide}: ${(pkgError as Error).message}`);
            }
        }

        if (confirmed.length === 0) {
            return res.status(400).json({ 
                error: `❌ No se pudieron procesar los paquetes: ${errors.join(', ')}`,
                details: errors
            });
        }

        res.json({
            success: true,
            message: `✅ ${confirmed.length} paquete(s) procesado(s)`,
            confirmed,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('Error en confirmDeliveryBulk:', error);
        res.status(500).json({ error: 'Error al confirmar entregas múltiples.' });
    }
};

/**
 * Obtener historial de entregas del día
 */
export const getDeliveriesToday = async (req: Request, res: Response): Promise<any> => {
    const driverId = getAuthUserId(req);

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    try {
        const deliveriesRes = await pool.query(`
            SELECT 
                                p.id,
                                ${TRACKING_PUBLIC_SQL} as tracking_number,
                                p.delivery_address,
                                p.delivery_city,
                                p.recipient_name,
                                p.delivery_recipient_name,
                                p.delivered_at
                        FROM packages p
                        WHERE p.assigned_driver_id = $1 
                            AND ${DELIVERY_STATUS_SQL} = 'delivered'
                            AND DATE(p.delivered_at) = CURRENT_DATE
                        ORDER BY p.delivered_at DESC
        `, [driverId]);

        return res.json({
            success: true,
            totalDelivered: deliveriesRes.rows.length,
            deliveries: deliveriesRes.rows
        });

    } catch (error) {
        console.error('Error en getDeliveriesToday:', error);
        res.status(500).json({ error: 'Error al obtener entregas.' });
    }
};

// ============================================================================
// VERIFY PACKAGE - Verificar paquete para entrega
// ============================================================================

/**
 * Verificar que un paquete existe y está asignado al repartidor
 * Se usa antes de iniciar el proceso de confirmación de entrega
 */
export const verifyPackageForDelivery = async (req: Request, res: Response): Promise<any> => {
    const { barcode } = req.params;
    const driverId = getAuthUserId(req);

    if (!barcode) return res.status(400).json({ error: '❌ Código de barras requerido.' });
    if (!driverId) return res.status(401).json({ error: '❌ Sesión no válida.' });

    try {
        // Preparar variantes del código — normalizadas en JS (rápido) antes de ir a la DB
        const barcodeUpper = String(barcode).toUpperCase().trim();
        const barcodeNoHyphens = barcodeUpper.replace(/-/g, '');
        const barcodeNormalized = barcodeUpper.replace(/(-)(0*\d{1,3})$/, (_m, d, n) => d + n.padStart(4, '0'));
        const barcodeCompact = /^US\d{11,14}$/.test(barcodeUpper)
            ? `US-${barcodeUpper.slice(2, 12)}-${barcodeUpper.slice(12).padStart(4, '0')}`
            : barcodeNormalized;

        // ── UNA SOLA QUERY: buscar + todos los campos + hijos + driver name ──────────
        // Prioridad: exact match en tracking_internal/tracking_provider (usa índices).
        // Fallback REPLACE solo si no hay match exacto — PostgreSQL evalúa con LIMIT 1
        // y puede short-circuit en cuanto encuentra el primer match.
        const [packageBranchSql] = await Promise.all([getPackageBranchSql('p')]);

        const result = await pool.query(`
            SELECT
                p.id,
                ${TRACKING_PUBLIC_SQL}                                        AS tracking_number,
                ${ASSIGNED_DRIVER_SQL}                                        AS assigned_driver_id,
                ${DELIVERY_STATUS_SQL}                                        AS delivery_status,
                ${packageBranchSql}                                           AS package_branch_id,
                ${DELIVERY_ADDRESS_SQL}                                       AS delivery_address,
                ${DELIVERY_CITY_SQL}                                          AS delivery_city,
                ${DELIVERY_ZIP_SQL}                                           AS delivery_zip,
                ${RECIPIENT_NAME_SQL}                                         AS recipient_name,
                ${RECIPIENT_PHONE_SQL}                                        AS recipient_phone,
                ${NATIONAL_TRACKING_SQL}                                      AS national_tracking,
                ${NATIONAL_CARRIER_SQL}                                       AS national_carrier,
                u.full_name                                                   AS assigned_driver_name,
                (SELECT COUNT(*)::int FROM packages c WHERE c.master_id = p.id) AS children_count,
                COALESCE(
                    (SELECT ARRAY_AGG(
                        COALESCE(to_jsonb(c)->>'tracking_internal', to_jsonb(c)->>'tracking_provider')
                        ORDER BY c.created_at
                    ) FROM packages c WHERE c.master_id = p.id),
                    '{}'::text[]
                )                                                             AS child_guides
            FROM packages p
            LEFT JOIN users u ON u.id = (${ASSIGNED_DRIVER_SQL})::int AND (${ASSIGNED_DRIVER_SQL})::int != $5
            WHERE
                tracking_internal  = $1 OR tracking_provider  = $1 OR
                tracking_internal  = $2 OR tracking_provider  = $2 OR
                tracking_internal  = $3 OR tracking_provider  = $3 OR
                tracking_internal  = $4 OR tracking_provider  = $4 OR
                REPLACE(UPPER(tracking_internal),  '-', '') = $4 OR
                REPLACE(UPPER(tracking_provider),  '-', '') = $4
            ORDER BY
                CASE
                    WHEN tracking_internal = $1 OR tracking_provider = $1 THEN 1
                    WHEN tracking_internal = $2 OR tracking_provider = $2 THEN 2
                    WHEN tracking_internal = $3 OR tracking_provider = $3 THEN 3
                    ELSE 4
                END
            LIMIT 1
        `, [barcodeUpper, barcodeNormalized, barcodeCompact, barcodeNoHyphens, driverId]);

        if (result.rows.length === 0) {
            console.warn(`⚠️ Paquete NO encontrado: "${barcode}"`);
            return res.status(404).json({ error: '❌ Paquete no encontrado o no está asignado a ti.', barcode });
        }

        const pkg = result.rows[0];

        // Verificar asignación
        if (pkg.assigned_driver_id && Number(pkg.assigned_driver_id) !== driverId) {
            const assignedName = pkg.assigned_driver_name || `Chofer #${pkg.assigned_driver_id}`;
            return res.status(403).json({
                error: `⛔ Este paquete está asignado a ${assignedName}. Devuélvelo a bodega.`,
                assignedTo: assignedName, barcode,
            });
        }

        if (!pkg.assigned_driver_id) {
            const driverBranchId = await getDriverBranchId(driverId);
            if (!driverBranchId || Number(pkg.package_branch_id) !== driverBranchId) {
                return res.status(403).json({ error: '⛔ Este paquete no pertenece a tu sucursal asignada.', barcode });
            }
        }

        const deliverableStates = ['out_for_delivery', 'received_mty', 'received_usa', 'received_china', 'ready_for_delivery', 'awaiting_delivery'];
        if (!deliverableStates.includes(pkg.delivery_status)) {
            return res.status(400).json({
                error: `⚠️ Este paquete no está listo para entregar. Estado: ${pkg.delivery_status}`,
                currentStatus: pkg.delivery_status, barcode,
            });
        }

        // Bloquear masters con hijos
        if (pkg.children_count > 0) {
            const childGuides: string[] = pkg.child_guides || [];
            return res.status(400).json({
                error: `⚠️ ${pkg.tracking_number} tiene ${pkg.children_count} cajas. Escanea cada caja: ${childGuides.slice(0, 3).join(', ')}${childGuides.length > 3 ? '…' : ''}`,
                has_children: true,
                child_guides: childGuides,
            });
        }

        const nationalCarrier = String(pkg.national_carrier || '').toLowerCase();
        const isEntregaLocal = nationalCarrier.includes('entregax') || nationalCarrier.includes('local');
        const requiresCarrierGuideScan = !!pkg.national_tracking && !isEntregaLocal;
        const isPaqueteExpress = nationalCarrier.includes('paquete express') || nationalCarrier.includes('paquetexpress');
        const carrierServiceRequestCode = isPaqueteExpress
            ? await getPaqueteExpressServiceRequestCode(pkg.national_tracking)
            : null;

        return res.json({
            success: true,
            package: {
                id: pkg.id,
                tracking_number: pkg.tracking_number,
                recipient_name: pkg.recipient_name,
                recipient_phone: pkg.recipient_phone,
                delivery_address: pkg.delivery_address,
                delivery_city: pkg.delivery_city,
                delivery_zip: pkg.delivery_zip,
                delivery_status: pkg.delivery_status,
                national_tracking: pkg.national_tracking,
                national_carrier: pkg.national_carrier,
                carrier_service_request_code: carrierServiceRequestCode,
                requires_carrier_scan: requiresCarrierGuideScan,
                has_children: false,
                child_guides: [],
            }
        });

    } catch (error: any) {
        console.error('Error en verifyPackageForDelivery:', error?.message || error);
        res.status(500).json({ error: `Error al verificar paquete: ${error?.message || 'error interno'}` });
    }
};

/**
 * Verifica si una guía de carrier (national_tracking) ya está asignada a OTRO paquete.
 * GET /api/driver/check-carrier-guide/:guide?excludeInternal=US-...
 * Devuelve { available: boolean, usedBy?: { tracking, status } }
 */
export const checkCarrierGuideAvailable = async (req: Request, res: Response): Promise<any> => {
    const { guide } = req.params;
    const excludeInternal = String(req.query.excludeInternal || '').trim();
    if (!guide) return res.status(400).json({ error: 'guide requerida' });

    try {
        const hasNT = await hasPackageColumn('national_tracking');
        if (!hasNT) return res.json({ available: true });

        // Comparación tolerante (sin guiones, mayúsculas)
        const normGuide = String(guide).toUpperCase().replace(/[^A-Z0-9]/g, '');
        const r = await pool.query(`
            SELECT p.id, ${TRACKING_PUBLIC_SQL} as tracking_number, ${DELIVERY_STATUS_SQL} as status,
                   to_jsonb(p)->>'national_tracking' as national_tracking
            FROM packages p
            WHERE REPLACE(UPPER(COALESCE(to_jsonb(p)->>'national_tracking','')), '-', '') = $1
            LIMIT 5
        `, [normGuide]);

        const others = r.rows.filter((row: any) => {
            if (!excludeInternal) return true;
            const t = String(row.tracking_number || '').toUpperCase();
            const e = excludeInternal.toUpperCase();
            return t !== e && t.replace(/-/g, '') !== e.replace(/-/g, '');
        });

        if (others.length > 0) {
            return res.json({
                available: false,
                usedBy: {
                    tracking: others[0].tracking_number,
                    status: others[0].status,
                    national_tracking: others[0].national_tracking,
                }
            });
        }
        return res.json({ available: true });
    } catch (err) {
        console.error('Error checkCarrierGuideAvailable:', err);
        return res.status(500).json({ error: 'Error al validar guía' });
    }
};
/**
 * Entrega Paquetería — Escaneo en dos fases (internal + carrier) o una (cargar_unidad)
 * POST /api/driver/paqueteria-handoff/scan
 * mode: 'mostrador' | 'recoleccion' | 'cargar_unidad'
 * phase: 'internal' | 'external'
 */
export const paqueteriaHandoffScan = async (req: Request, res: Response): Promise<any> => {
    const { barcode, carrier, mode, phase, packageId: confirmedId, externalTracking } = req.body;
    const driverId = getAuthUserId(req);
    if (!barcode && !confirmedId) return res.status(400).json({ error: 'barcode o packageId requerido' });
    if (!driverId) return res.status(401).json({ error: 'Sesión no válida' });

    try {
        // Normalizar código — layout teclado ES: ' → -, Ñ → :, y extraer tracking de URL
        const normalizeCode = (raw: string): string => {
            let v = String(raw || '').trim()
                .replace(/Ñ/gi, ':')
                .replace(/['’ʼ]/g, '-')  // apostrofe regular, curvo y modificador
                .replace(/¿/g, '/')
                .toUpperCase();
            // Reparar URL si viene completa (scanner distorsionó https://...)
            if (/^HTTPS?:-+/i.test(v)) {
                v = v.replace(/^(HTTPS?):-+/i, '$1://');
                v = v.replace(/([A-Z]{2,}\.[A-Z]{2,})-/gi, '$1/');
                v = v.replace(/TRACK-/gi, 'TRACK/');
            }
            // Extraer tracking de URL
            const urlMatch = v.match(/(?:TRACK|T)[/-]([A-Z0-9-]+)/i);
            if (urlMatch) return urlMatch[1] as string;
            // Auto-insertar guion si viene pegado (US1379808951 → US-1379808951)
            const prefixMatch = v.match(/^(US|AIR|LOG|TRK)(\d+)$/);
            if (prefixMatch) return `${prefixMatch[1] as string}-${prefixMatch[2] as string}`;
            return v;
        };

        // ── FASE 1: validar guía interna ──────────────────────────────────────────
        if (phase === 'internal' || mode === 'cargar_unidad') {
            const code = normalizeCode(barcode || '');
            const result = await pool.query(
                `SELECT p.id, ${TRACKING_PUBLIC_SQL} as tracking_number,
                        COALESCE(p.national_carrier, m.national_carrier) as national_carrier,
                        COALESCE(to_jsonb(p)->>'delivery_status', to_jsonb(p)->>'status') as delivery_status,
                        p.national_tracking
                 FROM packages p
                 LEFT JOIN packages m ON m.id = (to_jsonb(p)->>'master_id')::int
                 WHERE UPPER(p.tracking_internal) = $1 OR UPPER(p.tracking_provider) = $1`,
                [code]
            );
            // Fuzzy: si el código está truncado (scanner cortó el último char), buscar con LIKE
            if (result.rows.length === 0 && code.length >= 6) {
                // Intentar reconstruir child tracking cuando el scanner trunca ceros del sufijo.
                // Ej: US-4917481320-0001 compacto = US49174813200001 → scanner lee US491748132001
                //     Después de normalizeCode → US-491748132001 (prefijo US + 12 dígitos)
                // Estrategia: separar últimos 1-3 dígitos como sufijo, pad a 4, insertar guion
                const compactChildMatch = code.match(/^(US|AIR|LOG|TRK)-(\d{10,})$/i);
                if (compactChildMatch) {
                    const prefix = (compactChildMatch[1] || 'US').toUpperCase();
                    const digits = compactChildMatch[2] || '';
                    // Probar splits: master=primeros 8-10 dígitos, sufijo=resto
                    for (let masterLen = 10; masterLen >= 8; masterLen--) {
                        if (digits.length > masterLen) {
                            const masterDigits = digits.slice(0, masterLen);
                            const suffixDigits = digits.slice(masterLen);
                            const candidate = `${prefix}-${masterDigits}-${suffixDigits.padStart(4, '0')}`;
                            const retry = await pool.query(
                                `SELECT p.id, ${TRACKING_PUBLIC_SQL} as tracking_number,
                                        COALESCE(p.national_carrier, m.national_carrier) as national_carrier,
                                        COALESCE(to_jsonb(p)->>'delivery_status', to_jsonb(p)->>'status') as delivery_status,
                                        p.national_tracking
                                 FROM packages p
                                 LEFT JOIN packages m ON m.id = (to_jsonb(p)->>'master_id')::int
                                 WHERE UPPER(p.tracking_internal) = $1 LIMIT 1`,
                                [candidate.toUpperCase()]
                            );
                            if (retry.rows.length === 1) {
                                result.rows = retry.rows;
                                console.log(`[paqHandoff] Compact-child match: ${code} → ${retry.rows[0].tracking_number}`);
                                break;
                            }
                        }
                    }
                }

                // Sufijo de caja con ceros: "<MASTER>-01" / "-1" / "-001" → "-0001".
                // Cubre cuando el operador captura el sufijo sin padding completo.
                if (result.rows.length === 0) {
                    const sufMatch = code.match(/^(.+)-(\d{1,4})$/);
                    if (sufMatch) {
                        const padded = `${sufMatch[1]}-${String(parseInt(sufMatch[2] as string, 10)).padStart(4, '0')}`;
                        if (padded.toUpperCase() !== code.toUpperCase()) {
                            const retry = await pool.query(
                                `SELECT p.id, ${TRACKING_PUBLIC_SQL} as tracking_number,
                                        COALESCE(p.national_carrier, m.national_carrier) as national_carrier,
                                        COALESCE(to_jsonb(p)->>'delivery_status', to_jsonb(p)->>'status') as delivery_status,
                                        p.national_tracking
                                 FROM packages p
                                 LEFT JOIN packages m ON m.id = (to_jsonb(p)->>'master_id')::int
                                 WHERE UPPER(p.tracking_internal) = $1 LIMIT 1`,
                                [padded.toUpperCase()]
                            );
                            if (retry.rows.length === 1) {
                                result.rows = retry.rows;
                                console.log(`[paqHandoff] Suffix-pad match: ${code} → ${retry.rows[0].tracking_number}`);
                            }
                        }
                    }
                }

                // Si aún no encontrado, LIKE fuzzy (para truncación al final)
                if (result.rows.length === 0) {
                    const fuzzyRes = await pool.query(
                        `SELECT p.id, ${TRACKING_PUBLIC_SQL} as tracking_number,
                                COALESCE(p.national_carrier, m.national_carrier) as national_carrier,
                                COALESCE(to_jsonb(p)->>'delivery_status', to_jsonb(p)->>'status') as delivery_status,
                                p.national_tracking
                         FROM packages p
                         LEFT JOIN packages m ON m.id = (to_jsonb(p)->>'master_id')::int
                         WHERE UPPER(p.tracking_internal) LIKE $1 OR UPPER(p.tracking_provider) LIKE $1
                         LIMIT 2`,
                        [`${code}%`]
                    );
                    if (fuzzyRes.rows.length === 1) {
                        result.rows = fuzzyRes.rows;
                        console.log(`[paqHandoff] Fuzzy match: ${code} → ${fuzzyRes.rows[0].tracking_number}`);
                    } else if (fuzzyRes.rows.length > 1) {
                        return res.status(400).json({ error: `⚠️ Código truncado: múltiples guías empiezan con ${code}` });
                    }
                }
            }
            if (result.rows.length === 0) {
                return res.status(404).json({ error: `❌ Guía ${code} no encontrada en el sistema` });
            }
            const pkg = result.rows[0];

            // Rechazar si es un MASTER con cajas hijas — escanear cada caja individual
            const childCount = await pool.query(
                `SELECT COUNT(*) as cnt FROM packages WHERE master_id = $1`, [pkg.id]
            );
            if (parseInt(childCount.rows[0]?.cnt) > 0) {
                return res.status(400).json({
                    error: `⚠️ ${pkg.tracking_number} es un embarque con ${childCount.rows[0].cnt} cajas. Escanea cada caja individual (${pkg.tracking_number}-0001, -0002, etc.)`
                });
            }

            // Normalizar nombres de paquetería antes de comparar: 'paquete_express',
            // 'Paquete Express' y 'paquete-express' son la MISMA paquetería. Sin esto
            // daba falso "esta guía es de paquete_express, no de Paquete Express".
            const normCarrier = (c: any) => String(c || '').toLowerCase().replace(/[\s_-]+/g, '');
            const pkgCarrier = normCarrier(pkg.national_carrier);
            const reqCarrier = normCarrier(carrier);
            if (reqCarrier && pkgCarrier && !pkgCarrier.includes(reqCarrier) && !reqCarrier.includes(pkgCarrier)) {
                return res.status(400).json({
                    error: `⚠️ Esta guía es de ${pkg.national_carrier || 'otra paquetería'}, no de ${carrier}`
                });
            }

            // Para cargar_unidad: marcar out_for_delivery en esta misma fase
            if (mode === 'cargar_unidad') {
                const statusColumn = await getPackageStatusColumn();
                const outStatus = await getOutForDeliveryWriteStatus();
                const hasLoadedAt = await hasPackageColumn('loaded_at');
                const hasAssignedDriver = await hasPackageColumn('assigned_driver_id');
                const setParts = [`${statusColumn} = $1`, 'updated_at = NOW()'];
                if (hasLoadedAt) setParts.push('loaded_at = COALESCE(loaded_at, NOW())');
                if (hasAssignedDriver) setParts.push(`assigned_driver_id = $3`);
                await pool.query(
                    `UPDATE packages SET ${setParts.join(', ')} WHERE id = $2`,
                    hasAssignedDriver ? [outStatus, pkg.id, String(driverId)] : [outStatus, pkg.id]
                );
                return res.json({
                    success: true, phase: 'complete', mode, packageId: pkg.id,
                    tracking: pkg.tracking_number, newStatus: outStatus,
                    message: '✅ Cargado a unidad'
                });
            }

            return res.json({
                success: true, phase: 'internal', packageId: pkg.id,
                tracking: pkg.tracking_number, nationalTracking: pkg.national_tracking || null,
                message: `✅ Guía interna OK. Ahora escanea la guía de ${carrier}`
            });
        }

        // ── FASE 2: guía del carrier externo → marcar como enviado ───────────────
        if (phase === 'external' && confirmedId) {
            const statusColumn = await getPackageStatusColumn();
            const sentStatus = await getSentWriteStatus();
            const extTracking = externalTracking || barcode || '';
            // Actualizar AMBAS columnas: statusColumn (puede ser delivery_status TEXT)
            // Y también 'status' ENUM (que es lo que lee el track endpoint).
            // Si la columna es la misma ('status'), el segundo SET es redundante pero inofensivo.
            // $1=sentStatus (TEXT), $2=extTracking, $3=confirmedId
            // Si statusColumn !== 'status', necesitamos actualizar TAMBIÉN el ENUM status.
            // Usamos $4 separado para evitar "inconsistent types deduced for parameter $1"
            // cuando $1 se usa en contexto TEXT y ENUM en la misma query.
            const setParts = [
                `${statusColumn} = $1`,
                'national_tracking = COALESCE(NULLIF($2,\'\'), national_tracking)',
                'updated_at = NOW()',
            ];
            const queryParams: any[] = [sentStatus, extTracking, confirmedId];
            if (statusColumn !== 'status') {
                setParts.push(`status = $4`);
                queryParams.push(sentStatus);
            }
            await pool.query(
                `UPDATE packages SET ${setParts.join(', ')} WHERE id = $3`,
                queryParams
            );
            // Si el paquete tiene master_id, verificar si todos los hermanos ya están
            // en sentStatus para actualizar también el master
            try {
                const pkgRow = await pool.query(
                    `SELECT to_jsonb(p)->>'master_id' as master_id FROM packages p WHERE id = $1`, [confirmedId]
                );
                const masterId = pkgRow.rows[0]?.master_id;
                if (masterId) {
                    // Contar hermanos que ya tienen el sentStatus
                    const sibRes = await pool.query(
                        `SELECT COUNT(*) as total,
                                COUNT(CASE WHEN COALESCE(to_jsonb(p)->>'delivery_status', to_jsonb(p)->>'status') = $1 THEN 1 END) as done
                         FROM packages p WHERE master_id = $2`,
                        [sentStatus, masterId]
                    );
                    const { total, done } = sibRes.rows[0] || {};
                    // Si todos (o al menos 1) hijos ya están enviados, actualizar master
                    if (parseInt(done) > 0) {
                        const statusCol = await getPackageStatusColumn();
                        await pool.query(
                            `UPDATE packages SET ${statusCol} = $1, updated_at = NOW() WHERE id = $2`,
                            [sentStatus, masterId]
                        );
                        console.log(`[paqHandoff] Master ${masterId} actualizado a '${sentStatus}' (${done}/${total} hijos procesados)`);
                    }
                }
            } catch (masterErr: any) {
                console.warn('[paqHandoff] No se pudo actualizar master:', masterErr?.message);
            }
            // Historial
            try {
                await pool.query(
                    `INSERT INTO package_history (package_id, status, description, created_by, created_at)
                     VALUES ($1, $2, $3, $4, NOW())`,
                    [confirmedId, sentStatus,
                     `Enviado vía ${carrier} (${mode === 'mostrador' ? 'Mostrador' : 'Recolección'}) — guía: ${extTracking}`,
                     driverId]
                );
            } catch { /* no crítico */ }
            return res.json({
                success: true, phase: 'complete', mode, packageId: confirmedId,
                newStatus: sentStatus, externalTracking: extTracking,
                message: '✅ Enviado correctamente'
            });
        }

        return res.status(400).json({ error: 'phase inválido' });
    } catch (error: any) {
        console.error('Error paqueteriaHandoffScan:', error);
        res.status(500).json({ error: error.message });
    }
};
