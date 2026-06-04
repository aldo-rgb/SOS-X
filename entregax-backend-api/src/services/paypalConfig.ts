/**
 * Configuración multi-empresa de PayPal.
 *
 * Reutiliza el mismo modelo que Openpay: cada `service_type` en
 * `service_company_config` tiene un `emitter_id` que apunta a
 * `fiscal_emitters`. Las columnas `paypal_client_id`, `paypal_secret`,
 * `paypal_sandbox` y `paypal_configured` viven en `fiscal_emitters`,
 * por lo que la misma empresa emisora cobra y factura.
 *
 * Si el servicio no tiene emitter mapeado o el emitter no tiene PayPal
 * configurado, hace fallback al primer emisor con PayPal configurado
 * (comportamiento legacy) para evitar romper flujos existentes.
 */

import { pool } from '../db';
import { ServiceType } from './openpayConfig';

export interface PayPalCredentials {
  clientId: string;
  secret: string;
  isSandbox: boolean;
  emitterId: number;
  empresaName: string;
}

const PAYPAL_API_SANDBOX = 'https://api-m.sandbox.paypal.com';
const PAYPAL_API_PRODUCTION = 'https://api-m.paypal.com';

const SERVICE_TYPE_MAP: Record<string, string> = {
  po_box: 'POBOX_USA',
  aereo: 'AIR_CHN_MX',
  maritimo: 'SEA_CHN_MX',
  dhl_liberacion: 'AA_DHL',
  terrestre_nacional: 'TERRESTRE_NAL',
};

/**
 * Obtiene credenciales PayPal de la empresa asignada a un servicio.
 * Si serviceType no se pasa, devuelve el primer emisor con PayPal
 * configurado (legacy fallback).
 */
export const getPaypalCredentials = async (
  serviceType?: ServiceType | string
): Promise<PayPalCredentials> => {
  if (serviceType) {
    const mapped = SERVICE_TYPE_MAP[serviceType as string] || String(serviceType).toUpperCase();
    const r = await pool.query(
      `SELECT fe.id, fe.alias, fe.paypal_client_id, fe.paypal_secret, fe.paypal_sandbox
         FROM service_company_config scc
         JOIN fiscal_emitters fe ON scc.emitter_id = fe.id
        WHERE scc.service_type = $1
          AND scc.is_active = TRUE
          AND COALESCE(fe.is_active, true) = TRUE
          AND fe.paypal_configured = TRUE
          AND fe.paypal_client_id IS NOT NULL
          AND fe.paypal_client_id <> ''
        LIMIT 1`,
      [mapped]
    );
    if (r.rows.length) {
      const row = r.rows[0];
      console.log(`🔑 PayPal credentials (service ${serviceType}) -> ${row.alias}`);
      return {
        clientId: row.paypal_client_id,
        secret: row.paypal_secret,
        isSandbox: row.paypal_sandbox !== false,
        emitterId: row.id,
        empresaName: row.alias,
      };
    }
    console.warn(`⚠️ PayPal: servicio ${serviceType} sin emisor con PayPal. Usando fallback.`);
  }

  // Fallback legacy: primer emisor con PayPal configurado.
  const r = await pool.query(
    `SELECT id, alias, paypal_client_id, paypal_secret, paypal_sandbox
       FROM fiscal_emitters
      WHERE paypal_configured = TRUE
        AND paypal_client_id IS NOT NULL
        AND paypal_client_id <> ''
        AND COALESCE(is_active, true) = TRUE
      ORDER BY id
      LIMIT 1`
  );

  if (!r.rows.length) {
    throw new Error('No hay credenciales de PayPal configuradas en ninguna empresa');
  }
  const row = r.rows[0];
  console.log(`🔑 PayPal credentials (fallback) -> ${row.alias}`);
  return {
    clientId: row.paypal_client_id,
    secret: row.paypal_secret,
    isSandbox: row.paypal_sandbox !== false,
    emitterId: row.id,
    empresaName: row.alias,
  };
};

/** Devuelve la URL base de la API de PayPal según ambiente. */
export const getPaypalApiUrl = (credentials: PayPalCredentials): string =>
  credentials.isSandbox ? PAYPAL_API_SANDBOX : PAYPAL_API_PRODUCTION;
