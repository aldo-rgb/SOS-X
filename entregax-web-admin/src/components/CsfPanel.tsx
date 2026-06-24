/**
 * CsfPanel — panel reutilizable de Constancia de Situación Fiscal con
 * vigencia de 3 meses. Modos:
 *
 *  - "self": el usuario logueado gestiona su PROPIA CSF
 *    (endpoints /api/fiscal/constancia).
 *  - "for-client": un asesor/admin gestiona la CSF de un CLIENTE
 *    (endpoints /api/advisor/clients/:userId/constancia).
 */
import React, { useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Button, Chip, IconButton, Tooltip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Stack, Alert, TextField,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import ReceiptIcon from '@mui/icons-material/Receipt';
import CloseIcon from '@mui/icons-material/Close';
import api from '../api/axios';

const ORANGE = '#F05A28';

export type CsfStatus = {
  exists: boolean;
  file_url?: string;
  original_filename?: string;
  issued_at?: string | null;
  valid_until?: string | null;
  is_valid?: boolean;
  days_to_expire?: number | null;
};

type Props = {
  mode: 'self' | 'for-client';
  /** Required when mode === 'for-client' */
  clientUserId?: number;
  /** Optional title override */
  title?: string;
  /** Hide the descriptive subtitle */
  compact?: boolean;
  /** Called after a successful upload, with the new status */
  onChange?: (s: CsfStatus) => void;
};

const buildEndpoints = (mode: Props['mode'], clientUserId?: number) => {
  if (mode === 'for-client') {
    if (!clientUserId) throw new Error('clientUserId requerido en mode=for-client');
    return {
      get: `/advisor/clients/${clientUserId}/constancia`,
      post: `/advisor/clients/${clientUserId}/constancia`,
    };
  }
  return { get: '/fiscal/constancia', post: '/fiscal/constancia' };
};

export const CsfPanel: React.FC<Props> = ({ mode, clientUserId, title, compact, onChange }) => {
  const endpoints = buildEndpoints(mode, clientUserId);
  const [status, setStatus] = useState<CsfStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [manualDate, setManualDate] = useState<string>('');
  const [needsManualDate, setNeedsManualDate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(endpoints.get);
      const s = res.data || { exists: false };
      setStatus(s);
      onChange?.(s);
    } catch {
      const s = { exists: false } as CsfStatus;
      setStatus(s);
      onChange?.(s);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [mode, clientUserId]);

  const submit = async () => {
    if (!file) { setErr('Selecciona el archivo de la constancia.'); return; }
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('constancia', file);
      if (manualDate && /^\d{4}-\d{2}-\d{2}$/.test(manualDate)) {
        fd.append('issued_at', manualDate);
      }
      const res = await api.post(endpoints.post, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data?.ok) {
        setUploadOpen(false);
        setFile(null);
        setManualDate('');
        setNeedsManualDate(false);
        await load();
        onChange?.(res.data);
      }
    } catch (e: any) {
      const data = e?.response?.data;
      if (data?.needs_manual_date) {
        setNeedsManualDate(true);
        setErr('No pudimos leer la fecha del PDF. Indícala manualmente.');
      } else if (data?.error === 'expired') {
        setErr(data?.message || 'La constancia tiene más de 3 meses. Descarga una más reciente del SAT.');
      } else if (data?.error === 'future_date') {
        setErr(data?.message || 'La fecha de emisión no puede ser futura.');
      } else {
        setErr(data?.message || data?.error || e?.message || 'Error al subir la constancia');
      }
    } finally {
      setUploading(false);
    }
  };

  const fmtDate = (iso?: string | null) =>
    iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es-MX') : '';

  return (
    <>
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          borderRadius: 2,
          borderWidth: 2,
          borderColor: status?.is_valid ? '#2e7d32' : status?.exists ? '#ed6c02' : '#bdbdbd',
          bgcolor: status?.is_valid ? '#e8f5e9' : status?.exists ? '#fff3e0' : '#fafafa',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <ReceiptIcon sx={{ color: status?.is_valid ? '#2e7d32' : status?.exists ? '#ed6c02' : '#9e9e9e' }} />
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                {title || 'Constancia de Situación Fiscal'}
              </Typography>
              {!compact && (
                <Typography variant="caption" color="text.secondary">
                  Necesaria para facturar. Vigencia: 3 meses desde su emisión.
                </Typography>
              )}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {loading ? (
              <CircularProgress size={18} />
            ) : status?.exists && status.is_valid ? (
              <>
                <Chip
                  label={`Vigente · hasta ${fmtDate(status.valid_until)}`}
                  color="success"
                  size="small"
                  sx={{ fontWeight: 700 }}
                />
                {status.file_url && (
                  <Tooltip title="Ver constancia">
                    <IconButton
                      size="small"
                      component="a"
                      href={status.file_url}
                      target="_blank"
                      rel="noopener"
                      sx={{ color: '#2e7d32', border: '1px solid rgba(46,125,50,0.4)' }}
                    >
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => { setFile(null); setManualDate(''); setNeedsManualDate(false); setErr(null); setUploadOpen(true); }}
                >
                  Reemplazar
                </Button>
              </>
            ) : status?.exists ? (
              <>
                <Chip
                  label={`Expirada · venció el ${fmtDate(status.valid_until)}`}
                  color="warning"
                  size="small"
                  sx={{ fontWeight: 700 }}
                />
                <Button
                  size="small"
                  variant="contained"
                  color="warning"
                  startIcon={<DownloadIcon />}
                  onClick={() => { setFile(null); setManualDate(''); setNeedsManualDate(false); setErr(null); setUploadOpen(true); }}
                >
                  Actualizar
                </Button>
              </>
            ) : (
              <Button
                size="small"
                variant="contained"
                sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d94d1f' } }}
                startIcon={<DownloadIcon />}
                onClick={() => { setFile(null); setManualDate(''); setNeedsManualDate(false); setErr(null); setUploadOpen(true); }}
              >
                Subir constancia
              </Button>
            )}
          </Box>
        </Box>
        {status?.exists && status.is_valid && status.days_to_expire != null && status.days_to_expire <= 14 && (
          <Alert severity="warning" sx={{ mt: 1.5, py: 0.5 }}>
            La constancia vence en {status.days_to_expire} día{status.days_to_expire === 1 ? '' : 's'}. Renuévala pronto desde el portal SAT.
          </Alert>
        )}
      </Paper>

      <Dialog
        open={uploadOpen}
        onClose={() => { if (!uploading) setUploadOpen(false); }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ bgcolor: ORANGE, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>📄 Subir Constancia de Situación Fiscal</Box>
          <IconButton size="small" onClick={() => { if (!uploading) setUploadOpen(false); }} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={2}>
            <Alert severity="info" sx={{ py: 0.5 }}>
              Debe ser la constancia más reciente del SAT (no más de 3 meses de antigüedad).
            </Alert>
            <Box
              component="label"
              sx={{
                border: `2px dashed ${ORANGE}`,
                borderRadius: 2,
                p: 3,
                textAlign: 'center',
                cursor: uploading ? 'not-allowed' : 'pointer',
                bgcolor: 'rgba(240,90,40,0.04)',
                '&:hover': { bgcolor: uploading ? 'rgba(240,90,40,0.04)' : 'rgba(240,90,40,0.1)' },
                opacity: uploading ? 0.6 : 1,
              }}
            >
              <DownloadIcon sx={{ fontSize: 40, color: ORANGE, mb: 1 }} />
              <Typography variant="body2" fontWeight={700}>
                {file ? file.name : 'Haz clic o arrastra la constancia (PDF/JPG/PNG)'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Tamaño máximo: 15 MB
              </Typography>
              <input
                hidden
                type="file"
                accept="application/pdf,image/*"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { setFile(f); setErr(null); setNeedsManualDate(false); setManualDate(''); }
                  e.target.value = '';
                }}
              />
            </Box>

            {needsManualDate && (
              <TextField
                label="Fecha de emisión de la constancia"
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
                helperText="La fecha que aparece en la CSF (Lugar y fecha de emisión)."
              />
            )}

            {err && (
              <Alert severity={needsManualDate ? 'warning' : 'error'}>
                {err}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { if (!uploading) setUploadOpen(false); }} disabled={uploading}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d94d1f' } }}
            onClick={submit}
            disabled={!file || uploading || (needsManualDate && !manualDate)}
          >
            {uploading ? 'Subiendo…' : 'Subir y validar'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default CsfPanel;
