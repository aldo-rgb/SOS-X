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
  Avatar, Divider, Checkbox, Tooltip, Snackbar, Alert, LinearProgress, Tabs, Tab,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SendIcon from '@mui/icons-material/Send';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import { Checkbox as MCheckbox, FormControlLabel, ListItemText, OutlinedInput } from '@mui/material';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const getToken = () => localStorage.getItem('token') || '';
const H = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });
const myRole = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}')?.role || ''; } catch { return ''; } })();
const isSuperAdmin = myRole === 'super_admin';

const EIS: Record<string, { label: string; color: string; bg: string }> = {
  fuego:    { label: '🔥 Urgente e importante',       color: '#C0392B', bg: '#F9E5E2' },
  estrella: { label: '⭐ Importante y no urgente',    color: '#2E7D46', bg: '#E4F1E8' },
  delegar:  { label: '🔄 Urgente y no importante',    color: '#B07206', bg: '#F7ECD5' },
  eliminar: { label: '🗑️ No importante y no urgente', color: '#5A6472', bg: '#ECEEF0' },
};
const XPS: Record<string, { label: string; color: string }> = {
  verde:    { label: '🟢 Vendido',   color: '#2E7D46' },
  amarillo: { label: '🟡 Ofrecido',  color: '#B07206' },
  rojo:     { label: '🔴 No ofrecido', color: '#C0392B' },
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

interface Col { id: number; col_key: string; name: string; color: string; gate_checklist: boolean; is_done?: boolean; sort_order: number; }
interface Board { id: number; name: string; board_type: string; columns: Col[]; lead_name?: string | null; }
interface Task {
  id: number; column_id: number; title: string; description?: string; assignee_id?: number;
  assignee_name?: string; due_at?: string; eisenhower: string; xpay_seguro?: string; status: string;
  created_at?: string; completed_at?: string;
  subtasks_total: number; subtasks_done: number; comments: number; overdue: boolean;
}
interface UserOpt { id: number; full_name: string; role?: string; }

export default function TareasPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' });
  const notify = (msg: string, sev: 'success' | 'error' = 'success') => setSnack({ open: true, msg, sev });

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<any>({ title: '', description: '', eisenhower: 'estrella', assignee_id: '', due_at: '', column_id: '' });
  const [detailId, setDetailId] = useState<number | null>(null);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  // Responsables elegibles del tablero activo (según su config por rol/usuarios).
  const [assignees, setAssignees] = useState<UserOpt[]>([]);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgRoles, setCfgRoles] = useState<string[]>([]);
  const [cfgUserIds, setCfgUserIds] = useState<number[]>([]);

  const board = boards.find(b => b.id === activeId) || null;

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
      setAssignees((r.data?.users || []).map((u: any) => ({ id: u.id, full_name: u.full_name, role: u.role })));
      setCfgRoles(r.data?.config?.roles || []);
      setCfgUserIds(r.data?.config?.user_ids || []);
    } catch { setAssignees([]); }
  }, []);

  useEffect(() => { loadBoards(); }, [loadBoards]);
  useEffect(() => { if (activeId) { loadTasks(activeId); loadAssignees(activeId); } }, [activeId, loadTasks, loadAssignees]);
  useEffect(() => {
    axios.get(`${API_URL}/admin/users`, H())
      .then(r => setUsers((Array.isArray(r.data) ? r.data : r.data?.users || []).map((u: any) => ({ id: u.id, full_name: u.full_name, role: u.role }))))
      .catch(() => {});
  }, []);

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
    try {
      await axios.post(`${API_URL}/tasks`, {
        board_id: board?.id, title: form.title.trim(), description: form.description || null,
        eisenhower: form.eisenhower, assignee_id: form.assignee_id || null,
        due_at: form.due_at || null, column_id: form.column_id || null,
      }, H());
      setCreateOpen(false);
      setForm({ title: '', description: '', eisenhower: 'estrella', assignee_id: '', due_at: '', column_id: '' });
      notify('Tarea creada');
      refresh();
    } catch (e: any) { notify(e?.response?.data?.error || 'Error al crear', 'error'); }
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
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)} disabled={!board}
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
                {b.board_type === 'operativo' ? '🎯' : '🗂️'} {b.name}
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

      {loading ? (
        <Box sx={{ textAlign: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : !board ? (
        <Alert severity="info">No hay tablero configurado.</Alert>
      ) : (
        <Box sx={{ overflowX: 'auto', pb: 2 }}>
          <Box sx={{ display: 'flex', gap: 1.5, minWidth: 'min-content' }}>
            {board.columns.map((col) => {
              const colTasks = tasks.filter(t => t.column_id === col.id);
              return (
                <Box key={col.id} sx={{ width: 268, flex: 'none', bgcolor: '#F4EEE6', borderRadius: 2, p: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5, py: 0.5, borderTop: `3px solid ${col.color}`, borderRadius: '3px 3px 0 0' }}>
                    <Typography fontWeight={800} fontSize={13.5} sx={{ flex: 1 }}>{col.name}</Typography>
                    {col.gate_checklist && <Tooltip title="Requiere checklist para avanzar"><Chip label="gate" size="small" sx={{ height: 18, fontSize: 10, bgcolor: '#FBE6D8', color: '#B23F12' }} /></Tooltip>}
                    {col.is_done && <Tooltip title="Al mover aquí se cierra la tarea y se sella el tiempo"><Chip label="cierra" size="small" sx={{ height: 18, fontSize: 10, bgcolor: '#E4F1E8', color: '#2E7D46' }} /></Tooltip>}
                    <Chip label={colTasks.length} size="small" sx={{ height: 20 }} />
                  </Box>
                  <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {colTasks.map((t) => {
                      const tt = taskTime(t);
                      return (
                        <Box key={t.id} onClick={() => setDetailId(t.id)}
                          sx={{ bgcolor: '#fff', borderRadius: 1.5, p: 1.25, cursor: 'pointer', border: '1px solid #E8DFD3',
                            '&:hover': { boxShadow: 2 }, borderLeft: t.overdue ? '3px solid #C0392B' : '1px solid #E8DFD3', opacity: t.status === 'completed' ? 0.72 : 1 }}>
                          <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5, flexWrap: 'wrap' }}>
                            <Chip label={EIS[t.eisenhower]?.label || t.eisenhower} size="small"
                              sx={{ height: 20, fontSize: 11, bgcolor: EIS[t.eisenhower]?.bg, color: EIS[t.eisenhower]?.color, fontWeight: 700 }} />
                            {t.xpay_seguro && <Chip label={XPS[t.xpay_seguro]?.label} size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }} />}
                          </Box>
                          <Typography fontSize={13.5} fontWeight={600} sx={{ lineHeight: 1.3, textDecoration: t.status === 'completed' ? 'line-through' : 'none' }}>{t.title}</Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
                            {t.assignee_name ? (
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
                    })}
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
            <FormControl fullWidth size="small">
              <InputLabel>Prioridad (Eisenhower) *</InputLabel>
              <Select label="Prioridad (Eisenhower) *" value={form.eisenhower} onChange={e => setForm({ ...form, eisenhower: e.target.value })}>
                {Object.entries(EIS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Columna</InputLabel>
              <Select label="Columna" value={form.column_id} onChange={e => setForm({ ...form, column_id: e.target.value })}>
                {board?.columns.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, mt: 1.5 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Responsable</InputLabel>
              <Select label="Responsable" value={form.assignee_id} onChange={e => setForm({ ...form, assignee_id: e.target.value })}>
                <MenuItem value="">Sin asignar</MenuItem>
                {assignees.map(u => <MenuItem key={u.id} value={u.id}>{u.full_name} {u.role ? `· ${u.role}` : ''}</MenuItem>)}
                {assignees.length === 0 && <MenuItem value="" disabled>No hay responsables configurados</MenuItem>}
              </Select>
            </FormControl>
            <TextField fullWidth size="small" type="datetime-local" label="Fecha límite" InputLabelProps={{ shrink: true }}
              value={form.due_at} onChange={e => setForm({ ...form, due_at: e.target.value })} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={createTask} sx={{ bgcolor: '#D6521C', '&:hover': { bgcolor: '#B23F12' } }}>Crear</Button>
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

  const reload = useCallback(async () => {
    try { const r = await axios.get(`${API_URL}/tasks/${id}`, H()); setData(r.data); } catch { /* */ }
  }, [id]);
  useEffect(() => { reload(); }, [reload]);

  const t = data?.task;
  const subs = data?.subtasks || [];
  const pending = subs.filter((s: any) => !s.done).length;
  const tt = t ? taskTime(t) : null;

  const toggleSub = async (sub: any) => {
    if (!sub.done && sub.requires_photo && !sub.evidence_url) { notify('Esta subtarea requiere evidencia (foto) — se sube desde la app', 'error'); return; }
    try { await axios.put(`${API_URL}/tasks/subtasks/${sub.id}`, { done: !sub.done }, H()); reload(); onChanged(); }
    catch (e: any) { notify(e?.response?.data?.error || 'Error', 'error'); }
  };
  const move = async (columnId: number) => {
    try { await axios.put(`${API_URL}/tasks/${id}`, { column_id: columnId }, H()); reload(); onChanged(); notify('Movida'); }
    catch (e: any) { notify(e?.response?.data?.error || 'No se pudo mover', 'error'); }
  };
  const complete = async () => {
    setBusy(true);
    try {
      if (pending > 0) {
        const reason = window.prompt(`Faltan ${pending} subtarea(s). Solo gerencia puede forzar el cierre. Motivo:`);
        if (!reason) { setBusy(false); return; }
        await axios.post(`${API_URL}/tasks/${id}/complete`, { forced_reason: reason }, H());
      } else {
        await axios.post(`${API_URL}/tasks/${id}/complete`, {}, H());
      }
      notify('Tarea completada'); onChanged(); onClose();
    } catch (e: any) { notify(e?.response?.data?.error || 'No se pudo completar', 'error'); }
    finally { setBusy(false); }
  };
  const addComment = async () => {
    if (!comment.trim()) return;
    try { await axios.post(`${API_URL}/tasks/${id}/comments`, { body: comment.trim() }, H()); setComment(''); reload(); }
    catch { notify('Error al comentar', 'error'); }
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
            <Typography fontWeight={800} fontSize={17}>{t.title}</Typography>
            <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
          </DialogTitle>
          <DialogContent dividers>
            {t.description && <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{t.description}</Typography>}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1.5 }}>
              <Typography variant="body2"><b>Responsable:</b> {t.assignee_name || '—'}</Typography>
              {t.due_at && <Typography variant="body2" color={t.overdue ? 'error.main' : 'inherit'}><b>Vence:</b> {new Date(t.due_at).toLocaleString('es-MX')}</Typography>}
              {t.linked_id && <Typography variant="body2"><b>Ligada:</b> {t.linked_id}</Typography>}
            </Box>

            {/* Control de tiempo */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2, p: 1.25, bgcolor: '#F7F4EF', borderRadius: 1.5, border: '1px solid #ECE4D8' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccessTimeIcon sx={{ fontSize: 16, color: '#8A8A8A' }} />
                <Typography variant="body2"><b>Creada:</b> {t.created_at ? new Date(t.created_at).toLocaleString('es-MX') : '—'}</Typography>
              </Box>
              {t.completed_at && <Typography variant="body2"><b>Terminada:</b> {new Date(t.completed_at).toLocaleString('es-MX')}</Typography>}
              {tt && (
                <Chip size="small" icon={<AccessTimeIcon />} color={tt.done ? 'success' : 'default'}
                  label={tt.done ? `Resuelta en ${fmtDur(tt.ms)}` : `${fmtDur(tt.ms)} transcurrido`}
                  sx={{ fontWeight: 700 }} />
              )}
            </Box>

            <FormControl size="small" sx={{ minWidth: 220, mb: 2 }}>
              <InputLabel>Mover a columna</InputLabel>
              <Select label="Mover a columna" value={t.column_id || ''} onChange={e => move(Number(e.target.value))}>
                {board?.columns.map((c: Col) => <MenuItem key={c.id} value={c.id}>{c.name}{c.is_done ? ' (cierra)' : ''}</MenuItem>)}
              </Select>
            </FormControl>

            <Typography fontWeight={800} fontSize={14} sx={{ mb: 0.5 }}>
              Checklist {subs.length > 0 && `(${subs.length - pending}/${subs.length})`}
            </Typography>
            {subs.length > 0 && <LinearProgress variant="determinate" value={subs.length ? ((subs.length - pending) / subs.length) * 100 : 0} sx={{ mb: 1, borderRadius: 1 }} />}
            {subs.length === 0 ? <Typography variant="caption" color="text.secondary">Sin subtareas.</Typography> :
              subs.map((s: any) => (
                <Box key={s.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, py: 0.25 }}>
                  <Checkbox size="small" checked={!!s.done} onChange={() => toggleSub(s)} disabled={t.status === 'completed'} sx={{ p: 0.5 }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ textDecoration: s.done ? 'line-through' : 'none', color: s.done ? 'text.disabled' : 'text.primary' }}>
                      {s.body} {s.requires_photo && <Chip label="📷 evidencia" size="small" sx={{ height: 16, fontSize: 9, ml: 0.5 }} />}
                    </Typography>
                    {s.done && s.done_by_name && <Typography variant="caption" color="text.secondary">✔ {s.done_by_name}</Typography>}
                  </Box>
                </Box>
              ))}

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
          </DialogContent>
          <DialogActions>
            {t.status !== 'completed' && (
              <Button variant="contained" color="success" startIcon={<CheckCircleIcon />} onClick={complete} disabled={busy}>
                {pending > 0 ? `Forzar cierre (${pending} pendientes)` : 'Completar'}
              </Button>
            )}
            <Button onClick={onClose}>Cerrar</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
