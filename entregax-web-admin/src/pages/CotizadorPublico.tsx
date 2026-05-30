import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  TextField,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Divider,
  useTheme,
  useMediaQuery,
  Container,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  DirectionsBoat as MaritimeIcon,
  Flight as AirIcon,
  LocalPostOffice as POBoxIcon,
  LocalShipping as DHLIcon,
  Calculate as CalculateIcon,
  Refresh as RefreshIcon,
  TableChart as TableIcon,
} from '@mui/icons-material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Servicio {
  id: string;
  nombre: string;
  descripcion: string;
  tiempo_estimado: string;
  unidad: string;
  precio_base_usd: number;
  precio_base_mxn: number;
  icono: string;
  notas: string;
}

interface PublicRates {
  tipo_cambio: number;
  servicios: Servicio[];
}

interface QuoteResult {
  servicio: string;
  cbm?: number;
  peso_kg?: number;
  precio_usd: number;
  precio_mxn: number;
  tipo_cambio: number;
  detalles?: string;
  categoria?: string;
  peso_lb?: number;
  unidad?: string;
  cantidad?: number;
  precio_unitario_usd?: number;
}

type ServiceType = 'maritimo' | 'aereo' | 'pobox' | 'dhl' | null;

export default function CotizadorPublico() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<PublicRates | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedService, setSelectedService] = useState<ServiceType>(null);
  // Campos comunes
  const [largo, setLargo] = useState('');
  const [ancho, setAncho] = useState('');
  const [alto, setAlto] = useState('');
  const [peso, setPeso] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [categoria, setCategoria] = useState('generico');
  const [dhlTipo, setDhlTipo] = useState('standard');
  const [airSubservice, setAirSubservice] = useState<'tdi_aereo' | 'tdi_express'>('tdi_aereo');
  const [cbm, setCbm] = useState('');
  const [cbmManual, setCbmManual] = useState(false);
  const [dimUnit, setDimUnit] = useState<'cm' | 'in'>('cm');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Tabla de precios marítimo (Generico + StartUp)
  interface MaritimeTier {
    category: string;
    min_cbm: number;
    max_cbm: number | null;
    price: number;
    is_flat_fee: boolean;
    notes: string | null;
  }
  const [maritimeTiers, setMaritimeTiers] = useState<MaritimeTier[]>([]);

  useEffect(() => {
    loadRates();
    fetch(`${API_URL}/api/public/maritime-tiers`)
      .then(r => r.ok ? r.json() : { tiers: [] })
      .then(d => setMaritimeTiers(d.tiers || []))
      .catch(() => setMaritimeTiers([]));
  }, []);

  // Auto-calcular CBM cuando cambian las dimensiones (salvo que el usuario lo haya capturado manualmente)
  useEffect(() => {
    if (selectedService !== 'maritimo') return;
    if (cbmManual) return;
    const L = parseFloat(largo);
    const W = parseFloat(ancho);
    const H = parseFloat(alto);
    if (L > 0 && W > 0 && H > 0) {
      // Convertir a cm si vienen en pulgadas (1 in = 2.54 cm)
      const factor = dimUnit === 'in' ? 2.54 : 1;
      const Lc = L * factor;
      const Wc = W * factor;
      const Hc = H * factor;
      const calc = (Lc * Wc * Hc) / 1_000_000;
      setCbm(calc.toFixed(4));
    } else {
      setCbm('');
    }
  }, [largo, ancho, alto, selectedService, cbmManual, dimUnit]);
  
  const loadRates = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/public/rates`);
      if (!res.ok) throw new Error('Error cargando tarifas');
      const data = await res.json();
      setRates(data);
    } catch (err) {
      setError('No se pudieron cargar las tarifas. Por favor intente más tarde.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleServiceSelect = (service: ServiceType) => {
    setSelectedService(service);
    setLargo('');
    setAncho('');
    setAlto('');
    setPeso('');
    setCantidad('1');
    setCategoria('generico');
    setDhlTipo('standard');
    setAirSubservice('tdi_aereo');
    setCbm('');
    setCbmManual(false);
    setQuoteResult(null);
    setQuoteError(null);
  };
  
  const handleCalculate = async () => {
    if (!selectedService) return;
    
    setQuoteLoading(true);
    setQuoteError(null);
    setQuoteResult(null);
    
    try {
      const body: Record<string, unknown> = {
        servicio: selectedService,
      };
      
      if (selectedService === 'maritimo') {
        const dimFactor = dimUnit === 'in' ? 2.54 : 1; // a cm
        const weightFactor = weightUnit === 'lb' ? 0.45359237 : 1; // a kg
        if (cbmManual && cbm) {
          body.cbm = parseFloat(cbm) || 0;
        } else {
          body.largo = (parseFloat(largo) || 0) * dimFactor;
          body.ancho = (parseFloat(ancho) || 0) * dimFactor;
          body.alto = (parseFloat(alto) || 0) * dimFactor;
        }
        body.peso = (parseFloat(peso) || 0) * weightFactor;
        body.cantidad = parseInt(cantidad) || 1;
      } else if (selectedService === 'aereo') {
        body.peso = parseFloat(peso) || 0;
        body.largo = parseFloat(largo) || 0;
        body.ancho = parseFloat(ancho) || 0;
        body.alto = parseFloat(alto) || 0;
        body.categoria = 'G';
        body.subservicio = airSubservice;
      } else if (selectedService === 'pobox') {
        body.peso = parseFloat(peso) || 0;
      } else if (selectedService === 'dhl') {
        body.tipo = dhlTipo;
      }
      
      const res = await fetch(`${API_URL}/api/public/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error calculando cotización');
      }
      
      const data = await res.json();
      setQuoteResult(data);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al calcular';
      setQuoteError(errorMessage);
    } finally {
      setQuoteLoading(false);
    }
  };
  
  const serviceCards = [
    {
      id: 'maritimo',
      title: 'Marítimo China',
      description: 'Envío por contenedor desde China',
      icon: <MaritimeIcon sx={{ fontSize: 48 }} />,
      color: '#1976d2',
    },
    {
      id: 'aereo',
      title: 'Aéreo China',
      description: 'Envío aéreo express desde China',
      icon: <AirIcon sx={{ fontSize: 48 }} />,
      color: '#9c27b0',
    },
    {
      id: 'pobox',
      title: 'PO Box USA',
      description: 'Reenvío desde Estados Unidos',
      icon: <POBoxIcon sx={{ fontSize: 48 }} />,
      color: '#2e7d32',
    },
    {
      id: 'dhl',
      title: 'DHL Express',
      description: 'Envío express con DHL',
      icon: <DHLIcon sx={{ fontSize: 48 }} />,
      color: '#d32f2f',
    },
  ];
  
  const renderServiceForm = () => {
    if (!selectedService) return null;
    
    const selectedCard = serviceCards.find(s => s.id === selectedService);
    
    return (
      <Paper elevation={3} sx={{ p: 3, mt: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box sx={{ 
            bgcolor: `${selectedCard?.color}20`, 
            color: selectedCard?.color, 
            p: 1, 
            borderRadius: 2, 
            mr: 2 
          }}>
            {selectedCard?.icon}
          </Box>
          <Box>
            <Typography variant="h6">{selectedCard?.title}</Typography>
            <Typography variant="body2" color="text.secondary">
              {selectedService === 'maritimo' && 'Precio basado en volumen CBM (m³)'}
              {selectedService === 'aereo' && 'Precio por kg (peso real o volumétrico)'}
              {selectedService === 'pobox' && 'Precio por volumen (medidas del paquete)'}
              {selectedService === 'dhl' && 'Precio fijo por liberación'}
            </Typography>
          </Box>
        </Box>
        
        <Divider sx={{ my: 2 }} />
        
        {/* Marítimo - requiere dimensiones */}
        {selectedService === 'maritimo' && (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Ingresa las dimensiones y el peso del bulto:
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <FormControl fullWidth>
                <InputLabel>UOM (dimensiones)</InputLabel>
                <Select
                  value={dimUnit}
                  label="UOM (dimensiones)"
                  onChange={(e) => setDimUnit(e.target.value as 'cm' | 'in')}
                >
                  <MenuItem value="cm">centímetro (cm)</MenuItem>
                  <MenuItem value="in">pulgada (in)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 4, sm: 3 }}>
              <TextField
                fullWidth
                label={`Longitud (${dimUnit})`}
                type="number"
                value={largo}
                onChange={(e) => setLargo(e.target.value)}
                inputProps={{ min: 0, step: 1 }}
              />
            </Grid>
            <Grid size={{ xs: 4, sm: 3 }}>
              <TextField
                fullWidth
                label={`Ancho (${dimUnit})`}
                type="number"
                value={ancho}
                onChange={(e) => setAncho(e.target.value)}
                inputProps={{ min: 0, step: 1 }}
              />
            </Grid>
            <Grid size={{ xs: 4, sm: 3 }}>
              <TextField
                fullWidth
                label={`Altura (${dimUnit})`}
                type="number"
                value={alto}
                onChange={(e) => setAlto(e.target.value)}
                inputProps={{ min: 0, step: 1 }}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <TextField
                fullWidth
                label={`Peso (${weightUnit})`}
                type="number"
                value={peso}
                onChange={(e) => setPeso(e.target.value)}
                inputProps={{ min: 0, step: 0.1 }}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <FormControl fullWidth>
                <InputLabel>Unidad de peso</InputLabel>
                <Select
                  value={weightUnit}
                  label="Unidad de peso"
                  onChange={(e) => setWeightUnit(e.target.value as 'kg' | 'lb')}
                >
                  <MenuItem value="kg">kilogramo (kg)</MenuItem>
                  <MenuItem value="lb">libra (lb)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Cantidad de bultos"
                type="number"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                inputProps={{ min: 1, step: 1 }}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Metros cúbicos (CBM)"
                type="number"
                value={cbm}
                onChange={(e) => {
                  setCbm(e.target.value);
                  setCbmManual(true);
                }}
                inputProps={{ min: 0, step: 0.0001 }}
                helperText={
                  cbmManual
                    ? 'Valor capturado manualmente. Limpia este campo para volver a calcular desde las dimensiones.'
                    : 'Se calcula automáticamente con longitud × ancho × altura. También puedes escribirlo directamente.'
                }
                InputProps={{
                  endAdornment: cbmManual ? (
                    <Button
                      size="small"
                      onClick={() => {
                        setCbmManual(false);
                        setCbm('');
                      }}
                    >
                      Auto
                    </Button>
                  ) : null,
                }}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Alert severity="info" icon={<TableIcon />} sx={{ mb: 1 }}>
                Categoría <b>Genérico</b>. Si tu CBM total es ≤ 0.75 m³ se aplica automáticamente la tarifa <b>StartUp</b>.
              </Alert>
              {maritimeTiers.length > 0 && (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: 'grey.100' }}>
                        <TableCell><b>Categoría</b></TableCell>
                        <TableCell align="right"><b>Desde (CBM)</b></TableCell>
                        <TableCell align="right"><b>Hasta (CBM)</b></TableCell>
                        <TableCell align="right"><b>Precio USD</b></TableCell>
                        <TableCell><b>Tipo</b></TableCell>
                        <TableCell><b>Notas</b></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {maritimeTiers.map((t, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Chip
                              size="small"
                              label={t.category}
                              color={t.category === 'StartUp' ? 'warning' : 'primary'}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell align="right">{Number(t.min_cbm).toFixed(4)}</TableCell>
                          <TableCell align="right">{t.max_cbm == null ? '∞' : Number(t.max_cbm).toFixed(4)}</TableCell>
                          <TableCell align="right"><b>${Number(t.price).toFixed(2)}</b></TableCell>
                          <TableCell>{t.is_flat_fee ? 'Precio fijo' : 'Por CBM'}</TableCell>
                          <TableCell>{t.notes || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Grid>
          </Grid>
        )}
        
        {/* Aéreo - requiere peso y dimensiones */}
        {selectedService === 'aereo' && (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <FormControl fullWidth>
                <InputLabel>Tipo de servicio aéreo</InputLabel>
                <Select
                  value={airSubservice}
                  label="Tipo de servicio aéreo"
                  onChange={(e) => setAirSubservice(e.target.value as 'tdi_aereo' | 'tdi_express')}
                >
                  <MenuItem value="tdi_aereo">✈️ TDI Aéreo · 10-15 días</MenuItem>
                  <MenuItem value="tdi_express">🚀 TDI Express · 7-10 días</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Ingresa el peso real y las dimensiones:
              </Typography>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Peso (kg)"
                type="number"
                value={peso}
                onChange={(e) => setPeso(e.target.value)}
                inputProps={{ min: 0, step: 0.1 }}
              />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField
                fullWidth
                label="Largo (cm)"
                type="number"
                value={largo}
                onChange={(e) => setLargo(e.target.value)}
                inputProps={{ min: 0, step: 1 }}
              />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField
                fullWidth
                label="Ancho (cm)"
                type="number"
                value={ancho}
                onChange={(e) => setAncho(e.target.value)}
                inputProps={{ min: 0, step: 1 }}
              />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField
                fullWidth
                label="Alto (cm)"
                type="number"
                value={alto}
                onChange={(e) => setAlto(e.target.value)}
                inputProps={{ min: 0, step: 1 }}
              />
            </Grid>
          </Grid>
        )}
        
        {/* PO Box - dimensiones */}
        {selectedService === 'pobox' && (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Ingresa las dimensiones del paquete en centímetros:
              </Typography>
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField
                fullWidth
                label="Largo (cm)"
                type="number"
                value={largo}
                onChange={(e) => setLargo(e.target.value)}
                inputProps={{ min: 0, step: 1 }}
              />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField
                fullWidth
                label="Ancho (cm)"
                type="number"
                value={ancho}
                onChange={(e) => setAncho(e.target.value)}
                inputProps={{ min: 0, step: 1 }}
              />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField
                fullWidth
                label="Alto (cm)"
                type="number"
                value={alto}
                onChange={(e) => setAlto(e.target.value)}
                inputProps={{ min: 0, step: 1 }}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Cantidad de paquetes"
                type="number"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                inputProps={{ min: 1, step: 1 }}
              />
            </Grid>
          </Grid>
        )}
        
        {/* DHL - peso, dimensiones y tipo de servicio */}
        {selectedService === 'dhl' && (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <Alert severity="info" sx={{ mb: 1 }}>
                <Typography variant="body2">
                  📦 <strong>Límite DHL:</strong> Máximo 40 kg por caja. Para embarques mayores, usa Aéreo China.
                </Typography>
              </Alert>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControl fullWidth>
                <InputLabel>Tipo de Servicio</InputLabel>
                <Select
                  value={dhlTipo}
                  label="Tipo de Servicio"
                  onChange={(e) => setDhlTipo(e.target.value)}
                >
                  <MenuItem value="standard">Estándar</MenuItem>
                  <MenuItem value="high_value">Alto Valor</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField
                fullWidth
                label="Largo (cm)"
                type="number"
                value={largo}
                onChange={(e) => setLargo(e.target.value)}
                inputProps={{ min: 0, step: 1 }}
              />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField
                fullWidth
                label="Ancho (cm)"
                type="number"
                value={ancho}
                onChange={(e) => setAncho(e.target.value)}
                inputProps={{ min: 0, step: 1 }}
              />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField
                fullWidth
                label="Alto (cm)"
                type="number"
                value={alto}
                onChange={(e) => setAlto(e.target.value)}
                inputProps={{ min: 0, step: 1 }}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Peso (kg)"
                type="number"
                value={peso}
                onChange={(e) => setPeso(e.target.value)}
                inputProps={{ min: 0, max: 40, step: 0.1 }}
                error={parseFloat(peso) > 40}
                helperText={parseFloat(peso) > 40 ? '⚠️ Excede 40 kg. Usa Aéreo China.' : 'Máximo 40 kg'}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Cantidad de cajas"
                type="number"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                inputProps={{ min: 1, step: 1 }}
              />
            </Grid>
          </Grid>
        )}
        
        <Box sx={{ mt: 3 }}>
          <Alert severity="warning" sx={{ mb: 2 }}>
            ⚠️ Los precios mostrados son referenciales y pueden variar según el <b>tipo de mercancía</b> (genérico, marca registrada, sensible, etc.). El precio final se confirma al evaluar tu envío.
          </Alert>
          <Button
            fullWidth
            variant="contained"
            size="large"
            startIcon={quoteLoading ? <CircularProgress size={20} color="inherit" /> : <CalculateIcon />}
            onClick={handleCalculate}
            disabled={quoteLoading}
            sx={{ py: 1.5, bgcolor: selectedCard?.color }}
          >
            {quoteLoading ? 'Calculando...' : 'Calcular Cotización'}
          </Button>
        </Box>
        
        {quoteError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {quoteError}
          </Alert>
        )}
        
        {quoteResult && (
          <Box sx={{ mt: 3 }}>
            <Alert 
              severity="success" 
              icon={false}
              sx={{ 
                bgcolor: `${selectedCard?.color}10`,
                border: `1px solid ${selectedCard?.color}40`,
              }}
            >
              <Typography variant="h5" sx={{ fontWeight: 'bold', color: selectedCard?.color }}>
                ${quoteResult.precio_usd?.toFixed(2)} USD
              </Typography>
              <Typography variant="body1" sx={{ color: 'text.primary', fontWeight: 'bold' }}>
                ≈ ${Number(quoteResult.precio_mxn || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
              </Typography>
              <Divider sx={{ my: 1 }} />
              {quoteResult.cbm && (
                <Typography variant="body2" color="text.secondary">
                  Volumen: {quoteResult.cbm.toFixed(4)} CBM
                </Typography>
              )}
              {quoteResult.peso_kg && (
                <Typography variant="body2" color="text.secondary">
                  Peso: {quoteResult.peso_kg.toFixed(2)} kg
                </Typography>
              )}
              {quoteResult.peso_lb && (
                <Typography variant="body2" color="text.secondary">
                  Peso: {quoteResult.peso_lb.toFixed(2)} lb
                </Typography>
              )}
              {quoteResult.detalles && (
                <Typography variant="body2" color="text.secondary">
                  {quoteResult.detalles}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Tipo de cambio: ${quoteResult.tipo_cambio?.toFixed(2)} MXN/USD
              </Typography>
            </Alert>
          </Box>
        )}
      </Paper>
    );
  };
  
  const renderReferenceRates = () => {
    if (!rates) return null;
    
    return (
      <Paper elevation={1} sx={{ p: 3, mt: 4 }}>
        <Typography variant="h6" gutterBottom>
          Tarifas de Referencia
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Precios base por servicio (pueden variar según categoría y volumen)
        </Typography>
        
        <Grid container spacing={2}>
          {rates.servicios.map((servicio) => {
            const card = serviceCards.find(s => s.id === servicio.id);
            return (
              <Grid size={{ xs: 12, sm: 6 }} key={servicio.id}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Box sx={{ color: card?.color, mr: 1, display: 'flex' }}>
                        {card?.icon && <Box sx={{ width: 24, height: 24 }}>{servicio.icono}</Box>}
                      </Box>
                      <Typography variant="subtitle1" fontWeight="bold">
                        {servicio.nombre}
                      </Typography>
                    </Box>
                    <Chip 
                      label={`$${servicio.precio_base_usd?.toFixed(2)}/${servicio.unidad}`}
                      size="small"
                      sx={{ mr: 0.5, mb: 0.5 }}
                      color="primary"
                    />
                    <Chip 
                      label={servicio.tiempo_estimado}
                      size="small"
                      sx={{ mr: 0.5, mb: 0.5 }}
                      variant="outlined"
                    />
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                      {servicio.notas}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
        
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          * Tipo de cambio actual: ${Number(rates.tipo_cambio || 0).toFixed(4)} MXN/USD
        </Typography>
      </Paper>
    );
  };

  return (
    <Box sx={{ 
      minHeight: '100vh', 
      bgcolor: '#f5f5f5',
      py: 4,
    }}>
      <Container maxWidth="lg">
        {/* Header con Logo */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <img 
            src="/entregax-logo.png" 
            alt="EntregaX" 
            style={{ 
              maxWidth: isMobile ? 200 : 280, 
              height: 'auto',
              marginBottom: 16,
            }} 
          />
          <Typography 
            variant={isMobile ? 'h5' : 'h4'} 
            fontWeight="bold" 
            gutterBottom
          >
            Cotizador de Envíos
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Calcula el costo de tu envío en segundos
          </Typography>
        </Box>
        
        {loading ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <CircularProgress size={48} />
            <Typography sx={{ mt: 2 }}>Cargando tarifas...</Typography>
          </Box>
        ) : error ? (
          <Alert 
            severity="error" 
            action={
              <Button color="inherit" size="small" onClick={loadRates}>
                <RefreshIcon sx={{ mr: 0.5 }} /> Reintentar
              </Button>
            }
          >
            {error}
          </Alert>
        ) : (
          <>
            {/* Selección de Servicio */}
            <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
              1. Selecciona el tipo de servicio
            </Typography>
            
            <Grid container spacing={2}>
              {serviceCards.map((service) => (
                <Grid size={{ xs: 6, md: 3 }} key={service.id}>
                  <Card 
                    sx={{ 
                      height: '100%',
                      border: selectedService === service.id 
                        ? `2px solid ${service.color}` 
                        : '2px solid transparent',
                      transition: 'all 0.2s',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: 4,
                      },
                    }}
                  >
                    <CardActionArea 
                      onClick={() => handleServiceSelect(service.id as ServiceType)}
                      sx={{ height: '100%', p: 2 }}
                    >
                      <Box sx={{ 
                        textAlign: 'center',
                        color: selectedService === service.id ? service.color : 'text.primary',
                      }}>
                        <Box sx={{ 
                          bgcolor: `${service.color}20`, 
                          color: service.color,
                          borderRadius: 2,
                          p: 1.5,
                          display: 'inline-flex',
                          mb: 1,
                        }}>
                          {service.icon}
                        </Box>
                        <Typography variant="subtitle1" fontWeight="bold">
                          {service.title}
                        </Typography>
                        {!isMobile && (
                          <Typography variant="caption" color="text.secondary">
                            {service.description}
                          </Typography>
                        )}
                      </Box>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
            
            {/* Formulario de Cotización */}
            {selectedService && (
              <>
                <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>
                  2. Ingresa los detalles
                </Typography>
                {renderServiceForm()}
              </>
            )}
            
            {/* Tarifas de Referencia */}
            {renderReferenceRates()}
            
            {/* Footer */}
            <Box sx={{ textAlign: 'center', mt: 4, pb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                ¿Tienes dudas? Contáctanos
              </Typography>
              <Button 
                href="https://wa.me/528118012741" 
                target="_blank"
                variant="contained"
                color="success"
                sx={{ mt: 1 }}
              >
                WhatsApp
              </Button>
            </Box>
          </>
        )}
      </Container>
    </Box>
  );
}
