/**
 * deliveryQueue.ts
 * Cola offline de entregas. Cuando no hay internet, guarda la entrega en
 * AsyncStorage y la sincroniza automáticamente cuando vuelve la conexión.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@entregax:delivery_queue';

export interface PendingDelivery {
  id: string;              // UUID local para dedup
  barcode: string;
  signatureBase64: string;
  photoBase64: string;
  recipientName: string;
  notes: string;
  savedAt: number;         // timestamp ms
  retries: number;
}

// ── Leer cola completa ──────────────────────────────────────────────────────
export const getQueue = async (): Promise<PendingDelivery[]> => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

// ── Guardar cola ────────────────────────────────────────────────────────────
const saveQueue = async (queue: PendingDelivery[]): Promise<void> => {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

// ── Agregar entrega a la cola ───────────────────────────────────────────────
export const enqueueDelivery = async (delivery: Omit<PendingDelivery, 'id' | 'savedAt' | 'retries'>): Promise<string> => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const queue = await getQueue();
  queue.push({ ...delivery, id, savedAt: Date.now(), retries: 0 });
  await saveQueue(queue);
  return id;
};

// ── Remover entrega de la cola (tras sync exitoso) ──────────────────────────
export const dequeueDelivery = async (id: string): Promise<void> => {
  const queue = await getQueue();
  await saveQueue(queue.filter(d => d.id !== id));
};

// ── Incrementar contador de intentos ───────────────────────────────────────
export const incrementRetry = async (id: string): Promise<void> => {
  const queue = await getQueue();
  const updated = queue.map(d => d.id === id ? { ...d, retries: d.retries + 1 } : d);
  await saveQueue(updated);
};

// ── Detectar si es error de red (sin respuesta del servidor) ────────────────
export const isNetworkError = (error: any): boolean => {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    !error?.response &&           // axios/fetch: sin respuesta = sin internet
    (msg.includes('network') ||
     msg.includes('timeout') ||
     msg.includes('connection') ||
     msg.includes('fetch') ||
     msg.includes('socket'))
  ) || error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED';
};
