// Configuración de la API
// En desarrollo usar tu IP local, en producción cambiar a la URL del servidor
export const API_URL = 'http://192.168.1.126:3001/api'; // IP local detectada

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
  status: 'received' | 'in_transit' | 'customs' | 'ready_pickup' | 'delivered' | 'processing' | 'shipped';
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
}

// Función para hacer login
export const loginApi = async (email: string, password: string): Promise<LoginResponse> => {
  const response = await fetch(`${API_URL}/auth/login`, {
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
  const response = await fetch(`${API_URL}/client/packages/${userId}`, {
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
  const response = await fetch(`${API_URL}/auth/change-password`, {
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
