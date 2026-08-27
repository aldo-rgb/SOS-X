/**
 * CONTROL DE CAJA CHICA · MOSTRADOR HIDALGO TX
 *
 * La pantalla anterior leía la caja general de la empresa (`caja_chica_*`), por
 * eso mostraba egresos de millones que no son de esta operación. La caja que
 * corresponde ya existía: la billetera de sucursal asignada a Mostrador
 * Hidalgo TX, la misma de la tesorería de sucursales.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Chip, CircularProgress, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import api from '../services/api';

interface Movimiento {
  id: number;
  tipo: string;
  categoria: string | null;
  monto: number;
  moneda: string;
  concepto: string | null;
  estado: string;
  registrado_por: string | null;
  fecha: string;
}

const money = (n: number, m = 'MXN') =>
  `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${m}`;

const TIPO = (t: string): { label: string; color: 'success' | 'error' | 'info' } =>
  t === 'expense' ? { label: 'EGRESO', color: 'error' }
  : t === 'fund' ? { label: 'FONDEO', color: 'info' }
  : { label: 'INGRESO', color: 'success' };

export default function POBoxCajaHidalgoPage() {
  const [data, setData] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await api.get('/pobox/caja-hidalgo', { params: { limit: 100 } });
      setData(r.data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo cargar la caja');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando && !data) {
    return <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>;
  }
  if (error) {
    return <Paper sx={{ p: 3 }}><Typography color="error">{error}</Typography></Paper>;
  }

  const caja = data?.caja || {};
  const hoy = data?.hoy || { MXN: {}, USD: {} };
  const movs: Movimiento[] = data?.movimientos || [];
  const moneda = caja.moneda || 'MXN';
  // Los totales del día se agregan sobre la moneda de la caja: los movimientos
  // viejos traen el default 'MXN' aunque el dinero sea en dólares.
  const totalHoy = {
    ingresos: (hoy.MXN?.ingresos || 0) + (hoy.USD?.ingresos || 0),
    egresos: (hoy.MXN?.egresos || 0) + (hoy.USD?.egresos || 0),
    movimientos: (hoy.MXN?.movimientos || 0) + (hoy.USD?.movimientos || 0),
  };

  const Tarjeta = ({ titulo, valor, color }: { titulo: string; valor: string; color: string }) => (
    <Paper sx={{ p: 2, bgcolor: color, color: '#fff', flex: '1 1 200px', minWidth: 180 }}>
      <Typography variant="caption" sx={{ opacity: 0.9 }}>{titulo}</Typography>
      <Typography variant="h5" fontWeight={800}>{valor}</Typography>
    </Paper>
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 240 }}>
          <Typography variant="h6" fontWeight={800}>
            <AccountBalanceWalletIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Control de Caja Chica · {caja.sucursal || 'Mostrador Hidalgo TX'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Saldo, movimientos del día y cobros de mostrador
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={cargar}>Actualizar</Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
        {/* La moneda es la de la sucursal: Hidalgo TX opera en dólares. */}
        <Tarjeta titulo={`Saldo en caja (${moneda})`} valor={money(caja.saldo, moneda)} color="#F05A28" />
        <Tarjeta titulo={`Ingresos hoy (${moneda})`} valor={money(totalHoy.ingresos, moneda)} color="#2E7D46" />
        <Tarjeta titulo={`Egresos hoy (${moneda})`} valor={money(totalHoy.egresos, moneda)} color="#C62828" />
        <Tarjeta titulo="Movimientos hoy" valor={String(totalHoy.movimientos)} color="#1565C0" />
      </Box>

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#1A1A1A' }}>
                {['Tipo', 'Monto', 'Concepto', 'Categoría', 'Registrado por', 'Fecha'].map(h => (
                  <TableCell key={h} sx={{ color: '#fff', fontWeight: 700 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {movs.length === 0 ? (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  Sin movimientos en esta caja.
                </TableCell></TableRow>
              ) : movs.map(m => {
                const t = TIPO(m.tipo);
                return (
                  <TableRow key={m.id} hover>
                    <TableCell><Chip label={t.label} size="small" color={t.color} sx={{ fontWeight: 700 }} /></TableCell>
                    <TableCell sx={{ fontWeight: 800, color: m.tipo === 'expense' ? '#C62828' : '#2E7D46' }}>
                      {m.tipo === 'expense' ? '−' : '+'}{money(m.monto, m.moneda)}
                    </TableCell>
                    <TableCell>{m.concepto || '—'}</TableCell>
                    <TableCell>{m.categoria || '—'}</TableCell>
                    <TableCell>{m.registrado_por || '—'}</TableCell>
                    <TableCell>{new Date(m.fecha).toLocaleString('es-MX')}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
