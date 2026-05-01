import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Paper, TextField, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Avatar, CircularProgress,
  Alert, Snackbar, IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, FormControl, InputLabel, Select, MenuItem, InputAdornment,
  Tabs, Tab, Card, CardContent, Divider, Switch, FormControlLabel, Autocomplete
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PercentIcon from '@mui/icons-material/Percent';
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

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const ORANGE = '#FF6600';
const ORANGE_DARK = '#E05500';
const CHARCOAL = '#0D0D0D';
const SURFACE = '#141414';
const SURFACE2 = '#1C1C1C';
const BORDER = '#2A2A2A';

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

export default function SupplierPaymentsPage() {
  useTranslation();
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Estado
  const [providers, setProviders] = useState<Provider[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

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
    effective_tipo_cambio_usd?: number | string;
    effective_tipo_cambio_rmb?: number | string;
    effective_porcentaje_compra?: number | string;
    effective_costo_operacion_usd?: number | string;
    bank_accounts: EntBankAccount[];
    notes: string | null;
    is_active: boolean;
    is_default: boolean;
    sort_order: number;
  };
  const [entProviders, setEntProviders] = useState<EntProvider[]>([]);
  const [providerEditOpen, setProviderEditOpen] = useState(false);
  const [editingEntProvider, setEditingEntProvider] = useState<EntProvider | null>(null);
  // Overrides por usuario
  type UserPricing = { user_id: number; client_name: string; client_email: string; porcentaje_compra: string; notes: string | null; updated_at: string };
  const [userPricing, setUserPricing] = useState<UserPricing[]>([]);
  type UserOption = { id: number; full_name: string; email: string; box_id?: string };
  const [userQuery, setUserQuery] = useState('');
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [overridePct, setOverridePct] = useState<string>('');
  const [overrideNotes, setOverrideNotes] = useState<string>('');
  const [savingOverride, setSavingOverride] = useState(false);

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

      // ENTANGLED: providers + overrides por usuario (no fatal si falla)
      try {
        const [provRes, upRes] = await Promise.all([
          axios.get(`${API_URL}/admin/entangled/providers`, { headers }),
          axios.get(`${API_URL}/admin/entangled/user-pricing`, { headers })
        ]);
        const list = (provRes.data || []).map((p: any) => ({
          ...p,
          bank_accounts: Array.isArray(p.bank_accounts) ? p.bank_accounts : [],
        }));
        setEntProviders(list);
        setUserPricing(upRes.data || []);
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

  // ===== ENTANGLED handlers =====
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

  const handleSearchUsers = async (q: string) => {
    setUserQuery(q);
    if (!q || q.trim().length < 2) { setUserOptions([]); return; }
    try {
      const res = await axios.get(`${API_URL}/admin/users/search?q=${encodeURIComponent(q.trim())}`,
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setUserOptions(res.data || []);
    } catch (e) {
      setUserOptions([]);
    }
  };

  const handleSaveOverride = async () => {
    if (!selectedUser) return;
    const pct = Number(overridePct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setSnackbar({ open: true, message: 'Porcentaje inválido (0–100)', severity: 'error' });
      return;
    }
    setSavingOverride(true);
    try {
      await axios.put(`${API_URL}/admin/entangled/user-pricing/${selectedUser.id}`,
        { porcentaje_compra: pct, notes: overrideNotes || null },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setSnackbar({ open: true, message: 'Porcentaje guardado para el cliente', severity: 'success' });
      setSelectedUser(null);
      setOverridePct('');
      setOverrideNotes('');
      setUserQuery('');
      setUserOptions([]);
      loadData();
    } catch (e) {
      setSnackbar({ open: true, message: 'Error al guardar porcentaje', severity: 'error' });
    } finally {
      setSavingOverride(false);
    }
  };

  const handleDeleteOverride = async (userId: number) => {
    if (!window.confirm('¿Eliminar el override de este cliente? Dejará de tener comisión adicional.')) return;
    try {
      await axios.delete(`${API_URL}/admin/entangled/user-pricing/${userId}`,
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setSnackbar({ open: true, message: 'Override eliminado', severity: 'success' });
      loadData();
    } catch (e) {
      setSnackbar({ open: true, message: 'Error al eliminar', severity: 'error' });
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

  const handleUpdatePaymentStatus = async (paymentId: number, status: string) => {
    try {
      await axios.put(`${API_URL}/admin/supplier-payments/status`,
        { paymentId, status },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setSnackbar({ open: true, message: 'Estado actualizado', severity: 'success' });
      loadData();
    } catch (error) {
      setSnackbar({ open: true, message: 'Error al actualizar', severity: 'error' });
    }
  };

  const getStatusChip = (status: string) => {
    const config: Record<string, { color: 'warning' | 'info' | 'success' | 'error' | 'default'; icon: React.ReactElement | undefined }> = {
      pending: { color: 'warning', icon: <PendingIcon fontSize="small" /> },
      processing: { color: 'info', icon: <CurrencyExchangeIcon fontSize="small" /> },
      paid: { color: 'info', icon: <PaymentsIcon fontSize="small" /> },
      completed: { color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
      rejected: { color: 'error', icon: <CancelIcon fontSize="small" /> }
    };
    const c = config[status] || { color: 'default' as const, icon: undefined };
    return <Chip size="small" color={c.color} icon={c.icon} label={status.toUpperCase()} />;
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

  return (
    <Box sx={{ bgcolor: CHARCOAL, minHeight: '100vh', color: '#ffffff', fontFamily: '"Inter", "Roboto", sans-serif' }}>

      {/* ══════════════════════════════════════════════════
          HERO BANNER — X-Pay premium fintech header
          ══════════════════════════════════════════════════ */}
      <Box sx={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(135deg, #050505 0%, #0D0D0D 40%, #1a0800 100%)`,
        borderBottom: `1px solid ${BORDER}`,
        pb: 0,
      }}>
        {/* Background radial glow */}
        <Box sx={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse 60% 80% at 70% 50%, rgba(255,102,0,0.08) 0%, transparent 70%)`,
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
              src="/logo-xpay.png"
              alt="X-Pay"
              sx={{
                height: 38,
                filter: 'drop-shadow(0 0 8px rgba(255,102,0,0.6))',
                animation: 'xpay-breathe 3s ease-in-out infinite',
              }}
              onError={(e: any) => { e.currentTarget.style.display = 'none'; }}
            />
            <Box>
              <Typography variant="h5" fontWeight={800} sx={{ color: '#fff', letterSpacing: '-0.5px', lineHeight: 1 }}>
                X-<span style={{ color: ORANGE }}>PAy</span>
              </Typography>
              <Typography variant="caption" sx={{ color: '#888', letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '0.6rem' }}>
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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 4, py: 3, position: 'relative', zIndex: 2, gap: 3, flexWrap: 'wrap' }}>
          {/* Left: headline */}
          <Box sx={{ flex: '0 0 auto', maxWidth: 520 }}>
            <Typography variant="h3" fontWeight={800} sx={{
              color: '#fff', lineHeight: 1.1, letterSpacing: '-1px',
              textShadow: `0 0 40px rgba(255,102,0,0.25)`,
              mb: 1,
            }}>
              ENVÍOS DE DINERO{' '}
              <Box component="span" sx={{ color: ORANGE }}>SEGUROS</Box>
              {' '}A CHINA Y ESTADOS UNIDOS.
            </Typography>
            <Typography variant="body2" sx={{ color: '#888', mb: 2.5, lineHeight: 1.6 }}>
              Procesamos pagos internacionales con confirmación SWIFT/BIC.
              Generamos factura oficial y tipo de cambio competitivo en tiempo real.
            </Typography>
            {/* Feature pills */}
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              {[
                { icon: <SecurityIcon sx={{ fontSize: 14 }} />, label: 'SWIFT / BIC' },
                { icon: <BoltIcon sx={{ fontSize: 14 }} />, label: 'Tiempo Real' },
                { icon: <PublicIcon sx={{ fontSize: 14 }} />, label: 'USD · CNY · MXN' },
              ].map((feat) => (
                <Box key={feat.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.5,
                  bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10 }}>
                  <Box sx={{ color: ORANGE }}>{feat.icon}</Box>
                  <Typography variant="caption" sx={{ color: '#ccc', fontWeight: 600, fontSize: '0.68rem', letterSpacing: '0.05em' }}>{feat.label}</Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Right: Live rates card */}
          <Box sx={{
            flex: '0 0 auto', minWidth: 320,
            bgcolor: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`,
            borderRadius: 3, p: 2.5, backdropFilter: 'blur(8px)',
            boxShadow: `0 0 40px rgba(255,102,0,0.06)`,
          }}>
            <Typography variant="caption" sx={{ color: '#666', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, fontSize: '0.65rem' }}>
              Tipos de Cambio · En Vivo
            </Typography>

            {/* USD → CNY */}
            <Box sx={{ mt: 1.5, mb: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#555', fontSize: '0.65rem' }}>Par</Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ color: '#aaa', letterSpacing: '0.05em' }}>USD → CNY</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="h5" fontWeight={800} sx={{ color: '#fff', letterSpacing: '-0.5px', lineHeight: 1 }}>
                    {liveUsdCny.toFixed(4)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#4ade80', fontWeight: 600, fontSize: '0.65rem' }}>▲ En vivo</Typography>
                </Box>
              </Box>
              {/* Simulated sparkline bar */}
              <Box sx={{ mt: 1, height: 3, borderRadius: 10, bgcolor: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                <Box sx={{ height: '100%', width: '72%', bgcolor: ORANGE, borderRadius: 10, boxShadow: `0 0 8px ${ORANGE}` }} />
              </Box>
            </Box>

            <Divider sx={{ borderColor: BORDER, my: 1.5 }} />

            {/* USD → MXN */}
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#555', fontSize: '0.65rem' }}>Par</Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ color: '#aaa', letterSpacing: '0.05em' }}>USD → MXN</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="h5" fontWeight={800} sx={{ color: '#fff', letterSpacing: '-0.5px', lineHeight: 1 }}>
                    {liveUsdMxn.toFixed(4)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#4ade80', fontWeight: 600, fontSize: '0.65rem' }}>▲ En vivo</Typography>
                </Box>
              </Box>
              <Box sx={{ mt: 1, height: 3, borderRadius: 10, bgcolor: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                <Box sx={{ height: '100%', width: '58%', bgcolor: '#3b82f6', borderRadius: 10, boxShadow: `0 0 8px #3b82f6` }} />
              </Box>
            </Box>

            {/* CTA */}
            <Button
              fullWidth
              variant="contained"
              startIcon={<AddIcon />}
              sx={{
                mt: 2.5,
                background: `linear-gradient(135deg, ${ORANGE} 0%, ${ORANGE_DARK} 100%)`,
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.85rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                py: 1.2,
                borderRadius: 2,
                boxShadow: `0 4px 20px rgba(255,102,0,0.4)`,
                animation: 'xpay-pulse 2.5s ease-in-out infinite',
                '&:hover': {
                  background: `linear-gradient(135deg, #FF7700 0%, ${ORANGE} 100%)`,
                  boxShadow: `0 6px 28px rgba(255,102,0,0.6)`,
                },
              }}
              onClick={() => setTabValue(0)}
            >
              Crear Nuevo Envío
            </Button>
          </Box>
        </Box>

        {/* Bottom ticker bar */}
        <Box sx={{ borderTop: `1px solid ${BORDER}`, bgcolor: 'rgba(0,0,0,0.5)', px: 2, py: 0.8, display: 'flex', gap: 4, overflow: 'hidden' }}>
          {[
            { label: 'USD/CNY', val: liveUsdCny.toFixed(4), up: true },
            { label: 'USD/MXN', val: liveUsdMxn.toFixed(4), up: true },
            { label: 'Completados 30d', val: stats?.completed || 0, up: true },
            { label: 'Pendientes', val: stats?.pending || 0, up: false },
            { label: 'Ganancia 30d', val: `$${Number(stats?.total_platform_profit || 0).toFixed(0)}`, up: true },
            { label: 'Procesando', val: stats?.processing || 0, up: true },
          ].map((item) => (
            <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 1, whiteSpace: 'nowrap' }}>
              <Typography variant="caption" sx={{ color: '#555', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</Typography>
              <Typography variant="caption" sx={{ color: item.up ? '#4ade80' : ORANGE, fontWeight: 700, fontSize: '0.75rem' }}>
                {item.up ? '▲' : '▼'} {item.val}
              </Typography>
            </Box>
          ))}
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
              <Typography variant="caption" sx={{ color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.65rem', fontWeight: 700 }}>Pendientes</Typography>
              <Typography variant="h3" fontWeight={800} sx={{ color: '#fff', lineHeight: 1.1, mt: 0.5 }}>{stats?.pending || 0}</Typography>
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
              <Typography variant="caption" sx={{ color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.65rem', fontWeight: 700 }}>Procesando</Typography>
              <Typography variant="h3" fontWeight={800} sx={{ color: '#fff', lineHeight: 1.1, mt: 0.5 }}>{stats?.processing || 0}</Typography>
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
              <Typography variant="caption" sx={{ color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.65rem', fontWeight: 700 }}>Completados 30d</Typography>
              <Typography variant="h3" fontWeight={800} sx={{ color: '#fff', lineHeight: 1.1, mt: 0.5 }}>{stats?.completed || 0}</Typography>
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
              <Typography variant="caption" sx={{ color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.65rem', fontWeight: 700 }}>Ganancia 30d</Typography>
              <Typography variant="h3" fontWeight={800} sx={{ color: '#fff', lineHeight: 1.1, mt: 0.5, fontSize: '1.8rem' }}>
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

      {/* ─── Tabs ─── */}
      <Paper sx={{ mb: 3, borderRadius: 2, bgcolor: SURFACE, border: `1px solid ${BORDER}` }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{
          borderBottom: 1, borderColor: BORDER,
          '& .MuiTab-root': { color: '#666', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.75rem', minHeight: 52 },
          '& .Mui-selected': { color: `${ORANGE} !important` },
          '& .MuiTabs-indicator': { backgroundColor: ORANGE, height: 2, boxShadow: `0 0 8px ${ORANGE}` },
        }}>
          <Tab icon={<PaymentsIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Solicitudes" />
          <Tab icon={<CurrencyExchangeIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Tipo de Cambio" />
          <Tab icon={<BusinessIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Proveedores" />
          <Tab icon={<HubIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="ENTANGLED" />
        </Tabs>
      </Paper>

      {/* Tab: Solicitudes */}
      {tabValue === 0 && (
        <Paper sx={{ borderRadius: 3, overflow: 'hidden', bgcolor: SURFACE, border: `1px solid ${BORDER}` }}>
          <Box sx={{ p: 2, bgcolor: '#0a0a0a', display: 'flex', gap: 2, alignItems: 'center', borderBottom: `1px solid ${BORDER}` }}>
            <Typography variant="caption" sx={{ color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, fontSize: '0.7rem', flex: 1 }}>
              Últimos Envíos Realizados
            </Typography>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel sx={{ color: '#555', fontSize: '0.8rem' }}>Estado</InputLabel>
              <Select value={statusFilter} label="Estado" onChange={(e) => setStatusFilter(e.target.value)}
                sx={{
                  color: '#ffffff', backgroundColor: '#0a0a0a', fontSize: '0.8rem',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: BORDER },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#555' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: ORANGE },
                  '& .MuiSvgIcon-root': { color: ORANGE },
                }}
              >
                <MenuItem value="all">Todos</MenuItem>
                <MenuItem value="pending">Pendientes</MenuItem>
                <MenuItem value="processing">En Proceso</MenuItem>
                <MenuItem value="completed">Completados</MenuItem>
                <MenuItem value="rejected">Rechazados</MenuItem>
              </Select>
            </FormControl>
          </Box>
          
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#0a0a0a', borderBottom: `1px solid ${BORDER}` }}>
                  <TableCell sx={{ color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Cliente</TableCell>
                  <TableCell align="right" sx={{ color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Monto a Enviar al Proveedor</TableCell>
                  <TableCell align="right" sx={{ color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Divisa Destino</TableCell>
                  <TableCell sx={{ color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Estatus</TableCell>
                  <TableCell sx={{ color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Factura</TableCell>
                  <TableCell sx={{ color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Pago a Proveedor</TableCell>
                  <TableCell sx={{ color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id} hover sx={{ bgcolor: SURFACE, '&:hover': { bgcolor: SURFACE2 }, borderBottom: `1px solid ${BORDER}` }}>
                    <TableCell sx={{ color: '#ffffff', borderBottom: `1px solid ${BORDER}` }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ width: 34, height: 34, bgcolor: `rgba(255,102,0,0.15)`, border: `1px solid rgba(255,102,0,0.3)`, color: ORANGE, fontWeight: 700 }}>
                          {p.client_name?.[0] || '?'}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={700} sx={{ color: '#ffffff' }}>{p.client_name}</Typography>
                          <Typography variant="caption" sx={{ color: '#555' }}>{p.client_email}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ borderBottom: `1px solid ${BORDER}` }}>
                      <Typography fontWeight={800} sx={{ color: ORANGE, fontSize: '1rem' }}>${parseFloat(String(p.amount_usd)).toLocaleString()}</Typography>
                    </TableCell>
                    <TableCell sx={{ color: '#aaa', borderBottom: `1px solid ${BORDER}` }}>USD</TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${BORDER}` }}>{getStatusChip(p.status)}</TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${BORDER}` }}>
                      <Chip size="small" label="Pendiente" sx={{ bgcolor: 'transparent', border: `1px solid ${BORDER}`, color: '#888', fontSize: '0.65rem' }} />
                    </TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${BORDER}` }}>
                      <Chip size="small" label="Pendiente" sx={{ bgcolor: 'transparent', border: `1px solid ${BORDER}`, color: '#888', fontSize: '0.65rem' }} />
                    </TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${BORDER}` }}>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {p.status === 'pending' && (
                          <>
                            <Tooltip title="Marcar En Proceso">
                              <IconButton size="small" sx={{ color: '#3b82f6', '&:hover': { bgcolor: 'rgba(59,130,246,0.1)' } }} onClick={() => handleUpdatePaymentStatus(p.id, 'processing')}>
                                <CurrencyExchangeIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Rechazar">
                              <IconButton size="small" sx={{ color: '#ff6b6b', '&:hover': { bgcolor: 'rgba(255,107,107,0.1)' } }} onClick={() => handleUpdatePaymentStatus(p.id, 'rejected')}>
                                <CancelIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                        {p.status === 'processing' && (
                          <Tooltip title="Marcar Completado">
                            <IconButton size="small" sx={{ color: '#4ade80', '&:hover': { bgcolor: 'rgba(74,222,128,0.1)' } }} onClick={() => handleUpdatePaymentStatus(p.id, 'completed')}>
                              <CheckCircleIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title={new Date(p.created_at).toLocaleString()}>
                          <Typography variant="caption" sx={{ color: '#555', fontSize: '0.65rem', ml: 0.5, alignSelf: 'center', whiteSpace: 'nowrap' }}>
                            {new Date(p.created_at).toLocaleDateString()}
                          </Typography>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
                {payments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6, borderBottom: 'none' }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, opacity: 0.5 }}>
                        <PaymentsIcon sx={{ fontSize: 40, color: '#555' }} />
                        <Typography sx={{ color: '#555' }}>No hay solicitudes</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Tab: Tipo de Cambio — Sección ENTANGLED (CRUD por proveedor) */}
      {tabValue === 1 && (
        <Paper sx={{ p: 3, borderRadius: 3, mt: 3, bgcolor: SURFACE, border: `1px solid ${BORDER}`, color: '#fff' }}>
          <Box sx={{ mb: 1 }}>
            <Typography variant="h6" fontWeight="bold">
              🌐 Proveedores ENTANGLED (Triangulación internacional)
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Los proveedores se sincronizan desde el API. Aquí solo configuras TC USD, TC RMB, % de compra y cuentas bancarias para recibir el depósito MXN del cliente.
            </Typography>
          </Box>
          <Divider sx={{ my: 2 }} />

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell>Nombre</TableCell>
                  <TableCell>Código</TableCell>
                  <TableCell align="right">TC USD efectivo</TableCell>
                  <TableCell align="right">TC RMB efectivo</TableCell>
                  <TableCell align="right">% compra efectivo</TableCell>
                  <TableCell align="center">Cuentas</TableCell>
                  <TableCell align="center">Activo</TableCell>
                  <TableCell align="center">Default</TableCell>
                  <TableCell align="center">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entProviders.map((p) => {
                  const effUsd = Number(p.effective_tipo_cambio_usd ?? p.tipo_cambio_usd);
                  const effRmb = Number(p.effective_tipo_cambio_rmb ?? p.tipo_cambio_rmb);
                  const effPct = Number(p.effective_porcentaje_compra ?? p.porcentaje_compra);
                  const ovUsd = p.override_tipo_cambio_usd != null;
                  const ovRmb = p.override_tipo_cambio_rmb != null;
                  const ovPct = p.override_porcentaje_compra != null;
                  return (
                  <TableRow key={p.id} hover>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>{p.code || '—'}</TableCell>
                    <TableCell align="right">
                      ${effUsd.toFixed(4)}
                      {ovUsd && <Chip size="small" sx={{ ml: 0.5 }} color="warning" label="OV" />}
                    </TableCell>
                    <TableCell align="right">
                      ${effRmb.toFixed(4)}
                      {ovRmb && <Chip size="small" sx={{ ml: 0.5 }} color="warning" label="OV" />}
                    </TableCell>
                    <TableCell align="right">
                      {effPct.toFixed(2)}%
                      {ovPct && <Chip size="small" sx={{ ml: 0.5 }} color="warning" label="OV" />}
                    </TableCell>
                    <TableCell align="center">{p.bank_accounts?.length || 0}</TableCell>
                    <TableCell align="center">
                      {p.is_active ? <CheckCircleIcon fontSize="small" color="success" /> : <CancelIcon fontSize="small" color="error" />}
                    </TableCell>
                    <TableCell align="center">
                      {p.is_default ? <Chip size="small" color="primary" label="Default" /> : '—'}
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Configurar override">
                        <IconButton size="small" onClick={() => { setEditingEntProvider({ ...p, bank_accounts: [...(p.bank_accounts || [])] }); setProviderEditOpen(true); }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  );
                })}
                {entProviders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 3 }}>
                      <Typography color="text.secondary">No hay proveedores configurados.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Divider sx={{ my: 3 }} />

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            <PercentIcon sx={{ verticalAlign: 'middle', mr: 1, color: ORANGE }} />
            Override por cliente (comisión adicional)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            El % que configures aquí se <strong>suma</strong> al % global del proveedor y se reparte automáticamente usando el split configurado (Asesor / EntregaX).
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end', mb: 2 }}>
            <Autocomplete
              sx={{ minWidth: 320, flex: 1 }}
              options={userOptions}
              value={selectedUser}
              onChange={(_, v) => setSelectedUser(v)}
              inputValue={userQuery}
              onInputChange={(_, v) => handleSearchUsers(v)}
              getOptionLabel={(o) => o ? `${o.full_name || o.email} (${o.email}${o.box_id ? ` · ${o.box_id}` : ''})` : ''}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              filterOptions={(x) => x}
              renderInput={(params) => (
                <TextField {...params} label="Buscar cliente (nombre, email, box, teléfono)" placeholder="Escribe al menos 2 caracteres" />
              )}
              noOptionsText={userQuery.length < 2 ? 'Escribe al menos 2 caracteres' : 'Sin resultados'}
            />
            <TextField
              label="Override % adicional"
              type="number"
              value={overridePct}
              onChange={(e) => setOverridePct(e.target.value)}
              slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
              sx={{ width: 180 }}
              helperText="Se suma al % base del proveedor"
            />
            <TextField
              label="Notas (opcional)"
              value={overrideNotes}
              onChange={(e) => setOverrideNotes(e.target.value)}
              sx={{ minWidth: 220, flex: 1 }}
            />
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSaveOverride}
              disabled={!selectedUser || overridePct === '' || savingOverride}
              sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` }}
            >
              {savingOverride ? 'Guardando…' : 'Guardar override'}
            </Button>
          </Box>

          <TableContainer sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell>Cliente</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell align="right">% personalizado</TableCell>
                  <TableCell>Notas</TableCell>
                  <TableCell>Actualizado</TableCell>
                  <TableCell align="center">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {userPricing.map((up) => (
                  <TableRow key={up.user_id} hover>
                    <TableCell>{up.client_name || '—'}</TableCell>
                    <TableCell>{up.client_email}</TableCell>
                    <TableCell align="right">
                      <Chip size="small" color="primary" label={`${Number(up.porcentaje_compra).toFixed(2)}%`} />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {up.notes || '—'}
                    </TableCell>
                    <TableCell>{up.updated_at ? new Date(up.updated_at).toLocaleDateString() : '—'}</TableCell>
                    <TableCell align="center">
                      <Tooltip title="Eliminar override (volver al global)">
                        <IconButton size="small" color="error" onClick={() => handleDeleteOverride(up.user_id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {userPricing.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                      <Typography color="text.secondary">No hay clientes con porcentaje personalizado</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Tab: Proveedores */}
      {tabValue === 2 && (
        <Paper sx={{ borderRadius: 3, overflow: 'hidden', bgcolor: SURFACE, border: `1px solid ${BORDER}` }}>
          <Box sx={{ p: 2, bgcolor: '#0a0a0a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${BORDER}` }}>
            <Typography fontWeight={700} sx={{ color: '#fff', letterSpacing: '0.05em' }}>Proveedores de Pago</Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => { setEditingProvider({ id: 0, name: '', base_cost_percent: 2, fixed_fee: 0, is_active: true }); setProviderModal(true); }}
              sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, ${ORANGE_DARK} 100%)`, fontWeight: 700, fontSize: '0.78rem',
                boxShadow: `0 4px 14px rgba(255,102,0,0.3)`, '&:hover': { boxShadow: `0 6px 20px rgba(255,102,0,0.5)` } }}
            >
              Nuevo Proveedor
            </Button>
          </Box>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#0a0a0a' }}>
                  <TableCell sx={{ color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Nombre</TableCell>
                  <TableCell align="right" sx={{ color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Costo (%)</TableCell>
                  <TableCell align="right" sx={{ color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Cargo Fijo</TableCell>
                  <TableCell sx={{ color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Estado</TableCell>
                  <TableCell sx={{ color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}` }}>Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {providers.map((p) => (
                  <TableRow key={p.id} hover sx={{ bgcolor: SURFACE, '&:hover': { bgcolor: SURFACE2 } }}>
                    <TableCell sx={{ borderBottom: `1px solid ${BORDER}` }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ bgcolor: p.is_active ? `rgba(255,102,0,0.15)` : 'rgba(255,255,255,0.05)', border: `1px solid ${p.is_active ? 'rgba(255,102,0,0.3)' : BORDER}`, color: p.is_active ? ORANGE : '#666', width: 34, height: 34 }}>
                          <BusinessIcon sx={{ fontSize: 18 }} />
                        </Avatar>
                        <Typography fontWeight={700} sx={{ color: '#fff' }}>{p.name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ color: ORANGE, fontWeight: 700, borderBottom: `1px solid ${BORDER}` }}>{p.base_cost_percent}%</TableCell>
                    <TableCell align="right" sx={{ color: '#aaa', borderBottom: `1px solid ${BORDER}` }}>${p.fixed_fee}</TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${BORDER}` }}>
                      <Chip
                        size="small"
                        label={p.is_active ? 'Activo' : 'Inactivo'}
                        sx={{
                          bgcolor: p.is_active ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${p.is_active ? 'rgba(74,222,128,0.3)' : BORDER}`,
                          color: p.is_active ? '#4ade80' : '#666',
                          fontSize: '0.65rem', fontWeight: 700,
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${BORDER}` }}>
                      <Tooltip title="Editar">
                        <IconButton size="small" sx={{ color: '#888', '&:hover': { color: ORANGE } }} onClick={() => { setEditingProvider(p); setProviderModal(true); }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Tab: ENTANGLED */}
      {tabValue === 3 && <EntangledAdminTab />}

      </Box>{/* end p:3 */}

      {/* Modal Proveedor */}
      <Dialog open={providerModal} onClose={() => setProviderModal(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { bgcolor: SURFACE, border: `1px solid ${BORDER}`, color: '#fff' } }}>
        <DialogTitle sx={{ bgcolor: '#0a0a0a', borderBottom: `1px solid ${BORDER}`, color: '#fff', fontWeight: 700 }}>
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
              sx={{ '& .MuiOutlinedInput-root': { color: '#fff', '& fieldset': { borderColor: BORDER }, '&:hover fieldset': { borderColor: '#555' }, '&.Mui-focused fieldset': { borderColor: ORANGE } }, '& .MuiInputLabel-root': { color: '#666' } }}
            />
            <TextField
              label="Costo Base (%)"
              type="number"
              value={editingProvider?.base_cost_percent || 0}
              onChange={(e) => setEditingProvider(prev => prev ? { ...prev, base_cost_percent: parseFloat(e.target.value) } : null)}
              slotProps={{ input: { endAdornment: <InputAdornment position="end"><span style={{ color: '#666' }}>%</span></InputAdornment> } }}
              helperText="Lo que te cobra el proveedor por cada operación"
              sx={{ '& .MuiOutlinedInput-root': { color: '#fff', '& fieldset': { borderColor: BORDER }, '&.Mui-focused fieldset': { borderColor: ORANGE } }, '& .MuiInputLabel-root': { color: '#666' }, '& .MuiFormHelperText-root': { color: '#555' } }}
            />
            <TextField
              label="Cargo Fijo"
              type="number"
              value={editingProvider?.fixed_fee || 0}
              onChange={(e) => setEditingProvider(prev => prev ? { ...prev, fixed_fee: parseFloat(e.target.value) } : null)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><span style={{ color: '#666' }}>$</span></InputAdornment> } }}
              helperText="Cargo fijo por operación (USD)"
              sx={{ '& .MuiOutlinedInput-root': { color: '#fff', '& fieldset': { borderColor: BORDER }, '&.Mui-focused fieldset': { borderColor: ORANGE } }, '& .MuiInputLabel-root': { color: '#666' }, '& .MuiFormHelperText-root': { color: '#555' } }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={editingProvider?.is_active || false}
                  onChange={(e) => setEditingProvider(prev => prev ? { ...prev, is_active: e.target.checked } : null)}
                  sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: ORANGE }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: ORANGE } }}
                />
              }
              label={<Typography sx={{ color: '#ccc' }}>Proveedor Activo</Typography>}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, bgcolor: '#0a0a0a', borderTop: `1px solid ${BORDER}` }}>
          <Button onClick={() => setProviderModal(false)} sx={{ color: '#888' }}>Cancelar</Button>
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
        PaperProps={{ sx: { bgcolor: SURFACE, border: `1px solid ${BORDER}`, color: '#fff' } }}>
        <DialogTitle sx={{ bgcolor: '#0a0a0a', borderBottom: `1px solid ${BORDER}`, color: '#fff', fontWeight: 700 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 4, height: 20, bgcolor: ORANGE, borderRadius: 2 }} />
            Configurar override · {editingEntProvider?.name}
          </Box>
        </DialogTitle>
        <DialogContent>
          {editingEntProvider && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              {/* Datos del API (read-only) */}
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
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
                  />
                  <TextField
                    label="Código"
                    value={editingEntProvider.code || ''}
                    InputProps={{ readOnly: true }}
                    sx={{ width: 160 }}
                    variant="filled"
                  />
                </Box>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 2 }}>
                  <TextField
                    label="TC USD del API"
                    value={Number(editingEntProvider.tipo_cambio_usd).toFixed(4)}
                    InputProps={{ readOnly: true, startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                    sx={{ width: 180 }}
                    variant="filled"
                  />
                  <TextField
                    label="TC RMB del API"
                    value={Number(editingEntProvider.tipo_cambio_rmb).toFixed(4)}
                    InputProps={{ readOnly: true, startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                    sx={{ width: 180 }}
                    variant="filled"
                  />
                  <TextField
                    label="% compra del API"
                    value={Number(editingEntProvider.porcentaje_compra).toFixed(2)}
                    InputProps={{ readOnly: true, endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                    sx={{ width: 160 }}
                    variant="filled"
                  />
                  <TextField
                    label="Costo operación del API"
                    value={Number(editingEntProvider.costo_operacion_usd || 0).toFixed(2)}
                    InputProps={{ readOnly: true, startAdornment: <InputAdornment position="start">$</InputAdornment>, endAdornment: <InputAdornment position="end">USD</InputAdornment> }}
                    sx={{ width: 200 }}
                    variant="filled"
                  />
                </Box>
              </Paper>

              {/* Overrides editables */}
              <Paper variant="outlined" sx={{ p: 2, borderColor: ORANGE }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5, color: ORANGE }}>
                  Incremento sobre el valor del API (deja vacío o 0 para no aumentar)
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  El valor se <b>suma</b> al del API. Ej: TC USD del API = ${Number(editingEntProvider.tipo_cambio_usd).toFixed(2)} + incremento 1.00 ⇒ se vende a ${(Number(editingEntProvider.tipo_cambio_usd) + 1).toFixed(2)}.
                  Si un cliente tiene su propio override por usuario, ese tiene prioridad.
                </Typography>
                {(() => {
                  const ovUsd = Number(editingEntProvider.override_tipo_cambio_usd ?? 0) || 0;
                  const ovRmb = Number(editingEntProvider.override_tipo_cambio_rmb ?? 0) || 0;
                  const ovPct = Number(editingEntProvider.override_porcentaje_compra ?? 0) || 0;
                  const ovCosto = Number(editingEntProvider.override_costo_operacion_usd ?? 0) || 0;
                  const effUsd = Number(editingEntProvider.tipo_cambio_usd) + ovUsd;
                  const effRmb = Number(editingEntProvider.tipo_cambio_rmb) + ovRmb;
                  const effPct = Number(editingEntProvider.porcentaje_compra) + ovPct;
                  const effCosto = Number(editingEntProvider.costo_operacion_usd || 0) + ovCosto;
                  return (
                    <Typography variant="caption" sx={{ display: 'block', mt: 1, color: ORANGE, fontWeight: 600 }}>
                      Efectivo: TC USD ${effUsd.toFixed(4)} · TC RMB ${effRmb.toFixed(4)} · % {effPct.toFixed(2)} · Costo op. ${effCosto.toFixed(2)} USD
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
                    <Typography variant="caption" fontWeight={700} color="text.secondary">
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
                      <Typography variant="body2" color="text.secondary">+</Typography>
                      <TextField
                        label="EntregaX %"
                        size="small"
                        value={100 - Number(editingEntProvider.over_split_asesor ?? 90)}
                        InputProps={{ readOnly: true, endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                        sx={{ width: 110, '& .MuiInputBase-input': { color: 'text.secondary' } }}
                        variant="filled"
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary">
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
                <Typography variant="body2" color="text.secondary">
                  Sin cuentas bancarias. Agrega al menos una para que los clientes vean a dónde depositar.
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ bgcolor: '#0a0a0a', borderTop: `1px solid ${BORDER}` }}>
          <Button onClick={() => setProviderEditOpen(false)} sx={{ color: '#888' }}>Cancelar</Button>
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
        <Alert severity={snackbar.severity} sx={{ bgcolor: SURFACE, border: `1px solid ${BORDER}`, color: '#fff', '& .MuiAlert-icon': { color: ORANGE } }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
