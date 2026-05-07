import { useState, useEffect } from 'react';
import { API_URL } from '../services/api';

interface PaymentStatus {
  xpay_enabled: boolean;
  entregax_payments_enabled: boolean;
}

const FALLBACK: PaymentStatus = { xpay_enabled: true, entregax_payments_enabled: true };
let cached: PaymentStatus | null = null;
let lastFetch: number | null = null;
const CACHE_TTL_MS = 30_000;

export function usePaymentStatus() {
  const [status, setStatus] = useState<PaymentStatus>(cached ?? FALLBACK);

  useEffect(() => {
    const now = Date.now();
    if (cached !== null && lastFetch !== null && now - lastFetch < CACHE_TTL_MS) {
      setStatus(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/system/payment-status`);
        if (!res.ok) throw new Error('err');
        const data = await res.json();
        if (!cancelled) {
          cached = {
            xpay_enabled: data.xpay_enabled !== false,
            entregax_payments_enabled: data.entregax_payments_enabled !== false,
          };
          lastFetch = Date.now();
          setStatus(cached);
        }
      } catch {
        if (!cancelled) setStatus(FALLBACK);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return {
    xpayEnabled: status.xpay_enabled,
    entregaxPaymentsEnabled: status.entregax_payments_enabled,
  };
}
