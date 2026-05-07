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
  AccountBalanceWallet,
  ContentPaste,
  UploadFile,
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

// Formas de pago: etiqueta + color + icono (emoji)
const PAYMENT_METHOD_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  cash: { label: 'Efectivo', color: '#27ae60', icon: '💵' },
  efectivo: { label: 'Efectivo', color: '#27ae60', icon: '💵' },
  spei: { label: 'SPEI', color: '#1565C0', icon: '🏦' },
  transfer: { label: 'SPEI', color: '#1565C0', icon: '🏦' },
  transferencia: { label: 'SPEI', color: '#1565C0', icon: '🏦' },
  card: { label: 'Tarjeta', color: '#6A1B9A', icon: '💳' },
  tarjeta: { label: 'Tarjeta', color: '#6A1B9A', icon: '💳' },
  openpay: { label: 'Tarjeta', color: '#6A1B9A', icon: '💳' },
  paypal: { label: 'PayPal', color: '#0070BA', icon: '🅿️' },
  wallet: { label: 'Saldo a favor', color: '#00838F', icon: '👛' },
  credit: { label: 'Crédito', color: '#AD1457', icon: '📊' },
};

const getPaymentMethodInfo = (method?: string) => {
  const key = String(method || '').toLowerCase().trim();
  return PAYMENT_METHOD_LABELS[key] || { label: method || 'N/D', color: '#757575', icon: '💰' };
};

// Formatear fecha/hora en zona horaria de México (evita desfase por UTC)
const MX_TZ = 'America/Mexico_City';
const formatDateMX = (v?: string | Date | null) => {
  if (!v) return '-';
  try { return new Date(v).toLocaleDateString('es-MX', { timeZone: MX_TZ, day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return '-'; }
};
const formatTimeMX = (v?: string | Date | null) => {
  if (!v) return '';
  try { return new Date(v).toLocaleTimeString('es-MX', { timeZone: MX_TZ, hour: '2-digit', minute: '2-digit', hour12: true }); } catch { return ''; }
};

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
  referencia?: string;
  credit_applied?: number;
  wallet_applied?: number;
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
  total_bruto: number;
  total_neto: number;
  efectivo_neto: number;
  paypal_neto: number;
  comisiones: number;
  transacciones: number;
}

interface Empresa {
  id: number;
  alias: string;
  rfc: string;
  openpay_merchant_id: string;
  openpay_production_mode: boolean;
  bank_name: string | null;
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
  saldos_bancarios: Record<number, { saldo: number; fecha: string }>;
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
  const [voucherGallery, setVoucherGallery] = useState<{ open: boolean; payment: any; vouchers: any[]; loading: boolean }>({ open: false, payment: null, vouchers: [], loading: false });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'info' | 'warning' });

  // Estado de Cuenta
  const [estadoCuentaRaw, setEstadoCuentaRaw] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  interface EstadoCuentaRow {
    fecha: string;
    concepto: string;
    referencia: string;
    cargo: number | null;
    abono: number | null;
    saldo: number;
  }
  const [estadoCuentaRows, setEstadoCuentaRows] = useState<EstadoCuentaRow[]>([]);
  const [estadoCuentaBanco] = useState('bbva');
  const [refMatchModal, setRefMatchModal] = useState<{ open: boolean; loading: boolean; matches: any[]; wrongAccount: any[]; unmatched: any[]; summary: any } | null>(null);
  const [confirmAuthorize, setConfirmAuthorize] = useState<{ open: boolean; toAuthorize: any[]; totalSurplus: number } | null>(null);
  const [_loadingSavedEntries, setLoadingSavedEntries] = useState(false);
  const [_savedEntriesCount, setSavedEntriesCount] = useState<number | null>(null);
  const [belvoSyncing, setBelvoSyncing] = useState(false);

  // Parser BBVA
  const parseBBVA = (text: string): EstadoCuentaRow[] => {
    const lines = text.split('\n').filter(l => l.trim());
    const parseAmount = (s: string): number | null => {
      if (!s || !s.trim()) return null;
      const clean = s.trim().replace(/,/g, '').replace(/\$/g, '');
      const num = parseFloat(clean);
      return isNaN(num) ? null : num;
    };

    // PASS 1: Extract raw data (fecha, concepto, amount, saldo) without guessing cargo/abono
    type RawRow = { fecha: string; concepto: string; referencia: string; amount: number | null; saldo: number; hasThreeAmounts: boolean; cargo: number | null; abono: number | null };
    const rawRows: RawRow[] = [];
    for (const line of lines) {
      const match = line.match(/^(\d{2}-\d{2}-\d{4})\s+(.+?)\s{2,}/);
      if (!match) continue;
      const fecha = match[1];
      const parts = line.replace(fecha, '').trim();
      const segments = parts.split(/\t+/).length > 1
        ? parts.split(/\t+/)
        : parts.split(/\s{2,}/);
      if (segments.length < 2) continue;
      const concepto = segments[0].trim();
      const amounts = segments.slice(1).map(s => s.trim()).filter(s => s);

      let cargo: number | null = null;
      let abono: number | null = null;
      let saldo = 0;
      let amount: number | null = null;
      let hasThreeAmounts = false;

      if (amounts.length === 3) {
        // Explicit: cargo, abono, saldo (BBVA uses '-' or empty for missing)
        cargo = parseAmount(amounts[0]);
        abono = parseAmount(amounts[1]);
        saldo = parseAmount(amounts[2]) || 0;
        hasThreeAmounts = true;
      } else if (amounts.length === 2) {
        // amount + saldo — we don't know yet if it's cargo or abono
        amount = parseAmount(amounts[0]);
        saldo = parseAmount(amounts[1]) || 0;
      } else {
        continue;
      }

      if (hasThreeAmounts && !cargo && !abono) continue;
      if (!hasThreeAmounts && amount === null) continue;

      const slashIdx = concepto.indexOf('/');
      const conceptoClean = slashIdx > 0 ? concepto.substring(0, slashIdx).trim() : concepto;
      const referenciaClean = slashIdx > 0 ? concepto.substring(slashIdx + 1).trim() : '';

      rawRows.push({ fecha, concepto: conceptoClean, referencia: referenciaClean, amount, saldo, hasThreeAmounts, cargo, abono });
    }

    // PASS 2: Determine cargo/abono for 2-amount rows using saldo comparison
    // Statement is newest-first, so row[i+1] is chronologically BEFORE row[i]
    // cargo/abono = saldo[i] - saldo[i+1]: positive = abono, negative = cargo
    const rows: EstadoCuentaRow[] = [];
    for (let i = 0; i < rawRows.length; i++) {
      const r = rawRows[i];
      if (r.hasThreeAmounts) {
        rows.push({ fecha: r.fecha, concepto: r.concepto, referencia: r.referencia, cargo: r.cargo, abono: r.abono, saldo: r.saldo });
        continue;
      }
      // Compare with next row (older = chronologically prior)
      const olderRow = rawRows[i + 1];
      if (olderRow) {
        const diff = r.saldo - olderRow.saldo; // positive = saldo went up = abono
        if (diff >= 0) {
          rows.push({ fecha: r.fecha, concepto: r.concepto, referencia: r.referencia, cargo: null, abono: Math.abs(r.amount || diff), saldo: r.saldo });
        } else {
          rows.push({ fecha: r.fecha, concepto: r.concepto, referencia: r.referencia, cargo: Math.abs(r.amount || diff), abono: null, saldo: r.saldo });
        }
      } else {
        // Last row (oldest) — no older row to compare, use amount as-is; default cargo
        rows.push({ fecha: r.fecha, concepto: r.concepto, referencia: r.referencia, cargo: r.amount, abono: null, saldo: r.saldo });
      }
    }
    return rows;
  };

  // Parser Banregio CSV
  const parseBanregio = (csvText: string): EstadoCuentaRow[] => {
    const parseAmount = (s: string): number | null => {
      if (!s || !s.trim()) return null;
      const clean = s.trim().replace(/,/g, '').replace(/\$/g, '').replace(/"/g, '');
      const num = parseFloat(clean);
      return isNaN(num) ? null : num;
    };

    const lines = csvText.split('\n');
    // Find header line
    let headerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes('fecha') && lines[i].toLowerCase().includes('descripci')) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) return [];

    const rows: EstadoCuentaRow[] = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Parse CSV respecting quoted fields
      const fields: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let c = 0; c < line.length; c++) {
        if (line[c] === '"') {
          inQuotes = !inQuotes;
        } else if (line[c] === ',' && !inQuotes) {
          fields.push(current);
          current = '';
        } else {
          current += line[c];
        }
      }
      fields.push(current);

      if (fields.length < 6) continue;

      const [fechaRaw, descripcion, referencia, cargoRaw, abonoRaw, saldoRaw] = fields;

      // Skip "Saldo Inicial" row
      if (descripcion && descripcion.toLowerCase().includes('saldo inicial')) continue;

      // Parse date DD/MM/YYYY → DD-MM-YYYY
      const dateMatch = fechaRaw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!dateMatch) continue;
      const fecha = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;

      const cargo = parseAmount(cargoRaw);
      const abono = parseAmount(abonoRaw);
      const saldo = parseAmount(saldoRaw) || 0;

      if (cargo === null && abono === null) continue;

      rows.push({
        fecha,
        concepto: (descripcion || '').trim().replace(/"/g, ''),
        referencia: (referencia || '').trim().replace(/^_/, '').replace(/"/g, ''),
        cargo,
        abono,
        saldo,
      });
    }
    return rows;
  };

  // Regex para detectar referencias de pago: XX-8HEXCHARS
  const REF_PATTERN = /\b([A-Z]{2}-[A-F0-9]{8})\b/gi;

  const extractReferences = (rows: EstadoCuentaRow[]): { ref: string; entries: EstadoCuentaRow[] }[] => {
    const refMap: Record<string, EstadoCuentaRow[]> = {};
    for (const row of rows) {
      const text = `${row.concepto} ${row.referencia}`;
      const found = text.match(REF_PATTERN);
      if (found) {
        for (const m of found) {
          const ref = m.toUpperCase();
          if (!refMap[ref]) refMap[ref] = [];
          refMap[ref].push(row);
        }
      }
    }
    return Object.entries(refMap).map(([ref, entries]) => ({ ref, entries }));
  };

  const loadSavedBankEntries = async () => {
    const empresaFilt = filterServicio !== 'all' ? getEmpresaAsignada(data?.empresas || [], filterServicio) : null;
    if (!empresaFilt) return;
    setLoadingSavedEntries(true);
    try {
      const res = await api.get(`/admin/finance/bank-entries?empresa_id=${empresaFilt.id}`);
      if (res.data.entries && res.data.entries.length > 0) {
        const mapped = res.data.entries.map((e: any) => {
          // Parse date from ISO string directly to avoid timezone shift
          // e.fecha = "2026-04-15T00:00:00.000Z" → extract "2026-04-15" → "15-04-2026"
          let fechaStr = '';
          if (e.fecha) {
            const isoDate = e.fecha.substring(0, 10); // "2026-04-15"
            const [yyyy, mm, dd] = isoDate.split('-');
            fechaStr = `${dd}-${mm}-${yyyy}`;
          }
          return {
            fecha: fechaStr,
            concepto: e.concepto,
            referencia: e.referencia,
            cargo: e.cargo ? parseFloat(e.cargo) : null,
            abono: e.abono ? parseFloat(e.abono) : null,
            saldo: e.saldo ? parseFloat(e.saldo) : 0,
          };
        });
        setEstadoCuentaRows(sortRowsDesc(mapped));
        setSavedEntriesCount(mapped.length);
        setSnackbar({ open: true, message: `📋 ${mapped.length} movimientos cargados desde la base de datos`, severity: 'success' });
      } else {
        setSavedEntriesCount(0);
        setSnackbar({ open: true, message: 'No hay movimientos guardados para este período', severity: 'info' });
      }
    } catch (err: any) {
      setSnackbar({ open: true, message: 'Error cargando historial: ' + (err.response?.data?.error || err.message), severity: 'error' });
    }
    setLoadingSavedEntries(false);
  };

  // Sort rows by date descending (most recent first)
  const sortRowsDesc = (rows: EstadoCuentaRow[]): EstadoCuentaRow[] => {
    return [...rows].sort((a, b) => {
      // fecha format: DD-MM-YYYY
      const [da, ma, ya] = a.fecha.split('-');
      const [db, mb, yb] = b.fecha.split('-');
      const dateA = `${ya}${ma}${da}`;
      const dateB = `${yb}${mb}${db}`;
      return dateB.localeCompare(dateA);
    });
  };

  const handleParseEstadoCuenta = async (bancoOverride?: string) => {
    const banco = bancoOverride || estadoCuentaBanco;
    let rows: EstadoCuentaRow[] = [];
    if (banco === 'bbva') {
      rows = parseBBVA(estadoCuentaRaw);
    } else if (banco === 'banregio') {
      if (!csvFile) {
        setSnackbar({ open: true, message: '⚠️ Selecciona un archivo CSV de Banregio.', severity: 'error' });
        return;
      }
      const text = await csvFile.text();
      rows = parseBanregio(text);
    }
    setEstadoCuentaRows(sortRowsDesc(rows));
    if (rows.length === 0) {
      setSnackbar({ open: true, message: '⚠️ No se pudieron extraer movimientos. Verifica el formato.', severity: 'error' });
      return;
    }

    // 1. Guardar en BD y obtener solo las nuevas
    const empresaFilt = filterServicio !== 'all' ? getEmpresaAsignada(data?.empresas || [], filterServicio) : null;
    if (!empresaFilt) {
      setSnackbar({ open: true, message: '⚠️ Selecciona un servicio/empresa para guardar los movimientos.', severity: 'error' });
      return;
    }

    let newEntries: EstadoCuentaRow[] = [];
    let duplicateCount = 0;
    try {
      const saveRes = await api.post('/admin/finance/save-bank-entries', {
        entries: rows,
        empresa_id: empresaFilt.id,
        service_type: empresaFilt.servicio_asignado,
        banco: estadoCuentaBanco,
      });
      newEntries = saveRes.data.new_entries || [];
      duplicateCount = saveRes.data.duplicate_count || 0;
    } catch (err: any) {
      console.error('Error saving bank entries:', err);
      setSnackbar({ open: true, message: 'Error guardando movimientos: ' + (err.response?.data?.error || err.message), severity: 'error' });
      return;
    }

    if (newEntries.length === 0) {
      setSnackbar({ open: true, message: `ℹ️ ${rows.length} movimientos extraídos, pero todos ya estaban guardados (${duplicateCount} duplicados). No hay líneas nuevas que procesar.`, severity: 'info' });
      return;
    }

    const infoMsg = duplicateCount > 0
      ? `💾 ${newEntries.length} movimientos nuevos guardados (${duplicateCount} duplicados descartados).`
      : `💾 ${newEntries.length} movimientos nuevos guardados.`;

    // 2. Solo buscar referencias en las líneas NUEVAS
    const refs = extractReferences(newEntries);
    if (refs.length === 0) {
      setSnackbar({ open: true, message: `${infoMsg} No se detectaron referencias de pago en las líneas nuevas.`, severity: 'success' });
      return;
    }

    // 3. Buscar referencias en BD
    setRefMatchModal({ open: true, loading: true, matches: [], wrongAccount: [], unmatched: [], summary: null });
    try {
      const res = await api.post('/admin/finance/match-references', {
        references: refs,
        empresa_id: empresaFilt?.id || null,
      });
      if (res.data.success) {
        setRefMatchModal({
          open: true,
          loading: false,
          matches: res.data.matches || [],
          wrongAccount: res.data.wrongAccount || [],
          unmatched: res.data.unmatched || [],
          summary: { ...res.data.summary, infoMsg },
        });
      }
    } catch (err) {
      console.error('Error matching refs:', err);
      setRefMatchModal(null);
      setSnackbar({ open: true, message: `${infoMsg} Error buscando referencias.`, severity: 'error' });
    }
  };

  const handleAutorizarBankPayments = () => {
    if (!refMatchModal?.matches?.length) return;
    const toAuthorize = refMatchModal.matches.filter((m: any) => m.status !== 'paid' && m.total_bank_abonos >= m.amount);
    if (toAuthorize.length === 0) {
      setSnackbar({ open: true, message: 'No hay pagos pendientes que autorizar (todos pagados o monto insuficiente)', severity: 'info' });
      return;
    }
    const totalSurplus = toAuthorize.reduce((s: number, m: any) => s + Math.max(0, m.total_bank_abonos - m.amount), 0);
    setConfirmAuthorize({ open: true, toAuthorize, totalSurplus });
  };

  const executeAutorizarBankPayments = async () => {
    if (!confirmAuthorize?.toAuthorize?.length) return;
    const toAuthorize = confirmAuthorize.toAuthorize;
    setConfirmAuthorize(null);
    setRefMatchModal(prev => prev ? { ...prev, loading: true } : prev);
    try {
      const res = await api.post('/admin/finance/authorize-bank-payments', { matches: toAuthorize });
      const { summary, results } = res.data;
      let msg = `✅ ${summary.authorized} pago(s) autorizado(s)`;
      if (summary.already_paid > 0) msg += `, ${summary.already_paid} ya pagado(s)`;
      if (summary.errors > 0) msg += `, ${summary.errors} error(es)`;
      const totalSurplus = results.filter((r: any) => r.surplus > 0).reduce((s: number, r: any) => s + r.surplus, 0);
      if (totalSurplus > 0) msg += `. Excedente acreditado: $${totalSurplus.toFixed(2)}`;
      setSnackbar({ open: true, message: msg, severity: summary.errors > 0 ? 'warning' : 'success' });
      setRefMatchModal(null);
    } catch (err: any) {
      console.error('Error authorizing:', err);
      setSnackbar({ open: true, message: 'Error al autorizar pagos: ' + (err.response?.data?.error || err.message), severity: 'error' });
      setRefMatchModal(prev => prev ? { ...prev, loading: false } : prev);
    }
  };

  const token = localStorage.getItem('token') || '';
  const currentUserRole = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').role || ''; } catch { return ''; } })();
  const isSuperAdmin = currentUserRole === 'super_admin';

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

  // Auto-cargar historial de estado de cuenta al entrar al tab 2 o al cambiar empresa
  useEffect(() => {
    if (tabValue === 2 && data) {
      setEstadoCuentaRows([]);
      loadSavedBankEntries();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabValue, data, filterServicio]);

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
  const getTransactionMethods = (t: Transaccion) => {
    const methods: string[] = [];
    const base = String(t.metodo || '').toLowerCase().trim();

    if (base) methods.push(base);
    if (Number(t.credit_applied || 0) > 0) methods.push('credit');
    if (Number(t.wallet_applied || 0) > 0) methods.push('wallet');

    if (methods.length === 0) methods.push('cash');
    return Array.from(new Set(methods));
  };

  const normalizeMethod = (method: string) => {
    const key = String(method || '').toLowerCase().trim();
    if (['efectivo', 'cash'].includes(key)) return 'cash';
    if (['card', 'tarjeta', 'openpay'].includes(key)) return 'card';
    if (['spei', 'transfer', 'transferencia'].includes(key)) return 'spei';
    return key;
  };

  const filteredTransacciones = data?.transacciones.filter((t) => {
    const matchCliente = !filterCliente || t.cliente?.toLowerCase().includes(filterCliente.toLowerCase());
    const methods = getTransactionMethods(t).map(normalizeMethod);
    const selectedMethod = normalizeMethod(filterMetodo);
    const matchMetodo = filterMetodo === 'all' || methods.includes(selectedMethod);
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
                <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100', color: '#000' }}>Referencia</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100', color: '#000' }}>Cliente</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.100', color: '#000' }}>Monto</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100', color: '#000' }}>Servicio</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100', color: '#000' }}>Forma de Pago</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100', color: '#000' }}>Fecha de Pago</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: 'grey.100', color: '#000' }}>Acciones</TableCell>
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
                      {(() => {
                        const methods: string[] = [];
                        if (Number(payment.credit_applied) > 0) methods.push('credit');
                        if (Number(payment.wallet_applied) > 0) methods.push('wallet');
                        const base = String(payment.payment_method || '').toLowerCase();
                        // Si aún queda saldo pendiente (monto > 0) el método base completa el pago
                        if (Number(payment.monto) > 0 && base) methods.push(base);
                        if (methods.length === 0) methods.push(base || 'cash');
                        // Deduplicar preservando orden
                        const unique = Array.from(new Set(methods));
                        return (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {unique.map((m, idx) => {
                              const info = getPaymentMethodInfo(m);
                              return (
                                <Chip
                                  key={`${m}-${idx}`}
                                  label={`${info.icon} ${info.label}`}
                                  size="small"
                                  sx={{ bgcolor: info.color, color: 'white', fontWeight: 'bold', fontSize: '0.7rem' }}
                                />
                              );
                            })}
                          </Box>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {formatDateMX(payment.created_at)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatTimeMX(payment.created_at)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        {payment.source === 'pobox' && (
                          <Tooltip title="Ver comprobantes de pago" arrow>
                            <Button
                              variant="outlined"
                              size="small"
                              sx={{ minWidth: 'auto', px: 1, borderColor: '#1565C0', color: '#1565C0', fontSize: '0.7rem' }}
                              onClick={async () => {
                                setVoucherGallery({ open: true, payment, vouchers: [], loading: true });
                                try {
                                  const res = await api.get(`/admin/vouchers/order/${payment.id}`);
                                  setVoucherGallery(prev => ({ ...prev, vouchers: res.data.vouchers || [], loading: false }));
                                } catch (e) {
                                  setVoucherGallery(prev => ({ ...prev, loading: false }));
                                }
                              }}
                            >
                              🖼️ {payment.voucher_count || 0}
                            </Button>
                          </Tooltip>
                        )}
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
                      </Box>
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

      {/* Tabs siempre visibles */}
      <Paper sx={{ borderRadius: 3, mb: 3 }}>
        <Tabs 
          value={tabValue} 
          onChange={(_, v) => setTabValue(v)}
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
        >
          <Tab icon={<TrendingUp />} label="Consolidado" />
          <Tab icon={<Receipt />} label="Transacciones" />
          <Tab icon={<AccountBalanceWallet />} label="Estado de Cuenta" />
        </Tabs>
      </Paper>

      {/* Si hay filtro de servicio activo, mostrar solo transacciones */}
      {filterServicio !== 'all' && tabValue <= 1 ? (
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
                  <MenuItem value="card">Tarjeta</MenuItem>
                  <MenuItem value="spei">SPEI</MenuItem>
                  <MenuItem value="paypal">PayPal</MenuItem>
                  <MenuItem value="credit">Crédito</MenuItem>
                  <MenuItem value="wallet">Saldo a favor</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <TableContainer sx={{ maxHeight: 500 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100', color: '#000' }}>Fecha/Hora</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100', color: '#000' }}>Cliente</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.100', color: '#000' }}>Monto Neto</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: 'grey.100', color: '#000' }}>Método</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100', color: '#000' }}>Concepto</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: 'grey.100', color: '#000' }}>Estado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredTransacciones.length > 0 ? (
                    filteredTransacciones.map((tx) => (
                      <TableRow key={`${tx.metodo}-${tx.id}`} hover>
                        <TableCell>
                          <Typography variant="body2">
                              {formatDateMX(tx.fecha_hora)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                              {formatTimeMX(tx.fecha_hora)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {tx.cliente}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight="bold" color="success.main">
                            {formatCurrency(tx.monto_neto)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, justifyContent: 'center' }}>
                            {getTransactionMethods(tx).map((method, idx) => {
                              const info = getPaymentMethodInfo(method);
                              return (
                                <Chip
                                  key={`${tx.id}-${method}-${idx}`}
                                  label={`${info.icon} ${info.label}`}
                                  size="small"
                                  sx={{ bgcolor: info.color, color: 'white', fontWeight: 'bold' }}
                                />
                              );
                            })}
                          </Box>
                        </TableCell>
                        <TableCell>
                          {tx.concepto && tx.concepto.length > 50 ? (
                            <Box>
                              <Typography variant="body2" sx={{ maxWidth: 250 }}>
                                {tx.concepto.substring(0, 50)}...
                              </Typography>
                              <Button size="small" sx={{ textTransform: 'none', p: 0, minWidth: 0, fontSize: '0.7rem' }}
                                onClick={(e) => {
                                  const el = (e.currentTarget.parentElement?.querySelector('.concepto-full') as HTMLElement);
                                  if (el) { el.style.display = el.style.display === 'none' ? 'block' : 'none'; }
                                  e.currentTarget.textContent = e.currentTarget.textContent === '▶ Ver más' ? '▼ Ocultar' : '▶ Ver más';
                                }}
                              >▶ Ver más</Button>
                              <Typography className="concepto-full" variant="body2" sx={{ display: 'none', maxWidth: 300, whiteSpace: 'pre-wrap', mt: 0.5 }}>
                                {tx.concepto}
                              </Typography>
                            </Box>
                          ) : (
                            <Typography variant="body2">{tx.concepto}</Typography>
                          )}
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
                      <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
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
              {(data?.empresas || []).map((emp, idx) => {
                const ingreso = (data?.ingresos_por_empresa || []).find((ie: any) => ie.empresa_id === emp.id);
                const saldoBanco = data?.saldos_bancarios?.[emp.id];
                const empresaCount = (data?.empresas || []).length;
                const mdSize = empresaCount <= 2 ? 6 : empresaCount === 4 ? 3 : 4;
                return (
                <Grid size={{ xs: 12, sm: 6, md: mdSize }} key={emp.id}>
                  <Card sx={{ 
                    background: `linear-gradient(135deg, ${EMPRESA_COLORS[idx % EMPRESA_COLORS.length]} 0%, ${EMPRESA_COLORS[(idx + 1) % EMPRESA_COLORS.length]}aa 100%)`,
                    color: 'white',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}>
                    <CardContent sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" sx={{ opacity: 0.9, fontWeight: 'bold' }}>{emp.alias}</Typography>
                          <Typography variant="caption" sx={{ opacity: 0.7 }}>
                            {emp.bank_name || 'Sin banco'} • RFC: {emp.rfc}
                          </Typography>

                          {/* Saldo Bancario */}
                          {saldoBanco ? (
                            <Box sx={{ mt: 1.5, p: 1, bgcolor: 'rgba(255,255,255,0.15)', borderRadius: 1 }}>
                              <Typography variant="caption" sx={{ opacity: 0.8 }}>💰 Saldo Bancario</Typography>
                              <Typography variant="h5" fontWeight="bold">
                                {formatCurrency(saldoBanco.saldo)}
                              </Typography>
                              <Typography variant="caption" sx={{ opacity: 0.6, fontSize: '0.65rem' }}>
                                Último mov: {saldoBanco.fecha ? (() => {
                                  const d = saldoBanco.fecha.substring(0, 10);
                                  const [y, m, dd] = d.split('-');
                                  return `${dd}/${m}/${y}`;
                                })() : '—'}
                              </Typography>
                            </Box>
                          ) : (
                            <Box sx={{ mt: 1.5, p: 1, bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 1 }}>
                              <Typography variant="caption" sx={{ opacity: 0.6 }}>💰 Sin estado de cuenta cargado</Typography>
                            </Box>
                          )}

                          {/* Ingresos del período */}
                          <Box sx={{ mt: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="caption" sx={{ opacity: 0.7 }}>📈 Ingresos del Período</Typography>
                              <Chip 
                                label={`${ingreso?.transacciones || 0} txns`}
                                size="small"
                                sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontSize: '0.7rem' }}
                              />
                            </Box>
                            <Typography variant="h6" fontWeight="bold">
                              {formatCurrency(ingreso?.total_neto || 0)}
                            </Typography>
                            {ingreso && (
                              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                                {ingreso.efectivo_neto > 0 && (
                                  <Chip label={`💵 ${formatCurrency(ingreso.efectivo_neto)}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontSize: '0.65rem', height: 20 }} />
                                )}
                                {ingreso.spei_neto > 0 && (
                                  <Chip label={`🏦 ${formatCurrency(ingreso.spei_neto)}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontSize: '0.65rem', height: 20 }} />
                                )}
                                {ingreso.paypal_neto > 0 && (
                                  <Chip label={`🅿️ ${formatCurrency(ingreso.paypal_neto)}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontSize: '0.65rem', height: 20 }} />
                                )}
                              </Box>
                            )}
                          </Box>
                        </Box>
                        <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                          <AccountBalance />
                        </Avatar>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
                );
              })}
              {(!data?.empresas || data.empresas.length === 0) && (
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
                <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100', color: '#000' }}>Fecha/Hora</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100', color: '#000' }}>Cliente</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.100', color: '#000' }}>Referencia</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'grey.100', color: '#000' }}>Monto Neto</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: 'grey.100', color: '#000' }}>Método</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: 'grey.100', color: '#000' }}>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredTransacciones.length > 0 ? (
                filteredTransacciones.map((tx) => (
                  <TableRow key={`${tx.metodo}-${tx.id}`} hover>
                    <TableCell>
                      <Typography variant="body2">
                        {formatDateMX(tx.fecha_hora)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatTimeMX(tx.fecha_hora)}
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
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {tx.referencia || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight="bold" color="success.main">
                        {formatCurrency(tx.monto_neto)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, justifyContent: 'center' }}>
                        {getTransactionMethods(tx).map((method, idx) => {
                          const info = getPaymentMethodInfo(method);
                          return (
                            <Chip
                              key={`${tx.id}-${method}-${idx}`}
                              label={`${info.icon} ${info.label}`}
                              size="small"
                              sx={{ bgcolor: info.color, color: 'white', fontWeight: 'bold' }}
                            />
                          );
                        })}
                      </Box>
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
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
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

      {/* TAB 2: Estado de Cuenta - siempre visible independiente del filtro */}
      {tabValue === 2 && (() => {
        // Detectar banco automáticamente si hay filtro de servicio
        const empresaFiltrada = filterServicio !== 'all' ? getEmpresaAsignada(data?.empresas || [], filterServicio) : null;
        const bancoDetectado = empresaFiltrada?.bank_name
          ? empresaFiltrada.bank_name.toLowerCase().includes('bbva') ? 'bbva'
            : empresaFiltrada.bank_name.toLowerCase().includes('banregio') ? 'banregio'
            : empresaFiltrada.bank_name.toLowerCase().includes('banorte') ? 'banorte'
            : empresaFiltrada.bank_name.toLowerCase().includes('hsbc') ? 'hsbc'
            : empresaFiltrada.bank_name.toLowerCase().includes('santander') ? 'santander'
            : 'bbva'
          : null;
        const bancoActivo = bancoDetectado || estadoCuentaBanco;
        const bancoFijo = !!bancoDetectado;

        return filterServicio === 'all' && !empresaFiltrada ? (
          // Sin filtro: mostrar selector de servicio
          <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ bgcolor: '#1565C0', color: 'white', px: 3, py: 2 }}>
              <Typography variant="h6" fontWeight="bold">🏦 Estado de Cuenta Bancario</Typography>
            </Box>
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <AccountBalanceWallet sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} />
              <Typography variant="h6" gutterBottom>Selecciona un servicio</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Para cargar un estado de cuenta, primero filtra por el servicio correspondiente usando el filtro de la parte superior.
                El banco se detectará automáticamente según la empresa configurada.
              </Typography>
              <Grid container spacing={2} justifyContent="center" sx={{ maxWidth: 600, mx: 'auto' }}>
                {(data?.empresas || []).filter(e => e.bank_name).map((emp) => (
                  <Grid size={{ xs: 12, sm: 6 }} key={emp.id}>
                    <Card 
                      sx={{ cursor: 'pointer', border: '2px solid transparent', '&:hover': { borderColor: '#1565C0', bgcolor: '#E3F2FD' }, borderRadius: 2 }}
                      onClick={() => setFilterServicio(emp.servicio_asignado)}
                    >
                      <CardContent sx={{ textAlign: 'center', py: 2 }}>
                        <Typography variant="subtitle1" fontWeight="bold">{emp.alias}</Typography>
                        <Chip label={SERVICE_LABELS[emp.servicio_asignado]?.label || emp.servicio_asignado} size="small" sx={{ bgcolor: SERVICE_LABELS[emp.servicio_asignado]?.color || '#666', color: 'white', my: 0.5 }} />
                        <Typography variant="body2" color="text.secondary">🏦 {emp.bank_name}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          </Paper>
        ) : (
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          {/* Header */}
          <Box sx={{ bgcolor: '#1565C0', color: 'white', px: 3, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="h6" fontWeight="bold">🏦 Estado de Cuenta Bancario</Typography>
              {empresaFiltrada && (
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  {empresaFiltrada.alias} • {empresaFiltrada.bank_name} • RFC: {empresaFiltrada.rfc}
                  {(empresaFiltrada as any).belvo_connected && ' • 🔗 Belvo conectado'}
                </Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {(empresaFiltrada as any)?.belvo_connected && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={belvoSyncing ? <CircularProgress size={16} color="inherit" /> : <Refresh />}
                  disabled={belvoSyncing}
                  onClick={async () => {
                    setBelvoSyncing(true);
                    try {
                      const token = localStorage.getItem('token');
                      const res = await api.post('/admin/belvo/sync', { days_back: 7 }, { headers: { Authorization: `Bearer ${token}` } });
                      const results = res.data.results || [res.data];
                      const totalNew = results.reduce((s: number, r: any) => s + (r.new_count || 0), 0);
                      const totalMatched = results.reduce((s: number, r: any) => s + (r.matched_count || 0), 0);
                      setSnackbar({ 
                        open: true, 
                        message: `✅ Belvo sync: ${totalNew} nuevas transacciones, ${totalMatched} conciliadas automáticamente`, 
                        severity: totalNew > 0 ? 'success' : 'info' 
                      });
                      // Reload bank entries to show new ones
                      if (empresaFiltrada) {
                        try {
                          const entriesRes = await api.get(`/admin/finance/bank-entries?empresa_id=${empresaFiltrada.id}`, { headers: { Authorization: `Bearer ${token}` } });
                          if (entriesRes.data?.entries) {
                            setSavedEntriesCount(entriesRes.data.entries.length);
                          }
                        } catch (_e) { /* ignore */ }
                      }
                    } catch (err: any) {
                      setSnackbar({ open: true, message: err.response?.data?.error || 'Error sincronizando Belvo', severity: 'error' });
                    } finally {
                      setBelvoSyncing(false);
                    }
                  }}
                  sx={{ bgcolor: '#00695c', '&:hover': { bgcolor: '#004d40' }, textTransform: 'none' }}
                >
                  {belvoSyncing ? 'Sincronizando...' : '🔄 Sync Belvo'}
                </Button>
              )}
              <Chip
                icon={<AccountBalance />}
                label={bancoActivo.toUpperCase()}
                sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 'bold', fontSize: '0.9rem' }}
              />
            </Box>
          </Box>

          <Box sx={{ p: 3 }}>
            {/* Belvo auto-sync notice */}
            {(empresaFiltrada as any)?.belvo_connected && (
              <Alert severity="success" sx={{ mb: 2 }} icon={<CheckCircle />}>
                <strong>Extracción automática activa:</strong> Los movimientos de {empresaFiltrada?.bank_name} se descargan automáticamente vía Belvo.
                Usa el botón "Sync Belvo" para forzar una actualización, o el método manual debajo si prefieres.
              </Alert>
            )}
            <Alert severity="info" sx={{ mb: 2 }}>
              <strong>Instrucciones:</strong>{' '}
              {bancoActivo === 'banregio'
                ? <>Descarga el estado de cuenta en formato <strong>CSV</strong> desde tu banca en línea de <strong>BANREGIO</strong> y súbelo con el botón de abajo.</>
                : <>Copia las líneas del estado de cuenta de <strong>{bancoActivo.toUpperCase()}</strong> desde tu banca en línea y pégalas en el campo de abajo. El sistema extraerá automáticamente los movimientos.</>
              }
              {bancoFijo && <><br/><em>Banco detectado automáticamente desde la configuración de {empresaFiltrada?.alias}.</em></>}
            </Alert>

            {bancoActivo === 'banregio' ? (
              <Box sx={{ mb: 2 }}>
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={<UploadFile />}
                  sx={{ mr: 2 }}
                >
                  {csvFile ? csvFile.name : 'Seleccionar CSV de Banregio'}
                  <input
                    type="file"
                    accept=".csv"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setCsvFile(file);
                    }}
                  />
                </Button>
                {csvFile && (
                  <Chip label={`${(csvFile.size / 1024).toFixed(1)} KB`} size="small" sx={{ ml: 1 }} />
                )}
              </Box>
            ) : (
              <TextField
                multiline
                rows={6}
                fullWidth
                placeholder={`Pega aquí el estado de cuenta de ${bancoActivo.toUpperCase()}...\n\nEjemplo BBVA:\n15-04-2026\tSPEI RECIBIDO...\t\t189,250.00\t925,709.37`}
                value={estadoCuentaRaw}
                onChange={(e) => setEstadoCuentaRaw(e.target.value)}
                sx={{ mb: 2, fontFamily: 'monospace', '& textarea': { fontSize: '0.8rem' } }}
              />
            )}

            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={<ContentPaste />}
                onClick={() => handleParseEstadoCuenta(bancoActivo)}
                disabled={bancoActivo === 'banregio' ? !csvFile : !estadoCuentaRaw.trim()}
                sx={{ bgcolor: '#1565C0', '&:hover': { bgcolor: '#0D47A1' } }}
              >
                Extraer y Guardar
              </Button>

              {estadoCuentaRows.length > 0 && isSuperAdmin && (
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  onClick={async () => {
                    const empresaFilt = filterServicio !== 'all' ? getEmpresaAsignada(data?.empresas || [], filterServicio) : null;
                    if (!empresaFilt) return;
                    const confirmed = window.confirm(`¿Borrar TODOS los movimientos de ${empresaFilt.alias} de la base de datos? Esta acción no se puede deshacer.`);
                    if (!confirmed) return;
                    try {
                      await api.delete(`/admin/finance/bank-entries?empresa_id=${empresaFilt.id}`, {
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      setEstadoCuentaRows([]);
                      setEstadoCuentaRaw('');
                      setCsvFile(null);
                      setSavedEntriesCount(null);
                      setSnackbar({ open: true, message: 'Movimientos eliminados correctamente', severity: 'success' });
                    } catch (err: any) {
                      setSnackbar({ open: true, message: 'Error al borrar: ' + (err.response?.data?.error || err.message), severity: 'error' });
                    }
                  }}
                >
                  Limpiar
                </Button>
              )}
            </Box>

            {/* Results */}
            {estadoCuentaRows.length > 0 && (
              <>
                {/* Summary cards */}
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Card sx={{ bgcolor: '#E8F5E9', borderRadius: 2 }}>
                      <CardContent sx={{ py: 1.5 }}>
                        <Typography variant="caption" color="text.secondary">Total Abonos</Typography>
                        <Typography variant="h6" fontWeight="bold" color="success.main">
                          {formatCurrency(estadoCuentaRows.reduce((s, r) => s + (r.abono || 0), 0))}
                        </Typography>
                        <Typography variant="caption">{estadoCuentaRows.filter(r => r.abono).length} movimientos</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Card sx={{ bgcolor: '#FFEBEE', borderRadius: 2 }}>
                      <CardContent sx={{ py: 1.5 }}>
                        <Typography variant="caption" color="text.secondary">Total Cargos</Typography>
                        <Typography variant="h6" fontWeight="bold" color="error.main">
                          {formatCurrency(estadoCuentaRows.reduce((s, r) => s + (r.cargo || 0), 0))}
                        </Typography>
                        <Typography variant="caption">{estadoCuentaRows.filter(r => r.cargo).length} movimientos</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Card sx={{ bgcolor: '#E3F2FD', borderRadius: 2 }}>
                      <CardContent sx={{ py: 1.5 }}>
                        <Typography variant="caption" color="text.secondary">Saldo Final</Typography>
                        <Typography variant="h6" fontWeight="bold" color="primary">
                          {formatCurrency(estadoCuentaRows[0]?.saldo || 0)}
                        </Typography>
                        <Typography variant="caption">{estadoCuentaRows.length} movimientos totales</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>

                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#263238' }}>
                        <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>FECHA</TableCell>
                        <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>CONCEPTO</TableCell>
                        <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>REFERENCIA</TableCell>
                        <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="right">CARGO</TableCell>
                        <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="right">ABONO</TableCell>
                        <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="right">SALDO</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {estadoCuentaRows.map((row, idx) => (
                        <TableRow key={idx} hover sx={{ bgcolor: row.abono ? 'rgba(39,174,96,0.04)' : row.cargo ? 'rgba(231,76,60,0.04)' : 'inherit' }}>
                          <TableCell>
                            <Typography variant="body2" fontFamily="monospace">{row.fecha}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight="500">
                              {row.concepto}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" fontFamily="monospace" color="text.secondary" sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                              {row.referencia || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {row.cargo ? (
                              <Typography variant="body2" color="error.main" fontWeight="bold">
                                -{formatCurrency(row.cargo)}
                              </Typography>
                            ) : '-'}
                          </TableCell>
                          <TableCell align="right">
                            {row.abono ? (
                              <Typography variant="body2" color="success.main" fontWeight="bold">
                                +{formatCurrency(row.abono)}
                              </Typography>
                            ) : '-'}
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight="bold">
                              {formatCurrency(row.saldo)}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}

            {estadoCuentaRows.length === 0 && !estadoCuentaRaw && !csvFile && (
              <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
                <AccountBalanceWallet sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} />
                <Typography variant="h6">{bancoActivo === 'banregio' ? 'Sube tu archivo CSV aquí' : 'Pega tu estado de cuenta aquí'}</Typography>
                <Typography variant="body2">{bancoActivo === 'banregio' ? 'Descarga el reporte de movimientos en CSV desde Banregio y súbelo aquí' : `Copia los movimientos desde tu banca en línea de ${bancoActivo.toUpperCase()} y el sistema los extraerá automáticamente`}</Typography>
              </Box>
            )}
          </Box>
        </Paper>
        );
      })()}

      {/* Dialog de referencias detectadas */}
      <Dialog
        open={!!refMatchModal?.open}
        onClose={() => setRefMatchModal(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: '#1565C0', color: 'white' }}>
          🔍 Referencias Detectadas en Estado de Cuenta
        </DialogTitle>
        <DialogContent sx={{ pt: 2, mt: 1 }}>
          {refMatchModal?.loading ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CircularProgress />
              <Typography sx={{ mt: 2 }}>Buscando referencias en el sistema...</Typography>
            </Box>
          ) : (
            <>
              {/* Info de guardado */}
              {refMatchModal?.summary?.infoMsg && (
                <Alert severity="success" sx={{ mb: 2 }}>{refMatchModal.summary.infoMsg}</Alert>
              )}
              {/* Resumen */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 4 }}>
                  <Card sx={{ bgcolor: '#E8F5E9', borderRadius: 2 }}>
                    <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                      <Typography variant="h4" fontWeight="bold" color="success.main">{refMatchModal?.summary?.matched || 0}</Typography>
                      <Typography variant="caption">Coincidencias</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <Card sx={{ bgcolor: '#FFF3E0', borderRadius: 2 }}>
                    <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                      <Typography variant="h4" fontWeight="bold" color="warning.main">{refMatchModal?.summary?.wrong_account || 0}</Typography>
                      <Typography variant="caption">Cuenta incorrecta</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <Card sx={{ bgcolor: '#FFEBEE', borderRadius: 2 }}>
                    <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                      <Typography variant="h4" fontWeight="bold" color="error.main">{refMatchModal?.summary?.unmatched || 0}</Typography>
                      <Typography variant="caption">Sin coincidencia</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* Coincidencias correctas */}
              {(refMatchModal?.matches || []).length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>✅ Referencias encontradas</Typography>
                  {refMatchModal!.matches.map((m: any, idx: number) => (
                    <Paper key={idx} sx={{ p: 2, mb: 1.5, border: '1px solid #c8e6c9', borderRadius: 2, bgcolor: '#f9fbe7' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Box>
                          <Chip label={m.ref} size="small" sx={{ fontFamily: 'monospace', fontWeight: 'bold', bgcolor: '#1565C0', color: 'white', mr: 1 }} />
                          <Typography variant="body2" component="span" fontWeight="bold">{m.cliente}</Typography>
                          {m.box_id && <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>📦 {m.box_id}</Typography>}
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                          <Chip
                            label={m.status === 'paid' ? 'Pagado' : m.status === 'vouchers_submitted' ? 'Comprobantes enviados' : m.status}
                            size="small"
                            color={m.status === 'paid' ? 'success' : 'warning'}
                          />
                          {m.status !== 'paid' && m.total_bank_abonos < m.amount && (
                            <Chip label="⚠️ Pago insuficiente" size="small" sx={{ bgcolor: '#d32f2f', color: 'white', fontWeight: 'bold' }} />
                          )}
                        </Box>
                      </Box>
                      <Divider sx={{ my: 1 }} />
                      <Grid container spacing={2}>
                        <Grid size={{ xs: 4 }}>
                          <Typography variant="caption" color="text.secondary">Monto orden</Typography>
                          <Typography variant="body1" fontWeight="bold">{formatCurrency(m.amount)}</Typography>
                        </Grid>
                        <Grid size={{ xs: 4 }}>
                          <Typography variant="caption" color="text.secondary">Total abonos banco ({m.payment_count} pago{m.payment_count !== 1 ? 's' : ''})</Typography>
                          <Typography variant="body1" fontWeight="bold" color="success.main">{formatCurrency(m.total_bank_abonos)}</Typography>
                        </Grid>
                        <Grid size={{ xs: 4 }}>
                          <Typography variant="caption" color="text.secondary">Diferencia</Typography>
                          <Typography variant="body1" fontWeight="bold" color={m.total_bank_abonos >= m.amount ? 'success.main' : 'error.main'}>
                            {formatCurrency(m.total_bank_abonos - m.amount)}
                          </Typography>
                        </Grid>
                      </Grid>
                      {/* Detalle de pagos */}
                      {m.bank_entries.filter((e: any) => e.abono).length > 1 && (
                        <Box sx={{ mt: 1.5 }}>
                          <Typography variant="caption" fontWeight="bold">Detalle de abonos:</Typography>
                          {m.bank_entries.filter((e: any) => e.abono).map((e: any, i: number) => (
                            <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', pl: 1, py: 0.3 }}>
                              <Typography variant="caption">{e.fecha} - {e.concepto}</Typography>
                              <Typography variant="caption" fontWeight="bold" color="success.main">+{formatCurrency(e.abono)}</Typography>
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Paper>
                  ))}
                </Box>
              )}

              {/* Referencias de cuenta incorrecta */}
              {(refMatchModal?.wrongAccount || []).length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Alert severity="warning" sx={{ mb: 1 }}>
                    <strong>⚠️ Referencias de otra cuenta bancaria</strong> — Estos pagos pertenecen a otro servicio/empresa
                  </Alert>
                  {refMatchModal!.wrongAccount.map((m: any, idx: number) => (
                    <Paper key={idx} sx={{ p: 2, mb: 1.5, border: '2px solid #ff9800', borderRadius: 2, bgcolor: '#fff8e1' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                          <Chip label={m.ref} size="small" sx={{ fontFamily: 'monospace', fontWeight: 'bold', bgcolor: '#ff9800', color: 'white', mr: 1 }} />
                          <Typography variant="body2" component="span" fontWeight="bold">{m.cliente}</Typography>
                          <Chip label={m.service_type || 'Otro servicio'} size="small" sx={{ ml: 1, bgcolor: '#e65100', color: 'white' }} />
                        </Box>
                        <Typography variant="body1" fontWeight="bold" color="warning.main">{formatCurrency(m.total_bank_abonos)}</Typography>
                      </Box>
                    </Paper>
                  ))}
                </Box>
              )}

              {/* Sin coincidencia */}
              {(refMatchModal?.unmatched || []).length > 0 && (
                <Box>
                  <Typography variant="subtitle1" fontWeight="bold" color="text.secondary" sx={{ mb: 1 }}>❓ Referencias no encontradas</Typography>
                  {refMatchModal!.unmatched.map((m: any, idx: number) => (
                    <Paper key={idx} sx={{ p: 1.5, mb: 1, border: '1px solid #e0e0e0', borderRadius: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Chip label={m.ref} size="small" sx={{ fontFamily: 'monospace', fontWeight: 'bold' }} />
                        <Typography variant="body2" color="text.secondary">{formatCurrency(m.total_bank_abonos)} en abonos</Typography>
                      </Box>
                    </Paper>
                  ))}
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRefMatchModal(null)}>Cerrar</Button>
          {(refMatchModal?.matches || []).some((m: any) => m.status !== 'paid' && m.total_bank_abonos >= m.amount) && (
            <Button
              variant="contained"
              color="success"
              onClick={handleAutorizarBankPayments}
              disabled={refMatchModal?.loading}
              startIcon={refMatchModal?.loading ? <CircularProgress size={18} /> : undefined}
            >
              ✅ Autorizar {refMatchModal?.matches?.filter((m: any) => m.status !== 'paid' && m.total_bank_abonos >= m.amount).length} pago(s)
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Dialog confirmar autorización de pagos bancarios */}
      <Dialog
        open={!!confirmAuthorize?.open}
        onClose={() => setConfirmAuthorize(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ bgcolor: '#2e7d32', color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircle />
          Confirmar Autorización de Pagos
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            Se procesarán <strong>{confirmAuthorize?.toAuthorize?.length || 0} orden(es) de pago</strong> detectadas en el estado de cuenta bancario.
          </Alert>
          {(confirmAuthorize?.totalSurplus || 0) > 0 && (
            <Alert severity="success" icon={false} sx={{ mt: 1 }}>
              💰 Se acreditará <strong>${confirmAuthorize!.totalSurplus.toFixed(2)} MXN</strong> como saldo a favor a los clientes correspondientes.
            </Alert>
          )}
          {/* Detail per order */}
          <Box sx={{ mt: 2 }}>
            {confirmAuthorize?.toAuthorize?.map((m: any, i: number) => (
              <Paper key={i} sx={{ p: 1.5, mb: 1, bgcolor: '#f1f8e9', border: '1px solid #c8e6c9', borderRadius: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip label={m.ref} size="small" sx={{ fontFamily: 'monospace', fontWeight: 'bold', bgcolor: '#1565C0', color: 'white' }} />
                    <Typography variant="body2" fontWeight="bold">{m.cliente}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body2">Orden: <strong>${Number(m.amount).toLocaleString('en', { minimumFractionDigits: 2 })}</strong></Typography>
                    <Typography variant="caption" color="success.main">Banco: ${Number(m.total_bank_abonos).toLocaleString('en', { minimumFractionDigits: 2 })}</Typography>
                  </Box>
                </Box>
              </Paper>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setConfirmAuthorize(null)} variant="outlined" color="inherit">
            Cancelar
          </Button>
          <Button
            onClick={executeAutorizarBankPayments}
            variant="contained"
            color="success"
            size="large"
            sx={{ fontWeight: 'bold', px: 4 }}
          >
            ✅ Confirmar y Autorizar
          </Button>
        </DialogActions>
      </Dialog>

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

      {/* Dialog: Galería de Comprobantes */}
      <Dialog
        open={voucherGallery.open}
        onClose={() => setVoucherGallery({ open: false, payment: null, vouchers: [], loading: false })}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ bgcolor: '#1565C0', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h6" fontWeight="bold">🖼️ Comprobantes de Pago</Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {voucherGallery.payment?.referencia} — {voucherGallery.payment?.cliente}
            </Typography>
          </Box>
          <Chip label={`${voucherGallery.vouchers.length} comprobante(s)`} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 'bold' }} />
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {voucherGallery.loading ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <CircularProgress />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Cargando comprobantes...</Typography>
            </Box>
          ) : voucherGallery.vouchers.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography variant="h6" color="text.secondary">Sin comprobantes</Typography>
            </Box>
          ) : (
            <Box>
              {/* Summary */}
              <Paper sx={{ p: 2, mb: 3, bgcolor: '#E3F2FD', border: '1px solid #90CAF9', borderRadius: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Total Orden</Typography>
                    <Typography variant="h6" fontWeight="bold">${Number(voucherGallery.payment?.monto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="caption" color="text.secondary">Acumulado en comprobantes</Typography>
                    <Typography variant="h6" fontWeight="bold" color="#2E7D32">
                      ${voucherGallery.vouchers.reduce((s: number, v: any) => s + (Number(v.declared_amount) || 0), 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
              {/* Grid of voucher images */}
              <Grid container spacing={2}>
                {voucherGallery.vouchers.map((v: any, idx: number) => (
                  <Grid size={{ xs: 12, sm: 6 }} key={v.id}>
                    <Paper sx={{ borderRadius: 2, overflow: 'hidden', border: '1px solid #e0e0e0' }}>
                      <Box
                        component="img"
                        src={v.file_url}
                        alt={`Comprobante ${idx + 1}`}
                        sx={{ width: '100%', maxHeight: 400, objectFit: 'contain', bgcolor: '#f5f5f5', cursor: 'pointer' }}
                        onClick={() => window.open(v.file_url, '_blank')}
                      />
                      <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                          <Typography variant="body2" fontWeight="bold">Comprobante #{idx + 1}</Typography>
                          <Typography variant="body2" color="success.main" fontWeight="bold">
                            ${Number(v.declared_amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          <Chip
                            size="small"
                            label={v.status === 'pending_review' ? '⏳ Por revisar' : v.status === 'approved' ? '✅ Aprobado' : v.status === 'rejected' ? '❌ Rechazado' : v.status}
                            sx={{ fontSize: '0.7rem', fontWeight: 'bold', bgcolor: v.status === 'approved' ? '#E8F5E9' : v.status === 'rejected' ? '#FFEBEE' : '#FFF3E0', color: v.status === 'approved' ? '#2E7D32' : v.status === 'rejected' ? '#C62828' : '#E65100' }}
                          />
                          <Typography variant="caption" display="block" color="text.secondary">
                            {new Date(v.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                        </Box>
                      </Box>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setVoucherGallery({ open: false, payment: null, vouchers: [], loading: false })}>
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

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
