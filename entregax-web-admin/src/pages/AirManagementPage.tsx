// ============================================
// GESTIÓN AÉREA - GUÍAS HIJAS ENTREGAX
// Muestra todas las guías aéreas hijas (no master)
// que llegan desde el API aéreo de China
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
  TextField,
  CircularProgress,
  Alert,
  Snackbar,
  Tabs,
  Tab,
  Card,
  CardContent,
  Grid,
  InputAdornment,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  TablePagination,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import FlightIcon from '@mui/icons-material/Flight';
import SearchIcon from '@mui/icons-material/Search';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InventoryIcon from '@mui/icons-material/Inventory';
import GavelIcon from '@mui/icons-material/Gavel';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface AirGuide {
  id: number;
  tracking_internal: string;
  tracking_provider: string | null;
  child_no: string | null;
  description: string | null;
  weight: number | null;
  pkg_length: number | null;
  pkg_width: number | null;
  pkg_height: number | null;
  single_volume: number | null;
  single_cbm: number | null;
  international_tracking: string | null;
  status: string;
  etd: string | null;
  eta: string | null;
  created_at: string;
  updated_at: string;
  user_id: number | null;
  box_number: number | null;
  total_boxes: number | null;
  assigned_cost_mxn: number | null;
  client_paid: boolean;
  master_id: number | null;
  china_receipt_id: number | null;
  pro_name: string | null;
  customs_bno: string | null;
  client_name: string;
  client_box_id: string;
  receipt_fno: string | null;
  shipping_mark: string | null;
  // Campos de precio aéreo
  air_sale_price: number | null;
  air_price_per_kg: number | null;
  air_tariff_type: string | null;
  air_is_custom_tariff: boolean | null;
}

interface Stats {
  byStatus: { status: string; count: string }[];
  byAwb: { awb: string; count: string }[];
  totalGuides: number;
  unassigned: number;
}

interface Props {
  onBack: () => void;
}

const STATUS_LABEL_MAP: Record<string, string> = {
  'received_origin': 'En Bodega China',
  'received_china': 'Recibido China',
  'in_transit': 'En Tránsito',
  'at_customs': 'En Aduana',
  'in_transit_mx': 'En Ruta Cedis México',
  'received_cedis': 'En CEDIS',
  'in_transit_mty': 'EN TRÁNSITO A MTY, N.L.',
  'processing': 'Procesando - Guía impresa',
  'customs': 'Procesando - Guía impresa',
  'out_for_delivery': 'EN RUTA',
  'shipped': 'ENVIADO',
  'ready_pickup': 'Listo Recoger',
  'delivered': 'Entregado',
};

const AirManagementPage: React.FC<Props> = ({ onBack }) => {
  const [guides, setGuides] = useState<AirGuide[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [dynamicStatusFilters, setDynamicStatusFilters] = useState<Array<{ status: string; count: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [total, setTotal] = useState(0);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [detailDialog, setDetailDialog] = useState<{ open: boolean; guide: AirGuide | null }>({
    open: false,
    guide: null,
  });

  const token = localStorage.getItem('token');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };

      // Load guides
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      params.set('limit', String(rowsPerPage));
      params.set('offset', String(page * rowsPerPage));

      const guidesRes = await fetch(`${API_URL}/api/china/air-guides?${params}`, { headers });
      const guidesData = await guidesRes.json();

      if (guidesData.success) {
        setGuides(guidesData.guides || []);
        setTotal(guidesData.total || 0);
      }

      // Load stats
      const statsRes = await fetch(`${API_URL}/api/china/air-guides/stats`, { headers });
      const statsData = await statsRes.json();
      if (statsData.success) {
        setStats(statsData.stats || null);
        // Guardar dinámicamente los status del backend
        if (statsData.stats?.byStatus) {
          setDynamicStatusFilters(statsData.stats.byStatus);
        }
      }
    } catch (error) {
      console.error('Error cargando guías aéreas:', error);
      setSnackbar({ open: true, message: 'Error al cargar datos', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, search, page, rowsPerPage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getStatusChip = (status: string) => {
    const statusConfig: Record<string, { label: string; color: 'default' | 'warning' | 'info' | 'success' | 'primary' | 'error' | 'secondary' }> = {
      'received_china': { label: '📦 Recibido China', color: 'warning' },
      'received_origin': { label: '🏭 En Bodega China', color: 'warning' },
      'in_transit': { label: '✈️ En Tránsito', color: 'info' },
      'at_customs': { label: '🛃 En Aduana', color: 'secondary' },
      'customs': { label: '📋 Procesando - Guía impresa', color: 'warning' },
      'processing': { label: '📋 Procesando - Guía impresa', color: 'warning' },
      'in_transit_mx': { label: '🚛 En Ruta Cedis México', color: 'info' },
      'received_cedis': { label: '📍 En CEDIS', color: 'primary' },
      'in_transit_mty': { label: '🚚 EN TRÁNSITO A MTY, N.L.', color: 'info' },
      'out_for_delivery': { label: '🛣️ EN RUTA', color: 'success' },
      'shipped': { label: '📤 ENVIADO', color: 'default' },
      'ready_pickup': { label: '✅ Listo Recoger', color: 'success' },
      'delivered': { label: '🎉 Entregado', color: 'success' },
      'cancelled': { label: '❌ Cancelado', color: 'error' },
    };
    const config = statusConfig[status] || { label: status, color: 'default' };
    return <Chip size="small" label={config.label} color={config.color} variant="filled" />;
  };

  const getStatusCount = (statusKey: string) => {
    if (!stats?.byStatus) return 0;
    const found = stats.byStatus.find(s => s.status === statusKey);
    return found ? parseInt(found.count) : 0;
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatWeight = (w: number | null) => {
    if (!w) return '-';
    return `${parseFloat(String(w)).toFixed(2)} kg`;
  };

  const formatDimensions = (guide: AirGuide) => {
    if (!guide.pkg_length || !guide.pkg_width || !guide.pkg_height) return '-';
    return `${guide.pkg_length}×${guide.pkg_width}×${guide.pkg_height} cm`;
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={onBack} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <FlightIcon sx={{ fontSize: 32, mr: 1, color: '#E53935' }} />
        <Box>
          <Typography variant="h5" fontWeight="bold">
            Gestión Aérea - Guías EntregaX
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Todas las guías hijas procesadas por el sistema aéreo
          </Typography>
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
          onClick={() => loadData()}
          disabled={loading}
          sx={{ bgcolor: '#E53935', '&:hover': { bgcolor: '#C62828' } }}
        >
          Actualizar
        </Button>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card sx={{ bgcolor: '#fff3e0', border: '1px solid #ffe0b2' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <WarehouseIcon sx={{ fontSize: 28, color: '#e65100' }} />
              <Typography variant="h4" fontWeight="bold">{getStatusCount('received_china')}</Typography>
              <Typography variant="caption">Recibido China</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card sx={{ bgcolor: '#e3f2fd', border: '1px solid #bbdefb' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <FlightTakeoffIcon sx={{ fontSize: 28, color: '#1565c0' }} />
              <Typography variant="h4" fontWeight="bold">{getStatusCount('in_transit')}</Typography>
              <Typography variant="caption">En Tránsito</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card sx={{ bgcolor: '#fce4ec', border: '1px solid #f8bbd0' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <GavelIcon sx={{ fontSize: 28, color: '#880e4f' }} />
              <Typography variant="h4" fontWeight="bold">{getStatusCount('at_customs')}</Typography>
              <Typography variant="caption">En Aduana</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card sx={{ bgcolor: '#e8f5e9', border: '1px solid #c8e6c9' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <CheckCircleIcon sx={{ fontSize: 28, color: '#2e7d32' }} />
              <Typography variant="h4" fontWeight="bold">{getStatusCount('delivered')}</Typography>
              <Typography variant="caption">Entregados</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card sx={{ bgcolor: '#fff8e1', border: '1px solid #fff9c4' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <ErrorOutlineIcon sx={{ fontSize: 28, color: '#f57f17' }} />
              <Typography variant="h4" fontWeight="bold">{stats?.unassigned || 0}</Typography>
              <Typography variant="caption">Sin Asignar</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card sx={{ bgcolor: '#263238', color: '#fff' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <InventoryIcon sx={{ fontSize: 28, color: '#fff' }} />
              <Typography variant="h4" fontWeight="bold">{stats?.totalGuides || 0}</Typography>
              <Typography variant="caption" sx={{ color: '#ccc' }}>Total Guías</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Buscar por tracking, FNO, cliente..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 300 }}
          />
          <Divider orientation="vertical" flexItem />
          <Tabs
            value={statusFilter}
            onChange={(_, val) => { setStatusFilter(val); setPage(0); }}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ '& .MuiTab-root': { minWidth: 'auto', px: 2, py: 1, fontSize: '0.8rem' } }}
          >
            <Tab label="Todas" value="all" />
            {dynamicStatusFilters.map(sf => (
              <Tab 
                key={sf.status} 
                label={`${STATUS_LABEL_MAP[sf.status] || sf.status} (${sf.count})`} 
                value={sf.status} 
              />
            ))}
          </Tabs>
        </Box>
      </Paper>

      {/* Loading */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Table */}
      {!loading && (
        <Paper sx={{ overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: 600 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#263238', color: '#fff' }}>TRACKING</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#263238', color: '#fff' }}>CLIENTE</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#263238', color: '#fff' }}>AWB</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#263238', color: '#fff' }}>PRODUCTO</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#263238', color: '#fff' }}>PESO</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#263238', color: '#fff' }}>CBM</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#263238', color: '#fff' }}>ESTADO</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#263238', color: '#fff' }}>COSTO</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#263238', color: '#fff' }}>FECHA</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', bgcolor: '#263238', color: '#fff' }}>ACCIONES</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {guides.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No se encontraron guías aéreas</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  guides.map((guide) => (
                    <TableRow key={guide.id} hover sx={{ '&:hover': { bgcolor: '#fafafa' } }}>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold" color="primary">
                          {guide.child_no || guide.tracking_internal || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="500">
                          {guide.client_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {guide.client_box_id || guide.shipping_mark || ''}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {guide.international_tracking || <Chip size="small" label="Sin AWB" color="error" variant="outlined" />}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {guide.pro_name || guide.description || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{formatWeight(guide.weight)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {guide.single_cbm ? parseFloat(String(guide.single_cbm)).toFixed(4) : '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>{getStatusChip(guide.status)}</TableCell>
                      <TableCell>
                        {guide.air_sale_price ? (
                          <Tooltip title={`$${parseFloat(String(guide.air_price_per_kg || 0)).toFixed(2)}/kg | Tipo: ${guide.air_tariff_type || '-'}${guide.air_is_custom_tariff ? ' ⭐' : ''}`}>
                            <Typography variant="body2" fontWeight="bold" color={guide.client_paid ? 'success.main' : 'text.primary'}>
                              ${parseFloat(String(guide.air_sale_price)).toFixed(2)}
                              {guide.air_is_custom_tariff && <span style={{ marginLeft: 4 }}>⭐</span>}
                              {guide.client_paid && <CheckCircleIcon sx={{ fontSize: 14, ml: 0.5, color: 'success.main' }} />}
                            </Typography>
                          </Tooltip>
                        ) : guide.assigned_cost_mxn ? (
                          <Typography variant="body2" fontWeight="bold" color={guide.client_paid ? 'success.main' : 'warning.main'}>
                            ${parseFloat(String(guide.assigned_cost_mxn)).toFixed(2)}
                            {guide.client_paid && <CheckCircleIcon sx={{ fontSize: 14, ml: 0.5, color: 'success.main' }} />}
                          </Typography>
                        ) : (
                          <Typography variant="caption" color="text.secondary">-</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">{formatDate(guide.created_at)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Tooltip title="Ver detalle">
                          <IconButton size="small" onClick={() => setDetailDialog({ open: true, guide })}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[25, 50, 100]}
            labelRowsPerPage="Guías por página:"
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
          />
        </Paper>
      )}

      {/* AWB Summary */}
      {stats?.byAwb && stats.byAwb.length > 0 && (
        <Paper sx={{ p: 2, mt: 3 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            📦 Distribución por Guía Aérea (AWB)
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {stats.byAwb.map((a) => (
              <Chip
                key={a.awb}
                label={`${a.awb}: ${a.count} guías`}
                variant="outlined"
                color={a.awb === 'Sin AWB' ? 'error' : 'primary'}
                size="small"
                onClick={() => {
                  if (a.awb !== 'Sin AWB') {
                    setSearch(a.awb);
                    setPage(0);
                  }
                }}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Box>
        </Paper>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailDialog.open} onClose={() => setDetailDialog({ open: false, guide: null })} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: '#263238', color: '#fff' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FlightIcon />
            Detalle de Guía Aérea
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {detailDialog.guide && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary">Tracking Interno</Typography>
                <Typography variant="body1" fontWeight="bold">{detailDialog.guide.child_no || detailDialog.guide.tracking_internal || '-'}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary">Child No</Typography>
                <Typography variant="body1">{detailDialog.guide.child_no || '-'}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary">FNO (Recepción)</Typography>
                <Typography variant="body1">{detailDialog.guide.receipt_fno || '-'}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary">Shipping Mark</Typography>
                <Typography variant="body1">{detailDialog.guide.shipping_mark || '-'}</Typography>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Divider sx={{ my: 1 }} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary">Cliente</Typography>
                <Typography variant="body1" fontWeight="bold">{detailDialog.guide.client_name}</Typography>
                <Typography variant="caption" color="text.secondary">{detailDialog.guide.client_box_id}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary">AWB (Guía Aérea)</Typography>
                <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                  {detailDialog.guide.international_tracking || 'Sin asignar'}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Divider sx={{ my: 1 }} />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="subtitle2" color="text.secondary">Peso</Typography>
                <Typography variant="body1">{formatWeight(detailDialog.guide.weight)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="subtitle2" color="text.secondary">Dimensiones</Typography>
                <Typography variant="body1">{formatDimensions(detailDialog.guide)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="subtitle2" color="text.secondary">CBM</Typography>
                <Typography variant="body1">
                  {detailDialog.guide.single_cbm ? parseFloat(String(detailDialog.guide.single_cbm)).toFixed(4) : '-'}
                </Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="subtitle2" color="text.secondary">Volumen</Typography>
                <Typography variant="body1">
                  {detailDialog.guide.single_volume ? parseFloat(String(detailDialog.guide.single_volume)).toFixed(4) : '-'}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Divider sx={{ my: 1 }} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary">Producto</Typography>
                <Typography variant="body1">{detailDialog.guide.pro_name || detailDialog.guide.description || '-'}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary">Código Aduanal</Typography>
                <Typography variant="body1">{detailDialog.guide.customs_bno || '-'}</Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="subtitle2" color="text.secondary">ETD</Typography>
                <Typography variant="body1">{formatDate(detailDialog.guide.etd)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="subtitle2" color="text.secondary">ETA</Typography>
                <Typography variant="body1">{formatDate(detailDialog.guide.eta)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="subtitle2" color="text.secondary">Estado</Typography>
                {getStatusChip(detailDialog.guide.status)}
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="subtitle2" color="text.secondary">Costo MXN</Typography>
                <Typography variant="body1" fontWeight="bold" color={detailDialog.guide.client_paid ? 'success.main' : 'warning.main'}>
                  {detailDialog.guide.assigned_cost_mxn 
                    ? `$${parseFloat(String(detailDialog.guide.assigned_cost_mxn)).toFixed(2)}`
                    : 'Sin costear'
                  }
                  {detailDialog.guide.client_paid && ' ✅ Pagado'}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Divider sx={{ my: 1 }} />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="subtitle2" color="text.secondary">Caja #{detailDialog.guide.box_number || '-'}</Typography>
                <Typography variant="body1">de {detailDialog.guide.total_boxes || '-'} totales</Typography>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="subtitle2" color="text.secondary">Creado</Typography>
                <Typography variant="body1">{formatDate(detailDialog.guide.created_at)}</Typography>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialog({ open: false, guide: null })}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AirManagementPage;
