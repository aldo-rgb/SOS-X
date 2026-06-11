import { useState, useCallback, useEffect, useRef, Fragment } from 'react';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Chip, CircularProgress, TextField, Button, ToggleButtonGroup, ToggleButton,
  TablePagination, InputAdornment, Tooltip, IconButton, LinearProgress,
  Select, MenuItem, FormControl, InputLabel, Collapse,
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
import api from '../services/api';

const ORANGE = '#F05A28';

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
  guia_us_saved?: string;
  // TDI Aéreo: estructura master/hijos
  pkg_id?: number;
  master_id?: number | null;
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

export default function ServiceInventoryPage() {
  const [service, setService] = useState('tdi_aereo');
  const [rows, setRows] = useState<PackageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [exData, setExData] = useState<Record<string, EntregaxRow>>({});
  const [exFetching, setExFetching] = useState(false);
  const [exProgress, setExProgress] = useState(0);
  const fetchAbortRef = useRef(false);
  const [syncState, setSyncState] = useState<Record<string, 'idle' | 'syncing' | 'done' | 'error'>>({});
  // PO Box: guia_unica descubierta via carrier tracking (paso 1 separado)
  const [usGuias, setUsGuias] = useState<Record<string, { state: 'idle'|'loading'|'done'|'notfound'|'error'; guia_unica?: string }>>({});
  const [usFetching, setUsFetching] = useState(false);
  const [usProgress, setUsProgress] = useState(0);
  const usAbortRef = useRef(false);
  // TDI Aéreo: masters expandidos
  const [expandedMasters, setExpandedMasters] = useState<Set<string>>(new Set());

  const fmt = (d?: string | null) =>
    d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  const statusChip = (s: string) => {
    const meta = STATUS_LABELS[s] || { label: s, color: '#555', bg: '#eee' };
    return <Chip label={meta.label} size="small" sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 600, fontSize: '0.7rem' }} />;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/packages/service-inventory', {
        params: { service, limit: rowsPerPage, offset: page * rowsPerPage, search: search || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined, status: statusFilter || undefined },
      });
      setRows(r.data.rows || []);
      setTotal(r.data.total || 0);
    } catch { setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [service, page, rowsPerPage, search, dateFrom, dateTo, statusFilter]);

  useEffect(() => { setPage(0); setStatusFilter(''); setExData({}); setSyncState({}); setUsGuias({}); setExpandedMasters(new Set()); }, [service]);
  useEffect(() => { load(); setExData({}); setSyncState({}); setUsGuias({}); }, [load]);

  // Pre-popular usGuias desde guia_us_saved cuando llegan las filas (PO Box)
  useEffect(() => {
    if (service !== 'pobox_usa') return;
    const saved: Record<string, { state: 'done'; guia_unica: string }> = {};
    rows.forEach(r => {
      if (r.guia_us_saved) saved[r.guia] = { state: 'done', guia_unica: r.guia_us_saved };
    });
    if (Object.keys(saved).length > 0) setUsGuias(prev => ({ ...saved, ...prev }));
  }, [rows, service]);

  // Mapea status de EntregaX a nuestro valor interno
  const mapExStatusToInternal = (ex: EntregaxRow): string | undefined => {
    const ls = (ex.lastStatus || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (ls.includes('entregado') || ls.includes('delivered')) return 'delivered';
    if (ls.includes('en ruta') || ls.includes('en camino') || ls.includes('out_for_delivery')) return 'out_for_delivery';
    // Paquetería local (entregax_local_mty) no mapea a 'shipped' — es entrega local, no envío nacional
    const isLocalCarrier = (ex.paqueteria || '').toLowerCase().includes('local');
    if (!isLocalCarrier && (ex.guiaSalida || ls.includes('enviado') || ls.includes('shipped') || ls.includes('sent'))) return 'shipped';
    if (ls.includes('transito') || ls.includes('transit')) return 'in_transit';
    return undefined;
  };

  // Normaliza nombre de paquetería para comparación fuzzy
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

  // Devuelve razones de mismatch entre nuestros datos y EntregaX; array vacío = datos válidos
  const getExMismatches = (row: PackageRow, ex: EntregaxRow | undefined): string[] => {
    if (!ex || ex.state !== 'done') return [];
    const issues: string[] = [];
    if (row.paqueteria && ex.paqueteria && !carriersMatch(row.paqueteria, ex.paqueteria))
      issues.push(`Paquetería: nuestro sistema="${row.paqueteria}" EntregaX="${ex.paqueteria}"`);
    if (row.guia_salida && ex.guiaSalida &&
        row.guia_salida.trim().toUpperCase() !== ex.guiaSalida.trim().toUpperCase())
      issues.push(`Guía salida: nuestro sistema="${row.guia_salida}" EntregaX="${ex.guiaSalida}"`);
    return issues;
  };

  // Determina si una fila necesita sincronización
  const needsSync = (row: PackageRow, ex: EntregaxRow | undefined): boolean => {
    if (!ex || ex.state !== 'done') return false;
    if (!!ex.hasPago && !row.costing_paid) return true;
    if (ex.guiaSalida && ex.guiaSalida.trim().toUpperCase() !== (row.guia_salida || '').trim().toUpperCase()) return true;
    if (!ex.guiaSalida && !!ex.hasInstrucciones && !row.has_instructions) return true;
    const mappedStatus = mapExStatusToInternal(ex);
    if (mappedStatus && mappedStatus !== row.status) return true;
    return false;
  };

  const syncRow = async (row: PackageRow) => {
    const ex = exData[row.guia];
    if (!ex || ex.state !== 'done') return;
    setSyncState(prev => ({ ...prev, [row.guia]: 'syncing' }));
    const hasGuiaSalida = !!ex.guiaSalida;
    const mappedStatus = mapExStatusToInternal(ex);
    const newStatus = mappedStatus && mappedStatus !== row.status ? mappedStatus : undefined;
    try {
      await api.post('/packages/sync-from-entregax', {
        guia: row.guia,
        service,
        hasPago: ex.hasPago && !row.costing_paid,
        hasInstrucciones: !hasGuiaSalida && !!ex.hasInstrucciones && !row.has_instructions,
        paqueteria: !row.has_instructions ? ex.paqueteria : undefined,
        guia_salida: hasGuiaSalida ? ex.guiaSalida : undefined,
        direccion_entrega: !hasGuiaSalida && !row.has_instructions ? ex.direccionEntrega : undefined,
        newStatus,
      });
      setRows(prev => prev.map(r => {
        if (r.guia !== row.guia) return r;
        return {
          ...r,
          costing_paid: r.costing_paid || (ex.hasPago ?? false),
          has_instructions: r.has_instructions || !!ex.hasInstrucciones || hasGuiaSalida,
          paqueteria: row.has_instructions ? r.paqueteria : (ex.paqueteria || r.paqueteria),
          guia_salida: ex.guiaSalida || r.guia_salida,
          status: newStatus || r.status,
        };
      }));
      setSyncState(prev => ({ ...prev, [row.guia]: 'done' }));
      setTimeout(() => setSyncState(prev => prev[row.guia] === 'done' ? { ...prev, [row.guia]: 'idle' } : prev), 3000);
    } catch {
      setSyncState(prev => ({ ...prev, [row.guia]: 'error' }));
    }
  };

  // Solo para PO Box: consulta guia_origen para descubrir guia_unica de cada paquete
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
      setUsGuias(prev => {
        const next = { ...prev };
        batch.forEach(e => { next[e.storeKey] = { state: 'loading' }; });
        return next;
      });
      await Promise.all(batch.map(async ({ storeKey, queryKey }) => {
        try {
          const res = await api.get(`/national/payment-query/${encodeURIComponent(queryKey)}`).catch((err: any) => {
            return { data: null, _notfound: err?.response?.status === 404 } as any;
          });
          const d = res?.data?.status === 'success' ? res.data.data : null;
          if (d?.guia_unica) {
            setUsGuias(prev => ({ ...prev, [storeKey]: { state: 'done', guia_unica: d.guia_unica } }));
            api.post('/packages/save-guia-us', { tracking_internal: storeKey, guia_unica: d.guia_unica }).catch(() => {});
          } else {
            setUsGuias(prev => ({ ...prev, [storeKey]: { state: res?._notfound ? 'notfound' : 'error' } }));
          }
        } catch {
          setUsGuias(prev => ({ ...prev, [storeKey]: { state: 'error' } }));
        }
      }));
      done += batch.length;
      setUsProgress(Math.round((done / entries.length) * 100));
    }
    setUsFetching(false);
  }, [rows, service, usGuias]);

  const fetchEntregax = useCallback(async () => {
    if (rows.length === 0) return;
    fetchAbortRef.current = false;
    setExFetching(true);
    setExProgress(0);
    const entries: { storeKey: string; queryKey: string }[] = rows
      .filter(r => r.guia)
      .map(r => ({
        storeKey: r.guia,
        queryKey: service === 'pobox_usa'
          ? (usGuias[r.guia]?.guia_unica || r.guia_origen || r.guia)
          : r.guia,
      }));
    const BATCH = 5;
    let done = 0;
    for (let i = 0; i < entries.length; i += BATCH) {
      if (fetchAbortRef.current) break;
      const batch = entries.slice(i, i + BATCH);
      setExData(prev => {
        const next = { ...prev };
        batch.forEach(e => { next[e.storeKey] = { state: 'loading' }; });
        return next;
      });
      await Promise.all(batch.map(async ({ storeKey, queryKey }) => {
        try {
          const res = await api.get(`/national/payment-query/${encodeURIComponent(queryKey)}`).catch((err: any) => {
            const is404 = err?.response?.status === 404;
            return { data: null, _notfound: is404 } as any;
          });
          const d = res?.data?.status === 'success' ? res.data.data : null;
          const notfound = res?._notfound ?? false;
          if (d) {
            const historial = d.historial || [];
            const lastH = historial[historial.length - 1];
            const guiaUnica = d.guia_unica || d.waybill?.guia_unica || d.guias?.[0]?.guia_unica || undefined;
            setExData(prev => ({
              ...prev,
              [storeKey]: {
                state: 'done',
                hasPago: (d.pagos || []).length > 0 || d.waybill?.pagado === '1',
                hasInstrucciones: d.waybill?.instrucciones === '1' || !!d.waybill?.direccion_entrega,
                guiaSalida: d.waybill?.guiasalida || d.waybill?.guia_salida || undefined,
                guiaIngreso: guiaUnica,
                paqueteria: d.waybill?.paqueteria && d.waybill.paqueteria !== '0' ? d.waybill.paqueteria : undefined,
                lastStatus: d.waybill?.estado || lastH?.estado || undefined,
                direccionEntrega: d.waybill?.direccion_entrega || undefined,
              },
            }));
          } else {
            setExData(prev => ({ ...prev, [storeKey]: { state: notfound ? 'notfound' : 'error' } }));
          }
        } catch {
          setExData(prev => ({ ...prev, [storeKey]: { state: 'error' } }));
        }
      }));
      done += batch.length;
      setExProgress(Math.round((done / entries.length) * 100));
    }
    setExFetching(false);
  }, [rows, service, usGuias]);

  // ── Celdas de EntregaX + Sync (reutilizadas para master y filas planas) ──
  const renderExCells = (r: PackageRow) => {
    const ex = exData[r.guia];
    const exColSpan = service === 'pobox_usa' ? 4 : 3;
    if (!ex || ex.state === 'idle') return (
      <TableCell align="center" colSpan={exColSpan}><Typography variant="caption" color="text.disabled">—</Typography></TableCell>
    );
    if (ex.state === 'loading') return (
      <TableCell align="center" colSpan={exColSpan}><CircularProgress size={14} /></TableCell>
    );
    if (ex.state === 'notfound') return (
      <TableCell align="center" colSpan={exColSpan}><Typography variant="caption" color="text.disabled">—</Typography></TableCell>
    );
    if (ex.state === 'error') return (
      <TableCell align="center" colSpan={exColSpan}><Typography variant="caption" color="error">Sin datos</Typography></TableCell>
    );
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
                {hasMismatch
                  ? <CheckCircleIcon sx={{ fontSize: 16, color: '#F9A825' }} />
                  : ex.hasPago
                    ? <CheckCircleIcon sx={{ fontSize: 16, color: '#2E7D32' }} />
                    : <RadioButtonUncheckedIcon sx={{ fontSize: 16, color: '#BDBDBD' }} />}
                <Typography variant="caption" sx={{ color: hasMismatch ? '#F9A825' : ex.hasPago ? '#2E7D32' : '#9E9E9E', fontSize: '0.65rem' }}>
                  {hasMismatch ? '⚠️' : ''}Pago
                </Typography>
              </Box>
            </Tooltip>
            <Tooltip title={ex.hasInstrucciones ? 'Con instrucciones en EntregaX' : 'Sin instrucciones en EntregaX'}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                {ex.hasInstrucciones ? <CheckCircleIcon sx={{ fontSize: 16, color: hasMismatch ? '#F9A825' : '#1565C0' }} /> : <RadioButtonUncheckedIcon sx={{ fontSize: 16, color: '#BDBDBD' }} />}
                <Typography variant="caption" sx={{ color: hasMismatch ? '#F9A825' : ex.hasInstrucciones ? '#1565C0' : '#9E9E9E', fontSize: '0.65rem' }}>Inst.</Typography>
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
          ) : (
            <Typography variant="caption" color="text.disabled">—</Typography>
          )}
        </TableCell>
        {service === 'pobox_usa' && (
          <TableCell>
            {ex.guiaIngreso ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" fontFamily="monospace" sx={{ fontSize: '0.7rem' }}>{ex.guiaIngreso}</Typography>
                <Tooltip title="Copiar"><IconButton size="small" onClick={() => navigator.clipboard.writeText(ex.guiaIngreso!)}><ContentCopyIcon sx={{ fontSize: 11 }} /></IconButton></Tooltip>
              </Box>
            ) : <Typography variant="caption" color="text.disabled">—</Typography>}
          </TableCell>
        )}
        <TableCell align="center">
          {sState === 'syncing' ? (
            <CircularProgress size={16} />
          ) : sState === 'done' ? (
            <Chip label="✅ Sincronizado" size="small" sx={{ bgcolor: '#E8F5E9', color: '#2E7D32', fontWeight: 700, fontSize: '0.65rem' }} />
          ) : sState === 'error' ? (
            <Typography variant="caption" color="error" sx={{ fontSize: '0.65rem' }}>Error</Typography>
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

  // ── Celda Pago/Inst compartida ──
  const renderPagoInst = (paid: boolean | undefined, hasInst: boolean | undefined, small = false) => (
    <TableCell align="center">
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
        <Tooltip title={paid ? 'Pago registrado' : 'Sin pago registrado'}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
            {paid ? <CheckCircleIcon sx={{ fontSize: small ? 14 : 16, color: '#2E7D32' }} /> : <RadioButtonUncheckedIcon sx={{ fontSize: small ? 14 : 16, color: '#BDBDBD' }} />}
            <Typography variant="caption" sx={{ color: paid ? '#2E7D32' : '#9E9E9E', fontSize: small ? '0.6rem' : '0.65rem', lineHeight: 1 }}>Pago</Typography>
          </Box>
        </Tooltip>
        <Tooltip title={hasInst ? 'Con instrucciones de envío' : 'Sin instrucciones'}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
            {hasInst ? <CheckCircleIcon sx={{ fontSize: small ? 14 : 16, color: '#1565C0' }} /> : <RadioButtonUncheckedIcon sx={{ fontSize: small ? 14 : 16, color: '#BDBDBD' }} />}
            <Typography variant="caption" sx={{ color: hasInst ? '#1565C0' : '#9E9E9E', fontSize: small ? '0.6rem' : '0.65rem', lineHeight: 1 }}>Inst.</Typography>
          </Box>
        </Tooltip>
      </Box>
    </TableCell>
  );

  // ── Fila genérica (no TDI master) ──
  const renderFlatRow = (r: PackageRow, i: number) => (
    <TableRow key={i} hover>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="body2" fontWeight={700} fontFamily="monospace">{r.guia || '—'}</Typography>
          {r.guia && <Tooltip title="Copiar"><IconButton size="small" onClick={() => navigator.clipboard.writeText(r.guia)}><ContentCopyIcon sx={{ fontSize: 13 }} /></IconButton></Tooltip>}
        </Box>
        {r.guia_corta && r.guia_corta !== r.guia && (
          <Typography variant="caption" color="text.secondary" fontFamily="monospace">{r.guia_corta}</Typography>
        )}
      </TableCell>
      {service !== 'maritimo' && (
        <TableCell>
          {r.guia_origen
            ? <>
                <Typography variant="caption" fontFamily="monospace" color="text.secondary" display="block">{r.guia_origen}</Typography>
                {r.guia_origen_carrier && <Typography variant="caption" sx={{ color: '#888', fontSize: '0.65rem' }}>{r.guia_origen_carrier}</Typography>}
              </>
            : <Typography variant="caption" color="text.disabled">—</Typography>}
        </TableCell>
      )}
      <TableCell>
        <Typography variant="body2" fontWeight={600}>{r.box_id || '—'}</Typography>
        {r.cliente_nombre && <Typography variant="caption" color="text.secondary" display="block">{r.cliente_nombre}</Typography>}
      </TableCell>
      {(service === 'tdi_aereo' || service === 'tdi_express' || service === 'pobox_usa' || service === 'dhl') && (
        <TableCell>
          {r.paqueteria
            ? <Typography variant="caption" fontWeight={600}>{r.paqueteria}</Typography>
            : <Typography variant="caption" color="text.disabled">—</Typography>}
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
      {renderPagoInst(r.costing_paid, r.has_instructions)}
      {renderExCells(r)}
      {service === 'pobox_usa' && (() => {
        const us = usGuias[r.guia];
        return (
          <TableCell>
            {us?.state === 'loading' ? (
              <CircularProgress size={12} sx={{ color: '#7B1FA2' }} />
            ) : us?.guia_unica ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" fontFamily="monospace" sx={{ fontSize: '0.7rem', color: '#7B1FA2', fontWeight: 600 }}>{us.guia_unica}</Typography>
                <Tooltip title="Copiar"><IconButton size="small" onClick={() => navigator.clipboard.writeText(us.guia_unica!)}><ContentCopyIcon sx={{ fontSize: 11 }} /></IconButton></Tooltip>
              </Box>
            ) : us?.state === 'error' ? (
              <Typography variant="caption" color="error" sx={{ fontSize: '0.65rem' }}>Error</Typography>
            ) : (
              <Typography variant="caption" color="text.disabled">—</Typography>
            )}
          </TableCell>
        );
      })()}
    </TableRow>
  );

  // ── Filas TDI Aéreo con grupos master/hijos ──
  const renderTdiRows = () => rows.map((r, i) => {
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
        {/* Fila master o standalone */}
        <TableRow
          hover
          sx={isMasterRow ? { bgcolor: '#EDE7F6', cursor: 'pointer', '& td': { borderBottom: isExpanded ? '1px solid #D1C4E9' : undefined } } : undefined}
          onClick={isMasterRow ? toggleExpand : undefined}
        >
          <TableCell>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {isMasterRow && (
                <IconButton size="small" onClick={e => { e.stopPropagation(); toggleExpand(); }} sx={{ p: 0.25 }}>
                  {isExpanded
                    ? <KeyboardArrowUpIcon sx={{ fontSize: 18, color: '#7B1FA2' }} />
                    : <KeyboardArrowDownIcon sx={{ fontSize: 18, color: '#7B1FA2' }} />}
                </IconButton>
              )}
              <Typography variant="body2" fontWeight={700} fontFamily="monospace" sx={{ fontSize: isMasterRow ? '0.88rem' : '0.82rem' }}>
                {r.guia || '—'}
              </Typography>
              {r.guia && (
                <Tooltip title="Copiar">
                  <IconButton size="small" onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(r.guia); }}>
                    <ContentCopyIcon sx={{ fontSize: 13 }} />
                  </IconButton>
                </Tooltip>
              )}
              {isMasterRow && (
                <Chip
                  label={`${children.length} piez.`}
                  size="small"
                  sx={{ fontSize: '0.62rem', bgcolor: '#7B1FA2', color: '#fff', fontWeight: 700, height: 18 }}
                />
              )}
            </Box>
            {r.guia_corta && r.guia_corta !== r.guia && (
              <Typography variant="caption" color="text.secondary" fontFamily="monospace">{r.guia_corta}</Typography>
            )}
          </TableCell>
          <TableCell>
            {r.guia_origen
              ? <Typography variant="caption" fontFamily="monospace" color="text.secondary">{r.guia_origen}</Typography>
              : <Typography variant="caption" color="text.disabled">—</Typography>}
          </TableCell>
          <TableCell>
            <Typography variant="body2" fontWeight={600}>{r.box_id || '—'}</Typography>
            {r.cliente_nombre && <Typography variant="caption" color="text.secondary" display="block">{r.cliente_nombre}</Typography>}
          </TableCell>
          <TableCell>
            {r.paqueteria ? <Typography variant="caption" fontWeight={600}>{r.paqueteria}</Typography>
                          : <Typography variant="caption" color="text.disabled">—</Typography>}
          </TableCell>
          <TableCell>
            {r.guia_salida
              ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" fontFamily="monospace">{r.guia_salida}</Typography>
                  <Tooltip title="Copiar">
                    <IconButton size="small" onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(r.guia_salida!); }}>
                      <ContentCopyIcon sx={{ fontSize: 11 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              : <Typography variant="caption" color="text.disabled">—</Typography>}
          </TableCell>
          <TableCell><Typography variant="caption">{fmt(r.received_at)}</Typography></TableCell>
          <TableCell><Typography variant="caption" color="text.secondary">{fmt(r.updated_at)}</Typography></TableCell>
          <TableCell>{statusChip(r.status)}</TableCell>
          {renderPagoInst(r.costing_paid, r.has_instructions)}
          {renderExCells(r)}
        </TableRow>

        {/* Filas hijas (visibles cuando master está expandido) */}
        {isMasterRow && children.map((child, ci) => (
          <TableRow
            key={`child-${ci}`}
            sx={{
              display: isExpanded ? undefined : 'none',
              bgcolor: '#FAFAFA',
              '& td': { borderBottom: '1px dashed #E0E0E0', py: '4px' },
            }}
          >
            <TableCell sx={{ pl: 5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" sx={{ color: '#BDBDBD', fontSize: '0.85rem' }}>↳</Typography>
                <Typography variant="body2" fontFamily="monospace" sx={{ color: '#555', fontSize: '0.78rem', fontWeight: 600 }}>
                  {child.guia}
                </Typography>
                <Tooltip title="Copiar">
                  <IconButton size="small" onClick={() => navigator.clipboard.writeText(child.guia)}>
                    <ContentCopyIcon sx={{ fontSize: 11 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </TableCell>
            {/* Guía origen y cliente se omiten — son los mismos del master */}
            <TableCell><Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>↑</Typography></TableCell>
            <TableCell><Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>↑</Typography></TableCell>
            <TableCell>
              {child.paqueteria
                ? <Typography variant="caption">{child.paqueteria}</Typography>
                : <Typography variant="caption" color="text.disabled">—</Typography>}
            </TableCell>
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
            {/* Pago/Inst heredado del master */}
            {renderPagoInst(r.costing_paid, r.has_instructions, true)}
            {/* Sin EntregaX/Sync en hijos individuales */}
            <TableCell colSpan={3} />
          </TableRow>
        ))}
      </Fragment>
    );
  });

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>
        📦 Inventario por Tipo de Servicio
      </Typography>

      {/* Selector de servicio */}
      <ToggleButtonGroup
        value={service}
        exclusive
        onChange={(_, v) => v && setService(v)}
        sx={{ mb: 2, flexWrap: 'wrap', gap: 0.5 }}
        size="small"
      >
        {SERVICES.map(s => (
          <ToggleButton key={s.key} value={s.key} sx={{ borderRadius: '20px !important', px: 2, '&.Mui-selected': { bgcolor: s.color, color: '#fff', '&:hover': { bgcolor: s.color } } }}>
            <span style={{ marginRight: 6 }}>{s.emoji}</span>{s.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {/* Filtros */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small" placeholder="Buscar guía, origen, cliente..." value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            sx={{ minWidth: 260 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <TextField size="small" label="Desde" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" label="Hasta" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }} />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Último Status</InputLabel>
            <Select
              label="Último Status"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <MenuItem value=""><em>Todos</em></MenuItem>
              {Object.entries(STATUS_LABELS).map(([key, meta]) => (
                <MenuItem key={key} value={key}>
                  <Chip label={meta.label} size="small" sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 600, fontSize: '0.7rem', cursor: 'pointer' }} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="contained" size="small" onClick={load} startIcon={<SearchIcon />} sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d44e22' } }}>
            Filtrar
          </Button>
          <Tooltip title="Recargar">
            <IconButton size="small" onClick={load}><RefreshIcon fontSize="small" /></IconButton>
          </Tooltip>
          {service === 'pobox_usa' && (() => {
            const pending = rows.filter(r => r.guia_origen && !r.guia_us_saved && !usGuias[r.guia]?.guia_unica).length;
            return (
              <Button
                variant="outlined" size="small"
                onClick={() => { if (usFetching) { usAbortRef.current = true; } else { fetchGuiaUS(); } }}
                startIcon={usFetching ? <CircularProgress size={14} /> : <LocalShippingIcon fontSize="small" />}
                sx={{ borderColor: '#7B1FA2', color: '#7B1FA2', '&:hover': { bgcolor: '#F3E5F5' }, whiteSpace: 'nowrap' }}
              >
                {usFetching ? `Guia US ${usProgress}%` : pending > 0 ? `Consultar Guia US (${pending} pendientes)` : 'Guia US ✓ al día'}
              </Button>
            );
          })()}
          <Button
            variant="outlined" size="small"
            onClick={() => { if (exFetching) { fetchAbortRef.current = true; } else { fetchEntregax(); } }}
            startIcon={exFetching ? <CircularProgress size={14} /> : <LocalShippingIcon fontSize="small" />}
            sx={{ borderColor: '#1565C0', color: '#1565C0', '&:hover': { bgcolor: '#E3F2FD' }, whiteSpace: 'nowrap' }}
          >
            {exFetching ? `EntregaX ${exProgress}%` : 'Consultar EntregaX'}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {loading ? 'Cargando…' : `${total.toLocaleString()} ${service === 'tdi_aereo' && !search ? 'envíos' : 'guías'}`}
          </Typography>
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

      {/* Tabla */}
      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>GUÍA</TableCell>
              {service !== 'maritimo' && (
                <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>{service === 'dhl' ? 'GUÍA HIJA' : 'GUÍA ORIGEN'}</TableCell>
              )}
              <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>CLIENTE</TableCell>
              {(service === 'tdi_aereo' || service === 'tdi_express' || service === 'pobox_usa' || service === 'dhl') && (
                <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>PAQUETERÍA</TableCell>
              )}
              {(service === 'tdi_aereo' || service === 'tdi_express' || service === 'pobox_usa' || service === 'dhl') && (
                <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>GUÍA SALIDA</TableCell>
              )}
              <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>FECHA INGRESO</TableCell>
              <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>ÚLTIMO MOVIMIENTO</TableCell>
              <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>ÚLTIMO STATUS</TableCell>
              <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }} align="center">PAGO / INST.</TableCell>
              <TableCell sx={{ bgcolor: '#1565C0', color: '#fff', fontWeight: 700 }} align="center">ENTREGAX</TableCell>
              <TableCell sx={{ bgcolor: '#1565C0', color: '#fff', fontWeight: 700 }}>STATUS ENTREGAX</TableCell>
              {service === 'pobox_usa' && <TableCell sx={{ bgcolor: '#1565C0', color: '#fff', fontWeight: 700 }}>GUÍA ORIGEN (EX)</TableCell>}
              {service === 'pobox_usa' && <TableCell sx={{ bgcolor: '#7B1FA2', color: '#fff', fontWeight: 700 }}>GUÍA US</TableCell>}
              <TableCell sx={{ bgcolor: '#2E7D32', color: '#fff', fontWeight: 700 }} align="center">SINC.</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={service === 'maritimo' ? 9 : 12} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={service === 'maritimo' ? 9 : 12} align="center" sx={{ py: 4, color: '#999' }}>Sin resultados</TableCell></TableRow>
            ) : service === 'tdi_aereo' ? (
              renderTdiRows()
            ) : (
              rows.map((r, i) => renderFlatRow(r, i))
            )}
          </TableBody>
        </Table>
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
      </Paper>
    </Box>
  );
}
