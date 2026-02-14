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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
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
  const [exchangeRate, setExchangeRate] = useState<number>(20.50);
  const [newRate, setNewRate] = useState<string>('');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal Proveedor
  const [providerModal, setProviderModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);

  const getToken = () => localStorage.getItem('token');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${getToken()}` };
      const [rateRes, providersRes, paymentsRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/exchange-rate`),
        axios.get(`${API_URL}/admin/payment-providers`, { headers }),
        axios.get(`${API_URL}/admin/supplier-payments?status=${statusFilter}`, { headers }),
        axios.get(`${API_URL}/admin/supplier-payments/stats`, { headers })
      ]);
      
      setExchangeRate(rateRes.data.rate);
      setProviders(providersRes.data);
      setPayments(paymentsRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdateRate = async () => {
    if (!newRate || parseFloat(newRate) <= 0) return;
    try {
      await axios.post(`${API_URL}/admin/exchange-rate`, 
        { rate: parseFloat(newRate) },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setSnackbar({ open: true, message: 'Tipo de cambio actualizado', severity: 'success' });
      setNewRate('');
      loadData();
    } catch (error) {
      setSnackbar({ open: true, message: 'Error al actualizar', severity: 'error' });
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
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold">
            💰 {i18n.language === 'es' ? 'Pagos a Proveedores' : 'Supplier Payments'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {i18n.language === 'es' ? 'Gestión de tipo de cambio, proveedores y solicitudes' : 'Manage exchange rates, providers and requests'}
          </Typography>
        </Box>
        <Tooltip title="Actualizar">
          <IconButton onClick={loadData} sx={{ bgcolor: 'grey.100' }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Stats Cards */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Card sx={{ flex: '1 1 200px', background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)`, color: 'white' }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="h4" fontWeight="bold">${exchangeRate.toFixed(2)}</Typography>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Tipo de Cambio</Typography>
              </Box>
              <CurrencyExchangeIcon sx={{ fontSize: 40, opacity: 0.8 }} />
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ flex: '1 1 200px', background: 'linear-gradient(135deg, #ffc107 0%, #ffca28 100%)', color: '#333' }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="h4" fontWeight="bold">{stats?.pending || 0}</Typography>
                <Typography variant="body2">Pendientes</Typography>
              </Box>
              <PendingIcon sx={{ fontSize: 40, opacity: 0.8 }} />
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ flex: '1 1 200px', background: 'linear-gradient(135deg, #4caf50 0%, #81c784 100%)', color: 'white' }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="h4" fontWeight="bold">${stats?.total_platform_profit?.toFixed(0) || 0}</Typography>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Ganancia (30d)</Typography>
              </Box>
              <TrendingUpIcon sx={{ fontSize: 40, opacity: 0.8 }} />
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ flex: '1 1 200px', background: 'linear-gradient(135deg, #2196f3 0%, #64b5f6 100%)', color: 'white' }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="h4" fontWeight="bold">{stats?.completed || 0}</Typography>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Completados (30d)</Typography>
              </Box>
              <CheckCircleIcon sx={{ fontSize: 40, opacity: 0.8 }} />
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3, borderRadius: 2 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab icon={<PaymentsIcon />} label="Solicitudes" />
          <Tab icon={<CurrencyExchangeIcon />} label="Tipo de Cambio" />
          <Tab icon={<BusinessIcon />} label="Proveedores" />
        </Tabs>
      </Paper>

      {/* Tab: Solicitudes */}
      {tabValue === 0 && (
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ p: 2, bgcolor: 'grey.100', display: 'flex', gap: 2, alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Estado</InputLabel>
              <Select value={statusFilter} label="Estado" onChange={(e) => setStatusFilter(e.target.value)}>
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
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell>Cliente</TableCell>
                  <TableCell align="right">Monto USD</TableCell>
                  <TableCell align="right">TC</TableCell>
                  <TableCell align="right">Total MXN</TableCell>
                  <TableCell align="right">Utilidad</TableCell>
                  <TableCell>Proveedor</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell>Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ width: 32, height: 32, bgcolor: ORANGE }}>
                          {p.client_name?.[0] || '?'}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight="bold">{p.client_name}</Typography>
                          <Typography variant="caption" color="text.secondary">{p.client_email}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Typography fontWeight="bold">${parseFloat(String(p.amount_usd)).toLocaleString()}</Typography>
                    </TableCell>
                    <TableCell align="right">${parseFloat(String(p.exchange_rate)).toFixed(2)}</TableCell>
                    <TableCell align="right">
                      <Typography fontWeight="bold" color="primary">
                        ${parseFloat(String(p.total_mxn)).toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={`Plataforma: $${p.platform_profit} | Asesor: $${p.advisor_profit}`}>
                        <Typography color="success.main" fontWeight="bold">
                          ${(parseFloat(String(p.platform_profit)) + parseFloat(String(p.advisor_profit))).toFixed(2)}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{p.provider_name || '-'}</TableCell>
                    <TableCell>{getStatusChip(p.status)}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {p.status === 'pending' && (
                          <>
                            <Tooltip title="Marcar En Proceso">
                              <IconButton size="small" color="info" onClick={() => handleUpdatePaymentStatus(p.id, 'processing')}>
                                <CurrencyExchangeIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Rechazar">
                              <IconButton size="small" color="error" onClick={() => handleUpdatePaymentStatus(p.id, 'rejected')}>
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

      {/* Tab: Tipo de Cambio */}
      {tabValue === 1 && (
        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            💱 Actualizar Tipo de Cambio
          </Typography>
          <Divider sx={{ my: 2 }} />
          
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', mb: 3 }}>
            <Box sx={{ textAlign: 'center', p: 3, bgcolor: 'grey.100', borderRadius: 2 }}>
              <Typography variant="h3" fontWeight="bold" color={ORANGE}>${exchangeRate.toFixed(4)}</Typography>
              <Typography color="text.secondary">MXN por USD (Actual)</Typography>
            </Box>
            
            <TextField
              label="Nuevo Tipo de Cambio"
              type="number"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
              sx={{ width: 200 }}
            />
            
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleUpdateRate}
              disabled={!newRate}
              sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` }}
            >
              Actualizar
            </Button>
          </Box>

          <Alert severity="info">
            Este tipo de cambio se aplica a todas las cotizaciones nuevas. Las solicitudes existentes mantienen su TC original.
          </Alert>
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
