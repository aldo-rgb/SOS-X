import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Paper,
  IconButton,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import HeadsetMicIcon from '@mui/icons-material/HeadsetMic';

// Importar las páginas individuales
import UnifiedLeadsPage from './UnifiedLeadsPage';
import CRMClientsPage from './CRMClientsPage';
import SupportBoardPage from './SupportBoardPage';

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

type ActiveView = 'hub' | 'leads' | 'clients' | 'support';

export default function CustomerServiceHubPage({ users: _users, loading: _loading, onRefresh: _onRefresh }: CustomerServiceHubPageProps) {
  const { t } = useTranslation();
  const [activeView, setActiveView] = useState<ActiveView>('hub');

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

  // Hub principal
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
        {serviceTools.map((tool) => (
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
