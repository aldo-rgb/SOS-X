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
  useMediaQuery,
  alpha,
  Fade,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  BottomNavigation,
  BottomNavigationAction,
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
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as PendingIcon,
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
  Visibility as VisibilityIcon,
  Close as CloseIcon,
  LocalPhone as LocalPhoneIcon,
  Inventory as InventoryIcon,
  UnfoldMore as UnfoldMoreIcon,
  Security as SecurityIcon,
  GppBad as GppBadIcon,
  GppGood as GppGoodIcon,
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
  pendingPaymentTotal: number;
  missingInstructionsCount: number;
  activityStatus: 'new' | 'active' | 'dormant';
  daysSinceLastShipment: number | null;
}

interface AdvisorShipment {
  id: number;
  uid: string;
  tracking: string;
  internationalTracking: string;
  childNo: string;
  status: string;
  serviceType: string;
  amount: number;
  clientPaid: boolean;
  paidAt: string | null;
  hasInstructions: boolean;
  isMaster: boolean;
  childrenCount: number;
  hasGex: boolean;
  createdAt: string;
  clientId: number;
  clientName: string;
  clientBoxId: string;
  clientPhone: string;
  weight: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  description: string;
}

interface ShipmentStats {
  total: number;
  inTransit: number;
  awaitingPayment: number;
  missingInstructions: number;
  readyPickup: number;
  delivered: number;
}

interface CommissionRate {
  serviceType: string;
  label: string;
  percentage: number;
  leaderOverride: number;
  fixedFee: number;
  isGex: boolean;
}

interface CommissionByService {
  serviceType: string;
  totalCount: number;
  totalVolume: number;
  totalCommission: number;
  totalLeaderOverride: number;
  totalGex: number;
  pendingCount: number;
  pendingCommission: number;
  paidCount: number;
  paidCommission: number;
}

interface CommissionMonthly {
  month: string;
  count: number;
  volume: number;
  commission: number;
  pendingCount: number;
  pendingAmount: number;
  paidCount: number;
  paidAmount: number;
}

interface CommissionRecent {
  id: number;
  shipmentType: string;
  serviceType: string;
  tracking: string;
  clientName: string;
  paymentAmount: number;
  commissionRate: number;
  commissionAmount: number;
  gexCommission: number;
  status: string;
  paidAt: string | null;
  createdAt: string;
}

interface CommissionData {
  rates: CommissionRate[];
  byService: CommissionByService[];
  monthly: CommissionMonthly[];
  totals: {
    totalCount: number;
    totalCommission: number;
    pendingCommission: number;
    paidCommission: number;
    pendingCount: number;
    paidCount: number;
  };
  recent: CommissionRecent[];
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
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));

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
  const [shipmentClientId, setShipmentClientId] = useState<string>('all');
  const [shipmentServiceType, setShipmentServiceType] = useState<string>('all');
  const [selectedShipment, setSelectedShipment] = useState<AdvisorShipment | null>(null);
  const [repackChildren, setRepackChildren] = useState<any[]>([]);
  const [repackChildrenLoading, setRepackChildrenLoading] = useState(false);

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
      const res = await api.get('/advisor/dashboard');
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
      const res = await api.get('/advisor/clients', { params });
      setClients(res.data.clients);
      setClientsTotal(res.data.total);
    } catch (err: any) {
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
      if (shipmentClientId !== 'all') params.clientId = shipmentClientId;
      if (shipmentServiceType !== 'all') params.serviceType = shipmentServiceType;
      const res = await api.get('/advisor/shipments', { params });
      setShipments(res.data.shipments);
      setShipmentsTotal(res.data.total);
      setShipmentStats(res.data.stats);
    } catch (err) {
      console.error('Error loading shipments:', err);
    } finally {
      setShipmentsLoading(false);
    }
  }, [shipmentPage, shipmentSearch, shipmentFilter, shipmentClientId, shipmentServiceType]);

  const fetchCommissions = useCallback(async () => {
    try {
      setCommissionsLoading(true);
      const res = await api.get('/advisor/commissions');
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

  // Load clients for the dropdown when switching to shipments tab
  useEffect(() => {
    if (activeTab === 2) {
      fetchShipments();
      // Also fetch ALL clients for the filter dropdown (no pagination)
      if (clients.length === 0) {
        api.get('/advisor/clients', { params: { limit: 500 } })
          .then(res => { setClients(res.data.clients); setClientsTotal(res.data.total); })
          .catch(() => {});
      }
    }
  }, [activeTab, fetchShipments]);

  useEffect(() => {
    if (activeTab === 3) fetchCommissions();
  }, [activeTab, fetchCommissions]);

  // ─── Actions ───

  const handleSaveNote = async (clientId: number) => {
    try {
      await api.post(`/advisor/clients/${clientId}/notes`, { note: noteText });
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
      'received_china': { label: 'Recibido China', color: 'info' },
      'received': { label: 'Recibido', color: 'primary' },
      'customs': { label: 'Aduana', color: 'warning' },
      'processing': { label: 'Procesando', color: 'info' },
      'received_mty': { label: 'Recibido MTY', color: 'primary' },
      'inspected': { label: 'Inspeccionado', color: 'info' },
      'dispatched': { label: 'Despachado', color: 'warning' },
      'consolidated': { label: 'Consolidado', color: 'info' },
      'at_port': { label: 'En Puerto', color: 'warning' },
      'at_cedis': { label: 'En CEDIS', color: 'primary' },
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
      <CardContent sx={{ p: isMobile ? 1.5 : 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1 }}>
            <Typography 
              variant="caption" 
              color="text.secondary" 
              fontWeight={500}
              sx={{ fontSize: isMobile ? '0.65rem' : '0.75rem' }}
            >
              {title}
            </Typography>
            <Typography 
              variant={isMobile ? 'h5' : 'h4'} 
              fontWeight={700} 
              sx={{ mt: 0.5, color, lineHeight: 1.2 }}
            >
              {value}
            </Typography>
            {subtitle && (
              <Typography 
                variant="caption" 
                color="text.secondary"
                sx={{ fontSize: isMobile ? '0.6rem' : '0.75rem' }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
          <Avatar sx={{ 
            bgcolor: alpha(color, 0.1), 
            color, 
            width: isMobile ? 36 : 48, 
            height: isMobile ? 36 : 48,
            '& .MuiSvgIcon-root': {
              fontSize: isMobile ? '1.2rem' : '1.5rem',
            },
          }}>
            {icon}
          </Avatar>
        </Box>
        {trend !== undefined && (
          <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5, gap: 0.5 }}>
            {trend >= 0 ? (
              <ArrowUpIcon sx={{ fontSize: isMobile ? 12 : 16, color: 'success.main' }} />
            ) : (
              <ArrowDownIcon sx={{ fontSize: isMobile ? 12 : 16, color: 'error.main' }} />
            )}
            <Typography 
              variant="caption" 
              color={trend >= 0 ? 'success.main' : 'error.main'} 
              fontWeight={600}
              sx={{ fontSize: isMobile ? '0.6rem' : '0.75rem' }}
            >
              {Math.abs(trend)}
            </Typography>
            <Typography 
              variant="caption" 
              color="text.secondary"
              sx={{ fontSize: isMobile ? '0.6rem' : '0.75rem' }}
            >
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
          {/* Welcome banner - Mobile optimized */}
          <Paper
            sx={{
              p: isMobile ? 2 : 3, 
              mb: isMobile ? 2 : 3, 
              borderRadius: isMobile ? 2 : 3,
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
              color: 'white',
            }}
          >
            <Typography variant={isMobile ? 'subtitle1' : 'h5'} fontWeight={700}>
              {t('advisor.welcome')}, {d.advisor.fullName?.split(' ')[0]}! 👋
            </Typography>
            <Typography variant={isMobile ? 'caption' : 'body2'} sx={{ opacity: 0.9, mt: 0.5 }}>
              {t('advisor.yourCode')}: <strong>{d.advisor.referralCode || '—'}</strong>
              {!isMobile && (
                <>
                  {' · '}
                  {t('advisor.role')}: {d.advisor.role}
                </>
              )}
            </Typography>
          </Paper>

          {/* KPI Cards - 2x2 grid on mobile */}
          <Grid container spacing={isMobile ? 1 : 2} sx={{ mb: isMobile ? 2 : 3 }}>
            <Grid size={ { xs: 6, sm: 6, md: 3 } }>
              <KpiCard
                title={isMobile ? 'Clientes' : t('advisor.totalClients')}
                value={d.clients.total}
                subtitle={`${d.clients.verified} ${isMobile ? 'verif.' : t('advisor.verifiedLower')}`}
                icon={<PeopleIcon />}
                color={theme.palette.primary.main}
                trend={d.clients.new7d}
              />
            </Grid>
            <Grid size={ { xs: 6, sm: 6, md: 3 } }>
              <KpiCard
                title={isMobile ? 'Activos' : t('advisor.activeClients')}
                value={d.clients.active}
                subtitle={`${d.clients.dormant} ${isMobile ? 'dorm.' : t('advisor.dormantLower')}`}
                icon={<SpeedIcon />}
                color={theme.palette.success.main}
              />
            </Grid>
            <Grid size={ { xs: 6, sm: 6, md: 3 } }>
              <KpiCard
                title={isMobile ? 'En Tránsito' : t('advisor.shipmentsInTransit')}
                value={d.shipments.inTransit}
                subtitle={`${d.shipments.awaitingPayment} ${isMobile ? 'x pagar' : t('advisor.awaitingPaymentLower')}`}
                icon={<ShippingIcon />}
                color={theme.palette.warning.main}
              />
            </Grid>
            <Grid size={ { xs: 6, sm: 6, md: 3 } }>
              <KpiCard
                title={isMobile ? 'Vol. Mes' : t('advisor.monthVolume')}
                value={isMobile ? `$${Math.round(d.commissions.monthVolumeMxn / 1000)}k` : formatMXN(d.commissions.monthVolumeMxn)}
                subtitle={`${d.commissions.monthPaidCount} ${isMobile ? 'paq.' : t('advisor.paidPackages')}`}
                icon={<MoneyIcon />}
                color={theme.palette.info.main}
              />
            </Grid>
          </Grid>

          {/* Second row: Quick action cards - Horizontal scroll on mobile */}
          {isMobile ? (
            <Box sx={{ 
              display: 'flex', 
              gap: 1.5, 
              overflowX: 'auto', 
              pb: 2, 
              mb: 2,
              mx: -2, 
              px: 2,
              '&::-webkit-scrollbar': { display: 'none' },
              scrollbarWidth: 'none',
            }}>
              {/* Pending Verifications */}
              <Card sx={{ minWidth: 140, flexShrink: 0 }}>
                <CardActionArea onClick={() => setActiveTab(1)} sx={{ p: 1.5 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <Avatar sx={{ bgcolor: alpha(theme.palette.warning.main, 0.1), color: 'warning.main', width: 40, height: 40 }}>
                      <PendingIcon sx={{ fontSize: '1.2rem' }} />
                    </Avatar>
                    <Typography variant="h6" fontWeight={700}>{d.clients.pendingVerification}</Typography>
                    <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ lineHeight: 1.2 }}>
                      Por verificar
                    </Typography>
                  </Box>
                </CardActionArea>
              </Card>
              {/* Awaiting Payment */}
              <Card sx={{ minWidth: 140, flexShrink: 0 }}>
                <CardActionArea onClick={() => { setShipmentFilter('awaiting_payment'); setActiveTab(2); }} sx={{ p: 1.5 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <Avatar sx={{ bgcolor: alpha(theme.palette.error.main, 0.1), color: 'error.main', width: 40, height: 40 }}>
                      <PaymentIcon sx={{ fontSize: '1.2rem' }} />
                    </Avatar>
                    <Typography variant="h6" fontWeight={700}>{d.shipments.awaitingPayment}</Typography>
                    <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ lineHeight: 1.2 }}>
                      Por pagar
                    </Typography>
                  </Box>
                </CardActionArea>
              </Card>
              {/* Share Referral */}
              <Card sx={{ minWidth: 140, flexShrink: 0 }}>
                <CardActionArea onClick={() => setActiveTab(4)} sx={{ p: 1.5 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <Avatar sx={{ bgcolor: alpha(theme.palette.success.main, 0.1), color: 'success.main', width: 40, height: 40 }}>
                      <ShareIcon sx={{ fontSize: '1.2rem' }} />
                    </Avatar>
                    <Typography variant="body2" fontWeight={700}>{d.advisor.referralCode || '—'}</Typography>
                    <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ lineHeight: 1.2 }}>
                      Mi código
                    </Typography>
                  </Box>
                </CardActionArea>
              </Card>
            </Box>
          ) : (
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
          )}

          {/* Monthly registrations mini chart */}
          <Paper sx={{ p: isMobile ? 1.5 : 2.5, borderRadius: 2 }}>
            <Typography variant={isMobile ? 'body1' : 'subtitle1'} fontWeight={600} gutterBottom>
              {t('advisor.registrationTrend')}
            </Typography>
            {d.monthlyRegistrations.length === 0 ? (
              <Typography variant="body2" color="text.secondary">{t('advisor.noDataYet')}</Typography>
            ) : (
              <Box sx={{ display: 'flex', gap: isMobile ? 1 : 2, alignItems: 'flex-end', height: isMobile ? 80 : 120, mt: 1 }}>
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
                <TableCell>No. de Cliente</TableCell>
                <TableCell align="center">Sin Instr.</TableCell>
                <TableCell align="center">{t('advisor.inTransitShort')}</TableCell>
                <TableCell align="center">Pdte. Pago</TableCell>
                <TableCell align="right">Saldo Pdte.</TableCell>
                <TableCell>{t('advisor.lastShipment')}</TableCell>
                <TableCell align="center">{t('advisor.verification')}</TableCell>
                <TableCell>{t('advisor.notes')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {clients.length === 0 && !clientsLoading && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
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
                            <IconButton
                              size="small"
                              href={`tel:${c.phone}`}
                              sx={{
                                bgcolor: '#e3f2fd',
                                color: '#1565c0',
                                '&:hover': { bgcolor: '#1565c0', color: '#fff' },
                                width: 28,
                                height: 28,
                              }}
                            >
                              <PhoneIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="WhatsApp">
                            <IconButton
                              size="small"
                              onClick={() => window.open(`https://wa.me/${c.phone.replace(/\D/g, '')}`, '_blank')}
                              sx={{
                                bgcolor: '#e8f5e9',
                                color: '#25D366',
                                '&:hover': { bgcolor: '#25D366', color: '#fff' },
                                width: 28,
                                height: 28,
                              }}
                            >
                              <WhatsAppIcon sx={{ fontSize: 16 }} />
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
                    {c.missingInstructionsCount > 0 ? (
                      <Chip label={c.missingInstructionsCount} color="warning" size="small" />
                    ) : (
                      <Typography variant="body2" color="text.secondary">0</Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {c.inTransitCount > 0 ? (
                      <Chip label={c.inTransitCount} color="warning" size="small" />
                    ) : (
                      <Typography variant="body2" color="text.secondary">0</Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {c.pendingPaymentCount > 0 ? (
                      <Chip label={c.pendingPaymentCount} color="error" size="small" />
                    ) : (
                      <Typography variant="body2" color="text.secondary">0</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {c.pendingPaymentTotal > 0 ? (
                      <Typography variant="body2" fontWeight={700} color="error.main">
                        {formatMXN(c.pendingPaymentTotal)}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">$0</Typography>
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
                  <TableCell align="center">
                    {getVerificationChip(c.identityVerified, c.verificationStatus)}
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
              { key: 'missing_instructions', label: 'Sin Instrucciones', count: shipmentStats.missingInstructions, color: 'info' as const },
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

        {/* Search + Filters */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            placeholder={t('advisor.searchShipments')}
            size="small"
            value={shipmentSearch}
            onChange={(e) => { setShipmentSearch(e.target.value); setShipmentPage(0); }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>
            }}
            sx={{ minWidth: 260 }}
          />
          {/* Client filter */}
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Cliente</InputLabel>
            <Select
              value={shipmentClientId}
              label="Cliente"
              onChange={(e) => { setShipmentClientId(e.target.value); setShipmentPage(0); }}
            >
              <MenuItem value="all">Todos los clientes</MenuItem>
              {clients.map(c => (
                <MenuItem key={c.id} value={String(c.id)}>{c.fullName} ({c.boxId})</MenuItem>
              ))}
            </Select>
          </FormControl>
          {/* Service type filter */}
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Servicio</InputLabel>
            <Select
              value={shipmentServiceType}
              label="Servicio"
              onChange={(e) => { setShipmentServiceType(e.target.value); setShipmentPage(0); }}
            >
              <MenuItem value="all">Todos</MenuItem>
              <MenuItem value="AIR_CHN_MX">✈️ Aéreo China</MenuItem>
              <MenuItem value="SEA_CHN_MX">🚢 Marítimo</MenuItem>
              <MenuItem value="AA_DHL">📦 DHL Monty</MenuItem>
              <MenuItem value="POBOX_USA">📮 PO Box USA</MenuItem>
            </Select>
          </FormControl>
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
                <TableCell align="center">Instrucciones</TableCell>
                <TableCell align="center">GEX</TableCell>
                <TableCell>{t('advisor.date')}</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shipments.length === 0 && !shipmentsLoading && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">{t('advisor.noShipments')}</Typography>
                  </TableCell>
                </TableRow>
              )}
              {shipments.map((s) => (
                <TableRow key={s.uid} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="body2" fontWeight={600}>{s.tracking || s.internationalTracking || `#${s.id}`}</Typography>
                      {s.isMaster && s.childrenCount > 0 && (
                        <Chip label={`${s.childrenCount} guías`} size="small" color="info" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} icon={<UnfoldMoreIcon sx={{ fontSize: 14 }} />} />
                      )}
                    </Box>
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
                    <Chip 
                      size="small" 
                      variant="outlined"
                      label={
                        s.serviceType === 'AIR_CHN_MX' ? '✈️ Aéreo' :
                        s.serviceType === 'SEA_CHN_MX' ? '🚢 Marítimo' :
                        s.serviceType === 'AA_DHL' ? '📦 DHL' :
                        s.serviceType === 'POBOX_USA' ? '📮 POBox' :
                        s.serviceType || '—'
                      }
                      color={
                        s.serviceType === 'AIR_CHN_MX' ? 'primary' :
                        s.serviceType === 'SEA_CHN_MX' ? 'info' :
                        s.serviceType === 'AA_DHL' ? 'warning' :
                        s.serviceType === 'POBOX_USA' ? 'secondary' :
                        'default'
                      }
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={600}>
                      {s.amount > 0 ? formatMXN(s.amount) : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    {s.clientPaid ? (
                      <Tooltip title="Pagado">
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, bgcolor: '#E8F5E9', color: '#2E7D32', borderRadius: 2, px: 1, py: 0.3 }}>
                          <GppGoodIcon sx={{ fontSize: 18 }} />
                          <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.7rem' }}>Pagado</Typography>
                        </Box>
                      </Tooltip>
                    ) : (
                      s.amount > 0 ? (
                        <Tooltip title="Pendiente de pago">
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, bgcolor: '#FFEBEE', color: '#C62828', borderRadius: 2, px: 1, py: 0.3 }}>
                            <GppBadIcon sx={{ fontSize: 18 }} />
                            <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.7rem' }}>Pendiente</Typography>
                          </Box>
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" color="text.secondary">—</Typography>
                      )
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {s.hasInstructions ? (
                      <Tooltip title="Instrucciones configuradas">
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, bgcolor: '#E8F5E9', color: '#2E7D32', borderRadius: 2, px: 1, py: 0.3 }}>
                          <CheckCircleIcon sx={{ fontSize: 18 }} />
                          <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.7rem' }}>Sí</Typography>
                        </Box>
                      </Tooltip>
                    ) : (
                      <Tooltip title="Sin instrucciones de entrega">
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, bgcolor: '#FFF3E0', color: '#E65100', borderRadius: 2, px: 1, py: 0.3 }}>
                          <WarningIcon sx={{ fontSize: 18 }} />
                          <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.7rem' }}>No</Typography>
                        </Box>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {s.hasGex ? (
                      <Tooltip title="Garantía Extendida activa">
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, bgcolor: '#E8F5E9', color: '#2E7D32', borderRadius: 2, px: 1, py: 0.3 }}>
                          <SecurityIcon sx={{ fontSize: 18 }} />
                          <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.7rem' }}>GEX</Typography>
                        </Box>
                      </Tooltip>
                    ) : (
                      <Tooltip title="Sin Garantía Extendida">
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, bgcolor: '#FFEBEE', color: '#C62828', borderRadius: 2, px: 1, py: 0.3 }}>
                          <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <SecurityIcon sx={{ fontSize: 18 }} />
                            <Box sx={{ position: 'absolute', width: '140%', height: 2, bgcolor: '#C62828', transform: 'rotate(-45deg)', borderRadius: 1 }} />
                          </Box>
                          <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.7rem' }}>No</Typography>
                        </Box>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{formatDate(s.createdAt)}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Ver detalles">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setSelectedShipment(s);
                          if (s.isMaster && s.childrenCount > 0) {
                            setRepackChildrenLoading(true);
                            setRepackChildren([]);
                            api.get(`/advisor/shipments/${s.id}/children`)
                              .then(r => setRepackChildren(r.data.children || []))
                              .catch(() => setRepackChildren([]))
                              .finally(() => setRepackChildrenLoading(false));
                          } else {
                            setRepackChildren([]);
                          }
                        }}
                        sx={{ color: '#F05A28' }}
                      >
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
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

    const serviceLabels: Record<string, string> = {
      'pobox_usa_mx': '📦 PO Box USA',
      'aereo_china_mx': '✈️ Aéreo China',
      'maritimo_china_mx': '🚢 Marítimo China',
      'nacional_mx': '🚚 Nacional MX',
      'liberacion_aa_dhl': '📮 DHL Liberación',
      'gex_warranty': '🛡️ GEX Garantía',
    };

    const shipmentTypeLabels: Record<string, string> = {
      'PKG': '📦',
      'MAR': '🚢',
      'DHL': '📮',
      'GEX': '🛡️',
    };

    return (
      <Fade in timeout={400}>
        <Box>
          {/* ── Totales generales ── */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, md: 3 }}>
              <Paper sx={{ p: 2, borderRadius: 2, borderLeft: 4, borderColor: 'warning.main', textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Pendiente de Pago</Typography>
                <Typography variant="h5" fontWeight={700} color="warning.main">
                  {formatMXN(c.totals.pendingCommission)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {c.totals.pendingCount} comisiones
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Paper sx={{ p: 2, borderRadius: 2, borderLeft: 4, borderColor: 'success.main', textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Ya Pagado</Typography>
                <Typography variant="h5" fontWeight={700} color="success.main">
                  {formatMXN(c.totals.paidCommission)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {c.totals.paidCount} comisiones
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Paper sx={{ p: 2, borderRadius: 2, borderLeft: 4, borderColor: 'info.main', textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Total Acumulado</Typography>
                <Typography variant="h5" fontWeight={700} color="info.main">
                  {formatMXN(c.totals.totalCommission)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {c.totals.totalCount} guías pagadas
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Paper sx={{ p: 2, borderRadius: 2, borderLeft: 4, borderColor: 'secondary.main', textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Conversión</Typography>
                <Typography variant="h5" fontWeight={700} color="secondary.main">
                  {c.conversion.rate}%
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {c.conversion.withShipments}/{c.conversion.totalReferred} con envíos
                </Typography>
              </Paper>
            </Grid>
          </Grid>

          {/* ── Desglose por tipo de servicio ── */}
          {c.byService.length > 0 && (
            <Paper sx={{ p: 2.5, mb: 3, borderRadius: 2 }}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                📊 Desglose por Tipo de Servicio
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Servicio</TableCell>
                      <TableCell align="right">Guías</TableCell>
                      <TableCell align="right">Volumen</TableCell>
                      <TableCell align="right">Comisión</TableCell>
                      <TableCell align="center">Pendiente</TableCell>
                      <TableCell align="center">Pagado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {c.byService.map((s, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {serviceLabels[s.serviceType] || s.serviceType}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{s.totalCount}</TableCell>
                        <TableCell align="right">{formatMXN(s.totalVolume)}</TableCell>
                        <TableCell align="right">
                          <Typography fontWeight={600} color="info.main">{formatMXN(s.totalCommission)}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          {s.pendingCommission > 0 ? (
                            <Chip label={formatMXN(s.pendingCommission)} size="small" color="warning" variant="outlined" />
                          ) : (
                            <Typography variant="caption" color="text.secondary">—</Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          {s.paidCommission > 0 ? (
                            <Chip label={formatMXN(s.paidCommission)} size="small" color="success" variant="outlined" />
                          ) : (
                            <Typography variant="caption" color="text.secondary">—</Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {/* ── Tasas de comisión ── */}
          <Paper sx={{ p: 2.5, mb: 3, borderRadius: 2, bgcolor: alpha(theme.palette.info.main, 0.04) }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              💰 Mis Tasas de Comisión
            </Typography>
            <Grid container spacing={2}>
              {c.rates.map((r, i) => (
                <Grid key={i} size={{ xs: 6, sm: 4, md: 2 }}>
                  <Box sx={{ textAlign: 'center', p: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      {r.label}
                    </Typography>
                    <Typography variant="h6" fontWeight={700} color="info.main">
                      {r.isGex ? formatMXN(r.fixedFee) : `${r.percentage}%`}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Paper>

          {/* ── Resumen mensual ── */}
          <Paper sx={{ p: 2.5, mb: 3, borderRadius: 2 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              📅 Resumen Mensual
            </Typography>
            {c.monthly.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Sin datos aún</Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Mes</TableCell>
                      <TableCell align="right">Guías</TableCell>
                      <TableCell align="right">Volumen</TableCell>
                      <TableCell align="right">Comisión</TableCell>
                      <TableCell align="center">Pendiente</TableCell>
                      <TableCell align="center">Pagado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {c.monthly.map((m, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{formatMonthLabel(m.month)}</Typography>
                        </TableCell>
                        <TableCell align="right">{m.count}</TableCell>
                        <TableCell align="right">{formatMXN(m.volume)}</TableCell>
                        <TableCell align="right">
                          <Typography fontWeight={600} color="info.main">{formatMXN(m.commission)}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          {m.pendingAmount > 0 ? (
                            <Chip label={formatMXN(m.pendingAmount)} size="small" color="warning" variant="outlined" />
                          ) : '—'}
                        </TableCell>
                        <TableCell align="center">
                          {m.paidAmount > 0 ? (
                            <Chip label={formatMXN(m.paidAmount)} size="small" color="success" variant="outlined" />
                          ) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>

          {/* ── Detalle de comisiones recientes ── */}
          {c.recent.length > 0 && (
            <Paper sx={{ p: 2.5, borderRadius: 2 }}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                🔍 Últimas Comisiones
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Fecha</TableCell>
                      <TableCell>Tipo</TableCell>
                      <TableCell>Tracking</TableCell>
                      <TableCell>Cliente</TableCell>
                      <TableCell align="right">Monto Base</TableCell>
                      <TableCell align="right">Tasa</TableCell>
                      <TableCell align="right">Comisión</TableCell>
                      <TableCell align="center">Estado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {c.recent.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Typography variant="caption">{formatDate(r.createdAt)}</Typography>
                        </TableCell>
                        <TableCell>
                          <Tooltip title={serviceLabels[r.serviceType] || r.serviceType}>
                            <Typography variant="body2">
                              {shipmentTypeLabels[r.shipmentType] || r.shipmentType}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {r.tracking || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap sx={{ maxWidth: 120 }}>{r.clientName || '—'}</Typography>
                        </TableCell>
                        <TableCell align="right">{formatMXN(r.paymentAmount)}</TableCell>
                        <TableCell align="right">
                          <Typography variant="caption" color="text.secondary">
                            {r.gexCommission > 0 ? 'Fijo' : `${r.commissionRate}%`}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography fontWeight={600} color="info.main">{formatMXN(r.commissionAmount)}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          {r.status === 'paid' ? (
                            <Chip label="Pagado" size="small" color="success" variant="filled" sx={{ fontSize: '0.7rem' }} />
                          ) : (
                            <Chip label="Pendiente" size="small" color="warning" variant="filled" sx={{ fontSize: '0.7rem' }} />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
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
    { label: isMobile ? 'Inicio' : t('advisor.tabDashboard'), icon: <DashboardIcon />, shortLabel: 'Inicio' },
    { label: isMobile ? 'Clientes' : t('advisor.tabClients'), icon: <PeopleIcon />, shortLabel: 'Clientes' },
    { label: isMobile ? 'Envíos' : t('advisor.tabShipments'), icon: <ShippingIcon />, shortLabel: 'Envíos' },
    { label: isMobile ? '$' : t('advisor.tabCommissions'), icon: <MoneyIcon />, shortLabel: 'Comisiones' },
    { label: isMobile ? 'Más' : t('advisor.tabTools'), icon: <ToolsIcon />, shortLabel: 'Herramientas' },
  ], [t, isMobile]);

  return (
    <Box sx={{ 
      width: '100%',
      pb: isMobile ? 8 : 0, // Space for bottom navigation on mobile
    }}>
      {/* Header - Simplified for mobile */}
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        mb: isMobile ? 1 : 2,
        px: isMobile ? 0 : 0,
      }}>
        <Typography variant={isMobile ? 'h6' : 'h5'} fontWeight={700}>
          {t('advisor.panelTitle')}
        </Typography>
        <IconButton 
          onClick={() => {
            fetchDashboard();
            if (activeTab === 1) fetchClients();
            if (activeTab === 2) fetchShipments();
            if (activeTab === 3) fetchCommissions();
          }}
          size={isMobile ? 'small' : 'medium'}
        >
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Tab Navigation - Desktop/Tablet */}
      {!isMobile && (
        <Paper sx={{ borderRadius: 2, mb: 3 }}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            variant={isTablet ? 'scrollable' : 'standard'}
            scrollButtons={isTablet ? 'auto' : false}
            centered={!isTablet}
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
      )}

      {/* Tab Content */}
      <Box sx={{ minHeight: isMobile ? 'calc(100vh - 180px)' : 'auto' }}>
        {activeTab === 0 && renderDashboard()}
        {activeTab === 1 && renderClients()}
        {activeTab === 2 && renderShipments()}
        {activeTab === 3 && renderCommissions()}
        {activeTab === 4 && renderTools()}
      </Box>

      {/* Bottom Navigation - Mobile Only */}
      {isMobile && (
        <Paper 
          sx={{ 
            position: 'fixed', 
            bottom: 0, 
            left: 0, 
            right: 0, 
            zIndex: 1200,
            borderRadius: '16px 16px 0 0',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
          }} 
          elevation={3}
        >
          <BottomNavigation
            value={activeTab}
            onChange={(_, newValue) => setActiveTab(newValue)}
            showLabels
            sx={{
              height: 64,
              '& .MuiBottomNavigationAction-root': {
                minWidth: 'auto',
                px: 1,
                '&.Mui-selected': {
                  color: theme.palette.primary.main,
                },
              },
              '& .MuiBottomNavigationAction-label': {
                fontSize: '0.65rem',
                mt: 0.5,
                '&.Mui-selected': {
                  fontSize: '0.7rem',
                },
              },
            }}
          >
            {tabConfig.map((tab, i) => (
              <BottomNavigationAction 
                key={i} 
                label={tab.shortLabel} 
                icon={tab.icon} 
              />
            ))}
          </BottomNavigation>
        </Paper>
      )}

      {/* ── Shipment Detail Dialog ── */}
      <Dialog
        open={!!selectedShipment}
        onClose={() => setSelectedShipment(null)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}
      >
        {selectedShipment && (() => {
          const s = selectedShipment;
          const serviceLabel =
            s.serviceType === 'AIR_CHN_MX' ? '✈️ Aéreo China → México' :
            s.serviceType === 'SEA_CHN_MX' ? '🚢 Marítimo China → México' :
            s.serviceType === 'AA_DHL' ? '📦 DHL Monty' :
            s.serviceType === 'POBOX_USA' ? '📮 PO Box USA' :
            s.serviceType || 'N/A';
          return (
            <>
              <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <InventoryIcon sx={{ color: '#F05A28' }} />
                  <Typography variant="h6" fontWeight={700}>Detalle del Embarque</Typography>
                </Box>
                <IconButton onClick={() => setSelectedShipment(null)} size="small">
                  <CloseIcon />
                </IconButton>
              </DialogTitle>
              <DialogContent dividers>
                {/* Service type banner */}
                <Box sx={{
                  bgcolor: s.serviceType === 'SEA_CHN_MX' ? '#e3f2fd' :
                           s.serviceType === 'AA_DHL' ? '#fff3e0' :
                           s.serviceType === 'AIR_CHN_MX' ? '#e8eaf6' :
                           '#f3e5f5',
                  borderRadius: 2, p: 1.5, mb: 2, textAlign: 'center'
                }}>
                  <Typography variant="subtitle1" fontWeight={700}>{serviceLabel}</Typography>
                </Box>

                {/* Tracking info */}
                <Typography variant="overline" color="text.secondary" sx={{ mt: 1 }}>Información de Rastreo</Typography>
                <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
                  <Grid container spacing={1.5}>
                    <Grid size={{ xs: 12 }}>
                      <Typography variant="caption" color="text.secondary">Tracking</Typography>
                      <Typography variant="body2" fontWeight={600}>{s.tracking || '—'}</Typography>
                    </Grid>
                    {s.childNo && (
                      <Grid size={{ xs: 12 }}>
                        <Typography variant="caption" color="text.secondary">Referencia</Typography>
                        <Typography variant="body2" fontWeight={600}>{s.childNo}</Typography>
                      </Grid>
                    )}
                    {s.description && (
                      <Grid size={{ xs: 12 }}>
                        <Typography variant="caption" color="text.secondary">Descripción</Typography>
                        <Typography variant="body2" fontWeight={600}>{s.description}</Typography>
                      </Grid>
                    )}
                  </Grid>
                </Paper>

                {/* Peso y Medidas */}
                <Typography variant="overline" color="text.secondary">Peso y Medidas</Typography>
                <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
                  <Grid container spacing={1.5}>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="caption" color="text.secondary">⚖️ Peso</Typography>
                      <Typography variant="h6" fontWeight={700} color={s.weight > 0 ? 'text.primary' : 'text.secondary'}>
                        {s.weight > 0 ? `${s.weight.toFixed(2)} kg` : 'Sin registrar'}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="caption" color="text.secondary">📐 Medidas (L × A × A)</Typography>
                      <Typography variant="h6" fontWeight={700} color={s.lengthCm > 0 ? 'text.primary' : 'text.secondary'}>
                        {s.lengthCm > 0 ? `${s.lengthCm} × ${s.widthCm} × ${s.heightCm} cm` : 'Sin registrar'}
                      </Typography>
                    </Grid>
                    {s.lengthCm > 0 && s.widthCm > 0 && s.heightCm > 0 && (
                      <Grid size={{ xs: 12 }}>
                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                          <Chip 
                            label={`Vol: ${((s.lengthCm * s.widthCm * s.heightCm) / 1000000).toFixed(4)} m³`} 
                            size="small" 
                            variant="outlined" 
                            color="info" 
                          />
                          <Chip 
                            label={`Peso Vol: ${((s.lengthCm * s.widthCm * s.heightCm) / 5000).toFixed(2)} kg`} 
                            size="small" 
                            variant="outlined" 
                            color="warning" 
                          />
                        </Box>
                      </Grid>
                    )}
                  </Grid>
                </Paper>

                {/* Status & Payment */}
                <Typography variant="overline" color="text.secondary">Estado y Pago</Typography>
                <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
                  <Grid container spacing={1.5} alignItems="center">
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="caption" color="text.secondary">Estado</Typography>
                      <Box sx={{ mt: 0.5 }}>{getStatusLabel(s.status)}</Box>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="caption" color="text.secondary">Pagado</Typography>
                      <Box sx={{ mt: 0.5 }}>
                        {s.clientPaid ? (
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, bgcolor: '#E8F5E9', color: '#2E7D32', borderRadius: 2, px: 1.5, py: 0.5 }}>
                            <GppGoodIcon sx={{ fontSize: 20 }} />
                            <Typography variant="body2" fontWeight={700}>Pagado</Typography>
                          </Box>
                        ) : s.amount > 0 ? (
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, bgcolor: '#FFEBEE', color: '#C62828', borderRadius: 2, px: 1.5, py: 0.5 }}>
                            <GppBadIcon sx={{ fontSize: 20 }} />
                            <Typography variant="body2" fontWeight={700}>Pendiente</Typography>
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary">—</Typography>
                        )}
                      </Box>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="caption" color="text.secondary">Monto</Typography>
                      <Typography variant="h6" fontWeight={700} color={s.amount > 0 ? '#F05A28' : 'text.secondary'}>
                        {s.amount > 0 ? formatMXN(s.amount) : '—'}
                      </Typography>
                    </Grid>
                    {s.paidAt && (
                      <Grid size={{ xs: 6 }}>
                        <Typography variant="caption" color="text.secondary">Fecha de Pago</Typography>
                        <Typography variant="body2">{formatDate(s.paidAt)}</Typography>
                      </Grid>
                    )}
                  </Grid>
                </Paper>

                {/* Client info */}
                <Typography variant="overline" color="text.secondary">Información del Cliente</Typography>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                    <Avatar sx={{ bgcolor: '#F05A28', width: 40, height: 40, fontSize: 16 }}>
                      {s.clientName?.charAt(0) || '?'}
                    </Avatar>
                    <Box>
                      <Typography variant="body1" fontWeight={600}>{s.clientName}</Typography>
                      <Typography variant="caption" color="text.secondary">{s.clientBoxId}</Typography>
                    </Box>
                  </Box>
                  {s.clientPhone && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                      <LocalPhoneIcon fontSize="small" color="action" />
                      <Typography variant="body2">{s.clientPhone}</Typography>
                      <Tooltip title="Llamar">
                        <IconButton size="small" href={`tel:${s.clientPhone}`} sx={{ color: '#F05A28' }}>
                          <PhoneIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="WhatsApp">
                        <IconButton size="small" href={`https://wa.me/52${s.clientPhone.replace(/\D/g,'')}`} target="_blank" sx={{ color: '#25D366' }}>
                          <WhatsAppIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                </Paper>

                {/* Repack children */}
                {s.isMaster && s.childrenCount > 0 && (
                  <>
                    <Typography variant="overline" color="text.secondary" sx={{ mt: 2 }}>
                      📦 Guías en este Repack ({s.childrenCount})
                    </Typography>
                    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                      {repackChildrenLoading ? (
                        <Box sx={{ p: 3, textAlign: 'center' }}>
                          <CircularProgress size={24} />
                          <Typography variant="caption" display="block" sx={{ mt: 1 }}>Cargando guías…</Typography>
                        </Box>
                      ) : repackChildren.length > 0 ? (
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ bgcolor: alpha('#F05A28', 0.06) }}>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Tracking</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Estado</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Monto</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {repackChildren.map((child: any) => (
                              <TableRow key={child.id} hover>
                                <TableCell>
                                  <Typography variant="body2" fontWeight={600} fontSize="0.8rem">{child.tracking}</Typography>
                                  {child.description && <Typography variant="caption" color="text.secondary" display="block">{child.description}</Typography>}
                                </TableCell>
                                <TableCell>{getStatusLabel(child.status)}</TableCell>
                                <TableCell>
                                  <Typography variant="body2" fontWeight={600} fontSize="0.8rem">
                                    {child.amount > 0 ? formatMXN(child.amount) : '—'}
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <Box sx={{ p: 2, textAlign: 'center' }}>
                          <Typography variant="caption" color="text.secondary">No se encontraron guías</Typography>
                        </Box>
                      )}
                    </Paper>
                  </>
                )}

                <Divider sx={{ my: 2 }} />
                <Typography variant="caption" color="text.secondary" textAlign="center" display="block">
                  Fecha de creación: {formatDate(s.createdAt)}
                </Typography>
              </DialogContent>
              <DialogActions sx={{ px: 3, py: 2, flexDirection: 'column', gap: 1 }}>
                {s.clientPhone && (
                  <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
                    {/* Recordatorio de Pago */}
                    {!s.clientPaid && s.amount > 0 && (
                      <Button
                        variant="contained"
                        fullWidth
                        startIcon={<WhatsAppIcon />}
                        href={`https://wa.me/52${s.clientPhone.replace(/\D/g,'')}?text=${encodeURIComponent(
                          `¡Hola ${s.clientName?.split(' ')[0] || ''}! 👋\n\n` +
                          `Te recordamos que tienes un pago pendiente en EntregaX:\n\n` +
                          `📦 Tracking: ${s.tracking || s.uid}\n` +
                          `💰 Monto: $${s.amount.toFixed(2)} MXN\n\n` +
                          `Puedes realizar tu pago desde la app o siguiendo este tutorial:\n` +
                          `🔗 https://entregax.app/tutoriales#como-pagar\n\n` +
                          `¿Necesitas ayuda? Estoy para apoyarte. 😊`
                        )}`}
                        target="_blank"
                        sx={{ 
                          borderRadius: 2, 
                          bgcolor: '#F05A28', 
                          '&:hover': { bgcolor: '#d14a1e' },
                          textTransform: 'none',
                          fontSize: '0.8rem'
                        }}
                      >
                        💳 Recordatorio de Pago
                      </Button>
                    )}
                    {/* Recordatorio de Instrucciones */}
                    {!s.hasInstructions && (
                      <Button
                        variant="contained"
                        fullWidth
                        startIcon={<WhatsAppIcon />}
                        href={`https://wa.me/52${s.clientPhone.replace(/\D/g,'')}?text=${encodeURIComponent(
                          `¡Hola ${s.clientName?.split(' ')[0] || ''}! 👋\n\n` +
                          `Te recordamos que tu paquete necesita instrucciones de entrega:\n\n` +
                          `📦 Tracking: ${s.tracking || s.uid}\n\n` +
                          `Para que podamos enviarte tu paquete, necesitas asignar tu dirección de entrega desde la app.\n\n` +
                          `📋 Tutorial paso a paso:\n` +
                          `🔗 https://entregax.app/tutoriales#instrucciones-entrega\n\n` +
                          `¿Necesitas ayuda? Estoy para apoyarte. 😊`
                        )}`}
                        target="_blank"
                        sx={{ 
                          borderRadius: 2, 
                          bgcolor: '#25D366', 
                          '&:hover': { bgcolor: '#1ea952' },
                          textTransform: 'none',
                          fontSize: '0.8rem'
                        }}
                      >
                        📋 Recordatorio de Instrucciones
                      </Button>
                    )}
                  </Box>
                )}
                <Button onClick={() => setSelectedShipment(null)} variant="outlined" sx={{ borderRadius: 2, width: '100%' }}>
                  Cerrar
                </Button>
              </DialogActions>
            </>
          );
        })()}
      </Dialog>

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
