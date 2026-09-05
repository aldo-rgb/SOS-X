// ============================================
// BONOS — Personal de oficina agrupado por sucursal.
// Lista todos los roles MENOS clientes, asesores, sub-asesores y abogado.
// ============================================
import { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Box, Paper, Typography, Avatar, Chip, CircularProgress, TextField, InputAdornment, Stack,
} from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import SearchIcon from '@mui/icons-material/Search';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const ORANGE = '#D6521C';

interface Staff {
  id: number; full_name: string; email?: string; role: string;
  profile_photo_url?: string | null;
  branch_id?: number | null; branch_code?: string | null; branch_name?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin', admin: 'Admin', director: 'Director',
  branch_manager: 'Gerente de sucursal', customer_service: 'Servicio a cliente',
  operaciones: 'Operaciones', counter_staff: 'Mostrador', warehouse_ops: 'Operaciones bodega',
  repartidor: 'Repartidor', accountant: 'Contador', monitoreo: 'Monitoreo',
  soporte_tecnico: 'Soporte técnico',
  // "external_partner" es como se guarda en la base, no como se le dice a la
  // gente: son las cuentas que llegan sincronizadas desde Grupo Rino.
  external_partner: 'Grupo Rino',
};
const roleLabel = (r: string) => ROLE_LABELS[r] || r;
const initials = (n?: string) => (n || '?').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();

import SimuladorBonosPanel from './SimuladorBonosPanel';

export default function BonosTab() {
  // El simulador vive aquí como vista aparte y NO toca nada de lo de arriba:
  // sirve para dimensionar esquemas antes de decidir cuál construir.
  const [vista, setVista] = useState<'personal' | 'simulador'>('personal');
  const H = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/bonos/staff`, H());
      setStaff(r.data?.staff || []);
    } catch { /* noop */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Agrupar por sucursal (los sin sucursal van al final en "Sin sucursal").
  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const filtered = ql
      ? staff.filter(s => `${s.full_name} ${s.email || ''} ${roleLabel(s.role)}`.toLowerCase().includes(ql))
      : staff;
    const map = new Map<string, { name: string; code: string | null; items: Staff[] }>();
    for (const s of filtered) {
      const key = s.branch_id ? String(s.branch_id) : 'none';
      const name = s.branch_name || 'Sin sucursal asignada';
      if (!map.has(key)) map.set(key, { name, code: s.branch_code || null, items: [] });
      map.get(key)!.items.push(s);
    }
    // Ordenar: sucursales con nombre primero (alfabético), "Sin sucursal" al final.
    return Array.from(map.values()).sort((a, b) => {
      const an = a.name === 'Sin sucursal asignada' ? 1 : 0;
      const bn = b.name === 'Sin sucursal asignada' ? 1 : 0;
      return an - bn || a.name.localeCompare(b.name);
    });
  }, [staff, q]);

  const total = useMemo(() => groups.reduce((s, g) => s + g.items.length, 0), [groups]);

  const selector = (
    <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
      <Chip
        label="Personal" clickable
        color={vista === 'personal' ? 'primary' : 'default'}
        variant={vista === 'personal' ? 'filled' : 'outlined'}
        onClick={() => setVista('personal')}
      />
      <Chip
        label="Simulador de bonos" clickable
        color={vista === 'simulador' ? 'primary' : 'default'}
        variant={vista === 'simulador' ? 'filled' : 'outlined'}
        onClick={() => setVista('simulador')}
      />
    </Stack>
  );

  if (vista === 'simulador') {
    return (<Box>{selector}<SimuladorBonosPanel /></Box>);
  }

  return (
    <Box>
      {selector}
      <Box>
      {/* Encabezado */}
      <Box sx={{ borderRadius: 3, p: 3, mb: 2, color: '#fff',
        background: 'linear-gradient(120deg, #5E35B1 0%, #B07206 100%)', boxShadow: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h5" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              🎁 Bonos · Personal de oficina
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Todo el personal por sucursal (excluye clientes, asesores, sub-asesores y legal)
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h4" fontWeight={800} lineHeight={1}>{total}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>Personas</Typography>
          </Box>
        </Box>
      </Box>

      <TextField
        fullWidth size="small" placeholder="Buscar por nombre, correo o rol…"
        value={q} onChange={e => setQ(e.target.value)}
        sx={{ mb: 2, bgcolor: '#fff' }}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
      />

      {loading ? (
        <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>
      ) : groups.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No hay personal que mostrar.
        </Typography>
      ) : (
        groups.map((g, gi) => (
          <Paper key={gi} sx={{ mb: 2, p: 2, borderRadius: 2, borderLeft: `4px solid ${ORANGE}` }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <BusinessIcon sx={{ color: ORANGE }} />
              <Typography fontWeight={800} fontSize={15}>{g.name}</Typography>
              {g.code && <Chip size="small" label={g.code} sx={{ bgcolor: '#F0E9DF', fontWeight: 700 }} />}
              <Chip size="small" label={`${g.items.length} persona(s)`} sx={{ ml: 'auto', bgcolor: '#EDE7F6', color: '#5E35B1', fontWeight: 700 }} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 1 }}>
              {g.items.map(s => (
                <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1, borderRadius: 1.5,
                  bgcolor: '#fff', border: '1px solid #ECE4D8' }}>
                  <Avatar src={s.profile_photo_url || undefined} sx={{ width: 38, height: 38, bgcolor: '#5E35B1', fontWeight: 700, fontSize: 13 }}>
                    {initials(s.full_name)}
                  </Avatar>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography fontWeight={700} fontSize={13.5} noWrap>{s.full_name}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                      <Chip size="small" label={roleLabel(s.role)} sx={{ height: 18, fontSize: 10.5, bgcolor: '#FBE9E0', color: '#A8431A', fontWeight: 700 }} />
                      {s.email && <Typography variant="caption" color="text.secondary" noWrap>{s.email}</Typography>}
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          </Paper>
        ))
      )}
    </Box>
    </Box>
  );
}
