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
 * Si WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID no están definidas, las
 * funciones loggean en lugar de mandar — el registro NO se rompe.
 */

import axios from 'axios';

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v23.0';

interface SendTemplateOptions {
    to: string;
    template: string;
    languageCode?: string;
    parameters?: string[];   // body params en orden ({{1}}, {{2}}, ...)
    headerParameters?: string[]; // header params si la plantilla tiene header con vars
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

    if (opts.headerParameters && opts.headerParameters.length > 0) {
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

    const payload = {
        messaging_product: 'whatsapp',
        to: normalized,
        type: 'template',
        template: {
            name: opts.template,
            language: { code: opts.languageCode || 'es_MX' },
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
        console.log(`[WHATSAPP] ✅ Template "${opts.template}" enviado a ${normalized} (id=${messageId})`);
        return { ok: true, messageId };
    } catch (err: any) {
        const meta = err?.response?.data?.error;
        const msg = meta?.message || err?.message || 'Error desconocido';
        console.error(`[WHATSAPP] ❌ Falló template "${opts.template}" a ${normalized}:`, msg, meta);
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
    const templateName = process.env.WHATSAPP_OTP_TEMPLATE || 'verification_code';
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

export const whatsappStatus = (): { enabled: boolean; phoneNumberId: string | null } => {
    return {
        enabled: isEnabled(),
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID
            ? `${process.env.WHATSAPP_PHONE_NUMBER_ID.slice(0, 4)}…`
            : null,
    };
};
