import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Box, Typography, Paper, IconButton, Button, Chip, Avatar, AvatarGroup,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, CircularProgress,
  Autocomplete, Checkbox, Snackbar, Alert, Stack, ToggleButton, ToggleButtonGroup,
  FormControlLabel, Switch,
} from '@mui/material';
import {
  ChevronLeft as PrevIcon, ChevronRight as NextIcon, Add as AddIcon, Close as CloseIcon,
  Event as EventIcon, Assignment as TaskIcon, Edit as EditIcon, Delete as DeleteIcon,
  Place as PlaceIcon, Today as TodayIcon,
} from '@mui/icons-material';

const ORANGE = '#F05A28';
const EVENT_COLOR = '#1565C0';
const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const H = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } });

// Color de tarea por prioridad Eisenhower.
const EIS_COLOR: Record<string, string> = { fuego: '#C62828', estrella: '#F09300', programar: '#2E7D46', eliminar: '#8A8A8A' };
const EIS_LABEL: Record<string, string> = { fuego: 'Urgente', estrella: 'Importante', programar: 'Atención', eliminar: 'Algún día' };

// Grupos de involucrados (igual que en Tareas).
const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Administración', admin: 'Administración', director: 'Dirección', finanzas: 'Finanzas',
  accountant: 'Contabilidad', abogado: 'Legal', branch_manager: 'Operación CEDIS', operaciones: 'Operaciones',
  warehouse_ops: 'Bodega', counter_staff: 'Mostrador', customer_service: 'Servicio a cliente',
  soporte_tecnico: 'Soporte técnico', advisor: 'Asesores', sub_advisor: 'Sub-asesores',
  repartidor: 'Repartidores', monitoreo: 'Monitoreo',
};
const roleGroup = (r?: string): string => ROLE_LABEL[String(r || '')] || (r ? r : 'Otros');

interface UserOpt { id: number; full_name: string; role?: string; }
interface Participant { user_id: number; full_name: string; role?: string; }
interface CalEvent {
  id: number; title: string; description?: string | null; location?: string | null;
  start_at: string; end_at?: string | null; all_day: boolean; color?: string | null;
  created_by?: number; created_by_name?: string; participants: Participant[];
}
interface CalTask { id: number; title: string; eisenhower: string; status: string; date: string; is_commitment: boolean; board_name?: string; assignee_name?: string; }

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Clave local YYYY-MM-DD de una fecha (para agrupar por día en tz local).
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
// ISO (UTC) → valor para <input type="datetime-local"> en hora local.
const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
const initials = (n: string) => n.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2);

export default function CalendarioPage() {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [tasks, setTasks] = useState<CalTask[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'both' | 'events' | 'tasks'>('both');
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' });
  const notify = (msg: string, sev: 'success' | 'error' = 'success') => setSnack({ open: true, msg, sev });

  const [dayOpen, setDayOpen] = useState<Date | null>(null);
  const [editEvent, setEditEvent] = useState<CalEvent | 'new' | null>(null);
  const [viewTask, setViewTask] = useState<CalTask | null>(null);

  // Rango visible del grid (6 semanas desde el domingo previo al 1° del mes).
  const gridStart = useMemo(() => addDays(startOfMonth(cursor), -startOfMonth(cursor).getDay()), [cursor]);
  const gridDays = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = dayKey(gridStart);
      const to = dayKey(addDays(gridStart, 41));
      const r = await axios.get(`${API_URL}/calendar/feed?from=${from}&to=${to}`, H());
      setEvents(r.data?.events || []);
      setTasks(r.data?.tasks || []);
    } catch (e: any) { notify(e?.response?.data?.error || 'No se pudo cargar el calendario', 'error'); }
    finally { setLoading(false); }
  }, [gridStart]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { axios.get(`${API_URL}/tasks/assignable-users`, H()).then(r => setUsers(r.data?.users || [])).catch(() => {}); }, []);

  // Índice día → items (respetando el filtro).
  const byDay = useMemo(() => {
    const map: Record<string, { events: CalEvent[]; tasks: CalTask[] }> = {};
    const bucket = (k: string) => (map[k] ||= { events: [], tasks: [] });
    if (filter !== 'tasks') {
      for (const e of events) {
        // Un evento puede abarcar varios días (start→end).
        const s = new Date(e.start_at); const en = e.end_at ? new Date(e.end_at) : s;
        let d = new Date(s.getFullYear(), s.getMonth(), s.getDate());
        const last = new Date(en.getFullYear(), en.getMonth(), en.getDate());
        for (let guard = 0; d <= last && guard < 60; guard++, d = addDays(d, 1)) bucket(dayKey(d)).events.push(e);
      }
    }
    if (filter !== 'events') {
      for (const t of tasks) bucket(dayKey(new Date(t.date))).tasks.push(t);
    }
    return map;
  }, [events, tasks, filter]);

  const todayKey = dayKey(new Date());

  return (
    <Box>
      {/* Encabezado */}
      <Paper sx={{ p: 2, mb: 2, borderRadius: 2, borderLeft: `4px solid ${ORANGE}` }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} justifyContent="space-between">
          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton onClick={() => setCursor(c => addMonths(c, -1))}><PrevIcon /></IconButton>
            <Typography variant="h6" sx={{ fontWeight: 800, minWidth: 200, textAlign: 'center' }}>
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </Typography>
            <IconButton onClick={() => setCursor(c => addMonths(c, 1))}><NextIcon /></IconButton>
            <Button size="small" startIcon={<TodayIcon />} onClick={() => setCursor(startOfMonth(new Date()))} sx={{ textTransform: 'none' }}>Hoy</Button>
          </Stack>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <ToggleButtonGroup size="small" exclusive value={filter} onChange={(_, v) => v && setFilter(v)}>
              <ToggleButton value="both" sx={{ textTransform: 'none' }}>Eventos y tareas</ToggleButton>
              <ToggleButton value="events" sx={{ textTransform: 'none' }}>Solo eventos</ToggleButton>
              <ToggleButton value="tasks" sx={{ textTransform: 'none' }}>Solo tareas</ToggleButton>
            </ToggleButtonGroup>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditEvent('new')}
              sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d64d1e' }, whiteSpace: 'nowrap' }}>Nuevo evento</Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Grid del mes */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
        {loading && <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(255,255,255,.5)', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: ORANGE }} /></Box>}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', bgcolor: '#F5F5F5' }}>
          {WEEKDAYS.map(w => (
            <Typography key={w} sx={{ textAlign: 'center', fontWeight: 700, fontSize: 12, py: 0.75, color: 'text.secondary' }}>{w}</Typography>
          ))}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {gridDays.map((d, i) => {
            const k = dayKey(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = k === todayKey;
            const cell = byDay[k] || { events: [], tasks: [] };
            const items: Array<{ kind: 'event' | 'task'; e?: CalEvent; t?: CalTask }> = [
              ...cell.events.map(e => ({ kind: 'event' as const, e })),
              ...cell.tasks.map(t => ({ kind: 'task' as const, t })),
            ];
            const shown = items.slice(0, 3);
            const extra = items.length - shown.length;
            return (
              <Box key={i} onClick={() => setDayOpen(d)}
                sx={{
                  minHeight: 104, p: 0.5, borderRight: '1px solid #eee', borderBottom: '1px solid #eee',
                  bgcolor: inMonth ? '#fff' : '#FAFAFA', cursor: 'pointer', '&:hover': { bgcolor: '#FFF7F3' },
                  display: 'flex', flexDirection: 'column', gap: 0.3,
                }}>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Box sx={{
                    width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: isToday ? 800 : 500,
                    bgcolor: isToday ? ORANGE : 'transparent', color: isToday ? '#fff' : (inMonth ? 'text.primary' : 'text.disabled'),
                  }}>{d.getDate()}</Box>
                </Box>
                {shown.map((it, idx) => it.kind === 'event' && it.e ? (
                  <Box key={`e${it.e.id}-${idx}`} onClick={ev => { ev.stopPropagation(); setEditEvent(it.e!); }}
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.4, px: 0.5, py: 0.2, borderRadius: 0.75, bgcolor: (it.e.color || EVENT_COLOR) + '22', borderLeft: `3px solid ${it.e.color || EVENT_COLOR}`, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: 10.5, fontWeight: 600, color: '#222' }}>
                      {!it.e.all_day && <b>{timeLabel(it.e.start_at)} </b>}{it.e.title}
                    </Typography>
                  </Box>
                ) : it.t ? (
                  <Box key={`t${it.t.id}-${idx}`} onClick={ev => { ev.stopPropagation(); setViewTask(it.t!); }}
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.4, px: 0.5, py: 0.2, borderRadius: 0.75, bgcolor: (EIS_COLOR[it.t.eisenhower] || '#888') + '22', borderLeft: `3px solid ${EIS_COLOR[it.t.eisenhower] || '#888'}`, minWidth: 0 }}>
                    <TaskIcon sx={{ fontSize: 11, color: EIS_COLOR[it.t.eisenhower] || '#888' }} />
                    <Typography noWrap sx={{ fontSize: 10.5, color: '#222', textDecoration: it.t.status === 'completed' ? 'line-through' : 'none' }}>{it.t.title}</Typography>
                  </Box>
                ) : null)}
                {extra > 0 && <Typography sx={{ fontSize: 10, color: 'text.secondary', pl: 0.5 }}>+{extra} más</Typography>}
              </Box>
            );
          })}
        </Box>
      </Paper>

      {/* Diálogo del día */}
      {dayOpen && (
        <DayDialog date={dayOpen} data={byDay[dayKey(dayOpen)] || { events: [], tasks: [] }} filter={filter}
          onClose={() => setDayOpen(null)}
          onNewEvent={() => { setEditEvent('new'); }}
          onOpenEvent={(e) => setEditEvent(e)} onOpenTask={(t) => setViewTask(t)} />
      )}

      {/* Crear / editar evento */}
      {editEvent && (
        <EventDialog value={editEvent === 'new' ? null : editEvent} users={users}
          defaultDate={dayOpen || cursor}
          onClose={() => setEditEvent(null)} onSaved={() => { setEditEvent(null); load(); }} notify={notify} />
      )}

      {/* Ver tarea (solo lectura) */}
      <Dialog open={!!viewTask} onClose={() => setViewTask(null)} maxWidth="xs" fullWidth>
        {viewTask && (
          <>
            <DialogTitle sx={{ fontWeight: 800 }}>
              <Chip size="small" label={EIS_LABEL[viewTask.eisenhower] || viewTask.eisenhower} sx={{ mr: 1, bgcolor: (EIS_COLOR[viewTask.eisenhower] || '#888') + '22', color: EIS_COLOR[viewTask.eisenhower], fontWeight: 700 }} />
              Tarea
              <IconButton onClick={() => setViewTask(null)} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
            </DialogTitle>
            <DialogContent>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>{viewTask.title}</Typography>
              <Typography variant="body2" color="text.secondary">📅 {viewTask.is_commitment ? 'Objetivo' : 'Fecha deseada'}: {new Date(viewTask.date).toLocaleString('es-MX')}</Typography>
              {viewTask.board_name && <Typography variant="body2" color="text.secondary">📋 {viewTask.board_name}</Typography>}
              {viewTask.assignee_name && <Typography variant="body2" color="text.secondary">👤 Responsable: {viewTask.assignee_name}</Typography>}
              {viewTask.status === 'completed' && <Chip size="small" color="success" label="Completada" sx={{ mt: 1 }} />}
            </DialogContent>
            <DialogActions><Button onClick={() => setViewTask(null)}>Cerrar</Button></DialogActions>
          </>
        )}
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack(s => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}

// ── Diálogo con los items de un día ──
function DayDialog({ date, data, filter, onClose, onNewEvent, onOpenEvent, onOpenTask }: {
  date: Date; data: { events: CalEvent[]; tasks: CalTask[] }; filter: 'both' | 'events' | 'tasks';
  onClose: () => void; onNewEvent: () => void; onOpenEvent: (e: CalEvent) => void; onOpenTask: (t: CalTask) => void;
}) {
  const evs = filter === 'tasks' ? [] : data.events;
  const tks = filter === 'events' ? [] : data.tasks;
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>
        {WEEKDAYS[date.getDay()]} {date.getDate()} de {MONTHS[date.getMonth()]}
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        {evs.length === 0 && tks.length === 0 && (
          <Typography variant="body2" color="text.disabled" sx={{ py: 2, textAlign: 'center', fontStyle: 'italic' }}>Sin eventos ni tareas este día.</Typography>
        )}
        <Stack spacing={1}>
          {evs.map(e => (
            <Paper key={`e${e.id}`} variant="outlined" onClick={() => { onClose(); onOpenEvent(e); }}
              sx={{ p: 1, borderLeft: `4px solid ${e.color || EVENT_COLOR}`, cursor: 'pointer', '&:hover': { boxShadow: 1 } }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <EventIcon sx={{ fontSize: 16, color: e.color || EVENT_COLOR }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 13.5 }} noWrap>{e.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{e.all_day ? 'Todo el día' : `${timeLabel(e.start_at)}${e.end_at ? ' – ' + timeLabel(e.end_at) : ''}`}{e.location ? ` · ${e.location}` : ''}</Typography>
                </Box>
                {e.participants?.length > 0 && (
                  <AvatarGroup max={3} sx={{ '& .MuiAvatar-root': { width: 22, height: 22, fontSize: 10 } }}>
                    {e.participants.map(p => <Avatar key={p.user_id} sx={{ bgcolor: EVENT_COLOR }}>{initials(p.full_name)}</Avatar>)}
                  </AvatarGroup>
                )}
              </Stack>
            </Paper>
          ))}
          {tks.map(t => (
            <Paper key={`t${t.id}`} variant="outlined" onClick={() => { onClose(); onOpenTask(t); }}
              sx={{ p: 1, borderLeft: `4px solid ${EIS_COLOR[t.eisenhower] || '#888'}`, cursor: 'pointer', '&:hover': { boxShadow: 1 } }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <TaskIcon sx={{ fontSize: 16, color: EIS_COLOR[t.eisenhower] || '#888' }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 13.5, textDecoration: t.status === 'completed' ? 'line-through' : 'none' }} noWrap>{t.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{timeLabel(t.date)} · {t.board_name || 'Tarea'}</Typography>
                </Box>
              </Stack>
            </Paper>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button startIcon={<AddIcon />} onClick={() => { onClose(); onNewEvent(); }} sx={{ color: ORANGE }}>Nuevo evento</Button>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Crear / editar evento ──
function EventDialog({ value, users, defaultDate, onClose, onSaved, notify }: {
  value: CalEvent | null; users: UserOpt[]; defaultDate: Date;
  onClose: () => void; onSaved: () => void; notify: (m: string, s?: 'success' | 'error') => void;
}) {
  const isEdit = !!value;
  const seedStart = value ? toLocalInput(value.start_at) : (() => { const d = new Date(defaultDate); d.setHours(9, 0, 0, 0); return toLocalInput(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString()); })();
  const [title, setTitle] = useState(value?.title || '');
  const [description, setDescription] = useState(value?.description || '');
  const [location, setLocation] = useState(value?.location || '');
  const [allDay, setAllDay] = useState(!!value?.all_day);
  const [start, setStart] = useState(seedStart);
  const [end, setEnd] = useState(value ? toLocalInput(value.end_at) : '');
  const [involved, setInvolved] = useState<number[]>(value?.participants?.map(p => p.user_id) || []);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const addGroup = (g: string) => setInvolved(prev => Array.from(new Set([...prev, ...users.filter(u => g === '__ALL__' || roleGroup(u.role) === g).map(u => u.id)])));
  const groups = Array.from(new Set(users.map(u => roleGroup(u.role)))).sort();

  const save = async () => {
    if (!title.trim()) { notify('El título es obligatorio', 'error'); return; }
    if (!start) { notify('Elige la fecha y hora de inicio', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(), description: description.trim() || null, location: location.trim() || null,
        start_at: new Date(start).toISOString(), end_at: end ? new Date(end).toISOString() : null,
        all_day: allDay, participant_ids: involved,
      };
      if (isEdit && value) await axios.put(`${API_URL}/calendar/events/${value.id}`, payload, H());
      else await axios.post(`${API_URL}/calendar/events`, payload, H());
      notify(isEdit ? 'Evento actualizado' : 'Evento creado');
      onSaved();
    } catch (e: any) { notify(e?.response?.data?.error || 'Error al guardar el evento', 'error'); }
    finally { setSaving(false); }
  };
  const del = async () => {
    if (!value) return;
    try { await axios.delete(`${API_URL}/calendar/events/${value.id}`, H()); notify('Evento eliminado'); onSaved(); }
    catch (e: any) { notify(e?.response?.data?.error || 'Error al eliminar', 'error'); }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>
        {isEdit ? 'Editar evento' : 'Nuevo evento'}
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth label="Título del evento" margin="dense" value={title} onChange={e => setTitle(e.target.value)} />
        <TextField fullWidth label="Descripción / detalles" margin="dense" multiline minRows={2} value={description} onChange={e => setDescription(e.target.value)} />
        <TextField fullWidth label="Lugar (opcional)" margin="dense" value={location} onChange={e => setLocation(e.target.value)}
          InputProps={{ startAdornment: <PlaceIcon sx={{ fontSize: 18, color: 'text.disabled', mr: 0.5 }} /> }} />
        <FormControlLabel sx={{ mt: 0.5 }} control={<Switch checked={allDay} onChange={e => setAllDay(e.target.checked)} />} label="Todo el día" />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 0.5 }}>
          <TextField fullWidth size="small" type={allDay ? 'date' : 'datetime-local'} label="Inicio" InputLabelProps={{ shrink: true }}
            value={allDay ? start.slice(0, 10) : start} onChange={e => setStart(allDay ? `${e.target.value}T00:00` : e.target.value)} />
          <TextField fullWidth size="small" type={allDay ? 'date' : 'datetime-local'} label="Fin (opcional)" InputLabelProps={{ shrink: true }}
            value={allDay ? (end ? end.slice(0, 10) : '') : end} onChange={e => setEnd(allDay ? (e.target.value ? `${e.target.value}T23:59` : '') : e.target.value)} />
        </Stack>

        {/* Involucrados */}
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 0.5 }}>👥 Involucrados</Typography>
          <Autocomplete
            multiple size="small" disableCloseOnSelect
            options={[...users].sort((a, b) => roleGroup(a.role).localeCompare(roleGroup(b.role)) || a.full_name.localeCompare(b.full_name))}
            value={users.filter(u => involved.includes(u.id))}
            onChange={(_, val) => setInvolved(val.map(u => u.id))}
            groupBy={u => roleGroup(u.role)}
            getOptionLabel={u => u.full_name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            filterOptions={(opts, { inputValue }) => { const q = inputValue.trim().toLowerCase(); return q ? opts.filter(u => u.full_name.toLowerCase().includes(q) || roleGroup(u.role).toLowerCase().includes(q)) : opts; }}
            renderOption={(props, u) => (<li {...props} key={u.id}><Checkbox size="small" checked={involved.includes(u.id)} sx={{ mr: 1, p: 0.5 }} /><Typography variant="body2">{u.full_name}</Typography></li>)}
            renderInput={params => <TextField {...params} label="Agregar personas" placeholder="Buscar por nombre o tipo…" />}
          />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
            <Chip label="👥 Todos los empleados" size="small" onClick={() => addGroup('__ALL__')} sx={{ bgcolor: '#FFF3EC', color: ORANGE, fontWeight: 700, border: '1px solid #F0B79A' }} />
            {groups.map(g => <Chip key={g} label={`+ ${g}`} size="small" variant="outlined" onClick={() => addGroup(g)} sx={{ fontWeight: 600, borderColor: '#ddd' }} />)}
          </Box>
          <Typography variant="caption" color="text.secondary">Los involucrados verán este evento en su calendario.</Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {isEdit && <Button color="error" startIcon={<DeleteIcon />} onClick={() => setConfirmDel(true)} sx={{ mr: 'auto' }}>Eliminar</Button>}
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={save} disabled={saving} startIcon={isEdit ? <EditIcon /> : <AddIcon />} sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d64d1e' } }}>{isEdit ? 'Guardar' : 'Crear'}</Button>
      </DialogActions>
      <Dialog open={confirmDel} onClose={() => setConfirmDel(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Eliminar evento</DialogTitle>
        <DialogContent><Typography variant="body2" color="text.secondary">¿Eliminar «{title}»? No se puede deshacer.</Typography></DialogContent>
        <DialogActions><Button onClick={() => setConfirmDel(false)}>Cancelar</Button><Button color="error" variant="contained" onClick={del}>Eliminar</Button></DialogActions>
      </Dialog>
    </Dialog>
  );
}
