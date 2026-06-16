import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, InputAdornment, Select, MenuItem,
  FormControl, InputLabel, Chip, CircularProgress, Alert, Button,
  Checkbox, Tooltip, Stack, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, Divider, Grid,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  PersonAdd as AssignIcon,
  PersonOff as UnassignIcon,
  Casino as RandomIcon,
  LocalShipping as ShippingIcon,
  Close as CloseIcon,
  Inventory2 as BoxIcon,
  History as HistoryIcon,
  CheckCircle as RecoveredIcon,
} from '@mui/icons-material';
import api from '../services/api';

interface ChartbackClient {
  id: number;
  box_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  asesor: string | null;
  chartback_status: string | null;
  next_contact_at: string | null;
  recovery_advisor_id: number | null;
  recovery_advisor_name: string | null;
}

interface Advisor {
  id: number;
  full_name: string;
  can_recovery: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: 'default' | 'warning' | 'error' | 'success' | 'info' }> = {
  pending: { label: 'Pendiente', color: 'warning' },
  no_answer: { label: 'Sin respuesta', color: 'error' },
  callback: { label: 'Llamar después', color: 'info' },
  recovered: { label: 'Recuperado', color: 'success' },
};

export default function ChartbackManagementPage() {
  const [clients, setClients] = useState<ChartbackClient[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterAdvisor, setFilterAdvisor] = useState<string>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [assignAdvisorId, setAssignAdvisorId] = useState<string>('');
  const [cargoModal, setCargoModal] = useState<{ open: boolean; client: ChartbackClient | null; data: any; loading: boolean }>({
    open: false, client: null, data: null, loading: false,
  });
  const [cargoTab, setCargoTab] = useState<'carga' | 'historial'>('carga');
  const [recoveringId, setRecoveringId] = useState<number | null>(null);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (search.trim()) params.search = search.trim();
      if (filterAdvisor !== 'all') params.advisor_id = filterAdvisor;
      const res = await api.get('/admin/legacy/chartback', { params });
      setClients(res.data.clients || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  }, [search, filterAdvisor]);

  const fetchAdvisors = async () => {
    try {
      const res = await api.get('/admin/advisors');
      const list = Array.isArray(res.data) ? res.data : [];
      setAdvisors(list);
    } catch (e: any) {
      console.error('Error cargando asesores:', e);
      setError('Error al cargar asesores: ' + (e?.response?.data?.error || e?.message));
    }
  };

  useEffect(() => { fetchAdvisors(); }, []);
  useEffect(() => { fetchClients(); }, [fetchClients]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelected(new Set(clients.map(c => c.id)));
    else setSelected(new Set());
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleOpenCargo = async (client: ChartbackClient) => {
    setCargoTab('carga');
    setCargoModal({ open: true, client, data: null, loading: true });
    try {
      const res = await api.get(`/admin/legacy/chartback/${client.box_id}/cargo`);
      setCargoModal(prev => ({ ...prev, data: res.data, loading: false }));
    } catch {
      setCargoModal(prev => ({ ...prev, loading: false }));
    }
  };

  const handleRandomAssign = async () => {
    if (selected.size === 0 || recoveryAdvisors.length === 0) return;

    // Solo repartir entre los clientes seleccionados que NO tienen asesor de recovery asignado
    const selectedClients = clients.filter(c => selected.has(c.id));
    const unassignedIds = selectedClients
      .filter(c => c.recovery_advisor_id == null)
      .map(c => c.id);

    if (unassignedIds.length === 0) {
      setError('Todos los clientes seleccionados ya tienen asesor asignado');
      return;
    }

    const skipped = selected.size - unassignedIds.length;
    const groups = new Map<number, number[]>();
    for (const id of unassignedIds) {
      const advisor = recoveryAdvisors[Math.floor(Math.random() * recoveryAdvisors.length)];
      if (!groups.has(advisor.id)) groups.set(advisor.id, []);
      groups.get(advisor.id)!.push(id);
    }
    setAssigning(true);
    setError(null);
    try {
      await Promise.all(
        Array.from(groups.entries()).map(([advisorId, ids]) =>
          api.patch('/admin/legacy/chartback/assign', { ids, advisor_id: advisorId })
        )
      );
      const skippedMsg = skipped > 0 ? ` (${skipped} ya ten\u00edan asesor y se omitieron)` : '';
      setSuccess(`${unassignedIds.length} cliente(s) asignados aleatoriamente entre ${groups.size} asesor(es)${skippedMsg}`);
      setSelected(new Set());
      setAssignAdvisorId('');
      fetchClients();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Error al asignar');
    } finally {
      setAssigning(false);
    }
  };

  const handleAssign = async (advisorIdVal: number | null) => {
    if (selected.size === 0) return;
    setAssigning(true);
    setError(null);
    try {
      await api.patch('/admin/legacy/chartback/assign', {
        ids: Array.from(selected),
        advisor_id: advisorIdVal,
      });
      const advisorName = advisorIdVal
        ? advisors.find(a => a.id === advisorIdVal)?.full_name || 'asesor'
        : null;
      setSuccess(
        advisorName
          ? `${selected.size} cliente(s) asignados a ${advisorName}`
          : `${selected.size} cliente(s) desasignados`
      );
      setSelected(new Set());
      setAssignAdvisorId('');
      fetchClients();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Error al asignar');
    } finally {
      setAssigning(false);
    }
  };

  const handleMarkRecovered = async (clientId: number, _clientName: string | null) => {
    setRecoveringId(clientId);
    setError(null);
    try {
      await api.patch(`/admin/legacy/chartback/${clientId}/recover`);
      setSuccess(`Cliente marcado como Recuperado`);
      setCargoModal(prev => ({ ...prev, open: false }));
      fetchClients();
    } catch (e: any) {
      const status = e?.response?.status;
      const serverMsg = e?.response?.data?.error || e?.response?.data?.message;
      const detail = serverMsg ? `${serverMsg}${status ? ` (HTTP ${status})` : ''}` : `Error al marcar como recuperado${status ? ` (HTTP ${status})` : ''}`;
      console.error('Mark recovered failed', { clientId, status, data: e?.response?.data, message: e?.message });
      setError(detail);
    } finally {
      setRecoveringId(null);
    }
  };

  const recoveryAdvisors = advisors.filter(a => a.can_recovery);
  const allSelected = clients.length > 0 && selected.size === clients.length;

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
        Gestión Chartback — Reactivación
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Asigna asesores a clientes chartback para que los contacten desde la app móvil.
      </Typography>
      <Typography variant="caption" color="text.disabled" sx={{ mb: 3, display: 'block' }}>
        Asesores cargados: {advisors.length} total · {recoveryAdvisors.length} con Recovery activo
      </Typography>

      {/* Filtros */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Buscar casillero, nombre o correo..."
          value={search}
          onChange={e => { setSearch(e.target.value); }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          sx={{ minWidth: 280 }}
        />
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Filtrar por asesor</InputLabel>
          <Select
            value={filterAdvisor}
            label="Filtrar por asesor"
            onChange={e => setFilterAdvisor(e.target.value)}
          >
            <MenuItem value="all">Todos</MenuItem>
            <MenuItem value="-1">Sin asesor asignado</MenuItem>
            {recoveryAdvisors.map(a => (
              <MenuItem key={a.id} value={String(a.id)}>{a.full_name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <IconButton onClick={fetchClients} disabled={loading} size="small" sx={{ alignSelf: 'center' }}>
          <RefreshIcon />
        </IconButton>
      </Stack>

      {/* Barra de acción masiva */}
      {selected.size > 0 && (
        <Paper elevation={0} sx={{ p: 2, mb: 2, bgcolor: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <Typography variant="body2" fontWeight={600} sx={{ color: '#4338CA' }}>
              {selected.size} seleccionado(s)
            </Typography>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Asignar a asesor</InputLabel>
              <Select
                value={assignAdvisorId}
                label="Asignar a asesor"
                onChange={e => setAssignAdvisorId(e.target.value)}
              >
                {recoveryAdvisors.map(a => (
                  <MenuItem key={a.id} value={String(a.id)}>{a.full_name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              size="small"
              startIcon={assigning ? <CircularProgress size={14} color="inherit" /> : <AssignIcon />}
              disabled={!assignAdvisorId || assigning}
              onClick={() => handleAssign(Number(assignAdvisorId))}
              sx={{ bgcolor: '#4338CA', '&:hover': { bgcolor: '#3730A3' } }}
            >
              Asignar
            </Button>
            <Tooltip title={`Repartir aleatoriamente entre los ${recoveryAdvisors.length} asesores con Recovery activo`}>
              <span>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={assigning ? <CircularProgress size={14} /> : <RandomIcon />}
                  disabled={assigning || recoveryAdvisors.length === 0}
                  onClick={handleRandomAssign}
                  sx={{ borderColor: '#7C3AED', color: '#7C3AED', '&:hover': { borderColor: '#6D28D9', bgcolor: '#F5F3FF' } }}
                >
                  Aleatoria
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="Quitar asesor asignado de los seleccionados">
              <Button
                variant="outlined"
                size="small"
                startIcon={<UnassignIcon />}
                disabled={assigning}
                onClick={() => handleAssign(null)}
                color="error"
              >
                Desasignar
              </Button>
            </Tooltip>
          </Stack>
        </Paper>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#F9FAFB' }}>
              <TableCell padding="checkbox">
                <Checkbox
                  size="small"
                  checked={allSelected}
                  indeterminate={selected.size > 0 && !allSelected}
                  onChange={e => handleSelectAll(e.target.checked)}
                />
              </TableCell>
              <TableCell><strong>Casillero</strong></TableCell>
              <TableCell><strong>Acciones</strong></TableCell>
              <TableCell><strong>Nombre</strong></TableCell>
              <TableCell><strong>Correo / Tel</strong></TableCell>
              <TableCell><strong>Estado CRM</strong></TableCell>
              <TableCell><strong>Próximo contacto</strong></TableCell>
              <TableCell><strong>Asesor asignado</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={28} />
                </TableCell>
              </TableRow>
            ) : clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No hay clientes chartback
                </TableCell>
              </TableRow>
            ) : clients.map(client => {
              const st = STATUS_LABELS[client.chartback_status || 'pending'] || STATUS_LABELS.pending;
              const nextContact = client.next_contact_at
                ? new Date(client.next_contact_at).toLocaleDateString('es-MX')
                : '—';
              return (
                <TableRow
                  key={client.id}
                  hover
                  selected={selected.has(client.id)}
                  sx={{ '&.Mui-selected': { bgcolor: '#EEF2FF' }, cursor: 'pointer' }}
                  onClick={e => {
                    if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return;
                    handleOpenCargo(client);
                  }}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={selected.has(client.id)}
                      onChange={e => handleSelectOne(client.id, e.target.checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700} sx={{ color: '#E65100' }}>
                      {client.box_id}
                    </Typography>
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <Tooltip title="Marcar como Recuperado — desaparece de esta lista">
                      <span>
                        <Button
                          size="small"
                          variant="outlined"
                          color="success"
                          startIcon={recoveringId === client.id ? <CircularProgress size={12} color="inherit" /> : <RecoveredIcon />}
                          disabled={recoveringId === client.id}
                          onClick={() => handleMarkRecovered(client.id, client.full_name)}
                          sx={{ textTransform: 'none', fontSize: 11, py: 0.3, px: 1, whiteSpace: 'nowrap' }}
                        >
                          Recuperado
                        </Button>
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{client.full_name || '—'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" display="block">{client.email || '—'}</Typography>
                    <Typography variant="caption" color="text.secondary">{client.phone || '—'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={st.label} color={st.color} size="small" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{nextContact}</Typography>
                  </TableCell>
                  <TableCell>
                    {client.recovery_advisor_name ? (
                      <Chip
                        label={client.recovery_advisor_name}
                        size="small"
                        sx={{ bgcolor: '#D1FAE5', color: '#065F46', fontWeight: 600 }}
                      />
                    ) : (
                      <Typography variant="caption" color="text.disabled">Sin asignar</Typography>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        {clients.length} cliente(s) · Solo asesores con permiso Recovery pueden ver clientes en la app
      </Typography>

      {/* Modal de carga en tránsito */}
      <Dialog
        open={cargoModal.open}
        onClose={() => setCargoModal(prev => ({ ...prev, open: false }))}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
          <ShippingIcon color="warning" />
          <Box flex={1}>
            <Typography fontWeight={700}>
              {cargoModal.client?.full_name || cargoModal.client?.box_id || '—'}
            </Typography>
            {cargoModal.client && (
              <Typography variant="body2" color="text.secondary">
                {cargoModal.client.box_id} · {cargoModal.client.asesor || 'Sin asesor'}
              </Typography>
            )}
          </Box>
          {/* Tabs */}
          <Box sx={{ display: 'flex', gap: 0.5, mr: 1 }}>
            <Button
              size="small"
              variant={cargoTab === 'carga' ? 'contained' : 'outlined'}
              startIcon={<ShippingIcon />}
              onClick={() => setCargoTab('carga')}
              sx={{ borderRadius: 2, textTransform: 'none', fontSize: 12 }}
            >
              Carga
            </Button>
            <Button
              size="small"
              variant={cargoTab === 'historial' ? 'contained' : 'outlined'}
              color="secondary"
              startIcon={<HistoryIcon />}
              onClick={() => setCargoTab('historial')}
              sx={{ borderRadius: 2, textTransform: 'none', fontSize: 12 }}
            >
              Historial
            </Button>
          </Box>
          <IconButton size="small" onClick={() => setCargoModal(prev => ({ ...prev, open: false }))}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {cargoModal.loading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : !cargoModal.data ? (
            <Alert severity="error">No se pudo cargar la información</Alert>
          ) : cargoTab === 'historial' ? (
            /* ── Tab Historial ── */
            (() => {
              const raw = cargoModal.data.local_client?.chartback_activity;
              const acts: any[] = Array.isArray(raw) ? [...raw].reverse() : [];
              const typeLabel = (t: string) => ({ whatsapp: 'WhatsApp', no_answer: 'No contestó', callback: 'Llamar después', recovered: 'Recuperado', call_note: 'Nota de llamada' }[t] || t);
              const typeColor = (t: string): string => ({ whatsapp: '#25D366', no_answer: '#F59E0B', callback: '#7C3AED', recovered: '#16A34A', call_note: '#3B82F6' }[t] || '#6B7280');
              if (acts.length === 0) {
                return (
                  <Box textAlign="center" py={6}>
                    <HistoryIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                    <Typography color="text.secondary">Sin movimientos registrados para este cliente</Typography>
                  </Box>
                );
              }
              return (
                <Box>
                  {acts.map((a, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        display: 'flex', gap: 2, py: 1.5, px: 1,
                        borderBottom: idx < acts.length - 1 ? '1px solid' : 'none',
                        borderColor: 'divider',
                        '&:hover': { bgcolor: 'action.hover' },
                        borderRadius: 1,
                      }}
                    >
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: typeColor(a.type), mt: 0.7, flexShrink: 0 }} />
                      <Box flex={1}>
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2" fontWeight={700} sx={{ color: typeColor(a.type) }}>
                            {typeLabel(a.type)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(a.ts).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          Asesor: {a.advisor || '—'}
                        </Typography>
                        {a.note && (
                          <Typography variant="body2" sx={{ mt: 0.5, color: 'text.primary', fontStyle: 'italic' }}>
                            "{a.note}"
                          </Typography>
                        )}
                        {a.callback_at && (
                          <Typography variant="caption" sx={{ color: '#7C3AED', display: 'block', mt: 0.3 }}>
                            Agendar contacto: {new Date(a.callback_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Box>
              );
            })()
          ) : (
            <Stack spacing={3}>
              {/* Sistema EntregaX Legado */}
              <Box>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <BoxIcon fontSize="small" color="warning" /> Sistema EntregaX (Legado)
                </Typography>

                {/* Paquetes pendientes EN VIVO */}
                {cargoModal.data.live_pending ? (
                  <Grid container spacing={2} sx={{ mb: 2 }}>
                    {(['usa', 'tdi', 'dhl', 'maritimo'] as const).map(service => {
                      const svc = cargoModal.data.live_pending?.[service];
                      if (!svc || svc.count === 0) return null;
                      return (
                        <Grid key={service} size={{ xs: 12, sm: 6 }}>
                          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                            <Typography variant="overline" color="text.secondary" display="block">
                              {service.toUpperCase()} — {svc.count} paquete(s)
                            </Typography>
                            {svc.data.map((pkg: any, i: number) => (
                              <Box key={i} sx={{ mt: 0.5 }}>
                                <Typography variant="body2" fontWeight={600} fontFamily="monospace">
                                  {pkg.guiaus || pkg.guia || pkg.tracking || '—'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">{pkg.estado || '—'}</Typography>
                              </Box>
                            ))}
                          </Paper>
                        </Grid>
                      );
                    })}
                    {['usa','tdi','dhl','maritimo'].every(s => !(cargoModal.data.live_pending?.[s]?.count)) && (
                      <Grid size={{ xs: 12 }}>
                        <Typography variant="body2" color="text.secondary">Sin paquetes pendientes en sistemaentregax.com</Typography>
                      </Grid>
                    )}
                  </Grid>
                ) : (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    No se encontraron pendientes en vivo desde sistemaentregax.com (puede ser timeout o el cliente no existe allí)
                  </Alert>
                )}

                {/* Último envío aéreo — desde nuestra DB */}
                {cargoModal.data.local_client?.last_send && (() => {
                  const ls = typeof cargoModal.data.local_client.last_send === 'string'
                    ? JSON.parse(cargoModal.data.local_client.last_send)
                    : cargoModal.data.local_client.last_send;
                  return (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                        ✈️ Último envío aéreo (sincronizado)
                      </Typography>
                      <Grid container spacing={1}>
                        {Object.entries(ls).map(([k, v]) => (
                          <Grid key={k} size={{ xs: 6, sm: 4 }}>
                            <Typography variant="caption" color="text.secondary" display="block">{k}</Typography>
                            <Typography variant="body2" fontWeight={500}>{String(v) || '—'}</Typography>
                          </Grid>
                        ))}
                      </Grid>
                    </>
                  );
                })()}

                {/* Último envío marítimo — desde nuestra DB */}
                {cargoModal.data.local_client?.last_send_maritimo && (() => {
                  const lm = typeof cargoModal.data.local_client.last_send_maritimo === 'string'
                    ? JSON.parse(cargoModal.data.local_client.last_send_maritimo)
                    : cargoModal.data.local_client.last_send_maritimo;
                  return (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                        🚢 Último envío marítimo (sincronizado)
                      </Typography>
                      <Grid container spacing={1}>
                        {Object.entries(lm).map(([k, v]) => (
                          <Grid key={k} size={{ xs: 6, sm: 4 }}>
                            <Typography variant="caption" color="text.secondary" display="block">{k}</Typography>
                            <Typography variant="body2" fontWeight={500}>{String(v) || '—'}</Typography>
                          </Grid>
                        ))}
                      </Grid>
                    </>
                  );
                })()}

                {!cargoModal.data.local_client && !cargoModal.data.live_pending && (
                  <Alert severity="info">Este cliente no tiene datos en el sistema EntregaX legado</Alert>
                )}
              </Box>

              {/* Paquetes en nuestro sistema */}
              <Box>
                <Divider sx={{ mb: 2 }} />
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ShippingIcon fontSize="small" color="primary" /> Nuestro Sistema
                </Typography>
                {!cargoModal.data.our_packages?.length ? (
                  <Typography variant="body2" color="text.secondary">Sin paquetes en nuestro sistema</Typography>
                ) : (
                  <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                          <TableCell><strong>Tracking</strong></TableCell>
                          <TableCell><strong>Carrier</strong></TableCell>
                          <TableCell><strong>Estado</strong></TableCell>
                          <TableCell><strong>Peso</strong></TableCell>
                          <TableCell><strong>Fecha</strong></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {cargoModal.data.our_packages.map((pkg: any) => (
                          <TableRow key={pkg.id} hover>
                            <TableCell><Typography variant="caption" fontFamily="monospace">{pkg.tracking_number || '—'}</Typography></TableCell>
                            <TableCell>{pkg.carrier || '—'}</TableCell>
                            <TableCell><Chip label={pkg.status || '—'} size="small" color="info" variant="outlined" /></TableCell>
                            <TableCell>{pkg.weight_kg ? `${pkg.weight_kg} kg` : '—'}</TableCell>
                            <TableCell>{pkg.created_at ? new Date(pkg.created_at).toLocaleDateString('es-MX') : '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between' }}>
          <Button
            variant="contained"
            color="success"
            startIcon={recoveringId === cargoModal.client?.id ? <CircularProgress size={14} color="inherit" /> : <RecoveredIcon />}
            disabled={!cargoModal.client || recoveringId === cargoModal.client?.id}
            onClick={() => cargoModal.client && handleMarkRecovered(cargoModal.client.id, cargoModal.client.full_name)}
            sx={{ textTransform: 'none' }}
          >
            Marcar como Recuperado
          </Button>
          <Button onClick={() => setCargoModal(prev => ({ ...prev, open: false }))}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
