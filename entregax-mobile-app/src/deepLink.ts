/**
 * Deep links de EntregaX (Universal Link iOS / App Link Android + esquema entregax://).
 *
 *   https://entregax.app/instrucciones/<TRN>  → abrir app en Home filtrado al paquete
 *                                                (botón "generar/asignar instrucciones").
 *   https://entregax.app/pagar/<TRN>          → abrir app en la guía lista para pagar
 *                                                (botón "pagar embarque"). Etapa 1: solo
 *                                                abre la app en la guía; el auto-pago llega después.
 *
 * Flujo:
 *   - Arranque en frío: App captura la URL inicial → guarda el deep link pendiente.
 *     Bootstrap valida sesión y navega a Home; al montarse, Home consume el
 *     pendiente y aplica el filtro.
 *   - App ya abierta en Home (warm): el evento 'url' llama directo al listener.
 */

export type DeepLinkAction = 'instrucciones' | 'pagar';
export interface DeepLinkTarget { action: DeepLinkAction; trn: string; }

// Extrae { action, trn } de una URL de EntregaX. Devuelve null si no aplica.
export function parseDeepLink(url: string | null | undefined): DeepLinkTarget | null {
  if (!url) return null;
  try {
    const s = String(url);
    const mp = s.match(/pagar\/([^/?#]+)/i);
    if (mp && mp[1]) { const trn = decodeURIComponent(mp[1]).trim(); return trn ? { action: 'pagar', trn } : null; }
    const mi = s.match(/instrucciones\/([^/?#]+)/i);
    if (mi && mi[1]) { const trn = decodeURIComponent(mi[1]).trim(); return trn ? { action: 'instrucciones', trn } : null; }
    return null;
  } catch {
    return null;
  }
}

type DeepLinkListener = (target: DeepLinkTarget) => void;

let pending: DeepLinkTarget | null = null;
let listener: DeepLinkListener | null = null;

// App llama esto cuando llega un deep link.
// Si Home ya está montado (listener activo) se aplica en el momento;
// si no, queda pendiente para cuando Home se monte.
export function emitDeepLink(target: DeepLinkTarget | null): void {
  if (!target || !target.trn) return;
  if (listener) listener(target);
  else pending = target;
}

// Home registra/limpia su listener al montarse/desmontarse.
export function setDeepLinkListener(l: DeepLinkListener | null): void {
  listener = l;
}

// Home consume el deep link pendiente (arranque en frío) una sola vez.
export function consumePendingDeepLink(): DeepLinkTarget | null {
  const t = pending;
  pending = null;
  return t;
}
