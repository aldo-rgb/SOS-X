// ============================================
// ADMIN: GESTIÓN DE COMISIONES DE ASESORES
// Permite ver todas las comisiones generadas,
// filtrar, y marcar como pagadas.
// ============================================

import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Chip, Button, CircularProgress,
  TextField, FormControl, InputLabel, Select, MenuItem, Alert, Snackbar,
  Checkbox, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  Card, CardContent, Avatar,
} from '@mui/material';
import {
  AttachMoney as MoneyIcon,
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as PendingIcon,
  Refresh as RefreshIcon,
  Payment as PaymentIcon,
} from '@mui/icons-material';
import api from '../services/api';

const ORANGE = '#F05A28';

const formatMXN = (amount: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const serviceLabels: Record<string, string> = {
  'pobox_usa_mx': '📦 PO Box USA',
  'aereo_china_mx': '✈️ Aéreo China',
  'maritimo_china_mx': '🚢 Marítimo',
  'nacional_mx': '🚚 Nacional',
  'liberacion_aa_dhl': '📮 DHL',
  'gex_warranty': '🛡️ GEX',
  'xpay': '💱 X-Pay',
};

interface CommissionRecord {
  id: number;
  advisorId: number;
  advisorName: string;
  leaderId: number | null;
  leaderName: string | null;
  shipmentType: string;
  serviceType: string;
  tracking: string;
  clientId: number;
  clientName: string;
  clientBox: string | null;
  paymentAmount: number;
  commissionRate: number;
  commissionAmount: number;
  leaderOverridePct: number;
  leaderOverrideAmount: number;
  gexCommission: number;
  status: string;
  awaitingClientPayment: boolean;
  clientCollectedAmount: number;
  clientPaidAt: string | null;
  paidAt: string | null;
  createdAt: string;
  paymentOrder: string | null;
  paymentOrderStatus: string | null;
}

interface Summary {
  totalCount: number;
  totalCommission: number;
  pendingTotal: number;
  paidTotal: number;
  creditHoldTotal: number;
  totalLeaderOverride: number;
  advisorCount: number;
}

export default function AdvisorCommissionsLedgerPage() {
  // ─── State ───
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [paying, setPaying] = useState(false);
  const [payNotes, setPayNotes] = useState('');
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  // Vista: detalle (una fila por guía) o agrupada por Orden de Pago (compacta).
  const [groupByOrder, setGroupByOrder] = useState(false);

  // Lista de asesores para el filtro
  const [advisorsList, setAdvisorsList] = useState<{ id: number; full_name: string }[]>([]);

  // Filters
  const [filterAdvisor, setFilterAdvisor] = useState('');
  const [filterService, setFilterService] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterClientBox, setFilterClientBox] = useState('');
  const [filterTracking, setFilterTracking] = useState('');

  // ─── Fetch data ───
  const fetchLedger = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page + 1), limit: String(rowsPerPage) };
      if (filterAdvisor) params.advisor_id = filterAdvisor;
      if (filterService) params.service_type = filterService;
      if (filterStatus) params.status = filterStatus;
      if (filterFrom) params.from_date = filterFrom;
      if (filterTo) params.to_date = filterTo;
      if (filterClientBox) params.client_box = filterClientBox.trim();
      if (filterTracking) params.tracking = filterTracking.trim();

      const res = await api.get('/admin/commissions/ledger', { params });
      setRecords(res.data.data);
      setSummary(res.data.summary);
      setTotal(res.data.total);
    } catch (err) {
      console.error('Error fetching commission ledger:', err);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, filterAdvisor, filterService, filterStatus, filterFrom, filterTo, filterClientBox, filterTracking]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  // Cargar lista de asesores (una vez) para el filtro
  useEffect(() => {
    api.get('/admin/advisors', { params: { only_active_with_clients: 'true' } })
      .then(res => setAdvisorsList(Array.isArray(res.data) ? res.data : []))
      .catch(() => setAdvisorsList([]));
  }, []);

  // ─── Actions ───
  const handleMarkAsPaid = async () => {
    if (selectedIds.length === 0) return;
    setPaying(true);
    try {
      const res = await api.post('/admin/commissions/pay', {
        commission_ids: selectedIds,
        notes: payNotes || undefined,
      });
      setSnackbar({
        open: true,
        message: `✅ ${res.data.paidCount} comisiones pagadas por ${formatMXN(res.data.totalPaid)}`,
        severity: 'success',
      });
      setSelectedIds([]);
      setPayNotes('');
      setPayDialogOpen(false);
      fetchLedger();
    } catch {
      setSnackbar({ open: true, message: 'Error al marcar comisiones', severity: 'error' });
    } finally {
      setPaying(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const pendingIds = records.filter(r => r.status === 'pending' && !r.awaitingClientPayment).map(r => r.id);
    if (selectedIds.length === pendingIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pendingIds);
    }
  };

  const selectedTotal = records
    .filter(r => selectedIds.includes(r.id))
    .reduce((sum, r) => sum + r.commissionAmount, 0);

  // Agrupado por Orden de Pago: una fila por orden, con las guías compactadas.
  // Las comisiones sin orden quedan como fila individual (clave única por id).
  const groupedRows = (() => {
    const groups = new Map<string, CommissionRecord[]>();
    for (const r of records) {
      const key = r.paymentOrder || `__single_${r.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    return Array.from(groups.entries()).map(([key, recs]) => {
      const first = recs[0];
      const services = new Set(recs.map(r => r.serviceType));
      const rates = new Set(recs.map(r => (r.gexCommission > 0 ? 'Fijo' : `${r.commissionRate}%`)));
      const paidCount = recs.filter(r => r.status === 'paid').length;
      const awaitingCount = recs.filter(r => r.awaitingClientPayment).length;
      const pendingIds = recs.filter(r => r.status === 'pending' && !r.awaitingClientPayment).map(r => r.id);
      const status = paidCount === recs.length ? 'paid'
        : paidCount > 0 ? 'partial'
        : (awaitingCount > 0 && awaitingCount + paidCount === recs.length) ? 'awaiting'
        : 'pending';
      return {
        key,
        paymentOrder: first.paymentOrder,
        paymentOrderStatus: first.paymentOrderStatus,
        advisorName: first.advisorName,
        clientBox: first.clientBox,
        serviceType: services.size === 1 ? first.serviceType : '',
        createdAt: recs.map(r => r.createdAt).sort().slice(-1)[0] || first.createdAt,
        count: recs.length,
        trackings: recs.map(r => r.tracking).filter(Boolean),
        montoBase: recs.reduce((s, r) => s + r.paymentAmount, 0),
        comision: recs.reduce((s, r) => s + r.commissionAmount, 0),
        rateLabel: rates.size === 1 ? [...rates][0] : 'Varias',
        status,
        pendingIds,
      };
    });
  })();

  const toggleSelectMany = (ids: number[], check: boolean) => {
    setSelectedIds(prev => check ? Array.from(new Set([...prev, ...ids])) : prev.filter(id => !ids.includes(id)));
  };

  // ─── Render ───
  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => fetchLedger()}
          size="small"
        >
          Actualizar
        </Button>
      </Box>

      {/* Summary KPIs */}
      {summary && (
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <Card sx={{ flex: 1, minWidth: 180 }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Avatar sx={{ bgcolor: '#fff3e0', color: ORANGE }}><PendingIcon /></Avatar>
              <Box>
                <Typography variant="caption" color="text.secondary">Pendiente</Typography>
                <Typography variant="h6" fontWeight={700} color="warning.main">{formatMXN(summary.pendingTotal)}</Typography>
              </Box>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1, minWidth: 180 }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Avatar sx={{ bgcolor: '#e8f5e9', color: '#4caf50' }}><CheckCircleIcon /></Avatar>
              <Box>
                <Typography variant="caption" color="text.secondary">Pagado</Typography>
                <Typography variant="h6" fontWeight={700} color="success.main">{formatMXN(summary.paidTotal)}</Typography>
              </Box>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1, minWidth: 180 }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Avatar sx={{ bgcolor: '#eceff1', color: '#607d8b' }}><PendingIcon /></Avatar>
              <Box>
                <Tooltip title="Comisiones de órdenes pagadas con crédito. Se liberan (pasan a Pendiente) conforme el cliente abona su línea de crédito.">
                  <Typography variant="caption" color="text.secondary">En crédito (por cobrar)</Typography>
                </Tooltip>
                <Typography variant="h6" fontWeight={700} sx={{ color: '#607d8b' }}>{formatMXN(summary.creditHoldTotal ?? 0)}</Typography>
              </Box>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1, minWidth: 180 }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Avatar sx={{ bgcolor: '#e3f2fd', color: '#2196f3' }}><MoneyIcon /></Avatar>
              <Box>
                <Typography variant="caption" color="text.secondary">Total</Typography>
                <Typography variant="h6" fontWeight={700} color="info.main">{formatMXN(summary.totalCommission)}</Typography>
              </Box>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1, minWidth: 180 }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Avatar sx={{ bgcolor: '#f3e5f5', color: '#9c27b0' }}><MoneyIcon /></Avatar>
              <Box>
                <Typography variant="caption" color="text.secondary">Asesores</Typography>
                <Typography variant="h6" fontWeight={700}>{summary.advisorCount}</Typography>
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* ═══ DETALLE DE COMISIONES ═══ */}
      <>
          {/* Filters */}
          <Paper sx={{ p: 2, mb: 2, borderRadius: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Asesor</InputLabel>
              <Select value={filterAdvisor} label="Asesor" onChange={e => { setFilterAdvisor(e.target.value); setPage(0); }}>
                <MenuItem value="">Todos</MenuItem>
                {advisorsList.map(a => (
                  <MenuItem key={a.id} value={String(a.id)}>{a.full_name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Servicio</InputLabel>
              <Select value={filterService} label="Servicio" onChange={e => { setFilterService(e.target.value); setPage(0); }}>
                <MenuItem value="">Todos</MenuItem>
                {Object.entries(serviceLabels).map(([k, v]) => (
                  <MenuItem key={k} value={k}>{v}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Estado</InputLabel>
              <Select value={filterStatus} label="Estado" onChange={e => { setFilterStatus(e.target.value); setPage(0); }}>
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="pending">Pendiente</MenuItem>
                <MenuItem value="paid">Pagado</MenuItem>
              </Select>
            </FormControl>
            <TextField size="small" label="N° Cliente" placeholder="Ej. S889" value={filterClientBox}
              onChange={e => { setFilterClientBox(e.target.value); setPage(0); }}
              sx={{ width: 130 }} />
            <TextField size="small" label="Tracking" placeholder="Ej. US-9122945797" value={filterTracking}
              onChange={e => { setFilterTracking(e.target.value); setPage(0); }}
              sx={{ width: 170 }} />
            <TextField size="small" label="Desde" type="date" value={filterFrom}
              onChange={e => { setFilterFrom(e.target.value); setPage(0); }}
              slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 150 }} />
            <TextField size="small" label="Hasta" type="date" value={filterTo}
              onChange={e => { setFilterTo(e.target.value); setPage(0); }}
              slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 150 }} />
            <Button size="small" onClick={() => { setFilterAdvisor(''); setFilterService(''); setFilterStatus(''); setFilterFrom(''); setFilterTo(''); setFilterClientBox(''); setFilterTracking(''); setPage(0); }}>
              Limpiar
            </Button>
          </Paper>

          {/* Batch pay bar */}
          {selectedIds.length > 0 && (
            <Paper sx={{ p: 1.5, mb: 2, borderRadius: 2, bgcolor: '#fff3e0', display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body2" fontWeight={600}>
                {selectedIds.length} seleccionadas · {formatMXN(selectedTotal)}
              </Typography>
              <Button
                variant="contained"
                size="small"
                startIcon={<PaymentIcon />}
                onClick={() => setPayDialogOpen(true)}
                sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)`, ml: 'auto' }}
              >
                Marcar como Pagadas
              </Button>
            </Paper>
          )}

          {/* Toggle de vista: detalle vs agrupado por Orden de Pago */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Button
              size="small"
              variant={!groupByOrder ? 'contained' : 'outlined'}
              onClick={() => setGroupByOrder(false)}
              sx={!groupByOrder ? { bgcolor: ORANGE, '&:hover': { bgcolor: '#e05a1a' } } : { color: ORANGE, borderColor: ORANGE }}
            >
              Detalle por guía
            </Button>
            <Button
              size="small"
              variant={groupByOrder ? 'contained' : 'outlined'}
              onClick={() => setGroupByOrder(true)}
              sx={groupByOrder ? { bgcolor: ORANGE, '&:hover': { bgcolor: '#e05a1a' } } : { color: ORANGE, borderColor: ORANGE }}
            >
              📦 Por Orden de Pago
            </Button>
            {groupByOrder && (
              <Typography variant="caption" color="text.secondary">
                {groupedRows.length} orden{groupedRows.length === 1 ? '' : 'es'} · guías compactadas
              </Typography>
            )}
          </Box>

          {/* Table */}
          <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
            ) : (
              <>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            indeterminate={selectedIds.length > 0 && selectedIds.length < records.filter(r => r.status === 'pending' && !r.awaitingClientPayment).length}
                            checked={records.filter(r => r.status === 'pending' && !r.awaitingClientPayment).length > 0 && selectedIds.length === records.filter(r => r.status === 'pending' && !r.awaitingClientPayment).length}
                            onChange={toggleSelectAll}
                            size="small"
                          />
                        </TableCell>
                        <TableCell><strong>Fecha</strong></TableCell>
                        <TableCell><strong>Asesor</strong></TableCell>
                        <TableCell><strong>Servicio</strong></TableCell>
                        <TableCell><strong>Tracking</strong></TableCell>
                        <TableCell><strong>Orden de Pago</strong></TableCell>
                        <TableCell align="center"><strong>Status Orden</strong></TableCell>
                        <TableCell><strong>Cliente</strong></TableCell>
                        <TableCell align="right"><strong>Monto Base</strong></TableCell>
                        <TableCell align="right"><strong>Tasa</strong></TableCell>
                        <TableCell align="right"><strong>Comisión</strong></TableCell>
                        <TableCell align="center"><strong>Estado</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {records.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={12} align="center">
                            <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                              Sin comisiones en este período
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : groupByOrder ? (
                        groupedRows.map(g => {
                          const allSel = g.pendingIds.length > 0 && g.pendingIds.every(id => selectedIds.includes(id));
                          const someSel = g.pendingIds.some(id => selectedIds.includes(id));
                          return (
                          <TableRow key={g.key} hover>
                            <TableCell padding="checkbox">
                              {g.pendingIds.length > 0 && (
                                <Checkbox size="small" checked={allSel} indeterminate={!allSel && someSel}
                                  onChange={(e) => toggleSelectMany(g.pendingIds, e.target.checked)} />
                              )}
                            </TableCell>
                            <TableCell><Typography variant="caption">{formatDate(g.createdAt)}</Typography></TableCell>
                            <TableCell><Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 120 }}>{g.advisorName}</Typography></TableCell>
                            <TableCell><Typography variant="body2">{g.serviceType ? (serviceLabels[g.serviceType] || g.serviceType) : 'Varios'}</Typography></TableCell>
                            <TableCell>
                              <Tooltip title={g.trackings.join(', ') || '—'}>
                                <Chip label={`${g.count} guía${g.count === 1 ? '' : 's'}`} size="small"
                                  sx={{ fontWeight: 700, bgcolor: 'rgba(0,0,0,0.06)' }} />
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              {g.paymentOrder ? (
                                <Chip label={g.paymentOrder} size="small" variant="outlined"
                                  sx={{ fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 600, borderColor: ORANGE, color: ORANGE }} />
                              ) : <Typography variant="caption" color="text.secondary">Sin orden</Typography>}
                            </TableCell>
                            <TableCell align="center">
                              {(() => {
                                const st = String(g.paymentOrderStatus || '').toLowerCase();
                                if (!st) return <Typography variant="caption" color="text.secondary">—</Typography>;
                                const map: Record<string, { label: string; color: any }> = {
                                  completed: { label: 'Pagado', color: 'success' }, paid: { label: 'Pagado', color: 'success' },
                                  cancelled: { label: 'Cancelada', color: 'error' }, expired: { label: 'Expirada', color: 'error' },
                                  pending_payment: { label: 'Pendiente', color: 'warning' }, pending: { label: 'Pendiente', color: 'warning' },
                                  vouchers_submitted: { label: 'Procesando', color: 'info' }, vouchers_partial: { label: 'Procesando', color: 'info' },
                                  completado: { label: 'Completada', color: 'success' }, en_proceso: { label: 'Pendiente', color: 'warning' },
                                  esperando_comprobante: { label: 'Pendiente', color: 'warning' }, cancelado: { label: 'Cancelada', color: 'error' },
                                  error_envio: { label: 'Error', color: 'error' }, active: { label: 'Pagada', color: 'success' },
                                  generated: { label: 'Pendiente', color: 'warning' },
                                };
                                const c = map[st] || { label: g.paymentOrderStatus as string, color: 'default' };
                                return <Chip label={c.label} size="small" color={c.color} variant={c.color === 'success' ? 'filled' : 'outlined'} sx={{ fontSize: '0.7rem' }} />;
                              })()}
                            </TableCell>
                            <TableCell><Typography variant="body2" fontWeight={700} sx={{ fontFamily: 'monospace' }}>{g.clientBox || '—'}</Typography></TableCell>
                            <TableCell align="right">{formatMXN(g.montoBase)}</TableCell>
                            <TableCell align="right"><Typography variant="caption" color="text.secondary">{g.rateLabel}</Typography></TableCell>
                            <TableCell align="right"><Typography fontWeight={700} color="info.main">{formatMXN(g.comision)}</Typography></TableCell>
                            <TableCell align="center">
                              {g.status === 'paid' ? <Chip label="Pagado" size="small" color="success" variant="filled" sx={{ fontSize: '0.7rem' }} />
                                : g.status === 'partial' ? <Chip label="Parcial" size="small" color="info" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                : g.status === 'awaiting' ? <Chip label="En crédito" size="small" color="default" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                : <Chip label="Pendiente" size="small" color="warning" variant="filled" sx={{ fontSize: '0.7rem' }} />}
                            </TableCell>
                          </TableRow>
                          );
                        })
                      ) : (
                        records.map(r => (
                          <TableRow key={r.id} hover selected={selectedIds.includes(r.id)}>
                            <TableCell padding="checkbox">
                              {r.status === 'pending' && !r.awaitingClientPayment && (
                                <Checkbox
                                  checked={selectedIds.includes(r.id)}
                                  onChange={() => toggleSelect(r.id)}
                                  size="small"
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption">{formatDate(r.createdAt)}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 120 }}>
                                {r.advisorName}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Tooltip title={r.serviceType}>
                                <Typography variant="body2">{serviceLabels[r.serviceType] || r.serviceType}</Typography>
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{r.tracking || '—'}</Typography>
                            </TableCell>
                            <TableCell>
                              {r.paymentOrder ? (
                                <Chip label={r.paymentOrder} size="small" variant="outlined"
                                  sx={{ fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 600, borderColor: ORANGE, color: ORANGE }} />
                              ) : (
                                <Typography variant="caption" color="text.secondary">—</Typography>
                              )}
                            </TableCell>
                            <TableCell align="center">
                              {(() => {
                                const st = String(r.paymentOrderStatus || '').toLowerCase();
                                if (!st) return <Typography variant="caption" color="text.secondary">—</Typography>;
                                const map: Record<string, { label: string; color: any }> = {
                                  completed: { label: 'Pagado', color: 'success' },
                                  paid: { label: 'Pagado', color: 'success' },
                                  cancelled: { label: 'Cancelada', color: 'error' },
                                  expired: { label: 'Expirada', color: 'error' },
                                  pending_payment: { label: 'Pendiente', color: 'warning' },
                                  pending: { label: 'Pendiente', color: 'warning' },
                                  vouchers_submitted: { label: 'Procesando', color: 'info' },
                                  vouchers_partial: { label: 'Procesando', color: 'info' },
                                  // X-Pay (entangled_payment_requests.estatus_global)
                                  completado: { label: 'Completada', color: 'success' },
                                  en_proceso: { label: 'Pendiente', color: 'warning' },
                                  esperando_comprobante: { label: 'Pendiente', color: 'warning' },
                                  cancelado: { label: 'Cancelada', color: 'error' },
                                  error_envio: { label: 'Error', color: 'error' },
                                  // GEX (warranties.status)
                                  active: { label: 'Pagada', color: 'success' },
                                  generated: { label: 'Pendiente', color: 'warning' },
                                };
                                const c = map[st] || { label: r.paymentOrderStatus as string, color: 'default' };
                                return <Chip label={c.label} size="small" color={c.color} variant={c.color === 'success' ? 'filled' : 'outlined'} sx={{ fontSize: '0.7rem' }} />;
                              })()}
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight={700} sx={{ fontFamily: 'monospace' }}>{r.clientBox || '—'}</Typography>
                            </TableCell>
                            <TableCell align="right">{formatMXN(r.paymentAmount)}</TableCell>
                            <TableCell align="right">
                              <Typography variant="caption" color="text.secondary">
                                {r.gexCommission > 0 ? 'Fijo' : `${r.commissionRate}%`}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography fontWeight={600} color="info.main">{formatMXN(r.commissionAmount)}</Typography>
                            </TableCell>
                            <TableCell align="center">
                              {r.status === 'paid' ? (
                                <Tooltip title={`Pagado ${formatDate(r.paidAt)}`}>
                                  <Chip label="Pagado" size="small" color="success" variant="filled" sx={{ fontSize: '0.7rem' }} />
                                </Tooltip>
                              ) : r.awaitingClientPayment ? (
                                <Tooltip title={`Orden pagada con crédito. La comisión se libera cuando el cliente abone${r.clientCollectedAmount > 0 ? ` (cobrado ${formatMXN(r.clientCollectedAmount)} de ${formatMXN(r.paymentAmount)})` : ''}.`}>
                                  <Chip label="En crédito" size="small" color="default" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                </Tooltip>
                              ) : (
                                <Chip label="Pendiente" size="small" color="warning" variant="filled" sx={{ fontSize: '0.7rem' }} />
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={total}
                  page={page}
                  onPageChange={(_, p) => setPage(p)}
                  rowsPerPage={rowsPerPage}
                  rowsPerPageOptions={[50, 100]}
                  onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                  labelRowsPerPage="Por página"
                  labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
                />
              </>
            )}
          </Paper>
      </>

      {/* Pay Dialog */}
      <Dialog open={payDialogOpen} onClose={() => setPayDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>💰 Confirmar Pago de Comisiones</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Vas a marcar <strong>{selectedIds.length}</strong> comisiones como pagadas
            por un total de <strong>{formatMXN(selectedTotal)}</strong>.
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={2}
            label="Notas de pago (opcional)"
            value={payNotes}
            onChange={e => setPayNotes(e.target.value)}
            placeholder="Ej: Transferencia SPEI #12345, Efectivo en sucursal, etc."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleMarkAsPaid}
            disabled={paying}
            startIcon={paying ? <CircularProgress size={16} color="inherit" /> : <PaymentIcon />}
            sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` }}
          >
            Confirmar Pago
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
