// ============================================
// DASHBOARD - OPERACIONES DE BODEGA
// Panel principal para Warehouse Operations
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Alert,
} from '@mui/material';
import {
  Inventory as InventoryIcon,
  LocalShipping as ShippingIcon,
  QrCodeScanner as ScannerIcon,
  Flight as FlightIcon,
  DirectionsBoat as BoatIcon,
  LocalPostOffice as PostOfficeIcon,
  CheckCircle as CheckCircleIcon,
  TrendingUp as TrendingUpIcon,
  Assignment as AssignmentIcon,
  MoveToInbox as InboxIcon,
  Outbox as OutboxIcon,
} from '@mui/icons-material';
import api from '../services/api';

interface WarehouseStats {
  recepcion: {
    hoy: number;
    pendientes_procesar: number;
    por_servicio: {
      usa_pobox: number;
      china_air: number;
      china_sea: number;
      nacional: number;
    };
  };
  inventario: {
    total_paquetes: number;
    por_ubicar: number;
    ubicados: number;
  };
  despacho: {
    hoy: number;
    en_proceso: number;
    consolidaciones_pendientes: number;
  };
  productividad: {
    recepciones_por_hora: number;
    despachos_por_hora: number;
    porcentaje_meta: number;
  };
}

interface PendingTask {
  id: number;
  tipo: 'recepcion' | 'ubicacion' | 'despacho' | 'consolidacion';
  descripcion: string;
  cantidad: number;
  prioridad: 'alta' | 'media' | 'baja';
  servicio: string;
}

export default function DashboardOperations() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<WarehouseStats | null>(null);
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    loadData();
    const user = localStorage.getItem('user');
    if (user) {
      const parsed = JSON.parse(user);
      setUserName(parsed.name?.split(' ')[0] || 'Operador');
    }
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/dashboard/warehouse-ops');
      if (response.data) {
        setStats(response.data.stats);
        setPendingTasks(response.data.tasks || []);
      }
    } catch (error) {
      console.error('Error cargando dashboard:', error);
      // Datos de ejemplo
      setStats({
        recepcion: { 
          hoy: 156, 
          pendientes_procesar: 23,
          por_servicio: { usa_pobox: 45, china_air: 67, china_sea: 32, nacional: 12 }
        },
        inventario: { total_paquetes: 1245, por_ubicar: 45, ubicados: 1200 },
        despacho: { hoy: 89, en_proceso: 15, consolidaciones_pendientes: 8 },
        productividad: { recepciones_por_hora: 18, despachos_por_hora: 12, porcentaje_meta: 92 },
      });
      setPendingTasks([
        { id: 1, tipo: 'recepcion', descripcion: 'Contenedor China Marítimo #FCL-2024-089', cantidad: 156, prioridad: 'alta', servicio: 'china_sea' },
        { id: 2, tipo: 'ubicacion', descripcion: 'Paquetes sin ubicar en rack', cantidad: 23, prioridad: 'media', servicio: 'usa_pobox' },
        { id: 3, tipo: 'consolidacion', descripcion: 'Consolidaciones pendientes USA', cantidad: 8, prioridad: 'alta', servicio: 'usa_pobox' },
        { id: 4, tipo: 'despacho', descripcion: 'Despachos programados para hoy', cantidad: 15, prioridad: 'media', servicio: 'nacional' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getServiceIcon = (servicio: string) => {
    switch (servicio) {
      case 'usa_pobox': return <PostOfficeIcon />;
      case 'china_air': return <FlightIcon />;
      case 'china_sea': return <BoatIcon />;
      case 'nacional': return <ShippingIcon />;
      default: return <InventoryIcon />;
    }
  };

  const getServiceColor = (servicio: string) => {
    switch (servicio) {
      case 'usa_pobox': return '#2196F3';
      case 'china_air': return '#FF5722';
      case 'china_sea': return '#00BCD4';
      case 'nacional': return '#9C27B0';
      default: return '#757575';
    }
  };

  const getPriorityColor = (prioridad: string) => {
    switch (prioridad) {
      case 'alta': return 'error';
      case 'media': return 'warning';
      case 'baja': return 'success';
      default: return 'default';
    }
  };

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'recepcion': return <InboxIcon />;
      case 'ubicacion': return <InventoryIcon />;
      case 'despacho': return <OutboxIcon />;
      case 'consolidacion': return <AssignmentIcon />;
      default: return <InventoryIcon />;
    }
  };

  const quickActions = [
    { icon: <ScannerIcon sx={{ fontSize: 40 }} />, title: 'Escanear Recepción', color: '#4CAF50', path: '/panels/operations' },
    { icon: <InventoryIcon sx={{ fontSize: 40 }} />, title: 'Ubicar Paquetes', color: '#2196F3', path: '/panels/operations' },
    { icon: <AssignmentIcon sx={{ fontSize: 40 }} />, title: 'Consolidaciones', color: '#FF9800', path: '/panels/operations' },
    { icon: <OutboxIcon sx={{ fontSize: 40 }} />, title: 'Despachos', color: '#9C27B0', path: '/panels/operations' },
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
      {/* 🚧 Banner de Construcción */}
      <Alert 
        severity="warning" 
        icon={<span style={{ fontSize: 24 }}>🚧</span>}
        sx={{ 
          mb: 3, 
          borderRadius: 2,
          bgcolor: '#FFF3E0',
          border: '2px dashed #FF9800',
          '& .MuiAlert-message': { width: '100%' }
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography variant="subtitle1" fontWeight="bold" color="#E65100">
              ⚠️ Página en Construcción
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Los datos mostrados son <strong>imágenes de demostración</strong>. Las funcionalidades reales están siendo desarrolladas.
            </Typography>
          </Box>
          <Chip 
            label="DEMO" 
            size="small" 
            sx={{ 
              bgcolor: '#FF9800', 
              color: 'white', 
              fontWeight: 'bold',
              animation: 'pulse 2s infinite'
            }} 
          />
        </Box>
      </Alert>

      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={700}>
          ¡A trabajar, <span style={{ color: '#F05A28' }}>{userName}</span>! 💪
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Panel de Operaciones de Bodega - {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Typography>
      </Box>

      {/* KPIs Principales */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Recepciones Hoy */}
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 3, background: 'linear-gradient(135deg, #4CAF50 0%, #81C784 100%)', color: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Recepciones Hoy</Typography>
                <Typography variant="h3" fontWeight="bold">{stats?.recepcion.hoy || 0}</Typography>
              </Box>
              <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                <InboxIcon />
              </Avatar>
            </Box>
            <Chip 
              label={`${stats?.recepcion.pendientes_procesar || 0} pendientes`} 
              size="small" 
              sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
            />
          </Paper>
        </Grid>

        {/* Despachos Hoy */}
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 3, background: 'linear-gradient(135deg, #2196F3 0%, #64B5F6 100%)', color: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Despachos Hoy</Typography>
                <Typography variant="h3" fontWeight="bold">{stats?.despacho.hoy || 0}</Typography>
              </Box>
              <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                <OutboxIcon />
              </Avatar>
            </Box>
            <Chip 
              label={`${stats?.despacho.en_proceso || 0} en proceso`} 
              size="small" 
              sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
            />
          </Paper>
        </Grid>

        {/* Inventario Total */}
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 3, background: 'linear-gradient(135deg, #FF9800 0%, #FFB74D 100%)', color: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>En Bodega</Typography>
                <Typography variant="h3" fontWeight="bold">{stats?.inventario.total_paquetes || 0}</Typography>
              </Box>
              <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                <InventoryIcon />
              </Avatar>
            </Box>
            <Chip 
              label={`${stats?.inventario.por_ubicar || 0} por ubicar`} 
              size="small" 
              sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
            />
          </Paper>
        </Grid>

        {/* Productividad */}
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 3, background: 'linear-gradient(135deg, #9C27B0 0%, #BA68C8 100%)', color: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Productividad</Typography>
                <Typography variant="h3" fontWeight="bold">{stats?.productividad.porcentaje_meta || 0}%</Typography>
              </Box>
              <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                <TrendingUpIcon />
              </Avatar>
            </Box>
            <Chip 
              label={`${stats?.productividad.recepciones_por_hora || 0}/hora`} 
              size="small" 
              sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
            />
          </Paper>
        </Grid>
      </Grid>

      {/* Acciones Rápidas */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" fontWeight="bold" gutterBottom>
          ⚡ Acciones Rápidas
        </Typography>
        <Grid container spacing={2}>
          {quickActions.map((action, index) => (
            <Grid size={{ xs: 6, sm: 3 }} key={index}>
              <Card sx={{ transition: 'all 0.2s', '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 } }}>
                <CardActionArea sx={{ p: 2, textAlign: 'center' }}>
                  <Avatar sx={{ bgcolor: action.color, width: 64, height: 64, mx: 'auto', mb: 1 }}>
                    {action.icon}
                  </Avatar>
                  <Typography variant="subtitle2" fontWeight="bold">{action.title}</Typography>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Paper>

      <Grid container spacing={3}>
        {/* Tareas Pendientes */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              📋 Tareas Pendientes
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Tarea</TableCell>
                    <TableCell>Servicio</TableCell>
                    <TableCell align="center">Cantidad</TableCell>
                    <TableCell align="center">Prioridad</TableCell>
                    <TableCell align="right">Acción</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingTasks.map((task) => (
                    <TableRow key={task.id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar sx={{ width: 32, height: 32, bgcolor: 'grey.200' }}>
                            {getTipoIcon(task.tipo)}
                          </Avatar>
                          <Box>
                            <Typography variant="body2" fontWeight="bold">
                              {task.tipo.charAt(0).toUpperCase() + task.tipo.slice(1)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">{task.descripcion}</Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          icon={getServiceIcon(task.servicio)}
                          label={task.servicio.replace('_', ' ').toUpperCase()}
                          size="small"
                          sx={{ bgcolor: getServiceColor(task.servicio), color: 'white' }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="h6" fontWeight="bold">{task.cantidad}</Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip 
                          label={task.prioridad.toUpperCase()} 
                          color={getPriorityColor(task.prioridad) as 'error' | 'warning' | 'info' | 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Button variant="contained" size="small">Iniciar</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Resumen por Servicio */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              📊 Recepciones por Servicio
            </Typography>
            <Box sx={{ mt: 2 }}>
              {[
                { key: 'usa_pobox', label: '🇺🇸 PO Box USA', value: stats?.recepcion.por_servicio.usa_pobox || 0 },
                { key: 'china_air', label: '🇨🇳 China Aéreo', value: stats?.recepcion.por_servicio.china_air || 0 },
                { key: 'china_sea', label: '🚢 China Marítimo', value: stats?.recepcion.por_servicio.china_sea || 0 },
                { key: 'nacional', label: '🇲🇽 Nacional', value: stats?.recepcion.por_servicio.nacional || 0 },
              ].map((item) => {
                const total = stats?.recepcion.hoy || 1;
                const percentage = (item.value / total) * 100;
                return (
                  <Box key={item.key} sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2">{item.label}</Typography>
                      <Typography variant="body2" fontWeight="bold">{item.value}</Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={percentage}
                      sx={{ 
                        height: 10, 
                        borderRadius: 5,
                        bgcolor: 'grey.200',
                        '& .MuiLinearProgress-bar': { bgcolor: getServiceColor(item.key) }
                      }}
                    />
                  </Box>
                );
              })}
            </Box>

            <Box sx={{ mt: 3, p: 2, bgcolor: 'success.light', borderRadius: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon color="success" />
                <Typography variant="body2" fontWeight="bold" color="success.dark">
                  {stats?.inventario.ubicados || 0} paquetes correctamente ubicados
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
