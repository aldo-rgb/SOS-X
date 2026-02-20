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
import api from '../services/api';

// Interfaces
interface Ajuste {
  id: number;
  guia_tracking: string;
  servicio: string;
  tipo: 'cargo_extra' | 'descuento';
  monto: number;
  concepto: string;
  notas: string;
  fecha_registro: string;
  autorizado_por: number;
}

interface CarteraItem {
  id: number;
  guia_id: number;
  guia_tracking: string;
  servicio: string;
  cliente_id: number;
  cliente_nombre: string;
  cliente_email: string;
  cliente_telefono: string;
  dias_en_almacen: number;
  saldo_deudor: number;
  multa_aplicada: number;
  estatus_cobranza: string;
  semaforo: 'verde' | 'amarillo' | 'rojo';
  firma_token: string | null;
  firma_fecha: string | null;
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
  ajustes: Ajuste[];
  cartera: CarteraItem | null;
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
  { value: 'packages', label: 'PO Box USA', prefix: 'PB' },
  { value: 'dhl', label: 'DHL Express', prefix: 'DHL' },
  { value: 'china', label: 'AIR China', prefix: 'AIR' },
  { value: 'maritime', label: 'LOG Marítimo', prefix: 'LOG' },
  { value: 'national', label: 'Nacional', prefix: 'NAC' },
];

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
  const [searchServicio, setSearchServicio] = useState('');
  const [searchEstatus, setSearchEstatus] = useState('');
  
  // Detalle de guía
  const [selectedGuia, setSelectedGuia] = useState<{ tracking: string; servicio: string } | null>(null);
  const [resumenGuia, setResumenGuia] = useState<ResumenFinanciero | null>(null);
  const [loadingResumen, setLoadingResumen] = useState(false);
  
  // Modal de ajuste
  const [ajusteDialog, setAjusteDialog] = useState(false);
  const [ajusteForm, setAjusteForm] = useState({
    tipo: 'cargo_extra' as 'cargo_extra' | 'descuento',
    monto: '',
    concepto: '',
    notas: '',
  });
  
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
      if (searchServicio) params.append('servicio', searchServicio);
      if (searchEstatus) params.append('estatusCobranza', searchEstatus);
      
      const response = await api.get(`/cs/cartera/buscar?${params.toString()}`);
      setGuias(response.data);
    } catch (error) {
      console.error('Error buscando guías:', error);
    }
    setLoading(false);
  }, [searchTracking, searchServicio, searchEstatus]);

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

  // Crear ajuste
  const handleCreateAjuste = async () => {
    if (!selectedGuia || !ajusteForm.monto || !ajusteForm.concepto) return;
    
    try {
      await api.post('/cs/ajustes', {
        guia_tracking: selectedGuia.tracking,
        servicio: selectedGuia.servicio,
        tipo: ajusteForm.tipo,
        monto: parseFloat(ajusteForm.monto),
        concepto: ajusteForm.concepto,
        notas: ajusteForm.notas,
        cliente_id: resumenGuia?.guia?.user_id,
      });
      
      setAjusteDialog(false);
      setAjusteForm({ tipo: 'cargo_extra', monto: '', concepto: '', notas: '' });
      loadResumenGuia(selectedGuia.tracking, selectedGuia.servicio);
    } catch (error) {
      console.error('Error creando ajuste:', error);
    }
  };

  // Eliminar ajuste
  const handleDeleteAjuste = async (ajusteId: number) => {
    if (!selectedGuia) return;
    
    try {
      await api.delete(`/cs/ajustes/${ajusteId}`);
      loadResumenGuia(selectedGuia.tracking, selectedGuia.servicio);
    } catch (error) {
      console.error('Error eliminando ajuste:', error);
    }
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

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" fontWeight={700}>
           & Ajustes Financieros
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
                      <Typography variant="caption">${Number(dashboard.porSemaforo?.verde?.deuda || 0).toLocaleString()}</Typography>
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
                      <Typography variant="caption">${Number(dashboard.porSemaforo?.amarillo?.deuda || 0).toLocaleString()}</Typography>
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
                      <Typography variant="caption">${Number(dashboard.porSemaforo?.rojo?.deuda || 0).toLocaleString()}</Typography>
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
                      <Typography variant="caption">${Number(dashboard.totalDeuda || 0).toLocaleString()} deuda</Typography>
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
                          <Chip size="small" label={guia.servicio} />
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
                  <MenuItem value="">Todos</MenuItem>
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
                  <MenuItem value="">Todos</MenuItem>
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
                {guias.map((guia) => (
                  <TableRow key={guia.id} hover>
                    <TableCell>{renderSemaforo(guia.semaforo)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {guia.guia_tracking}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={SERVICIOS.find(s => s.value === guia.servicio)?.label || guia.servicio} />
                    </TableCell>
                    <TableCell>
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
                      <Typography variant="body2" fontWeight={600}>
                        ${Number(guia.saldo_deudor).toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={ESTATUS_LABELS[guia.estatus_cobranza]?.label || guia.estatus_cobranza}
                        color={ESTATUS_LABELS[guia.estatus_cobranza]?.color || 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Ver detalle">
                        <IconButton size="small" onClick={() => loadResumenGuia(guia.guia_tracking, guia.servicio)}>
                          <ReceiptLongIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
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
                          ${Number(guia.saldo_deudor).toLocaleString()}
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ReceiptLongIcon />
            Detalle Financiero: {selectedGuia?.tracking}
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
                <Typography variant="body2">ID: {resumenGuia.guia?.user_id}</Typography>
              </Paper>

              {/* Resumen financiero */}
              <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  Resumen Financiero
                </Typography>
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Typography variant="body2">Costo Base:</Typography>
                  <Typography variant="body2" align="right">${resumenGuia.resumen.costo_base.toLocaleString()}</Typography>
                  
                  <Typography variant="body2" color="error">+ Cargos Extra:</Typography>
                  <Typography variant="body2" align="right" color="error">
                    ${resumenGuia.resumen.cargos_extra.toLocaleString()}
                  </Typography>
                  
                  <Typography variant="body2" color="success.main">- Descuentos:</Typography>
                  <Typography variant="body2" align="right" color="success.main">
                    ${resumenGuia.resumen.descuentos.toLocaleString()}
                  </Typography>
                  
                  <Typography variant="body2">- Pagado:</Typography>
                  <Typography variant="body2" align="right">${resumenGuia.resumen.monto_pagado.toLocaleString()}</Typography>
                  
                  <Divider sx={{ gridColumn: '1/-1', my: 1 }} />
                  
                  <Typography variant="body1" fontWeight={700}>SALDO PENDIENTE:</Typography>
                  <Typography variant="body1" fontWeight={700} align="right" color="error">
                    ${resumenGuia.resumen.saldo_pendiente.toLocaleString()}
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
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={() => setAjusteDialog(true)}
                  >
                    Nuevo Ajuste
                  </Button>
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
                            {ajuste.tipo === 'cargo_extra' ? '+' : '-'}${Number(ajuste.monto).toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">
                            {new Date(ajuste.fecha_registro).toLocaleDateString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" color="error" onClick={() => handleDeleteAjuste(ajuste.id)}>
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
            <TextField
              label="Monto"
              type="number"
              value={ajusteForm.monto}
              onChange={(e) => setAjusteForm({ ...ajusteForm, monto: e.target.value })}
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
              }}
            />
            <TextField
              label="Concepto"
              value={ajusteForm.concepto}
              onChange={(e) => setAjusteForm({ ...ajusteForm, concepto: e.target.value })}
              placeholder="Ej: Reempaque, multa almacenaje, cortesía..."
            />
            <TextField
              label="Notas (opcional)"
              multiline
              rows={2}
              value={ajusteForm.notas}
              onChange={(e) => setAjusteForm({ ...ajusteForm, notas: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAjusteDialog(false)}>Cancelar</Button>
          <Button
            variant="contained"
            color={ajusteForm.tipo === 'cargo_extra' ? 'error' : 'success'}
            onClick={handleCreateAjuste}
          >
            Aplicar
          </Button>
        </DialogActions>
      </Dialog>

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
