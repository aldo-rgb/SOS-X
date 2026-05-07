import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Paper, TextField, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Avatar, CircularProgress,
  Alert, Snackbar, IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, FormControl, InputLabel, Select, MenuItem, InputAdornment,
  Tabs, Tab, Card, CardContent, Divider, Switch, FormControlLabel
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange';
import PaymentsIcon from '@mui/icons-material/Payments';
import BusinessIcon from '@mui/icons-material/Business';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import CancelIcon from '@mui/icons-material/Cancel';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import HubIcon from '@mui/icons-material/Hub';
import SecurityIcon from '@mui/icons-material/Security';
import BoltIcon from '@mui/icons-material/Bolt';
import PublicIcon from '@mui/icons-material/Public';
import EntangledAdminTab from '../components/EntangledAdminTab';
import ClaveSatSearchBlock from '../components/ClaveSatSearchBlock';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const ORANGE = '#FF6600';
const ORANGE_DARK = '#E05500';
// Tokens base — se sobre-escriben dentro del componente cuando adminMode = true
// para presentar la vista de administrador en modo blanco/claro mientras
// la vista de cliente conserva el tema oscuro premium.
const CHARCOAL_DARK = '#0D0D0D';
const SURFACE_DARK = '#141414';
const SURFACE2_DARK = '#1C1C1C';
const BORDER_DARK = '#2A2A2A';
const WORLD_MAP_BG = '/mapamundi2.png';

/* ── X-Pay CSS keyframes injected once ── */
const xpayStyles = `
  @keyframes xpay-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255,102,0,0); }
    50% { box-shadow: 0 0 28px 6px rgba(255,102,0,0.45); }
  }
  @keyframes xpay-breathe {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; }
  }
  @keyframes xpay-ticker {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  @keyframes xpay-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
`;
if (typeof document !== 'undefined' && !document.getElementById('xpay-style')) {
  const s = document.createElement('style');
  s.id = 'xpay-style';
  s.textContent = xpayStyles;
  document.head.appendChild(s);
}

interface Provider {
  id: number;
  name: string;
  base_cost_percent: number;
  fixed_fee: number;
  is_active: boolean;
}

interface Payment {
  id: number;
  user_id: number;
  client_name: string;
  client_email: string;
  amount_usd: number;
  exchange_rate: number;
  client_fee_percent: number;
  fixed_fee_charged: number;
  total_usd: number;
  total_mxn: number;
  provider_cost: number;
  platform_profit: number;
  advisor_profit: number;
  provider_name: string;
  status: string;
  proof_url: string;
  notes: string;
  created_at: string;
}

interface Stats {
  pending: number;
  processing: number;
  completed: number;
  rejected: number;
  total_usd_completed: number;
  total_platform_profit: number;
  total_advisor_profit: number;
}

export default function SupplierPaymentsPage({ adminMode = false }: { adminMode?: boolean }) {
  useTranslation();

  // ─── Tokens de tema ──────────────────────────────────────────────
  // En modo admin la vista debe ser blanca/clara; en modo cliente
  // conservamos el tema oscuro premium fintech.
  const CHARCOAL = adminMode ? '#F5F6F8' : CHARCOAL_DARK;
  const SURFACE = adminMode ? '#FFFFFF' : SURFACE_DARK;
  const SURFACE2 = adminMode ? '#F8F9FB' : SURFACE2_DARK;
  const BORDER = adminMode ? '#E5E7EB' : BORDER_DARK;
  const HEADER_BG = adminMode ? '#F9FAFB' : '#0a0a0a';
  const INNER_BG = adminMode ? '#F3F4F6' : '#1a1a1a';
  const TEXT_PRIMARY = adminMode ? '#111827' : '#ffffff';
  const TEXT_SECONDARY = adminMode ? '#374151' : '#cccccc';
  const TEXT_MUTED = adminMode ? '#6B7280' : '#888888';
  const TEXT_DIM = adminMode ? '#9CA3AF' : '#666666';
  const TEXT_DIMMER = adminMode ? '#B0B6BF' : '#555555';

  const [tabValue, setTabValue] = useState(3);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Estado
  const [providers, setProviders] = useState<Provider[]>([]);
  void providers; // legacy: payment_providers (con costo/cargo) ya no se muestra; se conserva la carga para no romper integraciones
  const [payments, setPayments] = useState<Payment[]>([]);
  const [entangledRequests, setEntangledRequests] = useState<any[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [requestSearch, setRequestSearch] = useState('');

  // Modal Proveedor
  const [providerModal, setProviderModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);

  // ENTANGLED — proveedores (sincronizados desde el API; admin solo edita overrides)
  type EntBankAccount = { currency: string; bank: string; holder: string; account: string; clabe: string; reference: string };
  type EntProvider = {
    id: number;
    name: string;
    code: string | null;
    tipo_cambio_usd: number | string;
    tipo_cambio_rmb: number | string;
    porcentaje_compra: number | string;
    costo_operacion_usd: number | string;
    override_tipo_cambio_usd: number | string | null;
    override_tipo_cambio_rmb: number | string | null;
    override_porcentaje_compra: number | string | null;
    override_costo_operacion_usd: number | string | null;
    asesor_pct: number | string | null;
    over_pct: number | string | null;
    over_split_asesor: number | string | null;
    cancellation_fee_usd: number | string | null;
    min_operacion_usd: number | string | null;
    min_operacion_rmb: number | string | null;
    effective_tipo_cambio_usd?: number | string;
    effective_tipo_cambio_rmb?: number | string;
    effective_porcentaje_compra?: number | string;
    effective_costo_operacion_usd?: number | string;
    bank_accounts: EntBankAccount[];
    notes: string | null;
    is_active: boolean;
    is_default: boolean;
    sort_order: number;
    total_empresas_activas?: number;
  };
  const [entProviders, setEntProviders] = useState<EntProvider[]>([]);
  const [providerEditOpen, setProviderEditOpen] = useState(false);
  const [editingEntProvider, setEditingEntProvider] = useState<EntProvider | null>(null);
  // NOTA: el override por cliente legacy fue migrado al sistema unificado v2
  // (servicio con/sin factura) en EntangledUserServicePricingCard.

  // Base de datos global de proveedores (beneficiarios) — agregada por número de cuenta
  type SupplierDb = {
    cuenta_norm: string;
    id_principal: number;
    nombre_beneficiario: string;
    nombre_chino: string | null;
    numero_cuenta: string;
    banco_nombre: string;
    banco_pais: string | null;
    swift_bic: string | null;
    divisa_default: string | null;
    clientes_count: number;
    is_active: boolean;
    first_registered_at: string;
    aliases: string[] | null;
    ops_completadas: number;
    ops_total: number;
    total_enviado: number | string;
    ultima_operacion_at: string | null;
  };
  const [suppliersDb, setSuppliersDb] = useState<SupplierDb[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierDetailOpen, setSupplierDetailOpen] = useState(false);
  const [supplierDetail, setSupplierDetail] = useState<any>(null);

  const getToken = () => localStorage.getItem('token');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${getToken()}` };
      const [providersRes, paymentsRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/admin/payment-providers`, { headers }),
        axios.get(`${API_URL}/admin/supplier-payments?status=${statusFilter}`, { headers }),
        axios.get(`${API_URL}/admin/supplier-payments/stats`, { headers })
      ]);
      
      setProviders(providersRes.data);
      setPayments(paymentsRes.data);
      setStats(statsRes.data);

      // ENTANGLED: providers + overrides + solicitudes
      try {
        const statusQ = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
        const [provRes, reqRes] = await Promise.all([
          axios.get(`${API_URL}/admin/entangled/providers`, { headers }),
          axios.get(`${API_URL}/admin/entangled/payment-requests${statusQ}`, { headers }),
        ]);
        const list = (provRes.data || []).map((p: any) => ({
          ...p,
          bank_accounts: Array.isArray(p.bank_accounts) ? p.bank_accounts : [],
        }));
        setEntProviders(list);
        setEntangledRequests(reqRes.data || []);
      } catch (e) {
        console.warn('ENTANGLED endpoints no disponibles:', e);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Carga la base de datos de proveedores (beneficiarios) cuando se entra al tab Proveedores
  const loadSuppliersDb = useCallback(async (q?: string) => {
    try {
      const headers = { Authorization: `Bearer ${getToken()}` };
      const params = q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
      const r = await axios.get(`${API_URL}/admin/entangled/suppliers-db${params}`, { headers });
      setSuppliersDb(r.data || []);
    } catch (e) {
      console.warn('[admin/suppliers-db] error:', e);
    }
  }, []);

  useEffect(() => {
    if (tabValue === 2) loadSuppliersDb(supplierSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabValue]);

  const openSupplierDetail = async (cuentaNorm: string) => {
    try {
      const headers = { Authorization: `Bearer ${getToken()}` };
      const r = await axios.get(`${API_URL}/admin/entangled/suppliers-db/${encodeURIComponent(cuentaNorm)}`, { headers });
      setSupplierDetail(r.data);
      setSupplierDetailOpen(true);
    } catch (e) {
      setSnackbar({ open: true, message: 'No se pudo cargar el detalle del proveedor', severity: 'error' });
    }
  };

  // ===== ENTANGLED handlers =====
  const [syncingProviders, setSyncingProviders] = useState(false);
  const handleSyncEntProviders = async () => {
    if (syncingProviders) return;
    setSyncingProviders(true);
    try {
      const headers = { Authorization: `Bearer ${getToken()}` };
      const r = await axios.post(`${API_URL}/admin/entangled/providers/sync`, {}, { headers });
      const d = r.data || {};
      setSnackbar({
        open: true,
        message: `Sync OK · ${d.total_remotos ?? 0} remotos · +${d.inserted ?? 0} nuevos · ↻${d.updated ?? 0} actualizados · ✕${d.deactivated ?? 0} desactivados`,
        severity: 'success',
      });
      await loadData();
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.error || 'Error al sincronizar proveedores', severity: 'error' });
    } finally {
      setSyncingProviders(false);
    }
  };

  const handleSaveEntProvider = async () => {
    if (!editingEntProvider) return;
    try {
      const toNullable = (v: number | string | null | undefined) =>
        v === '' || v == null ? null : Number(v);
      const payload = {
        override_tipo_cambio_usd: toNullable(editingEntProvider.override_tipo_cambio_usd),
        override_tipo_cambio_rmb: toNullable(editingEntProvider.override_tipo_cambio_rmb),
        override_porcentaje_compra: toNullable(editingEntProvider.override_porcentaje_compra),
        override_costo_operacion_usd: toNullable(editingEntProvider.override_costo_operacion_usd),
        asesor_pct: toNullable(editingEntProvider.asesor_pct),
        over_pct: toNullable(editingEntProvider.over_pct),
        over_split_asesor: toNullable(editingEntProvider.over_split_asesor),
        cancellation_fee_usd: toNullable(editingEntProvider.cancellation_fee_usd),
        code: editingEntProvider.code || null,
        bank_accounts: editingEntProvider.bank_accounts || [],
        notes: editingEntProvider.notes || null,
        is_active: editingEntProvider.is_active,
        is_default: editingEntProvider.is_default,
        sort_order: Number(editingEntProvider.sort_order || 0),
      };
      const headers = { Authorization: `Bearer ${getToken()}` };
      await axios.put(`${API_URL}/admin/entangled/providers/${editingEntProvider.id}`, payload, { headers });
      setSnackbar({ open: true, message: 'Override del proveedor guardado', severity: 'success' });
      setProviderEditOpen(false);
      setEditingEntProvider(null);
      loadData();
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.error || 'Error al guardar', severity: 'error' });
    }
  };

  const handleSaveProvider = async () => {
    if (!editingProvider?.name) return;
    try {
      if (editingProvider.id) {
        await axios.put(`${API_URL}/admin/payment-providers`, editingProvider,
          { headers: { Authorization: `Bearer ${getToken()}` } }
        );
      } else {
        await axios.post(`${API_URL}/admin/payment-providers`, editingProvider,
          { headers: { Authorization: `Bearer ${getToken()}` } }
        );
      }
      setSnackbar({ open: true, message: 'Proveedor guardado', severity: 'success' });
      setProviderModal(false);
      setEditingProvider(null);
      loadData();
    } catch (error) {
      setSnackbar({ open: true, message: 'Error al guardar', severity: 'error' });
    }
  };

  // Formatea segundos a "Xd Yh Zm" / "Yh Zm" / "Zm Ws" / "Ws"
  const formatDuration = (totalSeconds: number | null | undefined): string => {
    if (totalSeconds == null || !Number.isFinite(Number(totalSeconds))) return '—';
    let s = Math.max(0, Math.floor(Number(totalSeconds)));
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600);  s -= h * 3600;
    const m = Math.floor(s / 60);    s -= m * 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  // Color del chip de tiempo según rangos (SLA visual)
  const getTimeChipStyles = (seconds: number | null | undefined) => {
    if (seconds == null) return { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)', color: '#94a3b8' };
    const s = Number(seconds);
    if (s <= 3600)  return { bg: 'rgba(74,222,128,0.15)', border: 'rgba(74,222,128,0.4)', color: '#16a34a' }; // ≤ 1h
    if (s <= 14400) return { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.4)', color: '#2563eb' }; // ≤ 4h
    if (s <= 86400) return { bg: 'rgba(255,102,0,0.15)',  border: 'rgba(255,102,0,0.4)',  color: ORANGE };    // ≤ 24h
    return { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', color: '#dc2626' };                   // > 24h
  };

  const getStatusChip = (status: string) => {
    const config: Record<string, { color: 'warning' | 'info' | 'success' | 'error' | 'default'; icon: React.ReactElement | undefined }> = {
      pending: { color: 'warning', icon: <PendingIcon fontSize="small" /> },
      pendiente: { color: 'warning', icon: <PendingIcon fontSize="small" /> },
      processing: { color: 'info', icon: <CurrencyExchangeIcon fontSize="small" /> },
      en_proceso: { color: 'info', icon: <CurrencyExchangeIcon fontSize="small" /> },
      paid: { color: 'info', icon: <PaymentsIcon fontSize="small" /> },
      enviado: { color: 'info', icon: <PaymentsIcon fontSize="small" /> },
      emitida: { color: 'info', icon: <CheckCircleIcon fontSize="small" /> },
      completed: { color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
      completado: { color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
      rejected: { color: 'error', icon: <CancelIcon fontSize="small" /> },
      rechazado: { color: 'error', icon: <CancelIcon fontSize="small" /> },
      cancelado: { color: 'error', icon: <CancelIcon fontSize="small" /> },
      error_envio: { color: 'error', icon: <CancelIcon fontSize="small" /> },
    };
    const c = config[status] || { color: 'default' as const, icon: undefined };
    return <Chip size="small" color={c.color} icon={c.icon} label={String(status || '—').toUpperCase()} />;
  };

  if (loading && payments.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', bgcolor: CHARCOAL }}>
        <CircularProgress sx={{ color: ORANGE }} />
      </Box>
    );
  }

  /* Live rates from first active entProvider */
  const activeProvider = entProviders.find(p => p.is_active) || entProviders[0];
  const liveUsdCny = activeProvider ? Number(activeProvider.effective_tipo_cambio_rmb ?? activeProvider.tipo_cambio_rmb) : 7.2631;
  const liveUsdMxn = activeProvider ? Number(activeProvider.effective_tipo_cambio_usd ?? activeProvider.tipo_cambio_usd) : 17.42;
  const recentPayments = payments.slice(0, 4);

  return (
    <Box sx={{ bgcolor: CHARCOAL, minHeight: '100vh', color: TEXT_PRIMARY, fontFamily: '"Inter", "Roboto", sans-serif' }}>

      {/* ══════════════════════════════════════════════════
          HERO BANNER — X-Pay premium fintech header
          Solo visible en modo cliente (no en admin)
          ══════════════════════════════════════════════════ */}
      {!adminMode && <>
      <Box sx={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(180deg, #121316 0%, #191715 40%, #17110d 100%)`,
        borderBottom: `1px solid ${BORDER}`,
        pb: 0,
      }}>
        {/* Background map */}
        <Box sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: 0.16,
          backgroundImage: `url(${WORLD_MAP_BG})`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center 18px',
          backgroundSize: { xs: '160% auto', md: '112% auto' },
          filter: 'grayscale(1) contrast(1.15) brightness(0.92)',
        }} />
        {/* Background radial glow */}
        <Box sx={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse 60% 80% at 68% 42%, rgba(255,102,0,0.14) 0%, transparent 70%)`,
        }} />
        {/* Subtle grid texture */}
        <Box sx={{
          position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.04,
          backgroundImage: `repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent 40px),
            repeating-linear-gradient(90deg, #fff 0px, #fff 1px, transparent 1px, transparent 40px)`,
        }} />

        {/* Top nav bar */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 4, pt: 2.5, pb: 2, position: 'relative', zIndex: 2 }}>
          {/* Logo + brand */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              component="img"
              src="/logo-completo-xpay-t.png"
              alt="X-Pay"
              sx={{
                width: 142,
                height: 40,
                objectFit: 'contain',
                filter: 'drop-shadow(0 0 8px rgba(255,102,0,0.35))',
                animation: 'xpay-breathe 3s ease-in-out infinite',
              }}
              onError={(e: React.SyntheticEvent<HTMLImageElement>) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            <Box>
              <Typography variant="caption" sx={{ color: TEXT_MUTED, letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '0.6rem' }}>
                International Payment Gateway
              </Typography>
            </Box>
          </Box>

          {/* Status pill + refresh */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, px: 1.5, py: 0.5, bgcolor: 'rgba(74,222,128,0.1)', borderRadius: 10, border: '1px solid rgba(74,222,128,0.3)' }}>
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#4ade80', animation: 'xpay-dot 1.5s ease-in-out infinite' }} />
              <Typography variant="caption" sx={{ color: '#4ade80', fontWeight: 600, fontSize: '0.7rem' }}>Gateway activo · SWIFT/BIC</Typography>
            </Box>
            <Tooltip title="Actualizar datos">
              <IconButton onClick={loadData} size="small"
                sx={{ color: ORANGE, bgcolor: 'rgba(255,102,0,0.1)', border: `1px solid rgba(255,102,0,0.25)`,
                  '&:hover': { bgcolor: 'rgba(255,102,0,0.2)', animation: 'xpay-pulse 1s ease-in-out' } }}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Main hero content */}
        <Box sx={{ px: { xs: 2, md: 4 }, pb: 3.5, position: 'relative', zIndex: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.25fr 0.9fr' }, gap: 2.5, alignItems: 'start' }}>
            <Box>
              <Box
                component="img"
                src="/logo-completo-xpay-t.png"
                alt="X-Pay"
                sx={{
                  width: { xs: 170, md: 210 },
                  height: 'auto',
                  mb: 1.5,
                  filter: 'drop-shadow(0 12px 18px rgba(0,0,0,0.45))',
                }}
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />

              <Typography sx={{ color: '#8a8a8a', letterSpacing: '0.18em', textTransform: 'uppercase', fontSize: '0.68rem', mb: 1.5 }}>
                International Payment Gateway
              </Typography>

              <Typography variant="h2" fontWeight={900} sx={{
                color: TEXT_PRIMARY,
                lineHeight: 1.02,
                letterSpacing: '-0.04em',
                textShadow: '0 10px 30px rgba(0,0,0,0.45)',
                fontSize: { xs: '2.3rem', md: '4.35rem' },
                maxWidth: 760,
                mb: 1.5,
              }}>
                ENVÍOS DE DINERO
                <br />
                <Box component="span" sx={{ color: ORANGE }}>SEGUROS</Box> A CHINA Y
                <br />
                ESTADOS UNIDOS.
              </Typography>

              <Typography sx={{ color: '#B8B8B8', maxWidth: 720, lineHeight: 1.65, fontSize: { xs: '0.98rem', md: '1.18rem' }, mb: 3 }}>
                Complete los datos de su proveedor y suba su comprobante de pago.
                Procesamos el pago internacional y generamos su comprobante junto con la confirmación de pago.
              </Typography>

              <Box sx={{ display: 'flex', gap: 1.2, flexWrap: 'wrap', mb: 2.2 }}>
                {[
                  { icon: <SecurityIcon sx={{ fontSize: 14 }} />, label: 'SWIFT / BIC' },
                  { icon: <BoltIcon sx={{ fontSize: 14 }} />, label: 'Live con coeherter' },
                  { icon: <PublicIcon sx={{ fontSize: 14 }} />, label: 'USD · CNY · MXN' },
                  { icon: <HubIcon sx={{ fontSize: 14 }} />, label: 'Proceso de Envío' },
                ].map((feat) => (
                  <Box key={feat.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.6, px: 1.5, py: 0.7,
                    bgcolor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 99, backdropFilter: 'blur(8px)' }}>
                    <Box sx={{ color: ORANGE, display: 'flex', alignItems: 'center' }}>{feat.icon}</Box>
                    <Typography variant="caption" sx={{ color: '#ddd', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.05em' }}>{feat.label}</Typography>
                  </Box>
                ))}
              </Box>

              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  startIcon={<BusinessIcon />}
                  onClick={() => setTabValue(2)}
                  sx={{
                    borderColor: 'rgba(255,102,0,0.45)',
                    color: ORANGE,
                    fontWeight: 800,
                    textTransform: 'none',
                    borderRadius: 3,
                    px: 2.6,
                    py: 1.1,
                    bgcolor: 'rgba(0,0,0,0.28)',
                    '&:hover': { bgcolor: 'rgba(255,102,0,0.08)', borderColor: ORANGE },
                  }}
                >
                  Mis proveedores
                </Button>
                <Button
                  variant="contained"
                  startIcon={
                    <Box
                      component="img"
                      src="/logo-completo-xpay-t.png"
                      alt="X-Pay"
                      sx={{ width: 72, height: 22, objectFit: 'contain' }}
                      onError={(e: React.SyntheticEvent<HTMLImageElement>) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  }
                  onClick={() => setTabValue(0)}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 800,
                    borderRadius: 99,
                    px: 2.5,
                    py: 1.05,
                    minHeight: 52,
                    bgcolor: '#111111',
                    border: '1px solid rgba(255,102,0,0.35)',
                    color: TEXT_PRIMARY,
                    boxShadow: '0 10px 26px rgba(255,102,0,0.22)',
                    animation: 'xpay-pulse 2.5s ease-in-out infinite',
                    '& .MuiButton-startIcon': { mr: 1 },
                    '&:hover': { bgcolor: '#171717', borderColor: ORANGE },
                  }}
                >
                  Envío Nuevo
                </Button>
              </Box>
            </Box>

            <Box sx={{ display: 'grid', gap: 2 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                {[
                  { title: 'País de Origen', flag: '🇺🇸', value: 'Us' },
                  { title: 'País de Destino', flag: '🇨🇳', value: 'China' },
                ].map((item) => (
                  <Paper key={item.title} sx={{ p: 1.7, borderRadius: 2.5, bgcolor: 'rgba(255,255,255,0.06)', border: `1px solid rgba(255,255,255,0.12)`, backdropFilter: 'blur(10px)' }}>
                    <Typography sx={{ color: '#A0A0A0', fontSize: '0.72rem', mb: 1 }}>{item.title}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.2, py: 1, borderRadius: 1.8, bgcolor: 'rgba(0,0,0,0.26)', border: `1px solid ${BORDER}` }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        <Typography sx={{ fontSize: '1.1rem' }}>{item.flag}</Typography>
                        <Typography sx={{ color: TEXT_PRIMARY, fontWeight: 700 }}>{item.value}</Typography>
                      </Box>
                      <Typography sx={{ color: TEXT_MUTED }}>⌄</Typography>
                    </Box>
                  </Paper>
                ))}
              </Box>

              <Paper sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.06)', border: `1px solid rgba(255,255,255,0.12)`, backdropFilter: 'blur(10px)' }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <Box>
                    <Typography sx={{ color: '#BDBDBD', fontWeight: 800, fontSize: '0.86rem', mb: 1 }}>USD-CNY</Typography>
                    <Typography sx={{ color: TEXT_PRIMARY, fontWeight: 900, fontSize: '1.9rem', lineHeight: 1 }}>{liveUsdCny.toFixed(6)}</Typography>
                    <Typography sx={{ color: '#4ade80', fontWeight: 700, fontSize: '0.72rem', mt: 0.5 }}>● LIVE</Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ color: '#BDBDBD', fontWeight: 800, fontSize: '0.86rem', mb: 1 }}>USD-USD</Typography>
                    <Typography sx={{ color: TEXT_PRIMARY, fontWeight: 900, fontSize: '1.9rem', lineHeight: 1 }}>{liveUsdMxn.toFixed(6)}</Typography>
                    <Typography sx={{ color: '#CFCFCF', fontSize: '0.72rem', mt: 0.5 }}>USD-USD</Typography>
                  </Box>
                </Box>
              </Paper>

              <Paper sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.06)', border: `1px solid rgba(255,255,255,0.12)`, backdropFilter: 'blur(10px)' }}>
                <Typography sx={{ color: TEXT_PRIMARY, fontWeight: 800, fontSize: '0.95rem', mb: 1.5 }}>Proceso de Envío</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5, mb: 2 }}>
                  {['Registro', 'Verificación', 'Transferencia', 'Recepción'].map((step, index) => (
                    <Box key={step} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1 }}>
                      <Box sx={{ width: 34, height: 34, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.08)', border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TEXT_PRIMARY, fontSize: '0.85rem', fontWeight: 800 }}>
                        {index + 1}
                      </Box>
                      {index < 3 && <Box sx={{ flex: 1, height: 1, bgcolor: 'rgba(255,255,255,0.15)' }} />}
                    </Box>
                  ))}
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 2 }}>
                  {['Registro', 'Verificación', 'Transferencia', 'Recepción'].map((step) => (
                    <Typography key={step} sx={{ color: '#B8B8B8', fontSize: '0.66rem', textAlign: 'center', flex: 1 }}>{step}</Typography>
                  ))}
                </Box>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={() => setTabValue(0)}
                  sx={{
                    background: `linear-gradient(135deg, ${ORANGE} 0%, ${ORANGE_DARK} 100%)`,
                    color: TEXT_PRIMARY,
                    fontWeight: 800,
                    fontSize: '0.86rem',
                    textTransform: 'uppercase',
                    py: 1.15,
                    borderRadius: 2.2,
                    boxShadow: `0 8px 24px rgba(255,102,0,0.35)`,
                    '&:hover': { background: `linear-gradient(135deg, #FF7700 0%, ${ORANGE} 100%)` },
                  }}
                >
                  Crear nuevo envío
                </Button>
              </Paper>
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.3fr 0.7fr' }, gap: 2, mt: 2.3 }}>
            <Paper sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.06)', border: `1px solid rgba(255,255,255,0.12)`, backdropFilter: 'blur(10px)' }}>
              <Typography sx={{ color: TEXT_PRIMARY, fontWeight: 800, fontSize: '1rem', mb: 1.5 }}>Últimos Envíos Realizados</Typography>
              <Box sx={{ display: 'grid', gap: 1.1 }}>
                {(recentPayments.length ? recentPayments : [
                  { id: 1, client_name: 'China', provider_name: 'USD', created_at: new Date().toISOString(), status: 'completed', amount_usd: 2500, total_mxn: 132000 },
                  { id: 2, client_name: 'China', provider_name: 'USD', created_at: new Date().toISOString(), status: 'completed', amount_usd: 2500, total_mxn: 132000 },
                ]).map((payment) => (
                  <Box key={payment.id} sx={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 1, alignItems: 'center', py: 0.8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <Typography sx={{ color: '#D5D5D5', fontSize: '0.78rem' }}>{payment.client_name || 'Cliente'}</Typography>
                    <Typography sx={{ color: '#B5B5B5', fontSize: '0.78rem' }}>{new Date(payment.created_at).toLocaleDateString()}</Typography>
                    <Chip size="small" label={String(payment.status || 'completed').toUpperCase()} sx={{ justifySelf: 'start', bgcolor: 'rgba(255,102,0,0.18)', color: TEXT_PRIMARY, border: '1px solid rgba(255,102,0,0.3)', fontWeight: 700 }} />
                    <Typography sx={{ color: TEXT_PRIMARY, fontWeight: 700, fontSize: '0.8rem', textAlign: 'right' }}>${Number(payment.total_mxn || 0).toLocaleString()}</Typography>
                  </Box>
                ))}
              </Box>
            </Paper>

            <Paper sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.06)', border: `1px solid rgba(255,255,255,0.12)`, backdropFilter: 'blur(10px)' }}>
              <Typography sx={{ color: TEXT_PRIMARY, fontWeight: 800, fontSize: '1rem', mb: 1.5 }}>Tasa de Cambio Promedio</Typography>
              <Box sx={{ height: 130, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.22)', border: `1px solid rgba(255,255,255,0.08)`, p: 1.5, display: 'flex', alignItems: 'end', gap: 0.8 }}>
                {[28, 42, 35, 56, 48, 62, 58, 75, 70, 84, 78, 92].map((v, index) => (
                  <Box key={index} sx={{ flex: 1, height: `${v}%`, borderRadius: '8px 8px 2px 2px', background: index > 8 ? `linear-gradient(180deg, ${ORANGE} 0%, rgba(255,102,0,0.25) 100%)` : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.08) 100%)' }} />
                ))}
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1.2 }}>
                {['Jan', 'Feb', 'Mar', 'Abr', 'May', 'Jun'].map((m) => (
                  <Typography key={m} sx={{ color: '#8F8F8F', fontSize: '0.68rem' }}>{m}</Typography>
                ))}
              </Box>
            </Paper>
          </Box>
        </Box>
      </Box>

      <Box sx={{ p: 3 }}>
      {/* ─── Stats Cards (premium fintech style) ─── */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        {/* Pending */}
        <Box sx={{
          flex: '1 1 200px', bgcolor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 3, p: 2.5,
          position: 'relative', overflow: 'hidden',
          '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${ORANGE}, transparent)` },
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography variant="caption" sx={{ color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.65rem', fontWeight: 700 }}>Pendientes</Typography>
              <Typography variant="h3" fontWeight={800} sx={{ color: TEXT_PRIMARY, lineHeight: 1.1, mt: 0.5 }}>{stats?.pending || 0}</Typography>
            </Box>
            <Box sx={{ p: 1.2, bgcolor: `rgba(255,102,0,0.12)`, borderRadius: 2, border: `1px solid rgba(255,102,0,0.2)` }}>
              <PendingIcon sx={{ color: ORANGE, fontSize: 22 }} />
            </Box>
          </Box>
          <Box sx={{ mt: 1.5, height: 2, bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 10, overflow: 'hidden' }}>
            <Box sx={{ width: `${Math.min(100, (stats?.pending || 0) * 20)}%`, height: '100%', bgcolor: ORANGE, borderRadius: 10 }} />
          </Box>
        </Box>

        {/* Procesando */}
        <Box sx={{
          flex: '1 1 200px', bgcolor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 3, p: 2.5,
          position: 'relative', overflow: 'hidden',
          '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, #3b82f6, transparent)` },
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography variant="caption" sx={{ color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.65rem', fontWeight: 700 }}>Procesando</Typography>
              <Typography variant="h3" fontWeight={800} sx={{ color: TEXT_PRIMARY, lineHeight: 1.1, mt: 0.5 }}>{stats?.processing || 0}</Typography>
            </Box>
            <Box sx={{ p: 1.2, bgcolor: `rgba(59,130,246,0.12)`, borderRadius: 2, border: `1px solid rgba(59,130,246,0.2)` }}>
              <CurrencyExchangeIcon sx={{ color: '#3b82f6', fontSize: 22 }} />
            </Box>
          </Box>
          <Box sx={{ mt: 1.5, height: 2, bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
            <Box sx={{ width: `${Math.min(100, (stats?.processing || 0) * 20)}%`, height: '100%', bgcolor: '#3b82f6', borderRadius: 10 }} />
          </Box>
        </Box>

        {/* Completados */}
        <Box sx={{
          flex: '1 1 200px', bgcolor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 3, p: 2.5,
          position: 'relative', overflow: 'hidden',
          '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, #4ade80, transparent)` },
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography variant="caption" sx={{ color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.65rem', fontWeight: 700 }}>Completados 30d</Typography>
              <Typography variant="h3" fontWeight={800} sx={{ color: TEXT_PRIMARY, lineHeight: 1.1, mt: 0.5 }}>{stats?.completed || 0}</Typography>
            </Box>
            <Box sx={{ p: 1.2, bgcolor: `rgba(74,222,128,0.12)`, borderRadius: 2, border: `1px solid rgba(74,222,128,0.2)` }}>
              <CheckCircleIcon sx={{ color: '#4ade80', fontSize: 22 }} />
            </Box>
          </Box>
          <Box sx={{ mt: 1.5, height: 2, bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
            <Box sx={{ width: `${Math.min(100, (stats?.completed || 0) * 5)}%`, height: '100%', bgcolor: '#4ade80', borderRadius: 10 }} />
          </Box>
        </Box>

        {/* Ganancia */}
        <Box sx={{
          flex: '1 1 200px', bgcolor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 3, p: 2.5,
          position: 'relative', overflow: 'hidden',
          '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, #a78bfa, transparent)` },
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography variant="caption" sx={{ color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.65rem', fontWeight: 700 }}>Ganancia 30d</Typography>
              <Typography variant="h3" fontWeight={800} sx={{ color: TEXT_PRIMARY, lineHeight: 1.1, mt: 0.5, fontSize: '1.8rem' }}>
                ${Number(stats?.total_platform_profit || 0).toFixed(0)}
              </Typography>
            </Box>
            <Box sx={{ p: 1.2, bgcolor: `rgba(167,139,250,0.12)`, borderRadius: 2, border: `1px solid rgba(167,139,250,0.2)` }}>
              <TrendingUpIcon sx={{ color: '#a78bfa', fontSize: 22 }} />
            </Box>
          </Box>
          <Box sx={{ mt: 1.5, height: 2, bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
            <Box sx={{ width: '65%', height: '100%', bgcolor: '#a78bfa', borderRadius: 10 }} />
          </Box>
        </Box>
      </Box>
      </Box>
      </>}

      {/* ─── Tabs ─── */}
      <Paper sx={{ mb: 3, borderRadius: 2, bgcolor: SURFACE, border: `1px solid ${BORDER}` }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{
          borderBottom: 1, borderColor: BORDER,
          '& .MuiTab-root': { color: TEXT_DIM, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.75rem', minHeight: 52 },
          '& .Mui-selected': { color: `${ORANGE} !important` },
          '& .MuiTabs-indicator': { backgroundColor: ORANGE, height: 2, boxShadow: `0 0 8px ${ORANGE}` },
        }}>
          <Tab value={3} icon={<HubIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="ENTANGLED" />
          <Tab value={0} icon={<PaymentsIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Solicitudes" />
          <Tab value={2} icon={<BusinessIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Proveedores" />
        </Tabs>
      </Paper>

      {/* Tab: Solicitudes */}
      {tabValue === 0 && (
        <Paper sx={{ borderRadius: 3, overflow: 'hidden', bgcolor: SURFACE, border: `1px solid ${BORDER}` }}>
          <Box sx={{ p: 2, bgcolor: HEADER_BG, display: 'flex', gap: 2, alignItems: 'center', borderBottom: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
            <Typography variant="caption" sx={{ color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, fontSize: '0.7rem' }}>
              Últimos Envíos Realizados
            </Typography>
            <TextField
              size="small"
              placeholder="Buscar por referencia, cliente, email, RFC…"
              value={requestSearch}
              onChange={(e) => setRequestSearch(e.target.value)}
              sx={{
                flex: 1,
                minWidth: 280,
                '& .MuiOutlinedInput-root': {
                  backgroundColor: HEADER_BG,
                  fontSize: '0.85rem',
                  '& fieldset': { borderColor: BORDER },
                  '&:hover fieldset': { borderColor: ORANGE },
                  '&.Mui-focused fieldset': { borderColor: ORANGE },
                },
                '& input': { color: TEXT_PRIMARY },
              }}
            />
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel sx={{ color: TEXT_DIMMER, fontSize: '0.8rem' }}>Estado</InputLabel>
              <Select value={statusFilter} label="Estado" onChange={(e) => setStatusFilter(e.target.value)}
                sx={{
                  color: TEXT_PRIMARY, backgroundColor: HEADER_BG, fontSize: '0.8rem',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: BORDER },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#555' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: ORANGE },
                  '& .MuiSvgIcon-root': { color: ORANGE },
                }}
              >
                <MenuItem value="all">Todos</MenuItem>
                <MenuItem value="pendiente">Pendientes</MenuItem>
                <MenuItem value="en_proceso">En Proceso</MenuItem>
                <MenuItem value="completado">Completados</MenuItem>
                <MenuItem value="rechazado">Rechazados</MenuItem>
              </Select>
            </FormControl>
          </Box>
          
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: HEADER_BG, borderBottom: `1px solid ${BORDER}` }}>
                  <TableCell sx={{ color: TEXT_DIMMER, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Referencia</TableCell>
                  <TableCell sx={{ color: TEXT_DIMMER, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Cliente</TableCell>
                  <TableCell align="right" sx={{ color: TEXT_DIMMER, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Monto a Enviar al Proveedor</TableCell>
                  <TableCell align="right" sx={{ color: TEXT_DIMMER, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Divisa Destino</TableCell>
                  <TableCell sx={{ color: TEXT_DIMMER, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Estatus</TableCell>
                  <TableCell sx={{ color: TEXT_DIMMER, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Factura</TableCell>
                  <TableCell sx={{ color: TEXT_DIMMER, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Pago a Proveedor</TableCell>
                  <TableCell align="center" sx={{ color: TEXT_DIMMER, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Tiempo Op.</TableCell>
                  <TableCell sx={{ color: TEXT_DIMMER, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(() => {
                  const term = requestSearch.trim().toLowerCase();
                  const filtered = !term ? entangledRequests : entangledRequests.filter((p: any) => {
                    const ref = String(p.referencia_pago || `XP${String(p.id).padStart(6, '0')}`).toLowerCase();
                    return (
                      ref.includes(term) ||
                      String(p.client_name || '').toLowerCase().includes(term) ||
                      String(p.client_email || '').toLowerCase().includes(term) ||
                      String(p.cf_rfc || '').toLowerCase().includes(term) ||
                      String(p.cf_razon_social || '').toLowerCase().includes(term) ||
                      String(p.entangled_transaccion_id || '').toLowerCase().includes(term)
                    );
                  });
                  return <>
                {filtered.map((p) => (
                  <TableRow key={p.id} hover sx={{ bgcolor: SURFACE, '&:hover': { bgcolor: SURFACE2 }, borderBottom: `1px solid ${BORDER}` }}>
                    <TableCell sx={{ borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>
                      <Tooltip title={p.entangled_transaccion_id ? `Tx ENTANGLED: ${p.entangled_transaccion_id}` : 'Sin Tx ENTANGLED'}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            fontWeight: 800,
                            color: ORANGE,
                            letterSpacing: '0.04em',
                            fontSize: '0.85rem',
                          }}
                        >
                          {p.referencia_pago || `XP${String(p.id).padStart(6, '0')}`}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ color: TEXT_PRIMARY, borderBottom: `1px solid ${BORDER}` }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ width: 34, height: 34, bgcolor: `rgba(255,102,0,0.15)`, border: `1px solid rgba(255,102,0,0.3)`, color: ORANGE, fontWeight: 700 }}>
                          {p.client_name?.[0] || '?'}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={700} sx={{ color: TEXT_PRIMARY }}>{p.client_name}</Typography>
                          <Typography variant="caption" sx={{ color: TEXT_DIMMER }}>{p.client_email}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ borderBottom: `1px solid ${BORDER}` }}>
                      <Typography fontWeight={800} sx={{ color: ORANGE, fontSize: '1rem' }}>${parseFloat(String(p.op_monto || 0)).toLocaleString()}</Typography>
                    </TableCell>
                    <TableCell sx={{ color: TEXT_SECONDARY, borderBottom: `1px solid ${BORDER}` }}>{p.op_divisa_destino || 'USD'}</TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${BORDER}` }}>{getStatusChip(p.estatus_global)}</TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${BORDER}` }}>
                      {getStatusChip(p.estatus_factura)}
                    </TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${BORDER}` }}>
                      {getStatusChip(p.estatus_proveedor)}
                    </TableCell>
                    <TableCell align="center" sx={{ borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>
                      {(() => {
                        const isCompleted = String(p.estatus_global || '').toLowerCase() === 'completado';
                        const hasProof = !!p.comprobante_subido_at;
                        const secs = p.time_to_complete_seconds != null ? Number(p.time_to_complete_seconds) : null;
                        if (!hasProof) {
                          return (
                            <Tooltip title="Aún no se ha subido el comprobante de pago">
                              <Typography variant="caption" sx={{ color: TEXT_DIMMER, fontStyle: 'italic' }}>Sin comprobante</Typography>
                            </Tooltip>
                          );
                        }
                        if (!isCompleted || secs == null) {
                          // Operación aún no finalizada → mostramos tiempo transcurrido en vivo
                          const liveSecs = Math.max(0, Math.floor((Date.now() - new Date(p.comprobante_subido_at).getTime()) / 1000));
                          const styles = getTimeChipStyles(liveSecs);
                          return (
                            <Tooltip title={`Comprobante subido: ${new Date(p.comprobante_subido_at).toLocaleString()} · En curso`}>
                              <Chip
                                size="small"
                                label={`${formatDuration(liveSecs)} · en curso`}
                                sx={{
                                  bgcolor: styles.bg,
                                  color: styles.color,
                                  border: `1px solid ${styles.border}`,
                                  fontWeight: 700,
                                  fontSize: '0.7rem',
                                  fontFamily: 'monospace',
                                }}
                              />
                            </Tooltip>
                          );
                        }
                        const styles = getTimeChipStyles(secs);
                        return (
                          <Tooltip title={`Comprobante: ${new Date(p.comprobante_subido_at).toLocaleString()}\nFinalizada: ${p.completed_at ? new Date(p.completed_at).toLocaleString() : '—'}`}>
                            <Chip
                              size="small"
                              icon={<CheckCircleIcon sx={{ fontSize: 14, color: `${styles.color} !important` }} />}
                              label={formatDuration(secs)}
                              sx={{
                                bgcolor: styles.bg,
                                color: styles.color,
                                border: `1px solid ${styles.border}`,
                                fontWeight: 800,
                                fontSize: '0.72rem',
                                fontFamily: 'monospace',
                                '& .MuiChip-icon': { ml: 0.5 },
                              }}
                            />
                          </Tooltip>
                        );
                      })()}
                    </TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${BORDER}` }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {p.referencia_pago && (
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: ORANGE, fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                            {p.referencia_pago}
                          </Typography>
                        )}
                        <Tooltip title={new Date(p.created_at).toLocaleString()}>
                          <Typography variant="caption" sx={{ color: TEXT_DIMMER, fontSize: '0.65rem', whiteSpace: 'nowrap' }}>
                            {new Date(p.created_at).toLocaleDateString()}
                          </Typography>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 6, borderBottom: 'none' }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, opacity: 0.5 }}>
                        <PaymentsIcon sx={{ fontSize: 40, color: TEXT_DIMMER }} />
                        <Typography sx={{ color: TEXT_DIMMER }}>
                          {term ? 'Sin resultados para tu búsqueda' : 'No hay solicitudes'}
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
                  </>;
                })()}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Tab ENTANGLED — Configuración global de proveedores + overrides por cliente + servicio v2 + solicitudes */}
      {tabValue === 3 && (
        <>
        <Paper sx={{ p: 3, borderRadius: 3, mt: 3, bgcolor: SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }}>
          <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="h6" fontWeight="bold">
                🌐 Proveedores ENTANGLED (Triangulación internacional)
              </Typography>
              <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
                Los proveedores se sincronizan desde el API. Aquí solo configuras TC USD, TC RMB, % de compra y cuentas bancarias para recibir el depósito MXN del cliente.
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="small"
              startIcon={<RefreshIcon />}
              disabled={syncingProviders}
              onClick={handleSyncEntProviders}
              sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#e65a00' }, textTransform: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}
            >
              {syncingProviders ? 'Sincronizando…' : 'Sincronizar desde API'}
            </Button>
          </Box>
          <Divider sx={{ my: 2 }} />

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: HEADER_BG }}>
                  {['Nombre','TC USD efectivo','TC RMB efectivo','% compra efectivo','Empresas activas','Activo','Default','Acciones'].map((h) => (
                    <TableCell key={h} sx={{ color: TEXT_DIMMER, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {entProviders.filter((p: any) => (p.code || '').toUpperCase() !== 'XOX').map((p) => {
                  const apiUsd = Number(p.tipo_cambio_usd) || 0;
                  const apiRmb = Number(p.tipo_cambio_rmb) || 0;
                  const apiPct = Number(p.porcentaje_compra) || 0;
                  const effUsd = Number(p.effective_tipo_cambio_usd ?? p.tipo_cambio_usd);
                  const effRmb = Number(p.effective_tipo_cambio_rmb ?? p.tipo_cambio_rmb);
                  const effPct = Number(p.effective_porcentaje_compra ?? p.porcentaje_compra);
                  const ovUsd = p.override_tipo_cambio_usd != null && apiUsd > 0;
                  const ovRmb = p.override_tipo_cambio_rmb != null && apiRmb > 0;
                  const ovPct = p.override_porcentaje_compra != null && apiPct > 0;
                  return (
                  <TableRow key={p.id} hover sx={{ bgcolor: SURFACE, '&:hover': { bgcolor: SURFACE2 } }}>
                    <TableCell sx={{ color: TEXT_PRIMARY, fontWeight: 600, borderBottom: `1px solid ${BORDER}` }}>{p.name}</TableCell>
                    <TableCell align="center" sx={{ color: TEXT_SECONDARY, borderBottom: `1px solid ${BORDER}` }}>
                      {apiUsd > 0 ? `$${effUsd.toFixed(4)}` : <span style={{ color: TEXT_DIMMER, fontStyle: 'italic' }}>No disponible</span>}
                      {ovUsd && <Chip size="small" sx={{ ml: 0.5, bgcolor: 'rgba(255,102,0,0.15)', color: ORANGE, border: `1px solid rgba(255,102,0,0.3)` }} label="OV" />}
                    </TableCell>
                    <TableCell align="center" sx={{ color: TEXT_SECONDARY, borderBottom: `1px solid ${BORDER}` }}>
                      {apiRmb > 0 ? `$${effRmb.toFixed(4)}` : <span style={{ color: TEXT_DIMMER, fontStyle: 'italic' }}>No disponible</span>}
                      {ovRmb && <Chip size="small" sx={{ ml: 0.5, bgcolor: 'rgba(255,102,0,0.15)', color: ORANGE, border: `1px solid rgba(255,102,0,0.3)` }} label="OV" />}
                    </TableCell>
                    <TableCell align="center" sx={{ color: TEXT_SECONDARY, borderBottom: `1px solid ${BORDER}` }}>
                      {apiPct > 0 ? `${effPct.toFixed(2)}%` : <span style={{ color: TEXT_DIMMER, fontStyle: 'italic' }}>No disponible</span>}
                      {ovPct && <Chip size="small" sx={{ ml: 0.5, bgcolor: 'rgba(255,102,0,0.15)', color: ORANGE, border: `1px solid rgba(255,102,0,0.3)` }} label="OV" />}
                    </TableCell>
                    <TableCell align="center" sx={{ borderBottom: `1px solid ${BORDER}` }}>
                      <Chip
                        size="small"
                        label={Number(p.total_empresas_activas ?? 0)}
                        sx={{
                          fontWeight: 700,
                          bgcolor: Number(p.total_empresas_activas ?? 0) > 0 ? 'rgba(74,222,128,0.15)' : 'rgba(120,120,120,0.12)',
                          color: Number(p.total_empresas_activas ?? 0) > 0 ? '#4ade80' : TEXT_DIMMER,
                          minWidth: 48,
                        }}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ borderBottom: `1px solid ${BORDER}` }}>
                      {p.is_active ? <CheckCircleIcon fontSize="small" sx={{ color: '#4ade80' }} /> : <CancelIcon fontSize="small" sx={{ color: '#ff6b6b' }} />}
                    </TableCell>
                    <TableCell align="center" sx={{ borderBottom: `1px solid ${BORDER}` }}>
                      {p.is_default ? <Chip size="small" label="Default" sx={{ bgcolor: 'rgba(255,102,0,0.15)', color: ORANGE, border: `1px solid rgba(255,102,0,0.3)`, fontWeight: 700 }} /> : <span style={{ color: TEXT_DIMMER }}>—</span>}
                    </TableCell>
                    <TableCell align="center" sx={{ borderBottom: `1px solid ${BORDER}` }}>
                      <Tooltip title="Configurar override">
                        <IconButton size="small" sx={{ color: TEXT_MUTED, '&:hover': { color: ORANGE } }} onClick={() => { setEditingEntProvider({ ...p, bank_accounts: [...(p.bank_accounts || [])] }); setProviderEditOpen(true); }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  );
                })}
                {entProviders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 3, borderBottom: 'none' }}>
                      <Typography sx={{ color: TEXT_DIMMER }}>No hay proveedores configurados.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Sistema único de override por cliente (servicio con/sin factura) + comisiones globales + bandeja de solicitudes */}
        <EntangledAdminTab />
        </>
      )}

      {/* Tab: Proveedores — Base de datos global (beneficiarios reales registrados por clientes) */}
      {tabValue === 2 && (
        <Paper sx={{ borderRadius: 3, overflow: 'hidden', bgcolor: SURFACE, border: `1px solid ${BORDER}` }}>
          <Box sx={{ p: 2, bgcolor: HEADER_BG, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${BORDER}`, gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography fontWeight={700} sx={{ color: TEXT_PRIMARY, letterSpacing: '0.04em' }}>
                Base de datos de Proveedores
              </Typography>
              <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
                Registro único por número de cuenta · {suppliersDb.length} proveedores
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
              <TextField
                size="small"
                placeholder="Buscar por cuenta, nombre, banco, alias…"
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') loadSuppliersDb(supplierSearch); }}
                sx={{ minWidth: 320 }}
              />
              <Button
                variant="outlined"
                size="small"
                startIcon={<RefreshIcon />}
                onClick={() => loadSuppliersDb(supplierSearch)}
                sx={{ borderColor: BORDER, color: TEXT_PRIMARY, '&:hover': { borderColor: ORANGE, color: ORANGE } }}
              >
                Buscar
              </Button>
            </Box>
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: HEADER_BG }}>
                  {['Beneficiario', 'Número de cuenta', 'Banco', 'Divisa', 'Clientes', 'Operaciones', 'Total enviado', 'Última operación', 'Acciones'].map((h, i) => (
                    <TableCell
                      key={h}
                      align={i === 4 || i === 5 ? 'center' : i === 6 ? 'right' : 'left'}
                      sx={{ color: TEXT_DIMMER, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}
                    >
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {suppliersDb.map((s) => {
                  const aliases = (s.aliases || []).filter(Boolean);
                  return (
                    <TableRow key={s.cuenta_norm} hover sx={{ bgcolor: SURFACE, '&:hover': { bgcolor: SURFACE2 } }}>
                      <TableCell sx={{ borderBottom: `1px solid ${BORDER}` }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                          <Avatar sx={{ bgcolor: 'rgba(255,102,0,0.12)', border: `1px solid rgba(255,102,0,0.3)`, color: ORANGE, width: 34, height: 34 }}>
                            <BusinessIcon sx={{ fontSize: 18 }} />
                          </Avatar>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography fontWeight={700} sx={{ color: TEXT_PRIMARY, fontSize: '0.85rem', lineHeight: 1.2 }} noWrap>
                              {s.nombre_beneficiario}
                            </Typography>
                            {s.nombre_chino && (
                              <Typography variant="caption" sx={{ color: TEXT_MUTED, display: 'block', lineHeight: 1.1 }}>
                                {s.nombre_chino}
                              </Typography>
                            )}
                            {aliases.length > 0 && (
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4, mt: 0.4 }}>
                                {aliases.slice(0, 3).map((a) => (
                                  <Chip
                                    key={a}
                                    size="small"
                                    label={a}
                                    sx={{ height: 18, fontSize: '0.62rem', bgcolor: 'rgba(255,102,0,0.08)', color: ORANGE, border: `1px solid rgba(255,102,0,0.25)` }}
                                  />
                                ))}
                                {aliases.length > 3 && (
                                  <Chip size="small" label={`+${aliases.length - 3}`} sx={{ height: 18, fontSize: '0.62rem' }} />
                                )}
                              </Box>
                            )}
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', color: TEXT_PRIMARY, fontSize: '0.8rem', borderBottom: `1px solid ${BORDER}` }}>
                        {s.numero_cuenta}
                        {s.swift_bic && (
                          <Typography variant="caption" sx={{ display: 'block', color: TEXT_MUTED, fontFamily: 'monospace', fontSize: '0.66rem' }}>
                            SWIFT: {s.swift_bic}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ color: TEXT_SECONDARY, borderBottom: `1px solid ${BORDER}` }}>
                        <Typography fontSize="0.82rem">{s.banco_nombre}</Typography>
                        {s.banco_pais && <Typography variant="caption" sx={{ color: TEXT_MUTED }}>{s.banco_pais}</Typography>}
                      </TableCell>
                      <TableCell sx={{ color: TEXT_SECONDARY, borderBottom: `1px solid ${BORDER}` }}>
                        {s.divisa_default || '—'}
                      </TableCell>
                      <TableCell align="center" sx={{ borderBottom: `1px solid ${BORDER}` }}>
                        <Chip size="small" label={s.clientes_count} sx={{ fontWeight: 700, bgcolor: 'rgba(59,130,246,0.12)', color: '#2563eb', border: '1px solid rgba(59,130,246,0.3)' }} />
                      </TableCell>
                      <TableCell align="center" sx={{ borderBottom: `1px solid ${BORDER}` }}>
                        <Tooltip title={`${s.ops_completadas} completadas / ${s.ops_total} totales`}>
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography fontWeight={800} sx={{ color: TEXT_PRIMARY }}>{s.ops_completadas}</Typography>
                            <Typography variant="caption" sx={{ color: TEXT_MUTED }}>/{s.ops_total}</Typography>
                          </Box>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right" sx={{ borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>
                        <Typography fontWeight={800} sx={{ color: ORANGE }}>
                          ${Number(s.total_enviado || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ color: TEXT_MUTED, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                        {s.ultima_operacion_at ? new Date(s.ultima_operacion_at).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell sx={{ borderBottom: `1px solid ${BORDER}` }}>
                        <Tooltip title="Ver detalle (clientes y operaciones)">
                          <IconButton size="small" sx={{ color: TEXT_MUTED, '&:hover': { color: ORANGE } }} onClick={() => openSupplierDetail(s.cuenta_norm)}>
                            <PublicIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {suppliersDb.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 6, borderBottom: 'none' }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, opacity: 0.6 }}>
                        <BusinessIcon sx={{ fontSize: 40, color: TEXT_DIMMER }} />
                        <Typography sx={{ color: TEXT_DIMMER }}>
                          {supplierSearch ? 'Sin resultados para tu búsqueda' : 'Aún no hay proveedores registrados por clientes'}
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Modal: detalle de proveedor (clientes que lo usan + operaciones) */}
      <Dialog open={supplierDetailOpen} onClose={() => setSupplierDetailOpen(false)} maxWidth="lg" fullWidth
        PaperProps={{ sx: { bgcolor: SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY } }}>
        <DialogTitle sx={{ bgcolor: HEADER_BG, borderBottom: `1px solid ${BORDER}`, color: TEXT_PRIMARY, fontWeight: 700 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 4, height: 22, bgcolor: ORANGE, borderRadius: 2 }} />
            Detalle del proveedor
            {supplierDetail?.cuenta_norm && (
              <Typography component="span" sx={{ ml: 2, fontFamily: 'monospace', color: TEXT_MUTED, fontSize: '0.85rem' }}>
                {supplierDetail.cuenta_norm}
              </Typography>
            )}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {supplierDetail && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box>
                <Typography variant="subtitle2" fontWeight={800} sx={{ color: TEXT_PRIMARY, mb: 1 }}>
                  Clientes con este proveedor ({supplierDetail.clientes?.length || 0})
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: HEADER_BG }}>
                        {['Cliente', 'Email', 'Box', 'Alias', 'Activo', 'Registrado'].map((h) => (
                          <TableCell key={h} sx={{ color: TEXT_DIMMER, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: '0.08em' }}>
                            {h}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(supplierDetail.clientes || []).map((c: any) => (
                        <TableRow key={c.id}>
                          <TableCell sx={{ color: TEXT_PRIMARY, fontWeight: 600 }}>{c.client_name || '—'}</TableCell>
                          <TableCell sx={{ color: TEXT_MUTED, fontSize: '0.78rem' }}>{c.client_email}</TableCell>
                          <TableCell sx={{ color: TEXT_MUTED, fontFamily: 'monospace', fontSize: '0.78rem' }}>{c.box_id || '—'}</TableCell>
                          <TableCell sx={{ color: TEXT_PRIMARY }}>{c.alias || '—'}</TableCell>
                          <TableCell>
                            {c.is_active
                              ? <CheckCircleIcon fontSize="small" sx={{ color: '#16a34a' }} />
                              : <CancelIcon fontSize="small" sx={{ color: '#dc2626' }} />}
                          </TableCell>
                          <TableCell sx={{ color: TEXT_MUTED, fontSize: '0.78rem' }}>
                            {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>

              <Divider />

              <Box>
                <Typography variant="subtitle2" fontWeight={800} sx={{ color: TEXT_PRIMARY, mb: 1 }}>
                  Operaciones recientes ({supplierDetail.operaciones?.length || 0})
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: HEADER_BG }}>
                        {['Referencia', 'Cliente', 'Monto', 'Divisa', 'Estatus', 'Pagado al proveedor', 'Fecha'].map((h) => (
                          <TableCell key={h} sx={{ color: TEXT_DIMMER, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: '0.08em' }}>
                            {h}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(supplierDetail.operaciones || []).map((o: any) => (
                        <TableRow key={o.id}>
                          <TableCell sx={{ fontFamily: 'monospace', color: ORANGE, fontWeight: 700, fontSize: '0.78rem' }}>
                            {o.referencia_pago || `#${o.id}`}
                          </TableCell>
                          <TableCell sx={{ color: TEXT_PRIMARY }}>{o.client_name || '—'}</TableCell>
                          <TableCell sx={{ color: TEXT_PRIMARY, fontWeight: 700 }}>
                            ${Number(o.op_monto || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell sx={{ color: TEXT_MUTED }}>{o.op_divisa_destino || '—'}</TableCell>
                          <TableCell>{getStatusChip(o.estatus_global)}</TableCell>
                          <TableCell sx={{ color: TEXT_MUTED, fontSize: '0.78rem' }}>
                            {o.proveedor_pagado_at ? new Date(o.proveedor_pagado_at).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell sx={{ color: TEXT_MUTED, fontSize: '0.78rem' }}>
                            {new Date(o.created_at).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!supplierDetail.operaciones || supplierDetail.operaciones.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={7} align="center" sx={{ py: 3, color: TEXT_DIMMER }}>
                            Aún no hay operaciones para este proveedor
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ bgcolor: HEADER_BG, borderTop: `1px solid ${BORDER}` }}>
          <Button onClick={() => setSupplierDetailOpen(false)} sx={{ color: TEXT_MUTED }}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Tab: ENTANGLED — Render unificado se hace arriba dentro del bloque tabValue===3 */}

      {/* Modal Proveedor */}
      <Dialog open={providerModal} onClose={() => setProviderModal(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { bgcolor: SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY } }}>
        <DialogTitle sx={{ bgcolor: HEADER_BG, borderBottom: `1px solid ${BORDER}`, color: TEXT_PRIMARY, fontWeight: 700 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 4, height: 20, bgcolor: ORANGE, borderRadius: 2 }} />
            {editingProvider?.id ? 'Editar Proveedor' : 'Nuevo Proveedor'}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3, bgcolor: SURFACE }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Nombre del Proveedor"
              value={editingProvider?.name || ''}
              onChange={(e) => setEditingProvider(prev => prev ? { ...prev, name: e.target.value } : null)}
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { color: TEXT_PRIMARY, '& fieldset': { borderColor: BORDER }, '&:hover fieldset': { borderColor: '#555' }, '&.Mui-focused fieldset': { borderColor: ORANGE } }, '& .MuiInputLabel-root': { color: TEXT_DIM } }}
            />
            <TextField
              label="Costo Base (%)"
              type="number"
              value={editingProvider?.base_cost_percent || 0}
              onChange={(e) => setEditingProvider(prev => prev ? { ...prev, base_cost_percent: parseFloat(e.target.value) } : null)}
              slotProps={{ input: { endAdornment: <InputAdornment position="end"><span style={{ color: TEXT_DIM }}>%</span></InputAdornment> } }}
              helperText="Lo que te cobra el proveedor por cada operación"
              sx={{ '& .MuiOutlinedInput-root': { color: TEXT_PRIMARY, '& fieldset': { borderColor: BORDER }, '&.Mui-focused fieldset': { borderColor: ORANGE } }, '& .MuiInputLabel-root': { color: TEXT_DIM }, '& .MuiFormHelperText-root': { color: TEXT_DIMMER } }}
            />
            <TextField
              label="Cargo Fijo"
              type="number"
              value={editingProvider?.fixed_fee || 0}
              onChange={(e) => setEditingProvider(prev => prev ? { ...prev, fixed_fee: parseFloat(e.target.value) } : null)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><span style={{ color: TEXT_DIM }}>$</span></InputAdornment> } }}
              helperText="Cargo fijo por operación (USD)"
              sx={{ '& .MuiOutlinedInput-root': { color: TEXT_PRIMARY, '& fieldset': { borderColor: BORDER }, '&.Mui-focused fieldset': { borderColor: ORANGE } }, '& .MuiInputLabel-root': { color: TEXT_DIM }, '& .MuiFormHelperText-root': { color: TEXT_DIMMER } }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={editingProvider?.is_active || false}
                  onChange={(e) => setEditingProvider(prev => prev ? { ...prev, is_active: e.target.checked } : null)}
                  sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: ORANGE }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: ORANGE } }}
                />
              }
              label={<Typography sx={{ color: TEXT_SECONDARY }}>Proveedor Activo</Typography>}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, bgcolor: HEADER_BG, borderTop: `1px solid ${BORDER}` }}>
          <Button onClick={() => setProviderModal(false)} sx={{ color: TEXT_MUTED }}>Cancelar</Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSaveProvider}
            sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, ${ORANGE_DARK} 100%)`, fontWeight: 700, boxShadow: `0 4px 14px rgba(255,102,0,0.3)` }}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: editor de proveedor ENTANGLED */}
      <Dialog open={providerEditOpen} onClose={() => setProviderEditOpen(false)} maxWidth="md" fullWidth
        PaperProps={{ sx: { bgcolor: SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY } }}>
        <DialogTitle sx={{ bgcolor: HEADER_BG, borderBottom: `1px solid ${BORDER}`, color: TEXT_PRIMARY, fontWeight: 700 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 4, height: 20, bgcolor: ORANGE, borderRadius: 2 }} />
            Configurar override · {editingEntProvider?.name}
          </Box>
        </DialogTitle>
        <DialogContent>
          {editingEntProvider && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              {/* Datos del API (read-only) */}
              <Paper variant="outlined" sx={{ p: 2, bgcolor: INNER_BG, border: `1px solid ${BORDER}` }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                  Datos del API ENTANGLED (no editables)
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <TextField
                    label="Nombre"
                    value={editingEntProvider.name}
                    InputProps={{ readOnly: true }}
                    sx={{ flex: 1, minWidth: 240 }}
                    variant="filled"
                    helperText="Sincronizado desde el API"
                  />
                </Box>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 2 }}>
                  <TextField
                    label="TC USD del API"
                    value={Number(editingEntProvider.tipo_cambio_usd) > 0 ? `$${Number(editingEntProvider.tipo_cambio_usd).toFixed(4)}` : 'No disponible'}
                    InputProps={{ readOnly: true }}
                    sx={{ width: 200 }}
                    variant="filled"
                  />
                  <TextField
                    label="TC RMB del API"
                    value={Number(editingEntProvider.tipo_cambio_rmb) > 0 ? `$${Number(editingEntProvider.tipo_cambio_rmb).toFixed(4)}` : 'No disponible'}
                    InputProps={{ readOnly: true }}
                    sx={{ width: 200 }}
                    variant="filled"
                  />
                  <TextField
                    label="% compra del API"
                    value={Number(editingEntProvider.porcentaje_compra) > 0 ? `${Number(editingEntProvider.porcentaje_compra).toFixed(2)}%` : 'No disponible'}
                    InputProps={{ readOnly: true }}
                    sx={{ width: 180 }}
                    variant="filled"
                  />
                  {Number(editingEntProvider.costo_operacion_usd || 0) > 0 && (
                    <TextField
                      label="Costo op. fijo USD"
                      value={`$${Number(editingEntProvider.costo_operacion_usd).toFixed(2)} USD`}
                      InputProps={{ readOnly: true }}
                      sx={{ width: 200 }}
                      variant="filled"
                    />
                  )}
                  {Number((editingEntProvider as any).costo_operacion_porcentaje || 0) > 0 && (
                    <TextField
                      label="Costo op. % USD"
                      value={`${Number((editingEntProvider as any).costo_operacion_porcentaje).toFixed(2)}%`}
                      InputProps={{ readOnly: true }}
                      sx={{ width: 180 }}
                      variant="filled"
                    />
                  )}
                  {Number((editingEntProvider as any).costo_operacion_rmb || 0) > 0 && (
                    <TextField
                      label="Costo op. fijo RMB"
                      value={`¥${Number((editingEntProvider as any).costo_operacion_rmb).toFixed(2)} RMB`}
                      InputProps={{ readOnly: true }}
                      sx={{ width: 200 }}
                      variant="filled"
                    />
                  )}
                  {Number((editingEntProvider as any).costo_operacion_porcentaje_rmb || 0) > 0 && (
                    <TextField
                      label="Costo op. % RMB"
                      value={`${Number((editingEntProvider as any).costo_operacion_porcentaje_rmb).toFixed(2)}%`}
                      InputProps={{ readOnly: true }}
                      sx={{ width: 180 }}
                      variant="filled"
                    />
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 2 }}>
                  <TextField
                    label="Mínimo operación USD del API"
                    value={`$${Number((editingEntProvider as any).min_operacion_usd || 0).toFixed(2)} USD`}
                    InputProps={{ readOnly: true }}
                    sx={{ width: 240 }}
                    variant="filled"
                    helperText={Number((editingEntProvider as any).min_operacion_usd || 0) === 0 ? 'Sin mínimo configurado' : 'Sincronizado del API'}
                  />
                  <TextField
                    label="Mínimo operación RMB del API"
                    value={`¥${Number((editingEntProvider as any).min_operacion_rmb || 0).toFixed(2)} RMB`}
                    InputProps={{ readOnly: true }}
                    sx={{ width: 240 }}
                    variant="filled"
                    helperText={Number((editingEntProvider as any).min_operacion_rmb || 0) === 0 ? 'Sin mínimo configurado' : 'Sincronizado del API'}
                  />
                </Box>
                <Typography variant="caption" sx={{ display: 'block', mt: 1, color: TEXT_MUTED }}>
                  ℹ️ El API ENTANGLED expone: <b>nombre, tipos de cambio, costo de operación, % compra, tarifas y mínimos por servicio</b>. Solo el <b>código</b> es local.
                </Typography>

                {/* Tarifas reales del API por servicio */}
                {Array.isArray((editingEntProvider as any).tarifas) && (editingEntProvider as any).tarifas.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" fontWeight={700} sx={{ color: TEXT_MUTED, display: 'block', mb: 1 }}>
                      TARIFAS POR SERVICIO (DEL API)
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                      {(editingEntProvider as any).tarifas.map((t: any, i: number) => (
                        <Paper key={i} variant="outlined" sx={{ p: 1.5, minWidth: 220, flex: 1, bgcolor: SURFACE }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Chip
                              size="small"
                              label={t.requiere_factura ? 'Con factura' : 'Sin factura'}
                              sx={{
                                bgcolor: t.requiere_factura ? 'rgba(74,222,128,0.15)' : 'rgba(255,102,0,0.15)',
                                color: t.requiere_factura ? '#4ade80' : ORANGE,
                                fontWeight: 700,
                              }}
                            />
                          </Box>
                          <Typography variant="body2" sx={{ color: TEXT_PRIMARY, fontWeight: 600 }}>
                            {t.servicio_nombre || t.servicio_codigo}
                          </Typography>
                          <Typography variant="h6" sx={{ color: ORANGE, fontWeight: 700, mt: 0.5 }}>
                            {Number(t.comision_cliente_porcentaje ?? 0).toFixed(2)}%
                          </Typography>
                          <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
                            Comisión cliente · código: {t.servicio_codigo}
                          </Typography>
                          <Box sx={{ mt: 0.75, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                            <Chip
                              size="small"
                              label={`mín USD: $${Number(t.monto_minimo?.USD || 0).toFixed(2)}`}
                              sx={{ fontSize: 11, bgcolor: Number(t.monto_minimo?.USD || 0) > 0 ? 'rgba(74,222,128,0.15)' : undefined }}
                            />
                            <Chip
                              size="small"
                              label={`mín RMB: ¥${Number(t.monto_minimo?.RMB || 0).toFixed(2)}`}
                              sx={{ fontSize: 11, bgcolor: Number(t.monto_minimo?.RMB || 0) > 0 ? 'rgba(74,222,128,0.15)' : undefined }}
                            />
                          </Box>
                        </Paper>
                      ))}
                    </Box>
                  </Box>
                )}
              </Paper>

              {/* Configuración LOCAL (solo el código no llega del API) */}
              <Paper variant="outlined" sx={{ p: 2, bgcolor: INNER_BG, border: `1px dashed ${BORDER}` }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
                  Configuración local
                </Typography>
                <Typography variant="caption" sx={{ color: TEXT_MUTED, display: 'block', mb: 2 }}>
                  Único valor que administra EntregaX porque el API ENTANGLED no lo expone.
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <TextField
                    label="Código"
                    value={editingEntProvider.code || ''}
                    onChange={(e) => setEditingEntProvider({
                      ...editingEntProvider,
                      code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16),
                    })}
                    helperText="Identificador corto local (mayúsculas y números)"
                    sx={{ width: 240 }}
                    inputProps={{ maxLength: 16 }}
                  />
                </Box>
              </Paper>

              {/* Buscador de claves SAT (motor /conceptos/search del API ENTANGLED) */}
              <ClaveSatSearchBlock
                providerName={editingEntProvider.name}
                providerExternalId={(editingEntProvider as any).external_id || null}
                token={getToken()}
              />


              {/* Overrides editables */}
              <Paper variant="outlined" sx={{ p: 2, borderColor: ORANGE }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5, color: ORANGE }}>
                  Incremento sobre el valor del API (deja vacío o 0 para no aumentar)
                </Typography>
                <Typography variant="caption" sx={{ color: TEXT_MUTED }} component="div">
                  El valor se <b>suma</b> al del API. Ej: TC USD del API = ${Number(editingEntProvider.tipo_cambio_usd).toFixed(2)} + incremento 1.00 ⇒ se vende a ${(Number(editingEntProvider.tipo_cambio_usd) + 1).toFixed(2)}.
                  Si un cliente tiene su propio override por usuario, ese tiene prioridad.
                </Typography>
                {(() => {
                  const ovUsd = Number(editingEntProvider.override_tipo_cambio_usd ?? 0) || 0;
                  const ovRmb = Number(editingEntProvider.override_tipo_cambio_rmb ?? 0) || 0;
                  const ovPct = Number(editingEntProvider.override_porcentaje_compra ?? 0) || 0;
                  const ovCosto = Number(editingEntProvider.override_costo_operacion_usd ?? 0) || 0;
                  const apiUsd = Number(editingEntProvider.tipo_cambio_usd) || 0;
                  const apiRmb = Number(editingEntProvider.tipo_cambio_rmb) || 0;
                  const apiPct = Number(editingEntProvider.porcentaje_compra) || 0;
                  const apiCosto = Number(editingEntProvider.costo_operacion_usd || 0) || 0;
                  const effUsd = apiUsd + ovUsd;
                  const effRmb = apiRmb + ovRmb;
                  const effPct = apiPct + ovPct;
                  const effCosto = apiCosto + ovCosto;
                  const cancelFee = Number(editingEntProvider.cancellation_fee_usd ?? 1) || 1;
                  const fmtUsd = apiUsd > 0 ? `$${effUsd.toFixed(4)}` : 'No disponible';
                  const fmtRmb = apiRmb > 0 ? `$${effRmb.toFixed(4)}` : 'No disponible';
                  const fmtPct = apiPct > 0 ? `${effPct.toFixed(2)}%` : 'No disponible';
                  const fmtCosto = apiCosto > 0 ? `$${effCosto.toFixed(2)} USD` : 'No disponible';
                  return (
                    <Typography variant="caption" sx={{ display: 'block', mt: 1, color: ORANGE, fontWeight: 600 }}>
                      Efectivo: TC USD {fmtUsd} · TC RMB {fmtRmb} · % {fmtPct} · Costo op. {fmtCosto} · Cancelación ${cancelFee.toFixed(2)} USD
                    </Typography>
                  );
                })()}
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 2 }}>
                  <TextField
                    label="Incremento TC USD"
                    type="number"
                    value={editingEntProvider.override_tipo_cambio_usd ?? ''}
                    onChange={(e) => setEditingEntProvider({
                      ...editingEntProvider,
                      override_tipo_cambio_usd: e.target.value === '' ? null : e.target.value,
                    })}
                    placeholder="0.0000"
                    helperText={`API: $${Number(editingEntProvider.tipo_cambio_usd).toFixed(4)}`}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start">+$</InputAdornment> } }}
                    sx={{ width: 220 }}
                  />
                  {Number(editingEntProvider.tipo_cambio_rmb) > 0 && (
                    <TextField
                      label="Incremento TC RMB"
                      type="number"
                      value={editingEntProvider.override_tipo_cambio_rmb ?? ''}
                      onChange={(e) => setEditingEntProvider({
                        ...editingEntProvider,
                        override_tipo_cambio_rmb: e.target.value === '' ? null : e.target.value,
                      })}
                      placeholder="0.0000"
                      helperText={`API: $${Number(editingEntProvider.tipo_cambio_rmb).toFixed(4)}`}
                      slotProps={{ input: { startAdornment: <InputAdornment position="start">+$</InputAdornment> } }}
                      sx={{ width: 220 }}
                    />
                  )}
                  {Number(editingEntProvider.porcentaje_compra) > 0 && (
                    <TextField
                      label="Incremento % de compra (Comisión EntregaX)"
                      type="number"
                      value={editingEntProvider.override_porcentaje_compra ?? ''}
                      onChange={(e) => setEditingEntProvider({
                        ...editingEntProvider,
                        override_porcentaje_compra: e.target.value === '' ? null : e.target.value,
                      })}
                      placeholder="0.00"
                      helperText={`API: ${Number(editingEntProvider.porcentaje_compra).toFixed(2)}% · Lo que cobra EntregaX`}
                      slotProps={{ input: { startAdornment: <InputAdornment position="start">+</InputAdornment>, endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
                      sx={{ width: 280 }}
                    />
                  )}
                  <TextField
                    label="Comisión Asesor %"
                    type="number"
                    value={editingEntProvider.asesor_pct ?? ''}
                    onChange={(e) => setEditingEntProvider({
                      ...editingEntProvider,
                      asesor_pct: e.target.value === '' ? null : e.target.value,
                    })}
                    placeholder="0.00"
                    helperText="% que recibe el asesor referidor"
                    slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
                    sx={{ width: 200 }}
                  />
                  <TextField
                    label="Override % total"
                    type="number"
                    value={editingEntProvider.over_pct ?? ''}
                    onChange={(e) => setEditingEntProvider({
                      ...editingEntProvider,
                      over_pct: e.target.value === '' ? null : e.target.value,
                    })}
                    placeholder="0.00"
                    helperText="% del monto que se reparte entre asesor y EntregaX"
                    slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
                    sx={{ width: 200 }}
                  />
                  {/* División del override */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: 280, p: 1.5, border: '1px dashed #ccc', borderRadius: 1 }}>
                    <Typography variant="caption" fontWeight={700} sx={{ color: TEXT_MUTED }}>
                      División del override
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <TextField
                        label="Asesor %"
                        type="number"
                        size="small"
                        value={editingEntProvider.over_split_asesor ?? 90}
                        onChange={(e) => {
                          const v = Math.min(100, Math.max(0, Number(e.target.value)));
                          setEditingEntProvider({ ...editingEntProvider, over_split_asesor: v });
                        }}
                        slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
                        sx={{ width: 110 }}
                        inputProps={{ min: 0, max: 100, step: 1 }}
                      />
                      <Typography variant="body2" sx={{ color: TEXT_MUTED }}>+</Typography>
                      <TextField
                        label="EntregaX %"
                        size="small"
                        value={100 - Number(editingEntProvider.over_split_asesor ?? 90)}
                        InputProps={{ readOnly: true, endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                        sx={{ width: 110, '& .MuiInputBase-input': { color: TEXT_MUTED } }}
                        variant="filled"
                      />
                    </Box>
                    <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
                      Solo edita el % del asesor — EntregaX recibe el resto
                    </Typography>
                  </Box>
                  <TextField
                    label="Incremento Costo Operación"
                    type="number"
                    value={editingEntProvider.override_costo_operacion_usd ?? ''}
                    onChange={(e) => setEditingEntProvider({
                      ...editingEntProvider,
                      override_costo_operacion_usd: e.target.value === '' ? null : e.target.value,
                    })}
                    placeholder="0.00"
                    helperText={`API: $${Number(editingEntProvider.costo_operacion_usd || 0).toFixed(2)}`}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start">+$</InputAdornment>, endAdornment: <InputAdornment position="end">USD</InputAdornment> } }}
                    sx={{ width: 260 }}
                  />
                  <TextField
                    label="Comisión cancelación"
                    type="number"
                    value={editingEntProvider.cancellation_fee_usd ?? 1}
                    onChange={(e) => setEditingEntProvider({
                      ...editingEntProvider,
                      cancellation_fee_usd: e.target.value === '' ? null : e.target.value,
                    })}
                    inputProps={{ min: 0, step: '0.01' }}
                    helperText="Cargo en USD cuando la solicitud vence a las 24 horas"
                    slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment>, endAdornment: <InputAdornment position="end">USD</InputAdornment> } }}
                    sx={{ width: 260 }}
                  />
                </Box>
              </Paper>

              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={editingEntProvider.is_active}
                      onChange={(e) => setEditingEntProvider({ ...editingEntProvider, is_active: e.target.checked })}
                    />
                  }
                  label="Activo"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={editingEntProvider.is_default}
                      onChange={(e) => setEditingEntProvider({ ...editingEntProvider, is_default: e.target.checked })}
                    />
                  }
                  label="Default (se selecciona automáticamente)"
                />
                <TextField
                  label="Orden"
                  type="number"
                  value={editingEntProvider.sort_order}
                  onChange={(e) => setEditingEntProvider({ ...editingEntProvider, sort_order: Number(e.target.value) })}
                  sx={{ width: 120 }}
                />
              </Box>

              <TextField
                label="Notas internas"
                multiline
                minRows={2}
                value={editingEntProvider.notes || ''}
                onChange={(e) => setEditingEntProvider({ ...editingEntProvider, notes: e.target.value })}
                fullWidth
              />

              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  Cuentas bancarias para depósito MXN del cliente
                </Typography>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setEditingEntProvider({
                    ...editingEntProvider,
                    bank_accounts: [
                      ...(editingEntProvider.bank_accounts || []),
                      { currency: 'MXN', bank: '', holder: '', account: '', clabe: '', reference: '' },
                    ],
                  })}
                >
                  Agregar cuenta
                </Button>
              </Box>

              {(editingEntProvider.bank_accounts || []).map((acc, idx) => (
                <Card key={idx} variant="outlined" sx={{ p: 1 }}>
                  <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1 }}>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <FormControl sx={{ width: 120 }}>
                        <InputLabel>Divisa</InputLabel>
                        <Select
                          label="Divisa"
                          value={acc.currency || 'MXN'}
                          onChange={(e) => {
                            const list = [...editingEntProvider.bank_accounts];
                            list[idx] = { ...acc, currency: String(e.target.value) };
                            setEditingEntProvider({ ...editingEntProvider, bank_accounts: list });
                          }}
                        >
                          <MenuItem value="MXN">MXN</MenuItem>
                          <MenuItem value="USD">USD</MenuItem>
                          <MenuItem value="EUR">EUR</MenuItem>
                        </Select>
                      </FormControl>
                      <TextField
                        label="Banco"
                        value={acc.bank}
                        onChange={(e) => {
                          const list = [...editingEntProvider.bank_accounts];
                          list[idx] = { ...acc, bank: e.target.value };
                          setEditingEntProvider({ ...editingEntProvider, bank_accounts: list });
                        }}
                        sx={{ flex: 1, minWidth: 200 }}
                      />
                      <TextField
                        label="Titular"
                        value={acc.holder}
                        onChange={(e) => {
                          const list = [...editingEntProvider.bank_accounts];
                          list[idx] = { ...acc, holder: e.target.value };
                          setEditingEntProvider({ ...editingEntProvider, bank_accounts: list });
                        }}
                        sx={{ flex: 1, minWidth: 200 }}
                      />
                      <IconButton
                        color="error"
                        onClick={() => {
                          const list = editingEntProvider.bank_accounts.filter((_, i) => i !== idx);
                          setEditingEntProvider({ ...editingEntProvider, bank_accounts: list });
                        }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <TextField
                        label="Número de cuenta"
                        value={acc.account}
                        onChange={(e) => {
                          const list = [...editingEntProvider.bank_accounts];
                          list[idx] = { ...acc, account: e.target.value };
                          setEditingEntProvider({ ...editingEntProvider, bank_accounts: list });
                        }}
                        sx={{ flex: 1, minWidth: 200 }}
                      />
                      <TextField
                        label="CLABE"
                        value={acc.clabe}
                        onChange={(e) => {
                          const list = [...editingEntProvider.bank_accounts];
                          list[idx] = { ...acc, clabe: e.target.value };
                          setEditingEntProvider({ ...editingEntProvider, bank_accounts: list });
                        }}
                        sx={{ flex: 1, minWidth: 200 }}
                      />
                      <TextField
                        label="Referencia"
                        value={acc.reference}
                        onChange={(e) => {
                          const list = [...editingEntProvider.bank_accounts];
                          list[idx] = { ...acc, reference: e.target.value };
                          setEditingEntProvider({ ...editingEntProvider, bank_accounts: list });
                        }}
                        sx={{ flex: 1, minWidth: 160 }}
                      />
                    </Box>
                  </CardContent>
                </Card>
              ))}
              {(editingEntProvider.bank_accounts || []).length === 0 && (
                <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
                  Sin cuentas bancarias. Agrega al menos una para que los clientes vean a dónde depositar.
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ bgcolor: HEADER_BG, borderTop: `1px solid ${BORDER}` }}>
          <Button onClick={() => setProviderEditOpen(false)} sx={{ color: TEXT_MUTED }}>Cancelar</Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSaveEntProvider}
            sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, ${ORANGE_DARK} 100%)`, fontWeight: 700, boxShadow: `0 4px 14px rgba(255,102,0,0.3)` }}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={4000} 
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snackbar.severity} sx={{ bgcolor: SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY, '& .MuiAlert-icon': { color: ORANGE } }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
