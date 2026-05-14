import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  InputAdornment,
  IconButton,
  Fade,
  Divider,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stepper,
  Step,
  StepLabel,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import PhoneIcon from '@mui/icons-material/Phone';
import InventoryIcon from '@mui/icons-material/Inventory';
import SocialAuthButtons from '../components/SocialAuthButtons';
import CountryPhoneInput from '../components/CountryPhoneInput';
import PhoneVerificationDialog from '../components/PhoneVerificationDialog';

interface LoginPageProps {
  onLoginSuccess: (userData: any) => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [tabValue, setTabValue] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Forgot password dialog state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState('');

  // Register form state
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [refFromUrl, setRefFromUrl] = useState(false);
  const [validatingCode, setValidatingCode] = useState(false);
  const [codeValidation, setCodeValidation] = useState<{
    valid: boolean;
    referrerName?: string;
    isAdvisor?: boolean;
    phone?: string;
    photoUrl?: string;
  } | null>(null);

  // Existing client dialog state
  const [existingClientDialog, setExistingClientDialog] = useState(false);  const [activationQuestionDialog, setActivationQuestionDialog] = useState(false);
  const [activationFlowSelected, setActivationFlowSelected] = useState(false);

  // Phone verification (post-registro / post-claim)
  const [phoneVerifyOpen, setPhoneVerifyOpen] = useState(false);
  const [pendingPhone, setPendingPhone] = useState('');
  const [pendingUserData, setPendingUserData] = useState<any>(null);
  const [existingClientStep, setExistingClientStep] = useState(0);
  const [existingBoxId, setExistingBoxId] = useState('');
  const [existingName, setExistingName] = useState('');
  const [existingEmail, setExistingEmail] = useState('');
  const [existingPhone, setExistingPhone] = useState('');
  const [existingPassword, setExistingPassword] = useState('');
  const [existingConfirmPassword, setExistingConfirmPassword] = useState('');
  const [existingClientData, setExistingClientData] = useState<any>(null);
  const [existingReferralCode, setExistingReferralCode] = useState('');
  const [existingCodeValidation, setExistingCodeValidation] = useState<{
    valid: boolean;
    referrerName?: string;
    isAdvisor?: boolean;
    phone?: string;
    photoUrl?: string;
  } | null>(null);
  const [existingValidatingCode, setExistingValidatingCode] = useState(false);

  // Box ID Claim dialog (público, sin login)
  const [claimDialog, setClaimDialog] = useState(false);
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [claimSuccess, setClaimSuccess] = useState<{ folio: string } | null>(null);
  const [claimBoxId, setClaimBoxId] = useState('');
  const [claimFullName, setClaimFullName] = useState('');
  const [claimEmail, setClaimEmail] = useState('');
  const [claimPhone, setClaimPhone] = useState('');
  const [claimMessage, setClaimMessage] = useState('');
  const [claimIneFront, setClaimIneFront] = useState<File | null>(null);
  const [claimIneBack, setClaimIneBack] = useState<File | null>(null);

  const openClaimDialog = () => {
    setClaimError('');
    setClaimSuccess(null);
    setClaimBoxId(existingBoxId || '');
    setClaimFullName('');
    setClaimEmail('');
    setClaimPhone('');
    setClaimMessage('');
    setClaimIneFront(null);
    setClaimIneBack(null);
    setClaimDialog(true);
  };

  const handleSubmitClaim = async () => {
    setClaimError('');
    if (!claimBoxId || claimBoxId.trim().length < 2) {
      setClaimError('Ingresa el número de cliente que estás reclamando.');
      return;
    }
    if (!claimFullName || claimFullName.trim().length < 3) {
      setClaimError('Ingresa tu nombre completo.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claimEmail)) {
      setClaimError('Ingresa un correo electrónico válido.');
      return;
    }
    if (!claimPhone || claimPhone.trim().length < 7) {
      setClaimError('Ingresa un teléfono de contacto.');
      return;
    }
    if (!claimIneFront) {
      setClaimError('Adjunta una foto del frente de tu INE.');
      return;
    }
    setClaimSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('box_id', claimBoxId.trim().toUpperCase());
      fd.append('full_name', claimFullName.trim());
      fd.append('email', claimEmail.trim().toLowerCase());
      fd.append('phone', claimPhone.trim());
      if (claimMessage.trim()) fd.append('message', claimMessage.trim());
      fd.append('ine_front', claimIneFront);
      if (claimIneBack) fd.append('ine_back', claimIneBack);

      const resp = await axios.post(`${API_URL}/support/public/claim-box-id`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (resp.data?.success) {
        setClaimSuccess({ folio: resp.data.folio });
      } else {
        setClaimError(resp.data?.error || 'No se pudo registrar la reclamación.');
      }
    } catch (err: any) {
      setClaimError(err?.response?.data?.error || 'Error al enviar la reclamación.');
    } finally {
      setClaimSubmitting(false);
    }
  };

  // Leer código de referido desde URL (?ref=XXXX)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (refCode) {
      const cleanCode = refCode.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
      if (cleanCode.length >= 4) {
        setReferralCode(cleanCode);
        setExistingReferralCode(cleanCode);
        setRefFromUrl(true);
        setTabValue(1); // Cambiar a pestaña de registro
        // Auto-validar el código
        validateReferralCodeFromUrl(cleanCode);
      }
    }
  }, []);

  useEffect(() => {
    if (tabValue === 1 && !activationFlowSelected) {
      setActivationQuestionDialog(true);
    }
  }, [tabValue, activationFlowSelected]);

  const validateReferralCodeFromUrl = async (code: string) => {
    setValidatingCode(true);
    setExistingValidatingCode(true);
    try {
      const response = await axios.get(`${API_URL}/referral/validate/${code}`);
      if (response.data.success && response.data.data) {
        const validationResult = {
          valid: true,
          referrerName: response.data.data.referidor,
          isAdvisor: response.data.data.isAdvisor,
          phone: response.data.data.phone,
          photoUrl: response.data.data.photoUrl,
        };
        setCodeValidation(validationResult);
        setExistingCodeValidation(validationResult);
      } else {
        setCodeValidation({ valid: false });
        setExistingCodeValidation({ valid: false });
      }
    } catch {
      setCodeValidation({ valid: false });
      setExistingCodeValidation({ valid: false });
    } finally {
      setValidatingCode(false);
      setExistingValidatingCode(false);
    }
  };

  // Validate referral code
  const validateReferralCode = async (code: string, forExisting = false) => {
    if (!code || code.length < 4) {
      if (forExisting) {
        setExistingCodeValidation(null);
      } else {
        setCodeValidation(null);
      }
      return;
    }

    if (forExisting) {
      setExistingValidatingCode(true);
    } else {
      setValidatingCode(true);
    }
    
    try {
      const response = await axios.get(`${API_URL}/referral/validate/${code.toUpperCase()}`);
      if (response.data.success && response.data.data) {
        const validationResult = {
          valid: true,
          referrerName: response.data.data.referidor,
          isAdvisor: response.data.data.isAdvisor,
          phone: response.data.data.phone,
          photoUrl: response.data.data.photoUrl,
        };
        if (forExisting) {
          setExistingCodeValidation(validationResult);
        } else {
          setCodeValidation(validationResult);
        }
      } else {
        if (forExisting) {
          setExistingCodeValidation({ valid: false });
        } else {
          setCodeValidation({ valid: false });
        }
      }
    } catch {
      if (forExisting) {
        setExistingCodeValidation({ valid: false });
      } else {
        setCodeValidation({ valid: false });
      }
    } finally {
      if (forExisting) {
        setExistingValidatingCode(false);
      } else {
        setValidatingCode(false);
      }
    }
  };

  const openForgotDialog = () => {
    setForgotEmail(loginEmail.trim());
    setForgotSent(false);
    setForgotError('');
    setForgotOpen(true);
  };
  const closeForgotDialog = () => {
    if (forgotSubmitting) return;
    setForgotOpen(false);
  };

  const handleForgotSubmit = async () => {
    setForgotError('');
    const email = forgotEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setForgotError('Ingresa un email válido');
      return;
    }
    setForgotSubmitting(true);
    try {
      // No exponemos si el email existe o no — el backend siempre
      // responde 200 para no permitir enumeración. Aquí solo
      // mostramos "revisa tu correo".
      await axios.post(`${API_URL}/auth/forgot-password`, { email });
      setForgotSent(true);
    } catch (err: any) {
      setForgotError(err?.response?.data?.error || 'No se pudo enviar el correo. Intenta de nuevo.');
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email: loginEmail,
        password: loginPassword,
      });

      const { user, access } = response.data;

      // Los clientes pueden acceder a su portal especial
      // Solo personal administrativo puede acceder al panel completo
      const isClient = user.role === 'client' || user.role === 'cliente' || user.role === 'Client' || user.role === 'Cliente';
      
      if (!access.canAccessWebAdmin && !isClient) {
        setError('Acceso denegado. Solo personal autorizado puede ingresar al panel administrativo.');
        setLoading(false);
        return;
      }

      // Guardar token y datos del usuario
      localStorage.setItem('token', access.token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('permissions', JSON.stringify(access.permissions));

      onLoginSuccess({ user, access });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validaciones
    if (registerPassword !== registerConfirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (registerPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    // Tel\u00e9fono ahora es OBLIGATORIO (debe traer ya c\u00f3digo de pa\u00eds)
    if (!registerPhone || registerPhone.length < 11) {
      setError('Ingresa tu n\u00famero de WhatsApp con c\u00f3digo de pa\u00eds.');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
        fullName: registerName,
        email: registerEmail,
        phone: registerPhone,
        password: registerPassword,
        referralCodeInput: referralCode.trim().toUpperCase() || undefined,
      });

      const advisorMsg = response.data.user.hasAdvisor ? '\n\u00a1Tu asesor ha sido asignado!' : '';
      const referralMsg = response.data.user.referredBy ? '\n\u00a1Recibir\u00e1s tu bono de bienvenida!' : '';

      // Guardar token y user para que el dialog de OTP pueda usarlos
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
      }
      if (response.data.user) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
      setPendingUserData(response.data);
      setPendingPhone(registerPhone);
      setPhoneVerifyOpen(true);

      setSuccess(`\u00a1Registro exitoso! Tu casillero es ${response.data.user.boxId}.${advisorMsg}${referralMsg}`);
    } catch (err: any) {
      const data = err.response?.data;
      // Si el correo corresponde a un cliente anterior (legacy), redirigir
      // al flujo de "Activar cuenta existente" pre-llenando box_id y nombre.
      if (data?.errorCode === 'LEGACY_EMAIL_EXISTS' && data?.boxId) {
        setExistingBoxId(String(data.boxId).toUpperCase());
        if (data.fullName) setExistingName(String(data.fullName));
        setExistingEmail(registerEmail);
        setExistingClientStep(1); // saltar paso de captura de box_id
        setExistingClientDialog(true);
        setError('');
        setSuccess('Detectamos que ya eres cliente. Continúa para activar tu cuenta existente.');
        setTimeout(() => setSuccess(''), 6000);
      } else {
        setError(data?.error || 'Error al registrar usuario');
      }
    } finally {
      setLoading(false);
    }
  };

  // Existing client functions
  const handleCheckBoxId = async () => {
    if (!existingBoxId || existingBoxId.length < 2) {
      setError('Ingresa tu número de cliente');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_URL}/legacy/verify/${existingBoxId.toUpperCase()}`);
      
      if (!response.data.exists) {
        setError('No encontramos ese número de cliente. Verifica que sea correcto.');
        return;
      }

      if (response.data.isClaimed) {
        setError('Este número de cliente ya fue activado. Intenta iniciar sesión.');
        return;
      }

      setExistingClientStep(1);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al verificar');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyName = async () => {
    if (!existingName || existingName.length < 3) {
      setError('Ingresa tu nombre completo');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await axios.post(`${API_URL}/legacy/verify-name`, {
        boxId: existingBoxId.toUpperCase(),
        fullName: existingName.trim()
      });

      if (response.data.nameMatch && response.data.clientData) {
        setExistingClientData(response.data.clientData);
        setExistingEmail(response.data.clientData.email || '');
        setExistingPhone(response.data.clientData.phone || '');
        setExistingClientStep(2);
      }
    } catch (err: any) {
      if (err.response?.status === 403) {
        setError('El nombre no coincide con nuestros registros. Verifica que sea el mismo nombre con el que te registraste.');
      } else {
        setError(err.response?.data?.error || 'Error al verificar');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteActivation = async () => {
    if (!existingPassword || existingPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (existingPassword !== existingConfirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (!existingEmail || !existingEmail.includes('@')) {
      setError('Ingresa un correo electrónico válido');
      return;
    }
    if (!existingPhone || existingPhone.length < 11) {
      setError('Ingresa tu número de WhatsApp con código de país.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await axios.post(`${API_URL}/legacy/claim`, {
        boxId: existingClientData?.boxId,
        fullName: existingClientData?.fullName,
        email: existingEmail.trim().toLowerCase(),
        phone: existingPhone.trim(),
        newPassword: existingPassword,
        referralCodeInput: existingReferralCode.trim().toUpperCase() || undefined,
      });

      const advisorMsg = response.data.user?.hasAdvisor ? '\n¡Tu asesor ha sido asignado!' : '';
      const referralMsg = response.data.user?.referredBy ? '\n¡Recibirás tu bono de bienvenida!' : '';

      // Persistir token + user para que el OTP dialog pueda autenticarse
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
      }
      if (response.data.user) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
      setPendingUserData(response.data);
      setPendingPhone(existingPhone);
      setExistingClientDialog(false);
      setPhoneVerifyOpen(true);
      setSuccess(`¡Cuenta activada! Tu casillero es ${response.data.user.box_id}.${advisorMsg}${referralMsg}`);
      setLoginEmail(existingEmail);
      setTimeout(() => setSuccess(''), 6000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al activar cuenta');
    } finally {
      setLoading(false);
    }
  };

  const resetExistingClientForm = () => {
    setExistingClientStep(0);
    setExistingBoxId('');
    setExistingName('');
    setExistingEmail('');
    setExistingPhone('');
    setExistingPassword('');
    setExistingConfirmPassword('');
    setExistingClientData(null);
    setExistingReferralCode('');
    setExistingCodeValidation(null);
    setError('');
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#111111',
        p: 2,
      }}
    >
      <Fade in timeout={600}>
        <Paper
          elevation={0}
          sx={{
            width: '100%',
            maxWidth: 440,
            borderRadius: 2,
            border: '1px solid #F05A28',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          }}
        >
          {/* Header - Negro con degradado naranja */}
          <Box
            sx={{
              bgcolor: '#111111',
              color: 'white',
              py: 4,
              px: 3,
              textAlign: 'center',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
              <Box
                component="img"
                src="/logo-paqeteria.png"
                alt="EntregaX"
                sx={{
                  width: 180,
                  height: 'auto',
                  objectFit: 'contain',
                }}
              />
            </Box>
            <Typography variant="body2" sx={{ opacity: 0.6, mt: 1 }}>
              Panel Administrativo
            </Typography>
          </Box>

          {/* Tabs */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#FAFBFC' }}>
            <Tabs
              value={tabValue}
              onChange={(_, newValue) => {
                setTabValue(newValue);
                setError('');
                setSuccess('');

                // Al entrar a "Registrarse", preguntar si ya tiene número de cliente
                if (newValue === 1 && !activationFlowSelected) {
                  setActivationQuestionDialog(true);
                }
              }}
              variant="fullWidth"
              sx={{
                '& .MuiTab-root': {
                  fontWeight: 600,
                  textTransform: 'none',
                  fontSize: '0.95rem',
                  py: 1.5,
                  color: '#6B7280',
                  '&.Mui-selected': {
                    color: '#F05A28',
                  },
                },
                '& .MuiTabs-indicator': {
                  backgroundColor: '#F05A28',
                },
              }}
            >
              <Tab label="Iniciar Sesión" />
              <Tab label="Registrarse" />
            </Tabs>
          </Box>

          {/* Forms */}
          <Box sx={{ p: 4 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                {error}
              </Alert>
            )}
            {success && (
              <Alert 
                severity="success" 
                icon={<CheckCircleOutlineIcon />}
                sx={{ mb: 3, borderRadius: 2 }}
              >
                {success}
              </Alert>
            )}

            {/* Login Form */}
            <TabPanel value={tabValue} index={0}>
              <form onSubmit={handleLogin}>
                <TextField
                  fullWidth
                  label="Correo electrónico"
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  sx={{ mb: 2.5 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailOutlinedIcon sx={{ color: 'text.secondary' }} />
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  fullWidth
                  label="Contraseña"
                  type={showPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  sx={{ mb: 3 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockOutlinedIcon sx={{ color: 'text.secondary' }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          size="small"
                        >
                          {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  size="large"
                  disabled={loading}
                  sx={{
                    py: 1.5,
                    borderRadius: 2,
                    textTransform: 'none',
                    fontSize: '1rem',
                    fontWeight: 700,
                    background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)',
                    boxShadow: '0 4px 12px rgba(240, 90, 40, 0.3)',
                    '&:hover': {
                      background: 'linear-gradient(90deg, #A01F25 0%, #D94A20 100%)',
                      boxShadow: '0 6px 16px rgba(240, 90, 40, 0.4)',
                    },
                  }}
                >
                  {loading ? (
                    <CircularProgress size={24} color="inherit" />
                  ) : (
                    'Ingresar al Panel'
                  )}
                </Button>

                {/* Link "¿Olvidaste tu contraseña?" — abre dialog que
                    pide email y dispara POST /auth/forgot-password. */}
                <Box sx={{ mt: 2, textAlign: 'center' }}>
                  <Button
                    variant="text"
                    onClick={openForgotDialog}
                    sx={{
                      color: '#F05A28',
                      textTransform: 'none',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      '&:hover': { background: 'rgba(240,90,40,0.06)' },
                    }}
                  >
                    ¿Olvidaste tu contraseña?
                  </Button>
                </Box>

                {/* Sign in with Google / Apple (feature-flagged via VITE envs) */}
                <SocialAuthButtons
                  onSuccess={({ user, access }) => onLoginSuccess({ user, access })}
                  onError={(msg) => setError(msg)}
                  onNotRegistered={(prefill) => {
                    setRegisterName(prefill.fullName || '');
                    setRegisterEmail(prefill.email || '');
                    setTabValue(1);
                    setError('');
                    setSuccess(`Aún no tienes cuenta con ${prefill.provider === 'google' ? 'Google' : 'Apple'}. Completa tu registro para crear tu casillero.`);
                    setTimeout(() => setSuccess(''), 8000);
                  }}
                  disabled={loading}
                />
              </form>
            </TabPanel>

            {/* Register Form */}
            <TabPanel value={tabValue} index={1}>
              <form onSubmit={handleRegister}>
                <TextField
                  fullWidth
                  label="Nombre completo"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  required
                  sx={{ mb: 2.5 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonOutlineIcon sx={{ color: 'text.secondary' }} />
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  fullWidth
                  label="Correo electrónico"
                  type="email"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  required
                  sx={{ mb: 2.5 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailOutlinedIcon sx={{ color: 'text.secondary' }} />
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  fullWidth
                  label="Contraseña"
                  type={showPassword ? 'text' : 'password'}
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  required
                  helperText="Mínimo 6 caracteres"
                  sx={{ mb: 2.5 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockOutlinedIcon sx={{ color: 'text.secondary' }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          size="small"
                        >
                          {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  fullWidth
                  label="Confirmar contraseña"
                  type={showPassword ? 'text' : 'password'}
                  value={registerConfirmPassword}
                  onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                  required
                  sx={{ mb: 2.5 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockOutlinedIcon sx={{ color: 'text.secondary' }} />
                      </InputAdornment>
                    ),
                  }}
                />
                <Box sx={{ mb: 2.5 }}>
                  <CountryPhoneInput
                    value={registerPhone}
                    onChange={setRegisterPhone}
                    label="WhatsApp"
                    required
                    helperText="Recibir\u00e1s un c\u00f3digo de verificaci\u00f3n por WhatsApp"
                  />
                </Box>

                {/* Referral Code Section */}
                {refFromUrl && codeValidation?.valid ? (
                  /* Si viene del link, solo mostrar la tarjeta del asesor */
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      mt: 1,
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: 'rgba(240, 90, 40, 0.08)',
                      border: '1px solid rgba(240, 90, 40, 0.3)',
                    }}>
                      <Avatar
                        src={codeValidation.photoUrl || undefined}
                        sx={{
                          width: 48,
                          height: 48,
                          bgcolor: '#F05A28',
                          fontSize: '1.1rem',
                          fontWeight: 600,
                        }}
                      >
                        {codeValidation.referrerName?.charAt(0)?.toUpperCase()}
                      </Avatar>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                          {codeValidation.isAdvisor ? 'Tu Asesor' : 'Referido por'}
                        </Typography>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                          {codeValidation.referrerName}
                        </Typography>
                        {codeValidation.phone && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.3 }}>
                            <PhoneIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">
                              {codeValidation.phone}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                      <CheckCircleOutlineIcon sx={{ color: '#F05A28', fontSize: 22 }} />
                    </Box>
                  </Box>
                ) : (
                  /* Si NO viene del link, mostrar sección completa */
                  <>
                <Divider sx={{ my: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    ¿Tienes un código de referido?
                  </Typography>
                </Divider>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, textAlign: 'center' }}>
                  Si un amigo o asesor te recomendó, ingresa su código
                </Typography>
                <TextField
                  fullWidth
                  label="Código de referido (opcional)"
                  value={referralCode}
                  disabled={refFromUrl}
                  onChange={(e) => {
                    if (refFromUrl) return;
                    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
                    setReferralCode(value);
                    setCodeValidation(null);
                  }}
                  onBlur={() => {
                    if (referralCode.length >= 4) {
                      validateReferralCode(referralCode);
                    }
                  }}
                  placeholder="Ej: ABC123"
                  sx={{ mb: 1.5 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <GroupAddIcon sx={{ color: 'text.secondary' }} />
                      </InputAdornment>
                    ),
                    endAdornment: validatingCode ? (
                      <InputAdornment position="end">
                        <CircularProgress size={20} />
                      </InputAdornment>
                    ) : codeValidation ? (
                      <InputAdornment position="end">
                        {codeValidation.valid ? (
                          <CheckCircleOutlineIcon sx={{ color: 'success.main' }} />
                        ) : (
                          <Typography variant="caption" color="error">✗</Typography>
                        )}
                      </InputAdornment>
                    ) : null,
                  }}
                />
                {codeValidation && (
                  <Box sx={{ mb: 2 }}>
                    {codeValidation.valid ? (
                      <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        mt: 1,
                        p: 1.5,
                        borderRadius: 2,
                        bgcolor: 'rgba(240, 90, 40, 0.08)',
                        border: '1px solid rgba(240, 90, 40, 0.3)',
                      }}>
                        <Avatar
                          src={codeValidation.photoUrl || undefined}
                          sx={{
                            width: 48,
                            height: 48,
                            bgcolor: '#F05A28',
                            fontSize: '1.1rem',
                            fontWeight: 600,
                          }}
                        >
                          {codeValidation.referrerName?.charAt(0)?.toUpperCase()}
                        </Avatar>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                            {codeValidation.isAdvisor ? 'Tu Asesor' : 'Referido por'}
                          </Typography>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                            {codeValidation.referrerName}
                          </Typography>
                          {codeValidation.phone && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.3 }}>
                              <PhoneIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                              <Typography variant="caption" color="text.secondary">
                                {codeValidation.phone}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                        <CheckCircleOutlineIcon sx={{ color: '#F05A28', fontSize: 22 }} />
                      </Box>
                    ) : (
                      <Typography variant="caption" color="error">
                        Código no válido
                      </Typography>
                    )}
                  </Box>
                )}
                  </>
                )}

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  size="large"
                  disabled={loading}
                  sx={{
                    py: 1.5,
                    borderRadius: 2,
                    textTransform: 'none',
                    fontSize: '1rem',
                    fontWeight: 700,
                    mt: 2,
                    background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)',
                    boxShadow: '0 4px 12px rgba(240, 90, 40, 0.3)',
                    '&:hover': {
                      background: 'linear-gradient(90deg, #A01F25 0%, #D94A20 100%)',
                      boxShadow: '0 6px 16px rgba(240, 90, 40, 0.4)',
                    },
                  }}
                >
                  {loading ? (
                    <CircularProgress size={24} color="inherit" />
                  ) : (
                    'Crear Cuenta'
                  )}
                </Button>

                {/* Sign up with Google / Apple (feature-flagged via VITE envs) */}
                <SocialAuthButtons
                  onSuccess={({ user, access }) => onLoginSuccess({ user, access })}
                  onError={(msg) => setError(msg)}
                  onNotRegistered={(prefill) => {
                    setRegisterName(prefill.fullName || '');
                    setRegisterEmail(prefill.email || '');
                    setError('');
                    setSuccess(`Completa tu registro para crear tu casillero. Tu cuenta de ${prefill.provider === 'google' ? 'Google' : 'Apple'} quedará vinculada al iniciar sesión.`);
                    setTimeout(() => setSuccess(''), 8000);
                  }}
                  disabled={loading}
                />

              </form>
            </TabPanel>

            {/* Footer */}
            <Box sx={{ mt: 4, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                © Since 2013 EntregaX Paqueteria Internacional
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Fade>

      {/* Forgot password dialog */}
      <Dialog open={forgotOpen} onClose={closeForgotDialog} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {forgotSent ? 'Revisa tu correo' : '¿Olvidaste tu contraseña?'}
        </DialogTitle>
        <DialogContent>
          {forgotSent ? (
            <Box sx={{ pt: 1 }}>
              <Typography variant="body2" sx={{ color: '#444' }}>
                Te enviamos un enlace a <strong>{forgotEmail}</strong> para
                restablecer tu contraseña. Es válido por <strong>1 hora</strong>.
                Revisa también tu carpeta de spam.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ pt: 1 }}>
              <Typography variant="body2" sx={{ color: '#444', mb: 2 }}>
                Ingresa tu correo registrado y te mandaremos un link
                para restablecer tu contraseña.
              </Typography>
              <TextField
                fullWidth
                autoFocus
                type="email"
                label="Correo electrónico"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                disabled={forgotSubmitting}
                onKeyDown={(e) => { if (e.key === 'Enter') handleForgotSubmit(); }}
              />
              {forgotError && (
                <Alert severity="error" sx={{ mt: 2 }}>{forgotError}</Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeForgotDialog} disabled={forgotSubmitting}>
            {forgotSent ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!forgotSent && (
            <Button
              variant="contained"
              onClick={handleForgotSubmit}
              disabled={forgotSubmitting}
              sx={{
                background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)',
                textTransform: 'none',
                fontWeight: 700,
                '&:hover': { background: 'linear-gradient(90deg, #A01F25 0%, #D94A20 100%)' },
              }}
            >
              {forgotSubmitting ? <CircularProgress size={20} color="inherit" /> : 'Recuperar'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Modal de pregunta para flujo de registro */}
      <Dialog
        open={activationQuestionDialog}
        onClose={() => setActivationQuestionDialog(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ textAlign: 'center', pt: 3 }}>
          <InventoryIcon sx={{ fontSize: 34, color: '#F05A28', mb: 1 }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            ¿Ya tienes número de cliente?
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center', pb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Si ya eres cliente de EntregaX, te ayudaremos para activar tu cuenta.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, display: 'flex', justifyContent: 'space-between' }}>
          <Button
            variant="outlined"
            onClick={() => {
              setActivationFlowSelected(true);
              setActivationQuestionDialog(false);
              // Continúa en el formulario de registro normal
            }}
            sx={{
              borderColor: '#D1D5DB',
              color: '#6B7280',
              '&:hover': {
                borderColor: '#9CA3AF',
                bgcolor: '#F9FAFB',
              },
            }}
          >
            No
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setActivationFlowSelected(true);
              setActivationQuestionDialog(false);
              resetExistingClientForm();
              setExistingClientDialog(true);
            }}
            sx={{
              background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)',
              '&:hover': {
                background: 'linear-gradient(90deg, #A01F25 0%, #D94A20 100%)',
              },
            }}
          >
            Sí
          </Button>
        </DialogActions>
      </Dialog>

      {/* Existing Client Dialog */}
      <Dialog
        open={existingClientDialog}
        onClose={() => setExistingClientDialog(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{
          sx: {
            borderRadius: isMobile ? 0 : 2,
            border: '1px solid #F05A28',
          }
        }}
      >
        <DialogTitle sx={{ bgcolor: '#111', color: 'white', textAlign: 'center', py: isMobile ? 2 : undefined }}>
          <InventoryIcon sx={{ fontSize: 40, mb: 1, color: '#F05A28' }} />
          <Typography variant="h6">Activar Cuenta Existente</Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 3, px: isMobile ? 2 : 3 }}>
          <Stepper activeStep={existingClientStep} sx={{ mb: 4, mt: 2 }} alternativeLabel={isMobile}>
            <Step>
              <StepLabel>Casillero</StepLabel>
            </Step>
            <Step>
              <StepLabel>Verificar</StepLabel>
            </Step>
            <Step>
              <StepLabel>Datos</StepLabel>
            </Step>
            <Step>
              <StepLabel>Contraseña</StepLabel>
            </Step>
          </Stepper>

          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
              {error}
              {existingClientStep === 0 && /ya fue activado|already activated/i.test(error) && (
                <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    ¿Alguien tomó tu número de cliente?
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={openClaimDialog}
                    sx={{ textTransform: 'none', borderRadius: 2 }}
                  >
                    ¿Necesitas Ayuda?
                  </Button>
                </Box>
              )}
            </Alert>
          )}

          {/* Step 0: Enter Box ID */}
          {existingClientStep === 0 && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: 'center' }}>
                Ingresa tu número de cliente (casillero) para comenzar
              </Typography>
              <TextField
                fullWidth
                label="Número de cliente"
                value={existingBoxId}
                onChange={(e) => setExistingBoxId(e.target.value.toUpperCase())}
                placeholder="Ej: S87, DHL-001"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <InventoryIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2 }}
              />
            </Box>
          )}

          {/* Step 1: Verify Name */}
          {existingClientStep === 1 && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: 'center' }}>
                Para verificar tu identidad, ingresa tu nombre completo tal como lo registraste
              </Typography>
              <TextField
                fullWidth
                label="Nombre completo"
                value={existingName}
                onChange={(e) => setExistingName(e.target.value)}
                placeholder="Nombre como aparece en tu cuenta"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonOutlineIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2 }}
              />
            </Box>
          )}

          {/* Step 2: Confirm/Edit Contact Info */}
          {existingClientStep === 2 && existingClientData && (
            <Box>
              <Alert severity="success" sx={{ mb: 3 }}>
                ¡Identidad verificada! Confirma o actualiza tus datos de contacto.
              </Alert>
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                Cliente: {existingClientData.fullName}
              </Typography>
              <TextField
                fullWidth
                label="Correo electrónico"
                type="email"
                value={existingEmail}
                onChange={(e) => setExistingEmail(e.target.value)}
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailOutlinedIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2 }}
              />
              <Box sx={{ mb: 2 }}>
                <CountryPhoneInput
                  value={existingPhone}
                  onChange={setExistingPhone}
                  label="WhatsApp"
                  required
                  helperText="Recibirás un código de verificación por WhatsApp"
                />
              </Box>

              {/* Referral Code Section in Step 2 */}
              <Divider sx={{ my: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  ¿Te refirió un asesor?
                </Typography>
              </Divider>
              <TextField
                fullWidth
                label="Código de asesor o referido (opcional)"
                value={existingReferralCode}
                disabled={refFromUrl}
                onChange={(e) => {
                  if (refFromUrl) return;
                  const value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
                  setExistingReferralCode(value);
                  setExistingCodeValidation(null);
                }}
                onBlur={() => {
                  if (existingReferralCode.length >= 4) {
                    validateReferralCode(existingReferralCode, true);
                  }
                }}
                placeholder="Ej: ABC123"
                helperText="Si un asesor te invitó, ingresa su código"
                sx={{ mb: 1.5 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <GroupAddIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                  endAdornment: existingValidatingCode ? (
                    <InputAdornment position="end">
                      <CircularProgress size={20} />
                    </InputAdornment>
                  ) : existingCodeValidation ? (
                    <InputAdornment position="end">
                      {existingCodeValidation.valid ? (
                        <CheckCircleOutlineIcon sx={{ color: 'success.main' }} />
                      ) : (
                        <Typography variant="caption" color="error">✗</Typography>
                      )}
                    </InputAdornment>
                  ) : null,
                }}
              />
              {existingCodeValidation && (
                <Box sx={{ mb: 2 }}>
                  {existingCodeValidation.valid ? (
                    <Box sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      mt: 1,
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: 'rgba(240, 90, 40, 0.08)',
                      border: '1px solid rgba(240, 90, 40, 0.3)',
                    }}>
                      <Avatar
                        src={existingCodeValidation.photoUrl || undefined}
                        sx={{
                          width: 48,
                          height: 48,
                          bgcolor: '#F05A28',
                          fontSize: '1.1rem',
                          fontWeight: 600,
                        }}
                      >
                        {existingCodeValidation.referrerName?.charAt(0)?.toUpperCase()}
                      </Avatar>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                          {existingCodeValidation.isAdvisor ? 'Tu Asesor' : 'Referido por'}
                        </Typography>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                          {existingCodeValidation.referrerName}
                        </Typography>
                        {existingCodeValidation.phone && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.3 }}>
                            <PhoneIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">
                              {existingCodeValidation.phone}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                      <CheckCircleOutlineIcon sx={{ color: '#F05A28', fontSize: 22 }} />
                    </Box>
                  ) : (
                    <Typography variant="caption" color="error">
                      Código no válido
                    </Typography>
                  )}
                </Box>
              )}

              <Button
                variant="contained"
                fullWidth
                onClick={() => setExistingClientStep(3)}
                disabled={!existingEmail || !existingPhone || existingPhone.length < 11}
                sx={{
                  mt: 2,
                  background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)',
                  '&:hover': {
                    background: 'linear-gradient(90deg, #A01F25 0%, #D94A20 100%)',
                  },
                }}
              >
                Continuar
              </Button>
            </Box>
          )}

          {/* Step 3: Set Password */}
          {existingClientStep === 3 && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: 'center' }}>
                Crea una contraseña para tu cuenta
              </Typography>
              <TextField
                fullWidth
                label="Nueva contraseña"
                type="password"
                value={existingPassword}
                onChange={(e) => setExistingPassword(e.target.value)}
                required
                helperText="Mínimo 6 caracteres"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockOutlinedIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="Confirmar contraseña"
                type="password"
                value={existingConfirmPassword}
                onChange={(e) => setExistingConfirmPassword(e.target.value)}
                required
                error={existingPassword !== existingConfirmPassword && existingConfirmPassword.length > 0}
                helperText={existingPassword !== existingConfirmPassword && existingConfirmPassword.length > 0 ? 'Las contraseñas no coinciden' : ''}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockOutlinedIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2 }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button
            onClick={() => {
              if (existingClientStep > 0) {
                setExistingClientStep(existingClientStep - 1);
                setError('');
              } else {
                setExistingClientDialog(false);
                resetExistingClientForm();
              }
            }}
            sx={{ color: 'text.secondary' }}
          >
            {existingClientStep === 0 ? 'Cancelar' : 'Atrás'}
          </Button>
          {existingClientStep === 0 && (
            <Button
              variant="contained"
              onClick={handleCheckBoxId}
              disabled={loading || !existingBoxId}
              sx={{
                background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)',
                '&:hover': {
                  background: 'linear-gradient(90deg, #A01F25 0%, #D94A20 100%)',
                },
              }}
            >
              {loading ? <CircularProgress size={20} color="inherit" /> : 'Verificar'}
            </Button>
          )}
          {existingClientStep === 1 && (
            <Button
              variant="contained"
              onClick={handleVerifyName}
              disabled={loading || !existingName}
              sx={{
                background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)',
                '&:hover': {
                  background: 'linear-gradient(90deg, #A01F25 0%, #D94A20 100%)',
                },
              }}
            >
              {loading ? <CircularProgress size={20} color="inherit" /> : 'Verificar nombre'}
            </Button>
          )}
          {existingClientStep === 3 && (
            <Button
              variant="contained"
              onClick={handleCompleteActivation}
              disabled={loading || !existingPassword || existingPassword.length < 6}
              sx={{
                background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)',
                '&:hover': {
                  background: 'linear-gradient(90deg, #A01F25 0%, #D94A20 100%)',
                },
              }}
            >
              {loading ? <CircularProgress size={20} color="inherit" /> : 'Activar Cuenta'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* 🆘 Box ID Claim Dialog (público) */}
      <Dialog
        open={claimDialog}
        onClose={() => !claimSubmitting && setClaimDialog(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{
          sx: {
            borderRadius: isMobile ? 0 : 2,
            border: '1px solid #C1272D',
          }
        }}
      >
        <DialogTitle sx={{ bgcolor: '#111', color: 'white', textAlign: 'center', py: isMobile ? 2 : undefined }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            ¿Alguien tomó tu número de cliente?
          </Typography>
          <Typography variant="body2" sx={{ color: '#F05A28', mt: 0.5 }}>
            Con gusto te ayudamos a resolverlo
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 3, px: isMobile ? 2 : 3 }}>
          {claimSuccess ? (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <CheckCircleOutlineIcon sx={{ fontSize: 56, color: 'success.main', mb: 1 }} />
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                Reclamación registrada
              </Typography>
              <Alert severity="success" sx={{ textAlign: 'left', borderRadius: 2, mb: 2 }}>
                Tu folio es <strong>{claimSuccess.folio}</strong>.<br />
                Servicio a Cliente revisará tu caso y te contactará al correo que proporcionaste.
                Guarda este folio para dar seguimiento.
              </Alert>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Llena el formulario y adjunta tu INE. Nuestro equipo de Servicio a Cliente
                validará la información y te ayudará a recuperar tu número de cliente.
              </Typography>

              {claimError && (
                <Alert severity="error" sx={{ borderRadius: 2 }}>
                  {claimError}
                </Alert>
              )}

              <TextField
                fullWidth
                label="Número de cliente reclamado"
                value={claimBoxId}
                onChange={(e) => setClaimBoxId(e.target.value.toUpperCase())}
                placeholder="Ej: S87, DHL-001"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <InventoryIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                fullWidth
                label="Nombre completo"
                value={claimFullName}
                onChange={(e) => setClaimFullName(e.target.value)}
                placeholder="Como aparece en tu INE"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonOutlineIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                fullWidth
                type="email"
                label="Correo electrónico"
                value={claimEmail}
                onChange={(e) => setClaimEmail(e.target.value)}
                placeholder="tu@correo.com"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailOutlinedIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                fullWidth
                label="Teléfono"
                value={claimPhone}
                onChange={(e) => setClaimPhone(e.target.value.replace(/[^0-9+\s-]/g, ''))}
                placeholder="Ej: 81 1234 5678"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PhoneIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                fullWidth
                multiline
                minRows={2}
                maxRows={4}
                label="Cuéntanos qué pasó (opcional)"
                value={claimMessage}
                onChange={(e) => setClaimMessage(e.target.value)}
                placeholder="Describe brevemente la situación"
              />

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  INE (frente) *
                </Typography>
                <Button
                  variant={claimIneFront ? 'contained' : 'outlined'}
                  component="label"
                  fullWidth
                  color={claimIneFront ? 'success' : 'primary'}
                  sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
                >
                  {claimIneFront ? `✓ ${claimIneFront.name}` : 'Subir foto del frente de INE'}
                  <input
                    hidden
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setClaimIneFront(e.target.files?.[0] || null)}
                  />
                </Button>
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  INE (reverso) — opcional
                </Typography>
                <Button
                  variant={claimIneBack ? 'contained' : 'outlined'}
                  component="label"
                  fullWidth
                  color={claimIneBack ? 'success' : 'inherit'}
                  sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
                >
                  {claimIneBack ? `✓ ${claimIneBack.name}` : 'Subir foto del reverso de INE'}
                  <input
                    hidden
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setClaimIneBack(e.target.files?.[0] || null)}
                  />
                </Button>
              </Box>

              <Alert severity="info" sx={{ borderRadius: 2 }}>
                Tu información solo se usará para validar tu identidad y proteger tu cuenta.
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {claimSuccess ? (
            <Button
              variant="contained"
              fullWidth={isMobile}
              onClick={() => {
                setClaimDialog(false);
                setClaimSuccess(null);
              }}
              sx={{
                background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)',
                '&:hover': {
                  background: 'linear-gradient(90deg, #A01F25 0%, #D94A20 100%)',
                },
              }}
            >
              Cerrar
            </Button>
          ) : (
            <>
              <Button
                onClick={() => setClaimDialog(false)}
                disabled={claimSubmitting}
                color="inherit"
              >
                Cancelar
              </Button>
              <Button
                variant="contained"
                onClick={handleSubmitClaim}
                disabled={claimSubmitting}
                sx={{
                  background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)',
                  '&:hover': {
                    background: 'linear-gradient(90deg, #A01F25 0%, #D94A20 100%)',
                  },
                }}
              >
                {claimSubmitting ? <CircularProgress size={20} color="inherit" /> : 'Enviar reclamación'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* OTP de verificación de WhatsApp tras registro / activación */}
      <PhoneVerificationDialog
        open={phoneVerifyOpen}
        phone={pendingPhone}
        token={pendingUserData?.token}
        onVerified={() => {
          setPhoneVerifyOpen(false);
          setSuccess('¡WhatsApp verificado! Ya puedes iniciar sesión.');
          // Limpiar formularios y volver a tab de login
          setRegisterName('');
          setRegisterEmail('');
          setRegisterPhone('');
          setRegisterPassword('');
          setRegisterConfirmPassword('');
          resetExistingClientForm();
          setTabValue(0);
          // Cerrar sesión local: el usuario debe iniciar sesión normalmente
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setPendingUserData(null);
          setPendingPhone('');
          setTimeout(() => setSuccess(''), 6000);
        }}
        onSkip={() => {
          setPhoneVerifyOpen(false);
          setSuccess('Tu cuenta fue creada. Recuerda verificar tu WhatsApp para poder pagar y ver costos.');
          setRegisterName('');
          setRegisterEmail('');
          setRegisterPhone('');
          setRegisterPassword('');
          setRegisterConfirmPassword('');
          resetExistingClientForm();
          setTabValue(0);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setPendingUserData(null);
          setPendingPhone('');
          setTimeout(() => setSuccess(''), 8000);
        }}
      />
    </Box>
  );
}
