// ============================================
// Panel de COBERTURA metropolitana — EntregaX Local
// Gestiona zonas metro (MTY, CDMX, y futuras): reglas de pertenencia
// (rangos de CP y prefijos) + CP excluidos. En zona metro solo se ofrece
// EntregaX Local (se ocultan Paquete Express y las "por cobrar") en guías TDX.
// ============================================
import { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Button, TextField, Chip, IconButton, Alert,
  Switch, FormControlLabel, Divider, CircularProgress, MenuItem, Select,
  Dialog, DialogTitle, DialogContent, DialogActions, Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import PlaceIcon from '@mui/icons-material/Place';
import SearchIcon from '@mui/icons-material/Search';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Rule { id: number; zone_key: string; rule_type: 'range' | 'prefix'; range_min: number | null; range_max: number | null; prefix: string | null; }
interface Excluded { zip: string; note: string | null; created_by_name?: string | null; }
interface Zone { zone_key: string; label: string; active: boolean; sort_order: number; rules: Rule[]; excluded: Excluded[]; }

export default function CoveragePage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ sev: 'success' | 'error'; text: string } | null>(null);

  // Alta de zona
  const [newZoneOpen, setNewZoneOpen] = useState(false);
  const [newZoneKey, setNewZoneKey] = useState('');
  const [newZoneLabel, setNewZoneLabel] = useState('');

  // Probar CP
  const [testZip, setTestZip] = useState('');
  const [testResult, setTestResult] = useState<{ zone: string | null; label: string | null } | null>(null);

  const token = localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/coverage/zones`, { headers });
      const data = await res.json();
      if (data.success) setZones(data.zones || []);
    } catch { /* silent */ } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (sev: 'success' | 'error', text: string) => { setMsg({ sev, text }); setTimeout(() => setMsg(null), 3500); };

  const post = async (url: string, body?: unknown) => {
    const res = await fetch(url, { method: 'POST', headers, body: body ? JSON.stringify(body) : undefined });
    return res.json();
  };
  const del = async (url: string) => {
    const res = await fetch(url, { method: 'DELETE', headers });
    return res.json();
  };

  const toggleZone = async (z: Zone) => {
    const d = await post(`${API_URL}/api/admin/coverage/zones`, { zone_key: z.zone_key, label: z.label, active: !z.active });
    if (d.success) { flash('success', `Zona ${z.label} ${!z.active ? 'activada' : 'desactivada'}`); load(); } else flash('error', d.error || 'Error');
  };

  const createZone = async () => {
    const key = newZoneKey.trim().toLowerCase();
    if (!key || !newZoneLabel.trim()) { flash('error', 'Clave y nombre son obligatorios'); return; }
    const d = await post(`${API_URL}/api/admin/coverage/zones`, { zone_key: key, label: newZoneLabel.trim(), active: true });
    if (d.success) { setNewZoneOpen(false); setNewZoneKey(''); setNewZoneLabel(''); flash('success', 'Zona creada'); load(); } else flash('error', d.error || 'Error');
  };

  const deleteZone = async (z: Zone) => {
    if (!window.confirm(`¿Eliminar la zona "${z.label}" con todas sus reglas y exclusiones?`)) return;
    const d = await del(`${API_URL}/api/admin/coverage/zones/${z.zone_key}`);
    if (d.success) { flash('success', 'Zona eliminada'); load(); } else flash('error', d.error || 'Error');
  };

  const runTest = async () => {
    const z = testZip.trim();
    if (!/^\d{5}$/.test(z)) { flash('error', 'CP inválido (5 dígitos)'); return; }
    try {
      const res = await fetch(`${API_URL}/api/admin/coverage/check?zip=${z}`, { headers });
      const d = await res.json();
      if (d.success) setTestResult({ zone: d.zone, label: d.label });
    } catch { flash('error', 'Error de red'); }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h6" fontWeight="bold"><PlaceIcon sx={{ verticalAlign: 'middle', mr: 0.5 }} />Cobertura metropolitana — EntregaX Local</Typography>
          <Typography variant="body2" color="text.secondary">
            En zona metro solo se ofrece <strong>EntregaX Local</strong> (se ocultan Paquete Express y las paqueterías "por cobrar") en guías TDX.
            Un CP pertenece a una zona si cae en alguna <strong>regla</strong> (rango o prefijo) y <strong>no</strong> está en sus exclusiones.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewZoneOpen(true)}>Agregar zona</Button>
      </Box>

      {msg && <Alert severity={msg.sev} sx={{ my: 1 }}>{msg.text}</Alert>}

      {/* Probar CP */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="subtitle2">Probar un CP:</Typography>
        <TextField size="small" placeholder="Ej. 64000" value={testZip} onChange={(e) => setTestZip(e.target.value.replace(/\D/g, '').slice(0, 5))} sx={{ width: 130 }} />
        <Button size="small" variant="outlined" startIcon={<SearchIcon />} onClick={runTest}>Verificar</Button>
        {testResult && (
          testResult.zone
            ? <Chip color="success" label={`Zona metro: ${testResult.label}`} />
            : <Chip color="default" variant="outlined" label="Fuera de zona metro (paqueterías normales)" />
        )}
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : zones.length === 0 ? (
        <Alert severity="info">No hay zonas configuradas.</Alert>
      ) : (
        zones.map((z) => <ZoneCard key={z.zone_key} zone={z} onChange={load} flash={flash} headers={headers} onToggle={() => toggleZone(z)} onDelete={() => deleteZone(z)} />)
      )}

      {/* Dialog nueva zona */}
      <Dialog open={newZoneOpen} onClose={() => setNewZoneOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Nueva zona de cobertura</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField label="Clave (sin espacios, ej. gdl)" value={newZoneKey} onChange={(e) => setNewZoneKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} size="small" fullWidth />
          <TextField label="Nombre visible (ej. Guadalajara ZMG)" value={newZoneLabel} onChange={(e) => setNewZoneLabel(e.target.value)} size="small" fullWidth />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewZoneOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={createZone}>Crear</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ---------- Tarjeta de una zona ----------
function ZoneCard({ zone, onChange, flash, headers, onToggle, onDelete }: {
  zone: Zone;
  onChange: () => void;
  flash: (sev: 'success' | 'error', text: string) => void;
  headers: Record<string, string>;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [ruleType, setRuleType] = useState<'range' | 'prefix'>('range');
  const [rMin, setRMin] = useState('');
  const [rMax, setRMax] = useState('');
  const [prefix, setPrefix] = useState('');
  const [exZip, setExZip] = useState('');
  const [exNote, setExNote] = useState('');

  const post = async (url: string, body?: unknown) => (await fetch(url, { method: 'POST', headers, body: body ? JSON.stringify(body) : undefined })).json();
  const del = async (url: string) => (await fetch(url, { method: 'DELETE', headers })).json();

  const addRule = async () => {
    let body: Record<string, unknown>;
    if (ruleType === 'range') {
      if (!/^\d{4,5}$/.test(rMin) || !/^\d{4,5}$/.test(rMax)) { flash('error', 'Rango inválido'); return; }
      body = { rule_type: 'range', range_min: parseInt(rMin, 10), range_max: parseInt(rMax, 10) };
    } else {
      if (!/^\d{1,4}$/.test(prefix)) { flash('error', 'Prefijo inválido (1–4 dígitos)'); return; }
      body = { rule_type: 'prefix', prefix };
    }
    const d = await post(`${API_URL}/api/admin/coverage/zones/${zone.zone_key}/rules`, body);
    if (d.success) { setRMin(''); setRMax(''); setPrefix(''); flash('success', 'Regla agregada'); onChange(); } else flash('error', d.error || 'Error');
  };

  const removeRule = async (id: number) => {
    const d = await del(`${API_URL}/api/admin/coverage/rules/${id}`);
    if (d.success) { onChange(); } else flash('error', d.error || 'Error');
  };

  const addExcluded = async () => {
    if (!/^\d{5}$/.test(exZip.trim())) { flash('error', 'CP inválido (5 dígitos)'); return; }
    const d = await post(`${API_URL}/api/admin/coverage/zones/${zone.zone_key}/excluded`, { zip: exZip.trim(), note: exNote.trim() || null });
    if (d.success) { setExZip(''); setExNote(''); flash('success', `CP ${exZip.trim()} excluido`); onChange(); } else flash('error', d.error || 'Error');
  };

  const removeExcluded = async (zip: string) => {
    const d = await del(`${API_URL}/api/admin/coverage/zones/${zone.zone_key}/excluded/${zip}`);
    if (d.success) { onChange(); } else flash('error', d.error || 'Error');
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2, opacity: zone.active ? 1 : 0.65 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle1" fontWeight="bold">{zone.label}</Typography>
          <Chip size="small" label={zone.zone_key} variant="outlined" />
        </Box>
        <Box>
          <FormControlLabel control={<Switch checked={zone.active} onChange={onToggle} />} label={zone.active ? 'Activa' : 'Inactiva'} />
          <Tooltip title="Eliminar zona"><IconButton size="small" color="error" onClick={onDelete}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
        </Box>
      </Box>

      <Divider sx={{ my: 1.5 }} />

      {/* Reglas */}
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Reglas de pertenencia</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
        {zone.rules.length === 0 ? (
          <Typography variant="caption" color="text.secondary">Sin reglas — la zona no cubre ningún CP.</Typography>
        ) : zone.rules.map((r) => (
          <Chip
            key={r.id}
            label={r.rule_type === 'range' ? `Rango ${r.range_min}–${r.range_max}` : `Prefijo ${r.prefix}*`}
            onDelete={() => removeRule(r.id)}
            color={r.rule_type === 'range' ? 'primary' : 'secondary'}
            variant="outlined"
          />
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
        <Select size="small" value={ruleType} onChange={(e) => setRuleType(e.target.value as 'range' | 'prefix')} sx={{ width: 130 }}>
          <MenuItem value="range">Rango</MenuItem>
          <MenuItem value="prefix">Prefijo</MenuItem>
        </Select>
        {ruleType === 'range' ? (
          <>
            <TextField size="small" placeholder="Desde" value={rMin} onChange={(e) => setRMin(e.target.value.replace(/\D/g, '').slice(0, 5))} sx={{ width: 100 }} />
            <TextField size="small" placeholder="Hasta" value={rMax} onChange={(e) => setRMax(e.target.value.replace(/\D/g, '').slice(0, 5))} sx={{ width: 100 }} />
          </>
        ) : (
          <TextField size="small" placeholder="Prefijo (ej. 01)" value={prefix} onChange={(e) => setPrefix(e.target.value.replace(/\D/g, '').slice(0, 4))} sx={{ width: 130 }} />
        )}
        <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addRule}>Agregar regla</Button>
      </Box>

      {/* Exclusiones */}
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>CP excluidos ({zone.excluded.length})</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
        {zone.excluded.length === 0 ? (
          <Typography variant="caption" color="text.secondary">Sin exclusiones.</Typography>
        ) : zone.excluded.map((e) => (
          <Tooltip key={e.zip} title={e.note || ''}>
            <Chip label={e.zip} onDelete={() => removeExcluded(e.zip)} color="warning" variant="outlined" />
          </Tooltip>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField size="small" placeholder="CP a excluir" value={exZip} onChange={(e) => setExZip(e.target.value.replace(/\D/g, '').slice(0, 5))} sx={{ width: 130 }} />
        <TextField size="small" placeholder="Nota (opcional)" value={exNote} onChange={(e) => setExNote(e.target.value)} sx={{ width: 200 }} />
        <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addExcluded}>Excluir CP</Button>
      </Box>
    </Paper>
  );
}
