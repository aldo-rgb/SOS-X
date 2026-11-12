// ============================================================================
// X-PAY — CORREGIR LOS DATOS DEL BENEFICIARIO (tarea 874)
// ============================================================================
// Se abre cuando Servicio a Cliente marcó la orden EN CORRECCIÓN. El asesor
// arregla aquí los datos bancarios de una orden que el cliente YA pagó, sin
// cancelarla.
//
// Solo los datos del beneficiario. Montos, tipo de cambio y comisiones no
// aparecen a propósito: cambiarlos sería otra operación, no una corrección.
//
// Al guardar, el proveedor recibe el aviso con qué campo cambió, de qué valor
// a cuál y con qué número de corrección. El asesor ve aquí mismo si ese aviso
// salió o no, porque de eso depende que del otro lado lo revisen.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Box, Typography, Alert, CircularProgress, Chip, Stack, Divider,
} from '@mui/material';
import EditNoteIcon from '@mui/icons-material/EditNote';
import api from '../services/api';

interface CampoDef { key: string; label: string; max: number | null }

interface Historial {
  id: number;
  numero: number;
  motivo: string | null;
  cambios: Array<{ campo: string; etiqueta: string; anterior: string; nuevo: string }>;
  corregida_at: string;
  corregida_por_nombre: string | null;
  supplier_actualizado: boolean;
  notificado_at: string | null;
  notificacion_error: string | null;
}

interface Props {
  open: boolean;
  requestId: number | null;
  onClose: () => void;
  onSaved?: () => void;
}

const fecha = (v: string | null) =>
  v ? new Date(v).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function XpayCorreccionDialog({ open, requestId, onClose, onSaved }: Props) {
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [orden, setOrden] = useState<any>(null);
  const [campos, setCampos] = useState<CampoDef[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [historial, setHistorial] = useState<Historial[]>([]);

  const cargar = useCallback(async () => {
    if (!requestId) return;
    setCargando(true); setError(null); setResultado(null);
    try {
      const r = await api.get(`/xpay/payment-requests/${requestId}/correccion`);
      setOrden(r.data?.orden || null);
      setCampos(r.data?.campos || []);
      setValores({ ...(r.data?.valores || {}) });
      setOriginal({ ...(r.data?.valores || {}) });
      setHistorial(r.data?.historial || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo cargar la orden');
    } finally {
      setCargando(false);
    }
  }, [requestId]);

  useEffect(() => { if (open) cargar(); }, [open, cargar]);

  // Solo se mandan los campos que de verdad cambiaron: así el aviso al
  // proveedor dice exactamente lo que se tocó y nada más.
  const cambiados = campos.filter((c) => (valores[c.key] || '') !== (original[c.key] || ''));

  const guardar = async () => {
    if (!requestId || cambiados.length === 0) return;
    setGuardando(true); setError(null);
    try {
      const payload: Record<string, string> = {};
      for (const c of cambiados) payload[c.key] = valores[c.key] || '';
      const r = await api.put(`/xpay/payment-requests/${requestId}/correccion`, payload);
      const d = r.data || {};
      const partes = [`Corrección #${d.numero} guardada.`];
      if (d.supplier_actualizado) partes.push('También se corrigió el beneficiario guardado del cliente.');
      partes.push(d.notificado
        ? 'El proveedor ya tiene el aviso con los datos corregidos.'
        : `El aviso al proveedor no salió: ${d.notificacion_error || 'error desconocido'}`);
      setResultado(partes.join(' '));
      setOriginal({ ...valores });
      if (onSaved) onSaved();
      await cargar();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo guardar la corrección');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onClose={guardando ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <EditNoteIcon sx={{ color: '#7B1FA2' }} />
          <Typography variant="h6" fontWeight={800}>
            Corregir datos del beneficiario
          </Typography>
          {orden?.referencia && (
            <Chip size="small" label={orden.referencia} sx={{ fontFamily: 'monospace', fontWeight: 700 }} />
          )}
          {orden?.correccion_abierta && (
            <Chip size="small" label="EN CORRECCIÓN" sx={{ bgcolor: '#7B1FA2', color: '#fff', fontWeight: 800 }} />
          )}
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        {cargando ? (
          <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={28} /></Box>
        ) : (
          <>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {resultado && <Alert severity="success" sx={{ mb: 2 }}>{resultado}</Alert>}

            {orden && !orden.correccion_abierta && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Esta orden no está en corrección. Para poder editarla, Servicio a Cliente
                tiene que marcarla desde el Historial de Órdenes de Pago.
              </Alert>
            )}
            {orden?.motivo && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <strong>Qué hay que corregir:</strong> {orden.motivo}
                {orden.marcada_por ? ` — ${orden.marcada_por}` : ''}
              </Alert>
            )}
            {/* Si el dinero ya salió, la corrección no es un ajuste de papel:
                le pide al proveedor que lo mande otra vez. */}
            {orden?.proveedor_ya_pagado && (
              <Alert severity="error" sx={{ mb: 2 }}>
                El pago al proveedor ya salió. Corregir ahora significa pedirle que lo
                mande de nuevo a la cuenta buena.
              </Alert>
            )}

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {campos.map((c) => {
                const cambio = (valores[c.key] || '') !== (original[c.key] || '');
                return (
                  <TextField
                    key={c.key}
                    label={c.label}
                    size="small"
                    fullWidth
                    value={valores[c.key] || ''}
                    disabled={!orden?.correccion_abierta || guardando}
                    onChange={(e) => setValores({ ...valores, [c.key]: e.target.value })}
                    {...(c.max ? { inputProps: { maxLength: c.max } } : {})}
                    helperText={cambio ? `Antes: ${original[c.key] || '(vacío)'}` : undefined}
                    sx={cambio ? { '& .MuiOutlinedInput-root fieldset': { borderColor: '#7B1FA2', borderWidth: 2 } } : undefined}
                  />
                );
              })}
            </Box>

            {orden?.tiene_beneficiario_guardado && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                Este beneficiario está guardado en la libreta del cliente: la corrección también
                lo arregla ahí, para que la próxima solicitud no vuelva a nacer con el dato malo.
              </Typography>
            )}

            {historial.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                  Correcciones anteriores
                </Typography>
                <Stack spacing={1.2}>
                  {historial.map((h) => (
                    <Box key={h.id} sx={{ p: 1.2, border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Chip size="small" label={`Corrección #${h.numero}`} sx={{ fontWeight: 700 }} />
                        <Typography variant="caption" color="text.secondary">
                          {fecha(h.corregida_at)}{h.corregida_por_nombre ? ` · ${h.corregida_por_nombre}` : ''}
                        </Typography>
                        <Chip size="small" variant="outlined"
                          color={h.notificado_at ? 'success' : 'error'}
                          label={h.notificado_at ? 'Avisado al proveedor' : 'Aviso pendiente'} />
                      </Stack>
                      {h.motivo && (
                        <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>{h.motivo}</Typography>
                      )}
                      {(h.cambios || []).map((c, i) => (
                        <Typography key={i} variant="caption" sx={{ display: 'block', mt: 0.3 }}>
                          <strong>{c.etiqueta}:</strong> {c.anterior || '(vacío)'} → {c.nuevo || '(vacío)'}
                        </Typography>
                      ))}
                      {h.notificacion_error && (
                        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                          {h.notificacion_error}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Stack>
              </>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, pl: 1 }}>
          {cambiados.length > 0
            ? `${cambiados.length} ${cambiados.length === 1 ? 'dato cambiado' : 'datos cambiados'}`
            : 'Todavía no cambiaste nada'}
        </Typography>
        <Button onClick={onClose} disabled={guardando}>Cerrar</Button>
        <Button
          variant="contained"
          disabled={!orden?.correccion_abierta || cambiados.length === 0 || guardando}
          onClick={guardar}
          sx={{ bgcolor: '#7B1FA2', '&:hover': { bgcolor: '#6A1B9A' } }}
        >
          {guardando ? 'Guardando…' : 'Guardar y avisar al proveedor'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
