import { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Table, TableHead, TableBody, TableRow, TableCell, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, FormControl, InputLabel,
  Select, MenuItem, Chip, CircularProgress, Snackbar, Alert, IconButton, Tooltip,
} from '@mui/material';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import api from '../services/api';

interface Advisor { id: number; full_name: string; role: string; complaint_count: number; }
interface Complaint {
  id: number; advisor_id: number; advisor_name: string; ticket_folio: string;
  note?: string; created_at: string; marked_by_name?: string;
}

const ROLE_LABEL: Record<string, string> = {
  advisor: 'Asesor', asesor: 'Asesor', asesor_lider: 'Asesor líder', sub_advisor: 'Sub-asesor',
};
const fmtDate = (iso?: string) => { try { return iso ? new Date(iso).toLocaleString('es-MX') : '—'; } catch { return '—'; } };

export default function QuejasPanel() {
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<{ advisor_id: number | ''; ticket_folio: string; note: string }>({ advisor_id: '', ticket_folio: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([
        api.get('/admin/complaints/advisors'),
        api.get('/admin/complaints'),
      ]);
      setAdvisors(a.data?.advisors || []);
      setComplaints(c.data?.complaints || []);
    } catch { setSnack({ open: true, msg: 'No se pudieron cargar las quejas', sev: 'error' }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openMark = (advisorId?: number) => {
    setForm({ advisor_id: advisorId ?? '', ticket_folio: '', note: '' });
    setDialogOpen(true);
  };
  const submit = async () => {
    if (!form.advisor_id) { setSnack({ open: true, msg: 'Selecciona un asesor', sev: 'error' }); return; }
    if (!form.ticket_folio.trim()) { setSnack({ open: true, msg: 'Captura el número de ticket', sev: 'error' }); return; }
    setSaving(true);
    try {
      await api.post('/admin/complaints', { advisor_id: form.advisor_id, ticket_folio: form.ticket_folio.trim(), note: form.note.trim() || null });
      setDialogOpen(false);
      setSnack({ open: true, msg: 'Queja registrada', sev: 'success' });
      load();
    } catch (e: any) { setSnack({ open: true, msg: e?.response?.data?.error || 'No se pudo registrar', sev: 'error' }); }
    finally { setSaving(false); }
  };
  const remove = async (id: number) => {
    try { await api.delete(`/admin/complaints/${id}`); load(); }
    catch { setSnack({ open: true, msg: 'No se pudo eliminar', sev: 'error' }); }
  };

  if (loading) return <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6" fontWeight={800}>Quejas a asesores</Typography>
        <Button variant="contained" color="warning" startIcon={<ReportProblemIcon />} onClick={() => openMark()}>Marcar queja</Button>
      </Box>

      {/* Asesores activos con conteo */}
      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#111', '& th': { color: '#fff', fontWeight: 700 } }}>
              <TableCell>ASESOR</TableCell>
              <TableCell>ROL</TableCell>
              <TableCell align="center">QUEJAS</TableCell>
              <TableCell align="right">ACCIÓN</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {advisors.map(a => (
              <TableRow key={a.id} hover>
                <TableCell>{a.full_name}</TableCell>
                <TableCell><Chip size="small" label={ROLE_LABEL[a.role] || a.role} /></TableCell>
                <TableCell align="center">
                  <Chip size="small" label={a.complaint_count} color={a.complaint_count > 0 ? 'error' : 'default'}
                    variant={a.complaint_count > 0 ? 'filled' : 'outlined'} sx={{ fontWeight: 700, minWidth: 40 }} />
                </TableCell>
                <TableCell align="right">
                  <Button size="small" variant="outlined" color="warning" onClick={() => openMark(a.id)}>Marcar queja</Button>
                </TableCell>
              </TableRow>
            ))}
            {advisors.length === 0 && <TableRow><TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 3 }}>No hay asesores activos.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>

      {/* Historial de quejas */}
      <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1 }}>Quejas registradas</Typography>
      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#F3F4F6', '& th': { fontWeight: 700 } }}>
              <TableCell>ASESOR</TableCell>
              <TableCell>TICKET</TableCell>
              <TableCell>NOTA</TableCell>
              <TableCell>MARCÓ</TableCell>
              <TableCell>FECHA</TableCell>
              <TableCell align="right"></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {complaints.map(c => (
              <TableRow key={c.id} hover>
                <TableCell>{c.advisor_name}</TableCell>
                <TableCell><Chip size="small" label={c.ticket_folio} variant="outlined" /></TableCell>
                <TableCell sx={{ maxWidth: 240 }}><Typography variant="body2" noWrap title={c.note}>{c.note || '—'}</Typography></TableCell>
                <TableCell>{c.marked_by_name || '—'}</TableCell>
                <TableCell>{fmtDate(c.created_at)}</TableCell>
                <TableCell align="right">
                  <Tooltip title="Eliminar"><IconButton size="small" color="error" onClick={() => remove(c.id)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {complaints.length === 0 && <TableRow><TableCell colSpan={6} align="center" sx={{ color: 'text.secondary', py: 3 }}>Aún no hay quejas registradas.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>

      {/* Dialog: marcar queja */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}><ReportProblemIcon color="warning" /> Marcar queja</DialogTitle>
        <DialogContent>
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel>Asesor</InputLabel>
            <Select label="Asesor" value={form.advisor_id} onChange={e => setForm({ ...form, advisor_id: Number(e.target.value) })}>
              {advisors.map(a => <MenuItem key={a.id} value={a.id}>{a.full_name} · {ROLE_LABEL[a.role] || a.role}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField fullWidth size="small" label="Número de ticket" margin="dense" required
            value={form.ticket_folio} onChange={e => setForm({ ...form, ticket_folio: e.target.value })}
            placeholder="Ej. TKT-2026-1124" />
          <TextField fullWidth size="small" label="Nota (opcional)" margin="dense" multiline minRows={2}
            value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
          <Button variant="contained" color="warning" onClick={submit} disabled={saving}>{saving ? 'Guardando…' : 'Registrar queja'}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} onClose={() => setSnack(s => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
