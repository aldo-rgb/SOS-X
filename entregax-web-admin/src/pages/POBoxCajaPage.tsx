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
  saldo_actual: number;
  ingresos_hoy: number;
  egresos_hoy: number;
  cantidad_transacciones_hoy: number;
  ultimo_corte: string | null;
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

  // Egreso con evidencia
  const [egresoForm, setEgresoForm] = useState({
    monto: '',
    concepto: '',
    categoria: 'gastos_operativos',
    referencia: '',
    notas: '',
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
  });

  // Corte
  const [corteForm, setCorteForm] = useState({
    saldo_real: '',
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

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchTransacciones(), fetchCortes()]);
    setLoading(false);
  }, [fetchStats, fetchTransacciones, fetchCortes]);

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
      await api.post('/admin/finance/confirm-payment', {
        referencia: searchResult.payment.referencia,
        metodo_confirmacion: 'efectivo',
        notas: confirmNotes
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
      });

      setSnackbar({ open: true, message: 'Egreso registrado correctamente', severity: 'success' });
      setEgresoDialogOpen(false);
      setEgresoForm({ monto: '', concepto: '', categoria: 'gastos_operativos', referencia: '', notas: '' });
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
      });
      setSnackbar({ open: true, message: 'Ingreso registrado correctamente', severity: 'success' });
      setIngresoDialogOpen(false);
      setIngresoForm({ monto: '', concepto: '', categoria: 'otro_ingreso', notas: '' });
      loadData();
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Error al registrar ingreso';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    }
  };

  // ============================================
  // REALIZAR CORTE
  // ============================================

  const handleRealizarCorte = async () => {
    try {
      await api.post('/caja-chica/corte', {
        saldo_real: parseFloat(corteForm.saldo_real),
        notas: corteForm.notas || null,
      });
      setSnackbar({ open: true, message: 'Corte de caja realizado correctamente', severity: 'success' });
      setCorteDialogOpen(false);
      setCorteForm({ saldo_real: '', notas: '' });
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

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ bgcolor: '#ff5722', color: 'white' }}>
            <CardContent>
              <Typography variant="overline">Saldo Actual</Typography>
              <Typography variant="h4" fontWeight="bold">
                {formatCurrency(stats?.saldo_actual || 0)}
              </Typography>
              <AccountBalanceIcon sx={{ position: 'absolute', right: 16, top: 16, opacity: 0.3, fontSize: 48 }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ bgcolor: '#4caf50', color: 'white' }}>
            <CardContent>
              <Typography variant="overline">Ingresos Hoy</Typography>
              <Typography variant="h4" fontWeight="bold">
                {formatCurrency(stats?.ingresos_hoy || 0)}
              </Typography>
              <TrendingUpIcon sx={{ position: 'absolute', right: 16, top: 16, opacity: 0.3, fontSize: 48 }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ bgcolor: '#f44336', color: 'white' }}>
            <CardContent>
              <Typography variant="overline">Egresos Hoy</Typography>
              <Typography variant="h4" fontWeight="bold">
                {formatCurrency(stats?.egresos_hoy || 0)}
              </Typography>
              <TrendingDownIcon sx={{ position: 'absolute', right: 16, top: 16, opacity: 0.3, fontSize: 48 }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ bgcolor: '#2196f3', color: 'white' }}>
            <CardContent>
              <Typography variant="overline">Transacciones Hoy</Typography>
              <Typography variant="h4" fontWeight="bold">
                {stats?.cantidad_transacciones_hoy || 0}
              </Typography>
              <ReceiptIcon sx={{ position: 'absolute', right: 16, top: 16, opacity: 0.3, fontSize: 48 }} />
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
                    <Typography
                      fontWeight="bold"
                      color={t.tipo === 'ingreso' ? 'success.main' : 'error.main'}
                    >
                      {t.tipo === 'ingreso' ? '+' : '-'}{formatCurrency(t.monto)}
                    </Typography>
                  </TableCell>
                  <TableCell>{t.concepto}</TableCell>
                  <TableCell>
                    {t.cliente_nombre ? (
                      <Box>
                        <Typography variant="body2">{t.cliente_nombre}</Typography>
                        <Typography variant="caption" color="text.secondary">{t.cliente_box_id}</Typography>
                      </Box>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    {t.referencia ? (
                      <Chip label={t.referencia} size="small" variant="outlined" />
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
                <TableCell align="right">Saldo Inicial</TableCell>
                <TableCell align="right">Ingresos</TableCell>
                <TableCell align="right">Egresos</TableCell>
                <TableCell align="right">Saldo Sistema</TableCell>
                <TableCell align="right">Saldo Entregado</TableCell>
                <TableCell align="right">Diferencia</TableCell>
                <TableCell>Responsable</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cortes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{formatDate(c.fecha_corte)}</TableCell>
                  <TableCell align="right">{formatCurrency(c.saldo_inicial)}</TableCell>
                  <TableCell align="right" sx={{ color: 'success.main' }}>+{formatCurrency(c.total_ingresos)}</TableCell>
                  <TableCell align="right" sx={{ color: 'error.main' }}>-{formatCurrency(c.total_egresos)}</TableCell>
                  <TableCell align="right">{formatCurrency(c.saldo_final_sistema)}</TableCell>
                  <TableCell align="right">{formatCurrency(c.saldo_final_entregado)}</TableCell>
                  <TableCell align="right">
                    <Chip
                      label={formatCurrency(c.diferencia)}
                      color={c.diferencia === 0 ? 'success' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{c.admin_name}</TableCell>
                </TableRow>
              ))}
              {cortes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
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
                          {formatCurrency(searchResult.payment.monto)}
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
                              {formatCurrency(guia.assigned_cost_mxn || 0)}
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
              {confirming ? 'Confirmando...' : `Confirmar Pago de ${formatCurrency(searchResult.payment.monto)}`}
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
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Monto"
                type="number"
                value={egresoForm.monto}
                onChange={(e) => setEgresoForm({ ...egresoForm, monto: e.target.value })}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
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
            setEgresoForm({ monto: '', concepto: '', categoria: 'gastos_operativos', referencia: '', notas: '' });
          }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleRegistrarEgreso}
            disabled={!egresoForm.monto || !egresoForm.concepto || !evidenciaFile}
          >
            Registrar Gasto
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
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Monto"
                type="number"
                value={ingresoForm.monto}
                onChange={(e) => setIngresoForm({ ...ingresoForm, monto: e.target.value })}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
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
            Registrar Ingreso
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============================================ */}
      {/* DIALOG: CORTE DE CAJA */}
      {/* ============================================ */}
      <Dialog open={corteDialogOpen} onClose={() => setCorteDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: 'info.main', color: 'white' }}>
          <AssignmentIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Realizar Corte de Caja
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            Saldo actual del sistema: <strong>{formatCurrency(stats?.saldo_actual || 0)}</strong>
          </Alert>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Saldo Real Contado"
                type="number"
                value={corteForm.saldo_real}
                onChange={(e) => setCorteForm({ ...corteForm, saldo_real: e.target.value })}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                required
                helperText="Cuenta el efectivo y registra el total"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Notas del corte (opcional)"
                value={corteForm.notas}
                onChange={(e) => setCorteForm({ ...corteForm, notas: e.target.value })}
                multiline
                rows={2}
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
            disabled={!corteForm.saldo_real}
          >
            Realizar Corte
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
