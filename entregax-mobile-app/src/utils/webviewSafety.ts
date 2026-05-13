/**
 * Validación de URLs para WebViews y Linking.openURL externo.
 *
 * Solo permite HTTPS y hosts en allowlist (PayPal sandbox+prod, OpenPay,
 * backend propio). Bloquea esquemas peligrosos (javascript:, data:, file:).
 */

const ALLOWED_HOSTS = [
  // PayPal
  'paypal.com',
  'www.paypal.com',
  'www.sandbox.paypal.com',
  'sandbox.paypal.com',
  // OpenPay
  'openpay.mx',
  'sandbox-api.openpay.mx',
  'api.openpay.mx',
  // Backend propio
  'sos-x-production.up.railway.app',
  'app.entregax.com',
  'entregax.com',
];

export function isAllowedUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    // Solo HTTPS (bloquea javascript:, data:, file:, http://)
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return ALLOWED_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

/**
 * Allowlist para schemes externos vía Linking.openURL en flujos no-WebView
 * (mapas, WhatsApp, ajustes de iOS). Bloquea cualquier URL inesperada.
 */
const ALLOWED_EXTERNAL_SCHEMES = [
  'https:',
  'mailto:',
  'tel:',
  'whatsapp:',
  'maps:',
  'comgooglemaps:',
  'app-settings:',
];

export function isSafeExternalUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    // Para URLs sin host (mailto:, tel:, app-settings:) URL parser puede fallar.
    // Validamos por prefijo de scheme.
    const lower = url.toLowerCase().trim();
    return ALLOWED_EXTERNAL_SCHEMES.some((s) => lower.startsWith(s));
  } catch {
    return false;
  }
}
