import { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Table, TableHead, TableBody, TableRow, TableCell, Button,
  TextField, FormControl, InputLabel, Select, MenuItem, Chip, CircularProgress,
  Snackbar, Alert, Stack, Divider, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, Tooltip,
} from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
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
  concepto: string; notas?: string | null; fecha_registro: string; payment_reference: string;
  cliente_nombre?: string; box_id?: string; autorizado_nombre?: string;
  pago_status?: string; paid_at?: string; monto_mxn?: number;
  es_cobro_aparte?: boolean;
}

// Un cargo ya pagado no se corrige: el dinero entró y tiene que seguir teniendo
// su respaldo. La corrección ahí es un descuento o un cargo nuevo (tarea 1056).
const yaSeCobro = (c: Cargo) => c.pago_status === 'paid' || c.pago_status === 'completed';

export default function CargosExtraPanel() {
  const [form, setForm] = useState({ servicio: 'package', tracking: '', monto: '', moneda: 'MXN', concepto: '', notas: '' });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' | 'info' }>({ open: false, msg: '', sev: 'success' });
  const [editar, setEditar] = useState<Cargo | null>(null);
  const [editForm, setEditForm] = useState({ monto: '', moneda: 'MXN', concepto: '', notas: '' });
  const [editando, setEditando] = useState(false);
  const [borrar, setBorrar] = useState<Cargo | null>(null);
  const [borrando, setBorrando] = useState(false);

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

  const abrirEdicion = (c: Cargo) => {
    setEditar(c);
    setEditForm({
      monto: String(Number(c.monto) || ''), moneda: c.moneda || 'MXN',
      concepto: c.concepto || '', notas: c.notas || '',
    });
  };

  const guardarEdicion = async () => {
    if (!editar) return;
    if (!(Number(editForm.monto) > 0)) { setSnack({ open: true, msg: 'Captura un monto válido', sev: 'error' }); return; }
    if (!editForm.concepto.trim()) { setSnack({ open: true, msg: 'El concepto es obligatorio', sev: 'error' }); return; }
    setEditando(true);
    try {
      const r = await api.put(`/cs/ajustes/${editar.id}`, {
        monto: Number(editForm.monto), moneda: editForm.moneda,
        concepto: editForm.concepto.trim(), notas: editForm.notas.trim() || null,
      });
      setSnack({ open: true, msg: r.data?.message || 'Cargo corregido', sev: 'success' });
      setEditar(null);
      load();
    } catch (e: any) {
      const d = e?.response?.data;
      setSnack({ open: true, msg: d?.message || d?.error || 'No se pudo corregir el cargo', sev: 'error' });
    } finally { setEditando(false); }
  };

  const confirmarBorrado = async () => {
    if (!borrar) return;
    setBorrando(true);
    try {
      const r = await api.delete(`/cs/ajustes/${borrar.id}`);
      setSnack({ open: true, msg: r.data?.message || 'Cargo eliminado', sev: 'success' });
      setBorrar(null);
      load();
    } catch (e: any) {
      const d = e?.response?.data;
      setSnack({ open: true, msg: d?.message || d?.error || 'No se pudo eliminar el cargo', sev: 'error' });
    } finally { setBorrando(false); }
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

      <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 0.5 }}>Cargos extra registrados</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Mientras el cliente no lo haya pagado puedes corregir el monto o el concepto, o quitar el cargo. Si ya se cobró,
        la corrección va como descuento o como cargo nuevo.
      </Typography>
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
                <TableCell align="center">ACCIONES</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cargos.map(c => (
                <TableRow key={c.id} hover>
                  <TableCell sx={{ fontWeight: 700 }}>
                    {c.payment_reference || <Chip size="small" variant="outlined" label="Al saldo" />}
                  </TableCell>
                  <TableCell>{c.guia_tracking}</TableCell>
                  <TableCell><Chip size="small" label={svcLabel(c.servicio)} /></TableCell>
                  <TableCell>{c.cliente_nombre || '—'}{c.box_id ? ` · ${c.box_id}` : ''}</TableCell>
                  <TableCell sx={{ maxWidth: 220 }}><Typography variant="body2" noWrap title={c.concepto}>{c.concepto}</Typography></TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {money(c.monto_mxn ?? c.monto)}{!c.es_cobro_aparte && c.moneda === 'USD' ? ' USD' : ''}
                  </TableCell>
                  <TableCell align="center">
                    {c.es_cobro_aparte ? (
                      <Chip size="small" color={yaSeCobro(c) ? 'success' : 'warning'} variant={yaSeCobro(c) ? 'filled' : 'outlined'}
                        label={yaSeCobro(c) ? 'Pagado' : 'Pendiente'} />
                    ) : (
                      <Chip size="small" variant="outlined" label="En el saldo" />
                    )}
                  </TableCell>
                  <TableCell>{c.autorizado_nombre || '—'}</TableCell>
                  <TableCell>{fmtDate(c.fecha_registro)}</TableCell>
                  <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                    {yaSeCobro(c) ? (
                      <Tooltip title="Ya lo pagó el cliente: corrígelo con un descuento o un cargo nuevo">
                        <Typography variant="caption" color="text.secondary">Cobrado</Typography>
                      </Tooltip>
                    ) : (
                      <>
                        <Tooltip title="Corregir monto o concepto">
                          <IconButton size="small" onClick={() => abrirEdicion(c)}><EditIcon fontSize="small" /></IconButton>
                        </Tooltip>
                        <Tooltip title="Quitar el cargo">
                          <IconButton size="small" color="error" onClick={() => setBorrar(c)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {cargos.length === 0 && <TableRow><TableCell colSpan={10} align="center" sx={{ color: 'text.secondary', py: 3 }}>Aún no hay cargos extra registrados.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      )}
      <Divider sx={{ mt: 2 }} />

      {/* Corregir un cargo todavía no cobrado */}
      <Dialog open={!!editar} onClose={() => setEditar(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Corregir cargo extra</DialogTitle>
        <DialogContent>
          {editar && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Guía <b>{editar.guia_tracking}</b> · {svcLabel(editar.servicio)}
                {editar.payment_reference ? <> · cobro <b>{editar.payment_reference}</b></> : <> · sumado al saldo de la guía</>}
              </Typography>
              <Stack direction="row" spacing={1.5} sx={{ mb: 1.5 }}>
                <TextField size="small" label="Monto" type="number" sx={{ width: 160 }} value={editForm.monto}
                  onChange={e => setEditForm({ ...editForm, monto: e.target.value })} />
                <FormControl size="small" sx={{ width: 120 }} disabled={!!editar.payment_reference}>
                  <InputLabel>Moneda</InputLabel>
                  <Select label="Moneda" value={editForm.moneda} onChange={e => setEditForm({ ...editForm, moneda: String(e.target.value) })}>
                    <MenuItem value="MXN">MXN</MenuItem>
                    <MenuItem value="USD">USD</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
              <TextField fullWidth size="small" label="Concepto / motivo" required sx={{ mb: 1.5 }}
                value={editForm.concepto} onChange={e => setEditForm({ ...editForm, concepto: e.target.value })} />
              <TextField fullWidth size="small" label="Notas (opcional)" multiline minRows={2}
                value={editForm.notas} onChange={e => setEditForm({ ...editForm, notas: e.target.value })} />
              <Alert severity="info" sx={{ mt: 2 }}>
                {editar.payment_reference
                  ? 'Se actualiza también la cuenta por pagar del cliente, Cobranza y lo que ve el asesor. El cobro se emitió en pesos.'
                  : 'Se recalcula el saldo de la guía y la cotización que todavía no se paga.'}
              </Alert>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditar(null)}>Cancelar</Button>
          <Button variant="contained" onClick={guardarEdicion} disabled={editando}>
            {editando ? 'Guardando…' : 'Guardar corrección'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Quitar el cargo */}
      <Dialog open={!!borrar} onClose={() => setBorrar(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>¿Quitar este cargo?</DialogTitle>
        <DialogContent>
          {borrar && (
            <>
              <Typography variant="body2">
                {borrar.concepto} · <b>{money(borrar.monto_mxn ?? borrar.monto)}</b> · guía {borrar.guia_tracking}
              </Typography>
              <Alert severity="warning" sx={{ mt: 2 }}>
                {borrar.payment_reference
                  ? `Se cancela el cobro ${borrar.payment_reference}: deja de aparecerle al cliente, en Cobranza y al asesor.`
                  : 'Deja de sumarse al saldo de la guía y a la cotización pendiente.'}
              </Alert>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBorrar(null)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={confirmarBorrado} disabled={borrando}>
            {borrando ? 'Quitando…' : 'Sí, quitar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={5000} onClose={() => setSnack(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} onClose={() => setSnack(s => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
