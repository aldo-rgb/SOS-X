// ============================================
// PANEL DE CONSOLIDACIONES MARÍTIMAS
// Gestión de LOGs del API China con asignación
// de contenedores, rutas, tipo de mercancía y BL
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Alert,
  Snackbar,
  Card,
  CardContent,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Tabs,
  Tab,
  FormControlLabel,
  RadioGroup,
  Radio,
  Divider,
  Badge,
  InputAdornment,
  Switch,
  Autocomplete
} from '@mui/material';
import DirectionsBoatIcon from '@mui/icons-material/DirectionsBoat';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import AssignmentIcon from '@mui/icons-material/Assignment';
import EditIcon from '@mui/icons-material/Edit';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import RouteIcon from '@mui/icons-material/Route';
import InventoryIcon from '@mui/icons-material/Inventory';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import DescriptionIcon from '@mui/icons-material/Description';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Interfaces
interface MaritimeOrder {
  id: number;
  ordersn: string;
  user_id: number | null;
  shipping_mark: string;
  goods_type: string;
  goods_name: string;
  goods_num: number;
  weight: string;
  volume: string;
  status: string;
  route_id: number | null;
  container_id: number | null;
  merchandise_type: string;
  packing_list_url: string | null;
  packing_list_type: string | null;
  bl_number: string | null;
  consolidation_notes: string | null;
  has_battery: boolean;
  has_liquid: boolean;
  is_pickup: boolean;
  created_at: string;
  updated_at: string;
  client_name?: string;
  client_email?: string;
  client_box_id?: string;
  route_name?: string;
  route_code?: string;
  container_number?: string;
  bl_client_name?: string;
  bl_client_code?: string;
  brand_type?: string;
}

interface MaritimeRoute {
  id: number;
  name: string;
  code: string;
  origin: string;
  waypoints: string[];
  destination: string;
  estimated_days: number;
  is_active: boolean;
}

interface Container {
  id: number;
  container_number: string;
  bl_number: string;
  eta: string;
  status: string;
  type: string;
  total_weight_kg: number;
  total_cbm: number;
  total_packages: number;
}

interface Stats {
  total_orders: number;
  assigned_to_container: number;
  pending_assignment: number;
  with_packing_list: number;
  by_merchandise_type: { type: string; count: number }[];
}

interface LegacyClient {
  id: number;
  box_id: string;
  full_name: string;
  email: string;
}

// Diccionario de traducción chino -> español
const CHINESE_TO_SPANISH: Record<string, string> = {
  '普货': 'Carga General',
  '敏感货': 'Carga Sensible',
  '特货': 'Carga Especial',
  '危险品': 'Mercancía Peligrosa',
  '液体': 'Líquidos',
  '粉末': 'Polvo',
  '带电': 'Con Batería',
  '纯电': 'Solo Batería',
  '外套': 'Abrigo/Chaqueta',
  '衣服': 'Ropa',
  '鞋子': 'Zapatos',
  '包包': 'Bolsos',
  '电子产品': 'Electrónicos',
  '玩具': 'Juguetes',
  '家具': 'Muebles',
};

const translateChinese = (text: string): string => {
  if (!text) return text;
  let translated = text;
  for (const [chinese, spanish] of Object.entries(CHINESE_TO_SPANISH)) {
    translated = translated.replace(new RegExp(chinese, 'g'), spanish);
  }
  return translated;
};

const MaritimeConsolidationsPage: React.FC = () => {
  // State
  const [orders, setOrders] = useState<MaritimeOrder[]>([]);
  const [routes, setRoutes] = useState<MaritimeRoute[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'info' });

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filterContainer, setFilterContainer] = useState<string>('all');
  const [filterMerchandiseType, setFilterMerchandiseType] = useState<string>('all');
  const [filterHasPackingList, setFilterHasPackingList] = useState<string>('all');

  // Diálogos
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    order: MaritimeOrder | null;
    containerId: number | null;
    routeId: number | null;
    merchandiseType: string;
    blNumber: string;
    notes: string;
    hasBattery: boolean;
    hasLiquid: boolean;
    isPickup: boolean;
  }>({
    open: false,
    order: null,
    containerId: null,
    routeId: null,
    merchandiseType: 'generic',
    blNumber: '',
    notes: '',
    hasBattery: false,
    hasLiquid: false,
    isPickup: false
  });

  const [packingListDialog, setPackingListDialog] = useState<{
    open: boolean;
    order: MaritimeOrder | null;
    file: File | null;
  }>({
    open: false,
    order: null,
    file: null
  });

  const [routesDialog, setRoutesDialog] = useState(false);
  const [newRouteDialog, setNewRouteDialog] = useState({
    open: false,
    name: '',
    code: '',
    origin: 'Shenzhen',
    waypoints: '',
    destination: '',
    estimatedDays: 45
  });

  // Estado para edición inline de MARK y CLIENTE
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [editingMark, setEditingMark] = useState<LegacyClient | string | null>(null);
  const [editingClient, setEditingClient] = useState<LegacyClient | string | null>(null);
  const [legacyClients, setLegacyClients] = useState<LegacyClient[]>([]);
  const [searchingClients, setSearchingClients] = useState(false);

  const token = localStorage.getItem('token');

  // Cargar datos
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };

      // Cargar órdenes marítimas
      const ordersRes = await fetch(`${API_URL}/api/maritime-api/orders/consolidations`, { headers });
      const ordersData = await ordersRes.json();
      setOrders(ordersData.orders || []);

      // Cargar rutas
      const routesRes = await fetch(`${API_URL}/api/maritime-api/routes`, { headers });
      const routesData = await routesRes.json();
      setRoutes(routesData.routes || []);

      // Cargar contenedores del panel de costeo marítimo
      const containersRes = await fetch(`${API_URL}/api/maritime/containers`, { headers });
      const containersData = await containersRes.json();
      setContainers(containersData || []);

      // Cargar estadísticas
      const statsRes = await fetch(`${API_URL}/api/maritime-api/consolidations/stats`, { headers });
      const statsData = await statsRes.json();
      setStats(statsData.stats || null);

    } catch (error) {
      console.error('Error cargando datos:', error);
      setSnackbar({ open: true, message: 'Error al cargar datos', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Buscar clientes legacy
  const searchLegacyClients = async (query: string) => {
    if (query.length < 1) {
      setLegacyClients([]);
      return;
    }
    setSearchingClients(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/legacy-clients/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLegacyClients(data.clients || []);
      }
    } catch (error) {
      console.error('Error buscando clientes:', error);
    } finally {
      setSearchingClients(false);
    }
  };

  // Iniciar edición de una orden
  const startEditing = (order: MaritimeOrder) => {
    setEditingOrderId(order.id);
    // Buscar cliente legacy por shipping_mark
    if (order.shipping_mark) {
      setEditingMark({ id: 0, box_id: order.shipping_mark, full_name: '', email: '' });
    } else {
      setEditingMark(null);
    }
    // Buscar cliente legacy por bl_client_code
    if (order.bl_client_code) {
      setEditingClient({ id: 0, box_id: order.bl_client_code, full_name: order.bl_client_name || '', email: '' });
    } else {
      setEditingClient(null);
    }
  };

  // Cancelar edición
  const cancelEditing = () => {
    setEditingOrderId(null);
    setEditingMark(null);
    setEditingClient(null);
  };

  // Guardar cambios de MARK y CLIENTE
  const saveMarkClient = async (order: MaritimeOrder) => {
    try {
      // Manejar casos donde el valor puede ser string (freeSolo) u objeto
      const markValue = typeof editingMark === 'string' ? editingMark : editingMark?.box_id;
      const clientCode = typeof editingClient === 'string' ? editingClient : editingClient?.box_id;
      const clientName = typeof editingClient === 'string' ? null : editingClient?.full_name;

      console.log('Guardando MARK:', markValue, 'CLIENTE:', clientCode, clientName);

      const res = await fetch(`${API_URL}/api/maritime-api/orders/${order.ordersn}/mark-client`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shipping_mark: markValue || null,
          bl_client_code: clientCode || null,
          bl_client_name: clientName || null
        })
      });

      if (res.ok) {
        setSnackbar({ open: true, message: 'MARK y CLIENTE actualizados', severity: 'success' });
        cancelEditing();
        loadData();
      } else {
        const error = await res.json();
        setSnackbar({ open: true, message: error.error || 'Error al guardar', severity: 'error' });
      }
    } catch (error) {
      console.error('Error guardando:', error);
      setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
    }
  };

  // Guardar asignación
  const handleSaveAssignment = async () => {
    if (!editDialog.order) return;

    try {
      const res = await fetch(`${API_URL}/api/maritime-api/orders/${editDialog.order.ordersn}/consolidation`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          containerId: editDialog.containerId,
          routeId: editDialog.routeId,
          merchandiseType: editDialog.merchandiseType,
          blNumber: editDialog.blNumber,
          notes: editDialog.notes,
          hasBattery: editDialog.hasBattery,
          hasLiquid: editDialog.hasLiquid,
          isPickup: editDialog.isPickup
        })
      });

      if (res.ok) {
        setSnackbar({ open: true, message: 'Asignación guardada correctamente', severity: 'success' });
        setEditDialog({ ...editDialog, open: false });
        loadData();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Error al guardar');
      }
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message, severity: 'error' });
    }
  };

  // Subir packing list
  const handleUploadPackingList = async () => {
    if (!packingListDialog.order || !packingListDialog.file) return;

    try {
      const formData = new FormData();
      formData.append('packingList', packingListDialog.file);

      const res = await fetch(`${API_URL}/api/maritime-api/orders/${packingListDialog.order.ordersn}/packing-list`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (res.ok) {
        setSnackbar({ open: true, message: 'Packing list subido correctamente', severity: 'success' });
        setPackingListDialog({ open: false, order: null, file: null });
        loadData();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Error al subir archivo');
      }
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message, severity: 'error' });
    }
  };

  // Crear nueva ruta
  const handleCreateRoute = async () => {
    try {
      const res = await fetch(`${API_URL}/api/maritime-api/routes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newRouteDialog.name,
          code: newRouteDialog.code,
          origin: newRouteDialog.origin,
          waypoints: newRouteDialog.waypoints.split(',').map(w => w.trim()).filter(w => w),
          destination: newRouteDialog.destination,
          estimatedDays: newRouteDialog.estimatedDays
        })
      });

      if (res.ok) {
        setSnackbar({ open: true, message: 'Ruta creada correctamente', severity: 'success' });
        setNewRouteDialog({ ...newRouteDialog, open: false, name: '', code: '', waypoints: '', destination: '' });
        loadData();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Error al crear ruta');
      }
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message, severity: 'error' });
    }
  };

  // Filtrar órdenes
  const filteredOrders = orders.filter(order => {
    if (searchTerm && !order.ordersn.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !order.shipping_mark?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterContainer !== 'all') {
      if (filterContainer === 'unassigned' && order.container_id) return false;
      if (filterContainer !== 'unassigned' && order.container_id !== parseInt(filterContainer)) return false;
    }
    if (filterMerchandiseType !== 'all' && order.merchandise_type !== filterMerchandiseType) return false;
    if (filterHasPackingList === 'with' && !order.packing_list_url) return false;
    if (filterHasPackingList === 'without' && order.packing_list_url) return false;
    return true;
  });

  // Abrir diálogo de edición
  const handleEditOrder = (order: MaritimeOrder) => {
    setEditDialog({
      open: true,
      order,
      containerId: order.container_id,
      routeId: order.route_id,
      merchandiseType: order.merchandise_type || 'generic',
      blNumber: order.bl_number || '',
      notes: order.consolidation_notes || '',
      hasBattery: order.has_battery || false,
      hasLiquid: order.has_liquid || false,
      isPickup: order.is_pickup || false
    });
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <DirectionsBoatIcon sx={{ fontSize: 32, mr: 1, color: 'primary.main' }} />
        <Typography variant="h5" fontWeight="bold">
          Consolidaciones Marítimas
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant="outlined"
          startIcon={<RouteIcon />}
          onClick={() => setRoutesDialog(true)}
          sx={{ mr: 1 }}
        >
          Gestionar Rutas
        </Button>
        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
          onClick={loadData}
          disabled={loading}
        >
          Actualizar
        </Button>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}>
          <Card sx={{ bgcolor: 'info.light' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <InventoryIcon sx={{ fontSize: 32, color: 'info.dark' }} />
              <Typography variant="h4" fontWeight="bold">{stats?.total_orders || 0}</Typography>
              <Typography variant="body2">Total LOGs</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{ bgcolor: 'success.light' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <CheckCircleIcon sx={{ fontSize: 32, color: 'success.dark' }} />
              <Typography variant="h4" fontWeight="bold">{stats?.assigned_to_container || 0}</Typography>
              <Typography variant="body2">En Contenedor</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{ bgcolor: 'warning.light' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <PendingIcon sx={{ fontSize: 32, color: 'warning.dark' }} />
              <Typography variant="h4" fontWeight="bold">{stats?.pending_assignment || 0}</Typography>
              <Typography variant="body2">Sin Asignar</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{ bgcolor: 'secondary.light' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <DescriptionIcon sx={{ fontSize: 32, color: 'secondary.dark' }} />
              <Typography variant="h4" fontWeight="bold">{stats?.with_packing_list || 0}</Typography>
              <Typography variant="body2">Con Packing List</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ mb: 2 }}>
        <Tab label="Todos los LOGs" icon={<InventoryIcon />} iconPosition="start" />
        <Tab label="Sin Contenedor" icon={<PendingIcon />} iconPosition="start" />
        <Tab label="Asignados" icon={<CheckCircleIcon />} iconPosition="start" />
      </Tabs>

      {/* Filtros */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              size="small"
              placeholder="Buscar por LOG o Shipping Mark..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>
              }}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Contenedor</InputLabel>
              <Select
                value={filterContainer}
                label="Contenedor"
                onChange={(e) => setFilterContainer(e.target.value)}
              >
                <MenuItem value="all">Todos</MenuItem>
                <MenuItem value="unassigned">Sin asignar</MenuItem>
                <Divider />
                {containers.map(c => (
                  <MenuItem key={c.id} value={c.id.toString()}>
                    {c.container_number} ({c.status})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Tipo Mercancía</InputLabel>
              <Select
                value={filterMerchandiseType}
                label="Tipo Mercancía"
                onChange={(e) => setFilterMerchandiseType(e.target.value)}
              >
                <MenuItem value="all">Todos</MenuItem>
                <MenuItem value="generic">Genérico</MenuItem>
                <MenuItem value="branded">Logotipo</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Packing List</InputLabel>
              <Select
                value={filterHasPackingList}
                label="Packing List"
                onChange={(e) => setFilterHasPackingList(e.target.value)}
              >
                <MenuItem value="all">Todos</MenuItem>
                <MenuItem value="with">Con Packing List</MenuItem>
                <MenuItem value="without">Sin Packing List</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Tabla de LOGs */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.100' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>LOG</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>MARK (API)</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>CLIENTE</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Mercancía</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Peso / Vol</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Contenedor</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Ruta</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Tipo</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Especial</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Packing List</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="center">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : filteredOrders
              .filter(order => {
                if (tabValue === 1) return !order.container_id;
                if (tabValue === 2) return order.container_id;
                return true;
              })
              .map(order => (
              <TableRow key={order.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight="bold" color="primary">
                    {order.ordersn}
                  </Typography>
                </TableCell>
                <TableCell>
                  {editingOrderId === order.id ? (
                    <Autocomplete
                      size="small"
                      options={legacyClients}
                      value={editingMark}
                      onChange={(_, newValue) => {
                        console.log('MARK changed:', newValue);
                        setEditingMark(newValue);
                      }}
                      onInputChange={(_, value, reason) => {
                        if (reason === 'input') {
                          searchLegacyClients(value);
                          // Si escribe manualmente, guardar como string
                          if (value) setEditingMark(value);
                        }
                      }}
                      getOptionLabel={(option) => typeof option === 'string' ? option : option.box_id || ''}
                      renderOption={(props, option) => (
                        <li {...props} key={option.id}>
                          <Box>
                            <Typography variant="body2" fontWeight="bold">{option.box_id}</Typography>
                            <Typography variant="caption" color="text.secondary">{option.full_name}</Typography>
                          </Box>
                        </li>
                      )}
                      loading={searchingClients}
                      freeSolo
                      renderInput={(params) => (
                        <TextField 
                          {...params} 
                          placeholder="MARK" 
                          size="small"
                          sx={{ minWidth: 120 }}
                        />
                      )}
                    />
                  ) : (
                    <Typography variant="body2" fontWeight="bold">{order.shipping_mark || '-'}</Typography>
                  )}
                </TableCell>
                <TableCell>
                  {editingOrderId === order.id ? (
                    <Autocomplete
                      size="small"
                      options={legacyClients}
                      value={editingClient}
                      onChange={(_, newValue) => {
                        console.log('CLIENTE changed:', newValue);
                        setEditingClient(newValue);
                      }}
                      onInputChange={(_, value, reason) => {
                        if (reason === 'input') {
                          searchLegacyClients(value);
                          // Si escribe manualmente, guardar como string
                          if (value) setEditingClient(value);
                        }
                      }}
                      getOptionLabel={(option) => typeof option === 'string' ? option : `${option.box_id} - ${option.full_name}` || ''}
                      renderOption={(props, option) => (
                        <li {...props} key={option.id}>
                          <Box>
                            <Typography variant="body2" fontWeight="bold">{option.box_id}</Typography>
                            <Typography variant="caption" color="text.secondary">{option.full_name}</Typography>
                          </Box>
                        </li>
                      )}
                      loading={searchingClients}
                      freeSolo
                      renderInput={(params) => (
                        <TextField 
                          {...params} 
                          placeholder="Cliente" 
                          size="small"
                          sx={{ minWidth: 150 }}
                        />
                      )}
                    />
                  ) : (
                    <>
                      <Typography variant="body2">{order.bl_client_name || 'Sin asignar'}</Typography>
                      <Typography variant="caption" color="text.secondary">{order.bl_client_code || ''}</Typography>
                    </>
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{translateChinese(order.goods_name)}</Typography>
                  <Chip 
                    size="small" 
                    label={translateChinese(order.goods_type)} 
                    sx={{ fontSize: '0.7rem' }}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{order.weight} kg</Typography>
                  <Typography variant="caption" color="text.secondary">{order.volume} m³</Typography>
                </TableCell>
                <TableCell>
                  {order.container_number ? (
                    <Chip 
                      size="small" 
                      label={order.container_number} 
                      color="success" 
                      variant="outlined"
                    />
                  ) : (
                    <Chip size="small" label="Sin asignar" color="warning" />
                  )}
                </TableCell>
                <TableCell>
                  {order.route_name ? (
                    <Tooltip title={order.route_code}>
                      <Chip size="small" label={order.route_name} color="info" variant="outlined" />
                    </Tooltip>
                  ) : (
                    <Typography variant="caption" color="text.secondary">-</Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Chip 
                    size="small" 
                    label={
                      order.brand_type === 'logo' ? 'Logotipo' : 
                      order.brand_type === 'sensitive' ? 'Sensible' : 
                      order.merchandise_type === 'branded' ? 'Logotipo' : 
                      order.merchandise_type === 'sensitive' ? 'Sensible' : 
                      'Genérico'
                    }
                    color={
                      order.brand_type === 'logo' ? 'primary' : 
                      order.brand_type === 'sensitive' ? 'default' :
                      order.merchandise_type === 'branded' ? 'primary' : 
                      order.merchandise_type === 'sensitive' ? 'default' :
                      'success'
                    }
                  />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {order.has_battery && (
                      <Tooltip title="Battery">
                        <Chip size="small" label="🔋" sx={{ minWidth: 32 }} />
                      </Tooltip>
                    )}
                    {order.has_liquid && (
                      <Tooltip title="Liquid">
                        <Chip size="small" label="💧" sx={{ minWidth: 32 }} />
                      </Tooltip>
                    )}
                    {order.is_pickup && (
                      <Tooltip title="Pick Up">
                        <Chip size="small" label="🚚" color="success" sx={{ minWidth: 32 }} />
                      </Tooltip>
                    )}
                    {!order.has_battery && !order.has_liquid && !order.is_pickup && (
                      <Typography variant="caption" color="text.secondary">-</Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  {order.packing_list_url ? (
                    <Tooltip title="Ver Packing List">
                      <IconButton 
                        size="small" 
                        color="primary"
                        onClick={() => window.open(order.packing_list_url!, '_blank')}
                      >
                        {order.packing_list_type === 'pdf' ? <PictureAsPdfIcon /> : <TableChartIcon />}
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Tooltip title="Subir Packing List">
                      <IconButton 
                        size="small" 
                        onClick={() => setPackingListDialog({ open: true, order, file: null })}
                      >
                        <UploadFileIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell align="center">
                  {editingOrderId === order.id ? (
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Guardar">
                        <IconButton size="small" color="success" onClick={() => saveMarkClient(order)}>
                          <SaveIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Cancelar">
                        <IconButton size="small" color="error" onClick={cancelEditing}>
                          <CloseIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Editar MARK/Cliente">
                        <IconButton size="small" color="warning" onClick={() => startEditing(order)}>
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Asignación">
                        <IconButton size="small" color="primary" onClick={() => handleEditOrder(order)}>
                          <AssignmentIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!loading && filteredOrders.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">No hay órdenes que mostrar</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Diálogo de Edición */}
      <Dialog open={editDialog.open} onClose={() => setEditDialog({ ...editDialog, open: false })} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <AssignmentIcon sx={{ mr: 1 }} />
            Asignar Consolidación - {editDialog.order?.ordersn}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Selector de Contenedor */}
            <FormControl fullWidth>
              <InputLabel>Contenedor *</InputLabel>
              <Select
                value={editDialog.containerId || ''}
                label="Contenedor *"
                onChange={(e) => {
                  const selectedId = e.target.value as number;
                  const selectedContainer = containers.find(c => c.id === selectedId);
                  setEditDialog({ 
                    ...editDialog, 
                    containerId: selectedId,
                    // Auto-llenar BL si el contenedor lo tiene
                    blNumber: selectedContainer?.bl_number || editDialog.blNumber
                  });
                }}
              >
                <MenuItem value="">
                  <em>Sin asignar</em>
                </MenuItem>
                {containers.map(c => (
                  <MenuItem key={c.id} value={c.id}>
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography variant="body2" fontWeight="bold">{c.container_number}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          BL: {c.bl_number || 'N/A'} | {c.type}
                        </Typography>
                      </Box>
                      <Chip 
                        size="small" 
                        label={c.status} 
                        color={c.status === 'in_transit' ? 'info' : 'default'}
                      />
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Selector de Ruta */}
            <FormControl fullWidth>
              <InputLabel>Ruta</InputLabel>
              <Select
                value={editDialog.routeId || ''}
                label="Ruta"
                onChange={(e) => setEditDialog({ ...editDialog, routeId: e.target.value as number })}
              >
                <MenuItem value="">
                  <em>Sin ruta asignada</em>
                </MenuItem>
                {routes.filter(r => r.is_active).map(r => (
                  <MenuItem key={r.id} value={r.id}>
                    <Box>
                      <Typography variant="body2" fontWeight="bold">{r.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {r.code} | {r.estimated_days} días
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Tipo de Mercancía */}
            <FormControl fullWidth>
              <InputLabel>Tipo de Mercancía</InputLabel>
              <Select
                value={editDialog.merchandiseType}
                label="Tipo de Mercancía"
                onChange={(e) => setEditDialog({ ...editDialog, merchandiseType: e.target.value })}
              >
                <MenuItem value="generic">Genérico</MenuItem>
                <MenuItem value="sensitive">Mercancía Sensible</MenuItem>
                <MenuItem value="branded">Logotipo (Marcas Registradas)</MenuItem>
              </Select>
            </FormControl>

            {/* Características especiales */}
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Características Especiales
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={editDialog.hasBattery}
                    onChange={(e) => setEditDialog({ ...editDialog, hasBattery: e.target.checked })}
                    color="warning"
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    🔋 Battery
                  </Box>
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={editDialog.hasLiquid}
                    onChange={(e) => setEditDialog({ ...editDialog, hasLiquid: e.target.checked })}
                    color="info"
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    💧 Liquid
                  </Box>
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={editDialog.isPickup}
                    onChange={(e) => setEditDialog({ ...editDialog, isPickup: e.target.checked })}
                    color="success"
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    🚚 Pick Up
                  </Box>
                }
              />
            </Box>
            <Divider sx={{ my: 1 }} />

            {/* BL Number - Auto-llenado del contenedor pero editable */}
            <TextField
              fullWidth
              label="Número de BL"
              value={editDialog.blNumber}
              onChange={(e) => setEditDialog({ ...editDialog, blNumber: e.target.value })}
              helperText="Se auto-completa del contenedor seleccionado"
            />

            {/* Notas */}
            <TextField
              fullWidth
              label="Notas de Consolidación"
              multiline
              rows={3}
              value={editDialog.notes}
              onChange={(e) => setEditDialog({ ...editDialog, notes: e.target.value })}
              placeholder="Instrucciones especiales, observaciones..."
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog({ ...editDialog, open: false })}>Cancelar</Button>
          <Button variant="contained" onClick={handleSaveAssignment}>Guardar</Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de Packing List */}
      <Dialog open={packingListDialog.open} onClose={() => setPackingListDialog({ ...packingListDialog, open: false })} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <UploadFileIcon sx={{ mr: 1 }} />
            Subir Packing List - {packingListDialog.order?.ordersn}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert severity="info">
              Formatos aceptados: PDF, XLS, XLSX (máx. 10MB)
            </Alert>
            <Button
              variant="outlined"
              component="label"
              startIcon={<UploadFileIcon />}
              fullWidth
              sx={{ py: 3, border: '2px dashed', borderColor: 'primary.main' }}
            >
              {packingListDialog.file ? packingListDialog.file.name : 'Seleccionar archivo'}
              <input
                type="file"
                hidden
                accept=".pdf,.xls,.xlsx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setPackingListDialog({ ...packingListDialog, file });
                  }
                }}
              />
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPackingListDialog({ ...packingListDialog, open: false })}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleUploadPackingList}
            disabled={!packingListDialog.file}
          >
            Subir
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de Gestión de Rutas */}
      <Dialog open={routesDialog} onClose={() => setRoutesDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <RouteIcon sx={{ mr: 1 }} />
              Rutas Marítimas
            </Box>
            <Button 
              variant="contained" 
              size="small"
              onClick={() => setNewRouteDialog({ ...newRouteDialog, open: true })}
            >
              + Nueva Ruta
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Código</TableCell>
                  <TableCell>Nombre</TableCell>
                  <TableCell>Origen</TableCell>
                  <TableCell>Escalas</TableCell>
                  <TableCell>Destino</TableCell>
                  <TableCell>Días Est.</TableCell>
                  <TableCell>Estado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {routes.map(route => (
                  <TableRow key={route.id}>
                    <TableCell><Chip size="small" label={route.code} /></TableCell>
                    <TableCell>{route.name}</TableCell>
                    <TableCell>{route.origin}</TableCell>
                    <TableCell>
                      {route.waypoints?.join(' → ') || '-'}
                    </TableCell>
                    <TableCell>{route.destination}</TableCell>
                    <TableCell>{route.estimated_days}</TableCell>
                    <TableCell>
                      <Chip 
                        size="small" 
                        label={route.is_active ? 'Activa' : 'Inactiva'}
                        color={route.is_active ? 'success' : 'default'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoutesDialog(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo Nueva Ruta */}
      <Dialog open={newRouteDialog.open} onClose={() => setNewRouteDialog({ ...newRouteDialog, open: false })} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <RouteIcon sx={{ mr: 1 }} />
            Nueva Ruta Marítima
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="Nombre de la Ruta"
              value={newRouteDialog.name}
              onChange={(e) => setNewRouteDialog({ ...newRouteDialog, name: e.target.value })}
              placeholder="Ej: China - El Paso - CDMX"
            />
            <TextField
              fullWidth
              label="Código"
              value={newRouteDialog.code}
              onChange={(e) => setNewRouteDialog({ ...newRouteDialog, code: e.target.value.toUpperCase() })}
              placeholder="Ej: CHN-ELP-MXC"
            />
            <TextField
              fullWidth
              label="Origen"
              value={newRouteDialog.origin}
              onChange={(e) => setNewRouteDialog({ ...newRouteDialog, origin: e.target.value })}
              placeholder="Ej: Shenzhen"
            />
            <TextField
              fullWidth
              label="Escalas (separadas por coma)"
              value={newRouteDialog.waypoints}
              onChange={(e) => setNewRouteDialog({ ...newRouteDialog, waypoints: e.target.value })}
              placeholder="Ej: Long Beach, El Paso"
              helperText="Puertos intermedios separados por coma"
            />
            <TextField
              fullWidth
              label="Destino Final"
              value={newRouteDialog.destination}
              onChange={(e) => setNewRouteDialog({ ...newRouteDialog, destination: e.target.value })}
              placeholder="Ej: CDMX"
            />
            <TextField
              fullWidth
              type="number"
              label="Días Estimados"
              value={newRouteDialog.estimatedDays}
              onChange={(e) => setNewRouteDialog({ ...newRouteDialog, estimatedDays: parseInt(e.target.value) || 0 })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewRouteDialog({ ...newRouteDialog, open: false })}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleCreateRoute}
            disabled={!newRouteDialog.name || !newRouteDialog.code || !newRouteDialog.destination}
          >
            Crear Ruta
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
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MaritimeConsolidationsPage;
