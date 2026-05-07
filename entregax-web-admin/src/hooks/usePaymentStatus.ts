// ============================================================
// usePaymentStatus — Hook para consultar el estado de los sistemas de pago.
// Super Admin puede apagar X-Pay y pagos EntregaX por separado.
// Se cachea en memoria durante la sesión (TTL 30s).
// ============================================================

import { useState, useEffect } from 'react';
import api from '../services/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface PaymentStatusCache {
  payments_enabled: boolean;
  xpay_enabled: boolean;
  entregax_payments_enabled: boolean;
}

let cached: PaymentStatusCache | null = null;
let lastFetch: number | null = null;
const CACHE_TTL_MS = 30_000; // 30 segundos

const FALLBACK: PaymentStatusCache = {
  payments_enabled: true,
  xpay_enabled: true,
  entregax_payments_enabled: true,
};

export function usePaymentStatus() {
  const [status, setStatus] = useState<PaymentStatusCache>(cached ?? FALLBACK);
  const [loading, setLoading] = useState<boolean>(cached === null);

  useEffect(() => {
    const now = Date.now();
    if (cached !== null && lastFetch !== null && now - lastFetch < CACHE_TTL_MS) {
      setStatus(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/system/payment-status`);
        if (!res.ok) throw new Error('status error');
        const data = await res.json();
        if (!cancelled) {
          cached = {
            payments_enabled: data.payments_enabled !== false,
            xpay_enabled: data.xpay_enabled !== false,
            entregax_payments_enabled: data.entregax_payments_enabled !== false,
          };
          lastFetch = Date.now();
          setStatus(cached);
        }
      } catch {
        if (!cancelled) setStatus(FALLBACK); // fallback seguro
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return {
    paymentsEnabled: status.payments_enabled,
    xpayEnabled: status.xpay_enabled,
    entregaxPaymentsEnabled: status.entregax_payments_enabled,
    loading,
  };
}

/** Invalida el caché para forzar re-fetch en el próximo uso del hook */
export function invalidatePaymentStatusCache() {
  cached = null;
  lastFetch = null;
}

/** Actualiza el estado de X-Pay (solo Super Admin) */
export async function toggleXPay(enabled: boolean): Promise<void> {
  await api.post('/admin/system/xpay-toggle', { enabled });
  invalidatePaymentStatusCache();
}

/** Actualiza el estado de pagos EntregaX (solo Super Admin) */
export async function toggleEntregaxPayments(enabled: boolean): Promise<void> {
  await api.post('/admin/system/entregax-payments-toggle', { enabled });
  invalidatePaymentStatusCache();
}
