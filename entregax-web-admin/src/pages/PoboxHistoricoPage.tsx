import { useState, useMemo, useRef } from 'react';
import {
  Box, Typography, Paper, Button, Stack, ToggleButtonGroup, ToggleButton,
  FormControl, InputLabel, Select, MenuItem, Table, TableHead, TableRow, TableCell,
  TableBody, TableContainer, Chip,
} from '@mui/material';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
} from 'recharts';
import * as XLSX from 'xlsx';

const GREEN = '#2E7D32';
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

interface Rec { asesor: string; anio: number; mes: number; monto: number }

const toNum = (v: any): number => {
  if (typeof v === 'number') return v;
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
};
const money = (v: number) => `$${v.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;

export default function PoboxHistoricoPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [recs, setRecs] = useState<Rec[]>([]);
  const [groupBy, setGroupBy] = useState<'mes' | 'anio' | 'vendedor'>('mes');
  const [fYear, setFYear] = useState<string>('');
  const [fAsesor, setFAsesor] = useState<string>('');
  const [error, setError] = useState('');

  // Parseo del formato matriz del "Reporte PO BOX" (hoja INST):
  // columnas: Asesor | Año | Ene..Dic | Total. El nombre del asesor solo aparece
  // en la 1ª fila de su bloque (con "(Total: $…)"); se rellena hacia abajo.
  // Se excluye la fila "Total general" (es la suma de todos).
  const onFile = async (file: File) => {
    setFileName(file.name); setError('');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets['INST'] || wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
      if (!json.length) { setError('El archivo está vacío.'); return; }
      // Localizar claves reales (tolerante a acentos/espacios).
      const keys = Object.keys(json[0]);
      const kAsesor = keys.find(k => /asesor|vendedor/i.test(k)) || keys[0];
      const kAnio = keys.find(k => /a[ñn]o/i.test(k)) || keys[1];
      const monthKeys = MESES.map(m => keys.find(k => k.trim().toLowerCase().startsWith(m.toLowerCase())) || '');
      if (monthKeys.every(k => !k)) { setError('No encontré columnas de meses (Ene..Dic). ¿Es el Reporte PO BOX?'); return; }

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
      setRecs(out);
      setFYear(''); setFAsesor('');
      if (!out.length) setError('No se encontraron montos. Revisa el formato del archivo.');
    } catch (e: any) {
      setError('No se pudo leer el archivo: ' + (e?.message || ''));
    }
  };

  const years = useMemo(() => Array.from(new Set(recs.map(r => r.anio))).sort((a, b) => b - a), [recs]);
  const asesores = useMemo(() => Array.from(new Set(recs.map(r => r.asesor))).sort(), [recs]);

  const filtered = useMemo(() => recs.filter(r =>
    (!fYear || String(r.anio) === fYear) && (!fAsesor || r.asesor === fAsesor)
  ), [recs, fYear, fAsesor]);

  // Agregación por dimensión (siempre suma de monto).
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
    const arr = Array.from(map.values());
    if (groupBy === 'vendedor') arr.sort((a, b) => b.monto - a.monto);
    else arr.sort((a, b) => a.sort - b.sort);
    return arr;
  }, [filtered, groupBy]);

  const totalMonto = useMemo(() => filtered.reduce((a, r) => a + r.monto, 0), [filtered]);
  const chartData = agg.map(a => ({ x: a.key, y: a.monto }));

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>📚 Histórico PO Box USA</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Análisis del reporte por mes, año, vendedor y monto. Todo en tu navegador — nada se guarda.
      </Typography>

      {/* Carga de archivo */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, border: '1px dashed #bbb', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        <Button variant="contained" onClick={() => fileRef.current?.click()} sx={{ bgcolor: GREEN, '&:hover': { bgcolor: '#1B5E20' } }}>
          📄 Subir Reporte PO BOX
        </Button>
        {fileName && <Chip label={fileName} onDelete={() => { setRecs([]); setFileName(''); }} />}
        {recs.length > 0 && <Typography variant="body2" color="text.secondary">{asesores.length} asesores · {years.length} años</Typography>}
        {error && <Typography variant="body2" color="error">{error}</Typography>}
      </Paper>

      {recs.length > 0 && (
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
