// ============================================
// PANEL API PAQUETE EXPRESS
// Gestión de envíos nacionales via Paquete Express
// Cotización, Generación de guías, Etiquetas, Cancelación, Trazabilidad
// ============================================

import { useState, useCallback } from 'react';
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
            <Typography variant="h4" fontWeight="bold">API Paquete Express</Typography>
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
                      <TableCell sx={{ fontWeight: 'bold' }}>Descripción</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Flete</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Seguro</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Recolección</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Total</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Entrega Est.</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.quotes.map((q: Record<string, unknown>, i: number) => (
                      <TableRow key={i} hover>
                        <TableCell><Chip label={String(q.srvcIdQuoter || q.srvcId || 'N/A')} size="small" color="primary" /></TableCell>
                        <TableCell>{String(q.srvcDescQuoter || q.srvcDesc || '-')}</TableCell>
                        <TableCell align="right">${Number(q.amntQuoter || q.amnt || 0).toFixed(2)}</TableCell>
                        <TableCell align="right">${Number(q.insrAmntQuoter || q.insrAmnt || 0).toFixed(2)}</TableCell>
                        <TableCell align="right">${Number(q.collAmntQuoter || q.collAmnt || 0).toFixed(2)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold', color: PQTX_COLOR }}>
                          ${Number(q.totlAmntQuoter || q.totlAmnt || 0).toFixed(2)}
                        </TableCell>
                        <TableCell>{String(q.dlvyDateQuoter || q.dlvyDate || '-')}</TableCell>
                      </TableRow>
                    ))}
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, p: 2, bgcolor: '#FFF3E0', borderRadius: 2 }}>
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
// TAB 3: ETIQUETAS
// ============================================
function LabelTab({ token }: { token: string | null }) {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [zplResult, setZplResult] = useState<any>(null);
  const [error, setError] = useState('');

  const openPdf = (format: string) => {
    if (!trackingNumber.trim()) return;
    window.open(`${API_URL}/api/admin/paquete-express/label/pdf/${trackingNumber.trim()}?format=${format}`, '_blank');
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

  return (
    <Box>
      <Card sx={{ border: '1px solid #e0e0e0', mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" gutterBottom>🏷️ Impresión de Etiquetas</Typography>
          <Divider sx={{ my: 1.5 }} />
          <Box sx={{ display: 'flex', gap: 2, mt: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField size="small" label="Número de Guía" value={trackingNumber}
              onChange={e => setTrackingNumber(e.target.value)} placeholder="Ej: 05167923279" sx={{ minWidth: 250 }} />
            <Button variant="contained" onClick={() => openPdf('4x6')} startIcon={<PrintIcon />}
              sx={{ bgcolor: PQTX_COLOR, '&:hover': { bgcolor: '#BF360C' } }}>
              PDF 4×6 (Térmica)
            </Button>
            <Button variant="outlined" onClick={() => openPdf('carta')} startIcon={<PrintIcon />}
              sx={{ color: PQTX_COLOR, borderColor: PQTX_COLOR }}>
              PDF Carta
            </Button>
            <Button variant="outlined" onClick={getZpl}
              startIcon={loading ? <CircularProgress size={16} /> : <QrCodeIcon />}
              disabled={loading} sx={{ color: PQTX_COLOR, borderColor: PQTX_COLOR }}>
              Obtener ZPL
            </Button>
          </Box>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {zplResult && (
        <Card sx={{ border: '1px solid #e0e0e0' }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" gutterBottom>Código ZPL</Typography>
            <Button variant="outlined" size="small" startIcon={<CopyIcon />}
              onClick={() => navigator.clipboard.writeText(JSON.stringify(zplResult.zpl))} sx={{ mb: 2 }}>
              Copiar ZPL
            </Button>
            <Box component="pre" sx={{ p: 2, bgcolor: '#263238', color: '#4CAF50', borderRadius: 1, overflow: 'auto', maxHeight: 400, fontSize: 11, fontFamily: 'monospace' }}>
              {typeof zplResult.zpl === 'string' ? zplResult.zpl : JSON.stringify(zplResult.zpl, null, 2)}
            </Box>
          </CardContent>
        </Card>
      )}
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

  const handleTrack = async () => {
    if (!trackingNumber.trim()) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/paquete-express/track/${trackingNumber.trim()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setResult(data.tracking); else setError(data.error || 'Error en trazabilidad');
    } catch (err) { setError(String(err)); } finally { setLoading(false); }
  };

  return (
    <Box>
      <Card sx={{ border: '1px solid #e0e0e0', mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" gutterBottom>🔍 Trazabilidad de Envíos</Typography>
          <Divider sx={{ my: 1.5 }} />
          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            <TextField size="small" label="Número de Guía" value={trackingNumber}
              onChange={e => setTrackingNumber(e.target.value)} placeholder="Ej: 05167923279"
              sx={{ minWidth: 300 }} onKeyDown={e => e.key === 'Enter' && handleTrack()} />
            <Button variant="contained" onClick={handleTrack}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
              disabled={loading} sx={{ bgcolor: PQTX_COLOR, '&:hover': { bgcolor: '#BF360C' } }}>
              Rastrear
            </Button>
          </Box>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {result && (
        <Card sx={{ border: '1px solid #e0e0e0' }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" gutterBottom>📍 Historial de Eventos</Typography>
            <Divider sx={{ my: 1 }} />
            {Array.isArray(result) ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold' }}>Fecha</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Descripción</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Ubicación</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.map((ev: Record<string, unknown>, i: number) => (
                      <TableRow key={i} hover>
                        <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {String(ev.date || ev.fecha || ev.eventDate || '-')}
                        </TableCell>
                        <TableCell>
                          <Chip label={String(ev.status || ev.statusCode || ev.codigo || 'N/A')} size="small"
                            color={String(ev.status || '').toLowerCase().includes('entrega') ? 'success' :
                              String(ev.status || '').toLowerCase().includes('tránsito') ? 'info' : 'default'} />
                        </TableCell>
                        <TableCell sx={{ fontSize: 13 }}>{String(ev.description || ev.descripcion || ev.eventDescription || '-')}</TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{String(ev.location || ev.ubicacion || ev.office || '-')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Box component="pre" sx={{ mt: 1, p: 2, bgcolor: '#f5f5f5', borderRadius: 1, overflow: 'auto', maxHeight: 500, fontSize: 12, fontFamily: 'monospace' }}>
                {JSON.stringify(result, null, 2)}
              </Box>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
