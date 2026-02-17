import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { 
  Box, Typography, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Paper, TextField, Button, InputAdornment,
  Card, CardContent, Chip, Avatar, CircularProgress,
  Alert, Snackbar, Tooltip, IconButton, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Tabs, Tab
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import PeopleIcon from '@mui/icons-material/People';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import FlightIcon from '@mui/icons-material/Flight';
import DirectionsBoatIcon from '@mui/icons-material/DirectionsBoat';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import RefreshIcon from '@mui/icons-material/Refresh';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccount';
import SecurityIcon from '@mui/icons-material/Security';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const ORANGE = '#F05A28';
const BLACK = '#111';

interface CommissionRate {
  id: number;
  service_type: string;
  label: string;
  percentage: number;
  leader_override: number;
  fiscal_emitter_id: number | null;
  fixed_fee: number;
  is_gex: boolean;
  updated_at: string;
}

interface FiscalEmitter {
  id: number;
  alias: string;
  rfc: string;
  business_name: string;
  is_active: boolean;
}

interface GexStats {
  activePolicies: number;
  totalCommissions: number;
  totalRevenue: number;
  topAdvisors: Array<{
    id: number;
    full_name: string;
    referral_code: string;
    policies_sold: number;
    total_commission: number;
  }>;
}

interface CommissionStats {
  totalAdvisors: number;
  totalReferred: number;
  gex?: GexStats;
  topAdvisors: Array<{
    id: number;
    full_name: string;
    referral_code: string;
    referral_count: number;
  }>;
}

interface Advisor {
  id: number;
  full_name: string;
  email: string;
  referral_code: string;
  role: string;
  leader_id: number | null;
  leader_name: string | null;
  referral_count: number;
  created_at: string;
}

const getServiceIcon = (serviceType: string) => {
  if (serviceType.includes('gex')) return <SecurityIcon />;
  if (serviceType.includes('aereo')) return <FlightIcon />;
  if (serviceType.includes('maritimo')) return <DirectionsBoatIcon />;
  return <LocalShippingIcon />;
};

const getServiceColor = (serviceType: string) => {
  if (serviceType.includes('gex')) return '#9c27b0';
  if (serviceType.includes('aereo')) return '#2196f3';
  if (serviceType.includes('maritimo')) return '#00bcd4';
  if (serviceType.includes('pobox') || serviceType.includes('usa')) return ORANGE;
  return '#4caf50';
};

export default function CommissionsPage() {
  const { i18n } = useTranslation();
  const [rates, setRates] = useState<CommissionRate[]>([]);
  const [stats, setStats] = useState<CommissionStats | null>(null);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [_emitters, setEmitters] = useState<FiscalEmitter[]>([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [tabValue, setTabValue] = useState(0);
  
  // Modal Alta de Asesores
  const [openModal, setOpenModal] = useState(false);
  const [newAdvisor, setNewAdvisor] = useState({ 
    full_name: '', 
    email: '', 
    phone: '',
    password: '',
    role: 'asesor',
    leader_id: '' as string | number
  });
  const [creatingAdvisor, setCreatingAdvisor] = useState(false);

  const getToken = () => localStorage.getItem('token');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ratesRes, statsRes, advisorsRes, emittersRes] = await Promise.all([
        axios.get(`${API_URL}/admin/commissions`, { headers: { Authorization: `Bearer ${getToken()}` } }),
        axios.get(`${API_URL}/admin/commissions/stats`, { headers: { Authorization: `Bearer ${getToken()}` } }),
        axios.get(`${API_URL}/admin/advisors`, { headers: { Authorization: `Bearer ${getToken()}` } }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/admin/fiscal/emitters`, { headers: { Authorization: `Bearer ${getToken()}` } }).catch(() => ({ data: [] }))
      ]);
      setRates(ratesRes.data);
      setStats(statsRes.data);
      setAdvisors(advisorsRes.data);
      setEmitters(emittersRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
      setSnackbar({ open: true, message: 'Error al cargar datos', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdate = async (id: number, newPercentage: number, newOverride: number, newEmitterId: number | null, fixedFee?: number) => {
    try {
      // Actualizar porcentajes, override y comisión fija
      await axios.put(`${API_URL}/admin/commissions`, 
        { id, percentage: newPercentage, leader_override: newOverride, fixed_fee: fixedFee },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      // Asignar empresa facturadora
      await axios.post(`${API_URL}/admin/fiscal/assign-service`, 
        { serviceId: id, emitterId: newEmitterId },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setSnackbar({ open: true, message: i18n.language === 'es' ? 'Tarifa actualizada' : 'Rate updated', severity: 'success' });
      loadData();
    } catch (error) {
      console.error('Error updating rate:', error);
      setSnackbar({ open: true, message: 'Error al actualizar', severity: 'error' });
    }
  };

  const handleCreateAdvisor = async () => {
    if (!newAdvisor.full_name || !newAdvisor.email || !newAdvisor.phone || !newAdvisor.password) {
      setSnackbar({ open: true, message: 'Por favor completa todos los campos', severity: 'error' });
      return;
    }
    setCreatingAdvisor(true);
    try {
      await axios.post(`${API_URL}/admin/advisors`, newAdvisor, { 
        headers: { Authorization: `Bearer ${getToken()}` } 
      });
      setSnackbar({ open: true, message: 'Asesor creado exitosamente', severity: 'success' });
      setOpenModal(false);
      setNewAdvisor({ full_name: '', email: '', phone: '', password: '', role: 'asesor', leader_id: '' });
      loadData();
    } catch (error) {
      console.error('Error creating advisor:', error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      setSnackbar({ open: true, message: axiosError.response?.data?.error || 'Error al crear asesor', severity: 'error' });
    } finally {
      setCreatingAdvisor(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress sx={{ color: ORANGE }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: BLACK }}>
            💼 {i18n.language === 'es' ? 'Comisiones y Referidos' : 'Commissions & Referrals'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {i18n.language === 'es' 
              ? 'Configura los porcentajes de comisión para asesores' 
              : 'Configure advisor commission percentages'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button 
            variant="contained" 
            startIcon={<PersonAddIcon />}
            onClick={() => setOpenModal(true)}
            sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` }}
          >
            {i18n.language === 'es' ? 'Alta de Asesores' : 'Add Advisor'}
          </Button>
          <Tooltip title={i18n.language === 'es' ? 'Actualizar datos' : 'Refresh data'}>
            <IconButton onClick={loadData} sx={{ bgcolor: 'grey.100' }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3, borderRadius: 2 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab icon={<MonetizationOnIcon />} label={i18n.language === 'es' ? 'Tarifas' : 'Rates'} />
          <Tab icon={<AccountTreeIcon />} label={i18n.language === 'es' ? 'Jerarquía' : 'Hierarchy'} />
        </Tabs>
      </Paper>

      {/* Stats Cards */}
      {tabValue === 0 && (
      <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 4 }}>
        <Box sx={{ flex: '1 1 300px', minWidth: 250 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)`, color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">{stats?.totalAdvisors || 0}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    {i18n.language === 'es' ? 'Asesores Activos' : 'Active Advisors'}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 56, height: 56 }}>
                  <PeopleIcon sx={{ fontSize: 32 }} />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ flex: '1 1 300px', minWidth: 250 }}>
          <Card sx={{ background: `linear-gradient(135deg, #4caf50 0%, #81c784 100%)`, color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">{stats?.totalReferred || 0}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    {i18n.language === 'es' ? 'Clientes Referidos' : 'Referred Clients'}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 56, height: 56 }}>
                  <TrendingUpIcon sx={{ fontSize: 32 }} />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ flex: '1 1 300px', minWidth: 250 }}>
          <Card sx={{ background: `linear-gradient(135deg, #9c27b0 0%, #ba68c8 100%)`, color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">{stats?.gex?.activePolicies || 0}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    {i18n.language === 'es' ? '🛡️ Pólizas GEX Activas' : '🛡️ Active GEX Policies'}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 56, height: 56 }}>
                  <SecurityIcon sx={{ fontSize: 32 }} />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ flex: '1 1 300px', minWidth: 250 }}>
          <Card sx={{ background: `linear-gradient(135deg, #673ab7 0%, #9575cd 100%)`, color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">
                    ${(stats?.gex?.totalCommissions || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    {i18n.language === 'es' ? 'Comisiones GEX (MXN)' : 'GEX Commissions (MXN)'}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 56, height: 56 }}>
                  <MonetizationOnIcon sx={{ fontSize: 32 }} />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Main Content */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {/* Commission Rates Table */}
        <Box sx={{ flex: '2 1 600px', minWidth: 300 }}>
          <Paper elevation={3} sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ bgcolor: BLACK, px: 3, py: 2 }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
                📊 {i18n.language === 'es' ? 'Tarifas de Comisión por Servicio' : 'Commission Rates by Service'}
              </Typography>
            </Box>
            
            <Alert severity="info" sx={{ mx: 2, mt: 2 }}>
              <Typography variant="body2">
                {i18n.language === 'es' 
                  ? 'Estos porcentajes se aplican al valor del envío cuando un cliente referido realiza un pago.'
                  : 'These percentages apply to shipment value when a referred client makes a payment.'}
              </Typography>
            </Alert>

            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell sx={{ fontWeight: 'bold' }}>
                      {i18n.language === 'es' ? 'Tipo de Servicio' : 'Service Type'}
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                      {i18n.language === 'es' ? 'Comisión (%)' : 'Commission (%)'}
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                      <Tooltip title={i18n.language === 'es' ? 'Comisión adicional para el líder cuando su subasesor genera una venta' : 'Additional commission for leader when their sub-advisor makes a sale'}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                          {i18n.language === 'es' ? 'Override (%)' : 'Override (%)'}
                          <SupervisorAccountIcon fontSize="small" />
                        </Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                      {i18n.language === 'es' ? 'Acción' : 'Action'}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rates.map((rate) => (
                    <CommissionRow key={rate.id} rate={rate} onSave={handleUpdate} language={i18n.language} />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>

        {/* Top Advisors */}
        <Box sx={{ flex: '1 1 300px', minWidth: 280 }}>
          <Paper elevation={3} sx={{ borderRadius: 3, overflow: 'hidden', height: '100%' }}>
            <Box sx={{ bgcolor: '#ffc107', px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <EmojiEventsIcon sx={{ color: BLACK }} />
              <Typography variant="h6" sx={{ color: BLACK, fontWeight: 'bold' }}>
                {i18n.language === 'es' ? 'Top Asesores' : 'Top Advisors'}
              </Typography>
            </Box>
            
            <Box sx={{ p: 2 }}>
              {stats?.topAdvisors && stats.topAdvisors.length > 0 ? (
                stats.topAdvisors.map((advisor, index) => (
                  <Box key={advisor.id}>
                    <Box sx={{ 
                      display: 'flex', alignItems: 'center', gap: 2, p: 2, borderRadius: 2,
                      bgcolor: index === 0 ? 'rgba(255, 193, 7, 0.1)' : 'transparent',
                      border: index === 0 ? '2px solid #ffc107' : 'none'
                    }}>
                      <Avatar sx={{ 
                        bgcolor: index === 0 ? '#ffc107' : index === 1 ? '#bdbdbd' : index === 2 ? '#cd7f32' : 'grey.300',
                        color: index < 3 ? BLACK : 'grey.600', fontWeight: 'bold'
                      }}>
                        {index + 1}
                      </Avatar>
                      <Box sx={{ flex: 1 }}>
                        <Typography fontWeight="bold">{advisor.full_name}</Typography>
                        <Typography variant="caption" color="text.secondary">{advisor.referral_code}</Typography>
                      </Box>
                      <Chip 
                        label={`${advisor.referral_count} ${i18n.language === 'es' ? 'referidos' : 'referrals'}`}
                        color={index === 0 ? 'warning' : 'default'} size="small"
                      />
                    </Box>
                    {index < stats.topAdvisors.length - 1 && <Divider sx={{ my: 1 }} />}
                  </Box>
                ))
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <PeopleIcon sx={{ fontSize: 48, color: 'grey.300', mb: 1 }} />
                  <Typography color="text.secondary">
                    {i18n.language === 'es' ? 'Aún no hay asesores con referidos' : 'No advisors with referrals yet'}
                  </Typography>
                </Box>
              )}
            </Box>
          </Paper>
        </Box>
      </Box>

      {/* Info Card */}
      <Paper elevation={1} sx={{ mt: 3, p: 3, bgcolor: 'grey.50', borderRadius: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <InfoOutlinedIcon sx={{ color: ORANGE, mt: 0.5 }} />
          <Box>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              {i18n.language === 'es' ? '¿Cómo funciona?' : 'How does it work?'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {i18n.language === 'es' 
                ? '1. Cada asesor tiene un código único • 2. El cliente se registra con ese código • 3. Cada pago genera comisión automática • 4. Override: El líder gana % adicional por ventas de sus subasesores'
                : '1. Each advisor has a unique code • 2. Client registers with that code • 3. Each payment generates automatic commission • 4. Override: Leader earns % on sub-advisor sales'}
            </Typography>
          </Box>
        </Box>
      </Paper>
      </>
      )}

      {/* Tab Jerarquía */}
      {tabValue === 1 && (
        <Box>
          <Paper elevation={3} sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ bgcolor: BLACK, px: 3, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
                👥 {i18n.language === 'es' ? 'Jerarquía de Asesores' : 'Advisor Hierarchy'}
              </Typography>
              <Chip label={`${advisors.length} ${i18n.language === 'es' ? 'asesores' : 'advisors'}`} sx={{ bgcolor: ORANGE, color: 'white' }} />
            </Box>
            
            <Alert severity="info" sx={{ m: 2 }}>
              <Typography variant="body2">
                {i18n.language === 'es' 
                  ? 'Los asesores principales (líderes) reciben un % Override por cada venta de sus subasesores.'
                  : 'Lead advisors receive an Override % for each sale made by their sub-advisors.'}
              </Typography>
            </Alert>

            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell sx={{ fontWeight: 'bold' }}>{i18n.language === 'es' ? 'Asesor' : 'Advisor'}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{i18n.language === 'es' ? 'Rol' : 'Role'}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{i18n.language === 'es' ? 'Líder' : 'Leader'}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{i18n.language === 'es' ? 'Código' : 'Code'}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>{i18n.language === 'es' ? 'Referidos' : 'Referrals'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {advisors.length > 0 ? advisors.map((advisor) => (
                    <TableRow key={advisor.id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Avatar sx={{ bgcolor: advisor.role === 'asesor_lider' ? ORANGE : 'grey.400' }}>
                            {advisor.role === 'asesor_lider' ? <SupervisorAccountIcon /> : <PeopleIcon />}
                          </Avatar>
                          <Box>
                            <Typography fontWeight="bold">{advisor.full_name}</Typography>
                            <Typography variant="caption" color="text.secondary">{advisor.email}</Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={(advisor.role === 'asesor_lider' || advisor.role === 'advisor')
                            ? (i18n.language === 'es' ? 'Asesor Líder' : 'Lead Advisor') 
                            : (i18n.language === 'es' ? 'Subasesor' : 'Sub-Advisor')} 
                          color={(advisor.role === 'asesor_lider' || advisor.role === 'advisor') ? 'warning' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {advisor.leader_name ? (
                          <Chip label={advisor.leader_name} size="small" variant="outlined" />
                        ) : (
                          <Typography color="text.secondary">-</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip label={advisor.referral_code} size="small" sx={{ fontFamily: 'monospace' }} />
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={advisor.referral_count} color="primary" size="small" />
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                        <PeopleIcon sx={{ fontSize: 48, color: 'grey.300', mb: 1 }} />
                        <Typography color="text.secondary">
                          {i18n.language === 'es' ? 'No hay asesores registrados. Usa "Alta de Asesores" para crear uno.' : 'No advisors yet. Use "Add Advisor" to create one.'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>
      )}

      {/* Modal Alta de Asesores */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: ORANGE, color: 'white', fontWeight: 'bold' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonAddIcon /> {i18n.language === 'es' ? 'Alta de Nuevo Asesor' : 'Add New Advisor'}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label={i18n.language === 'es' ? 'Nombre Completo' : 'Full Name'}
              value={newAdvisor.full_name}
              onChange={(e) => setNewAdvisor({ ...newAdvisor, full_name: e.target.value })}
              fullWidth required
            />
            <TextField
              label="Email"
              type="email"
              value={newAdvisor.email}
              onChange={(e) => setNewAdvisor({ ...newAdvisor, email: e.target.value })}
              fullWidth required
            />
            <TextField
              label={i18n.language === 'es' ? 'Teléfono / WhatsApp' : 'Phone / WhatsApp'}
              value={newAdvisor.phone}
              onChange={(e) => setNewAdvisor({ ...newAdvisor, phone: e.target.value.replace(/[^0-9]/g, '') })}
              fullWidth required
              inputProps={{ maxLength: 10 }}
              placeholder="10 dígitos"
            />
            <TextField
              label={i18n.language === 'es' ? 'Contraseña' : 'Password'}
              type="password"
              value={newAdvisor.password}
              onChange={(e) => setNewAdvisor({ ...newAdvisor, password: e.target.value })}
              fullWidth required
            />
            <FormControl fullWidth>
              <InputLabel>{i18n.language === 'es' ? 'Tipo de Asesor' : 'Advisor Type'}</InputLabel>
              <Select
                value={newAdvisor.role}
                label={i18n.language === 'es' ? 'Tipo de Asesor' : 'Advisor Type'}
                onChange={(e) => setNewAdvisor({ ...newAdvisor, role: e.target.value })}
              >
                <MenuItem value="asesor">{i18n.language === 'es' ? 'Subasesor (Reporta a Asesor)' : 'Sub-Advisor (Reports to Advisor)'}</MenuItem>
                <MenuItem value="asesor_lider">{i18n.language === 'es' ? 'Asesor (Recibe Override)' : 'Advisor (Receives Override)'}</MenuItem>
              </Select>
            </FormControl>
            {newAdvisor.role === 'asesor' && (
              <FormControl fullWidth>
                <InputLabel>{i18n.language === 'es' ? 'Asignar a Asesor Líder *' : 'Assign to Lead Advisor *'}</InputLabel>
                <Select
                  value={newAdvisor.leader_id}
                  label={i18n.language === 'es' ? 'Asignar a Asesor Líder *' : 'Assign to Lead Advisor *'}
                  onChange={(e) => setNewAdvisor({ ...newAdvisor, leader_id: e.target.value })}
                  required
                >
                  <MenuItem value="">{i18n.language === 'es' ? 'Selecciona un asesor líder' : 'Select a lead advisor'}</MenuItem>
                  {advisors.filter(a => a.role === 'asesor_lider' || a.role === 'advisor').map(leader => (
                    <MenuItem key={leader.id} value={leader.id}>{leader.full_name} ({leader.referral_code})</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <Alert severity="info">
              {i18n.language === 'es' 
                ? 'Se generará automáticamente un código de referido único.'
                : 'A unique referral code will be automatically generated.'}
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpenModal(false)} disabled={creatingAdvisor}>
            {i18n.language === 'es' ? 'Cancelar' : 'Cancel'}
          </Button>
          <Button 
            variant="contained" 
            onClick={handleCreateAdvisor}
            disabled={creatingAdvisor}
            startIcon={creatingAdvisor ? <CircularProgress size={16} color="inherit" /> : <PersonAddIcon />}
            sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` }}
          >
            {i18n.language === 'es' ? 'Crear Asesor' : 'Create Advisor'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

interface CommissionRowProps {
  rate: CommissionRate;
  onSave: (id: number, percentage: number, override: number, emitterId: number | null, fixedFee?: number) => void;
  language: string;
}

function CommissionRow({ rate, onSave, language }: CommissionRowProps) {
  const [val, setVal] = useState<string>(rate.percentage.toString());
  const [overrideVal, setOverrideVal] = useState<string>((rate.leader_override || 0).toString());
  const [fixedFeeVal, setFixedFeeVal] = useState<string>((rate.fixed_fee || 0).toString());
  const [saving, setSaving] = useState(false);
  
  const hasChanged = parseFloat(val) !== rate.percentage || 
    parseFloat(overrideVal) !== (rate.leader_override || 0) ||
    (rate.is_gex && parseFloat(fixedFeeVal) !== (rate.fixed_fee || 0));

  const handleSave = async () => {
    setSaving(true);
    await onSave(
      rate.id, 
      parseFloat(val), 
      parseFloat(overrideVal), 
      null,
      rate.is_gex ? parseFloat(fixedFeeVal) : undefined
    );
    setSaving(false);
  };

  // Color de fondo según tipo de servicio
  const getRowBgColor = () => {
    if (rate.is_gex) return '#f3e5f5'; // Morado claro para GEX
    if (rate.service_type.includes('aereo')) return '#e3f2fd'; // Azul claro
    if (rate.service_type.includes('maritimo')) return '#e0f7fa'; // Cyan claro
    if (rate.service_type.includes('pobox') || rate.service_type.includes('usa')) return '#fff3e0'; // Naranja claro
    return '#e8f5e9'; // Verde claro para otros
  };

  return (
    <TableRow hover sx={{ bgcolor: getRowBgColor() }}>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{ bgcolor: `${getServiceColor(rate.service_type)}20`, color: getServiceColor(rate.service_type) }}>
            {getServiceIcon(rate.service_type)}
          </Avatar>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography fontWeight="bold">{rate.label}</Typography>
              {rate.is_gex && (
                <Chip label="GEX" size="small" sx={{ bgcolor: '#9c27b0', color: 'white', height: 20, fontSize: '0.65rem' }} />
              )}
            </Box>
            <Typography variant="caption" color="text.secondary">{rate.service_type}</Typography>
          </Box>
        </Box>
      </TableCell>
      <TableCell align="center">
        <TextField 
          type="number" size="small" value={val}
          onChange={(e) => setVal(e.target.value)}
          slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
          sx={{ width: 100 }}
          helperText={rate.is_gex ? (language === 'es' ? 'Cuota variable' : 'Variable fee') : ''}
        />
      </TableCell>
      {rate.is_gex ? (
        <TableCell align="center">
          <TextField 
            type="number" size="small" value={fixedFeeVal}
            onChange={(e) => setFixedFeeVal(e.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
            sx={{ width: 120, '& .MuiOutlinedInput-root': { bgcolor: '#e1bee7' } }}
            helperText={language === 'es' ? 'Comisión fija' : 'Fixed commission'}
          />
        </TableCell>
      ) : (
        <TableCell align="center">
          <TextField 
            type="number" size="small" value={overrideVal}
            onChange={(e) => setOverrideVal(e.target.value)}
            slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
            sx={{ width: 100, '& .MuiOutlinedInput-root': { bgcolor: '#fff8e1' } }}
          />
        </TableCell>
      )}
      <TableCell align="center">
        <Button 
          variant="contained" size="small"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          onClick={handleSave} disabled={!hasChanged || saving}
          sx={{ background: hasChanged ? `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` : 'grey.300' }}
        >
          {language === 'es' ? 'Guardar' : 'Save'}
        </Button>
      </TableCell>
    </TableRow>
  );
}
