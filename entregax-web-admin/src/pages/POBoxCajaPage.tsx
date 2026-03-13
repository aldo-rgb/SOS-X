// ============================================
// PO BOX CAJA PAGE
// Panel de caja especializado para PO Box USA
// - Recibir pago buscando por referencia
// - Egresos con evidencia obligatoria
// ============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  Snackbar,
  InputAdornment,
  CircularProgress,
  Tabs,
  Tab,
  Divider,
  List,
  ListItem,
  ListItemText,
  Avatar,
  IconButton,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  Search as SearchIcon,
  Receipt as ReceiptIcon,
  AccountBalance as AccountBalanceIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  History as HistoryIcon,
  LocalAtm as LocalAtmIcon,
  Assignment as AssignmentIcon,
  Person as PersonIcon,
  CheckCircle as CheckCircleIcon,
  CameraAlt as CameraIcon,
  Warning as WarningIcon,
  Close as CloseIcon,
  QrCodeScanner as QrCodeIcon,
} from '@mui/icons-material';
import api from '../services/api';

// ============================================
// INTERFACES
// ============================================

interface CajaStats {
  // Stats combinados (legacy)
  saldo_actual: number;
  ingresos_hoy: number;
  egresos_hoy: number;
  cantidad_transacciones_hoy: number;
  ultimo_corte: string | null;
  // Stats USD
  saldo_usd: number;
  ingresos_hoy_usd: number;
  egresos_hoy_usd: number;
  transacciones_hoy_usd: number;
  ultimo_corte_usd: string | null;
  // Stats MXN
  saldo_mxn: number;
  ingresos_hoy_mxn: number;
  egresos_hoy_mxn: number;
  transacciones_hoy_mxn: number;
  ultimo_corte_mxn: string | null;
}

interface PaymentSearchResult {
  success: boolean;
  source: string;
  payment: {
    id: number;
    referencia: string;
    monto: number;
    concepto?: string;
    status: string;
    fecha_pago?: string;
    service_type?: string;
    empresa?: string;
    expires_at?: string;
    created_at?: string;
  };
  cliente: {
    id: number;
    nombre: string;
    email: string;
    telefono: string;
  };
  guias: Array<{
    id: number;
    tracking_internal: string;
    description: string;
    assigned_cost_mxn: number;
  }>;
  puede_confirmar: boolean;
}

interface Transaccion {
  id: number;
  tipo: 'ingreso' | 'egreso';
  monto: number;
  concepto: string;
  categoria: string;
  cliente_id: number | null;
  cliente_nombre: string | null;
  cliente_box_id: string | null;
  created_at: string;
  admin_name: string;
  evidencia_url?: string;
  referencia?: string;
  currency?: 'MXN' | 'USD';
  aplicaciones: Array<{
    package_id: number;
    monto_aplicado: number;
    tracking_number: string;
  }> | null;
}

interface Corte {
  id: number;
  fecha_corte: string;
  saldo_inicial: number;
  total_ingresos: number;
  total_egresos: number;
  saldo_final_sistema: number;
  saldo_final_entregado: number;
  diferencia: number;
  admin_name: string;
  currency?: string;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

interface POBoxCajaPageProps {
  initialSearchRef?: string | null;
  onPaymentConfirmed?: () => void;
}

const POBoxCajaPage: React.FC<POBoxCajaPageProps> = ({ initialSearchRef, onPaymentConfirmed }) => {
  // Estado general
  const [stats, setStats] = useState<CajaStats | null>(null);
  const [transacciones, setTransacciones] = useState<Transaccion[]>([]);
  const [cortes, setCortes] = useState<Corte[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);

  // Dialogs
  const [pagoDialogOpen, setPagoDialogOpen] = useState(false);
  const [egresoDialogOpen, setEgresoDialogOpen] = useState(false);
  const [corteDialogOpen, setCorteDialogOpen] = useState(false);
  const [ingresoDialogOpen, setIngresoDialogOpen] = useState(false);

  // Búsqueda por referencia
  const [searchRef, setSearchRef] = useState(initialSearchRef || '');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<PaymentSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Confirmación de pago
  const [confirming, setConfirming] = useState(false);
  const [confirmNotes, setConfirmNotes] = useState('');
  const [paymentCurrency, setPaymentCurrency] = useState<'MXN' | 'USD'>('MXN'); // Moneda de pago
  const [exchangeRate, setExchangeRate] = useState<number>(18.5); // Tipo de cambio actual

  // Egreso con evidencia
  const [egresoForm, setEgresoForm] = useState({
    monto: '',
    concepto: '',
    categoria: 'gastos_operativos',
    referencia: '',
    notas: '',
    currency: 'MXN' as 'MXN' | 'USD',
  });
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [evidenciaPreview, setEvidenciaPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ingreso
  const [ingresoForm, setIngresoForm] = useState({
    monto: '',
    concepto: '',
    categoria: 'otro_ingreso',
    notas: '',
    currency: 'MXN' as 'MXN' | 'USD',
  });

  // Corte
  const [corteForm, setCorteForm] = useState({
    saldo_usd: '',
    saldo_mxn: '',
    notas: '',
  });

  // Snackbar
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error' | 'warning' | 'info',
  });

  // Categorías de egreso disponibles en el formulario
  const _categoriasEgreso = [
    { value: 'gastos_operativos', label: 'Gastos Operativos' },
    { value: 'compra_materiales', label: 'Compra de Materiales' },
    { value: 'pago_servicios', label: 'Pago de Servicios' },
    { value: 'devolucion', label: 'Devolución a Cliente' },
    { value: 'otro_egreso', label: 'Otro Egreso' },
  ];
  void _categoriasEgreso; // Suprimir warning - se usará para select de categorías

  const categoriasIngreso = [
    { value: 'deposito_inicial', label: 'Depósito Inicial' },
    { value: 'reembolso', label: 'Reembolso' },
    { value: 'otro_ingreso', label: 'Otro Ingreso' },
  ];

  // ============================================
  // FUNCIONES DE CARGA DE DATOS
  // ============================================

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get('/caja-chica/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);

  const fetchTransacciones = useCallback(async () => {
    try {
      const response = await api.get('/caja-chica/transacciones');
      setTransacciones(response.data);
    } catch (error) {
      console.error('Error fetching transacciones:', error);
    }
  }, []);

  const fetchCortes = useCallback(async () => {
    try {
      const response = await api.get('/caja-chica/cortes');
      setCortes(response.data);
    } catch (error) {
      console.error('Error fetching cortes:', error);
    }
  }, []);

  const fetchExchangeRate = useCallback(async () => {
    try {
      const response = await api.get('/exchange-rate');
      if (response.data?.rate) {
        setExchangeRate(response.data.rate);
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchTransacciones(), fetchCortes(), fetchExchangeRate()]);
    setLoading(false);
  }, [fetchStats, fetchTransacciones, fetchCortes, fetchExchangeRate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Si viene con tracking pre-cargado, abrir el dialog de pago y buscar automáticamente
  useEffect(() => {
    if (initialSearchRef && !loading) {
      setPagoDialogOpen(true);
      // Buscar automáticamente después de un pequeño delay para que cargue el dialog
      const timer = setTimeout(() => {
        handleSearchByRef();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [initialSearchRef, loading]);

  // ============================================
  // BÚSQUEDA POR REFERENCIA
  // ============================================

  const handleSearchByRef = async () => {
    if (!searchRef.trim()) {
      setSnackbar({ open: true, message: 'Ingresa una referencia para buscar', severity: 'warning' });
      return;
    }

    setSearching(true);
    setSearchError(null);
    setSearchResult(null);

    try {
      const response = await api.get('/admin/finance/search-payment', {
        params: { ref: searchRef.trim() }
      });
      setSearchResult(response.data);
    } catch (error: unknown) {
      console.error('Error searching:', error);
      const axiosError = error as { response?: { data?: { message?: string } } };
      setSearchError(axiosError.response?.data?.message || 'Referencia no encontrada');
    } finally {
      setSearching(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!searchResult) return;

    setConfirming(true);
    try {
      // El monto viene en MXN, si paga en USD calculamos el equivalente
      const montoRecibido = paymentCurrency === 'MXN' 
        ? searchResult.payment.monto 
        : searchResult.payment.monto / exchangeRate;

      await api.post('/admin/finance/confirm-payment', {
        referencia: searchResult.payment.referencia,
        metodo_confirmacion: 'efectivo',
        notas: confirmNotes,
        moneda_recibida: paymentCurrency, // MXN o USD
        monto_recibido: montoRecibido,
        tipo_cambio: exchangeRate
      });

      setSnackbar({
        open: true,
        message: '✅ Pago confirmado exitosamente',
        severity: 'success'
      });

      // Limpiar y recargar
      setSearchRef('');
      setSearchResult(null);
      setConfirmNotes('');
      setPagoDialogOpen(false);
      loadData();

      // Si hay callback, llamarlo (para volver al dashboard)
      if (onPaymentConfirmed) {
        setTimeout(() => onPaymentConfirmed(), 500);
      }

    } catch (error: unknown) {
      console.error('Error confirming payment:', error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      setSnackbar({
        open: true,
        message: axiosError.response?.data?.error || 'Error al confirmar pago',
        severity: 'error'
      });
    } finally {
      setConfirming(false);
    }
  };

  // ============================================
  // MANEJO DE EVIDENCIA
  // ============================================

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setEvidenciaFile(file);
      // Crear preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setEvidenciaPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveEvidence = () => {
    setEvidenciaFile(null);
    setEvidenciaPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ============================================
  // REGISTRAR EGRESO CON EVIDENCIA
  // ============================================

  const handleRegistrarEgreso = async () => {
    if (!evidenciaFile) {
      setSnackbar({ open: true, message: 'La evidencia es obligatoria', severity: 'error' });
      return;
    }

    try {
      // Primero subir la evidencia
      const formData = new FormData();
      formData.append('file', evidenciaFile);
      formData.append('folder', 'egresos');

      const uploadRes = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const evidenciaUrl = uploadRes.data.url || uploadRes.data.fileUrl;

      // Luego registrar el egreso con la URL de evidencia
      await api.post('/caja-chica/egreso', {
        monto: parseFloat(egresoForm.monto),
        concepto: egresoForm.concepto,
        categoria: egresoForm.categoria,
        notas: egresoForm.notas || null,
        referencia: egresoForm.referencia || null,
        evidencia_url: evidenciaUrl,
        currency: egresoForm.currency,
      });

      setSnackbar({ open: true, message: `Egreso en ${egresoForm.currency} registrado correctamente`, severity: 'success' });
      setEgresoDialogOpen(false);
      setEgresoForm({ monto: '', concepto: '', categoria: 'gastos_operativos', referencia: '', notas: '', currency: 'MXN' });
      handleRemoveEvidence();
      loadData();

    } catch (error: unknown) {
      console.error('Error registrando egreso:', error);
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Error al registrar egreso';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    }
  };

  // ============================================
  // REGISTRAR INGRESO
  // ============================================

  const handleRegistrarIngreso = async () => {
    try {
      await api.post('/caja-chica/ingreso', {
        monto: parseFloat(ingresoForm.monto),
        concepto: ingresoForm.concepto,
        categoria: ingresoForm.categoria,
        notas: ingresoForm.notas || null,
        currency: ingresoForm.currency,
      });
      setSnackbar({ open: true, message: `Ingreso en ${ingresoForm.currency} registrado correctamente`, severity: 'success' });
      setIngresoDialogOpen(false);
      setIngresoForm({ monto: '', concepto: '', categoria: 'otro_ingreso', notas: '', currency: 'MXN' });
      loadData();
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Error al registrar ingreso';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    }
  };

  // ============================================
  // REALIZAR CORTE (CIEGO - USD Y MXN SEPARADOS)
  // ============================================

  const handleRealizarCorte = async () => {
    try {
      const response = await api.post('/caja-chica/corte', {
        saldo_usd: corteForm.saldo_usd ? parseFloat(corteForm.saldo_usd) : null,
        saldo_mxn: corteForm.saldo_mxn ? parseFloat(corteForm.saldo_mxn) : null,
        notas: corteForm.notas || null,
      });
      
      // Construir mensaje con resultado del corte
      let mensaje = 'Corte de caja realizado.\n';
      const resultados = response.data.resultados || [];
      
      resultados.forEach((r: { currency: string; diferencia: number; saldo_esperado: number; saldo_contado: number }) => {
        const diff = r.diferencia;
        const diffStr = r.currency === 'USD' ? formatUSD(Math.abs(diff)) : formatCurrency(Math.abs(diff));
        if (diff === 0) {
          mensaje += `${r.currency}: Sin diferencia ✓\n`;
        } else if (diff > 0) {
          mensaje += `${r.currency}: Sobrante de ${diffStr}\n`;
        } else {
          mensaje += `${r.currency}: Faltante de ${diffStr}\n`;
        }
      });
      
      setSnackbar({ open: true, message: mensaje, severity: 'success' });
      setCorteDialogOpen(false);
      setCorteForm({ saldo_usd: '', saldo_mxn: '', notas: '' });
      loadData();
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Error al realizar corte';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    }
  };

  // ============================================
  // UTILIDADES
  // ============================================

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  const formatUSD = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            <LocalAtmIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Caja PO Box USA
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Control de efectivo con búsqueda por referencia
          </Typography>
        </Box>
        <Box display="flex" gap={1}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<QrCodeIcon />}
            onClick={() => setPagoDialogOpen(true)}
            size="large"
          >
            Recibir Pago
          </Button>
          <Button
            variant="outlined"
            color="success"
            startIcon={<AddIcon />}
            onClick={() => setIngresoDialogOpen(true)}
          >
            Otro Ingreso
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<RemoveIcon />}
            onClick={() => setEgresoDialogOpen(true)}
          >
            Egreso
          </Button>
          <Button
            variant="outlined"
            color="info"
            startIcon={<AssignmentIcon />}
            onClick={() => setCorteDialogOpen(true)}
          >
            Corte
          </Button>
        </Box>
      </Box>

      {/* Stats Cards - USD */}
      <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
        💵 Caja en Dólares (USD)
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ bgcolor: '#1565c0', color: 'white' }}>
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="caption">Saldo USD</Typography>
              <Typography variant="h5" fontWeight="bold">
                {formatUSD(stats?.saldo_usd || 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ bgcolor: '#2e7d32', color: 'white' }}>
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="caption">Ingresos USD Hoy</Typography>
              <Typography variant="h5" fontWeight="bold">
                {formatUSD(stats?.ingresos_hoy_usd || 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ bgcolor: '#c62828', color: 'white' }}>
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="caption">Egresos USD Hoy</Typography>
              <Typography variant="h5" fontWeight="bold">
                {formatUSD(stats?.egresos_hoy_usd || 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ bgcolor: '#424242', color: 'white' }}>
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="caption">Trans. USD Hoy</Typography>
              <Typography variant="h5" fontWeight="bold">
                {stats?.transacciones_hoy_usd || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Stats Cards - MXN */}
      <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
        🇲🇽 Caja en Pesos (MXN)
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ bgcolor: '#ff5722', color: 'white' }}>
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="caption">Saldo MXN</Typography>
              <Typography variant="h5" fontWeight="bold">
                {formatCurrency(stats?.saldo_mxn || 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ bgcolor: '#4caf50', color: 'white' }}>
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="caption">Ingresos MXN Hoy</Typography>
              <Typography variant="h5" fontWeight="bold">
                {formatCurrency(stats?.ingresos_hoy_mxn || 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ bgcolor: '#f44336', color: 'white' }}>
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="caption">Egresos MXN Hoy</Typography>
              <Typography variant="h5" fontWeight="bold">
                {formatCurrency(stats?.egresos_hoy_mxn || 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ bgcolor: '#2196f3', color: 'white' }}>
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="caption">Trans. MXN Hoy</Typography>
              <Typography variant="h5" fontWeight="bold">
                {stats?.transacciones_hoy_mxn || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab icon={<ReceiptIcon />} label="Transacciones" />
          <Tab icon={<HistoryIcon />} label="Historial de Cortes" />
        </Tabs>
      </Paper>

      {/* Tab Content: Transacciones */}
      {tabValue === 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell>Tipo</TableCell>
                <TableCell>Monto</TableCell>
                <TableCell>Concepto</TableCell>
                <TableCell>Cliente</TableCell>
                <TableCell>Referencia</TableCell>
                <TableCell>Registrado por</TableCell>
                <TableCell>Fecha</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transacciones.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Chip
                      label={t.tipo === 'ingreso' ? 'INGRESO' : 'EGRESO'}
                      color={t.tipo === 'ingreso' ? 'success' : 'error'}
                      size="small"
                      icon={t.tipo === 'ingreso' ? <TrendingUpIcon /> : <TrendingDownIcon />}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography
                        fontWeight="bold"
                        color={t.tipo === 'ingreso' ? 'success.main' : 'error.main'}
                      >
                        {t.tipo === 'ingreso' ? '+' : '-'}{t.currency === 'USD' ? formatUSD(t.monto) : formatCurrency(t.monto)}
                      </Typography>
                      <Chip 
                        label={t.currency === 'USD' ? 'USD' : 'MXN'} 
                        size="small" 
                        sx={{ height: 18, fontSize: '0.65rem' }} 
                        color={t.currency === 'USD' ? 'primary' : 'warning'} 
                      />
                    </Box>
                  </TableCell>
                  <TableCell>{t.concepto}</TableCell>
                  <TableCell>
                    {t.cliente_box_id ? (
                      <Typography variant="body2">{t.cliente_box_id}</Typography>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    {t.referencia ? (
                      <Chip label={t.referencia} size="small" variant="outlined" />
                    ) : t.aplicaciones && t.aplicaciones.length > 0 ? (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {t.aplicaciones.map((ap, idx) => (
                          <Chip 
                            key={idx} 
                            label={ap.tracking_number} 
                            size="small" 
                            variant="outlined" 
                            color="info"
                          />
                        ))}
                      </Box>
                    ) : '-'}
                  </TableCell>
                  <TableCell>{t.admin_name}</TableCell>
                  <TableCell>{formatDate(t.created_at)}</TableCell>
                </TableRow>
              ))}
              {transacciones.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">No hay transacciones registradas</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Tab Content: Cortes */}
      {tabValue === 1 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell>Fecha</TableCell>
                <TableCell>Moneda</TableCell>
                <TableCell align="right">Saldo Inicial</TableCell>
                <TableCell align="right">Ingresos</TableCell>
                <TableCell align="right">Egresos</TableCell>
                <TableCell align="right">Saldo Sistema</TableCell>
                <TableCell align="right">Saldo Contado</TableCell>
                <TableCell align="right">Diferencia</TableCell>
                <TableCell>Responsable</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cortes.map((c) => {
                const currency = c.currency || 'USD';
                const fmt = currency === 'USD' ? formatUSD : formatCurrency;
                return (
                  <TableRow key={c.id}>
                    <TableCell>{formatDate(c.fecha_corte)}</TableCell>
                    <TableCell>
                      <Chip 
                        label={currency} 
                        size="small" 
                        color={currency === 'USD' ? 'primary' : 'warning'}
                      />
                    </TableCell>
                    <TableCell align="right">{fmt(c.saldo_inicial)}</TableCell>
                    <TableCell align="right" sx={{ color: 'success.main' }}>+{fmt(c.total_ingresos)}</TableCell>
                    <TableCell align="right" sx={{ color: 'error.main' }}>-{fmt(c.total_egresos)}</TableCell>
                    <TableCell align="right">{fmt(c.saldo_final_sistema)}</TableCell>
                    <TableCell align="right">{fmt(c.saldo_final_entregado)}</TableCell>
                    <TableCell align="right">
                      <Chip
                        label={`${c.diferencia >= 0 ? '+' : ''}${fmt(c.diferencia)}`}
                        color={c.diferencia === 0 ? 'success' : c.diferencia > 0 ? 'info' : 'error'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{c.admin_name}</TableCell>
                  </TableRow>
                );
              })}
              {cortes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">No hay cortes registrados</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ============================================ */}
      {/* DIALOG: RECIBIR PAGO POR REFERENCIA */}
      {/* ============================================ */}
      <Dialog open={pagoDialogOpen} onClose={() => setPagoDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: 'primary.main', color: 'white' }}>
          <QrCodeIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Recibir Pago - Búsqueda por Referencia
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          {/* Buscador de referencia */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              1. Ingresa la referencia de pago del cliente
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                label="Referencia de Pago"
                placeholder="Ej: EF-0054-M7K9X2"
                value={searchRef}
                onChange={(e) => setSearchRef(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === 'Enter' && handleSearchByRef()}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                autoFocus
              />
              <Button
                variant="contained"
                onClick={handleSearchByRef}
                disabled={searching || !searchRef.trim()}
                sx={{ minWidth: 120 }}
              >
                {searching ? <CircularProgress size={24} /> : 'Buscar'}
              </Button>
            </Box>
          </Box>

          {/* Error de búsqueda */}
          {searchError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {searchError}
            </Alert>
          )}

          {/* Resultado de búsqueda */}
          {searchResult && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                2. Información del Pago Encontrado
              </Typography>

              {/* Card con info del pago */}
              <Card variant="outlined" sx={{ mb: 2 }}>
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <Avatar sx={{ bgcolor: 'primary.main', width: 56, height: 56 }}>
                          <PersonIcon />
                        </Avatar>
                        <Box>
                          <Typography variant="h6">{searchResult.cliente.nombre}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {searchResult.cliente.email}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {searchResult.cliente.telefono}
                          </Typography>
                        </Box>
                      </Box>
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="overline" color="text.secondary">
                          Monto a Cobrar
                        </Typography>
                        <Typography variant="h4" color="success.main" fontWeight="bold">
                          {formatUSD(searchResult.payment.monto)}
                        </Typography>
                        <Chip
                          label={searchResult.payment.referencia}
                          color="primary"
                          sx={{ mt: 1 }}
                        />
                      </Box>
                    </Grid>
                  </Grid>

                  {/* Guías asociadas */}
                  {searchResult.guias.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Guías incluidas en este pago:
                      </Typography>
                      <List dense>
                        {searchResult.guias.map((guia) => (
                          <ListItem key={guia.id}>
                            <ListItemText
                              primary={guia.tracking_internal}
                              secondary={guia.description}
                            />
                            <Typography variant="body2" color="text.secondary">
                              {formatUSD(guia.assigned_cost_mxn || 0)}
                            </Typography>
                          </ListItem>
                        ))}
                      </List>
                    </Box>
                  )}

                  {/* Estado del pago */}
                  <Box sx={{ mt: 2 }}>
                    {searchResult.puede_confirmar ? (
                      <Alert severity="success" icon={<CheckCircleIcon />}>
                        Este pago está <strong>pendiente de confirmación</strong>. Verifica que hayas recibido el efectivo y confirma.
                      </Alert>
                    ) : (
                      <Alert severity="warning">
                        Este pago ya ha sido procesado o no puede confirmarse.
                      </Alert>
                    )}
                  </Box>

                  {/* Selección de moneda de pago */}
                  {searchResult.puede_confirmar && (
                    <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 2 }}>
                      <Typography variant="subtitle2" gutterBottom fontWeight="bold">
                        💵 ¿En qué moneda te pagó el cliente?
                      </Typography>
                      <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid size={{ xs: 6 }}>
                          <Button
                            variant={paymentCurrency === 'USD' ? 'contained' : 'outlined'}
                            color={paymentCurrency === 'USD' ? 'success' : 'inherit'}
                            fullWidth
                            onClick={() => setPaymentCurrency('USD')}
                            sx={{ py: 2 }}
                          >
                            <Box sx={{ textAlign: 'center' }}>
                              <Typography variant="h6">USD</Typography>
                              <Typography variant="body2" fontWeight="bold">
                                {formatUSD(searchResult.payment.monto / exchangeRate)}
                              </Typography>
                            </Box>
                          </Button>
                        </Grid>
                        <Grid size={{ xs: 6 }}>
                          <Button
                            variant={paymentCurrency === 'MXN' ? 'contained' : 'outlined'}
                            color={paymentCurrency === 'MXN' ? 'success' : 'inherit'}
                            fullWidth
                            onClick={() => setPaymentCurrency('MXN')}
                            sx={{ py: 2 }}
                          >
                            <Box sx={{ textAlign: 'center' }}>
                              <Typography variant="h6">MXN</Typography>
                              <Typography variant="body2" fontWeight="bold">
                                {formatCurrency(searchResult.payment.monto)}
                              </Typography>
                            </Box>
                          </Button>
                        </Grid>
                      </Grid>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        Tipo de cambio actual: 1 USD = ${exchangeRate.toFixed(2)} MXN
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>

              {/* Notas de confirmación */}
              {searchResult.puede_confirmar && (
                <TextField
                  fullWidth
                  label="Notas de confirmación (opcional)"
                  placeholder="Ej: Pago recibido en billetes de $500"
                  value={confirmNotes}
                  onChange={(e) => setConfirmNotes(e.target.value)}
                  multiline
                  rows={2}
                />
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: 'grey.50' }}>
          <Button onClick={() => {
            setPagoDialogOpen(false);
            setSearchRef('');
            setSearchResult(null);
            setSearchError(null);
            setConfirmNotes('');
            setPaymentCurrency('MXN');
          }}>
            Cancelar
          </Button>
          {searchResult?.puede_confirmar && (
            <Button
              variant="contained"
              color="success"
              onClick={handleConfirmPayment}
              disabled={confirming}
              startIcon={confirming ? <CircularProgress size={20} /> : <CheckCircleIcon />}
            >
              {confirming ? 'Confirmando...' : `Confirmar Pago de ${paymentCurrency === 'MXN' ? formatCurrency(searchResult.payment.monto) : formatUSD(searchResult.payment.monto / exchangeRate)}`}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ============================================ */}
      {/* DIALOG: EGRESO CON EVIDENCIA */}
      {/* ============================================ */}
      <Dialog open={egresoDialogOpen} onClose={() => setEgresoDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: 'error.main', color: 'white' }}>
          <RemoveIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Registrar Egreso
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* Selector de Moneda */}
            <Grid size={{ xs: 12 }}>
              <Typography variant="subtitle2" gutterBottom fontWeight="bold">
                💵 ¿De qué caja sale el dinero?
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant={egresoForm.currency === 'USD' ? 'contained' : 'outlined'}
                  color={egresoForm.currency === 'USD' ? 'primary' : 'inherit'}
                  onClick={() => setEgresoForm({ ...egresoForm, currency: 'USD' })}
                  sx={{ flex: 1 }}
                >
                  💵 USD (Dólares)
                </Button>
                <Button
                  variant={egresoForm.currency === 'MXN' ? 'contained' : 'outlined'}
                  color={egresoForm.currency === 'MXN' ? 'warning' : 'inherit'}
                  onClick={() => setEgresoForm({ ...egresoForm, currency: 'MXN' })}
                  sx={{ flex: 1 }}
                >
                  🇲🇽 MXN (Pesos)
                </Button>
              </Box>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Monto"
                type="number"
                value={egresoForm.monto}
                onChange={(e) => setEgresoForm({ ...egresoForm, monto: e.target.value })}
                InputProps={{ 
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  endAdornment: <InputAdornment position="end">{egresoForm.currency}</InputAdornment>
                }}
                required
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Descripción / Nota"
                value={egresoForm.concepto}
                onChange={(e) => setEgresoForm({ ...egresoForm, concepto: e.target.value })}
                required
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Referencia (Factura/Recibo)"
                value={egresoForm.referencia}
                onChange={(e) => setEgresoForm({ ...egresoForm, referencia: e.target.value })}
                placeholder="Ej: FAC-001234"
              />
            </Grid>

            {/* Evidencia obligatoria */}
            <Grid size={{ xs: 12 }}>
              <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
                <strong>📷 Evidencia obligatoria:</strong> Debes adjuntar foto del ticket o factura
              </Alert>

              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                ref={fileInputRef}
                style={{ display: 'none' }}
              />

              {!evidenciaPreview ? (
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<CameraIcon />}
                  onClick={() => fileInputRef.current?.click()}
                  fullWidth
                  sx={{ py: 1.5 }}
                >
                  Tomar Foto / Subir
                </Button>
              ) : (
                <Box sx={{ position: 'relative', textAlign: 'center' }}>
                  <img
                    src={evidenciaPreview}
                    alt="Evidencia"
                    style={{
                      maxWidth: '100%',
                      maxHeight: 200,
                      borderRadius: 8,
                      border: '2px solid #4caf50'
                    }}
                  />
                  <IconButton
                    onClick={handleRemoveEvidence}
                    sx={{
                      position: 'absolute',
                      top: -8,
                      right: -8,
                      bgcolor: 'error.main',
                      color: 'white',
                      '&:hover': { bgcolor: 'error.dark' }
                    }}
                    size="small"
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                  <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                    ✅ Evidencia adjuntada: {evidenciaFile?.name}
                  </Typography>
                </Box>
              )}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => {
            setEgresoDialogOpen(false);
            handleRemoveEvidence();
            setEgresoForm({ monto: '', concepto: '', categoria: 'gastos_operativos', referencia: '', notas: '', currency: 'MXN' });
          }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleRegistrarEgreso}
            disabled={!egresoForm.monto || !egresoForm.concepto || !evidenciaFile}
          >
            Registrar Gasto en {egresoForm.currency}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============================================ */}
      {/* DIALOG: OTRO INGRESO */}
      {/* ============================================ */}
      <Dialog open={ingresoDialogOpen} onClose={() => setIngresoDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: 'success.main', color: 'white' }}>
          <AddIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Registrar Otro Ingreso
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* Selector de Moneda */}
            <Grid size={{ xs: 12 }}>
              <Typography variant="subtitle2" gutterBottom fontWeight="bold">
                💵 ¿En qué moneda es el ingreso?
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant={ingresoForm.currency === 'USD' ? 'contained' : 'outlined'}
                  color={ingresoForm.currency === 'USD' ? 'primary' : 'inherit'}
                  onClick={() => setIngresoForm({ ...ingresoForm, currency: 'USD' })}
                  sx={{ flex: 1 }}
                >
                  💵 USD (Dólares)
                </Button>
                <Button
                  variant={ingresoForm.currency === 'MXN' ? 'contained' : 'outlined'}
                  color={ingresoForm.currency === 'MXN' ? 'warning' : 'inherit'}
                  onClick={() => setIngresoForm({ ...ingresoForm, currency: 'MXN' })}
                  sx={{ flex: 1 }}
                >
                  🇲🇽 MXN (Pesos)
                </Button>
              </Box>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Monto"
                type="number"
                value={ingresoForm.monto}
                onChange={(e) => setIngresoForm({ ...ingresoForm, monto: e.target.value })}
                InputProps={{ 
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  endAdornment: <InputAdornment position="end">{ingresoForm.currency}</InputAdornment>
                }}
                required
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControl fullWidth>
                <InputLabel>Categoría</InputLabel>
                <Select
                  value={ingresoForm.categoria}
                  onChange={(e) => setIngresoForm({ ...ingresoForm, categoria: e.target.value })}
                  label="Categoría"
                >
                  {categoriasIngreso.map((cat) => (
                    <MenuItem key={cat.value} value={cat.value}>{cat.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Concepto"
                value={ingresoForm.concepto}
                onChange={(e) => setIngresoForm({ ...ingresoForm, concepto: e.target.value })}
                required
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Notas (opcional)"
                value={ingresoForm.notas}
                onChange={(e) => setIngresoForm({ ...ingresoForm, notas: e.target.value })}
                multiline
                rows={2}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setIngresoDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleRegistrarIngreso}
            disabled={!ingresoForm.monto || !ingresoForm.concepto}
          >
            Registrar Ingreso en {ingresoForm.currency}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============================================ */}
      {/* DIALOG: CORTE DE CAJA (CIEGO) */}
      {/* ============================================ */}
      <Dialog open={corteDialogOpen} onClose={() => setCorteDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: 'info.main', color: 'white' }}>
          <AssignmentIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Corte de Caja - Cierre del Día
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Alert severity="warning" sx={{ mb: 3 }}>
            <strong>Corte Ciego:</strong> Cuenta el efectivo físico en cada moneda y registra los totales.
          </Alert>
          <Grid container spacing={2}>
            {/* USD */}
            <Grid size={{ xs: 12 }}>
              <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                💵 Efectivo en Dólares (USD)
              </Typography>
              <TextField
                fullWidth
                label="Total USD contado"
                type="number"
                value={corteForm.saldo_usd}
                onChange={(e) => setCorteForm({ ...corteForm, saldo_usd: e.target.value })}
                InputProps={{ 
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  endAdornment: <InputAdornment position="end">USD</InputAdornment>
                }}
                placeholder="0.00"
              />
            </Grid>
            {/* MXN */}
            <Grid size={{ xs: 12 }}>
              <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                🇲🇽 Efectivo en Pesos (MXN)
              </Typography>
              <TextField
                fullWidth
                label="Total MXN contado"
                type="number"
                value={corteForm.saldo_mxn}
                onChange={(e) => setCorteForm({ ...corteForm, saldo_mxn: e.target.value })}
                InputProps={{ 
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  endAdornment: <InputAdornment position="end">MXN</InputAdornment>
                }}
                placeholder="0.00"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Divider sx={{ my: 1 }} />
              <TextField
                fullWidth
                label="Notas del corte (opcional)"
                value={corteForm.notas}
                onChange={(e) => setCorteForm({ ...corteForm, notas: e.target.value })}
                multiline
                rows={2}
                placeholder="Observaciones del cierre..."
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setCorteDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            color="info"
            onClick={handleRealizarCorte}
            disabled={!corteForm.saldo_usd && !corteForm.saldo_mxn}
          >
            Cerrar Día
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default POBoxCajaPage;
