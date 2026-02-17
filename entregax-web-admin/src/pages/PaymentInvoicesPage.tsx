// ============================================
// PANEL ADMIN - CUENTAS POR COBRAR
// Multi-Service Payment Management
// ============================================

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  IconButton,
  InputAdornment,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Autocomplete,
} from '@mui/material';
import {
  Search,
  Add,
  Refresh,
  CheckCircle,
  Warning,
  Visibility,
} from '@mui/icons-material';
import api from '../services/api';

// Service colors and icons
const SERVICE_CONFIG: Record<string, { color: string; label: string }> = {
  aereo: { color: '#3498DB', label: '✈️ Aéreo (USA)' },
  maritimo: { color: '#1ABC9C', label: '🚢 Marítimo (China)' },
  terrestre_nacional: { color: '#E67E22', label: '🚛 Terrestre Nacional' },
  dhl_liberacion: { color: '#F1C40F', label: '📦 DHL Liberación' },
  po_box: { color: '#9B59B6', label: '📮 PO Box USA' },
};

interface PaymentInvoice {
  id: number;
  user_id: number;
  user_name?: string;
  user_email?: string;
  invoice_number: string;
  service_type: string;
  company_name: string;
  concept: string;
  description?: string;
  amount: number;
  status: 'pending' | 'partial' | 'paid' | 'cancelled';
  due_date?: string;
  reference_type?: string;
  reference_id?: number;
  created_at: string;
  paid_at?: string;
}

interface ServiceSummary {
  service: string;
  company_name: string;
  total_pending: number;
  invoice_count: number;
}

interface Client {
  id: number;
  name: string;
  email: string;
  company_name?: string;
}

export default function PaymentInvoicesPage() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<PaymentInvoice[]>([]);
  const [serviceSummary, setServiceSummary] = useState<ServiceSummary[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterService, setFilterService] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  // Create invoice dialog
  const [openCreate, setOpenCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newInvoice, setNewInvoice] = useState({
    user_id: 0,
    service_type: 'aereo',
    concept: '',
    description: '',
    amount: '',
    due_date: '',
    reference_type: '',
    reference_id: '',
  });
  
  // View details dialog
  const [selectedInvoice, setSelectedInvoice] = useState<PaymentInvoice | null>(null);

  const token = localStorage.getItem('token') || '';

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch invoices
      const invoicesRes = await api.get('/admin/payment-invoices', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (invoicesRes.data.success) {
        setInvoices(invoicesRes.data.invoices || []);
        setServiceSummary(invoicesRes.data.summary || []);
      }
      
      // Fetch clients for autocomplete
      const clientsRes = await api.get('/admin/clients', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (clientsRes.data) {
        setClients(Array.isArray(clientsRes.data) ? clientsRes.data : []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateInvoice = async () => {
    if (!newInvoice.user_id || !newInvoice.concept || !newInvoice.amount) {
      return;
    }
    
    setCreating(true);
    try {
      const response = await api.post('/admin/payment-invoices', {
        ...newInvoice,
        amount: parseFloat(newInvoice.amount),
        reference_id: newInvoice.reference_id ? parseInt(newInvoice.reference_id) : null,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.success) {
        setOpenCreate(false);
        setNewInvoice({
          user_id: 0,
          service_type: 'aereo',
          concept: '',
          description: '',
          amount: '',
          due_date: '',
          reference_type: '',
          reference_id: '',
        });
        fetchData();
      }
    } catch (error) {
      console.error('Error creating invoice:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleMarkAsPaid = async (invoiceId: number) => {
    try {
      await api.post(`/admin/payment-invoices/${invoiceId}/mark-paid`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
    } catch (error) {
      console.error('Error marking as paid:', error);
    }
  };

  const handleCancelInvoice = async (invoiceId: number) => {
    if (!window.confirm('¿Estás seguro de cancelar esta factura?')) return;
    
    try {
      await api.post(`/admin/payment-invoices/${invoiceId}/cancel`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
    } catch (error) {
      console.error('Error cancelling invoice:', error);
    }
  };

  // Filter invoices
  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = 
      inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.concept.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.user_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.user_email || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesService = filterService === 'all' || inv.service_type === filterService;
    const matchesStatus = filterStatus === 'all' || inv.status === filterStatus;
    
    return matchesSearch && matchesService && matchesStatus;
  });

  // Calculate totals
  const totalPending = invoices
    .filter(inv => inv.status === 'pending' || inv.status === 'partial')
    .reduce((sum, inv) => sum + Number(inv.amount), 0);
  
  const totalPaid = invoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + Number(inv.amount), 0);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusChip = (status: string) => {
    const config: Record<string, { color: 'warning' | 'success' | 'error' | 'default'; label: string }> = {
      pending: { color: 'warning', label: '⏳ Pendiente' },
      partial: { color: 'warning', label: '📊 Parcial' },
      paid: { color: 'success', label: '✅ Pagado' },
      cancelled: { color: 'error', label: '❌ Cancelado' },
    };
    const cfg = config[status] || { color: 'default', label: status };
    return <Chip size="small" color={cfg.color} label={cfg.label} />;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" color="#111">
            💳 Cuentas por Cobrar
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gestión de facturas multi-servicio (Multi-RFC)
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={fetchData}
          >
            Actualizar
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setOpenCreate(true)}
            sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#D04A20' } }}
          >
            Nueva Factura
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 3 }}>
          <Card sx={{ bgcolor: '#FFF3E0' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">Total Pendiente</Typography>
              <Typography variant="h4" fontWeight="bold" color="#F05A28">
                {formatCurrency(totalPending)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {invoices.filter(i => i.status === 'pending').length} facturas
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <Card sx={{ bgcolor: '#E8F5E9' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">Total Cobrado</Typography>
              <Typography variant="h4" fontWeight="bold" color="#4CAF50">
                {formatCurrency(totalPaid)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {invoices.filter(i => i.status === 'paid').length} facturas
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Summary by service */}
        {serviceSummary.slice(0, 2).map(s => (
          <Grid size={{ xs: 12, md: 3 }} key={s.service}>
            <Card sx={{ bgcolor: `${SERVICE_CONFIG[s.service]?.color}15` }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  {SERVICE_CONFIG[s.service]?.label || s.service}
                </Typography>
                <Typography variant="h5" fontWeight="bold" color={SERVICE_CONFIG[s.service]?.color}>
                  {formatCurrency(s.total_pending)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {s.invoice_count} facturas pendientes
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Buscar por # factura, concepto, cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Servicio</InputLabel>
              <Select
                value={filterService}
                label="Servicio"
                onChange={(e) => setFilterService(e.target.value)}
              >
                <MenuItem value="all">Todos los servicios</MenuItem>
                {Object.entries(SERVICE_CONFIG).map(([key, cfg]) => (
                  <MenuItem key={key} value={key}>{cfg.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Estado</InputLabel>
              <Select
                value={filterStatus}
                label="Estado"
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <MenuItem value="all">Todos</MenuItem>
                <MenuItem value="pending">Pendiente</MenuItem>
                <MenuItem value="partial">Parcial</MenuItem>
                <MenuItem value="paid">Pagado</MenuItem>
                <MenuItem value="cancelled">Cancelado</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Typography variant="body2" color="text.secondary">
              {filteredInvoices.length} de {invoices.length} facturas
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      {/* Invoices Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead sx={{ bgcolor: '#F5F5F5' }}>
            <TableRow>
              <TableCell>Folio</TableCell>
              <TableCell>Servicio</TableCell>
              <TableCell>Cliente</TableCell>
              <TableCell>Concepto</TableCell>
              <TableCell align="right">Monto</TableCell>
              <TableCell>Vencimiento</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell align="center">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">No hay facturas que mostrar</Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredInvoices.map((invoice) => (
                <TableRow key={invoice.id} hover>
                  <TableCell>
                    <Typography fontWeight="600">{invoice.invoice_number}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={SERVICE_CONFIG[invoice.service_type]?.label || invoice.service_type}
                      sx={{ 
                        bgcolor: `${SERVICE_CONFIG[invoice.service_type]?.color}20`,
                        color: SERVICE_CONFIG[invoice.service_type]?.color,
                        fontWeight: 600,
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{invoice.user_name || `User #${invoice.user_id}`}</Typography>
                    <Typography variant="caption" color="text.secondary">{invoice.user_email}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                      {invoice.concept}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontWeight="600">{formatCurrency(Number(invoice.amount))}</Typography>
                  </TableCell>
                  <TableCell>
                    {invoice.due_date && (
                      <Typography 
                        variant="body2" 
                        color={new Date(invoice.due_date) < new Date() ? 'error' : 'inherit'}
                      >
                        {formatDate(invoice.due_date)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{getStatusChip(invoice.status)}</TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                      <IconButton 
                        size="small" 
                        onClick={() => setSelectedInvoice(invoice)}
                        title="Ver detalles"
                      >
                        <Visibility fontSize="small" />
                      </IconButton>
                      {invoice.status === 'pending' && (
                        <>
                          <IconButton 
                            size="small" 
                            color="success"
                            onClick={() => handleMarkAsPaid(invoice.id)}
                            title="Marcar como pagado"
                          >
                            <CheckCircle fontSize="small" />
                          </IconButton>
                          <IconButton 
                            size="small" 
                            color="error"
                            onClick={() => handleCancelInvoice(invoice.id)}
                            title="Cancelar"
                          >
                            <Warning fontSize="small" />
                          </IconButton>
                        </>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create Invoice Dialog */}
      <Dialog open={openCreate} onClose={() => setOpenCreate(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#F05A28', color: '#FFF' }}>
          ➕ Nueva Factura de Cobro
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12 }}>
              <Autocomplete
                options={clients}
                getOptionLabel={(option) => `${option.name} (${option.email})`}
                renderInput={(params) => (
                  <TextField {...params} label="Cliente *" placeholder="Buscar cliente..." />
                )}
                onChange={(_, value) => setNewInvoice({ ...newInvoice, user_id: value?.id || 0 })}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControl fullWidth>
                <InputLabel>Servicio *</InputLabel>
                <Select
                  value={newInvoice.service_type}
                  label="Servicio *"
                  onChange={(e) => setNewInvoice({ ...newInvoice, service_type: e.target.value })}
                >
                  {Object.entries(SERVICE_CONFIG).map(([key, cfg]) => (
                    <MenuItem key={key} value={key}>{cfg.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Concepto *"
                value={newInvoice.concept}
                onChange={(e) => setNewInvoice({ ...newInvoice, concept: e.target.value })}
                placeholder="Ej: Flete marítimo contenedor #123"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Descripción"
                value={newInvoice.description}
                onChange={(e) => setNewInvoice({ ...newInvoice, description: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                type="number"
                label="Monto (MXN) *"
                value={newInvoice.amount}
                onChange={(e) => setNewInvoice({ ...newInvoice, amount: e.target.value })}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                type="date"
                label="Fecha de vencimiento"
                value={newInvoice.due_date}
                onChange={(e) => setNewInvoice({ ...newInvoice, due_date: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Tipo de referencia"
                value={newInvoice.reference_type}
                onChange={(e) => setNewInvoice({ ...newInvoice, reference_type: e.target.value })}
                placeholder="Ej: package, consolidation"
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                type="number"
                label="ID de referencia"
                value={newInvoice.reference_id}
                onChange={(e) => setNewInvoice({ ...newInvoice, reference_id: e.target.value })}
              />
            </Grid>
          </Grid>
          
          <Alert severity="info" sx={{ mt: 2 }}>
            La factura se creará para el servicio seleccionado con su respectiva razón social y RFC.
            El cliente podrá ver la CLABE de pago correspondiente en su app móvil.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCreate(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleCreateInvoice}
            disabled={creating || !newInvoice.user_id || !newInvoice.concept || !newInvoice.amount}
            sx={{ bgcolor: '#F05A28' }}
          >
            {creating ? 'Creando...' : 'Crear Factura'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Invoice Details Dialog */}
      <Dialog open={!!selectedInvoice} onClose={() => setSelectedInvoice(null)} maxWidth="sm" fullWidth>
        {selectedInvoice && (
          <>
            <DialogTitle sx={{ 
              bgcolor: SERVICE_CONFIG[selectedInvoice.service_type]?.color || '#666', 
              color: '#FFF' 
            }}>
              📄 {selectedInvoice.invoice_number}
            </DialogTitle>
            <DialogContent sx={{ pt: 3 }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="text.secondary">Servicio</Typography>
                  <Typography>{SERVICE_CONFIG[selectedInvoice.service_type]?.label}</Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="text.secondary">Estado</Typography>
                  <Box>{getStatusChip(selectedInvoice.status)}</Box>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Typography variant="caption" color="text.secondary">Cliente</Typography>
                  <Typography>{selectedInvoice.user_name || `User #${selectedInvoice.user_id}`}</Typography>
                  <Typography variant="body2" color="text.secondary">{selectedInvoice.user_email}</Typography>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Typography variant="caption" color="text.secondary">Concepto</Typography>
                  <Typography>{selectedInvoice.concept}</Typography>
                </Grid>
                {selectedInvoice.description && (
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="caption" color="text.secondary">Descripción</Typography>
                    <Typography variant="body2">{selectedInvoice.description}</Typography>
                  </Grid>
                )}
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="text.secondary">Monto</Typography>
                  <Typography variant="h5" fontWeight="bold" color="#F05A28">
                    {formatCurrency(Number(selectedInvoice.amount))}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="text.secondary">Vencimiento</Typography>
                  <Typography>{selectedInvoice.due_date ? formatDate(selectedInvoice.due_date) : 'Sin fecha'}</Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="text.secondary">Creado</Typography>
                  <Typography variant="body2">{formatDate(selectedInvoice.created_at)}</Typography>
                </Grid>
                {selectedInvoice.paid_at && (
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" color="text.secondary">Pagado</Typography>
                    <Typography variant="body2">{formatDate(selectedInvoice.paid_at)}</Typography>
                  </Grid>
                )}
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedInvoice(null)}>Cerrar</Button>
              {selectedInvoice.status === 'pending' && (
                <Button
                  variant="contained"
                  color="success"
                  onClick={() => {
                    handleMarkAsPaid(selectedInvoice.id);
                    setSelectedInvoice(null);
                  }}
                >
                  Marcar como Pagado
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
