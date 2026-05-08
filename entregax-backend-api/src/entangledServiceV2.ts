// ============================================================================
// ENTANGLED Service v2 — Cliente HTTP del motor externo (api.entangledclothing.com)
// ============================================================================
// Cambios respecto a v1:
//  * Base URL: https://api.entangledclothing.com/api/v1
//  * `POST /v1/solicitud-pago` ahora es MULTIPART (payload JSON + comprobante).
//  * Modelo de 2 servicios: pago_con_factura | pago_sin_factura.
//  * Nuevos endpoints: GET /v1/tipo-cambio, GET /v1/conceptos/search,
//    POST /admin/cliente-api/rotate.
//  * Webhooks firmados con HMAC SHA-256 sobre el RAW BODY (verificación en
//    entangledController.ts usando express.raw).
// ============================================================================

import axios, { AxiosError } from 'axios';
import FormData from 'form-data';

const ENTANGLED_BASE_URL =
  process.env.ENTANGLED_BASE_URL || 'https://api.entangledclothing.com';
const ENTANGLED_API_KEY = process.env.ENTANGLED_API_KEY || '';
const ENTANGLED_TIMEOUT_MS = Number(process.env.ENTANGLED_TIMEOUT_MS || 30000);
const ENTANGLED_SOURCE = process.env.ENTANGLED_SOURCE_TAG || 'XPAY';

export const ENTANGLED_WEBHOOK_SECRET =
  process.env.ENTANGLED_WEBHOOK_SECRET || '';

export const isEntangledConfigured = (): boolean => Boolean(ENTANGLED_API_KEY);

// Normaliza la base URL para tolerar las tres formas que llegan de configuración:
//   * https://api.entangledclothing.com
//   * https://api.entangledclothing.com/api          (Railway)
//   * https://api.entangledclothing.com/api/v1
// y siempre apunta a `<root>/api/v1`.
const normalizeBase = (raw: string): string => {
  const base = raw.replace(/\/+$/, '');
  if (/\/api\/v1$/i.test(base)) return base;
  if (/\/api$/i.test(base)) return `${base}/v1`;
  return `${base}/api/v1`;
};

// Devuelve la raíz del dominio (sin `/api/v1` ni `/api`) para endpoints fuera de v1
// como `/api/admin/cliente-api/rotate`.
const rootBase = (): string =>
  ENTANGLED_BASE_URL.replace(/\/+$/, '').replace(/\/api\/v1$/i, '').replace(/\/api$/i, '');

const buildUrl = (path: string): string => `${normalizeBase(ENTANGLED_BASE_URL)}${path}`;

const authHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  Authorization: `Bearer ${ENTANGLED_API_KEY}`,
  'X-Source': ENTANGLED_SOURCE,
  ...extra,
});

// ---------------------------------------------------------------------------
// Tipos compartidos
// ---------------------------------------------------------------------------

export type EntangledServicio = 'pago_con_factura' | 'pago_sin_factura';
export type EntangledDivisa = 'USD' | 'RMB';

export interface EntangledClienteFinalV2 {
  razon_social: string;
  rfc?: string | undefined;
  email?: string | undefined;
  regimen_fiscal?: string | undefined;
  cp?: string | undefined;
  uso_cfdi?: string | undefined;
}

export interface EntangledConceptoV2 {
  clave_prodserv: string;
  cantidad?: number | undefined;
  descripcion?: string | undefined;
  valor_unitario?: number | undefined;
}

export interface EntangledSolicitudPayloadV2 {
  servicio: EntangledServicio;
  comision_cliente_final_porcentaje: number;
  // TC que XPAY le cobra al cliente (ENTANGLED lo exige)
  tc_cliente_final?: number | undefined;
  monto_usd: number;
  divisa: EntangledDivisa;
  cliente_final: EntangledClienteFinalV2;
  conceptos?: EntangledConceptoV2[] | undefined;
  // Metadatos opcionales sólo informativos para ENTANGLED
  referencia_xpay?: string | undefined;
  notas?: string | undefined;
}

export interface EntangledEmpresaAsignadaV2 {
  clave_prodserv?: string | undefined;
  empresa?: string | undefined;
  cuenta_bancaria?: any;
  monto?: number | undefined;
  divisa?: string | undefined;
}

export interface EntangledSolicitudResponseV2 {
  ok: boolean;
  transaccion_id?: string | undefined;
  estatus?: string | undefined;
  comision_cobrada_porcentaje?: number | undefined;
  tc_aplicado_usd?: number | undefined;
  empresas_asignadas?: EntangledEmpresaAsignadaV2[] | undefined;
  url_comprobante_cliente?: string | undefined;
  raw?: any;
  error?: string | undefined;
}

export interface EntangledTipoCambioV2 {
  ok: boolean;
  divisa?: string | undefined;
  tipo_cambio?: number | undefined;
  vigencia?: string | undefined;
  raw?: any;
  error?: string | undefined;
}

export interface EntangledConceptoResultV2 {
  clave_prodserv: string;
  descripcion: string;
  // Estos campos solo llegan si ENTANGLED los agrega al API en el futuro.
  empresa_asignada?: { id?: string; nombre?: string; rfc?: string } | null;
  disponible?: boolean;
}

// ---------------------------------------------------------------------------
// POST /api/v1/solicitud-pago
// Acepta dos modalidades:
//   1) multipart/form-data — payload + comprobante (legacy)
//   2) application/json    — sólo payload, ENTANGLED responde sincrónicamente
//      con empresas_asignadas[].cuenta_bancaria. El comprobante se sube luego
//      con uploadComprobanteToTransaccion().
// ---------------------------------------------------------------------------
export const sendSolicitudPago = async (
  payload: EntangledSolicitudPayloadV2,
  comprobante?: { buffer: Buffer; filename: string; mimetype: string } | null
): Promise<EntangledSolicitudResponseV2> => {
  if (!ENTANGLED_API_KEY) {
    return {
      ok: false,
      error: 'ENTANGLED_API_KEY no configurada.',
    };
  }
  const hasFile = !!(comprobante && comprobante.buffer && comprobante.buffer.length > 0);
  try {
    // ENTANGLED espera el campo `monto` (no `monto_usd`). Enviamos ambos por
    // compat hacia adelante por si el contrato cambia.
    const payloadForEntangled: any = {
      ...payload,
      monto: (payload as any).monto != null ? (payload as any).monto : payload.monto_usd,
    };

    let res;
    if (hasFile) {
      const form = new FormData();
      form.append('payload', JSON.stringify(payloadForEntangled), { contentType: 'application/json' });
      form.append('comprobante', comprobante!.buffer, {
        filename: comprobante!.filename || 'comprobante',
        contentType: comprobante!.mimetype || 'application/octet-stream',
      });
      res = await axios.post(buildUrl('/solicitud-pago'), form, {
        timeout: ENTANGLED_TIMEOUT_MS,
        headers: authHeaders(form.getHeaders()),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
    } else {
      // Modalidad sin comprobante: ENTANGLED debe devolver empresas_asignadas
      // de inmediato para que el cliente sepa a qué cuenta depositar.
      res = await axios.post(buildUrl('/solicitud-pago'), payloadForEntangled, {
        timeout: ENTANGLED_TIMEOUT_MS,
        headers: authHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    const data = res.data || {};
    const transaccionId =
      data.transaccion_id || data.transaccionId || data.id || undefined;

    return {
      ok: true,
      transaccion_id: transaccionId,
      estatus: data.estatus || data.status,
      comision_cobrada_porcentaje:
        data.comision_cobrada_porcentaje != null
          ? Number(data.comision_cobrada_porcentaje)
          : undefined,
      tc_aplicado_usd:
        data.tc_aplicado_usd != null ? Number(data.tc_aplicado_usd) : undefined,
      empresas_asignadas: Array.isArray(data.empresas_asignadas)
        ? data.empresas_asignadas
        : undefined,
      url_comprobante_cliente: data.url_comprobante_cliente || undefined,
      raw: data,
    };
  } catch (err) {
    const ax = err as AxiosError;
    const responseData = ax.response?.data as any;
    const message =
      responseData?.error ||
      responseData?.message ||
      ax.message ||
      'Error desconocido al contactar ENTANGLED';
    console.error('[ENTANGLED] sendSolicitudPago error:', message, ax.response?.status);
    return { ok: false, error: message, raw: responseData };
  }
};

// ---------------------------------------------------------------------------
// POST /api/v1/solicitud-pago/:transaccion_id/comprobante  (multipart)
// Adjunta el comprobante a una solicitud previamente creada (modo "sin
// comprobante"). El path exacto es configurable vía variable de entorno
// ENTANGLED_UPLOAD_PROOF_PATH (default: /solicitud-pago/:id/comprobante).
// ---------------------------------------------------------------------------
export const uploadComprobanteToTransaccion = async (
  transaccionId: string,
  comprobante: { buffer: Buffer; filename: string; mimetype: string }
): Promise<{ ok: boolean; url_comprobante_cliente?: string; error?: string; raw?: any }> => {
  if (!ENTANGLED_API_KEY) return { ok: false, error: 'ENTANGLED_API_KEY no configurada.' };
  if (!transaccionId) return { ok: false, error: 'transaccion_id requerido' };
  if (!comprobante || !comprobante.buffer || comprobante.buffer.length === 0) {
    return { ok: false, error: 'Falta el comprobante (archivo).' };
  }

  const pathTpl =
    process.env.ENTANGLED_UPLOAD_PROOF_PATH || '/solicitud-pago/:id/comprobante';
  const path = pathTpl.replace(':id', encodeURIComponent(transaccionId));

  try {
    const form = new FormData();
    form.append('comprobante', comprobante.buffer, {
      filename: comprobante.filename || 'comprobante',
      contentType: comprobante.mimetype || 'application/octet-stream',
    });

    const res = await axios.post(buildUrl(path), form, {
      timeout: ENTANGLED_TIMEOUT_MS,
      headers: authHeaders(form.getHeaders()),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    const data = res.data || {};
    return {
      ok: true,
      url_comprobante_cliente:
        data.url_comprobante_cliente || data.url || undefined,
      raw: data,
    };
  } catch (err) {
    const ax = err as AxiosError;
    const responseData = ax.response?.data as any;
    const message =
      responseData?.error ||
      responseData?.message ||
      ax.message ||
      'Error al subir comprobante a ENTANGLED';
    console.error(
      '[ENTANGLED] uploadComprobanteToTransaccion error:',
      message,
      ax.response?.status
    );
    return { ok: false, error: message, raw: responseData };
  }
};

// ---------------------------------------------------------------------------
// GET /api/v1/tipo-cambio
// ---------------------------------------------------------------------------
export const getTipoCambio = async (
  divisa: EntangledDivisa = 'USD'
): Promise<EntangledTipoCambioV2> => {
  if (!ENTANGLED_API_KEY) return { ok: false, error: 'ENTANGLED_API_KEY no configurada.' };
  try {
    const res = await axios.get(buildUrl('/tipo-cambio'), {
      timeout: ENTANGLED_TIMEOUT_MS,
      headers: authHeaders(),
      params: { divisa },
    });
    const data = res.data || {};
    // Schema real del API: { divisa, valor }. Mantenemos fallback a tipo_cambio por compat.
    const valor = data.valor != null ? Number(data.valor)
      : data.tipo_cambio != null ? Number(data.tipo_cambio)
      : undefined;
    return {
      ok: true,
      divisa: data.divisa,
      tipo_cambio: valor,
      vigencia: data.vigencia,
      raw: data,
    };
  } catch (err) {
    const ax = err as AxiosError;
    const responseData = ax.response?.data as any;
    return {
      ok: false,
      error: responseData?.error || ax.message || 'Error obteniendo tipo de cambio',
      raw: responseData,
    };
  }
};

// ---------------------------------------------------------------------------
// GET /api/v1/conceptos/search?q=...&limit=...
// ---------------------------------------------------------------------------
// Helper: una sola llamada al endpoint de ENTANGLED
const callConceptosSearch = async (
  q: string,
  limit: number,
  proveedorId?: string
): Promise<{ ok: boolean; results: EntangledConceptoResultV2[]; raw?: any; error?: string }> => {
  try {
    const params: Record<string, any> = { q, limit };
    if (proveedorId) params.proveedor_id = proveedorId;
    const url = buildUrl('/conceptos/search');
    console.log(`[ENTANGLED] GET ${url} params=${JSON.stringify(params)}`);
    const res = await axios.get(url, {
      timeout: ENTANGLED_TIMEOUT_MS,
      headers: authHeaders(),
      params,
    });
    const data = res.data || {};
    console.log(`[ENTANGLED] /conceptos/search resp keys=${Object.keys(data).join(',')} sample=${JSON.stringify(data).slice(0, 300)}`);
    const results: EntangledConceptoResultV2[] = Array.isArray(data.conceptos)
      ? data.conceptos
      : Array.isArray(data.results)
        ? data.results
        : Array.isArray(data)
          ? data
          : [];
    return { ok: true, results, raw: data };
  } catch (err) {
    const ax = err as AxiosError;
    const responseData = ax.response?.data as any;
    console.warn(`[ENTANGLED] /conceptos/search ERROR q="${q}" status=${ax.response?.status} body=${JSON.stringify(responseData).slice(0, 300)}`);
    return { ok: false, results: [], error: responseData?.error || ax.message || 'Error buscando conceptos' };
  }
};

export const searchConceptos = async (
  q: string,
  limit = 10,
  proveedorId?: string
): Promise<{ ok: boolean; results?: EntangledConceptoResultV2[]; error?: string }> => {
  if (!ENTANGLED_API_KEY) return { ok: false, error: 'ENTANGLED_API_KEY no configurada.' };
  const trimmed = (q || '').trim();
  if (trimmed.length < 2) return { ok: true, results: [] };

  // 1) Intento directo con la query completa
  const first = await callConceptosSearch(trimmed, limit, proveedorId);
  if (!first.ok) return { ok: false, error: first.error || 'Error buscando conceptos' };
  if (first.results.length > 0) return { ok: true, results: first.results };

  // 2) Si no hay resultados y la query tiene varias palabras, probar con cada palabra
  // (ENTANGLED a veces no hace fuzzy matching sobre frases completas)
  const tokens = trimmed.split(/\s+/).filter(t => t.length >= 3);
  if (tokens.length > 1) {
    const seen = new Set<string>();
    const merged: EntangledConceptoResultV2[] = [];
    for (const token of tokens) {
      const r = await callConceptosSearch(token, limit, proveedorId);
      if (r.ok) {
        for (const item of r.results) {
          if (!seen.has(item.clave_prodserv)) {
            seen.add(item.clave_prodserv);
            merged.push(item);
            if (merged.length >= limit) break;
          }
        }
      }
      if (merged.length >= limit) break;
    }
    return { ok: true, results: merged };
  }

  return { ok: true, results: [] };
};

// ---------------------------------------------------------------------------
// POST /api/v1/asignacion
// Obtiene empresa + cuenta bancaria asignada para un concepto SAT + cliente.
// La asignación es sticky: mismo (rfc, concepto) siempre devuelve la misma empresa.
// ---------------------------------------------------------------------------
export interface EntangledAsignacionPayload {
  servicio: 'pago_con_factura' | 'pago_sin_factura';
  concepto?: string;
  // Datos requeridos por ENTANGLED v1 /asignacion: monto + divisa + tipo de
  // cambio que XPAY le cobra al cliente + % de comisión XPAY → Cliente final.
  monto_destino?: number;
  divisa_destino?: string;
  tc_cliente_final?: number;
  comision_cliente_final_porcentaje?: number;
  cliente_final: {
    rfc?: string;
    razon_social: string;
    regimen_fiscal?: string;
    cp?: string;
    uso_cfdi?: string;
    email?: string;
  };
}

export interface EntangledAsignacionResult {
  ok: boolean;
  asignacion?: string;
  empresa?: { rfc: string; razon_social: string };
  cuenta_bancaria?: {
    banco?: string;
    titular?: string;
    cuenta?: string;
    clabe?: string;
    sucursal?: string;
    moneda?: string;
  };
  facturacion?: {
    clave_solicitada?: string;
    clave_facturacion?: string;
    concepto_facturacion?: string;
    sustitucion?: boolean;
  };
  error?: string;
  upstream_status?: number | undefined;
  raw?: any;
}

export const callAsignacion = async (
  payload: EntangledAsignacionPayload
): Promise<EntangledAsignacionResult> => {
  if (!ENTANGLED_API_KEY) return { ok: false, error: 'ENTANGLED_API_KEY no configurada.' };
  const url = buildUrl('/asignacion');
  // ENTANGLED espera el campo como `divisa`, no `divisa_destino`. Construimos
  // el body normalizado (uppercase + nombre correcto) para evitar 400s tipo
  // "divisa inválida. Permitidas: USD, RMB, MXN.".
  const upstreamBody: any = { ...payload };
  if (payload.divisa_destino) {
    upstreamBody.divisa = String(payload.divisa_destino).toUpperCase();
    delete upstreamBody.divisa_destino;
  }
  // Reintentos en errores transitorios (502/503/504/timeout): 3 intentos con backoff 500ms/1s/2s
  const RETRYABLE_STATUSES = new Set([502, 503, 504]);
  const delays = [500, 1000, 2000];
  let lastError: { error: string; raw?: any; status?: number | undefined } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log(`[ENTANGLED] POST ${url} attempt=${attempt + 1} payload=${JSON.stringify(upstreamBody).slice(0, 300)}`);
      const res = await axios.post(url, upstreamBody, {
        timeout: ENTANGLED_TIMEOUT_MS,
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      });
      const d = res.data || {};
      console.log(`[ENTANGLED] /asignacion ok empresa=${d?.empresa?.rfc || '—'}`);
      return {
        ok: true,
        asignacion: d.asignacion,
        empresa: d.empresa,
        cuenta_bancaria: d.cuenta_bancaria,
        facturacion: d.facturacion,
        raw: d,
      };
    } catch (err) {
      const ax = err as AxiosError;
      const status = ax.response?.status;
      const responseData = ax.response?.data as any;
      const errMsg = responseData?.error || ax.message || 'Error en asignación';
      lastError = { error: errMsg, raw: responseData, status };
      const isTimeout = ax.code === 'ECONNABORTED' || ax.code === 'ETIMEDOUT';
      const retry = attempt < 2 && (isTimeout || (typeof status === 'number' && RETRYABLE_STATUSES.has(status)));
      console.warn(`[ENTANGLED] /asignacion fail attempt=${attempt + 1} status=${status || ax.code} retry=${retry} body=${JSON.stringify(responseData).slice(0, 300)}`);
      if (!retry) break;
      await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
  return {
    ok: false,
    error: lastError?.error || 'Error en asignación',
    upstream_status: lastError?.status,
    raw: lastError?.raw,
  };
};

// ---------------------------------------------------------------------------
// POST /api/admin/cliente-api/rotate
// ---------------------------------------------------------------------------
export const rotateApiKey = async (): Promise<{
  ok: boolean;
  new_api_key?: string;
  rotated_at?: string;
  error?: string;
  raw?: any;
}> => {
  if (!ENTANGLED_API_KEY) return { ok: false, error: 'ENTANGLED_API_KEY no configurada.' };
  try {
    // El endpoint real vive en /api/admin/cliente-api/rotate (no bajo /api/v1).
    const res = await axios.post(
      `${rootBase()}/api/admin/cliente-api/rotate`,
      {},
      {
        timeout: ENTANGLED_TIMEOUT_MS,
        headers: authHeaders(),
      }
    );
    const data = res.data || {};
    return {
      ok: true,
      new_api_key: data.new_api_key || data.api_key,
      rotated_at: data.rotated_at,
      raw: data,
    };
  } catch (err) {
    const ax = err as AxiosError;
    const responseData = ax.response?.data as any;
    return {
      ok: false,
      error: responseData?.error || ax.message || 'Error rotando API key',
      raw: responseData,
    };
  }
};

// ---------------------------------------------------------------------------
// GET /api/v1/proveedores
// ---------------------------------------------------------------------------
export interface EntangledProveedorTarifaRemote {
  servicio_codigo: EntangledServicio;
  servicio_nombre?: string;
  requiere_factura?: boolean;
  comision_cliente_porcentaje: number;
  monto_minimo?: { USD?: number | null; RMB?: number | null } | null;
}

export interface EntangledTipoCambioRemote {
  modo?: string;
  valor_efectivo?: number | null;
  valor_base?: number | null;
  override_monto?: number | null;
  fuente?: string;
  expira_en?: string | null;
  ultima_actualizacion?: string | null;
}

export interface EntangledCostoOperacionPorDivisa {
  porcentaje?: number | null;
  monto_fijo?: number | null;
  updated_at?: string | null;
}

export interface EntangledProveedorRemote {
  id: string; // UUID externo
  nombre: string;
  descripcion?: string | null;
  activo?: boolean;
  total_empresas_activas?: number;
  // Formato nuevo: { USD: { porcentaje, monto_fijo }, RMB: { ... } }
  // Formato legacy: { porcentaje, monto_fijo, moneda }
  costo_operacion?:
    | {
        USD?: EntangledCostoOperacionPorDivisa | null;
        RMB?: EntangledCostoOperacionPorDivisa | null;
        porcentaje?: number | null;
        monto_fijo?: number | null;
        moneda?: string | null;
      }
    | null;
  // Antes era number|null, ahora es objeto. Aceptamos ambos por compat.
  tipos_cambio?: {
    USD?: number | EntangledTipoCambioRemote | null;
    RMB?: number | EntangledTipoCambioRemote | null;
  } | null;
  tarifas: EntangledProveedorTarifaRemote[];
}

export const listProveedoresRemote = async (): Promise<{
  ok: boolean;
  total?: number;
  proveedores?: EntangledProveedorRemote[];
  error?: string;
  raw?: any;
}> => {
  if (!ENTANGLED_API_KEY) return { ok: false, error: 'ENTANGLED_API_KEY no configurada.' };
  try {
    const res = await axios.get(buildUrl('/proveedores'), {
      timeout: ENTANGLED_TIMEOUT_MS,
      headers: authHeaders(),
    });
    const data = res.data || {};
    return {
      ok: true,
      total: data.total ?? (Array.isArray(data.proveedores) ? data.proveedores.length : 0),
      proveedores: Array.isArray(data.proveedores) ? data.proveedores : [],
      raw: data,
    };
  } catch (err) {
    const ax = err as AxiosError;
    const responseData = ax.response?.data as any;
    return {
      ok: false,
      error: responseData?.error || ax.message || 'Error listando proveedores',
      raw: responseData,
    };
  }
};
