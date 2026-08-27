/**
 * COBRAR Y ENTREGAR EN MOSTRADOR (PO Box · Hidalgo TX)
 *
 * Una sola pantalla para cerrar un pick-up: muestra solo las guías PO Box
 * listas para recoger —no la operación completa de la empresa, que es lo que
 * hacía inservible el panel de Cobrar para esto—, cobra el saldo en efectivo
 * (pesos o dólares) y registra la entrega.
 *
 * El cobro reusa /admin/finance/confirm-payment, el mismo que usa Caja: así el
 * efectivo aparece en el corte y las guías quedan marcadas como pagadas por el
 * camino de siempre. Aquí no se inventa un segundo registro del dinero.
 *
 * Sin firma a propósito: estas entregas se capturan desde la computadora del
 * mostrador, no desde un teléfono.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Box, Paper, Typography, TextField, Button, Chip, InputAdornment, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Dialog, DialogTitle,
  DialogContent, DialogActions, Alert, ToggleButton, ToggleButtonGroup, Snackbar,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PaidIcon from '@mui/icons-material/Paid';
import api from '../services/api';

interface Guia {
  id: number;
  tracking: string;
  cliente: string;
  box_id: string;
  peso: number;
  cajas: number;
  total: number;
  pagado: number;
  saldo: number;
  referencia: string | null;
  listo_desde: string;
}

const money = (n: number) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

export default function POBoxEntregaMostradorPage() {
  const [guias, setGuias] = useState<Guia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [sel, setSel] = useState<Guia | null>(null);
  const [recibe, setRecibe] = useState('');
  const [notas, setNotas] = useState('');
  const [moneda, setMoneda] = useState<'MXN' | 'USD'>('MXN');
  const [tc, setTc] = useState(17.15);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ txt: string; sev: 'success' | 'error' | 'warning' } | null>(null);

  const cargar = useCallback(async (q = '') => {
    setCargando(true);
    try {
      const r = await api.get('/pobox/entrega-mostrador', { params: q ? { q } : {} });
      setGuias(r.data?.guias || []);
    } catch {
      setAviso({ txt: 'No se pudo cargar la lista', sev: 'error' });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    api.get('/exchange-rate')
      .then(r => { const v = Number(r.data?.rate ?? r.data?.tipo_cambio ?? r.data?.venta); if (v > 0) setTc(v); })
      .catch(() => { /* se queda el valor por defecto */ });
  }, []);

  const abrir = (g: Guia) => { setSel(g); setRecibe(''); setNotas(''); setMoneda('MXN'); };

  const entregar = async () => {
    if (!sel) return;
    if (!recibe.trim()) { setAviso({ txt: 'Escribe el nombre de quien recibe', sev: 'warning' }); return; }
    setGuardando(true);
    try {
      // 1) Si debe, primero se cobra por el camino de Caja (queda en el corte).
      if (sel.saldo > 0.01) {
        if (!sel.referencia) {
          setAviso({ txt: 'Esta guía tiene saldo pero no encuentro su orden de pago. Genera la orden antes de cobrar.', sev: 'error' });
          setGuardando(false);
          return;
        }
        await api.post('/admin/finance/confirm-payment', {
          referencia: sel.referencia,
          metodo_confirmacion: 'efectivo',
          moneda_recibida: moneda,
          monto_recibido: moneda === 'MXN' ? sel.saldo : Number((sel.saldo / tc).toFixed(2)),
          tipo_cambio: tc,
          received_by: recibe.trim(),
          notas: `Cobro en mostrador · entrega de ${sel.tracking}`,
        });
      }
      // 2) Y con el saldo en cero se registra la entrega. Si hubo efectivo, se
      //    manda para que entre a la caja chica de Hidalgo (de ahi sale el corte).
      await api.post(`/pobox/entrega-mostrador/${sel.id}`, {
        recibe: recibe.trim(),
        notas,
        ...(sel.saldo > 0.01
          ? {
              cobrado_monto: moneda === 'MXN' ? sel.saldo : Number((sel.saldo / tc).toFixed(2)),
              cobrado_moneda: moneda,
            }
          : {}),
      });
      setAviso({ txt: `${sel.tracking} entregada a ${recibe.trim()}`, sev: 'success' });
      setSel(null);
      cargar(busqueda);
    } catch (e: any) {
      const d = e?.response?.data;
      setAviso({ txt: d?.message || d?.error || 'No se pudo completar la entrega', sev: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 240 }}>
          <Typography variant="h6" fontWeight={800}>🤝 Cobrar y Entregar en Mostrador</Typography>
          <Typography variant="body2" color="text.secondary">
            Guías PO Box listas para recoger en Hidalgo TX
          </Typography>
        </Box>
        <TextField
          size="small" placeholder="Guía, casillero o cliente…" value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') cargar(busqueda); }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
          sx={{ width: 300 }}
        />
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => cargar(busqueda)}>Actualizar</Button>
      </Box>

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#FAFAFA' }}>
                <TableCell><b>Guía</b></TableCell>
                <TableCell><b>Cliente</b></TableCell>
                <TableCell align="center"><b>Cajas</b></TableCell>
                <TableCell align="right"><b>Total</b></TableCell>
                <TableCell align="right"><b>Saldo</b></TableCell>
                <TableCell align="center"><b>Acción</b></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cargando ? (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><CircularProgress size={26} /></TableCell></TableRow>
              ) : guias.length === 0 ? (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No hay guías listas para recoger.
                </TableCell></TableRow>
              ) : guias.map(g => (
                <TableRow key={g.id} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{g.tracking}</TableCell>
                  <TableCell>
                    {g.cliente}
                    <Chip label={g.box_id} size="small" sx={{ ml: 1, height: 18, fontSize: 10.5 }} />
                  </TableCell>
                  <TableCell align="center">{g.cajas}</TableCell>
                  <TableCell align="right">{money(g.total)}</TableCell>
                  <TableCell align="right">
                    {g.saldo > 0.01
                      ? <Chip label={money(g.saldo)} size="small" color="warning" sx={{ fontWeight: 800 }} />
                      : <Chip label="Pagado" size="small" color="success" sx={{ fontWeight: 800 }} />}
                  </TableCell>
                  <TableCell align="center">
                    <Button
                      size="small" variant="contained"
                      color={g.saldo > 0.01 ? 'warning' : 'success'}
                      startIcon={g.saldo > 0.01 ? <PaidIcon /> : <LocalShippingIcon />}
                      onClick={() => abrir(g)}
                    >
                      {g.saldo > 0.01 ? 'Cobrar y entregar' : 'Entregar'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={!!sel} onClose={() => !guardando && setSel(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          {sel && sel.saldo > 0.01 ? 'Cobrar y entregar' : 'Entregar en mostrador'}
        </DialogTitle>
        <DialogContent dividers>
          {sel && (
            <>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <b>{sel.tracking}</b> · {sel.cliente} ({sel.box_id})
              </Typography>

              {sel.saldo > 0.01 ? (
                <>
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    Saldo pendiente: <b>{money(sel.saldo)} MXN</b>
                    {sel.referencia ? <> · referencia <b>{sel.referencia}</b></> : null}
                  </Alert>
                  <Typography variant="caption" color="text.secondary">Efectivo recibido en</Typography>
                  <ToggleButtonGroup
                    exclusive fullWidth size="small" value={moneda} sx={{ mb: 1, mt: 0.5 }}
                    onChange={(_, v) => v && setMoneda(v)}
                  >
                    <ToggleButton value="MXN">Pesos</ToggleButton>
                    <ToggleButton value="USD">Dólares</ToggleButton>
                  </ToggleButtonGroup>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    Cobrar: <b>{moneda === 'MXN' ? money(sel.saldo) : `$${(sel.saldo / tc).toFixed(2)} USD`}</b>
                    {moneda === 'USD' ? <> · TC ${tc.toFixed(2)}</> : null}
                  </Alert>
                </>
              ) : (
                <Alert severity="success" sx={{ mb: 2 }}>Esta guía ya está pagada. Solo registra la entrega.</Alert>
              )}

              <TextField
                fullWidth size="small" label="¿Quién recibe el paquete?" value={recibe}
                onChange={e => setRecibe(e.target.value)} sx={{ mb: 1.5 }} autoFocus
              />
              <TextField
                fullWidth size="small" label="Notas (opcional)" value={notas}
                onChange={e => setNotas(e.target.value)} multiline rows={2}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSel(null)} disabled={guardando}>Cancelar</Button>
          <Button variant="contained" onClick={entregar} disabled={guardando || !recibe.trim()}>
            {guardando ? 'Guardando…' : (sel && sel.saldo > 0.01 ? 'Cobrar y entregar' : 'Registrar entrega')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!aviso} autoHideDuration={5000} onClose={() => setAviso(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {aviso ? <Alert severity={aviso.sev} onClose={() => setAviso(null)}>{aviso.txt}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
