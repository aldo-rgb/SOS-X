import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, TextField, Button, ToggleButtonGroup, ToggleButton,
  CircularProgress, Stack,
} from '@mui/material';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
} from 'recharts';
import api from '../services/api';
import PoboxHistoricoPage from './PoboxHistoricoPage';

// Mismos servicios que "Inventario por Tipo de Servicio". SOLO consulta (lectura).
const SERVICES = [
  { key: 'tdi_aereo',   label: 'TDI Aéreo',     emoji: '✈️',  color: '#1565C0' },
  { key: 'tdi_express', label: 'TDI Express',   emoji: '🚀',  color: '#7B1FA2' },
  { key: 'maritimo',    label: 'Marítimo China', emoji: '🚢',  color: '#00695C' },
  { key: 'pobox_usa',   label: 'PO Box USA',    emoji: '🇺🇸', color: '#BF360C' },
  { key: 'dhl',         label: 'DHL Monterrey', emoji: '📦',  color: '#F9A825' },
];

// Vistas seleccionables (métrica graficada).
const METRICS = [
  { key: 'money',  label: '💰 Dinero',   unit: 'MXN', fmt: (v: number) => `$${v.toLocaleString('es-MX', { maximumFractionDigits: 0 })}` },
  { key: 'count',  label: '📄 Guías',    unit: 'guías', fmt: (v: number) => v.toLocaleString('es-MX') },
  { key: 'weight', label: '⚖️ Peso',     unit: 'kg',  fmt: (v: number) => `${v.toLocaleString('es-MX', { maximumFractionDigits: 1 })} kg` },
  { key: 'volume', label: '📐 Volumen',  unit: 'm³',  fmt: (v: number) => `${v.toLocaleString('es-MX', { maximumFractionDigits: 3 })} m³` },
] as const;

type MetricKey = typeof METRICS[number]['key'];
interface Point { bucket: string; money: number; weight: number; volume: number; count: number }

const GROUPS = [
  { key: 'day',   label: 'Día' },
  { key: 'week',  label: 'Semana' },
  { key: 'month', label: 'Mes' },
];

// Notas de disponibilidad de datos por servicio/métrica.
const CAVEATS: Record<string, string> = {
  'tdi_aereo:volume': 'El volumen aéreo suele no capturarse (se cobra por peso); puede verse en ceros.',
  'tdi_express:volume': 'El volumen de TDI Express suele no capturarse; puede verse en ceros.',
  'pobox_usa:weight': 'PO Box cobra por volumen; el peso puede venir en ceros.',
};

export default function ServiceHistoryPage() {
  const [service, setService] = useState(() => {
    // Deep-link desde el dashboard: abre el servicio indicado.
    const s = localStorage.getItem('svc_history_service');
    if (s) localStorage.removeItem('svc_history_service');
    return s && SERVICES.some(x => x.key === s) ? s : 'tdi_aereo';
  });
  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [metric, setMetric] = useState<MetricKey>('money');
  const [groupBy, setGroupBy] = useState('week');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [series, setSeries] = useState<Point[]>([]);
  const [totals, setTotals] = useState<Point | null>(null);
  const [loading, setLoading] = useState(false);

  const svc = SERVICES.find(s => s.key === service)!;
  const met = METRICS.find(m => m.key === metric)!;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/packages/service-history-stats', {
        params: { service, group_by: groupBy, date_from: dateFrom || undefined, date_to: dateTo || undefined },
      });
      setSeries(r.data.series || []);
      setTotals(r.data.totals || null);
    } catch { setSeries([]); setTotals(null); }
    finally { setLoading(false); }
  }, [service, groupBy, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  // Formatear el eje X según agrupación.
  const fmtBucket = (b: string) => {
    const d = new Date(b + 'T00:00:00');
    if (groupBy === 'month') return d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' });
    if (groupBy === 'week') return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  };

  const chartData = useMemo(() => series.map(p => ({ x: fmtBucket(p.bucket), y: p[metric] as number })), [series, metric, groupBy]);

  // Inicio del periodo ACTUAL (según agrupación), en formato YYYY-MM-DD, para
  // detectar si el último bucket es un periodo aún en curso (parcial).
  const currentPeriodStart = (gb: string): string => {
    const x = new Date();
    if (gb === 'month') x.setDate(1);
    else if (gb === 'week') { const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); } // lunes
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };

  // ¿El último punto es el periodo en curso (mes/semana/día sin terminar)?
  const lastIsPartial = useMemo(
    () => series.length > 0 && series[series.length - 1].bucket === currentPeriodStart(groupBy),
    [series, groupBy]
  );

  // Tendencia: comparar los dos últimos periodos COMPLETOS (ignora el parcial en curso).
  const trend = useMemo(() => {
    const complete = lastIsPartial ? series.slice(0, -1) : series;
    if (complete.length < 2) return null;
    const last = complete[complete.length - 1][metric] as number;
    const prev = complete[complete.length - 2][metric] as number;
    if (prev === 0) return null;
    const pct = ((last - prev) / prev) * 100;
    return { up: pct >= 0, pct: Math.abs(pct) };
  }, [series, metric, lastIsPartial]);

  const periodWord = GROUPS.find(g => g.key === groupBy)?.label.toLowerCase() || 'periodo';
  const caveat = CAVEATS[`${service}:${metric}`];

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>📈 Historial por Servicio</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tendencia de volúmenes por tipo de servicio. Panel de solo consulta.
      </Typography>

      {/* Tabs de servicio */}
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
        {SERVICES.map(s => {
          const on = s.key === service;
          return (
            <Button
              key={s.key} variant={on ? 'contained' : 'outlined'} onClick={() => { setService(s.key); setHistoricoOpen(false); }}
              sx={{ fontWeight: 700, borderRadius: 5, textTransform: 'none',
                ...(on ? { bgcolor: s.color, '&:hover': { bgcolor: s.color } } : { borderColor: '#ddd', color: '#555' }) }}
            >
              {s.emoji} {s.label}
            </Button>
          );
        })}
      </Stack>

      {/* Botón Histórico: disponible para todos los servicios */}
      <Button
        variant={historicoOpen ? 'contained' : 'outlined'}
        onClick={() => setHistoricoOpen(o => !o)}
        sx={{ mb: 2, fontWeight: 700, textTransform: 'none',
          ...(historicoOpen ? { bgcolor: '#2E7D32', '&:hover': { bgcolor: '#1B5E20' } } : { borderColor: '#2E7D32', color: '#2E7D32' }) }}
      >
        📚 {historicoOpen ? 'Ver tendencia (inventario)' : 'Histórico (ventas por mes / año / vendedor)'}
      </Button>

      {historicoOpen ? (
        <PoboxHistoricoPage service={service} serviceLabel={svc.label} />
      ) : (
      <>
      {/* Filtros */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, border: '1px solid #eee' }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField type="date" label="Desde" size="small" InputLabelProps={{ shrink: true }}
            value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <TextField type="date" label="Hasta" size="small" InputLabelProps={{ shrink: true }}
            value={dateTo} onChange={e => setDateTo(e.target.value)} />
          <ToggleButtonGroup size="small" exclusive value={groupBy} onChange={(_, v) => v && setGroupBy(v)}>
            {GROUPS.map(g => <ToggleButton key={g.key} value={g.key} sx={{ textTransform: 'none', fontWeight: 700 }}>{g.label}</ToggleButton>)}
          </ToggleButtonGroup>
          <Button variant="outlined" size="small" onClick={() => { setDateFrom(''); setDateTo(''); }}>Limpiar fechas</Button>
        </Stack>
      </Paper>

      {/* Selector de métrica (4 vistas) */}
      <ToggleButtonGroup size="small" exclusive value={metric} onChange={(_, v) => v && setMetric(v)} sx={{ mb: 2, flexWrap: 'wrap' }}>
        {METRICS.map(m => <ToggleButton key={m.key} value={m.key} sx={{ textTransform: 'none', fontWeight: 700 }}>{m.label}</ToggleButton>)}
      </ToggleButtonGroup>

      {/* Resumen */}
      {totals && (
        <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', gap: 2 }}>
          <SummaryCard label={`Total ${met.label.replace(/^[^ ]+ /, '')}`} value={met.fmt(totals[metric] as number)} color={svc.color} />
          {trend && (
            <SummaryCard
              label={lastIsPartial ? `Último ${periodWord} cerrado vs anterior` : `Último ${periodWord} vs anterior`}
              value={`${trend.up ? '▲' : '▼'} ${trend.pct.toFixed(1)}%`}
              color={trend.up ? '#2E7D32' : '#C62828'}
            />
          )}
        </Stack>
      )}

      {/* Gráfica */}
      <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid #eee', minHeight: 380 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 340 }}><CircularProgress /></Box>
        ) : chartData.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 340, color: '#999' }}>
            <Typography>Sin datos para el periodo seleccionado.</Typography>
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradSvc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={svc.color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={svc.color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="x" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} width={70}
                tickFormatter={(v) => metric === 'money' ? `$${(v / 1000).toFixed(0)}k` : v.toLocaleString('es-MX', { maximumFractionDigits: 0 })} />
              <RTooltip formatter={(v: any) => [met.fmt(Number(v)), met.label.replace(/^[^ ]+ /, '')]} />
              <Area type="monotone" dataKey="y" stroke={svc.color} strokeWidth={2.5} fill="url(#gradSvc)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
        {lastIsPartial && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            ⏳ El último {periodWord} está en curso (parcial), por eso la última barra cae. No se usa en la comparación.
          </Typography>
        )}
        {caveat && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            ⚠️ {caveat}
          </Typography>
        )}
      </Paper>
      </>
      )}
    </Box>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Paper elevation={0} sx={{ px: 2.5, py: 1.5, borderRadius: 2, border: '1px solid #eee', minWidth: 180 }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.3 }}>{label}</Typography>
      <Typography sx={{ fontWeight: 800, fontSize: '1.5rem', color, lineHeight: 1.2 }}>{value}</Typography>
    </Paper>
  );
}
