// ============================================
// PANEL DE OPERACIONES DHL 📦
// Recepción, auditoría y despacho de paquetes
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
  TextField,
  InputAdornment,
  Tabs,
  Tab,
  Card,
  CardContent,
  Grid,
  Chip,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  LinearProgress,
  Badge,
  CircularProgress,
} from '@mui/material';
import {
  QrCodeScanner as ScanIcon,
  LocalShipping as DhlIcon,
  Inventory as PackageIcon,
  CheckCircle as CheckIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Receipt as QuoteIcon,
  Send as SendIcon,
  AttachMoney as MoneyIcon,
  Info as InfoIcon,
  Pending as PendingIcon,
  AccessTime as TimeIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import DhlReceptionWizard from './DhlReceptionWizard';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Colors
const DHL_COLOR = '#D40511';
const DHL_YELLOW = '#FFCC00';

interface DhlShipment {
  id: number;
  inbound_tracking: string;
  user_id: number;
  client_name: string;
  client_email: string;
  client_box_id: string;
  product_type: 'standard' | 'high_value';
  description: string;
  weight_kg: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  import_cost_usd: number;
  import_cost_mxn: number;
  national_cost_mxn: number;
  total_cost_mxn: number;
  status: string;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  skydropx_label_id: string;
  outbound_tracking: string;
  received_at: string;
  quoted_at: string;
  paid_at: string;
  dispatched_at: string;
  created_at: string;
}

interface DhlStats {
  today_received: number;
  pending_quote: number;
  pending_payment: number;
  ready_dispatch: number;
  dispatched_today: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  received_mty: { label: 'Recibido MTY', color: '#2196f3', icon: <PackageIcon /> },
  quoted: { label: 'Cotizado', color: '#ff9800', icon: <QuoteIcon /> },
  paid: { label: 'Pagado', color: '#4caf50', icon: <MoneyIcon /> },
  dispatched: { label: 'Despachado', color: '#9c27b0', icon: <SendIcon /> },
};

export default function DhlOperationsPage() {
  const [tabValue, setTabValue] = useState(0);
  const [shipments, setShipments] = useState<DhlShipment[]>([]);
  const [stats, setStats] = useState<DhlStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ status: '', search: '' });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  
  // Dialogs
  const [receiveDialog, setReceiveDialog] = useState(false);
  const [quoteDialog, setQuoteDialog] = useState(false);
  const [dispatchDialog, setDispatchDialog] = useState(false);
  const [detailDialog, setDetailDialog] = useState(false);
  
  // Modal clave de gerente
  const [supervisorDialog, setSupervisorDialog] = useState(false);
  const [supervisorPin, setSupervisorPin] = useState('');
  const [supervisorError, setSupervisorError] = useState('');
  const [validatingSupervisor, setValidatingSupervisor] = useState(false);
  
  const [selectedShipment, setSelectedShipment] = useState<DhlShipment | null>(null);
  
  // Form: Recibir paquete - Ahora usa DhlReceptionWizard

  // Quote result
  const [quoteResult, setQuoteResult] = useState<{
    import_cost_usd: number;
    import_cost_mxn: number;
    national_cost_mxn: number;
    total_cost_mxn: number;
    exchange_rate: number;
  } | null>(null);

  // Dispatch form
  const [dispatchForm, setDispatchForm] = useState({
    carrier: 'estafeta',
  });

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/admin/dhl/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);

  const fetchShipments = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params: Record<string, string> = {};
      if (filters.status) params.status = filters.status;
      if (filters.search) params.search = filters.search;
      
      const response = await axios.get(`${API_URL}/api/admin/dhl/shipments`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      setShipments(response.data);
    } catch (error) {
      console.error('Error fetching shipments:', error);
      setSnackbar({ open: true, message: 'Error al cargar envíos', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchStats();
    fetchShipments();
  }, [fetchStats, fetchShipments]);

  // ===== VALIDACIÓN SUPERVISOR =====
  const handleOpenReception = () => {
    // Pedir clave de supervisor antes de abrir el wizard
    setSupervisorDialog(true);
    setSupervisorPin('');
    setSupervisorError('');
  };

  const validateSupervisor = async () => {
    if (!supervisorPin.trim()) {
      setSupervisorError('Ingresa la clave del supervisor');
      return;
    }
    
    setValidatingSupervisor(true);
    setSupervisorError('');
    
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_URL}/api/warehouse/validate-supervisor`,
        { pin: supervisorPin },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (res.data.valid) {
        // Cerrar modal de supervisor y abrir wizard
        setSupervisorDialog(false);
        setReceiveDialog(true);
      } else {
        setSupervisorError('Clave de supervisor incorrecta');
      }
    } catch (err) {
      console.error('Error validando supervisor:', err);
      setSupervisorError('Clave de supervisor incorrecta');
    } finally {
      setValidatingSupervisor(false);
    }
  };

  // ===== HANDLERS =====
  // Nota: handleReceivePackage fue reemplazado por DhlReceptionWizard

  const handleOpenQuote = (shipment: DhlShipment) => {
    setSelectedShipment(shipment);
    setQuoteResult(null);
    setQuoteDialog(true);
  };

  const handleGenerateQuote = async () => {
    if (!selectedShipment) return;
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/admin/dhl/shipments/${selectedShipment.id}/quote`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setQuoteResult(response.data);
      setSnackbar({ open: true, message: 'Cotización generada', severity: 'success' });
      fetchShipments();
      fetchStats();
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.error || 'Error al generar cotización', 
        severity: 'error' 
      });
    }
  };

  const handleOpenDispatch = (shipment: DhlShipment) => {
    setSelectedShipment(shipment);
    setDispatchDialog(true);
  };

  const handleDispatch = async () => {
    if (!selectedShipment) return;
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/admin/dhl/shipments/${selectedShipment.id}/dispatch`,
        dispatchForm,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSnackbar({ 
        open: true, 
        message: `Paquete despachado. Guía: ${response.data.outbound_tracking}`, 
        severity: 'success' 
      });
      setDispatchDialog(false);
      fetchShipments();
      fetchStats();
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.error || 'Error al despachar', 
        severity: 'error' 
      });
    }
  };

  const handleViewDetail = (shipment: DhlShipment) => {
    setSelectedShipment(shipment);
    setDetailDialog(true);
  };

  // Filter by tab
  const getFilteredShipments = () => {
    switch (tabValue) {
      case 1: return shipments.filter(s => s.status === 'received_mty');
      case 2: return shipments.filter(s => s.status === 'quoted');
      case 3: return shipments.filter(s => s.status === 'paid');
      case 4: return shipments.filter(s => s.status === 'dispatched');
      default: return shipments;
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('es-MX', { 
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <DhlIcon sx={{ fontSize: 40, color: DHL_COLOR, mr: 2 }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">
              Operaciones DHL Monterrey
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Recepción, auditoría y despacho de paquetes
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          startIcon={<ScanIcon />}
          onClick={handleOpenReception}
          sx={{ bgcolor: DHL_COLOR, '&:hover': { bgcolor: '#a00410' } }}
        >
          Recibir Paquete
        </Button>
      </Box>

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 6, md: 2.4 }}>
            <Card sx={{ bgcolor: '#e3f2fd' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <PackageIcon sx={{ color: '#2196f3', fontSize: 30 }} />
                <Typography variant="h4" fontWeight="bold">{stats.today_received}</Typography>
                <Typography variant="caption">Recibidos Hoy</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 2.4 }}>
            <Card sx={{ bgcolor: '#fff3e0' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <PendingIcon sx={{ color: '#ff9800', fontSize: 30 }} />
                <Typography variant="h4" fontWeight="bold">{stats.pending_quote}</Typography>
                <Typography variant="caption">Pendiente Cotizar</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 2.4 }}>
            <Card sx={{ bgcolor: '#fce4ec' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <TimeIcon sx={{ color: '#e91e63', fontSize: 30 }} />
                <Typography variant="h4" fontWeight="bold">{stats.pending_payment}</Typography>
                <Typography variant="caption">Pendiente Pago</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 2.4 }}>
            <Card sx={{ bgcolor: '#e8f5e9' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <CheckIcon sx={{ color: '#4caf50', fontSize: 30 }} />
                <Typography variant="h4" fontWeight="bold">{stats.ready_dispatch}</Typography>
                <Typography variant="caption">Listo Despachar</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 2.4 }}>
            <Card sx={{ bgcolor: '#f3e5f5' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <SendIcon sx={{ color: '#9c27b0', fontSize: 30 }} />
                <Typography variant="h4" fontWeight="bold">{stats.dispatched_today}</Typography>
                <Typography variant="caption">Despachados Hoy</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Main Panel */}
      <Paper>
        <Tabs 
          value={tabValue} 
          onChange={(_, v) => setTabValue(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ 
            borderBottom: 1, 
            borderColor: 'divider',
            '& .Mui-selected': { color: DHL_COLOR }
          }}
        >
          <Tab label="Todos" />
          <Tab 
            label={
              <Badge badgeContent={stats?.pending_quote || 0} color="warning">
                Recibidos
              </Badge>
            } 
          />
          <Tab 
            label={
              <Badge badgeContent={stats?.pending_payment || 0} color="error">
                Cotizados
              </Badge>
            } 
          />
          <Tab 
            label={
              <Badge badgeContent={stats?.ready_dispatch || 0} color="success">
                Pagados
              </Badge>
            } 
          />
          <Tab label="Despachados" />
        </Tabs>

        {/* Filters */}
        <Box sx={{ p: 2, bgcolor: '#f5f5f5', display: 'flex', gap: 2 }}>
          <TextField
            size="small"
            placeholder="Buscar tracking, cliente..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            onKeyPress={(e) => e.key === 'Enter' && fetchShipments()}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>
            }}
            sx={{ width: 300 }}
          />
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchShipments}>
            Actualizar
          </Button>
        </Box>

        {loading && <LinearProgress sx={{ bgcolor: DHL_YELLOW }} />}

        {/* Table */}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#fafafa' }}>
                <TableCell>Tracking DHL</TableCell>
                <TableCell>Cliente</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell align="center">Peso</TableCell>
                <TableCell align="right">Total MXN</TableCell>
                <TableCell align="center">Estado</TableCell>
                <TableCell>Fecha</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {getFilteredShipments().length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">No hay envíos</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                getFilteredShipments().map((shipment) => (
                  <TableRow key={shipment.id} hover>
                    <TableCell>
                      <Typography fontWeight="bold" sx={{ fontFamily: 'monospace' }}>
                        {shipment.inbound_tracking}
                      </Typography>
                      {shipment.outbound_tracking && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          → {shipment.outbound_tracking}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight="medium">{shipment.client_name}</Typography>
                      <Chip label={shipment.client_box_id} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={shipment.product_type === 'standard' ? 'Standard' : 'High Value'}
                        size="small"
                        sx={{ 
                          bgcolor: shipment.product_type === 'standard' ? DHL_COLOR : DHL_YELLOW,
                          color: shipment.product_type === 'standard' ? 'white' : 'black',
                          fontWeight: 'bold'
                        }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      {shipment.weight_kg} kg
                    </TableCell>
                    <TableCell align="right">
                      {shipment.total_cost_mxn > 0 ? (
                        <Typography fontWeight="bold" color={DHL_COLOR}>
                          ${shipment.total_cost_mxn.toLocaleString()}
                        </Typography>
                      ) : '-'}
                    </TableCell>
                    <TableCell align="center">
                      <Chip 
                        label={STATUS_CONFIG[shipment.status]?.label || shipment.status}
                        size="small"
                        sx={{ 
                          bgcolor: STATUS_CONFIG[shipment.status]?.color || '#grey',
                          color: 'white',
                          fontWeight: 'bold'
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">
                        {formatDate(shipment.received_at)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        <Tooltip title="Ver detalle">
                          <IconButton size="small" onClick={() => handleViewDetail(shipment)}>
                            <InfoIcon />
                          </IconButton>
                        </Tooltip>
                        {shipment.status === 'received_mty' && (
                          <Tooltip title="Generar cotización">
                            <IconButton size="small" color="warning" onClick={() => handleOpenQuote(shipment)}>
                              <QuoteIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {shipment.status === 'paid' && (
                          <Tooltip title="Despachar">
                            <IconButton size="small" color="success" onClick={() => handleOpenDispatch(shipment)}>
                              <SendIcon />
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
      </Paper>

      {/* ===== DIALOGS ===== */}

      {/* 🔐 Modal: Clave de Gerente/Supervisor */}
      <Dialog 
        open={supervisorDialog} 
        onClose={() => setSupervisorDialog(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: DHL_YELLOW, color: DHL_COLOR }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LockIcon />
            Autorización Requerida
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="warning" sx={{ mb: 3 }}>
            La recepción de paquetes DHL requiere autorización de un gerente o supervisor.
          </Alert>
          
          <TextField
            fullWidth
            label="Clave de Supervisor"
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            value={supervisorPin}
            onChange={(e) => setSupervisorPin(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && validateSupervisor()}
            error={!!supervisorError}
            helperText={supervisorError}
            autoFocus
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockIcon color="action" />
                </InputAdornment>
              ),
              sx: { 
                '-webkit-text-security': 'disc',
                'input': { '-webkit-text-security': 'disc' }
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setSupervisorDialog(false)}>
            Cancelar
          </Button>
          <Button 
            variant="contained" 
            onClick={validateSupervisor}
            disabled={validatingSupervisor || !supervisorPin.trim()}
            sx={{ bgcolor: DHL_COLOR, '&:hover': { bgcolor: '#a00410' } }}
          >
            {validatingSupervisor ? <CircularProgress size={20} /> : 'Autorizar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 🆕 Wizard: Recibir Paquete (IoT + IA) */}
      <DhlReceptionWizard
        open={receiveDialog}
        onClose={() => setReceiveDialog(false)}
        onSuccess={() => {
          fetchStats();
          fetchShipments();
          setSnackbar({ open: true, message: 'Paquete registrado correctamente', severity: 'success' });
        }}
      />

      {/* Dialog: Cotizar */}
      <Dialog open={quoteDialog} onClose={() => setQuoteDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#ff9800', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <QuoteIcon />
            Generar Cotización
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3, mt: 2 }}>
          {selectedShipment && (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                <strong>Tracking:</strong> {selectedShipment.inbound_tracking}<br />
                <strong>Cliente:</strong> {selectedShipment.client_name} ({selectedShipment.client_box_id})<br />
                <strong>Tipo:</strong> {selectedShipment.product_type === 'standard' ? 'Standard' : 'High Value'}
              </Alert>

              {!quoteResult && (
                <Box sx={{ textAlign: 'center', py: 3 }}>
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={<MoneyIcon />}
                    onClick={handleGenerateQuote}
                    sx={{ bgcolor: '#ff9800', '&:hover': { bgcolor: '#f57c00' } }}
                  >
                    Calcular Cotización
                  </Button>
                </Box>
              )}

              {quoteResult && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="h6" gutterBottom>Desglose de Costos:</Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableBody>
                        <TableRow>
                          <TableCell>Importación DHL</TableCell>
                          <TableCell align="right">${quoteResult.import_cost_usd} USD</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Tipo de cambio</TableCell>
                          <TableCell align="right">${quoteResult.exchange_rate} MXN/USD</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Importación en MXN</TableCell>
                          <TableCell align="right">${quoteResult.import_cost_mxn.toLocaleString()} MXN</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Envío Nacional</TableCell>
                          <TableCell align="right">${quoteResult.national_cost_mxn.toLocaleString()} MXN</TableCell>
                        </TableRow>
                        <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                          <TableCell><strong>TOTAL</strong></TableCell>
                          <TableCell align="right">
                            <Typography variant="h5" color={DHL_COLOR} fontWeight="bold">
                              ${quoteResult.total_cost_mxn.toLocaleString()} MXN
                            </Typography>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Alert severity="success" sx={{ mt: 2 }}>
                    Cotización guardada. El cliente puede ver el costo en su app.
                  </Alert>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQuoteDialog(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Despachar */}
      <Dialog open={dispatchDialog} onClose={() => setDispatchDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#4caf50', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SendIcon />
            Despachar Paquete
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3, mt: 2 }}>
          {selectedShipment && (
            <Box>
              <Alert severity="success" sx={{ mb: 2 }}>
                <strong>Tracking:</strong> {selectedShipment.inbound_tracking}<br />
                <strong>Cliente:</strong> {selectedShipment.client_name}<br />
                <strong>Destino:</strong> {selectedShipment.delivery_address}, {selectedShipment.delivery_city}, {selectedShipment.delivery_state}
              </Alert>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Paquetería Nacional</InputLabel>
                <Select
                  value={dispatchForm.carrier}
                  label="Paquetería Nacional"
                  onChange={(e) => setDispatchForm({ ...dispatchForm, carrier: e.target.value })}
                >
                  <MenuItem value="estafeta">Estafeta</MenuItem>
                  <MenuItem value="fedex">FedEx</MenuItem>
                  <MenuItem value="dhl_express">DHL Express</MenuItem>
                  <MenuItem value="redpack">Redpack</MenuItem>
                </Select>
              </FormControl>

              <Alert severity="info">
                Se generará automáticamente la guía de envío vía Skydropx
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDispatchDialog(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            startIcon={<SendIcon />}
            onClick={handleDispatch}
            sx={{ bgcolor: '#4caf50', '&:hover': { bgcolor: '#388e3c' } }}
          >
            Despachar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Detalle */}
      <Dialog open={detailDialog} onClose={() => setDetailDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: DHL_COLOR, color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InfoIcon />
            Detalle del Envío
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3, mt: 2 }}>
          {selectedShipment && (
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary">Tracking DHL</Typography>
                <Typography variant="h6" fontWeight="bold">{selectedShipment.inbound_tracking}</Typography>
                
                {selectedShipment.outbound_tracking && (
                  <>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>Tracking Nacional</Typography>
                    <Typography variant="h6">{selectedShipment.outbound_tracking}</Typography>
                  </>
                )}
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary">Estado</Typography>
                <Chip 
                  label={STATUS_CONFIG[selectedShipment.status]?.label || selectedShipment.status}
                  sx={{ 
                    bgcolor: STATUS_CONFIG[selectedShipment.status]?.color,
                    color: 'white',
                    fontWeight: 'bold',
                    mt: 0.5
                  }}
                />
              </Grid>
              
              <Grid size={{ xs: 12 }}>
                <Divider />
              </Grid>
              
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary">Cliente</Typography>
                <Typography fontWeight="medium">{selectedShipment.client_name}</Typography>
                <Typography variant="body2">{selectedShipment.client_email}</Typography>
                <Chip label={selectedShipment.client_box_id} size="small" sx={{ mt: 0.5 }} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary">Tipo de Producto</Typography>
                <Chip 
                  label={selectedShipment.product_type === 'standard' ? 'Standard' : 'High Value'}
                  sx={{ 
                    bgcolor: selectedShipment.product_type === 'standard' ? DHL_COLOR : DHL_YELLOW,
                    color: selectedShipment.product_type === 'standard' ? 'white' : 'black',
                    fontWeight: 'bold'
                  }}
                />
              </Grid>

              <Grid size={{ xs: 12 }}>
                <Divider />
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary">Dimensiones</Typography>
                <Typography>Peso: {selectedShipment.weight_kg} kg</Typography>
                <Typography>
                  {selectedShipment.length_cm} x {selectedShipment.width_cm} x {selectedShipment.height_cm} cm
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary">Destino</Typography>
                <Typography>{selectedShipment.delivery_address}</Typography>
                <Typography>{selectedShipment.delivery_city}, {selectedShipment.delivery_state} {selectedShipment.delivery_zip}</Typography>
              </Grid>

              {selectedShipment.total_cost_mxn > 0 && (
                <>
                  <Grid size={{ xs: 12 }}>
                    <Divider />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="subtitle2" color="text.secondary">Costos</Typography>
                    <Box sx={{ display: 'flex', gap: 3, mt: 1 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Importación</Typography>
                        <Typography>${selectedShipment.import_cost_usd} USD / ${selectedShipment.import_cost_mxn} MXN</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Nacional</Typography>
                        <Typography>${selectedShipment.national_cost_mxn} MXN</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Total</Typography>
                        <Typography variant="h6" color={DHL_COLOR} fontWeight="bold">
                          ${selectedShipment.total_cost_mxn.toLocaleString()} MXN
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                </>
              )}

              <Grid size={{ xs: 12 }}>
                <Divider />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Typography variant="subtitle2" color="text.secondary">Timeline</Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 1 }}>
                  <Chip label={`Recibido: ${formatDate(selectedShipment.received_at)}`} size="small" />
                  {selectedShipment.quoted_at && <Chip label={`Cotizado: ${formatDate(selectedShipment.quoted_at)}`} size="small" />}
                  {selectedShipment.paid_at && <Chip label={`Pagado: ${formatDate(selectedShipment.paid_at)}`} size="small" color="success" />}
                  {selectedShipment.dispatched_at && <Chip label={`Despachado: ${formatDate(selectedShipment.dispatched_at)}`} size="small" color="secondary" />}
                </Box>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialog(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
