/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================
// VACATION & QUINTA DIALOG
// Registro de días de vacaciones y prestación de quinta (1 vez/año)
// ============================================
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Tabs, Tab, Box, Button, TextField, Stack, Typography, Chip, Alert,
  Table, TableHead, TableRow, TableCell, TableBody, IconButton,
  Grid, FormControlLabel, Checkbox, Tooltip, CircularProgress,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import BeachAccessIcon from '@mui/icons-material/BeachAccess';
import HomeWorkIcon from '@mui/icons-material/HomeWork';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import api from '../services/api';

const C = {
  orange: '#F05A28',
  orangeDark: '#C1272D',
  border: '#e5e7eb',
  text: '#0f172a',
  muted: '#64748b',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
};

const QUINTA_MAINTENANCE_FEE = 1300;

const fmtMXN = (n: number | string | null | undefined) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n || 0));

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('es-MX', { dateStyle: 'medium' }) : '—';

interface Props {
  open: boolean;
  employeeId: number | null;
  employeeName?: string;
  onClose: () => void;
  onChange?: () => void;
}

export default function VacationQuintaDialog({ open, employeeId, employeeName, onClose, onChange }: Props) {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [vacData, setVacData] = useState<any>(null);
  const [quintaData, setQuintaData] = useState<any>(null);
  const [msg, setMsg] = useState<{ sev: 'success'|'error'|'info'|'warning'; text: string } | null>(null);

  // Form vacaciones
  const [vacStart, setVacStart] = useState('');
  const [vacEnd, setVacEnd] = useState('');
  const [vacReason, setVacReason] = useState('');
  const [savingVac, setSavingVac] = useState(false);

  // Form quinta
  const today = new Date();
  const [qStart, setQStart] = useState('');
  const [qEnd, setQEnd] = useState('');
  const [qPaid, setQPaid] = useState(false);
  const [qNotes, setQNotes] = useState('');
  const [qYear] = useState(today.getFullYear());
  const [savingQ, setSavingQ] = useState(false);

  const reset = () => {
    setVacStart(''); setVacEnd(''); setVacReason('');
    setQStart(''); setQEnd(''); setQPaid(false); setQNotes('');
    setMsg(null);
  };

  const load = async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const [v, q] = await Promise.all([
        api.get(`/admin/hr/employees/${employeeId}/vacations`),
        api.get(`/admin/hr/employees/${employeeId}/quinta?year=${qYear}`),
      ]);
      setVacData(v.data);
      setQuintaData(q.data);
    } catch (e: any) {
      setMsg({ sev: 'error', text: e?.response?.data?.error || 'Error cargando datos' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && employeeId) {
      reset();
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employeeId]);

  const vacDaysPreview = useMemo(() => {
    if (!vacStart || !vacEnd) return 0;
    const s = new Date(vacStart), e = new Date(vacEnd);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
    return Math.floor((e.getTime() - s.getTime()) / (1000*60*60*24)) + 1;
  }, [vacStart, vacEnd]);

  const handleSaveVac = async () => {
    if (!employeeId || !vacStart || !vacEnd) return;
    setSavingVac(true);
    try {
      await api.post(`/admin/hr/employees/${employeeId}/vacations`, {
        start_date: vacStart,
        end_date: vacEnd,
        reason: vacReason || null,
      });
      setMsg({ sev: 'success', text: `Vacaciones registradas (${vacDaysPreview} días)` });
      setVacStart(''); setVacEnd(''); setVacReason('');
      await load();
      onChange?.();
    } catch (e: any) {
      setMsg({ sev: 'error', text: e?.response?.data?.error || 'Error al registrar' });
    } finally {
      setSavingVac(false);
    }
  };

  const handleCancelVac = async (id: number) => {
    if (!window.confirm('¿Cancelar este registro de vacaciones? Los días se reembolsarán.')) return;
    try {
      await api.delete(`/admin/hr/vacations/${id}`);
      setMsg({ sev: 'success', text: 'Registro cancelado' });
      await load();
      onChange?.();
    } catch (e: any) {
      setMsg({ sev: 'error', text: e?.response?.data?.error || 'Error al cancelar' });
    }
  };

  const handleSaveQuinta = async () => {
    if (!employeeId || !qStart || !qEnd) return;
    setSavingQ(true);
    try {
      await api.post(`/admin/hr/employees/${employeeId}/quinta`, {
        start_date: qStart,
        end_date: qEnd,
        maintenance_fee: qFee ? Number(qFee) : 0,
        maintenance_paid: qPaid,
        notes: qNotes || null,
      });
      setMsg({ sev: 'success', text: 'Reservación de quinta registrada' });
      setQStart(''); setQEnd(''); setQFee(''); setQPaid(false); setQNotes('');
      await load();
      onChange?.();
    } catch (e: any) {
      setMsg({ sev: 'error', text: e?.response?.data?.error || 'Error al reservar' });
    } finally {
      setSavingQ(false);
    }
  };

  const handleCancelQuinta = async (id: number) => {
    if (!window.confirm('¿Cancelar esta reservación de la quinta?')) return;
    try {
      await api.delete(`/admin/hr/quinta/${id}`);
      setMsg({ sev: 'success', text: 'Reservación cancelada — el empleado podrá usar su prestación de este año' });
      await load();
      onChange?.();
    } catch (e: any) {
      setMsg({ sev: 'error', text: e?.response?.data?.error || 'Error al cancelar' });
    }
  };

  const handleTogglePaid = async (id: number, current: boolean) => {
    try {
      await api.patch(`/admin/hr/quinta/${id}/payment`, { maintenance_paid: !current });
      await load();
      onChange?.();
    } catch (e: any) {
      setMsg({ sev: 'error', text: e?.response?.data?.error || 'Error al actualizar' });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ borderBottom: `1px solid ${C.border}`, pb: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <EventAvailableIcon sx={{ color: C.orange }} />
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 700, color: C.text }}>
              Vacaciones y Quinta
            </Typography>
            {employeeName && (
              <Typography variant="caption" sx={{ color: C.muted }}>
                {employeeName}
              </Typography>
            )}
          </Box>
        </Stack>
      </DialogTitle>

      <Tabs
        value={tab}
        onChange={(_e, v) => setTab(v)}
        sx={{
          borderBottom: `1px solid ${C.border}`,
          '& .MuiTab-root': { textTransform: 'none', fontWeight: 600 },
          '& .Mui-selected': { color: `${C.orange} !important` },
          '& .MuiTabs-indicator': { backgroundColor: C.orange },
        }}
      >
        <Tab icon={<BeachAccessIcon />} iconPosition="start" label="Vacaciones" />
        <Tab icon={<HomeWorkIcon />} iconPosition="start" label={`Quinta ${qYear}`} />
      </Tabs>

      <DialogContent sx={{ pt: 2 }}>
        {msg && (
          <Alert severity={msg.sev} onClose={() => setMsg(null)} sx={{ mb: 2 }}>
            {msg.text}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress sx={{ color: C.orange }} />
          </Box>
        ) : tab === 0 ? (
          // ============ TAB VACACIONES ============
          <Stack spacing={2.5}>
            {vacData?.summary && (
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Box sx={{ p: 1.5, border: `1px solid ${C.border}`, borderRadius: 1, textAlign: 'center' }}>
                    <Typography variant="caption" sx={{ color: C.muted }}>Por Ley (LFT)</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: C.text }}>
                      {vacData.summary.vacation_legal} d
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Box sx={{ p: 1.5, border: `1px solid ${C.border}`, borderRadius: 1, textAlign: 'center' }}>
                    <Typography variant="caption" sx={{ color: C.muted }}>Asignados</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: C.text }}>
                      {vacData.summary.days_available_setting} d
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Box sx={{ p: 1.5, border: `1px solid ${C.border}`, borderRadius: 1, textAlign: 'center', bgcolor: '#fff7ed' }}>
                    <Typography variant="caption" sx={{ color: C.muted }}>Tomados</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: C.orangeDark }}>
                      {vacData.summary.days_taken_total} d
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Box sx={{ p: 1.5, border: `1px solid ${C.border}`, borderRadius: 1, textAlign: 'center', bgcolor: '#dcfce7' }}>
                    <Typography variant="caption" sx={{ color: C.muted }}>Disponibles</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: C.success }}>
                      {vacData.summary.days_remaining} d
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            )}

            <Box sx={{ p: 2, border: `1px solid ${C.border}`, borderRadius: 1 }}>
              <Typography sx={{ fontWeight: 700, mb: 1.5 }}>Registrar días de vacaciones</Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth size="small" type="date" label="Inicio"
                    InputLabelProps={{ shrink: true }}
                    value={vacStart} onChange={e => setVacStart(e.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth size="small" type="date" label="Fin"
                    InputLabelProps={{ shrink: true }}
                    value={vacEnd} onChange={e => setVacEnd(e.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth size="small" label="Motivo (opcional)"
                    value={vacReason} onChange={e => setVacReason(e.target.value)}
                  />
                </Grid>
              </Grid>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1.5 }}>
                <Typography variant="caption" sx={{ color: C.muted }}>
                  {vacDaysPreview > 0 ? `Equivale a ${vacDaysPreview} día(s)` : 'Seleccione un rango válido'}
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  disabled={!vacStart || !vacEnd || vacDaysPreview <= 0 || savingVac}
                  onClick={handleSaveVac}
                  sx={{ bgcolor: C.orange, '&:hover': { bgcolor: C.orangeDark }, textTransform: 'none' }}
                >
                  {savingVac ? 'Guardando…' : 'Registrar vacaciones'}
                </Button>
              </Stack>
            </Box>

            <Box>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>Historial</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Inicio</TableCell>
                    <TableCell>Fin</TableCell>
                    <TableCell>Días</TableCell>
                    <TableCell>Motivo</TableCell>
                    <TableCell>Estatus</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(vacData?.requests || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ color: C.muted, py: 2 }}>
                        Sin registros
                      </TableCell>
                    </TableRow>
                  )}
                  {(vacData?.requests || []).map((r: any) => (
                    <TableRow key={r.id} sx={r.cancelled_at ? { opacity: 0.5 } : undefined}>
                      <TableCell>{fmtDate(r.start_date)}</TableCell>
                      <TableCell>{fmtDate(r.end_date)}</TableCell>
                      <TableCell>{r.days}</TableCell>
                      <TableCell>{r.reason || '—'}</TableCell>
                      <TableCell>
                        <Chip
                          label={r.cancelled_at ? 'Cancelada' : r.status}
                          size="small"
                          color={r.cancelled_at ? 'default' : 'success'}
                          variant={r.cancelled_at ? 'outlined' : 'filled'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {!r.cancelled_at && (
                          <Tooltip title="Cancelar / Reembolsar días">
                            <IconButton size="small" color="error" onClick={() => handleCancelVac(r.id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Stack>
        ) : (
          // ============ TAB QUINTA ============
          <Stack spacing={2.5}>
            <Alert
              severity={quintaData?.used_this_year ? 'warning' : 'success'}
              icon={<HomeWorkIcon />}
              sx={{ borderRadius: 1 }}
            >
              <strong>Prestación {qYear}:</strong>{' '}
              {quintaData?.used_this_year
                ? 'YA USADA — el empleado solo tiene derecho a 1 reservación por año.'
                : 'DISPONIBLE — el empleado puede reservar este año (solo paga mantenimiento).'}
            </Alert>

            {!quintaData?.used_this_year && (
              <Box sx={{ p: 2, border: `1px solid ${C.border}`, borderRadius: 1 }}>
                <Typography sx={{ fontWeight: 700, mb: 1.5 }}>Nueva reservación</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth size="small" type="date" label="Fecha de entrada"
                      InputLabelProps={{ shrink: true }}
                      value={qStart} onChange={e => setQStart(e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth size="small" type="date" label="Fecha de salida"
                      InputLabelProps={{ shrink: true }}
                      value={qEnd} onChange={e => setQEnd(e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      fullWidth size="small" type="number" label="Cuota mantenimiento (MXN)"
                      value={qFee} onChange={e => setQFee(e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormControlLabel
                      control={<Checkbox checked={qPaid} onChange={e => setQPaid(e.target.checked)} sx={{ color: C.orange, '&.Mui-checked': { color: C.orange } }} />}
                      label="Mantenimiento pagado"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      fullWidth size="small" label="Notas"
                      value={qNotes} onChange={e => setQNotes(e.target.value)}
                    />
                  </Grid>
                </Grid>
                <Box sx={{ mt: 1.5, textAlign: 'right' }}>
                  <Button
                    variant="contained" size="small"
                    disabled={!qStart || !qEnd || savingQ}
                    onClick={handleSaveQuinta}
                    sx={{ bgcolor: C.orange, '&:hover': { bgcolor: C.orangeDark }, textTransform: 'none' }}
                  >
                    {savingQ ? 'Guardando…' : 'Reservar quinta'}
                  </Button>
                </Box>
              </Box>
            )}

            <Box>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>Historial de reservaciones</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Año</TableCell>
                    <TableCell>Entrada</TableCell>
                    <TableCell>Salida</TableCell>
                    <TableCell>Mantenimiento</TableCell>
                    <TableCell>Pagado</TableCell>
                    <TableCell>Estatus</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(quintaData?.bookings || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ color: C.muted, py: 2 }}>
                        Sin reservaciones registradas
                      </TableCell>
                    </TableRow>
                  )}
                  {(quintaData?.bookings || []).map((b: any) => (
                    <TableRow key={b.id} sx={b.cancelled_at ? { opacity: 0.5 } : undefined}>
                      <TableCell>{b.year}</TableCell>
                      <TableCell>{fmtDate(b.start_date)}</TableCell>
                      <TableCell>{fmtDate(b.end_date)}</TableCell>
                      <TableCell>{fmtMXN(b.maintenance_fee)}</TableCell>
                      <TableCell>
                        <Checkbox
                          size="small"
                          checked={!!b.maintenance_paid}
                          disabled={!!b.cancelled_at}
                          onChange={() => handleTogglePaid(b.id, !!b.maintenance_paid)}
                          sx={{ color: C.orange, '&.Mui-checked': { color: C.success } }}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={b.cancelled_at ? 'Cancelada' : b.status}
                          size="small"
                          color={b.cancelled_at ? 'default' : 'primary'}
                          variant={b.cancelled_at ? 'outlined' : 'filled'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {!b.cancelled_at && (
                          <Tooltip title="Cancelar reservación">
                            <IconButton size="small" color="error" onClick={() => handleCancelQuinta(b.id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ borderTop: `1px solid ${C.border}`, px: 3, py: 1.5 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', color: C.text }}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}
