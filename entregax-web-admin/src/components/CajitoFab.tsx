// ============================================
// CAJITO FAB — Botón flotante + chat panel anclado (no modal)
// Se muestra solo si el toggle global `cajito_enabled` está activo.
// Usa el avatar configurado en brand_assets (slot 'cajito_avatar').
// ============================================

import { useEffect, useRef, useState } from 'react';
import {
  Fab,
  Tooltip,
  Paper,
  Box,
  Typography,
  Avatar,
  IconButton,
  TextField,
  CircularProgress,
  Slide,
} from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import { usePaymentStatus } from '../hooks/usePaymentStatus';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// 🔶 Paleta naranja → rojo
const CAJITO_GRADIENT = 'linear-gradient(135deg, #FF6F00 0%, #D32F2F 100%)';
const CAJITO_RING = '#FF6F00';
const CAJITO_SHADOW = 'rgba(255,111,0,0.45)';

const resolveUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/uploads/')) return `${API_BASE}${url}`;
  if (url.startsWith('uploads/')) return `${API_BASE}/${url}`;
  if (url.startsWith('/')) return `${API_BASE}${url}`;
  return `${API_BASE}/${url}`;
};

interface ChatMsg {
  id: number;
  role: 'user' | 'cajito';
  text: string;
  ts: number;
}

const getCurrentUser = () => {
  try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
};

export default function CajitoFab() {
  const { cajitoEnabled, cajitoAvatarUrl, loading } = usePaymentStatus();
  const [open, setOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const user = getCurrentUser();
  const isSuperAdmin = user?.role === 'super_admin';

  useEffect(() => {
    if (open && messages.length === 0) {
      const userName = user?.full_name?.split(' ')?.[0] || 'aquí';
      setMessages([
        {
          id: Date.now(),
          role: 'cajito',
          text: isSuperAdmin
            ? `¡Hola ${userName}! Como Super Admin tienes acceso completo a Cajito. Puedes hablar conmigo sin restricciones. Pregúntame por paquetes, clientes, KPIs, comisiones, rutas… El motor de IA todavía no está conectado en esta versión; te confirmaré apenas esté disponible.`
            : `¡Hola ${userName}! Soy Cajito. Tu administrador controla qué puedo hacer en tu nombre desde Permisos > Cajito (IA). El motor de IA aún no está conectado, pero puedes escribirme y te responderé cuando se habilite.`,
          ts: Date.now(),
        },
      ]);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  if (loading || !cajitoEnabled) return null;

  const avatar = imgError ? null : resolveUrl(cajitoAvatarUrl);

  const handleSend = () => {
    const text = input.trim();
    if (!text || thinking) return;
    const userMsg: ChatMsg = { id: Date.now(), role: 'user', text, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setThinking(true);
    // 🚧 Placeholder mientras el backend de IA no esté conectado.
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'cajito',
          text: isSuperAdmin
            ? 'Recibí tu mensaje. Aún no estoy conectado al modelo de IA, pero como Super Admin verás aquí mis respuestas en cuanto se habilite el módulo.'
            : 'Recibí tu mensaje. Aún no estoy conectado al modelo de IA. Pronto podré responderte directamente desde este chat.',
          ts: Date.now(),
        },
      ]);
      setThinking(false);
    }, 700);
  };

  return (
    <>
      {/* === Botón flotante (anillo naranja) === */}
      <Tooltip title={open ? 'Cerrar Cajito' : 'Hablar con Cajito'} placement="left">
        <Fab
          onClick={() => setOpen((v) => !v)}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1300,
            width: 90,
            height: 90,
            background: avatar ? 'transparent' : CAJITO_GRADIENT,
            color: 'white',
            boxShadow: `0 8px 24px ${CAJITO_SHADOW}`,
            border: avatar ? `3px solid ${CAJITO_RING}` : 'none',
            overflow: 'hidden',
            p: 0,
            '&:hover': {
              transform: 'scale(1.05)',
              boxShadow: `0 12px 32px ${CAJITO_SHADOW}`,
            },
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
        >
          {avatar ? (
            <Box
              component="img"
              src={avatar}
              alt="Cajito"
              onError={() => setImgError(true)}
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <SmartToyIcon sx={{ fontSize: 42 }} />
          )}
        </Fab>
      </Tooltip>

      {/* === Panel de chat (no modal: deja seguir trabajando) === */}
      <Slide direction="up" in={open} mountOnEnter unmountOnExit>
        <Paper
          elevation={12}
          sx={{
            position: 'fixed',
            bottom: 130,
            right: 24,
            width: { xs: 'calc(100vw - 48px)', sm: 380 },
            maxWidth: 400,
            height: 560,
            maxHeight: 'calc(100vh - 160px)',
            zIndex: 1299,
            borderRadius: 3,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            border: `2px solid ${CAJITO_RING}`,
          }}
        >
          {/* Header */}
          <Box
            sx={{
              background: CAJITO_GRADIENT,
              color: 'white',
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <Avatar
              src={avatar || undefined}
              sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 44, height: 44, border: '2px solid rgba(255,255,255,0.6)' }}
            >
              {!avatar && <SmartToyIcon />}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" fontWeight={700} lineHeight={1.1}>
                Cajito
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.9 }}>
                Asistente IA · Claude 3.5 Sonnet{isSuperAdmin ? ' · Super Admin' : ''}
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          </Box>

          {/* Mensajes */}
          <Box
            ref={listRef}
            sx={{
              flex: 1,
              overflowY: 'auto',
              bgcolor: '#FFF8F2',
              p: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            {messages.map((m) => (
              <Box
                key={m.id}
                sx={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  bgcolor: m.role === 'user' ? CAJITO_RING : 'white',
                  color: m.role === 'user' ? 'white' : 'text.primary',
                  border: m.role === 'user' ? 'none' : '1px solid #FFE0B2',
                  borderRadius: 2,
                  px: 1.25,
                  py: 0.75,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                }}
              >
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {m.text}
                </Typography>
              </Box>
            ))}
            {thinking && (
              <Box sx={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                <CircularProgress size={14} sx={{ color: CAJITO_RING }} />
                <Typography variant="caption">Cajito está escribiendo…</Typography>
              </Box>
            )}
          </Box>

          {/* Input */}
          <Box
            sx={{
              borderTop: '1px solid #FFE0B2',
              p: 1,
              display: 'flex',
              gap: 1,
              alignItems: 'flex-end',
              bgcolor: 'white',
            }}
          >
            <TextField
              fullWidth
              size="small"
              multiline
              maxRows={4}
              placeholder="Escribe a Cajito…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <IconButton
              onClick={handleSend}
              disabled={!input.trim() || thinking}
              sx={{
                background: CAJITO_GRADIENT,
                color: 'white',
                '&:hover': { background: CAJITO_GRADIENT, filter: 'brightness(1.05)' },
                '&.Mui-disabled': { background: '#FFD7B5', color: 'white' },
              }}
            >
              <SendIcon fontSize="small" />
            </IconButton>
          </Box>
        </Paper>
      </Slide>
    </>
  );
}
