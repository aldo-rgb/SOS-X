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
  gex_enabled: boolean;
  advisor_instructions_enabled: boolean;
  require_payment_to_load: boolean;
  require_label_to_load: boolean;
  external_sync_enabled: boolean;
  cajito_enabled: boolean;
  cajito_avatar_url: string | null;
  maintenance_mode: boolean;
}

let cached: PaymentStatusCache | null = null;
let lastFetch: number | null = null;
const CACHE_TTL_MS = 30_000; // 30 segundos

const FALLBACK: PaymentStatusCache = {
  payments_enabled: true,
  xpay_enabled: true,
  entregax_payments_enabled: true,
  gex_enabled: true,
  advisor_instructions_enabled: true,
  require_payment_to_load: true,
  require_label_to_load: true,
  external_sync_enabled: true,
  cajito_enabled: false,
  cajito_avatar_url: null,
  maintenance_mode: false,
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
            gex_enabled: data.gex_enabled !== false,
            advisor_instructions_enabled: data.advisor_instructions_enabled !== false,
            require_payment_to_load: data.require_payment_to_load !== false,
            require_label_to_load: data.require_label_to_load !== false,
            external_sync_enabled: data.external_sync_enabled !== false,
            cajito_enabled: data.cajito_enabled === true,
            cajito_avatar_url: typeof data.cajito_avatar_url === 'string' ? data.cajito_avatar_url : null,
            maintenance_mode: data.maintenance_mode === true,
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
    gexEnabled: status.gex_enabled,
    advisorInstructionsEnabled: status.advisor_instructions_enabled,
    requirePaymentToLoad: status.require_payment_to_load,
    requireLabelToLoad: status.require_label_to_load,
    externalSyncEnabled: status.external_sync_enabled,
    cajitoEnabled: status.cajito_enabled,
    cajitoAvatarUrl: status.cajito_avatar_url,
    maintenanceMode: status.maintenance_mode,
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

/** Actualiza el estado de contratación de GEX (solo Super Admin) */
export async function toggleGEX(enabled: boolean): Promise<void> {
  await api.post('/admin/system/gex-toggle', { enabled });
  invalidatePaymentStatusCache();
}

/** Controla visibilidad del botón de instrucciones/edición de direcciones en panel asesor (solo Super Admin) */
export async function toggleAdvisorInstructions(enabled: boolean): Promise<void> {
  await api.post('/admin/system/advisor-instructions-toggle', { enabled });
  invalidatePaymentStatusCache();
}

/** Controla si se exige pago del cliente para cargar una guía a la unidad (solo Super Admin) */
export async function toggleRequirePaymentToLoad(enabled: boolean): Promise<void> {
  await api.post('/admin/system/require-payment-to-load-toggle', { enabled });
  invalidatePaymentStatusCache();
}

/** Controla si se exige etiqueta impresa para cargar una guía a la unidad (solo Super Admin) */
export async function toggleRequireLabelToLoad(enabled: boolean): Promise<void> {
  await api.post('/admin/system/require-label-to-load-toggle', { enabled });
  invalidatePaymentStatusCache();
}

/** Habilita o deshabilita el acceso al endpoint de sincronización de clientes con Sistema EX (solo Super Admin) */
export async function toggleExternalSync(enabled: boolean): Promise<void> {
  await api.post('/admin/system/external-sync-toggle', { enabled });
  invalidatePaymentStatusCache();
}

/** Habilita o deshabilita el asistente IA Cajito (solo Super Admin) */
export async function toggleCajito(enabled: boolean): Promise<void> {
  await api.post('/admin/system/cajito-toggle', { enabled });
  invalidatePaymentStatusCache();
}

/** Activa o desactiva el modo mantenimiento (solo Super Admin) */
export async function toggleMaintenanceMode(enabled: boolean): Promise<void> {
  await api.post('/admin/system/maintenance-toggle', { enabled });
  invalidatePaymentStatusCache();
}
