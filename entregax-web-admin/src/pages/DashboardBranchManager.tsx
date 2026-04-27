// ============================================
// DASHBOARD - GERENTE DE SUCURSAL
// Panel principal para Branch Manager
// ============================================

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardActionArea,
  CircularProgress,
  Avatar,
  Chip,

  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
} from '@mui/material';
import {
  Inventory as InventoryIcon,
  AttachMoney as MoneyIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  DirectionsBoat as DirectionsBoatIcon,
  FlightTakeoff as FlightTakeoffIcon,
  Store as StoreIcon,
  LocalShipping as LocalShippingIcon,
  ConfirmationNumber as TicketIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import api from '../services/api';
import DelayedPackagesPage from './DelayedPackagesPage';

interface BranchStats {
  sucursal: {
    nombre: string;
    codigo: string;
  };
  paquetes: {
    en_bodega: number;
    en_transito: number;
    en_espera_cajas?: number;
    en_espera_maritimo?: number;
    en_espera_aereo?: number;
    entregados_hoy: number;
    pendientes_cobro: number;
  };
  financiero: {
    ingresos_hoy: number;
    ingresos_mes: number;
    saldo_caja: number;
    cuentas_por_cobrar: number;
  };
  operaciones: {
    recepciones_hoy: number;
    despachos_hoy: number;
    consolidaciones_pendientes: number;
  };
  equipo: {
    empleados_activos: number;
    en_turno: number;
  };
}

interface QuickAction {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  action: 'operations' | 'service_tickets' | 'relabeling' | 'branch_inventory';
}

export default function DashboardBranchManager() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<BranchStats | null>(null);
  const [userName, setUserName] = useState('');
  const [delayedCount, setDelayedCount] = useState<number>(0);
  const [delayedOpen, setDelayedOpen] = useState(false);

  useEffect(() => {
    loadData();
    loadDelayedCount();
    const user = localStorage.getItem('user');
    if (user) {
      const parsed = JSON.parse(user);
      setUserName(parsed.name?.split(' ')[0] || 'Gerente');
    }
    const iv = setInterval(loadDelayedCount, 60000);
    return () => clearInterval(iv);
  }, []);

  const loadDelayedCount = async () => {
    try {
      const res = await api.get('/admin/customer-service/delayed-packages');
      const list = res.data?.packages || [];
      setDelayedCount(list.length);
    } catch (err) {
      console.error('Error loading delayed count:', err);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Cargar estadísticas del dashboard de gerente
      const response = await api.get('/dashboard/branch-manager');
      if (response.data) {
        setStats(response.data);
      }
    } catch (error) {
      console.error('Error cargando dashboard:', error);
      // Evitar datos ficticios en dashboard
      setStats({
        sucursal: { nombre: 'CEDIS MTY', codigo: 'MTY' },
        paquetes: { en_bodega: 0, en_transito: 0, en_espera_cajas: 0, en_espera_maritimo: 0, en_espera_aereo: 0, entregados_hoy: 0, pendientes_cobro: 0 },
        financiero: { ingresos_hoy: 0, ingresos_mes: 0, saldo_caja: 0, cuentas_por_cobrar: 0 },
        operaciones: { recepciones_hoy: 0, despachos_hoy: 0, consolidaciones_pendientes: 0 },
        equipo: { empleados_activos: 0, en_turno: 0 },
      });
    } finally {
      setLoading(false);
    }
  };

  const quickActions: QuickAction[] = [
    {
      title: 'Operaciones',
      description: 'Ir al panel de operaciones',
      icon: <InventoryIcon sx={{ fontSize: 40 }} />,
      color: '#2196F3',
      action: 'operations',
    },
    {
      title: 'Acceso directo a etiquetado',
      description: 'Abrir módulo de reetiquetado',
      icon: <LocalShippingIcon sx={{ fontSize: 40 }} />,
      color: '#4CAF50',
      action: 'relabeling',
    },
    {
      title: 'Tráfico por Sucursal',
      description: 'Abrir tráfico de tu sucursal',
      icon: <StoreIcon sx={{ fontSize: 40 }} />,
      color: '#9C27B0',
      action: 'branch_inventory',
    },
    {
      title: 'Soporte técnico',
      description: 'Abrir servicio al cliente',
      icon: <TicketIcon sx={{ fontSize: 40 }} />,
      color: '#FF9800',
      action: 'service_tickets',
    },
  ];

  const handleQuickAction = (action: QuickAction['action']) => {
    window.dispatchEvent(new CustomEvent('branch-manager-quick-nav', { detail: { action } }));
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={700}>
          Buenos días, <span style={{ color: '#F05A28' }}>{userName}</span> 👋
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
          <Chip 
            icon={<StoreIcon />} 
            label={stats?.sucursal.nombre || 'Mi Sucursal'} 
            color="primary" 
            variant="outlined" 
          />
          <Typography variant="body2" color="text.secondary">
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </Typography>
        </Box>
      </Box>

      {/* Alertas importantes */}
      {stats && stats.paquetes.pendientes_cobro > 20 && (
        <Alert severity="warning" sx={{ mb: 3 }} icon={<WarningIcon />}>
          <strong>Atención:</strong> Tienes {stats.paquetes.pendientes_cobro} paquetes pendientes de cobro
        </Alert>
      )}

      {/* KPIs Principales */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Paquetes en Bodega */}
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <Paper sx={{ p: 3, height: '100%', background: 'linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)', color: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>En Bodega</Typography>
                <Typography variant="h3" fontWeight="bold">{stats?.paquetes.en_bodega || 0}</Typography>
                <Typography variant="caption">paquetes</Typography>
              </Box>
              <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                <InventoryIcon />
              </Avatar>
            </Box>
          </Paper>
        </Grid>

        {/* Entregas Hoy */}
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <Paper sx={{ p: 3, height: '100%', background: 'linear-gradient(135deg, #388E3C 0%, #66BB6A 100%)', color: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Entregas Hoy</Typography>
                <Typography variant="h3" fontWeight="bold">{stats?.paquetes.entregados_hoy || 0}</Typography>
                <Typography variant="caption">completadas</Typography>
              </Box>
              <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                <CheckCircleIcon />
              </Avatar>
            </Box>
          </Paper>
        </Grid>

        {/* En espera (cajas en tránsito a MTY NL) */}
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <Paper sx={{ p: 3, height: '100%', background: 'linear-gradient(135deg, #7B1FA2 0%, #BA68C8 100%)', color: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>En espera</Typography>
                <Typography variant="h3" fontWeight="bold">{(stats?.paquetes.en_espera_cajas ?? stats?.paquetes.en_transito ?? 0).toLocaleString()}</Typography>
                <Typography variant="caption">cajas en tránsito a MTY NL</Typography>
              </Box>
              <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                <MoneyIcon />
              </Avatar>
            </Box>
          </Paper>
        </Grid>

        {/* En espera marítimo */}
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <Paper sx={{ p: 3, height: '100%', background: 'linear-gradient(135deg, #00695C 0%, #26A69A 100%)', color: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>En espera Marítimo</Typography>
                <Typography variant="h3" fontWeight="bold">{(stats?.paquetes.en_espera_maritimo ?? 0).toLocaleString()}</Typography>
                <Typography variant="caption">cajas marítimas</Typography>
              </Box>
              <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                <DirectionsBoatIcon />
              </Avatar>
            </Box>
          </Paper>
        </Grid>

        {/* En espera aéreo */}
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <Paper sx={{ p: 3, height: '100%', background: 'linear-gradient(135deg, #5E35B1 0%, #7E57C2 100%)', color: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>En espera Aéreo</Typography>
                <Typography variant="h3" fontWeight="bold">{(stats?.paquetes.en_espera_aereo ?? 0).toLocaleString()}</Typography>
                <Typography variant="caption">cajas aereas</Typography>
              </Box>
              <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                <FlightTakeoffIcon />
              </Avatar>
            </Box>
          </Paper>
        </Grid>

        {/* Guías con Retraso (click para ver detalles) */}
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <Paper
            onClick={() => setDelayedOpen(true)}
            sx={{
              p: 3,
              height: '100%',
              background: delayedCount > 0
                ? 'linear-gradient(135deg, #C62828 0%, #EF5350 100%)'
                : 'linear-gradient(135deg, #616161 0%, #9E9E9E 100%)',
              color: 'white',
              cursor: 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: 6 },
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Guías con Retraso</Typography>
                <Typography variant="h3" fontWeight="bold">{delayedCount}</Typography>
                <Typography variant="caption">
                  {delayedCount === 0 ? 'sin retrasos' : delayedCount === 1 ? 'paquete retrasado' : 'paquetes retrasados'}
                </Typography>
              </Box>
              <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                <LocalShippingIcon />
              </Avatar>
            </Box>
            <Typography variant="caption" sx={{ display: 'block', mt: 1, opacity: 0.85, fontSize: '0.7rem' }}>
              Click para ver detalles →
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Modal: Detalle de Guías con Retraso */}
      <Dialog
        open={delayedOpen}
        onClose={() => setDelayedOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, minHeight: '70vh' } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#F05A28', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LocalShippingIcon />
            <Typography variant="h6" fontWeight={700}>Guías con Retraso</Typography>
          </Box>
          <IconButton onClick={() => setDelayedOpen(false)} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <DelayedPackagesPage hideActions />
        </DialogContent>
      </Dialog>

      {/* Accesos Rápidos */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              ⚡ Accesos Rápidos
            </Typography>

            <Grid container spacing={2} sx={{ mt: 1 }}>
              {quickActions.map((action, index) => (
                <Grid size={{ xs: 12, sm: 6, md: 3 }} key={index}>
                  <Card
                    sx={{
                      height: '100%',
                      transition: 'transform 0.2s',
                      '&:hover': { transform: 'scale(1.02)' }
                    }}
                  >
                    <CardActionArea onClick={() => handleQuickAction(action.action)} sx={{ p: 2, height: '100%' }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                        <Avatar sx={{ bgcolor: action.color, width: 56, height: 56, mb: 1 }}>
                          {action.icon}
                        </Avatar>
                        <Typography variant="subtitle2" fontWeight="bold">{action.title}</Typography>
                        <Typography variant="caption" color="text.secondary">{action.description}</Typography>
                      </Box>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
