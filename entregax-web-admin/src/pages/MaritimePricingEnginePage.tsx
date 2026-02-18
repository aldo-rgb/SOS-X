// ============================================
// MOTOR DE TARIFAS MARÍTIMAS - PANEL COMPLETO
// Sistema de precios por categoría, rangos y VIP
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Calculate as CalculateIcon,
  CheckCircle as CheckCircleIcon,
  AttachMoney as MoneyIcon,
  ExpandMore as ExpandMoreIcon,
  Category as CategoryIcon,
  TrendingUp as TrendingUpIcon,
  Star as StarIcon,
  LocalShipping as ShippingIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Colores del tema marítimo
const SEA_COLOR = '#0097A7';
const SEA_DARK = '#006064';
const ORANGE = '#F05A28';

interface PricingCategory {
  id: number;
  name: string;
  surcharge_per_cbm: string;
  description: string | null;
  is_active: boolean;
  tier_count: number;
}

interface PricingTier {
  id: number;
  category_id: number;
  category_name: string;
  min_cbm: string;
  max_cbm: string;
  price: string;
  is_flat_fee: boolean;
  notes: string | null;
  is_active: boolean;
}

interface CalculationResult {
  physicalCbm: string;
  volumetricCbm: string;
  chargeableCbm: string;
  originalCategory: string;
  appliedCategory: string;
  appliedRate: string;
  surchargeApplied: number;
  isVipApplied: boolean;
  isFlatFee: boolean;
  finalPriceUsd: string;
  breakdown: string;
}

export default function MaritimePricingEnginePage() {
  const { t } = useTranslation();
  const token = localStorage.getItem('token');

  // Estado
  const [activeTab, setActiveTab] = useState(0);
  const [categories, setCategories] = useState<PricingCategory[]>([]);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Diálogo para nueva tarifa
  const [newTierDialog, setNewTierDialog] = useState(false);
  const [newTier, setNewTier] = useState({
    category_id: 0,
    min_cbm: '',
    max_cbm: '',
    price: '',
    is_flat_fee: false,
    notes: '',
  });

  // Diálogo para nueva/editar categoría
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<PricingCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    surcharge_per_cbm: '0',
    description: '',
  });

  // Calculadora
  const [calcForm, setCalcForm] = useState({
    lengthCm: '',
    widthCm: '',
    heightCm: '',
    weightKg: '',
    category: 'Generico',
    userId: '0',
  });
  const [calcResult, setCalcResult] = useState<CalculationResult | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Cargar datos
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [catRes, tierRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/pricing-categories`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_URL}/api/admin/pricing-tiers`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
      ]);
      setCategories(catRes.data);
      setTiers(tierRes.data);
    } catch (error) {
      console.error('Error fetching pricing data:', error);
      setSnackbar({ open: true, message: 'Error al cargar datos', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Guardar cambios en tarifas
  const handleSaveTiers = async () => {
    try {
      setSaving(true);
      await axios.put(
        `${API_URL}/api/admin/pricing-tiers`,
        { tiers },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSnackbar({ open: true, message: '✅ Tarifas guardadas correctamente', severity: 'success' });
    } catch (error) {
      console.error('Error saving tiers:', error);
      setSnackbar({ open: true, message: 'Error al guardar tarifas', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Actualizar precio en la tabla local
  const handlePriceChange = (tierId: number, field: string, value: string | boolean) => {
    setTiers(tiers.map(t => 
      t.id === tierId ? { ...t, [field]: value } : t
    ));
  };

  // Crear nueva tarifa
  const handleCreateTier = async () => {
    if (!newTier.category_id || !newTier.min_cbm || !newTier.max_cbm || !newTier.price) {
      setSnackbar({ open: true, message: 'Completa todos los campos requeridos', severity: 'error' });
      return;
    }

    try {
      await axios.post(
        `${API_URL}/api/admin/pricing-tiers`,
        newTier,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSnackbar({ open: true, message: '✅ Tarifa creada', severity: 'success' });
      setNewTierDialog(false);
      setNewTier({ category_id: 0, min_cbm: '', max_cbm: '', price: '', is_flat_fee: false, notes: '' });
      fetchData();
    } catch (error) {
      console.error('Error creating tier:', error);
      setSnackbar({ open: true, message: 'Error al crear tarifa', severity: 'error' });
    }
  };

  // Eliminar tarifa
  const handleDeleteTier = async (tierId: number) => {
    if (!window.confirm('¿Eliminar esta tarifa?')) return;

    try {
      await axios.delete(
        `${API_URL}/api/admin/pricing-tiers/${tierId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSnackbar({ open: true, message: 'Tarifa eliminada', severity: 'success' });
      fetchData();
    } catch (error) {
      console.error('Error deleting tier:', error);
      setSnackbar({ open: true, message: 'Error al eliminar', severity: 'error' });
    }
  };

  // Abrir diálogo para nueva categoría
  const handleNewCategory = () => {
    setEditingCategory(null);
    setCategoryForm({ name: '', surcharge_per_cbm: '0', description: '' });
    setCategoryDialog(true);
  };

  // Abrir diálogo para editar categoría
  const handleEditCategory = (category: PricingCategory) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      surcharge_per_cbm: category.surcharge_per_cbm,
      description: category.description || '',
    });
    setCategoryDialog(true);
  };

  // Crear o actualizar categoría
  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) {
      setSnackbar({ open: true, message: 'El nombre es requerido', severity: 'error' });
      return;
    }

    try {
      setSaving(true);
      if (editingCategory) {
        // Actualizar
        await axios.put(
          `${API_URL}/api/admin/pricing-categories/${editingCategory.id}`,
          categoryForm,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setSnackbar({ open: true, message: '✅ Categoría actualizada', severity: 'success' });
      } else {
        // Crear nueva
        await axios.post(
          `${API_URL}/api/admin/pricing-categories`,
          categoryForm,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setSnackbar({ open: true, message: '✅ Categoría creada', severity: 'success' });
      }
      setCategoryDialog(false);
      fetchData();
    } catch (error: any) {
      console.error('Error saving category:', error);
      const msg = error.response?.data?.error || 'Error al guardar categoría';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Toggle activo/inactivo de categoría
  const handleToggleCategoryActive = async (category: PricingCategory) => {
    try {
      await axios.put(
        `${API_URL}/api/admin/pricing-categories/${category.id}`,
        { is_active: !category.is_active },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSnackbar({ 
        open: true, 
        message: category.is_active ? 'Categoría desactivada' : 'Categoría activada', 
        severity: 'success' 
      });
      fetchData();
    } catch (error) {
      console.error('Error toggling category:', error);
      setSnackbar({ open: true, message: 'Error al cambiar estado', severity: 'error' });
    }
  };

  // Calcular costo
  const handleCalculate = async () => {
    if (!calcForm.lengthCm || !calcForm.widthCm || !calcForm.heightCm || !calcForm.weightKg) {
      setSnackbar({ open: true, message: 'Completa las dimensiones y peso', severity: 'error' });
      return;
    }

    try {
      setCalculating(true);
      const response = await axios.post(`${API_URL}/api/maritime/calculate`, calcForm);
      setCalcResult(response.data);
    } catch (error: any) {
      console.error('Error calculating:', error);
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.error || 'Error al calcular', 
        severity: 'error' 
      });
    } finally {
      setCalculating(false);
    }
  };

  // Agrupar tiers por categoría
  const tiersByCategory = categories.map(cat => ({
    ...cat,
    tiers: tiers.filter(t => t.category_id === cat.id)
  }));

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress sx={{ color: SEA_COLOR }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MoneyIcon sx={{ color: SEA_COLOR, fontSize: 35 }} />
            Motor de Tarifas Marítimas
          </Typography>
          <Typography color="text.secondary">
            Configuración de precios por CBM, categorías y clientes VIP
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSaveTiers}
          disabled={saving}
          sx={{ bgcolor: SEA_COLOR, '&:hover': { bgcolor: SEA_DARK } }}
        >
          {saving ? 'Guardando...' : 'Guardar Todo'}
        </Button>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs 
          value={activeTab} 
          onChange={(_, v) => setActiveTab(v)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="📊 Tarifas por Categoría" />
          <Tab label="🧮 Calculadora de Costos" />
          <Tab label="⚙️ Categorías" />
        </Tabs>
      </Paper>

      {/* Tab 0: Tarifas */}
      {activeTab === 0 && (
        <Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            💡 Modifica los precios directamente en la tabla y luego guarda todos los cambios.
          </Alert>

          {tiersByCategory.map(category => (
            <Accordion key={category.id} defaultExpanded={false}>
              <AccordionSummary 
                expandIcon={<ExpandMoreIcon />}
                sx={{ 
                  bgcolor: category.name === 'StartUp' ? '#FFF3E0' : 
                           category.name === 'Sensible' ? '#E3F2FD' :
                           category.name === 'Logotipo' ? '#FBE9E7' : 
                           category.name === 'FCL 40 Pies' ? '#E1F5FE' : '#E8F5E9'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <CategoryIcon sx={{ color: SEA_COLOR }} />
                  <Typography fontWeight="bold">{category.name}</Typography>
                  <Chip 
                    label={`${category.tiers.length} tarifas`} 
                    size="small" 
                    color="primary" 
                    variant="outlined"
                  />
                  {parseFloat(category.surcharge_per_cbm) > 0 && (
                    <Chip 
                      label={`+$${category.surcharge_per_cbm}/CBM`} 
                      size="small" 
                      color="warning"
                    />
                  )}
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                        <TableCell><strong>Rango Min (CBM)</strong></TableCell>
                        <TableCell><strong>Rango Max (CBM)</strong></TableCell>
                        <TableCell><strong>Precio (USD)</strong></TableCell>
                        <TableCell><strong>Tipo</strong></TableCell>
                        <TableCell><strong>Notas</strong></TableCell>
                        <TableCell align="center"><strong>Activo</strong></TableCell>
                        <TableCell align="center"><strong>Acciones</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {category.tiers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                            Sin tarifas configuradas
                          </TableCell>
                        </TableRow>
                      ) : category.tiers.map(tier => (
                        <TableRow key={tier.id} hover>
                          <TableCell>
                            <TextField
                              size="small"
                              type="number"
                              value={tier.min_cbm}
                              onChange={(e) => handlePriceChange(tier.id, 'min_cbm', e.target.value)}
                              sx={{ width: 100 }}
                              inputProps={{ step: '0.01' }}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              size="small"
                              type="number"
                              value={parseFloat(tier.max_cbm) >= 9999 ? '∞' : tier.max_cbm}
                              onChange={(e) => handlePriceChange(tier.id, 'max_cbm', e.target.value)}
                              sx={{ width: 100 }}
                              inputProps={{ step: '0.01' }}
                              disabled={parseFloat(tier.max_cbm) >= 9999}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              size="small"
                              type="number"
                              value={tier.price}
                              onChange={(e) => handlePriceChange(tier.id, 'price', e.target.value)}
                              sx={{ width: 120 }}
                              InputProps={{
                                startAdornment: <InputAdornment position="start">$</InputAdornment>,
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={tier.is_flat_fee ? '💵 Tarifa Plana' : '📦 Por CBM'}
                              size="small"
                              color={tier.is_flat_fee ? 'warning' : 'info'}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              size="small"
                              value={tier.notes || ''}
                              onChange={(e) => handlePriceChange(tier.id, 'notes', e.target.value)}
                              placeholder="Notas..."
                              sx={{ width: 150 }}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Switch
                              checked={tier.is_active}
                              onChange={(e) => handlePriceChange(tier.id, 'is_active', e.target.checked)}
                              color="success"
                            />
                          </TableCell>
                          <TableCell align="center">
                            <IconButton 
                              size="small" 
                              color="error"
                              onClick={() => handleDeleteTier(tier.id)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}

      {/* Tab 1: Calculadora */}
      {activeTab === 1 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={5}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CalculateIcon sx={{ color: SEA_COLOR }} />
                  Calculadora de Costos
                </Typography>
                <Divider sx={{ mb: 2 }} />

                <Alert severity="info" sx={{ mb: 2 }}>
                  💡 Ingresa las dimensiones y el motor calculará automáticamente si aplica peso volumétrico (÷600) o CBM físico.
                </Alert>

                <Grid container spacing={2}>
                  <Grid item xs={4}>
                    <TextField
                      fullWidth
                      label="Largo (cm)"
                      type="number"
                      value={calcForm.lengthCm}
                      onChange={(e) => setCalcForm({ ...calcForm, lengthCm: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={4}>
                    <TextField
                      fullWidth
                      label="Ancho (cm)"
                      type="number"
                      value={calcForm.widthCm}
                      onChange={(e) => setCalcForm({ ...calcForm, widthCm: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={4}>
                    <TextField
                      fullWidth
                      label="Alto (cm)"
                      type="number"
                      value={calcForm.heightCm}
                      onChange={(e) => setCalcForm({ ...calcForm, heightCm: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      label="Peso (kg)"
                      type="number"
                      value={calcForm.weightKg}
                      onChange={(e) => setCalcForm({ ...calcForm, weightKg: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <FormControl fullWidth>
                      <InputLabel>Categoría</InputLabel>
                      <Select
                        value={calcForm.category}
                        label="Categoría"
                        onChange={(e) => setCalcForm({ ...calcForm, category: e.target.value })}
                      >
                        <MenuItem value="Generico">📦 Genérico</MenuItem>
                        <MenuItem value="Sensible">🔶 Sensible</MenuItem>
                        <MenuItem value="Logotipo">🏷️ Con Logotipo (+$100/CBM)</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="ID de Usuario (0 = público)"
                      type="number"
                      value={calcForm.userId}
                      onChange={(e) => setCalcForm({ ...calcForm, userId: e.target.value })}
                      helperText="Si el usuario es VIP, obtendrá la tarifa más baja"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={handleCalculate}
                      disabled={calculating}
                      startIcon={calculating ? <CircularProgress size={20} /> : <CalculateIcon />}
                      sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#D4491E' }, py: 1.5 }}
                    >
                      {calculating ? 'Calculando...' : 'Calcular Costo'}
                    </Button>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={7}>
            {calcResult ? (
              <Card sx={{ border: `2px solid ${SEA_COLOR}` }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom sx={{ color: SEA_COLOR }}>
                    📊 Resultado del Cálculo
                  </Typography>
                  <Divider sx={{ mb: 2 }} />

                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Paper sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                        <Typography variant="caption" color="text.secondary">CBM Físico</Typography>
                        <Typography variant="h5">{calcResult.physicalCbm} m³</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6}>
                      <Paper sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                        <Typography variant="caption" color="text.secondary">CBM Volumétrico (÷600)</Typography>
                        <Typography variant="h5">{calcResult.volumetricCbm} m³</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12}>
                      <Paper sx={{ p: 2, bgcolor: SEA_COLOR + '15', border: `1px solid ${SEA_COLOR}` }}>
                        <Typography variant="caption" color="text.secondary">CBM Cobrable (Mayor)</Typography>
                        <Typography variant="h4" fontWeight="bold" color={SEA_COLOR}>
                          {calcResult.chargeableCbm} m³
                        </Typography>
                      </Paper>
                    </Grid>

                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Categoría Original</Typography>
                      <Typography>{calcResult.originalCategory}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Categoría Aplicada</Typography>
                      <Chip label={calcResult.appliedCategory} color="primary" size="small" />
                    </Grid>

                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Tarifa Aplicada</Typography>
                      <Typography>${calcResult.appliedRate} USD {calcResult.isFlatFee ? '(Plana)' : '/CBM'}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Recargo Logotipo</Typography>
                      <Typography>${calcResult.surchargeApplied} USD/CBM</Typography>
                    </Grid>

                    {calcResult.isVipApplied && (
                      <Grid item xs={12}>
                        <Alert severity="success" icon={<StarIcon />}>
                          🌟 Tarifa VIP aplicada - El cliente obtuvo el mejor precio
                        </Alert>
                      </Grid>
                    )}

                    <Grid item xs={12}>
                      <Divider sx={{ my: 1 }} />
                      <Box sx={{ p: 2, bgcolor: ORANGE + '15', borderRadius: 2 }}>
                        <Typography variant="caption" color="text.secondary">Desglose</Typography>
                        <Typography>{calcResult.breakdown}</Typography>
                      </Box>
                    </Grid>

                    <Grid item xs={12}>
                      <Paper sx={{ p: 3, bgcolor: '#111', color: '#fff', textAlign: 'center' }}>
                        <Typography variant="caption">COSTO TOTAL ESTIMADO</Typography>
                        <Typography variant="h3" fontWeight="bold" sx={{ color: ORANGE }}>
                          ${calcResult.finalPriceUsd} USD
                        </Typography>
                      </Paper>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            ) : (
              <Card sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f9f9f9' }}>
                <Box textAlign="center" p={4}>
                  <ShippingIcon sx={{ fontSize: 80, color: '#ddd', mb: 2 }} />
                  <Typography color="text.secondary">
                    Ingresa las dimensiones y peso para calcular el costo del envío marítimo
                  </Typography>
                </Box>
              </Card>
            )}
          </Grid>
        </Grid>
      )}

      {/* Tab 2: Categorías */}
      {activeTab === 2 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Alert severity="info" sx={{ flex: 1, mr: 2 }}>
              💡 Las categorías determinan el tipo de carga y pueden tener tarifas diferentes.
            </Alert>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleNewCategory}
              sx={{ bgcolor: SEA_COLOR, '&:hover': { bgcolor: SEA_DARK } }}
            >
              Nueva Categoría
            </Button>
          </Box>

          <Grid container spacing={3}>
            {categories.map(cat => (
              <Grid item xs={12} sm={6} md={3} key={cat.id}>
                <Card sx={{ 
                  border: cat.is_active ? `2px solid ${SEA_COLOR}` : '1px solid #ddd',
                  opacity: cat.is_active ? 1 : 0.6,
                  position: 'relative'
                }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6" fontWeight="bold">{cat.name}</Typography>
                      {cat.is_active ? (
                        <Chip label="Activa" color="success" size="small" />
                      ) : (
                        <Chip label="Inactiva" size="small" />
                      )}
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 40 }}>
                      {cat.description || 'Sin descripción'}
                    </Typography>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Recargo</Typography>
                        <Typography fontWeight="bold">
                          ${parseFloat(cat.surcharge_per_cbm).toFixed(2)}/CBM
                        </Typography>
                      </Box>
                      <Box textAlign="right">
                        <Typography variant="caption" color="text.secondary">Tarifas</Typography>
                        <Typography fontWeight="bold">{cat.tier_count}</Typography>
                      </Box>
                    </Box>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                      <Tooltip title="Editar">
                        <IconButton 
                          size="small" 
                          onClick={() => handleEditCategory(cat)}
                          sx={{ color: SEA_COLOR }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={cat.is_active ? 'Desactivar' : 'Activar'}>
                        <Switch
                          checked={cat.is_active}
                          onChange={() => handleToggleCategoryActive(cat)}
                          size="small"
                          color="success"
                        />
                      </Tooltip>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Dialog: Nueva Tarifa */}
      <Dialog open={newTierDialog} onClose={() => setNewTierDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Agregar Nueva Tarifa</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Categoría</InputLabel>
                <Select
                  value={newTier.category_id}
                  label="Categoría"
                  onChange={(e) => setNewTier({ ...newTier, category_id: Number(e.target.value) })}
                >
                  {categories.map(cat => (
                    <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Min CBM"
                type="number"
                value={newTier.min_cbm}
                onChange={(e) => setNewTier({ ...newTier, min_cbm: e.target.value })}
                inputProps={{ step: '0.01' }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Max CBM"
                type="number"
                value={newTier.max_cbm}
                onChange={(e) => setNewTier({ ...newTier, max_cbm: e.target.value })}
                inputProps={{ step: '0.01' }}
              />
            </Grid>
            <Grid item xs={8}>
              <TextField
                fullWidth
                label="Precio (USD)"
                type="number"
                value={newTier.price}
                onChange={(e) => setNewTier({ ...newTier, price: e.target.value })}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
              />
            </Grid>
            <Grid item xs={4}>
              <FormControlLabel
                control={
                  <Switch
                    checked={newTier.is_flat_fee}
                    onChange={(e) => setNewTier({ ...newTier, is_flat_fee: e.target.checked })}
                  />
                }
                label="Tarifa Plana"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Notas"
                value={newTier.notes}
                onChange={(e) => setNewTier({ ...newTier, notes: e.target.value })}
                multiline
                rows={2}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewTierDialog(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleCreateTier} sx={{ bgcolor: SEA_COLOR }}>
            Crear Tarifa
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Nueva/Editar Categoría */}
      <Dialog open={categoryDialog} onClose={() => setCategoryDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingCategory ? `Editar Categoría: ${editingCategory.name}` : 'Nueva Categoría'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Nombre de la Categoría"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                placeholder="Ej: Premium, Frágil, Electrónico..."
                required
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Recargo por CBM (USD)"
                type="number"
                value={categoryForm.surcharge_per_cbm}
                onChange={(e) => setCategoryForm({ ...categoryForm, surcharge_per_cbm: e.target.value })}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
                helperText="Recargo adicional que se suma a la tarifa base. Dejar en 0 si no aplica."
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Descripción"
                value={categoryForm.description}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                multiline
                rows={3}
                placeholder="Descripción de qué tipo de mercancía aplica para esta categoría..."
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCategoryDialog(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleSaveCategory} 
            disabled={saving}
            sx={{ bgcolor: SEA_COLOR, '&:hover': { bgcolor: SEA_DARK } }}
          >
            {saving ? 'Guardando...' : (editingCategory ? 'Actualizar' : 'Crear Categoría')}
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
