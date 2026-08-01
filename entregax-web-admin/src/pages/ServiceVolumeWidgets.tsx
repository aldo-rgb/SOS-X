import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Stack, ToggleButtonGroup, ToggleButton, CircularProgress,
} from '@mui/material';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import api from '../services/api';

const SERVICES = [
  { key: 'todos',       label: 'Toda la empresa', emoji: '🏢', color: '#F05A28' },
  { key: 'tdi_aereo',   label: 'TDI Aéreo',     emoji: '✈️',  color: '#1565C0' },
  { key: 'tdi_express', label: 'TDI Express',   emoji: '🚀',  color: '#7B1FA2' },
  { key: 'maritimo',    label: 'Marítimo China', emoji: '🚢',  color: '#00695C' },
  { key: 'pobox_usa',   label: 'PO Box USA',    emoji: '🇺🇸', color: '#BF360C' },
  { key: 'dhl',         label: 'DHL Monterrey', emoji: '📦',  color: '#F9A825' },
  { key: 'gex',         label: 'GEX',           emoji: '🛡️',  color: '#00838F' },
  { key: 'xpay',        label: 'X-Pay',         emoji: '💱',  color: '#5E35B1' },
];

const METRICS = [
  { key: 'money',  label: '💰 Dinero',  fmt: (v: number) => `$${v.toLocaleString('es-MX', { maximumFractionDigits: 0 })}` },
  { key: 'count',  label: '📄 Guías',   fmt: (v: number) => v.toLocaleString('es-MX') },
  { key: 'weight', label: '⚖️ Peso',    fmt: (v: number) => `${v.toLocaleString('es-MX', { maximumFractionDigits: 0 })} kg` },
  { key: 'volume', label: '📐 Volumen', fmt: (v: number) => `${v.toLocaleString('es-MX', { maximumFractionDigits: 2 })} m³` },
] as const;

const PERIODS = [
  { key: 'day',   label: 'Día' },
  { key: 'week',  label: 'Semana' },
  { key: 'month', label: 'Mes' },
];

type MetricKey = typeof METRICS[number]['key'];
interface Point { bucket: string; money: number; weight: number; volume: number; count: number }

const pad = (n: number) => String(n).padStart(2, '0');

export default function ServiceVolumeWidgets() {
  const [metric, setMetric] = useState<MetricKey>('money');
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState<Record<string, Point[]>>({});
  const [loading, setLoading] = useState(true);

  const dateFrom = useCallback(() => {
    const d = new Date();
    if (period === 'month') d.setMonth(d.getMonth() - 12);
    else if (period === 'week') d.setDate(d.getDate() - 84);
    else d.setDate(d.getDate() - 21);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, [period]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = dateFrom();
      const results = await Promise.all(SERVICES.map(s =>
        api.get('/packages/service-history-stats', { params: { service: s.key, group_by: period, date_from: from } })
          .then(r => [s.key, r.data.series || []] as [string, Point[]])
          .catch(() => [s.key, [] as Point[]] as [string, Point[]])
      ));
      setData(Object.fromEntries(results));
    } catch { setData({}); }
    finally { setLoading(false); }
  }, [period, dateFrom]);

  useEffect(() => { load(); }, [load]);

  // Inicio del periodo actual (para excluir el periodo en curso, parcial).
  const currentStart = useMemo(() => {
    const x = new Date();
    if (period === 'month') x.setDate(1);
    else if (period === 'week') { const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); }
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  }, [period]);

  const met = METRICS.find(m => m.key === metric)!;
  const periodWord = PERIODS.find(p => p.key === period)?.label.toLowerCase() || '';

  const goHistorial = (service: string) => {
    window.dispatchEvent(new CustomEvent('branch-manager-quick-nav', { detail: { action: 'service_history', service } }));
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <Box sx={{ width: 4, height: 18, bgcolor: '#F05A28', borderRadius: 1 }} />
        <Typography sx={{ fontWeight: 700, color: '#0F172A', fontSize: '0.9rem', letterSpacing: 0.2, textTransform: 'uppercase' }}>
          Volúmenes por Servicio
        </Typography>
      </Stack>

      {/* Toggles compartidos: cambian las 5 tarjetas a la vez */}
      <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', gap: 1.5 }} alignItems="center">
        <ToggleButtonGroup size="small" exclusive value={metric} onChange={(_, v) => v && setMetric(v)}>
          {METRICS.map(m => <ToggleButton key={m.key} value={m.key} sx={{ textTransform: 'none', fontWeight: 700 }}>{m.label}</ToggleButton>)}
        </ToggleButtonGroup>
        <ToggleButtonGroup size="small" exclusive value={period} onChange={(_, v) => v && setPeriod(v)}>
          {PERIODS.map(p => <ToggleButton key={p.key} value={p.key} sx={{ textTransform: 'none', fontWeight: 700 }}>{p.label}</ToggleButton>)}
        </ToggleButtonGroup>
        <Typography variant="caption" color="text.secondary">
          Muestra el último {periodWord}. Toca una tarjeta para ver el historial completo →
        </Typography>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
          {SERVICES.map(s => {
            const series = data[s.key] || [];
            const complete = series.length && series[series.length - 1].bucket === currentStart ? series.slice(0, -1) : series;
            const lastVal = complete.length ? (complete[complete.length - 1][metric] as number) : 0;
            const spark = series.map(p => ({ y: p[metric] as number }));
            return (
              <Paper
                key={s.key} elevation={0} onClick={() => goHistorial(s.key)}
                sx={{
                  p: 1.75, borderRadius: 2, border: '1px solid #E2E8F0', cursor: 'pointer',
                  transition: 'box-shadow .18s, transform .18s, border-color .18s',
                  '&:hover': { boxShadow: '0 6px 20px rgba(15,23,42,0.10)', transform: 'translateY(-2px)', borderColor: s.color },
                }}
              >
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
                  <Typography sx={{ fontSize: 16 }}>{s.emoji}</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569' }} noWrap>{s.label}</Typography>
                </Stack>
                <Typography sx={{ fontWeight: 800, fontSize: '1.25rem', color: s.color, lineHeight: 1.1 }} noWrap>
                  {met.fmt(lastVal)}
                </Typography>
                <Box sx={{ height: 44, mt: 0.5 }}>
                  {spark.length > 1 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={spark} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={s.color} stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="y" stroke={s.color} strokeWidth={2} fill={`url(#g-${s.key})`} isAnimationActive={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <Typography variant="caption" color="text.secondary">sin datos</Typography>
                  )}
                </Box>
                <Typography variant="caption" sx={{ color: '#94A3B8' }}>ver historial ›</Typography>
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
