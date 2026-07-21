// ============================================
// Panel de COBERTURA por paquetería — EntregaX Local y exclusiones por CP
// Lista las paqueterías EXISTENTES (módulo Paqueterías) y para cada una permite
// definir los CP donde NO entrega (exclusiones). Las paqueterías EntregaX Local
// MTY/CDMX además definen su zona metropolitana con reglas de CP (rango/prefijo).
// En un CP excluido, esa paquetería no se ofrece; las demás sí.
// ============================================
import { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Button, TextField, Chip, Alert,
  Switch, FormControlLabel, Divider, CircularProgress, MenuItem, Select, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PlaceIcon from '@mui/icons-material/Place';
import SearchIcon from '@mui/icons-material/Search';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Paqueterías EntregaX Local que además gestionan zona metropolitana (rangos de CP).
const LOCAL_CARRIER_KEYS = ['local', 'entregax_local_cdmx'];

interface Rule { id: number; zone_key: string; rule_type: 'range' | 'prefix'; range_min: number | null; range_max: number | null; prefix: string | null; }
interface Excluded { zip: string; note: string | null; created_by_name?: string | null; }
interface Zone { zone_key: string; label: string; active: boolean; sort_order: number; carrier_key: string | null; rules: Rule[]; excluded: Excluded[]; }
interface Carrier { carrier_key: string; name: string; }

export default function CoveragePage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ sev: 'success' | 'error'; text: string } | null>(null);

  // Probar CP
  const [testZip, setTestZip] = useState('');
  const [testResult, setTestResult] = useState<{ zone: string | null; label: string | null; excludedCarriers: string[] } | null>(null);

  const token = localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [zres, cres] = await Promise.all([
        fetch(`${API_URL}/api/admin/coverage/zones`, { headers }),
        fetch(`${API_URL}/api/admin/coverage/carriers`, { headers }),
      ]);
      const zdata = await zres.json();
      const cdata = await cres.json();
      if (zdata.success) setZones(zdata.zones || []);
      if (cdata.success) setCarriers(cdata.carriers || []);
    } catch { /* silent */ } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (sev: 'success' | 'error', text: string) => { setMsg({ sev, text }); setTimeout(() => setMsg(null), 3500); };

  const runTest = async () => {
    const z = testZip.trim();
    if (!/^\d{5}$/.test(z)) { flash('error', 'CP inválido (5 dígitos)'); return; }
    try {
      const res = await fetch(`${API_URL}/api/admin/coverage/check?zip=${z}`, { headers });
      const d = await res.json();
      if (d.success) setTestResult({ zone: d.zone, label: d.label, excludedCarriers: d.excludedCarriers || [] });
    } catch { flash('error', 'Error de red'); }
  };

  // Mapa carrier_key → zona (para mostrar reglas/exclusiones ya guardadas).
  const zoneByCarrier = new Map<string, Zone>();
  zones.forEach((z) => { if (z.carrier_key) zoneByCarrier.set(z.carrier_key, z); });

  // Orden: EntregaX Local primero, luego el resto alfabético.
  const orderedCarriers = [...carriers].sort((a, b) => {
    const la = LOCAL_CARRIER_KEYS.includes(a.carrier_key) ? 0 : 1;
    const lb = LOCAL_CARRIER_KEYS.includes(b.carrier_key) ? 0 : 1;
    return la !== lb ? la - lb : a.name.localeCompare(b.name);
  });

  return (
    <Box>
      <Box sx={{ mb: 1 }}>
        <Typography variant="h6" fontWeight="bold"><PlaceIcon sx={{ verticalAlign: 'middle', mr: 0.5 }} />Cobertura por paquetería</Typography>
        <Typography variant="body2" color="text.secondary">
          Cada paquetería tiene su lista de <strong>CP excluidos</strong> (donde no entrega): en un CP excluido esa paquetería no se ofrece, las demás sí.
          <strong> EntregaX Local MTY/CDMX</strong> además define su zona metropolitana con reglas de CP (rango/prefijo).
        </Typography>
      </Box>

      {msg && <Alert severity={msg.sev} sx={{ my: 1 }}>{msg.text}</Alert>}

      {/* Probar CP */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="subtitle2">Probar un CP:</Typography>
        <TextField size="small" placeholder="Ej. 64000" value={testZip} onChange={(e) => setTestZip(e.target.value.replace(/\D/g, '').slice(0, 5))} sx={{ width: 130 }} />
        <Button size="small" variant="outlined" startIcon={<SearchIcon />} onClick={runTest}>Verificar</Button>
        {testResult && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {testResult.zone
              ? <Chip color="success" size="small" label={`Zona metro: ${testResult.label}`} />
              : <Chip color="default" size="small" variant="outlined" label="Fuera de zona metro" />}
            {testResult.excludedCarriers.length > 0 && (
              <Chip color="warning" size="small" label={`Excluye: ${testResult.excludedCarriers.join(', ')}`} />
            )}
          </Box>
        )}
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : orderedCarriers.length === 0 ? (
        <Alert severity="info">No hay paqueterías activas.</Alert>
      ) : (
        orderedCarriers.map((c) => (
          <CarrierCard
            key={c.carrier_key}
            carrier={c}
            zone={zoneByCarrier.get(c.carrier_key)}
            isLocal={LOCAL_CARRIER_KEYS.includes(c.carrier_key)}
            headers={headers}
            onChange={load}
            flash={flash}
          />
        ))
      )}
    </Box>
  );
}

// ---------- Tarjeta de una paquetería ----------
function CarrierCard({ carrier, zone, isLocal, headers, onChange, flash }: {
  carrier: Carrier;
  zone: Zone | undefined;
  isLocal: boolean;
  headers: Record<string, string>;
  onChange: () => void;
  flash: (sev: 'success' | 'error', text: string) => void;
}) {
  const [ruleType, setRuleType] = useState<'range' | 'prefix'>('range');
  const [rMin, setRMin] = useState('');
  const [rMax, setRMax] = useState('');
  const [prefix, setPrefix] = useState('');
  const [exZip, setExZip] = useState('');
  const [exNote, setExNote] = useState('');

  const post = async (url: string, body?: unknown) => (await fetch(url, { method: 'POST', headers, body: body ? JSON.stringify(body) : undefined })).json();
  const del = async (url: string) => (await fetch(url, { method: 'DELETE', headers })).json();

  // Asegura que exista una "zona" (contenedor) para esta paquetería; la crea al
  // vuelo con zone_key = carrier_key si aún no tiene. Devuelve el zone_key.
  const ensureZoneKey = async (): Promise<string | null> => {
    if (zone) return zone.zone_key;
    const zoneKey = carrier.carrier_key;
    const d = await post(`${API_URL}/api/admin/coverage/zones`, { zone_key: zoneKey, label: carrier.name, active: true, carrier_key: carrier.carrier_key });
    if (!d.success) { flash('error', d.error || 'No se pudo crear el contenedor'); return null; }
    return zoneKey;
  };

  const toggleActive = async () => {
    if (!zone) return;
    const d = await post(`${API_URL}/api/admin/coverage/zones`, { zone_key: zone.zone_key, label: zone.label, active: !zone.active, carrier_key: zone.carrier_key });
    if (d.success) { flash('success', `${carrier.name} ${!zone.active ? 'activada' : 'desactivada'}`); onChange(); } else flash('error', d.error || 'Error');
  };

  const addRule = async () => {
    const zk = await ensureZoneKey();
    if (!zk) return;
    let body: Record<string, unknown>;
    if (ruleType === 'range') {
      if (!/^\d{4,5}$/.test(rMin) || !/^\d{4,5}$/.test(rMax)) { flash('error', 'Rango inválido'); return; }
      body = { rule_type: 'range', range_min: parseInt(rMin, 10), range_max: parseInt(rMax, 10) };
    } else {
      if (!/^\d{1,4}$/.test(prefix)) { flash('error', 'Prefijo inválido (1–4 dígitos)'); return; }
      body = { rule_type: 'prefix', prefix };
    }
    const d = await post(`${API_URL}/api/admin/coverage/zones/${zk}/rules`, body);
    if (d.success) { setRMin(''); setRMax(''); setPrefix(''); flash('success', 'Regla agregada'); onChange(); } else flash('error', d.error || 'Error');
  };

  const removeRule = async (id: number) => {
    const d = await del(`${API_URL}/api/admin/coverage/rules/${id}`);
    if (d.success) { onChange(); } else flash('error', d.error || 'Error');
  };

  const addExcluded = async () => {
    if (!/^\d{5}$/.test(exZip.trim())) { flash('error', 'CP inválido (5 dígitos)'); return; }
    const zk = await ensureZoneKey();
    if (!zk) return;
    const d = await post(`${API_URL}/api/admin/coverage/zones/${zk}/excluded`, { zip: exZip.trim(), note: exNote.trim() || null });
    if (d.success) { setExZip(''); setExNote(''); flash('success', `CP ${exZip.trim()} excluido de ${carrier.name}`); onChange(); } else flash('error', d.error || 'Error');
  };

  const removeExcluded = async (zip: string) => {
    if (!zone) return;
    const d = await del(`${API_URL}/api/admin/coverage/zones/${zone.zone_key}/excluded/${zip}`);
    if (d.success) { onChange(); } else flash('error', d.error || 'Error');
  };

  const rules = zone?.rules || [];
  const excluded = zone?.excluded || [];
  const inactive = isLocal && zone ? !zone.active : false;

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2, opacity: inactive ? 0.65 : 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LocalShippingIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
          <Typography variant="subtitle1" fontWeight="bold">{carrier.name}</Typography>
          <Chip size="small" label={carrier.carrier_key} variant="outlined" />
          {isLocal && <Chip size="small" color="primary" label="EntregaX Local" />}
        </Box>
        {isLocal && zone && (
          <FormControlLabel control={<Switch checked={zone.active} onChange={toggleActive} />} label={zone.active ? 'Cobertura activa' : 'Cobertura inactiva'} />
        )}
      </Box>

      <Divider sx={{ my: 1.5 }} />

      {/* Reglas (solo EntregaX Local) */}
      {isLocal && (
        <>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Zona de cobertura (reglas de CP)</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
            {rules.length === 0 ? (
              <Typography variant="caption" color="text.secondary">Sin reglas — no cubre ningún CP.</Typography>
            ) : rules.map((r) => (
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
        </>
      )}

      {/* Exclusiones (todas las paqueterías) */}
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>CP excluidos — {carrier.name} NO entrega aquí ({excluded.length})</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
        {excluded.length === 0 ? (
          <Typography variant="caption" color="text.secondary">Sin exclusiones.</Typography>
        ) : excluded.map((e) => (
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
