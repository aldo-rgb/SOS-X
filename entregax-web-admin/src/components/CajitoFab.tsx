// ============================================
// CAJITO FAB — Botón flotante de acceso al asistente IA
// Se muestra solo si el toggle global `cajito_enabled` está activo.
// Usa el avatar configurado en brand_assets (slot 'cajito_avatar').
// ============================================

import { useState } from 'react';
import {
  Fab,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Avatar,
  Alert,
  IconButton,
} from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CloseIcon from '@mui/icons-material/Close';
import { usePaymentStatus } from '../hooks/usePaymentStatus';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const resolveUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/uploads/')) return `${API_BASE}${url}`;
  if (url.startsWith('uploads/')) return `${API_BASE}/${url}`;
  if (url.startsWith('/')) return `${API_BASE}${url}`;
  return `${API_BASE}/${url}`;
};

export default function CajitoFab() {
  const { cajitoEnabled, cajitoAvatarUrl, loading } = usePaymentStatus();
  const [open, setOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  if (loading || !cajitoEnabled) return null;

  const avatar = imgError ? null : resolveUrl(cajitoAvatarUrl);

  return (
    <>
      <Tooltip title="Hablar con Cajito" placement="left">
        <Fab
          onClick={() => setOpen(true)}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1300,
            width: 90,
            height: 90,
            background: avatar
              ? 'transparent'
              : 'linear-gradient(135deg, #7B1FA2 0%, #C2185B 100%)',
            color: 'white',
            boxShadow: '0 8px 24px rgba(123,31,162,0.35)',
            border: avatar ? '2px solid #7B1FA2' : 'none',
            overflow: 'hidden',
            p: 0,
            '&:hover': {
              transform: 'scale(1.05)',
              boxShadow: '0 12px 32px rgba(123,31,162,0.5)',
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

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle
          sx={{
            background: 'linear-gradient(135deg, #7B1FA2 0%, #C2185B 100%)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            pr: 1,
          }}
        >
          <Avatar
            src={avatar || undefined}
            sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 48, height: 48 }}
          >
            {!avatar && <SmartToyIcon />}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" fontWeight={700} lineHeight={1.2}>
              Cajito
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>
              Asistente IA · Claude 3.5 Sonnet
            </Typography>
          </Box>
          <IconButton onClick={() => setOpen(false)} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight={600} gutterBottom>
              👋 ¡Hola! Soy Cajito.
            </Typography>
            <Typography variant="caption" component="div">
              Pronto podré ayudarte a consultar paquetes, clientes, KPIs y mucho más
              directamente desde aquí. El chat se habilitará cuando el módulo de IA esté
              integrado en esta versión.
            </Typography>
          </Alert>
          <Typography variant="caption" color="text.secondary">
            Tu administrador controla qué puedo ver y hacer en tu nombre desde
            <strong> Permisos &gt; Cajito (IA)</strong>.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpen(false)} variant="contained" color="secondary">
            Entendido
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
