// ============================================================================
// EntangledServiceConfigCard
// Panel admin para configurar las comisiones globales que XPAY le cobra al
// cliente final por cada servicio de ENTANGLED v2.
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Card, CardContent, Typography, Box, Stack, TextField, Button,
  CircularProgress, Alert, Divider, Chip, InputAdornment,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import LocalAtmIcon from '@mui/icons-material/LocalAtm';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ServiceConfig {
  comision_pago_con_factura: number;
  comision_pago_sin_factura: number;
  updated_at?: string;
}

export default function EntangledServiceConfigCard() {
  const [cfg, setCfg] = useState<ServiceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'error'; msg: string } | null>(null);

  const authHeaders = {
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await axios.get(`${API_URL}/api/admin/entangled/service-config`, { headers: authHeaders });
      setCfg({
        comision_pago_con_factura: Number(r.data?.comision_pago_con_factura ?? 6),
        comision_pago_sin_factura: Number(r.data?.comision_pago_sin_factura ?? 4),
        updated_at: r.data?.updated_at,
      });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Error al cargar configuración';
      setFeedback({ severity: 'error', msg });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!cfg) return;
    if (cfg.comision_pago_con_factura < 0 || cfg.comision_pago_con_factura > 100) {
      setFeedback({ severity: 'error', msg: '% con factura debe estar entre 0 y 100' });
      return;
    }
    if (cfg.comision_pago_sin_factura < 0 || cfg.comision_pago_sin_factura > 100) {
      setFeedback({ severity: 'error', msg: '% sin factura debe estar entre 0 y 100' });
      return;
    }
    try {
      setSaving(true);
      const r = await axios.put(
        `${API_URL}/api/admin/entangled/service-config`,
        {
          comision_pago_con_factura: cfg.comision_pago_con_factura,
          comision_pago_sin_factura: cfg.comision_pago_sin_factura,
        },
        { headers: authHeaders }
      );
      setCfg({
        comision_pago_con_factura: Number(r.data.comision_pago_con_factura),
        comision_pago_sin_factura: Number(r.data.comision_pago_sin_factura),
        updated_at: r.data.updated_at,
      });
      setFeedback({ severity: 'success', msg: 'Configuración guardada' });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Error al guardar';
      setFeedback({ severity: 'error', msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 3, mb: 3 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h6" fontWeight={700}>Comisiones XPAY → Cliente final</Typography>
            <Typography variant="caption" color="text.secondary">
              Porcentaje que XPAY le cobra al cliente final por cada servicio.
              La utilidad real será (% XPAY − % de costo).
            </Typography>
          </Box>
          {cfg?.updated_at && (
            <Chip size="small" label={`Actualizado: ${new Date(cfg.updated_at).toLocaleString('es-MX')}`} />
          )}
        </Stack>

        <Divider sx={{ mb: 2 }} />

        {feedback && (
          <Alert severity={feedback.severity} onClose={() => setFeedback(null)} sx={{ mb: 2 }}>
            {feedback.msg}
          </Alert>
        )}

        {loading || !cfg ? (
          <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress size={28} /></Box>
        ) : (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              fullWidth
              label="Pago con factura"
              type="number"
              value={cfg.comision_pago_con_factura}
              onChange={(e) => setCfg({ ...cfg, comision_pago_con_factura: Number(e.target.value) })}
              InputProps={{
                startAdornment: <InputAdornment position="start"><ReceiptLongIcon fontSize="small" /></InputAdornment>,
                endAdornment: <InputAdornment position="end">%</InputAdornment>,
                inputProps: { min: 0, max: 100, step: 0.1 },
              }}
              helperText="Incluye factura SAT al cliente final"
            />
            <TextField
              fullWidth
              label="Pago sin factura"
              type="number"
              value={cfg.comision_pago_sin_factura}
              onChange={(e) => setCfg({ ...cfg, comision_pago_sin_factura: Number(e.target.value) })}
              InputProps={{
                startAdornment: <InputAdornment position="start"><LocalAtmIcon fontSize="small" /></InputAdornment>,
                endAdornment: <InputAdornment position="end">%</InputAdornment>,
                inputProps: { min: 0, max: 100, step: 0.1 },
              }}
              helperText="Sin emisión de factura SAT"
            />
            <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
              <Button
                variant="contained"
                color="primary"
                disabled={saving}
                onClick={save}
                startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                sx={{ height: 56, minWidth: 140 }}
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </Button>
            </Box>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
