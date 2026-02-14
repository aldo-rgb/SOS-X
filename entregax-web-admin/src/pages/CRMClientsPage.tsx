import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
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
  TablePagination,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
  Button,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Snackbar,
  Card,
  CardContent,
  Avatar,
  RadioGroup,
  Radio,
  FormControlLabel,
  type SelectChangeEvent,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import WarningIcon from '@mui/icons-material/Warning';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import PeopleIcon from '@mui/icons-material/People';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import HistoryIcon from '@mui/icons-material/History';
import * as XLSX from 'xlsx';

const API_URL = 'http://localhost:3001/api';

interface Client {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  box_id: string;
  created_at: string;
  is_verified: boolean;
  referred_by_id: number | null;
  first_transaction_date: string | null;
  last_transaction_date: string | null;
  last_transaction_ref: string | null;
  last_transaction_amount: number | null;
  recovery_status: string;
  recovery_deadline: string | null;
  advisor_name: string | null;
  team_leader_name: string | null;
  total_shipments: number;
  total_spent: number;
  row_color: 'red' | 'yellow' | 'orange' | 'white';
  days_inactive: number | null;
}

interface Advisor {
  id: number;
  full_name: string;
  email: string;
  total_clients?: number;
}

interface Promotion {
  id: number;
  title: string;
  description: string;
  discount_percent: number;
  is_active: boolean;
}

interface RecoveryHistory {
  id: number;
  action: string;
  notes: string;
  created_at: string;
  advisor_name: string;
  promotion_title: string;
}

interface Stats {
  in_recovery: number;
  churned: number;
  inactive_90: number;
  never_shipped: number;
}

// Row colors mapping
const getRowBgColor = (color: string) => {
  switch (color) {
    case 'red': return 'rgba(211, 47, 47, 0.12)';
    case 'yellow': return 'rgba(255, 193, 7, 0.12)';
    case 'orange': return 'rgba(255, 152, 0, 0.12)';
    default: return 'transparent';
  }
};

export default function CRMClientsPage() {
  const { t } = useTranslation();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'default' }> = {
      active: { label: t('crmClients.statusActive'), color: 'success' },
      in_recovery: { label: t('crmClients.statusInRecovery'), color: 'warning' },
      churned: { label: t('crmClients.statusChurned'), color: 'error' },
      prorroga: { label: t('crmClients.statusProrroga'), color: 'default' },
    };
    return labels[status] || { label: status, color: 'default' };
  };
  
  // Filtros
  const [filter, setFilter] = useState('all');
  const [advisorFilter, setAdvisorFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  // Diálogos
  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [recoveryAction, setRecoveryAction] = useState('');
  const [recoveryNotes, setRecoveryNotes] = useState('');
  const [selectedNewAdvisor, setSelectedNewAdvisor] = useState('');
  const [selectedPromotion, setSelectedPromotion] = useState('');
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [recoveryHistory, setRecoveryHistory] = useState<RecoveryHistory[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  const getToken = () => localStorage.getItem('token') || '';

  // Cargar datos
  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('filter', filter);
      if (advisorFilter) params.append('advisorId', advisorFilter);
      if (search) params.append('search', search);
      params.append('page', String(page + 1));
      params.append('limit', String(rowsPerPage));

      const res = await axios.get(`${API_URL}/admin/crm/clients?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });

      setClients(res.data.data || []);
      setStats(res.data.stats || null);
      setTotalCount(res.data.pagination?.total || 0);
    } catch (err) {
      console.error('Error fetching clients:', err);
      setSnackbar({ open: true, message: 'Error al cargar clientes', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [filter, advisorFilter, search, page, rowsPerPage]);

  const fetchAdvisors = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/crm/advisors-list`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setAdvisors(res.data.data || []);
    } catch {
      console.error('Error fetching advisors');
    }
  };

  const fetchPromotions = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/crm/promotions`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setPromotions(res.data.data?.filter((p: Promotion) => p.is_active) || []);
    } catch {
      console.error('Error fetching promotions');
    }
  };

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    fetchAdvisors();
    fetchPromotions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Abrir diálogo de recuperación
  const handleOpenRecovery = (client: Client) => {
    setSelectedClient(client);
    setRecoveryAction('');
    setRecoveryNotes('');
    setSelectedNewAdvisor('');
    setSelectedPromotion('');
    setRecoveryDialogOpen(true);
  };

  // Ejecutar acción de recuperación
  const handleExecuteRecovery = async () => {
    if (!selectedClient || !recoveryAction) return;

    setActionLoading(true);
    try {
      await axios.post(`${API_URL}/admin/crm/recovery/action`, {
        userId: selectedClient.id,
        action: recoveryAction,
        notes: recoveryNotes,
        newAdvisorId: selectedNewAdvisor || null,
        promotionId: selectedPromotion || null,
      }, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });

      setSnackbar({ open: true, message: 'Acción ejecutada correctamente', severity: 'success' });
      setRecoveryDialogOpen(false);
      fetchClients();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.error || 'Error al ejecutar acción', 
        severity: 'error' 
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Ver historial
  const handleViewHistory = async (client: Client) => {
    setSelectedClient(client);
    try {
      const res = await axios.get(`${API_URL}/admin/crm/recovery/history/${client.id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setRecoveryHistory(res.data.data || []);
      setHistoryDialogOpen(true);
    } catch {
      console.error('Error fetching history');
    }
  };

  // Exportar a Excel
  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('filter', filter);
      if (advisorFilter) params.append('advisorId', advisorFilter);

      const res = await axios.get(`${API_URL}/admin/crm/clients/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });

      const ws = XLSX.utils.json_to_sheet(res.data.data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
      XLSX.writeFile(wb, res.data.filename || 'clientes_crm.xlsx');
      
      setSnackbar({ open: true, message: 'Excel exportado correctamente', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Error al exportar', severity: 'error' });
    }
  };

  // Detectar clientes en riesgo manualmente
  const handleDetectAtRisk = async () => {
    try {
      const res = await axios.post(`${API_URL}/admin/crm/recovery/detect`, {}, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setSnackbar({ 
        open: true, 
        message: `Detección completada: ${res.data.data.enteredRecovery} en recuperación, ${res.data.data.churned} perdidos`, 
        severity: 'success' 
      });
      fetchClients();
    } catch {
      setSnackbar({ open: true, message: 'Error en detección', severity: 'error' });
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('es-MX');
  };

  const formatMoney = (amount: number | null) => {
    if (!amount) return '$0.00';
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {t('crmClients.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('crmClients.subtitle')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title={t('crmClients.detectRisk')}>
            <Button
              variant="outlined"
              color="warning"
              startIcon={<WarningIcon />}
              onClick={handleDetectAtRisk}
            >
              {t('crmClients.detectRisk')}
            </Button>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
            sx={{ background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)' }}
          >
            {t('crmClients.exportExcel')}
          </Button>
        </Box>
      </Box>

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ bgcolor: 'rgba(255, 152, 0, 0.1)', border: '1px solid rgba(255, 152, 0, 0.3)' }}>
              <CardContent sx={{ py: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <WarningIcon sx={{ color: 'warning.main' }} />
                  <Typography variant="h4" fontWeight={700}>{stats.in_recovery}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">{t('crmClients.inRecovery')}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ bgcolor: 'rgba(211, 47, 47, 0.1)', border: '1px solid rgba(211, 47, 47, 0.3)' }}>
              <CardContent sx={{ py: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PersonOffIcon sx={{ color: 'error.main' }} />
                  <Typography variant="h4" fontWeight={700}>{stats.churned}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">{t('crmClients.churned')}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ bgcolor: 'rgba(255, 193, 7, 0.1)', border: '1px solid rgba(255, 193, 7, 0.3)' }}>
              <CardContent sx={{ py: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TrendingDownIcon sx={{ color: '#FFC107' }} />
                  <Typography variant="h4" fontWeight={700}>{stats.inactive_90}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">{t('crmClients.inactive90')}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ bgcolor: 'rgba(156, 39, 176, 0.1)', border: '1px solid rgba(156, 39, 176, 0.3)' }}>
              <CardContent sx={{ py: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PeopleIcon sx={{ color: '#9C27B0' }} />
                  <Typography variant="h4" fontWeight={700}>{stats.never_shipped}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">{t('crmClients.neverShipped')}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Legend */}
      <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Typography variant="subtitle2" gutterBottom>{t('crmClients.colorLegend')}</Typography>
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 20, height: 20, bgcolor: 'rgba(211, 47, 47, 0.3)', borderRadius: 1 }} />
            <Typography variant="body2">🔴 {t('crmClients.redInactive')}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 20, height: 20, bgcolor: 'rgba(255, 193, 7, 0.3)', borderRadius: 1 }} />
            <Typography variant="body2">🟡 {t('crmClients.yellowNoShipment')}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 20, height: 20, bgcolor: 'rgba(255, 152, 0, 0.3)', borderRadius: 1 }} />
            <Typography variant="body2">🟠 {t('crmClients.orangeFalseStart')}</Typography>
          </Box>
        </Box>
      </Paper>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder={t('crmClients.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 280 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>{t('crmClients.statusFilter')}</InputLabel>
            <Select
              value={filter}
              label={t('crmClients.statusFilter')}
              onChange={(e: SelectChangeEvent) => { setFilter(e.target.value); setPage(0); }}
            >
              <MenuItem value="all">{t('crmClients.all')}</MenuItem>
              <MenuItem value="active">✅ {t('crmClients.active')}</MenuItem>
              <MenuItem value="inactive_90">🔴 {t('crmClients.inactive90Filter')}</MenuItem>
              <MenuItem value="never_shipped">🟡 {t('crmClients.neverShippedFilter')}</MenuItem>
              <MenuItem value="new_no_ship">🟠 {t('crmClients.newNoShip')}</MenuItem>
              <MenuItem value="in_recovery">⚠️ {t('crmClients.inRecoveryFilter')}</MenuItem>
              <MenuItem value="churned">❌ {t('crmClients.churnedFilter')}</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>{t('crmClients.advisor')}</InputLabel>
            <Select
              value={advisorFilter}
              label={t('crmClients.advisor')}
              onChange={(e: SelectChangeEvent) => { setAdvisorFilter(e.target.value); setPage(0); }}
            >
              <MenuItem value="">{t('crmClients.all')}</MenuItem>
              {advisors.map(a => (
                <MenuItem key={a.id} value={String(a.id)}>{a.full_name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Tooltip title={t('common.refresh')}>
            <IconButton onClick={() => fetchClients()}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Paper>

      {/* Table */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'rgba(0,0,0,0.03)' }}>
                <TableCell><strong>{t('crmClients.client')}</strong></TableCell>
                <TableCell><strong>{t('crmClients.mailbox')}</strong></TableCell>
                <TableCell><strong>{t('crmClients.advisor')}</strong></TableCell>
                <TableCell align="center"><strong>{t('crmClients.shipments')}</strong></TableCell>
                <TableCell align="right"><strong>{t('crmClients.spent')}</strong></TableCell>
                <TableCell><strong>{t('crmClients.lastTransaction')}</strong></TableCell>
                <TableCell align="center"><strong>{t('crmClients.daysInactive')}</strong></TableCell>
                <TableCell><strong>{t('crmClients.status')}</strong></TableCell>
                <TableCell align="center"><strong>{t('crmClients.actions')}</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={40} />
                  </TableCell>
                </TableRow>
              ) : clients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">{t('crmClients.noClientsToShow')}</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                clients.map((client) => (
                  <TableRow 
                    key={client.id} 
                    sx={{ 
                      bgcolor: getRowBgColor(client.row_color),
                      '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' }
                    }}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: 'primary.main' }}>
                          {client.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={500}>{client.full_name}</Typography>
                          <Typography variant="caption" color="text.secondary">{client.email}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={client.box_id} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{client.advisor_name || '-'}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" fontWeight={600}>{client.total_shipments}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">{formatMoney(Number(client.total_spent))}</Typography>
                    </TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2">{formatDate(client.last_transaction_date)}</Typography>
                        {client.last_transaction_ref && (
                          <Typography variant="caption" color="text.secondary">{client.last_transaction_ref}</Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      {client.days_inactive !== null ? (
                        <Chip 
                          label={`${Math.floor(client.days_inactive)} días`}
                          size="small"
                          color={client.days_inactive > 90 ? 'error' : client.days_inactive > 60 ? 'warning' : 'default'}
                        />
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={getStatusLabel(client.recovery_status).label}
                        size="small"
                        color={getStatusLabel(client.recovery_status).color}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {(client.row_color === 'red' || client.recovery_status === 'in_recovery') && (
                          <Tooltip title="Gestionar Recuperación">
                            <IconButton size="small" color="warning" onClick={() => handleOpenRecovery(client)}>
                              <LocalOfferIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Ver Historial">
                          <IconButton size="small" onClick={() => handleViewHistory(client)}>
                            <HistoryIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50, 100]}
          labelRowsPerPage={t('common.rowsPerPage')}
        />
      </Paper>

      {/* Recovery Action Dialog */}
      <Dialog open={recoveryDialogOpen} onClose={() => setRecoveryDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {t('crmClients.recoveryActions')}
          <Typography variant="body2" color="text.secondary">
            {t('crmClients.client')}: {selectedClient?.full_name}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="subtitle2" gutterBottom>{t('crmClients.selectAction')}</Typography>
          <RadioGroup value={recoveryAction} onChange={(e) => setRecoveryAction(e.target.value)}>
            <FormControlLabel 
              value="recovered" 
              control={<Radio />} 
              label={
                <Box>
                  <Typography variant="body2" fontWeight={500}>✅ Ya Recuperado</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Requiere venta reciente. Resetea al estado activo.
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel 
              value="recovered_reassigned" 
              control={<Radio />} 
              label={
                <Box>
                  <Typography variant="body2" fontWeight={500}>🔄 Recuperado y Reasignado</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Cambia de asesor y resetea el contador.
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel 
              value="prorroga" 
              control={<Radio />} 
              label={
                <Box>
                  <Typography variant="body2" fontWeight={500}>⏸️ Prórroga (Relación sana)</Typography>
                  <Typography variant="caption" color="text.secondary">
                    No molestar por 6 meses. El cliente tiene relación directa.
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel 
              value="baja_definitiva" 
              control={<Radio />} 
              label={
                <Box>
                  <Typography variant="body2" fontWeight={500}>❌ Baja Definitiva</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Marca como perdido permanente. Sale de listas de recuperación.
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>

          {recoveryAction === 'recovered_reassigned' && (
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Nuevo Asesor</InputLabel>
              <Select
                value={selectedNewAdvisor}
                label="Nuevo Asesor"
                onChange={(e) => setSelectedNewAdvisor(e.target.value)}
              >
                {advisors.map(a => (
                  <MenuItem key={a.id} value={String(a.id)}>{a.full_name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {promotions.length > 0 && (
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Promoción Aplicada (Opcional)</InputLabel>
              <Select
                value={selectedPromotion}
                label="Promoción Aplicada (Opcional)"
                onChange={(e) => setSelectedPromotion(e.target.value)}
              >
                <MenuItem value="">Sin promoción</MenuItem>
                {promotions.map(p => (
                  <MenuItem key={p.id} value={String(p.id)}>
                    {p.title} {p.discount_percent > 0 && `(${p.discount_percent}%)`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <TextField
            fullWidth
            multiline
            rows={3}
            label="Notas"
            placeholder="Describe la situación del cliente..."
            value={recoveryNotes}
            onChange={(e) => setRecoveryNotes(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRecoveryDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button 
            variant="contained" 
            onClick={handleExecuteRecovery}
            disabled={!recoveryAction || actionLoading}
          >
            {actionLoading ? <CircularProgress size={20} /> : t('crmClients.executeAction')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyDialogOpen} onClose={() => setHistoryDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {t('crmClients.recoveryHistory')}
          <Typography variant="body2" color="text.secondary">
            {t('crmClients.client')}: {selectedClient?.full_name}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {recoveryHistory.length === 0 ? (
            <Alert severity="info">{t('crmClients.noHistoryYet')}</Alert>
          ) : (
            recoveryHistory.map((h) => (
              <Box key={h.id} sx={{ mb: 2, p: 2, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Chip label={h.action} size="small" />
                  <Typography variant="caption" color="text.secondary">
                    {new Date(h.created_at).toLocaleString('es-MX')}
                  </Typography>
                </Box>
                {h.notes && <Typography variant="body2">{h.notes}</Typography>}
                {h.advisor_name && (
                  <Typography variant="caption" color="text.secondary">Por: {h.advisor_name}</Typography>
                )}
                {h.promotion_title && (
                  <Typography variant="caption" display="block" color="primary">
                    Promo: {h.promotion_title}
                  </Typography>
                )}
              </Box>
            ))
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryDialogOpen(false)}>{t('common.close')}</Button>
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
