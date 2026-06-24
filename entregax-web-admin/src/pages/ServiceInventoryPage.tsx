import { useState, useCallback, useEffect, useRef, Fragment } from 'react';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Chip, CircularProgress, TextField, Button, ToggleButtonGroup, ToggleButton,
  TablePagination, InputAdornment, Tooltip, IconButton, LinearProgress,
  Select, MenuItem, FormControl, InputLabel, Checkbox, Snackbar, Alert,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import SyncIcon from '@mui/icons-material/Sync';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import api from '../services/api';

const ORANGE = '#F05A28';
const EX_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 horas

const SERVICES = [
  { key: 'tdi_aereo',   label: 'TDI Aéreo',        emoji: '✈️',  color: '#1565C0' },
  { key: 'tdi_express', label: 'TDI Express',       emoji: '🚀',  color: '#7B1FA2' },
  { key: 'maritimo',    label: 'Marítimo China',    emoji: '🚢',  color: '#00695C' },
  { key: 'pobox_usa',   label: 'PO Box USA',        emoji: '🇺🇸', color: '#BF360C' },
  { key: 'dhl',         label: 'DHL Monterrey',     emoji: '📦',  color: '#F9A825' },
];

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  received:              { label: 'Recibido',              color: '#1565C0', bg: '#E3F2FD' },
  received_china:        { label: 'Recibido en China',     color: '#E65100', bg: '#FFF3E0' },
  received_mty:          { label: 'Recibido en MTY',       color: '#2E7D32', bg: '#E8F5E9' },
  in_transit:            { label: 'En Tránsito',           color: '#6A1B9A', bg: '#F3E5F5' },
  out_for_delivery:      { label: 'En Ruta de Entrega',    color: '#EF6C00', bg: '#FFF3E0' },
  shipped:               { label: 'Enviado',               color: '#0277BD', bg: '#E1F5FE' },
  delivered:             { label: 'Entregado',             color: '#2E7D32', bg: '#E8F5E9' },
  returned_to_warehouse: { label: 'Devuelto a Bodega',     color: '#B71C1C', bg: '#FFEBEE' },
};

const MARITIME_STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  received_china:  { label: 'Recibido en China',   color: '#E65100', bg: '#FFF3E0' },
  in_transit:      { label: 'En Tránsito',          color: '#6A1B9A', bg: '#F3E5F5' },
  customs_mx:      { label: 'Aduana MX',            color: '#7B1FA2', bg: '#F3E5F5' },
  customs_cleared: { label: 'Aduana Liberada',      color: '#1565C0', bg: '#E3F2FD' },
  received_mty:    { label: 'Recibido en MTY',      color: '#2E7D32', bg: '#E8F5E9' },
  received_cdmx:   { label: 'Recibido en CDMX',    color: '#2E7D32', bg: '#E8F5E9' },
  delivered:       { label: 'Entregado',            color: '#2E7D32', bg: '#E8F5E9' },
  pending_api:     { label: 'Pendiente API',        color: '#9E9E9E', bg: '#F5F5F5' },
};

// TDI Aéreo: el flujo llega a CEDIS CDMX (no a Monterrey). Mapa de estatus
// propio para no mostrar "Recibido en MTY" en este servicio.
const AIR_STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  received_china:        { label: 'Recibido en China',      color: '#E65100', bg: '#FFF3E0' },
  shipped:               { label: 'Enviado',                color: '#0277BD', bg: '#E1F5FE' },
  in_transit:            { label: 'En Tránsito',            color: '#6A1B9A', bg: '#F3E5F5' },
  received_cdmx:         { label: 'Recibido en CEDIS CDMX', color: '#2E7D32', bg: '#E8F5E9' },
  out_for_delivery:      { label: 'En Ruta de Entrega',     color: '#EF6C00', bg: '#FFF3E0' },
  delivered:             { label: 'Entregado',              color: '#2E7D32', bg: '#E8F5E9' },
  returned_to_warehouse: { label: 'Devuelto a Bodega',      color: '#B71C1C', bg: '#FFEBEE' },
};

interface PackageRow {
  guia: string;
  guia_corta?: string;
  guia_origen?: string;
  guia_origen_carrier?: string;
  received_at: string;
  updated_at?: string;
  status: string;
  box_id?: string;
  cliente_nombre?: string;
  paqueteria?: string;
  guia_salida?: string;
  costing_paid?: boolean;
  has_instructions?: boolean;
  has_delivery_address?: boolean;
  guia_us_saved?: string;
  pkg_id?: number;
  master_id?: number | null;
  base_guia?: string;
  children?: PackageRow[];
}

interface DireccionEntregax {
  quienrecibe?: string;
  calle?: string;
  numeroext?: string;
  colonia?: string;
  cp?: string;
  estado?: string;
  pais?: string;
}

interface EntregaxRow {
  state: 'idle' | 'loading' | 'done' | 'notfound' | 'error';
  hasPago?: boolean;
  hasInstrucciones?: boolean;
  guiaSalida?: string;
  guiaIngreso?: string;
  paqueteria?: string;
  lastStatus?: string;
  direccionEntrega?: DireccionEntregax;
}

// Helpers para extraer campos del waybill/historial de EntregaX. El API marítimo
// usa nombres distintos (estado_actual / descripcion / evento) y a veces devuelve
// guiasalida='1' como flag booleano en vez de un tracking real.
const pickStatus = (d: any): string | undefined => {
  const wb: any = d?.waybill || {};
  const hist: any[] = Array.isArray(d?.historial) ? d.historial : [];
  const lastH: any = hist.length > 0 ? hist[hist.length - 1] : null;
  const candidates: any[] = [
    wb.estado, wb.estado_actual, wb.status, wb.descripcion, wb.estado_descripcion,
    wb.ultimo_estado, wb.last_status,
    lastH?.estado, lastH?.estado_actual, lastH?.status, lastH?.descripcion, lastH?.evento, lastH?.mensaje,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim() && c.trim() !== '0' && c.trim() !== '1') return c.trim();
  }
  return undefined;
};
const pickGuiaSalida = (d: any): string | undefined => {
  const wb: any = d?.waybill || {};
  const raw = wb.guiasalida || wb.guia_salida || wb.tracking_salida;
  if (!raw) return undefined;
  const s = String(raw).trim();
  // Marítimo devuelve '1' como flag booleano → ignorar (no es un tracking real)
  if (!s || s === '0' || s === '1' || s.toLowerCase() === 'true' || s.toLowerCase() === 'false') return undefined;
  return s;
};

// ── Cache localStorage de datos EntregaX (24h TTL) ──
function readExCache(service: string): Record<string, { data: EntregaxRow; ts: number }> {
  try { return JSON.parse(localStorage.getItem(`ex_cache_${service}`) || '{}'); } catch { return {}; }
}
function getCachedEx(service: string, guia: string): EntregaxRow | null {
  const cache = readExCache(service);
  const entry = cache[guia];
  if (!entry || Date.now() - entry.ts > EX_CACHE_TTL) return null;
  return entry.data;
}
function setCachedEx(service: string, guia: string, data: EntregaxRow) {
  try {
    const cache = readExCache(service);
    const now = Date.now();
    (Object.keys(cache) as string[]).forEach(k => { if (now - cache[k].ts > EX_CACHE_TTL) delete cache[k]; });
    cache[guia] = { data, ts: now };
    localStorage.setItem(`ex_cache_${service}`, JSON.stringify(cache));
  } catch {}
}
function removeCachedEx(service: string, guia: string) {
  try {
    const cache = readExCache(service);
    delete cache[guia];
    localStorage.setItem(`ex_cache_${service}`, JSON.stringify(cache));
  } catch {}
}

// Cache para usGuias PO Box (permanente, se borra solo cuando cambia)
function readUsCache(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem('us_guias_cache') || '{}'); } catch { return {}; }
}
function setCachedUs(guia: string, guia_unica: string) {
  try {
    const cache = readUsCache();
    cache[guia] = guia_unica;
    localStorage.setItem('us_guias_cache', JSON.stringify(cache));
  } catch {}
}

export default function ServiceInventoryPage() {
  const [service, setService] = useState('tdi_aereo');
  const [rows, setRows] = useState<PackageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [syncFilter, setSyncFilter] = useState<'' | 'synced' | 'needs_sync' | 'not_found'>('');
  const [instrFilter, setInstrFilter] = useState<'' | 'with' | 'without'>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [exData, setExData] = useState<Record<string, EntregaxRow>>({});
  const [exFetching, setExFetching] = useState(false);
  const [exProgress, setExProgress] = useState(0);
  const fetchAbortRef = useRef(false);
  const [syncState, setSyncState] = useState<Record<string, 'idle' | 'syncing' | 'done' | 'error'>>({});
  const [syncErrors, setSyncErrors] = useState<Record<string, string>>({});
  const [usGuias, setUsGuias] = useState<Record<string, { state: 'idle'|'loading'|'done'|'notfound'|'error'; guia_unica?: string }>>({});
  const [usFetching, setUsFetching] = useState(false);
  const [usProgress, setUsProgress] = useState(0);
  const usAbortRef = useRef(false);
  const [editingUsGuias, setEditingUsGuias] = useState<Set<string>>(new Set());
  const [manualUsInputs, setManualUsInputs] = useState<Record<string, string>>({});
  const [expandedMasters, setExpandedMasters] = useState<Set<string>>(new Set());
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncAllProgress, setSyncAllProgress] = useState({ done: 0, total: 0 });
  const [selectedGuias, setSelectedGuias] = useState<Set<string>>(new Set());
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'success' });
  const isSuperAdmin = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').role === 'super_admin'; } catch { return false; } })();

  const handleMarkPaid = async (r: PackageRow) => {
    if (!r.pkg_id) { setSnackbar({ open: true, message: 'Sin ID de paquete en esta fila', severity: 'error' }); return; }
    try {
      await api.patch(`/admin/packages/${r.pkg_id}/mark-paid-manual`);
      setRows(prev => prev.map(row => row.pkg_id === r.pkg_id ? { ...row, costing_paid: true } : row));
      setSnackbar({ open: true, message: `✅ Paquete ${r.guia} marcado como pagado`, severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al marcar como pagado', severity: 'error' });
    }
  };

  const handleUnmarkPaid = async (r: PackageRow) => {
    if (!r.pkg_id) { setSnackbar({ open: true, message: 'Sin ID de paquete en esta fila', severity: 'error' }); return; }
    try {
      await api.patch(`/admin/packages/${r.pkg_id}/unmark-paid-manual`);
      setRows(prev => prev.map(row => row.pkg_id === r.pkg_id ? { ...row, costing_paid: false } : row));
      setSnackbar({ open: true, message: `↩️ Pago de ${r.guia} desmarcado`, severity: 'info' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al desmarcar pago', severity: 'error' });
    }
  };

  const handleMarkInstruccion = async (r: PackageRow) => {
    if (!r.pkg_id) { setSnackbar({ open: true, message: 'Sin ID de paquete en esta fila', severity: 'error' }); return; }
    try {
      await api.patch(`/admin/packages/${r.pkg_id}/mark-instructions-manual`);
      setRows(prev => prev.map(row => row.pkg_id === r.pkg_id ? { ...row, has_instructions: true } : row));
      setSnackbar({ open: true, message: `✅ Paquete ${r.guia} marcado con instrucción`, severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al marcar instrucción', severity: 'error' });
    }
  };

  const fmt = (d?: string | null) =>
    d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  const activeStatusLabels =
    service === 'maritimo' ? MARITIME_STATUS_LABELS :
    service === 'tdi_aereo' ? AIR_STATUS_LABELS :
    STATUS_LABELS;
  const statusChip = (s: string) => {
    const meta = activeStatusLabels[s] || STATUS_LABELS[s] || { label: s, color: '#555', bg: '#eee' };
    return <Chip label={meta.label} size="small" sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 600, fontSize: '0.7rem' }} />;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Cuando hay filtro de Estado EntregaX activo, cargar TODAS las guías (sin paginación)
      // para que el filtro client-side aplique sobre el total y no solo la página actual
      const useAllRows = !!syncFilter || !!instrFilter;
      const r = await api.get('/packages/service-inventory', {
        params: {
          service,
          limit: useAllRows ? 5000 : rowsPerPage,
          offset: useAllRows ? 0 : page * rowsPerPage,
          search: search || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          status: statusFilter || undefined,
        },
      });
      setRows(r.data.rows || []);
      setTotal(r.data.total || 0);
    } catch { setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [service, page, rowsPerPage, search, dateFrom, dateTo, statusFilter, syncFilter, instrFilter]);

  // Service change: reset todo
  useEffect(() => {
    setPage(0);
    setStatusFilter('');
    setSyncFilter('');
    setInstrFilter('');
    setExData({});
    setSyncState({});
    setUsGuias({});
    setExpandedMasters(new Set());
    setSelectedGuias(new Set());
  }, [service]);

  // Recargar cuando cambian los parámetros de carga
  useEffect(() => { load(); }, [load]);

  // Restaurar datos EntregaX desde caché cuando llegan nuevas filas
  useEffect(() => {
    if (rows.length === 0) return;
    const restored: Record<string, EntregaxRow> = {};
    rows.forEach(r => {
      const cached = getCachedEx(service, r.guia);
      if (cached) restored[r.guia] = cached;
    });
    if (Object.keys(restored).length > 0) {
      setExData(prev => {
        const next = { ...prev };
        Object.entries(restored).forEach(([k, v]) => {
          if (!next[k] || next[k].state === 'idle') next[k] = v;
        });
        return next;
      });
    }
  }, [rows, service]);

  // Pre-popular usGuias desde guia_us_saved y localStorage (PO Box)
  useEffect(() => {
    if (service !== 'pobox_usa') return;
    const fromDb: Record<string, { state: 'done'; guia_unica: string }> = {};
    const fromCache = readUsCache();
    rows.forEach(r => {
      const saved = r.guia_us_saved || fromCache[r.guia];
      if (saved) fromDb[r.guia] = { state: 'done', guia_unica: saved };
    });
    if (Object.keys(fromDb).length > 0) setUsGuias(prev => ({ ...fromDb, ...prev }));
  }, [rows, service]);

  // Mapea status de EntregaX a nuestro valor interno
  const mapExStatusToInternal = (ex: EntregaxRow): string | undefined => {
    const ls = (ex.lastStatus || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (ls.includes('entregado') || ls.includes('delivered')) return 'delivered';
    if (ls.includes('en ruta') || ls.includes('en camino') || ls.includes('out_for_delivery')) return 'out_for_delivery';
    const pak = (ex.paqueteria || '').toLowerCase();
    const isLocalDelivery = pak.includes('local') || pak.includes('nacional') || pak.startsWith('entregax');
    const isSent = ls.includes('enviado') || ls.includes('shipped') || ls.includes('sent');
    // Entregax Nacional (repartidor local) enviado = entregado al cliente final
    if (isLocalDelivery && isSent) return 'delivered';
    // Paquete Express enviado = sale hacia paquetería externa
    if (!isLocalDelivery && (ex.guiaSalida || isSent)) return 'shipped';
    // Recibido en CEDIS (almacén central) — EntregaX puede decir "Recibido en Cedis CDMX"
    // o "Recibido en CEDIS Monterrey". Detectar la ciudad para elegir received_cdmx/received_mty.
    if (ls.includes('recibido') && (ls.includes('cedis') || ls.includes('almacen') || ls.includes('bodega'))) {
      if (ls.includes('mty') || ls.includes('monterrey')) return 'received_mty';
      // por defecto CDMX (cubre "Recibido en Cedis CDMX" y "Recibido en Cedis")
      return 'received_cdmx';
    }
    if (ls.includes('transito') || ls.includes('transit')) return 'in_transit';
    return undefined;
  };

  const normalizeCarrier = (c: string) => c.toLowerCase().replace(/[^a-z0-9]/g, '');

  const carriersMatch = (a?: string | null, b?: string | null): boolean => {
    if (!a || !b) return true;
    const na = normalizeCarrier(a);
    const nb = normalizeCarrier(b);
    if (na === nb) return true;
    const minLen = Math.min(na.length, nb.length, 6);
    if (minLen < 3) return true;
    return na.includes(nb.slice(0, minLen)) || nb.includes(na.slice(0, minLen));
  };

  const getExMismatches = (row: PackageRow, ex: EntregaxRow | undefined): string[] => {
    if (!ex || ex.state !== 'done') return [];
    const issues: string[] = [];
    if (row.paqueteria && ex.paqueteria && !carriersMatch(row.paqueteria, ex.paqueteria))
      issues.push(`Paquetería: nuestro="${row.paqueteria}" EntregaX="${ex.paqueteria}"`);
    if (row.guia_salida && ex.guiaSalida &&
        row.guia_salida.trim().toUpperCase() !== ex.guiaSalida.trim().toUpperCase())
      issues.push(`Guía salida: nuestro="${row.guia_salida}" EntregaX="${ex.guiaSalida}"`);
    return issues;
  };

  const needsSync = (row: PackageRow, ex: EntregaxRow | undefined): boolean => {
    if (!ex || ex.state !== 'done') return false;
    // Marítimo: instrucciones en EntregaX pero no en nuestro sistema
    if (service === 'maritimo' && !!ex.hasInstrucciones && !row.has_instructions) return true;
    // Marítimo: pago + instrucciones en EntregaX → debe marcarse como entregado
    if (service === 'maritimo' && !!ex.hasPago && !!ex.hasInstrucciones && row.status !== 'delivered') return true;
    if (!!ex.hasPago && !row.costing_paid) return true;
    if (ex.guiaSalida && ex.guiaSalida.trim().toUpperCase() !== (row.guia_salida || '').trim().toUpperCase()) return true;
    // Solo inyectar dirección si: EntregaX tiene datos físicos, el paquete no tiene address_id,
    // y el status aún lo requiere (recibido en alguna etapa, no enviado/entregado)
    const canInjectAddr = ['received', 'received_china', 'received_mty', 'received_cdmx'].includes(row.status);
    if (!!ex.hasInstrucciones && !!ex.direccionEntrega && !row.has_delivery_address && canInjectAddr) return true;
    // Paquetería diferente → siempre actualizar (ej. DHL en nuestro sistema pero EntregaX dice Local)
    if (ex.paqueteria && ex.paqueteria.toUpperCase() !== (row.paqueteria || '').toUpperCase()) return true;
    const mappedStatus = mapExStatusToInternal(ex);
    if (mappedStatus && mappedStatus !== row.status) return true;
    return false;
  };

  const syncRow = async (row: PackageRow) => {
    const ex = exData[row.guia];
    if (!ex || ex.state !== 'done') return;
    setSyncState(prev => ({ ...prev, [row.guia]: 'syncing' }));
    const hasGuiaSalida = !!ex.guiaSalida;
    const canInjectAddr = ['received', 'received_china', 'received_mty', 'received_cdmx'].includes(row.status);
    // Marítimo: marcar instrucciones confirmadas sin inyectar dirección
    const maritimeMarkInstr = service === 'maritimo' && !!ex.hasInstrucciones && !row.has_instructions;
    const shouldInjectInstrucciones = maritimeMarkInstr || (!!ex.hasInstrucciones && !!ex.direccionEntrega && !row.has_delivery_address && canInjectAddr);
    const mappedStatus = mapExStatusToInternal(ex);
    // Marítimo: si EntregaX tiene pago + instrucciones → el paquete ya fue entregado
    const maritimeDelivered = service === 'maritimo' && !!ex.hasPago && !!ex.hasInstrucciones && row.status !== 'delivered';
    const newStatus = maritimeDelivered ? 'delivered' : (mappedStatus && mappedStatus !== row.status ? mappedStatus : undefined);
    try {
      await api.post('/packages/sync-from-entregax', {
        guia: row.guia, service,
        hasPago: ex.hasPago && !row.costing_paid,
        hasInstrucciones: shouldInjectInstrucciones,
        paqueteria: (ex.paqueteria && ex.paqueteria.toUpperCase() !== (row.paqueteria || '').toUpperCase())
          ? ex.paqueteria
          : (!row.has_instructions ? ex.paqueteria : undefined),
        guia_salida: hasGuiaSalida ? ex.guiaSalida : undefined,
        direccion_entrega: shouldInjectInstrucciones ? ex.direccionEntrega : undefined,
        newStatus,
      });
      setRows(prev => prev.map(r => {
        if (r.guia !== row.guia) return r;
        const newPaqueteria = (ex.paqueteria && ex.paqueteria.toUpperCase() !== (r.paqueteria || '').toUpperCase())
          ? ex.paqueteria
          : (r.has_instructions ? r.paqueteria : (ex.paqueteria || r.paqueteria));
        const newGuiaSalida = ex.guiaSalida || r.guia_salida;
        const newCostingPaid = r.costing_paid || (ex.hasPago ?? false);
        const newHasInst = r.has_instructions || shouldInjectInstrucciones || hasGuiaSalida || maritimeDelivered || maritimeMarkInstr;
        const newHasAddr = r.has_delivery_address || shouldInjectInstrucciones;
        // El backend actualiza tanto el master como las hijas (child_no LIKE 'guia-%'),
        // asi que reflejamos los mismos cambios en cada hija para evitar estado stale.
        const updatedChildren = Array.isArray((r as any).children)
          ? (r as any).children.map((c: any) => ({
              ...c,
              costing_paid: c.costing_paid || (ex.hasPago ?? false),
              has_instructions: c.has_instructions || shouldInjectInstrucciones || hasGuiaSalida || maritimeDelivered || maritimeMarkInstr,
              paqueteria: newPaqueteria,
              guia_salida: newGuiaSalida,
              status: newStatus || c.status,
            }))
          : (r as any).children;
        return {
          ...r,
          costing_paid: newCostingPaid,
          has_instructions: newHasInst,
          has_delivery_address: newHasAddr,
          paqueteria: newPaqueteria,
          guia_salida: newGuiaSalida,
          status: newStatus || r.status,
          children: updatedChildren,
        };
      }));
      // Invalidar cache para forzar re-fetch fresco en el próximo Actualizar EntregaX
      removeCachedEx(service, row.guia);
      setExData(prev => { const next = { ...prev }; delete next[row.guia]; return next; });
      setSyncState(prev => ({ ...prev, [row.guia]: 'done' }));
      setTimeout(() => setSyncState(prev => prev[row.guia] === 'done' ? { ...prev, [row.guia]: 'idle' } : prev), 3000);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Error desconocido';
      setSyncErrors(prev => ({ ...prev, [row.guia]: msg }));
      setSyncState(prev => ({ ...prev, [row.guia]: 'error' }));
    }
  };

  const syncAll = async () => {
    const toSync = displayRows.filter(r => {
      const ex = exData[r.guia];
      return selectedGuias.has(r.guia) && ex?.state === 'done' && needsSync(r, ex) && (syncState[r.guia] || 'idle') === 'idle';
    });
    if (toSync.length === 0) return;
    setSyncingAll(true);
    setSyncAllProgress({ done: 0, total: toSync.length });
    for (let i = 0; i < toSync.length; i++) {
      await syncRow(toSync[i]);
      setSyncAllProgress({ done: i + 1, total: toSync.length });
    }
    setSyncingAll(false);
  };

  const fetchGuiaUS = useCallback(async () => {
    if (service !== 'pobox_usa' || rows.length === 0) return;
    usAbortRef.current = false;
    setUsFetching(true);
    setUsProgress(0);
    const entries = rows
      .filter(r => r.guia_origen && !r.guia_us_saved && !usGuias[r.guia]?.guia_unica)
      .map(r => ({ storeKey: r.guia, queryKey: r.guia_origen! }));
    if (entries.length === 0) { setUsFetching(false); return; }
    const BATCH = 5;
    let done = 0;
    for (let i = 0; i < entries.length; i += BATCH) {
      if (usAbortRef.current) break;
      const batch = entries.slice(i, i + BATCH);
      setUsGuias(prev => { const next = { ...prev }; batch.forEach(e => { next[e.storeKey] = { state: 'loading' }; }); return next; });
      await Promise.all(batch.map(async ({ storeKey, queryKey }) => {
        try {
          const res = await api.get(`/national/payment-query/${encodeURIComponent(queryKey)}`).catch((err: any) => ({ data: null, _notfound: err?.response?.status === 404 } as any));
          const d = res?.data?.status === 'success' ? res.data.data : null;
          const derivedGuia = d?.guia_unica || d?.waybill?.guia_unica || d?.guias?.[0]?.guia_unica;
          if (derivedGuia) {
            setUsGuias(prev => ({ ...prev, [storeKey]: { state: 'done', guia_unica: derivedGuia } }));
            setCachedUs(storeKey, derivedGuia);
            api.post('/packages/save-guia-us', { tracking_internal: storeKey, guia_unica: derivedGuia }).catch(() => {});
          } else if (d) {
            // Datos de EntregaX encontrados pero sin guia_unica asignada — no es error
            setUsGuias(prev => ({ ...prev, [storeKey]: { state: 'notfound' } }));
          } else {
            setUsGuias(prev => ({ ...prev, [storeKey]: { state: res?._notfound ? 'notfound' : 'error' } }));
          }
        } catch { setUsGuias(prev => ({ ...prev, [storeKey]: { state: 'error' } })); }
      }));
      done += batch.length;
      setUsProgress(Math.round((done / entries.length) * 100));
    }
    setUsFetching(false);
  }, [rows, service, usGuias]);

  const handleManualUsGuia = async (storeKey: string) => {
    const guia_unica = (manualUsInputs[storeKey] || '').trim();
    if (!guia_unica) return;
    setEditingUsGuias(prev => { const next = new Set(prev); next.delete(storeKey); return next; });
    setUsGuias(prev => ({ ...prev, [storeKey]: { state: 'done', guia_unica } }));
    setCachedUs(storeKey, guia_unica);
    api.post('/packages/save-guia-us', { tracking_internal: storeKey, guia_unica }).catch(() => {});
    // Consultar inmediatamente con la guia manual
    setExData(prev => ({ ...prev, [storeKey]: { state: 'loading' } }));
    try {
      const res = await api.get(`/national/payment-query/${encodeURIComponent(guia_unica)}`).catch((err: any) => ({ data: null, _notfound: err?.response?.status === 404 } as any));
      const d = res?.data?.status === 'success' ? res.data.data : null;
      if (d) {
        const foundGuia = d.guia_unica || d.waybill?.guia_unica || d.guias?.[0]?.guia_unica || guia_unica;
        const exEntry: EntregaxRow = {
          state: 'done',
          hasPago: (d.pagos || []).length > 0 || d.waybill?.pagado === '1',
          hasInstrucciones: !!d.waybill,
          guiaSalida: pickGuiaSalida(d),
          guiaIngreso: foundGuia,
          paqueteria: d.waybill?.paqueteria && d.waybill.paqueteria !== '0' ? d.waybill.paqueteria : undefined,
          lastStatus: pickStatus(d),
          direccionEntrega: d.waybill?.direccion_entrega || undefined,
        };
        setExData(prev => ({ ...prev, [storeKey]: exEntry }));
        setCachedEx(service, storeKey, exEntry);
      } else {
        setExData(prev => ({ ...prev, [storeKey]: { state: res?._notfound ? 'notfound' : 'error' } }));
      }
    } catch { setExData(prev => ({ ...prev, [storeKey]: { state: 'error' } })); }
  };

  const fetchEntregax = useCallback(async () => {
    if (rows.length === 0) return;
    fetchAbortRef.current = false;
    setExFetching(true);
    setExProgress(0);

    // Para PO Box: mapa local de guia_unica (estado + nuevos hallazgos en esta sesión)
    const localUsGuias: Record<string, string> = {};
    if (service === 'pobox_usa') {
      rows.forEach(r => {
        const known = usGuias[r.guia]?.guia_unica;
        if (known) localUsGuias[r.guia] = known;
      });
    }

    const entries: { storeKey: string; queryKey: string; isPoBox: boolean; guia_origen?: string }[] = rows
      .filter(r => {
        if (!r.guia) return false;
        // PO Box: solo consultar si tenemos guia_unica (US-120-...) O guia_origen (carrier tracking)
        // Nunca usar nuestro formato interno (US-XXXXXXXXXX) pues sistemaentregax.com no lo reconoce
        if (service === 'pobox_usa') return !!(localUsGuias[r.guia] || r.guia_origen);
        return true;
      })
      .map(r => {
        let queryKey = r.guia;
        let isPoBox = false;
        if (service === 'tdi_aereo' && r.children && r.children.length > 0) {
          queryKey = r.children[0].guia;
        } else if (service === 'pobox_usa') {
          isPoBox = true;
          // Prioridad: guia_unica (US-120-...) > carrier tracking (1Z..., 4888...)
          queryKey = localUsGuias[r.guia] || r.guia_origen!;
        }
        return { storeKey: r.guia, queryKey, isPoBox, guia_origen: r.guia_origen };
      });
    const BATCH = 5;
    let done = 0;
    for (let i = 0; i < entries.length; i += BATCH) {
      if (fetchAbortRef.current) break;
      const batch = entries.slice(i, i + BATCH);
      setExData(prev => { const next = { ...prev }; batch.forEach(e => { next[e.storeKey] = { state: 'loading' }; }); return next; });
      await Promise.all(batch.map(async ({ storeKey, queryKey, isPoBox }) => {
        try {
          const queryFn = async (key: string) => {
            const r = await api.get(`/national/payment-query/${encodeURIComponent(key)}`).catch((err: any) => ({ data: null, _notfound: err?.response?.status === 404 } as any));
            return { d: r?.data?.status === 'success' ? r.data.data : null, notfound: r?._notfound ?? false };
          };

          let { d, notfound } = await queryFn(queryKey);

          // PO Box: si encontramos guia_unica pero sin waybill, reintentar con guia_unica
          if (isPoBox && d) {
            const foundGuiaUnica = d.guia_unica || d.waybill?.guia_unica || d.guias?.[0]?.guia_unica;
            if (foundGuiaUnica && !localUsGuias[storeKey]) {
              // Guardar guia_unica encontrada para uso futuro
              localUsGuias[storeKey] = foundGuiaUnica;
              setUsGuias(prev => ({ ...prev, [storeKey]: { state: 'done', guia_unica: foundGuiaUnica } }));
              setCachedUs(storeKey, foundGuiaUnica);
              api.post('/packages/save-guia-us', { tracking_internal: storeKey, guia_unica: foundGuiaUnica }).catch(() => {});
            }
            // Si la query fue con guia_origen (no con guia_unica) y no hay waybill, reintentar con guia_unica
            if (!d.waybill && foundGuiaUnica && queryKey !== foundGuiaUnica) {
              const retry = await queryFn(foundGuiaUnica);
              if (retry.d) { d = retry.d; notfound = retry.notfound; }
            }
          }

          if (d) {
            const guiaUnica = d.guia_unica || d.waybill?.guia_unica || d.guias?.[0]?.guia_unica || undefined;
            // PO Box: guardar guia_unica si aún no está guardada
            if (isPoBox && guiaUnica && !localUsGuias[storeKey]) {
              localUsGuias[storeKey] = guiaUnica;
              setUsGuias(prev => ({ ...prev, [storeKey]: { state: 'done', guia_unica: guiaUnica } }));
              setCachedUs(storeKey, guiaUnica);
              api.post('/packages/save-guia-us', { tracking_internal: storeKey, guia_unica: guiaUnica }).catch(() => {});
            }
            const exEntry: EntregaxRow = {
              state: 'done',
              hasPago: (d.pagos || []).length > 0 || d.waybill?.pagado === '1',
              hasInstrucciones: !!d.waybill,
              guiaSalida: pickGuiaSalida(d),
              guiaIngreso: guiaUnica,
              paqueteria: d.waybill?.paqueteria && d.waybill.paqueteria !== '0' ? d.waybill.paqueteria : undefined,
              lastStatus: pickStatus(d),
              direccionEntrega: d.waybill?.direccion_entrega || undefined,
            };
            setExData(prev => ({ ...prev, [storeKey]: exEntry }));
            setCachedEx(service, storeKey, exEntry);
          } else {
            const exEntry: EntregaxRow = { state: notfound ? 'notfound' : 'error' };
            setExData(prev => ({ ...prev, [storeKey]: exEntry }));
            if (notfound) setCachedEx(service, storeKey, exEntry);
          }
        } catch { setExData(prev => ({ ...prev, [storeKey]: { state: 'error' } })); }
      }));
      done += batch.length;
      setExProgress(Math.round((done / entries.length) * 100));
    }
    setExFetching(false);
  }, [rows, service, usGuias]);

  // ── Celdas EntregaX + Sync ──
  const renderExCells = (r: PackageRow) => {
    const ex = exData[r.guia];
    const exColSpan = 3;
    if (!ex || ex.state === 'idle') return <TableCell align="center" colSpan={exColSpan}><Typography variant="caption" color="text.disabled">—</Typography></TableCell>;
    if (ex.state === 'loading') return <TableCell align="center" colSpan={exColSpan}><CircularProgress size={14} /></TableCell>;
    if (ex.state === 'notfound') return <TableCell align="center" colSpan={exColSpan}><Typography variant="caption" sx={{ color: '#B71C1C', fontSize: '0.65rem' }}>No encontrada</Typography></TableCell>;
    if (ex.state === 'error') return <TableCell align="center" colSpan={exColSpan}><Typography variant="caption" color="error">Sin datos</Typography></TableCell>;
    const mismatches = getExMismatches(r, ex);
    const hasMismatch = mismatches.length > 0;
    const desynced = needsSync(r, ex);
    const sState = syncState[r.guia] || 'idle';
    return (
      <>
        <TableCell align="center">
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
            <Tooltip title={hasMismatch ? `⚠️ ${mismatches.join(' | ')}` : ex.hasPago ? 'Pago en EntregaX' : 'Sin pago en EntregaX'}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                {hasMismatch ? <CheckCircleIcon sx={{ fontSize: 16, color: '#F9A825' }} /> : ex.hasPago ? <CheckCircleIcon sx={{ fontSize: 16, color: '#2E7D32' }} /> : <RadioButtonUncheckedIcon sx={{ fontSize: 16, color: '#BDBDBD' }} />}
                <Typography variant="caption" sx={{ color: hasMismatch ? '#F9A825' : ex.hasPago ? '#2E7D32' : '#9E9E9E', fontSize: '0.65rem' }}>{hasMismatch ? '⚠️' : ''}Pago</Typography>
              </Box>
            </Tooltip>
            <Tooltip title={
              ex.hasInstrucciones && ex.direccionEntrega
                ? 'Con instrucciones y dirección de entrega'
                : ex.hasInstrucciones
                  ? 'Con instrucciones · sin dirección (pendiente en EntregaX)'
                  : 'Sin instrucciones en EntregaX'
            }>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                {ex.hasInstrucciones && ex.direccionEntrega
                  ? <CheckCircleIcon sx={{ fontSize: 16, color: hasMismatch ? '#F9A825' : '#1565C0' }} />
                  : ex.hasInstrucciones
                    ? <CheckCircleIcon sx={{ fontSize: 16, color: '#F9A825' }} />
                    : <RadioButtonUncheckedIcon sx={{ fontSize: 16, color: '#BDBDBD' }} />}
                <Typography variant="caption" sx={{
                  color: hasMismatch ? '#F9A825' : ex.hasInstrucciones && ex.direccionEntrega ? '#1565C0' : ex.hasInstrucciones ? '#F9A825' : '#9E9E9E',
                  fontSize: '0.65rem'
                }}>Inst.</Typography>
              </Box>
            </Tooltip>
            {ex.paqueteria && <Typography variant="caption" sx={{ fontSize: '0.6rem', color: hasMismatch ? '#F9A825' : '#555', fontWeight: 600 }}>{ex.paqueteria}</Typography>}
          </Box>
        </TableCell>
        <TableCell>
          {ex.guiaSalida ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Chip label="🚚 Enviado" size="small" sx={{ bgcolor: '#E8F5E9', color: '#2E7D32', fontWeight: 700, fontSize: '0.65rem' }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <Typography variant="caption" fontFamily="monospace" sx={{ fontSize: '0.65rem' }}>{ex.guiaSalida}</Typography>
                <Tooltip title="Copiar"><IconButton size="small" onClick={() => navigator.clipboard.writeText(ex.guiaSalida!)}><ContentCopyIcon sx={{ fontSize: 11 }} /></IconButton></Tooltip>
              </Box>
            </Box>
          ) : ex.lastStatus ? (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>{ex.lastStatus}</Typography>
          ) : <Typography variant="caption" color="text.disabled">—</Typography>}
        </TableCell>
        <TableCell align="center">
          {sState === 'syncing' ? (
            <CircularProgress size={16} />
          ) : sState === 'done' ? (
            <Chip label="✅ Sincronizado" size="small" sx={{ bgcolor: '#E8F5E9', color: '#2E7D32', fontWeight: 700, fontSize: '0.65rem' }} />
          ) : sState === 'error' ? (
            <Tooltip title={syncErrors[r.guia] || 'Error al sincronizar'}>
              <Button
                size="small" variant="text"
                onClick={() => { setSyncState(prev => ({ ...prev, [r.guia]: 'idle' })); syncRow(r); }}
                sx={{ fontSize: '0.62rem', py: 0.25, px: 0.5, color: 'error.main', minWidth: 0 }}
              >
                ⚠ Reintentar
              </Button>
            </Tooltip>
          ) : desynced ? (
            <Tooltip title="EntregaX tiene datos más actualizados">
              <Button
                size="small" variant="outlined"
                onClick={() => syncRow(r)}
                startIcon={<SyncIcon sx={{ fontSize: 13 }} />}
                sx={{ fontSize: '0.62rem', py: 0.25, px: 0.75, borderColor: '#F05A28', color: '#F05A28', '&:hover': { bgcolor: '#FFF3E0' } }}
              >
                Sincronizar
              </Button>
            </Tooltip>
          ) : (
            <Chip label="✅ Sync" size="small" sx={{ bgcolor: '#E8F5E9', color: '#2E7D32', fontWeight: 600, fontSize: '0.62rem' }} />
          )}
        </TableCell>
      </>
    );
  };

  const renderPagoInst = (paid: boolean | undefined, hasInst: boolean | undefined, small = false, row?: PackageRow) => (
    <TableCell align="center">
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
        <Tooltip title={isSuperAdmin && row ? (paid ? 'Pago registrado — click para desmarcar' : 'Click para marcar como pagado') : (paid ? 'Pago registrado' : 'Sin pago registrado')}>
          <Box
            onClick={isSuperAdmin && row ? () => paid ? handleUnmarkPaid(row) : handleMarkPaid(row) : undefined}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.25, cursor: isSuperAdmin && row ? 'pointer' : 'default', borderRadius: 1, px: 0.25, '&:hover': isSuperAdmin && row ? { bgcolor: paid ? '#FFEBEE' : '#E8F5E9' } : {} }}
          >
            {paid ? <CheckCircleIcon sx={{ fontSize: small ? 14 : 16, color: '#2E7D32' }} /> : <RadioButtonUncheckedIcon sx={{ fontSize: small ? 14 : 16, color: isSuperAdmin && row ? '#F05A28' : '#BDBDBD' }} />}
            <Typography variant="caption" sx={{ color: paid ? '#2E7D32' : isSuperAdmin && row ? '#F05A28' : '#9E9E9E', fontSize: small ? '0.6rem' : '0.65rem', lineHeight: 1 }}>Pago</Typography>
          </Box>
        </Tooltip>
        <Tooltip title={hasInst ? 'Con instrucciones de envío' : isSuperAdmin && row && !hasInst ? 'Click para marcar etiqueta impresa' : 'Sin instrucciones'}>
          <Box
            onClick={isSuperAdmin && row && !hasInst ? () => handleMarkInstruccion(row) : undefined}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.25, cursor: isSuperAdmin && row && !hasInst ? 'pointer' : 'default', borderRadius: 1, px: 0.25, '&:hover': isSuperAdmin && row && !hasInst ? { bgcolor: '#E3F2FD' } : {} }}
          >
            {hasInst ? <CheckCircleIcon sx={{ fontSize: small ? 14 : 16, color: '#1565C0' }} /> : <RadioButtonUncheckedIcon sx={{ fontSize: small ? 14 : 16, color: isSuperAdmin && row ? '#1976D2' : '#BDBDBD' }} />}
            <Typography variant="caption" sx={{ color: hasInst ? '#1565C0' : isSuperAdmin && row ? '#1976D2' : '#9E9E9E', fontSize: small ? '0.6rem' : '0.65rem', lineHeight: 1 }}>Inst.</Typography>
          </Box>
        </Tooltip>
      </Box>
    </TableCell>
  );

  // ── Fila genérica (no TDI master) ──
  const renderFlatRow = (r: PackageRow, i: number) => (
    <TableRow key={i} hover selected={selectedGuias.has(r.guia)}>
      <TableCell sx={{ p: 0.5, width: 44 }}>
        <Checkbox size="small" checked={selectedGuias.has(r.guia)}
          onChange={() => setSelectedGuias(prev => { const n = new Set(prev); n.has(r.guia) ? n.delete(r.guia) : n.add(r.guia); return n; })}
          sx={{ p: 0.5 }}
        />
      </TableCell>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="body2" fontWeight={700} fontFamily="monospace">{r.guia || '—'}</Typography>
          {r.guia && <Tooltip title="Copiar"><IconButton size="small" onClick={() => navigator.clipboard.writeText(r.guia)}><ContentCopyIcon sx={{ fontSize: 13 }} /></IconButton></Tooltip>}
        </Box>
        {r.guia_corta && r.guia_corta !== r.guia && <Typography variant="caption" color="text.secondary" fontFamily="monospace">{r.guia_corta}</Typography>}
      </TableCell>
      {service !== 'maritimo' && (
        <TableCell>
          {r.guia_origen
            ? <><Typography variant="caption" fontFamily="monospace" color="text.secondary" display="block">{r.guia_origen}</Typography>
                {r.guia_origen_carrier && <Typography variant="caption" sx={{ color: '#888', fontSize: '0.65rem' }}>{r.guia_origen_carrier}</Typography>}</>
            : <Typography variant="caption" color="text.disabled">—</Typography>}
        </TableCell>
      )}
      <TableCell>
        <Typography variant="body2" fontWeight={600}>{r.box_id || '—'}</Typography>
        {r.cliente_nombre && <Typography variant="caption" color="text.secondary" display="block">{r.cliente_nombre}</Typography>}
      </TableCell>
      {(service === 'tdi_aereo' || service === 'tdi_express' || service === 'pobox_usa' || service === 'dhl') && (
        <TableCell>
          {r.paqueteria ? <Typography variant="caption" fontWeight={600}>{r.paqueteria}</Typography> : <Typography variant="caption" color="text.disabled">—</Typography>}
        </TableCell>
      )}
      {(service === 'tdi_aereo' || service === 'tdi_express' || service === 'pobox_usa' || service === 'dhl') && (
        <TableCell>
          {r.guia_salida
            ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" fontFamily="monospace">{r.guia_salida}</Typography>
                <Tooltip title="Copiar"><IconButton size="small" onClick={() => navigator.clipboard.writeText(r.guia_salida!)}><ContentCopyIcon sx={{ fontSize: 11 }} /></IconButton></Tooltip>
              </Box>
            : <Typography variant="caption" color="text.disabled">—</Typography>}
        </TableCell>
      )}
      <TableCell><Typography variant="caption">{fmt(r.received_at)}</Typography></TableCell>
      <TableCell><Typography variant="caption" color="text.secondary">{fmt(r.updated_at)}</Typography></TableCell>
      <TableCell>{statusChip(r.status)}</TableCell>
      {renderPagoInst(r.costing_paid, r.has_instructions, false, r)}
      {renderExCells(r)}
      {service === 'pobox_usa' && (() => {
        const us = usGuias[r.guia];
        const isEditing = editingUsGuias.has(r.guia);
        return (
          <TableCell>
            {us?.state === 'loading' ? <CircularProgress size={12} sx={{ color: '#7B1FA2' }} />
            : us?.guia_unica && !isEditing ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                <Typography variant="caption" fontFamily="monospace" sx={{ fontSize: '0.7rem', color: '#7B1FA2', fontWeight: 600 }}>{us.guia_unica}</Typography>
                <Tooltip title="Copiar"><IconButton size="small" onClick={() => navigator.clipboard.writeText(us.guia_unica!)}><ContentCopyIcon sx={{ fontSize: 11 }} /></IconButton></Tooltip>
                <Tooltip title="Editar guía US">
                  <IconButton size="small" onClick={() => { setManualUsInputs(prev => ({ ...prev, [r.guia]: us.guia_unica! })); setEditingUsGuias(prev => new Set([...prev, r.guia])); }}>
                    <EditIcon sx={{ fontSize: 11, color: '#7B1FA2' }} />
                  </IconButton>
                </Tooltip>
              </Box>
            ) : us?.state === 'error' ? <Typography variant="caption" color="error" sx={{ fontSize: '0.65rem' }}>Error</Typography>
            : isEditing ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                <TextField
                  autoFocus
                  size="small"
                  variant="outlined"
                  placeholder="US-120-..."
                  value={manualUsInputs[r.guia] || ''}
                  onChange={e => setManualUsInputs(prev => ({ ...prev, [r.guia]: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleManualUsGuia(r.guia);
                    if (e.key === 'Escape') setEditingUsGuias(prev => { const next = new Set(prev); next.delete(r.guia); return next; });
                  }}
                  inputProps={{ style: { fontSize: '0.68rem', fontFamily: 'monospace', padding: '2px 6px', width: 120 } }}
                />
                <Tooltip title="Guardar y consultar">
                  <IconButton size="small" onClick={() => handleManualUsGuia(r.guia)}>
                    <CheckIcon sx={{ fontSize: 13, color: '#2E7D32' }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Cancelar">
                  <IconButton size="small" onClick={() => setEditingUsGuias(prev => { const next = new Set(prev); next.delete(r.guia); return next; })}>
                    <CloseIcon sx={{ fontSize: 13, color: '#B71C1C' }} />
                  </IconButton>
                </Tooltip>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                <Typography variant="caption" color="text.disabled">—</Typography>
                <Tooltip title="Agregar guía US manualmente">
                  <IconButton size="small" onClick={() => setEditingUsGuias(prev => new Set([...prev, r.guia]))}>
                    <EditIcon sx={{ fontSize: 12, color: '#7B1FA2' }} />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </TableCell>
        );
      })()}
    </TableRow>
  );

  // ── Filas TDI Aéreo con grupos master/hijos ──
  const renderTdiRows = (displayRows: PackageRow[]) => displayRows.map((r, i) => {
    const children = r.children ?? [];
    const isMasterRow = children.length > 0;
    const isExpanded = expandedMasters.has(r.guia);
    const toggleExpand = () => setExpandedMasters(prev => {
      const next = new Set(prev);
      if (next.has(r.guia)) next.delete(r.guia); else next.add(r.guia);
      return next;
    });
    return (
      <Fragment key={r.guia || i}>
        <TableRow
          hover
          selected={selectedGuias.has(r.guia)}
          sx={isMasterRow ? { bgcolor: '#EDE7F6', cursor: 'pointer' } : undefined}
          onClick={isMasterRow ? toggleExpand : undefined}
        >
          <TableCell sx={{ p: 0.5, width: 44 }} onClick={e => e.stopPropagation()}>
            <Checkbox size="small" checked={selectedGuias.has(r.guia)}
              onChange={() => setSelectedGuias(prev => { const n = new Set(prev); n.has(r.guia) ? n.delete(r.guia) : n.add(r.guia); return n; })}
              sx={{ p: 0.5 }}
            />
          </TableCell>
          <TableCell>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {isMasterRow && (
                <IconButton size="small" onClick={e => { e.stopPropagation(); toggleExpand(); }} sx={{ p: 0.25 }}>
                  {isExpanded ? <KeyboardArrowUpIcon sx={{ fontSize: 18, color: '#7B1FA2' }} /> : <KeyboardArrowDownIcon sx={{ fontSize: 18, color: '#7B1FA2' }} />}
                </IconButton>
              )}
              <Typography variant="body2" fontWeight={700} fontFamily="monospace" sx={{ fontSize: isMasterRow ? '0.88rem' : '0.82rem' }}>
                {r.guia || '—'}
              </Typography>
              {r.guia && <Tooltip title="Copiar"><IconButton size="small" onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(r.guia); }}><ContentCopyIcon sx={{ fontSize: 13 }} /></IconButton></Tooltip>}
              {isMasterRow && <Chip label={`${children.length} piez.`} size="small" sx={{ fontSize: '0.62rem', bgcolor: '#7B1FA2', color: '#fff', fontWeight: 700, height: 18 }} />}
            </Box>
            {r.guia_corta && r.guia_corta !== r.guia && <Typography variant="caption" color="text.secondary" fontFamily="monospace">{r.guia_corta}</Typography>}
          </TableCell>
          <TableCell>{r.guia_origen ? <Typography variant="caption" fontFamily="monospace" color="text.secondary">{r.guia_origen}</Typography> : <Typography variant="caption" color="text.disabled">—</Typography>}</TableCell>
          <TableCell>
            <Typography variant="body2" fontWeight={600}>{r.box_id || '—'}</Typography>
            {r.cliente_nombre && <Typography variant="caption" color="text.secondary" display="block">{r.cliente_nombre}</Typography>}
          </TableCell>
          <TableCell>{r.paqueteria ? <Typography variant="caption" fontWeight={600}>{r.paqueteria}</Typography> : <Typography variant="caption" color="text.disabled">—</Typography>}</TableCell>
          <TableCell>
            {r.guia_salida
              ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" fontFamily="monospace">{r.guia_salida}</Typography>
                  <Tooltip title="Copiar"><IconButton size="small" onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(r.guia_salida!); }}><ContentCopyIcon sx={{ fontSize: 11 }} /></IconButton></Tooltip>
                </Box>
              : <Typography variant="caption" color="text.disabled">—</Typography>}
          </TableCell>
          <TableCell><Typography variant="caption">{fmt(r.received_at)}</Typography></TableCell>
          <TableCell><Typography variant="caption" color="text.secondary">{fmt(r.updated_at)}</Typography></TableCell>
          <TableCell>{statusChip(r.status)}</TableCell>
          {renderPagoInst(r.costing_paid, r.has_instructions, false, r)}
          {renderExCells(r)}
        </TableRow>
        {isMasterRow && children.map((child, ci) => (
          <TableRow key={`child-${ci}`} sx={{ display: isExpanded ? undefined : 'none', bgcolor: '#FAFAFA', '& td': { borderBottom: '1px dashed #E0E0E0', py: '4px' } }}>
            <TableCell sx={{ pl: 5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" sx={{ color: '#BDBDBD' }}>↳</Typography>
                <Typography variant="body2" fontFamily="monospace" sx={{ color: '#555', fontSize: '0.78rem', fontWeight: 600 }}>{child.guia}</Typography>
                <Tooltip title="Copiar"><IconButton size="small" onClick={() => navigator.clipboard.writeText(child.guia)}><ContentCopyIcon sx={{ fontSize: 11 }} /></IconButton></Tooltip>
              </Box>
            </TableCell>
            <TableCell><Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>↑</Typography></TableCell>
            <TableCell><Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>↑</Typography></TableCell>
            <TableCell>{child.paqueteria ? <Typography variant="caption">{child.paqueteria}</Typography> : <Typography variant="caption" color="text.disabled">—</Typography>}</TableCell>
            <TableCell>
              {child.guia_salida
                ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="caption" fontFamily="monospace" sx={{ fontSize: '0.72rem' }}>{child.guia_salida}</Typography>
                    <Tooltip title="Copiar"><IconButton size="small" onClick={() => navigator.clipboard.writeText(child.guia_salida!)}><ContentCopyIcon sx={{ fontSize: 10 }} /></IconButton></Tooltip>
                  </Box>
                : <Typography variant="caption" color="text.disabled">—</Typography>}
            </TableCell>
            <TableCell><Typography variant="caption" sx={{ fontSize: '0.7rem' }}>{fmt(child.received_at)}</Typography></TableCell>
            <TableCell><Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>{fmt(child.updated_at)}</Typography></TableCell>
            <TableCell>{statusChip(child.status)}</TableCell>
            {renderPagoInst(r.costing_paid, r.has_instructions, true, r)}
            <TableCell colSpan={3} />
          </TableRow>
        ))}
      </Fragment>
    );
  });

  // ── Aplicar filtros client-side ──
  const displayRows = rows.filter(r => {
    if (syncFilter) {
      const ex = exData[r.guia];
      if (syncFilter === 'synced' && !(ex?.state === 'done' && !needsSync(r, ex))) return false;
      if (syncFilter === 'needs_sync' && !(ex?.state === 'done' && needsSync(r, ex))) return false;
      if (syncFilter === 'not_found' && ex?.state !== 'notfound') return false;
    }
    if (instrFilter === 'with' && !r.has_instructions && !r.has_delivery_address) return false;
    if (instrFilter === 'without' && (r.has_instructions || r.has_delivery_address)) return false;
    return true;
  });

  const exConsultedCount = rows.filter(r => exData[r.guia] && exData[r.guia].state !== 'idle' && exData[r.guia].state !== 'loading').length;

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>
        📦 Inventario por Tipo de Servicio
      </Typography>

      <ToggleButtonGroup
        value={service} exclusive onChange={(_, v) => v && setService(v)}
        sx={{ mb: 2, flexWrap: 'wrap', gap: 0.5 }} size="small"
      >
        {SERVICES.map(s => (
          <ToggleButton key={s.key} value={s.key} sx={{ borderRadius: '20px !important', px: 2, '&.Mui-selected': { bgcolor: s.color, color: '#fff', '&:hover': { bgcolor: s.color } } }}>
            <span style={{ marginRight: 6 }}>{s.emoji}</span>{s.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small" placeholder="Buscar guía, origen, cliente..." value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            sx={{ minWidth: 240 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <TextField size="small" label="Desde" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" label="Hasta" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }} />

          {/* Filtro Status (server-side) */}
          <FormControl size="small" sx={{ minWidth: 165 }}>
            <InputLabel>Último Status</InputLabel>
            <Select label="Último Status" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}>
              <MenuItem value=""><em>Todos</em></MenuItem>
              {Object.entries(activeStatusLabels).map(([key, meta]) => (
                <MenuItem key={key} value={key}>
                  <Chip label={meta.label} size="small" sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 600, fontSize: '0.7rem', cursor: 'pointer' }} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Filtro Sync (client-side sobre exData cargado) */}
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Estado EntregaX</InputLabel>
            <Select label="Estado EntregaX" value={syncFilter} onChange={e => setSyncFilter(e.target.value as typeof syncFilter)}>
              <MenuItem value=""><em>Todos</em></MenuItem>
              <MenuItem value="synced"><Chip label="✅ Sincronizadas" size="small" sx={{ bgcolor: '#E8F5E9', color: '#2E7D32', fontWeight: 600, fontSize: '0.7rem', cursor: 'pointer' }} /></MenuItem>
              <MenuItem value="needs_sync"><Chip label="🔄 Por sincronizar" size="small" sx={{ bgcolor: '#FFF3E0', color: '#E65100', fontWeight: 600, fontSize: '0.7rem', cursor: 'pointer' }} /></MenuItem>
              <MenuItem value="not_found"><Chip label="❌ No encontradas" size="small" sx={{ bgcolor: '#FFEBEE', color: '#B71C1C', fontWeight: 600, fontSize: '0.7rem', cursor: 'pointer' }} /></MenuItem>
            </Select>
          </FormControl>

          <Button variant="contained" size="small" onClick={() => { setPage(0); load(); }} startIcon={<SearchIcon />} sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d44e22' } }}>
            Filtrar
          </Button>
          <Tooltip title="Recargar">
            <IconButton size="small" onClick={load}><RefreshIcon fontSize="small" /></IconButton>
          </Tooltip>

          {service === 'pobox_usa' && (() => {
            const pending = rows.filter(r => r.guia_origen && !r.guia_us_saved && !usGuias[r.guia]?.guia_unica).length;
            return (
              <Button variant="outlined" size="small"
                onClick={() => { if (usFetching) { usAbortRef.current = true; } else { fetchGuiaUS(); } }}
                startIcon={usFetching ? <CircularProgress size={14} /> : <LocalShippingIcon fontSize="small" />}
                sx={{ borderColor: '#7B1FA2', color: '#7B1FA2', '&:hover': { bgcolor: '#F3E5F5' }, whiteSpace: 'nowrap' }}
              >
                {usFetching ? `Guia US ${usProgress}%` : pending > 0 ? `Consultar Guia US (${pending})` : 'Guia US ✓ al día'}
              </Button>
            );
          })()}

          <Button variant="outlined" size="small"
            onClick={() => { if (exFetching) { fetchAbortRef.current = true; } else { fetchEntregax(); } }}
            startIcon={exFetching ? <CircularProgress size={14} /> : <LocalShippingIcon fontSize="small" />}
            sx={{ borderColor: '#1565C0', color: '#1565C0', '&:hover': { bgcolor: '#E3F2FD' }, whiteSpace: 'nowrap' }}
          >
            {exFetching ? `EntregaX ${exProgress}%` : exConsultedCount > 0 ? `Actualizar EntregaX (${exConsultedCount}/${rows.length})` : 'Consultar EntregaX'}
          </Button>

          {(() => {
            const pendingSync = displayRows.filter(r => { const ex = exData[r.guia]; return selectedGuias.has(r.guia) && ex?.state === 'done' && needsSync(r, ex); }).length;
            if (pendingSync === 0) return null;
            return (
              <Button variant="outlined" size="small"
                onClick={syncAll}
                disabled={syncingAll || exFetching}
                startIcon={syncingAll ? <CircularProgress size={14} /> : <SyncIcon fontSize="small" />}
                sx={{ borderColor: '#E65100', color: '#E65100', '&:hover': { bgcolor: '#FFF3E0' }, whiteSpace: 'nowrap' }}
              >
                {syncingAll ? `Sincronizando… ${syncAllProgress.done}/${syncAllProgress.total}` : `Sincronizar Todo (${pendingSync})`}
              </Button>
            );
          })()}

          <Box sx={{ ml: 'auto', textAlign: 'right' }}>
            <Typography variant="caption" color="text.secondary" display="block">
              {loading ? 'Cargando…' : `${total.toLocaleString()} ${service === 'tdi_aereo' && !search ? 'envíos' : 'guías'}`}
            </Typography>
            {syncFilter && (
              <Typography variant="caption" sx={{ color: '#E65100', fontSize: '0.65rem' }}>
                Filtro EntregaX: {displayRows.length} de {total} guías totales
              </Typography>
            )}
          </Box>
        </Box>
      </Paper>

      {usFetching && (
        <Box sx={{ mb: 1 }}>
          <LinearProgress variant="determinate" value={usProgress} sx={{ height: 4, borderRadius: 2, bgcolor: '#F3E5F5', '& .MuiLinearProgress-bar': { bgcolor: '#7B1FA2' } }} />
          <Typography variant="caption" color="text.secondary">Consultando Guia US… {usProgress}%</Typography>
        </Box>
      )}
      {exFetching && (
        <Box sx={{ mb: 1 }}>
          <LinearProgress variant="determinate" value={exProgress} sx={{ height: 4, borderRadius: 2, bgcolor: '#E3F2FD', '& .MuiLinearProgress-bar': { bgcolor: '#1565C0' } }} />
          <Typography variant="caption" color="text.secondary">Consultando EntregaX… {exProgress}%</Typography>
        </Box>
      )}

      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700, width: 44, p: 0.5 }}>
                {(() => {
                  const guias = displayRows.map(r => r.guia);
                  const allSel = guias.length > 0 && guias.every(g => selectedGuias.has(g));
                  const someSel = guias.some(g => selectedGuias.has(g));
                  return (
                    <Tooltip title={allSel ? 'Deseleccionar todo' : 'Seleccionar todo'}>
                      <Checkbox size="small" checked={allSel} indeterminate={someSel && !allSel}
                        onChange={() => setSelectedGuias(allSel ? new Set() : new Set(guias))}
                        sx={{ color: '#fff', '&.Mui-checked,&.MuiCheckbox-indeterminate': { color: '#bbb' }, p: 0.5 }}
                      />
                    </Tooltip>
                  );
                })()}
              </TableCell>
              <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>GUÍA</TableCell>
              {service !== 'maritimo' && <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>{service === 'dhl' ? 'GUÍA HIJA' : 'GUÍA ORIGEN'}</TableCell>}
              <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>CLIENTE</TableCell>
              {(service === 'tdi_aereo' || service === 'tdi_express' || service === 'pobox_usa' || service === 'dhl') && <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>PAQUETERÍA</TableCell>}
              {(service === 'tdi_aereo' || service === 'tdi_express' || service === 'pobox_usa' || service === 'dhl') && <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>GUÍA SALIDA</TableCell>}
              <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>FECHA INGRESO</TableCell>
              <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>ÚLTIMO MOVIMIENTO</TableCell>
              <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>ÚLTIMO STATUS</TableCell>
              <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }} align="center">
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                  PAGO / INST.
                  {service !== 'pobox_usa' && service !== 'dhl' && (
                    <Tooltip title={instrFilter === 'without' ? 'Mostrando: Sin instrucciones' : instrFilter === 'with' ? 'Mostrando: Con instrucciones' : 'Filtrar por instrucciones'}>
                      <Box
                        component="span"
                        onClick={() => setInstrFilter(prev => prev === '' ? 'without' : prev === 'without' ? 'with' : '')}
                        sx={{ cursor: 'pointer', fontSize: '0.65rem', bgcolor: instrFilter === 'without' ? '#EF5350' : instrFilter === 'with' ? '#66BB6A' : '#444', color: '#fff', borderRadius: 1, px: 0.75, py: 0.25, userSelect: 'none', whiteSpace: 'nowrap' }}
                      >
                        {instrFilter === 'without' ? 'Sin inst.' : instrFilter === 'with' ? 'Con inst.' : 'Todas'}
                      </Box>
                    </Tooltip>
                  )}
                </Box>
              </TableCell>
              <TableCell sx={{ bgcolor: '#1565C0', color: '#fff', fontWeight: 700 }} align="center">ENTREGAX</TableCell>
              <TableCell sx={{ bgcolor: '#1565C0', color: '#fff', fontWeight: 700 }}>STATUS ENTREGAX</TableCell>
              {service === 'pobox_usa' && <TableCell sx={{ bgcolor: '#7B1FA2', color: '#fff', fontWeight: 700 }}>GUÍA US</TableCell>}
              <TableCell sx={{ bgcolor: '#2E7D32', color: '#fff', fontWeight: 700 }} align="center">SINC.</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={12} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
            ) : displayRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} align="center" sx={{ py: 4, color: '#999' }}>
                  {syncFilter ? 'Sin resultados para este filtro. Consulta EntregaX para ver el estado de sincronización.' : 'Sin resultados'}
                </TableCell>
              </TableRow>
            ) : service === 'tdi_aereo' ? (
              renderTdiRows(displayRows)
            ) : (
              displayRows.map((r, i) => renderFlatRow(r, i))
            )}
          </TableBody>
        </Table>
        {!syncFilter && (
          <TablePagination
            component="div"
            count={total}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={(_, p) => setPage(p)}
            onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
            rowsPerPageOptions={[25, 50, 100, 200]}
            labelRowsPerPage="Filas:"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
          />
        )}
      </Paper>
      <Snackbar open={snackbar.open} autoHideDuration={3500} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))} sx={{ width: '100%' }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
