import { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, Card, CardContent, Grid, Tabs, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Alert, CircularProgress, Avatar, Tooltip, Divider, InputAdornment
} from '@mui/material';
import {
  AccountBalance as BranchIcon,
  LocalShipping as DriverIcon,
  AccountBalanceWallet as WalletIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Visibility as ViewIcon,
  AttachMoney as MoneyIcon,
  Send as SendIcon,
  Refresh as RefreshIcon,
  History as HistoryIcon,
  LocationOn as GpsIcon,
  Description as XmlIcon,
  Speed as OdometerIcon,
  ReceiptLong as MovementsIcon
} from '@mui/icons-material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Wallet {
  id: number;
  owner_type: 'branch' | 'driver';
  owner_id: number;
  owner_name: string;
  branch_id: number | null;
  branch_name: string | null;
  owner_phone: string | null;
  balance_mxn: string | number;
  pending_to_verify_mxn: string | number;
  credit_limit_mxn: string | number;
  status: string;
  pending_expenses_count: string | number;
  updated_at: string;
}

interface Movement {
  id: number;
  wallet_id: number;
  movement_type: 'fund' | 'advance' | 'expense' | 'return' | 'adjustment';
  category: string | null;
  amount_mxn: string | number;
  status: string;
  concept: string | null;
  evidence_url: string | null;
  xml_url: string | null;
  odometer_photo_url: string | null;
  odometer_km: number | null;
  gps_lat: number | null;
  gps_lng: number | null;
  branch_id: number | null;
  branch_name: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_name?: string | null;
  rejection_reason: string | null;
  advance_status?: string | null;
}

interface BranchOption {
  id: number;
  name: string;
  code: string;
  balance_mxn: string | number;
  wallet_id: number | null;
}

interface DriverOption {
  id: number;
  full_name: string;
  role: string;
  branch_id: number | null;
  phone: string | null;
  email: string | null;
}

interface Settlement {
  id: number;
  driver_user_id: number;
  driver_name: string;
  branch_name: string;
  total_funded: number;
  total_approved_expenses: number;
  total_pending_expenses: number;
  total_rejected_expenses: number;
  cash_returned: number;
  balance: number;
  status: string;
  opened_at: string;
  closed_at: string | null;
  closed_by_name: string | null;
  notes: string | null;
}

interface Stats {
  branches_balance: number;
  drivers_balance: number;
  drivers_pending_to_verify: number;
  pending_approvals_count: number;
  pending_approvals_total: number;
}

const fmtMoney = (n: number | string | null | undefined) => {
  const v = Number(n || 0);
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
};

const MOVEMENT_TYPE_META: Record<string, { label: string; sign: 1 | -1 }> = {
  fund: { label: 'Fondeo recibido', sign: 1 },
  advance: { label: 'Anticipo a chofer', sign: -1 },
  expense: { label: 'Gasto', sign: -1 },
  return: { label: 'Devolución', sign: 1 },
  adjustment: { label: 'Ajuste', sign: 1 }
};

const STATUS_META: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'default' }> = {
  approved: { label: 'Aprobado', color: 'success' },
  pending: { label: 'Pendiente', color: 'warning' },
  rejected: { label: 'Rechazado', color: 'error' },
  settled: { label: 'Liquidado', color: 'default' }
};

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  caseta: { label: 'Casetas', icon: '🛣️' },
  combustible: { label: 'Combustible', icon: '⛽' },
  mecanica: { label: 'Mecánica', icon: '🛠️' },
  alimentos: { label: 'Alimentos', icon: '🍔' },
  hospedaje: { label: 'Hospedaje', icon: '🏨' },
  estacionamiento: { label: 'Estacionamiento', icon: '🅿️' },
  papeleria: { label: 'Papelería', icon: '📎' },
  mensajeria: { label: 'Mensajería', icon: '📦' },
  lavado: { label: 'Lavado', icon: '🚿' },
  refacciones: { label: 'Refacciones', icon: '🔩' },
  hidratacion: { label: 'Hielo/Agua', icon: '💧' },
  peaje_internacional: { label: 'Peaje internacional', icon: '🛂' },
  otros: { label: 'Otros', icon: '📝' }
};

export default function PettyCashHubPage() {
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  // Solo directores y admins pueden fondear sucursales
  const currentUserRole = (() => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? (JSON.parse(raw)?.role || '') : '';
    } catch { return ''; }
  })();
  const canFundBranch = ['super_admin', 'admin', 'director'].includes(currentUserRole);

  const [tab, setTab] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [branchWallets, setBranchWallets] = useState<Wallet[]>([]);
  const [driverWallets, setDriverWallets] = useState<Wallet[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<Movement[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal Fondear Sucursal
  const [fundOpen, setFundOpen] = useState(false);
  const [branchesOpts, setBranchesOpts] = useState<BranchOption[]>([]);
  const [fundBranchId, setFundBranchId] = useState<number | ''>('');
  const [fundAmount, setFundAmount] = useState('');
  const [fundConcept, setFundConcept] = useState('');
  const [fundBusy, setFundBusy] = useState(false);

  // Modal Anticipo a Chofer
  const [advOpen, setAdvOpen] = useState(false);
  const [driversOpts, setDriversOpts] = useState<DriverOption[]>([]);
  const [advDriverId, setAdvDriverId] = useState<number | ''>('');
  const [advAmount, setAdvAmount] = useState('');
  const [advPurpose, setAdvPurpose] = useState('');
  const [advBranchId, setAdvBranchId] = useState<number | ''>('');
  const [advBusy, setAdvBusy] = useState(false);

  // Modal Detalle de gasto + aprobación
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewMov, setReviewMov] = useState<Movement | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);

  // Modal Estado de cuenta / movimientos de wallet
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailWallet, setDetailWallet] = useState<Wallet | null>(null);
  const [detailMovs, setDetailMovs] = useState<Movement[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Visor de foto de evidencia
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Toasts
  const [snack, setSnack] = useState<{ severity: 'success' | 'error'; msg: string } | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, bw, dw, pe, st] = await Promise.all([
        fetch(`${API_URL}/api/admin/petty-cash/stats`, { headers }).then(r => r.json()),
        fetch(`${API_URL}/api/admin/petty-cash/wallets?owner_type=branch`, { headers }).then(r => r.json()),
        fetch(`${API_URL}/api/admin/petty-cash/wallets?owner_type=driver`, { headers }).then(r => r.json()),
        fetch(`${API_URL}/api/admin/petty-cash/pending`, { headers }).then(r => r.json()),
        fetch(`${API_URL}/api/admin/petty-cash/settlements`, { headers }).then(r => r.json())
      ]);
      setStats(s);
      setBranchWallets(bw.wallets || []);
      setDriverWallets(dw.wallets || []);
      setPendingExpenses(pe.movements || []);
      setSettlements(st.settlements || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const openFundDialog = async () => {
    setFundOpen(true);
    setFundBranchId('');
    setFundAmount('');
    setFundConcept('');
    try {
      const r = await fetch(`${API_URL}/api/admin/petty-cash/branches`, { headers });
      const d = await r.json();
      setBranchesOpts(d.branches || []);
    } catch (e) { console.error(e); }
  };

  const handleFund = async () => {
    if (!fundBranchId || !fundAmount) return;
    setFundBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/petty-cash/fund-branch`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id: fundBranchId,
          amount_mxn: Number(fundAmount),
          concept: fundConcept || undefined
        })
      });
      const d = await r.json();
      if (r.ok) {
        setSnack({ severity: 'success', msg: d.message || 'Sucursal fondeada' });
        setFundOpen(false);
        loadAll();
      } else {
        setSnack({ severity: 'error', msg: d.error || 'Error al fondear' });
      }
    } catch {
      setSnack({ severity: 'error', msg: 'Error de red' });
    } finally {
      setFundBusy(false);
    }
  };

  const openAdvanceDialog = async () => {
    setAdvOpen(true);
    setAdvDriverId('');
    setAdvAmount('');
    setAdvPurpose('');
    setAdvBranchId('');
    try {
      const [d1, b1] = await Promise.all([
        fetch(`${API_URL}/api/admin/petty-cash/drivers`, { headers }).then(r => r.json()),
        fetch(`${API_URL}/api/admin/petty-cash/branches`, { headers }).then(r => r.json())
      ]);
      setDriversOpts(d1.drivers || []);
      setBranchesOpts(b1.branches || []);
    } catch (e) { console.error(e); }
  };

  const handleAdvance = async () => {
    if (!advDriverId || !advAmount) return;
    setAdvBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/petty-cash/advance-driver`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_user_id: advDriverId,
          amount_mxn: Number(advAmount),
          route_purpose: advPurpose || undefined,
          branch_id: advBranchId || undefined
        })
      });
      const d = await r.json();
      if (r.ok) {
        setSnack({ severity: 'success', msg: d.message || 'Vale creado' });
        setAdvOpen(false);
        loadAll();
      } else {
        setSnack({ severity: 'error', msg: d.error || 'Error' });
      }
    } catch {
      setSnack({ severity: 'error', msg: 'Error de red' });
    } finally {
      setAdvBusy(false);
    }
  };

  const openWalletDetail = async (wallet: Wallet) => {
    setDetailWallet(wallet);
    setDetailMovs([]);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/petty-cash/wallets/${wallet.id}`, { headers });
      const d = await r.json();
      if (r.ok) {
        if (d.wallet) setDetailWallet(prev => ({ ...(prev as Wallet), ...d.wallet }));
        setDetailMovs(d.movements || []);
      } else {
        setSnack({ severity: 'error', msg: d.error || 'Error al cargar movimientos' });
      }
    } catch {
      setSnack({ severity: 'error', msg: 'Error de red' });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApprove = async (movId: number) => {
    setReviewBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/petty-cash/movements/${movId}/approve`, {
        method: 'POST', headers
      });
      const d = await r.json();
      if (r.ok) {
        setSnack({ severity: 'success', msg: 'Gasto aprobado' });
        setReviewOpen(false);
        loadAll();
      } else {
        setSnack({ severity: 'error', msg: d.error || 'Error' });
      }
    } finally {
      setReviewBusy(false);
    }
  };

  const handleReject = async (movId: number) => {
    if (!rejectReason || rejectReason.trim().length < 3) {
      setSnack({ severity: 'error', msg: 'Captura un motivo de rechazo' });
      return;
    }
    setReviewBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/petty-cash/movements/${movId}/reject`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason })
      });
      const d = await r.json();
      if (r.ok) {
        setSnack({ severity: 'success', msg: 'Gasto rechazado' });
        setReviewOpen(false);
        setRejectReason('');
        loadAll();
      } else {
        setSnack({ severity: 'error', msg: d.error || 'Error' });
      }
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold">💼 Caja Chica Sucursales</Typography>
          <Typography variant="body2" color="text.secondary">
            Fondeo, anticipos a choferes (vales digitales), captura de gastos, aprobaciones y arqueos.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          {canFundBranch && (
            <Button variant="contained" color="primary" startIcon={<MoneyIcon />} onClick={openFundDialog}>
              Fondear Sucursal
            </Button>
          )}
          <Button variant="contained" color="secondary" startIcon={<SendIcon />} onClick={openAdvanceDialog}>
            Anticipo a Chofer
          </Button>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadAll}>
            Actualizar
          </Button>
        </Box>
      </Box>

      {/* Stats */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, md: 3 }}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <BranchIcon sx={{ fontSize: 36, color: 'primary.main' }} />
                <Box>
                  <Typography variant="caption" color="text.secondary">Saldo Sucursales</Typography>
                  <Typography variant="h5" fontWeight="bold">{fmtMoney(stats.branches_balance)}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <DriverIcon sx={{ fontSize: 36, color: 'info.main' }} />
                <Box>
                  <Typography variant="caption" color="text.secondary">Saldo Choferes</Typography>
                  <Typography variant="h5" fontWeight="bold">{fmtMoney(stats.drivers_balance)}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <WalletIcon sx={{ fontSize: 36, color: 'warning.main' }} />
                <Box>
                  <Typography variant="caption" color="text.secondary">Por Comprobar</Typography>
                  <Typography variant="h5" fontWeight="bold" color="warning.main">
                    {fmtMoney(stats.drivers_pending_to_verify)}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <ApproveIcon sx={{ fontSize: 36, color: 'error.main' }} />
                <Box>
                  <Typography variant="caption" color="text.secondary">Pendientes de Aprobar</Typography>
                  <Typography variant="h5" fontWeight="bold" color="error.main">
                    {stats.pending_approvals_count} · {fmtMoney(stats.pending_approvals_total)}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      <Paper sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab icon={<BranchIcon />} iconPosition="start" label={`Sucursales (${branchWallets.length})`} />
          <Tab icon={<DriverIcon />} iconPosition="start" label={`Choferes (${driverWallets.length})`} />
          <Tab icon={<ApproveIcon />} iconPosition="start" label={`Aprobaciones (${pendingExpenses.length})`} />
          <Tab icon={<HistoryIcon />} iconPosition="start" label="Arqueos / Cortes" />
        </Tabs>
      </Paper>

      {loading && <CircularProgress />}

      {/* TAB: Sucursales */}
      {tab === 0 && (
        <Grid container spacing={2}>
          {branchWallets.map(w => (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={w.id}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                      <Avatar sx={{ bgcolor: 'primary.main' }}><BranchIcon /></Avatar>
                      <Box>
                        <Typography fontWeight="bold">{w.owner_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Sucursal · {w.status === 'active' ? '🟢 Activa' : `⚠️ ${w.status}`}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="caption" color="text.secondary">Saldo disponible</Typography>
                  <Typography variant="h4" fontWeight="bold" color={Number(w.balance_mxn) > 0 ? 'success.main' : 'text.disabled'}>
                    {fmtMoney(w.balance_mxn)}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                    <Button size="small" variant="contained" startIcon={<SendIcon />} onClick={() => {
                      setAdvBranchId(w.branch_id || '');
                      openAdvanceDialog();
                    }}>Anticipo</Button>
                    <Button size="small" variant="outlined" color="info" startIcon={<MovementsIcon />} onClick={() => openWalletDetail(w)}>
                      Movimientos
                    </Button>
                    {canFundBranch && (
                      <Button size="small" variant="outlined" startIcon={<MoneyIcon />} onClick={() => {
                        setFundBranchId(w.branch_id || '');
                        openFundDialog();
                      }}>Fondear</Button>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
          {branchWallets.length === 0 && !loading && (
            <Grid size={{ xs: 12 }}>
              <Alert severity="info">
                Aún no hay wallets de sucursal. Pulsa <strong>Fondear Sucursal</strong> para crear la primera.
              </Alert>
            </Grid>
          )}
        </Grid>
      )}

      {/* TAB: Choferes */}
      {tab === 1 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Chofer</TableCell>
                <TableCell>Sucursal</TableCell>
                <TableCell align="right">Saldo</TableCell>
                <TableCell align="right">Por Comprobar</TableCell>
                <TableCell align="center">Gastos pend.</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="center">Movimientos</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {driverWallets.map(w => (
                <TableRow key={w.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: 'info.main' }}><DriverIcon fontSize="small" /></Avatar>
                      <Box>
                        <Typography fontWeight={600}>{w.owner_name}</Typography>
                        <Typography variant="caption" color="text.secondary">{w.owner_phone || '—'}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>{w.branch_name || '—'}</TableCell>
                  <TableCell align="right">
                    <Typography fontWeight="bold" color={Number(w.balance_mxn) > 0 ? 'primary.main' : 'text.disabled'}>
                      {fmtMoney(w.balance_mxn)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {Number(w.pending_to_verify_mxn) > 0 ? (
                      <Chip size="small" color="warning" label={fmtMoney(w.pending_to_verify_mxn)} />
                    ) : '—'}
                  </TableCell>
                  <TableCell align="center">
                    {Number(w.pending_expenses_count) > 0 ? (
                      <Chip size="small" color="error" label={w.pending_expenses_count} />
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={w.status} color={w.status === 'active' ? 'success' : 'default'} />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Ver estado de cuenta y evidencias">
                      <IconButton size="small" color="info" onClick={() => openWalletDetail(w)}>
                        <MovementsIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {driverWallets.length === 0 && !loading && (
                <TableRow><TableCell colSpan={7} align="center">Sin choferes con wallet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* TAB: Aprobaciones */}
      {tab === 2 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Fecha</TableCell>
                <TableCell>Chofer</TableCell>
                <TableCell>Categoría</TableCell>
                <TableCell align="right">Monto</TableCell>
                <TableCell>Concepto</TableCell>
                <TableCell align="center">Evidencia</TableCell>
                <TableCell align="center">GPS</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pendingExpenses.map(m => {
                const cat = CATEGORY_LABELS[m.category || 'otros'] || { label: m.category || 'Otros', icon: '📝' };
                return (
                  <TableRow key={m.id} hover>
                    <TableCell>{new Date(m.created_at).toLocaleString('es-MX')}</TableCell>
                    <TableCell>{m.driver_name || '—'}</TableCell>
                    <TableCell>
                      <Chip size="small" label={`${cat.icon} ${cat.label}`} />
                    </TableCell>
                    <TableCell align="right">
                      <Typography fontWeight="bold">{fmtMoney(m.amount_mxn)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={m.concept || ''}>
                        <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.concept || '—'}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      {m.evidence_url ? (
                        <IconButton size="small" onClick={() => window.open(m.evidence_url!, '_blank')}>
                          <ViewIcon fontSize="small" />
                        </IconButton>
                      ) : '—'}
                      {m.xml_url && (
                        <IconButton size="small" onClick={() => window.open(m.xml_url!, '_blank')}>
                          <XmlIcon fontSize="small" />
                        </IconButton>
                      )}
                      {m.odometer_photo_url && (
                        <IconButton size="small" onClick={() => window.open(m.odometer_photo_url!, '_blank')}>
                          <OdometerIcon fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {m.gps_lat && m.gps_lng ? (
                        <Tooltip title={`${m.gps_lat}, ${m.gps_lng}`}>
                          <IconButton size="small" onClick={() => window.open(`https://maps.google.com/?q=${m.gps_lat},${m.gps_lng}`, '_blank')}>
                            <GpsIcon fontSize="small" color="success" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title="Sin GPS — ⚠️ Bandera roja"><GpsIcon fontSize="small" color="error" /></Tooltip>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Button size="small" variant="contained" color="primary" onClick={() => { setReviewMov(m); setReviewOpen(true); setRejectReason(''); }}>
                        Revisar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {pendingExpenses.length === 0 && !loading && (
                <TableRow><TableCell colSpan={8} align="center">Sin gastos pendientes 🎉</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* TAB: Arqueos */}
      {tab === 3 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Fecha</TableCell>
                <TableCell>Chofer</TableCell>
                <TableCell>Sucursal</TableCell>
                <TableCell align="right">Fondeado</TableCell>
                <TableCell align="right">Aprobado</TableCell>
                <TableCell align="right">Devuelto</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Cerrado por</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {settlements.map(s => (
                <TableRow key={s.id}>
                  <TableCell>{new Date(s.opened_at).toLocaleString('es-MX')}</TableCell>
                  <TableCell>{s.driver_name}</TableCell>
                  <TableCell>{s.branch_name}</TableCell>
                  <TableCell align="right">{fmtMoney(s.total_funded)}</TableCell>
                  <TableCell align="right">{fmtMoney(s.total_approved_expenses)}</TableCell>
                  <TableCell align="right">{fmtMoney(s.cash_returned)}</TableCell>
                  <TableCell align="right">
                    <Typography fontWeight="bold" color={s.balance === 0 ? 'success.main' : 'error.main'}>
                      {fmtMoney(s.balance)}
                    </Typography>
                  </TableCell>
                  <TableCell><Chip size="small" label={s.status} color={s.status === 'closed' ? 'success' : 'warning'} /></TableCell>
                  <TableCell>{s.closed_by_name || '—'}</TableCell>
                </TableRow>
              ))}
              {settlements.length === 0 && !loading && (
                <TableRow><TableCell colSpan={9} align="center">Sin arqueos registrados</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Dialog: Fondear Sucursal */}
      <Dialog open={fundOpen} onClose={() => !fundBusy && setFundOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>💰 Fondear Caja Chica de Sucursal</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Este movimiento se registrará como egreso en Caja CC y entrará al saldo de la sucursal.
          </Alert>
          <TextField
            select fullWidth margin="normal" label="Sucursal"
            value={fundBranchId}
            onChange={e => setFundBranchId(Number(e.target.value))}
          >
            {branchesOpts.map(b => (
              <MenuItem key={b.id} value={b.id}>
                {b.name} — saldo actual: {fmtMoney(b.balance_mxn)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth margin="normal" label="Monto (MXN)" type="number"
            value={fundAmount} onChange={e => setFundAmount(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
          />
          <TextField
            fullWidth margin="normal" label="Concepto / Notas (opcional)"
            value={fundConcept} onChange={e => setFundConcept(e.target.value)}
            multiline rows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFundOpen(false)} disabled={fundBusy}>Cancelar</Button>
          <Button variant="contained" onClick={handleFund} disabled={fundBusy || !fundBranchId || !fundAmount}>
            {fundBusy ? <CircularProgress size={20} /> : 'Fondear'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Anticipo Chofer */}
      <Dialog open={advOpen} onClose={() => !advBusy && setAdvOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>🧾 Crear Vale Digital (Anticipo a Chofer)</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Sale del saldo de la sucursal. El chofer deberá "Aceptar y Firmar" desde su app antes de poder usarlo.
          </Alert>
          {branchesOpts.length > 1 && (
            <TextField
              select fullWidth margin="normal" label="Sucursal origen (opcional)"
              value={advBranchId}
              onChange={e => setAdvBranchId(Number(e.target.value))}
            >
              <MenuItem value="">— Auto (sucursal del chofer) —</MenuItem>
              {branchesOpts.map(b => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name} — saldo: {fmtMoney(b.balance_mxn)}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            select fullWidth margin="normal" label="Chofer"
            value={advDriverId}
            onChange={e => setAdvDriverId(Number(e.target.value))}
          >
            {driversOpts.map(d => (
              <MenuItem key={d.id} value={d.id}>
                {d.full_name} ({d.role}) {d.phone ? `· ${d.phone}` : ''}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth margin="normal" label="Monto (MXN)" type="number"
            value={advAmount} onChange={e => setAdvAmount(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
          />
          <TextField
            fullWidth margin="normal" label="Motivo / Ruta (opcional)"
            value={advPurpose} onChange={e => setAdvPurpose(e.target.value)}
            placeholder="ej. Ruta MTY-LRD 16/05"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdvOpen(false)} disabled={advBusy}>Cancelar</Button>
          <Button variant="contained" color="secondary" onClick={handleAdvance} disabled={advBusy || !advDriverId || !advAmount}>
            {advBusy ? <CircularProgress size={20} /> : 'Crear Vale'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Revisar gasto */}
      <Dialog open={reviewOpen} onClose={() => !reviewBusy && setReviewOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Revisión de gasto</DialogTitle>
        <DialogContent>
          {reviewMov && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                {reviewMov.evidence_url ? (
                  <Box
                    component="img"
                    src={reviewMov.evidence_url}
                    alt="ticket"
                    sx={{ width: '100%', borderRadius: 1, border: '1px solid #ddd', cursor: 'pointer' }}
                    onClick={() => window.open(reviewMov.evidence_url!, '_blank')}
                  />
                ) : <Alert severity="warning">Sin foto del ticket</Alert>}
                {reviewMov.odometer_photo_url && (
                  <>
                    <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>Odómetro:</Typography>
                    <Box component="img" src={reviewMov.odometer_photo_url} sx={{ width: '100%', borderRadius: 1, mt: 0.5 }} />
                  </>
                )}
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography><strong>Chofer:</strong> {reviewMov.driver_name}</Typography>
                <Typography><strong>Sucursal:</strong> {reviewMov.branch_name || '—'}</Typography>
                <Typography><strong>Fecha:</strong> {new Date(reviewMov.created_at).toLocaleString('es-MX')}</Typography>
                <Typography><strong>Categoría:</strong> {CATEGORY_LABELS[reviewMov.category || 'otros']?.label}</Typography>
                <Typography variant="h5" sx={{ my: 1 }}><strong>{fmtMoney(reviewMov.amount_mxn)}</strong></Typography>
                {reviewMov.concept && <Typography><strong>Concepto:</strong> {reviewMov.concept}</Typography>}
                {reviewMov.odometer_km && <Typography><strong>Km:</strong> {reviewMov.odometer_km}</Typography>}
                <Divider sx={{ my: 1.5 }} />
                {reviewMov.gps_lat && reviewMov.gps_lng ? (
                  <Alert severity="success" icon={<GpsIcon />}>
                    GPS: {reviewMov.gps_lat}, {reviewMov.gps_lng}{' '}
                    <Button size="small" onClick={() => window.open(`https://maps.google.com/?q=${reviewMov.gps_lat},${reviewMov.gps_lng}`, '_blank')}>Ver mapa</Button>
                  </Alert>
                ) : (
                  <Alert severity="warning" icon={<GpsIcon />}>🚩 Sin coordenadas GPS — posible discrepancia</Alert>
                )}
                <TextField
                  fullWidth margin="normal" label="Motivo de rechazo (si aplica)"
                  value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                  multiline rows={2}
                />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewOpen(false)} disabled={reviewBusy}>Cerrar</Button>
          <Button color="error" startIcon={<RejectIcon />} onClick={() => reviewMov && handleReject(reviewMov.id)} disabled={reviewBusy}>
            Rechazar
          </Button>
          <Button variant="contained" color="success" startIcon={<ApproveIcon />} onClick={() => reviewMov && handleApprove(reviewMov.id)} disabled={reviewBusy}>
            Aprobar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Estado de cuenta / movimientos de wallet */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          📒 Estado de cuenta — {detailWallet?.owner_name || ''}
        </DialogTitle>
        <DialogContent>
          {detailWallet && (
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">Saldo disponible</Typography>
                <Typography variant="h5" fontWeight="bold" color="success.main">
                  {fmtMoney(detailWallet.balance_mxn)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Movimientos</Typography>
                <Typography variant="h5" fontWeight="bold">{detailMovs.length}</Typography>
              </Box>
              {detailWallet.branch_name && (
                <Box>
                  <Typography variant="caption" color="text.secondary">Sucursal</Typography>
                  <Typography variant="h6" fontWeight="bold">{detailWallet.branch_name}</Typography>
                </Box>
              )}
            </Box>
          )}
          {detailLoading && <CircularProgress />}
          {!detailLoading && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha</TableCell>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Concepto / Categoría</TableCell>
                    <TableCell align="right">Cargo</TableCell>
                    <TableCell align="right">Abono</TableCell>
                    <TableCell align="right">Saldo</TableCell>
                    <TableCell align="center">Estado</TableCell>
                    <TableCell align="center">Evidencia</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(() => {
                    // Orden cronológico ascendente para el estado de cuenta
                    const ordered = [...detailMovs].sort(
                      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    );
                    let running = 0;
                    return ordered.map(m => {
                      const meta = MOVEMENT_TYPE_META[m.movement_type] || { label: m.movement_type, sign: 1 as const };
                      const amount = Number(m.amount_mxn) || 0;
                      // El gasto del chofer no afecta el saldo de la sucursal (sale de su wallet)
                      const affectsBalance = m.movement_type !== 'expense'
                        && (m.status === 'approved' || m.status === 'settled');
                      if (affectsBalance) running += meta.sign * amount;
                      // El anticipo refleja la firma del chofer: sin firmar queda Pendiente
                      let effStatus = m.status;
                      if (m.movement_type === 'advance' && m.advance_status) {
                        effStatus = m.advance_status === 'pending_acceptance' ? 'pending'
                          : m.advance_status === 'accepted' ? 'approved'
                          : m.advance_status === 'settled' ? 'settled' : m.status;
                      }
                      const st = STATUS_META[effStatus] || { label: effStatus, color: 'default' as const };
                      const cat = m.category ? (CATEGORY_LABELS[m.category] || { label: m.category, icon: '📝' }) : null;
                      return (
                        <TableRow key={m.id} hover>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            {new Date(m.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                          </TableCell>
                          <TableCell>{meta.label}</TableCell>
                          <TableCell>
                            {cat && <Chip size="small" sx={{ mr: 0.5 }} label={`${cat.icon} ${cat.label}`} />}
                            <Typography variant="body2" component="span">
                              {m.movement_type === 'expense' && m.driver_name ? `${m.driver_name} · ` : ''}
                              {m.concept || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {meta.sign < 0 ? (
                              <Typography color="error.main" fontWeight={600}>−{fmtMoney(amount)}</Typography>
                            ) : '—'}
                          </TableCell>
                          <TableCell align="right">
                            {meta.sign > 0 ? (
                              <Typography color="success.main" fontWeight={600}>+{fmtMoney(amount)}</Typography>
                            ) : '—'}
                          </TableCell>
                          <TableCell align="right">
                            {affectsBalance ? <Typography fontWeight="bold">{fmtMoney(running)}</Typography> : '—'}
                          </TableCell>
                          <TableCell align="center">
                            <Chip size="small" label={st.label} color={st.color} />
                          </TableCell>
                          <TableCell align="center">
                            {m.evidence_url ? (
                              <Tooltip title="Ver foto del ticket">
                                <IconButton size="small" color="primary" onClick={() => setPhotoUrl(m.evidence_url!)}>
                                  <ViewIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            ) : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    });
                  })()}
                  {detailMovs.length === 0 && !detailLoading && (
                    <TableRow><TableCell colSpan={8} align="center">Sin movimientos registrados</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Visor de foto de evidencia */}
      <Dialog open={!!photoUrl} onClose={() => setPhotoUrl(null)} maxWidth="md">
        <DialogTitle>🧾 Evidencia del ticket</DialogTitle>
        <DialogContent>
          {photoUrl && (
            <Box
              component="img"
              src={photoUrl}
              alt="Evidencia"
              sx={{ width: '100%', borderRadius: 1, border: '1px solid #ddd' }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => photoUrl && window.open(photoUrl, '_blank')}>Abrir en pestaña</Button>
          <Button variant="contained" onClick={() => setPhotoUrl(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar simple */}
      {snack && (
        <Alert
          severity={snack.severity}
          onClose={() => setSnack(null)}
          sx={{ position: 'fixed', bottom: 16, right: 16, zIndex: 9999, minWidth: 320 }}
        >
          {snack.msg}
        </Alert>
      )}
    </Box>
  );
}
