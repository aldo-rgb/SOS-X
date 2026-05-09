/**
 * Driver Controller - Controlador para la App del Repartidor
 * Maneja: Carga de unidad (Scan-to-Load), Retorno a bodega, Estado de ruta
 */

import { Request, Response } from 'express';
import { pool } from './db';

// Compatibilidad de esquema: algunos entornos no tienen tracking_number o tracking_provider.
// Con to_jsonb(p)->>'campo' evitamos errores SQL cuando el campo no existe.
const TRACKING_PUBLIC_SQL = `COALESCE(
    to_jsonb(p)->>'tracking_number',
    to_jsonb(p)->>'tracking_internal',
    to_jsonb(p)->>'tracking_provider'
)`;

const TRACKING_MATCH_SQL = `(
    ${TRACKING_PUBLIC_SQL} = $1
    OR to_jsonb(p)->>'skydropx_label_id' = $1
    OR to_jsonb(p)->>'dhl_awb' = $1
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
)`;

let packageStatusColumnCache: 'delivery_status' | 'status' | null = null;
let packageBranchSqlCache: string | null = null;
const packageColumnsCache = new Set<string>();
let outForDeliveryWriteStatusCache: 'out_for_delivery' | 'in_transit' | null = null;
let inCedisWriteStatusCache: 'in_cedis' | 'received_mty' | null = null;
let sentWriteStatusCache: 'sent' | 'delivered' | null = null;
let pqtxShipmentsTableExistsCache: boolean | null = null;

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

    const getSentWriteStatus = async (): Promise<'sent' | 'delivered'> => {
        const statusColumn = await getPackageStatusColumn();
        if (statusColumn === 'delivery_status') return 'sent';

        if (sentWriteStatusCache) return sentWriteStatusCache;

        const result = await pool.query(
            `
                SELECT 1
                FROM pg_type t
                JOIN pg_enum e ON e.enumtypid = t.oid
                WHERE t.typname = 'package_status'
                AND e.enumlabel = 'sent'
                LIMIT 1
            `
        );

        sentWriteStatusCache = result.rows.length > 0 ? 'sent' : 'delivered';
        return sentWriteStatusCache;
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
            const m = String(barcode).trim().match(/^(.+?)-(\d{1,4})$/);
            if (m) {
                const prefix = m[1] as string;
                const n = parseInt(m[2] as string, 10);
                const padded = `${prefix}-${String(n).padStart(4, '0')}`;
                if (padded.toUpperCase() !== String(barcode).toUpperCase()) {
                    const probe = await pool.query(
                        `SELECT 1 FROM packages WHERE UPPER(tracking_internal) = UPPER($1) LIMIT 1`,
                        [padded]
                    );
                    if (probe.rows.length > 0) {
                        barcode = padded;
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
                ${DELIVERY_STATUS_SQL} as delivery_status,
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
        // EntregaX Local / Pickup no usa paquetería externa: no requiere etiqueta nacional.
        const isLocalDelivery = carrierLower.includes('entregax') || carrierLower.includes('local') || carrierLower.includes('pick up') || carrierLower.includes('pickup');
        const hasExternalLabel = Boolean(pkg.national_label_url || pkg.national_tracking || pkg.skydropx_label_id || pkg.dhl_awb);
        // Para entrega local basta tener dirección asignada o estar marcado para pickup.
        const hasLabel = hasExternalLabel || (isLocalDelivery && Boolean(pkg.assigned_address_id));

        if (!isPaid || !hasLabel) {
            return res.status(400).json({
                error: '⚠️ Este paquete aún no está listo para reparto (debe estar pagado y etiquetado).',
                paymentStatus: pkg.payment_status || 'pending',
                hasLabel,
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
        const validStatusesToLoad = ['received', 'in_cedis', 'ready_for_pickup', 'ready_pickup', 'assigned', 'received_mty', 'received_partial', 'inspected', 'pending_inspection', 'returned_to_warehouse'];
        if (!validStatusesToLoad.includes(pkg.delivery_status) && pkg.delivery_status !== 'out_for_delivery') {
            return res.status(400).json({ 
                error: `⚠️ Este paquete no puede cargarse. Estado actual: ${pkg.delivery_status}`,
                currentStatus: pkg.delivery_status,
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
        const packageBranchSql = await getPackageBranchSql('p');
        const hasAssignedDriverColumn = await hasPackageColumn('assigned_driver_id');

        // Si el repartidor tiene sucursal, mostrar paquetes listos de su CEDIS
        // (pagados + etiquetados) tal como se ve en panel de etiquetado.
        // IMPORTANTE: excluimos masters (no son cajas físicas). Las hijas heredan
        // payment/label/carrier del master via LEFT JOIN.
        const pendingRes = driverBranchId
            ? await pool.query(`
                SELECT 
                    p.id,
                    ${TRACKING_PUBLIC_SQL} as tracking_number,
                    ${DELIVERY_STATUS_SQL} as delivery_status,
                    ${DELIVERY_ADDRESS_SQL} as delivery_address,
                    ${DELIVERY_CITY_SQL} as delivery_city,
                    ${DELIVERY_ZIP_SQL} as delivery_zip,
                    ${RECIPIENT_NAME_SQL} as recipient_name,
                    ${RECIPIENT_PHONE_SQL} as recipient_phone,
                    ${CLIENT_NUMBER_SQL} as client_number,
                    ${REFERENCE_HINT_SQL} as reference_hint,
                    ROW_NUMBER() OVER (PARTITION BY ${PACKAGE_GROUP_KEY_SQL} ORDER BY p.created_at ASC, p.id ASC) as box_number,
                    COUNT(*) OVER (PARTITION BY ${PACKAGE_GROUP_KEY_SQL}) as total_boxes
                FROM packages p
                LEFT JOIN packages m ON m.id = (to_jsonb(p)->>'master_id')::int
                LEFT JOIN users u ON u.id::text = COALESCE(NULLIF(to_jsonb(p)->>'user_id', ''), NULLIF(to_jsonb(m)->>'user_id', ''))
                WHERE ${packageBranchSql} = $1
                  AND COALESCE((to_jsonb(p)->>'is_master')::boolean, false) = false
                  AND ${DELIVERY_STATUS_SQL} IN ('received', 'in_cedis', 'ready_for_pickup', 'ready_pickup', 'assigned', 'received_mty', 'received_partial', 'inspected', 'pending_inspection', 'returned_to_warehouse')
                  AND COALESCE(LOWER(to_jsonb(p)->>'payment_status'), LOWER(to_jsonb(m)->>'payment_status'), 'paid') = 'paid'
                  AND (
                        to_jsonb(p)->>'national_label_url' IS NOT NULL
                     OR to_jsonb(p)->>'national_tracking' IS NOT NULL
                     OR to_jsonb(p)->>'skydropx_label_id' IS NOT NULL
                     OR to_jsonb(p)->>'dhl_awb' IS NOT NULL
                     OR to_jsonb(m)->>'national_label_url' IS NOT NULL
                     OR to_jsonb(m)->>'national_tracking' IS NOT NULL
                     OR to_jsonb(m)->>'skydropx_label_id' IS NOT NULL
                     OR to_jsonb(m)->>'dhl_awb' IS NOT NULL
                     OR (
                        LOWER(COALESCE(to_jsonb(p)->>'national_carrier', to_jsonb(p)->>'carrier', to_jsonb(m)->>'national_carrier', to_jsonb(m)->>'carrier', '')) ~ '(entregax|local|pick ?up)'
                        AND COALESCE(to_jsonb(p)->>'assigned_address_id', to_jsonb(m)->>'assigned_address_id') IS NOT NULL
                     )
                  )
                ORDER BY p.updated_at ASC NULLS LAST, p.created_at ASC
            `, [driverBranchId])
            : await pool.query(`
                SELECT 
                    p.id,
                    ${TRACKING_PUBLIC_SQL} as tracking_number,
                    ${DELIVERY_STATUS_SQL} as delivery_status,
                    ${DELIVERY_ADDRESS_SQL} as delivery_address,
                    ${DELIVERY_CITY_SQL} as delivery_city,
                    ${DELIVERY_ZIP_SQL} as delivery_zip,
                    ${RECIPIENT_NAME_SQL} as recipient_name,
                    ${RECIPIENT_PHONE_SQL} as recipient_phone,
                    ${CLIENT_NUMBER_SQL} as client_number,
                    ${REFERENCE_HINT_SQL} as reference_hint,
                    ROW_NUMBER() OVER (PARTITION BY ${PACKAGE_GROUP_KEY_SQL} ORDER BY p.created_at ASC, p.id ASC) as box_number,
                    COUNT(*) OVER (PARTITION BY ${PACKAGE_GROUP_KEY_SQL}) as total_boxes
                FROM packages p
                LEFT JOIN packages m ON m.id = (to_jsonb(p)->>'master_id')::int
                                LEFT JOIN users u ON u.id::text = COALESCE(NULLIF(to_jsonb(p)->>'user_id', ''), NULLIF(to_jsonb(m)->>'user_id', ''))
                WHERE ${ASSIGNED_DRIVER_SQL} = $1::text
                  AND COALESCE((to_jsonb(p)->>'is_master')::boolean, false) = false
                  AND ${DELIVERY_STATUS_SQL} IN ('received', 'in_cedis', 'ready_for_pickup', 'ready_pickup', 'assigned', 'received_mty', 'received_partial', 'inspected', 'pending_inspection', 'returned_to_warehouse')
                ORDER BY p.created_at ASC
            `, [driverId]);

        // Obtener lista de paquetes ya cargados (out for delivery)
        const loadedRes = hasAssignedDriverColumn
            ? await pool.query(`
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
                    ${NATIONAL_CARRIER_SQL} as national_carrier,
                    ${CLIENT_NUMBER_SQL} as client_number,
                    ${REFERENCE_HINT_SQL} as reference_hint,
                    ROW_NUMBER() OVER (PARTITION BY ${PACKAGE_GROUP_KEY_SQL} ORDER BY p.created_at ASC, p.id ASC) as box_number,
                    COUNT(*) OVER (PARTITION BY ${PACKAGE_GROUP_KEY_SQL}) as total_boxes
                FROM packages p
                LEFT JOIN packages m ON m.id = (to_jsonb(p)->>'master_id')::int
                                LEFT JOIN users u ON u.id::text = COALESCE(NULLIF(to_jsonb(p)->>'user_id', ''), NULLIF(to_jsonb(m)->>'user_id', ''))
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
                        ${DELIVERY_STATUS_SQL} as delivery_status,
                        ${DELIVERY_ADDRESS_SQL} as delivery_address,
                        ${DELIVERY_CITY_SQL} as delivery_city,
                        ${DELIVERY_ZIP_SQL} as delivery_zip,
                        ${RECIPIENT_NAME_SQL} as recipient_name,
                        ${RECIPIENT_PHONE_SQL} as recipient_phone,
                        ${LOADED_AT_SQL} as loaded_at,
                        ${NATIONAL_TRACKING_SQL} as national_tracking,
                        ${NATIONAL_CARRIER_SQL} as national_carrier,
                        ${CLIENT_NUMBER_SQL} as client_number,
                        ${REFERENCE_HINT_SQL} as reference_hint,
                        ROW_NUMBER() OVER (PARTITION BY ${PACKAGE_GROUP_KEY_SQL} ORDER BY p.created_at ASC, p.id ASC) as box_number,
                        COUNT(*) OVER (PARTITION BY ${PACKAGE_GROUP_KEY_SQL}) as total_boxes
                    FROM packages p
                    LEFT JOIN packages m ON m.id = (to_jsonb(p)->>'master_id')::int
                                        LEFT JOIN users u ON u.id::text = COALESCE(NULLIF(to_jsonb(p)->>'user_id', ''), NULLIF(to_jsonb(m)->>'user_id', ''))
                    WHERE ${packageBranchSql} = $1
                      AND ${DELIVERY_STATUS_SQL} = 'out_for_delivery'
                      AND COALESCE((to_jsonb(p)->>'is_master')::boolean, false) = false
                    ORDER BY p.updated_at ASC, p.created_at ASC
                `, [driverBranchId])
                : { rows: [] as any[] };

                const deliveredTodayRes = hasAssignedDriverColumn
                    ? await pool.query(`
                            SELECT COUNT(*) as delivered_today
                            FROM packages p
                            WHERE to_jsonb(p)->>'assigned_driver_id' = $1::text
                                AND COALESCE(to_jsonb(p)->>'delivery_status', to_jsonb(p)->>'status') IN ('delivered', 'sent')
                                AND DATE(p.updated_at) = CURRENT_DATE
                                AND COALESCE((to_jsonb(p)->>'is_master')::boolean, false) = false
                    `, [driverId])
                    : driverBranchId
                        ? await pool.query(`
                                SELECT COUNT(*) as delivered_today
                                FROM packages p
                                WHERE ${packageBranchSql} = $1
                                    AND ${DELIVERY_STATUS_SQL} IN ('delivered', 'sent')
                                    AND DATE(p.updated_at) = CURRENT_DATE
                                    AND COALESCE((to_jsonb(p)->>'is_master')::boolean, false) = false
                        `, [driverBranchId])
                        : { rows: [{ delivered_today: '0' }] };

                const deliveredToday = parseInt(deliveredTodayRes.rows[0]?.delivered_today) || 0;
                const pendingToLoad = pendingRes.rows.length;
                const loadedToday = loadedRes.rows.length;
                const totalAssigned = pendingToLoad + loadedToday + deliveredToday;

        return res.json({
            success: true,
            route: {
                                totalAssigned,
                                loadedToday,
                                deliveredToday,
                                pendingToLoad,
                pendingPackages: pendingRes.rows,
                loadedPackages: loadedRes.rows
            }
        });

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
                NULL::int as client_id
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

        // 3. VALIDAR ESTADO
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
        const hasDeliveredAtColumn = await hasPackageColumn('delivered_at');
        const hasDeliverySignatureColumn = await hasPackageColumn('delivery_signature');
        const hasDeliveryPhotoColumn = await hasPackageColumn('delivery_photo');
        const hasDeliveryRecipientNameColumn = await hasPackageColumn('delivery_recipient_name');
        const hasDeliveryNotesColumn = await hasPackageColumn('delivery_notes');

        const setParts: string[] = [`${statusColumn} = '${finalStatus}'`, 'updated_at = NOW()'];
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
                    await pool.query(
                        `UPDATE packages SET ${statusColumn} = '${finalStatus}', updated_at = NOW() WHERE id = $1`,
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

        // TODO: Notificar al cliente
        // await sendDeliveryConfirmationEmail(pkg.client_id, pkg.tracking_number);

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
        const hasDeliveredAtColumn = await hasPackageColumn('delivered_at');
        const hasDeliveryPhotoColumn = await hasPackageColumn('delivery_photo');
        const hasDeliverySignatureColumn = await hasPackageColumn('delivery_signature');
        const hasDeliveryRecipientNameColumn = await hasPackageColumn('delivery_recipient_name');
        const hasDeliveryNotesColumn = await hasPackageColumn('delivery_notes');
        const hasNationalTrackingColumn = await hasPackageColumn('national_tracking');
        const hasAssignedDriverColumnBulk = await hasPackageColumn('assigned_driver_id');

        for (const pkg of packages) {
            const { internalGuide, carrierGuide } = pkg;

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
                        ${statusColumn} as status,
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
                // Si tiene guía nacional externa → 'sent'; entrega directa al cliente → 'delivered'
                const finalStatus = (!isLocalDelivery && (row.national_tracking || carrierGuide)) ? sentStatus : 'delivered';

                console.log(`✅ [BULK] Paquete ID=${packageId} carrier="${row.national_carrier || 'local'}" status=${row.status} → '${finalStatus}'`);
                
                // Construir UPDATE dinámicamente
                const setParts: string[] = [`${statusColumn} = '${finalStatus}'`, 'updated_at = NOW()'];
                const values: any[] = [packageId];

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

    if (!barcode) {
        return res.status(400).json({ error: '❌ Código de barras requerido.' });
    }

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    try {
        const packageBranchSql = await getPackageBranchSql('p');

        // Log de búsqueda
        console.log(`🔍 Buscando paquete: "${barcode}" por conductor ID: ${driverId}`);

        const pkgRes = await pool.query(`
            SELECT 
                p.id, 
                ${TRACKING_PUBLIC_SQL} as tracking_number,
                ${ASSIGNED_DRIVER_SQL} as assigned_driver_id,
                ${DELIVERY_STATUS_SQL} as delivery_status,
                ${packageBranchSql} as package_branch_id,
                ${DELIVERY_ADDRESS_SQL} as delivery_address,
                ${DELIVERY_CITY_SQL} as delivery_city,
                ${DELIVERY_ZIP_SQL} as delivery_zip,
                ${RECIPIENT_NAME_SQL} as recipient_name,
                ${RECIPIENT_PHONE_SQL} as recipient_phone,
                ${NATIONAL_TRACKING_SQL} as national_tracking,
                ${NATIONAL_CARRIER_SQL} as national_carrier
            FROM packages p
            WHERE (${TRACKING_MATCH_SQL})
        `, [barcode]);

        if (pkgRes.rows.length === 0) {
            console.warn(`⚠️ Paquete NO encontrado: "${barcode}"`);
            return res.status(404).json({ 
                error: '❌ Paquete no encontrado o no está asignado a ti.',
                barcode 
            });
        }

        const pkg = pkgRes.rows[0];
        console.log(`✅ Paquete encontrado: ID=${pkg.id}, Tracking=${pkg.tracking_number}, Status=${pkg.delivery_status}, Driver=${pkg.assigned_driver_id}`);

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

        // Verificar que esté en estado para entregar
        // Permitir estados: out_for_delivery, received_mty, received_usa, received_china, ready_for_delivery, awaiting_delivery
        // NOTA: 'in_transit' se excluye intencionalmente — representa paquetes en tránsito entre sucursales
        // (consolidaciones HIDALGO→MTY, etc.) que aún no están listos para entrega final.
        const deliverableStates = ['out_for_delivery', 'received_mty', 'received_usa', 'received_china', 'ready_for_delivery', 'awaiting_delivery'];
        if (!deliverableStates.includes(pkg.delivery_status)) {
            return res.status(400).json({ 
                error: `⚠️ Este paquete no está listo para entregar. Estado: ${pkg.delivery_status}`,
                currentStatus: pkg.delivery_status,
                barcode
            });
        }

        const nationalCarrier = String(pkg.national_carrier || '').toLowerCase();
        const isEntregaLocal = nationalCarrier.includes('entregax') || nationalCarrier.includes('local');
        const requiresCarrierGuideScan = !!pkg.national_tracking && !isEntregaLocal;
        const isPaqueteExpress = nationalCarrier.includes('paquete express') || nationalCarrier.includes('paquetexpress');
        const carrierServiceRequestCode = isPaqueteExpress
            ? await getPaqueteExpressServiceRequestCode(pkg.national_tracking)
            : null;

        // Verificar si este paquete tiene guías hijo (múltiples cajas)
        let hasChildren = false;
        let childGuides = [];
        try {
            const childRes = await pool.query(`
                SELECT id, ${TRACKING_PUBLIC_SQL} as tracking_number
                FROM packages
                WHERE master_id = $1 AND id != $2
                ORDER BY created_at
            `, [pkg.id, pkg.id]);
            if (childRes.rows && childRes.rows.length > 0) {
                hasChildren = true;
                childGuides = childRes.rows.map((row: any) => row.tracking_number);
            }
        } catch (childError) {
            console.warn('No se pudo verificar guías hijo:', childError);
        }

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
                has_children: hasChildren,
                child_guides: childGuides
            }
        });

    } catch (error) {
        console.error('Error en verifyPackageForDelivery:', error);
        res.status(500).json({ error: 'Error al verificar paquete.' });
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