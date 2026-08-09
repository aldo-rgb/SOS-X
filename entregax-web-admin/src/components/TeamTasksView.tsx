// ============================================
// Vista GLOBAL de tareas de equipo — grid compacto (una fila por tarea) con
// barra de avance, status (incl. 🛑 Detenida) e involucrados. Reutilizable.
// Trae TODAS las tareas del equipo desde GET /api/tasks/team.
// ============================================
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Box, Typography, Chip, Avatar, Button, CircularProgress, Alert, TextField, MenuItem, InputAdornment, Tooltip } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';

export interface TeamTask {
  id: number; title: string; status: string; eisenhower?: string; due_at?: string | null;
  started_at?: string | null; board_id?: number | null; board_name?: string | null; board_key?: string | null;
  assignee_id?: number | null; assignee_name?: string | null; assignee_photo?: string | null;
  subtasks_total?: number; subtasks_done?: number;
  participant_avatars?: Array<{ name: string; photo?: string | null }> | null;
  stalled?: boolean; overdue?: boolean;
}

const initials = (n?: string) => (n || '?').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
const displayName = (n?: string) => (String(n || '').trim().toLowerCase() === 'aldo campos' ? 'Sistemas' : (n || ''));
const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s: any) => stripAccents(String(s ?? '')).toLowerCase();

export function taskState(t: TeamTask): { key: string; label: string; bg: string; color: string; pct: number } {
  if (t.status === 'completed') return { key: 'terminada', label: '✅ Terminada', bg: '#E6F4EA', color: '#1E7D34', pct: 100 };
  if (t.status === 'awaiting_confirmation') return { key: 'espera', label: '⏳ En espera', bg: '#FBE9D0', color: '#B07206', pct: 85 };
  if (t.stalled) return { key: 'detenida', label: '🛑 Detenida', bg: '#3A3A3A', color: '#fff', pct: 45 };
  if (t.started_at) return { key: 'proceso', label: '⚙️ En proceso', bg: '#E3F0FB', color: '#1565C0', pct: 45 };
  return { key: 'nueva', label: '🆕 Nueva', bg: '#EEEEEE', color: '#555', pct: 0 };
}

export function TeamTaskRow({ t, onOpen }: { t: TeamTask; onOpen: (id: number) => void }) {
  const st = taskState(t);
  const pct = (t.subtasks_total || 0) > 0 ? Math.round(((t.subtasks_done || 0) / (t.subtasks_total || 1)) * 100) : st.pct;
  const barColor = st.key === 'detenida' ? '#C0392B' : (st.key === 'terminada' ? '#2E7D46' : (st.key === 'proceso' ? '#1565C0' : '#B0752C'));
  const dot = st.key === 'detenida' ? '#3A3A3A' : barColor;
  const inv = ((t.participant_avatars && t.participant_avatars.length ? t.participant_avatars
    : (t.assignee_name ? [{ name: t.assignee_name, photo: t.assignee_photo || null }] : []))).filter((x: any) => x && x.name);
  const shown = inv.slice(0, 3); const extra = inv.length - shown.length;
  return (
    <Tooltip title={`${st.label.replace(/^[^ ]+ /, '')} · 🗂️ ${t.board_name || ''}${t.overdue ? ' · ⏰ Vencida' : ''}`} disableInteractive>
      <Box onClick={() => onOpen(t.id)}
        sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 0.75, py: 0.4, cursor: 'pointer',
          bgcolor: '#fff', border: '1px solid #ECE4D8', borderRadius: 0.75, borderLeft: `3px solid ${dot}`,
          minWidth: 0, '&:hover': { bgcolor: '#FBF8F4' } }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dot, flex: '0 0 auto' }} />
        <Typography fontSize={12} fontWeight={600} noWrap sx={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>{t.title}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, flex: '0 0 auto' }}>
          <Box sx={{ width: 34, height: 5, borderRadius: 3, bgcolor: '#EFEAE2', overflow: 'hidden' }}>
            <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: barColor }} />
          </Box>
          <Typography fontSize={9.5} fontWeight={700} color="text.secondary" sx={{ minWidth: 26, textAlign: 'right' }}>
            {(t.subtasks_total || 0) > 0 ? `${t.subtasks_done}/${t.subtasks_total}` : `${pct}%`}
          </Typography>
        </Box>
        {shown.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
            {shown.map((p, i) => (
              <Avatar key={i} src={p.photo || undefined} title={displayName(p.name)}
                sx={{ width: 17, height: 17, fontSize: 8, ml: i === 0 ? 0 : '-5px', border: '1.5px solid #fff', bgcolor: i === 0 ? '#D6521C' : '#5E35B1', fontWeight: 700, zIndex: shown.length - i }}>
                {initials(displayName(p.name))}
              </Avatar>
            ))}
            {extra > 0 && <Typography fontSize={9} color="text.secondary" sx={{ ml: 0.4 }}>+{extra}</Typography>}
          </Box>
        )}
      </Box>
    </Tooltip>
  );
}

export default function TeamTasksView({ onOpenTask, refreshKey = 0, boardFilter }: { onOpenTask: (id: number) => void; refreshKey?: number; boardFilter?: number | 'all' | null }) {
  const token = localStorage.getItem('token') || '';
  const H = () => ({ headers: { Authorization: `Bearer ${token}` } });
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [cat, setCat] = useState<number | 'all'>(boardFilter && boardFilter !== 'all' ? boardFilter : 'all');
  const [q, setQ] = useState('');

  // Si el padre (TareasPage) cambia el tablero seleccionado, sincroniza el filtro.
  useEffect(() => {
    if (boardFilter !== undefined && boardFilter !== null) setCat(boardFilter);
  }, [boardFilter]);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API_URL}/tasks/team${showDone ? '?all=true' : ''}`, H())
      .then(r => setTasks(r.data?.tasks || []))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [showDone, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const boards = useMemo(() => Array.from(
    new Map(tasks.filter(t => t.board_id).map(t => [Number(t.board_id), t.board_name || 'Sin categoría'])).entries()
  ).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)), [tasks]);

  const ql = norm(q).trim();
  const filtered = useMemo(() => tasks.filter(t => {
    if (cat !== 'all' && Number(t.board_id) !== cat) return false;
    if (!ql) return true;
    const hay = norm([t.title, t.board_name, t.assignee_name, `t-${t.id}`,
      ...(t.participant_avatars || []).map(p => p.name)].join(' '));
    return hay.includes(ql);
  }), [tasks, cat, ql]);

  const counts = useMemo(() => ({
    nueva: filtered.filter(t => taskState(t).key === 'nueva').length,
    proceso: filtered.filter(t => taskState(t).key === 'proceso').length,
    espera: filtered.filter(t => taskState(t).key === 'espera').length,
    detenida: filtered.filter(t => taskState(t).key === 'detenida').length,
    terminada: filtered.filter(t => taskState(t).key === 'terminada').length,
  }), [filtered]);
  const chips: Array<[string, number, string, string]> = [
    ['🆕 Nuevas', counts.nueva, '#EEEEEE', '#555'],
    ['⚙️ En proceso', counts.proceso, '#E3F0FB', '#1565C0'],
    ['⏳ En espera', counts.espera, '#FBE9D0', '#B07206'],
    ['🛑 Detenidas', counts.detenida, '#3A3A3A', '#fff'],
    ['✅ Terminadas', counts.terminada, '#E6F4EA', '#1E7D34'],
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        <TextField size="small" placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)}
          sx={{ width: 200 }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        <TextField select size="small" value={cat} onChange={e => setCat(e.target.value === 'all' ? 'all' : Number(e.target.value))} sx={{ minWidth: 170 }} label="Categoría">
          <MenuItem value="all">Todas las categorías</MenuItem>
          {boards.map(b => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
        </TextField>
        <Button size="small" variant={showDone ? 'contained' : 'outlined'} onClick={() => setShowDone(v => !v)}
          sx={showDone ? { bgcolor: '#2E7D46', '&:hover': { bgcolor: '#256b3b' } } : { color: '#2E7D46', borderColor: '#2E7D46' }}>
          {showDone ? 'Ocultando terminadas ✓' : 'Mostrar terminadas'}
        </Button>
        <Box sx={{ flex: 1 }} />
        {chips.map(([lbl, n, bg, col]) => (
          <Chip key={lbl} label={`${lbl}: ${n}`} size="small" sx={{ bgcolor: bg, color: col, fontWeight: 800 }} />
        ))}
      </Box>
      {loading ? (
        <Box sx={{ textAlign: 'center', mt: 6 }}><CircularProgress /></Box>
      ) : filtered.length === 0 ? (
        <Alert severity="info">No hay tareas del equipo que mostrar{cat !== 'all' || q ? ' con este filtro' : ''}.</Alert>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr', xl: '1fr 1fr 1fr 1fr' }, gap: 0.6 }}>
          {filtered.map(t => <TeamTaskRow key={t.id} t={t} onOpen={onOpenTask} />)}
        </Box>
      )}
    </Box>
  );
}
