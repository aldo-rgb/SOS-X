// ============================================
// CLIENTE DEL SISTEMA AEREO NUEVO (gzmojie.com)
// ============================================
// El sistema viejo (api.mjcustomer.com) dejo de tener ordenes el 23 de octubre
// y su grupo `otherSystem/orderByList` responde 404. Las ordenes de noviembre
// viven en https://www.gzmojie.com. Ese sistema NO usa login SM2 + token: cada
// peticion se firma sola con una credencial de acceso abierto (accessKey +
// accessSecret), asi nuestro servidor consulta sin sesion de usuario.
//
// Firma (tal cual la especifico el area de sistemas de China, tarea 1114):
//   signString = METHOD + "&" + Path + "&" + accessKey + "&" + timestamp + "&" + nonce
//   sign       = Base64( HMAC-SHA256( key = accessSecret, data = signString ) )
//   - METHOD   : mayusculas, GET o POST
//   - Path     : ruta sin dominio y sin query, empezando con "/"; si lleva
//                parametro va el VALOR real (p.ej. /api/orderInfo/childData/1795...)
//   - timestamp: segundos Unix (10 digitos), tolerancia +-5 min
//   - nonce    : aleatorio, unico dentro de 10 min (si se repite -> replay -> 401)
//   - el body y el query string NO se firman
// Headers que viajan: accessKey, timestamp, nonce, sign.
//
// El accessSecret NUNCA va en el codigo: se lee de GZMOJIE_ACCESS_SECRET (env de
// Railway). Sin esa variable el cliente no firma y avisa claro.

import crypto from 'crypto';

const BASE = (process.env.GZMOJIE_API_URL || 'https://www.gzmojie.com').replace(/\/+$/, '');
const ACCESS_KEY = process.env.GZMOJIE_ACCESS_KEY || 'H5AIR2026';
const ACCESS_SECRET = process.env.GZMOJIE_ACCESS_SECRET || '';

export function gzmojieConfigurado(): boolean {
    return ACCESS_SECRET.length > 0;
}

/** Arma los 4 headers firmados para un metodo y una ruta (ruta ya con su valor real). */
function firma(method: 'GET' | 'POST', path: string): Record<string, string> {
    if (!ACCESS_SECRET) {
        throw new Error('GZMOJIE_ACCESS_SECRET no esta configurado: no se puede firmar la peticion a gzmojie.com.');
    }
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomBytes(12).toString('hex'); // 24 chars hex, unico
    const signString = `${method}&${path}&${ACCESS_KEY}&${timestamp}&${nonce}`;
    const sign = crypto.createHmac('sha256', ACCESS_SECRET).update(signString).digest('base64');
    return { accessKey: ACCESS_KEY, timestamp, nonce, sign };
}

/** fetch con timeout; devuelve { status, json, rawText } sin lanzar por codigo != 200. */
async function pide(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    timeoutMs = 20000,
): Promise<{ status: number; json: any; rawText: string }> {
    const headers: Record<string, string> = {
        ...firma(method, path),
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const init: RequestInit = { method, headers, signal: ctrl.signal };
        if (method === 'POST') init.body = JSON.stringify(body ?? {});
        const r = await fetch(`${BASE}${path}`, init);
        const rawText = await r.text();
        let json: any = null;
        try { json = rawText ? JSON.parse(rawText) : null; } catch { /* respuesta no-JSON */ }
        return { status: r.status, json, rawText };
    } finally {
        clearTimeout(t);
    }
}

// --- Interfaces minimas (segun el contrato que entrego China; se validan en vivo) ---

export interface GzOrden {
    id: number | string;        // id interno de la orden (lo pide childData, NO el fno)
    fno: string;
    shippingMark?: string;
    customerCode?: string;
    totalQty?: number;
    totalWeight?: number;
    totalCbm?: number;
    status?: string;
    etd?: string | null;
    eta?: string | null;
    [k: string]: any;
}

/**
 * 1) Buscar una orden por su numero (acepta los dos formatos de folio).
 *    POST /api/orderInfo/page  { fno, page, pageSize }
 *    Devuelve la primera coincidencia o null.
 */
export async function buscarOrdenPorFno(fno: string): Promise<GzOrden | null> {
    const path = '/api/orderInfo/page';
    const { status, json, rawText } = await pide('POST', path, { fno, page: 1, pageSize: 20 });
    if (status !== 200) {
        throw new Error(`gzmojie page HTTP ${status}: ${rawText.slice(0, 300)}`);
    }
    const items: any[] = json?.result?.items || json?.data?.items || json?.items || [];
    const exacta = items.find((o) => String(o?.fno ?? o?.Fno ?? '') === fno);
    return (exacta || items[0] || null) as GzOrden | null;
}

/**
 * 2) Cajas (child) de una orden.
 *    GET /api/orderInfo/childData/{orderId}  -> recibe el id interno, no el fno.
 */
export async function cajasDeOrden(orderId: number | string): Promise<any[]> {
    const path = `/api/orderInfo/childData/${orderId}`;
    const { status, json, rawText } = await pide('GET', path);
    if (status !== 200) {
        throw new Error(`gzmojie childData HTTP ${status}: ${rawText.slice(0, 300)}`);
    }
    const data = json?.result ?? json?.data ?? json;
    return Array.isArray(data) ? data : (data?.items || data?.children || []);
}

/**
 * 3) Trayectoria de una caja (y de la orden completa).
 *    GET /api/orderInfo/GetChildTrajectoryList/{childNo}
 *    Cada evento trae `level` = 'child' | 'order'.
 */
export async function trayectoriaDeCaja(childNo: string): Promise<any[]> {
    const path = `/api/orderInfo/GetChildTrajectoryList/${childNo}`;
    const { status, json, rawText } = await pide('GET', path);
    if (status !== 200) {
        throw new Error(`gzmojie trajectory HTTP ${status}: ${rawText.slice(0, 300)}`);
    }
    const data = json?.result ?? json?.data ?? json;
    return Array.isArray(data) ? data : (data?.items || data?.list || []);
}
