// ============================================================
// Reembolsos de PayPal
//
// El endpoint para devolver un cobro ya existía, pero no había por dónde
// llegarle: hay que saberse de memoria un id de captura de 17 caracteres. Así
// que un doble cobro confirmado se quedaba esperando a que alguien lo hiciera
// a mano contra el API (tarea 1014).
//
// Aquí se busca por lo que la gente sí tiene a la mano —casillero, guía,
// referencia PP- o nombre— y se devuelve el cobro con dos clics. Cada
// devolución queda registrada con quién la emitió.
// ============================================================
import { useState } from 'react';
import {
  Box, Typography, TextField, Button, InputAdornment, CircularProgress, Alert,
  Table, TableHead, TableRow, TableCell, TableBody, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ReplayIcon from '@mui/icons-material/Replay';
import api from '../services/api';

const ORANGE = '#D6521C';

interface Reembolso { id: number; refund_id: string | null; monto: string; estado: string; fecha: string }
interface Captura {
  id: number; capture_id: string; paypal_order_id: string; payment_ref: string | null;
  amount: string; currency: string; service_type: string; status: string;
  captured_at: string | null; created_at: string;
  user_id: number | null; box_id: string | null; full_name: string | null;
  guias: string[]; reembolsos: Reembolso[];
}

const fmt = (n: any) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
const fecha = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' }) : '—');

export default function ReembolsosPaypalTab() {
  const [q, setQ] = useState('');
  const [cargando, setCargando] = useState(false);
  const [capturas, setCapturas] = useState<Captura[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [elegida, setElegida] = useState<Captura | null>(null);
  const [motivo, setMotivo] = useState('');
  const [emitiendo, setEmitiendo] = useState(false);

  const buscar = async () => {
    if (q.trim().length < 3) { setError('Escribe al menos 3 caracteres.'); return; }
    setCargando(true); setError(null); setAviso(null);
    try {
      const r = await api.get('/payments/paypal/captures', { params: { q: q.trim() } });
      setCapturas(r.data?.capturas || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo buscar.');
      setCapturas(null);
    } finally { setCargando(false); }
  };

  const devuelto = (c: Captura) =>
    (c.reembolsos || []).filter(r => ['completed', 'pending'].includes(String(r.estado)))
      .reduce((s, r) => s + Number(r.monto || 0), 0);

  const emitir = async () => {
    if (!elegida) return;
    setEmitiendo(true); setError(null);
    try {
      const r = await api.post('/payments/paypal/refund', {
        captureId: elegida.capture_id,
        reason: motivo.trim() || undefined,
        noteToPayer: motivo.trim() || undefined,
      });
      setAviso(`Devuelto ${fmt(r.data?.amount || elegida.amount)} · ${r.data?.status || ''}`);
      setElegida(null); setMotivo('');
      await buscar();
    } catch (e: any) {
      // El codigo de PayPal (details[0].issue) se ensena junto al texto: sirve
      // para buscarlo o para decirselo a soporte de PayPal tal cual.
      const d = e?.response?.data;
      const codigo = d?.issue || d?.details?.[0]?.issue;
      setError([d?.error || 'PayPal rechazó el reembolso.', codigo ? `(${codigo})` : ''].filter(Boolean).join(' '));
    } finally { setEmitiendo(false); }
  };

  return (
    <Box>
      <Typography fontSize={13} color="text.secondary" sx={{ mb: 1.5 }}>
        Busca el cobro por casillero, guía, referencia PP- o nombre del cliente. El dinero regresa al
        mismo medio con que pagó y PayPal devuelve su comisión.
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small" placeholder="S2127, US-8750755629, PP-3623137D…"
          value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') buscar(); }}
          sx={{ minWidth: 320, flex: 1, maxWidth: 480 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <Button variant="contained" onClick={buscar} disabled={cargando}
          sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#B23F12' }, textTransform: 'none' }}>
          {cargando ? <CircularProgress size={20} color="inherit" /> : 'Buscar'}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {aviso && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setAviso(null)}>{aviso}</Alert>}

      {capturas !== null && capturas.length === 0 && (
        <Alert severity="info">No hay cobros de PayPal que empaten con eso.</Alert>
      )}

      {capturas !== null && capturas.length > 0 && (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Fecha</TableCell>
              <TableCell>Cliente</TableCell>
              <TableCell>Guías</TableCell>
              <TableCell>Referencia</TableCell>
              <TableCell align="right">Monto</TableCell>
              <TableCell>Devuelto</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {capturas.map(c => {
              const ya = devuelto(c);
              const completo = ya >= Number(c.amount) - 0.01;
              return (
                <TableRow key={c.id} hover>
                  <TableCell>{fecha(c.captured_at || c.created_at)}</TableCell>
                  <TableCell>
                    <Typography fontSize={13} fontWeight={700}>{c.box_id || '—'}</Typography>
                    <Typography fontSize={11} color="text.secondary">{c.full_name || ''}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontSize={12} fontFamily="monospace">{(c.guias || []).join(', ') || '—'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontSize={12}>{c.payment_ref || '—'}</Typography>
                    <Tooltip title={c.capture_id}>
                      <Typography fontSize={10} color="text.secondary" fontFamily="monospace">
                        {c.capture_id.slice(0, 10)}…
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontSize={13} fontWeight={700}>{fmt(c.amount)}</Typography>
                    <Typography fontSize={10} color="text.secondary">{c.currency}</Typography>
                  </TableCell>
                  <TableCell>
                    {ya > 0
                      ? <Chip size="small" label={fmt(ya)} sx={{ bgcolor: '#E8F5E9', color: '#2E7D46', fontWeight: 700 }} />
                      : <Typography fontSize={12} color="text.disabled">—</Typography>}
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" startIcon={<ReplayIcon />} disabled={completo}
                      onClick={() => { setElegida(c); setMotivo(''); }}
                      sx={{ textTransform: 'none', color: ORANGE }}>
                      {completo ? 'Devuelto' : 'Devolver'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!elegida} onClose={() => !emitiendo && setElegida(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Devolver {fmt(elegida?.amount)} a {elegida?.box_id}</DialogTitle>
        <DialogContent>
          <Typography fontSize={13} sx={{ mb: 1.5 }}>
            {elegida?.full_name} · guías {(elegida?.guias || []).join(', ') || '—'} ·
            cobrado el {fecha(elegida?.captured_at || elegida?.created_at || null)}.
          </Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            El dinero sale de la cuenta de PayPal en cuanto confirmes y no se puede deshacer desde aquí.
          </Alert>
          <TextField
            fullWidth size="small" label="Motivo (lo ve el cliente)" value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Cobro duplicado de la misma guía"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setElegida(null)} disabled={emitiendo} sx={{ textTransform: 'none' }}>Cancelar</Button>
          <Button variant="contained" onClick={emitir} disabled={emitiendo}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#B23F12' }, textTransform: 'none' }}>
            {emitiendo ? <CircularProgress size={20} color="inherit" /> : 'Devolver el dinero'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
