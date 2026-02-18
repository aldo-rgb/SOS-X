// ============================================
// EXCHANGE RATE CONFIG PAGE
// Panel de configuración de tipo de cambio por servicio
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
  IconButton,
  Alert,
  Snackbar,
  Chip,
  Card,
  CardContent,
  Grid,
  InputAdornment,
  Tooltip,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Refresh as RefreshIcon,
  CurrencyExchange as ExchangeIcon,
  TrendingUp as TrendingUpIcon,
  History as HistoryIcon,
  Api as ApiIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';

interface ExchangeRateConfig {
  id: number;
  servicio: string;
  nombre_display: string;
  tipo_cambio_manual: number | null;
  sobreprecio: number;
  sobreprecio_porcentaje: number;
  usar_api: boolean;
  tipo_cambio_final: number;
  ultima_actualizacion: string;
  estado: boolean;
}

interface HistoryRecord {
  id: number;
  servicio: string;
  tipo_cambio_api: number | null;
  tipo_cambio_manual: number | null;
  sobreprecio: number;
  tipo_cambio_final: number;
  fuente: string;
  created_at: string;
}

export default function ExchangeRateConfigPage() {
  const token = localStorage.getItem('token');
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Estados
  const [configs, setConfigs] = useState<ExchangeRateConfig[]>([]);
  const [tipoCambioApi, setTipoCambioApi] = useState<number | null>(null);
  const [fuenteApi, setFuenteApi] = useState<string>('');
  const [apiConectada, setApiConectada] = useState<boolean>(true);
  const [alertasActivas, setAlertasActivas] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'info' | 'warning' });

  // Historial
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [selectedServicio, setSelectedServicio] = useState<string>('');

  // Cargar datos
  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/exchange-rate/config`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setConfigs(data.configuraciones || []);
        setTipoCambioApi(data.tipo_cambio_api);
        setFuenteApi(data.fuente_api || '');
        setApiConectada(data.api_conectada !== false);
        setAlertasActivas(data.alertas_activas || []);
      }
    } catch (_err) {
      console.error('Error cargando configuración:', _err);
      setSnackbar({ open: true, message: 'Error al cargar configuración', severity: 'error' });
    }
  }, [API_URL, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refrescar todos los tipos de cambio desde API
  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/exchange-rate/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        const severity = data.api_conectada ? 'success' : 'warning';
        setSnackbar({ 
          open: true, 
          message: data.mensaje || `TC actualizado: $${data.tipo_cambio_base}`, 
          severity 
        });
        fetchData();
      } else {
        throw new Error('Error al refrescar');
      }
    } catch {
      setSnackbar({ open: true, message: 'Error al actualizar tipos de cambio', severity: 'error' });
    } finally {
      setRefreshing(false);
    }
  };

  // Editar configuración
  const handleEdit = (config: ExchangeRateConfig) => {
    setEditingId(config.id);
    setEditValues({
      tipo_cambio_manual: config.tipo_cambio_manual,
      sobreprecio: config.sobreprecio,
      sobreprecio_porcentaje: config.sobreprecio_porcentaje,
      usar_api: config.usar_api
    });
  };

  const handleSave = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/exchange-rate/config/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(editValues)
      });

      if (response.ok) {
        setSnackbar({ open: true, message: 'Configuración guardada', severity: 'success' });
        setEditingId(null);
        fetchData();
      } else {
        throw new Error('Error al guardar');
      }
    } catch {
      setSnackbar({ open: true, message: 'Error al guardar configuración', severity: 'error' });
    }
  };

  // Ver historial
  const handleViewHistory = async (servicio: string) => {
    setSelectedServicio(servicio);
    try {
      const response = await fetch(`${API_URL}/api/admin/exchange-rate/history?servicio=${servicio}&limit=20`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setHistory(data.historial || []);
        setHistoryOpen(true);
      }
    } catch {
      setSnackbar({ open: true, message: 'Error al cargar historial', severity: 'error' });
    }
  };

  // Calcular TC Final en tiempo real para preview
  const calculatePreviewTC = () => {
    if (!editValues) return '---';
    
    const base = editValues.usar_api && tipoCambioApi 
      ? tipoCambioApi 
      : (Number(editValues.tipo_cambio_manual) || 17.50);
    
    let final = Number(base);
    if (editValues.sobreprecio) final += Number(editValues.sobreprecio) || 0;
    if (editValues.sobreprecio_porcentaje) final += base * ((Number(editValues.sobreprecio_porcentaje) || 0) / 100);
    
    return final.toFixed(4);
  };

  const getServiceIcon = (servicio: string) => {
    const icons: Record<string, string> = {
      'tdi': '✈️',
      'maritimo': '🚢',
      'pobox_usa': '📦',
      'dhl_monterrey': '🚚',
      'pago_proveedores': '💳'
    };
    return icons[servicio] || '📋';
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ExchangeIcon color="primary" /> Configuración de Tipo de Cambio
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gestión de sobreprecio por servicio y fuente de tipo de cambio
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="success"
          startIcon={<RefreshIcon />}
          onClick={handleRefreshAll}
          disabled={refreshing}
        >
          {refreshing ? 'Actualizando...' : 'Actualizar desde API'}
        </Button>
      </Box>

      {refreshing && <LinearProgress sx={{ mb: 2 }} />}

      {/* Alerta si hay desconexión de API */}
      {!apiConectada && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <strong>⚠️ APIs de Tipo de Cambio Desconectadas</strong><br />
          El sistema está usando el último tipo de cambio conocido. Fuente actual: <strong>{fuenteApi}</strong>.
          Verifique la conectividad o configure un tipo de cambio manual.
        </Alert>
      )}

      {/* Alertas activas */}
      {alertasActivas.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <strong>🚨 Alertas Activas ({alertasActivas.length})</strong><br />
          {alertasActivas[0]?.mensaje || 'Hay alertas pendientes de resolver'}
        </Alert>
      )}

      {/* Card con TC API actual */}
      <Card sx={{ mb: 3, bgcolor: apiConectada ? '#e3f2fd' : '#fff3e0' }}>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
            <Grid size={{ xs: 12, md: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ApiIcon color={apiConectada ? 'primary' : 'warning'} />
                <Typography variant="subtitle2" color="text.secondary">
                  Tipo de Cambio {apiConectada ? `(${fuenteApi || 'API'})` : '(Fallback)'}
                </Typography>
              </Box>
              <Typography variant="h3" color={apiConectada ? 'primary' : 'warning.main'} fontWeight="bold">
                ${tipoCambioApi ? Number(tipoCambioApi).toFixed(4) : '---'}
              </Typography>
              {!apiConectada && (
                <Chip 
                  label="⚠️ Usando respaldo" 
                  color="warning" 
                  size="small" 
                  sx={{ mt: 1 }} 
                />
              )}
            </Grid>
            <Grid size={{ xs: 12, md: 8 }}>
              <Alert severity={apiConectada ? 'info' : 'warning'} icon={<TrendingUpIcon />}>
                {apiConectada ? (
                  <>El tipo de cambio se obtiene de Banxico/ExchangeRate-API. Cada servicio puede tener un sobreprecio 
                  configurado que se suma al tipo de cambio base para calcular el tipo de cambio final.</>
                ) : (
                  <>⚠️ <strong>El sistema está usando el último tipo de cambio conocido.</strong> Las APIs de Banxico y 
                  ExchangeRate no están disponibles. Si la desconexión supera 12 horas, se notificará al administrador y director.</>
                )}
              </Alert>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Tabla de configuración */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsIcon color="primary" /> Configuración por Servicio
        </Typography>
        
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell><strong>Servicio</strong></TableCell>
                <TableCell><strong>Fuente</strong></TableCell>
                <TableCell><strong>TC Manual</strong></TableCell>
                <TableCell><strong>Sobreprecio ($)</strong></TableCell>
                <TableCell><strong>Sobreprecio (%)</strong></TableCell>
                <TableCell><strong>TC Final</strong></TableCell>
                <TableCell><strong>Última Actualización</strong></TableCell>
                <TableCell align="center"><strong>Acciones</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {configs.map((config) => (
                <TableRow key={config.id} sx={{ '&:hover': { bgcolor: '#fafafa' } }}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography fontSize="1.5rem">{getServiceIcon(config.servicio)}</Typography>
                      <Box>
                        <Typography fontWeight="bold">{config.nombre_display}</Typography>
                        <Typography variant="caption" color="text.secondary">{config.servicio}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {editingId === config.id ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Switch
                          checked={editValues.usar_api as boolean}
                          onChange={(e) => setEditValues({ ...editValues, usar_api: e.target.checked })}
                          size="small"
                        />
                        <Typography variant="body2">
                          {editValues.usar_api ? 'API' : 'Manual'}
                        </Typography>
                      </Box>
                    ) : (
                      <Chip 
                        label={config.usar_api ? 'API' : 'Manual'} 
                        color={config.usar_api ? 'success' : 'warning'}
                        size="small"
                        icon={config.usar_api ? <ApiIcon /> : <EditIcon />}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === config.id ? (
                      <TextField
                        size="small"
                        type="number"
                        value={editValues.tipo_cambio_manual || ''}
                        onChange={(e) => setEditValues({ ...editValues, tipo_cambio_manual: e.target.value || null })}
                        placeholder="Usar API"
                        disabled={editValues.usar_api as boolean}
                        InputProps={{
                          startAdornment: <InputAdornment position="start">$</InputAdornment>
                        }}
                        sx={{ width: 120 }}
                      />
                    ) : (
                      config.tipo_cambio_manual ? `$${Number(config.tipo_cambio_manual).toFixed(4)}` : '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === config.id ? (
                      <TextField
                        size="small"
                        type="number"
                        value={editValues.sobreprecio}
                        onChange={(e) => setEditValues({ ...editValues, sobreprecio: e.target.value })}
                        InputProps={{
                          startAdornment: <InputAdornment position="start">+$</InputAdornment>
                        }}
                        sx={{ width: 100 }}
                      />
                    ) : (
                      <Chip 
                        label={`+$${Number(config.sobreprecio || 0).toFixed(2)}`} 
                        size="small"
                        color={Number(config.sobreprecio || 0) > 0 ? 'warning' : 'default'}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === config.id ? (
                      <TextField
                        size="small"
                        type="number"
                        value={editValues.sobreprecio_porcentaje}
                        onChange={(e) => setEditValues({ ...editValues, sobreprecio_porcentaje: e.target.value })}
                        InputProps={{
                          endAdornment: <InputAdornment position="end">%</InputAdornment>
                        }}
                        sx={{ width: 80 }}
                      />
                    ) : (
                      (config.sobreprecio_porcentaje || 0) > 0 ? `+${config.sobreprecio_porcentaje}%` : '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === config.id ? (
                      <Box sx={{ bgcolor: '#e8f5e9', p: 1, borderRadius: 1 }}>
                        <Typography variant="caption" color="text.secondary">Preview:</Typography>
                        <Typography fontWeight="bold" color="success.main">
                          ${calculatePreviewTC()}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="h6" color="primary" fontWeight="bold">
                        ${config.tipo_cambio_final ? Number(config.tipo_cambio_final).toFixed(4) : '---'}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {config.ultima_actualizacion 
                        ? new Date(config.ultima_actualizacion).toLocaleString('es-MX')
                        : '-'
                      }
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    {editingId === config.id ? (
                      <>
                        <Tooltip title="Guardar">
                          <IconButton color="success" onClick={() => handleSave(config.id)}>
                            <SaveIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Cancelar">
                          <IconButton color="error" onClick={() => setEditingId(null)}>
                            <CancelIcon />
                          </IconButton>
                        </Tooltip>
                      </>
                    ) : (
                      <>
                        <Tooltip title="Editar">
                          <IconButton color="primary" onClick={() => handleEdit(config)}>
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Ver historial">
                          <IconButton color="info" onClick={() => handleViewHistory(config.servicio)}>
                            <HistoryIcon />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Dialog Historial */}
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HistoryIcon color="primary" /> Historial de Tipo de Cambio - {selectedServicio}
        </DialogTitle>
        <DialogContent>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell>Fecha</TableCell>
                  <TableCell>TC API</TableCell>
                  <TableCell>TC Manual</TableCell>
                  <TableCell>Sobreprecio</TableCell>
                  <TableCell>TC Final</TableCell>
                  <TableCell>Fuente</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {history.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      {new Date(record.created_at).toLocaleString('es-MX')}
                    </TableCell>
                    <TableCell>
                      {record.tipo_cambio_api ? `$${Number(record.tipo_cambio_api).toFixed(4)}` : '-'}
                    </TableCell>
                    <TableCell>
                      {record.tipo_cambio_manual ? `$${Number(record.tipo_cambio_manual).toFixed(4)}` : '-'}
                    </TableCell>
                    <TableCell>
                      {record.sobreprecio ? `+$${Number(record.sobreprecio).toFixed(2)}` : '-'}
                    </TableCell>
                    <TableCell>
                      <strong>${record.tipo_cambio_final ? Number(record.tipo_cambio_final).toFixed(4) : '---'}</strong>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={record.fuente} 
                        size="small"
                        color={record.fuente === 'api' || record.fuente === 'api_refresh' ? 'success' : 'warning'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryOpen(false)}>Cerrar</Button>
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
