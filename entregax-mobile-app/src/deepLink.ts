/**
 * Deep link → "Generar instrucciones".
 *
 * Un botón de la plantilla de WhatsApp "llegó tu paquete" apunta a
 *   https://entregax.app/instrucciones/<TRN>
 * (Universal Link iOS / App Link Android). Al abrirse la app, capturamos el
 * TRN (tracking_internal) del paquete y dejamos que Home se filtre a él.
 *
 * Flujo:
 *   - Arranque en frío: App captura la URL inicial → guarda el TRN pendiente.
 *     Bootstrap valida sesión y navega a Home; al montarse, Home consume el
 *     TRN pendiente y aplica el filtro.
 *   - App ya abierta en Home (warm): el evento 'url' llama directo al listener
 *     que Home registró y se filtra en el momento.
 */

// Extrae el TRN de una URL de instrucciones. Devuelve null si no aplica.
export function parseInstructionTrn(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const m = String(url).match(/instrucciones\/([^/?#]+)/i);
    if (m && m[1]) return decodeURIComponent(m[1]).trim() || null;
    return null;
  } catch {
    return null;
  }
}

type InstructionListener = (trn: string) => void;

let pendingTrn: string | null = null;
let listener: InstructionListener | null = null;

// App llama esto cuando llega una URL de instrucciones.
// Si Home ya está montado (listener activo) se aplica en el momento;
// si no, queda pendiente para cuando Home se monte.
export function emitInstruction(trn: string | null): void {
  if (!trn) return;
  if (listener) listener(trn);
  else pendingTrn = trn;
}

// Home registra/limpia su listener al montarse/desmontarse.
export function setInstructionListener(l: InstructionListener | null): void {
  listener = l;
}

// Home consume el TRN pendiente (arranque en frío) una sola vez.
export function consumePendingInstructionTrn(): string | null {
  const t = pendingTrn;
  pendingTrn = null;
  return t;
}
