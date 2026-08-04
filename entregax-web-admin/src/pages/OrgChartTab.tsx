import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Box, Typography, Paper, IconButton, Button, Chip, Avatar, AvatarGroup, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, CircularProgress,
  Menu, MenuItem, ListItemIcon, ListItemText, Divider, Autocomplete, Checkbox,
  Snackbar, Alert, Stack,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, MoreVert as MoreVertIcon,
  PersonAdd as PersonAddIcon, Assignment as TaskIcon, Groups as GroupsIcon,
  AccountTree as AccountTreeIcon, Close as CloseIcon, PlaylistAddCheck as ChecklistIcon,
} from '@mui/icons-material';

const ORANGE = '#F05A28';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const getToken = () => localStorage.getItem('token') || '';
const authHeaders = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });

// ---- Tipos ----
interface Assignee {
  user_id: number;
  full_name: string;
  role: string;
  profile_photo_url?: string | null;
  employee_number?: string | null;
}
interface OrgNode {
  id: number;
  parent_id: number | null;
  node_type: 'department' | 'position';
  title: string;
  description: string | null;
  sort_order: number;
  task_count: number;
  assignees: Assignee[];
}
interface TaskItem { id: number; text: string; is_done: boolean; sort_order: number; }
interface PositionTask { id: number; node_id: number; title: string; description: string | null; sort_order: number; items: TaskItem[]; }
interface EmployeeLite { id: number; full_name: string; role: string; employee_number?: string; profile_photo_url?: string | null; }

const roleLabel = (role: string): string => {
  const m: Record<string, string> = {
    repartidor: 'Repartidor', warehouse_ops: 'Bodega', counter_staff: 'Mostrador',
    customer_service: 'Servicio Cliente', soporte_tecnico: 'Soporte Técnico', branch_manager: 'Operaciones',
    monitoreo: 'Monitoreo', abogado: 'Abogado', accountant: 'Contador', advisor: 'Asesor',
    sub_advisor: 'Sub-Asesor', director: 'Director', admin: 'Admin', super_admin: 'Super Admin',
  };
  return m[role] || role;
};
const initials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

export default function OrgChartTab() {
  const [nodes, setNodes] = useState<OrgNode[]>([]);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' | 'info' }>({ open: false, msg: '', sev: 'success' });
  const notify = (msg: string, sev: 'success' | 'error' | 'info' = 'success') => setSnack({ open: true, msg, sev });

  // Menú contextual
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuNode, setMenuNode] = useState<OrgNode | null>(null);

  // Dialogs
  const [nodeDialog, setNodeDialog] = useState<{ open: boolean; mode: 'edit' | 'create'; parent: OrgNode | null; node: OrgNode | null; title: string; description: string; asDepartment: boolean }>(
    { open: false, mode: 'create', parent: null, node: null, title: '', description: '', asDepartment: false });
  const [assignNode, setAssignNode] = useState<OrgNode | null>(null);
  const [tasksNode, setTasksNode] = useState<OrgNode | null>(null);
  const [confirmDel, setConfirmDel] = useState<OrgNode | null>(null);

  const loadChart = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/admin/hr/org-chart`, authHeaders());
      setNodes(res.data?.nodes || []);
    } catch (e: any) {
      notify(e?.response?.data?.error || 'No se pudo cargar el organigrama', 'error');
    } finally { setLoading(false); }
  }, []);

  const loadEmployees = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/hr/employees`, authHeaders());
      const list = (res.data?.employees || res.data || []) as any[];
      setEmployees(list.map(e => ({ id: e.id, full_name: e.full_name, role: e.role, employee_number: e.employee_number, profile_photo_url: e.profile_photo_url })));
    } catch { /* silencioso: la asignación sigue disponible al reintentar */ }
  }, []);

  useEffect(() => { loadChart(); loadEmployees(); }, [loadChart, loadEmployees]);

  // Índice padre → hijos
  const childrenOf = useMemo(() => {
    const map: Record<string, OrgNode[]> = {};
    for (const n of nodes) {
      const key = n.parent_id === null ? 'root' : String(n.parent_id);
      (map[key] ||= []).push(n);
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    return map;
  }, [nodes]);

  const departments = childrenOf['root'] || [];

  // ---- Acciones nodo ----
  const openMenu = (e: React.MouseEvent<HTMLElement>, node: OrgNode) => { setMenuAnchor(e.currentTarget); setMenuNode(node); };
  const closeMenu = () => { setMenuAnchor(null); setMenuNode(null); };

  const openCreateChild = (parent: OrgNode | null, asDepartment = false) => {
    setNodeDialog({ open: true, mode: 'create', parent, node: null, title: '', description: '', asDepartment });
    closeMenu();
  };
  const openEdit = (node: OrgNode) => {
    setNodeDialog({ open: true, mode: 'edit', parent: null, node, title: node.title, description: node.description || '', asDepartment: node.node_type === 'department' });
    closeMenu();
  };

  const saveNode = async () => {
    const { mode, parent, node, title, description, asDepartment } = nodeDialog;
    if (!title.trim()) { notify('El título es obligatorio', 'error'); return; }
    try {
      if (mode === 'create') {
        await axios.post(`${API_URL}/api/admin/hr/org-chart/nodes`, {
          parent_id: parent ? parent.id : null,
          title: title.trim(), description: description.trim() || null,
          node_type: asDepartment ? 'department' : 'position',
        }, authHeaders());
        notify('Puesto agregado');
      } else if (node) {
        await axios.put(`${API_URL}/api/admin/hr/org-chart/nodes/${node.id}`, {
          title: title.trim(), description: description.trim() || null,
        }, authHeaders());
        notify('Cambios guardados');
      }
      setNodeDialog(s => ({ ...s, open: false }));
      loadChart();
    } catch (e: any) { notify(e?.response?.data?.error || 'Error al guardar', 'error'); }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    try {
      await axios.delete(`${API_URL}/api/admin/hr/org-chart/nodes/${confirmDel.id}`, authHeaders());
      notify('Eliminado');
      setConfirmDel(null);
      loadChart();
    } catch (e: any) { notify(e?.response?.data?.error || 'Error al eliminar', 'error'); }
  };

  // ---- Render de un nodo (recursivo) ----
  const renderNode = (node: OrgNode, depth: number) => {
    const kids = childrenOf[String(node.id)] || [];
    return (
      <Box key={node.id} sx={{ position: 'relative', pl: depth > 0 ? 3 : 0 }}>
        {depth > 0 && (
          <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '2px', bgcolor: '#e0e0e0' }} />
        )}
        <Paper
          variant="outlined"
          sx={{
            p: 1.5, mb: 1.2, borderRadius: 2, borderLeft: `4px solid ${ORANGE}`,
            position: 'relative', '&:hover': { boxShadow: 2 },
          }}
        >
          {depth > 0 && (
            <Box sx={{ position: 'absolute', left: -24, top: 22, width: '22px', height: '2px', bgcolor: '#e0e0e0' }} />
          )}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.25 }}>{node.title}</Typography>
              {node.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.3, fontSize: 12.5 }}>
                  {node.description}
                </Typography>
              )}
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, flexWrap: 'wrap', gap: 0.8 }}>
                {node.assignees.length > 0 ? (
                  <AvatarGroup max={6} sx={{ '& .MuiAvatar-root': { width: 28, height: 28, fontSize: 12 } }}>
                    {node.assignees.map(a => (
                      <Tooltip key={a.user_id} title={`${a.full_name} · ${roleLabel(a.role)}`}>
                        <Avatar src={a.profile_photo_url || undefined} sx={{ bgcolor: ORANGE }}>{initials(a.full_name)}</Avatar>
                      </Tooltip>
                    ))}
                  </AvatarGroup>
                ) : (
                  <Chip size="small" variant="outlined" label="Sin asignar" sx={{ height: 22, fontSize: 11 }} />
                )}
                <Chip
                  size="small" icon={<TaskIcon sx={{ fontSize: 15 }} />}
                  label={`${node.task_count} ${node.task_count === 1 ? 'tarea' : 'tareas'}`}
                  onClick={() => setTasksNode(node)}
                  sx={{ height: 22, fontSize: 11, cursor: 'pointer' }}
                  color={node.task_count > 0 ? 'primary' : 'default'}
                  variant={node.task_count > 0 ? 'filled' : 'outlined'}
                />
              </Stack>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.3 }}>
              <Tooltip title="Asignar personal">
                <IconButton size="small" onClick={() => setAssignNode(node)}><PersonAddIcon fontSize="small" /></IconButton>
              </Tooltip>
              <IconButton size="small" onClick={(e) => openMenu(e, node)}><MoreVertIcon fontSize="small" /></IconButton>
            </Box>
          </Box>
        </Paper>
        {kids.length > 0 && <Box>{kids.map(k => renderNode(k, depth + 1))}</Box>}
      </Box>
    );
  };

  return (
    <Box>
      {/* Encabezado */}
      <Paper sx={{ p: 2.5, mb: 2, borderRadius: 2, borderLeft: `4px solid ${ORANGE}` }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <AccountTreeIcon sx={{ color: ORANGE, mt: 0.3 }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Organigrama · Estructura Organizacional</Typography>
            <Typography variant="body2" color="text.secondary">
              Cadena de mando y descriptivo de puestos de EntregaX. Es <strong>editable</strong>: puedes crear
              o modificar puestos, <strong>asignar personal</strong> de tu estructura y definir la <strong>lista de
              tareas por puesto</strong> (con checklist de trabajo). Por ahora las tareas del puesto son un catálogo
              interno y no se conectan con el módulo Tareas.
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => openCreateChild(null, true)}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d64d1e' }, whiteSpace: 'nowrap' }}>
            Nuevo Departamento
          </Button>
        </Stack>
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress sx={{ color: ORANGE }} /></Box>
      ) : departments.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <GroupsIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">Aún no hay departamentos. Crea el primero.</Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2, alignItems: 'start' }}>
          {departments.map(dept => (
            <Paper key={dept.id} sx={{ p: 2, borderRadius: 2, bgcolor: '#fafafa' }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: 16, color: ORANGE, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    {dept.title}
                  </Typography>
                  {dept.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.3, fontSize: 12.5 }}>{dept.description}</Typography>
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 0.3 }}>
                  <Tooltip title="Agregar puesto"><IconButton size="small" onClick={() => openCreateChild(dept, false)}><AddIcon fontSize="small" /></IconButton></Tooltip>
                  <IconButton size="small" onClick={(e) => openMenu(e, dept)}><MoreVertIcon fontSize="small" /></IconButton>
                </Box>
              </Box>
              <Divider sx={{ mb: 1.5 }} />
              {(childrenOf[String(dept.id)] || []).length === 0 ? (
                <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic', py: 1 }}>Sin puestos aún</Typography>
              ) : (
                (childrenOf[String(dept.id)] || []).map(child => renderNode(child, 0))
              )}
            </Paper>
          ))}
        </Box>
      )}

      {/* Menú contextual */}
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeMenu}>
        {menuNode && menuNode.node_type === 'position' && (
          <MenuItem onClick={() => menuNode && setTasksNode(menuNode)}>
            <ListItemIcon><TaskIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Tareas del puesto</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => menuNode && openCreateChild(menuNode, false)}>
          <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Agregar puesto debajo</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => menuNode && openEdit(menuNode)}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Editar</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { if (menuNode) setConfirmDel(menuNode); closeMenu(); }} sx={{ color: 'error.main' }}>
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Eliminar</ListItemText>
        </MenuItem>
      </Menu>

      {/* Dialog crear/editar nodo */}
      <Dialog open={nodeDialog.open} onClose={() => setNodeDialog(s => ({ ...s, open: false }))} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {nodeDialog.mode === 'create'
            ? (nodeDialog.asDepartment ? 'Nuevo departamento' : `Nuevo puesto${nodeDialog.parent ? ` en «${nodeDialog.parent.title}»` : ''}`)
            : `Editar ${nodeDialog.node?.node_type === 'department' ? 'departamento' : 'puesto'}`}
        </DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Nombre del puesto / departamento" margin="normal"
            value={nodeDialog.title} onChange={e => setNodeDialog(s => ({ ...s, title: e.target.value }))} />
          <TextField fullWidth label="Descripción / misión / responsabilidades" margin="normal" multiline minRows={3}
            value={nodeDialog.description} onChange={e => setNodeDialog(s => ({ ...s, description: e.target.value }))} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setNodeDialog(s => ({ ...s, open: false }))}>Cancelar</Button>
          <Button variant="contained" onClick={saveNode} sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d64d1e' } }}>Guardar</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog asignar personal */}
      {assignNode && (
        <AssignDialog node={assignNode} employees={employees} onClose={() => setAssignNode(null)}
          onChanged={loadChart} notify={notify} />
      )}

      {/* Dialog tareas por puesto */}
      {tasksNode && (
        <TasksDialog node={tasksNode} onClose={() => setTasksNode(null)} onCountChanged={loadChart} notify={notify} />
      )}

      {/* Confirmar borrado */}
      <Dialog open={!!confirmDel} onClose={() => setConfirmDel(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Eliminar «{confirmDel?.title}»</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Se eliminará este {confirmDel?.node_type === 'department' ? 'departamento' : 'puesto'}, sus puestos dependientes,
            sus asignaciones de personal y sus tareas. Esta acción no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDel(null)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={doDelete}>Eliminar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} onClose={() => setSnack(s => ({ ...s, open: false }))} variant="filled">{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}

// ============================================
// Dialog: asignar personal a un puesto
// ============================================
function AssignDialog({ node, employees, onClose, onChanged, notify }: {
  node: OrgNode; employees: EmployeeLite[]; onClose: () => void; onChanged: () => void;
  notify: (m: string, s?: 'success' | 'error' | 'info') => void;
}) {
  const [assignees, setAssignees] = useState<Assignee[]>(node.assignees);
  const [selected, setSelected] = useState<EmployeeLite | null>(null);
  const [saving, setSaving] = useState(false);

  const assignedIds = new Set(assignees.map(a => a.user_id));
  const options = employees.filter(e => !assignedIds.has(e.id));

  const add = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await axios.post(`${API_URL}/api/admin/hr/org-chart/nodes/${node.id}/assign`, { user_id: selected.id }, authHeaders());
      setAssignees(res.data?.assignees || []);
      setSelected(null);
      onChanged();
    } catch (e: any) { notify(e?.response?.data?.error || 'Error al asignar', 'error'); }
    finally { setSaving(false); }
  };

  const remove = async (userId: number) => {
    try {
      await axios.delete(`${API_URL}/api/admin/hr/org-chart/nodes/${node.id}/assign/${userId}`, authHeaders());
      setAssignees(prev => prev.filter(a => a.user_id !== userId));
      onChanged();
    } catch (e: any) { notify(e?.response?.data?.error || 'Error al quitar', 'error'); }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        Personal asignado · {node.title}
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 2 }}>
          <Autocomplete
            sx={{ flex: 1 }} size="small" options={options} value={selected}
            onChange={(_, v) => setSelected(v)}
            getOptionLabel={(o) => `${o.full_name}${o.employee_number ? ` · #${o.employee_number}` : ''} (${roleLabel(o.role)})`}
            renderInput={(params) => <TextField {...params} label="Buscar empleado" />}
          />
          <Button variant="contained" onClick={add} disabled={!selected || saving} startIcon={<PersonAddIcon />}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d64d1e' } }}>Asignar</Button>
        </Stack>
        <Divider sx={{ mb: 1 }} />
        {assignees.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ py: 2, textAlign: 'center', fontStyle: 'italic' }}>
            Nadie asignado a este puesto todavía.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {assignees.map(a => (
              <Paper key={a.user_id} variant="outlined" sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Avatar src={a.profile_photo_url || undefined} sx={{ bgcolor: ORANGE, width: 34, height: 34 }}>{initials(a.full_name)}</Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{a.full_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{roleLabel(a.role)}{a.employee_number ? ` · #${a.employee_number}` : ''}</Typography>
                </Box>
                <Tooltip title="Quitar del puesto"><IconButton size="small" color="error" onClick={() => remove(a.user_id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
              </Paper>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={onClose}>Cerrar</Button></DialogActions>
    </Dialog>
  );
}

// ============================================
// Dialog: tareas por puesto + checklist
// ============================================
function TasksDialog({ node, onClose, onCountChanged, notify }: {
  node: OrgNode; onClose: () => void; onCountChanged: () => void;
  notify: (m: string, s?: 'success' | 'error' | 'info') => void;
}) {
  const [tasks, setTasks] = useState<PositionTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editing, setEditing] = useState<PositionTask | null>(null);
  const [itemDrafts, setItemDrafts] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/admin/hr/org-chart/nodes/${node.id}/tasks`, authHeaders());
      setTasks(res.data?.tasks || []);
    } catch (e: any) { notify(e?.response?.data?.error || 'Error al cargar tareas', 'error'); }
    finally { setLoading(false); }
  }, [node.id, notify]);
  useEffect(() => { load(); }, [load]);

  const addTask = async () => {
    if (!newTitle.trim()) return;
    try {
      await axios.post(`${API_URL}/api/admin/hr/org-chart/nodes/${node.id}/tasks`, { title: newTitle.trim(), description: newDesc.trim() || null }, authHeaders());
      setNewTitle(''); setNewDesc('');
      await load(); onCountChanged();
    } catch (e: any) { notify(e?.response?.data?.error || 'Error al crear tarea', 'error'); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await axios.put(`${API_URL}/api/admin/hr/org-chart/tasks/${editing.id}`, { title: editing.title.trim(), description: editing.description?.trim() || null }, authHeaders());
      setEditing(null); await load();
    } catch (e: any) { notify(e?.response?.data?.error || 'Error al guardar', 'error'); }
  };

  const delTask = async (id: number) => {
    try {
      await axios.delete(`${API_URL}/api/admin/hr/org-chart/tasks/${id}`, authHeaders());
      await load(); onCountChanged();
    } catch (e: any) { notify(e?.response?.data?.error || 'Error al eliminar', 'error'); }
  };

  const addItem = async (taskId: number) => {
    const text = (itemDrafts[taskId] || '').trim();
    if (!text) return;
    try {
      await axios.post(`${API_URL}/api/admin/hr/org-chart/tasks/${taskId}/items`, { text }, authHeaders());
      setItemDrafts(d => ({ ...d, [taskId]: '' }));
      await load();
    } catch (e: any) { notify(e?.response?.data?.error || 'Error al agregar punto', 'error'); }
  };

  const toggleItem = async (item: TaskItem) => {
    // optimista
    setTasks(prev => prev.map(t => ({ ...t, items: t.items.map(i => i.id === item.id ? { ...i, is_done: !i.is_done } : i) })));
    try {
      await axios.put(`${API_URL}/api/admin/hr/org-chart/items/${item.id}`, { is_done: !item.is_done }, authHeaders());
    } catch { load(); }
  };

  const delItem = async (itemId: number) => {
    try { await axios.delete(`${API_URL}/api/admin/hr/org-chart/items/${itemId}`, authHeaders()); await load(); }
    catch (e: any) { notify(e?.response?.data?.error || 'Error al eliminar punto', 'error'); }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        Tareas del puesto · {node.title}
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        {/* Alta de tarea */}
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2 }}>
          <Typography sx={{ fontWeight: 600, mb: 1, fontSize: 14 }}>Agregar actividad</Typography>
          <TextField fullWidth size="small" label="Título de la actividad" value={newTitle}
            onChange={e => setNewTitle(e.target.value)} sx={{ mb: 1 }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addTask(); } }} />
          <TextField fullWidth size="small" label="Descripción (opcional)" value={newDesc}
            onChange={e => setNewDesc(e.target.value)} multiline minRows={1} sx={{ mb: 1 }} />
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={addTask} disabled={!newTitle.trim()}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d64d1e' } }}>Agregar</Button>
        </Paper>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress sx={{ color: ORANGE }} /></Box>
        ) : tasks.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ py: 3, textAlign: 'center', fontStyle: 'italic' }}>
            Este puesto aún no tiene actividades definidas.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {tasks.map(task => (
              <Paper key={task.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2, borderLeft: `4px solid ${ORANGE}` }}>
                {editing?.id === task.id ? (
                  <Box>
                    <TextField fullWidth size="small" label="Título" value={editing.title}
                      onChange={e => setEditing({ ...editing, title: e.target.value })} sx={{ mb: 1 }} />
                    <TextField fullWidth size="small" label="Descripción" value={editing.description || ''}
                      onChange={e => setEditing({ ...editing, description: e.target.value })} multiline minRows={1} sx={{ mb: 1 }} />
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="contained" onClick={saveEdit} sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d64d1e' } }}>Guardar</Button>
                      <Button size="small" onClick={() => setEditing(null)}>Cancelar</Button>
                    </Stack>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 14.5 }}>{task.title}</Typography>
                      {task.description && <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12.5, mt: 0.2 }}>{task.description}</Typography>}
                    </Box>
                    <Tooltip title="Editar"><IconButton size="small" onClick={() => setEditing(task)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Eliminar"><IconButton size="small" color="error" onClick={() => delTask(task.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                  </Box>
                )}

                {/* Checklist */}
                <Box sx={{ mt: 1, pl: 0.5 }}>
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.3 }}>
                    <ChecklistIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Checklist de trabajo</Typography>
                  </Stack>
                  {task.items.map(item => (
                    <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                      <Checkbox size="small" checked={item.is_done} onChange={() => toggleItem(item)} sx={{ p: 0.5, color: ORANGE, '&.Mui-checked': { color: ORANGE } }} />
                      <Typography sx={{ flex: 1, fontSize: 13, textDecoration: item.is_done ? 'line-through' : 'none', color: item.is_done ? 'text.disabled' : 'text.primary' }}>{item.text}</Typography>
                      <IconButton size="small" onClick={() => delItem(item.id)}><DeleteIcon sx={{ fontSize: 15 }} /></IconButton>
                    </Box>
                  ))}
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                    <TextField size="small" placeholder="Nuevo punto del checklist…" value={itemDrafts[task.id] || ''}
                      onChange={e => setItemDrafts(d => ({ ...d, [task.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(task.id); } }}
                      sx={{ flex: 1 }} variant="standard" />
                    <Button size="small" onClick={() => addItem(task.id)} disabled={!(itemDrafts[task.id] || '').trim()}>Añadir</Button>
                  </Stack>
                </Box>
              </Paper>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={onClose}>Cerrar</Button></DialogActions>
    </Dialog>
  );
}
