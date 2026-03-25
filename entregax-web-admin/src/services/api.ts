// ============================================
// SERVICIO API - ADMIN PANEL
// Configuración centralizada de Axios
// ============================================

import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar token automáticamente
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para manejar errores de autenticación
// Solo cerrar sesión en endpoints críticos, no en opcionales como referidos/wallet
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      // Endpoints críticos que requieren logout inmediato si fallan
      const criticalEndpoints = [
        '/auth/profile',
        '/auth/me',
        '/dashboard/client',
        '/dashboard/admin',
      ];
      const isCritical = criticalEndpoints.some(ep => url.includes(ep));
      
      if (isCritical) {
        // Token expirado o inválido en endpoint crítico
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/';
      }
      // Para endpoints no críticos, solo rechazar el error sin logout
    }
    return Promise.reject(error);
  }
);

export default api;
