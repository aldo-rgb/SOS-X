// ============================================
// PANEL DE MONITOREO - API CHINA AÉREO (TDI)
// Recepciones y tracking en tiempo real
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
  Tabs,
  Tab,
  Card,
  CardContent,
  Tooltip,
  LinearProgress,
  Divider,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SyncIcon from '@mui/icons-material/Sync';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import FlightIcon from '@mui/icons-material/Flight';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import AddIcon from '@mui/icons-material/Add';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import InventoryIcon from '@mui/icons-material/Inventory';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import SearchIcon from '@mui/icons-material/Search';
import ImageIcon from '@mui/icons-material/Image';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ChinaReceipt {
  id: number;
  fno: string;
  user_id: number | null;
  shipping_mark: string;
  total_qty: number;
  total_weight: number;
  total_volume: number;
  total_cbm: number;
  evidence_urls: string[] | null;
  international_tracking: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  client_name?: string;
  client_box_id?: string;
  client_email?: string;
  package_count?: number;
}

interface ChinaPackage {
  id: number;
  tracking_internal: string;
  child_no: string;
  weight: number;
  dimensions: string;
  pro_name: string;
  customs_bno: string;
  trajectory_name: string;
  single_volume: number;
  single_cbm: number;
  international_tracking: string | null;
  etd: string | null;
  eta: string | null;
  status: string;
  created_at: string;
}

interface Stats {
  byStatus: { status: string; count: string }[];
  todayPackages: number;
  unassignedReceipts: number;
  pendingBillNo: number;
}

interface Props {
  onBack: () => void;
}

const AirApiPage: React.FC<Props> = ({ onBack }) => {
  const [tabValue, setTabValue] = useState(0);
  const [receipts, setReceipts] = useState<ChinaReceipt[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Filtros
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  // Diálogos
  const [detailDialog, setDetailDialog] = useState<{ 
    open: boolean; 
    receipt: ChinaReceipt | null; 
    packages: ChinaPackage[] 
  }>({
    open: false,
    receipt: null,
    packages: []
  });
  const [assignDialog, setAssignDialog] = useState<{ 
    open: boolean; 
    receipt: ChinaReceipt | null; 
    userId: string 
  }>({
    open: false,
    receipt: null,
    userId: ''
  });
  const [createDialog, setCreateDialog] = useState<{
    open: boolean;
    form: {
      fno: string;
      shipping_mark: string;
      total_qty: string;
      total_weight: string;
      total_cbm: string;
      notes: string;
    };
  }>({
    open: false,
    form: { fno: '', shipping_mark: '', total_qty: '1', total_weight: '', total_cbm: '', notes: '' }
  });
  const [updateStatusDialog, setUpdateStatusDialog] = useState<{
    open: boolean;
    receipt: ChinaReceipt | null;
    status: string;
    notes: string;
    internationalTracking: string;
  }>({
    open: false,
    receipt: null,
    status: '',
    notes: '',
    internationalTracking: ''
  });

  // Dialog de rastreo de guía MJCustomer
  const [trackDialog, setTrackDialog] = useState<{
    open: boolean;
    fno: string;
    loading: boolean;
    error: string | null;
    result: any | null;
  }>({
    open: false,
    fno: '',
    loading: false,
    error: null,
    result: null
  });

  const token = localStorage.getItem('token');

  // Sincronizar con MoJie API
  const syncWithMoJie = useCallback(async () => {
    try {
      setSyncing(true);
      const headers = { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      // Obtener recepciones activas para sincronizar
      const activeReceipts = receipts.filter(r => 
        r.status && !['delivered', 'cancelled'].includes(r.status)
      );

      if (activeReceipts.length === 0) {
        setSnackbar({ open: true, message: 'No hay recepciones activas para sincronizar', severity: 'success' });
        return;
      }

      // Sincronizar en batch
      const orderCodes = activeReceipts.map(r => r.fno).filter(Boolean);
      
      const syncRes = await fetch(`${API_URL}/api/china/pull-batch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ orderCodes })
      });

      const syncData = await syncRes.json();

      if (syncData.success) {
        setSnackbar({ 
          open: true, 
          message: `✅ Sincronizado: ${syncData.results?.filter((r: any) => r.success).length || 0} órdenes actualizadas`, 
          severity: 'success' 
        });
      } else {
        setSnackbar({ open: true, message: syncData.error || 'Error en sincronización', severity: 'error' });
      }
    } catch (error: any) {
      console.error('Error sincronizando con MoJie:', error);
      setSnackbar({ open: true, message: 'Error de conexión con MoJie API', severity: 'error' });
    } finally {
      setSyncing(false);
    }
  }, [token, receipts]);

  // Cargar datos y opcionalmente sincronizar
  const loadData = useCallback(async (shouldSync = false) => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };

      // Cargar recepciones
      const receiptsUrl = new URL(`${API_URL}/api/china/receipts`);
      if (statusFilter) receiptsUrl.searchParams.set('status', statusFilter);
      
      const receiptsRes = await fetch(receiptsUrl.toString(), { headers });
      const receiptsData = await receiptsRes.json();
      
      let filteredReceipts = receiptsData.receipts || [];
      if (unassignedOnly) {
        filteredReceipts = filteredReceipts.filter((r: ChinaReceipt) => !r.user_id);
      }
      setReceipts(filteredReceipts);

      // Cargar estadísticas
      const statsRes = await fetch(`${API_URL}/api/china/stats`, { headers });
      const statsData = await statsRes.json();
      setStats(statsData.stats || null);

    } catch (error) {
      console.error('Error cargando datos:', error);
      setSnackbar({ open: true, message: 'Error al cargar datos', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, unassignedOnly]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Ver detalle de recepción
  const handleViewDetail = async (receipt: ChinaReceipt) => {
    try {
      const res = await fetch(`${API_URL}/api/china/receipts/${receipt.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setDetailDialog({
        open: true,
        receipt: data.receipt,
        packages: data.packages || []
      });
    } catch (error) {
      setSnackbar({ open: true, message: 'Error al cargar detalle', severity: 'error' });
    }
  };

  // Crear recepción manual
  const handleCreateReceipt = async () => {
    try {
      setSyncing(true);
      const res = await fetch(`${API_URL}/api/china/receipts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fno: createDialog.form.fno,
          shipping_mark: createDialog.form.shipping_mark,
          total_qty: parseInt(createDialog.form.total_qty) || 1,
          total_weight: parseFloat(createDialog.form.total_weight) || 0,
          total_cbm: parseFloat(createDialog.form.total_cbm) || 0,
          notes: createDialog.form.notes || 'Captura manual desde panel'
        })
      });
      const data = await res.json();

      if (data.success) {
        setSnackbar({ open: true, message: 'Recepción creada correctamente', severity: 'success' });
        setCreateDialog({ 
          open: false, 
          form: { fno: '', shipping_mark: '', total_qty: '1', total_weight: '', total_cbm: '', notes: '' } 
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

  // Actualizar estado de recepción
  const handleUpdateStatus = async () => {
    if (!updateStatusDialog.receipt) return;
    
    try {
      setSyncing(true);
      const res = await fetch(`${API_URL}/api/china/receipts/${updateStatusDialog.receipt.id}/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: updateStatusDialog.status || undefined,
          notes: updateStatusDialog.notes || undefined,
          internationalTracking: updateStatusDialog.internationalTracking || undefined
        })
      });
      const data = await res.json();

      if (data.success) {
        setSnackbar({ open: true, message: 'Estado actualizado', severity: 'success' });
        setUpdateStatusDialog({ open: false, receipt: null, status: '', notes: '', internationalTracking: '' });
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

  // Rastrear guía en MJCustomer API (solo informativo, no guarda en BD)
  const handleTrackFNO = async () => {
    if (!trackDialog.fno.trim()) return;
    
    setTrackDialog(prev => ({ ...prev, loading: true, error: null, result: null }));
    
    try {
      // Usar endpoint /track que solo consulta sin insertar en BD
      const res = await fetch(`${API_URL}/api/china/track/${trackDialog.fno.trim()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (data.success && data.raw) {
        // El endpoint track devuelve los datos en 'raw'
        setTrackDialog(prev => ({ ...prev, loading: false, result: data.raw }));
      } else {
        setTrackDialog(prev => ({ 
          ...prev, 
          loading: false, 
          error: data.error || 'No se encontró la guía en el sistema MoJie' 
        }));
      }
    } catch (error: any) {
      setTrackDialog(prev => ({ 
        ...prev, 
        loading: false, 
        error: 'Error de conexión con el API' 
      }));
    }
  };

  // Asignar cliente
  const handleAssignClient = async () => {
    if (!assignDialog.receipt || !assignDialog.userId) return;
    
    try {
      const res = await fetch(`${API_URL}/api/china/receipts/${assignDialog.receipt.id}/assign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId: parseInt(assignDialog.userId) })
      });
      const data = await res.json();

      if (data.success) {
        setSnackbar({ open: true, message: 'Cliente asignado correctamente', severity: 'success' });
        setAssignDialog({ open: false, receipt: null, userId: '' });
        loadData();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message, severity: 'error' });
    }
  };

  // Chip de estado con colores
  const getStatusChip = (status: string) => {
    const statusConfig: { [key: string]: { label: string; color: 'default' | 'warning' | 'info' | 'success' | 'primary' | 'error' } } = {
      'received_origin': { label: 'Recibido China', color: 'warning' },
      'in_transit': { label: 'En Tránsito Aéreo', color: 'info' },
      'in_customs': { label: 'En Aduana', color: 'secondary' as any },
      'customs_cleared': { label: 'Liberado', color: 'success' },
      'in_cedis': { label: 'En CEDIS', color: 'primary' },
      'delivered': { label: 'Entregado', color: 'success' }
    };

    const config = statusConfig[status] || { label: status, color: 'default' };
    return <Chip size="small" label={config.label} color={config.color} />;
  };

  // Calcular estadísticas
  const getStatusCount = (statusKey: string) => {
    if (!stats?.byStatus) return 0;
    const found = stats.byStatus.find(s => s.status === statusKey);
    return found ? parseInt(found.count) : 0;
  };

  const totalReceipts = stats?.byStatus?.reduce((acc, s) => acc + parseInt(s.count), 0) || 0;

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={onBack} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <FlightIcon sx={{ fontSize: 32, mr: 1, color: '#E53935' }} />
        <Typography variant="h5" fontWeight="bold">
          API China - TDI Aéreo
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant="outlined"
          startIcon={<SearchIcon />}
          onClick={() => setTrackDialog({ open: true, fno: '', loading: false, error: null, result: null })}
          sx={{ mr: 1, borderColor: '#4CAF50', color: '#4CAF50' }}
        >
          Rastrear Guía
        </Button>
        <Button
          variant="outlined"
          startIcon={syncing ? <CircularProgress size={20} /> : <SyncIcon />}
          onClick={async () => {
            await syncWithMoJie();
            await loadData();
          }}
          disabled={syncing || loading}
          sx={{ mr: 1, borderColor: '#E53935', color: '#E53935' }}
        >
          Sincronizar MoJie
        </Button>
        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={20} /> : <RefreshIcon />}
          onClick={() => loadData()}
          disabled={syncing || loading}
          sx={{ bgcolor: '#E53935', '&:hover': { bgcolor: '#C62828' } }}
        >
          Actualizar
        </Button>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card sx={{ bgcolor: 'warning.light' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <WarehouseIcon sx={{ fontSize: 32, color: 'warning.dark' }} />
              <Typography variant="h4" fontWeight="bold">{getStatusCount('received_origin')}</Typography>
              <Typography variant="body2">En Bodega China</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card sx={{ bgcolor: 'info.light' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <FlightTakeoffIcon sx={{ fontSize: 32, color: 'info.dark' }} />
              <Typography variant="h4" fontWeight="bold">{getStatusCount('in_transit')}</Typography>
              <Typography variant="body2">En Tránsito</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card sx={{ bgcolor: 'secondary.light' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <AssignmentIndIcon sx={{ fontSize: 32, color: 'secondary.dark' }} />
              <Typography variant="h4" fontWeight="bold">{getStatusCount('in_customs')}</Typography>
              <Typography variant="body2">En Aduana</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card sx={{ bgcolor: 'success.light' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <CheckCircleIcon sx={{ fontSize: 32, color: 'success.dark' }} />
              <Typography variant="h4" fontWeight="bold">{getStatusCount('delivered')}</Typography>
              <Typography variant="body2">Entregados</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card sx={{ bgcolor: 'error.light' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <ErrorIcon sx={{ fontSize: 32, color: 'error.dark' }} />
              <Typography variant="h4" fontWeight="bold">{stats?.unassignedReceipts || 0}</Typography>
              <Typography variant="body2">Sin Asignar</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <InventoryIcon sx={{ fontSize: 32, color: 'primary.main' }} />
              <Typography variant="h4" fontWeight="bold">{totalReceipts}</Typography>
              <Typography variant="body2">Total Recepciones</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ mb: 2 }}>
        <Tab label="Recepciones China" icon={<FlightIcon />} iconPosition="start" />
        <Tab label={`Hoy: ${stats?.todayPackages || 0} cajas`} icon={<LocalShippingIcon />} iconPosition="start" />
      </Tabs>

      {syncing && <LinearProgress sx={{ mb: 2 }} />}

      {/* Tab: Recepciones */}
      {tabValue === 0 && (
        <>
          {/* Filtros */}
          <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              label="Todas"
              color={!statusFilter && !unassignedOnly ? 'primary' : 'default'}
              onClick={() => { setStatusFilter(null); setUnassignedOnly(false); }}
            />
            <Chip
              label="Sin Asignar"
              color={unassignedOnly ? 'error' : 'default'}
              onClick={() => { setUnassignedOnly(!unassignedOnly); setStatusFilter(null); }}
            />
            <Chip
              label="En Bodega China"
              color={statusFilter === 'received_origin' ? 'warning' : 'default'}
              onClick={() => { setStatusFilter('received_origin'); setUnassignedOnly(false); }}
            />
            <Chip
              label="En Tránsito"
              color={statusFilter === 'in_transit' ? 'info' : 'default'}
              onClick={() => { setStatusFilter('in_transit'); setUnassignedOnly(false); }}
            />
            <Chip
              label="En Aduana"
              color={statusFilter === 'in_customs' ? 'secondary' : 'default'}
              onClick={() => { setStatusFilter('in_customs'); setUnassignedOnly(false); }}
            />
            <Chip
              label="Entregados"
              color={statusFilter === 'delivered' ? 'success' : 'default'}
              onClick={() => { setStatusFilter('delivered'); setUnassignedOnly(false); }}
            />
          </Box>

          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>FNO</TableCell>
                  <TableCell>Cliente</TableCell>
                  <TableCell align="center">Cajas</TableCell>
                  <TableCell align="right">Peso (kg)</TableCell>
                  <TableCell align="right">CBM</TableCell>
                  <TableCell>Guía Aérea</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell align="center">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                ) : receipts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No hay recepciones</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  receipts.map((receipt) => (
                    <TableRow key={receipt.id} hover>
                      <TableCell>
                        <Typography fontWeight="bold" fontSize="0.85rem">{receipt.fno}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {receipt.shipping_mark}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {receipt.client_name ? (
                          <>
                            <Typography fontSize="0.85rem">{receipt.client_name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {receipt.client_box_id}
                            </Typography>
                          </>
                        ) : (
                          <Chip size="small" label="Sin asignar" color="error" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Typography fontWeight="bold">{receipt.total_qty}</Typography>
                      </TableCell>
                      <TableCell align="right">{Number(receipt.total_weight || 0).toFixed(2)}</TableCell>
                      <TableCell align="right">{Number(receipt.total_cbm || 0).toFixed(4)}</TableCell>
                      <TableCell>
                        {receipt.international_tracking ? (
                          <Chip size="small" label={receipt.international_tracking} variant="outlined" />
                        ) : (
                          <Typography fontSize="0.75rem" color="text.secondary">Pendiente</Typography>
                        )}
                      </TableCell>
                      <TableCell>{getStatusChip(receipt.status)}</TableCell>
                      <TableCell align="center">
                        <Tooltip title="Ver detalle">
                          <IconButton size="small" onClick={() => handleViewDetail(receipt)}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {!receipt.user_id && (
                          <Tooltip title="Asignar cliente">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setAssignDialog({ open: true, receipt, userId: '' })}
                            >
                              <PersonSearchIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Actualizar estado">
                          <IconButton 
                            size="small" 
                            color="primary"
                            onClick={() => setUpdateStatusDialog({ 
                              open: true, 
                              receipt, 
                              status: receipt.status, 
                              notes: receipt.notes || '',
                              internationalTracking: receipt.international_tracking || ''
                            })}
                          >
                            <SyncIcon fontSize="small" />
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

      {/* Tab: Información del día */}
      {tabValue === 1 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Resumen del Día
          </Typography>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography color="text.secondary">Cajas recibidas hoy</Typography>
                  <Typography variant="h3" fontWeight="bold" color="primary">
                    {stats?.todayPackages || 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography color="text.secondary">Recepciones sin asignar</Typography>
                  <Typography variant="h3" fontWeight="bold" color="error">
                    {stats?.unassignedReceipts || 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography color="text.secondary">Pendientes de guía aérea</Typography>
                  <Typography variant="h3" fontWeight="bold" color="warning.main">
                    {stats?.pendingBillNo || 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* Dialog: Detalle de Recepción */}
      <Dialog 
        open={detailDialog.open} 
        onClose={() => setDetailDialog({ open: false, receipt: null, packages: [] })} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FlightIcon color="primary" />
          Detalle de Recepción: {detailDialog.receipt?.fno}
        </DialogTitle>
        <DialogContent>
          {detailDialog.receipt && (
            <>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">Información General</Typography>
                    <Divider sx={{ my: 1 }} />
                    <Typography><b>FNO:</b> {detailDialog.receipt.fno}</Typography>
                    <Typography><b>Shipping Mark:</b> {detailDialog.receipt.shipping_mark}</Typography>
                    <Typography><b>Total Cajas:</b> {detailDialog.receipt.total_qty}</Typography>
                    <Typography><b>Peso Total:</b> {Number(detailDialog.receipt.total_weight || 0).toFixed(2)} kg</Typography>
                    <Typography><b>CBM Total:</b> {Number(detailDialog.receipt.total_cbm || 0).toFixed(4)}</Typography>
                    <Typography><b>Guía Aérea:</b> {detailDialog.receipt.international_tracking || 'Pendiente'}</Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">Cliente</Typography>
                    <Divider sx={{ my: 1 }} />
                    {detailDialog.receipt.client_name ? (
                      <>
                        <Typography><b>Nombre:</b> {detailDialog.receipt.client_name}</Typography>
                        <Typography><b>Box ID:</b> {detailDialog.receipt.client_box_id}</Typography>
                        <Typography><b>Email:</b> {detailDialog.receipt.client_email}</Typography>
                      </>
                    ) : (
                      <Alert severity="warning" sx={{ mt: 1 }}>
                        Cliente no asignado
                      </Alert>
                    )}
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle2" color="text.secondary">Estado Actual</Typography>
                    <Box sx={{ mt: 1 }}>
                      {getStatusChip(detailDialog.receipt.status)}
                    </Box>
                  </Paper>
                </Grid>
              </Grid>

              {detailDialog.receipt.evidence_urls && detailDialog.receipt.evidence_urls.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" gutterBottom>Evidencias ({detailDialog.receipt.evidence_urls.length})</Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {detailDialog.receipt.evidence_urls.map((url, idx) => (
                      <Box 
                        key={idx}
                        component="img"
                        src={url}
                        sx={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 1, cursor: 'pointer' }}
                        onClick={() => window.open(url, '_blank')}
                      />
                    ))}
                  </Box>
                </Box>
              )}

              <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <InventoryIcon color="primary" />
                Cajas ({detailDialog.packages.length})
              </Typography>
              
              <Paper sx={{ maxHeight: 300, overflow: 'auto' }}>
                {detailDialog.packages.length === 0 ? (
                  <Box sx={{ p: 3, textAlign: 'center' }}>
                    <Typography color="text.secondary">No hay cajas registradas</Typography>
                  </Box>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>ID Caja</TableCell>
                        <TableCell>Descripción</TableCell>
                        <TableCell>Dimensiones</TableCell>
                        <TableCell align="right">Peso</TableCell>
                        <TableCell align="right">CBM</TableCell>
                        <TableCell>Estado</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detailDialog.packages.map((pkg) => (
                        <TableRow key={pkg.id}>
                          <TableCell>
                            <Typography fontSize="0.8rem" fontWeight="bold">{pkg.child_no}</Typography>
                            <Typography variant="caption" color="text.secondary">{pkg.tracking_internal}</Typography>
                          </TableCell>
                          <TableCell>{pkg.pro_name || '-'}</TableCell>
                          <TableCell>{pkg.dimensions || '-'}</TableCell>
                          <TableCell align="right">{Number(pkg.weight || 0).toFixed(2)} kg</TableCell>
                          <TableCell align="right">{Number(pkg.single_cbm || 0).toFixed(4)}</TableCell>
                          <TableCell>{getStatusChip(pkg.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Paper>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialog({ open: false, receipt: null, packages: [] })}>
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Nueva Recepción */}
      <Dialog 
        open={createDialog.open} 
        onClose={() => setCreateDialog({ ...createDialog, open: false })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AddIcon color="primary" />
            Nueva Recepción Manual
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              label="FNO (ID de envío)"
              value={createDialog.form.fno}
              onChange={(e) => setCreateDialog({ 
                ...createDialog, 
                form: { ...createDialog.form, fno: e.target.value.toUpperCase() } 
              })}
              placeholder="AIR2609001234"
              fullWidth
              required
            />
            <TextField
              label="Shipping Mark (Box ID)"
              value={createDialog.form.shipping_mark}
              onChange={(e) => setCreateDialog({ 
                ...createDialog, 
                form: { ...createDialog.form, shipping_mark: e.target.value.toUpperCase() } 
              })}
              placeholder="S3019"
              fullWidth
              required
            />
            <Grid container spacing={2}>
              <Grid size={{ xs: 4 }}>
                <TextField
                  label="Cantidad Cajas"
                  type="number"
                  value={createDialog.form.total_qty}
                  onChange={(e) => setCreateDialog({ 
                    ...createDialog, 
                    form: { ...createDialog.form, total_qty: e.target.value } 
                  })}
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <TextField
                  label="Peso (kg)"
                  type="number"
                  value={createDialog.form.total_weight}
                  onChange={(e) => setCreateDialog({ 
                    ...createDialog, 
                    form: { ...createDialog.form, total_weight: e.target.value } 
                  })}
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <TextField
                  label="CBM"
                  type="number"
                  value={createDialog.form.total_cbm}
                  onChange={(e) => setCreateDialog({ 
                    ...createDialog, 
                    form: { ...createDialog.form, total_cbm: e.target.value } 
                  })}
                  fullWidth
                />
              </Grid>
            </Grid>
            <TextField
              label="Notas"
              value={createDialog.form.notes}
              onChange={(e) => setCreateDialog({ 
                ...createDialog, 
                form: { ...createDialog.form, notes: e.target.value } 
              })}
              multiline
              rows={2}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialog({ ...createDialog, open: false })}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleCreateReceipt}
            disabled={!createDialog.form.fno || !createDialog.form.shipping_mark || syncing}
            sx={{ bgcolor: '#E53935' }}
          >
            {syncing ? <CircularProgress size={20} /> : 'Crear Recepción'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Actualizar Estado */}
      <Dialog 
        open={updateStatusDialog.open} 
        onClose={() => setUpdateStatusDialog({ open: false, receipt: null, status: '', notes: '', internationalTracking: '' })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Actualizar Estado de Recepción</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <Typography variant="body2">
              FNO: <b>{updateStatusDialog.receipt?.fno}</b>
            </Typography>
            <FormControl fullWidth>
              <InputLabel>Estado</InputLabel>
              <Select
                value={updateStatusDialog.status}
                onChange={(e) => setUpdateStatusDialog({ ...updateStatusDialog, status: e.target.value })}
                label="Estado"
              >
                <MenuItem value="received_origin">Recibido China</MenuItem>
                <MenuItem value="in_transit">En Tránsito Aéreo</MenuItem>
                <MenuItem value="in_customs">En Aduana</MenuItem>
                <MenuItem value="customs_cleared">Liberado</MenuItem>
                <MenuItem value="in_cedis">En CEDIS</MenuItem>
                <MenuItem value="delivered">Entregado</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Guía Aérea Internacional"
              value={updateStatusDialog.internationalTracking}
              onChange={(e) => setUpdateStatusDialog({ 
                ...updateStatusDialog, 
                internationalTracking: e.target.value 
              })}
              placeholder="176-12345678"
              fullWidth
            />
            <TextField
              label="Notas"
              value={updateStatusDialog.notes}
              onChange={(e) => setUpdateStatusDialog({ ...updateStatusDialog, notes: e.target.value })}
              multiline
              rows={2}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUpdateStatusDialog({ open: false, receipt: null, status: '', notes: '', internationalTracking: '' })}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleUpdateStatus} disabled={syncing}>
            {syncing ? <CircularProgress size={20} /> : 'Actualizar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Asignar Cliente */}
      <Dialog 
        open={assignDialog.open} 
        onClose={() => setAssignDialog({ open: false, receipt: null, userId: '' })}
      >
        <DialogTitle>Asignar Cliente a Recepción</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            FNO: <b>{assignDialog.receipt?.fno}</b>
          </Typography>
          <TextField
            label="ID del Usuario"
            value={assignDialog.userId}
            onChange={(e) => setAssignDialog({ ...assignDialog, userId: e.target.value })}
            fullWidth
            type="number"
            placeholder="Ej: 1"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignDialog({ open: false, receipt: null, userId: '' })}>Cancelar</Button>
          <Button variant="contained" onClick={handleAssignClient}>Asignar</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Rastrear Guía MJCustomer */}
      <Dialog 
        open={trackDialog.open} 
        onClose={() => setTrackDialog({ open: false, fno: '', loading: false, error: null, result: null })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SearchIcon color="success" />
          Rastrear Guía en MoJie (China)
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', gap: 2, mt: 2, mb: 3 }}>
            <TextField
              label="FNO (Folio de envío)"
              value={trackDialog.fno}
              onChange={(e) => setTrackDialog(prev => ({ ...prev, fno: e.target.value.toUpperCase() }))}
              placeholder="Ej: AIR2609096hyXgs o SHIP2507438tkMW"
              fullWidth
              onKeyPress={(e) => e.key === 'Enter' && handleTrackFNO()}
              autoFocus
            />
            <Button
              variant="contained"
              onClick={handleTrackFNO}
              disabled={trackDialog.loading || !trackDialog.fno.trim()}
              sx={{ bgcolor: '#4CAF50', minWidth: 120 }}
            >
              {trackDialog.loading ? <CircularProgress size={24} color="inherit" /> : 'Buscar'}
            </Button>
          </Box>

          {trackDialog.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {trackDialog.error}
            </Alert>
          )}

          {trackDialog.result && (
            <Box>
              {/* Información General */}
              <Paper sx={{ p: 2, mb: 2, bgcolor: 'success.light' }}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="subtitle2" color="text.secondary">FNO</Typography>
                    <Typography variant="h6" fontWeight="bold">{trackDialog.result.fno}</Typography>
                  </Grid>
                  <Grid size={{ xs: 6, md: 3 }}>
                    <Typography variant="subtitle2" color="text.secondary">Shipping Mark</Typography>
                    <Typography fontWeight="bold">{trackDialog.result.shippingMark}</Typography>
                  </Grid>
                  <Grid size={{ xs: 6, md: 3 }}>
                    <Typography variant="subtitle2" color="text.secondary">Estado</Typography>
                    <Chip 
                      label={trackDialog.result.trajecotryName || trackDialog.result.trajectoryName || 'En proceso'} 
                      color="primary" 
                      size="small" 
                    />
                  </Grid>
                </Grid>
              </Paper>

              {/* Estadísticas */}
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Card variant="outlined">
                    <CardContent sx={{ textAlign: 'center', py: 1 }}>
                      <Typography variant="h4" fontWeight="bold" color="primary">
                        {trackDialog.result.totalQty || 0}
                      </Typography>
                      <Typography variant="caption">Cajas</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Card variant="outlined">
                    <CardContent sx={{ textAlign: 'center', py: 1 }}>
                      <Typography variant="h4" fontWeight="bold" color="info.main">
                        {Number(trackDialog.result.totalWeight || 0).toFixed(2)}
                      </Typography>
                      <Typography variant="caption">Peso (kg)</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Card variant="outlined">
                    <CardContent sx={{ textAlign: 'center', py: 1 }}>
                      <Typography variant="h4" fontWeight="bold" color="warning.main">
                        {Number(trackDialog.result.totalCbm || 0).toFixed(4)}
                      </Typography>
                      <Typography variant="caption">CBM</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Card variant="outlined">
                    <CardContent sx={{ textAlign: 'center', py: 1 }}>
                      <Typography variant="h6" fontWeight="bold">
                        {trackDialog.result.billNo || trackDialog.result.customsBno || '-'}
                      </Typography>
                      <Typography variant="caption">Guía Aérea</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* Fotos/Evidencias */}
              {(() => {
                // Parsear file si viene como string JSON
                let fileArray: string[] = [];
                if (trackDialog.result.file) {
                  if (Array.isArray(trackDialog.result.file)) {
                    fileArray = trackDialog.result.file;
                  } else if (typeof trackDialog.result.file === 'string') {
                    try {
                      const parsed = JSON.parse(trackDialog.result.file);
                      fileArray = Array.isArray(parsed) ? parsed : [trackDialog.result.file];
                    } catch {
                      fileArray = [trackDialog.result.file];
                    }
                  }
                }
                return fileArray.length > 0 ? (
                <Box sx={{ mb: 2 }}>
                  <Button
                    variant="outlined"
                    color="primary"
                    startIcon={<ImageIcon />}
                    onClick={() => window.open(fileArray[0], '_blank')}
                  >
                    Ver Foto del Producto ({fileArray.length})
                  </Button>
                </Box>
                ) : null;
              })()}

              {/* Detalle de Cajas */}
              {trackDialog.result.data && trackDialog.result.data.length > 0 && (
                <Box>
                  <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <InventoryIcon color="primary" />
                    Detalle de Cajas ({trackDialog.result.data.length})
                  </Typography>
                  <Paper sx={{ maxHeight: 300, overflow: 'auto' }}>
                    <Table size="small">
                      <TableHead sx={{ bgcolor: 'grey.100' }}>
                        <TableRow>
                          <TableCell>Child No</TableCell>
                          <TableCell>Producto</TableCell>
                          <TableCell align="right">Peso</TableCell>
                          <TableCell>Dimensiones</TableCell>
                          <TableCell>Código Aduanal</TableCell>
                          <TableCell>Estado</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {trackDialog.result.data.map((pkg: any, idx: number) => (
                          <TableRow key={idx} hover>
                            <TableCell>
                              <Typography fontSize="0.8rem" fontWeight="bold" fontFamily="monospace">
                                {pkg.childNo}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography fontSize="0.85rem">{pkg.proName || '-'}</Typography>
                            </TableCell>
                            <TableCell align="right">
                              {Number(pkg.weight || 0).toFixed(2)} kg
                            </TableCell>
                            <TableCell>
                              {pkg.long && pkg.width && pkg.height 
                                ? `${pkg.long}x${pkg.width}x${pkg.height} cm`
                                : '-'
                              }
                            </TableCell>
                            <TableCell>
                              <Chip label={pkg.customsBno || '-'} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell>
                              <Chip 
                                label={pkg.trajecotryName || pkg.trajectoryName || 'En proceso'} 
                                size="small" 
                                color="info" 
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Paper>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTrackDialog({ open: false, fno: '', loading: false, error: null, result: null })}>
            Cerrar
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

export default AirApiPage;
