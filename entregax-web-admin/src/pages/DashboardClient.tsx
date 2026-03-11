// ============================================
// DASHBOARD - CLIENTE
// Panel principal para Clientes
// ============================================

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Avatar,
  Chip,
  TextField,
  InputAdornment,
  Button,
  Stepper,
  Step,
  StepLabel,
  Alert,
} from '@mui/material';
import {
  LocalShipping as ShippingIcon,
  Inventory as InventoryIcon,
  AttachMoney as MoneyIcon,
  Search as SearchIcon,
  CheckCircle as CheckCircleIcon,
  AccessTime as AccessTimeIcon,
  Flight as FlightIcon,
  DirectionsBoat as BoatIcon,
  LocalPostOffice as PostOfficeIcon,
  Home as HomeIcon,
  ContentCopy as CopyIcon,
  QrCode as QrCodeIcon,
} from '@mui/icons-material';
import api from '../services/api';

interface ClientStats {
  casillero: string;
  direccion_usa: {
    nombre: string;
    direccion: string;
    ciudad: string;
    estado: string;
    zip: string;
  };
  paquetes: {
    en_transito: number;
    en_bodega: number;
    listos_recoger: number;
    entregados_mes: number;
  };
  financiero: {
    saldo_pendiente: number;
    credito_disponible: number;
    ultimo_pago: string;
  };
}

interface PackageTracking {
  id: number;
  tracking: string;
  descripcion: string;
  servicio: string;
  status: string;
  status_label: string;
  fecha_estimada: string;
  monto: number;
}

const statusSteps = ['Ordenado', 'En Tránsito', 'En Aduana', 'En Bodega', 'Listo', 'Entregado'];

export default function DashboardClient() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [packages, setPackages] = useState<PackageTracking[]>([]);
  const [userName, setUserName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
    const user = localStorage.getItem('user');
    if (user) {
      const parsed = JSON.parse(user);
      setUserName(parsed.name?.split(' ')[0] || 'Cliente');
    }
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/dashboard/client');
      if (response.data) {
        setStats(response.data.stats);
        setPackages(response.data.packages || []);
      }
    } catch (error) {
      console.error('Error cargando dashboard:', error);
      // Datos de ejemplo
      setStats({
        casillero: 'S1-1234',
        direccion_usa: {
          nombre: 'Tu Nombre',
          direccion: '1234 Shipping Lane, Suite S1-1234',
          ciudad: 'Laredo',
          estado: 'TX',
          zip: '78045',
        },
        paquetes: { en_transito: 3, en_bodega: 2, listos_recoger: 1, entregados_mes: 8 },
        financiero: { saldo_pendiente: 1250, credito_disponible: 5000, ultimo_pago: '2024-03-05' },
      });
      setPackages([
        { id: 1, tracking: 'US-ABC12345', descripcion: 'Amazon - Electronics', servicio: 'usa_pobox', status: 'in_transit', status_label: 'En Tránsito', fecha_estimada: 'Mar 15', monto: 450 },
        { id: 2, tracking: 'CH-XYZ78901', descripcion: 'AliExpress - Accesorios', servicio: 'china_air', status: 'in_warehouse', status_label: 'En Bodega', fecha_estimada: 'Listo', monto: 320 },
        { id: 3, tracking: 'US-DEF45678', descripcion: 'eBay - Ropa', servicio: 'usa_pobox', status: 'ready_pickup', status_label: 'Listo Recoger', fecha_estimada: 'Hoy', monto: 180 },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusStep = (status: string): number => {
    switch (status) {
      case 'ordered': return 0;
      case 'in_transit': return 1;
      case 'customs': return 2;
      case 'in_warehouse': return 3;
      case 'ready_pickup': return 4;
      case 'delivered': return 5;
      default: return 1;
    }
  };

  const getServiceIcon = (servicio: string) => {
    switch (servicio) {
      case 'usa_pobox': return <PostOfficeIcon sx={{ color: '#2196F3' }} />;
      case 'china_air': return <FlightIcon sx={{ color: '#FF5722' }} />;
      case 'china_sea': return <BoatIcon sx={{ color: '#00BCD4' }} />;
      default: return <ShippingIcon />;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // TODO: Show snackbar
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
          ¡Hola, <span style={{ color: '#F05A28' }}>{userName}</span>! 👋
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
          <Chip 
            icon={<QrCodeIcon />} 
            label={`Casillero: ${stats?.casillero || 'N/A'}`} 
            color="primary" 
            variant="filled"
            sx={{ fontWeight: 'bold', fontSize: '1rem', py: 2 }}
          />
        </Box>
      </Box>

      {/* Alertas */}
      {stats && stats.paquetes.listos_recoger > 0 && (
        <Alert severity="success" sx={{ mb: 3 }} icon={<CheckCircleIcon />}>
          <strong>¡Tienes {stats.paquetes.listos_recoger} paquete(s) listo(s) para recoger!</strong> Visita nuestra sucursal para retirarlo.
        </Alert>
      )}
      {stats && stats.financiero.saldo_pendiente > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }} icon={<MoneyIcon />}>
          <strong>Saldo pendiente: ${stats.financiero.saldo_pendiente.toLocaleString()} MXN</strong> - Realiza tu pago para liberar tus paquetes.
        </Alert>
      )}

      {/* KPIs */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 3, textAlign: 'center', background: 'linear-gradient(135deg, #2196F3 0%, #64B5F6 100%)', color: 'white' }}>
            <FlightIcon sx={{ fontSize: 40, mb: 1 }} />
            <Typography variant="h3" fontWeight="bold">{stats?.paquetes.en_transito || 0}</Typography>
            <Typography variant="body2">En Tránsito</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 3, textAlign: 'center', background: 'linear-gradient(135deg, #FF9800 0%, #FFB74D 100%)', color: 'white' }}>
            <InventoryIcon sx={{ fontSize: 40, mb: 1 }} />
            <Typography variant="h3" fontWeight="bold">{stats?.paquetes.en_bodega || 0}</Typography>
            <Typography variant="body2">En Bodega</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 3, textAlign: 'center', background: 'linear-gradient(135deg, #4CAF50 0%, #81C784 100%)', color: 'white' }}>
            <CheckCircleIcon sx={{ fontSize: 40, mb: 1 }} />
            <Typography variant="h3" fontWeight="bold">{stats?.paquetes.listos_recoger || 0}</Typography>
            <Typography variant="body2">Listos Recoger</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 3, textAlign: 'center', background: 'linear-gradient(135deg, #9C27B0 0%, #BA68C8 100%)', color: 'white' }}>
            <HomeIcon sx={{ fontSize: 40, mb: 1 }} />
            <Typography variant="h3" fontWeight="bold">{stats?.paquetes.entregados_mes || 0}</Typography>
            <Typography variant="body2">Este Mes</Typography>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Mis Paquetes */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" fontWeight="bold">
                📦 Mis Paquetes
              </Typography>
              <TextField
                size="small"
                placeholder="Buscar tracking..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
                }}
              />
            </Box>

            {packages.map((pkg) => (
              <Card key={pkg.id} sx={{ mb: 2, border: pkg.status === 'ready_pickup' ? '2px solid #4CAF50' : 'none' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Avatar sx={{ bgcolor: 'grey.100' }}>
                        {getServiceIcon(pkg.servicio)}
                      </Avatar>
                      <Box>
                        <Typography variant="subtitle1" fontWeight="bold">{pkg.tracking}</Typography>
                        <Typography variant="body2" color="text.secondary">{pkg.descripcion}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Chip 
                        label={pkg.status_label} 
                        color={pkg.status === 'ready_pickup' ? 'success' : pkg.status === 'in_transit' ? 'info' : 'default'}
                        size="small"
                      />
                      {pkg.monto > 0 && (
                        <Typography variant="body2" color="warning.main" fontWeight="bold" sx={{ mt: 0.5 }}>
                          ${pkg.monto.toLocaleString()} MXN
                        </Typography>
                      )}
                    </Box>
                  </Box>

                  {/* Progress Stepper */}
                  <Stepper activeStep={getStatusStep(pkg.status)} alternativeLabel sx={{ mt: 2 }}>
                    {statusSteps.map((label) => (
                      <Step key={label}>
                        <StepLabel>{label}</StepLabel>
                      </Step>
                    ))}
                  </Stepper>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary">
                      <AccessTimeIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                      Fecha estimada: {pkg.fecha_estimada}
                    </Typography>
                    {pkg.status === 'ready_pickup' && (
                      <Button variant="contained" color="success" size="small">
                        Ver Detalles
                      </Button>
                    )}
                  </Box>
                </CardContent>
              </Card>
            ))}

            {packages.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <InventoryIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                <Typography color="text.secondary">No tienes paquetes activos</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Panel Lateral */}
        <Grid size={{ xs: 12, md: 4 }}>
          {/* Mi Dirección USA */}
          <Paper sx={{ p: 3, mb: 3, background: 'linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)', color: 'white' }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              🇺🇸 Mi Dirección USA
            </Typography>
            <Box sx={{ bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 2, p: 2, mt: 2 }}>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {stats?.direccion_usa.nombre}<br />
                {stats?.direccion_usa.direccion}<br />
                {stats?.direccion_usa.ciudad}, {stats?.direccion_usa.estado} {stats?.direccion_usa.zip}
              </Typography>
            </Box>
            <Button 
              startIcon={<CopyIcon />} 
              variant="outlined" 
              fullWidth 
              sx={{ mt: 2, borderColor: 'white', color: 'white', '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }}
              onClick={() => copyToClipboard(`${stats?.direccion_usa.nombre}\n${stats?.direccion_usa.direccion}\n${stats?.direccion_usa.ciudad}, ${stats?.direccion_usa.estado} ${stats?.direccion_usa.zip}`)}
            >
              Copiar Dirección
            </Button>
          </Paper>

          {/* Mi Cuenta */}
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              💳 Mi Cuenta
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="body2" color="text.secondary">Saldo Pendiente</Typography>
                <Typography variant="body2" fontWeight="bold" color={stats?.financiero.saldo_pendiente ? 'warning.main' : 'success.main'}>
                  ${(stats?.financiero.saldo_pendiente || 0).toLocaleString()} MXN
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="body2" color="text.secondary">Crédito Disponible</Typography>
                <Typography variant="body2" fontWeight="bold" color="success.main">
                  ${(stats?.financiero.credito_disponible || 0).toLocaleString()} MXN
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1 }}>
                <Typography variant="body2" color="text.secondary">Último Pago</Typography>
                <Typography variant="body2">{stats?.financiero.ultimo_pago || 'N/A'}</Typography>
              </Box>
            </Box>
            {stats?.financiero.saldo_pendiente && stats.financiero.saldo_pendiente > 0 && (
              <Button variant="contained" color="primary" fullWidth sx={{ mt: 2 }}>
                Realizar Pago
              </Button>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
