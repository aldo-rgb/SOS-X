// Hook compartido para leer peso desde báscula USB vía Web Serial API
// Soporta formatos comunes: "ST,GS, 1.83 kg", "+ 0001.83 kg", "  1.83\r\n", etc.
import { useCallback } from 'react';

export interface ScaleReadResult {
  success: boolean;
  weight?: number;
  error?: string;
  raw?: string;
}

// Singleton a nivel de módulo: comparte el puerto entre TODAS las páginas
// para evitar "The port is already open" al cambiar de modal.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharedPort: any = null;
let sharedReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensurePortOpen(nav: any) {
  // Reusar puerto previamente autorizado si sigue abierto
  if (sharedPort) {
    // Si por algún motivo está cerrado, intentar reabrir
    if (!sharedPort.readable) {
      try {
        await sharedPort.open({
          baudRate: 9600,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          flowControl: 'none',
        });
      } catch (e: unknown) {
        const m = e instanceof Error ? e.message : '';
        if (!m.toLowerCase().includes('already open')) throw e;
      }
    }
    return sharedPort;
  }

  // Buscar puertos ya autorizados antes de pedir uno nuevo
  let port = null;
  try {
    const granted = await nav.serial.getPorts();
    if (granted && granted.length > 0) port = granted[0];
  } catch { /* ignore */ }

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
    const m = e instanceof Error ? e.message : '';
    // Si ya estaba abierto (otra pestaña/instancia), seguimos usando el handle
    if (!m.toLowerCase().includes('already open')) throw e;
  }
  try { await port.setSignals({ dataTerminalReady: true, requestToSend: true }); } catch { /* ignore */ }
  sharedPort = port;
  return port;
}

export function useScaleReader() {
  const read = useCallback(async (timeoutMs = 8000): Promise<ScaleReadResult> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (!('serial' in navigator)) {
      return { success: false, error: 'Web Serial API no disponible. Usa Chrome/Edge en HTTPS.' };
    }
    try {
      const port = await ensurePortOpen(nav);

      // Cancelar reader anterior si quedó abierto
      if (sharedReader) {
        try { await sharedReader.cancel(); } catch { /* ignore */ }
        try { sharedReader.releaseLock(); } catch { /* ignore */ }
        sharedReader = null;
      }

      // Enviar comandos de poll comunes para básculas en modo "on demand"
      // (Toledo: 'W\r\n', OHAUS/AND: 'P\r\n', genéricas: ENQ 0x05, 'S\r\n')
      const writer = port.writable?.getWriter();
      if (writer) {
        try {
          const enc = new TextEncoder();
          await writer.write(enc.encode('W\r\n'));
          await writer.write(enc.encode('P\r\n'));
          await writer.write(enc.encode('S\r\n'));
          await writer.write(new Uint8Array([0x05])); // ENQ
        } catch { /* ignore */ }
        try { writer.releaseLock(); } catch { /* ignore */ }
      }

      const reader = port.readable?.getReader();
      if (!reader) return { success: false, error: 'No se pudo obtener lector del puerto. Otra app podría tenerlo abierto.' };
      sharedReader = reader;

      const decoder = new TextDecoder();
      let buffer = '';
      const start = Date.now();
      try {
        while ((Date.now() - start) < timeoutMs) {
          const remaining = timeoutMs - (Date.now() - start);
          const timeout = new Promise<{ value?: Uint8Array; done: boolean }>((resolve) =>
            setTimeout(() => resolve({ done: false }), remaining)
          );
          const result = await Promise.race([reader.read(), timeout]);
          if (result.done) break;
          if (!result.value) continue;

          buffer += decoder.decode(result.value, { stream: true });
          // Log para debug (visible en consola del navegador)
          console.log('[Báscula RX]', JSON.stringify(buffer));

          // 1) Intentar match con unidad explícita
          let match: RegExpMatchArray | null = buffer.match(/([+-]?\d+\.?\d*)\s*(kg|g|lb|oz)/i);
          let unit: string | null = match ? match[2].toLowerCase() : null;

          // 2) Si no, intentar match numérico al cierre de línea (asume kg)
          if (!match) {
            const lineMatch = buffer.match(/([+-]?\d+\.\d+)\s*[\r\n]/);
            if (lineMatch) {
              match = lineMatch;
              unit = 'kg';
            }
          }

          if (match && unit) {
            let w = Math.abs(parseFloat(match[1]));
            if (unit === 'g') w /= 1000;
            if (unit === 'lb') w *= 0.453592;
            if (unit === 'oz') w *= 0.0283495;
            if (w > 0) {
              return { success: true, weight: Math.round(w * 100) / 100, raw: buffer };
            }
          }
        }
        return {
          success: false,
          error: buffer
            ? `Datos recibidos pero sin formato de peso: "${buffer.slice(0, 60)}"`
            : 'Sin datos de la báscula. Verifica que esté encendida y con peso > 0.',
          raw: buffer,
        };
      } finally {
        try { reader.releaseLock(); } catch { /* ignore */ }
        sharedReader = null;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error conectando báscula';
      // Si el error NO es "already open", resetear el puerto para forzar nueva selección
      if (!msg.toLowerCase().includes('already open') &&
          (msg.toLowerCase().includes('open') || msg.toLowerCase().includes('access') || msg.toLowerCase().includes('disconnect'))) {
        try { await sharedPort?.close(); } catch { /* ignore */ }
        sharedPort = null;
      }
      return { success: false, error: msg };
    }
  }, []);

  return { readScale: read };
}
