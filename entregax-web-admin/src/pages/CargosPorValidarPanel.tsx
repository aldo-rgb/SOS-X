import { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Table, TableHead, TableBody, TableRow, TableCell,
  Button, Chip, CircularProgress, Stack, Alert, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Snackbar,
} from '@mui/material';
import GavelIcon from '@mui/icons-material/Gavel';
import api from '../services/api';

/**
 * Cargos de impuestos DHL esperando validación (tarea 482).
 *
 * No todo lo que cobra DHL le corresponde al cliente: una guía declarada en $50
 * USD o menos NO lleva impuesto adicional, solo el default que ya venía en la
 * orden. Antes el sistema se lo subía completo sin que nadie lo revisara. Ahora
 * el cargo espera aquí y no toca ningún saldo hasta que se acepta.
 */

interface Cargo {
  id: number;
  guia_tracking: string;
  monto: number;
  moneda: string;
  concepto: string;
  fecha_registro: string;
  cliente_nombre?: string;
  cliente_box?: string;
  import_cost_usd?: number;
  import_tax_mxn?: number;
  exchange_rate?: number;
}

const money = (v?: number) =>
  `$${Number(v || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso?: string) => { try { return iso ? new Date(iso).toLocaleDateString('es-MX') : '—'; } catch { return '—'; } };

export default function CargosPorValidarPanel() {
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState<number | null>(null);
  const [rechazo, setRechazo] = useState<Cargo | null>(null);
  const [motivo, setMotivo] = useState('');
  const [aviso, setAviso] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/cs/cargos-por-validar');
      setCargos(r.data?.cargos || []);
    } catch { setCargos([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const aceptar = async (c: Cargo) => {
    setProcesando(c.id);
    try {
      const r = await api.post(`/cs/cargos-por-validar/${c.id}/aceptar`);
      setAviso({ msg: `Cargo aceptado. Se generó el cobro ${r.data?.reference || ''} por ${money(c.monto)}.`, sev: 'success' });
      cargar();
    } catch (e: any) {
      setAviso({ msg: e?.response?.data?.error || 'No se pudo aceptar el cargo', sev: 'error' });
    } finally { setProcesando(null); }
  };

  const confirmarRechazo = async () => {
    if (!rechazo || !motivo.trim()) return;
    setProcesando(rechazo.id);
    try {
      await api.post(`/cs/cargos-por-validar/${rechazo.id}/rechazar`, { motivo: motivo.trim() });
      setAviso({ msg: `Cargo rechazado. No se le cobrará al cliente.`, sev: 'success' });
      setRechazo(null); setMotivo(''); cargar();
    } catch (e: any) {
      setAviso({ msg: e?.response?.data?.error || 'No se pudo rechazar el cargo', sev: 'error' });
    } finally { setProcesando(null); }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <GavelIcon sx={{ color: '#F05A28' }} />
        <Typography variant="h6" fontWeight={800}>Cargos de impuestos DHL por validar</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Estos cargos los generó el sistema al llegar la nota de DHL y
        <strong> todavía no se le cobran a nadie</strong>. Se cobran sólo al aceptarlos.
      </Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        Antes de aceptar, revisa el <strong>valor declarado</strong> de la guía en la documentación
        de DHL: si es de <strong>50 USD o menos</strong>, no aplica el impuesto adicional — sólo el
        cargo base, que ya venía en la orden de pago. En ese caso, rechaza.
      </Alert>

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={26} /></Box>
      ) : cargos.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            No hay cargos esperando validación.
          </Typography>
        </Paper>
      ) : (
        <Paper sx={{ p: 2 }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>FECHA</TableCell>
                  <TableCell>CLIENTE</TableCell>
                  <TableCell>GUÍA</TableCell>
                  <TableCell align="right">A COBRAR</TableCell>
                  <TableCell>DE DÓNDE SALE</TableCell>
                  <TableCell align="center">VALIDACIÓN</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cargos.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(c.fecha_registro)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{c.cliente_nombre || '—'}</Typography>
                      {c.cliente_box && <Typography variant="caption" color="text.secondary">{c.cliente_box}</Typography>}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 13 }}>{c.guia_tracking}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#C2410C', whiteSpace: 'nowrap' }}>
                      {money(c.monto)}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 320 }}>
                      <Typography variant="caption" color="text.secondary">{c.concepto}</Typography>
                      {Number(c.import_cost_usd) > 0 && (
                        <Chip
                          size="small" variant="outlined" sx={{ ml: 0.5 }}
                          label={`servicio ${Number(c.import_cost_usd).toFixed(2)} USD`}
                        />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={1} justifyContent="center">
                        <Button
                          size="small" variant="contained" color="success"
                          disabled={procesando === c.id}
                          onClick={() => aceptar(c)}
                        >
                          Aceptar
                        </Button>
                        <Button
                          size="small" variant="outlined" color="error"
                          disabled={procesando === c.id}
                          onClick={() => { setRechazo(c); setMotivo(''); }}
                        >
                          Rechazar
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Paper>
      )}

      <Dialog open={!!rechazo} onClose={() => setRechazo(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Rechazar el cargo</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            No se le cobrará nada a {rechazo?.cliente_nombre || 'el cliente'} por la guía{' '}
            <strong>{rechazo?.guia_tracking}</strong> ({money(rechazo?.monto)}).
          </Typography>
          {/* El motivo es obligatorio: sin el, en un mes nadie sabe por que no
              se cobro y la duda regresa como ticket. */}
          <TextField
            autoFocus fullWidth multiline minRows={2} label="Motivo del rechazo"
            placeholder="Ej.: valor declarado menor a 50 USD, no aplica impuesto adicional"
            value={motivo} onChange={(e) => setMotivo(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRechazo(null)}>Cancelar</Button>
          <Button
            variant="contained" color="error"
            disabled={!motivo.trim() || procesando === rechazo?.id}
            onClick={confirmarRechazo}
          >
            Rechazar cargo
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!aviso} autoHideDuration={6000} onClose={() => setAviso(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={aviso?.sev || 'success'} onClose={() => setAviso(null)}>
          {aviso?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
