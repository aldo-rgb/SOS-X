// ============================================
// DIÁLOGO: Firma de Aviso de Privacidad y Contrato de Asesor
// Permite al asesor leer el documento legal y firmarlo digitalmente
// (canvas) desde la web, equivalente al flujo de la app móvil.
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  IconButton,
  Checkbox,
  FormControlLabel,
  Paper,
} from '@mui/material';
import {
  Close as CloseIcon,
  Refresh as RefreshIcon,
  Draw as DrawIcon,
} from '@mui/icons-material';
import api from '../services/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onAccepted: () => void;
}

export default function AdvisorTermsSignatureDialog({ open, onClose, onAccepted }: Props) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<{ title?: string; content?: string; version?: string } | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // ── Cargar documento ──
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setAccepted(false);
    setHasSignature(false);
    api.get('/api/hr/advisor-privacy-notice')
      .then((res) => setDoc(res.data || {}))
      .catch((e: unknown) => {
        const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setError(msg || 'No se pudo cargar el documento');
      })
      .finally(() => setLoading(false));
  }, [open]);

  // ── Configurar canvas ──
  const setupCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#0A2540';
    }
  }, []);

  useEffect(() => {
    if (!open || loading) return;
    // Esperar a que se renderice el canvas
    const t = setTimeout(setupCanvas, 50);
    return () => clearTimeout(t);
  }, [open, loading, setupCanvas]);

  const getPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    if ('touches' in e) {
      const t = e.touches[0] || e.changedTouches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = getPos(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const p = getPos(e);
    const last = lastPointRef.current;
    if (last) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    lastPointRef.current = p;
    if (!hasSignature) setHasSignature(true);
  };

  const endDraw = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const clearSignature = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) {
      ctx.clearRect(0, 0, c.width, c.height);
    }
    setHasSignature(false);
  };

  const handleSubmit = async () => {
    const c = canvasRef.current;
    if (!c || !accepted || !hasSignature) return;
    setSubmitting(true);
    setError(null);
    try {
      const dataUrl = c.toDataURL('image/png');
      await api.post('/api/hr/accept-advisor-privacy', { signature: dataUrl });
      onAccepted();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Error al registrar la aceptación');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>
            {doc?.title || 'Aviso de Privacidad y Contrato de Asesor'}
          </Typography>
          {doc?.version && (
            <Typography variant="caption" color="text.secondary">
              Versión {doc.version}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} disabled={submitting}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : error && !doc?.content ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                mb: 3,
                maxHeight: 320,
                overflow: 'auto',
                bgcolor: '#fafafa',
                whiteSpace: 'pre-wrap',
                fontSize: 14,
                lineHeight: 1.6,
                fontFamily: '"Inter", "Roboto", sans-serif',
              }}
            >
              {doc?.content || 'Documento no disponible.'}
            </Paper>

            <FormControlLabel
              control={
                <Checkbox
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  sx={{ color: '#F05A28', '&.Mui-checked': { color: '#F05A28' } }}
                />
              }
              label={
                <Typography variant="body2" fontWeight={600}>
                  He leído y acepto los Términos y el Aviso de Privacidad para Asesores
                </Typography>
              }
              sx={{ mb: 2 }}
            />

            <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <DrawIcon fontSize="small" sx={{ color: '#0A2540' }} />
              <Typography variant="body2" fontWeight={700}>
                Dibuja tu firma aquí abajo
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Tu firma queda como evidencia de la aceptación junto con la fecha y la IP.
            </Typography>
            <Box
              sx={{
                position: 'relative',
                border: '2px dashed #cbd5e1',
                borderRadius: 2,
                bgcolor: '#fff',
                height: 180,
                touchAction: 'none',
                cursor: 'crosshair',
                overflow: 'hidden',
              }}
            >
              <canvas
                ref={canvasRef}
                style={{ width: '100%', height: '100%', display: 'block' }}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
              />
              {!hasSignature && (
                <Typography
                  variant="caption"
                  sx={{
                    position: 'absolute',
                    top: '50%',
                    left: 0,
                    right: 0,
                    textAlign: 'center',
                    transform: 'translateY(-50%)',
                    color: '#94a3b8',
                    pointerEvents: 'none',
                  }}
                >
                  Firma con el mouse o el dedo (touch)
                </Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
              <Button
                size="small"
                startIcon={<RefreshIcon />}
                onClick={clearSignature}
                disabled={!hasSignature || submitting}
              >
                Limpiar firma
              </Button>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancelar</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!accepted || !hasSignature || submitting || loading}
          sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#d94d20' } }}
        >
          {submitting ? 'Registrando…' : 'Aceptar y firmar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
