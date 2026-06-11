// Botón de sincronización Syncfy reutilizable.
// Para bancos con 2FA abre el Connect Widget en modo "actualizar credencial"
// antes de correr la sync. Para bancos sin 2FA, sincroniza directamente.

import { useRef, useState } from 'react';
import {
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
  Box,
} from '@mui/material';
import { Sync as SyncIcon, Close as CloseIcon } from '@mui/icons-material';
import api from '../services/api';

interface Props {
  emitterId: number;
  onSuccess?: (result: { new_count: number; matched_count: number }) => void;
  label?: string;
  size?: 'small' | 'medium' | 'large';
  variant?: 'contained' | 'outlined' | 'text';
  color?: 'primary' | 'success' | 'inherit';
  disabled?: boolean;
  sx?: object;
}

export default function SyncfyRefreshButton({
  emitterId,
  onSuccess,
  label = 'Sincronizar',
  size = 'small',
  variant = 'contained',
  color = 'success',
  disabled = false,
  sx = {},
}: Props) {
  const [loading, setLoading] = useState(false);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetInstanceRef = useRef<any>(null);

  const runSync = async () => {
    setLoading(true);
    try {
      const res = await api.post('/admin/syncfy/sync', { emitter_id: emitterId, days_back: 90 });
      onSuccess?.({ new_count: res.data.new_count ?? 0, matched_count: res.data.matched_count ?? 0 });
    } catch (err: any) {
      console.error('[SyncfyRefreshButton] sync error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const openWidget = async (idCredential: string) => {
    try {
      const tokenRes = await api.post('/admin/syncfy/widget-token', { emitter_id: emitterId });
      const { token } = tokenRes.data;
      if (!token) return;

      if (widgetInstanceRef.current && typeof widgetInstanceRef.current.destroy === 'function') {
        try { widgetInstanceRef.current.destroy(); } catch { /* noop */ }
        widgetInstanceRef.current = null;
      }

      setWidgetOpen(true);

      setTimeout(async () => {
        try {
          const container = containerRef.current;
          if (!container) { setWidgetOpen(false); return; }
          container.innerHTML = '';
          const mountNode = document.createElement('div');
          mountNode.id = 'syncfy-refresh-mount';
          container.appendChild(mountNode);

          const mod = await import('@syncfy/authentication-widget');
          const SyncfyWidget: any = (mod as any).default || mod;
          const widget: any = new SyncfyWidget({
            token,
            element: '#syncfy-refresh-mount',
            config: {
              locale: 'es',
              entrypoint: { country: 'MX', siteOrganizationType: '56cf4f5b784806cf028b4568' },
              navigation: { displayStatusInToast: true },
            },
          });

          if (typeof widget.setEntrypointUpdateCredential === 'function') {
            widget.setEntrypointUpdateCredential(idCredential);
          }
          if (typeof widget.open === 'function') { try { widget.open(); } catch { /* noop */ } }

          if (typeof widget.on === 'function') {
            const onDone = async () => {
              setWidgetOpen(false);
              await runSync();
            };
            widget.on('credential-created', onDone);
            widget.on('credentials', onDone);
            widget.on('success', onDone);
            widget.on('auth_success', onDone);
            widget.on('updated', onDone);
            widget.on('error', async (err: any) => {
              if (err?.id_credential) { await onDone(); }
              else { setWidgetOpen(false); setLoading(false); }
            });
            widget.on('exit', () => { setWidgetOpen(false); setLoading(false); });
          }

          widgetInstanceRef.current = widget;
        } catch (err: any) {
          console.error('[SyncfyRefreshButton] widget error:', err.message);
          setWidgetOpen(false);
          setLoading(false);
        }
      }, 250);
    } catch (err: any) {
      console.error('[SyncfyRefreshButton] widget-token error:', err.message);
      setLoading(false);
    }
  };

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await api.get('/admin/syncfy/links', { params: { emitter_id: emitterId } });
      const links: any[] = res.data.links || [];
      const twofaLink = links.find((l: any) => l.twofa_required && l.id_credential);
      if (twofaLink) {
        // No apagar loading aquí: se muestra mientras el widget está abierto
        await openWidget(twofaLink.id_credential);
      } else {
        await runSync();
      }
    } catch {
      await runSync();
    }
  };

  return (
    <>
      <Button
        variant={variant}
        color={color}
        size={size}
        disabled={disabled || loading}
        onClick={handleClick}
        startIcon={loading && !widgetOpen ? <CircularProgress size={14} color="inherit" /> : <SyncIcon />}
        sx={sx}
      >
        {loading && !widgetOpen ? 'Sincronizando...' : label}
      </Button>

      <Dialog
        open={widgetOpen}
        onClose={() => {
          if (widgetInstanceRef.current && typeof widgetInstanceRef.current.close === 'function') {
            try { widgetInstanceRef.current.close(); } catch { /* noop */ }
          }
          setWidgetOpen(false);
          setLoading(false);
        }}
        maxWidth="md"
        fullWidth
        disableEnforceFocus
        disableRestoreFocus
        PaperProps={{ sx: { minHeight: 600, borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Typography fontWeight={700}>Autenticación Bancaria</Typography>
          <IconButton size="small" onClick={() => { setWidgetOpen(false); setLoading(false); }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box
            ref={containerRef}
            sx={{ width: '100%', minHeight: 540, display: 'flex', alignItems: 'stretch' }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
