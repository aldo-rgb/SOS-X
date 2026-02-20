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
  Autocomplete,
  Checkbox,
  Divider,
  List,
  ListItem,
  ListItemText,
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
  Person as PersonIcon,
  CheckCircle as CheckCircleIcon,
  AttachMoney as MoneyIcon,
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

  // Búsqueda de cliente
  const [clientesEncontrados, setClientesEncontrados] = useState<Cliente[]>([]);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [guiasPendientes, setGuiasPendientes] = useState<GuiaPendiente[]>([]);
  const [totalesCliente, setTotalesCliente] = useState({ total_facturado: 0, total_pagado: 0, total_pendiente: 0 });
  const [cargandoGuias, setCargandoGuias] = useState(false);

  // Pago
  const [montoRecibido, setMontoRecibido] = useState('');
  const [modoAsignacion, setModoAsignacion] = useState<'automatico' | 'manual'>('automatico');
  const [notasPago, setNotasPago] = useState('');
  const [procesandoPago, setProcesandoPago] = useState(false);
  const [previewAsignacion, setPreviewAsignacion] = useState<GuiaPendiente[]>([]);

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

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchTransacciones(), fetchCortes()]);
    setLoading(false);
  }, [fetchStats, fetchTransacciones, fetchCortes]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Buscar clientes
  const handleBuscarCliente = async (query: string) => {
    if (query.length < 2) {
      setClientesEncontrados([]);
      return;
    }
    setBuscandoCliente(true);
    try {
      const response = await api.get('/caja-chica/buscar-cliente', { params: { q: query } });
      setClientesEncontrados(response.data);
    } catch (error) {
      console.error('Error buscando cliente:', error);
    } finally {
      setBuscandoCliente(false);
    }
  };

  // Cargar guías pendientes de un cliente
  const cargarGuiasPendientes = async (clienteId: number) => {
    setCargandoGuias(true);
    try {
      const response = await api.get(`/caja-chica/cliente/${clienteId}/guias-pendientes`);
      setGuiasPendientes(response.data.guias.map((g: GuiaPendiente) => ({ 
        ...g, 
        monto_a_aplicar: 0,
        seleccionada: false 
      })));
      setTotalesCliente(response.data.totales);
    } catch (error) {
      console.error('Error cargando guías:', error);
      setSnackbar({ open: true, message: 'Error al cargar guías del cliente', severity: 'error' });
    } finally {
      setCargandoGuias(false);
    }
  };

  // Calcular preview de asignación FIFO
  const calcularPreviewFIFO = useCallback((monto: number) => {
    if (!monto || monto <= 0) {
      setPreviewAsignacion([]);
      return;
    }

    let montoRestante = monto;
    const preview: GuiaPendiente[] = [];

    for (const guia of guiasPendientes) {
      if (montoRestante <= 0) break;
      
      const saldo = parseFloat(String(guia.saldo_pendiente));
      const montoAplicar = Math.min(montoRestante, saldo);
      
      if (montoAplicar > 0) {
        preview.push({
          ...guia,
          monto_a_aplicar: montoAplicar,
          seleccionada: true
        });
        montoRestante -= montoAplicar;
      }
    }

    setPreviewAsignacion(preview);
  }, [guiasPendientes]);

  // Actualizar preview cuando cambia el monto
  useEffect(() => {
    if (modoAsignacion === 'automatico') {
      calcularPreviewFIFO(parseFloat(montoRecibido) || 0);
    }
  }, [montoRecibido, modoAsignacion, calcularPreviewFIFO]);

  // Seleccionar cliente
  const handleSeleccionarCliente = (cliente: Cliente | null) => {
    setClienteSeleccionado(cliente);
    if (cliente) {
      cargarGuiasPendientes(cliente.id);
    } else {
      setGuiasPendientes([]);
      setTotalesCliente({ total_facturado: 0, total_pagado: 0, total_pendiente: 0 });
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
            Caja Chica
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
        }}
        maxWidth="lg"
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
          {/* Paso 1: Buscar cliente */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              1. Seleccionar Cliente
            </Typography>
            <Autocomplete
              options={clientesEncontrados}
              getOptionLabel={(option) => `${option.full_name} (${option.box_id})`}
              loading={buscandoCliente}
              onInputChange={(_, value) => {
                handleBuscarCliente(value);
              }}
              onChange={(_, value) => handleSeleccionarCliente(value)}
              value={clienteSeleccionado}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Buscar por nombre, Box ID, email o teléfono"
                  placeholder="Ej: Juan Pérez, BOX-001, juan@email.com"
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.active' }} />,
                  }}
                />
              )}
              renderOption={(props, option) => (
                <li {...props} key={option.id}>
                  <Box sx={{ width: '100%' }}>
                    <Box display="flex" justifyContent="space-between">
                      <Typography fontWeight="bold">{option.full_name}</Typography>
                      <Chip 
                        label={`${option.guias_pendientes} guías pendientes`} 
                        size="small" 
                        color={option.guias_pendientes > 0 ? 'warning' : 'success'}
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {option.box_id} • {option.email}
                    </Typography>
                    {option.saldo_total_pendiente > 0 && (
                      <Typography variant="body2" color="error.main" fontWeight="bold">
                        Saldo pendiente: {formatCurrency(option.saldo_total_pendiente)}
                      </Typography>
                    )}
                  </Box>
                </li>
              )}
            />
          </Box>

          {/* Paso 2: Estado de cuenta del cliente */}
          {clienteSeleccionado && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                2. Estado de Cuenta - {clienteSeleccionado.full_name}
              </Typography>
              
              {/* Resumen */}
              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <Chip 
                  label={`Total Facturado: ${formatCurrency(totalesCliente.total_facturado)}`} 
                  color="default" 
                />
                <Chip 
                  label={`Pagado: ${formatCurrency(totalesCliente.total_pagado)}`} 
                  color="success" 
                />
                <Chip 
                  label={`Pendiente: ${formatCurrency(totalesCliente.total_pendiente)}`} 
                  color="error" 
                />
              </Box>

              {/* Tabla de guías */}
              {cargandoGuias ? (
                <Box display="flex" justifyContent="center" py={3}>
                  <CircularProgress />
                </Box>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300, mb: 2 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        {modoAsignacion === 'manual' && <TableCell padding="checkbox"></TableCell>}
                        <TableCell>Guía</TableCell>
                        <TableCell>Destinatario</TableCell>
                        <TableCell align="right">Total</TableCell>
                        <TableCell align="right">Pagado</TableCell>
                        <TableCell align="right">Pendiente</TableCell>
                        <TableCell>Estado</TableCell>
                        {modoAsignacion === 'manual' && <TableCell align="right">Aplicar</TableCell>}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {guiasPendientes.map((guia) => {
                        const previewGuia = previewAsignacion.find(p => p.id === guia.id);
                        const montoAAplicar = modoAsignacion === 'automatico' 
                          ? previewGuia?.monto_a_aplicar || 0
                          : guia.monto_a_aplicar || 0;
                        
                        return (
                          <TableRow 
                            key={guia.id} 
                            sx={{ 
                              bgcolor: montoAAplicar > 0 ? 'success.lighter' : 'inherit',
                              '&:hover': { bgcolor: montoAAplicar > 0 ? 'success.light' : 'action.hover' }
                            }}
                          >
                            {modoAsignacion === 'manual' && (
                              <TableCell padding="checkbox">
                                <Checkbox
                                  checked={guia.seleccionada || false}
                                  onChange={() => toggleSeleccionGuia(guia.id)}
                                />
                              </TableCell>
                            )}
                            <TableCell>
                              <Typography variant="body2" fontWeight="bold">{guia.tracking_number}</Typography>
                              <Typography variant="caption" color="text.secondary">{guia.service_type}</Typography>
                            </TableCell>
                            <TableCell>{guia.recipient_name}</TableCell>
                            <TableCell align="right">{formatCurrency(guia.calculated_price)}</TableCell>
                            <TableCell align="right" sx={{ color: 'success.main' }}>
                              {formatCurrency(guia.monto_pagado)}
                            </TableCell>
                            <TableCell align="right" sx={{ color: 'error.main', fontWeight: 'bold' }}>
                              {formatCurrency(guia.saldo_pendiente)}
                            </TableCell>
                            <TableCell>{getPaymentStatusChip(guia.payment_status)}</TableCell>
                            {modoAsignacion === 'manual' && (
                              <TableCell align="right" sx={{ width: 120 }}>
                                <TextField
                                  size="small"
                                  type="number"
                                  value={guia.monto_a_aplicar || ''}
                                  onChange={(e) => updateMontoGuia(guia.id, e.target.value)}
                                  InputProps={{
                                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                  }}
                                  sx={{ width: 100 }}
                                  disabled={!guia.seleccionada}
                                />
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {/* Paso 3: Ingresar monto */}
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                3. Efectivo Recibido
              </Typography>
              
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    fullWidth
                    label="Monto en Efectivo"
                    type="number"
                    value={montoRecibido}
                    onChange={(e) => setMontoRecibido(e.target.value)}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">$</InputAdornment>,
                    }}
                    placeholder="70,000"
                    autoFocus
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <FormControl fullWidth>
                    <InputLabel>Modo de Asignación</InputLabel>
                    <Select
                      value={modoAsignacion}
                      onChange={(e) => setModoAsignacion(e.target.value as 'automatico' | 'manual')}
                      label="Modo de Asignación"
                    >
                      <MenuItem value="automatico">
                        🤖 Automático (FIFO) - Paga las más antiguas primero
                      </MenuItem>
                      <MenuItem value="manual">
                        ✍️ Manual - Yo decido a qué guías aplicar
                      </MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    fullWidth
                    label="Notas (opcional)"
                    value={notasPago}
                    onChange={(e) => setNotasPago(e.target.value)}
                    placeholder="Ej: Pago en efectivo, billete de $1000"
                  />
                </Grid>
              </Grid>

              {/* Preview de asignación */}
              {montoRecibido && parseFloat(montoRecibido) > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" fontWeight="bold">
                      Vista previa de la asignación:
                    </Typography>
                    {modoAsignacion === 'automatico' ? (
                      previewAsignacion.length > 0 ? (
                        <List dense>
                          {previewAsignacion.map(g => (
                            <ListItem key={g.id}>
                              <ListItemText 
                                primary={`${g.tracking_number}: ${formatCurrency(g.monto_a_aplicar || 0)}`}
                                secondary={
                                  (g.monto_a_aplicar || 0) >= parseFloat(String(g.saldo_pendiente))
                                    ? '✅ Quedará PAGADO'
                                    : `📝 Quedará con saldo: ${formatCurrency(parseFloat(String(g.saldo_pendiente)) - (g.monto_a_aplicar || 0))}`
                                }
                              />
                            </ListItem>
                          ))}
                        </List>
                      ) : (
                        <Typography variant="body2">No hay guías pendientes para asignar</Typography>
                      )
                    ) : (
                      <Typography variant="body2">
                        Total a aplicar: {formatCurrency(sumaAplicacionesManual)} de {formatCurrency(parseFloat(montoRecibido))}
                        {sumaAplicacionesManual > parseFloat(montoRecibido) && (
                          <Chip label="⚠️ Excede el monto" color="error" size="small" sx={{ ml: 1 }} />
                        )}
                      </Typography>
                    )}
                  </Alert>
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: 'grey.50' }}>
          <Button onClick={() => setPagoDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleRegistrarPago}
            disabled={
              !clienteSeleccionado || 
              !montoRecibido || 
              parseFloat(montoRecibido) <= 0 ||
              procesandoPago ||
              (modoAsignacion === 'manual' && sumaAplicacionesManual > parseFloat(montoRecibido))
            }
            startIcon={procesandoPago ? <CircularProgress size={20} /> : <MoneyIcon />}
          >
            {procesandoPago ? 'Procesando...' : `Registrar Pago de ${montoRecibido ? formatCurrency(parseFloat(montoRecibido)) : '$0'}`}
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
