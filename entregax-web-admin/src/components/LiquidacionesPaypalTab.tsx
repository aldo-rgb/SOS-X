/**
 * Cobros de PayPal, agrupados por día de captura.
 *
 * Contabilidad ve el dinero de PayPal llegar en bulto y no tiene cómo saber de
 * quién es: "esos pagos no se le asignan a un cliente porque son un total de
 * varios pagos" (tarea 1012). El dato existe completo —cada cobro trae su
 * cliente— pero no había pantalla que lo enseñara agrupado como PayPal lo
 * deposita.
 *
 * A propósito NO concilia contra el banco: el depósito de PayPal no se
 * reconoce en el estado de cuenta —ninguna línea lo menciona y llega neto de
 * comisión—, así que casar por monto sería adivinar, y adivinar aquí es
 * colgarle a un cliente el depósito de otro.
 */
import { useState, useEffect, Fragment } from 'react';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Chip, CircularProgress, Alert, IconButton, Collapse, TextField, Button, Stack,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import RefreshIcon from '@mui/icons-material/Refresh';
import api from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#1a1a1a';

type Pago = {
  id: number;
  monto: number;
  moneda: string;
  folio: string | null;
  orden_id: number | null;
  casillero: string | null;
  cliente: string | null;
  facturada: boolean;
  ligado_a_banco: boolean;
  sin_orden: boolean;
};

type Dia = {
  dia: string;
  pagos: number;
  clientes: number;
  total: number;
  facturadas: number;
  detalle: Pago[];
};

const fmt = (n: number) =>
  `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fechaLarga = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y!, (m || 1) - 1, d || 1).toLocaleDateString('es-MX', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
};

export default function LiquidacionesPaypalTab() {
  const hoy = new Date();
  const haceUnMes = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const [desde, setDesde] = useState(iso(haceUnMes));
  const [hasta, setHasta] = useState(iso(hoy));
  const [dias, setDias] = useState<Dia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get('/accounting/paypal/liquidaciones', { params: { desde, hasta } });
      setDias(Array.isArray(r.data?.dias) ? r.data.dias : []);
    } catch (e: any) {
      setError(e.response?.data?.error || 'No se pudieron cargar los cobros de PayPal');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const totalPeriodo = dias.reduce((n, d) => n + d.total, 0);
  const pagosPeriodo = dias.reduce((n, d) => n + d.pagos, 0);

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        PayPal deposita <strong>un solo monto por varios cobros</strong>. Aquí está de quién es cada peso:
        el día en que se cobró, el cliente y su orden. El depósito llega <strong>neto de la comisión</strong> de
        PayPal, así que el monto del banco no coincide con el total del día.
      </Alert>

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField type="date" label="Desde" size="small" value={desde}
          onChange={e => setDesde(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField type="date" label="Hasta" size="small" value={hasta}
          onChange={e => setHasta(e.target.value)} InputLabelProps={{ shrink: true }} />
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}
          sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d94e1f' } }}>
          Actualizar
        </Button>
        {!loading && (
          <Typography variant="body2" color="text.secondary">
            {pagosPeriodo} cobro{pagosPeriodo === 1 ? '' : 's'} · {fmt(totalPeriodo)} en {dias.length} día{dias.length === 1 ? '' : 's'}
          </Typography>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress sx={{ color: ORANGE }} /></Box>
      ) : dias.length === 0 ? (
        <Alert severity="info">No hay cobros de PayPal en ese rango.</Alert>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead sx={{ bgcolor: BLACK }}>
              <TableRow>
                {['', 'Día', 'Cobros', 'Clientes', 'Total del día', 'Facturadas'].map(h => (
                  <TableCell key={h} sx={{ color: 'white', fontWeight: 700 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {dias.map(d => {
                const open = abierto.has(d.dia);
                return (
                  <Fragment key={d.dia}>
                    <TableRow hover sx={{ cursor: 'pointer' }}
                      onClick={() => setAbierto(prev => {
                        const n = new Set(prev);
                        if (n.has(d.dia)) n.delete(d.dia); else n.add(d.dia);
                        return n;
                      })}>
                      <TableCell sx={{ width: 40 }}>
                        <IconButton size="small">
                          {open ? <KeyboardArrowDownIcon /> : <KeyboardArrowRightIcon />}
                        </IconButton>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{fechaLarga(d.dia)}</TableCell>
                      <TableCell>{d.pagos}</TableCell>
                      <TableCell>{d.clientes}</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#16a34a' }}>{fmt(d.total)}</TableCell>
                      <TableCell>
                        <Chip size="small"
                          label={`${d.facturadas}/${d.pagos}`}
                          color={d.facturadas === d.pagos ? 'success' : 'default'}
                          variant={d.facturadas === d.pagos ? 'filled' : 'outlined'} />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={6} sx={{ py: 0, border: 0 }}>
                        <Collapse in={open} unmountOnExit>
                          <Box sx={{ m: 1, mb: 2 }}>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  {['Casillero', 'Cliente', 'Folio de la orden', 'Monto', 'Factura'].map(h => (
                                    <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>
                                  ))}
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {d.detalle.map(p => (
                                  <TableRow key={p.id}>
                                    <TableCell sx={{ fontFamily: 'monospace' }}>{p.casillero || '—'}</TableCell>
                                    <TableCell>{p.cliente || '—'}</TableCell>
                                    <TableCell sx={{ fontFamily: 'monospace' }}>
                                      {p.folio || (p.sin_orden
                                        ? <Chip size="small" variant="outlined" label="cobro suelto, sin orden" />
                                        : '—')}
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>{fmt(p.monto)}</TableCell>
                                    <TableCell>
                                      {p.facturada
                                        ? <Chip size="small" color="success" label="Facturada" />
                                        : <Chip size="small" variant="outlined" label="Sin facturar" />}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}
