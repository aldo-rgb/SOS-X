// ============================================
// DASHBOARD DE COBRANZA Y FLUJO DE EFECTIVO
// Unifica ingresos de Caja Chica + SPEI (Openpay)
// SOPORTE MULTI-EMPRESA
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  CircularProgress,
  TextField,
  IconButton,
  Tooltip,
  Avatar,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
} from '@mui/material';
import {
  TrendingUp,
  AccountBalance,
  LocalAtm,
  Warning,
  Download,
  Refresh,
  Receipt,
  ArrowBack,
  Business,
  Search,
  CheckCircle,
  AccessTime,
} from '@mui/icons-material';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';

const ORANGE = '#F05A28';
const BLACK = '#111';
const GREEN = '#27ae60';
const YELLOW = '#f39c12';
const RED = '#e74c3c';
const PAYPAL_BLUE = '#0070BA';

const SERVICE_LABELS: Record<string, { label: string; color: string }> = {
  china_air: { label: 'Aéreo China', color: '#e74c3c' },
  china_sea: { label: 'Marítimo China', color: '#3498db' },
  usa_pobox: { label: 'PO Box USA', color: '#9b59b6' },
  POBOX_USA: { label: 'PO Box USA', color: '#9b59b6' },
  AIR_CHN_MX: { label: 'Aéreo China', color: '#e74c3c' },
  SEA_CHN_MX: { label: 'Marítimo China', color: '#3498db' },
  AA_DHL: { label: 'Nacional DHL', color: '#f39c12' },
  mx_cedis: { label: 'DHL CEDIS', color: '#f39c12' },
  mx_national: { label: 'Nacional', color: '#27ae60' },
  otros: { label: 'Otros', color: '#95a5a6' },
};

// Colores para empresas
const EMPRESA_COLORS = ['#303F9F', '#9b59b6', '#e74c3c', '#27ae60', '#f39c12', '#3498db'];

interface KPIs {
  ingresos_hoy: number;
  ingresos_hoy_neto: number;
  ingresos_mes: number;
  ingresos_mes_neto: number;
  spei_hoy: number;
  spei_hoy_neto: number;
  spei_mes: number;
  spei_mes_neto: number;
  efectivo_hoy: number;
  efectivo_mes: number;
  cartera_vencida: number;
  guias_pendientes: number;
  saldo_caja: number;
  comisiones_mes: number;
}

interface Transaccion {
  id: number;
  fecha_hora: string;
  cliente: string;
  monto_bruto: number;
  monto_neto: number;
  comision: number;
  metodo: string;
  concepto: string;
  origen: string;
  guias_pagadas?: string;
  estatus: string;
}

interface IngresoPorServicio {
  servicio: string;
  cantidad: number;
  monto: number;
}

interface IngresoPorEmpresa {
  empresa_id: number;
  empresa_nombre: string;
  rfc: string;
  spei_bruto: number;
  spei_neto: number;
  comisiones: number;
  transacciones: number;
}

interface Empresa {
  id: number;
  alias: string;
  rfc: string;
  openpay_merchant_id: string;
  openpay_production_mode: boolean;
  servicio_asignado: string;
  service_name: string;
}

interface ServicioDisponible {
  value: string;
  label: string;
}

interface DashboardData {
  kpis: KPIs;
  empresas: Empresa[];
  ingresos_por_empresa: IngresoPorEmpresa[];
  distribucion_metodos: { efectivo: number; spei: number; paypal: number };
  porcentajes: { efectivo: string; spei: string; paypal: string };
  ingresos_por_servicio: IngresoPorServicio[];
  transacciones: Transaccion[];
  filtro_servicio: string | null;
  servicios_disponibles: ServicioDisponible[];
}

// Función helper para obtener la empresa asignada a un servicio
const getEmpresaAsignada = (empresas: Empresa[], serviceType: string): Empresa | undefined => {
  return empresas?.find(e => e.servicio_asignado === serviceType);
};

export default function FinanceDashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterCliente, setFilterCliente] = useState('');
  const [filterMetodo, setFilterMetodo] = useState('all');
  const [filterServicio, setFilterServicio] = useState('all');

  // Estados para búsqueda y confirmación de pagos pendientes
  const [searchRef, setSearchRef] = useState('');
  const [searchingPayment, setSearchingPayment] = useState(false);
  const [foundPayment, setFoundPayment] = useState<any>(null);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  const token = localStorage.getItem('token') || '';

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { date_from: dateFrom, date_to: dateTo };
      if (filterServicio !== 'all') {
        params.service_type = filterServicio;
      }
      const response = await api.get('/admin/finance/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      if (response.data.success) {
        setData(response.data);
      }
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, [token, dateFrom, dateTo, filterServicio]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Cargar pagos pendientes
  const fetchPendingPayments = useCallback(async () => {
    setLoadingPending(true);
    try {
      const params: Record<string, string> = {};
      if (filterServicio !== 'all') {
        params.service_type = filterServicio;
      }
      const response = await api.get('/admin/finance/pending-payments', {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      if (response.data.success) {
        setPendingPayments(response.data.pending_payments || []);
      }
    } catch (error) {
      console.error('Error fetching pending payments:', error);
    } finally {
      setLoadingPending(false);
    }
  }, [token, filterServicio]);

  // Buscar pago por referencia
  const handleSearchPayment = async () => {
    if (!searchRef.trim()) return;
    setSearchingPayment(true);
    setFoundPayment(null);
    try {
      const response = await api.get('/admin/finance/search-payment', {
        headers: { Authorization: `Bearer ${token}` },
        params: { ref: searchRef.trim() },
      });
      if (response.data.success) {
        setFoundPayment(response.data);
      }
    } catch (error: any) {
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.message || 'Referencia no encontrada', 
        severity: 'error' 
      });
    } finally {
      setSearchingPayment(false);
    }
  };

  // Confirmar pago en efectivo
  const handleConfirmPayment = async () => {
    // Puede venir de la tabla (estructura plana) o de búsqueda (estructura anidada)
    const referencia = foundPayment?.payment?.referencia || foundPayment?.referencia;
    if (!referencia) return;
    
    setConfirmingPayment(true);
    try {
      const response = await api.post('/admin/finance/confirm-payment', {
        referencia: referencia,
        metodo_confirmacion: 'efectivo',
        notas: 'Confirmado desde dashboard'
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data.success) {
        setSnackbar({ 
          open: true, 
          message: `✅ Pago confirmado: ${response.data.referencia} - ${formatCurrency(response.data.monto)}`, 
          severity: 'success' 
        });
        setFoundPayment(null);
        setSearchRef('');
        fetchDashboard();
        fetchPendingPayments();
      }
    } catch (error: any) {
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.error || 'Error al confirmar pago', 
        severity: 'error' 
      });
    } finally {
      setConfirmingPayment(false);
    }
  };

  // Cargar pagos pendientes al cargar y cuando cambie el filtro de servicio
  useEffect(() => {
    fetchPendingPayments();
  }, [fetchPendingPayments]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await api.get('/admin/finance/export', {
        headers: { Authorization: `Bearer ${token}` },
        params: { date_from: dateFrom, date_to: dateTo },
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `reporte_cobranza_${dateFrom}_a_${dateTo}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error exporting:', error);
    } finally {
      setExporting(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(value);
  };

  // Datos para gráfica de pastel
  const pieData = data
    ? [
        { name: 'Efectivo', value: data.distribucion_metodos.efectivo, color: YELLOW },
        { name: 'SPEI', value: data.distribucion_metodos.spei, color: GREEN },
        { name: 'PayPal', value: data.distribucion_metodos.paypal, color: PAYPAL_BLUE },
      ]
    : [];

  // Datos para gráfica de barras
  const barData = data?.ingresos_por_servicio.map((s) => ({
    name: SERVICE_LABELS[s.servicio]?.label || s.servicio,
    monto: s.monto,
    cantidad: s.cantidad,
    fill: SERVICE_LABELS[s.servicio]?.color || '#95a5a6',
  })) || [];

  // Filtrar transacciones
  const filteredTransacciones = data?.transacciones.filter((t) => {
    const matchCliente = !filterCliente || t.cliente?.toLowerCase().includes(filterCliente.toLowerCase());
    const matchMetodo = filterMetodo === 'all' || t.metodo === filterMetodo;
    return matchCliente && matchMetodo;
  }) || [];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress sx={{ color: ORANGE }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={() => navigate('/admin')} sx={{ bgcolor: 'grey.100' }}>
            <ArrowBack />
          </IconButton>
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: BLACK }}>
              💰 Dashboard de Cobranza
              {filterServicio !== 'all' && (
                <Chip 
                  label={SERVICE_LABELS[filterServicio]?.label || filterServicio} 
                  size="small" 
                  sx={{ ml: 2, bgcolor: SERVICE_LABELS[filterServicio]?.color || ORANGE, color: 'white' }}
                />
              )}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Flujo de dinero en tiempo real • Caja CC + SPEI (Openpay) + PayPal
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Servicio</InputLabel>
            <Select
              value={filterServicio}
              label="Servicio"
              onChange={(e) => setFilterServicio(e.target.value)}
            >
              <MenuItem value="all">Todos</MenuItem>
              {(data?.servicios_disponibles || [
                { value: 'POBOX_USA', label: 'PO Box USA' },
                { value: 'AIR_CHN_MX', label: 'Aéreo China' },
                { value: 'SEA_CHN_MX', label: 'Marítimo China' },
                { value: 'AA_DHL', label: 'Nacional DHL' }
              ]).map((s) => (
                <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            type="date"
            label="Desde"
            size="small"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            type="date"
            label="Hasta"
            size="small"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            variant="contained"
            startIcon={exporting ? <CircularProgress size={20} color="inherit" /> : <Download />}
            onClick={handleExport}
            disabled={exporting}
            sx={{ bgcolor: GREEN }}
          >
            Exportar CSV
          </Button>
          <Tooltip title="Actualizar">
            <IconButton onClick={fetchDashboard} sx={{ bgcolor: 'grey.100' }}>
              <Refresh />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Ingresos Totales */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)`, color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>Ingresos Hoy</Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {formatCurrency(data?.kpis.ingresos_hoy || 0)}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.8, mt: 1 }}>
                    Mes: {formatCurrency(data?.kpis.ingresos_mes || 0)}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 56, height: 56 }}>
                  <TrendingUp sx={{ fontSize: 32 }} />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Ingresos SPEI */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${GREEN} 0%, #2ecc71 100%)`, color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>SPEI Hoy (Neto)</Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {formatCurrency(data?.kpis.spei_hoy_neto || 0)}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.8, mt: 1 }}>
                    Bruto: {formatCurrency(data?.kpis.spei_hoy || 0)}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 56, height: 56 }}>
                  <AccountBalance sx={{ fontSize: 32 }} />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Efectivo en Caja */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${YELLOW} 0%, #f1c40f 100%)`, color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>Efectivo Hoy</Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {formatCurrency(data?.kpis.efectivo_hoy || 0)}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.8, mt: 1 }}>
                    Saldo Caja: {formatCurrency(data?.kpis.saldo_caja || 0)}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 56, height: 56 }}>
                  <LocalAtm sx={{ fontSize: 32 }} />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Cartera Vencida */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${RED} 0%, #c0392b 100%)`, color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>Cartera Vencida</Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {formatCurrency(data?.kpis.cartera_vencida || 0)}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.8, mt: 1 }}>
                    {data?.kpis.guias_pendientes || 0} guías pendientes
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 56, height: 56 }}>
                  <Warning sx={{ fontSize: 32 }} />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Gráficas */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Gráfica de Pastel - Métodos de Pago */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3, borderRadius: 3, height: '100%' }}>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
              📊 Distribución por Método
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 250 }}>
              {pieData.some(d => d.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name || ''}: ${((percent || 0) * 100).toFixed(0)}%`}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value) => formatCurrency(Number(value || 0))}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Typography color="text.secondary">Sin datos en el período</Typography>
              )}
            </Box>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 1 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Chip 
                  icon={<LocalAtm />} 
                  label={`Efectivo: ${data?.porcentajes.efectivo || 0}%`}
                  sx={{ bgcolor: YELLOW, color: 'white' }}
                />
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Chip 
                  icon={<AccountBalance />} 
                  label={`SPEI: ${data?.porcentajes.spei || 0}%`}
                  sx={{ bgcolor: GREEN, color: 'white' }}
                />
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Chip 
                  icon={<AccountBalance />} 
                  label={`PayPal: ${data?.porcentajes.paypal || 0}%`}
                  sx={{ bgcolor: PAYPAL_BLUE, color: 'white' }}
                />
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Gráfica de Barras - Ingresos por Servicio */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: 3, borderRadius: 3, height: '100%' }}>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
              📈 Ingresos por Servicio (Mes Actual)
            </Typography>
            <Box sx={{ height: 280 }}>
              {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v: number) => `$${(v/1000).toFixed(0)}k`} />
                    <RechartsTooltip 
                      formatter={(value, name) => [
                        formatCurrency(Number(value || 0)),
                        name === 'monto' ? 'Ingresos' : 'Cantidad'
                      ]}
                    />
                    <Legend />
                    <Bar dataKey="monto" name="Ingresos" radius={[4, 4, 0, 0]}>
                      {barData.map((entry, index) => (
                        <Cell key={`bar-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                  <Typography color="text.secondary">Sin ingresos en el período</Typography>
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Información de Comisiones */}
      <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
        <strong>💡 Comisiones Openpay del mes:</strong> {formatCurrency(data?.kpis.comisiones_mes || 0)} 
        &nbsp;• El monto neto es el ingreso real después de descontar comisiones bancarias.
      </Alert>

      {/* Sección de Pagos Pendientes en Sucursal */}
      <Paper sx={{ borderRadius: 3, overflow: 'hidden', mb: 3 }}>
        <Box sx={{ bgcolor: ORANGE, px: 3, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccessTime sx={{ color: 'white' }} />
            <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
              💳 Pagos Pendientes en Sucursal
            </Typography>
          </Box>
          <Chip 
            label={`${pendingPayments.length} pendiente${pendingPayments.length !== 1 ? 's' : ''}`}
            sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 'bold' }}
          />
        </Box>

        {/* Buscador de referencia */}
        <Box sx={{ p: 2, bgcolor: 'grey.50', display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Buscar por referencia..."
            value={searchRef}
            onChange={(e) => setSearchRef(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearchPayment()}
            sx={{ minWidth: 250 }}
            InputProps={{
              startAdornment: <Search sx={{ color: 'grey.500', mr: 1 }} />
            }}
          />
          <Button
            variant="contained"
            onClick={handleSearchPayment}
            disabled={searchingPayment || !searchRef.trim()}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#e65100' } }}
          >
            {searchingPayment ? 'Buscando...' : 'Buscar'}
          </Button>
          <Button
            variant="outlined"
            onClick={fetchPendingPayments}
            disabled={loadingPending}
          >
            {loadingPending ? 'Cargando...' : 'Actualizar'}
          </Button>
        </Box>

        {/* Tabla de pagos pendientes */}
        <TableContainer sx={{ maxHeight: 300 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Referencia</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Cliente</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Monto</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Servicio</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Banco/CLABE</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Fecha</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pendingPayments.length > 0 ? (
                pendingPayments.map((payment: any) => (
                  <TableRow key={payment.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold" sx={{ fontFamily: 'monospace' }}>
                        {payment.referencia}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{payment.cliente}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {payment.telefono || ''}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight="bold" color="success.main">
                        {formatCurrency(payment.monto)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={SERVICE_LABELS[payment.tipo_servicio]?.label || payment.tipo_servicio}
                        size="small"
                        sx={{ 
                          bgcolor: SERVICE_LABELS[payment.tipo_servicio]?.color || 'grey.500',
                          color: 'white',
                          fontSize: '0.7rem'
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{payment.banco || '-'}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {payment.clabe || ''}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {new Date(payment.created_at).toLocaleDateString('es-MX')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(payment.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Button
                        variant="contained"
                        size="small"
                        color="success"
                        startIcon={<CheckCircle />}
                        onClick={() => {
                          setFoundPayment(payment);
                        }}
                      >
                        Confirmar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                    <AccessTime sx={{ fontSize: 40, color: 'grey.300', mb: 1 }} />
                    <Typography color="text.secondary">
                      No hay pagos pendientes por confirmar
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Si hay filtro de servicio activo, mostrar solo transacciones */}
      {filterServicio !== 'all' ? (
        <>
          {/* Header con empresa asignada */}
          <Paper sx={{ borderRadius: 3, overflow: 'hidden', mb: 3 }}>
            <Box sx={{ bgcolor: SERVICE_LABELS[filterServicio]?.color || ORANGE, px: 3, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
                  🏢 {SERVICE_LABELS[filterServicio]?.label || filterServicio}
                </Typography>
                <Typography variant="body2" sx={{ color: 'white', opacity: 0.9 }}>
                  Empresa: <strong>{getEmpresaAsignada(data?.empresas || [], filterServicio)?.alias || 'Sin empresa asignada'}</strong>
                  {getEmpresaAsignada(data?.empresas || [], filterServicio)?.rfc && (
                    <> • RFC: {getEmpresaAsignada(data?.empresas || [], filterServicio)?.rfc}</>
                  )}
                </Typography>
              </Box>
              <Chip 
                icon={<Business />}
                label={getEmpresaAsignada(data?.empresas || [], filterServicio)?.openpay_production_mode ? 'Producción' : 'Sandbox'}
                sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
              />
            </Box>
          </Paper>

          {/* Tabla de Transacciones directa (sin tabs) */}
          <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ bgcolor: BLACK, px: 3, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
                📋 Transacciones - {SERVICE_LABELS[filterServicio]?.label || filterServicio}
              </Typography>
              <Typography variant="body2" sx={{ color: 'white', opacity: 0.7 }}>
                {filteredTransacciones.length} transacciones
              </Typography>
            </Box>

            {/* Filtros */}
            <Box sx={{ p: 2, bgcolor: 'grey.50', display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                size="small"
                placeholder="Buscar cliente..."
                value={filterCliente}
                onChange={(e) => setFilterCliente(e.target.value)}
                sx={{ minWidth: 200 }}
              />
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Método</InputLabel>
                <Select
                  value={filterMetodo}
                  label="Método"
                  onChange={(e) => setFilterMetodo(e.target.value)}
                >
                  <MenuItem value="all">Todos</MenuItem>
                  <MenuItem value="efectivo">Efectivo</MenuItem>
                  <MenuItem value="spei">SPEI</MenuItem>
                  <MenuItem value="paypal">PayPal</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <TableContainer sx={{ maxHeight: 500 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Fecha/Hora</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Cliente</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Monto Bruto</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Comisión</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Monto Neto</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Método</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Concepto</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Estado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredTransacciones.length > 0 ? (
                    filteredTransacciones.map((tx) => (
                      <TableRow key={`${tx.metodo}-${tx.id}`} hover>
                        <TableCell>
                          <Typography variant="body2">
                            {new Date(tx.fecha_hora).toLocaleDateString('es-MX')}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(tx.fecha_hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {tx.cliente}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight="bold">
                            {formatCurrency(tx.monto_bruto)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          {tx.comision > 0 ? (
                            <Typography variant="body2" color="error">
                              -{formatCurrency(tx.comision)}
                            </Typography>
                          ) : (
                            <Typography variant="body2" color="text.secondary">-</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight="bold" color="success.main">
                            {formatCurrency(tx.monto_neto)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            icon={tx.metodo === 'spei' ? <AccountBalance /> : <LocalAtm />}
                            label={tx.metodo === 'spei' ? 'SPEI' : 'Efectivo'}
                            size="small"
                            sx={{
                              bgcolor: tx.metodo === 'spei' ? GREEN : YELLOW,
                              color: 'white',
                              fontWeight: 'bold',
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {tx.concepto}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={tx.estatus === 'completado' || tx.estatus === 'procesado' ? 'Completado' : tx.estatus}
                            size="small"
                            color={tx.estatus === 'completado' || tx.estatus === 'procesado' ? 'success' : 'warning'}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                        <Receipt sx={{ fontSize: 48, color: 'grey.300', mb: 1 }} />
                        <Typography color="text.secondary">
                          No hay transacciones de {SERVICE_LABELS[filterServicio]?.label || filterServicio} en el período seleccionado
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Las transacciones aparecerán aquí cuando se procesen pagos de este servicio
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      ) : (
        <>
          {/* Vista normal con TABS cuando no hay filtro de servicio */}
          <Paper sx={{ borderRadius: 3, mb: 3 }}>
            <Tabs 
              value={tabValue} 
              onChange={(_, v) => setTabValue(v)}
              sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
            >
              <Tab icon={<TrendingUp />} label="Consolidado" />
              <Tab icon={<Receipt />} label="Transacciones" />
            </Tabs>
          </Paper>

      {/* TAB 0: Vista Consolidada (Transacciones) */}
      {tabValue === 0 && (
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ bgcolor: BLACK, px: 3, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
              📋 Resumen Consolidado - Todas las Empresas
            </Typography>
          </Box>
          <Box sx={{ p: 3 }}>
            {/* Resumen rápido por empresa */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {(data?.ingresos_por_empresa || []).map((emp, idx) => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={emp.empresa_id}>
                  <Card sx={{ 
                    background: `linear-gradient(135deg, ${EMPRESA_COLORS[idx % EMPRESA_COLORS.length]} 0%, ${EMPRESA_COLORS[(idx + 1) % EMPRESA_COLORS.length]}aa 100%)`,
                    color: 'white'
                  }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box>
                          <Typography variant="body2" sx={{ opacity: 0.9 }}>{emp.empresa_nombre}</Typography>
                          <Typography variant="h5" fontWeight="bold">
                            {formatCurrency(emp.spei_neto)}
                          </Typography>
                          <Typography variant="caption" sx={{ opacity: 0.8 }}>
                            {emp.transacciones} transacciones • RFC: {emp.rfc}
                          </Typography>
                        </Box>
                        <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                          <Business />
                        </Avatar>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
              {(!data?.ingresos_por_empresa || data.ingresos_por_empresa.length === 0) && (
                <Grid size={{ xs: 12 }}>
                  <Alert severity="info">No hay ingresos SPEI registrados en este período</Alert>
                </Grid>
              )}
            </Grid>
          </Box>
        </Paper>
      )}

      {/* TAB 1: Tabla de Conciliación */}
      {tabValue === 1 && (
      <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ bgcolor: BLACK, px: 3, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
            📋 Estado de Cuenta - Conciliación en Tiempo Real
          </Typography>
          <Typography variant="body2" sx={{ color: 'white', opacity: 0.7 }}>
            {filteredTransacciones.length} transacciones
          </Typography>
        </Box>

        {/* Filtros */}
        <Box sx={{ p: 2, bgcolor: 'grey.50', display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Buscar cliente..."
            value={filterCliente}
            onChange={(e) => setFilterCliente(e.target.value)}
            sx={{ minWidth: 200 }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Método</InputLabel>
            <Select
              value={filterMetodo}
              label="Método"
              onChange={(e) => setFilterMetodo(e.target.value)}
            >
              <MenuItem value="all">Todos</MenuItem>
              <MenuItem value="efectivo">Efectivo</MenuItem>
              <MenuItem value="spei">SPEI</MenuItem>
              <MenuItem value="paypal">PayPal</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <TableContainer sx={{ maxHeight: 500 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Fecha/Hora</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Cliente</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Monto Bruto</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Comisión</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Monto Neto</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Método</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Guías Pagadas</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredTransacciones.length > 0 ? (
                filteredTransacciones.map((tx) => (
                  <TableRow key={`${tx.metodo}-${tx.id}`} hover>
                    <TableCell>
                      <Typography variant="body2">
                        {new Date(tx.fecha_hora).toLocaleDateString('es-MX')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(tx.fecha_hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {tx.cliente}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {tx.origen}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight="bold">
                        {formatCurrency(tx.monto_bruto)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {tx.comision > 0 ? (
                        <Typography variant="body2" color="error">
                          -{formatCurrency(tx.comision)}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight="bold" color="success.main">
                        {formatCurrency(tx.monto_neto)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        icon={tx.metodo === 'spei' ? <AccountBalance /> : <LocalAtm />}
                        label={tx.metodo === 'spei' ? 'SPEI' : 'Efectivo'}
                        size="small"
                        sx={{
                          bgcolor: tx.metodo === 'spei' ? GREEN : YELLOW,
                          color: 'white',
                          fontWeight: 'bold',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {tx.guias_pagadas}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={tx.estatus === 'completado' || tx.estatus === 'procesado' ? 'Completado' : tx.estatus}
                        size="small"
                        color={tx.estatus === 'completado' || tx.estatus === 'procesado' ? 'success' : 'warning'}
                      />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Receipt sx={{ fontSize: 48, color: 'grey.300', mb: 1 }} />
                    <Typography color="text.secondary">
                      No hay transacciones en el período seleccionado
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      )}
      </>
      )}

      {/* Dialog para confirmar pago */}
      <Dialog 
        open={!!foundPayment} 
        onClose={() => setFoundPayment(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: ORANGE, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircle />
          Confirmar Pago en Sucursal
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          {foundPayment && (() => {
            // Normalizar datos - puede venir de tabla (plano) o búsqueda (anidado)
            const isFromSearch = !!foundPayment.payment;
            const paymentData = isFromSearch ? foundPayment.payment : foundPayment;
            const clienteData = isFromSearch ? foundPayment.cliente : { nombre: foundPayment.cliente };
            const guiasData = isFromSearch 
              ? (foundPayment.guias || []).map((g: any) => g.tracking_internal || g.id).join(', ')
              : foundPayment.guias || foundPayment.concepto;
            
            return (
              <Box>
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <strong>⚠️ Importante:</strong> Verifique que el cliente tenga el comprobante de pago antes de confirmar.
                </Alert>
                
                {!foundPayment.puede_confirmar && isFromSearch && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    Este pago ya fue procesado anteriormente. Estado: <strong>{paymentData.status}</strong>
                  </Alert>
                )}
                
                <Box sx={{ display: 'grid', gap: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: '1px solid #eee' }}>
                    <Typography color="text.secondary">Referencia:</Typography>
                    <Typography fontWeight="bold" sx={{ fontFamily: 'monospace', fontSize: '1.2rem' }}>
                      {paymentData.referencia}
                    </Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: '1px solid #eee' }}>
                    <Typography color="text.secondary">Cliente:</Typography>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography fontWeight="medium">{clienteData.nombre || clienteData}</Typography>
                      {clienteData.email && (
                        <Typography variant="caption" color="text.secondary">{clienteData.email}</Typography>
                      )}
                    </Box>
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: '1px solid #eee' }}>
                    <Typography color="text.secondary">Monto a cobrar:</Typography>
                    <Typography fontWeight="bold" color="success.main" fontSize="1.3rem">
                      {formatCurrency(paymentData.monto)}
                    </Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: '1px solid #eee' }}>
                    <Typography color="text.secondary">Servicio:</Typography>
                    <Chip 
                      label={SERVICE_LABELS[paymentData.tipo_servicio || paymentData.service_type]?.label || paymentData.tipo_servicio || paymentData.service_type || 'N/A'}
                      size="small"
                      sx={{ 
                        bgcolor: SERVICE_LABELS[paymentData.tipo_servicio || paymentData.service_type]?.color || 'grey.500',
                        color: 'white'
                      }}
                    />
                  </Box>

                  {guiasData && (
                    <Box sx={{ py: 1, borderBottom: '1px solid #eee' }}>
                      <Typography color="text.secondary" gutterBottom>Guías/Concepto:</Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: 'grey.100', p: 1, borderRadius: 1 }}>
                        {guiasData}
                      </Typography>
                    </Box>
                  )}
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1 }}>
                    <Typography color="text.secondary">Fecha de registro:</Typography>
                    <Typography>
                      {new Date(paymentData.created_at || paymentData.fecha_pago).toLocaleDateString('es-MX')} - {new Date(paymentData.created_at || paymentData.fecha_pago).toLocaleTimeString('es-MX')}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button 
            onClick={() => setFoundPayment(null)}
            disabled={confirmingPayment}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleConfirmPayment}
            disabled={confirmingPayment || (foundPayment?.puede_confirmar === false)}
            startIcon={<CheckCircle />}
          >
            {confirmingPayment ? 'Confirmando...' : 'Confirmar Pago Recibido'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar de notificaciones */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
