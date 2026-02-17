// ============================================
// PANEL DE CRÉDITO B2B
// Gestión de líneas de crédito de importadores
// ============================================

import React, { useState, useEffect } from 'react';
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
  Tabs,
  Tab,
} from '@mui/material';
import {
  Edit as EditIcon,
  Warning as WarningIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import api from '../services/api';

const ORANGE = '#F05A28';
const GREEN = '#4CAF50';
const RED = '#F44336';

interface Client {
  id: number;
  full_name: string;
  email: string;
  box_id: string;
  company_name: string;
  virtual_clabe: string;
  wallet_balance: number;
  has_credit: boolean;
  credit_limit: number;
  used_credit: number;
  available_credit: number;
  credit_days: number;
  credit_due_date: string | null;
  is_credit_blocked: boolean;
  pending_invoices_count: number;
  overdue_amount: number;
}

interface EditForm {
  has_credit: boolean;
  credit_limit: number;
  credit_days: number;
  is_credit_blocked: boolean;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

// TabPanel se usa en la estructura del componente
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

export default function CreditManagementPanel() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [tabValue, setTabValue] = useState(0);
  
  // Modal de edición
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    has_credit: false,
    credit_limit: 0,
    credit_days: 15,
    is_credit_blocked: false
  });

  // Estadísticas
  const [stats, setStats] = useState({
    totalWallets: 0,
    totalCreditUsed: 0,
    totalCreditLimit: 0,
    blockedCount: 0,
    overdueAmount: 0
  });

  useEffect(() => {
    loadFinancials();
  }, []);

  const loadFinancials = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/finance/clients');
      const clientsData = res.data;
      setClients(clientsData);

      // Calcular estadísticas
      const totalWallets = clientsData.reduce((sum: number, c: Client) => sum + (parseFloat(String(c.wallet_balance)) || 0), 0);
      const totalCreditUsed = clientsData.reduce((sum: number, c: Client) => sum + (parseFloat(String(c.used_credit)) || 0), 0);
      const totalCreditLimit = clientsData.reduce((sum: number, c: Client) => sum + (parseFloat(String(c.credit_limit)) || 0), 0);
      const blockedCount = clientsData.filter((c: Client) => c.is_credit_blocked).length;
      const overdueAmount = clientsData.reduce((sum: number, c: Client) => sum + (parseFloat(String(c.overdue_amount)) || 0), 0);

      setStats({ totalWallets, totalCreditUsed, totalCreditLimit, blockedCount, overdueAmount });
    } catch (error) {
      console.error('Error loading financials:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = (client: Client) => {
    setSelectedClient(client);
    setEditForm({
      has_credit: client.has_credit,
      credit_limit: parseFloat(String(client.credit_limit)) || 0,
      credit_days: client.credit_days || 15,
      is_credit_blocked: client.is_credit_blocked
    });
    setOpenModal(true);
  };

  const handleSaveCredit = async () => {
    if (!selectedClient) return;
    
    try {
      setSaving(true);
      await api.put(`/admin/finance/clients/${selectedClient.id}/credit`, editForm);
      alert(`✅ Crédito actualizado para ${selectedClient.full_name}`);
      setOpenModal(false);
      loadFinancials();
    } catch (error) {
      console.error('Error saving credit:', error);
      alert("Error al guardar la configuración");
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

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const filteredClients = clients.filter(c => 
    c.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.box_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const clientsWithCredit = filteredClients.filter(c => c.has_credit);
  const clientsBlocked = filteredClients.filter(c => c.is_credit_blocked || parseFloat(String(c.overdue_amount)) > 0);
  const clientsPrepaid = filteredClients.filter(c => !c.has_credit);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Search */}
      <TextField
        fullWidth
        placeholder="Buscar por nombre, email, Box ID o empresa..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 2 }}
      />

      {/* Stats Row Compacto */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: GREEN, color: 'white' }}>
            <Typography variant="h6" fontWeight="bold">{formatCurrency(stats.totalWallets)}</Typography>
            <Typography variant="caption">Saldo Real</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: ORANGE, color: 'white' }}>
            <Typography variant="h6" fontWeight="bold">{formatCurrency(stats.totalCreditUsed)}</Typography>
            <Typography variant="caption">Crédito Usado</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: RED, color: 'white' }}>
            <Typography variant="h6" fontWeight="bold">{formatCurrency(stats.overdueAmount)}</Typography>
            <Typography variant="caption">Vencido</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: '#424242', color: 'white' }}>
            <Typography variant="h6" fontWeight="bold">{stats.blockedCount}</Typography>
            <Typography variant="caption">Bloqueados</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} variant="scrollable">
          <Tab label={`Todos (${filteredClients.length})`} />
          <Tab label={`Con Crédito (${clientsWithCredit.length})`} />
          <Tab label={`Morosos (${clientsBlocked.length})`} icon={clientsBlocked.length > 0 ? <WarningIcon color="error" sx={{ fontSize: 16 }} /> : undefined} iconPosition="end" />
          <Tab label={`Prepago (${clientsPrepaid.length})`} />
        </Tabs>
      </Paper>

      {/* Table */}
      <Paper>
        <Table size="small">
          <TableHead sx={{ bgcolor: '#111' }}>
            <TableRow>
              <TableCell sx={{ color: 'white' }}>Cliente (Box ID)</TableCell>
              <TableCell sx={{ color: 'white', textAlign: 'right' }}>Saldo Monedero</TableCell>
              <TableCell sx={{ color: 'white', textAlign: 'right' }}>Crédito Usado</TableCell>
              <TableCell sx={{ color: 'white', textAlign: 'center' }}>Límite</TableCell>
              <TableCell sx={{ color: 'white', textAlign: 'center' }}>Vencimiento</TableCell>
              <TableCell sx={{ color: 'white', textAlign: 'center' }}>Estatus</TableCell>
              <TableCell sx={{ color: 'white', textAlign: 'center' }}>Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(tabValue === 0 ? filteredClients : 
              tabValue === 1 ? clientsWithCredit : 
              tabValue === 2 ? clientsBlocked : 
              clientsPrepaid
            ).map((client) => (
              <TableRow 
                key={client.id} 
                hover
                sx={{ 
                  bgcolor: client.is_credit_blocked ? 'rgba(244, 67, 54, 0.08)' : 
                           parseFloat(String(client.overdue_amount)) > 0 ? 'rgba(255, 152, 0, 0.08)' : 
                           'inherit'
                }}
              >
                <TableCell>
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
                <TableCell align="right">
                  <Typography color="success.main" fontWeight="bold">
                    {formatCurrency(client.wallet_balance)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography color="error.main" fontWeight="bold">
                    {formatCurrency(client.used_credit)}
                  </Typography>
                  {parseFloat(String(client.overdue_amount)) > 0 && (
                    <Typography variant="caption" color="error" display="block">
                      ⚠️ Vencido: {formatCurrency(client.overdue_amount)}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="center">
                  {client.has_credit ? (
                    <>
                      <Typography variant="body2">{formatCurrency(client.credit_limit)}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {client.credit_days} días
                      </Typography>
                    </>
                  ) : (
                    <Typography variant="body2" color="text.secondary">-</Typography>
                  )}
                </TableCell>
                <TableCell align="center">
                  {client.credit_due_date ? (
                    <Typography 
                      variant="body2" 
                      color={new Date(client.credit_due_date) < new Date() ? 'error' : 'text.primary'}
                    >
                      {formatDate(client.credit_due_date)}
                    </Typography>
                  ) : '-'}
                </TableCell>
                <TableCell align="center">
                  {client.is_credit_blocked ? (
                    <Chip label="🚫 Bloqueado" color="error" size="small" />
                  ) : parseFloat(String(client.overdue_amount)) > 0 ? (
                    <Chip label="⚠️ Moroso" color="warning" size="small" />
                  ) : client.has_credit ? (
                    <Chip label="💳 Crédito" color="primary" size="small" />
                  ) : (
                    <Chip label="💵 Prepago" variant="outlined" size="small" />
                  )}
                </TableCell>
                <TableCell align="center">
                  <Tooltip title="Ajustar Crédito">
                    <IconButton 
                      size="small" 
                      onClick={() => handleOpenEdit(client)}
                      color="primary"
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {/* Modal de Edición */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          💳 Ajustar Línea de Crédito
        </DialogTitle>
        <DialogContent dividers>
          {selectedClient && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Alert severity="info">
                <Typography variant="subtitle2">
                  <strong>{selectedClient.full_name}</strong>
                </Typography>
                <Typography variant="caption">
                  {selectedClient.box_id} • {selectedClient.email}
                </Typography>
              </Alert>

              <Box sx={{ display: 'flex', gap: 2 }}>
                <Paper sx={{ p: 2, flex: 1, textAlign: 'center', bgcolor: 'success.50' }}>
                  <Typography variant="caption" color="text.secondary">Saldo Monedero</Typography>
                  <Typography variant="h6" color="success.main" fontWeight="bold">
                    {formatCurrency(selectedClient.wallet_balance)}
                  </Typography>
                </Paper>
                <Paper sx={{ p: 2, flex: 1, textAlign: 'center', bgcolor: 'error.50' }}>
                  <Typography variant="caption" color="text.secondary">Deuda Actual</Typography>
                  <Typography variant="h6" color="error.main" fontWeight="bold">
                    {formatCurrency(selectedClient.used_credit)}
                  </Typography>
                </Paper>
              </Box>

              <FormControlLabel 
                control={
                  <Switch 
                    checked={editForm.has_credit} 
                    onChange={(e) => setEditForm({...editForm, has_credit: e.target.checked})}
                    color="primary"
                  />
                } 
                label="¿Tiene línea de crédito autorizada?"
              />

              {editForm.has_credit && (
                <>
                  <TextField 
                    label="Monto Límite Autorizado (MXN)" 
                    type="number"
                    fullWidth 
                    value={editForm.credit_limit}
                    onChange={(e) => setEditForm({...editForm, credit_limit: parseFloat(e.target.value) || 0})}
                    InputProps={{ 
                      startAdornment: <InputAdornment position="start">$</InputAdornment> 
                    }}
                    helperText="Monto máximo que puede adeudar el cliente"
                  />
                  <TextField 
                    label="Días de plazo para pagar" 
                    type="number"
                    fullWidth 
                    value={editForm.credit_days}
                    onChange={(e) => setEditForm({...editForm, credit_days: parseInt(e.target.value) || 15})}
                    helperText="Después de este plazo se enviará aviso de vencimiento"
                  />
                </>
              )}

              <Box sx={{ mt: 2, p: 2, bgcolor: '#ffebee', borderRadius: 1 }}>
                <FormControlLabel 
                  control={
                    <Switch 
                      color="error" 
                      checked={editForm.is_credit_blocked} 
                      onChange={(e) => setEditForm({...editForm, is_credit_blocked: e.target.checked})}
                    />
                  } 
                  label={
                    <Typography color="error" fontWeight="bold">
                      🚫 Bloquear Cuenta
                    </Typography>
                  }
                />
                <Typography variant="caption" color="error" display="block" sx={{ mt: 1 }}>
                  El cliente NO podrá retirar mercancía del CEDIS hasta regularizar su saldo.
                  Úsalo si el cliente no ha pagado sus facturas vencidas.
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenModal(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={handleSaveCredit}
            disabled={saving}
          >
            {saving ? <CircularProgress size={20} /> : 'Guardar Cambios'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
