// ============================================
// DASHBOARD - PANEL DEL ASESOR / ADVISOR PANEL
// 5 secciones: Dashboard, Clientes, Embarques, Comisiones, Herramientas
// ============================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  CircularProgress,
  Chip,
  TextField,
  InputAdornment,
  Button,
  IconButton,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Snackbar,
  Alert,
  Tooltip,
  LinearProgress,
  Avatar,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  useTheme,
  alpha,
  Fade,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  LocalShipping as ShippingIcon,
  AttachMoney as MoneyIcon,
  Build as ToolsIcon,
  Search as SearchIcon,
  VerifiedUser as VerifiedIcon,
  Warning as WarningIcon,
  FiberNew as NewIcon,
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as PendingIcon,
  Block as DormantIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  ContentCopy as CopyIcon,
  Share as ShareIcon,
  WhatsApp as WhatsAppIcon,
  Phone as PhoneIcon,
  Refresh as RefreshIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Payment as PaymentIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';
import api from '../services/api';

// ─── Types ───

interface AdvisorDashboardData {
  advisor: {
    id: number;
    fullName: string;
    email: string;
    referralCode: string;
    boxId: string;
    role: string;
    joinedAt: string;
  };
  clients: {
    total: number;
    new7d: number;
    new30d: number;
    verified: number;
    pendingVerification: number;
    active: number;
    dormant: number;
  };
  shipments: {
    inTransit: number;
    awaitingPayment: number;
    missingInstructions: number;
  };
  commissions: {
    monthVolumeMxn: number;
    monthPaidCount: number;
  };
  monthlyRegistrations: { month: string; new_clients: number }[];
  subAdvisors: number;
}

interface AdvisorClient {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  boxId: string;
  identityVerified: boolean;
  verificationStatus: string;
  createdAt: string;
  recoveryStatus: string | null;
  advisorNotes: string | null;
  lastShipmentAt: string | null;
  totalPackages: number;
  inTransitCount: number;
  pendingPaymentCount: number;
  activityStatus: 'new' | 'active' | 'dormant';
  daysSinceLastShipment: number | null;
}

interface AdvisorShipment {
  id: number;
  tracking: string;
  internationalTracking: string;
  childNo: string;
  status: string;
  serviceType: string;
  amount: number;
  clientPaid: boolean;
  paidAt: string | null;
  deliveryInstructions: string;
  createdAt: string;
  clientName: string;
  clientBoxId: string;
  clientPhone: string;
}

interface ShipmentStats {
  total: number;
  inTransit: number;
  awaitingPayment: number;
  missingInstructions: number;
  readyPickup: number;
  delivered: number;
}

interface CommissionData {
  rate: { percentage: number; leaderOverride: number; fixedFee: number };
  monthly: { month: string; paidCount: number; totalVolume: number; estimatedCommission: number }[];
  pending: { count: number; volume: number; commission: number };
  released: { count: number; volume: number; commission: number };
  conversion: { totalReferred: number; withShipments: number; rate: string };
}

// ─── Helpers ───

const formatMXN = (amount: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatMonthLabel = (ym: string) => {
  const [y, m] = ym.split('-');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${months[parseInt(m) - 1]} ${y}`;
};

// ─── Component ───

export default function DashboardAdvisor() {
  const { t } = useTranslation();
  const theme = useTheme();

  // ─── State ───
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<AdvisorDashboardData | null>(null);

  // Clients tab
  const [clients, setClients] = useState<AdvisorClient[]>([]);
  const [clientsTotal, setClientsTotal] = useState(0);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [clientPage, setClientPage] = useState(0);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');

  // Shipments tab
  const [shipments, setShipments] = useState<AdvisorShipment[]>([]);
  const [shipmentsTotal, setShipmentsTotal] = useState(0);
  const [shipmentStats, setShipmentStats] = useState<ShipmentStats | null>(null);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [shipmentSearch, setShipmentSearch] = useState('');
  const [shipmentFilter, setShipmentFilter] = useState<string>('all');
  const [shipmentPage, setShipmentPage] = useState(0);

  // Commissions tab
  const [commissions, setCommissions] = useState<CommissionData | null>(null);
  const [commissionsLoading, setCommissionsLoading] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false, message: '', severity: 'info'
  });

  // ─── Data Loaders ───

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/advisor/dashboard');
      setDashboardData(res.data);
    } catch (err) {
      console.error('Error loading advisor dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      setClientsLoading(true);
      const params: any = { page: clientPage + 1, limit: 25 };
      if (clientSearch) params.search = clientSearch;
      if (clientFilter !== 'all') params.status = clientFilter;
      const res = await api.get('/api/advisor/clients', { params });
      setClients(res.data.clients);
      setClientsTotal(res.data.total);
    } catch (err) {
      console.error('Error loading clients:', err);
    } finally {
      setClientsLoading(false);
    }
  }, [clientPage, clientSearch, clientFilter]);

  const fetchShipments = useCallback(async () => {
    try {
      setShipmentsLoading(true);
      const params: any = { page: shipmentPage + 1, limit: 25 };
      if (shipmentSearch) params.search = shipmentSearch;
      if (shipmentFilter !== 'all') params.filter = shipmentFilter;
      const res = await api.get('/api/advisor/shipments', { params });
      setShipments(res.data.shipments);
      setShipmentsTotal(res.data.total);
      setShipmentStats(res.data.stats);
    } catch (err) {
      console.error('Error loading shipments:', err);
    } finally {
      setShipmentsLoading(false);
    }
  }, [shipmentPage, shipmentSearch, shipmentFilter]);

  const fetchCommissions = useCallback(async () => {
    try {
      setCommissionsLoading(true);
      const res = await api.get('/api/advisor/commissions');
      setCommissions(res.data);
    } catch (err) {
      console.error('Error loading commissions:', err);
    } finally {
      setCommissionsLoading(false);
    }
  }, []);

  // ─── Effects ───

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    if (activeTab === 1) fetchClients();
  }, [activeTab, fetchClients]);

  useEffect(() => {
    if (activeTab === 2) fetchShipments();
  }, [activeTab, fetchShipments]);

  useEffect(() => {
    if (activeTab === 3) fetchCommissions();
  }, [activeTab, fetchCommissions]);

  // ─── Actions ───

  const handleSaveNote = async (clientId: number) => {
    try {
      await api.post(`/api/advisor/clients/${clientId}/notes`, { note: noteText });
      setEditingNoteId(null);
      setSnackbar({ open: true, message: t('advisor.noteSaved'), severity: 'success' });
      fetchClients();
    } catch (err) {
      setSnackbar({ open: true, message: t('advisor.noteError'), severity: 'error' });
    }
  };

  const copyReferralLink = () => {
    const code = dashboardData?.advisor.referralCode;
    if (!code) return;
    const link = `https://app.entregax.com/register?ref=${code}`;
    navigator.clipboard.writeText(link);
    setSnackbar({ open: true, message: t('advisor.linkCopied'), severity: 'success' });
  };

  const shareWhatsApp = () => {
    const code = dashboardData?.advisor.referralCode;
    if (!code) return;
    const link = `https://app.entregax.com/register?ref=${code}`;
    const text = encodeURIComponent(t('advisor.whatsappMessage').replace('{link}', link));
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  // ─── Status Helpers ───

  const getActivityChip = (status: string) => {
    switch (status) {
      case 'new':
        return <Chip icon={<NewIcon />} label={t('advisor.activityNew')} color="info" size="small" />;
      case 'active':
        return <Chip icon={<CheckCircleIcon />} label={t('advisor.activityActive')} color="success" size="small" />;
      case 'dormant':
        return <Chip icon={<DormantIcon />} label={t('advisor.activityDormant')} color="default" size="small" />;
      default:
        return null;
    }
  };

  const getVerificationChip = (verified: boolean, status: string) => {
    if (verified) return <Chip icon={<VerifiedIcon />} label={t('advisor.verified')} color="success" size="small" variant="outlined" />;
    if (status === 'pending_review') return <Chip icon={<PendingIcon />} label={t('advisor.pendingReview')} color="warning" size="small" variant="outlined" />;
    return <Chip icon={<WarningIcon />} label={t('advisor.unverified')} color="error" size="small" variant="outlined" />;
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, { label: string; color: 'default' | 'primary' | 'secondary' | 'warning' | 'success' | 'error' | 'info' }> = {
      'china_warehouse': { label: t('advisor.statusChinaWh'), color: 'info' },
      'usa_warehouse': { label: t('advisor.statusUsaWh'), color: 'info' },
      'mx_warehouse': { label: t('advisor.statusMxWh'), color: 'primary' },
      'in_transit': { label: t('advisor.statusInTransit'), color: 'warning' },
      'ready_pickup': { label: t('advisor.statusReady'), color: 'success' },
      'delivered': { label: t('advisor.statusDelivered'), color: 'default' },
      'cancelled': { label: t('advisor.statusCancelled'), color: 'error' },
    };
    const s = map[status] || { label: status, color: 'default' as const };
    return <Chip label={s.label} color={s.color} size="small" />;
  };

  // ─── KPI Card ───

  const KpiCard = ({ title, value, subtitle, icon, color, trend }: {
    title: string; value: string | number; subtitle?: string;
    icon: React.ReactNode; color: string; trend?: number;
  }) => (
    <Card sx={{ height: '100%', position: 'relative', overflow: 'visible' }}>
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={500}>
              {title}
            </Typography>
            <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5, color }}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          <Avatar sx={{ bgcolor: alpha(color, 0.1), color, width: 48, height: 48 }}>
            {icon}
          </Avatar>
        </Box>
        {trend !== undefined && (
          <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, gap: 0.5 }}>
            {trend >= 0 ? (
              <ArrowUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
            ) : (
              <ArrowDownIcon sx={{ fontSize: 16, color: 'error.main' }} />
            )}
            <Typography variant="caption" color={trend >= 0 ? 'success.main' : 'error.main'} fontWeight={600}>
              {Math.abs(trend)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('advisor.last7days')}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  // ════════════════════════════════════
  // TAB 0: DASHBOARD
  // ════════════════════════════════════

  const renderDashboard = () => {
    if (loading || !dashboardData) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      );
    }
    const d = dashboardData;

    return (
      <Fade in timeout={400}>
        <Box>
          {/* Welcome banner */}
          <Paper
            sx={{
              p: 3, mb: 3, borderRadius: 3,
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
              color: 'white',
            }}
          >
            <Typography variant="h5" fontWeight={700}>
              {t('advisor.welcome')}, {d.advisor.fullName}! 👋
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.85, mt: 0.5 }}>
              {t('advisor.yourCode')}: <strong>{d.advisor.referralCode || '—'}</strong>
              {' · '}
              {t('advisor.role')}: {d.advisor.role}
            </Typography>
          </Paper>

          {/* KPI Cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={ { xs: 12, sm: 6, md: 3 } }>
              <KpiCard
                title={t('advisor.totalClients')}
                value={d.clients.total}
                subtitle={`${d.clients.verified} ${t('advisor.verifiedLower')}`}
                icon={<PeopleIcon />}
                color={theme.palette.primary.main}
                trend={d.clients.new7d}
              />
            </Grid>
            <Grid size={ { xs: 12, sm: 6, md: 3 } }>
              <KpiCard
                title={t('advisor.activeClients')}
                value={d.clients.active}
                subtitle={`${d.clients.dormant} ${t('advisor.dormantLower')}`}
                icon={<SpeedIcon />}
                color={theme.palette.success.main}
              />
            </Grid>
            <Grid size={ { xs: 12, sm: 6, md: 3 } }>
              <KpiCard
                title={t('advisor.shipmentsInTransit')}
                value={d.shipments.inTransit}
                subtitle={`${d.shipments.awaitingPayment} ${t('advisor.awaitingPaymentLower')}`}
                icon={<ShippingIcon />}
                color={theme.palette.warning.main}
              />
            </Grid>
            <Grid size={ { xs: 12, sm: 6, md: 3 } }>
              <KpiCard
                title={t('advisor.monthVolume')}
                value={formatMXN(d.commissions.monthVolumeMxn)}
                subtitle={`${d.commissions.monthPaidCount} ${t('advisor.paidPackages')}`}
                icon={<MoneyIcon />}
                color={theme.palette.info.main}
              />
            </Grid>
          </Grid>

          {/* Second row: Quick action cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={ { xs: 12, sm: 6, md: 4 } }>
              <Card sx={{ height: '100%' }}>
                <CardActionArea onClick={() => setActiveTab(1)} sx={{ p: 2.5, height: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: alpha(theme.palette.warning.main, 0.1), color: 'warning.main' }}>
                      <PendingIcon />
                    </Avatar>
                    <Box>
                      <Typography variant="h6" fontWeight={600}>{d.clients.pendingVerification}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t('advisor.pendingVerifications')}
                      </Typography>
                    </Box>
                  </Box>
                </CardActionArea>
              </Card>
            </Grid>
            <Grid size={ { xs: 12, sm: 6, md: 4 } }>
              <Card sx={{ height: '100%' }}>
                <CardActionArea onClick={() => { setShipmentFilter('awaiting_payment'); setActiveTab(2); }} sx={{ p: 2.5, height: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: alpha(theme.palette.error.main, 0.1), color: 'error.main' }}>
                      <PaymentIcon />
                    </Avatar>
                    <Box>
                      <Typography variant="h6" fontWeight={600}>{d.shipments.awaitingPayment}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t('advisor.shipmentsAwaitingPayment')}
                      </Typography>
                    </Box>
                  </Box>
                </CardActionArea>
              </Card>
            </Grid>
            <Grid size={ { xs: 12, sm: 6, md: 4 } }>
              <Card sx={{ height: '100%' }}>
                <CardActionArea onClick={() => setActiveTab(4)} sx={{ p: 2.5, height: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: alpha(theme.palette.success.main, 0.1), color: 'success.main' }}>
                      <ShareIcon />
                    </Avatar>
                    <Box>
                      <Typography variant="h6" fontWeight={600}>{d.advisor.referralCode || '—'}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t('advisor.shareReferral')}
                      </Typography>
                    </Box>
                  </Box>
                </CardActionArea>
              </Card>
            </Grid>
          </Grid>

          {/* Monthly registrations mini chart */}
          <Paper sx={{ p: 2.5, borderRadius: 2 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              {t('advisor.registrationTrend')}
            </Typography>
            {d.monthlyRegistrations.length === 0 ? (
              <Typography variant="body2" color="text.secondary">{t('advisor.noDataYet')}</Typography>
            ) : (
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 120, mt: 2 }}>
                {d.monthlyRegistrations.map((m, i) => {
                  const max = Math.max(...d.monthlyRegistrations.map(r => parseInt(String(r.new_clients))), 1);
                  const h = (parseInt(String(m.new_clients)) / max) * 100;
                  return (
                    <Box key={i} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                      <Typography variant="caption" fontWeight={600}>{m.new_clients}</Typography>
                      <Box
                        sx={{
                          width: '100%', maxWidth: 48,
                          height: `${Math.max(h, 8)}%`,
                          bgcolor: theme.palette.primary.main,
                          borderRadius: '4px 4px 0 0',
                          transition: 'height 0.3s',
                        }}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.65rem' }}>
                        {formatMonthLabel(m.month)}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Paper>
        </Box>
      </Fade>
    );
  };

  // ════════════════════════════════════
  // TAB 1: MIS CLIENTES
  // ════════════════════════════════════

  const renderClients = () => (
    <Fade in timeout={400}>
      <Box>
        {/* Search & filters */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            placeholder={t('advisor.searchClients')}
            size="small"
            value={clientSearch}
            onChange={(e) => { setClientSearch(e.target.value); setClientPage(0); }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>
            }}
            sx={{ minWidth: 280 }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>{t('advisor.filterStatus')}</InputLabel>
            <Select
              value={clientFilter}
              label={t('advisor.filterStatus')}
              onChange={(e) => { setClientFilter(e.target.value); setClientPage(0); }}
            >
              <MenuItem value="all">{t('advisor.allClients')}</MenuItem>
              <MenuItem value="verified">{t('advisor.verified')}</MenuItem>
              <MenuItem value="pending">{t('advisor.pendingReview')}</MenuItem>
              <MenuItem value="unverified">{t('advisor.unverified')}</MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ flex: 1 }} />
          <Chip label={`${clientsTotal} ${t('advisor.totalLower')}`} variant="outlined" />
        </Box>

        {clientsLoading && <LinearProgress sx={{ mb: 1 }} />}

        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('advisor.clientName')}</TableCell>
                <TableCell>{t('advisor.boxId')}</TableCell>
                <TableCell align="center">{t('advisor.verification')}</TableCell>
                <TableCell align="center">{t('advisor.activity')}</TableCell>
                <TableCell align="center">{t('advisor.packages')}</TableCell>
                <TableCell align="center">{t('advisor.inTransitShort')}</TableCell>
                <TableCell>{t('advisor.lastShipment')}</TableCell>
                <TableCell>{t('advisor.notes')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {clients.length === 0 && !clientsLoading && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">{t('advisor.noClients')}</Typography>
                  </TableCell>
                </TableRow>
              )}
              {clients.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{c.fullName}</Typography>
                      <Typography variant="caption" color="text.secondary">{c.email}</Typography>
                      {c.phone && (
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                          <Tooltip title={t('advisor.callClient')}>
                            <IconButton size="small" href={`tel:${c.phone}`}>
                              <PhoneIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="WhatsApp">
                            <IconButton size="small" onClick={() => window.open(`https://wa.me/${c.phone.replace(/\D/g, '')}`, '_blank')}>
                              <WhatsAppIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={c.boxId || '—'} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell align="center">
                    {getVerificationChip(c.identityVerified, c.verificationStatus)}
                  </TableCell>
                  <TableCell align="center">
                    {getActivityChip(c.activityStatus)}
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" fontWeight={600}>{c.totalPackages}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    {c.inTransitCount > 0 ? (
                      <Chip label={c.inTransitCount} color="warning" size="small" />
                    ) : (
                      <Typography variant="body2" color="text.secondary">0</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {c.lastShipmentAt ? formatDate(c.lastShipmentAt) : t('advisor.never')}
                    </Typography>
                    {c.daysSinceLastShipment !== null && c.daysSinceLastShipment > 30 && (
                      <Typography variant="caption" display="block" color="error.main">
                        {c.daysSinceLastShipment} {t('advisor.daysAgo')}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ minWidth: 180, maxWidth: 250 }}>
                    {editingNoteId === c.id ? (
                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        <TextField
                          size="small"
                          multiline
                          maxRows={3}
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          fullWidth
                          placeholder={t('advisor.writeNote')}
                        />
                        <IconButton size="small" color="primary" onClick={() => handleSaveNote(c.id)}>
                          <SaveIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => setEditingNoteId(null)}>
                          <CancelIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ) : (
                      <Box
                        sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, p: 0.5, borderRadius: 1 }}
                        onClick={() => { setEditingNoteId(c.id); setNoteText(c.advisorNotes || ''); }}
                      >
                        <Typography variant="caption" color={c.advisorNotes ? 'text.primary' : 'text.secondary'}>
                          {c.advisorNotes || t('advisor.clickToAddNote')}
                        </Typography>
                        <EditIcon sx={{ fontSize: 12, ml: 0.5, color: 'text.secondary' }} />
                      </Box>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={clientsTotal}
          page={clientPage}
          onPageChange={(_, p) => setClientPage(p)}
          rowsPerPage={25}
          rowsPerPageOptions={[25]}
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
        />
      </Box>
    </Fade>
  );

  // ════════════════════════════════════
  // TAB 2: EMBARQUES EN TRÁNSITO
  // ════════════════════════════════════

  const renderShipments = () => (
    <Fade in timeout={400}>
      <Box>
        {/* Quick stat pills */}
        {shipmentStats && (
          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: t('advisor.allShipments'), count: shipmentStats.total, color: 'default' as const },
              { key: 'in_transit', label: t('advisor.statusInTransit'), count: shipmentStats.inTransit, color: 'warning' as const },
              { key: 'awaiting_payment', label: t('advisor.awaitingPayment'), count: shipmentStats.awaitingPayment, color: 'error' as const },
              { key: 'ready_pickup', label: t('advisor.statusReady'), count: shipmentStats.readyPickup, color: 'success' as const },
              { key: 'delivered', label: t('advisor.statusDelivered'), count: shipmentStats.delivered, color: 'default' as const },
            ].map(s => (
              <Chip
                key={s.key}
                label={`${s.label} (${s.count})`}
                color={shipmentFilter === s.key ? 'primary' : s.color}
                variant={shipmentFilter === s.key ? 'filled' : 'outlined'}
                onClick={() => { setShipmentFilter(s.key); setShipmentPage(0); }}
                clickable
              />
            ))}
          </Box>
        )}

        {/* Search */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            placeholder={t('advisor.searchShipments')}
            size="small"
            value={shipmentSearch}
            onChange={(e) => { setShipmentSearch(e.target.value); setShipmentPage(0); }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>
            }}
            sx={{ minWidth: 300 }}
          />
        </Box>

        {shipmentsLoading && <LinearProgress sx={{ mb: 1 }} />}

        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('advisor.tracking')}</TableCell>
                <TableCell>{t('advisor.client')}</TableCell>
                <TableCell align="center">{t('advisor.status')}</TableCell>
                <TableCell>{t('advisor.service')}</TableCell>
                <TableCell align="right">{t('advisor.amount')}</TableCell>
                <TableCell align="center">{t('advisor.paid')}</TableCell>
                <TableCell>{t('advisor.date')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shipments.length === 0 && !shipmentsLoading && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">{t('advisor.noShipments')}</Typography>
                  </TableCell>
                </TableRow>
              )}
              {shipments.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{s.tracking || s.internationalTracking || `#${s.id}`}</Typography>
                    {s.childNo && <Typography variant="caption" color="text.secondary">{s.childNo}</Typography>}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{s.clientName}</Typography>
                    <Typography variant="caption" color="text.secondary">{s.clientBoxId}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    {getStatusLabel(s.status)}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{s.serviceType || '—'}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={600}>
                      {s.amount > 0 ? formatMXN(s.amount) : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    {s.clientPaid ? (
                      <Chip icon={<CheckCircleIcon />} label={t('advisor.yes')} color="success" size="small" variant="outlined" />
                    ) : (
                      s.amount > 0 ? (
                        <Chip icon={<PendingIcon />} label={t('advisor.no')} color="error" size="small" variant="outlined" />
                      ) : (
                        <Typography variant="caption" color="text.secondary">—</Typography>
                      )
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{formatDate(s.createdAt)}</Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={shipmentsTotal}
          page={shipmentPage}
          onPageChange={(_, p) => setShipmentPage(p)}
          rowsPerPage={25}
          rowsPerPageOptions={[25]}
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
        />
      </Box>
    </Fade>
  );

  // ════════════════════════════════════
  // TAB 3: MIS COMISIONES
  // ════════════════════════════════════

  const renderCommissions = () => {
    if (commissionsLoading || !commissions) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      );
    }
    const c = commissions;

    return (
      <Fade in timeout={400}>
        <Box>
          {/* Commission rate info */}
          <Paper sx={{ p: 2.5, mb: 3, borderRadius: 2, bgcolor: alpha(theme.palette.info.main, 0.04) }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              {t('advisor.myCommissionRate')}
            </Typography>
            <Grid container spacing={2}>
              <Grid size={ { xs: 4 } }>
                <Typography variant="caption" color="text.secondary">{t('advisor.percentage')}</Typography>
                <Typography variant="h5" fontWeight={700} color="info.main">{c.rate.percentage}%</Typography>
              </Grid>
              <Grid size={ { xs: 4 } }>
                <Typography variant="caption" color="text.secondary">{t('advisor.conversionRate')}</Typography>
                <Typography variant="h5" fontWeight={700}>{c.conversion.rate}%</Typography>
                <Typography variant="caption" color="text.secondary">
                  {c.conversion.withShipments}/{c.conversion.totalReferred} {t('advisor.clientsWithShipments')}
                </Typography>
              </Grid>
              <Grid size={ { xs: 4 } }>
                <Typography variant="caption" color="text.secondary">{t('advisor.leaderOverride')}</Typography>
                <Typography variant="h5" fontWeight={700}>{c.rate.leaderOverride}%</Typography>
              </Grid>
            </Grid>
          </Paper>

          {/* Pending vs Released */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={ { xs: 12, md: 6 } }>
              <Paper sx={{ p: 2.5, borderRadius: 2, borderLeft: 4, borderColor: 'warning.main' }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  {t('advisor.pendingCommissions')}
                </Typography>
                <Typography variant="h4" fontWeight={700} color="warning.main">
                  {formatMXN(c.pending.commission)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {c.pending.count} {t('advisor.packagesPending')} · {t('advisor.volume')}: {formatMXN(c.pending.volume)}
                </Typography>
              </Paper>
            </Grid>
            <Grid size={ { xs: 12, md: 6 } }>
              <Paper sx={{ p: 2.5, borderRadius: 2, borderLeft: 4, borderColor: 'success.main' }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  {t('advisor.releasedCommissions')}
                </Typography>
                <Typography variant="h4" fontWeight={700} color="success.main">
                  {formatMXN(c.released.commission)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {c.released.count} {t('advisor.packagesDelivered')} · {t('advisor.volume')}: {formatMXN(c.released.volume)}
                </Typography>
              </Paper>
            </Grid>
          </Grid>

          {/* Monthly breakdown */}
          <Paper sx={{ p: 2.5, borderRadius: 2 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              {t('advisor.monthlyBreakdown')}
            </Typography>
            {c.monthly.length === 0 ? (
              <Typography variant="body2" color="text.secondary">{t('advisor.noDataYet')}</Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('advisor.month')}</TableCell>
                      <TableCell align="right">{t('advisor.paidCount')}</TableCell>
                      <TableCell align="right">{t('advisor.volume')}</TableCell>
                      <TableCell align="right">{t('advisor.estimatedCommission')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {c.monthly.map((m, i) => (
                      <TableRow key={i}>
                        <TableCell><Typography variant="body2" fontWeight={600}>{formatMonthLabel(m.month)}</Typography></TableCell>
                        <TableCell align="right">{m.paidCount}</TableCell>
                        <TableCell align="right">{formatMXN(m.totalVolume)}</TableCell>
                        <TableCell align="right">
                          <Typography fontWeight={600} color="success.main">{formatMXN(m.estimatedCommission)}</Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Box>
      </Fade>
    );
  };

  // ════════════════════════════════════
  // TAB 4: HERRAMIENTAS DE VENTA
  // ════════════════════════════════════

  const renderTools = () => {
    const code = dashboardData?.advisor.referralCode;
    const referralLink = `https://app.entregax.com/register?ref=${code || ''}`;

    return (
      <Fade in timeout={400}>
        <Box>
          <Grid container spacing={3}>
            {/* Referral Link */}
            <Grid size={ { xs: 12, md: 6 } }>
              <Paper sx={{ p: 3, borderRadius: 2, height: '100%' }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  🔗 {t('advisor.referralLink')}
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  value={referralLink}
                  InputProps={{
                    readOnly: true,
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={copyReferralLink} size="small">
                          <CopyIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{ mb: 2 }}
                />
                <Typography variant="caption" color="text.secondary">
                  {t('advisor.referralLinkDesc')}
                </Typography>
              </Paper>
            </Grid>

            {/* QR Code */}
            <Grid size={ { xs: 12, md: 6 } }>
              <Paper sx={{ p: 3, borderRadius: 2, height: '100%', textAlign: 'center' }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  📱 {t('advisor.qrCode')}
                </Typography>
                {code ? (
                  <Box sx={{ my: 2 }}>
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(referralLink)}`}
                      alt="QR Code"
                      style={{ width: 200, height: 200, borderRadius: 8 }}
                    />
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ my: 4 }}>
                    {t('advisor.noReferralCode')}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {t('advisor.qrDesc')}
                </Typography>
              </Paper>
            </Grid>

            {/* WhatsApp Share */}
            <Grid size={ { xs: 12, md: 6 } }>
              <Paper sx={{ p: 3, borderRadius: 2 }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  💬 {t('advisor.shareWhatsApp')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {t('advisor.whatsappDesc')}
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<WhatsAppIcon />}
                  onClick={shareWhatsApp}
                  sx={{
                    bgcolor: '#25D366', '&:hover': { bgcolor: '#128C7E' },
                    textTransform: 'none', fontWeight: 600,
                  }}
                >
                  {t('advisor.shareNow')}
                </Button>
              </Paper>
            </Grid>

            {/* Quick Quoter */}
            <Grid size={ { xs: 12, md: 6 } }>
              <Paper sx={{ p: 3, borderRadius: 2 }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  🧮 {t('advisor.quickQuoter')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {t('advisor.quoterDesc')}
                </Typography>
                <Button
                  variant="outlined"
                  onClick={() => window.open('https://entregax.com/cotizar', '_blank')}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  {t('advisor.openQuoter')}
                </Button>
              </Paper>
            </Grid>

            {/* My stats card */}
            {dashboardData && (
              <Grid size={ { xs: 12 } }>
                <Paper sx={{ p: 3, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
                  <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                    🏆 {t('advisor.myPerformance')}
                  </Typography>
                  <Grid container spacing={3}>
                    <Grid size={ { xs: 6, sm: 3 } }>
                      <Typography variant="caption" color="text.secondary">{t('advisor.totalReferrals')}</Typography>
                      <Typography variant="h5" fontWeight={700}>{dashboardData.clients.total}</Typography>
                    </Grid>
                    <Grid size={ { xs: 6, sm: 3 } }>
                      <Typography variant="caption" color="text.secondary">{t('advisor.thisMonth')}</Typography>
                      <Typography variant="h5" fontWeight={700}>{dashboardData.clients.new30d}</Typography>
                    </Grid>
                    <Grid size={ { xs: 6, sm: 3 } }>
                      <Typography variant="caption" color="text.secondary">{t('advisor.conversionRate')}</Typography>
                      <Typography variant="h5" fontWeight={700}>
                        {commissions ? commissions.conversion.rate : '—'}%
                      </Typography>
                    </Grid>
                    <Grid size={ { xs: 6, sm: 3 } }>
                      <Typography variant="caption" color="text.secondary">{t('advisor.subAdvisors')}</Typography>
                      <Typography variant="h5" fontWeight={700}>{dashboardData.subAdvisors}</Typography>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            )}
          </Grid>
        </Box>
      </Fade>
    );
  };

  // ════════════════════════════════════
  // MAIN RENDER
  // ════════════════════════════════════

  const tabConfig = useMemo(() => [
    { label: t('advisor.tabDashboard'), icon: <DashboardIcon /> },
    { label: t('advisor.tabClients'), icon: <PeopleIcon /> },
    { label: t('advisor.tabShipments'), icon: <ShippingIcon /> },
    { label: t('advisor.tabCommissions'), icon: <MoneyIcon /> },
    { label: t('advisor.tabTools'), icon: <ToolsIcon /> },
  ], [t]);

  return (
    <Box sx={{ width: '100%' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>
          {t('advisor.panelTitle')}
        </Typography>
        <IconButton onClick={() => {
          fetchDashboard();
          if (activeTab === 1) fetchClients();
          if (activeTab === 2) fetchShipments();
          if (activeTab === 3) fetchCommissions();
        }}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Tab Navigation */}
      <Paper sx={{ borderRadius: 2, mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              minHeight: 56,
            },
          }}
        >
          {tabConfig.map((tab, i) => (
            <Tab key={i} label={tab.label} icon={tab.icon} iconPosition="start" />
          ))}
        </Tabs>
      </Paper>

      {/* Tab Content */}
      {activeTab === 0 && renderDashboard()}
      {activeTab === 1 && renderClients()}
      {activeTab === 2 && renderShipments()}
      {activeTab === 3 && renderCommissions()}
      {activeTab === 4 && renderTools()}

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
