// ============================================
// TESORERÍA SUCURSAL PAGE
// Sistema de caja chica independiente por sucursal
// Con billeteras, categorías, movimientos y cortes de caja
// ============================================

import React, { useState, useEffect, useRef } from 'react';
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
  Tabs,
  Tab,
  Avatar,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Add as AddIcon,
  SwapHoriz as TransferIcon,
  AccountBalance as AccountBalanceIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  LocalAtm as LocalAtmIcon,
  Assignment as AssignmentIcon,
  Close as CloseIcon,
  MonetizationOn as MoneyIcon,
  CameraAlt as CameraIcon,
  CheckCircle as CheckIcon,
  ContentCut as CutIcon,
  Wallet as WalletIcon,
  AccountBalanceWallet as WalletFilledIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  PieChart as PieChartIcon,
  Store as StoreIcon,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import api from '../services/api';

// Interfaces
interface Billetera {
  id: number;
  sucursal_id: number;
  nombre: string;
  tipo: string;
  saldo_actual: number;
  tipo_moneda: string;
  icono: string;
  color: string;
  is_default: boolean;
  total_movimientos: number;
}

interface Categoria {
  id: number;
  tipo: 'ingreso' | 'egreso';
  nombre: string;
  descripcion: string;
  icono: string;
  color: string;
  is_system: boolean;
}

interface Movimiento {
  id: number;
  sucursal_id: number;
  billetera_id: number;
  billetera_nombre: string;
  billetera_tipo: string;
  categoria_id: number;
  categoria_nombre: string;
  categoria_color: string;
  categoria_icono: string;
  tipo_movimiento: 'ingreso' | 'egreso' | 'transferencia_entrada' | 'transferencia_salida';
  monto: number;
  monto_antes: number;
  monto_despues: number;
  nota_descriptiva: string;
  referencia: string;
  evidencia_url: string;
  evidencia_url_2: string;
  evidencia_url_3: string;
  billetera_destino_nombre: string;
  usuario_nombre: string;
  status: string;
  created_at: string;
}

interface Corte {
  id: number;
  sucursal_id: number;
  sucursal_nombre: string;
  billetera_id: number;
  billetera_nombre: string;
  usuario_nombre: string;
  fecha_apertura: string;
  fecha_cierre: string;
  saldo_inicial_calculado: number;
  total_ingresos: number;
  total_egresos: number;
  saldo_final_esperado: number;
  saldo_final_declarado: number;
  diferencia: number;
  estatus: string;
  notas_cierre: string;
  conteo_billetes_1000: number;
  conteo_billetes_500: number;
  conteo_billetes_200: number;
  conteo_billetes_100: number;
  conteo_billetes_50: number;
  conteo_billetes_20: number;
  conteo_monedas_20: number;
  conteo_monedas_10: number;
  conteo_monedas_5: number;
  conteo_monedas_2: number;
  conteo_monedas_1: number;
  conteo_monedas_050: number;
}

interface DashboardData {
  billeteras: Billetera[];
  saldo_total: number;
  hoy: {
    ingresos: number;
    egresos: number;
    transacciones: number;
  };
  mes: {
    ingresos: number;
    egresos: number;
  };
  gastos_por_categoria: Array<{ id: number; nombre: string; color: string; total: number }>;
  ingresos_por_categoria: Array<{ id: number; nombre: string; color: string; total: number }>;
  ultimo_corte: Corte | null;
  corte_abierto: Corte | null;
}

interface Branch {
  id: number;
  name: string;
  code: string;
}

interface PagoPendiente {
  id: number;
  referencia: string;
  monto: number;
  concepto: string;
  created_at: string;
  tipo_servicio: string;
  payment_method: string;
  cliente: string;
  cliente_email: string;
  telefono: string;
  empresa: string;
  banco: string;
  clabe: string;
}

const TesoreriaSucursalPage: React.FC = () => {
  // Estados principales
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<number | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cortes, setCortes] = useState<Corte[]>([]);
  const [pagosPendientes, setPagosPendientes] = useState<PagoPendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmandoPago, setConfirmandoPago] = useState<number | null>(null);
  const [tabValue, setTabValue] = useState(0);
  
  // Estados para diálogos
  const [movimientoDialogOpen, setMovimientoDialogOpen] = useState(false);
  const [tipoMovimiento, setTipoMovimiento] = useState<'ingreso' | 'egreso' | 'transferencia'>('ingreso');
  const [transferenciaDialogOpen, setTransferenciaDialogOpen] = useState(false);
  const [corteCierreDialogOpen, setCorteCierreDialogOpen] = useState(false);
  const [billeteraDialogOpen, setBilleteraDialogOpen] = useState(false);
  const [evidenciaDialogOpen, setEvidenciaDialogOpen] = useState(false);
  const [evidenciaUrl, setEvidenciaUrl] = useState('');
  
  // 💳 Estado para modal de detalles de pago
  const [detallesPagoDialogOpen, setDetallesPagoDialogOpen] = useState(false);
  const [detallesPago, setDetallesPago] = useState<any>(null);
  const [loadingDetalles, setLoadingDetalles] = useState(false);
  
  // Estados para formularios
  const [movimientoForm, setMovimientoForm] = useState({
    billetera_id: 0,
    categoria_id: 0,
    monto: '',
    nota_descriptiva: '',
    referencia: '',
    evidencia_url: '',
  });
  
  const [transferenciaForm, setTransferenciaForm] = useState({
    billetera_origen_id: 0,
    billetera_destino_id: 0,
    monto: '',
    nota_descriptiva: '',
  });
  
  const [corteForm, setCorteForm] = useState({
    saldo_declarado: '',
    notas_cierre: '',
    conteo_billetes: {
      b1000: 0, b500: 0, b200: 0, b100: 0, b50: 0, b20: 0,
      m20: 0, m10: 0, m5: 0, m2: 0, m1: 0, m050: 0,
    },
  });
  
  const [nuevaBilleteraForm, setNuevaBilleteraForm] = useState({
    nombre: '',
    tipo: 'efectivo',
    saldo_inicial: '',
    cuenta_referencia: '',
  });
  
  // Estado para upload de evidencia
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'warning' });

  // Cargar sucursales al inicio
  useEffect(() => {
    loadBranches();
    loadCategorias();
  }, []);

  // Cargar datos cuando cambia la sucursal
  useEffect(() => {
    if (selectedBranch) {
      loadDashboard();
      loadMovimientos();
      loadCortes();
      loadPagosPendientes();
    }
  }, [selectedBranch]);

  const loadBranches = async () => {
    try {
      const res = await api.get('/admin/branches');
      const branchList = res.data.branches || res.data || [];
      // Filtrar solo sucursales que reciben pagos
      const branchesConPagos = branchList.filter((b: any) => b.recibe_pagos !== false);
      setBranches(branchesConPagos);
      if (branchesConPagos.length > 0) {
        setSelectedBranch(branchesConPagos[0].id);
      }
    } catch (err) {
      console.error('Error loading branches:', err);
    }
  };

  const loadCategorias = async () => {
    try {
      const res = await api.get('/tesoreria/categorias');
      setCategorias(res.data);
    } catch (err) {
      console.error('Error loading categorias:', err);
    }
  };

  const loadDashboard = async () => {
    if (!selectedBranch) return;
    setLoading(true);
    try {
      const res = await api.get(`/tesoreria/sucursal/${selectedBranch}/dashboard`);
      setDashboard(res.data);
    } catch (err) {
      console.error('Error loading dashboard:', err);
      setSnackbar({ open: true, message: 'Error al cargar dashboard', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const loadMovimientos = async () => {
    if (!selectedBranch) return;
    try {
      const res = await api.get(`/tesoreria/sucursal/${selectedBranch}/movimientos`);
      setMovimientos(res.data.movimientos || []);
    } catch (err) {
      console.error('Error loading movimientos:', err);
    }
  };

  const loadCortes = async () => {
    if (!selectedBranch) return;
    try {
      const res = await api.get(`/tesoreria/sucursal/${selectedBranch}/cortes`);
      setCortes(res.data || []);
    } catch (err) {
      console.error('Error loading cortes:', err);
    }
  };

  // Cargar pagos pendientes por confirmar (filtrados por sucursal)
  const loadPagosPendientes = async () => {
    if (!selectedBranch) return;
    try {
      const res = await api.get(`/admin/finance/pending-payments?branch_id=${selectedBranch}`);
      setPagosPendientes(res.data.pending_payments || []);
    } catch (err) {
      console.error('Error loading pagos pendientes:', err);
    }
  };

  // Confirmar pago pendiente
  const handleConfirmarPago = async (pago: PagoPendiente) => {
    if (!selectedBranch || !dashboard?.billeteras.length) {
      setSnackbar({ open: true, message: 'Selecciona una sucursal primero', severity: 'warning' });
      return;
    }
    
    setConfirmandoPago(pago.id);
    try {
      // Confirmar el pago en el sistema
      await api.post('/admin/finance/confirm-payment', {
        webhook_log_id: pago.id,
        notas: `Confirmado en Tesorería - Sucursal ${branches.find(b => b.id === selectedBranch)?.name}`
      });
      
      // Registrar como ingreso en tesorería
      const billeteraEfectivo = dashboard.billeteras.find(b => b.tipo === 'efectivo') || dashboard.billeteras[0];
      const categoriaIngresoCliente = categorias.find(c => c.tipo === 'ingreso' && c.nombre.toLowerCase().includes('pago')) ||
                                       categorias.find(c => c.tipo === 'ingreso');
      
      if (billeteraEfectivo && categoriaIngresoCliente) {
        await api.post(`/tesoreria/sucursal/${selectedBranch}/movimientos`, {
          billetera_id: billeteraEfectivo.id,
          categoria_id: categoriaIngresoCliente.id,
          tipo_movimiento: 'ingreso',
          monto: pago.monto,
          nota_descriptiva: `Pago cliente: ${pago.cliente} - ${pago.concepto}`,
          referencia: pago.referencia,
        });
      }
      
      setSnackbar({ open: true, message: `Pago de ${pago.cliente} confirmado exitosamente`, severity: 'success' });
      
      // Recargar datos
      loadPagosPendientes();
      loadDashboard();
      loadMovimientos();
    } catch (err: any) {
      console.error('Error confirmando pago:', err);
      setSnackbar({ open: true, message: err.response?.data?.error || 'Error al confirmar pago', severity: 'error' });
    } finally {
      setConfirmandoPago(null);
    }
  };

  // 💳 Ver detalles de un pago (guías incluidas)
  const handleVerDetallesPago = async (pago: PagoPendiente) => {
    setLoadingDetalles(true);
    setDetallesPagoDialogOpen(true);
    try {
      const res = await api.get(`/admin/finance/payment-details/${pago.referencia}`);
      setDetallesPago(res.data);
    } catch (err: any) {
      console.error('Error loading payment details:', err);
      setSnackbar({ open: true, message: 'Error al cargar detalles del pago', severity: 'error' });
      setDetallesPagoDialogOpen(false);
    } finally {
      setLoadingDetalles(false);
    }
  };

  // Formatear moneda
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  // Abrir diálogo de movimiento
  const handleOpenMovimientoDialog = (tipo: 'ingreso' | 'egreso') => {
    setTipoMovimiento(tipo);
    setMovimientoForm({
      billetera_id: dashboard?.billeteras.find(b => b.is_default)?.id || dashboard?.billeteras[0]?.id || 0,
      categoria_id: 0,
      monto: '',
      nota_descriptiva: '',
      referencia: '',
      evidencia_url: '',
    });
    setMovimientoDialogOpen(true);
  };

  // Subir evidencia
  const handleUploadEvidence = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingEvidence(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/uploads/evidence', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMovimientoForm(prev => ({ ...prev, evidencia_url: res.data.url }));
      setSnackbar({ open: true, message: 'Evidencia subida correctamente', severity: 'success' });
    } catch (err) {
      console.error('Error uploading evidence:', err);
      setSnackbar({ open: true, message: 'Error al subir evidencia', severity: 'error' });
    } finally {
      setUploadingEvidence(false);
    }
  };

  // Guardar movimiento
  const handleSaveMovimiento = async () => {
    if (!movimientoForm.billetera_id || !movimientoForm.monto || parseFloat(movimientoForm.monto) <= 0) {
      setSnackbar({ open: true, message: 'Ingresa un monto válido', severity: 'error' });
      return;
    }

    if (tipoMovimiento === 'egreso' && !movimientoForm.evidencia_url) {
      setSnackbar({ open: true, message: '📷 Debes adjuntar evidencia (foto del ticket) para registrar un gasto', severity: 'error' });
      return;
    }

    try {
      await api.post('/tesoreria/movimiento', {
        sucursal_id: selectedBranch,
        billetera_id: movimientoForm.billetera_id,
        categoria_id: movimientoForm.categoria_id || null,
        tipo_movimiento: tipoMovimiento,
        monto: parseFloat(movimientoForm.monto),
        nota_descriptiva: movimientoForm.nota_descriptiva,
        referencia: movimientoForm.referencia,
        evidencia_url: movimientoForm.evidencia_url,
      });

      setSnackbar({ 
        open: true, 
        message: tipoMovimiento === 'ingreso' ? '✅ Ingreso registrado' : '✅ Gasto registrado', 
        severity: 'success' 
      });
      setMovimientoDialogOpen(false);
      loadDashboard();
      loadMovimientos();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      console.error('Error saving movimiento:', err);
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.message || 'Error al guardar movimiento', 
        severity: 'error' 
      });
    }
  };

  // Guardar transferencia
  const handleSaveTransferencia = async () => {
    if (!transferenciaForm.billetera_origen_id || !transferenciaForm.billetera_destino_id || 
        !transferenciaForm.monto || parseFloat(transferenciaForm.monto) <= 0) {
      setSnackbar({ open: true, message: 'Completa todos los campos', severity: 'error' });
      return;
    }

    try {
      await api.post('/tesoreria/transferencia', {
        sucursal_id: selectedBranch,
        billetera_origen_id: transferenciaForm.billetera_origen_id,
        billetera_destino_id: transferenciaForm.billetera_destino_id,
        monto: parseFloat(transferenciaForm.monto),
        nota_descriptiva: transferenciaForm.nota_descriptiva,
      });

      setSnackbar({ open: true, message: '✅ Transferencia realizada', severity: 'success' });
      setTransferenciaDialogOpen(false);
      loadDashboard();
      loadMovimientos();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      console.error('Error saving transferencia:', err);
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.message || 'Error al realizar transferencia', 
        severity: 'error' 
      });
    }
  };

  // Abrir corte de caja
  const handleAbrirCorte = async () => {
    if (!selectedBranch || !dashboard?.billeteras.length) return;

    try {
      await api.post('/tesoreria/corte/abrir', {
        sucursal_id: selectedBranch,
        billetera_id: dashboard.billeteras.find(b => b.is_default)?.id || dashboard.billeteras[0].id,
      });

      setSnackbar({ open: true, message: '✅ Corte de caja abierto', severity: 'success' });
      loadDashboard();
      loadCortes();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      console.error('Error abriendo corte:', err);
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.message || 'Error al abrir corte', 
        severity: 'error' 
      });
    }
  };

  // Cerrar corte de caja
  const handleCerrarCorte = async () => {
    if (!dashboard?.corte_abierto || !corteForm.saldo_declarado) {
      setSnackbar({ open: true, message: 'Ingresa el saldo declarado', severity: 'error' });
      return;
    }

    try {
      const res = await api.post('/tesoreria/corte/cerrar', {
        corte_id: dashboard.corte_abierto.id,
        saldo_declarado: parseFloat(corteForm.saldo_declarado),
        conteo_billetes: corteForm.conteo_billetes,
        notas_cierre: corteForm.notas_cierre,
      });

      const resumen = res.data.resumen;
      let message = '✅ Corte cerrado correctamente';
      let severity: 'success' | 'warning' = 'success';

      if (resumen.diferencia !== 0) {
        const tipo = resumen.tipo_diferencia;
        const diff = Math.abs(resumen.diferencia);
        message = `⚠️ Corte cerrado con ${tipo}: ${formatCurrency(diff)}`;
        severity = 'warning';
      }

      setSnackbar({ open: true, message, severity });
      setCorteCierreDialogOpen(false);
      setCorteForm({ saldo_declarado: '', notas_cierre: '', conteo_billetes: { b1000: 0, b500: 0, b200: 0, b100: 0, b50: 0, b20: 0, m20: 0, m10: 0, m5: 0, m2: 0, m1: 0, m050: 0 } });
      loadDashboard();
      loadCortes();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      console.error('Error cerrando corte:', err);
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.message || 'Error al cerrar corte', 
        severity: 'error' 
      });
    }
  };

  // Calcular total del conteo de billetes
  const calcularTotalConteo = () => {
    const c = corteForm.conteo_billetes;
    return (
      c.b1000 * 1000 + c.b500 * 500 + c.b200 * 200 + c.b100 * 100 + c.b50 * 50 + c.b20 * 20 +
      c.m20 * 20 + c.m10 * 10 + c.m5 * 5 + c.m2 * 2 + c.m1 * 1 + c.m050 * 0.5
    );
  };

  // Crear nueva billetera
  const handleCreateBilletera = async () => {
    if (!nuevaBilleteraForm.nombre) {
      setSnackbar({ open: true, message: 'Ingresa un nombre para la billetera', severity: 'error' });
      return;
    }

    try {
      await api.post('/tesoreria/billetera', {
        sucursal_id: selectedBranch,
        nombre: nuevaBilleteraForm.nombre,
        tipo: nuevaBilleteraForm.tipo,
        saldo_inicial: parseFloat(nuevaBilleteraForm.saldo_inicial) || 0,
        cuenta_referencia: nuevaBilleteraForm.cuenta_referencia,
      });

      setSnackbar({ open: true, message: '✅ Billetera creada', severity: 'success' });
      setBilleteraDialogOpen(false);
      setNuevaBilleteraForm({ nombre: '', tipo: 'efectivo', saldo_inicial: '', cuenta_referencia: '' });
      loadDashboard();
    } catch (err) {
      console.error('Error creating billetera:', err);
      setSnackbar({ open: true, message: 'Error al crear billetera', severity: 'error' });
    }
  };

  // Colores para las gráficas
  const COLORS = ['#F05A28', '#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#E91E63', '#00BCD4', '#795548'];

  // Renderizar gráfica de pastel
  const renderPieChart = (data: Array<{ nombre: string; total: number; color: string }>) => {
    if (!data || data.length === 0) {
      return (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <PieChartIcon sx={{ fontSize: 48, color: '#ccc' }} />
          <Typography color="textSecondary">Sin datos este mes</Typography>
        </Box>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={80}
            paddingAngle={2}
            dataKey="total"
            nameKey="nombre"
            label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <RechartsTooltip formatter={(value) => formatCurrency(Number(value) || 0)} />
        </PieChart>
      </ResponsiveContainer>
    );
  };

  // Obtener icono según tipo de billetera
  const getBilleteraIcon = (tipo: string) => {
    switch (tipo) {
      case 'efectivo': return <LocalAtmIcon />;
      case 'spei': return <AccountBalanceIcon />;
      case 'paypal': return <WalletIcon />;
      case 'banco': return <AccountBalanceIcon />;
      case 'tarjeta': return <MoneyIcon />;
      default: return <WalletFilledIcon />;
    }
  };

  // Obtener color según tipo de movimiento
  const getMovimientoColor = (tipo: string) => {
    switch (tipo) {
      case 'ingreso':
      case 'transferencia_entrada':
        return '#4CAF50';
      case 'egreso':
      case 'transferencia_salida':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  };

  // Obtener icono según tipo de movimiento
  const getMovimientoIcon = (tipo: string) => {
    switch (tipo) {
      case 'ingreso': return <TrendingUpIcon sx={{ color: '#4CAF50' }} />;
      case 'egreso': return <TrendingDownIcon sx={{ color: '#F44336' }} />;
      case 'transferencia_entrada': return <TransferIcon sx={{ color: '#2196F3' }} />;
      case 'transferencia_salida': return <TransferIcon sx={{ color: '#FF9800' }} />;
      default: return <MoneyIcon />;
    }
  };

  if (loading && !dashboard) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{ bgcolor: '#F05A28', width: 48, height: 48 }}>
            <WalletFilledIcon />
          </Avatar>
          <Box>
            <Typography variant="h5" fontWeight="bold">Tesorería Sucursal</Typography>
            <Typography variant="body2" color="textSecondary">
              Gestión de caja chica, ingresos, gastos y cortes
            </Typography>
          </Box>
        </Box>
        
        {/* Selector de sucursal */}
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Sucursal</InputLabel>
          <Select
            value={selectedBranch || ''}
            label="Sucursal"
            onChange={(e) => setSelectedBranch(Number(e.target.value))}
          >
            {branches.map((branch) => (
              <MenuItem key={branch.id} value={branch.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <StoreIcon fontSize="small" />
                  {branch.name}
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Botones de Acción Rápida */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Button
          variant="contained"
          color="success"
          startIcon={<TrendingUpIcon />}
          onClick={() => handleOpenMovimientoDialog('ingreso')}
        >
          Registrar Ingreso
        </Button>
        <Button
          variant="contained"
          color="error"
          startIcon={<TrendingDownIcon />}
          onClick={() => handleOpenMovimientoDialog('egreso')}
        >
          Registrar Gasto
        </Button>
        <Button
          variant="outlined"
          startIcon={<TransferIcon />}
          onClick={() => {
            setTransferenciaForm({
              billetera_origen_id: dashboard?.billeteras[0]?.id || 0,
              billetera_destino_id: 0,
              monto: '',
              nota_descriptiva: '',
            });
            setTransferenciaDialogOpen(true);
          }}
          disabled={!dashboard?.billeteras || dashboard.billeteras.length < 2}
        >
          Transferencia
        </Button>
        
        {/* Botón de Corte de Caja */}
        {dashboard?.corte_abierto ? (
          <Button
            variant="contained"
            sx={{ bgcolor: '#FF9800', '&:hover': { bgcolor: '#F57C00' } }}
            startIcon={<CutIcon />}
            onClick={() => setCorteCierreDialogOpen(true)}
          >
            Cerrar Corte
          </Button>
        ) : (
          <Button
            variant="outlined"
            startIcon={<AssignmentIcon />}
            onClick={handleAbrirCorte}
          >
            Abrir Corte
          </Button>
        )}
        
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setBilleteraDialogOpen(true)}
        >
          Nueva Billetera
        </Button>
        
        <IconButton onClick={() => { loadDashboard(); loadMovimientos(); }}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Dashboard Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Saldo Total */}
        <Grid size={{ xs: 12, md: 3 }}>
          <Card sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>Saldo Total</Typography>
              <Typography variant="h4" fontWeight="bold">
                {formatCurrency(dashboard?.saldo_total || 0)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                {dashboard?.billeteras.length || 0} billetera(s)
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Ingresos Hoy */}
        <Grid size={{ xs: 12, md: 3 }}>
          <Card sx={{ background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', color: 'white' }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>Ingresos Hoy</Typography>
              <Typography variant="h4" fontWeight="bold">
                {formatCurrency(dashboard?.hoy.ingresos || 0)}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <TrendingUpIcon fontSize="small" />
                <Typography variant="caption">
                  {dashboard?.hoy.transacciones || 0} transacciones
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Egresos Hoy */}
        <Grid size={{ xs: 12, md: 3 }}>
          <Card sx={{ background: 'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)', color: 'white' }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>Egresos Hoy</Typography>
              <Typography variant="h4" fontWeight="bold">
                {formatCurrency(dashboard?.hoy.egresos || 0)}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <TrendingDownIcon fontSize="small" />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Estado del Corte */}
        <Grid size={{ xs: 12, md: 3 }}>
          <Card sx={{ 
            background: dashboard?.corte_abierto 
              ? 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' 
              : 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            color: 'white'
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>Corte de Caja</Typography>
              <Typography variant="h6" fontWeight="bold">
                {dashboard?.corte_abierto ? '🔓 ABIERTO' : '🔒 CERRADO'}
              </Typography>
              {dashboard?.corte_abierto && (
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  Desde: {new Date(dashboard.corte_abierto.fecha_apertura).toLocaleString()}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Pagos Pendientes por Confirmar */}
      {pagosPendientes.length > 0 && (
        <Card sx={{ mb: 3, background: 'linear-gradient(135deg, #e65c00 0%, #f9d423 100%)' }}>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Box display="flex" alignItems="center" gap={1}>
                <Typography variant="h6" fontWeight="bold" color="white">
                  ⏳ 💳 Pagos Pendientes en Sucursal
                </Typography>
                <Chip 
                  label={`${pagosPendientes.length} pendiente${pagosPendientes.length > 1 ? 's' : ''}`} 
                  size="small" 
                  sx={{ bgcolor: 'white', color: '#e65c00', fontWeight: 'bold' }}
                />
              </Box>
              <Button 
                startIcon={<RefreshIcon />} 
                onClick={loadPagosPendientes}
                sx={{ color: 'white', borderColor: 'white' }}
                variant="outlined"
                size="small"
              >
                Actualizar
              </Button>
            </Box>
            
            <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                  <TableRow>
                    <TableCell><strong>REFERENCIA</strong></TableCell>
                    <TableCell><strong>CLIENTE</strong></TableCell>
                    <TableCell align="right"><strong>MONTO</strong></TableCell>
                    <TableCell><strong>SERVICIO</strong></TableCell>
                    <TableCell><strong>BANCO/CLABE</strong></TableCell>
                    <TableCell><strong>FECHA</strong></TableCell>
                    <TableCell align="center"><strong>ACCIONES</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pagosPendientes.map((pago) => (
                    <TableRow key={pago.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace" fontWeight="bold">
                          {pago.referencia}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight="medium">{pago.cliente}</Typography>
                          <Typography variant="caption" color="text.secondary">{pago.telefono}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body1" fontWeight="bold" color="success.main">
                          {formatCurrency(pago.monto)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={pago.tipo_servicio || 'PO Box USA'} 
                          size="small" 
                          color="primary" 
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2">{pago.banco || 'BBVA México'}</Typography>
                          <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                            {pago.clabe || ''}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {new Date(pago.created_at).toLocaleDateString()}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(pago.created_at).toLocaleTimeString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Box display="flex" gap={1} justifyContent="center">
                          <Button
                            variant="outlined"
                            color="info"
                            size="small"
                            startIcon={<ViewIcon />}
                            onClick={() => handleVerDetallesPago(pago)}
                          >
                            Ver
                          </Button>
                          <Button
                            variant="contained"
                            color="success"
                            size="small"
                            startIcon={confirmandoPago === pago.id ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
                            onClick={() => handleConfirmarPago(pago)}
                            disabled={confirmandoPago === pago.id}
                          >
                            {confirmandoPago === pago.id ? 'Confirmando...' : 'Confirmar'}
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Billeteras */}
      <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
        💰 Billeteras de la Sucursal
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {dashboard?.billeteras.map((billetera) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={billetera.id}>
            <Card 
              sx={{ 
                borderLeft: `4px solid ${billetera.color}`,
                '&:hover': { boxShadow: 4 }
              }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography variant="subtitle2" color="textSecondary">
                      {billetera.tipo.toUpperCase()}
                    </Typography>
                    <Typography variant="h6" fontWeight="bold">
                      {billetera.nombre}
                    </Typography>
                  </Box>
                  <Avatar sx={{ bgcolor: billetera.color, width: 36, height: 36 }}>
                    {getBilleteraIcon(billetera.tipo)}
                  </Avatar>
                </Box>
                <Typography variant="h5" fontWeight="bold" sx={{ mt: 1, color: billetera.color }}>
                  {formatCurrency(billetera.saldo_actual)}
                </Typography>
                {billetera.is_default && (
                  <Chip label="Principal" size="small" color="primary" sx={{ mt: 1 }} />
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Tabs: Movimientos / Gráficas / Historial Cortes */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="📋 Movimientos" />
          <Tab label="📊 Análisis" />
          <Tab label="📑 Historial de Cortes" />
        </Tabs>

        {/* Tab: Movimientos */}
        {tabValue === 0 && (
          <Box sx={{ p: 2 }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha</TableCell>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Billetera</TableCell>
                    <TableCell>Categoría</TableCell>
                    <TableCell>Descripción</TableCell>
                    <TableCell align="right">Monto</TableCell>
                    <TableCell>Registrado por</TableCell>
                    <TableCell>Evidencia</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {movimientos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center">
                        <Typography color="textSecondary" sx={{ py: 4 }}>
                          No hay movimientos registrados
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    movimientos.map((mov) => (
                      <TableRow key={mov.id} hover>
                        <TableCell>
                          {new Date(mov.created_at).toLocaleDateString('es-MX', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {getMovimientoIcon(mov.tipo_movimiento)}
                            <Chip 
                              label={mov.tipo_movimiento.replace('_', ' ')} 
                              size="small"
                              sx={{ 
                                bgcolor: `${getMovimientoColor(mov.tipo_movimiento)}20`,
                                color: getMovimientoColor(mov.tipo_movimiento),
                                fontWeight: 'bold',
                              }}
                            />
                          </Box>
                        </TableCell>
                        <TableCell>{mov.billetera_nombre}</TableCell>
                        <TableCell>
                          {mov.categoria_nombre && (
                            <Chip 
                              label={mov.categoria_nombre} 
                              size="small" 
                              sx={{ bgcolor: `${mov.categoria_color}20`, color: mov.categoria_color }}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {mov.nota_descriptiva || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography 
                            fontWeight="bold" 
                            color={mov.tipo_movimiento.includes('ingreso') || mov.tipo_movimiento === 'transferencia_entrada' ? 'success.main' : 'error.main'}
                          >
                            {mov.tipo_movimiento.includes('ingreso') || mov.tipo_movimiento === 'transferencia_entrada' ? '+' : '-'}
                            {formatCurrency(mov.monto)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">{mov.usuario_nombre}</Typography>
                        </TableCell>
                        <TableCell>
                          {mov.evidencia_url ? (
                            <IconButton 
                              size="small" 
                              onClick={() => { setEvidenciaUrl(mov.evidencia_url); setEvidenciaDialogOpen(true); }}
                            >
                              <ViewIcon color="primary" />
                            </IconButton>
                          ) : (
                            <Typography variant="caption" color="textSecondary">-</Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Tab: Análisis/Gráficas */}
        {tabValue === 1 && (
          <Box sx={{ p: 2 }}>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                      📉 Distribución de Gastos (Este Mes)
                    </Typography>
                    {renderPieChart(dashboard?.gastos_por_categoria || [])}
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                      📈 Distribución de Ingresos (Este Mes)
                    </Typography>
                    {renderPieChart(dashboard?.ingresos_por_categoria || [])}
                  </CardContent>
                </Card>
              </Grid>
              
              {/* Resumen del Mes */}
              <Grid size={{ xs: 12 }}>
                <Card sx={{ background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' }}>
                  <CardContent>
                    <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                      📊 Resumen del Mes
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 4 }}>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography variant="body2" color="textSecondary">Total Ingresos</Typography>
                          <Typography variant="h5" fontWeight="bold" color="success.main">
                            {formatCurrency(dashboard?.mes.ingresos || 0)}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid size={{ xs: 4 }}>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography variant="body2" color="textSecondary">Total Egresos</Typography>
                          <Typography variant="h5" fontWeight="bold" color="error.main">
                            {formatCurrency(dashboard?.mes.egresos || 0)}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid size={{ xs: 4 }}>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography variant="body2" color="textSecondary">Balance</Typography>
                          <Typography 
                            variant="h5" 
                            fontWeight="bold" 
                            color={(dashboard?.mes.ingresos || 0) - (dashboard?.mes.egresos || 0) >= 0 ? 'success.main' : 'error.main'}
                          >
                            {formatCurrency((dashboard?.mes.ingresos || 0) - (dashboard?.mes.egresos || 0))}
                          </Typography>
                        </Box>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Tab: Historial de Cortes */}
        {tabValue === 2 && (
          <Box sx={{ p: 2 }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha</TableCell>
                    <TableCell>Billetera</TableCell>
                    <TableCell>Cajero</TableCell>
                    <TableCell align="right">Saldo Inicial</TableCell>
                    <TableCell align="right">Ingresos</TableCell>
                    <TableCell align="right">Egresos</TableCell>
                    <TableCell align="right">Esperado</TableCell>
                    <TableCell align="right">Declarado</TableCell>
                    <TableCell align="right">Diferencia</TableCell>
                    <TableCell>Estado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cortes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} align="center">
                        <Typography color="textSecondary" sx={{ py: 4 }}>
                          No hay cortes registrados
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    cortes.map((corte) => (
                      <TableRow key={corte.id} hover>
                        <TableCell>
                          <Typography variant="body2">
                            {new Date(corte.fecha_apertura).toLocaleDateString('es-MX')}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {new Date(corte.fecha_apertura).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                            {corte.fecha_cierre && ` - ${new Date(corte.fecha_cierre).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`}
                          </Typography>
                        </TableCell>
                        <TableCell>{corte.billetera_nombre}</TableCell>
                        <TableCell>{corte.usuario_nombre}</TableCell>
                        <TableCell align="right">{formatCurrency(corte.saldo_inicial_calculado)}</TableCell>
                        <TableCell align="right" sx={{ color: 'success.main' }}>
                          +{formatCurrency(corte.total_ingresos)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: 'error.main' }}>
                          -{formatCurrency(corte.total_egresos)}
                        </TableCell>
                        <TableCell align="right">{formatCurrency(corte.saldo_final_esperado)}</TableCell>
                        <TableCell align="right">{formatCurrency(corte.saldo_final_declarado)}</TableCell>
                        <TableCell align="right">
                          <Typography 
                            fontWeight="bold" 
                            color={corte.diferencia === 0 ? 'success.main' : corte.diferencia > 0 ? 'warning.main' : 'error.main'}
                          >
                            {corte.diferencia > 0 ? '+' : ''}{formatCurrency(corte.diferencia)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={corte.estatus}
                            size="small"
                            color={
                              corte.estatus === 'cerrado' ? 'success' :
                              corte.estatus === 'abierto' ? 'primary' :
                              corte.estatus === 'con_discrepancia' ? 'warning' : 'default'
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Paper>

      {/* Dialog: Registrar Movimiento */}
      <Dialog open={movimientoDialogOpen} onClose={() => setMovimientoDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ 
          bgcolor: tipoMovimiento === 'ingreso' ? 'success.main' : 'error.main', 
          color: 'white' 
        }}>
          {tipoMovimiento === 'ingreso' ? '💰 Registrar Ingreso' : '💸 Registrar Gasto'}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12 }}>
              <FormControl fullWidth>
                <InputLabel>Billetera</InputLabel>
                <Select
                  value={movimientoForm.billetera_id}
                  label="Billetera"
                  onChange={(e) => setMovimientoForm({ ...movimientoForm, billetera_id: Number(e.target.value) })}
                >
                  {dashboard?.billeteras.map((b) => (
                    <MenuItem key={b.id} value={b.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getBilleteraIcon(b.tipo)}
                        {b.nombre} ({formatCurrency(b.saldo_actual)})
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid size={{ xs: 12 }}>
              <FormControl fullWidth>
                <InputLabel>Categoría</InputLabel>
                <Select
                  value={movimientoForm.categoria_id}
                  label="Categoría"
                  onChange={(e) => setMovimientoForm({ ...movimientoForm, categoria_id: Number(e.target.value) })}
                >
                  <MenuItem value={0}>-- Sin categoría --</MenuItem>
                  {categorias
                    .filter(c => c.tipo === tipoMovimiento)
                    .map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: c.color }} />
                          {c.nombre}
                        </Box>
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Monto"
                type="number"
                value={movimientoForm.monto}
                onChange={(e) => setMovimientoForm({ ...movimientoForm, monto: e.target.value })}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
              />
            </Grid>
            
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Descripción / Nota"
                multiline
                rows={2}
                value={movimientoForm.nota_descriptiva}
                onChange={(e) => setMovimientoForm({ ...movimientoForm, nota_descriptiva: e.target.value })}
                placeholder={tipoMovimiento === 'egreso' ? "Ej: Compra de 5 rollos de cinta canela en Office Depot" : "Descripción del ingreso"}
              />
            </Grid>
            
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Referencia (Factura/Recibo)"
                value={movimientoForm.referencia}
                onChange={(e) => setMovimientoForm({ ...movimientoForm, referencia: e.target.value })}
              />
            </Grid>
            
            {/* Evidencia obligatoria para egresos */}
            {tipoMovimiento === 'egreso' && (
              <Grid size={{ xs: 12 }}>
                <Alert severity="warning" sx={{ mb: 2 }}>
                  📷 <strong>Evidencia obligatoria:</strong> Debes adjuntar foto del ticket o factura
                </Alert>
                
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleUploadEvidence}
                />
                
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <Button
                    variant="outlined"
                    startIcon={uploadingEvidence ? <CircularProgress size={20} /> : <CameraIcon />}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingEvidence}
                  >
                    {uploadingEvidence ? 'Subiendo...' : 'Tomar Foto / Subir'}
                  </Button>
                  
                  {movimientoForm.evidencia_url && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CheckIcon color="success" />
                      <Typography variant="body2" color="success.main">
                        Evidencia adjunta
                      </Typography>
                      <IconButton 
                        size="small" 
                        onClick={() => { setEvidenciaUrl(movimientoForm.evidencia_url); setEvidenciaDialogOpen(true); }}
                      >
                        <ViewIcon />
                      </IconButton>
                    </Box>
                  )}
                </Box>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMovimientoDialogOpen(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleSaveMovimiento}
            color={tipoMovimiento === 'ingreso' ? 'success' : 'error'}
            disabled={tipoMovimiento === 'egreso' && !movimientoForm.evidencia_url}
          >
            {tipoMovimiento === 'ingreso' ? 'Registrar Ingreso' : 'Registrar Gasto'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Transferencia */}
      <Dialog open={transferenciaDialogOpen} onClose={() => setTransferenciaDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#2196F3', color: 'white' }}>
          🔄 Transferencia entre Billeteras
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12 }}>
              <FormControl fullWidth>
                <InputLabel>Billetera Origen</InputLabel>
                <Select
                  value={transferenciaForm.billetera_origen_id}
                  label="Billetera Origen"
                  onChange={(e) => setTransferenciaForm({ ...transferenciaForm, billetera_origen_id: Number(e.target.value) })}
                >
                  {dashboard?.billeteras.map((b) => (
                    <MenuItem key={b.id} value={b.id} disabled={b.id === transferenciaForm.billetera_destino_id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getBilleteraIcon(b.tipo)}
                        {b.nombre} ({formatCurrency(b.saldo_actual)})
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid size={{ xs: 12 }} sx={{ textAlign: 'center' }}>
              <TransferIcon sx={{ fontSize: 40, color: '#2196F3' }} />
            </Grid>
            
            <Grid size={{ xs: 12 }}>
              <FormControl fullWidth>
                <InputLabel>Billetera Destino</InputLabel>
                <Select
                  value={transferenciaForm.billetera_destino_id}
                  label="Billetera Destino"
                  onChange={(e) => setTransferenciaForm({ ...transferenciaForm, billetera_destino_id: Number(e.target.value) })}
                >
                  {dashboard?.billeteras.map((b) => (
                    <MenuItem key={b.id} value={b.id} disabled={b.id === transferenciaForm.billetera_origen_id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getBilleteraIcon(b.tipo)}
                        {b.nombre} ({formatCurrency(b.saldo_actual)})
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Monto a Transferir"
                type="number"
                value={transferenciaForm.monto}
                onChange={(e) => setTransferenciaForm({ ...transferenciaForm, monto: e.target.value })}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
              />
            </Grid>
            
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Nota (opcional)"
                value={transferenciaForm.nota_descriptiva}
                onChange={(e) => setTransferenciaForm({ ...transferenciaForm, nota_descriptiva: e.target.value })}
                placeholder="Ej: Depósito bancario, retiro para fondo"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTransferenciaDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSaveTransferencia} sx={{ bgcolor: '#2196F3' }}>
            Realizar Transferencia
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Cerrar Corte de Caja (CIEGO) */}
      <Dialog open={corteCierreDialogOpen} onClose={() => setCorteCierreDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: '#FF9800', color: 'white' }}>
          📋 Cerrar Corte de Caja
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="info" sx={{ mb: 3 }}>
            <strong>Sistema de Cierre Ciego:</strong> Cuenta el dinero físico en caja y declara el total. 
            El sistema comparará automáticamente con el saldo esperado después de cerrar.
          </Alert>
          
          <Grid container spacing={3}>
            {/* Conteo de Billetes */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>💵 Billetes</Typography>
              <Grid container spacing={1}>
                {[
                  { key: 'b1000', label: '$1,000', value: 1000 },
                  { key: 'b500', label: '$500', value: 500 },
                  { key: 'b200', label: '$200', value: 200 },
                  { key: 'b100', label: '$100', value: 100 },
                  { key: 'b50', label: '$50', value: 50 },
                  { key: 'b20', label: '$20', value: 20 },
                ].map((bill) => (
                  <Grid size={{ xs: 6 }} key={bill.key}>
                    <TextField
                      fullWidth
                      size="small"
                      label={bill.label}
                      type="number"
                      value={corteForm.conteo_billetes[bill.key as keyof typeof corteForm.conteo_billetes]}
                      onChange={(e) => setCorteForm({
                        ...corteForm,
                        conteo_billetes: {
                          ...corteForm.conteo_billetes,
                          [bill.key]: parseInt(e.target.value) || 0
                        }
                      })}
                      InputProps={{ inputProps: { min: 0 } }}
                    />
                  </Grid>
                ))}
              </Grid>
            </Grid>
            
            {/* Conteo de Monedas */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>🪙 Monedas</Typography>
              <Grid container spacing={1}>
                {[
                  { key: 'm20', label: '$20', value: 20 },
                  { key: 'm10', label: '$10', value: 10 },
                  { key: 'm5', label: '$5', value: 5 },
                  { key: 'm2', label: '$2', value: 2 },
                  { key: 'm1', label: '$1', value: 1 },
                  { key: 'm050', label: '$0.50', value: 0.5 },
                ].map((coin) => (
                  <Grid size={{ xs: 6 }} key={coin.key}>
                    <TextField
                      fullWidth
                      size="small"
                      label={coin.label}
                      type="number"
                      value={corteForm.conteo_billetes[coin.key as keyof typeof corteForm.conteo_billetes]}
                      onChange={(e) => setCorteForm({
                        ...corteForm,
                        conteo_billetes: {
                          ...corteForm.conteo_billetes,
                          [coin.key]: parseInt(e.target.value) || 0
                        }
                      })}
                      InputProps={{ inputProps: { min: 0 } }}
                    />
                  </Grid>
                ))}
              </Grid>
            </Grid>
            
            {/* Total Calculado */}
            <Grid size={{ xs: 12 }}>
              <Card sx={{ bgcolor: '#f5f5f5' }}>
                <CardContent>
                  <Typography variant="body2" color="textSecondary">Total del Conteo</Typography>
                  <Typography variant="h4" fontWeight="bold" color="primary">
                    {formatCurrency(calcularTotalConteo())}
                  </Typography>
                  <Button 
                    size="small" 
                    onClick={() => setCorteForm({ ...corteForm, saldo_declarado: calcularTotalConteo().toString() })}
                    sx={{ mt: 1 }}
                  >
                    Usar este total
                  </Button>
                </CardContent>
              </Card>
            </Grid>
            
            {/* Saldo Declarado Manual */}
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Saldo Declarado (Total en caja)"
                type="number"
                value={corteForm.saldo_declarado}
                onChange={(e) => setCorteForm({ ...corteForm, saldo_declarado: e.target.value })}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
                helperText="Puedes ingresar el total manualmente o usar el conteo de arriba"
              />
            </Grid>
            
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Notas de Cierre (opcional)"
                multiline
                rows={2}
                value={corteForm.notas_cierre}
                onChange={(e) => setCorteForm({ ...corteForm, notas_cierre: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCorteCierreDialogOpen(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleCerrarCorte}
            sx={{ bgcolor: '#FF9800', '&:hover': { bgcolor: '#F57C00' } }}
            disabled={!corteForm.saldo_declarado}
          >
            Cerrar Corte
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Nueva Billetera */}
      <Dialog open={billeteraDialogOpen} onClose={() => setBilleteraDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>➕ Nueva Billetera</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Nombre de la Billetera"
                value={nuevaBilleteraForm.nombre}
                onChange={(e) => setNuevaBilleteraForm({ ...nuevaBilleteraForm, nombre: e.target.value })}
                placeholder="Ej: Caja Registradora 2, Cuenta BBVA"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControl fullWidth>
                <InputLabel>Tipo</InputLabel>
                <Select
                  value={nuevaBilleteraForm.tipo}
                  label="Tipo"
                  onChange={(e) => setNuevaBilleteraForm({ ...nuevaBilleteraForm, tipo: e.target.value })}
                >
                  <MenuItem value="efectivo">💵 Efectivo</MenuItem>
                  <MenuItem value="spei">🏦 SPEI / Banco</MenuItem>
                  <MenuItem value="paypal">💳 PayPal</MenuItem>
                  <MenuItem value="tarjeta">💳 Terminal de Tarjeta</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Saldo Inicial"
                type="number"
                value={nuevaBilleteraForm.saldo_inicial}
                onChange={(e) => setNuevaBilleteraForm({ ...nuevaBilleteraForm, saldo_inicial: e.target.value })}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Referencia (No. Cuenta, CLABE, etc.)"
                value={nuevaBilleteraForm.cuenta_referencia}
                onChange={(e) => setNuevaBilleteraForm({ ...nuevaBilleteraForm, cuenta_referencia: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBilleteraDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleCreateBilletera}>
            Crear Billetera
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Ver Evidencia */}
      <Dialog open={evidenciaDialogOpen} onClose={() => setEvidenciaDialogOpen(false)} maxWidth="md">
        <DialogTitle>
          📷 Evidencia
          <IconButton onClick={() => setEvidenciaDialogOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {evidenciaUrl && (
            <Box sx={{ textAlign: 'center' }}>
              <img 
                src={evidenciaUrl} 
                alt="Evidencia" 
                style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
              />
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* 💳 Dialog: Detalles de Pago con Guías */}
      <Dialog 
        open={detallesPagoDialogOpen} 
        onClose={() => { setDetallesPagoDialogOpen(false); setDetallesPago(null); }} 
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ background: 'linear-gradient(135deg, #e65c00 0%, #f9d423 100%)', color: 'white' }}>
          <Box display="flex" alignItems="center" gap={1}>
            <ViewIcon />
            <Typography variant="h6" fontWeight="bold">
              Detalles del Pago
            </Typography>
          </Box>
          <IconButton 
            onClick={() => { setDetallesPagoDialogOpen(false); setDetallesPago(null); }} 
            sx={{ position: 'absolute', right: 8, top: 8, color: 'white' }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {loadingDetalles ? (
            <Box display="flex" justifyContent="center" alignItems="center" py={4}>
              <CircularProgress />
              <Typography sx={{ ml: 2 }}>Cargando detalles...</Typography>
            </Box>
          ) : detallesPago ? (
            <Box>
              {/* Información del Pago */}
              <Paper sx={{ p: 2, mb: 3, bgcolor: '#f5f5f5' }}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="subtitle2" color="text.secondary">Referencia</Typography>
                    <Typography variant="h6" fontFamily="monospace" fontWeight="bold" color="primary">
                      {detallesPago.payment?.referencia}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="subtitle2" color="text.secondary">Monto Total</Typography>
                    <Typography variant="h5" fontWeight="bold" color="success.main">
                      {formatCurrency(detallesPago.payment?.monto || 0)}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Typography variant="subtitle2" color="text.secondary">Cliente</Typography>
                    <Typography variant="body1" fontWeight="medium">
                      {detallesPago.cliente?.nombre}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {detallesPago.cliente?.email}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Typography variant="subtitle2" color="text.secondary">Teléfono</Typography>
                    <Typography variant="body1">
                      {detallesPago.cliente?.telefono || 'No disponible'}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Typography variant="subtitle2" color="text.secondary">Método de Pago</Typography>
                    <Chip 
                      label={detallesPago.payment?.payment_method === 'cash' ? '💵 Efectivo' : '💳 Tarjeta'} 
                      color={detallesPago.payment?.payment_method === 'cash' ? 'warning' : 'primary'}
                      size="small"
                    />
                  </Grid>
                </Grid>
              </Paper>

              {/* Tabla de Guías */}
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                📦 Guías en este Pago ({detallesPago.total_guias || 0})
              </Typography>
              
              {detallesPago.guias && detallesPago.guias.length > 0 ? (
                <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#e65c00' }}>
                        <TableCell><strong>ID</strong></TableCell>
                        <TableCell><strong>Tracking Interno</strong></TableCell>
                        <TableCell><strong>Tracking Proveedor</strong></TableCell>
                        <TableCell><strong>Descripción</strong></TableCell>
                        <TableCell align="right"><strong>Peso (kg)</strong></TableCell>
                        <TableCell align="right"><strong>Costo</strong></TableCell>
                        <TableCell><strong>Status</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detallesPago.guias.map((guia: any) => (
                        <TableRow key={guia.id} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight="bold">
                              #{guia.id}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontFamily="monospace" color="primary">
                              {guia.tracking_interno}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontFamily="monospace" color="text.secondary">
                              {guia.tracking_proveedor || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ maxWidth: 200 }} noWrap title={guia.descripcion}>
                              {guia.descripcion}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {guia.peso ? guia.peso.toFixed(2) : '-'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight="bold" color="success.main">
                              {formatCurrency(guia.costo || 0)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={guia.status} 
                              size="small" 
                              color={guia.pagado ? 'success' : 'warning'}
                              variant="outlined"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Alert severity="info">
                  No se encontraron guías asociadas a este pago
                </Alert>
              )}

              {/* Resumen */}
              {detallesPago.guias && detallesPago.guias.length > 0 && (
                <Paper sx={{ p: 2, mt: 2, bgcolor: '#e8f5e9' }}>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 4 }}>
                      <Typography variant="subtitle2" color="text.secondary">Total Guías</Typography>
                      <Typography variant="h6" fontWeight="bold">{detallesPago.total_guias}</Typography>
                    </Grid>
                    <Grid size={{ xs: 4 }}>
                      <Typography variant="subtitle2" color="text.secondary">Peso Total</Typography>
                      <Typography variant="h6" fontWeight="bold">{detallesPago.total_peso?.toFixed(2)} kg</Typography>
                    </Grid>
                    <Grid size={{ xs: 4 }}>
                      <Typography variant="subtitle2" color="text.secondary">Costo Total</Typography>
                      <Typography variant="h6" fontWeight="bold" color="success.main">
                        {formatCurrency(detallesPago.total_costo || 0)}
                      </Typography>
                    </Grid>
                  </Grid>
                </Paper>
              )}
            </Box>
          ) : (
            <Alert severity="warning">No se pudieron cargar los detalles del pago</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDetallesPagoDialogOpen(false); setDetallesPago(null); }}>
            Cerrar
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
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default TesoreriaSucursalPage;
