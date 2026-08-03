import { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Table, TableHead, TableBody, TableRow, TableCell, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, FormControl, InputLabel,
  Select, MenuItem, Chip, CircularProgress, Snackbar, Alert, Stack, InputAdornment,
} from '@mui/material';
import GavelIcon from '@mui/icons-material/Gavel';
import SearchIcon from '@mui/icons-material/Search';
import api from '../services/api';

interface Shipment {
  id: number; tracking?: string; service_type?: string; shipment_type?: string;
  advisor_id?: number; advisor_name?: string; client_name?: string;
  commission_amount_mxn?: number; status?: string;
  penalized: boolean; penalized_at?: string; penalized_reason?: string; penalized_by_name?: string;
}

const SVC_LABEL: Record<string, string> = {
  pobox_usa_mx: 'PO Box USA', maritimo_china_mx: 'Marítimo China', tdi_aereo: 'TDI Aéreo',
  tdi_express: 'TDI Express', dhl_mx: 'DHL', dhl: 'DHL', gex_warranty: 'GEX', xpay: 'X-Pay',
};
const svcLabel = (s?: string) => (s ? (SVC_LABEL[s] || s) : '—');
const money = (v?: number) => `$${Number(v || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;
const fmtDate = (iso?: string) => { try { return iso ? new Date(iso).toLocaleDateString('es-MX') : ''; } catch { return ''; } };

export default function CastigoPanel() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [service, setService] = useState('all');
  const [search, setSearch] = useState('');
  const [onlyPenalized, setOnlyPenalized] = useState(false);
  const [dialog, setDialog] = useState<Shipment | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/admin/penalties/shipments', { params: { service, search: search.trim() || undefined, only_penalized: onlyPenalized || undefined } });
      setShipments(r.data?.shipments || []);
      if (r.data?.services) setServices(r.data.services);
    } catch { setSnack({ open: true, msg: 'No se pudieron cargar los embarques', sev: 'error' }); }
    finally { setLoading(false); }
  }, [service, search, onlyPenalized]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const openPenalize = (s: Shipment) => { setReason(''); setDialog(s); };
  const applyPenalize = async () => {
    if (!dialog) return;
    setSaving(true);
    try {
      await api.post(`/admin/penalties/${dialog.id}`, { penalized: true, reason: reason.trim() || null });
      setDialog(null);
      setSnack({ open: true, msg: 'Embarque penalizado (no genera comisión)', sev: 'success' });
      load();
    } catch (e: any) { setSnack({ open: true, msg: e?.response?.data?.error || 'No se pudo penalizar', sev: 'error' }); }
    finally { setSaving(false); }
  };
  const removePenalty = async (s: Shipment) => {
    try {
      await api.post(`/admin/penalties/${s.id}`, { penalized: false });
      setSnack({ open: true, msg: 'Castigo retirado', sev: 'success' });
      load();
    } catch { setSnack({ open: true, msg: 'No se pudo quitar el castigo', sev: 'error' }); }
  };

  return (
    <Box>
      <Typography variant="h6" fontWeight={800} sx={{ mb: 0.5 }}>Castigo · Embarques penalizados</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Los embarques marcados como penalizados <b>no generan comisión</b> (se excluyen de los reportes y del pago a asesores).
      </Typography>

      <Stack direction="row" spacing={1.5} sx={{ mb: 2, flexWrap: 'wrap', gap: 1.5 }} alignItems="center">
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Servicio</InputLabel>
          <Select label="Servicio" value={service} onChange={e => setService(String(e.target.value))}>
            <MenuItem value="all">Todos los servicios</MenuItem>
            {services.map(s => <MenuItem key={s} value={s}>{svcLabel(s)}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField size="small" placeholder="Buscar tracking, asesor o cliente…" value={search} onChange={e => setSearch(e.target.value)}
          sx={{ minWidth: 260 }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        <Button size="small" variant={onlyPenalized ? 'contained' : 'outlined'} color="error" onClick={() => setOnlyPenalized(v => !v)}>
          {onlyPenalized ? 'Solo penalizados ✓' : 'Solo penalizados'}
        </Button>
      </Stack>

      {loading ? <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box> : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#111', '& th': { color: '#fff', fontWeight: 700 } }}>
                <TableCell>TRACKING</TableCell>
                <TableCell>SERVICIO</TableCell>
                <TableCell>ASESOR</TableCell>
                <TableCell>CLIENTE</TableCell>
                <TableCell align="right">COMISIÓN</TableCell>
                <TableCell align="center">ESTADO</TableCell>
                <TableCell align="right">ACCIÓN</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shipments.map(s => (
                <TableRow key={s.id} hover sx={s.penalized ? { bgcolor: '#FDECEA' } : undefined}>
                  <TableCell sx={{ fontWeight: 600 }}>{s.tracking || '—'}</TableCell>
                  <TableCell><Chip size="small" label={svcLabel(s.service_type)} /></TableCell>
                  <TableCell>{s.advisor_name || '—'}</TableCell>
                  <TableCell>{s.client_name || '—'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, textDecoration: s.penalized ? 'line-through' : 'none', color: s.penalized ? 'text.disabled' : 'inherit' }}>{money(s.commission_amount_mxn)}</TableCell>
                  <TableCell align="center">
                    {s.penalized
                      ? <Chip size="small" color="error" label="Penalizado" title={`${s.penalized_by_name || ''} ${fmtDate(s.penalized_at)}${s.penalized_reason ? ' · ' + s.penalized_reason : ''}`} />
                      : <Chip size="small" variant="outlined" label={s.status || 'activo'} />}
                  </TableCell>
                  <TableCell align="right">
                    {s.penalized
                      ? <Button size="small" variant="text" onClick={() => removePenalty(s)}>Quitar castigo</Button>
                      : <Button size="small" variant="outlined" color="error" startIcon={<GavelIcon />} onClick={() => openPenalize(s)}>Penalizar</Button>}
                  </TableCell>
                </TableRow>
              ))}
              {shipments.length === 0 && <TableRow><TableCell colSpan={7} align="center" sx={{ color: 'text.secondary', py: 3 }}>No hay embarques para este filtro.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* Dialog: confirmar penalización */}
      <Dialog open={!!dialog} onClose={() => setDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}><GavelIcon color="error" /> Penalizar embarque</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            <b>{dialog?.tracking}</b> ({svcLabel(dialog?.service_type)}) — asesor <b>{dialog?.advisor_name || '—'}</b>.
            Esta comisión de <b>{money(dialog?.commission_amount_mxn)}</b> dejará de contar.
          </Typography>
          <TextField fullWidth size="small" label="Motivo (opcional)" multiline minRows={2}
            value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej. Overpromise / robo de cliente / descuento no autorizado" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)} disabled={saving}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={applyPenalize} disabled={saving}>{saving ? 'Guardando…' : 'Penalizar'}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} onClose={() => setSnack(s => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
