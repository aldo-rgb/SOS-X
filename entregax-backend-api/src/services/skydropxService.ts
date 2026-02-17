// ============================================
// SERVICIO DE SKYDROPX - ÚLTIMA MILLA 🚚
// Integración con API de Skydropx para generación de guías
// ============================================

import axios from 'axios';

const SKYDROPX_API = process.env.SKYDROPX_API_URL || 'https://api.skydropx.com/v1';
const API_KEY = process.env.SKYDROPX_API_KEY || '';
const IS_SANDBOX = process.env.SKYDROPX_SANDBOX === 'true';

// Dirección origen (CEDIS EntregaX)
const CEDIS_ADDRESS = {
  name: process.env.CEDIS_NAME || 'CEDIS EntregaX',
  company: process.env.CEDIS_COMPANY || 'EntregaX Logistics',
  address1: process.env.CEDIS_ADDRESS || 'Av. Logística 123',
  city: process.env.CEDIS_CITY || 'Azcapotzalco',
  province: process.env.CEDIS_STATE || 'Ciudad de México',
  zip: process.env.CEDIS_ZIP || '02000',
  country: 'MX',
  phone: process.env.CEDIS_PHONE || '5512345678',
  email: process.env.CEDIS_EMAIL || 'cedis@entregax.com'
};

interface SkydropxAddress {
  name: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  zip: string;
  country: string;
  phone: string;
  email: string;
}

interface ParcelDimensions {
  weight: number;
  length: number;
  width: number;
  height: number;
}

interface ShipmentRate {
  id: string;
  provider: string;
  serviceName: string;
  totalPrice: number;
  currency: string;
  deliveryDays: number;
  attributes: any;
}

interface CreateShipmentResult {
  success: boolean;
  shipmentId?: string;
  rates?: ShipmentRate[];
  error?: string;
}

interface CreateLabelResult {
  success: boolean;
  trackingNumber?: string;
  labelUrl?: string;
  labelId?: string;
  error?: string;
}

// Headers para la API
const getHeaders = () => ({
  'Authorization': `Token token=${API_KEY}`,
  'Content-Type': 'application/json'
});

/**
 * Crea un shipment en Skydropx y obtiene las tarifas disponibles
 */
export const createShipment = async (
  addressTo: SkydropxAddress,
  parcel: ParcelDimensions,
  addressFrom?: SkydropxAddress
): Promise<CreateShipmentResult> => {
  try {
    if (!API_KEY) {
      console.warn('[SKYDROPX] No API key configured, returning mock data');
      return getMockRates();
    }

    const payload = {
      address_from: addressFrom || CEDIS_ADDRESS,
      address_to: addressTo,
      parcels: [{
        weight: parcel.weight,
        length: parcel.length,
        width: parcel.width,
        height: parcel.height,
        distance_unit: 'CM',
        mass_unit: 'KG'
      }]
    };

    console.log('[SKYDROPX] Creating shipment:', JSON.stringify(payload, null, 2));

    const response = await axios.post(`${SKYDROPX_API}/shipments`, payload, {
      headers: getHeaders(),
      timeout: 30000
    });

    const shipmentId = response.data.data?.id;
    const included = response.data.included || [];

    // Parsear las tarifas
    const rates: ShipmentRate[] = included
      .filter((item: any) => item.type === 'rates')
      .map((rate: any) => ({
        id: rate.id,
        provider: rate.attributes.provider,
        serviceName: rate.attributes.service_name || rate.attributes.provider,
        totalPrice: parseFloat(rate.attributes.total_pricing || rate.attributes.amount_local),
        currency: rate.attributes.currency || 'MXN',
        deliveryDays: rate.attributes.days || 0,
        attributes: rate.attributes
      }));

    console.log('[SKYDROPX] Shipment created:', shipmentId, '- Rates:', rates.length);

    return {
      success: true,
      shipmentId,
      rates
    };

  } catch (error: any) {
    console.error('[SKYDROPX] Error creating shipment:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.errors?.[0]?.detail || error.message
    };
  }
};

/**
 * Genera la etiqueta de envío (label)
 */
export const createLabel = async (
  rateId: string,
  labelFormat: 'pdf' | 'zpl' = 'pdf'
): Promise<CreateLabelResult> => {
  try {
    if (!API_KEY) {
      console.warn('[SKYDROPX] No API key, returning mock label');
      return getMockLabel();
    }

    const payload = {
      rate_id: rateId,
      label_format: labelFormat
    };

    console.log('[SKYDROPX] Creating label for rate:', rateId);

    const response = await axios.post(`${SKYDROPX_API}/labels`, payload, {
      headers: getHeaders(),
      timeout: 30000
    });

    const labelData = response.data.data;
    const trackingNumber = labelData.attributes?.tracking_number;
    const labelUrl = labelData.attributes?.label_url;
    const labelId = labelData.id;

    console.log('[SKYDROPX] Label created:', trackingNumber, labelUrl);

    return {
      success: true,
      trackingNumber,
      labelUrl,
      labelId
    };

  } catch (error: any) {
    console.error('[SKYDROPX] Error creating label:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.errors?.[0]?.detail || error.message
    };
  }
};

/**
 * Obtiene el estado de un envío por tracking
 */
export const getTrackingStatus = async (trackingNumber: string): Promise<any> => {
  try {
    if (!API_KEY) {
      return { status: 'mock', events: [] };
    }

    const response = await axios.get(`${SKYDROPX_API}/tracking/${trackingNumber}`, {
      headers: getHeaders(),
      timeout: 15000
    });

    return response.data;

  } catch (error: any) {
    console.error('[SKYDROPX] Error getting tracking:', error.message);
    return null;
  }
};

/**
 * Cotiza sin crear shipment (para mostrar estimados)
 */
export const quoteShipment = async (
  originZip: string,
  destinationZip: string,
  parcel: ParcelDimensions
): Promise<ShipmentRate[]> => {
  try {
    // Crear un shipment temporal con CPs para obtener cotizaciones
    const result = await createShipment(
      {
        name: 'Cotización',
        address1: 'Dirección de prueba',
        city: 'Ciudad',
        province: 'Estado',
        zip: destinationZip,
        country: 'MX',
        phone: '0000000000',
        email: 'cotizacion@temp.com'
      },
      parcel,
      {
        ...CEDIS_ADDRESS,
        zip: originZip
      }
    );

    return result.rates || [];

  } catch (error) {
    console.error('[SKYDROPX] Error quoting:', error);
    return [];
  }
};

// =====================================
// DATOS MOCK PARA DESARROLLO/SANDBOX
// =====================================

function getMockRates(): CreateShipmentResult {
  return {
    success: true,
    shipmentId: `MOCK-SHIP-${Date.now()}`,
    rates: [
      {
        id: 'MOCK-RATE-ESTAFETA',
        provider: 'estafeta',
        serviceName: 'Estafeta Día Siguiente',
        totalPrice: 189.00,
        currency: 'MXN',
        deliveryDays: 1,
        attributes: { mock: true }
      },
      {
        id: 'MOCK-RATE-ESTAFETA-ECO',
        provider: 'estafeta',
        serviceName: 'Estafeta Terrestre',
        totalPrice: 129.00,
        currency: 'MXN',
        deliveryDays: 3,
        attributes: { mock: true }
      },
      {
        id: 'MOCK-RATE-PAQUETEXPRESS',
        provider: 'paquetexpress',
        serviceName: 'PaqueteExpress Terrestre',
        totalPrice: 145.00,
        currency: 'MXN',
        deliveryDays: 2,
        attributes: { mock: true }
      },
      {
        id: 'MOCK-RATE-FEDEX',
        provider: 'fedex',
        serviceName: 'FedEx Express',
        totalPrice: 320.00,
        currency: 'MXN',
        deliveryDays: 1,
        attributes: { mock: true }
      },
      {
        id: 'MOCK-RATE-DHL',
        provider: 'dhl',
        serviceName: 'DHL Express',
        totalPrice: 380.00,
        currency: 'MXN',
        deliveryDays: 1,
        attributes: { mock: true }
      }
    ]
  };
}

function getMockLabel(): CreateLabelResult {
  const trackingNumber = `MOCK${Date.now()}`;
  return {
    success: true,
    trackingNumber,
    labelUrl: `https://example.com/labels/${trackingNumber}.pdf`,
    labelId: `MOCK-LABEL-${Date.now()}`
  };
}

// Exportar configuración del CEDIS
export const getCedisAddress = () => CEDIS_ADDRESS;
export const isConfigured = () => !!API_KEY;
export const isSandbox = () => IS_SANDBOX || !API_KEY;
