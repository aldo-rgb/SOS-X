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
  Autocomplete, Paper, InputAdornment,
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
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import SearchIcon from '@mui/icons-material/Search';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const getToken = () => localStorage.getItem('token') || '';
const H = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });
const ME = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
const MY_ID = Number(ME?.id) || 0;
// Los asesores no pueden involucrar a otras personas al crear una tarea.
const IS_ASESOR = ['advisor', 'sub_advisor', 'asesor', 'asesor_lider'].includes(String(ME?.role || ''));
// Alias de visualización en la sección de Tareas: Aldo Campos (Super Admin) se
// muestra como "Sistemas".
const displayTaskName = (name?: string | null): string => (String(name || '').trim() === 'Aldo Campos' ? 'Sistemas' : String(name || ''));

const RECUR_LABEL: Record<string, string> = { none: 'Una vez', daily: 'Diaria', weekly: 'Semanal', monthly: 'Mensual', monthly_weekday: 'Mensual (día de semana)' };
const ORDINAL_LABEL: Record<number, string> = { 1: 'Primer', 2: 'Segundo', 3: 'Tercer', 4: 'Cuarto', [-1]: 'Último' };
const WEEKDAY_LABEL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const schedLabel = (s: any): string => s.recurrence === 'monthly_weekday' && s.recur_ordinal != null
  ? `${ORDINAL_LABEL[s.recur_ordinal] || ''} ${WEEKDAY_LABEL[s.recur_weekday] || ''} del mes`.trim()
  : (RECUR_LABEL[s.recurrence] || 'Una vez');

// Adjuntos: fotos + documentos (PDF, Excel, Word, CSV, texto).
const ACCEPT_FILES = [
  // Imágenes
  'image/*',
  // PDF
  '.pdf', 'application/pdf',
  // Word
  '.doc', '.docx',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // Excel
  '.xls', '.xlsx', '.csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  // PowerPoint
  '.ppt', '.pptx',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Texto plano / RTF
  '.txt', '.rtf',
  'text/plain',
  'application/rtf',
].join(',');
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
  delegar:  { label: '🔄 Urgente y no importante',    short: '🔄 Atención', color: '#B07206', bg: '#F7ECD5' },
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

// Paleta de colores para autores de comentarios (estilo WhatsApp). Cada usuario
// obtiene un color estable a partir de su id — así en un hilo con varios
// participantes no se confunden entre sí (antes salían todos en morado).
const AUTHOR_COLOR_PALETTE = [
  '#1976D2', '#7B1FA2', '#2E7D32', '#EF6C00', '#C2185B',
  '#00838F', '#5D4037', '#455A64', '#AD1457', '#0288D1',
  '#388E3C', '#F57C00', '#5E35B1', '#00695C', '#BF360C',
];
const authorColor = (id?: number | string | null, name?: string | null): string => {
  const key = String(id ?? name ?? '').trim();
  if (!key) return AUTHOR_COLOR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AUTHOR_COLOR_PALETTE[hash % AUTHOR_COLOR_PALETTE.length];
};
// Milisegundos HÁBILES entre dos momentos: solo cuenta el horario laboral
// 10:30–18:30 (hora de México, UTC−6 fijo) de lunes a viernes. No cuenta
// noches ni fines de semana. Se usa para el "tiempo en curso" de las tareas.
const MX_OFFSET_MS = 6 * 3600 * 1000; // México sin horario de verano (UTC−6)
const BIZ_START_MS = (10 * 60 + 30) * 60000; // 10:30
const BIZ_END_MS = (18 * 60 + 30) * 60000;   // 18:30
const businessMs = (startMs: number, endMs: number): number => {
  if (!isFinite(startMs) || !isFinite(endMs) || endMs <= startMs) return 0;
  // Desplazar a "hora local MX" para usar métodos UTC como si fueran locales.
  const s = startMs - MX_OFFSET_MS;
  const e = endMs - MX_OFFSET_MS;
  const first = new Date(s);
  let day = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
  let total = 0;
  for (; day <= e; day += 86400000) {
    const dow = new Date(day).getUTCDay(); // 0=dom … 6=sáb
    if (dow === 0 || dow === 6) continue;
    const winStart = day + BIZ_START_MS;
    const winEnd = day + BIZ_END_MS;
    const ov = Math.min(e, winEnd) - Math.max(s, winStart);
    if (ov > 0) total += ov;
  }
  return total;
};
const taskTime = (t: any) => {
  if (!t?.created_at) return null;
  const start = new Date(t.created_at).getTime();
  // En espera de confirmación el reloj se CONGELA (en el momento en que se mandó
  // a espera = updated_at). Se reanuda si un comentario la regresa a pendientes.
  const awaiting = t.status === 'awaiting_confirmation';
  const end = t.completed_at ? new Date(t.completed_at).getTime()
    : (awaiting && t.updated_at ? new Date(t.updated_at).getTime() : Date.now());
  return { done: !!t.completed_at, paused: awaiting, ms: businessMs(start, end) };
};
const ACT_LABEL: Record<string, string> = {
  created: '📌 Creó la tarea', assigned: '👤 Reasignó la tarea', moved: '➡️ Movió de columna',
  started: '▶️ Puso en proceso', completed: '✅ Completó la tarea', forced_close: '🔓 Forzó el cierre', reopened: '↩️ Reabrió la tarea',
  comment: '💬 Comentó', subtask_done: '☑️ Palomeó una subtarea', subtask_undone: '⬜ Despalomeó una subtarea',
  attachment_added: '📷 Agregó una foto',
};
const actLabel = (a: any): string => ACT_LABEL[a.action] || a.action;

// Folio de ticket de soporte (TKT-2026-1919, TKT-ACQ-123-456, …). Se usa para
// convertir en hipervínculo la referencia dentro del título/descripción de las
// tareas que nacen de "Reportar error" ("Error localizado {folio}").
const TICKET_FOLIO_RE = /TKT-[A-Za-z0-9]+-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g;
const openTicketByFolio = (folio: string) => {
  // Navega al Centro de Soporte y abre el ticket (App.tsx escucha este evento).
  window.dispatchEvent(new CustomEvent('branch-manager-quick-nav', {
    detail: { action: 'service_tickets', ticketFolio: folio },
  }));
};
// Renderiza `text` dejando los folios TKT-… como enlaces al ticket.
const LinkifyTickets = ({ text, onNavigate }: { text?: string | null; onNavigate?: () => void }) => {
  const src = String(text || '');
  const parts: any[] = [];
  const re = new RegExp(TICKET_FOLIO_RE.source, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) parts.push(src.slice(last, m.index));
    const folio = m[0];
    parts.push(
      <Box component="span" key={`${m.index}-${folio}`} role="link" tabIndex={0}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); openTicketByFolio(folio); onNavigate?.(); }}
        sx={{ color: '#D6521C', fontWeight: 800, textDecoration: 'underline', cursor: 'pointer', '&:hover': { color: '#B23F12' } }}>
        {folio}
      </Box>
    );
    last = m.index + folio.length;
  }
  if (last < src.length) parts.push(src.slice(last));
  return <>{parts}</>;
};

interface Task {
  id: number; title: string; description?: string; eisenhower: string; status: string;
  started_at?: string; updated_at?: string;
  due_at?: string; created_at?: string; completed_at?: string; assignee_name?: string; assignee_id?: number; board_id?: number;
  board_name?: string; board_key?: string; column_name?: string; subtasks_total?: number; subtasks_done?: number; overdue?: boolean;
  participants_count?: number; participant_names?: string[] | null; unread_count?: number;
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
  // Grupos presentes (para agregar a todos de un tipo de una vez).
  const groups = Array.from(new Set(users.filter(u => u.id !== fixedId).map(u => roleGroup(u.role)))).sort();
  const addGroup = (group: string) => {
    const ids = users
      .filter(u => u.id !== fixedId && (group === '__ALL__' || roleGroup(u.role) === group))
      .map(u => u.id);
    setInvolvedIds(Array.from(new Set([...involvedIds, ...(fixedId ? [fixedId] : []), ...ids])));
  };
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
      {/* Agregar por grupo */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
        <Chip label="👥 Todos los empleados" size="small" onClick={() => addGroup('__ALL__')}
          sx={{ bgcolor: '#FFF3EC', color: '#D6521C', fontWeight: 700, border: '1px solid #F0B79A' }} />
        {groups.map(g => (
          <Chip key={g} label={`+ ${g}`} size="small" variant="outlined" onClick={() => addGroup(g)}
            sx={{ fontWeight: 600, borderColor: '#ddd' }} />
        ))}
      </Box>
    </Box>
  );
}

export default function MisTareasPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [eventDetail, setEventDetail] = useState<any | null>(null);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'matrix'>('list');
  // Vista global (todas en las que estoy involucrado) vs solo mis tareas
  // (responsable, con comentarios sin leer, o esperando mi confirmación).
  const [globalView, setGlobalView] = useState(false);
  const [showDone, setShowDone] = useState(false);
  // Tareas personales ocultas en horario laboral (10am–7pm); toggle apagado por
  // default cada vez que se entra a la pantalla (no se persiste).
  const [showPersonal, setShowPersonal] = useState(false);
  // Filtro por categoría (tablero). 'all' = todas.
  const [catFilter, setCatFilter] = useState<number | 'all'>('all');
  // 🔍 Bandeja de búsqueda de texto: filtra por título, descripción, categoría,
  // responsable, involucrados o id (T-XXX). Se normaliza sin acentos para
  // que "cotizacion" encuentre "cotización", etc.
  const [searchText, setSearchText] = useState('');
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' });
  const notify = (msg: string, sev: 'success' | 'error' = 'success') => setSnack({ open: true, msg, sev });

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<any>({ title: '', description: '', eisenhower: '', due_at: '' });
  const [creating, setCreating] = useState(false); // anti doble-envío
  const [involvedIds, setInvolvedIds] = useState<number[]>(MY_ID ? [MY_ID] : []);
  // Responsable principal de la nueva tarea. Se pide OBLIGATORIO cuando el
  // creador involucra a alguien más (además de sí mismo). Debe ser uno de los
  // involucrados. 0 = sin elegir.
  const [newAssigneeId, setNewAssigneeId] = useState<number>(0);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Array<{ id: number; name: string; board_key?: string; sections?: Array<{ id: number; name: string }> }>>([]);
  const [catId, setCatId] = useState<number | ''>(''); // '' = sin elegir (obligatorio); 0 = Personal
  const [catSection, setCatSection] = useState<number | ''>(''); // subsección elegida
  const [newSubtasks, setNewSubtasks] = useState<string[]>([]); // checklist al crear
  const [subInput, setSubInput] = useState('');

  // Auto-limpia el responsable si ya no está entre los involucrados (p. ej. lo
  // quitó del picker). Auto-selecciona al primer involucrado distinto de "yo"
  // apenas aparece uno para no obligar al usuario a un clic extra — pero el
  // creador sigue teniendo que confirmarlo o cambiarlo antes de enviar.
  useEffect(() => {
    const others = involvedIds.filter(id => id && id !== MY_ID);
    if (newAssigneeId && !involvedIds.includes(newAssigneeId)) setNewAssigneeId(0);
    else if (!newAssigneeId && others.length > 0) setNewAssigneeId(others[0]);
    else if (others.length === 0 && newAssigneeId !== 0) setNewAssigneeId(0);
  }, [involvedIds, newAssigneeId]);

  // Programar tareas (futuras / recurrentes).
  const [schedOpen, setSchedOpen] = useState(false);
  const [schedForm, setSchedForm] = useState<any>({ title: '', description: '', eisenhower: 'estrella', first_run_at: '', recurrence: 'none' });
  const [schedInvolved, setSchedInvolved] = useState<number[]>(MY_ID ? [MY_ID] : []);
  const [schedules, setSchedules] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      // Traemos SIEMPRE todas (all=true) para que la búsqueda pueda encontrar
      // completadas aunque "Ver completadas" esté apagado. En la vista normal
      // filtramos las 'completed' del lado cliente cuando showDone=false.
      const r = await axios.get(`${API_URL}/tasks/mine?all=true`, H());
      setTasks(r.data?.tasks || []);
      setEvents(r.data?.events || []);
    } catch { notify('No se pudieron cargar las tareas', 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Drag & drop en la Matriz Eisenhower: arrastrar una tarjeta a otro cuadrante
  // cambia su prioridad (eisenhower). Actualización optimista para respuesta inmediata.
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const moveTaskToQuadrant = async (taskId: number, eis: string) => {
    const cur = tasks.find(t => t.id === taskId);
    if (!cur || cur.eisenhower === eis) return;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, eisenhower: eis } : t));
    try { await axios.put(`${API_URL}/tasks/${taskId}`, { eisenhower: eis }, H()); }
    catch { notify('No se pudo mover la tarea', 'error'); load(); }
  };

  // Abrir una tarea específica al llegar desde una notificación:
  //  • localStorage 'pending_open_task_id' → recién montado (venías de otra sección).
  //  • evento 'open-task-detail' → ya estabas en Mis Tareas.
  useEffect(() => {
    const pending = localStorage.getItem('pending_open_task_id');
    if (pending) { setDetailId(parseInt(pending)); localStorage.removeItem('pending_open_task_id'); }
    const h = (e: Event) => {
      const id = (e as CustomEvent<{ taskId: number }>).detail?.taskId;
      if (id) setDetailId(id);
    };
    window.addEventListener('open-task-detail', h as EventListener);
    return () => window.removeEventListener('open-task-detail', h as EventListener);
  }, []);
  useEffect(() => {
    axios.get(`${API_URL}/tasks/assignable-users`, H())
      .then(r => setUsers(r.data?.users || [])).catch(() => {});
    axios.get(`${API_URL}/tasks/categories`, H())
      .then(r => {
        // Excluye el tablero personal: se representa como "Sin categoría".
        const cats = (r.data?.categories || []).filter((c: any) => c.board_key !== 'personales');
        setCategories(cats);
      }).catch(() => {});
  }, []);

  const createTask = async () => {
    if (!form.title.trim()) return notify('El título es obligatorio', 'error');
    if (catId === '' || catId === null || catId === undefined) return notify('Selecciona una categoría', 'error');
    if (!form.eisenhower) return notify('Selecciona la prioridad', 'error');
    if (!form.due_at) return notify('Selecciona la fecha deseada', 'error');
    // Si el creador involucró a alguien más (aparte de "yo"), el responsable
    // es obligatorio y tiene que ser uno de los involucrados.
    const others = involvedIds.filter(id => id && id !== MY_ID);
    if (others.length > 0) {
      if (!newAssigneeId) return notify('Selecciona un responsable para la tarea', 'error');
      if (!involvedIds.includes(newAssigneeId)) return notify('El responsable debe estar entre los involucrados', 'error');
    }
    if (creating) return; // anti doble-click
    setCreating(true);
    try {
      const res = await axios.post(`${API_URL}/tasks/personal`, {
        title: form.title.trim(), description: form.description || null,
        eisenhower: form.eisenhower, involved_ids: involvedIds, due_at: form.due_at || null,
        board_id: catId || null, // 0/'' = Sin categoría → Tareas Personales
        section_id: catSection || null,
        subtasks: newSubtasks.filter(s => s.trim()).map(body => ({ body: body.trim() })),
        // Solo mandamos assignee_id cuando aplicó el picker (evita que el
        // backend sobreescriba su default cuando la tarea es 100% personal).
        ...(others.length > 0 && newAssigneeId ? { assignee_id: newAssigneeId } : {}),
      }, H());
      const newId = res.data?.task?.id;
      if (newId && newPhotos.length) {
        for (const f of newPhotos) {
          const fd = new FormData(); fd.append('photo', f);
          try { await axios.post(`${API_URL}/tasks/${newId}/attachments`, fd, { headers: { ...H().headers, 'Content-Type': 'multipart/form-data' } }); } catch { /* continúa */ }
        }
      }
      setCreateOpen(false);
      setForm({ title: '', description: '', eisenhower: '', due_at: '' });
      setCatId(''); setCatSection('');
      setInvolvedIds(MY_ID ? [MY_ID] : []); setNewAssigneeId(0); setNewPhotos([]);
      setNewSubtasks([]); setSubInput('');
      notify('Tarea creada');
      load();
    } catch (e: any) { notify(e?.response?.data?.error || 'Error al crear', 'error'); }
    finally { setCreating(false); }
  };

  const loadSchedules = useCallback(async () => {
    try { const r = await axios.get(`${API_URL}/tasks/schedules`, H()); setSchedules(r.data?.schedules || []); }
    catch { /* opcional */ }
  }, []);
  const emptySched = { title: '', description: '', eisenhower: 'estrella', first_run_at: '', recurrence: 'none', recur_ordinal: 1, recur_weekday: 1, time: '09:00', board_id: 0 as number, section_id: '' as number | '' };
  const openSchedule = () => {
    setSchedForm({ ...emptySched, board_id: 0 }); // 0 = Sin categoría
    setSchedInvolved(MY_ID ? [MY_ID] : []);
    setSchedOpen(true); loadSchedules();
  };
  const createSchedule = async () => {
    if (!schedForm.title.trim()) return notify('El título es obligatorio', 'error');
    const isWeekday = schedForm.recurrence === 'monthly_weekday';
    if (!isWeekday && !schedForm.first_run_at) return notify('Elige la fecha y hora de la primera tarea', 'error');
    try {
      const [hh, mm] = String(schedForm.time || '09:00').split(':');
      await axios.post(`${API_URL}/tasks/schedules`, {
        title: schedForm.title.trim(), description: schedForm.description || null,
        eisenhower: schedForm.eisenhower, involved_ids: schedInvolved, board_id: schedForm.board_id || null, section_id: schedForm.section_id || null,
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
          {t.status === 'awaiting_confirmation' && <Chip label="⏳ En espera" size="small" sx={{ height: 20, fontSize: 11, bgcolor: '#FBE9D0', color: '#B07206', fontWeight: 700 }} />}
          {(t.unread_count || 0) > 0 && <Chip label={`💬 ${t.unread_count} sin leer`} size="small" sx={{ height: 20, fontSize: 11, bgcolor: '#E53935', color: '#fff', fontWeight: 700 }} />}
        </Box>
        <Typography fontSize={13.5} fontWeight={600} sx={{ lineHeight: 1.3, textDecoration: done ? 'line-through' : 'none' }}>{t.title}</Typography>
        {(boardLabel || colLabel) && (
          <Typography fontSize={11} color="text.secondary" sx={{ mt: 0.25 }}>🗂️ {boardLabel}{colLabel ? ` · ${colLabel}` : ''}</Typography>
        )}
        {involved.length > 1 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
            {involved.map((name, i) => (
              <Tooltip key={i} title={i === 0 ? `${displayTaskName(name)} · Responsable` : displayTaskName(name)}>
                <Avatar sx={{ width: 22, height: 22, fontSize: 10, bgcolor: i === 0 ? '#D6521C' : '#5E35B1', border: i === 0 ? '2px solid #B07206' : 'none', fontWeight: i === 0 ? 800 : 400 }}>{initials(displayTaskName(name))}</Avatar>
              </Tooltip>
            ))}
            <Typography fontSize={11} color="text.secondary">{involved.length} involucrados</Typography>
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
          {involved.length <= 1 && t.assignee_name && <Tooltip title={displayTaskName(t.assignee_name)}><Avatar sx={{ width: 22, height: 22, fontSize: 10, bgcolor: '#D6521C' }}>{initials(displayTaskName(t.assignee_name))}</Avatar></Tooltip>}
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

  // Tarjeta compacta para la Matriz Eisenhower (los 4 cuadrantes caben en una pantalla).
  const renderMatrixCard = (t: Task) => {
    const done = t.status === 'completed';
    const boardLabel = t.board_key === 'personales'
      ? ((t.participants_count || 0) > 1 ? 'Asignadas' : 'Personal')
      : t.board_name;
    return (
      <Box key={t.id} onClick={() => setDetailId(t.id)}
        draggable
        onDragStart={e => { e.dataTransfer.setData('text/plain', String(t.id)); e.dataTransfer.effectAllowed = 'move'; }}
        sx={{ bgcolor: '#fff', borderRadius: 1, px: 0.75, py: 0.5, cursor: 'grab', border: '1px solid #E8DFD3',
          borderLeft: t.overdue ? '3px solid #C0392B' : '1px solid #E8DFD3', '&:hover': { boxShadow: 1 }, '&:active': { cursor: 'grabbing' }, opacity: done ? 0.6 : 1 }}>
        <Typography fontSize={12} fontWeight={600} sx={{ lineHeight: 1.25, textDecoration: done ? 'line-through' : 'none', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.title}</Typography>
        {t.status === 'awaiting_confirmation' && <Chip label="⏳ En espera" size="small" sx={{ height: 16, fontSize: 9.5, mt: 0.25, mr: 0.5, bgcolor: '#FBE9D0', color: '#B07206', fontWeight: 700, '& .MuiChip-label': { px: 0.6 } }} />}
        {(t.unread_count || 0) > 0 && <Chip label={`💬 ${t.unread_count}`} size="small" sx={{ height: 16, fontSize: 9.5, mt: 0.25, bgcolor: '#E53935', color: '#fff', fontWeight: 700, '& .MuiChip-label': { px: 0.6 } }} />}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
          {boardLabel && <Typography fontSize={10} color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>🗂️ {boardLabel}</Typography>}
          {(t.subtasks_total || 0) > 0 && <Typography fontSize={10} color={t.subtasks_done === t.subtasks_total ? 'success.main' : 'text.secondary'}>☑{t.subtasks_done}/{t.subtasks_total}</Typography>}
          {t.due_at && <Typography fontSize={10} color={t.overdue ? 'error.main' : 'text.secondary'}>{new Date(t.due_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</Typography>}
        </Box>
      </Box>
    );
  };

  // Tarea "personal" = tablero personal sin más involucrados (se muestra como "Personal").
  const isPersonalTask = (t: Task) => t.board_key === 'personales' && (t.participants_count || 0) <= 1;
  const nowHour = new Date().getHours();
  const isWorkHours = nowHour >= 10 && nowHour < 19; // 10am–7pm
  const hidePersonal = isWorkHours && !showPersonal;
  // Filtro de texto: quita acentos y compara en minúsculas contra
  // título, descripción, categoría (board), sección, responsable, involucrados y ID.
  const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const norm = (s: any) => stripAccents(String(s ?? '')).toLowerCase();
  const q = norm(searchText).trim();
  // Base: si NO hay búsqueda respetamos showDone (ocultamos completadas).
  // Cuando hay búsqueda dejamos todas (para poder encontrar terminadas).
  const dbSource = (showDone || q.length >= 2) ? tasks : tasks.filter(t => t.status !== 'completed');
  const personalOk = hidePersonal ? dbSource.filter(t => !isPersonalTask(t)) : dbSource;
  // Opciones de categoría presentes en las tareas (tablero).
  const boardOptions = Array.from(
    new Map(tasks.filter(t => t.board_id).map(t => [Number(t.board_id), t.board_name || 'Sin categoría'])).entries()
  ).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  const catTasks = catFilter === 'all' ? personalOk : personalOk.filter(t => Number(t.board_id) === catFilter);
  // "Solo mis tareas": soy responsable, o hay comentarios sin leer, o está en
  // espera de MI confirmación (yo la asigné). En global se muestran todas las
  // que /tasks/mine devuelve (donde estoy involucrado).
  const isMine = (t: Task) => Number(t.assignee_id) === MY_ID
    || (t.unread_count || 0) > 0
    || (t.status === 'awaiting_confirmation' && Number((t as any).created_by) === MY_ID);
  const mineTasks = globalView ? catTasks : catTasks.filter(isMine);
  const matchesSearch = (t: Task) => {
    if (!q) return true;
    const parts: string[] = [
      String(t.id),
      `t-${t.id}`,
      t.title || '',
      t.description || '',
      t.board_name || '',
      (t as any).section_name || '',
      t.assignee_name || '',
      ...((t.participant_names as string[] | null | undefined) || []),
    ];
    return parts.some(p => norm(p).includes(q));
  };
  // Cuando hay búsqueda, buscamos en TODAS las tareas del pool (/tasks/mine ya
  // devuelve las que soy responsable + participante). Si no hay búsqueda,
  // aplicamos el filtro "Solo mis tareas" (isMine). Los demás filtros
  // (categoría, personal, completadas) siempre se respetan porque forman
  // parte de personalOk/catTasks.
  const searchPool = q.length >= 2 ? catTasks : mineTasks;
  const visibleTasks = searchPool.filter(matchesSearch);
  // 🔎 "También encontrado en…": tareas que HACEN match pero que quedaron fuera
  // porque el usuario tiene la categoría filtrada o "personales" oculto.
  // Se calcula sobre el pool completo (tasks) para poder saltar a esas.
  const hiddenMatches = q.length >= 2 ? tasks.filter(t => matchesSearch(t) && !visibleTasks.some(v => v.id === t.id)) : [];
  // Un chip por tarea oculta con la razón de por qué está oculta (para dar contexto).
  const reasonFor = (t: Task): string => {
    if (t.status === 'completed' && !showDone) return 'Terminada';
    if (isPersonalTask(t) && hidePersonal) return 'Personal (oculta en horario)';
    if (catFilter !== 'all' && Number(t.board_id) !== catFilter) return `Categoría: ${t.board_name || '—'}`;
    return 'Oculta por filtros';
  };
  // Al hacer click abrimos la tarea Y ajustamos filtros para que quede visible.
  const openHidden = (t: Task) => {
    if (t.status === 'completed' && !showDone) setShowDone(true);
    if (isPersonalTask(t) && hidePersonal) setShowPersonal(true);
    if (catFilter !== 'all' && Number(t.board_id) !== catFilter) setCatFilter('all');
    setDetailId(t.id);
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
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setInvolvedIds(MY_ID ? [MY_ID] : []); setCatId(''); setCatSection(''); setCreateOpen(true); }} sx={{ bgcolor: '#D6521C', '&:hover': { bgcolor: '#B23F12' } }}>Nueva tarea</Button>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load}>Actualizar</Button>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
          <ToggleButton value="list" sx={{ textTransform: 'none', gap: 0.5 }}><ViewListIcon sx={{ fontSize: 18 }} /> Lista</ToggleButton>
          <ToggleButton value="matrix" sx={{ textTransform: 'none', gap: 0.5 }}><GridViewIcon sx={{ fontSize: 18 }} /> Matriz Eisenhower</ToggleButton>
        </ToggleButtonGroup>
        {/* Toggle: "Solo mis tareas" activo cuando globalView=false (filtro aplicado).
            Label fijo; el color contained indica que el filtro está ON. */}
        <Button
          size="small"
          variant={!globalView ? 'contained' : 'outlined'}
          onClick={() => setGlobalView(v => !v)}
          startIcon={<span>👤</span>}
          sx={{ textTransform: 'none', ...(!globalView
            ? { bgcolor: '#5E35B1', '&:hover': { bgcolor: '#4a2a8f' } }
            : { borderColor: '#5E35B1', color: '#5E35B1' }) }}
        >
          Solo mis tareas
        </Button>
        <Button
          size="small"
          variant={showDone ? 'contained' : 'outlined'}
          onClick={() => setShowDone(v => !v)}
          startIcon={<span>✅</span>}
          sx={{ textTransform: 'none', ...(showDone
            ? { bgcolor: '#2E7D46', '&:hover': { bgcolor: '#256B3B' } }
            : { borderColor: '#2E7D46', color: '#2E7D46' }) }}
        >
          Ver completadas
        </Button>
        {isWorkHours && (
          <Button
            size="small"
            variant={showPersonal ? 'contained' : 'outlined'}
            onClick={() => setShowPersonal(v => !v)}
            startIcon={<span>🏠</span>}
            sx={{ textTransform: 'none', ...(showPersonal
              ? { bgcolor: '#B07206', '&:hover': { bgcolor: '#8a5a05' } }
              : { borderColor: '#B07206', color: '#B07206' }) }}
          >
            Mostrar personales
          </Button>
        )}
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Categoría</InputLabel>
          <Select label="Categoría" value={catFilter} onChange={e => setCatFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <MenuItem value="all">Todas las categorías</MenuItem>
            {boardOptions.map(b => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
          </Select>
        </FormControl>
        {/* 🔍 Buscador de tareas por texto (título, descripción, categoría,
            responsable, involucrados, ID). Filtro de cliente sobre visibleTasks. */}
        <TextField
          size="small"
          placeholder="Buscar tarea…"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          sx={{ minWidth: 240, flex: 1, maxWidth: 380 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: '#666' }} />
              </InputAdornment>
            ),
            endAdornment: searchText ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearchText('')} aria-label="Limpiar búsqueda">
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          }}
        />
      </Box>

      {/* 🔎 Coincidencias ocultas por los filtros activos (categoría/mías/etc).
          Chips clickeables que ajustan el filtro y abren la tarea. */}
      {hiddenMatches.length > 0 && (
        <Alert severity="info" icon={<SearchIcon fontSize="small" />} sx={{ mb: 1.5, '& .MuiAlert-message': { width: '100%' } }}>
          <Typography fontSize={12.5} fontWeight={700} sx={{ mb: 0.5 }}>
            También encontrado en {hiddenMatches.length} tarea{hiddenMatches.length === 1 ? '' : 's'} oculta{hiddenMatches.length === 1 ? '' : 's'} por los filtros actuales:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
            {hiddenMatches.slice(0, 12).map(t => (
              <Tooltip key={t.id} title={reasonFor(t)} arrow>
                <Chip
                  size="small"
                  label={(t.title || '').length > 42 ? (t.title || '').slice(0, 40) + '…' : (t.title || '—')}
                  onClick={() => openHidden(t)}
                  sx={{
                    fontWeight: 600, fontSize: 11.5, cursor: 'pointer',
                    bgcolor: t.status === 'completed' ? '#E4F1E8' : '#FBE6D8',
                    color: t.status === 'completed' ? '#2E7D46' : '#B23F12',
                    '&:hover': { bgcolor: t.status === 'completed' ? '#C8E6C9' : '#F5D3B8' },
                  }}
                />
              </Tooltip>
            ))}
            {hiddenMatches.length > 12 && (
              <Chip size="small" label={`+${hiddenMatches.length - 12}`} sx={{ fontWeight: 700, fontSize: 11.5, bgcolor: '#EEE' }} />
            )}
          </Box>
        </Alert>
      )}

      {/* Eventos del calendario de HOY (para el usuario involucrado) */}
      {events.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1, color: '#1565C0' }}>
            📅 Hoy tienes {events.length} evento{events.length === 1 ? '' : 's'}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 1.5 }}>
            {events.map(ev => (
              <Paper key={ev.id} onClick={() => setEventDetail(ev)}
                sx={{ p: 1.5, borderRadius: 2, borderLeft: '4px solid #1565C0', cursor: 'pointer', bgcolor: '#F5F9FF', '&:hover': { boxShadow: 2 } }}>
                <Typography sx={{ fontWeight: 700, fontSize: 14 }} noWrap>{ev.title}</Typography>
                <Typography variant="caption" color="text.secondary">
                  🕒 {ev.all_day ? 'Todo el día' : new Date(ev.start_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  {ev.location ? ` · 📍 ${ev.location}` : ''}
                </Typography>
              </Paper>
            ))}
          </Box>
        </Box>
      )}

      {loading ? (
        <Box sx={{ textAlign: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : tasks.length === 0 && events.length === 0 ? (
        <Alert severity="success">No tienes tareas pendientes 🎉</Alert>
      ) : visibleTasks.length === 0 ? (
        personalOk.length === 0 && hidePersonal ? (
          <Alert severity="info" action={<Button size="small" color="inherit" onClick={() => setShowPersonal(true)}>Mostrar personales</Button>}>
            Tus tareas personales están ocultas durante el horario laboral (10am–7pm).
          </Alert>
        ) : (
          <Alert severity="info" action={<Button size="small" color="inherit" onClick={() => setCatFilter('all')}>Ver todas</Button>}>
            No hay tareas en esta categoría.
          </Alert>
        )
      ) : view === 'matrix' ? (
        // 2×2 fijo a la altura de la pantalla; cada cuadrante hace scroll interno.
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 1, height: 'calc(100vh - 210px)', minHeight: 440 }}>
          {QUADRANTS.map(q => {
            // Matriz Eisenhower: SOLO tareas donde el usuario es el responsable (assignee),
            // no en las que solo está involucrado.
            // Matriz: donde soy responsable + con comentarios sin leer (para notar respuestas pendientes).
            // Rango de orden (menor = más arriba): sin leer primero; luego las que
            // están en espera y ME toca confirmar (soy quien la asignó); luego lo
            // normal; y al fondo las en espera donde YO soy el que espera.
            const rank = (t: Task) => {
              if ((t.unread_count || 0) > 0) return 0;
              const iAssigned = Number((t as any).created_by) === MY_ID;
              if (t.status === 'awaiting_confirmation') return iAssigned ? 1 : 3;
              return 2;
            };
            const qt = visibleTasks.filter(t => t.eisenhower === q.key)
              .sort((a, b) => rank(a) - rank(b));
            const over = dragOverKey === q.key;
            return (
              <Box key={q.key}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverKey !== q.key) setDragOverKey(q.key); }}
                onDragLeave={() => setDragOverKey(k => (k === q.key ? null : k))}
                onDrop={e => { e.preventDefault(); setDragOverKey(null); const id = Number(e.dataTransfer.getData('text/plain')); if (id) moveTaskToQuadrant(id, q.key); }}
                sx={{ bgcolor: q.bg, borderRadius: 2, borderTop: `3px solid ${q.color}`, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                  outline: over ? `2px dashed ${q.color}` : 'none', outlineOffset: -2, transition: 'outline .12s' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.6, flexShrink: 0 }}>
                  <Typography fontWeight={800} fontSize={12.5} sx={{ flex: 1, color: q.color, lineHeight: 1.1 }} noWrap>{q.title}</Typography>
                  <Chip label={qt.length} size="small" sx={{ height: 18, fontSize: 11 }} />
                </Box>
                <Box sx={{ flex: 1, overflowY: 'auto', px: 0.75, pb: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {qt.length === 0 ? <Typography fontSize={11} color="text.disabled" sx={{ py: 1, textAlign: 'center' }}>—</Typography> : qt.map(renderMatrixCard)}
                </Box>
              </Box>
            );
          })}
        </Box>
      ) : (
        // Lista por estado en 4 columnas, cada una con su propio orden.
        (() => {
          const ms = (s?: string) => (s ? new Date(s).getTime() : 0);
          // Nueva: abierta y sin iniciar → la más nueva arriba.
          const nueva = visibleTasks.filter(t => t.status === 'open' && !t.started_at)
            .sort((a, b) => ms(b.created_at) - ms(a.created_at));
          // En proceso: abierta e iniciada → la más VIEJA puesta en proceso arriba.
          const proceso = visibleTasks.filter(t => t.status === 'open' && !!t.started_at)
            .sort((a, b) => ms(a.started_at) - ms(b.started_at));
          // En espera: la más RECIENTE puesta en espera va abajo (vieja arriba).
          const espera = visibleTasks.filter(t => t.status === 'awaiting_confirmation')
            .sort((a, b) => ms(a.updated_at) - ms(b.updated_at));
          // Terminadas: en orden de terminadas (más reciente arriba).
          const terminadas = visibleTasks.filter(t => t.status === 'completed')
            .sort((a, b) => ms(b.completed_at) - ms(a.completed_at));
          const cols = [
            { key: 'nueva', title: '🆕 Nueva', color: '#1D6FB8', bg: '#EAF3FB', tasks: nueva },
            { key: 'proceso', title: '⚙️ En proceso', color: '#B07206', bg: '#FBF3E5', tasks: proceso },
            { key: 'espera', title: '⏳ En espera de confirmación', color: '#C77800', bg: '#FBE9D0', tasks: espera },
            { key: 'done', title: '✅ Terminadas', color: '#2E7D46', bg: '#E9F5EE', tasks: terminadas },
          ];
          return (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 1, height: 'calc(100vh - 210px)', minHeight: 440 }}>
              {cols.map(c => (
                <Box key={c.key} sx={{ bgcolor: c.bg, borderRadius: 2, borderTop: `3px solid ${c.color}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.6, flexShrink: 0 }}>
                    <Typography fontWeight={800} fontSize={12.5} sx={{ flex: 1, color: c.color, lineHeight: 1.1 }} noWrap>{c.title}</Typography>
                    <Chip label={c.tasks.length} size="small" sx={{ height: 18, fontSize: 11 }} />
                  </Box>
                  <Box sx={{ flex: 1, overflowY: 'auto', px: 0.75, pb: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {c.tasks.length === 0 ? <Typography fontSize={11} color="text.disabled" sx={{ py: 1, textAlign: 'center' }}>—</Typography> : c.tasks.map(renderCard)}
                  </Box>
                </Box>
              ))}
            </Box>
          );
        })()
      )}

      {/* Detalle de evento (desde Mis Tareas) */}
      <Dialog open={!!eventDetail} onClose={() => setEventDetail(null)} maxWidth="xs" fullWidth>
        {eventDetail && (
          <>
            <DialogTitle sx={{ fontWeight: 800, color: '#1565C0' }}>📅 {eventDetail.title}</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary">
                🕒 {eventDetail.all_day ? 'Todo el día' : `${new Date(eventDetail.start_at).toLocaleString('es-MX')}${eventDetail.end_at ? ' – ' + new Date(eventDetail.end_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''}`}
              </Typography>
              {eventDetail.location && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>📍 {eventDetail.location}</Typography>}
              {eventDetail.description && <Typography variant="body2" sx={{ mt: 1 }}>{eventDetail.description}</Typography>}
            </DialogContent>
            <DialogActions><Button onClick={() => setEventDetail(null)}>Cerrar</Button></DialogActions>
          </>
        )}
      </Dialog>

      {/* Crear tarea personal */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Nueva tarea</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Título (usa un verbo de acción)" margin="dense"
            value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <FormControl fullWidth size="small" sx={{ mt: 1.5 }} required error={catId === ''}>
            <InputLabel>Categoría (flujo) *</InputLabel>
            <Select label="Categoría (flujo) *" value={catId} displayEmpty onChange={e => { setCatId(Number(e.target.value)); setCatSection(''); }}>
              <MenuItem value="" disabled><em>Selecciona una categoría…</em></MenuItem>
              <MenuItem value={0}>Personal</MenuItem>
              {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </Select>
          </FormControl>
          {(() => {
            const secs = categories.find(c => c.id === catId)?.sections || [];
            return secs.length > 0 ? (
              <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
                <InputLabel>Sub-sección</InputLabel>
                <Select label="Sub-sección" value={catSection} onChange={e => setCatSection(String(e.target.value) === '' ? '' : Number(e.target.value))}>
                  <MenuItem value="">Sin sub-sección</MenuItem>
                  {secs.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                </Select>
              </FormControl>
            ) : null;
          })()}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            «Personal» solo aparece en tu panel personal de Mis Tareas. Con otra categoría, la tarea aparece en ese flujo.
          </Typography>
          <TextField fullWidth label="Descripción" margin="dense" multiline rows={2}
            value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
            <FormControl fullWidth size="small" required error={!form.eisenhower}>
              <InputLabel>Prioridad (Eisenhower) *</InputLabel>
              <Select label="Prioridad (Eisenhower) *" value={form.eisenhower} displayEmpty onChange={e => setForm({ ...form, eisenhower: e.target.value })}>
                <MenuItem value="" disabled><em>Selecciona la prioridad…</em></MenuItem>
                {Object.entries(EIS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField fullWidth size="small" required type="datetime-local" label="Fecha deseada *" InputLabelProps={{ shrink: true }}
              error={!form.due_at}
              value={form.due_at} onChange={e => setForm({ ...form, due_at: e.target.value })} />
          </Box>
          {!IS_ASESOR && (<>
          <InvolvedPicker users={users} involvedIds={involvedIds} setInvolvedIds={setInvolvedIds} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Busca y agrega a varias personas (agrupadas por tipo). Tú siempre quedas incluido.
          </Typography>
          </>)}

          {/* Responsable — visible SOLO cuando hay al menos un involucrado
              distinto del creador. Obligatorio antes de crear la tarea. */}
          {involvedIds.filter(id => id && id !== MY_ID).length > 0 && (
            <FormControl fullWidth size="small" sx={{ mt: 1.5 }} required error={!newAssigneeId}>
              <InputLabel>Responsable *</InputLabel>
              <Select
                label="Responsable *"
                value={newAssigneeId || ''}
                onChange={e => setNewAssigneeId(Number(e.target.value))}
              >
                {involvedIds
                  .map(id => users.find(u => u.id === id))
                  .filter((u): u is UserOpt => !!u)
                  .map(u => (
                    <MenuItem key={u.id} value={u.id}>
                      {u.full_name}{u.id === MY_ID ? ' (yo)' : ''}
                    </MenuItem>
                  ))}
              </Select>
              <Typography variant="caption" color={newAssigneeId ? 'text.secondary' : 'error'} sx={{ mt: 0.5 }}>
                {newAssigneeId
                  ? 'Debe ser una persona involucrada. Si nadie es responsable, la tarea puede quedar en el aire.'
                  : 'Selecciona un responsable de la tarea.'}
              </Typography>
            </FormControl>
          )}

          {/* Checklist (subtareas) */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <ChecklistIcon fontSize="small" sx={{ color: '#D6521C' }} /> Checklist
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField fullWidth size="small" placeholder="Agregar punto del checklist…"
                value={subInput} onChange={e => setSubInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && subInput.trim()) { e.preventDefault(); setNewSubtasks(prev => [...prev, subInput.trim()]); setSubInput(''); } }} />
              <Button variant="outlined" size="small" onClick={() => { if (subInput.trim()) { setNewSubtasks(prev => [...prev, subInput.trim()]); setSubInput(''); } }}
                sx={{ whiteSpace: 'nowrap', borderColor: '#D6521C', color: '#D6521C' }}>Agregar</Button>
            </Box>
            {newSubtasks.length > 0 && (
              <Box sx={{ mt: 1 }}>
                {newSubtasks.map((s, idx) => (
                  <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, borderBottom: '1px solid #f0f0f0' }}>
                    <Typography variant="body2" sx={{ flex: 1 }}>☐ {s}</Typography>
                    <Button size="small" color="error" sx={{ minWidth: 0 }} onClick={() => setNewSubtasks(prev => prev.filter((_, i) => i !== idx))}>Quitar</Button>
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          {/* Archivos adjuntos (fotos, PDF, Excel…) */}
          <Box sx={{ mt: 2 }}>
            <Button component="label" size="small" startIcon={<AttachFileIcon />} sx={{ textTransform: 'none' }}>
              Agregar archivos (fotos, PDF, Word, Excel, PowerPoint)
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
          {(() => {
            const needsAssignee = involvedIds.filter(id => id && id !== MY_ID).length > 0;
            const disableCrear = creating || !form.title.trim() || catId === '' || !form.eisenhower || !form.due_at || (needsAssignee && !newAssigneeId);
            return (
              <Button
                variant="contained"
                onClick={createTask}
                disabled={disableCrear}
                startIcon={creating ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : undefined}
                sx={{ bgcolor: '#D6521C', '&:hover': { bgcolor: '#B23F12' } }}
              >
                {creating ? 'Creando…' : 'Crear'}
              </Button>
            );
          })()}
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
            <Select label="Categoría (flujo)" value={schedForm.board_id} onChange={e => setSchedForm({ ...schedForm, board_id: Number(e.target.value), section_id: '' })}>
              <MenuItem value={0}>Sin categoría (personal)</MenuItem>
              {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </Select>
          </FormControl>
          {(() => {
            const secs = categories.find(c => c.id === schedForm.board_id)?.sections || [];
            return secs.length > 0 ? (
              <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
                <InputLabel>Sub-sección</InputLabel>
                <Select label="Sub-sección" value={schedForm.section_id ?? ''} onChange={e => setSchedForm({ ...schedForm, section_id: String(e.target.value) === '' ? '' : Number(e.target.value) })}>
                  <MenuItem value="">Sin sub-sección</MenuItem>
                  {secs.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                </Select>
              </FormControl>
            ) : null;
          })()}
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
  // Bandera específica del envío de comentario: deshabilita el botón y muestra spinner
  // mientras la petición POST está en curso para evitar envíos múltiples.
  const [sendingComment, setSendingComment] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [commitDate, setCommitDate] = useState('');
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<any>({ title: '', description: '', eisenhower: 'estrella', due_at: '' });
  const [editInvolved, setEditInvolved] = useState<number[]>([]);
  const [editAssignee, setEditAssignee] = useState<number>(0); // responsable principal
  const [editCat, setEditCat] = useState<number>(0); // 0 = Sin categoría
  const [cats, setCats] = useState<Array<{ id: number; name: string; board_key?: string }>>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [delAttId, setDelAttId] = useState<number | null>(null); // confirmar borrar archivo
  const [procConfirm, setProcConfirm] = useState<{ title: string } | null>(null); // confirmar dejar otra pendiente
  const [forceConfirmOpen, setForceConfirmOpen] = useState(false); // pregunta doble: completar en espera sin revisión

  const reload = useCallback(async () => {
    try { const r = await axios.get(`${API_URL}/tasks/${id}`, H()); setData(r.data); } catch { /* */ }
  }, [id]);
  useEffect(() => { reload(); }, [reload]);

  // Cargar usuarios y categorías cuando el detalle es editable (para los selects inline).
  useEffect(() => {
    if (!data?.can_edit) return;
    if (users.length === 0) axios.get(`${API_URL}/tasks/assignable-users`, H()).then(r => setUsers(r.data?.users || [])).catch(() => {});
    if (cats.length === 0) axios.get(`${API_URL}/tasks/categories`, H()).then(r => setCats((r.data?.categories || []).filter((c: any) => c.board_key !== 'personales'))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.can_edit]);

  // Guarda un cambio parcial (prioridad, categoría, responsable, involucrados) sin modo edición.
  // "dirty" es solo para la sensación de guardado: cuando el usuario cambia algo
  // (que ya se guarda solo), el botón "Poner en proceso" se vuelve "Guardar".
  const [dirty, setDirty] = useState(false);
  const patch = async (payload: any) => {
    setBusy(true);
    try { await axios.put(`${API_URL}/tasks/${id}`, payload, H()); await reload(); onChanged(); setDirty(true); }
    catch (e: any) { notify(e?.response?.data?.error || 'No se pudo actualizar', 'error'); }
    finally { setBusy(false); }
  };

  const t = data?.task;
  const subs = data?.subtasks || [];
  const pending = subs.filter((s: any) => !s.done).length;
  const tt = t ? taskTime(t) : null;
  // Datos para edición inline en el detalle.
  const partIds: number[] = (data?.participants || []).map((p: any) => Number(p.id));
  const nameById = new Map<number, string>();
  (data?.participants || []).forEach((p: any) => nameById.set(Number(p.id), p.full_name));
  if (t?.created_by) nameById.set(Number(t.created_by), t.created_by_name || 'Creador');
  users.forEach(u => { if (!nameById.has(u.id)) nameById.set(u.id, u.full_name); });
  const nameOf = (uid2: number) => nameById.get(uid2) || `#${uid2}`;
  const respOptions = Array.from(new Set<number>([...(t?.created_by ? [Number(t.created_by)] : []), ...partIds, Number(t?.assignee_id) || 0].filter(Boolean)));
  const curCat = t?.board_key === 'personales' ? 0 : (Number(t?.board_id) || 0);
  const canInline = !!data?.can_edit && !editing && t?.status !== 'completed';

  const toggleSub = async (s: any) => {
    try { await axios.put(`${API_URL}/tasks/subtasks/${s.id}`, { done: !s.done }, H()); reload(); onChanged(); }
    catch (e: any) { notify(e?.response?.data?.error || 'Error', 'error'); }
  };
  const addSub = async () => {
    if (!newSub.trim()) return;
    try { await axios.post(`${API_URL}/tasks/${id}/subtasks`, { body: newSub.trim() }, H()); setNewSub(''); reload(); onChanged(); }
    catch (e: any) { notify(e?.response?.data?.error || 'No se pudo agregar', 'error'); }
  };
  const complete = async (force = false) => {
    if (pending > 0) { notify(`Completa el checklist antes de terminar (${pending} pendiente${pending === 1 ? '' : 's'}).`, 'error'); return; }
    setBusy(true);
    try {
      const res = await axios.post(`${API_URL}/tasks/${id}/complete`, force ? { force_confirm: true } : {}, H());
      // El backend responde con awaiting_confirmation=true cuando el
      // responsable termina una tarea que creó otra persona: queda en espera
      // de que el creador confirme. En ese caso NO cerramos el diálogo — el
      // creador la marca desde su propia acción.
      if (res.data?.awaiting_confirmation) {
        notify('Tarea marcada como terminada · esperando confirmación de quien la asignó', 'success');
        reload();
        onChanged();
      } else {
        notify('Tarea completada');
        onChanged();
        onClose();
      }
    } catch (e: any) {
      // Pregunta doble: la tarea ya está en espera y quien la cierra no es quien
      // la asignó → confirmar el cierre sin su revisión.
      if (e?.response?.status === 409 && e?.response?.data?.needs_force_confirm) {
        setBusy(false);
        setForceConfirmOpen(true); // abre el diálogo con diseño
        return;
      }
      notify(e?.response?.data?.error || 'No se pudo completar', 'error');
    }
    finally { setBusy(false); }
  };
  const reopen = async () => {
    setBusy(true);
    try {
      await axios.post(`${API_URL}/tasks/${id}/reopen`, {}, H());
      notify('Tarea reabierta');
      reload();
      onChanged();
    } catch (e: any) { notify(e?.response?.data?.error || 'No se pudo reabrir', 'error'); }
    finally { setBusy(false); }
  };
  const addComment = async () => {
    if (!comment.trim() || sendingComment) return;
    setSendingComment(true);
    try { const res = await axios.post(`${API_URL}/tasks/${id}/comments`, { body: comment.trim() }, H()); setComment(''); reload(); onChanged(); if (res.data?.reopened) notify('💬 Comentario agregado · la tarea volvió a pendientes', 'success'); }
    catch { notify('Error al comentar', 'error'); }
    finally { setSendingComment(false); }
  };
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const saveEditComment = async () => {
    if (!editingText.trim() || editingCommentId == null) return;
    try {
      await axios.patch(`${API_URL}/tasks/${id}/comments/${editingCommentId}`, { body: editingText.trim() }, H());
      setEditingCommentId(null); setEditingText(''); reload(); onChanged();
    } catch { notify('Error al editar comentario', 'error'); }
  };
  const deleteComment = async (commentId: number) => {
    if (!window.confirm('¿Borrar este comentario?')) return;
    try { await axios.delete(`${API_URL}/tasks/${id}/comments/${commentId}`, H()); reload(); onChanged(); }
    catch { notify('Error al borrar comentario', 'error'); }
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
  const confirmDeletePhoto = async () => {
    if (delAttId == null) return;
    try { await axios.delete(`${API_URL}/tasks/attachments/${delAttId}`, H()); setDelAttId(null); reload(); notify('Archivo eliminado'); }
    catch (e: any) { notify(e?.response?.data?.error || 'No se pudo eliminar', 'error'); setDelAttId(null); }
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
        setProcConfirm({ title: e.response.data.current?.title || '' });
      } else {
        notify(e?.response?.data?.error || 'No se pudo iniciar', 'error');
      }
    }
    finally { setBusy(false); }
  };
  const durTxt = (a?: string, b?: string) => {
    if (!a || !b) return null;
    return fmtDur(businessMs(new Date(a).getTime(), new Date(b).getTime()));
  };
  const openEdit = () => {
    setEdit({ title: t.title || '', description: t.description || '', eisenhower: t.eisenhower || 'estrella', due_at: toLocalInput(t.due_at) });
    // Categoría actual: 0 (Sin categoría) si es tablero personal.
    setEditCat(t.board_key === 'personales' ? 0 : (Number(t.board_id) || 0));
    // Involucrados actuales (participantes). El creador siempre queda incluido.
    const parts = (data.participants || []).map((p: any) => Number(p.id));
    setEditInvolved(parts.length ? parts : (t.created_by ? [Number(t.created_by)] : []));
    setEditAssignee(Number(t.assignee_id) || 0); // responsable actual
    if (users.length === 0) axios.get(`${API_URL}/tasks/assignable-users`, H()).then(r => setUsers(r.data?.users || [])).catch(() => {});
    if (cats.length === 0) axios.get(`${API_URL}/tasks/categories`, H()).then(r => setCats((r.data?.categories || []).filter((c: any) => c.board_key !== 'personales'))).catch(() => {});
    setEditing(true);
  };
  const saveEdit = async () => {
    if (!edit.title.trim()) { notify('El título es obligatorio', 'error'); return; }
    setBusy(true);
    try {
      // El responsable debe estar entre los involucrados.
      const involved = Array.from(new Set<number>([...editInvolved, ...(editAssignee ? [editAssignee] : [])]));
      const payload: any = {
        title: edit.title.trim(), description: edit.description || null,
        eisenhower: edit.eisenhower, due_at: edit.due_at || null,
        board_id: editCat || null, // 0 = Sin categoría (personal)
        involved_ids: involved,
        ...(editAssignee ? { assignee_id: editAssignee } : {}),
      };
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
              {t.status === 'awaiting_confirmation' && <Chip label="⏳ En espera de confirmación" size="small" sx={{ bgcolor: '#FBE9D0', color: '#B07206', fontWeight: 700 }} />}
            </Box>
            <Typography fontWeight={800} fontSize={17}><LinkifyTickets text={t.title} onNavigate={onClose} /></Typography>
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
                <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
                  <InputLabel>Categoría (flujo)</InputLabel>
                  <Select label="Categoría (flujo)" value={editCat} onChange={e => setEditCat(Number(e.target.value))}>
                    <MenuItem value={0}>Sin categoría (personal)</MenuItem>
                    {cats.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                  </Select>
                </FormControl>
                <InvolvedPicker users={users} involvedIds={editInvolved} setInvolvedIds={setEditInvolved}
                  fixedId={Number(t.created_by) || undefined} fixedLabel={t.created_by_name || 'Creador'} />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  El creador siempre queda incluido. Agrega a quien deba participar.
                </Typography>
                <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
                  <InputLabel>Responsable principal</InputLabel>
                  <Select label="Responsable principal" value={editAssignee || ''} onChange={e => setEditAssignee(Number(e.target.value))}>
                    {(() => {
                      // Opciones: el creador + los involucrados (nombres desde users).
                      const ids = Array.from(new Set<number>([...(t.created_by ? [Number(t.created_by)] : []), ...editInvolved, ...(editAssignee ? [editAssignee] : [])]));
                      return ids.map(uid2 => {
                        const u = users.find(x => x.id === uid2);
                        const name = u?.full_name || (uid2 === Number(t.created_by) ? (t.created_by_name || 'Creador') : `#${uid2}`);
                        return <MenuItem key={uid2} value={uid2}>{name}</MenuItem>;
                      });
                    })()}
                  </Select>
                </FormControl>
                <Box sx={{ display: 'flex', gap: 1, mt: 1.5, justifyContent: 'flex-end' }}>
                  <Button size="small" onClick={() => setEditing(false)} disabled={busy}>Cancelar</Button>
                  <Button size="small" variant="contained" onClick={saveEdit} disabled={busy} sx={{ bgcolor: '#D6521C', '&:hover': { bgcolor: '#B23F12' } }}>Guardar</Button>
                </Box>
              </Box>
            ) : (
              t.description && <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, whiteSpace: 'pre-wrap' }}><LinkifyTickets text={t.description} onNavigate={onClose} /></Typography>
            )}
            {!editing && (canInline ? (
              // ── Edición inline: prioridad, categoría, responsable, involucrados ──
              <Box sx={{ mb: 1.5, p: 1.5, bgcolor: '#FBF8F4', border: '1px solid #ECE4D8', borderRadius: 1.5 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Prioridad</InputLabel>
                    <Select label="Prioridad" value={t.eisenhower} disabled={busy} onChange={e => patch({ eisenhower: e.target.value })}>
                      {Object.entries(EIS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Categoría</InputLabel>
                    <Select label="Categoría" value={curCat} disabled={busy} onChange={e => patch({ board_id: Number(e.target.value) || null })}>
                      <MenuItem value={0}>Sin categoría (personal)</MenuItem>
                      {cats.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Responsable</InputLabel>
                    <Select label="Responsable" value={Number(t.assignee_id) || ''} disabled={busy}
                      onChange={e => { const nid = Number(e.target.value); patch({ assignee_id: nid, involved_ids: Array.from(new Set<number>([...partIds, nid])) }); }}>
                      {respOptions.map(uid2 => <MenuItem key={uid2} value={uid2}>{nameOf(uid2)}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0.25 }}>
                    {t.created_by_name && <Typography variant="caption" color="text.secondary"><b>Asignada por:</b> {displayTaskName(t.created_by_name)}</Typography>}
                    {t.due_at && <Typography variant="caption" color={t.overdue ? 'error.main' : 'text.secondary'}><b>Fecha deseada:</b> {fmtDate(t.due_at)}</Typography>}
                  </Box>
                </Box>
                <InvolvedPicker users={users} involvedIds={partIds}
                  setInvolvedIds={(ids: number[]) => patch({ involved_ids: ids, assignee_id: Number(t.assignee_id) || undefined })}
                  fixedId={Number(t.created_by) || undefined} fixedLabel={t.created_by_name || 'Creador'} />
              </Box>
            ) : (
              <>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1.5 }}>
                  <Typography variant="body2"><b>Responsable:</b> {displayTaskName(t.assignee_name) || "—"}</Typography>
                  {t.created_by_name && <Typography variant="body2"><b>Asignada por:</b> {displayTaskName(t.created_by_name)}</Typography>}
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
              </>
            ))}
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
                    <IconButton size="small" onClick={() => setDelAttId(a.id)} sx={{ position: 'absolute', top: -8, right: -8, bgcolor: '#fff', boxShadow: 1, p: 0.2, '&:hover': { bgcolor: '#fff' } }}>
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            )}

            <Divider sx={{ my: 2 }} />
            <Typography fontWeight={800} fontSize={14} sx={{ mb: 1 }}>Comentarios</Typography>
            {(data.comments || []).length === 0 && (
              <Typography variant="caption" color="text.secondary">Sin comentarios todavía.</Typography>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {(data.comments || []).map((c: any) => {
                const mine = MY_ID > 0 && Number(c.author_id) === Number(MY_ID);
                const nameColor = authorColor(c.author_id, c.author_name);
                return (
                  <Box key={c.id} sx={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                    <Box sx={{
                      maxWidth: '78%',
                      px: 1.25, py: 0.75,
                      borderRadius: 2,
                      borderTopRightRadius: mine ? 0.5 : 2,
                      borderTopLeftRadius: mine ? 2 : 0.5,
                      bgcolor: mine ? '#DCF8C6' : '#F1F0F0',
                    }}>
                      {!mine && (
                        <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: nameColor, mb: 0.25 }}>
                          {c.author_name || '—'}
                        </Typography>
                      )}
                      {editingCommentId === c.id ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 220 }}>
                          <TextField
                            fullWidth size="small" multiline autoFocus
                            value={editingText}
                            onChange={e => setEditingText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEditComment(); } }}
                            sx={{ bgcolor: '#fff', borderRadius: 1 }}
                          />
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                            <IconButton size="small" onClick={() => { setEditingCommentId(null); setEditingText(''); }} title="Cancelar"><CloseIcon fontSize="small" /></IconButton>
                            <IconButton size="small" color="primary" onClick={saveEditComment} disabled={!editingText.trim()} title="Guardar"><CheckIcon fontSize="small" /></IconButton>
                          </Box>
                        </Box>
                      ) : (
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: mine ? '#0B3D1E' : '#1a1a1a' }}>
                          {c.body}
                        </Typography>
                      )}
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5, mt: 0.25 }}>
                        {mine && editingCommentId !== c.id && (
                          <>
                            <IconButton size="small" sx={{ p: 0.25, color: '#3A7D53' }} onClick={() => { setEditingCommentId(c.id); setEditingText(c.body); }} title="Editar"><EditIcon sx={{ fontSize: 14 }} /></IconButton>
                            <IconButton size="small" sx={{ p: 0.25, color: '#C0392B' }} onClick={() => deleteComment(c.id)} title="Borrar"><DeleteIcon sx={{ fontSize: 14 }} /></IconButton>
                          </>
                        )}
                        <Typography sx={{ fontSize: 10.5, color: mine ? '#3A7D53' : '#9AA0A6' }}>
                          {c.edited_at ? `editado · ${fmtDate(c.edited_at)}` : fmtDate(c.created_at)}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
              <TextField
                fullWidth
                size="small"
                multiline
                maxRows={6}
                placeholder={sendingComment ? 'Enviando comentario…' : 'Deja un comentario…  (Shift+Enter = salto de línea)'}
                value={comment}
                onChange={e => setComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!sendingComment) addComment(); } }}
                disabled={sendingComment}
              />
              <IconButton color="primary" onClick={addComment} disabled={sendingComment || !comment.trim()}>
                {sendingComment ? <CircularProgress size={18} /> : <SendIcon />}
              </IconButton>
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
            {/* Sensación de guardado: al cambiar algo (que ya se guarda solo), el
                botón "Poner en proceso" se convierte en "Guardar". */}
            {dirty && t.status !== 'completed' && (
              <Button variant="contained" startIcon={<CheckCircleIcon />} disabled={busy}
                onClick={() => { setDirty(false); notify('✓ Cambios guardados'); }}
                sx={{ bgcolor: '#2E7D46', '&:hover': { bgcolor: '#25683a' } }}>
                Guardar
              </Button>
            )}
            {!dirty && t.status !== 'completed' && !t.started_at && (
              <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={openStart} disabled={busy}
                sx={{ bgcolor: '#B07206', '&:hover': { bgcolor: '#8F5D05' } }}>
                Poner en proceso
              </Button>
            )}
            {t.status !== 'completed' && t.started_at && (() => {
              // ── Doble confirmación ──
              // Si el creador y el responsable son distintos, el responsable
              // manda la tarea a "Esperando confirmación" y solo el creador
              // (o gerencia) la cierra en un segundo paso.
              const creatorId = Number(t.created_by) || 0;
              const assigneeId = Number(t.assignee_id) || 0;
              const iAmCreator = creatorId > 0 && creatorId === MY_ID;
              const canManageTask = !!data?.can_edit;
              const differentCreator = creatorId > 0 && assigneeId > 0 && creatorId !== assigneeId;
              const isAwaiting = t.status === 'awaiting_confirmation';

              if (isAwaiting) {
                const canConfirm = iAmCreator || canManageTask;
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Chip size="small" label="⏳ En espera de confirmación de quien la asignó" sx={{ bgcolor: '#FBE9D0', color: '#B07206', fontWeight: 700 }} />
                    <Button variant="contained" color={canConfirm ? 'success' : 'warning'} startIcon={<CheckCircleIcon />}
                      onClick={() => complete(false)} disabled={busy || pending > 0}>
                      {pending > 0 ? `Completa el checklist (${pending})` : (canConfirm ? 'Confirmar y cerrar' : 'Completar (en espera)')}
                    </Button>
                  </Box>
                );
              }

              const label = differentCreator && !iAmCreator
                ? (pending > 0 ? `Completa el checklist (${pending})` : 'Marcar terminada')
                : (pending > 0 ? `Completa el checklist (${pending})` : 'Completar');
              return (
                <Button variant="contained" color="success" startIcon={<CheckCircleIcon />} onClick={() => complete(false)} disabled={busy || pending > 0}>
                  {label}
                </Button>
              );
            })()}
            {t.status === 'completed' && (data.can_edit || Number(t.assignee_id) === MY_ID || (data.participants || []).some((p: any) => Number(p.id) === MY_ID)) && (
              <Button variant="outlined" startIcon={<RefreshIcon />} onClick={reopen} disabled={busy}
                sx={{ borderColor: '#B07206', color: '#B07206' }}>
                Reabrir
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

          {/* Consejo (no bloqueo): ya hay una tarea en proceso. Puede iniciar igual. */}
          <Dialog open={procConfirm != null} onClose={() => setProcConfirm(null)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
              <PlayArrowIcon sx={{ color: '#B07206' }} /> Ya tienes una tarea en proceso
            </DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary">
                Para mejorar tu efectividad, lo ideal es <b>no iniciar una tarea nueva hasta terminar</b> «<b>{procConfirm?.title}</b>».
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Dejar en proceso una tarea que ya terminaste <b>afecta tu puntuación</b>. Termina tus tareas 💪
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Aun así puedes iniciar esta y trabajar ambas a la vez.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setProcConfirm(null)}>Cancelar</Button>
              <Button variant="contained" onClick={() => { setProcConfirm(null); start(true); }} sx={{ bgcolor: '#B07206', '&:hover': { bgcolor: '#8F5D05' } }}>
                Iniciar de todos modos
              </Button>
            </DialogActions>
          </Dialog>

          {/* Pregunta doble: completar una tarea en espera sin la revisión de quien la asignó */}
          <Dialog open={forceConfirmOpen} onClose={() => setForceConfirmOpen(false)} maxWidth="xs" fullWidth
            PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}>
            <Box sx={{ bgcolor: '#FBE9D0', px: 3, pt: 2.5, pb: 2, display: 'flex', alignItems: 'center', gap: 1.2 }}>
              <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: '#B07206', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <span style={{ fontSize: 20 }}>⏳</span>
              </Box>
              <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: '#7a4f04' }}>En espera de confirmación</Typography>
            </Box>
            <DialogContent sx={{ pt: 2.5 }}>
              <Typography variant="body2" sx={{ color: 'text.primary' }}>
                Esta tarea está esperando que <b>quien la asignó</b> la revise y la cierre.
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
                ¿Seguro que deseas marcarla como <b>COMPLETADA</b> sin su revisión?
              </Typography>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button onClick={() => setForceConfirmOpen(false)} sx={{ color: 'text.secondary' }}>Cancelar</Button>
              <Button variant="contained" onClick={() => { setForceConfirmOpen(false); complete(true); }}
                sx={{ bgcolor: '#2E7D46', '&:hover': { bgcolor: '#25683a' }, fontWeight: 700 }}>
                Sí, completar
              </Button>
            </DialogActions>
          </Dialog>

          {/* Confirmar eliminar archivo (con diseño, no window.confirm) */}
          <Dialog open={delAttId != null} onClose={() => setDelAttId(null)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
              <AttachFileIcon sx={{ color: '#C0392B' }} /> Eliminar archivo
            </DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary">
                ¿Seguro que quieres eliminar este archivo? Esta acción no se puede deshacer.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDelAttId(null)}>Cancelar</Button>
              <Button variant="contained" color="error" onClick={confirmDeletePhoto}>Eliminar</Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </Dialog>
  );
}
