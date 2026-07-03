import { useState, useEffect } from 'react';
import { API_URL } from '../services/api';
import { getSecure } from '../services/secureStorage';

export type EntregaxServiceKey = 'pobox' | 'maritimo' | 'aereo' | 'tdi_express' | 'dhl';

interface PaymentStatus {
  xpay_enabled: boolean;
  entregax_payments_enabled: boolean;
  entregax_payments_by_service: Record<EntregaxServiceKey, boolean>;
  gex_enabled: boolean;
  advisor_xpay_enabled: boolean;
}

const FULL_SERVICES: Record<EntregaxServiceKey, boolean> = { pobox: true, maritimo: true, aereo: true, tdi_express: true, dhl: true };
const FALLBACK: PaymentStatus = { xpay_enabled: true, entregax_payments_enabled: true, entregax_payments_by_service: FULL_SERVICES, gex_enabled: true, advisor_xpay_enabled: false };
let cached: PaymentStatus | null = null;
let lastFetch: number | null = null;
const CACHE_TTL_MS = 30_000;

/**
 * Mapea un nombre de servicio cualquiera (string libre) a la clave canónica usada
 * por el toggle granular. Devuelve null si no se reconoce → se asume permitido.
 */
export function mapServiceKey(servicio?: string | null): EntregaxServiceKey | null {
  if (!servicio) return null;
  const s = String(servicio).toLowerCase();
  if (s.includes('pobox') || s.includes('po_box') || s.includes('po-box')) return 'pobox';
  if (s.includes('dhl')) return 'dhl';
  if (s.includes('marít') || s.includes('marit') || s.includes('maritime')
      || s.startsWith('sea_') || s.startsWith('fcl_')
      || s === 'china_sea' || s === 'sea' || s === 'fcl') return 'maritimo';
  // TDI Express antes de Aéreo estándar (para no ser tragado por 'aereo').
  if (s.includes('tdi_express') || s === 'tdx' || s.includes('tdi')) return 'tdi_express';
  if (s.includes('aére') || s.includes('aere') || s.includes('aereo')
      || s.startsWith('air_') || s === 'china_air' || s === 'air') return 'aereo';
  return null;
}

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
        // Enviar JWT si existe → permite que el backend reconozca usuarios
        // tester y devuelva el modo libre (inmune a toggles globales).
        const token = await getSecure('token').catch(() => null);
        const res = await fetch(`${API_URL}/api/system/payment-status`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error('err');
        const data = await res.json();
        if (!cancelled) {
          const bs = data.entregax_payments_by_service || {};
          cached = {
            xpay_enabled: data.xpay_enabled !== false,
            entregax_payments_enabled: data.entregax_payments_enabled !== false,
            entregax_payments_by_service: {
              pobox:       bs.pobox       !== false,
              maritimo:    bs.maritimo    !== false,
              aereo:       bs.aereo       !== false,
              tdi_express: bs.tdi_express !== false,
              dhl:         bs.dhl         !== false,
            },
            gex_enabled: data.gex_enabled !== false,
            advisor_xpay_enabled: data.advisor_xpay_enabled === true,
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

  const isEntregaxPaymentEnabledFor = (servicio?: string | null): boolean => {
    if (!status.entregax_payments_enabled) return false;
    const key = mapServiceKey(servicio);
    if (!key) return true; // servicio desconocido → sigue la regla del master
    return status.entregax_payments_by_service[key] !== false;
  };

  return {
    xpayEnabled: status.xpay_enabled,
    entregaxPaymentsEnabled: status.entregax_payments_enabled,
    entregaxPaymentsByService: status.entregax_payments_by_service,
    isEntregaxPaymentEnabledFor,
    gexEnabled: status.gex_enabled,
    advisorXpayEnabled: status.advisor_xpay_enabled,
  };
}
