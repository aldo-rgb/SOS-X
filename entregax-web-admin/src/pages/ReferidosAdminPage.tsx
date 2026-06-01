import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  TextField,
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Divider,
  Tooltip,
  IconButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PeopleIcon from '@mui/icons-material/People';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import SettingsIcon from '@mui/icons-material/Settings';
import RefreshIcon from '@mui/icons-material/Refresh';

const API_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:3001/api';

interface ReferidoRow {
  id: number;
  referidor_nombre: string;
  referidor_email: string;
  referidor_codigo: string;
  referido_nombre: string;
  referido_email: string;
  estado: string;
  fecha_registro: string;
  fecha_primer_pago?: string;
  monto_primer_pago?: number;
  bono_referidor: number;
  bono_referido: number;
  bonos_pagados: boolean;
}

interface ReferralSettings {
  referrer_bonus: number;
  referred_bonus: number;
  currency: string;
  minimum_order_amount: number;
  is_active: boolean;
}

const ESTADO_CONFIG: Record<string, { label: string; color: 'success' | 'warning' | 'default' | 'error' }> = {
  validado:   { label: '✓ Primer envío',   color: 'success' },
  primer_pago: { label: 'En proceso',       color: 'warning' },
  registrado: { label: 'Sin primer envío',  color: 'default' },
  rechazado:  { label: 'No válido',         color: 'error' },
  expirado:   { label: 'Expirado',          color: 'default' },
};

export default function ReferidosAdminPage() {
  const [rows, setRows] = useState<ReferidoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState<Partial<ReferralSettings>>({});
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');

  const authHeaders = () => {
    const token = localStorage.getItem('token') || '';
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [refRes, cfgRes] = await Promise.all([
        fetch(`${API_URL}/admin/referidos/todos`, { headers: authHeaders() }),
        fetch(`${API_URL}/referidos/configuracion`),
      ]);

      if (refRes.ok) {
        const data = await refRes.json();
        setRows(data.data || []);
      }
      if (cfgRes.ok) {
        const data = await cfgRes.json();
        setSettings(data.data || null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openSettings = () => {
    if (settings) setSettingsForm({ ...settings });
    setSettingsError('');
    setSettingsSuccess('');
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    setSettingsError('');
    setSettingsSuccess('');
    try {
      const res = await fetch(`${API_URL}/admin/referidos/configuracion`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      setSettingsSuccess('Configuración guardada correctamente.');
      setSettings({ ...settings!, ...settingsForm } as ReferralSettings);
    } catch (e: any) {
      setSettingsError(e.message);
    } finally {
      setSettingsSaving(false);
    }
  };

  const filtered = rows.filter(r => {
    const matchEstado = filterEstado === 'todos' || r.estado === filterEstado;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      r.referidor_nombre?.toLowerCase().includes(q) ||
      r.referido_nombre?.toLowerCase().includes(q) ||
      r.referidor_codigo?.toLowerCase().includes(q) ||
      r.referido_email?.toLowerCase().includes(q);
    return matchEstado && matchSearch;
  });

  const totalReferidos = rows.length;
  const validados = rows.filter(r => r.estado === 'validado').length;
  const pendientes = rows.filter(r => r.estado === 'registrado' || r.estado === 'primer_pago').length;
  const totalBonos = rows
    .filter(r => r.bonos_pagados)
    .reduce((sum, r) => sum + (r.bono_referidor || 0), 0);

  const statCards = [
    { label: 'Total Referidos', value: totalReferidos, icon: <PeopleIcon />, color: '#0097A7' },
    { label: 'Primer envío completado', value: validados, icon: <CheckCircleIcon />, color: '#4CAF50' },
    { label: 'Sin primer envío', value: pendientes, icon: <HourglassEmptyIcon />, color: '#FF9800' },
    { label: 'Bonos pagados', value: `$${totalBonos.toLocaleString()}`, icon: <MonetizationOnIcon />, color: '#F05A28' },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Gestión de Referidos</Typography>
          <Typography variant="body2" color="text.secondary">
            Programa "Trae un amigo" — $500 MXN al referidor y referido al completar primer envío ≥ $1,000
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Actualizar">
            <IconButton onClick={loadData}><RefreshIcon /></IconButton>
          </Tooltip>
          <Button variant="outlined" startIcon={<SettingsIcon />} onClick={openSettings}>
            Configurar bonos
          </Button>
        </Box>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {statCards.map(card => (
          <Grid size={{ xs: 6, md: 3 }} key={card.label}>
            <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, borderRadius: 2 }}>
              <Box sx={{ color: card.color, display: 'flex' }}>{card.icon}</Box>
              <Box>
                <Typography variant="h6" fontWeight={700}>{card.value}</Typography>
                <Typography variant="caption" color="text.secondary">{card.label}</Typography>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Buscar por nombre, código, email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          sx={{ flex: 1, minWidth: 240 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Estado</InputLabel>
          <Select value={filterEstado} label="Estado" onChange={e => setFilterEstado(e.target.value)}>
            <MenuItem value="todos">Todos</MenuItem>
            <MenuItem value="registrado">Sin primer envío</MenuItem>
            <MenuItem value="primer_pago">En proceso</MenuItem>
            <MenuItem value="validado">Primer envío completado</MenuItem>
            <MenuItem value="rechazado">No válido</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <PeopleIcon sx={{ fontSize: 48, color: '#ccc', mb: 1 }} />
          <Typography color="text.secondary">No hay referidos con estos filtros</Typography>
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Referidor</TableCell>
                <TableCell>Código</TableCell>
                <TableCell>Referido</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Registro</TableCell>
                <TableCell>Primer envío</TableCell>
                <TableCell align="right">Monto</TableCell>
                <TableCell>Bonos</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map(r => {
                const estadoCfg = ESTADO_CONFIG[r.estado] || { label: r.estado, color: 'default' as const };
                return (
                  <TableRow key={r.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{r.referidor_nombre}</Typography>
                      <Typography variant="caption" color="text.secondary">{r.referidor_email}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={r.referidor_codigo} size="small" sx={{ fontWeight: 700, letterSpacing: 1 }} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{r.referido_nombre}</Typography>
                      <Typography variant="caption" color="text.secondary">{r.referido_email}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={estadoCfg.label}
                        color={estadoCfg.color}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">
                        {r.fecha_registro ? new Date(r.fecha_registro).toLocaleDateString('es-MX') : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">
                        {r.fecha_primer_pago ? new Date(r.fecha_primer_pago).toLocaleDateString('es-MX') : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {r.monto_primer_pago ? `$${Number(r.monto_primer_pago).toLocaleString('es-MX', { minimumFractionDigits: 0 })}` : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {r.bonos_pagados ? (
                        <Chip label="Pagados" color="success" size="small" />
                      ) : (
                        <Typography variant="caption" color="text.secondary">Pendiente</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Settings dialog */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Configurar Bonos de Referidos</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {settingsError && <Alert severity="error">{settingsError}</Alert>}
            {settingsSuccess && <Alert severity="success">{settingsSuccess}</Alert>}
            <TextField
              label="Bono para el referidor (MXN)"
              type="number"
              value={settingsForm.referrer_bonus ?? ''}
              onChange={e => setSettingsForm(f => ({ ...f, referrer_bonus: Number(e.target.value) }))}
              fullWidth size="small"
            />
            <TextField
              label="Bono para el referido (MXN)"
              type="number"
              value={settingsForm.referred_bonus ?? ''}
              onChange={e => setSettingsForm(f => ({ ...f, referred_bonus: Number(e.target.value) }))}
              fullWidth size="small"
            />
            <TextField
              label="Monto mínimo del primer envío (MXN)"
              type="number"
              value={settingsForm.minimum_order_amount ?? ''}
              onChange={e => setSettingsForm(f => ({ ...f, minimum_order_amount: Number(e.target.value) }))}
              fullWidth size="small"
            />
            <Divider />
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2">Programa activo</Typography>
              <Select
                size="small"
                value={settingsForm.is_active ? 'true' : 'false'}
                onChange={e => setSettingsForm(f => ({ ...f, is_active: e.target.value === 'true' }))}
                sx={{ minWidth: 100 }}
              >
                <MenuItem value="true">Activo</MenuItem>
                <MenuItem value="false">Inactivo</MenuItem>
              </Select>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSettingsOpen(false)} sx={{ color: '#666' }}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={saveSettings}
            disabled={settingsSaving}
          >
            {settingsSaving ? <CircularProgress size={18} color="inherit" /> : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
