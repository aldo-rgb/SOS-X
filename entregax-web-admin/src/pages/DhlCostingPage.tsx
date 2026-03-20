// ============================================
// PANEL DE COSTEO DHL 📊
// Gestión de costos internos y lista de cajas
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
  Checkbox,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  LinearProgress,
} from '@mui/material';
import {
  Edit as EditIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  AttachMoney as MoneyIcon,
  Inventory as InventoryIcon,
  Calculate as CalculateIcon,
  Save as SaveIcon,
  FilterList as FilterIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  PaidOutlined as PaidIcon,
  CalendarMonth as CalendarIcon,
  Receipt as ReceiptIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Color DHL
const DHL_COLOR = '#D40511';
const DHL_YELLOW = '#FFCC00';

interface DhlCostRate {
  id: number;
  rate_type: string;
  rate_name: string;
  cost_usd: number;
  costo_agencia: number;
  costo_liberacion: number;
  costo_otros: number;
  description: string;
  is_active: boolean;
  updated_at: string;
}

interface DhlShipmentCosting {
  id: number;
  inbound_tracking: string;
  product_type: string;
  description: string;
  weight_kg: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  volumetric_weight: number;
  status: string;
  created_at: string;
  inspected_at: string;
  assigned_cost_usd: number | null;
  cost_rate_type: string | null;
  cost_assigned_at: string | null;
  cost_payment_status: string | null;
  cost_paid_at: string | null;
  cost_payment_batch_id: number | null;
  payment_batch_number: string | null;
  client_name: string;
  client_box_id: string;
  client_email: string;
  cost_assigned_by_name: string | null;
  cost_paid_by_name: string | null;
  rate_cost_usd: number | null;
  rate_costo_agencia: number | null;
  rate_costo_liberacion: number | null;
  rate_costo_otros: number | null;
}

interface CostingStats {
  total_shipments: number;
  with_cost: number;
  without_cost: number;
  total_cost_usd: number;
  standard_count: number;
  high_value_count: number;
  paid_count: number;
  unpaid_count: number;
  total_paid: number;
  total_unpaid: number;
  total_agencia: number;
  total_liberacion: number;
  total_otros: number;
  total_agencia_standard: number;
  total_liberacion_standard: number;
  total_agencia_hv: number;
  total_liberacion_hv: number;
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
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export default function DhlCostingPage() {
  const [tabValue, setTabValue] = useState(0);
  const [costRates, setCostRates] = useState<DhlCostRate[]>([]);
  const [shipments, setShipments] = useState<DhlShipmentCosting[]>([]);
  const [stats, setStats] = useState<CostingStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterHasCost] = useState<string>('all');
  const [filterPayment, setFilterPayment] = useState<string>('pending');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Utilidades state
  const [profitData, setProfitData] = useState<any[]>([]);
  const [profitSummary, setProfitSummary] = useState<any>(null);
  const [profitDateFrom, setProfitDateFrom] = useState('');
  const [profitDateTo, setProfitDateTo] = useState('');
  const [profitSearch, setProfitSearch] = useState('');
  const [profitLoading, setProfitLoading] = useState(false);
  
  // Dialogs
  const [editCostRateDialog, setEditCostRateDialog] = useState(false);
  const [selectedCostRate, setSelectedCostRate] = useState<DhlCostRate | null>(null);
  
  // Form values
  const [editCostForm, setEditCostForm] = useState({ costo_agencia: 0, costo_liberacion: 0, costo_otros: 0, description: '' });

  // Fetch cost rates
  const fetchCostRates = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/admin/dhl/cost-rates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCostRates(response.data);
    } catch (error) {
      console.error('Error fetching cost rates:', error);
      setSnackbar({ open: true, message: 'Error al cargar tarifas de costo', severity: 'error' });
    }
  }, []);

  // Fetch shipments for costing
  const fetchShipments = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/admin/dhl/costing`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { 
          search: searchTerm || undefined,
          has_cost: filterHasCost !== 'all' ? filterHasCost : undefined,
          payment_status: filterPayment !== 'all' ? filterPayment : undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        }
      });
      setShipments(response.data.data);
      setStats(response.data.stats);
    } catch (error) {
      console.error('Error fetching costing:', error);
      setSnackbar({ open: true, message: 'Error al cargar costeo', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [searchTerm, filterHasCost, filterPayment, dateFrom, dateTo]);

  useEffect(() => {
    fetchCostRates();
  }, [fetchCostRates]);

  useEffect(() => {
    if (tabValue === 1) {
      fetchShipments();
    }
  }, [tabValue, fetchShipments]);

  // Fetch profitability
  const fetchProfitability = useCallback(async () => {
    setProfitLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/admin/dhl/costing/profitability`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          date_from: profitDateFrom || undefined,
          date_to: profitDateTo || undefined,
          search: profitSearch || undefined,
        }
      });
      setProfitData(response.data.data);
      setProfitSummary(response.data.summary);
    } catch (error) {
      console.error('Error fetching profitability:', error);
      setSnackbar({ open: true, message: 'Error al cargar utilidades', severity: 'error' });
    } finally {
      setProfitLoading(false);
    }
  }, [profitDateFrom, profitDateTo, profitSearch]);

  useEffect(() => {
    if (tabValue === 2) {
      fetchProfitability();
    }
  }, [tabValue, fetchProfitability]);

  // Handlers
  const handleEditCostRate = (rate: DhlCostRate) => {
    setSelectedCostRate(rate);
    setEditCostForm({
      costo_agencia: parseFloat(String(rate.costo_agencia)) || 0,
      costo_liberacion: parseFloat(String(rate.costo_liberacion)) || 0,
      costo_otros: parseFloat(String(rate.costo_otros)) || 0,
      description: rate.description
    });
    setEditCostRateDialog(true);
  };

  const handleSaveCostRate = async () => {
    if (!selectedCostRate) return;
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/api/admin/dhl/cost-rates/${selectedCostRate.id}`, editCostForm, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSnackbar({ open: true, message: 'Tarifa de costo actualizada', severity: 'success' });
      setEditCostRateDialog(false);
      fetchCostRates();
    } catch {
      setSnackbar({ open: true, message: 'Error al actualizar tarifa', severity: 'error' });
    }
  };

  const handleSelectShipment = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter(i => i !== id));
    }
  };



  const handleMarkPaid = async () => {
    if (selectedIds.length === 0) {
      setSnackbar({ open: true, message: 'Selecciona al menos un envío', severity: 'error' });
      return;
    }
    const unpaidSelected = shipments.filter(s => selectedIds.includes(s.id) && s.cost_payment_status !== 'paid');
    if (unpaidSelected.length === 0) {
      setSnackbar({ open: true, message: 'Todos los seleccionados ya están pagados', severity: 'error' });
      return;
    }
    // Calcular resumen para confirmación
    const totalAmount = unpaidSelected.reduce((sum, s) => sum + parseFloat(String(s.assigned_cost_usd || 0)), 0);
    const totalAgencia = unpaidSelected.reduce((sum, s) => sum + parseFloat(String(s.rate_costo_agencia || 0)), 0);
    const totalLib = unpaidSelected.reduce((sum, s) => sum + parseFloat(String(s.rate_costo_liberacion || 0)), 0);
    
    if (!window.confirm(
      `¿Marcar ${unpaidSelected.length} envío(s) como PAGADO?\n\n` +
      `Total: $${totalAmount.toFixed(2)} MXN\n` +
      `  Agencia: $${totalAgencia.toFixed(2)}\n` +
      `  Liberación: $${totalLib.toFixed(2)}\n\n` +
      `Se creará un lote de pago.`
    )) return;

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/api/admin/dhl/costing/mark-paid`, {
        shipment_ids: unpaidSelected.map(s => s.id),
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSnackbar({ 
        open: true, 
        message: response.data.message, 
        severity: 'success' 
      });
      setSelectedIds([]);
      fetchShipments();
    } catch {
      setSnackbar({ open: true, message: 'Error al marcar como pagado', severity: 'error' });
    }
  };

  // Get rates for display
  const standardCost = parseFloat(String(costRates.find(r => r.rate_type === 'standard')?.cost_usd || 0));
  const highValueCost = parseFloat(String(costRates.find(r => r.rate_type === 'high_value')?.cost_usd || 0));

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusChip = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      'received_mty': { label: 'Recibido MTY', color: '#2196f3' },
      'ready_dispatch': { label: 'Listo Despacho', color: '#ff9800' },
      'dispatched': { label: 'Despachado', color: '#4caf50' },
      'delivered': { label: 'Entregado', color: '#8bc34a' }
    };
    const config = statusMap[status] || { label: status, color: '#9e9e9e' };
    return <Chip label={config.label} size="small" sx={{ bgcolor: config.color, color: 'white' }} />;
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <CalculateIcon sx={{ fontSize: 40, color: DHL_COLOR, mr: 2 }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">
              Costeo DHL Monterrey
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Gestión de costos internos y asignación de tarifas
            </Typography>
          </Box>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => { fetchCostRates(); fetchShipments(); }}
        >
          Actualizar
        </Button>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: `4px solid ${DHL_COLOR}` }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Costo Standard</Typography>
              <Typography variant="h5" fontWeight="bold">${standardCost.toFixed(2)} MXN</Typography>
              {(() => { const r = costRates.find(r => r.rate_type === 'standard'); return r ? (
                <Box sx={{ mt: 0.5 }}>
                  {parseFloat(String(r.costo_agencia)) > 0 && <Typography variant="caption" color="text.secondary" display="block">Agencia: ${parseFloat(String(r.costo_agencia)).toFixed(2)}</Typography>}
                  {parseFloat(String(r.costo_liberacion)) > 0 && <Typography variant="caption" color="text.secondary" display="block">Liberación: ${parseFloat(String(r.costo_liberacion)).toFixed(2)}</Typography>}
                  {parseFloat(String(r.costo_otros)) > 0 && <Typography variant="caption" color="text.secondary" display="block">Otros: ${parseFloat(String(r.costo_otros)).toFixed(2)}</Typography>}
                </Box>
              ) : <Typography variant="caption" color="text.secondary">Lo que nos cuesta</Typography>; })()}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: `4px solid ${DHL_YELLOW}` }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Costo High Value</Typography>
              <Typography variant="h5" fontWeight="bold">${highValueCost.toFixed(2)} MXN</Typography>
              {(() => { const r = costRates.find(r => r.rate_type === 'high_value'); return r ? (
                <Box sx={{ mt: 0.5 }}>
                  {parseFloat(String(r.costo_agencia)) > 0 && <Typography variant="caption" color="text.secondary" display="block">Agencia: ${parseFloat(String(r.costo_agencia)).toFixed(2)}</Typography>}
                  {parseFloat(String(r.costo_liberacion)) > 0 && <Typography variant="caption" color="text.secondary" display="block">Liberación: ${parseFloat(String(r.costo_liberacion)).toFixed(2)}</Typography>}
                  {parseFloat(String(r.costo_otros)) > 0 && <Typography variant="caption" color="text.secondary" display="block">Otros: ${parseFloat(String(r.costo_otros)).toFixed(2)}</Typography>}
                </Box>
              ) : <Typography variant="caption" color="text.secondary">Lo que nos cuesta</Typography>; })()}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: '4px solid #4caf50' }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Con Costo Asignado</Typography>
              <Typography variant="h5" fontWeight="bold">{stats?.with_cost || 0}</Typography>
              <Typography variant="caption" color="success.main">
                <CheckIcon sx={{ fontSize: 12, mr: 0.5 }} />
                Procesados
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: '4px solid #ff9800' }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Sin Costo</Typography>
              <Typography variant="h5" fontWeight="bold">{stats?.without_cost || 0}</Typography>
              <Typography variant="caption" color="warning.main">
                <WarningIcon sx={{ fontSize: 12, mr: 0.5 }} />
                Pendientes
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs 
          value={tabValue} 
          onChange={(_, v) => setTabValue(v)}
          sx={{ 
            borderBottom: 1, 
            borderColor: 'divider',
            '& .Mui-selected': { color: DHL_COLOR }
          }}
        >
          <Tab icon={<MoneyIcon />} label="Tarifas de Costo" />
          <Tab icon={<InventoryIcon />} label="Lista de Cajas" />
          <Tab icon={<TrendingUpIcon />} label="Utilidades" />
        </Tabs>

        {/* Tab 0: Tarifas de Costo */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ p: 2 }}>
            <Alert severity="info" sx={{ mb: 3 }}>
              <strong>Tarifas de Costo:</strong> Estos son los precios que EntregaX paga a DHL por cada tipo de envío.
              Se utilizan para calcular la rentabilidad de cada paquete.
            </Alert>
            
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Nombre</TableCell>
                    <TableCell align="right">Costo Total MXN</TableCell>
                    <TableCell align="right">Agencia</TableCell>
                    <TableCell align="right">Liberación</TableCell>
                    <TableCell align="right">Otros</TableCell>
                    <TableCell>Descripción</TableCell>
                    <TableCell>Última Actualización</TableCell>
                    <TableCell align="center">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {costRates.map((rate) => (
                    <TableRow key={rate.id} hover>
                      <TableCell>
                        <Chip 
                          label={rate.rate_type === 'standard' ? 'STANDARD' : 'HIGH VALUE'} 
                          size="small"
                          sx={{ 
                            bgcolor: rate.rate_type === 'standard' ? DHL_COLOR : DHL_YELLOW,
                            color: rate.rate_type === 'standard' ? 'white' : 'black',
                            fontWeight: 'bold'
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography fontWeight="medium">{rate.rate_name}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="h6" fontWeight="bold" color="primary">
                          ${parseFloat(String(rate.cost_usd || 0)).toFixed(2)} MXN
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="text.secondary">
                          {parseFloat(String(rate.costo_agencia || 0)) > 0 ? `$${parseFloat(String(rate.costo_agencia)).toFixed(2)}` : '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="text.secondary">
                          {parseFloat(String(rate.costo_liberacion || 0)) > 0 ? `$${parseFloat(String(rate.costo_liberacion)).toFixed(2)}` : '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="text.secondary">
                          {parseFloat(String(rate.costo_otros || 0)) > 0 ? `$${parseFloat(String(rate.costo_otros)).toFixed(2)}` : '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {rate.description || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {formatDate(rate.updated_at)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="Editar costo">
                          <IconButton 
                            color="primary" 
                            onClick={() => handleEditCostRate(rate)}
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {costRates.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          No hay tarifas de costo configuradas. Ejecuta la migración.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </TabPanel>

        {/* Tab 1: Lista de Cajas */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ p: 2 }}>
            {/* Date & Payment Filters */}
            <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: '#fafafa' }}>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <CalendarIcon sx={{ color: 'text.secondary' }} />
                <TextField
                  size="small"
                  type="date"
                  label="Fecha desde"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 170 }}
                />
                <TextField
                  size="small"
                  type="date"
                  label="Fecha hasta"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 170 }}
                />
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel>Estado de Pago</InputLabel>
                  <Select
                    value={filterPayment}
                    label="Estado de Pago"
                    onChange={(e) => setFilterPayment(e.target.value)}
                  >
                    <MenuItem value="all">Todos</MenuItem>
                    <MenuItem value="pending">⏳ Pendientes de Pago</MenuItem>
                    <MenuItem value="paid">✅ Pagados</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  placeholder="Buscar tracking, cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{
                    startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />
                  }}
                  sx={{ width: 250 }}
                />
                <Button
                  variant="contained"
                  startIcon={<FilterIcon />}
                  onClick={fetchShipments}
                  sx={{ bgcolor: DHL_COLOR }}
                >
                  Filtrar
                </Button>
              </Box>
            </Paper>

            {/* Actions Bar */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {selectedIds.length > 0 ? `${selectedIds.length} envío(s) seleccionado(s)` : 'Selecciona envíos para marcar como pagado'}
              </Typography>

              <Box sx={{ flexGrow: 1 }} />

              <Button
                variant="contained"
                startIcon={<PaidIcon />}
                onClick={handleMarkPaid}
                disabled={selectedIds.length === 0}
                size="small"
                color="success"
                sx={{ fontWeight: 'bold' }}
              >
                💰 Marcar como Pagado ({selectedIds.length})
              </Button>
            </Box>

            {loading && <LinearProgress sx={{ mb: 2 }} />}

            {/* Cost Breakdown Summary */}
            {stats && (dateFrom || dateTo) && (
              <Paper variant="outlined" sx={{ p: 2, mb: 2, borderLeft: `4px solid ${DHL_COLOR}` }}>
                <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1.5 }}>
                  <ReceiptIcon sx={{ fontSize: 18, mr: 1, verticalAlign: 'text-bottom' }} />
                  Resumen de Costos {dateFrom && dateTo ? `(${formatDate(dateFrom)} - ${formatDate(dateTo)})` : dateFrom ? `(desde ${formatDate(dateFrom)})` : `(hasta ${formatDate(dateTo)})`}
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6, sm: 2 }}>
                    <Typography variant="caption" color="text.secondary">Total Cajas</Typography>
                    <Typography variant="h6" fontWeight="bold">{stats.total_shipments}</Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 2 }}>
                    <Typography variant="caption" color="text.secondary">Costo Total</Typography>
                    <Typography variant="h6" fontWeight="bold" color="primary">
                      ${parseFloat(String(stats.total_cost_usd || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 2 }}>
                    <Typography variant="caption" color="text.secondary">💼 Total Agencia</Typography>
                    <Typography variant="h6" fontWeight="bold" sx={{ color: '#1565c0' }}>
                      ${parseFloat(String(stats.total_agencia || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Std: ${parseFloat(String(stats.total_agencia_standard || 0)).toFixed(2)} | HV: ${parseFloat(String(stats.total_agencia_hv || 0)).toFixed(2)}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 2 }}>
                    <Typography variant="caption" color="text.secondary">🔓 Total Liberación</Typography>
                    <Typography variant="h6" fontWeight="bold" sx={{ color: '#e65100' }}>
                      ${parseFloat(String(stats.total_liberacion || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Std: ${parseFloat(String(stats.total_liberacion_standard || 0)).toFixed(2)} | HV: ${parseFloat(String(stats.total_liberacion_hv || 0)).toFixed(2)}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 2 }}>
                    <Typography variant="caption" color="text.secondary">📋 Total Otros</Typography>
                    <Typography variant="h6" fontWeight="bold" color="text.secondary">
                      ${parseFloat(String(stats.total_otros || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 2 }}>
                    <Typography variant="caption" color="text.secondary">Estado Pago</Typography>
                    <Box>
                      <Chip label={`Pagado: $${parseFloat(String(stats.total_paid || 0)).toFixed(2)}`} size="small" color="success" sx={{ mb: 0.5 }} />
                      <Chip label={`Pendiente: $${parseFloat(String(stats.total_unpaid || 0)).toFixed(2)}`} size="small" color="warning" />
                    </Box>
                  </Grid>
                </Grid>
              </Paper>
            )}

            {/* Quick Stats (always visible) */}
            {stats && !(dateFrom || dateTo) && (
              <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip label={`Total: ${stats.total_shipments}`} size="small" />
                <Chip label={`Standard: ${stats.standard_count}`} size="small" sx={{ bgcolor: DHL_COLOR, color: 'white' }} />
                <Chip label={`High Value: ${stats.high_value_count}`} size="small" sx={{ bgcolor: DHL_YELLOW, color: 'black' }} />
                <Chip label={`Pagados: ${stats.paid_count || 0}`} size="small" color="success" />
                <Chip label={`Pend. Pago: ${stats.unpaid_count || 0}`} size="small" color="warning" />
                <Chip label={`Costo: $${parseFloat(String(stats.total_cost_usd || 0)).toFixed(2)}`} size="small" color="primary" />
              </Box>
            )}

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        indeterminate={selectedIds.length > 0 && selectedIds.length < shipments.length}
                        checked={selectedIds.length > 0 && selectedIds.length === shipments.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(shipments.map(s => s.id));
                          } else {
                            setSelectedIds([]);
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>Tracking</TableCell>
                    <TableCell>Cliente</TableCell>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Peso (kg)</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell>Fecha</TableCell>
                    <TableCell align="right">Costo Total</TableCell>
                    <TableCell align="right">Agencia</TableCell>
                    <TableCell align="right">Liberación</TableCell>
                    <TableCell align="center">Pago</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shipments.map((shipment) => {
                    const isPaid = shipment.cost_payment_status === 'paid';
                    return (
                    <TableRow 
                      key={shipment.id} 
                      hover
                      sx={{ 
                        bgcolor: isPaid ? '#e8f5e9' : shipment.assigned_cost_usd ? '#fff8e1' : 'inherit',
                      }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedIds.includes(shipment.id)}
                          onChange={(e) => handleSelectShipment(shipment.id, e.target.checked)}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography fontWeight="medium" fontFamily="monospace">
                          {shipment.inbound_tracking}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{shipment.client_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {shipment.client_box_id}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={shipment.product_type === 'high_value' ? 'HIGH VALUE' : 'STANDARD'} 
                          size="small"
                          sx={{ 
                            bgcolor: shipment.product_type === 'high_value' ? DHL_YELLOW : DHL_COLOR,
                            color: shipment.product_type === 'high_value' ? 'black' : 'white',
                            fontSize: '0.7rem'
                          }}
                        />
                      </TableCell>
                      <TableCell>{shipment.weight_kg ? parseFloat(String(shipment.weight_kg)).toFixed(2) : '-'}</TableCell>
                      <TableCell>{getStatusChip(shipment.status)}</TableCell>
                      <TableCell>{formatDate(shipment.created_at)}</TableCell>
                      <TableCell align="right">
                        {shipment.assigned_cost_usd ? (
                          <Typography fontWeight="bold" color={isPaid ? 'success.dark' : 'primary'}>
                            ${parseFloat(String(shipment.assigned_cost_usd)).toFixed(2)}
                          </Typography>
                        ) : (
                          <Typography color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {shipment.rate_costo_agencia ? (
                          <Typography variant="body2" sx={{ color: '#1565c0' }}>
                            ${parseFloat(String(shipment.rate_costo_agencia)).toFixed(2)}
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {shipment.rate_costo_liberacion ? (
                          <Typography variant="body2" sx={{ color: '#e65100' }}>
                            ${parseFloat(String(shipment.rate_costo_liberacion)).toFixed(2)}
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {isPaid ? (
                          <Tooltip title={`Pagado ${formatDate(shipment.cost_paid_at || '')} • Lote: ${shipment.payment_batch_number || ''}`}>
                            <Chip label="Pagado" size="small" color="success" icon={<CheckIcon />} />
                          </Tooltip>
                        ) : shipment.assigned_cost_usd ? (
                          <Chip label="Pendiente" size="small" color="warning" variant="outlined" />
                        ) : (
                          <Typography variant="caption" color="text.disabled">Sin costo</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                  {shipments.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          No hay envíos DHL para los filtros seleccionados
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Summary Footer */}
            {stats && (
              <Box sx={{ mt: 2, p: 2, bgcolor: '#111', borderRadius: 1 }}>
                <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  <Box sx={{ flex: '1 1 0', minWidth: 100 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>Total Envíos</Typography>
                    <Typography variant="h6" sx={{ color: 'white', fontWeight: 700 }}>{stats.total_shipments}</Typography>
                  </Box>
                  <Box sx={{ flex: '1 1 0', minWidth: 100 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>Standard / HV</Typography>
                    <Typography variant="h6" sx={{ color: 'white', fontWeight: 700 }}>{stats.standard_count} / {stats.high_value_count}</Typography>
                  </Box>
                  <Box sx={{ flex: '1 1 0', minWidth: 100 }}>
                    <Typography variant="caption" sx={{ color: '#64b5f6' }}>💼 Agencia</Typography>
                    <Typography variant="h6" sx={{ color: '#64b5f6', fontWeight: 700 }}>
                      ${parseFloat(String(stats.total_agencia || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: '1 1 0', minWidth: 100 }}>
                    <Typography variant="caption" sx={{ color: '#ffb74d' }}>🔓 Liberación</Typography>
                    <Typography variant="h6" sx={{ color: '#ffb74d', fontWeight: 700 }}>
                      ${parseFloat(String(stats.total_liberacion || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: '1 1 0', minWidth: 100 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>Otros</Typography>
                    <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>
                      ${parseFloat(String(stats.total_otros || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: '1 1 0', minWidth: 100 }}>
                    <Typography variant="caption" sx={{ color: '#F05A28' }}>COSTO TOTAL</Typography>
                    <Typography variant="h6" sx={{ color: '#F05A28', fontWeight: 700 }}>
                      ${parseFloat(String(stats.total_cost_usd || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        </TabPanel>

        {/* Tab 2: Utilidades */}
        <TabPanel value={tabValue} index={2}>
          <Box sx={{ p: 2 }}>
            {/* Date Filters */}
            <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: '#fafafa' }}>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <CalendarIcon sx={{ color: 'text.secondary' }} />
                <TextField
                  size="small"
                  type="date"
                  label="Fecha desde"
                  value={profitDateFrom}
                  onChange={(e) => setProfitDateFrom(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 170 }}
                />
                <TextField
                  size="small"
                  type="date"
                  label="Fecha hasta"
                  value={profitDateTo}
                  onChange={(e) => setProfitDateTo(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 170 }}
                />
                <TextField
                  size="small"
                  placeholder="Buscar tracking, cliente..."
                  value={profitSearch}
                  onChange={(e) => setProfitSearch(e.target.value)}
                  InputProps={{
                    startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />
                  }}
                  sx={{ width: 250 }}
                />
                <Button
                  variant="contained"
                  startIcon={<FilterIcon />}
                  onClick={fetchProfitability}
                  sx={{ bgcolor: DHL_COLOR }}
                >
                  Filtrar
                </Button>
              </Box>
            </Paper>

            {profitLoading && <LinearProgress sx={{ mb: 2 }} />}

            {/* Summary Cards */}
            {profitSummary && (
              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                <Box sx={{ flex: '1 1 0', minWidth: 170 }}>
                  <Card variant="outlined" sx={{ height: '100%' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="caption" color="text.secondary">Total Cajas</Typography>
                      <Typography variant="h5" fontWeight="bold">{profitSummary.total_shipments}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Std: {profitSummary.standard_count} | HV: {profitSummary.hv_count}
                      </Typography>
                    </CardContent>
                  </Card>
                </Box>
                <Box sx={{ flex: '1 1 0', minWidth: 170 }}>
                  <Card variant="outlined" sx={{ borderLeft: '4px solid #4caf50', height: '100%' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="caption" color="text.secondary">Precio Cobro (MXN)</Typography>
                      <Typography variant="h5" fontWeight="bold" color="success.main">
                        ${profitSummary.total_revenue.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </Typography>
                    </CardContent>
                  </Card>
                </Box>
                <Box sx={{ flex: '1 1 0', minWidth: 170 }}>
                  <Card variant="outlined" sx={{ borderLeft: `4px solid ${DHL_COLOR}`, height: '100%' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="caption" color="text.secondary">Costo (Gasto)</Typography>
                      <Typography variant="h5" fontWeight="bold" color="error.main">
                        ${profitSummary.total_cost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Ag: ${profitSummary.total_agencia.toFixed(0)} | Lib: ${profitSummary.total_liberacion.toFixed(0)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Box>
                <Box sx={{ flex: '1 1 0', minWidth: 170 }}>
                  <Card variant="outlined" sx={{ borderLeft: '4px solid #F05A28', height: '100%' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="caption" color="text.secondary">Utilidad Neta</Typography>
                      <Typography variant="h5" fontWeight="bold" sx={{ color: profitSummary.total_profit >= 0 ? '#4caf50' : '#f44336' }}>
                        ${profitSummary.total_profit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </Typography>
                    </CardContent>
                  </Card>
                </Box>
                <Box sx={{ flex: '1 1 0', minWidth: 170 }}>
                  <Card variant="outlined" sx={{ borderLeft: '4px solid #ff9800', height: '100%' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="caption" color="text.secondary">Por Cobrar</Typography>
                      <Typography variant="h5" fontWeight="bold" sx={{ color: '#ff9800' }}>
                        ${profitSummary.total_por_cobrar.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {profitSummary.total_cobrado > 0 ? `Cobrado: $${profitSummary.total_cobrado.toFixed(2)}` : 'Sin pagos recibidos'}
                      </Typography>
                    </CardContent>
                  </Card>
                </Box>
              </Box>
            )}

            {/* Profit Table */}
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell>Tracking</TableCell>
                    <TableCell>Cliente</TableCell>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Peso</TableCell>
                    <TableCell>Fecha</TableCell>
                    <TableCell align="right" sx={{ color: '#4caf50' }}>Cobrado MXN</TableCell>
                    <TableCell align="right" sx={{ color: '#ff9800' }}>Por Cobrar</TableCell>
                    <TableCell align="right" sx={{ color: DHL_COLOR }}>Costo MXN</TableCell>
                    <TableCell align="right" sx={{ color: '#1565c0' }}>Agencia</TableCell>
                    <TableCell align="right" sx={{ color: '#e65100' }}>Liberación</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>Utilidad</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {profitData.map((row: any) => (
                    <TableRow key={row.id} hover>
                      <TableCell>
                        <Typography fontWeight="medium" fontFamily="monospace" variant="body2">
                          {row.inbound_tracking}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{row.client_name}</Typography>
                        <Typography variant="caption" color="text.secondary">{row.client_box_id}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={row.product_type === 'high_value' ? 'HV' : 'STD'}
                          size="small"
                          sx={{
                            bgcolor: row.product_type === 'high_value' ? DHL_YELLOW : DHL_COLOR,
                            color: row.product_type === 'high_value' ? 'black' : 'white',
                            fontSize: '0.7rem', minWidth: 40
                          }}
                        />
                      </TableCell>
                      <TableCell>{row.weight_kg ? parseFloat(row.weight_kg).toFixed(1) : '-'}</TableCell>
                      <TableCell>{formatDate(row.created_at)}</TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ color: '#4caf50', fontWeight: 500 }}>
                          ${row.cobrado > 0 ? row.cobrado.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '0.00'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {row.por_cobrar > 0 ? (
                          <Chip
                            label={`$${row.por_cobrar.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
                            size="small"
                            sx={{ bgcolor: '#fff3e0', color: '#e65100', fontWeight: 'bold', fontSize: '0.75rem' }}
                          />
                        ) : (
                          <Chip label="Pagado" size="small" sx={{ bgcolor: '#e8f5e9', color: '#2e7d32', fontWeight: 'bold', fontSize: '0.75rem' }} />
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="error">
                          ${row.cost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ color: '#1565c0' }}>
                          ${row.agencia.toFixed(2)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ color: '#e65100' }}>
                          ${row.liberacion.toFixed(2)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight="bold" sx={{ color: row.profit >= 0 ? '#4caf50' : '#f44336' }}>
                          ${row.profit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                  {profitData.length === 0 && !profitLoading && (
                    <TableRow>
                      <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          No hay datos de utilidades. Selecciona un rango de fechas y filtra.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Profit Footer */}
            {profitSummary && profitSummary.total_shipments > 0 && (
              <Box sx={{ mt: 2, p: 2, bgcolor: '#111', borderRadius: 1 }}>
                <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  <Box sx={{ flex: '1 1 0', minWidth: 120 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>Cajas</Typography>
                    <Typography variant="h6" sx={{ color: 'white', fontWeight: 700 }}>{profitSummary.total_shipments}</Typography>
                  </Box>
                  <Box sx={{ flex: '1 1 0', minWidth: 120 }}>
                    <Typography variant="caption" sx={{ color: '#81c784' }}>Ingresos</Typography>
                    <Typography variant="h6" sx={{ color: '#81c784', fontWeight: 700 }}>
                      ${profitSummary.total_revenue.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: '1 1 0', minWidth: 120 }}>
                    <Typography variant="caption" sx={{ color: '#ef9a9a' }}>Costos</Typography>
                    <Typography variant="h6" sx={{ color: '#ef9a9a', fontWeight: 700 }}>
                      ${profitSummary.total_cost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: '1 1 0', minWidth: 120 }}>
                    <Typography variant="caption" sx={{ color: '#F05A28' }}>UTILIDAD NETA</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: profitSummary.total_profit >= 0 ? '#4caf50' : '#f44336' }}>
                      ${profitSummary.total_profit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: '1 1 0', minWidth: 120 }}>
                    <Typography variant="caption" sx={{ color: '#ff9800' }}>POR COBRAR</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#ff9800' }}>
                      ${profitSummary.total_por_cobrar.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        </TabPanel>
      </Paper>
      <Dialog open={editCostRateDialog} onClose={() => setEditCostRateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ borderBottom: '3px solid #F05A28', pb: 1.5 }}>
          Editar Tarifa de Costo: {selectedCostRate?.rate_name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              Ingresa el desglose de costos. El total se calcula automáticamente.
            </Alert>

            <TextField
              label="Costo de Agencia"
              type="number"
              value={editCostForm.costo_agencia}
              onChange={(e) => setEditCostForm({ ...editCostForm, costo_agencia: parseFloat(e.target.value) || 0 })}
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>
              }}
              helperText="Costo de agencia aduanal"
              fullWidth
            />
            <TextField
              label="Costo de Liberación"
              type="number"
              value={editCostForm.costo_liberacion}
              onChange={(e) => setEditCostForm({ ...editCostForm, costo_liberacion: parseFloat(e.target.value) || 0 })}
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>
              }}
              helperText="Costo de liberación del paquete"
              fullWidth
            />
            <TextField
              label="Otros Costos"
              type="number"
              value={editCostForm.costo_otros}
              onChange={(e) => setEditCostForm({ ...editCostForm, costo_otros: parseFloat(e.target.value) || 0 })}
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>
              }}
              helperText="Maniobras, almacenaje, etc."
              fullWidth
            />

            {/* Total calculado */}
            <Paper sx={{ p: 2, bgcolor: '#111', borderRadius: 2, textAlign: 'center' }}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>
                Costo Total MXN
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800, color: '#F05A28' }}>
                ${(editCostForm.costo_agencia + editCostForm.costo_liberacion + editCostForm.costo_otros).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 1 }}>
                {editCostForm.costo_agencia > 0 && (
                  <Chip label={`Agencia: $${editCostForm.costo_agencia.toFixed(2)}`} size="small" variant="outlined" />
                )}
                {editCostForm.costo_liberacion > 0 && (
                  <Chip label={`Liberación: $${editCostForm.costo_liberacion.toFixed(2)}`} size="small" variant="outlined" />
                )}
                {editCostForm.costo_otros > 0 && (
                  <Chip label={`Otros: $${editCostForm.costo_otros.toFixed(2)}`} size="small" variant="outlined" />
                )}
              </Box>
            </Paper>

            <TextField
              label="Descripción"
              value={editCostForm.description}
              onChange={(e) => setEditCostForm({ ...editCostForm, description: e.target.value })}
              multiline
              rows={2}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditCostRateDialog(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSaveCostRate} startIcon={<SaveIcon />}
            sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#d94d1a' } }}>
            Guardar
          </Button>
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
