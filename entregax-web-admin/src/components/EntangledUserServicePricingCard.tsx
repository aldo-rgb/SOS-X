// ============================================================================
// EntangledUserServicePricingCard
// Admin: overrides de comisión por usuario y por servicio (con/sin factura).
// Endpoints:
//   GET    /api/admin/entangled/user-service-pricing
//   PUT    /api/admin/entangled/user-service-pricing/:userId/:servicio
//   DELETE /api/admin/entangled/user-service-pricing/:userId/:servicio
//   GET    /api/admin/users/search?q=
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Card, CardContent, Box, Typography, Stack, TextField, Button, MenuItem,
  Table, TableHead, TableRow, TableCell, TableBody, IconButton, Chip,
  Autocomplete, CircularProgress, Alert, Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import GroupsIcon from '@mui/icons-material/Groups';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

type Servicio = 'pago_con_factura' | 'pago_sin_factura';

interface UserOpt {
  id: number;
  full_name?: string | null;
  email?: string | null;
}

interface OverrideRow {
  user_id: number;
  servicio: Servicio;
  comision_porcentaje: number | string;
  notes?: string | null;
  client_name?: string | null;
  client_email?: string | null;
  updated_at: string;
}

export default function EntangledUserServicePricingCard() {
  const token = localStorage.getItem('token') || '';
  const headers = { Authorization: `Bearer ${token}` };

  const [rows, setRows] = useState<OverrideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'error' | 'info'; msg: string } | null>(null);

  // form
  const [userQuery, setUserQuery] = useState('');
  const [userOpts, setUserOpts] = useState<UserOpt[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [user, setUser] = useState<UserOpt | null>(null);
  const [servicio, setServicio] = useState<Servicio>('pago_con_factura');
  const [pct, setPct] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await axios.get(`${API_URL}/api/admin/entangled/user-service-pricing`, { headers });
      setRows(Array.isArray(r.data) ? r.data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  // Búsqueda de usuarios (debounce simple)
  useEffect(() => {
    if (!userQuery || userQuery.trim().length < 2) { setUserOpts([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        setUserLoading(true);
        const r = await axios.get(`${API_URL}/api/admin/users/search`, {
          headers, params: { q: userQuery.trim() },
        });
        if (cancelled) return;
        const list: UserOpt[] = Array.isArray(r.data) ? r.data : (r.data?.data || []);
        setUserOpts(list.slice(0, 25));
      } catch {
        if (!cancelled) setUserOpts([]);
      } finally {
        if (!cancelled) setUserLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userQuery]);

  const save = async () => {
    setFeedback(null);
    if (!user) { setFeedback({ severity: 'error', msg: 'Selecciona un cliente' }); return; }
    const n = Number(pct);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setFeedback({ severity: 'error', msg: 'El % debe estar entre 0 y 100' }); return;
    }
    try {
      setSaving(true);
      await axios.put(
        `${API_URL}/api/admin/entangled/user-service-pricing/${user.id}/${servicio}`,
        { comision_porcentaje: n, notes: notes.trim() || null },
        { headers },
      );
      setFeedback({ severity: 'success', msg: 'Override guardado' });
      setPct(''); setNotes('');
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Error al guardar';
      setFeedback({ severity: 'error', msg });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (userId: number, srv: Servicio) => {
    if (!confirm('¿Eliminar este override? El cliente volverá al % global.')) return;
    try {
      await axios.delete(`${API_URL}/api/admin/entangled/user-service-pricing/${userId}/${srv}`, { headers });
      load();
    } catch {
      setFeedback({ severity: 'error', msg: 'No se pudo eliminar' });
    }
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 3, mb: 3 }}>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <GroupsIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>
            Overrides de comisión por cliente
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Sobrescribe la comisión XPAY por servicio para clientes específicos. Si existe override
          para un cliente, se usa en lugar del % global.
        </Typography>

        {feedback && (
          <Alert severity={feedback.severity} onClose={() => setFeedback(null)} sx={{ mt: 2 }}>
            {feedback.msg}
          </Alert>
        )}

        <Box sx={{ mt: 2, p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
            <Autocomplete
              sx={{ minWidth: 280, flex: 1 }}
              options={userOpts}
              loading={userLoading}
              value={user}
              onChange={(_, v) => setUser(v)}
              onInputChange={(_, v) => setUserQuery(v)}
              getOptionLabel={(o) => `${o.full_name || ''} · ${o.email || ''} (#${o.id})`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField {...params} label="Cliente" placeholder="Buscar nombre, email o box" />
              )}
            />
            <TextField
              select
              label="Servicio"
              value={servicio}
              onChange={(e) => setServicio(e.target.value as Servicio)}
              sx={{ minWidth: 200 }}
            >
              <MenuItem value="pago_con_factura">Con factura</MenuItem>
              <MenuItem value="pago_sin_factura">Sin factura</MenuItem>
            </TextField>
            <TextField
              label="Comisión %"
              type="number"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              sx={{ width: 140 }}
              InputProps={{ inputProps: { min: 0, max: 100, step: 0.01 } }}
            />
            <TextField
              label="Notas"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              sx={{ flex: 1, minWidth: 200 }}
            />
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              onClick={save}
              disabled={saving}
              sx={{ height: 56 }}
            >
              Guardar
            </Button>
          </Stack>
        </Box>

        <Box sx={{ mt: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell>Cliente</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Servicio</TableCell>
                <TableCell align="right">% Override</TableCell>
                <TableCell>Notas</TableCell>
                <TableCell>Actualizado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} align="center"><CircularProgress size={20} /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                  Sin overrides registrados
                </TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={`${r.user_id}-${r.servicio}`}>
                  <TableCell>{r.client_name || `#${r.user_id}`}</TableCell>
                  <TableCell>{r.client_email || '—'}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={r.servicio === 'pago_sin_factura' ? 'Sin factura' : 'Con factura'}
                      color={r.servicio === 'pago_sin_factura' ? 'default' : 'primary'}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {Number(r.comision_porcentaje).toFixed(2)}%
                  </TableCell>
                  <TableCell sx={{ maxWidth: 240 }}>
                    <Typography variant="caption" color="text.secondary" noWrap title={r.notes || ''}>
                      {r.notes || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {new Date(r.updated_at).toLocaleDateString('es-MX')}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Eliminar override">
                      <IconButton size="small" color="error" onClick={() => remove(r.user_id, r.servicio)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </CardContent>
    </Card>
  );
}
