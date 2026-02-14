import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Paper, TextField, Button, Grid, Card, CardContent,
  FormControl, InputLabel, Select, MenuItem, type SelectChangeEvent,
  Divider, Alert, Chip, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Tooltip, InputAdornment, Fade,
} from '@mui/material';
import CalculateIcon from '@mui/icons-material/Calculate';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ScaleIcon from '@mui/icons-material/Scale';
import SquareFootIcon from '@mui/icons-material/SquareFoot';
import RefreshIcon from '@mui/icons-material/Refresh';
import PrintIcon from '@mui/icons-material/Print';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HistoryIcon from '@mui/icons-material/History';
import DeleteIcon from '@mui/icons-material/Delete';

const ORANGE = '#F05A28';
const BLACK = '#111111';

// Tarifas por zona en PESOS MEXICANOS (MXN) por kg
const ZONE_RATES: Record<string, Record<string, number>> = {
  'USA-MX-Norte': { base: 150, perKg: 65, minWeight: 0.5 },
  'USA-MX-Centro': { base: 180, perKg: 75, minWeight: 0.5 },
  'USA-MX-Sur': { base: 220, perKg: 85, minWeight: 0.5 },
  'USA-MX-Peninsula': { base: 260, perKg: 95, minWeight: 0.5 },
};

// Carriers disponibles
const CARRIERS = ['FedEx', 'UPS', 'DHL', 'Estafeta', 'Redpack', 'Paquetexpress', 'JT Express', 'CEDIS MTY'];

interface QuoteResult {
  id: string;
  date: string;
  origin: string;
  destination: string;
  zone: string;
  weight: number;
  volumetricWeight: number;
  chargeableWeight: number;
  dimensions: string;
  carrier: string;
  basePrice: number;
  weightCharge: number;
  subtotal: number;
  insurance: number;
  fuelSurcharge: number;
  total: number;
}

interface QuotesPageProps {
  // Props if needed
}

export default function QuotesPage({}: QuotesPageProps) {
  const { t, i18n } = useTranslation();
  
  // Form state
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [declaredValue, setDeclaredValue] = useState('');
  const [zone, setZone] = useState('USA-MX-Norte');
  const [carrier, setCarrier] = useState('CEDIS MTY');
  
  // Results
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [history, setHistory] = useState<QuoteResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const calculateQuote = () => {
    const w = parseFloat(weight) || 0;
    const l = parseFloat(length) || 0;
    const wd = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    const dv = parseFloat(declaredValue) || 0;
    
    if (w <= 0) return;
    
    // Volumetric weight (L x W x H / 5000)
    const volumetricWeight = (l * wd * h) / 5000;
    const chargeableWeight = Math.max(w, volumetricWeight);
    
    // Get zone rates
    const rates = ZONE_RATES[zone] || ZONE_RATES['USA-MX-Norte'];
    
    // Calculate prices (all in MXN)
    const basePrice = rates.base;
    const weightCharge = Math.max(chargeableWeight - rates.minWeight, 0) * rates.perKg;
    const subtotal = basePrice + weightCharge;
    
    // Insurance (3% of declared value in MXN, min $35 MXN)
    const insurance = dv > 0 ? Math.max(dv * 0.03, 35) : 0;
    
    // Fuel surcharge (15%)
    const fuelSurcharge = subtotal * 0.15;
    
    // Total in MXN
    const total = subtotal + insurance + fuelSurcharge;
    
    const newQuote: QuoteResult = {
      id: `COT-${Date.now()}`,
      date: new Date().toISOString(),
      origin: 'USA',
      destination: zone.split('-')[1] + ' ' + zone.split('-')[2],
      zone,
      weight: w,
      volumetricWeight: Math.round(volumetricWeight * 100) / 100,
      chargeableWeight: Math.round(chargeableWeight * 100) / 100,
      dimensions: l && wd && h ? `${l}×${wd}×${h} cm` : '-',
      carrier,
      basePrice,
      weightCharge: Math.round(weightCharge * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      insurance: Math.round(insurance * 100) / 100,
      fuelSurcharge: Math.round(fuelSurcharge * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
    
    setQuote(newQuote);
    setHistory(prev => [newQuote, ...prev.slice(0, 9)]); // Keep last 10
  };

  const resetForm = () => {
    setWeight('');
    setLength('');
    setWidth('');
    setHeight('');
    setDeclaredValue('');
    setZone('USA-MX-Norte');
    setCarrier('CEDIS MTY');
    setQuote(null);
  };

  const copyQuote = () => {
    if (!quote) return;
    const text = `${t('quotes.quoteId')}: ${quote.id}
${t('quotes.carrier')}: ${quote.carrier}
${t('quotes.zone')}: ${quote.zone}
${t('quotes.weight')}: ${quote.chargeableWeight} kg
${t('quotes.total')}: $${quote.total.toLocaleString()} MXN`;
    navigator.clipboard.writeText(text);
  };

  const printQuote = () => {
    if (!quote) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Cotización ${quote.id}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { font-size: 28px; font-weight: bold; color: #F05A28; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background: #f5f5f5; }
            .total { font-size: 24px; text-align: right; margin-top: 20px; }
            .footer { margin-top: 40px; text-align: center; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">🚚 EntregaX</div>
            <h2>${t('quotes.quoteTitle')}</h2>
            <p>${quote.id} - ${new Date(quote.date).toLocaleDateString(i18n.language === 'es' ? 'es-MX' : 'en-US')}</p>
          </div>
          <table>
            <tr><th>${t('quotes.carrier')}</th><td>${quote.carrier}</td></tr>
            <tr><th>${t('quotes.zone')}</th><td>${quote.zone}</td></tr>
            <tr><th>${t('quotes.realWeight')}</th><td>${quote.weight} kg</td></tr>
            <tr><th>${t('quotes.volumetricWeight')}</th><td>${quote.volumetricWeight} kg</td></tr>
            <tr><th>${t('quotes.chargeableWeight')}</th><td><strong>${quote.chargeableWeight} kg</strong></td></tr>
            <tr><th>${t('quotes.dimensions')}</th><td>${quote.dimensions}</td></tr>
          </table>
          <table>
            <tr><th>${t('quotes.basePrice')}</th><td>$${quote.basePrice.toLocaleString()} MXN</td></tr>
            <tr><th>${t('quotes.weightCharge')}</th><td>$${quote.weightCharge.toLocaleString()} MXN</td></tr>
            <tr><th>${t('quotes.insurance')}</th><td>$${quote.insurance.toLocaleString()} MXN</td></tr>
            <tr><th>${t('quotes.fuelSurcharge')}</th><td>$${quote.fuelSurcharge.toLocaleString()} MXN</td></tr>
          </table>
          <div class="total">
            <strong>${t('quotes.total')}: $${quote.total.toLocaleString()} MXN</strong>
          </div>
          <div class="footer">
            <p>${t('quotes.validityNote')}</p>
            <p>EntregaX - ${new Date().toLocaleDateString()}</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const zones = [
    { value: 'USA-MX-Norte', label: i18n.language === 'es' ? 'México Norte (MTY, Chihuahua, Tijuana)' : 'Mexico North (MTY, Chihuahua, Tijuana)' },
    { value: 'USA-MX-Centro', label: i18n.language === 'es' ? 'México Centro (CDMX, GDL, Querétaro)' : 'Mexico Central (CDMX, GDL, Querétaro)' },
    { value: 'USA-MX-Sur', label: i18n.language === 'es' ? 'México Sur (Oaxaca, Veracruz, Chiapas)' : 'Mexico South (Oaxaca, Veracruz, Chiapas)' },
    { value: 'USA-MX-Peninsula', label: i18n.language === 'es' ? 'Península (Cancún, Mérida)' : 'Peninsula (Cancun, Merida)' },
  ];

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: BLACK, display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalculateIcon sx={{ color: ORANGE }} /> {t('quotes.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('quotes.subtitle')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title={t('quotes.history')}>
            <IconButton onClick={() => setShowHistory(!showHistory)} sx={{ color: showHistory ? ORANGE : 'inherit' }}>
              <HistoryIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('common.refresh')}>
            <IconButton onClick={resetForm}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Calculator Form */}
        <Grid size={{ xs: 12, md: showHistory ? 6 : 7 }}>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid #e0e0e0', borderRadius: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <LocalShippingIcon sx={{ color: ORANGE }} /> {t('quotes.shipmentData')}
            </Typography>

            <Grid container spacing={2} sx={{ mt: 1 }}>
              {/* Carrier */}
              <Grid size={12}>
                <FormControl fullWidth>
                  <InputLabel>{t('quotes.carrier')}</InputLabel>
                  <Select value={carrier} label={t('quotes.carrier')} onChange={(e: SelectChangeEvent) => setCarrier(e.target.value)}>
                    {CARRIERS.map((c) => (
                      <MenuItem key={c} value={c}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <LocalShippingIcon sx={{ color: ORANGE, fontSize: 20 }} />
                          <span>{c}</span>
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Zone */}
              <Grid size={12}>
                <FormControl fullWidth>
                  <InputLabel>{t('quotes.zone')}</InputLabel>
                  <Select value={zone} label={t('quotes.zone')} onChange={(e: SelectChangeEvent) => setZone(e.target.value)}>
                    {zones.map((z) => (
                      <MenuItem key={z.value} value={z.value}>{z.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid size={12}>
                <Divider><Chip label={t('quotes.weightDimensions')} icon={<ScaleIcon />} size="small" /></Divider>
              </Grid>

              {/* Weight */}
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label={t('quotes.weight')}
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><ScaleIcon /></InputAdornment>,
                    endAdornment: <InputAdornment position="end">kg</InputAdornment>
                  }}
                  inputProps={{ step: 0.1, min: 0 }}
                  required
                />
              </Grid>

              {/* Declared Value */}
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label={t('quotes.declaredValue')}
                  type="number"
                  value={declaredValue}
                  onChange={(e) => setDeclaredValue(e.target.value)}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                    endAdornment: <InputAdornment position="end">MXN</InputAdornment>
                  }}
                  helperText={t('quotes.insuranceNote')}
                />
              </Grid>

              {/* Dimensions */}
              <Grid size={{ xs: 4 }}>
                <TextField
                  fullWidth
                  label={t('quotes.length')}
                  type="number"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }}
                />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <TextField
                  fullWidth
                  label={t('quotes.width')}
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }}
                />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <TextField
                  fullWidth
                  label={t('quotes.height')}
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }}
                />
              </Grid>

              {/* Calculate Button */}
              <Grid size={12}>
                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  startIcon={<CalculateIcon />}
                  onClick={calculateQuote}
                  disabled={!weight || parseFloat(weight) <= 0}
                  sx={{
                    background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)`,
                    py: 1.5,
                    fontSize: 16,
                    fontWeight: 'bold',
                  }}
                >
                  {t('quotes.calculate')}
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Quote Result */}
        <Grid size={{ xs: 12, md: showHistory ? 3 : 5 }}>
          {quote ? (
            <Fade in={true}>
              <Card elevation={3} sx={{ border: `2px solid ${ORANGE}`, borderRadius: 3, overflow: 'hidden' }}>
                <Box sx={{ bgcolor: BLACK, color: 'white', p: 2, textAlign: 'center' }}>
                  <Typography variant="h6">{t('quotes.quoteTitle')}</Typography>
                  <Chip label={quote.id} size="small" sx={{ bgcolor: ORANGE, color: 'white', mt: 1 }} />
                </Box>
                <CardContent>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">{t('quotes.carrier')}</Typography>
                    <Typography variant="h6">{quote.carrier}</Typography>
                  </Box>
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <Grid container spacing={1}>
                    <Grid size={6}>
                      <Typography variant="body2" color="text.secondary">{t('quotes.realWeight')}</Typography>
                      <Typography fontWeight="bold">{quote.weight} kg</Typography>
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="body2" color="text.secondary">{t('quotes.volumetricWeight')}</Typography>
                      <Typography fontWeight="bold">{quote.volumetricWeight} kg</Typography>
                    </Grid>
                    <Grid size={12}>
                      <Alert severity="info" sx={{ mt: 1, py: 0 }}>
                        {t('quotes.chargeableWeight')}: <strong>{quote.chargeableWeight} kg</strong>
                      </Alert>
                    </Grid>
                  </Grid>

                  <Divider sx={{ my: 2 }} />

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">{t('quotes.basePrice')}</Typography>
                    <Typography>${quote.basePrice.toLocaleString()}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">{t('quotes.weightCharge')}</Typography>
                    <Typography>${quote.weightCharge.toLocaleString()}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">{t('quotes.insurance')}</Typography>
                    <Typography>${quote.insurance.toLocaleString()}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="body2">{t('quotes.fuelSurcharge')}</Typography>
                    <Typography>${quote.fuelSurcharge.toLocaleString()}</Typography>
                  </Box>

                  <Divider />

                  <Box sx={{ textAlign: 'center', mt: 2 }}>
                    <Typography variant="h4" fontWeight="bold" sx={{ color: ORANGE }}>
                      ${quote.total.toLocaleString()} MXN
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1, mt: 3 }}>
                    <Button fullWidth variant="outlined" startIcon={<ContentCopyIcon />} onClick={copyQuote}>
                      {t('quotes.copy')}
                    </Button>
                    <Button fullWidth variant="contained" startIcon={<PrintIcon />} onClick={printQuote}
                      sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` }}>
                      {t('quotes.print')}
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Fade>
          ) : (
            <Paper elevation={0} sx={{ p: 4, textAlign: 'center', border: '2px dashed #e0e0e0', borderRadius: 3, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <CalculateIcon sx={{ fontSize: 60, color: 'grey.300', mb: 2 }} />
              <Typography variant="h6" color="text.secondary">{t('quotes.noQuoteYet')}</Typography>
              <Typography variant="body2" color="text.secondary">{t('quotes.fillFormToQuote')}</Typography>
            </Paper>
          )}
        </Grid>

        {/* History */}
        {showHistory && (
          <Grid size={{ xs: 12, md: 3 }}>
            <Paper elevation={0} sx={{ border: '1px solid #e0e0e0', borderRadius: 3, overflow: 'hidden' }}>
              <Box sx={{ bgcolor: 'grey.100', p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  <HistoryIcon sx={{ fontSize: 18, mr: 1, verticalAlign: 'middle' }} />
                  {t('quotes.history')}
                </Typography>
                <IconButton size="small" onClick={() => setHistory([])}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
              <TableContainer sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('quotes.zone')}</TableCell>
                      <TableCell align="right">{t('quotes.total')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {history.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                          {t('quotes.noHistory')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      history.map((h) => (
                        <TableRow key={h.id} hover sx={{ cursor: 'pointer' }} onClick={() => setQuote(h)}>
                          <TableCell>
                            <Typography variant="body2" fontWeight="bold">{h.chargeableWeight} kg</Typography>
                            <Typography variant="caption" color="text.secondary">{h.zone}</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight="bold" sx={{ color: ORANGE }}>${h.total.toLocaleString()}</Typography>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* Info Cards */}
      <Grid container spacing={2} sx={{ mt: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card sx={{ bgcolor: '#fff3e0', border: 'none' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <SquareFootIcon sx={{ fontSize: 30, color: ORANGE }} />
              <Typography variant="h6">{t('quotes.volumetricFormula')}</Typography>
              <Typography variant="body2" color="text.secondary">L × W × H ÷ 5000</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card sx={{ bgcolor: '#e8f5e9', border: 'none' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <ScaleIcon sx={{ fontSize: 30, color: '#388e3c' }} />
              <Typography variant="h6">{t('quotes.minWeight')}</Typography>
              <Typography variant="body2" color="text.secondary">0.5 kg</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card sx={{ bgcolor: '#fce4ec', border: 'none' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <LocalShippingIcon sx={{ fontSize: 30, color: '#c2185b' }} />
              <Typography variant="h6">{t('quotes.fuelSurchargeRate')}</Typography>
              <Typography variant="body2" color="text.secondary">15%</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
