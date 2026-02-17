// ============================================
// PANEL DE ÚLTIMA MILLA 🚚
// Generación de guías nacionales con Skydropx
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  Chip,
  CircularProgress,
  Card,
  CardContent,
  Tabs,
  Tab,
  TextField,
  InputAdornment,
  Tooltip,
  LinearProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  // Stack, // No se usa actualmente
} from '@mui/material';
import {
  LocalShipping as TruckIcon,
  Print as PrintIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Place as PlaceIcon,
  OpenInNew as OpenInNewIcon,
  CheckCircle as CheckIcon,
  Schedule as ScheduleIcon,
  Inventory as BoxIcon,
  Flight as FlightIcon,
  DirectionsBoat as ShipIcon,
  Air as AirIcon,
  // AttachMoney as MoneyIcon, // No se usa actualmente
  // Speed as SpeedIcon, // No se usa actualmente
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import Grid from '@mui/material/Unstable_Grid2';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Colores del tema
const LAST_MILE_COLOR = '#E91E63'; // Rosa/Magenta para última milla

interface ShipmentItem {
  id: number;
  reference_type: string;
  tracking_internal: string;
  description: string;
  weight: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  status: string;
  national_tracking: string | null;
  national_carrier: string | null;
  national_label_url: string | null;
  dispatched_at: string | null;
  user_id: number;
  client_name: string;
  client_email: string;
  client_phone: string;
  address_id: number | null;
  destination_name: string;
  destination_address: string;
  destination_city: string;
  destination_state: string;
  destination_zip: string;
  destination_phone: string;
  service_type: string;
}

interface ShipmentRate {
  id: string;
  provider: string;
  serviceName: string;
  totalPrice: number;
  currency: string;
  deliveryDays: number;
  carrierName?: string;
  carrierLogo?: string;
}

interface DispatchedShipment {
  id: number;
  reference_type: string;
  reference_id: number;
  carrier: string;
  tracking_number: string;
  label_url: string;
  destination_city: string;
  destination_state: string;
  client_name: string;
  status: string;
  created_at: string;
  tracking_url?: string;
  carrier_name?: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

export default function LastMilePage() {
  const token = localStorage.getItem('token');

  // Estados principales
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ShipmentItem[]>([]);
  const [dispatched, setDispatched] = useState<DispatchedShipment[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterService, setFilterService] = useState<string | null>(null);

  // Estados del modal de cotización
  const [quoteDialog, setQuoteDialog] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ShipmentItem | null>(null);
  const [rates, setRates] = useState<ShipmentRate[]>([]);
  const [selectedRate, setSelectedRate] = useState<string | null>(null);
  const [shipmentId, setShipmentId] = useState<string | null>(null);

  // Estados del modal de despacho
  const [dispatching, setDispatching] = useState(false);

  // Notificaciones
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'info' });

  // Cargar datos
  const fetchReadyItems = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/api/admin/last-mile/ready`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { service_type: filterService }
      });
      setItems(res.data.items || []);
    } catch (error) {
      console.error('Error fetching ready items:', error);
      setSnackbar({ open: true, message: 'Error al cargar paquetes', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [token, filterService]);

  const fetchDispatched = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/last-mile/dispatched`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDispatched(res.data.items || []);
    } catch (error) {
      console.error('Error fetching dispatched:', error);
    }
  }, [token]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/last-mile/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(res.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, [token]);

  useEffect(() => {
    fetchReadyItems();
    fetchDispatched();
    fetchStats();
  }, [fetchReadyItems, fetchDispatched, fetchStats]);

  // Abrir modal de cotización
  const handleOpenQuote = async (item: ShipmentItem) => {
    if (!item.address_id) {
      setSnackbar({ 
        open: true, 
        message: 'Este paquete no tiene dirección asignada', 
        severity: 'error' 
      });
      return;
    }

    setSelectedItem(item);
    setQuoteDialog(true);
    setQuoting(true);
    setRates([]);
    setSelectedRate(null);

    try {
      const res = await axios.post(`${API_URL}/api/admin/last-mile/quote`, {
        reference_type: item.reference_type,
        reference_id: item.id,
        weight: item.weight || 1,
        length: item.length_cm || 30,
        width: item.width_cm || 30,
        height: item.height_cm || 30
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setRates(res.data.rates || []);
      setShipmentId(res.data.shipmentId);

      if (res.data.isSandbox) {
        setSnackbar({ 
          open: true, 
          message: '⚠️ Modo Sandbox - Tarifas de prueba', 
          severity: 'info' 
        });
      }

    } catch (error: any) {
      console.error('Error quoting:', error);
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.message || 'Error al cotizar', 
        severity: 'error' 
      });
    } finally {
      setQuoting(false);
    }
  };

  // Generar guía
  const handleDispatch = async () => {
    if (!selectedItem || !selectedRate) return;

    const rate = rates.find(r => r.id === selectedRate);
    if (!rate) return;

    setDispatching(true);

    try {
      const res = await axios.post(`${API_URL}/api/admin/last-mile/dispatch`, {
        reference_type: selectedItem.reference_type,
        reference_id: selectedItem.id,
        rate_id: selectedRate,
        carrier: rate.provider,
        shipment_id: shipmentId
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSnackbar({ 
        open: true, 
        message: `✅ Guía generada: ${res.data.trackingNumber}`, 
        severity: 'success' 
      });

      // Abrir PDF de etiqueta
      if (res.data.labelUrl) {
        window.open(res.data.labelUrl, '_blank');
      }

      setQuoteDialog(false);
      fetchReadyItems();
      fetchDispatched();
      fetchStats();

    } catch (error: any) {
      console.error('Error dispatching:', error);
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.message || 'Error al generar guía', 
        severity: 'error' 
      });
    } finally {
      setDispatching(false);
    }
  };

  // Reimprimir etiqueta
  const handleReprint = async (shipment: DispatchedShipment) => {
    if (shipment.label_url) {
      window.open(shipment.label_url, '_blank');
    }
  };

  // Copiar tracking
  const handleCopyTracking = (tracking: string) => {
    navigator.clipboard.writeText(tracking);
    setSnackbar({ open: true, message: 'Guía copiada al portapapeles', severity: 'info' });
  };

  // Filtrar items
  const filteredItems = items.filter(item => {
    const matchSearch = !searchTerm || 
      item.tracking_internal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.destination_city?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchSearch;
  });

  // Icono según tipo de servicio
  const getServiceIcon = (type: string) => {
    switch (type) {
      case 'air': return <FlightIcon sx={{ color: '#2196F3' }} />;
      case 'maritime': return <ShipIcon sx={{ color: '#00BCD4' }} />;
      case 'china_air': return <AirIcon sx={{ color: '#FF5722' }} />;
      default: return <BoxIcon />;
    }
  };

  const getServiceLabel = (type: string) => {
    switch (type) {
      case 'air': return 'USA Aéreo';
      case 'maritime': return 'Marítimo';
      case 'china_air': return 'TDI Aéreo';
      default: return type;
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <TruckIcon sx={{ fontSize: 40, color: LAST_MILE_COLOR }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">Última Milla</Typography>
            <Typography variant="body2" color="text.secondary">
              Generación de guías nacionales con Skydropx
            </Typography>
          </Box>
        </Box>
        <Button 
          variant="outlined" 
          startIcon={<RefreshIcon />}
          onClick={() => {
            fetchReadyItems();
            fetchDispatched();
            fetchStats();
          }}
        >
          Actualizar
        </Button>
      </Box>

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ bgcolor: '#FFF3E0' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ScheduleIcon sx={{ color: '#FF9800' }} />
                  <Typography variant="h4" fontWeight="bold">{stats.pending?.total || 0}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">Pendientes</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ bgcolor: '#E8F5E9' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckIcon sx={{ color: '#4CAF50' }} />
                  <Typography variant="h4" fontWeight="bold">{stats.today?.total || 0}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">Despachados Hoy</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ bgcolor: '#E3F2FD' }}>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">Por Servicio</Typography>
                <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                  <Chip 
                    size="small" 
                    icon={<FlightIcon />} 
                    label={stats.pending?.packages || 0} 
                    sx={{ bgcolor: '#BBDEFB' }}
                  />
                  <Chip 
                    size="small" 
                    icon={<ShipIcon />} 
                    label={stats.pending?.maritime || 0} 
                    sx={{ bgcolor: '#B2EBF2' }}
                  />
                  <Chip 
                    size="small" 
                    icon={<AirIcon />} 
                    label={stats.pending?.china_air || 0} 
                    sx={{ bgcolor: '#FFCCBC' }}
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ bgcolor: '#FCE4EC' }}>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">Carriers Hoy</Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                  {stats.today?.estafeta > 0 && (
                    <Chip size="small" label={`Estafeta: ${stats.today.estafeta}`} />
                  )}
                  {stats.today?.paquetexpress > 0 && (
                    <Chip size="small" label={`PaqExpress: ${stats.today.paquetexpress}`} />
                  )}
                  {stats.today?.fedex > 0 && (
                    <Chip size="small" label={`FedEx: ${stats.today.fedex}`} />
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs 
          value={tabValue} 
          onChange={(_, v) => setTabValue(v)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ScheduleIcon />
                <span>Listos para Despacho</span>
                <Chip size="small" label={items.length} color="warning" />
              </Box>
            } 
          />
          <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckIcon />
                <span>Despachados</span>
                <Chip size="small" label={dispatched.length} color="success" />
              </Box>
            } 
          />
        </Tabs>
      </Paper>

      {/* Tab 0: Listos para Despacho */}
      <TabPanel value={tabValue} index={0}>
        {/* Filtros */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Buscar por tracking, cliente o ciudad..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              )
            }}
            sx={{ minWidth: 300 }}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button 
              variant={filterService === null ? 'contained' : 'outlined'}
              size="small"
              onClick={() => setFilterService(null)}
            >
              Todos
            </Button>
            <Button 
              variant={filterService === 'air' ? 'contained' : 'outlined'}
              size="small"
              startIcon={<FlightIcon />}
              onClick={() => setFilterService('air')}
            >
              USA
            </Button>
            <Button 
              variant={filterService === 'maritime' ? 'contained' : 'outlined'}
              size="small"
              startIcon={<ShipIcon />}
              onClick={() => setFilterService('maritime')}
            >
              Marítimo
            </Button>
            <Button 
              variant={filterService === 'china_air' ? 'contained' : 'outlined'}
              size="small"
              startIcon={<AirIcon />}
              onClick={() => setFilterService('china_air')}
            >
              TDI Aéreo
            </Button>
          </Box>
        </Box>

        {loading && <LinearProgress sx={{ mb: 2 }} />}

        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell>Servicio</TableCell>
                <TableCell>Tracking</TableCell>
                <TableCell>Cliente</TableCell>
                <TableCell>Destino</TableCell>
                <TableCell>Peso</TableCell>
                <TableCell align="center">Acción</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      {loading ? 'Cargando...' : 'No hay paquetes listos para despacho'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => (
                  <TableRow key={`${item.reference_type}-${item.id}`} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getServiceIcon(item.service_type)}
                        <Typography variant="body2">{getServiceLabel(item.service_type)}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold" fontFamily="monospace">
                        {item.tracking_internal}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {item.description?.substring(0, 30)}...
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{item.client_name || 'Sin asignar'}</Typography>
                      <Typography variant="caption" color="text.secondary">{item.client_email}</Typography>
                    </TableCell>
                    <TableCell>
                      {item.address_id ? (
                        <>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <PlaceIcon sx={{ fontSize: 14, color: LAST_MILE_COLOR }} />
                            <Typography variant="body2">{item.destination_city}, {item.destination_state}</Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            CP: {item.destination_zip}
                          </Typography>
                        </>
                      ) : (
                        <Chip size="small" label="Sin dirección" color="error" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{item.weight || 1} kg</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<TruckIcon />}
                        onClick={() => handleOpenQuote(item)}
                        disabled={!item.address_id}
                        sx={{ 
                          bgcolor: LAST_MILE_COLOR,
                          '&:hover': { bgcolor: '#C2185B' }
                        }}
                      >
                        Generar Guía
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </TabPanel>

      {/* Tab 1: Despachados */}
      <TabPanel value={tabValue} index={1}>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell>Fecha</TableCell>
                <TableCell>Carrier</TableCell>
                <TableCell>Guía</TableCell>
                <TableCell>Cliente</TableCell>
                <TableCell>Destino</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dispatched.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">No hay envíos despachados aún</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                dispatched.map((shipment) => (
                  <TableRow key={shipment.id} hover>
                    <TableCell>
                      <Typography variant="body2">
                        {new Date(shipment.created_at).toLocaleDateString('es-MX')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(shipment.created_at).toLocaleTimeString('es-MX', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={shipment.carrier_name || shipment.carrier} 
                        size="small"
                        sx={{ textTransform: 'capitalize' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" fontFamily="monospace" fontWeight="bold">
                          {shipment.tracking_number}
                        </Typography>
                        <IconButton size="small" onClick={() => handleCopyTracking(shipment.tracking_number)}>
                          <CopyIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{shipment.client_name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {shipment.destination_city}, {shipment.destination_state}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                        <Tooltip title="Reimprimir etiqueta">
                          <IconButton size="small" onClick={() => handleReprint(shipment)}>
                            <PrintIcon />
                          </IconButton>
                        </Tooltip>
                        {shipment.tracking_url && (
                          <Tooltip title="Rastrear envío">
                            <IconButton 
                              size="small" 
                              onClick={() => window.open(shipment.tracking_url, '_blank')}
                              sx={{ color: LAST_MILE_COLOR }}
                            >
                              <OpenInNewIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </TabPanel>

      {/* Modal de Cotización y Despacho */}
      <Dialog 
        open={quoteDialog} 
        onClose={() => !dispatching && setQuoteDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: LAST_MILE_COLOR, color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TruckIcon />
            Generar Guía Nacional
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {selectedItem && (
            <>
              {/* Info del paquete */}
              <Card sx={{ mb: 2, bgcolor: '#f5f5f5' }}>
                <CardContent sx={{ py: 1.5 }}>
                  <Typography variant="subtitle2" color="text.secondary">Paquete</Typography>
                  <Typography variant="h6" fontFamily="monospace">
                    {selectedItem.tracking_internal}
                  </Typography>
                  <Typography variant="body2">{selectedItem.description}</Typography>
                </CardContent>
              </Card>

              {/* Destino */}
              <Card sx={{ mb: 2 }}>
                <CardContent sx={{ py: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <PlaceIcon sx={{ color: LAST_MILE_COLOR }} />
                    <Typography variant="subtitle2">Destino</Typography>
                  </Box>
                  <Typography variant="body1" fontWeight="bold">{selectedItem.destination_name}</Typography>
                  <Typography variant="body2">{selectedItem.destination_address}</Typography>
                  <Typography variant="body2">
                    {selectedItem.destination_city}, {selectedItem.destination_state} - CP {selectedItem.destination_zip}
                  </Typography>
                </CardContent>
              </Card>

              <Divider sx={{ my: 2 }} />

              {/* Tarifas */}
              {quoting ? (
                <Box sx={{ textAlign: 'center', py: 3 }}>
                  <CircularProgress sx={{ color: LAST_MILE_COLOR }} />
                  <Typography variant="body2" sx={{ mt: 1 }}>Obteniendo tarifas...</Typography>
                </Box>
              ) : rates.length > 0 ? (
                <FormControl component="fieldset" fullWidth>
                  <FormLabel component="legend">Selecciona Paquetería</FormLabel>
                  <RadioGroup
                    value={selectedRate || ''}
                    onChange={(e) => setSelectedRate(e.target.value)}
                  >
                    <List>
                      {rates.map((rate) => (
                        <ListItem 
                          key={rate.id}
                          sx={{ 
                            border: 1, 
                            borderColor: selectedRate === rate.id ? LAST_MILE_COLOR : 'divider',
                            borderRadius: 1,
                            mb: 1,
                            bgcolor: selectedRate === rate.id ? '#FCE4EC' : 'transparent'
                          }}
                        >
                          <FormControlLabel
                            value={rate.id}
                            control={<Radio sx={{ color: LAST_MILE_COLOR }} />}
                            label=""
                            sx={{ mr: 0 }}
                          />
                          <ListItemIcon>
                            <TruckIcon sx={{ color: LAST_MILE_COLOR }} />
                          </ListItemIcon>
                          <ListItemText 
                            primary={
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography fontWeight="bold" sx={{ textTransform: 'capitalize' }}>
                                  {rate.carrierName || rate.provider}
                                </Typography>
                                <Typography variant="h6" color={LAST_MILE_COLOR}>
                                  ${rate.totalPrice.toFixed(2)} MXN
                                </Typography>
                              </Box>
                            }
                            secondary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <ScheduleIcon fontSize="small" />
                                  <Typography variant="caption">
                                    {rate.deliveryDays} día{rate.deliveryDays !== 1 ? 's' : ''}
                                  </Typography>
                                </Box>
                                <Typography variant="caption" sx={{ textTransform: 'capitalize' }}>
                                  {rate.serviceName}
                                </Typography>
                              </Box>
                            }
                          />
                        </ListItem>
                      ))}
                    </List>
                  </RadioGroup>
                </FormControl>
              ) : (
                <Alert severity="warning">
                  No hay tarifas disponibles para este destino
                </Alert>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setQuoteDialog(false)} disabled={dispatching}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            startIcon={dispatching ? <CircularProgress size={20} /> : <PrintIcon />}
            onClick={handleDispatch}
            disabled={!selectedRate || dispatching}
            sx={{ 
              bgcolor: LAST_MILE_COLOR,
              '&:hover': { bgcolor: '#C2185B' }
            }}
          >
            {dispatching ? 'Generando...' : 'Generar e Imprimir'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          severity={snackbar.severity} 
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
