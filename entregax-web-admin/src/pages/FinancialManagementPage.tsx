// ============================================
// PANEL ADMIN - GESTIÓN FINANCIERA
// Monederos y Créditos B2B
// ============================================

import React, { useState, useEffect } from 'react';
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
  Tab,
  Tabs,
  Alert,
  CircularProgress,
  Tooltip,
  Card,
  CardContent,
} from '@mui/material';
import {
  AccountBalanceWallet,
  CreditCard,
  Add,
  // Block, // No se usa actualmente
  // CheckCircle, // No se usa actualmente
  Warning,
  TrendingUp,
  Refresh,
  Business,
} from '@mui/icons-material';
import api from '../services/api';
import CreditManagementPanel from './CreditManagementPanel';
import ServiceCreditManagementPanel from './ServiceCreditManagementPanel';
// import { useTranslation } from 'react-i18next'; // Descomentar cuando se agreguen traducciones

const SEA_COLOR = '#0097A7';
const ORANGE = '#F05A28';
const GREEN = '#4CAF50';
const RED = '#F44336';

interface FinancialSummary {
  total_wallet_balance: number;
  total_credit_extended: number;
  total_credit_used: number;
  total_overdue: number;
  users_with_credit: number;
  blocked_accounts: number;
  transactions_today: number;
  deposits_today: number;
}

interface CreditUser {
  id: number;
  name: string;
  email: string;
  company_name: string;
  wallet_balance: number;
  virtual_clabe: string;
  has_credit: boolean;
  credit_limit: number;
  used_credit: number;
  credit_days: number;
  is_credit_blocked: boolean;
  pending_invoices_count: number;
  overdue_amount: number;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export default function FinancialManagementPage() {
  // const { t } = useTranslation(); // Descomentar cuando se agreguen traducciones
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [creditUsers, setCreditUsers] = useState<CreditUser[]>([]);
  
  // Dialog states
  const [depositDialog, setDepositDialog] = useState<{ open: boolean; user: CreditUser | null }>({
    open: false,
    user: null,
  });
  const [depositAmount, setDepositAmount] = useState('');
  const [depositDescription, setDepositDescription] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [summaryRes, usersRes] = await Promise.all([
        api.get('/admin/finance/summary'),
        api.get('/admin/finance/clients'),  // Todos los clientes
      ]);
      setSummary(summaryRes.data);
      setCreditUsers(usersRes.data.map((u: any) => ({
        ...u,
        name: u.full_name,  // Normalizar nombre del campo
        wallet_balance: parseFloat(u.wallet_balance) || 0,  // Asegurar que sea número
      })));
    } catch (error) {
      console.error('Error fetching financial data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  const handleManualDeposit = async () => {
    if (!depositDialog.user) return;
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Ingresa un monto válido');
      return;
    }

    try {
      setProcessing(true);
      await api.post('/admin/wallet/deposit', {
        user_id: depositDialog.user.id,
        amount,
        description: depositDescription || 'Devolución - Saldo a favor',
        type: 'refund', // Tipo devolución para saldo a favor
      });
      alert('✅ Devolución registrada exitosamente. El cliente puede usar este saldo en cualquier servicio.');
      setDepositDialog({ open: false, user: null });
      setDepositAmount('');
      setDepositDescription('');
      fetchData();
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || 'Error al procesar devolución');
    } finally {
      setProcessing(false);
    }
  };

  const filteredUsers = creditUsers;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          💰 Gestión Financiera
        </Typography>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={fetchData}
        >
          Actualizar
        </Button>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${SEA_COLOR} 0%, #00BCD4 100%)` }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <AccountBalanceWallet sx={{ fontSize: 40, color: 'rgba(255,255,255,0.8)' }} />
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                    Saldo a Favor Total
                  </Typography>
                  <Typography variant="h5" sx={{ color: '#fff', fontWeight: 'bold' }}>
                    {formatCurrency(summary?.total_wallet_balance || 0)}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #FF7043 100%)` }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <CreditCard sx={{ fontSize: 40, color: 'rgba(255,255,255,0.8)' }} />
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                    Crédito Utilizado
                  </Typography>
                  <Typography variant="h5" sx={{ color: '#fff', fontWeight: 'bold' }}>
                    {formatCurrency(summary?.total_credit_used || 0)}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${RED} 0%, #E57373 100%)` }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Warning sx={{ fontSize: 40, color: 'rgba(255,255,255,0.8)' }} />
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                    Adeudos Vencidos
                  </Typography>
                  <Typography variant="h5" sx={{ color: '#fff', fontWeight: 'bold' }}>
                    {formatCurrency(summary?.total_overdue || 0)}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${GREEN} 0%, #81C784 100%)` }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <TrendingUp sx={{ fontSize: 40, color: 'rgba(255,255,255,0.8)' }} />
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                    Depósitos Hoy
                  </Typography>
                  <Typography variant="h5" sx={{ color: '#fff', fontWeight: 'bold' }}>
                    {formatCurrency(summary?.deposits_today || 0)}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Stats Row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="primary">{summary?.users_with_credit || 0}</Typography>
            <Typography variant="caption">Usuarios con Crédito</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="error">{summary?.blocked_accounts || 0}</Typography>
            <Typography variant="caption">Cuentas Bloqueadas</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="success.main">{summary?.transactions_today || 0}</Typography>
            <Typography variant="caption">Transacciones Hoy</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4">{formatCurrency(summary?.total_credit_extended || 0)}</Typography>
            <Typography variant="caption">Crédito Total Otorgado</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab label="💳 Crédito por Servicio" icon={<Business />} iconPosition="start" />
          <Tab label="📊 Crédito B2B (Legacy)" icon={<CreditCard />} iconPosition="start" />
          <Tab label="👛 Saldo a Favor" icon={<AccountBalanceWallet />} iconPosition="start" />
        </Tabs>
      </Paper>

      {/* Tab 0: Créditos por Servicio (Multi-RFC) - NUEVO */}
      <TabPanel value={tabValue} index={0}>
        <ServiceCreditManagementPanel />
      </TabPanel>

      {/* Tab 1: Crédito B2B Legacy */}
      <TabPanel value={tabValue} index={1}>
        <CreditManagementPanel />
      </TabPanel>

      {/* Tab 2: Saldo a Favor (Devoluciones) */}
      <TabPanel value={tabValue} index={2}>
        {/* Info Card */}
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            <strong>💡 Saldo a Favor:</strong> Los clientes reciben saldo a favor únicamente por devoluciones de pagos.
            Este saldo puede ser utilizado para pagar cualquier servicio (Marítimo, Aéreo, Terrestre, DHL, PO Box).
          </Typography>
        </Alert>

        {/* Resumen */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ bgcolor: '#E3F2FD' }}>
              <CardContent>
                <Typography variant="h4" color="primary">
                  {formatCurrency(filteredUsers.reduce((sum, u) => sum + (u.wallet_balance || 0), 0))}
                </Typography>
                <Typography variant="caption">Total Saldo a Favor</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ bgcolor: '#E8F5E9' }}>
              <CardContent>
                <Typography variant="h4" color="success.main">
                  {filteredUsers.filter(u => (u.wallet_balance || 0) > 0).length}
                </Typography>
                <Typography variant="caption">Clientes con Saldo</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ bgcolor: '#FFF3E0' }}>
              <CardContent>
                <Typography variant="h4" color="warning.main">
                  {filteredUsers.filter(u => (u.wallet_balance || 0) === 0).length}
                </Typography>
                <Typography variant="caption">Sin Saldo</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Tabla de clientes con saldo */}
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          👛 Clientes con Saldo a Favor
        </Typography>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#E3F2FD' }}>
                <TableCell><strong>Cliente</strong></TableCell>
                <TableCell align="right"><strong>Saldo Disponible</strong></TableCell>
                <TableCell><strong>Origen del Saldo</strong></TableCell>
                <TableCell align="center"><strong>Servicios Disponibles</strong></TableCell>
                <TableCell align="center"><strong>Acciones</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredUsers.filter(u => (u.wallet_balance || 0) > 0).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    <Typography color="textSecondary" sx={{ py: 3 }}>
                      No hay clientes con saldo a favor actualmente
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.filter(u => (u.wallet_balance || 0) > 0).map((user) => (
                  <TableRow key={user.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">{user.name}</Typography>
                      <Typography variant="caption" color="textSecondary">{user.email}</Typography>
                      {user.company_name && (
                        <Typography variant="caption" display="block" color="primary">
                          🏢 {user.company_name}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="h6" fontWeight="bold" color="success.main">
                        {formatCurrency(user.wallet_balance || 0)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label="🔄 Devolución" size="small" color="info" />
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <Chip label="🚢" size="small" title="Marítimo" />
                        <Chip label="✈️" size="small" title="Aéreo" />
                        <Chip label="🚛" size="small" title="Terrestre" />
                        <Chip label="📦" size="small" title="DHL" />
                        <Chip label="📮" size="small" title="PO Box" />
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Agregar Saldo (Devolución)">
                        <IconButton
                          color="primary"
                          onClick={() => setDepositDialog({ open: true, user })}
                        >
                          <Add />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Todos los clientes para registrar devolución */}
        <Paper sx={{ mt: 3, p: 2 }}>
          <Typography variant="h6" gutterBottom>
            📋 Registrar Nueva Devolución
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            Selecciona un cliente de la lista para registrar una devolución o saldo a favor.
          </Alert>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell><strong>Cliente</strong></TableCell>
                  <TableCell align="right"><strong>Saldo Actual</strong></TableCell>
                  <TableCell align="center"><strong>Acción</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredUsers.slice(0, 10).map((user) => (
                  <TableRow key={user.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">{user.name}</Typography>
                      <Typography variant="caption" color="textSecondary">{user.email}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography 
                        variant="body2" 
                        color={(user.wallet_balance || 0) > 0 ? 'success.main' : 'textSecondary'}
                      >
                        {formatCurrency(user.wallet_balance || 0)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Button
                        size="small"
                        variant="outlined"
                        color="primary"
                        startIcon={<Add />}
                        onClick={() => setDepositDialog({ open: true, user })}
                      >
                        Devolución
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {filteredUsers.length > 10 && (
            <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
              Mostrando 10 de {filteredUsers.length} clientes. Usa el buscador para filtrar.
            </Typography>
          )}
        </Paper>
      </TabPanel>

      {/* Dialog: Agregar Saldo a Favor (Devolución) */}
      <Dialog open={depositDialog.open} onClose={() => setDepositDialog({ open: false, user: null })}>
        <DialogTitle>🔄 Registrar Devolución / Saldo a Favor</DialogTitle>
        <DialogContent>
          {depositDialog.user && (
            <>
              <Alert severity="info" sx={{ mb: 2 }}>
                Cliente: <strong>{depositDialog.user.name}</strong><br />
                Saldo actual: <strong>{formatCurrency(depositDialog.user.wallet_balance || 0)}</strong>
              </Alert>
              <Alert severity="warning" sx={{ mb: 2 }}>
                Este saldo podrá ser usado por el cliente para pagar cualquier servicio:
                Marítimo, Aéreo, Terrestre, DHL o PO Box.
              </Alert>
              <TextField
                fullWidth
                label="Monto de devolución"
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="Motivo de la devolución"
                value={depositDescription}
                onChange={(e) => setDepositDescription(e.target.value)}
                placeholder="Ej: Devolución por envío cancelado, Diferencia de cobro, Crédito por error..."
                multiline
                rows={2}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDepositDialog({ open: false, user: null })}>Cancelar</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleManualDeposit}
            disabled={processing}
          >
            {processing ? <CircularProgress size={20} /> : '✓ Confirmar Devolución'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
