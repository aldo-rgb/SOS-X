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
  entregax_payments_by_service: { pobox: boolean; maritimo: boolean; aereo: boolean; dhl: boolean };
  gex_enabled: boolean;
  facturas_enabled: boolean;
  facturas_by_service: { pobox: boolean; maritimo: boolean; aereo: boolean; dhl: boolean };
  advisor_instructions_enabled: boolean;
  advisor_payment_order_enabled: boolean;
  require_payment_to_load: boolean;
  require_label_to_load: boolean;
  require_instructions_to_load_pobox: boolean;
  external_sync_enabled: boolean;
  entregax_payment_query_enabled: boolean;
  cajito_enabled: boolean;
  cajito_avatar_url: string | null;
  entregax_full_black_url: string | null;
  entregax_x_only_url: string | null;
  maintenance_mode: boolean;
}

let cached: PaymentStatusCache | null = null;
let lastFetch: number | null = null;
const CACHE_TTL_MS = 30_000; // 30 segundos

const FALLBACK: PaymentStatusCache = {
  payments_enabled: true,
  xpay_enabled: true,
  entregax_payments_enabled: true,
  entregax_payments_by_service: { pobox: true, maritimo: true, aereo: true, dhl: true },
  gex_enabled: true,
  facturas_enabled: true,
  facturas_by_service: { pobox: true, maritimo: true, aereo: true, dhl: true },
  advisor_instructions_enabled: true,
  advisor_payment_order_enabled: true,
  require_payment_to_load: true,
  require_label_to_load: true,
  require_instructions_to_load_pobox: false,
  external_sync_enabled: true,
  entregax_payment_query_enabled: false,
  cajito_enabled: false,
  cajito_avatar_url: null,
  entregax_full_black_url: null,
  entregax_x_only_url: null,
  maintenance_mode: false,
};

export type EntregaxServiceKey = 'pobox' | 'maritimo' | 'aereo' | 'dhl';

/** Mapea un servicio (string libre) a la clave canónica del toggle granular. */
export function mapServiceKey(servicio?: string | null): EntregaxServiceKey | null {
  if (!servicio) return null;
  const s = String(servicio).toLowerCase();
  // PO Box USA
  if (s.includes('pobox') || s.includes('po_box') || s.includes('po-box')) return 'pobox';
  // DHL
  if (s.includes('dhl')) return 'dhl';
  // Marítimo China
  if (s.includes('marít') || s.includes('marit') || s.includes('maritime')
      || s.startsWith('sea_') || s.startsWith('fcl_')
      || s === 'china_sea' || s === 'sea' || s === 'fcl') return 'maritimo';
  // Aéreo China (incluye TDI Express)
  if (s.includes('aére') || s.includes('aere') || s.includes('aereo')
      || s.startsWith('air_') || s === 'china_air' || s === 'air'
      || s.includes('tdi') || s === 'tdi_express') return 'aereo';
  return null;
}

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
        // Enviar JWT si existe en localStorage → permite que el backend
        // identifique usuarios tester y devuelva el modo libre (inmune a
        // los toggles globales del Sistema de Pagos).
        const token = (() => {
          try { return localStorage.getItem('token'); } catch { return null; }
        })();
        const res = await fetch(`${API_URL}/api/system/payment-status`, {
          credentials: 'include', // permite que la cookie HttpOnly también viaje
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error('status error');
        const data = await res.json();
        if (!cancelled) {
          const bs = data.entregax_payments_by_service || {};
          cached = {
            payments_enabled: data.payments_enabled !== false,
            xpay_enabled: data.xpay_enabled !== false,
            entregax_payments_enabled: data.entregax_payments_enabled !== false,
            entregax_payments_by_service: {
              pobox:    bs.pobox    !== false,
              maritimo: bs.maritimo !== false,
              aereo:    bs.aereo    !== false,
              dhl:      bs.dhl      !== false,
            },
            gex_enabled: data.gex_enabled !== false,
            facturas_enabled: data.facturas_enabled !== false,
            facturas_by_service: {
              pobox:    (data.facturas_by_service || {}).pobox    !== false,
              maritimo: (data.facturas_by_service || {}).maritimo !== false,
              aereo:    (data.facturas_by_service || {}).aereo    !== false,
              dhl:      (data.facturas_by_service || {}).dhl      !== false,
            },
            advisor_instructions_enabled: data.advisor_instructions_enabled !== false,
            advisor_payment_order_enabled: data.advisor_payment_order_enabled !== false,
            require_payment_to_load: data.require_payment_to_load !== false,
            require_label_to_load: data.require_label_to_load !== false,
            require_instructions_to_load_pobox: data.require_instructions_to_load_pobox === true,
            external_sync_enabled: data.external_sync_enabled !== false,
            entregax_payment_query_enabled: data.entregax_payment_query_enabled === true,
            cajito_enabled: data.cajito_enabled === true,
            cajito_avatar_url: typeof data.cajito_avatar_url === 'string' ? data.cajito_avatar_url : null,
            entregax_full_black_url: typeof data.entregax_full_black_url === 'string' ? data.entregax_full_black_url : null,
            entregax_x_only_url: typeof data.entregax_x_only_url === 'string' ? data.entregax_x_only_url : null,
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
    entregaxPaymentsByService: status.entregax_payments_by_service,
    isEntregaxPaymentEnabledFor: (servicio?: string | null): boolean => {
      if (!status.entregax_payments_enabled) return false;
      const key = mapServiceKey(servicio);
      if (!key) return true;
      return status.entregax_payments_by_service[key] !== false;
    },
    gexEnabled: status.gex_enabled,
    facturasEnabled: status.facturas_enabled,
    facturasByService: status.facturas_by_service,
    isFacturaAutoEnabledFor: (servicio?: string | null): boolean => {
      if (!status.facturas_enabled) return false;
      const key = mapServiceKey(servicio);
      if (!key) return true;
      return status.facturas_by_service[key] !== false;
    },
    advisorInstructionsEnabled: status.advisor_instructions_enabled,
    advisorPaymentOrderEnabled: status.advisor_payment_order_enabled,
    requirePaymentToLoad: status.require_payment_to_load,
    requireLabelToLoad: status.require_label_to_load,
    requireInstructionsToLoadPobox: status.require_instructions_to_load_pobox,
    externalSyncEnabled: status.external_sync_enabled,
    entregaxPaymentQueryEnabled: status.entregax_payment_query_enabled,
    cajitoEnabled: status.cajito_enabled,
    cajitoAvatarUrl: status.cajito_avatar_url,
    entregaxXOnlyUrl: status.entregax_x_only_url,
    entregaxFullBlackUrl: status.entregax_full_black_url,
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

/** Actualiza el estado de pagos EntregaX (solo Super Admin).
 *  Si se omiten campos, se preservan los valores anteriores.
 */
export async function toggleEntregaxPayments(payload: boolean | { enabled?: boolean; by_service?: Partial<{ pobox: boolean; maritimo: boolean; aereo: boolean; dhl: boolean }> }): Promise<void> {
  const body = typeof payload === 'boolean' ? { enabled: payload } : payload;
  await api.post('/admin/system/entregax-payments-toggle', body);
  invalidatePaymentStatusCache();
}

/** Actualiza la facturación automática EntregaX (master + por servicio, solo Super Admin) */
export async function toggleFacturas(payload: boolean | { enabled?: boolean; by_service?: Partial<{ pobox: boolean; maritimo: boolean; aereo: boolean; dhl: boolean }> }): Promise<void> {
  const body = typeof payload === 'boolean' ? { enabled: payload } : payload;
  await api.post('/admin/system/facturas-toggle', body);
  invalidatePaymentStatusCache();
}

/** Actualiza el estado de contratación de GEX (solo Super Admin) */
export async function toggleGEX(enabled: boolean): Promise<void> {
  await api.post('/admin/system/gex-toggle', { enabled });
  invalidatePaymentStatusCache();
}

/** Controla visibilidad de la función Orden de Pago en app móvil y web (solo Super Admin) */
export async function toggleAdvisorPaymentOrder(enabled: boolean): Promise<void> {
  await api.post('/admin/system/advisor-payment-order-toggle', { enabled });
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

/** Controla si las guías PO Box (US-) requieren instrucciones asignadas por el cliente para
 *  aparecer en Control de Salidas (solo Super Admin, aplica solo a PO Box) */
export async function toggleRequireInstructionsToLoadPobox(enabled: boolean): Promise<void> {
  await api.post('/admin/system/require-instructions-to-load-pobox-toggle', { enabled });
  invalidatePaymentStatusCache();
}

/** Habilita o deshabilita el acceso al endpoint de sincronización de clientes con Sistema EX (solo Super Admin) */
export async function toggleExternalSync(enabled: boolean): Promise<void> {
  await api.post('/admin/system/external-sync-toggle', { enabled });
  invalidatePaymentStatusCache();
}

/** Habilita o deshabilita el asistente IA Cajito (solo Super Admin) */
export async function toggleEntregaxPaymentQuery(enabled: boolean): Promise<void> {
  await api.post('/admin/system/entregax-payment-query-toggle', { enabled });
  invalidatePaymentStatusCache();
}

export async function toggleCajito(enabled: boolean): Promise<void> {
  await api.post('/admin/system/cajito-toggle', { enabled });
  invalidatePaymentStatusCache();
}

/** Activa o desactiva el modo mantenimiento (solo Super Admin) */
export async function toggleMaintenanceMode(enabled: boolean): Promise<void> {
  await api.post('/admin/system/maintenance-toggle', { enabled });
  invalidatePaymentStatusCache();
}
