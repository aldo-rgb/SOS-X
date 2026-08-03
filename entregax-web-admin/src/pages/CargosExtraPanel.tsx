import { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Table, TableHead, TableBody, TableRow, TableCell, Button,
  TextField, FormControl, InputLabel, Select, MenuItem, Chip, CircularProgress,
  Snackbar, Alert, Stack, Divider,
} from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import api from '../services/api';

// servicio interno → etiqueta amigable
const SERVICIOS = [
  { key: 'package', label: 'PO Box / Paquete' },
  { key: 'china_receipt', label: 'Aéreo China' },
  { key: 'maritime_order', label: 'Marítimo (Contenedor / FCL)' },
  { key: 'maritime', label: 'Marítimo (LCL)' },
  { key: 'dhl', label: 'DHL Nacional' },
  { key: 'national', label: 'Nacional' },
];
const svcLabel = (k?: string) => SERVICIOS.find(s => s.key === k)?.label || k || '—';
const money = (v?: number) => `$${Number(v || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;
const fmtDate = (iso?: string) => { try { return iso ? new Date(iso).toLocaleString('es-MX') : '—'; } catch { return '—'; } };

interface Cargo {
  id: number; guia_tracking: string; servicio: string; monto: number; moneda: string;
  concepto: string; fecha_registro: string; payment_reference: string;
  cliente_nombre?: string; box_id?: string; autorizado_nombre?: string;
  pago_status?: string; paid_at?: string; monto_mxn?: number;
}

export default function CargosExtraPanel() {
  const [form, setForm] = useState({ servicio: 'package', tracking: '', monto: '', moneda: 'MXN', concepto: '', notas: '' });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' | 'info' }>({ open: false, msg: '', sev: 'success' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get('/cs/cargos-extra'); setCargos(r.data?.cargos || []); }
    catch { /* */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.tracking.trim()) { setSnack({ open: true, msg: 'Captura el tracking de la guía', sev: 'error' }); return; }
    if (!(Number(form.monto) > 0)) { setSnack({ open: true, msg: 'Captura un monto válido', sev: 'error' }); return; }
    if (!form.concepto.trim()) { setSnack({ open: true, msg: 'Captura el concepto / motivo', sev: 'error' }); return; }
    setSaving(true); setResult(null);
    try {
      const r = await api.post('/cs/cargos-extra', {
        guia_tracking: form.tracking.trim(), servicio: form.servicio,
        monto: Number(form.monto), moneda: form.moneda, concepto: form.concepto.trim(), notas: form.notas.trim() || null,
      });
      setResult(r.data);
      setSnack({ open: true, msg: r.data?.mode === 'cex_generated' ? `Orden ${r.data.reference} generada` : 'Cargo agregado al saldo', sev: 'success' });
      setForm(f => ({ ...f, tracking: '', monto: '', concepto: '', notas: '' }));
      load();
    } catch (e: any) { setSnack({ open: true, msg: e?.response?.data?.error || 'No se pudo generar el cargo', sev: 'error' }); }
    finally { setSaving(false); }
  };

  return (
    <Box>
      <Typography variant="h6" fontWeight={800} sx={{ mb: 0.5 }}>Cargos Extra</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Genera un cargo extra a una guía. Si la guía <b>aún no está pagada</b>, se suma a su saldo. Si <b>ya está pagada</b>,
        se genera una orden cobrable <b>CEX-…</b> que le aparece al cliente en "Mis Cuentas por Pagar" (a la cuenta del servicio)
        y en Cobranza para confirmar.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1.5 }} alignItems="flex-start">
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Servicio</InputLabel>
            <Select label="Servicio" value={form.servicio} onChange={e => setForm({ ...form, servicio: String(e.target.value) })}>
              {SERVICIOS.map(s => <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField size="small" label="Tracking de la guía" value={form.tracking} sx={{ minWidth: 240 }}
            onChange={e => setForm({ ...form, tracking: e.target.value })} placeholder="Ej. COSU6441416991" />
          <TextField size="small" label="Monto" type="number" value={form.monto} sx={{ width: 130 }}
            onChange={e => setForm({ ...form, monto: e.target.value })} />
          <FormControl size="small" sx={{ width: 110 }}>
            <InputLabel>Moneda</InputLabel>
            <Select label="Moneda" value={form.moneda} onChange={e => setForm({ ...form, moneda: String(e.target.value) })}>
              <MenuItem value="MXN">MXN</MenuItem>
              <MenuItem value="USD">USD</MenuItem>
            </Select>
          </FormControl>
        </Stack>
        <TextField fullWidth size="small" label="Concepto / motivo del cargo" sx={{ mt: 1.5 }} required
          value={form.concepto} onChange={e => setForm({ ...form, concepto: e.target.value })}
          placeholder="Ej. Almacenaje adicional, reetiquetado, maniobra de contenedor…" />
        <TextField fullWidth size="small" label="Notas (opcional)" sx={{ mt: 1.5 }} multiline minRows={2}
          value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
        <Box sx={{ mt: 1.5, textAlign: 'right' }}>
          <Button variant="contained" color="warning" startIcon={<ReceiptLongIcon />} onClick={submit} disabled={saving}>
            {saving ? 'Generando…' : 'Generar cargo'}
          </Button>
        </Box>

        {result && (
          <Alert severity={result.mode === 'cex_generated' ? 'success' : 'info'} sx={{ mt: 2 }}>
            {result.mode === 'cex_generated' ? (
              <>
                <b>Guía ya pagada → orden cobrable generada.</b><br />
                Referencia: <b>{result.reference}</b> · Monto: <b>{money(result.amount_mxn)} MXN</b><br />
                Cuenta: {result.bank_info?.banco} · CLABE {result.bank_info?.clabe} · {result.bank_info?.beneficiario}<br />
                El cliente ya lo ve en "Mis Cuentas por Pagar"{result.advisor_notified ? ' y su asesor también' : ''}. Se cobra/concilia en Cobranza.
              </>
            ) : (
              <>{result.message}</>
            )}
          </Alert>
        )}
      </Paper>

      <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1 }}>Cargos cobrables (CEX) generados</Typography>
      {loading ? <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={26} /></Box> : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#111', '& th': { color: '#fff', fontWeight: 700 } }}>
                <TableCell>REFERENCIA</TableCell>
                <TableCell>GUÍA</TableCell>
                <TableCell>SERVICIO</TableCell>
                <TableCell>CLIENTE</TableCell>
                <TableCell>CONCEPTO</TableCell>
                <TableCell align="right">MONTO</TableCell>
                <TableCell align="center">PAGO</TableCell>
                <TableCell>MARCÓ</TableCell>
                <TableCell>FECHA</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cargos.map(c => (
                <TableRow key={c.id} hover>
                  <TableCell sx={{ fontWeight: 700 }}>{c.payment_reference}</TableCell>
                  <TableCell>{c.guia_tracking}</TableCell>
                  <TableCell><Chip size="small" label={svcLabel(c.servicio)} /></TableCell>
                  <TableCell>{c.cliente_nombre || '—'}{c.box_id ? ` · ${c.box_id}` : ''}</TableCell>
                  <TableCell sx={{ maxWidth: 220 }}><Typography variant="body2" noWrap title={c.concepto}>{c.concepto}</Typography></TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{money(c.monto_mxn ?? c.monto)}</TableCell>
                  <TableCell align="center">
                    <Chip size="small" color={c.pago_status === 'paid' ? 'success' : 'warning'} variant={c.pago_status === 'paid' ? 'filled' : 'outlined'}
                      label={c.pago_status === 'paid' ? 'Pagado' : 'Pendiente'} />
                  </TableCell>
                  <TableCell>{c.autorizado_nombre || '—'}</TableCell>
                  <TableCell>{fmtDate(c.fecha_registro)}</TableCell>
                </TableRow>
              ))}
              {cargos.length === 0 && <TableRow><TableCell colSpan={9} align="center" sx={{ color: 'text.secondary', py: 3 }}>Aún no hay cargos cobrables generados.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      )}
      <Divider sx={{ mt: 2 }} />
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} onClose={() => setSnack(s => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
