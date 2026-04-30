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
import EntangledAdminTab from '../components/EntangledAdminTab';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const ORANGE = '#F05A28';

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
  const { i18n } = useTranslation();
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
    if (!window.confirm('¿Eliminar el porcentaje personalizado de este cliente? Volverá a usar el valor global.')) return;
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
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress sx={{ color: ORANGE }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, bgcolor: '#000000', minHeight: '100vh', color: '#ffffff' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, pb: 2, borderBottom: '1px solid #333333' }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: ORANGE }}>
            💰 {i18n.language === 'es' ? 'Pagos a Proveedores' : 'Supplier Payments'}
          </Typography>
          <Typography variant="body2" sx={{ color: '#888888' }}>
            {i18n.language === 'es' ? 'Gestión de proveedores y solicitudes' : 'Manage providers and requests'}
          </Typography>
        </Box>
        <Tooltip title="Actualizar">
          <IconButton onClick={loadData} sx={{ bgcolor: 'rgba(240, 90, 40, 0.1)', color: ORANGE, '&:hover': { bgcolor: 'rgba(240, 90, 40, 0.2)' } }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Stats Cards */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Card sx={{ flex: '1 1 200px', bgcolor: 'rgba(240, 90, 40, 0.15)', border: `1px solid ${ORANGE}`, color: ORANGE }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="h4" fontWeight="bold">{stats?.pending || 0}</Typography>
                <Typography variant="body2" sx={{ color: '#888888' }}>Pendientes</Typography>
              </Box>
              <PendingIcon sx={{ fontSize: 40, opacity: 0.8 }} />
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ flex: '1 1 200px', bgcolor: 'rgba(74, 222, 128, 0.15)', border: '1px solid #4ade80', color: '#4ade80' }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="h4" fontWeight="bold">${Number(stats?.total_platform_profit || 0).toFixed(0)}</Typography>
                <Typography variant="body2" sx={{ opacity: 0.9, color: '#888888' }}>Ganancia (30d)</Typography>
              </Box>
              <TrendingUpIcon sx={{ fontSize: 40, opacity: 0.8 }} />
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ flex: '1 1 200px', bgcolor: 'rgba(59, 130, 246, 0.15)', border: '1px solid #3b82f6', color: '#3b82f6' }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="h4" fontWeight="bold">{stats?.completed || 0}</Typography>
                <Typography variant="body2" sx={{ opacity: 0.9, color: '#888888' }}>Completados (30d)</Typography>
              </Box>
              <CheckCircleIcon sx={{ fontSize: 40, opacity: 0.8 }} />
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3, borderRadius: 2, bgcolor: '#1a1a1a', border: '1px solid #333333' }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ borderBottom: 1, borderColor: '#333333', '& .MuiTab-root': { color: '#888888', '&.Mui-selected': { color: ORANGE } } }}>
          <Tab icon={<PaymentsIcon />} label="Solicitudes" />
          <Tab icon={<CurrencyExchangeIcon />} label="Tipo de Cambio" />
          <Tab icon={<BusinessIcon />} label="Proveedores" />
          <Tab icon={<HubIcon />} label="ENTANGLED" />
        </Tabs>
      </Paper>

      {/* Tab: Solicitudes */}
      {tabValue === 0 && (
        <Paper sx={{ borderRadius: 3, overflow: 'hidden', bgcolor: '#1a1a1a', border: '1px solid #333333' }}>
          <Box sx={{ p: 2, bgcolor: '#0a0a0a', display: 'flex', gap: 2, alignItems: 'center', borderBottom: '1px solid #333333' }}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel sx={{ color: '#888888' }}>Estado</InputLabel>
              <Select value={statusFilter} label="Estado" onChange={(e) => setStatusFilter(e.target.value)}
                sx={{
                  color: '#ffffff',
                  backgroundColor: '#0a0a0a',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333333' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#555555' },
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
                <TableRow sx={{ bgcolor: '#0a0a0a', borderBottom: '1px solid #333333' }}>
                  <TableCell sx={{ color: '#888888', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.75rem' }}>Cliente</TableCell>
                  <TableCell align="right" sx={{ color: '#888888', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.75rem' }}>Monto USD</TableCell>
                  <TableCell align="right" sx={{ color: '#888888', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.75rem' }}>TC</TableCell>
                  <TableCell align="right" sx={{ color: '#888888', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.75rem' }}>Total MXN</TableCell>
                  <TableCell align="right" sx={{ color: '#888888', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.75rem' }}>Utilidad</TableCell>
                  <TableCell sx={{ color: '#888888', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.75rem' }}>Proveedor</TableCell>
                  <TableCell sx={{ color: '#888888', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.75rem' }}>Estado</TableCell>
                  <TableCell sx={{ color: '#888888', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.75rem' }}>Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id} hover sx={{ bgcolor: '#1a1a1a', '&:hover': { bgcolor: '#242424' }, borderBottom: '1px solid #2a2a2a' }}>
                    <TableCell sx={{ color: '#ffffff' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ width: 32, height: 32, bgcolor: ORANGE }}>
                          {p.client_name?.[0] || '?'}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight="bold" sx={{ color: '#ffffff' }}>{p.client_name}</Typography>
                          <Typography variant="caption" sx={{ color: '#666666' }}>{p.client_email}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#ffffff' }}>
                      <Typography fontWeight="bold" sx={{ color: ORANGE }}>${parseFloat(String(p.amount_usd)).toLocaleString()}</Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#888888' }}>${parseFloat(String(p.exchange_rate)).toFixed(2)}</TableCell>
                    <TableCell align="right" sx={{ color: '#ffffff' }}>
                      <Typography fontWeight="bold" sx={{ color: ORANGE }}>
                        ${parseFloat(String(p.total_mxn)).toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#ffffff' }}>
                      <Tooltip title={`Plataforma: $${p.platform_profit} | Asesor: $${p.advisor_profit}`}>
                        <Typography sx={{ color: '#4ade80', fontWeight: 'bold' }}>
                          ${(parseFloat(String(p.platform_profit)) + parseFloat(String(p.advisor_profit))).toFixed(2)}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ color: '#888888' }}>{p.provider_name || '-'}</TableCell>
                    <TableCell>{getStatusChip(p.status)}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {p.status === 'pending' && (
                          <>
                            <Tooltip title="Marcar En Proceso">
                              <IconButton size="small" sx={{ color: '#3b82f6' }} onClick={() => handleUpdatePaymentStatus(p.id, 'processing')}>
                                <CurrencyExchangeIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Rechazar">
                              <IconButton size="small" sx={{ color: '#ff6b6b' }} onClick={() => handleUpdatePaymentStatus(p.id, 'rejected')}>
                                <CancelIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                        {p.status === 'processing' && (
                          <Tooltip title="Marcar Completado">
                            <IconButton size="small" color="success" onClick={() => handleUpdatePaymentStatus(p.id, 'completed')}>
                              <CheckCircleIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
                {payments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No hay solicitudes</Typography>
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
        <Paper sx={{ p: 3, borderRadius: 3, mt: 3 }}>
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
            Porcentaje de compra por cliente (override)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Asigna un porcentaje personalizado a clientes específicos. Si un cliente tiene override, se aplica en lugar del % global.
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
              label="% personalizado"
              type="number"
              value={overridePct}
              onChange={(e) => setOverridePct(e.target.value)}
              slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
              sx={{ width: 180 }}
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
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ p: 2, bgcolor: 'grey.100', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography fontWeight="bold">Proveedores de Pago</Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => { setEditingProvider({ id: 0, name: '', base_cost_percent: 2, fixed_fee: 0, is_active: true }); setProviderModal(true); }}
              sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` }}
            >
              Nuevo Proveedor
            </Button>
          </Box>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell>Nombre</TableCell>
                  <TableCell align="right">Costo (%)</TableCell>
                  <TableCell align="right">Cargo Fijo</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell>Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {providers.map((p) => (
                  <TableRow key={p.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ bgcolor: p.is_active ? ORANGE : 'grey.400' }}>
                          <BusinessIcon />
                        </Avatar>
                        <Typography fontWeight="bold">{p.name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right">{p.base_cost_percent}%</TableCell>
                    <TableCell align="right">${p.fixed_fee}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={p.is_active ? 'success' : 'default'}
                        label={p.is_active ? 'Activo' : 'Inactivo'}
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Editar">
                        <IconButton size="small" onClick={() => { setEditingProvider(p); setProviderModal(true); }}>
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

      {/* Modal Proveedor */}
      <Dialog open={providerModal} onClose={() => setProviderModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: ORANGE, color: 'white' }}>
          {editingProvider?.id ? 'Editar Proveedor' : 'Nuevo Proveedor'}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Nombre del Proveedor"
              value={editingProvider?.name || ''}
              onChange={(e) => setEditingProvider(prev => prev ? { ...prev, name: e.target.value } : null)}
              fullWidth
            />
            <TextField
              label="Costo Base (%)"
              type="number"
              value={editingProvider?.base_cost_percent || 0}
              onChange={(e) => setEditingProvider(prev => prev ? { ...prev, base_cost_percent: parseFloat(e.target.value) } : null)}
              slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
              helperText="Lo que te cobra el proveedor por cada operación"
            />
            <TextField
              label="Cargo Fijo"
              type="number"
              value={editingProvider?.fixed_fee || 0}
              onChange={(e) => setEditingProvider(prev => prev ? { ...prev, fixed_fee: parseFloat(e.target.value) } : null)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
              helperText="Cargo fijo por operación (USD)"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={editingProvider?.is_active || false}
                  onChange={(e) => setEditingProvider(prev => prev ? { ...prev, is_active: e.target.checked } : null)}
                />
              }
              label="Proveedor Activo"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setProviderModal(false)}>Cancelar</Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSaveProvider}
            sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` }}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: editor de proveedor ENTANGLED */}
      <Dialog open={providerEditOpen} onClose={() => setProviderEditOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Configurar override · {editingEntProvider?.name}</DialogTitle>
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
                    label="Incremento % de compra"
                    type="number"
                    value={editingEntProvider.override_porcentaje_compra ?? ''}
                    onChange={(e) => setEditingEntProvider({
                      ...editingEntProvider,
                      override_porcentaje_compra: e.target.value === '' ? null : e.target.value,
                    })}
                    placeholder="0.00"
                    helperText={`API: ${Number(editingEntProvider.porcentaje_compra).toFixed(2)}%`}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start">+</InputAdornment>, endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
                    sx={{ width: 240 }}
                  />
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
        <DialogActions>
          <Button onClick={() => setProviderEditOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSaveEntProvider}
            sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` }}
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
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
