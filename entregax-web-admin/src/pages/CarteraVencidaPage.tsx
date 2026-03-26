import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Tooltip,
  Card,
  CardContent,
  Divider,
  Stack,
  Grid,
  ToggleButtonGroup,
  ToggleButton,
  Snackbar,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import GavelIcon from '@mui/icons-material/Gavel';
import DrawIcon from '@mui/icons-material/Draw';
import RefreshIcon from '@mui/icons-material/Refresh';
import PersonIcon from '@mui/icons-material/Person';
import HistoryIcon from '@mui/icons-material/History';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import VerifiedIcon from '@mui/icons-material/Verified';
import CloseIcon from '@mui/icons-material/Close';
import InfoIcon from '@mui/icons-material/Info';
import api from '../services/api';

// Interfaces
interface Ajuste {
  id: number;
  guia_tracking: string;
  servicio: string;
  tipo: 'cargo_extra' | 'descuento';
  monto: number;
  moneda?: string;
  concepto: string;
  notas: string;
  fecha_registro: string;
  autorizado_por: number;
}

interface CarteraItem {
  id: number;
  source_type: string;
  guia_tracking: string;
  servicio: string;
  cliente_id: number;
  cliente_nombre: string;
  cliente_email: string;
  cliente_telefono: string;
  cliente_box: string;
  dias_en_almacen: number;
  saldo_deudor: number;
  saldo_pendiente: number;
  costo_base: number;
  payment_status: string;
  semaforo: 'verde' | 'amarillo' | 'rojo';
  estatus_cobranza: string;
  descripcion: string;
}

interface DashboardData {
  porServicio: { servicio: string; total_guias: number; total_deuda: number }[];
  porSemaforo: { verde: { total: number; deuda: number }; amarillo: { total: number; deuda: number }; rojo: { total: number; deuda: number } };
  guiasCriticas: any[];
  totalDeuda: number;
  totalGuias: number;
}

interface ResumenFinanciero {
  guia: any;
  cliente: {
    id: number;
    nombre: string;
    email: string;
    telefono: string;
    casillero: string;
  };
  ajustes: Ajuste[];
  resumen: {
    costo_base: number;
    cargos_extra: number;
    descuentos: number;
    monto_pagado: number;
    saldo_pendiente: number;
    total_a_pagar: number;
  };
}

const SERVICIOS = [
  { value: 'POBOX_USA', label: 'PO Box USA' },
  { value: 'DHL_MTY', label: 'DHL Express' },
  { value: 'AIR_CHN_MX', label: 'AIR China' },
  { value: 'FCL', label: 'FCL (Contenedor)' },
  { value: 'LCL_CHN', label: 'LCL China' },
  { value: 'MARITIMO', label: 'LOG Marítimo' },
  { value: 'LOGS_NAC', label: 'Nacional' },
];

// Mapa de códigos de servicio → label amigable
const SERVICE_LABELS: Record<string, string> = {
  'POBOX_USA': 'PO Box USA',
  'DHL_MTY': 'DHL Express',
  'AA_DHL': 'DHL Express',
  'AIR_CHN_MX': 'AIR China',
  'AIR_CHN': 'AIR China',
  'FCL': 'FCL (Contenedor)',
  'LCL_CHN': 'LCL China',
  'SEA_CHN_MX': 'Marítimo China',
  'MARITIMO': 'LOG Marítimo',
  'LOGS_NAC': 'Nacional',
};

const ESTATUS_LABELS: Record<string, { label: string; color: 'default' | 'warning' | 'error' | 'success' | 'info' }> = {
  al_corriente: { label: 'Al Corriente', color: 'success' },
  cobranza_agresiva: { label: 'Cobranza Agresiva', color: 'warning' },
  pre_abandono: { label: 'Pre-Abandono', color: 'error' },
  abandono_aplicado: { label: 'Abandono Aplicado', color: 'default' },
  multa_generada: { label: 'Multa Generada', color: 'error' },
  pagado: { label: 'Pagado', color: 'success' },
};

export default function CarteraVencidaPage() {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [guias, setGuias] = useState<CarteraItem[]>([]);
  
  // Búsqueda
  const [searchTracking, setSearchTracking] = useState('');
  const [searchServicio, setSearchServicio] = useState('all');
  const [searchEstatus, setSearchEstatus] = useState('all');
  
  // Detalle de guía
  const [selectedGuia, setSelectedGuia] = useState<{ tracking: string; servicio: string } | null>(null);
  const [resumenGuia, setResumenGuia] = useState<ResumenFinanciero | null>(null);
  const [loadingResumen, setLoadingResumen] = useState(false);
  
  // Modal de ajuste
  const [ajusteDialog, setAjusteDialog] = useState(false);
  const [ajusteForm, setAjusteForm] = useState({
    tipo: 'cargo_extra' as 'cargo_extra' | 'descuento',
    monto: '',
    moneda: 'MXN' as 'MXN' | 'USD',
    concepto: '',
    notas: '',
  });
  const [ajusteLoading, setAjusteLoading] = useState(false);
  
  // PIN de autorización para descuentos
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });
  
  // Confirmación de eliminación de ajuste
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState(false);
  const [ajusteToDelete, setAjusteToDelete] = useState<{ id: number; concepto: string; monto: number; tipo: string } | null>(null);
  
  // Modal de abandono
  const [abandonoDialog, setAbandonoDialog] = useState(false);
  const [selectedForAbandono, setSelectedForAbandono] = useState<CarteraItem[]>([]);
  const [abandonoUrl, setAbandonoUrl] = useState('');

  // Cargar dashboard
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/cs/cartera/dashboard');
      setDashboard(response.data);
    } catch (error) {
      console.error('Error cargando dashboard:', error);
    }
    setLoading(false);
  }, []);

  // Buscar guías
  const searchGuias = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTracking) params.append('tracking', searchTracking);
      if (searchServicio && searchServicio !== 'all') params.append('servicio', searchServicio);
      if (searchEstatus && searchEstatus !== 'all') params.append('estatusCobranza', searchEstatus);
      
      const response = await api.get(`/cs/cartera/buscar?${params.toString()}`);
      setGuias(response.data);
    } catch (error) {
      console.error('Error buscando guías:', error);
    }
    setLoading(false);
  }, [searchTracking, searchServicio, searchEstatus]);

  // Auto-buscar cuando cambia el filtro de servicio o estatus
  useEffect(() => {
    if (tab === 1) {
      const timer = setTimeout(() => {
        searchGuias();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [searchServicio, searchEstatus, searchGuias, tab]);

  // Cargar resumen de guía
  const loadResumenGuia = async (tracking: string, servicio: string) => {
    setLoadingResumen(true);
    setSelectedGuia({ tracking, servicio });
    try {
      const response = await api.get(`/cs/guia/${servicio}/${tracking}/resumen`);
      setResumenGuia(response.data);
    } catch (error) {
      console.error('Error cargando resumen:', error);
    }
    setLoadingResumen(false);
  };

  // Crear ajuste (cargo directo) o solicitar descuento
  const handleCreateAjuste = async () => {
    if (!selectedGuia || !ajusteForm.monto || !ajusteForm.concepto) return;
    
    // Descuentos: enviar solicitud a Verificaciones (sin PIN)
    if (ajusteForm.tipo === 'descuento') {
      setAjusteLoading(true);
      try {
        await api.post('/cs/descuentos/solicitar', {
          guia_id: resumenGuia?.guia?.id,
          guia_tracking: selectedGuia.tracking,
          servicio: selectedGuia.servicio,
          source_type: resumenGuia?.guia?.source_type || selectedGuia.servicio,
          monto: parseFloat(ajusteForm.monto),
          moneda: ajusteForm.moneda,
          concepto: ajusteForm.concepto,
          notas: ajusteForm.notas,
          cliente_id: resumenGuia?.cliente?.id || resumenGuia?.guia?.user_id,
          cliente_nombre: resumenGuia?.cliente?.nombre,
        });
        setAjusteDialog(false);
        setAjusteForm({ tipo: 'cargo_extra', monto: '', moneda: 'MXN', concepto: '', notas: '' });
        setSnackbar({ open: true, message: '📨 Solicitud de descuento enviada a Verificaciones para aprobación', severity: 'success' });
      } catch (error: any) {
        console.error('Error solicitando descuento:', error);
        setSnackbar({ open: true, message: error?.response?.data?.error || 'Error al enviar solicitud', severity: 'error' });
      }
      setAjusteLoading(false);
      return;
    }

    // Cargos extra: aplicar directamente
    setAjusteLoading(true);
    try {
      await api.post('/cs/ajustes', {
        guia_id: resumenGuia?.guia?.id,
        guia_tracking: selectedGuia.tracking,
        servicio: selectedGuia.servicio,
        tipo: ajusteForm.tipo,
        monto: parseFloat(ajusteForm.monto),
        moneda: ajusteForm.moneda,
        concepto: ajusteForm.concepto,
        notas: ajusteForm.notas,
        cliente_id: resumenGuia?.cliente?.id || resumenGuia?.guia?.user_id,
      });
      
      setAjusteDialog(false);
      setAjusteForm({ tipo: 'cargo_extra', monto: '', moneda: 'MXN', concepto: '', notas: '' });
      setSnackbar({ open: true, message: '✅ Cargo extra aplicado correctamente', severity: 'success' });
      loadResumenGuia(selectedGuia.tracking, selectedGuia.servicio);
    } catch (error) {
      console.error('Error creando ajuste:', error);
      setSnackbar({ open: true, message: 'Error al crear ajuste', severity: 'error' });
    }
    setAjusteLoading(false);
  };

  // Solicitar confirmación antes de eliminar ajuste
  const handleDeleteAjuste = (ajuste: { id: number; concepto: string; monto: number; tipo: string }) => {
    setAjusteToDelete(ajuste);
    setDeleteConfirmDialog(true);
  };

  // Confirmar eliminación de ajuste
  const confirmDeleteAjuste = async () => {
    if (!selectedGuia || !ajusteToDelete) return;
    
    try {
      await api.delete(`/cs/ajustes/${ajusteToDelete.id}`);
      setSnackbar({ open: true, message: '✅ Ajuste eliminado correctamente', severity: 'success' });
      loadResumenGuia(selectedGuia.tracking, selectedGuia.servicio);
    } catch (error) {
      console.error('Error eliminando ajuste:', error);
      setSnackbar({ open: true, message: 'Error al eliminar ajuste', severity: 'error' });
    }
    setDeleteConfirmDialog(false);
    setAjusteToDelete(null);
  };

  // Generar documento de abandono
  const handleGenerarAbandono = async () => {
    if (selectedForAbandono.length === 0) return;
    
    try {
      const clienteId = selectedForAbandono[0].cliente_id;
      const guias = selectedForAbandono.map(g => ({
        tracking: g.guia_tracking,
        servicio: g.servicio,
        saldo: g.saldo_deudor,
      }));
      
      const response = await api.post('/cs/abandono/generar', { cliente_id: clienteId, guias });
      setAbandonoUrl(response.data.firmaUrl);
      setAbandonoDialog(true);
    } catch (error) {
      console.error('Error generando abandono:', error);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Renderizar semáforo
  const renderSemaforo = (semaforo: string) => {
    const colors: Record<string, string> = {
      verde: '#10B981',
      amarillo: '#F59E0B',
      rojo: '#EF4444',
    };
    return (
      <Box
        sx={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          bgcolor: colors[semaforo] || '#gray',
        }}
      />
    );
  };

  // Obtener saldo display
  const getSaldo = (guia: any) => {
    return Number(guia.saldo_deudor) || Number(guia.saldo_pendiente) || Number(guia.costo_base) || 0;
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" fontWeight={700}>
           Ajustes Financieros
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Gestión de cargos extra, descuentos, cobranza y abandono de mercancía
        </Typography>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab icon={<ReceiptLongIcon />} label="Dashboard" />
          <Tab icon={<SearchIcon />} label="Buscar Guías" />
          <Tab icon={<GavelIcon />} label="Abandono" />
        </Tabs>
      </Paper>

      {/* Dashboard Tab */}
      {tab === 0 && (
        <Box>
          {loading ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : dashboard ? (
            <>
              {/* Resumen por semáforo */}
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 4 }}>
                <Box sx={{ flex: 1 }}>
                  <Card sx={{ bgcolor: '#4CAF50', color: 'white' }}>
                    <CardContent>
                      <Typography variant="h4" fontWeight={700}>
                        {dashboard.porSemaforo?.verde?.total || 0}
                      </Typography>
                      <Typography variant="body2">🟢 Al Corriente (&lt;30 días)</Typography>
                    </CardContent>
                  </Card>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Card sx={{ bgcolor: '#FF9800', color: 'white' }}>
                    <CardContent>
                      <Typography variant="h4" fontWeight={700}>
                        {dashboard.porSemaforo?.amarillo?.total || 0}
                      </Typography>
                      <Typography variant="body2">🟡 Cobranza (30-60 días)</Typography>
                    </CardContent>
                  </Card>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Card sx={{ bgcolor: '#F44336', color: 'white' }}>
                    <CardContent>
                      <Typography variant="h4" fontWeight={700}>
                        {dashboard.porSemaforo?.rojo?.total || 0}
                      </Typography>
                      <Typography variant="body2">🔴 Pre-Abandono (60+ días)</Typography>
                    </CardContent>
                  </Card>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Card sx={{ bgcolor: 'grey.800', color: 'white' }}>
                    <CardContent>
                      <Typography variant="h4" fontWeight={700}>
                        {dashboard.totalGuias || 0}
                      </Typography>
                      <Typography variant="body2">📦 Total Guías</Typography>
                    </CardContent>
                  </Card>
                </Box>
              </Stack>

              {/* Guías críticas */}
              <Paper sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6" fontWeight={600}>
                    <WarningAmberIcon color="error" sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Guías Críticas (60+ días)
                  </Typography>
                  <IconButton onClick={loadDashboard}>
                    <RefreshIcon />
                  </IconButton>
                </Box>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Semáforo</TableCell>
                      <TableCell>Tracking</TableCell>
                      <TableCell>Servicio</TableCell>
                      <TableCell>Cliente</TableCell>
                      <TableCell align="center">Días</TableCell>
                      <TableCell align="right">Saldo</TableCell>
                      <TableCell>Acciones</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {dashboard.guiasCriticas?.map((guia: any, idx: number) => (
                      <TableRow key={`${guia.guia_tracking}-${idx}`} hover>
                        <TableCell>{renderSemaforo(guia.semaforo || 'rojo')}</TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {guia.guia_tracking}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={SERVICE_LABELS[guia.servicio] || guia.servicio} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{guia.cliente_nombre || 'Sin nombre'}</Typography>
                          <Typography variant="caption" color="text.secondary">{guia.cliente_telefono || guia.cliente_email || '-'}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip 
                            size="small" 
                            label={`${guia.dias || 0} días`}
                            color={guia.dias >= 90 ? 'error' : guia.dias >= 60 ? 'warning' : 'default'}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={600} color="error">
                            ${Number(guia.saldo || 0).toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Tooltip title="Ver detalle">
                            <IconButton size="small" onClick={() => loadResumenGuia(guia.guia_tracking, guia.source_type || 'package')}>
                              <ReceiptLongIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!dashboard.guiasCriticas || dashboard.guiasCriticas.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={7} align="center">
                          <Typography color="text.secondary">🎉 No hay guías críticas - Todo en orden</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Paper>
            </>
          ) : null}
        </Box>
      )}

      {/* Buscar Guías Tab */}
      {tab === 1 && (
        <Box>
          {/* Filtros */}
          <Paper sx={{ p: 2, mb: 3 }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                size="small"
                label="Tracking"
                value={searchTracking}
                onChange={(e) => setSearchTracking(e.target.value)}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
                }}
              />
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Servicio</InputLabel>
                <Select
                  value={searchServicio}
                  label="Servicio"
                  onChange={(e) => setSearchServicio(e.target.value)}
                >
                  <MenuItem value="all">Todos</MenuItem>
                  {SERVICIOS.map((s) => (
                    <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Estatus</InputLabel>
                <Select
                  value={searchEstatus}
                  label="Estatus"
                  onChange={(e) => setSearchEstatus(e.target.value)}
                >
                  <MenuItem value="all">Todos</MenuItem>
                  {Object.entries(ESTATUS_LABELS).map(([key, val]) => (
                    <MenuItem key={key} value={key}>{val.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button variant="contained" onClick={searchGuias}>
                Buscar
              </Button>
            </Box>
          </Paper>

          {/* Resultados */}
          <Paper sx={{ p: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Semáforo</TableCell>
                  <TableCell>Tracking</TableCell>
                  <TableCell>Servicio</TableCell>
                  <TableCell>Cliente</TableCell>
                  <TableCell align="center">Días</TableCell>
                  <TableCell align="right">Saldo</TableCell>
                  <TableCell>Estatus</TableCell>
                  <TableCell>Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {guias.map((guia, idx) => (
                  <TableRow key={`${guia.guia_tracking}-${idx}`} hover sx={{ cursor: 'pointer' }} onClick={() => loadResumenGuia(guia.guia_tracking, guia.source_type || guia.servicio)}>
                    <TableCell>{renderSemaforo(guia.semaforo)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {guia.guia_tracking}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={SERVICE_LABELS[guia.servicio] || guia.servicio} />
                    </TableCell>
                    <TableCell>
                      {guia.cliente_box && (
                        <Typography variant="caption" fontWeight={700} color="primary.main">
                          📦 {guia.cliente_box}
                        </Typography>
                      )}
                      <Typography variant="body2">{guia.cliente_nombre || 'Sin nombre'}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip 
                        size="small" 
                        label={`${guia.dias_en_almacen} días`}
                        color={guia.dias_en_almacen >= 90 ? 'error' : guia.dias_en_almacen >= 60 ? 'warning' : 'default'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={600}>
                        ${getSaldo(guia).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={ESTATUS_LABELS[guia.estatus_cobranza]?.label || (guia.payment_status === 'paid' ? 'Pagado' : 'Pendiente')}
                        color={ESTATUS_LABELS[guia.estatus_cobranza]?.color || (guia.payment_status === 'paid' ? 'success' : 'default')}
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Ver detalle">
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); loadResumenGuia(guia.guia_tracking, guia.source_type || guia.servicio); }}>
                          <ReceiptLongIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {guias.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">Usa los filtros y haz click en Buscar</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </Box>
      )}

      {/* Abandono Tab */}
      {tab === 2 && (
        <Box>
          <Alert severity="warning" sx={{ mb: 3 }}>
            <Typography variant="body2" fontWeight={600}>Proceso de Abandono de Mercancía</Typography>
            <Typography variant="body2">
              1. Día 30: Se envía notificación de cobranza agresiva al cliente<br />
              2. Día 60: Se envía carta de pre-abandono con link de firma digital<br />
              3. Día 90: Si no firma, se aplica multa del 50% y se bloquea recuperación
            </Typography>
          </Alert>

          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Seleccionar guías para abandono
              </Typography>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  // Buscar guías en pre_abandono
                  setSearchEstatus('pre_abandono');
                  searchGuias();
                }}
              >
                Cargar guías en Pre-Abandono
              </Button>
            </Box>
            
            {/* Tabla de selección */}
            {guias.length > 0 ? (
              <Table size="small" sx={{ mb: 2 }}>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <input 
                        type="checkbox"
                        onChange={(e) => {
                          if (e.target.checked) {
                            // Seleccionar todas las guías del mismo cliente
                            const firstClientId = guias[0]?.cliente_id;
                            setSelectedForAbandono(guias.filter(g => g.cliente_id === firstClientId));
                          } else {
                            setSelectedForAbandono([]);
                          }
                        }}
                        checked={selectedForAbandono.length > 0 && selectedForAbandono.length === guias.filter(g => g.cliente_id === guias[0]?.cliente_id).length}
                      />
                    </TableCell>
                    <TableCell>Tracking</TableCell>
                    <TableCell>Cliente</TableCell>
                    <TableCell align="center">Días</TableCell>
                    <TableCell align="right">Saldo</TableCell>
                    <TableCell>Estatus</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {guias.map((guia) => (
                    <TableRow 
                      key={guia.id} 
                      hover
                      selected={selectedForAbandono.some(s => s.id === guia.id)}
                      onClick={() => {
                        const isSelected = selectedForAbandono.some(s => s.id === guia.id);
                        if (isSelected) {
                          setSelectedForAbandono(selectedForAbandono.filter(s => s.id !== guia.id));
                        } else {
                          // Solo permitir seleccionar del mismo cliente
                          if (selectedForAbandono.length === 0 || selectedForAbandono[0].cliente_id === guia.cliente_id) {
                            setSelectedForAbandono([...selectedForAbandono, guia]);
                          }
                        }
                      }}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell padding="checkbox">
                        <input 
                          type="checkbox"
                          checked={selectedForAbandono.some(s => s.id === guia.id)}
                          onChange={() => {}}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{guia.guia_tracking}</Typography>
                      </TableCell>
                      <TableCell>
                        {guia.cliente_box && <Typography variant="caption" fontWeight={700} color="primary.main">📦 {guia.cliente_box}</Typography>}
                        <Typography variant="body2">{guia.cliente_nombre}</Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip 
                          size="small" 
                          label={`${guia.dias_en_almacen} días`}
                          color={guia.dias_en_almacen >= 90 ? 'error' : guia.dias_en_almacen >= 60 ? 'warning' : 'default'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600} color="error">
                          ${getSaldo(guia).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={ESTATUS_LABELS[guia.estatus_cobranza]?.label || guia.estatus_cobranza}
                          color={ESTATUS_LABELS[guia.estatus_cobranza]?.color || 'default'}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Alert severity="info" sx={{ mb: 2 }}>
                Haz click en "Cargar guías en Pre-Abandono" para ver las guías disponibles para abandono.
              </Alert>
            )}

            {/* Resumen de selección */}
            {selectedForAbandono.length > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  <strong>{selectedForAbandono.length}</strong> guías seleccionadas del cliente <strong>{selectedForAbandono[0]?.cliente_nombre}</strong>
                </Typography>
                <Typography variant="body2">
                  Total a condonar: <strong>${selectedForAbandono.reduce((sum, g) => sum + Number(g.saldo_deudor), 0).toLocaleString()} MXN</strong>
                </Typography>
              </Alert>
            )}

            <Button
              variant="contained"
              color="error"
              startIcon={<DrawIcon />}
              disabled={selectedForAbandono.length === 0}
              onClick={handleGenerarAbandono}
            >
              Generar Documento de Abandono ({selectedForAbandono.length} guías)
            </Button>
          </Paper>
        </Box>
      )}

      {/* Dialog de Detalle de Guía */}
      <Dialog open={!!selectedGuia} onClose={() => { setSelectedGuia(null); setResumenGuia(null); }} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ReceiptLongIcon />
              <Typography variant="h6">Detalle: {selectedGuia?.tracking}</Typography>
            </Box>
            <IconButton onClick={() => { setSelectedGuia(null); setResumenGuia(null); }}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {loadingResumen ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : resumenGuia ? (
            <Box>
              {/* Info del cliente */}
              <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <PersonIcon color="primary" />
                  <Typography variant="subtitle1" fontWeight={600}>Cliente</Typography>
                </Box>
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Casillero</Typography>
                    <Typography variant="body2" fontWeight={700} color="primary.main">
                      📦 {resumenGuia.cliente?.casillero || 'N/A'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Nombre</Typography>
                    <Typography variant="body2" fontWeight={600}>{resumenGuia.cliente?.nombre || 'Sin nombre'}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Email</Typography>
                    <Typography variant="body2">{resumenGuia.cliente?.email || '-'}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Teléfono</Typography>
                    <Typography variant="body2">{resumenGuia.cliente?.telefono || '-'}</Typography>
                  </Grid>
                </Grid>
              </Paper>

              {/* Info del envío */}
              <Paper sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <LocalShippingIcon color="primary" />
                  <Typography variant="subtitle1" fontWeight={600}>Información del Envío</Typography>
                </Box>
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Tracking</Typography>
                    <Typography variant="body2" fontWeight={600}>{resumenGuia.guia?.tracking_number || selectedGuia?.tracking}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Servicio</Typography>
                    <Chip size="small" label={SERVICE_LABELS[resumenGuia.guia?.servicio] || resumenGuia.guia?.servicio || selectedGuia?.servicio} />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Estatus</Typography>
                    <Chip size="small" label={resumenGuia.guia?.status || resumenGuia.guia?.payment_status || 'N/A'} color={resumenGuia.guia?.payment_status === 'paid' ? 'success' : 'warning'} />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Fecha</Typography>
                    <Typography variant="body2">{resumenGuia.guia?.created_at ? new Date(resumenGuia.guia.created_at).toLocaleDateString() : '-'}</Typography>
                  </Grid>
                  {resumenGuia.guia?.weight && (
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">Peso</Typography>
                      <Typography variant="body2">{Number(resumenGuia.guia.weight).toFixed(2)} kg</Typography>
                    </Grid>
                  )}
                  {resumenGuia.guia?.dimensions && (
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">Dimensiones</Typography>
                      <Typography variant="body2">{resumenGuia.guia.dimensions}</Typography>
                    </Grid>
                  )}
                  {resumenGuia.guia?.cbm && Number(resumenGuia.guia.cbm) > 0 && (
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">CBM</Typography>
                      <Typography variant="body2">{Number(resumenGuia.guia.cbm).toFixed(4)} m³</Typography>
                    </Grid>
                  )}
                  {resumenGuia.guia?.declared_value && (
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">Valor Declarado</Typography>
                      <Typography variant="body2">${Number(resumenGuia.guia.declared_value).toLocaleString()}</Typography>
                    </Grid>
                  )}
                </Grid>

                {/* GEX */}
                <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
                  <Chip
                    icon={<VerifiedIcon />}
                    label={resumenGuia.guia?.has_gex ? `GEX: ${resumenGuia.guia.gex_folio || 'Sí'}` : 'Sin GEX'}
                    color={resumenGuia.guia?.has_gex ? 'success' : 'default'}
                    variant={resumenGuia.guia?.has_gex ? 'filled' : 'outlined'}
                    size="small"
                  />
                </Box>

                {/* Instrucciones de envío */}
                {(resumenGuia.guia?.destination_address || resumenGuia.guia?.delivery_address_id || resumenGuia.guia?.delivery_instructions || resumenGuia.deliveryAddress) ? (
                  <Box sx={{ mt: 2, p: 1.5, bgcolor: '#e3f2fd', borderRadius: 1 }}>
                    <Typography variant="caption" fontWeight={700} color="primary.main">📍 Instrucciones de Envío</Typography>
                    {resumenGuia.guia?.delivery_instructions && (
                      <Typography variant="body2">{resumenGuia.guia.delivery_instructions}</Typography>
                    )}
                    {resumenGuia.deliveryAddress?.full_address && (
                      <Typography variant="body2">{resumenGuia.deliveryAddress.full_address}</Typography>
                    )}
                    {resumenGuia.guia?.destination_address && (
                      <Typography variant="body2">{resumenGuia.guia.destination_address}</Typography>
                    )}
                    {resumenGuia.guia?.destination_city && (
                      <Typography variant="body2" color="text.secondary">{resumenGuia.guia.destination_city}</Typography>
                    )}
                    {resumenGuia.guia?.destination_contact && (
                      <Typography variant="body2" color="text.secondary">👤 {resumenGuia.guia.destination_contact}</Typography>
                    )}
                    {resumenGuia.deliveryAddress?.contact_name && (
                      <Typography variant="body2" color="text.secondary">👤 {resumenGuia.deliveryAddress.contact_name} {resumenGuia.deliveryAddress.contact_phone ? `- ${resumenGuia.deliveryAddress.contact_phone}` : ''}</Typography>
                    )}
                  </Box>
                ) : (
                  <Box sx={{ mt: 2, p: 1.5, bgcolor: '#fff3e0', borderRadius: 1 }}>
                    <Typography variant="caption" color="warning.dark" fontWeight={600}>
                      ⚠️ Sin instrucciones de envío asignadas
                    </Typography>
                  </Box>
                )}
              </Paper>

              {/* Detalle de precio (si hay datos extras) */}
              {(resumenGuia.guia?.air_sale_price || resumenGuia.guia?.pobox_venta_usd || resumenGuia.guia?.import_cost_usd) && (
                <Paper sx={{ p: 2, mb: 2, bgcolor: '#f5f5f5' }}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                    <InfoIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
                    Detalle de Precio
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                    {resumenGuia.guia?.import_cost_usd && (
                      <>
                        <Typography variant="caption">DHL Import USD:</Typography>
                        <Typography variant="caption" align="right" fontWeight={600}>
                          ${Number(resumenGuia.guia.import_cost_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                        </Typography>
                        {resumenGuia.guia?.exchange_rate && Number(resumenGuia.guia.exchange_rate) > 0 && (
                          <>
                            <Typography variant="caption" color="text.secondary">Tipo de Cambio:</Typography>
                            <Typography variant="caption" align="right" color="text.secondary">
                              1 USD = ${Number(resumenGuia.guia.exchange_rate).toFixed(2)} MXN
                            </Typography>
                            <Typography variant="caption" fontWeight={600}>Monto en Pesos:</Typography>
                            <Typography variant="caption" align="right" fontWeight={700} color="primary.main">
                              ${(Number(resumenGuia.guia.import_cost_usd) * Number(resumenGuia.guia.exchange_rate)).toLocaleString('en-US', { minimumFractionDigits: 2 })} MXN
                            </Typography>
                          </>
                        )}
                        {resumenGuia.guia?.import_cost_mxn && !resumenGuia.guia?.exchange_rate && (
                          <>
                            <Typography variant="caption" fontWeight={600}>Monto en Pesos:</Typography>
                            <Typography variant="caption" align="right" fontWeight={700} color="primary.main">
                              ${Number(resumenGuia.guia.import_cost_mxn).toLocaleString('en-US', { minimumFractionDigits: 2 })} MXN
                            </Typography>
                          </>
                        )}
                      </>
                    )}
                    {resumenGuia.guia?.national_cost_mxn && Number(resumenGuia.guia.national_cost_mxn) > 0 && (
                      <>
                        <Typography variant="caption">Envío Nacional:</Typography>
                        <Typography variant="caption" align="right" fontWeight={600}>
                          ${Number(resumenGuia.guia.national_cost_mxn).toLocaleString('en-US', { minimumFractionDigits: 2 })} MXN
                        </Typography>
                      </>
                    )}
                    {resumenGuia.guia?.air_sale_price && (
                      <>
                        <Typography variant="caption">Precio Aéreo USD:</Typography>
                        <Typography variant="caption" align="right" fontWeight={600}>
                          ${Number(resumenGuia.guia.air_sale_price).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                        </Typography>
                        {resumenGuia.guia?.tc_aereo && Number(resumenGuia.guia.tc_aereo) > 0 && (
                          <>
                            <Typography variant="caption" color="text.secondary">Tipo de Cambio (TDI):</Typography>
                            <Typography variant="caption" align="right" color="text.secondary">
                              1 USD = ${Number(resumenGuia.guia.tc_aereo).toFixed(2)} MXN
                            </Typography>
                            <Typography variant="caption" fontWeight={600}>Monto en Pesos:</Typography>
                            <Typography variant="caption" align="right" fontWeight={700} color="primary.main">
                              ${(Number(resumenGuia.guia.air_sale_price) * Number(resumenGuia.guia.tc_aereo)).toLocaleString('en-US', { minimumFractionDigits: 2 })} MXN
                            </Typography>
                          </>
                        )}
                      </>
                    )}
                    {resumenGuia.guia?.air_price_per_kg && (
                      <>
                        <Typography variant="caption">Tarifa/kg ({resumenGuia.guia?.air_tariff_type || '-'}):</Typography>
                        <Typography variant="caption" align="right">${Number(resumenGuia.guia.air_price_per_kg).toFixed(2)} USD/kg</Typography>
                      </>
                    )}
                    {resumenGuia.guia?.pobox_venta_usd && (
                      <>
                        <Typography variant="caption">PO Box Venta USD:</Typography>
                        <Typography variant="caption" align="right" fontWeight={600}>
                          ${Number(resumenGuia.guia.pobox_venta_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                        </Typography>
                      </>
                    )}
                  </Box>
                </Paper>
              )}

              {/* Resumen financiero */}
              <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  💰 Resumen Financiero
                </Typography>
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Typography variant="body2">Costo Base (MXN):</Typography>
                  <Typography variant="body2" align="right" fontWeight={600}>
                    ${resumenGuia.resumen.costo_base.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Typography>
                  
                  {(resumenGuia.resumen as any).national_cost > 0 && (
                    <>
                      <Typography variant="body2">+ Envío Nacional:</Typography>
                      <Typography variant="body2" align="right" fontWeight={600}>
                        ${(resumenGuia.resumen as any).national_cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </Typography>
                    </>
                  )}
                  
                  {resumenGuia.resumen.cargos_extra > 0 && (
                    <>
                      <Typography variant="body2" color="error">+ Cargos Extra:</Typography>
                      <Typography variant="body2" align="right" color="error" fontWeight={600}>
                        ${resumenGuia.resumen.cargos_extra.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </Typography>
                    </>
                  )}
                  
                  {resumenGuia.resumen.descuentos > 0 && (
                    <>
                      <Typography variant="body2" color="success.main">- Descuentos:</Typography>
                      <Typography variant="body2" align="right" color="success.main" fontWeight={600}>
                        ${resumenGuia.resumen.descuentos.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </Typography>
                    </>
                  )}
                  
                  {resumenGuia.resumen.monto_pagado > 0 && (
                    <>
                      <Typography variant="body2">- Pagado:</Typography>
                      <Typography variant="body2" align="right">
                        ${resumenGuia.resumen.monto_pagado.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </Typography>
                    </>
                  )}
                  
                  <Divider sx={{ gridColumn: '1/-1', my: 1 }} />
                  
                  <Typography variant="body1" fontWeight={700}>SALDO PENDIENTE:</Typography>
                  <Typography variant="body1" fontWeight={700} align="right" color="error">
                    ${resumenGuia.resumen.saldo_pendiente.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Typography>
                </Box>
              </Paper>

              {/* Lista de ajustes */}
              <Paper sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    <HistoryIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Ajustes Aplicados
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<AddIcon />}
                      onClick={() => { setAjusteForm({ ...ajusteForm, tipo: 'cargo_extra' }); setAjusteDialog(true); }}
                    >
                      Cargo
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="success"
                      startIcon={<RemoveIcon />}
                      onClick={() => { setAjusteForm({ ...ajusteForm, tipo: 'descuento' }); setAjusteDialog(true); }}
                    >
                      Descuento
                    </Button>
                  </Box>
                </Box>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Tipo</TableCell>
                      <TableCell>Concepto</TableCell>
                      <TableCell align="right">Monto</TableCell>
                      <TableCell>Fecha</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {resumenGuia.ajustes.map((ajuste) => (
                      <TableRow key={ajuste.id}>
                        <TableCell>
                          <Chip
                            size="small"
                            icon={ajuste.tipo === 'cargo_extra' ? <AddIcon /> : <RemoveIcon />}
                            label={ajuste.tipo === 'cargo_extra' ? 'Cargo' : 'Descuento'}
                            color={ajuste.tipo === 'cargo_extra' ? 'error' : 'success'}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{ajuste.concepto}</Typography>
                          {ajuste.notas && (
                            <Typography variant="caption" color="text.secondary">{ajuste.notas}</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            fontWeight={600}
                            color={ajuste.tipo === 'cargo_extra' ? 'error' : 'success.main'}
                          >
                            {ajuste.tipo === 'cargo_extra' ? '+' : '-'}${Number(ajuste.monto).toLocaleString('en-US', { minimumFractionDigits: 2 })} {ajuste.moneda || 'MXN'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">
                            {new Date(ajuste.fecha_registro).toLocaleDateString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" color="error" onClick={() => handleDeleteAjuste(ajuste)}>
                            <RemoveIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                    {resumenGuia.ajustes.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} align="center">
                          <Typography color="text.secondary" variant="body2">
                            No hay ajustes registrados
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Paper>
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setSelectedGuia(null); setResumenGuia(null); }}>
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>
      {/* Dialog de Nuevo Ajuste */}
      <Dialog open={ajusteDialog} onClose={() => setAjusteDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {ajusteForm.tipo === 'cargo_extra' ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
              <AddIcon /> Agregar Cargo Extra
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'success.main' }}>
              <RemoveIcon /> Aplicar Descuento
              <Chip size="small" label="Requiere PIN Director" color="warning" />
            </Box>
          )}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Tipo</InputLabel>
              <Select
                value={ajusteForm.tipo}
                label="Tipo"
                onChange={(e) => setAjusteForm({ ...ajusteForm, tipo: e.target.value as 'cargo_extra' | 'descuento' })}
              >
                <MenuItem value="cargo_extra">Cargo Extra (+)</MenuItem>
                <MenuItem value="descuento">Descuento (-)</MenuItem>
              </Select>
            </FormControl>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Monto"
                type="number"
                value={ajusteForm.monto}
                onChange={(e) => setAjusteForm({ ...ajusteForm, monto: e.target.value })}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
                sx={{ flex: 1 }}
              />
              <ToggleButtonGroup
                value={ajusteForm.moneda}
                exclusive
                onChange={(_, val) => val && setAjusteForm({ ...ajusteForm, moneda: val })}
                size="small"
              >
                <ToggleButton value="MXN">🇲🇽 MXN</ToggleButton>
                <ToggleButton value="USD">🇺🇸 USD</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <TextField
              label="Concepto"
              value={ajusteForm.concepto}
              onChange={(e) => setAjusteForm({ ...ajusteForm, concepto: e.target.value })}
              placeholder="Ej: Reempaque, multa almacenaje, cortesía..."
            />
            <TextField
              label="Notas / Motivo"
              multiline
              rows={2}
              value={ajusteForm.notas}
              onChange={(e) => setAjusteForm({ ...ajusteForm, notas: e.target.value })}
              placeholder="Detalle del motivo del ajuste..."
            />
            {ajusteForm.tipo === 'descuento' && (
              <Alert severity="info" icon={<VerifiedIcon />}>
                Los descuentos requieren clave de autorización de un Director o Super Admin.
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAjusteDialog(false)}>Cancelar</Button>
          <Button
            variant="contained"
            color={ajusteForm.tipo === 'cargo_extra' ? 'error' : 'success'}
            onClick={handleCreateAjuste}
            disabled={!ajusteForm.monto || !ajusteForm.concepto || ajusteLoading}
          >
            {ajusteLoading ? <CircularProgress size={20} /> : ajusteForm.tipo === 'cargo_extra' ? 'Aplicar Cargo' : 'Solicitar Descuento'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog de confirmación de eliminación */}
      <Dialog open={deleteConfirmDialog} onClose={() => { setDeleteConfirmDialog(false); setAjusteToDelete(null); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ color: 'error.main' }}>
          ⚠️ Confirmar Eliminación
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            ¿Estás seguro de eliminar este {ajusteToDelete?.tipo === 'cargo_extra' ? 'cargo' : 'descuento'}?
          </Typography>
          {ajusteToDelete && (
            <Paper sx={{ p: 2, mt: 2, bgcolor: 'grey.100' }}>
              <Typography variant="body2"><strong>Concepto:</strong> {ajusteToDelete.concepto}</Typography>
              <Typography variant="body2" color={ajusteToDelete.tipo === 'cargo_extra' ? 'error' : 'success.main'}>
                <strong>Monto:</strong> ${Number(ajusteToDelete.monto).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </Typography>
            </Paper>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteConfirmDialog(false); setAjusteToDelete(null); }}>
            Cancelar
          </Button>
          <Button variant="contained" color="error" onClick={confirmDeleteAjuste}>
            Sí, Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar de feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Dialog de URL de Abandono */}
      <Dialog open={abandonoDialog} onClose={() => setAbandonoDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DrawIcon color="primary" />
            Documento Generado
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            Se ha generado el documento de abandono exitosamente
          </Alert>
          <Typography variant="body2" gutterBottom>
            Envía este enlace al cliente para que firme digitalmente:
          </Typography>
          <TextField
            fullWidth
            value={abandonoUrl}
            InputProps={{ readOnly: true }}
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAbandonoDialog(false)}>Cerrar</Button>
          <Button
            variant="contained"
            onClick={() => {
              navigator.clipboard.writeText(abandonoUrl);
            }}
          >
            Copiar Enlace
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
