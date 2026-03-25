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
  Chip,
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
  const [existingClientDialog, setExistingClientDialog] = useState(false);
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

    if (registerPhone && registerPhone.length < 10) {
      setError('El número de WhatsApp debe tener al menos 10 dígitos');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
        fullName: registerName,
        email: registerEmail,
        phone: registerPhone || undefined,
        password: registerPassword,
        referralCodeInput: referralCode.trim().toUpperCase() || undefined,
      });

      const advisorMsg = response.data.user.hasAdvisor ? '\n¡Tu asesor ha sido asignado!' : '';
      const referralMsg = response.data.user.referredBy ? '\n¡Recibirás tu bono de bienvenida!' : '';
      
      setSuccess(`¡Registro exitoso! Tu casillero es ${response.data.user.boxId}.${advisorMsg}${referralMsg} Ahora puedes iniciar sesión.`);
      
      // Limpiar formulario y cambiar a login
      setRegisterName('');
      setRegisterEmail('');
      setRegisterPhone('');
      setRegisterPassword('');
      setRegisterConfirmPassword('');
      setReferralCode('');
      setCodeValidation(null);
      
      setTimeout(() => {
        setTabValue(0);
        setLoginEmail(registerEmail);
        setSuccess('');
      }, 4000);

    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al registrar usuario');
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
    if (!existingPhone || existingPhone.length < 10) {
      setError('Ingresa un número de WhatsApp válido (10 dígitos)');
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
      setSuccess(`¡Cuenta activada! Tu casillero es ${response.data.user.box_id}.${advisorMsg}${referralMsg} Ahora puedes iniciar sesión.`);
      setExistingClientDialog(false);
      resetExistingClientForm();
      setTabValue(0);
      setLoginEmail(existingEmail);
      
      setTimeout(() => setSuccess(''), 5000);
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
                src="/logo.png"
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
                <TextField
                  fullWidth
                  label="WhatsApp (10 dígitos)"
                  value={registerPhone}
                  onChange={(e) => setRegisterPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="55 1234 5678"
                  sx={{ mb: 2.5 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PhoneIcon sx={{ color: 'text.secondary' }} />
                      </InputAdornment>
                    ),
                  }}
                  helperText="Opcional - Para notificaciones"
                />

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

                {/* Existing Client Section */}
                <Divider sx={{ my: 3 }} />
                <Box
                  sx={{
                    p: 2,
                    bgcolor: '#F8F9FA',
                    borderRadius: 2,
                    border: '1px solid #E5E7EB',
                    textAlign: 'center',
                  }}
                >
                  <InventoryIcon sx={{ fontSize: 32, color: '#F05A28', mb: 1 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    ¿Ya tienes número de cliente?
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Si ya eres cliente de EntregaX, activa tu cuenta aquí
                  </Typography>
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={() => {
                      resetExistingClientForm();
                      setExistingClientDialog(true);
                    }}
                    sx={{
                      borderColor: '#F05A28',
                      color: '#F05A28',
                      '&:hover': {
                        borderColor: '#C1272D',
                        bgcolor: 'rgba(240, 90, 40, 0.04)',
                      },
                    }}
                  >
                    Activar cuenta existente
                  </Button>
                </Box>
              </form>
            </TabPanel>

            {/* Footer */}
            <Box sx={{ mt: 4, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                © 2026 EntregaX — Logística Internacional
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Fade>

      {/* Existing Client Dialog */}
      <Dialog
        open={existingClientDialog}
        onClose={() => setExistingClientDialog(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{
          sx: { borderRadius: isMobile ? 0 : 2 }
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
              <TextField
                fullWidth
                label="WhatsApp (10 dígitos)"
                value={existingPhone}
                onChange={(e) => setExistingPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PhoneIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2 }}
              />

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
                disabled={!existingEmail || !existingPhone || existingPhone.length < 10}
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
    </Box>
  );
}
