// ============================================
// GESTIÓN CAJO - GUÍAS AÉREAS DE CLIENTES NO-S
// Panel completo con tabla, filtros, búsqueda,
// edición, cambio de estado y estadísticas
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  IconButton,
  Chip,
  Card,
  CardContent,
  Grid,
  Alert,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  CircularProgress,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment,
  Tooltip,
  Checkbox,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Divider,
  TablePagination,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FlightIcon from '@mui/icons-material/Flight';
import InventoryIcon from '@mui/icons-material/Inventory';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import PeopleIcon from '@mui/icons-material/People';
import ScaleIcon from '@mui/icons-material/Scale';
import SettingsIcon from '@mui/icons-material/Settings';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const CAJO_COLOR = '#FF6F00';
const CAJO_BG = '#FFF3E0';

interface CajoGuide {
  id: number;
  guia_air: string | null;
  cliente: string | null;
  no_caja: string | null;
  peso_kg: number | null;
  largo: number | null;
  ancho: number | null;
  alto: number | null;
  volumen: number | null;
  tipo: string | null;
  observaciones: string | null;
  vuelo: string | null;
  guia_vuelo: string | null;
  mawb: string | null;
  awb_draft_id: number | null;
  paqueteria: string | null;
  guia_entrega: string | null;
  no_tarima: string | null;
  fecha_registro: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface CajoStats {
  total: string;
  registered: string;
  in_transit: string;
  delivered: string;
  pending: string;
  total_mawbs: string;
  total_clientes: string;
  total_kg: string;
  tipo_logo: string;
  tipo_generico: string;
  tipo_medical: string;
}

interface Props {
  onBack: () => void;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'registered', label: '📋 Registrado' },
  { value: 'in_transit', label: '✈️ En Tránsito' },
  { value: 'at_customs', label: '🛃 En Aduana' },
  { value: 'delivered', label: '✅ Entregado' },
  { value: 'pending', label: '⏳ Pendiente' },
  { value: 'cancelled', label: '❌ Cancelado' },
];

const statusChipConfig: Record<string, { label: string; color: 'default' | 'warning' | 'info' | 'success' | 'error' | 'primary' | 'secondary' }> = {
  registered: { label: '📋 Registrado', color: 'warning' },
  in_transit: { label: '✈️ En Tránsito', color: 'info' },
  at_customs: { label: '🛃 En Aduana', color: 'secondary' },
  delivered: { label: '✅ Entregado', color: 'success' },
  pending: { label: '⏳ Pendiente', color: 'default' },
  cancelled: { label: '❌ Cancelado', color: 'error' },
};

const tipoColor = (t: string | null) => {
  if (t === 'Logo') return 'warning' as const;
  if (t === 'Medical') return 'error' as const;
  return 'success' as const;
};

const CajoManagementPage: React.FC<Props> = ({ onBack }) => {
  const [guides, setGuides] = useState<CajoGuide[]>([]);
  const [stats, setStats] = useState<CajoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'info' });

  // Detail / Edit dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [editGuide, setEditGuide] = useState<CajoGuide | null>(null);
  const [editForm, setEditForm] = useState({ status: '', observaciones: '', tipo: '', paqueteria: '', guia_entrega: '' });
  const [saving, setSaving] = useState(false);

  // Batch status dialog
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchStatus, setBatchStatus] = useState('in_transit');

  // Overfee dialog
  const [overfeeOpen, setOverfeeOpen] = useState(false);
  const [overfeeValue, setOverfeeValue] = useState('');
  const [savingOverfee, setSavingOverfee] = useState(false);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // ========== FETCH DATA ==========
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      params.set('limit', String(rowsPerPage));
      params.set('offset', String(page * rowsPerPage));

      const [guidesRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/cajo/guides?${params}`, { headers }),
        fetch(`${API_URL}/api/cajo/stats`, { headers }),
      ]);

      if (guidesRes.ok) {
        const data = await guidesRes.json();
        setGuides(data.guides || []);
        setTotal(data.total || 0);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats || null);
      }
    } catch (err) {
      console.error('Error cargando CAJO:', err);
      setSnackbar({ open: true, message: 'Error al cargar datos', severity: 'error' });
    }
    setLoading(false);
  }, [statusFilter, search, page, rowsPerPage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ========== DETAIL ==========
  const openDetail = (guide: CajoGuide) => {
    setEditGuide(guide);
    setEditForm({
      status: guide.status,
      observaciones: guide.observaciones || '',
      tipo: guide.tipo || 'Generico',
      paqueteria: guide.paqueteria || '',
      guia_entrega: guide.guia_entrega || '',
    });
    setDetailOpen(true);
  };

  const saveEdit = async () => {
    if (!editGuide) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/cajo/guides/${editGuide.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setSnackbar({ open: true, message: '✅ Guía actualizada', severity: 'success' });
        setDetailOpen(false);
        loadData();
      } else {
        const err = await res.json();
        setSnackbar({ open: true, message: `Error: ${err.error}`, severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Error al guardar', severity: 'error' });
    }
    setSaving(false);
  };

  // ========== BATCH STATUS ==========
  const handleBatchStatus = async () => {
    if (selected.length === 0) return;
    try {
      const res = await fetch(`${API_URL}/api/cajo/guides/batch-status`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ids: selected, status: batchStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setSnackbar({ open: true, message: data.message, severity: 'success' });
        setSelected([]);
        setBatchOpen(false);
        loadData();
      }
    } catch {
      setSnackbar({ open: true, message: 'Error al actualizar', severity: 'error' });
    }
  };

  // ========== DELETE ==========
  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta guía?')) return;
    try {
      const res = await fetch(`${API_URL}/api/cajo/guides/${id}`, { method: 'DELETE', headers });
      if (res.ok) {
        setSnackbar({ open: true, message: 'Guía eliminada', severity: 'info' });
        loadData();
      }
    } catch {
      setSnackbar({ open: true, message: 'Error al eliminar', severity: 'error' });
    }
  };

  // ========== SELECTION ==========
  const toggleSelect = (id: number) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selected.length === guides.length) {
      setSelected([]);
    } else {
      setSelected(guides.map(g => g.id));
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' }); }
    catch { return d; }
  };

  // ========== OVERFEE ==========
  const loadOverfee = async () => {
    try {
      const res = await fetch(`${API_URL}/api/cajo/overfee`, { headers });
      if (res.ok) {
        const data = await res.json();
        setOverfeeValue(data.overfee_per_kg?.toString() || '0');
      }
    } catch (err) {
      console.error('Error cargando overfee:', err);
    }
  };

  const saveOverfee = async () => {
    setSavingOverfee(true);
    try {
      const res = await fetch(`${API_URL}/api/cajo/overfee`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ overfee_per_kg: parseFloat(overfeeValue) || 0 }),
      });
      if (res.ok) {
        setSnackbar({ open: true, message: '✅ Overfee guardado correctamente', severity: 'success' });
        setOverfeeOpen(false);
      } else {
        const err = await res.json();
        setSnackbar({ open: true, message: `Error: ${err.error}`, severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Error al guardar overfee', severity: 'error' });
    }
    setSavingOverfee(false);
  };

  const openOverfeeDialog = () => {
    loadOverfee();
    setOverfeeOpen(true);
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={onBack} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <FlightIcon sx={{ fontSize: 32, mr: 1, color: CAJO_COLOR }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight="bold">
            Gestión CAJO - Guías Aéreas
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Guías de clientes que no inician con S (procesadas desde extracción AWB)
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<SettingsIcon />}
          onClick={openOverfeeDialog}
          sx={{ mr: 1, borderColor: CAJO_COLOR, color: CAJO_COLOR }}
        >
          Overfee
        </Button>
        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
          onClick={() => loadData()}
          disabled={loading}
          sx={{ bgcolor: CAJO_COLOR, '&:hover': { bgcolor: '#E65100' } }}
        >
          Actualizar
        </Button>
      </Box>

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 6, md: 2 }}>
            <Card sx={{ bgcolor: CAJO_BG, border: '1px solid #ffe0b2' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <InventoryIcon sx={{ fontSize: 28, color: '#e65100' }} />
                <Typography variant="h4" fontWeight="bold">{stats.total || 0}</Typography>
                <Typography variant="caption">Total Guías</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Card sx={{ bgcolor: '#e3f2fd', border: '1px solid #bbdefb' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <FlightIcon sx={{ fontSize: 28, color: '#1565c0' }} />
                <Typography variant="h4" fontWeight="bold">{stats.in_transit || 0}</Typography>
                <Typography variant="caption">En Tránsito</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Card sx={{ bgcolor: '#e8f5e9', border: '1px solid #c8e6c9' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <CheckCircleIcon sx={{ fontSize: 28, color: '#2e7d32' }} />
                <Typography variant="h4" fontWeight="bold">{stats.delivered || 0}</Typography>
                <Typography variant="caption">Entregados</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Card sx={{ bgcolor: '#f3e5f5', border: '1px solid #e1bee7' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <PeopleIcon sx={{ fontSize: 28, color: '#7b1fa2' }} />
                <Typography variant="h4" fontWeight="bold">{stats.total_clientes || 0}</Typography>
                <Typography variant="caption">Clientes</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Card sx={{ bgcolor: '#fce4ec', border: '1px solid #f8bbd0' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <ScaleIcon sx={{ fontSize: 28, color: '#c62828' }} />
                <Typography variant="h4" fontWeight="bold">{Number(stats.total_kg || 0).toLocaleString()}</Typography>
                <Typography variant="caption">KG Total</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Card sx={{ bgcolor: '#263238', color: '#fff' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <WarehouseIcon sx={{ fontSize: 28, color: '#fff' }} />
                <Typography variant="h4" fontWeight="bold">{stats.total_mawbs || 0}</Typography>
                <Typography variant="caption" sx={{ color: '#ccc' }}>MAWBs</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Tipo chips */}
      {stats && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          {Number(stats.tipo_generico) > 0 && <Chip label={`Genérico: ${stats.tipo_generico}`} size="small" color="success" />}
          {Number(stats.tipo_logo) > 0 && <Chip label={`Logo: ${stats.tipo_logo}`} size="small" color="warning" />}
          {Number(stats.tipo_medical) > 0 && <Chip label={`Medical: ${stats.tipo_medical}`} size="small" color="error" />}
        </Box>
      )}

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Buscar guía, cliente, MAWB..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
          }}
          sx={{ minWidth: 280 }}
        />
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {STATUS_OPTIONS.map(s => (
            <Chip
              key={s.value}
              label={s.label}
              size="small"
              color={statusFilter === s.value ? 'primary' : 'default'}
              variant={statusFilter === s.value ? 'filled' : 'outlined'}
              onClick={() => { setStatusFilter(s.value); setPage(0); }}
              sx={{ cursor: 'pointer', fontWeight: statusFilter === s.value ? 700 : 400 }}
            />
          ))}
        </Box>
        {selected.length > 0 && (
          <Button
            variant="contained"
            size="small"
            startIcon={<LocalShippingIcon />}
            onClick={() => setBatchOpen(true)}
            sx={{ bgcolor: CAJO_COLOR, '&:hover': { bgcolor: '#E65100' }, textTransform: 'none' }}
          >
            Cambiar estado ({selected.length})
          </Button>
        )}
      </Box>

      {/* Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress sx={{ color: CAJO_COLOR }} />
        </Box>
      ) : guides.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          No hay guías CAJO {statusFilter !== 'all' ? `con estado "${statusFilter}"` : ''}
          {search ? ` para "${search}"` : ''}
        </Alert>
      ) : (
        <>
          <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#263238' }}>
                  <TableCell padding="checkbox" sx={{ color: 'white' }}>
                    <Checkbox
                      checked={selected.length === guides.length && guides.length > 0}
                      indeterminate={selected.length > 0 && selected.length < guides.length}
                      onChange={toggleSelectAll}
                      sx={{ color: 'white', '&.Mui-checked': { color: CAJO_COLOR } }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'white' }}>Guía AIR</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'white' }}>Cliente</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'white' }}>MAWB</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'white' }}>Tipo</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'white' }} align="right">Peso KG</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'white' }}>Dimensiones</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'white' }}>Vuelo</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'white' }}>Producto</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'white' }}>Estado</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'white' }}>Fecha</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'white' }}>Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {guides.map(g => (
                  <TableRow key={g.id} hover sx={{ '&:hover': { bgcolor: CAJO_BG } }}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selected.includes(g.id)}
                        onChange={() => toggleSelect(g.id)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                        {g.guia_air || g.no_caja || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{g.cliente || '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{g.mawb || '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={g.tipo || 'N/A'}
                        size="small"
                        color={tipoColor(g.tipo)}
                        variant="filled"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">{g.peso_kg ? `${Number(g.peso_kg).toFixed(1)}` : '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {g.largo && g.ancho && g.alto ? `${g.largo}×${g.ancho}×${g.alto}` : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">{g.vuelo || g.guia_vuelo || '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={g.observaciones || ''}>
                        <Typography variant="body2" sx={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {g.observaciones || '—'}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const cfg = statusChipConfig[g.status] || { label: g.status, color: 'default' as const };
                        return <Chip label={cfg.label} size="small" color={cfg.color} variant="filled" />;
                      })()}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">{formatDate(g.created_at)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Ver / Editar">
                          <IconButton size="small" onClick={() => openDetail(g)} sx={{ color: CAJO_COLOR }}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Eliminar">
                          <IconButton size="small" color="error" onClick={() => handleDelete(g.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
            rowsPerPageOptions={[25, 50, 100]}
            labelRowsPerPage="Filas:"
          />
        </>
      )}

      {/* ====== DETAIL / EDIT DIALOG ====== */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ bgcolor: CAJO_COLOR, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <EditIcon />
          Detalle Guía CAJO
        </DialogTitle>
        <DialogContent dividers>
          {editGuide && (
            <Box sx={{ pt: 1 }}>
              {/* Read-only info */}
              <Paper sx={{ p: 2, mb: 2, bgcolor: '#FAFAFA', borderRadius: 2 }}>
                <Grid container spacing={1}>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" color="text.secondary">Guía AIR</Typography>
                    <Typography variant="body2" fontWeight={700} sx={{ fontFamily: 'monospace' }}>{editGuide.guia_air || '—'}</Typography>
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" color="text.secondary">Cliente</Typography>
                    <Typography variant="body2" fontWeight={700}>{editGuide.cliente || '—'}</Typography>
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" color="text.secondary">MAWB</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{editGuide.mawb || '—'}</Typography>
                  </Grid>
                  <Grid size={{ xs: 3 }}>
                    <Typography variant="caption" color="text.secondary">Peso</Typography>
                    <Typography variant="body2">{editGuide.peso_kg ? `${Number(editGuide.peso_kg).toFixed(1)} kg` : '—'}</Typography>
                  </Grid>
                  <Grid size={{ xs: 3 }}>
                    <Typography variant="caption" color="text.secondary">Volumen</Typography>
                    <Typography variant="body2">{editGuide.volumen ? Number(editGuide.volumen).toFixed(2) : '—'}</Typography>
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" color="text.secondary">Dimensiones</Typography>
                    <Typography variant="body2">
                      {editGuide.largo && editGuide.ancho && editGuide.alto
                        ? `${editGuide.largo} × ${editGuide.ancho} × ${editGuide.alto} cm`
                        : '—'}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" color="text.secondary">Vuelo</Typography>
                    <Typography variant="body2">{editGuide.vuelo || editGuide.guia_vuelo || '—'}</Typography>
                  </Grid>
                </Grid>
              </Paper>

              <Divider sx={{ my: 2 }} />

              {/* Editable fields */}
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Editar</Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Estado</InputLabel>
                    <Select
                      value={editForm.status}
                      label="Estado"
                      onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                    >
                      {STATUS_OPTIONS.filter(s => s.value !== 'all').map(s => (
                        <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Tipo</InputLabel>
                    <Select
                      value={editForm.tipo}
                      label="Tipo"
                      onChange={e => setEditForm({ ...editForm, tipo: e.target.value })}
                    >
                      <MenuItem value="Generico">Genérico</MenuItem>
                      <MenuItem value="Logo">Logo</MenuItem>
                      <MenuItem value="Medical">Medical</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    fullWidth size="small" label="Paquetería"
                    value={editForm.paqueteria}
                    onChange={e => setEditForm({ ...editForm, paqueteria: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth size="small" label="Guía de entrega"
                    value={editForm.guia_entrega}
                    onChange={e => setEditForm({ ...editForm, guia_entrega: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth size="small" label="Observaciones"
                    value={editForm.observaciones}
                    onChange={e => setEditForm({ ...editForm, observaciones: e.target.value })}
                    multiline rows={2}
                  />
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDetailOpen(false)} sx={{ textTransform: 'none' }}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={saveEdit}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <CheckCircleIcon />}
            sx={{ bgcolor: CAJO_COLOR, '&:hover': { bgcolor: '#E65100' }, textTransform: 'none', fontWeight: 600 }}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* ====== BATCH STATUS DIALOG ====== */}
      <Dialog open={batchOpen} onClose={() => setBatchOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ bgcolor: CAJO_COLOR, color: 'white' }}>
          Cambiar Estado en Lote ({selected.length} guías)
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>Nuevo Estado</InputLabel>
            <Select
              value={batchStatus}
              label="Nuevo Estado"
              onChange={e => setBatchStatus(e.target.value)}
            >
              {STATUS_OPTIONS.filter(s => s.value !== 'all').map(s => (
                <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBatchOpen(false)} sx={{ textTransform: 'none' }}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleBatchStatus}
            sx={{ bgcolor: CAJO_COLOR, '&:hover': { bgcolor: '#E65100' }, textTransform: 'none' }}
          >
            Aplicar
          </Button>
        </DialogActions>
      </Dialog>

      {/* ====== OVERFEE CONFIG DIALOG ====== */}
      <Dialog open={overfeeOpen} onClose={() => setOverfeeOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ bgcolor: CAJO_COLOR, color: 'white' }}>
          ⚙️ Configurar Overfee CAJO
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            Este valor se agregará como fee adicional por cada kilogramo en las guías CAJO.
          </Alert>
          <TextField
            fullWidth
            label="Overfee por KG (MXN)"
            type="number"
            value={overfeeValue}
            onChange={e => setOverfeeValue(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
              endAdornment: <InputAdornment position="end">MXN/kg</InputAdornment>,
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOverfeeOpen(false)} sx={{ textTransform: 'none' }}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={saveOverfee}
            disabled={savingOverfee}
            startIcon={savingOverfee ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ bgcolor: CAJO_COLOR, '&:hover': { bgcolor: '#E65100' }, textTransform: 'none' }}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snackbar.severity} variant="filled" sx={{ borderRadius: 2 }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CajoManagementPage;
