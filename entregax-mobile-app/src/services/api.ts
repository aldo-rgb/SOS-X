// Configuración de la API
// En desarrollo usar tu IP local, en producción cambiar a la URL del servidor
export const API_URL = 'http://192.168.1.114:3001'; // IP local detectada

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
  shipment_type?: 'air' | 'maritime' | 'china_air';
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

// Wrapper de API para llamadas genéricas (estilo axios)
export const api = {
  get: async (endpoint: string, config?: { headers?: Record<string, string> }) => {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...config?.headers,
      },
    });
    const data = await response.json();
    if (!response.ok) {
      throw { response: { data } };
    }
    return { data };
  },
  post: async (endpoint: string, body?: any, config?: { headers?: Record<string, string> }) => {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config?.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) {
      throw { response: { data } };
    }
    return { data };
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
  service_type: 'aereo' | 'maritimo' | 'terrestre_nacional' | 'dhl_liberacion' | 'po_box';
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
