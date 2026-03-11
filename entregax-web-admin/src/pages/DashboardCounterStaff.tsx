// ============================================
// DASHBOARD - PERSONAL DE MOSTRADOR
// Panel principal para Counter Staff
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
  TextField,
  InputAdornment,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Divider,
  Badge,
} from '@mui/material';
import {
  QrCodeScanner as ScannerIcon,
  Inventory as InventoryIcon,
  AttachMoney as MoneyIcon,
  Person as PersonIcon,
  Search as SearchIcon,
  CheckCircle as CheckCircleIcon,
  AccessTime as AccessTimeIcon,
  Print as PrintIcon,
  LocalAtm as CashIcon,
  AssignmentTurnedIn as DeliveryIcon,
} from '@mui/icons-material';
import api from '../services/api';

interface CounterStats {
  entregas: {
    pendientes: number;
    realizadas_hoy: number;
    en_espera: number;
  };
  cobros: {
    pendientes: number;
    cobrados_hoy: number;
    monto_cobrado: number;
  };
  recepciones: {
    hoy: number;
    por_registrar: number;
  };
}

interface PendingDelivery {
  id: number;
  tracking: string;
  cliente: string;
  box_id: string;
  monto: number;
  status: string;
  llegada: string;
}

export default function DashboardCounterStaff() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CounterStats | null>(null);
  const [pendingDeliveries, setPendingDeliveries] = useState<PendingDelivery[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    loadData();
    const user = localStorage.getItem('user');
    if (user) {
      const parsed = JSON.parse(user);
      setUserName(parsed.name?.split(' ')[0] || 'Usuario');
    }
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/dashboard/counter-staff');
      if (response.data) {
        setStats(response.data.stats);
        setPendingDeliveries(response.data.pendingDeliveries || []);
      }
    } catch (error) {
      console.error('Error cargando dashboard:', error);
      // Datos de ejemplo
      setStats({
        entregas: { pendientes: 28, realizadas_hoy: 45, en_espera: 5 },
        cobros: { pendientes: 15, cobrados_hoy: 32, monto_cobrado: 8750 },
        recepciones: { hoy: 67, por_registrar: 3 },
      });
      setPendingDeliveries([
        { id: 1, tracking: 'US-ABC12345', cliente: 'María García', box_id: 'S1-1234', monto: 450, status: 'listo', llegada: 'hace 2h' },
        { id: 2, tracking: 'CH-XYZ78901', cliente: 'Juan Pérez', box_id: 'S1-0089', monto: 1200, status: 'listo', llegada: 'hace 4h' },
        { id: 3, tracking: 'US-DEF45678', cliente: 'Ana López', box_id: 'S1-2456', monto: 890, status: 'pendiente_pago', llegada: 'ayer' },
        { id: 4, tracking: 'MX-NAC12345', cliente: 'Carlos Ruiz', box_id: 'S1-1122', monto: 0, status: 'listo', llegada: 'hace 1h' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusChip = (status: string) => {
    switch (status) {
      case 'listo':
        return <Chip label="LISTO" color="success" size="small" />;
      case 'pendiente_pago':
        return <Chip label="PAGO PENDIENTE" color="warning" size="small" />;
      default:
        return <Chip label={status} size="small" />;
    }
  };

  const quickActions = [
    { icon: <ScannerIcon sx={{ fontSize: 48 }} />, title: 'Escanear Entrega', color: '#4CAF50', action: 'scan' },
    { icon: <CashIcon sx={{ fontSize: 48 }} />, title: 'Cobrar Paquete', color: '#2196F3', action: 'collect' },
    { icon: <InventoryIcon sx={{ fontSize: 48 }} />, title: 'Recepción', color: '#FF9800', action: 'receive' },
    { icon: <PrintIcon sx={{ fontSize: 48 }} />, title: 'Imprimir Etiqueta', color: '#9C27B0', action: 'print' },
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
      {/* Header con Buscador */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          ¡Listo para atender, <span style={{ color: '#F05A28' }}>{userName}</span>! 🎯
        </Typography>
        
        {/* Buscador Principal */}
        <Paper sx={{ p: 2, mt: 2 }}>
          <TextField
            fullWidth
            placeholder="Buscar por tracking, casillero o nombre del cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <Button variant="contained" size="small" startIcon={<ScannerIcon />}>
                    Escanear
                  </Button>
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 3,
                bgcolor: 'grey.50',
              }
            }}
          />
        </Paper>
      </Box>

      {/* KPIs Principales */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Entregas Pendientes */}
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 3, background: 'linear-gradient(135deg, #FF9800 0%, #FFB74D 100%)', color: 'white', textAlign: 'center' }}>
            <Badge badgeContent={stats?.entregas.en_espera || 0} color="error" sx={{ '& .MuiBadge-badge': { fontSize: 14, height: 24, minWidth: 24 } }}>
              <DeliveryIcon sx={{ fontSize: 48, mb: 1 }} />
            </Badge>
            <Typography variant="h3" fontWeight="bold">{stats?.entregas.pendientes || 0}</Typography>
            <Typography variant="body2">Entregas Pendientes</Typography>
          </Paper>
        </Grid>

        {/* Entregas Hoy */}
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 3, background: 'linear-gradient(135deg, #4CAF50 0%, #81C784 100%)', color: 'white', textAlign: 'center' }}>
            <CheckCircleIcon sx={{ fontSize: 48, mb: 1 }} />
            <Typography variant="h3" fontWeight="bold">{stats?.entregas.realizadas_hoy || 0}</Typography>
            <Typography variant="body2">Entregas Hoy</Typography>
          </Paper>
        </Grid>

        {/* Por Cobrar */}
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 3, background: 'linear-gradient(135deg, #F44336 0%, #EF5350 100%)', color: 'white', textAlign: 'center' }}>
            <MoneyIcon sx={{ fontSize: 48, mb: 1 }} />
            <Typography variant="h3" fontWeight="bold">{stats?.cobros.pendientes || 0}</Typography>
            <Typography variant="body2">Cobros Pendientes</Typography>
          </Paper>
        </Grid>

        {/* Cobrado Hoy */}
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 3, background: 'linear-gradient(135deg, #2196F3 0%, #64B5F6 100%)', color: 'white', textAlign: 'center' }}>
            <CashIcon sx={{ fontSize: 48, mb: 1 }} />
            <Typography variant="h3" fontWeight="bold">${(stats?.cobros.monto_cobrado || 0).toLocaleString()}</Typography>
            <Typography variant="body2">Cobrado Hoy</Typography>
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
              <Card 
                sx={{ 
                  height: '100%',
                  transition: 'all 0.2s',
                  '&:hover': { 
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                  }
                }}
              >
                <CardActionArea sx={{ p: 3, textAlign: 'center' }}>
                  <Avatar 
                    sx={{ 
                      bgcolor: action.color, 
                      width: 72, 
                      height: 72, 
                      mx: 'auto', 
                      mb: 2,
                      boxShadow: 2,
                    }}
                  >
                    {action.icon}
                  </Avatar>
                  <Typography variant="subtitle1" fontWeight="bold">{action.title}</Typography>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* Paquetes Listos para Entrega */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight="bold">
            📦 Paquetes Listos para Entrega
          </Typography>
          <Chip label={`${pendingDeliveries.length} en espera`} color="primary" />
        </Box>
        
        <List>
          {pendingDeliveries.map((delivery, index) => (
            <Box key={delivery.id}>
              <ListItem
                sx={{
                  py: 2,
                  borderRadius: 2,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                secondaryAction={
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    {delivery.monto > 0 && (
                      <Chip 
                        label={`$${delivery.monto.toLocaleString()}`} 
                        color="warning" 
                        size="small"
                        icon={<MoneyIcon />}
                      />
                    )}
                    <Button 
                      variant="contained" 
                      size="small" 
                      color={delivery.status === 'listo' ? 'success' : 'warning'}
                    >
                      {delivery.status === 'listo' ? 'Entregar' : 'Cobrar'}
                    </Button>
                  </Box>
                }
              >
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: delivery.status === 'listo' ? 'success.main' : 'warning.main' }}>
                    <InventoryIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle2" fontWeight="bold">{delivery.tracking}</Typography>
                      {getStatusChip(delivery.status)}
                    </Box>
                  }
                  secondary={
                    <>
                      <Typography variant="body2" component="span">
                        <PersonIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                        {delivery.cliente} • {delivery.box_id}
                      </Typography>
                      <br />
                      <Typography variant="caption" color="text.secondary">
                        <AccessTimeIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />
                        Llegó {delivery.llegada}
                      </Typography>
                    </>
                  }
                />
              </ListItem>
              {index < pendingDeliveries.length - 1 && <Divider variant="inset" component="li" />}
            </Box>
          ))}
        </List>

        {pendingDeliveries.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              ¡Excelente! No hay paquetes pendientes
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
