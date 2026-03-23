// ============================================
// PERFIL - CLIENTE
// Página de perfil para clientes (mirror de app móvil)
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Avatar,
  Button,
  TextField,
  IconButton,
  Divider,
  CircularProgress,
  Switch,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  CheckCircle as CheckCircleIcon,
  Lock as LockIcon,
  Security as SecurityIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Edit as EditIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Badge as BadgeIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import api from '../services/api';

const ORANGE = '#F05A28';

interface ProfileClientProps {
  onBack: () => void;
}

interface UserProfile {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  box_id: string;
  role: string;
  is_verified: boolean;
  verification_status: string;
  profile_photo_url: string | null;
  created_at: string;
  two_factor_enabled: boolean;
  rfc: string;
}

const ProfileClient = ({ onBack }: ProfileClientProps) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'info' | 'warning' });

  // Change password dialog
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Edit phone dialog
  const [showEditPhone, setShowEditPhone] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [phonePassword, setPhonePassword] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/auth/profile');
      setProfile(response.data);
    } catch (error) {
      console.error('Error loading profile:', error);
      // Fallback from localStorage
      const saved = localStorage.getItem('user');
      if (saved) {
        const parsed = JSON.parse(saved);
        setProfile({
          id: parsed.id,
          full_name: parsed.name || parsed.full_name || '',
          email: parsed.email || '',
          phone: parsed.phone || '',
          box_id: parsed.boxId || parsed.box_id || '',
          role: parsed.role || 'client',
          is_verified: parsed.isVerified ?? parsed.is_verified ?? false,
          verification_status: parsed.verificationStatus || parsed.verification_status || 'pending',
          profile_photo_url: parsed.profilePhotoUrl || parsed.profile_photo_url || null,
          created_at: parsed.created_at || '',
          two_factor_enabled: parsed.twoFactorEnabled ?? parsed.two_factor_enabled ?? false,
          rfc: parsed.rfc || '',
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      setSnackbar({ open: true, message: 'Completa todos los campos', severity: 'warning' });
      return;
    }
    if (newPassword.length < 6) {
      setSnackbar({ open: true, message: 'La contraseña debe tener al menos 6 caracteres', severity: 'warning' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setSnackbar({ open: true, message: 'Las contraseñas no coinciden', severity: 'error' });
      return;
    }
    try {
      setChangingPassword(true);
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setSnackbar({ open: true, message: '✅ Contraseña actualizada correctamente', severity: 'success' });
      setShowChangePassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      setSnackbar({ open: true, message: error.response?.data?.error || 'Error al cambiar contraseña', severity: 'error' });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleUpdatePhone = async () => {
    if (!newPhone || !phonePassword) {
      setSnackbar({ open: true, message: 'Completa todos los campos', severity: 'warning' });
      return;
    }
    try {
      setSavingPhone(true);
      await api.put('/auth/update-profile', {
        phone: newPhone,
        password: phonePassword,
      });
      setSnackbar({ open: true, message: '✅ Teléfono actualizado correctamente', severity: 'success' });
      setShowEditPhone(false);
      setNewPhone('');
      setPhonePassword('');
      loadProfile();
    } catch (error: any) {
      setSnackbar({ open: true, message: error.response?.data?.error || 'Error al actualizar teléfono', severity: 'error' });
    } finally {
      setSavingPhone(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSnackbar({ open: true, message: 'Copiado al portapapeles', severity: 'info' });
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress sx={{ color: ORANGE }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: '#f5f5f5', minHeight: 'calc(100vh - 64px)', maxWidth: 640, mx: 'auto' }}>
      {/* Back button */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={onBack}
        sx={{ mb: 2, color: '#333', fontWeight: 600, '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' } }}
      >
        Volver al Portal
      </Button>

      {/* Profile Card */}
      <Paper sx={{ borderRadius: 3, overflow: 'hidden', mb: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
        <Box sx={{ height: 4, background: `linear-gradient(90deg, ${ORANGE} 0%, #ff7043 50%, ${ORANGE} 100%)` }} />
        <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2.5 }}>
          <Avatar
            src={profile?.profile_photo_url || undefined}
            sx={{
              width: 64,
              height: 64,
              bgcolor: ORANGE,
              fontSize: '1.5rem',
              fontWeight: 700,
            }}
          >
            {getInitials(profile?.full_name || 'U')}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#1a1a2e', lineHeight: 1.3 }}>
              {profile?.full_name || 'Usuario'}
            </Typography>
            <Typography variant="body2" sx={{ color: '#666', mt: 0.25 }}>
              {profile?.email}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
              <BadgeIcon sx={{ fontSize: 16, color: ORANGE }} />
              <Typography variant="body2" sx={{ color: ORANGE, fontWeight: 600 }}>
                Suite: {profile?.box_id}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* Estado de Verificación */}
      <Typography variant="overline" sx={{ color: '#999', fontWeight: 600, letterSpacing: 1, ml: 1, display: 'block', mb: 1 }}>
        ESTADO DE VERIFICACIÓN
      </Typography>
      <Paper sx={{ borderRadius: 3, mb: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
        <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
          <CheckCircleIcon sx={{ 
            fontSize: 36, 
            color: profile?.is_verified ? '#4CAF50' : '#FFC107',
          }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: profile?.is_verified ? '#4CAF50' : '#FFC107' }}>
              {profile?.is_verified ? 'Verificado' : 'Pendiente de Verificación'}
            </Typography>
            <Typography variant="body2" sx={{ color: '#888' }}>
              {profile?.is_verified 
                ? 'Tu identidad ha sido verificada' 
                : 'Tu cuenta está en proceso de verificación'
              }
            </Typography>
          </Box>
          {!profile?.is_verified && (
            <Button
              variant="contained"
              size="small"
              onClick={() => {
                // Abrir el formulario de verificación
                window.open('https://forms.gle/TuFormularioDeVerificacion', '_blank');
                // O alternativamente navegar a una pantalla de verificación interna
                // setShowVerificationModal(true);
              }}
              sx={{
                bgcolor: ORANGE,
                '&:hover': { bgcolor: '#d94d1f' },
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                px: 2,
              }}
            >
              Iniciar Verificación
            </Button>
          )}
        </Box>
      </Paper>

      {/* Seguridad */}
      <Typography variant="overline" sx={{ color: '#999', fontWeight: 600, letterSpacing: 1, ml: 1, display: 'block', mb: 1 }}>
        SEGURIDAD
      </Typography>
      <Paper sx={{ borderRadius: 3, mb: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
        {/* Cambiar Contraseña */}
        <Box 
          sx={{ 
            p: 2.5, 
            display: 'flex', 
            alignItems: 'center', 
            gap: 2, 
            cursor: 'pointer',
            transition: 'background 0.2s',
            '&:hover': { bgcolor: '#fafafa' },
          }}
          onClick={() => setShowChangePassword(true)}
        >
          <Box sx={{ 
            width: 40, height: 40, borderRadius: '10px', bgcolor: '#f0f0f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <LockIcon sx={{ color: '#555' }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#333' }}>
              Cambiar Contraseña
            </Typography>
            <Typography variant="caption" sx={{ color: '#999' }}>
              Actualiza tu contraseña de acceso
            </Typography>
          </Box>
          <Typography sx={{ color: '#ccc', fontSize: 20 }}>›</Typography>
        </Box>

        <Divider sx={{ mx: 2 }} />

        {/* Autenticación 2FA */}
        <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ 
            width: 40, height: 40, borderRadius: '10px', bgcolor: '#f0f0f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <SecurityIcon sx={{ color: '#555' }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#333' }}>
              Autenticación 2FA
            </Typography>
            <Typography variant="caption" sx={{ color: '#999' }}>
              Protege tu cuenta con verificación en dos pasos
            </Typography>
          </Box>
          <Switch
            checked={profile?.two_factor_enabled || false}
            onChange={() => {
              setSnackbar({ open: true, message: 'Contacta a soporte para activar 2FA', severity: 'info' });
            }}
            sx={{
              '& .MuiSwitch-switchBase.Mui-checked': { color: ORANGE },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: ORANGE },
            }}
          />
        </Box>
      </Paper>

      {/* Información de la Cuenta */}
      <Typography variant="overline" sx={{ color: '#999', fontWeight: 600, letterSpacing: 1, ml: 1, display: 'block', mb: 1 }}>
        INFORMACIÓN DE LA CUENTA
      </Typography>
      <Paper sx={{ borderRadius: 3, mb: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
        {/* Teléfono */}
        <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ 
            width: 40, height: 40, borderRadius: '10px', bgcolor: '#f0f0f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <PhoneIcon sx={{ color: '#555' }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" sx={{ color: '#999' }}>Teléfono</Typography>
            <Typography variant="body1" sx={{ fontWeight: 600, color: '#333' }}>
              {profile?.phone || 'No registrado'}
            </Typography>
          </Box>
          <IconButton 
            size="small" 
            onClick={() => { setNewPhone(profile?.phone || ''); setShowEditPhone(true); }}
            sx={{ color: ORANGE }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Box>

        <Divider sx={{ mx: 2 }} />

        {/* Email */}
        <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ 
            width: 40, height: 40, borderRadius: '10px', bgcolor: '#f0f0f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <EmailIcon sx={{ color: '#555' }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" sx={{ color: '#999' }}>Correo electrónico</Typography>
            <Typography variant="body1" sx={{ fontWeight: 600, color: '#333' }}>
              {profile?.email || 'No registrado'}
            </Typography>
          </Box>
          <IconButton 
            size="small" 
            onClick={() => copyToClipboard(profile?.email || '')}
            sx={{ color: '#999' }}
          >
            <CopyIcon fontSize="small" />
          </IconButton>
        </Box>

        <Divider sx={{ mx: 2 }} />

        {/* Suite */}
        <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ 
            width: 40, height: 40, borderRadius: '10px', bgcolor: '#f0f0f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BadgeIcon sx={{ color: '#555' }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" sx={{ color: '#999' }}>Suite / No. de Cliente</Typography>
            <Typography variant="body1" sx={{ fontWeight: 600, color: '#333' }}>
              {profile?.box_id || 'N/A'}
            </Typography>
          </Box>
          <IconButton 
            size="small" 
            onClick={() => copyToClipboard(profile?.box_id || '')}
            sx={{ color: '#999' }}
          >
            <CopyIcon fontSize="small" />
          </IconButton>
        </Box>
      </Paper>

      {/* Dialog: Cambiar Contraseña */}
      <Dialog 
        open={showChangePassword} 
        onClose={() => setShowChangePassword(false)} 
        maxWidth="xs" 
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700 }}>
          <LockIcon sx={{ color: ORANGE }} />
          Cambiar Contraseña
        </DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <TextField
            fullWidth
            label="Contraseña actual"
            type={showCurrentPw ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            sx={{ mb: 2 }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowCurrentPw(!showCurrentPw)}>
                    {showCurrentPw ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField
            fullWidth
            label="Nueva contraseña"
            type={showNewPw ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            sx={{ mb: 2 }}
            helperText="Mínimo 6 caracteres"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowNewPw(!showNewPw)}>
                    {showNewPw ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField
            fullWidth
            label="Confirmar nueva contraseña"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={confirmPassword !== '' && confirmPassword !== newPassword}
            helperText={confirmPassword !== '' && confirmPassword !== newPassword ? 'Las contraseñas no coinciden' : ''}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setShowChangePassword(false)} sx={{ color: '#666' }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleChangePassword}
            disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d94d1a' }, borderRadius: 2, px: 3 }}
            startIcon={changingPassword ? <CircularProgress size={16} color="inherit" /> : <LockIcon />}
          >
            {changingPassword ? 'Guardando...' : 'Cambiar Contraseña'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Editar Teléfono */}
      <Dialog 
        open={showEditPhone} 
        onClose={() => setShowEditPhone(false)} 
        maxWidth="xs" 
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700 }}>
          <PhoneIcon sx={{ color: ORANGE }} />
          Actualizar Teléfono
        </DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <TextField
            fullWidth
            label="Nuevo teléfono"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            sx={{ mb: 2 }}
            placeholder="10 dígitos"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <PhoneIcon sx={{ color: '#999', fontSize: 20 }} />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            fullWidth
            label="Contraseña (para confirmar)"
            type="password"
            value={phonePassword}
            onChange={(e) => setPhonePassword(e.target.value)}
            helperText="Se requiere tu contraseña para actualizar el teléfono"
          />
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setShowEditPhone(false)} sx={{ color: '#666' }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleUpdatePhone}
            disabled={savingPhone || !newPhone || !phonePassword}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d94d1a' }, borderRadius: 2, px: 3 }}
            startIcon={savingPhone ? <CircularProgress size={16} color="inherit" /> : <EditIcon />}
          >
            {savingPhone ? 'Guardando...' : 'Actualizar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={4000} 
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ProfileClient;
