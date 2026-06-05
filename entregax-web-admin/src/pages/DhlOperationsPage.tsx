// ============================================
// PANEL DE OPERACIONES DHL 📦
// Recepción, auditoría y despacho de paquetes
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useModulePermissions from '../hooks/useModulePermissions';
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
  ArrowBack as ArrowBackIcon,
  ManageAccounts as ManageAccountsIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  QrCode2 as _QrCode2Icon,
  Print as PrintIcon,
  AutoAwesome as AutoAwesomeIcon,
} from '@mui/icons-material';
import DhlReceptionWizard from './DhlReceptionWizard';
import axios from 'axios';
import QRCode from 'react-qr-code';
import JsBarcode from 'jsbarcode';

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
  secondary_tracking?: string;
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
  today_dispatched: number;
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

const CEDIS_MODULES = ['reception', 'storage', 'picking', 'packing', 'dispatch', 'transfers', 'scanning', 'inventory_count'];

export default function DhlOperationsPage({ onBack }: { onBack?: () => void } = {}) {
  const navigate = useNavigate();
  const { allowedModules, loading: permLoading, canEdit } = useModulePermissions('ops_mx_cedis', CEDIS_MODULES);
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
  const [supervisorName, setSupervisorName] = useState('');

  // Modal gestión de PINs
  const [pinMgmtDialog, setPinMgmtDialog] = useState(false);
  const [supervisorList, setSupervisorList] = useState<{ id: number; full_name: string; email: string; role: string; supervisor_pin: string | null }[]>([]);
  const [loadingSupervisors, setLoadingSupervisors] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [pinMgmtError, setPinMgmtError] = useState('');
  const [pinMgmtSuccess, setPinMgmtSuccess] = useState('');

  // Gestión de PINs de supervisores: solo super_admin
  const isSuperAdmin = (() => {
    try { return (JSON.parse(localStorage.getItem('user') || '{}').role || '') === 'super_admin'; } catch { return false; }
  })();
  
  const [selectedShipment, setSelectedShipment] = useState<DhlShipment | null>(null);

  // Cambiar status (solo super_admin)
  const [statusDialog, setStatusDialog] = useState<{ open: boolean; shipment: DhlShipment | null; newStatus: string; saving: boolean; error: string }>({
    open: false, shipment: null, newStatus: '', saving: false, error: '',
  });

  const handleOpenStatusDialog = (shipment: DhlShipment) => {
    setStatusDialog({ open: true, shipment, newStatus: shipment.status, saving: false, error: '' });
  };

  const handleConfirmStatusChange = async () => {
    if (!statusDialog.shipment || !statusDialog.newStatus) return;
    setStatusDialog(s => ({ ...s, saving: true, error: '' }));
    try {
      const token = localStorage.getItem('token');
      await axios.patch(`${API_URL}/api/admin/dhl/shipments/${statusDialog.shipment.id}/status`,
        { status: statusDialog.newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setStatusDialog(s => ({ ...s, open: false, saving: false }));
      fetchShipments();
    } catch (e: any) {
      setStatusDialog(s => ({ ...s, saving: false, error: e?.response?.data?.error || 'Error al cambiar status' }));
    }
  };

  // Editar tipo de producto (con PIN de supervisor)
  const [editTypeDialog, setEditTypeDialog] = useState<{ open: boolean; shipment: DhlShipment | null }>({ open: false, shipment: null });
  const [editTypeValue, setEditTypeValue] = useState<'standard' | 'high_value'>('standard');
  const [editTypePin, setEditTypePin] = useState('');
  const [editTypeError, setEditTypeError] = useState('');
  const [savingType, setSavingType] = useState(false);
  const [typeUpdatedDialog, setTypeUpdatedDialog] = useState<{ open: boolean; supervisorName: string; shipment: DhlShipment | null; oldType: string; newType: string }>({ open: false, supervisorName: '', shipment: null, oldType: '', newType: '' });

  // Eliminar guía (super_admin)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; shipment: DhlShipment | null }>({ open: false, shipment: null });
  const [deleting, setDeleting] = useState(false);
  
  // Form: Recibir paquete - Ahora usa DhlReceptionWizard

  // Quote result
  const [quoteResult, _setQuoteResult] = useState<{
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
        setSupervisorName(res.data.supervisor?.name || '');
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

  // ===== GESTIÓN DE PINs =====
  const loadSupervisors = async () => {
    setLoadingSupervisors(true);
    setPinMgmtError('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/warehouse/supervisors`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSupervisorList(res.data);
    } catch {
      setPinMgmtError('Error al cargar supervisores');
    } finally {
      setLoadingSupervisors(false);
    }
  };

  const handleOpenPinMgmt = () => {
    setPinMgmtDialog(true);
    setPinMgmtError('');
    setPinMgmtSuccess('');
    loadSupervisors();
  };

  // Genera un codigo aleatorio largo (cifrado) en backend y lo guarda
  const handleGenerateQrCode = async (userId: number) => {
    const sup = supervisorList.find(s => s.id === userId);
    const msg = sup?.supervisor_pin
      ? 'Se RESTAURARA el codigo de este supervisor. El codigo actual dejara de funcionar y se imprimira una nueva etiqueta. Continuar?'
      : 'Se generara un nuevo codigo QR cifrado para este supervisor y se imprimira la etiqueta. Continuar?';
    if (!window.confirm(msg)) return;
    setSavingPin(true);
    setPinMgmtError('');
    setPinMgmtSuccess('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/warehouse/admin-generate-supervisor-pin`,
        { target_user_id: userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPinMgmtSuccess('Codigo QR generado. Ya puedes imprimir la etiqueta.');
      await loadSupervisors();
      // Imprimir automaticamente con los datos retornados
      const sup = supervisorList.find(s => s.id === userId);
      printSupervisorLabel({
        full_name: res.data?.user?.full_name || sup?.full_name || '',
        email: res.data?.user?.email || sup?.email || '',
        code: res.data?.supervisor_pin,
      });
    } catch (err: any) {
      setPinMgmtError(err?.response?.data?.error || 'Error al generar codigo');
    } finally {
      setSavingPin(false);
    }
  };

  // Imprime etiqueta 4" x 2" (101.6 x 50.8 mm) con QR + Code128 + nombre del supervisor
  const printSupervisorLabel = (sup: { full_name: string; email: string; code: string }) => {
    if (!sup.code) {
      setPinMgmtError('Este supervisor no tiene codigo asignado. Genera uno primero.');
      return;
    }
    // 1) Generar SVG del codigo de barras con JsBarcode
    let barcodeSvg = '';
    try {
      const tmpSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(tmpSvg, sup.code, {
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        height: 120,
        width: 2.5,
      });
      barcodeSvg = new XMLSerializer().serializeToString(tmpSvg);
    } catch (err) {
      console.error('Error generando barcode:', err);
      setPinMgmtError('Error al generar codigo de barras');
      return;
    }

    // 2) Generar SVG del QR usando un nodo offscreen con react-qr-code
    //    Como react-qr-code requiere ReactDOM render, lo hacemos via QR estatico usando data URL.
    //    Alternativa: usar la libreria 'qrcode' o construir el QR con un canvas/svg helper.
    //    Aqui usamos un truco: renderizamos react-qr-code en un contenedor temporal y serializamos.
    const qrContainer = document.createElement('div');
    qrContainer.style.position = 'fixed';
    qrContainer.style.left = '-9999px';
    document.body.appendChild(qrContainer);

    // Usar createRoot dinamicamente
    import('react-dom/client').then(({ createRoot }) => {
      const root = createRoot(qrContainer);
      root.render(
        <QRCode value={sup.code} size={256} level="M" />
      );
      // esperar un tick para que renderice
      setTimeout(() => {
        const qrSvgEl = qrContainer.querySelector('svg');
        const qrSvg = qrSvgEl ? new XMLSerializer().serializeToString(qrSvgEl) : '';
        root.unmount();
        qrContainer.remove();

        // 3) Abrir ventana de impresion
        const win = window.open('', '_blank', 'width=420,height=240');
        if (!win) {
          setPinMgmtError('No se pudo abrir la ventana de impresion (popup bloqueado)');
          return;
        }
        // Etiqueta 4" x 2" (101.6mm x 50.8mm)
        win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>PIN Supervisor - ${sup.full_name}</title>
<style>
  @page { size: 101.6mm 50.8mm; margin: 0; }
  html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label { width: 101.6mm; height: 50.8mm; box-sizing: border-box; padding: 2mm 3mm; display: flex; gap: 2mm; align-items: center; }
  .qr { width: 24mm; height: 24mm; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .qr svg { width: 100%; height: 100%; }
  .right { flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; }
  .title { font-size: 8pt; font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 1mm; color: #D40511; }
  .name { font-size: 10pt; font-weight: bold; line-height: 1.1; margin-bottom: 0.5mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .email { font-size: 6.5pt; color: #555; margin-bottom: 1mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .barcode { width: 100%; height: 22mm; }
  .barcode svg { width: 100%; height: 100%; }
</style>
</head>
<body>
  <div class="label">
    <div class="qr">${qrSvg}</div>
    <div class="right">
      <div class="title">PIN SUPERVISOR</div>
      <div class="name">${escapeHtml(sup.full_name)}</div>
      <div class="email">${escapeHtml(sup.email)}</div>
      <div class="barcode">${barcodeSvg}</div>
    </div>
  </div>
  <script>
    window.onload = function() { setTimeout(function(){ window.print(); }, 200); };
  </script>
</body>
</html>`);
        win.document.close();
      }, 50);
    }).catch((e) => {
      console.error(e);
      qrContainer.remove();
      setPinMgmtError('Error renderizando QR');
    });
  };

  // Util para evitar XSS al inyectar texto en el HTML de impresion
  const escapeHtml = (s: string) => String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  } as Record<string, string>)[c] as string);


  // ===== HANDLERS =====
  // Nota: handleReceivePackage fue reemplazado por DhlReceptionWizard
  // Nota: handleOpenQuote eliminado - cotización manual deshabilitada en la UI.

  // Cotización manual deshabilitada en la UI (botón removido).

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

  // Filter by tab - Solo Recibidos y Despachados
  const getFilteredShipments = () => {
    switch (tabValue) {
      case 0: return shipments.filter(s => s.status === 'received_mty');
      case 1: return shipments.filter(s => s.status === 'dispatched');
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

  if (permLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  if (allowedModules.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" flexDirection="column" gap={2}>
        <LockIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
        <Typography variant="h6" color="text.secondary">No tienes acceso a este módulo</Typography>
        <Typography variant="body2" color="text.disabled">Contacta a tu administrador para solicitar permisos</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton onClick={() => (onBack ? onBack() : navigate(-1))} sx={{ mr: 1 }} aria-label="Atrás">
            <ArrowBackIcon />
          </IconButton>
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
        <Box sx={{ display: 'flex', gap: 1 }}>
          {isSuperAdmin && (
            <Button
              variant="outlined"
              startIcon={<ManageAccountsIcon />}
              onClick={handleOpenPinMgmt}
              sx={{ borderColor: DHL_COLOR, color: DHL_COLOR }}
            >
              PINs Supervisores
            </Button>
          )}
          {canEdit('reception') && (
            <Button
              variant="contained"
              startIcon={<ScanIcon />}
              onClick={handleOpenReception}
              sx={{ bgcolor: DHL_COLOR, '&:hover': { bgcolor: '#a00410' } }}
            >
              Recibir Paquete
            </Button>
          )}
        </Box>
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
          sx={{ 
            borderBottom: 1, 
            borderColor: 'divider',
            '& .Mui-selected': { color: DHL_COLOR }
          }}
        >
          <Tab 
            label={
              <Badge badgeContent={stats?.today_received || 0} color="primary">
                Recibidos
              </Badge>
            } 
          />
          <Tab 
            label={
              <Badge badgeContent={stats?.today_dispatched || 0} color="success">
                Despachados
              </Badge>
            } 
          />
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
                      {(() => {
                        const inb = shipment.inbound_tracking || '';
                        const sec = shipment.secondary_tracking || '';
                        // Datos legacy: inbound puede ser 2LMX (ref interna) → mostrar secondary como principal
                        const is2LMX = /^[A-Z0-9]{3,}\+\d+$/i.test(inb);
                        // Datos nuevos: inbound = JJD larga, secondary = corta master
                        // Datos legacy correctos: inbound = corta, secondary = JJD larga
                        const isInbJJD = /^JJD/i.test(inb) || inb.length >= 18;
                        const isSecJJD = /^JJD/i.test(sec) || sec.length >= 18;
                        // Elegir qué mostrar como principal
                        let main: string, sub: string, subLabel: string;
                        if (is2LMX) {
                          main = sec || inb;
                          sub = inb;
                          subLabel = 'Ref:';
                        } else if (isInbJJD) {
                          // Nuevo formato: inbound=JJD larga, secondary=corta
                          main = inb;
                          sub = sec;
                          subLabel = 'Master:';
                        } else if (isSecJJD) {
                          // Legacy: inbound=corta, secondary=JJD larga
                          main = inb;
                          sub = sec;
                          subLabel = 'JJD:';
                        } else {
                          main = inb;
                          sub = sec;
                          subLabel = 'Master:';
                        }
                        return (
                          <>
                            <Typography fontWeight="bold" sx={{ fontFamily: 'monospace' }}>
                              {main}
                            </Typography>
                            {sub && (
                              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#888' }} display="block">
                                {subLabel} {sub}
                              </Typography>
                            )}
                            {shipment.outbound_tracking && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                → {shipment.outbound_tracking}
                              </Typography>
                            )}
                          </>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight="medium">{shipment.client_name}</Typography>
                      <Chip label={shipment.client_box_id} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={shipment.product_type === 'standard' ? 'General' : 'Específica'}
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
                        <Tooltip title="Cambiar tipo de producto">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => {
                              setEditTypeValue((shipment.product_type as any) || 'standard');
                              setEditTypePin('');
                              setEditTypeError('');
                              setEditTypeDialog({ open: true, shipment });
                            }}
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        {shipment.status === 'paid' && (
                          <Tooltip title="Despachar">
                            <IconButton size="small" color="success" onClick={() => handleOpenDispatch(shipment)}>
                              <SendIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {isSuperAdmin && (
                          <Tooltip title="Cambiar status">
                            <IconButton
                              size="small"
                              color="warning"
                              onClick={() => handleOpenStatusDialog(shipment)}
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {isSuperAdmin && (
                          <Tooltip title="Eliminar guía">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setDeleteDialog({ open: true, shipment })}
                            >
                              <DeleteIcon />
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
            La recepción de paquetes DHL requiere autorización de un gerente o supervisor de operaciones.
          </Alert>

          <TextField
            fullWidth
            label="PIN de Supervisor"
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            value={supervisorPin}
            onChange={(e) => setSupervisorPin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && validateSupervisor()}
            error={!!supervisorError}
            helperText={supervisorError || 'Configura tu PIN en la app móvil > Mi Perfil'}
            autoFocus
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <LockIcon color="action" />
                  </InputAdornment>
                ),
                sx: { input: { '-webkit-text-security': 'disc' } }
              }
            }}
          />

          {supervisorName && (
            <Alert severity="success" sx={{ mt: 2 }}>
              ✓ Autorizado por: <strong>{supervisorName}</strong>
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setSupervisorDialog(false)}>Cancelar</Button>
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

      {/* 🔑 Modal: Gestión de PINs de Supervisores */}
      <Dialog open={pinMgmtDialog} onClose={() => setPinMgmtDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ManageAccountsIcon sx={{ color: DHL_COLOR }} />
          PINs de Supervisores
        </DialogTitle>
        <DialogContent>
          {pinMgmtError && <Alert severity="error" sx={{ mb: 2 }}>{pinMgmtError}</Alert>}
          {pinMgmtSuccess && <Alert severity="success" sx={{ mb: 2 }}>{pinMgmtSuccess}</Alert>}
          {loadingSupervisors ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Nombre</strong></TableCell>
                  <TableCell><strong>Rol</strong></TableCell>
                  <TableCell><strong>PIN actual</strong></TableCell>
                  <TableCell align="right"><strong>Acciones</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {supervisorList.map((sup) => (
                  <TableRow key={sup.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">{sup.full_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{sup.email}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={sup.role} size="small" />
                    </TableCell>
                    <TableCell>
                      <Typography fontFamily="monospace">
                        {sup.supervisor_pin ? '••••' : <em style={{ color: '#999' }}>Sin PIN</em>}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        <Button
                          size="small"
                          variant="outlined"
                          color="primary"
                          startIcon={<AutoAwesomeIcon />}
                          disabled={savingPin}
                          onClick={() => handleGenerateQrCode(sup.id)}
                        >
                          {sup.supervisor_pin ? 'Restaurar' : 'Generar'}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<PrintIcon />}
                          disabled={!sup.supervisor_pin || savingPin}
                          onClick={() => printSupervisorLabel({
                            full_name: sup.full_name,
                            email: sup.email,
                            code: sup.supervisor_pin || '',
                          })}
                        >
                          Imprimir
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPinMgmtDialog(false)}>Cerrar</Button>
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
        supervisorName={supervisorName || undefined}
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
                <strong>Tipo:</strong> {selectedShipment.product_type === 'standard' ? 'General' : 'Específica'}
              </Alert>

              {!quoteResult && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  Esta gu\u00eda a\u00fan no tiene cotizaci\u00f3n calculada.
                </Alert>
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
                  label={selectedShipment.product_type === 'standard' ? 'General' : 'Específica'}
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

      {/* ✏️ Dialog: Cambiar tipo de producto (requiere PIN supervisor) */}
      <Dialog
        open={editTypeDialog.open}
        onClose={() => !savingType && setEditTypeDialog({ open: false, shipment: null })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: DHL_YELLOW, color: DHL_COLOR }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EditIcon />
            Cambiar tipo de producto
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            Guía <strong>{editTypeDialog.shipment?.inbound_tracking}</strong> · {editTypeDialog.shipment?.client_name} ({editTypeDialog.shipment?.client_box_id})
          </Alert>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Tipo de producto</InputLabel>
            <Select
              value={editTypeValue}
              label="Tipo de producto"
              onChange={(e) => setEditTypeValue(e.target.value as 'standard' | 'high_value')}
            >
              <MenuItem value="standard">General</MenuItem>
              <MenuItem value="high_value">Específica</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="PIN de Supervisor"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={editTypePin}
            onChange={(e) => setEditTypePin(e.target.value)}
            error={!!editTypeError}
            helperText={editTypeError || 'Requiere PIN de supervisor/admin/director'}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setEditTypeDialog({ open: false, shipment: null })}
            disabled={savingType}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            disabled={savingType || !editTypePin || !editTypeDialog.shipment}
            onClick={async () => {
              if (!editTypeDialog.shipment) return;
              setSavingType(true);
              setEditTypeError('');
              try {
                const token = localStorage.getItem('token');
                const res = await axios.patch(
                  `${API_URL}/api/admin/dhl/shipments/${editTypeDialog.shipment.id}/product-type`,
                  { product_type: editTypeValue, supervisor_pin: editTypePin },
                  { headers: { Authorization: `Bearer ${token}` } }
                );
                const oldType = res.data?.old_product_type || editTypeDialog.shipment.product_type || 'standard';
                const newType = res.data?.new_product_type || editTypeValue;
                const supervisorName = res.data?.supervisor_name || 'Supervisor';
                const shp = editTypeDialog.shipment;
                setEditTypeDialog({ open: false, shipment: null });
                setEditTypePin('');
                setTypeUpdatedDialog({ open: true, supervisorName, shipment: shp, oldType, newType });
                fetchShipments();
                fetchStats();
              } catch (err: any) {
                setEditTypeError(err?.response?.data?.error || 'No se pudo actualizar');
              } finally {
                setSavingType(false);
              }
            }}
          >
            {savingType ? 'Guardando…' : 'Actualizar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ✅ Confirmación de actualización */}
      <Dialog
        open={typeUpdatedDialog.open}
        onClose={() => setTypeUpdatedDialog({ open: false, supervisorName: '', shipment: null, oldType: '', newType: '' })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: '#4caf50', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckIcon />
            Tipo actualizado
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="success" sx={{ mb: 2 }}>
            La guía <strong>{typeUpdatedDialog.shipment?.inbound_tracking}</strong> fue actualizada correctamente.
          </Alert>
          <Typography variant="body2" sx={{ mb: 1 }}>
            <strong>Cambio:</strong>{' '}
            {typeUpdatedDialog.oldType === 'high_value' ? 'Específica' : 'General'}
            {' → '}
            <span style={{ color: DHL_COLOR, fontWeight: 'bold' }}>
              {typeUpdatedDialog.newType === 'high_value' ? 'Específica' : 'General'}
            </span>
          </Typography>
          <Typography variant="body2">
            <strong>Actualizado por:</strong> {typeUpdatedDialog.supervisorName}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            Se notificó a Director, Admin y Super Admin.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => setTypeUpdatedDialog({ open: false, supervisorName: '', shipment: null, oldType: '', newType: '' })}
          >
            Aceptar
          </Button>
        </DialogActions>
      </Dialog>

      {/* ✏️ Dialog: Cambiar status (super_admin) */}
      <Dialog open={statusDialog.open} onClose={() => !statusDialog.saving && setStatusDialog(s => ({ ...s, open: false }))} maxWidth="xs" fullWidth>
        <DialogTitle>🔄 Cambiar Status</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Guía: <strong>{statusDialog.shipment?.inbound_tracking}</strong>
          </Typography>
          <FormControl fullWidth size="small" sx={{ mt: 2 }}>
            <InputLabel>Nuevo status</InputLabel>
            <Select
              label="Nuevo status"
              value={statusDialog.newStatus}
              onChange={(e) => setStatusDialog(s => ({ ...s, newStatus: e.target.value }))}
            >
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <MenuItem key={key} value={key}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: cfg.color }} />
                    {cfg.label}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {statusDialog.error && <Alert severity="error" sx={{ mt: 2 }}>{statusDialog.error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialog(s => ({ ...s, open: false }))} disabled={statusDialog.saving}>Cancelar</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleConfirmStatusChange}
            disabled={statusDialog.saving || statusDialog.newStatus === statusDialog.shipment?.status}
          >
            {statusDialog.saving ? 'Guardando...' : 'Cambiar Status'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 🗑️ Dialog: Eliminar guía (super_admin) */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => !deleting && setDeleteDialog({ open: false, shipment: null })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: '#d32f2f', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DeleteIcon />
            Eliminar guía DHL
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Esta acción es <strong>irreversible</strong>. Solo Super Admin puede eliminar guías.
          </Alert>
          <Typography variant="body2">
            Guía: <strong>{deleteDialog.shipment?.inbound_tracking}</strong>
          </Typography>
          <Typography variant="body2">
            Cliente: {deleteDialog.shipment?.client_name} ({deleteDialog.shipment?.client_box_id})
          </Typography>
          <Typography variant="body2">
            Estado: {STATUS_CONFIG[deleteDialog.shipment?.status || '']?.label || deleteDialog.shipment?.status}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, shipment: null })} disabled={deleting}>
            Cancelar
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleting || !deleteDialog.shipment}
            onClick={async () => {
              if (!deleteDialog.shipment) return;
              setDeleting(true);
              try {
                const token = localStorage.getItem('token');
                await axios.delete(
                  `${API_URL}/api/admin/dhl/shipments/${deleteDialog.shipment.id}`,
                  { headers: { Authorization: `Bearer ${token}` } }
                );
                setSnackbar({ open: true, message: `Guía ${deleteDialog.shipment.inbound_tracking} eliminada`, severity: 'success' });
                setDeleteDialog({ open: false, shipment: null });
                fetchShipments();
                fetchStats();
              } catch (err: any) {
                setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo eliminar', severity: 'error' });
              } finally {
                setDeleting(false);
              }
            }}
          >
            {deleting ? 'Eliminando…' : 'Eliminar'}
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
