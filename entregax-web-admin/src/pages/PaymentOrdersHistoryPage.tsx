// ============================================================================
// HISTORIAL DE ÓRDENES DE PAGO — SOLO CONSULTA
// ----------------------------------------------------------------------------
// Vista unificada de las órdenes de pago que viven distribuidas en varias
// tablas del backend (PO Box, Marítimo, DHL, TDI Aéreo, TDI Express, X-Pay,
// GEX). Solo lectura: filtra y consulta, no modifica nada.
// ============================================================================
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Paper, Typography, Tabs, Tab, TextField, MenuItem, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Alert, InputAdornment, Stack, IconButton, Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
              Consulta unificada por servicio. Solo lectura — no modifica órdenes existentes.
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
                        <Chip size="small" color={statusColor(r.status)} label={r.status_label} sx={{ fontWeight: 700 }} />
                      </TableCell>
                      <TableCell><Typography variant="caption">{dateFmt(r.paid_at)}</Typography></TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                          {r.source}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        {(r.has_pdf && (r.reference || r.folio)) ? (
                          <Tooltip title="Descargar orden en PDF">
                            <IconButton size="small" sx={{ color: '#C62828' }}
                              onClick={() => window.open(`${API_URL}/api/ctz/${encodeURIComponent(String(r.reference || r.folio))}`, '_blank')}>
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
    </Box>
  );
}
