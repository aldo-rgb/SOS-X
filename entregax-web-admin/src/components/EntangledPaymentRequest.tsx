// ============================================================================
// EntangledPaymentRequest
// Componente cliente para crear y consultar solicitudes de pago a proveedores
// internacionales a través del motor ENTANGLED.
// Diseñado para insertarse como pestaña/sección sin afectar el resto del flow.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import AddIcon from '@mui/icons-material/Add';
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
import jsPDF from 'jspdf';
import EntangledSupplierForm, { EMPTY_SUPPLIER } from './EntangledSupplierForm';
import type { SupplierFormData } from './EntangledSupplierForm';

import { Checkbox, FormControlLabel, Divider, List, ListItem, ListItemText, ListItemSecondaryAction, Card, CardContent } from '@mui/material';

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
  referencia_pago?: string;
  entangled_transaccion_id: string | null;
  cf_rfc: string;
  cf_razon_social: string;
  cf_email: string;
  op_monto: string | number;
  op_divisa_destino: string;
  op_comprobante_cliente_url?: string | null;
  comprobante_subido_at?: string | null;
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

const formatElapsed = (fromIso: string, toNow: Date): string => {
  const normalized = fromIso.includes('T') ? fromIso : fromIso.replace(' ', 'T');
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized);
  const from = new Date(hasZone ? normalized : `${normalized}Z`);
  const secs = Math.floor((toNow.getTime() - from.getTime()) / 1000);
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
};

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
  const [now, setNow] = useState(() => new Date());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    tickRef.current = setInterval(() => setNow(new Date()), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<0 | 1 | 2 | 3 | 4>(0);
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
  const [lastCreated, setLastCreated] = useState<{
    request: unknown;
    instrucciones_pago: unknown;
    referencia_pago?: string;
    quote: { tipo_cambio: number; porcentaje_compra: number; costo_operacion_usd: number; monto_mxn_base: number; monto_mxn_comision: number; monto_mxn_costo_op: number; monto_mxn_total: number } | null;
    providerSnapshot?: { name: string; bank_accounts: Array<{ currency: string; bank: string; holder: string; account: string; clabe: string; reference: string }> } | null;
    operationSnapshot?: { divisa: string; monto: number; servicio: string; requiere_factura: boolean; rfc?: string; razon_social?: string } | null;
    beneficiarioSnapshot?: { nombre: string; nombre_chino?: string; cuenta?: string; iban?: string; banco?: string; swift?: string; aba?: string } | null;
    empresas_asignadas?: Array<{ clave_prodserv?: string; empresa?: string; monto?: number; divisa?: string; cuenta_bancaria?: any }>;
    entangled_transaccion_id?: string;
  } | null>(null);
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

  // ---- Asignación ENTANGLED: empresa + cuenta bancaria por clave SAT ----
  type AsignacionResult = {
    empresa?: { rfc: string; razon_social: string };
    cuenta_bancaria?: { banco?: string; titular?: string; cuenta?: string; clabe?: string; sucursal?: string; moneda?: string };
    facturacion?: { clave_solicitada?: string; clave_facturacion?: string; concepto_facturacion?: string; sustitucion?: boolean };
    loading: boolean;
    error?: string;
  };
  const [asignacion, setAsignacion] = useState<AsignacionResult | null>(null);

  // ---- Búsqueda live de conceptos SAT (autocomplete) ----
  type ConceptoOption = { clave_prodserv: string; descripcion: string };
  const [conceptoOptions, setConceptoOptions] = useState<ConceptoOption[]>([]);
  const [conceptoSearching, setConceptoSearching] = useState(false);
  const [conceptoSearchError, setConceptoSearchError] = useState<string | null>(null);
  const [conceptoSearchInput, setConceptoSearchInput] = useState('');

  // ---- Conceptos seleccionados con su empresa asignada ----
  type SelectedConcepto = {
    clave_prodserv: string;
    descripcion: string;
    empresa: { rfc: string; razon_social: string };
    cuenta_bancaria?: any;
    facturacion?: any;
  };
  const [selectedConceptos, setSelectedConceptos] = useState<SelectedConcepto[]>([]);
  const [addingConcepto, setAddingConcepto] = useState(false);
  const [addConceptoError, setAddConceptoError] = useState<string | null>(null);

  const lockedEmpresa = selectedConceptos[0]?.empresa || null;

  // Sincroniza form.conceptos y asignacion cuando cambian las claves seleccionadas
  useEffect(() => {
    const claves = selectedConceptos.map(c => c.clave_prodserv).join(', ');
    setForm(f => f.conceptos === claves ? f : { ...f, conceptos: claves });
    if (selectedConceptos.length > 0) {
      const first = selectedConceptos[0];
      setAsignacion({
        loading: false,
        empresa: first.empresa,
        cuenta_bancaria: first.cuenta_bancaria,
        facturacion: first.facturacion,
      });
    } else {
      setAsignacion(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConceptos]);

  // Si cambian datos fiscales o tipo de servicio, limpiar selección
  // (ENTANGLED puede asignar empresas distintas con diferentes RFC)
  useEffect(() => {
    if (selectedConceptos.length > 0) setSelectedConceptos([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.rfc, requiereFactura]);

  // El token activo de búsqueda es el contenido del input
  const activeToken = conceptoSearchInput.trim();

  useEffect(() => {
    // Solo busca si el token parece texto (no código numérico puro de 8 dígitos)
    if (!activeToken || /^\d{8}$/.test(activeToken)) {
      setConceptoOptions([]);
      setConceptoSearching(false);
      setConceptoSearchError(null);
      return;
    }
    // Mostrar "Buscando..." de inmediato mientras el usuario tipea
    setConceptoSearching(true);
    setConceptoSearchError(null);
    const handle = setTimeout(async () => {
      try {
        const r = await axios.get(`${API_URL}/api/entangled/conceptos/search`, {
          params: { q: activeToken, limit: 10 },
          headers: authHeader,
        });
        const list: ConceptoOption[] = Array.isArray(r.data?.results)
          ? r.data.results.map((x: any) => ({ clave_prodserv: String(x.clave_prodserv), descripcion: String(x.descripcion || '') }))
          : [];
        setConceptoOptions(list);
      } catch (e: any) {
        setConceptoOptions([]);
        const status = e?.response?.status;
        if (status === 502 || status === 503) {
          setConceptoSearchError('El catálogo SAT no está disponible momentáneamente. Intenta de nuevo en unos segundos.');
        } else {
          setConceptoSearchError(e?.response?.data?.error || 'No se pudo buscar el concepto');
        }
      }
      finally { setConceptoSearching(false); }
    }, 400);
    return () => clearTimeout(handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeToken]);

  // Llama /asignacion para una clave y la añade si la empresa es compatible con la primera
  const tryAddConcepto = async (opt: ConceptoOption) => {
    if (selectedConceptos.some(c => c.clave_prodserv === opt.clave_prodserv)) {
      setAddConceptoError('Esta clave ya está agregada.');
      return;
    }
    setAddingConcepto(true);
    setAddConceptoError(null);
    try {
      const body: any = {
        servicio: requiereFactura ? 'pago_con_factura' : 'pago_sin_factura',
        cliente_final: {
          razon_social: form.razon_social || 'Público en General',
          ...(requiereFactura && form.rfc ? { rfc: form.rfc } : {}),
          ...(form.regimen_fiscal ? { regimen_fiscal: form.regimen_fiscal } : {}),
          ...(form.cp ? { cp: form.cp } : {}),
          ...(form.uso_cfdi ? { uso_cfdi: form.uso_cfdi } : {}),
          ...(form.email ? { email: form.email } : {}),
        },
      };
      if (requiereFactura) body.concepto = opt.clave_prodserv;
      // Reintenta una vez si el primer intento falla con 502/503/504 (transitorios)
      let r;
      try {
        r = await axios.post(`${API_URL}/api/entangled/asignacion`, body, { headers: authHeader });
      } catch (firstErr) {
        const s = axios.isAxiosError(firstErr) ? firstErr.response?.status : undefined;
        if (s === 502 || s === 503 || s === 504) {
          await new Promise(res => setTimeout(res, 1500));
          r = await axios.post(`${API_URL}/api/entangled/asignacion`, body, { headers: authHeader });
        } else {
          throw firstErr;
        }
      }
      const newEmpresa = r.data?.empresa;
      if (!newEmpresa?.rfc) {
        setAddConceptoError('No se pudo determinar la empresa para esta clave.');
        return;
      }
      // Validar misma empresa que las claves ya seleccionadas
      if (lockedEmpresa && lockedEmpresa.rfc !== newEmpresa.rfc) {
        setAddConceptoError(
          `Esta clave pertenece a "${newEmpresa.razon_social}" (${newEmpresa.rfc}), pero los productos ya seleccionados son de "${lockedEmpresa.razon_social}". Solo puedes agregar productos de la misma empresa.`
        );
        return;
      }
      setSelectedConceptos([...selectedConceptos, {
        clave_prodserv: opt.clave_prodserv,
        descripcion: opt.descripcion,
        empresa: newEmpresa,
        cuenta_bancaria: r.data?.cuenta_bancaria,
        facturacion: r.data?.facturacion,
      }]);
      setConceptoSearchInput('');
      setConceptoOptions([]);
      setConceptoSearchError(null);
    } catch (e: any) {
      const status = e?.response?.status;
      const upstreamStatus = e?.response?.data?.upstream_status;
      const upstreamMsg = e?.response?.data?.error;
      if (status === 502 || status === 503 || status === 504) {
        setAddConceptoError(
          upstreamMsg
            ? `El servicio de asignación respondió con error: ${upstreamMsg}. Intenta de nuevo en unos segundos.`
            : 'El servicio de asignación no está disponible momentáneamente. Intenta de nuevo en unos segundos.'
        );
      } else if (status === 400 || status === 404 || (typeof upstreamStatus === 'number' && upstreamStatus >= 400 && upstreamStatus < 500)) {
        setAddConceptoError(upstreamMsg || 'La clave SAT no está disponible para asignación. Verifica e intenta con otra.');
      } else {
        setAddConceptoError(upstreamMsg || 'No se pudo agregar la clave. Verifica e intenta de nuevo.');
      }
    } finally {
      setAddingConcepto(false);
    }
  };

  const removeSelectedConcepto = (clave: string) => {
    setSelectedConceptos(selectedConceptos.filter(c => c.clave_prodserv !== clave));
    setAddConceptoError(null);
  };

  const pickConceptoOption = (opt: ConceptoOption) => { void tryAddConcepto(opt); };
  const addConceptoOption = (opt: ConceptoOption) => { void tryAddConcepto(opt); };

  // claveValidations existe sólo para compat con código existente que la lee
  // (validations vienen ya implícitas en selectedConceptos).
  type ClaveValidation = { clave: string; ok: boolean; descripcion?: string; loading?: boolean };
  const claveValidations: ClaveValidation[] = selectedConceptos.map(c => ({
    clave: c.clave_prodserv,
    ok: true,
    descripcion: c.descripcion,
  }));
  const [rateWidgetCurrency, setRateWidgetCurrency] = useState<'USD' | 'RMB'>('USD');

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
    } catch (err: any) {
      console.error('[ENTANGLED] persistSupplier:', err);
      // 409 → cuenta ya registrada con otro nombre: pedir contactar al asesor
      const status = err?.response?.status;
      const code = err?.response?.data?.error;
      if (status === 409 && code === 'CUENTA_REGISTRADA_NOMBRE_DISTINTO') {
        const message = err?.response?.data?.message
          || 'Esta cuenta bancaria ya está registrada con otro beneficiario. Por favor contacta a tu asesor para validar el alta.';
        setSnack({ open: true, severity: 'error', message });
      } else {
        setSnack({ open: true, severity: 'error', message: t('entangled.messages.error') });
      }
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

  // Subida diferida del comprobante a una solicitud existente.
  // Usa el endpoint multipart `/upload-proof-file` que, además de guardar el
  // archivo, dispara el envío a ENTANGLED si la solicitud aún estaba pendiente.
  const handleUploadProofToRequest = async (requestId: number, file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('comprobante', file);
      const res = await axios.post(
        `${API_URL}/api/entangled/payment-requests/${requestId}/upload-proof-file`,
        fd,
        { headers: { ...authHeader, 'Content-Type': 'multipart/form-data' } }
      );
      const sentToEntangled = !!res.data?.request?.entangled_transaccion_id;
      setSnack({
        open: true,
        severity: 'success',
        message: sentToEntangled
          ? t('entangled.messages.proofSentToEntangled', 'Comprobante recibido. Solicitud enviada a ENTANGLED.')
          : t('entangled.messages.proofUploaded', 'Comprobante subido correctamente.'),
      });
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

  // Helper: cargar imagen como dataURL para embeber en PDF
  const loadImageAsDataUrl = (url: string): Promise<string | null> =>
    fetch(url)
      .then(r => (r.ok ? r.blob() : Promise.reject(new Error('no asset'))))
      .then(blob => new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onloadend = () => res(fr.result as string);
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      }))
      .catch(() => null);

  /**
   * Comprobante "Instrucciones de Pago" — diseño corporativo premium estilo Fintech.
   *
   * Decisiones de diseño:
   *  - HEADER: cinta negra con logo X-PAY embebido + sello "SEGURO·CIFRADO·NIVEL BANCARIO".
   *  - REFERENCIA: card con borde naranja + tipografía monoespaciada bold + QR placeholder.
   *  - PANELES: cajas blancas con título naranja superior, filas label/value en grid 2-col,
   *    separadores finos, datos sensibles en monoespaciada (CLABE, cuenta, RFC).
   *  - TOTAL: barra negra con monto naranja XL para máxima visibilidad.
   *  - WATERMARK: "X-PAY" rotado 30° en gris muy tenue.
   *  - FOOTER: línea fina + nota de cifrado AES-256 + paginación.
   *  - PALETA: Negro #0A0A0A, Naranja #F05A28, grises #6B7280/#E5E7EB, blanco hueso.
   */
  const generateInstructionsPDF = async (override?: typeof lastCreated) => {
    const data = override || lastCreated;
    if (!data) return;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 48;
    const innerW = pageW - margin * 2;

    // Paleta corporativa
    const C_BLACK: [number, number, number] = [10, 10, 10];
    const C_ORANGE: [number, number, number] = [240, 90, 40];
    const C_TEXT: [number, number, number] = [17, 24, 39];
    const C_MUTED: [number, number, number] = [107, 114, 128];
    const C_BORDER: [number, number, number] = [229, 231, 235];

    // Watermark X-PAY rotado
    const drawWatermark = () => {
      doc.saveGraphicsState();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      doc.setGState((doc as any).GState({ opacity: 0.04 }));
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(140);
      doc.setTextColor(...C_BLACK);
      doc.text('X-PAY', pageW / 2, pageH / 2 + 30, { align: 'center', angle: 30 });
      doc.restoreGraphicsState();
    };

    // ─────── HEADER (cinta negra con logo + trust seal) ───────
    const headerH = 90;
    doc.setFillColor(...C_BLACK);
    doc.rect(0, 0, pageW, headerH, 'F');
    doc.setFillColor(...C_ORANGE);
    doc.rect(0, headerH, pageW, 3, 'F');

    const logoData = await loadImageAsDataUrl('/logo-completo-xpay-t.png');
    if (logoData) {
      try {
        doc.addImage(logoData, 'PNG', margin, 20, 130, 50, undefined, 'FAST');
      } catch {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor(255, 255, 255);
        doc.text('X-PAY', margin, 50);
      }
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(255, 255, 255);
      doc.text('X-PAY', margin, 50);
    }

    // Subtítulo a la derecha del logo
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(180, 180, 180);
    doc.text('INSTRUCCIONES DE PAGO', margin + 145, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text('Confirmación de solicitud de triangulación internacional', margin + 145, 58);

    // Trust seal (top-right)
    const trust = 'SEGURO  ·  CIFRADO  ·  NIVEL BANCARIO';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.6);
    const trustW = doc.getTextWidth(trust) + 16;
    doc.roundedRect(pageW - margin - trustW, 28, trustW, 16, 8, 8, 'D');
    doc.text(trust, pageW - margin - trustW / 2, 39, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(`Emitido: ${new Date().toLocaleString('es-MX')}`, pageW - margin, 60, { align: 'right' });

    drawWatermark();

    let y = headerH + 24;

    // ─────── REFERENCIA DE PAGO (card con QR) ───────
    const refH = 92;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...C_ORANGE);
    doc.setLineWidth(1.2);
    doc.roundedRect(margin, y, innerW, refH, 8, 8, 'FD');
    doc.setFillColor(...C_ORANGE);
    doc.rect(margin, y, 5, refH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C_MUTED);
    doc.text('REFERENCIA DE PAGO', margin + 18, y + 22);

    doc.setFont('courier', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(...C_ORANGE);
    doc.text(String(data.referencia_pago || ''), margin + 18, y + 56);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C_MUTED);
    doc.text('Incluye esta referencia en el concepto de tu', margin + 18, y + 72);
    doc.text('transferencia para conciliar tu pago automáticamente.', margin + 18, y + 82);

    // QR placeholder — patrón determinístico desde la referencia
    const qrSize = 60;
    const qrX = margin + innerW - qrSize - 16;
    const qrY = y + (refH - qrSize) / 2;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...C_BORDER);
    doc.setLineWidth(0.5);
    doc.rect(qrX, qrY, qrSize, qrSize, 'FD');
    const refStr = String(data.referencia_pago || 'XPAY');
    let seed = 0;
    for (let i = 0; i < refStr.length; i++) seed = (seed * 31 + refStr.charCodeAt(i)) | 0;
    const cells = 9;
    const cellSize = qrSize / cells;
    doc.setFillColor(...C_BLACK);
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        const inFinderTL = r < 3 && c < 3;
        const inFinderTR = r < 3 && c >= cells - 3;
        const inFinderBL = r >= cells - 3 && c < 3;
        if (inFinderTL || inFinderTR || inFinderBL) {
          const onBorder =
            (inFinderTL && (r === 0 || r === 2 || c === 0 || c === 2)) ||
            (inFinderTR && (r === 0 || r === 2 || c === cells - 1 || c === cells - 3)) ||
            (inFinderBL && (r === cells - 1 || r === cells - 3 || c === 0 || c === 2));
          const isCenter =
            (inFinderTL && r === 1 && c === 1) ||
            (inFinderTR && r === 1 && c === cells - 2) ||
            (inFinderBL && r === cells - 2 && c === 1);
          if (onBorder || isCenter) doc.rect(qrX + c * cellSize, qrY + r * cellSize, cellSize, cellSize, 'F');
          continue;
        }
        seed = (seed * 1103515245 + 12345) | 0;
        if ((seed & 1) === 1) doc.rect(qrX + c * cellSize, qrY + r * cellSize, cellSize, cellSize, 'F');
      }
    }

    y += refH + 24;

    // ─────── Helpers de paneles modulares ───────
    const opSnap = data.operationSnapshot;
    const benefSnap = data.beneficiarioSnapshot;
    const q = data.quote;

    const ensureSpace = (needed: number) => {
      if (y + needed > pageH - 70) { doc.addPage(); y = margin; }
    };

    // Panel header (small label naranja sobre línea naranja)
    const panelStart = (title: string) => {
      ensureSpace(40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...C_ORANGE);
      doc.text(title.toUpperCase(), margin, y);
      doc.setDrawColor(...C_ORANGE);
      doc.setLineWidth(1.2);
      doc.line(margin, y + 4, margin + 40, y + 4);
      y += 16;
    };

    // Fila label/value
    const panelRow = (label: string, value: string, opts: { mono?: boolean; emphasize?: boolean } = {}) => {
      ensureSpace(22);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...C_MUTED);
      doc.text(label, margin + 12, y);
      doc.setFont(opts.mono ? 'courier' : 'helvetica', opts.emphasize ? 'bold' : 'normal');
      doc.setFontSize(opts.emphasize ? 11 : 10);
      doc.setTextColor(...C_TEXT);
      const wrapped = doc.splitTextToSize(value, innerW - 200);
      doc.text(wrapped, margin + 200, y);
      y += Math.max(20, wrapped.length * 13);
      doc.setDrawColor(...C_BORDER);
      doc.setLineWidth(0.4);
      doc.line(margin + 12, y - 6, margin + innerW - 12, y - 6);
    };

    // Panel completo con borde fino
    const renderPanel = (title: string, fillRows: () => void) => {
      panelStart(title);
      const startY = y - 6;
      fillRows();
      const endY = y;
      doc.setDrawColor(...C_BORDER);
      doc.setLineWidth(0.6);
      doc.roundedRect(margin, startY, innerW, endY - startY + 4, 4, 4, 'D');
      y = endY + 14;
    };

    // ─────── PANEL: DETALLE DE LA OPERACIÓN ───────
    renderPanel('Detalle de la operación', () => {
      if (opSnap) {
        panelRow('Servicio', opSnap.requiere_factura ? 'Pago con factura' : 'Pago sin factura');
        panelRow('Divisa destino', opSnap.divisa);
        panelRow('Monto al proveedor', `$${formatMoney(opSnap.monto)} ${opSnap.divisa}`);
        if (opSnap.requiere_factura && opSnap.razon_social) panelRow('Razón social', opSnap.razon_social);
        if (opSnap.requiere_factura && opSnap.rfc) panelRow('RFC', opSnap.rfc, { mono: true });
      }
      if (q) {
        panelRow('Tipo de cambio', `$${q.tipo_cambio.toFixed(4)} MXN / ${opSnap?.divisa || 'USD'}`);
        panelRow('Comisión', `$${formatMoney(q.monto_mxn_comision)} MXN`);
      }
    });

    // ─────── BARRA DE TOTAL (negro + monto naranja) ───────
    if (q) {
      ensureSpace(54);
      doc.setFillColor(...C_BLACK);
      doc.roundedRect(margin, y, innerW, 46, 4, 4, 'F');
      doc.setFillColor(...C_ORANGE);
      doc.rect(margin, y, 4, 46, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(180, 180, 180);
      doc.text('TOTAL A PAGAR', margin + 18, y + 16);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(...C_ORANGE);
      doc.text(`$${formatMoney(q.monto_mxn_total)} MXN`, pageW - margin - 18, y + 30, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('Importe a transferir desde la cuenta del cliente.', margin + 18, y + 32);
      y += 60;
    }

    // ─────── PANEL: DEPOSITAR / TRANSFERIR A ───────
    const empresas = data.empresas_asignadas || [];
    const provSnap = data.providerSnapshot;

    if (empresas.length > 0) {
      renderPanel('Depositar / Transferir a', () => {
        empresas.forEach((emp, idx) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cb: any = emp.cuenta_bancaria || {};
          const banco = cb.banco || cb.bank;
          const titular = cb.titular || cb.holder || emp.empresa;
          const cuenta = cb.cuenta || cb.account || cb.numero_cuenta;
          const clabe = cb.clabe || cb.CLABE;
          const sucursal = cb.sucursal || cb.branch;
          const moneda = cb.moneda || cb.currency;
          if (titular) panelRow('Empresa receptora', String(titular), { emphasize: true });
          if (banco) panelRow('Banco', `${banco}${moneda ? `  (${moneda})` : ''}`);
          if (clabe) panelRow('CLABE', String(clabe), { mono: true });
          if (cuenta) panelRow('Cuenta', String(cuenta), { mono: true });
          if (sucursal) panelRow('Sucursal', String(sucursal));
          if (emp.clave_prodserv) panelRow('Clave(s) SAT', String(emp.clave_prodserv), { mono: true });
          if (idx < empresas.length - 1) y += 6;
        });
      });
    } else if (provSnap && provSnap.bank_accounts.length > 0) {
      const all = provSnap.bank_accounts;
      const mxn = all.filter((a) => String(a.currency || '').toUpperCase() === 'MXN');
      const accounts = mxn.length > 0 ? mxn : all;
      renderPanel(`Depositar / Transferir a — ${provSnap.name}`, () => {
        accounts.forEach((acc) => {
          if (acc.holder) panelRow('Titular', acc.holder, { emphasize: true });
          if (acc.bank) panelRow('Banco', `${acc.bank}${acc.currency ? `  (${acc.currency})` : ''}`);
          if (acc.clabe) panelRow('CLABE', acc.clabe, { mono: true });
          if (acc.account) panelRow('Cuenta', acc.account, { mono: true });
          if (acc.reference) panelRow('Referencia adicional', acc.reference);
        });
      });
    }

    // ─────── PANEL: BENEFICIARIO FINAL ───────
    if (benefSnap?.nombre) {
      renderPanel('Beneficiario final', () => {
        panelRow('Nombre', benefSnap.nombre, { emphasize: true });
        if (benefSnap.nombre_chino) panelRow('Nombre (chino)', benefSnap.nombre_chino);
        if (benefSnap.banco) panelRow('Banco', benefSnap.banco);
        if (benefSnap.cuenta) panelRow('Cuenta', benefSnap.cuenta, { mono: true });
        if (benefSnap.iban) panelRow('IBAN', benefSnap.iban, { mono: true });
        if (benefSnap.swift) panelRow('SWIFT/BIC', benefSnap.swift, { mono: true });
        if (benefSnap.aba) panelRow('ABA', benefSnap.aba, { mono: true });
      });
    }

    // ─────── AVISO IMPORTANTE ───────
    ensureSpace(70);
    doc.setFillColor(255, 250, 230);
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.6);
    doc.roundedRect(margin, y, innerW, 56, 4, 4, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(146, 64, 14);
    doc.text('IMPORTANTE', margin + 14, y + 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(120, 53, 15);
    doc.text(
      `Incluye la referencia ${data.referencia_pago || ''} en el concepto de tu transferencia.`,
      margin + 14, y + 33
    );
    doc.text(
      'Una vez realizado el depósito, sube tu comprobante desde "Últimos envíos" para procesar tu solicitud.',
      margin + 14, y + 46
    );
    y += 70;

    // ─────── FOOTER (en cada página) ───────
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setDrawColor(...C_BORDER);
      doc.setLineWidth(0.4);
      doc.line(margin, pageH - 48, pageW - margin, pageH - 48);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...C_BLACK);
      doc.text('X-PAY DIRECT', margin, pageH - 32);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...C_MUTED);
      doc.text('Operación protegida por cifrado bancario AES-256', margin, pageH - 22);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...C_MUTED);
      doc.text(
        `${new Date().toLocaleString('es-MX')}  ·  Página ${p} de ${totalPages}`,
        pageW - margin, pageH - 22, { align: 'right' }
      );
    }

    doc.save(`XPay_${data.referencia_pago || 'solicitud'}.pdf`);
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
    // Snapshot inmutable de las claves seleccionadas y su asignación,
    // para garantizar que los datos lleguen al modal aunque selectedConceptos
    // se limpie por la cadena de useEffect después del submit.
    const conceptosSnapshot = selectedConceptos.map(c => ({
      clave_prodserv: c.clave_prodserv,
      descripcion: c.descripcion,
      empresa: c.empresa,
      cuenta_bancaria: c.cuenta_bancaria,
    }));
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

      // Backend expects multipart/form-data (multer) — NO se envía a ENTANGLED aún,
      // sólo se crea la solicitud en estado "pendiente" hasta que se suba el comprobante.
      const fd = new FormData();
      fd.append('servicio', requiereFactura ? 'pago_con_factura' : 'pago_sin_factura');
      fd.append('monto_usd', String(Number(form.monto)));
      fd.append('divisa', form.divisa_destino);
      const conceptosArr = requiereFactura
        ? form.conceptos.split(',').map(s => s.trim()).filter(Boolean).map(c => ({ clave_prodserv: c }))
        : [];
      fd.append('conceptos', JSON.stringify(conceptosArr));
      const clienteFinal = requiereFactura
        ? {
            rfc: form.rfc.trim().toUpperCase(),
            razon_social: form.razon_social.trim(),
            regimen_fiscal: form.regimen_fiscal,
            cp: form.cp.trim(),
            uso_cfdi: form.uso_cfdi,
            email: form.email.trim(),
          }
        : { razon_social: form.razon_social.trim() || supplierForm.nombre_beneficiario || 'Público en General' };
      fd.append('cliente_final', JSON.stringify(clienteFinal));
      // Metadatos extra (proveedor de envío + provider_id seleccionado) en notas
      const notas = JSON.stringify({
        provider_id: selectedProviderId || null,
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
      });
      fd.append('notas', notas);

      const res = await axios.post(`${API_URL}/api/entangled/payment-requests`, fd, {
        headers: { ...authHeader, 'Content-Type': 'multipart/form-data' },
      });

      // Snapshots ANTES de limpiar el form (para el PDF y el modal)
      const provObj = providers.find((p) => p.id === selectedProviderId);
      const providerSnapshot = provObj
        ? {
            name: provObj.name,
            bank_accounts: Array.isArray(provObj.bank_accounts) ? provObj.bank_accounts : [],
          }
        : null;
      const operationSnapshot = {
        divisa: form.divisa_destino,
        monto: Number(form.monto),
        servicio: requiereFactura ? 'pago_con_factura' : 'pago_sin_factura',
        requiere_factura: requiereFactura,
        rfc: requiereFactura ? form.rfc : undefined,
        razon_social: requiereFactura ? form.razon_social : undefined,
      };
      const beneficiarioSnapshot = {
        nombre: supplierForm.nombre_beneficiario,
        nombre_chino: supplierForm.nombre_chino,
        cuenta: supplierForm.numero_cuenta,
        iban: supplierForm.iban,
        banco: supplierForm.banco_nombre,
        swift: supplierForm.swift_bic,
        aba: supplierForm.aba_routing,
      };

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
      // empresas_asignadas: con el nuevo flujo, ENTANGLED no responde con esto
      // hasta que se sube el comprobante. Mientras tanto usamos los datos
      // recolectados de /asignacion capturados en conceptosSnapshot.
      let empresasAsignadas: Array<{ clave_prodserv?: string; empresa?: string; monto?: number; divisa?: string; cuenta_bancaria?: unknown }> = [];
      if (Array.isArray(res.data?.empresas_asignadas) && res.data.empresas_asignadas.length > 0) {
        empresasAsignadas = res.data.empresas_asignadas;
      } else if (conceptosSnapshot.length > 0) {
        // Misma empresa para todas las claves (lo garantiza el bloqueo de empresa)
        empresasAsignadas = [{
          clave_prodserv: conceptosSnapshot.map(c => c.clave_prodserv).join(', '),
          empresa: conceptosSnapshot[0].empresa.razon_social,
          cuenta_bancaria: conceptosSnapshot[0].cuenta_bancaria,
        }];
      }

      // Mostrar instrucciones de pago
      setLastCreated({
        request: res.data?.request,
        instrucciones_pago: res.data?.instrucciones_pago,
        referencia_pago: res.data?.referencia_pago || res.data?.request?.referencia_pago,
        quote: res.data?.quote || quote,
        providerSnapshot,
        operationSnapshot,
        beneficiarioSnapshot,
        empresas_asignadas: empresasAsignadas,
        entangled_transaccion_id: res.data?.entangled_transaccion_id || res.data?.request?.entangled_transaccion_id,
      });
      setInstructionsOpen(true);
      const isPending =
        res.data?.requires_proof_upload ||
        res.data?.status === 'pendiente_comprobante' ||
        res.data?.request?.estatus_global === 'pendiente';
      setSnack({
        open: true,
        severity: 'success',
        message:
          res.data?.request?.estatus_global === 'error_envio'
            ? t('entangled.messages.successPending')
            : isPending
              ? t(
                  'entangled.messages.successAwaitingProof',
                  'Solicitud creada. Sube tu comprobante de pago desde "Últimos envíos" para enviarla a ENTANGLED.'
                )
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

  const validateWizardStep = (step: 0 | 1 | 2 | 3 | 4): string | null => {
    if (step === 0) {
      // Selector de servicio: siempre válido (default: requiereFactura=true)
      return null;
    }
    if (step === 1) {
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
      if (!form.conceptos || !form.conceptos.trim()) {
        return 'Captura al menos una clave SAT (clave_prodserv) a facturar';
      }
      if (claveValidations.some(v => v.loading)) {
        return 'Validando claves SAT, espera un momento...';
      }
      const invalid = claveValidations.filter(v => !v.ok && !v.loading).map(v => v.clave);
      if (invalid.length > 0) {
        return `Claves SAT no encontradas en catálogo: ${invalid.join(', ')}`;
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
    setWizardStep((s) => {
      if (s === 0) return 1;
      if (s === 1) return 2;
      if (s === 2) return requiereFactura ? 3 : 4;
      if (s === 3) return 4;
      return 4;
    });
  };

  const handleStartWizardFromWidget = () => {
    const amount = Number(widgetAmountUsd);
    setForm((prev) => ({
      ...prev,
      monto: Number.isFinite(amount) && amount > 0 ? String(amount) : prev.monto,
      divisa_destino: 'USD',
    }));
    setWizardStep(0);
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
                        {/* Referencia */}
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', px: 1, py: 0.3, borderRadius: 1, border: `1px solid ${ORANGE}55`, bgcolor: `${ORANGE}12` }}>
                            <Typography sx={{ color: ORANGE, fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.1em', fontFamily: 'monospace' }}>
                              {r.referencia_pago || `XP${String(r.id).padStart(6, '0')}`}
                            </Typography>
                          </Box>
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
                          {(() => {
                            const estatus = String(r.estatus_global || '').toLowerCase();
                            const isTerminal = ['cancelado', 'rechazado', 'completado', 'pagado'].includes(estatus);
                            const canUpload = !isTerminal && !r.op_comprobante_cliente_url;
                            return (
                              <Stack direction="row" spacing={0.4} justifyContent="center" alignItems="center">
                                {canUpload ? (
                                  <Tooltip title={t('entangled.actions.uploadMyProof', 'Subir comprobante de pago') as string}>
                                    <Button
                                      size="small"
                                      component="label"
                                      disabled={uploading}
                                      variant="contained"
                                      startIcon={<ReceiptLongIcon sx={{ fontSize: 14 }} />}
                                      sx={{
                                        bgcolor: ORANGE,
                                        color: '#fff',
                                        textTransform: 'none',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        px: 1.2,
                                        py: 0.4,
                                        minWidth: 0,
                                        boxShadow: '0 4px 12px rgba(255,138,0,0.35)',
                                        '&:hover': { bgcolor: '#e07a00', boxShadow: '0 6px 16px rgba(255,138,0,0.5)' },
                                        animation: 'xpay-pulse-orange 2s infinite',
                                        '@keyframes xpay-pulse-orange': {
                                          '0%, 100%': { boxShadow: '0 4px 12px rgba(255,138,0,0.35)' },
                                          '50%': { boxShadow: '0 4px 18px rgba(255,138,0,0.7)' },
                                        },
                                      }}
                                    >
                                      {t('entangled.actions.uploadProofShort', 'Subir')}
                                      <input hidden type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadProofToRequest(r.id, f); e.target.value = ''; }} />
                                    </Button>
                                  </Tooltip>
                                ) : r.op_comprobante_cliente_url ? (
                                  <Tooltip title={t('entangled.actions.viewMyProof', 'Ver mi comprobante') as string}>
                                    <IconButton size="small" component="a" href={r.op_comprobante_cliente_url} target="_blank" rel="noopener" sx={{ color: '#2e7d32', border: '1px solid rgba(46,125,50,0.4)', borderRadius: 1 }}>
                                      <DescriptionIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                ) : (
                                  <Typography sx={{ color: '#6b7280', fontSize: '0.7rem', fontStyle: 'italic' }}>—</Typography>
                                )}
                              </Stack>
                            );
                          })()}
                          {/* Chronometer or date */}
                          {r.comprobante_subido_at ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, px: 0.8, py: 0.3, borderRadius: 1, bgcolor: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.22)', width: 'fit-content' }}>
                              <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#4ade80', display: 'inline-block', animation: 'xpay-dot 1.4s infinite' }} />
                              <Typography sx={{ color: '#4ade80', fontSize: '0.65rem', fontWeight: 800, fontFamily: 'monospace' }}>
                                {formatElapsed(r.comprobante_subido_at, now)}
                              </Typography>
                            </Box>
                          ) : (
                            <Typography sx={{ color: '#6b7280', fontSize: '0.65rem', mt: 0.3 }}>
                              {new Date(r.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    )})
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>
        {/* Mis proveedores: 1/3 del ancho — alineado bajo Tasa de Cambio */}
        <Box sx={{ flex: '1 1 0', minWidth: { xs: '100%', md: 0 } }}>
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
          setWizardStep(0);
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
              { id: 0 as const, label: '0. Servicio', enabled: true },
              { id: 1 as const, label: '1. Moneda y monto', enabled: true },
              { id: 2 as const, label: '2. Beneficiario', enabled: true },
              { id: 3 as const, label: '3. Factura', enabled: requiereFactura },
              { id: 4 as const, label: '4. Resumen', enabled: true },
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
                  color: !s.enabled ? '#4b5563' : (wizardStep === s.id ? '#fff' : '#9ca3af'),
                  bgcolor: wizardStep === s.id ? 'rgba(240,90,40,0.26)' : '#121214',
                  cursor: s.enabled ? 'pointer' : 'not-allowed',
                  textDecoration: !s.enabled ? 'line-through' : 'none',
                  opacity: !s.enabled ? 0.5 : 1,
                }}
                onClick={() => { if (s.enabled) setWizardStep(s.id); }}
              >
                {s.label}
              </Box>
            ))}
          </Box>

          {wizardStep === 0 && (
            <Paper variant="outlined" sx={{ p: 2.5, mb: 2, bgcolor: '#1a1a1a', border: '1px solid #333333', borderRadius: 1 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5, color: '#ffffff' }}>
                ¿Qué tipo de envío necesitas?
              </Typography>
              <Typography variant="caption" sx={{ color: '#9ca3af', display: 'block', mb: 2 }}>
                Selecciona si requieres factura SAT para tu cliente final o si solo necesitas enviar el pago al proveedor.
              </Typography>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Card
                    onClick={() => { setRequiereFactura(true); setWizardStep(1); }}
                    sx={{
                      cursor: 'pointer',
                      bgcolor: requiereFactura ? 'rgba(240,90,40,0.12)' : '#0f0f10',
                      border: `2px solid ${requiereFactura ? ORANGE : '#2f2f33'}`,
                      transition: 'all 0.18s ease',
                      '&:hover': { borderColor: ORANGE, transform: 'translateY(-2px)' },
                    }}
                  >
                    <CardContent>
                      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                        <ReceiptLongIcon sx={{ color: ORANGE, fontSize: 32 }} />
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="subtitle1" fontWeight={800} sx={{ color: '#fff' }}>
                            Pago con factura SAT
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#9ca3af' }}>
                            Recomendado para empresas
                          </Typography>
                        </Box>
                      </Stack>
                      <Typography variant="body2" sx={{ color: '#d1d5db', mb: 1 }}>
                        Emite factura SAT a tu cliente final. Requiere datos fiscales (RFC, régimen, uso CFDI) y conceptos.
                      </Typography>

                      {(form.razon_social || form.rfc) && (
                        <Box sx={{ mt: 1, mb: 1, p: 1.2, bgcolor: 'rgba(240,90,40,0.08)', border: '1px dashed rgba(240,90,40,0.4)', borderRadius: 1 }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <CheckCircleIcon sx={{ color: ORANGE, fontSize: 18 }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="caption" sx={{ color: '#9ca3af', display: 'block', lineHeight: 1.1 }}>
                                Se facturará a:
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{ color: '#fff', fontWeight: 700, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                title={form.razon_social || ''}
                              >
                                {form.razon_social || '—'}
                              </Typography>
                              {form.rfc && (
                                <Typography variant="caption" sx={{ color: '#d1d5db', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                                  {form.rfc}
                                </Typography>
                              )}
                            </Box>
                          </Stack>
                        </Box>
                      )}

                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                        <Chip size="small" label="CFDI 4.0" sx={{ bgcolor: 'rgba(240,90,40,0.2)', color: ORANGE, fontWeight: 700 }} />
                        <Chip size="small" label="Triangulación SAT" sx={{ bgcolor: 'rgba(240,90,40,0.2)', color: ORANGE, fontWeight: 700 }} />
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <Card
                    onClick={() => { setRequiereFactura(false); setWizardStep(1); }}
                    sx={{
                      cursor: 'pointer',
                      bgcolor: !requiereFactura ? 'rgba(240,90,40,0.12)' : '#0f0f10',
                      border: `2px solid ${!requiereFactura ? ORANGE : '#2f2f33'}`,
                      transition: 'all 0.18s ease',
                      '&:hover': { borderColor: ORANGE, transform: 'translateY(-2px)' },
                    }}
                  >
                    <CardContent>
                      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                        <AccountBalanceWalletOutlinedIcon sx={{ color: ORANGE, fontSize: 32 }} />
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="subtitle1" fontWeight={800} sx={{ color: '#fff' }}>
                            Pago sin factura
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#9ca3af' }}>
                            Más rápido, sin trámite fiscal
                          </Typography>
                        </Box>
                      </Stack>
                      <Typography variant="body2" sx={{ color: '#d1d5db', mb: 1 }}>
                        Solo envía el pago al proveedor internacional. No se emite factura SAT.
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                        <Chip size="small" label="Sin RFC" sx={{ bgcolor: 'rgba(240,90,40,0.2)', color: ORANGE, fontWeight: 700 }} />
                        <Chip size="small" label="Proceso ágil" sx={{ bgcolor: 'rgba(240,90,40,0.2)', color: ORANGE, fontWeight: 700 }} />
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2.5, p: 1.5, bgcolor: '#0f0f10', borderRadius: 1, border: '1px dashed #2f2f33' }}>
                <ShieldOutlinedIcon sx={{ color: ORANGE }} />
                <Box>
                  <Typography variant="caption" sx={{ color: '#d1d5db', fontWeight: 700, display: 'block' }}>
                    {requiereFactura
                      ? (form.razon_social
                          ? `Has seleccionado: Pago con factura SAT a ${form.razon_social}`
                          : 'Has seleccionado: Pago con factura SAT')
                      : 'Has seleccionado: Pago sin factura'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#9ca3af' }}>
                    Puedes cambiar esta selección en cualquier momento desde la barra de pasos.
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          )}

          {wizardStep === 1 && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: '#1a1a1a', border: '1px solid #333333', borderRadius: 1 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2, color: '#ffffff' }}>
              💵 {t('entangled.sections.operation')}
            </Typography>

            <Grid container spacing={2}>
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
                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: ORANGE, mb: 1.5 }}>
                    {t('entangled.wizard.quote', 'Cotización')}
                  </Typography>

                  {/* Encabezado: monto a enviar + TC */}
                  <Stack spacing={0.5} sx={{ mb: 1.5 }}>
                    <Typography variant="body2" sx={{ color: '#ffffff' }}>
                      {t('entangled.wizard.amountSent', 'Monto a enviar al proveedor')}: <strong>${formatMoney(form.monto)} {form.divisa_destino}</strong>
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#ffffff' }}>
                      {t('entangled.wizard.fxRate', 'Tipo de cambio')}: <strong>${quote.tipo_cambio.toFixed(4)} MXN / {form.divisa_destino}</strong>
                    </Typography>
                  </Stack>

                  {/* Desglose detallado */}
                  <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', pt: 1.2 }}>
                    <Typography variant="caption" sx={{ color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, fontSize: '0.65rem', display: 'block', mb: 0.8 }}>
                      Desglose de cobranza
                    </Typography>
                    <Stack spacing={0.6}>
                      {/* Subtotal en MXN */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" sx={{ color: '#d1d5db', fontSize: '0.85rem' }}>
                          Subtotal ({formatMoney(form.monto)} {form.divisa_destino} × ${quote.tipo_cambio.toFixed(4)})
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#fff', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                          ${formatMoney(quote.monto_mxn_base)} MXN
                        </Typography>
                      </Box>
                      {/* Comisión XPAY (porcentaje) */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" sx={{ color: '#d1d5db', fontSize: '0.85rem' }}>
                          Comisión XPAY ({quote.porcentaje_compra.toFixed(2)}%)
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#fff', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                          ${formatMoney(quote.monto_mxn_comision)} MXN
                        </Typography>
                      </Box>
                      {/* Costo de operación */}
                      {quote.monto_mxn_costo_op > 0 && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" sx={{ color: '#d1d5db', fontSize: '0.85rem' }}>
                            Costo de operación (${quote.costo_operacion_usd.toFixed(2)} USD × ${quote.tipo_cambio.toFixed(4)})
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#fff', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                            ${formatMoney(quote.monto_mxn_costo_op)} MXN
                          </Typography>
                        </Box>
                      )}
                    </Stack>
                  </Box>

                  {/* Total destacado */}
                  <Box sx={{
                    mt: 1.5,
                    pt: 1.2,
                    borderTop: `1px solid ${ORANGE}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <Typography variant="body2" sx={{ color: ORANGE, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.8rem' }}>
                      {t('entangled.wizard.totalToPay', 'Total a pagar')}
                    </Typography>
                    <Typography variant="h6" sx={{ color: ORANGE, fontWeight: 900, fontFamily: 'monospace' }}>
                      ${formatMoney(quote.monto_mxn_total)} MXN
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            )}
          </Paper>
          )}

          {/* === Paso 3: Clave SAT a facturar + datos fiscales (solo si eligió "con factura" en paso 0) === */}
          {wizardStep === 3 && requiereFactura && (
            <>
              {/* Banner informativo: ya se eligió "con factura" en paso 0 */}
              <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: '#1a1a1a', border: `1px solid ${ORANGE}`, borderRadius: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <CheckCircleIcon sx={{ color: ORANGE, fontSize: 20 }} />
                  <Typography variant="body2" sx={{ color: '#ffffff' }}>
                    <strong style={{ color: ORANGE }}>Pago con factura SAT</strong> — indica la clave de producto/servicio a facturar y verifica tus datos fiscales.
                  </Typography>
                </Stack>
              </Paper>

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

              {/* Clave SAT — SIEMPRE visible (incluso con datos fiscales precargados) */}
              <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: '#1a1a1a', border: '1px solid #333333', borderRadius: 1 }}>
                <Typography variant="caption" sx={{ color: ORANGE, fontWeight: 700, display: 'block', mb: 1 }}>
                  📝 Productos SAT a facturar *
                </Typography>
                <Box sx={{ position: 'relative' }}>
                  <TextField
                    fullWidth label="Buscar producto o ingresar clave SAT" value={conceptoSearchInput}
                    onChange={(e) => setConceptoSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      const v = conceptoSearchInput.trim();
                      if (e.key === 'Enter' && /^\d{8}$/.test(v)) {
                        e.preventDefault();
                        void tryAddConcepto({ clave_prodserv: v, descripcion: '' });
                      }
                    }}
                    disabled={addingConcepto}
                    placeholder={lockedEmpresa ? `Buscar otro producto de ${lockedEmpresa.razon_social}…` : 'Ej.: puertas, madera, 84111506'}
                    helperText={lockedEmpresa
                      ? `Solo puedes agregar productos de "${lockedEmpresa.razon_social}". Para cambiar de empresa, elimina las claves seleccionadas.`
                      : 'Escriba el nombre del producto o la clave SAT y selecciónelo del listado. Puede agregar varios productos.'}
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
                      '& .MuiFormHelperText-root': { color: '#9ca3af' },
                    }}
                  />
                  {/* Dropdown de sugerencias — visible mientras el usuario escribe texto (no código de 8 dígitos) */}
                  {activeToken && !/^\d{8}$/.test(activeToken) && (
                    <Paper sx={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, bgcolor: '#1a1a1a', border: `1px solid ${ORANGE}`, borderRadius: 1, maxHeight: 280, overflowY: 'auto', mt: 0.5 }}>
                      {conceptoSearching && (
                        <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                          <CircularProgress size={14} sx={{ color: ORANGE }} />
                          <Typography variant="caption" sx={{ color: '#9ca3af' }}>Buscando en catálogo SAT…</Typography>
                        </Box>
                      )}
                      {!conceptoSearching && conceptoSearchError && (
                        <Box sx={{ p: 1.5 }}>
                          <Typography variant="caption" sx={{ color: '#ef4444' }}>⚠️ {conceptoSearchError}</Typography>
                        </Box>
                      )}
                      {!conceptoSearching && !conceptoSearchError && conceptoOptions.length === 0 && (
                        <Box sx={{ p: 1.5 }}>
                          <Typography variant="caption" sx={{ color: '#6b7280' }}>Sin resultados para "{activeToken}"</Typography>
                        </Box>
                      )}
                      {!conceptoSearching && conceptoOptions.map((opt) => (
                        <Box
                          key={opt.clave_prodserv}
                          sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid #222',
                            '&:hover': { bgcolor: 'rgba(240,90,40,0.10)' } }}
                        >
                          <Box onClick={() => pickConceptoOption(opt)} sx={{ flex: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: ORANGE, fontSize: '0.8rem', minWidth: 80 }}>
                              {opt.clave_prodserv}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#d1d5db', lineHeight: 1.3 }}>
                              {opt.descripcion}
                            </Typography>
                          </Box>
                          <Tooltip title="Agregar a la lista">
                            <IconButton size="small" onClick={() => addConceptoOption(opt)}
                              sx={{ color: ORANGE, '&:hover': { bgcolor: 'rgba(240,90,40,0.2)' } }}>
                              <AddIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      ))}
                    </Paper>
                  )}
                </Box>

                {/* Spinner mientras se agrega una clave */}
                {addingConcepto && (
                  <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={14} sx={{ color: ORANGE }} />
                    <Typography variant="caption" sx={{ color: '#9ca3af' }}>Verificando empresa asignada…</Typography>
                  </Box>
                )}

                {/* Error al intentar agregar */}
                {addConceptoError && !addingConcepto && (
                  <Alert severity="warning" sx={{ mt: 1.5, bgcolor: 'rgba(239, 68, 68, 0.10)', color: '#fecaca', border: '1px solid #ef4444', '& .MuiAlert-icon': { color: '#ef4444' } }}
                    onClose={() => setAddConceptoError(null)}>
                    {addConceptoError}
                  </Alert>
                )}

                {/* Lista de claves seleccionadas — chips con descripción y botón de eliminar */}
                {selectedConceptos.length > 0 && (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" sx={{ color: '#9ca3af', display: 'block', mb: 0.5 }}>
                      {selectedConceptos.length === 1 ? '1 producto agregado' : `${selectedConceptos.length} productos agregados`}
                    </Typography>
                    {selectedConceptos.map((c) => (
                      <Box key={c.clave_prodserv}
                        sx={{
                          display: 'flex', alignItems: 'center', gap: 1, py: 0.8, px: 1.2, mb: 0.5,
                          borderRadius: 1,
                          bgcolor: 'rgba(16, 185, 129, 0.12)',
                          border: '1px solid #10b981',
                        }}
                      >
                        <Typography sx={{ color: '#10b981', fontWeight: 700 }}>✓</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
                          {c.clave_prodserv}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#d1d5db', flex: 1 }}>
                          {c.descripcion || '—'}
                        </Typography>
                        <IconButton size="small" onClick={() => removeSelectedConcepto(c.clave_prodserv)}
                          sx={{ color: '#9ca3af', '&:hover': { color: '#ef4444', bgcolor: 'rgba(239,68,68,0.15)' } }}>
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Box>
                    ))}
                  </Box>
                )}

                {/* Empresa que recibirá el pago — sólo cuando hay al menos una clave */}
                {lockedEmpresa && (
                  <Box
                    sx={{
                      mt: 1.5,
                      p: 1.5,
                      borderRadius: 1,
                      border: `1px solid ${ORANGE}`,
                      bgcolor: 'rgba(240, 90, 40, 0.10)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Typography sx={{ color: ORANGE, fontSize: 18, mr: 1 }}>🏢</Typography>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" sx={{ color: '#9ca3af', display: 'block' }}>
                        Empresa que enviará el pago
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#fff', fontWeight: 700 }}>{lockedEmpresa.razon_social}</Typography>
                      <Typography variant="caption" sx={{ color: '#9ca3af', fontFamily: 'monospace' }}>{lockedEmpresa.rfc}</Typography>
                    </Box>
                  </Box>
                )}
              </Paper>
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
              {asignacion?.loading ? (
                <Box sx={{ mt: 0.5, p: 1.2, bgcolor: '#0a0a0a', border: '1px solid #333', borderRadius: 1.5 }}>
                  <Typography sx={{ color: '#9ca3af', fontSize: '0.82rem' }}>Consultando asignación bancaria…</Typography>
                </Box>
              ) : asignacion?.cuenta_bancaria ? (() => {
                const cb = asignacion.cuenta_bancaria!;
                return (
                  <Box sx={{ mt: 0.5, p: 1.2, bgcolor: '#0a0a0a', border: '1px solid rgba(240,90,40,0.45)', borderRadius: 1.5 }}>
                    <Typography sx={{ color: '#f97316', fontSize: '0.78rem', fontWeight: 700, mb: 0.8, letterSpacing: 0.4 }}>
                      🏦 CUENTA BANCARIA DESTINO
                    </Typography>
                    {asignacion.empresa && (
                      <Typography sx={{ color: '#fff', fontSize: '0.82rem', fontWeight: 600, mb: 0.5 }}>{asignacion.empresa.razon_social}</Typography>
                    )}
                    {cb.banco && <Typography sx={{ color: '#d1d5db', fontSize: '0.82rem' }}>Banco: <strong>{cb.banco}</strong>{cb.moneda ? ` (${cb.moneda})` : ''}</Typography>}
                    {cb.titular && <Typography sx={{ color: '#9ca3af', fontSize: '0.78rem' }}>Titular: {cb.titular}</Typography>}
                    {cb.clabe && <Typography sx={{ color: '#d1d5db', fontSize: '0.82rem', fontFamily: 'monospace' }}>CLABE: {cb.clabe}</Typography>}
                    {cb.cuenta && <Typography sx={{ color: '#d1d5db', fontSize: '0.82rem', fontFamily: 'monospace' }}>Cuenta: {cb.cuenta}</Typography>}
                    {cb.sucursal && <Typography sx={{ color: '#9ca3af', fontSize: '0.78rem' }}>Sucursal: {cb.sucursal}</Typography>}
                    {asignacion.facturacion?.sustitucion && (
                      <Typography sx={{ color: '#facc15', fontSize: '0.75rem', mt: 0.5 }}>
                        ⚠️ Clave sustituida: {asignacion.facturacion.clave_solicitada} → {asignacion.facturacion.clave_facturacion}
                      </Typography>
                    )}
                  </Box>
                );
              })() : (
                <Box sx={{ mt: 0.5, p: 1.2, bgcolor: '#0a0a0a', border: '1px solid rgba(59,130,246,0.45)', borderRadius: 1.5 }}>
                  <Typography sx={{ color: '#93c5fd', fontSize: '0.78rem', fontWeight: 700, mb: 0.4, letterSpacing: 0.4 }}>ℹ️ CUENTA BANCARIA DESTINO</Typography>
                  <Typography sx={{ color: '#bfdbfe', fontSize: '0.82rem', lineHeight: 1.4 }}>
                    {asignacion?.error || 'La cuenta bancaria se asignará al confirmar según la clave SAT seleccionada.'}
                  </Typography>
                </Box>
              )}
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
        <DialogActions sx={{ bgcolor: '#0a0a0a', borderTop: '1px solid #333333', p: 2, display: 'flex', gap: 1 }}>
          <Button onClick={() => { setDialogOpen(false); setWizardStep(0); }} sx={{ color: '#888888', mr: 'auto', '&:hover': { bgcolor: '#2a2a2a' } }}>
            {t('common.cancel')}
          </Button>
          {wizardStep > 0 && (
            <Button variant="outlined" onClick={() => setWizardStep((s) => {
              if (s === 4) return requiereFactura ? 3 : 2;
              if (s === 3) return 2;
              if (s === 2) return 1;
              if (s === 1) return 0;
              return 0;
            })}
              sx={{ borderColor: '#555', color: '#ddd', minWidth: 90, flex: '0 0 auto' }}>
              {t('common.back', 'Atrás')}
            </Button>
          )}
          {wizardStep < 4 ? (
            <Button variant="contained" onClick={goNextWizardStep}
              sx={{ bgcolor: ORANGE, color: '#000', fontWeight: 700, minWidth: 90, flex: '0 0 auto', '&:hover': { bgcolor: '#E54A1F' } }}>
              {t('common.next', 'Siguiente')}
            </Button>
          ) : (            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={submitting || !quote}
              sx={{ bgcolor: ORANGE, color: '#000000', fontWeight: 700, minWidth: 90, flex: '0 0 auto', '&:hover': { bgcolor: '#E54A1F' }, '&:disabled': { bgcolor: '#663333', color: '#333333' } }}
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
          {/* Referencia de pago — visible siempre */}
          {lastCreated?.referencia_pago && (
            <Box sx={{ mb: 2, p: 2, borderRadius: 2, bgcolor: 'rgba(255,102,0,0.08)', border: '1px solid rgba(255,102,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
              <Box>
                <Typography variant="caption" sx={{ color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, fontSize: '0.65rem' }}>
                  Referencia de pago
                </Typography>
                <Typography sx={{ fontFamily: 'monospace', fontSize: '1.6rem', fontWeight: 900, color: ORANGE, letterSpacing: '0.1em', lineHeight: 1.1 }}>
                  {lastCreated.referencia_pago}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    try { navigator.clipboard.writeText(String(lastCreated.referencia_pago)); } catch {}
                    setSnack({ open: true, severity: 'success', message: 'Referencia copiada' });
                  }}
                  sx={{ borderColor: ORANGE, color: ORANGE, fontWeight: 700, '&:hover': { borderColor: ORANGE, bgcolor: 'rgba(255,102,0,0.08)' } }}
                >
                  Copiar
                </Button>
              </Stack>
            </Box>
          )}

          {lastCreated?.quote && (
            <Card sx={{ mb: 2, bgcolor: 'rgba(255,102,0,0.08)', border: `1px solid rgba(255,102,0,0.45)` }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ color: ORANGE, fontWeight: 700 }}>
                  {t('entangled.wizard.totalToPay', 'Total a pagar')}
                </Typography>
                <Typography variant="h5" sx={{ color: '#ffffff' }}>
                  ${formatMoney(lastCreated.quote.monto_mxn_total)} MXN
                </Typography>
                {lastCreated.operationSnapshot && (
                  <Typography variant="caption" sx={{ color: '#bbb', display: 'block', mt: 0.5 }}>
                    Equivalente a ${formatMoney(lastCreated.operationSnapshot.monto)} {lastCreated.operationSnapshot.divisa} al tipo de cambio ${lastCreated.quote.tipo_cambio.toFixed(4)} MXN/{lastCreated.operationSnapshot.divisa}
                  </Typography>
                )}
              </CardContent>
            </Card>
          )}

          {/* Cuenta(s) bancaria(s) ASIGNADAS POR ENTANGLED (dinámicas según clave SAT) */}
          {lastCreated?.empresas_asignadas && lastCreated.empresas_asignadas.length > 0 && (
            <Card sx={{ mb: 2, bgcolor: '#0a0a0a', border: `1px solid ${ORANGE}` }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ color: ORANGE, fontWeight: 800, mb: 1, letterSpacing: 0.4 }}>
                  💳 DEPOSITAR / TRANSFERIR A — Cuenta(s) asignada(s)
                </Typography>
                {lastCreated.empresas_asignadas.map((emp, i) => {
                  const cb: any = emp.cuenta_bancaria || {};
                  const banco = cb.banco || cb.bank || '';
                  const titular = cb.titular || cb.holder || emp.empresa || '';
                  const cuenta = cb.cuenta || cb.account || cb.numero_cuenta || '';
                  const clabe = cb.clabe || cb.CLABE || '';
                  const sucursal = cb.sucursal || cb.branch || '';
                  return (
                    <Box key={i} sx={{ mb: i < (lastCreated.empresas_asignadas?.length || 0) - 1 ? 1.5 : 0, pb: i < (lastCreated.empresas_asignadas?.length || 0) - 1 ? 1.5 : 0, borderBottom: i < (lastCreated.empresas_asignadas?.length || 0) - 1 ? '1px dashed #333' : 'none' }}>
                      {emp.clave_prodserv && (
                        <Typography sx={{ color: '#9ca3af', fontSize: '0.72rem', mb: 0.4, letterSpacing: 0.5 }}>
                          Clave SAT: <strong style={{ color: '#fff', fontFamily: 'monospace' }}>{emp.clave_prodserv}</strong>
                          {emp.monto != null && <span> · Monto: <strong style={{ color: '#fff' }}>${formatMoney(emp.monto)} {emp.divisa || ''}</strong></span>}
                        </Typography>
                      )}
                      {banco && <Typography sx={{ color: '#d1d5db', fontSize: '0.92rem' }}>Banco: <strong style={{ color: '#fff' }}>{banco}</strong></Typography>}
                      {titular && <Typography sx={{ color: '#d1d5db', fontSize: '0.92rem' }}>Titular: <strong style={{ color: '#fff' }}>{titular}</strong></Typography>}
                      {cuenta && (
                        <Stack direction="row" spacing={0.8} alignItems="center">
                          <Typography sx={{ color: '#d1d5db', fontSize: '0.92rem' }}>Cuenta: <strong style={{ color: '#fff', fontFamily: 'monospace' }}>{cuenta}</strong></Typography>
                          <Button size="small" onClick={() => { try { navigator.clipboard.writeText(String(cuenta)); } catch {} }} sx={{ minWidth: 0, py: 0, px: 0.8, fontSize: '0.7rem', color: ORANGE, textTransform: 'none' }}>Copiar</Button>
                        </Stack>
                      )}
                      {clabe && (
                        <Stack direction="row" spacing={0.8} alignItems="center">
                          <Typography sx={{ color: '#d1d5db', fontSize: '0.92rem' }}>CLABE: <strong style={{ color: '#fff', fontFamily: 'monospace' }}>{clabe}</strong></Typography>
                          <Button size="small" onClick={() => { try { navigator.clipboard.writeText(String(clabe)); } catch {} }} sx={{ minWidth: 0, py: 0, px: 0.8, fontSize: '0.7rem', color: ORANGE, textTransform: 'none' }}>Copiar</Button>
                        </Stack>
                      )}
                      {sucursal && <Typography sx={{ color: '#d1d5db', fontSize: '0.92rem' }}>Sucursal: <strong style={{ color: '#fff' }}>{sucursal}</strong></Typography>}
                    </Box>
                  );
                })}
                <Alert severity="warning" sx={{ mt: 1.5, bgcolor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', color: '#fcd34d' }}>
                  Incluye la referencia <strong style={{ color: '#fff', fontFamily: 'monospace' }}>{lastCreated.referencia_pago}</strong> en el concepto de tu transferencia.
                </Alert>
              </CardContent>
            </Card>
          )}

          {/* Fallback legacy: cuenta(s) bancaria(s) del proveedor (si ENTANGLED no devolvió empresas_asignadas) */}
          {(!lastCreated?.empresas_asignadas || lastCreated.empresas_asignadas.length === 0) && lastCreated?.providerSnapshot && lastCreated.providerSnapshot.bank_accounts.length > 0 && (() => {
            const all = lastCreated.providerSnapshot.bank_accounts;
            const mxn = all.filter((a) => String(a.currency || '').toUpperCase() === 'MXN');
            const accounts = mxn.length > 0 ? mxn : all;
            return (
              <Card sx={{ mb: 2, bgcolor: '#0a0a0a', border: `1px solid ${ORANGE}` }}>
                <CardContent>
                  <Typography variant="subtitle2" sx={{ color: ORANGE, fontWeight: 800, mb: 1, letterSpacing: 0.4 }}>
                    💳 DEPOSITAR / TRANSFERIR A — {lastCreated.providerSnapshot.name}
                  </Typography>
                  {accounts.map((acc, i) => (
                    <Box key={i} sx={{ mb: i < accounts.length - 1 ? 1.5 : 0, pb: i < accounts.length - 1 ? 1.5 : 0, borderBottom: i < accounts.length - 1 ? '1px dashed #333' : 'none' }}>
                      {acc.bank && <Typography sx={{ color: '#d1d5db', fontSize: '0.92rem' }}>Banco: <strong style={{ color: '#fff' }}>{acc.bank}</strong>{acc.currency ? <span style={{ color: '#888' }}> ({acc.currency})</span> : null}</Typography>}
                      {acc.holder && <Typography sx={{ color: '#d1d5db', fontSize: '0.92rem' }}>Titular: <strong style={{ color: '#fff' }}>{acc.holder}</strong></Typography>}
                      {acc.account && (
                        <Stack direction="row" spacing={0.8} alignItems="center">
                          <Typography sx={{ color: '#d1d5db', fontSize: '0.92rem' }}>Cuenta: <strong style={{ color: '#fff', fontFamily: 'monospace' }}>{acc.account}</strong></Typography>
                          <Button size="small" onClick={() => { try { navigator.clipboard.writeText(String(acc.account)); } catch {} }} sx={{ minWidth: 0, py: 0, px: 0.8, fontSize: '0.7rem', color: ORANGE, textTransform: 'none' }}>Copiar</Button>
                        </Stack>
                      )}
                      {acc.clabe && (
                        <Stack direction="row" spacing={0.8} alignItems="center">
                          <Typography sx={{ color: '#d1d5db', fontSize: '0.92rem' }}>CLABE: <strong style={{ color: '#fff', fontFamily: 'monospace' }}>{acc.clabe}</strong></Typography>
                          <Button size="small" onClick={() => { try { navigator.clipboard.writeText(String(acc.clabe)); } catch {} }} sx={{ minWidth: 0, py: 0, px: 0.8, fontSize: '0.7rem', color: ORANGE, textTransform: 'none' }}>Copiar</Button>
                        </Stack>
                      )}
                      {acc.reference && <Typography sx={{ color: '#d1d5db', fontSize: '0.92rem' }}>Referencia adicional: <strong style={{ color: '#fff' }}>{acc.reference}</strong></Typography>}
                    </Box>
                  ))}
                  <Alert severity="warning" sx={{ mt: 1.5, bgcolor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', color: '#fcd34d' }}>
                    Incluye la referencia <strong style={{ color: '#fff', fontFamily: 'monospace' }}>{lastCreated.referencia_pago}</strong> en el concepto de tu transferencia.
                  </Alert>
                </CardContent>
              </Card>
            );
          })()}

          <Alert severity="info" sx={{ bgcolor: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.45)', color: '#bfdbfe' }}>
            <Typography sx={{ color: '#93c5fd', fontWeight: 600 }}>
              ℹ️ Una vez realizada la transferencia, sube tu comprobante desde "Últimos envíos" para procesar tu solicitud con ENTANGLED.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions sx={{ bgcolor: '#070709', borderTop: '1px solid #333333', p: 2 }}>
          <Button
            onClick={() => generateInstructionsPDF()}
            variant="outlined"
            sx={{ borderColor: ORANGE, color: ORANGE, fontWeight: 700, px: 3, '&:hover': { borderColor: ORANGE, bgcolor: 'rgba(255,102,0,0.08)' } }}
          >
            📄 Descargar PDF
          </Button>
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
