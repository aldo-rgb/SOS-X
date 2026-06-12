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

interface Movimiento {
  guia: string;
  estado: string;
  fecha: string;
}

type DireccionWaybill = {
  quienrecibe?: string;
  calle?: string;
  numeroext?: string;
  colonia?: string;
  cp?: string;
  estado?: string;
  pais?: string;
};

interface Waybill {
  guia_ingreso?: string;
  guia_unica?: string;
  guia_salida?: string;
  guia_usa?: string;
  paqueteria?: string;
  cliente?: string;
  estado?: string;
  // EntregaX puede devolver la dirección bajo "direccion_entrega" o bajo "instrucciones"
  direccion_entrega?: DireccionWaybill;
  instrucciones?: DireccionWaybill;
}

interface Guia {
  guia: string;
  guia_unica: string;
  guia_usa?: string;
}

interface QueryResult {
  ctz: string;
  guias: Guia[];
  pagos: Pago[];
  historial: Movimiento[];
  waybill: Waybill | null;
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

  const instruccionesStatus = result
    ? result.waybill?.direccion_entrega
      ? { label: 'Con instrucciones de envío', color: '#1565C0', bg: '#E3F2FD', icon: '📋' }
      : result.waybill
        ? { label: 'Instrucciones sin dirección', color: '#E65100', bg: '#FFF3E0', icon: '📋' }
        : { label: 'Sin instrucciones', color: '#9E9E9E', bg: '#F5F5F5', icon: '📋' }
    : null;

  const enviado = result?.waybill?.guia_salida
    ? { label: `Enviado · ${result.waybill.guia_salida}`, color: '#2E7D32', bg: '#E8F5E9', icon: '🚚' }
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
            {/* Badges de estado */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {statusInferido && (
                <Box sx={{ px: 1.5, py: 0.5, borderRadius: 2, bgcolor: statusInferido.bg, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Typography sx={{ fontSize: 14 }}>{statusInferido.icon}</Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ color: statusInferido.color }}>
                    {statusInferido.label}
                  </Typography>
                </Box>
              )}
              {instruccionesStatus && (
                <Box sx={{ px: 1.5, py: 0.5, borderRadius: 2, bgcolor: instruccionesStatus.bg, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Typography sx={{ fontSize: 14 }}>{instruccionesStatus.icon}</Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ color: instruccionesStatus.color }}>
                    {instruccionesStatus.label}
                  </Typography>
                </Box>
              )}
              {enviado && (
                <Box sx={{ px: 1.5, py: 0.5, borderRadius: 2, bgcolor: enviado.bg, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Typography sx={{ fontSize: 14 }}>{enviado.icon}</Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ color: enviado.color }}>
                    {enviado.label}
                  </Typography>
                  <Tooltip title="Copiar guía">
                    <IconButton size="small" onClick={() => navigator.clipboard.writeText(result!.waybill!.guia_salida!)}>
                      <ContentCopyIcon sx={{ fontSize: 13 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary">Total Pagado</Typography>
              <Typography variant="h6" fontWeight={700} color="success.main">
                ${totalPagado.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
              </Typography>
            </Box>
          </Paper>

          {/* Guías asociadas */}
          {result.guias && result.guias.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                Guías EntregaX ({result.guias.length})
              </Typography>
              <Paper variant="outlined" sx={{ borderRadius: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell><strong>Guía Única</strong></TableCell>
                      <TableCell><strong>Guía USA (Carrier)</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.guias.map((g, i) => (
                      <TableRow key={i} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography fontFamily="monospace" fontSize="0.8rem">{g.guia_unica}</Typography>
                            <Tooltip title="Copiar">
                              <IconButton size="small" onClick={() => navigator.clipboard.writeText(g.guia_unica)}>
                                <ContentCopyIcon sx={{ fontSize: 13 }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography fontFamily="monospace" fontSize="0.8rem" color="text.secondary">
                            {g.guia_usa || '—'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </Box>
          )}

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

          {/* Historial de movimientos */}
          {result.historial && result.historial.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                Historial de Movimientos ({result.historial.length})
              </Typography>
              <Paper variant="outlined" sx={{ borderRadius: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.900' }}>
                      <TableCell sx={{ color: '#fff' }}><strong>#</strong></TableCell>
                      <TableCell sx={{ color: '#fff' }}><strong>Estado</strong></TableCell>
                      <TableCell sx={{ color: '#fff' }}><strong>Fecha</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.historial.map((m, i) => (
                      <TableRow key={i} hover>
                        <TableCell>
                          <Chip label={i + 1} size="small" sx={{ bgcolor: '#f0f0f0' }} />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={m.estado}
                            size="small"
                            sx={{
                              bgcolor: i === result.historial.length - 1 ? '#E8F5E9' : '#F3F4F6',
                              color: i === result.historial.length - 1 ? '#2E7D32' : '#374151',
                              fontWeight: i === result.historial.length - 1 ? 700 : 400,
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {m.fecha ? new Date(m.fecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </Box>
          )}
          {/* Instrucciones de envío / waybill */}
          {result.waybill && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                📋 Instrucciones de Envío
              </Typography>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 1.5 }}>
                  {result.waybill.estado && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Estado actual</Typography>
                      <Typography fontWeight={700}>{result.waybill.estado}</Typography>
                    </Box>
                  )}
                  {result.waybill.cliente && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Cliente</Typography>
                      <Typography fontWeight={700}>{result.waybill.cliente}</Typography>
                    </Box>
                  )}
                  {result.waybill.paqueteria && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Paquetería</Typography>
                      <Typography fontWeight={700}>{result.waybill.paqueteria}</Typography>
                    </Box>
                  )}
                  {result.waybill.guia_salida && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Guía de salida</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography fontWeight={700} fontFamily="monospace">{result.waybill.guia_salida}</Typography>
                        <Tooltip title="Copiar">
                          <IconButton size="small" onClick={() => navigator.clipboard.writeText(result.waybill!.guia_salida!)}>
                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  )}
                  {(result.waybill.guia_usa || result.waybill.guia_ingreso) && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Guía USA</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography fontWeight={700} fontFamily="monospace">
                          {result.waybill.guia_usa || result.waybill.guia_ingreso}
                        </Typography>
                        <Tooltip title="Copiar">
                          <IconButton size="small" onClick={() => navigator.clipboard.writeText(result.waybill!.guia_usa || result.waybill!.guia_ingreso || '')}>
                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  )}
                  {result.waybill.direccion_entrega && (() => {
                    const d = result.waybill!.direccion_entrega!;
                    return (
                      <>
                        {d.quienrecibe && (
                          <Box>
                            <Typography variant="caption" color="text.secondary">Quien recibe</Typography>
                            <Typography fontWeight={700}>{d.quienrecibe}</Typography>
                          </Box>
                        )}
                        <Box sx={{ gridColumn: '1 / -1' }}>
                          <Typography variant="caption" color="text.secondary">Dirección de entrega</Typography>
                          <Typography fontWeight={600}>
                            {[d.calle, d.numeroext].filter(Boolean).join(' ')}
                            {d.colonia ? `, Col. ${d.colonia}` : ''}
                            {d.cp ? `, C.P. ${d.cp}` : ''}
                            {d.estado ? `, ${d.estado}` : ''}
                            {d.pais ? `, ${d.pais}` : ''}
                          </Typography>
                        </Box>
                      </>
                    );
                  })()}
                </Box>
              </Paper>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
