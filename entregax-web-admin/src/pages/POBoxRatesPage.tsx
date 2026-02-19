// ============================================
// POBOX RATES PAGE
// Panel de gestión de tarifas PO Box USA
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  TextField,
  Switch,
  FormControlLabel,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  Chip,
  Card,
  CardContent,
  Grid,
  Divider,
  InputAdornment,
  Select,
  MenuItem,
  FormControl,
} from '@mui/material';
import {
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Calculate as CalculateIcon,
  Refresh as RefreshIcon,
  AttachMoney as MoneyIcon,
  LocalShipping as ShippingIcon,
  Inventory as InventoryIcon
} from '@mui/icons-material';

interface TarifaVolumen {
  id: number;
  nivel: number;
  cbm_min: number;
  cbm_max: number | null;
  costo: number;
  tipo_cobro: 'fijo' | 'por_unidad';
  moneda: string;
  estado: boolean;
}

interface ServicioExtra {
  id: number;
  nombre_servicio: string;
  descripcion: string;
  costo: number;
  moneda: string;
  estado: boolean;
}

interface Cotizacion {
  cbm: string;
  nivel_aplicado: number;
  costo_volumen_usd: string;
  tipo_cambio: string;
  costo_volumen_mxn: string;
  extras_mxn: string;
  total_mxn: string;
}

export default function POBoxRatesPage() {
  const token = localStorage.getItem('token');
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Estados
  const [tarifas, setTarifas] = useState<TarifaVolumen[]>([]);
  const [servicios, setServicios] = useState<ServicioExtra[]>([]);
  const [editingTarifa, setEditingTarifa] = useState<number | null>(null);
  const [editingServicio, setEditingServicio] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Cotizador
  const [cotizadorOpen, setCotizadorOpen] = useState(false);
  const [medidas, setMedidas] = useState({ largo: '', alto: '', ancho: '' });
  const [extras, setExtras] = useState({ foraneo: false, expres: false });
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [calculando, setCalculando] = useState(false);

  // Cargar datos
  const fetchData = useCallback(async () => {
    try {
      const [tarifasRes, serviciosRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/pobox/tarifas-volumen`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_URL}/api/admin/pobox/servicios-extra`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (tarifasRes.ok) {
        const data = await tarifasRes.json();
        setTarifas(data.tarifas || []);
      }

      if (serviciosRes.ok) {
        const data = await serviciosRes.json();
        setServicios(data.servicios || []);
      }
    } catch (_err) {
      console.error('Error cargando datos:', _err);
      setSnackbar({ open: true, message: 'Error al cargar datos', severity: 'error' });
    }
  }, [API_URL, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Editar tarifa
  const handleEditTarifa = (tarifa: TarifaVolumen) => {
    setEditingTarifa(tarifa.id);
    setEditValues({
      cbm_min: tarifa.cbm_min,
      cbm_max: tarifa.cbm_max,
      costo: tarifa.costo,
      tipo_cobro: tarifa.tipo_cobro
    });
  };

  const handleSaveTarifa = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/pobox/tarifas-volumen/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(editValues)
      });

      if (response.ok) {
        setSnackbar({ open: true, message: 'Tarifa actualizada', severity: 'success' });
        setEditingTarifa(null);
        fetchData();
      } else {
        throw new Error('Error al actualizar');
      }
    } catch {
      setSnackbar({ open: true, message: 'Error al guardar', severity: 'error' });
    }
  };

  // Toggle estado tarifa
  const handleToggleTarifa = async (tarifa: TarifaVolumen) => {
    try {
      await fetch(`${API_URL}/api/admin/pobox/tarifas-volumen/${tarifa.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ estado: !tarifa.estado })
      });
      fetchData();
    } catch {
      setSnackbar({ open: true, message: 'Error al cambiar estado', severity: 'error' });
    }
  };

  // Editar servicio extra
  const handleEditServicio = (servicio: ServicioExtra) => {
    setEditingServicio(servicio.id);
    setEditValues({
      nombre_servicio: servicio.nombre_servicio,
      descripcion: servicio.descripcion,
      costo: servicio.costo
    });
  };

  const handleSaveServicio = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/pobox/servicios-extra/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(editValues)
      });

      if (response.ok) {
        setSnackbar({ open: true, message: 'Servicio actualizado', severity: 'success' });
        setEditingServicio(null);
        fetchData();
      } else {
        throw new Error('Error al actualizar');
      }
    } catch {
      setSnackbar({ open: true, message: 'Error al guardar', severity: 'error' });
    }
  };

  // Toggle estado servicio
  const handleToggleServicio = async (servicio: ServicioExtra) => {
    try {
      await fetch(`${API_URL}/api/admin/pobox/servicios-extra/${servicio.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ estado: !servicio.estado })
      });
      fetchData();
    } catch {
      setSnackbar({ open: true, message: 'Error al cambiar estado', severity: 'error' });
    }
  };

  // Cotizador
  const handleCotizar = async () => {
    if (!medidas.largo || !medidas.alto || !medidas.ancho) {
      setSnackbar({ open: true, message: 'Ingresa todas las medidas', severity: 'error' });
      return;
    }

    setCalculando(true);
    try {
      const response = await fetch(`${API_URL}/api/pobox/cotizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          largo: parseFloat(medidas.largo),
          alto: parseFloat(medidas.alto),
          ancho: parseFloat(medidas.ancho),
          requiereForaneo: extras.foraneo,
          requiereExpres: extras.expres
        })
      });

      if (response.ok) {
        const data = await response.json();
        setCotizacion(data.cotizacion);
      } else {
        throw new Error('Error en cotización');
      }
    } catch {
      setSnackbar({ open: true, message: 'Error al calcular cotización', severity: 'error' });
    } finally {
      setCalculando(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InventoryIcon color="primary" /> Tarifas PO Box USA
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gestión de tarifas por volumen y servicios adicionales
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchData}
          >
            Actualizar
          </Button>
          <Button
            variant="contained"
            startIcon={<CalculateIcon />}
            onClick={() => setCotizadorOpen(true)}
          >
            Cotizador
          </Button>
        </Box>
      </Box>

      {/* Tarifas de Volumen */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <MoneyIcon color="primary" /> Tarifas por Volumen (CBM)
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          <strong>Fórmula CBM:</strong> (Largo × Alto × Ancho) / 1,000,000 | <strong>Mínimo cobrable:</strong> 0.010 m³
        </Alert>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell><strong>Nivel</strong></TableCell>
                <TableCell><strong>CBM Mínimo</strong></TableCell>
                <TableCell><strong>CBM Máximo</strong></TableCell>
                <TableCell><strong>Costo</strong></TableCell>
                <TableCell><strong>Tipo Cobro</strong></TableCell>
                <TableCell><strong>Estado</strong></TableCell>
                <TableCell align="center"><strong>Acciones</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tarifas.map((tarifa) => (
                <TableRow key={tarifa.id}>
                  <TableCell>
                    <Chip 
                      label={`Nivel ${tarifa.nivel}`} 
                      color={tarifa.nivel === 1 ? 'success' : tarifa.nivel === 2 ? 'warning' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {editingTarifa === tarifa.id ? (
                      <TextField
                        size="small"
                        type="number"
                        value={editValues.cbm_min}
                        onChange={(e) => setEditValues({ ...editValues, cbm_min: e.target.value })}
                        inputProps={{ step: 0.001 }}
                      />
                    ) : (
                      parseFloat(String(tarifa.cbm_min || 0)).toFixed(4)
                    )}
                  </TableCell>
                  <TableCell>
                    {editingTarifa === tarifa.id ? (
                      <TextField
                        size="small"
                        type="number"
                        value={editValues.cbm_max || ''}
                        onChange={(e) => setEditValues({ ...editValues, cbm_max: e.target.value || null })}
                        inputProps={{ step: 0.001 }}
                        placeholder="Sin límite"
                      />
                    ) : (
                      tarifa.cbm_max ? parseFloat(String(tarifa.cbm_max)).toFixed(4) : '∞ (En adelante)'
                    )}
                  </TableCell>
                  <TableCell>
                    {editingTarifa === tarifa.id ? (
                      <TextField
                        size="small"
                        type="number"
                        value={editValues.costo}
                        onChange={(e) => setEditValues({ ...editValues, costo: e.target.value })}
                        InputProps={{
                          startAdornment: <InputAdornment position="start">$</InputAdornment>,
                          endAdornment: <InputAdornment position="end">{tarifa.moneda}</InputAdornment>
                        }}
                      />
                    ) : (
                      <strong>${parseFloat(String(tarifa.costo || 0)).toFixed(2)} {tarifa.moneda}</strong>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingTarifa === tarifa.id ? (
                      <FormControl size="small" sx={{ minWidth: 120 }}>
                        <Select
                          value={editValues.tipo_cobro}
                          onChange={(e) => setEditValues({ ...editValues, tipo_cobro: e.target.value })}
                        >
                          <MenuItem value="fijo">Fijo</MenuItem>
                          <MenuItem value="por_unidad">Por m³</MenuItem>
                        </Select>
                      </FormControl>
                    ) : (
                      <Chip 
                        label={tarifa.tipo_cobro === 'fijo' ? 'Precio Fijo' : 'Por m³'} 
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={tarifa.estado}
                      onChange={() => handleToggleTarifa(tarifa)}
                      color="success"
                    />
                  </TableCell>
                  <TableCell align="center">
                    {editingTarifa === tarifa.id ? (
                      <>
                        <IconButton color="success" onClick={() => handleSaveTarifa(tarifa.id)}>
                          <SaveIcon />
                        </IconButton>
                        <IconButton color="error" onClick={() => setEditingTarifa(null)}>
                          <CancelIcon />
                        </IconButton>
                      </>
                    ) : (
                      <IconButton color="primary" onClick={() => handleEditTarifa(tarifa)}>
                        <EditIcon />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Servicios Extra */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShippingIcon color="primary" /> Servicios Adicionales
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell><strong>Servicio</strong></TableCell>
                <TableCell><strong>Descripción</strong></TableCell>
                <TableCell><strong>Costo</strong></TableCell>
                <TableCell><strong>Estado</strong></TableCell>
                <TableCell align="center"><strong>Acciones</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {servicios.map((servicio) => (
                <TableRow key={servicio.id}>
                  <TableCell>
                    {editingServicio === servicio.id ? (
                      <TextField
                        size="small"
                        value={editValues.nombre_servicio}
                        onChange={(e) => setEditValues({ ...editValues, nombre_servicio: e.target.value })}
                      />
                    ) : (
                      <strong>{servicio.nombre_servicio}</strong>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingServicio === servicio.id ? (
                      <TextField
                        size="small"
                        fullWidth
                        value={editValues.descripcion || ''}
                        onChange={(e) => setEditValues({ ...editValues, descripcion: e.target.value })}
                      />
                    ) : (
                      servicio.descripcion || '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {editingServicio === servicio.id ? (
                      <TextField
                        size="small"
                        type="number"
                        value={editValues.costo}
                        onChange={(e) => setEditValues({ ...editValues, costo: e.target.value })}
                        InputProps={{
                          startAdornment: <InputAdornment position="start">$</InputAdornment>,
                          endAdornment: <InputAdornment position="end">{servicio.moneda}</InputAdornment>
                        }}
                      />
                    ) : (
                      <strong>${parseFloat(String(servicio.costo || 0)).toFixed(2)} {servicio.moneda}</strong>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={servicio.estado}
                      onChange={() => handleToggleServicio(servicio)}
                      color="success"
                    />
                  </TableCell>
                  <TableCell align="center">
                    {editingServicio === servicio.id ? (
                      <>
                        <IconButton color="success" onClick={() => handleSaveServicio(servicio.id)}>
                          <SaveIcon />
                        </IconButton>
                        <IconButton color="error" onClick={() => setEditingServicio(null)}>
                          <CancelIcon />
                        </IconButton>
                      </>
                    ) : (
                      <IconButton color="primary" onClick={() => handleEditServicio(servicio)}>
                        <EditIcon />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Dialog Cotizador */}
      <Dialog open={cotizadorOpen} onClose={() => setCotizadorOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CalculateIcon color="primary" /> Cotizador PO Box USA
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>Medidas del paquete (cm)</Typography>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 4 }}>
                <TextField
                  fullWidth
                  label="Largo"
                  type="number"
                  value={medidas.largo}
                  onChange={(e) => setMedidas({ ...medidas, largo: e.target.value })}
                  InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }}
                />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <TextField
                  fullWidth
                  label="Alto"
                  type="number"
                  value={medidas.alto}
                  onChange={(e) => setMedidas({ ...medidas, alto: e.target.value })}
                  InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }}
                />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <TextField
                  fullWidth
                  label="Ancho"
                  type="number"
                  value={medidas.ancho}
                  onChange={(e) => setMedidas({ ...medidas, ancho: e.target.value })}
                  InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }}
                />
              </Grid>
            </Grid>

            <Typography variant="subtitle2" sx={{ mb: 2 }}>Servicios adicionales</Typography>
            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={extras.foraneo}
                    onChange={(e) => setExtras({ ...extras, foraneo: e.target.checked })}
                  />
                }
                label="Envío Foráneo"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={extras.expres}
                    onChange={(e) => setExtras({ ...extras, expres: e.target.checked })}
                  />
                }
                label="Paquete Exprés"
              />
            </Box>

            <Button
              fullWidth
              variant="contained"
              onClick={handleCotizar}
              disabled={calculando}
              startIcon={<CalculateIcon />}
            >
              {calculando ? 'Calculando...' : 'Calcular Cotización'}
            </Button>

            {cotizacion && (
              <Card sx={{ mt: 3, bgcolor: '#f8f9fa' }}>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>Resultado de Cotización</Typography>
                  <Divider sx={{ mb: 2 }} />
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="body2" color="text.secondary">Volumen (CBM)</Typography>
                      <Typography variant="h6">{cotizacion.cbm} m³</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="body2" color="text.secondary">Nivel Aplicado</Typography>
                      <Chip label={`Nivel ${cotizacion.nivel_aplicado}`} color="primary" />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="body2" color="text.secondary">Costo Volumen (USD)</Typography>
                      <Typography variant="h6">${cotizacion.costo_volumen_usd}</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="body2" color="text.secondary">Tipo de Cambio</Typography>
                      <Typography variant="h6">${cotizacion.tipo_cambio}</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="body2" color="text.secondary">Costo Volumen (MXN)</Typography>
                      <Typography variant="h6">${cotizacion.costo_volumen_mxn}</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="body2" color="text.secondary">Extras (MXN)</Typography>
                      <Typography variant="h6">${cotizacion.extras_mxn}</Typography>
                    </Grid>
                  </Grid>
                  <Divider sx={{ my: 2 }} />
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">TOTAL A PAGAR</Typography>
                    <Typography variant="h4" color="primary" fontWeight="bold">
                      ${cotizacion.total_mxn} MXN
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCotizadorOpen(false); setCotizacion(null); }}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
