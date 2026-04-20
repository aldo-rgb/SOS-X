// ============================================
// PERFIL - CLIENTE
// Página de perfil para clientes (mirror de app móvil)
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
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
  Stepper,
  Step,
  StepLabel,
  Checkbox,
  FormControlLabel,
  useMediaQuery,
  useTheme,
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
  CameraAlt as CameraIcon,
  Image as ImageIcon,
  PhoneIphone as PhoneIphoneIcon,
  Warning as WarningIcon,
  Draw as DrawIcon,
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
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

  // Verification modal state
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationStep, setVerificationStep] = useState(0);
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [verificationImages, setVerificationImages] = useState<{[key: string]: string}>({});
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsScrolled, setTermsScrolled] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [showCameraPreview, setShowCameraPreview] = useState(false);
  const [currentCaptureStep, setCurrentCaptureStep] = useState<string>('');

  // GEX auto-config
  const [gexAutoEnabled, setGexAutoEnabled] = useState(false);
  const [gexAutoLoading, setGexAutoLoading] = useState(false);
  const [gexPolicyModalOpen, setGexPolicyModalOpen] = useState(false);
  const [gexPolicyScrolled, setGexPolicyScrolled] = useState(false);
  const [gexPolicyAccepted, setGexPolicyAccepted] = useState(false);
  const [gexPolicySignature, setGexPolicySignature] = useState<string | null>(null);
  const gexPolicyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gexPolicyDrawing, setGexPolicyDrawing] = useState(false);

  // Signature canvas refs and state
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  
  // Términos y Condiciones
  const TERMS_AND_CONDITIONS = `LOGISTI-K SYSTEMS DEVELOPMENT S.A. DE C.V. (en adelante como "LSD") y EL CLIENTE, acuerdan que la aceptación y ejecución del presente contrato constituye el consentimiento de EL CLIENTE para sujetarse a los siguientes términos y condiciones:

TÉRMINOS Y CONDICIONES:

OBJETO. El objeto de la relación comercial, así como su alcance, se limitan única y exclusivamente a lo detallado en (las) Cotización(es) que se anexen al presente Contrato de tiempo en tiempo.

CONTRAPRESTACIÓN. La cantidad señalada como contraprestación en la Cotización aplicable será pagada en los términos y condiciones ahí descritos.

OBLIGACIONES DEL CLIENTE. EL CLIENTE se compromete en todo momento a proporcionar la información correcta de sus productos como lo es: fotografías, manuales, listas de empaque, comprobantes de pago de adquisición de mercancías y/o cualquier otra que sea necesaria para el servicio contratado.

CONFIDENCIALIDAD DE LA INFORMACIÓN. Las partes acuerdan considerar como información confidencial cualquier información oral o escrita proporcionada por una a la otra con motivo de esta operación.

VIGENCIA. La relación de este Contrato es por tiempo indefinido y aplicará en todas y cada una de las Cotizaciones que se emitan por LSD.

POLÍTICA DE DEVOLUCIÓN. La garantía de devolución a favor de EL CLIENTE aplicará siempre y cuando sea informado a través de un correo institucional de LSD que su mercancía califica para dicho evento. El reembolso será de USD $7.00 por kilo si el traslado es aéreo/terrestre. Si el traslado es marítimo se reembolsarán USD $800.00 por metro cúbico.

GASTOS DE ALMACENAMIENTO. Una vez transcurrido el plazo de 15 días naturales después de que la mercancía haya arribado a las instalaciones de LSD sin liquidar adeudos, se cobrarán MXN $1.00 por kilo diario de almacenaje.

RENUNCIA DE DERECHOS. Una vez transcurrido el plazo de 60 días naturales sin liquidar adeudos, EL CLIENTE renuncia a sus derechos de propiedad sobre dichas mercancías.

LÍMITE DE RESPONSABILIDAD. El límite máximo de responsabilidad de LSD no excederá del 50% del valor total de la contraprestación pactada.

FIRMA DIGITAL. Las Partes consienten el uso de firma electrónica, dando el mismo valor a documentos firmados digitalmente como si hubieran sido firmados de forma autógrafa.

JURISDICCIÓN. Para la interpretación y cumplimiento, las partes se someten a las leyes aplicables en Monterrey, Nuevo León.`;

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
      // Load GEX auto config
      if (response.data.gex_auto_enabled !== undefined) {
        setGexAutoEnabled(!!response.data.gex_auto_enabled);
      }
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

  const handleToggleGexAuto = (enabled: boolean) => {
    if (enabled) {
      // Show policy modal first
      setGexPolicyScrolled(false);
      setGexPolicyAccepted(false);
      setGexPolicySignature(null);
      setGexPolicyModalOpen(true);
    } else {
      // Disable directly
      confirmGexAutoToggle(false);
    }
  };

  const confirmGexAutoToggle = async (enabled: boolean) => {
    setGexAutoLoading(true);
    try {
      await api.put('/gex/auto-config', { enabled, signature: gexPolicySignature });
      setGexAutoEnabled(enabled);
      setGexPolicyModalOpen(false);
      setSnackbar({ open: true, message: enabled ? '🛡️ GEX automático activado para todos tus embarques' : 'GEX automático desactivado', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Error al actualizar configuración', severity: 'error' });
    } finally {
      setGexAutoLoading(false);
    }
  };

  const initGexPolicyCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    gexPolicyCanvasRef.current = canvas;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.lineCap = 'round'; }
  }, []);

  const gexPolicyMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = gexPolicyCanvasRef.current; if (!canvas) return;
    setGexPolicyDrawing(true);
    const ctx = canvas.getContext('2d'); const rect = canvas.getBoundingClientRect();
    ctx?.beginPath(); ctx?.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  }, []);

  const gexPolicyMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gexPolicyDrawing) return;
    const canvas = gexPolicyCanvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); const rect = canvas.getBoundingClientRect();
    ctx?.lineTo(e.clientX - rect.left, e.clientY - rect.top); ctx?.stroke();
  }, [gexPolicyDrawing]);

  const gexPolicyMouseUp = useCallback(() => {
    if (gexPolicyDrawing) { setGexPolicyDrawing(false); const c = gexPolicyCanvasRef.current; if (c) setGexPolicySignature(c.toDataURL('image/png')); }
  }, [gexPolicyDrawing]);

  const clearGexPolicySignature = useCallback(() => {
    const c = gexPolicyCanvasRef.current;
    if (c) { const ctx = c.getContext('2d'); if (ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); } }
    setGexPolicySignature(null);
  }, []);

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

  // Detectar si hay cámara disponible
  const checkCamera = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setHasCamera(videoDevices.length > 0);
    } catch {
      setHasCamera(false);
    }
  };

  // Abrir modal de verificación
  const openVerificationModal = () => {
    checkCamera();
    setShowVerificationModal(true);
    setVerificationStep(0);
    setVerificationImages({});
    setTermsAccepted(false);
    setTermsScrolled(false);
    setSignature(null);
    setHasDrawn(false);
  };

  // Cerrar cámara y modal
  const closeVerificationModal = () => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
    setShowCameraPreview(false);
    setShowVerificationModal(false);
  };

  // Manejar captura desde cámara
  const handleCapture = async (stepKey: string) => {
    setCurrentCaptureStep(stepKey);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: stepKey === 'selfie' ? 'user' : 'environment' } 
      });
      setVideoStream(stream);
      setShowCameraPreview(true);
    } catch (error) {
      setSnackbar({ open: true, message: 'No se pudo acceder a la cámara', severity: 'error' });
    }
  };

  // Tomar foto desde preview de cámara
  const takePhoto = () => {
    const video = document.getElementById('camera-preview') as HTMLVideoElement;
    if (video) {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      setVerificationImages(prev => ({ ...prev, [currentCaptureStep]: imageData }));
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        setVideoStream(null);
      }
      setShowCameraPreview(false);
    }
  };

  // Manejar subida de imagen desde galería
  const handleImageUpload = (stepKey: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setVerificationImages(prev => ({ ...prev, [stepKey]: event.target?.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Verificar si el paso actual está completo
  const isStepComplete = (step: number) => {
    switch (step) {
      case 0: return !!verificationImages['ineFront'];
      case 1: return !!verificationImages['ineBack'];
      case 2: return !!verificationImages['selfie'];
      case 3: return termsAccepted && termsScrolled;
      case 4: return !!signature;
      default: return false;
    }
  };

  // Enviar verificación
  const submitVerification = async () => {
    if (!verificationImages['ineFront'] || !verificationImages['ineBack'] || !verificationImages['selfie'] || !signature) {
      setSnackbar({ open: true, message: 'Por favor completa todos los pasos', severity: 'warning' });
      return;
    }

    setVerifying(true);
    try {
      const response = await api.post('/verify/documents', {
        ineFrontBase64: verificationImages['ineFront'],
        ineBackBase64: verificationImages['ineBack'],
        selfieBase64: verificationImages['selfie'],
        signatureBase64: signature,
      });

      if (response.data.success) {
        if (response.data.pendingReview) {
          setSnackbar({ 
            open: true, 
            message: '📋 Documentos enviados. Un administrador revisará tu verificación en 24-48 horas.', 
            severity: 'info' 
          });
        } else {
          setSnackbar({ 
            open: true, 
            message: `✅ ¡Verificación exitosa! Confianza: ${response.data.confidence || 'alta'}`, 
            severity: 'success' 
          });
        }
        closeVerificationModal();
        loadProfile();
      }
    } catch (error: any) {
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.message || 'Error en la verificación', 
        severity: 'error' 
      });
    } finally {
      setVerifying(false);
    }
  };

  // ---- Signature Canvas Handlers ----
  const initSignatureCanvas = useCallback(() => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Set actual resolution to match display size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2.5;
    // Fill white background
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  // When we reach the signature step, init the canvas
  useEffect(() => {
    if (showVerificationModal && verificationStep === 4 && !signature) {
      // Small delay to let the DOM render
      const timer = setTimeout(() => initSignatureCanvas(), 100);
      return () => clearTimeout(timer);
    }
  }, [showVerificationModal, verificationStep, signature, initSignatureCanvas]);

  const getCanvasPoint = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = (clientX: number, clientY: number) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    isDrawingRef.current = true;
    const { x, y } = getCanvasPoint(canvas, clientX, clientY);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (clientX: number, clientY: number) => {
    if (!isDrawingRef.current) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasPoint(canvas, clientX, clientY);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
  };

  const clearSignatureCanvas = () => {
    setHasDrawn(false);
    setSignature(null);
    initSignatureCanvas();
  };

  const saveSignatureFromCanvas = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setSignature(dataUrl);
  };

  // Manejar scroll de términos
  const handleTermsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const isAtBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 50;
    if (isAtBottom) {
      setTermsScrolled(true);
    }
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
        <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {/* Ícono según estado */}
          {profile?.is_verified ? (
            <CheckCircleIcon sx={{ fontSize: 36, color: '#4CAF50' }} />
          ) : profile?.verification_status === 'pending_review' ? (
            <SecurityIcon sx={{ fontSize: 36, color: '#1976D2' }} />
          ) : profile?.verification_status === 'rejected' ? (
            <WarningIcon sx={{ fontSize: 36, color: '#f44336' }} />
          ) : (
            <CheckCircleIcon sx={{ fontSize: 36, color: '#FFC107' }} />
          )}
          
          <Box sx={{ flex: 1, minWidth: 150 }}>
            {profile?.is_verified ? (
              <>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#4CAF50' }}>
                  ✅ Verificado
                </Typography>
                <Typography variant="body2" sx={{ color: '#888' }}>
                  Tu identidad ha sido verificada
                </Typography>
              </>
            ) : profile?.verification_status === 'pending_review' ? (
              <>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#1976D2' }}>
                  🔎 En Revisión
                </Typography>
                <Typography variant="body2" sx={{ color: '#888' }}>
                  Tus documentos fueron enviados. Un administrador los revisará en 24-48 horas.
                </Typography>
              </>
            ) : profile?.verification_status === 'rejected' ? (
              <>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#f44336' }}>
                  ❌ Verificación Rechazada
                </Typography>
                <Typography variant="body2" sx={{ color: '#888' }}>
                  Tu verificación fue rechazada. Puedes volver a intentarlo.
                </Typography>
              </>
            ) : (
              <>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#FFC107' }}>
                  Pendiente de Verificación
                </Typography>
                <Typography variant="body2" sx={{ color: '#888' }}>
                  Verifica tu identidad para acceder a todos los servicios
                </Typography>
              </>
            )}
          </Box>
          
          {/* Botón: gris/deshabilitado si está en revisión, oculto si ya verificado */}
          {!profile?.is_verified && (
            <Button
              variant="contained"
              size="small"
              disabled={profile?.verification_status === 'pending_review'}
              onClick={openVerificationModal}
              sx={{
                bgcolor: profile?.verification_status === 'pending_review' 
                  ? '#bdbdbd' 
                  : profile?.verification_status === 'rejected' ? '#f44336' : ORANGE,
                '&:hover': { 
                  bgcolor: profile?.verification_status === 'pending_review'
                    ? '#bdbdbd'
                    : profile?.verification_status === 'rejected' ? '#d32f2f' : '#d94d1f' 
                },
                '&.Mui-disabled': { bgcolor: '#bdbdbd', color: '#fff' },
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                px: 2,
              }}
            >
              {profile?.verification_status === 'pending_review' 
                ? 'En Espera de Revisión' 
                : profile?.verification_status === 'rejected' 
                  ? 'Reintentar Verificación' 
                  : 'Iniciar Verificación'}
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

        <Divider sx={{ mx: 2 }} />

        {/* GEX Automático */}
        <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ 
            width: 40, height: 40, borderRadius: '10px', bgcolor: '#fff3e0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <SecurityIcon sx={{ color: ORANGE }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#333' }}>
              🛡️ GEX Automático
            </Typography>
            <Typography variant="caption" sx={{ color: '#999' }}>
              Contratar Garantía Extendida automáticamente en cada embarque
            </Typography>
          </Box>
          <Switch
            checked={gexAutoEnabled}
            disabled={gexAutoLoading}
            onChange={(e) => handleToggleGexAuto(e.target.checked)}
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

      {/* Modal de Verificación */}
      <Dialog 
        open={showVerificationModal} 
        onClose={closeVerificationModal} 
        maxWidth="sm" 
        fullWidth
        fullScreen={isMobile}
        PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3, maxHeight: isMobile ? '100vh' : '90vh' } }}
      >
        <DialogTitle sx={{ bgcolor: '#1a3c5a', color: 'white', display: 'flex', alignItems: 'center', gap: 1, py: isMobile ? 1.5 : undefined }}>
          <BadgeIcon />
          <Typography variant={isMobile ? 'subtitle1' : 'h6'} sx={{ fontWeight: 'bold' }}>Verificación de Identidad</Typography>
          <Box sx={{ flex: 1 }} />
          <Typography variant="body2">Paso {verificationStep + 1} de 5</Typography>
        </DialogTitle>
        
        <DialogContent sx={{ p: 0 }}>
          {/* Advertencia de cámara */}
          {hasCamera === false && verificationStep < 3 && (
            <Box sx={{ bgcolor: '#fff3e0', p: 2, display: 'flex', alignItems: 'flex-start', gap: 1.5, borderBottom: '1px solid #ffe0b2' }}>
              <PhoneIphoneIcon sx={{ color: ORANGE, mt: 0.3 }} />
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#e65100' }}>
                  Recomendamos usar un celular
                </Typography>
                <Typography variant="body2" sx={{ color: '#bf360c' }}>
                  No detectamos cámara en tu dispositivo. Para tomar la selfie necesitas cámara. 
                  Puedes continuar subiendo fotos desde archivos, pero recomendamos hacer este proceso desde tu celular.
                </Typography>
              </Box>
            </Box>
          )}

          {/* Stepper */}
          <Box sx={{ px: isMobile ? 1 : 3, pt: 2, pb: 1 }}>
            <Stepper activeStep={verificationStep} alternativeLabel sx={{ '& .MuiStepLabel-label': { fontSize: isMobile ? '0.7rem' : undefined } }}>
              {['ID Frente', 'ID Reverso', 'Selfie', 'Términos', 'Firma'].map((label, index) => (
                <Step key={label} completed={isStepComplete(index)}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          </Box>

          {/* Preview de cámara */}
          {showCameraPreview && videoStream && (
            <Box sx={{ p: 1, textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <video
                id="camera-preview"
                autoPlay
                playsInline
                muted
                ref={(video) => {
                  if (video && videoStream) {
                    video.srcObject = videoStream;
                  }
                }}
                style={{ width: '100%', maxHeight: isMobile ? 'calc(100vh - 220px)' : 400, borderRadius: 12, objectFit: 'cover', transform: currentCaptureStep === 'selfie' ? 'scaleX(-1)' : 'none' }}
              />
            </Box>
          )}

          {/* Contenido del paso actual */}
          {!showCameraPreview && (
            <Box sx={{ p: 3 }}>
              {/* Paso 0: INE Frente */}
              {verificationStep === 0 && (
                <Box sx={{ textAlign: 'center' }}>
                  <BadgeIcon sx={{ fontSize: 64, color: '#1a3c5a', mb: 2 }} />
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>ID Oficial (Frente)</Typography>
                  <Typography variant="body2" sx={{ color: '#666', mb: 3 }}>
                    Toma una foto clara del frente de tu identificación oficial (INE/Pasaporte)
                  </Typography>
                  
                  {verificationImages['ineFront'] ? (
                    <Box>
                      <img src={verificationImages['ineFront']} alt="INE Frente" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />
                      <Button size="small" onClick={() => setVerificationImages(prev => ({ ...prev, ineFront: '' }))} sx={{ mt: 1 }}>
                        Cambiar foto
                      </Button>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {hasCamera !== false && (
                        <Button variant="contained" startIcon={<CameraIcon />} onClick={() => handleCapture('ineFront')} sx={{ bgcolor: '#1a3c5a' }}>
                          Tomar Foto
                        </Button>
                      )}
                      <Button variant="outlined" startIcon={<ImageIcon />} component="label">
                        Subir desde Galería
                        <input type="file" accept="image/*" hidden onChange={(e) => handleImageUpload('ineFront', e)} />
                      </Button>
                    </Box>
                  )}
                </Box>
              )}

              {/* Paso 1: INE Reverso */}
              {verificationStep === 1 && (
                <Box sx={{ textAlign: 'center' }}>
                  <BadgeIcon sx={{ fontSize: 64, color: '#1a3c5a', mb: 2 }} />
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>ID Oficial (Reverso)</Typography>
                  <Typography variant="body2" sx={{ color: '#666', mb: 3 }}>
                    Toma una foto clara del reverso de tu identificación oficial
                  </Typography>
                  
                  {verificationImages['ineBack'] ? (
                    <Box>
                      <img src={verificationImages['ineBack']} alt="INE Reverso" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />
                      <Button size="small" onClick={() => setVerificationImages(prev => ({ ...prev, ineBack: '' }))} sx={{ mt: 1 }}>
                        Cambiar foto
                      </Button>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {hasCamera !== false && (
                        <Button variant="contained" startIcon={<CameraIcon />} onClick={() => handleCapture('ineBack')} sx={{ bgcolor: '#1a3c5a' }}>
                          Tomar Foto
                        </Button>
                      )}
                      <Button variant="outlined" startIcon={<ImageIcon />} component="label">
                        Subir desde Galería
                        <input type="file" accept="image/*" hidden onChange={(e) => handleImageUpload('ineBack', e)} />
                      </Button>
                    </Box>
                  )}
                </Box>
              )}

              {/* Paso 2: Selfie */}
              {verificationStep === 2 && (
                <Box sx={{ textAlign: 'center' }}>
                  <CameraIcon sx={{ fontSize: 64, color: '#1a3c5a', mb: 2 }} />
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Selfie</Typography>
                  <Typography variant="body2" sx={{ color: '#666', mb: 3 }}>
                    Toma una selfie clara de tu rostro mirando directamente a la cámara
                  </Typography>
                  
                  {hasCamera === false && (
                    <Box sx={{ bgcolor: '#ffebee', p: 2, borderRadius: 2, mb: 2 }}>
                      <Typography variant="body2" sx={{ color: '#c62828', display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                        <WarningIcon fontSize="small" />
                        Se requiere cámara para la selfie. Por favor usa un celular o sube una foto reciente.
                      </Typography>
                    </Box>
                  )}
                  
                  {verificationImages['selfie'] ? (
                    <Box>
                      <img src={verificationImages['selfie']} alt="Selfie" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />
                      <Button size="small" onClick={() => setVerificationImages(prev => ({ ...prev, selfie: '' }))} sx={{ mt: 1 }}>
                        Cambiar foto
                      </Button>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {hasCamera !== false && (
                        <Button variant="contained" startIcon={<CameraIcon />} onClick={() => handleCapture('selfie')} sx={{ bgcolor: '#1a3c5a' }}>
                          Tomar Selfie
                        </Button>
                      )}
                      <Button variant="outlined" startIcon={<ImageIcon />} component="label">
                        Subir Foto
                        <input type="file" accept="image/*" hidden onChange={(e) => handleImageUpload('selfie', e)} />
                      </Button>
                    </Box>
                  )}
                </Box>
              )}

              {/* Paso 3: Términos */}
              {verificationStep === 3 && (
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, textAlign: 'center' }}>
                    📋 Términos y Condiciones
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#666', mb: 2, textAlign: 'center' }}>
                    Por favor lee los términos y condiciones. Debes llegar al final para poder aceptar.
                  </Typography>
                  
                  <Box 
                    onScroll={handleTermsScroll}
                    sx={{ 
                      maxHeight: 250, 
                      overflow: 'auto', 
                      p: 2, 
                      bgcolor: '#f5f5f5', 
                      borderRadius: 2,
                      border: '1px solid #ddd',
                      fontSize: '0.85rem',
                      lineHeight: 1.6,
                      mb: 2,
                    }}
                  >
                    {TERMS_AND_CONDITIONS.split('\n\n').map((paragraph, i) => (
                      <Typography key={i} variant="body2" sx={{ mb: 1.5 }}>
                        {paragraph}
                      </Typography>
                    ))}
                  </Box>
                  
                  <FormControlLabel
                    control={
                      <Checkbox 
                        checked={termsAccepted} 
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        disabled={!termsScrolled}
                        sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }}
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{ color: termsScrolled ? '#333' : '#999' }}>
                        He leído y acepto los términos y condiciones
                        {!termsScrolled && ' (desplázate hasta el final para aceptar)'}
                      </Typography>
                    }
                  />
                </Box>
              )}

              {/* Paso 4: Firma */}
              {verificationStep === 4 && (
                <Box sx={{ textAlign: 'center' }}>
                  <DrawIcon sx={{ fontSize: 48, color: '#1a3c5a', mb: 1 }} />
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Firma Digital</Typography>
                  <Typography variant="body2" sx={{ color: '#666', mb: 2 }}>
                    Dibuja tu firma en el recuadro usando tu dedo o mouse
                  </Typography>
                  
                  {signature ? (
                    <Box>
                      <Box sx={{ border: '2px solid #4CAF50', borderRadius: 2, p: 1, bgcolor: '#f9fff9', mb: 1 }}>
                        <img src={signature} alt="Firma" style={{ maxWidth: '100%', maxHeight: 140, display: 'block', margin: '0 auto' }} />
                      </Box>
                      <Button size="small" color="error" onClick={clearSignatureCanvas} sx={{ mt: 1 }}>
                        ✕ Borrar y firmar de nuevo
                      </Button>
                    </Box>
                  ) : (
                    <Box>
                      {/* Drawing Canvas */}
                      <Box
                        sx={{
                          border: '2px solid #1a3c5a',
                          borderRadius: 2,
                          overflow: 'hidden',
                          bgcolor: '#fff',
                          touchAction: 'none',
                          cursor: 'crosshair',
                          position: 'relative',
                          mb: 1,
                        }}
                      >
                        <canvas
                          ref={signatureCanvasRef}
                          style={{ width: '100%', height: 180, display: 'block', touchAction: 'none' }}
                          onMouseDown={(e) => startDrawing(e.clientX, e.clientY)}
                          onMouseMove={(e) => draw(e.clientX, e.clientY)}
                          onMouseUp={stopDrawing}
                          onMouseLeave={stopDrawing}
                          onTouchStart={(e) => {
                            e.preventDefault();
                            const touch = e.touches[0];
                            startDrawing(touch.clientX, touch.clientY);
                          }}
                          onTouchMove={(e) => {
                            e.preventDefault();
                            const touch = e.touches[0];
                            draw(touch.clientX, touch.clientY);
                          }}
                          onTouchEnd={(e) => {
                            e.preventDefault();
                            stopDrawing();
                          }}
                        />
                        {!hasDrawn && (
                          <Typography
                            variant="body2"
                            sx={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              color: '#bbb',
                              pointerEvents: 'none',
                              userSelect: 'none',
                              fontSize: isMobile ? '0.85rem' : '0.9rem',
                            }}
                          >
                            ✍️ Firma aquí
                          </Typography>
                        )}
                      </Box>

                      {/* Canvas action buttons */}
                      <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', mb: 2, flexWrap: 'wrap' }}>
                        <Button
                          size="small"
                          variant="contained"
                          disabled={!hasDrawn}
                          onClick={saveSignatureFromCanvas}
                          sx={{ bgcolor: '#4CAF50', '&:hover': { bgcolor: '#388E3C' }, textTransform: 'none', borderRadius: 2, px: 3 }}
                        >
                          ✓ Guardar Firma
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={!hasDrawn}
                          onClick={clearSignatureCanvas}
                          sx={{ textTransform: 'none', borderRadius: 2 }}
                        >
                          Limpiar
                        </Button>
                      </Box>

                      <Divider sx={{ my: 1.5 }}>
                        <Typography variant="caption" sx={{ color: '#999' }}>o bien</Typography>
                      </Divider>

                      {/* Upload fallback */}
                      <Button variant="outlined" size="small" startIcon={<ImageIcon />} component="label" sx={{ textTransform: 'none' }}>
                        Subir imagen de firma
                        <input type="file" accept="image/*" hidden onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => setSignature(event.target?.result as string);
                            reader.readAsDataURL(file);
                          }
                        }} />
                      </Button>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2, borderTop: '1px solid #eee' }}>
          {showCameraPreview ? (
            <>
              <Button onClick={() => {
                if (videoStream) {
                  videoStream.getTracks().forEach(track => track.stop());
                  setVideoStream(null);
                }
                setShowCameraPreview(false);
              }} sx={{ color: '#666' }}>
                Cancelar
              </Button>
              <Box sx={{ flex: 1 }} />
              <Button 
                variant="contained" 
                onClick={takePhoto} 
                startIcon={<CameraIcon />}
                sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d94d1f' }, borderRadius: 2, px: 3 }}
              >
                📸 Tomar Foto
              </Button>
            </>
          ) : (
            <>
              <Button onClick={closeVerificationModal} sx={{ color: '#666' }}>
                Cancelar
              </Button>
              <Box sx={{ flex: 1 }} />
              {verificationStep > 0 && (
                <Button onClick={() => setVerificationStep(s => s - 1)} sx={{ color: '#1a3c5a' }}>
                  Anterior
                </Button>
              )}
              {verificationStep < 4 ? (
                <Button 
                  variant="contained" 
                  onClick={() => setVerificationStep(s => s + 1)}
                  disabled={!isStepComplete(verificationStep)}
                  sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d94d1f' } }}
                >
                  Siguiente →
                </Button>
              ) : (
                <Button 
                  variant="contained" 
                  onClick={submitVerification}
                  disabled={!isStepComplete(4) || verifying}
                  startIcon={verifying ? <CircularProgress size={16} color="inherit" /> : <CheckCircleIcon />}
                  sx={{ bgcolor: '#4CAF50', '&:hover': { bgcolor: '#388E3C' } }}
                >
                  {verifying ? 'Verificando...' : 'Completar Verificación'}
                </Button>
              )}
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* Modal Políticas GEX Automático */}
      <Dialog open={gexPolicyModalOpen} onClose={() => setGexPolicyModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: ORANGE, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <SecurityIcon />
          Contrato de Garantía Extendida Automática
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ p: 2.5, bgcolor: '#f8f9fa' }}>
            <Typography variant="subtitle1" fontWeight="bold" sx={{ color: ORANGE, mb: 1 }}>
              📋 Política de Garantía Extendida - Vigencia Indefinida
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Al activar el GEX automático, aceptas que se contratará la Garantía Extendida en cada embarque.
            </Typography>
          </Box>
          <Box
            sx={{ maxHeight: 300, overflow: 'auto', p: 2.5, bgcolor: 'white', border: '1px solid #e0e0e0', m: 2, borderRadius: 1 }}
            onScroll={(e: any) => { const el = e.target; if (el.scrollHeight - el.scrollTop - el.clientHeight < 50) setGexPolicyScrolled(true); }}
          >
            <Typography variant="subtitle2" fontWeight="bold" align="center" sx={{ mb: 2 }}>
              CONTRATO DE GARANTÍA EXTENDIDA DE TIEMPO DE ENTREGA DE MERCANCÍA - MODALIDAD AUTOMÁTICA
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              En Logisti-k Systems Development S.A. de C.V. (en adelante "Grupo LSD") nos preocupamos por que nuestros clientes reciban sus cargas en tiempo, forma y en sus mejores condiciones. El presente contrato establece los términos de la contratación automática de la Garantía Extendida de Tiempo de Entrega (en adelante "GEX") para todos los embarques del Cliente.
            </Typography>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ color: ORANGE, mb: 1 }}>CLÁUSULA PRIMERA: OBJETO</Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              El Cliente autoriza que en cada nuevo embarque registrado en la plataforma EntregaX se contrate automáticamente la Garantía Extendida de Tiempo de Entrega de 90 días naturales. El costo de cada póliza será calculado al momento del registro del embarque con base en el valor declarado de la mercancía y el tipo de cambio vigente, y se sumará al saldo pendiente del embarque correspondiente.
            </Typography>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ color: ORANGE, mb: 1 }}>CLÁUSULA SEGUNDA: VIGENCIA DEL CONTRATO</Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              <b>El presente contrato tiene vigencia indefinida</b> a partir de la fecha de firma. Permanecerá activo mientras el Cliente mantenga habilitada la opción de GEX Automático en su perfil. El Cliente podrá desactivar esta funcionalidad en cualquier momento desde la configuración de su perfil, sin penalización alguna. La desactivación surtirá efecto para los embarques registrados a partir de ese momento, sin afectar las pólizas ya contratadas.
            </Typography>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ color: ORANGE, mb: 1 }}>CLÁUSULA TERCERA: CÁLCULO DEL COSTO</Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              El costo de cada póliza GEX se calculará como el 5% del valor asegurado en MXN (valor de factura en USD multiplicado por el tipo de cambio vigente) más una cuota fija de $625.00 MXN. El valor de la mercancía será determinado por el valor declarado en cada embarque individual.
            </Typography>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ color: ORANGE, mb: 1 }}>CLÁUSULA CUARTA: COBERTURA</Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Cada póliza GEX contratada automáticamente cubrirá el tiempo de entrega de hasta 90 días naturales contados a partir de la fecha de embarque. En caso de incumplimiento del plazo, el Cliente podrá iniciar un proceso de reclamación presentando la factura original.
            </Typography>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ color: ORANGE, mb: 1 }}>CLÁUSULA QUINTA: EXCLUSIONES</Typography>
            <Typography variant="body2" sx={{ mb: 0.5 }}>• Retrasos por trámites aduanales o retenciones gubernamentales.</Typography>
            <Typography variant="body2" sx={{ mb: 0.5 }}>• Fraude o negligencia del Cliente.</Typography>
            <Typography variant="body2" sx={{ mb: 0.5 }}>• Mercancía perecedera o de naturaleza frágil no declarada.</Typography>
            <Typography variant="body2" sx={{ mb: 0.5 }}>• Guerras, actos de terrorismo o desastres naturales.</Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>• Mercancía prohibida o restringida por la ley.</Typography>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ color: ORANGE, mb: 1 }}>CLÁUSULA SEXTA: CANCELACIÓN</Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              El Cliente puede cancelar este contrato en cualquier momento desactivando la opción "GEX Automático" en su perfil de usuario. Las pólizas ya generadas no serán canceladas y mantendrán su cobertura hasta el vencimiento del plazo de 90 días de cada embarque.
            </Typography>
          </Box>
          {!gexPolicyScrolled && (
            <Alert severity="error" sx={{ mx: 2, mb: 1 }}>Desplázate hacia abajo para leer todo el contrato</Alert>
          )}
          <Box sx={{ px: 2, pb: 1 }}>
            <FormControlLabel
              control={<Checkbox checked={gexPolicyAccepted} onChange={(e) => setGexPolicyAccepted(e.target.checked)} disabled={!gexPolicyScrolled} sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }} />}
              label={<Typography variant="body2">He leído y acepto los términos del contrato de Garantía Extendida Automática con vigencia indefinida</Typography>}
            />
          </Box>
          {gexPolicyAccepted && (
            <Box sx={{ px: 2, pb: 2 }}>
              <Typography variant="subtitle2" fontWeight="bold" sx={{ color: ORANGE, mb: 1 }}>✍️ Firma Digital</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Firma para confirmar la activación del GEX automático.</Typography>
              <Box sx={{ border: '2px dashed #ccc', borderRadius: 2, mb: 1, overflow: 'hidden' }}>
                <canvas ref={initGexPolicyCanvas} width={450} height={150} style={{ width: '100%', height: 150, cursor: 'crosshair', display: 'block' }}
                  onMouseDown={gexPolicyMouseDown} onMouseMove={gexPolicyMouseMove} onMouseUp={gexPolicyMouseUp} onMouseLeave={gexPolicyMouseUp} />
              </Box>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Button size="small" color="error" onClick={clearGexPolicySignature}>Limpiar</Button>
                {gexPolicySignature && <Typography variant="caption" color="success.main">✓ Firma capturada</Typography>}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#f5f5f5' }}>
          <Button onClick={() => setGexPolicyModalOpen(false)} sx={{ color: 'text.secondary' }}>Cancelar</Button>
          <Button variant="contained" onClick={() => confirmGexAutoToggle(true)}
            disabled={!gexPolicyAccepted || !gexPolicySignature || gexAutoLoading}
            sx={{ bgcolor: '#10B981', '&:hover': { bgcolor: '#059669' }, px: 3 }}>
            {gexAutoLoading ? 'Activando...' : '✓ Activar GEX Automático'}
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
