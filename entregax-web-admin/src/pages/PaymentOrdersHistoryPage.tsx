// ============================================================================
// HISTORIAL DE ÓRDENES DE PAGO
// ----------------------------------------------------------------------------
// Vista unificada de las órdenes de pago que viven distribuidas en varias
// tablas del backend (PO Box, Marítimo, DHL, TDI Aéreo, TDI Express, X-Pay,
// GEX). Es de consulta, con una sola excepción: en X-Pay se puede marcar una
// orden EN CORRECCIÓN (tarea 874).
//
// Esa marca no cambia la orden: habilita al asesor a arreglar los datos
// bancarios del beneficiario de una orden que el cliente YA pagó, sin tener
// que cancelarla. Vive aquí porque ésta es la pantalla donde servicio a
// cliente ya ve las órdenes X-Pay, que es donde se entera del problema.
// ============================================================================
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Paper, Typography, Tabs, Tab, TextField, MenuItem, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Alert, InputAdornment, Stack, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Divider,
  Snackbar,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ReceiptIcon from '@mui/icons-material/Receipt';
import VerifiedIcon from '@mui/icons-material/Verified';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import EditNoteIcon from '@mui/icons-material/EditNote';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// La columna "Origen" mostraba el nombre interno de la tabla de donde salía la
// orden: "pobox_payments", "advisor_payment_orders", "warranty" y "entangled".
// Lo último era lo grave: ésa es la marca del proveedor de X-Pay y no debe
// circular —esta pantalla la ve servicio a cliente, no solo dirección—. Ahora
// cada origen se nombra como lo nombra la operación, y en X-Pay se dice con
// qué proveedor se operó, que es el dato que sí sirve aquí.
const ORIGEN_LABEL: Record<string, string> = {
  pobox_payments: 'Orden de pago',
  advisor_payment_orders: 'Orden de asesor',
  warranty: 'Garantía',
};
const origenLabel = (r: OrderRow): string => {
  if (r.source === 'entangled') {
    if (r.provider_name) return r.provider_name;
    if (r.provider_inferred) return `${r.provider_inferred} (?)`;
    return 'X-Pay';
  }
  return ORIGEN_LABEL[r.source] || '—';
};

type ServiceKey = 'ALL' | 'POBOX_USA' | 'MARITIMO' | 'AA_DHL' | 'AIR_CHN_MX' | 'TDI_EXPRESS' | 'XPAY' | 'GEX';

interface OrderRow {
  source: 'pobox_payments' | 'advisor_payment_orders' | 'entangled' | 'warranty';
  service: ServiceKey;
  service_label: string;
  id: number;
  folio: string | null;
  reference: string | null;
  client_id: number | null;
  client_name: string | null;
  client_box_id: string | null;
  amount: number;
  currency: string;
  status: string;
  status_label: string;
  created_at: string;
  paid_at: string | null;
  items_count: number;
  has_pdf?: boolean;
  /** Solo X-Pay: el proveedor con el que se operó (dato guardado). */
  provider_name?: string | null;
  /** Solo X-Pay: deducido del porcentaje cobrado, cuando no hay dato guardado. */
  provider_inferred?: string | null;
  /** Solo X-Pay: los tres documentos de la operación (columna Documentos). */
  comprobante_proveedor_url?: string | null;
  factura_url?: string | null;
  comprobante_cliente_url?: string | null;
  /** Solo X-Pay: detalle operativo de la operación (sin cifras de margen). */
  xpay_detail?: Record<string, any>;
}

interface ApiResponse {
  success: boolean;
  filters: { service: ServiceKey; date_from: string; date_to: string; search: string; status: string; limit: number };
  totals: { rows: number; total_mxn: number; total_usd: number };
  summary: Record<string, { count: number; total_mxn: number; total_usd: number }>;
  rows: OrderRow[];
}

const SERVICE_TABS: { key: ServiceKey; label: string; color: string; emoji: string }[] = [
  { key: 'ALL',         label: 'Todos',       color: '#455A64', emoji: '📋' },
  { key: 'GEX',         label: 'GEX',         color: '#00838F', emoji: '🛡️' },
  { key: 'XPAY',        label: 'X-Pay',       color: '#5E35B1', emoji: '💱' },
  { key: 'AIR_CHN_MX',  label: 'TDI Aéreo',   color: '#1565C0', emoji: '✈️' },
  { key: 'TDI_EXPRESS', label: 'TDI Express', color: '#7B1FA2', emoji: '🚀' },
  { key: 'POBOX_USA',   label: 'PO Box',      color: '#BF360C', emoji: '📦' },
  { key: 'AA_DHL',      label: 'DHL',         color: '#F9A825', emoji: '🚚' },
  { key: 'MARITIMO',    label: 'Marítimo',    color: '#00695C', emoji: '🚢' },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all',       label: 'Todos los status' },
  { value: 'paid',      label: 'Pagadas' },
  { value: 'pending',   label: 'Pendientes' },
  { value: 'cancelled', label: 'Canceladas / rechazadas' },
];

const moneyFmt = (v: number, currency = 'MXN') => {
  if (!Number.isFinite(v)) return '—';
  const symbol = currency === 'MXN' ? '$' : (currency === 'USD' ? 'US$' : currency + ' ');
  return `${symbol}${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const dateFmt = (s: string | null | undefined) => {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return String(s); }
};

const dateInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const statusColor = (raw: string): 'default' | 'success' | 'warning' | 'error' | 'info' => {
  const s = raw.toLowerCase();
  if (['paid','pagado','completed','completado','active'].includes(s)) return 'success';
  if (['pending','pendiente','en_proceso','generated','draft'].includes(s)) return 'warning';
  if (['cancelled','cancelado','canceled','expired','expirado','rejected','rechazado','error_envio','refunded'].includes(s)) return 'error';
  return 'default';
};

export default function PaymentOrdersHistoryPage() {
  const token = localStorage.getItem('token') || '';
  const [service, setService] = useState<ServiceKey>('ALL');
  const today = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d;
  }, []);
  const [dateFrom, setDateFrom] = useState(dateInput(defaultFrom));
  const [dateTo, setDateTo] = useState(dateInput(today));
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  // Operación abierta en "Ver detalles". Se dibuja con lo que ya trae la fila,
  // sin pedir nada más al backend.
  const [detalle, setDetalle] = useState<OrderRow | null>(null);
  // Marcar / desmarcar EN CORRECCIÓN (tarea 874). El motivo es obligatorio:
  // es lo único que el asesor va a leer para saber qué arreglar.
  const [marcando, setMarcando] = useState<OrderRow | null>(null);
  const [motivo, setMotivo] = useState('');
  const [guardandoMarca, setGuardandoMarca] = useState(false);
  const [avisoMarca, setAvisoMarca] = useState<{ sev: 'success' | 'error' | 'warning'; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({
        service,
        date_from: dateFrom,
        date_to: dateTo,
        search,
        status,
        limit: '500',
      });
      const res = await fetch(`${API_URL}/api/admin/payment-orders-history?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (!res.ok || !d.success) {
        throw new Error(d?.error || 'No se pudo cargar el historial');
      }
      setData(d as ApiResponse);
    } catch (e: any) {
      setError(e?.message || 'Error de red');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [service, dateFrom, dateTo, search, status, token]);

  useEffect(() => { load(); }, [load]);

  const marcarCorreccion = async () => {
    if (!marcando || !motivo.trim()) return;
    setGuardandoMarca(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/xpay/payment-requests/${marcando.id}/correccion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivo.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'No se pudo marcar');
      setAvisoMarca({
        sev: d.proveedor_ya_pagado ? 'warning' : 'success',
        msg: d.aviso || 'Orden marcada. El asesor ya puede corregir los datos del beneficiario.',
      });
      setMarcando(null); setMotivo(''); setDetalle(null);
      load();
    } catch (e: any) {
      setAvisoMarca({ sev: 'error', msg: e?.message || 'No se pudo marcar' });
    } finally {
      setGuardandoMarca(false);
    }
  };

  const quitarCorreccion = async (r: OrderRow) => {
    setGuardandoMarca(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/xpay/payment-requests/${r.id}/correccion`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'No se pudo quitar la marca');
      setAvisoMarca({ sev: 'success', msg: 'Se quitó la marca de corrección.' });
      setDetalle(null);
      load();
    } catch (e: any) {
      setAvisoMarca({ sev: 'error', msg: e?.message || 'No se pudo quitar la marca' });
    } finally {
      setGuardandoMarca(false);
    }
  };

  const rows = data?.rows || [];

  return (
    <Box>
      {/* Encabezado + filtros */}
      <Paper sx={{ p: 2, borderRadius: 2, mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
          <ReceiptLongIcon sx={{ color: '#F05A28' }} />
          <Box>
            <Typography variant="h6" fontWeight={700}>Historial de Órdenes de Pago</Typography>
            <Typography variant="caption" color="text.secondary">
              Consulta unificada por servicio. Lo único que se cambia desde aquí es marcar una orden X-Pay en corrección.
            </Typography>
          </Box>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ flexWrap: 'wrap' }}>
          <TextField
            label="Desde" type="date" size="small"
            value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 150 }}
          />
          <TextField
            label="Hasta" type="date" size="small"
            value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 150 }}
          />
          <TextField
            select size="small" label="Status" value={status}
            onChange={(e) => setStatus(e.target.value)}
            sx={{ minWidth: 200 }}
          >
            {STATUS_OPTIONS.map((s) => (
              <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small" placeholder="Buscar por folio, referencia, cliente o box"
            value={search} onChange={(e) => setSearch(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18, color: '#888' }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ minWidth: 260, flex: 1 }}
          />
        </Stack>
      </Paper>

      {/* Tabs por servicio */}
      <Paper sx={{ borderRadius: 2, mb: 2 }}>
        <Tabs
          value={service} onChange={(_, v) => setService(v as ServiceKey)}
          variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile
          textColor="primary" indicatorColor="primary"
          sx={{ px: 1 }}
        >
          {SERVICE_TABS.map((t) => {
            const summary = data?.summary?.[t.key];
            const count = summary?.count || (t.key === 'ALL' ? (data?.totals?.rows || 0) : 0);
            return (
              <Tab
                key={t.key}
                value={t.key}
                label={
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <span>{t.emoji}</span>
                    <span>{t.label}</span>
                    {t.key === 'ALL' ? null : (
                      <Chip
                        size="small"
                        label={count}
                        sx={{
                          height: 18, fontSize: 10, fontWeight: 700,
                          bgcolor: t.color, color: '#fff',
                        }}
                      />
                    )}
                  </Stack>
                }
                sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44 }}
              />
            );
          })}
        </Tabs>
      </Paper>

      {/* Resumen del filtro actual */}
      {data && !loading && (
        <Paper sx={{ p: 1.5, borderRadius: 2, mb: 2, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Órdenes en el rango</Typography>
            <Typography variant="h6" fontWeight={800}>{data.totals.rows.toLocaleString('es-MX')}</Typography>
          </Box>
        </Paper>
      )}

      {/* Tabla */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>
        ) : rows.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center', color: '#888' }}>
            Sin órdenes en el rango seleccionado.
          </Box>
        ) : (
          <TableContainer>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#111', color: '#fff', fontWeight: 700 } }}>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Servicio</TableCell>
                  <TableCell>Folio / Referencia</TableCell>
                  <TableCell>Cliente</TableCell>
                  <TableCell align="right">Monto</TableCell>
                  <TableCell align="center">Piezas</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Pagado</TableCell>
                  <TableCell>Origen</TableCell>
                  <TableCell align="center">Accesos</TableCell>
                  <TableCell align="center">PDF</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => {
                  const tab = SERVICE_TABS.find((t) => t.key === r.service);
                  return (
                    <TableRow key={`${r.source}-${r.id}`} hover>
                      <TableCell><Typography variant="caption">{dateFmt(r.created_at)}</Typography></TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={`${tab?.emoji || ''} ${r.service_label}`}
                          sx={{ bgcolor: tab?.color || '#666', color: '#fff', fontWeight: 700, fontSize: 11 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" fontFamily="monospace" fontWeight={700}>
                          {r.folio || r.reference || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{r.client_name || '—'}</Typography>
                        {r.client_box_id && (
                          <Typography variant="caption" color="text.secondary">{r.client_box_id}</Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={700}>
                          {moneyFmt(r.amount, r.currency)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="caption">{r.items_count || '—'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Chip size="small" color={statusColor(r.status)} label={r.status_label} sx={{ fontWeight: 700 }} />
                          {/* La marca no reemplaza al estatus: la orden sigue
                              en la etapa que iba, nomás con los datos del
                              beneficiario abiertos para el asesor. */}
                          {r.xpay_detail?.correccion_abierta && (
                            <Tooltip title={String(r.xpay_detail?.correccion_motivo || 'En corrección')}>
                              <Chip size="small" label="EN CORRECCIÓN"
                                sx={{ fontWeight: 800, fontSize: 10, bgcolor: '#7B1FA2', color: '#fff' }} />
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell><Typography variant="caption">{dateFmt(r.paid_at)}</Typography></TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                          {origenLabel(r)}
                        </Typography>
                      </TableCell>
                      {/* Documentos de la operación. Los mismos accesos que ya
                          tiene el panel de administración: el comprobante del
                          pago al proveedor —que es el que se pide—, la factura
                          y el comprobante que subió el cliente. Antes esta
                          pantalla no los traía y había que ir a pedirlos. */}
                      <TableCell align="center">
                        {(r.xpay_detail || r.comprobante_proveedor_url || r.factura_url || r.comprobante_cliente_url) ? (
                          <Stack direction="row" spacing={0} justifyContent="center">
                            {r.xpay_detail && (
                              <Tooltip title="Ver detalles">
                                <IconButton size="small" color="primary" onClick={() => setDetalle(r)}>
                                  <InfoOutlinedIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {r.comprobante_cliente_url && (
                              <Tooltip title="Comprobante del cliente">
                                <IconButton size="small" component="a"
                                  href={r.comprobante_cliente_url} target="_blank" rel="noopener">
                                  <OpenInNewIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {r.comprobante_proveedor_url && (
                              <Tooltip title="Comprobante de pago al proveedor">
                                <IconButton size="small" color="success" component="a"
                                  href={r.comprobante_proveedor_url} target="_blank" rel="noopener">
                                  <VerifiedIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {r.factura_url && (
                              <Tooltip title="Factura">
                                <IconButton size="small" color="primary" component="a"
                                  href={r.factura_url} target="_blank" rel="noopener">
                                  <ReceiptIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                        ) : <Typography variant="caption" color="text.disabled">—</Typography>}
                      </TableCell>
                      <TableCell align="center">
                        {(r.has_pdf && (r.reference || r.folio)) ? (
                          <Tooltip title="Descargar orden en PDF">
                            <IconButton size="small" sx={{ color: '#C62828' }}
                              onClick={() => window.open(`/orden-de-pago/${encodeURIComponent(String(r.reference || r.folio))}`, '_blank')}>
                              <PictureAsPdfIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : <Typography variant="caption" color="text.disabled">—</Typography>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Ver detalles. Es el detalle OPERATIVO de la operación: quién recibe el
          dinero, en qué banco, en qué etapa va y con qué fechas. No lleva
          porcentajes de costo, comisión de asesor ni utilidad —eso vive en el
          panel de administración, que pide nivel dirección, y esta pantalla la
          abre servicio a cliente—. */}
      <Dialog open={!!detalle} onClose={() => setDetalle(null)} maxWidth="sm" fullWidth>
        {detalle && (() => {
          const d = detalle.xpay_detail || {};
          const carril = d.es_hibrida ? 'Híbrida' : (d.es_pesos ? 'En pesos' : 'Normal');
          const campos: [string, any][] = [
            ['Referencia', detalle.reference],
            ['Cliente', [detalle.client_name, detalle.client_box_id].filter(Boolean).join(' · ')],
            ['Asesor', d.advisor_name],
            ['Monto de la operación', moneyFmt(detalle.amount, detalle.currency)],
            ['Total pagado por el cliente', d.monto_mxn_total != null ? moneyFmt(d.monto_mxn_total, 'MXN') : null],
            ['Tipo de cambio al cliente', d.tc_cliente_final != null ? String(d.tc_cliente_final) : null],
            ['Beneficiario', d.beneficiario_nombre],
            ['Banco del beneficiario', d.beneficiario_banco],
            ['Cuenta / IBAN', d.beneficiario_cuenta],
            ['SWIFT / BIC', d.beneficiario_swift],
            ['Servicio', d.servicio === 'pago_con_factura' ? 'Pago con factura' : (d.servicio === 'pago_sin_factura' ? 'Pago sin factura' : d.servicio)],
            ['Carril', carril],
            ['Razón social a facturar', d.cf_razon_social],
            ['RFC', d.cf_rfc],
            ['Operado con', origenLabel(detalle)],
            ['Creada', dateFmt(detalle.created_at)],
            ['Comprobante del cliente', dateFmt(d.comprobante_subido_at)],
            ['Pagado al proveedor', dateFmt(d.proveedor_pagado_at)],
            ['Factura emitida', dateFmt(d.factura_emitida_at)],
            ['Enviado al proveedor', d.proveedor_monto_enviado != null
              ? `${d.proveedor_monto_enviado} ${d.proveedor_moneda_enviada || ''}`.trim() : null],
            ['Referencia del proveedor', d.referencia_proveedor],
            ['Error', d.error_message],
            ['En corrección desde', d.correccion_abierta ? dateFmt(d.correccion_abierta_at) : null],
            ['Marcada por', d.correccion_abierta ? d.correccion_marcada_por : null],
            ['Qué hay que corregir', d.correccion_abierta ? d.correccion_motivo : null],
            ['Correcciones hechas', Number(d.correccion_numero) > 0 ? String(d.correccion_numero) : null],
          ];
          return (
            <>
              <DialogTitle sx={{ pb: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="h6" fontWeight={800}>{detalle.reference || '—'}</Typography>
                  <Chip size="small" color={statusColor(detalle.status)} label={detalle.status_label} sx={{ fontWeight: 700 }} />
                  {d.estatus_factura && <Chip size="small" variant="outlined" label={`Factura: ${d.estatus_factura}`} />}
                  {d.estatus_proveedor && <Chip size="small" variant="outlined" label={`Proveedor: ${d.estatus_proveedor}`} />}
                  {d.correccion_abierta && (
                    <Chip size="small" label="EN CORRECCIÓN" sx={{ fontWeight: 800, bgcolor: '#7B1FA2', color: '#fff' }} />
                  )}
                </Stack>
              </DialogTitle>
              <DialogContent dividers>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.2 }}>
                  {campos.filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== '—').map(([k, v]) => (
                    <Box key={k}>
                      <Typography variant="caption" color="text.secondary">{k}</Typography>
                      <Typography variant="body2" fontWeight={600} sx={{ wordBreak: 'break-word' }}>{String(v)}</Typography>
                    </Box>
                  ))}
                </Box>
                {(detalle.comprobante_proveedor_url || detalle.factura_url || detalle.comprobante_cliente_url) && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {detalle.comprobante_cliente_url && (
                        <Button size="small" variant="outlined" startIcon={<OpenInNewIcon />}
                          component="a" href={detalle.comprobante_cliente_url} target="_blank" rel="noopener">
                          Comprobante del cliente
                        </Button>
                      )}
                      {detalle.factura_url && (
                        <Button size="small" variant="outlined" startIcon={<ReceiptIcon />}
                          component="a" href={detalle.factura_url} target="_blank" rel="noopener">
                          Factura
                        </Button>
                      )}
                      {detalle.comprobante_proveedor_url && (
                        <Button size="small" variant="outlined" color="success" startIcon={<VerifiedIcon />}
                          component="a" href={detalle.comprobante_proveedor_url} target="_blank" rel="noopener">
                          Comprobante de pago al proveedor
                        </Button>
                      )}
                    </Stack>
                  </>
                )}
              </DialogContent>
              <DialogActions sx={{ justifyContent: 'space-between' }}>
                {/* Marcar en corrección solo tiene sentido en X-Pay y cuando el
                    cliente ya pagó: antes de eso la orden se cancela y se
                    levanta de nuevo, que es más limpio (tarea 874). */}
                <Box>
                  {detalle.source === 'entangled' && (
                    d.correccion_abierta ? (
                      <Button size="small" color="secondary" disabled={guardandoMarca}
                        onClick={() => quitarCorreccion(detalle)}>
                        Quitar la marca de corrección
                      </Button>
                    ) : (d.comprobante_pagado && detalle.status !== 'cancelado') ? (
                      <Button size="small" variant="outlined" startIcon={<EditNoteIcon />}
                        onClick={() => { setMarcando(detalle); setMotivo(''); }}>
                        Marcar en corrección
                      </Button>
                    ) : null
                  )}
                </Box>
                <Button onClick={() => setDetalle(null)}>Cerrar</Button>
              </DialogActions>
            </>
          );
        })()}
      </Dialog>

      {/* Marcar EN CORRECCIÓN. El motivo es obligatorio porque es lo único que
          el asesor va a leer para saber qué dato está mal (tarea 874). */}
      <Dialog open={!!marcando} onClose={() => setMarcando(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Marcar {marcando?.reference || 'la orden'} en corrección</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            El asesor va a poder arreglar los datos del beneficiario —banco, cuenta, SWIFT,
            nombre, direcciones— sin cancelar la orden. Los montos, el tipo de cambio y las
            comisiones no se tocan. Al guardar, el proveedor recibe el aviso con lo que cambió.
          </Typography>
          <TextField
            autoFocus fullWidth multiline minRows={3} size="small"
            label="¿Qué hay que corregir?"
            placeholder="Ej.: el SWIFT no corresponde al banco; el proveedor mandó otra cuenta"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            helperText="Lo lee el asesor en su aviso"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMarcando(null)}>Cancelar</Button>
          <Button variant="contained" disabled={!motivo.trim() || guardandoMarca} onClick={marcarCorreccion}>
            {guardandoMarca ? 'Marcando…' : 'Marcar en corrección'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!avisoMarca} autoHideDuration={8000} onClose={() => setAvisoMarca(null)}>
        <Alert severity={avisoMarca?.sev || 'success'} onClose={() => setAvisoMarca(null)}>
          {avisoMarca?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
