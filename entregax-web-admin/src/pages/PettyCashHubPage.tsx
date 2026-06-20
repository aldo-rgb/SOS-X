import { useState, useEffect, useCallback, useRef } from 'react';
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
  PhotoCamera as PhotoCameraIcon,
  Receipt as ReceiptIcon,
  Send as SendIcon,
  Refresh as RefreshIcon,
  LocationOn as GpsIcon,
  Description as XmlIcon,
  Speed as OdometerIcon,
  ReceiptLong as MovementsIcon,
  DeleteForever as DeleteIcon,
  Edit as EditIcon,
  LocalAtm as CajaCCIcon,
  AssignmentTurnedIn as SettleIcon,
  Route as RouteBlockIcon
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
  currency?: string;
  status: string;
  pending_expenses_count: string | number;
  total_spent_mxn?: string | number;
  week_spent_mxn?: string | number;
  updated_at: string;
  ops_user_name?: string | null;
}

interface Movement {
  id: number;
  wallet_id: number;
  movement_type: 'fund' | 'advance' | 'expense' | 'return' | 'adjustment';
  category: string | null;
  amount_mxn: string | number;
  currency?: string;
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
  currency?: string;
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

const fmtMoney = (n: number | string | null | undefined, currency: string = 'MXN') => {
  const v = Number(n || 0);
  if ((currency || 'MXN').toUpperCase() === 'USD') {
    return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }
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
  impuestos_dhl: { label: 'Impuestos DHL', icon: '📮' },
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
  const currentUserBranch = (() => {
    try {
      const raw = localStorage.getItem('user');
      const u = raw ? JSON.parse(raw) : null;
      return (u?.branch_name || u?.branch || '').toLowerCase();
    } catch { return ''; }
  })();
  const canFundBranch = ['super_admin', 'admin', 'director'].includes(currentUserRole);
  const normalizedRole = (currentUserRole || '').toLowerCase();
  const isSuperAdmin = normalizedRole === 'super_admin';
  const isAccountant = ['accountant', 'contador'].includes(normalizedRole);
  const isOperations = ['operaciones', 'operations'].includes(normalizedRole);
  const canEditWalletMovements = ['super_admin', 'accountant', 'contador', 'operaciones', 'operations'].includes(normalizedRole);
  const isDirector = currentUserRole === 'director';
  // Bloques de Ruta: solo super_admin, admin y operaciones de CEDIS GDL
  const canSeeRouteBlocks = ['super_admin', 'admin'].includes(currentUserRole)
    || (currentUserRole === 'operaciones' && currentUserBranch.includes('gdl'));

  const [tab, setTab] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [branchWallets, setBranchWallets] = useState<Wallet[]>([]);
  const [driverWallets, setDriverWallets] = useState<Wallet[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<Movement[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [routeBlocks, setRouteBlocks] = useState<any[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  // Modal Fondear Sucursal
  const [fundOpen, setFundOpen] = useState(false);
  const [branchesOpts, setBranchesOpts] = useState<BranchOption[]>([]);
  const [fundBranchId, setFundBranchId] = useState<number | ''>('');
  const [fundAmount, setFundAmount] = useState('');
  const [fundConcept, setFundConcept] = useState('');
  const [fundOrigin, setFundOrigin] = useState<'caja_cc' | 'otro' | ''>('');
  const [fundOriginDetail, setFundOriginDetail] = useState('');
  const [fundBusy, setFundBusy] = useState(false);
  // FX (sólo si la sucursal opera en otra moneda)
  const [fundFxRate, setFundFxRate] = useState('');
  const [fundSourceAmountMxn, setFundSourceAmountMxn] = useState('');
  const [fundFxProvider, setFundFxProvider] = useState('');

  // Modal Anticipo a Chofer
  const [advOpen, setAdvOpen] = useState(false);
  const [driversOpts, setDriversOpts] = useState<DriverOption[]>([]);
  const [advDriverId, setAdvDriverId] = useState<number | ''>('');
  const [advAmount, setAdvAmount] = useState('');
  const [advPurpose, setAdvPurpose] = useState('');
  const [advBranchId, setAdvBranchId] = useState<number | ''>('');
  const [advBusy, setAdvBusy] = useState(false);

  // Modal Registrar Gasto de Sucursal (mismo flujo que el chofer en la app)
  const [gastoOpen, setGastoOpen] = useState(false);
  const [gastoWallet, setGastoWallet] = useState<Wallet | null>(null);
  const [gastoCategory, setGastoCategory] = useState<string>('combustible');
  const [gastoAmount, setGastoAmount] = useState('');
  const [gastoConcept, setGastoConcept] = useState('');
  const [gastoPhoto, setGastoPhoto] = useState<File | null>(null);
  const [gastoPhotoPreview, setGastoPhotoPreview] = useState<string | null>(null);
  const [gastoBusy, setGastoBusy] = useState(false);
  const gastoAmountRef = useRef<HTMLInputElement>(null);
  const gastoConceptRef = useRef<HTMLInputElement>(null);
  const gastoPhotoInputRef = useRef<HTMLInputElement>(null);

  // Modal Detalle de gasto + aprobación
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewMov, setReviewMov] = useState<Movement | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);

  // Modal Estado de cuenta / movimientos de wallet
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailWallet, setDetailWallet] = useState<Wallet | null>(null);
  const [detailMovs, setDetailMovs] = useState<Movement[]>([]);
  // Totales de todo el historial (del backend), no solo los movimientos cargados
  const [detailTotals, setDetailTotals] = useState<{ abono: number; cargo: number; count: number } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deletingMovId, setDeletingMovId] = useState<number | null>(null);
  const [cajaMxnBalance, setCajaMxnBalance] = useState<number | null>(null);
  // Filtro de fecha en estado de cuenta
  const [detailDateFrom, setDetailDateFrom] = useState<string>('');
  const [detailDateTo, setDetailDateTo] = useState<string>('');

  // Visor de foto de evidencia
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Edición de movimiento
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editConcept, setEditConcept] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDate, setEditDate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Modal Cerrar Ruta / Devolución de sobrante
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleDriver, setSettleDriver] = useState<Wallet | null>(null);
  const [settleCashReturned, setSettleCashReturned] = useState('');
  const [settleNotes, setSettleNotes] = useState('');
  const [settleBusy, setSettleBusy] = useState(false);

  // Toasts
  const [snack, setSnack] = useState<{ severity: 'success' | 'error'; msg: string } | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, bw, dw, pe, st, cc, rb] = await Promise.all([
        fetch(`${API_URL}/api/admin/petty-cash/stats`, { headers }).then(r => r.json()),
        fetch(`${API_URL}/api/admin/petty-cash/wallets?owner_type=branch`, { headers }).then(r => r.json()),
        fetch(`${API_URL}/api/admin/petty-cash/wallets?owner_type=driver`, { headers }).then(r => r.json()),
        fetch(`${API_URL}/api/admin/petty-cash/pending`, { headers }).then(r => r.json()),
        fetch(`${API_URL}/api/admin/petty-cash/settlements`, { headers }).then(r => r.json()),
        fetch(`${API_URL}/api/caja-chica/stats`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API_URL}/api/admin/petty-cash/route-blocks`, { headers }).then(r => r.ok ? r.json() : { blocks: [] }).catch(() => ({ blocks: [] })),
      ]);
      setStats(s);
      setBranchWallets(bw.wallets || []);
      setDriverWallets(dw.wallets || []);
      setPendingExpenses(pe.movements || []);
      setSettlements(st.settlements || []);
      setRouteBlocks(rb.blocks || []);
      if (cc) setCajaMxnBalance(parseFloat(cc.saldo_mxn ?? cc.saldo_actual ?? 0));
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
    setFundOrigin('');
    setFundOriginDetail('');
    setFundFxRate('');
    setFundSourceAmountMxn('');
    setFundFxProvider('');
    try {
      const r = await fetch(`${API_URL}/api/admin/petty-cash/branches`, { headers });
      const d = await r.json();
      setBranchesOpts(d.branches || []);
    } catch (e) { console.error(e); }
  };

  const selectedBranch = branchesOpts.find(b => b.id === Number(fundBranchId));
  const selectedCurrency = (selectedBranch?.currency || 'MXN').toUpperCase();
  const needsFx = selectedCurrency !== 'MXN';

  // Currency helpers for Anticipo and Gasto
  const advBranch = branchesOpts.find(b => b.id === Number(advBranchId));
  const advCurrency = (advBranch?.currency || 'MXN').toUpperCase();
  const gastoCurrency = (gastoWallet?.currency || 'MXN').toUpperCase();

  const handleFund = async () => {
    if (!fundBranchId || !fundAmount) return;
    if (needsFx && (!fundFxRate || !fundSourceAmountMxn)) {
      setSnack({ severity: 'error', msg: `Captura tipo de cambio y monto MXN egresado para ${selectedCurrency}` });
      return;
    }
    setFundBusy(true);
    try {
      const body: Record<string, unknown> = {
        branch_id: fundBranchId,
        amount_mxn: Number(fundAmount),
        concept: fundConcept || undefined,
        funds_origin: fundOrigin,
        funds_origin_detail: fundOrigin === 'otro' ? fundOriginDetail.trim() : undefined,
      };
      if (needsFx) {
        body.fx_rate = Number(fundFxRate);
        body.source_amount_mxn = Number(fundSourceAmountMxn);
        body.fx_provider = fundFxProvider.trim() || undefined;
      }
      const r = await fetch(`${API_URL}/api/admin/petty-cash/fund-branch`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
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
      const branches = b1.branches || [];
      setBranchesOpts(branches);
      // Si el usuario sólo tiene 1 sucursal asignada, fijarla por defecto y bloquear el campo.
      if (branches.length === 1) {
        setAdvBranchId(branches[0].id);
      }
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

  const openGastoDialog = (wallet: Wallet) => {
    setGastoWallet(wallet);
    setGastoCategory('combustible');
    setGastoAmount('');
    setGastoConcept('');
    setGastoPhoto(null);
    setGastoPhotoPreview(null);
    setGastoOpen(true);
  };

  const onGastoPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setGastoPhoto(f);
    if (gastoPhotoPreview) URL.revokeObjectURL(gastoPhotoPreview);
    setGastoPhotoPreview(f ? URL.createObjectURL(f) : null);
  };

  const submitGasto = async () => {
    const amount = Number(String(gastoAmount).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setSnack({ severity: 'error', msg: 'Monto inválido' });
      return;
    }
    if (!gastoPhoto) {
      setSnack({ severity: 'error', msg: 'Foto del ticket requerida' });
      return;
    }
    if (gastoCategory === 'impuestos_dhl' && !gastoConcept.trim()) {
      setSnack({ severity: 'error', msg: 'Guía DHL requerida' });
      return;
    }
    setGastoBusy(true);
    try {
      const form = new FormData();
      form.append('category', gastoCategory);
      form.append('amount_mxn', String(amount));
      if (gastoConcept) form.append('concept', gastoConcept);
      form.append('evidence', gastoPhoto);
      const r = await fetch(`${API_URL}/api/petty-cash/branch-expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setSnack({ severity: 'success', msg: 'Gasto registrado · pendiente de aprobación' });
        setGastoOpen(false);
        loadAll();
      } else {
        setSnack({ severity: 'error', msg: d.error || 'No se pudo registrar el gasto' });
      }
    } catch {
      setSnack({ severity: 'error', msg: 'Error de red' });
    } finally {
      setGastoBusy(false);
    }
  };

  const openWalletDetail = async (wallet: Wallet) => {
    setDetailWallet(wallet);
    setDetailMovs([]);
    setDetailTotals(null);
    setDetailDateFrom('');
    setDetailDateTo('');
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/petty-cash/wallets/${wallet.id}`, { headers });
      const d = await r.json();
      if (r.ok) {
        if (d.wallet) setDetailWallet(prev => ({ ...(prev as Wallet), ...d.wallet }));
        setDetailMovs(d.movements || []);
        setDetailTotals(d.totals || null);
      } else {
        setSnack({ severity: 'error', msg: d.error || 'Error al cargar movimientos' });
      }
    } catch {
      setSnack({ severity: 'error', msg: 'Error de red' });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDeleteMovement = async (movId: number) => {
    if (!window.confirm('¿Eliminar este movimiento? Esta acción revierte el saldo y no se puede deshacer.')) return;
    setDeletingMovId(movId);
    try {
      const r = await fetch(`${API_URL}/api/admin/petty-cash/movements/${movId}`, {
        method: 'DELETE', headers
      });
      const d = await r.json();
      if (r.ok) {
        setDetailMovs(prev => prev.filter(m => m.id !== movId));
        setSnack({ severity: 'success', msg: 'Movimiento eliminado' });
        // Actualizar saldo en detailWallet recargando el wallet
        if (detailWallet) {
          const wr = await fetch(`${API_URL}/api/admin/petty-cash/wallets/${detailWallet.id}`, { headers });
          const wd = await wr.json();
          if (wr.ok && wd.wallet) setDetailWallet(prev => ({ ...(prev as Wallet), ...wd.wallet }));
        }
        loadAll();
      } else {
        setSnack({ severity: 'error', msg: d.error || 'Error al eliminar' });
      }
    } catch {
      setSnack({ severity: 'error', msg: 'Error de red' });
    } finally {
      setDeletingMovId(null);
    }
  };

  const handleOpenEditMovement = (mov: Movement) => {
    if (isOperations) {
      const created = new Date(mov.created_at);
      const now = new Date();
      const isSameDay =
        created.getFullYear() === now.getFullYear() &&
        created.getMonth() === now.getMonth() &&
        created.getDate() === now.getDate();

      if (!isSameDay) {
        setSnack({ severity: 'error', msg: 'Operaciones solo puede editar movimientos creados el mismo día.' });
        return;
      }
    }

    setEditingMovement(mov);
    setEditAmount(String(mov.amount_mxn));
    setEditConcept(mov.concept || '');
    setEditCategory(mov.category || '');
    // Formato datetime-local: "YYYY-MM-DDTHH:mm"
    const d = new Date(mov.created_at);
    const pad = (n: number) => String(n).padStart(2, '0');
    setEditDate(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setEditDialogOpen(true);
  };

  const handleSaveEditMovement = async () => {
    if (!editingMovement) return;
    const amount = parseFloat(editAmount);
    if (isNaN(amount) || amount <= 0) {
      setSnack({ severity: 'error', msg: 'Monto inválido' });
      return;
    }
    setSavingEdit(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/petty-cash/movements/${editingMovement.id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_mxn: amount,
          concept: editConcept.trim() || null,
          category: editCategory.trim() || null,
          created_at: editDate ? new Date(editDate).toISOString() : undefined,
        }),
      });
      const d = await r.json();
      if (r.ok) {
        setDetailMovs(prev => prev.map(m => m.id === editingMovement.id
          ? { ...m, amount_mxn: amount, concept: editConcept.trim() || null, category: editCategory.trim() || null }
          : m
        ));
        setSnack({ severity: 'success', msg: 'Movimiento actualizado' });
        setEditDialogOpen(false);
        // Recargar wallet para actualizar saldo
        if (detailWallet) {
          const wr = await fetch(`${API_URL}/api/admin/petty-cash/wallets/${detailWallet.id}`, { headers });
          const wd = await wr.json();
          if (wr.ok && wd.wallet) setDetailWallet(prev => ({ ...(prev as Wallet), ...wd.wallet }));
        }
        loadAll();
      } else {
        setSnack({ severity: 'error', msg: d.error || 'Error al actualizar' });
      }
    } catch {
      setSnack({ severity: 'error', msg: 'Error de red' });
    } finally {
      setSavingEdit(false);
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

  const openSettleDialog = (w: Wallet) => {
    setSettleDriver(w);
    setSettleCashReturned('');
    setSettleNotes('');
    setSettleOpen(true);
  };

  const handleCloseRoute = async () => {
    if (!settleDriver) return;
    const cash = Number(settleCashReturned);
    if (!Number.isFinite(cash) || cash < 0) {
      setSnack({ severity: 'error', msg: 'Captura un monto válido (>= 0)' });
      return;
    }
    setSettleBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/petty-cash/route-settle`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_user_id: settleDriver.owner_id,
          cash_returned_mxn: cash,
          notes: settleNotes || null
        })
      });
      const d = await r.json();
      if (r.ok) {
        setSnack({ severity: 'success', msg: 'Ruta cerrada y devolución registrada' });
        setSettleOpen(false);
        loadAll();
      } else {
        setSnack({ severity: 'error', msg: d.error || 'Error al cerrar ruta' });
      }
    } catch {
      setSnack({ severity: 'error', msg: 'Error de red' });
    } finally {
      setSettleBusy(false);
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
            Fondeo, anticipos a choferes (vales digitales), captura de gastos y aprobaciones.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          {canFundBranch && (
            <Button variant="contained" color="primary" startIcon={<MoneyIcon />} onClick={openFundDialog}>
              Fondear Sucursal
            </Button>
          )}
          {/* Anticipo a Chofer: se gestiona desde la app móvil del chofer/sucursal */}
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadAll}>
            Actualizar
          </Button>
        </Box>
      </Box>

      {/* Stats */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
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
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
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
          {['super_admin', 'admin', 'director'].includes(currentUserRole) && (
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Card sx={{ borderLeft: '4px solid #F05A28' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <CajaCCIcon sx={{ fontSize: 36, color: '#F05A28' }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary">Saldo Caja CC</Typography>
                    <Typography variant="h5" fontWeight="bold" color="#F05A28">
                      {cajaMxnBalance !== null ? fmtMoney(cajaMxnBalance) : '—'}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          )}
          <Grid size={{ xs: 12, sm: 6, md: 6 }}>
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
          <Grid size={{ xs: 12, sm: 6, md: 6 }}>
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
          <Tab icon={<SettleIcon />} iconPosition="start" label={`Arqueos (${settlements.length})`} />
          {canSeeRouteBlocks && <Tab icon={<RouteBlockIcon />} iconPosition="start" label={`Bloques de Ruta (${routeBlocks.length})`} />}
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
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography fontWeight="bold">{w.owner_name}</Typography>
                          {w.owner_name === 'Centro CC' && (
                            <Chip
                              label="CAJA MARCEL"
                              size="small"
                              sx={{
                                bgcolor: '#F05A28',
                                color: 'white',
                                fontWeight: 600,
                                fontSize: 11
                              }}
                            />
                          )}
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          Sucursal · {w.status === 'active' ? '🟢 Activa' : `⚠️ ${w.status}`}
                        </Typography>
                        {w.ops_user_name && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            👤 {w.ops_user_name}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </Box>
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                    <Typography variant="caption" color="text.secondary">Saldo disponible</Typography>
                    <Chip
                      label={(w.currency || 'MXN').toUpperCase()}
                      size="small"
                      sx={{
                        fontSize: 10, fontWeight: 700, height: 18,
                        bgcolor: (w.currency || 'MXN').toUpperCase() === 'USD' ? '#1976D2' : '#2E7D32',
                        color: '#fff',
                      }}
                    />
                  </Box>
                  <Typography variant="h4" fontWeight="bold" color={Number(w.balance_mxn) > 0 ? 'success.main' : 'text.disabled'}>
                    {fmtMoney(w.balance_mxn, w.currency)}
                  </Typography>
                  <Tooltip
                    title="Suma de gastos aprobados desde el sábado más reciente (hora CDMX). Se reinicia automáticamente cada sábado a las 00:00."
                    arrow
                    placement="top"
                  >
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.5, cursor: 'help' }}>
                      <Typography variant="caption" color="text.secondary">
                        Gastado esta semana:
                      </Typography>
                      <Typography variant="body2" fontWeight={700} color="text.primary">
                        {fmtMoney(w.week_spent_mxn ?? 0, w.currency)}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10, ml: 'auto' }}>
                        reinicia sáb.
                      </Typography>
                    </Box>
                  </Tooltip>
                  <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                    <Button size="small" variant="contained" startIcon={<SendIcon />} onClick={() => {
                      setAdvBranchId(w.branch_id || '');
                      openAdvanceDialog();
                    }}>Anticipo</Button>
                    {!isDirector && (
                      <Button size="small" variant="contained" color="warning" startIcon={<ReceiptIcon />} onClick={() => openGastoDialog(w)}>
                        Registrar Gasto
                      </Button>
                    )}
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
                      {fmtMoney(w.balance_mxn, w.currency)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {Number(w.pending_to_verify_mxn) > 0 ? (
                      <Chip size="small" color="warning" label={fmtMoney(w.pending_to_verify_mxn, w.currency)} />
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
                  <TableCell align="center">
                    <Tooltip title="Cerrar ruta y registrar devolución de sobrante">
                      <span>
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => openSettleDialog(w)}
                          disabled={Number(w.balance_mxn) <= 0 && Number(w.pending_to_verify_mxn) <= 0}
                        >
                          <SettleIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {driverWallets.length === 0 && !loading && (
                <TableRow><TableCell colSpan={8} align="center">Sin choferes con wallet</TableCell></TableRow>
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
                      <Typography fontWeight="bold">{fmtMoney(m.amount_mxn, m.currency)}</Typography>
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

      {/* TAB: Arqueos / Cierres de ruta */}
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

      {/* TAB: Bloques de Ruta */}
      {tab === 4 && canSeeRouteBlocks && (
        <>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#111' }}>
                  {['ID', 'Monitorista', 'Estado', 'Contenedores', 'Total Gastos', 'Asignado/Cont.', 'Apertura', 'Cierre', 'Detalle'].map(h => (
                    <TableCell key={h} sx={{ color: '#fff', fontWeight: 700 }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {routeBlocks.map(b => {
                  const containers = Array.isArray(b.containers) ? b.containers : [];
                  const perCont = containers.length > 0 && b.total_allocated_mxn > 0
                    ? `$${(parseFloat(b.total_allocated_mxn) / containers.length).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`
                    : '—';
                  return (
                    <TableRow key={b.id} hover>
                      <TableCell>#{b.id}</TableCell>
                      <TableCell>{b.monitorista_name || '—'}</TableCell>
                      <TableCell>
                        <Chip size="small" label={b.status === 'finalized' ? 'Finalizado' : 'Abierto'}
                          color={b.status === 'finalized' ? 'success' : 'warning'} />
                        {b.pending_expense_count > 0 && (
                          <Chip size="small" label={`${b.pending_expense_count} pendientes`} color="error" sx={{ ml: 0.5 }} />
                        )}
                      </TableCell>
                      <TableCell>{containers.map((c: any) => c.container_number).join(', ') || '—'}</TableCell>
                      <TableCell>${parseFloat(b.total_expenses || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</TableCell>
                      <TableCell>{perCont}</TableCell>
                      <TableCell>{new Date(b.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                      <TableCell>{b.finalized_at ? new Date(b.finalized_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</TableCell>
                      <TableCell>
                        <Button size="small" variant="outlined" onClick={() => setSelectedBlock(b)}>Ver</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {routeBlocks.length === 0 && !loading && (
                  <TableRow><TableCell colSpan={9} align="center">Sin bloques de ruta</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Dialog detalle bloque */}
          <Dialog open={!!selectedBlock} onClose={() => setSelectedBlock(null)} maxWidth="md" fullWidth>
            {selectedBlock && (
              <>
                <DialogTitle sx={{ bgcolor: '#111', color: '#fff', display: 'flex', justifyContent: 'space-between' }}>
                  <span>🚛 Bloque #{selectedBlock.id} — {selectedBlock.monitorista_name || '—'}</span>
                  <Chip size="small" label={selectedBlock.status === 'finalized' ? 'Finalizado' : 'Abierto'}
                    color={selectedBlock.status === 'finalized' ? 'success' : 'warning'} />
                </DialogTitle>
                <DialogContent dividers>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
                    <Box><Typography variant="caption" color="text.secondary">Apertura</Typography>
                      <Typography fontWeight={600}>{new Date(selectedBlock.created_at).toLocaleString('es-MX')}</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">Cierre</Typography>
                      <Typography fontWeight={600}>{selectedBlock.finalized_at ? new Date(selectedBlock.finalized_at).toLocaleString('es-MX') : '—'}</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">Total gastos</Typography>
                      <Typography fontWeight={700} color="error.main">${parseFloat(selectedBlock.total_expenses || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">Total asignado</Typography>
                      <Typography fontWeight={700} color="success.main">${parseFloat(selectedBlock.total_allocated_mxn || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">Gastos registrados</Typography>
                      <Typography fontWeight={600}>{selectedBlock.expense_count}</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">Pendientes de aprobar</Typography>
                      <Typography fontWeight={600} color={selectedBlock.pending_expense_count > 0 ? 'error.main' : 'text.primary'}>{selectedBlock.pending_expense_count}</Typography></Box>
                  </Box>
                  <Typography variant="subtitle2" fontWeight={700} gutterBottom>Contenedores ({(selectedBlock.containers || []).length})</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                    {(selectedBlock.containers || []).map((c: any) => (
                      <Chip key={c.id} label={`${c.container_number}${c.bl_number ? ` · BL: ${c.bl_number}` : ''}`} size="small" variant="outlined" />
                    ))}
                    {(selectedBlock.containers || []).length === 0 && <Typography variant="body2" color="text.secondary">Sin contenedores</Typography>}
                  </Box>
                  {selectedBlock.notes && (
                    <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="caption" color="text.secondary">Notas</Typography>
                      <Typography variant="body2">{selectedBlock.notes}</Typography>
                    </Box>
                  )}
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setSelectedBlock(null)}>Cerrar</Button>
                </DialogActions>
              </>
            )}
          </Dialog>
        </>
      )}

      {/* Dialog: Fondear Sucursal */}
      <Dialog open={fundOpen} onClose={() => !fundBusy && setFundOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>💰 Fondear Caja Chica de Sucursal</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            {needsFx
              ? `Esta sucursal opera en ${selectedCurrency}. Caja CC egresará en MXN (compra de divisas) y entregará ${selectedCurrency} a la sucursal según el tipo de cambio.`
              : !fundOrigin || fundOrigin === 'caja_cc'
                ? 'Este movimiento se registrará como egreso en Caja CC y entrará al saldo de la sucursal.'
                : 'Como el origen no es Caja CC, se registrará automáticamente un ingreso (origen externo) y un egreso (fondeo) en Caja CC.'}
          </Alert>
          <TextField
            select fullWidth margin="normal" label="Sucursal"
            value={fundBranchId}
            onChange={e => setFundBranchId(Number(e.target.value))}
          >
            {branchesOpts
              .map(b => {
                const cur = (b.currency || 'MXN').toUpperCase();
                return (
                  <MenuItem key={b.id} value={b.id}>
                    {b.name} {cur !== 'MXN' ? `[${cur}] ` : ''}— saldo actual: {fmtMoney(b.balance_mxn, cur)}
                  </MenuItem>
                );
              })}
          </TextField>
          <TextField
            select fullWidth margin="normal" label="Origen de los fondos"
            value={fundOrigin}
            onChange={e => setFundOrigin(e.target.value as 'caja_cc' | 'otro' | '')}
          >
            <MenuItem value="" disabled><em>Selecciona origen</em></MenuItem>
            <MenuItem value="caja_cc">Caja CC</MenuItem>
            <MenuItem value="otro">Otro</MenuItem>
          </TextField>
          {fundOrigin === 'otro' && (
            <TextField
              fullWidth margin="normal" label="¿De dónde vienen los fondos?"
              placeholder="Ej. Depósito del director, venta de activo, etc."
              value={fundOriginDetail}
              onChange={e => setFundOriginDetail(e.target.value)}
            />
          )}
          <TextField
            fullWidth margin="normal"
            label={`Monto a entregar a sucursal (${selectedCurrency})`}
            type="number"
            value={fundAmount}
            onChange={e => {
              const v = e.target.value;
              setFundAmount(v);
              // Auto-cálculo del MXN egresado cuando ya hay tipo de cambio
              if (needsFx && fundFxRate && Number(v) > 0 && Number(fundFxRate) > 0) {
                setFundSourceAmountMxn((Number(v) * Number(fundFxRate)).toFixed(2));
              }
            }}
            InputProps={{ startAdornment: <InputAdornment position="start">{selectedCurrency === 'USD' ? 'US$' : '$'}</InputAdornment> }}
          />
          {needsFx && (
            <>
              <TextField
                fullWidth margin="normal"
                label={`Tipo de cambio (MXN por 1 ${selectedCurrency})`}
                type="number"
                value={fundFxRate}
                onChange={e => {
                  const v = e.target.value;
                  setFundFxRate(v);
                  if (fundAmount && Number(v) > 0) {
                    setFundSourceAmountMxn((Number(fundAmount) * Number(v)).toFixed(2));
                  }
                }}
                helperText="Tasa entregada por la casa de bolsa"
              />
              <TextField
                fullWidth margin="normal"
                label="Monto MXN egresado de Caja CC"
                type="number"
                value={fundSourceAmountMxn}
                onChange={e => setFundSourceAmountMxn(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                helperText={`Debe ser ≈ ${selectedCurrency} × tipo de cambio (tolerancia ±$1 MXN)`}
              />
              <TextField
                fullWidth margin="normal"
                label="Casa de bolsa / Proveedor (opcional)"
                placeholder="Ej. Intercam, Monex, Banco Base…"
                value={fundFxProvider}
                onChange={e => setFundFxProvider(e.target.value)}
              />
            </>
          )}
          <TextField
            fullWidth margin="normal" label="Concepto / Notas (opcional)"
            value={fundConcept} onChange={e => setFundConcept(e.target.value)}
            multiline rows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFundOpen(false)} disabled={fundBusy}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleFund}
            disabled={
              fundBusy || !fundBranchId || !fundOrigin || !fundAmount ||
              (fundOrigin === 'otro' && !fundOriginDetail.trim()) ||
              (needsFx && (!fundFxRate || !fundSourceAmountMxn))
            }
          >
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
          {branchesOpts.length > 0 && (
            <TextField
              select fullWidth margin="normal" label="Sucursal origen"
              value={advBranchId}
              onChange={e => setAdvBranchId(Number(e.target.value))}
              disabled={branchesOpts.length <= 1}
              helperText={branchesOpts.length <= 1 ? 'Asignada automáticamente por tu sucursal' : undefined}
            >
              {branchesOpts.map(b => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name} — saldo: {fmtMoney(b.balance_mxn, (b.currency || 'MXN').toUpperCase())}
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
            fullWidth margin="normal" label={`Monto (${advCurrency})`} type="number"
            value={advAmount} onChange={e => setAdvAmount(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start">{advCurrency === 'USD' ? 'US$' : '$'}</InputAdornment> }}
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

      {/* Dialog: Registrar Gasto de Sucursal (con foto de evidencia) */}
      <Dialog open={gastoOpen} onClose={() => !gastoBusy && setGastoOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>🧾 Registrar Gasto · {gastoWallet?.owner_name || 'Sucursal'}</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            El gasto se deduce de la wallet de la sucursal y queda <strong>pendiente de aprobación</strong>.
            Igual que un chofer en la app: requiere foto del ticket como evidencia.
          </Alert>
          <TextField
            select fullWidth margin="normal" label="Categoría"
            value={gastoCategory}
            onChange={e => {
              const v = e.target.value;
              setGastoCategory(v);
              if (v === 'impuestos_dhl') {
                setTimeout(() => gastoAmountRef.current?.focus(), 50);
              }
            }}
          >
            {Object.entries(CATEGORY_LABELS).map(([key, c]) => (
              <MenuItem key={key} value={key}>{c.icon} {c.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth margin="normal" label={`Monto (${gastoCurrency})`} type="number"
            value={gastoAmount}
            onChange={e => setGastoAmount(e.target.value)}
            inputRef={gastoAmountRef}
            onKeyDown={e => {
              if (e.key === 'Enter' && gastoCategory === 'impuestos_dhl' && gastoAmount) {
                e.preventDefault();
                gastoConceptRef.current?.focus();
              }
            }}
            InputProps={{ startAdornment: <InputAdornment position="start">{gastoCurrency === 'USD' ? 'US$' : '$'}</InputAdornment> }}
          />
          <TextField
            fullWidth margin="normal"
            label={gastoCategory === 'impuestos_dhl' ? 'Guía DHL (requerida)' : 'Concepto / descripción (opcional)'}
            value={gastoConcept}
            onChange={e => setGastoConcept(e.target.value)}
            placeholder={gastoCategory === 'impuestos_dhl' ? 'Ej. 1234567890' : 'ej. Tóner impresora, factura A1234'}
            required={gastoCategory === 'impuestos_dhl'}
            multiline={gastoCategory !== 'impuestos_dhl'}
            minRows={gastoCategory === 'impuestos_dhl' ? 1 : 2}
            inputRef={gastoConceptRef}
            onKeyDown={e => {
              if (e.key === 'Enter' && gastoCategory === 'impuestos_dhl' && gastoConcept.trim()) {
                e.preventDefault();
                gastoPhotoInputRef.current?.click();
              }
            }}
          />
          <Box sx={{ mt: 2 }}>
            <Button
              variant="outlined"
              component="label"
              startIcon={<PhotoCameraIcon />}
              fullWidth
            >
              {gastoPhoto ? 'Cambiar foto del ticket' : 'Foto del ticket (requerida)'}
              <input
                type="file"
                hidden
                accept="image/*"
                capture="environment"
                ref={gastoPhotoInputRef}
                onChange={onGastoPhotoChange}
              />
            </Button>
            {gastoPhotoPreview && (
              <Box
                component="img"
                src={gastoPhotoPreview}
                alt="ticket preview"
                sx={{ mt: 1, width: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 1, border: '1px solid #ddd' }}
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGastoOpen(false)} disabled={gastoBusy}>Cancelar</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={submitGasto}
            disabled={gastoBusy || !gastoAmount || !gastoPhoto || (gastoCategory === 'impuestos_dhl' && !gastoConcept.trim())}
            startIcon={gastoBusy ? <CircularProgress size={16} /> : <ReceiptIcon />}
          >
            {gastoBusy ? 'Guardando…' : 'Registrar Gasto'}
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
          {/* Filtro de fecha */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2, alignItems: 'center' }}>
            <TextField
              label="Desde"
              type="date"
              size="small"
              value={detailDateFrom}
              onChange={(e) => setDetailDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Hasta"
              type="date"
              size="small"
              value={detailDateTo}
              onChange={(e) => setDetailDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <Button
              size="small"
              variant="outlined"
              onClick={() => { setDetailDateFrom(''); setDetailDateTo(''); }}
              disabled={!detailDateFrom && !detailDateTo}
            >
              Limpiar
            </Button>
            {(detailDateFrom || detailDateTo) && (
              <Chip
                size="small"
                color="primary"
                label={`Filtrado: ${detailMovs.filter(m => {
                  const d = new Date(m.created_at);
                  if (detailDateFrom && d < new Date(detailDateFrom + 'T00:00:00')) return false;
                  if (detailDateTo && d > new Date(detailDateTo + 'T23:59:59')) return false;
                  return true;
                }).length} de ${detailMovs.length}`}
              />
            )}
          </Box>
          {detailWallet && (() => {
            // Solo movimientos propios de esta wallet afectan su balance.
            // (Para una sucursal, el endpoint también devuelve los gastos de sus
            //  choferes como informativos — esos NO afectan balance_mxn de la
            //  sucursal, el anticipo original ya descontó esos fondos.)
            const filteredForTotals = detailMovs.filter(m => {
              const d = new Date(m.created_at);
              if (detailDateFrom && d < new Date(detailDateFrom + 'T00:00:00')) return false;
              if (detailDateTo && d > new Date(detailDateTo + 'T23:59:59')) return false;
              return true;
            });
            // Totales de la ventana cargada (para cuando hay filtro de fecha activo).
            let winCargo = 0;
            let winAbono = 0;
            for (const m of filteredForTotals) {
              if (m.status !== 'approved' && m.status !== 'settled') continue;
              if (Number((m as any).wallet_id) !== Number((detailWallet as any).id)) continue;
              const meta = MOVEMENT_TYPE_META[m.movement_type] || { sign: 1 as const };
              const amt = Number(m.amount_mxn) || 0;
              if (meta.sign < 0) winCargo += amt;
              else winAbono += amt;
            }
            // Sin filtro de fecha usamos los totales de TODO el historial (backend);
            // con filtro, los de la ventana visible.
            const hasDateFilter = !!(detailDateFrom || detailDateTo);
            const totalAbono = !hasDateFilter && detailTotals ? detailTotals.abono : winAbono;
            const totalCargo = !hasDateFilter && detailTotals ? detailTotals.cargo : winCargo;
            const movCount = !hasDateFilter && detailTotals ? detailTotals.count : filteredForTotals.length;
            return (
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Saldo disponible</Typography>
                  <Typography variant="h5" fontWeight="bold" color="success.main">
                    {fmtMoney(detailWallet.balance_mxn, detailWallet.currency)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Movimientos</Typography>
                  <Typography variant="h5" fontWeight="bold">{movCount}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Total abono</Typography>
                  <Typography variant="h5" fontWeight="bold" sx={{ color: '#2E7D32' }}>
                    +{fmtMoney(totalAbono, detailWallet.currency)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Total cargo</Typography>
                  <Typography variant="h5" fontWeight="bold" sx={{ color: '#C62828' }}>
                    -{fmtMoney(totalCargo, detailWallet.currency)}
                  </Typography>
                </Box>
                {detailWallet.branch_name && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Sucursal</Typography>
                    <Typography variant="h6" fontWeight="bold">{detailWallet.branch_name}</Typography>
                  </Box>
                )}
              </Box>
            );
          })()}
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
                    {canEditWalletMovements && <TableCell align="center" />}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(() => {
                    // Aplicar filtro de fecha
                    const filteredMovs = detailMovs.filter(m => {
                      const d = new Date(m.created_at);
                      if (detailDateFrom && d < new Date(detailDateFrom + 'T00:00:00')) return false;
                      if (detailDateTo && d > new Date(detailDateTo + 'T23:59:59')) return false;
                      return true;
                    });
                    // Orden cronológico ascendente para el estado de cuenta
                    const ordered = [...filteredMovs].sort(
                      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    );
                    // Saldo por fila ANCLADO al balance real de la wallet (balance_mxn),
                    // no acumulado desde 0: el endpoint solo trae los últimos 300
                    // movimientos, así que partir de 0 ignoraría el historial previo y
                    // no cuadraría con el saldo disponible. Anclamos el movimiento más
                    // reciente al balance real y derivamos los anteriores restando su
                    // efecto hacia atrás. Solo los movimientos PROPIOS de esta wallet
                    // (por wallet_id, igual que los totales del encabezado) afectan el
                    // saldo; los gastos de choferes son de otra wallet (informativos).
                    const saldoById: Record<string | number, number | null> = {};
                    let bal = Number((detailWallet as any)?.balance_mxn) || 0;
                    for (let i = ordered.length - 1; i >= 0; i--) {
                      const mv = ordered[i];
                      const mMeta = MOVEMENT_TYPE_META[mv.movement_type] || { sign: 1 as const };
                      const mAmount = Number(mv.amount_mxn) || 0;
                      const mAffects = Number((mv as any).wallet_id) === Number((detailWallet as any)?.id)
                        && (mv.status === 'approved' || mv.status === 'settled');
                      if (mAffects) {
                        saldoById[mv.id] = bal;
                        bal -= mMeta.sign * mAmount;
                      } else {
                        saldoById[mv.id] = null;
                      }
                    }
                    // Mostrar los movimientos más recientes arriba
                    return [...ordered].reverse().map(m => {
                      const meta = MOVEMENT_TYPE_META[m.movement_type] || { label: m.movement_type, sign: 1 as const };
                      const amount = Number(m.amount_mxn) || 0;
                      const rowSaldo = saldoById[m.id];
                      // El anticipo refleja la firma del chofer: sin firmar queda Pendiente
                      let effStatus = m.status;
                      if (m.movement_type === 'advance' && m.advance_status) {
                        effStatus = m.advance_status === 'pending_acceptance' ? 'pending'
                          : m.advance_status === 'accepted' ? 'approved'
                          : m.advance_status === 'settled' ? 'settled' : m.status;
                      }
                      const st = STATUS_META[effStatus] || { label: effStatus, color: 'default' as const };
                      const cat = m.category ? (CATEGORY_LABELS[m.category] || { label: m.category, icon: '📝' }) : null;
                      const created = new Date(m.created_at);
                      const now = new Date();
                      const isSameDay =
                        created.getFullYear() === now.getFullYear() &&
                        created.getMonth() === now.getMonth() &&
                        created.getDate() === now.getDate();
                      const canEditThisMovement = isSuperAdmin || isAccountant || (isOperations && isSameDay);
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
                              <Typography color="error.main" fontWeight={600}>−{fmtMoney(amount, m.currency || detailWallet?.currency)}</Typography>
                            ) : '—'}
                          </TableCell>
                          <TableCell align="right">
                            {meta.sign > 0 ? (
                              <Typography color="success.main" fontWeight={600}>+{fmtMoney(amount, m.currency || detailWallet?.currency)}</Typography>
                            ) : '—'}
                          </TableCell>
                          <TableCell align="right">
                            {rowSaldo != null ? <Typography fontWeight="bold">{fmtMoney(rowSaldo, detailWallet?.currency)}</Typography> : '—'}
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
                          {canEditWalletMovements && (
                            <TableCell align="center">
                              <Tooltip title={canEditThisMovement ? 'Editar movimiento' : 'Operaciones: solo editable el mismo día de creación'}>
                                <span>
                                  <IconButton
                                    size="small"
                                    color="primary"
                                    disabled={!canEditThisMovement}
                                    onClick={() => handleOpenEditMovement(m)}
                                  >
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              {isSuperAdmin && (
                                <Tooltip title="Eliminar movimiento (solo super admin)">
                                  <span>
                                    <IconButton
                                      size="small"
                                      color="error"
                                      disabled={deletingMovId === m.id}
                                      onClick={() => handleDeleteMovement(m.id)}
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    });
                  })()}
                  {detailMovs.length === 0 && !detailLoading && (
                    <TableRow><TableCell colSpan={canEditWalletMovements ? 9 : 8} align="center">Sin movimientos registrados</TableCell></TableRow>
                  )}
                  {detailMovs.length > 0 && !detailLoading && (detailDateFrom || detailDateTo) && detailMovs.filter(m => {
                    const d = new Date(m.created_at);
                    if (detailDateFrom && d < new Date(detailDateFrom + 'T00:00:00')) return false;
                    if (detailDateTo && d > new Date(detailDateTo + 'T23:59:59')) return false;
                    return true;
                  }).length === 0 && (
                    <TableRow><TableCell colSpan={canEditWalletMovements ? 9 : 8} align="center">Sin movimientos en el rango de fechas seleccionado</TableCell></TableRow>
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

      {/* Diálogo de edición de movimiento */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>✏️ Editar movimiento</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Monto"
              type="number"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              fullWidth
              required
              inputProps={{ step: '0.01', min: '0' }}
              helperText="Ingresa el monto correcto"
            />
            <TextField
              label="Concepto"
              value={editConcept}
              onChange={(e) => setEditConcept(e.target.value)}
              fullWidth
              multiline
              rows={2}
              helperText="Describe el motivo del gasto"
            />
            <TextField
              label="Categoría"
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              fullWidth
              helperText="Ej: gasolina, mensajería, propina, etc."
            />
            <TextField
              label="Fecha y hora"
              type="datetime-local"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText="Solo super admin puede modificar la fecha"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} disabled={savingEdit}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveEditMovement}
            disabled={savingEdit}
          >
            {savingEdit ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Cerrar Ruta / Devolución de sobrante */}
      <Dialog open={settleOpen} onClose={() => !settleBusy && setSettleOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>🧾 Cerrar Ruta / Devolución de Sobrante</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Esta acción liquida todos los vales aceptados del chofer, suma sus gastos aprobados,
            registra el efectivo devuelto a la sucursal y reinicia el saldo del chofer.
          </Alert>
          {settleDriver && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2"><b>Chofer:</b> {settleDriver.owner_name}</Typography>
              <Typography variant="body2"><b>Sucursal:</b> {settleDriver.branch_name || '—'}</Typography>
              <Typography variant="body2"><b>Saldo actual:</b> {fmtMoney(settleDriver.balance_mxn, settleDriver.currency)}</Typography>
              <Typography variant="body2"><b>Por comprobar:</b> {fmtMoney(settleDriver.pending_to_verify_mxn, settleDriver.currency)}</Typography>
            </Box>
          )}
          <TextField
            label="Efectivo devuelto (MXN)"
            type="number"
            fullWidth
            value={settleCashReturned}
            onChange={(e) => setSettleCashReturned(e.target.value)}
            sx={{ mb: 2 }}
            InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
            helperText="Monto físico que el chofer entrega de regreso a caja. Si no devuelve nada, deja 0."
          />
          <TextField
            label="Notas (opcional)"
            fullWidth
            multiline
            rows={2}
            value={settleNotes}
            onChange={(e) => setSettleNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettleOpen(false)} disabled={settleBusy}>Cancelar</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleCloseRoute}
            disabled={settleBusy || settleCashReturned === ''}
            startIcon={settleBusy ? <CircularProgress size={16} /> : <SettleIcon />}
          >
            {settleBusy ? 'Cerrando...' : 'Cerrar ruta'}
          </Button>
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
