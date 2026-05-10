/**
 * ResetPasswordPage — landing del link de recuperación de contraseña.
 *
 * Se monta cuando window.location.pathname === '/reset-password' y
 * existe `?token=...` en la URL (lo coloca App.tsx antes del check de
 * isAuthenticated). El componente:
 *
 *   1. Lee token de query string
 *   2. Pide nueva contraseña + confirmación
 *   3. POST /api/auth/reset-password { token, newPassword }
 *   4. Si OK: redirige a "/" para que el usuario inicie sesión
 *      con la nueva contraseña
 */

import { useMemo, useState } from 'react';
import axios from 'axios';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

const API_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:3001/api';

export default function ResetPasswordPage() {
  const token = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('token') || '';
  }, []);

  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const goToLogin = () => {
    window.location.href = '/';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (pass.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (pass !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/auth/reset-password`, {
        token,
        newPassword: pass,
      });
      setDone(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'No se pudo restablecer la contraseña');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #111 0%, #1a1a1a 100%)',
        p: 2,
      }}
    >
      <Paper
        elevation={6}
        sx={{
          width: '100%',
          maxWidth: 420,
          p: { xs: 3, sm: 4 },
          borderRadius: 3,
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#111' }}>
            Restablecer contraseña
          </Typography>
          <Typography variant="body2" sx={{ color: '#666', mt: 0.5 }}>
            Define tu nueva contraseña de acceso
          </Typography>
        </Box>

        {!token && (
          <Alert severity="error" sx={{ mb: 2 }}>
            El link no es válido. Solicita uno nuevo desde "¿Olvidaste tu contraseña?".
          </Alert>
        )}

        {done ? (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 56, color: '#4CAF50', mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#111', mb: 1 }}>
              ¡Listo!
            </Typography>
            <Typography variant="body2" sx={{ color: '#666', mb: 3 }}>
              Tu contraseña fue restablecida. Ya puedes iniciar sesión.
            </Typography>
            <Button
              fullWidth
              variant="contained"
              onClick={goToLogin}
              sx={{
                background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)',
                textTransform: 'none',
                fontWeight: 700,
                py: 1.2,
                '&:hover': { background: 'linear-gradient(90deg, #A01F25 0%, #D94A20 100%)' },
              }}
            >
              Ir a iniciar sesión
            </Button>
          </Box>
        ) : (
          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Nueva contraseña"
              type={show ? 'text' : 'password'}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              disabled={!token || submitting}
              required
              sx={{ mb: 2 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockOutlinedIcon sx={{ color: '#999' }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShow((v) => !v)} edge="end">
                      {show ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Confirmar contraseña"
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={!token || submitting}
              required
              sx={{ mb: 2 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockOutlinedIcon sx={{ color: '#999' }} />
                  </InputAdornment>
                ),
              }}
            />
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={!token || submitting}
              sx={{
                background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)',
                textTransform: 'none',
                fontWeight: 700,
                py: 1.2,
                '&:hover': { background: 'linear-gradient(90deg, #A01F25 0%, #D94A20 100%)' },
              }}
            >
              {submitting ? <CircularProgress size={22} color="inherit" /> : 'Restablecer contraseña'}
            </Button>
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Button onClick={goToLogin} sx={{ color: '#666', textTransform: 'none' }}>
                Volver a iniciar sesión
              </Button>
            </Box>
          </form>
        )}
      </Paper>
    </Box>
  );
}
