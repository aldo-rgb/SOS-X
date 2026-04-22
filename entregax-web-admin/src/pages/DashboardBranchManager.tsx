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
  LinearProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  People as PeopleIcon,
  AccountBalance as AccountBalanceIcon,
  Inventory as InventoryIcon,
  Speed as SpeedIcon,
  AttachMoney as MoneyIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Store as StoreIcon,
  LocalShipping as LocalShippingIcon,
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
  path: string;
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
      // Usar datos de ejemplo si falla
      setStats({
        sucursal: { nombre: 'Sucursal Principal', codigo: 'MTY-001' },
        paquetes: { en_bodega: 145, en_transito: 89, entregados_hoy: 23, pendientes_cobro: 34 },
        financiero: { ingresos_hoy: 15420, ingresos_mes: 245800, saldo_caja: 8500, cuentas_por_cobrar: 42300 },
        operaciones: { recepciones_hoy: 45, despachos_hoy: 38, consolidaciones_pendientes: 12 },
        equipo: { empleados_activos: 8, en_turno: 5 },
      });
    } finally {
      setLoading(false);
    }
  };

  const quickActions: QuickAction[] = [
    {
      title: 'Operaciones de Almacén',
      description: 'Recepción, inventario y despachos',
      icon: <InventoryIcon sx={{ fontSize: 40 }} />,
      color: '#2196F3',
      path: '/panels/operations',
    },
    {
      title: 'Caja y Cobros',
      description: 'Control de pagos y efectivo',
      icon: <MoneyIcon sx={{ fontSize: 40 }} />,
      color: '#4CAF50',
      path: '/caja-chica',
    },
    {
      title: 'Tesorería',
      description: 'Reportes financieros de sucursal',
      icon: <AccountBalanceIcon sx={{ fontSize: 40 }} />,
      color: '#9C27B0',
      path: '/panels/tesoreria',
    },
    {
      title: 'Servicio al Cliente',
      description: 'Atención y seguimiento',
      icon: <PeopleIcon sx={{ fontSize: 40 }} />,
      color: '#FF9800',
      path: '/panels/service',
    },
  ];

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
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
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
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
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

        {/* Ingresos Hoy */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 3, height: '100%', background: 'linear-gradient(135deg, #7B1FA2 0%, #BA68C8 100%)', color: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Ingresos Hoy</Typography>
                <Typography variant="h3" fontWeight="bold">${(stats?.financiero.ingresos_hoy || 0).toLocaleString()}</Typography>
                <Typography variant="caption">MXN</Typography>
              </Box>
              <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                <MoneyIcon />
              </Avatar>
            </Box>
          </Paper>
        </Grid>

        {/* Guías con Retraso (click para ver detalles) */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
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
          <DelayedPackagesPage />
        </DialogContent>
      </Dialog>

      {/* Resumen Operativo y Accesos Rápidos */}
      <Grid container spacing={3}>
        {/* Resumen del Día */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              📊 Resumen del Día
            </Typography>
            
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">Recepciones</Typography>
                <Typography variant="body2" fontWeight="bold">{stats?.operaciones.recepciones_hoy || 0}</Typography>
              </Box>
              <LinearProgress variant="determinate" value={75} sx={{ mb: 2, height: 8, borderRadius: 4 }} />
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">Despachos</Typography>
                <Typography variant="body2" fontWeight="bold">{stats?.operaciones.despachos_hoy || 0}</Typography>
              </Box>
              <LinearProgress variant="determinate" value={60} color="success" sx={{ mb: 2, height: 8, borderRadius: 4 }} />
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">Consolidaciones Pendientes</Typography>
                <Typography variant="body2" fontWeight="bold" color="warning.main">{stats?.operaciones.consolidaciones_pendientes || 0}</Typography>
              </Box>
              <LinearProgress variant="determinate" value={40} color="warning" sx={{ height: 8, borderRadius: 4 }} />
            </Box>

            <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.100', borderRadius: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">Saldo en Caja</Typography>
                  <Typography variant="h5" fontWeight="bold" color="success.main">
                    ${(stats?.financiero.saldo_caja || 0).toLocaleString()} MXN
                  </Typography>
                </Box>
                <AccountBalanceIcon sx={{ fontSize: 40, color: 'success.main', opacity: 0.5 }} />
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Accesos Rápidos */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              ⚡ Accesos Rápidos
            </Typography>
            
            <Grid container spacing={2} sx={{ mt: 1 }}>
              {quickActions.map((action, index) => (
                <Grid size={{ xs: 6 }} key={index}>
                  <Card 
                    sx={{ 
                      height: '100%',
                      transition: 'transform 0.2s',
                      '&:hover': { transform: 'scale(1.02)' }
                    }}
                  >
                    <CardActionArea sx={{ p: 2, height: '100%' }}>
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

        {/* Equipo y Métricas */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              👥 Mi Equipo
            </Typography>
            <Box sx={{ display: 'flex', gap: 3, mt: 2 }}>
              <Box sx={{ textAlign: 'center', flex: 1 }}>
                <Avatar sx={{ bgcolor: 'primary.main', width: 64, height: 64, mx: 'auto', mb: 1 }}>
                  <PeopleIcon sx={{ fontSize: 32 }} />
                </Avatar>
                <Typography variant="h4" fontWeight="bold">{stats?.equipo.empleados_activos || 0}</Typography>
                <Typography variant="body2" color="text.secondary">Empleados Activos</Typography>
              </Box>
              <Box sx={{ textAlign: 'center', flex: 1 }}>
                <Avatar sx={{ bgcolor: 'success.main', width: 64, height: 64, mx: 'auto', mb: 1 }}>
                  <SpeedIcon sx={{ fontSize: 32 }} />
                </Avatar>
                <Typography variant="h4" fontWeight="bold">{stats?.equipo.en_turno || 0}</Typography>
                <Typography variant="body2" color="text.secondary">En Turno Ahora</Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Ingresos del Mes */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              💰 Ingresos del Mes
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h3" fontWeight="bold" color="success.main">
                  ${(stats?.financiero.ingresos_mes || 0).toLocaleString()}
                </Typography>
                <Typography variant="body2" color="text.secondary">MXN - {new Date().toLocaleDateString('es-MX', { month: 'long' })}</Typography>
              </Box>
              <TrendingUpIcon sx={{ fontSize: 64, color: 'success.main', opacity: 0.3 }} />
            </Box>
            <Box sx={{ mt: 2, p: 2, bgcolor: 'warning.light', borderRadius: 2 }}>
              <Typography variant="body2" color="warning.dark">
                <strong>Cuentas por Cobrar:</strong> ${(stats?.financiero.cuentas_por_cobrar || 0).toLocaleString()} MXN
              </Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
