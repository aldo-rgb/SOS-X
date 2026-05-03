// Configuración de la API
// En desarrollo usa IP local, en producción (TestFlight/App Store) usa Railway
import Constants from 'expo-constants';

const PROD_API_URL = 'https://sos-x-production.up.railway.app';
const DEV_API_URL = 'http://192.168.1.107:3001';

// __DEV__ es false en builds de producción (TestFlight/Store)
export const API_URL = __DEV__ ? DEV_API_URL : (Constants.expoConfig?.extra?.apiUrl || PROD_API_URL);

// Para obtener tu IP local ejecuta: ipconfig (Windows) o ifconfig (Mac/Linux)

export interface LoginResponse {
  user: {
    id: number;
    full_name: string;
    email: string;
    box_id: string;
    role: string;
    phone?: string;
  };
  access: {
    token: string;
    expiresIn: string;
  };
}

export interface Package {
  id: number;
  tracking_internal: string;
  tracking_provider?: string;
  description: string;
  weight: number | null;
  dimensions: string | null;
  declared_value: number | null;
  status: 'received' | 'in_transit' | 'customs' | 'ready_pickup' | 'delivered' | 'processing' | 'shipped' 
    // Maritime statuses
    | 'received_china' | 'at_port' | 'customs_mx' | 'in_transit_mx' | 'received_cedis'
    // China Air statuses  
    | 'received_origin' | 'at_customs';
  statusLabel: string;
  carrier?: string;
  national_carrier?: string | null;
  national_tracking?: string | null;
  national_label_url?: string | null;
  destination_city?: string;
  destination_country?: string;
  image_url?: string;
  is_master: boolean;
  total_boxes: number;
  received_at: string;
  delivered_at?: string;
  created_at: string;
  consolidation_id?: number;
  consolidation_status?: 'requested' | 'processing' | 'shipped' | 'delivered';
  warehouse_location?: 'usa_pobox' | 'china_air' | 'china_sea' | 'mx_cedis' | 'mx_national';
  service_type?: 'POBOX_USA' | 'AIR_CHN_MX' | 'SEA_CHN_MX' | 'AA_DHL' | 'NATIONAL';
  has_gex?: boolean;
  gex_folio?: string;
  // ✈️🇨🇳 Shipment type for differentiation
  shipment_type?: 'air' | 'maritime' | 'china_air' | 'dhl';
  // 💰 Costos
  assigned_cost_mxn?: number;
  saldo_pendiente?: number;
  monto_pagado?: number;
  // 💳 Orden de pago pendiente
  pending_payment_reference?: string | null;
  pending_payment_amount?: number | null;
  pending_payment_expires?: string | null;
  // 🏠 Instrucciones de entrega
  has_delivery_instructions?: boolean;
  delivery_address_id?: number;
  assigned_address_id?: number;
  destination_address?: string;
  destination_city?: string;
  destination_contact?: string;
  needs_instructions?: boolean;
}

// Función para hacer login
export const loginApi = async (email: string, password: string): Promise<LoginResponse> => {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al iniciar sesión');
  }

  return response.json();
};

// Función para obtener mis paquetes
export const getMyPackagesApi = async (userId: number, token: string): Promise<Package[]> => {
  const response = await fetch(`${API_URL}/api/client/packages/${userId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Error al obtener paquetes');
  }

  return response.json();
};

// Función para cambiar contraseña
export const changePasswordApi = async (token: string, currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${API_URL}/api/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al cambiar contraseña');
  }

  return response.json();
};

// Helper para parsear respuesta JSON de forma segura
const parseJsonResponse = async (response: Response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    // Si no es JSON válido (ej: HTML de error), mostrar mensaje amigable
    console.error('Error parsing response:', text.substring(0, 200));
    throw new Error('No se pudo conectar con el servidor. Verifica tu conexión a internet.');
  }
};

// Wrapper de API para llamadas genéricas (estilo axios)
export const api = {
  get: async (endpoint: string, config?: { headers?: Record<string, string> }) => {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...config?.headers,
        },
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) {
        throw { response: { data } };
      }
      return { data };
    } catch (error: any) {
      if (error.response) throw error;
      throw { response: { data: { error: error.message || 'Error de conexión' } } };
    }
  },
  post: async (endpoint: string, body?: any, config?: { headers?: Record<string, string> }) => {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config?.headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) {
        throw { response: { data } };
      }
      return { data };
    } catch (error: any) {
      if (error.response) throw error;
      throw { response: { data: { error: error.message || 'Error de conexión' } } };
    }
  },
};

// ============ MULTI-SERVICE PAYMENT APIs ============

export interface ServiceCompany {
  service: string;
  company_name: string;
  legal_name: string;
  rfc: string | null;
  is_active: boolean;
}

export interface PaymentInvoice {
  id: number;
  invoice_number: string;
  service_type: string;
  company_name: string;
  concept: string;
  description?: string;
  amount: number;
  status: 'pending' | 'partial' | 'paid' | 'cancelled';
  due_date?: string;
  reference_type?: string;
  reference_id?: number;
  created_at: string;
  paid_at?: string;
  source?: 'invoice' | 'package';
}

export interface PendingPaymentsResponse {
  success: boolean;
  totalPending: number;
  invoices: PaymentInvoice[];
}

export interface ServiceClabeResponse {
  success: boolean;
  service: string;
  company: {
    name: string;
    legal_name: string;
    rfc: string;
  };
  payment: {
    clabe: string;
    reference: string;
    bank: string;
  };
}

// Get pending payments for user
export const getPendingPaymentsApi = async (token: string): Promise<PendingPaymentsResponse> => {
  const response = await fetch(`${API_URL}/api/payments/pending`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al obtener pagos pendientes');
  }

  return response.json();
};

// Get CLABE for a specific service payment
export const getPaymentClabeApi = async (
  token: string, 
  serviceType: string, 
  invoiceId?: number
): Promise<ServiceClabeResponse> => {
  const response = await fetch(`${API_URL}/api/payments/clabe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ 
      serviceType, 
      invoiceId 
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al obtener CLABE');
  }

  return response.json();
};

// Get all available services
export const getServicesApi = async (): Promise<{ success: boolean; services: ServiceCompany[] }> => {
  const response = await fetch(`${API_URL}/api/services`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al obtener servicios');
  }

  return response.json();
};

// Get payment history
export const getPaymentHistoryApi = async (token: string): Promise<{
  success: boolean;
  payments: PaymentInvoice[];
}> => {
  const response = await fetch(`${API_URL}/api/payments/history`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al obtener historial');
  }

  return response.json();
};

// Get payment orders (pobox_payments)
export interface PaymentOrder {
  id: number;
  package_ids: number[];
  amount: number;
  currency: string;
  payment_method: string;
  payment_reference: string;
  status: string;
  created_at: string;
  paid_at: string | null;
  expires_at: string | null;
  packages: {
    id: number;
    tracking_internal: string;
    international_tracking: string;
    weight: number;
    assigned_cost_mxn: number;
    saldo_pendiente: number;
    national_shipping_cost: number;
    national_carrier: string;
    status: string;
  }[];
}

export const getPaymentOrdersApi = async (token: string): Promise<{
  success: boolean;
  payments: PaymentOrder[];
}> => {
  const response = await fetch(`${API_URL}/api/pobox/payment/history`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al obtener órdenes de pago');
  }

  return response.json();
};

// 🎠 Get carousel slides
export interface CarouselSlide {
  // El backend puede devolver con camelCase o snake_case
  id: string;
  slide_key?: string;
  type?: string;
  slide_type?: string;
  title: string;
  subtitle: string;
  ctaText?: string;
  cta_text?: string;
  ctaAction?: string;
  cta_action?: string;
  badge?: string;
  badgeColor?: string;
  badge_color?: string;
  imageType?: 'gradient' | 'image' | 'icon';
  image_type?: 'gradient' | 'image' | 'icon';
  imageUrl?: string;
  image_url?: string;
  iconName?: string;
  icon_name?: string;
  gradientColors?: string[];
  gradient_colors?: string[];
  iconBgColor?: string;
  icon_bg_color?: string;
  priority: number;
  isActive?: boolean;
  is_active?: boolean;
}

export const getCarouselSlidesApi = async (): Promise<{
  success: boolean;
  slides: CarouselSlide[];
}> => {
  const response = await fetch(`${API_URL}/api/carousel/slides`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al obtener slides del carrusel');
  }

  return response.json();
};

export default api;
