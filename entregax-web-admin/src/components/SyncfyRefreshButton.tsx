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
  onSuccess?: (result: { new_count: number; matched_count: number; credential_warning?: string; credential_status?: number }) => void;
  label?: string;
  size?: 'small' | 'medium' | 'large';
  variant?: 'contained' | 'outlined' | 'text';
  color?: 'primary' | 'success' | 'inherit';
  disabled?: boolean;
  sx?: object;
  /**
   * Si es true, NUNCA abre el widget de re-autenticación 2FA aunque la
   * credencial lo requiera. Solo llama al endpoint /sync. Útil cuando el
   * usuario ya completó el QR/2FA hace poco y solo le falta descargar los
   * movimientos (el job de Syncfy ya esta listo).
   */
  skipWidget?: boolean;
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
  skipWidget = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetInstanceRef = useRef<any>(null);

  const runSync = async () => {
    setLoading(true);
    try {
      const res = await api.post('/admin/syncfy/sync', { emitter_id: emitterId, days_back: 90 });
      onSuccess?.({
        new_count: res.data.new_count ?? 0,
        matched_count: res.data.matched_count ?? 0,
        credential_warning: res.data.credential_warning,
        credential_status: res.data.credential_status,
      });
    } catch (err: any) {
      console.error('[SyncfyRefreshButton] sync error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Registra/actualiza la credencial en nuestra DB Y programa auto-sync diferido 10 min.
  // Debe llamarse siempre que el widget cierre con éxito, ANTES de runSync.
  const registerAndSync = async () => {
    try {
      await api.post('/admin/syncfy/links', { emitter_id: emitterId });
    } catch (err: any) {
      console.warn('[SyncfyRefreshButton] registerLink error (non-fatal):', err.message);
    }
    await runSync();
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

          // ❌ NO usar setEntrypointUpdateCredential(idCredential): en BBVA Empresas
          // el modo "actualizar credencial" muestra "Credenciales encontradas",
          // marca como autenticado y SALE sin volver a pedir el QR/2FA, por lo que
          // la credencial nunca se re-autentica y no se descargan movimientos.
          // En su lugar abrimos el widget en modo CREACIÓN (igual que la conexión
          // nueva en FiscalPage): el usuario selecciona su banco, escanea el QR y
          // se crea una credencial fresca → el cron descarga a los ~10 min. Esto
          // replica el flujo manual "borrar + conectar de cero" que sí funciona.
          void idCredential;
          if (typeof widget.open === 'function') { try { widget.open(); } catch { /* noop */ } }

          if (typeof widget.on === 'function') {
            // Bug observado en BBVA Empresas: tras el QR el widget cierra con
            // 'exit' SIN disparar credential-created/success. Si solo confiamos
            // en esos eventos, runSync nunca se llama y el usuario queda en la
            // misma pantalla "sin que pase nada". Solución: bandera + fallback
            // en exit que también dispara la sync (idempotente — si el job de
            // Syncfy todavía no terminó, devolverá 0 tx pero no rompe nada).
            let syncTriggered = false;
            const triggerSync = async () => {
              if (syncTriggered) return;
              syncTriggered = true;
              setWidgetOpen(false);
              // registerLink registra la credencial actualizada Y programa auto-sync
              // diferido 10 min (cron descargará automáticamente si runSync da 0 ahora)
              await registerAndSync();
            };

            widget.on('credential-created', triggerSync);
            widget.on('credentials', triggerSync);
            widget.on('success', triggerSync);
            widget.on('auth_success', triggerSync);
            widget.on('updated', triggerSync);
            widget.on('error', async (err: any) => {
              if (err?.id_credential) { await triggerSync(); }
              else { setWidgetOpen(false); setLoading(false); }
            });
            widget.on('exit', async () => {
              // Si ya se disparó la sync (por algún success previo) solo cerrar.
              if (syncTriggered) { setWidgetOpen(false); setLoading(false); return; }
              // Fallback: BBVA suele cerrar el widget tras el QR sin emitir success.
              // Registrar credencial + intentar sync con pequeño margen de espera.
              setWidgetOpen(false);
              syncTriggered = true;
              await new Promise(r => setTimeout(r, 1500));
              await registerAndSync();
            });
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
    // Modo "solo sincronizar": ignora 2FA y llama directo al endpoint.
    if (skipWidget) {
      await runSync();
      return;
    }
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
