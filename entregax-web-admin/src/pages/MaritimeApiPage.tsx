// ============================================
// PANEL DE MONITOREO - API CHINA MARÍTIMO
// Sincronización y tracking en tiempo real
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
  InputAdornment,
  CircularProgress,
  Alert,
  Snackbar,
  Tabs,
  Tab,
  Card,
  CardContent,
  Tooltip,
  LinearProgress,
  Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SyncIcon from '@mui/icons-material/Sync';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DirectionsBoatIcon from '@mui/icons-material/DirectionsBoat';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HistoryIcon from '@mui/icons-material/History';
import TimelineIcon from '@mui/icons-material/Timeline';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface MaritimeOrder {
  id: number;
  china_id?: number | null;
  ordersn: string;
  user_id: number | null;
  shipping_mark: string;
  goods_type: string;
  goods_name: string;
  goods_num: number;
  weight: string;
  volume: string;
  status: string;
  needs_packing_list: boolean;
  packing_list_url: string | null;
  ship_number: string | null;
  bl_number?: string | null;
  container_number?: string | null;
  last_tracking_status: string | null;
  last_tracking_detail: string | null;
  last_tracking_date: string | null;
  created_at: string;
  updated_at: string;
  client_name?: string;
  client_email?: string;
  client_box_id?: string;
  tracking_count?: number;
}

interface TrackingLog {
  id: number;
  ordersn: string;
  detail: string;
  detail_en: string;
  track_date: string;
  status: string;
  ship_number: string;
  image_url: string;
}

interface SyncLog {
  id: number;
  sync_type: string;
  api_endpoint: string;
  request_params: any;
  response_status: number;
  records_processed: number;
  records_created: number;
  records_updated: number;
  error_message: string | null;
  started_at: string;
  finished_at: string;
  duration_ms: number;
}

interface Stats {
  total_orders: number;
  in_warehouse: number;
  in_transit: number;
  in_customs: number;
  delivered: number;
  unassigned: number;
  pending_packing_list: number;
  by_status?: { status: string; count: number | string }[];
  by_tracking_status?: { status: string; count: number | string }[];
}

interface Props {
  onBack: () => void;
}

// Diccionario de traducción chino -> español para mercancías
const CHINESE_TO_SPANISH: Record<string, string> = {
  // Tipos de carga
  '普货': 'Carga General',
  '敏感货': 'Carga Sensible',
  '特货': 'Carga Especial',
  '危险品': 'Mercancía Peligrosa',
  '液体': 'Líquidos',
  '粉末': 'Polvo',
  '带电': 'Con Batería',
  '纯电': 'Solo Batería',
  '内置电池': 'Batería Interna',
  '配套电池': 'Batería Incluida',
  
  // Productos comunes
  '外套': 'Abrigo/Chaqueta',
  '衣服': 'Ropa',
  '鞋子': 'Zapatos',
  '包包': 'Bolsos',
  '箱包': 'Equipaje',
  '电子产品': 'Electrónicos',
  '手机': 'Teléfonos',
  '配件': 'Accesorios',
  '玩具': 'Juguetes',
  '家具': 'Muebles',
  '家居': 'Artículos del Hogar',
  '厨房用品': 'Utensilios de Cocina',
  '化妆品': 'Cosméticos',
  '饰品': 'Joyería/Bisutería',
  '工具': 'Herramientas',
  '机械': 'Maquinaria',
  '汽配': 'Autopartes',
  '建材': 'Materiales de Construcción',
  '面料': 'Telas',
  '纺织品': 'Textiles',
  '食品': 'Alimentos',
  '医疗器械': 'Equipo Médico',
  '运动器材': 'Equipo Deportivo',
  '灯具': 'Iluminación',
  '五金': 'Ferretería',
  '塑料制品': 'Productos Plásticos',
  '金属制品': 'Productos Metálicos',
  '纸制品': 'Productos de Papel',
  '木制品': 'Productos de Madera',
  '陶瓷': 'Cerámica',
  '玻璃制品': 'Productos de Vidrio',
};

// Función para traducir texto chino a español
const translateChinese = (text: string): string => {
  if (!text) return text;
  
  let translated = text;
  
  // Reemplazar cada término chino encontrado
  for (const [chinese, spanish] of Object.entries(CHINESE_TO_SPANISH)) {
    translated = translated.replace(new RegExp(chinese, 'g'), spanish);
  }
  
  return translated;
};

const MaritimeApiPage: React.FC<Props> = ({ onBack }) => {
  const [tabValue, setTabValue] = useState(0);
  const [orders, setOrders] = useState<MaritimeOrder[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Filtros
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [trackingStatusFilter, setTrackingStatusFilter] = useState<string | null>(null);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Diálogos
  const [detailDialog, setDetailDialog] = useState<{ open: boolean; order: MaritimeOrder | null; tracking: TrackingLog[] }>({
    open: false,
    order: null,
    tracking: []
  });
  const [assignDialog, setAssignDialog] = useState<{ open: boolean; order: MaritimeOrder | null; boxId: string }>({
    open: false,
    order: null,
    boxId: ''
  });
  const [syncDialog, setSyncDialog] = useState<{ open: boolean; startTime: string; endTime: string }>({
    open: false,
    startTime: '',
    endTime: ''
  });

  const token = localStorage.getItem('token');

  // Cargar datos
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };

      // Cargar órdenes
      const ordersUrl = new URL(`${API_URL}/api/maritime-api/orders`);
      if (statusFilter) ordersUrl.searchParams.set('status', statusFilter);
      if (trackingStatusFilter) ordersUrl.searchParams.set('trackingStatus', trackingStatusFilter);
      if (unassignedOnly) ordersUrl.searchParams.set('unassigned', 'true');
      if (search.trim() !== '') ordersUrl.searchParams.set('search', search.trim());
      ordersUrl.searchParams.set('limit', '200');
      
      const ordersRes = await fetch(ordersUrl.toString(), { headers });
      const ordersData = await ordersRes.json();
      setOrders(ordersData.orders || []);

      // Cargar estadísticas
      const statsRes = await fetch(`${API_URL}/api/maritime-api/stats`, { headers });
      const statsData = await statsRes.json();
      setStats(statsData.stats || null);

      // Cargar logs de sincronización
      const logsRes = await fetch(`${API_URL}/api/maritime-api/sync/logs?limit=20`, { headers });
      const logsData = await logsRes.json();
      setSyncLogs(logsData.logs || []);

    } catch (error) {
      console.error('Error cargando datos:', error);
      setSnackbar({ open: true, message: 'Error al cargar datos', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, trackingStatusFilter, unassignedOnly, search]);

  // Debounce del input de búsqueda (350ms)
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sincronizar órdenes manualmente
  const handleSyncOrders = async (startTime?: string, endTime?: string) => {
    try {
      setSyncing(true);
      const res = await fetch(`${API_URL}/api/maritime-api/sync/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ startTime, endTime })
      });
      const data = await res.json();

      if (data.success) {
        setSnackbar({
          open: true,
          message: `Sincronización completada: ${data.data.ordersCreated} nuevas, ${data.data.ordersUpdated} actualizadas`,
          severity: 'success'
        });
        loadData();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message, severity: 'error' });
    } finally {
      setSyncing(false);
      setSyncDialog({ ...syncDialog, open: false });
    }
  };

  // Sincronizar tracking
  const handleSyncTracking = async (ordersn?: string) => {
    try {
      setSyncing(true);
      const res = await fetch(`${API_URL}/api/maritime-api/sync/tracking`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ordersn })
      });
      const data = await res.json();

      if (data.success) {
        setSnackbar({
          open: true,
          message: ordersn 
            ? `Tracking actualizado: ${data.data.logsAdded} registros` 
            : `Tracking actualizado para ${data.data.ordersUpdated} órdenes`,
          severity: 'success'
        });
        loadData();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message, severity: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  // Ver detalle de orden
  const handleViewDetail = async (order: MaritimeOrder) => {
    try {
      const res = await fetch(`${API_URL}/api/maritime-api/orders/${order.ordersn}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setDetailDialog({
        open: true,
        order: data.order,
        tracking: data.tracking || []
      });
    } catch (error) {
      setSnackbar({ open: true, message: 'Error al cargar detalle', severity: 'error' });
    }
  };

  // Refrescar tracking de una orden
  const handleRefreshTracking = async (ordersn: string) => {
    try {
      const res = await fetch(`${API_URL}/api/maritime-api/orders/${ordersn}/refresh`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setDetailDialog(prev => ({
          ...prev,
          order: data.order,
          tracking: data.tracking
        }));
        setSnackbar({ open: true, message: data.message, severity: 'success' });
        loadData();
      }
    } catch (error) {
      setSnackbar({ open: true, message: 'Error al refrescar tracking', severity: 'error' });
    }
  };

  // Asignar orden a cliente
  const handleAssignOrder = async () => {
    if (!assignDialog.order || !assignDialog.boxId) return;
    
    try {
      const res = await fetch(`${API_URL}/api/maritime-api/orders/${assignDialog.order.ordersn}/assign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ boxId: assignDialog.boxId })
      });
      const data = await res.json();

      if (data.success) {
        setSnackbar({ open: true, message: 'Orden asignada correctamente', severity: 'success' });
        setAssignDialog({ open: false, order: null, boxId: '' });
        loadData();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message, severity: 'error' });
    }
  };

  // Chip de estado interno con colores
  const getStatusChip = (status: string) => {
    const statusConfig: { [key: string]: { label: string; color: 'default' | 'warning' | 'info' | 'success' | 'primary' | 'error' } } = {
      'received_china': { label: 'Recibido CEDIS GZ CHINA', color: 'warning' },
      'in_transit': { label: 'En Tránsito', color: 'info' },
      'in_transit_mx': { label: 'En México', color: 'primary' },
      'customs_mx': { label: 'En Aduana', color: 'warning' },
      'customs_cleared': { label: 'Liberado', color: 'success' },
      'out_for_delivery': { label: 'En Reparto', color: 'primary' },
      'delivered': { label: 'Entregado', color: 'success' },
      'pending_api': { label: 'Pendiente API', color: 'default' },
      'cancelled': { label: 'Cancelado', color: 'error' },
      'returned': { label: 'Devuelto', color: 'error' },
      'unknown': { label: 'Desconocido', color: 'default' }
    };

    const config = statusConfig[status] || { label: status, color: 'default' };
    return <Chip size="small" label={config.label} color={config.color} />;
  };

  const getRawTrackingStatusChip = (status: string) => {
    const normalized = String(status || '').trim();
    const upper = normalized.toUpperCase();

    let color: 'default' | 'warning' | 'info' | 'success' | 'primary' | 'error' = 'default';
    if (upper.includes('DELIVERED')) color = 'success';
    else if (upper.includes('CUSTOMS') || upper.includes('CLEARANCE') || upper.includes('CLEARENCE')) color = 'warning';
    else if (upper.includes('VESSEL') || upper.includes('TRANSIT') || upper.includes('LOADED')) color = 'info';
    else if (upper.includes('WAREHOUSE') || upper.includes('SHIPMENT GENERATION')) color = 'warning';
    else if (upper.includes('DESTINATION PORT')) color = 'primary';

    return <Chip size="small" label={getRawTrackingStatusLabel(normalized)} color={color} />;
  };

  const getOrderStatusDisplay = (order: MaritimeOrder) => {
    if (order.last_tracking_status) {
      return getRawTrackingStatusChip(order.last_tracking_status);
    }
    return getStatusChip(order.status);
  };

  const getStatusFilterConfig = (status: string): { label: string; color: 'default' | 'warning' | 'info' | 'success' | 'primary' | 'error' } => {
    const map: Record<string, { label: string; color: 'default' | 'warning' | 'info' | 'success' | 'primary' | 'error' }> = {
      received_china: { label: 'En Bodega', color: 'warning' },
      in_transit: { label: 'En Tránsito', color: 'info' },
      in_transit_mx: { label: 'En México', color: 'primary' },
      customs_mx: { label: 'En Aduana', color: 'warning' },
      customs_cleared: { label: 'Liberado', color: 'success' },
      out_for_delivery: { label: 'En Reparto', color: 'primary' },
      delivered: { label: 'Entregados', color: 'success' },
      pending_api: { label: 'Pendiente API', color: 'default' },
      cancelled: { label: 'Cancelado', color: 'error' },
      returned: { label: 'Devuelto', color: 'error' },
      unknown: { label: 'Desconocido', color: 'default' }
    };
    return map[status] || { label: status, color: 'default' };
  };

  const getRawTrackingStatusLabel = (status: string): string => {
    const normalized = String(status || '').trim();
    const map: Record<string, string> = {
      'shipment generation': 'Generación de Envío',
      'goods in warehouse': 'En Bodega Origen',
      'goods out of warehouse': 'Salida de Bodega',
      'loaded into container': 'Cargado en Contenedor',
      'vessel on board': 'A Bordo del Buque',
      'arrival at destination port': 'Llegada a Puerto Destino',
      'customs clearance in process': 'Despacho Aduanal en Proceso',
      'import clearence finished': 'Despacho Aduanal Finalizado',
      'import clearance finished': 'Despacho Aduanal Finalizado',
      'delivered': 'Entregado'
    };
    return map[normalized.toLowerCase()] || normalized;
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={onBack} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <DirectionsBoatIcon sx={{ fontSize: 32, mr: 1, color: 'primary.main' }} />
        <Typography variant="h5" fontWeight="bold">
          API China - Marítimo (Zero Touch)
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant="outlined"
          startIcon={<SyncIcon />}
          onClick={() => setSyncDialog({ open: true, startTime: '', endTime: '' })}
          disabled={syncing}
          sx={{ mr: 1 }}
        >
          Sincronizar Órdenes
        </Button>
        <Button
          variant="contained"
          startIcon={syncing ? <CircularProgress size={20} /> : <RefreshIcon />}
          onClick={() => handleSyncTracking()}
          disabled={syncing}
        >
          Actualizar Tracking
        </Button>
      </Box>

      {/* Stats Cards - Paleta oficial: naranja, negro, blanco, rojo */}
      {stats && (() => {
        const ORANGE = '#FF6B35';
        const BLACK = '#1A1A1A';
        const WHITE = '#FFFFFF';
        const RED = '#E53935';
        const cards = [
          { label: 'En Bodega',   value: stats.in_warehouse, icon: <WarehouseIcon sx={{ fontSize: 36 }} />,        bg: ORANGE, fg: WHITE,  border: ORANGE },
          { label: 'En Tránsito', value: stats.in_transit,   icon: <LocalShippingIcon sx={{ fontSize: 36 }} />,    bg: BLACK,  fg: WHITE,  border: BLACK  },
          { label: 'En Aduana',   value: stats.in_customs,   icon: <AssignmentIndIcon sx={{ fontSize: 36 }} />,    bg: WHITE,  fg: BLACK,  border: BLACK  },
          { label: 'Entregados',  value: stats.delivered,    icon: <CheckCircleIcon sx={{ fontSize: 36 }} />,      bg: WHITE,  fg: ORANGE, border: ORANGE },
          { label: 'Sin Asignar', value: stats.unassigned,   icon: <ErrorIcon sx={{ fontSize: 36 }} />,            bg: RED,    fg: WHITE,  border: RED    },
          { label: 'Total',       value: stats.total_orders, icon: <DirectionsBoatIcon sx={{ fontSize: 36 }} />,   bg: BLACK,  fg: ORANGE, border: BLACK  },
        ];
        return (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(6, 1fr)' }, gap: 2, mb: 3 }}>
            {cards.map((c) => (
              <Card
                key={c.label}
                elevation={0}
                sx={{
                  bgcolor: c.bg,
                  color: c.fg,
                  border: `2px solid ${c.border}`,
                  borderRadius: 2,
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 6px 16px ${c.border}33` }
                }}
              >
                <CardContent sx={{ textAlign: 'center', py: 2.5, '&:last-child': { pb: 2.5 } }}>
                  <Box sx={{ color: c.fg, mb: 0.5 }}>{c.icon}</Box>
                  <Typography variant="h4" fontWeight={800} sx={{ color: c.fg, lineHeight: 1.1 }}>
                    {c.value}
                  </Typography>
                  <Typography variant="caption" sx={{ color: c.fg, opacity: 0.85, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {c.label}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        );
      })()}

      {/* Tabs */}
      <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ mb: 2 }}>
        <Tab label="Órdenes Marítimas" icon={<DirectionsBoatIcon />} iconPosition="start" />
        <Tab label="Historial Sincronización" icon={<HistoryIcon />} iconPosition="start" />
      </Tabs>

      {syncing && <LinearProgress sx={{ mb: 2 }} />}

      {/* Tab: Órdenes */}
      {tabValue === 0 && (
        <>
          {/* Buscador */}
          <Box sx={{ mb: 2 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Buscar por orden, ID, cliente, S####, buque, BL, contenedor, mercancía…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#FF6B35' }} />
                  </InputAdornment>
                ),
                endAdornment: searchInput ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchInput('')}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
                sx: {
                  bgcolor: '#FFFFFF',
                  borderRadius: 2,
                  '& fieldset': { borderColor: '#1A1A1A' },
                  '&:hover fieldset': { borderColor: '#FF6B35' },
                  '&.Mui-focused fieldset': { borderColor: '#FF6B35', borderWidth: 2 }
                }
              }}
            />
          </Box>

          {/* Filtros */}
          <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              label="Todas"
              color={!statusFilter && !trackingStatusFilter && !unassignedOnly ? 'primary' : 'default'}
              onClick={() => { setStatusFilter(null); setTrackingStatusFilter(null); setUnassignedOnly(false); }}
            />
            <Chip
              label="Sin Asignar"
              color={unassignedOnly ? 'error' : 'default'}
              onClick={() => { setUnassignedOnly(!unassignedOnly); setStatusFilter(null); setTrackingStatusFilter(null); }}
            />
            {(stats?.by_status || []).map((s) => {
              const cfg = getStatusFilterConfig(s.status);
              const count = Number(s.count || 0);
              return (
                <Chip
                  key={s.status}
                  label={`${cfg.label} (${count})`}
                  color={statusFilter === s.status ? cfg.color : 'default'}
                  onClick={() => { setStatusFilter(s.status); setTrackingStatusFilter(null); setUnassignedOnly(false); }}
                />
              );
            })}
          </Box>

          {!!(stats?.by_tracking_status && stats.by_tracking_status.length > 0) && (
            <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {(stats.by_tracking_status || []).map((s) => {
                const count = Number(s.count || 0);
                return (
                  <Chip
                    key={`raw-${s.status}`}
                    label={`${getRawTrackingStatusLabel(s.status)} (${count})`}
                    color={trackingStatusFilter === s.status ? 'secondary' : 'default'}
                    onClick={() => { setTrackingStatusFilter(s.status); setStatusFilter(null); setUnassignedOnly(false); }}
                    variant={trackingStatusFilter === s.status ? 'filled' : 'outlined'}
                  />
                );
              })}
            </Box>
          )}

          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Orden</TableCell>
                  <TableCell>Cliente</TableCell>
                  <TableCell>Mercancía</TableCell>
                  <TableCell align="center">Bultos</TableCell>
                  <TableCell align="right">Peso/Vol</TableCell>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Buque / BL</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell align="center">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                ) : orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No hay órdenes</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((order) => (
                    <TableRow key={order.id} hover>
                      <TableCell>
                        <Typography fontSize="0.8rem" fontWeight="bold" sx={{ color: '#FF6B35' }}>
                          {order.china_id ?? '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography fontWeight="bold" fontSize="0.85rem">{order.ordersn}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {order.shipping_mark}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {order.client_name ? (
                          <>
                            <Typography fontSize="0.85rem">{order.client_name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {order.client_box_id}
                            </Typography>
                          </>
                        ) : (
                          <Chip size="small" label="Sin asignar" color="error" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography fontSize="0.85rem">{translateChinese(order.goods_name)}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {translateChinese(order.goods_type)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">{order.goods_num}</TableCell>
                      <TableCell align="right">
                        <Typography fontSize="0.85rem">{order.weight} kg</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {order.volume} m³
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography fontSize="0.8rem">
                          {new Date(order.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(order.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {order.ship_number ? (
                          <>
                            <Typography fontSize="0.8rem" fontWeight="bold">{order.ship_number}</Typography>
                            {order.bl_number && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                BL: {order.bl_number}
                              </Typography>
                            )}
                            {!order.bl_number && order.container_number && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                {order.container_number}
                              </Typography>
                            )}
                          </>
                        ) : order.bl_number ? (
                          <>
                            <Typography fontSize="0.8rem" fontWeight="bold">BL: {order.bl_number}</Typography>
                            {order.container_number && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                {order.container_number}
                              </Typography>
                            )}
                          </>
                        ) : (
                          <Typography variant="caption" color="text.secondary">-</Typography>
                        )}
                      </TableCell>
                      <TableCell>{getOrderStatusDisplay(order)}</TableCell>
                      <TableCell align="center">
                        <Tooltip title="Ver detalle">
                          <IconButton size="small" onClick={() => handleViewDetail(order)}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {!order.user_id && (
                          <Tooltip title="Asignar cliente">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setAssignDialog({ open: true, order, boxId: order.shipping_mark.split('+')[0] })}
                            >
                              <AssignmentIndIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Refrescar tracking">
                          <IconButton size="small" color="primary" onClick={() => handleSyncTracking(order.ordersn)}>
                            <RefreshIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Tab: Historial de Sincronización */}
      {tabValue === 1 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Tipo</TableCell>
                <TableCell>Inicio</TableCell>
                <TableCell>Duración</TableCell>
                <TableCell align="center">Procesados</TableCell>
                <TableCell align="center">Creados</TableCell>
                <TableCell align="center">Actualizados</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {syncLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <Chip
                      size="small"
                      label={log.sync_type === 'order_list' ? 'Órdenes' : 'Tracking'}
                      color={log.sync_type === 'order_list' ? 'primary' : 'secondary'}
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(log.started_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : '-'}
                  </TableCell>
                  <TableCell align="center">{log.records_processed}</TableCell>
                  <TableCell align="center">{log.records_created}</TableCell>
                  <TableCell align="center">{log.records_updated}</TableCell>
                  <TableCell>
                    {log.response_status === 200 ? (
                      <Chip size="small" label="OK" color="success" />
                    ) : (
                      <Tooltip title={log.error_message || 'Error desconocido'}>
                        <Chip size="small" label="Error" color="error" />
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Dialog: Detalle de Orden */}
      <Dialog open={detailDialog.open} onClose={() => setDetailDialog({ open: false, order: null, tracking: [] })} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DirectionsBoatIcon color="primary" />
          Detalle de Orden: {detailDialog.order?.ordersn}
          <Box sx={{ flexGrow: 1 }} />
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => detailDialog.order && handleRefreshTracking(detailDialog.order.ordersn)}
          >
            Actualizar
          </Button>
        </DialogTitle>
        <DialogContent>
          {detailDialog.order && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2, mb: 3 }}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary">Información General</Typography>
                  <Divider sx={{ my: 1 }} />
                  <Typography><b>Orden:</b> {detailDialog.order.ordersn}</Typography>
                  <Typography><b>Shipping Mark:</b> {detailDialog.order.shipping_mark}</Typography>
                  <Typography><b>Mercancía:</b> {translateChinese(detailDialog.order.goods_name)} ({translateChinese(detailDialog.order.goods_type)})</Typography>
                  <Typography><b>Bultos:</b> {detailDialog.order.goods_num}</Typography>
                  <Typography><b>Peso:</b> {detailDialog.order.weight} kg</Typography>
                  <Typography><b>Volumen:</b> {detailDialog.order.volume} m³</Typography>
                  <Typography><b>Barco:</b> {detailDialog.order.ship_number || 'N/A'}</Typography>
                </Paper>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary">Cliente</Typography>
                  <Divider sx={{ my: 1 }} />
                  {detailDialog.order.client_name ? (
                    <>
                      <Typography><b>Nombre:</b> {detailDialog.order.client_name}</Typography>
                      <Typography><b>Box ID:</b> {detailDialog.order.client_box_id}</Typography>
                      <Typography><b>Email:</b> {detailDialog.order.client_email}</Typography>
                    </>
                  ) : (
                    <Alert severity="warning" sx={{ mt: 1 }}>
                      Cliente no asignado
                    </Alert>
                  )}
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" color="text.secondary">Estado Actual</Typography>
                  <Box sx={{ mt: 1 }}>
                    {getOrderStatusDisplay(detailDialog.order)}
                  </Box>
                  {detailDialog.order.last_tracking_detail && (
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      {detailDialog.order.last_tracking_detail}
                    </Typography>
                  )}
                </Paper>
              </Box>

              <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <TimelineIcon color="primary" />
                Historial de Tracking ({detailDialog.tracking.length} registros)
              </Typography>
              
              <Paper sx={{ maxHeight: 300, overflow: 'auto' }}>
                {detailDialog.tracking.length === 0 ? (
                  <Box sx={{ p: 3, textAlign: 'center' }}>
                    <Typography color="text.secondary">No hay registros de tracking</Typography>
                  </Box>
                ) : (
                  <Box sx={{ p: 2 }}>
                    {detailDialog.tracking.map((log, index) => (
                      <Box key={log.id} sx={{ display: 'flex', mb: 2 }}>
                        <Box sx={{ 
                          width: 12, 
                          height: 12, 
                          borderRadius: '50%', 
                          bgcolor: index === 0 ? 'primary.main' : 'grey.400',
                          mt: 0.5,
                          mr: 2,
                          flexShrink: 0
                        }} />
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography variant="body2" fontWeight="bold">
                            {log.status}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {log.detail}
                          </Typography>
                          {log.detail_en && (
                            <Typography variant="caption" color="text.disabled">
                              {log.detail_en}
                            </Typography>
                          )}
                          <Typography variant="caption" display="block" color="text.secondary">
                            <ScheduleIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />
                            {new Date(log.track_date).toLocaleString()}
                            {log.ship_number && ` • Barco: ${log.ship_number}`}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}
              </Paper>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialog({ open: false, order: null, tracking: [] })}>
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Asignar Cliente */}
      <Dialog open={assignDialog.open} onClose={() => setAssignDialog({ open: false, order: null, boxId: '' })}>
        <DialogTitle>Asignar Cliente a Orden</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Orden: <b>{assignDialog.order?.ordersn}</b>
          </Typography>
          <TextField
            label="Box ID del Cliente"
            value={assignDialog.boxId}
            onChange={(e) => setAssignDialog({ ...assignDialog, boxId: e.target.value })}
            fullWidth
            placeholder="Ej: S873"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignDialog({ open: false, order: null, boxId: '' })}>Cancelar</Button>
          <Button variant="contained" onClick={handleAssignOrder}>Asignar</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Sincronización con fechas */}
      <Dialog open={syncDialog.open} onClose={() => setSyncDialog({ ...syncDialog, open: false })}>
        <DialogTitle>Sincronizar Órdenes de China</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Deja vacío para sincronizar las últimas 24 horas, o especifica un rango de fechas.
          </Typography>
          <TextField
            label="Fecha Inicio"
            type="datetime-local"
            value={syncDialog.startTime}
            onChange={(e) => setSyncDialog({ ...syncDialog, startTime: e.target.value })}
            fullWidth
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Fecha Fin"
            type="datetime-local"
            value={syncDialog.endTime}
            onChange={(e) => setSyncDialog({ ...syncDialog, endTime: e.target.value })}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSyncDialog({ ...syncDialog, open: false })}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={() => handleSyncOrders(syncDialog.startTime || undefined, syncDialog.endTime || undefined)}
            disabled={syncing}
          >
            {syncing ? <CircularProgress size={20} /> : 'Sincronizar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MaritimeApiPage;
