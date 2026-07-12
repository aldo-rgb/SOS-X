/**
 * EntregaX Support Desk Controller
 * Sistema de soporte con IA (OpenAI) + escalamiento humano
 */

import { Request, Response } from 'express';
import { pool } from './db';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadToS3, isS3Configured, getSignedDownloadUrl, signS3UrlIfNeeded } from './s3Service';
import { sendPushToUsers } from './pushService';
import { sendTicketConfirmation, sendTicketResolved, sendQuoteRequestConfirmation, sendAdvisorQuotePending } from './whatsappService';

// ============================================================
// CONFIGURACIÓN DE MULTER PARA IMÁGENES DE SOPORTE
// ============================================================
// Estrategia: memoria + S3 (con fallback a disco si S3 no está configurado)
const supportUploadsDir = path.join(__dirname, '..', 'uploads', 'support');
try {
  if (!fs.existsSync(supportUploadsDir)) {
    fs.mkdirSync(supportUploadsDir, { recursive: true });
  }
} catch (e) {
  console.warn('⚠️ No se pudo crear directorio de uploads de soporte:', e);
}

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB por archivo
  fileFilter: (_req, file, cb) => {
    // Aceptar imágenes (incl. HEIC/HEIF), PDFs y Excel (xls/xlsx/csv)
    const allowedMime = /^image\/|^application\/pdf$|^application\/vnd\.ms-excel$|^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet$|^text\/csv$/.test(file.mimetype);
    cb(null, allowedMime);
  }
}).array('images', 10);

const wrapMulter = (req: Request, res: Response, next: Function) => {
  multerUpload(req, res, (err: any) => {
    if (err) console.warn('⚠️ Error de multer (ignorando):', err.message || err);
    next();
  });
};

export const uploadSupportImages = wrapMulter;
export const uploadAdminReplyFiles = wrapMulter;

// ============================================================
// CONFIGURACIÓN DE IA (OpenAI)
// ============================================================
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Prompt del sistema - Personalidad del asistente Cajito
const SYSTEM_PROMPT = `
ACTÚA COMO: Cajito, el asistente de EntregaX. Eres cercano, resolutivo y sabes mucho de logística.
CONTEXTO: Estás chateando por la app móvil con un cliente de EntregaX que necesita ayuda.

🔴 REGLAS DE ORO (MUY IMPORTANTES):
1. Te llamas Cajito. Preséntate como Cajito de EntregaX. Sé cálido y humano en el trato.
2. Habla en primera persona ("Déjame revisar", "Te ayudo", "Ya vi tu paquete").
3. Sé breve y casual, pero profesional. Como si escribieras por WhatsApp. Máximo 2-3 líneas por mensaje.
4. No uses listas con viñetas largas ni saludos robóticos. Nada de "Seleccione una opción".
5. Responde en el idioma del cliente (español de México por defecto).
6. ESCALAMIENTO (MUY IMPORTANTE): Nunca escales sin que el cliente lo CONFIRME. Si el cliente pide un humano, está frustrado, o no puedes resolver algo, PRIMERO pregunta si quiere que lo pases a NUESTRO EQUIPO DE ATENCIÓN AL CLIENTE, ofreciendo el selector: "¿Quieres que lo escale a nuestro equipo de atención al cliente?" [OPCIONES: Sí | No]. SOLO cuando el cliente responda que SÍ, incluye el marcador "[ESCALAR]" al final de tu mensaje. Di SIEMPRE "nuestro equipo de atención al cliente", NUNCA "un asesor" (los asesores son comerciales, no soporte). Si el cliente dice que no, sigue ayudándolo tú.

📊 USA LOS DATOS REALES DEL CLIENTE:
- Si el mensaje trae un bloque "[CONTEXTO DEL CLIENTE: ...]", esos son los datos REALES de este cliente (sus paquetes, saldos, asesor, tickets). ÚSALOS para responder con precisión.
- Ejemplo: si preguntan "¿dónde está mi paquete?" y en el contexto ves sus guías activas, dile el status real de cada una en vez de pedir el TRN. Solo pide el TRN si tiene muchos paquetes o no está claro cuál.
- Si preguntan por su saldo/pago, usa el monto real del contexto.
- Si preguntan "¿a qué dirección envío?" / "¿cuál es mi dirección de PO Box/casillero?", DA la dirección de envío del contexto (bodega + su casillero como Suite/Apt o Shipping Mark). Ya tienes esa dirección, NO digas que no tienes acceso. SIEMPRE que des una dirección, incluye también en el mismo mensaje las "Instrucciones de empaque" y "Cómo enviar" de ESE servicio (vienen en el contexto). Preséntalo claro y ordenado.
- Nunca inventes datos que no estén en el contexto. Si no tienes el dato, dilo y ofrece escalarlo.

📦 CONOCIMIENTO DE ENTREGAX:
- Aéreo China → México (TDI Aéreo): 7-12 días hábiles. TDI Express (aéreo directo a MTY): más rápido.
- Marítimo China → México: 35-45 días. Se cobra por CBM (cada 500 kg = 1 CBM; se cobra el mayor entre volumen y peso).
- Aéreo USA / PO Box → México: 5-8 días hábiles. Se cobra por peso volumétrico.
- Garantía Extendida (GEX): seguro opcional (~5% del valor) para proteger la carga.
- X-Pay: servicio para pagar a proveedores en China desde la app. En el contexto tienes el TIPO DE CAMBIO y la comisión vigentes de X-Pay: si preguntan "¿cuál es el TC de X-Pay?" o "¿cuánto pago por X USD?", RESPONDE con el tipo de cambio real y calcula el estimado con la fórmula del contexto. NO digas que no tienes acceso al tipo de cambio.
- Facturación: se solicita en la app, sección Mi Perfil > Datos Fiscales.
- Instrucciones de entrega: el cliente las asigna en su paquete para la última milla.

🔘 SELECTOR DE OPCIONES:
Cuando quieras que el cliente ELIJA de una lista, termina tu mensaje con un marcador EXACTO en una línea aparte, así:
[OPCIONES: Opción A | Opción B | Opción C]
La app lo convierte en botones que el cliente puede tocar. Úsalo para categorías, sí/no, tipo de servicio, etc. Escribe una sola pregunta breve arriba del marcador y NO repitas las opciones en el texto.

📋 REPORTAR UN PROBLEMA / RECLAMACIÓN:
Si el cliente quiere reportar un problema (dice "reportar un problema", "tengo un problema", "quiero una reclamación", etc.), NO respondas solo "ya tengo tu ticket". Reúne los datos de forma conversacional, de a uno por mensaje, en este orden:
1. Pregunta el tipo de problema y OFRECE EL SELECTOR:
   ¿Qué tipo de problema tienes?
   [OPCIONES: Rastreo | Retraso | Reportar Faltante | Garantía Extendida | Compensación | Cambio de instrucciones | Contabilidad | Error del Sistema | Otro]
2. Número de guía relacionado (pídelo solo si el problema aplica a una guía específica).
3. Descripción del problema (pide que lo cuente con detalle).
4. Ofrece adjuntar fotos (opcional) — el cliente puede usar el botón de imagen del chat.
Cuando ya tengas la categoría y la descripción, resume lo que registraste y PREGUNTA si quiere que lo escale: "¿Quieres que lo pase a nuestro equipo de atención al cliente para darle seguimiento?" [OPCIONES: Sí | No]. Solo si responde SÍ, incluye "[ESCALAR]". Si dice que no, ofrece seguir ayudando tú. No inventes folios de ticket ni digas "un asesor".

💡 RESPUESTAS TÍPICAS:
- "¿Dónde está mi paquete?" → Revisa el contexto y da el status real; si no, pide el TRN.
- "¿Cuánto cuesta?" → DA UN ESTIMADO con las TARIFAS del contexto (TODAS en USD). Marítimo: el CBM cobrable es el mayor entre volumen (m³) y peso÷500; multiplica por la tarifa USD/CBM del rango — si el cliente no dio el peso, PÍDESELO (lo necesitas por la regla 500 kg = 1 CBM). Aéreo: por peso volumétrico (USD/kg). Da el estimado en USD, aclara que es aproximado y que el exacto sale del Cotizador.
- "Necesito factura" → Se solicita en Mi Perfil > Datos Fiscales.
- "Mi paquete llegó roto" → Pide fotos y ofrece abrir reclamación (o escala).

TONO: Amigable, resolutivo y confiable. Un asistente que de verdad conoce a EntregaX y quiere ayudar.
`;

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

/**
 * GET /api/support/validate-tracking
 * Valida que un número de guía pertenezca al cliente autenticado
 */
export const validateTracking = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.userId || (req as any).user?.id;
    const tracking = (req.query.tracking as string || '').trim().toUpperCase();

    if (!tracking) {
      return res.status(400).json({ success: false, error: 'Número de guía requerido' });
    }

    // Obtener el box_id del usuario autenticado
    const userRes = await pool.query('SELECT box_id FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    const userBoxId = userRes.rows[0].box_id;

    // 1) Buscar en packages (Aéreo China/USA + PoBox)
    const pkgRes = await pool.query(
      `SELECT id, tracking_internal, child_no, box_id, user_id, description, status
       FROM packages 
       WHERE tracking_internal ILIKE $1 
          OR child_no ILIKE $1
          OR international_tracking ILIKE $1
       LIMIT 1`,
      [tracking]
    );

    if (pkgRes.rows.length > 0) {
      const pkg = pkgRes.rows[0];
      const belongsToUser =
        (pkg.box_id && pkg.box_id.toUpperCase() === (userBoxId || '').toUpperCase()) ||
        (pkg.user_id && pkg.user_id === userId);
      if (!belongsToUser) {
        return res.json({
          success: false,
          valid: false,
          error: `Guía no encontrada para tu número de cliente ${userBoxId}. Solo puedes crear tickets sobre tus propias guías.`,
        });
      }
      return res.json({
        success: true,
        valid: true,
        package: {
          tracking: pkg.tracking_internal,
          description: pkg.description,
          status: pkg.status,
          service: 'AEREO/POBOX',
        },
      });
    }

    // 2) Buscar en maritime_orders (Marítimo)
    const marRes = await pool.query(
      `SELECT id, ordersn, user_id, shipping_mark, goods_name, summary_description, status, expresscom, ship_number, container_number, bl_number
       FROM maritime_orders
       WHERE ordersn ILIKE $1
          OR expresscom ILIKE $1
          OR ship_number ILIKE $1
          OR container_number ILIKE $1
          OR bl_number ILIKE $1
       LIMIT 1`,
      [tracking]
    );

    if (marRes.rows.length > 0) {
      const m = marRes.rows[0];
      const belongsToUser =
        (m.user_id && m.user_id === userId) ||
        (m.shipping_mark && (m.shipping_mark || '').toUpperCase() === (userBoxId || '').toUpperCase());
      if (!belongsToUser) {
        return res.json({
          success: false,
          valid: false,
          error: `Guía no encontrada para tu número de cliente ${userBoxId}. Solo puedes crear tickets sobre tus propias guías.`,
        });
      }
      return res.json({
        success: true,
        valid: true,
        package: {
          tracking: m.ordersn,
          description: m.summary_description || m.goods_name,
          status: m.status,
          service: 'MARITIMO',
        },
      });
    }

    // 3) Buscar en dhl_packages (DHL)
    const dhlRes = await pool.query(
      `SELECT id, tracking_number, user_id, description, status, client_name
       FROM dhl_packages
       WHERE tracking_number ILIKE $1
       LIMIT 1`,
      [tracking]
    );

    if (dhlRes.rows.length > 0) {
      const d = dhlRes.rows[0];
      if (d.user_id && d.user_id !== userId) {
        return res.json({
          success: false,
          valid: false,
          error: `Guía no encontrada para tu número de cliente ${userBoxId}. Solo puedes crear tickets sobre tus propias guías.`,
        });
      }
      return res.json({
        success: true,
        valid: true,
        package: {
          tracking: d.tracking_number,
          description: d.description || d.client_name,
          status: d.status,
          service: 'DHL',
        },
      });
    }

    return res.json({
      success: false,
      valid: false,
      error: `Guía "${tracking}" no encontrada. Verifica el número e intenta de nuevo.`,
    });
  } catch (error) {
    console.error('Error validando tracking:', error);
    return res.status(500).json({ success: false, error: 'Error al validar guía' });
  }
};

/**
 * Genera un folio único para tickets
 */
async function generateTicketFolio(): Promise<string> {
  const result = await pool.query("SELECT nextval('ticket_sequence')");
  const num = result.rows[0].nextval;
  const year = new Date().getFullYear();
  return `TKT-${year}-${String(num).padStart(4, '0')}`;
}

/**
 * Busca información de un paquete por tracking
 */
async function checkPackageStatus(tracking: string): Promise<string> {
  const result = await pool.query(
    `SELECT p.*, u.full_name 
     FROM packages p 
     LEFT JOIN users u ON p.user_id = u.id 
     WHERE p.tracking_internal = $1 OR p.tracking_origin = $1
     LIMIT 1`,
    [tracking.toUpperCase()]
  );

  if (result.rows.length === 0) {
    return `No encontré ningún paquete con la guía "${tracking}". Verifica que el número sea correcto.`;
  }

  const pkg = result.rows[0];
  const statusLabels: Record<string, string> = {
    received: '📦 Recibido en bodega',
    in_transit: '🚚 En tránsito hacia México',
    processing: '📋 Procesando envío',
    shipped: '✈️ Vuelo confirmado',
    delivered: '✅ Entregado',
    pending: '⏳ Pendiente',
  };

  return `📦 **Paquete encontrado:**
- TRN: ${pkg.tracking_internal}
- Descripción: ${pkg.description || 'Sin descripción'}
- Estado: ${statusLabels[pkg.status] || pkg.status}
- Peso: ${pkg.weight_kg || 'Por confirmar'} kg
${pkg.has_gex ? '🛡️ Con Garantía Extendida' : ''}`;
}

/**
 * Arma un resumen con los DATOS REALES del cliente para que Cajito responda con
 * precisión: paquetes activos, saldo pendiente, asesor asignado y tickets recientes.
 * Todo en try/catch: si algo falla, devuelve lo que se pudo (o vacío) sin romper el chat.
 */
async function buildClientContext(userId: number | string): Promise<string> {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return '';
  const parts: string[] = [];
  let boxId = '';
  try {
    const uRes = await pool.query(
      `SELECT u.full_name, u.box_id, COALESCE(adv.full_name, '') AS advisor_name
         FROM users u
         LEFT JOIN users adv ON adv.id = COALESCE(u.advisor_id, u.referred_by_id)
        WHERE u.id = $1 LIMIT 1`, [uid]);
    const u = uRes.rows[0];
    if (!u) return '';
    boxId = u.box_id || '';
    parts.push(`Cliente: ${u.full_name || 'N/D'} | Casillero: ${u.box_id || 'N/D'}`);
    if (u.advisor_name) parts.push(`Asesor asignado: ${u.advisor_name}`);
  } catch (e) { /* seguimos */ }

  const svcLabel = (s: string): string => {
    const v = String(s || '').toUpperCase();
    if (v === 'POBOX_USA' || v === 'USA') return 'Aéreo USA';
    if (v === 'AIR_CHN_MX') return 'Aéreo China';
    if (v.includes('TDI_EXPRESS') || v === 'TDI_EXPRESS') return 'TDI Express';
    if (v.includes('MARIT') || v === 'FCL') return 'Marítimo';
    if (v === 'DHL') return 'DHL';
    return s || 'Envío';
  };
  const statusLabel: Record<string, string> = {
    received: 'Recibido en bodega', received_china: 'Recibido en China', received_origin: 'En bodega China',
    in_transit: 'En tránsito', in_transit_mty: 'En tránsito a MTY', at_customs: 'En aduana', customs_mx: 'Aduana México',
    processing: 'Procesando', shipped: 'Enviado', received_mty: 'En CEDIS MTY', received_cdmx: 'En CEDIS CDMX',
    ready_pickup: 'Listo para recoger', out_for_delivery: 'En ruta de entrega', delivered: 'Entregado',
  };

  try {
    const pkgRes = await pool.query(
      `SELECT COALESCE(NULLIF(child_no,''), tracking_internal) AS trn, service_type, status::text AS status,
              COALESCE(saldo_pendiente, 0) AS saldo, COALESCE(client_paid, false) AS paid
         FROM packages
        WHERE user_id = $1
          AND (is_master = true OR master_id IS NULL)
          AND status::text NOT IN ('delivered','sent')
        ORDER BY COALESCE(received_at, created_at) DESC
        LIMIT 8`, [uid]);
    if (pkgRes.rows.length > 0) {
      const lines = pkgRes.rows.map((p: any) => {
        const saldo = Number(p.saldo) > 0 ? ` — saldo $${Number(p.saldo).toFixed(2)} MXN` : (p.paid ? ' — pagado' : '');
        return `• ${p.trn} (${svcLabel(p.service_type)}) — ${statusLabel[p.status] || p.status}${saldo}`;
      });
      parts.push(`Paquetes activos (${pkgRes.rows.length}):\n${lines.join('\n')}`);
    } else {
      parts.push('Paquetes activos: ninguno en curso.');
    }
  } catch (e) { /* seguimos */ }

  try {
    const balRes = await pool.query(
      `SELECT COALESCE(SUM(saldo_pendiente),0) AS total_saldo
         FROM packages WHERE user_id = $1 AND COALESCE(client_paid,false)=false AND COALESCE(saldo_pendiente,0) > 0`, [uid]);
    const totalSaldo = Number(balRes.rows[0]?.total_saldo || 0);
    if (totalSaldo > 0) parts.push(`Saldo pendiente total: $${totalSaldo.toFixed(2)} MXN`);
  } catch (e) { /* seguimos */ }

  try {
    const tkRes = await pool.query(
      `SELECT ticket_folio, status, subject FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3`, [uid]);
    if (tkRes.rows.length > 0) {
      const tl = tkRes.rows.map((t: any) => `• ${t.ticket_folio || ''} [${t.status || ''}] ${t.subject || ''}`.trim());
      parts.push(`Tickets recientes:\n${tl.join('\n')}`);
    }
  } catch (e) { /* seguimos */ }

  // Direcciones de envío del cliente (bodegas por servicio + su casillero) CON
  // instrucciones de empaque y de cómo enviar. El placeholder "(S-Numero de
  // Cliente)" se reemplaza por el box_id del cliente en dirección e instrucciones.
  try {
    const suite = boxId || '(tu casillero)';
    const sub = (txt: any) => String(txt || '').replace(/\(S-?Numero de Cliente\)/gi, suite).trim();
    const addrRes = await pool.query(
      `SELECT DISTINCT ON (service_type) service_type, alias, address_line1, address_line2,
              city, state, zip_code, country, contact_name, contact_phone
         FROM service_warehouse_addresses
        ORDER BY service_type, is_primary DESC, sort_order ASC`);
    // Instrucciones por servicio (empaque + cómo enviar)
    const instrMap: Record<string, any> = {};
    try {
      const insRes = await pool.query(`SELECT service_type, packaging_instructions, shipping_instructions, general_notes FROM service_instructions`);
      insRes.rows.forEach((i: any) => { instrMap[i.service_type] = i; });
    } catch (e) { /* sin instrucciones */ }

    if (addrRes.rows.length > 0) {
      const svcName: Record<string, string> = {
        usa_pobox: 'Envíos a USA (PO Box)', china_air: 'Aéreo China', china_sea: 'Marítimo China', mx_cedis: 'Nacional / CEDIS MTY',
      };
      const blocks = addrRes.rows.map((a: any) => {
        const l1 = sub(a.address_line1);
        const l2 = a.address_line2 ? ` ${sub(a.address_line2)}` : '';
        const cityLine = [a.city, a.state, a.zip_code].filter(Boolean).join(', ');
        const loc = [cityLine, a.country].filter(Boolean).join(' — ');
        const contacto = [a.contact_name, a.contact_phone].filter(Boolean).join(' ');
        let block = `• ${svcName[a.service_type] || a.service_type}:\n   Dirección: ${l1}${l2}${loc ? `, ${loc}` : ''}\n   A nombre/casillero (Shipping Mark o Suite/Apt): ${suite}`;
        if (contacto) block += `\n   Contacto: ${contacto}`;
        const ins = instrMap[a.service_type];
        if (ins) {
          const pk = sub(ins.packaging_instructions);
          const sh = sub(ins.shipping_instructions);
          if (pk) block += `\n   Instrucciones de empaque: ${pk}`;
          if (sh) block += `\n   Cómo enviar: ${sh}`;
        }
        return block;
      });
      parts.push(`DIRECCIONES DE ENVÍO E INSTRUCCIONES (cuando el cliente pregunte por una dirección, SIEMPRE incluye también las instrucciones de empaque y de cómo enviar del mismo servicio):\n${blocks.join('\n')}`);
    }
  } catch (e) { /* seguimos */ }

  // 📐 Tarifas para cotización aproximada. IMPORTANTE: TODAS las tarifas son en USD.
  // Marítimo: tabla escalonada por CBM (pricing_tiers, categoría Genérico), en USD/CBM.
  // Aéreo: USD por kg. El monto exacto se calcula en el Cotizador de la app.
  try {
    const tarifas: string[] = [];
    const mt = await pool.query(
      `SELECT pt.min_cbm, pt.max_cbm, pt.price
         FROM pricing_tiers pt JOIN pricing_categories pc ON pt.category_id = pc.id
        WHERE pc.name = 'Generico' AND pt.is_active = TRUE
        ORDER BY pt.min_cbm ASC`);
    if (mt.rows.length) {
      const tierLines = mt.rows.map((t: any) => {
        const min = Number(t.min_cbm) || 0;
        const max = t.max_cbm == null ? null : Number(t.max_cbm);
        return `${min.toFixed(2)}–${max == null ? '∞' : max.toFixed(2)} m³: $${Number(t.price).toFixed(2)} USD por CBM`;
      });
      tarifas.push(
        `Marítimo China→México (Genérico) — precio por CBM en USD, escalonado (a más volumen, menor tarifa):\n   ${tierLines.join('\n   ')}\n   ` +
        `REGLA: el CBM cobrable = el MAYOR entre el volumen (m³) y el peso÷500 (500 kg = 1 CBM). ` +
        `Total USD ≈ CBM_cobrable × (tarifa USD/CBM del rango correspondiente). ` +
        `Para cotizar NECESITAS el peso Y el volumen (o dimensiones): si falta el peso, PÍDELO antes de dar el precio.`
      );
    }
    const air = await pool.query(`SELECT tariff_type, price_per_kg FROM air_tariffs WHERE route_id = 1 AND price_per_kg > 0 ORDER BY tariff_type`);
    if (air.rows.length) {
      const g = air.rows.find((r: any) => r.tariff_type === 'G') || air.rows[0];
      tarifas.push(
        `Aéreo China→México: ~$${Number(g.price_per_kg).toFixed(2)} USD por kg (tarifa genérica). ` +
        `Se cobra por peso volumétrico (el MAYOR entre peso real y volumétrico). Pide peso y dimensiones para estimar.`
      );
    }
    if (tarifas.length) {
      parts.push(`TARIFAS PARA COTIZAR (TODO EN USD; da un estimado aproximado y aclara que el exacto sale del Cotizador de la app):\n• ${tarifas.join('\n• ')}`);
    }
  } catch (e) { /* seguimos */ }

  // 💱 X-Pay (pago a proveedores en China): tipo de cambio y comisión vigentes.
  try {
    const xp = await pool.query(
      `SELECT (tipo_cambio_usd + COALESCE(override_tipo_cambio_usd,0)) AS tc_usd,
              (tipo_cambio_rmb + COALESCE(override_tipo_cambio_rmb,0)) AS tc_rmb,
              (porcentaje_compra + COALESCE(override_porcentaje_compra,0)) AS pct,
              COALESCE(costo_operacion_usd,0) AS costo_op
         FROM entangled_providers WHERE is_active = true
        ORDER BY is_default DESC, sort_order ASC, id ASC LIMIT 1`);
    const x = xp.rows[0];
    if (x) {
      const tcUsd = Number(x.tc_usd) || 0;
      const tcRmb = Number(x.tc_rmb) || 0;
      const pct = Number(x.pct) || 0;
      const costoOp = Number(x.costo_op) || 0;
      const rmbLine = tcRmb > 0 ? ` | TC RMB→MXN: ${tcRmb.toFixed(4)}` : '';
      parts.push(
        `X-PAY (pago a proveedores en China) — cotización vigente:\n` +
        `   Tipo de cambio USD→MXN: ${tcUsd.toFixed(4)}${rmbLine}\n` +
        `   Comisión: ${pct}% + costo de operación ${costoOp} USD.\n` +
        `   Fórmula estimada: MXN a pagar = (monto_USD × ${tcUsd.toFixed(4)}) + comisión(${pct}%) + (${costoOp} USD × TC). ` +
        `Ejemplo 10,000 USD ≈ $${((10000 * tcUsd) * (1 + pct/100) + costoOp * tcUsd).toLocaleString('es-MX', {maximumFractionDigits:2})} MXN. ` +
        `Aclara que es un ESTIMADO; el monto exacto depende del proveedor y de si es con/sin factura, y se calcula en el wizard de X-Pay.`
      );
    }
  } catch (e) { /* seguimos */ }

  return parts.join('\n');
}

/**
 * Llama a OpenAI para generar respuesta
 */
async function getAIResponse(userMessage: string, chatHistory: any[], clientContext: string = ''): Promise<{ response: string; shouldEscalate: boolean }> {
  // Si no hay API key, usar respuesta de fallback
  if (!OPENAI_API_KEY) {
    console.warn('⚠️ OPENAI_API_KEY no configurada, usando respuesta de fallback');
    return {
      response: `Gracias por contactarnos. Tu mensaje ha sido recibido: "${userMessage.substring(0, 50)}..."\n\nUn agente te atenderá pronto. 🙏`,
      shouldEscalate: true
    };
  }

  try {
    // Detectar si hay tracking en el mensaje
    const trackingMatch = userMessage.match(/\b(US-[A-Z0-9]+|CN-[A-Z0-9]+|[A-Z]{2}\d{9}[A-Z]{2})\b/i);
    let contextInfo = '';
    
    if (trackingMatch) {
      contextInfo = await checkPackageStatus(trackingMatch[0]);
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(clientContext ? [{ role: 'system', content: `[CONTEXTO DEL CLIENTE (datos reales, úsalos para responder):\n${clientContext}\n]` }] : []),
      ...chatHistory.slice(-6).map((m: any) => ({
        role: m.sender_type === 'client' ? 'user' : 'assistant',
        content: m.message
      })),
      { 
        role: 'user', 
        content: contextInfo 
          ? `[CONTEXTO DEL SISTEMA: ${contextInfo}]\n\nMensaje del cliente: ${userMessage}`
          : userMessage 
      }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Más económico que gpt-4o
        messages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.status}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const aiText = data.choices[0]?.message?.content || 'Lo siento, hubo un error procesando tu solicitud.';
    
    const shouldEscalate = aiText.includes('[ESCALAR]');
    const cleanResponse = aiText.replace('[ESCALAR]', '').trim();

    return { response: cleanResponse, shouldEscalate };
  } catch (error) {
    console.error('Error OpenAI:', error);
    return {
      response: 'Disculpa, estoy teniendo problemas técnicos. Un agente humano te atenderá en breve. 🙏',
      shouldEscalate: true
    };
  }
}

// ============================================================
// ENDPOINTS
// ============================================================

/**
 * POST /api/support/message
 * Enviar mensaje al chat de soporte (cliente)
 * Soporta multipart/form-data para adjuntar imágenes
 */
export const handleSupportMessage = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureDepartmentsSchema();
    // Obtener userId del JWT (el token contiene userId, no id)
    const userId = (req as any).user?.userId || req.body.userId;
    const userRole = (req as any).user?.role || '';
    const message = req.body.message;
    const ticketId = req.body.ticketId;

    console.log(`🎫 [SUPPORT] userId=${userId}, message=${message?.substring(0, 50)}, hasFiles=${!!(req.files as any[])?.length}`);
    const category = req.body.category;
    const trackingNumber = req.body.trackingNumber || null;
    const escalateDirectly = req.body.escalateDirectly === 'true' || req.body.escalateDirectly === true;

    // Determinar creator_type y department_id
    const advisorRoles = ['advisor', 'sub_advisor', 'asesor_lider', 'asesor'];
    const employeeRoles = [
      'employee', 'counter_staff', 'customer_service', 'admin', 'super_admin',
      'director', 'branch_manager', 'warehouse_ops', 'accountant',
      'monitoreo', 'operaciones', 'repartidor', 'abogado',
      ...advisorRoles,
    ];
    const creatorType = employeeRoles.includes(userRole) ? 'employee' : 'client';
    // Asesores → Atención a Cliente; resto de empleados → Soporte Técnico; clientes → por categoría
    const isAdvisorRole = advisorRoles.includes(userRole);

    let deptQuery: string;
    // systemError siempre va a Soporte Técnico, sin importar quién lo creó
    if (category === 'systemError') {
      deptQuery = `SELECT id FROM support_departments WHERE name = 'Soporte Técnico' LIMIT 1`;
    } else if (creatorType === 'employee' && !isAdvisorRole) {
      deptQuery = `SELECT id FROM support_departments WHERE name = 'Soporte Técnico' LIMIT 1`;
    } else if (category === 'accounting') {
      deptQuery = `SELECT id FROM support_departments WHERE name = 'Contabilidad' LIMIT 1`;
    } else if (category === 'quote') {
      deptQuery = `SELECT id FROM support_departments WHERE name = 'Cotizaciones' LIMIT 1`;
    } else {
      deptQuery = `SELECT id FROM support_departments WHERE is_default_for_clients = TRUE LIMIT 1`;
    }
    const deptRes = await pool.query(deptQuery);
    const departmentId = deptRes.rows[0]?.id || null;
    
    // Obtener archivos si hay (de multer)
    const files = req.files as Express.Multer.File[] | undefined;

    if (!userId || !message) {
      return res.status(400).json({ error: 'userId y message son requeridos' });
    }

    let currentTicketId = ticketId;
    let ticketFolio = '';
    
    // Procesar URLs de imágenes adjuntas (S3 con fallback a disco)
    let imageUrls: string[] = [];
    if (files && files.length > 0) {
      for (const f of files) {
        const ext = path.extname(f.originalname) || '.jpg';
        const filename = `support-${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
        try {
          if (isS3Configured()) {
            const url = await uploadToS3(f.buffer, `support/${filename}`, f.mimetype);
            imageUrls.push(url);
          } else {
            // Fallback: guardar a disco local
            const filePath = path.join(supportUploadsDir, filename);
            fs.writeFileSync(filePath, f.buffer);
            const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
            imageUrls.push(`${baseUrl}/uploads/support/${filename}`);
          }
        } catch (err) {
          console.error('⚠️ Error subiendo imagen de soporte:', err);
        }
      }
    }

    // A. CREAR NUEVO TICKET SI NO EXISTE
    if (!currentTicketId) {
      const folio = await generateTicketFolio();
      ticketFolio = folio;
      const subject = message.length > 50 ? message.substring(0, 47) + '...' : message;
      
      // Si escalateDirectly es true, crear directamente como escalated_human
      const initialStatus = escalateDirectly ? 'escalated_human' : 'open_ai';
      
      const newTicket = await pool.query(
        `INSERT INTO support_tickets (ticket_folio, user_id, category, subject, tracking_number, status, creator_type, department_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, ticket_folio`,
        [folio, userId, category || 'other', subject, trackingNumber, initialStatus, creatorType, departmentId]
      );
      currentTicketId = newTicket.rows[0].id;
      ticketFolio = newTicket.rows[0].ticket_folio;
      console.log(`🎫 Nuevo ticket creado: ${folio} (${initialStatus})${imageUrls.length > 0 ? ` con ${imageUrls.length} imágenes` : ''}`);

      // 🔔 Notificación in-app al cliente confirmando la apertura del ticket
      if (userId) {
        try {
          const { createCustomNotification } = await import('./notificationController');
          await createCustomNotification(
            userId,
            `🎫 Ticket ${ticketFolio} abierto`,
            'Tu ticket fue recibido. Un agente te atenderá pronto.',
            'ticket_created',
            'headset',
            { ticket_id: String(currentTicketId), ticket_folio: ticketFolio },
            `/support/ticket/${currentTicketId}`
          );
        } catch (e) {
          console.error('Error creando notificación de ticket:', e);
        }

        // 📲 WhatsApp al cliente confirmando número de ticket
        try {
          const userRow = await pool.query('SELECT full_name, phone FROM users WHERE id = $1', [userId]);
          const { full_name, phone } = userRow.rows[0] || {};
          if (phone) {
            sendTicketConfirmation(phone, full_name || 'Cliente', ticketFolio).catch(() => {});
          }
        } catch (e) {
          console.error('Error enviando WhatsApp de confirmación de ticket:', e);
        }
      }
      
      // Si es escalado directo, guardar mensaje con imágenes y retornar inmediatamente
      if (escalateDirectly) {
        await pool.query(
          `INSERT INTO ticket_messages (ticket_id, sender_type, message, attachments) VALUES ($1, 'client', $2, $3)`,
          [currentTicketId, message, imageUrls.length > 0 ? JSON.stringify(imageUrls) : null]
        );

        return res.json({
          status: 'escalated',
          ticketId: currentTicketId,
          ticketFolio: ticketFolio,
          message: '✅ Ticket creado. Un agente humano te atenderá pronto.',
          imagesUploaded: imageUrls.length
        });
      }
      // Nuevo ticket sin escalateDirectly: insertar mensaje con attachments aquí
      await pool.query(
        `INSERT INTO ticket_messages (ticket_id, sender_type, message, attachments) VALUES ($1, 'client', $2, $3)`,
        [currentTicketId, message, imageUrls.length > 0 ? JSON.stringify(imageUrls) : null]
      );
    } else {
      // Ticket existente: insertar mensaje con attachments
      await pool.query(
        `INSERT INTO ticket_messages (ticket_id, sender_type, message, attachments) VALUES ($1, 'client', $2, $3)`,
        [currentTicketId, message, imageUrls.length > 0 ? JSON.stringify(imageUrls) : null]
      );
    }

    // B. (mensaje ya insertado en cada rama arriba)

    // C. VERIFICAR ESTADO DEL TICKET
    const ticketCheck = await pool.query(
      'SELECT status, ticket_folio FROM support_tickets WHERE id = $1',
      [currentTicketId]
    );

    // Si estaba resuelto (Cajito ya lo había cerrado) y el cliente escribe de
    // nuevo → que Cajito lo SIGA atendiendo en modo IA (NO escalar a humano).
    // Solo se escala cuando el cliente lo confirme (más abajo). Se reabre en IA.
    if (ticketCheck.rows[0].status === 'resolved') {
      await pool.query(
        "UPDATE support_tickets SET status = 'open_ai', ticket_status = 'en_progreso', resolved_at = NULL, updated_at = NOW() WHERE id = $1",
        [currentTicketId]
      );
    }

    // Si ya está asignado a humano, no interviene la IA
    if (ticketCheck.rows[0].status === 'escalated_human') {
      await pool.query(
        "UPDATE support_tickets SET updated_at = NOW() WHERE id = $1",
        [currentTicketId]
      );
      return res.json({
        status: 'waiting_agent',
        ticketId: currentTicketId,
        ticketFolio: ticketCheck.rows[0].ticket_folio,
        message: 'Tu mensaje fue enviado. Un agente te responderá pronto.'
      });
    }

    // D. OBTENER HISTORIAL PARA CONTEXTO
    const history = await pool.query(
      `SELECT sender_type, message FROM ticket_messages 
       WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [currentTicketId]
    );

    // E. GENERAR RESPUESTA IA (con datos reales del cliente)
    const clientContext = creatorType === 'client' ? await buildClientContext(userId) : '';
    const { response: aiResponse, shouldEscalate } = await getAIResponse(
      message,
      history.rows.reverse(),
      clientContext
    );

    // F. GUARDAR RESPUESTA DE LA IA
    await pool.query(
      `INSERT INTO ticket_messages (ticket_id, sender_type, message) VALUES ($1, 'ai', $2)`,
      [currentTicketId, aiResponse]
    );

    // G. MANEJAR ESCALAMIENTO
    if (shouldEscalate) {
      await pool.query(
        "UPDATE support_tickets SET status = 'escalated_human', resolved_by_ai = FALSE, updated_at = NOW() WHERE id = $1",
        [currentTicketId]
      );
      console.log(`⚠️ Ticket ${ticketCheck.rows[0].ticket_folio} escalado a humano`);
      
      return res.json({
        status: 'escalated',
        ticketId: currentTicketId,
        ticketFolio: ticketCheck.rows[0].ticket_folio,
        response: aiResponse,
        message: 'Un agente humano ha sido notificado y te contactará pronto.'
      });
    }

    // H. RESPUESTA NORMAL DE LA IA — Cajito resolvió → se CIERRA el ticket (no se
    // deja abierto ocupando la bandeja). Si el cliente vuelve a escribir, se
    // reabre en modo IA (arriba). Solo los tickets escalados (arriba) quedan
    // abiertos para el equipo de atención al cliente.
    await pool.query(
      "UPDATE support_tickets SET status = 'resolved', ticket_status = 'finalizado', resolved_by_ai = TRUE, resolved_at = COALESCE(resolved_at, NOW()), updated_at = NOW() WHERE id = $1",
      [currentTicketId]
    );

    return res.json({
      status: 'ai_replied',
      ticketId: currentTicketId,
      ticketFolio: ticketCheck.rows[0].ticket_folio,
      response: aiResponse
    });

  } catch (error) {
    console.error('Error en soporte:', error);
    res.status(500).json({ error: 'Error procesando mensaje de soporte' });
  }
};

/**
 * GET /api/support/tickets
 * Obtener tickets del usuario (cliente) o asignados (asesor)
 */
export const getMyTickets = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.userId;
    const userRole = (req as any).user?.role || '';
    const isAdvisor = ['advisor', 'sub_advisor', 'asesor', 'asesor_lider', 'sub_asesor'].includes(userRole);

    const result = await pool.query(
      `SELECT t.id, t.ticket_folio, t.category, t.subject, t.status, t.priority,
              t.created_at, t.updated_at, t.user_id, t.assigned_to, t.metadata,
              u.full_name AS client_name, u.box_id AS client_box_id,
              u.email AS client_email, u.phone AS client_phone,
              d.name AS department_name, d.color AS department_color,
              -- Número de cliente capturado por el asesor (va en el primer mensaje
              -- como "• Número de cliente: XXX"); se extrae para mostrarlo limpio.
              NULLIF(TRIM(BOTH E' \t\r\n•-' FROM (
                SELECT substring(tm.message FROM 'N.mero de cliente:[[:space:]]*([^' || chr(10) || chr(13) || ']+)')
                FROM ticket_messages tm WHERE tm.ticket_id = t.id ORDER BY tm.created_at ASC LIMIT 1
              )), '') AS client_number,
              CASE WHEN t.user_id = $1 THEN 'own' ELSE 'assigned' END AS source
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.user_id
       LEFT JOIN support_departments d ON d.id = t.department_id
       WHERE t.user_id = $1
          ${isAdvisor ? 'OR t.assigned_to = $1 OR t.assigned_agent_id = $1' : ''}
       ORDER BY t.updated_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo tickets:', error);
    res.status(500).json({ error: 'Error obteniendo tickets' });
  }
};

/**
 * GET /api/support/ticket/:id/messages
 * Obtener mensajes de un ticket (cliente)
 */
export const getTicketMessages = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    // Vista cliente: solo mensajes NO internos
    const result = await pool.query(
      `SELECT id, sender_type, message, attachment_url, attachments, created_at, FALSE as is_internal
       FROM ticket_messages
       WHERE ticket_id = $1
         AND COALESCE(is_internal, FALSE) = FALSE
       ORDER BY created_at ASC`,
      [id]
    );

    const rows = await Promise.all(result.rows.map(signRowAttachments));
    res.json(rows);
  } catch (error) {
    console.error('Error obteniendo mensajes:', error);
    res.status(500).json({ error: 'Error obteniendo mensajes' });
  }
};

/**
 * GET /api/admin/support/ticket/:id/messages
 * Mensajes para agentes (incluye internos)
 */
export const getAdminTicketMessages = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT tm.id, tm.sender_type, tm.message, tm.attachment_url, tm.attachments, tm.created_at,
              COALESCE(tm.is_internal, FALSE) as is_internal,
              u.full_name as sender_name
       FROM ticket_messages tm
       LEFT JOIN users u ON u.id = tm.sender_id
       WHERE tm.ticket_id = $1
       ORDER BY tm.created_at ASC`,
      [id]
    );
    const rows = await Promise.all(result.rows.map(signRowAttachments));
    res.json(rows);
  } catch (error) {
    console.error('Error obteniendo mensajes admin:', error);
    res.status(500).json({ error: 'Error obteniendo mensajes' });
  }
};

// Helper: firmar URLs S3 de attachment_url + attachments
const signRowAttachments = async (row: any): Promise<any> => {
  try {
    if (row.attachment_url) {
      row.attachment_url = await signS3UrlIfNeeded(row.attachment_url);
    }
    if (row.attachments) {
      let urls: string[] = [];
      if (Array.isArray(row.attachments)) urls = row.attachments;
      else if (typeof row.attachments === 'string') {
        try { const p = JSON.parse(row.attachments); if (Array.isArray(p)) urls = p; } catch { /* ignore */ }
      }
      if (urls.length > 0) {
        const signed = await Promise.all(urls.map(u => signS3UrlIfNeeded(u)));
        row.attachments = signed.filter(Boolean);
      }
    }
  } catch (e) {
    console.warn('No se pudo firmar adjuntos:', e);
  }
  return row;
};

/**
 * POST /api/support/ticket/:id/message
 * Cliente envía un mensaje a su propio ticket
 */
export const clientReplyTicket = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const userId = (req as any).user?.userId;

    // Asegurar columna attachments (idempotente)
    await pool.query(`ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS attachments JSONB`);

    const files = (req.files as Express.Multer.File[]) || [];
    if ((!message || !message.trim()) && files.length === 0) {
      return res.status(400).json({ error: 'Mensaje o adjunto requerido' });
    }

    // Verificar que el ticket pertenece al cliente o está asignado al asesor
    const userRole = (req as any).user?.role || '';
    const isAdvisor = ['advisor', 'sub_advisor', 'asesor', 'asesor_lider', 'sub_asesor'].includes(userRole);
    const ticketCheck = await pool.query(
      `SELECT id, status, user_id, assigned_to, assigned_agent_id
       FROM support_tickets
       WHERE id = $1
         AND (user_id = $2 ${isAdvisor ? 'OR assigned_to = $2 OR assigned_agent_id = $2' : ''})`,
      [id, userId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }

    const isAdvisorOnTicket = isAdvisor && (
      ticketCheck.rows[0].assigned_to === userId ||
      ticketCheck.rows[0].assigned_agent_id === userId
    ) && ticketCheck.rows[0].user_id !== userId;
    const senderType = isAdvisorOnTicket ? 'agent' : 'client';

    // Procesar adjuntos (imágenes / PDF / Excel)
    const attachmentUrls: string[] = [];
    for (const f of files) {
      const ext = path.extname(f.originalname) || (f.mimetype.includes('pdf') ? '.pdf' : '.bin');
      const filename = `support-reply-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      try {
        if (isS3Configured()) {
          const url = await uploadToS3(f.buffer, `support/${filename}`, f.mimetype);
          attachmentUrls.push(url);
        } else {
          const filePath = path.join(supportUploadsDir, filename);
          fs.writeFileSync(filePath, f.buffer);
          const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
          attachmentUrls.push(`${baseUrl}/uploads/support/${filename}`);
        }
      } catch (err) {
        console.error('⚠️ Error subiendo adjunto de respuesta cliente:', err);
      }
    }
    const attachmentsJson = attachmentUrls.length > 0 ? JSON.stringify(attachmentUrls) : null;

    // Guardar mensaje del cliente / asesor
    await pool.query(
      `INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, message, attachments) VALUES ($1, $2, $3, $4, $5)`,
      [id, senderType, userId, (message || '').trim(), attachmentsJson]
    );

    // Si el ticket estaba resuelto/cerrado, reabrirlo automáticamente
    const ticket = ticketCheck.rows[0];
    const reopened = ticket.status === 'resolved' || ticket.status === 'closed';

    // Actualizar estado del ticket a escalated_human (reabrir si estaba resuelto)
    await pool.query(
      `UPDATE support_tickets SET status = 'escalated_human', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    // 🔔 Notificar al agente asignado si la conversación lleva >30 min pausada
    try {
      const agentInfoRes = await pool.query(
        `SELECT t.assigned_agent_id, t.ticket_folio,
                (SELECT created_at FROM ticket_messages
                 WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 1 OFFSET 1) AS prev_msg_at
         FROM support_tickets t WHERE t.id = $1`,
        [id]
      );
      const info = agentInfoRes.rows[0];
      if (info?.assigned_agent_id) {
        const prevMsgAt: Date | null = info.prev_msg_at ? new Date(info.prev_msg_at) : null;
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
        const shouldPush = !prevMsgAt || prevMsgAt < thirtyMinAgo;
        if (shouldPush) {
          sendPushToUsers([info.assigned_agent_id], {
            title: '💬 Respuesta del cliente',
            body: `${info.ticket_folio}: ${(message || '📎 Adjunto').trim().substring(0, 100)}`,
            data: {
              type: 'support_client_reply',
              ticket_id: String(id),
              ticket_folio: info.ticket_folio,
            },
          }).catch((e: any) => console.error('Push error (client reply):', e));
        }
      }
    } catch (e) {
      console.error('Error enviando notificación al agente:', e);
    }

    res.json({ success: true, message: reopened ? 'Ticket reabierto con nuevo mensaje' : 'Mensaje enviado', reopened });
  } catch (error: any) {
    console.error('Error enviando mensaje de cliente:', error);
    res.status(500).json({ error: 'Error enviando mensaje', detail: error?.message || String(error) });
  }
};

// ============================================================
// ENDPOINTS ADMIN (Panel de Soporte)
// ============================================================

/**
 * GET /api/admin/support/tickets
 * Obtener todos los tickets para el tablero Kanban
 */
export const getAdminTickets = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureDepartmentsSchema();
    await pool.query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP`);
    await pool.query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS ticket_status VARCHAR(20) DEFAULT 'nuevo'`);
    await pool.query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMP`);
    await pool.query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolution_time_minutes INTEGER`);
    const { status, limit = 100, department_id, creator_type, archived } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    // Por defecto excluir archivados; con ?archived=true traer solo archivados
    if (archived === 'true') {
      conditions.push('t.archived_at IS NOT NULL');
    } else {
      conditions.push('t.archived_at IS NULL');
    }

    if (status) { conditions.push(`t.status = $${idx++}`); params.push(status); }
    if (department_id) { conditions.push(`t.department_id = $${idx++}`); params.push(department_id); }
    if (creator_type) { conditions.push(`t.creator_type = $${idx++}`); params.push(creator_type); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const query = `
      SELECT t.*,
             u.full_name, u.email, u.phone, u.box_id as client_box_id, u.role as creator_role,
             d.name as department_name, d.color as department_color, d.icon as department_icon,
             ag.full_name as assigned_agent_name,
             (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) as message_count,
             (SELECT message FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM support_tickets t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN support_departments d ON t.department_id = d.id
      LEFT JOIN users ag ON t.assigned_to = ag.id
      ${where}
      ORDER BY
        CASE t.status
          WHEN 'escalated_human' THEN 1
          WHEN 'open_ai' THEN 2
          WHEN 'waiting_client' THEN 3
          ELSE 4
        END,
        t.updated_at DESC
      LIMIT $${idx}`;
    params.push(limit);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo tickets admin:', error);
    res.status(500).json({ error: 'Error obteniendo tickets' });
  }
};

/**
 * PATCH /api/admin/support/ticket/:id/archive
 * Archivar o desarchivar un ticket
 */
export const archiveTicket = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { unarchive } = req.body;
    await pool.query(
      `UPDATE support_tickets SET archived_at = ${unarchive ? 'NULL' : 'NOW()'}, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error archivando ticket:', error);
    res.status(500).json({ error: 'Error al archivar ticket' });
  }
};

/**
 * GET /api/admin/support/stats
 * Estadísticas del soporte
 */
export const getSupportStats = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureDepartmentsSchema();
    const [stats, deptStats] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'open_ai' AND archived_at IS NULL) as ai_handling,
          -- "Requieren atención" = los tickets ROJOS del tablero: sin resolver,
          -- no finalizados, no archivados y con MÁS DE 3 DÍAS HÁBILES sin resolver
          -- (L-V; sábado y domingo NO cuentan). Mismo criterio que las columnas.
          COUNT(*) FILTER (
            WHERE status <> 'resolved' AND COALESCE(ticket_status::text, '') <> 'finalizado' AND archived_at IS NULL
              AND (
                ((CURRENT_DATE - created_at::date) / 7) * 5
                + (SELECT COUNT(*) FROM generate_series(1, GREATEST((CURRENT_DATE - created_at::date) % 7, 0)) gs
                     WHERE EXTRACT(ISODOW FROM created_at::date + gs) < 6)
              ) > 3
          ) as needs_human,
          COUNT(*) FILTER (WHERE status = 'waiting_client' AND archived_at IS NULL) as waiting_client,
          -- Resueltos y Nuevos hoy EXCLUYEN los atendidos/resueltos por la IA (Cajito).
          COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_by_ai IS NOT TRUE) as resolved,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' AND resolved_by_ai IS NOT TRUE) as today_new,
          COUNT(*) FILTER (WHERE resolved_at > NOW() - INTERVAL '24 hours' AND resolved_by_ai IS NOT TRUE) as today_resolved,
          COUNT(*) FILTER (WHERE creator_type = 'employee' AND status != 'resolved' AND archived_at IS NULL) as employee_open,
          COUNT(*) FILTER (WHERE COALESCE(creator_type, 'client') != 'employee' AND status != 'resolved' AND archived_at IS NULL) as client_open,
          COALESCE(ROUND(AVG(business_minutes(created_at, resolved_at)) FILTER (WHERE resolved_at > NOW() - INTERVAL '24 hours'))::int, 0) as avg_resolution_time_min
        FROM support_tickets
      `),
      pool.query(`
        SELECT d.id, d.name, d.color, d.icon,
               COUNT(t.id) FILTER (WHERE t.status != 'resolved' AND t.archived_at IS NULL) as open_count
        FROM support_departments d
        LEFT JOIN support_tickets t ON t.department_id = d.id
        GROUP BY d.id, d.name, d.color, d.icon, d.sort_order
        ORDER BY d.sort_order
      `)
    ]);

    res.json({ ...stats.rows[0], departments: deptStats.rows });
  } catch (error) {
    console.error('Error obteniendo stats:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
};

/**
 * POST /api/admin/support/ticket/:id/reply
 * Responder como agente humano
 */
export const adminReplyTicket = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const agentId = (req as any).user?.userId;

    // Asegurar columna attachments (idempotente)
    await pool.query(`ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS attachments JSONB`);

    if (!message && !(req.files as Express.Multer.File[])?.length) {
      return res.status(400).json({ error: 'Mensaje o adjunto requerido' });
    }

    const isInternal = req.body.is_internal === 'true' || req.body.is_internal === true;

    // Procesar adjuntos (imágenes + PDFs)
    const files = (req.files as Express.Multer.File[]) || [];
    console.log(`[REPLY] ticket=${id} files_received=${files.length} files_info=${files.map(f => `${f.originalname}(${f.mimetype},${f.size}b)`).join(',')}`);
    const attachmentUrls: string[] = [];
    let uploadFailed = false;
    for (const f of files) {
      const ext = path.extname(f.originalname) || (f.mimetype.includes('pdf') ? '.pdf' : '.jpg');
      const filename = `support-reply-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      try {
        if (isS3Configured()) {
          const url = await uploadToS3(f.buffer, `support/${filename}`, f.mimetype);
          attachmentUrls.push(url);
        } else {
          const filePath = path.join(supportUploadsDir, filename);
          fs.writeFileSync(filePath, f.buffer);
          const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
          attachmentUrls.push(`${baseUrl}/uploads/support/${filename}`);
        }
      } catch (err) {
        console.error('⚠️ Error subiendo adjunto de respuesta:', err);
        uploadFailed = true;
      }
    }

    // Si se enviaron archivos pero ninguno se guardó, retornar error
    if (files.length > 0 && attachmentUrls.length === 0 && uploadFailed) {
      return res.status(500).json({ error: 'No se pudo subir el archivo adjunto. Intenta de nuevo.' });
    }

    const attachmentsJson = attachmentUrls.length > 0 ? JSON.stringify(attachmentUrls) : null;

    await pool.query(
      `INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, message, is_internal, attachments)
       VALUES ($1, 'agent', $2, $3, $4, $5)`,
      [id, agentId, message || '', isInternal, attachmentsJson]
    );

    const newStatus = isInternal ? 'escalated_human' : 'waiting_client';
    await pool.query(
      `UPDATE support_tickets
       SET assigned_agent_id = $1,
           status = $2,
           updated_at = NOW(),
           ticket_status = CASE WHEN ticket_status = 'nuevo' OR ticket_status IS NULL THEN 'en_progreso' ELSE ticket_status END,
           first_response_at = CASE WHEN first_response_at IS NULL THEN NOW() ELSE first_response_at END
       WHERE id = $3`,
      [agentId, newStatus, id]
    );

    // 🔔 Notificar al cliente si el ticket no es interno
    if (!isInternal) {
      try {
        const ticketInfoRes = await pool.query(
          `SELECT t.user_id, t.ticket_folio,
                  (SELECT created_at FROM ticket_messages
                   WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 1 OFFSET 1) AS prev_msg_at
           FROM support_tickets t WHERE t.id = $1`,
          [id]
        );
        const info = ticketInfoRes.rows[0];
        if (info?.user_id) {
          const prevMsgAt: Date | null = info.prev_msg_at ? new Date(info.prev_msg_at) : null;
          const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
          const shouldPush = !prevMsgAt || prevMsgAt < thirtyMinAgo;

          if (shouldPush) {
            const msgPreview = message ? message.substring(0, 100) : 'Tienes una nueva respuesta';
            // In-app notification
            const { createCustomNotification } = await import('./notificationController');
            await createCustomNotification(
              info.user_id,
              '🎧 Nueva respuesta en tu ticket',
              `${info.ticket_folio}: ${msgPreview}`,
              'support_reply',
              'headset',
              { ticket_id: String(id), ticket_folio: info.ticket_folio },
              `/support/ticket/${id}`
            );
            // Push notification
            sendPushToUsers([info.user_id], {
              title: '🎧 Nueva respuesta en tu ticket',
              body: msgPreview,
              data: {
                type: 'support_reply',
                ticket_id: String(id),
                ticket_folio: info.ticket_folio,
              },
            }).catch((e: any) => console.error('Push error (support reply):', e));
          }
        }
      } catch (e) {
        console.error('Error enviando notificación de respuesta de ticket:', e);
      }
    }

    res.json({ success: true, message: 'Respuesta enviada', is_internal: isInternal, attachments: attachmentUrls });
  } catch (error) {
    console.error('Error respondiendo ticket:', error);
    res.status(500).json({ error: 'Error enviando respuesta' });
  }
};

/**
 * PUT /api/admin/support/ticket/:id/resolve
 * Marcar ticket como resuelto
 */
export const resolveTicket = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    const updated = await pool.query(
      `UPDATE support_tickets
       SET status = 'resolved',
           resolved_at = NOW(),
           updated_at = NOW(),
           ticket_status = 'finalizado',
           resolved_by_ai = FALSE,
           resolution_time_minutes = EXTRACT(EPOCH FROM (NOW() - created_at))::int / 60
       WHERE id = $1
       RETURNING ticket_folio, user_id`,
      [id]
    );

    // 📲 WhatsApp al cliente notificando que el ticket fue resuelto
    if (updated.rows[0]?.user_id) {
      const { ticket_folio, user_id } = updated.rows[0];
      pool.query('SELECT full_name, phone FROM users WHERE id = $1', [user_id])
        .then(r => {
          const { full_name, phone } = r.rows[0] || {};
          if (phone) sendTicketResolved(phone, full_name || 'Cliente', ticket_folio).catch(() => {});
        })
        .catch(() => {});
    }

    res.json({ success: true, message: 'Ticket resuelto' });
  } catch (error) {
    console.error('Error resolviendo ticket:', error);
    res.status(500).json({ error: 'Error resolviendo ticket' });
  }
};

/**
 * PUT /api/admin/support/ticket/:id/reactivate
 * Reactivar un ticket resuelto/cerrado → vuelve a escalated_human
 */
export const reactivateTicket = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE support_tickets
       SET status = 'escalated_human',
           resolved_at = NULL,
           updated_at = NOW(),
           ticket_status = 'en_progreso',
           resolution_time_minutes = NULL
       WHERE id = $1 AND status = 'resolved'
       RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ error: 'El ticket no está resuelto o no existe' });
    }

    res.json({ success: true, message: 'Ticket reactivado' });
  } catch (error) {
    console.error('Error reactivando ticket:', error);
    res.status(500).json({ error: 'Error al reactivar ticket' });
  }
};

/**
 * PUT /api/admin/support/ticket/:id/assign
 * Asignar ticket a un agente
 */
export const assignTicket = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { agentId } = req.body;

    await pool.query(
      `UPDATE support_tickets 
       SET assigned_agent_id = $1, status = 'escalated_human', updated_at = NOW() 
       WHERE id = $2`,
      [agentId, id]
    );

    res.json({ success: true, message: 'Ticket asignado' });
  } catch (error) {
    console.error('Error asignando ticket:', error);
    res.status(500).json({ error: 'Error asignando ticket' });
  }
};

// ============================================================
// 🏢 DEPARTAMENTOS Y RUTEO DE TICKETS
// ============================================================

let _deptTableEnsured = false;
let _deptTableEnsuring: Promise<void> | null = null;
export const ensureDepartmentsSchema = async () => {
  if (_deptTableEnsured) return;
  // Evitar race condition: si ya está corriendo la migración, esperar a que termine
  if (_deptTableEnsuring) return _deptTableEnsuring;
  _deptTableEnsuring = (async () => {
    try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_departments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        color VARCHAR(7) NOT NULL DEFAULT '#666666',
        icon VARCHAR(50),
        is_default_for_clients BOOLEAN DEFAULT FALSE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // Marca si el ticket fue resuelto por la IA (Cajito) sin intervención humana.
    // Sirve para excluir esos tickets de "Resueltos" y "Nuevos hoy".
    await pool.query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_by_ai BOOLEAN DEFAULT FALSE`);
    // Función de tiempo hábil: minutos entre dos timestamps EXCLUYENDO fines de
    // semana (sábado=6, domingo=0). Se usa para el "Tiempo Promedio" de resolución
    // para no contar el tiempo que corre en fin de semana.
    await pool.query(`
      CREATE OR REPLACE FUNCTION business_minutes(ts_start timestamp, ts_end timestamp)
      RETURNS numeric AS $$
        SELECT GREATEST(0,
          EXTRACT(EPOCH FROM (ts_end - ts_start))/60
          - COALESCE((
              SELECT SUM(EXTRACT(EPOCH FROM (LEAST(ts_end, d + interval '1 day') - GREATEST(ts_start, d)))/60)
              FROM generate_series(date_trunc('day', ts_start), date_trunc('day', ts_end), interval '1 day') AS d
              WHERE EXTRACT(DOW FROM d) IN (0, 6)
                AND LEAST(ts_end, d + interval '1 day') > GREATEST(ts_start, d)
            ), 0)
        );
      $$ LANGUAGE sql IMMUTABLE;
    `).catch((e: any) => console.warn('No se pudo crear business_minutes():', e.message));
    // Agregar columnas a support_tickets PRIMERO (necesarias para las queries siguientes)
    await pool.query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS department_id INT REFERENCES support_departments(id)`);
    await pool.query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_to INT REFERENCES users(id)`);
    await pool.query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS creator_type VARCHAR(20) DEFAULT 'client'`);
    // Mensajes internos: solo visibles para agentes, no para el cliente
    await pool.query(`ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT FALSE`);
    // Quién envió el mensaje (para agentes)
    await pool.query(`ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS sender_id INT REFERENCES users(id)`);
    // Adjuntos de mensajes (imágenes / PDF / Excel) — array de URLs
    await pool.query(`ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS attachments JSONB`);
    // Número de guía reportada al crear el ticket
    await pool.query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100)`);
    // Timestamp de resolución (para stats de tiempo promedio)
    await pool.query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP`);
    // Reasignar tickets que apuntan a IDs duplicados → conservar MIN(id) por nombre
    await pool.query(`
      UPDATE support_tickets
      SET department_id = canonical.min_id
      FROM support_departments d,
           (SELECT name, MIN(id) AS min_id FROM support_departments GROUP BY name) canonical
      WHERE support_tickets.department_id = d.id
        AND d.name = canonical.name
        AND d.id <> canonical.min_id
    `);
    // Limpiar duplicados conservando el registro con id más bajo por nombre
    await pool.query(`
      DELETE FROM support_departments
      WHERE id NOT IN (
        SELECT MIN(id) FROM support_departments GROUP BY name
      )
    `);
    // Agregar unique constraint si no existe (evita duplicados futuros)
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'support_departments_name_unique'
        ) THEN
          ALTER TABLE support_departments ADD CONSTRAINT support_departments_name_unique UNIQUE (name);
        END IF;
      END $$;
    `);
    await pool.query(`
      INSERT INTO support_departments (name, color, icon, is_default_for_clients, sort_order)
      VALUES
        ('Atención a Cliente', '#F05A28', 'headset',   TRUE,  1),
        ('Soporte Técnico',    '#2196F3', 'construct', FALSE, 2),
        ('Cotizaciones',       '#FF9800', 'calculator',FALSE, 3),
        ('Contabilidad',       '#4CAF50', 'cash',      FALSE, 4),
        ('Dirección',          '#9C27B0', 'business',  FALSE, 5),
        ('CEDIS MTY',          '#009688', 'business',  FALSE, 6),
        ('CEDIS CDMX',         '#FF5722', 'business',  FALSE, 7),
        ('CEDIS USA',          '#3F51B5', 'business',  FALSE, 8)
      ON CONFLICT (name) DO NOTHING
    `);
    // Reordenar sort_order si ya existían (idempotente)
    await pool.query(`
      UPDATE support_departments SET sort_order = CASE name
        WHEN 'Atención a Cliente' THEN 1
        WHEN 'Soporte Técnico'    THEN 2
        WHEN 'Cotizaciones'       THEN 3
        WHEN 'Contabilidad'       THEN 4
        WHEN 'Dirección'          THEN 5
        WHEN 'CEDIS MTY'          THEN 6
        WHEN 'CEDIS CDMX'         THEN 7
        WHEN 'CEDIS USA'          THEN 8
        ELSE sort_order END
      WHERE name IN ('Atención a Cliente','Soporte Técnico','Cotizaciones','Contabilidad','Dirección','CEDIS MTY','CEDIS CDMX','CEDIS USA')
    `);
    // Migrate existing tickets to default department
    await pool.query(`
      UPDATE support_tickets
      SET department_id = (SELECT id FROM support_departments WHERE is_default_for_clients = TRUE LIMIT 1)
      WHERE department_id IS NULL
    `);
    // Corregir tickets mal clasificados como 'client' creados por empleados internos
    await pool.query(`
      UPDATE support_tickets t
      SET creator_type = 'employee'
      FROM users u
      WHERE t.user_id = u.id
        AND t.creator_type = 'client'
        AND u.role IN (
          'employee','counter_staff','customer_service','admin','super_admin',
          'director','branch_manager','warehouse_ops','accountant',
          'monitoreo','operaciones','repartidor','abogado'
        )
    `);
    _deptTableEnsured = true;
    console.log('✅ support_departments schema ensured');
    } catch (e) {
      console.error('Error ensuring departments schema:', e);
    } finally {
      _deptTableEnsuring = null;
    }
  })();
  return _deptTableEnsuring;
};

/**
 * GET /api/support/departments
 * Lista de departamentos disponibles
 */
export const getDepartments = async (_req: Request, res: Response): Promise<any> => {
  try {
    await ensureDepartmentsSchema();
    const result = await pool.query(
      `SELECT id, name, color, icon, is_default_for_clients FROM support_departments ORDER BY sort_order`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo departamentos:', error);
    res.status(500).json({ error: 'Error obteniendo departamentos' });
  }
};

/**
 * GET /api/admin/support/agents?department_id=X
 * Lista de agentes (empleados) disponibles para asignar
 */
export const getSupportAgents = async (req: Request, res: Response): Promise<any> => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, role
       FROM users
       WHERE role IN ('customer_service', 'admin', 'super_admin', 'counter_staff', 'employee')
         AND (status IS NULL OR status = 'active')
       ORDER BY full_name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo agentes:', error);
    res.status(500).json({ error: 'Error obteniendo agentes' });
  }
};

/**
 * POST /api/admin/support/ticket/:id/transfer
 * Transferir ticket a otro departamento y/o agente
 */
export const transferTicket = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { department_id, assigned_to, note } = req.body;

    if (!department_id && !assigned_to) {
      return res.status(400).json({ error: 'Se requiere departamento o agente destino' });
    }

    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let idx = 1;

    if (department_id) { updates.push(`department_id = $${idx++}`); params.push(department_id); }
    if (assigned_to) { updates.push(`assigned_to = $${idx++}`, `assigned_agent_id = $${idx++}`); params.push(assigned_to, assigned_to); }
    updates.push(`status = $${idx++}`); params.push('escalated_human');
    updates.push(`ticket_status = CASE WHEN ticket_status = 'nuevo' OR ticket_status IS NULL THEN 'en_progreso' ELSE ticket_status END`);
    params.push(id);

    await pool.query(
      `UPDATE support_tickets SET ${updates.join(', ')} WHERE id = $${idx}`,
      params
    );

    // Obtener nombre del departamento destino para el mensaje visible
    let deptName = '';
    if (department_id) {
      const deptRow = await pool.query(`SELECT name FROM support_departments WHERE id = $1`, [department_id]);
      deptName = deptRow.rows[0]?.name || '';
    }

    // Mensaje visible al cliente informando la transferencia
    await pool.query(
      `INSERT INTO ticket_messages (ticket_id, sender_type, message, is_internal) VALUES ($1, 'agent', $2, FALSE)`,
      [id, `🔄 Transferido a ${deptName}`]
    );

    // Nota interna adicional si se proporcionó
    if (note) {
      await pool.query(
        `INSERT INTO ticket_messages (ticket_id, sender_type, message, is_internal) VALUES ($1, 'agent', $2, TRUE)`,
        [id, `📋 Nota interna: ${note}`]
      );
    }

    // Si el destino es un CEDIS, notificar a usuarios operaciones de esa sucursal
    if (deptName.startsWith('CEDIS')) {
      try {
        // Mapear nombre CEDIS → código de sucursal
        const cedisBranchCode =
          deptName === 'CEDIS MTY'  ? 'MTY'  :
          deptName === 'CEDIS CDMX' ? 'CDMX' :
          deptName === 'CEDIS USA'  ? 'TX'   : null;

        let recipients: any[] = [];
        if (cedisBranchCode) {
          const r = await pool.query(
            `SELECT u.id FROM users u
             JOIN branches b ON b.id = u.branch_id
             WHERE u.role IN ('operaciones', 'Operaciones', 'branch_manager', 'admin', 'super_admin')
               AND (b.code = $1 OR u.role IN ('admin', 'super_admin'))`,
            [cedisBranchCode]
          );
          recipients = r.rows;
        } else {
          const r = await pool.query(`SELECT id FROM users WHERE role IN ('admin', 'super_admin')`);
          recipients = r.rows;
        }

        const ticketRow = await pool.query(
          `SELECT subject, ticket_folio FROM support_tickets WHERE id = $1`, [id]
        );
        const subject = ticketRow.rows[0]?.subject || '';
        const folio = ticketRow.rows[0]?.ticket_folio || `#${id}`;

        const { createCustomNotification } = await import('./notificationController');
        for (const rec of recipients) {
          await createCustomNotification(
            rec.id,
            `🎫 Nuevo ticket en ${deptName}`,
            `${folio}: "${subject}"`,
            'info',
            'headset',
            { ticketId: Number(id), folio },
            '/support'
          );
        }
      } catch (notifErr) {
        console.warn('[SUPPORT] Error notificando transferencia CEDIS:', notifErr);
      }
    }

    res.json({ success: true, message: 'Ticket transferido' });
  } catch (error) {
    console.error('Error transfiriendo ticket:', error);
    res.status(500).json({ error: 'Error transfiriendo ticket' });
  }
};

// ============================================================
// 🆘 RECLAMACIÓN PÚBLICA DE NÚMERO DE CLIENTE (sin login)
// ============================================================
// Permite a un visitante levantar un ticket cuando alguien más
// activó su número de cliente. Sube su INE, correo y teléfono.

const claimsUploadsDir = path.join(__dirname, '..', 'uploads', 'support', 'claims');
try {
  if (!fs.existsSync(claimsUploadsDir)) {
    fs.mkdirSync(claimsUploadsDir, { recursive: true });
  }
} catch (e) {
  console.warn('⚠️ No se pudo crear directorio de claims:', e);
}

const claimsMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|pdf/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype);
    if (extOk && mimeOk) cb(null, true);
    else cb(null, false);
  }
}).fields([
  { name: 'ine_front', maxCount: 1 },
  { name: 'ine_back', maxCount: 1 }
]);

export const uploadBoxIdClaimFiles = (req: Request, res: Response, next: Function) => {
  claimsMulter(req, res, (err: any) => {
    if (err) {
      console.warn('⚠️ Error multer claims (continuando):', err.message || err);
    }
    next();
  });
};

// Asegurar tabla de claims (idempotente)
let _claimsTableEnsured = false;
const ensureClaimsTable = async () => {
  if (_claimsTableEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS box_id_claims (
        id SERIAL PRIMARY KEY,
        folio VARCHAR(32) UNIQUE NOT NULL,
        claimed_box_id VARCHAR(64) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(64) NOT NULL,
        message TEXT,
        ine_front_url TEXT,
        ine_back_url TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        admin_notes TEXT,
        resolved_by_user_id INTEGER,
        resolved_at TIMESTAMP,
        ip_address VARCHAR(64),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_box_id_claims_status ON box_id_claims(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_box_id_claims_box ON box_id_claims(claimed_box_id)`);
    _claimsTableEnsured = true;
  } catch (e) {
    console.error('Error asegurando tabla box_id_claims:', e);
  }
};

const generateClaimFolio = (): string => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CLM-${ts}-${rand}`;
};

// ============================================================
// COTIZACIÓN FORMAL — Cliente solicita cotización con fotos + packing list
// ============================================================
const quoteRequestMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/|^application\/pdf$|^application\/vnd\.ms-excel$|^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet$|^text\/csv$/.test(file.mimetype);
    cb(null, ok);
  }
}).fields([
  { name: 'photos', maxCount: 10 },
  { name: 'packing_list', maxCount: 1 }
]);

export const uploadFormalQuoteFiles = (req: Request, res: Response, next: Function) => {
  quoteRequestMulter(req, res, (err: any) => {
    if (err) console.warn('⚠️ Error multer quote-request:', err.message || err);
    next();
  });
};

/**
 * POST /api/support/quote-formal-request
 * Cliente solicita cotización formal: crea ticket con creator_type=client,
 * status=escalated_human (pasa directo a esperar respuesta humana), incluye
 * fotos y packing list. Si tiene asesor, se asigna al asesor; si no, queda
 * sin asignar en el departamento de Atención a Cliente.
 */
export const createFormalQuoteRequest = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureDepartmentsSchema();
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const {
      servicio,
      subservicio,
      categoria,
      largo,
      ancho,
      alto,
      peso,
      peso_cobrable,
      cbm,
      cantidad,
      precio_usd,
      precio_mxn,
      precio_por_kg,
      tipo_cambio,
      tiempo_estimado,
      valor_declarado_usd,
      descripcion_producto,
      observaciones,
    } = req.body || {};

    if (!servicio) return res.status(400).json({ error: 'servicio es requerido' });

    const filesObj = (req.files as { [field: string]: Express.Multer.File[] } | undefined) || {};
    const photos = filesObj.photos || [];
    const packingList = (filesObj.packing_list || [])[0] || null;

    if (photos.length === 0) {
      return res.status(400).json({ error: 'Debes adjuntar al menos una foto del producto' });
    }
    if (!packingList) {
      return res.status(400).json({ error: 'Debes adjuntar el packing list (PDF o Excel)' });
    }

    // Subir archivos
    const uploadFile = async (f: Express.Multer.File, prefix: string): Promise<string> => {
      const ext = path.extname(f.originalname) || '';
      const filename = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      if (isS3Configured()) {
        return await uploadToS3(f.buffer, `support/${filename}`, f.mimetype);
      }
      const filePath = path.join(supportUploadsDir, filename);
      fs.writeFileSync(filePath, f.buffer);
      const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
      return `${baseUrl}/uploads/support/${filename}`;
    };

    const photoUrls: string[] = [];
    for (const p of photos) {
      try { photoUrls.push(await uploadFile(p, 'quote-photo')); } catch (e) { console.error('upload photo err', e); }
    }
    let packingListUrl: string | null = null;
    try { packingListUrl = await uploadFile(packingList, 'quote-packing'); } catch (e) { console.error('upload packing err', e); }

    // Obtener usuario + asesor (incluye phone del asesor para notificacion WhatsApp)
    const userRow = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.box_id, u.advisor_id,
              a.id AS advisor_user_id, a.full_name AS advisor_name, a.phone AS advisor_phone
       FROM users u
       LEFT JOIN users a ON a.id = u.advisor_id
       WHERE u.id = $1`,
      [userId]
    );
    if (userRow.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    const user = userRow.rows[0];
    const advisorId: number | null = user.advisor_user_id || null;

    // Departamento: Cotizaciones (fallback a default para clientes si no existe)
    const deptRes = await pool.query(
      `SELECT id FROM support_departments
       WHERE name = 'Cotizaciones'
          OR is_default_for_clients = TRUE
       ORDER BY (name = 'Cotizaciones') DESC
       LIMIT 1`
    );
    const departmentId = deptRes.rows[0]?.id || null;

    // Crear ticket
    const folio = await generateTicketFolio();
    const subject = `Cotización formal — ${String(servicio).toUpperCase()}`;
    const insertTicket = await pool.query(
      `INSERT INTO support_tickets
         (ticket_folio, user_id, category, subject, status, creator_type, department_id, assigned_to, assigned_agent_id, priority)
       VALUES ($1, $2, 'quote', $3, 'escalated_human', 'client', $4, $5, $5, 'normal')
       RETURNING id, ticket_folio`,
      [folio, userId, subject, departmentId, advisorId]
    );
    const ticketId = insertTicket.rows[0].id;
    const ticketFolio = insertTicket.rows[0].ticket_folio;

    // Guardar metadata estructurada del request (para prefill del generador de cotización del asesor)
    try {
      await pool.query(
        `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS metadata JSONB`
      );
      const metadata = {
        servicio, subservicio, categoria,
        largo, ancho, alto, peso, peso_cobrable, cbm, cantidad,
        precio_usd, precio_mxn, precio_por_kg, tipo_cambio, tiempo_estimado,
        valor_declarado_usd,
        descripcion_producto, observaciones,
        photos: photoUrls,
        packing_list: packingListUrl,
      };
      await pool.query(`UPDATE support_tickets SET metadata = $1 WHERE id = $2`, [JSON.stringify(metadata), ticketId]);
    } catch (e) { console.warn('No se pudo guardar metadata del ticket:', e); }

    // Componer mensaje automático con datos de la cotización
    const lines: string[] = [];
    lines.push(`📝 *Solicitud de cotización formal*`);
    lines.push('');
    lines.push(`*Cliente:* ${user.full_name || '—'}${user.box_id ? ` (Box ${user.box_id})` : ''}`);
    if (user.email) lines.push(`*Email:* ${user.email}`);
    if (user.phone) lines.push(`*Teléfono:* ${user.phone}`);
    if (advisorId) lines.push(`*Asesor asignado:* ${user.advisor_name || `#${advisorId}`}`);
    lines.push('');
    lines.push(`*Servicio:* ${servicio}${subservicio ? ` (${subservicio})` : ''}`);
    if (categoria) lines.push(`*Categoría:* ${categoria}`);
    if (largo || ancho || alto) lines.push(`*Dimensiones (cm):* ${largo || '—'} × ${ancho || '—'} × ${alto || '—'}`);
    if (peso) lines.push(`*Peso real:* ${peso} kg`);
    if (peso_cobrable) lines.push(`*Peso cobrable:* ${peso_cobrable} kg`);
    if (cbm) lines.push(`*CBM:* ${cbm} m³`);
    if (cantidad) lines.push(`*Cantidad:* ${cantidad}`);
    if (valor_declarado_usd) lines.push(`*Valor declarado:* $${Number(valor_declarado_usd).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`);
    if (tiempo_estimado) lines.push(`*Tiempo estimado:* ${tiempo_estimado}`);
    if (precio_por_kg) lines.push(`*Tarifa por kg:* $${Number(precio_por_kg).toFixed(2)} USD/kg`);
    if (precio_usd) lines.push(`*Cotización estimada:* $${Number(precio_usd).toFixed(2)} USD${precio_mxn ? ` (≈ $${Number(precio_mxn).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN)` : ''}`);
    if (tipo_cambio) lines.push(`*Tipo de cambio:* ${tipo_cambio}`);
    if (descripcion_producto) { lines.push(''); lines.push(`*Descripción del producto:*`); lines.push(descripcion_producto); }
    if (observaciones) { lines.push(''); lines.push(`*Observaciones del cliente:*`); lines.push(observaciones); }
    lines.push('');
    lines.push(`*Packing list adjunto:* ${packingList.originalname}`);
    lines.push(`*Fotos adjuntas:* ${photoUrls.length}`);
    lines.push('');
    lines.push(`⏳ En espera de respuesta ${advisorId ? 'del asesor' : 'de Servicio a Cliente'}.`);

    const attachments: string[] = [...photoUrls];
    if (packingListUrl) attachments.push(packingListUrl);

    await pool.query(
      `INSERT INTO ticket_messages (ticket_id, sender_type, message, attachments)
       VALUES ($1, 'client', $2, $3)`,
      [ticketId, lines.join('\n'), JSON.stringify(attachments)]
    );

    // Notificaciones
    try {
      const { createCustomNotification } = await import('./notificationController');
      // Al cliente
      await createCustomNotification(
        userId,
        `📝 Cotización ${ticketFolio} enviada`,
        advisorId
          ? 'Tu solicitud fue enviada a tu asesor. Te avisaremos cuando responda.'
          : 'Tu solicitud fue enviada a Servicio a Cliente. Te avisaremos cuando respondan.',
        'quote_request',
        'file-document-edit',
        { ticket_id: String(ticketId), ticket_folio: ticketFolio },
        `/support/ticket/${ticketId}`
      );
      // Al asesor
      if (advisorId) {
        await createCustomNotification(
          advisorId,
          `📝 Nueva cotización formal — ${ticketFolio}`,
          `${user.full_name || 'Tu cliente'} solicitó una cotización formal de ${servicio}.`,
          'quote_request',
          'file-document-edit',
          { ticket_id: String(ticketId), ticket_folio: ticketFolio, client_id: String(userId) },
          `/support/ticket/${ticketId}`
        );
      }
    } catch (e) {
      console.error('Error notificación cotización formal:', e);
    }

    // WhatsApp confirmación al cliente (plantilla específica de cotización)
    try {
      if (user.phone) {
        sendQuoteRequestConfirmation(
          user.phone,
          user.full_name || 'Cliente',
          ticketFolio,
          String(servicio).toUpperCase()
        ).catch(() => {});
      }
    } catch (e) { /* noop */ }

    // WhatsApp al asesor: aviso de cotización pendiente con cliente + servicio + volumen/peso
    try {
      if (advisorId) {
        // Asegurar phone del asesor (puede venir null en el JOIN si advisor_id no estaba seteado al cargar user)
        let advisorPhone: string | null = user.advisor_phone || null;
        let advisorName: string | null = user.advisor_name || null;
        if (!advisorPhone) {
          const ar = await pool.query(
            `SELECT full_name, phone FROM users WHERE id = $1`,
            [advisorId]
          );
          if (ar.rows[0]) {
            advisorPhone = ar.rows[0].phone || null;
            advisorName = advisorName || ar.rows[0].full_name || null;
          }
        }
        if (!advisorPhone) {
          console.warn(`[QUOTE→WA] Asesor ${advisorId} sin phone. No se envía WhatsApp. Ticket=${ticketFolio}`);
        } else {
          const volumen = cbm
            ? `${Number(cbm).toFixed(2)} CBM`
            : peso
              ? `${Number(peso).toFixed(2)} kg`
              : cantidad
                ? `${cantidad} pieza(s)`
                : '—';
          const clienteLabel = user.box_id ? String(user.box_id) : (user.full_name || 'Cliente');
          console.log(`[QUOTE→WA] Enviando aviso asesor=${advisorId} phone=${advisorPhone} ticket=${ticketFolio}`);
          sendAdvisorQuotePending(
            advisorPhone,
            advisorName || 'Asesor',
            clienteLabel,
            String(servicio).toUpperCase(),
            volumen,
            ticketFolio,
          ).catch((e) => console.error('[QUOTE→WA] sendAdvisorQuotePending error:', e));
        }
      } else {
        console.warn(`[QUOTE→WA] Sin advisorId asignado al cliente. Ticket=${ticketFolio}`);
      }
    } catch (e) { console.error('[QUOTE→WA] excepción:', e); }

    return res.json({
      ok: true,
      ticketId,
      ticketFolio,
      assignedToAdvisor: !!advisorId,
      photosUploaded: photoUrls.length,
      packingListUploaded: !!packingListUrl,
      message: advisorId
        ? `Solicitud enviada al asesor ${user.advisor_name || ''}. En espera de respuesta.`
        : 'Solicitud enviada a Servicio a Cliente. En espera de respuesta.'
    });
  } catch (err: any) {
    console.error('Error createFormalQuoteRequest:', err);
    return res.status(500).json({ error: 'Error creando solicitud de cotización formal' });
  }
};

// 🌐 PÚBLICO: Levantar reclamación de box_id (sin auth)
export const submitBoxIdClaim = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureClaimsTable();

    const {
      box_id,
      full_name,
      email,
      phone,
      message
    } = req.body || {};

    // Validaciones básicas
    if (!box_id || String(box_id).trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Número de cliente requerido' });
    }
    if (!full_name || String(full_name).trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Nombre completo requerido' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return res.status(400).json({ success: false, error: 'Correo electrónico inválido' });
    }
    if (!phone || String(phone).trim().length < 7) {
      return res.status(400).json({ success: false, error: 'Teléfono requerido' });
    }

    const files = (req as any).files || {};
    const ineFrontFile = files.ine_front?.[0];
    const ineBackFile = files.ine_back?.[0];

    if (!ineFrontFile) {
      return res.status(400).json({ success: false, error: 'Foto de INE (frente) requerida' });
    }

    // Subir INE a S3 (con fallback a disco)
    const uploadClaimFile = async (f: Express.Multer.File, prefix: string): Promise<string> => {
      const ext = path.extname(f.originalname) || '.jpg';
      const filename = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
      if (isS3Configured()) {
        return await uploadToS3(f.buffer, `support/claims/${filename}`, f.mimetype);
      }
      const filePath = path.join(claimsUploadsDir, filename);
      fs.writeFileSync(filePath, f.buffer);
      const apiBase = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
      return `${apiBase}/uploads/support/claims/${filename}`;
    };

    const ineFrontUrl = await uploadClaimFile(ineFrontFile, 'claim-front');
    const ineBackUrl = ineBackFile ? await uploadClaimFile(ineBackFile, 'claim-back') : null;

    const folio = generateClaimFolio();
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
    const ua = req.headers['user-agent'] || '';

    const inserted = await pool.query(
      `INSERT INTO box_id_claims
         (folio, claimed_box_id, full_name, email, phone, message,
          ine_front_url, ine_back_url, status, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10)
       RETURNING id, folio, created_at`,
      [
        folio,
        String(box_id).trim().toUpperCase(),
        String(full_name).trim(),
        String(email).trim().toLowerCase(),
        String(phone).trim(),
        message ? String(message).trim().slice(0, 2000) : null,
        ineFrontUrl,
        ineBackUrl,
        ip.slice(0, 60),
        String(ua).slice(0, 500)
      ]
    );

    const claim = inserted.rows[0];

    // Notificar a todo Servicio a Cliente + Admins
    try {
      const { createCustomNotification } = await import('./notificationController');
      const staff = await pool.query(
        `SELECT id FROM users
          WHERE role IN ('customer_service','admin','super_admin')
            AND (status IS NULL OR status = 'active')`
      );
      const title = '🆘 Reclamación de número de cliente';
      const msg = `${claim.folio}: ${full_name} reclama el número ${String(box_id).toUpperCase()}`;
      const actionUrl = `/admin/support/box-id-claims/${claim.id}`;
      await Promise.all(
        staff.rows.map((s: any) =>
          createCustomNotification(
            s.id,
            title,
            msg,
            'warning',
            'shield-alert',
            { claimId: claim.id, folio: claim.folio, boxId: String(box_id).toUpperCase() },
            actionUrl
          )
        )
      );
    } catch (notifErr) {
      console.warn('No se pudo notificar a staff sobre claim:', notifErr);
    }

    return res.json({
      success: true,
      folio: claim.folio,
      claimId: claim.id,
      message: 'Tu reclamación fue registrada. Servicio a cliente la revisará y te contactará a tu correo.'
    });
  } catch (error: any) {
    console.error('Error en submitBoxIdClaim:', error);
    return res.status(500).json({ success: false, error: 'Error al registrar la reclamación' });
  }
};

// 👮 ADMIN: Listar claims
export const getBoxIdClaims = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureClaimsTable();
    const { status } = req.query;
    let q = `SELECT * FROM box_id_claims`;
    const params: any[] = [];
    if (status && typeof status === 'string') {
      params.push(status);
      q += ` WHERE status = $1`;
    }
    q += ` ORDER BY created_at DESC LIMIT 200`;
    const r = await pool.query(q, params);
    return res.json({ success: true, claims: r.rows });
  } catch (error) {
    console.error('Error getBoxIdClaims:', error);
    return res.status(500).json({ success: false, error: 'Error al obtener reclamaciones' });
  }
};

// 👮 ADMIN: Resolver claim
export const resolveBoxIdClaim = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureClaimsTable();
    const { id } = req.params;
    const { status, admin_notes } = req.body || {};
    const userId = (req as any).user?.userId;
    const allowed = ['pending', 'in_review', 'resolved', 'rejected'];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({ success: false, error: 'Estado inválido' });
    }
    const isFinal = status === 'resolved' || status === 'rejected';
    await pool.query(
      `UPDATE box_id_claims
          SET status = $1,
              admin_notes = COALESCE($2, admin_notes),
              resolved_by_user_id = CASE WHEN $3::boolean THEN $4 ELSE resolved_by_user_id END,
              resolved_at = CASE WHEN $3::boolean THEN NOW() ELSE resolved_at END
        WHERE id = $5`,
      [status, admin_notes || null, isFinal, userId, id]
    );
    return res.json({ success: true });
  } catch (error) {
    console.error('Error resolveBoxIdClaim:', error);
    return res.status(500).json({ success: false, error: 'Error al actualizar reclamación' });
  }
};

/**
 * POST /api/support/ai-enhance
 * Mejora el borrador de un agente con IA para hacerlo profesional
 */
export const aiEnhanceMessage = async (req: Request, res: Response): Promise<any> => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length < 3) {
      return res.status(400).json({ error: 'Texto requerido' });
    }

    if (!OPENAI_API_KEY) {
      return res.status(503).json({ error: 'Servicio de IA no configurado' });
    }

    const systemPrompt = `Eres el Agente de Éxito del Cliente (Customer Success) de EntregaX, la plataforma líder en logística internacional y pagos corporativos. Eres la voz de la empresa: profesional, altamente capacitado, empático y resolutivo.

Tu Misión: Transformar cada interacción —ya sea una duda simple o un problema crítico (paquete retrasado, pago no reflejado, etc.)— en una experiencia tranquilizadora y de alta calidad para el cliente. Toma el borrador del agente y conviértelo en un mensaje pulido, con cuerpo y listo para enviarse.

Reglas Estrictas de Redacción:
1. Empatía Inmediata: Inicia siempre validando la emoción o el problema del cliente. Ej: "Entiendo perfectamente lo importante que es este envío para usted..."
2. Claridad y Solución: Ve directo al grano. Explica el qué, el porqué y el cómo en párrafos cortos. No uses jerga logística compleja sin explicarla.
3. Identidad de Marca (Obligatorio): Menciona el nombre "EntregaX" de forma natural en la respuesta para reforzar la confianza institucional.
4. Fidelidad: NO inventes datos, fechas, montos o promesas que el agente no haya incluido. Mejora la forma, respeta el fondo.
5. Cierre de Servicio (Obligatorio): La despedida debe incluir siempre una variación de "estamos a su servicio" o "quedo a su entera disposición". El cliente debe sentir respaldo total.
6. Tono: Institucional pero cálido. Habla siempre de "usted". Seguro, rápido y enfocado en soluciones.
7. Ortografía: Corrección gramatical y ortográfica absoluta en español de México.

Salida: Devuelve ÚNICAMENTE el texto final mejorado. Sin comillas extra, sin explicaciones de lo que hiciste, sin saludos genéricos de IA.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Borrador del agente:\n\n${text.trim()}` },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenAI error:', err);
      return res.status(502).json({ error: 'Error al contactar servicio de IA' });
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const improved = data?.choices?.[0]?.message?.content?.trim() || '';

    if (!improved) {
      return res.status(502).json({ error: 'La IA no devolvió respuesta' });
    }

    res.json({ success: true, improved });
  } catch (error) {
    console.error('Error aiEnhanceMessage:', error);
    res.status(500).json({ error: 'Error interno' });
  }
};

/**
 * POST /api/support/ai-translate
 * Traduce un mensaje bajo demanda. El texto original nunca se modifica en DB.
 * Body: { text: string, targetLang?: string }  (targetLang default: "es")
 */
export const aiTranslateMessage = async (req: Request, res: Response): Promise<any> => {
  try {
    const { text, targetLang = 'es' } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length < 2) {
      return res.status(400).json({ error: 'Texto requerido' });
    }

    if (!OPENAI_API_KEY) {
      return res.status(503).json({ error: 'Servicio de IA no configurado' });
    }

    const langNames: Record<string, string> = {
      es: 'Spanish (Mexican)',
      en: 'English',
      zh: 'Chinese (Simplified)',
      pt: 'Portuguese',
      fr: 'French',
    };
    const targetName = langNames[targetLang] || targetLang;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a professional translator for a logistics customer support platform. Translate the following message to ${targetName}. Output ONLY the translated text — no explanations, no quotes, no preamble.`,
          },
          { role: 'user', content: text.trim() },
        ],
        max_tokens: 600,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Error al contactar servicio de traducción' });
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const translated = data?.choices?.[0]?.message?.content?.trim() || '';

    if (!translated) {
      return res.status(502).json({ error: 'La IA no devolvió traducción' });
    }

    res.json({ success: true, translated, targetLang });
  } catch (error) {
    console.error('Error aiTranslateMessage:', error);
    res.status(500).json({ error: 'Error interno' });
  }
};

/**
 * GET /api/admin/support/image-sign?key=support/filename.jpg
 * Genera una signed URL temporal (1h) para imágenes privadas de soporte en S3
 */
export const signSupportImage = async (req: Request, res: Response): Promise<any> => {
  try {
    const { key } = req.query as { key?: string };
    if (!key) return res.status(400).json({ error: 'key requerida' });
    const safeKey = decodeURIComponent(key);
    if (!safeKey.startsWith('support/')) return res.status(403).json({ error: 'No permitido' });
    if (!isS3Configured()) return res.status(503).json({ error: 'S3 no configurado' });
    const signedUrl = await getSignedDownloadUrl(safeKey, 3600);
    res.json({ signedUrl });
  } catch (err) {
    console.error('Error generando signed URL:', err);
    res.status(500).json({ error: 'Error generando URL' });
  }
};

// ──────────────────────────────────────────────────────────
// Multer para solicitudes de cotización del asesor
// ──────────────────────────────────────────────────────────
const advisorQuoteMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/|^application\/pdf$|^application\/vnd\.ms-excel$|^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet$|^text\/csv$/.test(file.mimetype);
    cb(null, ok);
  }
}).fields([
  { name: 'photos', maxCount: 10 },
  { name: 'documents', maxCount: 5 },
]);

export const uploadAdvisorQuoteFiles = (req: Request, res: Response, next: Function) => {
  advisorQuoteMulter(req, res, (err: any) => {
    if (err) console.warn('⚠️ Error multer advisor-quote:', err.message || err);
    next();
  });
};

/**
 * POST /api/advisor/quote-requests
 * Asesor solicita cotización especializada para un cliente.
 * Crea un ticket con categoría quote_request y sube los archivos adjuntos.
 */
export const createAdvisorQuoteRequest = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureDepartmentsSchema();
    const advisorId = (req as any).user?.userId;
    if (!advisorId) return res.status(401).json({ error: 'No autenticado' });

    const {
      client_id, servicio, maritimo_tipo, destination_address, box_blocks, total_cbm, total_pieces,
      peso_kg, product_description, has_brand, has_brand_letter, con_recoleccion,
      direccion_recoleccion, origin_address, merchandise_value_usd,
    } = req.body || {};

    if (!product_description) return res.status(400).json({ error: 'product_description requerido' });

    const numClientId = parseInt(client_id) || 0;
    let client = { id: null as any, full_name: 'Cliente Nuevo', box_id: null };
    if (numClientId > 0) {
      const clientRow = await pool.query('SELECT id, full_name, box_id FROM users WHERE id=$1', [numClientId]);
      if (clientRow.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
      client = clientRow.rows[0];
    }

    const advisorRow = await pool.query('SELECT full_name, phone FROM users WHERE id=$1', [advisorId]);
    const advisor = advisorRow.rows[0];

    // Subir archivos
    const filesObj = (req.files as { [field: string]: Express.Multer.File[] } | undefined) || {};
    const photos = filesObj.photos || [];
    const documents = filesObj.documents || [];

    const uploadFile = async (f: Express.Multer.File, prefix: string): Promise<string> => {
      const ext = path.extname(f.originalname) || '';
      const filename = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      if (isS3Configured()) {
        return await uploadToS3(f.buffer, `support/${filename}`, f.mimetype);
      }
      const filePath = path.join(supportUploadsDir, filename);
      fs.writeFileSync(filePath, f.buffer);
      const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
      return `${baseUrl}/uploads/support/${filename}`;
    };

    const photoUrls: string[] = [];
    for (const p of photos) {
      try { photoUrls.push(await uploadFile(p, 'aqr-photo')); } catch {}
    }
    const docUrls: string[] = [];
    for (const d of documents) {
      try { docUrls.push(await uploadFile(d, 'aqr-doc')); } catch {}
    }

    // Construir cuerpo del ticket
    let blocks: any[] = [];
    try { blocks = JSON.parse(box_blocks || '[]'); } catch {}

    const servicioLabel = servicio === 'aereo' ? '✈️ Aéreo' : '🚢 Marítimo';
    const maritimoLabel = servicio === 'maritimo'
      ? (maritimo_tipo === 'lcl' ? ' · LCL' : maritimo_tipo === 'fcl40hq' ? ' · FCL 40 HQ' : ' · FCL 40')
      : '';

    const bodyLines = [
      `📦 SOLICITUD DE COTIZACIÓN — ASESOR: ${advisor?.full_name || advisorId}`,
      `\n📡 Servicio: ${servicioLabel}${maritimoLabel}`,
      servicio === 'aereo' && peso_kg ? `\n⚖️ Peso: ${peso_kg} kg` : '',
      `\n👤 Cliente: ${client.full_name} (${client.box_id || 'sin Box ID'})`,
      servicio === 'maritimo' ? `\n📐 CBM Total: ${parseFloat(total_cbm || 0).toFixed(4)} CBM · ${total_pieces || 0} pzas` : '',
      blocks.length > 0 ? `\nBloques:\n${blocks.map((b: any, i: number) => `  ${i + 1}. ${b.largo}×${b.ancho}×${b.alto} cm · qty ${b.cantidad}`).join('\n')}` : '',
      `\n📍 Destino: ${destination_address || '—'}`,
      `\n🏭 Origen proveedor: ${origin_address || '—'}`,
      con_recoleccion === 'true' ? '\n🚚 Con recolección' : '\n🚚 Sin recolección (entrega en bodega)',
      con_recoleccion === 'true' && direccion_recoleccion ? `\n📍 Dirección de recolección: ${direccion_recoleccion}` : '',
      `\n🔖 Producto: ${product_description}`,
      `\n🏷️ Marca registrada: ${has_brand === 'true' ? (has_brand_letter === 'true' ? 'Sí (con carta de uso)' : 'Sí (sin carta de uso)') : 'No'}`,
      merchandise_value_usd ? `\n💵 Valor mercancía: $${parseFloat(merchandise_value_usd).toLocaleString('es-MX')} USD` : '',
      photoUrls.length > 0 ? `\n📷 Fotos:\n${photoUrls.map(u => `  - ${u}`).join('\n')}` : '',
      docUrls.length > 0 ? `\n📎 Documentos:\n${docUrls.map(u => `  - ${u}`).join('\n')}` : '',
    ].filter(Boolean).join('');

    // Obtener department_id de Cotizaciones
    const deptRes = await pool.query(`SELECT id FROM support_departments WHERE name = 'Cotizaciones' LIMIT 1`);
    const departmentId = deptRes.rows[0]?.id || null;

    // Generar folio único
    const folioTs = Date.now().toString(36).toUpperCase();
    const folioRand = Math.random().toString(36).substring(2, 5).toUpperCase();
    const folio = `TKT-ACQ-${folioTs}-${folioRand}`;

    // Asegurar columna metadata
    await pool.query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS metadata JSONB`);
    await pool.query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS body TEXT`);

    const ticketRes = await pool.query(
      `INSERT INTO support_tickets
         (ticket_folio, user_id, category, subject, status, creator_type, department_id, assigned_to, priority)
       VALUES ($1, $2, 'quote', $3, 'escalated_human', 'advisor', $4, $5, 'normal')
       RETURNING id, ticket_folio`,
      [folio, numClientId > 0 ? numClientId : null, `Solicitud cotización — ${client.full_name}`, departmentId, advisorId]
    );
    const ticketId = ticketRes.rows[0].id;
    const ticketFolio = ticketRes.rows[0].ticket_folio;

    // Guardar body y metadata por separado (columnas opcionales)
    try {
      await pool.query(`UPDATE support_tickets SET body = $1, metadata = $2 WHERE id = $3`, [
        bodyLines,
        JSON.stringify({
          servicio, maritimo_tipo, box_blocks: blocks, total_cbm, total_pieces, peso_kg,
          destination_address, origin_address, product_description,
          con_recoleccion, direccion_recoleccion,
          has_brand, has_brand_letter, merchandise_value_usd,
          photo_urls: photoUrls, doc_urls: docUrls, requested_by_advisor_id: advisorId,
        }),
        ticketId,
      ]);
    } catch (e) { console.warn('No se pudo guardar body/metadata:', e); }

    // Primer mensaje del ticket
    try {
      await pool.query(
        `INSERT INTO ticket_messages (ticket_id, sender_id, sender_type, message)
         VALUES ($1, $2, 'agent', $3)`,
        [ticketId, advisorId, bodyLines]
      );
    } catch (e) { console.warn('No se pudo insertar mensaje:', e); }

    res.json({ success: true, ticket_id: ticketId, ticket_folio: ticketFolio });
  } catch (err: any) {
    console.error('Error createAdvisorQuoteRequest:', err);
    res.status(500).json({ error: 'Error al crear solicitud de cotización', details: err.message });
  }
};
