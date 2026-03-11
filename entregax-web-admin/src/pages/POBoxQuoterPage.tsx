// ============================================
// PO BOX QUOTER PAGE
// Cotizador especializado para PO Box USA
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Card,
  CardContent,
  Grid,
  Divider,
  InputAdornment,
  CircularProgress,
  Alert,
  Snackbar,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  RadioGroup,
  FormControlLabel,
  Radio,
  Fade,
} from '@mui/material';
import {
  Calculate as CalculateIcon,
  Straighten as RulerIcon,
  Scale as ScaleIcon,
  LocalShipping as ShippingIcon,
  AttachMoney as MoneyIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import api from '../services/api';

// ============================================
// INTERFACES
// ============================================

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

interface Paqueteria {
  id: number;
  nombre: string;
  codigo: string;
  precio_base: number;
  precio_kg_extra: number;
  peso_incluido: number;
  activo: boolean;
}

interface CotizacionResultado {
  // Servicio PO Box
  volumen_cbm: number;
  nivel_aplicado: number;
  costo_pobox_usd: number;
  tipo_cambio: number;
  costo_pobox_mxn: number;
  // Paquetería nacional
  paqueteria_nombre?: string;
  costo_paqueteria_mxn: number;
  peso_kg: number;
  // Total
  total_mxn: number;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const POBoxQuoterPage: React.FC = () => {
  // Estado de tarifas
  const [tarifas, setTarifas] = useState<TarifaVolumen[]>([]);
  const [tipoCambio, setTipoCambio] = useState<number>(18.25);
  const [loadingTarifas, setLoadingTarifas] = useState(true);

  // Medidas
  const [medidas, setMedidas] = useState({
    largo: '',
    ancho: '',
    alto: '',
  });
  const [peso, setPeso] = useState('');

  // Destino
  const [destino, setDestino] = useState<'bodega' | 'nacional'>('bodega');
  const [paqueteria, setPaqueteria] = useState<string>('paquete_express');
  const [ciudadDestino, setCiudadDestino] = useState('');

  // Resultado
  const [cotizacion, setCotizacion] = useState<CotizacionResultado | null>(null);
  const [calculando, setCalculando] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error' | 'info',
  });

  // Paqueterías disponibles
  const paqueterias: Paqueteria[] = [
    { id: 1, nombre: 'Paquete Express', codigo: 'paquete_express', precio_base: 350, precio_kg_extra: 25, peso_incluido: 10, activo: true },
    { id: 2, nombre: 'Fedex Economy', codigo: 'fedex_economy', precio_base: 280, precio_kg_extra: 30, peso_incluido: 5, activo: true },
    { id: 3, nombre: 'Estafeta', codigo: 'estafeta', precio_base: 220, precio_kg_extra: 22, peso_incluido: 5, activo: true },
    { id: 4, nombre: 'DHL Express', codigo: 'dhl_express', precio_base: 450, precio_kg_extra: 45, peso_incluido: 10, activo: true },
  ];

  // ============================================
  // CARGAR DATOS
  // ============================================

  const fetchTarifas = useCallback(async () => {
    setLoadingTarifas(true);
    try {
      // Obtener tarifas de volumen
      const tarifasRes = await api.get('/admin/pobox/tarifas-volumen');
      if (tarifasRes.data?.tarifas) {
        setTarifas(tarifasRes.data.tarifas.filter((t: TarifaVolumen) => t.estado));
      }

      // Obtener tipo de cambio actual
      try {
        const tcRes = await api.get('/exchange-rate');
        if (tcRes.data?.rate) {
          setTipoCambio(parseFloat(tcRes.data.rate));
        }
      } catch {
        console.log('Usando TC por defecto');
      }
    } catch (error) {
      console.error('Error cargando tarifas:', error);
      // Usar tarifas por defecto si falla
      setTarifas([
        { id: 1, nivel: 1, cbm_min: 0.01, cbm_max: 0.05, costo: 39, tipo_cobro: 'fijo', moneda: 'USD', estado: true },
        { id: 2, nivel: 2, cbm_min: 0.051, cbm_max: 0.099, costo: 79, tipo_cobro: 'fijo', moneda: 'USD', estado: true },
        { id: 3, nivel: 3, cbm_min: 0.1, cbm_max: null, costo: 750, tipo_cobro: 'por_unidad', moneda: 'USD', estado: true },
      ]);
    } finally {
      setLoadingTarifas(false);
    }
  }, []);

  useEffect(() => {
    fetchTarifas();
  }, [fetchTarifas]);

  // ============================================
  // CÁLCULO DE COTIZACIÓN
  // ============================================

  const calcularCotizacion = () => {
    // Validar medidas
    const largo = parseFloat(medidas.largo);
    const ancho = parseFloat(medidas.ancho);
    const alto = parseFloat(medidas.alto);
    const pesoKg = parseFloat(peso) || 0;

    if (!largo || !ancho || !alto || largo <= 0 || ancho <= 0 || alto <= 0) {
      setSnackbar({ open: true, message: 'Ingresa todas las medidas correctamente', severity: 'error' });
      return;
    }

    if (destino === 'nacional' && pesoKg <= 0) {
      setSnackbar({ open: true, message: 'El peso es requerido para envío nacional', severity: 'error' });
      return;
    }

    setCalculando(true);

    // Calcular volumen en CBM (metros cúbicos)
    // Fórmula: (Largo cm × Ancho cm × Alto cm) / 1,000,000
    const volumenCBM = (largo * ancho * alto) / 1000000;
    const volumenRedondeado = Math.max(0.01, parseFloat(volumenCBM.toFixed(4))); // Mínimo 0.01 m³

    // Encontrar tarifa aplicable
    let tarifaAplicable = tarifas.find(t => {
      const min = parseFloat(String(t.cbm_min));
      const max = t.cbm_max ? parseFloat(String(t.cbm_max)) : Infinity;
      return volumenRedondeado >= min && volumenRedondeado <= max;
    });

    // Si no encuentra, usar la última (más alta)
    if (!tarifaAplicable && tarifas.length > 0) {
      tarifaAplicable = tarifas[tarifas.length - 1];
    }

    if (!tarifaAplicable) {
      setSnackbar({ open: true, message: 'No se encontró tarifa aplicable', severity: 'error' });
      setCalculando(false);
      return;
    }

    // Calcular costo PO Box
    let costoPOBoxUSD = 0;
    if (tarifaAplicable.tipo_cobro === 'fijo') {
      costoPOBoxUSD = parseFloat(String(tarifaAplicable.costo));
    } else {
      // Por unidad (por m³)
      costoPOBoxUSD = volumenRedondeado * parseFloat(String(tarifaAplicable.costo));
    }

    const costoPOBoxMXN = costoPOBoxUSD * tipoCambio;

    // Calcular costo de paquetería si aplica
    let costoPaqueteriaMXN = 0;
    let paqueteriaNombre = '';

    if (destino === 'nacional') {
      const paqSeleccionada = paqueterias.find(p => p.codigo === paqueteria);
      if (paqSeleccionada) {
        paqueteriaNombre = paqSeleccionada.nombre;
        costoPaqueteriaMXN = paqSeleccionada.precio_base;
        
        // Agregar costo por kg extra
        if (pesoKg > paqSeleccionada.peso_incluido) {
          const kgExtra = pesoKg - paqSeleccionada.peso_incluido;
          costoPaqueteriaMXN += kgExtra * paqSeleccionada.precio_kg_extra;
        }
      }
    }

    // Total
    const totalMXN = costoPOBoxMXN + costoPaqueteriaMXN;

    // Resultado
    const resultado: CotizacionResultado = {
      volumen_cbm: volumenRedondeado,
      nivel_aplicado: tarifaAplicable.nivel,
      costo_pobox_usd: costoPOBoxUSD,
      tipo_cambio: tipoCambio,
      costo_pobox_mxn: costoPOBoxMXN,
      paqueteria_nombre: paqueteriaNombre || undefined,
      costo_paqueteria_mxn: costoPaqueteriaMXN,
      peso_kg: pesoKg,
      total_mxn: totalMXN,
    };

    setTimeout(() => {
      setCotizacion(resultado);
      setCalculando(false);
    }, 500);
  };

  const limpiarCotizacion = () => {
    setMedidas({ largo: '', ancho: '', alto: '' });
    setPeso('');
    setDestino('bodega');
    setPaqueteria('paquete_express');
    setCiudadDestino('');
    setCotizacion(null);
  };

  // ============================================
  // FORMATEO
  // ============================================

  const formatCurrency = (amount: number, currency: string = 'MXN') => {
    return new Intl.NumberFormat('es-MX', { 
      style: 'currency', 
      currency: currency,
      minimumFractionDigits: 2
    }).format(amount);
  };

  // ============================================
  // RENDER
  // ============================================

  if (loadingTarifas) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          <CalculateIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Cotizador PO Box USA
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Calcula el costo de envío basado en dimensiones y destino
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Formulario de cotización */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            {/* Tipo de cambio actual */}
            <Alert severity="info" sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span><strong>Tipo de Cambio:</strong> ${tipoCambio.toFixed(2)} MXN/USD</span>
                <Button size="small" startIcon={<RefreshIcon />} onClick={fetchTarifas}>
                  Actualizar
                </Button>
              </Box>
            </Alert>

            {/* Sección: Medidas */}
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <RulerIcon color="primary" /> Medidas del Paquete
            </Typography>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 4 }}>
                <TextField
                  fullWidth
                  label="Largo"
                  type="number"
                  value={medidas.largo}
                  onChange={(e) => setMedidas({ ...medidas, largo: e.target.value })}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">cm</InputAdornment>,
                  }}
                  placeholder="0"
                />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <TextField
                  fullWidth
                  label="Ancho"
                  type="number"
                  value={medidas.ancho}
                  onChange={(e) => setMedidas({ ...medidas, ancho: e.target.value })}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">cm</InputAdornment>,
                  }}
                  placeholder="0"
                />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <TextField
                  fullWidth
                  label="Alto"
                  type="number"
                  value={medidas.alto}
                  onChange={(e) => setMedidas({ ...medidas, alto: e.target.value })}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">cm</InputAdornment>,
                  }}
                  placeholder="0"
                />
              </Grid>
            </Grid>

            {/* Sección: Peso */}
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ScaleIcon color="primary" /> Peso del Paquete
            </Typography>
            <TextField
              fullWidth
              label="Peso"
              type="number"
              value={peso}
              onChange={(e) => setPeso(e.target.value)}
              InputProps={{
                endAdornment: <InputAdornment position="end">kg</InputAdornment>,
              }}
              placeholder="0"
              sx={{ mb: 3 }}
            />

            <Divider sx={{ my: 3 }} />

            {/* Sección: Destino */}
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ShippingIcon color="primary" /> Destino de Entrega
            </Typography>
            
            <RadioGroup
              value={destino}
              onChange={(e) => setDestino(e.target.value as 'bodega' | 'nacional')}
              sx={{ mb: 2 }}
            >
              <FormControlLabel 
                value="bodega" 
                control={<Radio />} 
                label={
                  <Box>
                    <Typography fontWeight="bold">📦 Dejar en Bodega</Typography>
                    <Typography variant="body2" color="text.secondary">
                      El cliente recogerá en sucursal
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel 
                value="nacional" 
                control={<Radio />} 
                label={
                  <Box>
                    <Typography fontWeight="bold">🚚 Envío Nacional</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Enviar a domicilio en México
                    </Typography>
                  </Box>
                }
              />
            </RadioGroup>

            {/* Opciones de paquetería (solo si es envío nacional) */}
            <Fade in={destino === 'nacional'}>
              <Box sx={{ display: destino === 'nacional' ? 'block' : 'none' }}>
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Paquetería</InputLabel>
                  <Select
                    value={paqueteria}
                    onChange={(e) => setPaqueteria(e.target.value)}
                    label="Paquetería"
                  >
                    {paqueterias.filter(p => p.activo).map((paq) => (
                      <MenuItem key={paq.codigo} value={paq.codigo}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                          <span>{paq.nombre}</span>
                          <Chip 
                            label={`$${paq.precio_base} MXN`} 
                            size="small" 
                            color="success"
                            sx={{ ml: 2 }}
                          />
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  fullWidth
                  label="Ciudad de Destino"
                  value={ciudadDestino}
                  onChange={(e) => setCiudadDestino(e.target.value)}
                  placeholder="Ej: Monterrey, CDMX, Guadalajara"
                  sx={{ mb: 2 }}
                />
              </Box>
            </Fade>

            {/* Botones */}
            <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
              <Button
                variant="contained"
                size="large"
                fullWidth
                startIcon={calculando ? <CircularProgress size={20} color="inherit" /> : <CalculateIcon />}
                onClick={calcularCotizacion}
                disabled={calculando}
              >
                {calculando ? 'Calculando...' : 'Calcular Cotización'}
              </Button>
              <Button
                variant="outlined"
                onClick={limpiarCotizacion}
              >
                Limpiar
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Panel de resultados */}
        <Grid size={{ xs: 12, md: 6 }}>
          {/* Tarifas de referencia */}
          <Paper sx={{ p: 3, mb: 3, bgcolor: '#fff8e1' }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <MoneyIcon color="warning" /> Tarifas PO Box USA
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {tarifas.map((tarifa) => (
                <Chip
                  key={tarifa.id}
                  label={
                    tarifa.cbm_max 
                      ? `${tarifa.cbm_min.toFixed(4)} - ${tarifa.cbm_max.toFixed(4)} m³ = $${tarifa.costo} USD ${tarifa.tipo_cobro === 'fijo' ? '(fijo)' : '(por m³)'}`
                      : `${tarifa.cbm_min.toFixed(4)}+ m³ = $${tarifa.costo} USD por m³`
                  }
                  color={tarifa.nivel === 1 ? 'success' : tarifa.nivel === 2 ? 'warning' : 'error'}
                  variant={cotizacion?.nivel_aplicado === tarifa.nivel ? 'filled' : 'outlined'}
                  sx={{ mb: 1 }}
                />
              ))}
            </Box>
          </Paper>

          {/* Resultado de la cotización */}
          {cotizacion && (
            <Fade in={true}>
              <Card sx={{ border: '2px solid', borderColor: 'success.main' }}>
                <CardContent>
                  <Typography variant="h5" gutterBottom fontWeight="bold" color="success.main">
                    📋 Resultado de Cotización
                  </Typography>

                  <Divider sx={{ my: 2 }} />

                  {/* Desglose */}
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                      📦 Servicio PO Box USA
                    </Typography>
                    
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography color="text.secondary">Volumen calculado:</Typography>
                      <Typography fontWeight="bold">{cotizacion.volumen_cbm.toFixed(4)} m³ (Nivel {cotizacion.nivel_aplicado})</Typography>
                    </Box>
                    
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography color="text.secondary">Costo en USD:</Typography>
                      <Typography fontWeight="bold">{formatCurrency(cotizacion.costo_pobox_usd, 'USD')}</Typography>
                    </Box>
                    
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography color="text.secondary">Tipo de cambio:</Typography>
                      <Typography>${cotizacion.tipo_cambio.toFixed(2)} MXN/USD</Typography>
                    </Box>
                    
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', bgcolor: '#e8f5e9', p: 1, borderRadius: 1 }}>
                      <Typography fontWeight="bold">Servicio PO Box:</Typography>
                      <Typography fontWeight="bold" color="success.main">
                        {formatCurrency(cotizacion.costo_pobox_mxn)}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Paquetería nacional */}
                  {cotizacion.costo_paqueteria_mxn > 0 && (
                    <Box sx={{ mb: 3 }}>
                      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                        🚚 Envío Nacional ({cotizacion.paqueteria_nombre})
                      </Typography>
                      
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography color="text.secondary">Peso:</Typography>
                        <Typography>{cotizacion.peso_kg.toFixed(2)} kg</Typography>
                      </Box>
                      
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', bgcolor: '#e3f2fd', p: 1, borderRadius: 1 }}>
                        <Typography fontWeight="bold">Envío Nacional:</Typography>
                        <Typography fontWeight="bold" color="primary.main">
                          {formatCurrency(cotizacion.costo_paqueteria_mxn)}
                        </Typography>
                      </Box>
                    </Box>
                  )}

                  <Divider sx={{ my: 2 }} />

                  {/* Total */}
                  <Box sx={{ 
                    bgcolor: 'success.main', 
                    color: 'white', 
                    p: 2, 
                    borderRadius: 2,
                    textAlign: 'center'
                  }}>
                    <Typography variant="h6">TOTAL A COBRAR</Typography>
                    <Typography variant="h3" fontWeight="bold">
                      {formatCurrency(cotizacion.total_mxn)}
                    </Typography>
                  </Box>

                  {/* Advertencia */}
                  <Alert severity="info" sx={{ mt: 2 }} icon={<InfoIcon />}>
                    Este es un <strong>precio estimado</strong>. El precio final puede variar según las dimensiones y peso verificados al momento de recibir el paquete.
                  </Alert>
                </CardContent>
              </Card>
            </Fade>
          )}

          {/* Placeholder cuando no hay cotización */}
          {!cotizacion && (
            <Paper sx={{ p: 4, textAlign: 'center', bgcolor: '#f5f5f5' }}>
              <CalculateIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
              <Typography variant="h6" color="text.secondary">
                Ingresa las medidas y presiona "Calcular"
              </Typography>
              <Typography variant="body2" color="text.secondary">
                El resultado aparecerá aquí
              </Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default POBoxQuoterPage;
