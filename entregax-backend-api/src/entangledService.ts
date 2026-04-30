// ============================================================================
// ENTANGLED Service - Cliente HTTP para el motor externo de triangulación.
// ============================================================================
// Endpoint base, API key y secret de webhooks se leen de variables de entorno
// para permitir reemplazo por entorno (dev/staging/prod) sin tocar el código.
// ============================================================================

import axios, { AxiosError } from 'axios';

const ENTANGLED_BASE_URL =
  process.env.ENTANGLED_BASE_URL || 'https://api.entangled.app';
const ENTANGLED_API_KEY = process.env.ENTANGLED_API_KEY || '';
const ENTANGLED_TIMEOUT_MS = Number(process.env.ENTANGLED_TIMEOUT_MS || 20000);

export const ENTANGLED_WEBHOOK_SECRET =
  process.env.ENTANGLED_WEBHOOK_SECRET || '';

export const isEntangledConfigured = (): boolean => Boolean(ENTANGLED_API_KEY);

export interface EntangledClienteFinal {
  rfc: string;
  razon_social: string;
  regimen_fiscal: string;
  cp: string;
  uso_cfdi: string;
  email: string;
}

export interface EntangledOperacion {
  montos: number; // así lo pide el contrato del motor
  divisa_destino: string;
  conceptos: string[];
  comprobante_cliente_url: string;
}

export interface EntangledComisiones {
  asesor_id: string;
  asesor_nombre: string;
  comision_asesor: number;
  comision_xox: number;
}

export interface EntangledSolicitudPayload {
  cliente_final: EntangledClienteFinal;
  operacion: EntangledOperacion;
  comisiones: EntangledComisiones;
}

export interface EntangledSolicitudResponse {
  ok: boolean;
  transaccion_id?: string;
  estatus?: string;
  message?: string;
  raw?: unknown;
  error?: string;
}

/**
 * Envía la solicitud de pago a ENTANGLED (Fase 1).
 * Devuelve { ok, transaccion_id, raw } cuando el motor responde 2xx.
 */
export const sendSolicitudPago = async (
  payload: EntangledSolicitudPayload
): Promise<EntangledSolicitudResponse> => {
  if (!ENTANGLED_API_KEY) {
    return {
      ok: false,
      error:
        'ENTANGLED_API_KEY no configurada. Define la variable de entorno antes de enviar solicitudes.',
    };
  }

  try {
    const url = `${ENTANGLED_BASE_URL.replace(/\/$/, '')}/api/v1/solicitud-pago`;
    const res = await axios.post(url, payload, {
      timeout: ENTANGLED_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${ENTANGLED_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Source': 'XOX',
      },
    });

    const data = res.data || {};
    const transaccionId =
      data.transaccion_id || data.transaccionId || data.id || null;

    return {
      ok: true,
      transaccion_id: transaccionId || undefined,
      estatus: data.estatus || data.status,
      raw: data,
    };
  } catch (err) {
    const ax = err as AxiosError;
    const responseData = ax.response?.data as { error?: string; message?: string } | undefined;
    const message =
      responseData?.error ||
      responseData?.message ||
      ax.message ||
      'Error desconocido al contactar ENTANGLED';
    console.error('[ENTANGLED] sendSolicitudPago error:', message, ax.response?.status);
    return {
      ok: false,
      error: message,
      raw: ax.response?.data,
    };
  }
};
