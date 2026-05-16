/**
 * PhoneVerificationDialog — Modal con OTP de 6 dígitos.
 *
 * Flujo:
 *   1) Al abrir, llama POST /api/auth/phone/send-code (a menos que skipInitialSend=true)
 *   2) Usuario teclea código de 6 dígitos
 *   3) POST /api/auth/phone/verify-code
 *   4) onVerified() y se cierra.
 *
 * Botón "Verificar más tarde" cierra el dialog sin verificar (onSkip).
 *
 * Token JWT automático (Authorization: Bearer) para que el backend pueda
 * identificar al usuario actual (cambio de teléfono).
 */
import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  TextField,
  CircularProgress,
  Alert,
  Stack,
} from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';

interface Props {
  open: boolean;
  phone: string; // E.164 sin '+' (ej. 5215512345678)
  onVerified: () => void;
  onSkip?: () => void;
  /** Token JWT opcional. Si no se pasa, se toma de localStorage. */
  token?: string;
  /** Si ya enviaste el código desde fuera, evita re-enviar al abrir. */
  skipInitialSend?: boolean;
  /** Personalizable: título */
  title?: string;
}

const RESEND_COOLDOWN = 60;

const PhoneVerificationDialog: React.FC<Props> = ({
  open,
  phone,
  onVerified,
  onSkip,
  token,
  skipInitialSend = false,
  title = 'Verifica tu WhatsApp',
}) => {
  const [code, setCode] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [info, setInfo] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState<number>(0);
  const sentOnceRef = useRef(false);

  const authHeaders = (): Record<string, string> => {
    const t = token || localStorage.getItem('token') || '';
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  const sendCode = async (silent = false) => {
    if (!phone) {
      setError('Falta número de teléfono.');
      return;
    }
    setSending(true);
    setError('');
    if (!silent) setInfo('');
    try {
      const { data } = await axios.post(
        `${API_URL}/auth/phone/send-code`,
        { phone },
        { headers: authHeaders() }
      );
      setInfo(data?.message || 'Código enviado por WhatsApp.');
      setCooldown(RESEND_COOLDOWN);
      // Modo dev: si backend devuelve devCode, lo prerrellenamos para QA
      if (data?.devCode) {
        setCode(String(data.devCode));
        setInfo(`(DEV) Código: ${data.devCode}`);
      }
    } catch (err: any) {
      const apiErr = err?.response?.data;
      if (err?.response?.status === 429 && apiErr?.retryAfterSeconds) {
        setCooldown(apiErr.retryAfterSeconds);
        setError(apiErr?.error || 'Espera unos segundos.');
      } else {
        setError(apiErr?.error || 'No se pudo enviar el código.');
      }
    } finally {
      setSending(false);
    }
  };

  // Al abrir el modal, dispara envío inicial sólo una vez
  useEffect(() => {
    if (open && !sentOnceRef.current) {
      sentOnceRef.current = true;
      if (!skipInitialSend) {
        sendCode(true);
      } else {
        // Asumimos que ya se envió recién; arrancamos cooldown
        setCooldown(RESEND_COOLDOWN);
        setInfo('Te enviamos un código por WhatsApp.');
      }
    }
    if (!open) {
      // Reset al cerrar
      sentOnceRef.current = false;
      setCode('');
      setError('');
      setInfo('');
      setCooldown(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleVerify = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError('El código debe tener 6 dígitos.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await axios.post(
        `${API_URL}/auth/phone/verify-code`,
        { phone, code },
        { headers: authHeaders() }
      );
      // Actualizar el user en localStorage
      try {
        const stored = JSON.parse(localStorage.getItem('user') || 'null');
        if (stored && typeof stored === 'object') {
          stored.phoneVerified = true;
          stored.phone = phone;
          localStorage.setItem('user', JSON.stringify(stored));
        }
      } catch {}
      onVerified();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Código incorrecto.');
    } finally {
      setSubmitting(false);
    }
  };

  const maskedPhone = phone.length > 4
    ? `+${phone.slice(0, 2)} ··· ${phone.slice(-4)}`
    : `+${phone}`;

  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') return;
      }}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700 }}>
        <WhatsAppIcon sx={{ color: '#25D366' }} />
        {title}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Te enviamos un código de 6 dígitos por WhatsApp a:
          </Typography>
          <Box sx={{
            textAlign: 'center',
            p: 1.5,
            bgcolor: '#f5f5f5',
            borderRadius: 1.5,
            fontWeight: 700,
            fontSize: '1.1rem',
          }}>
            {maskedPhone}
          </Box>

          {error && <Alert severity="error">{error}</Alert>}
          {info && !error && <Alert severity="info">{info}</Alert>}

          <TextField
            label="Código de verificación"
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6);
              setCode(v);
              if (error) setError('');
            }}
            placeholder="123456"
            inputProps={{
              inputMode: 'numeric',
              pattern: '[0-9]*',
              maxLength: 6,
              style: {
                textAlign: 'center',
                fontSize: '1.6rem',
                letterSpacing: '0.5rem',
                fontWeight: 700,
              },
            }}
            autoFocus
            fullWidth
            disabled={submitting}
          />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              ¿No llegó?
            </Typography>
            <Button
              size="small"
              onClick={() => sendCode(false)}
              disabled={cooldown > 0 || sending}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {sending ? 'Enviando...' : cooldown > 0 ? `Reenviar en ${cooldown}s` : 'Reenviar código'}
            </Button>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        {onSkip && (
          <Button
            onClick={onSkip}
            disabled={submitting}
            sx={{ textTransform: 'none' }}
          >
            Verificar más tarde
          </Button>
        )}
        <Button
          variant="contained"
          onClick={handleVerify}
          disabled={submitting || code.length !== 6}
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            background: 'linear-gradient(90deg, #25D366 0%, #128C7E 100%)',
            '&:hover': { background: 'linear-gradient(90deg, #1FB956 0%, #0E6E63 100%)' },
          }}
        >
          {submitting ? <CircularProgress size={20} color="inherit" /> : 'Verificar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PhoneVerificationDialog;
