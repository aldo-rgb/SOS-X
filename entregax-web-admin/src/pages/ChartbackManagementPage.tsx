import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, InputAdornment, Select, MenuItem,
  FormControl, InputLabel, Chip, CircularProgress, Alert, Button,
  Checkbox, Tooltip, Stack, IconButton,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  PersonAdd as AssignIcon,
  PersonOff as UnassignIcon,
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
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={28} />
                </TableCell>
              </TableRow>
            ) : clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
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
                  sx={{ '&.Mui-selected': { bgcolor: '#EEF2FF' } }}
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
    </Box>
  );
}
