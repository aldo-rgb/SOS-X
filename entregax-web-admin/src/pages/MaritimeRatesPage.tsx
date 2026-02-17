// ============================================
// PANEL DE TARIFAS MARÍTIMAS
// Configuración de costos por CBM para envíos marítimos
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Alert,
  Snackbar,
  Chip,
  InputAdornment,
  Tooltip,
  Switch,
  FormControlLabel,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  LocalShipping as ShippingIcon,
  Calculate as CalculateIcon,
  CheckCircle as CheckCircleIcon,
  AttachMoney as MoneyIcon,
  Inventory as InventoryIcon,
  Scale as ScaleIcon,
} from '@mui/icons-material';
import Grid from '@mui/material/Grid2';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Colores del tema marítimo
const SEA_COLOR = '#00BCD4';
const SEA_DARK = '#0097A7';

interface MaritimeRate {
  id: number;
  rate_name: string;
  cost_per_cbm: number;
  cost_per_kg: number;
  min_cbm: number;
  min_charge: number;
  applies_to: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface CostCalculation {
  volume: number;
  weight: number;
  costPerCbm: number;
  costPerKg: number;
  costByCbm: number;
  costByWeight: number;
  minCharge: number;
  estimatedCost: number;
  currency: string;
  rateName: string;
}

export default function MaritimeRatesPage() {
  const { t } = useTranslation();
  const [rates, setRates] = useState<MaritimeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<MaritimeRate | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Calculadora
  const [calcVolume, setCalcVolume] = useState('');
  const [calcWeight, setCalcWeight] = useState('');
  const [calcResult, setCalcResult] = useState<CostCalculation | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Form state
  const [form, setForm] = useState({
    rate_name: '',
    cost_per_cbm: '',
    cost_per_kg: '',
    min_cbm: '',
    min_charge: '',
    applies_to: 'all',
    is_active: true,
    notes: ''
  });

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  };

  const fetchRates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/maritime/rates`, {
        headers: getAuthHeaders()
      });
      setRates(response.data);
    } catch (error) {
      console.error('Error fetching rates:', error);
      setSnackbar({ open: true, message: 'Error al cargar tarifas', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  const handleOpenDialog = (rate?: MaritimeRate) => {
    if (rate) {
      setEditingRate(rate);
      setForm({
        rate_name: rate.rate_name,
        cost_per_cbm: rate.cost_per_cbm.toString(),
        cost_per_kg: rate.cost_per_kg.toString(),
        min_cbm: rate.min_cbm.toString(),
        min_charge: rate.min_charge.toString(),
        applies_to: rate.applies_to,
        is_active: rate.is_active,
        notes: rate.notes || ''
      });
    } else {
      setEditingRate(null);
      setForm({
        rate_name: '',
        cost_per_cbm: '',
        cost_per_kg: '0',
        min_cbm: '0.1',
        min_charge: '',
        applies_to: 'all',
        is_active: true,
        notes: ''
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const payload = {
        rateName: form.rate_name,
        costPerCbm: parseFloat(form.cost_per_cbm),
        costPerKg: parseFloat(form.cost_per_kg) || 0,
        minCbm: parseFloat(form.min_cbm) || 0,
        minCharge: parseFloat(form.min_charge) || 0,
        appliesTo: form.applies_to,
        isActive: form.is_active,
        notes: form.notes || null
      };

      if (editingRate) {
        await axios.put(`${API_URL}/api/maritime/rates/${editingRate.id}`, payload, {
          headers: getAuthHeaders()
        });
        setSnackbar({ open: true, message: 'Tarifa actualizada', severity: 'success' });
      } else {
        await axios.post(`${API_URL}/api/maritime/rates`, payload, {
          headers: getAuthHeaders()
        });
        setSnackbar({ open: true, message: 'Tarifa creada', severity: 'success' });
      }
      
      setDialogOpen(false);
      fetchRates();
    } catch (error: any) {
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.error || 'Error al guardar', 
        severity: 'error' 
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta tarifa?')) return;
    
    try {
      await axios.delete(`${API_URL}/api/maritime/rates/${id}`, {
        headers: getAuthHeaders()
      });
      setSnackbar({ open: true, message: 'Tarifa eliminada', severity: 'success' });
      fetchRates();
    } catch (error) {
      setSnackbar({ open: true, message: 'Error al eliminar', severity: 'error' });
    }
  };

  const handleCalculate = async () => {
    if (!calcVolume && !calcWeight) {
      setSnackbar({ open: true, message: 'Ingresa volumen o peso', severity: 'error' });
      return;
    }

    try {
      setCalculating(true);
      const response = await axios.post(`${API_URL}/api/maritime/calculate-cost`, {
        volume: parseFloat(calcVolume) || 0,
        weight: parseFloat(calcWeight) || 0
      }, { headers: getAuthHeaders() });
      
      setCalcResult(response.data);
    } catch (error: any) {
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.error || 'Error al calcular', 
        severity: 'error' 
      });
    } finally {
      setCalculating(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(value);
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
            <MoneyIcon sx={{ color: SEA_COLOR, fontSize: 35 }} />
            Tarifas Marítimas
          </Typography>
          <Typography color="text.secondary">
            Configuración de costos por CBM para envíos marítimos China-México
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          sx={{ bgcolor: SEA_COLOR, '&:hover': { bgcolor: SEA_DARK } }}
        >
          Nueva Tarifa
        </Button>
      </Box>

      <Grid container spacing={3}>
        {/* Tabla de Tarifas */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <InventoryIcon sx={{ color: SEA_COLOR }} />
                Tarifas Configuradas
              </Typography>

              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell><strong>Nombre</strong></TableCell>
                      <TableCell align="right"><strong>$/CBM</strong></TableCell>
                      <TableCell align="right"><strong>$/KG</strong></TableCell>
                      <TableCell align="right"><strong>Mínimo</strong></TableCell>
                      <TableCell align="center"><strong>Estado</strong></TableCell>
                      <TableCell align="center"><strong>Acciones</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rates.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                          <Typography color="text.secondary">
                            No hay tarifas configuradas
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      rates.map((rate) => (
                        <TableRow key={rate.id} hover>
                          <TableCell>
                            <Typography fontWeight={500}>{rate.rate_name}</Typography>
                            {rate.notes && (
                              <Typography variant="caption" color="text.secondary">
                                {rate.notes}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <Typography fontWeight="bold" color="primary">
                              {formatCurrency(rate.cost_per_cbm)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {rate.cost_per_kg > 0 ? formatCurrency(rate.cost_per_kg) : '-'}
                          </TableCell>
                          <TableCell align="right">
                            <Box>
                              <Typography variant="body2">
                                CBM mín: {rate.min_cbm} m³
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Cargo mín: {formatCurrency(rate.min_charge)}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={rate.is_active ? 'Activa' : 'Inactiva'}
                              color={rate.is_active ? 'success' : 'default'}
                              size="small"
                              icon={rate.is_active ? <CheckCircleIcon /> : undefined}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title="Editar">
                              <IconButton size="small" onClick={() => handleOpenDialog(rate)}>
                                <EditIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Eliminar">
                              <IconButton size="small" color="error" onClick={() => handleDelete(rate.id)}>
                                <DeleteIcon />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Calculadora de Costos */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ bgcolor: '#f8f9fa' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <CalculateIcon sx={{ color: SEA_COLOR }} />
                Calculadora de Costos
              </Typography>

              <Alert severity="info" sx={{ mb: 2 }}>
                Calcula el costo estimado de un embarque basado en la tarifa activa
              </Alert>

              <Grid container spacing={2}>
                <Grid size={6}>
                  <TextField
                    label="Volumen (CBM)"
                    value={calcVolume}
                    onChange={(e) => setCalcVolume(e.target.value)}
                    fullWidth
                    type="number"
                    InputProps={{
                      endAdornment: <InputAdornment position="end">m³</InputAdornment>,
                      startAdornment: <InputAdornment position="start">📦</InputAdornment>
                    }}
                  />
                </Grid>
                <Grid size={6}>
                  <TextField
                    label="Peso (KG)"
                    value={calcWeight}
                    onChange={(e) => setCalcWeight(e.target.value)}
                    fullWidth
                    type="number"
                    InputProps={{
                      endAdornment: <InputAdornment position="end">kg</InputAdornment>,
                      startAdornment: <InputAdornment position="start">⚖️</InputAdornment>
                    }}
                  />
                </Grid>
                <Grid size={12}>
                  <Button
                    variant="contained"
                    fullWidth
                    onClick={handleCalculate}
                    disabled={calculating}
                    startIcon={<CalculateIcon />}
                    sx={{ bgcolor: SEA_COLOR, '&:hover': { bgcolor: SEA_DARK } }}
                  >
                    {calculating ? 'Calculando...' : 'Calcular Costo'}
                  </Button>
                </Grid>
              </Grid>

              {calcResult && (
                <Box sx={{ mt: 3 }}>
                  <Divider sx={{ mb: 2 }} />
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Resultado - {calcResult.rateName}
                  </Typography>
                  
                  <Paper sx={{ p: 2, bgcolor: 'white' }}>
                    <Grid container spacing={1}>
                      <Grid size={6}>
                        <Typography variant="caption" color="text.secondary">Costo por CBM:</Typography>
                        <Typography>{formatCurrency(calcResult.costByCbm)}</Typography>
                      </Grid>
                      <Grid size={6}>
                        <Typography variant="caption" color="text.secondary">Costo por Peso:</Typography>
                        <Typography>{formatCurrency(calcResult.costByWeight)}</Typography>
                      </Grid>
                      <Grid size={12}>
                        <Divider sx={{ my: 1 }} />
                      </Grid>
                      <Grid size={12}>
                        <Box sx={{ 
                          bgcolor: SEA_COLOR + '20', 
                          p: 2, 
                          borderRadius: 2,
                          textAlign: 'center'
                        }}>
                          <Typography variant="caption" color="text.secondary">
                            COSTO ESTIMADO
                          </Typography>
                          <Typography variant="h4" sx={{ fontWeight: 'bold', color: SEA_DARK }}>
                            {formatCurrency(calcResult.estimatedCost)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {calcResult.volume} m³ × ${calcResult.costPerCbm}/CBM
                          </Typography>
                        </Box>
                      </Grid>
                    </Grid>
                  </Paper>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                💡 Cómo funciona el cálculo
              </Typography>
              <Typography variant="body2" paragraph>
                1. Se calcula el costo por <strong>volumen (CBM)</strong>
              </Typography>
              <Typography variant="body2" paragraph>
                2. Se calcula el costo por <strong>peso (KG)</strong> si aplica
              </Typography>
              <Typography variant="body2" paragraph>
                3. Se toma el <strong>mayor</strong> de ambos valores
              </Typography>
              <Typography variant="body2">
                4. Se aplica el <strong>cargo mínimo</strong> si el costo es menor
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Dialog para crear/editar tarifa */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingRate ? 'Editar Tarifa' : 'Nueva Tarifa'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={12}>
              <TextField
                label="Nombre de la Tarifa"
                value={form.rate_name}
                onChange={(e) => setForm({ ...form, rate_name: e.target.value })}
                fullWidth
                required
                placeholder="Ej: Tarifa Estándar China-México"
              />
            </Grid>
            <Grid size={6}>
              <TextField
                label="Costo por CBM"
                value={form.cost_per_cbm}
                onChange={(e) => setForm({ ...form, cost_per_cbm: e.target.value })}
                fullWidth
                required
                type="number"
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  endAdornment: <InputAdornment position="end">/m³</InputAdornment>
                }}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                label="Costo por KG (opcional)"
                value={form.cost_per_kg}
                onChange={(e) => setForm({ ...form, cost_per_kg: e.target.value })}
                fullWidth
                type="number"
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  endAdornment: <InputAdornment position="end">/kg</InputAdornment>
                }}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                label="CBM Mínimo"
                value={form.min_cbm}
                onChange={(e) => setForm({ ...form, min_cbm: e.target.value })}
                fullWidth
                type="number"
                helperText="Volumen mínimo facturable"
                InputProps={{
                  endAdornment: <InputAdornment position="end">m³</InputAdornment>
                }}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                label="Cargo Mínimo"
                value={form.min_charge}
                onChange={(e) => setForm({ ...form, min_charge: e.target.value })}
                fullWidth
                type="number"
                helperText="Monto mínimo a cobrar"
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>
                }}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                label="Notas"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                fullWidth
                multiline
                rows={2}
                placeholder="Notas adicionales sobre esta tarifa..."
              />
            </Grid>
            <Grid size={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    color="primary"
                  />
                }
                label="Tarifa Activa"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleSave}
            startIcon={<SaveIcon />}
            sx={{ bgcolor: SEA_COLOR, '&:hover': { bgcolor: SEA_DARK } }}
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
      >
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
