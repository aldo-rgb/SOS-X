import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, Stack, ToggleButtonGroup, ToggleButton,
  FormControl, InputLabel, Select, MenuItem, Table, TableHead, TableRow, TableCell,
  TableBody, TableContainer, Chip, CircularProgress,
} from '@mui/material';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
} from 'recharts';
import * as XLSX from 'xlsx';
import api from '../services/api';

const GREEN = '#2E7D32';
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Ajustes de transición al sistema nuevo (solo PO Box). Clave "AÑO-MESindex" (0-based).
// Junio 2026: los pagos RO- que entraron en el sistema nuevo desde el 22-jun
// (lo que le faltaba al Excel, que solo trae el sistema viejo).
const POBOX_EXTRA: Record<string, number> = {
  '2026-5': 569759.65,
};

interface Rec { asesor: string; anio: number; mes: number; monto: number }

const toNum = (v: any): number => {
  if (typeof v === 'number') return v;
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
};
const money = (v: number) => `$${v.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;

// Parsea el formato matriz (Asesor | Año | Ene..Dic | Total) a registros largos.
function parseMatrix(json: Record<string, any>[]): { records: Rec[]; error?: string } {
  if (!json.length) return { records: [], error: 'El archivo está vacío.' };
  const keys = Object.keys(json[0]);
  const kAsesor = keys.find(k => /asesor|vendedor/i.test(k)) || keys[0];
  const kAnio = keys.find(k => /a[ñn]o/i.test(k)) || keys[1];
  const monthKeys = MESES.map(m => keys.find(k => k.trim().toLowerCase().startsWith(m.toLowerCase())) || '');
  if (monthKeys.every(k => !k)) return { records: [], error: 'No encontré columnas de meses (Ene..Dic). Revisa el formato del reporte.' };
  const out: Rec[] = [];
  let cur = '';
  for (const row of json) {
    const rawA = String(row[kAsesor] ?? '').trim();
    if (rawA) cur = rawA.replace(/\s*\(total.*$/i, '').trim();
    if (!cur || /^total general$/i.test(cur)) continue;
    const anio = parseInt(String(row[kAnio] ?? '').replace(/\D/g, ''), 10);
    if (!anio) continue;
    monthKeys.forEach((mk, mi) => {
      if (!mk) return;
      const monto = toNum(row[mk]);
      if (monto) out.push({ asesor: cur, anio, mes: mi, monto });
    });
  }
  return { records: out, error: out.length ? undefined : 'No se encontraron montos.' };
}

export default function ServicioHistoricoPanel({ service, serviceLabel }: { service: string; serviceLabel: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [recs, setRecs] = useState<Rec[]>([]);
  const [groupBy, setGroupBy] = useState<'mes' | 'anio' | 'vendedor'>('mes');
  const [fYear, setFYear] = useState<string>('');
  const [fAsesor, setFAsesor] = useState<string>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string>('');
  // Dinero real de NUESTRO sistema por mes (clave "anio-mes"), para fusionar con el Excel.
  const [sysMonthly, setSysMonthly] = useState<Record<string, number>>({});

  // Cargar el histórico GUARDADO de este servicio al abrir / cambiar de servicio.
  const loadStored = useCallback(async () => {
    setLoading(true); setError('');
    try {
      // 1) Excel guardado (histórico viejo)
      const r = await api.get(`/svc-historico/${service}`);
      if (r.data?.exists) {
        setRecs(r.data.records || []);
        setFileName(r.data.file_name || '');
        setSavedAt(r.data.uploaded_at || '');
      } else {
        setRecs([]); setFileName(''); setSavedAt('');
      }
      // 2) Dinero real de NUESTRO sistema por mes (para julio en adelante, etc.)
      try {
        const sr = await api.get('/packages/service-history-stats', { params: { service, group_by: 'month', date_from: '2018-01-01' } });
        const map: Record<string, number> = {};
        (sr.data?.series || []).forEach((b: any) => {
          const d = new Date(String(b.bucket) + 'T00:00:00');
          map[`${d.getFullYear()}-${d.getMonth()}`] = Number(b.money) || 0;
        });
        setSysMonthly(map);
      } catch { setSysMonthly({}); }
      setFYear(''); setFAsesor('');
    } catch { setRecs([]); setFileName(''); setSavedAt(''); setSysMonthly({}); }
    finally { setLoading(false); }
  }, [service]);

  useEffect(() => { loadStored(); }, [loadStored]);

  const onFile = async (file: File) => {
    setError('');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets['INST'] || wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
      const { records, error: perr } = parseMatrix(json);
      if (perr) { setError(perr); return; }
      setRecs(records); setFileName(file.name); setFYear(''); setFAsesor('');
      // Persistir en el backend (queda como histórico del servicio).
      setSaving(true);
      try {
        await api.post(`/svc-historico/${service}`, { file_name: file.name, records });
        setSavedAt(new Date().toISOString());
      } catch { setError('Se analizó, pero no se pudo guardar en el servidor.'); }
      finally { setSaving(false); }
    } catch (e: any) {
      setError('No se pudo leer el archivo: ' + (e?.message || ''));
    }
  };

  const removeStored = async () => {
    try { await api.delete(`/svc-historico/${service}`); } catch { /* */ }
    setRecs([]); setFileName(''); setSavedAt('');
  };

  const years = useMemo(() => Array.from(new Set(recs.map(r => r.anio))).sort((a, b) => b - a), [recs]);
  const asesores = useMemo(() => Array.from(new Set(recs.map(r => r.asesor))).sort(), [recs]);

  const filtered = useMemo(() => recs.filter(r =>
    (!fYear || String(r.anio) === fYear) && (!fAsesor || r.asesor === fAsesor)
  ), [recs, fYear, fAsesor]);

  // Montos del SISTEMA NUEVO a sumar por mes (solo PO Box). No aplica al filtrar
  // por vendedor (el dinero del sistema no viene desglosado por asesor).
  // Julio 2026: lo registrado en el sistema. Junio 2026: pagos RO- desde el 22.
  const extraByKey = useMemo(() => {
    const out: Record<string, number> = {};
    if (service !== 'pobox_usa' || fAsesor) return out;
    const july = Number(sysMonthly['2026-6']) || 0;
    if (july) out['2026-6'] = july;
    Object.assign(out, POBOX_EXTRA);
    if (fYear) Object.keys(out).forEach(k => { if (k.split('-')[0] !== fYear) delete out[k]; });
    return out;
  }, [service, fAsesor, fYear, sysMonthly]);

  const agg = useMemo(() => {
    const map = new Map<string, { key: string; sort: number; monto: number }>();
    filtered.forEach(r => {
      let key = '', sort = 0;
      if (groupBy === 'mes') { key = `${MESES[r.mes]} ${String(r.anio).slice(2)}`; sort = r.anio * 100 + r.mes; }
      else if (groupBy === 'anio') { key = String(r.anio); sort = r.anio; }
      else { key = r.asesor; sort = 0; }
      const cur = map.get(key) || { key, sort, monto: 0 };
      cur.monto += r.monto;
      map.set(key, cur);
    });
    // Sumar los montos del sistema nuevo (solo PO Box) a su mes/año.
    if (groupBy === 'mes' || groupBy === 'anio') {
      Object.entries(extraByKey).forEach(([k, money]) => {
        const [yStr, mStr] = k.split('-');
        const y = parseInt(yStr, 10), m = parseInt(mStr, 10);
        const key = groupBy === 'mes' ? `${MESES[m]} ${String(y).slice(2)}` : String(y);
        const sort = groupBy === 'mes' ? y * 100 + m : y;
        const cur = map.get(key) || { key, sort, monto: 0 };
        cur.monto += money;
        map.set(key, cur);
      });
    }
    const arr = Array.from(map.values());
    if (groupBy === 'vendedor') arr.sort((a, b) => b.monto - a.monto);
    else arr.sort((a, b) => a.sort - b.sort);
    return arr;
  }, [filtered, groupBy, extraByKey]);

  const sysJulyTotal = useMemo(() => Object.values(extraByKey).reduce((a, m) => a + m, 0), [extraByKey]);
  const totalMonto = useMemo(() => filtered.reduce((a, r) => a + r.monto, 0) + sysJulyTotal, [filtered, sysJulyTotal]);
  const chartData = agg.map(a => ({ x: a.key, y: a.monto }));

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>📚 Histórico {serviceLabel}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Ventas por mes, año y vendedor. Sube el reporte una vez y queda guardado como histórico del servicio.
      </Typography>
      {sysJulyTotal > 0 && (
        <Typography variant="body2" sx={{ mb: 2, color: '#1B5E20', bgcolor: '#E8F5E9', border: '1px solid #A5D6A7', borderRadius: 1.5, px: 1.5, py: 1 }}>
          🔗 Junio (pagos RO- desde el 22) y julio suman lo del sistema nuevo al histórico del Excel: <b>+{money(sysJulyTotal)}</b>.
        </Typography>
      )}

      {/* Carga de archivo */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, border: '1px dashed #bbb', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); if (fileRef.current) fileRef.current.value = ''; }} />
        <Button variant="contained" onClick={() => fileRef.current?.click()} disabled={saving}
          sx={{ bgcolor: GREEN, '&:hover': { bgcolor: '#1B5E20' } }}>
          {saving ? 'Guardando…' : (recs.length ? '↻ Reemplazar reporte' : '📄 Subir reporte')}
        </Button>
        {fileName && <Chip label={fileName} onDelete={removeStored} />}
        {recs.length > 0 && <Typography variant="body2" color="text.secondary">{asesores.length} vendedores · {years.length} años</Typography>}
        {savedAt && <Chip size="small" color="success" variant="outlined" label={`Guardado ${new Date(savedAt).toLocaleDateString('es-MX')}`} />}
        {error && <Typography variant="body2" color="error">{error}</Typography>}
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : recs.length === 0 ? (
        <Paper elevation={0} sx={{ p: 4, borderRadius: 2, border: '1px solid #eee', textAlign: 'center', color: '#999' }}>
          Aún no hay reporte para <b>{serviceLabel}</b>. Sube el Excel para verlo aquí.
        </Paper>
      ) : (
        <>
          {/* Controles */}
          <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', gap: 2 }} alignItems="center">
            <ToggleButtonGroup size="small" exclusive value={groupBy} onChange={(_, v) => v && setGroupBy(v)}>
              <ToggleButton value="mes" sx={{ textTransform: 'none', fontWeight: 700 }}>Por mes</ToggleButton>
              <ToggleButton value="anio" sx={{ textTransform: 'none', fontWeight: 700 }}>Por año</ToggleButton>
              <ToggleButton value="vendedor" sx={{ textTransform: 'none', fontWeight: 700 }}>Por vendedor</ToggleButton>
            </ToggleButtonGroup>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Año</InputLabel>
              <Select label="Año" value={fYear} onChange={e => setFYear(e.target.value)}>
                <MenuItem value="">Todos</MenuItem>
                {years.map(y => <MenuItem key={y} value={String(y)}>{y}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Vendedor</InputLabel>
              <Select label="Vendedor" value={fAsesor} onChange={e => setFAsesor(e.target.value)}>
                <MenuItem value="">Todos</MenuItem>
                {asesores.map(a => <MenuItem key={a} value={a}>{a}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>

          {/* Resumen */}
          <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', gap: 2 }}>
            <Summary label="Monto total" value={money(totalMonto)} color={GREEN} />
            <Summary label="Registros" value={filtered.length.toLocaleString('es-MX')} color="#1565C0" />
            {!fAsesor && <Summary label="Vendedores" value={String(asesores.length)} color="#7B1FA2" />}
          </Stack>

          {/* Gráfica */}
          <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, border: '1px solid #eee' }}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="x" tick={{ fontSize: 11 }} angle={-40} textAnchor="end" interval={0} height={80} />
                <YAxis tick={{ fontSize: 12 }} width={70} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <RTooltip formatter={(v: any) => [money(Number(v)), 'Monto']} />
                <Bar dataKey="y" fill={GREEN} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>

          {/* Tabla */}
          <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 2, border: '1px solid #eee' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 800, bgcolor: '#fafafa' }}>{groupBy === 'vendedor' ? 'Vendedor' : groupBy === 'anio' ? 'Año' : 'Mes'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, bgcolor: '#fafafa' }}>Monto</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, bgcolor: '#fafafa' }}>% del total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {agg.map(a => (
                  <TableRow key={a.key} hover>
                    <TableCell>{a.key}</TableCell>
                    <TableCell align="right">{money(a.monto)}</TableCell>
                    <TableCell align="right">{totalMonto ? ((a.monto / totalMonto) * 100).toFixed(1) : '0'}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Box>
  );
}

function Summary({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Paper elevation={0} sx={{ px: 2.5, py: 1.5, borderRadius: 2, border: '1px solid #eee', minWidth: 160 }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.3 }}>{label}</Typography>
      <Typography sx={{ fontWeight: 800, fontSize: '1.5rem', color, lineHeight: 1.2 }}>{value}</Typography>
    </Paper>
  );
}
