// ============================================================================
// ENTANGLED Controller v2 — Modelo de dos servicios (pago_con_factura / sin_factura)
// ============================================================================
// Este módulo coexiste con entangledController.ts (v1) durante la transición.
// Las rutas en index.ts apuntan a este archivo para los endpoints nuevos:
//   - POST /api/entangled/payment-requests          (multipart, crea solicitud)
//   - GET  /api/entangled/exchange-rate             (proxy a /v1/tipo-cambio)
//   - GET  /api/entangled/conceptos/search          (proxy a /v1/conceptos/search)
//   - GET  /api/entangled/service-config            (cliente: ve sus % efectivos)
//   - GET  /api/admin/entangled/service-config      (admin: lee global)
//   - PUT  /api/admin/entangled/service-config      (admin: edita global)
//   - GET  /api/admin/entangled/user-service-pricing
//   - PUT  /api/admin/entangled/user-service-pricing/:userId/:servicio
//   - DELETE /api/admin/entangled/user-service-pricing/:userId/:servicio
//   - POST /api/entangled/webhook/factura-generada  (RAW body, HMAC SHA-256)
//   - POST /api/entangled/webhook/pago-proveedor    (RAW body, HMAC SHA-256)
//   - POST /api/admin/entangled/rotate-api-key
// ============================================================================

import { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from './db';
import { sendXPayConfirmation } from './whatsappService';
import {
  listMySuppliers,
  createMySupplier,
  updateMySupplier,
  deleteMySupplier,
  getMyFiscalProfile,
  upsertMyFiscalProfile,
} from './entangledController';
import {
  sendSolicitudPago,
  uploadComprobanteToTransaccion,
  getTipoCambio,
  getSolicitudStatus,
  getSolicitudDocumento,
  ENTANGLED_DOCUMENTO_TIPOS,
  EntangledDocumentoTipo,
  searchConceptos,
  rotateApiKey,
  isEntangledConfigured,
  ENTANGLED_WEBHOOK_SECRET,
  EntangledServicio,
  EntangledDivisa,
  EntangledSolicitudPayloadV2,
  listProveedoresRemote,
  listComisionesRemote,
  callAsignacion,
  notifyCancelledRequestIds,
  notifyCancellationToEntangled,
} from './entangledServiceV2';
import { generateXpayCommission } from './commissionService';
import { signRowFileUrls } from './entangledController';

const SERVICIOS_VALIDOS: EntangledServicio[] = ['pago_con_factura', 'pago_sin_factura'];

// Constancia de Situación Fiscal (CSF) del cliente final. La guardamos en
// user_saved_documents (document_type='constancia_fiscal'); el bucket es
// privado, así que devolvemos una URL firmada (7 días) que ENTANGLED pueda
// descargar. Devuelve undefined si el cliente no la tiene subida.
async function fetchConstanciaUrl(userId: number | null | undefined): Promise<string | undefined> {
  if (!userId) return undefined;
  try {
    const csf = await pool.query(
      `SELECT file_url FROM user_saved_documents
        WHERE user_id = $1 AND document_type = 'constancia_fiscal' LIMIT 1`,
      [userId]
    );
    const csfUrl = csf.rows[0]?.file_url;
    if (!csfUrl) return undefined;
    const { signS3UrlIfNeeded } = await import('./s3Service');
    const signed = await signS3UrlIfNeeded(csfUrl, 7 * 24 * 60 * 60);
    return signed || csfUrl;
  } catch (csfErr) {
    console.warn('[ENTANGLED v2] no se pudo adjuntar constancia:', (csfErr as Error).message);
    return undefined;
  }
}

// Columnas que necesita el correo de "operación solicitada".
export const XPAY_SOLICITADA_EMAIL_SELECT = `
  er.referencia_pago, er.op_monto, er.op_divisa_destino,
  COALESCE(er.monto_mxn_total, er.monto_mxn_base) AS monto_mxn, er.servicio,
  er.comision_cliente_final_porcentaje, er.tc_cliente_final,
  er.cf_razon_social, er.cf_rfc,
  er.op_beneficiario_nombre, er.sup_nombre_beneficiario, er.sup_nombre_chino,
  er.sup_banco_nombre, er.sup_numero_cuenta, er.sup_swift_bic, er.sup_iban,
  er.sup_aba_routing, er.sup_banco_intermediario_nombre, er.sup_banco_intermediario_swift,
  er.sup_banco_direccion, er.sup_direccion,
  er.proveedor_moneda_enviada, er.proveedor_monto_enviado,
  u.full_name AS advisor_name`;

// Construye el correo (SIEMPRE en inglés) con detalles de la operación + datos
// completos de la cuenta de pago + botón al portal de pago.
export const buildXpaySolicitadaEmail = (r0: any): { subject: string; html: string } => {
  const PORTAL_URL = process.env.XPAY_PAYMENT_PORTAL_URL || 'https://wireusd.tcmanual.mx/loginchino';
  const ref = r0.referencia_pago || '—';
  const usd = Number(r0.op_monto || 0);
  const mxn = Number(r0.monto_mxn || 0);
  const divisa = r0.op_divisa_destino || 'USD';
  const row = (label: string, val: any) => (val != null && String(val).trim() !== '')
    ? `<tr><td style="padding:5px 0;color:#666;vertical-align:top">${label}</td><td style="padding:5px 0;text-align:right;font-weight:600;word-break:break-word">${val}</td></tr>` : '';
  const money = (n: number, cur: string) => `${cur === 'USD' || cur === 'MXN' ? '$' : ''}${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const subject = `X-Pay · Payment request submitted · ${ref}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#C1272D,#F05A28);color:#fff;padding:18px 20px;border-radius:10px 10px 0 0">
        <h2 style="margin:0;font-size:18px">💱 New X-Pay payment request</h2>
      </div>
      <div style="border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;padding:20px">
        <p style="margin:0 0 14px;color:#333">A payment operation is now <b>pending</b>. Please process the supplier payment.</p>

        <div style="font-size:12px;font-weight:700;color:#C1272D;text-transform:uppercase;letter-spacing:.5px;margin:0 0 4px">Operation details</div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">
          ${row('Reference', `<span style="font-weight:700">${ref}</span>`)}
          ${row(`Amount (${divisa})`, money(usd, divisa))}
          ${mxn > 0 ? row('Amount MXN', money(mxn, 'MXN')) : ''}
        </table>

        <div style="font-size:12px;font-weight:700;color:#C1272D;text-transform:uppercase;letter-spacing:.5px;margin:0 0 4px">Payment account (beneficiary)</div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px">
          ${row('Beneficiary', r0.sup_nombre_beneficiario || r0.op_beneficiario_nombre)}
          ${row('Beneficiary (CN)', r0.sup_nombre_chino)}
          ${row('Bank', r0.sup_banco_nombre)}
          ${row('Account number', r0.sup_numero_cuenta)}
          ${row('IBAN', r0.sup_iban)}
          ${row('SWIFT / BIC', r0.sup_swift_bic)}
          ${row('ABA / Routing', r0.sup_aba_routing)}
          ${row('Intermediary bank', r0.sup_banco_intermediario_nombre)}
          ${row('Intermediary SWIFT', r0.sup_banco_intermediario_swift)}
          ${row('Bank address', r0.sup_banco_direccion)}
          ${row('Beneficiary address', r0.sup_direccion)}
          ${r0.proveedor_monto_enviado ? row('Amount to send', money(Number(r0.proveedor_monto_enviado), r0.proveedor_moneda_enviada || '')) : ''}
        </table>

        <div style="text-align:center;margin:22px 0 6px">
          <a href="${PORTAL_URL}" style="display:inline-block;background:linear-gradient(135deg,#C1272D,#F05A28);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:10px">Process payment →</a>
        </div>
        <p style="margin:12px 0 0;color:#999;font-size:12px;text-align:center">Or check the X-Pay panel to follow up on the supplier payment.</p>
      </div>
    </div>`;
  return { subject, html };
};


const getAuthUserId = (req: Request): number | null => {
  const u = (req as any).user;
  const id = Number(u?.userId ?? u?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const isAdminRole = (req: Request): boolean => {
  const role = String((req as any).user?.role || '').toLowerCase();
  return ['super_admin', 'admin', 'director'].includes(role);
};

/**
 * Quien puede tocar el PORCENTAJE POR CLIENTE de XPAY.
 *
 * Además de dirección, pasa quien tenga el panel `cs_cartera` —donde vive la
 * pantalla de Porcentaje XPAY—: hoy Ricardo Méndez y Yliana. Se amarra al
 * permiso y no al rol para no dárselo de paso a la cuenta compartida de
 * Servicio a Cliente. Angel escala estas peticiones a Ricardo (tarea 356).
 *
 * La ruta ya lo valida; esto es la segunda cerradura, que estaba fija a rol y
 * habría rebotado a Ricardo aunque el middleware lo dejara pasar.
 */
const puedeEditarPrecioXpay = async (req: Request): Promise<boolean> => {
  if (isAdminRole(req)) return true;
  const uid = getAuthUserId(req);
  if (!uid) return false;
  try {
    const r = await pool.query(
      `SELECT 1 FROM user_panel_permissions
        WHERE user_id = $1 AND panel_key = 'cs_cartera' AND can_view = TRUE LIMIT 1`,
      [uid]
    );
    return r.rows.length > 0;
  } catch { return false; }
};

// ---------------------------------------------------------------------------
// Horas de congelamiento (ventana de TC de NUESTRO lado). Si vence antes que la
// de ENTANGLED, cancelamos la orden localmente. Configurable por super_admin.
// Default 24h. Se lee de entangled_service_config.congelamiento_horas.
// ---------------------------------------------------------------------------
const DEFAULT_CONGELAMIENTO_HORAS = 24;

// Traduce los códigos de error que devuelve ENTANGLED a un mensaje claro en
// español para el usuario final. Si no hay match, regresa el texto original.
// País del banco destino, en el orden en que se puede confiar:
//   1. el que declaró el usuario (selector "País de Destino" o el del beneficiario)
//   2. el código de país del SWIFT — posiciones 5 y 6, es estándar ISO
//   3. la divisa, solo como último recurso
// NUNCA se asume "Estados Unidos" por ser USD: se paga en dólares a China,
// Hong Kong y muchos otros, y ese país define el ruteo y el carril en ENTANGLED.
const PAIS_POR_SWIFT: Record<string, string> = {
  CN: 'China', HK: 'Hong Kong', US: 'Estados Unidos', MX: 'México',
  GB: 'Reino Unido', SG: 'Singapur', JP: 'Japón', KR: 'Corea del Sur',
  DE: 'Alemania', ES: 'España', IT: 'Italia', TR: 'Turquía',
  IN: 'India', VN: 'Vietnam', TW: 'Taiwán', TH: 'Tailandia', ID: 'Indonesia',
};
export const resolverPaisDestino = (
  o: { declarado?: any; swift?: any; divisa?: any }
): string => {
  const declarado = String(o.declarado || '').trim();
  if (declarado) return declarado;
  // El SWIFT guardado a veces trae espacios (' CHASHKHH'), por eso el trim.
  const swift = String(o.swift || '').trim().toUpperCase();
  const cc = swift.length >= 6 ? swift.slice(4, 6) : '';
  if (PAIS_POR_SWIFT[cc]) {
    console.warn(`[XPAY] país destino no declarado; deducido del SWIFT ${swift} → ${PAIS_POR_SWIFT[cc]}`);
    return PAIS_POR_SWIFT[cc] as string;
  }
  const divisa = String(o.divisa || '').toUpperCase();
  const porDivisa = divisa === 'RMB' ? 'China' : divisa === 'MXN' ? 'México' : 'Estados Unidos';
  console.warn(`[XPAY] país destino no declarado y SWIFT sin país ("${swift}"); derivado de la divisa ${divisa} → ${porDivisa}. Puede rutear mal.`);
  return porDivisa;
};

// Mensaje neutro de cara al cliente/asesor cuando no hay un motivo traducible.
// Redactado por Aldo: sin nombrar al proveedor ni conceptos internos.
const MENSAJE_GENERICO_XPAY =
  'La comercializadora no está disponible en este momento, habla con tu asesor.';

function friendlyEntangledError(code?: string | null, respuesta?: any, ctx?: { swift?: any; paisDeclarado?: any; divisa?: any }): string {
  const raw = String(code || '').trim();
  if (!raw) return '';
  const key = raw.toLowerCase().replace(/\s+/g, '_');
  // El RFC capturado no es el de la constancia. Es un dato que el asesor SÍ
  // puede corregir, así que se le dicen los dos RFC en vez del genérico: con
  // "la comercializadora no está disponible" el 27-ago un asesor reintentó
  // tres veces la misma solicitud de 18,950 USD creyendo que era una caída,
  // cuando al RFC guardado le faltaba un dígito.
  if (key === 'rfc_no_coincide_constancia') {
    const recibido = String(respuesta?.rfc_recibido || '').trim();
    const constancia = String(respuesta?.rfc_constancia || '').trim();
    return recibido && constancia
      ? `El RFC registrado (${recibido}) no coincide con el de la constancia de situación fiscal del cliente (${constancia}). Corrige el RFC en los datos fiscales y vuelve a enviar la solicitud.`
      : 'El RFC registrado no coincide con la constancia de situación fiscal del cliente. Corrige el RFC en los datos fiscales y vuelve a enviar la solicitud.';
  }
  const MAP: Record<string, string> = {
    sin_disponibilidad:
      'El proveedor de facturación no tiene disponibilidad para este monto/concepto en este momento. Intenta más tarde o con otro concepto.',
    proveedor_tc_vencido:
      'El proveedor no tiene un tipo de cambio vigente. Intenta de nuevo en unos minutos.',
    sin_cuenta_activa:
      'No hay un proveedor con cuenta bancaria activa para esta operación en este momento.',
    proveedor_sin_cuenta:
      'No hay un proveedor con cuenta bancaria activa para esta operación en este momento.',
    orden_vencida: 'La orden venció. Genera una nueva solicitud.',
    orden_cancelada: 'La orden fue cancelada.',
    // Textos de cara al cliente/asesor redactados por Aldo. El detalle técnico
    // (que falta `pais_destino`, que no hay tarifa de operación en RMB) se
    // queda en el log y en error_code.
    destino_pais_faltante: 'Falta país destino, habla con tu asesor.',
    // Este codigo significa DESTINO NO HABILITADO, no un problema de divisa.
    //
    // El texto anterior decia "No hay TC-RMB disponible, prueba con USD" y era
    // doblemente falso: la solicitud 235 iba en USD por 1,000 y a Taiwan. Jesus
    // Campos giro en circulos siguiendo un consejo que ya estaba aplicando
    // (tarea 488, TKT-2026-2555).
    //
    // El monto no tiene nada que ver —hay operaciones de 1,000 USD completadas—
    // ni la divisa: ese mismo dia paso una de 28,000 USD. Lo unico distinto era
    // el pais: primera vez que se mandaba a Taiwan, y esa ruta no esta dada de
    // alta. El mensaje real se arma abajo con el pais y que hacer.
    costo_operacion_no_configurado: '',
  };
  // Destino no habilitado: se nombra el PAIS y se dice el siguiente paso, en vez
  // de dejar al asesor reintentando algo que nunca va a pasar.
  if (key === 'costo_operacion_no_configurado') {
    const pais = resolverPaisDestino({
      declarado: ctx?.paisDeclarado, swift: ctx?.swift, divisa: ctx?.divisa,
    });
    return `XPAY todavía no está habilitado para enviar a ${pais}. ` +
      `No es un problema del monto ni de la divisa: esa ruta aún no está dada de alta. ` +
      `Levanta un ticket solicitando el alta de ${pais} y te avisamos en cuanto quede.`;
  }
  if (MAP[key]) return MAP[key];
  // ⚠️ NUNCA devolver el texto crudo del proveedor: son mensajes escritos para
  // desarrolladores y mencionan detalles internos. Ej. real que le llegaba al
  // asesor: "Falta el país del banco destino. Mándalo en `pais_destino` (o un
  // SWIFT del que se pueda sacar). Sin ese dato no se puede saber a qué
  // proveedor le toca la operación." El crudo se queda en el log.
  console.warn(`[XPAY] error del proveedor sin traducir (se muestra el genérico): ${raw}`);
  return MENSAJE_GENERICO_XPAY;
}

/**
 * Horas EXTRA después del vencimiento en las que todavía se recibe el
 * comprobante. La orden ya se ve cancelada; esto solo evita perder el pago de
 * quien depositó tarde. 24 de congelamiento + 12 de gracia = 36.
 */
async function getGraciaHoras(): Promise<number> {
  try {
    await pool.query(
      `ALTER TABLE entangled_service_config ADD COLUMN IF NOT EXISTS gracia_horas INTEGER DEFAULT 12`
    ).catch(() => {});
    const r = await pool.query(`SELECT gracia_horas FROM entangled_service_config WHERE id = 1`);
    const h = Number(r.rows[0]?.gracia_horas);
    return Number.isFinite(h) && h >= 0 ? h : 12;
  } catch { return 12; }
}

async function getCongelamientoHoras(): Promise<number> {
  try {
    const r = await pool.query(
      `SELECT congelamiento_horas FROM entangled_service_config WHERE id = 1`
    );
    const h = Number(r.rows[0]?.congelamiento_horas);
    return Number.isFinite(h) && h > 0 ? h : DEFAULT_CONGELAMIENTO_HORAS;
  } catch {
    return DEFAULT_CONGELAMIENTO_HORAS;
  }
}

// Resuelve la comisión que XPAY le cobra al cliente final para un servicio.
// Override por usuario tiene precedencia sobre la configuración global.
// ---------------------------------------------------------------------------
async function resolveClientFinalCommission(
  userId: number,
  servicio: EntangledServicio
): Promise<{ porcentaje: number; es_override: boolean; global: number }> {
  const cfg = await pool.query(
    `SELECT comision_pago_con_factura, comision_pago_sin_factura
       FROM entangled_service_config WHERE id = 1`
  );
  const row = cfg.rows[0] || { comision_pago_con_factura: 6, comision_pago_sin_factura: 4 };
  const global =
    servicio === 'pago_con_factura'
      ? Number(row.comision_pago_con_factura)
      : Number(row.comision_pago_sin_factura);

  const ov = await pool.query(
    `SELECT comision_porcentaje FROM entangled_user_service_pricing
      WHERE user_id = $1 AND servicio = $2 LIMIT 1`,
    [userId, servicio]
  );
  if (ov.rows.length > 0 && ov.rows[0].comision_porcentaje != null) {
    return {
      porcentaje: Number(ov.rows[0].comision_porcentaje),
      es_override: true,
      global,
    };
  }
  return { porcentaje: global, es_override: false, global };
}

// ===========================================================================
// POST /api/entangled/payment-requests   (multipart/form-data)
// ===========================================================================
// Body multipart:
//   - servicio: 'pago_con_factura' | 'pago_sin_factura'
//   - monto_usd: number
//   - divisa: 'USD' | 'RMB'
//   - cliente_final: JSON.stringify({...})
//   - conceptos: JSON.stringify([...])  (sólo si pago_con_factura)
//   - referencia_xpay: string opcional
//   - notas: string opcional
//   - comprobante: archivo (campo único requerido)
// ===========================================================================
export const createPaymentRequestV2 = async (
  req: Request,
  res: Response,
  opts?: { ownerUserId?: number; advisorId?: number }
): Promise<any> => {
  const authUserId = getAuthUserId(req);
  if (!authUserId) return res.status(401).json({ error: 'No autenticado' });
  // Owner de la operación: normalmente el propio usuario autenticado, pero un
  // asesor puede crearla a nombre de un cliente asignado (opts.ownerUserId).
  const userId = opts?.ownerUserId ?? authUserId;

  // Comprobante OPCIONAL: si no se envía, la solicitud queda en estado
  // 'pendiente' a la espera de que el cliente suba su comprobante después.
  // Cuando suba el comprobante (endpoint upload-proof-file), recién entonces
  // se enviará a ENTANGLED.
  const file = (req as any).file as
    | { buffer: Buffer; originalname: string; mimetype: string; size: number }
    | undefined;
  const hasFile = !!(file && file.buffer && file.buffer.length > 0);

  const body = req.body || {};
  const servicio = String(body.servicio || '').trim() as EntangledServicio;
  if (!SERVICIOS_VALIDOS.includes(servicio)) {
    return res
      .status(400)
      .json({ error: 'servicio inválido. Debe ser pago_con_factura o pago_sin_factura' });
  }

  // Subservicio SOLO para pago_sin_factura: 'transfer' (default) | 'efectivo'.
  // Cada modalidad usa una cuenta distinta. pago_con_factura siempre es transfer
  // (no se manda subservicio).
  const subservicio: 'transfer' | 'efectivo' | undefined =
    servicio === 'pago_sin_factura'
      ? (String(body.subservicio || 'transfer').trim() as 'transfer' | 'efectivo')
      : undefined;
  if (subservicio && !['transfer', 'efectivo'].includes(subservicio)) {
    return res.status(400).json({ error: 'subservicio inválido. Debe ser transfer o efectivo' });
  }

  const monto = Number(body.monto_usd ?? body.monto);
  if (!Number.isFinite(monto) || monto <= 0) {
    return res.status(400).json({ error: 'monto_usd debe ser > 0' });
  }
  const divisa = String(body.divisa || 'USD').toUpperCase() as EntangledDivisa;
  if (!['USD', 'RMB', 'MXN'].includes(divisa)) {
    return res.status(400).json({ error: 'divisa debe ser USD, RMB o MXN' });
  }
  // TC que XPAY le cobra al cliente — requerido por ENTANGLED
  const tcClienteFinal = Number(body.tc_cliente_final);
  if (!Number.isFinite(tcClienteFinal) || tcClienteFinal <= 0) {
    return res.status(400).json({ error: 'tc_cliente_final es requerido y debe ser > 0' });
  }

  // Parseo seguro de campos JSON enviados como string en multipart
  const parseJson = (v: any, fallback: any) => {
    if (v == null || v === '') return fallback;
    if (typeof v === 'object') return v;
    try {
      return JSON.parse(String(v));
    } catch {
      return fallback;
    }
  };

  const clienteFinal: any = parseJson(body.cliente_final, {});
  const conceptos: any[] = parseJson(body.conceptos, []);

  // 🧾 Asegurar que cada concepto lleve su DESCRIPCIÓN. El PDF de instrucciones
  // muestra el concepto y no la clave SAT, pero cuando el asesor teclea la
  // clave a mano en vez de elegirla del catálogo, el front la manda sin
  // descripción y el PDF se quedaba con el número. Se completa aquí, una sola
  // vez, contra el historial local y si no contra el catálogo SAT.
  // Nunca bloquea el alta: si no se puede resolver, se sigue sin descripción.
  const completarDescripciones = async () => {
    // Normalizar primero: el front manda las claves como "clave|descripcion" y
    // a veces el pipe se cuela sin separar ("60141001|", "25171500|Limpia...").
    // Así se guardaba y así se le mandaba a ENTANGLED, con la clave malformada.
    conceptos.forEach((c) => {
      const crudo = String(c?.clave_prodserv || '').trim();
      if (!crudo.includes('|')) return;
      const [clave, ...resto] = crudo.split('|');
      c.clave_prodserv = String(clave || '').trim();
      const desc = resto.join('|').trim();
      if (desc && !String(c?.descripcion || '').trim()) c.descripcion = desc;
      console.warn(`[XPAY] clave SAT malformada "${crudo}" → "${c.clave_prodserv}"${desc ? ` (descripción "${desc}")` : ''}`);
    });
    const faltantes = conceptos.filter(
      (c) => String(c?.clave_prodserv || '').trim() && !String(c?.descripcion || '').trim()
    );
    if (faltantes.length === 0) return;
    for (const c of faltantes) {
      const clave = String(c.clave_prodserv).trim();
      try {
        const hist = await pool.query(
          `SELECT descripcion FROM entangled_clave_sat_history
            WHERE clave = $1 AND COALESCE(descripcion, '') <> '' LIMIT 1`,
          [clave]
        );
        const deHistorial = String(hist.rows[0]?.descripcion || '').trim();
        if (deHistorial) { c.descripcion = deHistorial; continue; }
        const cat = await searchConceptos(clave, 1);
        const encontrado = cat.ok
          ? (cat.results || []).find((x: any) => String(x?.clave_prodserv || '').trim() === clave)
          : null;
        const delCatalogo = String((encontrado as any)?.descripcion || '').trim();
        if (delCatalogo) c.descripcion = delCatalogo;
        else console.warn(`[XPAY] sin descripción para la clave SAT ${clave}; el PDF mostrará la clave`);
      } catch (e: any) {
        console.warn(`[XPAY] no se pudo resolver la descripción de ${clave}:`, e?.message);
      }
    }
  };
  // Snapshot de la UI (provider + beneficiario + operation + quote) para
  // poder regenerar el PDF de instrucciones idéntico al original.
  const instructionsSnapshot: any = parseJson(body.instructions_snapshot, null);

  // Log auditable de los datos fiscales recibidos del frontend. XPay/ENTANGLED
  // reportó inconsistencias en el campo uso_cfdi (pantalla G01 pero API G03);
  // este log deja evidencia exacta de lo que la UI envió antes de que lo
  // persistamos, para poder auditar sin depender de reproducciones en vivo.
  if (servicio === 'pago_con_factura') {
    console.warn(
      `[XPAY][V2] cliente_final recibido user=${userId} advisor=${opts?.advisorId ?? '-'} ` +
        `rfc=${clienteFinal?.rfc || '-'} uso_cfdi=${clienteFinal?.uso_cfdi || '-'} ` +
        `regimen_fiscal=${clienteFinal?.regimen_fiscal || '-'} cp=${clienteFinal?.cp || '-'}`
    );
  }

  if (servicio === 'pago_con_factura') {
    const required = ['rfc', 'razon_social', 'regimen_fiscal', 'cp', 'uso_cfdi', 'email'];
    for (const k of required) {
      if (!clienteFinal[k]) {
        return res
          .status(400)
          .json({ error: `cliente_final.${k} es requerido para pago_con_factura` });
      }
    }
    if (!Array.isArray(conceptos) || conceptos.length === 0) {
      return res
        .status(400)
        .json({ error: 'conceptos[] es requerido para pago_con_factura' });
    }
  } else {
    if (!clienteFinal?.razon_social) {
      return res
        .status(400)
        .json({ error: 'cliente_final.razon_social es requerido' });
    }
  }

  // Comisión que XPAY le cobra al cliente
  const commission = await resolveClientFinalCommission(userId, servicio);

  // Desglose de la comisión cobrada al cliente. Modelo de VENTA FIJA:
  //   - Cliente     = commission.porcentaje (lo que XPAY cobra al cliente, p.ej. 5.5%)
  //   - Entangled   = porcentaje_compra / comision_cobrada (costo del proveedor, p.ej. 2.8%)
  //   - Venta fija  = override_porcentaje_compra (la tasa a la que EntregaX "vende", p.ej. 4.5%)
  //   - EntregaX gana = Venta fija − Costo proveedor  (4.5 − 2.8 = 1.7%)
  //   - Asesor gana   = Cliente − Venta fija          (5.5 − 4.5 = 1.0%)
  let proveedorPctEntangled = 0; // porcentaje_compra (API) — lo que cobra ENTANGLED
  let proveedorVentaFija = 0;    // override_porcentaje_compra — % VENTA FIJA de EntregaX
  try {
    const pr = await pool.query(
      `SELECT COALESCE(porcentaje_compra, 0) AS base,
              COALESCE(override_porcentaje_compra, 0) AS override_pct
         FROM entangled_providers
        WHERE is_active = true AND is_default = true
        ORDER BY id ASC LIMIT 1`
    );
    proveedorPctEntangled = Number(pr.rows[0]?.base ?? 0) || 0;
    proveedorVentaFija = Number(pr.rows[0]?.override_pct ?? 0) || 0;
  } catch (e) {
    console.warn('[ENTANGLED v2] No se pudo resolver % de compra del proveedor default:', e);
  }

  // 🎯 Override del asesor: SOLO en modo asesor puede subir el % que XPAY cobra
  //    al cliente, pero NUNCA por debajo de la venta fija (precio fijo asignado).
  const advisorPctRaw = body.comision_cliente_final_porcentaje;
  if (opts?.advisorId && advisorPctRaw != null && String(advisorPctRaw).trim() !== '') {
    const custom = Number(advisorPctRaw);
    if (Number.isFinite(custom) && custom > 0) {
      const minPct = proveedorVentaFija > 0 ? proveedorVentaFija : 0;
      if (custom < minPct - 0.001) {
        return res.status(400).json({
          error: `La comisión al cliente (${custom.toFixed(2)}%) no puede ser menor a la venta fija (${minPct.toFixed(2)}%).`,
        });
      }
      commission.porcentaje = custom;
    }
  }
  const pctClienteIns = Number(commission.porcentaje) || 0;
  // Si no hay venta fija configurada, EntregaX toma todo el margen (asesor 0).
  const ventaFijaIns = proveedorVentaFija > 0 ? proveedorVentaFija : pctClienteIns;
  const pctEntregaxIns = Math.max(0, ventaFijaIns - proveedorPctEntangled);
  const pctAsesorIns = Math.max(0, pctClienteIns - ventaFijaIns);

  // Asesor: si la operación la crea un asesor a nombre del cliente, se usa ese
  // asesor; si no, se resuelve del asesor asignado del cliente (informativo).
  let advisorId: number | null = opts?.advisorId ?? null;
  if (!advisorId) {
    try {
      // La columna en `users` es advisor_id. Antes se consultaba
      // assigned_advisor_id —que existe en prospects/crm_requests, NO en
      // users—, así que la query fallaba SIEMPRE y el catch vacío dejaba la
      // operación sin asesor: 26 de 64 quedaron huérfanas y sin comisión
      // (TKT-2026-2205 / XP940241). Solo se salvaban las que crea un asesor,
      // porque ahí el id viene en opts.
      const r = await pool.query(
        `SELECT advisor_id FROM users WHERE id = $1`,
        [userId]
      );
      advisorId = r.rows[0]?.advisor_id || null;
    } catch (e) {
      console.error('[ENTANGLED v2] no se pudo resolver el asesor del cliente', userId, (e as Error).message);
    }
  }
  if (!advisorId) {
    console.warn(`[ENTANGLED v2] operación creada SIN asesor para user=${userId}: no habrá comisión hasta asignarlo`);
  }

  // 💰 Total EXACTO cobrado al cliente final, en MXN.
  //
  // ENTANGLED no lo recibía: la solicitud llegaba solo con monto, tc y % de
  // comisión, y ellos reconstruían el total. Esa reconstrucción no incluye el
  // costo de operación, así que cuando lo hay el número no cuadra con la
  // factura del proveedor y la factura queda sin asignar (se liga a mano).
  //
  // El número autoritativo es el que la UI le mostró y cobró al cliente
  // (quote.monto_mxn_total del snapshot, que web y móvil ya mandan). Si por
  // alguna razón no viene, lo reconstruimos con la misma fórmula base + comisión.
  const quoteSnap: any = instructionsSnapshot?.quote || null;
  const totalDeSnapshot = Number(quoteSnap?.monto_mxn_total);
  const baseMxn = Number((monto * tcClienteFinal).toFixed(2));
  const totalMxnFactura = Number.isFinite(totalDeSnapshot) && totalDeSnapshot > 0
    ? Number(totalDeSnapshot.toFixed(2))
    : Number((baseMxn * (1 + commission.porcentaje / 100)).toFixed(2));
  if (!(Number.isFinite(totalDeSnapshot) && totalDeSnapshot > 0)) {
    console.warn(`[XPAY][V2] sin quote.monto_mxn_total en el snapshot; total reconstruido = ${totalMxnFactura} (base ${baseMxn} + ${commission.porcentaje}%)`);
  }

  // 🔎 Guarda de consistencia: el % que vamos a registrar y a mandar a ENTANGLED
  // debe corresponder al total que le cobramos al cliente. Si no cuadra, algo
  // quedó desincronizado (p. ej. el front cobró un % de asesor que no nos mandó)
  // y ENTANGLED reconstruiría un importe distinto. Se registra para poder
  // auditarlo; no se bloquea la operación.
  const pctCobradoUI = Number(quoteSnap?.porcentaje_compra);
  if (Number.isFinite(pctCobradoUI) && Math.abs(pctCobradoUI - commission.porcentaje) > 0.001) {
    console.error(
      `🚨 [XPAY][V2] comisión inconsistente user=${userId} advisor=${opts?.advisorId ?? '-'}: ` +
      `la UI cobró ${pctCobradoUI}% pero se registrará ${commission.porcentaje}%. ` +
      `Total cobrado ${totalMxnFactura} sobre base ${baseMxn}. ` +
      `La comisión del asesor se calculará con el % registrado.`
    );
  }

  if (servicio === 'pago_con_factura') await completarDescripciones();

  // 1) Persistencia local (estado pendiente, sin transaccion_id aún)
  const referenciaPago = `XP${String(Math.floor(100000 + Math.random() * 900000)).padStart(6, '0')}`;
  let requestId: number;
  try {
    // Migración idempotente: columnas adicionales (tc + snapshot UI
    // + nombre del beneficiario para mostrar en "Últimos envíos")
    await pool.query(
      `ALTER TABLE entangled_payment_requests
         ADD COLUMN IF NOT EXISTS tc_cliente_final NUMERIC(14,6),
         ADD COLUMN IF NOT EXISTS instructions_snapshot JSONB,
         ADD COLUMN IF NOT EXISTS op_beneficiario_nombre VARCHAR(200),
         ADD COLUMN IF NOT EXISTS payment_deadline_at TIMESTAMPTZ,
         ADD COLUMN IF NOT EXISTS subservicio VARCHAR(20),
         ADD COLUMN IF NOT EXISTS es_hibrida BOOLEAN,
         ADD COLUMN IF NOT EXISTS es_pesos BOOLEAN`
    ).catch(() => {});
    // Nombre del beneficiario (proveedor final al que se le envía
    // el dinero) — se persiste para mostrarlo en Últimos envíos.
    // Mobile lo manda como FormData; web también puede pasarlo en
    // body.beneficiario_nombre. Si no llega, queda NULL.
    const beneficiarioNombre = body.beneficiario_nombre
      ? String(body.beneficiario_nombre).trim().slice(0, 200)
      : null;

    const ins = await pool.query(
      `INSERT INTO entangled_payment_requests (
         user_id, advisor_id,
         servicio, requiere_factura,
         referencia_pago,
         cf_rfc, cf_razon_social, cf_regimen_fiscal, cf_cp, cf_uso_cfdi, cf_email,
         op_monto, op_divisa_destino, op_conceptos,
         comision_cliente_final_porcentaje, tc_cliente_final,
         comision_cobrada_porcentaje, comision_entregax, comision_asesor,
         instructions_snapshot,
         op_beneficiario_nombre,
         monto_mxn_base, monto_mxn_total,
         estatus_global, estatus_factura, estatus_proveedor
       ) VALUES (
         $1, $2,
         $3, $4,
         $5,
         $6, $7, $8, $9, $10, $11,
         $12, $13, $14::jsonb,
         $15, $16,
         $20, $21, $22,
         $17::jsonb,
         $18,
         $23, $24,
         'pendiente', $19, 'pendiente'
       ) RETURNING id`,
      [
        userId,
        advisorId,
        servicio,
        servicio === 'pago_con_factura',
        referenciaPago,
        servicio === 'pago_con_factura' ? String(clienteFinal.rfc || '').toUpperCase() : null,
        clienteFinal?.razon_social || null,
        servicio === 'pago_con_factura' ? clienteFinal.regimen_fiscal : null,
        servicio === 'pago_con_factura' ? String(clienteFinal.cp || '') : null,
        servicio === 'pago_con_factura' ? clienteFinal.uso_cfdi : null,
        servicio === 'pago_con_factura' ? clienteFinal.email : null,
        monto,
        divisa,
        JSON.stringify(servicio === 'pago_con_factura' ? conceptos : []),
        commission.porcentaje,
        tcClienteFinal,
        instructionsSnapshot ? JSON.stringify(instructionsSnapshot) : null,
        beneficiarioNombre,
        servicio === 'pago_con_factura' ? 'pendiente' : 'no_aplica',
        proveedorPctEntangled,
        pctEntregaxIns,
        pctAsesorIns,
        baseMxn,
        totalMxnFactura,
      ]
    );
    requestId = ins.rows[0].id;
    if (servicio === 'pago_con_factura') {
      console.warn(
        `[XPAY][V2] request ${requestId} persistido ref=${referenciaPago} ` +
          `cf_uso_cfdi=${clienteFinal.uso_cfdi} cf_rfc=${String(clienteFinal.rfc || '').toUpperCase()}`
      );
    }
    // Guardar el subservicio (transfer/efectivo) elegido para pago_sin_factura.
    if (subservicio) {
      await pool.query(`UPDATE entangled_payment_requests SET subservicio = $1 WHERE id = $2`, [subservicio, requestId]).catch(() => {});
    }
    // Guardar histórico de claves SAT del usuario (autocomplete)
    if (servicio === 'pago_con_factura' && Array.isArray(conceptos)) {
      for (const c of conceptos) {
        const clave = String(c?.clave_prodserv || '').trim();
        if (!clave) continue;
        const desc = c?.descripcion ? String(c.descripcion).trim() : null;
        try {
          await pool.query(
            `INSERT INTO entangled_clave_sat_history (user_id, clave, descripcion, uses_count, last_used_at)
             VALUES ($1, $2, $3, 1, NOW())
             ON CONFLICT (user_id, clave) DO UPDATE
               SET uses_count = entangled_clave_sat_history.uses_count + 1,
                   last_used_at = NOW(),
                   descripcion = COALESCE(EXCLUDED.descripcion, entangled_clave_sat_history.descripcion)`,
            [userId, clave, desc]
          );
        } catch (histErr) {
          console.warn('[ENTANGLED v2] historial clave SAT:', histErr);
        }
      }
    }
  } catch (err) {
    console.error('[ENTANGLED v2] Error creando registro local:', err);
    return res.status(500).json({ error: 'No se pudo crear la solicitud local' });
  }

  const benefSnap = instructionsSnapshot?.beneficiarioSnapshot || null;
  const benefNombre = String(body.beneficiario_nombre || '').trim();
  // 🌎 País destino. ENTANGLED lo usa para rutear la operación y para
  //    clasificarla (el carril prioritario China = "híbrida"), así que mandar
  //    uno equivocado cambia el tratamiento de la operación.
  //    Antes se derivaba de la divisa y CUALQUIER pago en USD salía como
  //    "Estados Unidos", aunque fuera a un banco de China.
  const paisDestino = resolverPaisDestino({
    declarado: (benefSnap as any)?.pais,
    swift: (benefSnap as any)?.swift,
    divisa,
  });

  // 2) Construir payload para ENTANGLED v2 (siempre se envía sin comprobante
  //    primero, para obtener empresas_asignadas + transaccion_id sincrónicamente).
  const payload: EntangledSolicitudPayloadV2 = {
    servicio,
    comision_cliente_final_porcentaje: commission.porcentaje,
    tc_cliente_final: tcClienteFinal,
    monto_usd: monto,
    divisa,
    cliente_final:
      servicio === 'pago_con_factura'
        ? {
            razon_social: clienteFinal.razon_social,
            rfc: String(clienteFinal.rfc || '').toUpperCase(),
            email: clienteFinal.email,
            regimen_fiscal: clienteFinal.regimen_fiscal,
            cp: String(clienteFinal.cp || ''),
            uso_cfdi: clienteFinal.uso_cfdi,
          }
        : { razon_social: clienteFinal.razon_social },
    // País del banco destino, en la raíz: es el campo que ENTANGLED usa para
    // rutear y clasificar. Antes solo iba dentro de notas.proveedor_envio.
    pais_destino: paisDestino,
    referencia_xpay: referenciaPago,
    // Total exacto cobrado al cliente final: es el mismo con el que ENTANGLED
    // emite su factura. Sin este campo ellos lo reconstruían de monto/tc/% y
    // el número no siempre cuadraba, dejando la factura sin asignar.
    total_mxn_factura: totalMxnFactura,
  };
  if (servicio === 'pago_con_factura') {
    payload.conceptos = conceptos as any[];
    // Adjuntar la Constancia de Situación Fiscal (CSF) del cliente final DENTRO
    // de cliente_final (ENTANGLED la lee ahí, no en el nivel raíz). URL firmada;
    // si el cliente no la tiene subida, se omite (la factura queda pendiente).
    const constanciaUrl = await fetchConstanciaUrl(userId);
    if (constanciaUrl) {
      payload.cliente_final.constancia_url = constanciaUrl;
      payload.constancia_url = constanciaUrl; // compat: también en raíz
    }
  }
  if (servicio === 'pago_sin_factura' && subservicio) {
    payload.subservicio = subservicio;
  }
  // 🏦 Beneficiario final (proveedor al que ENTANGLED le envía el dinero).
  // ENTANGLED necesita su cuenta bancaria; la recibe en notas.proveedor_envio.
  // Antes solo se mandaba en el path legacy (reupload), por eso ENTANGLED se
  // quedaba sin la cuenta del proveedor en el flujo nuevo.
  if (benefSnap || benefNombre) {
    const notasObj: any = {
      proveedor_envio: {
        pais: paisDestino,
        // 🏦 Moneda del banco destino: define el carril en ENTANGLED.
        //    "MXN" → carril Pesos MX (sin TC). "USD"/"RMB" → extranjero.
        moneda: String(divisa).toUpperCase(),
        nombre_beneficiario: benefSnap?.nombre || benefNombre || '',
        nombre_chino: benefSnap?.nombre_chino || '',
        numero_cuenta: benefSnap?.cuenta || '',
        iban: benefSnap?.iban || '',
        banco_nombre: benefSnap?.banco || '',
        banco_direccion: benefSnap?.banco_direccion || '',
        swift_bic: benefSnap?.swift || '',
        aba_routing: benefSnap?.aba || '',
        direccion_beneficiario: benefSnap?.direccion || '',
      },
    };
    if (body.notas) notasObj.nota_cliente = String(body.notas);
    payload.notas = JSON.stringify(notasObj);
    // Persistir los datos del beneficiario para nuestros registros/UI.
    if (benefSnap) {
      await pool.query(
        `UPDATE entangled_payment_requests SET
           sup_nombre_beneficiario = $1, sup_nombre_chino = $2, sup_numero_cuenta = $3,
           sup_iban = $4, sup_banco_nombre = $5, sup_banco_direccion = $6,
           sup_swift_bic = $7, sup_aba_routing = $8, sup_direccion = $9
         WHERE id = $10`,
        [
          benefSnap.nombre || benefNombre || null, benefSnap.nombre_chino || null,
          benefSnap.cuenta || null, benefSnap.iban || null, benefSnap.banco || null,
          benefSnap.banco_direccion || null, benefSnap.swift || null, benefSnap.aba || null,
          benefSnap.direccion || null, requestId,
        ]
      ).catch(() => {});
    }
  } else if (body.notas) {
    payload.notas = String(body.notas);
  }

  // ✅ Validación PRE-ENVÍO de los datos bancarios del beneficiario. ENTANGLED
  //    guarda estos campos en columnas cortas (BIC / varchar(20)) y, si algo se
  //    excede, responde con un error genérico ("value too long...") SIN decir cuál
  //    campo. Lo detectamos aquí y le decimos al usuario EXACTAMENTE qué corregir
  //    (además, al cortar antes de la llamada externa, la respuesta es JSON rápido
  //    y el móvil ya no ve el críptico "JSON Parse error" por timeout del gateway).
  if (benefSnap) {
    const bankChecks: Array<{ val: any; label: string; max: number }> = [
      { val: benefSnap.swift,     label: 'SWIFT/BIC',         max: 11 },
      { val: benefSnap.aba,       label: 'ABA/Routing',       max: 20 },
      { val: benefSnap.cuenta,    label: 'número de cuenta',  max: 20 },
      { val: benefSnap.iban,      label: 'IBAN',              max: 20 },
    ];
    for (const c of bankChecks) {
      const s = String(c.val ?? '').trim();
      if (s.length > c.max) {
        await pool.query(
          `UPDATE entangled_payment_requests
              SET estatus_global = 'error_envio', error_message = $1, updated_at = NOW()
            WHERE id = $2`,
          [`${c.label} inválido (${s.length} caracteres, máx ${c.max})`, requestId]
        ).catch(() => {});
        return res.status(400).json({
          error: `El ${c.label} del beneficiario no es válido: tiene ${s.length} caracteres (máximo ${c.max}). ` +
                 `Corrígelo y vuelve a enviar. Valor capturado: "${s.slice(0, 40)}${s.length > 40 ? '…' : ''}"`,
          campo: c.label,
          request_id: requestId,
        });
      }
    }
  }

  if (!isEntangledConfigured()) {
    await pool.query(
      `UPDATE entangled_payment_requests
          SET estatus_global = 'error_envio',
              error_message = $1,
              updated_at = NOW()
        WHERE id = $2`,
      ['ENTANGLED_API_KEY no configurada', requestId]
    );
    return res.status(202).json({
      message:
        'Solicitud guardada localmente. El servicio de pagos no está configurado todavía; será procesada manualmente.',
      request_id: requestId,
      referencia_pago: referenciaPago,
      status: 'error_envio',
    });
  }

  // NUEVO CONTRATO (Puerta 2): la orden se CREA en ENTANGLED al "Enviar
  // solicitud", con o sin comprobante. Si llega el archivo, lo subimos a S3 y
  // lo mandamos como `comprobante_cliente_url`; si no, la orden nace
  // 'pendiente' con vencimiento y el comprobante se adjunta después.
  let comprobanteUrl: string | null = null;
  if (hasFile) {
    // Subimos el archivo a NUESTRO S3 primero para obtener una URL pública que
    // podamos mandarle a ENTANGLED en `comprobante_cliente_url`.
    try {
      const ext = (file!.originalname?.split('.').pop() || 'pdf').toLowerCase();
      const key = `entangled/comprobantes/${requestId}_${Date.now()}.${ext}`;
      const { uploadToS3, isS3Configured, getSignedUrlForKey } = await import('./s3Service');
      if (isS3Configured()) {
        // El bucket es privado; guardamos la URL pública en DB pero a ENTANGLED
        // le damos una URL firmada con 7 días de validez.
        const publicUrl = await uploadToS3(file!.buffer, key, file!.mimetype);
        const signedUrl = await getSignedUrlForKey(key, 7 * 24 * 60 * 60);
        await pool.query(
          `UPDATE entangled_payment_requests
              SET op_comprobante_cliente_url = $1, comprobante_subido_at = NOW(), updated_at = NOW()
            WHERE id = $2`,
          [publicUrl, requestId]
        );
        comprobanteUrl = signedUrl;
        payload.comprobante_cliente_url = signedUrl;
      } else {
        comprobanteUrl = `data:${file!.mimetype};base64,${file!.buffer.toString('base64')}`;
        await pool.query(
          `UPDATE entangled_payment_requests
              SET op_comprobante_cliente_url = $1, comprobante_subido_at = NOW(), updated_at = NOW()
            WHERE id = $2`,
          [comprobanteUrl, requestId]
        );
        payload.comprobante_cliente_url = comprobanteUrl;
      }
    } catch (e) {
      console.error('[ENTANGLED v2] Error subiendo comprobante a S3:', e);
      // Seguimos intentando ENTANGLED; si su contrato exige URL fallará abajo.
    }
  }

  // POST /solicitud-pago — JSON con el payload + comprobante_cliente_url.
  // ENTANGLED responde sincrónicamente con transaccion_id +
  // empresas_asignadas[].cuenta_bancaria (cuentas dinámicas por SAT).
  const remote = await sendSolicitudPago(payload, null);

  if (!remote.ok || !remote.transaccion_id) {
    await pool.query(
      `UPDATE entangled_payment_requests
          SET estatus_global = 'error_envio',
              error_message = $1,
              raw_response = $2::jsonb,
              updated_at = NOW()
        WHERE id = $3`,
      [remote.error || 'Sin transaccion_id', JSON.stringify(remote.raw || {}), requestId]
    );
    // 409 de ENTANGLED = proveedor sin cuenta / TC vencido / sin disponibilidad
    // → propagar el código y traducir el mensaje a algo claro para el usuario.
    const httpStatus = remote.status === 409 ? 409 : 502;
    // 🐞 Bug conocido de ENTANGLED en el carril "efectivo": devuelve un error de
    // BD ("value too long for type character varying(10)"). Mensaje claro.
    const isEfectivoBug = subservicio === 'efectivo' && /character varying\(10\)|value too long/i.test(String(remote.error || ''));
    return res.status(httpStatus).json({
      error: isEfectivoBug
        ? 'La modalidad Efectivo aún no está disponible en el proveedor de pagos (error del proveedor). Por favor usa Transferencia bancaria por ahora.'
        // El país va en el contexto: es la ruta donde reventó lo de Taiwán y
        // donde el asesor necesita leer QUÉ destino no está habilitado.
        : (friendlyEntangledError(remote.error, remote.raw, { paisDeclarado: paisDestino, divisa })
           || 'No se devolvió un transaccion_id.'),
      error_code: remote.error || null,
      request_id: requestId,
      referencia_pago: referenciaPago,
    });
  }

  // Estado tras crear la orden en ENTANGLED:
  //  - con comprobante y EFECTIVO → completado (el pago en efectivo se da por
  //    recibido al llegar el comprobante; no espera factura ni conciliación).
  //  - con comprobante (transfer) → en_proceso (espera confirmación del proveedor).
  //  - sin comprobante → esperando_comprobante (la orden ya existe en remoto).
  const estatusTrasFase1 = hasFile
    ? (subservicio === 'efectivo' ? 'completado' : 'en_proceso')
    : 'esperando_comprobante';

  // La cuenta puede venir en empresas_asignadas[] o directa en cuenta_deposito
  // (Puerta 2). Normalizamos a empresas_asignadas para UI/WhatsApp existentes.
  let empresasFinales = remote.empresas_asignadas || [];
  if (empresasFinales.length === 0 && remote.cuenta_deposito) {
    empresasFinales = [{ cuenta_bancaria: remote.cuenta_deposito } as any];
  }
  // Si el API no retornó cuenta bancaria, rechazar — no procesar sin destino real
  if (empresasFinales.length === 0) {
    await pool.query(
      `UPDATE entangled_payment_requests SET estatus_global='error_envio', error_message=$1, updated_at=NOW() WHERE id=$2`,
      ['ENTANGLED no devolvió cuenta bancaria de destino', requestId]
    );
    return res.status(502).json({
      error: 'No se devolvió una cuenta bancaria de destino. No se puede procesar la solicitud.',
      request_id: requestId,
    });
  }

  // Deadline = la ventana más corta entre ENTANGLED (vence_en) y la nuestra
  // (created_at + congelamiento_horas). "Gana la más corta."
  const congelamientoHoras = await getCongelamientoHoras();
  const nuestroDeadline = new Date(Date.now() + congelamientoHoras * 60 * 60 * 1000);
  const entangledDeadline = remote.vence_en ? new Date(remote.vence_en) : null;
  const paymentDeadline =
    entangledDeadline && !isNaN(entangledDeadline.getTime())
      ? new Date(Math.min(entangledDeadline.getTime(), nuestroDeadline.getTime()))
      : nuestroDeadline;

  // Desglose (modelo VENTA FIJA). Se reafina con el % real que devolvió ENTANGLED.
  //  - Cliente paga    = commission.porcentaje (p.ej. 5.5%)
  //  - Entangled cobra = remote.comision_cobrada_porcentaje ?? porcentaje_compra (costo, p.ej. 2.8%)
  //  - Venta fija      = override_porcentaje_compra (tasa de venta de EntregaX, p.ej. 4.0%)
  //  - EntregaX gana   = Venta fija − Costo   (4.0 − 2.8 = 1.2%)
  //  - Asesor gana     = Cliente − Venta fija (5.5 − 4.0 = 1.5%)
  const pctEntangled = Number(remote.comision_cobrada_porcentaje ?? proveedorPctEntangled) || 0;
  const ventaFija = proveedorVentaFija > 0 ? proveedorVentaFija : pctClienteIns;
  const pctEntregax = Math.max(0, ventaFija - pctEntangled);
  const pctAsesor = Math.max(0, pctClienteIns - ventaFija);

  let updated = (await pool.query(
    `UPDATE entangled_payment_requests
        SET entangled_transaccion_id = $1,
            estatus_global = $2,
            comision_cobrada_porcentaje = $3,
            tc_aplicado_usd = $4,
            empresas_asignadas = $5::jsonb,
            raw_response = $6::jsonb,
            payment_deadline_at = $8,
            comision_entregax = $9,
            comision_asesor = $10,
            es_hibrida = COALESCE($11, es_hibrida),
            es_pesos = COALESCE($12, es_pesos),
            updated_at = NOW()
      WHERE id = $7
      RETURNING *`,
    [
      remote.transaccion_id,
      estatusTrasFase1,
      remote.comision_cobrada_porcentaje ?? (proveedorPctEntangled || null),
      remote.tc_aplicado_usd ?? null,
      JSON.stringify(empresasFinales),
      JSON.stringify(remote.raw || {}),
      requestId,
      paymentDeadline.toISOString(),
      pctEntregax,
      pctAsesor,
      remote.es_hibrida ?? null,
      remote.es_pesos ?? null,
    ]
  )).rows[0];

  // No hay Fase 2: el comprobante ya viajó como `comprobante_cliente_url` en
  // el JSON del POST /solicitud-pago anterior.
  if (comprobanteUrl) {
    updated = (await pool.query(
      `UPDATE entangled_payment_requests
          SET url_comprobante_cliente = COALESCE($1, url_comprobante_cliente),
              updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [comprobanteUrl, requestId]
    )).rows[0];
  }

  // Enviar WhatsApp de confirmación al cliente (fire-and-forget)
  try {
    const userRow = await pool.query(
      `SELECT full_name, phone FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    const u = userRow.rows[0];
    if (!u?.phone) {
      console.warn(`[XPAY WA] Usuario ${userId} no tiene teléfono registrado — omitiendo WhatsApp de confirmación`);
    } else {
      // 💵 Total a depositar: se usa el MISMO número que la orden, el PDF y el
      // que se le manda a ENTANGLED (totalMxnFactura). Antes se recalculaba
      // aquí como base x (1 + comisión), sin el costo de operación, así que el
      // WhatsApp cotizaba de menos: XP411078 decía $17,982.59 cuando la orden
      // decía $18,506.94 — justo los $30 USD del costo de operación.
      const totalMxn = totalMxnFactura > 0
        ? totalMxnFactura.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '—';
      const cb: any = (empresasFinales[0]?.cuenta_bancaria) || {};
      console.log(`[XPAY WA] Enviando confirmación a ${u.phone} ref=${referenciaPago} banco=${cb.banco || '?'}`);
      void sendXPayConfirmation({
        phone: u.phone,
        nombre: u.full_name || '',
        montoUsd: `$${Number(monto).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${divisa}`,
        totalMxn: `$${totalMxn}`,
        beneficiario: String(body.beneficiario_nombre || ''),
        banco: cb.banco || cb.bank || '',
        cuenta: cb.cuenta || cb.account || cb.numero_cuenta || '',
        clabe: cb.clabe || cb.CLABE || '',
        referencia: referenciaPago,
      });
    }
  } catch (waErr) {
    console.warn('[XPAY WA] Error enviando WhatsApp de confirmación:', waErr);
  }

  return res.status(201).json({
    message: hasFile
      ? 'Solicitud enviada y comprobante adjuntado.'
      : 'Solicitud enviada. Sube tu comprobante para completar el pago.',
    request: updated,
    request_id: requestId,
    referencia_pago: referenciaPago,
    servicio,
    requires_proof_upload: !hasFile,
    vence_en: updated?.payment_deadline_at ?? paymentDeadline.toISOString(),
    comision_cliente_final_porcentaje: commission.porcentaje,
    comision_cobrada_porcentaje: remote.comision_cobrada_porcentaje,
    tc_aplicado_usd: remote.tc_aplicado_usd,
    empresas_asignadas: empresasFinales,
    entangled_transaccion_id: remote.transaccion_id,
    status: estatusTrasFase1,
  });
};

// ===========================================================================
// Helper: forwardea el comprobante a ENTANGLED para una solicitud existente.
// Flujo de 2 fases:
//   * Si ya tenemos transaccion_id → POST /solicitud-pago/:id/comprobante
//     (vía uploadComprobanteToTransaccion). Persistimos url_comprobante.
//   * Fallback legacy: si NO hay transaccion_id (solicitud antigua creada
//     antes del nuevo contrato) → reenviamos con multipart sendSolicitudPago.
// Devuelve { ok, status, payload } para responder al cliente.
// ===========================================================================
export async function sendPendingRequestToEntangled(
  requestId: number,
  fileBuffer: Buffer,
  fileName: string,
  fileMime: string
): Promise<{ ok: boolean; status: number; payload: any }> {
  // 1) Cargar solicitud local
  const r = await pool.query(
    `SELECT * FROM entangled_payment_requests WHERE id = $1 LIMIT 1`,
    [requestId]
  );
  if (r.rows.length === 0) {
    return { ok: false, status: 404, payload: { error: 'Solicitud no encontrada' } };
  }
  const reqRow = r.rows[0];

  // ── Vencimiento y periodo de gracia ────────────────────────────────────
  //
  // La orden se ve CANCELADA a las 24 h (el congelamiento del TC venció y el
  // cron ya la marcó). Pero el comprobante se sigue recibiendo hasta las 36:
  // el cliente que pagó a las 25 horas pagó de verdad, y perder ese pago por
  // un cierre de reloj obliga a rehacer todo. Dentro de esa gracia el
  // comprobante SE GUARDA y se le avisa al equipo para que la reactive.
  //
  // El TC de la orden SE RESPETA durante las 36 horas: el cliente pagó lo que
  // se le cotizó. Que a las 24 se vea cancelada es la salida que nos deja no
  // comprometernos si el tipo de cambio se movió una barbaridad; fuera de ese
  // caso se reactiva. No se reactiva sola porque reabrir es una decisión, no
  // porque el precio haya dejado de valer.
  const graciaHoras = await getGraciaHoras();
  const venceMs = reqRow.payment_deadline_at ? new Date(reqRow.payment_deadline_at).getTime() : null;
  const finGraciaMs = venceMs != null ? venceMs + graciaHoras * 60 * 60 * 1000 : null;
  const vencida = venceMs != null && venceMs < Date.now();
  const dentroDeGracia = finGraciaMs != null && Date.now() <= finGraciaMs;

  // Comprobante llegado entre las 24 y las 36 horas.
  //
  // La operación SIGUE SU CURSO NORMAL: se manda al proveedor y se paga, con el
  // tipo de cambio de la orden. No se cancela, no se detiene y no se le avisa a
  // nadie internamente: no hay nada que decidir.
  //
  // Al cliente sí se le devuelve el aviso de que está "en proceso de
  // cancelación". Es deliberado y es solo texto: nos deja la puerta abierta a no
  // sostener el compromiso si algún día el TC se mueve una barbaridad, sin
  // frenar el 99% de los casos en que da igual.
  const fueraDeTiempo = vencida && dentroDeGracia;
  const AVISO_FUERA_DE_TIEMPO =
    'Recibimos tu comprobante, pero el plazo de esta operación ya venció y está en proceso de cancelación. '
    + 'Ya avisamos al equipo de soporte para revisar si es posible reactivarla; te confirmamos en breve.';

  if (String(reqRow.estatus_global) === 'cancelado') {
    // Cancelada de verdad (se acabó la gracia, o la canceló una persona o el
    // proveedor): eso sí es definitivo.
    return { ok: false, status: 409, payload: { error: 'orden_cancelada', message: 'La orden fue cancelada (congelamiento vencido). Crea una nueva solicitud.' } };
  }

  // Se acabó la gracia: ahora sí se cancela de verdad y se le avisa al proveedor.
  if (vencida && !dentroDeGracia && !reqRow.comprobante_subido_at) {
    await pool.query(
      `UPDATE entangled_payment_requests SET estatus_global='cancelado', error_message='congelamiento_vencido', updated_at=NOW() WHERE id=$1`,
      [requestId]
    ).catch(() => {});
    void notifyCancelledRequestIds([requestId], 'congelamiento_vencido');
    return { ok: false, status: 409, payload: { error: 'orden_vencida', message: 'El plazo de pago venció (congelamiento). Crea una nueva solicitud.' } };
  }

  if (!isEntangledConfigured()) {
    return {
      ok: false,
      status: 202,
      payload: {
        message:
          'Comprobante guardado localmente. ENTANGLED no está configurado; será procesado manualmente.',
        request_id: requestId,
        status: 'error_envio',
      },
    };
  }

  // CAMINO PRINCIPAL: ya tenemos transaccion_id (nuevo contrato 2 fases)
  if (reqRow.entangled_transaccion_id) {
    const up = await uploadComprobanteToTransaccion(
      String(reqRow.entangled_transaccion_id),
      {
        buffer: fileBuffer,
        filename: fileName || `comprobante-${requestId}`,
        mimetype: fileMime || 'application/octet-stream',
      }
    );
    if (!up.ok) {
      await pool.query(
        `UPDATE entangled_payment_requests
            SET error_message = $1,
                updated_at = NOW()
          WHERE id = $2`,
        [up.error || 'Error subiendo comprobante a ENTANGLED', requestId]
      );
      return {
        ok: false,
        status: 502,
        payload: {
          error: up.error || 'No se pudo enviar el comprobante.',
          request_id: requestId,
        },
      };
    }
    const upd = await pool.query(
      `UPDATE entangled_payment_requests
          SET estatus_global = CASE WHEN LOWER(COALESCE(subservicio,'')) = 'efectivo' THEN 'completado' ELSE 'en_proceso' END,
              url_comprobante_cliente = COALESCE($1, url_comprobante_cliente),
              comprobante_subido_at = NOW(),
              updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [up.url_comprobante_cliente || null, requestId]
    );
    generateXpayCommission(Number(requestId)).catch((e: any) => console.error('Error comisión XPAY:', e));
    return {
      ok: true,
      status: 200,
      payload: {
        message: 'Comprobante enviado.',
        request: upd.rows[0],
        entangled_transaccion_id: reqRow.entangled_transaccion_id,
      },
    };
  }

  // FALLBACK LEGACY: solicitud antigua sin transaccion_id → reenvío multipart
  const servicio = reqRow.servicio as EntangledServicio;
  const conceptos = Array.isArray(reqRow.op_conceptos)
    ? reqRow.op_conceptos
    : (() => {
        try {
          return JSON.parse(reqRow.op_conceptos || '[]');
        } catch {
          return [];
        }
      })();

  // tc_cliente_final es obligatorio para ENTANGLED. Para solicitudes creadas
  // antes de que la columna existiera (o en las que la persistencia falló),
  // intentamos recuperarlo del instructions_snapshot.quote.tipo_cambio que el
  // frontend ya guarda al crear la solicitud. Si lo recuperamos, lo persistimos
  // para que reuploads futuros lo encuentren en columna.
  let tcClienteFinal: number | undefined;
  if (reqRow.tc_cliente_final != null) {
    tcClienteFinal = Number(reqRow.tc_cliente_final);
  } else {
    const snap = reqRow.instructions_snapshot && typeof reqRow.instructions_snapshot === 'object'
      ? reqRow.instructions_snapshot
      : null;
    const fromSnapshot = Number(snap?.quote?.tipo_cambio);
    if (Number.isFinite(fromSnapshot) && fromSnapshot > 0) {
      tcClienteFinal = fromSnapshot;
      try {
        await pool.query(
          `UPDATE entangled_payment_requests
              SET tc_cliente_final = $1, updated_at = NOW()
            WHERE id = $2`,
          [tcClienteFinal, requestId]
        );
      } catch (e) {
        console.warn('[ENTANGLED] no pude persistir tc_cliente_final recuperado:', e);
      }
    }
  }
  if (!Number.isFinite(tcClienteFinal as number) || (tcClienteFinal as number) <= 0) {
    await pool.query(
      `UPDATE entangled_payment_requests
          SET estatus_global = 'error_envio',
              error_message = $1,
              updated_at = NOW()
        WHERE id = $2`,
      ['Falta tc_cliente_final para enviar a ENTANGLED', requestId]
    );
    return {
      ok: false,
      status: 400,
      payload: {
        error: 'Falta el tipo de cambio (tc_cliente_final) usado al crear la solicitud. Vuelva a crear la solicitud para regenerar la cotización.',
        request_id: requestId,
      },
    };
  }

  // Reconstruir notas con datos del beneficiario desde instructions_snapshot
  const snap = reqRow.instructions_snapshot && typeof reqRow.instructions_snapshot === 'object'
    ? reqRow.instructions_snapshot as any : null;
  const benefSnap = snap?.beneficiarioSnapshot || null;
  // 🌎 País destino (ver build principal): preferir país del beneficiario, si no
  //    derivar de la divisa (RMB→China, MXN→México, USD→Estados Unidos).
  //    Faltaba el caso MXN: una operación en pesos se mandaba como "Estados
  //    Unidos", y ENTANGLED rutea la operación por este dato.
  const paisDestino = resolverPaisDestino({
    declarado: (benefSnap as any)?.pais,
    swift: (benefSnap as any)?.swift,
    divisa: String(reqRow.op_divisa_destino || ''),
  });
  const notasObj: any = { proveedor_envio: { pais: paisDestino } };
  if (benefSnap) {
    notasObj.proveedor_envio = {
      pais: paisDestino,
      nombre_beneficiario: benefSnap.nombre || reqRow.op_beneficiario_nombre || '',
      nombre_chino: benefSnap.nombre_chino || '',
      numero_cuenta: benefSnap.cuenta || '',
      iban: benefSnap.iban || '',
      banco_nombre: benefSnap.banco || '',
      swift_bic: benefSnap.swift || '',
      aba_routing: benefSnap.aba || '',
      direccion_beneficiario: benefSnap.direccion || '',
    };
  }

  const payload: EntangledSolicitudPayloadV2 = {
    servicio,
    comision_cliente_final_porcentaje: Number(
      reqRow.comision_cliente_final_porcentaje || 0
    ),
    tc_cliente_final: tcClienteFinal,
    monto_usd: Number(reqRow.op_monto),
    divisa: reqRow.op_divisa_destino as EntangledDivisa,
    cliente_final:
      servicio === 'pago_con_factura'
        ? {
            razon_social: reqRow.cf_razon_social,
            rfc: String(reqRow.cf_rfc || '').toUpperCase(),
            email: reqRow.cf_email,
            regimen_fiscal: reqRow.cf_regimen_fiscal,
            cp: String(reqRow.cf_cp || ''),
            uso_cfdi: reqRow.cf_uso_cfdi,
          }
        : { razon_social: reqRow.cf_razon_social },
    referencia_xpay: reqRow.referencia_pago,
    pais_destino: paisDestino,
    // Total cobrado al cliente: el persistido al crear la solicitud. Para las
    // solicitudes viejas (creadas antes de que se guardara) se recupera del
    // snapshot de la UI y, en último caso, se reconstruye base + comisión.
    total_mxn_factura: (() => {
      const guardado = Number(reqRow.monto_mxn_total);
      if (Number.isFinite(guardado) && guardado > 0) return Number(guardado.toFixed(2));
      const delSnap = Number(snap?.quote?.monto_mxn_total);
      if (Number.isFinite(delSnap) && delSnap > 0) return Number(delSnap.toFixed(2));
      const base = Number(reqRow.op_monto) * Number(tcClienteFinal || 0);
      const pct = Number(reqRow.comision_cliente_final_porcentaje || 0);
      return Number((base * (1 + pct / 100)).toFixed(2));
    })(),
    notas: JSON.stringify(notasObj),
  };
  if (servicio === 'pago_con_factura') {
    payload.conceptos = conceptos as any[];
    // Constancia del cliente final DENTRO de cliente_final (igual que la ruta de
    // creación). Se omite si el cliente no la tiene subida.
    const constanciaUrl = await fetchConstanciaUrl(reqRow.user_id);
    if (constanciaUrl) {
      payload.cliente_final.constancia_url = constanciaUrl;
      payload.constancia_url = constanciaUrl; // compat: también en raíz
    }
  }
  // Anexamos la URL del comprobante (ya subido a NUESTRO S3 por el endpoint
  // /upload-proof-file en index.ts antes de invocarnos). ENTANGLED exige que
  // POST /solicitud-pago incluya el archivo (multipart) o el link
  // (comprobante_cliente_url) en el JSON; vamos por la opción JSON+URL.
  // Como el bucket es privado, generamos una URL firmada con 7 días de
  // validez para que ENTANGLED pueda descargar el archivo sin AccessDenied.
  if (reqRow.op_comprobante_cliente_url) {
    let urlForEntangled = String(reqRow.op_comprobante_cliente_url);
    try {
      const { extractKeyFromUrl, getSignedUrlForKey } = await import('./s3Service');
      const key = extractKeyFromUrl(urlForEntangled);
      if (key) {
        urlForEntangled = await getSignedUrlForKey(key, 7 * 24 * 60 * 60);
      }
    } catch (e) {
      console.warn('[ENTANGLED] no pude firmar la URL del comprobante:', e);
    }
    payload.comprobante_cliente_url = urlForEntangled;
  }

  if (!isEntangledConfigured()) {
    await pool.query(
      `UPDATE entangled_payment_requests
          SET estatus_global = 'error_envio',
              error_message = $1,
              updated_at = NOW()
        WHERE id = $2`,
      ['ENTANGLED_API_KEY no configurada', requestId]
    );
    return {
      ok: false,
      status: 202,
      payload: {
        message:
          'Comprobante guardado. ENTANGLED no está configurado; la solicitud será procesada manualmente.',
        request_id: requestId,
        status: 'error_envio',
      },
    };
  }

  // POST /solicitud-pago — JSON con payload + comprobante_cliente_url.
  // Una sola llamada: ENTANGLED toma la URL del comprobante y devuelve
  // transaccion_id + empresas_asignadas.
  const remote = await sendSolicitudPago(payload, null);

  if (!remote.ok || !remote.transaccion_id) {
    await pool.query(
      `UPDATE entangled_payment_requests
          SET estatus_global = 'error_envio',
              error_message = $1,
              raw_response = $2::jsonb,
              updated_at = NOW()
        WHERE id = $3`,
      [remote.error || 'Sin transaccion_id', JSON.stringify(remote.raw || {}), requestId]
    );
    return {
      ok: false,
      status: 502,
      payload: {
        error: remote.error || 'No se devolvió un transaccion_id.',
        request_id: requestId,
      },
    };
  }

  // Desglose de la comisión — se reafirma ahora que ENTANGLED respondió.
  // Entregax = el incremento configurado del proveedor (ya guardado en creación
  // como comision_entregax); asesor = lo que sobra.
  const pctClienteP = Number(reqRow.comision_cliente_final_porcentaje) || 0;
  // % de Entangled: el que devolvió la API o, si no, el ya guardado en creación.
  const pctEntangledP = Number(remote.comision_cobrada_porcentaje ?? reqRow.comision_cobrada_porcentaje ?? 0) || 0;
  const pctEntregaxBaseP = Number(reqRow.comision_entregax) || 0;
  const pctEntregaxP = Math.min(pctEntregaxBaseP, Math.max(0, pctClienteP - pctEntangledP));
  const pctAsesorP = Math.max(0, pctClienteP - pctEntangledP - pctEntregaxP);

  const upd = await pool.query(
    `UPDATE entangled_payment_requests
        SET entangled_transaccion_id = $1,
            estatus_global = CASE WHEN LOWER(COALESCE(subservicio,'')) = 'efectivo' THEN 'completado' ELSE 'en_proceso' END,
            comision_cobrada_porcentaje = $2,
            tc_aplicado_usd = $3,
            empresas_asignadas = $4::jsonb,
            url_comprobante_cliente = COALESCE($5, url_comprobante_cliente),
            comprobante_subido_at = NOW(),
            raw_response = $6::jsonb,
            comision_entregax = $8,
            comision_asesor = $9,
            es_hibrida = COALESCE($10, es_hibrida),
            es_pesos = COALESCE($11, es_pesos),
            updated_at = NOW()
      WHERE id = $7
      RETURNING *`,
    [
      remote.transaccion_id,
      remote.comision_cobrada_porcentaje ?? reqRow.comision_cobrada_porcentaje ?? null,
      remote.tc_aplicado_usd ?? null,
      JSON.stringify(remote.empresas_asignadas || []),
      remote.url_comprobante_cliente || reqRow.op_comprobante_cliente_url || null,
      JSON.stringify(remote.raw || {}),
      requestId,
      pctEntregaxP,
      pctAsesorP,
      remote.es_hibrida ?? null,
      remote.es_pesos ?? null,
    ]
  );

  generateXpayCommission(Number(requestId)).catch((e: any) => console.error('Error comisión XPAY:', e));

  return {
    ok: true,
    status: 200,
    payload: {
      // Fuera de plazo pero dentro de la gracia: la operación ya salió normal;
      // el aviso es solo lo que lee el cliente.
      message: fueraDeTiempo ? AVISO_FUERA_DE_TIEMPO : 'Comprobante recibido y solicitud enviada.',
      fuera_de_tiempo: fueraDeTiempo,
      request: upd.rows[0],
      comision_cobrada_porcentaje: remote.comision_cobrada_porcentaje,
      tc_aplicado_usd: remote.tc_aplicado_usd,
      empresas_asignadas: remote.empresas_asignadas || [],
    },
  };
}

// ===========================================================================
// GET /api/entangled/exchange-rate?divisa=USD|RMB   (proxy)
// ===========================================================================
export const getExchangeRate = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const divisa = String(req.query.divisa || 'USD').toUpperCase() as EntangledDivisa;
  if (!['USD', 'RMB'].includes(divisa)) {
    return res.status(400).json({ error: 'divisa debe ser USD o RMB' });
  }
  const r = await getTipoCambio(divisa);
  if (!r.ok) return res.status(502).json({ error: r.error });
  return res.json({
    divisa: r.divisa || divisa,
    tipo_cambio: r.tipo_cambio,
    vigencia: r.vigencia,
  });
};

// ===========================================================================
// POST /api/entangled/payment-requests/cleanup
// Borra las solicitudes propias del usuario que NO estén en flujo activo
// ('en_proceso' o 'completado'). Útil para limpiar el historial después de
// pruebas o solicitudes canceladas. Borra primero los logs de webhook FK.
// ===========================================================================
export const cleanupTestRequests = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  const protectedStatuses = ['en_proceso', 'completado'];

  try {
    // 1) Reunir IDs a borrar (siempre del usuario autenticado).
    const r = await pool.query(
      `SELECT id FROM entangled_payment_requests
        WHERE user_id = $1
          AND LOWER(COALESCE(estatus_global, '')) <> ALL($2::text[])`,
      [userId, protectedStatuses]
    );
    const ids = r.rows.map((row: { id: number }) => row.id);
    if (ids.length === 0) {
      return res.json({ ok: true, deleted: 0, message: 'No hay solicitudes para borrar.' });
    }

    // 2) Limpiar referencias en webhook logs (en caso de que exista FK ON
    //    DELETE RESTRICT). No es estrictamente necesario si la FK es CASCADE
    //    o no existe, pero es seguro hacerlo.
    await pool.query(
      `DELETE FROM entangled_webhook_logs WHERE request_id = ANY($1::int[])`,
      [ids]
    );

    // 3) Borrar las solicitudes.
    const del = await pool.query(
      `DELETE FROM entangled_payment_requests WHERE id = ANY($1::int[])`,
      [ids]
    );

    return res.json({
      ok: true,
      deleted: del.rowCount || ids.length,
      ids,
    });
  } catch (err) {
    console.error('[ENTANGLED] cleanupTestRequests:', err);
    return res.status(500).json({ error: (err as Error).message || 'Error limpiando solicitudes' });
  }
};

// ===========================================================================
// GET /api/entangled/payment-requests/:id/documento/:tipo
// Proxy autenticado contra ENTANGLED para descargar el documento binario.
// tipo ∈ { factura_pdf, factura_xml, comprobante_proveedor, comprobante_cliente }
// Devuelve el archivo tal cual viene de ENTANGLED, con el mismo Content-Type
// y un Content-Disposition (attachment) usando el filename original.
// ===========================================================================
export const proxyEntangledDocumento = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
  const tipo = String(req.params.tipo || '') as EntangledDocumentoTipo;
  if (!ENTANGLED_DOCUMENTO_TIPOS.includes(tipo)) {
    return res.status(400).json({
      error: `Tipo inválido. Use uno de: ${ENTANGLED_DOCUMENTO_TIPOS.join(', ')}`,
    });
  }

  const r = await pool.query(
    `SELECT id, user_id, entangled_transaccion_id, referencia_pago,
            comprobante_proveedor_url, url_comprobante_cliente, op_comprobante_cliente_url,
            factura_url, factura_nombre_archivo
       FROM entangled_payment_requests WHERE id = $1`,
    [id]
  );
  if (r.rows.length === 0) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const row = r.rows[0];
  // Acceso: admin, el cliente dueño, o el ASESOR del cliente (la solicitud es de
  // su cliente asignado). Antes el asesor recibía 403 porque su userId nunca
  // coincide con row.user_id (el del cliente).
  if (!isAdminRole(req) && row.user_id !== userId && !(await advisorOwnsClient(userId, row.user_id))) {
    return res.status(403).json({ error: 'Sin acceso a esta solicitud' });
  }
  if (!row.entangled_transaccion_id) {
    return res.status(400).json({
      error: 'La solicitud aún no se envió (no hay transaccion_id).',
    });
  }

  const remote = await getSolicitudDocumento(String(row.entangled_transaccion_id), tipo);
  if (!remote.ok || !remote.buffer) {
    // El proveedor puede contestar que no tiene el documento aunque nosotros SÍ
    // lo tengamos guardado: la URL nos llega por webhook y queda en la fila. Le
    // pasó a XP386901, donde el asesor no pudo bajar un comprobante que ya
    // existía de nuestro lado (tarea 447). Antes de rendirse, se intenta con lo
    // que ya tenemos.
    const GUARDADA: Record<string, string | null> = {
      comprobante_proveedor: row.comprobante_proveedor_url,
      comprobante_cliente: row.url_comprobante_cliente || row.op_comprobante_cliente_url,
      factura_pdf: row.factura_url,
    };
    const guardada = GUARDADA[tipo];
    if (guardada) {
      try {
        const { signS3UrlIfNeeded } = await import('./s3Service');
        const firmada = await signS3UrlIfNeeded(String(guardada)).catch(() => null);
        const resp = await fetch(String(firmada || guardada));
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          const ct = resp.headers.get('content-type') || 'application/octet-stream';
          const sinQuery = String(guardada).split('?')[0] || '';
          const ext = (sinQuery.match(/\.([a-z0-9]{3,4})$/i) || [])[1] || 'bin';
          console.log(`[XPAY] ${row.referencia_pago}: el documento ${tipo} no vino del proveedor; se sirve el guardado.`);
          res.setHeader('Content-Type', ct);
          res.setHeader('Content-Disposition',
            `attachment; filename="${(row.referencia_pago || `XP${id}`)}_${tipo}.${ext}"`);
          res.setHeader('Content-Length', String(buf.length));
          return res.send(buf);
        }
      } catch (e: any) {
        console.warn(`[XPAY] no se pudo servir el ${tipo} guardado de ${row.referencia_pago}:`, e?.message);
      }
    }
    // Sin respaldo: el mensaje se limpia para no exponer al proveedor.
    return res.status(remote.status && remote.status >= 400 && remote.status < 600 ? remote.status : 502).json({
      error: friendlyEntangledError(remote.error, (remote as any).raw)
        || 'Este documento todavía no está disponible. En cuanto se procese el pago aparecerá aquí.',
    });
  }

  const filename = remote.filename || `${row.referencia_pago || `XP${id}`}_${tipo}`;
  res.setHeader('Content-Type', remote.contentType || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename.replace(/"/g, '')}"`
  );
  res.setHeader('Content-Length', String(remote.buffer.length));
  return res.send(remote.buffer);
};

// ===========================================================================
// POST /api/entangled/payment-requests/:id/sync
// Pull manual del estado actual desde ENTANGLED. Aplica los mismos updates
// que harían los webhooks factura.generada y pago.proveedor.confirmado, pero
// reactivamente cuando un webhook se perdió y el estado local quedó atrás.
// ===========================================================================
export const syncRequestFromEntangled = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

  const r = await pool.query(
    `SELECT id, user_id, entangled_transaccion_id, servicio
       FROM entangled_payment_requests WHERE id = $1`,
    [id]
  );
  if (r.rows.length === 0) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const row = r.rows[0];
  if (!isAdminRole(req) && row.user_id !== userId && !(await advisorOwnsClient(userId, row.user_id))) {
    return res.status(403).json({ error: 'Sin acceso a esta solicitud' });
  }
  if (!row.entangled_transaccion_id) {
    return res.status(400).json({
      error: 'La solicitud aún no se envió (no hay transaccion_id).',
    });
  }

  const remote = await getSolicitudStatus(String(row.entangled_transaccion_id));
  if (!remote.ok) {
    return res.status(502).json({ error: remote.error || 'Error consultando el estado' });
  }

  // Shape oficial de la respuesta (docs):
  //   { estatus_factura, estatus_proveedor,
  //     documentos: { factura_pdf, factura_xml, comprobante_cliente,
  //                   comprobante_proveedor } }
  // También soportamos variantes legacy (url_factura_pdf, detalles.estatus)
  // por si el campo cambió entre versiones.
  const data = remote.data || {};
  const docs = data.documentos || data.docs || {};
  const detalles = data.detalles || {};
  const facturaUrl = docs.factura_pdf || docs.url_factura_pdf || data.factura_url || null;
  const facturaXmlUrl = docs.factura_xml || docs.url_factura_xml || data.factura_xml_url || null;
  const comprobanteProvUrl = docs.comprobante_proveedor || docs.url_comprobante_proveedor || data.comprobante_proveedor_url || null;
  const comprobanteClienteUrl = docs.comprobante_cliente || docs.url_comprobante_cliente || null;
  const estatusFacturaRemote = String(data.estatus_factura || '').toLowerCase() || null;
  // Si ya hay comprobante del proveedor, el pago está hecho aunque ENTANGLED
  // reporte estatus_proveedor='pendiente'.
  const estatusProveedorRemote = comprobanteProvUrl
    ? 'completado'
    : (String(data.estatus_proveedor || detalles.estatus || data.estatus || '').toLowerCase() || null);
  const servicio = row.servicio as EntangledServicio;

  const upd = await pool.query(
    `UPDATE entangled_payment_requests
        SET factura_url = COALESCE($1, factura_url),
            estatus_factura = CASE
              WHEN $7::text IS NOT NULL AND $7::text <> '' THEN $7::text
              WHEN $1 IS NOT NULL THEN 'emitida'
              ELSE estatus_factura
            END,
            factura_emitida_at = CASE
              WHEN factura_emitida_at IS NULL
                   AND ($1 IS NOT NULL OR $7::text IN ('emitida','completado'))
              THEN NOW()
              ELSE factura_emitida_at
            END,
            comprobante_proveedor_url = COALESCE($2, comprobante_proveedor_url),
            url_comprobante_cliente = COALESCE($9, url_comprobante_cliente),
            estatus_proveedor = CASE
              WHEN $3::text IN ('completado','rechazado','en_proceso','pendiente') THEN $3::text
              ELSE estatus_proveedor
            END,
            proveedor_pagado_at = CASE
              WHEN $3::text = 'completado' AND proveedor_pagado_at IS NULL THEN NOW()
              ELSE proveedor_pagado_at
            END,
            raw_response = COALESCE(raw_response, '{}'::jsonb)
              || jsonb_build_object('factura_xml_url', $4::text)
              || jsonb_build_object('last_sync_at', NOW())
              || jsonb_build_object('last_sync_payload', $5::jsonb),
            estatus_global = CASE
              WHEN ($6 = 'pago_sin_factura' AND $3::text = 'completado') THEN 'completado'
              WHEN ($6 = 'pago_con_factura' AND $3::text = 'completado'
                    AND ($1 IS NOT NULL OR estatus_factura = 'emitida' OR $7::text IN ('emitida','completado'))) THEN 'completado'
              WHEN $3::text = 'rechazado' THEN 'rechazado'
              ELSE estatus_global
            END,
            last_webhook_at = NOW(),
            updated_at = NOW()
      WHERE id = $8
      RETURNING *`,
    [
      facturaUrl,
      comprobanteProvUrl,
      estatusProveedorRemote,
      facturaXmlUrl,
      JSON.stringify(data),
      servicio,
      estatusFacturaRemote,
      id,
      comprobanteClienteUrl,
    ]
  );

  return res.json({ ok: true, request: upd.rows[0], remote: data });
};

// ===========================================================================
// Sync PERIÓDICO (cron): consulta ENTANGLED para operaciones en proceso y
// actualiza estatus_factura / estatus_proveedor / estatus_global / documentos.
// Respaldo por si el webhook factura.generada / pago.proveedor no llegó.
// Mismo UPDATE que syncRequestFromEntangled.
// ===========================================================================
export async function syncPendingEntangledOperations(): Promise<{ checked: number; updated: number }> {
  if (!isEntangledConfigured()) return { checked: 0, updated: 0 };
  const pend = await pool.query(
    `SELECT id, servicio, entangled_transaccion_id
       FROM entangled_payment_requests
      WHERE entangled_transaccion_id IS NOT NULL
        AND estatus_global IN ('en_proceso', 'esperando_comprobante')
        AND (COALESCE(estatus_factura,'') <> 'emitida' OR COALESCE(estatus_proveedor,'') <> 'completado')
        AND created_at >= NOW() - INTERVAL '45 days'
      ORDER BY updated_at ASC
      LIMIT 60`
  );
  let updated = 0;
  for (const row of pend.rows) {
    try {
      const remote = await getSolicitudStatus(String(row.entangled_transaccion_id));
      if (!remote.ok) continue;
      const data = remote.data || {};
      const docs = data.documentos || data.docs || {};
      const detalles = data.detalles || {};
      const facturaUrl = docs.factura_pdf || docs.url_factura_pdf || data.url_factura_pdf || data.factura_url || null;
      const facturaXmlUrl = docs.factura_xml || docs.url_factura_xml || data.url_factura_xml || data.factura_xml_url || null;
      const comprobanteProvUrl = docs.comprobante_proveedor || docs.url_comprobante_proveedor || data.url_comprobante_proveedor || data.comprobante_proveedor_url || null;
      const comprobanteClienteUrl = docs.comprobante_cliente || docs.url_comprobante_cliente || data.url_comprobante_cliente || null;
      const estatusFacturaRemote = String(data.estatus_factura || '').toLowerCase() || null;
      // Si ENTANGLED ya tiene el COMPROBANTE del proveedor, el pago está hecho —
      // aunque su campo estatus_proveedor a veces se quede en 'pendiente'.
      const estatusProveedorRemote = comprobanteProvUrl
        ? 'completado'
        : (String(data.estatus_proveedor || detalles.estatus || data.estatus || '').toLowerCase() || null);
      const upd = await pool.query(
        `UPDATE entangled_payment_requests
            SET factura_url = COALESCE($1, factura_url),
                estatus_factura = CASE
                  WHEN $7::text IS NOT NULL AND $7::text <> '' THEN $7::text
                  WHEN $1 IS NOT NULL THEN 'emitida'
                  ELSE estatus_factura
                END,
                factura_emitida_at = CASE
                  WHEN factura_emitida_at IS NULL
                       AND ($1 IS NOT NULL OR $7::text IN ('emitida','completado'))
                  THEN NOW() ELSE factura_emitida_at END,
                comprobante_proveedor_url = COALESCE($2, comprobante_proveedor_url),
                url_comprobante_cliente = COALESCE($9, url_comprobante_cliente),
                estatus_proveedor = CASE
                  WHEN $3::text IN ('completado','rechazado','en_proceso','pendiente') THEN $3::text
                  ELSE estatus_proveedor END,
                proveedor_pagado_at = CASE
                  WHEN $3::text = 'completado' AND proveedor_pagado_at IS NULL THEN NOW()
                  ELSE proveedor_pagado_at END,
                raw_response = COALESCE(raw_response, '{}'::jsonb)
                  || jsonb_build_object('factura_xml_url', $4::text)
                  || jsonb_build_object('last_sync_at', NOW())
                  || jsonb_build_object('last_sync_payload', $5::jsonb),
                estatus_global = CASE
                  WHEN ($6 = 'pago_sin_factura' AND $3::text = 'completado') THEN 'completado'
                  WHEN ($6 = 'pago_con_factura' AND $3::text = 'completado'
                        AND ($1 IS NOT NULL OR estatus_factura = 'emitida' OR $7::text IN ('emitida','completado'))) THEN 'completado'
                  WHEN $3::text = 'rechazado' THEN 'rechazado'
                  ELSE estatus_global END,
                last_webhook_at = NOW(),
                updated_at = NOW()
          WHERE id = $8`,
        [facturaUrl, comprobanteProvUrl, estatusProveedorRemote, facturaXmlUrl, JSON.stringify(data), row.servicio, estatusFacturaRemote, row.id, comprobanteClienteUrl]
      );
      if (upd.rowCount) updated++;
    } catch (e: any) {
      console.warn('[ENTANGLED sync] error op', row.id, e?.message);
    }
  }
  return { checked: pend.rows.length, updated };
}

// ===========================================================================
// POST /api/entangled/asignacion
// Obtiene empresa + cuenta bancaria asignada para un concepto SAT + cliente.
// ===========================================================================
export const asignacionProxy = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const {
    servicio,
    concepto,
    cliente_final,
    monto_destino,
    divisa_destino,
    tc_cliente_final,
    comision_cliente_final_porcentaje,
  } = req.body || {};
  if (!servicio || !cliente_final?.razon_social) {
    return res.status(400).json({ error: 'servicio y cliente_final.razon_social son requeridos' });
  }
  // Subservicio (transfer/efectivo) solo aplica a pago_sin_factura; define la
  // cuenta de depósito que devolverá ENTANGLED.
  const subservicio: 'transfer' | 'efectivo' | undefined =
    servicio === 'pago_sin_factura'
      ? (String(req.body?.subservicio || 'transfer').trim() as 'transfer' | 'efectivo')
      : undefined;
  if (servicio === 'pago_con_factura' && !concepto) {
    return res.status(400).json({ error: 'concepto es requerido para pago_con_factura' });
  }
  // ENTANGLED /asignacion exige el desglose completo del cobro al cliente
  // (monto, divisa, TC y % de comisión) además de la clave + datos fiscales.
  const montoNum = Number(monto_destino);
  if (!Number.isFinite(montoNum) || montoNum <= 0) {
    return res.status(400).json({ error: 'monto_destino es requerido y debe ser un número mayor a 0' });
  }
  if (!divisa_destino || typeof divisa_destino !== 'string') {
    return res.status(400).json({ error: 'divisa_destino es requerida (USD/RMB/MXN)' });
  }
  const tcNum = Number(tc_cliente_final);
  if (!Number.isFinite(tcNum) || tcNum <= 0) {
    return res.status(400).json({ error: 'tc_cliente_final es requerido y debe ser un número mayor a 0' });
  }
  const comisionNum = Number(comision_cliente_final_porcentaje);
  if (!Number.isFinite(comisionNum) || comisionNum < 0) {
    return res.status(400).json({ error: 'comision_cliente_final_porcentaje es requerida (porcentaje XPAY → cliente final)' });
  }
  // Para pago_sin_factura: payload mínimo — sin campos financieros que Entangled
  // podría no esperar para este servicio (no requiere factura/SAT).
  const clienteFinalSanitizado = servicio === 'pago_sin_factura'
    ? { razon_social: 'SIN' }
    : { ...cliente_final, razon_social: String(cliente_final?.razon_social || '').slice(0, 13) };

  // Valores numéricos con precisión fija para evitar floats largos (VARCHAR overflow en Entangled)
  const tcFixed = parseFloat(tcNum.toFixed(4));
  const comisionFixed = parseFloat(comisionNum.toFixed(2));

  // 🌎 País del banco destino. ENTANGLED lo volvió OBLIGATORIO en /asignacion
  // (409 "destino_pais_faltante"): sin él no puede rutear la operación a un
  // proveedor. Como no lo mandábamos, TODAS las claves SAT fallaban y el front
  // lo pintaba como "No encontrada en catálogo SAT" (TKT-2026-2245).
  // Si el front no lo manda, lo derivamos de la divisa con la MISMA regla que
  // ya usa la creación de la solicitud (RMB→China, MXN→México, resto→EUA).
  const divisaUp = String(divisa_destino).toUpperCase();
  const paisDestinoFront = String(req.body?.pais_destino || '').trim();
  const paisDestino = paisDestinoFront
    || (divisaUp === 'RMB' ? 'China' : divisaUp === 'MXN' ? 'México' : 'Estados Unidos');
  if (!paisDestinoFront) {
    // ⚠️ El país derivado de la divisa puede ser INCORRECTO (se puede pagar en
    // USD a China) y ENTANGLED rutea la operación por él. Solo evita el 409
    // para clientes con app vieja; el front actualizado manda el país real.
    console.warn(`[ENTANGLED asignacion] pais_destino ausente en el request; derivado de divisa ${divisaUp} → "${paisDestino}". Puede rutear a la comercializadora equivocada.`);
  }

  const payloadAsignacion = {
    servicio,
    ...(subservicio ? { subservicio } : {}),
    ...(concepto ? { concepto } : {}),
    cliente_final: clienteFinalSanitizado,
    monto_destino: montoNum,
    divisa_destino,
    pais_destino: paisDestino,
    tc_cliente_final: tcFixed,
    comision_cliente_final_porcentaje: comisionFixed,
  };
  console.warn(`[ENTANGLED asignacion proxy] servicio=${servicio} payload=${JSON.stringify(payloadAsignacion)}`);
  const result = await callAsignacion(payloadAsignacion as any);
  if (!result.ok) {
    // 🐞 Bug conocido de ENTANGLED: el carril "efectivo" devuelve un error de
    // base de datos ("value too long for type character varying(10)"). Traducimos
    // a un mensaje claro y sugerimos transferencia mientras lo corrigen.
    if (subservicio === 'efectivo' && /character varying\(10\)|value too long/i.test(String(result.error || ''))) {
      return res.status(502).json({
        error: 'La modalidad Efectivo aún no está disponible en el proveedor de pagos (error del proveedor). Por favor usa Transferencia bancaria por ahora.',
        provider_error: result.error,
        upstream_status: result.upstream_status,
      });
    }
    // Si ENTANGLED devolvió un 4xx (validación / clave no encontrada), reenviar como 4xx
    // para que el frontend muestre el mensaje real al usuario. 5xx → 502 con mensaje genérico.
    const upstream = result.upstream_status;
    if (typeof upstream === 'number' && upstream >= 400 && upstream < 500) {
      // Se traduce a un mensaje neutro; el crudo queda en error_code/log para
      // nosotros. Antes se reenviaba tal cual y el asesor leía el texto que
      // ENTANGLED escribió para desarrolladores.
      return res.status(upstream).json({
        // Se pasa el contexto del destino para poder NOMBRAR el país cuando la
        // ruta no está habilitada: sin eso el asesor no sabe qué pedir.
        error: friendlyEntangledError(result.error, result.raw, {
          paisDeclarado: paisDestino, swift: req.body?.swift_bic, divisa: divisaUp,
        }) || MENSAJE_GENERICO_XPAY,
        error_code: result.error || null,
        upstream_status: upstream,
      });
    }
    return res.status(502).json({
      error: result.error || 'El servicio de asignación no respondió. Intenta de nuevo en unos segundos.',
      raw: result.raw,
      upstream_status: upstream,
    });
  }
  return res.json(result);
};

// ===========================================================================
// GET /api/entangled/conceptos/search?q=...&limit=...   (proxy)
// ===========================================================================
export const searchConceptosProxy = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const q = String(req.query.q || '').trim();
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const proveedorId = req.query.proveedor_id ? String(req.query.proveedor_id) : undefined;
  if (!q) return res.json({ results: [] });
  const r = await searchConceptos(q, limit, proveedorId);
  if (!r.ok) {
    // Fallback local: historial de claves SAT usadas por el cliente.
    // Evita propagar 502 al frontend cuando ENTANGLED está temporalmente caído
    // o no configurado en entorno productivo.
    try {
      const qLike = `%${q.replace(/[%_]/g, '')}%`;
      const hist = await pool.query(
        `SELECT clave, COALESCE(descripcion, '') AS descripcion
           FROM entangled_clave_sat_history
          WHERE user_id = $1
            AND (clave ILIKE $2 OR COALESCE(descripcion, '') ILIKE $2)
          ORDER BY uses_count DESC, last_used_at DESC
          LIMIT $3`,
        [userId, qLike, limit]
      );

      return res.json({
        results: hist.rows.map((x: any) => ({
          clave_prodserv: String(x.clave),
          descripcion: String(x.descripcion || ''),
        })),
        fallback: true,
        warning: r.error || 'Catálogo SAT remoto no disponible',
      });
    } catch {
      return res.json({
        results: [],
        fallback: true,
        warning: r.error || 'Catálogo SAT remoto no disponible',
      });
    }
  }
  return res.json({ results: r.results || [] });
};

// ===========================================================================
// Service config (admin) y vista por cliente
// ===========================================================================

export const getServiceConfigAdmin = async (req: Request, res: Response): Promise<any> => {
  if (!isAdminRole(req)) return res.status(403).json({ error: 'Sin permisos' });
  try {
    await pool.query(
      `ALTER TABLE entangled_service_config ADD COLUMN IF NOT EXISTS congelamiento_horas INTEGER DEFAULT 24`
    ).catch(() => {});
    const r = await pool.query(
      `SELECT comision_pago_con_factura, comision_pago_sin_factura,
              COALESCE(congelamiento_horas, ${DEFAULT_CONGELAMIENTO_HORAS}) AS congelamiento_horas,
              updated_at, updated_by
         FROM entangled_service_config WHERE id = 1`
    );
    return res.json(
      r.rows[0] || { comision_pago_con_factura: 6, comision_pago_sin_factura: 4, congelamiento_horas: DEFAULT_CONGELAMIENTO_HORAS }
    );
  } catch (err) {
    console.error('[ENTANGLED v2] getServiceConfigAdmin:', err);
    return res.status(500).json({ error: 'Error al consultar configuración' });
  }
};

export const updateServiceConfig = async (req: Request, res: Response): Promise<any> => {
  if (!isAdminRole(req)) return res.status(403).json({ error: 'Sin permisos' });
  const adminId = getAuthUserId(req);
  const conFactura = Number(req.body?.comision_pago_con_factura);
  const sinFactura = Number(req.body?.comision_pago_sin_factura);
  if (!Number.isFinite(conFactura) || conFactura < 0 || conFactura > 100) {
    return res.status(400).json({ error: 'comision_pago_con_factura inválida (0-100)' });
  }
  if (!Number.isFinite(sinFactura) || sinFactura < 0 || sinFactura > 100) {
    return res.status(400).json({ error: 'comision_pago_sin_factura inválida (0-100)' });
  }
  // Horas de congelamiento (opcional). Si no se manda, conserva el valor actual.
  let congelamientoHoras: number | null = null;
  if (req.body?.congelamiento_horas != null && req.body?.congelamiento_horas !== '') {
    const h = Number(req.body.congelamiento_horas);
    if (!Number.isFinite(h) || h < 1 || h > 720) {
      return res.status(400).json({ error: 'congelamiento_horas inválido (1-720)' });
    }
    congelamientoHoras = Math.round(h);
  }
  try {
    await pool.query(
      `ALTER TABLE entangled_service_config ADD COLUMN IF NOT EXISTS congelamiento_horas INTEGER DEFAULT 24`
    ).catch(() => {});
    const r = await pool.query(
      `INSERT INTO entangled_service_config (id, comision_pago_con_factura, comision_pago_sin_factura, congelamiento_horas, updated_by, updated_at)
       VALUES (1, $1, $2, COALESCE($4, ${DEFAULT_CONGELAMIENTO_HORAS}), $3, NOW())
       ON CONFLICT (id) DO UPDATE SET
         comision_pago_con_factura = EXCLUDED.comision_pago_con_factura,
         comision_pago_sin_factura = EXCLUDED.comision_pago_sin_factura,
         congelamiento_horas = COALESCE($4, entangled_service_config.congelamiento_horas),
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [conFactura, sinFactura, adminId, congelamientoHoras]
    );
    return res.json(r.rows[0]);
  } catch (err) {
    console.error('[ENTANGLED v2] updateServiceConfig:', err);
    return res.status(500).json({ error: 'Error al guardar configuración' });
  }
};

// Cliente: ve sus % efectivos (con override aplicado si existe).
// Un asesor/admin puede consultar los de un cliente suyo pasando ?client_id=,
// para que la cotización muestre el % real que se le cobrará a ESE cliente
// (no el del asesor).
export const getMyServiceConfig = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  try {
    let targetUserId = userId;
    const clientId = Number((req.query?.client_id ?? '') as any);
    if (Number.isFinite(clientId) && clientId > 0 && clientId !== userId) {
      if (isAdminRole(req) || (await advisorOwnsClient(userId, clientId))) {
        targetUserId = clientId;
      }
    }
    const conFactura = await resolveClientFinalCommission(targetUserId, 'pago_con_factura');
    const sinFactura = await resolveClientFinalCommission(targetUserId, 'pago_sin_factura');
    return res.json({
      pago_con_factura: {
        comision_porcentaje: conFactura.porcentaje,
        es_override: conFactura.es_override,
      },
      pago_sin_factura: {
        comision_porcentaje: sinFactura.porcentaje,
        es_override: sinFactura.es_override,
      },
    });
  } catch (err) {
    console.error('[ENTANGLED v2] getMyServiceConfig:', err);
    return res.status(500).json({ error: 'Error al consultar configuración' });
  }
};

// ===========================================================================
// User service pricing (overrides por cliente, por servicio) — admin
// ===========================================================================

export const listUserServicePricing = async (req: Request, res: Response): Promise<any> => {
  if (!(await puedeEditarPrecioXpay(req))) return res.status(403).json({ error: 'Sin permisos' });
  try {
    const r = await pool.query(
      `SELECT usp.user_id, usp.servicio, usp.comision_porcentaje, usp.notes,
              usp.created_at, usp.updated_at,
              u.full_name AS client_name, u.email AS client_email
         FROM entangled_user_service_pricing usp
         JOIN users u ON u.id = usp.user_id
        ORDER BY u.full_name ASC NULLS LAST, u.email ASC, usp.servicio ASC`
    );
    return res.json(r.rows);
  } catch (err) {
    console.error('[ENTANGLED v2] listUserServicePricing:', err);
    return res.status(500).json({ error: 'Error al listar overrides' });
  }
};

export const upsertUserServicePricing = async (req: Request, res: Response): Promise<any> => {
  if (!(await puedeEditarPrecioXpay(req))) return res.status(403).json({ error: 'Sin permisos' });
  const adminId = getAuthUserId(req);
  const userId = Number(req.params.userId);
  const servicio = String(req.params.servicio) as EntangledServicio;
  const pct = Number(req.body?.comision_porcentaje);
  const notes = req.body?.notes || null;
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ error: 'userId inválido' });
  }
  if (!SERVICIOS_VALIDOS.includes(servicio)) {
    return res.status(400).json({ error: 'servicio inválido' });
  }
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return res.status(400).json({ error: 'comision_porcentaje debe estar entre 0 y 100' });
  }
  try {
    const r = await pool.query(
      `INSERT INTO entangled_user_service_pricing (user_id, servicio, comision_porcentaje, notes, set_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, servicio) DO UPDATE SET
         comision_porcentaje = EXCLUDED.comision_porcentaje,
         notes = EXCLUDED.notes,
         set_by = EXCLUDED.set_by,
         updated_at = NOW()
       RETURNING *`,
      [userId, servicio, pct, notes, adminId]
    );
    return res.json(r.rows[0]);
  } catch (err) {
    console.error('[ENTANGLED v2] upsertUserServicePricing:', err);
    return res.status(500).json({ error: 'Error al guardar override' });
  }
};

export const deleteUserServicePricing = async (req: Request, res: Response): Promise<any> => {
  if (!(await puedeEditarPrecioXpay(req))) return res.status(403).json({ error: 'Sin permisos' });
  const userId = Number(req.params.userId);
  const servicio = String(req.params.servicio) as EntangledServicio;
  if (!Number.isFinite(userId) || !SERVICIOS_VALIDOS.includes(servicio)) {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }
  try {
    await pool.query(
      `DELETE FROM entangled_user_service_pricing WHERE user_id = $1 AND servicio = $2`,
      [userId, servicio]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[ENTANGLED v2] deleteUserServicePricing:', err);
    return res.status(500).json({ error: 'Error al borrar override' });
  }
};

// ===========================================================================
// WEBHOOKS v2 — RAW BODY + HMAC SHA-256
// ===========================================================================
// IMPORTANTE: estas rutas se montan con `express.raw({ type: 'application/json' })`
// ANTES de express.json(). El body llega como Buffer en req.body.
// ===========================================================================

const verifyWebhookSignature = (
  rawBody: Buffer,
  signatureHeader: string | undefined
): { ok: boolean; reason?: string } => {
  if (!ENTANGLED_WEBHOOK_SECRET) {
    console.warn('[ENTANGLED v2] ENTANGLED_WEBHOOK_SECRET no configurado: aceptando webhook sin verificar');
    return { ok: true };
  }
  if (!signatureHeader) return { ok: false, reason: 'Falta cabecera X-Entangled-Signature' };
  if (!rawBody || rawBody.length === 0) return { ok: false, reason: 'Body vacío' };
  const expected = crypto
    .createHmac('sha256', ENTANGLED_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  const provided = signatureHeader.replace(/^sha256=/i, '').trim();
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(expected, 'hex');
    b = Buffer.from(provided, 'hex');
  } catch {
    return { ok: false, reason: 'Firma malformada' };
  }
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'Firma inválida' };
  }
  return { ok: true };
};

const logWebhook = async (
  transaccionId: string | null,
  evento: string | null,
  payload: any,
  requestId: number | null,
  processError: string | null = null
) => {
  try {
    await pool.query(
      `INSERT INTO entangled_webhook_logs
         (request_id, transaccion_id, evento, payload, processed, process_error)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [
        requestId,
        transaccionId,
        evento,
        JSON.stringify(payload || {}),
        !processError,
        processError,
      ]
    );
  } catch (err) {
    console.error('[ENTANGLED v2] No se pudo registrar webhook log:', err);
  }
};

// Helpers para parsear el raw body después de validar la firma
const parseRawJson = (rawBody: Buffer): any => {
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    return null;
  }
};

// POST /api/entangled/webhook/factura-generada
export const webhookFacturaGeneradaV2 = async (
  req: Request,
  res: Response
): Promise<any> => {
  // Express.json captura raw body en req.rawBody (verify callback global).
  const raw: Buffer = ((req as any).rawBody as Buffer) || Buffer.from(JSON.stringify(req.body || {}));
  const sig = (req.headers['x-entangled-signature'] || req.headers['x-signature']) as
    | string
    | undefined;
  const verify = verifyWebhookSignature(raw, sig);
  const payload = parseRawJson(raw) || req.body || {};
  if (!verify.ok) {
    await logWebhook(null, 'factura.generada', payload, null, verify.reason || 'firma');
    return res.status(401).json({ error: verify.reason || 'No autorizado' });
  }

  const transaccionId = payload.transaccion_id || null;
  const evento = payload.evento || 'factura.generada';
  if (!transaccionId) {
    await logWebhook(null, evento, payload, null, 'transaccion_id faltante');
    return res.status(400).json({ error: 'transaccion_id requerido' });
  }

  try {
    const found = await pool.query(
      `SELECT id, servicio FROM entangled_payment_requests
        WHERE entangled_transaccion_id = $1`,
      [transaccionId]
    );
    if (found.rows.length === 0) {
      await logWebhook(transaccionId, evento, payload, null, 'request no encontrada');
      return res.status(200).json({ ok: true, ignored: true });
    }
    const requestId = found.rows[0].id;
    const docs = payload.documentos || {};
    const facturaUrl = docs.factura_pdf || docs.url_factura_pdf || null;
    const facturaXmlUrl = docs.factura_xml || docs.url_factura_xml || null;

    await pool.query(
      `UPDATE entangled_payment_requests
          SET factura_url = COALESCE($1, factura_url),
              factura_nombre_archivo = COALESCE($2, factura_nombre_archivo),
              factura_emitida_at = NOW(),
              estatus_factura = 'emitida',
              estatus_global = CASE
                WHEN estatus_proveedor = 'completado' THEN 'completado'
                ELSE 'en_proceso'
              END,
              raw_response = COALESCE(raw_response, '{}'::jsonb) || jsonb_build_object('factura_xml_url', $3::text),
              es_hibrida = COALESCE($5, es_hibrida),
              es_pesos = COALESCE($6, es_pesos),
              last_webhook_at = NOW(),
              updated_at = NOW()
        WHERE id = $4`,
      [facturaUrl, docs.nombre_archivo || null, facturaXmlUrl, requestId,
       payload.es_hibrida != null ? Boolean(payload.es_hibrida) : null,
       payload.es_pesos != null ? Boolean(payload.es_pesos) : null]
    );


    // Misma razón que en el webhook del proveedor: esta es la otra vía por la
    // que la operación llega a 'completado' (factura emitida con el proveedor
    // ya pagado). Si la comisión no se generó antes por falta de datos, aquí
    // se recupera. Idempotente.
    generateXpayCommission(Number(requestId)).catch((e: any) =>
      console.error('[ENTANGLED v2] Error comisión XPAY (webhook factura):', e));
    await logWebhook(transaccionId, evento, payload, requestId);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[ENTANGLED v2] webhookFacturaGenerada error:', err);
    await logWebhook(transaccionId, evento, payload, null, (err as Error).message);
    return res.status(500).json({ error: 'Error procesando webhook' });
  }
};

// POST /api/entangled/webhook/pago-proveedor
export const webhookPagoProveedorV2 = async (
  req: Request,
  res: Response
): Promise<any> => {
  const raw: Buffer = ((req as any).rawBody as Buffer) || Buffer.from(JSON.stringify(req.body || {}));
  const sig = (req.headers['x-entangled-signature'] || req.headers['x-signature']) as
    | string
    | undefined;
  const verify = verifyWebhookSignature(raw, sig);
  const payload = parseRawJson(raw) || req.body || {};
  if (!verify.ok) {
    await logWebhook(null, 'pago.proveedor.confirmado', payload, null, verify.reason || 'firma');
    return res.status(401).json({ error: verify.reason || 'No autorizado' });
  }

  const transaccionId = payload.transaccion_id || null;
  const evento = payload.evento || 'pago.proveedor.confirmado';
  if (!transaccionId) {
    await logWebhook(null, evento, payload, null, 'transaccion_id faltante');
    return res.status(400).json({ error: 'transaccion_id requerido' });
  }

  try {
    const found = await pool.query(
      `SELECT id, servicio FROM entangled_payment_requests
        WHERE entangled_transaccion_id = $1`,
      [transaccionId]
    );
    if (found.rows.length === 0) {
      await logWebhook(transaccionId, evento, payload, null, 'request no encontrada');
      return res.status(200).json({ ok: true, ignored: true });
    }
    const requestId = found.rows[0].id;
    const servicio = found.rows[0].servicio as EntangledServicio;
    const docs = payload.documentos || {};
    const detalles = payload.detalles || {};
    const comprobanteUrl = docs.comprobante_proveedor || docs.url_comprobante_proveedor || null;
    const moneda = detalles.moneda_enviada || null;
    const monto = detalles.monto_enviado != null ? Number(detalles.monto_enviado) : null;
    const cuenta = detalles.cuenta_destino || null;
    const estatus = String(payload.estatus || detalles.estatus || 'completado').toLowerCase();

    // 🆕 Señal "solicitada" (nuevo evento de Entangled sobre el MISMO webhook):
    // la operación ya fue APROBADA y entró a proceso de pago — paso previo a la
    // confirmación de pago a proveedor. Solo reflejamos el estatus global; NO
    // tocamos los datos de pago al proveedor ni marcamos proveedor_pagado_at.
    // No degrada estados terminales (completado/cancelado/rechazado).
    if (estatus === 'solicitada' || String(evento).toLowerCase() === 'solicitada') {
      await pool.query(
        `UPDATE entangled_payment_requests
            SET estatus_global = CASE
                  WHEN estatus_global IN ('completado', 'cancelado', 'rechazado') THEN estatus_global
                  ELSE 'solicitada'
                END,
                es_hibrida = COALESCE($2, es_hibrida),
                es_pesos = COALESCE($3, es_pesos),
                last_webhook_at = NOW(),
                updated_at = NOW()
          WHERE id = $1`,
        [requestId, payload.es_hibrida != null ? Boolean(payload.es_hibrida) : null,
         payload.es_pesos != null ? Boolean(payload.es_pesos) : null]
      );
      // 📧 Notificar por correo a la lista configurada cuando una operación
      // HÍBRIDA entra en "solicitada" (una sola vez, dedup por columna).
      try {
        await pool.query(`ALTER TABLE entangled_payment_requests ADD COLUMN IF NOT EXISTS solicitada_notified_at TIMESTAMPTZ`).catch(() => {});
        const info = await pool.query(
          `SELECT er.es_hibrida, er.solicitada_notified_at, ${XPAY_SOLICITADA_EMAIL_SELECT}
             FROM entangled_payment_requests er
             LEFT JOIN users u ON u.id = er.advisor_id
            WHERE er.id = $1`,
          [requestId]
        );
        const r0 = info.rows[0];
        if (r0 && r0.es_hibrida === true && !r0.solicitada_notified_at) {
          const cfg = await pool.query(
            `SELECT config_value FROM system_configurations WHERE config_key = 'xpay_solicitada_notify_emails' AND is_active = TRUE`
          );
          const emails: string[] = Array.isArray(cfg.rows[0]?.config_value?.emails) ? cfg.rows[0].config_value.emails : [];
          if (emails.length > 0) {
            const { sendEmail } = await import('./emailService');
            const { subject, html } = buildXpaySolicitadaEmail(r0);
            for (const em of emails) { await sendEmail(em, subject, html).catch(() => {}); }
          }
          await pool.query(`UPDATE entangled_payment_requests SET solicitada_notified_at = NOW() WHERE id = $1`, [requestId]).catch(() => {});
        }
      } catch (notifyErr) {
        console.warn('[xpay solicitada notify]', (notifyErr as Error).message);
      }
      await logWebhook(transaccionId, evento, payload, requestId);
      return res.status(200).json({ ok: true, estatus: 'solicitada' });
    }

    // El estatus global se completa cuando:
    //  - servicio sin factura: con que llegue este webhook con estatus 'completado'
    //  - servicio con factura: cuando ADEMÁS factura ya está emitida
    // NOTA: se usan casts explícitos ($1::text, $6::text, $8::boolean, $9::boolean)
    // porque el mismo parámetro se usa en SET y en CASE WHEN. Sin cast,
    // node-pg envía el tipo inferido inicialmente y Postgres rechaza con
    // "inconsistent types deduced for parameter $1".
    await pool.query(
      `UPDATE entangled_payment_requests
          SET estatus_proveedor = $1::text,
              comprobante_proveedor_url = COALESCE($2::text, comprobante_proveedor_url),
              proveedor_moneda_enviada = COALESCE($3::text, proveedor_moneda_enviada),
              proveedor_monto_enviado = COALESCE($4::numeric, proveedor_monto_enviado),
              proveedor_cuenta_destino = COALESCE($5::text, proveedor_cuenta_destino),
              proveedor_pagado_at = NOW(),
              estatus_global = CASE
                WHEN $1::text = 'completado' AND ($6::text = 'pago_sin_factura' OR estatus_factura = 'emitida') THEN 'completado'
                WHEN $1::text = 'rechazado' THEN 'rechazado'
                ELSE 'en_proceso'
              END,
              es_hibrida = COALESCE($8::boolean, es_hibrida),
              es_pesos = COALESCE($9::boolean, es_pesos),
              last_webhook_at = NOW(),
              updated_at = NOW()
        WHERE id = $7::int`,
      [estatus, comprobanteUrl, moneda, monto, cuenta, servicio, requestId,
       payload.es_hibrida != null ? Boolean(payload.es_hibrida) : null,
       payload.es_pesos != null ? Boolean(payload.es_pesos) : null]
    );


    // 💸 La comisión XPAY se generaba solo al subir el comprobante y al
    // sincronizar con ENTANGLED — ambos ANTES de que la operación esté
    // completa. Si en ese momento faltaba el tc_cliente_final o el
    // comision_entregax, la fórmula daba 0, el INSERT se descartaba por el
    // filtro `> 0.01` y nadie volvía a intentarlo: el asesor se quedaba sin su
    // comisión aunque el envío se completara (TKT-2026-2205). Aquí el pago al
    // proveedor ya está confirmado y los porcentajes definidos, que es el
    // momento correcto. generateXpayCommission es idempotente (ON CONFLICT).
    generateXpayCommission(Number(requestId)).catch((e: any) =>
      console.error('[ENTANGLED v2] Error comisión XPAY (webhook proveedor):', e));
    await logWebhook(transaccionId, evento, payload, requestId);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[ENTANGLED v2] webhookPagoProveedor error:', err);
    await logWebhook(transaccionId, evento, payload, null, (err as Error).message);
    return res.status(500).json({ error: 'Error procesando webhook' });
  }
};

// ===========================================================================
// POST /api/entangled/webhook/ordenes   (webhook_ordenes — dirigido a asesores)
// Eventos: orden.cancelada (venció el congelamiento) y orden.cuenta.cambiada
// (se apagó la cuenta de depósito de una orden pendiente y se reubicó).
// ===========================================================================
export const webhookOrdenesV2 = async (req: Request, res: Response): Promise<any> => {
  const raw: Buffer = ((req as any).rawBody as Buffer) || Buffer.from(JSON.stringify(req.body || {}));
  const sig = (req.headers['x-entangled-signature'] || req.headers['x-signature']) as string | undefined;
  const verify = verifyWebhookSignature(raw, sig);
  const payload = parseRawJson(raw) || req.body || {};
  const evento = payload.evento || 'orden.desconocido';
  if (!verify.ok) {
    await logWebhook(null, evento, payload, null, verify.reason || 'firma');
    return res.status(401).json({ error: verify.reason || 'No autorizado' });
  }
  // El contrato usa `orden_id` (= nuestro entangled_transaccion_id).
  const ordenId = payload.orden_id || payload.transaccion_id || null;
  if (!ordenId) {
    await logWebhook(null, evento, payload, null, 'orden_id faltante');
    return res.status(400).json({ error: 'orden_id requerido' });
  }

  try {
    const found = await pool.query(
      `SELECT id, advisor_id, user_id, referencia_pago, empresas_asignadas
         FROM entangled_payment_requests
        WHERE entangled_transaccion_id = $1`,
      [ordenId]
    );
    if (found.rows.length === 0) {
      await logWebhook(ordenId, evento, payload, null, 'request no encontrada');
      return res.status(200).json({ ok: true, ignored: true });
    }
    const row = found.rows[0];
    const requestId = row.id;
    const ref = row.referencia_pago || `XP${String(requestId).padStart(6, '0')}`;

    if (evento === 'orden.cancelada') {
      await pool.query(
        `UPDATE entangled_payment_requests
            SET estatus_global = 'cancelado',
                error_message = $1,
                last_webhook_at = NOW(),
                updated_at = NOW()
          WHERE id = $2`,
        [payload.motivo || 'congelamiento_vencido', requestId]
      );
      // Avisar al asesor (si la operación la creó/atiende un asesor)
      if (row.advisor_id) {
        try {
          await pool.query(
            `INSERT INTO notifications (user_id, title, message, type, icon, data)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
            [
              row.advisor_id,
              'X-Pay: orden cancelada',
              `La orden ${ref} se canceló (${payload.motivo || 'congelamiento vencido'}).`,
              'xpay_orden_cancelada',
              '⚠️',
              JSON.stringify({ request_id: requestId, orden_id: ordenId, motivo: payload.motivo || null }),
            ]
          );
        } catch (nErr) { console.warn('[XPAY] notif orden.cancelada:', (nErr as Error).message); }
      }
      await logWebhook(ordenId, evento, payload, requestId);
      return res.status(200).json({ ok: true });
    }

    if (evento === 'orden.cuenta.cambiada') {
      const cuentaNueva = payload.cuenta_nueva || null;
      const requiereManual = payload.requiere_reasignacion_manual === true || !cuentaNueva;
      // Actualizar la cuenta de depósito de la orden (misma comercializadora).
      let empresas: any[] = Array.isArray(row.empresas_asignadas) ? row.empresas_asignadas : [];
      if (cuentaNueva) {
        if (empresas.length > 0) empresas[0] = { ...empresas[0], cuenta_bancaria: cuentaNueva };
        else empresas = [{ cuenta_bancaria: cuentaNueva }];
      }
      await pool.query(
        `UPDATE entangled_payment_requests
            SET empresas_asignadas = $1::jsonb,
                error_message = CASE WHEN $2 THEN 'requiere_reasignacion_manual' ELSE error_message END,
                last_webhook_at = NOW(),
                updated_at = NOW()
          WHERE id = $3`,
        [JSON.stringify(empresas), requiereManual, requestId]
      );
      // Avisar al asesor: el cliente debe pagar a la cuenta nueva (o contactar).
      if (row.advisor_id) {
        try {
          const msg = cuentaNueva
            ? `La cuenta de depósito de la orden ${ref} cambió. El cliente debe pagar a la nueva cuenta (${cuentaNueva.banco || ''} ${cuentaNueva.clabe || cuentaNueva.cuenta || ''}).`
            : `La cuenta de la orden ${ref} se desactivó y no hay cuenta alterna. Requiere reasignación manual (contactar a ENTANGLED).`;
          await pool.query(
            `INSERT INTO notifications (user_id, title, message, type, icon, data)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
            [
              row.advisor_id,
              'X-Pay: cuenta de depósito cambiada',
              msg,
              'xpay_cuenta_cambiada',
              '🏦',
              JSON.stringify({ request_id: requestId, orden_id: ordenId, cuenta_nueva: cuentaNueva, requiere_reasignacion_manual: requiereManual }),
            ]
          );
        } catch (nErr) { console.warn('[XPAY] notif orden.cuenta.cambiada:', (nErr as Error).message); }
      }
      await logWebhook(ordenId, evento, payload, requestId);
      return res.status(200).json({ ok: true });
    }

    // Evento no manejado → registrar y aceptar.
    await logWebhook(ordenId, evento, payload, requestId, 'evento no manejado');
    return res.status(200).json({ ok: true, ignored: true });
  } catch (err) {
    console.error('[ENTANGLED v2] webhookOrdenes error:', err);
    await logWebhook(ordenId, evento, payload, null, (err as Error).message);
    return res.status(500).json({ error: 'Error procesando webhook' });
  }
};

// ===========================================================================
// POST /api/admin/entangled/rotate-api-key
// ===========================================================================
export const rotateApiKeyAdmin = async (req: Request, res: Response): Promise<any> => {
  if (!isAdminRole(req)) return res.status(403).json({ error: 'Sin permisos' });
  const r = await rotateApiKey();
  if (!r.ok) return res.status(502).json({ error: r.error });
  // No exponemos la nueva API key en la respuesta del cliente; queda para que el
  // admin la copie del log seguro o sea inyectada a env por DevOps.
  console.log('[ENTANGLED v2] API KEY rotada. Actualizar ENTANGLED_API_KEY en variables de entorno.');
  return res.json({
    ok: true,
    rotated_at: r.rotated_at || new Date().toISOString(),
    message:
      'Se solicitó la rotación. Actualiza ENTANGLED_API_KEY en las variables de entorno con la nueva clave.',
    new_api_key_preview: r.new_api_key
      ? `${String(r.new_api_key).slice(0, 6)}***${String(r.new_api_key).slice(-4)}`
      : undefined,
    new_api_key: r.new_api_key, // accesible sólo a super_admin/admin/director
  });
};

// ===========================================================================
// POST /api/admin/entangled/providers/sync
// Sincroniza la tabla entangled_providers con el listado real del API ENTANGLED
// (/v1/proveedores). Hace upsert por external_id (UUID remoto), actualiza
// nombre/descripcion/tarifas y desactiva los proveedores que ya no existen
// en el remoto.
// ===========================================================================
// Fusiona las comisiones normal/híbrida (endpoint /v1/comisiones) dentro de las
// tarifas de cada proveedor remoto (mutación in-place de p.tarifas), matcheando
// por nombre de proveedor + servicio_codigo. El valor puede ser número o
// "inactivo". Se usa en el sync manual y en el cron.
const mergeComisionesHibridas = async (proveedores: any[]): Promise<void> => {
  const resp = await listComisionesRemote();
  if (!resp.ok) return;
  const norm = (s: string) => String(s || '').trim().toUpperCase();
  const map: Record<string, Record<string, { normal: any; hibrida: any; pesos: any }>> = {};
  for (const cp of resp.proveedores || []) {
    const m: Record<string, { normal: any; hibrida: any; pesos: any }> = {};
    for (const s of cp.servicios || []) {
      m[norm(s.servicio)] = { normal: s.comision_normal_porcentaje, hibrida: s.comision_hibrida_porcentaje, pesos: s.comision_pesos_porcentaje };
    }
    map[norm(cp.proveedor)] = m;
  }
  for (const p of proveedores) {
    const svc = map[norm(p.nombre)] || {};
    p.tarifas = ((p.tarifas as any[]) || []).map((t: any) => {
      const hit: { normal?: any; hibrida?: any; pesos?: any } = svc[norm(t.servicio_codigo)] || {};
      return {
        ...t,
        comision_normal_porcentaje: hit.normal !== undefined ? hit.normal : t.comision_cliente_porcentaje,
        comision_hibrida_porcentaje: hit.hibrida !== undefined ? hit.hibrida : null,
        comision_pesos_porcentaje: hit.pesos !== undefined ? hit.pesos : null,
      };
    });
  }
};

export const syncProveedoresFromRemote = async (req: Request, res: Response): Promise<any> => {
  if (!isAdminRole(req)) return res.status(403).json({ error: 'Sin permisos' });
  if (!isEntangledConfigured()) return res.status(400).json({ error: 'ENTANGLED_API_KEY no configurada' });

  const remote = await listProveedoresRemote();
  if (!remote.ok) return res.status(502).json({ error: remote.error || 'Error consultando proveedores remotos' });

  // Tipo de cambio global (el API solo expone USD; RMB no está disponible y queda en 0)
  const tcUsdRes = await getTipoCambio('USD');
  const tcUsd = tcUsdRes.ok && tcUsdRes.tipo_cambio != null ? Number(tcUsdRes.tipo_cambio) : 0;
  const tcRmbRes = await getTipoCambio('RMB' as any).catch(() => ({ ok: false, tipo_cambio: 0 } as any));
  const tcRmb = tcRmbRes.ok && tcRmbRes.tipo_cambio != null ? Number(tcRmbRes.tipo_cambio) : 0;

  const proveedores = remote.proveedores || [];
  // Fusiona comisiones normal/híbrida (endpoint /v1/comisiones) en p.tarifas.
  await mergeComisionesHibridas(proveedores);

  const summary = {
    total_remotos: proveedores.length,
    inserted: 0,
    updated: 0,
    deactivated: 0,
    activos_externos: [] as string[],
    detalles: [] as any[],
  };

  // 1) Upsert por external_id
  for (const p of proveedores) {
    summary.activos_externos.push(p.id);
    // ¿Ya existe?
    const existing = await pool.query(
      `SELECT id, name, descripcion, tarifas FROM entangled_providers WHERE external_id = $1`,
      [p.id]
    );
    const pctConFactura = (() => {
      const t = (p.tarifas || []).find((x: any) => x.servicio_codigo === 'pago_con_factura');
      return t && t.comision_cliente_porcentaje != null ? Number(t.comision_cliente_porcentaje) : 0;
    })();
    // Nuevos campos del API (post-update ENTANGLED): tipos_cambio, costo_operacion, monto_minimo por tarifa.
    // tipos_cambio.USD/RMB puede ser number (legacy) u objeto { modo, valor_efectivo, valor_base, ... }.
    const extractTC = (v: any): number | null => {
      if (v == null) return null;
      if (typeof v === 'number') return v;
      if (typeof v === 'object') {
        const ef = v.valor_efectivo ?? v.valor_base ?? v.valor;
        return ef != null ? Number(ef) : null;
      }
      return null;
    };
    const remoteUsd = extractTC(p.tipos_cambio?.USD);
    const remoteRmb = extractTC(p.tipos_cambio?.RMB);
    const provTcUsd = remoteUsd != null ? remoteUsd : tcUsd;
    const provTcRmb = remoteRmb != null ? remoteRmb : tcRmb;
    // Costo de operación: el API ahora lo expone por divisa { USD: {...}, RMB: {...} }.
    // Compat con formato legacy plano { porcentaje, monto_fijo, moneda }.
    const co: any = p.costo_operacion || {};
    const coUsd: any = co.USD || (String(co.moneda || 'USD').toUpperCase() === 'USD' ? co : null) || {};
    const coRmb: any = co.RMB || (String(co.moneda || '').toUpperCase() === 'RMB' ? co : null) || {};
    const costoOpFijoUsd = coUsd.monto_fijo != null ? Number(coUsd.monto_fijo) : 0;
    const costoOpPctUsd = coUsd.porcentaje != null ? Number(coUsd.porcentaje) : 0;
    const costoOpFijoRmb = coRmb.monto_fijo != null ? Number(coRmb.monto_fijo) : 0;
    const costoOpPctRmb = coRmb.porcentaje != null ? Number(coRmb.porcentaje) : 0;
    // Para compat con campos heredados (1 sola moneda)
    const costoOpFijo = costoOpFijoUsd;
    const costoOpPct = costoOpPctUsd;
    const costoOpMoneda = (co.moneda || 'USD').toString().slice(0, 8);
    // Mínimos: tomamos los del servicio "con factura"; si no hay, los del primero.
    const tarifaRef = (p.tarifas || []).find((x: any) => x.servicio_codigo === 'pago_con_factura') || (p.tarifas || [])[0];
    const minUsd = tarifaRef?.monto_minimo?.USD != null ? Number(tarifaRef.monto_minimo.USD) : 0;
    const minRmb = tarifaRef?.monto_minimo?.RMB != null ? Number(tarifaRef.monto_minimo.RMB) : 0;
    if (existing.rows.length > 0) {
      const r = await pool.query(
        `UPDATE entangled_providers
            SET name = $1,
                descripcion = $2,
                tarifas = $3::jsonb,
                tipo_cambio_usd = $5,
                tipo_cambio_rmb = $6,
                porcentaje_compra = $7,
                total_empresas_activas = $8,
                remote_activo = $9,
                is_active = $9,
                costo_operacion_usd = $10,
                costo_operacion_porcentaje = $11,
                costo_operacion_moneda = $12,
                min_operacion_usd = $13,
                min_operacion_rmb = $14,
                costo_operacion_rmb = $15,
                costo_operacion_porcentaje_rmb = $16,
                last_synced_at = NOW(),
                updated_at = NOW()
          WHERE external_id = $4
          RETURNING id, name, external_id, is_default, total_empresas_activas`,
        [
          p.nombre,
          p.descripcion ?? null,
          JSON.stringify(p.tarifas || []),
          p.id,
          provTcUsd,
          provTcRmb,
          pctConFactura,
          Number(p.total_empresas_activas ?? 0) || 0,
          p.activo !== false,
          costoOpFijo,
          costoOpPct,
          costoOpMoneda,
          minUsd,
          minRmb,
          costoOpFijoRmb,
          costoOpPctRmb,
        ]
      );
      summary.updated++;
      summary.detalles.push({ action: 'updated', ...r.rows[0] });
    } else {
      // Insert. El primero recibido se marca como default si no hay default activo
      const hasDefault = await pool.query(
        `SELECT 1 FROM entangled_providers WHERE is_default = true AND is_active = true LIMIT 1`
      );
      const isDefault = hasDefault.rows.length === 0;
      const r = await pool.query(
        `INSERT INTO entangled_providers
           (name, code, external_id, descripcion, tarifas,
            tipo_cambio_usd, tipo_cambio_rmb, porcentaje_compra,
            total_empresas_activas, remote_activo,
            costo_operacion_usd, costo_operacion_porcentaje, costo_operacion_moneda,
            min_operacion_usd, min_operacion_rmb,
            costo_operacion_rmb, costo_operacion_porcentaje_rmb,
            is_active, is_default, sort_order, last_synced_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $7, $8, $9, $10, $11,
                 $12, $13, $14, $15, $16,
                 $17, $18,
                 $11, $6, 0, NOW(), NOW(), NOW())
         RETURNING id, name, external_id, is_default, total_empresas_activas`,
        [
          p.nombre,
          (p.nombre || '').toUpperCase().slice(0, 16).replace(/[^A-Z0-9]/g, ''),
          p.id,
          p.descripcion ?? null,
          JSON.stringify(p.tarifas || []),
          isDefault,
          provTcUsd,
          provTcRmb,
          pctConFactura,
          Number(p.total_empresas_activas ?? 0) || 0,
          p.activo !== false,
          costoOpFijo,
          costoOpPct,
          costoOpMoneda,
          minUsd,
          minRmb,
          costoOpFijoRmb,
          costoOpPctRmb,
        ]
      );
      summary.inserted++;
      summary.detalles.push({ action: 'inserted', ...r.rows[0] });
    }
  }

  // 2) Desactivar proveedores que YA NO están en el remoto.
  //    Sólo desactivamos los que SÍ tenían external_id (vinieron de sync) o legacy
  //    sin external_id. No los borramos por integridad referencial con
  //    entangled_payment_requests.
  if (summary.activos_externos.length > 0) {
    const deact = await pool.query(
      `UPDATE entangled_providers
          SET is_active = false, is_default = false, updated_at = NOW()
        WHERE is_active = true
          AND (external_id IS NULL OR external_id <> ALL($1::text[]))
        RETURNING id, name, external_id`,
      [summary.activos_externos]
    );
    summary.deactivated = deact.rows.length;
    summary.detalles.push(...deact.rows.map(r => ({ action: 'deactivated', ...r })));
  } else {
    // Si remoto no devolvió ninguno, no desactivamos nada (precaución)
  }

  // 3) Si después del sync no hay default activo, marcar el primero activo
  const def = await pool.query(
    `SELECT id FROM entangled_providers WHERE is_active = true AND is_default = true LIMIT 1`
  );
  if (def.rows.length === 0) {
    const first = await pool.query(
      `SELECT id FROM entangled_providers WHERE is_active = true ORDER BY id ASC LIMIT 1`
    );
    if (first.rows.length > 0) {
      await pool.query(`UPDATE entangled_providers SET is_default = true WHERE id = $1`, [first.rows[0].id]);
    }
  }

  return res.json({ ok: true, ...summary, raw: remote.raw });
};

// ---------------------------------------------------------------------------
// Sync interno para cron — misma lógica que syncProveedoresFromRemote
// pero sin req/res para poder llamarse desde cronJobs.ts
// ---------------------------------------------------------------------------
export const syncEntangledForCron = async (): Promise<{ ok: boolean; updated: number; inserted: number; error?: string }> => {
  if (!isEntangledConfigured()) return { ok: false, updated: 0, inserted: 0, error: 'ENTANGLED_API_KEY no configurada' };

  const remote = await listProveedoresRemote();
  if (!remote.ok) return { ok: false, updated: 0, inserted: 0, error: remote.error || 'Error remoto' };

  const tcUsdRes = await getTipoCambio('USD');
  const tcUsd = tcUsdRes.ok && tcUsdRes.tipo_cambio != null ? Number(tcUsdRes.tipo_cambio) : 0;
  const tcRmbRes = await getTipoCambio('RMB' as any).catch(() => ({ ok: false, tipo_cambio: 0 } as any));
  const tcRmb = tcRmbRes.ok && tcRmbRes.tipo_cambio != null ? Number(tcRmbRes.tipo_cambio) : 0;

  const proveedores = remote.proveedores || [];
  await mergeComisionesHibridas(proveedores);
  let inserted = 0; let updated = 0;
  const activosExternos: string[] = [];

  const extractTC = (v: any): number | null => {
    if (v == null) return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'object') { const ef = v.valor_efectivo ?? v.valor_base ?? v.valor; return ef != null ? Number(ef) : null; }
    return null;
  };

  for (const p of proveedores) {
    activosExternos.push(p.id);
    const existing = await pool.query(`SELECT id FROM entangled_providers WHERE external_id = $1`, [p.id]);
    const remoteUsd = extractTC(p.tipos_cambio?.USD);
    const remoteRmb = extractTC(p.tipos_cambio?.RMB);
    const provTcUsd = remoteUsd != null ? remoteUsd : tcUsd;
    const provTcRmb = remoteRmb != null ? remoteRmb : tcRmb;

    // Extracción de campos compuestos (misma lógica que syncProveedoresFromRemote).
    // El API expone:
    //  - tarifas[]: con servicio_codigo (pago_con_factura, pago_sin_factura,
    //    pago_sin_factura_efectivo, ...). Se guardan TODAS.
    //  - costo_operacion.{USD,RMB}.{porcentaje, monto_fijo, moneda}
    //  - monto_minimo por tarifa (USD/RMB)
    const pctConFactura = (() => {
      const t = (p.tarifas || []).find((x: any) => x.servicio_codigo === 'pago_con_factura');
      return t && t.comision_cliente_porcentaje != null ? Number(t.comision_cliente_porcentaje) : 0;
    })();
    const co: any = p.costo_operacion || {};
    const coUsd: any = co.USD || (String(co.moneda || 'USD').toUpperCase() === 'USD' ? co : null) || {};
    const coRmb: any = co.RMB || (String(co.moneda || '').toUpperCase() === 'RMB' ? co : null) || {};
    const costoOpFijoUsd = coUsd.monto_fijo != null ? Number(coUsd.monto_fijo) : 0;
    const costoOpPctUsd = coUsd.porcentaje != null ? Number(coUsd.porcentaje) : 0;
    const costoOpFijoRmb = coRmb.monto_fijo != null ? Number(coRmb.monto_fijo) : 0;
    const costoOpPctRmb = coRmb.porcentaje != null ? Number(coRmb.porcentaje) : 0;
    const costoOpMoneda = (co.moneda || 'USD').toString().slice(0, 8);
    const tarifaRef = (p.tarifas || []).find((x: any) => x.servicio_codigo === 'pago_con_factura') || (p.tarifas || [])[0];
    const minUsd = tarifaRef?.monto_minimo?.USD != null ? Number(tarifaRef.monto_minimo.USD) : 0;
    const minRmb = tarifaRef?.monto_minimo?.RMB != null ? Number(tarifaRef.monto_minimo.RMB) : 0;

    if (existing.rows.length > 0) {
      // El cron horario refresca TODOS los campos que vienen del API (no solo
      // TC) para que cambios remotos en tarifas, costos, mínimos o estado activo
      // se reflejen sin necesidad de presionar manualmente "Sincronizar desde
      // API". Antes solo se actualizaban los tipos de cambio.
      await pool.query(
        `UPDATE entangled_providers
            SET name                            = $1,
                descripcion                     = $2,
                tarifas                         = $3::jsonb,
                tipo_cambio_usd                 = $5,
                tipo_cambio_rmb                 = $6,
                porcentaje_compra               = $7,
                total_empresas_activas          = $8,
                remote_activo                   = $9,
                is_active                       = $9,
                costo_operacion_usd             = $10,
                costo_operacion_porcentaje      = $11,
                costo_operacion_moneda          = $12,
                min_operacion_usd               = $13,
                min_operacion_rmb               = $14,
                costo_operacion_rmb             = $15,
                costo_operacion_porcentaje_rmb  = $16,
                last_synced_at                  = NOW(),
                updated_at                      = NOW()
          WHERE external_id = $4`,
        [
          p.nombre,
          p.descripcion ?? null,
          JSON.stringify(p.tarifas || []),
          p.id,
          provTcUsd,
          provTcRmb,
          pctConFactura,
          Number(p.total_empresas_activas ?? 0) || 0,
          p.activo !== false,
          costoOpFijoUsd,
          costoOpPctUsd,
          costoOpMoneda,
          minUsd,
          minRmb,
          costoOpFijoRmb,
          costoOpPctRmb,
        ]
      );
      updated++;
    } else {
      await pool.query(
        `INSERT INTO entangled_providers (name, code, external_id, tipo_cambio_usd, tipo_cambio_rmb, is_active, is_default, sort_order, last_synced_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, NOW(), NOW(), NOW())`,
        [p.nombre, (p.nombre || '').toUpperCase().slice(0, 16).replace(/[^A-Z0-9]/g, ''), p.id, provTcUsd, provTcRmb, p.activo !== false, false]
      );
      inserted++;
    }
  }

  // Si no hay default activo, marcar el primero
  const def = await pool.query(`SELECT id FROM entangled_providers WHERE is_active=true AND is_default=true LIMIT 1`);
  if (def.rows.length === 0) {
    const first = await pool.query(`SELECT id FROM entangled_providers WHERE is_active=true ORDER BY id ASC LIMIT 1`);
    if (first.rows.length > 0) await pool.query(`UPDATE entangled_providers SET is_default=true WHERE id=$1`, [first.rows[0].id]);
  }

  return { ok: true, updated, inserted };
};

// ===========================================================================
// GET /api/entangled/clave-sat-history    — historial de claves SAT del usuario
// ===========================================================================
export const listClaveSatHistory = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  try {
    const r = await pool.query(
      `SELECT clave, descripcion, uses_count, last_used_at
         FROM entangled_clave_sat_history
        WHERE user_id = $1
        ORDER BY uses_count DESC, last_used_at DESC
        LIMIT 50`,
      [userId]
    );
    return res.json(r.rows);
  } catch (err) {
    console.error('[ENTANGLED] listClaveSatHistory:', err);
    return res.status(500).json({ error: 'Error al consultar historial' });
  }
};

// ===========================================================================
// XPAY ASESOR — el asesor crea operaciones a nombre de sus clientes asignados
// y el cliente les da seguimiento desde su Xpay.
// ===========================================================================

// Solo estos roles pueden usar las rutas de "asesor" de XPay.
//
// Hacía falta: las rutas solo pedían estar autenticado, y advisorOwnsClient
// acepta `referred_by_id`. Como los clientes pueden referir a otros clientes,
// un CLIENTE quedaba habilitado sobre sus referidos — y por esa vía sí podía
// fijar el % de comisión de la operación, que es justo lo que no debe poder
// tocar. Hoy hay 1 cliente con referidos, así que no se explotó, pero la
// puerta estaba abierta.
const ROLES_ASESOR_XPAY = ['advisor', 'sub_advisor', 'asesor', 'asesor_lider', 'admin', 'super_admin', 'director'];

const esAsesorXpay = (req: Request): boolean =>
  ROLES_ASESOR_XPAY.includes(String((req as any).user?.role || '').toLowerCase());

// Valida que un cliente pertenezca al asesor (advisor_id o referred_by_id).
const advisorOwnsClient = async (advisorId: number, clientId: number): Promise<boolean> => {
  const r = await pool.query(
    `SELECT 1 FROM users WHERE id = $1 AND role = 'client'
       AND (advisor_id = $2 OR referred_by_id = $2) LIMIT 1`,
    [clientId, advisorId]
  );
  return r.rows.length > 0;
};

// GET /api/advisor/xpay/clients?search= — clientes asignados al asesor (para el picker)
export const getAdvisorXpayClients = async (req: Request, res: Response): Promise<any> => {
  const advisorId = getAuthUserId(req);
  if (!advisorId) return res.status(401).json({ error: 'No autenticado' });
  if (!esAsesorXpay(req)) return res.status(403).json({ error: 'Solo asesores' });
  try {
    const search = String((req.query.search || '')).trim();
    const params: any[] = [advisorId];
    let where = `role = 'client' AND (advisor_id = $1 OR referred_by_id = $1)`;
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (full_name ILIKE $${params.length} OR box_id ILIKE $${params.length} OR email ILIKE $${params.length})`;
    }
    const r = await pool.query(
      `SELECT id, full_name, box_id, email, phone, is_verified
         FROM users WHERE ${where}
        ORDER BY NULLIF(regexp_replace(COALESCE(box_id,''), '\\D', '', 'g'), '')::bigint ASC NULLS LAST, full_name ASC
        LIMIT 100`,
      params
    );
    return res.json({ success: true, clients: r.rows });
  } catch (err: any) {
    console.error('[XPAY-ASESOR] getAdvisorXpayClients:', err.message);
    return res.status(500).json({ error: 'Error al listar clientes' });
  }
};

// POST /api/advisor/xpay/payment-requests — crea una operación Xpay a nombre de
// un cliente asignado (multipart, mismos campos que createPaymentRequestV2).
export const createAdvisorXpayRequest = async (req: Request, res: Response): Promise<any> => {
  const advisorId = getAuthUserId(req);
  if (!advisorId) return res.status(401).json({ error: 'No autenticado' });
  // Esta ruta permite fijar el % de comisión al cliente: se cierra a asesores.
  if (!esAsesorXpay(req)) return res.status(403).json({ error: 'Solo asesores pueden crear operaciones a nombre de un cliente' });
  const clientId = Number((req.body || {}).client_id);
  if (!Number.isFinite(clientId) || clientId <= 0) {
    return res.status(400).json({ error: 'client_id es requerido' });
  }
  const owns = await advisorOwnsClient(advisorId, clientId);
  if (!owns) {
    return res.status(403).json({ error: 'Ese cliente no está asignado a ti' });
  }
  // Reutiliza toda la lógica de creación, pero la operación queda a nombre del
  // cliente (owner) y con este asesor.
  return createPaymentRequestV2(req, res, { ownerUserId: clientId, advisorId });
};

// GET /api/advisor/xpay/payment-requests?client_id= — operaciones creadas por el
// asesor (opcionalmente filtradas por cliente).
export const getAdvisorXpayRequests = async (req: Request, res: Response): Promise<any> => {
  const advisorId = getAuthUserId(req);
  if (!advisorId) return res.status(401).json({ error: 'No autenticado' });
  if (!esAsesorXpay(req)) return res.status(403).json({ error: 'Solo asesores' });
  try {
    let params: any[];
    let where: string;
    const clientId = Number(req.query.client_id);
    if (Number.isFinite(clientId) && clientId > 0) {
      // Vista de un cliente específico: el asesor ve TODO el historial Xpay del
      // cliente (creado por el propio cliente o por cualquier asesor), siempre
      // que el cliente le pertenezca.
      const owns = await advisorOwnsClient(advisorId, clientId);
      if (!owns) return res.status(403).json({ error: 'Ese cliente no está asignado a ti' });
      params = [clientId];
      where = `r.user_id = $1`;
    } else {
      // Sin cliente: solo las operaciones que creó este asesor.
      params = [advisorId];
      where = `r.advisor_id = $1`;
    }
    const r = await pool.query(
      `SELECT r.id, r.referencia_pago, r.servicio, r.op_monto, r.op_divisa_destino,
              -- Conceptos con descripción, para que el PDF muestre el concepto
              -- y no la clave SAT.
              r.op_conceptos,
              r.op_beneficiario_nombre, r.estatus_global, r.estatus_factura, r.estatus_proveedor,
              -- Estatus para MOSTRAR. Pasadas las 24 h la orden se ve cancelada
              -- aunque siga viva: es la salida que nos deja no comprometernos si
              -- el TC se movió una barbaridad. El estatus real no se toca, si no
              -- el cliente perdería el botón de subir comprobante, que es
              -- justamente lo que la gracia le conserva hasta las 36.
              CASE WHEN r.estatus_global IN ('pendiente', 'esperando_comprobante')
                        AND r.payment_deadline_at IS NOT NULL
                        AND r.payment_deadline_at < NOW()
                   THEN 'cancelado' ELSE r.estatus_global END AS estatus_visible,
              r.created_at, r.user_id,
              r.entangled_transaccion_id,
              r.cf_rfc, r.cf_razon_social, r.cf_regimen_fiscal, r.cf_cp, r.cf_uso_cfdi, r.cf_email,
              r.op_comprobante_cliente_url, r.url_comprobante_cliente,
              r.comprobante_subido_at,
              r.payment_deadline_at,
              r.tc_cliente_final,
              r.error_message,
              r.factura_url, r.factura_emitida_at,
              (r.raw_response->>'factura_xml_url') AS factura_xml_url,
              r.comprobante_proveedor_url, r.proveedor_pagado_at,
              r.instructions_snapshot,
              u.full_name AS client_name, u.box_id AS client_box_id
         FROM entangled_payment_requests r
         LEFT JOIN users u ON u.id = r.user_id
        WHERE ${where}
        ORDER BY r.created_at DESC
        LIMIT 200`,
      params
    );
    const signed = await Promise.all(r.rows.map(signRowFileUrls));
    return res.json({ success: true, requests: signed });
  } catch (err: any) {
    console.error('[XPAY-ASESOR] getAdvisorXpayRequests:', err.message);
    return res.status(500).json({ error: 'Error al listar operaciones' });
  }
};

// DELETE /api/advisor/xpay/payment-requests/:id — el asesor borra una operación
// de un cliente asignado (para limpiar pruebas / errores). No se permite borrar
// operaciones que ya están en proceso o pagadas (dinero en movimiento).
export const deleteAdvisorXpayRequest = async (req: Request, res: Response): Promise<any> => {
  const advisorId = getAuthUserId(req);
  if (!advisorId) return res.status(401).json({ error: 'No autenticado' });
  if (!esAsesorXpay(req)) return res.status(403).json({ error: 'Solo asesores' });
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'id inválido' });
  try {
    const row = (await pool.query(
      `SELECT id, user_id, estatus_global, referencia_pago, entangled_transaccion_id
         FROM entangled_payment_requests WHERE id = $1`,
      [id]
    )).rows[0];
    if (!row) return res.status(404).json({ error: 'Operación no encontrada' });
    const owns = await advisorOwnsClient(advisorId, row.user_id);
    if (!owns) return res.status(403).json({ error: 'Esa operación no pertenece a un cliente asignado a ti' });
    const BLOCKED = ['en_proceso', 'completado', 'pagado', 'pagado_proveedor', 'finalizado', 'cancelado', 'rechazado'];
    if (BLOCKED.includes(String(row.estatus_global || ''))) {
      return res.status(409).json({ error: 'No puedes borrar una operación cancelada, en proceso o pagada' });
    }

    // 🔗 Si la orden YA existe en ENTANGLED hay que cancelarla allá ANTES de
    // borrarla aquí. Antes se borraba en duro sin avisarles: a nosotros nos
    // desaparecía y a ellos les quedaba una transacción huérfana viva, que
    // podía seguir esperando pago o llegar a facturarse.
    //
    // Si el aviso falla NO se borra: preferimos que el asesor reintente a
    // dejar una orden viva del otro lado sin rastro de este.
    if (row.entangled_transaccion_id) {
      const aviso = await notifyCancellationToEntangled(
        String(row.entangled_transaccion_id),
        'cancelado_por_asesor'
      );
      if (!aviso.ok) {
        console.error(
          `[XPAY-ASESOR] no se pudo cancelar ${row.referencia_pago} en ENTANGLED ` +
          `(transaccion ${row.entangled_transaccion_id}): ${aviso.error} — NO se borra`
        );
        return res.status(502).json({
          error: 'No se pudo cancelar la operación con el proveedor de pagos. Intenta de nuevo en unos minutos.',
          error_code: aviso.error || null,
        });
      }
      // ⚠️ notifyCancellationToEntangled devuelve ok:true con status 409 porque
      // para el cron ese caso es idempotente. Aquí NO lo es: 409 significa que
      // la orden ya no es cancelable de su lado (el cliente ya pagó, o ya
      // estaba cancelada). Borrarla aquí nos dejaría sin registro de una
      // operación viva o pagada allá.
      if (aviso.status === 409) {
        console.warn(
          `[XPAY-ASESOR] ENTANGLED respondió 409 para ${row.referencia_pago}: ${aviso.error} — NO se borra`
        );
        return res.status(409).json({
          error: 'Esta operación ya no se puede cancelar con el proveedor de pagos. Revisa si el cliente ya la pagó.',
          error_code: aviso.error || null,
        });
      }
      console.log(`[XPAY-ASESOR] ${row.referencia_pago} cancelada en ENTANGLED (transaccion ${row.entangled_transaccion_id})`);
    }

    await pool.query(`DELETE FROM entangled_payment_requests WHERE id = $1`, [id]);
    console.log(`[XPAY-ASESOR] asesor ${advisorId} borró operación ${row.referencia_pago} (id ${id}, estatus ${row.estatus_global}, transaccion ${row.entangled_transaccion_id || 'sin enviar'})`);
    return res.json({ success: true, deleted_id: id });
  } catch (err: any) {
    console.error('[XPAY-ASESOR] deleteAdvisorXpayRequest:', err.message);
    return res.status(500).json({ error: 'Error al borrar la operación' });
  }
};

// ── Proveedores Xpay del cliente, gestionados por su asesor ─────────────────
// El asesor opera la libreta de proveedores DEL CLIENTE (no la suya). Cada
// endpoint verifica que el cliente esté asignado al asesor y delega en los
// handlers base con ownerUserId = clienteId.
const resolveAdvisorClientId = async (
  req: Request,
  res: Response,
): Promise<number | null> => {
  const advisorId = getAuthUserId(req);
  if (!advisorId) { res.status(401).json({ error: 'No autenticado' }); return null; }
  const clientId = Number((req.query.client_id ?? (req.body || {}).client_id));
  if (!Number.isFinite(clientId) || clientId <= 0) {
    res.status(400).json({ error: 'client_id es requerido' });
    return null;
  }
  const owns = await advisorOwnsClient(advisorId, clientId);
  if (!owns) { res.status(403).json({ error: 'Ese cliente no está asignado a ti' }); return null; }
  return clientId;
};

// GET /api/advisor/xpay/suppliers?client_id=
export const getAdvisorXpaySuppliers = async (req: Request, res: Response): Promise<any> => {
  const clientId = await resolveAdvisorClientId(req, res);
  if (clientId == null) return;
  return listMySuppliers(req, res, { ownerUserId: clientId });
};

// POST /api/advisor/xpay/suppliers   (client_id en el body)
export const createAdvisorXpaySupplier = async (req: Request, res: Response): Promise<any> => {
  const clientId = await resolveAdvisorClientId(req, res);
  if (clientId == null) return;
  return createMySupplier(req, res, { ownerUserId: clientId });
};

// PUT /api/advisor/xpay/suppliers/:id?client_id=
export const updateAdvisorXpaySupplier = async (req: Request, res: Response): Promise<any> => {
  const clientId = await resolveAdvisorClientId(req, res);
  if (clientId == null) return;
  return updateMySupplier(req, res, { ownerUserId: clientId });
};

// DELETE /api/advisor/xpay/suppliers/:id?client_id=
export const deleteAdvisorXpaySupplier = async (req: Request, res: Response): Promise<any> => {
  const clientId = await resolveAdvisorClientId(req, res);
  if (clientId == null) return;
  return deleteMySupplier(req, res, { ownerUserId: clientId });
};

// ── Perfil fiscal del cliente, precargado/guardado por su asesor ───────────
// GET /api/advisor/xpay/fiscal-profile?client_id=
export const getAdvisorXpayFiscalProfile = async (req: Request, res: Response): Promise<any> => {
  const clientId = await resolveAdvisorClientId(req, res);
  if (clientId == null) return;
  return getMyFiscalProfile(req, res, { ownerUserId: clientId });
};

// PUT /api/advisor/xpay/fiscal-profile?client_id=
export const upsertAdvisorXpayFiscalProfile = async (req: Request, res: Response): Promise<any> => {
  const clientId = await resolveAdvisorClientId(req, res);
  if (clientId == null) return;
  return upsertMyFiscalProfile(req, res, { ownerUserId: clientId });
};
