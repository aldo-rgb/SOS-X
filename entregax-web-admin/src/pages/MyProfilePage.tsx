// ============================================
// MI PERFIL - ADMIN / STAFF
// Gestión de teléfono, contraseña, foto de perfil
// ============================================

import { useState, useEffect, useRef } from 'react';
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
  Lock as LockIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Edit as EditIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Badge as BadgeIcon,
  CameraAlt as CameraIcon,
  Save as SaveIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import api from '../services/api';

const ORANGE = '#F05A28';

interface MyProfilePageProps {
  onBack: () => void;
}

interface UserProfile {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  box_id: string;
  role: string;
  profile_photo_url: string | null;
  created_at: string;
  rfc: string | null;
}

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  director: 'Director',
  branch_manager: 'Gerente de Sucursal',
  finanzas: 'Finanzas',
  customer_service: 'Servicio al Cliente',
  counter_staff: 'Mostrador',
  warehouse_ops: 'Operaciones / Bodega',
  advisor: 'Asesor',
  sub_advisor: 'Sub-Asesor',
  client: 'Cliente',
};

const MyProfilePage = ({ onBack }: MyProfilePageProps) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Phone editing
  const [editingPhone, setEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [phonePassword, setPhonePassword] = useState('');
  const [showPhonePassword, setShowPhonePassword] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);

  // Change password dialog
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Photo
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const res = await api.get('/auth/profile');
      setProfile(res.data);
    } catch (err) {
      console.error('Error cargando perfil:', err);
      setSnackbar({ open: true, message: 'Error al cargar perfil', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // ========== PHONE ==========
  const handleSavePhone = async () => {
    if (!newPhone.trim()) {
      setSnackbar({ open: true, message: 'Ingresa un número de teléfono', severity: 'error' });
      return;
    }
    if (!phonePassword) {
      setSnackbar({ open: true, message: 'Ingresa tu contraseña para confirmar', severity: 'error' });
      return;
    }
    try {
      setSavingPhone(true);
      await api.put('/auth/update-profile', {
        phone: newPhone.trim(),
        password: phonePassword,
      });
      setSnackbar({ open: true, message: 'Teléfono actualizado correctamente', severity: 'success' });
      setEditingPhone(false);
      setPhonePassword('');
      loadProfile();
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Error al actualizar teléfono';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setSavingPhone(false);
    }
  };

  // ========== PASSWORD ==========
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      setSnackbar({ open: true, message: 'Completa todos los campos', severity: 'error' });
      return;
    }
    if (newPassword.length < 6) {
      setSnackbar({ open: true, message: 'La contraseña debe tener al menos 6 caracteres', severity: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setSnackbar({ open: true, message: 'Las contraseñas no coinciden', severity: 'error' });
      return;
    }
    try {
      setChangingPassword(true);
      const res = await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      console.log('✅ Cambio de contraseña exitoso:', res.data);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowChangePassword(false);
      // Mostrar snackbar DESPUÉS de cerrar dialog para que sea visible
      setTimeout(() => {
        setSnackbar({ open: true, message: '✅ Contraseña actualizada correctamente. Usa la nueva contraseña en tu próximo inicio de sesión.', severity: 'success' });
      }, 300);
    } catch (err: any) {
      console.error('❌ Error cambio contraseña:', err.response?.status, err.response?.data);
      const msg = err.response?.data?.error || 'Error al cambiar contraseña';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setChangingPassword(false);
    }
  };

  // ========== PHOTO ==========
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tamaño (máx 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setSnackbar({ open: true, message: 'La imagen no debe superar 2MB', severity: 'error' });
      return;
    }

    // Validar tipo
    if (!file.type.startsWith('image/')) {
      setSnackbar({ open: true, message: 'Solo se permiten imágenes', severity: 'error' });
      return;
    }

    try {
      setUploadingPhoto(true);

      // Convertir a base64
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          await api.put('/auth/profile-photo', { photo: base64 });
          setSnackbar({ open: true, message: 'Foto de perfil actualizada', severity: 'success' });
          loadProfile();
        } catch (err: any) {
          const msg = err.response?.data?.error || 'Error al subir foto';
          setSnackbar({ open: true, message: msg, severity: 'error' });
        } finally {
          setUploadingPhoto(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setUploadingPhoto(false);
      setSnackbar({ open: true, message: 'Error al procesar imagen', severity: 'error' });
    }

    // Limpiar input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemovePhoto = async () => {
    try {
      setUploadingPhoto(true);
      await api.put('/auth/profile-photo', { photo: null });
      setSnackbar({ open: true, message: 'Foto eliminada', severity: 'success' });
      loadProfile();
    } catch {
      setSnackbar({ open: true, message: 'Error al eliminar foto', severity: 'error' });
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress sx={{ color: ORANGE }} />
      </Box>
    );
  }

  if (!profile) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography color="error">No se pudo cargar el perfil</Typography>
        <Button onClick={onBack} sx={{ mt: 2 }}>Volver</Button>
      </Box>
    );
  }

  const initials = profile.full_name
    .split(' ')
    .map(w => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={onBack} sx={{ mr: 1 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" fontWeight={700}>
          Mi Perfil
        </Typography>
      </Box>

      {/* Foto y nombre */}
      <Paper
        sx={{
          p: 4,
          borderRadius: 3,
          mb: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'relative',
        }}
      >
        {/* Avatar con botón de cámara */}
        <Box sx={{ position: 'relative', mb: 2 }}>
          <Avatar
            src={profile.profile_photo_url || undefined}
            sx={{
              width: 100,
              height: 100,
              fontSize: 36,
              bgcolor: `${ORANGE}20`,
              border: `3px solid ${ORANGE}`,
              color: ORANGE,
            }}
          >
            {initials}
          </Avatar>
          <IconButton
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            sx={{
              position: 'absolute',
              bottom: -4,
              right: -4,
              bgcolor: 'white',
              color: ORANGE,
              width: 36,
              height: 36,
              boxShadow: 2,
              '&:hover': { bgcolor: '#f5f5f5' },
            }}
          >
            {uploadingPhoto ? <CircularProgress size={18} sx={{ color: ORANGE }} /> : <CameraIcon fontSize="small" />}
          </IconButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handlePhotoSelect}
          />
        </Box>

        <Typography variant="h5" fontWeight={700} color="text.primary">
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {roleLabels[profile.role] || profile.role}
        </Typography>
        {profile.box_id && (
          <Typography variant="caption" sx={{ color: ORANGE, mt: 0.5, bgcolor: `${ORANGE}10`, px: 1.5, py: 0.3, borderRadius: 1 }}>
            📦 {profile.box_id}
          </Typography>
        )}

        {/* Botón eliminar foto */}
        {profile.profile_photo_url && (
          <Button
            size="small"
            onClick={handleRemovePhoto}
            disabled={uploadingPhoto}
            sx={{ color: '#999', fontSize: '0.7rem', mt: 1, textTransform: 'none' }}
          >
            Eliminar foto
          </Button>
        )}
      </Paper>

      {/* Información del perfil */}
      <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <BadgeIcon sx={{ color: ORANGE }} />
          Información Personal
        </Typography>

        {/* Email (solo lectura) */}
        <Box sx={{ display: 'flex', alignItems: 'center', py: 1.5, borderBottom: '1px solid #f0f0f0' }}>
          <EmailIcon sx={{ color: '#999', mr: 2, fontSize: 20 }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary">Correo electrónico</Typography>
            <Typography variant="body2" fontWeight={500}>{profile.email}</Typography>
          </Box>
        </Box>

        {/* Teléfono (editable) */}
        <Box sx={{ py: 1.5, borderBottom: '1px solid #f0f0f0' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <PhoneIcon sx={{ color: '#999', mr: 2, fontSize: 20 }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary">Teléfono</Typography>
              {!editingPhone ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" fontWeight={500}>
                    {profile.phone || 'Sin teléfono registrado'}
                  </Typography>
                  <IconButton size="small" onClick={() => { setEditingPhone(true); setNewPhone(profile.phone || ''); }}>
                    <EditIcon sx={{ fontSize: 16, color: ORANGE }} />
                  </IconButton>
                </Box>
              ) : (
                <Box sx={{ mt: 1 }}>
                  <TextField
                    size="small"
                    fullWidth
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="Ej: +52 1 614 123 4567"
                    sx={{ mb: 1 }}
                  />
                  <TextField
                    size="small"
                    fullWidth
                    type={showPhonePassword ? 'text' : 'password'}
                    value={phonePassword}
                    onChange={(e) => setPhonePassword(e.target.value)}
                    placeholder="Contraseña actual (requerida)"
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setShowPhonePassword(!showPhonePassword)}>
                            {showPhonePassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                    sx={{ mb: 1 }}
                  />
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={savingPhone ? <CircularProgress size={14} sx={{ color: 'white' }} /> : <SaveIcon />}
                      onClick={handleSavePhone}
                      disabled={savingPhone}
                      sx={{
                        bgcolor: ORANGE,
                        '&:hover': { bgcolor: '#C1272D' },
                        textTransform: 'none',
                        borderRadius: 2,
                      }}
                    >
                      Guardar
                    </Button>
                    <Button
                      size="small"
                      startIcon={<CloseIcon />}
                      onClick={() => { setEditingPhone(false); setPhonePassword(''); }}
                      sx={{ textTransform: 'none', color: '#666' }}
                    >
                      Cancelar
                    </Button>
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
        </Box>

        {/* RFC (solo lectura) */}
        {profile.rfc && (
          <Box sx={{ display: 'flex', alignItems: 'center', py: 1.5 }}>
            <BadgeIcon sx={{ color: '#999', mr: 2, fontSize: 20 }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary">RFC</Typography>
              <Typography variant="body2" fontWeight={500}>{profile.rfc}</Typography>
            </Box>
          </Box>
        )}
      </Paper>

      {/* Seguridad */}
      <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <LockIcon sx={{ color: ORANGE }} />
          Seguridad
        </Typography>

        {/* Cambiar contraseña */}
        <Box
          onClick={() => setShowChangePassword(true)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            py: 2,
            px: 2,
            borderRadius: 2,
            cursor: 'pointer',
            transition: 'all 0.2s',
            '&:hover': { bgcolor: '#fef3ef' },
          }}
        >
          <Box sx={{ bgcolor: `${ORANGE}15`, borderRadius: 2, p: 1, mr: 2, display: 'flex' }}>
            <LockIcon sx={{ color: ORANGE, fontSize: 24 }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body1" fontWeight={600}>Cambiar contraseña</Typography>
            <Typography variant="caption" color="text.secondary">
              Actualiza tu contraseña de acceso
            </Typography>
          </Box>
          <Typography sx={{ color: ORANGE, fontSize: 20 }}>›</Typography>
        </Box>
      </Paper>

      {/* Info de cuenta */}
      <Paper sx={{ p: 3, borderRadius: 3, bgcolor: '#fafafa' }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
          Cuenta creada el {new Date(profile.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
        </Typography>
      </Paper>

      {/* ========== DIALOG: Cambiar Contraseña ========== */}
      <Dialog
        open={showChangePassword}
        onClose={() => !changingPassword && setShowChangePassword(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <LockIcon sx={{ color: ORANGE }} />
          Cambiar Contraseña
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Contraseña actual"
              type={showCurrentPw ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              fullWidth
              size="small"
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
              label="Nueva contraseña"
              type={showNewPw ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              fullWidth
              size="small"
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
              label="Confirmar nueva contraseña"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              fullWidth
              size="small"
              error={confirmPassword.length > 0 && newPassword !== confirmPassword}
              helperText={confirmPassword.length > 0 && newPassword !== confirmPassword ? 'Las contraseñas no coinciden' : ''}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => { setShowChangePassword(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
            disabled={changingPassword}
            sx={{ color: '#666', textTransform: 'none' }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleChangePassword}
            disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
            sx={{
              bgcolor: ORANGE,
              '&:hover': { bgcolor: '#C1272D' },
              textTransform: 'none',
              borderRadius: 2,
              px: 3,
            }}
          >
            {changingPassword ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Cambiar contraseña'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} variant="filled" onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MyProfilePage;
