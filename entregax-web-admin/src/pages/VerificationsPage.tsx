import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { 
  Box, Typography, Paper, Card, CardContent, Avatar,
  Button, CircularProgress, Alert, Snackbar, Tooltip, IconButton,
  Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Divider, Badge, Tabs, Tab, InputAdornment, Table,
  TableHead, TableBody, TableRow, TableCell
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PersonIcon from '@mui/icons-material/Person';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import PendingIcon from '@mui/icons-material/Pending';
import BlockIcon from '@mui/icons-material/Block';
import BadgeIcon from '@mui/icons-material/Badge';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import DrawIcon from '@mui/icons-material/Draw';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CloseIcon from '@mui/icons-material/Close';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import DiscountIcon from '@mui/icons-material/LocalOffer';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ORANGE = '#F05A28';
const BLACK = '#111';

// Resuelve cualquier formato de URL de imagen guardada:
//  - data:image/...;base64,xxx  -> tal cual
//  - https?://... -> tal cual
//  - /uploads/xxx o uploads/xxx -> antepone API_BASE
//  - base64 puro (sin prefijo) -> agrega prefijo image/jpeg
//  - cualquier otra cosa -> null (no se puede mostrar)
// Detecta HEIC (formato iOS no compatible con navegadores) y retorna null
// para que se muestre "No disponible" en lugar de una imagen rota.
const isHeicBase64 = (b64: string): boolean => {
  // HEIC files have "ftypheic" or "ftypheix" or "ftypmif1" near the start.
  // Base64 of "....ftyphei" includes "ZnR5cGhlaW" or "Z0eXBoZWlj".
  return (
    b64.includes('ZnR5cGhlaW') ||
    b64.includes('Z0eXBoZWlj') ||
    b64.includes('ZnR5cG1pZjE') ||
    b64.includes('Z0eXBtaWYx')
  );
};

const resolveImageSrc = (raw?: string | null): string | null => {
  if (!raw || typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v || v === 'signature_data') return null;
  if (v.startsWith('data:')) {
    // Extraer la parte base64 y validar formato
    const commaIdx = v.indexOf(',');
    if (commaIdx > 0 && isHeicBase64(v.substring(commaIdx + 1, commaIdx + 100))) {
      return null; // HEIC: no compatible con navegador
    }
    return v;
  }
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  if (v.startsWith('/uploads/') || v.startsWith('uploads/')) {
    return `${API_BASE}${v.startsWith('/') ? '' : '/'}${v}`;
  }
  // Heurística: si parece base64 puro, agregar prefijo
  if (/^[A-Za-z0-9+/=]+$/.test(v) && v.length > 100) {
    if (isHeicBase64(v.substring(0, 100))) return null;
    return `data:image/jpeg;base64,${v}`;
  }
  return null;
};

interface PendingUser {
  id: number;
  full_name: string;
  email: string;
  box_id: string;
  phone: string | null;
  role: string;
  verification_status: string;
  verification_submitted_at: string;
  ine_front_url: string;
  ine_back_url: string;
  selfie_url: string;
  signature_url: string;
  profile_photo_url: string;
  ai_verification_reason: string | null;
  created_at: string;
  is_employee_onboarded: boolean;
  driver_license_front_url: string;
  driver_license_back_url: string;
  driver_license_expiry: string | null;
  // Flags devueltos por el endpoint optimizado de listado
  has_ine_front?: boolean;
  has_ine_back?: boolean;
  has_selfie?: boolean;
  has_profile_photo?: boolean;
  has_signature?: boolean;
  has_license_front?: boolean;
  has_license_back?: boolean;
  avatar_url?: string | null;
}

interface Stats {
  pending: number;
  verified: number;
  rejected: number;
  not_started: number;
}

interface DiscountRequest {
  id: number;
  guia_tracking: string;
  servicio: string;
  source_type: string;
  monto: number;
  moneda: string;
  concepto: string;
  notas: string;
  cliente_id: number;
  cliente_nombre: string;
  solicitado_por: number;
  solicitado_nombre: string;
  estado: 'pendiente' | 'aprobado' | 'rechazado';
  created_at: string;
}

interface DiscountStats {
  pendientes: number;
  aprobados: number;
  rechazados: number;
  monto_pendiente: number;
}

export default function VerificationsPage() {
  const { i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState(0);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<PendingUser | null>(null);
  const [viewDialog, setViewDialog] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Discount verification state
  const [discountRequests, setDiscountRequests] = useState<DiscountRequest[]>([]);
  const [discountStats, setDiscountStats] = useState<DiscountStats | null>(null);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [discountPinDialog, setDiscountPinDialog] = useState(false);
  const [selectedDiscount, setSelectedDiscount] = useState<DiscountRequest | null>(null);
  const [discountAction, setDiscountAction] = useState<'aprobar' | 'rechazar'>('aprobar');
  const [discountPin, setDiscountPin] = useState('');
  const [discountPinError, setDiscountPinError] = useState('');
  const [discountRejectReason, setDiscountRejectReason] = useState('');

  const getToken = () => localStorage.getItem('token');

  const loadData = useCallback(async () => {
    setLoading(true);
    const token = getToken();
    if (!token) {
      setSnackbar({ open: true, message: 'No hay sesión activa', severity: 'error' });
      setLoading(false);
      return;
    }
    try {
      console.log('[Verifications] Loading data...');
      const [pendingRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/admin/verifications/pending`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/admin/verifications/stats`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      console.log('[Verifications] Data loaded:', { pending: pendingRes.data.length, stats: statsRes.data });
      setPendingUsers(pendingRes.data);
      setStats(statsRes.data);
    } catch (error: any) {
      console.error('Error loading data:', error?.response?.data || error.message);
      setSnackbar({ open: true, message: `Error al cargar datos: ${error?.response?.data?.error || error.message}`, severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load discount requests
  const loadDiscountData = useCallback(async () => {
    setDiscountLoading(true);
    const token = getToken();
    if (!token) return;
    try {
      const [reqRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/cs/descuentos/pendientes?estado=pendiente`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/cs/descuentos/stats`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setDiscountRequests(Array.isArray(reqRes.data) ? reqRes.data : (reqRes.data.descuentos || []));
      setDiscountStats(statsRes.data);
    } catch (error: any) {
      console.error('Error loading discount data:', error?.response?.data || error.message);
    }
    setDiscountLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 1) {
      loadDiscountData();
    }
  }, [activeTab, loadDiscountData]);

  // Handle discount approval/rejection
  const handleResolveDiscount = async () => {
    if (!selectedDiscount || !discountPin) return;
    setDiscountPinError('');
    setProcessing(true);
    try {
      await axios.post(
        `${API_URL}/cs/descuentos/${selectedDiscount.id}/resolver`,
        {
          accion: discountAction,
          pin: discountPin,
          motivo_rechazo: discountAction === 'rechazar' ? discountRejectReason : undefined,
        },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setSnackbar({
        open: true,
        message: discountAction === 'aprobar' ? '✅ Descuento aprobado' : '❌ Descuento rechazado',
        severity: 'success',
      });
      setDiscountPinDialog(false);
      setDiscountPin('');
      setDiscountRejectReason('');
      setSelectedDiscount(null);
      loadDiscountData();
    } catch (error: any) {
      setDiscountPinError(error?.response?.data?.error || 'PIN inválido');
    }
    setProcessing(false);
  };

  const handleApprove = async (userId: number) => {
    // Verificar si es repartidor con licencia vencida
    if (selectedUser?.role === 'repartidor' && selectedUser.driver_license_expiry) {
      const expiryDate = new Date(selectedUser.driver_license_expiry);
      if (expiryDate < new Date()) {
        setSnackbar({ 
          open: true, 
          message: '⚠️ No se puede aprobar: La licencia de conducir está vencida', 
          severity: 'error' 
        });
        return;
      }
    }
    
    setProcessing(true);
    try {
      await axios.post(`${API_URL}/admin/verifications/${userId}/approve`, {}, 
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setSnackbar({ open: true, message: '✅ Usuario verificado exitosamente', severity: 'success' });
      setViewDialog(false);
      loadData();
    } catch (error) {
      console.error('Error:', error);
      setSnackbar({ open: true, message: 'Error al aprobar', severity: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedUser) return;
    setProcessing(true);
    try {
      await axios.post(`${API_URL}/admin/verifications/${selectedUser.id}/reject`, 
        { reason: rejectReason },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setSnackbar({ open: true, message: '❌ Verificación rechazada', severity: 'success' });
      setRejectDialog(false);
      setViewDialog(false);
      setRejectReason('');
      loadData();
    } catch (error) {
      console.error('Error:', error);
      setSnackbar({ open: true, message: 'Error al rechazar', severity: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  // Re-ejecuta el análisis de IA con los documentos ya guardados
  const handleReanalyze = async () => {
    if (!selectedUser) return;
    setProcessing(true);
    try {
      const resp = await axios.post(
        `${API_URL}/admin/verifications/${selectedUser.id}/reanalyze`,
        {},
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      const reason = resp.data?.aiAnalysis?.reason || 'Análisis completado';
      const newStatus = resp.data?.newStatus;
      setSnackbar({
        open: true,
        message: `IA: ${reason}`,
        severity: newStatus === 'verified' ? 'success' : 'info',
      });
      // Actualizar el motivo en el estado local sin cerrar el modal
      setSelectedUser({
        ...selectedUser,
        ai_verification_reason: reason,
        verification_status: newStatus || selectedUser.verification_status,
      });
      // Si quedó verificado automáticamente, recargamos lista
      if (newStatus === 'verified') {
        setTimeout(() => { setViewDialog(false); loadData(); }, 1200);
      }
    } catch (error) {
      console.error('Error re-analizando:', error);
      setSnackbar({ open: true, message: 'Error al re-analizar con IA', severity: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  const openViewDialog = async (user: PendingUser) => {
    // Mostrar el diálogo de inmediato con la info ya conocida
    setSelectedUser(user);
    setViewDialog(true);
    setLoadingDetail(true);
    try {
      const token = getToken();
      const res = await axios.get(
        `${API_URL}/admin/verifications/${user.id}/details`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Mezclar para conservar flags has_* del listado
      setSelectedUser({ ...user, ...res.data });
    } catch (err) {
      const e = err as { response?: { data?: unknown }; message?: string };
      console.error('Error cargando detalle:', e?.response?.data || e?.message);
      setSnackbar({
        open: true,
        message: 'No se pudieron cargar las fotos del usuario',
        severity: 'error',
      });
    } finally {
      setLoadingDetail(false);
    }
  };

  const openRejectDialog = () => {
    setRejectDialog(true);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress sx={{ color: ORANGE }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: BLACK }}>
            🔐 {i18n.language === 'es' ? 'Verificaciones' : 'Verifications'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {i18n.language === 'es' 
              ? 'Verificación de identidad y aprobación de descuentos' 
              : 'Identity verification and discount approvals'}
          </Typography>
        </Box>
        <Tooltip title={i18n.language === 'es' ? 'Actualizar' : 'Refresh'}>
          <IconButton onClick={() => { loadData(); if (activeTab === 1) loadDiscountData(); }} sx={{ bgcolor: 'grey.100' }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab
            icon={<Badge badgeContent={stats?.pending || 0} color="warning"><VerifiedUserIcon /></Badge>}
            label={i18n.language === 'es' ? 'Verificar Identidad' : 'Identity Verification'}
          />
          <Tab
            icon={<Badge badgeContent={discountStats?.pendientes || 0} color="error"><DiscountIcon /></Badge>}
            label={i18n.language === 'es' ? 'Verificar Descuento' : 'Discount Verification'}
          />
        </Tabs>
      </Paper>

      {/* Tab 0: Identity Verification */}
      {activeTab === 0 && (
      <>
      {/* Stats Cards */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 4 }}>
        <Box sx={{ flex: '1 1 200px', minWidth: 180 }}>
          <Card sx={{ background: `linear-gradient(135deg, #ff9800 0%, #ffb74d 100%)`, color: 'white' }}>
            <CardContent sx={{ py: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">{stats?.pending || 0}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    {i18n.language === 'es' ? 'Pendientes' : 'Pending'}
                  </Typography>
                </Box>
                <Badge badgeContent={stats?.pending || 0} color="error">
                  <PendingIcon sx={{ fontSize: 40 }} />
                </Badge>
              </Box>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ flex: '1 1 200px', minWidth: 180 }}>
          <Card sx={{ background: `linear-gradient(135deg, #4caf50 0%, #81c784 100%)`, color: 'white' }}>
            <CardContent sx={{ py: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">{stats?.verified || 0}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    {i18n.language === 'es' ? 'Verificados' : 'Verified'}
                  </Typography>
                </Box>
                <VerifiedUserIcon sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ flex: '1 1 200px', minWidth: 180 }}>
          <Card sx={{ background: `linear-gradient(135deg, #f44336 0%, #e57373 100%)`, color: 'white' }}>
            <CardContent sx={{ py: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">{stats?.rejected || 0}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    {i18n.language === 'es' ? 'Rechazados' : 'Rejected'}
                  </Typography>
                </Box>
                <BlockIcon sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ flex: '1 1 200px', minWidth: 180 }}>
          <Card sx={{ background: `linear-gradient(135deg, #9e9e9e 0%, #bdbdbd 100%)`, color: 'white' }}>
            <CardContent sx={{ py: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">{stats?.not_started || 0}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    {i18n.language === 'es' ? 'Sin iniciar' : 'Not Started'}
                  </Typography>
                </Box>
                <PersonIcon sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Pending Verifications List */}
      <Paper elevation={3} sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ bgcolor: ORANGE, px: 3, py: 2 }}>
          <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
            📋 {i18n.language === 'es' ? 'Verificaciones Pendientes' : 'Pending Verifications'}
            {pendingUsers.length > 0 && (
              <Chip label={pendingUsers.length} size="small" sx={{ ml: 2, bgcolor: 'white', color: ORANGE }} />
            )}
          </Typography>
        </Box>

        {pendingUsers.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <VerifiedUserIcon sx={{ fontSize: 64, color: '#4caf50', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              {i18n.language === 'es' ? '¡Todo al día!' : 'All caught up!'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {i18n.language === 'es' ? 'No hay verificaciones pendientes' : 'No pending verifications'}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: 2 }}>
            {pendingUsers.map((user, index) => (
              <Box key={user.id}>
                <Box sx={{ 
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  p: 2, borderRadius: 2, '&:hover': { bgcolor: 'grey.50' }
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar 
                      sx={{ bgcolor: ORANGE, width: 50, height: 50 }}
                      src={resolveImageSrc(user.avatar_url || user.selfie_url || user.profile_photo_url) || undefined}
                    >
                      {user.full_name?.charAt(0) || '?'}
                    </Avatar>
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography fontWeight="bold">{user.full_name}</Typography>
                        {user.is_employee_onboarded && (
                          <Chip label="Empleado" size="small" color="primary" sx={{ height: 20 }} />
                        )}
                        {user.role && user.role !== 'client' && (
                          <Chip label={user.role} size="small" variant="outlined" sx={{ height: 20 }} />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary">{user.email}</Typography>
                      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                        <Chip label={user.box_id || 'Sin BOX'} size="small" variant="outlined" />
                        <Chip 
                          label={user.verification_submitted_at ? new Date(user.verification_submitted_at).toLocaleDateString('es-MX', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                          }) : 'Sin fecha'}
                          size="small" 
                          icon={<PendingIcon />}
                          color="warning"
                        />
                      </Box>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="outlined"
                      startIcon={<VisibilityIcon />}
                      onClick={() => openViewDialog(user)}
                      sx={{ borderColor: ORANGE, color: ORANGE }}
                    >
                      {i18n.language === 'es' ? 'Revisar' : 'Review'}
                    </Button>
                    <Button
                      variant="contained"
                      startIcon={<CheckCircleIcon />}
                      onClick={() => handleApprove(user.id)}
                      sx={{ bgcolor: '#4caf50', '&:hover': { bgcolor: '#388e3c' } }}
                    >
                      {i18n.language === 'es' ? 'Aprobar' : 'Approve'}
                    </Button>
                  </Box>
                </Box>
                {index < pendingUsers.length - 1 && <Divider />}
              </Box>
            ))}
          </Box>
        )}
      </Paper>
      </>
      )}

      {/* Tab 1: Discount Verification */}
      {activeTab === 1 && (
        <Box>
          {/* Discount Stats */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 4 }}>
            <Box sx={{ flex: '1 1 200px', minWidth: 180 }}>
              <Card sx={{ background: 'linear-gradient(135deg, #ff9800 0%, #ffb74d 100%)', color: 'white' }}>
                <CardContent sx={{ py: 2 }}>
                  <Typography variant="h3" fontWeight="bold">{discountStats?.pendientes || 0}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Pendientes</Typography>
                </CardContent>
              </Card>
            </Box>
            <Box sx={{ flex: '1 1 200px', minWidth: 180 }}>
              <Card sx={{ background: 'linear-gradient(135deg, #4caf50 0%, #81c784 100%)', color: 'white' }}>
                <CardContent sx={{ py: 2 }}>
                  <Typography variant="h3" fontWeight="bold">{discountStats?.aprobados || 0}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Aprobados</Typography>
                </CardContent>
              </Card>
            </Box>
            <Box sx={{ flex: '1 1 200px', minWidth: 180 }}>
              <Card sx={{ background: 'linear-gradient(135deg, #f44336 0%, #e57373 100%)', color: 'white' }}>
                <CardContent sx={{ py: 2 }}>
                  <Typography variant="h3" fontWeight="bold">{discountStats?.rechazados || 0}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Rechazados</Typography>
                </CardContent>
              </Card>
            </Box>
            <Box sx={{ flex: '1 1 200px', minWidth: 180 }}>
              <Card sx={{ background: 'linear-gradient(135deg, #9c27b0 0%, #ce93d8 100%)', color: 'white' }}>
                <CardContent sx={{ py: 2 }}>
                  <Typography variant="h3" fontWeight="bold">
                    ${(discountStats?.monto_pendiente || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Monto Pendiente</Typography>
                </CardContent>
              </Card>
            </Box>
          </Box>

          {/* Discount Requests Table */}
          <Paper elevation={3} sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ bgcolor: '#9c27b0', px: 3, py: 2 }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
                🏷️ Solicitudes de Descuento Pendientes
                {discountRequests.length > 0 && (
                  <Chip label={discountRequests.length} size="small" sx={{ ml: 2, bgcolor: 'white', color: '#9c27b0' }} />
                )}
              </Typography>
            </Box>

            {discountLoading ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <CircularProgress />
              </Box>
            ) : discountRequests.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <DiscountIcon sx={{ fontSize: 64, color: '#4caf50', mb: 2 }} />
                <Typography variant="h6" color="text.secondary">¡Todo al día!</Typography>
                <Typography variant="body2" color="text.secondary">No hay descuentos pendientes de aprobación</Typography>
              </Box>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Guía</TableCell>
                    <TableCell>Cliente</TableCell>
                    <TableCell>Concepto</TableCell>
                    <TableCell align="right">Monto</TableCell>
                    <TableCell>Solicitante</TableCell>
                    <TableCell>Fecha</TableCell>
                    <TableCell align="center">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {discountRequests.map((req) => (
                    <TableRow key={req.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{req.guia_tracking}</Typography>
                        <Typography variant="caption" color="text.secondary">{req.servicio}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{req.cliente_nombre || `ID: ${req.cliente_id}`}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{req.concepto}</Typography>
                        {req.notas && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{req.notas}</Typography>}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={700} color="success.main">
                          -${Number(req.monto).toLocaleString('en-US', { minimumFractionDigits: 2 })} {req.moneda || 'MXN'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{req.solicitado_nombre || `ID: ${req.solicitado_por}`}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {new Date(req.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            startIcon={<CheckCircleIcon />}
                            onClick={() => {
                              setSelectedDiscount(req);
                              setDiscountAction('aprobar');
                              setDiscountPinDialog(true);
                            }}
                          >
                            Aprobar
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            startIcon={<CancelIcon />}
                            onClick={() => {
                              setSelectedDiscount(req);
                              setDiscountAction('rechazar');
                              setDiscountPinDialog(true);
                            }}
                          >
                            Rechazar
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </Box>
      )}

      {/* View Documents Dialog */}
      <Dialog open={viewDialog} onClose={() => setViewDialog(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ bgcolor: BLACK, color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <VerifiedUserIcon />
            {i18n.language === 'es' ? 'Verificación de' : 'Verification for'} {selectedUser?.full_name}
          </Box>
          <IconButton onClick={() => setViewDialog(false)} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {selectedUser && (
            <Box>
              {/* User Info */}
              <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.100', borderRadius: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">Información del Usuario</Typography>
                <Box sx={{ display: 'flex', gap: 4, mt: 1, flexWrap: 'wrap' }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Nombre</Typography>
                    <Typography fontWeight="bold">{selectedUser.full_name}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Email</Typography>
                    <Typography>{selectedUser.email}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">BOX ID</Typography>
                    <Typography fontWeight="bold" color={ORANGE}>{selectedUser.box_id || 'Sin asignar'}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Teléfono</Typography>
                    <Typography>{selectedUser.phone || 'No registrado'}</Typography>
                  </Box>
                </Box>
                {selectedUser.ai_verification_reason && (
                  <Alert
                    severity="info"
                    sx={{ mt: 2 }}
                    action={
                      <Button
                        size="small"
                        color="warning"
                        variant="outlined"
                        disabled={processing}
                        onClick={handleReanalyze}
                      >
                        🤖 Re-analizar IA
                      </Button>
                    }
                  >
                    <Typography variant="body2">
                      <strong>Motivo IA:</strong> {selectedUser.ai_verification_reason}
                    </Typography>
                  </Alert>
                )}
              </Box>

              {/* Documents */}
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <BadgeIcon /> Documentos
              </Typography>
              {/* Aviso si las fotos están en formato HEIC (iOS) no compatible */}
              {(() => {
                const fields = [
                  selectedUser.ine_front_url,
                  selectedUser.ine_back_url,
                  selectedUser.selfie_url,
                  selectedUser.profile_photo_url,
                  selectedUser.driver_license_front_url,
                  selectedUser.driver_license_back_url,
                ];
                const hasHeic = fields.some((f) => {
                  if (!f || typeof f !== 'string') return false;
                  const i = f.indexOf(',');
                  const sample = i > 0 ? f.substring(i + 1, i + 100) : f.substring(0, 100);
                  return isHeicBase64(sample);
                });
                if (!hasHeic) return null;
                return (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    <Typography variant="body2" fontWeight={700}>
                      Fotos en formato HEIC (iOS) no compatibles
                    </Typography>
                    <Typography variant="caption">
                      El usuario subió las fotos en formato HEIC desde un iPhone, formato que no se puede mostrar en navegadores. Por favor solicítale que vuelva a tomar las fotos desde la app actualizada (la nueva versión las convierte a JPEG automáticamente).
                    </Typography>
                  </Alert>
                );
              })()}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
                {/* INE Frente */}
                <Box sx={{ flex: '1 1 300px', minWidth: 250 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <BadgeIcon fontSize="small" /> ID Frente
                  </Typography>
                  <Paper sx={{ p: 1, bgcolor: 'grey.50', textAlign: 'center', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {loadingDetail && !selectedUser.ine_front_url ? (
                      <CircularProgress size={28} sx={{ color: ORANGE }} />
                    ) : resolveImageSrc(selectedUser.ine_front_url) ? (
                      <img 
                        src={resolveImageSrc(selectedUser.ine_front_url) as string} 
                        alt="INE Frente" 
                        style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8 }}
                      />
                    ) : (
                      <Box sx={{ py: 4, color: 'text.secondary' }}>
                        <BadgeIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                        <Typography variant="body2">No disponible</Typography>
                      </Box>
                    )}
                  </Paper>
                </Box>

                {/* INE Reverso */}
                <Box sx={{ flex: '1 1 300px', minWidth: 250 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <BadgeIcon fontSize="small" /> ID Reverso
                  </Typography>
                  <Paper sx={{ p: 1, bgcolor: 'grey.50', textAlign: 'center', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {loadingDetail && !selectedUser.ine_back_url ? (
                      <CircularProgress size={28} sx={{ color: ORANGE }} />
                    ) : resolveImageSrc(selectedUser.ine_back_url) ? (
                      <img 
                        src={resolveImageSrc(selectedUser.ine_back_url) as string} 
                        alt="INE Reverso" 
                        style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8 }}
                      />
                    ) : (
                      <Box sx={{ py: 4, color: 'text.secondary' }}>
                        <BadgeIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                        <Typography variant="body2">No disponible</Typography>
                      </Box>
                    )}
                  </Paper>
                </Box>

                {/* Selfie / Foto de Perfil */}
                <Box sx={{ flex: '1 1 300px', minWidth: 250 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CameraAltIcon fontSize="small" /> {selectedUser.is_employee_onboarded ? 'Foto de Perfil' : 'Selfie'}
                  </Typography>
                  <Paper sx={{ p: 1, bgcolor: 'grey.50', textAlign: 'center', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {(() => {
                      const src = resolveImageSrc(selectedUser.selfie_url) || resolveImageSrc(selectedUser.profile_photo_url);
                      if (loadingDetail && !src) return <CircularProgress size={28} sx={{ color: ORANGE }} />;
                      return src ? (
                        <img 
                          src={src} 
                          alt="Selfie" 
                          style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8 }}
                        />
                      ) : (
                        <Box sx={{ py: 4, color: 'text.secondary' }}>
                          <CameraAltIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                          <Typography variant="body2">No disponible</Typography>
                        </Box>
                      );
                    })()}
                  </Paper>
                </Box>

                {/* Firma - solo para clientes */}
                {!selectedUser.is_employee_onboarded && (
                <Box sx={{ flex: '1 1 300px', minWidth: 250 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DrawIcon fontSize="small" /> Firma Digital
                  </Typography>
                  <Paper sx={{ p: 1, bgcolor: 'grey.50', textAlign: 'center' }}>
                    {(() => {
                      const src = resolveImageSrc(selectedUser.signature_url);
                      return src ? (
                        <Box sx={{ py: 2 }}>
                          <img 
                            src={src}
                            alt="Firma" 
                            style={{ 
                              maxWidth: '100%', 
                              maxHeight: 150, 
                              border: '1px solid #e0e0e0',
                              borderRadius: 8,
                              backgroundColor: '#fff'
                            }} 
                          />
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Firma registrada</Typography>
                        </Box>
                      ) : (
                        <Box sx={{ py: 4, color: 'text.secondary' }}>
                          <DrawIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                          <Typography variant="body2">No disponible</Typography>
                        </Box>
                      );
                    })()}
                  </Paper>
                </Box>
                )}
              </Box>

              {/* Licencia de Conducir - siempre visible para empleados */}
              {selectedUser.is_employee_onboarded && (
                <>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                    <DirectionsCarIcon /> Licencia de Conducir
                    {selectedUser.driver_license_expiry ? (
                      <>
                        <Typography variant="body2" sx={{ ml: 2, color: 'text.secondary' }}>
                          Vence: {new Date(selectedUser.driver_license_expiry).toLocaleDateString('es-MX')}
                        </Typography>
                        <Chip 
                          size="small"
                          label={new Date(selectedUser.driver_license_expiry) > new Date() ? '✅ Vigente' : '❌ Vencida'}
                          color={new Date(selectedUser.driver_license_expiry) > new Date() ? 'success' : 'error'}
                          sx={{ ml: 1 }}
                        />
                      </>
                    ) : (
                      <Chip
                        size="small"
                        label="⚠️ Sin fecha de vencimiento"
                        color="warning"
                        sx={{ ml: 2 }}
                      />
                    )}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
                    <Box sx={{ flex: '1 1 300px', minWidth: 250 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Licencia Frente</Typography>
                      <Paper sx={{ p: 1, bgcolor: 'grey.50', textAlign: 'center', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {loadingDetail && !selectedUser.driver_license_front_url ? (
                          <CircularProgress size={28} sx={{ color: ORANGE }} />
                        ) : resolveImageSrc(selectedUser.driver_license_front_url) ? (
                          <img 
                            src={resolveImageSrc(selectedUser.driver_license_front_url) as string} 
                            alt="Licencia Frente" 
                            style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8 }}
                          />
                        ) : (
                          <Box sx={{ py: 4, color: 'text.secondary' }}>
                            <DirectionsCarIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                            <Typography variant="body2">No disponible</Typography>
                          </Box>
                        )}
                      </Paper>
                    </Box>
                    <Box sx={{ flex: '1 1 300px', minWidth: 250 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Licencia Reverso</Typography>
                      <Paper sx={{ p: 1, bgcolor: 'grey.50', textAlign: 'center', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {loadingDetail && !selectedUser.driver_license_back_url ? (
                          <CircularProgress size={28} sx={{ color: ORANGE }} />
                        ) : resolveImageSrc(selectedUser.driver_license_back_url) ? (
                          <img 
                            src={resolveImageSrc(selectedUser.driver_license_back_url) as string} 
                            alt="Licencia Reverso" 
                            style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8 }}
                          />
                        ) : (
                          <Box sx={{ py: 4, color: 'text.secondary' }}>
                            <DirectionsCarIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                            <Typography variant="body2">No disponible</Typography>
                          </Box>
                        )}
                      </Paper>
                    </Box>
                  </Box>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 2 }}>
          <Button
            variant="outlined"
            color="error"
            startIcon={<CancelIcon />}
            onClick={openRejectDialog}
            disabled={processing}
          >
            {i18n.language === 'es' ? 'Rechazar' : 'Reject'}
          </Button>
          <Button
            variant="contained"
            startIcon={processing ? <CircularProgress size={20} color="inherit" /> : <CheckCircleIcon />}
            onClick={() => selectedUser && handleApprove(selectedUser.id)}
            disabled={processing}
            sx={{ bgcolor: '#4caf50', '&:hover': { bgcolor: '#388e3c' } }}
          >
            {i18n.language === 'es' ? 'Aprobar Verificación' : 'Approve Verification'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialog} onClose={() => setRejectDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: '#f44336' }}>
          ❌ {i18n.language === 'es' ? 'Rechazar Verificación' : 'Reject Verification'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {i18n.language === 'es' 
              ? 'Por favor indica el motivo del rechazo:' 
              : 'Please provide a reason for rejection:'}
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={i18n.language === 'es' ? 'Ej: Documentos ilegibles, selfie no coincide...' : 'Ex: Illegible documents, selfie does not match...'}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialog(false)}>
            {i18n.language === 'es' ? 'Cancelar' : 'Cancel'}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleReject}
            disabled={processing || !rejectReason.trim()}
            startIcon={processing ? <CircularProgress size={20} color="inherit" /> : <CancelIcon />}
          >
            {i18n.language === 'es' ? 'Confirmar Rechazo' : 'Confirm Rejection'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Discount PIN Authorization Dialog */}
      <Dialog open={discountPinDialog} onClose={() => { setDiscountPinDialog(false); setDiscountPin(''); setDiscountPinError(''); setDiscountRejectReason(''); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: discountAction === 'aprobar' ? '#4caf50' : '#f44336' }}>
          {discountAction === 'aprobar' ? '✅ Aprobar Descuento' : '❌ Rechazar Descuento'}
        </DialogTitle>
        <DialogContent>
          {selectedDiscount && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                <Typography variant="body2"><strong>Guía:</strong> {selectedDiscount.guia_tracking}</Typography>
                <Typography variant="body2"><strong>Cliente:</strong> {selectedDiscount.cliente_nombre}</Typography>
                <Typography variant="body2"><strong>Monto:</strong> <span style={{ color: '#4caf50', fontWeight: 700 }}>-${Number(selectedDiscount.monto).toLocaleString('en-US', { minimumFractionDigits: 2 })} {selectedDiscount.moneda || 'MXN'}</span></Typography>
                <Typography variant="body2"><strong>Concepto:</strong> {selectedDiscount.concepto}</Typography>
                {selectedDiscount.notas && <Typography variant="body2"><strong>Notas:</strong> {selectedDiscount.notas}</Typography>}
                <Typography variant="body2"><strong>Solicitado por:</strong> {selectedDiscount.solicitado_nombre}</Typography>
              </Paper>

              <Alert severity="warning">
                Se requiere el PIN de un Director o Super Admin para {discountAction === 'aprobar' ? 'aprobar' : 'rechazar'} este descuento.
              </Alert>

              {discountAction === 'rechazar' && (
                <TextField
                  label="Motivo del rechazo"
                  multiline
                  rows={2}
                  value={discountRejectReason}
                  onChange={(e) => setDiscountRejectReason(e.target.value)}
                  placeholder="Explica por qué se rechaza el descuento..."
                />
              )}

              <TextField
                label="PIN de Director"
                type="password"
                value={discountPin}
                onChange={(e) => { setDiscountPin(e.target.value); setDiscountPinError(''); }}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleResolveDiscount()}
                error={!!discountPinError}
                helperText={discountPinError}
                InputProps={{
                  startAdornment: <InputAdornment position="start">🔑</InputAdornment>,
                }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDiscountPinDialog(false); setDiscountPin(''); setDiscountPinError(''); setDiscountRejectReason(''); }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color={discountAction === 'aprobar' ? 'success' : 'error'}
            onClick={handleResolveDiscount}
            disabled={!discountPin || processing}
            startIcon={processing ? <CircularProgress size={20} color="inherit" /> : discountAction === 'aprobar' ? <CheckCircleIcon /> : <CancelIcon />}
          >
            {discountAction === 'aprobar' ? 'Autorizar Descuento' : 'Confirmar Rechazo'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
