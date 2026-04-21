// Hook compartido para leer peso desde báscula USB vía Web Serial API
// Soporta formatos comunes: "ST,GS, 1.83 kg", "+ 0001.83 kg", "  1.83\r\n", etc.
import { useRef, useCallback } from 'react';

export interface ScaleReadResult {
  success: boolean;
  weight?: number;
  error?: string;
  raw?: string;
}

export function useScaleReader() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const portRef = useRef<any>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const read = useCallback(async (timeoutMs = 8000): Promise<ScaleReadResult> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (!('serial' in navigator)) {
      return { success: false, error: 'Web Serial API no disponible. Usa Chrome/Edge en HTTPS.' };
    }
    try {
      let port = portRef.current;
      if (!port) {
        port = await nav.serial.requestPort();
        await port.open({
          baudRate: 9600,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          flowControl: 'none',
        });
        // Activar señales de control para básculas que las requieren
        try { await port.setSignals({ dataTerminalReady: true, requestToSend: true }); } catch { /* ignore */ }
        portRef.current = port;
      }

      // Cancelar reader anterior si quedó abierto
      if (readerRef.current) {
        try { await readerRef.current.cancel(); } catch { /* ignore */ }
        try { readerRef.current.releaseLock(); } catch { /* ignore */ }
        readerRef.current = null;
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
      readerRef.current = reader;

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
          // eslint-disable-next-line no-console
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
        readerRef.current = null;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error conectando báscula';
      if (msg.toLowerCase().includes('open') || msg.toLowerCase().includes('access')) {
        try { await portRef.current?.close(); } catch { /* ignore */ }
        portRef.current = null;
      }
      return { success: false, error: msg };
    }
  }, []);

  return { readScale: read };
}
