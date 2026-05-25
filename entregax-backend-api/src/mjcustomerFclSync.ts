// ============================================================
// MJCustomer FCL Sync (pageByClearance)
// Sincroniza contenedores maritimos desde MJCustomer hacia
// la tabla `containers`. Todos los contenedores que vienen por
// este endpoint pertenecen al cliente S87 (configurable via env).
//
// MODO UPDATE-ONLY (regla solicitada 2026-05):
//   El sync solo ACTUALIZA contenedores que ya existen en nuestro
//   sistema. Si MJCustomer devuelve un contenedor que nosotros no
//   tenemos registrado, se ignora y se anota como conflicto
//   'not_found' (para revision manual, sin insertar). Esto evita
//   inflar la tabla con contenedores que no pertenecen a nuestra
//   operacion.
//
// Reglas de match:
//   1. Buscar por container_number (cabinetNo)
//   2. Si no encontro: buscar por bl_number (billNo)
//   3. Si no encontro: registrar 'not_found' y NO insertar.
// ============================================================

import { Request, Response } from 'express';
import { pool } from './db';
import { AuthRequest } from './authController';
import { sm2 } from 'sm-crypto';

const MJC_BASE_URL = process.env.MJCUSTOMER_API_URL || 'http://api.mjcustomer.com';
const MJC_S87_CLIENT_ID = parseInt(process.env.MJCUSTOMER_FCL_CLIENT_ID || '75', 10);
const MJC_PAGE_SIZE = 30;
const MJC_MAX_PAGES = 100; // hard cap defensivo (3,000 contenedores)
const MJC_FETCH_TIMEOUT_MS = 20000;

// =============== TIPOS ===============

interface MJCabinetItem {
    id: number;
    fdate: string | null;
    cabinetNo: string | null;
    shipCodeName: string | null;
    portCodeName: string | null;
    shipBno: string | null;
    serviceType: string | null;
    startPort: string | null;
    destPort: string | null;
    openTime: string | null;
    planOpenTime: string | null;
    getTime: string | null;
    planGetTime: string | null;
    startTime: string | null;
    estimate: string | null;
    leaveTime: number | null;
    shipNo: string | null;
    billNo: string | null;
    currentStatusEn: string | null;
    currentStatusCh: string | null;
    runType: number | null;
    totalQty: number | null;
    totalWeight: number | string | null;
    totalVolume: number | null;
    totalCbm: number | string | null;
    file: string | null;
    gmtTime: string | null;
    cabinetedTime: string | null;
    createTime: string | null;
    // Campos OPCIONALES futuros (forward-compatible) - cuando MJCustomer
    // extienda el API con datos de consignee, se aprovechan automaticamente.
    consigneeName?: string;
    consigneeAddress?: string;
    consigneePhone?: string;
    consigneeCity?: string;
    consigneeState?: string;
    consigneeZip?: string;
    consigneeCountry?: string;
}

interface MJClearanceResponse {
    code: number;
    type: string;
    message: string;
    result?: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        items: MJCabinetItem[];
        hasPrevPage: boolean;
        hasNextPage: boolean;
    };
    extras: any;
    time: string;
}

interface SyncSummary {
    success: boolean;
    pagesFetched: number;
    itemsFetched: number;
    itemsCreated: number;
    itemsUpdated: number;
    itemsSkipped: number;
    itemsConflict: number;
    error?: string;
    durationMs: number;
}

// =============== AUTH (token compartido con chinaController) ===============

// Reusamos la logica de auth ya existente en chinaController.
// Lee el token desde system_config y, si no hay o expiro, hace login automatico.
async function getMJCustomerToken(): Promise<string> {
    // 1. Cargar desde BD
    try {
        const tokenRow = await pool.query(
            "SELECT value FROM system_config WHERE key = 'mjcustomer_token'"
        );
        const expiryRow = await pool.query(
            "SELECT value FROM system_config WHERE key = 'mjcustomer_token_expiry'"
        );
        if (tokenRow.rows.length > 0 && expiryRow.rows.length > 0) {
            const expiry = parseInt(expiryRow.rows[0].value, 10);
            if (Date.now() < expiry) {
                return tokenRow.rows[0].value;
            }
        }
    } catch {
        // continuar al login
    }

    // 2. .env override
    if (process.env.MJCUSTOMER_API_TOKEN) {
        return process.env.MJCUSTOMER_API_TOKEN;
    }

    // 3. Login automatico (h5api con SM2, fallback orderSystem)
    const token = await loginToMJCustomer();
    if (!token) {
        throw new Error('No se pudo obtener token de MJCustomer');
    }
    return token;
}

const MJC_H5_USER = 'h5api';
const MJC_H5_PASS = 'H_5@nLP.';
const MJC_H5_PUBKEY =
    '046BB47A0777ADAD614BEF4F234BBE275C4FBB4BB45A9EDCAB5602EEE9588B52AEFB5CD7A29396DA46526E1C4F72650166F5FB41515B83C192AE37134470EB951D';

async function loginToMJCustomer(): Promise<string | null> {
    // Intento 1: h5api + SM2
    try {
        const encrypted = sm2.doEncrypt(MJC_H5_PASS, MJC_H5_PUBKEY, 1);
        const resp = await fetchWithTimeout(
            `${MJC_BASE_URL}/api/sysAuth/login`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json-patch+json',
                    Accept: 'text/plain',
                    'request-from': 'swagger',
                },
                body: JSON.stringify({
                    account: MJC_H5_USER,
                    password: encrypted,
                    codeId: 0,
                    code: 'string',
                    loginMode: 1,
                }),
            },
            15000
        );
        const data = (await resp.json()) as { code: number; result?: { accessToken: string } };
        if (data.code === 200 && data.result?.accessToken) {
            await persistToken(data.result.accessToken);
            return data.result.accessToken;
        }
    } catch (err: any) {
        console.warn('[MJC FCL] login h5api fallo:', err?.message || err);
    }

    // Intento 2: orderSystem (plano)
    try {
        const user = process.env.MJCUSTOMER_USERNAME || '18824927368';
        const pass = process.env.MJCUSTOMER_PASSWORD || 'cM4V92S0RNE2.';
        const resp = await fetchWithTimeout(
            `${MJC_BASE_URL}/api/appAuth/loginByOrderSystem`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json-patch+json',
                    Accept: 'text/plain',
                    'request-from': 'swagger',
                },
                body: JSON.stringify({ account: user, password: pass }),
            },
            15000
        );
        const data = (await resp.json()) as { code: number; result?: { accessToken: string } };
        if (data.code === 200 && data.result?.accessToken) {
            await persistToken(data.result.accessToken);
            return data.result.accessToken;
        }
    } catch (err: any) {
        console.warn('[MJC FCL] login orderSystem fallo:', err?.message || err);
    }
    return null;
}

async function persistToken(token: string): Promise<void> {
    const expiry = Date.now() + 6 * 24 * 60 * 60 * 1000; // 6 dias
    try {
        await pool.query(
            `INSERT INTO system_config (key, value, updated_at)
             VALUES ('mjcustomer_token', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
            [token]
        );
        await pool.query(
            `INSERT INTO system_config (key, value, updated_at)
             VALUES ('mjcustomer_token_expiry', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
            [expiry.toString()]
        );
    } catch (err) {
        console.warn('[MJC FCL] no se pudo persistir token:', err);
    }
}

async function fetchWithTimeout(
    url: string,
    options: any = {},
    timeoutMs: number = MJC_FETCH_TIMEOUT_MS
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        return res as unknown as Response;
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            throw new Error(`MJCustomer API timeout (${timeoutMs}ms): ${url}`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

// =============== MAPEO DE STATUS ===============

// Mapea el currentStatusEn de MJCustomer a nuestro enum interno de status.
// Solo se sobreescribe el status del contenedor si esta en una fase
// equivalente o anterior (el status manual posterior no se pisa).
function mapMJStatusToInternal(statusEn: string | null): string | null {
    if (!statusEn) return null;
    const map: Record<string, string> = {
        GITM: 'received_origin',        // 进场
        DEPT: 'in_transit',             // 离港
        TSDC: 'in_transit',             // 中转卸船
        TSDP: 'in_transit',             // 中转离港
        BERT: 'arrived_port',           // 靠泊
        DISC: 'discharged',             // 卸船
        RAIL: 'in_transit',             // 铁运离站
        EMRT: null,                     // 还空箱 (informativo, no cambia status)
    };
    return map[statusEn] ?? null;
}

// Estados manuales post-arribo que NO deben ser pisados por la sync.
const MANUAL_TERMINAL_STATUSES = new Set([
    'customs_cleared',
    'in_local_delivery',
    'in_warehouse',
    'delivered',
    'completed',
    'cancelled',
]);

// =============== DELIVERY ADDRESS RESOLVER ===============

async function resolveDeliveryAddress(item: MJCabinetItem): Promise<number | null> {
    // 1. Si el payload trae direccion explicita (futuro), upsert y devolver id
    if (item.consigneeAddress && item.consigneeAddress.trim() && item.consigneeName) {
        try {
            // Resolver user_id vinculado al cliente legacy S87
            const userRes = await pool.query(
                'SELECT claimed_by_user_id FROM legacy_clients WHERE id = $1',
                [MJC_S87_CLIENT_ID]
            );
            const userId = userRes.rows[0]?.claimed_by_user_id;
            if (!userId) return null;

            // Validar campos NOT NULL minimos
            const street = item.consigneeAddress.trim();
            const city = (item.consigneeCity || '').trim();
            const state = (item.consigneeState || '').trim();
            const zip = (item.consigneeZip || '').trim();
            if (!street || !city || !state || !zip) {
                // No tenemos suficientes datos para crear address valido -> fallback default
                console.warn('[MJC FCL] payload consignee incompleto, fallback a default S87');
            } else {
                // Buscar si ya existe una direccion identica
                const existing = await pool.query(
                    `SELECT id FROM addresses
                     WHERE user_id = $1
                       AND COALESCE(street, '') = $2
                       AND COALESCE(city, '') = $3
                     LIMIT 1`,
                    [userId, street, city]
                );
                if (existing.rows.length > 0) {
                    return existing.rows[0].id;
                }

                const ins = await pool.query(
                    `INSERT INTO addresses (
                        user_id, alias, recipient_name, phone, street,
                        city, state, zip_code, is_default, created_at
                     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, NOW())
                     RETURNING id`,
                    [
                        userId,
                        'MJCustomer (auto)',
                        item.consigneeName,
                        item.consigneePhone || null,
                        street,
                        city,
                        state,
                        zip,
                    ]
                );
                return ins.rows[0].id;
            }
        } catch (err) {
            console.warn('[MJC FCL] upsert address fallo, fallback a default:', err);
        }
    }

    // 2. Default del cliente S87 (si tiene)
    try {
        const userRes = await pool.query(
            'SELECT claimed_by_user_id FROM legacy_clients WHERE id = $1',
            [MJC_S87_CLIENT_ID]
        );
        const userId = userRes.rows[0]?.claimed_by_user_id;
        if (!userId) return null;

        const defAddr = await pool.query(
            `SELECT id FROM addresses
             WHERE user_id = $1 AND is_default = TRUE
             ORDER BY created_at DESC
             LIMIT 1`,
            [userId]
        );
        if (defAddr.rows.length > 0) {
            return defAddr.rows[0].id;
        }
    } catch {
        // ignore
    }

    // 3. Sin direccion: NULL para captura manual
    return null;
}

// =============== HELPERS DE FETCH ===============

async function fetchClearancePage(token: string, page: number): Promise<MJClearanceResponse> {
    const resp = await fetchWithTimeout(`${MJC_BASE_URL}/api/cabinet/pageByClearance`, {
        method: 'POST',
        headers: {
            Accept: 'text/plain',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json-patch+json',
            'request-from': 'swagger',
        },
        body: JSON.stringify({ page, pageSize: MJC_PAGE_SIZE, code: '' }),
    });
    return (await resp.json()) as MJClearanceResponse;
}

// =============== UPSERT DE UN ITEM ===============

interface UpsertResult {
    action: 'created' | 'updated' | 'skipped' | 'conflict';
    containerId?: number;
}

async function upsertContainerFromItem(item: MJCabinetItem): Promise<UpsertResult> {
    const cabinetNo = item.cabinetNo?.trim() || null;
    const billNo = item.billNo?.trim() || null;

    if (!cabinetNo && !billNo) {
        // sin identificadores no podemos hacer match: lo registramos como conflicto
        await recordConflict('mapping_error', item, null);
        return { action: 'conflict' };
    }

    // 1. Match por container_number
    let existingId: number | null = null;
    if (cabinetNo) {
        const r1 = await pool.query(
            'SELECT id FROM containers WHERE container_number = $1 LIMIT 1',
            [cabinetNo]
        );
        if (r1.rows.length > 0) existingId = r1.rows[0].id;
    }

    // 2. Match por bl_number si no encontro
    if (!existingId && billNo) {
        const r2 = await pool.query(
            'SELECT id FROM containers WHERE bl_number = $1 LIMIT 1',
            [billNo]
        );
        if (r2.rows.length > 0) existingId = r2.rows[0].id;
    }

    const mappedStatus = mapMJStatusToInternal(item.currentStatusEn);

    // Campos comunes
    const fields = {
        container_number: cabinetNo,
        bl_number: billNo,
        vessel: item.shipNo,
        pol: item.startPort,
        pod: item.destPort,
        eta: item.estimate || item.planGetTime || null,
        mj_container_id: item.id,
        mj_last_sync: new Date().toISOString(),
        cn_status_en: item.currentStatusEn,
        cn_status_ch: item.currentStatusCh,
        service_type: item.serviceType,
        planned_departure: item.planOpenTime,
        actual_departure: item.openTime || item.startTime,
        actual_arrival: item.getTime,
        unloaded_at: item.cabinetedTime,
        delivery_pdf_url: item.file,
        port_name: item.portCodeName,
        ship_carrier_code: item.shipBno,
        total_packages: item.totalQty,
        total_weight_kg: item.totalWeight,
        total_cbm: item.totalCbm,
    };

    try {
        if (existingId) {
            // UPDATE: solo pisa container_number/bl_number si estaban NULL
            // El status manual posterior tampoco se pisa.
            await pool.query(
                `UPDATE containers SET
                    container_number = COALESCE(container_number, $1),
                    bl_number        = COALESCE(bl_number, $2),
                    vessel           = COALESCE($3, vessel),
                    pol              = COALESCE($4, pol),
                    pod              = COALESCE($5, pod),
                    eta              = COALESCE($6::timestamp, eta),
                    mj_container_id  = $7,
                    mj_last_sync     = $8::timestamp,
                    cn_status_en     = $9,
                    cn_status_ch     = $10,
                    service_type     = COALESCE($11, service_type),
                    planned_departure= COALESCE($12::timestamp, planned_departure),
                    actual_departure = COALESCE($13::timestamp, actual_departure),
                    actual_arrival   = COALESCE($14::timestamp, actual_arrival),
                    unloaded_at      = COALESCE($15::timestamp, unloaded_at),
                    delivery_pdf_url = COALESCE($16, delivery_pdf_url),
                    port_name        = COALESCE($17, port_name),
                    ship_carrier_code= COALESCE($18, ship_carrier_code),
                    total_packages   = COALESCE($19, total_packages),
                    total_weight_kg  = COALESCE($20, total_weight_kg),
                    total_cbm        = COALESCE($21, total_cbm),
                    status           = CASE
                        WHEN $22::text IS NULL THEN status
                        WHEN status = ANY($23::text[]) THEN status
                        ELSE $22
                    END,
                    updated_at = NOW()
                 WHERE id = $24`,
                [
                    fields.container_number,
                    fields.bl_number,
                    fields.vessel,
                    fields.pol,
                    fields.pod,
                    fields.eta,
                    fields.mj_container_id,
                    fields.mj_last_sync,
                    fields.cn_status_en,
                    fields.cn_status_ch,
                    fields.service_type,
                    fields.planned_departure,
                    fields.actual_departure,
                    fields.actual_arrival,
                    fields.unloaded_at,
                    fields.delivery_pdf_url,
                    fields.port_name,
                    fields.ship_carrier_code,
                    fields.total_packages,
                    fields.total_weight_kg,
                    fields.total_cbm,
                    mappedStatus,
                    Array.from(MANUAL_TERMINAL_STATUSES),
                    existingId,
                ]
            );
            return { action: 'updated', containerId: existingId };
        }

        // ===== UPDATE-ONLY MODE =====
        // No insertamos contenedores nuevos: solo enriquecemos los que ya existen
        // en nuestro sistema. Registramos el item como 'not_found' para que el
        // operador pueda revisarlo en el panel de conflictos.
        await recordConflict('not_found', item, null);
        return { action: 'skipped' };
    } catch (err: any) {
        // Violacion de UNIQUE constraint -> conflicto
        if (err?.code === '23505') {
            const conflictType = err?.constraint?.includes('bl_number')
                ? 'duplicate_bl'
                : 'duplicate_container';
            await recordConflict(conflictType, item, existingId);
            return { action: 'conflict' };
        }
        throw err;
    }
}

async function recordConflict(
    conflictType: string,
    item: MJCabinetItem,
    existingContainerId: number | null
): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO mjcustomer_sync_conflicts (
                conflict_type, mj_container_id, cabinet_no, bill_no,
                existing_container_id, payload
             ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                conflictType,
                item.id,
                item.cabinetNo,
                item.billNo,
                existingContainerId,
                JSON.stringify(item),
            ]
        );
    } catch (err) {
        console.error('[MJC FCL] no se pudo registrar conflicto:', err);
    }
}

// Mapea codigo de puerto destino -> codigo de ruta maritima.
// Si el puerto es desconocido, devuelve null y la ruta queda en NULL.
function inferRouteFromDestPort(destPort: string): string | null {
    const map: Record<string, string> = {
        MXZLO: 'CHN-MZN-MXC',   // Manzanillo
        MXLZC: 'CHN-LZC-MEX',   // Lazaro Cardenas
        USLAX: 'CHN-LAX-ELP-MEX', // Los Angeles
    };
    return map[destPort.toUpperCase()] || null;
}

// =============== ORQUESTADOR ===============

export async function runMJCustomerFclSync(triggeredBy: string): Promise<SyncSummary> {
    const t0 = Date.now();
    const logIns = await pool.query(
        `INSERT INTO mjcustomer_sync_log (triggered_by) VALUES ($1) RETURNING id`,
        [triggeredBy]
    );
    const logId = logIns.rows[0].id;

    let pagesFetched = 0;
    let itemsFetched = 0;
    let itemsCreated = 0;
    let itemsUpdated = 0;
    let itemsSkipped = 0;
    let itemsConflict = 0;
    let success = false;
    let errorMessage: string | undefined;

    try {
        const token = await getMJCustomerToken();
        let page = 1;
        let hasNext = true;

        while (hasNext && page <= MJC_MAX_PAGES) {
            const resp = await fetchClearancePage(token, page);
            pagesFetched++;

            if (resp.code === 401) {
                // Token expirado: forzar relogin y reintentar esta misma pagina una vez
                console.warn('[MJC FCL] token expirado, relogin...');
                await loginToMJCustomer();
                const fresh = await getMJCustomerToken();
                const retry = await fetchClearancePage(fresh, page);
                if (retry.code !== 200 || !retry.result) {
                    throw new Error(`MJCustomer error tras relogin: ${retry.message}`);
                }
                resp.result = retry.result;
                resp.code = retry.code;
            }

            if (resp.code !== 200 || !resp.result) {
                throw new Error(`MJCustomer API error (page=${page}): ${resp.message || resp.code}`);
            }

            const items = resp.result.items || [];
            itemsFetched += items.length;

            for (const item of items) {
                try {
                    const r = await upsertContainerFromItem(item);
                    if (r.action === 'created') itemsCreated++;
                    else if (r.action === 'updated') itemsUpdated++;
                    else if (r.action === 'skipped') itemsSkipped++;
                    else if (r.action === 'conflict') itemsConflict++;
                } catch (itemErr: any) {
                    console.error(
                        `[MJC FCL] error procesando item ${item.cabinetNo}:`,
                        itemErr?.message || itemErr
                    );
                    itemsConflict++;
                    await recordConflict('mapping_error', item, null);
                }
            }

            hasNext = resp.result.hasNextPage === true;
            page++;
        }

        success = true;
    } catch (err: any) {
        errorMessage = err?.message || String(err);
        console.error('[MJC FCL] sync fallo:', errorMessage);
    } finally {
        await pool.query(
            `UPDATE mjcustomer_sync_log
             SET finished_at = NOW(),
                 items_fetched = $1,
                 items_created = $2,
                 items_updated = $3,
                 items_conflict = $4,
                 pages_fetched = $5,
                 success = $6,
                 error_message = $7
             WHERE id = $8`,
            [
                itemsFetched,
                itemsCreated,
                itemsUpdated,
                itemsConflict,
                pagesFetched,
                success,
                errorMessage || null,
                logId,
            ]
        );
    }

    return {
        success,
        pagesFetched,
        itemsFetched,
        itemsCreated,
        itemsUpdated,
        itemsSkipped,
        itemsConflict,
        error: errorMessage,
        durationMs: Date.now() - t0,
    };
}

// =============== ENDPOINTS HTTP ===============

// POST /api/admin/fcl/sync-mjcustomer (super_admin)
export const triggerMJCustomerFclSync = async (
    req: AuthRequest,
    res: Response
): Promise<any> => {
    try {
        const userId = req.user?.id || 0;
        const summary = await runMJCustomerFclSync(`manual:${userId}`);
        return res.json({ success: summary.success, summary });
    } catch (err: any) {
        console.error('[MJC FCL] trigger error:', err);
        return res
            .status(500)
            .json({ success: false, error: err?.message || 'Error al sincronizar' });
    }
};

// GET /api/admin/fcl/sync-mjcustomer/status
export const getMJCustomerFclSyncStatus = async (
    _req: Request,
    res: Response
): Promise<any> => {
    try {
        const lastRun = await pool.query(
            `SELECT * FROM mjcustomer_sync_log
             ORDER BY started_at DESC
             LIMIT 1`
        );
        const conflictsCount = await pool.query(
            `SELECT COUNT(*)::int AS n FROM mjcustomer_sync_conflicts WHERE resolved = FALSE`
        );
        return res.json({
            lastRun: lastRun.rows[0] || null,
            unresolvedConflicts: conflictsCount.rows[0].n,
        });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message });
    }
};

// GET /api/admin/fcl/sync-mjcustomer/conflicts
export const listMJCustomerFclConflicts = async (
    _req: Request,
    res: Response
): Promise<any> => {
    try {
        const rows = await pool.query(
            `SELECT id, detected_at, conflict_type, mj_container_id, cabinet_no, bill_no,
                    existing_container_id, resolved, resolved_at, notes
             FROM mjcustomer_sync_conflicts
             WHERE resolved = FALSE
             ORDER BY detected_at DESC
             LIMIT 200`
        );
        return res.json(rows.rows);
    } catch (err: any) {
        return res.status(500).json({ error: err?.message });
    }
};
