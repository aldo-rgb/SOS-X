// ============================================
// PANEL DE CRÉDITOS POR SERVICIO (Multi-RFC)
// Gestión de líneas de crédito separadas por empresa
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Button,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  InputAdornment,
  Grid,
  Card,
  CardContent,
  Collapse,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  TableContainer,
} from '@mui/material';
import {
  Edit as EditIcon,
  // Warning as WarningIcon, // No se usa actualmente
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  // LocalShipping, // No se usa actualmente
  // Flight, // No se usa actualmente
  // DirectionsBoat, // No se usa actualmente
  // Inventory, // No se usa actualmente
  Save as SaveIcon,
} from '@mui/icons-material';
import api from '../services/api';

const ORANGE = '#F05A28';
const GREEN = '#4CAF50';
const RED = '#F44336';

// Colores por servicio
const SERVICE_COLORS: Record<string, string> = {
  aereo: '#3498DB',
  maritimo: '#1ABC9C',
  terrestre_nacional: '#E67E22',
  dhl_liberacion: '#F1C40F',
  po_box: '#9B59B6'
};

const SERVICE_LABELS: Record<string, string> = {
  aereo: '✈️ Aéreo',
  maritimo: '🚢 Marítimo',
  terrestre_nacional: '🚚 Terrestre',
  dhl_liberacion: '📦 DHL',
  po_box: '📬 PO Box'
};

interface ServiceCredit {
  id?: number;
  service: string;
  company_name?: string;
  credit_limit: number;
  used_credit: number;
  available_credit: number;
  credit_days: number;
  is_blocked: boolean;
  pending_invoices?: number;
  overdue_amount?: number;
  notes?: string;
}

interface Client {
  id: number;
  full_name: string;
  email: string;
  box_id: string;
  company_name: string;
  service_credits: ServiceCredit[];
  total_credit_limit: number;
  total_used_credit: number;
  total_available_credit: number;
  has_any_blocked: boolean;
  has_overdue: boolean;
}

// ServiceStats interface removido - no se usa actualmente

interface SummaryData {
  services: Array<{
    service: string;
    company_name: string;
    rfc: string;
    clients_with_credit: number;
    total_credit_limit: number;
    total_credit_used: number;
    total_credit_available: number;
    blocked_clients: number;
    pending_amount: number;
    overdue_amount: number;
  }>;
  totals: {
    total_credit_limit: number;
    total_credit_used: number;
    total_credit_available: number;
    pending_amount: number;
    overdue_amount: number;
    clients_with_credit: number;
  };
}

export default function ServiceCreditManagementPanel() {
  const [clients, setClients] = useState<Client[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterService, setFilterService] = useState('all');
  const [filterHasCredit, setFilterHasCredit] = useState(false);
  const [filterBlocked, setFilterBlocked] = useState(false);
  
  // Estado para expandir filas
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  
  // Modal de edición
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editCredits, setEditCredits] = useState<ServiceCredit[]>([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Cargar resumen y clientes en paralelo
      const [summaryRes, clientsRes] = await Promise.all([
        api.get('/admin/service-credits/summary'),
        api.get('/admin/service-credits/clients', {
          params: {
            service: filterService !== 'all' ? filterService : undefined,
            hasCredit: filterHasCredit ? 'true' : undefined,
            isBlocked: filterBlocked ? 'true' : undefined,
            search: searchTerm || undefined
          }
        })
      ]);
      
      setSummary(summaryRes.data);
      setClients(clientsRes.data.clients || []);
    } catch (error) {
      console.error('Error loading service credits:', error);
    } finally {
      setLoading(false);
    }
  }, [filterService, filterHasCredit, filterBlocked, searchTerm]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleRow = (clientId: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(clientId)) {
      newExpanded.delete(clientId);
    } else {
      newExpanded.add(clientId);
    }
    setExpandedRows(newExpanded);
  };

  const handleOpenEdit = async (client: Client) => {
    setSelectedClient(client);
    
    // Si el cliente no tiene créditos, crear estructura vacía para todos los servicios
    if (client.service_credits.length === 0) {
      const services = ['aereo', 'maritimo', 'terrestre_nacional', 'dhl_liberacion', 'po_box'];
      setEditCredits(services.map(s => ({
        service: s,
        credit_limit: 0,
        used_credit: 0,
        available_credit: 0,
        credit_days: 15,
        is_blocked: false
      })));
    } else {
      // Asegurar que todos los servicios estén presentes
      const services = ['aereo', 'maritimo', 'terrestre_nacional', 'dhl_liberacion', 'po_box'];
      const existingServices = client.service_credits.map(c => c.service);
      const credits = [...client.service_credits];
      
      services.forEach(s => {
        if (!existingServices.includes(s)) {
          credits.push({
            service: s,
            credit_limit: 0,
            used_credit: 0,
            available_credit: 0,
            credit_days: 15,
            is_blocked: false
          });
        }
      });
      
      setEditCredits(credits);
    }
    
    setOpenModal(true);
  };

  const handleCreditChange = (service: string, field: string, value: any) => {
    setEditCredits(prev => prev.map(c => 
      c.service === service 
        ? { ...c, [field]: value }
        : c
    ));
  };

  const handleSaveCredits = async () => {
    if (!selectedClient) return;
    
    try {
      setSaving(true);
      await api.put(`/admin/service-credits/${selectedClient.id}`, {
        credits: editCredits.map(c => ({
          service: c.service,
          credit_limit: c.credit_limit,
          credit_days: c.credit_days,
          is_blocked: c.is_blocked,
          notes: c.notes
        }))
      });
      alert(`✅ Créditos actualizados para ${selectedClient.full_name}`);
      setOpenModal(false);
      loadData();
    } catch (error) {
      console.error('Error saving credits:', error);
      alert("Error al guardar los créditos");
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(num || 0);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Dashboard de Resumen por Servicio */}
      <Typography variant="h6" fontWeight="bold" gutterBottom>
        💳 Créditos por Servicio (Multi-RFC)
      </Typography>
      
      {summary && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {summary.services.map(svc => (
            <Grid size={{ xs: 12, sm: 6, md: 2.4 }} key={svc.service}>
              <Card sx={{ 
                bgcolor: `${SERVICE_COLORS[svc.service]}15`,
                borderLeft: `4px solid ${SERVICE_COLORS[svc.service]}`
              }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="subtitle2" fontWeight="bold" color={SERVICE_COLORS[svc.service]}>
                    {SERVICE_LABELS[svc.service] || svc.service}
                  </Typography>
                  <Typography variant="caption" display="block" color="text.secondary">
                    {svc.company_name}
                  </Typography>
                  <Divider sx={{ my: 0.5 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                    <Typography variant="caption">Límite:</Typography>
                    <Typography variant="caption" fontWeight="bold">
                      {formatCurrency(svc.total_credit_limit)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption">Usado:</Typography>
                    <Typography variant="caption" fontWeight="bold" color="warning.main">
                      {formatCurrency(svc.total_credit_used)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption">Vencido:</Typography>
                    <Typography variant="caption" fontWeight="bold" color="error.main">
                      {formatCurrency(svc.overdue_amount)}
                    </Typography>
                  </Box>
                  <Chip 
                    size="small" 
                    label={`${svc.clients_with_credit} clientes`}
                    sx={{ mt: 0.5, fontSize: '0.65rem', height: 20 }}
                  />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Totales Globales */}
      {summary && (
        <Paper sx={{ p: 2, mb: 3, bgcolor: '#111', color: 'white' }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 2.4 }}>
              <Typography variant="caption" color="grey.400">CRÉDITO TOTAL OTORGADO</Typography>
              <Typography variant="h6" fontWeight="bold" color={ORANGE}>
                {formatCurrency(summary.totals.total_credit_limit)}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 2.4 }}>
              <Typography variant="caption" color="grey.400">CRÉDITO USADO</Typography>
              <Typography variant="h6" fontWeight="bold" color="warning.main">
                {formatCurrency(summary.totals.total_credit_used)}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 2.4 }}>
              <Typography variant="caption" color="grey.400">CRÉDITO DISPONIBLE</Typography>
              <Typography variant="h6" fontWeight="bold" color={GREEN}>
                {formatCurrency(summary.totals.total_credit_available)}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 2.4 }}>
              <Typography variant="caption" color="grey.400">MONTO VENCIDO</Typography>
              <Typography variant="h6" fontWeight="bold" color="error.main">
                {formatCurrency(summary.totals.overdue_amount)}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 2.4 }}>
              <Typography variant="caption" color="grey.400">CLIENTES CON CRÉDITO</Typography>
              <Typography variant="h6" fontWeight="bold">
                {summary.totals.clients_with_credit}
              </Typography>
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* Filtros */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Buscar por nombre, email, Box ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Servicio</InputLabel>
              <Select
                value={filterService}
                label="Servicio"
                onChange={(e) => setFilterService(e.target.value)}
              >
                <MenuItem value="all">Todos</MenuItem>
                {Object.entries(SERVICE_LABELS).map(([key, label]) => (
                  <MenuItem key={key} value={key}>{label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <FormControlLabel
              control={
                <Switch 
                  checked={filterHasCredit} 
                  onChange={(e) => setFilterHasCredit(e.target.checked)}
                  size="small"
                />
              }
              label="Con crédito"
            />
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <FormControlLabel
              control={
                <Switch 
                  checked={filterBlocked} 
                  onChange={(e) => setFilterBlocked(e.target.checked)}
                  size="small"
                  color="error"
                />
              }
              label="Bloqueados/Vencidos"
            />
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Button variant="outlined" onClick={loadData} fullWidth>
              🔄 Actualizar
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Tabla de Clientes */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead sx={{ bgcolor: '#222' }}>
            <TableRow>
              <TableCell sx={{ color: 'white', width: 50 }}></TableCell>
              <TableCell sx={{ color: 'white' }}>Cliente</TableCell>
              <TableCell sx={{ color: 'white', textAlign: 'center' }}>Créditos Activos</TableCell>
              <TableCell sx={{ color: 'white', textAlign: 'right' }}>Límite Total</TableCell>
              <TableCell sx={{ color: 'white', textAlign: 'right' }}>Usado Total</TableCell>
              <TableCell sx={{ color: 'white', textAlign: 'right' }}>Disponible</TableCell>
              <TableCell sx={{ color: 'white', textAlign: 'center' }}>Estado</TableCell>
              <TableCell sx={{ color: 'white', textAlign: 'center' }}>Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">No hay clientes que mostrar</Typography>
                </TableCell>
              </TableRow>
            ) : (
              clients.map((client) => (
                <React.Fragment key={client.id}>
                  {/* Fila principal */}
                  <TableRow 
                    hover
                    sx={{ 
                      bgcolor: client.has_any_blocked || client.has_overdue 
                        ? 'rgba(244, 67, 54, 0.05)' 
                        : 'inherit',
                      cursor: 'pointer'
                    }}
                  >
                    <TableCell onClick={() => toggleRow(client.id)}>
                      <IconButton size="small">
                        {expandedRows.has(client.id) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </TableCell>
                    <TableCell onClick={() => toggleRow(client.id)}>
                      <Typography variant="body2" fontWeight="bold">{client.full_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {client.box_id} • {client.email}
                      </Typography>
                      {client.company_name && (
                        <Typography variant="caption" display="block" color="primary">
                          🏢 {client.company_name}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {client.service_credits
                          .filter(c => parseFloat(String(c.credit_limit)) > 0)
                          .map(c => (
                            <Chip
                              key={c.service}
                              size="small"
                              label={SERVICE_LABELS[c.service]?.split(' ')[0] || c.service}
                              sx={{ 
                                bgcolor: `${SERVICE_COLORS[c.service]}20`,
                                color: SERVICE_COLORS[c.service],
                                fontSize: '0.65rem',
                                height: 20
                              }}
                            />
                          ))
                        }
                        {client.service_credits.filter(c => parseFloat(String(c.credit_limit)) > 0).length === 0 && (
                          <Typography variant="caption" color="text.secondary">Sin crédito</Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight="bold">
                        {formatCurrency(client.total_credit_limit)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography 
                        variant="body2" 
                        fontWeight="bold"
                        color={client.total_used_credit > 0 ? 'warning.main' : 'inherit'}
                      >
                        {formatCurrency(client.total_used_credit)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography 
                        variant="body2" 
                        fontWeight="bold"
                        color={GREEN}
                      >
                        {formatCurrency(client.total_available_credit)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      {client.has_any_blocked && (
                        <Chip size="small" label="Bloqueado" color="error" sx={{ fontSize: '0.65rem' }} />
                      )}
                      {client.has_overdue && !client.has_any_blocked && (
                        <Chip size="small" label="Vencido" color="warning" sx={{ fontSize: '0.65rem' }} />
                      )}
                      {!client.has_any_blocked && !client.has_overdue && client.total_credit_limit > 0 && (
                        <Chip size="small" label="Activo" color="success" sx={{ fontSize: '0.65rem' }} />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Editar créditos">
                        <IconButton size="small" onClick={() => handleOpenEdit(client)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  
                  {/* Fila expandida - Detalle por servicio */}
                  <TableRow>
                    <TableCell colSpan={8} sx={{ py: 0, bgcolor: '#FAFAFA' }}>
                      <Collapse in={expandedRows.has(client.id)} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 2 }}>
                          <Typography variant="subtitle2" gutterBottom fontWeight="bold">
                            Detalle de Créditos por Servicio
                          </Typography>
                          <Grid container spacing={1}>
                            {client.service_credits.length > 0 ? (
                              client.service_credits.map(credit => (
                                <Grid size={{ xs: 12, sm: 6, md: 2.4 }} key={credit.service}>
                                  <Paper 
                                    variant="outlined" 
                                    sx={{ 
                                      p: 1.5,
                                      borderLeft: `3px solid ${SERVICE_COLORS[credit.service]}`,
                                      opacity: parseFloat(String(credit.credit_limit)) > 0 ? 1 : 0.5
                                    }}
                                  >
                                    <Typography variant="caption" fontWeight="bold" color={SERVICE_COLORS[credit.service]}>
                                      {SERVICE_LABELS[credit.service]}
                                    </Typography>
                                    {credit.is_blocked && (
                                      <Chip size="small" label="BLOQ" color="error" sx={{ ml: 1, height: 16, fontSize: '0.6rem' }} />
                                    )}
                                    <Divider sx={{ my: 0.5 }} />
                                    <Box sx={{ fontSize: '0.75rem' }}>
                                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Límite:</span>
                                        <strong>{formatCurrency(credit.credit_limit)}</strong>
                                      </Box>
                                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Usado:</span>
                                        <span style={{ color: parseFloat(String(credit.used_credit)) > 0 ? ORANGE : 'inherit' }}>
                                          {formatCurrency(credit.used_credit)}
                                        </span>
                                      </Box>
                                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Disponible:</span>
                                        <span style={{ color: GREEN }}>
                                          {formatCurrency(credit.available_credit)}
                                        </span>
                                      </Box>
                                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Días:</span>
                                        <span>{credit.credit_days}</span>
                                      </Box>
                                      {parseFloat(String(credit.overdue_amount || 0)) > 0 && (
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', color: RED }}>
                                          <span>Vencido:</span>
                                          <strong>{formatCurrency(credit.overdue_amount || 0)}</strong>
                                        </Box>
                                      )}
                                    </Box>
                                  </Paper>
                                </Grid>
                              ))
                            ) : (
                              <Grid size={{ xs: 12 }}>
                                <Typography variant="body2" color="text.secondary" textAlign="center">
                                  Este cliente no tiene créditos asignados. Haz clic en editar para asignar.
                                </Typography>
                              </Grid>
                            )}
                          </Grid>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Modal de Edición de Créditos */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: ORANGE, color: 'white' }}>
          💳 Editar Créditos - {selectedClient?.full_name}
          <Typography variant="caption" display="block">
            {selectedClient?.email} • {selectedClient?.box_id}
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            Configura el crédito para cada servicio de forma independiente. Cada servicio corresponde a un RFC diferente.
          </Alert>
          
          <Grid container spacing={2}>
            {editCredits.map(credit => (
              <Grid size={{ xs: 12, md: 6 }} key={credit.service}>
                <Paper 
                  variant="outlined" 
                  sx={{ 
                    p: 2,
                    borderLeft: `4px solid ${SERVICE_COLORS[credit.service]}`
                  }}
                >
                  <Typography variant="subtitle1" fontWeight="bold" color={SERVICE_COLORS[credit.service]} gutterBottom>
                    {SERVICE_LABELS[credit.service]}
                  </Typography>
                  
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 6 }}>
                      <TextField
                        label="Límite de Crédito"
                        type="number"
                        size="small"
                        fullWidth
                        value={credit.credit_limit}
                        onChange={(e) => handleCreditChange(credit.service, 'credit_limit', parseFloat(e.target.value) || 0)}
                        InputProps={{
                          startAdornment: <InputAdornment position="start">$</InputAdornment>,
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <TextField
                        label="Días de Crédito"
                        type="number"
                        size="small"
                        fullWidth
                        value={credit.credit_days}
                        onChange={(e) => handleCreditChange(credit.service, 'credit_days', parseInt(e.target.value) || 15)}
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <FormControlLabel
                        control={
                          <Switch 
                            checked={credit.is_blocked}
                            onChange={(e) => handleCreditChange(credit.service, 'is_blocked', e.target.checked)}
                            color="error"
                          />
                        }
                        label={
                          <Typography variant="body2" color={credit.is_blocked ? 'error' : 'inherit'}>
                            {credit.is_blocked ? '🚫 Crédito BLOQUEADO' : 'Crédito activo'}
                          </Typography>
                        }
                      />
                    </Grid>
                  </Grid>
                  
                  {parseFloat(String(credit.used_credit)) > 0 && (
                    <Alert severity="warning" sx={{ mt: 1 }}>
                      Crédito en uso: {formatCurrency(credit.used_credit)}
                    </Alert>
                  )}
                </Paper>
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#F5F5F5' }}>
          <Button onClick={() => setOpenModal(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button 
            variant="contained" 
            onClick={handleSaveCredits}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#D84A1B' } }}
          >
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
