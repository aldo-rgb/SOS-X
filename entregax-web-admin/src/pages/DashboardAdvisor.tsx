// ============================================
// DASHBOARD - PANEL DEL ASESOR / ADVISOR PANEL
// 6 secciones: Dashboard, Clientes, Embarques, Comisiones, Herramientas, Tickets
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
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  BottomNavigation,
  BottomNavigationAction,
  Checkbox,
  FormControlLabel,
  FormGroup,
  List,
  ListItem,
  Switch,
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
  Badge as BadgeIcon,
  GppGood as GppGoodIcon,
  AccountBalanceWallet as WalletIcon,
  LocationOn as LocationIcon,
  LocalShipping as CarrierIcon,
  ConfirmationNumber as TicketIcon,
  Send as SendIcon,
  AttachFile as AttachFileIcon,
  PictureAsPdf as PdfIcon,
  InsertDriveFile as FileIcon,
  Image as ImageIcon,
  BugReport as BugIcon,
  MonetizationOn as BillingIcon,
  PersonOff as ClientIssueIcon,
  MoreHoriz as OtherIcon,
  ListAlt as ListAltIcon,
} from '@mui/icons-material';
import api from '../services/api';
import { usePaymentStatus } from '../hooks/usePaymentStatus';
import AdvisorVerificationWizard from '../components/AdvisorVerificationWizard';
import AdvisorTermsSignatureDialog from '../components/AdvisorTermsSignatureDialog';

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
    isVerified?: boolean;
    verificationStatus?: string;
    privacyAccepted?: boolean;
    privacyAcceptedAt?: string | null;
    hasPrivacySignature?: boolean;
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
  deliveryCarrierName: string | null;
  deliveryCarrierIcon: string | null;
  deliveryAddressName: string | null;
  deliveryAddressCity: string | null;
  deliveryAddressRecipient: string | null;
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

// Interface para Cartera del Cliente
interface ClientWallet {
  cliente: {
    id: number;
    nombre: string;
    email: string;
    casillero: string;
  };
  cartera: {
    total_pendiente: number;
    moneda: string;
    saldo_por_servicio: Array<{
      servicio: string;
      monto: number;
      moneda: string;
      icono: string;
    }>;
    cotizaciones_pendientes: {
      count: number;
      total: number;
    };
    saldo_favor: number;
    credito_disponible: number;
  };
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
  const { advisorInstructionsEnabled } = usePaymentStatus();

  // ─── State ───
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<AdvisorDashboardData | null>(null);
  const [verifyWizardOpen, setVerifyWizardOpen] = useState(false);
  const [termsDialogOpen, setTermsDialogOpen] = useState(false);

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
  const [_shipmentStats, setShipmentStats] = useState<ShipmentStats | null>(null);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [shipmentSearch, setShipmentSearch] = useState('');
  const [shipmentFilter, setShipmentFilter] = useState<string>('all');
  const [shipmentPage, setShipmentPage] = useState(0);
  const [shipmentClientId, setShipmentClientId] = useState<string>('all');
  const [shipmentServiceType, setShipmentServiceType] = useState<string>('all');
  const [shipmentPaymentFilter, setShipmentPaymentFilter] = useState<string>('all');
  const [shipmentInstructionsFilter, setShipmentInstructionsFilter] = useState<string>('all');
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());

  // Assign instructions dialog
  const [instrDialogOpen, setInstrDialogOpen] = useState(false);
  const [instrShipment, setInstrShipment] = useState<AdvisorShipment | null>(null);
  const [instrAddresses, setInstrAddresses] = useState<any[]>([]);
  const [instrLoading, setInstrLoading] = useState(false);
  const [instrSaving, setInstrSaving] = useState(false);
  const [instrSelectedId, setInstrSelectedId] = useState<string>('');
  const [instrCarriers, setInstrCarriers] = useState<any[]>([]);
  const [instrCarrierKey, setInstrCarrierKey] = useState<string>('');
  const [instrCarriersLoading, setInstrCarriersLoading] = useState(false);
  // Price estimate & COD documents
  const [instrPriceEstimate, setInstrPriceEstimate] = useState<{ price: number; perBox: number; boxes: number; days: string } | null>(null);
  const [instrPriceLoading, setInstrPriceLoading] = useState(false);
  const [instrIsCollect, setInstrIsCollect] = useState(false);
  const [instrFacturaFile, setInstrFacturaFile] = useState<File | null>(null);
  const [instrGuiaFile, setInstrGuiaFile] = useState<File | null>(null);
  const [instrWantsFactura, setInstrWantsFactura] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<AdvisorShipment | null>(null);
  const [repackChildren, setRepackChildren] = useState<any[]>([]);
  const [repackChildrenLoading, setRepackChildrenLoading] = useState(false);

  // Commissions tab
  const [commissions, setCommissions] = useState<CommissionData | null>(null);
  const [commissionsLoading, setCommissionsLoading] = useState(false);

  // Wallet modal
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletData, setWalletData] = useState<ClientWallet | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  // Addresses modal
  const [addressesModalOpen, setAddressesModalOpen] = useState(false);
  const [addressesClient, setAddressesClient] = useState<{ id: number; name: string } | null>(null);
  const [clientAddresses, setClientAddresses] = useState<any[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [editingAddress, setEditingAddress] = useState<any | null>(null);
  const [addressServiceTypes, setAddressServiceTypes] = useState<string[]>([]);
  const [addressCarrierConfig, setAddressCarrierConfig] = useState<Record<string, string>>({});
  const [addressSaving, setAddressSaving] = useState(false);
  const [carriersCache, setCarriersCache] = useState<Record<string, any[]>>({});

  // New address form (advisor adding address for client)
  const [newAddrOpen, setNewAddrOpen] = useState(false);
  const [newAddrSaving, setNewAddrSaving] = useState(false);
  const EMPTY_ADDR = { alias: '', recipientName: '', street: '', exteriorNumber: '', interiorNumber: '', neighborhood: '', city: '', state: '', zipCode: '' };
  const [newAddrForm, setNewAddrForm] = useState(EMPTY_ADDR);

  // Team tab
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [teamMyCommission, setTeamMyCommission] = useState(0);
  const [teamLoading, setTeamLoading] = useState(false);
  // Team member detail modal
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamModalMember, setTeamModalMember] = useState<any | null>(null);
  const [teamModalTab, setTeamModalTab] = useState(0);
  const [teamModalClients, setTeamModalClients] = useState<any[]>([]);
  const [teamModalTickets, setTeamModalTickets] = useState<any[]>([]);
  const [teamModalLoading, setTeamModalLoading] = useState(false);

  // Tickets tab
  const [ticketCategory, setTicketCategory] = useState('');
  const [ticketTracking, setTicketTracking] = useState('');
  const [ticketClientNumber, setTicketClientNumber] = useState('');
  const [ticketCedis, setTicketCedis] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketImages, setTicketImages] = useState<{ file: File; preview: string }[]>([]);
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketSuccessFolio, setTicketSuccessFolio] = useState('');
  const [advisorTickets, setAdvisorTickets] = useState<any[]>([]);
  const [advisorTicketsLoading, setAdvisorTicketsLoading] = useState(false);
  const [selectedAdvisorTicket, setSelectedAdvisorTicket] = useState<any | null>(null);
  const [ticketMessages, setTicketMessages] = useState<any[]>([]);
  const [ticketReply, setTicketReply] = useState('');
  const [ticketReplyFiles, setTicketReplyFiles] = useState<File[]>([]);
  const [ticketReplySending, setTicketReplySending] = useState(false);

  // Preferencias de notificaciones
  const [notifPrefs, setNotifPrefs] = useState({ whatsapp: true, push: true, air: true, maritime: true, dhl: true, pobox: true });
  const [notifLoading, setNotifLoading] = useState(false);

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
    } catch (err: any) {
      const data = err?.response?.data;
      if (data?.code === 'ADVISOR_ONBOARDING_REQUIRED' && data?.onboarding) {
        // Construir un dashboardData mínimo para que el gate funcione
        setDashboardData({
          advisor: {
            id: 0,
            fullName: '',
            email: '',
            referralCode: '',
            boxId: '',
            role: 'advisor',
            joinedAt: '',
            isVerified: data.onboarding.isVerified,
            verificationStatus: data.onboarding.verificationStatus,
            privacyAccepted: data.onboarding.privacyAccepted,
            hasPrivacySignature: data.onboarding.hasPrivacySignature,
          },
        } as any);
      } else {
        console.error('Error loading advisor dashboard:', err);
      }
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
      if (shipmentPaymentFilter !== 'all') params.payment = shipmentPaymentFilter;
      if (shipmentInstructionsFilter !== 'all') params.instructions = shipmentInstructionsFilter;
      const res = await api.get('/advisor/shipments', { params });
      setShipments(res.data.shipments);
      setShipmentsTotal(res.data.total);
      setShipmentStats(res.data.stats);
    } catch (err) {
      console.error('Error loading shipments:', err);
    } finally {
      setShipmentsLoading(false);
    }
  }, [shipmentPage, shipmentSearch, shipmentFilter, shipmentClientId, shipmentServiceType, shipmentPaymentFilter, shipmentInstructionsFilter]);

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
    fetchNotifPrefs();
  }, [fetchDashboard]);

  const fetchNotifPrefs = async () => {
    setNotifLoading(true);
    try {
      const r = await api.get('/notifications/preferences');
      setNotifPrefs(r.data);
    } catch {}
    setNotifLoading(false);
  };

  const updateNotifPref = async (key: keyof typeof notifPrefs, value: boolean) => {
    const prev = { ...notifPrefs };
    setNotifPrefs({ ...notifPrefs, [key]: value });
    try {
      await api.put('/notifications/preferences', { [key]: value });
    } catch {
      setNotifPrefs(prev);
      setSnackbar({ open: true, message: 'Error al guardar preferencia', severity: 'error' });
    }
  };

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

  useEffect(() => {
    if (activeTab === 5) fetchAdvisorTickets();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 6) fetchTeam();
  }, [activeTab]);

  const fetchTeam = async () => {
    setTeamLoading(true);
    try {
      const res = await api.get('/advisor/team');
      setTeamMembers(res.data?.team || []);
      setTeamMyCommission(res.data?.my_commission || 0);
    } catch { /* silencioso */ } finally {
      setTeamLoading(false);
    }
  };

  const openTeamMemberModal = async (member: any) => {
    setTeamModalMember(member);
    setTeamModalTab(0);
    setTeamModalClients([]);
    setTeamModalTickets([]);
    setTeamModalOpen(true);
    setTeamModalLoading(true);
    try {
      const [clientsRes, ticketsRes] = await Promise.all([
        api.get('/advisor/clients', { params: { subAdvisorId: member.id, limit: 100 } }),
        api.get('/advisor/client-tickets', { params: { subAdvisorId: member.id } }),
      ]);
      setTeamModalClients(clientsRes.data?.clients || []);
      setTeamModalTickets(ticketsRes.data?.tickets || []);
    } catch { /* silencioso */ } finally {
      setTeamModalLoading(false);
    }
  };

  // ─── Actions ───

  const ADVISOR_TICKET_CATEGORIES = [
    { key: 'systemError',  label: 'Error del Sistema',    icon: <BugIcon />,          color: '#f44336', noTracking: true },
    { key: 'billing',      label: 'Comisiones / Pagos',   icon: <BillingIcon />,      color: '#4CAF50', noTracking: true },
    { key: 'tracking',     label: 'Ajustes a un paquete', icon: <SearchIcon />,       color: '#2196F3', noTracking: false },
    { key: 'clientIssue',  label: 'Problema con Cliente', icon: <ClientIssueIcon />,  color: '#FF9800', noTracking: true },
    { key: 'other',        label: 'Otro',                 icon: <OtherIcon />,        color: '#9E9E9E', noTracking: true },
  ];

  const fetchAdvisorTickets = async () => {
    setAdvisorTicketsLoading(true);
    try {
      const res = await api.get('/support/tickets');
      setAdvisorTickets(res.data || []);
    } catch { /* silencioso */ } finally {
      setAdvisorTicketsLoading(false);
    }
  };

  const fetchTicketMessages = async (ticketId: number) => {
    try {
      const res = await api.get(`/support/ticket/${ticketId}/messages`);
      setTicketMessages(res.data || []);
    } catch { /* silencioso */ }
  };

  const handleSubmitAdvisorTicket = async () => {
    if (!ticketCategory || !ticketDescription.trim()) return;
    setTicketSubmitting(true);
    try {
      const formData = new FormData();
      const metaLines: string[] = [];
      if (ticketClientNumber.trim()) metaLines.push(`• Número de cliente: ${ticketClientNumber.trim()}`);
      if (ticketCedis.trim()) metaLines.push(`• Cedis de incidencia: ${ticketCedis.trim()}`);
      if (ticketTracking.trim()) metaLines.push(`• Número de guía: ${ticketTracking.trim()}`);
      const fullMsg = metaLines.length > 0
        ? `📋 Datos de incidencia:\n${metaLines.join('\n')}\n\n${ticketDescription.trim()}`
        : ticketDescription.trim();
      formData.append('message', fullMsg);
      formData.append('category', ticketCategory);
      formData.append('escalateDirectly', 'true');
      ticketImages.forEach((img, i) => {
        formData.append('images', img.file, `ticket_img_${i}.${img.file.name.split('.').pop()}`);
      });
      const res = await api.post('/support/message', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setTicketSuccessFolio(res.data?.ticketFolio || '');
      setTicketCategory('');
      setTicketTracking('');
      setTicketClientNumber('');
      setTicketCedis('');
      setTicketDescription('');
      setTicketImages([]);
      fetchAdvisorTickets();
    } catch {
      setSnackbar({ open: true, message: 'Error al crear ticket', severity: 'error' });
    } finally {
      setTicketSubmitting(false);
    }
  };

  const handleSendTicketReply = async () => {
    if (!selectedAdvisorTicket) return;
    if (!ticketReply.trim() && ticketReplyFiles.length === 0) return;
    setTicketReplySending(true);
    try {
      const form = new FormData();
      form.append('message', ticketReply.trim());
      ticketReplyFiles.forEach((f) => form.append('images', f, f.name));
      await api.post(
        `/support/ticket/${selectedAdvisorTicket.id}/message`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setTicketReply('');
      setTicketReplyFiles([]);
      fetchTicketMessages(selectedAdvisorTicket.id);
    } catch { /* silencioso */ } finally {
      setTicketReplySending(false);
    }
  };

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

  const handleViewWallet = async (clientId: number) => {
    try {
      setWalletLoading(true);
      setWalletModalOpen(true);
      const res = await api.get(`/advisor/clients/${clientId}/wallet`);
      setWalletData(res.data);
    } catch (err) {
      console.error('Error loading client wallet:', err);
      setSnackbar({ open: true, message: 'Error al cargar cartera del cliente', severity: 'error' });
      setWalletModalOpen(false);
    } finally {
      setWalletLoading(false);
    }
  };

  const SERVICE_LIST = [
    { value: 'air',         label: '✈️ Aéreo China',     color: '#2196F3', serviceType: 'china_air' },
    { value: 'maritime',    label: '🚢 Marítimo China',   color: '#00897B', serviceType: 'china_sea' },
    { value: 'tdi_express', label: '✈️ TDI DHL',           color: '#7B1FA2', serviceType: 'tdi_express' },
    { value: 'dhl',         label: '📮 Liberación MTY',   color: '#D32F2F', serviceType: 'dhl' },
    { value: 'usa',         label: '📦 PO Box USA',       color: '#F05A28', serviceType: 'usa_pobox' },
  ];

  // Mapeo de serviceType del envío → clave para carrier-options y carrier_config
  const SHIPMENT_TYPE_TO_CARRIER_SERVICE: Record<string, string> = {
    'AIR_CHN_MX': 'china_air',
    'SEA_CHN_MX': 'china_sea',
    'AA_DHL': 'dhl',
    'POBOX_USA': 'usa_pobox',
    'TDI_EXPRESS': 'tdi_express',
    'tdi_express': 'tdi_express',
  };

  const handleViewAddresses = async (clientId: number, clientName: string) => {
    setAddressesClient({ id: clientId, name: clientName });
    setAddressesModalOpen(true);
    setEditingAddress(null);
    setAddressesLoading(true);
    try {
      const res = await api.get(`/advisor/clients/${clientId}/addresses`);
      setClientAddresses(res.data);
    } catch {
      setSnackbar({ open: true, message: 'Error al cargar direcciones', severity: 'error' });
    } finally {
      setAddressesLoading(false);
    }
  };

  const fetchCarriersAdvisor = async (serviceType: string) => {
    if (carriersCache[serviceType]) return carriersCache[serviceType];
    try {
      const res = await api.get(`/carrier-options/by-service/${serviceType}`);
      const carriers = res.data?.data || [];
      setCarriersCache(prev => ({ ...prev, [serviceType]: carriers }));
      return carriers;
    } catch { return []; }
  };

  const handleEditAddress = (addr: any) => {
    setEditingAddress(addr);
    const services = addr.default_for_service
      ? addr.default_for_service.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];
    setAddressServiceTypes(services);
    setAddressCarrierConfig(addr.carrier_config || {});
    SERVICE_LIST.forEach(svc => fetchCarriersAdvisor(svc.serviceType));
  };

  const handleSaveAddressServices = async () => {
    if (!editingAddress || !addressesClient) return;
    setAddressSaving(true);
    try {
      await api.put(
        `/advisor/clients/${addressesClient.id}/addresses/${editingAddress.id}/default-for-service`,
        { services: addressServiceTypes, carrier_config: addressCarrierConfig }
      );
      const res = await api.get(`/advisor/clients/${addressesClient.id}/addresses`);
      setClientAddresses(res.data);
      setEditingAddress(null);
      setSnackbar({ open: true, message: 'Preferencias actualizadas', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Error al guardar', severity: 'error' });
    } finally {
      setAddressSaving(false);
    }
  };

  const handleAddAddress = async () => {
    if (!addressesClient) return;
    setNewAddrSaving(true);
    try {
      await api.post(`/advisor/clients/${addressesClient.id}/addresses`, newAddrForm);
      const res = await api.get(`/advisor/clients/${addressesClient.id}/addresses`);
      setClientAddresses(res.data);
      setNewAddrOpen(false);
      setNewAddrForm(EMPTY_ADDR);
      setSnackbar({ open: true, message: 'Dirección agregada correctamente', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Error al agregar dirección', severity: 'error' });
    } finally {
      setNewAddrSaving(false);
    }
  };

  const handleOpenInstrDialog = async (shipment?: AdvisorShipment) => {
    const target = shipment ?? (selectedUids.size > 0 ? shipments.find(s => selectedUids.has(s.uid)) ?? null : null);
    if (!target) return;
    setInstrShipment(target);
    setInstrSelectedId('');
    setInstrCarrierKey('');
    setInstrCarriers([]);
    setInstrIsCollect(false);
    setInstrFacturaFile(null);
    setInstrGuiaFile(null);
    setInstrWantsFactura(false);
    setInstrPriceEstimate(null);
    setInstrDialogOpen(true);
    setInstrLoading(true);
    setInstrCarriersLoading(true);
    const carrierServiceType = SHIPMENT_TYPE_TO_CARRIER_SERVICE[target.serviceType] ?? null;
    try {
      const [addrRes, carrierRes] = await Promise.all([
        api.get(`/advisor/clients/${target.clientId}/addresses`),
        carrierServiceType ? api.get(`/carrier-options/by-service/${carrierServiceType}`) : Promise.resolve(null),
      ]);
      setInstrAddresses(addrRes.data);
      setInstrCarriers(carrierRes?.data?.data || []);
    } catch {
      setSnackbar({ open: true, message: 'Error al cargar datos', severity: 'error' });
    } finally {
      setInstrLoading(false);
      setInstrCarriersLoading(false);
    }
  };

  const fetchPqtxEstimate = async (zipCode: string, shipment: AdvisorShipment) => {
    setInstrPriceLoading(true);
    setInstrPriceEstimate(null);
    try {
      const boxes = (shipment.isMaster && shipment.childrenCount > 0) ? shipment.childrenCount + 1 : 1;
      const res = await api.post('/shipping/pqtx-quote', {
        destZipCode: zipCode,
        packageCount: boxes,
        weight: shipment.weight || 1,
        length: shipment.lengthCm || 30,
        width: shipment.widthCm || 30,
        height: shipment.heightCm || 30,
      });
      if (res.data.success) {
        setInstrPriceEstimate({ price: res.data.clientPrice, perBox: res.data.pricePerBox, boxes, days: res.data.estimatedDays || '2-4 días hábiles' });
      }
    } catch { /* ignore quote errors */ }
    finally { setInstrPriceLoading(false); }
  };

  const handleSelectInstrAddress = (addr: any) => {
    setInstrSelectedId(String(addr.id));
    setInstrPriceEstimate(null);
    const serviceKey = instrShipment ? SHIPMENT_TYPE_TO_CARRIER_SERVICE[instrShipment.serviceType] : null;
    const preselected = serviceKey && addr.carrier_config?.[serviceKey] ? addr.carrier_config[serviceKey] : '';
    setInstrCarrierKey(preselected);
    const carrier = instrCarriers.find((c: any) => c.carrier_key === preselected);
    setInstrIsCollect(carrier?.allows_collect || false);
    if (preselected === 'paquete_express' && instrShipment && addr.zip_code) {
      fetchPqtxEstimate(addr.zip_code, instrShipment);
    }
  };

  const handleSelectInstrCarrier = (carrier: any, addrZip?: string) => {
    const newKey = instrCarrierKey === carrier.carrier_key ? '' : carrier.carrier_key;
    setInstrCarrierKey(newKey);
    setInstrIsCollect(newKey ? (carrier.allows_collect || false) : false);
    setInstrPriceEstimate(null);
    if (newKey === 'paquete_express' && instrShipment) {
      const zip = addrZip || instrAddresses.find((a: any) => String(a.id) === instrSelectedId)?.zip_code;
      if (zip) fetchPqtxEstimate(zip, instrShipment);
    }
  };

  const handleSaveInstructions = async () => {
    if (!instrSelectedId) return;
    if (instrCarriers.length > 0 && !instrCarrierKey) {
      setSnackbar({ open: true, message: 'Debes seleccionar una paquetería antes de guardar', severity: 'error' });
      return;
    }
    setInstrSaving(true);
    try {
      const uids = selectedUids.size > 0 ? Array.from(selectedUids) : instrShipment ? [instrShipment.uid] : [];
      if (uids.length === 0) return;
      const serviceKey = instrShipment ? SHIPMENT_TYPE_TO_CARRIER_SERVICE[instrShipment.serviceType] : undefined;

      const hasFiles = instrFacturaFile || instrGuiaFile;
      if (hasFiles || instrIsCollect) {
        await Promise.all(uids.map(uid => {
          const formData = new FormData();
          formData.append('addressId', instrSelectedId);
          if (instrCarrierKey && serviceKey) {
            formData.append('carrierKey', instrCarrierKey);
            formData.append('serviceKey', serviceKey);
          }
          formData.append('isCollect', String(instrIsCollect));
          formData.append('wantsFacturaPaqueteria', String(instrWantsFactura));
          if (instrFacturaFile) formData.append('factura', instrFacturaFile);
          if (instrGuiaFile) formData.append('guiaExterna', instrGuiaFile);
          return api.put(`/advisor/shipments/${uid}/instructions`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        }));
      } else {
        const body: any = { addressId: instrSelectedId };
        if (instrCarrierKey && serviceKey) { body.carrierKey = instrCarrierKey; body.serviceKey = serviceKey; }
        await Promise.all(uids.map(uid => api.put(`/advisor/shipments/${uid}/instructions`, body)));
      }

      const count = uids.length;
      setSnackbar({ open: true, message: count > 1 ? `${count} envíos actualizados` : 'Instrucciones asignadas correctamente', severity: 'success' });
      setInstrDialogOpen(false);
      setSelectedUids(new Set());
      setInstrIsCollect(false);
      setInstrFacturaFile(null);
      setInstrGuiaFile(null);
      setInstrWantsFactura(false);
      setInstrPriceEstimate(null);
      fetchShipments();
    } catch {
      setSnackbar({ open: true, message: 'Error al guardar instrucciones', severity: 'error' });
    } finally {
      setInstrSaving(false);
    }
  };

  const copyReferralLink = () => {
    const code = dashboardData?.advisor.referralCode;
    if (!code) return;
    const link = `https://entregax.app/register?ref=${code}`;
    navigator.clipboard.writeText(link);
    setSnackbar({ open: true, message: t('advisor.linkCopied'), severity: 'success' });
  };

  const shareWhatsApp = () => {
    const code = dashboardData?.advisor.referralCode;
    if (!code) return;
    const link = `https://entregax.app/register?ref=${code}`;
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
      'consolidated': { label: 'Contenedor cerrado', color: 'info' },
      'at_port': { label: 'En Puerto', color: 'warning' },
      'at_cedis': { label: 'En CEDIS', color: 'primary' },
      'out_for_delivery': { label: 'En ruta de entrega', color: 'warning' },
      'out_of_delivery': { label: 'En ruta de entrega', color: 'warning' },
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

  const renderClientNote = (c: AdvisorClient) => (
    editingNoteId === c.id ? (
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        <TextField
          size="small" multiline maxRows={3} value={noteText}
          onChange={(e) => setNoteText(e.target.value)} fullWidth
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
    )
  );

  const renderClients = () => (
    <Fade in timeout={400}>
      <Box>
        {/* Search & filters */}
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            placeholder={t('advisor.searchClients')}
            size="small"
            value={clientSearch}
            onChange={(e) => { setClientSearch(e.target.value); setClientPage(0); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            sx={{ flex: 1, minWidth: 200 }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
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
          <Chip label={`${clientsTotal} ${t('advisor.totalLower')}`} variant="outlined" />
        </Box>

        {clientsLoading && <LinearProgress sx={{ mb: 1 }} />}

        {/* ── MOBILE: card layout ── */}
        {isMobile ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {clients.length === 0 && !clientsLoading && (
              <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                {t('advisor.noClients')}
              </Typography>
            )}
            {clients.map((c) => (
              <Paper key={c.id} sx={{ borderRadius: 2, p: 1.5, border: '1px solid', borderColor: 'divider' }}>
                {/* Row 1: name + box + verification */}
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700} noWrap>{c.fullName}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap display="block">{c.email}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5, flexShrink: 0 }}>
                    <Chip label={c.boxId || '—'} size="small" variant="outlined" sx={{ height: 20, fontSize: 10 }} />
                    {getVerificationChip(c.identityVerified, c.verificationStatus)}
                  </Box>
                </Box>

                {/* Row 2: phone buttons */}
                {c.phone && (
                  <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
                    <IconButton size="small" href={`tel:${c.phone}`}
                      sx={{ bgcolor: '#e3f2fd', color: '#1565c0', width: 28, height: 28 }}>
                      <PhoneIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                    <IconButton size="small"
                      onClick={() => window.open(`https://wa.me/${c.phone.replace(/\D/g, '')}`, '_blank')}
                      sx={{ bgcolor: '#e8f5e9', color: '#25D366', width: 28, height: 28 }}>
                      <WhatsAppIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                )}

                {/* Row 3: stats grid */}
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5, mb: 1 }}>
                  {[
                    { label: 'Sin Instr.', value: c.missingInstructionsCount, color: c.missingInstructionsCount > 0 ? 'warning' : null },
                    { label: 'Tránsito', value: c.inTransitCount, color: c.inTransitCount > 0 ? 'warning' : null },
                    { label: 'Pdte. Pago', value: c.pendingPaymentCount, color: c.pendingPaymentCount > 0 ? 'error' : null },
                    { label: null, value: null, amount: c.pendingPaymentTotal },
                  ].map((stat, i) => (
                    <Box key={i} sx={{ bgcolor: '#f5f5f5', borderRadius: 1, p: 0.5, textAlign: 'center' }}>
                      {stat.amount !== undefined ? (
                        <>
                          <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: 9 }}>Saldo Pdte.</Typography>
                          <Typography variant="caption" fontWeight={700} color={stat.amount > 0 ? 'error.main' : 'text.secondary'} sx={{ fontSize: 10 }}>
                            {stat.amount > 0 ? formatMXN(stat.amount) : '$0'}
                          </Typography>
                        </>
                      ) : (
                        <>
                          <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: 9 }}>{stat.label}</Typography>
                          {(stat.value as number) > 0
                            ? <Chip label={stat.value} color={stat.color as any} size="small" sx={{ height: 16, fontSize: 10, '& .MuiChip-label': { px: 0.5 } }} />
                            : <Typography variant="caption" color="text.secondary">0</Typography>
                          }
                        </>
                      )}
                    </Box>
                  ))}
                </Box>

                {/* Row 4: last shipment */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                  <Typography variant="caption" color="text.secondary">Último envío:</Typography>
                  <Typography variant="caption">
                    {c.lastShipmentAt ? formatDate(c.lastShipmentAt) : t('advisor.never')}
                  </Typography>
                  {c.daysSinceLastShipment !== null && c.daysSinceLastShipment > 30 && (
                    <Typography variant="caption" color="error.main">
                      ({c.daysSinceLastShipment}d)
                    </Typography>
                  )}
                </Box>

                {/* Row 5: nota */}
                <Box sx={{ mb: 1 }}>{renderClientNote(c)}</Box>

                {/* Row 6: actions */}
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="outlined" size="small" fullWidth
                    onClick={() => handleViewAddresses(c.id, c.fullName)}
                    startIcon={<LocationIcon />}
                    sx={{ textTransform: 'none', fontSize: '0.75rem', borderColor: '#7B1FA2', color: '#7B1FA2', '&:hover': { bgcolor: '#f3e5f5' } }}
                  >
                    Dirs
                  </Button>
                  <Button
                    variant="contained" size="small" fullWidth
                    onClick={() => handleViewWallet(c.id)}
                    startIcon={<WalletIcon />}
                    sx={{ textTransform: 'none', fontSize: '0.75rem', bgcolor: '#F05A28', '&:hover': { bgcolor: '#d94d1f' } }}
                  >
                    Cartera
                  </Button>
                </Box>
              </Paper>
            ))}
          </Box>
        ) : (
          /* ── DESKTOP: table layout ── */
          <TableContainer component={Paper} sx={{ borderRadius: 2, overflowX: 'auto' }}>
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
                  <TableCell align="center">Direcciones</TableCell>
                  <TableCell align="center">Cartera</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {clients.length === 0 && !clientsLoading && (
                  <TableRow>
                    <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
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
                              <IconButton size="small" href={`tel:${c.phone}`}
                                sx={{ bgcolor: '#e3f2fd', color: '#1565c0', '&:hover': { bgcolor: '#1565c0', color: '#fff' }, width: 28, height: 28 }}>
                                <PhoneIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="WhatsApp">
                              <IconButton size="small"
                                onClick={() => window.open(`https://wa.me/${c.phone.replace(/\D/g, '')}`, '_blank')}
                                sx={{ bgcolor: '#e8f5e9', color: '#25D366', '&:hover': { bgcolor: '#25D366', color: '#fff' }, width: 28, height: 28 }}>
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
                      {c.missingInstructionsCount > 0
                        ? <Chip label={c.missingInstructionsCount} color="warning" size="small" />
                        : <Typography variant="body2" color="text.secondary">0</Typography>}
                    </TableCell>
                    <TableCell align="center">
                      {c.inTransitCount > 0
                        ? <Chip label={c.inTransitCount} color="warning" size="small" />
                        : <Typography variant="body2" color="text.secondary">0</Typography>}
                    </TableCell>
                    <TableCell align="center">
                      {c.pendingPaymentCount > 0
                        ? <Chip label={c.pendingPaymentCount} color="error" size="small" />
                        : <Typography variant="body2" color="text.secondary">0</Typography>}
                    </TableCell>
                    <TableCell align="right">
                      {c.pendingPaymentTotal > 0
                        ? <Typography variant="body2" fontWeight={700} color="error.main">{formatMXN(c.pendingPaymentTotal)}</Typography>
                        : <Typography variant="body2" color="text.secondary">$0</Typography>}
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
                      {renderClientNote(c)}
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Ver y administrar direcciones">
                        <Button variant="outlined" size="small"
                          onClick={() => handleViewAddresses(c.id, c.fullName)}
                          startIcon={<LocationIcon />}
                          sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.5, borderColor: '#7B1FA2', color: '#7B1FA2', '&:hover': { bgcolor: '#f3e5f5', borderColor: '#6a1b9a' } }}>
                          Dirs
                        </Button>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Ver Cartera">
                        <Button variant="contained" size="small"
                          onClick={() => handleViewWallet(c.id)}
                          startIcon={<WalletIcon />}
                          sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#d94d1f' }, textTransform: 'none', fontSize: '0.75rem', py: 0.5 }}>
                          Ver
                        </Button>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

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

  // ─── Multi-selection helpers ───
  const selectionLockService = useMemo(
    () => selectedUids.size > 0 ? (shipments.find(s => selectedUids.has(s.uid))?.serviceType ?? null) : null,
    [selectedUids, shipments]
  );
  const selectionLockClientId = useMemo(
    () => selectedUids.size > 0 ? (shipments.find(s => selectedUids.has(s.uid))?.clientId ?? null) : null,
    [selectedUids, shipments]
  );
  const canSelectShipment = useCallback(
    (s: AdvisorShipment) => {
      if (selectedUids.size === 0) return true;
      return s.serviceType === selectionLockService && s.clientId === selectionLockClientId;
    },
    [selectedUids, selectionLockService, selectionLockClientId]
  );
  const toggleSelect = useCallback((uid: string) => {
    setSelectedUids(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedUids(new Set()), []);

  const renderShipments = () => (
    <Fade in timeout={400}>
      <Box>
        {/* Quick stat pills — ocultas (redundantes con filtros de abajo) */}

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

        {/* Payment + Instructions filters */}
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Pago:</Typography>
          {[
            { key: 'all',     label: 'Todos' },
            { key: 'paid',    label: '✅ Pagado' },
            { key: 'pending', label: '🔴 Pendiente' },
          ].map(opt => (
            <Chip
              key={opt.key}
              label={opt.label}
              size="small"
              variant={shipmentPaymentFilter === opt.key ? 'filled' : 'outlined'}
              color={shipmentPaymentFilter === opt.key ? (opt.key === 'paid' ? 'success' : opt.key === 'pending' ? 'error' : 'primary') : 'default'}
              onClick={() => { setShipmentPaymentFilter(opt.key); setShipmentPage(0); }}
              sx={{ cursor: 'pointer' }}
            />
          ))}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Instrucciones:</Typography>
          {[
            { key: 'all', label: 'Todos' },
            { key: 'yes', label: '✅ Con instrucciones' },
            { key: 'no',  label: '⚠️ Sin instrucciones' },
          ].map(opt => (
            <Chip
              key={opt.key}
              label={opt.label}
              size="small"
              variant={shipmentInstructionsFilter === opt.key ? 'filled' : 'outlined'}
              color={shipmentInstructionsFilter === opt.key ? (opt.key === 'yes' ? 'success' : opt.key === 'no' ? 'warning' : 'primary') : 'default'}
              onClick={() => { setShipmentInstructionsFilter(opt.key); setShipmentPage(0); }}
              sx={{ cursor: 'pointer' }}
            />
          ))}
        </Box>

        {shipmentsLoading && <LinearProgress sx={{ mb: 1 }} />}

        {/* Multi-selection action bar */}
        {selectedUids.size > 0 && (
          <Paper elevation={3} sx={{ display: 'flex', alignItems: 'center', gap: 2, p: '8px 16px', mb: 1.5, borderRadius: 2, bgcolor: '#1565C0', color: '#fff' }}>
            <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }}>
              {selectedUids.size} envío{selectedUids.size !== 1 ? 's' : ''} seleccionado{selectedUids.size !== 1 ? 's' : ''}
              {selectionLockService && (
                <Chip
                  label={
                    selectionLockService === 'AIR_CHN_MX' ? '✈️ Aéreo' :
                    selectionLockService === 'SEA_CHN_MX' ? '🚢 Marítimo' :
                    selectionLockService === 'AA_DHL' ? '📦 DHL' :
                    selectionLockService === 'POBOX_USA' ? '📮 POBox' :
                    selectionLockService
                  }
                  size="small"
                  sx={{ ml: 1, bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: '0.7rem' }}
                />
              )}
            </Typography>
            {advisorInstructionsEnabled && (
              <Button
                size="small"
                variant="contained"
                startIcon={<EditIcon />}
                onClick={() => handleOpenInstrDialog()}
                sx={{ bgcolor: '#fff', color: '#1565C0', fontWeight: 700, '&:hover': { bgcolor: '#e3f2fd' } }}
              >
                Asignar instrucciones
              </Button>
            )}
            <IconButton size="small" onClick={clearSelection} sx={{ color: '#fff' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Paper>
        )}

        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={{ width: 40 }}>
                  <Tooltip title={selectedUids.size === 0 && shipments.some((a, _i, arr) => arr.some(b => b.serviceType !== a.serviceType || b.clientId !== a.clientId)) ? 'Filtra por servicio y cliente para seleccionar todos' : ''}>
                    <span>
                      <Checkbox
                        size="small"
                        indeterminate={selectedUids.size > 0 && shipments.filter(s => canSelectShipment(s)).some(s => !selectedUids.has(s.uid))}
                        checked={shipments.length > 0 && shipments.filter(s => canSelectShipment(s)).length > 0 && shipments.filter(s => canSelectShipment(s)).every(s => selectedUids.has(s.uid))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const toSelect = selectedUids.size === 0
                              ? shipments.filter(s => s.serviceType === shipments[0]?.serviceType && s.clientId === shipments[0]?.clientId)
                              : shipments.filter(s => canSelectShipment(s));
                            setSelectedUids(prev => { const next = new Set(prev); toSelect.forEach(s => next.add(s.uid)); return next; });
                          } else {
                            clearSelection();
                          }
                        }}
                      />
                    </span>
                  </Tooltip>
                </TableCell>
                <TableCell>{t('advisor.tracking')}</TableCell>
                <TableCell>{t('advisor.client')}</TableCell>
                <TableCell align="center">{t('advisor.status')}</TableCell>
                <TableCell>{t('advisor.service')}</TableCell>
                <TableCell align="right">{t('advisor.amount')}</TableCell>
                <TableCell align="center">{t('advisor.paid')}</TableCell>
                <TableCell align="center">Instrucciones</TableCell>
                <TableCell align="center">Paquetería</TableCell>
                <TableCell align="center">GEX</TableCell>
                <TableCell>{t('advisor.date')}</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shipments.length === 0 && !shipmentsLoading && (
                <TableRow>
                  <TableCell colSpan={12} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">{t('advisor.noShipments')}</Typography>
                  </TableCell>
                </TableRow>
              )}
              {shipments.map((s) => (
                <TableRow key={s.uid} hover selected={selectedUids.has(s.uid)}>
                  <TableCell padding="checkbox">
                    <Tooltip title={!canSelectShipment(s) ? 'Solo se pueden seleccionar envíos del mismo servicio y cliente' : ''}>
                      <span>
                        <Checkbox
                          size="small"
                          checked={selectedUids.has(s.uid)}
                          disabled={!canSelectShipment(s)}
                          onChange={() => toggleSelect(s.uid)}
                        />
                      </span>
                    </Tooltip>
                  </TableCell>
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
                        s.serviceType === 'tdi_express' || s.serviceType === 'TDI_EXPRESS' ? '✈️ TDI DHL' :
                        s.serviceType || '—'
                      }
                      color={
                        s.serviceType === 'AIR_CHN_MX' ? 'primary' :
                        s.serviceType === 'SEA_CHN_MX' ? 'info' :
                        s.serviceType === 'AA_DHL' ? 'warning' :
                        s.serviceType === 'POBOX_USA' ? 'secondary' :
                        s.serviceType === 'tdi_express' || s.serviceType === 'TDI_EXPRESS' ? 'secondary' :
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
                    {s.deliveryCarrierName ? (
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        {s.deliveryCarrierIcon && (s.deliveryCarrierIcon.startsWith('/') || s.deliveryCarrierIcon.startsWith('http')) ? (
                          <img src={s.deliveryCarrierIcon} alt={s.deliveryCarrierName} style={{ width: 20, height: 20, objectFit: 'contain' }} />
                        ) : s.deliveryCarrierIcon ? (
                          <Typography sx={{ fontSize: 16 }}>{s.deliveryCarrierIcon}</Typography>
                        ) : null}
                        <Typography variant="caption" fontWeight={600} sx={{ fontSize: '0.7rem' }}>{s.deliveryCarrierName}</Typography>
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.secondary">—</Typography>
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
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                    {advisorInstructionsEnabled && (
                      <Tooltip title="Asignar instrucciones de entrega">
                        <IconButton
                          size="small"
                          onClick={() => handleOpenInstrDialog(s)}
                          sx={{ color: s.hasInstructions ? '#2E7D32' : '#E65100' }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
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
                    </Box>
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
      'tdi_express': '✈️ TDI DHL',
      'TDI_EXPRESS': '✈️ TDI DHL',
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
    const referralLink = `https://entregax.app/register?ref=${code || ''}`;

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

            {/* 🔔 Centro de Notificaciones */}
            <Grid size={ { xs: 12 } }>
              <Paper sx={{ p: 3, borderRadius: 2 }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  🔔 Centro de Notificaciones
                </Typography>
                {notifLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size={24} sx={{ color: '#F05A28' }} />
                  </Box>
                ) : (
                  <Grid container spacing={2} sx={{ mt: 0.5 }}>
                    <Grid size={ { xs: 12 } }>
                      <Typography variant="caption" sx={{ color: '#999', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                        Canal
                      </Typography>
                    </Grid>
                    {[
                      { key: 'whatsapp' as const, label: 'WhatsApp', sub: 'Recibir alertas por WhatsApp', icon: '💬' },
                      { key: 'push' as const, label: 'Notificaciones en app', sub: 'Alertas dentro de la plataforma', icon: '🔔' },
                    ].map(({ key, label, sub, icon }) => (
                      <Grid size={ { xs: 12, sm: 6 } } key={key}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, border: '1px solid #f0f0f0', borderRadius: 2 }}>
                          <Typography sx={{ fontSize: 22 }}>{icon}</Typography>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle2" fontWeight={700}>{label}</Typography>
                            <Typography variant="caption" color="text.secondary">{sub}</Typography>
                          </Box>
                          <Switch
                            checked={notifPrefs[key]}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateNotifPref(key, e.target.checked)}
                            sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#F05A28' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#F05A28' } }}
                          />
                        </Box>
                      </Grid>
                    ))}
                    <Grid size={ { xs: 12 } } sx={{ mt: 1 }}>
                      <Typography variant="caption" sx={{ color: '#999', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                        Servicios
                      </Typography>
                    </Grid>
                    {[
                      { key: 'air' as const, label: 'Aéreo', icon: '✈️' },
                      { key: 'maritime' as const, label: 'Marítimo', icon: '🚢' },
                      { key: 'dhl' as const, label: 'DHL', icon: '📦' },
                      { key: 'pobox' as const, label: '(PO Box / Suite)', icon: '🏠' },
                    ].map(({ key, label, icon }) => (
                      <Grid size={ { xs: 12, sm: 6 } } key={key}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, border: '1px solid #f0f0f0', borderRadius: 2 }}>
                          <Typography sx={{ fontSize: 22 }}>{icon}</Typography>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle2" fontWeight={700}>{label}</Typography>
                          </Box>
                          <Switch
                            checked={notifPrefs[key]}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateNotifPref(key, e.target.checked)}
                            sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#F05A28' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#F05A28' } }}
                          />
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </Paper>
            </Grid>
          </Grid>
        </Box>
      </Fade>
    );
  };

  // ════════════════════════════════════
  // RENDER TEAM
  // ════════════════════════════════════
  const renderTeam = () => {
    const active = teamMembers.filter(m => m.status === 'active').length;
    const totalClients = teamMembers.reduce((s: number, m: any) => s + (m.total_clients || 0), 0);
    const monthlyClients = teamMembers.reduce((s: number, m: any) => s + (m.monthly_clients || 0), 0);

    const ticketStatusMap: Record<string, { label: string; color: 'default' | 'warning' | 'info' | 'error' | 'success' }> = {
      open_ai:          { label: 'En revisión',   color: 'info' },
      escalated_human:  { label: 'Con agente',    color: 'warning' },
      waiting_client:   { label: 'Esperando resp.', color: 'default' },
      resolved:         { label: 'Resuelto',      color: 'success' },
      closed:           { label: 'Cerrado',        color: 'default' },
    };

    return (
      <Fade in timeout={400}>
        <Box>
          {/* KPI strip */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {[
              { label: 'Sub-Asesores', value: teamMembers.length },
              { label: 'Activos', value: active },
              { label: 'Clientes totales', value: totalClients },
              { label: 'Clientes este mes', value: monthlyClients },
              { label: 'Mi comisión del mes', value: `$${teamMyCommission.toFixed(2)}` },
            ].map((kpi, i) => (
              <Grid key={i} size={{ xs: 6, sm: 4, md: 2.4 }}>
                <Paper sx={{ p: 2, borderRadius: 2, textAlign: 'center' }}>
                  <Typography variant="h5" fontWeight={800} color="primary.main">{kpi.value}</Typography>
                  <Typography variant="caption" color="text.secondary">{kpi.label}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>

          <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ px: 2.5, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography fontWeight={700}>Sub-Asesores</Typography>
              <IconButton size="small" onClick={fetchTeam}><RefreshIcon /></IconButton>
            </Box>

            {teamLoading ? (
              <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={32} /></Box>
            ) : teamMembers.length === 0 ? (
              <Box sx={{ p: 6, textAlign: 'center' }}>
                <PeopleIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">Aún no tienes sub-asesores en tu equipo.</Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                      <TableCell><Typography variant="caption" fontWeight={700}>Asesor</Typography></TableCell>
                      <TableCell><Typography variant="caption" fontWeight={700}>Código</Typography></TableCell>
                      <TableCell align="center"><Typography variant="caption" fontWeight={700}>Clientes</Typography></TableCell>
                      <TableCell align="center"><Typography variant="caption" fontWeight={700}>Este mes</Typography></TableCell>
                      <TableCell align="right"><Typography variant="caption" fontWeight={700}>Generado</Typography></TableCell>
                      <TableCell align="center"><Typography variant="caption" fontWeight={700}>Estado</Typography></TableCell>
                      <TableCell align="center"><Typography variant="caption" fontWeight={700}>Contacto</Typography></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {teamMembers.map((m: any) => (
                      <TableRow
                        key={m.id}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => openTeamMemberModal(m)}
                      >
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Avatar
                              src={m.profile_photo_url || undefined}
                              sx={{ width: 38, height: 38, bgcolor: '#F05A28', fontSize: 14, fontWeight: 800 }}
                            >
                              {(m.name || '').charAt(0).toUpperCase()}
                            </Avatar>
                            <Box>
                              <Typography variant="body2" fontWeight={600}>{m.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{m.email}</Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Chip label={m.referral_code} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2" fontWeight={700}>{m.total_clients || 0}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2" fontWeight={700}>{m.monthly_clients || 0}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700}>
                            ${((m.total_revenue || 0) / 1000).toFixed(1)}k
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={m.status === 'active' ? 'Activo' : 'Inactivo'}
                            color={m.status === 'active' ? 'success' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="center" onClick={e => e.stopPropagation()}>
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                            {m.phone && (
                              <>
                                <Tooltip title="Llamar">
                                  <IconButton size="small" href={`tel:${m.phone}`} component="a">
                                    <PhoneIcon fontSize="small" sx={{ color: '#4CAF50' }} />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="WhatsApp">
                                  <IconButton size="small" href={`https://wa.me/52${m.phone.replace(/\D/g, '')}`} target="_blank" component="a">
                                    <WhatsAppIcon fontSize="small" sx={{ color: '#25D366' }} />
                                  </IconButton>
                                </Tooltip>
                              </>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>

          {/* ── MODAL DETALLE SUB-ASESOR ── */}
          <Dialog open={teamModalOpen} onClose={() => setTeamModalOpen(false)} maxWidth="md" fullWidth>
            {teamModalMember && (
              <>
                <DialogTitle sx={{ pb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar
                      src={teamModalMember.profile_photo_url || undefined}
                      sx={{ width: 52, height: 52, bgcolor: '#F05A28', fontSize: 20, fontWeight: 800 }}
                    >
                      {(teamModalMember.name || '').charAt(0).toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1 }}>
                      <Typography fontWeight={800} fontSize={18}>{teamModalMember.name}</Typography>
                      <Typography variant="body2" color="text.secondary">{teamModalMember.email}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Chip label={teamModalMember.referral_code} size="small" variant="outlined" />
                      <Chip
                        label={teamModalMember.status === 'active' ? 'Activo' : 'Inactivo'}
                        color={teamModalMember.status === 'active' ? 'success' : 'default'}
                        size="small"
                      />
                      <IconButton onClick={() => setTeamModalOpen(false)}><CloseIcon /></IconButton>
                    </Box>
                  </Box>
                  {/* Stats rápidos */}
                  <Box sx={{ display: 'flex', gap: 3, mt: 1.5, pl: 0.5 }}>
                    {[
                      { label: 'Clientes', value: teamModalMember.total_clients },
                      { label: 'Este mes', value: teamModalMember.monthly_clients },
                      { label: 'Generado', value: `$${((teamModalMember.total_revenue || 0) / 1000).toFixed(1)}k` },
                    ].map((s, i) => (
                      <Box key={i}>
                        <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                        <Typography fontWeight={700} fontSize={15}>{s.value}</Typography>
                      </Box>
                    ))}
                  </Box>
                </DialogTitle>

                <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
                  <Tabs value={teamModalTab} onChange={(_, v) => setTeamModalTab(v)}>
                    <Tab label={`Clientes (${teamModalClients.length})`} />
                    <Tab label={`Tickets (${teamModalTickets.length})`} />
                  </Tabs>
                </Box>

                <DialogContent sx={{ p: 0, minHeight: 300 }}>
                  {teamModalLoading ? (
                    <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
                  ) : teamModalTab === 0 ? (
                    /* ── CLIENTES ── */
                    teamModalClients.length === 0 ? (
                      <Box sx={{ p: 5, textAlign: 'center' }}>
                        <Typography color="text.secondary">Sin clientes registrados.</Typography>
                      </Box>
                    ) : (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ bgcolor: 'grey.50' }}>
                              <TableCell>Cliente</TableCell>
                              <TableCell>Suite</TableCell>
                              <TableCell align="center">Verificado</TableCell>
                              <TableCell align="center">Embarques</TableCell>
                              <TableCell align="center">En Tránsito</TableCell>
                              <TableCell align="right">Saldo Pdte.</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {teamModalClients.map((c: any) => (
                              <TableRow key={c.id} hover>
                                <TableCell>
                                  <Typography variant="body2" fontWeight={600}>{c.full_name || c.email}</Typography>
                                  {c.full_name && <Typography variant="caption" color="text.secondary">{c.email}</Typography>}
                                </TableCell>
                                <TableCell>
                                  {c.box_id
                                    ? <Chip label={c.box_id} size="small" variant="outlined" />
                                    : <Typography variant="caption" color="text.disabled">—</Typography>}
                                </TableCell>
                                <TableCell align="center">
                                  {c.is_verified
                                    ? <CheckCircleIcon sx={{ color: '#4CAF50', fontSize: 18 }} />
                                    : <PendingIcon sx={{ color: '#FF9800', fontSize: 18 }} />}
                                </TableCell>
                                <TableCell align="center">{c.total_packages ?? 0}</TableCell>
                                <TableCell align="center">{c.in_transit_count ?? 0}</TableCell>
                                <TableCell align="right">
                                  <Typography variant="body2" color={c.total_pending > 0 ? 'error' : 'text.primary'}>
                                    ${(c.total_pending || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )
                  ) : (
                    /* ── TICKETS ── */
                    teamModalTickets.length === 0 ? (
                      <Box sx={{ p: 5, textAlign: 'center' }}>
                        <Typography color="text.secondary">Sin tickets de soporte.</Typography>
                      </Box>
                    ) : (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ bgcolor: 'grey.50' }}>
                              <TableCell>Folio</TableCell>
                              <TableCell>Cliente</TableCell>
                              <TableCell>Categoría</TableCell>
                              <TableCell align="center">Estado</TableCell>
                              <TableCell align="right">Fecha</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {teamModalTickets.map((t: any) => {
                              const st = ticketStatusMap[t.status] || { label: t.status, color: 'default' as const };
                              return (
                                <TableRow key={t.id} hover>
                                  <TableCell><Typography variant="body2" fontWeight={700}>{t.ticket_folio}</Typography></TableCell>
                                  <TableCell>
                                    <Typography variant="body2">{t.client_name}</Typography>
                                    <Typography variant="caption" color="text.secondary">{t.client_box_id}</Typography>
                                  </TableCell>
                                  <TableCell><Typography variant="body2">{t.category || '—'}</Typography></TableCell>
                                  <TableCell align="center"><Chip label={st.label} color={st.color} size="small" /></TableCell>
                                  <TableCell align="right">
                                    <Typography variant="caption" color="text.secondary">
                                      {new Date(t.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}
                                    </Typography>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )
                  )}
                </DialogContent>
              </>
            )}
          </Dialog>
        </Box>
      </Fade>
    );
  };

  // ════════════════════════════════════
  // RENDER TICKETS
  // ════════════════════════════════════

  const renderTickets = () => {
    const canSubmit = !!ticketCategory && ticketDescription.trim().length > 0;

    const getTicketStatusLabel = (status: string) => {
      const map: Record<string, { label: string; color: 'default' | 'warning' | 'info' | 'error' | 'success' }> = {
        open_ai: { label: 'En revisión', color: 'info' },
        escalated_human: { label: 'Con agente', color: 'warning' },
        waiting_client: { label: 'Esperando respuesta', color: 'default' },
        waiting_agent: { label: 'En espera', color: 'default' },
        resolved: { label: 'Resuelto', color: 'success' },
        closed: { label: 'Cerrado', color: 'default' },
      };
      const s = map[status] || { label: status, color: 'default' as const };
      return <Chip label={s.label} color={s.color} size="small" />;
    };

    const formatDate = (d: string) => new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

    return (
      <Fade in timeout={400}>
        <Box>
          {ticketSuccessFolio && (
            <Alert severity="success" sx={{ mb: 3 }} onClose={() => setTicketSuccessFolio('')}>
              Ticket <strong>{ticketSuccessFolio}</strong> creado. Un agente te atenderá pronto.
            </Alert>
          )}

          <Grid container spacing={3}>
            {/* ── Crear Ticket ── */}
            <Grid size={{ xs: 12, md: 5 }}>
              <Paper sx={{ p: 3, borderRadius: 2 }}>
                <Typography variant="h6" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TicketIcon color="primary" /> Nuevo Ticket
                </Typography>
                <Alert severity="info" sx={{ mb: 2, py: 0.5 }}>
                  Tu mensaje será atendido por un agente de soporte.
                </Alert>

                {/* Categoría */}
                <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>Categoría *</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                  {ADVISOR_TICKET_CATEGORIES.map(cat => (
                    <Chip
                      key={cat.key}
                      label={cat.label}
                      icon={cat.icon as React.ReactElement}
                      onClick={() => { setTicketCategory(cat.key); setTicketTracking(''); }}
                      variant={ticketCategory === cat.key ? 'filled' : 'outlined'}
                      sx={{
                        borderColor: ticketCategory === cat.key ? cat.color : undefined,
                        bgcolor: ticketCategory === cat.key ? cat.color : undefined,
                        color: ticketCategory === cat.key ? '#fff' : undefined,
                        '& .MuiChip-icon': { color: ticketCategory === cat.key ? '#fff' : cat.color },
                        fontWeight: 600, cursor: 'pointer',
                      }}
                    />
                  ))}
                </Box>

                {/* Datos opcionales de incidencia */}
                <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
                  <TextField
                    size="small" label="Número de cliente" placeholder="Ej: CLT-001"
                    value={ticketClientNumber}
                    onChange={e => setTicketClientNumber(e.target.value)}
                    sx={{ flex: 1 }}
                  />
                  <FormControl size="small" sx={{ flex: 1 }}>
                    <InputLabel>Cedis</InputLabel>
                    <Select
                      label="Cedis"
                      value={ticketCedis}
                      onChange={e => setTicketCedis(e.target.value)}
                    >
                      {['MTY', 'CDMX', 'USA', 'Otro'].map(opt => (
                        <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
                <TextField
                  fullWidth size="small" label="Número de guía" placeholder="Ej: AIR123456789"
                  value={ticketTracking}
                  onChange={e => setTicketTracking(e.target.value)}
                  sx={{ mb: 2 }}
                />

                {/* Descripción */}
                <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>Descripción del problema *</Typography>
                <TextField
                  fullWidth multiline rows={4}
                  placeholder="Describe detalladamente qué ocurrió, cuándo y qué estabas haciendo..."
                  value={ticketDescription}
                  onChange={e => setTicketDescription(e.target.value)}
                  sx={{ mb: 2 }}
                />

                {/* Adjuntar archivos (imágenes + PDFs) */}
                <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>Archivos adjuntos (Opcional)</Typography>
                <input
                  type="file" accept="image/*,application/pdf" multiple
                  id="advisor-ticket-img"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const files = Array.from(e.target.files || []);
                    setTicketImages(prev => [...prev, ...files.map(f => ({
                      file: f,
                      preview: f.type === 'application/pdf' ? '' : URL.createObjectURL(f),
                    }))]);
                    e.target.value = '';
                  }}
                />
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, alignItems: 'center' }}>
                  {ticketImages.map((item, i) => (
                    <Box key={i} sx={{ position: 'relative' }}>
                      {item.file.type === 'application/pdf' ? (
                        <Chip
                          label={item.file.name.length > 18 ? item.file.name.substring(0, 16) + '…' : item.file.name}
                          onDelete={() => setTicketImages(prev => prev.filter((_, idx) => idx !== i))}
                          size="small"
                          sx={{ bgcolor: '#FFEBEE', color: '#C62828', fontWeight: 600, '& .MuiChip-deleteIcon': { color: '#C62828' } }}
                        />
                      ) : (
                        <>
                          <img src={item.preview} alt="" style={{ width: 72, height: 72, borderRadius: 8, objectFit: 'cover' }} />
                          <IconButton
                            size="small"
                            sx={{ position: 'absolute', top: -6, right: -6, bgcolor: '#fff', boxShadow: 1, p: 0.3 }}
                            onClick={() => setTicketImages(prev => prev.filter((_, idx) => idx !== i))}
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </>
                      )}
                    </Box>
                  ))}
                  <label htmlFor="advisor-ticket-img">
                    <Box sx={{
                      width: 72, height: 72, border: '2px dashed #F05A28', borderRadius: 2,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: '#F05A28',
                    }}>
                      <AttachFileIcon fontSize="small" />
                      <Typography variant="caption">Adjuntar</Typography>
                    </Box>
                  </label>
                </Box>

                <Button
                  fullWidth variant="contained"
                  startIcon={ticketSubmitting ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
                  onClick={handleSubmitAdvisorTicket}
                  disabled={!canSubmit || ticketSubmitting}
                  sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#D44E22' }, textTransform: 'none', fontWeight: 700, py: 1.4 }}
                >
                  {ticketSubmitting ? 'Enviando...' : 'Enviar Ticket'}
                </Button>
              </Paper>
            </Grid>

            {/* ── Mis Tickets ── */}
            <Grid size={{ xs: 12, md: 7 }}>
              <Paper sx={{ p: 3, borderRadius: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ListAltIcon color="primary" /> Mis Tickets
                  </Typography>
                  <IconButton size="small" onClick={fetchAdvisorTickets}><RefreshIcon /></IconButton>
                </Box>

                {advisorTicketsLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress size={32} />
                  </Box>
                ) : advisorTickets.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                    No tienes tickets aún. Crea uno si necesitas ayuda.
                  </Typography>
                ) : (
                  <List disablePadding>
                    {advisorTickets.map((ticket, idx) => (
                      <Box key={ticket.id}>
                        <ListItem
                          sx={{ px: 1, py: 1.5, borderRadius: 2, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                          onClick={() => {
                            setSelectedAdvisorTicket(ticket);
                            fetchTicketMessages(ticket.id);
                          }}
                        >
                          <Avatar sx={{ bgcolor: alpha('#F05A28', 0.12), color: '#F05A28', mr: 1.5, width: 36, height: 36 }}>
                            <TicketIcon fontSize="small" />
                          </Avatar>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.3 }}>
                              <Typography variant="subtitle2" fontWeight={700} noWrap>{ticket.subject || ticket.ticket_folio}</Typography>
                              {getTicketStatusLabel(ticket.status)}
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                              {ticket.ticket_folio} · {formatDate(ticket.created_at)}
                            </Typography>
                          </Box>
                        </ListItem>
                        {idx < advisorTickets.length - 1 && <Divider />}
                      </Box>
                    ))}
                  </List>
                )}
              </Paper>
            </Grid>
          </Grid>

          {/* Dialog conversación de ticket */}
          <Dialog
            open={!!selectedAdvisorTicket}
            onClose={() => { setSelectedAdvisorTicket(null); setTicketMessages([]); setTicketReply(''); }}
            maxWidth="sm" fullWidth fullScreen={isMobile}
            PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}
          >
            {selectedAdvisorTicket && (
              <>
                <DialogTitle sx={{ bgcolor: '#F05A28', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={700}>{selectedAdvisorTicket.subject || 'Ticket'}</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.85 }}>{selectedAdvisorTicket.ticket_folio}</Typography>
                  </Box>
                  <IconButton onClick={() => { setSelectedAdvisorTicket(null); setTicketMessages([]); }} sx={{ color: '#fff' }}>
                    <CloseIcon />
                  </IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 0 }}>
                  <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 300, maxHeight: 420, overflowY: 'auto' }}>
                    {ticketMessages.length === 0 && (
                      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>Cargando mensajes...</Typography>
                    )}
                    {ticketMessages.map(msg => {
                      let attUrls: string[] = [];
                      if (Array.isArray(msg.attachments)) attUrls = msg.attachments as string[];
                      else if (typeof msg.attachments === 'string') {
                        try { const p = JSON.parse(msg.attachments); if (Array.isArray(p)) attUrls = p; } catch { /* ignore */ }
                      }
                      if (attUrls.length === 0 && msg.attachment_url) attUrls = [msg.attachment_url];
                      return (
                      <Box key={msg.id} sx={{
                        alignSelf: msg.sender_type === 'employee' ? 'flex-end' : 'flex-start',
                        maxWidth: '80%',
                        bgcolor: msg.sender_type === 'employee' ? '#F05A28' : '#f5f5f5',
                        color: msg.sender_type === 'employee' ? '#fff' : '#111',
                        borderRadius: 2, px: 1.5, py: 1,
                      }}>
                        {msg.message && (
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{msg.message}</Typography>
                        )}
                        {attUrls.length > 0 && (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: msg.message ? 0.75 : 0 }}>
                            {attUrls.map((u, i) => {
                              const low = u.toLowerCase();
                              const isPdf = low.endsWith('.pdf') || low.includes('/pdf');
                              const isExcel = /\.(xlsx?|csv)$/i.test(low);
                              const isImg = /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(low) || (!isPdf && !isExcel);
                              if (isImg && !isPdf && !isExcel) {
                                return (
                                  <a key={i} href={u} target="_blank" rel="noreferrer">
                                    <Box component="img" src={u} alt={`adj-${i}`}
                                      sx={{ width: 110, height: 110, objectFit: 'cover', borderRadius: 1, border: '1px solid rgba(0,0,0,0.1)' }}
                                    />
                                  </a>
                                );
                              }
                              return (
                                <a key={i} href={u} target="_blank" rel="noreferrer"
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '4px 8px', borderRadius: 6, textDecoration: 'none',
                                    background: msg.sender_type === 'employee' ? 'rgba(255,255,255,0.2)' : '#fff',
                                    color: msg.sender_type === 'employee' ? '#fff' : (isPdf ? '#c62828' : '#2E7D32'),
                                    border: msg.sender_type === 'employee' ? 'none' : '1px solid #ddd',
                                  }}>
                                  {isPdf ? <PdfIcon sx={{ fontSize: 18 }} /> : <FileIcon sx={{ fontSize: 18 }} />}
                                  <Typography variant="caption" fontWeight={600}>
                                    {isPdf ? 'Ver PDF' : isExcel ? 'Ver Excel' : 'Ver archivo'}
                                  </Typography>
                                </a>
                              );
                            })}
                          </Box>
                        )}
                        <Typography variant="caption" sx={{ opacity: 0.7, display: 'block', textAlign: 'right', mt: 0.3 }}>
                          {formatDate(msg.created_at)}
                        </Typography>
                      </Box>
                      );
                    })}
                  </Box>
                </DialogContent>
                {selectedAdvisorTicket.status !== 'resolved' && selectedAdvisorTicket.status !== 'closed' && (
                  <Box sx={{ p: 2, pt: 0 }}>
                    {ticketReplyFiles.length > 0 && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                        {ticketReplyFiles.map((f, i) => (
                          <Chip
                            key={i}
                            label={f.name}
                            size="small"
                            onDelete={() => setTicketReplyFiles(prev => prev.filter((_, j) => j !== i))}
                            icon={f.type.startsWith('image/')
                              ? <ImageIcon fontSize="small" />
                              : f.type.includes('pdf') ? <PdfIcon fontSize="small" /> : <FileIcon fontSize="small" />}
                          />
                        ))}
                      </Box>
                    )}
                    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
                      <IconButton component="label" sx={{ color: '#F05A28' }} title="Adjuntar imagen">
                        <ImageIcon />
                        <input
                          hidden
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => {
                            const fs = Array.from(e.target.files || []);
                            setTicketReplyFiles(prev => [...prev, ...fs]);
                            e.target.value = '';
                          }}
                        />
                      </IconButton>
                      <IconButton component="label" sx={{ color: '#F05A28' }} title="Adjuntar PDF o Excel">
                        <AttachFileIcon />
                        <input
                          hidden
                          type="file"
                          accept="application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                          multiple
                          onChange={(e) => {
                            const fs = Array.from(e.target.files || []);
                            setTicketReplyFiles(prev => [...prev, ...fs]);
                            e.target.value = '';
                          }}
                        />
                      </IconButton>
                      <TextField
                        fullWidth size="small" multiline maxRows={3}
                        placeholder="Escribe tu respuesta..."
                        value={ticketReply}
                        onChange={e => setTicketReply(e.target.value)}
                      />
                      <IconButton
                        onClick={handleSendTicketReply}
                        disabled={(!ticketReply.trim() && ticketReplyFiles.length === 0) || ticketReplySending}
                        sx={{ color: '#F05A28' }}
                      >
                        {ticketReplySending ? <CircularProgress size={20} /> : <SendIcon />}
                      </IconButton>
                    </Box>
                  </Box>
                )}
              </>
            )}
          </Dialog>
        </Box>
      </Fade>
    );
  };

  // ════════════════════════════════════
  // MAIN RENDER
  // ════════════════════════════════════

  const tabConfig = useMemo(() => {
    const tabs = [
      { label: isMobile ? 'Inicio' : t('advisor.tabDashboard'), icon: <DashboardIcon />, shortLabel: 'Inicio' },
      { label: isMobile ? 'Clientes' : t('advisor.tabClients'), icon: <PeopleIcon />, shortLabel: 'Clientes' },
      { label: isMobile ? 'Envíos' : t('advisor.tabShipments'), icon: <ShippingIcon />, shortLabel: 'Envíos' },
      { label: isMobile ? '$' : t('advisor.tabCommissions'), icon: <MoneyIcon />, shortLabel: 'Comisiones' },
      { label: isMobile ? 'Más' : t('advisor.tabTools'), icon: <ToolsIcon />, shortLabel: 'Herramientas' },
      { label: isMobile ? 'Tickets' : 'Tickets', icon: <TicketIcon />, shortLabel: 'Tickets' },
      ...(dashboardData && dashboardData.subAdvisors > 0
        ? [{ label: isMobile ? 'Equipo' : 'Mi Equipo', icon: <PeopleIcon />, shortLabel: 'Equipo' }]
        : []),
    ];
    return tabs;
  }, [t, isMobile, dashboardData]);

  // ─── GATE: Verificación + Aviso de privacidad firmado ───
  const onboardingComplete = !!(
    dashboardData?.advisor?.isVerified &&
    dashboardData?.advisor?.privacyAccepted &&
    dashboardData?.advisor?.hasPrivacySignature
  );

  if (!loading && dashboardData && !onboardingComplete) {
    const a = dashboardData.advisor;
    const verifPending = !a.isVerified;
    const termsPending = !a.privacyAccepted || !a.hasPrivacySignature;
    const verifStatus = a.verificationStatus || 'not_started';
    return (
      <Box sx={{ maxWidth: 760, mx: 'auto', mt: { xs: 2, md: 6 }, px: 2 }}>
        <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 3, border: '1px solid #fed7aa' }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Box sx={{
              width: 80, height: 80, mx: 'auto', mb: 2, borderRadius: '50%',
              bgcolor: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <GppBadIcon sx={{ fontSize: 48, color: '#F05A28' }} />
            </Box>
            <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
              Completa tu activación de Asesor
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Tu cuenta aún no está habilitada. Completa los siguientes pasos desde la app móvil
              EntregaX para acceder a tu panel, ver clientes, embarques y comisiones.
            </Typography>
          </Box>

          <Box sx={{ mb: 3 }}>
            <Alert
              severity={verifPending ? 'warning' : 'success'}
              icon={verifPending ? <PendingIcon /> : <CheckCircleIcon />}
              sx={{ mb: 2, borderRadius: 2 }}
            >
              <Typography fontWeight={700}>
                {verifPending ? 'Verificación de identidad pendiente' : 'Identidad verificada ✓'}
              </Typography>
              <Typography variant="body2">
                {verifPending
                  ? verifStatus === 'pending_review'
                    ? 'Tus documentos fueron recibidos y están en revisión por un administrador (24-48 hrs).'
                    : 'Sube INE (ambos lados), Constancia Fiscal y selfie desde la app móvil.'
                  : 'Tu identidad ya fue validada correctamente.'}
              </Typography>
            </Alert>

            <Alert
              severity={termsPending ? 'warning' : 'success'}
              icon={termsPending ? <PendingIcon /> : <CheckCircleIcon />}
              sx={{ borderRadius: 2 }}
            >
              <Typography fontWeight={700}>
                {termsPending ? 'Aceptación de términos pendiente' : 'Términos firmados ✓'}
              </Typography>
              <Typography variant="body2">
                {termsPending
                  ? 'Debes leer y firmar digitalmente el Aviso de Privacidad y el Contrato de Asesor desde la app móvil.'
                  : `Firmado el ${a.privacyAcceptedAt ? new Date(a.privacyAcceptedAt).toLocaleDateString('es-MX', { dateStyle: 'long' }) : ''}`}
              </Typography>
            </Alert>
          </Box>

          <Box sx={{
            bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 2, p: 2, mb: 3,
          }}>
            <Typography variant="body2" sx={{ color: '#92400e' }}>
              <strong>¿Por qué este bloqueo?</strong> Para proteger los datos de tus clientes y
              cumplir con la normativa fiscal y de protección de datos (LFPDP), no podemos darte
              acceso a información comercial hasta que tu cuenta esté completamente activada.
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            {verifPending && (
              <Button
                variant="contained"
                startIcon={<BadgeIcon />}
                onClick={() => setVerifyWizardOpen(true)}
                sx={{ bgcolor: '#0A2540', '&:hover': { bgcolor: '#0d2f54' } }}
              >
                Completar verificación aquí
              </Button>
            )}
            {termsPending && (
              <Button
                variant="contained"
                startIcon={<SecurityIcon />}
                onClick={() => setTermsDialogOpen(true)}
                sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#d94d20' } }}
              >
                Firmar términos aquí
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => fetchDashboard()}
              sx={{ borderColor: '#F05A28', color: '#F05A28' }}
            >
              Ya completé, verificar de nuevo
            </Button>
            <Button
              variant="text"
              onClick={() => {
                localStorage.removeItem('token');
                window.location.href = '/login';
              }}
            >
              Cerrar sesión
            </Button>
          </Box>
          <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 2, color: 'text.secondary' }}>
            También puedes completarla desde la app móvil EntregaX.
          </Typography>
        </Paper>
        <AdvisorVerificationWizard
          open={verifyWizardOpen}
          onClose={() => setVerifyWizardOpen(false)}
          onComplete={() => { setVerifyWizardOpen(false); fetchDashboard(); }}
        />
        <AdvisorTermsSignatureDialog
          open={termsDialogOpen}
          onClose={() => setTermsDialogOpen(false)}
          onAccepted={() => { setTermsDialogOpen(false); fetchDashboard(); }}
        />
      </Box>
    );
  }

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
            if (activeTab === 5) fetchAdvisorTickets();
            if (activeTab === 6) fetchTeam();
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
        {activeTab === 5 && renderTickets()}
        {activeTab === 6 && renderTeam()}
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

                {/* Instrucciones de entrega */}
                <Typography variant="overline" color="text.secondary" sx={{ mt: 1 }}>Instrucciones de Entrega</Typography>
                <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2, borderColor: s.hasInstructions ? '#66BB6A' : '#FFB74D', bgcolor: s.hasInstructions ? '#F1F8E9' : '#FFF8F0' }}>
                  {s.hasInstructions && s.deliveryAddressName ? (
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <LocationIcon sx={{ fontSize: 18, color: '#F05A28' }} />
                        <Typography variant="body2" fontWeight={700}>{s.deliveryAddressName}</Typography>
                      </Box>
                      {s.deliveryAddressCity && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 3.5 }}>{s.deliveryAddressCity}</Typography>
                      )}
                      {s.deliveryAddressRecipient && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 3.5 }}>Recibe: {s.deliveryAddressRecipient}</Typography>
                      )}
                      {s.deliveryCarrierName && (
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 1, ml: 3.5, bgcolor: '#fff', border: '1px solid #e0e0e0', borderRadius: 1.5, px: 1, py: 0.3 }}>
                          {s.deliveryCarrierIcon && (s.deliveryCarrierIcon.startsWith('/') || s.deliveryCarrierIcon.startsWith('http'))
                            ? <img src={s.deliveryCarrierIcon} alt={s.deliveryCarrierName} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                            : s.deliveryCarrierIcon ? <Typography sx={{ fontSize: 14, lineHeight: 1 }}>{s.deliveryCarrierIcon}</Typography> : null}
                          <Typography variant="caption" fontWeight={600} sx={{ fontSize: '0.72rem' }}>{s.deliveryCarrierName}</Typography>
                        </Box>
                      )}
                    </Box>
                  ) : s.hasInstructions ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CheckCircleIcon sx={{ fontSize: 18, color: '#2E7D32' }} />
                      <Typography variant="body2" fontWeight={600} color="#2E7D32">Instrucciones configuradas</Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <WarningIcon sx={{ fontSize: 18, color: '#E65100' }} />
                      <Typography variant="body2" fontWeight={600} color="#E65100">Sin instrucciones de entrega</Typography>
                    </Box>
                  )}
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

      {/* Modal Cartera del Cliente */}
      <Dialog 
        open={walletModalOpen} 
        onClose={() => { setWalletModalOpen(false); setWalletData(null); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ 
          bgcolor: '#F05A28', 
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          gap: 1
        }}>
          <WalletIcon />
          Cartera del Cliente
          <IconButton 
            onClick={() => { setWalletModalOpen(false); setWalletData(null); }}
            sx={{ ml: 'auto', color: 'white' }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {walletLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress sx={{ color: '#F05A28' }} />
            </Box>
          ) : walletData ? (
            <>
              {/* Info del cliente */}
              <Paper sx={{ p: 2, m: 2, mb: 0, bgcolor: '#f8f9fa', borderRadius: 2 }}>
                <Typography variant="subtitle2" fontWeight={700}>
                  {walletData.cliente.nombre}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {walletData.cliente.email} • Casillero: {walletData.cliente.casillero}
                </Typography>
              </Paper>

              {/* Total Pendiente */}
              <Paper sx={{ 
                p: 3, 
                m: 2,
                background: 'linear-gradient(135deg, #F05A28 0%, #d94d1f 100%)',
                borderRadius: 3,
                textAlign: 'center'
              }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                  Total Pendiente por Pagar
                </Typography>
                <Typography variant="h4" fontWeight={800} sx={{ color: 'white' }}>
                  ${walletData.cartera.total_pendiente.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                  {walletData.cartera.moneda}
                </Typography>
              </Paper>

              {/* Desglose por servicio */}
              {walletData.cartera.saldo_por_servicio.length > 0 && (
                <Box sx={{ px: 2, pb: 2 }}>
                  <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    📊 Pendiente por Tipo de Servicio
                  </Typography>
                  {walletData.cartera.saldo_por_servicio.map((item, idx) => (
                    <Paper key={idx} sx={{ 
                      p: 1.5, 
                      mb: 1, 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderRadius: 2,
                      border: '1px solid #eee'
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: '1.2rem' }}>{item.icono}</Typography>
                        <Typography variant="body2" fontWeight={600}>{item.servicio}</Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body1" fontWeight={700} color="error.main">
                          ${item.monto.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.moneda}
                        </Typography>
                      </Box>
                    </Paper>
                  ))}
                </Box>
              )}

              {/* Cotizaciones Pendientes */}
              {walletData.cartera.cotizaciones_pendientes.count > 0 && (
                <Paper sx={{ 
                  p: 2, 
                  mx: 2, 
                  mb: 2,
                  bgcolor: '#fff3cd',
                  borderRadius: 2,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      📋 Cotizaciones Pendientes de Pago
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {walletData.cartera.cotizaciones_pendientes.count} cotización(es)
                    </Typography>
                  </Box>
                  <Typography variant="h6" fontWeight={700} color="warning.dark">
                    ${walletData.cartera.cotizaciones_pendientes.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Typography>
                </Paper>
              )}

              {/* Saldo a favor y Crédito */}
              <Box sx={{ display: 'flex', gap: 2, px: 2, pb: 2 }}>
                <Paper sx={{ 
                  flex: 1, 
                  p: 2, 
                  textAlign: 'center',
                  bgcolor: walletData.cartera.saldo_favor > 0 ? '#e8f5e9' : '#f5f5f5',
                  borderRadius: 2
                }}>
                  <Typography variant="caption" color="text.secondary">Saldo a Favor</Typography>
                  <Typography variant="h6" fontWeight={700} color="success.main">
                    ${walletData.cartera.saldo_favor.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Typography>
                </Paper>
                <Paper sx={{ 
                  flex: 1, 
                  p: 2, 
                  textAlign: 'center',
                  bgcolor: walletData.cartera.credito_disponible > 0 ? '#e3f2fd' : '#f5f5f5',
                  borderRadius: 2
                }}>
                  <Typography variant="caption" color="text.secondary">Crédito Disponible</Typography>
                  <Typography variant="h6" fontWeight={700} color="primary.main">
                    ${walletData.cartera.credito_disponible.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Typography>
                </Paper>
              </Box>
            </>
          ) : (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">No se pudo cargar la cartera</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#f5f5f5' }}>
          <Button 
            onClick={() => { setWalletModalOpen(false); setWalletData(null); }}
            variant="outlined"
            sx={{ borderRadius: 2 }}
          >
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Dialog: Asignar Instrucciones ─── */}
      <Dialog open={instrDialogOpen} onClose={() => setInstrDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#E65100', color: '#fff' }}>
          <EditIcon />
          {selectedUids.size > 1
            ? `Instrucciones de entrega — ${selectedUids.size} envíos`
            : `Instrucciones de entrega — ${instrShipment?.tracking || instrShipment?.uid}`}
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {selectedUids.size > 1
              ? <>Selecciona la dirección para asignar a los <strong>{selectedUids.size} envíos</strong> seleccionados del cliente <strong>{instrShipment?.clientName}</strong>:</>
              : <>Selecciona la dirección de entrega guardada del cliente <strong>{instrShipment?.clientName}</strong>:</>
            }
          </Typography>
          {instrLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          ) : instrAddresses.length === 0 ? (
            <Alert severity="warning" sx={{ mt: 1 }}>
              Este cliente no tiene direcciones guardadas. Pídele que agregue una dirección desde su portal.
            </Alert>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
              {instrAddresses.map((addr) => {
                const isSelected = instrSelectedId === String(addr.id);
                const services = addr.default_for_service
                  ? addr.default_for_service.split(',').map((s: string) => s.trim()).filter(Boolean)
                  : [];
                return (
                  <Paper
                    key={addr.id}
                    variant="outlined"
                    onClick={() => handleSelectInstrAddress(addr)}
                    sx={{
                      p: 1.5, cursor: 'pointer', borderRadius: 2,
                      borderColor: isSelected ? '#E65100' : 'divider',
                      borderWidth: isSelected ? 2 : 1,
                      bgcolor: isSelected ? '#FFF3E0' : 'background.paper',
                      '&:hover': { borderColor: '#E65100', bgcolor: '#FFF8F5' },
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Box>
                        <Typography variant="body2" fontWeight={700}>
                          {addr.alias || addr.recipient_name || 'Dirección'}
                          {addr.is_default && <Chip label="Principal" size="small" color="success" sx={{ ml: 1, height: 18, fontSize: 10 }} />}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {addr.street} {addr.exterior_number}{addr.interior_number ? ` Int. ${addr.interior_number}` : ''}
                          {addr.colony ? `, ${addr.colony}` : ''}, {addr.city}, {addr.state} {addr.zip_code}
                        </Typography>
                        {addr.recipient_name && addr.alias && (
                          <Typography variant="caption" color="text.secondary">Recibe: {addr.recipient_name}</Typography>
                        )}
                      </Box>
                      {isSelected && <CheckCircleIcon sx={{ color: '#E65100', flexShrink: 0 }} />}
                    </Box>
                    {services.length > 0 && (
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                        {services.map((svc: string) => {
                          const found = SERVICE_LIST.find(s => s.value === svc);
                          return (
                            <Chip key={svc} label={found ? found.label : svc} size="small"
                              sx={{ height: 18, fontSize: 10, bgcolor: found ? `${found.color}22` : undefined, color: found?.color }} />
                          );
                        })}
                      </Box>
                    )}
                  </Paper>
                );
              })}
            </Box>
          )}

          {/* ─── Sección Paquetería ─── */}
          {(instrCarriers.length > 0 || instrCarriersLoading) && (
            <Box sx={{ mt: 2.5 }}>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="subtitle2" fontWeight={700} gutterBottom sx={{ color: '#E65100', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CarrierIcon sx={{ fontSize: 18 }} /> ¿Por qué paquetería?
              </Typography>
              {instrCarriersLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
              ) : (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {instrCarriers.map((carrier: any) => {
                    const isCarrierSelected = instrCarrierKey === carrier.carrier_key;
                    const isUrl = carrier.icon && (carrier.icon.startsWith('/') || carrier.icon.startsWith('http'));
                    return (
                      <Paper
                        key={carrier.carrier_key}
                        variant="outlined"
                        onClick={() => handleSelectInstrCarrier(carrier)}
                        sx={{
                          p: 1.5, cursor: 'pointer', borderRadius: 2, minWidth: 90, maxWidth: 120,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
                          borderColor: isCarrierSelected ? '#E65100' : 'divider',
                          borderWidth: isCarrierSelected ? 2 : 1,
                          bgcolor: isCarrierSelected ? '#FFF3E0' : 'background.paper',
                          transition: 'all 0.15s',
                          '&:hover': { borderColor: '#E65100', bgcolor: '#FFF8F5' },
                          position: 'relative',
                        }}
                      >
                        {isCarrierSelected && (
                          <CheckCircleIcon sx={{ position: 'absolute', top: 6, right: 6, fontSize: 16, color: '#E65100' }} />
                        )}
                        {isUrl
                          ? <img
                              src={carrier.icon.startsWith('/') ? `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}${carrier.icon}` : carrier.icon}
                              alt={carrier.name}
                              style={{ width: 36, height: 36, objectFit: 'contain' }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.insertAdjacentText('afterbegin', '📦'); }}
                            />
                          : <Typography sx={{ fontSize: 28, lineHeight: 1 }}>{carrier.icon || '📦'}</Typography>
                        }
                        <Typography variant="caption" fontWeight={isCarrierSelected ? 700 : 400} align="center" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
                          {carrier.name}
                        </Typography>
                        {carrier.price_label && (
                          <Typography variant="caption" color={carrier.allows_collect ? 'warning.main' : 'text.secondary'} align="center" sx={{ fontSize: '0.65rem', fontWeight: carrier.allows_collect ? 700 : 400 }}>
                            {carrier.price_label}
                          </Typography>
                        )}
                      </Paper>
                    );
                  })}
                </Box>
              )}

              {/* ── Estimado de costo ── */}
              <Collapse in={!!instrCarrierKey && (instrPriceLoading || !!instrPriceEstimate)}>
                <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: '#F3F8FF', border: '1px solid #BBDEFB', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  {instrPriceLoading ? (
                    <>
                      <CircularProgress size={18} sx={{ color: '#1976D2' }} />
                      <Typography variant="body2" color="text.secondary">Calculando costo estimado…</Typography>
                    </>
                  ) : instrPriceEstimate ? (
                    <>
                      <Typography sx={{ fontSize: 22 }}>💰</Typography>
                      <Box>
                        <Typography variant="body2" fontWeight={700} color="#1565C0">
                          Costo estimado: ${instrPriceEstimate.price.toFixed(2)} MXN
                          {instrPriceEstimate.boxes > 1 && (
                            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                              (${instrPriceEstimate.perBox.toFixed(2)}/caja × {instrPriceEstimate.boxes})
                            </Typography>
                          )}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">Entrega aprox. {instrPriceEstimate.days}</Typography>
                      </Box>
                    </>
                  ) : null}
                </Box>
              </Collapse>

              {/* ── Documentos para paquetería por cobrar ── */}
              <Collapse in={instrIsCollect}>
                <Box sx={{ mt: 2, p: 2, borderRadius: 2, border: '1px solid #FFB74D', bgcolor: '#FFFDE7' }}>
                  <Typography variant="body2" fontWeight={700} sx={{ mb: 1.5, color: '#E65100', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    📄 Documentos requeridos
                  </Typography>

                  {/* Factura del embarque */}
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Factura del embarque</Typography>
                  <Button
                    component="label"
                    variant="outlined"
                    size="small"
                    fullWidth
                    startIcon={<AttachFileIcon />}
                    sx={{ justifyContent: 'flex-start', textTransform: 'none', mb: 1.5, borderColor: instrFacturaFile ? '#4CAF50' : '#ccc', color: instrFacturaFile ? '#2E7D32' : 'text.secondary' }}
                  >
                    {instrFacturaFile ? `✓ ${instrFacturaFile.name}` : 'Subir factura (PDF o imagen)'}
                    <input type="file" hidden accept=".pdf,image/*" onChange={(e) => setInstrFacturaFile(e.target.files?.[0] || null)} />
                  </Button>

                  {/* ¿Requiere factura de paquetería? */}
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>¿Requiere factura de la paquetería?</Typography>
                  <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                    <Button size="small" variant={instrWantsFactura ? 'contained' : 'outlined'} onClick={() => setInstrWantsFactura(true)} sx={instrWantsFactura ? { bgcolor: '#E65100', '&:hover': { bgcolor: '#BF360C' } } : {}}>Sí</Button>
                    <Button size="small" variant={!instrWantsFactura ? 'contained' : 'outlined'} onClick={() => setInstrWantsFactura(false)} sx={!instrWantsFactura ? { bgcolor: '#666', '&:hover': { bgcolor: '#555' } } : {}}>No</Button>
                  </Box>

                  {/* Guía externa */}
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Guía de paquetería (opcional)</Typography>
                  <Button
                    component="label"
                    variant="outlined"
                    size="small"
                    fullWidth
                    startIcon={<AttachFileIcon />}
                    sx={{ justifyContent: 'flex-start', textTransform: 'none', borderColor: instrGuiaFile ? '#4CAF50' : '#ccc', color: instrGuiaFile ? '#2E7D32' : 'text.secondary' }}
                  >
                    {instrGuiaFile ? `✓ ${instrGuiaFile.name}` : 'Subir guía (PDF o imagen)'}
                    <input type="file" hidden accept=".pdf,image/*" onChange={(e) => setInstrGuiaFile(e.target.files?.[0] || null)} />
                  </Button>
                </Box>
              </Collapse>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 1.5 }}>
          <Button onClick={() => setInstrDialogOpen(false)} variant="outlined">Cancelar</Button>
          <Button
            variant="contained"
            disabled={!instrSelectedId || instrSaving || (instrCarriers.length > 0 && !instrCarrierKey)}
            onClick={handleSaveInstructions}
            sx={{ bgcolor: '#E65100', '&:hover': { bgcolor: '#bf360c' } }}
          >
            {instrSaving ? <CircularProgress size={18} color="inherit" /> : 'Guardar instrucciones'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Dialog: Direcciones del Cliente ─── */}
      <Dialog
        open={addressesModalOpen}
        onClose={() => { setAddressesModalOpen(false); setEditingAddress(null); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#7B1FA2', color: '#fff' }}>
          <LocationIcon />
          Direcciones — {addressesClient?.name}
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {addressesLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress sx={{ color: '#7B1FA2' }} />
            </Box>
          ) : clientAddresses.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">Este cliente no tiene direcciones guardadas.</Typography>
            </Box>
          ) : (
            <List disablePadding>
              {clientAddresses.map((addr, idx) => {
                const isEditing = editingAddress?.id === addr.id;
                const services = addr.default_for_service
                  ? addr.default_for_service.split(',').map((s: string) => s.trim()).filter(Boolean)
                  : [];
                return (
                  <Box key={addr.id}>
                    {idx > 0 && <Divider />}
                    <ListItem
                      alignItems="flex-start"
                      sx={{ flexDirection: 'column', py: 1.5, px: 2 }}
                    >
                      <Box sx={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box>
                          <Typography variant="body2" fontWeight={700}>
                            {addr.alias || addr.recipient_name || `Dirección ${idx + 1}`}
                            {addr.is_default && <Chip label="Principal" size="small" color="success" sx={{ ml: 1, height: 18, fontSize: 10 }} />}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {addr.street} {addr.exterior_number}{addr.interior_number ? ` Int. ${addr.interior_number}` : ''}, {addr.colony ? `${addr.colony}, ` : ''}{addr.city}, {addr.state} {addr.zip_code}
                          </Typography>
                          {services.length > 0 && !isEditing && (
                            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                              {services.map((svc: string) => {
                                const found = SERVICE_LIST.find(s => s.value === svc);
                                return (
                                  <Chip
                                    key={svc}
                                    label={found ? found.label : svc}
                                    size="small"
                                    sx={{ height: 20, fontSize: 10, bgcolor: found ? `${found.color}22` : undefined, color: found?.color }}
                                  />
                                );
                              })}
                            </Box>
                          )}
                        </Box>
                        {advisorInstructionsEnabled && (
                          <Button
                            size="small"
                            variant={isEditing ? 'contained' : 'outlined'}
                            onClick={() => isEditing ? setEditingAddress(null) : handleEditAddress(addr)}
                            sx={{ ml: 1, textTransform: 'none', fontSize: '0.7rem',
                              ...(isEditing ? { bgcolor: '#7B1FA2', '&:hover': { bgcolor: '#6a1b9a' } } : { borderColor: '#7B1FA2', color: '#7B1FA2' })
                            }}
                          >
                            {isEditing ? 'Cancelar' : 'Editar'}
                          </Button>
                        )}
                      </Box>

                      {isEditing && (
                        <Box sx={{ mt: 1.5, width: '100%', bgcolor: '#f9f0ff', borderRadius: 1, p: 1.5 }}>
                          <Typography variant="caption" fontWeight={600} color="#7B1FA2" display="block" mb={0.5}>
                            Servicios predeterminados y paquetería:
                          </Typography>
                          <FormGroup>
                            {SERVICE_LIST.map(svc => {
                              const isChecked = addressServiceTypes.includes(svc.value);
                              const carriers = carriersCache[svc.serviceType] || [];
                              const currentCarrier = addressCarrierConfig[svc.value] || '';
                              return (
                                <Box key={svc.value} sx={{ mb: 0.5 }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <FormControlLabel
                                      control={
                                        <Checkbox
                                          size="small"
                                          checked={isChecked}
                                          onChange={(e) => {
                                            const checked = e.target.checked;
                                            setAddressServiceTypes(prev =>
                                              checked ? [...prev, svc.value] : prev.filter(s => s !== svc.value)
                                            );
                                            if (!checked) {
                                              setAddressCarrierConfig(prev => {
                                                const cc = { ...prev }; delete cc[svc.value]; return cc;
                                              });
                                            }
                                          }}
                                          sx={{ color: svc.color, '&.Mui-checked': { color: svc.color } }}
                                        />
                                      }
                                      label={<Typography variant="body2">{svc.label}</Typography>}
                                      sx={{ mr: 0, minWidth: 160 }}
                                    />
                                    {isChecked && carriers.length > 0 && (
                                      <TextField
                                        select
                                        size="small"
                                        value={currentCarrier}
                                        onChange={(e) => setAddressCarrierConfig(prev => ({ ...prev, [svc.value]: e.target.value }))}
                                        sx={{ flex: 1, minWidth: 150 }}
                                        SelectProps={{
                                          displayEmpty: true,
                                          renderValue: (val: unknown) => {
                                            if (!val) return <Typography variant="body2" color="text.secondary">Sin paquetería</Typography>;
                                            const found = carriers.find((x: any) => x.carrier_key === val || x.id === val);
                                            if (!found) return <Typography variant="body2">{String(val)}</Typography>;
                                            const isUrl = found.icon && (found.icon.startsWith('/') || found.icon.startsWith('http'));
                                            return (
                                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                {isUrl
                                                  ? <img src={found.icon} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                                                  : <span>{found.icon || '🚛'}</span>}
                                                <Typography variant="body2" noWrap>{found.name}</Typography>
                                              </Box>
                                            );
                                          },
                                        }}
                                      >
                                        <MenuItem value=""><em>Sin paquetería default</em></MenuItem>
                                        {carriers.map((c: any) => {
                                          const isUrl = c.icon && (c.icon.startsWith('/') || c.icon.startsWith('http'));
                                          return (
                                            <MenuItem key={c.carrier_key || c.id} value={c.carrier_key || c.id}>
                                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                {isUrl
                                                  ? <img src={c.icon} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                                                  : <span>{c.icon || '🚛'}</span>}
                                                {c.name}
                                              </Box>
                                            </MenuItem>
                                          );
                                        })}
                                      </TextField>
                                    )}
                                  </Box>
                                </Box>
                              );
                            })}
                          </FormGroup>
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                            <Button
                              variant="contained"
                              size="small"
                              disabled={addressSaving}
                              onClick={handleSaveAddressServices}
                              sx={{ bgcolor: '#7B1FA2', '&:hover': { bgcolor: '#6a1b9a' }, textTransform: 'none' }}
                            >
                              {addressSaving ? <CircularProgress size={16} color="inherit" /> : 'Guardar'}
                            </Button>
                          </Box>
                        </Box>
                      )}
                    </ListItem>
                  </Box>
                );
              })}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 1.5, justifyContent: 'space-between' }}>
          {advisorInstructionsEnabled ? (
            <Button
              variant="contained"
              size="small"
              onClick={() => { setNewAddrForm(EMPTY_ADDR); setNewAddrOpen(true); }}
              sx={{ bgcolor: '#7B1FA2', '&:hover': { bgcolor: '#6a1b9a' }, textTransform: 'none' }}
            >
              + Agregar dirección
            </Button>
          ) : <Box />}
          <Button onClick={() => { setAddressesModalOpen(false); setEditingAddress(null); }} variant="outlined">
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Sub-dialog: Nueva Dirección */}
      <Dialog open={newAddrOpen} onClose={() => setNewAddrOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#7B1FA2', color: '#fff', display: 'flex', alignItems: 'center', gap: 1 }}>
          <LocationIcon fontSize="small" /> Nueva dirección — {addressesClient?.name}
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <TextField label="Alias" size="small" value={newAddrForm.alias} onChange={e => setNewAddrForm(p => ({ ...p, alias: e.target.value }))} sx={{ gridColumn: '1 / -1' }} />
            <TextField label="Nombre del destinatario" size="small" value={newAddrForm.recipientName} onChange={e => setNewAddrForm(p => ({ ...p, recipientName: e.target.value }))} sx={{ gridColumn: '1 / -1' }} />
            <TextField label="Calle *" size="small" value={newAddrForm.street} onChange={e => setNewAddrForm(p => ({ ...p, street: e.target.value }))} sx={{ gridColumn: '1 / -1' }} />
            <TextField label="No. Exterior *" size="small" value={newAddrForm.exteriorNumber} onChange={e => setNewAddrForm(p => ({ ...p, exteriorNumber: e.target.value }))} />
            <TextField label="No. Interior" size="small" value={newAddrForm.interiorNumber} onChange={e => setNewAddrForm(p => ({ ...p, interiorNumber: e.target.value }))} />
            <TextField label="Colonia" size="small" value={newAddrForm.neighborhood} onChange={e => setNewAddrForm(p => ({ ...p, neighborhood: e.target.value }))} sx={{ gridColumn: '1 / -1' }} />
            <TextField label="Ciudad *" size="small" value={newAddrForm.city} onChange={e => setNewAddrForm(p => ({ ...p, city: e.target.value }))} />
            <TextField label="Estado *" size="small" value={newAddrForm.state} onChange={e => setNewAddrForm(p => ({ ...p, state: e.target.value }))} />
            <TextField label="C.P. *" size="small" value={newAddrForm.zipCode} onChange={e => setNewAddrForm(p => ({ ...p, zipCode: e.target.value }))} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 1.5 }}>
          <Button onClick={() => setNewAddrOpen(false)} variant="outlined">Cancelar</Button>
          <Button
            variant="contained"
            disabled={!newAddrForm.street || !newAddrForm.city || !newAddrForm.state || !newAddrForm.zipCode || newAddrSaving}
            onClick={handleAddAddress}
            sx={{ bgcolor: '#7B1FA2', '&:hover': { bgcolor: '#6a1b9a' } }}
          >
            {newAddrSaving ? <CircularProgress size={18} color="inherit" /> : 'Guardar dirección'}
          </Button>
        </DialogActions>
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
