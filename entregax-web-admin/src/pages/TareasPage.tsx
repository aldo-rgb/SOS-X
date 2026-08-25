// ============================================================
// TareasPage — Módulo Tareas · tableros multi-departamento
// - "Flujo Operativo" (funnel de clientes, con gate de checklist).
// - Tableros por departamento (Sistemas, etc.): Nueva → En proceso → Terminado.
// - Control de tiempo: cada tarea mide creación → término (métricas).
// Solo super_admin / admin / director. Ver propuestas/tareas-diseno.html.
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Box, Typography, Button, IconButton, Chip, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Select, FormControl, InputLabel, CircularProgress,
  Avatar, Divider, Checkbox, Tooltip, Snackbar, Alert, LinearProgress, Tabs, Tab, Autocomplete,
  InputAdornment,
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SendIcon from '@mui/icons-material/Send';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import { Checkbox as MCheckbox, FormControlLabel, ListItemText, OutlinedInput, ToggleButton, ToggleButtonGroup } from '@mui/material';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import GridViewIcon from '@mui/icons-material/GridView';
import GroupsIcon from '@mui/icons-material/Groups';
import TeamTasksView from '../components/TeamTasksView';
import SearchIcon from '@mui/icons-material/Search';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const getToken = () => localStorage.getItem('token') || '';
const H = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });

// Icono por tablero según su nombre (para distinguirlos de un vistazo).
const boardIcon = (name?: string, type?: string): string => {
  if (type === 'operativo') return '🎯';
  const n = (name || '').toLowerCase();
  if (n.includes('error')) return '🐛';
  if (n.includes('desarrollo') || n.includes('sistema')) return '💻';
  if (n.includes('marketing')) return '📣';
  if (n.includes('personal')) return '🏠';
  if (n.includes('pago')) return '💳';
  if (n.includes('venta')) return '💰';
  if (n.includes('cobr')) return '🧾';
  if (n.includes('operaci') || n.includes('cedis')) return '📦';
  return '🗂️';
};
const myRole = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}')?.role || ''; } catch { return ''; } })();
const isSuperAdmin = myRole === 'super_admin';

const EIS: Record<string, { label: string; short: string; color: string; bg: string }> = {
  fuego:    { label: '🔥 Urgente e importante',       short: '🔥 Urgente',           color: '#C0392B', bg: '#F9E5E2' },
  estrella: { label: '⭐ Importante y no urgente',    short: '⭐ Importante',         color: '#2E7D46', bg: '#E4F1E8' },
  delegar:  { label: '🔄 Urgente y no importante',    short: '🔄 Atención', color: '#B07206', bg: '#F7ECD5' },
  eliminar: { label: '🗑️ No importante y no urgente', short: '🗑️ Algún día',         color: '#5A6472', bg: '#ECEEF0' },
};
// Matriz Eisenhower — 2×2 (orden de lectura: Q1 ↖, Q2 ↗, Q3 ↙, Q4 ↘).
const QUADRANTS: Array<{ key: string; title: string; color: string; bg: string }> = [
  { key: 'fuego',    title: 'Importante y urgente',       color: '#C0392B', bg: '#FCEDEA' },
  { key: 'estrella', title: 'Importante y no urgente',    color: '#2E7D46', bg: '#ECF6EF' },
  { key: 'delegar',  title: 'Urgente y no importante',    color: '#B07206', bg: '#FAF3E4' },
  { key: 'eliminar', title: 'No importante y no urgente', color: '#5A6472', bg: '#F1F3F5' },
];

// Prioridades ofrecidas al CREAR una tarea nueva. Solo las dos que la operación
// usa de verdad; 'delegar' y 'eliminar' siguen en EIS y en la matriz para
// pintar y editar las tareas que ya las tienen.
const EIS_ALTA = ['fuego', 'estrella'] as const;
// Compromiso de atención que se muestra junto a la prioridad AL CREAR. No se
// toca EIS: ese label también pinta el chip de las tarjetas.
const EIS_ALTA_NOTA: Record<string, string> = { fuego: '24 hrs' };
const XPS: Record<string, { label: string; color: string }> = {
  verde:    { label: '🟢 Vendido',   color: '#2E7D46' },
  amarillo: { label: '🟡 Ofrecido',  color: '#B07206' },
  rojo:     { label: '🔴 No ofrecido', color: '#C0392B' },
};

// Adjuntos: fotos + documentos (PDF, Excel, Word, CSV).
const ACCEPT_FILES = 'image/*,.pdf,.xls,.xlsx,.csv,.doc,.docx,.txt,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const isImgFile = (name?: string): boolean => /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(String(name || ''));
const fileIco = (name?: string): string => {
  const n = String(name || '').toLowerCase();
  if (/\.pdf$/.test(n)) return '📄';
  if (/\.(xls|xlsx|csv)$/.test(n)) return '📊';
  if (/\.(doc|docx)$/.test(n)) return '📝';
  return '📎';
};

// Duración legible (min → "45m", "2h 10m", "3d 4h").
const fmtDur = (ms: number): string => {
  if (!isFinite(ms) || ms < 0) return '—';
  const min = Math.floor(ms / 60000);
  if (min < 1) return '<1m';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), mm = min % 60;
  if (h < 24) return `${h}h ${mm}m`;
  const d = Math.floor(h / 24), hh = h % 24;
  return `${d}d ${hh}h`;
};
// Tiempo de una tarea: total si está terminada, o transcurrido si sigue abierta.
const taskTime = (t: { created_at?: string; completed_at?: string; status?: string }) => {
  if (!t.created_at) return null;
  const start = new Date(t.created_at).getTime();
  const end = t.completed_at ? new Date(t.completed_at).getTime() : Date.now();
  return { done: !!t.completed_at, ms: end - start };
};
// Historial de actividad: etiqueta legible por acción.
const ACT_LABEL: Record<string, string> = {
  created: '📌 Creó la tarea',
  assigned: '👤 Reasignó la tarea',
  moved: '➡️ Movió de columna',
  completed: '✅ Completó la tarea',
  forced_close: '🔓 Forzó el cierre',
  reopened: '↩️ Reabrió la tarea',
  comment: '💬 Comentó',
  subtask_done: '☑️ Palomeó una subtarea',
  subtask_undone: '⬜ Despalomeó una subtarea',
  attachment_added: '📷 Agregó una foto',
};
const actLabel = (a: any): string => {
  const base = ACT_LABEL[a.action] || a.action;
  if (a.action === 'forced_close' && a.meta?.reason) return `${base}: ${a.meta.reason}`;
  return base;
};

interface Col { id: number; col_key: string; name: string; color: string; gate_checklist: boolean; is_done?: boolean; sort_order: number; }
interface Sec { id: number; board_id: number; name: string; sort_order: number; is_someday?: boolean; }
interface Board { id: number; name: string; board_type: string; columns: Col[]; sections?: Sec[]; lead_name?: string | null; }
interface Task {
  id: number; column_id: number; section_id?: number | null; title: string; description?: string; assignee_id?: number;
  assignee_name?: string; due_at?: string; eisenhower: string; xpay_seguro?: string; status: string;
  created_at?: string; completed_at?: string;
  subtasks_total: number; subtasks_done: number; comments: number; overdue: boolean;
  participants_count?: number; participant_names?: string[];
}
interface UserOpt { id: number; full_name: string; role?: string; avg_resolution_seconds?: number | null; }

// Etiqueta legible del tipo de usuario (para agrupar involucrados por grupo,
// igual que en Mis Tareas).
const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Administración', admin: 'Administración', director: 'Dirección', finanzas: 'Finanzas',
  accountant: 'Contabilidad', abogado: 'Legal', branch_manager: 'Operación CEDIS', operaciones: 'Operaciones',
  warehouse_ops: 'Bodega', counter_staff: 'Mostrador', customer_service: 'Servicio a cliente',
  soporte_tecnico: 'Soporte técnico', advisor: 'Asesores', sub_advisor: 'Sub-asesores',
  repartidor: 'Repartidores', monitoreo: 'Monitoreo',
  external_partner: 'Grupo Rino',
};
const roleGroup = (r?: string): string => ROLE_LABEL[String(r || '')] || (r ? r : 'Otros');
// Orden fijo de grupos en el selector (los no listados van al final). Legal se oculta.
const GROUP_ORDER = ['Administración', 'Dirección', 'Servicio a cliente', 'Operación CEDIS', 'Contabilidad', 'Grupo Rino', 'Bodega', 'Monitoreo', 'Repartidores', 'Mostrador'];
const groupRank = (g: string): number => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? GROUP_ORDER.length : i; };
const HIDDEN_GROUPS = new Set<string>(['Legal']);
const isPickableGroup = (r?: string): boolean => !HIDDEN_GROUPS.has(roleGroup(r));

export default function TareasPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' });
  const notify = (msg: string, sev: 'success' | 'error' = 'success') => setSnack({ open: true, msg, sev });
  // 🔍 Búsqueda de texto (título, descripción, responsable, involucrados, id). Cliente-side.
  const [searchText, setSearchText] = useState('');
  // Búsqueda GLOBAL (todos los tableros). Se llena con /tasks/search cuando el
  // usuario escribe 2+ caracteres. Permite mostrar coincidencias en OTROS
  // tableros con chips clickeables que cambian de tablero y abren la tarea.
  const [crossResults, setCrossResults] = useState<any[]>([]);
  const [crossLoading, setCrossLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // eisenhower arranca VACÍO a propósito: venía preseleccionado en 'estrella' y
  // la tarea nacía con una prioridad que nadie eligió. Ahora hay que elegirla,
  // igual que en Mis Tareas.
  const [form, setForm] = useState<any>({ title: '', description: '', eisenhower: '', assignee_id: '', due_at: '', column_id: '' });
  const [involvedIds, setInvolvedIds] = useState<number[]>([]);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [newSubtasks, setNewSubtasks] = useState<string[]>([]); // checklist al crear
  const [subInput, setSubInput] = useState('');
  const [detailId, setDetailId] = useState<number | null>(null);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  // Responsables elegibles del tablero activo (según su config por rol/usuarios).
  const [assignees, setAssignees] = useState<UserOpt[]>([]);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgRoles, setCfgRoles] = useState<string[]>([]);
  const [cfgUserIds, setCfgUserIds] = useState<number[]>([]);
  // Sub-sección activa (null = Todas) para filtrar el tablero.
  const [activeSection, setActiveSection] = useState<number | null>(null);
  // Vista del tablero: 'columns' (Kanban) o 'matrix' (Eisenhower 2×2).
  const [view, setView] = useState<'columns' | 'matrix' | 'team'>('columns');

  const board = boards.find(b => b.id === activeId) || null;
  const sections = board?.sections || [];
  const somedaySection = sections.find(s => s.is_someday) || null;
  const somedayId = somedaySection?.id ?? null;
  const sectionName = (id?: number | null) => sections.find(s => s.id === id)?.name;

  // 🔍 Filtro de búsqueda: normaliza sin acentos y compara contra título,
  // descripción, responsable, involucrados e ID. Aplica antes de cualquier
  // separación por columna/matriz.
  const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normSearch = (s: any) => stripAccents(String(s ?? '')).toLowerCase();
  const searchQ = normSearch(searchText).trim();
  const filteredTasks = !searchQ ? tasks : tasks.filter(t => {
    const parts: string[] = [
      String(t.id),
      `t-${t.id}`,
      t.title || '',
      t.description || '',
      t.assignee_name || '',
      ...((t.participant_names as string[] | undefined) || []),
      sectionName(t.section_id) || '',
    ];
    return parts.some(p => normSearch(p).includes(searchQ));
  });

  const loadBoards = useCallback(async (preferId?: number) => {
    try {
      const br = await axios.get(`${API_URL}/tasks/boards`, H());
      const list: Board[] = br.data?.boards || [];
      setBoards(list);
      setActiveId(prev => {
        const want = preferId ?? prev;
        if (want && list.some(b => b.id === want)) return want;
        return (list.find(b => b.board_type === 'operativo') || list[0])?.id ?? null;
      });
    } catch (e) { console.error(e); notify('No se pudieron cargar los tableros', 'error'); }
    finally { setLoading(false); }
  }, []);

  const loadTasks = useCallback(async (boardId: number) => {
    try {
      const tk = await axios.get(`${API_URL}/tasks?board_id=${boardId}`, H());
      setTasks(tk.data?.tasks || []);
    } catch { notify('No se pudieron cargar las tareas', 'error'); }
  }, []);

  const loadAssignees = useCallback(async (boardId: number) => {
    try {
      const r = await axios.get(`${API_URL}/tasks/boards/${boardId}/assignees`, H());
      setAssignees((r.data?.users || []).map((u: any) => ({ id: u.id, full_name: u.full_name, role: u.role, avg_resolution_seconds: u.avg_resolution_seconds })));
      setCfgRoles(r.data?.config?.roles || []);
      setCfgUserIds(r.data?.config?.user_ids || []);
    } catch { setAssignees([]); }
  }, []);

  useEffect(() => { loadBoards(); }, [loadBoards]);
  useEffect(() => { if (activeId) { loadTasks(activeId); loadAssignees(activeId); setActiveSection(null); } }, [activeId, loadTasks, loadAssignees]);
  useEffect(() => {
    axios.get(`${API_URL}/tasks/assignable-users`, H())
      .then(r => setUsers((Array.isArray(r.data) ? r.data : r.data?.users || []).map((u: any) => ({ id: u.id, full_name: u.full_name, role: u.role, avg_resolution_seconds: u.avg_resolution_seconds }))))
      .catch(() => {});
  }, []);

  // 🔍 Búsqueda global cross-tablero (debounced 300ms).
  // Se dispara con 2+ caracteres; limpia cuando el texto está vacío.
  useEffect(() => {
    const q = searchText.trim();
    if (q.length < 2) { setCrossResults([]); setCrossLoading(false); return; }
    setCrossLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await axios.get(`${API_URL}/tasks/search`, { ...H(), params: { q } });
        setCrossResults(r.data?.tasks || []);
      } catch { setCrossResults([]); }
      finally { setCrossLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchText]);

  const saveCfg = async () => {
    if (!activeId) return;
    try {
      await axios.put(`${API_URL}/tasks/boards/${activeId}/assignees`, { roles: cfgRoles, user_ids: cfgUserIds }, H());
      setCfgOpen(false);
      notify('Responsables del tablero actualizados');
      loadAssignees(activeId);
    } catch (e: any) { notify(e?.response?.data?.error || 'No se pudo guardar', 'error'); }
  };
  // Roles disponibles (derivados de los usuarios) para el configurador.
  const allRoles = Array.from(new Set(users.map(u => u.role).filter(Boolean))) as string[];

  const refresh = () => { if (activeId) loadTasks(activeId); };

  const createTask = async () => {
    if (!form.title.trim()) return notify('El título es obligatorio', 'error');
    if (!form.eisenhower) return notify('Selecciona la prioridad', 'error');
    if (!form.due_at) return notify('Indica la fecha deseada', 'error');
    // Sin este candado, un doble clic manda dos POST y nacen tareas gemelas
    // (pasó con las tareas 346 y 347, creadas con 23 ms de diferencia).
    if (creating) return;
    setCreating(true);
    try {
      const res = await axios.post(`${API_URL}/tasks`, {
        board_id: board?.id, title: form.title.trim(), description: form.description || null,
        eisenhower: form.eisenhower, assignee_id: form.assignee_id || null,
        involved_ids: involvedIds,
        due_at: form.due_at || null, column_id: form.column_id || null,
        section_id: form.section_id || activeSection || null,
        subtasks: newSubtasks.filter(s => s.trim()).map(body => ({ body: body.trim() })),
      }, H());
      const newId = res.data?.task?.id;
      // Subir fotos adjuntas (si el usuario agregó alguna).
      if (newId && newPhotos.length) {
        for (const f of newPhotos) {
          const fd = new FormData(); fd.append('photo', f);
          try { await axios.post(`${API_URL}/tasks/${newId}/attachments`, fd, { headers: { ...H().headers, 'Content-Type': 'multipart/form-data' } }); } catch { /* continúa */ }
        }
      }
      setCreateOpen(false);
      setForm({ title: '', description: '', eisenhower: '', assignee_id: '', due_at: '', column_id: '', section_id: '' });
      setInvolvedIds([]); setNewPhotos([]); setNewSubtasks([]); setSubInput('');
      notify('Tarea creada');
      refresh();
    } catch (e: any) { notify(e?.response?.data?.error || 'Error al crear', 'error'); }
    finally { setCreating(false); }
  };

  const createBoard = async () => {
    const name = newBoardName.trim();
    if (!name) return notify('Escribe el nombre del departamento/tablero', 'error');
    try {
      const r = await axios.post(`${API_URL}/tasks/boards`, { name }, H());
      setNewBoardOpen(false); setNewBoardName('');
      notify('Tablero creado');
      await loadBoards(r.data?.board?.id);
    } catch (e: any) { notify(e?.response?.data?.error || 'Error al crear tablero', 'error'); }
  };

  const createSection = async () => {
    if (!activeId) return;
    const name = window.prompt('Nombre de la sub-sección (ej. App, Web):');
    if (!name || !name.trim()) return;
    try {
      await axios.post(`${API_URL}/tasks/boards/${activeId}/sections`, { name: name.trim() }, H());
      notify('Sub-sección creada');
      await loadBoards(activeId);
    } catch (e: any) { notify(e?.response?.data?.error || 'No se pudo crear', 'error'); }
  };

  const deleteSection = async (s: Sec) => {
    if (!window.confirm(`¿Eliminar la sub-sección "${s.name}"? Sus tareas quedarán sin sub-sección.`)) return;
    try {
      await axios.delete(`${API_URL}/tasks/sections/${s.id}`, H());
      notify('Sub-sección eliminada');
      if (activeSection === s.id) setActiveSection(null);
      await loadBoards(activeId ?? undefined);
      if (activeId) loadTasks(activeId);
    } catch (e: any) { notify(e?.response?.data?.error || 'No se pudo eliminar', 'error'); }
  };

  const deleteBoard = async (b: Board) => {
    if (!window.confirm(`¿Eliminar el tablero "${b.name}"? Sus tareas dejarán de mostrarse.`)) return;
    try {
      await axios.delete(`${API_URL}/tasks/boards/${b.id}`, H());
      notify('Tablero eliminado');
      await loadBoards();
    } catch (e: any) { notify(e?.response?.data?.error || 'No se pudo eliminar', 'error'); }
  };

  const initials = (n?: string) => (n || '?').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
  const isOperativo = board?.board_type === 'operativo';

  // Tarjeta de tarea (reutilizada en vista Columnas y Matriz).
  const renderTaskCard = (t: Task) => {
    const tt = taskTime(t);
    const secName = t.section_id ? sectionName(t.section_id) : null;
    return (
      <Box key={t.id} onClick={() => setDetailId(t.id)}
        sx={{ bgcolor: '#fff', borderRadius: 1.5, p: 1.25, cursor: 'pointer', border: '1px solid #E8DFD3',
          '&:hover': { boxShadow: 2 }, borderLeft: t.overdue ? '3px solid #C0392B' : '1px solid #E8DFD3', opacity: t.status === 'completed' ? 0.72 : 1 }}>
        <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5, flexWrap: 'wrap' }}>
          <Chip label={EIS[t.eisenhower]?.short || t.eisenhower} size="small"
            sx={{ height: 20, fontSize: 11, bgcolor: EIS[t.eisenhower]?.bg, color: EIS[t.eisenhower]?.color, fontWeight: 700 }} />
          {t.xpay_seguro && <Chip label={XPS[t.xpay_seguro]?.label} size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }} />}
          {secName && <Chip label={`🗂️ ${secName}`} size="small" sx={{ height: 20, fontSize: 11, bgcolor: '#EDE7F6', color: '#5E35B1', fontWeight: 700 }} />}
        </Box>
        <Typography fontSize={13.5} fontWeight={600} sx={{ lineHeight: 1.3, textDecoration: t.status === 'completed' ? 'line-through' : 'none' }}>
          {/* Número de tarea visible para poder referenciarla en tickets y chats. */}
          <Box component="span" sx={{ color: '#8A8A8A', fontWeight: 800, mr: 0.5, textDecoration: 'none' }}>#{t.id}</Box>
          {t.title}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
          {(t.participant_names && t.participant_names.length > 0) ? (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              {t.participant_names.slice(0, 4).map((name, idx) => (
                <Tooltip key={idx} title={name}>
                  <Avatar sx={{ width: 22, height: 22, fontSize: 10, bgcolor: '#5E35B1', ml: idx === 0 ? 0 : -0.75, border: '1.5px solid #fff' }}>{initials(name)}</Avatar>
                </Tooltip>
              ))}
              {t.participant_names.length > 4 && <Typography fontSize={11} color="text.secondary" sx={{ ml: 0.5 }}>+{t.participant_names.length - 4}</Typography>}
            </Box>
          ) : t.assignee_name ? (
            <Tooltip title={t.assignee_name}><Avatar sx={{ width: 22, height: 22, fontSize: 10, bgcolor: '#D6521C' }}>{initials(t.assignee_name)}</Avatar></Tooltip>
          ) : <Chip label="Sin asignar" size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />}
          <Box sx={{ flex: 1 }} />
          {t.subtasks_total > 0 && (
            <Typography fontSize={11} color={t.subtasks_done === t.subtasks_total ? 'success.main' : 'text.secondary'}>
              ☑ {t.subtasks_done}/{t.subtasks_total}
            </Typography>
          )}
          {t.due_at && <Typography fontSize={11} color={t.overdue ? 'error.main' : 'text.secondary'}>
            {new Date(t.due_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
          </Typography>}
        </Box>
        {tt && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, mt: 0.5 }}>
            <AccessTimeIcon sx={{ fontSize: 13, color: tt.done ? '#2E7D46' : '#8A8A8A' }} />
            <Typography fontSize={11} color={tt.done ? 'success.main' : 'text.secondary'}>
              {tt.done ? `Resuelta en ${fmtDur(tt.ms)}` : `${fmtDur(tt.ms)} en curso`}
            </Typography>
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
            <AssignmentTurnedInIcon sx={{ color: '#D6521C' }} /> Tareas{board ? ` · ${board.name}` : ''}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isOperativo
              ? 'Responsabilidad absoluta: un responsable, una fecha, un rastro. El checklist bloquea el avance.'
              : 'Asigna tareas al departamento. El tiempo se mide de la creación al término.'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setForm((f: any) => ({ ...f, section_id: activeSection || '', column_id: board?.columns?.[0]?.id || '' })); setNewPhotos([]); setCreateOpen(true); }} disabled={!board}
            sx={{ bgcolor: '#D6521C', '&:hover': { bgcolor: '#B23F12' } }}>Nueva tarea</Button>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={refresh}>Actualizar</Button>
        </Box>
      </Box>

      {/* Selector de tableros (departamentos) */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, borderBottom: '1px solid #E0E0E0' }}>
        <Tabs value={activeId ?? false} onChange={(_, v) => setActiveId(v)} variant="scrollable" scrollButtons="auto"
          sx={{ minHeight: 40, flex: 1, '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontWeight: 700 } }}>
          {boards.map(b => (
            <Tab key={b.id} value={b.id} label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {boardIcon(b.name, b.board_type)} {b.name}
                {isSuperAdmin && b.board_type !== 'operativo' && b.id === activeId && (
                  <Tooltip title="Eliminar tablero (solo super admin)">
                    <IconButton component="span" size="small" onClick={(e) => { e.stopPropagation(); deleteBoard(b); }} sx={{ p: 0.2, ml: 0.3 }}>
                      <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            } />
          ))}
        </Tabs>
        <Tooltip title="Configurar quién puede ser responsable en este tablero">
          <span>
            <Button size="small" startIcon={<ManageAccountsIcon />} onClick={() => setCfgOpen(true)} disabled={!board}
              sx={{ textTransform: 'none', flex: 'none' }}>
              Responsables
            </Button>
          </span>
        </Tooltip>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setNewBoardOpen(true)} sx={{ textTransform: 'none', flex: 'none' }}>
          Nuevo tablero
        </Button>
      </Box>

      {/* Selector de vista: Columnas (Kanban) o Matriz Eisenhower */}
      {board && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}
            sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 1.5, gap: 0.5 }, '& .Mui-selected': { color: '#D6521C !important', bgcolor: '#FBE6D8 !important' } }}>
            <ToggleButton value="columns"><ViewColumnIcon sx={{ fontSize: 18 }} /> Columnas</ToggleButton>
            <ToggleButton value="matrix"><GridViewIcon sx={{ fontSize: 18 }} /> Matriz Eisenhower</ToggleButton>
            <ToggleButton value="team"><GroupsIcon sx={{ fontSize: 18 }} /> Equipo</ToggleButton>
          </ToggleButtonGroup>
          {/* 🔍 Buscador de tareas en el tablero activo. Filtra por título,
              descripción, responsable, involucrados o ID. */}
          <TextField
            size="small"
            placeholder="Buscar tarea…"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            sx={{ minWidth: 220, flex: 1, maxWidth: 360 }}
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
          {view === 'matrix' && <Typography fontSize={12} color="text.secondary">Muestra todas las tareas por cuadrante de prioridad.</Typography>}
        </Box>
      )}

      {/* 🔎 Coincidencias en OTROS tableros (búsqueda global cross-tablero).
          Cada chip cambia al tablero destino y abre la tarea. */}
      {searchText.trim().length >= 2 && board && (() => {
        const others = crossResults.filter(r => Number(r.board_id) !== activeId);
        if (others.length === 0 && !crossLoading) return null;
        // Agrupamos por tablero para pintar "[Desarrollo Sistema (3)]" y luego los títulos.
        const byBoard: Record<number, { board_id: number; board_name: string; items: any[] }> = {};
        for (const t of others) {
          const bid = Number(t.board_id);
          if (!byBoard[bid]) byBoard[bid] = { board_id: bid, board_name: t.board_name || 'Sin tablero', items: [] };
          byBoard[bid].items.push(t);
        }
        const groups = Object.values(byBoard);
        return (
          <Alert
            severity="info"
            icon={<SearchIcon fontSize="small" />}
            sx={{ mb: 1.5, '& .MuiAlert-message': { width: '100%' } }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: groups.length ? 0.75 : 0, flexWrap: 'wrap' }}>
              <Typography fontSize={12.5} fontWeight={700}>
                {crossLoading ? 'Buscando en otros tableros…' : `También encontrado en ${groups.length} tablero${groups.length === 1 ? '' : 's'} · ${others.length} tarea${others.length === 1 ? '' : 's'}`}
              </Typography>
              {crossLoading && <CircularProgress size={14} />}
            </Box>
            {groups.map(g => (
              <Box key={g.board_id} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
                <Typography fontSize={11.5} fontWeight={700} sx={{ color: '#5E35B1', mr: 0.5 }}>
                  {boardIcon(g.board_name)} {g.board_name} ({g.items.length}):
                </Typography>
                {g.items.slice(0, 6).map(t => (
                  <Chip
                    key={t.id}
                    size="small"
                    label={t.title.length > 40 ? t.title.slice(0, 38) + '…' : t.title}
                    onClick={() => { setActiveId(g.board_id); setDetailId(t.id); }}
                    sx={{
                      fontWeight: 600, fontSize: 11.5, cursor: 'pointer',
                      bgcolor: t.status === 'completed' ? '#E4F1E8' : '#FBE6D8',
                      color: t.status === 'completed' ? '#2E7D46' : '#B23F12',
                      '&:hover': { bgcolor: t.status === 'completed' ? '#C8E6C9' : '#F5D3B8' },
                    }}
                  />
                ))}
                {g.items.length > 6 && (
                  <Chip
                    size="small"
                    label={`+${g.items.length - 6}`}
                    onClick={() => setActiveId(g.board_id)}
                    sx={{ fontWeight: 700, fontSize: 11.5, cursor: 'pointer', bgcolor: '#EEE' }}
                  />
                )}
              </Box>
            ))}
          </Alert>
        );
      })()}

      {/* Sub-secciones (solo en vista Columnas) */}
      {board && view === 'columns' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5, flexWrap: 'wrap' }}>
          <Typography fontSize={12} color="text.secondary" sx={{ mr: 0.5 }}>Sub-secciones:</Typography>
          <Chip label="Todas" size="small" onClick={() => setActiveSection(null)}
            color={activeSection === null ? 'primary' : 'default'}
            variant={activeSection === null ? 'filled' : 'outlined'}
            sx={{ fontWeight: 700, ...(activeSection === null ? { bgcolor: '#D6521C' } : {}) }} />
          {sections.map(s => (
            <Chip key={s.id} size="small"
              label={s.is_someday ? `💤 ${s.name}` : s.name}
              onClick={() => setActiveSection(s.id)}
              onDelete={s.is_someday ? undefined : () => deleteSection(s)}
              color={activeSection === s.id ? 'primary' : 'default'}
              variant={activeSection === s.id ? 'filled' : 'outlined'}
              sx={{ fontWeight: 700, ...(activeSection === s.id ? { bgcolor: '#D6521C' } : {}) }} />
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={createSection} sx={{ textTransform: 'none', minWidth: 0 }}>
            Sub-sección
          </Button>
        </Box>
      )}

      {view === 'team' ? (
        <TeamTasksView onOpenTask={setDetailId} />
      ) : loading ? (
        <Box sx={{ textAlign: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : !board ? (
        <Alert severity="info">No hay tablero configurado.</Alert>
      ) : view === 'matrix' ? (
        // ── Vista MATRIZ EISENHOWER (2×2) — muestra TODAS las tareas ──
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
          {QUADRANTS.map((q) => {
            const qTasks = filteredTasks.filter(t => t.eisenhower === q.key);
            return (
              <Box key={q.key} sx={{ bgcolor: q.bg, borderRadius: 2, p: 1.25, borderTop: `3px solid ${q.color}`, minHeight: 160 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography fontWeight={800} fontSize={14} sx={{ flex: 1, color: q.color }}>{q.title}</Typography>
                  <Chip label={qTasks.length} size="small" sx={{ height: 20 }} />
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {qTasks.map(renderTaskCard)}
                  {qTasks.length === 0 && <Typography fontSize={12} color="text.disabled" sx={{ px: 0.5, py: 2, textAlign: 'center' }}>—</Typography>}
                </Box>
              </Box>
            );
          })}
        </Box>
      ) : (
        // ── Vista COLUMNAS (Kanban). En "Todas" se oculta la sección "Algún día" ──
        <Box sx={{ overflowX: 'auto', pb: 2 }}>
          <Box sx={{ display: 'flex', gap: 1.5, minWidth: 'min-content' }}>
            {board.columns.map((col) => {
              const colTasks = filteredTasks.filter(t => t.column_id === col.id && (
                // En "Todas" se ocultan solo las de "Algún día". Ojo: si el tablero
                // no tiene esa sección, somedayId es null y compararlo contra un
                // section_id null escondería TODAS las tareas sin sub-sección.
                activeSection === null ? (somedayId === null || t.section_id !== somedayId) : t.section_id === activeSection
              ));
              return (
                <Box key={col.id} sx={{ width: 268, flex: 'none', bgcolor: '#F4EEE6', borderRadius: 2, p: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5, py: 0.5, borderTop: `3px solid ${col.color}`, borderRadius: '3px 3px 0 0' }}>
                    <Typography fontWeight={800} fontSize={13.5} sx={{ flex: 1 }}>{col.name}</Typography>
                    {col.gate_checklist && <Tooltip title="Requiere checklist para avanzar"><Chip label="gate" size="small" sx={{ height: 18, fontSize: 10, bgcolor: '#FBE6D8', color: '#B23F12' }} /></Tooltip>}
                    {col.is_done && <Tooltip title="Al mover aquí se cierra la tarea y se sella el tiempo"><Chip label="cierra" size="small" sx={{ height: 18, fontSize: 10, bgcolor: '#E4F1E8', color: '#2E7D46' }} /></Tooltip>}
                    <Chip label={colTasks.length} size="small" sx={{ height: 20 }} />
                  </Box>
                  <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {colTasks.map(renderTaskCard)}
                    {colTasks.length === 0 && <Typography fontSize={12} color="text.disabled" sx={{ px: 0.5, py: 2, textAlign: 'center' }}>—</Typography>}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* Crear tarea */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Nueva tarea{board ? ` · ${board.name}` : ''}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Título (usa un verbo de acción)" margin="dense"
            placeholder={isOperativo ? 'Ej: Cerrar importación — Cliente Juan' : 'Ej: Reparar impresora de mostrador'}
            value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <TextField fullWidth label="Descripción" margin="dense" multiline rows={2}
            value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
            <FormControl fullWidth size="small" required error={!form.eisenhower}>
              <InputLabel shrink>Prioridad (Eisenhower) *</InputLabel>
              <Select label="Prioridad (Eisenhower) *" notched displayEmpty value={form.eisenhower} onChange={e => setForm({ ...form, eisenhower: e.target.value })}>
                <MenuItem value="" disabled><em>Selecciona la prioridad…</em></MenuItem>
                {EIS_ALTA.map((k) => <MenuItem key={k} value={k}>{EIS[k].label}{EIS_ALTA_NOTA[k] ? ` (${EIS_ALTA_NOTA[k]})` : ''}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Columna</InputLabel>
              <Select label="Columna" value={form.column_id} onChange={e => setForm({ ...form, column_id: e.target.value })}>
                {board?.columns.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
          {form.eisenhower === 'eliminar' ? (
            <Box sx={{ mt: 1.5 }}>
              <Alert severity="info" sx={{ py: 0.25 }}>Esta tarea se asignará automáticamente a la sub-sección <b>💤 Algún día</b> y no se mostrará en “Todas”.</Alert>
            </Box>
          ) : sections.filter(s => !s.is_someday).length > 0 && (
            <Box sx={{ mt: 1.5 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Sub-sección</InputLabel>
                <Select label="Sub-sección" value={form.section_id || ''} onChange={e => setForm({ ...form, section_id: e.target.value })}>
                  <MenuItem value="">Sin sub-sección</MenuItem>
                  {sections.filter(s => !s.is_someday).map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 1.5, mt: 1.5 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Responsable principal</InputLabel>
              <Select label="Responsable principal" value={form.assignee_id} onChange={e => setForm({ ...form, assignee_id: e.target.value })}>
                <MenuItem value="">Sin asignar</MenuItem>
                {(() => {
                  // Opciones = responsables configurados del tablero + los involucrados
                  // elegidos (para poder nombrar responsable a quien acabas de involucrar).
                  const m = new Map<number, UserOpt>();
                  for (const u of assignees) if (isPickableGroup(u.role)) m.set(u.id, u);
                  for (const u of users) if (involvedIds.includes(u.id) && isPickableGroup(u.role)) m.set(u.id, u);
                  const opts = Array.from(m.values())
                    .sort((a, b) => groupRank(roleGroup(a.role)) - groupRank(roleGroup(b.role)) || a.full_name.localeCompare(b.full_name));
                  if (opts.length === 0) return <MenuItem value="" disabled>Agrega un involucrado para elegir responsable</MenuItem>;
                  return opts.map(u => {
                    const avg = u.avg_resolution_seconds != null ? Number(u.avg_resolution_seconds) : null;
                    return (
                      <MenuItem key={u.id} value={u.id}>
                        {u.full_name}
                        <Typography component="span" fontSize={12} color="text.secondary" sx={{ ml: 0.75 }}>
                          · ⏱ {avg && avg > 0 ? `${fmtDur(avg * 1000)} prom.` : 'sin datos'}
                        </Typography>
                      </MenuItem>
                    );
                  });
                })()}
              </Select>
            </FormControl>
            <TextField fullWidth size="small" required type="datetime-local" label="Fecha deseada *" InputLabelProps={{ shrink: true }}
              error={!form.due_at}
              value={form.due_at} onChange={e => setForm({ ...form, due_at: e.target.value })} />
          </Box>
          {/* Involucrados (otros responsables) — buscador agrupado por tipo + chips
              de grupo, igual que en Mis Tareas. */}
          <Box sx={{ mt: 1.5 }}>
            <Autocomplete
              multiple size="small" disableCloseOnSelect
              options={[...users].filter(u => u.id !== form.assignee_id && isPickableGroup(u.role))
                .sort((a, b) => groupRank(roleGroup(a.role)) - groupRank(roleGroup(b.role)) || roleGroup(a.role).localeCompare(roleGroup(b.role)) || a.full_name.localeCompare(b.full_name))}
              value={users.filter(u => u.id !== form.assignee_id && involvedIds.includes(u.id))}
              onChange={(_, val) => setInvolvedIds(val.map(u => u.id))}
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
                  <Typography variant="body2">{u.full_name}</Typography>
                </li>
              )}
              renderInput={(params) => <TextField {...params} label="Involucrados (otros responsables)" placeholder="Buscar por nombre o tipo…" />}
            />
            {/* Agregar por grupo */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
              <Chip label="👥 Todos los empleados" size="small"
                onClick={() => setInvolvedIds(Array.from(new Set(users.filter(u => u.id !== form.assignee_id && isPickableGroup(u.role)).map(u => u.id))))}
                sx={{ bgcolor: '#FFF3EC', color: '#D6521C', fontWeight: 700, border: '1px solid #F0B79A' }} />
              {Array.from(new Set(users.filter(u => u.id !== form.assignee_id && isPickableGroup(u.role)).map(u => roleGroup(u.role))))
                .sort((a, b) => groupRank(a) - groupRank(b) || a.localeCompare(b)).map(g => (
                <Chip key={g} label={`+ ${g}`} size="small" variant="outlined"
                  onClick={() => setInvolvedIds(Array.from(new Set([...involvedIds, ...users.filter(u => u.id !== form.assignee_id && roleGroup(u.role) === g).map(u => u.id)])))}
                  sx={{ fontWeight: 600, borderColor: '#ddd' }} />
              ))}
            </Box>
          </Box>
          {/* Checklist (subtareas) al crear — como en Mis Tareas */}
          <Box sx={{ mt: 2 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 0.75 }}>☑️ Checklist</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField fullWidth size="small" placeholder="Agregar punto del checklist…"
                value={subInput} onChange={e => setSubInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const v = subInput.trim(); if (v) { setNewSubtasks(prev => [...prev, v]); setSubInput(''); } } }} />
              <Button variant="outlined" onClick={() => { const v = subInput.trim(); if (v) { setNewSubtasks(prev => [...prev, v]); setSubInput(''); } }}
                sx={{ minWidth: 44 }}>+</Button>
            </Box>
            {newSubtasks.length > 0 && (
              <Box sx={{ mt: 1 }}>
                {newSubtasks.map((s, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
                    <Typography variant="body2" sx={{ flex: 1 }}>• {s}</Typography>
                    <IconButton size="small" onClick={() => setNewSubtasks(prev => prev.filter((_, k) => k !== i))}><CloseIcon sx={{ fontSize: 16 }} /></IconButton>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
          {/* Archivos adjuntos (fotos, PDF, Excel…) */}
          <Box sx={{ mt: 2 }}>
            <Button component="label" size="small" startIcon={<AttachFileIcon />} sx={{ textTransform: 'none' }}>
              Agregar archivos (fotos, PDF, Excel)
              <input hidden type="file" accept={ACCEPT_FILES} multiple
                onChange={e => { const fs = Array.from(e.target.files || []); if (fs.length) setNewPhotos(prev => [...prev, ...fs]); e.currentTarget.value = ''; }} />
            </Button>
            {newPhotos.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                {newPhotos.map((f, idx) => (
                  <Box key={idx} sx={{ position: 'relative' }}>
                    {isImgFile(f.name) ? (
                      <Box component="img" src={URL.createObjectURL(f)} alt={f.name}
                        sx={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 1, border: '1px solid #ddd' }} />
                    ) : (
                      <Box sx={{ width: 120, height: 64, borderRadius: 1, border: '1px solid #ddd', p: 0.75, display: 'flex', flexDirection: 'column', justifyContent: 'center', bgcolor: '#FAFAFA' }}>
                        <Typography sx={{ fontSize: 20, lineHeight: 1 }}>{fileIco(f.name)}</Typography>
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
          <Button onClick={() => { setCreateOpen(false); setNewPhotos([]); setNewSubtasks([]); setSubInput(''); }}>Cancelar</Button>
          <Button variant="contained" onClick={createTask} disabled={creating || !form.title.trim() || !form.eisenhower || !form.due_at} sx={{ bgcolor: '#D6521C', '&:hover': { bgcolor: '#B23F12' } }}>{creating ? 'Creando…' : 'Crear'}</Button>
        </DialogActions>
      </Dialog>

      {/* Nuevo tablero (departamento) */}
      <Dialog open={newBoardOpen} onClose={() => setNewBoardOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Nuevo tablero de departamento</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Se crea con el flujo: <b>📥 Nueva tarea → ⚙️ En proceso → ✅ Terminado</b>. Al mover una tarjeta a “Terminado” se cierra y se sella el tiempo.
          </Typography>
          <TextField autoFocus fullWidth label="Nombre del departamento / tablero" margin="dense"
            placeholder="Ej: Sistemas, Contabilidad, Marketing…"
            value={newBoardName} onChange={e => setNewBoardName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createBoard(); }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewBoardOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={createBoard} sx={{ bgcolor: '#D6521C', '&:hover': { bgcolor: '#B23F12' } }}>Crear tablero</Button>
        </DialogActions>
      </Dialog>

      {/* Configurar responsables elegibles del tablero */}
      <Dialog open={cfgOpen} onClose={() => setCfgOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Responsables · {board?.name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Define quién puede aparecer como <b>Responsable</b> al crear una tarea en este tablero.
            Si no eliges nada, se muestran todos los usuarios activos.
          </Typography>
          <Typography fontWeight={700} fontSize={14} sx={{ mb: 0.5 }}>Por rol</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', mb: 2 }}>
            {allRoles.map(r => (
              <FormControlLabel key={r} sx={{ width: '48%', m: 0 }} control={
                <MCheckbox size="small" checked={cfgRoles.includes(r)}
                  onChange={() => setCfgRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])} />
              } label={<Typography fontSize={13}>{r}</Typography>} />
            ))}
          </Box>
          <Typography fontWeight={700} fontSize={14} sx={{ mb: 0.5 }}>Usuarios específicos (se suman a los roles)</Typography>
          <FormControl fullWidth size="small">
            <InputLabel>Usuarios</InputLabel>
            <Select multiple value={cfgUserIds} input={<OutlinedInput label="Usuarios" />}
              onChange={e => setCfgUserIds(typeof e.target.value === 'string' ? [] : (e.target.value as number[]))}
              renderValue={(sel) => `${(sel as number[]).length} usuario(s) seleccionado(s)`}
              MenuProps={{ PaperProps: { style: { maxHeight: 320 } } }}>
              {users.map(u => (
                <MenuItem key={u.id} value={u.id}>
                  <MCheckbox size="small" checked={cfgUserIds.includes(u.id)} />
                  <ListItemText primary={`${u.full_name}${u.role ? ` · ${u.role}` : ''}`} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Elegibles actuales: <b>{assignees.length}</b> usuario(s).
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCfgRoles([]); setCfgUserIds([]); }}>Limpiar</Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setCfgOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={saveCfg} sx={{ bgcolor: '#D6521C', '&:hover': { bgcolor: '#B23F12' } }}>Guardar</Button>
        </DialogActions>
      </Dialog>

      {detailId && (
        <TaskDetail id={detailId} board={board} onClose={() => setDetailId(null)} onChanged={refresh} notify={notify} />
      )}

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ ...snack, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snack.sev} onClose={() => setSnack({ ...snack, open: false })}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}

// ── Detalle de tarea ──
function TaskDetail({ id, board, onClose, onChanged, notify }: any) {
  const [data, setData] = useState<any>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [newSub, setNewSub] = useState('');
  const [subPhoto, setSubPhoto] = useState(false);
  const [delAttId, setDelAttId] = useState<number | null>(null);
  // Edición inline (título, descripción, responsable, fecha, involucrados).
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [editing, setEditing] = useState(false);
  const [eForm, setEForm] = useState<any>({ title: '', description: '', assignee_id: '', due_at: '' });
  const [eInvolved, setEInvolved] = useState<number[]>([]);

  const reload = useCallback(async () => {
    try { const r = await axios.get(`${API_URL}/tasks/${id}`, H()); setData(r.data); } catch { /* */ }
  }, [id]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { axios.get(`${API_URL}/tasks/assignable-users`, H()).then(r => setUsers(r.data?.users || [])).catch(() => {}); }, []);

  const t = data?.task;
  const subs = data?.subtasks || [];
  const pending = subs.filter((s: any) => !s.done).length;
  const tt = t ? taskTime(t) : null;

  const toggleSub = async (sub: any) => {
    if (!sub.done && sub.requires_photo && !sub.evidence_url) { notify('Esta subtarea requiere evidencia (foto) — se sube desde la app', 'error'); return; }
    try { await axios.put(`${API_URL}/tasks/subtasks/${sub.id}`, { done: !sub.done }, H()); reload(); onChanged(); }
    catch (e: any) { notify(e?.response?.data?.error || 'Error', 'error'); }
  };
  const move = async (columnId: number, commitmentDate?: string | null) => {
    try {
      await axios.put(`${API_URL}/tasks/${id}`, {
        column_id: columnId,
        ...(commitmentDate !== undefined ? { commitment_date: commitmentDate } : {}),
      }, H());
      reload(); onChanged(); notify('Movida');
    } catch (e: any) { notify(e?.response?.data?.error || 'No se pudo mover', 'error'); }
  };
  // Al mover a "En proceso" (col_key en_proceso) se pide fecha/hora objetivo.
  const [etaDlg, setEtaDlg] = useState<{ open: boolean; columnId: number | null; value: string }>({ open: false, columnId: null, value: '' });
  const onPickColumn = (cid: number) => {
    const col = board?.columns.find((c: Col) => c.id === cid);
    if (col?.col_key === 'en_proceso' && Number(t?.column_id) !== cid) {
      // Prefill con el objetivo actual o la fecha deseada, si existen.
      const seed = t?.commitment_date || t?.due_at || '';
      const d = seed ? new Date(seed) : null;
      const local = d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
      setEtaDlg({ open: true, columnId: cid, value: local });
    } else {
      move(cid);
    }
  };
  const complete = async () => {
    // Gate: no se puede completar con checklist pendiente (Filtro de Cierre).
    if (pending > 0) { notify(`Completa el checklist antes de terminar (${pending} pendiente${pending === 1 ? '' : 's'}).`, 'error'); return; }
    setBusy(true);
    try {
      await axios.post(`${API_URL}/tasks/${id}/complete`, {}, H());
      notify('Tarea completada'); onChanged(); onClose();
    } catch (e: any) { notify(e?.response?.data?.error || 'No se pudo completar', 'error'); }
    finally { setBusy(false); }
  };
  const addComment = async () => {
    if (!comment.trim()) return;
    try { await axios.post(`${API_URL}/tasks/${id}/comments`, { body: comment.trim() }, H()); setComment(''); reload(); }
    catch { notify('Error al comentar', 'error'); }
  };
  const uploadPhotos = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData(); fd.append('photo', f);
        await axios.post(`${API_URL}/tasks/${id}/attachments`, fd, { headers: { ...H().headers, 'Content-Type': 'multipart/form-data' } });
      }
      notify('Foto(s) agregada(s)'); reload();
    } catch (e: any) { notify(e?.response?.data?.error || 'No se pudo subir la foto', 'error'); }
    finally { setBusy(false); }
  };
  const confirmDeletePhoto = async () => {
    if (delAttId == null) return;
    try { await axios.delete(`${API_URL}/tasks/attachments/${delAttId}`, H()); setDelAttId(null); reload(); notify('Archivo eliminado'); }
    catch (e: any) { notify(e?.response?.data?.error || 'No se pudo eliminar', 'error'); setDelAttId(null); }
  };
  const addSub = async () => {
    if (!newSub.trim()) return;
    try {
      await axios.post(`${API_URL}/tasks/${id}/subtasks`, { body: newSub.trim(), requires_photo: subPhoto }, H());
      setNewSub(''); setSubPhoto(false); reload(); onChanged();
    } catch (e: any) { notify(e?.response?.data?.error || 'No se pudo agregar la subtarea', 'error'); }
  };
  const deleteSub = async (subId: number) => {
    try { await axios.delete(`${API_URL}/tasks/subtasks/${subId}`, H()); reload(); onChanged(); }
    catch (e: any) { notify(e?.response?.data?.error || 'No se pudo eliminar', 'error'); }
  };
  const startEdit = () => {
    const d = t.due_at ? new Date(t.due_at) : null;
    setEForm({
      title: t.title || '', description: t.description || '', assignee_id: t.assignee_id || '',
      due_at: d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '',
    });
    setEInvolved((data?.participants || []).map((p: any) => p.id).filter((x: number) => x !== t.assignee_id));
    setEditing(true);
  };
  const saveEdit = async () => {
    if (!eForm.title.trim()) { notify('El título es obligatorio', 'error'); return; }
    try {
      await axios.put(`${API_URL}/tasks/${id}`, {
        title: eForm.title.trim(), description: eForm.description || null,
        assignee_id: eForm.assignee_id || null,
        due_at: eForm.due_at ? new Date(eForm.due_at).toISOString() : null,
        involved_ids: eInvolved,
      }, H());
      setEditing(false); reload(); onChanged(); notify('Cambios guardados');
    } catch (e: any) { notify(e?.response?.data?.error || 'No se pudo guardar', 'error'); }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      {!t ? <DialogContent><CircularProgress /></DialogContent> : (
        <>
          <DialogTitle sx={{ pr: 6 }}>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
              <Chip label={EIS[t.eisenhower]?.label} size="small" sx={{ height: 20, bgcolor: EIS[t.eisenhower]?.bg, color: EIS[t.eisenhower]?.color, fontWeight: 700 }} />
              {t.status === 'completed' && <Chip label="✅ Completada" size="small" color="success" />}
            </Box>
            <Typography fontWeight={800} fontSize={17}>
              <Box component="span" sx={{ color: '#8A8A8A', mr: 0.6 }}>#{t.id}</Box>
              {t.title}
            </Typography>
            <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
          </DialogTitle>
          <DialogContent dividers>
            {!editing ? (
              <>
                {t.description && <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{t.description}</Typography>}
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1 }}>
                  <Typography variant="body2"><b>Responsable:</b> {t.assignee_name || '—'}</Typography>
                  {t.due_at && <Typography variant="body2" color={t.overdue ? 'error.main' : 'inherit'}><b>Fecha deseada:</b> {new Date(t.due_at).toLocaleString('es-MX')}</Typography>}
                  {t.linked_id && <Typography variant="body2"><b>Ligada:</b> {t.linked_id}</Typography>}
                </Box>
                {/* Involucrados */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                  <Typography variant="body2"><b>Involucrados:</b></Typography>
                  {(data?.participants || []).length === 0 ? (
                    <Typography variant="body2" color="text.secondary">Solo el responsable</Typography>
                  ) : (data.participants).map((p: any) => (
                    <Chip key={p.id} size="small" label={p.full_name}
                      sx={{ height: 22, fontSize: 11, bgcolor: p.id === t.assignee_id ? '#FDECE4' : '#EDE7F6', color: p.id === t.assignee_id ? '#D6521C' : '#5E35B1', fontWeight: 600 }} />
                  ))}
                  {data?.can_edit && t.status !== 'completed' && (
                    <Button size="small" startIcon={<EditIcon sx={{ fontSize: 16 }} />} onClick={startEdit}
                      sx={{ ml: 'auto', textTransform: 'none', color: '#D6521C' }}>Editar</Button>
                  )}
                </Box>
              </>
            ) : (
              /* ── Modo edición ── */
              <Box sx={{ mb: 1.5, p: 1.5, border: '1px solid #ECE4D8', borderRadius: 1.5, bgcolor: '#FCFAF7' }}>
                <TextField fullWidth size="small" label="Título" margin="dense" value={eForm.title} onChange={e => setEForm({ ...eForm, title: e.target.value })} />
                <TextField fullWidth size="small" label="Descripción" margin="dense" multiline minRows={2} value={eForm.description} onChange={e => setEForm({ ...eForm, description: e.target.value })} />
                <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Responsable principal</InputLabel>
                    <Select label="Responsable principal" value={eForm.assignee_id || ''} onChange={e => setEForm({ ...eForm, assignee_id: e.target.value })}>
                      <MenuItem value="">Sin asignar</MenuItem>
                      {users.map(u => <MenuItem key={u.id} value={u.id}>{u.full_name}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <TextField fullWidth size="small" type="datetime-local" label="Fecha deseada" InputLabelProps={{ shrink: true }}
                    value={eForm.due_at} onChange={e => setEForm({ ...eForm, due_at: e.target.value })} />
                </Box>
                {/* Involucrados con grupos */}
                <Box sx={{ mt: 1.5 }}>
                  <Autocomplete
                    multiple size="small" disableCloseOnSelect
                    options={[...users].filter(u => u.id !== eForm.assignee_id).sort((a, b) => roleGroup(a.role).localeCompare(roleGroup(b.role)) || a.full_name.localeCompare(b.full_name))}
                    value={users.filter(u => u.id !== eForm.assignee_id && eInvolved.includes(u.id))}
                    onChange={(_, val) => setEInvolved(val.map(u => u.id))}
                    groupBy={u => roleGroup(u.role)}
                    getOptionLabel={u => u.full_name}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    filterOptions={(opts, { inputValue }) => { const q = inputValue.trim().toLowerCase(); return q ? opts.filter(u => u.full_name.toLowerCase().includes(q) || roleGroup(u.role).toLowerCase().includes(q)) : opts; }}
                    renderOption={(props, u) => (<li {...props} key={u.id}><Checkbox size="small" checked={eInvolved.includes(u.id)} sx={{ mr: 1, p: 0.5 }} /><Typography variant="body2">{u.full_name}</Typography></li>)}
                    renderInput={params => <TextField {...params} label="Involucrados" placeholder="Buscar por nombre o tipo…" />}
                  />
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
                    <Chip label="👥 Todos los empleados" size="small" onClick={() => setEInvolved(Array.from(new Set(users.filter(u => u.id !== eForm.assignee_id).map(u => u.id))))} sx={{ bgcolor: '#FFF3EC', color: '#D6521C', fontWeight: 700, border: '1px solid #F0B79A' }} />
                    {Array.from(new Set(users.filter(u => u.id !== eForm.assignee_id).map(u => roleGroup(u.role)))).sort().map(g => (
                      <Chip key={g} label={`+ ${g}`} size="small" variant="outlined" onClick={() => setEInvolved(Array.from(new Set([...eInvolved, ...users.filter(u => u.id !== eForm.assignee_id && roleGroup(u.role) === g).map(u => u.id)])))} sx={{ fontWeight: 600, borderColor: '#ddd' }} />
                    ))}
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
                  <Button variant="contained" size="small" onClick={saveEdit} sx={{ bgcolor: '#D6521C', '&:hover': { bgcolor: '#B23F12' } }}>Guardar</Button>
                  <Button size="small" onClick={() => setEditing(false)}>Cancelar</Button>
                </Box>
              </Box>
            )}

            {/* Control de tiempo */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2, p: 1.25, bgcolor: '#F7F4EF', borderRadius: 1.5, border: '1px solid #ECE4D8' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccessTimeIcon sx={{ fontSize: 16, color: '#8A8A8A' }} />
                <Typography variant="body2"><b>Creada:</b> {t.created_at ? new Date(t.created_at).toLocaleString('es-MX') : '—'}</Typography>
              </Box>
              {t.completed_at && <Typography variant="body2"><b>Terminada:</b> {new Date(t.completed_at).toLocaleString('es-MX')}</Typography>}
              {t.commitment_date && !t.completed_at && (
                <Typography variant="body2"><b>🎯 Objetivo:</b> {new Date(t.commitment_date).toLocaleString('es-MX')}</Typography>
              )}
              {tt && (
                <Chip size="small" icon={<AccessTimeIcon />} color={tt.done ? 'success' : 'default'}
                  label={tt.done ? `Resuelta en ${fmtDur(tt.ms)}` : `${fmtDur(tt.ms)} transcurrido`}
                  sx={{ fontWeight: 700 }} />
              )}
            </Box>

            {/* Botón directo para poner "En proceso" (abre el prompt de fecha/hora
                objetivo). Sustituye al antiguo dropdown "Mover a columna". */}
            {(() => {
              const proc = board?.columns.find((c: Col) => c.col_key === 'en_proceso');
              if (!proc || t.status === 'completed' || Number(t.column_id) === Number(proc.id)) return null;
              return (
                <Button variant="outlined" startIcon={<AccessTimeIcon />} onClick={() => onPickColumn(proc.id)}
                  sx={{ mb: 2, textTransform: 'none', color: '#B07206', borderColor: '#B07206', '&:hover': { borderColor: '#8a5a05', bgcolor: '#FFF7E8' } }}>
                  Poner en proceso
                </Button>
              );
            })()}

            {/* Diálogo: fecha/hora objetivo al pasar a "En proceso" */}
            <Dialog open={etaDlg.open} onClose={() => setEtaDlg({ open: false, columnId: null, value: '' })} maxWidth="xs" fullWidth>
              <DialogTitle sx={{ fontWeight: 800 }}>⚙️ Poner en proceso</DialogTitle>
              <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  ¿Para cuándo estimas tenerla lista? Elige la <b>fecha y hora objetivo</b> de respuesta.
                </Typography>
                <TextField type="datetime-local" fullWidth size="small" label="Fecha y hora objetivo"
                  InputLabelProps={{ shrink: true }} value={etaDlg.value}
                  onChange={e => setEtaDlg(s => ({ ...s, value: e.target.value }))} />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => { const cid = etaDlg.columnId; setEtaDlg({ open: false, columnId: null, value: '' }); if (cid) move(cid, null); }}>Omitir</Button>
                <Button variant="contained" disabled={!etaDlg.value}
                  onClick={() => { const cid = etaDlg.columnId; const iso = etaDlg.value ? new Date(etaDlg.value).toISOString() : null; setEtaDlg({ open: false, columnId: null, value: '' }); if (cid) move(cid, iso); }}
                  sx={{ bgcolor: '#D6521C', '&:hover': { bgcolor: '#B23F12' } }}>Poner en proceso</Button>
              </DialogActions>
            </Dialog>

            <Typography fontWeight={800} fontSize={14} sx={{ mb: 0.5 }}>
              Checklist {subs.length > 0 && `(${subs.length - pending}/${subs.length})`}
            </Typography>
            {subs.length > 0 && <LinearProgress variant="determinate" value={subs.length ? ((subs.length - pending) / subs.length) * 100 : 0} sx={{ mb: 1, borderRadius: 1 }} />}
            {subs.length === 0 ? <Typography variant="caption" color="text.secondary">Sin subtareas todavía.</Typography> :
              subs.map((s: any) => (
                <Box key={s.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, py: 0.25 }}>
                  <Checkbox size="small" checked={!!s.done} onChange={() => toggleSub(s)} disabled={t.status === 'completed'} sx={{ p: 0.5 }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ textDecoration: s.done ? 'line-through' : 'none', color: s.done ? 'text.disabled' : 'text.primary' }}>
                      {s.body} {s.requires_photo && <Chip label="📷 evidencia" size="small" sx={{ height: 16, fontSize: 9, ml: 0.5 }} />}
                    </Typography>
                    {s.done && s.done_by_name && <Typography variant="caption" color="text.secondary">✔ {s.done_by_name}</Typography>}
                  </Box>
                  {t.status !== 'completed' && (
                    <IconButton size="small" onClick={() => deleteSub(s.id)} sx={{ p: 0.3 }}>
                      <DeleteOutlineIcon sx={{ fontSize: 16, color: '#B0B0B0' }} />
                    </IconButton>
                  )}
                </Box>
              ))}
            {t.status !== 'completed' && (
              <Box sx={{ mt: 1 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField fullWidth size="small" placeholder="Nueva subtarea del checklist…" value={newSub}
                    onChange={e => setNewSub(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSub(); }} />
                  <Button variant="outlined" size="small" onClick={addSub} disabled={!newSub.trim()}
                    sx={{ textTransform: 'none', flex: 'none', borderColor: '#D6521C', color: '#D6521C' }}>Agregar</Button>
                </Box>
                <FormControlLabel sx={{ mt: 0.25 }} control={
                  <MCheckbox size="small" checked={subPhoto} onChange={e => setSubPhoto(e.target.checked)} />
                } label={<Typography fontSize={12} color="text.secondary">Requiere evidencia (foto) para palomearla</Typography>} />
              </Box>
            )}

            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography fontWeight={800} fontSize={14}>Archivos {(data.attachments || []).length > 0 && `(${(data.attachments || []).length})`}</Typography>
              <Button component="label" size="small" startIcon={<AttachFileIcon />} disabled={busy} sx={{ textTransform: 'none' }}>
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
                      {isImgFile(a.file_name) ? (
                        <Box component="img" src={a.url} alt={a.file_name || 'foto'}
                          sx={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 1, border: '1px solid #ddd' }} />
                      ) : (
                        <Box sx={{ width: 130, height: 80, borderRadius: 1, border: '1px solid #ddd', p: 0.75, display: 'flex', flexDirection: 'column', justifyContent: 'center', bgcolor: '#FAFAFA' }}>
                          <Typography sx={{ fontSize: 24, lineHeight: 1 }}>{fileIco(a.file_name)}</Typography>
                          <Typography variant="caption" color="text.primary" noWrap title={a.file_name}>{a.file_name}</Typography>
                          <Typography variant="caption" color="primary">Abrir</Typography>
                        </Box>
                      )}
                    </a>
                    <IconButton size="small" onClick={() => setDelAttId(a.id)}
                      sx={{ position: 'absolute', top: -8, right: -8, bgcolor: '#fff', boxShadow: 1, p: 0.2, '&:hover': { bgcolor: '#fff' } }}>
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            )}

            <Divider sx={{ my: 2 }} />
            <Typography fontWeight={800} fontSize={14} sx={{ mb: 1 }}>Comentarios (rastro oficial)</Typography>
            {(data.comments || []).map((c: any) => (
              <Box key={c.id} sx={{ mb: 1 }}>
                <Typography variant="caption" color="text.secondary"><b>{c.author_name || '—'}</b> · {new Date(c.created_at).toLocaleString('es-MX')}</Typography>
                <Typography variant="body2">{c.body}</Typography>
              </Box>
            ))}
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <TextField fullWidth size="small" placeholder="Deja un comentario…" value={comment}
                onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addComment(); }} />
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
                      <Typography variant="caption" color="text.secondary">{a.actor_name || '—'} · {new Date(a.created_at).toLocaleString('es-MX')}</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            {t.status !== 'completed' && (
              <Button variant="contained" color="success" startIcon={<CheckCircleIcon />} onClick={complete} disabled={busy || pending > 0}>
                {pending > 0 ? `Completa el checklist (${pending})` : 'Completar'}
              </Button>
            )}
            <Button onClick={onClose}>Cerrar</Button>
          </DialogActions>

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
