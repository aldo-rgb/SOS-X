// Hook compartido para leer peso desde báscula USB vía Web Serial API
// Soporta formatos comunes (Toledo, OHAUS, etc.): "ST,GS, 1.83 kg"
import { useRef, useCallback } from 'react';

export interface ScaleReadResult {
  success: boolean;
  weight?: number;
  error?: string;
}

export function useScaleReader() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const portRef = useRef<any>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const read = useCallback(async (timeoutMs = 5000): Promise<ScaleReadResult> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (!('serial' in navigator)) {
      return { success: false, error: 'Web Serial API no disponible. Usa Chrome/Edge en HTTPS.' };
    }
    try {
      let port = portRef.current;
      if (!port) {
        port = await nav.serial.requestPort();
        await port.open({ baudRate: 9600 });
        portRef.current = port;
      }
      // Cancelar reader anterior si quedó abierto
      if (readerRef.current) {
        try { await readerRef.current.cancel(); } catch { /* ignore */ }
        readerRef.current = null;
      }
      const reader = port.readable?.getReader();
      if (!reader) return { success: false, error: 'No se pudo leer del puerto' };
      readerRef.current = reader;

      const decoder = new TextDecoder();
      let buffer = '';
      const start = Date.now();
      try {
        while ((Date.now() - start) < timeoutMs) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const match = buffer.match(/(\d+\.?\d*)\s*(kg|g|lb)/i);
          if (match) {
            let w = parseFloat(match[1]);
            const unit = match[2].toLowerCase();
            if (unit === 'g') w /= 1000;
            if (unit === 'lb') w *= 0.453592;
            return { success: true, weight: Math.round(w * 100) / 100 };
          }
        }
        return { success: false, error: 'Sin datos de la báscula. Verifica conexión.' };
      } finally {
        try { reader.releaseLock(); } catch { /* ignore */ }
        readerRef.current = null;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error conectando báscula';
      portRef.current = null;
      return { success: false, error: msg };
    }
  }, []);

  return { readScale: read };
}
