import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  Autocomplete,
  InputAdornment,
  Divider,
  Tooltip,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
} from '@mui/material';
import {
  Add as AddIcon,
  Visibility as ViewIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Calculate as CalculateIcon,
  Security as SecurityIcon,
  AttachMoney as MoneyIcon,
  TrendingUp as TrendingIcon,
  EmojiEvents as TrophyIcon,
  Description as DocIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Warranty {
  id: number;
  gex_folio: string;
  user_id: number;
  advisor_id: number;
  box_count: number;
  volume: number;
  invoice_value_usd: number;
  route: string;
  description: string;
  pl_image_url: string;
  invoice_image_url: string;
  signed_contract_url: string;
  payment_proof_url: string;
  exchange_rate_used: number;
  insured_value_mxn: number;
  variable_fee_mxn: number;
  fixed_fee_mxn: number;
  total_cost_mxn: number;
  advisor_commission: number;
  status: string;
  created_at: string;
  paid_at: string;
  client_name: string;
  client_email: string;
  client_box_id: string;
  advisor_name: string;
}

interface Client {
  id: number;
  full_name: string;
  email: string;
  box_id: string;
  phone: string;
}

interface AdvisorRanking {
  advisor_id: number;
  advisor_name: string;
  advisor_email: string;
  referral_code: string;
  policies_sold: number;
  total_commission: number;
  total_revenue: number;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function WarrantiesPage() {
  const { t } = useTranslation();
  const [tabValue, setTabValue] = useState(0);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedWarranty, setSelectedWarranty] = useState<Warranty | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchingClients, setSearchingClients] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(20.50);
  const [ranking, setRanking] = useState<AdvisorRanking[]>([]);
  const [stats, setStats] = useState<any>(null);
  
  // Form state
  const [newWarranty, setNewWarranty] = useState({
    userId: null as number | null,
    boxCount: 1,
    volume: 0,
    invoiceValueUsd: 0,
    route: 'aereo',
    description: '',
    plImageUrl: '',
    invoiceImageUrl: '',
  });
  
  // Quote state
  const [quote, setQuote] = useState<any>(null);
  const [quoting, setQuoting] = useState(false);

  const token = localStorage.getItem('token');

  const fetchWarranties = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/gex/warranties`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setWarranties(data);
      }
    } catch (error) {
      console.error('Error fetching warranties:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchExchangeRate = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/gex/exchange-rate`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setExchangeRate(data.rate);
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
    }
  }, [token]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/gex/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, [token]);

  const fetchRanking = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/gex/ranking`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setRanking(data);
      }
    } catch (error) {
      console.error('Error fetching ranking:', error);
    }
  }, [token]);

  useEffect(() => {
    fetchWarranties();
    fetchExchangeRate();
    fetchStats();
    fetchRanking();
  }, [fetchWarranties, fetchExchangeRate, fetchStats, fetchRanking]);

  const searchClients = async (query: string) => {
    if (query.length < 2) return;
    setSearchingClients(true);
    try {
      const response = await fetch(`${API_URL}/api/gex/clients?query=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      }
    } catch (error) {
      console.error('Error searching clients:', error);
    } finally {
      setSearchingClients(false);
    }
  };

  const calculateQuote = async () => {
    if (!newWarranty.invoiceValueUsd || newWarranty.invoiceValueUsd <= 0) {
      alert('Ingresa el valor de la factura');
      return;
    }
    setQuoting(true);
    try {
      const response = await fetch(`${API_URL}/api/gex/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ invoiceValueUsd: newWarranty.invoiceValueUsd }),
      });
      if (response.ok) {
        const data = await response.json();
        setQuote(data);
      }
    } catch (error) {
      console.error('Error calculating quote:', error);
    } finally {
      setQuoting(false);
    }
  };

  const createWarranty = async () => {
    if (!newWarranty.userId) {
      alert('Selecciona un cliente');
      return;
    }
    if (!newWarranty.invoiceValueUsd || newWarranty.invoiceValueUsd <= 0) {
      alert('Ingresa el valor de la factura');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/gex/warranties`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newWarranty),
      });
      if (response.ok) {
        const data = await response.json();
        alert(`¡Póliza ${data.policy.gex_folio} generada exitosamente!`);
        setShowNewDialog(false);
        resetForm();
        fetchWarranties();
        fetchStats();
      } else {
        const error = await response.json();
        alert(error.error || 'Error al crear póliza');
      }
    } catch (error) {
      console.error('Error creating warranty:', error);
      alert('Error de conexión');
    }
  };

  const activateWarranty = async (id: number) => {
    if (!confirm('¿Confirmas que el cliente pagó y deseas activar esta póliza?')) return;
    
    try {
      const response = await fetch(`${API_URL}/api/gex/warranties/${id}/activate`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      if (response.ok) {
        alert('¡Póliza activada exitosamente!');
        fetchWarranties();
        fetchStats();
        fetchRanking();
        setShowDetailDialog(false);
      }
    } catch (error) {
      console.error('Error activating warranty:', error);
    }
  };

  const rejectWarranty = async (id: number) => {
    const reason = prompt('Motivo del rechazo:');
    if (!reason) return;
    
    try {
      const response = await fetch(`${API_URL}/api/gex/warranties/${id}/reject`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });
      if (response.ok) {
        alert('Póliza rechazada');
        fetchWarranties();
        setShowDetailDialog(false);
      }
    } catch (error) {
      console.error('Error rejecting warranty:', error);
    }
  };

  const resetForm = () => {
    setNewWarranty({
      userId: null,
      boxCount: 1,
      volume: 0,
      invoiceValueUsd: 0,
      route: 'aereo',
      description: '',
      plImageUrl: '',
      invoiceImageUrl: '',
    });
    setQuote(null);
    setClients([]);
  };

  const getStatusChip = (status: string) => {
    const statusConfig: Record<string, { color: 'default' | 'warning' | 'success' | 'error' | 'info'; label: string }> = {
      draft: { color: 'default', label: 'Borrador' },
      generated: { color: 'warning', label: 'Pendiente Pago' },
      active: { color: 'success', label: 'Activa' },
      rejected: { color: 'error', label: 'Rechazada' },
    };
    const config = statusConfig[status] || { color: 'default', label: status };
    return <Chip label={config.label} color={config.color} size="small" />;
  };

  const formatCurrency = (amount: number, currency = 'MXN') => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  const getTrophyIcon = (position: number) => {
    if (position === 0) return '🥇';
    if (position === 1) return '🥈';
    if (position === 2) return '🥉';
    return `#${position + 1}`;
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <SecurityIcon sx={{ fontSize: 40, color: '#F05A28' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">
              {t('warranties.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('warranties.subtitle')}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Chip 
            icon={<MoneyIcon />} 
            label={`TC: $${exchangeRate.toFixed(2)} MXN`} 
            color="info" 
            variant="outlined"
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setShowNewDialog(true)}
            sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#d04a1e' } }}
          >
            {t('warranties.newPolicy')}
          </Button>
        </Box>
      </Box>

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card sx={{ bgcolor: '#fff3e0' }}>
              <CardContent>
                <Typography color="text.secondary" variant="body2">{t('warranties.pendingPolicies')}</Typography>
                <Typography variant="h4" color="warning.main">{stats.stats?.generated_count || 0}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card sx={{ bgcolor: '#e8f5e9' }}>
              <CardContent>
                <Typography color="text.secondary" variant="body2">{t('warranties.activePolicies')}</Typography>
                <Typography variant="h4" color="success.main">{stats.stats?.active_count || 0}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card sx={{ bgcolor: '#e3f2fd' }}>
              <CardContent>
                <Typography color="text.secondary" variant="body2">{t('warranties.totalRevenue')}</Typography>
                <Typography variant="h4" color="primary">{formatCurrency(parseFloat(stats.stats?.total_revenue) || 0)}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card sx={{ bgcolor: '#fce4ec' }}>
              <CardContent>
                <Typography color="text.secondary" variant="body2">{t('warranties.paidCommissions')}</Typography>
                <Typography variant="h4" color="error">{formatCurrency(parseFloat(stats.stats?.total_commissions) || 0)}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab icon={<DocIcon />} label={t('warranties.tabs.policies')} iconPosition="start" />
          <Tab icon={<TrophyIcon />} label={t('warranties.tabs.advisorRanking')} iconPosition="start" />
          <Tab icon={<TrendingIcon />} label={t('warranties.tabs.reports')} iconPosition="start" />
        </Tabs>
      </Paper>

      {/* Tab: Pólizas */}
      <TabPanel value={tabValue} index={0}>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell><strong>{t('warranties.table.folio')}</strong></TableCell>
                <TableCell><strong>{t('warranties.table.client')}</strong></TableCell>
                <TableCell><strong>{t('warranties.table.valueUsd')}</strong></TableCell>
                <TableCell><strong>{t('warranties.table.totalMxn')}</strong></TableCell>
                <TableCell><strong>{t('warranties.table.route')}</strong></TableCell>
                <TableCell><strong>{t('warranties.table.status')}</strong></TableCell>
                <TableCell><strong>{t('warranties.table.date')}</strong></TableCell>
                <TableCell align="center"><strong>{t('warranties.table.actions')}</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <CircularProgress size={30} />
                  </TableCell>
                </TableRow>
              ) : warranties.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <Typography color="text.secondary">{t('warranties.noPolicies')}</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                warranties.map((w) => (
                  <TableRow key={w.id} hover>
                    <TableCell>
                      <Typography fontWeight="bold" color="primary">{w.gex_folio}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{w.client_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{w.client_box_id}</Typography>
                    </TableCell>
                    <TableCell>{formatCurrency(parseFloat(String(w.invoice_value_usd)), 'USD')}</TableCell>
                    <TableCell>{formatCurrency(parseFloat(String(w.total_cost_mxn)))}</TableCell>
                    <TableCell>
                      <Chip 
                        label={w.route === 'aereo' ? '✈️ Aéreo' : w.route === 'maritimo' ? '🚢 Marítimo' : '🚚 Terrestre'} 
                        size="small" 
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{getStatusChip(w.status)}</TableCell>
                    <TableCell>{new Date(w.created_at).toLocaleDateString()}</TableCell>
                    <TableCell align="center">
                      <Tooltip title="Ver detalle">
                        <IconButton 
                          size="small"
                          onClick={() => { setSelectedWarranty(w); setShowDetailDialog(true); }}
                        >
                          <ViewIcon />
                        </IconButton>
                      </Tooltip>
                      {w.status === 'generated' && (
                        <>
                          <Tooltip title="Activar">
                            <IconButton size="small" color="success" onClick={() => activateWarranty(w.id)}>
                              <CheckIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Rechazar">
                            <IconButton size="small" color="error" onClick={() => rejectWarranty(w.id)}>
                              <CancelIcon />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </TabPanel>

      {/* Tab: Ranking */}
      <TabPanel value={tabValue} index={1}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TrophyIcon color="warning" /> Ranking de Asesores
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#fafafa' }}>
                  <TableCell><strong>Pos.</strong></TableCell>
                  <TableCell><strong>Asesor</strong></TableCell>
                  <TableCell align="center"><strong>Pólizas Vendidas</strong></TableCell>
                  <TableCell align="right"><strong>Comisiones ($325 c/u)</strong></TableCell>
                  <TableCell align="right"><strong>Ingresos Generados</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ranking.map((advisor, index) => (
                  <TableRow key={advisor.advisor_id} sx={{ bgcolor: index < 3 ? '#fffde7' : 'inherit' }}>
                    <TableCell>
                      <Typography variant="h6">{getTrophyIcon(index)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ bgcolor: index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? '#cd7f32' : 'grey.400' }}>
                          {advisor.advisor_name?.charAt(0)}
                        </Avatar>
                        <Box>
                          <Typography fontWeight="bold">{advisor.advisor_name}</Typography>
                          <Typography variant="caption" color="text.secondary">{advisor.referral_code}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={advisor.policies_sold} color="primary" />
                    </TableCell>
                    <TableCell align="right">
                      <Typography color="success.main" fontWeight="bold">
                        {formatCurrency(parseFloat(String(advisor.total_commission)) || 0)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {formatCurrency(parseFloat(String(advisor.total_revenue)) || 0)}
                    </TableCell>
                  </TableRow>
                ))}
                {ranking.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Typography color="text.secondary">No hay datos de ranking aún</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </TabPanel>

      {/* Tab: Reportes */}
      <TabPanel value={tabValue} index={2}>
        <Alert severity="info" sx={{ mb: 2 }}>
          Los reportes detallados de cobranza estarán disponibles próximamente.
        </Alert>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Últimas Pólizas</Typography>
              <List>
                {stats?.recentPolicies?.map((p: any) => (
                  <ListItem key={p.gex_folio}>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: p.status === 'active' ? 'success.main' : 'warning.main' }}>
                        <SecurityIcon />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={`${p.gex_folio} - ${p.client_name}`}
                      secondary={`${formatCurrency(parseFloat(p.total_cost_mxn))} • ${new Date(p.created_at).toLocaleDateString()}`}
                    />
                    {getStatusChip(p.status)}
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <TrendingIcon sx={{ fontSize: 60, color: '#F05A28', mb: 2 }} />
              <Typography variant="h6">Resumen del Mes</Typography>
              <Typography variant="h3" color="primary" sx={{ my: 2 }}>
                {formatCurrency(parseFloat(stats?.stats?.total_revenue) || 0)}
              </Typography>
              <Typography color="text.secondary">
                {stats?.stats?.active_count || 0} pólizas activadas
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Dialog: Nueva Póliza */}
      <Dialog open={showNewDialog} onClose={() => setShowNewDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: '#F05A28', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SecurityIcon /> Nueva Póliza GEX
          </Box>
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Grid container spacing={3}>
            {/* Cliente */}
            <Grid size={{ xs: 12 }}>
              <Autocomplete
                options={clients}
                getOptionLabel={(option) => `${option.full_name} (${option.box_id}) - ${option.email}`}
                loading={searchingClients}
                onInputChange={(_, value) => searchClients(value)}
                onChange={(_, value) => setNewWarranty({ ...newWarranty, userId: value?.id || null })}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Buscar Cliente *"
                    placeholder="Nombre, email o Box ID"
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: (
                        <>
                          <PersonIcon color="action" sx={{ mr: 1 }} />
                          {params.InputProps.startAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
            </Grid>

            {/* Valor Factura */}
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Valor Factura (USD) *"
                type="number"
                value={newWarranty.invoiceValueUsd || ''}
                onChange={(e) => setNewWarranty({ ...newWarranty, invoiceValueUsd: parseFloat(e.target.value) || 0 })}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
              />
            </Grid>

            {/* Número de Cajas */}
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Número de Cajas"
                type="number"
                value={newWarranty.boxCount}
                onChange={(e) => setNewWarranty({ ...newWarranty, boxCount: parseInt(e.target.value) || 1 })}
              />
            </Grid>

            {/* Ruta */}
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Ruta de Envío</InputLabel>
                <Select
                  value={newWarranty.route}
                  label="Ruta de Envío"
                  onChange={(e) => setNewWarranty({ ...newWarranty, route: e.target.value })}
                >
                  <MenuItem value="aereo">✈️ Aéreo</MenuItem>
                  <MenuItem value="maritimo">🚢 Marítimo</MenuItem>
                  <MenuItem value="terrestre">🚚 Terrestre</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Volumen */}
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Volumen (ft³)"
                type="number"
                value={newWarranty.volume || ''}
                onChange={(e) => setNewWarranty({ ...newWarranty, volume: parseFloat(e.target.value) || 0 })}
              />
            </Grid>

            {/* Descripción */}
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Descripción de la Carga"
                multiline
                rows={2}
                value={newWarranty.description}
                onChange={(e) => setNewWarranty({ ...newWarranty, description: e.target.value })}
                placeholder="Ej: Electrónicos, ropa, muebles..."
              />
            </Grid>

            {/* Botón Cotizar */}
            <Grid size={{ xs: 12 }}>
              <Button
                variant="outlined"
                fullWidth
                startIcon={quoting ? <CircularProgress size={20} /> : <CalculateIcon />}
                onClick={calculateQuote}
                disabled={quoting || !newWarranty.invoiceValueUsd}
              >
                Calcular Cotización
              </Button>
            </Grid>

            {/* Resultado Cotización */}
            {quote && (
              <Grid size={{ xs: 12 }}>
                <Paper sx={{ p: 3, bgcolor: '#f0fdf4', border: '2px solid #4CAF50' }}>
                  <Typography variant="h6" color="success.main" gutterBottom>
                    📋 Cotización GEX
                  </Typography>
                  <Divider sx={{ my: 2 }} />
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 6 }}>
                      <Typography color="text.secondary">Valor Factura:</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography align="right">{formatCurrency(quote.invoiceValueUsd, 'USD')}</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography color="text.secondary">Tipo de Cambio:</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography align="right">${quote.exchangeRate} MXN</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography color="text.secondary">Valor Asegurado:</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography align="right">{formatCurrency(quote.insuredValueMxn)}</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography color="text.secondary">Costo Variable (5%):</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography align="right">{formatCurrency(quote.variableFeeMxn)}</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography color="text.secondary">Costo Fijo Póliza:</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography align="right">{formatCurrency(quote.fixedFeeMxn)}</Typography>
                    </Grid>
                  </Grid>
                  <Divider sx={{ my: 2 }} />
                  <Grid container>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="h6">TOTAL A COBRAR:</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="h5" color="success.main" align="right" fontWeight="bold">
                        {formatCurrency(quote.totalCostMxn)}
                      </Typography>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => { setShowNewDialog(false); resetForm(); }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={createWarranty}
            disabled={!newWarranty.userId || !newWarranty.invoiceValueUsd}
            sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#d04a1e' } }}
          >
            Generar Póliza
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Detalle de Póliza */}
      <Dialog open={showDetailDialog} onClose={() => setShowDetailDialog(false)} maxWidth="md" fullWidth>
        {selectedWarranty && (
          <>
            <DialogTitle>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h5">
                  <SecurityIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                  {selectedWarranty.gex_folio}
                </Typography>
                {getStatusChip(selectedWarranty.status)}
              </Box>
            </DialogTitle>
            <DialogContent>
              <Grid container spacing={3} sx={{ mt: 1 }}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">Cliente</Typography>
                    <Typography variant="h6">{selectedWarranty.client_name}</Typography>
                    <Typography variant="body2">{selectedWarranty.client_email}</Typography>
                    <Typography variant="body2">📦 {selectedWarranty.client_box_id}</Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">Asesor</Typography>
                    <Typography variant="h6">{selectedWarranty.advisor_name || 'N/A'}</Typography>
                    <Typography variant="body2" color="success.main">
                      Comisión: {formatCurrency(parseFloat(String(selectedWarranty.advisor_commission)))}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Divider />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Typography variant="caption" color="text.secondary">Valor Factura</Typography>
                  <Typography variant="h6">{formatCurrency(parseFloat(String(selectedWarranty.invoice_value_usd)), 'USD')}</Typography>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Typography variant="caption" color="text.secondary">Tipo de Cambio</Typography>
                  <Typography variant="h6">${selectedWarranty.exchange_rate_used}</Typography>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Typography variant="caption" color="text.secondary">Ruta</Typography>
                  <Typography variant="h6">{selectedWarranty.route}</Typography>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Typography variant="caption" color="text.secondary">Cajas</Typography>
                  <Typography variant="h6">{selectedWarranty.box_count}</Typography>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Paper sx={{ p: 2, bgcolor: '#e3f2fd' }}>
                    <Grid container>
                      <Grid size={{ xs: 6 }}>
                        <Typography>Valor Asegurado:</Typography>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <Typography align="right">{formatCurrency(parseFloat(String(selectedWarranty.insured_value_mxn)))}</Typography>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <Typography>Variable (5%):</Typography>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <Typography align="right">{formatCurrency(parseFloat(String(selectedWarranty.variable_fee_mxn)))}</Typography>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <Typography>Fijo Póliza:</Typography>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <Typography align="right">{formatCurrency(parseFloat(String(selectedWarranty.fixed_fee_mxn)))}</Typography>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <Typography variant="h6" fontWeight="bold">TOTAL:</Typography>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <Typography variant="h6" fontWeight="bold" align="right" color="primary">
                          {formatCurrency(parseFloat(String(selectedWarranty.total_cost_mxn)))}
                        </Typography>
                      </Grid>
                    </Grid>
                  </Paper>
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions sx={{ p: 3 }}>
              <Button onClick={() => setShowDetailDialog(false)}>Cerrar</Button>
              {selectedWarranty.status === 'generated' && (
                <>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<CancelIcon />}
                    onClick={() => rejectWarranty(selectedWarranty.id)}
                  >
                    Rechazar
                  </Button>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<CheckIcon />}
                    onClick={() => activateWarranty(selectedWarranty.id)}
                  >
                    Activar Póliza (Pagada)
                  </Button>
                </>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
