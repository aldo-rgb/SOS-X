import { useState } from 'react';
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
} from '@mui/material';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

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

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form state
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');

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

      // Verificar si puede acceder al Web Admin
      if (!access.canAccessWebAdmin) {
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

    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
        fullName: registerName,
        email: registerEmail,
        password: registerPassword,
      });

      setSuccess(`¡Registro exitoso! Tu casillero es ${response.data.user.boxId}. Ahora puedes iniciar sesión.`);
      
      // Limpiar formulario y cambiar a login
      setRegisterName('');
      setRegisterEmail('');
      setRegisterPassword('');
      setRegisterConfirmPassword('');
      
      setTimeout(() => {
        setTabValue(0);
        setLoginEmail(registerEmail);
        setSuccess('');
      }, 3000);

    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al registrar usuario');
    } finally {
      setLoading(false);
    }
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
                  sx={{ mb: 3 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockOutlinedIcon sx={{ color: 'text.secondary' }} />
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
                    'Crear Cuenta'
                  )}
                </Button>
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
    </Box>
  );
}
