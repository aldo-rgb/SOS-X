// ============================================================
// TareasPage — Módulo Tareas (Fase 1) · tablero "Flujo Operativo"
// Solo super_admin / admin / director. Ver propuestas/tareas-diseno.html.
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Box, Typography, Button, IconButton, Chip, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Select, FormControl, InputLabel, CircularProgress,
  Avatar, Divider, Checkbox, Tooltip, Snackbar, Alert, LinearProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SendIcon from '@mui/icons-material/Send';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const getToken = () => localStorage.getItem('token') || '';
const H = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });

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

interface Col { id: number; col_key: string; name: string; color: string; gate_checklist: boolean; sort_order: number; }
interface Board { id: number; name: string; board_type: string; columns: Col[]; }
interface Task {
  id: number; column_id: number; title: string; description?: string; assignee_id?: number;
  assignee_name?: string; due_at?: string; eisenhower: string; xpay_seguro?: string; status: string;
  subtasks_total: number; subtasks_done: number; comments: number; overdue: boolean;
}
interface UserOpt { id: number; full_name: string; role?: string; }

export default function TareasPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' });
  const notify = (msg: string, sev: 'success' | 'error' = 'success') => setSnack({ open: true, msg, sev });

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<any>({ title: '', description: '', eisenhower: 'estrella', assignee_id: '', due_at: '', column_id: '' });
  const [detailId, setDetailId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const br = await axios.get(`${API_URL}/tasks/boards`, H());
      const flujo = (br.data?.boards || []).find((b: Board) => b.board_type === 'operativo') || br.data?.boards?.[0] || null;
      setBoard(flujo);
      if (flujo) {
        const tk = await axios.get(`${API_URL}/tasks?board_id=${flujo.id}`, H());
        setTasks(tk.data?.tasks || []);
      }
    } catch (e) { console.error(e); notify('No se pudieron cargar las tareas', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    axios.get(`${API_URL}/admin/users`, H())
      .then(r => setUsers((Array.isArray(r.data) ? r.data : r.data?.users || []).map((u: any) => ({ id: u.id, full_name: u.full_name, role: u.role }))))
      .catch(() => {});
  }, []);

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
      load();
    } catch (e: any) { notify(e?.response?.data?.error || 'Error al crear', 'error'); }
  };

  const initials = (n?: string) => (n || '?').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h5" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AssignmentTurnedInIcon sx={{ color: '#D6521C' }} /> Tareas · Flujo Operativo
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Responsabilidad absoluta: un responsable, una fecha, un rastro. El checklist bloquea el avance.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}
            sx={{ bgcolor: '#D6521C', '&:hover': { bgcolor: '#B23F12' } }}>Nueva tarea</Button>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load}>Actualizar</Button>
        </Box>
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
                    <Chip label={colTasks.length} size="small" sx={{ height: 20 }} />
                  </Box>
                  <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {colTasks.map((t) => (
                      <Box key={t.id} onClick={() => setDetailId(t.id)}
                        sx={{ bgcolor: '#fff', borderRadius: 1.5, p: 1.25, cursor: 'pointer', border: '1px solid #E8DFD3',
                          '&:hover': { boxShadow: 2 }, borderLeft: t.overdue ? '3px solid #C0392B' : '1px solid #E8DFD3' }}>
                        <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5, flexWrap: 'wrap' }}>
                          <Chip label={EIS[t.eisenhower]?.label || t.eisenhower} size="small"
                            sx={{ height: 20, fontSize: 11, bgcolor: EIS[t.eisenhower]?.bg, color: EIS[t.eisenhower]?.color, fontWeight: 700 }} />
                          {t.xpay_seguro && <Chip label={XPS[t.xpay_seguro]?.label} size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }} />}
                        </Box>
                        <Typography fontSize={13.5} fontWeight={600} sx={{ lineHeight: 1.3 }}>{t.title}</Typography>
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
                      </Box>
                    ))}
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
        <DialogTitle sx={{ fontWeight: 800 }}>Nueva tarea</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Título (usa un verbo de acción)" margin="dense"
            placeholder="Ej: Cerrar importación — Cliente Juan"
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
                {users.map(u => <MenuItem key={u.id} value={u.id}>{u.full_name} {u.role ? `· ${u.role}` : ''}</MenuItem>)}
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

      {detailId && (
        <TaskDetail id={detailId} board={board} onClose={() => setDetailId(null)} onChanged={() => { load(); }} notify={notify} />
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

            <FormControl size="small" sx={{ minWidth: 220, mb: 2 }}>
              <InputLabel>Mover a columna</InputLabel>
              <Select label="Mover a columna" value={t.column_id || ''} onChange={e => move(Number(e.target.value))} disabled={t.status === 'completed'}>
                {board?.columns.map((c: Col) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
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
