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
  Checkbox,
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
  PictureAsPdf as PictureAsPdfIcon,
  ArrowBack as ArrowBackIcon,
  DeleteForever as DeleteForeverIcon,
  Edit as EditIcon,
  ListAlt as ListAltIcon,
  AddCircleOutline as AddCircleOutlineIcon,
  Delete as DeleteIcon,
  GridOn as GridOnIcon,
} from '@mui/icons-material';
import api from '../services/api';

interface CajaChicaStats {
  saldo_actual: number;
  ingresos_hoy: number;
  egresos_hoy: number;
  cantidad_transacciones_hoy: number;
  ultimo_corte: string | null;
  // Campos por moneda
  saldo_mxn: number;
  ingresos_hoy_mxn: number;
  egresos_hoy_mxn: number;
  transacciones_hoy_mxn: number;
  saldo_usd: number;
  ingresos_hoy_usd: number;
  egresos_hoy_usd: number;
  transacciones_hoy_usd: number;
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
  consolidaciones?: Array<{
    consolidation_id: number;
    supplier_name: string | null;
    package_count: number;
    total_mxn: number | string;
    total_usd: number | string;
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
  missing_count?: number;
  lost_count?: number;
  has_missing?: boolean;
  total_cost_mxn: number;
  total_cost_usd: number;
  pending_cost_mxn?: number;
  pending_cost_usd?: number;
  paid_cost_mxn?: number;
  paid_cost_usd?: number;
  all_cost_mxn?: number;
  all_cost_usd?: number;
  supplier_name: string;
  supplier_id: number;
  created_at: string;
  packages: Array<{
    id: number;
    tracking: string;
    description: string;
    weight: number;
    pkg_length?: number;
    pkg_width?: number;
    pkg_height?: number;
    pobox_service_cost: number;
    pobox_cost_usd: number;
    pobox_provider_cost_usd?: number;
    pobox_provider_cost_mxn?: number;
    registered_exchange_rate?: number;
    costing_paid: boolean;
    status?: string;
    missing_on_arrival?: boolean;
    is_lost?: boolean;
    is_master?: boolean;
    total_boxes?: number;
    client_name: string;
    client_box_id: string;
    created_at?: string;
    received_mty_at?: string | null;
  }>;
}

// Parser robusto para montos en es-MX. Maneja:
//   "1360"      → 1360
//   "1,360"     → 1360   (coma como separador de miles)
//   "1.360"     → 1360   (punto como separador de miles, 3 dígitos)
//   "1360.50"   → 1360.5 (punto como decimal)
//   "1,360.50"  → 1360.5
//   "1.360,50"  → 1360.5
// El bug original: type="number" con locale es convertía "1.360" a 1.36
// (parseFloat interpreta el punto como decimal).
const parseMontoEs = (raw: string): number => {
  if (!raw) return NaN;
  let t = String(raw).trim().replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!t) return NaN;
  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const decAt = Math.max(lastDot, lastComma);
    t = t.slice(0, decAt).replace(/[.,]/g, '') + '.' + t.slice(decAt + 1).replace(/[.,]/g, '');
  } else if (lastComma >= 0) {
    const after = t.slice(lastComma + 1);
    t = (after.length === 3 && (t.match(/,/g) || []).length === 1)
      ? t.replace(/,/g, '')
      : t.replace(/,/g, '.');
  } else if (lastDot >= 0) {
    const after = t.slice(lastDot + 1);
    if (after.length === 3 && (t.match(/\./g) || []).length === 1) {
      t = t.replace(/\./g, '');
    }
  }
  return parseFloat(t);
};

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
  // Filtro por rango de fechas de recepción (DATE en zona MTY). Vacío = sin filtro.
  const [filtroFechaDesde, setFiltroFechaDesde] = useState<string>('');
  const [filtroFechaHasta, setFiltroFechaHasta] = useState<string>('');
  // Wizard de "Realizar Pago": service -> supplier -> consolidations
  const [pagoWizardStep, setPagoWizardStep] = useState<'service' | 'supplier' | 'consolidations'>('service');
  const [pagoServicioSel, setPagoServicioSel] = useState<'pobox' | 'air' | 'maritime' | 'china' | null>(null);
  const [pagoProveedorSel, setPagoProveedorSel] = useState<{ id: number; name: string } | null>(null);
  const [proveedoresList, setProveedoresList] = useState<Array<{ id: number; name: string; pending_payment?: number }>>([]);
  const [loadingProveedores, setLoadingProveedores] = useState(false);
  const [expandedConsolidaciones, setExpandedConsolidaciones] = useState<Set<number>>(new Set());
  const [soloFaltantes, setSoloFaltantes] = useState<Set<number>>(new Set());
  const [soloNoLlegados, setSoloNoLlegados] = useState<Set<number>>(new Set());
  const [consolidacionAPagar, setConsolidacionAPagar] = useState<ConsolidacionPendiente | null>(null);
  const [pagoConsolidacionDialogOpen, setPagoConsolidacionDialogOpen] = useState(false);
  const [pagoConsolidacionRef, setPagoConsolidacionRef] = useState('');
  const [pagoConsolidacionNotas, setPagoConsolidacionNotas] = useState('');
  const [procesandoPagoProveedor, setProcesandoPagoProveedor] = useState(false);
  const [selectedConsolidaciones, setSelectedConsolidaciones] = useState<Set<number>>(new Set());
  const [pagoMultipleDialogOpen, setPagoMultipleDialogOpen] = useState(false);
  const [pagoMultipleRef, setPagoMultipleRef] = useState('');
  const [pagoMultipleNotas, setPagoMultipleNotas] = useState('');
  const [procesandoPagoMultiple, setProcesandoPagoMultiple] = useState(false);
  // Referencias de pago
  const [refModalOpen, setRefModalOpen] = useState(false);
  const [referencias, setReferencias] = useState<any[]>([]);
  const [loadingReferencias, setLoadingReferencias] = useState(false);
  const [creandoRef, setCreandoRef] = useState(false);
  const [deletingRefId, setDeletingRefId] = useState<number | null>(null);
  const [confirmDeleteRefId, setConfirmDeleteRefId] = useState<number | null>(null);
  // Filas expandibles en la tabla de Transacciones (para ver detalle
  // de consolidaciones en pagos a proveedor agrupados).
  const [expandedTxs, setExpandedTxs] = useState<Set<number>>(new Set());

  // Búsqueda de cliente
  const [_clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [_guiasPendientes, setGuiasPendientes] = useState<GuiaPendiente[]>([]);

  // Pago
  const [montoRecibido, setMontoRecibido] = useState('');
  const [_modoAsignacion, _setModoAsignacion] = useState<'automatico' | 'manual'>('automatico');
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

  const isSuperAdmin = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}')?.role === 'super_admin'; }
    catch { return false; }
  })();
  const [deletingTxId, setDeletingTxId] = useState<number | null>(null);
  const [editTxDialog, setEditTxDialog] = useState<{ open: boolean; tx: any | null; monto: string; fecha: string; saving: boolean; error: string | null }>({ open: false, tx: null, monto: '', fecha: '', saving: false, error: null });

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

  const handleDeleteTransaccion = async (txId: number) => {
    if (!window.confirm('¿Eliminar esta transacción de Caja CC? El saldo se revertirá automáticamente.')) return;
    setDeletingTxId(txId);
    try {
      await api.delete(`/caja-chica/transacciones/${txId}`);
      setTransacciones(prev => prev.filter(t => t.id !== txId));
      setSnackbar({ open: true, message: 'Transacción eliminada', severity: 'success' });
      fetchStats();
    } catch {
      setSnackbar({ open: true, message: 'Error al eliminar', severity: 'error' });
    } finally {
      setDeletingTxId(null);
    }
  };

  const openEditTx = (tx: any) => {
    const d = new Date(tx.fecha || tx.created_at);
    const pad = (n: number) => String(n).padStart(2, '0');
    const fechaLocal = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setEditTxDialog({ open: true, tx, monto: String(tx.monto ?? ''), fecha: fechaLocal, saving: false, error: null });
  };

  const handleSaveEditTx = async () => {
    const tx = editTxDialog.tx;
    if (!tx) return;
    const n = parseMontoEs(editTxDialog.monto);
    if (!Number.isFinite(n) || n <= 0) {
      setEditTxDialog(p => ({ ...p, error: 'Monto inválido' }));
      return;
    }
    setEditTxDialog(p => ({ ...p, saving: true, error: null }));
    try {
      const fecha = editTxDialog.fecha ? new Date(editTxDialog.fecha).toISOString() : undefined;
      await api.patch(`/caja-chica/transacciones/${tx.id}`, { monto: n, fecha });
      setTransacciones(prev => prev.map(t => t.id === tx.id ? { ...t, monto: n } : t));
      setSnackbar({ open: true, message: 'Transacción actualizada', severity: 'success' });
      setEditTxDialog({ open: false, tx: null, monto: '', fecha: '', saving: false, error: null });
      fetchStats();
    } catch (e: any) {
      setEditTxDialog(p => ({ ...p, saving: false, error: e?.response?.data?.error || 'Error al actualizar' }));
    }
  };

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
  const fetchConsolidacionesPendientes = useCallback(async (from?: string, to?: string, supplierId?: number) => {
    setLoadingConsolidaciones(true);
    try {
      const params: Record<string, string> = {};
      if (from) params.received_from = from;
      if (to) params.received_to = to;
      const response = await api.get('/suppliers/consolidaciones-pendientes', {
        params: Object.keys(params).length ? params : undefined,
      });
      console.log('📦 Respuesta consolidaciones:', response.data);
      const all = response.data.consolidations || [];
      const filtered = supplierId ? all.filter((c: any) => Number(c.supplier_id) === Number(supplierId)) : all;
      setConsolidacionesPendientes(filtered);
    } catch (error) {
      console.error('Error fetching consolidaciones pendientes:', error);
    } finally {
      setLoadingConsolidaciones(false);
    }
  }, []);

  // Cargar proveedores activos (para wizard de pago)
  const fetchProveedoresPago = useCallback(async () => {
    setLoadingProveedores(true);
    try {
      const response = await api.get('/suppliers');
      setProveedoresList(response.data.suppliers || []);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    } finally {
      setLoadingProveedores(false);
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

  // Toggle selección de consolidación
  const toggleSelectConsolidacion = (id: number) => {
    setSelectedConsolidaciones(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllConsolidaciones = () => {
    if (selectedConsolidaciones.size === consolidacionesPendientes.length) {
      setSelectedConsolidaciones(new Set());
    } else {
      setSelectedConsolidaciones(new Set(consolidacionesPendientes.map(c => c.id)));
    }
  };

  // ====== Reporte: TODAS las guías de las consolidaciones seleccionadas.
  // Muestra todas (en tránsito/faltantes/perdidas/pagadas) pero solo SUMA al total
  // las que son pagables ahora (recibidas en MTY, no faltantes, no perdidas, no pagadas).
  const getReporteRows = () => {
    const rows: Array<{
      consolidacion_id: number;
      supplier_name: string;
      tracking: string;
      tracking_provider: string;
      client: string;
      client_box_id: string;
      description: string;
      weight: number;
      dims: string;
      usd: number;
      tc: number;
      mxn: number;
      status: string;
      statusLabel: string;
      countsToTotal: boolean;
      reasonNoCount?: string;
      received_at?: string | null;
      received_mty_at?: string | null;
    }> = [];
    let totalUsd = 0;
    let totalMxn = 0;
    const selected = consolidacionesPendientes.filter(c => selectedConsolidaciones.has(c.id));
    selected.forEach((c) => {
      (c.packages || []).forEach((p) => {
        // Ocultar guías master con múltiples bultos: sus hijas (sufijo -NNNN)
        // ya contienen el costo individual, sumar el master duplicaría totales.
        if (p.is_master && Number(p.total_boxes || 1) > 1) return;
        // Costo USD que se paga al proveedor (couriers / forwarders).
        // Preferimos pobox_provider_cost_usd; si no existe, pobox_cost_usd como
        // fallback histórico (eran iguales en el momento del costeo).
        const usd = Number(p.pobox_provider_cost_usd ?? p.pobox_cost_usd ?? 0);
        // TC oficial registrado al momento de costear. OJO: pobox_service_cost
        // NO es USD*TC (es el precio de venta al cliente con margen). Por eso
        // tenemos columnas dedicadas para el costo real al proveedor.
        const tc = Number(p.registered_exchange_rate ?? 0);
        // MXN que efectivamente se le paga al proveedor (USD × TC oficial).
        // Si la BD no tiene el campo poblado, lo derivamos manualmente.
        const mxn = Number(
          p.pobox_provider_cost_mxn ??
          (tc > 0 ? usd * tc : 0)
        );
        const dims = p.pkg_length && p.pkg_width && p.pkg_height
          ? `${(Number(p.pkg_length) * 0.393701).toFixed(1)}×${(Number(p.pkg_width) * 0.393701).toFixed(1)}×${(Number(p.pkg_height) * 0.393701).toFixed(1)} in`
          : '—';

        let statusLabel = 'A PAGAR';
        let countsToTotal = true;
        let reasonNoCount: string | undefined;
        // Un paquete se considera "llegó a MTY" si:
        // - tiene received_mty_at registrado (verdad histórica), o
        // - su status actual es uno posterior a received_mty
        //   (out_for_delivery / delivered / received_cdmx / returned_to_warehouse)
        const receivedMtyAt = (p as any).received_mty_at;
        const arrivedStatuses = new Set([
          'received_mty',
          'received_cdmx',
          'out_for_delivery',
          'delivered',
          'returned_to_warehouse',
        ]);
        const arrivedAtMty = Boolean(receivedMtyAt) || arrivedStatuses.has(String(p.status || ''));
        if (p.is_lost) {
          statusLabel = 'PERDIDA';
          countsToTotal = false;
          reasonNoCount = 'Paquete perdido';
        } else if (p.missing_on_arrival) {
          statusLabel = 'FALTANTE';
          countsToTotal = false;
          reasonNoCount = 'No llegó a MTY';
        } else if (p.costing_paid) {
          statusLabel = 'YA PAGADA';
          countsToTotal = false;
          reasonNoCount = 'Ya pagada en pago anterior';
        } else if (!arrivedAtMty) {
          statusLabel = 'EN TRÁNSITO';
          countsToTotal = false;
          reasonNoCount = 'Aún no llega a MTY';
        }

        // Reporte INCLUYE solo guías que llegaron a MTY (A PAGAR + YA PAGADA).
        // Se EXCLUYEN EN TRÁNSITO, FALTANTE y PERDIDA porque aún no llegan
        // (o no llegaron) a MTY y no aplican al pago.
        if (statusLabel === 'EN TRÁNSITO' || statusLabel === 'FALTANTE' || statusLabel === 'PERDIDA') return;

        rows.push({
          consolidacion_id: c.id,
          supplier_name: c.supplier_name,
          tracking: p.tracking,
          tracking_provider: (p as any).tracking_provider || '',
          client: `${p.client_name || '—'} (${p.client_box_id || 'N/A'})`,
          client_box_id: p.client_box_id || '',
          description: p.description || '—',
          weight: Number(p.weight || 0),
          dims,
          usd,
          tc,
          mxn,
          status: p.status || '—',
          statusLabel,
          countsToTotal,
          reasonNoCount,
          received_at: (p as any).received_at || null,
          received_mty_at: (p as any).received_mty_at || null,
        });
        if (countsToTotal) {
          totalUsd += usd;
          totalMxn += mxn;
        }
      });
    });
    return { rows, totalUsd, totalMxn, selectedCount: selected.length };
  };

  // ── Funciones de Referencias de Pago ──────────────────────────────
  const fmtDateRef = (d?: string | null) => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return '—'; } };

  const fetchReferencias = async () => {
    if (!pagoProveedorSel) return;
    setLoadingReferencias(true);
    try {
      const r = await api.get('/pobox/payment-references', { params: { supplier_id: pagoProveedorSel.id } });
      setReferencias(r.data.references || []);
    } catch { /* ignore */ } finally { setLoadingReferencias(false); }
  };

  const handleVerReferencias = async () => { await fetchReferencias(); setRefModalOpen(true); };

  const handleGenerarReferencia = async () => {
    if (selectedConsolidaciones.size === 0) { setSnackbar({ open: true, message: 'Selecciona al menos una consolidación', severity: 'info' }); return; }
    const { rows, totalUsd, totalMxn } = getReporteRows();
    if (rows.length === 0) { setSnackbar({ open: true, message: 'Sin guías recibidas en las consolidaciones seleccionadas', severity: 'info' }); return; }
    setCreandoRef(true);
    try {
      await api.post('/pobox/payment-references', {
        supplier_id: pagoProveedorSel!.id,
        supplier_name: pagoProveedorSel!.name,
        consolidation_ids: consolidacionesPendientes.filter(c => selectedConsolidaciones.has(c.id)).map(c => c.id),
        total_usd: totalUsd,
        total_mxn: totalMxn,
        packages_count: rows.length,
        packages_data: rows,
        notas: null,
      });
      await fetchReferencias();
      setRefModalOpen(true);
      setSnackbar({ open: true, message: '✅ Referencia generada correctamente', severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.error || 'Error al generar referencia', severity: 'error' });
    } finally { setCreandoRef(false); }
  };

  const handleEliminarReferencia = async (id: number) => {
    setDeletingRefId(id);
    try {
      await api.delete(`/pobox/payment-references/${id}`);
      setReferencias(prev => prev.filter(r => r.id !== id));
      setConfirmDeleteRefId(null);
      setSnackbar({ open: true, message: 'Referencia eliminada', severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.error || 'Error al eliminar', severity: 'error' });
    } finally { setDeletingRefId(null); }
  };

  const generateOrdenPagoFromRef = (ref: any) => {
    const rows = ref.packages_data || [];
    const totalUsd = Number(ref.total_usd) || 0;
    const totalMxn = Number(ref.total_mxn) || 0;
    const fecha = new Date().toLocaleString('es-MX');
    const refFecha = new Date(ref.created_at).toLocaleString('es-MX');
    const idsStr = (ref.consolidation_ids || []).map((id: number) => `#${id}`).join(', ');
    const rowsHTML = (ref.consolidation_ids || []).map((id: number) => {
      const guias = rows.filter((r: any) => r.consolidacion_id === id);
      const usd = guias.filter((r: any) => r.countsToTotal).reduce((s: number, r: any) => s + r.usd, 0);
      const mxn = guias.filter((r: any) => r.countsToTotal).reduce((s: number, r: any) => s + r.mxn, 0);
      return `<tr><td style="font-family:monospace;font-weight:600">#${id}</td><td style="text-align:center">${guias.length}</td><td style="text-align:right">$${usd.toFixed(2)}</td><td style="text-align:right">$${mxn.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Orden de Pago REF-${ref.id}</title>
<style>@page{size:letter;margin:20mm}body{font-family:Arial,sans-serif;font-size:12px;color:#222}h1{font-size:20px;color:#C1272D;margin:0 0 2px}h2{font-size:13px;color:#333;margin:0 0 16px}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;border-bottom:2px solid #C1272D;padding-bottom:12px}.ref-badge{background:#C1272D;color:#fff;font-size:18px;font-weight:900;padding:6px 14px;border-radius:6px;letter-spacing:1px}table{width:100%;border-collapse:collapse;margin:10px 0}th{background:#1a1a1a;color:#fff;padding:6px 8px;text-align:left;font-size:11px}td{padding:6px 8px;border-bottom:1px solid #ddd;font-size:11px}.totals{border:2px solid #C1272D;padding:14px 18px;margin:18px 0;display:flex;justify-content:space-around;align-items:center}.totals .lbl{font-size:11px;color:#555;text-transform:uppercase;letter-spacing:.5px}.totals .big{font-size:22px;font-weight:900;color:#C1272D}.ref-box{border:1px dashed #999;padding:12px;margin-top:18px;font-size:11px}.sig{margin-top:44px;display:flex;justify-content:space-between}.sig div{text-align:center;width:44%}.sig hr{border:none;border-top:1px solid #333;margin-bottom:4px}</style></head><body>
<div class="header"><div><h1>EntregaX · Orden de Pago</h1><h2>PO Box USA — Proveedor: <strong>${ref.supplier_name || pagoProveedorSel?.name || ''}</strong></h2><p style="font-size:11px;color:#666;margin:4px 0">Consolidaciones: ${idsStr}</p><p style="font-size:11px;color:#666;margin:0">Generada: ${refFecha}</p></div><div style="text-align:right"><div class="ref-badge">REF-${ref.id}</div><p style="font-size:11px;color:#666;margin-top:6px">Impresa: ${fecha}</p></div></div>
<table><thead><tr><th>Consolidación</th><th style="text-align:center">Guías</th><th style="text-align:right">Total USD</th><th style="text-align:right">Total MXN</th></tr></thead><tbody>${rowsHTML}<tr style="background:#f5f5f5;font-weight:bold"><td>TOTAL</td><td style="text-align:center">${ref.packages_count ?? rows.length}</td><td style="text-align:right">$${totalUsd.toFixed(2)}</td><td style="text-align:right">$${totalMxn.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr></tbody></table>
<div class="totals"><div><div class="lbl">Total USD</div><div class="big">$${totalUsd.toFixed(2)}</div></div><div style="font-size:28px;color:#ddd">|</div><div><div class="lbl">Total MXN</div><div class="big">$${totalMxn.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div></div>
<div class="ref-box">Referencia EntregaX: <strong>REF-${ref.id}</strong>&nbsp;&nbsp;&nbsp;Folio/SPEI/Cheque: ___________________________________&nbsp;&nbsp;&nbsp;Fecha de pago: _____________</div>
<div class="sig"><div><hr>Elaborado por</div><div><hr>Autorizado por</div></div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},300);});</script>
</body></html>`;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { setSnackbar({ open: true, message: 'Permite ventanas emergentes', severity: 'error' }); return; }
    w.document.write(html); w.document.close();
  };

  const generateExcelFromRef = (ref: any) => {
    const rows = ref.packages_data || [];
    const headers = ['No.', 'Consolidación', '# Cliente', 'Guía Origen', 'Guía', 'Ingresada', 'Recibida MTY', 'Peso (lb)', 'USD', 'TC', 'MXN', 'Estado'];
    const csvRows = rows.map((r: any, idx: number) => [
      idx + 1, `#${r.consolidacion_id}`, r.client_box_id || '', r.tracking_provider || '', r.tracking,
      fmtDateRef(r.received_at), fmtDateRef(r.received_mty_at), Number(r.weight || 0).toFixed(2),
      Number(r.usd || 0).toFixed(2), Number(r.tc || 0).toFixed(2), Number(r.mxn || 0).toFixed(2), r.statusLabel || '',
    ]);
    const bom = '﻿';
    const csv = bom + [headers, ...csvRows].map(row => row.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `REF-${ref.id}-${(ref.supplier_name || '').replace(/\s+/g, '_')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // Generar PDF imprimible (HTML → window.print → guardar como PDF)
  const handleGenerarPDF = () => {
    if (selectedConsolidaciones.size === 0) {
      setSnackbar({ open: true, message: 'Selecciona al menos una consolidación', severity: 'info' });
      return;
    }
    const { rows, totalUsd, totalMxn, selectedCount } = getReporteRows();
    if (rows.length === 0) {
      setSnackbar({ open: true, message: 'Las consolidaciones seleccionadas no tienen guías', severity: 'info' });
      return;
    }
    const fecha = new Date().toLocaleString('es-MX');
    // Desglose por estado: cuántas A PAGAR / YA PAGADA / EN TRÁNSITO / FALTANTE / PERDIDA
    const counts = rows.reduce((acc, r) => {
      acc[r.statusLabel] = (acc[r.statusLabel] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const aPagar = counts['A PAGAR'] || 0;
    const yaPagada = counts['YA PAGADA'] || 0;
    const enTransito = counts['EN TRÁNSITO'] || 0;
    const faltante = counts['FALTANTE'] || 0;
    const perdida = counts['PERDIDA'] || 0;
    // Colores y estilo por estado (fila completa)
    const rowStyleByStatus = (label: string): string => {
      switch (label) {
        case 'YA PAGADA':   return 'background:#eef5ff;color:#1565c0;';
        case 'EN TRÁNSITO': return 'background:#fff8e1;color:#a06000;';
        case 'FALTANTE':    return 'background:#fdecea;color:#b71c1c;';
        case 'PERDIDA':     return 'background:#f3e5f5;color:#6a1b9a;';
        default:            return '';
      }
    };
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Reporte Pagos Proveedor</title>
<style>
  @page { size: letter landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10px; color: #222; margin: 0; }
  h1 { font-size: 16px; margin: 0 0 4px 0; color: #C1272D; }
  .sub { color: #666; font-size: 10px; margin-bottom: 6px; }
  .breakdown { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; font-size: 10px; }
  .chip { padding: 3px 8px; border-radius: 10px; font-weight: 600; border: 1px solid #ddd; }
  .chip.pay  { background:#e8f5e9; color:#1b5e20; border-color:#a5d6a7; }
  .chip.paid { background:#eef5ff; color:#1565c0; border-color:#90caf9; }
  .chip.tr   { background:#fff8e1; color:#a06000; border-color:#ffe082; }
  .chip.miss { background:#fdecea; color:#b71c1c; border-color:#f5c2bd; }
  .chip.lost { background:#f3e5f5; color:#6a1b9a; border-color:#ce93d8; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #1a1a1a; color: #fff; padding: 6px 4px; text-align: left; font-size: 9px; }
  td { padding: 5px 4px; border-bottom: 1px solid #ddd; font-size: 9px; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  th.center, td.center { text-align: center; }
  .badge { display:inline-block; padding:2px 6px; border-radius:8px; font-weight:700; font-size:8px; }
  .b-pay  { background:#1b5e20; color:#fff; }
  .b-paid { background:#1565c0; color:#fff; }
  .b-tr   { background:#a06000; color:#fff; }
  .b-miss { background:#b71c1c; color:#fff; }
  .b-lost { background:#6a1b9a; color:#fff; }
  .totals { margin-top: 12px; border: 2px solid #C1272D; padding: 8px 12px; display: flex; justify-content: space-between; }
  .totals .big { font-size: 14px; font-weight: 900; color: #C1272D; }
  .footer { margin-top: 12px; font-size: 9px; color: #999; text-align: center; }
</style></head><body>
<h1>🚚 EntregaX · Reporte de Pagos a Proveedores</h1>
<div class="sub">Generado: ${fecha} · ${selectedCount} consolidación(es) · ${rows.length} guía(s) total</div>
<div class="breakdown">
  <span class="chip pay">A PAGAR: <strong>${aPagar}</strong></span>
  ${yaPagada   ? `<span class="chip paid">YA PAGADA: <strong>${yaPagada}</strong></span>` : ''}
  ${enTransito ? `<span class="chip tr">EN TRÁNSITO: <strong>${enTransito}</strong></span>` : ''}
  ${faltante   ? `<span class="chip miss">FALTANTE: <strong>${faltante}</strong></span>` : ''}
  ${perdida    ? `<span class="chip lost">PERDIDA: <strong>${perdida}</strong></span>` : ''}
</div>
<table>
  <thead>
    <tr>
      <th class="num center">No.</th>
      <th>Consolidación</th>
      <th># Cliente</th>
      <th>Guía Origen</th>
      <th>Guía</th>
      <th class="center">Fecha Ingreso</th>
      <th class="center">Recibida MTY</th>
      <th class="num center">Peso (kg)</th>
      <th>Medidas (in)</th>
      <th class="num">USD</th>
      <th class="num">TC</th>
      <th class="num">MXN</th>
      <th class="center">Estado</th>
      <th>Motivo / Último Status</th>
    </tr>
  </thead>
  <tbody>
    ${rows.map((r, idx) => {
      // Mapeo de status técnico de DB a etiqueta legible para el reporte.
      const statusMap: Record<string, string> = {
        'received': 'Recibido (USA)',
        'received_china': 'Recibido (China)',
        'received_mty': 'En MTY',
        'received_cdmx': 'En CDMX',
        'in_transit': 'En tránsito',
        'out_for_delivery': 'En reparto',
        'delivered': 'Entregado',
        'returned_to_warehouse': 'Regresó a bodega',
      };
      const lastStatus = statusMap[r.status] || r.status || '—';
      const motivo = r.reasonNoCount || lastStatus;
      const badgeClass = r.statusLabel === 'A PAGAR' ? 'b-pay'
                       : r.statusLabel === 'YA PAGADA' ? 'b-paid'
                       : r.statusLabel === 'EN TRÁNSITO' ? 'b-tr'
                       : r.statusLabel === 'FALTANTE' ? 'b-miss'
                       : r.statusLabel === 'PERDIDA' ? 'b-lost' : 'b-pay';
      const rowStyle = rowStyleByStatus(r.statusLabel);
      const fmtDate = (d?: string | null) => {
        if (!d) return '—';
        try {
          return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' });
        } catch { return '—'; }
      };
      return `
      <tr style="${rowStyle}">
        <td class="num center" style="font-weight:600">${idx + 1}</td>
        <td>#${r.consolidacion_id}</td>
        <td style="font-family:monospace;font-weight:600">${r.client_box_id || '—'}</td>
        <td style="font-family:monospace">${r.tracking_provider || '—'}</td>
        <td style="font-family:monospace;font-weight:600">${r.tracking}</td>
        <td class="center">${fmtDate(r.received_at)}</td>
        <td class="center">${fmtDate(r.received_mty_at)}</td>
        <td class="num center">${r.weight.toFixed(2)}</td>
        <td>${r.dims}</td>
        <td class="num">$${r.usd.toFixed(2)}</td>
        <td class="num">${r.tc.toFixed(2)}</td>
        <td class="num">$${r.mxn.toLocaleString('es-MX', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
        <td class="center"><span class="badge ${badgeClass}">${r.statusLabel}</span></td>
        <td>${motivo}</td>
      </tr>`;
    }).join('')}
  </tbody>
</table>
<div class="totals">
  <div>Guías a pagar: <strong>${aPagar}</strong> / ${rows.length} totales</div>
  <div>Total USD: <span class="big">$${totalUsd.toFixed(2)}</span></div>
  <div>Total MXN: <span class="big">$${totalMxn.toLocaleString('es-MX', {minimumFractionDigits:2, maximumFractionDigits:2})}</span></div>
</div>
<div class="footer">Los totales suman únicamente guías A PAGAR. Las YA PAGADA, EN TRÁNSITO, FALTANTE y PERDIDA aparecen para trazabilidad pero NO suman al pago actual.</div>
<script>window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 300); });</script>
</body></html>`;
    const w = window.open('', '_blank', 'width=1200,height=800');
    if (!w) {
      setSnackbar({ open: true, message: 'Permite ventanas emergentes para generar el PDF', severity: 'error' });
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  // Enviar reporte por WhatsApp (texto resumen, abre wa.me)
  const handleEnviarWhatsApp = () => {
    if (selectedConsolidaciones.size === 0) {
      setSnackbar({ open: true, message: 'Selecciona al menos una consolidación', severity: 'info' });
      return;
    }
    const { rows, totalUsd, totalMxn } = getReporteRows();
    if (rows.length === 0) {
      setSnackbar({ open: true, message: 'Las consolidaciones seleccionadas no tienen guías', severity: 'info' });
      return;
    }
    const fecha = new Date().toLocaleDateString('es-MX');
    const byCons = new Map<number, typeof rows>();
    rows.forEach(r => {
      const arr = byCons.get(r.consolidacion_id) || [];
      arr.push(r);
      byCons.set(r.consolidacion_id, arr);
    });
    let msg = `*🚚 EntregaX · Pagos a Proveedor*\n`;
    msg += `_Fecha:_ ${fecha}\n\n`;
    byCons.forEach((items, consId) => {
      const supplier = items[0]?.supplier_name || '—';
      msg += `*Consolidación #${consId}* — ${supplier}\n`;
      items.forEach(r => {
        msg += `✅ \`${r.tracking}\` · ${r.weight.toFixed(1)}lb · $${r.usd.toFixed(2)} USD · $${r.mxn.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})} MXN\n`;
      });
      msg += `\n`;
    });
    msg += `━━━━━━━━━━━━━━━━\n`;
    msg += `*Guías a pagar:* ${rows.length}\n`;
    msg += `*Total USD:* $${totalUsd.toFixed(2)}\n`;
    msg += `*Total MXN:* $${totalMxn.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}\n\n`;
    msg += `_Reporte solo incluye guías con estado A PAGAR._`;
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  // Pago múltiple de consolidaciones seleccionadas
  const handleIniciarPagoMultiple = () => {
    if (selectedConsolidaciones.size === 0) {
      setSnackbar({ open: true, message: 'Selecciona al menos una consolidación', severity: 'info' });
      return;
    }
    setPagoMultipleRef('');
    setPagoMultipleNotas('');
    setPagoMultipleDialogOpen(true);
  };

  const handleConfirmarPagoMultiple = async () => {
    const selected = consolidacionesPendientes.filter(c => selectedConsolidaciones.has(c.id));
    const pagables = selected.filter(c => Number(c.total_cost_mxn || 0) > 0);
    if (pagables.length === 0) {
      setSnackbar({ open: true, message: 'Ninguna de las consolidaciones seleccionadas tiene monto a pagar', severity: 'warning' });
      return;
    }
    setProcesandoPagoMultiple(true);
    try {
      // Un solo endpoint = una sola transacción de caja en lugar de N filas
      // de "Pago Proveedor" duplicadas en el historial.
      const response = await api.post('/caja-chica/pagar-consolidaciones-multiple', {
        consolidation_ids: pagables.map(c => c.id),
        referencia: pagoMultipleRef || null,
        notas: pagoMultipleNotas || null,
      });
      setProcesandoPagoMultiple(false);
      setPagoMultipleDialogOpen(false);
      setSelectedConsolidaciones(new Set());
      const data = response.data || {};
      setSnackbar({
        open: true,
        message: `✅ ${data.consolidations?.length || pagables.length} consolidación(es) pagadas · ${data.packages_updated || 0} paquetes · ${formatCurrency(Number(data.total_monto || 0))}`,
        severity: 'success',
      });
      fetchConsolidacionesPendientes();
      loadData();
    } catch (error: unknown) {
      setProcesandoPagoMultiple(false);
      const axiosError = error as { response?: { data?: { error?: string } } };
      setSnackbar({
        open: true,
        message: axiosError.response?.data?.error || 'Error al procesar pago múltiple',
        severity: 'error',
      });
    }
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
        monto: parseMontoEs(montoRecibido),
        notas: notasPago
      });
      setSnackbar({ open: true, message: `✅ Pago de ${formatCurrency(parseMontoEs(montoRecibido))} registrado correctamente`, severity: 'success' });
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

  // Registrar egreso
  const handleRegistrarEgreso = async () => {
    try {
      await api.post('/caja-chica/egreso', {
        monto: parseMontoEs(egresoForm.monto),
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
        monto: parseMontoEs(ingresoForm.monto),
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
              // Abrir wizard en paso 1 (selección de servicio).
              setPagoWizardStep('service');
              setPagoServicioSel(null);
              setPagoProveedorSel(null);
              setConsolidacionesPendientes([]);
              setFiltroFechaDesde('');
              setFiltroFechaHasta('');
              setPagoProveedorDialogOpen(true);
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

      {/* Stats Cards — diseño corporativo: tarjetas blancas con acento de marca */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {[
          { accent: '#F05A28', label: 'Saldo Actual', value: formatCurrency(stats?.saldo_mxn ?? stats?.saldo_actual ?? 0), icon: <AccountBalanceIcon /> },
          { accent: '#F05A28', label: 'Ingresos Hoy', value: formatCurrency(stats?.ingresos_hoy_mxn ?? stats?.ingresos_hoy ?? 0), icon: <TrendingUpIcon /> },
          { accent: '#C1272D', label: 'Egresos Hoy', value: formatCurrency(stats?.egresos_hoy_mxn ?? stats?.egresos_hoy ?? 0), icon: <TrendingDownIcon /> },
          { accent: '#1A1A1A', label: 'Transacciones Hoy', value: stats?.cantidad_transacciones_hoy || 0, icon: <ReceiptIcon /> },
        ].map((c) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={c.label}>
            <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid #ECECEC', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
              <Box sx={{ height: 4, bgcolor: c.accent }} />
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="subtitle2" sx={{ color: '#6B7280', fontWeight: 600 }}>{c.label}</Typography>
                    <Typography variant="h4" fontWeight="bold" sx={{ color: c.accent }}>{c.value}</Typography>
                  </Box>
                  <Box sx={{ color: c.accent, display: 'flex', '& svg': { fontSize: 44, opacity: 0.9 } }}>{c.icon}</Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
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
                <TableCell width={40}></TableCell>
                <TableCell>Fecha</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Cliente</TableCell>
                <TableCell>Concepto</TableCell>
                <TableCell>Guías</TableCell>
                <TableCell align="right">Monto</TableCell>
                <TableCell>Registrado por</TableCell>
                {isSuperAdmin && <TableCell align="center" width={96}>Acciones</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {transacciones.map((tx) => {
                const hasConsolidaciones = !!(tx.consolidaciones && tx.consolidaciones.length > 0);
                const expandable = hasConsolidaciones;
                const isExpanded = expandedTxs.has(tx.id);
                return (
                <React.Fragment key={tx.id}>
                <TableRow
                  hover
                  sx={{
                    cursor: expandable ? 'pointer' : 'default',
                    '& > td': { borderBottom: isExpanded ? 'none' : undefined },
                  }}
                  onClick={() => {
                    if (!expandable) return;
                    setExpandedTxs(prev => {
                      const next = new Set(prev);
                      if (next.has(tx.id)) next.delete(tx.id); else next.add(tx.id);
                      return next;
                    });
                  }}
                >
                  <TableCell>
                    {expandable && (
                      <IconButton size="small" onClick={(e) => {
                        e.stopPropagation();
                        setExpandedTxs(prev => {
                          const next = new Set(prev);
                          if (next.has(tx.id)) next.delete(tx.id); else next.add(tx.id);
                          return next;
                        });
                      }}>
                        {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    )}
                  </TableCell>
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
                  {isSuperAdmin && (
                    <TableCell align="center" onClick={e => e.stopPropagation()}>
                      <Tooltip title="Editar transacción (solo super admin)">
                        <span>
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => openEditTx(tx)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Eliminar transacción (solo super admin)">
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            disabled={deletingTxId === tx.id}
                            onClick={() => handleDeleteTransaccion(tx.id)}
                          >
                            <DeleteForeverIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
                {expandable && isExpanded && (
                  <TableRow>
                    <TableCell colSpan={isSuperAdmin ? 9 : 8} sx={{ p: 0, bgcolor: 'grey.50' }}>
                      <Box sx={{ p: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          Consolidaciones cubiertas por este pago
                        </Typography>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell><strong>Consolidación</strong></TableCell>
                              <TableCell><strong>Proveedor</strong></TableCell>
                              <TableCell align="center"><strong>Paquetes</strong></TableCell>
                              <TableCell align="right"><strong>USD</strong></TableCell>
                              <TableCell align="right"><strong>MXN</strong></TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {(tx.consolidaciones || []).map(c => (
                              <TableRow key={c.consolidation_id}>
                                <TableCell>
                                  <Box display="flex" alignItems="center" gap={1}>
                                    <ShippingIcon color="primary" fontSize="small" />
                                    <Typography fontWeight="bold">#{c.consolidation_id}</Typography>
                                  </Box>
                                </TableCell>
                                <TableCell>{c.supplier_name || '—'}</TableCell>
                                <TableCell align="center">
                                  <Chip label={c.package_count} size="small" color="primary" variant="outlined" />
                                </TableCell>
                                <TableCell align="right">${Number(c.total_usd || 0).toFixed(2)}</TableCell>
                                <TableCell align="right">{formatCurrency(Number(c.total_mxn || 0))}</TableCell>
                              </TableRow>
                            ))}
                            <TableRow sx={{ bgcolor: 'warning.light' }}>
                              <TableCell colSpan={2} sx={{ fontWeight: 'bold' }}>TOTAL</TableCell>
                              <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                                {(tx.consolidaciones || []).reduce((s, c) => s + Number(c.package_count || 0), 0)}
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                                ${(tx.consolidaciones || []).reduce((s, c) => s + Number(c.total_usd || 0), 0).toFixed(2)}
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                                {formatCurrency((tx.consolidaciones || []).reduce((s, c) => s + Number(c.total_mxn || 0), 0))}
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
                </React.Fragment>
                );
              })}
              {transacciones.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isSuperAdmin ? 9 : 8} align="center" sx={{ py: 4 }}>
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
                    type="text"
                    inputMode="decimal"
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
            {procesandoPago ? 'Procesando...' : `Registrar Pago de ${formatCurrency(parseMontoEs(montoRecibido) || 0)}`}
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
                type="text"
                inputMode="decimal"
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
        <DialogTitle sx={{ bgcolor: 'primary.main', color: 'white' }}>
          <AddIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Registrar Ingreso
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Monto"
                type="text"
                inputMode="decimal"
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
        <DialogTitle sx={{ bgcolor: '#1A1A1A', color: 'white' }}>
          <AssignmentIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Realizar Corte de Caja
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              Saldo actual en sistema: <strong>{formatCurrency(stats?.saldo_mxn ?? stats?.saldo_actual ?? 0)}</strong>
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
                    parseFloat(corteForm.saldo_real) === (stats?.saldo_mxn ?? stats?.saldo_actual ?? 0) ? 'success'
                      : parseFloat(corteForm.saldo_real) > (stats?.saldo_mxn ?? stats?.saldo_actual ?? 0) ? 'info' : 'warning'
                  }
                >
                  Diferencia: <strong>{formatCurrency(parseFloat(corteForm.saldo_real) - (stats?.saldo_mxn ?? stats?.saldo_actual ?? 0))}</strong>
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
              {pagoWizardStep !== 'service' && (
                <IconButton
                  size="small"
                  onClick={() => {
                    if (pagoWizardStep === 'consolidations') {
                      setPagoWizardStep('supplier');
                      setPagoProveedorSel(null);
                      setConsolidacionesPendientes([]);
                    } else if (pagoWizardStep === 'supplier') {
                      setPagoWizardStep('service');
                      setPagoServicioSel(null);
                    }
                  }}
                >
                  <ArrowBackIcon />
                </IconButton>
              )}
              <PaymentIcon color="warning" />
              <Typography variant="h6">
                {pagoWizardStep === 'service' && 'Realizar Pago — Selecciona servicio'}
                {pagoWizardStep === 'supplier' && `Pago ${pagoServicioSel?.toUpperCase()} — Selecciona proveedor`}
                {pagoWizardStep === 'consolidations' && `Pagos pendientes — ${pagoProveedorSel?.name || ''}`}
              </Typography>
            </Box>
            <IconButton onClick={() => setPagoProveedorDialogOpen(false)} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {/* ===== PASO 1: Selección de servicio ===== */}
          {pagoWizardStep === 'service' && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Selecciona el tipo de servicio cuyas guías quieres pagar al proveedor.
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
                {([
                  { key: 'pobox', label: 'PO Box USA', icon: <ShippingIcon sx={{ fontSize: 40 }} color="warning" />, enabled: true, desc: 'Guías recibidas en CEDIS MTY desde EE.UU.' },
                  { key: 'air', label: 'Aéreo', icon: <ShippingIcon sx={{ fontSize: 40 }} color="info" />, enabled: false, desc: 'Próximamente' },
                  { key: 'maritime', label: 'Marítimo', icon: <ShippingIcon sx={{ fontSize: 40 }} color="primary" />, enabled: false, desc: 'Próximamente' },
                  { key: 'china', label: 'China', icon: <ShippingIcon sx={{ fontSize: 40 }} color="error" />, enabled: false, desc: 'Próximamente' },
                ] as const).map((svc) => (
                  <Paper
                    key={svc.key}
                    elevation={2}
                    sx={{
                      p: 3,
                      textAlign: 'center',
                      cursor: svc.enabled ? 'pointer' : 'not-allowed',
                      opacity: svc.enabled ? 1 : 0.5,
                      transition: 'all 0.2s',
                      '&:hover': svc.enabled ? { boxShadow: 6, transform: 'translateY(-2px)' } : {},
                      border: '2px solid',
                      borderColor: 'divider',
                    }}
                    onClick={() => {
                      if (!svc.enabled) return;
                      setPagoServicioSel(svc.key);
                      setPagoWizardStep('supplier');
                      fetchProveedoresPago();
                    }}
                  >
                    {svc.icon}
                    <Typography variant="h6" sx={{ mt: 1 }}>{svc.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{svc.desc}</Typography>
                  </Paper>
                ))}
              </Box>
            </Box>
          )}

          {/* ===== PASO 2: Selección de proveedor ===== */}
          {pagoWizardStep === 'supplier' && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Selecciona el proveedor cuyo pago vas a procesar.
              </Typography>
              {loadingProveedores ? (
                <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
              ) : proveedoresList.length === 0 ? (
                <Alert severity="info">No hay proveedores activos.</Alert>
              ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
                  {proveedoresList.map((sup) => (
                    <Paper
                      key={sup.id}
                      elevation={2}
                      sx={{
                        p: 2,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        '&:hover': { boxShadow: 6, transform: 'translateY(-2px)', borderColor: 'primary.main' },
                        border: '2px solid',
                        borderColor: 'divider',
                      }}
                      onClick={() => {
                        setPagoProveedorSel({ id: sup.id, name: sup.name });
                        setPagoWizardStep('consolidations');
                        // Precargar hoy como rango por defecto
                        const hoy = new Date();
                        const tz = new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000)
                          .toISOString()
                          .slice(0, 10);
                        setFiltroFechaDesde(tz);
                        setFiltroFechaHasta(tz);
                        fetchConsolidacionesPendientes(tz, tz, sup.id);
                      }}
                    >
                      <Box display="flex" alignItems="center" gap={1.5}>
                        <PersonIcon color="primary" />
                        <Box flex={1} minWidth={0}>
                          <Typography variant="subtitle1" fontWeight="bold" noWrap>{sup.name}</Typography>
                          <Typography variant="caption" color={Number(sup.pending_payment || 0) > 0 ? 'warning.main' : 'text.secondary'}>
                            {Number(sup.pending_payment || 0) > 0
                              ? `${sup.pending_payment} guía(s) pendientes`
                              : 'Sin pendientes'}
                          </Typography>
                        </Box>
                      </Box>
                    </Paper>
                  ))}
                </Box>
              )}
            </Box>
          )}

          {/* ===== PASO 3: Consolidaciones del proveedor ===== */}
          {pagoWizardStep === 'consolidations' && (
            <>
          {/* Filtro por rango de fechas de recepción */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <TextField
              type="date"
              size="small"
              label="Desde"
              InputLabelProps={{ shrink: true }}
              value={filtroFechaDesde}
              onChange={(e) => {
                const v = e.target.value;
                setFiltroFechaDesde(v);
                fetchConsolidacionesPendientes(v || undefined, filtroFechaHasta || undefined, pagoProveedorSel?.id);
              }}
              sx={{ minWidth: 170 }}
            />
            <TextField
              type="date"
              size="small"
              label="Hasta"
              InputLabelProps={{ shrink: true }}
              value={filtroFechaHasta}
              onChange={(e) => {
                const v = e.target.value;
                setFiltroFechaHasta(v);
                fetchConsolidacionesPendientes(filtroFechaDesde || undefined, v || undefined, pagoProveedorSel?.id);
              }}
              inputProps={{ min: filtroFechaDesde || undefined }}
              sx={{ minWidth: 170 }}
            />
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                setFiltroFechaDesde('');
                setFiltroFechaHasta('');
                fetchConsolidacionesPendientes(undefined, undefined, pagoProveedorSel?.id);
              }}
              disabled={!filtroFechaDesde && !filtroFechaHasta}
            >
              Mostrar todas
            </Button>
            <Typography variant="body2" color="text.secondary">
              {filtroFechaDesde || filtroFechaHasta
                ? `Recibidas ${filtroFechaDesde ? `desde ${new Date(filtroFechaDesde + 'T00:00:00').toLocaleDateString('es-MX')}` : ''}${filtroFechaDesde && filtroFechaHasta ? ' ' : ''}${filtroFechaHasta ? `hasta ${new Date(filtroFechaHasta + 'T00:00:00').toLocaleDateString('es-MX')}` : ''}`
                : 'Sin filtro de fecha — mostrando todas las consolidaciones pendientes'}
            </Typography>
          </Box>

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
                  {selectedConsolidaciones.size > 0 ? 'Resumen Seleccionadas' : 'Resumen Total'}
                </Typography>
                {(() => {
                  const consolidacionesMostrar = selectedConsolidaciones.size > 0
                    ? consolidacionesPendientes.filter(c => selectedConsolidaciones.has(c.id))
                    : consolidacionesPendientes;
                  const totalUsd = consolidacionesMostrar.reduce((sum, c) => sum + Number(c.total_cost_usd || 0), 0);
                  const totalMxn = consolidacionesMostrar.reduce((sum, c) => sum + Number(c.total_cost_mxn || 0), 0);
                  const pendienteMxn = consolidacionesMostrar.reduce((sum, c) => sum + Number(c.total_cost_mxn || 0), 0);
                  return (
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 3 }}>
                        <Typography variant="body2" color="text.secondary">Consolidaciones</Typography>
                        <Typography variant="h5" fontWeight="bold">{consolidacionesMostrar.length}</Typography>
                      </Grid>
                      <Grid size={{ xs: 3 }}>
                        <Typography variant="body2" color="text.secondary">Valor total (USD)</Typography>
                        <Typography variant="h6" fontWeight="bold" color="success.dark">
                          ${totalUsd.toFixed(2)}
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 3 }}>
                        <Typography variant="body2" color="text.secondary">Valor total (MXN)</Typography>
                        <Typography variant="h6" fontWeight="bold" color="primary.dark">
                          {formatCurrency(totalMxn)}
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 3 }}>
                        <Typography variant="body2" color="text.secondary">Pendiente de pago (MXN)</Typography>
                        <Typography variant="h6" fontWeight="bold" color="warning.dark">
                          {formatCurrency(pendienteMxn)}
                        </Typography>
                      </Grid>
                    </Grid>
                  );
                })()}
              </Paper>

              {/* Lista de consolidaciones */}
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          color="primary"
                          indeterminate={selectedConsolidaciones.size > 0 && selectedConsolidaciones.size < consolidacionesPendientes.length}
                          checked={consolidacionesPendientes.length > 0 && selectedConsolidaciones.size === consolidacionesPendientes.length}
                          onChange={toggleSelectAllConsolidaciones}
                        />
                      </TableCell>
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
                          selected={selectedConsolidaciones.has(consolidacion.id)}
                          sx={{ 
                            '& > td': { borderBottom: expandedConsolidaciones.has(consolidacion.id) ? 'none' : undefined },
                            cursor: 'pointer'
                          }}
                          onClick={() => toggleExpandConsolidacion(consolidacion.id)}
                        >
                          <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              color="primary"
                              checked={selectedConsolidaciones.has(consolidacion.id)}
                              onChange={() => toggleSelectConsolidacion(consolidacion.id)}
                            />
                          </TableCell>
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
                            {(() => {
                              const pkgs = consolidacion.packages || [];
                              const isReceivedMty = (p: any) => !!p.received_mty_at;
                              // Conteos autoritativos del backend (incluyen masters multi-bulto)
                              const missing = Number(consolidacion.missing_count || 0);
                              const lost = Number(consolidacion.lost_count || 0);
                              const total = Number(consolidacion.package_count || pkgs.length);
                              // Recibidas: paquetes del array con received_mty_at, sin missing/lost
                              const receivedInArr = pkgs.filter((p: any) => isReceivedMty(p) && !p.missing_on_arrival && !p.is_lost).length;
                              // Ajustamos por paquetes excluidos (masters con hijas): asumimos que
                              // los no-listados que no son missing/lost están recibidos si la consolidación
                              // tiene received_mty_at registrado.
                              const excluded = Math.max(0, total - pkgs.length);
                              const received = receivedInArr + excluded;
                              const inTransit = Math.max(0, total - received - missing - lost);

                              let label = '';
                              let color: 'info' | 'warning' | 'success' | 'default' | 'error' = 'default';

                              if (total === 0) {
                                label = consolidacion.status || '—';
                              } else if (missing > 0 || lost > 0) {
                                const parts: string[] = [];
                                if (missing > 0) parts.push(`${missing} faltante${missing === 1 ? '' : 's'}`);
                                if (lost > 0) parts.push(`${lost} perdida${lost === 1 ? '' : 's'}`);
                                if (inTransit > 0) parts.push(`${inTransit} en tránsito`);
                                label = `Parcial (${parts.join(', ')})`;
                                color = 'warning';
                              } else if (received === total) {
                                label = 'Recibida';
                                color = 'success';
                              } else if (received === 0) {
                                label = 'En Tránsito';
                                color = 'info';
                              } else {
                                label = `Parcial (${received}/${total} recibidas)`;
                                color = 'warning';
                              }

                              return <Chip label={label} size="small" color={color} />;
                            })()}
                          </TableCell>
                          <TableCell align="right">
                            <Typography fontWeight="bold" color="success.main">
                              ${Number(consolidacion.total_cost_usd || 0).toFixed(2)}
                            </Typography>
                            {Number(consolidacion.paid_cost_usd || 0) > 0 && (
                              <Typography variant="caption" color="success.dark" sx={{ display: 'block' }}>
                                ✓ ${Number(consolidacion.paid_cost_usd).toFixed(2)} pagado
                              </Typography>
                            )}
                            {consolidacion.has_missing && Number(consolidacion.pending_cost_usd || 0) > 0 && (
                              <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>
                                ⚠ ${Number(consolidacion.pending_cost_usd).toFixed(2)} faltante
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <Typography fontWeight="bold" color="primary.main">
                              {formatCurrency(Number(consolidacion.total_cost_mxn || 0))}
                            </Typography>
                            {Number(consolidacion.paid_cost_mxn || 0) > 0 && (
                              <Typography variant="caption" color="success.dark" sx={{ display: 'block' }}>
                                ✓ {formatCurrency(Number(consolidacion.paid_cost_mxn))} pagado
                              </Typography>
                            )}
                            {consolidacion.has_missing && Number(consolidacion.pending_cost_mxn || 0) > 0 && (
                              <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>
                                ⚠ {formatCurrency(Number(consolidacion.pending_cost_mxn))} faltante
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="center">
                            <Button
                              variant="contained"
                              size="small"
                              color={consolidacion.has_missing ? 'warning' : 'warning'}
                              startIcon={<PaymentIcon />}
                              disabled={Number(consolidacion.total_cost_mxn || 0) <= 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleIniciarPagoConsolidacion(consolidacion);
                              }}
                            >
                              {Number(consolidacion.total_cost_mxn || 0) <= 0
                                ? (Number(consolidacion.paid_cost_mxn || 0) > 0 ? 'Ya pagada' : 'Esperando llegada')
                                : consolidacion.has_missing ? 'Pagar parcial' : 'Pagar'}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {/* Paquetes expandidos */}
                        {expandedConsolidaciones.has(consolidacion.id) && (
                          <TableRow>
                            <TableCell colSpan={9} sx={{ p: 0, bgcolor: 'grey.50' }}>
                              <Box sx={{ p: 2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
                                  <Typography variant="subtitle2">
                                    Paquetes en esta consolidación:
                                  </Typography>
                                  {(() => {
                                    const pkgs = consolidacion.packages || [];
                                    // Pendientes de pago a proveedor: costing_paid != true Y no perdidos/faltantes (esos no se pagan)
                                    const pendCount = pkgs.filter((p: any) => !p.costing_paid && !p.is_lost && !p.missing_on_arrival).length;
                                    // No llegaron a MTY: missing_on_arrival o is_lost
                                    const noLlegCount = pkgs.filter((p: any) => p.missing_on_arrival === true || p.is_lost === true).length;
                                    const activePend = soloFaltantes.has(consolidacion.id);
                                    const activeNoLleg = soloNoLlegados.has(consolidacion.id);
                                    return (
                                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                        {pendCount > 0 && pendCount < pkgs.length && (
                                          <Button
                                            size="small"
                                            variant={activePend ? 'contained' : 'outlined'}
                                            color="warning"
                                            onClick={() => {
                                              setSoloFaltantes(prev => {
                                                const next = new Set(prev);
                                                if (next.has(consolidacion.id)) next.delete(consolidacion.id);
                                                else { next.add(consolidacion.id); setSoloNoLlegados(p => { const n = new Set(p); n.delete(consolidacion.id); return n; }); }
                                                return next;
                                              });
                                            }}
                                          >
                                            {activePend ? `Mostrar todos (${pkgs.length})` : `Solo pendientes de pago (${pendCount})`}
                                          </Button>
                                        )}
                                        {noLlegCount > 0 && (
                                          <Button
                                            size="small"
                                            variant={activeNoLleg ? 'contained' : 'outlined'}
                                            color="error"
                                            onClick={() => {
                                              setSoloNoLlegados(prev => {
                                                const next = new Set(prev);
                                                if (next.has(consolidacion.id)) next.delete(consolidacion.id);
                                                else { next.add(consolidacion.id); setSoloFaltantes(p => { const n = new Set(p); n.delete(consolidacion.id); return n; }); }
                                                return next;
                                              });
                                            }}
                                          >
                                            {activeNoLleg ? `Mostrar todos (${pkgs.length})` : `Ver no llegados / perdidos (${noLlegCount})`}
                                          </Button>
                                        )}
                                      </Box>
                                    );
                                  })()}
                                </Box>
                                <Table size="small">
                                  <TableHead>
                                    <TableRow>
                                      <TableCell>Tracking</TableCell>
                                      <TableCell>Cliente</TableCell>
                                      <TableCell>Descripción</TableCell>
                                      <TableCell align="right">Peso (lb)</TableCell>
                                      <TableCell align="right">USD</TableCell>
                                      <TableCell align="right">MXN</TableCell>
                                      <TableCell align="center">Ingresada</TableCell>
                                      <TableCell align="center">Recibida en MTY</TableCell>
                                      <TableCell align="center">Estatus</TableCell>
                                      <TableCell align="center">Pago Proveedor</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {(consolidacion.packages || [])
                                      .filter((pkg: any) => {
                                        if (soloNoLlegados.has(consolidacion.id)) return pkg.missing_on_arrival === true || pkg.is_lost === true;
                                        if (soloFaltantes.has(consolidacion.id)) return !pkg.costing_paid && !pkg.is_lost && !pkg.missing_on_arrival;
                                        return true;
                                      })
                                      .map((pkg) => {
                                      const isMissing = pkg.missing_on_arrival === true;
                                      const isLost = pkg.is_lost === true;
                                      const problema = isLost || isMissing;
                                      return (
                                      <TableRow
                                        key={pkg.id}
                                        sx={problema ? { bgcolor: isLost ? '#FFEBEE' : '#FFF3E0' } : undefined}
                                      >
                                        <TableCell>
                                          <Typography variant="body2" fontFamily="monospace" sx={{ textDecoration: isLost ? 'line-through' : 'none' }}>
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
                                        <TableCell align="right" sx={problema ? { color: 'text.disabled' } : undefined}>${Number(pkg.pobox_cost_usd || 0).toFixed(2)}</TableCell>
                                        <TableCell align="right" sx={problema ? { color: 'text.disabled' } : undefined}>{formatCurrency(Number(pkg.pobox_service_cost || 0))}</TableCell>
                                        <TableCell align="center">
                                          <Typography variant="caption" color="text.secondary">
                                            {pkg.created_at ? new Date(pkg.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                                          </Typography>
                                        </TableCell>
                                        <TableCell align="center">
                                          <Typography variant="caption" color={(!problema && pkg.received_mty_at) ? 'text.primary' : 'text.disabled'}>
                                            {(!problema && pkg.received_mty_at) ? new Date(pkg.received_mty_at).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                                          </Typography>
                                        </TableCell>
                                        <TableCell align="center">
                                          {isLost ? (
                                            <Chip label="Perdido" size="small" color="error" variant="filled" />
                                          ) : isMissing ? (
                                            <Chip label="No llegó a MTY" size="small" color="warning" variant="filled" />
                                          ) : pkg.received_mty_at ? (
                                            <Chip label="Recibida" size="small" color="success" variant="outlined" />
                                          ) : (
                                            <Chip label="En tránsito" size="small" color="info" variant="outlined" />
                                          )}
                                        </TableCell>
                                        <TableCell align="center">
                                          {problema ? (
                                            <Typography variant="caption" color="text.disabled">No se paga</Typography>
                                          ) : pkg.costing_paid ? (
                                            <CheckCircleIcon color="success" fontSize="small" />
                                          ) : (
                                            <Typography variant="caption" color="warning.main">Pendiente</Typography>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    );
                                    })}
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
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          {pagoWizardStep !== 'consolidations' ? (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
              <Button onClick={() => setPagoProveedorDialogOpen(false)}>Cerrar</Button>
            </Box>
          ) : (
            <>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="body2" color={selectedConsolidaciones.size > 0 ? 'primary.main' : 'text.secondary'} fontWeight={selectedConsolidaciones.size > 0 ? 'bold' : 'normal'}>
              {selectedConsolidaciones.size === 0
                ? 'Selecciona consolidaciones para generar reporte o pagar'
                : `${selectedConsolidaciones.size} consolidación(es) seleccionada(s)`}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<ListAltIcon />}
              onClick={handleVerReferencias}
            >
              Ver Referencias
            </Button>
            <Tooltip title={selectedConsolidaciones.size === 0 ? 'Selecciona al menos una consolidación' : ''}>
              <span>
                <Button
                  variant="outlined"
                  color="inherit"
                  startIcon={creandoRef ? <CircularProgress size={16} /> : <AddCircleOutlineIcon />}
                  onClick={handleGenerarReferencia}
                  disabled={selectedConsolidaciones.size === 0 || creandoRef}
                >
                  Generar Referencia ({selectedConsolidaciones.size})
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={selectedConsolidaciones.size === 0 ? 'Selecciona al menos una consolidación' : 'Pagar todas las seleccionadas (omite faltantes y perdidas)'}>
              <span>
                <Button
                  variant="contained"
                  color="warning"
                  startIcon={<PaymentIcon />}
                  onClick={handleIniciarPagoMultiple}
                  disabled={selectedConsolidaciones.size === 0}
                >
                  Pagar {selectedConsolidaciones.size > 0 ? `(${selectedConsolidaciones.size})` : ''}
                </Button>
              </span>
            </Tooltip>
            <Button onClick={() => setPagoProveedorDialogOpen(false)}>
              Cerrar
            </Button>
          </Box>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* ── Modal: Referencias de Pago ─────────────────────────── */}
      <Dialog open={refModalOpen} onClose={() => setRefModalOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box display="flex" alignItems="center" gap={1}>
            <ListAltIcon color="warning" />
            <Typography fontWeight="bold">Referencias de Pago — {pagoProveedorSel?.name}</Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">{referencias.length} referencia(s)</Typography>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {loadingReferencias ? (
            <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
          ) : referencias.length === 0 ? (
            <Box p={4} textAlign="center">
              <Typography color="text.secondary">No hay referencias de pago para este proveedor.</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell><strong>Ref #</strong></TableCell>
                    <TableCell><strong>Fecha</strong></TableCell>
                    <TableCell><strong>Consolidaciones</strong></TableCell>
                    <TableCell align="center"><strong>Guías</strong></TableCell>
                    <TableCell align="right"><strong>Total USD</strong></TableCell>
                    <TableCell align="right"><strong>Total MXN</strong></TableCell>
                    <TableCell align="center"><strong>Acciones</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {referencias.map((ref) => {
                    const rows = ref.packages_data || [];
                    const totalUsd = rows.filter((r: any) => r.countsToTotal).reduce((s: number, r: any) => s + Number(r.usd || 0), 0);
                    const totalMxn = rows.filter((r: any) => r.countsToTotal).reduce((s: number, r: any) => s + Number(r.mxn || 0), 0);
                    const isDeleting = deletingRefId === ref.id;
                    return (
                      <TableRow key={ref.id} hover>
                        <TableCell><Typography fontWeight="bold" fontFamily="monospace">REF-{ref.id}</Typography></TableCell>
                        <TableCell>
                          <Typography variant="body2">{fmtDateRef(ref.created_at)}</Typography>
                          <Typography variant="caption" color="text.secondary">{new Date(ref.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</Typography>
                        </TableCell>
                        <TableCell>
                          <Box display="flex" gap={0.5} flexWrap="wrap">
                            {(ref.consolidation_ids || []).map((id: number) => (
                              <Chip key={id} label={`#${id}`} size="small" variant="outlined" color="primary" />
                            ))}
                          </Box>
                        </TableCell>
                        <TableCell align="center"><Chip label={ref.packages_count ?? rows.length} size="small" /></TableCell>
                        <TableCell align="right"><Typography fontWeight="bold" color="success.main">${Number(ref.total_usd || totalUsd).toFixed(2)}</Typography></TableCell>
                        <TableCell align="right"><Typography fontWeight="bold" color="primary.main">{Number(ref.total_mxn || totalMxn).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</Typography></TableCell>
                        <TableCell align="center">
                          <Box display="flex" gap={0.5} justifyContent="center">
                            <Tooltip title="Orden de Pago (REF)">
                              <IconButton size="small" color="primary" onClick={() => generateOrdenPagoFromRef(ref)}>
                                <AssignmentIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Descargar PDF detallado">
                              <IconButton size="small" color="error" onClick={() => { const r = ref.packages_data||[]; const u = r.filter((x:any)=>x.countsToTotal).reduce((s:number,x:any)=>s+Number(x.usd||0),0); const m = r.filter((x:any)=>x.countsToTotal).reduce((s:number,x:any)=>s+Number(x.mxn||0),0); handleGenerarPDF(); }}>
                                <PictureAsPdfIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Descargar Excel">
                              <IconButton size="small" color="success" onClick={() => generateExcelFromRef(ref)}>
                                <GridOnIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Eliminar referencia">
                              <IconButton size="small" color="error" disabled={isDeleting} onClick={() => setConfirmDeleteRefId(ref.id)}>
                                {isDeleting ? <CircularProgress size={16} /> : <DeleteIcon fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRefModalOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* ── Confirmar eliminar referencia ─────────────────────── */}
      <Dialog open={confirmDeleteRefId !== null} onClose={() => setConfirmDeleteRefId(null)} maxWidth="xs">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DeleteIcon color="error" /> Eliminar referencia
        </DialogTitle>
        <DialogContent>
          <Typography>¿Eliminar <strong>REF-{confirmDeleteRefId}</strong>? Esta acción no se puede deshacer.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteRefId(null)}>Cancelar</Button>
          <Button variant="contained" color="error" disabled={deletingRefId === confirmDeleteRefId}
            startIcon={deletingRefId === confirmDeleteRefId ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
            onClick={() => confirmDeleteRefId !== null && handleEliminarReferencia(confirmDeleteRefId)}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo: Pago múltiple de consolidaciones */}
      <Dialog
        open={pagoMultipleDialogOpen}
        onClose={() => !procesandoPagoMultiple && setPagoMultipleDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: 'primary.main', color: 'white' }}>
          💰 Pagar múltiples consolidaciones
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          {(() => {
            const selected = consolidacionesPendientes.filter(c => selectedConsolidaciones.has(c.id));
            const totalMxn = selected.reduce((s, c) => s + Number(c.total_cost_mxn || 0), 0);
            const totalUsd = selected.reduce((s, c) => s + Number(c.total_cost_usd || 0), 0);
            const pagables = selected.filter(c => Number(c.total_cost_mxn || 0) > 0);
            const sinMonto = selected.length - pagables.length;
            return (
              <Box>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Se procesará el pago de <strong>{pagables.length}</strong> consolidación(es) de las {selected.length} seleccionadas.
                  {sinMonto > 0 && <> {sinMonto} será(n) omitida(s) por no tener guías recibidas para pagar (en tránsito o ya pagadas).</>}
                  <br />
                  <strong>Solo se pagan guías recibidas. Las guías en tránsito, faltantes y perdidas no se suman ni se marcan como pagadas.</strong>
                </Alert>
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 2, maxHeight: 280 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Consolidación</strong></TableCell>
                        <TableCell><strong>Proveedor</strong></TableCell>
                        <TableCell align="center"><strong>Cajas</strong></TableCell>
                        <TableCell align="right"><strong>MXN</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selected.map(c => (
                        <TableRow key={c.id}>
                          <TableCell>#{c.id}</TableCell>
                          <TableCell>{c.supplier_name}</TableCell>
                          <TableCell align="center">
                            <Chip label={Number(c.package_count || 0)} size="small" color="primary" variant="outlined" />
                          </TableCell>
                          <TableCell align="right">
                            {Number(c.total_cost_mxn || 0) > 0
                              ? formatCurrency(Number(c.total_cost_mxn))
                              : <Typography variant="caption" color="text.disabled">Sin monto</Typography>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Paper sx={{ p: 2, bgcolor: 'warning.light', mb: 2 }}>
                  <Grid container spacing={1}>
                    <Grid size={{ xs: 4 }}>
                      <Typography variant="caption" color="text.secondary">Total USD</Typography>
                      <Typography variant="h6" fontWeight="bold">${totalUsd.toFixed(2)}</Typography>
                    </Grid>
                    <Grid size={{ xs: 4 }}>
                      <Typography variant="caption" color="text.secondary">Total cajas</Typography>
                      <Typography variant="h6" fontWeight="bold">{pagables.reduce((s, c) => s + Number(c.package_count || 0), 0)}</Typography>
                    </Grid>
                    <Grid size={{ xs: 4 }}>
                      <Typography variant="caption" color="text.secondary">Total MXN a pagar</Typography>
                      <Typography variant="h6" fontWeight="bold" color="primary.dark">{formatCurrency(totalMxn)}</Typography>
                    </Grid>
                  </Grid>
                </Paper>
                <TextField
                  fullWidth
                  label="Referencia de pago (opcional)"
                  value={pagoMultipleRef}
                  onChange={(e) => setPagoMultipleRef(e.target.value)}
                  sx={{ mb: 2 }}
                  placeholder="Ej: Transferencia BBVA 1234"
                />
                <TextField
                  fullWidth
                  label="Notas (opcional)"
                  value={pagoMultipleNotas}
                  onChange={(e) => setPagoMultipleNotas(e.target.value)}
                  multiline
                  rows={2}
                />
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setPagoMultipleDialogOpen(false)} disabled={procesandoPagoMultiple}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="warning"
            startIcon={<PaymentIcon />}
            onClick={handleConfirmarPagoMultiple}
            disabled={procesandoPagoMultiple}
          >
            {procesandoPagoMultiple ? 'Procesando...' : 'Confirmar pago'}
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
                    <Typography variant="body2" color="text.secondary">Paquetes a pagar</Typography>
                    <Typography variant="h6">
                      {Math.max(0, Number(consolidacionAPagar.package_count || 0) - Number(consolidacionAPagar.missing_count || 0) - Number(consolidacionAPagar.lost_count || 0))}
                      {' / '}
                      {consolidacionAPagar.package_count}
                    </Typography>
                    {(Number(consolidacionAPagar.missing_count || 0) + Number(consolidacionAPagar.lost_count || 0)) > 0 && (
                      <Typography variant="caption" color="warning.main">
                        {Number(consolidacionAPagar.missing_count || 0) + Number(consolidacionAPagar.lost_count || 0)} pendiente(s) de llegar
                      </Typography>
                    )}
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

      {/* Dialog editar transacción (solo super admin, edita monto) */}
      <Dialog open={editTxDialog.open} onClose={() => !editTxDialog.saving && setEditTxDialog({ open: false, tx: null, monto: '', fecha: '', saving: false, error: null })} maxWidth="xs" fullWidth>
        <DialogTitle>Editar transacción #{editTxDialog.tx?.id}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Tipo: <b>{editTxDialog.tx?.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}</b> · Concepto: {editTxDialog.tx?.concepto || '—'}
          </Typography>
          <TextField
            label="Monto"
            type="text"
            inputMode="decimal"
            fullWidth
            autoFocus
            value={editTxDialog.monto}
            onChange={(e) => setEditTxDialog(p => ({ ...p, monto: e.target.value }))}
            disabled={editTxDialog.saving}
          />
          <TextField
            label="Fecha y hora"
            type="datetime-local"
            fullWidth
            value={editTxDialog.fecha}
            onChange={(e) => setEditTxDialog(p => ({ ...p, fecha: e.target.value }))}
            disabled={editTxDialog.saving}
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 2 }}
          />
          {editTxDialog.error && (
            <Alert severity="error" sx={{ mt: 2 }}>{editTxDialog.error}</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTxDialog({ open: false, tx: null, monto: '', fecha: '', saving: false, error: null })} disabled={editTxDialog.saving}>Cancelar</Button>
          <Button variant="contained" onClick={handleSaveEditTx} disabled={editTxDialog.saving}>
            {editTxDialog.saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CajaChicaPage;
