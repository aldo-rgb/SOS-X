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
  AutoAwesome as AutoIcon,
  Save as SaveIcon,
  FilterList as FilterIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
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
  client_name: string;
  client_box_id: string;
  client_email: string;
  cost_assigned_by_name: string | null;
  rate_cost_usd: number | null;
}

interface CostingStats {
  total_shipments: number;
  with_cost: number;
  without_cost: number;
  total_cost_usd: number;
  standard_count: number;
  high_value_count: number;
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
  const [filterHasCost, setFilterHasCost] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  
  // Dialogs
  const [editCostRateDialog, setEditCostRateDialog] = useState(false);
  const [assignCostDialog, setAssignCostDialog] = useState(false);
  const [selectedCostRate, setSelectedCostRate] = useState<DhlCostRate | null>(null);
  
  // Form values
  const [editCostForm, setEditCostForm] = useState({ cost_usd: 0, description: '' });
  const [assignCostForm, setAssignCostForm] = useState({ cost_rate_type: '', custom_cost_usd: '' });

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
          has_cost: filterHasCost !== 'all' ? filterHasCost : undefined
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
  }, [searchTerm, filterHasCost]);

  useEffect(() => {
    fetchCostRates();
  }, [fetchCostRates]);

  useEffect(() => {
    if (tabValue === 1) {
      fetchShipments();
    }
  }, [tabValue, fetchShipments]);

  // Handlers
  const handleEditCostRate = (rate: DhlCostRate) => {
    setSelectedCostRate(rate);
    setEditCostForm({
      cost_usd: rate.cost_usd,
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

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(shipments.filter(s => !s.assigned_cost_usd).map(s => s.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectShipment = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter(i => i !== id));
    }
  };

  const handleOpenAssignDialog = () => {
    if (selectedIds.length === 0) {
      setSnackbar({ open: true, message: 'Selecciona al menos un envío', severity: 'error' });
      return;
    }
    setAssignCostForm({ cost_rate_type: '', custom_cost_usd: '' });
    setAssignCostDialog(true);
  };

  const handleAssignCost = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/admin/dhl/costing/assign`, {
        shipment_ids: selectedIds,
        cost_rate_type: assignCostForm.cost_rate_type || undefined,
        custom_cost_usd: assignCostForm.custom_cost_usd ? parseFloat(assignCostForm.custom_cost_usd) : undefined
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSnackbar({ open: true, message: `Costo asignado a ${selectedIds.length} envío(s)`, severity: 'success' });
      setAssignCostDialog(false);
      setSelectedIds([]);
      fetchShipments();
    } catch {
      setSnackbar({ open: true, message: 'Error al asignar costo', severity: 'error' });
    }
  };

  const handleAutoAssign = async () => {
    if (!window.confirm('¿Asignar costos automáticamente a todos los envíos sin costo basándose en su tipo?')) {
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/api/admin/dhl/costing/auto-assign`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSnackbar({ 
        open: true, 
        message: `Costos auto-asignados: ${response.data.totalUpdated} envíos actualizados`, 
        severity: 'success' 
      });
      fetchShipments();
    } catch {
      setSnackbar({ open: true, message: 'Error al auto-asignar costos', severity: 'error' });
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
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderLeft: `4px solid ${DHL_COLOR}` }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Costo Standard</Typography>
              <Typography variant="h5" fontWeight="bold">${standardCost.toFixed(2)} USD</Typography>
              <Typography variant="caption" color="text.secondary">Lo que nos cuesta</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderLeft: `4px solid ${DHL_YELLOW}` }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Costo High Value</Typography>
              <Typography variant="h5" fontWeight="bold">${highValueCost.toFixed(2)} USD</Typography>
              <Typography variant="caption" color="text.secondary">Lo que nos cuesta</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
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
        <Grid item xs={12} sm={6} md={3}>
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
                    <TableCell align="right">Costo USD</TableCell>
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
                          ${parseFloat(String(rate.cost_usd || 0)).toFixed(2)}
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
                      <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
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
            {/* Filters & Actions */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField
                size="small"
                placeholder="Buscar tracking, cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />
                }}
                sx={{ width: 300 }}
              />
              
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Filtrar por costo</InputLabel>
                <Select
                  value={filterHasCost}
                  label="Filtrar por costo"
                  onChange={(e) => setFilterHasCost(e.target.value)}
                >
                  <MenuItem value="all">Todos</MenuItem>
                  <MenuItem value="true">Con costo</MenuItem>
                  <MenuItem value="false">Sin costo</MenuItem>
                </Select>
              </FormControl>

              <Button
                variant="outlined"
                startIcon={<FilterIcon />}
                onClick={fetchShipments}
              >
                Aplicar Filtros
              </Button>

              <Box sx={{ flexGrow: 1 }} />

              <Button
                variant="outlined"
                color="secondary"
                startIcon={<AutoIcon />}
                onClick={handleAutoAssign}
              >
                Auto-Asignar
              </Button>

              <Button
                variant="contained"
                startIcon={<MoneyIcon />}
                onClick={handleOpenAssignDialog}
                disabled={selectedIds.length === 0}
                sx={{ bgcolor: DHL_COLOR }}
              >
                Asignar Costo ({selectedIds.length})
              </Button>
            </Box>

            {loading && <LinearProgress sx={{ mb: 2 }} />}

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        indeterminate={selectedIds.length > 0 && selectedIds.length < shipments.filter(s => !s.assigned_cost_usd).length}
                        checked={selectedIds.length > 0 && selectedIds.length === shipments.filter(s => !s.assigned_cost_usd).length}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    </TableCell>
                    <TableCell>Tracking</TableCell>
                    <TableCell>Cliente</TableCell>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Peso (kg)</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell>Fecha</TableCell>
                    <TableCell align="right">Costo Asignado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shipments.map((shipment) => (
                    <TableRow 
                      key={shipment.id} 
                      hover
                      sx={{ 
                        bgcolor: shipment.assigned_cost_usd ? 'success.light' : 'inherit',
                        opacity: shipment.assigned_cost_usd ? 0.9 : 1
                      }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedIds.includes(shipment.id)}
                          onChange={(e) => handleSelectShipment(shipment.id, e.target.checked)}
                          disabled={!!shipment.assigned_cost_usd}
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
                          <Box>
                            <Typography fontWeight="bold" color="success.dark">
                              ${parseFloat(String(shipment.assigned_cost_usd)).toFixed(2)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {shipment.cost_rate_type}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography color="warning.main" fontWeight="bold">
                            Pendiente
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {shipments.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          No hay envíos DHL registrados
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Summary */}
            {stats && (
              <Box sx={{ mt: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">Total Envíos</Typography>
                    <Typography variant="h6">{stats.total_shipments}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">Standard</Typography>
                    <Typography variant="h6">{stats.standard_count}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">High Value</Typography>
                    <Typography variant="h6">{stats.high_value_count}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">Costo Total</Typography>
                    <Typography variant="h6" color="primary">${parseFloat(stats.total_cost_usd?.toString() || '0').toFixed(2)}</Typography>
                  </Grid>
                </Grid>
              </Box>
            )}
          </Box>
        </TabPanel>
      </Paper>

      {/* Dialog: Edit Cost Rate */}
      <Dialog open={editCostRateDialog} onClose={() => setEditCostRateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Editar Tarifa de Costo: {selectedCostRate?.rate_name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Costo USD"
              type="number"
              value={editCostForm.cost_usd}
              onChange={(e) => setEditCostForm({ ...editCostForm, cost_usd: parseFloat(e.target.value) || 0 })}
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>
              }}
              fullWidth
            />
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
        <DialogActions>
          <Button onClick={() => setEditCostRateDialog(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSaveCostRate} startIcon={<SaveIcon />}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Assign Cost */}
      <Dialog open={assignCostDialog} onClose={() => setAssignCostDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Asignar Costo a {selectedIds.length} envío(s)
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert severity="info">
              Selecciona una tarifa predefinida o ingresa un costo personalizado.
            </Alert>
            
            <FormControl fullWidth>
              <InputLabel>Tipo de Tarifa</InputLabel>
              <Select
                value={assignCostForm.cost_rate_type}
                label="Tipo de Tarifa"
                onChange={(e) => setAssignCostForm({ ...assignCostForm, cost_rate_type: e.target.value, custom_cost_usd: '' })}
              >
                <MenuItem value="">-- Personalizado --</MenuItem>
                <MenuItem value="standard">Standard (${standardCost.toFixed(2)} USD)</MenuItem>
                <MenuItem value="high_value">High Value (${highValueCost.toFixed(2)} USD)</MenuItem>
              </Select>
            </FormControl>
            
            {!assignCostForm.cost_rate_type && (
              <TextField
                label="Costo Personalizado USD"
                type="number"
                value={assignCostForm.custom_cost_usd}
                onChange={(e) => setAssignCostForm({ ...assignCostForm, custom_cost_usd: e.target.value })}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>
                }}
                fullWidth
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignCostDialog(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleAssignCost} 
            startIcon={<MoneyIcon />}
            disabled={!assignCostForm.cost_rate_type && !assignCostForm.custom_cost_usd}
            sx={{ bgcolor: DHL_COLOR }}
          >
            Asignar Costo
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
