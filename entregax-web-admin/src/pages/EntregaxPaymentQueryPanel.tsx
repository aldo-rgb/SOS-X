import { useState } from 'react';
import {
  Box, Typography, TextField, Button, Paper, Table, TableHead, TableRow,
  TableCell, TableBody, Chip, CircularProgress, Alert, Divider, Link,
  IconButton, Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ReceiptIcon from '@mui/icons-material/Receipt';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import api from '../services/api';

const ORANGE = '#F05A28';

interface Pago {
  cantidad: string;
  paid: string;
  comprobante_url?: string;
}

interface QueryResult {
  ctz: string;
  pagos: Pago[];
}

interface Props {
  enabled: boolean;
}

export default function EntregaxPaymentQueryPanel({ enabled }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.get(`/national/payment-query/${encodeURIComponent(q)}`);
      if (r.data?.status === 'success') {
        setResult(r.data.data);
      } else {
        setError(r.data?.message || 'Sin respuesta válida');
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.response?.data?.message || 'Error al consultar sistemaentregax.com');
    } finally {
      setLoading(false);
    }
  };

  const totalPagado = result?.pagos.reduce((acc, p) => acc + parseFloat(p.cantidad || '0'), 0) ?? 0;
  const statusInferido = result
    ? result.pagos.length === 0
      ? { label: 'Sin pagos registrados', color: '#F59E0B', bg: '#FEF3C7', icon: '⏳' }
      : { label: 'Con pagos registrados', color: '#047857', bg: '#ECFDF5', icon: '✅' }
    : null;

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>
        💳 Consulta de Pagos — sistemaentregax.com
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Ingresa una cotización (ej. <code>USS6A0767FD06E26</code>) o número de guía para consultar
        los pagos y el historial de movimientos registrados.
      </Typography>

      {!enabled && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Esta integración está desactivada. Actívala desde Configuración → Integraciones Externas.
        </Alert>
      )}

      {/* Buscador */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            fullWidth
            size="small"
            label="Cotización o número de guía"
            placeholder="USS6A0767FD06E26 o US-XXXXXXXX"
            value={query}
            onChange={e => setQuery(e.target.value)}
            disabled={!enabled || loading}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
            onClick={handleSearch}
            disabled={!enabled || loading || !query.trim()}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d44e22' }, minWidth: 120 }}
          >
            {loading ? 'Consultando…' : 'Consultar'}
          </Button>
        </Box>
      </Paper>

      {/* Error */}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Resultado */}
      {result && (
        <Box>
          {/* Header cotización */}
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <ReceiptIcon sx={{ color: ORANGE }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary">Cotización</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography fontWeight={700} fontFamily="monospace">{result.ctz}</Typography>
                <Tooltip title={copied ? '¡Copiado!' : 'Copiar'}>
                  <IconButton size="small" onClick={() => { navigator.clipboard.writeText(result.ctz); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
            {/* Estado inferido */}
            {statusInferido && (
              <Box sx={{ px: 1.5, py: 0.75, borderRadius: 2, bgcolor: statusInferido.bg, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{ fontSize: 16 }}>{statusInferido.icon}</Typography>
                <Typography variant="body2" fontWeight={700} sx={{ color: statusInferido.color }}>
                  {statusInferido.label}
                </Typography>
              </Box>
            )}
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary">Total Pagado</Typography>
              <Typography variant="h6" fontWeight={700} color="success.main">
                ${totalPagado.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
              </Typography>
            </Box>
          </Paper>

          {/* Tabla de pagos */}
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
            Historial de Pagos ({result.pagos.length})
          </Typography>
          {result.pagos.length === 0 ? (
            <Alert severity="info">No hay pagos registrados para esta cotización.</Alert>
          ) : (
            <Paper variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell><strong>#</strong></TableCell>
                    <TableCell><strong>Fecha de Pago</strong></TableCell>
                    <TableCell align="right"><strong>Monto (MXN)</strong></TableCell>
                    <TableCell align="center"><strong>Comprobante</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.pagos.map((p, i) => (
                    <TableRow key={i} hover>
                      <TableCell>
                        <Chip label={i + 1} size="small" sx={{ bgcolor: '#f0f0f0' }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {p.paid ? new Date(p.paid + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography fontWeight={700} color="success.main">
                          ${parseFloat(p.cantidad || '0').toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        {p.comprobante_url ? (
                          <Link href={p.comprobante_url} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ color: ORANGE }}>
                            Ver comprobante
                          </Link>
                        ) : (
                          <Typography variant="caption" color="text.disabled">Sin comprobante</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Divider />
              <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'flex-end', gap: 1, alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">Total:</Typography>
                <Typography fontWeight={700} color="success.main">
                  ${totalPagado.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                </Typography>
              </Box>
            </Paper>
          )}
        </Box>
      )}
    </Box>
  );
}
