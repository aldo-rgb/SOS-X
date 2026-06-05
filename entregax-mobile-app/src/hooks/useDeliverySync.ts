/**
 * useDeliverySync.ts
 * Hook que sincroniza la cola offline de entregas cuando hay conexión.
 * Se activa: al montar, cuando la app vuelve a foreground, y cada 30s.
 */

import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getQueue,
  dequeueDelivery,
  incrementRetry,
  isNetworkError,
  PendingDelivery,
} from '../services/deliveryQueue';
import api from '../services/api';

const MAX_RETRIES = 5;
const SYNC_INTERVAL = 30_000; // 30 segundos

export const useDeliverySync = (token?: string) => {
  const syncingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const syncQueue = useCallback(async () => {
    if (syncingRef.current) return;
    const queue = await getQueue();
    if (queue.length === 0) return;

    syncingRef.current = true;
    console.log(`[DeliverySync] Intentando sincronizar ${queue.length} entrega(s) pendiente(s)...`);

    for (const delivery of queue) {
      if (delivery.retries >= MAX_RETRIES) {
        console.warn(`[DeliverySync] Entrega ${delivery.barcode} supera ${MAX_RETRIES} intentos — se mantiene en cola para revisión manual`);
        continue;
      }

      try {
        await api.post('/api/driver/confirm-delivery', {
          barcode: delivery.barcode,
          signatureBase64: delivery.signatureBase64,
          photoBase64: delivery.photoBase64,
          recipientName: delivery.recipientName,
          notes: delivery.notes,
          offlineId: delivery.id,
        }, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        await dequeueDelivery(delivery.id);
        console.log(`[DeliverySync] ✅ Sincronizado: ${delivery.barcode}`);
      } catch (e: any) {
        if (isNetworkError(e)) {
          // Sigue sin internet — dejar en cola
          console.log(`[DeliverySync] Sin conexión, reintentando más tarde: ${delivery.barcode}`);
          break; // No continuar con las siguientes si no hay red
        }
        // Error del servidor (400/409/500) — incrementar retries
        await incrementRetry(delivery.id);
        const status = e?.response?.status;
        if (status === 409) {
          // 409 Conflict = ya entregado → limpiar de la cola
          await dequeueDelivery(delivery.id);
          console.log(`[DeliverySync] Ya entregado (409) — removido: ${delivery.barcode}`);
        } else {
          console.warn(`[DeliverySync] Error ${status} sincronizando ${delivery.barcode}:`, e?.response?.data?.error);
        }
      }
    }

    syncingRef.current = false;
  }, [token]);

  useEffect(() => {
    // Sync al montar
    syncQueue();

    // Sync en foreground
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') syncQueue();
    };
    const sub = AppState.addEventListener('change', handleAppState);

    // Sync periódico cada 30s
    intervalRef.current = setInterval(syncQueue, SYNC_INTERVAL);

    return () => {
      sub.remove();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [syncQueue]);

  return { syncQueue };
};

// ── Helper: contar entregas pendientes en cola ──────────────────────────────
export const getPendingDeliveryCount = async (): Promise<number> => {
  const queue = await getQueue();
  return queue.length;
};
