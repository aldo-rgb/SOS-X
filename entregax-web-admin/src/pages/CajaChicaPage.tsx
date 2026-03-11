// ============================================
// CAJA CHICA PAGE
// Sistema de control de efectivo con:
// - Pagos parciales
// - Pagos multi-guía (1 pago -> N guías)
// - Asignación automática (FIFO) o manual
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
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
  IconButton,
  Alert,
  Snackbar,
  InputAdornment,
  CircularProgress,
  Tooltip,
  Tabs,
  Tab,
  Avatar,
  Divider,
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
  Close as CloseIcon,
  Payment as PaymentIcon,
  LocalShipping as ShippingIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Person as PersonIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import api from '../services/api';

interface CajaChicaStats {
  saldo_actual: number;
  ingresos_hoy: number;
  egresos_hoy: number;
  cantidad_transacciones_hoy: number;
  ultimo_corte: string | null;
}

interface Cliente {
  id: number;
  full_name: string;
  email: string;
  box_id: string;
  phone: string;
  guias_pendientes: number;
  saldo_total_pendiente: number;
}

interface GuiaPendiente {
  id: number;
  tracking_number: string;
  recipient_name: string;
  service_type: string;
  status: string;
  calculated_price: number;
  saldo_pendiente: number;
  monto_pagado: number;
  payment_status: string;
  created_at: string;
  // Para asignación manual
  monto_a_aplicar?: number;
  seleccionada?: boolean;
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

interface ConsolidacionPendiente {
  id: number;
  status: string;
  package_count: number;
  total_cost_mxn: number;
  total_cost_usd: number;
  supplier_name: string;
  supplier_id: number;
  created_at: string;
  packages: Array<{
    id: number;
    tracking: string;
    description: string;
    weight: number;
    pobox_service_cost: number;
    pobox_cost_usd: number;
    costing_paid: boolean;
    client_name: string;
    client_box_id: string;
  }>;
}

const CajaChicaPage: React.FC = () => {
  const [stats, setStats] = useState<CajaChicaStats | null>(null);
  const [transacciones, setTransacciones] = useState<Transaccion[]>([]);
  const [cortes, setCortes] = useState<Corte[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);

  // Dialogs
  const [pagoDialogOpen, setPagoDialogOpen] = useState(false);
  const [egresoDialogOpen, setEgresoDialogOpen] = useState(false);
  const [corteDialogOpen, setCorteDialogOpen] = useState(false);
  const [ingresoGeneralDialogOpen, setIngresoGeneralDialogOpen] = useState(false);
  const [pagoProveedorDialogOpen, setPagoProveedorDialogOpen] = useState(false);

  // Pagos a proveedores
  const [consolidacionesPendientes, setConsolidacionesPendientes] = useState<ConsolidacionPendiente[]>([]);
  const [loadingConsolidaciones, setLoadingConsolidaciones] = useState(false);
  const [expandedConsolidaciones, setExpandedConsolidaciones] = useState<Set<number>>(new Set());
  const [consolidacionAPagar, setConsolidacionAPagar] = useState<ConsolidacionPendiente | null>(null);
  const [pagoConsolidacionDialogOpen, setPagoConsolidacionDialogOpen] = useState(false);
  const [pagoConsolidacionRef, setPagoConsolidacionRef] = useState('');
  const [pagoConsolidacionNotas, setPagoConsolidacionNotas] = useState('');
  const [procesandoPagoProveedor, setProcesandoPagoProveedor] = useState(false);

  // Búsqueda de cliente
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [guiasPendientes, setGuiasPendientes] = useState<GuiaPendiente[]>([]);

  // Pago
  const [montoRecibido, setMontoRecibido] = useState('');
  const [modoAsignacion, setModoAsignacion] = useState<'automatico' | 'manual'>('automatico');
  const [notasPago, setNotasPago] = useState('');
  const [procesandoPago, setProcesandoPago] = useState(false);

  // Búsqueda por referencia de pago
  const [searchRef, setSearchRef] = useState('');
  const [searchingRef, setSearchingRef] = useState(false);
  const [searchRefError, setSearchRefError] = useState('');
  const [refFound, setRefFound] = useState<{
    referencia: string;
    monto: number;
    cliente: { id: number; nombre: string; email: string; box_id: string };
    guias: Array<{ id: number; tracking: string; monto: number }>;
  } | null>(null);

  // Egreso
  const [egresoForm, setEgresoForm] = useState({
    monto: '',
    concepto: '',
    categoria: 'gastos_operativos',
    notas: '',
  });

  // Ingreso general
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

  const categoriasEgreso = [
    { value: 'gastos_operativos', label: 'Gastos Operativos' },
    { value: 'compra_materiales', label: 'Compra de Materiales' },
    { value: 'pago_servicios', label: 'Pago de Servicios' },
    { value: 'devolucion', label: 'Devolución a Cliente' },
    { value: 'otro_egreso', label: 'Otro Egreso' },
  ];

  const categoriasIngreso = [
    { value: 'deposito_inicial', label: 'Depósito Inicial' },
    { value: 'reembolso', label: 'Reembolso' },
    { value: 'otro_ingreso', label: 'Otro Ingreso' },
  ];

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

  // Cargar consolidaciones pendientes de pago a proveedores
  const fetchConsolidacionesPendientes = useCallback(async () => {
    setLoadingConsolidaciones(true);
    try {
      const response = await api.get('/suppliers/consolidaciones-pendientes');
      console.log('📦 Respuesta consolidaciones:', response.data);
      setConsolidacionesPendientes(response.data.consolidations || []);
    } catch (error) {
      console.error('Error fetching consolidaciones pendientes:', error);
    } finally {
      setLoadingConsolidaciones(false);
    }
  }, []);

  // Toggle expandir consolidación
  const toggleExpandConsolidacion = (id: number) => {
    setExpandedConsolidaciones(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Iniciar pago de consolidación
  const handleIniciarPagoConsolidacion = (consolidacion: ConsolidacionPendiente) => {
    setConsolidacionAPagar(consolidacion);
    setPagoConsolidacionRef('');
    setPagoConsolidacionNotas('');
    setPagoConsolidacionDialogOpen(true);
  };

  // Confirmar pago de consolidación a proveedor
  const handlePagarConsolidacion = async () => {
    if (!consolidacionAPagar) return;
    
    setProcesandoPagoProveedor(true);
    try {
      const response = await api.post('/caja-chica/pagar-consolidacion', {
        consolidation_id: consolidacionAPagar.id,
        monto: Number(consolidacionAPagar.total_cost_mxn),
        referencia: pagoConsolidacionRef || null,
        notas: pagoConsolidacionNotas || null
      });
      
      setSnackbar({ 
        open: true, 
        message: `✅ Pago de ${formatCurrency(Number(consolidacionAPagar.total_cost_mxn))} registrado - ${response.data.packages_updated} paquetes actualizados`, 
        severity: 'success' 
      });
      
      // Cerrar diálogos y refrescar
      setPagoConsolidacionDialogOpen(false);
      setConsolidacionAPagar(null);
      fetchConsolidacionesPendientes();
      loadData(); // Refrescar stats de caja chica
      
    } catch (error: unknown) {
      console.error('Error pagando consolidación:', error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      setSnackbar({ 
        open: true, 
        message: axiosError.response?.data?.error || 'Error al procesar pago', 
        severity: 'error' 
      });
    } finally {
      setProcesandoPagoProveedor(false);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchTransacciones(), fetchCortes()]);
    setLoading(false);
  }, [fetchStats, fetchTransacciones, fetchCortes]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Buscar por referencia de pago
  const handleSearchByRef = async () => {
    if (!searchRef.trim()) return;
    setSearchingRef(true);
    setSearchRefError('');
    setRefFound(null);
    try {
      const response = await api.get('/caja-chica/buscar-referencia', { params: { ref: searchRef.trim() } });
      if (response.data.found) {
        setRefFound(response.data);
        // Pre-cargar el monto a recibir
        setMontoRecibido(String(response.data.monto));
      } else {
        setSearchRefError('No se encontró ningún pago con esa referencia');
      }
    } catch (error: unknown) {
      console.error('Error buscando referencia:', error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      setSearchRefError(axiosError.response?.data?.error || 'Error al buscar la referencia');
    } finally {
      setSearchingRef(false);
    }
  };

  // Confirmar pago encontrado por referencia
  const handleConfirmRefPayment = async () => {
    if (!refFound) return;
    setProcesandoPago(true);
    try {
      await api.post('/caja-chica/confirmar-pago-referencia', {
        referencia: refFound.referencia,
        monto: parseFloat(montoRecibido),
        notas: notasPago
      });
      setSnackbar({ open: true, message: `✅ Pago de ${formatCurrency(parseFloat(montoRecibido))} registrado correctamente`, severity: 'success' });
      setPagoDialogOpen(false);
      setRefFound(null);
      setSearchRef('');
      setMontoRecibido('');
      setNotasPago('');
      loadData();
    } catch (error: unknown) {
      console.error('Error confirmando pago:', error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      setSnackbar({ open: true, message: axiosError.response?.data?.error || 'Error al confirmar pago', severity: 'error' });
    } finally {
      setProcesandoPago(false);
    }
  };

  // Cargar guías pendientes de un cliente
  const cargarGuiasPendientes = async (clienteId: number) => {
    try {
      const response = await api.get(`/caja-chica/cliente/${clienteId}/guias-pendientes`);
      setGuiasPendientes(response.data.guias.map((g: GuiaPendiente) => ({ 
        ...g, 
        monto_a_aplicar: 0,
        seleccionada: false 
      })));
    } catch (error) {
      console.error('Error cargando guías:', error);
      setSnackbar({ open: true, message: 'Error al cargar guías del cliente', severity: 'error' });
    }
  };



  // Seleccionar cliente
  const handleSeleccionarCliente = (cliente: Cliente | null) => {
    setClienteSeleccionado(cliente);
    if (cliente) {
      cargarGuiasPendientes(cliente.id);
    } else {
      setGuiasPendientes([]);
    }
  };

  // Toggle selección de guía (modo manual)
  const toggleSeleccionGuia = (guiaId: number) => {
    setGuiasPendientes(prev => prev.map(g => 
      g.id === guiaId ? { ...g, seleccionada: !g.seleccionada } : g
    ));
  };

  // Actualizar monto a aplicar en guía específica (modo manual)
  const updateMontoGuia = (guiaId: number, monto: string) => {
    const montoNum = parseFloat(monto) || 0;
    setGuiasPendientes(prev => prev.map(g => {
      if (g.id === guiaId) {
        // No permitir más del saldo pendiente
        const maxMonto = parseFloat(String(g.saldo_pendiente));
        return { 
          ...g, 
          monto_a_aplicar: Math.min(montoNum, maxMonto),
          seleccionada: montoNum > 0
        };
      }
      return g;
    }));
  };

  // Calcular suma de aplicaciones manuales
  const sumaAplicacionesManual = guiasPendientes
    .filter(g => g.seleccionada && g.monto_a_aplicar && g.monto_a_aplicar > 0)
    .reduce((sum, g) => sum + (g.monto_a_aplicar || 0), 0);

  // Registrar pago
  const handleRegistrarPago = async () => {
    if (!clienteSeleccionado || !montoRecibido) {
      setSnackbar({ open: true, message: 'Seleccione un cliente e ingrese el monto', severity: 'error' });
      return;
    }

    const monto = parseFloat(montoRecibido);
    if (monto <= 0) {
      setSnackbar({ open: true, message: 'El monto debe ser mayor a 0', severity: 'error' });
      return;
    }

    setProcesandoPago(true);
    try {
      const payload: {
        cliente_id: number;
        monto_total: number;
        modo_asignacion: 'automatico' | 'manual';
        aplicaciones?: Array<{ package_id: number; monto_aplicado: number }>;
        notas: string;
      } = {
        cliente_id: clienteSeleccionado.id,
        monto_total: monto,
        modo_asignacion: modoAsignacion,
        notas: notasPago,
      };

      if (modoAsignacion === 'manual') {
        payload.aplicaciones = guiasPendientes
          .filter(g => g.seleccionada && g.monto_a_aplicar && g.monto_a_aplicar > 0)
          .map(g => ({
            package_id: g.id,
            monto_aplicado: g.monto_a_aplicar || 0
          }));
      }

      const response = await api.post('/caja-chica/pago-cliente', payload);

      setSnackbar({
        open: true,
        message: `✅ Pago registrado: ${response.data.resumen.guias_pagadas_completo} guías pagadas, ${response.data.resumen.guias_con_abono} con abono parcial`,
        severity: 'success',
      });

      // Limpiar y cerrar
      setPagoDialogOpen(false);
      setClienteSeleccionado(null);
      setGuiasPendientes([]);
      setMontoRecibido('');
      setNotasPago('');
      setModoAsignacion('automatico');
      loadData();

    } catch (error: unknown) {
      console.error('Error registrando pago:', error);
      const errorMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error al registrar pago';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    } finally {
      setProcesandoPago(false);
    }
  };

  // Registrar egreso
  const handleRegistrarEgreso = async () => {
    try {
      await api.post('/caja-chica/egreso', {
        monto: parseFloat(egresoForm.monto),
        concepto: egresoForm.concepto,
        categoria: egresoForm.categoria,
        notas: egresoForm.notas || null,
      });
      setSnackbar({ open: true, message: 'Egreso registrado correctamente', severity: 'success' });
      setEgresoDialogOpen(false);
      setEgresoForm({ monto: '', concepto: '', categoria: 'gastos_operativos', notas: '' });
      loadData();
    } catch (error: unknown) {
      const errorMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error al registrar egreso';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    }
  };

  // Registrar ingreso general
  const handleRegistrarIngresoGeneral = async () => {
    try {
      await api.post('/caja-chica/ingreso', {
        monto: parseFloat(ingresoForm.monto),
        concepto: ingresoForm.concepto,
        categoria: ingresoForm.categoria,
        notas: ingresoForm.notas || null,
      });
      setSnackbar({ open: true, message: 'Ingreso registrado correctamente', severity: 'success' });
      setIngresoGeneralDialogOpen(false);
      setIngresoForm({ monto: '', concepto: '', categoria: 'otro_ingreso', notas: '' });
      loadData();
    } catch (error: unknown) {
      const errorMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error al registrar ingreso';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    }
  };

  // Realizar corte
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
      const errorMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error al realizar corte';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-MX', { 
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const getPaymentStatusChip = (status: string) => {
    switch (status) {
      case 'paid':
        return <Chip label="PAGADO" color="success" size="small" icon={<CheckCircleIcon />} />;
      case 'partial':
        return <Chip label="PARCIAL" color="warning" size="small" />;
      default:
        return <Chip label="PENDIENTE" color="error" size="small" />;
    }
  };

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
            Caja CC
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Control de efectivo con pagos parciales y multi-guía
          </Typography>
        </Box>
        <Box display="flex" gap={1}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<PersonIcon />}
            onClick={() => setPagoDialogOpen(true)}
            size="large"
          >
            Recibir Pago
          </Button>
          <Button
            variant="outlined"
            color="success"
            startIcon={<AddIcon />}
            onClick={() => setIngresoGeneralDialogOpen(true)}
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
            variant="contained"
            color="warning"
            startIcon={<PaymentIcon />}
            onClick={() => {
              setPagoProveedorDialogOpen(true);
              fetchConsolidacionesPendientes();
            }}
          >
            Realizar Pago
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
          <Card sx={{ bgcolor: 'primary.main', color: 'white' }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="subtitle2" sx={{ opacity: 0.8 }}>Saldo Actual</Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {formatCurrency(stats?.saldo_actual || 0)}
                  </Typography>
                </Box>
                <AccountBalanceIcon sx={{ fontSize: 48, opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ bgcolor: 'success.main', color: 'white' }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="subtitle2" sx={{ opacity: 0.8 }}>Ingresos Hoy</Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {formatCurrency(stats?.ingresos_hoy || 0)}
                  </Typography>
                </Box>
                <TrendingUpIcon sx={{ fontSize: 48, opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ bgcolor: 'error.main', color: 'white' }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="subtitle2" sx={{ opacity: 0.8 }}>Egresos Hoy</Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {formatCurrency(stats?.egresos_hoy || 0)}
                  </Typography>
                </Box>
                <TrendingDownIcon sx={{ fontSize: 48, opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ bgcolor: 'info.main', color: 'white' }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="subtitle2" sx={{ opacity: 0.8 }}>Transacciones Hoy</Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {stats?.cantidad_transacciones_hoy || 0}
                  </Typography>
                </Box>
                <ReceiptIcon sx={{ fontSize: 48, opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab icon={<ReceiptIcon />} iconPosition="start" label="Transacciones" />
          <Tab icon={<HistoryIcon />} iconPosition="start" label="Historial de Cortes" />
        </Tabs>
      </Paper>

      {/* Tab Content: Transacciones */}
      {tabValue === 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell>Fecha</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Cliente</TableCell>
                <TableCell>Concepto</TableCell>
                <TableCell>Guías</TableCell>
                <TableCell align="right">Monto</TableCell>
                <TableCell>Registrado por</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transacciones.map((tx) => (
                <TableRow key={tx.id} hover>
                  <TableCell>{formatDate(tx.created_at)}</TableCell>
                  <TableCell>
                    <Chip
                      label={tx.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                      color={tx.tipo === 'ingreso' ? 'success' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {tx.cliente_nombre ? (
                      <Box>
                        <Typography variant="body2" fontWeight="bold">{tx.cliente_nombre}</Typography>
                        <Typography variant="caption" color="text.secondary">{tx.cliente_box_id}</Typography>
                      </Box>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{tx.concepto}</Typography>
                    {tx.categoria && (
                      <Chip label={tx.categoria.replace(/_/g, ' ')} size="small" variant="outlined" sx={{ mt: 0.5 }} />
                    )}
                  </TableCell>
                  <TableCell>
                    {tx.aplicaciones && tx.aplicaciones.length > 0 ? (
                      <Tooltip title={tx.aplicaciones.map(a => `${a.tracking_number}: ${formatCurrency(a.monto_aplicado)}`).join('\n')}>
                        <Chip
                          label={`${tx.aplicaciones.length} guía(s)`}
                          size="small"
                          color="info"
                          variant="outlined"
                        />
                      </Tooltip>
                    ) : '-'}
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      fontWeight="bold"
                      color={tx.tipo === 'ingreso' ? 'success.main' : 'error.main'}
                    >
                      {tx.tipo === 'ingreso' ? '+' : '-'} {formatCurrency(tx.monto)}
                    </Typography>
                  </TableCell>
                  <TableCell>{tx.admin_name}</TableCell>
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
                <TableCell align="right">Esperado</TableCell>
                <TableCell align="right">Real</TableCell>
                <TableCell align="right">Diferencia</TableCell>
                <TableCell>Realizado por</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cortes.map((corte) => (
                <TableRow key={corte.id} hover>
                  <TableCell>{formatDate(corte.fecha_corte)}</TableCell>
                  <TableCell align="right">{formatCurrency(corte.saldo_inicial)}</TableCell>
                  <TableCell align="right" sx={{ color: 'success.main' }}>+{formatCurrency(corte.total_ingresos)}</TableCell>
                  <TableCell align="right" sx={{ color: 'error.main' }}>-{formatCurrency(corte.total_egresos)}</TableCell>
                  <TableCell align="right">{formatCurrency(corte.saldo_final_sistema)}</TableCell>
                  <TableCell align="right">{formatCurrency(corte.saldo_final_entregado)}</TableCell>
                  <TableCell align="right">
                    <Chip
                      label={formatCurrency(corte.diferencia)}
                      color={corte.diferencia === 0 ? 'success' : corte.diferencia > 0 ? 'info' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{corte.admin_name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ============================================ */}
      {/* DIALOG: COBRAR A CLIENTE (Principal) */}
      {/* ============================================ */}
      <Dialog
        open={pagoDialogOpen}
        onClose={() => {
          setPagoDialogOpen(false);
          setClienteSeleccionado(null);
          setGuiasPendientes([]);
          setMontoRecibido('');
          setSearchRef('');
          setRefFound(null);
          setSearchRefError('');
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: 'primary.main', color: 'white' }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box display="flex" alignItems="center" gap={1}>
              <PersonIcon />
              <Typography variant="h6">Recibir Pago</Typography>
            </Box>
            <IconButton onClick={() => setPagoDialogOpen(false)} sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          {/* Paso 1: Buscar por referencia de pago */}
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
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.active' }} />,
                }}
                autoFocus
              />
              <Button
                variant="contained"
                onClick={handleSearchByRef}
                disabled={searchingRef || !searchRef.trim()}
                sx={{ minWidth: 120 }}
              >
                {searchingRef ? <CircularProgress size={24} /> : 'Buscar'}
              </Button>
            </Box>
            {searchRefError && (
              <Alert severity="error" sx={{ mt: 2 }}>{searchRefError}</Alert>
            )}
          </Box>

          {/* Paso 2: Mostrar información del pago encontrado */}
          {refFound && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                2. Información del Pago Encontrado
              </Typography>
              
              <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'success.50' }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Avatar sx={{ bgcolor: 'primary.main', width: 56, height: 56 }}>
                        {refFound.cliente.nombre.charAt(0)}
                      </Avatar>
                      <Box>
                        <Typography variant="h6">{refFound.cliente.nombre}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {refFound.cliente.box_id} • {refFound.cliente.email}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="overline" color="text.secondary">Monto a Cobrar</Typography>
                      <Typography variant="h4" color="success.main" fontWeight="bold">
                        {formatCurrency(refFound.monto)}
                      </Typography>
                      <Chip label={refFound.referencia} color="primary" size="small" sx={{ mt: 1 }} />
                    </Box>
                  </Grid>
                </Grid>

                {/* Guías incluidas */}
                {refFound.guias && refFound.guias.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>Guías incluidas:</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {refFound.guias.map((g) => (
                        <Chip 
                          key={g.id} 
                          label={`${g.tracking}: ${formatCurrency(g.monto)}`}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </Box>
                )}
              </Paper>

              {/* Paso 3: Confirmar monto recibido */}
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                3. Confirmar Monto Recibido
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Monto Recibido"
                    type="number"
                    value={montoRecibido}
                    onChange={(e) => setMontoRecibido(e.target.value)}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">$</InputAdornment>,
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Notas (opcional)"
                    value={notasPago}
                    onChange={(e) => setNotasPago(e.target.value)}
                    placeholder="Ej: Pago en efectivo"
                  />
                </Grid>
              </Grid>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setPagoDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleConfirmRefPayment}
            disabled={!refFound || procesandoPago || !montoRecibido}
            startIcon={procesandoPago ? <CircularProgress size={20} /> : <CheckCircleIcon />}
          >
            {procesandoPago ? 'Procesando...' : `Registrar Pago de ${formatCurrency(parseFloat(montoRecibido) || 0)}`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Egreso */}
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
              <FormControl fullWidth>
                <InputLabel>Categoría</InputLabel>
                <Select
                  value={egresoForm.categoria}
                  onChange={(e) => setEgresoForm({ ...egresoForm, categoria: e.target.value })}
                  label="Categoría"
                >
                  {categoriasEgreso.map((cat) => (
                    <MenuItem key={cat.value} value={cat.value}>{cat.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Concepto"
                value={egresoForm.concepto}
                onChange={(e) => setEgresoForm({ ...egresoForm, concepto: e.target.value })}
                required
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Notas (opcional)"
                value={egresoForm.notas}
                onChange={(e) => setEgresoForm({ ...egresoForm, notas: e.target.value })}
                multiline
                rows={2}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEgresoDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleRegistrarEgreso}
            disabled={!egresoForm.monto || !egresoForm.concepto}
          >
            Registrar Egreso
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Ingreso General */}
      <Dialog open={ingresoGeneralDialogOpen} onClose={() => setIngresoGeneralDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: 'success.main', color: 'white' }}>
          <AddIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Registrar Ingreso
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
          <Button onClick={() => setIngresoGeneralDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleRegistrarIngresoGeneral}
            disabled={!ingresoForm.monto || !ingresoForm.concepto}
          >
            Registrar Ingreso
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Corte de Caja */}
      <Dialog open={corteDialogOpen} onClose={() => setCorteDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: 'info.main', color: 'white' }}>
          <AssignmentIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Realizar Corte de Caja
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              Saldo actual en sistema: <strong>{formatCurrency(stats?.saldo_actual || 0)}</strong>
            </Typography>
          </Alert>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Saldo Real Contado"
                type="number"
                value={corteForm.saldo_real}
                onChange={(e) => setCorteForm({ ...corteForm, saldo_real: e.target.value })}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                helperText="Ingresa el monto real que tienes en caja"
                required
              />
            </Grid>
            {corteForm.saldo_real && (
              <Grid size={{ xs: 12 }}>
                <Alert
                  severity={
                    parseFloat(corteForm.saldo_real) === (stats?.saldo_actual || 0) ? 'success'
                      : parseFloat(corteForm.saldo_real) > (stats?.saldo_actual || 0) ? 'info' : 'warning'
                  }
                >
                  Diferencia: <strong>{formatCurrency(parseFloat(corteForm.saldo_real) - (stats?.saldo_actual || 0))}</strong>
                </Alert>
              </Grid>
            )}
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Notas (opcional)"
                value={corteForm.notas}
                onChange={(e) => setCorteForm({ ...corteForm, notas: e.target.value })}
                multiline
                rows={3}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setCorteDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleRealizarCorte}
            disabled={!corteForm.saldo_real}
          >
            Realizar Corte
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de Pago a Proveedores */}
      <Dialog
        open={pagoProveedorDialogOpen}
        onClose={() => setPagoProveedorDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box display="flex" alignItems="center" gap={1}>
              <PaymentIcon color="warning" />
              <Typography variant="h6">Pagos Pendientes a Proveedores</Typography>
            </Box>
            <IconButton onClick={() => setPagoProveedorDialogOpen(false)} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {loadingConsolidaciones ? (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          ) : consolidacionesPendientes.length === 0 ? (
            <Alert severity="info">
              No hay consolidaciones pendientes de pago a proveedores
            </Alert>
          ) : (
            <Box>
              {/* Resumen total */}
              <Paper sx={{ p: 2, mb: 3, bgcolor: 'warning.light' }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Resumen Total
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 4 }}>
                    <Typography variant="body2" color="text.secondary">Consolidaciones</Typography>
                    <Typography variant="h5" fontWeight="bold">{consolidacionesPendientes.length}</Typography>
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <Typography variant="body2" color="text.secondary">Total USD</Typography>
                    <Typography variant="h5" fontWeight="bold" color="success.dark">
                      ${consolidacionesPendientes.reduce((sum, c) => sum + Number(c.total_cost_usd || 0), 0).toFixed(2)}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <Typography variant="body2" color="text.secondary">Total MXN</Typography>
                    <Typography variant="h5" fontWeight="bold" color="primary.dark">
                      {formatCurrency(consolidacionesPendientes.reduce((sum, c) => sum + Number(c.total_cost_mxn || 0), 0))}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>

              {/* Lista de consolidaciones */}
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell width={40}></TableCell>
                      <TableCell><strong>Consolidación</strong></TableCell>
                      <TableCell><strong>Proveedor</strong></TableCell>
                      <TableCell align="center"><strong>Paquetes</strong></TableCell>
                      <TableCell><strong>Estado</strong></TableCell>
                      <TableCell align="right"><strong>Total USD</strong></TableCell>
                      <TableCell align="right"><strong>Total MXN</strong></TableCell>
                      <TableCell align="center"><strong>Acción</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {consolidacionesPendientes.map((consolidacion) => (
                      <React.Fragment key={consolidacion.id}>
                        <TableRow 
                          hover
                          sx={{ 
                            '& > td': { borderBottom: expandedConsolidaciones.has(consolidacion.id) ? 'none' : undefined },
                            cursor: 'pointer'
                          }}
                          onClick={() => toggleExpandConsolidacion(consolidacion.id)}
                        >
                          <TableCell>
                            <IconButton size="small">
                              {expandedConsolidaciones.has(consolidacion.id) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            </IconButton>
                          </TableCell>
                          <TableCell>
                            <Box display="flex" alignItems="center" gap={1}>
                              <ShippingIcon color="primary" fontSize="small" />
                              <Typography fontWeight="bold">#{consolidacion.id}</Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(consolidacion.created_at).toLocaleDateString('es-MX')}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography fontWeight="bold">{consolidacion.supplier_name}</Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip 
                              label={consolidacion.package_count} 
                              size="small" 
                              color="primary" 
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={consolidacion.status === 'in_transit' ? 'En Tránsito' : consolidacion.status}
                              size="small"
                              color={consolidacion.status === 'in_transit' ? 'info' : 'default'}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Typography fontWeight="bold" color="success.main">
                              ${Number(consolidacion.total_cost_usd || 0).toFixed(2)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography fontWeight="bold" color="primary.main">
                              {formatCurrency(Number(consolidacion.total_cost_mxn || 0))}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Button
                              variant="contained"
                              size="small"
                              color="warning"
                              startIcon={<PaymentIcon />}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleIniciarPagoConsolidacion(consolidacion);
                              }}
                            >
                              Pagar
                            </Button>
                          </TableCell>
                        </TableRow>
                        {/* Paquetes expandidos */}
                        {expandedConsolidaciones.has(consolidacion.id) && (
                          <TableRow>
                            <TableCell colSpan={8} sx={{ p: 0, bgcolor: 'grey.50' }}>
                              <Box sx={{ p: 2 }}>
                                <Typography variant="subtitle2" gutterBottom>
                                  Paquetes en esta consolidación:
                                </Typography>
                                <Table size="small">
                                  <TableHead>
                                    <TableRow>
                                      <TableCell>Tracking</TableCell>
                                      <TableCell>Cliente</TableCell>
                                      <TableCell>Descripción</TableCell>
                                      <TableCell align="right">Peso (lb)</TableCell>
                                      <TableCell align="right">USD</TableCell>
                                      <TableCell align="right">MXN</TableCell>
                                      <TableCell align="center">Pagado</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {consolidacion.packages?.map((pkg) => (
                                      <TableRow key={pkg.id}>
                                        <TableCell>
                                          <Typography variant="body2" fontFamily="monospace">
                                            {pkg.tracking}
                                          </Typography>
                                        </TableCell>
                                        <TableCell>
                                          <Typography variant="body2">{pkg.client_name}</Typography>
                                          <Typography variant="caption" color="text.secondary">{pkg.client_box_id}</Typography>
                                        </TableCell>
                                        <TableCell>
                                          <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                            {pkg.description || '-'}
                                          </Typography>
                                        </TableCell>
                                        <TableCell align="right">{Number(pkg.weight || 0).toFixed(2)}</TableCell>
                                        <TableCell align="right">${Number(pkg.pobox_cost_usd || 0).toFixed(2)}</TableCell>
                                        <TableCell align="right">{formatCurrency(Number(pkg.pobox_service_cost || 0))}</TableCell>
                                        <TableCell align="center">
                                          {pkg.costing_paid ? (
                                            <CheckCircleIcon color="success" fontSize="small" />
                                          ) : (
                                            <Typography variant="caption" color="warning.main">Pendiente</Typography>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </Box>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setPagoProveedorDialogOpen(false)}>
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de Confirmación de Pago a Proveedor */}
      <Dialog
        open={pagoConsolidacionDialogOpen}
        onClose={() => !procesandoPagoProveedor && setPagoConsolidacionDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <PaymentIcon color="warning" />
            <Typography variant="h6">Confirmar Pago a Proveedor</Typography>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {consolidacionAPagar && (
            <Box>
              <Alert severity="warning" sx={{ mb: 2 }}>
                Se registrará un <strong>egreso</strong> en caja chica y se marcarán los paquetes como <strong>pagados al proveedor</strong>.
              </Alert>
              
              <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="body2" color="text.secondary">Consolidación</Typography>
                    <Typography variant="h6" fontWeight="bold">#{consolidacionAPagar.id}</Typography>
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="body2" color="text.secondary">Proveedor</Typography>
                    <Typography variant="h6" fontWeight="bold">{consolidacionAPagar.supplier_name}</Typography>
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="body2" color="text.secondary">Paquetes</Typography>
                    <Typography variant="h6">{consolidacionAPagar.package_count}</Typography>
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="body2" color="text.secondary">Total USD</Typography>
                    <Typography variant="h6" color="success.main">${Number(consolidacionAPagar.total_cost_usd || 0).toFixed(2)}</Typography>
                  </Grid>
                </Grid>
                <Divider sx={{ my: 2 }} />
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6">Total a Pagar (MXN):</Typography>
                  <Typography variant="h4" fontWeight="bold" color="primary.main">
                    {formatCurrency(Number(consolidacionAPagar.total_cost_mxn || 0))}
                  </Typography>
                </Box>
              </Paper>

              <TextField
                fullWidth
                label="Referencia de Pago (opcional)"
                placeholder="Ej: TRANS-001, CHQ-123"
                value={pagoConsolidacionRef}
                onChange={(e) => setPagoConsolidacionRef(e.target.value)}
                sx={{ mb: 2 }}
              />
              
              <TextField
                fullWidth
                label="Notas (opcional)"
                value={pagoConsolidacionNotas}
                onChange={(e) => setPagoConsolidacionNotas(e.target.value)}
                multiline
                rows={2}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button 
            onClick={() => setPagoConsolidacionDialogOpen(false)}
            disabled={procesandoPagoProveedor}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handlePagarConsolidacion}
            disabled={procesandoPagoProveedor}
            startIcon={procesandoPagoProveedor ? <CircularProgress size={20} color="inherit" /> : <PaymentIcon />}
          >
            {procesandoPagoProveedor ? 'Procesando...' : 'Confirmar Pago'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CajaChicaPage;
