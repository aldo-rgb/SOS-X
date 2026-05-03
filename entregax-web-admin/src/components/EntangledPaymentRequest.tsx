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
import DescriptionIcon from '@mui/icons-material/Description';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ContactsIcon from '@mui/icons-material/Contacts';
import DeleteIcon from '@mui/icons-material/Delete';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
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
const WORLD_MAP_BG = '/mapamundi2.png';

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
const DESTINATION_COUNTRIES = [
  { code: 'CN', label: 'China', flag: '🇨🇳' },
  { code: 'US', label: 'Estados Unidos', flag: '🇺🇸' },
  { code: 'KR', label: 'Corea del Sur', flag: '🇰🇷' },
  { code: 'JP', label: 'Japón', flag: '🇯🇵' },
];
const COUNTRY_META: Record<string, { label: string; flag: string }> = {
  MX: { label: 'México', flag: '🇲🇽' },
  CN: { label: 'China', flag: '🇨🇳' },
  US: { label: 'Estados Unidos', flag: '🇺🇸' },
  KR: { label: 'Corea del Sur', flag: '🇰🇷' },
  JP: { label: 'Japón', flag: '🇯🇵' },
};

const normalizeCountryCode = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toUpperCase();
  if (!v) return null;
  if (COUNTRY_META[v]) return v;
  if (v === 'CHINA') return 'CN';
  if (v === 'ESTADOS UNIDOS' || v === 'USA' || v === 'UNITED STATES') return 'US';
  if (v === 'COREA' || v === 'COREA DEL SUR' || v === 'SOUTH KOREA') return 'KR';
  if (v === 'JAPON' || v === 'JAPÓN' || v === 'JAPAN') return 'JP';
  if (v === 'MEXICO' || v === 'MÉXICO') return 'MX';
  return null;
};

const resolveDestinationCountryCode = (
  request: EntangledRequest & Record<string, unknown>,
  fallbackCode: string,
): string => {
  const candidates = [
    request.pais_destino,
    request.destino_pais,
    request.supplier_country,
    request.beneficiary_country,
    request.country_destino,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeCountryCode(candidate);
    if (normalized) return normalized;
  }
  if (String(request.op_divisa_destino || '').toUpperCase() === 'RMB') return 'CN';
  if (String(request.op_divisa_destino || '').toUpperCase() === 'USD') return normalizeCountryCode(fallbackCode) || 'US';
  return 'US';
};



const formatTimeLabel = (ts: number | null | undefined) => {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: XPAY_TIMEZONE,
  }).format(new Date(ts));
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
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(-RATE_HISTORY_MAX);
    } catch { /* noop */ }
    // Semilla simulada de 30 días para presentación inicial
    const now = Date.now();
    const DAY = 86_400_000;
    const seed: RateSnapshot[] = [];
    let usd = 17.85;
    let rmb = 2.53;
    for (let i = 29; i >= 0; i--) {
      usd = Math.max(16.5, Math.min(19.5, usd + (Math.random() - 0.48) * 0.18));
      rmb = Math.max(2.2, Math.min(2.9,  rmb + (Math.random() - 0.48) * 0.025));
      seed.push({ t: now - i * DAY, usd_mxn: usd, rmb_mxn: rmb });
    }
    return seed;
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
  const [widgetDestinationCountry, setWidgetDestinationCountry] = useState('CN');
  const [widgetAmountUsd, setWidgetAmountUsd] = useState('');
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [rateWidgetCurrency, setRateWidgetCurrency] = useState<'USD' | 'RMB'>('RMB');

  const widgetEstimate = useMemo(() => {
    const amount = Number(widgetAmountUsd);
    const fx = defaultProvider ? Number(defaultProvider.tipo_cambio_usd) : NaN;
    const pct = defaultProvider ? Number(defaultProvider.porcentaje_compra || 0) : 0;
    const opUsd = defaultProvider ? Number(defaultProvider.costo_operacion_usd || 0) : 0;

    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(fx) || fx <= 0) {
      return null;
    }

    const base = amount * fx;
    const commission = base * (pct / 100);
    const operationalCost = opUsd * fx;
    const total = base + commission + operationalCost;

    return { fx, base, commission, operationalCost, total, pct, opUsd };
  }, [widgetAmountUsd, defaultProvider]);


  const widgetSuppliersPreview = useMemo(() => {
    const favorites = suppliers.filter((s) => s.is_favorite);
    const rest = suppliers.filter((s) => !s.is_favorite);
    return [...favorites, ...rest].slice(0, 4);
  }, [suppliers]);

  useEffect(() => {
    try {
      localStorage.setItem(RATE_HISTORY_KEY, JSON.stringify(rateHistory.slice(-RATE_HISTORY_MAX)));
    } catch {
      // noop (storage may fail on private mode)
    }
  }, [rateHistory]);




  const rateWidgetTimeline = useMemo(() => {
    const metric = rateWidgetCurrency === 'USD' ? 'usd_mxn' : 'rmb_mxn';
    const timeline = rateHistory
      .map((x) => ({ t: x.t, v: Number(x[metric]) }))
      .filter((x) => Number.isFinite(x.v) && x.v > 0);

    if (timeline.length >= 2) return timeline;

    const fallback = rateWidgetCurrency === 'USD'
      ? Number(defaultProvider?.tipo_cambio_usd)
      : Number(defaultProvider?.tipo_cambio_rmb);
    if (Number.isFinite(fallback)) {
      const now = Date.now();
      return [
        { t: now - 5 * 60 * 1000, v: fallback },
        { t: now, v: fallback },
      ];
    }
    return [] as Array<{ t: number; v: number }>;
  }, [defaultProvider, rateHistory, rateWidgetCurrency]);

  const rateWidgetPath = useMemo(
    () => buildSparklinePath(rateWidgetTimeline.map((x) => x.v), 620, 170, 12),
    [rateWidgetTimeline],
  );

  const rateWidgetCurrent = rateWidgetTimeline.length ? rateWidgetTimeline[rateWidgetTimeline.length - 1].v : null;
  const rateWidgetPrevious = rateWidgetTimeline.length > 1 ? rateWidgetTimeline[rateWidgetTimeline.length - 2].v : null;
  const rateWidgetDelta =
    rateWidgetCurrent != null && rateWidgetPrevious != null && rateWidgetPrevious !== 0
      ? ((rateWidgetCurrent - rateWidgetPrevious) / rateWidgetPrevious) * 100
      : null;
  const rateWidgetStartTs = rateWidgetTimeline.length ? rateWidgetTimeline[0].t : null;
  const rateWidgetEndTs = rateWidgetTimeline.length ? rateWidgetTimeline[rateWidgetTimeline.length - 1].t : null;

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

  const handleStartWizardFromWidget = () => {
    const amount = Number(widgetAmountUsd);
    setForm((prev) => ({
      ...prev,
      monto: Number.isFinite(amount) && amount > 0 ? String(amount) : prev.monto,
      divisa_destino: 'USD',
    }));
    setWizardStep(1);
    setDialogOpen(true);
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

          <Box
            sx={{
              minHeight: { xs: 180, md: 240 },
              px: { xs: 2, md: 4 },
              py: { xs: 2, md: 2.5 },
              position: 'relative',
              zIndex: 2,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
            }}
          >
            <Box
              component="img"
              src="/logo-xpay-square.png"
              alt="X-Pay"
              sx={{
                width: { xs: 135, md: 195 },
                height: 'auto',
                objectFit: 'contain',
                filter: 'drop-shadow(0 12px 30px rgba(0,0,0,0.6)) drop-shadow(0 0 22px rgba(255,102,0,0.22))',
                animation: 'xpay-breathe 3s ease-in-out infinite',
                mb: 0.8,
              }}
              onError={(e: React.SyntheticEvent<HTMLImageElement>) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            <Typography
              sx={{
                color: '#d1d5db',
                fontWeight: 800,
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
                fontSize: { xs: '0.95rem', md: '1.35rem' },
                textShadow: '0 2px 12px rgba(0,0,0,0.55)',
              }}
            >
              {t('xpay.heroSimpleText', 'ENVIOS DE DINERO SEGUROS A CHINA Y ESTADOS UNIDOS.')}
            </Typography>
          </Box>
        </Box>
      )}

      <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'stretch', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
        <Box sx={{ flex: '1 1 0', minWidth: { xs: '100%', sm: 0 } }}>
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 1.6, md: 2 },
              bgcolor: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '12px',
              boxShadow: '0 10px 26px rgba(0,0,0,0.25)',
              height: '100%',
            }}
          >
            <Stack spacing={1.2}>
              <TextField
                select
                size="small"
                fullWidth
                label="País de Destino"
                value={widgetDestinationCountry}
                onChange={(e) => setWidgetDestinationCountry(e.target.value)}
                sx={{
                  '& .MuiInputBase-root': { bgcolor: '#171a20', color: '#fff', borderRadius: '10px' },
                  '& .MuiInputLabel-root': { color: '#9ca3af' },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.16)' },
                }}
              >
                {DESTINATION_COUNTRIES.map((c) => (
                  <MenuItem key={c.code} value={c.code}>{c.flag} {c.label}</MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                fullWidth
                type="number"
                label="Monto a Enviar (USD)"
                value={widgetAmountUsd}
                onChange={(e) => setWidgetAmountUsd(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                sx={{
                  '& .MuiInputBase-root': { bgcolor: '#171a20', color: '#fff', borderRadius: '10px' },
                  '& .MuiInputLabel-root': { color: '#9ca3af' },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.16)' },
                }}
              />
              <Box sx={{ px: 1.4, py: 1, borderRadius: '10px', border: '1px solid rgba(240,90,40,0.35)', bgcolor: 'rgba(240,90,40,0.08)' }}>
                <Typography sx={{ color: '#9ca3af', fontSize: '0.68rem' }}>Total estimado en MXN</Typography>
                <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: '1.1rem', lineHeight: 1.2 }}>
                  {widgetEstimate ? `$${formatMoney(widgetEstimate.total)} MXN` : '—'}
                </Typography>
                <Typography sx={{ color: '#6b7280', fontSize: '0.64rem', mt: 0.2 }}>
                  TC: {widgetEstimate ? `${widgetEstimate.fx.toFixed(4)} MXN/USD` : '—'}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Box>
        <Box sx={{ flex: '1 1 0', minWidth: { xs: '100%', sm: 0 } }}>
          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              height: '100%',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'linear-gradient(165deg, rgba(255,255,255,0.06) 0%, rgba(20,22,28,0.9) 100%)',
              boxShadow: '0 10px 26px rgba(0,0,0,0.35)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.1 }}>
              <Typography sx={{ color: '#f3f4f6', fontWeight: 800, fontSize: '0.95rem' }}>
                Proceso de envío
              </Typography>
              <Typography
                onClick={() => setShowHowItWorks(p => !p)}
                sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem', cursor: 'pointer', userSelect: 'none',
                  '&:hover': { color: 'rgba(255,255,255,0.6)' } }}
              >
                ¿Cómo funciona?
              </Typography>
            </Box>

            {showHowItWorks && (
              <Typography sx={{ color: '#9ca3af', fontSize: '0.75rem', lineHeight: 1.55, mb: 1.2,
                p: 1.2, borderRadius: '8px', bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                Complete los datos de su proveedor y suba su comprobante de pago. Procesamos el pago internacional y generamos su comprobante de pago junto con la confirmación de pago.
              </Typography>
            )}

            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 0.6, mb: 1.4 }}>
              {[
                { icon: <ContactsIcon sx={{ fontSize: 16 }} />, label: 'Registro' },
                { icon: <ShieldOutlinedIcon sx={{ fontSize: 16 }} />, label: 'Verificación' },
                { icon: <AccountBalanceWalletOutlinedIcon sx={{ fontSize: 16 }} />, label: 'Transferencia' },
                { icon: <ReceiptLongIcon sx={{ fontSize: 16 }} />, label: 'Recepción' },
              ].map((step, idx) => (
                <Box key={step.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.45, flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.45, flex: 1, minWidth: 0 }}>
                    <Box sx={{ width: 24, height: 24, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                      {step.icon}
                    </Box>
                    <Typography sx={{ color: '#d1d5db', fontSize: '0.6rem', fontWeight: 700, lineHeight: 1.05, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {step.label}
                    </Typography>
                  </Box>
                  {idx < 3 && <Typography sx={{ color: '#9ca3af', fontSize: '0.8rem', mt: -1.2 }}>→</Typography>}
                </Box>
              ))}
            </Box>

            <Button
              fullWidth
              onClick={handleStartWizardFromWidget}
              sx={{
                mt: 'auto',
                py: 1,
                borderRadius: 2,
                color: '#fff',
                fontWeight: 900,
                letterSpacing: '0.03em',
                bgcolor: ORANGE,
                background: 'linear-gradient(90deg, #F05A28 0%, #FF6600 100%)',
                border: '1px solid rgba(255,255,255,0.2)',
                '&:hover': {
                  background: 'linear-gradient(90deg, #e55523 0%, #f76000 100%)',
                },
              }}
            >
              CREAR NUEVO ENVÍO →
            </Button>
          </Paper>
        </Box>

        <Box sx={{ flex: '1 1 0', minWidth: { xs: '100%', sm: 0 } }}>
          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              height: '100%',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'linear-gradient(165deg, rgba(255,255,255,0.05) 0%, rgba(15,16,20,0.9) 100%)',
              boxShadow: '0 10px 26px rgba(0,0,0,0.35)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Typography sx={{ color: '#f3f4f6', fontWeight: 800, fontSize: '0.95rem', mb: 1.1 }}>
              Mis proveedores
            </Typography>

            {widgetSuppliersPreview.length === 0 ? (
              <Typography sx={{ color: '#9ca3af', fontSize: '0.78rem', lineHeight: 1.4, mb: 1.2 }}>
                Aún no tienes proveedores guardados. Crea tu primer beneficiario para reutilizarlo.
              </Typography>
            ) : (
              <Box sx={{ mb: 1.2 }}>
                {widgetSuppliersPreview.map((s) => (
                  <Box
                    key={s.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      py: 0.55,
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ color: '#fff', fontSize: '0.76rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.alias || s.nombre_beneficiario}
                      </Typography>
                      <Typography sx={{ color: '#9ca3af', fontSize: '0.68rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.banco_nombre || 'Banco no definido'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, flexShrink: 0 }}>
                      {s.is_favorite && <StarIcon sx={{ fontSize: 14, color: ORANGE }} />}
                      <Chip
                        size="small"
                        label={s.divisa_default || 'USD'}
                        sx={{
                          height: 20,
                          bgcolor: 'rgba(240,90,40,0.16)',
                          color: ORANGE,
                          fontSize: '0.62rem',
                          fontWeight: 700,
                        }}
                      />
                    </Box>
                  </Box>
                ))}
              </Box>
            )}

            <Box sx={{ mt: 'auto', display: 'flex', justifyContent: 'center' }}>
              <Button
                variant="outlined"
                startIcon={<ContactsIcon />}
                onClick={() => setSuppliersDialogOpen(true)}
                sx={{
                  borderColor: 'rgba(255,102,0,0.5)',
                  color: ORANGE,
                  fontWeight: 800,
                  textTransform: 'none',
                  borderRadius: '10px',
                  px: 3,
                  '&:hover': {
                    bgcolor: 'rgba(255,102,0,0.08)',
                    borderColor: ORANGE,
                  },
                }}
              >
                Gestionar proveedores
              </Button>
            </Box>
          </Paper>
        </Box>
      </Box>


      <Box sx={{ display: 'flex', gap: 1.5, mb: 3, alignItems: 'stretch', flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
        {/* Tabla: 2/3 del ancho */}
        <Box sx={{ flex: '2 2 0', minWidth: { xs: '100%', md: 0 } }}>
          <Paper variant="outlined" sx={{ bgcolor: '#0f0f12', border: `1px solid ${BORDER}`, borderRadius: '12px', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: `1px solid ${BORDER}` }}>
              <Typography sx={{ color: '#f3f4f6', fontWeight: 800, fontSize: '0.96rem' }}>
                Últimos Envíos Realizados
              </Typography>
            </Box>
            <TableContainer sx={{ flex: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#08080a' }}>
                    {['#', 'Razón Social', 'Monto a Enviar', 'Divisa Destino', 'Estatus', 'Factura', 'Pago a Proveedor', 'Acciones'].map((col, i) => (
                      <TableCell key={col} align={i === 7 ? 'center' : i === 2 ? 'right' : 'left'}
                        sx={{ color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.07em', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>
                        {col}
                      </TableCell>
                    ))}
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
                      const cancellationFee = Number(r.cancellation_fee_usd || 0);
                      const destinationCode = resolveDestinationCountryCode(r as EntangledRequest & Record<string, unknown>, widgetDestinationCountry);
                      const destination = COUNTRY_META[destinationCode] || COUNTRY_META.US;
                      return (
                      <TableRow key={r.id} hover sx={{ bgcolor: 'transparent', '&:hover': { bgcolor: 'rgba(255,255,255,0.025)' }, '& td': { borderBottom: `1px solid ${BORDER}` } }}>
                        {/* # */}
                        <TableCell sx={{ color: '#6b7280', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                          {r.id}
                        </TableCell>
                        {/* Razón Social */}
                        <TableCell sx={{ minWidth: 160 }}>
                          <Typography sx={{ color: '#e5e7eb', fontWeight: 700, fontSize: '0.8rem', lineHeight: 1.2 }}>
                            {r.cf_razon_social}
                          </Typography>
                          {r.entangled_transaccion_id && (
                            <Typography sx={{ color: '#6b7280', fontSize: '0.68rem', fontFamily: 'monospace' }}>
                              {r.entangled_transaccion_id}
                            </Typography>
                          )}
                        </TableCell>
                        {/* Monto */}
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          <Typography sx={{ color: ORANGE, fontWeight: 700, fontSize: '0.85rem' }}>
                            ${formatMoney(r.op_monto)}
                          </Typography>
                          {String(r.estatus_global || '').toLowerCase() === 'cancelado' && cancellationFee > 0 && (
                            <Typography sx={{ color: '#fdba74', fontSize: '0.68rem' }}>Fee: ${formatMoney(cancellationFee)} USD</Typography>
                          )}
                        </TableCell>
                        {/* Divisa Destino */}
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography sx={{ fontSize: '0.9rem' }}>{destination.flag}</Typography>
                            <Typography sx={{ color: '#e5e7eb', fontWeight: 700, fontSize: '0.8rem' }}>{r.op_divisa_destino || '—'}</Typography>
                          </Box>
                        </TableCell>
                        {/* Estatus */}
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <StatusBadge status={r.estatus_global} label={t(`entangled.status.${r.estatus_global}`, r.estatus_global)} />
                        </TableCell>
                        {/* Factura */}
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <StatusBadge status={r.estatus_factura} label={t(`entangled.status.${r.estatus_factura}`, r.estatus_factura)} variant="outline" />
                          {r.factura_url && (
                            <IconButton size="small" component="a" href={r.factura_url} target="_blank" rel="noopener" sx={{ ml: 0.4, p: 0.2 }}>
                              <DescriptionIcon sx={{ fontSize: 14, color: '#9ca3af' }} />
                            </IconButton>
                          )}
                        </TableCell>
                        {/* Pago a Proveedor */}
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <StatusBadge status={r.estatus_proveedor} label={t(`entangled.status.${r.estatus_proveedor}`, r.estatus_proveedor)} variant="outline" />
                          {r.comprobante_proveedor_url && (
                            <IconButton size="small" component="a" href={r.comprobante_proveedor_url} target="_blank" rel="noopener" sx={{ ml: 0.4, p: 0.2 }}>
                              <ReceiptLongIcon sx={{ fontSize: 14, color: '#4ade80' }} />
                            </IconButton>
                          )}
                        </TableCell>
                        {/* Acciones */}
                        <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                          <Stack direction="row" spacing={0.4} justifyContent="center" alignItems="center">
                            {!r.op_comprobante_cliente_url ? (
                              <Tooltip title={t('entangled.actions.uploadMyProof', 'Subir mi comprobante') as string}>
                                <IconButton size="small" component="label" disabled={uploading} sx={{ color: ORANGE }}>
                                  <ReceiptLongIcon fontSize="small" />
                                  <input hidden type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadProofToRequest(r.id, f); e.target.value = ''; }} />
                                </IconButton>
                              </Tooltip>
                            ) : (
                              <Tooltip title={t('entangled.actions.viewMyProof') as string}>
                                <IconButton size="small" component="a" href={r.op_comprobante_cliente_url} target="_blank" rel="noopener" sx={{ color: '#2e7d32' }}>
                                  <DescriptionIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                          <Typography sx={{ color: '#6b7280', fontSize: '0.65rem', mt: 0.3 }}>
                            {new Date(r.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )})
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>
        {/* Chart: 1/3 del ancho — alineado bajo Mis Proveedores */}
        <Box sx={{ flex: '1 1 0', minWidth: { xs: '100%', md: 0 } }}>
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 1.4, md: 1.8 },
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'linear-gradient(165deg, rgba(255,255,255,0.04) 0%, rgba(17,20,28,0.92) 100%)',
              boxShadow: '0 10px 26px rgba(0,0,0,0.35)',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.1, flexWrap: 'nowrap', overflow: 'hidden' }}>
              <Typography sx={{ color: '#f3f4f6', fontWeight: 800, fontSize: '0.96rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Tasa de Cambio Promedio
              </Typography>
              <TextField
                select
                size="small"
                value={rateWidgetCurrency}
                onChange={(e) => setRateWidgetCurrency((e.target.value as 'USD' | 'RMB') || 'RMB')}
                sx={{
                  minWidth: 110, flexShrink: 0,
                  '& .MuiInputBase-root': { bgcolor: '#171a20', color: '#fff', borderRadius: '9px', fontWeight: 700 },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.16)' },
                }}
              >
                <MenuItem value="RMB">🇨🇳 CNY</MenuItem>
                <MenuItem value="USD">🇺🇸 USD</MenuItem>
              </TextField>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.2, mb: 0.8 }}>
              <Typography sx={{ color: '#fff', fontSize: '1.35rem', fontWeight: 900, lineHeight: 1 }}>
                {rateWidgetCurrent != null ? rateWidgetCurrent.toFixed(4) : '—'}
              </Typography>
              <Typography sx={{ color: '#9ca3af', fontSize: '0.78rem', fontWeight: 700 }}>
                MXN/{rateWidgetCurrency === 'RMB' ? 'CNY' : 'USD'}
              </Typography>
              {rateWidgetDelta != null && (
                <Typography sx={{ color: rateWidgetDelta >= 0 ? '#4ade80' : '#f87171', fontSize: '0.76rem', fontWeight: 800 }}>
                  {rateWidgetDelta >= 0 ? '▲' : '▼'} {Math.abs(rateWidgetDelta).toFixed(3)}%
                </Typography>
              )}
            </Box>
            <Box sx={{ flex: 1, minHeight: 120, borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', bgcolor: 'rgba(7,9,13,0.7)', px: 0.8, py: 0.7 }}>
              <svg width="100%" height="100%" viewBox="0 0 620 170" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="xpay-rate-line" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#fb923c" />
                  </linearGradient>
                </defs>
                <path d={rateWidgetPath} fill="none" stroke="url(#xpay-rate-line)" strokeWidth="2.6" strokeLinecap="round" />
              </svg>
            </Box>
            <Box sx={{ mt: 0.8, display: 'flex', justifyContent: 'space-between', color: '#9ca3af', fontSize: '0.7rem' }}>
              <Typography sx={{ fontSize: '0.7rem' }}>Inicio: {formatTimeLabel(rateWidgetStartTs)}</Typography>
              <Typography sx={{ fontSize: '0.7rem' }}>Actual: {formatTimeLabel(rateWidgetEndTs)}</Typography>
            </Box>
          </Paper>
        </Box>
      </Box>

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
          { Icon: ShieldOutlinedIcon, label: '2FA', sub: t('xpay.certIsoSub', 'Certified') as string },
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
