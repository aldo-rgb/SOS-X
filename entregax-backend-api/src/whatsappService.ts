/**
 * WhatsApp Service — Meta WhatsApp Cloud API.
 *
 * Variables de entorno (todas obligatorias para habilitar el módulo):
 *   WHATSAPP_PHONE_NUMBER_ID   ID del número (no el número en sí). Lo das de alta en
 *                              Meta Business → WhatsApp → API Setup.
 *   WHATSAPP_ACCESS_TOKEN      Token "System User" (preferido, no expira) o token temporal.
 *   WHATSAPP_API_VERSION       Default: v23.0
 *   WHATSAPP_DEFAULT_COUNTRY   Default: 52 (México). Se prefija si el número no incluye +.
 *
 * Plantillas que debes aprobar en Meta Business (Message Templates):
 *   1) name: "welcome_entregax"        — para usuarios recién creados
 *      categoría: MARKETING o UTILITY
 *      idioma: es_MX
 *      body con dos variables: {{1}} = nombre, {{2}} = box_id
 *      Ej: "¡Hola {{1}}! 👋 Bienvenido a EntregaX. Tu casillero es {{2}}. ..."
 *
 *   2) name: "verification_code"        — para OTP de verificación de teléfono
 *      categoría: AUTHENTICATION (obligatoria — Meta tiene plantillas autogeneradas)
 *      idioma: es_MX
 *      body con UNA variable: {{1}} = código de 6 dígitos
 *      Ej: "*{{1}}* es tu código de verificación. Por seguridad, no lo compartas con nadie."
 *
 *   3) name: "ticket_recibido"          — confirmación al cliente al abrir ticket de soporte
 *      categoría: UTILITY
 *      idioma: es_MX
 *      body con dos variables: {{1}} = nombre, {{2}} = ticket_folio
 *      Ej: "¡Hola {{1}}! 🎫 Tu ticket de soporte *{{2}}* fue recibido. Nuestro equipo lo está atendiendo y te contactaremos pronto. Gracias por comunicarte con EntregaX."
 *
 *   4) name: "ticket_resuelto"          — notificación al cliente cuando el ticket es cerrado/resuelto
 *      categoría: UTILITY
 *      idioma: es_MX
 *      body con dos variables: {{1}} = nombre, {{2}} = ticket_folio
 *      Ej: "¡Hola {{1}}! ✅ Tu ticket *{{2}}* ha sido marcado como resuelto. Si el problema persiste o necesitas continuar, puedes reabrirlo en la sección *Atención a Cliente* de tu portal EntregaX."
 *
 * Si WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID no están definidas, las
 * funciones loggean en lugar de mandar — el registro NO se rompe.
 */

import axios from 'axios';
import { pool } from './db';

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v23.0';

// Cache en memoria del idioma que Meta acepta para cada plantilla.
// Evita repetir los fallbacks (y el ruido en logs) en cada envío.
//   Map<templateName, languageCode>
const templateLangCache = new Map<string, string>();

interface SendTemplateOptions {
    to: string;
    template: string;
    languageCode?: string;
    parameters?: string[];   // body params en orden ({{1}}, {{2}}, ...)
    headerParameters?: string[]; // header params si la plantilla tiene header con vars
    headerImageUrl?: string; // URL pública HTTPS si la plantilla tiene encabezado IMAGEN
}

const isEnabled = (): boolean => {
    return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
};

/**
 * Normaliza a formato E.164 sin '+' (lo que pide Meta).
 * Reglas:
 *  - Si ya empieza con '+', quitamos '+'.
 *  - Si empieza con '00', quitamos.
 *  - Si no incluye código de país y mide 10 dígitos, prefijamos WHATSAPP_DEFAULT_COUNTRY (52).
 *  - Quitamos espacios, guiones, paréntesis.
 */
export const normalizePhone = (raw: string): string | null => {
    if (!raw) return null;
    let clean = String(raw).replace(/[\s\-()]/g, '').trim();
    if (clean.startsWith('+')) clean = clean.slice(1);
    if (clean.startsWith('00')) clean = clean.slice(2);
    if (!/^\d+$/.test(clean)) return null;
    const defaultCountry = process.env.WHATSAPP_DEFAULT_COUNTRY || '52';
    if (clean.length === 10) {
        clean = `${defaultCountry}${clean}`;
    }
    // Validaciones básicas (entre 11 y 15 dígitos)
    if (clean.length < 11 || clean.length > 15) return null;
    return clean;
};

/**
 * Envía mensaje basado en plantilla. Único método permitido para mensajes
 * proactivos (fuera de la ventana de 24h). Lanza error si Meta responde 4xx/5xx.
 */
export const sendTemplate = async (opts: SendTemplateOptions): Promise<{ ok: boolean; messageId?: string; skipped?: boolean; error?: string }> => {
    if (!isEnabled()) {
        console.warn('[WHATSAPP] Desactivado (faltan envs). Mensaje no enviado a', opts.to);
        return { ok: false, skipped: true };
    }

    const normalized = normalizePhone(opts.to);
    if (!normalized) {
        return { ok: false, error: 'Teléfono inválido' };
    }

    const components: any[] = [];

    if (opts.headerImageUrl && String(opts.headerImageUrl).trim()) {
        // Encabezado de IMAGEN: Meta exige el componente header con la imagen en
        // cada envío (URL pública HTTPS; la de la plantilla es solo la muestra).
        components.push({
            type: 'header',
            parameters: [{ type: 'image', image: { link: String(opts.headerImageUrl).trim() } }],
        });
    } else if (opts.headerParameters && opts.headerParameters.length > 0) {
        components.push({
            type: 'header',
            parameters: opts.headerParameters.map(v => ({ type: 'text', text: String(v) })),
        });
    }

    if (opts.parameters && opts.parameters.length > 0) {
        components.push({
            type: 'body',
            parameters: opts.parameters.map(v => ({ type: 'text', text: String(v) })),
        });
    }

    // Si ya conocemos el idioma que Meta acepta para esta plantilla, úsalo.
    const cachedLang = templateLangCache.get(opts.template);
    const effectiveLang = opts.languageCode
        || cachedLang
        || process.env.WHATSAPP_DEFAULT_LANG
        || 'es_MX';

    const payload = {
        messaging_product: 'whatsapp',
        to: normalized,
        type: 'template',
        template: {
            name: opts.template,
            language: { code: effectiveLang },
            ...(components.length > 0 ? { components } : {}),
        },
    };

    try {
        const url = `https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
        const { data } = await axios.post(url, payload, {
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            timeout: 15000,
        });
        const messageId = data?.messages?.[0]?.id;
        // Cachea el idioma que funcionó para no volver a probar fallbacks.
        if (templateLangCache.get(opts.template) !== effectiveLang) {
            templateLangCache.set(opts.template, effectiveLang);
        }
        console.log(`[WHATSAPP] ✅ Template "${opts.template}" enviado a ${normalized} (lang=${effectiveLang}, id=${messageId})`);
        return { ok: true, messageId };
    } catch (err: any) {
        const meta = err?.response?.data?.error;
        const msg = meta?.message || err?.message || 'Error desconocido';
        const code = meta?.code;
        // Fallback automático cuando la plantilla no existe en ese idioma (#132001)
        const allFallbacks = ['es_MX', 'es', 'es_ES', 'es_LA', 'en_US', 'en'];
        const triedSoFar: string[] = (opts as any)._triedLangs || [effectiveLang];
        const nextLang = allFallbacks.find(l => !triedSoFar.includes(l));
        if (code === 132001 && nextLang) {
            // Fallback esperado: log informativo, no warn (evita ruido en consola/Sentry).
            console.log(`[WHATSAPP] template "${opts.template}" no existe en ${effectiveLang}, probando ${nextLang}...`);
            // Si el idioma cacheado falló (template movido en Meta), invalida cache.
            if (cachedLang === effectiveLang) templateLangCache.delete(opts.template);
            return sendTemplate({
                ...opts,
                languageCode: nextLang,
                ...({ _triedLangs: [...triedSoFar, nextLang] } as any),
            });
        }
        if (code === 132001) {
            console.error(`[WHATSAPP] ❌ Template "${opts.template}" no encontrado en NINGÚN idioma (probados: ${triedSoFar.join(', ')}). Crea/aprueba la plantilla en Meta Business → WhatsApp Manager.`);
        } else {
            console.error(`[WHATSAPP] ❌ Falló template "${opts.template}" a ${normalized}:`, msg, meta);
        }
        return { ok: false, error: msg };
    }
};

// ============================================================
// Helpers de alto nivel — usados por authController/legacyController
// ============================================================

/**
 * Envía el mensaje de bienvenida a un cliente recién creado.
 * Plantilla "welcome_entregax" debe estar aprobada en Meta.
 *
 * NO bloquea ni lanza: si falla, sólo loggea.
 */
export const sendWelcomeWhatsapp = async (params: {
    phone: string | null | undefined;
    fullName: string;
    boxId: string;
}): Promise<void> => {
    if (!params.phone) return;
    try {
        const firstName = (params.fullName || '').split(' ')[0] || 'Cliente';
        await sendTemplate({
            to: params.phone,
            template: process.env.WHATSAPP_WELCOME_TEMPLATE || 'welcome_entregax',
            // Idioma explícito: en Meta esta plantilla está aprobada como "Spanish (SPA)" = es_ES.
            // Se puede sobreescribir con WHATSAPP_WELCOME_TEMPLATE_LANG.
            languageCode: process.env.WHATSAPP_WELCOME_TEMPLATE_LANG || 'es_ES',
            parameters: [firstName, params.boxId],
        });
    } catch (err) {
        console.error('[WHATSAPP] sendWelcomeWhatsapp error:', err);
    }
};

/**
 * Envía un código OTP de 6 dígitos para verificar el teléfono.
 * Plantilla "verification_code" (categoría AUTHENTICATION) en Meta.
 *
 * IMPORTANTE: las plantillas AUTHENTICATION en Meta requieren componente
 * "body" con el código como variable {{1}} y opcionalmente un botón
 * "URL/Copy code". El payload mínimo abajo funciona para AUTHENTICATION
 * con sólo body. Si la plantilla incluye botón de copiar código, hay que
 * añadir component type:"button" sub_type:"url" index:0 parameters:[{ type:"text", text: code }].
 */
export const sendVerificationCodeWhatsapp = async (params: {
    phone: string;
    code: string;
}): Promise<{ ok: boolean; error?: string; skipped?: boolean }> => {
    const templateName = process.env.WHATSAPP_OTP_TEMPLATE || 'autenticacion_entregax';
    // Algunos templates AUTHENTICATION requieren parámetros también en el botón.
    // Construimos el payload manualmente para soportar ambos formatos.
    if (!isEnabled()) {
        console.warn('[WHATSAPP] Desactivado, OTP no enviado a', params.phone, '(code=' + params.code + ')');
        return { ok: false, skipped: true };
    }

    const normalized = normalizePhone(params.phone);
    if (!normalized) return { ok: false, error: 'Teléfono inválido' };

    // Payload AUTHENTICATION estándar: body + button con el mismo código.
    // Si tu plantilla NO tiene botón, Meta ignora el componente "button".
    const payload = {
        messaging_product: 'whatsapp',
        to: normalized,
        type: 'template',
        template: {
            name: templateName,
            language: { code: process.env.WHATSAPP_OTP_TEMPLATE_LANG || 'es_MX' },
            components: [
                {
                    type: 'body',
                    parameters: [{ type: 'text', text: params.code }],
                },
                {
                    type: 'button',
                    sub_type: 'url',
                    index: 0,
                    parameters: [{ type: 'text', text: params.code }],
                },
            ],
        },
    };

    try {
        const url = `https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
        const { data } = await axios.post(url, payload, {
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            timeout: 15000,
        });
        console.log(`[WHATSAPP] ✅ OTP enviado a ${normalized} (id=${data?.messages?.[0]?.id})`);
        return { ok: true };
    } catch (err: any) {
        const meta = err?.response?.data?.error;
        // Reintento sin botón si la plantilla no tiene componente URL button
        if (meta?.code === 132012 || /button/i.test(meta?.message || '')) {
            try {
                const url = `https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
                const fallbackPayload = {
                    ...payload,
                    template: {
                        ...payload.template,
                        components: [payload.template.components[0]],
                    },
                };
                await axios.post(url, fallbackPayload, {
                    headers: {
                        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 15000,
                });
                console.log(`[WHATSAPP] ✅ OTP (fallback sin botón) enviado a ${normalized}`);
                return { ok: true };
            } catch (err2: any) {
                const m2 = err2?.response?.data?.error?.message || err2?.message;
                console.error(`[WHATSAPP] ❌ OTP fallback también falló:`, m2);
                return { ok: false, error: m2 };
            }
        }
        const msg = meta?.message || err?.message || 'Error desconocido';
        console.error(`[WHATSAPP] ❌ OTP a ${normalized} falló:`, msg, meta);
        return { ok: false, error: msg };
    }
};

/**
 * Envía confirmación de ticket al cliente por WhatsApp.
 * Requiere plantilla "ticket_recibido" aprobada en Meta Business (UTILITY, es_MX).
 * Variables: {{1}} = nombre, {{2}} = folio del ticket.
 */
export const sendTicketConfirmation = async (phone: string, nombre: string, ticketFolio: string): Promise<void> => {
    const templateName = process.env.WHATSAPP_TICKET_TEMPLATE || 'ticket_recibido';
    try {
        await sendTemplate({
            to: phone,
            template: templateName,
            languageCode: 'es_MX',
            parameters: [nombre.split(' ')[0] ?? nombre, ticketFolio],
        });
    } catch (e) {
        console.error('[WHATSAPP] Error enviando confirmación de ticket:', e);
    }
};

/**
 * Confirmación de solicitud de cotización formal recibida.
 * Requiere plantilla "cotizacion_recibida" aprobada en Meta Business (UTILITY, es_MX).
 * Variables: {{1}} = nombre, {{2}} = folio del ticket, {{3}} = servicio.
 */
export const sendQuoteRequestConfirmation = async (
    phone: string,
    nombre: string,
    ticketFolio: string,
    servicio: string
): Promise<void> => {
    const templateName = process.env.WHATSAPP_QUOTE_TEMPLATE || 'cotizacion_recibida';
    try {
        await sendTemplate({
            to: phone,
            template: templateName,
            languageCode: 'es_MX',
            parameters: [nombre.split(' ')[0] ?? nombre, ticketFolio, servicio],
        });
    } catch (e) {
        console.error('[WHATSAPP] Error enviando confirmación de cotización:', e);
    }
};

/**
 * Aviso al ASESOR: nueva solicitud de cotización pendiente de generar.
 * Requiere plantilla "cotizacion_pendiente_asesor" aprobada en Meta Business (UTILITY, es_MX).
 * Variables:
 *   {{1}} = nombre del asesor
 *   {{2}} = box id del cliente (ej. "S1")
 *   {{3}} = servicio (MARITIMO/AEREO/POBOX/DHL)
 *   {{4}} = volumen / peso / cantidad (ej. "2.50 CBM", "150.00 kg", "5 pieza(s)")
 *   {{5}} = folio del ticket
 *
 * Sugerencia de body:
 *   "Hola {{1}} 👋, tienes una nueva cotización pendiente de generar.
 *    Cliente: {{2}}
 *    Servicio: {{3}}
 *    Volumen/Peso: {{4}}
 *    Ticket: {{5}}
 *    Entra a EntregaX → Cotizaciones para generar el PDF formal."
 */
export const sendAdvisorQuotePending = async (
    advisorPhone: string,
    advisorName: string,
    clientLabel: string,
    servicio: string,
    volumenOPeso: string,
    ticketFolio: string,
): Promise<void> => {
    const templateName = process.env.WHATSAPP_ADVISOR_QUOTE_PENDING_TEMPLATE || 'cotizacion_pendiente_asesor';
    try {
        await sendTemplate({
            to: advisorPhone,
            template: templateName,
            languageCode: 'es_MX',
            parameters: [
                (advisorName || '').split(' ')[0] || 'Asesor',
                clientLabel,
                servicio,
                volumenOPeso,
                ticketFolio,
            ],
        });
    } catch (e) {
        console.error('[WHATSAPP] Error enviando aviso de cotización al asesor:', e);
    }
};

/**
 * Notifica al cliente que su ticket fue resuelto/cerrado.
 * Requiere plantilla "ticket_resuelto" aprobada en Meta Business (UTILITY, es_MX).
 * Variables: {{1}} = nombre, {{2}} = folio del ticket.
 */
export const sendTicketResolved = async (phone: string, nombre: string, ticketFolio: string): Promise<void> => {
    const templateName = process.env.WHATSAPP_TICKET_RESOLVED_TEMPLATE || 'ticket_resuelto';
    try {
        await sendTemplate({
            to: phone,
            template: templateName,
            languageCode: 'es_MX',
            parameters: [nombre.split(' ')[0] ?? nombre, ticketFolio],
        });
    } catch (e) {
        console.error('[WHATSAPP] Error enviando resolución de ticket:', e);
    }
};

/**
 * Notificación de paquete recibido en bodega.
 * Requiere plantilla "paquete_recibido" aprobada en Meta (UTILITY, es_MX).
 * Variables: {{1}} = nombre, {{2}} = tracking, {{3}} = servicio
 */
export const sendPackageArrival = async (phone: string, nombre: string, tracking: string, servicio: string): Promise<void> => {
    const templateName = process.env.WHATSAPP_PACKAGE_TEMPLATE || 'paquete_recibido';
    try {
        await sendTemplate({
            to: phone,
            template: templateName,
            languageCode: 'es_MX',
            parameters: [nombre.split(' ')[0] ?? nombre, tracking, servicio],
        });
    } catch (e) {
        console.error('[WHATSAPP] Error enviando notificación de paquete:', e);
    }
};

/**
 * Notificación de paquete recibido en bodega (DETALLADA, para TODOS los servicios:
 * PO Box, Marítimo, Aéreo, DHL, TDI Express, etc.).
 * Plantilla: "paquete_recibido_pobox"  (5 variables, categoría UTILITY)
 *
 *   Body del template a aprobar en Meta:
 *   ————————————————————————————————————————
 *   📦 ¡Hola {{1}}! Tu paquete ha llegado.
 *
 *   🔎 Tracking: {{2}}
 *   🚚 Servicio: {{3}}
 *   📦 Cajas: {{4}}
 *   🏷️ Guía origen: {{5}}
 *
 *   ✅ Tu paquete fue recibido exitosamente en nuestra bodega y ya está disponible para asignación de instrucciones de entrega.
 *   ————————————————————————————————————————
 *
 *   {{1}} = nombre (first name del cliente)
 *   {{2}} = tracking interno master (US-/TDX-/LOG-/AIR-/DHL numérico)
 *   {{3}} = servicio (PO Box USA / Marítimo / Aéreo / DHL / TDI Express…)
 *   {{4}} = número de cajas (ej. "1", "3")
 *   {{5}} = guía de origen (ej. "1Z999AA10123456784")
 *           o "Múltiples (ver en portal)" cuando son varias cajas
 *
 * Si no existe la plantilla avanzada, cae al template básico (3 vars) como fallback.
 */
export const sendPoboxReceptionNotification = async (
    phone: string,
    nombre: string,
    trackingMaster: string,
    totalCajas: number,
    guiaOrigen: string | null,
    servicio: string = 'PO Box USA'
): Promise<void> => {
    const templateName = process.env.WHATSAPP_POBOX_RECEPTION_TEMPLATE || 'paquete_recibido_pobox';
    const basicTemplate = process.env.WHATSAPP_PACKAGE_TEMPLATE || 'paquete_recibido';
    const firstName = nombre.split(' ')[0] ?? nombre;
    const servicioParam = servicio || 'EntregaX';
    const guiaParam = guiaOrigen || (totalCajas > 1 ? 'Múltiples (ver en portal)' : 'No registrada');
    try {
        await sendTemplate({
            to: phone,
            template: templateName,
            languageCode: process.env.WHATSAPP_POBOX_TEMPLATE_LANG || 'en',
            parameters: [firstName, trackingMaster, servicioParam, String(totalCajas), guiaParam],
        });
    } catch {
        // Fallback al template básico si la plantilla detallada no está aprobada aún
        try {
            await sendTemplate({
                to: phone,
                template: basicTemplate,
                languageCode: 'es_MX',
                parameters: [firstName, trackingMaster, servicioParam],
            });
        } catch (e) {
            console.error('[WHATSAPP] Error enviando notificación PO Box recepción:', e);
        }
    }
};

/**
 * Helper reutilizable: notifica al CLIENTE por WhatsApp que su paquete llegó a
 * bodega (plantilla detallada), buscando su teléfono y respetando preferencias
 * (notif_whatsapp + notif_<servicio> + teléfono/whatsapp verificado). Pensado
 * para llamarse desde CUALQUIER flujo de recepción (TDX, aéreo, marítimo, etc.).
 * La idempotencia (no enviar 2 veces) es responsabilidad del que llama.
 *
 * serviceKey: 'notif_pobox' | 'notif_air' | 'notif_maritime' | 'notif_dhl' | null
 */
export const notifyArrivalWhatsApp = async (
    userId: number | null | undefined,
    opts: { tracking: string; servicio: string; cajas?: number; guiaOrigen?: string | null; serviceKey?: string | null }
): Promise<void> => {
    if (!userId) return;
    try {
        const allowedKeys = ['notif_pobox', 'notif_air', 'notif_maritime', 'notif_dhl'];
        const serviceCol = opts.serviceKey && allowedKeys.includes(opts.serviceKey) ? opts.serviceKey : null;
        const selectCols = ['notif_whatsapp', 'phone', 'phone_verified', 'whatsapp_verified', 'full_name'];
        if (serviceCol) selectCols.push(`${serviceCol} AS notif_service`);
        const r = await pool.query(`SELECT ${selectCols.join(', ')} FROM users WHERE id = $1`, [userId]);
        const u = r.rows[0];
        if (!u || !u.phone) return;
        const wantWhatsapp = u.notif_whatsapp !== false && (u.phone_verified === true || u.whatsapp_verified === true);
        const wantService = serviceCol ? (u.notif_service !== false) : true;
        if (!wantWhatsapp || !wantService) return;
        await sendPoboxReceptionNotification(
            u.phone,
            u.full_name || 'Cliente',
            opts.tracking,
            opts.cajas ?? 1,
            opts.guiaOrigen ?? null,
            opts.servicio,
        );
    } catch (e: any) {
        console.warn('[WHATSAPP] notifyArrivalWhatsApp falló:', e?.message);
    }
};

/**
 * Notifica al cliente que su envío fue cancelado/eliminado del sistema.
 * Requiere plantilla "envio_cancelado" aprobada en Meta Business (UTILITY, es_MX).
 *
 * Body del template a aprobar:
 * ————————————————————————————————————
 * ¡Hola {{1}}! 📦 Te informamos que el registro del paquete *{{2}}* ha sido
 * cancelado en nuestro sistema. Si crees que es un error o necesitas ayuda,
 * contáctanos a través de tu portal EntregaX.
 * ————————————————————————————————————
 * Variables: {{1}} = nombre (first name), {{2}} = tracking
 */
export const sendEnvioCancelado = async (phone: string, nombre: string, tracking: string): Promise<void> => {
    const templateName = process.env.WHATSAPP_CANCEL_TEMPLATE || 'envio_cancelado';
    const firstName = nombre.split(' ')[0] ?? nombre;
    try {
        await sendTemplate({
            to: phone,
            template: templateName,
            languageCode: process.env.WHATSAPP_CANCEL_TEMPLATE_LANG || 'en',
            parameters: [firstName, tracking],
        });
    } catch {
        // Fallback: si envio_cancelado no está aprobado aún, usar paquete_recibido
        // con un mensaje de contexto para que el cliente sepa que hubo un cambio.
        try {
            const fallback = process.env.WHATSAPP_PACKAGE_TEMPLATE || 'paquete_recibido';
            await sendTemplate({
                to: phone,
                template: fallback,
                languageCode: 'es_MX',
                parameters: [firstName, tracking, 'cancelado'],
            });
        } catch (e) {
            console.error('[WHATSAPP] Error enviando notificación cancelación:', e);
        }
    }
};

/**
 * Confirmación de operación XPay al cliente.
 * Plantilla: "xpay_confirmacion"  (UTILITY, es_MX)
 *
 * Body sugerido para aprobar en Meta:
 * ————————————————————————————————————————
 * ✅ ¡Hola {{1}}! Tu operación XPay fue recibida.
 *
 * 💵 Monto a enviar: {{2}}
 * 💰 Total a depositar: {{3}} MXN
 * 🏢 Beneficiario: {{4}}
 *
 * 🏦 *Datos de depósito:*
 * Banco: {{5}}
 * Cuenta: {{6}}
 * CLABE: {{7}}
 *
 * 📌 Referencia: *{{8}}*
 * Incluye esta referencia en el concepto de tu transferencia.
 *
 * Una vez realizado el depósito, sube tu comprobante desde "Últimos envíos".
 * ————————————————————————————————————————
 *   {{1}} = nombre del cliente (first name)
 *   {{2}} = monto divisa (ej. "$10,010.00 USD")
 *   {{3}} = total MXN (ej. "$190,375.97")
 *   {{4}} = beneficiario / destino
 *   {{5}} = banco de depósito
 *   {{6}} = número de cuenta
 *   {{7}} = CLABE
 *   {{8}} = referencia de pago (ej. "XP600876")
 */
export const sendXPayConfirmation = async (params: {
    phone: string;
    nombre: string;
    montoUsd: string;
    totalMxn: string;
    beneficiario: string;
    banco: string;
    cuenta: string;
    clabe: string;
    referencia: string;
}): Promise<void> => {
    const templateName = process.env.WHATSAPP_XPAY_CONFIRM_TEMPLATE || 'xpay_confirmacion';
    const firstName = params.nombre.split(' ')[0] ?? params.nombre;
    try {
        await sendTemplate({
            to: params.phone,
            template: templateName,
            languageCode: 'es',   // plantilla registrada como Spanish (SPA)
            parameters: [
                firstName,
                params.montoUsd,
                params.totalMxn,
                params.beneficiario || '—',
                params.banco || '—',
                params.cuenta || '—',
                params.clabe || '—',
                params.referencia,
            ],
        });
    } catch (e) {
        console.error('[WHATSAPP] Error enviando confirmación XPay:', e);
    }
};

/**
 * Notificación al cliente: ENTANGLED confirmó el pago al proveedor.
 * El cliente ya puede ver su comprobante en X-Pay.
 * Plantilla: "xpay_pago_confirmado"  (UTILITY, es_MX)
 *
 * Body sugerido para aprobar en Meta:
 * ————————————————————————————————————————
 * ✅ ¡Hola {{1}}! Tu pago XPay fue procesado exitosamente.
 *
 * 📋 Referencia: *{{2}}*
 * 💵 Monto enviado: {{3}}
 * 🏢 Beneficiario: {{4}}
 *
 * Puedes consultar el comprobante de pago directamente en X-Pay → "Últimos envíos".
 *
 * Gracias por confiar en EntregaX 🙌
 * ————————————————————————————————————————
 *   {{1}} = nombre del cliente (first name)
 *   {{2}} = referencia de pago (ej. "XP600876")
 *   {{3}} = monto enviado (ej. "$10,010.00 USD")
 *   {{4}} = beneficiario / destino
 */
export const sendXPayPagoConfirmado = async (params: {
    phone: string;
    nombre: string;
    referencia: string;
    monto: string;
    beneficiario: string;
}): Promise<void> => {
    const templateName = process.env.WHATSAPP_XPAY_PAID_TEMPLATE || 'xpay_pago_confirmado';
    const firstName = params.nombre.split(' ')[0] ?? params.nombre;
    try {
        await sendTemplate({
            to: params.phone,
            template: templateName,
            languageCode: 'es',   // plantilla registrada como Spanish (SPA)
            parameters: [
                firstName,
                params.referencia,
                params.monto || '—',
                params.beneficiario || '—',
            ],
        });
    } catch (e) {
        console.error('[WHATSAPP] Error enviando confirmación de pago XPay:', e);
    }
};

export const whatsappStatus = (): { enabled: boolean; phoneNumberId: string | null } => {
    return {
        enabled: isEnabled(),
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID
            ? `${process.env.WHATSAPP_PHONE_NUMBER_ID.slice(0, 4)}…`
            : null,
    };
};
