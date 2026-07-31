// ============================================================
// MisTareasPage — "Mis Tareas" para TODOS los empleados.
// Muestra las tareas asignadas al usuario (de cualquier tablero) y permite
// crear tareas personales y asignarlas a usuarios específicos.
// Vistas: Lista y Matriz Eisenhower.
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Box, Typography, Button, IconButton, Chip, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Select, FormControl, InputLabel, CircularProgress,
  Avatar, Divider, Checkbox, Snackbar, Alert, LinearProgress, ToggleButton, ToggleButtonGroup, Tooltip,
  Autocomplete,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SendIcon from '@mui/icons-material/Send';
import ChecklistIcon from '@mui/icons-material/Checklist';
import ViewListIcon from '@mui/icons-material/ViewList';
import GridViewIcon from '@mui/icons-material/GridView';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ScheduleIcon from '@mui/icons-material/Schedule';
import EditIcon from '@mui/icons-material/Edit';
import AttachFileIcon from '@mui/icons-material/AttachFile';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const getToken = () => localStorage.getItem('token') || '';
const H = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });
const ME = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
const MY_ID = Number(ME?.id) || 0;

const RECUR_LABEL: Record<string, string> = { none: 'Una vez', daily: 'Diaria', weekly: 'Semanal', monthly: 'Mensual', monthly_weekday: 'Mensual (día de semana)' };
const ORDINAL_LABEL: Record<number, string> = { 1: 'Primer', 2: 'Segundo', 3: 'Tercer', 4: 'Cuarto', [-1]: 'Último' };
const WEEKDAY_LABEL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const schedLabel = (s: any): string => s.recurrence === 'monthly_weekday' && s.recur_ordinal != null
  ? `${ORDINAL_LABEL[s.recur_ordinal] || ''} ${WEEKDAY_LABEL[s.recur_weekday] || ''} del mes`.trim()
  : (RECUR_LABEL[s.recurrence] || 'Una vez');

// Adjuntos: fotos + documentos (PDF, Excel, Word, CSV, texto).
const ACCEPT_FILES = 'image/*,.pdf,.xls,.xlsx,.csv,.doc,.docx,.txt,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const isImg = (name?: string): boolean => /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(String(name || ''));
const fileIcon = (name?: string): string => {
  const n = String(name || '').toLowerCase();
  if (/\.pdf$/.test(n)) return '📄';
  if (/\.(xls|xlsx|csv)$/.test(n)) return '📊';
  if (/\.(doc|docx)$/.test(n)) return '📝';
  return '📎';
};

const EIS: Record<string, { label: string; short: string; color: string; bg: string }> = {
  fuego:    { label: '🔥 Urgente e importante',       short: '🔥 Urgente',           color: '#C0392B', bg: '#F9E5E2' },
  estrella: { label: '⭐ Importante y no urgente',    short: '⭐ Importante',         color: '#2E7D46', bg: '#E4F1E8' },
  delegar:  { label: '🔄 Urgente y no importante',    short: '🔄 Atención Inmediata', color: '#B07206', bg: '#F7ECD5' },
  eliminar: { label: '🗑️ No importante y no urgente', short: '🗑️ Algún día',         color: '#5A6472', bg: '#ECEEF0' },
};
const QUADRANTS: Array<{ key: string; title: string; color: string; bg: string }> = [
  { key: 'fuego',    title: 'Importante y urgente',       color: '#C0392B', bg: '#FCEDEA' },
  { key: 'estrella', title: 'Importante y no urgente',    color: '#2E7D46', bg: '#ECF6EF' },
  { key: 'delegar',  title: 'Urgente y no importante',    color: '#B07206', bg: '#FAF3E4' },
  { key: 'eliminar', title: 'No importante y no urgente', color: '#5A6472', bg: '#F1F3F5' },
];
const fmtDur = (ms: number): string => {
  if (!isFinite(ms) || ms < 0) return '—';
  const min = Math.floor(ms / 60000);
  if (min < 1) return '<1m'; if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), mm = min % 60;
  if (h < 24) return `${h}h ${mm}m`;
  const d = Math.floor(h / 24), hh = h % 24; return `${d}d ${hh}h`;
};
const taskTime = (t: any) => {
  if (!t?.created_at) return null;
  const start = new Date(t.created_at).getTime();
  const end = t.completed_at ? new Date(t.completed_at).getTime() : Date.now();
  return { done: !!t.completed_at, ms: end - start };
};
const ACT_LABEL: Record<string, string> = {
  created: '📌 Creó la tarea', assigned: '👤 Reasignó la tarea', moved: '➡️ Movió de columna',
  started: '▶️ Puso en proceso', completed: '✅ Completó la tarea', forced_close: '🔓 Forzó el cierre', reopened: '↩️ Reabrió la tarea',
  comment: '💬 Comentó', subtask_done: '☑️ Palomeó una subtarea', subtask_undone: '⬜ Despalomeó una subtarea',
  attachment_added: '📷 Agregó una foto',
};
const actLabel = (a: any): string => ACT_LABEL[a.action] || a.action;

interface Task {
  id: number; title: string; description?: string; eisenhower: string; status: string;
  due_at?: string; created_at?: string; completed_at?: string; assignee_name?: string;
  board_name?: string; board_key?: string; column_name?: string; subtasks_total?: number; subtasks_done?: number; overdue?: boolean;
  participants_count?: number; participant_names?: string[] | null;
}
interface UserOpt { id: number; full_name: string; role?: string; avg_resolution_seconds?: number | null; }
const avgLabel = (u: UserOpt): string => {
  const s = u.avg_resolution_seconds != null ? Number(u.avg_resolution_seconds) : null;
  return s && s > 0 ? `⏱ ${fmtDur(s * 1000)} prom.` : '⏱ sin datos';
};
// Etiqueta legible del tipo de usuario (para agrupar el buscador).
const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Administración', admin: 'Administración', director: 'Dirección', finanzas: 'Finanzas',
  accountant: 'Contabilidad', abogado: 'Legal', branch_manager: 'Operación CEDIS', operaciones: 'Operaciones',
  warehouse_ops: 'Bodega', counter_staff: 'Mostrador', customer_service: 'Servicio a cliente',
  soporte_tecnico: 'Soporte técnico', advisor: 'Asesores', sub_advisor: 'Sub-asesores',
  repartidor: 'Repartidores', monitoreo: 'Monitoreo',
};
const roleGroup = (r?: string): string => ROLE_LABEL[String(r || '')] || (r ? r : 'Otros');

// Selector reutilizable de "Involucrados" (buscador agrupado por tipo).
// `fixedId` = usuario que SIEMPRE queda incluido (por defecto el usuario actual;
// al editar, el creador de la tarea). `fixedLabel` = etiqueta del chip fijo.
function InvolvedPicker({ users, involvedIds, setInvolvedIds, fixedId = MY_ID, fixedLabel = 'Yo' }: {
  users: UserOpt[]; involvedIds: number[]; setInvolvedIds: (v: number[]) => void; fixedId?: number; fixedLabel?: string;
}) {
  return (
    <Box sx={{ mt: 1.5 }}>
      <Autocomplete
        multiple size="small" disableCloseOnSelect
        options={[...users].filter(u => u.id !== fixedId)
          .sort((a, b) => roleGroup(a.role).localeCompare(roleGroup(b.role)) || a.full_name.localeCompare(b.full_name))}
        value={users.filter(u => u.id !== fixedId && involvedIds.includes(u.id))}
        onChange={(_, val) => setInvolvedIds([...(fixedId ? [fixedId] : []), ...val.map(u => u.id)])}
        groupBy={(u) => roleGroup(u.role)}
        getOptionLabel={(u) => u.full_name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        filterOptions={(opts, { inputValue }) => {
          const q = inputValue.trim().toLowerCase();
          return q ? opts.filter(u => u.full_name.toLowerCase().includes(q) || roleGroup(u.role).toLowerCase().includes(q)) : opts;
        }}
        renderOption={(props, u) => (
          <li {...props} key={u.id}>
            <Checkbox size="small" checked={involvedIds.includes(u.id)} sx={{ mr: 1, p: 0.5 }} />
            <Box>
              <Typography variant="body2">{u.full_name}</Typography>
              <Typography variant="caption" color="text.secondary">{avgLabel(u)}</Typography>
            </Box>
          </li>
        )}
        renderTags={(value, getTagProps) => [
          <Chip key="me" label={fixedLabel} size="small" sx={{ bgcolor: '#EDE7F6', color: '#5E35B1', fontWeight: 700 }} />,
          ...value.map((u, i) => { const { key, ...tp } = getTagProps({ index: i }) as any; return <Chip key={u.id} {...tp} label={u.full_name} size="small" />; }),
        ]}
        renderInput={(params) => <TextField {...params} label="Involucrados" placeholder="Buscar por nombre o tipo…" />}
      />
    </Box>
  );
}

export default function MisTareasPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'matrix'>('list');
  const [showDone, setShowDone] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' });
  const notify = (msg: string, sev: 'success' | 'error' = 'success') => setSnack({ open: true, msg, sev });

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<any>({ title: '', description: '', eisenhower: 'estrella', due_at: '' });
  const [involvedIds, setInvolvedIds] = useState<number[]>(MY_ID ? [MY_ID] : []);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Array<{ id: number; name: string; board_key?: string }>>([]);
  const [catId, setCatId] = useState<number | ''>('');

  // Programar tareas (futuras / recurrentes).
  const [schedOpen, setSchedOpen] = useState(false);
  const [schedForm, setSchedForm] = useState<any>({ title: '', description: '', eisenhower: 'estrella', first_run_at: '', recurrence: 'none' });
  const [schedInvolved, setSchedInvolved] = useState<number[]>(MY_ID ? [MY_ID] : []);
  const [schedules, setSchedules] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/tasks/mine${showDone ? '?all=true' : ''}`, H());
      setTasks(r.data?.tasks || []);
    } catch { notify('No se pudieron cargar las tareas', 'error'); }
    finally { setLoading(false); }
  }, [showDone]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    axios.get(`${API_URL}/tasks/assignable-users`, H())
      .then(r => setUsers(r.data?.users || [])).catch(() => {});
    axios.get(`${API_URL}/tasks/categories`, H())
      .then(r => {
        const cats = r.data?.categories || [];
        setCategories(cats);
        // Default: Tareas Personales si existe.
        const personal = cats.find((c: any) => c.board_key === 'personales');
        setCatId(personal?.id || cats[0]?.id || '');
      }).catch(() => {});
  }, []);

  const createTask = async () => {
    if (!form.title.trim()) return notify('El título es obligatorio', 'error');
    if (!catId) return notify('Elige una categoría', 'error');
    try {
      const res = await axios.post(`${API_URL}/tasks/personal`, {
        title: form.title.trim(), description: form.description || null,
        eisenhower: form.eisenhower, involved_ids: involvedIds, due_at: form.due_at || null,
        board_id: catId,
      }, H());
      const newId = res.data?.task?.id;
      if (newId && newPhotos.length) {
        for (const f of newPhotos) {
          const fd = new FormData(); fd.append('photo', f);
          try { await axios.post(`${API_URL}/tasks/${newId}/attachments`, fd, { headers: { ...H().headers, 'Content-Type': 'multipart/form-data' } }); } catch { /* continúa */ }
        }
      }
      setCreateOpen(false);
      setForm({ title: '', description: '', eisenhower: 'estrella', due_at: '' });
      setInvolvedIds(MY_ID ? [MY_ID] : []); setNewPhotos([]);
      notify('Tarea creada');
      load();
    } catch (e: any) { notify(e?.response?.data?.error || 'Error al crear', 'error'); }
  };

  const loadSchedules = useCallback(async () => {
    try { const r = await axios.get(`${API_URL}/tasks/schedules`, H()); setSchedules(r.data?.schedules || []); }
    catch { /* opcional */ }
  }, []);
  const emptySched = { title: '', description: '', eisenhower: 'estrella', first_run_at: '', recurrence: 'none', recur_ordinal: 1, recur_weekday: 1, time: '09:00', board_id: '' as number | '' };
  const defaultCatId = () => {
    const personal = categories.find(c => c.board_key === 'personales');
    return personal?.id || categories[0]?.id || '';
  };
  const openSchedule = () => {
    setSchedForm({ ...emptySched, board_id: defaultCatId() });
    setSchedInvolved(MY_ID ? [MY_ID] : []);
    setSchedOpen(true); loadSchedules();
  };
  const createSchedule = async () => {
    if (!schedForm.title.trim()) return notify('El título es obligatorio', 'error');
    if (!schedForm.board_id) return notify('Elige una categoría', 'error');
    const isWeekday = schedForm.recurrence === 'monthly_weekday';
    if (!isWeekday && !schedForm.first_run_at) return notify('Elige la fecha y hora de la primera tarea', 'error');
    try {
      const [hh, mm] = String(schedForm.time || '09:00').split(':');
      await axios.post(`${API_URL}/tasks/schedules`, {
        title: schedForm.title.trim(), description: schedForm.description || null,
        eisenhower: schedForm.eisenhower, involved_ids: schedInvolved, board_id: schedForm.board_id,
        recurrence: schedForm.recurrence,
        ...(isWeekday
          ? { recur_ordinal: schedForm.recur_ordinal, recur_weekday: schedForm.recur_weekday, hour: parseInt(hh), minute: parseInt(mm || '0') }
          : { first_run_at: schedForm.first_run_at }),
      }, H());
      setSchedForm({ ...emptySched });
      setSchedInvolved(MY_ID ? [MY_ID] : []);
      notify('Programación creada'); loadSchedules(); load();
    } catch (e: any) { notify(e?.response?.data?.error || 'Error al programar', 'error'); }
  };
  const deleteSchedule = async (id: number) => {
    try { await axios.delete(`${API_URL}/tasks/schedules/${id}`, H()); notify('Programación eliminada'); loadSchedules(); }
    catch { notify('No se pudo eliminar', 'error'); }
  };

  const initials = (n?: string) => (n || '?').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();

  const renderCard = (t: Task) => {
    const eis = EIS[t.eisenhower];
    const tt = taskTime(t);
    const done = t.status === 'completed';
    // "Tareas Personales" solo cuando le toca al creador sin extras; si hay más
    // involucrados → "Tareas Asignadas".
    const boardLabel = t.board_key === 'personales'
      ? ((t.participants_count || 0) > 1 ? 'Tareas Asignadas' : 'Tareas Personales')
      : t.board_name;
    const colLabel = done ? null : t.column_name; // no mostrar "Pendiente" si ya está completada
    const involved = (t.participant_names || []).filter(Boolean);
    return (
      <Box key={t.id} onClick={() => setDetailId(t.id)}
        sx={{ bgcolor: '#fff', borderRadius: 1.5, p: 1.25, cursor: 'pointer', border: '1px solid #E8DFD3',
          '&:hover': { boxShadow: 2 }, borderLeft: t.overdue ? '3px solid #C0392B' : '1px solid #E8DFD3', opacity: done ? 0.7 : 1 }}>
        <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5, flexWrap: 'wrap' }}>
          <Chip label={eis?.short || t.eisenhower} size="small" sx={{ height: 20, fontSize: 11, bgcolor: eis?.bg, color: eis?.color, fontWeight: 700 }} />
          {done && <Chip label="✅ Completada" size="small" color="success" sx={{ height: 20, fontSize: 11 }} />}
        </Box>
        <Typography fontSize={13.5} fontWeight={600} sx={{ lineHeight: 1.3, textDecoration: done ? 'line-through' : 'none' }}>{t.title}</Typography>
        {(boardLabel || colLabel) && (
          <Typography fontSize={11} color="text.secondary" sx={{ mt: 0.25 }}>🗂️ {boardLabel}{colLabel ? ` · ${colLabel}` : ''}</Typography>
        )}
        {involved.length > 1 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
            {involved.map((name, i) => (
              <Tooltip key={i} title={name}><Avatar sx={{ width: 22, height: 22, fontSize: 10, bgcolor: '#5E35B1' }}>{initials(name)}</Avatar></Tooltip>
            ))}
            <Typography fontSize={11} color="text.secondary">{involved.length} involucrados</Typography>
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
          {involved.length <= 1 && t.assignee_name && <Tooltip title={t.assignee_name}><Avatar sx={{ width: 22, height: 22, fontSize: 10, bgcolor: '#D6521C' }}>{initials(t.assignee_name)}</Avatar></Tooltip>}
          <Box sx={{ flex: 1 }} />
          {(t.subtasks_total || 0) > 0 && (
            <Typography fontSize={11} color={t.subtasks_done === t.subtasks_total ? 'success.main' : 'text.secondary'}>☑ {t.subtasks_done}/{t.subtasks_total}</Typography>
          )}
          {t.due_at && <Typography fontSize={11} color={t.overdue ? 'error.main' : 'text.secondary'}>{new Date(t.due_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</Typography>}
        </Box>
        {tt && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, mt: 0.5 }}>
            <AccessTimeIcon sx={{ fontSize: 13, color: tt.done ? '#2E7D46' : '#8A8A8A' }} />
            <Typography fontSize={11} color={tt.done ? 'success.main' : 'text.secondary'}>{tt.done ? `Resuelta en ${fmtDur(tt.ms)}` : `${fmtDur(tt.ms)} en curso`}</Typography>
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h5" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ChecklistIcon sx={{ color: '#D6521C' }} /> Mis Tareas
          </Typography>
          <Typography variant="body2" color="text.secondary">Tus tareas asignadas. Crea tareas y asígnalas a quien corresponda.</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<ScheduleIcon />} onClick={openSchedule} sx={{ color: '#B07206', borderColor: '#B07206', '&:hover': { borderColor: '#8a5a05', bgcolor: 'rgba(176,114,6,0.06)' } }}>Programar tarea</Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setInvolvedIds(MY_ID ? [MY_ID] : []); setCreateOpen(true); }} sx={{ bgcolor: '#D6521C', '&:hover': { bgcolor: '#B23F12' } }}>Nueva tarea</Button>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load}>Actualizar</Button>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
          <ToggleButton value="list" sx={{ textTransform: 'none', gap: 0.5 }}><ViewListIcon sx={{ fontSize: 18 }} /> Lista</ToggleButton>
          <ToggleButton value="matrix" sx={{ textTransform: 'none', gap: 0.5 }}><GridViewIcon sx={{ fontSize: 18 }} /> Matriz Eisenhower</ToggleButton>
        </ToggleButtonGroup>
        <Button size="small" variant={showDone ? 'contained' : 'outlined'} onClick={() => setShowDone(v => !v)}
          sx={{ textTransform: 'none', ...(showDone ? { bgcolor: '#2E7D46', '&:hover': { bgcolor: '#256B3B' } } : { borderColor: '#2E7D46', color: '#2E7D46' }) }}>
          {showDone ? '✅ Mostrando completadas' : 'Ver completadas'}
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ textAlign: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : tasks.length === 0 ? (
        <Alert severity="success">No tienes tareas pendientes 🎉</Alert>
      ) : view === 'matrix' ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
          {QUADRANTS.map(q => {
            const qt = tasks.filter(t => t.eisenhower === q.key);
            return (
              <Box key={q.key} sx={{ bgcolor: q.bg, borderRadius: 2, p: 1.25, borderTop: `3px solid ${q.color}`, minHeight: 140 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography fontWeight={800} fontSize={14} sx={{ flex: 1, color: q.color }}>{q.title}</Typography>
                  <Chip label={qt.length} size="small" sx={{ height: 20 }} />
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {qt.length === 0 ? <Typography fontSize={12} color="text.disabled" sx={{ py: 1, textAlign: 'center' }}>—</Typography> : qt.map(renderCard)}
                </Box>
              </Box>
            );
          })}
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 1.5 }}>
          {tasks.map(renderCard)}
        </Box>
      )}

      {/* Crear tarea personal */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Nueva tarea</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Título (usa un verbo de acción)" margin="dense"
            value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
            <InputLabel>Categoría (flujo)</InputLabel>
            <Select label="Categoría (flujo)" value={catId} onChange={e => setCatId(e.target.value as number)}>
              {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            La tarea aparecerá en el flujo de esta categoría. (Flujo de Ventas es automático y no aplica aquí.)
          </Typography>
          <TextField fullWidth label="Descripción" margin="dense" multiline rows={2}
            value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Prioridad (Eisenhower)</InputLabel>
              <Select label="Prioridad (Eisenhower)" value={form.eisenhower} onChange={e => setForm({ ...form, eisenhower: e.target.value })}>
                {Object.entries(EIS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField fullWidth size="small" type="datetime-local" label="Fecha deseada" InputLabelProps={{ shrink: true }}
              value={form.due_at} onChange={e => setForm({ ...form, due_at: e.target.value })} />
          </Box>
          <InvolvedPicker users={users} involvedIds={involvedIds} setInvolvedIds={setInvolvedIds} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Busca y agrega a varias personas (agrupadas por tipo). Tú siempre quedas incluido.
          </Typography>
          {/* Archivos adjuntos (fotos, PDF, Excel…) */}
          <Box sx={{ mt: 2 }}>
            <Button component="label" size="small" startIcon={<AttachFileIcon />} sx={{ textTransform: 'none' }}>
              Agregar archivos (fotos, PDF, Excel)
              <input hidden type="file" accept={ACCEPT_FILES} multiple
                onChange={e => { const fs = Array.from(e.target.files || []); if (fs.length) setNewPhotos(prev => [...prev, ...fs]); (e.target as HTMLInputElement).value = ''; }} />
            </Button>
            {newPhotos.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                {newPhotos.map((f, idx) => (
                  <Box key={idx} sx={{ position: 'relative' }}>
                    {isImg(f.name) ? (
                      <Box component="img" src={URL.createObjectURL(f)} alt={f.name}
                        sx={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 1, border: '1px solid #ddd' }} />
                    ) : (
                      <Box sx={{ width: 120, height: 64, borderRadius: 1, border: '1px solid #ddd', p: 0.75, display: 'flex', flexDirection: 'column', justifyContent: 'center', bgcolor: '#FAFAFA' }}>
                        <Typography sx={{ fontSize: 20, lineHeight: 1 }}>{fileIcon(f.name)}</Typography>
                        <Typography variant="caption" noWrap title={f.name}>{f.name}</Typography>
                      </Box>
                    )}
                    <IconButton size="small" onClick={() => setNewPhotos(prev => prev.filter((_, i) => i !== idx))}
                      sx={{ position: 'absolute', top: -8, right: -8, bgcolor: '#fff', boxShadow: 1, p: 0.2, '&:hover': { bgcolor: '#fff' } }}>
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCreateOpen(false); setNewPhotos([]); }}>Cancelar</Button>
          <Button variant="contained" onClick={createTask} sx={{ bgcolor: '#D6521C', '&:hover': { bgcolor: '#B23F12' } }}>Crear</Button>
        </DialogActions>
      </Dialog>

      {/* Programar tarea (futura / recurrente) */}
      <Dialog open={schedOpen} onClose={() => setSchedOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ScheduleIcon sx={{ color: '#B07206' }} /> Programar tarea
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            La tarea se creará automáticamente en la fecha y hora que elijas. Si es recurrente, se volverá a generar en cada ciclo.
          </Typography>
          <TextField autoFocus fullWidth label="Título (usa un verbo de acción)" margin="dense"
            value={schedForm.title} onChange={e => setSchedForm({ ...schedForm, title: e.target.value })} />
          <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
            <InputLabel>Categoría (flujo)</InputLabel>
            <Select label="Categoría (flujo)" value={schedForm.board_id} onChange={e => setSchedForm({ ...schedForm, board_id: e.target.value })}>
              {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField fullWidth label="Descripción" margin="dense" multiline rows={2}
            value={schedForm.description} onChange={e => setSchedForm({ ...schedForm, description: e.target.value })} />
          <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Prioridad (Eisenhower)</InputLabel>
              <Select label="Prioridad (Eisenhower)" value={schedForm.eisenhower} onChange={e => setSchedForm({ ...schedForm, eisenhower: e.target.value })}>
                {Object.entries(EIS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Repetir</InputLabel>
              <Select label="Repetir" value={schedForm.recurrence} onChange={e => setSchedForm({ ...schedForm, recurrence: e.target.value })}>
                <MenuItem value="none">Una vez</MenuItem>
                <MenuItem value="daily">Diaria</MenuItem>
                <MenuItem value="weekly">Semanal</MenuItem>
                <MenuItem value="monthly">Mensual (mismo día)</MenuItem>
                <MenuItem value="monthly_weekday">Mensual (día de la semana)</MenuItem>
              </Select>
            </FormControl>
          </Box>
          {schedForm.recurrence === 'monthly_weekday' ? (
            <Box sx={{ display: 'flex', gap: 1.5, mt: 1.5 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Ocurrencia</InputLabel>
                <Select label="Ocurrencia" value={schedForm.recur_ordinal} onChange={e => setSchedForm({ ...schedForm, recur_ordinal: e.target.value })}>
                  <MenuItem value={1}>Primer</MenuItem>
                  <MenuItem value={2}>Segundo</MenuItem>
                  <MenuItem value={3}>Tercer</MenuItem>
                  <MenuItem value={4}>Cuarto</MenuItem>
                  <MenuItem value={-1}>Último</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>Día</InputLabel>
                <Select label="Día" value={schedForm.recur_weekday} onChange={e => setSchedForm({ ...schedForm, recur_weekday: e.target.value })}>
                  {['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map((d, i) => <MenuItem key={i} value={i}>{d}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField size="small" type="time" label="Hora" InputLabelProps={{ shrink: true }} sx={{ width: 130 }}
                value={schedForm.time} onChange={e => setSchedForm({ ...schedForm, time: e.target.value })} />
            </Box>
          ) : (
            <TextField fullWidth size="small" type="datetime-local" label="Primera ejecución" InputLabelProps={{ shrink: true }} sx={{ mt: 1.5 }}
              value={schedForm.first_run_at} onChange={e => setSchedForm({ ...schedForm, first_run_at: e.target.value })} />
          )}
          <InvolvedPicker users={users} involvedIds={schedInvolved} setInvolvedIds={setSchedInvolved} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Busca y agrega a varias personas (agrupadas por tipo). Tú siempre quedas incluido.
          </Typography>

          {schedules.length > 0 && (
            <Box sx={{ mt: 2.5 }}>
              <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 0.5 }}>Programaciones activas</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {schedules.map(s => (
                  <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, p: 1, border: '1px solid #eee', borderRadius: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={700} noWrap>{s.title}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {schedLabel(s)} · próxima: {s.next_run_at ? new Date(s.next_run_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                      </Typography>
                    </Box>
                    <IconButton size="small" onClick={() => deleteSchedule(s.id)}><CloseIcon sx={{ fontSize: 18 }} /></IconButton>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSchedOpen(false)}>Cerrar</Button>
          <Button variant="contained" onClick={createSchedule} sx={{ bgcolor: '#B07206', '&:hover': { bgcolor: '#8a5a05' } }}>Programar</Button>
        </DialogActions>
      </Dialog>

      {detailId && <TaskDetail id={detailId} onClose={() => setDetailId(null)} onChanged={load} notify={notify} />}

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ ...snack, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snack.sev} onClose={() => setSnack({ ...snack, open: false })}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}

function TaskDetail({ id, onClose, onChanged, notify }: any) {
  const [data, setData] = useState<any>(null);
  const [comment, setComment] = useState('');
  const [newSub, setNewSub] = useState('');
  const [busy, setBusy] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [commitDate, setCommitDate] = useState('');
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<any>({ title: '', description: '', eisenhower: 'estrella', due_at: '' });
  const [editInvolved, setEditInvolved] = useState<number[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);

  const reload = useCallback(async () => {
    try { const r = await axios.get(`${API_URL}/tasks/${id}`, H()); setData(r.data); } catch { /* */ }
  }, [id]);
  useEffect(() => { reload(); }, [reload]);

  const t = data?.task;
  const subs = data?.subtasks || [];
  const pending = subs.filter((s: any) => !s.done).length;
  const tt = t ? taskTime(t) : null;

  const toggleSub = async (s: any) => {
    try { await axios.put(`${API_URL}/tasks/subtasks/${s.id}`, { done: !s.done }, H()); reload(); onChanged(); }
    catch (e: any) { notify(e?.response?.data?.error || 'Error', 'error'); }
  };
  const addSub = async () => {
    if (!newSub.trim()) return;
    try { await axios.post(`${API_URL}/tasks/${id}/subtasks`, { body: newSub.trim() }, H()); setNewSub(''); reload(); onChanged(); }
    catch (e: any) { notify(e?.response?.data?.error || 'No se pudo agregar', 'error'); }
  };
  const complete = async () => {
    if (pending > 0) { notify(`Completa el checklist antes de terminar (${pending} pendiente${pending === 1 ? '' : 's'}).`, 'error'); return; }
    setBusy(true);
    try { await axios.post(`${API_URL}/tasks/${id}/complete`, {}, H()); notify('Tarea completada'); onChanged(); onClose(); }
    catch (e: any) { notify(e?.response?.data?.error || 'No se pudo completar', 'error'); }
    finally { setBusy(false); }
  };
  const addComment = async () => {
    if (!comment.trim()) return;
    try { await axios.post(`${API_URL}/tasks/${id}/comments`, { body: comment.trim() }, H()); setComment(''); reload(); }
    catch { notify('Error al comentar', 'error'); }
  };
  const uploadPhotos = async (files: FileList | null) => {
    if (!files || !files.length) return;
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData(); fd.append('photo', f);
        await axios.post(`${API_URL}/tasks/${id}/attachments`, fd, { headers: { ...H().headers, 'Content-Type': 'multipart/form-data' } });
      }
      notify('Archivo(s) agregado(s)'); reload();
    } catch (e: any) { notify(e?.response?.data?.error || 'No se pudo subir el archivo', 'error'); }
  };
  const deletePhoto = async (attId: number) => {
    if (!window.confirm('¿Eliminar este archivo?')) return;
    try { await axios.delete(`${API_URL}/tasks/attachments/${attId}`, H()); reload(); }
    catch (e: any) { notify(e?.response?.data?.error || 'No se pudo eliminar', 'error'); }
  };
  const fmtDate = (iso?: string) => { try { return iso ? new Date(iso).toLocaleString('es-MX') : '—'; } catch { return '—'; } };
  // ISO → 'YYYY-MM-DDTHH:mm' para el input datetime-local (hora local).
  const toLocalInput = (iso?: string) => {
    if (!iso) return '';
    try { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    } catch { return ''; }
  };
  const openStart = () => { setCommitDate(toLocalInput(t?.commitment_date || t?.due_at)); setStartOpen(true); };
  const start = async (force = false) => {
    setBusy(true);
    try {
      await axios.post(`${API_URL}/tasks/${id}/start`, { commitment_date: commitDate || null, force }, H());
      setStartOpen(false); notify('Tarea en proceso'); reload(); onChanged();
    } catch (e: any) {
      // Regla de 1 en proceso: el backend pide confirmar dejar la otra pendiente.
      if (e?.response?.status === 409 && e?.response?.data?.needs_confirm) {
        const cur = e.response.data.current;
        if (window.confirm(`Ya tienes la tarea "${cur?.title || ''}" en proceso. ¿Seguro que quieres dejarla pendiente para iniciar esta?`)) {
          setBusy(false);
          return start(true);
        }
      } else {
        notify(e?.response?.data?.error || 'No se pudo iniciar', 'error');
      }
    }
    finally { setBusy(false); }
  };
  const durTxt = (a?: string, b?: string) => {
    if (!a || !b) return null;
    return fmtDur(new Date(b).getTime() - new Date(a).getTime());
  };
  const isPersonal = t?.board_key === 'personales';
  const openEdit = () => {
    setEdit({ title: t.title || '', description: t.description || '', eisenhower: t.eisenhower || 'estrella', due_at: toLocalInput(t.due_at) });
    // Involucrados actuales (participantes). El creador siempre queda incluido.
    const parts = (data.participants || []).map((p: any) => Number(p.id));
    setEditInvolved(parts.length ? parts : (t.created_by ? [Number(t.created_by)] : []));
    if (isPersonal && users.length === 0) {
      axios.get(`${API_URL}/tasks/assignable-users`, H()).then(r => setUsers(r.data?.users || [])).catch(() => {});
    }
    setEditing(true);
  };
  const saveEdit = async () => {
    if (!edit.title.trim()) { notify('El título es obligatorio', 'error'); return; }
    setBusy(true);
    try {
      const payload: any = {
        title: edit.title.trim(), description: edit.description || null,
        eisenhower: edit.eisenhower, due_at: edit.due_at || null,
      };
      if (isPersonal) payload.involved_ids = editInvolved;
      await axios.put(`${API_URL}/tasks/${id}`, payload, H());
      setEditing(false); notify('Tarea actualizada'); reload(); onChanged();
    } catch (e: any) { notify(e?.response?.data?.error || 'No se pudo editar', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      {!t ? <DialogContent><CircularProgress /></DialogContent> : (
        <>
          <DialogTitle sx={{ pr: 6 }}>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
              <Chip label={EIS[t.eisenhower]?.short} size="small" sx={{ height: 20, bgcolor: EIS[t.eisenhower]?.bg, color: EIS[t.eisenhower]?.color, fontWeight: 700 }} />
              {t.status === 'completed' && <Chip label="✅ Completada" size="small" color="success" />}
            </Box>
            <Typography fontWeight={800} fontSize={17}>{t.title}</Typography>
            {data.can_edit && !editing && t.status !== 'completed' && (
              <IconButton onClick={openEdit} title="Editar" sx={{ position: 'absolute', right: 44, top: 8, color: '#D6521C' }}><EditIcon /></IconButton>
            )}
            <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
          </DialogTitle>
          <DialogContent dividers>
            {editing ? (
              <Box sx={{ mb: 2, p: 1.5, bgcolor: '#FFF9F5', border: '1px solid #F3D9CC', borderRadius: 1.5 }}>
                <TextField fullWidth size="small" label="Título" margin="dense"
                  value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} />
                <TextField fullWidth size="small" label="Descripción" margin="dense" multiline rows={2}
                  value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} />
                <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Prioridad (Eisenhower)</InputLabel>
                    <Select label="Prioridad (Eisenhower)" value={edit.eisenhower} onChange={e => setEdit({ ...edit, eisenhower: e.target.value })}>
                      {Object.entries(EIS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <TextField fullWidth size="small" type="datetime-local" label="Fecha deseada" InputLabelProps={{ shrink: true }}
                    value={edit.due_at} onChange={e => setEdit({ ...edit, due_at: e.target.value })} />
                </Box>
                {isPersonal && (
                  <>
                    <InvolvedPicker users={users} involvedIds={editInvolved} setInvolvedIds={setEditInvolved}
                      fixedId={Number(t.created_by) || undefined} fixedLabel={t.created_by_name || 'Creador'} />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      El creador siempre queda incluido. El primero que agregues será el responsable principal.
                    </Typography>
                  </>
                )}
                <Box sx={{ display: 'flex', gap: 1, mt: 1.5, justifyContent: 'flex-end' }}>
                  <Button size="small" onClick={() => setEditing(false)} disabled={busy}>Cancelar</Button>
                  <Button size="small" variant="contained" onClick={saveEdit} disabled={busy} sx={{ bgcolor: '#D6521C', '&:hover': { bgcolor: '#B23F12' } }}>Guardar</Button>
                </Box>
              </Box>
            ) : (
              t.description && <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{t.description}</Typography>
            )}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1.5 }}>
              <Typography variant="body2"><b>Responsable:</b> {t.assignee_name || '—'}</Typography>
              {t.due_at && <Typography variant="body2" color={t.overdue ? 'error.main' : 'inherit'}><b>Fecha deseada:</b> {fmtDate(t.due_at)}</Typography>}
            </Box>
            {(data.participants || []).length > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
                <Typography variant="body2" fontWeight={700}>Involucrados:</Typography>
                {(data.participants || []).map((p: any) => (
                  <Chip key={p.id} label={p.full_name} size="small" sx={{ bgcolor: '#EDE7F6', color: '#5E35B1', fontWeight: 600 }} />
                ))}
              </Box>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2, p: 1.25, bgcolor: '#F7F4EF', borderRadius: 1.5, border: '1px solid #ECE4D8' }}>
              <Typography variant="body2"><b>Creada:</b> {fmtDate(t.created_at)}</Typography>
              {t.started_at && <Typography variant="body2"><b>En proceso desde:</b> {fmtDate(t.started_at)}</Typography>}
              {t.commitment_date && <Typography variant="body2"><b>Fecha compromiso:</b> {fmtDate(t.commitment_date)}</Typography>}
              {t.completed_at && <Typography variant="body2"><b>Terminada:</b> {fmtDate(t.completed_at)}</Typography>}
              {/* KPIs de tiempo */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
                {t.started_at && durTxt(t.created_at, t.started_at) && (
                  <Chip size="small" label={`⏳ Tardó ${durTxt(t.created_at, t.started_at)} en iniciar`} sx={{ fontWeight: 600 }} />
                )}
                {t.started_at && (
                  <Chip size="small" color={t.completed_at ? 'success' : 'warning'}
                    label={`⚙️ En proceso ${durTxt(t.started_at, t.completed_at || new Date().toISOString())}`} sx={{ fontWeight: 600 }} />
                )}
                {tt && <Chip size="small" icon={<AccessTimeIcon />} color={tt.done ? 'success' : 'default'}
                  label={tt.done ? `Total: ${fmtDur(tt.ms)}` : `${fmtDur(tt.ms)} transcurrido`} sx={{ fontWeight: 700 }} />}
                {t.completed_at && t.commitment_date && (
                  new Date(t.completed_at).getTime() <= new Date(t.commitment_date).getTime()
                    ? <Chip size="small" color="success" label="✅ A tiempo" sx={{ fontWeight: 700 }} />
                    : <Chip size="small" color="error" label="⚠️ Fuera de compromiso" sx={{ fontWeight: 700 }} />
                )}
              </Box>
            </Box>

            <Typography fontWeight={800} fontSize={14} sx={{ mb: 0.5 }}>Checklist {subs.length > 0 && `(${subs.length - pending}/${subs.length})`}</Typography>
            {subs.length > 0 && <LinearProgress variant="determinate" value={subs.length ? ((subs.length - pending) / subs.length) * 100 : 0} sx={{ mb: 1, borderRadius: 1 }} />}
            {subs.length === 0 ? <Typography variant="caption" color="text.secondary">Sin subtareas todavía.</Typography> :
              subs.map((s: any) => (
                <Box key={s.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, py: 0.25 }}>
                  <Checkbox size="small" checked={!!s.done} onChange={() => toggleSub(s)} disabled={t.status === 'completed'} sx={{ p: 0.5 }} />
                  <Typography variant="body2" sx={{ flex: 1, textDecoration: s.done ? 'line-through' : 'none', color: s.done ? 'text.disabled' : 'text.primary' }}>{s.body}</Typography>
                </Box>
              ))}
            {t.status !== 'completed' && (
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <TextField fullWidth size="small" placeholder="Nueva subtarea…" value={newSub} onChange={e => setNewSub(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSub(); }} />
                <Button variant="outlined" size="small" onClick={addSub} disabled={!newSub.trim()} sx={{ textTransform: 'none', borderColor: '#D6521C', color: '#D6521C' }}>Agregar</Button>
              </Box>
            )}

            {/* Archivos (fotos, PDF, Excel…) */}
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography fontWeight={800} fontSize={14}>Archivos {(data.attachments || []).length > 0 && `(${(data.attachments || []).length})`}</Typography>
              <Button component="label" size="small" startIcon={<AttachFileIcon />} sx={{ textTransform: 'none' }}>
                Agregar archivo
                <input hidden type="file" accept={ACCEPT_FILES} multiple onChange={e => uploadPhotos(e.target.files)} />
              </Button>
            </Box>
            {(data.attachments || []).length === 0 ? (
              <Typography variant="caption" color="text.secondary">Sin archivos.</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                {(data.attachments || []).map((a: any) => (
                  <Box key={a.id} sx={{ position: 'relative' }}>
                    <a href={a.url || '#'} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                      {isImg(a.file_name) ? (
                        <Box component="img" src={a.url} alt={a.file_name || 'foto'} sx={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 1, border: '1px solid #ddd' }} />
                      ) : (
                        <Box sx={{ width: 130, height: 80, borderRadius: 1, border: '1px solid #ddd', p: 0.75, display: 'flex', flexDirection: 'column', justifyContent: 'center', bgcolor: '#FAFAFA' }}>
                          <Typography sx={{ fontSize: 24, lineHeight: 1 }}>{fileIcon(a.file_name)}</Typography>
                          <Typography variant="caption" color="text.primary" noWrap title={a.file_name}>{a.file_name}</Typography>
                          <Typography variant="caption" color="primary">Abrir</Typography>
                        </Box>
                      )}
                    </a>
                    <IconButton size="small" onClick={() => deletePhoto(a.id)} sx={{ position: 'absolute', top: -8, right: -8, bgcolor: '#fff', boxShadow: 1, p: 0.2, '&:hover': { bgcolor: '#fff' } }}>
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            )}

            <Divider sx={{ my: 2 }} />
            <Typography fontWeight={800} fontSize={14} sx={{ mb: 1 }}>Comentarios</Typography>
            {(data.comments || []).map((c: any) => (
              <Box key={c.id} sx={{ mb: 1 }}>
                <Typography variant="caption" color="text.secondary"><b>{c.author_name || '—'}</b> · {fmtDate(c.created_at)}</Typography>
                <Typography variant="body2">{c.body}</Typography>
              </Box>
            ))}
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <TextField fullWidth size="small" placeholder="Deja un comentario…" value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addComment(); }} />
              <IconButton color="primary" onClick={addComment}><SendIcon /></IconButton>
            </Box>

            <Divider sx={{ my: 2 }} />
            <Typography fontWeight={800} fontSize={14} sx={{ mb: 1 }}>Historial de la tarea</Typography>
            {(data.activity || []).length === 0 ? (
              <Typography variant="caption" color="text.secondary">Sin actividad.</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {(data.activity || []).map((a: any) => (
                  <Box key={a.id} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: a.action === 'completed' ? '#2E7D46' : '#D6521C', mt: 0.75, flex: 'none' }} />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2">{actLabel(a)}</Typography>
                      <Typography variant="caption" color="text.secondary">{a.actor_name || '—'} · {fmtDate(a.created_at)}</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            {t.status !== 'completed' && !t.started_at && (
              <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={openStart} disabled={busy}
                sx={{ bgcolor: '#B07206', '&:hover': { bgcolor: '#8F5D05' } }}>
                Poner en proceso
              </Button>
            )}
            {t.status !== 'completed' && t.started_at && (
              <Button variant="contained" color="success" startIcon={<CheckCircleIcon />} onClick={complete} disabled={busy || pending > 0}>
                {pending > 0 ? `Completa el checklist (${pending})` : 'Completar'}
              </Button>
            )}
            <Button onClick={onClose}>Cerrar</Button>
          </DialogActions>

          {/* Poner en proceso: fecha compromiso (default = fecha deseada) */}
          <Dialog open={startOpen} onClose={() => setStartOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontWeight: 800 }}>Poner en proceso</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Indica la <b>fecha compromiso</b> para terminar la tarea. Viene precargada con la fecha deseada; puedes cambiarla.
              </Typography>
              <TextField fullWidth size="small" type="datetime-local" label="Fecha compromiso" InputLabelProps={{ shrink: true }}
                value={commitDate} onChange={e => setCommitDate(e.target.value)} />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setStartOpen(false)}>Cancelar</Button>
              <Button variant="contained" onClick={() => start()} disabled={busy} sx={{ bgcolor: '#B07206', '&:hover': { bgcolor: '#8F5D05' } }}>
                Iniciar
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </Dialog>
  );
}
