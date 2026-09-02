import { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Table, TableHead, TableBody, TableRow, TableCell,
  TextField, Chip, CircularProgress, Stack, Divider,
} from '@mui/material';
import PercentIcon from '@mui/icons-material/Percent';
import api from '../services/api';

// Mismas etiquetas que el panel de cargos extra: son los mismos servicios.
const SERVICIOS = [
  { key: 'package', label: 'PO Box / Paquete' },
  { key: 'china_receipt', label: 'Aéreo China' },
  { key: 'maritime_order', label: 'Marítimo (Contenedor / FCL)' },
  { key: 'maritime', label: 'Marítimo (LCL)' },
  { key: 'dhl', label: 'DHL Nacional' },
  { key: 'national', label: 'Nacional' },
];
const svcLabel = (k?: string) => SERVICIOS.find(s => s.key === k)?.label || k || '—';
const money = (v?: number) => `$${Number(v || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso?: string) => { try { return iso ? new Date(iso).toLocaleDateString('es-MX') : '—'; } catch { return '—'; } };

interface Descuento {
  id: number; guia_tracking: string; servicio: string; monto: number; moneda: string;
  concepto: string; fecha_registro: string;
  cliente_nombre?: string; box_id?: string; autorizado_nombre?: string;
}
interface PorAutorizador { autorizado_nombre: string; n: number; monto: number }

export default function DescuentosPanel() {
  const [descuentos, setDescuentos] = useState<Descuento[]>([]);
  const [porAutorizador, setPorAutorizador] = useState<PorAutorizador[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cliente, setCliente] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (cliente.trim()) p.set('cliente', cliente.trim());
      if (desde) p.set('desde', desde);
      if (hasta) p.set('hasta', hasta);
      const r = await api.get(`/cs/descuentos${p.toString() ? `?${p}` : ''}`);
      setDescuentos(r.data?.descuentos || []);
      setPorAutorizador(r.data?.por_autorizador || []);
      setTotal(Number(r.data?.total) || 0);
    } catch { /* la tabla queda vacía */ } finally { setLoading(false); }
  }, [cliente, desde, hasta]);

  // Rebote para no consultar en cada tecla del buscador.
  useEffect(() => { const t = setTimeout(() => { cargar(); }, 350); return () => clearTimeout(t); }, [cargar]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <PercentIcon sx={{ color: '#EF4444' }} />
        <Typography variant="h6" fontWeight={800}>Descuentos aplicados</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Dinero que se dejó de cobrar. Los descuentos se aplican guía por guía desde
        Ajustes y Abandonos; aquí se ven todos juntos.
      </Typography>

      {/* El total y quién autoriza son el punto de la pantalla: sin eso es una
          lista más, y lo que hace falta saber es cuánto se deja de cobrar. */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <Paper sx={{ p: 2, flex: 1, borderLeft: '4px solid #EF4444' }}>
          <Typography variant="caption" color="text.secondary">Total descontado</Typography>
          <Typography variant="h4" fontWeight={800} color="#EF4444">{money(total)}</Typography>
          <Typography variant="caption" color="text.secondary">
            {descuentos.length} descuento{descuentos.length === 1 ? '' : 's'} en la vista
          </Typography>
        </Paper>
        <Paper sx={{ p: 2, flex: 2 }}>
          <Typography variant="caption" color="text.secondary">Quién los autoriza (histórico completo)</Typography>
          <Stack spacing={0.5} sx={{ mt: 1 }}>
            {porAutorizador.length === 0 && (
              <Typography variant="body2" color="text.secondary">Sin datos.</Typography>
            )}
            {porAutorizador.map((a) => (
              <Stack key={a.autorizado_nombre} direction="row" justifyContent="space-between">
                <Typography variant="body2">{a.autorizado_nombre}</Typography>
                <Typography variant="body2" fontWeight={700}>
                  {money(a.monto)} <Typography component="span" variant="caption" color="text.secondary">({a.n})</Typography>
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>
      </Stack>

      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <TextField
            size="small" label="Cliente, box o guía" value={cliente}
            onChange={(e) => setCliente(e.target.value)} sx={{ flex: 1 }}
          />
          <TextField
            size="small" type="date" label="Desde" InputLabelProps={{ shrink: true }}
            value={desde} onChange={(e) => setDesde(e.target.value)}
          />
          <TextField
            size="small" type="date" label="Hasta" InputLabelProps={{ shrink: true }}
            value={hasta} onChange={(e) => setHasta(e.target.value)}
          />
        </Stack>
        <Divider sx={{ mb: 1 }} />

        {loading ? (
          <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={26} /></Box>
        ) : descuentos.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            No hay descuentos con estos filtros.
          </Typography>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>FECHA</TableCell>
                  <TableCell>CLIENTE</TableCell>
                  <TableCell>GUÍA</TableCell>
                  <TableCell>SERVICIO</TableCell>
                  <TableCell align="right">MONTO</TableCell>
                  <TableCell>MOTIVO</TableCell>
                  <TableCell>AUTORIZÓ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {descuentos.map((d) => (
                  <TableRow key={d.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(d.fecha_registro)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{d.cliente_nombre || '—'}</Typography>
                      {d.box_id && <Typography variant="caption" color="text.secondary">{d.box_id}</Typography>}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 13 }}>{d.guia_tracking || '—'}</TableCell>
                    <TableCell><Chip size="small" variant="outlined" label={svcLabel(d.servicio)} /></TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#EF4444', whiteSpace: 'nowrap' }}>
                      −{money(d.monto)}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography variant="body2" color="text.secondary">{d.concepto || '—'}</Typography>
                    </TableCell>
                    <TableCell>{d.autorizado_nombre || 'Sin registrar'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
