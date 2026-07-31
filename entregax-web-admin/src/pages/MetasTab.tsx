import { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Box, Typography, Button, Chip, Avatar, LinearProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, FormControl, InputLabel, Select, MenuItem, IconButton, Tooltip,
  Snackbar, Alert, CircularProgress, Checkbox, FormControlLabel, Divider,
} from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import AssignmentIcon from '@mui/icons-material/AssignmentTurnedIn';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const getToken = () => localStorage.getItem('token') || '';
const H = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });

interface Goal { id: number; title: string; description?: string; metric_key: string; period?: string | null; target_default: number; unit: string; }
interface Advisor { id: number; full_name: string; email?: string; role: string; referral_code?: string; profile_photo_url?: string; leader_id?: number | null; leader_name?: string | null; is_leader: boolean; }
interface Declaration { goal_id: number; advisor_id: number; declared_target: number; declaration_text?: string; manual_progress?: number | null; task_id?: number | null; }

const initials = (n?: string) => (n || '?').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
const MEDALS = ['🥇', '🥈', '🥉'];

export default function MetasTab() {
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [decls, setDecls] = useState<Declaration[]>([]);
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const [periodLabels, setPeriodLabels] = useState<Record<number, string>>({});
  const [goalId, setGoalId] = useState<number | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' });
  const notify = (msg: string, sev: 'success' | 'error' = 'success') => setSnack({ open: true, msg, sev });

  // Diálogos
  const [declDlg, setDeclDlg] = useState<{ advisor: Advisor } | null>(null);
  const [declForm, setDeclForm] = useState({ declared_target: '', declaration_text: '', manual_progress: '', create_task: true });
  const [savingDecl, setSavingDecl] = useState(false);
  const [goalDlg, setGoalDlg] = useState(false);
  const [goalForm, setGoalForm] = useState({ title: '', description: '', metric_key: 'manual', unit: 'usuarios', target_default: '' });
  const [savingGoal, setSavingGoal] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/admin/metas`, H());
      setGoals(r.data?.goals || []);
      setAdvisors(r.data?.advisors || []);
      setDecls(r.data?.declarations || []);
      setMeasured(r.data?.measured || {});
      setPeriodLabels(r.data?.periodLabels || {});
      setGoalId(prev => prev ?? (r.data?.goals?.[0]?.id ?? null));
    } catch { notify('No se pudieron cargar las metas', 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const goal = goals.find(g => g.id === goalId) || null;
  const declOf = (advId: number): Declaration | undefined => decls.find(d => d.goal_id === goalId && d.advisor_id === advId);
  const actualOf = (advId: number): number => {
    if (!goal) return 0;
    if (goal.metric_key === 'new_users') return measured[`${goal.id}_${advId}`] || 0;
    const d = declOf(advId);
    return d?.manual_progress != null ? Number(d.manual_progress) : 0;
  };
  const targetOf = (advId: number): number => Number(declOf(advId)?.declared_target || 0);

  // Ordena: líderes con sus sub-asesores debajo. Y ranking por resultado.
  const grouped = useMemo(() => {
    const leaders = advisors.filter(a => a.is_leader);
    const subsByLeader: Record<number, Advisor[]> = {};
    const orphans: Advisor[] = [];
    for (const a of advisors.filter(x => !x.is_leader)) {
      if (a.leader_id && leaders.some(l => l.id === a.leader_id)) (subsByLeader[a.leader_id] ||= []).push(a);
      else orphans.push(a);
    }
    return { leaders, subsByLeader, orphans };
  }, [advisors]);

  const ranking = useMemo(() => {
    return [...advisors].map(a => ({ id: a.id, v: actualOf(a.id) })).sort((x, y) => y.v - x.v);
  }, [advisors, measured, decls, goalId]);
  const rankOf = (advId: number) => ranking.findIndex(r => r.id === advId);

  const totals = useMemo(() => {
    let dec = 0, act = 0;
    for (const a of advisors) { dec += targetOf(a.id); act += actualOf(a.id); }
    return { dec, act, pct: dec > 0 ? Math.min(100, Math.round((act / dec) * 100)) : 0 };
  }, [advisors, decls, measured, goalId]);

  const openDecl = (advisor: Advisor) => {
    const d = declOf(advisor.id);
    setDeclForm({
      declared_target: d?.declared_target != null ? String(d.declared_target) : (goal?.target_default ? String(goal.target_default) : ''),
      declaration_text: d?.declaration_text || '',
      manual_progress: d?.manual_progress != null ? String(d.manual_progress) : '',
      create_task: true,
    });
    setDeclDlg({ advisor });
  };
  const saveDecl = async () => {
    if (!declDlg || !goal) return;
    setSavingDecl(true);
    try {
      await axios.post(`${API_URL}/admin/metas/declarations`, {
        goal_id: goal.id, advisor_id: declDlg.advisor.id,
        declared_target: Number(declForm.declared_target) || 0,
        declaration_text: declForm.declaration_text || null,
        manual_progress: goal.metric_key === 'manual' && declForm.manual_progress !== '' ? Number(declForm.manual_progress) : undefined,
        create_task: !!declForm.create_task,
      }, H());
      setDeclDlg(null);
      notify(declForm.create_task ? 'Declaración guardada y tarea asignada' : 'Declaración guardada');
      load();
    } catch (e: any) { notify(e?.response?.data?.error || 'No se pudo guardar', 'error'); }
    finally { setSavingDecl(false); }
  };

  const saveGoal = async () => {
    if (!goalForm.title.trim()) return notify('El título es obligatorio', 'error');
    setSavingGoal(true);
    try {
      const r = await axios.post(`${API_URL}/admin/metas/goals`, {
        title: goalForm.title.trim(), description: goalForm.description || null,
        metric_key: goalForm.metric_key, unit: goalForm.unit || 'usuarios',
        target_default: Number(goalForm.target_default) || 0,
      }, H());
      setGoalDlg(false);
      setGoalForm({ title: '', description: '', metric_key: 'manual', unit: 'usuarios', target_default: '' });
      notify('Meta creada');
      setGoalId(r.data?.goal?.id ?? goalId);
      load();
    } catch (e: any) { notify(e?.response?.data?.error || 'No se pudo crear la meta', 'error'); }
    finally { setSavingGoal(false); }
  };

  if (loading) return <Box sx={{ textAlign: 'center', py: 8 }}><CircularProgress /></Box>;

  const AdvisorRow = ({ a, sub }: { a: Advisor; sub?: boolean }) => {
    const target = targetOf(a.id);
    const actual = actualOf(a.id);
    const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
    const d = declOf(a.id);
    const rank = rankOf(a.id);
    const done = target > 0 && actual >= target;
    return (
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 2, p: 1.5, ml: sub ? 4 : 0,
        borderRadius: 2, bgcolor: '#fff', border: '1px solid #ECE4D8',
        borderLeft: done ? '4px solid #2E7D46' : (target > 0 ? '4px solid #D6521C' : '4px solid #ddd'),
      }}>
        <Box sx={{ width: 26, textAlign: 'center', fontSize: 18 }}>{rank >= 0 && rank < 3 ? MEDALS[rank] : <Typography variant="caption" color="text.secondary">{rank + 1}</Typography>}</Box>
        <Avatar src={a.profile_photo_url || undefined} sx={{ width: 40, height: 40, bgcolor: a.is_leader ? '#5E35B1' : '#D6521C', fontWeight: 700 }}>{initials(a.full_name)}</Avatar>
        <Box sx={{ minWidth: 180, flex: '0 0 auto' }}>
          <Typography fontWeight={700} fontSize={14}>{a.full_name}</Typography>
          <Typography variant="caption" color="text.secondary">
            {a.is_leader ? '⭐ Líder' : (a.leader_name ? `↳ ${a.leader_name}` : 'Asesor')}{a.referral_code ? ` · ${a.referral_code}` : ''}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 140 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
            <Typography variant="caption" color="text.secondary">Progreso</Typography>
            <Typography variant="caption" fontWeight={700} color={done ? 'success.main' : 'text.primary'}>
              {actual} / {target || '—'} {goal?.unit}
            </Typography>
          </Box>
          <LinearProgress variant="determinate" value={pct} sx={{ height: 10, borderRadius: 5, bgcolor: '#F0E9DF',
            '& .MuiLinearProgress-bar': { bgcolor: done ? '#2E7D46' : '#D6521C', borderRadius: 5 } }} />
          {d?.declaration_text && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>“{d.declaration_text}”</Typography>}
        </Box>
        <Box sx={{ textAlign: 'right', minWidth: 70 }}>
          <Typography fontWeight={800} fontSize={20} color={done ? 'success.main' : '#D6521C'}>{actual}</Typography>
          <Typography variant="caption" color="text.secondary">real</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {d?.task_id && <Tooltip title="Tiene tarea asignada"><AssignmentIcon sx={{ color: '#5E35B1', fontSize: 18 }} /></Tooltip>}
          <Tooltip title={d ? 'Editar declaración' : 'Capturar declaración'}>
            <IconButton size="small" onClick={() => openDecl(a)} sx={{ color: '#D6521C' }}>{d ? <EditIcon fontSize="small" /> : <AddIcon fontSize="small" />}</IconButton>
          </Tooltip>
        </Box>
      </Box>
    );
  };

  return (
    <Box>
      {/* Encabezado presentación */}
      <Box sx={{ borderRadius: 3, p: 3, mb: 2, color: '#fff',
        background: 'linear-gradient(120deg, #D6521C 0%, #B07206 100%)', boxShadow: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h4" fontWeight={900} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <EmojiEventsIcon sx={{ fontSize: 38 }} /> Metas de Asesores
            </Typography>
            <Typography sx={{ opacity: 0.95 }}>
              {goal ? `${goal.title}${goal.metric_key === 'new_users' && periodLabels[goal.id] ? ` · ${periodLabels[goal.id]}` : ''}` : 'Selecciona una meta'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 3 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" fontWeight={900}>{totals.act}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.9 }}>Real total</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" fontWeight={900}>{totals.dec || '—'}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.9 }}>Declarado</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" fontWeight={900}>{totals.pct}%</Typography>
              <Typography variant="caption" sx={{ opacity: 0.9 }}>Avance</Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Selector de metas + acciones */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {goals.map(g => (
          <Chip key={g.id} label={g.title} onClick={() => setGoalId(g.id)}
            color={g.id === goalId ? 'primary' : 'default'}
            sx={{ fontWeight: 700, bgcolor: g.id === goalId ? '#D6521C' : undefined, color: g.id === goalId ? '#fff' : undefined }} />
        ))}
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<RefreshIcon />} onClick={load}>Actualizar</Button>
        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setGoalDlg(true)}
          sx={{ bgcolor: '#B07206', '&:hover': { bgcolor: '#8F5D05' } }}>Nueva meta</Button>
      </Box>

      {goal?.description && <Alert severity="info" sx={{ mb: 2 }}>{goal.description}</Alert>}

      {/* Lista de asesores agrupada por líder */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {grouped.leaders.map(leader => (
          <Box key={leader.id} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <AdvisorRow a={leader} />
            {(grouped.subsByLeader[leader.id] || []).map(sub => <AdvisorRow key={sub.id} a={sub} sub />)}
          </Box>
        ))}
        {grouped.orphans.length > 0 && (
          <>
            <Divider sx={{ my: 1 }}><Typography variant="caption" color="text.secondary">Otros asesores</Typography></Divider>
            {grouped.orphans.map(a => <AdvisorRow key={a.id} a={a} />)}
          </>
        )}
        {advisors.length === 0 && <Alert severity="info">No hay asesores activos.</Alert>}
      </Box>

      {/* Diálogo declaración */}
      <Dialog open={!!declDlg} onClose={() => setDeclDlg(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Declaración — {declDlg?.advisor.full_name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Meta: <b>{goal?.title}</b>. El asesor declara su compromiso; se mide contra el resultado real.
          </Typography>
          <TextField fullWidth size="small" type="number" label={`Objetivo declarado (${goal?.unit || ''})`} margin="dense"
            value={declForm.declared_target} onChange={e => setDeclForm({ ...declForm, declared_target: e.target.value })} />
          <TextField fullWidth size="small" label="Declaración del asesor (en sus palabras)" margin="dense" multiline rows={3}
            placeholder="Ej: Me comprometo a registrar 30 clientes nuevos este mes enfocándome en…"
            value={declForm.declaration_text} onChange={e => setDeclForm({ ...declForm, declaration_text: e.target.value })} />
          {goal?.metric_key === 'manual' && (
            <TextField fullWidth size="small" type="number" label="Avance actual (manual)" margin="dense"
              value={declForm.manual_progress} onChange={e => setDeclForm({ ...declForm, manual_progress: e.target.value })} />
          )}
          <FormControlLabel sx={{ mt: 1 }}
            control={<Checkbox checked={declForm.create_task} onChange={e => setDeclForm({ ...declForm, create_task: e.target.checked })} />}
            label="Crear tarea asignada al asesor con esta declaración" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeclDlg(null)}>Cancelar</Button>
          <Button variant="contained" onClick={saveDecl} disabled={savingDecl} sx={{ bgcolor: '#D6521C', '&:hover': { bgcolor: '#B23F12' } }}>Guardar</Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo nueva meta */}
      <Dialog open={goalDlg} onClose={() => setGoalDlg(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Nueva meta</DialogTitle>
        <DialogContent>
          <TextField fullWidth size="small" label="Título de la meta" margin="dense"
            value={goalForm.title} onChange={e => setGoalForm({ ...goalForm, title: e.target.value })} />
          <TextField fullWidth size="small" label="Descripción" margin="dense" multiline rows={2}
            value={goalForm.description} onChange={e => setGoalForm({ ...goalForm, description: e.target.value })} />
          <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Cómo se mide</InputLabel>
              <Select label="Cómo se mide" value={goalForm.metric_key} onChange={e => setGoalForm({ ...goalForm, metric_key: e.target.value })}>
                <MenuItem value="new_users">Usuarios nuevos del mes (automático)</MenuItem>
                <MenuItem value="manual">Manual (captura de avance)</MenuItem>
              </Select>
            </FormControl>
            <TextField size="small" type="number" label="Objetivo por defecto" sx={{ width: 160 }}
              value={goalForm.target_default} onChange={e => setGoalForm({ ...goalForm, target_default: e.target.value })} />
          </Box>
          <TextField fullWidth size="small" label="Unidad (ej. usuarios, pólizas)" margin="dense"
            value={goalForm.unit} onChange={e => setGoalForm({ ...goalForm, unit: e.target.value })} />
          <Typography variant="caption" color="text.secondary">
            «Usuarios nuevos del mes» se mide solo con los clientes registrados a nombre del asesor. «Manual» permite capturar el avance a mano (ej. ≥3 X-Pay, ≥3 Seguros).
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGoalDlg(false)}>Cancelar</Button>
          <Button variant="contained" onClick={saveGoal} disabled={savingGoal} sx={{ bgcolor: '#B07206', '&:hover': { bgcolor: '#8F5D05' } }}>Crear</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ ...snack, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snack.sev} onClose={() => setSnack({ ...snack, open: false })}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
