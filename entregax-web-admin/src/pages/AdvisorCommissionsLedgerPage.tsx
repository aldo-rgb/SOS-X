// ============================================
// ADMIN: GESTIÓN DE COMISIONES DE ASESORES
// Permite ver todas las comisiones generadas,
// filtrar, y marcar como pagadas.
// ============================================

import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Chip, Button, CircularProgress,
  TextField, FormControl, InputLabel, Select, MenuItem, Alert, Snackbar,
  Checkbox, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  Card, CardContent, Avatar, IconButton,
} from '@mui/material';
import {
  AttachMoney as MoneyIcon,
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as PendingIcon,
  Refresh as RefreshIcon,
  Payment as PaymentIcon,
  Download as DownloadIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import api from '../services/api';

const ORANGE = '#F05A28';

const formatMXN = (amount: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const serviceLabels: Record<string, string> = {
  'pobox_usa_mx': '📦 PO Box USA',
  'aereo_china_mx': '✈️ Aéreo China',
  'maritimo_china_mx': '🚢 Marítimo',
  'nacional_mx': '🚚 Nacional',
  'liberacion_aa_dhl': '📮 DHL',
  'gex_warranty': '🛡️ GEX',
  'xpay': '💱 X-Pay',
};

interface CommissionRecord {
  id: number;
  advisorId: number;
  advisorName: string;
  leaderId: number | null;
  leaderName: string | null;
  shipmentType: string;
  serviceType: string;
  tracking: string;
  masterTracking: string | null;
  clientId: number;
  clientName: string;
  clientBox: string | null;
  paymentAmount: number;
  commissionRate: number;
  commissionAmount: number;
  leaderOverridePct: number;
  leaderOverrideAmount: number;
  gexCommission: number;
  status: string;
  awaitingClientPayment: boolean;
  clientCollectedAmount: number;
  clientPaidAt: string | null;
  paidAt: string | null;
  createdAt: string;
  paymentOrder: string | null;
  paymentOrderStatus: string | null;
}

/**
 * Override que el asesor filtrado GANA como líder de sus subasesores.
 * No sale de las filas de la tabla: esas traen el override que cada comisión
 * genera para el líder DE ESE asesor, que para un líder es siempre 0. Éste
 * viene calculado aparte por el backend con los mismos filtros.
 */
interface OverrideGanado {
  count: number;
  total: number;
  pendingTotal: number;
  paidTotal: number;
  creditHoldTotal: number;
  detalle: {
    id: number;
    subAdvisorName: string;
    serviceType: string;
    tracking: string | null;
    clientName: string | null;
    createdAt: string;
    status: string;
    awaitingClientPayment: boolean;
    commissionAmount: number;
    overridePct: number;
    overrideAmount: number;
  }[];
}

interface Summary {
  totalCount: number;
  totalCommission: number;
  pendingTotal: number;
  paidTotal: number;
  creditHoldTotal: number;
  totalLeaderOverride: number;
  advisorCount: number;
}

/** Filtro inicial al llegar desde una tarjeta del board de asesores. */
interface Props {
  focoAsesor?: { advisorId: number; desde: string; hasta: string; sello: number } | null;
}

export default function AdvisorCommissionsLedgerPage({ focoAsesor }: Props = {}) {
  // ─── State ───
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [overrideGanado, setOverrideGanado] = useState<OverrideGanado | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [paying, setPaying] = useState(false);
  const [payNotes, setPayNotes] = useState('');
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  // Vista: detalle (una fila por guía) o agrupada por Orden de Pago (compacta).
  const [groupByOrder, setGroupByOrder] = useState(false);

  // Lista de asesores para el filtro
  const [advisorsList, setAdvisorsList] = useState<{ id: number; full_name: string }[]>([]);

  // Filters
  const [filterAdvisor, setFilterAdvisor] = useState(focoAsesor ? String(focoAsesor.advisorId) : '');
  const [filterService, setFilterService] = useState('');
  // Llegando desde el board el interés es lo que falta por pagar, no el histórico.
  const [filterStatus, setFilterStatus] = useState(focoAsesor ? 'pending' : '');
  const [filterFrom, setFilterFrom] = useState(focoAsesor?.desde || '');
  const [filterTo, setFilterTo] = useState(focoAsesor?.hasta || '');
  const [filterClientBox, setFilterClientBox] = useState('');
  const [filterTracking, setFilterTracking] = useState('');

  // Al entrar desde el board (y en cada click nuevo) se re-aplica el filtro
  // con las mismas fechas que traía la tarjeta, para que los números cuadren.
  useEffect(() => {
    if (!focoAsesor) return;
    setFilterAdvisor(String(focoAsesor.advisorId));
    setFilterFrom(focoAsesor.desde || '');
    setFilterTo(focoAsesor.hasta || '');
    setFilterStatus('pending');
    setPage(0);
  }, [focoAsesor?.sello]);

  // ─── Fetch data ───
  const fetchLedger = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page + 1), limit: String(rowsPerPage) };
      if (filterAdvisor) params.advisor_id = filterAdvisor;
      if (filterService) params.service_type = filterService;
      if (filterStatus) params.status = filterStatus;
      if (filterFrom) params.from_date = filterFrom;
      if (filterTo) params.to_date = filterTo;
      if (filterClientBox) params.client_box = filterClientBox.trim();
      if (filterTracking) params.tracking = filterTracking.trim();

      const res = await api.get('/admin/commissions/ledger', { params });
      setRecords(res.data.data);
      setSummary(res.data.summary);
      setOverrideGanado(res.data.overrideGanado || null);
      setTotal(res.data.total);
    } catch (err) {
      console.error('Error fetching commission ledger:', err);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, filterAdvisor, filterService, filterStatus, filterFrom, filterTo, filterClientBox, filterTracking]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  // Cargar lista de asesores (una vez) para el filtro
  useEffect(() => {
    api.get('/admin/advisors', { params: { only_active_with_clients: 'true' } })
      .then(res => setAdvisorsList(Array.isArray(res.data) ? res.data : []))
      // Sin este log, un 403 dejaba el filtro con puras "Todos" y sin rastro:
      // parecía que no había asesores, no que faltara permiso.
      .catch(err => {
        console.error('[comisiones] no se pudo cargar la lista de asesores:', err?.response?.status || err?.message);
        setAdvisorsList([]);
      });
  }, []);

  // ─── Actions ───
  const handleMarkAsPaid = async () => {
    if (selectedIds.length === 0) return;
    setPaying(true);
    try {
      const res = await api.post('/admin/commissions/pay', {
        commission_ids: selectedIds,
        notes: payNotes || undefined,
      });
      setSnackbar({
        open: true,
        message: `✅ ${res.data.paidCount} comisiones pagadas por ${formatMXN(res.data.totalPaid)}`,
        severity: 'success',
      });
      setSelectedIds([]);
      setPayNotes('');
      setPayDialogOpen(false);
      fetchLedger();
    } catch {
      setSnackbar({ open: true, message: 'Error al marcar comisiones', severity: 'error' });
    } finally {
      setPaying(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const pendingIds = records.filter(r => r.status === 'pending' && !r.awaitingClientPayment).map(r => r.id);
    if (selectedIds.length === pendingIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pendingIds);
    }
  };

  const selectedTotal = records
    .filter(r => selectedIds.includes(r.id))
    .reduce((sum, r) => sum + r.commissionAmount, 0);

  /**
   * Descarga lo que está en pantalla —con los filtros aplicados, o solo lo
   * seleccionado si hay selección— como CSV que Excel abre bien.
   *
   * Se arma en el navegador y no en el servidor porque el reporte que piden es
   * exactamente lo que están viendo: si se generara aparte habría que repetir
   * los filtros y las dos cifras acabarían discrepando, que es justo el
   * problema que originó esta tarea.
   */
  const descargarReporte = () => {
    const filas = selectedIds.length > 0
      ? records.filter(r => selectedIds.includes(r.id))
      : records;
    if (filas.length === 0) return;
    const cols = [
      'Fecha', 'Asesor', 'Líder', 'Servicio', 'Tracking', 'Guía master', 'Cliente', 'Casillero',
      'Orden de pago', 'Monto cobrado', '% comisión', 'Comisión', 'Override que genera a su líder',
      'Estatus', 'Pagada el',
    ];
    // Excel arrastra el ruido del punto flotante (13809.359999999997 en el
    // reporte que llegó a Dirección). Se redondea a centavos al escribir.
    const r2 = (n: number) => Number((Number(n) || 0).toFixed(2));
    const fila = (v: any[]) => v.map(esc).join(';');
    // El punto y coma separa mejor en Excel en español, y las comillas dobles
    // se escapan para que un nombre con coma no rompa la columna.
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lineas = filas.map(r => [
      formatDate(r.createdAt), r.advisorName, r.leaderName || '',
      serviceLabels[r.serviceType] || r.serviceType || '', r.tracking || '', r.masterTracking || '',
      r.clientName || '', r.clientBox || '', r.paymentOrder || '',
      r.paymentAmount, r.commissionRate, r.commissionAmount, r.leaderOverrideAmount,
      r.awaitingClientPayment ? 'Esperando pago del cliente' : (r.status === 'paid' ? 'Pagada' : 'Pendiente'),
      r.paidAt ? formatDate(r.paidAt) : '',
    ].map(esc).join(';'));
    // La fila de totales iba corrida una columna: la etiqueta caía bajo
    // "Comisión" y el monto bajo "Override", que fue justo lo que hizo pensar
    // que el override valía 13,809. Ahora cada cosa cae en su columna.
    const total = filas.reduce((a, r) => a + r.commissionAmount, 0);
    lineas.push(fila([...Array(10).fill(''), 'TOTAL COMISIONES PROPIAS', r2(total), '', '', '']));

    // 💰 El override del asesor NO puede salir de estas filas: aquí el override
    // es el que cada comisión genera para el líder de quien la hizo, y para un
    // líder eso siempre es 0 (columna en ceros). Lo que él gana está en las
    // comisiones de sus subasesores, así que se anexa como bloque aparte para
    // que el reporte muestre el total real a pagar y no se preste a confusión.
    // El override va SIEMPRE que se esté filtrando por un asesor, haya o no
    // selección: no son filas de esta tabla —son comisiones de sus subasesores—
    // así que no se pueden palomear, pero sí se le pagan. Omitirlo cuando hay
    // selección era justo lo que dejaba el reporte sin el dato.
    const ov = overrideGanado;
    let totalAPagar = total;
    if (ov && ov.count > 0) {
      const nombre = advisorsList.find(a => a.id === Number(filterAdvisor))?.full_name || 'el asesor';
      lineas.push('');
      lineas.push(fila([`OVERRIDE QUE ${nombre.toUpperCase()} GANA COMO LÍDER DE SUS SUBASESORES`]));
      lineas.push(fila(['(No son comisiones suyas ni aparecen en la lista de arriba: son de sus subasesores. Se le pagan igual.)']));
      lineas.push(fila([
        'Fecha', 'Subasesor', 'Servicio', 'Tracking', 'Cliente',
        'Comisión del subasesor', '% override', 'Override a pagar', 'Estatus',
      ]));
      ov.detalle.forEach(d => {
        lineas.push(fila([
          formatDate(d.createdAt), d.subAdvisorName,
          serviceLabels[d.serviceType] || d.serviceType || '',
          d.tracking || '', d.clientName || '',
          r2(d.commissionAmount), d.overridePct, r2(d.overrideAmount),
          d.awaitingClientPayment ? 'Esperando pago del cliente' : (d.status === 'paid' ? 'Pagada' : 'Pendiente'),
        ]));
      });
      lineas.push(fila([...Array(6).fill(''), 'TOTAL OVERRIDE', r2(ov.pendingTotal), '']));
      totalAPagar = total + ov.pendingTotal;
      lineas.push('');
      lineas.push(fila([...Array(10).fill(''), 'TOTAL A PAGAR (comisiones + override)', r2(totalAPagar), '', '', '']));
    }
    // El BOM es lo que hace que Excel respete los acentos.
    const csv = '\uFEFF' + [cols.map(esc).join(';'), ...lineas].join('\r\n');
    const nombreAsesor = advisorsList.find(a => a.id === Number(filterAdvisor))?.full_name;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `comisiones${nombreAsesor ? '-' + nombreAsesor.replace(/\s+/g, '_') : ''}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Agrupado por Orden de Pago: una fila por orden, con las guías compactadas.
  // Las comisiones sin orden quedan como fila individual (clave única por id).
  const groupedRows = (() => {
    const groups = new Map<string, CommissionRecord[]>();
    for (const r of records) {
      const key = r.paymentOrder || `__single_${r.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    return Array.from(groups.entries()).map(([key, recs]) => {
      const first = recs[0];
      const services = new Set(recs.map(r => r.serviceType));
      const rates = new Set(recs.map(r => (r.gexCommission > 0 ? 'Fijo' : `${r.commissionRate}%`)));
      const paidCount = recs.filter(r => r.status === 'paid').length;
      const awaitingCount = recs.filter(r => r.awaitingClientPayment).length;
      const pendingIds = recs.filter(r => r.status === 'pending' && !r.awaitingClientPayment).map(r => r.id);
      const status = paidCount === recs.length ? 'paid'
        : paidCount > 0 ? 'partial'
        : (awaitingCount > 0 && awaitingCount + paidCount === recs.length) ? 'awaiting'
        : 'pending';
      return {
        key,
        paymentOrder: first.paymentOrder,
        paymentOrderStatus: first.paymentOrderStatus,
        advisorName: first.advisorName,
        clientBox: first.clientBox,
        serviceType: services.size === 1 ? first.serviceType : '',
        createdAt: recs.map(r => r.createdAt).sort().slice(-1)[0] || first.createdAt,
        count: recs.length,
        trackings: recs.map(r => r.tracking).filter(Boolean),
        montoBase: recs.reduce((s, r) => s + r.paymentAmount, 0),
        comision: recs.reduce((s, r) => s + r.commissionAmount, 0),
        rateLabel: rates.size === 1 ? [...rates][0] : 'Varias',
        status,
        pendingIds,
      };
    });
  })();

  const toggleSelectMany = (ids: number[], check: boolean) => {
    setSelectedIds(prev => check ? Array.from(new Set([...prev, ...ids])) : prev.filter(id => !ids.includes(id)));
  };

  // ─── Render ───
  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => fetchLedger()}
          size="small"
        >
          Actualizar
        </Button>
      </Box>

      {/* Summary KPIs */}
      {summary && (
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <Card sx={{ flex: 1, minWidth: 180 }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Avatar sx={{ bgcolor: '#fff3e0', color: ORANGE }}><PendingIcon /></Avatar>
              <Box>
                <Typography variant="caption" color="text.secondary">Pendiente</Typography>
                <Typography variant="h6" fontWeight={700} color="warning.main">{formatMXN(summary.pendingTotal)}</Typography>
              </Box>
            </CardContent>
          </Card>
          {/* El override solo se muestra si el asesor filtrado realmente lidera a
              alguien. Cuando no, estas dos tarjetas estorbarían con ceros. */}
          {overrideGanado && overrideGanado.count > 0 && (
            <>
              <Card sx={{ flex: 1, minWidth: 180 }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Avatar sx={{ bgcolor: '#ede7f6', color: '#673ab7' }}><MoneyIcon /></Avatar>
                  <Box>
                    <Tooltip title="Lo que este asesor gana como LÍDER sobre las ventas de sus subasesores. No aparece en la tabla de abajo porque esas comisiones son de los subasesores, no suyas.">
                      <Typography variant="caption" color="text.secondary">
                        Override por subasesores
                      </Typography>
                    </Tooltip>
                    <Typography variant="h6" fontWeight={700} sx={{ color: '#673ab7' }}>
                      {formatMXN(overrideGanado.pendingTotal)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {overrideGanado.count} partida{overrideGanado.count === 1 ? '' : 's'}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
              <Card sx={{ flex: 1, minWidth: 200, border: '2px solid #2e7d32' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Avatar sx={{ bgcolor: '#e8f5e9', color: '#2e7d32' }}><MoneyIcon /></Avatar>
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>
                      TOTAL A PAGAR
                    </Typography>
                    <Typography variant="h6" fontWeight={800} sx={{ color: '#2e7d32' }}>
                      {formatMXN(summary.pendingTotal + overrideGanado.pendingTotal)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      pendiente + override
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </>
          )}
          <Card sx={{ flex: 1, minWidth: 180 }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Avatar sx={{ bgcolor: '#e8f5e9', color: '#4caf50' }}><CheckCircleIcon /></Avatar>
              <Box>
                <Typography variant="caption" color="text.secondary">Pagado</Typography>
                <Typography variant="h6" fontWeight={700} color="success.main">{formatMXN(summary.paidTotal)}</Typography>
              </Box>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1, minWidth: 180 }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Avatar sx={{ bgcolor: '#eceff1', color: '#607d8b' }}><PendingIcon /></Avatar>
              <Box>
                <Tooltip title="Comisiones de órdenes pagadas con crédito. Se liberan (pasan a Pendiente) conforme el cliente abona su línea de crédito.">
                  <Typography variant="caption" color="text.secondary">En crédito (por cobrar)</Typography>
                </Tooltip>
                <Typography variant="h6" fontWeight={700} sx={{ color: '#607d8b' }}>{formatMXN(summary.creditHoldTotal ?? 0)}</Typography>
              </Box>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1, minWidth: 180 }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Avatar sx={{ bgcolor: '#e3f2fd', color: '#2196f3' }}><MoneyIcon /></Avatar>
              <Box>
                <Typography variant="caption" color="text.secondary">Total</Typography>
                <Typography variant="h6" fontWeight={700} color="info.main">{formatMXN(summary.totalCommission)}</Typography>
              </Box>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1, minWidth: 180 }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Avatar sx={{ bgcolor: '#f3e5f5', color: '#9c27b0' }}><MoneyIcon /></Avatar>
              <Box>
                <Typography variant="caption" color="text.secondary">Asesores</Typography>
                <Typography variant="h6" fontWeight={700}>{summary.advisorCount}</Typography>
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* ═══ DETALLE DE COMISIONES ═══ */}
      <>
          {/* Filters */}
          <Paper sx={{ p: 2, mb: 2, borderRadius: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Asesor</InputLabel>
              <Select value={filterAdvisor} label="Asesor" onChange={e => { setFilterAdvisor(e.target.value); setPage(0); }}>
                <MenuItem value="">Todos</MenuItem>
                {advisorsList.map(a => (
                  <MenuItem key={a.id} value={String(a.id)}>{a.full_name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Servicio</InputLabel>
              <Select value={filterService} label="Servicio" onChange={e => { setFilterService(e.target.value); setPage(0); }}>
                <MenuItem value="">Todos</MenuItem>
                {Object.entries(serviceLabels).map(([k, v]) => (
                  <MenuItem key={k} value={k}>{v}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Estado</InputLabel>
              <Select value={filterStatus} label="Estado" onChange={e => { setFilterStatus(e.target.value); setPage(0); }}>
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="pending">Pendiente (cobrable)</MenuItem>
                <MenuItem value="credit">En crédito</MenuItem>
                <MenuItem value="paid">Pagado</MenuItem>
              </Select>
            </FormControl>
            <TextField size="small" label="N° Cliente" placeholder="Ej. S889" value={filterClientBox}
              onChange={e => { setFilterClientBox(e.target.value); setPage(0); }}
              sx={{ width: 130 }} />
            <TextField size="small" label="Tracking" placeholder="Ej. US-9122945797" value={filterTracking}
              onChange={e => { setFilterTracking(e.target.value); setPage(0); }}
              sx={{ width: 170 }} />
            <TextField size="small" label="Desde" type="date" value={filterFrom}
              onChange={e => { setFilterFrom(e.target.value); setPage(0); }}
              slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 150 }} />
            <TextField size="small" label="Hasta" type="date" value={filterTo}
              onChange={e => { setFilterTo(e.target.value); setPage(0); }}
              slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 150 }} />
            <Button size="small" onClick={() => { setFilterAdvisor(''); setFilterService(''); setFilterStatus(''); setFilterFrom(''); setFilterTo(''); setFilterClientBox(''); setFilterTracking(''); setPage(0); }}>
              Limpiar
            </Button>
            {/* Baja lo que está en pantalla con los filtros puestos: si se
                generara aparte, el reporte y el panel podrían discrepar, que es
                justo el problema que originó esta tarea. */}
            <Button size="small" variant="outlined" startIcon={<DownloadIcon />}
              onClick={descargarReporte} disabled={records.length === 0}
              sx={{ ml: 'auto', borderColor: ORANGE, color: ORANGE }}>
              Descargar reporte ({records.length})
            </Button>
          </Paper>

          {/* Barra flotante de selección.
              `sticky` no bastaba: el que hace scroll no es la ventana sino el
              contenedor del panel, así que la barra se pegaba a un tope que
              también se iba hacia arriba y desaparecía igual. Con `fixed` queda
              anclada a la pantalla pase lo que pase. Va abajo y centrada para
              no taparse con el botón de Cajito, que vive en la esquina. */}
          {selectedIds.length > 0 && (
            <Paper elevation={8} sx={{
              p: 1.5, borderRadius: 999, bgcolor: '#fff3e0', display: 'flex',
              alignItems: 'center', gap: 2, flexWrap: 'wrap', justifyContent: 'center',
              position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
              zIndex: 1300, border: '2px solid #FFB877', px: 2.5,
              maxWidth: 'calc(100vw - 140px)',
            }}>
              <Typography variant="body2" fontWeight={600}>
                {selectedIds.length} seleccionadas ·{' '}
                <Box component="span" sx={{ fontSize: 17, fontWeight: 800, color: '#B34700' }}>
                  {formatMXN(selectedTotal)}
                </Box>
                {/* El override no es seleccionable —no son comisiones suyas, son de
                    sus subasesores— pero sí se le paga. Sin esto la barra decía
                    13,809 y se entendía como "esto es lo que le debo". */}
                {overrideGanado && overrideGanado.pendingTotal > 0 && (
                  <>
                    {' + override '}
                    <Box component="span" sx={{ fontWeight: 800, color: '#673ab7' }}>
                      {formatMXN(overrideGanado.pendingTotal)}
                    </Box>
                    {' = '}
                    <Box component="span" sx={{ fontSize: 17, fontWeight: 800, color: '#2e7d32' }}>
                      {formatMXN(selectedTotal + overrideGanado.pendingTotal)}
                    </Box>
                  </>
                )}
              </Typography>
              <Button size="small" startIcon={<DownloadIcon />} onClick={descargarReporte}
                sx={{ color: '#B34700' }}>
                Descargar selección
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<PaymentIcon />}
                onClick={() => setPayDialogOpen(true)}
                sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` }}
              >
                Marcar como Pagadas
              </Button>
              <Tooltip title="Quitar la selección">
                <IconButton size="small" onClick={() => setSelectedIds([])} sx={{ color: '#8A5B45' }}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Paper>
          )}
          {/* La barra flotante tapa el final de la tabla; este hueco deja ver
              siempre la última fila. */}
          {selectedIds.length > 0 && <Box sx={{ height: 88 }} />}

          {/* Toggle de vista: detalle vs agrupado por Orden de Pago */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Button
              size="small"
              variant={!groupByOrder ? 'contained' : 'outlined'}
              onClick={() => setGroupByOrder(false)}
              sx={!groupByOrder ? { bgcolor: ORANGE, '&:hover': { bgcolor: '#e05a1a' } } : { color: ORANGE, borderColor: ORANGE }}
            >
              Detalle por guía
            </Button>
            <Button
              size="small"
              variant={groupByOrder ? 'contained' : 'outlined'}
              onClick={() => setGroupByOrder(true)}
              sx={groupByOrder ? { bgcolor: ORANGE, '&:hover': { bgcolor: '#e05a1a' } } : { color: ORANGE, borderColor: ORANGE }}
            >
              📦 Por Orden de Pago
            </Button>
            {groupByOrder && (
              <Typography variant="caption" color="text.secondary">
                {groupedRows.length} orden{groupedRows.length === 1 ? '' : 'es'} · guías compactadas
              </Typography>
            )}
          </Box>

          {/* Table */}
          <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
            ) : (
              <>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            indeterminate={selectedIds.length > 0 && selectedIds.length < records.filter(r => r.status === 'pending' && !r.awaitingClientPayment).length}
                            checked={records.filter(r => r.status === 'pending' && !r.awaitingClientPayment).length > 0 && selectedIds.length === records.filter(r => r.status === 'pending' && !r.awaitingClientPayment).length}
                            onChange={toggleSelectAll}
                            size="small"
                          />
                        </TableCell>
                        <TableCell><strong>Fecha</strong></TableCell>
                        <TableCell><strong>Asesor</strong></TableCell>
                        <TableCell><strong>Servicio</strong></TableCell>
                        <TableCell><strong>Tracking</strong></TableCell>
                        <TableCell><strong>Orden de Pago</strong></TableCell>
                        <TableCell align="center"><strong>Status Orden</strong></TableCell>
                        <TableCell><strong>Cliente</strong></TableCell>
                        <TableCell align="right"><strong>Monto Base</strong></TableCell>
                        <TableCell align="right"><strong>Tasa</strong></TableCell>
                        <TableCell align="right"><strong>Comisión</strong></TableCell>
                        <TableCell align="center"><strong>Estado</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {records.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={12} align="center">
                            <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                              Sin comisiones en este período
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : groupByOrder ? (
                        groupedRows.map(g => {
                          const allSel = g.pendingIds.length > 0 && g.pendingIds.every(id => selectedIds.includes(id));
                          const someSel = g.pendingIds.some(id => selectedIds.includes(id));
                          return (
                          <TableRow key={g.key} hover>
                            <TableCell padding="checkbox">
                              {g.pendingIds.length > 0 && (
                                <Checkbox size="small" checked={allSel} indeterminate={!allSel && someSel}
                                  onChange={(e) => toggleSelectMany(g.pendingIds, e.target.checked)} />
                              )}
                            </TableCell>
                            <TableCell><Typography variant="caption">{formatDate(g.createdAt)}</Typography></TableCell>
                            <TableCell><Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 120 }}>{g.advisorName}</Typography></TableCell>
                            <TableCell><Typography variant="body2">{g.serviceType ? (serviceLabels[g.serviceType] || g.serviceType) : 'Varios'}</Typography></TableCell>
                            <TableCell>
                              <Tooltip title={g.trackings.join(', ') || '—'}>
                                <Chip label={`${g.count} guía${g.count === 1 ? '' : 's'}`} size="small"
                                  sx={{ fontWeight: 700, bgcolor: 'rgba(0,0,0,0.06)' }} />
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              {g.paymentOrder ? (
                                <Chip label={g.paymentOrder} size="small" variant="outlined"
                                  sx={{ fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 600, borderColor: ORANGE, color: ORANGE }} />
                              ) : <Typography variant="caption" color="text.secondary">Sin orden</Typography>}
                            </TableCell>
                            <TableCell align="center">
                              {(() => {
                                const st = String(g.paymentOrderStatus || '').toLowerCase();
                                if (!st) return <Typography variant="caption" color="text.secondary">—</Typography>;
                                const map: Record<string, { label: string; color: any }> = {
                                  completed: { label: 'Pagado', color: 'success' }, paid: { label: 'Pagado', color: 'success' },
                                  cancelled: { label: 'Cancelada', color: 'error' }, expired: { label: 'Expirada', color: 'error' },
                                  pending_payment: { label: 'Pendiente', color: 'warning' }, pending: { label: 'Pendiente', color: 'warning' },
                                  vouchers_submitted: { label: 'Procesando', color: 'info' }, vouchers_partial: { label: 'Procesando', color: 'info' },
                                  completado: { label: 'Completada', color: 'success' }, en_proceso: { label: 'Pendiente', color: 'warning' },
                                  esperando_comprobante: { label: 'Pendiente', color: 'warning' }, cancelado: { label: 'Cancelada', color: 'error' },
                                  error_envio: { label: 'Error', color: 'error' }, active: { label: 'Pagada', color: 'success' },
                                  generated: { label: 'Pendiente', color: 'warning' },
                                };
                                const c = map[st] || { label: g.paymentOrderStatus as string, color: 'default' };
                                return <Chip label={c.label} size="small" color={c.color} variant={c.color === 'success' ? 'filled' : 'outlined'} sx={{ fontSize: '0.7rem' }} />;
                              })()}
                            </TableCell>
                            <TableCell><Typography variant="body2" fontWeight={700} sx={{ fontFamily: 'monospace' }}>{g.clientBox || '—'}</Typography></TableCell>
                            <TableCell align="right">{formatMXN(g.montoBase)}</TableCell>
                            <TableCell align="right"><Typography variant="caption" color="text.secondary">{g.rateLabel}</Typography></TableCell>
                            <TableCell align="right"><Typography fontWeight={700} color="info.main">{formatMXN(g.comision)}</Typography></TableCell>
                            <TableCell align="center">
                              {g.status === 'paid' ? <Chip label="Pagado" size="small" color="success" variant="filled" sx={{ fontSize: '0.7rem' }} />
                                : g.status === 'partial' ? <Chip label="Parcial" size="small" color="info" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                : g.status === 'awaiting' ? <Chip label="En crédito" size="small" color="default" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                : <Chip label="Pendiente" size="small" color="warning" variant="filled" sx={{ fontSize: '0.7rem' }} />}
                            </TableCell>
                          </TableRow>
                          );
                        })
                      ) : (
                        records.map(r => (
                          <TableRow key={r.id} hover selected={selectedIds.includes(r.id)}>
                            <TableCell padding="checkbox">
                              {r.status === 'pending' && !r.awaitingClientPayment && (
                                <Checkbox
                                  checked={selectedIds.includes(r.id)}
                                  onChange={() => toggleSelect(r.id)}
                                  size="small"
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption">{formatDate(r.createdAt)}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 120 }}>
                                {r.advisorName}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Tooltip title={r.serviceType}>
                                <Typography variant="body2">{serviceLabels[r.serviceType] || r.serviceType}</Typography>
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              <Box>
                                <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block' }}>{r.tracking || '—'}</Typography>
                                {/* La comisión va por guía hija —una línea por
                                    cada una—, pero quien revisa busca por la
                                    guía de 10 dígitos que se le dio al cliente. */}
                                {r.masterTracking && (
                                  <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block', fontSize: 10, color: 'text.secondary' }}>
                                    master {r.masterTracking}
                                  </Typography>
                                )}
                              </Box>
                            </TableCell>
                            <TableCell>
                              {r.paymentOrder ? (
                                <Chip label={r.paymentOrder} size="small" variant="outlined"
                                  sx={{ fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 600, borderColor: ORANGE, color: ORANGE }} />
                              ) : (
                                <Typography variant="caption" color="text.secondary">—</Typography>
                              )}
                            </TableCell>
                            <TableCell align="center">
                              {(() => {
                                const st = String(r.paymentOrderStatus || '').toLowerCase();
                                if (!st) return <Typography variant="caption" color="text.secondary">—</Typography>;
                                const map: Record<string, { label: string; color: any }> = {
                                  completed: { label: 'Pagado', color: 'success' },
                                  paid: { label: 'Pagado', color: 'success' },
                                  cancelled: { label: 'Cancelada', color: 'error' },
                                  expired: { label: 'Expirada', color: 'error' },
                                  pending_payment: { label: 'Pendiente', color: 'warning' },
                                  pending: { label: 'Pendiente', color: 'warning' },
                                  vouchers_submitted: { label: 'Procesando', color: 'info' },
                                  vouchers_partial: { label: 'Procesando', color: 'info' },
                                  // X-Pay (entangled_payment_requests.estatus_global)
                                  completado: { label: 'Completada', color: 'success' },
                                  en_proceso: { label: 'Pendiente', color: 'warning' },
                                  esperando_comprobante: { label: 'Pendiente', color: 'warning' },
                                  cancelado: { label: 'Cancelada', color: 'error' },
                                  error_envio: { label: 'Error', color: 'error' },
                                  // GEX (warranties.status)
                                  active: { label: 'Pagada', color: 'success' },
                                  generated: { label: 'Pendiente', color: 'warning' },
                                };
                                const c = map[st] || { label: r.paymentOrderStatus as string, color: 'default' };
                                return <Chip label={c.label} size="small" color={c.color} variant={c.color === 'success' ? 'filled' : 'outlined'} sx={{ fontSize: '0.7rem' }} />;
                              })()}
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight={700} sx={{ fontFamily: 'monospace' }}>{r.clientBox || '—'}</Typography>
                            </TableCell>
                            <TableCell align="right">{formatMXN(r.paymentAmount)}</TableCell>
                            <TableCell align="right">
                              <Typography variant="caption" color="text.secondary">
                                {r.gexCommission > 0 ? 'Fijo' : `${r.commissionRate}%`}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography fontWeight={600} color="info.main">{formatMXN(r.commissionAmount)}</Typography>
                            </TableCell>
                            <TableCell align="center">
                              {r.status === 'paid' ? (
                                <Tooltip title={`Pagado ${formatDate(r.paidAt)}`}>
                                  <Chip label="Pagado" size="small" color="success" variant="filled" sx={{ fontSize: '0.7rem' }} />
                                </Tooltip>
                              ) : r.awaitingClientPayment ? (
                                <Tooltip title={`Orden pagada con crédito. La comisión se libera cuando el cliente abone${r.clientCollectedAmount > 0 ? ` (cobrado ${formatMXN(r.clientCollectedAmount)} de ${formatMXN(r.paymentAmount)})` : ''}.`}>
                                  <Chip label="En crédito" size="small" color="default" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                </Tooltip>
                              ) : (
                                <Chip label="Pendiente" size="small" color="warning" variant="filled" sx={{ fontSize: '0.7rem' }} />
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={total}
                  page={page}
                  onPageChange={(_, p) => setPage(p)}
                  rowsPerPage={rowsPerPage}
                  rowsPerPageOptions={[50, 100]}
                  onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                  labelRowsPerPage="Por página"
                  labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
                />
              </>
            )}
          </Paper>
      </>

      {/* Pay Dialog */}
      <Dialog open={payDialogOpen} onClose={() => setPayDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>💰 Confirmar Pago de Comisiones</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Vas a marcar <strong>{selectedIds.length}</strong> comisiones como pagadas
            por un total de <strong>{formatMXN(selectedTotal)}</strong>.
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={2}
            label="Notas de pago (opcional)"
            value={payNotes}
            onChange={e => setPayNotes(e.target.value)}
            placeholder="Ej: Transferencia SPEI #12345, Efectivo en sucursal, etc."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleMarkAsPaid}
            disabled={paying}
            startIcon={paying ? <CircularProgress size={16} color="inherit" /> : <PaymentIcon />}
            sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` }}
          >
            Confirmar Pago
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
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
