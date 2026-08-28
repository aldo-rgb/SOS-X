/**
 * CORTE DE COMISIONES (viernes → jueves)
 *
 * Antes el pago semanal se armaba a mano: sacar el reporte, sumar por asesor,
 * calcular cuánto dispersa cada líder a sus subs y luego marcar comisión por
 * comisión como pagada. Aquí se ve el corte completo antes de aceptarlo, se
 * descarga el Excel para el pago y al aceptar quedan liquidadas y cada asesor
 * notificado con su detalle.
 */
import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, Button,
  Table, TableBody, TableCell, TableHead, TableRow, Chip, CircularProgress,
  TextField, Divider, Alert, IconButton, Collapse,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';

const ORANGE = '#F05A28';
const mx = (n: number) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (iso: string) => {
  const [a, m, d] = String(iso || '').split('-').map(Number);
  if (!a || !m || !d) return iso;
  const M = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d} ${M[m - 1]} ${a}`;
};

interface Linea {
  advisorId: number; advisorName: string;
  own: number; override: number; total: number; guides: number;
  subs: Array<{ subId: number; name: string; monto: number; guias: number }>;
  detalle: any[];
}

export default function CorteComisionesDialog({ open, onClose, onDone }: {
  open: boolean; onClose: () => void; onDone?: (r: any) => void;
}) {
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const H = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const cargar = async (f?: string, t?: string) => {
    setCargando(true); setError(null);
    try {
      const q = f && t ? `?from=${f}&to=${t}` : '';
      const r = await axios.get(`${API_URL}/admin/commissions/cut/preview${q}`, H());
      setLineas(r.data.lineas || []);
      setTotal(r.data.total || 0);
      setDesde(r.data.from); setHasta(r.data.to);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo calcular el corte');
    } finally { setCargando(false); }
  };

  useEffect(() => { if (open) { setConfirmando(false); cargar(); } }, [open]);

  const descargar = async () => {
    try {
      const r = await axios.get(`${API_URL}/admin/commissions/cut/preview/excel?from=${desde}&to=${hasta}`,
        { ...H(), responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `corte-comisiones-${desde}-a-${hasta}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
    } catch { setError('No se pudo descargar el Excel'); }
  };

  const aceptar = async () => {
    setGuardando(true); setError(null);
    try {
      const r = await axios.post(`${API_URL}/admin/commissions/cut`, { from: desde, to: hasta }, H());
      onDone?.(r.data);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo cerrar el corte');
    } finally { setGuardando(false); }
  };

  return (
    <Dialog open={open} onClose={guardando ? undefined : onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ bgcolor: ORANGE, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography fontWeight={800} fontSize={19}>💰 Corte de comisiones</Typography>
          <Typography fontSize={12.5} sx={{ opacity: 0.9 }}>
            {desde && hasta ? `Viernes ${fecha(desde)} a jueves ${fecha(hasta)}` : 'Calculando el periodo…'}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography fontSize={11.5} sx={{ opacity: 0.9 }}>Total a pagar</Typography>
          <Typography fontWeight={800} fontSize={22}>{mx(total)}</Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* Se puede correr un periodo distinto sin salir del modal. */}
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
          <TextField size="small" label="Desde (viernes)" type="date" value={desde}
            onChange={e => setDesde(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" label="Hasta (jueves)" type="date" value={hasta}
            onChange={e => setHasta(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <Button size="small" variant="outlined" onClick={() => cargar(desde, hasta)} disabled={cargando}>
            Recalcular
          </Button>
          <Box sx={{ flex: 1 }} />
          <Chip label={`${lineas.length} asesores`} size="small" />
        </Box>

        {!!error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Alert severity="info" sx={{ mb: 2 }}>
          Solo entra lo <b>cobrable</b>: comisiones con su orden de pago ya liquidada. Lo que está
          en crédito —el cliente pagó con su línea y aún no abona— no se incluye y entrará en el
          corte de la semana en que abone. Al aceptar, estas comisiones quedan marcadas como
          pagadas y cada asesor recibe su notificación con el detalle.
        </Alert>

        {cargando ? (
          <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress sx={{ color: ORANGE }} /></Box>
        ) : lineas.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 5, textAlign: 'center' }}>
            No hay comisiones cobrables en este periodo.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#212121' }}>
                <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Asesor</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 700 }} align="right">Guías</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 700 }} align="right">Propia</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 700 }} align="right">Override subs</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 700 }} align="right">A pagar</TableCell>
                <TableCell sx={{ color: '#fff' }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {lineas.map(l => (
                <>
                  <TableRow key={l.advisorId} hover>
                    <TableCell sx={{ fontWeight: 700 }}>{l.advisorName}</TableCell>
                    <TableCell align="right">{l.guides}</TableCell>
                    <TableCell align="right">{mx(l.own)}</TableCell>
                    <TableCell align="right" sx={{ color: l.override > 0 ? '#5E35B1' : 'text.disabled' }}>
                      {l.override > 0 ? mx(l.override) : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, color: ORANGE }}>{mx(l.total)}</TableCell>
                    <TableCell align="right" sx={{ width: 40 }}>
                      <IconButton size="small" onClick={() => setAbierta(abierta === l.advisorId ? null : l.advisorId)}>
                        <ExpandMoreIcon sx={{ fontSize: 18, transform: abierta === l.advisorId ? 'rotate(180deg)' : 'none' }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                  <TableRow key={`d-${l.advisorId}`}>
                    <TableCell colSpan={6} sx={{ p: 0, border: 0 }}>
                      <Collapse in={abierta === l.advisorId} unmountOnExit>
                        <Box sx={{ p: 2, bgcolor: '#FAFAFA' }}>
                          {l.subs.length > 0 && (
                            <>
                              <Typography fontWeight={800} fontSize={12.5} sx={{ mb: 0.5 }}>
                                Lo que {l.advisorName} debe dispersar a sus subasesores
                              </Typography>
                              {l.subs.map(s => (
                                <Typography key={s.subId} fontSize={12.5} color="text.secondary">
                                  · {s.name} — {s.guias} guías — <b>{mx(s.monto)}</b>
                                </Typography>
                              ))}
                              <Divider sx={{ my: 1.5 }} />
                            </>
                          )}
                          <Typography fontWeight={800} fontSize={12.5} sx={{ mb: 0.5 }}>
                            Detalle ({l.detalle.length} líneas)
                          </Typography>
                          <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
                            {l.detalle.slice(0, 60).map((d: any, i: number) => (
                              <Typography key={i} fontSize={11.5} color="text.secondary" noWrap>
                                {d.tracking} · {d.clienteBox || d.cliente} · {mx(d.comision)}
                                {d.tipo === 'override' ? ` (override de ${d.subAsesor})` : ''}
                              </Typography>
                            ))}
                            {l.detalle.length > 60 && (
                              <Typography fontSize={11.5} color="text.disabled">
                                …y {l.detalle.length - 60} más. El Excel las trae todas.
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={descargar}
          disabled={cargando || lineas.length === 0}>
          Descargar Excel
        </Button>
        {confirmando ? (
          <Button variant="contained" color="success" startIcon={<CheckCircleIcon />}
            onClick={aceptar} disabled={guardando}>
            {guardando ? 'Cerrando…' : `Sí, marcar ${mx(total)} como pagado`}
          </Button>
        ) : (
          <Button variant="contained" startIcon={<CheckCircleIcon />}
            onClick={() => setConfirmando(true)} disabled={cargando || lineas.length === 0}
            sx={{ bgcolor: '#2E7D46', '&:hover': { bgcolor: '#256238' } }}>
            Aceptar y marcar como pagado
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
