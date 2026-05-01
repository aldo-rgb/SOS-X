// ============================================================================
// EntangledPaymentRequest
// Componente cliente para crear y consultar solicitudes de pago a proveedores
// internacionales a través del motor ENTANGLED.
// Diseñado para insertarse como pestaña/sección sin afectar el resto del flow.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  InputAdornment,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DescriptionIcon from '@mui/icons-material/Description';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ContactsIcon from '@mui/icons-material/Contacts';
import DeleteIcon from '@mui/icons-material/Delete';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SecurityIcon from '@mui/icons-material/Security';
import BoltIcon from '@mui/icons-material/Bolt';
import PublicIcon from '@mui/icons-material/Public';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { useTranslation } from 'react-i18next';

/* ── X-Pay CSS keyframes injected once ── */
if (typeof document !== 'undefined' && !document.getElementById('xpay-epr-style')) {
  const s = document.createElement('style');
  s.id = 'xpay-epr-style';
  s.textContent = `
    @keyframes xpay-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(255,102,0,0)} 50%{box-shadow:0 0 28px 6px rgba(255,102,0,0.45)} }
    @keyframes xpay-breathe { 0%,100%{opacity:0.7} 50%{opacity:1} }
    @keyframes xpay-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }
  `;
  document.head.appendChild(s);
}
import axios from 'axios';
import EntangledSupplierForm, { EMPTY_SUPPLIER } from './EntangledSupplierForm';
import type { SupplierFormData } from './EntangledSupplierForm';

import { Checkbox, FormControlLabel, Divider, List, ListItem, ListItemText, ListItemSecondaryAction, RadioGroup, Radio, FormControl, Card, CardContent } from '@mui/material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ORANGE = '#FF6600';
const CHARCOAL = '#0a0a0c';
const BORDER = '#2A2A2A';
const RATE_HISTORY_KEY = 'xpay_rate_history';
const RATE_HISTORY_MAX = 288; // ~24h si se guarda cada 5 minutos
const PRICING_REFRESH_MS = 60 * 1000; // refresco de API para detectar movimiento
const XPAY_TIMEZONE = 'America/Monterrey';
const WORLD_MAP_BG = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600">
    <g fill="#AAB4C0" fill-opacity="0.34">
      <ellipse cx="155" cy="190" rx="95" ry="55"/>
      <ellipse cx="260" cy="180" rx="85" ry="48"/>
      <ellipse cx="318" cy="255" rx="52" ry="82"/>
      <ellipse cx="500" cy="175" rx="75" ry="45"/>
      <ellipse cx="580" cy="190" rx="105" ry="58"/>
      <ellipse cx="690" cy="180" rx="70" ry="44"/>
      <ellipse cx="770" cy="220" rx="135" ry="68"/>
      <ellipse cx="885" cy="245" rx="95" ry="62"/>
      <ellipse cx="965" cy="300" rx="60" ry="45"/>
      <ellipse cx="1010" cy="360" rx="78" ry="52"/>
    </g>
  </svg>`
)}`;

const buildSparklinePath = (values: number[], width = 240, height = 44, pad = 4) => {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = pad + (i * (width - pad * 2)) / Math.max(values.length - 1, 1);
      const y = height - pad - ((v - min) / span) * (height - pad * 2);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
};

interface EntangledRequest {
  id: number;
  entangled_transaccion_id: string | null;
  cf_rfc: string;
  cf_razon_social: string;
  cf_email: string;
  op_monto: string | number;
  op_divisa_destino: string;
  op_comprobante_cliente_url?: string;
  estatus_global: string;
  estatus_factura: string;
  estatus_proveedor: string;
  factura_url: string | null;
  factura_emitida_at: string | null;
  comprobante_proveedor_url: string | null;
  proveedor_pagado_at: string | null;
  payment_deadline_at?: string | null;
  cancellation_fee_usd?: number | string;
  created_at: string;
  updated_at: string;
}

const REGIMENES_FISCALES = [
  { value: '601', label: '601 - General de Ley Personas Morales' },
  { value: '603', label: '603 - Personas Morales con Fines no Lucrativos' },
  { value: '605', label: '605 - Sueldos y Salarios' },
  { value: '606', label: '606 - Arrendamiento' },
  { value: '612', label: '612 - Personas Físicas con Actividades Empresariales' },
  { value: '621', label: '621 - Incorporación Fiscal' },
  { value: '626', label: '626 - RESICO' },
  { value: '616', label: '616 - Sin obligaciones fiscales' },
];

const USOS_CFDI = [
  { value: 'G01', label: 'G01 - Adquisición de mercancías' },
  { value: 'G03', label: 'G03 - Gastos en general' },
  { value: 'P01', label: 'P01 - Por definir' },
  { value: 'I01', label: 'I01 - Construcciones' },
  { value: 'I02', label: 'I02 - Mobiliario y equipo' },
  { value: 'I04', label: 'I04 - Equipo de cómputo' },
  { value: 'I08', label: 'I08 - Otra maquinaria' },
];

const DIVISAS = ['USD', 'RMB'];

const parseApiDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const trimmed = String(s).trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized);
  const d = new Date(hasTimezone ? normalized : `${normalized}Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const formatDate = (s: string | null | undefined) => {
  const d = parseApiDate(s);
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: XPAY_TIMEZONE,
  }).format(d);
};

const formatDateObj = (d: Date | null | undefined) => {
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: XPAY_TIMEZONE,
  }).format(d);
};

const getPaymentDeadline = (createdAt: string | null | undefined): Date | null => {
  const created = parseApiDate(createdAt);
  if (!created) return null;
  return new Date(created.getTime() + 24 * 60 * 60 * 1000);
};
const formatMoney = (v: number | string) =>
  Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Soft fintech-style status badge — translucent fill + thin border
const STATUS_PALETTE: Record<string, { bg: string; bd: string; fg: string }> = {
  completado: { bg: 'rgba(16,185,129,0.12)', bd: 'rgba(16,185,129,0.45)', fg: '#34d399' },
  emitida:    { bg: 'rgba(16,185,129,0.12)', bd: 'rgba(16,185,129,0.45)', fg: '#34d399' },
  enviado:    { bg: 'rgba(59,130,246,0.12)', bd: 'rgba(59,130,246,0.45)', fg: '#60a5fa' },
  en_proceso: { bg: 'rgba(59,130,246,0.12)', bd: 'rgba(59,130,246,0.45)', fg: '#60a5fa' },
  pendiente:  { bg: 'rgba(156,163,175,0.10)', bd: 'rgba(156,163,175,0.35)', fg: '#d1d5db' },
  rechazado:  { bg: 'rgba(248,113,113,0.12)', bd: 'rgba(248,113,113,0.45)', fg: '#fca5a5' },
  error_envio:{ bg: 'rgba(248,113,113,0.14)', bd: 'rgba(248,113,113,0.5)',  fg: '#fca5a5' },
  cancelado:  { bg: 'rgba(251,146,60,0.16)', bd: 'rgba(251,146,60,0.45)',  fg: '#fdba74' },
};
const StatusBadge: React.FC<{ status: string; label: string; variant?: 'solid' | 'outline' }> = ({ status, label, variant = 'solid' }) => {
  const palette = STATUS_PALETTE[status] || { bg: 'rgba(156,163,175,0.08)', bd: 'rgba(156,163,175,0.3)', fg: '#9ca3af' };
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.7,
        bgcolor: variant === 'solid' ? palette.bg : 'transparent',
        border: `1px solid ${palette.bd}`,
        color: palette.fg,
        fontSize: '0.72rem',
        fontWeight: 600,
        letterSpacing: '0.02em',
        px: 1.2,
        py: 0.4,
        borderRadius: '999px',
        textTransform: 'capitalize',
        whiteSpace: 'nowrap',
      }}
    >
      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: palette.fg }} />
      {label.replace(/_/g, ' ')}
    </Box>
  );
};

interface Props {
  /** Cuando true, oculta el header del componente (útil si se mete dentro de otra página). */
  hideHeader?: boolean;
}

export default function EntangledPaymentRequest({ hideHeader = false }: Props) {
  const { t } = useTranslation();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const qsToken = new URLSearchParams(window.location.search).get('token') || '';
    const storedToken = localStorage.getItem('token') || '';
    const resolvedToken = qsToken || storedToken;
    if (qsToken && qsToken !== storedToken) {
      localStorage.setItem('token', qsToken);
      const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
      window.history.replaceState({}, '', cleanUrl);
    }
    return resolvedToken;
  }, []);
  const authHeader = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const [requests, setRequests] = useState<EntangledRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ----- Wizard / flujo v2 -----
  const [requiereFactura, setRequiereFactura] = useState(true);
  const [saveFiscalProfile, setSaveFiscalProfile] = useState(true);
  const [editingFiscalData, setEditingFiscalData] = useState(false);
  const [editingSupplierData, setEditingSupplierData] = useState(false);
  const [pricing, setPricing] = useState<{ tipo_cambio_usd: number; tipo_cambio_rmb: number; porcentaje_compra: number; costo_operacion_usd: number } | null>(null);
  type EntProviderPub = {
    id: number;
    name: string;
    code: string | null;
    tipo_cambio_usd: number | string;
    tipo_cambio_rmb: number | string;
    porcentaje_compra: number | string;
    costo_operacion_usd: number | string;
    bank_accounts: Array<{ currency: string; bank: string; holder: string; account: string; clabe: string; reference: string }>;
    is_default: boolean;
    sort_order: number;
  };
  type RateSnapshot = { t: number; usd_mxn: number; rmb_mxn: number };
  const [providers, setProviders] = useState<EntProviderPub[]>([]);
  const defaultProvider = providers.find(p => p.is_default) || providers[0] || null;
  const [rateHistory, setRateHistory] = useState<RateSnapshot[]>(() => {
    try {
      const raw = localStorage.getItem(RATE_HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(-RATE_HISTORY_MAX) : [];
    } catch {
      return [];
    }
  });
  const [selectedProviderId, setSelectedProviderId] = useState<number | ''>('');
  const [quote, setQuote] = useState<{ tipo_cambio: number; porcentaje_compra: number; costo_operacion_usd: number; monto_mxn_base: number; monto_mxn_comision: number; monto_mxn_costo_op: number; monto_mxn_total: number } | null>(null);
  const [lastCreated, setLastCreated] = useState<{ request: unknown; instrucciones_pago: unknown; quote: { tipo_cambio: number; porcentaje_compra: number; costo_operacion_usd: number; monto_mxn_base: number; monto_mxn_comision: number; monto_mxn_costo_op: number; monto_mxn_total: number } | null } | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  // ----- Proveedores de envío (beneficiarios) -----
  interface SavedSupplier extends SupplierFormData {
    id: number;
    is_favorite: boolean;
  }
  const [suppliers, setSuppliers] = useState<SavedSupplier[]>([]);
  const [supplierForm, setSupplierForm] = useState<SupplierFormData>(EMPTY_SUPPLIER);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | 'new'>('new');
  const [saveSupplierForLater, setSaveSupplierForLater] = useState(true);
  const [uploadingSupplier, setUploadingSupplier] = useState(false);
  const [suppliersDialogOpen, setSuppliersDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SavedSupplier | null>(null);
  const [savingSupplier, setSavingSupplier] = useState(false);

  const [form, setForm] = useState({
    rfc: '',
    razon_social: '',
    regimen_fiscal: '601',
    cp: '',
    uso_cfdi: 'G03',
    email: '',
    monto: '',
    divisa_destino: 'USD',
    conceptos: '',
    comprobante_cliente_url: '',
  });

  useEffect(() => {
    try {
      localStorage.setItem(RATE_HISTORY_KEY, JSON.stringify(rateHistory.slice(-RATE_HISTORY_MAX)));
    } catch {
      // noop (storage may fail on private mode)
    }
  }, [rateHistory]);

  const usdMxnSeries = useMemo(() => {
    const series = rateHistory.map((x) => Number(x.usd_mxn)).filter((x) => Number.isFinite(x));
    const fallback = defaultProvider ? Number(defaultProvider.tipo_cambio_usd) : NaN;
    if (series.length >= 2) return series.slice(-48);
    if (Number.isFinite(fallback)) return [fallback, fallback];
    return [0, 0];
  }, [rateHistory, defaultProvider]);

  const rmbMxnSeries = useMemo(() => {
    const series = rateHistory.map((x) => Number(x.rmb_mxn)).filter((x) => Number.isFinite(x));
    const fallback = defaultProvider ? Number(defaultProvider.tipo_cambio_rmb) : NaN;
    if (series.length >= 2) return series.slice(-48);
    if (Number.isFinite(fallback)) return [fallback, fallback];
    return [0, 0];
  }, [rateHistory, defaultProvider]);

  const usdMxnPath = useMemo(() => buildSparklinePath(usdMxnSeries), [usdMxnSeries]);
  const rmbMxnPath = useMemo(() => buildSparklinePath(rmbMxnSeries), [rmbMxnSeries]);

  const loadRequests = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/entangled/payment-requests/me`, {
        headers: authHeader,
      });
      setRequests(r.data || []);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [authHeader, token]);

  const loadSuppliers = useCallback(async () => {
    if (!token) return;
    try {
      const r = await axios.get(`${API_URL}/api/entangled/suppliers`, { headers: authHeader });
      setSuppliers(r.data || []);
    } catch (err: unknown) {
      console.error('[ENTANGLED] loadSuppliers:', err);
    }
  }, [authHeader, token]);

  const loadFiscalProfile = useCallback(async () => {
    if (!token) return;
    try {
      const r = await axios.get(`${API_URL}/api/entangled/fiscal-profile`, { headers: authHeader });
      const p = r.data;
      if (p) {
        setForm((prev) => ({
          ...prev,
          rfc: p.rfc || '',
          razon_social: p.razon_social || '',
          regimen_fiscal: p.regimen_fiscal || '601',
          cp: p.cp || '',
          uso_cfdi: p.uso_cfdi || 'G03',
          email: p.email || '',
        }));
      }
    } catch (err: unknown) {
      console.error('[ENTANGLED] loadFiscalProfile:', err);
    }
  }, [authHeader, token]);

  const loadPricing = useCallback(async () => {
    if (!token) return;
    try {
      const r = await axios.get(`${API_URL}/api/entangled/providers`, { headers: authHeader });
      const list: EntProviderPub[] = (r.data || []).map((p: EntProviderPub) => ({
        ...p,
        bank_accounts: Array.isArray(p.bank_accounts) ? p.bank_accounts : [],
      }));
      console.log('[ENTANGLED] Providers loaded:', list);
      setProviders(list);
      // Seleccionar default o el primero
      const def = list.find((x) => x.is_default) || list[0] || null;
      if (def) {
        console.log('[ENTANGLED] Default provider:', def, 'costo_operacion_usd:', def.costo_operacion_usd);
        const usd = Number(def.tipo_cambio_usd);
        const rmb = Number(def.tipo_cambio_rmb);
        setRateHistory((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          const now = Date.now();
          if (!last || last.usd_mxn !== usd || last.rmb_mxn !== rmb || now - last.t > 5 * 60 * 1000) {
            next.push({ t: now, usd_mxn: usd, rmb_mxn: rmb });
          }
          return next.slice(-RATE_HISTORY_MAX);
        });
        setSelectedProviderId((prev) => (prev ? prev : def.id));
        setPricing({
          tipo_cambio_usd: usd,
          tipo_cambio_rmb: rmb,
          porcentaje_compra: Number(def.porcentaje_compra),
          costo_operacion_usd: Number(def.costo_operacion_usd || 0),
        });
      }
    } catch (err: unknown) {
      console.error('[ENTANGLED] loadProviders:', err);
    }
  }, [authHeader, token]);

  useEffect(() => {
    loadRequests();
    loadSuppliers();
    loadFiscalProfile();
    loadPricing();
  }, [loadRequests, loadSuppliers, loadFiscalProfile, loadPricing]);

  // Mantener historial de tipo de cambio vivo sin requerir refresh manual
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => {
      loadPricing();
    }, PRICING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadPricing, token]);

  // Cuando cambia el selector de proveedor en el dialog
  const handlePickSupplier = (raw: string) => {
    const id: number | 'new' = raw === 'new' ? 'new' : Number(raw);
    setSelectedSupplierId(id);
    setEditingSupplierData(false);
    if (id === 'new') {
      setSupplierForm(EMPTY_SUPPLIER);
      setSaveSupplierForLater(true);
    } else {
      const s = suppliers.find((x) => x.id === id);
      if (s) {
        setSupplierForm({ ...EMPTY_SUPPLIER, ...s });
        setSaveSupplierForLater(false);
        if (s.divisa_default) setForm((p) => ({ ...p, divisa_destino: s.divisa_default }));
      }
    }
  };

  const handleUploadSupplierPhoto = async (file: File) => {
    setUploadingSupplier(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${API_URL}/api/uploads/evidence`, fd, {
        headers: { ...authHeader, 'Content-Type': 'multipart/form-data' },
      });
      setSupplierForm((p) => ({ ...p, foto_url: res.data.url }));
    } catch (err: unknown) {
      setSnack({
        open: true,
        severity: 'error',
        message: (err as { response?: { data?: { message?: string } } })?.response?.data?.message || t('entangled.messages.error'),
      });
    } finally {
      setUploadingSupplier(false);
    }
  };

  const persistSupplier = async (data: SupplierFormData): Promise<number | null> => {
    try {
      if (data.id) {
        const r = await axios.put(`${API_URL}/api/entangled/suppliers/${data.id}`, data, {
          headers: authHeader,
        });
        return r.data?.id ?? data.id;
      }
      const r = await axios.post(`${API_URL}/api/entangled/suppliers`, data, {
        headers: authHeader,
      });
      return r.data?.id ?? null;
    } catch (err) {
      console.error('[ENTANGLED] persistSupplier:', err);
      return null;
    }
  };

  const handleDeleteSupplier = async (id: number) => {
    if (!confirm(t('entangled.suppliers.confirmDelete', '¿Eliminar este proveedor?'))) return;
    try {
      await axios.delete(`${API_URL}/api/entangled/suppliers/${id}`, { headers: authHeader });
      await loadSuppliers();
    } catch {
      setSnack({ open: true, severity: 'error', message: t('entangled.messages.error') });
    }
  };

  const handleToggleFavorite = async (s: SavedSupplier) => {
    try {
      await axios.put(
        `${API_URL}/api/entangled/suppliers/${s.id}`,
        { ...s, is_favorite: !s.is_favorite },
        { headers: authHeader }
      );
      await loadSuppliers();
    } catch {
      // noop
    }
  };

  const openEditSupplier = (s: SavedSupplier | null) => {
    setEditingSupplier(s);
    if (s) setSupplierForm({ ...EMPTY_SUPPLIER, ...s });
    else setSupplierForm(EMPTY_SUPPLIER);
  };

  const handleSaveStandaloneSupplier = async () => {
    if (!supplierForm.nombre_beneficiario || !supplierForm.numero_cuenta || !supplierForm.banco_nombre) {
      setSnack({
        open: true,
        severity: 'error',
        message: t('entangled.suppliers.requiredFields', 'Completa beneficiario, número de cuenta y banco'),
      });
      return;
    }
    setSavingSupplier(true);
    const id = await persistSupplier({ ...supplierForm, ...(editingSupplier ? { id: editingSupplier.id } : {}) });
    setSavingSupplier(false);
    if (id) {
      setSnack({ open: true, severity: 'success', message: t('entangled.messages.success') });
      setEditingSupplier(null);
      setSupplierForm(EMPTY_SUPPLIER);
      loadSuppliers();
    } else {
      setSnack({ open: true, severity: 'error', message: t('entangled.messages.error') });
    }
  };

  // Subida diferida del comprobante a una solicitud existente
  const handleUploadProofToRequest = async (requestId: number, file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const upRes = await axios.post(`${API_URL}/api/uploads/evidence`, fd, {
        headers: { ...authHeader, 'Content-Type': 'multipart/form-data' },
      });
      await axios.post(
        `${API_URL}/api/entangled/payment-requests/${requestId}/upload-proof`,
        { comprobante_cliente_url: upRes.data.url },
        { headers: authHeader }
      );
      setSnack({ open: true, severity: 'success', message: t('entangled.actions.viewMyProof') });
      loadRequests();
    } catch (err: unknown) {
      setSnack({
        open: true,
        severity: 'error',
        message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('entangled.messages.error'),
      });
    } finally {
      setUploading(false);
    }
  };

  const validateForm = (): string | null => {
    if (requiereFactura) {
      if (!form.rfc || !form.razon_social || !form.cp || !form.email) return t('entangled.messages.requiredFields');
    }
    if (!form.monto || Number(form.monto) <= 0) return t('entangled.messages.requiredFields');
    if (!['USD', 'RMB'].includes(form.divisa_destino)) return t('entangled.messages.requiredFields');
    if (!supplierForm.nombre_beneficiario || !supplierForm.numero_cuenta || !supplierForm.banco_nombre) {
      return t('entangled.suppliers.requiredFields', 'Completa beneficiario, número de cuenta y banco del proveedor de envío');
    }
    if (form.divisa_destino === 'RMB' && !supplierForm.nombre_chino) {
      return t('entangled.suppliers.chineseRequired', 'Para envíos en RMB se requiere el nombre del beneficiario en chino');
    }
    return null;
  };

  // Recalcular quote cuando cambia monto, divisa o proveedor
  useEffect(() => {
    const prov = providers.find((p) => p.id === selectedProviderId);
    if (prov) {
      setPricing({
        tipo_cambio_usd: Number(prov.tipo_cambio_usd),
        tipo_cambio_rmb: Number(prov.tipo_cambio_rmb),
        porcentaje_compra: Number(prov.porcentaje_compra),
        costo_operacion_usd: Number(prov.costo_operacion_usd || 0),
      });
    }
  }, [selectedProviderId, providers]);

  // Recalcular quote cuando cambia monto o divisa
  useEffect(() => {
    const m = Number(form.monto);
    if (!pricing || !m || m <= 0) {
      setQuote(null);
      return;
    }
    const tc = form.divisa_destino === 'RMB' ? pricing.tipo_cambio_rmb : pricing.tipo_cambio_usd;
    const base = m * tc;
    const comision = base * (pricing.porcentaje_compra / 100);
    // Usar costo de operación del pricing (ya incluye override si existe)
    const costoOpUsd = pricing.costo_operacion_usd;
    const costoOpMxn = costoOpUsd * tc;
    const total = base + comision + costoOpMxn;
    console.log('[ENTANGLED] Quote calculation:', { pricing, costoOpUsd, costoOpMxn, total });
    setQuote({
      tipo_cambio: tc,
      porcentaje_compra: pricing.porcentaje_compra,
      costo_operacion_usd: costoOpUsd,
      monto_mxn_base: Number(base.toFixed(2)),
      monto_mxn_comision: Number(comision.toFixed(2)),
      monto_mxn_costo_op: Number(costoOpMxn.toFixed(2)),
      monto_mxn_total: Number(total.toFixed(2)),
    });
  }, [form.monto, form.divisa_destino, pricing, selectedProviderId, providers]);

  const handleSubmit = async () => {
    const err = validateForm();
    if (err) {
      setSnack({ open: true, severity: 'error', message: err });
      return;
    }
    setSubmitting(true);
    try {
      // Si pidió guardar perfil fiscal
      if (requiereFactura && saveFiscalProfile) {
        try {
          await axios.put(
            `${API_URL}/api/entangled/fiscal-profile`,
            {
              rfc: form.rfc.trim().toUpperCase(),
              razon_social: form.razon_social.trim(),
              regimen_fiscal: form.regimen_fiscal,
              cp: form.cp.trim(),
              uso_cfdi: form.uso_cfdi,
              email: form.email.trim(),
            },
            { headers: authHeader }
          );
        } catch (e) {
          console.warn('[ENTANGLED] No se pudo guardar perfil fiscal:', e);
        }
      }

      // Si pidió guardar el proveedor para reuso
      let supplierId: number | undefined = supplierForm.id;
      if (selectedSupplierId === 'new' && saveSupplierForLater) {
        const newId = await persistSupplier({ ...supplierForm, divisa_default: form.divisa_destino });
        if (newId) supplierId = newId;
      } else if (selectedSupplierId !== 'new') {
        supplierId = Number(selectedSupplierId);
      }

      const payload: Record<string, unknown> = {
        requiere_factura: requiereFactura,
        provider_id: selectedProviderId || null,
        operacion: {
          montos: Number(form.monto),
          divisa_destino: form.divisa_destino,
          conceptos: requiereFactura
            ? form.conceptos.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
        },
        proveedor_envio: {
          supplier_id: supplierId || null,
          nombre_beneficiario: supplierForm.nombre_beneficiario,
          nombre_chino: supplierForm.nombre_chino,
          direccion_beneficiario: supplierForm.direccion_beneficiario,
          numero_cuenta: supplierForm.numero_cuenta,
          iban: supplierForm.iban,
          banco_nombre: supplierForm.banco_nombre,
          banco_direccion: supplierForm.banco_direccion,
          swift_bic: supplierForm.swift_bic,
          aba_routing: supplierForm.aba_routing,
          motivo: supplierForm.motivo_default,
          foto_url: supplierForm.foto_url,
        },
      };
      if (requiereFactura) {
        payload.cliente_final = {
          rfc: form.rfc.trim().toUpperCase(),
          razon_social: form.razon_social.trim(),
          regimen_fiscal: form.regimen_fiscal,
          cp: form.cp.trim(),
          uso_cfdi: form.uso_cfdi,
          email: form.email.trim(),
        };
      }

      const res = await axios.post(`${API_URL}/api/entangled/payment-requests`, payload, {
        headers: authHeader,
      });
      setDialogOpen(false);
      setForm({
        rfc: '',
        razon_social: '',
        regimen_fiscal: '601',
        cp: '',
        uso_cfdi: 'G03',
        email: '',
        monto: '',
        divisa_destino: 'USD',
        conceptos: '',
        comprobante_cliente_url: '',
      });
      setSupplierForm(EMPTY_SUPPLIER);
      setSelectedSupplierId('new');
      setEditingFiscalData(false);
      setEditingSupplierData(false);
      setSaveSupplierForLater(true);
      // Mostrar instrucciones de pago
      setLastCreated({
        request: res.data?.request,
        instrucciones_pago: res.data?.instrucciones_pago,
        quote: res.data?.quote,
      });
      setInstructionsOpen(true);
      setSnack({
        open: true,
        severity: 'success',
        message:
          res.data?.request?.estatus_global === 'error_envio'
            ? t('entangled.messages.successPending')
            : t('entangled.messages.success'),
      });
      loadRequests();
      loadSuppliers();
      loadFiscalProfile();
    } catch (err: unknown) {
      setSnack({
        open: true,
        severity: 'error',
        message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('entangled.messages.error'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const validateWizardStep = (step: 1 | 2 | 3 | 4): string | null => {
    if (step === 1) {
      if (!selectedProviderId) return 'Selecciona un proveedor ENTANGLED';
      if (!form.monto || Number(form.monto) <= 0) return 'Captura un monto válido';
      if (!['USD', 'RMB'].includes(form.divisa_destino)) return 'Selecciona una divisa válida';
      if (!quote) return 'No se pudo calcular la cotización';
      return null;
    }
    if (step === 2) {
      if (!supplierForm.nombre_beneficiario || !supplierForm.numero_cuenta || !supplierForm.banco_nombre) {
        return t('entangled.suppliers.requiredFields', 'Completa beneficiario, número de cuenta y banco del proveedor de envío');
      }
      if (form.divisa_destino === 'RMB' && !supplierForm.nombre_chino) {
        return t('entangled.suppliers.chineseRequired', 'Para envíos en RMB se requiere el nombre del beneficiario en chino');
      }
      return null;
    }
    if (step === 3 && requiereFactura) {
      if (!form.rfc || !form.razon_social || !form.cp || !form.email) {
        return t('entangled.messages.requiredFields');
      }
    }
    return null;
  };

  const goNextWizardStep = () => {
    const err = validateWizardStep(wizardStep);
    if (err) {
      setSnack({ open: true, severity: 'error', message: err });
      return;
    }
    setWizardStep((s) => (s === 1 ? 2 : s === 2 ? 3 : s === 3 ? 4 : 4));
  };

  return (
    <Box sx={{ bgcolor: CHARCOAL, minHeight: '100vh', color: '#ffffff', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

      {/* ══════════════════════════════════════════════════
          X-Pay HERO BANNER
          ══════════════════════════════════════════════════ */}
      {!hideHeader && (
        <Box sx={{
          position: 'relative', overflow: 'hidden',
          background: `linear-gradient(135deg, #050505 0%, #0D0D0D 40%, #1a0800 100%)`,
          borderBottom: `1px solid ${BORDER}`,
        }}>
          {/* Radial glow */}
          <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `radial-gradient(ellipse 60% 80% at 70% 50%, rgba(255,102,0,0.08) 0%, transparent 70%)` }} />
          {/* Grid texture */}
          <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.04,
            backgroundImage: `repeating-linear-gradient(0deg,#fff 0px,#fff 1px,transparent 1px,transparent 40px),
              repeating-linear-gradient(90deg,#fff 0px,#fff 1px,transparent 1px,transparent 40px)` }} />
          {/* World map background */}
          <Box sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: 0.42,
            backgroundImage: `url(${WORLD_MAP_BG})`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center 46%',
            backgroundSize: { xs: '185% auto', md: '118% auto' },
            filter: 'contrast(1.2) brightness(1.08)',
          }} />

          {/* Top nav */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: { xs: 2, md: 4 }, pt: 2.5, pb: 2, position: 'relative', zIndex: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box component="img" src="/logo-completo-xpay-v2.png" alt="X-Pay"
                sx={{ width: { xs: 116, md: 142 }, height: { xs: 34, md: 40 }, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(255,102,0,0.35))', animation: 'xpay-breathe 3s ease-in-out infinite' }}
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Typography variant="caption" sx={{ color: '#666', letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '0.58rem' }}>
                  International Payment Gateway
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, px: 1.5, py: 0.5,
                bgcolor: 'rgba(74,222,128,0.1)', borderRadius: 10, border: '1px solid rgba(74,222,128,0.3)' }}>
                <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#4ade80', animation: 'xpay-dot 1.5s ease-in-out infinite' }} />
                <Typography variant="caption" sx={{ color: '#4ade80', fontWeight: 600, fontSize: '0.68rem' }}>
                  {t('xpay.gatewayActive', 'Gateway activo · SWIFT/BIC')}
                </Typography>
              </Box>
              <Tooltip title={t('xpay.refresh', 'Actualizar') as string}>
                <IconButton onClick={loadRequests} disabled={loading} size="small"
                  sx={{ color: ORANGE, bgcolor: 'rgba(255,102,0,0.1)', border: `1px solid rgba(255,102,0,0.25)`,
                    '&:hover': { bgcolor: 'rgba(255,102,0,0.2)' } }}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {/* Main hero content */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: { xs: 2, md: 4 }, py: 3,
            position: 'relative', zIndex: 2, gap: 3, flexWrap: 'wrap' }}>
            {/* Left: headline + actions */}
            <Box sx={{ flex: '0 0 auto', maxWidth: 520 }}>
              <Typography variant="h3" fontWeight={800} sx={{
                color: '#fff', lineHeight: 1.1, letterSpacing: '-1px',
                textShadow: `0 0 40px rgba(255,102,0,0.25)`, mb: 1,
                fontSize: { xs: '1.6rem', md: '2.4rem' },
              }}>
                ENVÍOS DE DINERO{' '}
                <Box component="span" sx={{ color: ORANGE }}>SEGUROS</Box>
                {' '}A CHINA Y ESTADOS UNIDOS.
              </Typography>
              <Typography variant="body2" sx={{ color: '#888', mb: 2.5, lineHeight: 1.6 }}>
                {t('xpay.howItWorksDesc', 'Complete sus datos fiscales y suba su comprobante bancario. Procesamos el pago internacional y generamos su factura oficial junto con la confirmación SWIFT/BIC para su registro contable.')}
              </Typography>
              {/* Feature pills */}
              <Box sx={{ display: 'flex', gap: 1.2, flexWrap: 'wrap', mb: 2.5 }}>
                {[
                  { icon: <SecurityIcon sx={{ fontSize: 13 }} />, label: 'SWIFT / BIC' },
                  { icon: <BoltIcon sx={{ fontSize: 13 }} />, label: 'Tiempo Real' },
                  { icon: <PublicIcon sx={{ fontSize: 13 }} />, label: 'USD · RMB · MXN' },
                  { icon: <ShieldOutlinedIcon sx={{ fontSize: 13 }} />, label: 'ISO 27001' },
                ].map((feat) => (
                  <Box key={feat.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.4, py: 0.4,
                    bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10 }}>
                    <Box sx={{ color: ORANGE }}>{feat.icon}</Box>
                    <Typography variant="caption" sx={{ color: '#ccc', fontWeight: 600, fontSize: '0.67rem', letterSpacing: '0.05em' }}>{feat.label}</Typography>
                  </Box>
                ))}
              </Box>
              {/* CTA buttons */}
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <Button variant="outlined" startIcon={<ContactsIcon />} onClick={() => setSuppliersDialogOpen(true)}
                  sx={{ borderColor: 'rgba(255,102,0,0.5)', color: ORANGE, fontWeight: 600, textTransform: 'none',
                    borderRadius: '10px', px: 2.5, '&:hover': { bgcolor: 'rgba(255,102,0,0.08)', borderColor: ORANGE } }}>
                  {t('entangled.suppliers.manage', 'Mis proveedores')}
                </Button>
                <Button
                  variant="contained"
                  startIcon={
                    <Box
                      component="img"
                      src="/logo-completo-xpay-v2.png"
                      alt="X-Pay"
                      sx={{ width: 92, height: 30, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.25))' }}
                      onError={(e: React.SyntheticEvent<HTMLImageElement>) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  }
                  onClick={() => setDialogOpen(true)}
                  sx={{
                    bgcolor: '#000',
                    background: '#000000 !important',
                    backgroundImage: 'none !important',
                    color: '#fff',
                    border: '1px solid #000000',
                    fontWeight: 700,
                    textTransform: 'none',
                    borderRadius: '999px',
                    px: 2,
                    minHeight: 46,
                    boxShadow: 'none',
                    animation: 'xpay-pulse 2.5s ease-in-out infinite',
                    '& .MuiButton-startIcon': { mr: 1 },
                    '&:hover': {
                      bgcolor: '#0f0f0f',
                      background: '#0f0f0f !important',
                      backgroundImage: 'none !important',
                      borderColor: '#050505',
                      boxShadow: 'none'
                    }
                  }}>
                  {t('entangled.newRequest', 'Nuevo envío')}
                </Button>
              </Box>
            </Box>

            {/* Right: Live rates card */}
            <Box sx={{ flex: '0 0 auto', minWidth: { xs: '100%', md: 300 },
              bgcolor: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`,
              borderRadius: 3, p: 2.5, backdropFilter: 'blur(8px)',
              boxShadow: `0 0 40px rgba(255,102,0,0.06)` }}>
              <Typography variant="caption" sx={{ color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, fontSize: '0.62rem' }}>
                Tipos de Cambio · En Vivo
              </Typography>
              {/* RMB → MXN */}
              <Box sx={{ mt: 1.5, mb: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <Typography variant="body2" fontWeight={700} sx={{ color: '#aaa', letterSpacing: '0.05em' }}>RMB → MXN</Typography>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="h6" fontWeight={800} sx={{ color: '#fff', lineHeight: 1 }}>
                      {defaultProvider ? Number(defaultProvider.tipo_cambio_rmb).toFixed(4) : '—'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#4ade80', fontWeight: 600, fontSize: '0.62rem' }}>▲ En vivo</Typography>
                  </Box>
                </Box>
                <Box sx={{ mt: 0.7, height: 44, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', px: 0.5 }}>
                  <svg width="100%" height="100%" viewBox="0 0 240 44" preserveAspectRatio="none">
                    <path d={rmbMxnPath} fill="none" stroke={ORANGE} strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                </Box>
              </Box>
              <Box sx={{ borderTop: `1px solid ${BORDER}`, pt: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <Typography variant="body2" fontWeight={700} sx={{ color: '#aaa', letterSpacing: '0.05em' }}>USD → MXN</Typography>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="h6" fontWeight={800} sx={{ color: '#fff', lineHeight: 1 }}>
                      {defaultProvider ? Number(defaultProvider.tipo_cambio_usd).toFixed(4) : '—'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#4ade80', fontWeight: 600, fontSize: '0.62rem' }}>▲ En vivo</Typography>
                  </Box>
                </Box>
                <Box sx={{ mt: 0.7, height: 44, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', px: 0.5 }}>
                  <svg width="100%" height="100%" viewBox="0 0 240 44" preserveAspectRatio="none">
                    <path d={usdMxnPath} fill="none" stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                </Box>
              </Box>
              {/* Security badges */}
              <Box sx={{ display: 'flex', gap: 1.5, mt: 2, pt: 1.5, borderTop: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
                {[
                  { Icon: ShieldOutlinedIcon, label: 'ISO 27001' },
                  { Icon: VerifiedUserOutlinedIcon, label: 'PCI-DSS' },
                  { Icon: LockOutlinedIcon, label: 'AES-256' },
                ].map(({ Icon, label }) => (
                  <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Icon sx={{ fontSize: 12, color: '#555' }} />
                    <Typography variant="caption" sx={{ color: '#555', fontSize: '0.6rem', fontWeight: 600 }}>{label}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>

          {/* Ticker bar */}
          <Box sx={{ borderTop: `1px solid ${BORDER}`, bgcolor: 'rgba(0,0,0,0.5)', px: { xs: 2, md: 4 }, py: 0.8, display: 'flex', gap: 4, overflowX: 'auto', flexWrap: 'nowrap' }}>
            {[
              { label: 'RMB/MXN', val: defaultProvider ? Number(defaultProvider.tipo_cambio_rmb).toFixed(4) : '—' },
              { label: 'USD/MXN', val: defaultProvider ? Number(defaultProvider.tipo_cambio_usd).toFixed(4) : '—' },
              { label: 'Solicitudes', val: requests.length },
              { label: 'Gateway', val: 'ENTANGLED' },
              { label: 'Red', val: 'SWIFT/BIC' },
            ].map((item) => (
              <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.8, whiteSpace: 'nowrap', flexShrink: 0 }}>
                <Typography variant="caption" sx={{ color: '#555', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</Typography>
                <Typography variant="caption" sx={{ color: '#4ade80', fontWeight: 700, fontSize: '0.73rem' }}>▲ {item.val}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Box sx={{ p: { xs: 2, md: 4 } }}>
      {/* Info box */}
      <Box sx={{ mb: 3, p: 2.5, borderRadius: '12px', bgcolor: 'rgba(255,255,255,0.02)',
        border: `1px solid rgba(255,102,0,0.25)`, display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        <Box sx={{ width: 32, height: 32, borderRadius: '50%', border: `1.5px solid ${ORANGE}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <InfoOutlinedIcon sx={{ color: ORANGE, fontSize: 18 }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ color: '#ffffff', fontWeight: 700, fontSize: '0.92rem', letterSpacing: '0.02em', mb: 0.4 }}>
            {t('entangled.howItWorks', '¿Cómo funciona?')}
          </Typography>
          <Typography sx={{ color: '#9ca3af', fontSize: '0.85rem', lineHeight: 1.55 }}>
            {t('xpay.howItWorksDesc', 'Complete sus datos fiscales y suba su comprobante bancario. Procesamos el pago internacional y generamos su factura oficial junto con la confirmación SWIFT/BIC para su registro contable.')}
          </Typography>
        </Box>
      </Box>

      <Paper variant="outlined" sx={{ bgcolor: '#0f0f12', border: `1px solid ${BORDER}`, borderRadius: '12px', mb: 3, overflow: 'hidden' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#08080a', borderBottom: `1px solid ${BORDER}` }}>
                <TableCell sx={{ color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.08em', borderBottom: 'none' }}>#</TableCell>
                <TableCell sx={{ color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.08em', borderBottom: 'none' }}>{t('entangled.fields.razonSocial')}</TableCell>
                <TableCell align="right" sx={{ color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.08em', borderBottom: 'none' }}>{t('entangled.fields.amount')}</TableCell>
                <TableCell sx={{ color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.08em', borderBottom: 'none' }}>{t('entangled.fields.currency')}</TableCell>
                <TableCell sx={{ color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.08em', borderBottom: 'none' }}>{t('entangled.status.global')}</TableCell>
                <TableCell sx={{ color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.08em', borderBottom: 'none' }}>{t('entangled.status.factura')}</TableCell>
                <TableCell sx={{ color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.08em', borderBottom: 'none' }}>{t('entangled.status.proveedor')}</TableCell>
                <TableCell align="center" sx={{ color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.08em', borderBottom: 'none' }}>{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ bgcolor: '#1a1a1a' }}>
                    <CircularProgress size={20} sx={{ color: ORANGE }} />
                  </TableCell>
                </TableRow>
              ) : requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ bgcolor: '#1a1a1a', py: 3 }}>
                    <Typography variant="body2" sx={{ color: '#666666' }}>
                      {t('entangled.messages.empty')}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((r) => {
                  const deadline = parseApiDate(r.payment_deadline_at) || getPaymentDeadline(r.created_at);
                  const isActiveForPayment = ['pendiente', 'en_proceso', 'error_envio'].includes(String(r.estatus_global || '').toLowerCase());
                  const cancellationFee = Number(r.cancellation_fee_usd || 0);
                  return (
                  <TableRow key={r.id} hover sx={{ bgcolor: 'transparent', '&:hover': { bgcolor: 'rgba(255,255,255,0.025)' }, borderBottom: `1px solid ${BORDER}`, '& td': { borderBottom: `1px solid ${BORDER}` } }}>
                    <TableCell sx={{ color: '#ffffff' }}>{r.id}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600} sx={{ color: '#ffffff' }}>
                        {r.cf_razon_social}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#888888' }}>
                        {r.cf_rfc}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ color: ORANGE, fontWeight: 600 }}>${formatMoney(r.op_monto)}</TableCell>
                    <TableCell sx={{ color: '#aaaaaa' }}>{r.op_divisa_destino}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.estatus_global} label={t(`entangled.status.${r.estatus_global}`, r.estatus_global)} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.estatus_factura} label={t(`entangled.status.${r.estatus_factura}`, r.estatus_factura)} variant="outline" />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.estatus_proveedor} label={t(`entangled.status.${r.estatus_proveedor}`, r.estatus_proveedor)} variant="outline" />
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        {r.factura_url && (
                          <Tooltip title={t('entangled.actions.viewInvoice') as string}>
                            <IconButton
                              size="small"
                              component="a"
                              href={r.factura_url}
                              target="_blank"
                              rel="noopener"
                            >
                              <DescriptionIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {r.comprobante_proveedor_url && (
                          <Tooltip title={t('entangled.actions.viewProof') as string}>
                            <IconButton
                              size="small"
                              color="success"
                              component="a"
                              href={r.comprobante_proveedor_url}
                              target="_blank"
                              rel="noopener"
                            >
                              <ReceiptLongIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {!r.op_comprobante_cliente_url && (
                          <Tooltip title={t('entangled.actions.uploadMyProof', 'Subir mi comprobante') as string}>
                            <IconButton
                              size="small"
                              component="label"
                              disabled={uploading}
                              sx={{ color: ORANGE }}
                            >
                              <ReceiptLongIcon fontSize="small" />
                              <input
                                hidden
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleUploadProofToRequest(r.id, f);
                                  e.target.value = '';
                                }}
                              />
                            </IconButton>
                          </Tooltip>
                        )}
                        {r.op_comprobante_cliente_url && (
                          <Tooltip title={t('entangled.actions.viewMyProof') as string}>
                            <IconButton
                              size="small"
                              component="a"
                              href={r.op_comprobante_cliente_url}
                              target="_blank"
                              rel="noopener"
                              sx={{ color: '#2e7d32' }}
                            >
                              <DescriptionIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                      {isActiveForPayment && (
                        <Stack direction="row" spacing={0.6} alignItems="center" justifyContent="center" sx={{ mt: 0.5 }}>
                          <AccessTimeIcon sx={{ fontSize: 13, color: '#fbbf24' }} />
                          <Typography variant="caption" sx={{ color: '#fbbf24', fontWeight: 700, fontSize: '0.68rem' }}>
                            {`Se cancela: ${formatDateObj(deadline)}`}
                          </Typography>
                        </Stack>
                      )}
                      {String(r.estatus_global || '').toLowerCase() === 'cancelado' && cancellationFee > 0 && (
                        <Typography variant="caption" sx={{ color: '#fdba74', fontWeight: 700, display: 'block', mt: 0.4 }}>
                          Cancelación: ${formatMoney(cancellationFee)} USD
                        </Typography>
                      )}
                      <Typography variant="caption" sx={{ color: '#6b7280' }} display="block">
                        {formatDate(r.created_at)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )})
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Footer de seguridad: certificaciones financieras */}
      <Box
        sx={{
          mt: 4,
          pt: 3,
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: { xs: 2, md: 4 },
        }}
      >
        {[
          { Icon: ShieldOutlinedIcon, label: 'ISO 27001', sub: t('xpay.certIsoSub', 'Certified') as string },
          { Icon: VerifiedUserOutlinedIcon, label: 'PCI-DSS', sub: t('xpay.certPciSub', 'Compliant') as string },
          { Icon: LockOutlinedIcon, label: 'AES-256', sub: t('xpay.certAesSub', 'Bank-level Encryption') as string },
          { Icon: AccountBalanceWalletOutlinedIcon, label: 'SWIFT/BIC', sub: t('xpay.certSwiftSub', 'Network Verified') as string },
        ].map(({ Icon, label, sub }) => (
          <Stack key={label} direction="row" spacing={1.2} alignItems="center" sx={{ opacity: 0.55, transition: 'opacity 0.2s', '&:hover': { opacity: 1 } }}>
            <Icon sx={{ color: '#9ca3af', fontSize: 22 }} />
            <Box>
              <Typography sx={{ color: '#e5e7eb', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1.1 }}>
                {label}
              </Typography>
              <Typography sx={{ color: '#6b7280', fontSize: '0.68rem', letterSpacing: '0.04em', lineHeight: 1.1 }}>
                {sub}
              </Typography>
            </Box>
          </Stack>
        ))}
      </Box>
      <Typography sx={{ mt: 2, color: '#4b5563', fontSize: '0.7rem', textAlign: 'center', letterSpacing: '0.04em' }}>
        {t('xpay.footerCopyright', { year: new Date().getFullYear() })}
      </Typography>

      {/* Dialog: nueva solicitud — formulario completo en una sola pantalla */}
      <Dialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setWizardStep(1);
        }}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: '#0a0a0c',
            color: '#fff',
            border: `1px solid ${BORDER}`,
            borderRadius: 2,
            backgroundImage: 'linear-gradient(180deg, rgba(255,102,0,0.06) 0%, rgba(0,0,0,0) 22%)',
          },
        }}
      >
        <DialogTitle sx={{ bgcolor: ORANGE, color: 'white', fontWeight: 800 }}>
          {t('entangled.newRequest')}
        </DialogTitle>
        <DialogContent sx={{ pt: 3, bgcolor: '#0a0a0c' }}>
          <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {[
              { id: 1 as const, label: '1. Moneda y monto' },
              { id: 2 as const, label: '2. Beneficiario' },
              { id: 3 as const, label: '3. Factura' },
              { id: 4 as const, label: '4. Resumen' },
            ].map((s) => (
              <Box
                key={s.id}
                sx={{
                  px: 1.5,
                  py: 0.6,
                  borderRadius: 10,
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  border: '1px solid',
                  borderColor: wizardStep === s.id ? ORANGE : '#2f2f33',
                  color: wizardStep === s.id ? '#fff' : '#9ca3af',
                  bgcolor: wizardStep === s.id ? 'rgba(240,90,40,0.26)' : '#121214',
                  cursor: 'pointer',
                }}
                onClick={() => setWizardStep(s.id)}
              >
                {s.label}
              </Box>
            ))}
          </Box>

          {wizardStep === 1 && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: '#1a1a1a', border: '1px solid #333333', borderRadius: 1 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2, color: '#ffffff' }}>
              💵 {t('entangled.sections.operation')}
            </Typography>

            {selectedProviderId && providers.find((p) => p.id === selectedProviderId) && (
              <Card sx={{ mb: 2, bgcolor: '#1a1a1a', border: `1px solid ${ORANGE}` }}>
                <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mb: 1 }}>
                    <CheckCircleIcon sx={{ color: ORANGE, fontSize: 18 }} />
                    <Typography variant="subtitle2" fontWeight={700} sx={{ color: ORANGE }}>
                      Proveedor de pago seleccionado
                    </Typography>
                  </Stack>
                  <Stack spacing={0.5}>
                    <Typography variant="body2" sx={{ color: '#ffffff' }}>
                      <strong>Proveedor:</strong> {providers.find((p) => p.id === selectedProviderId)?.name}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#ffffff' }}>
                      <strong>TC USD:</strong> <span style={{ color: ORANGE, fontWeight: 600 }}>${Number(providers.find((p) => p.id === selectedProviderId)?.tipo_cambio_usd).toFixed(4)}</span> MXN
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#ffffff' }}>
                      <strong>Comisión:</strong> <span style={{ color: ORANGE, fontWeight: 600 }}>{Number(providers.find((p) => p.id === selectedProviderId)?.porcentaje_compra).toFixed(2)}%</span>
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            )}

            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <TextField
                  select fullWidth label="Proveedor ENTANGLED"
                  value={selectedProviderId === '' ? '' : String(selectedProviderId)}
                  onChange={(e) => setSelectedProviderId(e.target.value ? Number(e.target.value) : '')}
                  required
                  helperText={
                    providers.length === 0
                      ? 'No hay proveedores activos configurados'
                      : 'Cada proveedor tiene su propio TC y % de compra'
                  }
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      color: '#ffffff',
                      backgroundColor: '#0a0a0a',
                      '& fieldset': { borderColor: '#333333' },
                      '&:hover fieldset': { borderColor: '#555555' },
                      '&.Mui-focused fieldset': { borderColor: ORANGE },
                    },
                    '& .MuiInputLabel-root': { color: '#888888' },
                    '& .MuiInputLabel-root.Mui-focused': { color: ORANGE },
                    '& .MuiOutlinedInput-input': { color: '#ffffff' },
                    '& .MuiSvgIcon-root': { color: ORANGE },
                    '& .MuiFormHelperText-root': { color: '#666666' },
                  }}
                >
                  {providers.map((p) => (
                    <MenuItem key={p.id} value={String(p.id)}>
                      {p.name}{p.is_default ? ' · default' : ''} — TC USD ${Number(p.tipo_cambio_usd).toFixed(2)} / TC RMB ${Number(p.tipo_cambio_rmb).toFixed(2)} / {Number(p.porcentaje_compra).toFixed(2)}%
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth type="number" label={t('entangled.fields.amount')}
                  value={form.monto}
                  onChange={(e) => setForm({ ...form, monto: e.target.value })}
                  inputProps={{ min: 0, step: '0.01' }}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
                  required
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      color: '#ffffff',
                      backgroundColor: '#0a0a0a',
                      '& fieldset': { borderColor: '#333333' },
                      '&:hover fieldset': { borderColor: '#555555' },
                      '&.Mui-focused fieldset': { borderColor: ORANGE },
                    },
                    '& .MuiInputLabel-root': { color: '#888888' },
                    '& .MuiInputLabel-root.Mui-focused': { color: ORANGE },
                    '& .MuiOutlinedInput-input': { color: '#ffffff' },
                    '& .MuiInputAdornment-root': { color: '#888888' },
                  }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  select fullWidth label={t('entangled.fields.currency')}
                  value={form.divisa_destino}
                  onChange={(e) => setForm({ ...form, divisa_destino: e.target.value })}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      color: '#ffffff',
                      backgroundColor: '#0a0a0a',
                      '& fieldset': { borderColor: '#333333' },
                      '&:hover fieldset': { borderColor: '#555555' },
                      '&.Mui-focused fieldset': { borderColor: ORANGE },
                    },
                    '& .MuiInputLabel-root': { color: '#888888' },
                    '& .MuiInputLabel-root.Mui-focused': { color: ORANGE },
                    '& .MuiOutlinedInput-input': { color: '#ffffff' },
                    '& .MuiSvgIcon-root': { color: ORANGE },
                  }}
                >
                  {DIVISAS.map((d) => (
                    <MenuItem key={d} value={d}>{d}</MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>

            {quote && (
              <Card sx={{ mt: 2, bgcolor: '#1a1a1a', border: `1px solid ${ORANGE}` }}>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: ORANGE, mb: 1 }}>
                    {t('entangled.wizard.quote', 'Cotización')}
                  </Typography>
                  <Stack spacing={0.5}>
                    <Typography variant="body2" sx={{ color: '#ffffff' }}>
                      {t('entangled.wizard.amountSent', 'Monto a enviar al proveedor')}: <strong>{formatMoney(form.monto)} {form.divisa_destino}</strong>
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#ffffff' }}>
                      {t('entangled.wizard.fxRate', 'Tipo de cambio')}: <strong>${quote.tipo_cambio.toFixed(4)} MXN / {form.divisa_destino}</strong>
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#ffffff' }}>
                      {t('entangled.wizard.totalToPay', 'Total a pagar a XOX')}: <strong style={{ color: ORANGE }}>${formatMoney(quote.monto_mxn_total)} MXN</strong>
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            )}
          </Paper>
          )}

          {wizardStep === 3 && (
          <>
          {/* === ¿Requiere factura? === */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: '#1a1a1a', border: '1px solid #333333', borderRadius: 1 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, color: '#ffffff' }}>
              🧾 {t('entangled.wizard.invoiceQuestion', '¿Necesitas factura para este pago?')}
            </Typography>
            <FormControl>
              <RadioGroup
                row
                value={requiereFactura ? 'yes' : 'no'}
                onChange={(e) => setRequiereFactura(e.target.value === 'yes')}
              >
                <FormControlLabel
                  value="yes"
                  control={<Radio sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }} />}
                  sx={{ color: '#ffffff' }}
                  label={t('entangled.wizard.invoiceYes', 'Sí, quiero factura (CFDI)')}
                />
                <FormControlLabel
                  value="no"
                  control={<Radio sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }} />}
                  sx={{ color: '#ffffff' }}
                  label={t('entangled.wizard.invoiceNo', 'No, sin factura')}
                />
              </RadioGroup>
            </FormControl>
          </Paper>
          </>
          )}

          {/* === Datos fiscales (solo si requiere factura) === */}
          {wizardStep === 3 && requiereFactura && (
            <>
              {/* Mostrar datos precargados si existen */}
              {form.rfc && form.razon_social && !editingFiscalData && (
                <Card sx={{ mb: 2, bgcolor: '#1a1a1a', border: `1px solid ${ORANGE}` }}>
                  <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                    <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mb: 1 }}>
                      <CheckCircleIcon sx={{ color: ORANGE, fontSize: 18 }} />
                      <Typography variant="subtitle2" fontWeight={700} sx={{ color: ORANGE }}>
                        Datos fiscales cargados
                      </Typography>
                    </Stack>
                    <Stack spacing={0.5}>
                      <Typography variant="body2" sx={{ color: '#ffffff' }}>
                        <strong>Razón Social:</strong> {form.razon_social}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#ffffff' }}>
                        <strong>RFC:</strong> {form.rfc}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#ffffff' }}>
                        <strong>C.P. Fiscal:</strong> {form.cp}
                      </Typography>
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => setEditingFiscalData(true)}
                        sx={{ color: ORANGE, justifyContent: 'flex-start', mt: 1, '&:hover': { bgcolor: 'rgba(240, 90, 40, 0.1)' } }}
                      >
                        ✏️ Editar datos fiscales
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              )}
              
              {(!form.rfc || !form.razon_social || editingFiscalData) && (
              <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: '#1a1a1a', border: '1px solid #333333', borderRadius: 1 }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2, color: '#ffffff' }}>
                  📋 {t('entangled.sections.fiscal')}
                </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    fullWidth label={t('entangled.fields.rfc')} value={form.rfc}
                    onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })}
                    inputProps={{ maxLength: 13 }} required
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        color: '#ffffff',
                        backgroundColor: '#0a0a0a',
                        '& fieldset': { borderColor: '#333333' },
                        '&:hover fieldset': { borderColor: '#555555' },
                        '&.Mui-focused fieldset': { borderColor: ORANGE },
                      },
                      '& .MuiInputBase-input::placeholder': { color: '#666666', opacity: 0.7 },
                      '& .MuiInputLabel-root': { color: '#888888' },
                      '& .MuiInputLabel-root.Mui-focused': { color: ORANGE },
                      '& .MuiOutlinedInput-input': { color: '#ffffff' },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 8 }}>
                  <TextField
                    fullWidth label={t('entangled.fields.razonSocial')} value={form.razon_social}
                    onChange={(e) => setForm({ ...form, razon_social: e.target.value })} required
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        color: '#ffffff',
                        backgroundColor: '#0a0a0a',
                        '& fieldset': { borderColor: '#333333' },
                        '&:hover fieldset': { borderColor: '#555555' },
                        '&.Mui-focused fieldset': { borderColor: ORANGE },
                      },
                      '& .MuiInputBase-input::placeholder': { color: '#666666', opacity: 0.7 },
                      '& .MuiInputLabel-root': { color: '#888888' },
                      '& .MuiInputLabel-root.Mui-focused': { color: ORANGE },
                      '& .MuiOutlinedInput-input': { color: '#ffffff' },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    select fullWidth label={t('entangled.fields.regimenFiscal')}
                    value={form.regimen_fiscal}
                    onChange={(e) => setForm({ ...form, regimen_fiscal: e.target.value })} required
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        color: '#ffffff',
                        backgroundColor: '#0a0a0a',
                        '& fieldset': { borderColor: '#333333' },
                        '&:hover fieldset': { borderColor: '#555555' },
                        '&.Mui-focused fieldset': { borderColor: ORANGE },
                      },
                      '& .MuiInputLabel-root': { color: '#888888' },
                      '& .MuiInputLabel-root.Mui-focused': { color: ORANGE },
                      '& .MuiOutlinedInput-input': { color: '#ffffff' },
                      '& .MuiSvgIcon-root': { color: ORANGE },
                    }}
                  >
                    {REGIMENES_FISCALES.map((o) => {
                      const [code, desc] = o.label.split(' - ');
                      return (
                        <MenuItem key={o.value} value={o.value}>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                            <Typography variant="body2" fontWeight={600}>{code}</Typography>
                            <Typography variant="caption" color="text.secondary">{desc}</Typography>
                          </Box>
                        </MenuItem>
                      );
                    })}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <TextField
                    fullWidth label={t('entangled.fields.cp')} value={form.cp}
                    onChange={(e) => setForm({ ...form, cp: e.target.value.replace(/\D/g, '') })}
                    inputProps={{ maxLength: 5 }} required
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        color: '#ffffff',
                        backgroundColor: '#0a0a0a',
                        '& fieldset': { borderColor: '#333333' },
                        '&:hover fieldset': { borderColor: '#555555' },
                        '&.Mui-focused fieldset': { borderColor: ORANGE },
                      },
                      '& .MuiInputBase-input::placeholder': { color: '#666666', opacity: 0.7 },
                      '& .MuiInputLabel-root': { color: '#888888' },
                      '& .MuiInputLabel-root.Mui-focused': { color: ORANGE },
                      '& .MuiOutlinedInput-input': { color: '#ffffff' },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <TextField
                    select fullWidth label={t('entangled.fields.usoCfdi')}
                    value={form.uso_cfdi}
                    onChange={(e) => setForm({ ...form, uso_cfdi: e.target.value })} required
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        color: '#ffffff',
                        backgroundColor: '#0a0a0a',
                        '& fieldset': { borderColor: '#333333' },
                        '&:hover fieldset': { borderColor: '#555555' },
                        '&.Mui-focused fieldset': { borderColor: ORANGE },
                      },
                      '& .MuiInputLabel-root': { color: '#888888' },
                      '& .MuiInputLabel-root.Mui-focused': { color: ORANGE },
                      '& .MuiOutlinedInput-input': { color: '#ffffff' },
                      '& .MuiSvgIcon-root': { color: ORANGE },
                    }}
                  >
                    {USOS_CFDI.map((o) => {
                      const [code, desc] = o.label.split(' - ');
                      return (
                        <MenuItem key={o.value} value={o.value}>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                            <Typography variant="body2" fontWeight={600}>{code}</Typography>
                            <Typography variant="caption" color="text.secondary">{desc}</Typography>
                          </Box>
                        </MenuItem>
                      );
                    })}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth type="email" label={t('entangled.fields.email')} value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} required
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        color: '#ffffff',
                        backgroundColor: '#0a0a0a',
                        '& fieldset': { borderColor: '#333333' },
                        '&:hover fieldset': { borderColor: '#555555' },
                        '&.Mui-focused fieldset': { borderColor: ORANGE },
                      },
                      '& .MuiInputBase-input::placeholder': { color: '#666666', opacity: 0.7 },
                      '& .MuiInputLabel-root': { color: '#888888' },
                      '& .MuiInputLabel-root.Mui-focused': { color: ORANGE },
                      '& .MuiOutlinedInput-input': { color: '#ffffff' },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth label={t('entangled.fields.concepts')} value={form.conceptos}
                    onChange={(e) => setForm({ ...form, conceptos: e.target.value })}
                    placeholder="84111506, 90121800"
                    helperText={t('entangled.fields.conceptsHelp', 'Códigos SAT separados por coma (opcional)')}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        color: '#ffffff',
                        backgroundColor: '#0a0a0a',
                        '& fieldset': { borderColor: '#333333' },
                        '&:hover fieldset': { borderColor: '#555555' },
                        '&.Mui-focused fieldset': { borderColor: ORANGE },
                      },
                      '& .MuiInputBase-input::placeholder': { color: '#666666', opacity: 0.7 },
                      '& .MuiInputLabel-root': { color: '#888888' },
                      '& .MuiInputLabel-root.Mui-focused': { color: ORANGE },
                      '& .MuiOutlinedInput-input': { color: '#ffffff' },
                      '& .MuiFormHelperText-root': { color: '#666666' },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={saveFiscalProfile}
                        onChange={(e) => setSaveFiscalProfile(e.target.checked)}
                        sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }}
                      />
                    }
                    label={t('entangled.wizard.saveFiscal', 'Guardar estos datos para próximas solicitudes')}
                    sx={{ color: '#ffffff' }}
                  />
                </Grid>
              </Grid>
            </Paper>
              )}
            </>
          )}

          {/* === Proveedor de envío === */}
          {wizardStep === 2 && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: '#1a1a1a', border: '1px solid #333333', borderRadius: 1 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2, color: '#ffffff' }}>
              🏦 {t('entangled.suppliers.section', 'Proveedor de envío (beneficiario)')}
            </Typography>
            <TextField
              select fullWidth
              label={t('entangled.suppliers.pick', 'Selecciona proveedor')}
              value={String(selectedSupplierId)}
              onChange={(e) => handlePickSupplier(e.target.value)}
              sx={{ 
                mb: 2,
                '& .MuiOutlinedInput-root': {
                  color: '#ffffff',
                  backgroundColor: '#0a0a0a',
                  '& fieldset': { borderColor: '#333333' },
                  '&:hover fieldset': { borderColor: '#555555' },
                  '&.Mui-focused fieldset': { borderColor: ORANGE },
                },
                '& .MuiInputLabel-root': { color: '#888888' },
                '& .MuiInputLabel-root.Mui-focused': { color: ORANGE },
                '& .MuiOutlinedInput-input': { color: '#ffffff' },
                '& .MuiSvgIcon-root': { color: ORANGE },
              }}
            >
              <MenuItem value="new">+ {t('entangled.suppliers.new', 'Nuevo proveedor (capturar datos)')}</MenuItem>
              {suppliers.map((s) => (
                <MenuItem key={s.id} value={String(s.id)}>
                  {s.is_favorite ? '★ ' : ''}{s.alias || s.nombre_beneficiario}
                  {s.banco_nombre ? ` — ${s.banco_nombre}` : ''}
                  {s.numero_cuenta ? ` (…${s.numero_cuenta.slice(-4)})` : ''}
                </MenuItem>
              ))}
            </TextField>

            {/* Card de proveedor seleccionado */}
            {selectedSupplierId !== 'new' && suppliers.find((s) => s.id === selectedSupplierId) && !editingSupplierData && (
              <Card sx={{ mb: 2, bgcolor: '#1a1a1a', border: `1px solid ${ORANGE}` }}>
                <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mb: 1 }}>
                    <CheckCircleIcon sx={{ color: ORANGE, fontSize: 18 }} />
                    <Typography variant="subtitle2" fontWeight={700} sx={{ color: ORANGE }}>
                      Proveedor seleccionado
                    </Typography>
                  </Stack>
                  <Stack spacing={0.5}>
                    <Typography variant="body2" sx={{ color: '#ffffff' }}>
                      <strong>Beneficiario:</strong> {suppliers.find((s) => s.id === selectedSupplierId)?.nombre_beneficiario}
                    </Typography>
                    {suppliers.find((s) => s.id === selectedSupplierId)?.banco_nombre && (
                      <Typography variant="body2" sx={{ color: '#ffffff' }}>
                        <strong>Banco:</strong> {suppliers.find((s) => s.id === selectedSupplierId)?.banco_nombre}
                      </Typography>
                    )}
                    {suppliers.find((s) => s.id === selectedSupplierId)?.numero_cuenta && (
                      <Typography variant="body2" sx={{ color: '#ffffff' }}>
                        <strong>Cuenta:</strong> ...{suppliers.find((s) => s.id === selectedSupplierId)?.numero_cuenta.slice(-4)}
                      </Typography>
                    )}
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => setEditingSupplierData(true)}
                      sx={{ color: ORANGE, justifyContent: 'flex-start', mt: 1, '&:hover': { bgcolor: 'rgba(240, 90, 40, 0.1)' } }}
                    >
                      ✏️ Editar datos
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            )}

            {(selectedSupplierId === 'new' || editingSupplierData) && (
            <EntangledSupplierForm
              value={supplierForm}
              onChange={setSupplierForm}
              onUploadPhoto={handleUploadSupplierPhoto}
              uploading={uploadingSupplier}
            />
            )}
            {selectedSupplierId === 'new' && (
              <FormControlLabel
                sx={{ mt: 1, color: '#ffffff' }}
                control={
                  <Checkbox
                    checked={saveSupplierForLater}
                    onChange={(e) => setSaveSupplierForLater(e.target.checked)}
                    sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }}
                  />
                }
                label={t('entangled.suppliers.saveForLater', 'Guardar este proveedor para próximas solicitudes')}
              />
            )}
          </Paper>
          )}

          {/* === Monto y cotización === */}
          {wizardStep === 4 && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: '#141414', border: `1px solid ${BORDER}`, borderRadius: 2 }}>
            <Typography variant="subtitle1" fontWeight={800} sx={{ color: '#fff', mb: 1.5 }}>
              ✅ Resumen total de la operación
            </Typography>
            <Stack spacing={0.9}>
              <Typography sx={{ color: '#d1d5db', fontSize: '0.9rem' }}>Divisa destino: <strong style={{ color: '#fff' }}>{form.divisa_destino}</strong></Typography>
              <Typography sx={{ color: '#d1d5db', fontSize: '0.9rem' }}>Monto al proveedor: <strong style={{ color: '#fff' }}>${formatMoney(form.monto)} {form.divisa_destino}</strong></Typography>
              <Typography sx={{ color: '#d1d5db', fontSize: '0.9rem' }}>Proveedor de pago: <strong style={{ color: '#fff' }}>{providers.find((p) => p.id === selectedProviderId)?.name || '—'}</strong></Typography>
              <Typography sx={{ color: '#d1d5db', fontSize: '0.9rem' }}>Beneficiario: <strong style={{ color: '#fff' }}>{supplierForm.nombre_beneficiario || '—'}</strong></Typography>
              <Typography sx={{ color: '#d1d5db', fontSize: '0.9rem' }}>Factura: <strong style={{ color: '#fff' }}>{requiereFactura ? 'Sí' : 'No'}</strong></Typography>
              {requiereFactura && (
                <Typography sx={{ color: '#d1d5db', fontSize: '0.9rem' }}>RFC: <strong style={{ color: '#fff' }}>{form.rfc || '—'}</strong></Typography>
              )}
              {quote && (
                <>
                  <Divider sx={{ borderColor: '#333333', my: 0.6 }} />
                  <Typography sx={{ color: '#d1d5db', fontSize: '0.9rem' }}>Tipo de cambio: <strong style={{ color: '#fff' }}>${quote.tipo_cambio.toFixed(4)} MXN / {form.divisa_destino}</strong></Typography>
                  <Typography sx={{ color: '#d1d5db', fontSize: '0.9rem' }}>Comisión: <strong style={{ color: '#fff' }}>${formatMoney(quote.monto_mxn_comision)} MXN</strong></Typography>
                  <Typography sx={{ color: ORANGE, fontSize: '1.05rem', fontWeight: 800 }}>Total: ${formatMoney(quote.monto_mxn_total)} MXN</Typography>
                </>
              )}
            </Stack>
          </Paper>
          )}
        </DialogContent>
        <DialogActions sx={{ bgcolor: '#0a0a0a', borderTop: '1px solid #333333', p: 2 }}>
          <Button onClick={() => { setDialogOpen(false); setWizardStep(1); }} sx={{ color: '#888888', '&:hover': { bgcolor: '#2a2a2a' } }}>
            {t('common.cancel')}
          </Button>
          {wizardStep > 1 && (
            <Button variant="outlined" onClick={() => setWizardStep((s) => (s === 4 ? 3 : s === 3 ? 2 : s === 2 ? 1 : 1))} sx={{ borderColor: '#555', color: '#ddd' }}>
              {t('common.back', 'Atrás')}
            </Button>
          )}
          {wizardStep < 4 ? (
            <Button variant="contained" onClick={goNextWizardStep} sx={{ bgcolor: ORANGE, color: '#000', fontWeight: 700, '&:hover': { bgcolor: '#E54A1F' } }}>
              {t('common.next', 'Siguiente')}
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={submitting || !quote}
              sx={{ bgcolor: ORANGE, color: '#000000', fontWeight: 700, '&:hover': { bgcolor: '#E54A1F' }, '&:disabled': { bgcolor: '#663333', color: '#333333' } }}
            >
              {submitting ? t('entangled.actions.sending') : t('entangled.actions.submit')}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Dialog: instrucciones de pago tras crear */}
      <Dialog open={instructionsOpen} onClose={() => setInstructionsOpen(false)} maxWidth="md" fullWidth
        PaperProps={{
          sx: {
            bgcolor: '#070709',
            color: '#ffffff',
            border: `1px solid ${BORDER}`,
            borderRadius: 2,
            backgroundImage: 'linear-gradient(180deg, rgba(255,102,0,0.08) 0%, rgba(0,0,0,0) 30%)',
          }
        }}
      >
        <DialogTitle sx={{
          color: '#fff',
          fontWeight: 800,
          borderBottom: `1px solid ${BORDER}`,
          background: 'linear-gradient(90deg, rgba(255,102,0,0.95) 0%, rgba(255,102,0,0.7) 30%, rgba(255,102,0,0.15) 100%)'
        }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <CheckCircleIcon sx={{ color: '#fff' }} />
            <span>{t('entangled.wizard.instructionsTitle', 'Solicitud creada — Instrucciones de pago')}</span>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 3, bgcolor: '#070709' }}>
          {lastCreated?.quote && (
            <Card sx={{ mb: 2, bgcolor: 'rgba(255,102,0,0.08)', border: `1px solid rgba(255,102,0,0.45)` }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ color: ORANGE, fontWeight: 700 }}>
                  {t('entangled.wizard.totalToPay', 'Total a pagar a XOX')}
                </Typography>
                <Typography variant="h5" sx={{ color: '#ffffff' }}>
                  ${formatMoney(lastCreated.quote.monto_mxn_total)} MXN
                </Typography>
              </CardContent>
            </Card>
          )}
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, color: '#ffffff' }}>
            {t('entangled.wizard.instructionsHelp', 'Realiza la transferencia con los siguientes datos y luego sube el comprobante en "Mis solicitudes":')}
          </Typography>
          {lastCreated?.instrucciones_pago ? (
            <Box
              component="pre"
              sx={{
                bgcolor: '#0a0a0a',
                p: 2,
                borderRadius: 1,
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 360,
                overflow: 'auto',
                color: '#888888',
                border: '1px solid #333333',
              }}
            >
              {JSON.stringify(lastCreated.instrucciones_pago, null, 2)}
            </Box>
          ) : (
            <Alert severity="info" sx={{ bgcolor: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.45)', color: '#bfdbfe' }}>
              <Typography sx={{ color: '#93c5fd', fontWeight: 600 }}>ℹ️ {t('entangled.wizard.noInstructions', 'Aún no recibimos las instrucciones del motor. Te las haremos llegar pronto.')}</Typography>
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ bgcolor: '#070709', borderTop: '1px solid #333333', p: 2 }}>
          <Button onClick={() => setInstructionsOpen(false)} variant="contained" sx={{ bgcolor: ORANGE, color: '#000000', fontWeight: 700, px: 3, '&:hover': { bgcolor: '#E54A1F' } }}>
            {t('common.close', 'Cerrar')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Mis Proveedores de envío */}
      <Dialog open={suppliersDialogOpen} onClose={() => setSuppliersDialogOpen(false)} maxWidth="md" fullWidth
        PaperProps={{
          sx: { bgcolor: '#000000', color: '#ffffff' }
        }}
      >
        <DialogTitle sx={{ bgcolor: ORANGE, color: '#000000', fontWeight: 700 }}>
          {t('entangled.suppliers.manage', 'Mis proveedores de envío')}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography variant="body2" sx={{ mb: 2, color: '#888888' }}>
            {t(
              'entangled.suppliers.manageHelp',
              'Guarda los datos bancarios de tus beneficiarios frecuentes para reutilizarlos en futuras solicitudes.'
            )}
          </Typography>

          {suppliers.length > 0 && (
            <>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, color: '#ffffff' }}>
                {t('entangled.suppliers.savedList', 'Proveedores guardados')} ({suppliers.length})
              </Typography>
              <List dense sx={{ border: '1px solid #333333', borderRadius: 1, mb: 3, bgcolor: '#1a1a1a' }}>
                {suppliers.map((s) => (
                  <ListItem
                    key={s.id}
                    divider
                    sx={{
                      bgcolor: editingSupplier?.id === s.id ? '#0a3a1a' : 'transparent',
                      borderBottomColor: '#333333',
                      '&:hover': { bgcolor: '#242424' },
                    }}
                  >
                    <IconButton
                      size="small"
                      onClick={() => handleToggleFavorite(s)}
                      sx={{ mr: 1, color: s.is_favorite ? ORANGE : '#555555' }}
                    >
                      {s.is_favorite ? <StarIcon /> : <StarBorderIcon />}
                    </IconButton>
                    <ListItemText
                      primary={
                        <Typography fontWeight={600} sx={{ color: '#ffffff' }}>
                          {s.alias || s.nombre_beneficiario}
                          {s.divisa_default && (
                            <Chip
                              size="small"
                              label={s.divisa_default}
                              sx={{ ml: 1, bgcolor: 'rgba(240, 90, 40, 0.2)', color: ORANGE, fontWeight: 600 }}
                            />
                          )}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="body2" sx={{ color: '#888888' }}>
                          {s.nombre_beneficiario}
                          {s.banco_nombre ? ` · ${s.banco_nombre}` : ''}
                          {s.swift_bic ? ` · SWIFT ${s.swift_bic}` : ''}
                          {s.numero_cuenta ? ` · …${s.numero_cuenta.slice(-4)}` : ''}
                        </Typography>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Button size="small" onClick={() => openEditSupplier(s)} sx={{ color: ORANGE }}>
                        {t('common.edit', 'Editar')}
                      </Button>
                      <IconButton size="small" onClick={() => handleDeleteSupplier(s.id)} sx={{ color: '#ff6b6b' }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            </>
          )}

          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, color: '#ffffff' }}>
            {editingSupplier
              ? t('entangled.suppliers.editing', 'Editando proveedor')
              : t('entangled.suppliers.newOne', 'Nuevo proveedor')}
          </Typography>
          <EntangledSupplierForm
            value={supplierForm}
            onChange={setSupplierForm}
            onUploadPhoto={handleUploadSupplierPhoto}
            uploading={uploadingSupplier}
          />
        </DialogContent>
        <DialogActions sx={{ bgcolor: '#0a0a0a', borderTop: '1px solid #333333', p: 2 }}>
          {editingSupplier && (
            <Button
              onClick={() => {
                setEditingSupplier(null);
                setSupplierForm(EMPTY_SUPPLIER);
              }}
              sx={{ color: '#888888', '&:hover': { bgcolor: '#2a2a2a' } }}
            >
              {t('common.cancel', 'Cancelar')}
            </Button>
          )}
          <Button onClick={() => setSuppliersDialogOpen(false)} sx={{ color: '#888888', '&:hover': { bgcolor: '#2a2a2a' } }}>
            {t('common.close', 'Cerrar')}
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveStandaloneSupplier}
            disabled={savingSupplier}
            sx={{ bgcolor: ORANGE, color: '#000000', fontWeight: 600, '&:hover': { bgcolor: '#E54A1F' }, '&:disabled': { bgcolor: '#663333', color: '#333333' } }}
          >
            {savingSupplier
              ? t('common.saving', 'Guardando...')
              : editingSupplier
              ? t('common.update', 'Actualizar')
              : t('common.save', 'Guardar')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack.open}
        autoHideDuration={4500}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>
      </Box>{/* end p:4 */}
    </Box>
  );
}
