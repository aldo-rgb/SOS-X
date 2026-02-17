/**
 * Configuración Multi-Cuenta de Openpay
 * Cada servicio (RFC) tiene sus propias credenciales
 */

import { pool } from '../db';

export type ServiceType = 'aereo' | 'maritimo' | 'terrestre_nacional' | 'dhl_liberacion' | 'po_box';

export interface OpenpayCredentials {
  merchantId: string;
  privateKey: string;
  publicKey?: string | undefined;
  isSandbox: boolean;
}

// Mapeo de servicios a variables de entorno
const SERVICE_ENV_MAP: Record<ServiceType, { merchant: string; private: string; public: string }> = {
  aereo: {
    merchant: 'OP_AEREO_MERCHANT',
    private: 'OP_AEREO_PRIVATE',
    public: 'OP_AEREO_PUBLIC'
  },
  maritimo: {
    merchant: 'OP_MARITIMO_MERCHANT',
    private: 'OP_MARITIMO_PRIVATE',
    public: 'OP_MARITIMO_PUBLIC'
  },
  terrestre_nacional: {
    merchant: 'OP_TERRESTRE_MERCHANT',
    private: 'OP_TERRESTRE_PRIVATE',
    public: 'OP_TERRESTRE_PUBLIC'
  },
  dhl_liberacion: {
    merchant: 'OP_DHL_MERCHANT',
    private: 'OP_DHL_PRIVATE',
    public: 'OP_DHL_PUBLIC'
  },
  po_box: {
    merchant: 'OP_POBOX_MERCHANT',
    private: 'OP_POBOX_PRIVATE',
    public: 'OP_POBOX_PUBLIC'
  }
};

/**
 * Obtiene las credenciales de Openpay para un servicio específico
 * Primero busca en la base de datos, si no hay, busca en variables de entorno
 */
export const getOpenpayCredentials = async (service: ServiceType): Promise<OpenpayCredentials> => {
  // 1. Intentar obtener de la base de datos
  const dbResult = await pool.query(
    `SELECT openpay_merchant_id, openpay_private_key, openpay_public_key, is_sandbox 
     FROM service_companies WHERE service = $1`,
    [service]
  );

  if (dbResult.rows.length > 0 && dbResult.rows[0].openpay_merchant_id) {
    const row = dbResult.rows[0];
    return {
      merchantId: row.openpay_merchant_id,
      privateKey: row.openpay_private_key,
      publicKey: row.openpay_public_key,
      isSandbox: row.is_sandbox
    };
  }

  // 2. Fallback a variables de entorno
  const envMap = SERVICE_ENV_MAP[service];
  if (!envMap) {
    throw new Error(`Servicio no válido: ${service}`);
  }

  const merchantId = process.env[envMap.merchant];
  const privateKey = process.env[envMap.private];
  const publicKey = process.env[envMap.public];

  if (!merchantId || !privateKey) {
    throw new Error(`Credenciales de Openpay no configuradas para servicio: ${service}`);
  }

  return {
    merchantId,
    privateKey,
    publicKey,
    isSandbox: process.env.OPENPAY_SANDBOX === 'true'
  };
};

/**
 * Obtiene información de la empresa/servicio
 */
export const getServiceCompanyInfo = async (service: ServiceType) => {
  const result = await pool.query(
    `SELECT * FROM service_companies WHERE service = $1`,
    [service]
  );
  
  if (result.rows.length === 0) {
    throw new Error(`Servicio no encontrado: ${service}`);
  }
  
  return result.rows[0];
};

/**
 * Lista todos los servicios disponibles
 */
export const getAllServices = async () => {
  const result = await pool.query(
    `SELECT service, company_name, legal_name, rfc, is_active 
     FROM service_companies WHERE is_active = TRUE ORDER BY id`
  );
  return result.rows;
};

/**
 * Mapea el tipo de referencia a un servicio
 */
export const getServiceFromReferenceType = (referenceType: string): ServiceType => {
  const mapping: Record<string, ServiceType> = {
    'maritime_order': 'maritimo',
    'air_shipment': 'aereo',
    'domestic_shipment': 'terrestre_nacional',
    'dhl_release': 'dhl_liberacion',
    'po_box_rental': 'po_box',
    'po_box_package': 'po_box'
  };

  return mapping[referenceType] || 'maritimo'; // default
};
