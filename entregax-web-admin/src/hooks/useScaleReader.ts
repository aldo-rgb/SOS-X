// Hook compartido para leer peso desde báscula USB vía Web Serial API.
// Diseño: una sola conexión persistente + un loop de lectura en background
// que mantiene cacheado el último peso parseado. readScale() espera a que
// exista un peso reciente (>0) o vence el timeout.
// liveWeight: se actualiza automáticamente (p. ej. al presionar TARE/ZERO).
import { useCallback, useEffect, useState } from 'react';

export interface ScaleReadResult {
  success: boolean;
  weight?: number;
  error?: string;
  raw?: string;
  stale?: boolean; // true si el peso es el mismo que ya teníamos (sin actualización)
}

// ---------- Estado singleton (module-level) ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharedPort: any = null;
let loopRunning = false;
let loopAbort = false;
let latestWeight: number | null = null;
let latestWeightAt = 0; // timestamp ms de cuándo se recibió latestWeight
let latestRaw = '';
let pollInProgress = false;

async function resetPort() {
  loopAbort = true;
  try { await sharedPort?.close(); } catch { /* ignore */ }
  sharedPort = null;
  latestWeight = null;
  latestWeightAt = 0;
  latestRaw = '';
  await new Promise((r) => setTimeout(r, 150));
  loopAbort = false;
}

function parseWeight(buffer: string): number | null {
  // Con unidad explícita — tomar la ÚLTIMA ocurrencia (peso más reciente)
  const all = [...buffer.matchAll(/([+-]?\d+\.?\d*)\s*(kg|g|lb|oz)/gi)];
  if (all.length > 0) {
    const m = all[all.length - 1];
    let w = Math.abs(parseFloat(m[1]));
    const u = m[2].toLowerCase();
    if (u === 'g') w /= 1000;
    if (u === 'lb') w *= 0.453592;
    if (u === 'oz') w *= 0.0283495;
    return Math.round(w * 100) / 100;
  }
  // Línea numérica sin unidad — última línea completa (asume kg)
  const lines = [...buffer.matchAll(/([+-]?\d+\.\d+)\s*[\r\n]/g)];
  if (lines.length > 0) {
    const last = lines[lines.length - 1];
    const w = Math.abs(parseFloat(last[1]));
    return Math.round(w * 100) / 100;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function openPort(nav: any, forceNew = false) {
  if (sharedPort && !forceNew) {
    // Verificar que el puerto sigue siendo válido
    if (sharedPort.readable || sharedPort.writable) return sharedPort;
    // Puerto inválido, limpiarlo
    try { await sharedPort.close(); } catch { /* ignore */ }
    sharedPort = null;
    loopAbort = true;
    await new Promise((r) => setTimeout(r, 100));
    loopAbort = false;
  }

  // Reusar puerto previamente autorizado
  let port = null;
  if (!forceNew) {
    try {
      const granted = await nav.serial.getPorts();
      if (granted && granted.length > 0) port = granted[0];
    } catch { /* ignore */ }
  }
  if (!port) port = await nav.serial.requestPort();

  try {
    await port.open({
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
    });
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message.toLowerCase() : '';
    if (m.includes('already open')) {
      // OK, seguimos con el handle
    } else if (m.includes('failed to open')) {
      // Puerto fantasma/ocupado por OS: descartar y forzar nuevo
      try { await port.close(); } catch { /* ignore */ }
      if (!forceNew) {
        sharedPort = null;
        return openPort(nav, true);
      }
      throw e;
    } else {
      throw e;
    }
  }
  try { await port.setSignals({ dataTerminalReady: true, requestToSend: true }); } catch { /* ignore */ }
  sharedPort = port;
  return port;
}

async function sendPoll() {
  if (!sharedPort?.writable) return;
  if (pollInProgress) return; // evitar concurrencia → getWriter lock error
  pollInProgress = true;
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  try {
    writer = sharedPort.writable.getWriter();
    const enc = new TextEncoder();
    await writer!.write(enc.encode('W\r\n'));
    await writer!.write(enc.encode('P\r\n'));
    await writer!.write(enc.encode('S\r\n'));
    await writer!.write(new Uint8Array([0x05])); // ENQ
  } catch { /* ignore */ }
  finally {
    try { writer?.releaseLock(); } catch { /* ignore */ }
    pollInProgress = false;
  }
}

function startReadLoop() {
  if (loopRunning) return;
  loopRunning = true;
  loopAbort = false;

  (async () => {
    const decoder = new TextDecoder();
    let buffer = '';
    while (!loopAbort && sharedPort?.readable) {
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      try {
        reader = sharedPort.readable.getReader();
        if (!reader) break;
        while (!loopAbort) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          buffer += decoder.decode(value, { stream: true });
          // Mantener el buffer acotado
          if (buffer.length > 512) buffer = buffer.slice(-256);
          // Log debug
          console.log('[Báscula RX]', JSON.stringify(buffer.slice(-80)));
          const w = parseWeight(buffer);
          if (w !== null && w >= 0) {
            latestWeight = w;
            latestWeightAt = Date.now();
            latestRaw = buffer.slice(-120);
          }
        }
      } catch (e) {
        console.warn('[Báscula] loop error:', e);
        const msg = e instanceof Error ? e.message.toLowerCase() : '';
        // Dispositivo desconectado / puerto perdido → resetear singleton
        if (msg.includes('device has been lost') || msg.includes('network') ||
            msg.includes('disconnect') || msg.includes('not readable')) {
          try { reader?.releaseLock(); } catch { /* ignore */ }
          try { await sharedPort?.close(); } catch { /* ignore */ }
          sharedPort = null;
          latestWeight = null;
          break; // salir del loop; próximo readScale() reabrirá el puerto
        }
        await new Promise((r) => setTimeout(r, 300));
      } finally {
        try { reader?.releaseLock(); } catch { /* ignore */ }
      }
      if (!sharedPort?.readable) break;
    }
    loopRunning = false;
  })();
}

export function useScaleReader() {
  const read = useCallback(async (timeoutMs = 2500): Promise<ScaleReadResult> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (!('serial' in navigator)) {
      return { success: false, error: 'Web Serial API no disponible. Usa Chrome/Edge en HTTPS.' };
    }
    try {
      await openPort(nav);
      startReadLoop();

      // ⚡ FAST PATH: si tenemos un peso reciente (<1200ms) y > 0, devolverlo ya.
      // La báscula con transmisión continua reporta ~varias veces/s.
      const FRESH_WINDOW_MS = 1200;
      if (latestWeight !== null && latestWeight > 0 && (Date.now() - latestWeightAt) < FRESH_WINDOW_MS) {
        return { success: true, weight: latestWeight, raw: latestRaw };
      }

      // Enviar un poll inicial inmediato (bascula on-demand)
      sendPoll();

      const start = Date.now();
      let lastPollAt = 0;
      while (Date.now() - start < timeoutMs) {
        // Poll cada 500ms (antes era 1000ms)
        if (Date.now() - lastPollAt > 500) {
          sendPoll();
          lastPollAt = Date.now();
        }

        // Aceptar cualquier peso > 0 recibido durante esta lectura
        if (latestWeight !== null && latestWeight > 0 && (Date.now() - latestWeightAt) < FRESH_WINDOW_MS) {
          return { success: true, weight: latestWeight, raw: latestRaw };
        }
        await new Promise((r) => setTimeout(r, 60));
      }

      // Timeout: si tenemos peso cacheado viejo, devolverlo marcado como "stale"
      if (latestWeight !== null && latestWeight > 0) {
        return {
          success: true,
          weight: latestWeight,
          stale: true,
          raw: latestRaw,
        };
      }

      return {
        success: false,
        error: 'Sin datos de la báscula. Verifica que esté encendida, con peso > 0, y en modo de transmisión continua.',
        raw: latestRaw,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error conectando báscula';
      const lm = msg.toLowerCase();
      // Resetear puerto ante cualquier error de apertura/conexión
      if (lm.includes('disconnect') || lm.includes('no port') ||
          lm.includes('access denied') || lm.includes('failed to open') ||
          lm.includes('not found') || lm.includes('device has been lost') ||
          lm.includes('network')) {
        await resetPort();
        if (lm.includes('failed to open')) {
          return {
            success: false,
            error: '⚠️ Puerto bloqueado. Causas comunes: (1) Tienes OTRA pestaña de EntregaX abierta — ciérrala. (2) Otra app (Arduino IDE, terminal, driver) tiene el puerto. (3) Desconecta y reconecta el USB de la báscula.',
          };
        }
        return { success: false, error: `${msg} — Haz clic en "Leer Báscula" de nuevo para reconectar.` };
      }
      return { success: false, error: msg };
    }
  }, []);

  // Peso en vivo: refleja latestWeight en tiempo real mientras el componente
  // esté montado. Útil para mostrar el peso actual aunque el usuario no
  // haya presionado "Actualizar".
  const [liveWeight, setLiveWeight] = useState<number | null>(latestWeight);
  useEffect(() => {
    const id = setInterval(() => {
      setLiveWeight((prev) => (prev === latestWeight ? prev : latestWeight));
    }, 300);
    return () => clearInterval(id);
  }, []);

  return { readScale: read, liveWeight };
}
