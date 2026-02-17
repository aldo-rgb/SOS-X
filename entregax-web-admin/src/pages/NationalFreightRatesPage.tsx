// ============================================
// PANEL DE TARIFAS DE FLETE NACIONAL 🚛
// Gestión de tarifas terrestres Manzanillo -> México
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  Chip,
  InputAdornment,
  Switch,
  CircularProgress,
  Card,
  CardContent,
  Grid,
  Tooltip,
} from '@mui/material';
import {
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Place as PlaceIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Colores del tema
const NATIONAL_COLOR = '#8E24AA'; // Morado para nacional

interface FreightRate {
  id: number;
  origin: string;
  destination_city: string;
  destination_state: string | null;
  km_distance: number | null;
  price_sencillo: string;
  price_full: string;
  currency: string;
  is_active: boolean;
  notes: string | null;
  updated_at: string;
}

export default function NationalFreightRatesPage() {
  const token = localStorage.getItem('token');

  const [rates, setRates] = useState<FreightRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<FreightRate>>({});
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [searchTerm, setSearchTerm] = useState('');

  // Diálogo para nueva tarifa
  const [newDialog, setNewDialog] = useState(false);
  const [newRate, setNewRate] = useState({
    destination_city: '',
    destination_state: '',
    km_distance: '',
    price_sencillo: '',
    price_full: '',
    notes: '',
  });

  // Cargar datos
  const fetchRates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/api/admin/national-freight-rates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRates(res.data);
    } catch (error) {
      console.error('Error fetching rates:', error);
      setSnackbar({ open: true, message: 'Error al cargar tarifas', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  // Iniciar edición
  const startEdit = (rate: FreightRate) => {
    setEditingId(rate.id);
    setEditValues({
      price_sencillo: rate.price_sencillo,
      price_full: rate.price_full,
      is_active: rate.is_active,
      notes: rate.notes,
    });
  };

  // Cancelar edición
  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  // Guardar edición
  const saveEdit = async (id: number) => {
    try {
      setSaving(true);
      await axios.put(
        `${API_URL}/api/admin/national-freight-rates/${id}`,
        editValues,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSnackbar({ open: true, message: '✅ Tarifa actualizada', severity: 'success' });
      setEditingId(null);
      setEditValues({});
      fetchRates();
    } catch (error) {
      console.error('Error saving rate:', error);
      setSnackbar({ open: true, message: 'Error al guardar', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Crear nueva tarifa
  const handleCreateRate = async () => {
    if (!newRate.destination_city || !newRate.price_sencillo || !newRate.price_full) {
      setSnackbar({ open: true, message: 'Completa destino y precios', severity: 'error' });
      return;
    }

    try {
      setSaving(true);
      await axios.post(
        `${API_URL}/api/admin/national-freight-rates`,
        {
          ...newRate,
          km_distance: newRate.km_distance ? parseInt(newRate.km_distance) : null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSnackbar({ open: true, message: '✅ Tarifa creada', severity: 'success' });
      setNewDialog(false);
      setNewRate({ destination_city: '', destination_state: '', km_distance: '', price_sencillo: '', price_full: '', notes: '' });
      fetchRates();
    } catch (error) {
      console.error('Error creating rate:', error);
      setSnackbar({ open: true, message: 'Error al crear tarifa', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Eliminar tarifa
  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Eliminar esta tarifa?')) return;

    try {
      await axios.delete(
        `${API_URL}/api/admin/national-freight-rates/${id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSnackbar({ open: true, message: 'Tarifa eliminada', severity: 'success' });
      fetchRates();
    } catch (error) {
      console.error('Error deleting rate:', error);
      setSnackbar({ open: true, message: 'Error al eliminar', severity: 'error' });
    }
  };

  // Filtrar por búsqueda
  const filteredRates = rates.filter(r => 
    r.destination_city.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.destination_state?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Calcular estadísticas
  const stats = {
    total: rates.length,
    active: rates.filter(r => r.is_active).length,
    avgSencillo: rates.length > 0 
      ? rates.reduce((sum, r) => sum + parseFloat(r.price_sencillo), 0) / rates.length 
      : 0,
    avgFull: rates.length > 0 
      ? rates.reduce((sum, r) => sum + parseFloat(r.price_full), 0) / rates.length 
      : 0,
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold">
            🚛 Tarifas de Flete Nacional
          </Typography>
          <Typography color="text.secondary">
            Origen: Puerto de Manzanillo, Colima
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setNewDialog(true)}
          sx={{ bgcolor: NATIONAL_COLOR, '&:hover': { bgcolor: '#6A1B9A' } }}
        >
          Nueva Tarifa
        </Button>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card sx={{ bgcolor: '#f3e5f5' }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Total Destinos</Typography>
              <Typography variant="h4" fontWeight="bold" color={NATIONAL_COLOR}>
                {stats.total}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card sx={{ bgcolor: '#e8f5e9' }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Activas</Typography>
              <Typography variant="h4" fontWeight="bold" color="success.main">
                {stats.active}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Promedio Sencillo</Typography>
              <Typography variant="h5" fontWeight="bold">
                ${stats.avgSencillo.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Promedio Full</Typography>
              <Typography variant="h5" fontWeight="bold">
                ${stats.avgFull.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Search */}
      <TextField
        fullWidth
        placeholder="Buscar por ciudad o estado..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        sx={{ mb: 2 }}
        InputProps={{
          startAdornment: <InputAdornment position="start"><PlaceIcon /></InputAdornment>
        }}
      />

      {/* Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead sx={{ bgcolor: '#111' }}>
            <TableRow>
              <TableCell sx={{ color: 'white' }}>Destino</TableCell>
              <TableCell sx={{ color: 'white' }} align="center">KM</TableCell>
              <TableCell sx={{ color: 'white' }} align="right">Sencillo (MXN)</TableCell>
              <TableCell sx={{ color: 'white' }} align="right">Full (MXN)</TableCell>
              <TableCell sx={{ color: 'white' }} align="center">Activo</TableCell>
              <TableCell sx={{ color: 'white' }}>Notas</TableCell>
              <TableCell sx={{ color: 'white' }} align="center">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredRates.map((rate) => (
              <TableRow key={rate.id} hover>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PlaceIcon sx={{ color: NATIONAL_COLOR, fontSize: 20 }} />
                    <Box>
                      <Typography fontWeight="bold">{rate.destination_city}</Typography>
                      {rate.destination_state && (
                        <Typography variant="caption" color="text.secondary">
                          {rate.destination_state}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </TableCell>
                <TableCell align="center">
                  {rate.km_distance ? (
                    <Chip label={`${rate.km_distance} km`} size="small" variant="outlined" />
                  ) : '-'}
                </TableCell>
                <TableCell align="right">
                  {editingId === rate.id ? (
                    <TextField
                      size="small"
                      type="number"
                      value={editValues.price_sencillo}
                      onChange={(e) => setEditValues({ ...editValues, price_sencillo: e.target.value })}
                      sx={{ width: 130 }}
                      InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                    />
                  ) : (
                    <Typography fontWeight="bold" color={NATIONAL_COLOR}>
                      ${parseFloat(rate.price_sencillo).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  {editingId === rate.id ? (
                    <TextField
                      size="small"
                      type="number"
                      value={editValues.price_full}
                      onChange={(e) => setEditValues({ ...editValues, price_full: e.target.value })}
                      sx={{ width: 130 }}
                      InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                    />
                  ) : (
                    <Typography fontWeight="bold">
                      ${parseFloat(rate.price_full).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="center">
                  {editingId === rate.id ? (
                    <Switch
                      checked={editValues.is_active}
                      onChange={(e) => setEditValues({ ...editValues, is_active: e.target.checked })}
                      color="success"
                    />
                  ) : (
                    <Switch checked={rate.is_active} disabled color="success" />
                  )}
                </TableCell>
                <TableCell>
                  {editingId === rate.id ? (
                    <TextField
                      size="small"
                      value={editValues.notes || ''}
                      onChange={(e) => setEditValues({ ...editValues, notes: e.target.value })}
                      placeholder="Notas..."
                      sx={{ width: 150 }}
                    />
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {rate.notes || '-'}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="center">
                  {editingId === rate.id ? (
                    <>
                      <IconButton color="success" onClick={() => saveEdit(rate.id)} disabled={saving}>
                        <SaveIcon />
                      </IconButton>
                      <IconButton color="error" onClick={cancelEdit}>
                        <CancelIcon />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <Tooltip title="Editar">
                        <IconButton color="primary" onClick={() => startEdit(rate)}>
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Eliminar">
                        <IconButton color="error" onClick={() => handleDelete(rate.id)}>
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* New Rate Dialog */}
      <Dialog open={newDialog} onClose={() => setNewDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: NATIONAL_COLOR, color: 'white' }}>
          🚛 Nueva Tarifa de Flete
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              fullWidth
              label="Ciudad Destino *"
              value={newRate.destination_city}
              onChange={(e) => setNewRate({ ...newRate, destination_city: e.target.value })}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                sx={{ flex: 2 }}
                label="Estado"
                value={newRate.destination_state}
                onChange={(e) => setNewRate({ ...newRate, destination_state: e.target.value })}
              />
              <TextField
                sx={{ flex: 1 }}
                label="KM"
                type="number"
                value={newRate.km_distance}
                onChange={(e) => setNewRate({ ...newRate, km_distance: e.target.value })}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                label="Precio Sencillo (MXN) *"
                type="number"
                value={newRate.price_sencillo}
                onChange={(e) => setNewRate({ ...newRate, price_sencillo: e.target.value })}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              />
              <TextField
                fullWidth
                label="Precio Full (MXN) *"
                type="number"
                value={newRate.price_full}
                onChange={(e) => setNewRate({ ...newRate, price_full: e.target.value })}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              />
            </Box>
            <TextField
              fullWidth
              label="Notas"
              multiline
              rows={2}
              value={newRate.notes}
              onChange={(e) => setNewRate({ ...newRate, notes: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewDialog(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleCreateRate}
            disabled={saving}
            sx={{ bgcolor: NATIONAL_COLOR }}
          >
            {saving ? <CircularProgress size={20} /> : 'Crear Tarifa'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
