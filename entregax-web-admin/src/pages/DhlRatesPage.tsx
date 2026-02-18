// ============================================
// PANEL DE TARIFAS DHL 💰
// Gestión de precios y tarifas especiales
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
  Card,
  CardContent,
  Grid,
  Chip,
  Tooltip,
  Switch,
  FormControlLabel,
  Divider,
} from '@mui/material';
import {
  Edit as EditIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  LocalShipping as DhlIcon,
  AttachMoney as MoneyIcon,
  Person as PersonIcon,
  Star as StarIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Color DHL
const DHL_COLOR = '#D40511';
const DHL_YELLOW = '#FFCC00';

interface DhlRate {
  id: number;
  rate_type: string;
  rate_name: string;
  price_usd: number;
  description: string;
  is_active: boolean;
}

interface ClientPricing {
  id: number;
  full_name: string;
  email: string;
  box_id: string;
  dhl_standard_price: number;
  dhl_high_value_price: number;
  total_shipments: number;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export default function DhlRatesPage() {
  const [tabValue, setTabValue] = useState(0);
  const [rates, setRates] = useState<DhlRate[]>([]);
  const [clients, setClients] = useState<ClientPricing[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  
  // Dialogs
  const [editRateDialog, setEditRateDialog] = useState(false);
  const [editClientDialog, setEditClientDialog] = useState(false);
  const [selectedRate, setSelectedRate] = useState<DhlRate | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientPricing | null>(null);
  
  // Form values
  const [editRateForm, setEditRateForm] = useState({ price_usd: 0, description: '', is_active: true });
  const [editClientForm, setEditClientForm] = useState({ dhl_standard_price: 0, dhl_high_value_price: 0 });

  const fetchRates = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/admin/dhl/rates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRates(response.data);
    } catch (error) {
      console.error('Error fetching rates:', error);
      setSnackbar({ open: true, message: 'Error al cargar tarifas', severity: 'error' });
    }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/admin/dhl/client-pricing`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { search: searchTerm || undefined }
      });
      setClients(response.data);
    } catch (error) {
      console.error('Error fetching clients:', error);
      setSnackbar({ open: true, message: 'Error al cargar clientes', severity: 'error' });
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  useEffect(() => {
    if (tabValue === 1) {
      fetchClients();
    }
  }, [tabValue, fetchClients]);

  // Handlers
  const handleEditRate = (rate: DhlRate) => {
    setSelectedRate(rate);
    setEditRateForm({
      price_usd: rate.price_usd,
      description: rate.description,
      is_active: rate.is_active
    });
    setEditRateDialog(true);
  };

  const handleSaveRate = async () => {
    if (!selectedRate) return;
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/api/admin/dhl/rates/${selectedRate.id}`, editRateForm, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSnackbar({ open: true, message: 'Tarifa actualizada correctamente', severity: 'success' });
      setEditRateDialog(false);
      fetchRates();
    } catch {
      setSnackbar({ open: true, message: 'Error al actualizar tarifa', severity: 'error' });
    }
  };

  const handleEditClient = (client: ClientPricing) => {
    setSelectedClient(client);
    setEditClientForm({
      dhl_standard_price: client.dhl_standard_price,
      dhl_high_value_price: client.dhl_high_value_price
    });
    setEditClientDialog(true);
  };

  const handleSaveClient = async () => {
    if (!selectedClient) return;
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/api/admin/dhl/client-pricing/${selectedClient.id}`, editClientForm, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSnackbar({ open: true, message: 'Precios actualizados correctamente', severity: 'success' });
      setEditClientDialog(false);
      fetchClients();
    } catch {
      setSnackbar({ open: true, message: 'Error al actualizar precios', severity: 'error' });
    }
  };

  // Get default rates for comparison
  const standardRate = rates.find(r => r.rate_type === 'standard')?.price_usd || 145;
  const highValueRate = rates.find(r => r.rate_type === 'high_value')?.price_usd || 225;

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <DhlIcon sx={{ fontSize: 40, color: DHL_COLOR, mr: 2 }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Tarifas DHL Monterrey
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gestión de precios de importación y precios especiales por cliente
          </Typography>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: `4px solid ${DHL_COLOR}` }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Tarifa Standard</Typography>
              <Typography variant="h5" fontWeight="bold">${standardRate} USD</Typography>
              <Typography variant="caption" color="text.secondary">Accesorios/Mixtos</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: `4px solid ${DHL_YELLOW}` }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Tarifa High Value</Typography>
              <Typography variant="h5" fontWeight="bold">${highValueRate} USD</Typography>
              <Typography variant="caption" color="text.secondary">Sensibles</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Clientes con Precio Especial</Typography>
              <Typography variant="h5" fontWeight="bold">
                {clients.filter(c => c.dhl_standard_price !== standardRate || c.dhl_high_value_price !== highValueRate).length}
              </Typography>
              <Typography variant="caption" color="text.secondary">Con tarifa preferencial</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Total Clientes</Typography>
              <Typography variant="h5" fontWeight="bold">{clients.length}</Typography>
              <Typography variant="caption" color="text.secondary">En el sistema</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs 
          value={tabValue} 
          onChange={(_, v) => setTabValue(v)}
          sx={{ 
            borderBottom: 1, 
            borderColor: 'divider',
            '& .Mui-selected': { color: DHL_COLOR }
          }}
        >
          <Tab icon={<MoneyIcon />} label="Tarifas Base" />
          <Tab icon={<PersonIcon />} label="Precios por Cliente" />
        </Tabs>

        {/* Tab 0: Tarifas Base */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ p: 2 }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Nombre</TableCell>
                    <TableCell align="right">Precio USD</TableCell>
                    <TableCell>Descripción</TableCell>
                    <TableCell align="center">Estado</TableCell>
                    <TableCell align="center">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rates.map((rate) => (
                    <TableRow key={rate.id} hover>
                      <TableCell>
                        <Chip 
                          label={rate.rate_type === 'standard' ? 'STANDARD' : 'HIGH VALUE'} 
                          size="small"
                          sx={{ 
                            bgcolor: rate.rate_type === 'standard' ? DHL_COLOR : DHL_YELLOW,
                            color: rate.rate_type === 'standard' ? 'white' : 'black',
                            fontWeight: 'bold'
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography fontWeight="medium">{rate.rate_name}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="h6" fontWeight="bold" color={DHL_COLOR}>
                          ${rate.price_usd}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {rate.description}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip 
                          label={rate.is_active ? 'Activo' : 'Inactivo'} 
                          color={rate.is_active ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="Editar tarifa">
                          <IconButton onClick={() => handleEditRate(rate)} color="primary">
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </TabPanel>

        {/* Tab 1: Precios por Cliente */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ p: 2 }}>
            {/* Search */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
              <TextField
                size="small"
                placeholder="Buscar cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && fetchClients()}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  )
                }}
                sx={{ width: 300 }}
              />
              <Button 
                variant="outlined" 
                startIcon={<RefreshIcon />}
                onClick={fetchClients}
              >
                Buscar
              </Button>
            </Box>

            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell>Cliente</TableCell>
                    <TableCell>Box ID</TableCell>
                    <TableCell align="right">Standard (USD)</TableCell>
                    <TableCell align="right">High Value (USD)</TableCell>
                    <TableCell align="center">Envíos</TableCell>
                    <TableCell align="center">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {clients.map((client) => {
                    const hasSpecialPrice = client.dhl_standard_price !== standardRate || 
                                           client.dhl_high_value_price !== highValueRate;
                    return (
                      <TableRow key={client.id} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {hasSpecialPrice && (
                              <Tooltip title="Precio especial">
                                <StarIcon sx={{ color: DHL_YELLOW, fontSize: 20 }} />
                              </Tooltip>
                            )}
                            <Box>
                              <Typography fontWeight="medium">{client.full_name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {client.email}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip label={client.box_id} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell align="right">
                          <Typography 
                            fontWeight="bold" 
                            color={client.dhl_standard_price !== standardRate ? DHL_COLOR : 'inherit'}
                          >
                            ${client.dhl_standard_price}
                          </Typography>
                          {client.dhl_standard_price !== standardRate && (
                            <Typography variant="caption" color="text.secondary">
                              (Base: ${standardRate})
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography 
                            fontWeight="bold"
                            color={client.dhl_high_value_price !== highValueRate ? DHL_COLOR : 'inherit'}
                          >
                            ${client.dhl_high_value_price}
                          </Typography>
                          {client.dhl_high_value_price !== highValueRate && (
                            <Typography variant="caption" color="text.secondary">
                              (Base: ${highValueRate})
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <Chip 
                            label={client.total_shipments} 
                            size="small"
                            color={client.total_shipments > 0 ? 'primary' : 'default'}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title="Editar precios">
                            <IconButton onClick={() => handleEditClient(client)} color="primary">
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </TabPanel>
      </Paper>

      {/* Dialog: Editar Tarifa */}
      <Dialog open={editRateDialog} onClose={() => setEditRateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: DHL_COLOR, color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MoneyIcon />
            Editar Tarifa: {selectedRate?.rate_name}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3, mt: 2 }}>
          <TextField
            fullWidth
            label="Precio USD"
            type="number"
            value={editRateForm.price_usd}
            onChange={(e) => setEditRateForm({ ...editRateForm, price_usd: parseFloat(e.target.value) })}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>
            }}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Descripción"
            multiline
            rows={2}
            value={editRateForm.description}
            onChange={(e) => setEditRateForm({ ...editRateForm, description: e.target.value })}
            sx={{ mb: 2 }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={editRateForm.is_active}
                onChange={(e) => setEditRateForm({ ...editRateForm, is_active: e.target.checked })}
              />
            }
            label="Tarifa activa"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditRateDialog(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            startIcon={<SaveIcon />}
            onClick={handleSaveRate}
            sx={{ bgcolor: DHL_COLOR, '&:hover': { bgcolor: '#a00410' } }}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Editar Precios Cliente */}
      <Dialog open={editClientDialog} onClose={() => setEditClientDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: DHL_COLOR, color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonIcon />
            Precios Especiales: {selectedClient?.full_name}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3, mt: 2 }}>
          <Alert severity="info" sx={{ mb: 3 }}>
            Tarifas base: Standard ${standardRate} USD / High Value ${highValueRate} USD
          </Alert>
          
          <TextField
            fullWidth
            label="Precio Standard (USD)"
            type="number"
            value={editClientForm.dhl_standard_price}
            onChange={(e) => setEditClientForm({ ...editClientForm, dhl_standard_price: parseFloat(e.target.value) })}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>
            }}
            helperText="Accesorios y productos mixtos"
            sx={{ mb: 3 }}
          />
          <TextField
            fullWidth
            label="Precio High Value (USD)"
            type="number"
            value={editClientForm.dhl_high_value_price}
            onChange={(e) => setEditClientForm({ ...editClientForm, dhl_high_value_price: parseFloat(e.target.value) })}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>
            }}
            helperText="Sensibles"
          />
          
          <Divider sx={{ my: 2 }} />
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button 
              size="small" 
              onClick={() => setEditClientForm({ 
                dhl_standard_price: standardRate, 
                dhl_high_value_price: highValueRate 
              })}
            >
              Restaurar tarifas base
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditClientDialog(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            startIcon={<SaveIcon />}
            onClick={handleSaveClient}
            sx={{ bgcolor: DHL_COLOR, '&:hover': { bgcolor: '#a00410' } }}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
