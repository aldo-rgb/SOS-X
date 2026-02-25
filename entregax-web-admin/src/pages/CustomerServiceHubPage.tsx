import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Paper,
  IconButton,
  Alert,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import HeadsetMicIcon from '@mui/icons-material/HeadsetMic';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';

// Importar las páginas individuales
import UnifiedLeadsPage from './UnifiedLeadsPage';
import CRMClientsPage from './CRMClientsPage';
import SupportBoardPage from './SupportBoardPage';
import CarteraVencidaPage from './CarteraVencidaPage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Mapeo de herramientas a panel_key de permisos
const TOOL_PERMISSIONS: Record<string, string> = {
  'leads': 'cs_leads',
  'clients': 'cs_clients',
  'support': 'cs_support',
  'cartera': 'cs_cartera', // Este panel podría no existir aún, usamos cs_clients como fallback
};

interface User {
  id: number;
  full_name: string;
  email: string;
  box_id: string;
  role: string;
}

interface CustomerServiceHubPageProps {
  users: User[];
  loading: boolean;
  onRefresh: () => void;
}

type ActiveView = 'hub' | 'leads' | 'clients' | 'support' | 'cartera';

export default function CustomerServiceHubPage({ users: _users, loading: _loading, onRefresh: _onRefresh }: CustomerServiceHubPageProps) {
  const { t } = useTranslation();
  const [activeView, setActiveView] = useState<ActiveView>('hub');
  const [userPermissions, setUserPermissions] = useState<Record<string, { can_view: boolean; can_edit: boolean }>>({});

  const token = localStorage.getItem('token');
  const savedUser = localStorage.getItem('user');
  const currentUser = savedUser ? JSON.parse(savedUser) : null;
  const isSuperAdmin = currentUser?.role === 'super_admin';

  // Cargar permisos del usuario
  useEffect(() => {
    const loadPermissions = async () => {
      if (isSuperAdmin) return; // Super admin tiene todos los permisos
      try {
        const res = await fetch(`${API_URL}/api/admin/panels/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const permsMap: Record<string, { can_view: boolean; can_edit: boolean }> = {};
          (data.permissions || []).forEach((p: { panel_key: string; can_view: boolean; can_edit: boolean }) => {
            permsMap[p.panel_key] = { can_view: p.can_view, can_edit: p.can_edit };
          });
          setUserPermissions(permsMap);
        }
      } catch (err) {
        console.error('Error fetching permissions:', err);
      }
    };
    loadPermissions();
  }, [token, isSuperAdmin]);

  // Función para verificar permiso
  const hasPermission = (toolKey: string): boolean => {
    if (isSuperAdmin) return true;
    const panelKey = TOOL_PERMISSIONS[toolKey];
    return panelKey ? userPermissions[panelKey]?.can_view === true : false;
  };

  // Cards de las herramientas de servicio al cliente
  const serviceTools = [
    {
      key: 'leads',
      title: t('customerService.leads.title', 'Central de Leads'),
      description: t('customerService.leads.description', 'Gestión de prospectos, solicitudes de asesor y seguimiento comercial'),
      icon: <WhatshotIcon sx={{ fontSize: 40 }} />,
      color: '#FF6B35',
      bgColor: 'rgba(255, 107, 53, 0.1)',
    },
    {
      key: 'clients',
      title: t('customerService.clients.title', 'Control de Clientes'),
      description: t('customerService.clients.description', 'Análisis de clientes, detección de riesgo y acciones de recuperación'),
      icon: <PersonSearchIcon sx={{ fontSize: 40 }} />,
      color: '#2196F3',
      bgColor: 'rgba(33, 150, 243, 0.1)',
    },
    {
      key: 'support',
      title: t('customerService.support.title', 'Centro de Soporte'),
      description: t('customerService.support.description', 'Atención al cliente con IA, escalamiento y resolución de tickets'),
      icon: <HeadsetMicIcon sx={{ fontSize: 40 }} />,
      color: '#10B981',
      bgColor: 'rgba(16, 185, 129, 0.1)',
    },
    {
      key: 'cartera',
      title: t('customerService.cartera.title', 'Ajustes y Abandonos'),
      description: t('customerService.cartera.description', 'Cargos, descuentos, cobranza y abandono de mercancía'),
      icon: <AccountBalanceWalletIcon sx={{ fontSize: 40 }} />,
      color: '#EF4444',
      bgColor: 'rgba(239, 68, 68, 0.1)',
    },
  ];

  // Renderizar página activa
  if (activeView === 'leads') {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <IconButton onClick={() => setActiveView('hub')} sx={{ bgcolor: 'rgba(0,0,0,0.05)' }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" fontWeight={700}>
            {t('customerService.leads.title', 'Central de Leads')}
          </Typography>
        </Box>
        <UnifiedLeadsPage />
      </Box>
    );
  }

  if (activeView === 'clients') {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <IconButton onClick={() => setActiveView('hub')} sx={{ bgcolor: 'rgba(0,0,0,0.05)' }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" fontWeight={700}>
            {t('customerService.clients.title', 'Control de Clientes')}
          </Typography>
        </Box>
        <CRMClientsPage />
      </Box>
    );
  }

  if (activeView === 'support') {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <IconButton onClick={() => setActiveView('hub')} sx={{ bgcolor: 'rgba(0,0,0,0.05)' }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" fontWeight={700}>
            {t('customerService.support.title', 'Centro de Soporte')}
          </Typography>
        </Box>
        <SupportBoardPage />
      </Box>
    );
  }

  if (activeView === 'cartera') {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <IconButton onClick={() => setActiveView('hub')} sx={{ bgcolor: 'rgba(0,0,0,0.05)' }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" fontWeight={700}>
            {t('customerService.cartera.title', 'Ajustes y Cartera Vencida')}
          </Typography>
        </Box>
        <CarteraVencidaPage />
      </Box>
    );
  }

  // Hub principal
  // Filtrar herramientas según permisos
  const filteredTools = serviceTools.filter(tool => hasPermission(tool.key));

  // Si no tiene permisos para ninguna herramienta
  if (filteredTools.length === 0) {
    return (
      <Box>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h5" fontWeight={700} color="text.primary">
            {t('customerService.title', 'Servicio a Cliente')}
          </Typography>
        </Box>
        <Alert severity="warning">
          No tienes permisos para acceder a las herramientas de Servicio a Cliente.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" fontWeight={700} color="text.primary">
          {t('customerService.title', 'Servicio a Cliente')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {t('customerService.subtitle', 'Herramientas de CRM, gestión de leads y soporte al cliente')}
        </Typography>
      </Box>

      {/* Grid de herramientas */}
      <Box sx={{ 
        display: 'grid', 
        gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, 
        gap: 3 
      }}>
        {filteredTools.map((tool) => (
          <Paper
            key={tool.key}
            onClick={() => setActiveView(tool.key as ActiveView)}
            sx={{
              p: 3,
              borderRadius: 3,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              border: '2px solid transparent',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: '0 12px 24px -10px rgba(0,0,0,0.15)',
                borderColor: tool.color,
              },
            }}
          >
            <Box
              sx={{
                width: 72,
                height: 72,
                borderRadius: 3,
                bgcolor: tool.bgColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: tool.color,
                mb: 2,
              }}
            >
              {tool.icon}
            </Box>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
              {tool.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {tool.description}
            </Typography>
          </Paper>
        ))}
      </Box>

      {/* Estadísticas rápidas */}
      <Box sx={{ mt: 4 }}>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
          {t('customerService.quickStats', 'Resumen Rápido')}
        </Typography>
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, 
          gap: 2 
        }}>
          <Paper sx={{ p: 2, borderRadius: 2, textAlign: 'center' }}>
            <Typography variant="h4" fontWeight={700} color="#FF6B35">
              --
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('customerService.stats.pendingLeads', 'Leads Pendientes')}
            </Typography>
          </Paper>
          <Paper sx={{ p: 2, borderRadius: 2, textAlign: 'center' }}>
            <Typography variant="h4" fontWeight={700} color="#2196F3">
              --
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('customerService.stats.activeClients', 'Clientes Activos')}
            </Typography>
          </Paper>
          <Paper sx={{ p: 2, borderRadius: 2, textAlign: 'center' }}>
            <Typography variant="h4" fontWeight={700} color="#EF4444">
              --
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('customerService.stats.atRiskClients', 'Clientes en Riesgo')}
            </Typography>
          </Paper>
          <Paper sx={{ p: 2, borderRadius: 2, textAlign: 'center' }}>
            <Typography variant="h4" fontWeight={700} color="#10B981">
              --
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('customerService.stats.openTickets', 'Tickets Abiertos')}
            </Typography>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}
