import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Paper, TextField, Button, Avatar,
  CircularProgress, Chip, Tooltip, IconButton,
  FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import PeopleIcon from '@mui/icons-material/People';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import jsPDF from 'jspdf';

// Mismos labels/keys que el ledger "Comisiones Generadas".
const serviceLabels: Record<string, string> = {
  'pobox_usa_mx': '📦 PO Box USA',
  'aereo_china_mx': '✈️ Aéreo China',
  'maritimo_china_mx': '🚢 Marítimo',
  'nacional_mx': '🚚 Nacional',
  'liberacion_aa_dhl': '📮 DHL',
  'gex_warranty': '🛡️ GEX',
  'xpay': '💱 X-Pay',
};

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const ORANGE = '#F05A28';

const getToken = () => localStorage.getItem('token') || '';

interface AdvisorBoardRow {
  advisorId: number;
  advisorName: string;
  leaderName: string | null;
  leaderId: number | null;
  photoUrl: string | null;
  referralCode: string | null;
  totalCount: number;
  totalVolume: number;
  // Combinados (propia + override de subasesores)
  totalCommission: number;
  pendingCommission: number;
  paidCommission: number;
  // Desglose
  ownTotal: number;
  ownPending: number;
  // De lo pendiente, lo retenido hasta que el cliente pague, y lo que sí se
  // puede liquidar hoy. Ese último es el número que enseña el ledger.
  ownCreditHold?: number;
  ownCobrable?: number;
  ownPaid: number;
  overrideTotal: number;
  overridePending: number;
  overridePaid: number;
  subCount: number;
  pendingCount: number;
  paidCount: number;
  lastCommissionAt: string | null;
}

const fmt = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

const initials = (name: string) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('');

// Colores del podio (top 3)
const PODIUM = ['#FFD700', '#C0C0C0', '#CD7F32'];

/** El padre (CommissionsPage) recibe el click y salta al ledger ya filtrado. */
interface Props {
  onVerAsesor?: (advisorId: number, desde: string, hasta: string) => void;
}

export default function CommissionsBoardTab({ onVerAsesor }: Props = {}) {
  const { i18n } = useTranslation();
  const es = i18n.language === 'es';
  const [rows, setRows] = useState<AdvisorBoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [service, setService] = useState('');
  const [status, setStatus] = useState<'' | 'pending' | 'paid'>('');
  const [datePreset, setDatePreset] = useState('');

  // Presets de fecha (fecha local, no UTC). 'week' = semana comisiones vie→jue.
  const isoLocal = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const applyPreset = (key: string) => {
    const now = new Date();
    if (key === 'month') {
      setFromDate(isoLocal(new Date(now.getFullYear(), now.getMonth(), 1)));
      setToDate('');
    } else if (key === 'lastmonth') {
      setFromDate(isoLocal(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
      setToDate(isoLocal(new Date(now.getFullYear(), now.getMonth(), 0)));
    } else if (key === 'week') {
      const end = new Date(now);
      end.setDate(end.getDate() - ((end.getDay() - 4 + 7) % 7)); // último jueves ≤ hoy
      const start = new Date(end);
      start.setDate(start.getDate() - 6); // viernes anterior
      setFromDate(isoLocal(start));
      setToDate(isoLocal(end));
    }
    setDatePreset(key);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (service) params.service_type = service;
      const res = await axios.get(`${API_URL}/admin/commissions/by-advisor`, {
        headers: { Authorization: `Bearer ${getToken()}` },
        params,
      });
      const data: AdvisorBoardRow[] = (res.data || []).filter((r: AdvisorBoardRow) => r.advisorId != null);
      setRows(data);
    } catch (e) {
      console.error('Error loading board:', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, service]);

  useEffect(() => { load(); }, [load]);

  const hasFilter = Boolean(fromDate || toDate || service || status);

  // Métrica destacada según el estado seleccionado (pagado → pagada; resto → por pagar)
  const metric = (r: AdvisorBoardRow) => (status === 'paid' ? r.paidCommission : r.pendingCommission);
  const metricSort = (a: AdvisorBoardRow, b: AdvisorBoardRow) =>
    (metric(b) - metric(a)) || (b.totalCommission - a.totalCommission);

  // 1) Filtrar por estado.
  const filtered = rows.filter(r => {
    if (status === 'pending') return r.pendingCommission > 0;
    if (status === 'paid') return r.paidCommission > 0;
    return r.pendingCommission > 0 || r.totalCommission > 0;
  });

  // 2) Orden jerárquico: cada LÍDER seguido de sus subasesores (recursivo).
  const byId = new Map(filtered.map(r => [r.advisorId, r]));
  const subsByLeader = new Map<number, AdvisorBoardRow[]>();
  const topLevel: AdvisorBoardRow[] = [];
  for (const r of filtered) {
    if (r.leaderId && byId.has(r.leaderId)) {
      const arr = subsByLeader.get(r.leaderId) || [];
      arr.push(r);
      subsByLeader.set(r.leaderId, arr);
    } else {
      topLevel.push(r);
    }
  }
  const displayRows: AdvisorBoardRow[] = [];
  const subIds = new Set<number>();
  const visited = new Set<number>();
  const appendWithSubs = (leader: AdvisorBoardRow) => {
    if (visited.has(leader.advisorId)) return;
    visited.add(leader.advisorId);
    displayRows.push(leader);
    const subs = (subsByLeader.get(leader.advisorId) || []).slice().sort(metricSort);
    for (const s of subs) { subIds.add(s.advisorId); appendWithSubs(s); }
  };
  topLevel.slice().sort(metricSort).forEach(appendWithSubs);

  // Trofeos: top 3 por la métrica activa, sin importar la jerarquía.
  const top3 = filtered.slice().sort(metricSort).slice(0, 3).map(r => r.advisorId);
  const trophyRankById = new Map<number, number>(top3.map((id, i) => [id, i]));

  // Los totales suman SOLO la comisión propia de cada quien.
  //
  // `pendingCommission` de un líder ya trae dentro lo de sus subasesores, y esos
  // subasesores aparecen además con su propio renglón: sumar el campo completo
  // contaba ese dinero dos veces e inflaba el reporte. Con los datos del 27-ago
  // decía $77,190.53 cuando lo que sale de caja son $63,921.36.
  //
  // El líder sí recibe todo junto —él lo dispersa— pero eso es una entrega, no
  // dinero adicional: va por renglón, no en el gran total.
  const totalPending = displayRows.reduce((s, r) => s + r.ownPending, 0);
  const totalPaid = displayRows.reduce((s, r) => s + r.ownPaid, 0);
  const totalCommission = totalPending + totalPaid;
  // Lo retenido hasta que el cliente pague. Se separa para que "por pagar" no
  // se lea como dinero disponible: el ledger, que es donde se paga, solo
  // ofrece la parte cobrable.
  const totalCreditHold = displayRows.reduce((s, r) => s + (r.ownCreditHold || 0), 0);
  const totalCobrable = totalPending - totalCreditHold;
  const activeAdvisors = displayRows.length;

  // Formateador de moneda simple para el PDF (evita símbolos raros de locale).
  const money = (n: number) => '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const filterSummary = () => {
    const parts: string[] = [];
    if (fromDate || toDate) parts.push(`Fecha: ${fromDate || '—'} a ${toDate || '—'}`);
    if (service) parts.push(`Servicio: ${(serviceLabels[service] || service).replace(/^[^\s]+\s/, '')}`);
    if (status) parts.push(`Estado: ${status === 'paid' ? 'Pagado' : 'Pendiente'}`);
    return parts.length ? parts.join('   ·   ') : 'Todos los asesores activos (sin filtros)';
  };

  const downloadPdf = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const mL = 12;
    const now = new Date();
    const stamp = now.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

    // Encabezado
    doc.setFillColor(240, 90, 40);
    doc.rect(0, 0, pageW, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('EntregaX — Reporte de Comisiones', mL, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Generado: ${stamp}`, mL, 19);

    // Filtros aplicados
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.text(`Filtros: ${filterSummary()}`, mL, 34);

    // KPIs
    let y = 44;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(240, 90, 40);
    doc.text(`Comisión por pagar: ${money(totalPending)}`, mL, y);
    doc.setTextColor(46, 125, 50);
    doc.text(`Pagada: ${money(totalPaid)}`, mL + 70, y);
    doc.setTextColor(21, 101, 192);
    doc.text(`Total: ${money(totalCommission)}`, mL + 120, y);
    doc.setTextColor(60, 60, 60);
    doc.text(`Asesores: ${activeAdvisors}`, mL + 165, y);

    // Tabla — con desglose Propia / Subasesores (override)
    const payLabel = status === 'paid' ? 'Pagado' : 'Por pagar';
    const cols = [
      { key: 'rank',     label: '#',        w: 8,  align: 'left' as const },
      { key: 'name',     label: 'Asesor',   w: 46, align: 'left' as const },
      { key: 'leader',   label: 'Líder',    w: 30, align: 'left' as const },
      { key: 'own',      label: 'Propia',   w: 26, align: 'right' as const },
      // "Subs" se leía como comisión extra del líder. Es la de sus subasesores,
      // que él recibe para entregársela: dinero que ya está contado abajo, en el
      // renglón de cada sub.
      { key: 'override', label: 'A dispersar', w: 24, align: 'right' as const },
      { key: 'pay',      label: `Entrega (${payLabel.toLowerCase()})`, w: 28, align: 'right' as const },
      { key: 'count',    label: 'Guías',    w: 10, align: 'right' as const },
    ];

    const drawHeader = (yy: number) => {
      doc.setFillColor(30, 30, 30);
      doc.rect(mL, yy, pageW - mL * 2, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      let x = mL;
      cols.forEach(c => {
        const tx = c.align === 'right' ? x + c.w - 2 : x + 2;
        doc.text(c.label, tx, yy + 5.5, { align: c.align });
        x += c.w;
      });
      return yy + 8;
    };

    y = 52;
    y = drawHeader(y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);

    displayRows.forEach((r, idx) => {
      if (y > pageH - 14) {
        doc.addPage();
        y = 16;
        y = drawHeader(y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
      }
      if (idx % 2 === 0) {
        doc.setFillColor(245, 245, 245);
        doc.rect(mL, y, pageW - mL * 2, 7, 'F');
      }
      doc.setTextColor(40, 40, 40);
      const isSub = subIds.has(r.advisorId);
      const ownVal = status === 'paid' ? r.ownPaid : r.ownPending;
      const ovVal = status === 'paid' ? r.overridePaid : r.overridePending;
      const payVal = metric(r);
      const vals: Record<string, string> = {
        rank: String(idx + 1),
        name: (isSub ? '  ↳ ' : '') + (r.advisorName || `#${r.advisorId}`),
        leader: r.leaderName || '—',
        own: money(ownVal),
        override: r.subCount > 0 ? money(ovVal) : '—',
        pay: money(payVal),
        count: String(r.totalCount),
      };
      let x = mL;
      cols.forEach(c => {
        let txt = vals[c.key];
        if (c.key === 'name' && txt.length > 28) txt = txt.slice(0, 27) + '…';
        if (c.key === 'leader' && txt.length > 19) txt = txt.slice(0, 18) + '…';
        const tx = c.align === 'right' ? x + c.w - 2 : x + 2;
        doc.text(txt, tx, y + 5, { align: c.align });
        x += c.w;
      });
      y += 7;
    });

    // Fila de totales.
    //
    // La columna "Entrega" NO se totaliza: sumarla contaría dos veces lo de cada
    // subasesor —una en el renglón del líder y otra en el suyo—. El dinero que
    // sale de caja es la suma de la columna Propia, y esa es la que lleva total.
    if (y > pageH - 14) { doc.addPage(); y = 16; }
    const sumOwn = displayRows.reduce((s, r) => s + (status === 'paid' ? r.ownPaid : r.ownPending), 0);
    const sumOv = displayRows.reduce((s, r) => s + (status === 'paid' ? r.overridePaid : r.overridePending), 0);
    doc.setFillColor(255, 240, 232);
    doc.rect(mL, y, pageW - mL * 2, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(240, 90, 40);
    doc.text('TOTAL', mL + 2, y + 5.5);
    let xt = mL + cols[0].w + cols[1].w + cols[2].w;
    doc.text(money(sumOwn), xt + cols[3].w - 2, y + 5.5, { align: 'right' });
    xt += cols[3].w;
    doc.text(money(sumOv), xt + cols[4].w - 2, y + 5.5, { align: 'right' });
    xt += cols[4].w;
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text('(ya contado)', xt + cols[5].w - 2, y + 5.5, { align: 'right' });
    doc.setFontSize(8);
    doc.setTextColor(240, 90, 40);
    y += 12;

    // Nota al pie: sin esto, la primera pregunta de quien lo lee es por qué la
    // columna de entrega no cuadra con el total.
    if (sumOv > 0) {
      if (y > pageH - 20) { doc.addPage(); y = 16; }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(110, 110, 110);
      doc.text(
        'Entrega = comisión propia + la de sus subasesores, que el líder recibe para dispersar. Esa parte ya está',
        mL, y);
      doc.text(
        `contada en el renglón de cada subasesor, por eso el total de caja es ${money(sumOwn)} y no incluye la entrega.`,
        mL, y + 4);
    }

    const fname = `Reporte_Comisiones_${now.toISOString().slice(0, 10)}.pdf`;
    doc.save(fname);
  };

  return (
    <Box>
      {/* Filtros */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary' }}>
          {es ? '📅 Filtrar por fecha' : '📅 Filter by date'}
        </Typography>
        <TextField
          label={es ? 'Desde' : 'From'} type="date" size="small"
          value={fromDate} onChange={(e) => { setFromDate(e.target.value); setDatePreset(''); }}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label={es ? 'Hasta' : 'To'} type="date" size="small"
          value={toDate} onChange={(e) => { setToDate(e.target.value); setDatePreset(''); }}
          InputLabelProps={{ shrink: true }}
        />
        {/* Presets rápidos */}
        {[
          { key: 'month',     label: es ? 'Este mes' : 'This month' },
          { key: 'lastmonth', label: es ? 'Mes anterior' : 'Last month' },
          { key: 'week',      label: es ? 'Semana (vie–jue)' : 'Week (Fri–Thu)' },
        ].map(p => (
          <Button
            key={p.key} size="small"
            variant={datePreset === p.key ? 'contained' : 'outlined'}
            onClick={() => applyPreset(p.key)}
            sx={datePreset === p.key
              ? { background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)`, textTransform: 'none' }
              : { textTransform: 'none', color: 'text.secondary', borderColor: 'divider' }}
          >
            {p.label}
          </Button>
        ))}
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel>{es ? 'Servicio' : 'Service'}</InputLabel>
          <Select value={service} label={es ? 'Servicio' : 'Service'} onChange={(e) => setService(e.target.value)}>
            <MenuItem value="">{es ? 'Todos' : 'All'}</MenuItem>
            {Object.entries(serviceLabels).map(([k, v]) => (
              <MenuItem key={k} value={k}>{v}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>{es ? 'Estado' : 'Status'}</InputLabel>
          <Select value={status} label={es ? 'Estado' : 'Status'} onChange={(e) => setStatus(e.target.value as '' | 'pending' | 'paid')}>
            <MenuItem value="">{es ? 'Todos' : 'All'}</MenuItem>
            <MenuItem value="pending">{es ? '⏳ Pendiente' : '⏳ Pending'}</MenuItem>
            <MenuItem value="paid">{es ? '✅ Pagado' : '✅ Paid'}</MenuItem>
          </Select>
        </FormControl>
        {hasFilter && (
          <Button size="small" color="inherit" onClick={() => { setFromDate(''); setToDate(''); setService(''); setStatus(''); setDatePreset(''); }}>
            {es ? 'Limpiar' : 'Clear'}
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          startIcon={<PictureAsPdfIcon />}
          onClick={downloadPdf}
          disabled={loading || displayRows.length === 0}
          sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)`, textTransform: 'none', fontWeight: 700 }}
        >
          {es ? 'Descargar reporte' : 'Download report'}
        </Button>
        <Tooltip title={es ? 'Actualizar' : 'Refresh'}>
          <IconButton onClick={load} sx={{ bgcolor: 'grey.100' }}><RefreshIcon /></IconButton>
        </Tooltip>
      </Paper>

      {/* KPIs (grandes, para pantalla gigante) */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 4 }}>
        {[
          { label: es ? 'Por pagar (cobrable)' : 'Payable now', value: totalCobrable, color: ORANGE, main: true,
            nota: totalCreditHold > 0
              ? (es ? `+ ${fmt(totalCreditHold)} en crédito, aún no cobrable` : `+ ${fmt(totalCreditHold)} on credit`)
              : '' },
          { label: es ? 'Comisión pagada' : 'Paid commission', value: totalPaid, color: '#2e7d32' },
          { label: es ? 'Comisión total' : 'Total commission', value: totalCommission, color: '#1565c0' },
        ].map((kpi: any) => (
          <Paper key={kpi.label} sx={{
            flex: '1 1 260px', minWidth: 240, p: 3, borderRadius: 3,
            background: kpi.main ? `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` : '#fff',
            color: kpi.main ? '#fff' : 'inherit',
            border: kpi.main ? 'none' : '1px solid', borderColor: 'divider',
          }}>
            <Typography variant="subtitle2" sx={{ opacity: kpi.main ? 0.9 : 0.7, fontWeight: 600 }}>
              {kpi.label}
            </Typography>
            <Typography sx={{ fontWeight: 800, fontSize: { xs: 28, md: 40 }, lineHeight: 1.1, color: kpi.main ? '#fff' : kpi.color }}>
              {fmt(kpi.value)}
            </Typography>
            {!!kpi.nota && (
              <Typography variant="caption" sx={{ opacity: 0.9, display: 'block', mt: 0.5 }}>
                {kpi.nota}
              </Typography>
            )}
          </Paper>
        ))}
        <Paper sx={{ flex: '1 1 200px', minWidth: 180, p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PeopleIcon sx={{ color: 'text.secondary' }} />
            <Typography variant="subtitle2" sx={{ opacity: 0.7, fontWeight: 600 }}>
              {es ? 'Asesores' : 'Advisors'}
            </Typography>
          </Box>
          <Typography sx={{ fontWeight: 800, fontSize: { xs: 28, md: 40 }, lineHeight: 1.1 }}>
            {activeAdvisors}
          </Typography>
        </Paper>
      </Box>

      {/* Grid de asesores */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress sx={{ color: ORANGE }} />
        </Box>
      ) : displayRows.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
          <Typography color="text.secondary">
            {es ? 'No hay comisiones con los filtros seleccionados.' : 'No commissions with the selected filters.'}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr', xl: '1fr 1fr 1fr 1fr' },
          gap: 2.5,
        }}>
          {displayRows.map((r) => {
            const tRank = trophyRankById.get(r.advisorId);
            const isPodium = tRank !== undefined;
            const ring = isPodium ? PODIUM[tRank as number] : 'transparent';
            const isSub = subIds.has(r.advisorId);
            const hasSubs = r.subCount > 0;
            const ownMetric = status === 'paid' ? r.ownPaid : r.ownPending;
            const ovMetric = status === 'paid' ? r.overridePaid : r.overridePending;

            // Explicación al pasar el mouse. Los números de una tarjeta salen de
            // tres bolsas distintas y nadie tiene por qué adivinar la fórmula:
            // aquí se enseña de dónde sale cada uno y sobre qué fechas.
            const cobrable = r.ownCobrable != null ? r.ownCobrable : r.ownPending;
            const enCredito = r.ownCreditHold || 0;
            // Fechas en formato legible: "2026-08-21" no se lee de un vistazo.
            const dLarga = (iso: string) => {
              const [a, m, d] = iso.split('-').map(Number);
              if (!a || !m || !d) return iso;
              const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
              return `${d} ${MESES[m - 1]} ${a}`;
            };
            const periodo = (fromDate || toDate)
              ? `${fromDate ? dLarga(fromDate) : 'el inicio'} — ${toDate ? dLarga(toDate) : 'hoy'}`
              : (es ? 'TODO el histórico · no hay filtro de fechas puesto' : 'all time · no date filter');
            const Fila = ({ etq, val, nota, fuerte }: { etq: string; val: number; nota?: string; fuerte?: boolean }) => (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.3 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" sx={{ fontWeight: fuerte ? 800 : 600 }}>{etq}</Typography>
                  {nota && <Typography variant="caption" sx={{ display: 'block', opacity: 0.75, fontSize: 10.5 }}>{nota}</Typography>}
                </Box>
                <Typography variant="caption" sx={{ fontWeight: fuerte ? 800 : 700, whiteSpace: 'nowrap' }}>{fmt(val)}</Typography>
              </Box>
            );
            const explicacion = (
              <Box sx={{ p: 0.5, maxWidth: 340 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', mb: 0.5 }}>
                  De dónde sale cada número
                </Typography>
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.12)', borderRadius: 1, px: 1, py: 0.6, mb: 1 }}>
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 800 }}>
                    📅 Periodo: {periodo}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', opacity: 0.85, fontSize: 10.5 }}>
                    Se cuenta por fecha en que se generó la comisión, y solo si la orden de pago ya está pagada.
                  </Typography>
                </Box>
                <Fila etq="Propia (cobrable)" val={cobrable} nota="Su comisión, con el envío ya pagado por el cliente" />
                {enCredito > 0 && <Fila etq="+ En crédito" val={enCredito} nota="Su comisión, pero el cliente aún no paga su envío" />}
                {hasSubs && <Fila etq="+ A dispersar" val={ovMetric} nota={`Comisión de sus ${r.subCount} subasesor(es); él la recibe y la reparte`} />}
                <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.3)', mt: 0.5, pt: 0.5 }}>
                  <Fila etq={hasSubs ? '= Entrega total' : '= Por pagar'} val={metric(r)} fuerte
                    nota={`Lo que se le entrega por el periodo ${periodo}`} />
                </Box>
                <Box sx={{ mt: 1, pt: 0.5, borderTop: '1px solid rgba(255,255,255,0.3)' }}>
                  <Fila etq="Pagado" val={r.paidCommission} nota="Ya liquidado, suyo y de sus subasesores" />
                  <Fila etq="= Total" val={r.totalCommission} fuerte nota={`Entrega + pagado: todo lo generado en ${periodo}`} />
                </Box>
                <Typography variant="caption" sx={{ display: 'block', mt: 1, opacity: 0.8, fontSize: 10.5 }}>
                  {r.totalCount} guías. En el ledger, filtrando por este asesor, verás {fmt(cobrable)}:
                  ahí solo salen sus guías y lo que ya es cobrable.
                </Typography>
                {onVerAsesor && (
                  <Typography variant="caption" sx={{ display: 'block', mt: 1, fontWeight: 700, color: '#80cbc4' }}>
                    👆 Da click en la tarjeta para ver el detalle guía por guía
                  </Typography>
                )}
              </Box>
            );

            // Al costado, no arriba: encima de la tarjeta el desglose se salía
            // de la pantalla y se cortaba justo donde empieza. El popper voltea
            // solo al lado que tenga espacio.
            return (
              <Tooltip key={`tt-${r.advisorId}`} title={explicacion} arrow placement="right-start"
                slotProps={{
                  popper: {
                    modifiers: [
                      { name: 'flip', options: { fallbackPlacements: ['left-start', 'right', 'left'] } },
                      { name: 'preventOverflow', options: { padding: 12, altAxis: true } },
                    ],
                  },
                  tooltip: { sx: { bgcolor: '#263238', maxWidth: 360, p: 1.5 } },
                }}>
              <Paper key={r.advisorId} elevation={isPodium ? 6 : 1}
                onClick={onVerAsesor ? () => onVerAsesor(r.advisorId, fromDate, toDate) : undefined}
                sx={{
                p: 2.5, borderRadius: 3, position: 'relative', overflow: 'hidden',
                border: '2px solid', borderColor: isPodium ? ring : 'divider',
                borderLeft: isSub ? '6px solid' : (isPodium ? '2px solid' : '2px solid'),
                borderLeftColor: isSub ? '#b0bec5' : (isPodium ? ring : 'divider'),
                ml: isSub ? { xs: 0, sm: 2 } : 0,
                cursor: onVerAsesor ? 'pointer' : 'default',
                transition: 'transform .15s, box-shadow .15s',
                '&:hover': { transform: 'translateY(-3px)', boxShadow: onVerAsesor ? 6 : undefined },
              }}>
                {/* Badge esquina: trofeo (top 3) o # de subasesores */}
                {isPodium ? (
                  <Box sx={{
                    position: 'absolute', top: 12, right: 12,
                    width: 34, height: 34, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: ring, color: '#111',
                  }}>
                    <EmojiEventsIcon sx={{ fontSize: 20 }} />
                  </Box>
                ) : hasSubs ? (
                  <Chip size="small" label={`${r.subCount} ${es ? 'subs' : 'subs'}`}
                    sx={{ position: 'absolute', top: 12, right: 12, bgcolor: '#ECEFF1', fontWeight: 700 }} />
                ) : null}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Avatar
                    src={r.photoUrl || undefined}
                    sx={{
                      width: 72, height: 72, fontSize: 26, fontWeight: 700,
                      bgcolor: isSub ? '#78909c' : ORANGE,
                      border: '3px solid', borderColor: isPodium ? ring : 'grey.100',
                    }}
                  >
                    {initials(r.advisorName)}
                  </Avatar>
                  <Box sx={{ minWidth: 0, pr: 4 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2 }} noWrap title={r.advisorName}>
                      {isSub ? '↳ ' : ''}{r.advisorName || `#${r.advisorId}`}
                    </Typography>
                    {r.leaderName ? (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {es ? 'Líder: ' : 'Leader: '}{r.leaderName}
                      </Typography>
                    ) : hasSubs ? (
                      <Typography variant="caption" sx={{ color: '#546e7a', fontWeight: 600 }} noWrap>
                        {es ? `Líder de ${r.subCount} subasesor(es)` : `Leads ${r.subCount} sub-advisor(s)`}
                      </Typography>
                    ) : null}
                  </Box>
                </Box>

                {/* Monto destacado. En un líder es la ENTREGA: su comisión más
                    la de sus subasesores, que él dispersa. Llamarlo "comisión
                    por pagar" hacía creer que todo era suyo. */}
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  {hasSubs
                    ? (status === 'paid'
                        ? (es ? 'Entrega (pagada)' : 'Handover (paid)')
                        : (es ? 'Entrega: suya + de sus subasesores' : 'Handover: own + sub-advisors'))
                    : (status === 'paid'
                        ? (es ? 'Comisión pagada' : 'Paid commission')
                        : (es ? 'Comisión por pagar' : 'Pending commission'))}
                </Typography>
                <Typography sx={{ fontWeight: 800, fontSize: 32, lineHeight: 1.1, color: status === 'paid' ? '#2e7d32' : ORANGE, mb: 0.5 }}>
                  {fmt(metric(r))}
                </Typography>
                {/* El monto grande incluye lo que todavía no es cobrable. Decirlo
                    aquí evita que alguien lo tome como el cheque a firmar. */}
                {status !== 'paid' && (r.ownCreditHold || 0) > 0 && (
                  <Typography variant="caption" sx={{ display: 'block', color: '#546E7A', mb: 1 }}>
                    incluye {fmt(r.ownCreditHold || 0)} en crédito, aún no cobrable
                  </Typography>
                )}

                {/* Desglose propia / subasesores (solo si es líder con subs) */}
                {hasSubs && (
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                    {/* "Propia" enseña lo COBRABLE hoy, que es el mismo número
                        del ledger. Lo retenido va en su propio chip: sumados dan
                        lo que antes se mostraba junto y desconcertaba. */}
                    <Chip size="small"
                      label={`${es ? 'Propia' : 'Own'}: ${fmt(
                        status !== 'paid' && r.ownCobrable != null ? r.ownCobrable : ownMetric
                      )}`}
                      sx={{ bgcolor: '#FFF3E0', color: '#e65100', fontWeight: 700 }} />
                    {/* Lo retenido hasta que el cliente pague su envío. Iba
                        sumado dentro de "Propia" y por eso este panel no
                        cuadraba con el ledger, que sí lo separa. */}
                    {status !== 'paid' && (r.ownCreditHold || 0) > 0 && (
                      <Tooltip title="Comisión ya generada, pero el cliente todavía no paga su envío. No se puede liquidar hasta entonces.">
                        <Chip size="small" label={`${es ? 'En crédito' : 'On credit'}: ${fmt(r.ownCreditHold || 0)}`}
                          sx={{ bgcolor: '#ECEFF1', color: '#546E7A', fontWeight: 700 }} />
                      </Tooltip>
                    )}
                    <Chip size="small" label={`${es ? 'A dispersar' : 'To disperse'}: ${fmt(ovMetric)}`}
                      sx={{ bgcolor: '#EDE7F6', color: '#5e35b1', fontWeight: 700 }} />
                  </Box>
                )}

                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Chip size="small" label={`${es ? 'Total' : 'Total'}: ${fmt(r.totalCommission)}`} sx={{ bgcolor: '#e3f2fd', color: '#1565c0', fontWeight: 600 }} />
                  <Chip size="small" label={`${es ? 'Pagado' : 'Paid'}: ${fmt(r.paidCommission)}`} sx={{ bgcolor: '#e8f5e9', color: '#2e7d32', fontWeight: 600 }} />
                  <Chip size="small" variant="outlined" label={`${r.totalCount} ${es ? 'guías' : 'shipments'}`} />
                </Box>
              </Paper>
              </Tooltip>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
