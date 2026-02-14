import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { 
  Box, Typography, Paper, Card, CardContent, Avatar,
  Button, CircularProgress, Alert, Snackbar, Tooltip, IconButton,
  Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Divider, Badge
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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const ORANGE = '#F05A28';
const BLACK = '#111';

interface PendingUser {
  id: number;
  full_name: string;
  email: string;
  box_id: string;
  phone: string | null;
  verification_status: string;
  verification_submitted_at: string;
  ine_front_url: string;
  ine_back_url: string;
  selfie_url: string;
  signature_url: string;
  ai_verification_reason: string | null;
  created_at: string;
}

interface Stats {
  pending: number;
  verified: number;
  rejected: number;
  not_started: number;
}

export default function VerificationsPage() {
  const { i18n } = useTranslation();
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<PendingUser | null>(null);
  const [viewDialog, setViewDialog] = useState(false);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  const getToken = () => localStorage.getItem('token');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pendingRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/admin/verifications/pending`, { headers: { Authorization: `Bearer ${getToken()}` } }),
        axios.get(`${API_URL}/admin/verifications/stats`, { headers: { Authorization: `Bearer ${getToken()}` } })
      ]);
      setPendingUsers(pendingRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
      setSnackbar({ open: true, message: 'Error al cargar datos', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApprove = async (userId: number) => {
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

  const openViewDialog = (user: PendingUser) => {
    setSelectedUser(user);
    setViewDialog(true);
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: BLACK }}>
            🔐 {i18n.language === 'es' ? 'Verificación de Identidad' : 'Identity Verification'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {i18n.language === 'es' 
              ? 'Revisa y aprueba manualmente las verificaciones pendientes' 
              : 'Review and manually approve pending verifications'}
          </Typography>
        </Box>
        <Tooltip title={i18n.language === 'es' ? 'Actualizar' : 'Refresh'}>
          <IconButton onClick={loadData} sx={{ bgcolor: 'grey.100' }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

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
                    <Avatar sx={{ bgcolor: ORANGE, width: 50, height: 50 }}>
                      {user.full_name?.charAt(0) || '?'}
                    </Avatar>
                    <Box>
                      <Typography fontWeight="bold">{user.full_name}</Typography>
                      <Typography variant="body2" color="text.secondary">{user.email}</Typography>
                      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                        <Chip label={user.box_id || 'Sin BOX'} size="small" variant="outlined" />
                        <Chip 
                          label={new Date(user.verification_submitted_at).toLocaleDateString('es-MX', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                          })}
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
                  <Alert severity="info" sx={{ mt: 2 }}>
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
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
                {/* INE Frente */}
                <Box sx={{ flex: '1 1 300px', minWidth: 250 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <BadgeIcon fontSize="small" /> ID Frente
                  </Typography>
                  <Paper sx={{ p: 1, bgcolor: 'grey.50', textAlign: 'center' }}>
                    {selectedUser.ine_front_url?.startsWith('data:') ? (
                      <img 
                        src={selectedUser.ine_front_url} 
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
                  <Paper sx={{ p: 1, bgcolor: 'grey.50', textAlign: 'center' }}>
                    {selectedUser.ine_back_url?.startsWith('data:') ? (
                      <img 
                        src={selectedUser.ine_back_url} 
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

                {/* Selfie */}
                <Box sx={{ flex: '1 1 300px', minWidth: 250 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CameraAltIcon fontSize="small" /> Selfie
                  </Typography>
                  <Paper sx={{ p: 1, bgcolor: 'grey.50', textAlign: 'center' }}>
                    {selectedUser.selfie_url?.startsWith('data:') ? (
                      <img 
                        src={selectedUser.selfie_url} 
                        alt="Selfie" 
                        style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8 }}
                      />
                    ) : (
                      <Box sx={{ py: 4, color: 'text.secondary' }}>
                        <CameraAltIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                        <Typography variant="body2">No disponible</Typography>
                      </Box>
                    )}
                  </Paper>
                </Box>

                {/* Firma */}
                <Box sx={{ flex: '1 1 300px', minWidth: 250 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DrawIcon fontSize="small" /> Firma Digital
                  </Typography>
                  <Paper sx={{ p: 1, bgcolor: 'grey.50', textAlign: 'center' }}>
                    {selectedUser.signature_url && selectedUser.signature_url !== 'signature_data' ? (
                      <Box sx={{ py: 2 }}>
                        <img 
                          src={selectedUser.signature_url.startsWith('data:') 
                            ? selectedUser.signature_url 
                            : `data:image/png;base64,${selectedUser.signature_url}`}
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
                    )}
                  </Paper>
                </Box>
              </Box>
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
