// ============================================
// PANEL API PAQUETE EXPRESS
// Gestión de envíos nacionales via Paquete Express
// Cotización, Generación de guías, Etiquetas, Cancelación, Trazabilidad
// ============================================

import { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Chip,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Send as SendIcon,
  LocalShipping as ShippingIcon,
  Cancel as CancelIcon,
  Search as SearchIcon,
  Print as PrintIcon,
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon,
  CheckCircle as CheckIcon,
  Settings as SettingsIcon,
  Calculate as CalculateIcon,
  QrCode as QrCodeIcon,
  Timeline as TimelineIcon,
} from '@mui/icons-material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const PQTX_COLOR = '#E65100'; // Naranja Paquete Express

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
export default function PaqueteExpressPage() {
  const [activeTab, setActiveTab] = useState(0);
  const token = localStorage.getItem('token');

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ShippingIcon sx={{ fontSize: 40, color: PQTX_COLOR }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">
                Paquete Express</Typography>
            <Typography variant="body2" color="text.secondary">
              Cotización, generación de guías, impresión y trazabilidad
            </Typography>
          </Box>
        </Box>
        <Chip label="QA (Testing)" color="warning" variant="outlined" size="small" />
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{
          mb: 3,
          '& .MuiTab-root': { fontWeight: 600 },
          '& .Mui-selected': { color: PQTX_COLOR },
          '& .MuiTabs-indicator': { backgroundColor: PQTX_COLOR },
        }}
      >
        <Tab icon={<SettingsIcon />} label="Configuración" iconPosition="start" />
        <Tab icon={<CalculateIcon />} label="Cotizador" iconPosition="start" />
        <Tab icon={<SendIcon />} label="Generar Envío" iconPosition="start" />
        <Tab icon={<PrintIcon />} label="Etiquetas" iconPosition="start" />
        <Tab icon={<CancelIcon />} label="Cancelaciones" iconPosition="start" />
        <Tab icon={<TimelineIcon />} label="Trazabilidad" iconPosition="start" />
      </Tabs>

      {activeTab === 0 && <ConfigTab token={token} />}
      {activeTab === 1 && <QuoteTab token={token} />}
      {activeTab === 2 && <ShipmentTab token={token} />}
      {activeTab === 3 && <LabelTab token={token} />}
      {activeTab === 4 && <CancelTab token={token} />}
      {activeTab === 5 && <TrackingTab token={token} />}
    </Box>
  );
}

// ============================================
// TAB 0: CONFIGURACIÓN
// ============================================
function ConfigTab({ token }: { token: string | null }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [loginResult, setLoginResult] = useState<any>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/paquete-express/config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setConfig(data.config);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const testLogin = async () => {
    setLoading(true);
    setLoginResult(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/paquete-express/login`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      setLoginResult(data);
    } catch (err) {
      setLoginResult({ success: false, error: String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        {/* Credenciales de Cotización */}
        <Card sx={{ border: '1px solid #e0e0e0' }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" gutterBottom>🔑 Credenciales Cotización</Typography>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'grid', gap: 1, mt: 2 }}>
              {[
                ['Usuario:', 'WSQURBANWOD'],
                ['Password:', '1234'],
                ['Type:', '1'],
              ].map(([label, val]) => (
                <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">{label}</Typography>
                  <Typography variant="body2" fontWeight="bold" fontFamily="monospace">{val}</Typography>
                </Box>
              ))}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">Token:</Typography>
                <Typography variant="body2" fontWeight="bold" fontFamily="monospace" sx={{ fontSize: 11 }}>
                  4DB7391907B749C5E063350AA8C0215D
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Credenciales de Operaciones */}
        <Card sx={{ border: '1px solid #e0e0e0' }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" gutterBottom>🔐 Credenciales Operaciones</Typography>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'grid', gap: 1, mt: 2 }}>
              {[
                ['Usuario:', 'WSQURBANWOD'],
                ['Password (B64):', 'UWEyNzczNjI1MCQ='],
                ['Bill Client ID:', '27736250'],
              ].map(([label, val]) => (
                <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">{label}</Typography>
                  <Typography variant="body2" fontWeight="bold" fontFamily="monospace">{val}</Typography>
                </Box>
              ))}
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Ambiente:</Typography>
                <Chip label="QA" size="small" color="warning" />
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Estado de conexión */}
      <Card sx={{ border: '1px solid #e0e0e0', mt: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" gutterBottom>⚡ Estado de Conexión</Typography>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            <Button variant="outlined" onClick={fetchConfig}
              startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />} disabled={loading}>
              Verificar Config
            </Button>
            <Button variant="contained" onClick={testLogin}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
              disabled={loading} sx={{ bgcolor: PQTX_COLOR, '&:hover': { bgcolor: '#BF360C' } }}>
              Test Login (obtener JWT)
            </Button>
          </Box>

          {config && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <strong>Base URL:</strong> {config.baseUrl}<br />
              <strong>Usuario:</strong> {config.user}<br />
              <strong>Cuenta:</strong> {config.billClientId}<br />
              <strong>Ambiente:</strong> {config.environment}<br />
              <strong>Token cacheado:</strong> {config.hasToken ? '✅ Sí' : '❌ No'}
            </Alert>
          )}

          {loginResult && (
            <Alert severity={loginResult.success ? 'success' : 'error'} sx={{ mt: 2 }}>
              {loginResult.success ? (
                <>
                  <strong>✅ Login exitoso</strong><br />
                  <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all', mt: 1 }}>
                    Token: {loginResult.token?.substring(0, 50)}...
                  </Typography>
                </>
              ) : (
                <><strong>❌ Error:</strong> {loginResult.error}</>
              )}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Endpoints disponibles */}
      <Card sx={{ border: '1px solid #e0e0e0', mt: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" gutterBottom>📋 Endpoints Disponibles</Typography>
          <Divider sx={{ my: 1 }} />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Servicio</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Método</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>URL PQTX</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[
                  { svc: 'Login', method: 'POST', url: '/RadRestFul/api/rad/loginv1/login' },
                  { svc: 'Cotizador', method: 'POST', url: '/WsQuotePaquetexpress/api/apiQuoter/v2/getQuotation' },
                  { svc: 'Generar Envío', method: 'POST', url: '/RadRestFul/api/rad/v1/guia' },
                  { svc: 'Recolección', method: 'POST', url: '/RadRestFul/api/rad/v1/order' },
                  { svc: 'Cancelar', method: 'POST', url: '/RadRestFul/api/rad/v1/cancelguia' },
                  { svc: 'Trazabilidad', method: 'GET', url: '/ptxws/rest/api/v3/guia/historico/{guia}/{token}' },
                  { svc: 'Etiqueta PDF', method: 'GET', url: '/wsReportPaquetexpress/GenCartaPorte?trackingNoGen={guia}' },
                  { svc: 'Etiqueta ZPL', method: 'POST', url: '/RadRestFul/api/rad/v1/infotrack' },
                ].map((ep, i) => (
                  <TableRow key={i}>
                    <TableCell>{ep.svc}</TableCell>
                    <TableCell>
                      <Chip label={ep.method} size="small" color={ep.method === 'GET' ? 'success' : 'primary'} variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace" fontSize={12}>{ep.url}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
}

// ============================================
// TAB 1: COTIZADOR
// ============================================
function QuoteTab({ token }: { token: string | null }) {
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    originZipCode: '81200', originColony: 'CENTRO',
    destZipCode: '80000', destColony: 'CENTRO',
    weight: '5', length: '30', width: '30', height: '30',
    quantity: '1', declaredValue: '1000',
  });

  const handleQuote = async () => {
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/paquete-express/quote`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originZipCode: form.originZipCode, originColony: form.originColony,
          destZipCode: form.destZipCode, destColony: form.destColony,
          declaredValue: Number(form.declaredValue),
          packages: [{ weight: Number(form.weight), length: Number(form.length), width: Number(form.width), height: Number(form.height), quantity: Number(form.quantity) }],
        }),
      });
      const data = await res.json();
      if (data.success) setResult(data); else setError(data.error || 'Error en cotización');
    } catch (err) { setError(String(err)); } finally { setLoading(false); }
  };

  return (
    <Box>
      <Card sx={{ border: '1px solid #e0e0e0', mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" gutterBottom>📦 Cotizar Envío Paquete Express</Typography>
          <Divider sx={{ my: 1.5 }} />

          {/* Origen */}
          <Typography variant="subtitle2" color="text.secondary" fontWeight="bold" sx={{ mt: 2 }}>📍 Origen</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 1 }}>
            <TextField fullWidth size="small" label="CP Origen" value={form.originZipCode}
              onChange={e => setForm({ ...form, originZipCode: e.target.value })} />
            <TextField fullWidth size="small" label="Colonia Origen" value={form.originColony}
              onChange={e => setForm({ ...form, originColony: e.target.value })} />
          </Box>

          {/* Destino */}
          <Typography variant="subtitle2" color="text.secondary" fontWeight="bold" sx={{ mt: 2 }}>📍 Destino</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 1 }}>
            <TextField fullWidth size="small" label="CP Destino" value={form.destZipCode}
              onChange={e => setForm({ ...form, destZipCode: e.target.value })} />
            <TextField fullWidth size="small" label="Colonia Destino" value={form.destColony}
              onChange={e => setForm({ ...form, destColony: e.target.value })} />
          </Box>

          {/* Paquete */}
          <Typography variant="subtitle2" color="text.secondary" fontWeight="bold" sx={{ mt: 2 }}>📦 Paquete</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr 1fr', md: 'repeat(6, 1fr)' }, gap: 2, mt: 1 }}>
            <TextField fullWidth size="small" label="Peso (kg)" type="number" value={form.weight}
              onChange={e => setForm({ ...form, weight: e.target.value })} />
            <TextField fullWidth size="small" label="Largo (cm)" type="number" value={form.length}
              onChange={e => setForm({ ...form, length: e.target.value })} />
            <TextField fullWidth size="small" label="Ancho (cm)" type="number" value={form.width}
              onChange={e => setForm({ ...form, width: e.target.value })} />
            <TextField fullWidth size="small" label="Alto (cm)" type="number" value={form.height}
              onChange={e => setForm({ ...form, height: e.target.value })} />
            <TextField fullWidth size="small" label="Cantidad" type="number" value={form.quantity}
              onChange={e => setForm({ ...form, quantity: e.target.value })} />
            <TextField fullWidth size="small" label="Valor Decl. ($)" type="number" value={form.declaredValue}
              onChange={e => setForm({ ...form, declaredValue: e.target.value })} />
          </Box>

          <Box sx={{ mt: 2 }}>
            <Button variant="contained" onClick={handleQuote}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <CalculateIcon />}
              disabled={loading} sx={{ bgcolor: PQTX_COLOR, '&:hover': { bgcolor: '#BF360C' } }}>
              Cotizar
            </Button>
          </Box>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {result && (
        <Card sx={{ border: '1px solid #e0e0e0' }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" gutterBottom>💰 Resultados de Cotización</Typography>
            <Divider sx={{ my: 1 }} />
            {Array.isArray(result.quotes) && result.quotes.length > 0 ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold' }}>Servicio</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Nombre</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Entrega Estimada</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Flete</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Servicios</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Subtotal</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">IVA</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Total</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Días</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {result.quotes.map((q: any, i: number) => {
                      const amt = q.amount || {};
                      return (
                        <TableRow key={i} hover>
                          <TableCell><Chip label={q.id || q.serviceType || 'N/A'} size="small" color="primary" /></TableCell>
                          <TableCell>{q.serviceName || '-'}</TableCell>
                          <TableCell sx={{ fontSize: 12 }}>{q.serviceInfoDescr || q.promiseDate || '-'}</TableCell>
                          <TableCell align="right">${Number(amt.shpAmnt || 0).toFixed(2)}</TableCell>
                          <TableCell align="right">${Number(amt.srvcAmnt || 0).toFixed(2)}</TableCell>
                          <TableCell align="right">${Number(amt.subTotlAmnt || 0).toFixed(2)}</TableCell>
                          <TableCell align="right">${Number(amt.taxAmnt || 0).toFixed(2)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold', color: PQTX_COLOR }}>
                            ${Number(amt.totalAmnt || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Chip label={`${q.promiseDateDaysQty ?? '?'} día${q.promiseDateDaysQty !== 1 ? 's' : ''}`}
                              size="small" color={q.promiseDateDaysQty === 0 ? 'success' : q.promiseDateDaysQty <= 1 ? 'info' : 'default'} variant="outlined" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Box component="pre" sx={{ mt: 1, p: 2, bgcolor: '#f5f5f5', borderRadius: 1, overflow: 'auto', maxHeight: 400, fontSize: 12, fontFamily: 'monospace' }}>
                {JSON.stringify(result.raw || result, null, 2)}
              </Box>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

// ============================================
// TAB 2: GENERAR ENVÍO
// ============================================
function ShipmentTab({ token }: { token: string | null }) {
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    originState: 'NUEVO LEON', originMunicipality: 'MONTERREY', originCity: 'MONTERREY',
    originColony: 'CENTRO', originZipCode: '64000', originStreet: 'REVOLUCION SUR',
    originNumber: '3866', originPhone: '8112345678', originName: 'ENTREGAX LOGISTICA',
    originEmail: 'operaciones@entregax.com', originContact: 'OPERACIONES ENTREGAX',
    destColony: 'CENTRO', destZipCode: '06000', destStreet: 'AV REFORMA',
    destNumber: '100', destPhone: '5512345678', destName: 'CLIENTE DESTINO',
    destEmail: 'cliente@email.com', destContact: 'CLIENTE',
    weight: '5', length: '30', width: '30', height: '30', content: 'PAQUETE GENERAL',
    quantity: '1', serviceType: 'STD-T', reference: '', comment: '',
  });

  const handleCreate = async () => {
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/paquete-express/shipment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          packages: [{ weight: Number(form.weight), length: Number(form.length), width: Number(form.width), height: Number(form.height), content: form.content, quantity: Number(form.quantity) }],
        }),
      });
      const data = await res.json();
      if (data.success) setResult(data); else setError(data.error || 'Error al generar envío');
    } catch (err) { setError(String(err)); } finally { setLoading(false); }
  };

  const F = (label: string, field: string) => (
    <TextField fullWidth size="small" label={label}
      value={(form as Record<string, string>)[field]}
      onChange={e => setForm({ ...form, [field]: e.target.value })} />
  );

  return (
    <Box>
      <Card sx={{ border: '1px solid #e0e0e0', mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" gutterBottom>📤 Generar Guía Paquete Express</Typography>
          <Divider sx={{ my: 1.5 }} />

          {/* Origen */}
          <Typography variant="subtitle2" fontWeight="bold" sx={{ bgcolor: '#FFF3E0', p: 1, borderRadius: 1, mt: 2 }}>
            📍 Dirección de Origen
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mt: 1 }}>
            {F('Estado', 'originState')}
            {F('Municipio', 'originMunicipality')}
            {F('Ciudad', 'originCity')}
            {F('Colonia', 'originColony')}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: 2, mt: 1 }}>
            {F('CP', 'originZipCode')}
            {F('Calle', 'originStreet')}
            {F('Número', 'originNumber')}
            {F('Teléfono', 'originPhone')}
            {F('Nombre', 'originName')}
          </Box>

          {/* Destino */}
          <Typography variant="subtitle2" fontWeight="bold" sx={{ bgcolor: '#E3F2FD', p: 1, borderRadius: 1, mt: 2 }}>
            📍 Dirección de Destino
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mt: 1 }}>
            {F('Colonia', 'destColony')}
            {F('CP', 'destZipCode')}
            {F('Calle', 'destStreet')}
            {F('Número', 'destNumber')}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mt: 1 }}>
            {F('Teléfono', 'destPhone')}
            {F('Nombre Destino', 'destName')}
            {F('Email', 'destEmail')}
            {F('Contacto', 'destContact')}
          </Box>

          {/* Paquete */}
          <Typography variant="subtitle2" fontWeight="bold" sx={{ bgcolor: '#FBE9E7', p: 1, borderRadius: 1, mt: 2 }}>
            📦 Detalle del Paquete
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr 1fr', md: 'repeat(6, 1fr)' }, gap: 2, mt: 1 }}>
            <TextField fullWidth size="small" label="Peso (kg)" type="number" value={form.weight}
              onChange={e => setForm({ ...form, weight: e.target.value })} />
            <TextField fullWidth size="small" label="Largo (cm)" type="number" value={form.length}
              onChange={e => setForm({ ...form, length: e.target.value })} />
            <TextField fullWidth size="small" label="Ancho (cm)" type="number" value={form.width}
              onChange={e => setForm({ ...form, width: e.target.value })} />
            <TextField fullWidth size="small" label="Alto (cm)" type="number" value={form.height}
              onChange={e => setForm({ ...form, height: e.target.value })} />
            <TextField fullWidth size="small" label="Cantidad" type="number" value={form.quantity}
              onChange={e => setForm({ ...form, quantity: e.target.value })} />
            {F('Contenido', 'content')}
          </Box>

          {/* Config */}
          <Typography variant="subtitle2" fontWeight="bold" sx={{ bgcolor: '#E8F5E9', p: 1, borderRadius: 1, mt: 2 }}>
            ⚙️ Configuración de Envío
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 2fr' }, gap: 2, mt: 1 }}>
            <TextField fullWidth size="small" label="Tipo de Servicio" select
              slotProps={{ select: { native: true } }}
              value={form.serviceType} onChange={e => setForm({ ...form, serviceType: e.target.value })}>
              <option value="STD-T">STD-T (Estándar Terrestre)</option>
              <option value="ECO-T">ECO-T (Económico)</option>
              <option value="EXP-T">EXP-T (Express)</option>
            </TextField>
            {F('Referencia', 'reference')}
            {F('Comentario / Factura', 'comment')}
          </Box>

          <Box sx={{ mt: 2 }}>
            <Button variant="contained" onClick={handleCreate} size="large"
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
              disabled={loading} sx={{ bgcolor: PQTX_COLOR, '&:hover': { bgcolor: '#BF360C' } }}>
              Generar Guía
            </Button>
          </Box>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {result && (
        <Card sx={{ border: `2px solid ${result.success ? '#4CAF50' : '#F44336'}` }}>
          <CardContent>
            <Alert severity="success" sx={{ mb: 2 }}>
              <Typography variant="h6">✅ Guía Generada Exitosamente</Typography>
            </Alert>
            {result.trackingNumber && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, p: 2, bgcolor: '#FFF3E0', borderRadius: 2, flexWrap: 'wrap' }}>
                <Typography variant="h5" fontWeight="bold" fontFamily="monospace" color={PQTX_COLOR}>
                  {result.trackingNumber}
                </Typography>
                <Tooltip title="Copiar número de guía">
                  <IconButton onClick={() => navigator.clipboard.writeText(result.trackingNumber)} size="small">
                    <CopyIcon />
                  </IconButton>
                </Tooltip>
                <Button variant="outlined" size="small" startIcon={<PrintIcon />}
                  onClick={() => window.open(`${API_URL}/api/admin/paquete-express/label/pdf/${result.trackingNumber}?format=4x6`, '_blank')}>
                  Imprimir Etiqueta
                </Button>
              </Box>
            )}
            {(result.folioPorte || result.additionalData) && (
              <Box sx={{ display: 'flex', gap: 3, mb: 2, flexWrap: 'wrap' }}>
                {result.folioPorte && (
                  <Typography variant="body2" color="text.secondary">
                    📋 <strong>Folio Carta Porte:</strong> {result.folioPorte.replace('folioLetterPorte:', '')}
                  </Typography>
                )}
                {result.additionalData?.totalAmnt != null && (
                  <Typography variant="body2" color="text.secondary">
                    💰 <strong>Total:</strong> ${result.additionalData.totalAmnt.toFixed(2)} MXN (Subtotal: ${result.additionalData.subTotlAmnt?.toFixed(2)})
                  </Typography>
                )}
              </Box>
            )}
            <Box component="pre" sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: 1, overflow: 'auto', maxHeight: 300, fontSize: 12, fontFamily: 'monospace' }}>
              {JSON.stringify(result.shipment || result.raw, null, 2)}
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

// ============================================
// TAB 3: ETIQUETAS + GUÍAS GENERADAS
// ============================================
function LabelTab({ token }: { token: string | null }) {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [zplResult, setZplResult] = useState<any>(null);
  const [error, setError] = useState('');

  // Lista de guías generadas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [shipments, setShipments] = useState<any[]>([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [totalShipments, setTotalShipments] = useState(0);
  const [totals, setTotals] = useState<{ costTotal: number; costSubtotal: number; clientPrice: number; profit: number; count: number } | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const loadShipments = useCallback(async (pageNum = 0, search = searchTerm, df = dateFrom, dt = dateTo) => {
    setShipmentsLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageNum * PAGE_SIZE) });
      if (search.trim()) params.set('search', search.trim());
      if (df) params.set('date_from', df);
      if (dt) params.set('date_to', dt);
      const res = await fetch(`${API_URL}/api/admin/paquete-express/shipments?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setShipments(data.shipments || []);
        setTotalShipments(data.total || 0);
        setTotals(data.totals || null);
      }
    } catch (err) { console.error(err); } finally { setShipmentsLoading(false); }
  }, [token, searchTerm, dateFrom, dateTo]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadShipments(0, ''); }, [token]);

  const handleSearch = () => { setPage(0); loadShipments(0, searchTerm, dateFrom, dateTo); };
  const handleClearDates = () => { setDateFrom(''); setDateTo(''); setPage(0); loadShipments(0, searchTerm, '', ''); };
  const handlePageChange = (newPage: number) => { setPage(newPage); loadShipments(newPage, searchTerm, dateFrom, dateTo); };

  const openPdf = (guia: string, format: string) => {
    if (!guia.trim()) return;
    window.open(`${API_URL}/api/admin/paquete-express/label/pdf/${guia.trim()}?format=${format}`, '_blank');
  };

  const getZpl = async () => {
    if (!trackingNumber.trim()) return;
    setLoading(true); setError(''); setZplResult(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/paquete-express/label/zpl/${trackingNumber.trim()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setZplResult(data); else setError(data.error || 'Error al obtener ZPL');
    } catch (err) { setError(String(err)); } finally { setLoading(false); }
  };

  const formatDate = (d: string) => {
    if (!d) return '-';
    return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Box>
      {/* Impresión manual por número */}
      <Card sx={{ border: '1px solid #e0e0e0', mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" gutterBottom>🏷️ Impresión Manual de Etiqueta</Typography>
          <Divider sx={{ my: 1.5 }} />
          <Box sx={{ display: 'flex', gap: 2, mt: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField size="small" label="Número de Guía" value={trackingNumber}
              onChange={e => setTrackingNumber(e.target.value)} placeholder="Ej: 05167923279" sx={{ minWidth: 250 }}
              onKeyDown={e => e.key === 'Enter' && openPdf(trackingNumber, '4x6')} />
            <Button variant="contained" onClick={() => openPdf(trackingNumber, '4x6')} startIcon={<PrintIcon />}
              sx={{ bgcolor: PQTX_COLOR, '&:hover': { bgcolor: '#BF360C' } }}>
              PDF 4×6
            </Button>
            <Button variant="outlined" onClick={() => openPdf(trackingNumber, 'carta')} startIcon={<PrintIcon />}
              sx={{ color: PQTX_COLOR, borderColor: PQTX_COLOR }}>
              PDF Carta
            </Button>
            <Button variant="outlined" onClick={getZpl}
              startIcon={loading ? <CircularProgress size={16} /> : <QrCodeIcon />}
              disabled={loading} sx={{ color: PQTX_COLOR, borderColor: PQTX_COLOR }}>
              ZPL
            </Button>
          </Box>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {zplResult && (
        <Card sx={{ border: '1px solid #e0e0e0', mb: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" gutterBottom>Código ZPL</Typography>
            <Button variant="outlined" size="small" startIcon={<CopyIcon />}
              onClick={() => navigator.clipboard.writeText(JSON.stringify(zplResult.zpl))} sx={{ mb: 2 }}>
              Copiar ZPL
            </Button>
            <Box component="pre" sx={{ p: 2, bgcolor: '#263238', color: '#4CAF50', borderRadius: 1, overflow: 'auto', maxHeight: 300, fontSize: 11, fontFamily: 'monospace' }}>
              {typeof zplResult.zpl === 'string' ? zplResult.zpl : JSON.stringify(zplResult.zpl, null, 2)}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Lista de guías generadas */}
      <Card sx={{ border: '1px solid #e0e0e0' }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="h6" fontWeight="bold">📋 Guías Generadas ({totalShipments})</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField size="small" type="date" label="Desde" value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
              <TextField size="small" type="date" label="Hasta" value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
              <TextField size="small" placeholder="Buscar guía, destino..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                sx={{ minWidth: 220 }} />
              <Button variant="outlined" onClick={handleSearch} startIcon={<SearchIcon />} size="small"
                sx={{ color: PQTX_COLOR, borderColor: PQTX_COLOR }}>
                Buscar
              </Button>
              {(dateFrom || dateTo) && (
                <Button variant="text" size="small" onClick={handleClearDates} sx={{ color: '#666' }}>
                  Limpiar
                </Button>
              )}
              <Tooltip title="Recargar">
                <IconButton onClick={() => loadShipments(page, searchTerm)} size="small">
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {totals && totals.count > 0 && (
            <Box sx={{ mb: 2, p: 1.5, bgcolor: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 1, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <Box>
                <Typography variant="caption" sx={{ color: '#666' }}>Guías</Typography>
                <Typography variant="body1" fontWeight="bold">{totals.count}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: '#666' }}>Costo PQTX</Typography>
                <Typography variant="body1" fontWeight="bold" sx={{ color: '#D32F2F' }}>
                  ${totals.costTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: '#666' }}>Cobrado al cliente</Typography>
                <Typography variant="body1" fontWeight="bold" sx={{ color: '#2E7D32' }}>
                  ${totals.clientPrice.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: '#666' }}>Utilidad</Typography>
                <Typography variant="body1" fontWeight="bold" sx={{ color: PQTX_COLOR }}>
                  ${totals.profit.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                </Typography>
              </Box>
            </Box>
          )}

          {shipmentsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress sx={{ color: PQTX_COLOR }} />
            </Box>
          ) : shipments.length === 0 ? (
            <Alert severity="info">No se encontraron guías generadas. Genera una guía desde la pestaña "Generar Envío".</Alert>
          ) : (
            <>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#FFF3E0' }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>No. Guía</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Fecha</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Servicio</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Origen</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Destino</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="center">Pzas</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Peso</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Costo PQTX</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Cobrado</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Estado</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="center">Acciones</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {shipments.map((s) => (
                      <TableRow key={s.id} hover sx={{ '&:hover': { bgcolor: '#FFF8E1' } }}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="body2" fontWeight="bold" fontFamily="monospace" color={PQTX_COLOR}>
                              {s.tracking_number}
                            </Typography>
                            <Tooltip title="Copiar">
                              <IconButton size="small" onClick={() => navigator.clipboard.writeText(s.tracking_number)}>
                                <CopyIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                          {s.folio_porte && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              {s.folio_porte.replace('folioLetterPorte:', 'CP: ')}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{formatDate(s.created_at)}</Typography>
                          {s.created_by_name && <Typography variant="caption" color="text.secondary">{s.created_by_name}</Typography>}
                        </TableCell>
                        <TableCell>
                          <Chip label={s.service_type || 'STD-T'} size="small" variant="outlined"
                            sx={{ borderColor: PQTX_COLOR, color: PQTX_COLOR, fontWeight: 'bold', fontSize: 11 }} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{s.origin_name || '-'}</Typography>
                          <Typography variant="caption" color="text.secondary">CP {s.origin_zip_code}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{s.dest_name || '-'}</Typography>
                          <Typography variant="caption" color="text.secondary">CP {s.dest_zip_code}</Typography>
                        </TableCell>
                        <TableCell align="center">{s.pieces || 1}</TableCell>
                        <TableCell align="right">{s.weight ? `${Number(s.weight).toFixed(1)} kg` : '-'}</TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={600} color="#BF360C">
                            ${s.total ? Number(s.total).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                          </Typography>
                          {s.subtotal && (
                            <Typography variant="caption" color="text.secondary">
                              Sub: ${Number(s.subtotal).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700} color="#1976D2">
                            ${s.client_price ? Number(s.client_price).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                          </Typography>
                          {s.client_price && s.total && (
                            <Typography variant="caption" color={Number(s.client_price) - Number(s.total) >= 0 ? '#2E7D32' : '#C62828'}>
                              +${(Number(s.client_price) - Number(s.total)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip size="small"
                            label={s.status === 'generated' ? 'Activa' : s.status === 'cancelled' ? 'Cancelada' : s.status}
                            color={s.status === 'generated' ? 'success' : s.status === 'cancelled' ? 'error' : 'default'}
                            variant="filled" sx={{ fontSize: 11 }} />
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                            <Tooltip title="Imprimir 4×6">
                              <IconButton size="small" onClick={() => openPdf(s.tracking_number, '4x6')}
                                sx={{ color: PQTX_COLOR }}>
                                <PrintIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Imprimir Carta">
                              <IconButton size="small" onClick={() => openPdf(s.tracking_number, 'carta')}
                                sx={{ color: '#1976D2' }}>
                                <PrintIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Copiar guía">
                              <IconButton size="small" onClick={() => navigator.clipboard.writeText(s.tracking_number)}>
                                <CopyIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Paginación */}
              {totalShipments > PAGE_SIZE && (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 2 }}>
                  <Button size="small" disabled={page === 0} onClick={() => handlePageChange(page - 1)}>
                    ← Anterior
                  </Button>
                  <Typography variant="body2" color="text.secondary">
                    Página {page + 1} de {Math.ceil(totalShipments / PAGE_SIZE)}
                  </Typography>
                  <Button size="small" disabled={(page + 1) * PAGE_SIZE >= totalShipments} onClick={() => handlePageChange(page + 1)}>
                    Siguiente →
                  </Button>
                </Box>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

// ============================================
// TAB 4: CANCELACIONES
// ============================================
function CancelTab({ token }: { token: string | null }) {
  const [trackingNumbers, setTrackingNumbers] = useState('');
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const guiasCount = trackingNumbers.split(/[,\n\s]+/).map(n => n.trim()).filter(Boolean).length;

  const handleCancel = async () => {
    setConfirmOpen(false);
    const numbers = trackingNumbers.split(/[,\n\s]+/).map(n => n.trim()).filter(Boolean);
    if (numbers.length === 0) { setError('Ingrese al menos un número de guía'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/paquete-express/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumbers: numbers }),
      });
      const data = await res.json();
      if (data.success) setResult(data); else setError(data.error || 'Error al cancelar guía(s)');
    } catch (err) { setError(String(err)); } finally { setLoading(false); }
  };

  return (
    <Box>
      <Card sx={{ border: '1px solid #e0e0e0', mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" gutterBottom>❌ Cancelar Guías</Typography>
          <Divider sx={{ my: 1.5 }} />
          <Alert severity="warning" sx={{ mb: 2 }}>
            Solo se pueden cancelar guías en estado <strong>BOK</strong> (reservado). Una vez recolectado o en tránsito, no es posible cancelar.
          </Alert>
          <TextField fullWidth multiline rows={3}
            label="Números de Guía (separados por coma, espacio o línea)"
            value={trackingNumbers} onChange={e => setTrackingNumbers(e.target.value)}
            placeholder="05167923279, 05168421625..." sx={{ mb: 2 }} />
          <Button variant="contained" color="error" onClick={() => setConfirmOpen(true)}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <CancelIcon />}
            disabled={loading || guiasCount === 0}>
            Cancelar {guiasCount} Guía{guiasCount !== 1 ? 's' : ''}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>⚠️ Confirmar Cancelación</DialogTitle>
        <DialogContent>
          <Typography>¿Estás seguro de cancelar <strong>{guiasCount}</strong> guía{guiasCount !== 1 ? 's' : ''}? Esta acción no se puede deshacer.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>No, mantener</Button>
          <Button onClick={handleCancel} color="error" variant="contained">Sí, cancelar</Button>
        </DialogActions>
      </Dialog>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {result && (
        <Alert severity="success">
          <strong>{result.message}</strong>
          {result.data && (
            <Box component="pre" sx={{ mt: 1, fontSize: 12, fontFamily: 'monospace' }}>
              {JSON.stringify(result.data, null, 2)}
            </Box>
          )}
        </Alert>
      )}
    </Box>
  );
}

// ============================================
// TAB 5: TRAZABILIDAD
// ============================================
function TrackingTab({ token }: { token: string | null }) {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [trackedGuia, setTrackedGuia] = useState('');

  // Lista de guías
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [shipments, setShipments] = useState<any[]>([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [totalShipments, setTotalShipments] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  const loadShipments = useCallback(async (pageNum = 0, search = searchTerm) => {
    setShipmentsLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageNum * PAGE_SIZE) });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`${API_URL}/api/admin/paquete-express/shipments?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setShipments(data.shipments || []);
        setTotalShipments(data.total || 0);
      }
    } catch (err) { console.error(err); } finally { setShipmentsLoading(false); }
  }, [token, searchTerm]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadShipments(0, ''); }, [token]);

  const handleSearch = () => { setPage(0); loadShipments(0, searchTerm); };
  const handlePageChange = (newPage: number) => { setPage(newPage); loadShipments(newPage, searchTerm); };

  const handleTrack = async (guia?: string) => {
    const num = (guia || trackingNumber).trim();
    if (!num) return;
    setLoading(true); setError(''); setResult(null); setTrackedGuia(num);
    try {
      const res = await fetch(`${API_URL}/api/admin/paquete-express/track/${num}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setResult(data.tracking); else setError(data.error || 'Error en trazabilidad');
    } catch (err) { setError(String(err)); } finally { setLoading(false); }
  };

  const formatDate = (d: string) => {
    if (!d) return '-';
    return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const statusColor = (s: string) => {
    if (!s) return 'default' as const;
    const sl = s.toLowerCase();
    if (sl.includes('entrega') || sl === 'delivered') return 'success' as const;
    if (sl.includes('tránsito') || sl.includes('transit')) return 'info' as const;
    if (sl.includes('cancel')) return 'error' as const;
    return 'default' as const;
  };

  return (
    <Box>
      {/* Búsqueda manual */}
      <Card sx={{ border: '1px solid #e0e0e0', mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" gutterBottom>🔍 Rastrear Envío</Typography>
          <Divider sx={{ my: 1.5 }} />
          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            <TextField size="small" label="Número de Guía" value={trackingNumber}
              onChange={e => setTrackingNumber(e.target.value)} placeholder="Ej: 05167923279"
              sx={{ minWidth: 300 }} onKeyDown={e => e.key === 'Enter' && handleTrack()} />
            <Button variant="contained" onClick={() => handleTrack()}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
              disabled={loading} sx={{ bgcolor: PQTX_COLOR, '&:hover': { bgcolor: '#BF360C' } }}>
              Rastrear
            </Button>
          </Box>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Resultado de trazabilidad */}
      {result && (
        <Card sx={{ border: '1px solid #e0e0e0', mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="h6" fontWeight="bold">
                📍 Historial — <span style={{ color: PQTX_COLOR, fontFamily: 'monospace' }}>{trackedGuia}</span>
              </Typography>
              <Button size="small" onClick={() => { setResult(null); setTrackedGuia(''); }}>Cerrar</Button>
            </Box>
            <Divider sx={{ my: 1 }} />
            {Array.isArray(result) ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#FFF3E0' }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>Fecha</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Hora</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Evento</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Sucursal</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Ubicación</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.map((ev: Record<string, unknown>, i: number) => (
                      <TableRow key={i} hover>
                        <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {String(ev.fecha || ev.date || '-')}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {String(ev.hora || '-')}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>
                          <Chip label={String(ev.eventoId || ev.eventoDescripcion || '-')} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>
                          <Chip label={String(ev.status || 'N/A')} size="small"
                            color={statusColor(String(ev.status || ''))} />
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{String(ev.sucursal || '-')}</TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{String(ev.ciudadEvento || ev.ciudadDestino || '-')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Box component="pre" sx={{ mt: 1, p: 2, bgcolor: '#f5f5f5', borderRadius: 1, overflow: 'auto', maxHeight: 400, fontSize: 12, fontFamily: 'monospace' }}>
                {JSON.stringify(result, null, 2)}
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lista de guías generadas con status y monto */}
      <Card sx={{ border: '1px solid #e0e0e0' }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="h6" fontWeight="bold">📋 Guías Generadas ({totalShipments})</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField size="small" placeholder="Buscar guía, destino..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                sx={{ minWidth: 220 }} />
              <Button variant="outlined" onClick={handleSearch} startIcon={<SearchIcon />} size="small"
                sx={{ color: PQTX_COLOR, borderColor: PQTX_COLOR }}>
                Buscar
              </Button>
              <Tooltip title="Recargar">
                <IconButton onClick={() => loadShipments(page, searchTerm)} size="small">
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {shipmentsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress sx={{ color: PQTX_COLOR }} />
            </Box>
          ) : shipments.length === 0 ? (
            <Alert severity="info">No se encontraron guías. Genera una desde la pestaña "Generar Envío".</Alert>
          ) : (
            <>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#FFF3E0' }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>No. Guía</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Fecha</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Servicio</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Origen</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Destino</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Peso</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Monto</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Estado</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="center">Rastrear</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {shipments.map((s) => (
                      <TableRow key={s.id} hover
                        sx={{
                          '&:hover': { bgcolor: '#FFF8E1' },
                          bgcolor: trackedGuia === s.tracking_number ? '#FFF3E0' : 'inherit',
                        }}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="body2" fontWeight="bold" fontFamily="monospace" color={PQTX_COLOR}>
                              {s.tracking_number}
                            </Typography>
                            <Tooltip title="Copiar">
                              <IconButton size="small" onClick={() => navigator.clipboard.writeText(s.tracking_number)}>
                                <CopyIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontSize={12}>{formatDate(s.created_at)}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={s.service_type || 'STD-T'} size="small" variant="outlined"
                            sx={{ borderColor: PQTX_COLOR, color: PQTX_COLOR, fontWeight: 'bold', fontSize: 11 }} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontSize={13}>{s.origin_name || '-'}</Typography>
                          <Typography variant="caption" color="text.secondary">CP {s.origin_zip_code}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontSize={13}>{s.dest_name || '-'}</Typography>
                          <Typography variant="caption" color="text.secondary">CP {s.dest_zip_code}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontSize={13}>{s.weight ? `${Number(s.weight).toFixed(1)} kg` : '-'}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          {s.total ? (
                            <Typography variant="body2" fontWeight="bold" color={PQTX_COLOR}>
                              ${Number(s.total).toFixed(2)}
                            </Typography>
                          ) : '-'}
                          {s.subtotal && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              Sub: ${Number(s.subtotal).toFixed(2)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip size="small"
                            label={s.status === 'generated' ? 'Activa' : s.status === 'cancelled' ? 'Cancelada' : s.status === 'delivered' ? 'Entregada' : s.status}
                            color={s.status === 'generated' ? 'success' : s.status === 'cancelled' ? 'error' : s.status === 'delivered' ? 'info' : 'default'}
                            variant="filled" sx={{ fontSize: 11 }} />
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title="Rastrear esta guía">
                            <IconButton size="small" onClick={() => { setTrackingNumber(s.tracking_number); handleTrack(s.tracking_number); }}
                              sx={{ color: PQTX_COLOR }}>
                              <SearchIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Totales */}
              <Box sx={{ display: 'flex', gap: 3, mt: 2, p: 1.5, bgcolor: '#FFF3E0', borderRadius: 1, flexWrap: 'wrap' }}>
                <Typography variant="body2" fontWeight="bold">
                  📊 Total Guías: {totalShipments}
                </Typography>
                <Typography variant="body2" fontWeight="bold" color={PQTX_COLOR}>
                  💰 Monto Total: ${shipments.reduce((sum, s) => sum + (Number(s.total) || 0), 0).toFixed(2)} MXN
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  📦 Piezas: {shipments.reduce((sum, s) => sum + (s.pieces || 1), 0)} |
                  ⚖️ Peso: {shipments.reduce((sum, s) => sum + (Number(s.weight) || 0), 0).toFixed(1)} kg
                </Typography>
              </Box>

              {/* Paginación */}
              {totalShipments > PAGE_SIZE && (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 2 }}>
                  <Button size="small" disabled={page === 0} onClick={() => handlePageChange(page - 1)}>
                    ← Anterior
                  </Button>
                  <Typography variant="body2" color="text.secondary">
                    Página {page + 1} de {Math.ceil(totalShipments / PAGE_SIZE)}
                  </Typography>
                  <Button size="small" disabled={(page + 1) * PAGE_SIZE >= totalShipments} onClick={() => handlePageChange(page + 1)}>
                    Siguiente →
                  </Button>
                </Box>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
