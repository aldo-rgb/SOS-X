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
  paymentAmount: number;
  commissionRate: number;
  commissionAmount: number;
  leaderOverridePct: number;
  leaderOverrideAmount: number;
  gexCommission: number;
  status: string;
  paidAt: string | null;
  createdAt: string;
}

interface Summary {
  totalCount: number;
  totalCommission: number;
  pendingTotal: number;
  paidTotal: number;
  totalLeaderOverride: number;
  advisorCount: number;
}

export default function AdvisorCommissionsLedgerPage() {
  // ─── State ───
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [paying, setPaying] = useState(false);
  const [payNotes, setPayNotes] = useState('');
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Filters
  const [filterAdvisor, setFilterAdvisor] = useState('');
  const [filterService, setFilterService] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // ─── Fetch data ───
  const fetchLedger = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page + 1), limit: '50' };
      if (filterAdvisor) params.advisor_id = filterAdvisor;
      if (filterService) params.service_type = filterService;
      if (filterStatus) params.status = filterStatus;
      if (filterFrom) params.from_date = filterFrom;
      if (filterTo) params.to_date = filterTo;

      const res = await api.get('/admin/commissions/ledger', { params });
      setRecords(res.data.data);
      setSummary(res.data.summary);
      setTotal(res.data.total);
    } catch (err) {
      console.error('Error fetching commission ledger:', err);
    } finally {
      setLoading(false);
    }
  }, [page, filterAdvisor, filterService, filterStatus, filterFrom, filterTo]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

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
    const pendingIds = records.filter(r => r.status === 'pending').map(r => r.id);
    if (selectedIds.length === pendingIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pendingIds);
    }
  };

  const selectedTotal = records
    .filter(r => selectedIds.includes(r.id))
    .reduce((sum, r) => sum + r.commissionAmount, 0);

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
            <TextField size="small" label="Desde" type="date" value={filterFrom}
              onChange={e => { setFilterFrom(e.target.value); setPage(0); }}
              slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 150 }} />
            <TextField size="small" label="Hasta" type="date" value={filterTo}
              onChange={e => { setFilterTo(e.target.value); setPage(0); }}
              slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 150 }} />
            <Button size="small" onClick={() => { setFilterAdvisor(''); setFilterService(''); setFilterStatus(''); setFilterFrom(''); setFilterTo(''); setPage(0); }}>
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
                            indeterminate={selectedIds.length > 0 && selectedIds.length < records.filter(r => r.status === 'pending').length}
                            checked={records.filter(r => r.status === 'pending').length > 0 && selectedIds.length === records.filter(r => r.status === 'pending').length}
                            onChange={toggleSelectAll}
                            size="small"
                          />
                        </TableCell>
                        <TableCell><strong>Fecha</strong></TableCell>
                        <TableCell><strong>Asesor</strong></TableCell>
                        <TableCell><strong>Servicio</strong></TableCell>
                        <TableCell><strong>Tracking</strong></TableCell>
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
                          <TableCell colSpan={10} align="center">
                            <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                              Sin comisiones en este período
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        records.map(r => (
                          <TableRow key={r.id} hover selected={selectedIds.includes(r.id)}>
                            <TableCell padding="checkbox">
                              {r.status === 'pending' && (
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
                              <Typography variant="body2" noWrap sx={{ maxWidth: 100 }}>{r.clientName || '—'}</Typography>
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
                  rowsPerPage={50}
                  rowsPerPageOptions={[50]}
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
