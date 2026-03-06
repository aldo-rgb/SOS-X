/**
 * Configuración Multi-Cuenta de Openpay
 * Cada servicio tiene su propia empresa fiscal con credenciales OpenPay
 * Estructura: service_company_config -> fiscal_emitters (openpay_*)
 */

import { pool } from '../db';

// Tipos de servicio internos
export type ServiceType = 'aereo' | 'maritimo' | 'terrestre_nacional' | 'dhl_liberacion' | 'po_box';

// Mapeo de ServiceType a service_type en service_company_config
const SERVICE_TYPE_MAP: Record<ServiceType, string> = {
  po_box: 'POBOX_USA',
  aereo: 'AIR_CHN_MX',
  maritimo: 'SEA_CHN_MX',
  terrestre_nacional: 'AA_DHL',
  dhl_liberacion: 'AA_DHL'
};

export interface OpenpayCredentials {
  merchantId: string;
  privateKey: string;
  publicKey?: string | undefined;
  isSandbox: boolean;
  emitterAlias?: string;
}

// Mapeo de servicios a variables de entorno (fallback)
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
 * 1. Busca en service_company_config -> fiscal_emitters
 * 2. Fallback a variables de entorno
 */
export const getOpenpayCredentials = async (service: ServiceType): Promise<OpenpayCredentials> => {
  // 1. Buscar configuración del servicio y su empresa fiscal
  const serviceType = SERVICE_TYPE_MAP[service] || service.toUpperCase();
  
  const dbResult = await pool.query(
    `SELECT 
       fe.openpay_merchant_id,
       fe.openpay_private_key,
       fe.openpay_public_key,
       fe.alias as emitter_alias,
       COALESCE(fe.is_sandbox, false) as is_sandbox
     FROM service_company_config scc
     JOIN fiscal_emitters fe ON scc.emitter_id = fe.id
     WHERE scc.service_type = $1 AND scc.is_active = TRUE AND fe.is_active = TRUE`,
    [serviceType]
  );

  if (dbResult.rows.length > 0 && dbResult.rows[0].openpay_merchant_id && dbResult.rows[0].openpay_private_key) {
    const row = dbResult.rows[0];
    console.log(`🔑 OpenPay credentials from DB for ${service} -> ${row.emitter_alias}`);
    return {
      merchantId: row.openpay_merchant_id,
      privateKey: row.openpay_private_key,
      publicKey: row.openpay_public_key,
      isSandbox: row.is_sandbox,
      emitterAlias: row.emitter_alias
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
    throw new Error(`Credenciales de Openpay no configuradas para servicio: ${service}. Configure en fiscal_emitters o variables de entorno.`);
  }

  console.log(`🔑 OpenPay credentials from ENV for ${service}`);
  return {
    merchantId,
    privateKey,
    publicKey,
    isSandbox: process.env.OPENPAY_SANDBOX === 'true'
  };
};

/**
 * Obtiene información de la empresa/servicio con datos fiscales
 */
export const getServiceCompanyInfo = async (service: ServiceType) => {
  const serviceType = SERVICE_TYPE_MAP[service] || service.toUpperCase();
  
  const result = await pool.query(
    `SELECT 
       scc.id, scc.service_type, scc.service_name, scc.is_active,
       fe.alias as company_name, fe.legal_name, fe.rfc,
       fe.openpay_merchant_id, fe.bank_clabe, fe.bank_name
     FROM service_company_config scc
     LEFT JOIN fiscal_emitters fe ON scc.emitter_id = fe.id
     WHERE scc.service_type = $1`,
    [serviceType]
  );
  
  if (result.rows.length === 0) {
    throw new Error(`Servicio no encontrado: ${service}`);
  }
  
  return result.rows[0];
};

/**
 * Lista todos los servicios disponibles con sus empresas
 */
export const getAllServices = async () => {
  const result = await pool.query(
    `SELECT 
       scc.service_type as service, 
       scc.service_name,
       fe.alias as company_name, 
       fe.legal_name, 
       fe.rfc, 
       scc.is_active
     FROM service_company_config scc
     LEFT JOIN fiscal_emitters fe ON scc.emitter_id = fe.id
     WHERE scc.is_active = TRUE 
     ORDER BY scc.id`
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
