// ============================================
// CONTROLADOR DE RECEPCIÓN CHINA (TDI Aéreo)
// Procesa datos del sistema externo chino
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';
import { createNotification } from './notificationController';
import { duenoDeLaMarca, casilleroSinAnotacion } from './boxLinkReconcile';
import crypto from 'crypto';
import { fechaDeRecepcionChina } from './tipoCambioDelDia';
import { sm2 } from 'sm-crypto';
import { buscarOrdenPorFno, cajasDeOrden, trayectoriaDeCaja, gzmojieConfigurado } from './gzmojieClient';

/**
 * 🎯 Resuelve el precio USD/kg para un (user_id, tariff_type) consultando:
 *   1. air_client_tariffs (priorizando user_id, luego legacy_client_id vía box_id)
 *   2. air_tariffs (precio general de la ruta activa)
 * Devuelve 0 si no encuentra (jamás usar fallback hardcodeado).
 * Acepta `pool` o un `client` ya conectado.
 */
export async function resolveAirPricePerKg(
    db: { query: (q: string, p?: any[]) => Promise<any> },
    userId: number | null,
    tariffType: string,
    routeId?: number | null
): Promise<number> {
    try {
        // Resolver ruta activa si no se pasó
        let rid = routeId || null;
        if (!rid) {
            const r = await db.query(
                `SELECT id FROM air_routes WHERE is_active = true AND code <> 'TDI-EXPRES'
                  ORDER BY id ASC LIMIT 1`);
            rid = r.rows[0]?.id || null;
        }
        if (!rid) return 0;

        // 1. Acuerdo del cliente: puede ser precio fijo o nivel sobre la general,
        //    y puede mandar sobre el tipo de carga (tarea 1070).
        if (userId) {
            const { resolverTarifaDeCliente } = await import('./tarifaDeCliente');
            const acuerdo = await resolverTarifaDeCliente(db, {
                userId, routeId: rid, tipoSugerido: tariffType,
            });
            if (acuerdo.esDeCliente && acuerdo.pricePerKg > 0) return acuerdo.pricePerKg;
        }
        // 2. Tarifa general
        const gt = await db.query(
            `SELECT price_per_kg FROM air_tariffs
             WHERE route_id = $1 AND tariff_type = $2 AND is_active = true LIMIT 1`,
            [rid, tariffType]
        );
        return gt.rows[0]?.price_per_kg ? parseFloat(gt.rows[0].price_per_kg) : 0;
    } catch (e) {
        console.error('[resolveAirPricePerKg] Error:', e);
        return 0;
    }
}

/**
 * 🏠 Auto-asigna la dirección predeterminada del cliente para servicio "air".
 * Busca en `addresses` filtrando por `default_for_service` que contenga 'air' o 'all'
 * (priorizando `is_default`). Devuelve `null` si el usuario no tiene dirección configurada.
 * Acepta `pool` o `client` transaccional.
 */
export async function resolveDefaultAirAddress(
    db: { query: (q: string, p?: any[]) => Promise<any> },
    userId: number | null
): Promise<number | null> {
    if (!userId) return null;
    try {
        const r = await db.query(
            `SELECT id FROM addresses
             WHERE user_id = $1
               AND (default_for_service ILIKE '%air%' OR default_for_service ILIKE '%all%')
             ORDER BY is_default DESC, id ASC
             LIMIT 1`,
            [userId]
        );
        return r.rows[0]?.id || null;
    } catch (e) {
        console.error('[resolveDefaultAirAddress] Error:', e);
        return null;
    }
}

// INTERFACES DEL JSON DE LA API CHINA
interface ChinaApiPayload {
    fno: string;           // "AIR2609..." - Identificador único del envío
    shippingMark: string;  // "S3019" - Código del cliente
    totalQty: number;      // Total de cajas
    totalWeight: number;   // Peso total en kg
    totalVolume: number;   // Volumen total
    totalCbm: number;      // CBM total
    file: string[];        // Array de URLs de fotos/evidencias
    data: ChinaPackageData[]; // Array de cajas individuales
}

interface ChinaPackageData {
    childNo: string;       // "AIR2609...-001" - ID único de la caja
    trajecotryName: string; // Nombre de la trayectoria (typo en API original)
    weight: number;
    long: number;          // Largo en cm
    width: number;         // Ancho en cm
    height: number;        // Alto en cm
    proName: string;       // Descripción del producto
    customsBno: string;    // Código aduanal
    singleVolume: number;
    singleCbm: number;
    billNo?: string | null; // Guía aérea internacional (puede venir después)
    etd?: string | null;    // Fecha estimada de salida
    eta?: string | null;    // Fecha estimada de llegada
}

// ============================================
// EL SISTEMA CHINO CAMBIA COMO ESCRIBE SUS CAMPOS
// ============================================
// El 12 de noviembre MoJie empezo a mandar `Fno`, `Data`, `ChildNo` con
// mayuscula inicial. Los campos de arriba ya se leian de las dos formas, pero
// los de adentro de cada caja no: `item.childNo` llegaba vacio y el callback
// moria en el primer `.slice`. Entre el 12 y el 25 de noviembre se rechazaron
// asi 220 empujes y 93 guias nunca entraron al sistema (tarea 1114).
//
// Del lado de ellos esos empujes cuentan como exitosos, por eso su pantalla
// marca cero fallos y no los reintenta: la falla no se ve desde alla. Asi que
// aqui los campos se leen sin importar como vengan escritos -mayusculas,
// minusculas o guion bajo- y la proxima vez que cambien la forma la entrada
// sigue de pie.
function campoDeChina(obj: any, ...alias: string[]): any {
    if (!obj || typeof obj !== 'object') return undefined;
    const plano: Record<string, any> = {};
    for (const llave of Object.keys(obj)) {
        const limpia = llave.toLowerCase().replace(/[^a-z0-9]/g, '');
        const actual = plano[limpia];
        if (actual === undefined || actual === null || actual === '') plano[limpia] = obj[llave];
    }
    for (const a of alias) {
        const valor = plano[a.toLowerCase().replace(/[^a-z0-9]/g, '')];
        if (valor !== undefined && valor !== null && valor !== '') return valor;
    }
    return undefined;
}

/** Una caja del payload chino, venga como venga escrita. */
export function normalizaCajaDeChina(crudo: any): ChinaPackageData {
    return {
        childNo: campoDeChina(crudo, 'childNo', 'childNumber', 'childCode'),
        trajecotryName: campoDeChina(crudo, 'trajecotryName', 'trajectoryName') ?? '',
        weight: campoDeChina(crudo, 'weight') ?? 0,
        long: campoDeChina(crudo, 'long', 'length') ?? 0,
        width: campoDeChina(crudo, 'width') ?? 0,
        height: campoDeChina(crudo, 'height') ?? 0,
        proName: campoDeChina(crudo, 'proName', 'productName') ?? null,
        customsBno: campoDeChina(crudo, 'customsBno') ?? null,
        singleVolume: campoDeChina(crudo, 'singleVolume') ?? 0,
        singleCbm: campoDeChina(crudo, 'singleCbm') ?? 0,
        billNo: campoDeChina(crudo, 'billNo', 'awb', 'awbNo') ?? null,
        etd: campoDeChina(crudo, 'etd') ?? null,
        eta: campoDeChina(crudo, 'eta') ?? null,
    } as ChinaPackageData;
}

/** La orden completa con sus cajas. */
export function normalizaPayloadDeChina(crudo: any): ChinaApiPayload {
    const cajas = campoDeChina(crudo, 'data', 'items', 'packages', 'boxes', 'list');
    const archivo = campoDeChina(crudo, 'file', 'files', 'evidenceUrls');
    let evidencias: string[] = [];
    if (Array.isArray(archivo)) {
        evidencias = archivo;
    } else if (typeof archivo === 'string' && archivo.trim()) {
        const texto = archivo.trim();
        if (texto.startsWith('[')) {
            try {
                const leido = JSON.parse(texto);
                evidencias = Array.isArray(leido) ? leido : [texto];
            } catch { evidencias = [texto]; }
        } else {
            evidencias = [texto];
        }
    }
    return {
        fno: campoDeChina(crudo, 'fno', 'orderNo', 'orderCode', 'orderId'),
        shippingMark: campoDeChina(crudo, 'shippingMark', 'mark', 'customerCode'),
        totalQty: campoDeChina(crudo, 'totalQty', 'qty', 'quantity') ?? 0,
        totalWeight: campoDeChina(crudo, 'totalWeight', 'weight') ?? 0,
        totalVolume: campoDeChina(crudo, 'totalVolume', 'volume') ?? 0,
        totalCbm: campoDeChina(crudo, 'totalCbm', 'cbm') ?? 0,
        file: evidencias,
        data: Array.isArray(cajas) ? cajas.map(normalizaCajaDeChina) : [],
    } as ChinaApiPayload;
}

/**
 * El numero interno de una caja que viene de China.
 *
 * Se armaba con los ultimos 8 caracteres del numero chino, y esos 8 no
 * alcanzan: 'AIR202611020002-001', 'AIR202611120002-001' y
 * 'AIR202611230002-001' terminan los tres en '0002-001', porque lo que se
 * recorta es justo la fecha. El consecutivo de China se reinicia cada dia,
 * asi que dos cajas con el mismo consecutivo en dias distintos chocaban
 * contra la llave unica y la guia se quedaba fuera sin que nadie se enterara.
 * De las 93 guias que se recuperaron, 26 cayeron ahi (tarea 1114).
 *
 * El numero corto se respeta cuando esta libre -las que ya existen no se
 * tocan y las nuevas se siguen viendo igual-; solo cuando ya lo tiene otra
 * caja se usa el numero chino completo, que si trae la fecha.
 */
async function trackingInternoDeChina(
    db: { query: (q: string, p?: any[]) => Promise<any> },
    childNo: string,
): Promise<string> {
    const corto = `CN-${String(childNo).slice(-8)}`;
    const ocupado = await db.query(
        `SELECT child_no FROM packages WHERE tracking_internal = $1 LIMIT 1`, [corto]);
    if (ocupado.rows.length === 0 || ocupado.rows[0].child_no === childNo) return corto;
    return `CN-${String(childNo).replace(/^AIR/i, '')}`;
}

// ============================================
// WEBHOOK: Recibir datos de China
// POST /api/china/receive
// ============================================
export const receiveFromChina = async (req: Request, res: Response): Promise<any> => {
    const client = await pool.connect();
    const sourceIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    
    // SIEMPRE guardar el payload RAW para debug (antes de cualquier procesamiento)
    try {
        await client.query(`
            INSERT INTO china_callback_logs (raw_payload, headers, source_ip, success)
            VALUES ($1, $2, $3, false)
        `, [JSON.stringify(req.body), JSON.stringify(req.headers), sourceIp]);
    } catch (logErr) {
        console.error('Error guardando log:', logErr);
    }
    
    try {
        // LOG COMPLETO del payload recibido para debug
        console.log("========================================");
        console.log("📥 CHINA CALLBACK RECIBIDO:");
        console.log("Source IP:", sourceIp);
        console.log("Body RAW:", JSON.stringify(req.body, null, 2));
        console.log("========================================");
        
        // Los nombres de los campos cambian del lado chino, asi que se leen
        // sin importar como vengan escritos (tarea 1114).
        const rawBody = req.body;
        const payload: ChinaApiPayload = normalizaPayloadDeChina(rawBody);
        
        console.log("📦 Recibiendo FNO:", payload.fno, "- ShippingMark:", payload.shippingMark);
        console.log("  → Evidencias:", payload.file.length, "archivo(s)");
        
        // Validar campos requeridos
        if (!payload.fno) {
            console.error("❌ FNO no encontrado en payload. Campos disponibles:", Object.keys(rawBody));
            return res.status(400).json({ 
                success: false, 
                error: 'Campo FNO requerido', 
                availableFields: Object.keys(rawBody),
                hint: 'Enviar fno, FNO, order_no u orderNo'
            });
        }

        await client.query('BEGIN');

        // 1. IDENTIFICAR CLIENTE por Shipping Mark
        // Primero buscamos en users, luego en legacy_clients
        let userId = null;
        let userName = 'Sin asignar';

        // El casillero con el que se BUSCA va sin la anotacion que China le pega
        // entre parentesis; el que se GUARDA sigue siendo el crudo, porque esa
        // anotacion dice si lleva bateria o si va con declaracion aduanal.
        const marcaBusqueda = casilleroSinAnotacion(payload.shippingMark) || payload.shippingMark;

        // Buscar en users primero
        const userCheck = await client.query(
            `SELECT id, full_name FROM users WHERE UPPER(box_id) = UPPER($1)`,
            [marcaBusqueda]
        );
        
        if (userCheck.rows.length > 0) {
            userId = userCheck.rows[0].id;
            userName = userCheck.rows[0].full_name;
        } else {
            // Buscar en legacy_clients y verificar si está reclamado
            const legacyCheck = await client.query(
                `SELECT lc.box_id, lc.full_name, lc.claimed_by_user_id, u.full_name as claimed_name
                 FROM legacy_clients lc
                 LEFT JOIN users u ON lc.claimed_by_user_id = u.id
                 WHERE UPPER(lc.box_id) = UPPER($1)`,
                [marcaBusqueda]
            );
            
            if (legacyCheck.rows.length > 0) {
                const legacy = legacyCheck.rows[0];
                if (legacy.claimed_by_user_id) {
                    userId = legacy.claimed_by_user_id;
                    userName = legacy.claimed_name || legacy.full_name;
                } else {
                    userName = `${legacy.full_name} (Legacy: ${legacy.box_id})`;
                }
            }
        }
        
        console.log(`  → Cliente identificado: ${userName} (ID: ${userId || 'N/A'})`);

        // 🏠 Auto-asignar dirección predeterminada para servicio 'air'
        const defaultAirAddressId = await resolveDefaultAirAddress(client, userId);
        if (defaultAirAddressId) {
            console.log(`  → Dirección predeterminada 'air' asignada automáticamente: ID ${defaultAirAddressId}`);
        }

        // 2. INSERTAR O ACTUALIZAR RECIBO CHINA (FNO)
        const receiptQuery = await client.query(`
            INSERT INTO china_receipts 
            (fno, user_id, shipping_mark, total_qty, total_weight, total_volume, total_cbm, evidence_urls, delivery_address_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (fno) DO UPDATE SET
                total_qty = EXCLUDED.total_qty,
                total_weight = EXCLUDED.total_weight,
                total_volume = EXCLUDED.total_volume,
                total_cbm = EXCLUDED.total_cbm,
                evidence_urls = EXCLUDED.evidence_urls,
                delivery_address_id = COALESCE(china_receipts.delivery_address_id, EXCLUDED.delivery_address_id),
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        `, [
            payload.fno,
            userId,
            payload.shippingMark,
            payload.totalQty,
            payload.totalWeight,
            payload.totalVolume,
            payload.totalCbm,
            payload.file || [],
            defaultAirAddressId
        ]);

        const receiptId = receiptQuery.rows[0].id;
        console.log(`  → Recibo ID: ${receiptId}`);

        // 3. PROCESAR CAJAS INDIVIDUALES (data)
        let packagesCreated = 0;
        let packagesUpdated = 0;

        for (const item of payload.data) {
            // Verificar si la caja ya existe
            const existingPkg = await client.query(
                'SELECT id FROM packages WHERE child_no = $1',
                [item.childNo]
            );

            // === CALCULAR PRECIO DE VENTA ===
            // La ruta aerea de China es la primera activa que NO es la express:
            // hay dos activas y la consulta no traia ORDER BY, asi que desde que
            // nacio la segunda -el 17 de junio- el cobro se fue a la de TDI
            // Express, que es otro servicio y cuesta como un dolar menos por
            // kilo. El cotizador y el manifiesto siempre usaron la primera, asi
            // que lo cotizado y lo cobrado no empataban (tarea 1114).
            const routeRes = await client.query(`
                SELECT id FROM air_routes
                 WHERE is_active = true AND code <> 'TDI-EXPRES'
                 ORDER BY id ASC LIMIT 1
            `);
            const airRouteId = routeRes.rows.length > 0 ? routeRes.rows[0].id : null;
            
            // Determinar tipo de tarifa basado en proName/descripción
            const proNameLower = (item.proName || '').toLowerCase();
            let tariffType = 'G'; // Por defecto Genérico
            if (proNameLower.includes('logo') || proNameLower.includes('鞋') || proNameLower.includes('zapato') || proNameLower.includes('shoes')) {
                tariffType = 'L';
            } else if (proNameLower.includes('medical') || proNameLower.includes('sensible') || proNameLower.includes('medicina')) {
                tariffType = 'S';
            }
            
            // Buscar precio: primero verificar si el cliente tiene tarifa custom (Logo/Genérico/Flat).
            // Si la tiene, NO aplicar Startup (los clientes con tarifa personalizada usan per-kg siempre).
            // Sino, verificar Start Up para paquetes pequeños, luego tarifa general.
            const itemWeight = parseFloat(String(item.weight || 0)) || 0;

            // PESO COBRABLE: lo que la caja ocupa de verdad en el avion. Una caja
            // grande y liviana paga por su volumen, no por lo que marca la
            // bascula. El volumetrico lo declara China en `singleVolume`
            // (L x W x H / 6000, verificado contra 3,456 de 3,456 guias); si no
            // viene en el payload se calcula igual.
            //
            // El cobro por kilo se hacia sobre el peso real y por ahi se cobraba
            // de menos: en los ultimos 10 dias, de 458 precios aereos asignados,
            // en 156 el volumetrico mandaba sobre el real y los 156 se cobraron
            // por el real (tareas 1081 y 1086).
            const volumetricoDeclarado = parseFloat(String(item.singleVolume || 0)) || 0;
            const largoCm = parseFloat(String(item.long || 0)) || 0;
            const anchoCm = parseFloat(String(item.width || 0)) || 0;
            const altoCm = parseFloat(String(item.height || 0)) || 0;
            const volumetrico = volumetricoDeclarado > 0
                ? volumetricoDeclarado
                : (largoCm * anchoCm * altoCm) / 6000;
            const pesoCobrable = Math.max(itemWeight, volumetrico > 0 ? volumetrico : 0);
            let pricePerKg = 0;
            let isCustomTariff = false;
            let salePrice = 0;
            let isStartup = false;

            // 1️⃣ ¿Cliente tiene tarifa custom para este tipo?
            //
            // El acuerdo puede MANDAR sobre el tipo que salio de la descripcion:
            // un cliente con trato Flat que manda zapatos caia siempre en Logo y
            // su tarifa Flat no se alcanzaba nunca -de las 14,667 guias aereas
            // del sistema, CERO son Flat- (tarea 1070). Y si el acuerdo esta
            // guardado como nivel, el precio se calcula ahora y sigue al costo de
            // la ruta, en vez de quedarse congelado en el numero de aquel dia.
            //
            // Y la tarifa es la del DIA EN QUE LA CARGA ENTRO A CHINA, que viene
            // dentro del propio numero de guia (tareas 1086 y 1115). Este
            // callback casi siempre llega el mismo dia, asi que normalmente da
            // igual; cuenta cuando una guia entra tarde -como las 93 que se
            // quedaron fuera desde el 12 de noviembre por el cambio de campos-
            // para que no se le cobre la tarifa de hoy.
            const fechaDeChina = fechaDeRecepcionChina(String(item.childNo || ''))
                || fechaDeRecepcionChina(String(payload.fno || ''));
            let hasCustomTariff = false;
            if (airRouteId && userId) {
                const { resolverTarifaDeCliente } = await import('./tarifaDeCliente');
                const acuerdo = await resolverTarifaDeCliente(client, {
                    userId, routeId: airRouteId, tipoSugerido: tariffType, fecha: fechaDeChina,
                });
                if (acuerdo.esDeCliente && acuerdo.pricePerKg > 0) {
                    tariffType = acuerdo.tipo;
                    pricePerKg = acuerdo.pricePerKg;
                    isCustomTariff = true;
                    hasCustomTariff = true;
                    console.log(`   [tarifa] ${item.childNo}: ${acuerdo.origen}`);
                }
            }

            // 2️⃣ Si NO tiene tarifa custom y peso ≤15kg → aplicar Startup
            //
            // El tramo se mide con el peso REAL a proposito, igual que el cobro
            // (tdiExpressController) y que el cotizador (tarea 809): si aqui se
            // midiera con el cobrable, lo cotizado y lo facturado dejarian de
            // empatar. El Start Up es un precio PLANO: el peso cobrable no entra
            // en su cuenta, solo se guarda para que se vea en la cotizacion.
            if (!hasCustomTariff && airRouteId && itemWeight > 0 && itemWeight <= 15) {
                const startupRes = await client.query(`
                    SELECT price_usd FROM air_startup_tiers
                    WHERE route_id = $1 AND is_active = true AND $2 >= min_weight AND $2 <= max_weight
                    LIMIT 1
                `, [airRouteId, itemWeight]);
                if (startupRes.rows.length > 0) {
                    salePrice = parseFloat(startupRes.rows[0].price_usd);
                    pricePerKg = itemWeight > 0 ? salePrice / itemWeight : 0;
                    isStartup = true;
                    tariffType = 'SU';
                }
            }

            // 3️⃣ Si no es startup, calcular per-kg (custom o general)
            if (!isStartup) {
                if (pricePerKg === 0 && airRouteId) {
                    const { tarifaGeneralDelDia } = await import('./tarifaAereaDelDia');
                    const general = await tarifaGeneralDelDia(client, airRouteId, tariffType, fechaDeChina);
                    if (general.precio > 0) {
                        pricePerKg = general.precio;
                        console.log(`   [tarifa] ${item.childNo}: ${general.origen}`);
                    }
                }
                salePrice = pesoCobrable * pricePerKg;
            }
            
            console.log(`   📦 ${item.childNo}: ${tariffType} | ${itemWeight}kg real / ${pesoCobrable.toFixed(2)}kg cobrable ${isStartup ? `STARTUP $${salePrice.toFixed(2)}` : `× $${pricePerKg}/kg = $${salePrice.toFixed(2)}`} (${isCustomTariff ? 'CUSTOM' : 'GENERAL'})`);

            if (existingPkg.rows.length > 0) {
                // ACTUALIZAR caja existente (ej: cuando llega el billNo)
                // Si no tiene precio asignado, asignarlo ahora (congelar precio)
                const existingId = existingPkg.rows[0].id;
                const hasPriceRes = await client.query(
                    'SELECT air_sale_price FROM packages WHERE id = $1',
                    [existingId]
                );
                const hasExistingPrice = hasPriceRes.rows.length > 0 && 
                    hasPriceRes.rows[0].air_sale_price !== null && 
                    parseFloat(hasPriceRes.rows[0].air_sale_price) > 0;

                if (hasExistingPrice) {
                    // Ya tiene precio congelado → NO sobrescribir
                    await client.query(`
                        UPDATE packages SET
                            international_tracking = COALESCE($1, international_tracking),
                            weight = $2,
                            pro_name = $3,
                            customs_bno = $4,
                            etd = $5,
                            eta = $6,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE child_no = $7
                    `, [
                        item.billNo || null,
                        item.weight,
                        item.proName,
                        item.customsBno,
                        item.etd || null,
                        item.eta || null,
                        item.childNo
                    ]);
                } else {
                    // No tiene precio → asignar precio congelado ahora
                    await client.query(`
                        UPDATE packages SET
                            international_tracking = COALESCE($1, international_tracking),
                            weight = $2,
                            pro_name = $3,
                            customs_bno = $4,
                            etd = $5,
                            eta = $6,
                            air_route_id = $8,
                            air_tariff_type = $9,
                            air_price_per_kg = $10,
                            air_sale_price = $11,
                            air_is_custom_tariff = $12,
                            air_chargeable_weight = $13,
                            air_price_assigned_at = NOW(),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE child_no = $7
                    `, [
                        item.billNo || null,
                        item.weight,
                        item.proName,
                        item.customsBno,
                        item.etd || null,
                        item.eta || null,
                        item.childNo,
                        airRouteId,
                        tariffType,
                        pricePerKg,
                        salePrice,
                        isCustomTariff,
                        pesoCobrable > 0 ? pesoCobrable : null
                    ]);
                }
                packagesUpdated++;
            } else {
                // CREAR nueva caja CON PRECIO CONGELADO
                const trackingInternal = await trackingInternoDeChina(client, item.childNo);
                const dimensions = `${item.long}x${item.width}x${item.height}`;
                
                await client.query(`
                    INSERT INTO packages 
                    (tracking_internal, child_no, china_receipt_id, user_id, box_id,
                     weight, dimensions, long_cm, width_cm, height_cm,
                     description, pro_name, customs_bno, trajectory_name,
                     single_volume, single_cbm, international_tracking,
                     etd, eta, service_type, warehouse_location, status,
                     air_route_id, air_tariff_type, air_price_per_kg, air_sale_price, air_is_custom_tariff,
                     air_chargeable_weight, air_price_assigned_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, NOW())
                `, [
                    trackingInternal,
                    item.childNo,
                    receiptId,
                    userId,
                    // La caja nacia SIN casillero. Si el cliente no se encuentra en
                    // ese momento —porque es del sistema anterior o se registra
                    // despues— la caja queda huerfana y sin marca encima, asi que
                    // el reconcile nocturno ya no tiene por donde recuperarla.
                    payload.shippingMark || null,
                    item.weight,
                    dimensions,
                    item.long,
                    item.width,
                    item.height,
                    item.proName,
                    item.proName,
                    item.customsBno,
                    item.trajecotryName,
                    item.singleVolume,
                    item.singleCbm,
                    item.billNo || null,
                    item.etd || null,
                    item.eta || null,
                    'AIR_CHN_MX',
                    'china_air',
                    'received_china',
                    airRouteId,
                    tariffType,
                    pricePerKg,
                    salePrice,
                    isCustomTariff,
                    pesoCobrable > 0 ? pesoCobrable : null
                ]);
                packagesCreated++;
            }
        }

        await client.query('COMMIT');
        
        // === ACTUALIZAR SALDO EN CHINA_RECEIPTS ===
        // Calcular el total de air_sale_price de los paquetes asociados
        const totalSaleRes = await pool.query(`
            SELECT COALESCE(SUM(air_sale_price), 0) as total_sale
            FROM packages 
            WHERE china_receipt_id = $1 AND air_sale_price IS NOT NULL
        `, [receiptId]);
        const totalSale = parseFloat(totalSaleRes.rows[0].total_sale) || 0;
        
        // Si no hay precios en packages, usar estimado basado en peso del receipt
        if (totalSale > 0) {
            await pool.query(`
                UPDATE china_receipts 
                SET assigned_cost_mxn = $1, saldo_pendiente = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2 AND (assigned_cost_mxn IS NULL OR assigned_cost_mxn != $1)
            `, [totalSale, receiptId]);
            console.log(`  💰 Saldo asignado: $${totalSale.toFixed(2)} USD`);
        } else if (payload.totalWeight > 0) {
            // Sin packages con precio: aplicar tarifario oficial (cliente → general).
            // Default tariff_type = 'L' (Logo) si el usuario no tiene preferencia.
            const estPerKg = await resolveAirPricePerKg(pool, userId, 'L');
            const estimatedCost = payload.totalWeight * estPerKg;
            await pool.query(`
                UPDATE china_receipts 
                SET assigned_cost_mxn = $1, saldo_pendiente = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2 AND assigned_cost_mxn IS NULL
            `, [estimatedCost, receiptId]);
            console.log(`  💰 Saldo estimado: $${estimatedCost.toFixed(2)} USD (${payload.totalWeight}kg × $${estPerKg.toFixed(2)}/kg tarifario)`);
        }

        // Marcar log como exitoso
        await pool.query(`
            UPDATE china_callback_logs 
            SET success = true 
            WHERE id = (
                SELECT id FROM china_callback_logs 
                WHERE raw_payload->>'fno' = $1 OR raw_payload->>'FNO' = $1
                ORDER BY created_at DESC LIMIT 1
            )
        `, [payload.fno]);

        console.log(`  ✅ FNO ${payload.fno}: ${packagesCreated} cajas creadas, ${packagesUpdated} actualizadas`);

        res.json({
            success: true,
            message: 'Datos de China procesados correctamente',
            data: {
                fno: payload.fno,
                receiptId,
                userId,
                packagesCreated,
                packagesUpdated
            }
        });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("❌ Error API China:", error);
        
        // Guardar error en log
        try {
            await pool.query(`
                UPDATE china_callback_logs 
                SET error_message = $1 
                WHERE id = (SELECT MAX(id) FROM china_callback_logs)
            `, [error.message]);
        } catch (e) {}
        
        res.status(500).json({ 
            success: false, 
            error: 'Error procesando datos de China',
            details: error.message 
        });
    } finally {
        client.release();
    }
};

// ============================================
// RECUPERAR LOS EMPUJES QUE SE QUEDARON FUERA
// POST /api/china/reprocess-failed
// ============================================
// Del lado chino estos empujes quedaron marcados como exitosos -su pantalla
// dice cero fallos-, asi que su boton de "reenviar los fallidos" no los va a
// mandar de nuevo: para ellos nunca fallaron. El payload completo si quedo
// guardado en china_callback_logs, de modo que la recuperacion se hace desde
// aqui y por el MISMO camino que usa el webhook, para que no exista una
// segunda copia del codigo que con el tiempo se desvie. Cada reproceso deja
// su propio renglon en la bitacora (tarea 1114).
//
// Con `simulacion: true` solo cuenta e informa, sin tocar nada.
export const reprocesarCallbacksFallidos = async (req: Request, res: Response): Promise<any> => {
    try {
        const cuerpo = req.body || {};
        const desde = String(cuerpo.desde || '2026-11-12');
        const soloPendientes = cuerpo.soloPendientes !== false;
        const simulacion = cuerpo.simulacion === true;

        // El ultimo empuje de cada guia que no entro.
        const fallidos = await pool.query(`
            SELECT DISTINCT ON (fno) fno, id, raw_payload
              FROM (
                SELECT id, raw_payload,
                       COALESCE(raw_payload->>'Fno', raw_payload->>'fno',
                                raw_payload->>'FNO', raw_payload->>'orderNo') AS fno
                  FROM china_callback_logs
                 WHERE created_at >= $1::date AND NOT success
              ) t
             WHERE fno IS NOT NULL AND fno <> ''
             ORDER BY fno, id DESC
        `, [desde]);

        const pendientes: any[] = [];
        for (const f of fallidos.rows) {
            if (soloPendientes) {
                const ya = await pool.query(
                    `SELECT 1 FROM packages WHERE child_no LIKE $1 || '%' LIMIT 1`, [f.fno]);
                if (ya.rows.length > 0) continue;
            }
            pendientes.push(f);
        }

        if (simulacion) {
            return res.json({
                success: true, simulacion: true, desde,
                porEntrar: pendientes.length,
                fnos: pendientes.map((p: any) => p.fno),
            });
        }

        const resultados: any[] = [];
        for (const p of pendientes) {
            const salida = await new Promise<any>((resolve) => {
                const resInterno: any = {
                    statusCode: 200,
                    status(c: number) { this.statusCode = c; return this; },
                    json(respuesta: any) { resolve({ status: this.statusCode, respuesta }); return this; },
                };
                receiveFromChina(
                    { body: p.raw_payload, headers: { 'x-forwarded-for': 'reproceso-interno' }, socket: {} } as any,
                    resInterno,
                ).catch((e: any) => resolve({ status: 500, respuesta: { success: false, details: e.message } }));
            });
            const r = salida.respuesta || {};
            resultados.push({
                fno: p.fno,
                ok: r.success === true,
                cajas: r.data?.packagesCreated ?? 0,
                error: r.success === true ? null : (r.details || r.error || 'sin detalle'),
            });
        }

        const entraron = resultados.filter((r) => r.ok).length;
        console.log(`[China] Reproceso: ${entraron} de ${resultados.length} guias recuperadas`);
        return res.json({
            success: true, desde,
            intentados: resultados.length,
            entraron,
            fallaron: resultados.length - entraron,
            resultados,
        });
    } catch (error: any) {
        console.error('[China] Error reprocesando callbacks:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// GET: Listar recepciones de China
// GET /api/china/receipts
// ============================================
export const getChinaReceipts = async (req: Request, res: Response): Promise<any> => {
    try {
        const { status, limit = 1000, offset = 0 } = req.query;

        let query = `
            SELECT 
                cr.*,
                COALESCE(
                    NULLIF(cr.international_tracking, ''),
                    (
                        SELECT p.international_tracking
                        FROM packages p
                        WHERE p.china_receipt_id = cr.id
                          AND p.international_tracking IS NOT NULL
                          AND p.international_tracking <> ''
                        ORDER BY p.updated_at DESC NULLS LAST, p.id DESC
                        LIMIT 1
                    )
                ) as awb_international,
                COALESCE(u.full_name, lc.full_name, 'Sin asignar') as client_name,
                COALESCE(u.box_id, lc.box_id) as client_box_id,
                CASE WHEN u.id IS NOT NULL THEN true ELSE false END as is_registered,
                lc.full_name as legacy_name,
                (SELECT COUNT(*) FROM packages WHERE china_receipt_id = cr.id) as package_count
            FROM china_receipts cr
            LEFT JOIN users u ON cr.user_id = u.id
            LEFT JOIN legacy_clients lc ON UPPER(cr.shipping_mark) = UPPER(lc.box_id)
        `;
        const params: any[] = [];
        
        if (status) {
            // Soporta CSV para agrupar múltiples status: "in_transit_airport_wait,in_transit_loading,in_transit_transfer"
            const statusList = String(status).split(',').map(s => s.trim()).filter(Boolean);
            if (statusList.length === 1) {
                query += ` WHERE cr.status = $1`;
                params.push(statusList[0]);
            } else if (statusList.length > 1) {
                const placeholders = statusList.map((_, i) => `$${i + 1}`).join(', ');
                query += ` WHERE cr.status IN (${placeholders})`;
                params.push(...statusList);
            }
        }

        query += ` ORDER BY cr.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        res.json({
            success: true,
            receipts: result.rows,
            total: result.rowCount
        });

    } catch (error: any) {
        console.error("Error obteniendo recepciones China:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// POST: Crear recepción manual
// POST /api/china/receipts
// ============================================
export const createChinaReceipt = async (req: Request, res: Response): Promise<any> => {
    try {
        const { fno, shipping_mark, total_qty, total_weight, total_cbm, notes } = req.body;

        if (!fno || !shipping_mark) {
            return res.status(400).json({ 
                success: false, 
                error: 'FNO y Shipping Mark son requeridos' 
            });
        }

        // Verificar si ya existe
        const existing = await pool.query('SELECT id FROM china_receipts WHERE fno = $1', [fno]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ 
                success: false, 
                error: 'Ya existe una recepción con ese FNO' 
            });
        }

        // Buscar cliente por shipping_mark - primero en users, luego en legacy_clients
        let userId = null;
        
        const userResult = await pool.query(
            'SELECT id FROM users WHERE UPPER(box_id) = UPPER($1) LIMIT 1',
            [shipping_mark]
        );
        
        if (userResult.rows.length > 0) {
            userId = userResult.rows[0].id;
        } else {
            // Buscar en legacy_clients si está reclamado
            const legacyResult = await pool.query(
                'SELECT claimed_by_user_id FROM legacy_clients WHERE UPPER(box_id) = UPPER($1) AND claimed_by_user_id IS NOT NULL LIMIT 1',
                [shipping_mark]
            );
            if (legacyResult.rows.length > 0) {
                userId = legacyResult.rows[0].claimed_by_user_id;
            }
        }

        // Insertar recepción
        // Calcular costo estimado basado en peso × $21/kg (tarifa estándar)
        const estimatedCost = (total_weight || 0) * 21;

        // 🏠 Auto-asignar dirección predeterminada para servicio 'air'
        const defaultAirAddressId = await resolveDefaultAirAddress(pool, userId);
        if (defaultAirAddressId) {
            console.log(`  → Dirección predeterminada 'air' asignada automáticamente: ID ${defaultAirAddressId}`);
        }

        const result = await pool.query(`
            INSERT INTO china_receipts 
            (fno, user_id, shipping_mark, total_qty, total_weight, total_cbm, notes, status, assigned_cost_mxn, saldo_pendiente, delivery_address_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'received_origin', $8, $8, $9)
            RETURNING *
        `, [fno, userId, shipping_mark, total_qty || 1, total_weight || 0, total_cbm || 0, notes || 'Captura manual', estimatedCost, defaultAirAddressId]);

        console.log(`✅ Recepción manual creada: ${fno} - $${estimatedCost.toFixed(2)} USD (${total_weight || 0}kg × $21/kg)`);

        res.status(201).json({
            success: true,
            receipt: result.rows[0],
            message: 'Recepción creada exitosamente'
        });

    } catch (error: any) {
        console.error("Error creando recepción China:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// GET: Detalle de un recibo con sus cajas
// GET /api/china/receipts/:id
// ============================================
export const getChinaReceiptDetail = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;

        // Obtener el recibo
        const receiptResult = await pool.query(`
            SELECT 
                cr.*,
                COALESCE(
                    NULLIF(cr.international_tracking, ''),
                    (
                        SELECT p.international_tracking
                        FROM packages p
                        WHERE p.china_receipt_id = cr.id
                          AND p.international_tracking IS NOT NULL
                          AND p.international_tracking <> ''
                        ORDER BY p.updated_at DESC NULLS LAST, p.id DESC
                        LIMIT 1
                    )
                ) as awb_international,
                COALESCE(u.full_name, lc.full_name, 'Sin asignar') as client_name,
                COALESCE(u.email, lc.email) as client_email,
                COALESCE(u.box_id, lc.box_id) as client_box_id,
                lc.full_name as legacy_name,
                CASE WHEN u.id IS NOT NULL THEN true ELSE false END as is_registered
            FROM china_receipts cr
            LEFT JOIN users u ON cr.user_id = u.id
            LEFT JOIN legacy_clients lc ON UPPER(cr.shipping_mark) = UPPER(lc.box_id)
            WHERE cr.id = $1
        `, [id]);

        if (receiptResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Recibo no encontrado' });
        }

        // Obtener las cajas
        const packagesResult = await pool.query(`
            SELECT 
                id, tracking_internal, child_no, weight, dimensions,
                pro_name, customs_bno, trajectory_name,
                single_volume, single_cbm, international_tracking,
                etd, eta, status, created_at
            FROM packages 
            WHERE china_receipt_id = $1
            ORDER BY child_no
        `, [id]);

        res.json({
            success: true,
            receipt: receiptResult.rows[0],
            packages: packagesResult.rows
        });

    } catch (error: any) {
        console.error("Error obteniendo detalle:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// PUT: Actualizar estado de recibo
// PUT /api/china/receipts/:id/status
// ============================================
export const updateChinaReceiptStatus = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { status, notes, internationalTracking } = req.body;

        // Obtener datos del recibo antes de actualizar
        const receiptResult = await pool.query(`
            SELECT r.*, r.user_id, r.fno, r.shipping_mark
            FROM china_receipts r
            WHERE r.id = $1
        `, [id]);
        const receipt = receiptResult.rows[0];

        await pool.query(`
            UPDATE china_receipts SET
                status = COALESCE($1, status),
                notes = COALESCE($2, notes),
                international_tracking = COALESCE($3, international_tracking),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
        `, [status, notes, internationalTracking, id]);

        // Si el status cambia, actualizar también las cajas
        if (status) {
            const packageStatus = status === 'in_transit' ? 'in_transit_international' : status;
            await pool.query(`
                UPDATE packages SET status = $1, updated_at = CURRENT_TIMESTAMP
                WHERE china_receipt_id = $2
            `, [packageStatus, id]);

            // Registrar cambio en historial (manual)
            if (receipt && receipt.status !== status) {
                await logChinaStatusChange({
                    chinaReceiptId: Number(id),
                    fno: receipt.fno,
                    oldStatus: receipt.status,
                    newStatus: status,
                    source: 'manual',
                    changedBy: (req as any).user?.id || null,
                    notes: notes || 'Cambio manual desde admin'
                });
            }

            // Enviar notificación según el status
            if (receipt && receipt.user_id) {
                const statusMessages: Record<string, string> = {
                    'in_transit': `✈️ Tu envío China Air ${receipt.fno || receipt.shipping_mark} está en tránsito internacional hacia México.`,
                    'arrived_mexico': `🛬 Tu envío China Air ${receipt.fno || receipt.shipping_mark} ha llegado a México. Pronto pasará por aduana.`,
                    'in_customs': `🛃 Tu envío China Air ${receipt.fno || receipt.shipping_mark} está en proceso de liberación aduanal.`,
                    'at_cedis': `📦 Tu envío China Air ${receipt.fno || receipt.shipping_mark} ha llegado a nuestro CEDIS y está listo para despacho.`,
                    'dispatched': `🚚 Tu envío China Air ${receipt.fno || receipt.shipping_mark} ha sido despachado. ¡Revisa tu guía nacional!`,
                    'delivered': `✅ Tu envío China Air ${receipt.fno || receipt.shipping_mark} ha sido entregado. ¡Gracias por tu confianza!`
                };

                const notificationTypes: Record<string, 'PACKAGE_RECEIVED' | 'PACKAGE_IN_TRANSIT' | 'PACKAGE_DELIVERED'> = {
                    'in_transit': 'PACKAGE_IN_TRANSIT',
                    'arrived_mexico': 'PACKAGE_RECEIVED',
                    'in_customs': 'PACKAGE_IN_TRANSIT',
                    'at_cedis': 'PACKAGE_RECEIVED',
                    'dispatched': 'PACKAGE_IN_TRANSIT',
                    'delivered': 'PACKAGE_DELIVERED'
                };

                if (statusMessages[status]) {
                    const notifType = notificationTypes[status] || 'PACKAGE_IN_TRANSIT';
                    await createNotification(
                        receipt.user_id,
                        notifType,
                        statusMessages[status],
                        { 
                            receiptId: id, 
                            fno: receipt.fno,
                            status: status,
                            service: 'China Air'
                        },
                        '/china-dashboard'
                    );
                }
            }
        }

        res.json({ success: true, message: 'Recibo actualizado' });

    } catch (error: any) {
        console.error("Error actualizando recibo:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// POST: Asignar cliente a recibo huérfano
// POST /api/china/receipts/:id/assign
// ============================================
export const assignClientToReceipt = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { userId } = req.body;

        // Actualizar recibo
        await pool.query(`
            UPDATE china_receipts SET user_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [userId, id]);

        // Actualizar cajas
        await pool.query(`
            UPDATE packages SET user_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE china_receipt_id = $2
        `, [userId, id]);

        res.json({ success: true, message: 'Cliente asignado correctamente' });

    } catch (error: any) {
        console.error("Error asignando cliente:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// GET: Estadísticas del panel China
// GET /api/china/stats
// ============================================
export const getChinaStats = async (req: Request, res: Response): Promise<any> => {
    try {
        // Recepciones por estado
        const statusStats = await pool.query(`
            SELECT status, COUNT(*) as count 
            FROM china_receipts 
            GROUP BY status
        `);

        // Total cajas hoy
        const todayPackages = await pool.query(`
            SELECT COUNT(*) as count 
            FROM packages 
            WHERE warehouse_location = 'china_air' 
            AND DATE(created_at) = CURRENT_DATE
        `);

        // Recepciones sin asignar
        const unassigned = await pool.query(`
            SELECT COUNT(*) as count 
            FROM china_receipts 
            WHERE user_id IS NULL
        `);

        // Pendientes de guía aérea
        const pendingBillNo = await pool.query(`
            SELECT COUNT(*) as count 
            FROM china_receipts 
            WHERE international_tracking IS NULL 
            AND status = 'received_origin'
        `);

        res.json({
            success: true,
            stats: {
                byStatus: statusStats.rows,
                todayPackages: parseInt(todayPackages.rows[0].count),
                unassignedReceipts: parseInt(unassigned.rows[0].count),
                pendingBillNo: parseInt(pendingBillNo.rows[0].count)
            }
        });

    } catch (error: any) {
        console.error("Error obteniendo stats:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// GET: Guías aéreas hijas (daughter guides) para Gestión Aérea
// GET /api/china/air-guides
// ============================================
export const getAirDaughterGuides = async (req: Request, res: Response): Promise<any> => {
    try {
        const { status, search, awb, no_awb, limit = 100, offset = 0 } = req.query;

        // Query packages table with status from packages
        let query = `
            SELECT 
                p.id,
                p.tracking_internal,
                p.tracking_provider,
                p.child_no,
                p.description,
                p.weight,
                p.pkg_length,
                p.pkg_width,
                p.pkg_height,
                p.single_volume,
                p.single_cbm,
                p.international_tracking,
                p.status::text as status,
                p.etd,
                p.eta,
                p.created_at,
                p.updated_at,
                p.user_id,
                p.box_number,
                p.total_boxes,
                p.assigned_cost_mxn,
                p.client_paid,
                p.master_id,
                p.china_receipt_id,
                p.pro_name,
                p.customs_bno,
                p.box_id as package_box_id,
                p.air_sale_price,
                p.air_price_per_kg,
                p.air_tariff_type,
                p.air_is_custom_tariff,
                COALESCE(u.full_name, lc.full_name, lc_mark.full_name, CASE WHEN COALESCE(p.box_id, cr.shipping_mark) IS NOT NULL AND COALESCE(p.box_id, cr.shipping_mark) != '' THEN COALESCE(p.box_id, cr.shipping_mark) ELSE 'Sin asignar' END) as client_name,
                COALESCE(u.box_id, p.box_id, cr.shipping_mark, '') as client_box_id,
                cr.fno as receipt_fno,
                cr.shipping_mark,
                'packages' as source_table
            FROM packages p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN legacy_clients lc ON p.box_id = lc.box_id
            LEFT JOIN china_receipts cr ON p.china_receipt_id = cr.id
            LEFT JOIN legacy_clients lc_mark ON cr.shipping_mark = lc_mark.box_id
            WHERE p.service_type = 'AIR_CHN_MX'
            AND p.warehouse_location = 'china_air'
            AND (p.is_master = false OR p.is_master IS NULL)
        `;
        const params: any[] = [];
        let paramIndex = 1;

        if (status && status !== 'all') {
            query += ` AND p.status::text = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (search) {
            query += ` AND (
                UPPER(p.tracking_internal) LIKE UPPER($${paramIndex})
                OR UPPER(p.child_no) LIKE UPPER($${paramIndex})
                OR UPPER(p.international_tracking) LIKE UPPER($${paramIndex})
                OR UPPER(COALESCE(u.full_name, lc.full_name, '')) LIKE UPPER($${paramIndex})
                OR UPPER(COALESCE(u.box_id, '')) LIKE UPPER($${paramIndex})
                OR UPPER(COALESCE(p.box_id, '')) LIKE UPPER($${paramIndex})
                OR UPPER(COALESCE(cr.fno, '')) LIKE UPPER($${paramIndex})
            )`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (awb) {
            query += ` AND UPPER(p.international_tracking) = UPPER($${paramIndex})`;
            params.push(awb);
            paramIndex++;
        }

        // Filtro "Sin AWB": guías sin guía aérea internacional asignada.
        if (String(no_awb) === 'true') {
            query += ` AND (p.international_tracking IS NULL OR TRIM(p.international_tracking) = '')`;
        }

        // Union with china_receipts for status that may only exist there
        let chinaReceiptsQuery = `
            UNION ALL
            SELECT 
                cr.id,
                NULL as tracking_internal,
                NULL as tracking_provider,
                NULL as child_no,
                NULL as description,
                NULL as weight,
                NULL as pkg_length,
                NULL as pkg_width,
                NULL as pkg_height,
                NULL as single_volume,
                NULL as single_cbm,
                NULL as international_tracking,
                cr.status::text as status,
                NULL as etd,
                NULL as eta,
                cr.created_at,
                cr.updated_at,
                NULL as user_id,
                NULL as box_number,
                NULL as total_boxes,
                NULL as assigned_cost_mxn,
                NULL as client_paid,
                NULL as master_id,
                NULL as china_receipt_id,
                NULL as pro_name,
                NULL as customs_bno,
                NULL as package_box_id,
                NULL as air_sale_price,
                NULL as air_price_per_kg,
                NULL as air_tariff_type,
                NULL as air_is_custom_tariff,
                COALESCE(lc.full_name, cr.shipping_mark) as client_name,
                COALESCE(lc.box_id, cr.shipping_mark) as client_box_id,
                cr.fno as receipt_fno,
                cr.shipping_mark,
                'china_receipts' as source_table
            FROM china_receipts cr
            LEFT JOIN legacy_clients lc ON cr.shipping_mark = lc.box_id
            WHERE NOT EXISTS (
                SELECT 1 FROM packages p 
                WHERE p.china_receipt_id = cr.id 
                AND p.service_type = 'AIR_CHN_MX'
            )
        `;

        if (status && status !== 'all') {
            chinaReceiptsQuery += ` AND cr.status::text = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (search) {
            chinaReceiptsQuery += ` AND (
                UPPER(cr.fno) LIKE UPPER($${paramIndex})
                OR UPPER(COALESCE(cr.shipping_mark, '')) LIKE UPPER($${paramIndex})
                OR UPPER(COALESCE(lc.full_name, '')) LIKE UPPER($${paramIndex})
            )`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        query += chinaReceiptsQuery;

        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        // Count total - same union logic
        let countQuery = `
            SELECT COUNT(*) as total FROM (
                SELECT p.id FROM packages p
                LEFT JOIN users u ON p.user_id = u.id
                LEFT JOIN legacy_clients lc ON p.box_id = lc.box_id
                LEFT JOIN china_receipts cr ON p.china_receipt_id = cr.id
                LEFT JOIN legacy_clients lc_mark ON cr.shipping_mark = lc_mark.box_id
                WHERE p.service_type = 'AIR_CHN_MX'
                AND p.warehouse_location = 'china_air'
                AND (p.is_master = false OR p.is_master IS NULL)
        `;
        const countParams: any[] = [];
        let countParamIndex = 1;

        if (status && status !== 'all') {
            countQuery += ` AND p.status::text = $${countParamIndex}`;
            countParams.push(status);
            countParamIndex++;
        }
        if (search) {
            countQuery += ` AND (
                UPPER(p.tracking_internal) LIKE UPPER($${countParamIndex})
                OR UPPER(p.child_no) LIKE UPPER($${countParamIndex})
                OR UPPER(p.international_tracking) LIKE UPPER($${countParamIndex})
                OR UPPER(COALESCE(u.full_name, lc.full_name, lc_mark.full_name, '')) LIKE UPPER($${countParamIndex})
                OR UPPER(COALESCE(u.box_id, '')) LIKE UPPER($${countParamIndex})
                OR UPPER(COALESCE(p.box_id, cr.shipping_mark, '')) LIKE UPPER($${countParamIndex})
                OR UPPER(COALESCE(cr.fno, '')) LIKE UPPER($${countParamIndex})
            )`;
            countParams.push(`%${search}%`);
            countParamIndex++;
        }
        if (awb) {
            countQuery += ` AND UPPER(p.international_tracking) = UPPER($${countParamIndex})`;
            countParams.push(awb);
            countParamIndex++;
        }

        countQuery += `
                UNION ALL
                SELECT cr.id FROM china_receipts cr
                LEFT JOIN legacy_clients lc ON cr.shipping_mark = lc.box_id
                WHERE NOT EXISTS (
                    SELECT 1 FROM packages p 
                    WHERE p.china_receipt_id = cr.id 
                    AND p.service_type = 'AIR_CHN_MX'
                )
        `;

        if (status && status !== 'all') {
            countQuery += ` AND cr.status::text = $${countParamIndex}`;
            countParams.push(status);
            countParamIndex++;
        }

        if (search) {
            countQuery += ` AND (
                UPPER(cr.fno) LIKE UPPER($${countParamIndex})
                OR UPPER(COALESCE(cr.shipping_mark, '')) LIKE UPPER($${countParamIndex})
                OR UPPER(COALESCE(lc.full_name, '')) LIKE UPPER($${countParamIndex})
            )`;
            countParams.push(`%${search}%`);
            countParamIndex++;
        }

        countQuery += `) t`;

        const countResult = await pool.query(countQuery, countParams);

        res.json({
            success: true,
            guides: result.rows,
            total: parseInt(countResult.rows[0].total),
        });
    } catch (error: any) {
        console.error("Error obteniendo guías aéreas hijas:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// GET: Estadísticas de guías aéreas hijas
// GET /api/china/air-guides/stats
// ============================================
export const getAirDaughterStats = async (req: Request, res: Response): Promise<any> => {
    try {
        // Status de packages con AIR_CHN_MX
        const packageStats = await pool.query(`
            SELECT p.status::text as status, COUNT(*) as count
            FROM packages p
            WHERE p.service_type = 'AIR_CHN_MX'
            AND p.warehouse_location = 'china_air'
            AND (p.is_master = false OR p.is_master IS NULL)
            GROUP BY p.status
        `);

        // Status de china_receipts para contar todas las entregas (incluso sin paquetes)
        const receiptStats = await pool.query(`
            SELECT cr.status::text as status, COUNT(*) as count
            FROM china_receipts cr
            GROUP BY cr.status
        `);

        // Combinar ambos - dar prioridad a packages pero incluir status de receipts
        const statusMap = new Map<string, number>();
        
        // Primero agregar todos los status de receipts
        receiptStats.rows.forEach((row: any) => {
            statusMap.set(row.status, parseInt(row.count));
        });
        
        // Luego actualizar/sobrescribir con los de packages (ya que packages es más actual)
        packageStats.rows.forEach((row: any) => {
            statusMap.set(row.status, parseInt(row.count));
        });

        // Convertir a array ordenado
        const byStatus = Array.from(statusMap.entries())
            .map(([status, count]) => ({
                status,
                count: count.toString()
            }))
            .sort((a, b) => parseInt(b.count) - parseInt(a.count));

        const awbStats = await pool.query(`
            SELECT 
                COALESCE(p.international_tracking, 'Sin AWB') as awb,
                COUNT(*) as count
            FROM packages p
            WHERE p.service_type = 'AIR_CHN_MX'
            AND p.warehouse_location = 'china_air'
            AND (p.is_master = false OR p.is_master IS NULL)
            GROUP BY p.international_tracking
            ORDER BY count DESC
            LIMIT 20
        `);

        // "Sin asignar" = paquetes que NO tienen:
        // - user_id válido
        // - box_id que exista en legacy_clients
        // - shipping_mark (del china_receipt) que exista en legacy_clients
        const unassigned = await pool.query(`
            SELECT COUNT(*) as count
            FROM packages p
            LEFT JOIN legacy_clients lc ON p.box_id = lc.box_id
            LEFT JOIN china_receipts cr ON p.china_receipt_id = cr.id
            LEFT JOIN legacy_clients lc_mark ON cr.shipping_mark = lc_mark.box_id
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.service_type = 'AIR_CHN_MX'
            AND p.warehouse_location = 'china_air'
            AND (p.is_master = false OR p.is_master IS NULL)
            AND u.id IS NULL
            AND lc.id IS NULL
            AND lc_mark.id IS NULL
            AND (p.box_id IS NULL OR p.box_id = '')
            AND (cr.shipping_mark IS NULL OR cr.shipping_mark = '')
        `);

        const total = await pool.query(`
            SELECT COUNT(*) as count
            FROM packages p
            WHERE p.service_type = 'AIR_CHN_MX'
            AND p.warehouse_location = 'china_air'
            AND (p.is_master = false OR p.is_master IS NULL)
        `);

        res.json({
            success: true,
            stats: {
                byStatus: byStatus,
                byAwb: awbStats.rows,
                totalGuides: parseInt(total.rows[0].count),
                unassigned: parseInt(unassigned.rows[0].count),
            }
        });
    } catch (error: any) {
        console.error("Error obteniendo stats de guías aéreas:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// GET: Logs de callbacks de MoJie (diagnóstico)
// GET /api/china/callback-logs
// ============================================
export const getCallbackLogs = async (req: Request, res: Response): Promise<any> => {
    try {
        const { limit = 50 } = req.query;
        
        const result = await pool.query(`
            SELECT id, raw_body, content_type, status, error_message, fno, shipping_mark, created_at
            FROM china_callback_logs
            ORDER BY created_at DESC
            LIMIT $1
        `, [limit]);
        
        res.json({
            success: true,
            logs: result.rows,
            total: result.rowCount
        });
    } catch (error: any) {
        // Si la tabla no existe, informar
        if (error.code === '42P01') {
            return res.json({
                success: false,
                error: 'Tabla china_callback_logs no existe. Ejecuta la migración add_china_callback_logs.sql',
                logs: []
            });
        }
        console.error("Error obteniendo logs:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// API MJCUSTOMER.COM - CONFIGURACIÓN
// Dos métodos de autenticación disponibles:
// 1. h5api con SM2 (endpoint /api/sysAuth/login) - PRINCIPAL
// 2. orderSystem plano (endpoint /api/appAuth/loginByOrderSystem) - BACKUP
// ============================================

const MJCUSTOMER_API = {
    baseUrl: process.env.MJCUSTOMER_API_URL || 'http://api.mjcustomer.com',
    token: process.env.MJCUSTOMER_API_TOKEN || '',
    tokenExpiry: 0,
    
    // Credenciales h5api con SM2 (principal)
    h5api: {
        username: 'h5api',
        password: 'H_5@nLP.',
        // PublicKey SM2 proporcionada por MoJie
        publicKey: '046BB47A0777ADAD614BEF4F234BBE275C4FBB4BB45A9EDCAB5602EEE9588B52AEFB5CD7A29396DA46526E1C4F72650166F5FB41515B83C192AE37134470EB951D'
    },
    
    // Credenciales orderSystem (backup)
    orderSystem: {
        username: process.env.MJCUSTOMER_USERNAME || '18824927368',
        password: process.env.MJCUSTOMER_PASSWORD || 'cM4V92S0RNE2.'
    }
};

/**
 * Encripta una cadena usando SM2 con la llave pública de MoJie
 */
function encryptWithSM2(plainText: string): string {
    try {
        // La llave pública viene en formato hex con prefijo 04
        const publicKey = MJCUSTOMER_API.h5api.publicKey;
        
        // Encriptar usando sm-crypto (modo C1C3C2 es el estándar)
        const encrypted = sm2.doEncrypt(plainText, publicKey, 1); // 1 = C1C3C2 mode
        
        console.log('🔐 Password encriptado con SM2 correctamente');
        return encrypted;
    } catch (error: any) {
        console.error('❌ Error encriptando con SM2:', error.message);
        throw error;
    }
}

// ============================================
// LOGIN: Obtener token de MJCustomer
// Intenta primero con h5api/SM2, si falla usa orderSystem
// ============================================

/**
 * fetch con timeout explícito. MoJie (api.mjcustomer.com) a veces tarda o
 * no responde y Railway corta el request con 502. Usamos AbortController.
 */
async function fetchWithTimeout(url: string, options: any = {}, timeoutMs: number = 20000): Promise<globalThis.Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        return res as unknown as globalThis.Response;
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            throw new Error(`MoJie API timeout (${timeoutMs}ms): ${url}`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

async function loginToMJCustomer(): Promise<string | null> {
    // Intentar primero con h5api + SM2
    const tokenH5 = await loginWithH5Api();
    if (tokenH5) return tokenH5;
    
    // Si falla, intentar con orderSystem
    console.log('⚠️ h5api falló, intentando con orderSystem...');
    return await loginWithOrderSystem();
}

/**
 * Login con credenciales h5api y SM2
 * Endpoint: /api/sysAuth/login
 */
async function loginWithH5Api(): Promise<string | null> {
    try {
        console.log('🔐 Iniciando login en MJCustomer (h5api + SM2)...');
        console.log('   Usuario:', MJCUSTOMER_API.h5api.username);
        
        // Encriptar password con SM2
        const encryptedPassword = encryptWithSM2(MJCUSTOMER_API.h5api.password);
        
        const response = await fetchWithTimeout(
            `${MJCUSTOMER_API.baseUrl}/api/sysAuth/login`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json-patch+json',
                    'Accept': 'text/plain',
                    'request-from': 'swagger'
                },
                body: JSON.stringify({
                    account: MJCUSTOMER_API.h5api.username,
                    password: encryptedPassword,
                    codeId: 0,
                    code: 'string',
                    loginMode: 1
                })
            },
            15000
        );

        const data = await response.json() as { code: number; message: string; result?: { accessToken: string } };
        console.log('   Respuesta h5api:', data.code, data.message);
        
        if (data.code === 200 && data.result?.accessToken) {
            const token = data.result.accessToken;
            MJCUSTOMER_API.token = token;
            MJCUSTOMER_API.tokenExpiry = Date.now() + (6 * 24 * 60 * 60 * 1000); // 6 días
            
            // Guardar en BD
            await saveTokenToDB(token);
            
            console.log('✅ Login exitoso con h5api + SM2');
            return token;
        } else {
            console.error('❌ Login h5api fallido:', data.message);
            return null;
        }
    } catch (error: any) {
        console.error('❌ Error en login h5api:', error.message);
        return null;
    }
}

/**
 * Login con credenciales orderSystem (sin encriptación)
 * Endpoint: /api/appAuth/loginByOrderSystem
 */
async function loginWithOrderSystem(): Promise<string | null> {
    try {
        console.log('🔐 Iniciando login en MJCustomer (orderSystem)...');
        console.log('   Usuario:', MJCUSTOMER_API.orderSystem.username);
        
        const response = await fetchWithTimeout(
            `${MJCUSTOMER_API.baseUrl}/api/appAuth/loginByOrderSystem`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json-patch+json',
                    'Accept': 'text/plain',
                    'request-from': 'swagger'
                },
                body: JSON.stringify({
                    account: MJCUSTOMER_API.orderSystem.username,
                    password: MJCUSTOMER_API.orderSystem.password
                })
            },
            15000
        );

        const data = await response.json() as { code: number; message: string; result?: { accessToken: string } };
        console.log('   Respuesta orderSystem:', data.code, data.message);
        
        if (data.code === 200 && data.result?.accessToken) {
            const token = data.result.accessToken;
            MJCUSTOMER_API.token = token;
            MJCUSTOMER_API.tokenExpiry = Date.now() + (6 * 24 * 60 * 60 * 1000);
            
            await saveTokenToDB(token);
            
            console.log('✅ Login exitoso con orderSystem');
            return token;
        } else {
            console.error('❌ Login orderSystem fallido:', data.message);
            return null;
        }
    } catch (error: any) {
        console.error('❌ Error en login orderSystem:', error.message);
        return null;
    }
}

/**
 * Guarda el token en la base de datos para persistencia
 */
async function saveTokenToDB(token: string): Promise<void> {
    try {
        await pool.query(`
            INSERT INTO system_config (key, value, updated_at)
            VALUES ('mjcustomer_token', $1, NOW())
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        `, [token]);
        await pool.query(`
            INSERT INTO system_config (key, value, updated_at)
            VALUES ('mjcustomer_token_expiry', $1, NOW())
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        `, [MJCUSTOMER_API.tokenExpiry.toString()]);
    } catch (dbErr) {
        console.warn('⚠️ No se pudo guardar token en BD');
    }
}

// Obtener token válido (intenta desde .env, BD, o hace login)
async function getMJCustomerToken(): Promise<string> {
    // 1. Si hay token en memoria y no expiró, usarlo
    if (MJCUSTOMER_API.token && Date.now() < MJCUSTOMER_API.tokenExpiry) {
        return MJCUSTOMER_API.token;
    }
    
    // 2. Intentar cargar desde BD
    try {
        const dbToken = await pool.query("SELECT value FROM system_config WHERE key = 'mjcustomer_token'");
        const dbExpiry = await pool.query("SELECT value FROM system_config WHERE key = 'mjcustomer_token_expiry'");
        
        if (dbToken.rows.length > 0 && dbExpiry.rows.length > 0) {
            const tokenExpiry = parseInt(dbExpiry.rows[0].value);
            if (Date.now() < tokenExpiry) {
                MJCUSTOMER_API.token = dbToken.rows[0].value;
                MJCUSTOMER_API.tokenExpiry = tokenExpiry;
                console.log('✅ Token MJCustomer cargado desde BD');
                return MJCUSTOMER_API.token;
            }
        }
    } catch (e) {
        console.warn('⚠️ No se pudo cargar token desde BD');
    }
    
    // 3. Si hay token en .env, usarlo (configuración manual)
    if (process.env.MJCUSTOMER_API_TOKEN) {
        MJCUSTOMER_API.token = process.env.MJCUSTOMER_API_TOKEN;
        MJCUSTOMER_API.tokenExpiry = Date.now() + (6 * 24 * 60 * 60 * 1000); // Asumir 6 días
        console.log('✅ Token MJCustomer cargado desde .env');
        return MJCUSTOMER_API.token;
    }
    
    // 4. Intentar login automático (requiere SM2)
    const newToken = await loginToMJCustomer();
    if (newToken) {
        return newToken;
    }
    
    throw new Error('No hay token de MJCustomer disponible. Configura MJCUSTOMER_API_TOKEN en .env o proporciona la llave SM2 para login automático.');
}

// ============================================
// ENDPOINT: Login manual a MJCustomer
// POST /api/china/mjcustomer/login
// Intenta primero h5api+SM2, si falla usa orderSystem
// ============================================
export const loginMJCustomerEndpoint = async (req: Request, res: Response): Promise<any> => {
    try {
        console.log('🔐 Iniciando login MJCustomer...');
        
        const token = await loginToMJCustomer();
        
        if (token) {
            res.json({
                success: true,
                message: 'Login exitoso',
                method: 'h5api+SM2 o orderSystem',
                tokenPreview: token.substring(0, 20) + '...',
                expiresAt: new Date(MJCUSTOMER_API.tokenExpiry).toISOString()
            });
        } else {
            res.status(401).json({
                success: false,
                error: 'Login fallido con ambos métodos (h5api+SM2 y orderSystem). Verifica credenciales.'
            });
        }
    } catch (error: any) {
        console.error('Error en login:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Interface para respuesta de MJCustomer API
// El formato es EXACTO al webhook original - misma estructura
interface MJCustomerOrderResponse {
    code: number;
    type: string;
    message: string;
    result: ChinaApiPayload | ChinaApiPayload[] | null;  // Usa el mismo formato que webhook
    extras: any;
    time: string;
}

// Interface para respuesta de trayectoria
interface TrajectoryResponse {
    code: number;
    type: string;
    message: string;
    result: Array<{
        ch: string;      // Texto en chino
        en: string;      // Texto en español/inglés
        date: string;    // Fecha del evento
    }> | null;
    extras: any;
    time: string;
}

// ============================================
// RASTREO: Consultar status de un FNO (sin guardar)
// GET /api/china/track/:fno
// ============================================
export const trackFNO = async (req: Request, res: Response): Promise<any> => {
    try {
        const fnoParam = req.params.fno;
        
        if (!fnoParam || typeof fnoParam !== 'string') {
            return res.status(400).json({ 
                success: false, 
                error: 'Se requiere el número de FNO' 
            });
        }

        let fno = fnoParam.trim();
        console.log(`🔍 Rastreando: ${fno}`);

        // Helper: Si el usuario ingresa un child_no (con -001), extraer el FNO base
        const extractFNO = (input: string): string => {
            // Si tiene un patrón "XXX-NNN" al final, es probablemente child_no
            // Extraer todo excepto los últimos "-NNN"
            const match = input.match(/^(.+)-\d{3}$/);
            if (match && match[1]) {
                console.log(`  📌 Detectado child_no, extrayendo FNO: ${match[1]}`);
                return match[1];
            }
            return input;
        };

        let searchFno = extractFNO(fno);

        // Helper: buscar datos en BD local para usar como fallback si MoJie falla
        const buildLocalFallback = async (): Promise<any | null> => {
            try {
                                const normalizedSearchFno = searchFno
                                        .toUpperCase()
                                        .replace(/[^A-Z0-9]/g, '');

                const receiptQ = await pool.query(
                                        `WITH receipt_candidates AS (
                                                SELECT cr.id, 0 as match_rank
                                                FROM china_receipts cr
                                                WHERE UPPER(cr.fno) = UPPER($1)

                                                UNION ALL

                                                SELECT cr.id, 1 as match_rank
                                                FROM china_receipts cr
                                                WHERE regexp_replace(UPPER(cr.fno), '[^A-Z0-9]', '', 'g') = $2

                                                UNION ALL

                                                SELECT p.china_receipt_id as id, 2 as match_rank
                                                FROM packages p
                                                WHERE p.china_receipt_id IS NOT NULL
                                                    AND (
                                                        UPPER(p.child_no) LIKE UPPER($3)
                                                        OR regexp_replace(UPPER(p.child_no), '[^A-Z0-9]', '', 'g') LIKE $4
                                                    )
                                        )
                                        SELECT cr.id, cr.fno, cr.shipping_mark, cr.total_qty, cr.total_weight, cr.total_cbm, cr.status, cr.evidence_urls
                                        FROM receipt_candidates rc
                                        INNER JOIN china_receipts cr ON cr.id = rc.id
                                        ORDER BY rc.match_rank ASC, cr.id DESC
                                        LIMIT 1`,
                                        [searchFno, normalizedSearchFno, `${searchFno}-%`, `${normalizedSearchFno}%`]
                );
                if (receiptQ.rows.length === 0) return null;
                const r = receiptQ.rows[0];
                const pkgsQ = await pool.query(
                    `SELECT child_no, trajectory_name, weight, long_cm, width_cm, height_cm,
                            pro_name, customs_bno, international_tracking, etd, eta
                     FROM packages WHERE china_receipt_id = $1`,
                    [r.id]
                );
                return {
                    fno: r.fno,
                    shippingMark: r.shipping_mark,
                    totalQty: r.total_qty,
                    totalWeight: r.total_weight,
                    totalCbm: r.total_cbm,
                    evidencias: r.evidence_urls || [],
                    paquetes: pkgsQ.rows.map((p: any) => ({
                        childNo: p.child_no,
                        status: p.trajectory_name,
                        peso: p.weight,
                        dimensiones: `${p.long_cm}x${p.width_cm}x${p.height_cm} cm`,
                        producto: p.pro_name,
                        codigoAduanal: p.customs_bno,
                        guiaInternacional: p.international_tracking || 'Pendiente',
                        etd: p.etd || 'Pendiente',
                        eta: p.eta || 'Pendiente'
                    }))
                };
            } catch (dbErr: any) {
                console.warn('⚠️  Fallback BD falló:', dbErr?.message);
                return null;
            }
        };

        // Consulta en vivo al sistema aéreo nuevo (gzmojie). Si no responde o no
        // trae la orden, se cae a los datos locales (ya completos por el push).
        // Los campos ricos -producto, aduanal, guía internacional- salen de nuestra
        // base por childNo; el estatus en vivo sale de 1 llamada de trayectoria.
        let trackingInfo: any = null;
        let liveError: string | null = null;
        try {
            const orden = await buscarOrdenPorFno(searchFno);
            if (orden) {
                const cajas = await cajasDeOrden(orden.id);
                let lastTrajectory: string | null = null;
                const primero = cajas[0]?.childNo || cajas[0]?.ChildNo;
                if (primero) {
                    try {
                        const ev = await trayectoriaDeCaja(primero);
                        const ord = [...ev].sort((a: any, b: any) => String(b.occurTime || '').localeCompare(String(a.occurTime || '')));
                        lastTrajectory = ord[0]?.trajectoryName || null;
                    } catch { /* sin trayectoria todavía */ }
                }
                const fnoReal = String(orden.fno || searchFno);
                const locales = await pool.query(
                    `SELECT child_no, trajectory_name, pro_name, customs_bno, international_tracking, etd, eta
                       FROM packages WHERE split_part(child_no,'-',1) = $1`, [fnoReal]);
                const locMap: Record<string, any> = {};
                for (const r of locales.rows) locMap[r.child_no] = r;
                trackingInfo = {
                    fno: orden.fno,
                    shippingMark: orden.shippingMark || orden.customerCode,
                    totalQty: orden.totalQty,
                    totalWeight: orden.totalWeight,
                    totalVolume: orden.totalVolume,
                    totalCbm: orden.totalCbm,
                    evidencias: [],
                    paquetes: cajas.map((c: any) => {
                        const loc = locMap[c.childNo] || {};
                        return {
                            childNo: c.childNo,
                            status: loc.trajectory_name || lastTrajectory || null,
                            peso: c.weight ?? null,
                            dimensiones: `${c.long || 0}x${c.width || 0}x${c.height || 0} cm`,
                            producto: loc.pro_name || c.sku || null,
                            codigoAduanal: loc.customs_bno || null,
                            guiaInternacional: loc.international_tracking || 'Pendiente',
                            etd: loc.etd || orden.etd || 'Pendiente',
                            eta: loc.eta || orden.eta || 'Pendiente',
                        };
                    }),
                };
            }
        } catch (e: any) {
            liveError = e?.message || String(e);
            console.warn('  track gzmojie falló:', liveError);
        }

        if (trackingInfo) {
            console.log(`  ✅ FNO en vivo: ${trackingInfo.totalQty} paquetes`);
            return res.json({ success: true, tracking: trackingInfo });
        }

        // Fallback: datos locales (ya completos por el push).
        const local = await buildLocalFallback();
        if (local) {
            return res.json({
                success: true,
                tracking: local,
                fromCache: true,
                warning: liveError
                    ? `Sistema de origen no disponible (${liveError}). Mostrando datos en caché.`
                    : 'La guía no está en el sistema de origen; mostrando datos locales.'
            });
        }
        return res.status(404).json({ success: false, error: 'Guía no encontrada' });

    } catch (error: any) {
        console.error('❌ Error rastreando FNO:', error?.stack || error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al consultar tracking',
            details: error?.message || String(error)
        });
    }
};

// ============================================
// RASTREO DETALLADO: Obtener trayectoria de un childNo
// GET /api/china/trajectory/:childNo
// ============================================
export const getTrajectory = async (req: Request, res: Response): Promise<any> => {
    try {
        const { childNo: childNoRaw } = req.params;
        const childNo: string = String(childNoRaw || '');
        
        if (!childNo) {
            return res.status(400).json({ 
                success: false, 
                error: 'Se requiere el número de paquete (childNo)' 
            });
        }

        console.log(`🔍 Consultando trayectoria (gzmojie): ${childNo}`);

        // Resolver el childNo real del sistema de origen. Si llega el interno
        // (CN-...) o una referencia distinta, se busca el child_no verdadero.
        let realChildNo = childNo;
        if (!/^AIR/i.test(childNo)) {
            const q = await pool.query(
                `SELECT child_no FROM packages
                  WHERE tracking_internal = $1 OR child_no = $1
                  ORDER BY (child_no = $1) DESC LIMIT 1`, [childNo]);
            if (q.rows[0]?.child_no) realChildNo = q.rows[0].child_no;
        }

        // 1) Trayectoria directa de la caja (trae eventos de caja y de orden).
        let eventos: any[] = [];
        try {
            eventos = await trayectoriaDeCaja(realChildNo);
        } catch (e: any) {
            console.warn('  trayectoria gzmojie falló:', e?.message);
        }

        // 2) Si no hubo, derivar del FNO padre: buscar la orden y su primera caja.
        if (!eventos.length) {
            const fnoPadre = realChildNo.replace(/-\d+$/, '');
            try {
                const orden = await buscarOrdenPorFno(fnoPadre);
                if (orden) {
                    const cajas = await cajasDeOrden(orden.id);
                    const primero = cajas[0]?.childNo || cajas[0]?.ChildNo;
                    if (primero) eventos = await trayectoriaDeCaja(primero);
                }
            } catch (e: any) {
                console.warn('  fallback FNO gzmojie falló:', e?.message);
            }
        }

        if (!eventos.length) {
            return res.status(404).json({
                success: false,
                error: 'Esta guía aún no tiene movimientos en el sistema de origen. Es posible que el paquete apenas se esté procesando.'
            });
        }

        // Del más reciente al más antiguo y mapeado al formato del frontend.
        eventos.sort((a: any, b: any) => String(b.occurTime || '').localeCompare(String(a.occurTime || '')));
        const trajectory = eventos.map((ev: any) => {
            const nombre = ev.trajectoryName || ev.trajecotryName || '';
            return {
                fecha: ev.occurTime || null,
                descripcion: nombre,
                descripcionChino: nombre,
                // Compat con frontend existente
                date: ev.occurTime || null,
                en: '',
                ch: nombre,
                nivel: ev.level || null,
                operador: ev.operatorName || null
            };
        });

        console.log(`  ✅ Trayectoria (gzmojie): ${trajectory.length} eventos`);

        res.json({
            success: true,
            childNo: realChildNo,
            eventos: trajectory.length,
            trayectoria: trajectory,
            raw: eventos
        });

    } catch (error: any) {
        console.error('❌ Error consultando trayectoria:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al consultar trayectoria',
            details: error.message 
        });
    }
};

// ============================================
// HELPER: Registra un cambio de status en china_status_history
// No lanza excepciones para no romper flujos principales (best-effort)
// ============================================
export type StatusChangeSource = 'mojie_sync' | 'mojie_webhook' | 'manual' | 'recalc' | 'track_fno' | 'pull_order';
export interface LogStatusChangeParams {
    packageId?: number | null;
    chinaReceiptId?: number | null;
    trackingInternal?: string | null;
    childNo?: string | null;
    fno?: string | null;
    oldStatus?: string | null;
    newStatus: string;
    trajectoryName?: string | null;
    source: StatusChangeSource;
    changedBy?: number | null;
    notes?: string | null;
}

export async function logChinaStatusChange(params: LogStatusChangeParams): Promise<void> {
    try {
        // Evitar registrar cuando no hubo cambio real
        if (params.oldStatus && params.oldStatus === params.newStatus) return;
        if (!params.newStatus) return;

        await pool.query(
            `INSERT INTO china_status_history
                (package_id, china_receipt_id, tracking_internal, child_no, fno,
                 old_status, new_status, trajectory_name, source, changed_by, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
                params.packageId ?? null,
                params.chinaReceiptId ?? null,
                params.trackingInternal ?? null,
                params.childNo ?? null,
                params.fno ?? null,
                params.oldStatus ?? null,
                params.newStatus,
                params.trajectoryName ?? null,
                params.source,
                params.changedBy ?? null,
                params.notes ?? null
            ]
        );
    } catch (err: any) {
        // Log pero no propagar: historial es informativo
        console.warn('⚠️  logChinaStatusChange falló:', err?.message || err);
    }
}

// ============================================
// ADMIN: Listar valores únicos de trajectory_name (status crudo de MoJie)
// GET /api/china/trajectory-names
// ============================================
// ============================================
// Mapeo de trajectory_name (chino/español) a status interno SOS-X
// Basado en los valores reales que envía MoJie (api.mjcustomer.com)
// Orden de prioridad: delivered > in_customs_gz > in_transit_* > received_china > received_origin > pending
// ============================================
export function mapTrajectoryToStatus(trajectoryNames: string[]): string {
    const joined = trajectoryNames.map(t => (t || '').toLowerCase()).join(' | ');

    // 1. Entregado (firmado por destinatario) - prioridad máxima
    //    "该货件已派送签收" = El envío fue entregado/firmado
    if (/派送签收|已签收|签收|entregado|delivered/i.test(joined)) {
        return 'delivered';
    }

    // 2. En aduana Guangzhou (esperando despacho de importación)
    //    "航班已抵达机场，等待办理进口清关文件"
    if (/清关|海关|报关|aduana|customs|despacho/i.test(joined)) {
        return 'in_customs_gz';
    }

    // 3. En tránsito - esperando vuelo en aeropuerto
    //    "已到达机场等待安排航班指示"
    if (/到达机场|抵达机场|等待安排航班|等待航班/i.test(joined)) {
        return 'in_transit_airport_wait';
    }

    // 4. En tránsito - cargando / en puerto
    //    "该货物正在装车过港接收中"
    if (/装车|过港/i.test(joined)) {
        return 'in_transit_loading';
    }

    // 5. En tránsito - en transferencia / vuelo aéreo
    //    "空运货物正在安排中转" (también unicode-escaped u7a7au8fd0...)
    if (/中转|已发货|起飞|航班|transit|tránsito|vuelo|flight/i.test(joined) ||
        /u7a7au8fd0/.test(joined)) {
        return 'in_transit_transfer';
    }

    // 6. Recibido en bodega China - info de guía aérea recibida
    //    "空运单信息已收到 -广州鹤龙"
    if (/空运单信息已收到|信息已收到|已收到/i.test(joined)) {
        return 'received_china';
    }

    // 7. Recibido en bodega origen - escaneado / en clasificación
    //    "空运货物已扫描入仓正在分拣中 -广州鹤龙"
    if (/扫描入仓|入仓|分拣|almacén|bodega|warehouse/i.test(joined)) {
        return 'received_origin';
    }

    // 8. Pendiente - reservado, esperando recepción en bodega
    //    "预约下单，等待仓接收货"
    if (/预约|下单|等待仓接收|pendiente|pending/i.test(joined)) {
        return 'pending';
    }

    // Default: recibido en origen (si ya está en BD asumimos que al menos está en bodega)
    return 'received_origin';
}

export const listTrajectoryNames = async (_req: Request, res: Response): Promise<any> => {
    try {
        const result = await pool.query(`
            SELECT 
                COALESCE(NULLIF(TRIM(trajectory_name), ''), '(vacío)') AS trajectory_name,
                COUNT(*)::int AS count,
                MIN(created_at) AS first_seen,
                MAX(updated_at) AS last_seen
            FROM packages
            WHERE trajectory_name IS NOT NULL AND TRIM(trajectory_name) <> ''
            GROUP BY 1
            ORDER BY count DESC
        `);

        res.json({
            success: true,
            total: result.rows.length,
            trajectoryNames: result.rows
        });
    } catch (error: any) {
        console.error('❌ Error listando trajectory_names:', error?.stack || error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al listar trajectory_names',
            details: error?.message 
        });
    }
};

// ============================================
// GET /api/china/status-history/:tracking
// Devuelve el historial de cambios de status para una gu\u00eda (por tracking interno, childNo o FNO)
// ============================================
export const getChinaStatusHistory = async (req: Request, res: Response): Promise<any> => {
    try {
        const { tracking } = req.params;
        if (!tracking) {
            return res.status(400).json({ success: false, error: 'Se requiere tracking/childNo/FNO' });
        }

        // Buscar por tracking_internal, child_no o fno
        const result = await pool.query(`
            SELECT h.id, h.package_id, h.china_receipt_id, h.tracking_internal, h.child_no, h.fno,
                   h.old_status, h.new_status, h.trajectory_name, h.source, h.notes, h.created_at,
                   u.full_name AS changed_by_name
            FROM china_status_history h
            LEFT JOIN users u ON u.id = h.changed_by
            WHERE h.tracking_internal = $1
               OR h.child_no = $1
               OR h.fno = $1
            ORDER BY h.created_at DESC
        `, [tracking]);

        // Adicional: estado actual del paquete/recepción (para mostrar cuando no hay historial)
        const currentQ = await pool.query(`
            SELECT p.id AS package_id, p.tracking_internal, p.child_no, p.status AS package_status,
                   p.trajectory_name, p.created_at AS package_created_at, p.updated_at AS package_updated_at,
                   cr.id AS receipt_id, cr.fno, cr.status AS receipt_status,
                   cr.created_at AS receipt_created_at, cr.last_sync_at
            FROM packages p
            LEFT JOIN china_receipts cr ON cr.id = p.china_receipt_id
            WHERE p.tracking_internal = $1 OR p.child_no = $1 OR cr.fno = $1
            ORDER BY p.updated_at DESC NULLS LAST
            LIMIT 1
        `, [tracking]);

        res.json({
            success: true,
            tracking,
            total: result.rows.length,
            history: result.rows,
            current: currentQ.rows[0] || null
        });
    } catch (error: any) {
        console.error('❌ Error consultando historial:', error?.stack || error);
        res.status(500).json({
            success: false,
            error: 'Error al consultar historial',
            details: error?.message
        });
    }
};

// ============================================
// ADMIN: Recalcular status de china_receipts con base en trajectory_name actual
// POST /api/china/recalc-statuses
// No consulta a MoJie; usa los valores que ya tenemos en packages.trajectory_name.
// ============================================
export const recalcChinaStatuses = async (_req: Request, res: Response): Promise<any> => {
    try {
        console.log('🔁 Recalculando status de china_receipts...');

        // Traer todas las recepciones que NO están en estado final + sus trajectories
        const receipts = await pool.query(`
            SELECT cr.id, cr.fno, cr.status,
                   COALESCE(ARRAY_AGG(p.trajectory_name) FILTER (WHERE p.trajectory_name IS NOT NULL), ARRAY[]::text[]) AS trajectories
            FROM china_receipts cr
            LEFT JOIN packages p ON p.china_receipt_id = cr.id
            WHERE cr.status NOT IN ('delivered', 'received_cdmx', 'completed')
            GROUP BY cr.id
        `);

        const summary: Record<string, number> = {};
        let updated = 0;

        for (const r of receipts.rows) {
            const newStatus = mapTrajectoryToStatus(r.trajectories || []);
            summary[newStatus] = (summary[newStatus] || 0) + 1;
            if (newStatus !== r.status) {
                await pool.query(
                    `UPDATE china_receipts SET status = $1, updated_at = NOW() WHERE id = $2`,
                    [newStatus, r.id]
                );
                await logChinaStatusChange({
                    chinaReceiptId: r.id,
                    fno: r.fno,
                    oldStatus: r.status,
                    newStatus,
                    trajectoryName: (r.trajectories || []).slice(-1)[0] || null,
                    source: 'recalc',
                    notes: `Recalculado a partir de ${(r.trajectories||[]).length} trayectorias`
                });
                updated++;
            }
        }

        console.log(`✅ Recalculados ${receipts.rows.length}, actualizados ${updated}`);

        res.json({
            success: true,
            scanned: receipts.rows.length,
            updated,
            distribution: summary
        });
    } catch (error: any) {
        console.error('❌ Error recalculando status:', error?.stack || error);
        res.status(500).json({
            success: false,
            error: 'Error al recalcular status',
            details: error?.message
        });
    }
};

// ============================================
// PULL: Consultar orden por código desde MJCustomer
// GET /api/china/pull/:orderCode
// ============================================
export const pullFromMJCustomer = async (req: Request, res: Response): Promise<any> => {
    try {
        const orderCode = String(req.params.orderCode || '').trim();
        if (!orderCode) {
            return res.status(400).json({ success: false, error: 'Se requiere el código de orden' });
        }
        if (!gzmojieConfigurado()) {
            return res.status(500).json({ success: false, error: 'GZMOJIE_ACCESS_SECRET no configurado' });
        }

        console.log(`🔄 Consultando sistema aéreo nuevo (gzmojie): ${orderCode}`);

        const orden = await buscarOrdenPorFno(orderCode);
        if (!orden) {
            return res.status(404).json({ success: false, error: 'La orden no existe en el sistema de origen', apiCode: 404 });
        }
        const fno = String(orden.fno || orderCode);

        // Solo hacia adelante: si la guia ya esta en el sistema no se reingesta
        // (no se reescriben registros viejos); solo se crean las que faltan.
        const existe = await pool.query(
            `SELECT 1 FROM packages WHERE split_part(child_no,'-',1) = $1 LIMIT 1`, [fno]);
        if (existe.rows.length) {
            return res.json({ success: true, data: [{ fno, packagesCreated: 0, packagesUpdated: 0, nota: 'ya estaba en el sistema' }] });
        }

        const cajas = await cajasDeOrden(orden.id);
        if (!cajas.length) {
            return res.json({ success: true, data: [{ fno, packagesCreated: 0, packagesUpdated: 0, nota: 'la orden no trae cajas todavia' }] });
        }

        // Se arma el payload con la forma del webhook y se ingiere por el MISMO
        // camino que el push (receiveFromChina), para no duplicar la logica de
        // tarifas y recepciones. El producto/aduanal/guia internacional no vienen
        // en esta consulta; llegan despues por el push y el webhook los completa.
        const payload: any = {
            fno,
            shippingMark: orden.shippingMark || orden.customerCode || '',
            totalQty: orden.totalQty, totalWeight: orden.totalWeight,
            totalVolume: orden.totalVolume, totalCbm: orden.totalCbm,
            file: [],
            data: cajas.map((c: any) => ({
                childNo: c.childNo,
                weight: c.weight, long: c.long, width: c.width, height: c.height,
                singleVolume: c.singleVolume, singleCbm: c.singleCbm,
                proName: c.sku || null, customsBno: null, billNo: null,
                etd: orden.etd || null, eta: orden.eta || null,
            })),
        };

        const resultado: any = await new Promise((resolve) => {
            const reqFalso: any = { body: payload, headers: {}, socket: {} };
            const resFalso: any = {
                statusCode: 200,
                status(c: number) { this.statusCode = c; return this; },
                json(p: any) { resolve({ statusCode: this.statusCode, payload: p }); return this; },
            };
            receiveFromChina(reqFalso, resFalso).catch((e: any) => resolve({ statusCode: 500, payload: { success: false, error: e?.message } }));
        });

        if (resultado.statusCode === 200 && resultado.payload?.success) {
            const d = resultado.payload.data || {};
            return res.json({ success: true, data: [{ fno, packagesCreated: d.packagesCreated || 0, packagesUpdated: d.packagesUpdated || 0 }] });
        }
        return res.status(502).json({ success: false, error: resultado.payload?.error || 'No se pudo ingerir la orden', details: resultado.payload?.details });

    } catch (error: any) {
        console.error("❌ Error consultando sistema aéreo nuevo:", error);
        res.status(500).json({ success: false, error: 'Error al sincronizar', details: error.message });
    }
};

// ============================================
// PULL MASIVO: Sincronizar múltiples órdenes
// POST /api/china/pull-batch
// Body: { orderCodes: ["CODE1", "CODE2", ...] }
// ============================================
export const pullBatchFromMJCustomer = async (req: Request, res: Response): Promise<any> => {
    try {
        const { orderCodes } = req.body;

        if (!orderCodes || !Array.isArray(orderCodes) || orderCodes.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere un array de códigos de orden'
            });
        }

        // Cuántas se procesan POR LLAMADA.
        //
        // La pantalla mandaba TODAS las recepciones activas de un golpe -varios
        // cientos- y esto las recorría de una en una, con su consulta a China y
        // una pausa de 200 ms entre cada una. Son minutos: el proxy corta a los
        // 100 segundos con un 524 y el navegador enseña "Failed to fetch", que
        // la pantalla traducía a "Error de conexión con MoJie API". Por eso se
        // reportó como que China no contestaba, cuando lo que se cayó fue
        // nuestra propia llamada (tarea 1114).
        //
        // Ahora cada llamada procesa un tramo corto y devuelve lo que falta;
        // la pantalla vuelve a llamar hasta terminar.
        const topePedido = Number(req.body.tope);
        const tope = Number.isFinite(topePedido) && topePedido > 0
            ? Math.min(topePedido, 50)
            : 20;
        const codigos = orderCodes.map((c: any) => String(c || '').trim()).filter(Boolean);
        const lote = codigos.slice(0, tope);
        const restantes = codigos.slice(tope);

        console.log(`🔄 Sincronización MoJie: ${lote.length} de ${codigos.length} códigos en esta llamada`);

        const results: any[] = [];
        const errors: any[] = [];
        let creadas = 0;
        let actualizadas = 0;

        for (const code of lote) {
            // Se delega en el pull de UNA orden, que es el que de verdad guarda.
            //
            // Antes esto solo PREGUNTABA: juntaba las respuestas de China en un
            // array y las devolvía al navegador, que las tiraba. El botón de
            // sincronizar no escribía una sola fila, y el aviso decía
            // "Sincronizado: 0 órdenes actualizadas" porque contaba un campo
            // que la respuesta tampoco traía. Llamando al mismo camino que el
            // botón de una guía no hay dos copias que se separen.
            const respuesta: any = await new Promise((resolve) => {
                const reqFalso: any = { params: { orderCode: code }, body: {}, user: (req as any).user };
                const resFalso: any = {
                    statusCode: 200,
                    status(c: number) { this.statusCode = c; return this; },
                    json(payload: any) { resolve({ statusCode: this.statusCode, payload }); return this; },
                };
                pullFromMJCustomer(reqFalso, resFalso).catch((e: any) => {
                    resolve({ statusCode: 500, payload: { success: false, error: e?.message } });
                });
            });

            if (respuesta.statusCode === 200 && respuesta.payload?.success) {
                const filas: any[] = Array.isArray(respuesta.payload.data) ? respuesta.payload.data : [];
                for (const f of filas) {
                    creadas += Number(f.packagesCreated) || 0;
                    actualizadas += Number(f.packagesUpdated) || 0;
                }
                results.push({ code, status: 'success', cajas: filas });
            } else {
                errors.push({
                    code,
                    status: 'error',
                    message: respuesta.payload?.error || respuesta.payload?.details || 'sin detalle',
                });
            }

            // Pequeña pausa entre consultas para no saturar al sistema chino.
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        res.json({
            success: true,
            message: `Procesadas ${results.length} órdenes (${creadas} cajas nuevas, ${actualizadas} actualizadas)`
                + (errors.length ? `, ${errors.length} con error` : '')
                + (restantes.length ? `. Faltan ${restantes.length}.` : ''),
            procesadas: results.length,
            creadas,
            actualizadas,
            results,
            errors,
            restantes,
        });

    } catch (error: any) {
        console.error("❌ Error en sincronización masiva:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// CONFIG: Actualizar token de MJCustomer
// PUT /api/china/config/token
// ============================================
export const updateMJCustomerToken = async (req: Request, res: Response): Promise<any> => {
    try {
        const { token, expiresInDays } = req.body;

        if (!token) {
            return res.status(400).json({ success: false, error: 'Token requerido' });
        }

        // Calcular expiración (default 6 días)
        const daysToExpire = expiresInDays || 6;
        const expiryTimestamp = Date.now() + (daysToExpire * 24 * 60 * 60 * 1000);
        
        // Guardar en runtime
        MJCUSTOMER_API.token = token;
        MJCUSTOMER_API.tokenExpiry = expiryTimestamp;

        // Guardar en BD para persistencia
        await pool.query(`
            INSERT INTO system_config (key, value, updated_at)
            VALUES ('mjcustomer_token', $1, NOW())
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        `, [token]);
        
        await pool.query(`
            INSERT INTO system_config (key, value, updated_at)
            VALUES ('mjcustomer_token_expiry', $1, NOW())
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        `, [expiryTimestamp.toString()]);

        res.json({ 
            success: true, 
            message: 'Token actualizado correctamente',
            expiresAt: new Date(expiryTimestamp).toISOString()
        });

    } catch (error: any) {
        console.error("Error actualizando token:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// CRON: Sincronizar órdenes activas desde MJCustomer
// Llamado cada 15 minutos desde cronJobs.ts
// ============================================
export const syncActiveMJCustomerOrders = async (): Promise<{
    success: boolean;
    ordersProcessed: number;
    ordersUpdated: number;
    errors: string[];
}> => {
    const errors: string[] = [];
    let ordersProcessed = 0;
    let ordersUpdated = 0;

    try {
        console.log('🔄 [CRON MJCustomer] Iniciando sincronización de órdenes activas...');

        // Obtener órdenes activas (no entregadas, últimos 30 días)
        // Usamos subquery para poder hacer DISTINCT y ORDER BY created_at
        const activeOrders = await pool.query(`
            SELECT fno FROM (
                SELECT DISTINCT ON (fno) fno, created_at
                FROM china_receipts 
                WHERE status NOT IN ('delivered', 'cancelled', 'completed')
                  AND created_at > NOW() - INTERVAL '30 days'
                  AND fno IS NOT NULL
                ORDER BY fno, created_at DESC
            ) sub
            ORDER BY created_at DESC
            LIMIT 50
        `);

        if (activeOrders.rows.length === 0) {
            console.log('   → No hay órdenes activas para sincronizar');
            return { success: true, ordersProcessed: 0, ordersUpdated: 0, errors: [] };
        }

        console.log(`   → ${activeOrders.rows.length} órdenes activas encontradas`);

        // El sistema nuevo (gzmojie) firma por petición, no usa token de sesión.
        if (!gzmojieConfigurado()) {
            console.error('   ❌ GZMOJIE_ACCESS_SECRET no configurado');
            return { success: false, ordersProcessed: 0, ordersUpdated: 0, errors: ['gzmojie sin credencial'] };
        }

        const dormir = (ms: number) => new Promise(r => setTimeout(r, ms));

        // Procesar cada orden. El estatus se deduce de la trayectoria de una caja
        // (GetChildTrajectoryList devuelve eventos de caja y de orden de un jalón),
        // así que basta 1 llamada por orden. El AWB/ETA/ETD y los totales llegan por
        // el push a nuestro webhook, no por esta consulta; aquí solo movemos estatus.
        for (const order of activeOrders.rows) {
            try {
                const fno = order.fno;

                // Trayectoria de la orden: primero con el childNo que ya tenemos en
                // packages (0 llamadas de resolución); si gzmojie no lo reconoce
                // (recuperadas o folios manuales), se resuelve el real orden->cajas.
                let eventos: any[] = [];
                const localQ = await pool.query(
                    `SELECT child_no FROM packages
                      WHERE split_part(child_no,'-',1) = $1 AND child_no LIKE 'AIR%'
                      ORDER BY child_no LIMIT 1`, [fno]);
                const localChild: string | null = localQ.rows[0]?.child_no || null;
                if (localChild) {
                    try { eventos = await trayectoriaDeCaja(localChild); } catch { eventos = []; }
                }
                if (!eventos.length) {
                    const orden = await buscarOrdenPorFno(fno);
                    if (orden) {
                        const cajas = await cajasDeOrden(orden.id);
                        const real = cajas[0]?.childNo || cajas[0]?.ChildNo;
                        if (real) { try { eventos = await trayectoriaDeCaja(real); } catch { eventos = []; } }
                    }
                }

                const nombres = eventos
                    .map((e: any) => e.trajectoryName || e.trajecotryName || '')
                    .filter(Boolean);
                if (!nombres.length) { ordersProcessed++; await dormir(1100); continue; }

                const newStatus = mapTrajectoryToStatus(nombres);
                const ordenados = [...eventos].sort((a: any, b: any) =>
                    String(b.occurTime || '').localeCompare(String(a.occurTime || '')));
                const lastTrajectory: string | null =
                    ordenados[0]?.trajectoryName || ordenados[0]?.trajecotryName || null;

                // Registrar historial solo si el status cambió y no es terminal.
                const prevStatusQ = await pool.query(
                    'SELECT id, status FROM china_receipts WHERE fno = $1 LIMIT 1', [fno]);
                const prevRow = prevStatusQ.rows[0];
                const isTerminal = prevRow && ['delivered', 'received_cdmx', 'completed'].includes(prevRow.status);
                if (prevRow && !isTerminal && prevRow.status !== newStatus) {
                    await logChinaStatusChange({
                        chinaReceiptId: prevRow.id,
                        fno,
                        oldStatus: prevRow.status,
                        newStatus,
                        trajectoryName: lastTrajectory,
                        source: 'mojie_sync',
                        notes: 'Sincronización automática (gzmojie)'
                    });
                }

                // Estatus de la recepción (respeta estados terminales).
                await pool.query(`
                    UPDATE china_receipts SET
                        status = CASE
                            WHEN status IN ('delivered', 'received_cdmx', 'completed') THEN status
                            ELSE $2 END,
                        updated_at = NOW(),
                        last_sync_at = NOW()
                    WHERE fno = $1
                `, [fno, newStatus]);

                // Reflejar la última trayectoria en los paquetes de la orden.
                await pool.query(`
                    UPDATE packages SET trajectory_name = COALESCE($2, trajectory_name), updated_at = NOW()
                    WHERE split_part(child_no,'-',1) = $1
                `, [fno, lastTrajectory]);

                ordersUpdated++;
                console.log(`   ✓ ${fno}: status=${newStatus}`);
                ordersProcessed++;

                // Freno para no pasar el tope de 60 llamadas/minuto.
                await dormir(1100);

            } catch (err: any) {
                errors.push(`${order.fno}: ${err.message}`);
            }
        }

        console.log(`✅ [CRON MJCustomer] Sincronización completada: ${ordersUpdated}/${ordersProcessed} actualizadas`);
        
        return { success: true, ordersProcessed, ordersUpdated, errors };

    } catch (error: any) {
        console.error('❌ [CRON MJCustomer] Error en sincronización:', error);
        return { success: false, ordersProcessed, ordersUpdated, errors: [error.message] };
    }
};

// ============================================
// CONFIGURACIÓN DES PARA CALLBACK DE MOJIE
// La llave DES debe configurarse en .env como MJCUSTOMER_DES_KEY
// ============================================
const MOJIE_DES_KEY = process.env.MJCUSTOMER_DES_KEY || 'ENTREGAX'; // Llave DES de 8 caracteres

/**
 * Desencripta datos usando DES-ECB
 * MoJie envía los datos encriptados con DES y codificados en Base64 o Hex
 * La llave DES debe configurarse en .env como MJCUSTOMER_DES_KEY
 */
function decryptDES(encryptedData: string): string {
    try {
        console.log('🔐 Intentando desencriptar DES...');
        console.log('   → Llave DES configurada:', MOJIE_DES_KEY.substring(0, 3) + '***');
        console.log('   → Longitud datos encriptados:', encryptedData.length);
        
        // La llave DES debe ser de 8 bytes
        const key = Buffer.from(MOJIE_DES_KEY.padEnd(8, '\0').slice(0, 8));
        
        // Intentar primero con Base64
        let encryptedBuffer: Buffer;
        let encoding = 'base64';
        try {
            encryptedBuffer = Buffer.from(encryptedData, 'base64');
            // Verificar si es realmente base64 válido
            if (encryptedBuffer.toString('base64') !== encryptedData.replace(/\s/g, '')) {
                throw new Error('No es base64 válido');
            }
        } catch {
            // Si falla, intentar con Hex
            encoding = 'hex';
            encryptedBuffer = Buffer.from(encryptedData, 'hex');
        }
        console.log(`   → Encoding detectado: ${encoding}`);
        
        // Crear decipher DES-ECB (sin IV)
        const decipher = crypto.createDecipheriv('des-ecb', key, null);
        decipher.setAutoPadding(true);
        
        let decrypted = decipher.update(encryptedBuffer);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        const result = decrypted.toString('utf8').trim();
        console.log('   → Desencriptado exitoso, longitud:', result.length);
        return result;
    } catch (error: any) {
        console.error('❌ Error desencriptando DES:', error.message);
        console.error('   → Llave usada:', MOJIE_DES_KEY);
        console.error('   → Primeros 50 chars del input:', encryptedData.substring(0, 50));
        throw new Error(`Error de desencriptación DES: ${error.message}. Verifica la llave MJCUSTOMER_DES_KEY en .env`);
    }
}

// ============================================
// WEBHOOK CALLBACK: Recibir datos encriptados de MoJie
// POST /api/china/callback
// El body viene como string encriptado con DES
// ============================================

// Función auxiliar para guardar logs de callbacks (diagnóstico)
async function logCallback(data: any, status: 'received' | 'processed' | 'error', errorMsg?: string): Promise<void> {
    try {
        await pool.query(`
            INSERT INTO china_callback_logs (raw_body, content_type, status, error_message, created_at)
            VALUES ($1, $2, $3, $4, NOW())
        `, [
            typeof data === 'string' ? data : JSON.stringify(data),
            'application/json',
            status,
            errorMsg || null
        ]);
    } catch (e) {
        // Ignorar errores de log (la tabla puede no existir)
        console.warn('⚠️ No se pudo guardar log de callback (tabla puede no existir)');
    }
}

export const mojieCallbackEncrypted = async (req: Request, res: Response): Promise<any> => {
    const client = await pool.connect();
    
    try {
        console.log('📥 [MoJie Callback] Recibiendo datos...');
        console.log('   → Content-Type:', req.headers['content-type']);
        console.log('   → Body type:', typeof req.body);
        console.log('   → Body preview:', typeof req.body === 'string' ? req.body.substring(0, 100) : JSON.stringify(req.body).substring(0, 100));
        
        // Guardar log del callback recibido
        await logCallback({ 
            headers: req.headers, 
            body: req.body,
            rawBody: typeof req.body === 'string' ? req.body.substring(0, 500) : null
        }, 'received');
        
        // El body puede venir en múltiples formatos según cómo MoJie lo envíe
        let encryptedData: string | null = null;
        let directPayload: ChinaApiPayload | null = null;
        
        // Caso 1: Body es string directo (text/plain)
        if (typeof req.body === 'string' && req.body.length > 0) {
            // Verificar si es JSON sin encriptar
            if (req.body.trim().startsWith('{')) {
                try {
                    directPayload = normalizaPayloadDeChina(JSON.parse(req.body));
                    console.log('   → Body es JSON string, parseado correctamente');
                } catch {
                    encryptedData = req.body;
                    console.log('   → Body es string encriptado');
                }
            } else {
                encryptedData = req.body;
                console.log('   → Body es string encriptado (no JSON)');
            }
        }
        // Caso 2: Body es objeto con datos encriptados en algún campo
        else if (typeof req.body === 'object' && req.body !== null) {
            if (req.body.data && typeof req.body.data === 'string') {
                encryptedData = req.body.data;
                console.log('   → Datos encriptados en campo "data"');
            } else if (req.body.encrypted && typeof req.body.encrypted === 'string') {
                encryptedData = req.body.encrypted;
                console.log('   → Datos encriptados en campo "encrypted"');
            } else if (req.body.content && typeof req.body.content === 'string') {
                encryptedData = req.body.content;
                console.log('   → Datos encriptados en campo "content"');
            } else if (campoDeChina(req.body, 'fno', 'orderNo', 'orderCode')) {
                // JSON sin encriptar con estructura esperada
                directPayload = normalizaPayloadDeChina(req.body);
                console.log('   → Datos JSON sin encriptar (tiene fno)');
            } else {
                // Intentar buscar cualquier campo string largo que pueda ser encriptado
                for (const key of Object.keys(req.body)) {
                    if (typeof req.body[key] === 'string' && req.body[key].length > 50) {
                        encryptedData = req.body[key];
                        console.log(`   → Posibles datos encriptados en campo "${key}"`);
                        break;
                    }
                }
            }
        }
        
        // Si no encontramos datos válidos
        if (!encryptedData && !directPayload) {
            console.error('❌ [MoJie Callback] No se encontraron datos válidos');
            console.error('   → Body completo:', JSON.stringify(req.body));
            return res.status(400).json({ 
                success: false, 
                error: 'Formato de datos no reconocido. Se espera string encriptado o JSON con fno.',
                receivedType: typeof req.body,
                receivedKeys: typeof req.body === 'object' ? Object.keys(req.body || {}) : 'N/A'
            });
        }
        
        // Si ya tenemos el payload directo, procesarlo
        if (directPayload) {
            console.log('   → Procesando payload directo sin desencriptar...');
            return processCallbackPayload(client, directPayload, res);
        }
        
        // Si llegamos aquí, tenemos datos encriptados
        if (!encryptedData) {
            throw new Error('No se encontraron datos encriptados para procesar');
        }
        
        console.log(`   → Datos encriptados recibidos: ${encryptedData.length} caracteres`);
        
        // Desencriptar con DES
        const decryptedString = decryptDES(encryptedData);
        console.log('   → Datos desencriptados correctamente');
        
        // Parsear el JSON desencriptado
        const payload: ChinaApiPayload = normalizaPayloadDeChina(JSON.parse(decryptedString));
        console.log(`   → FNO: ${payload.fno}, ShippingMark: ${payload.shippingMark}`);
        
        // Procesar el payload
        return processCallbackPayload(client, payload, res);
        
    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('❌ [MoJie Callback] Error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error procesando callback de MoJie',
            details: error.message 
        });
    } finally {
        client.release();
    }
};

/**
 * Procesa el payload del callback de MoJie (ya desencriptado)
 * Estructura según documentación:
 * - fno: Número de orden principal
 * - shippingMark: Marca/código del cliente
 * - totalQty, totalWeight, totalVolume, totalCbm: Totales
 * - createTime: Fecha de creación
 * - operateType: 1=App, 2=Web, 3=Reservation
 * - file: URLs de archivos adjuntos
 * - data[]: Array de paquetes individuales con childNo, weight, dimensions, etc.
 */
async function processCallbackPayload(
    client: any, 
    payload: ChinaApiPayload, 
    res: Response
): Promise<any> {
    try {
        console.log(`📦 Procesando callback FNO: ${payload.fno}`);
        
        await client.query('BEGIN');
        
        // 1. Buscar cliente por ShippingMark (box_id)
        // El empate parcial que habia aqui ('LIKE %marca%') no solo fallaba:
        // acertaba al cliente EQUIVOCADO, y la consulta ni siquiera llevaba
        // ORDER BY, asi que el ganador salia por suerte. duenoDeLaMarca pide
        // empate exacto, limpia la anotacion de China y acepta al cliente del
        // sistema anterior solo si ya reclamo su casillero.
        const userId = await duenoDeLaMarca(client, payload.shippingMark);
        const nombreRes = userId
            ? await client.query('SELECT full_name FROM users WHERE id = $1', [userId])
            : null;
        const userName = nombreRes?.rows[0]?.full_name || 'Sin asignar';
        
        console.log(`   → Cliente: ${userName} (ID: ${userId || 'N/A'})`);
        
        // 🏠 Auto-asignar dirección predeterminada para servicio 'air'
        const defaultAirAddressId = await resolveDefaultAirAddress(client, userId);
        if (defaultAirAddressId) {
            console.log(`   → Dirección predeterminada 'air' asignada automáticamente: ID ${defaultAirAddressId}`);
        }

        // 2. Insertar o actualizar recibo principal
        const receiptResult = await client.query(`
            INSERT INTO china_receipts 
            (fno, user_id, shipping_mark, total_qty, total_weight, total_volume, total_cbm, 
             evidence_urls, notes, source, delivery_address_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (fno) DO UPDATE SET
                total_qty = EXCLUDED.total_qty,
                total_weight = EXCLUDED.total_weight,
                total_volume = EXCLUDED.total_volume,
                total_cbm = EXCLUDED.total_cbm,
                evidence_urls = COALESCE(EXCLUDED.evidence_urls, china_receipts.evidence_urls),
                delivery_address_id = COALESCE(china_receipts.delivery_address_id, EXCLUDED.delivery_address_id),
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        `, [
            payload.fno,
            userId,
            payload.shippingMark,
            payload.totalQty || 0,
            payload.totalWeight || 0,
            payload.totalVolume || 0,
            payload.totalCbm || 0,
            payload.file || [],
            `Callback MoJie ${new Date().toISOString()}`,
            'mojie_callback',
            defaultAirAddressId
        ]);
        
        const receiptId = receiptResult.rows[0].id;
        let packagesCreated = 0;
        let packagesUpdated = 0;
        
        // 3. Procesar cada paquete en data[]
        if (payload.data && Array.isArray(payload.data)) {
            for (const item of payload.data) {
                const childNo = item.childNo;
                
                // Verificar si el paquete ya existe
                const existingPkg = await client.query(
                    'SELECT id FROM packages WHERE child_no = $1',
                    [childNo]
                );
                
                if (existingPkg.rows.length > 0) {
                    // Actualizar paquete existente (NO sobrescribir precio si ya tiene)
                    await client.query(`
                        UPDATE packages SET
                            weight = COALESCE($1, weight),
                            long_cm = COALESCE($2, long_cm),
                            width_cm = COALESCE($3, width_cm),
                            height_cm = COALESCE($4, height_cm),
                            pro_name = COALESCE($5, pro_name),
                            customs_bno = COALESCE($6, customs_bno),
                            trajectory_name = COALESCE($7, trajectory_name),
                            single_volume = COALESCE($8, single_volume),
                            single_cbm = COALESCE($9, single_cbm),
                            international_tracking = COALESCE($10, international_tracking),
                            etd = COALESCE($11, etd),
                            eta = COALESCE($12, eta),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE child_no = $13
                    `, [
                        item.weight,
                        item.long,
                        item.width,
                        item.height,
                        item.proName,
                        item.customsBno,
                        item.trajecotryName, // Nota: typo en API original
                        item.singleVolume,
                        item.singleCbm,
                        item.billNo || null,
                        item.etd || null,
                        item.eta || null,
                        childNo
                    ]);
                    packagesUpdated++;
                } else {
                    // Crear nuevo paquete CON PRECIO DE VENTA ASIGNADO
                    const trackingInternal = await trackingInternoDeChina(client, childNo);
                    const dimensions = `${item.long || 0}x${item.width || 0}x${item.height || 0}`;
                    
                    // === CALCULAR PRECIO DE VENTA ===
                    // Buscar ruta activa (asumimos destino MEX por defecto)
                    const routeRes = await client.query(`
                        SELECT id FROM air_routes
                         WHERE is_active = true AND code <> 'TDI-EXPRES'
                         ORDER BY id ASC LIMIT 1
                    `);
                    const airRouteId = routeRes.rows.length > 0 ? routeRes.rows[0].id : null;
                    
                    // Determinar tipo de tarifa basado en proName/descripción
                    const proNameLower = (item.proName || '').toLowerCase();
                    let tariffType = 'G'; // Por defecto Genérico
                    if (proNameLower.includes('logo') || proNameLower.includes('鞋') || proNameLower.includes('zapato') || proNameLower.includes('shoes')) {
                        tariffType = 'L';
                    } else if (proNameLower.includes('medical') || proNameLower.includes('sensible') || proNameLower.includes('medicina')) {
                        tariffType = 'S';
                    }
                    
                    // Buscar precio: primero verificar Start Up, luego personalizada, luego general
                    const weight = parseFloat(String(item.weight || 0)) || 0;
                    // Mismo peso cobrable que en el ingreso directo: el volumetrico
                    // que declara China, o el que sale de las medidas (tarea 1086).
                    const volDeclarado = parseFloat(String(item.singleVolume || 0)) || 0;
                    const volumetrico = volDeclarado > 0
                        ? volDeclarado
                        : ((parseFloat(String(item.long || 0)) || 0)
                           * (parseFloat(String(item.width || 0)) || 0)
                           * (parseFloat(String(item.height || 0)) || 0)) / 6000;
                    const pesoCobrable = Math.max(weight, volumetrico > 0 ? volumetrico : 0);
                    let pricePerKg = 0;
                    let isCustomTariff = false;
                    let salePrice = 0;
                    let isStartup = false;
                    
                    // Check Start Up tier (flat price by weight bracket, ≤15kg)
                    // El tramo va por peso REAL, igual que el cobro y el cotizador.
                    if (airRouteId && weight > 0 && weight <= 15) {
                        const startupRes = await client.query(`
                            SELECT price_usd FROM air_startup_tiers
                            WHERE route_id = $1 AND is_active = true AND $2 >= min_weight AND $2 <= max_weight
                            LIMIT 1
                        `, [airRouteId, weight]);
                        if (startupRes.rows.length > 0) {
                            salePrice = parseFloat(startupRes.rows[0].price_usd);
                            pricePerKg = weight > 0 ? salePrice / weight : 0;
                            isStartup = true;
                            tariffType = 'SU';
                        }
                    }
                    
                    // If not startup, use per-kg pricing
                    if (!isStartup) {
                        if (airRouteId && userId) {
                            // Mismo acuerdo que en el ingreso directo: puede mandar
                            // sobre el tipo y puede venir como nivel (tarea 1070).
                            const { resolverTarifaDeCliente } = await import('./tarifaDeCliente');
                            const acuerdo = await resolverTarifaDeCliente(client, {
                                userId, routeId: airRouteId, tipoSugerido: tariffType,
                            });
                            if (acuerdo.esDeCliente && acuerdo.pricePerKg > 0) {
                                tariffType = acuerdo.tipo;
                                pricePerKg = acuerdo.pricePerKg;
                                isCustomTariff = true;
                                console.log(`   [tarifa] ${childNo}: ${acuerdo.origen}`);
                            }
                        }
                        
                        if (pricePerKg === 0 && airRouteId) {
                            const generalTariffRes = await client.query(`
                                SELECT price_per_kg FROM air_tariffs 
                                WHERE route_id = $1 AND tariff_type = $2 AND is_active = true
                                LIMIT 1
                            `, [airRouteId, tariffType]);
                            
                            if (generalTariffRes.rows.length > 0) {
                                pricePerKg = parseFloat(generalTariffRes.rows[0].price_per_kg);
                            }
                        }
                        salePrice = pesoCobrable * pricePerKg;
                    }
                    
                    console.log(`   📦 ${childNo}: ${tariffType} | ${weight}kg real / ${pesoCobrable.toFixed(2)}kg cobrable ${isStartup ? `STARTUP $${salePrice.toFixed(2)}` : `× $${pricePerKg}/kg = $${salePrice.toFixed(2)}`} (${isCustomTariff ? 'CUSTOM' : 'GENERAL'})`);
                    
                    await client.query(`
                        INSERT INTO packages 
                        (tracking_internal, child_no, china_receipt_id, user_id, box_id,
                         weight, dimensions, long_cm, width_cm, height_cm,
                         description, pro_name, customs_bno, trajectory_name,
                         single_volume, single_cbm, international_tracking,
                         etd, eta, service_type, warehouse_location, status,
                         air_route_id, air_tariff_type, air_price_per_kg, air_sale_price, air_is_custom_tariff,
                         air_chargeable_weight, air_price_assigned_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, NOW())
                    `, [
                        trackingInternal,       // $1
                        childNo,                // $2
                        receiptId,              // $3
                        userId,                 // $4
                        payload.shippingMark || null, // $5 box_id
                        item.weight || 0,       // $6
                        dimensions,             // $7
                        item.long || 0,         // $8
                        item.width || 0,        // $9
                        item.height || 0,       // $10
                        item.proName || 'Sin descripción', // $11
                        item.proName,           // $12
                        item.customsBno,        // $13
                        item.trajecotryName,    // $14
                        item.singleVolume || 0, // $15
                        item.singleCbm || 0,    // $16
                        item.billNo || null,    // $17
                        item.etd || null,       // $18
                        item.eta || null,       // $19
                        'AIR_CHN_MX',           // $20
                        'china_air',            // $21
                        'received_china',       // $22
                        airRouteId,             // $23
                        tariffType,             // $24
                        pricePerKg,             // $25
                        salePrice,              // $26
                        isCustomTariff,         // $27
                        pesoCobrable > 0 ? pesoCobrable : null // $28
                    ]);
                    packagesCreated++;
                }
            }
        }
        
        // === ACTUALIZAR SALDO EN CHINA_RECEIPTS ===
        // Calcular el total de air_sale_price de los paquetes asociados
        const totalSaleRes = await client.query(`
            SELECT COALESCE(SUM(air_sale_price), 0) as total_sale
            FROM packages 
            WHERE china_receipt_id = $1 AND air_sale_price IS NOT NULL
        `, [receiptId]);
        const totalSale = parseFloat(totalSaleRes.rows[0].total_sale) || 0;
        
        // Actualizar con el total de precios o estimar con peso
        if (totalSale > 0) {
            await client.query(`
                UPDATE china_receipts 
                SET assigned_cost_mxn = $1, saldo_pendiente = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [totalSale, receiptId]);
            console.log(`   💰 Saldo asignado: $${totalSale.toFixed(2)} USD`);
        } else if (payload.totalWeight > 0) {
            const estimatedCost = payload.totalWeight * 21;
            await client.query(`
                UPDATE china_receipts 
                SET assigned_cost_mxn = $1, saldo_pendiente = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2 AND assigned_cost_mxn IS NULL
            `, [estimatedCost, receiptId]);
            console.log(`   💰 Saldo estimado: $${estimatedCost.toFixed(2)} USD`);
        }
        
        await client.query('COMMIT');
        
        console.log(`   ✅ FNO ${payload.fno}: ${packagesCreated} creados, ${packagesUpdated} actualizados`);
        
        // 4. Notificar al cliente si está identificado
        if (userId) {
            try {
                await createNotification(
                    userId,
                    'PACKAGE_RECEIVED',
                    `📦 Nueva recepción China Air: ${payload.fno} con ${payload.totalQty || payload.data?.length || 1} paquete(s)`,
                    { 
                        receiptId, 
                        fno: payload.fno,
                        service: 'China Air',
                        packagesCount: payload.data?.length || 0
                    },
                    '/china-dashboard'
                );
            } catch (notifError) {
                console.warn('   ⚠️ Error enviando notificación:', notifError);
            }
        }
        
        // Respuesta exitosa (código 200 según documentación)
        return res.status(200).json({
            success: true,
            message: 'Callback procesado correctamente',
            data: {
                fno: payload.fno,
                receiptId,
                userId,
                shippingMark: payload.shippingMark,
                packagesCreated,
                packagesUpdated,
                totalPackages: payload.data?.length || 0
            }
        });
        
    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    }
}
