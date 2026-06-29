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
  Radio,
  Divider,
  BottomNavigation,
  BottomNavigationAction,
  Checkbox,
  FormControlLabel,
  FormGroup,
  List,
  ListItem,
  ListItemText,
  Switch,
  Autocomplete,
  Badge,
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
  Calculate as QuoteIcon,
  Send as SendIcon,
  AttachFile as AttachFileIcon,
  UploadFile as UploadFileIcon,
  PictureAsPdf as PdfIcon,
  InsertDriveFile as FileIcon,
  Image as ImageIcon,
  BugReport as BugIcon,
  MonetizationOn as BillingIcon,
  PersonOff as ClientIssueIcon,
  MoreHoriz as OtherIcon,
  ListAlt as ListAltIcon,
  HelpOutline as UnidentifiedIcon,
  PersonAdd as AssignIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Download as DownloadIcon,
  Markunread as SendInstrIcon,
  ReceiptLong as InvoiceIcon,
  Add as AddIcon,
  AddCircle as ExtraChargeIcon,
} from '@mui/icons-material';
import api from '../services/api';
import EntangledPaymentRequest from '../components/EntangledPaymentRequest';
import { usePaymentStatus, mapServiceKey } from '../hooks/usePaymentStatus';
import AdvisorVerificationWizard from '../components/AdvisorVerificationWizard';
import AdvisorTermsSignatureDialog from '../components/AdvisorTermsSignatureDialog';
import AdvisorQuoteRequestModal from '../components/AdvisorQuoteRequestModal';
import CsfPanel from '../components/CsfPanel';

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
  boxesCount?: number;
  hasGex: boolean;
  gexCost: number;
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
  inPaymentOrderRef: string | null;
  labelPrinted: boolean;
  nationalShippingCost: number;
  extraChargesTotal: number;
  extraChargesDesc?: string;
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
  const { advisorInstructionsEnabled, advisorPaymentOrderEnabled, advisorXpayEnabled, entregaxPaymentsByService } = usePaymentStatus();

  // ─── State ───
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<AdvisorDashboardData | null>(null);
  const [verifyWizardOpen, setVerifyWizardOpen] = useState(false);
  const [termsDialogOpen, setTermsDialogOpen] = useState(false);

  // Tarifas y TC en vivo
  const [liveRates, setLiveRates] = useState<{ precio_tdi_aereo_usd: number | null; precio_tdi_express_usd: number | null; tc_envio_dinero: number | null } | null>(null);

  // Modal Embarques en Tránsito
  const [transitModalOpen, setTransitModalOpen] = useState(false);
  const [transitClients, setTransitClients] = useState<{ id: number; name: string; boxId: string; count: number }[]>([]);
  const [transitClientsLoading, setTransitClientsLoading] = useState(false);
  const [transitSearch, setTransitSearch] = useState('');

  // Guías sin identificar (dashboard widget)
  const [unidentifiedPkgs, setUnidentifiedPkgs] = useState<any[]>([]);
  const [unidentifiedLoading, setUnidentifiedLoading] = useState(false);
  const [unidentifiedModalOpen, setUnidentifiedModalOpen] = useState(false);
  const [unidentifiedSearch, setUnidentifiedSearch] = useState('');
  const [pkgDetail, setPkgDetail] = useState<any | null>(null);
  const [pkgDetailLoading, setPkgDetailLoading] = useState(false);
  const [assignTarget, setAssignTarget] = useState<any | null>(null);
  const [assignSearch, setAssignSearch] = useState('');
  const [assignClients, setAssignClients] = useState<any[]>([]);
  const [assignClientsLoading, setAssignClientsLoading] = useState(false);
  const [assignSelectedClient, setAssignSelectedClient] = useState<any | null>(null);
  const [assigning, setAssigning] = useState(false);

  // Clients tab
  const [clients, setClients] = useState<AdvisorClient[]>([]);
  const [clientsTotal, setClientsTotal] = useState(0);
  const [clientsLoading, setClientsLoading] = useState(false);

  // ── Xpay (asesor crea operaciones a nombre de un cliente asignado) ──
  const [xpayLogoUrl, setXpayLogoUrl] = useState<string>('');        // negro (para el tab sobre blanco)
  const [xpayLogoWhiteUrl, setXpayLogoWhiteUrl] = useState<string>(''); // blanco (para el hero negro)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get('/brand-assets/active');
        const black = r.data?.assets?.xpay_full_black?.url || '';
        const white = r.data?.assets?.xpay_full_white?.url || '';
        if (!cancelled) {
          if (black) setXpayLogoUrl(black);
          if (white) setXpayLogoWhiteUrl(white);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);
  const [xpayClient, setXpayClient] = useState<{ id: number; full_name: string; box_id: string } | null>(null);
  const [xpayClientOptions, setXpayClientOptions] = useState<{ id: number; full_name: string; box_id: string }[]>([]);
  const [xpayClientsLoading, setXpayClientsLoading] = useState(false);
  const fetchXpayClients = useCallback(async (search: string) => {
    setXpayClientsLoading(true);
    try {
      const r = await api.get('/advisor/xpay/clients', { params: search ? { search } : {} });
      setXpayClientOptions(r.data?.clients || []);
    } catch {
      setXpayClientOptions([]);
    } finally {
      setXpayClientsLoading(false);
    }
  }, []);
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

  // Órdenes de Pago
  const [paymentOrders, setPaymentOrders] = useState<any[]>([]);
  const [paymentOrdersLoading, setPaymentOrdersLoading] = useState(false);
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());
  // Detalle por orden (master + hijas con peso/medidas) — cargado al expandir
  const [orderDetails, setOrderDetails] = useState<Record<string, { loading: boolean; items: any[] }>>({});

  const loadOrderDetail = useCallback(async (op: any, rowKey: string) => {
    setOrderDetails(prev => ({ ...prev, [rowKey]: { loading: true, items: prev[rowKey]?.items || [] } }));
    try {
      const res = await api.get(`/advisor/payment-orders/${op.id}/detail`, { params: { source: op.created_by } });
      setOrderDetails(prev => ({ ...prev, [rowKey]: { loading: false, items: res.data.items || [] } }));
    } catch {
      setOrderDetails(prev => ({ ...prev, [rowKey]: { loading: false, items: [] } }));
    }
  }, []);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [newOrderShipments, setNewOrderShipments] = useState<AdvisorShipment[]>([]);
  const [newOrderShipmentsLoading, setNewOrderShipmentsLoading] = useState(false);
  const [newOrderSelectedUids, setNewOrderSelectedUids] = useState<Set<string>>(new Set());
  const [newOrderClientId, setNewOrderClientId] = useState<string>('all');
  const [newOrderServiceFilter, setNewOrderServiceFilter] = useState<string>('all');
  const [newOrderNotes, setNewOrderNotes] = useState('');
  const [newOrderManualTotal, setNewOrderManualTotal] = useState<string>('');
  const [newOrderSearch, setNewOrderSearch] = useState('');
  const [newOrderSaving, setNewOrderSaving] = useState(false);
  const [successOrderData, setSuccessOrderData] = useState<any>(null);
  const [cancelConfirmOrderId, setCancelConfirmOrderId] = useState<number | null>(null);
  // Catálogos SAT para los selectores de régimen y uso CFDI
  const [satRegimenes, setSatRegimenes] = useState<Array<{ clave: string; descripcion: string }>>([]);
  const [satUsos, setSatUsos] = useState<Array<{ clave: string; descripcion: string }>>([]);
  useEffect(() => {
    api.get('/fiscal/catalogos/regimenes').then(r => setSatRegimenes(r.data?.regimenes || [])).catch(() => {});
    api.get('/fiscal/catalogos/usos-cfdi').then(r => setSatUsos(r.data?.usos || [])).catch(() => {});
  }, []);
  // Diálogo "Solicitar factura"
  const emptyFiscal = { razon_social: '', rfc: '', codigo_postal: '', regimen_fiscal: '', uso_cfdi: 'G03' };
  const [invoiceOrder, setInvoiceOrder] = useState<any | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);
  const [invoiceInfo, setInvoiceInfo] = useState<any | null>(null);
  const [invoiceResult, setInvoiceResult] = useState<{ uuid?: string; pdfUrl?: string } | null>(null);
  const [invoiceFiscal, setInvoiceFiscal] = useState(emptyFiscal);
  // Perfiles fiscales del cliente (varios, como las direcciones)
  const [invoiceProfiles, setInvoiceProfiles] = useState<any[]>([]);
  const [invoiceProfileId, setInvoiceProfileId] = useState<number | null>(null);
  const [invoiceAddingProfile, setInvoiceAddingProfile] = useState(false);
  const [invoiceSavingProfile, setInvoiceSavingProfile] = useState(false);

  const applyInvoiceInfo = (data: any) => {
    setInvoiceInfo(data);
    const profiles: any[] = Array.isArray(data?.profiles) ? data.profiles : [];
    setInvoiceProfiles(profiles);
    if (profiles.length > 0) {
      const def = profiles.find((p) => p.is_default) || profiles[0];
      setInvoiceProfileId(def.id);
      setInvoiceFiscal({ razon_social: def.razon_social, rfc: def.rfc, codigo_postal: def.codigo_postal, regimen_fiscal: def.regimen_fiscal, uso_cfdi: def.uso_cfdi || 'G03' });
      setInvoiceAddingProfile(false);
    } else {
      // Sin perfiles: abrir el formulario, prellenando los datos fiscales legacy del cliente si existen
      const f = data?.fiscal || {};
      setInvoiceProfileId(null);
      setInvoiceFiscal({ razon_social: f.razon_social || '', rfc: f.rfc || '', codigo_postal: f.codigo_postal || '', regimen_fiscal: f.regimen_fiscal || '', uso_cfdi: f.uso_cfdi || 'G03' });
      setInvoiceAddingProfile(true);
    }
  };

  const openInvoiceDialog = async (op: any) => {
    setInvoiceOrder(op);
    setInvoiceInfo(null);
    setInvoiceResult(null);
    setInvoiceProfiles([]);
    setInvoiceProfileId(null);
    setInvoiceAddingProfile(false);
    setInvoiceLoading(true);
    try {
      const res = await api.get(`/advisor/payment-orders/${op.id}/invoice-info`, { params: { source: op.created_by } });
      applyInvoiceInfo(res.data);
      if (res.data?.alreadyInvoiced) setInvoiceResult({ uuid: res.data.alreadyInvoiced.uuid, pdfUrl: res.data.alreadyInvoiced.pdf });
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.error || 'No se pudo cargar la información de facturación', severity: 'error' });
      setInvoiceOrder(null);
    } finally {
      setInvoiceLoading(false);
    }
  };

  const selectInvoiceProfile = (p: any) => {
    setInvoiceProfileId(p.id);
    setInvoiceFiscal({ razon_social: p.razon_social, rfc: p.rfc, codigo_postal: p.codigo_postal, regimen_fiscal: p.regimen_fiscal, uso_cfdi: p.uso_cfdi || 'G03' });
  };

  const saveFiscalProfile = async () => {
    if (!invoiceInfo?.clientId) return;
    setInvoiceSavingProfile(true);
    try {
      await api.post(`/advisor/clients/${invoiceInfo.clientId}/fiscal-profiles`, invoiceFiscal);
      // Recargar info para refrescar la lista de perfiles y seleccionar el nuevo
      const res = await api.get(`/advisor/payment-orders/${invoiceOrder.id}/invoice-info`, { params: { source: invoiceOrder.created_by } });
      applyInvoiceInfo(res.data);
      setSnackbar({ open: true, message: '✅ Datos fiscales guardados', severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.error || 'No se pudieron guardar los datos fiscales', severity: 'error' });
    } finally {
      setInvoiceSavingProfile(false);
    }
  };

  const deleteFiscalProfile = async (profileId: number) => {
    if (!invoiceInfo?.clientId) return;
    try {
      await api.delete(`/advisor/clients/${invoiceInfo.clientId}/fiscal-profiles/${profileId}`);
      const res = await api.get(`/advisor/payment-orders/${invoiceOrder.id}/invoice-info`, { params: { source: invoiceOrder.created_by } });
      applyInvoiceInfo(res.data);
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.error || 'No se pudo eliminar', severity: 'error' });
    }
  };

  const submitInvoice = async () => {
    if (!invoiceOrder) return;
    setInvoiceSubmitting(true);
    try {
      const res = await api.post(`/advisor/payment-orders/${invoiceOrder.id}/request-invoice`, {
        source: invoiceOrder.created_by,
        fiscalData: invoiceFiscal,
      });
      if (res.data?.pending) {
        setSnackbar({ open: true, message: 'Factura solicitada. en proceso de timbrado.', severity: 'info' });
        setInvoiceOrder(null);
      } else {
        setInvoiceResult({ uuid: res.data.uuid, pdfUrl: res.data.pdfUrl });
        setSnackbar({ open: true, message: '✅ Factura generada correctamente', severity: 'success' });
      }
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.error || 'No se pudo generar la factura', severity: 'error' });
    } finally {
      setInvoiceSubmitting(false);
    }
  };

  // ── Gestor de datos fiscales del cliente (desde Mis Clientes) ──
  const [fiscalClient, setFiscalClient] = useState<{ id: number; name: string } | null>(null);
  const [fiscalProfiles, setFiscalProfiles] = useState<any[]>([]);

  // ── Gestor de CSF del cliente (asesor sube en nombre del cliente) ──
  const [csfClient, setCsfClient] = useState<{ id: number; name: string } | null>(null);
  const [fiscalLoading, setFiscalLoading] = useState(false);
  const [fiscalAdding, setFiscalAdding] = useState(false);
  const [fiscalSaving, setFiscalSaving] = useState(false);
  const [fiscalForm, setFiscalForm] = useState(emptyFiscal);

  const loadFiscalProfiles = async (clientId: number) => {
    setFiscalLoading(true);
    try {
      const res = await api.get(`/advisor/clients/${clientId}/fiscal-profiles`);
      const profiles = Array.isArray(res.data?.profiles) ? res.data.profiles : [];
      setFiscalProfiles(profiles);
      setFiscalAdding(profiles.length === 0);
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.error || 'No se pudieron cargar los datos fiscales', severity: 'error' });
    } finally {
      setFiscalLoading(false);
    }
  };

  const openFiscalManager = (client: { id: number; name: string }) => {
    setFiscalClient(client);
    setFiscalProfiles([]);
    setFiscalAdding(false);
    setFiscalForm(emptyFiscal);
    loadFiscalProfiles(client.id);
  };

  const saveClientFiscalProfile = async () => {
    if (!fiscalClient) return;
    setFiscalSaving(true);
    try {
      await api.post(`/advisor/clients/${fiscalClient.id}/fiscal-profiles`, fiscalForm);
      setFiscalForm(emptyFiscal);
      setFiscalAdding(false);
      await loadFiscalProfiles(fiscalClient.id);
      setSnackbar({ open: true, message: '✅ Datos fiscales guardados', severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.error || 'No se pudieron guardar los datos fiscales', severity: 'error' });
    } finally {
      setFiscalSaving(false);
    }
  };

  const deleteClientFiscalProfile = async (profileId: number) => {
    if (!fiscalClient) return;
    try {
      await api.delete(`/advisor/clients/${fiscalClient.id}/fiscal-profiles/${profileId}`);
      await loadFiscalProfiles(fiscalClient.id);
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.error || 'No se pudo eliminar', severity: 'error' });
    }
  };

  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [proofModalOrder, setProofModalOrder] = useState<any | null>(null);
  const [proofModalLoading, setProofModalLoading] = useState(false);
  const [proofModalItems, setProofModalItems] = useState<any[]>([]);
  const [proofUploadFile, setProofUploadFile] = useState<File | null>(null);
  const [proofDeclaredAmount, setProofDeclaredAmount] = useState<string>('');

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
  const [instrPriceEstimate, setInstrPriceEstimate] = useState<{
    price: number; perBox: number; boxes: number; days: string;
    type?: 'domicilio' | 'ocurre'; usedZip?: string; nearestBranch?: boolean;
    branch?: any; noCoverage?: boolean; available?: boolean;
  } | null>(null);
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

  // Shipping instructions modal (send warehouse address + instructions to client)
  const [shipInstrOpen, setShipInstrOpen] = useState(false);
  const [shipInstrClient, setShipInstrClient] = useState<{ id: number; name: string; boxId: string } | null>(null);
  const [shipInstrServiceType, setShipInstrServiceType] = useState<string>('');
  const [shipInstrAddresses, setShipInstrAddresses] = useState<Record<string, any>>({});
  const [shipInstrLoading, setShipInstrLoading] = useState(false);

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
  const [deleteAddressConfirm, setDeleteAddressConfirm] = useState<number | null>(null);

  // New address form (advisor adding address for client)
  const [newAddrOpen, setNewAddrOpen] = useState(false);
  const [newAddrSaving, setNewAddrSaving] = useState(false);
  const [newAddrZipLoading, setNewAddrZipLoading] = useState(false);
  const EMPTY_ADDR = { alias: '', recipientName: '', street: '', exteriorNumber: '', interiorNumber: '', neighborhood: '', city: '', state: '', zipCode: '', phone: '', reference: '', receptionHours: '' };
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

  // ── Cotizaciones formales (asesor) ──
  const [formalQuotesList, setFormalQuotesList] = useState<any[]>([]);
  const [formalQuoteDialogOpen, setFormalQuoteDialogOpen] = useState(false);
  const [quoteRequestOpen, setQuoteRequestOpen] = useState(false);
  const [formalQuoteClient, setFormalQuoteClient] = useState<any | null>(null);
  const [formalQuoteClients, setFormalQuoteClients] = useState<any[]>([]);
  const [formalQuoteServicio, setFormalQuoteServicio] = useState<'maritimo' | 'aereo' | 'pobox' | 'dhl'>('maritimo');
  const [formalQuoteSubservicio, setFormalQuoteSubservicio] = useState<string>('');
  const [formalQuoteCategoria, setFormalQuoteCategoria] = useState('Generico');
  const [formalQuoteLargo, setFormalQuoteLargo] = useState('');
  const [formalQuoteAncho, setFormalQuoteAncho] = useState('');
  const [formalQuoteAlto, setFormalQuoteAlto] = useState('');
  const [formalQuotePeso, setFormalQuotePeso] = useState('');
  const [formalQuoteCbm, setFormalQuoteCbm] = useState('');
  const [formalQuoteCantidad, setFormalQuoteCantidad] = useState('1');
  const [formalQuoteDescripcion, setFormalQuoteDescripcion] = useState('');
  const [formalQuoteCalcResult, setFormalQuoteCalcResult] = useState<any | null>(null);
  const [formalQuoteCalculating, setFormalQuoteCalculating] = useState(false);
  const [formalQuoteGexEnabled, setFormalQuoteGexEnabled] = useState(true);
  const [formalQuoteGexValor, setFormalQuoteGexValor] = useState('');
  const [formalQuoteGexCurrency, setFormalQuoteGexCurrency] = useState<'MXN' | 'USD'>('MXN');
  const [formalQuoteGexFallbackTc, setFormalQuoteGexFallbackTc] = useState<number>(0);
  const [formalQuoteTicketId, setFormalQuoteTicketId] = useState<number | null>(null);
  const [formalQuoteGenerating, setFormalQuoteGenerating] = useState(false);

  // Preferencias de notificaciones
  const [notifPrefs, setNotifPrefs] = useState({ whatsapp: true, push: true, air: true, maritime: true, dhl: true, pobox: true });
  const [notifLoading, setNotifLoading] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }>({
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

  const fetchShipments = useCallback(async (overrideFilter?: string) => {
    try {
      setShipmentsLoading(true);
      const params: any = { page: shipmentPage + 1, limit: 50 };
      if (shipmentSearch) params.search = shipmentSearch;
      const activeFilter = overrideFilter ?? shipmentFilter;
      if (activeFilter !== 'all') params.filter = activeFilter;
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

  const fetchPaymentOrders = useCallback(async () => {
    setPaymentOrdersLoading(true);
    try {
      const res = await api.get('/advisor/payment-orders');
      setPaymentOrders(res.data || []);
    } catch { /* silent */ } finally { setPaymentOrdersLoading(false); }
  }, []);

  const fetchNewOrderShipments = useCallback(async (clientId?: string) => {
    setNewOrderShipmentsLoading(true);
    try {
      const params: any = { filter: 'in_transit', limit: 200 };
      if (clientId && clientId !== 'all') params.clientId = clientId;
      const res = await api.get('/advisor/shipments', { params });
      setNewOrderShipments(res.data.shipments || []);
    } catch { /* silent */ } finally { setNewOrderShipmentsLoading(false); }
  }, []);

  const handleCreatePaymentOrder = async () => {
    if (newOrderSelectedUids.size === 0) return;
    setNewOrderSaving(true);
    try {
      const selected = newOrderShipments.filter(s => newOrderSelectedUids.has(s.uid));
      const first = selected[0];
      const autoTotal = selected.reduce((sum, s) =>
        sum + (s.amount || 0) + (s.nationalShippingCost || 0) + (s.serviceType === 'AA_DHL' ? 0 : (s.gexCost || 0)) + (s.extraChargesTotal || 0), 0);
      const total = autoTotal > 0 ? autoTotal : (parseFloat(newOrderManualTotal) || 0);
      const res = await api.post('/advisor/payment-orders', {
        client_id: first?.clientId,
        client_name: first?.clientName,
        client_box_id: first?.clientBoxId,
        package_uids: Array.from(newOrderSelectedUids),
        trackings: selected.map(s => s.internationalTracking || s.tracking || s.uid),
        notes: newOrderNotes || null,
        total_mxn: total > 0 ? total : null,
      });
      setNewOrderOpen(false);
      setNewOrderSelectedUids(new Set());
      setNewOrderNotes('');
      setNewOrderManualTotal('');
      setNewOrderClientId('');
      setSuccessOrderData({ ...res.data, client_name: first?.clientName, total_mxn: total });
      fetchPaymentOrders();
    } catch (e: any) {
      const errData = e?.response?.data;
      if (e?.response?.status === 409 && errData?.existing_refs?.length) {
        const refs = errData.existing_refs.join(', ');
        alert(`⚠️ ${errData.error}\n\nÓrden(es) existente(s): ${refs}\n\nBusca esa orden en la lista de Órdenes de Pago.`);
      } else {
        alert(errData?.error || 'Error al crear la orden');
      }
    } finally { setNewOrderSaving(false); }
  };

  const openProofModal = async (order: any) => {
    setProofModalOrder(order);
    setProofModalOpen(true);
    setProofUploadFile(null);
    setProofDeclaredAmount('');
    setProofModalItems([]);
    setProofModalLoading(true);
    try {
      const poboxId = order.pobox_payment_id || order.id;
      const res = await api.get(`/advisor/payment-orders/${poboxId}/proofs`);
      const items = Array.isArray(res.data?.proofs) ? res.data.proofs : [];
      setProofModalItems(items);
      if (items.length > 0 && items[0].declared_amount != null) {
        setProofDeclaredAmount(String(items[0].declared_amount));
      }
    } catch (error) {
      console.error('Error loading payment proofs:', error);
      setProofModalItems([]);
    } finally {
      setProofModalLoading(false);
    }
  };


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
    fetchUnidentified();
    api.get('/advisor/rates').then(r => {
      if (r.data?.success) setLiveRates(r.data.rates);
    }).catch(() => {});
  }, [fetchDashboard]);

  const openTransitModal = async () => {
    setTransitSearch('');
    setTransitModalOpen(true);
    setTransitClientsLoading(true);
    try {
      const r = await api.get('/advisor/clients', { params: { onlyInTransit: 'true', limit: 500 } });
      setTransitClients(
        (r.data.clients || [])
          .filter((c: any) => (c.inTransitCount ?? 0) > 0)
          .map((c: any) => ({
            id: c.id,
            name: c.fullName || '—',
            boxId: c.boxId || '',
            count: c.inTransitCount ?? 0,
          }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name))
      );
    } catch { setTransitClients([]); }
    setTransitClientsLoading(false);
  };

  const fetchUnidentified = async () => {
    setUnidentifiedLoading(true);
    try {
      const r = await api.get('/advisor/shipments?unidentified=true&limit=100');
      setUnidentifiedPkgs(r.data.shipments || []);
    } catch {}
    setUnidentifiedLoading(false);
  };

  const fetchPkgDetail = async (uid: string) => {
    setPkgDetailLoading(true);
    setPkgDetail(null);
    try {
      const r = await api.get(`/advisor/shipment/${encodeURIComponent(uid)}`);
      setPkgDetail(r.data);
    } catch {}
    setPkgDetailLoading(false);
  };

  const handleZipCodeChange = async (zip: string) => {
    setNewAddrForm(p => ({ ...p, zipCode: zip }));
    if (zip.length === 5) {
      setNewAddrZipLoading(true);
      try {
        const r = await api.get(`/zipcode/${zip}`);
        const d = r.data;
        // El backend devuelve `colonies` (campo principal) y `neighborhoods`
        // (alias). Aceptamos cualquiera por compatibilidad.
        const colonies: string[] = d?.colonies || d?.neighborhoods || [];
        if (d?.city || d?.state || colonies.length > 0) {
          setNewAddrForm(p => ({
            ...p,
            city: d.city || p.city,
            state: d.state || p.state,
            neighborhood: p.neighborhood || colonies[0] || '',
          }));
        }
      } catch {}
      setNewAddrZipLoading(false);
    }
  };

  const fetchAssignClients = async (search = '') => {
    setAssignClientsLoading(true);
    try {
      const r = await api.get(`/advisor/clients?limit=50&search=${encodeURIComponent(search)}`);
      setAssignClients(r.data.clients || []);
    } catch {}
    setAssignClientsLoading(false);
  };

  const handleAssignClient = async () => {
    if (!assignTarget || !assignSelectedClient) return;
    setAssigning(true);
    try {
      await api.put(`/advisor/packages/${assignTarget.id}/assign-client`, { clientId: assignSelectedClient.id });
      setUnidentifiedPkgs(prev => prev.filter(p => p.id !== assignTarget.id));
      setAssignTarget(null);
      setAssignSelectedClient(null);
      setAssignSearch('');
      setSnackbar({ open: true, message: `✅ Cliente ${assignSelectedClient.full_name || assignSelectedClient.name} asignado`, severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.error || 'Error al asignar', severity: 'error' });
    }
    setAssigning(false);
  };

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

  const tabConfig = useMemo(() => {
    // Indicadores tipo punto naranja en pestañas
    const hasNewClients = (dashboardData?.clients?.new7d || 0) > 0;
    const isActiveStatus = (s: string) => s !== 'resolved' && s !== 'closed';
    const ticketsNonQuote = advisorTickets.filter(t => t.category !== 'quote' && t.category !== 'quote_request');
    const ticketsQuote = advisorTickets.filter(t => t.category === 'quote' || t.category === 'quote_request');
    // sender_type del backend: 'agent' (asesor/admin) | 'client' | 'system'.
    // Consideramos "atendido por asesor" cualquier valor distinto de 'client'.
    const isClientSender = (s?: string | null) => s === 'client';
    const hasTicketResponses = ticketsNonQuote.some(t => isActiveStatus(t.status) && isClientSender(t.last_sender));
    // Solo mostrar punto naranja en Cotizaciones cuando la pelota esté del lado del asesor
    // (último mensaje del cliente, aún no cotizado / sin respuesta). Si el último ya es del asesor
    // (agent/system tras generar la cotización), se considera atendida.
    const hasPendingQuotes = ticketsQuote.some(t => isActiveStatus(t.status) && (!t.last_sender || isClientSender(t.last_sender)));

    const dotIcon = (icon: React.ReactNode, show: boolean) => (
      <Badge
        variant="dot"
        invisible={!show}
        overlap="circular"
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ '& .MuiBadge-badge': { bgcolor: '#F05A28', boxShadow: '0 0 0 2px #fff' } }}
      >
        {icon}
      </Badge>
    );

    const tabs = [
      { id: 'dashboard',    label: isMobile ? 'Inicio' : t('advisor.tabDashboard'), icon: <DashboardIcon />, shortLabel: 'Inicio' },
      { id: 'clients',      label: isMobile ? 'Clientes' : t('advisor.tabClients'), icon: dotIcon(<PeopleIcon />, hasNewClients), shortLabel: 'Clientes' },
      { id: 'instructions', label: 'Instrucciones', icon: <ShippingIcon />, shortLabel: 'Instrucciones' },
      ...(advisorPaymentOrderEnabled ? [{ id: 'payment_order', label: isMobile ? 'Pago' : 'Orden de Pago', icon: <MoneyIcon sx={{ color: 'inherit' }} />, shortLabel: 'Pago' }] : []),
      { id: 'commissions',  label: isMobile ? '$' : t('advisor.tabCommissions'), icon: <MoneyIcon />, shortLabel: 'Comisiones' },
      { id: 'tools',        label: isMobile ? 'Más' : t('advisor.tabTools'), icon: <ToolsIcon />, shortLabel: 'Herramientas' },
      { id: 'tickets',      label: isMobile ? 'Tickets' : 'Tickets', icon: dotIcon(<TicketIcon />, hasTicketResponses), shortLabel: 'Tickets' },
      { id: 'quotes',       label: isMobile ? 'Cotiz.' : 'Cotizaciones', icon: dotIcon(<QuoteIcon />, hasPendingQuotes), shortLabel: 'Cotizaciones' },
      ...(dashboardData && dashboardData.subAdvisors > 0
        ? [{ id: 'team', label: isMobile ? 'Equipo' : 'Mi Equipo', icon: <PeopleIcon />, shortLabel: 'Equipo' }]
        : []),
      // Xpay al final (lado derecho), con el logo X-Pay (slot xpay_full_black, fondo blanco del panel).
      ...(advisorXpayEnabled ? [{
        id: 'xpay',
        label: xpayLogoUrl
          ? <Box component="img" src={xpayLogoUrl} alt="X-Pay" sx={{ height: 22, objectFit: 'contain', display: 'block', borderRadius: 1 }} />
          : 'Xpay',
        icon: xpayLogoUrl ? undefined : <PaymentIcon sx={{ color: 'inherit' }} />,
        shortLabel: 'Xpay',
      }] : []),
    ];
    return tabs;
  }, [t, isMobile, dashboardData, advisorTickets, advisorPaymentOrderEnabled, advisorXpayEnabled, xpayLogoUrl]);

  // ID estable de la pestaña activa. Lo usamos como dependencia en los efectos
  // de carga para EVITAR un loop infinito: `tabConfig` cambia de referencia
  // cada vez que `advisorTickets` se actualiza (porque depende de él en el
  // useMemo de arriba). Si `tabConfig` fuese la dependencia, la secuencia
  // fetch → setAdvisorTickets → nuevo tabConfig → fetch volvería a dispararse
  // sin parar (causando "Mis Tickets" en carga eterna y parpadeando).
  const activeTabId = tabConfig[activeTab]?.id;

  // ── Navegación desde las tarjetas del Dashboard (por id de pestaña, robusto) ──
  const goToTab = (id: string) => {
    const i = tabConfig.findIndex(tb => tb.id === id);
    if (i >= 0) setActiveTab(i);
  };
  const goToClients = (filter: 'all' | 'verified' | 'pending' | 'unverified') => {
    setClientFilter(filter);
    setClientPage(0);
    goToTab('clients');
  };

  // Load data on tab change — use activeTabId to avoid hardcoded index issues
  useEffect(() => {
    if (activeTabId === 'instructions') {
      fetchShipments();
      if (clients.length === 0) {
        api.get('/advisor/clients', { params: { limit: 500 } })
          .then(res => { setClients(res.data.clients); setClientsTotal(res.data.total); })
          .catch(() => {});
      }
    }
    if (activeTabId === 'payment_order') {
      fetchPaymentOrders();
      if (clients.length === 0) {
        api.get('/advisor/clients', { params: { limit: 500 } })
          .then(res => { setClients(res.data.clients); setClientsTotal(res.data.total); })
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, fetchShipments, fetchPaymentOrders]);

  useEffect(() => {
    if (activeTabId === 'commissions') fetchCommissions();
  }, [activeTabId, fetchCommissions]);

  useEffect(() => {
    if (activeTabId === 'xpay') fetchXpayClients('');
  }, [activeTabId, fetchXpayClients]);

  useEffect(() => {
    if (activeTabId === 'tickets' || activeTabId === 'quotes') fetchAdvisorTickets();
    if (activeTabId === 'quotes') fetchFormalQuotesList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  // Carga inicial de tickets para mostrar puntos de notificación en pestañas
  useEffect(() => {
    fetchAdvisorTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTabId === 'team') fetchTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

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

  const SHIP_INSTR_SERVICES = [
    { type: 'china_air',  label: '✈️ Aéreo China',   icon: '✈️' },
    { type: 'china_sea',  label: '🚢 Marítimo China', icon: '🚢' },
    { type: 'usa_pobox',  label: '📦 PO Box USA',     icon: '📦' },
    { type: 'mx_cedis',   label: '📍 DHL Monterrey',  icon: '📍' },
  ];

  const handleOpenShipInstr = async (c: AdvisorClient) => {
    setShipInstrClient({ id: c.id, name: c.fullName, boxId: c.boxId || '' });
    setShipInstrServiceType('china_air');
    setShipInstrOpen(true);
    if (Object.keys(shipInstrAddresses).length === 0) {
      setShipInstrLoading(true);
      try {
        const results: Record<string, any> = {};
        await Promise.all(SHIP_INSTR_SERVICES.map(async (s) => {
          try {
            const res = await api.get(`/services/${s.type}/info`);
            if (res.data?.addresses?.length > 0) results[s.type] = res.data.addresses[0];
          } catch { /* ignore */ }
        }));
        setShipInstrAddresses(results);
      } finally {
        setShipInstrLoading(false);
      }
    }
  };

  const formatShipInstrText = (serviceType: string, address: any, clientName: string, boxId: string): string => {
    if (!address) return '';
    const suite = boxId || 'S-XXX';
    const name = clientName.toUpperCase();
    if (serviceType === 'usa_pobox') {
      const line = (address.address_line1 || '').replace(/\(S-Numero de Cliente\)/gi, suite);
      return `${name}\n${line}\n${address.city || ''}, ${address.state || ''} ${address.zip_code || ''}\nUSA`;
    } else if (serviceType === 'china_air' || serviceType === 'china_sea') {
      return `${address.address_line1 || ''}\n${address.address_line2 || ''}\nShipping Mark: ${suite}\n${address.contact_name || ''}\n${address.contact_phone || ''}`;
    } else {
      return `${address.address_line1 || ''}\n${address.city || ''}, ${address.state || ''} ${address.zip_code || ''}\nMéxico\nA nombre de: ${name} (${suite})`;
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

  // Servicios donde Paquete Express viene INCLUIDO en la tarifa base
  // (TDI Aéreo China y TDI Express) — no se cobra extra al cliente.
  const isPqtxIncludedService = (serviceType?: string | null): boolean => {
    if (!serviceType) return false;
    const s = String(serviceType).toUpperCase();
    return s === 'AIR_CHN_MX' || s === 'TDI_EXPRESS';
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

  const handleDeleteAddress = async (addressId: number) => {
    if (!addressesClient) return;
    try {
      await api.delete(`/advisor/clients/${addressesClient.id}/addresses/${addressId}`);
      setClientAddresses(prev => prev.filter(a => a.id !== addressId));
      setDeleteAddressConfirm(null);
      setSnackbar({ open: true, message: 'Dirección eliminada', severity: 'success' });
    } catch (err: any) {
      setSnackbar({ open: true, message: err?.response?.data?.error || 'Error al eliminar dirección', severity: 'error' });
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
    } catch (e: any) {
      // Mostrar el motivo real del backend (p. ej. "Número exterior demasiado largo").
      const msg = e?.response?.data?.error || e?.message || 'Error al agregar dirección';
      setSnackbar({ open: true, message: msg, severity: 'error' });
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
        if (res.data.available === false) {
          setInstrPriceEstimate({ price: 0, perBox: 0, boxes, days: '', available: false, noCoverage: true });
        } else {
          setInstrPriceEstimate({
            price: res.data.clientPrice, perBox: res.data.pricePerBox, boxes,
            days: res.data.estimatedDays || '2-4 días hábiles',
            type: res.data.type, available: true,
            usedZip: res.data.usedZip, nearestBranch: res.data.nearestBranch,
            branch: res.data.branch,
          });
        }
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
    if (preselected === 'paquete_express' && instrShipment && addr.zip_code && !isPqtxIncludedService(instrShipment.serviceType)) {
      fetchPqtxEstimate(addr.zip_code, instrShipment);
    }
  };

  const handleSelectInstrCarrier = (carrier: any, addrZip?: string) => {
    const newKey = instrCarrierKey === carrier.carrier_key ? '' : carrier.carrier_key;
    setInstrCarrierKey(newKey);
    setInstrIsCollect(newKey ? (carrier.allows_collect || false) : false);
    setInstrPriceEstimate(null);
    if (newKey === 'paquete_express' && instrShipment && !isPqtxIncludedService(instrShipment.serviceType)) {
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

      const ocurreZip = instrCarrierKey === 'paquete_express' && instrPriceEstimate?.type === 'ocurre' && instrPriceEstimate?.usedZip
        ? instrPriceEstimate.usedZip : null;

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
          if (ocurreZip) formData.append('nationalDeliveryZip', ocurreZip);
          if (instrFacturaFile) formData.append('factura', instrFacturaFile);
          if (instrGuiaFile) formData.append('guiaExterna', instrGuiaFile);
          return api.put(`/advisor/shipments/${uid}/instructions`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        }));
      } else {
        const body: any = { addressId: instrSelectedId };
        if (instrCarrierKey && serviceKey) { body.carrierKey = instrCarrierKey; body.serviceKey = serviceKey; }
        if (ocurreZip) body.nationalDeliveryZip = ocurreZip;
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
    const msg = `¡Hola! Te invito a usar EntregaX para tus envíos internacionales. Regístrate aquí: ${link}`;
    navigator.clipboard.writeText(msg);
    setSnackbar({ open: true, message: '✅ Enlace de referido copiado al portapapeles', severity: 'success' });
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

  // --- Subir guías de paquetería nacional ---
  const [nationalGuideShipment, setNationalGuideShipment] = useState<AdvisorShipment | null>(null);
  const [nationalGuideFiles, setNationalGuideFiles] = useState<File[]>([]);
  const [nationalGuideUploading, setNationalGuideUploading] = useState(false);
  const submitNationalGuide = async () => {
    if (!nationalGuideShipment || nationalGuideFiles.length === 0) return;
    setNationalGuideUploading(true);
    try {
      const fd = new FormData();
      nationalGuideFiles.forEach((f) => fd.append('files', f));
      const base = nationalGuideShipment.serviceType === 'SEA_CHN_MX' ? 'maritime'
        : nationalGuideShipment.serviceType === 'AA_DHL' ? 'dhl'
        : 'packages';
      await api.post(`/${base}/${nationalGuideShipment.id}/national-guide`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSnackbar({ open: true, message: '✅ Guía subida. Ya está disponible para imprimir la etiqueta.', severity: 'success' });
      setNationalGuideShipment(null);
      setNationalGuideFiles([]);
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.error || 'No se pudo subir la guía', severity: 'error' });
    } finally {
      setNationalGuideUploading(false);
    }
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
      // Estatus marítimos (maritime_orders / china_sea)
      'customs_mx': { label: 'En aduana', color: 'warning' },
      'customs_cleared': { label: 'Liberado de aduana', color: 'info' },
      'received_cdmx': { label: 'Recibido CDMX', color: 'primary' },
      'pending_api': { label: 'Procesando', color: 'info' },
    };
    const s = map[status] || { label: status, color: 'default' as const };
    return <Chip label={s.label} color={s.color} size="small" />;
  };

  // ─── KPI Card ───

  const KpiCard = ({ title, value, subtitle, icon, color, trend, onClick }: {
    title: string; value: string | number; subtitle?: string;
    icon: React.ReactNode; color: string; trend?: number; onClick?: () => void;
  }) => (
    <Card
      sx={{ height: '100%', position: 'relative', overflow: 'visible', cursor: onClick ? 'pointer' : 'default', '&:hover': onClick ? { boxShadow: 4 } : {} }}
      onClick={onClick}
    >
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

          {/* Tarifas y TC en vivo */}
          {liveRates && (
            <Paper elevation={0} sx={{ mb: isMobile ? 2 : 3, borderRadius: 2.5, border: '1px solid #F0E8E0', overflow: 'hidden' }}>
              {/* Header strip */}
              <Box sx={{ px: 2, py: 1, background: 'linear-gradient(135deg, #F05A28 0%, #C94A1E 100%)', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.7)', animation: 'pulse 2s infinite' }} />
                <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#fff', letterSpacing: 1, textTransform: 'uppercase' }}>
                  Tarifas y TC en vivo
                </Typography>
              </Box>
              {/* Values */}
              <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 2 : 3}, 1fr)`, px: 2, py: 1.5 }}>
                {[
                  { label: 'TDI Aéreo', value: liveRates.precio_tdi_aereo_usd, unit: 'USD / kg', icon: '✈️' },
                  { label: 'TDI Express', value: liveRates.precio_tdi_express_usd, unit: 'USD / kg', icon: '🚚' },
                  { label: 'TC Envío $', value: liveRates.tc_envio_dinero, unit: 'MXN / USD', icon: '💱' },
                ].map((item, i) => (
                  <Box key={item.label} sx={{
                    px: 1.5, py: 1,
                    borderLeft: i > 0 ? '1px solid #F0E8E0' : 'none',
                  }}>
                    <Typography sx={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 600, mb: 0.25 }}>
                      {item.icon} {item.label}
                    </Typography>
                    <Typography sx={{ fontWeight: 900, fontSize: isMobile ? '1.15rem' : '1.35rem', color: item.value != null ? '#0F172A' : '#CBD5E1', lineHeight: 1.1 }}>
                      {item.value != null ? `$${item.value.toFixed(2)}` : '—'}
                    </Typography>
                    <Typography sx={{ fontSize: '0.63rem', color: '#B0BEC5', mt: 0.25 }}>{item.unit}</Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          )}

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
                onClick={() => goToClients('verified')}
              />
            </Grid>
            <Grid size={ { xs: 6, sm: 6, md: 3 } }>
              <KpiCard
                title={isMobile ? 'Activos' : t('advisor.activeClients')}
                value={d.clients.active}
                subtitle={`${d.clients.dormant} ${isMobile ? 'dorm.' : t('advisor.dormantLower')}`}
                icon={<SpeedIcon />}
                color={theme.palette.success.main}
                onClick={() => goToClients('all')}
              />
            </Grid>
            <Grid size={ { xs: 6, sm: 6, md: 3 } }>
              <KpiCard
                title={isMobile ? 'En Tránsito' : t('advisor.shipmentsInTransit')}
                value={d.shipments.inTransit}
                subtitle={`${d.shipments.awaitingPayment} ${isMobile ? 'x pagar' : t('advisor.awaitingPaymentLower')}`}
                icon={<ShippingIcon />}
                color={theme.palette.warning.main}
                onClick={openTransitModal}
              />
            </Grid>
            <Grid size={ { xs: 6, sm: 6, md: 3 } }>
              <KpiCard
                title={isMobile ? 'Vol. Mes' : t('advisor.monthVolume')}
                value={isMobile ? `$${Math.round(d.commissions.monthVolumeMxn / 1000)}k` : formatMXN(d.commissions.monthVolumeMxn)}
                subtitle={`${d.commissions.monthPaidCount} ${isMobile ? 'paq.' : t('advisor.paidPackages')}`}
                icon={<MoneyIcon />}
                color={theme.palette.info.main}
                onClick={() => goToTab('commissions')}
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
                <CardActionArea onClick={() => goToClients('pending')} sx={{ p: 1.5 }}>
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
                <CardActionArea onClick={() => goToTab('payment_order')} sx={{ p: 1.5 }}>
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
                <CardActionArea onClick={() => copyReferralLink()} sx={{ p: 1.5 }}>
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
                <CardActionArea onClick={() => goToClients('pending')} sx={{ p: 2.5, height: '100%' }}>
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
                <CardActionArea onClick={() => goToTab('payment_order')} sx={{ p: 2.5, height: '100%' }}>
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
                <CardActionArea onClick={() => copyReferralLink()} sx={{ p: 2.5, height: '100%' }}>
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

          {/* Guías sin identificar — tarjeta compacta */}
          {isMobile ? (
            <Card sx={{ minWidth: 140, flexShrink: 0, mb: 2 }}>
              <CardActionArea onClick={() => { setUnidentifiedModalOpen(true); fetchAssignClients(); }} sx={{ p: 1.5 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <Avatar sx={{ bgcolor: alpha('#9C27B0', 0.1), color: '#9C27B0', width: 40, height: 40 }}>
                    {unidentifiedLoading ? <CircularProgress size={18} sx={{ color: '#9C27B0' }} /> : <UnidentifiedIcon sx={{ fontSize: '1.2rem' }} />}
                  </Avatar>
                  <Typography variant="h6" fontWeight={700}>{unidentifiedPkgs.length}</Typography>
                  <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ lineHeight: 1.2 }}>Sin Identificar</Typography>
                </Box>
              </CardActionArea>
            </Card>
          ) : (
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12 }}>
                <Card>
                  <CardActionArea onClick={() => { setUnidentifiedModalOpen(true); fetchAssignClients(); }} sx={{ p: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Avatar sx={{ bgcolor: alpha('#9C27B0', 0.1), color: '#9C27B0' }}>
                        {unidentifiedLoading ? <CircularProgress size={20} sx={{ color: '#9C27B0' }} /> : <UnidentifiedIcon />}
                      </Avatar>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="h6" fontWeight={600}>{unidentifiedPkgs.length}</Typography>
                        <Typography variant="body2" color="text.secondary">Guías sin identificar · Click para ver y asignar cliente</Typography>
                      </Box>
                      <AssignIcon sx={{ color: '#9C27B0', opacity: 0.6 }} />
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

          {/* ── Modal: Embarques en Tránsito ── */}
          <Dialog open={transitModalOpen} onClose={() => setTransitModalOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ShippingIcon sx={{ color: theme.palette.warning.main }} />
                <Typography fontWeight={700}>Embarques en Tránsito</Typography>
                <Chip label={transitClients.reduce((a, c) => a + c.count, 0)} size="small" sx={{ bgcolor: theme.palette.warning.main, color: '#fff', fontWeight: 700 }} />
              </Box>
              <IconButton onClick={() => setTransitModalOpen(false)} size="small"><CloseIcon /></IconButton>
            </DialogTitle>
            <DialogContent dividers sx={{ p: 0 }}>
              <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <TextField
                  fullWidth size="small" placeholder="Buscar cliente..."
                  value={transitSearch}
                  onChange={e => setTransitSearch(e.target.value)}
                  InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 18 }} /> }}
                />
              </Box>
              {transitClientsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
              ) : transitClients.filter(c => !transitSearch || c.name.toLowerCase().includes(transitSearch.toLowerCase()) || c.boxId.toLowerCase().includes(transitSearch.toLowerCase())).length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
                  <ShippingIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                  <Typography>Sin embarques en tránsito</Typography>
                </Box>
              ) : (
                <List disablePadding>
                  {transitClients
                    .filter(c => !transitSearch || c.name.toLowerCase().includes(transitSearch.toLowerCase()) || c.boxId.toLowerCase().includes(transitSearch.toLowerCase()))
                    .map((c, i) => (
                      <ListItem
                        key={c.id}
                        divider={i < transitClients.length - 1}
                        secondaryAction={
                          <Chip label={`${c.count} ${c.count === 1 ? 'caja' : 'cajas'}`} size="small" sx={{ bgcolor: '#E3F2FD', color: '#1565C0', fontWeight: 700 }} />
                        }
                        sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                        onClick={() => {
                          setTransitModalOpen(false);
                          setShipmentFilter('in_transit');
                          setShipmentClientId(String(c.id));
                          setShipmentPage(0);
                          const instrIdx = tabConfig.findIndex(t => t.id === 'instructions');
                          if (instrIdx >= 0) setActiveTab(instrIdx);
                        }}
                      >
                        <ListItemText
                          primary={<Typography fontWeight={600}>{c.name}</Typography>}
                          secondary={c.boxId || '—'}
                        />
                      </ListItem>
                    ))}
                </List>
              )}
            </DialogContent>
          </Dialog>

          {/* ── Modal: Lista de guías sin identificar ── */}
          <Dialog open={unidentifiedModalOpen} onClose={() => setUnidentifiedModalOpen(false)} maxWidth="md" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <UnidentifiedIcon sx={{ color: '#9C27B0' }} />
                <Typography fontWeight={700}>Sin Identificar</Typography>
                <Chip label={unidentifiedPkgs.length} size="small" sx={{ bgcolor: '#9C27B0', color: '#fff', fontWeight: 700 }} />
              </Box>
              <IconButton size="small" onClick={fetchUnidentified}><RefreshIcon fontSize="small" /></IconButton>
            </DialogTitle>
            <DialogContent dividers sx={{ p: 0 }}>
              <Box sx={{ px: 2, pt: 2, pb: 1 }}>
                <TextField
                  fullWidth size="small" placeholder="Buscar por tracking o descripción..."
                  value={unidentifiedSearch}
                  onChange={e => setUnidentifiedSearch(e.target.value)}
                  InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> }}
                />
              </Box>
              {unidentifiedLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Tracking</TableCell>
                      <TableCell>Descripción</TableCell>
                      <TableCell>Guía Origen</TableCell>
                      <TableCell>Estado</TableCell>
                      <TableCell align="center">Acción</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {unidentifiedPkgs
                      .filter(p => {
                        const q = unidentifiedSearch.toLowerCase();
                        return !q || (p.tracking || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
                      })
                      .map(pkg => (
                        <TableRow key={pkg.id} hover>
                          <TableCell>
                            <Typography
                              variant="body2" fontWeight={600}
                              sx={{ color: '#9C27B0', cursor: 'pointer', textDecoration: 'underline', '&:hover': { color: '#7B1FA2' } }}
                              onClick={() => fetchPkgDetail(pkg.uid || `PKG-${pkg.id}`)}
                            >
                              {pkg.tracking || pkg.tracking_number || `PKG-${pkg.id}`}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {pkg.service_type || 'POBOX_USA'}{pkg.description ? ` · ${pkg.description}` : ''}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {(pkg.carrier_tracking || pkg.carrier_name) ? (
                              <Box>
                                {pkg.carrier_tracking && (
                                  <Typography variant="caption" fontFamily="monospace" display="block">{pkg.carrier_tracking}</Typography>
                                )}
                                {pkg.carrier_name && (
                                  <Typography variant="caption" color="text.secondary">{pkg.carrier_name}</Typography>
                                )}
                              </Box>
                            ) : (
                              <Typography variant="caption" color="text.disabled">—</Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Chip label={pkg.status || 'received'} size="small" sx={{ bgcolor: alpha('#9C27B0', 0.1), color: '#9C27B0', fontSize: '0.7rem' }} />
                          </TableCell>
                          <TableCell align="center">
                            <Button
                              size="small" variant="contained" startIcon={<AssignIcon />}
                              onClick={() => { setAssignTarget(pkg); setAssignSearch(''); setAssignSelectedClient(null); }}
                              sx={{ bgcolor: '#9C27B0', '&:hover': { bgcolor: '#7B1FA2' }, textTransform: 'none', fontSize: '0.75rem' }}
                            >
                              Asignar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    {unidentifiedPkgs.length === 0 && (
                      <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>No hay guías sin identificar</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setUnidentifiedModalOpen(false)} sx={{ color: '#666' }}>Cerrar</Button>
            </DialogActions>
          </Dialog>

          {/* ── Modal: Asignar cliente a un paquete ── */}
          <Dialog open={!!assignTarget} onClose={() => { setAssignTarget(null); setAssignSelectedClient(null); setAssignSearch(''); }} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ bgcolor: '#9C27B0', color: '#fff', pb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AssignIcon />
                <Box>
                  <Typography fontWeight={700} variant="body1">Asignar Cliente</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.85 }}>{assignTarget?.tracking || assignTarget?.tracking_number}</Typography>
                </Box>
              </Box>
            </DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
              <TextField
                fullWidth size="small" placeholder="Buscar cliente..."
                value={assignSearch}
                onChange={e => { setAssignSearch(e.target.value); fetchAssignClients(e.target.value); }}
                InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> }}
                sx={{ mb: 2, mt: 1 }}
              />
              {assignClientsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
              ) : (
                <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
                  {assignClients.map(c => (
                    <Box
                      key={c.id}
                      onClick={() => setAssignSelectedClient(c)}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5,
                        borderRadius: 1.5, cursor: 'pointer', mb: 0.5,
                        border: '2px solid',
                        borderColor: assignSelectedClient?.id === c.id ? '#9C27B0' : 'transparent',
                        bgcolor: assignSelectedClient?.id === c.id ? alpha('#9C27B0', 0.06) : 'transparent',
                        '&:hover': { bgcolor: alpha('#9C27B0', 0.04) },
                      }}
                    >
                      <Avatar sx={{ bgcolor: '#9C27B0', width: 36, height: 36, fontSize: '0.85rem' }}>
                        {(c.fullName || c.full_name || c.name || '?')[0].toUpperCase()}
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{c.fullName || c.full_name || c.name}</Typography>
                        <Typography variant="caption" color="text.secondary">Box: {c.boxId || c.box_id} · {c.email}</Typography>
                      </Box>
                    </Box>
                  ))}
                  {assignClients.length === 0 && !assignClientsLoading && (
                    <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 2 }}>No se encontraron clientes</Typography>
                  )}
                </Box>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 2, pb: 2 }}>
              <Button onClick={() => { setAssignTarget(null); setAssignSelectedClient(null); }} sx={{ color: '#666' }}>Cancelar</Button>
              <Button
                variant="contained" onClick={handleAssignClient}
                disabled={!assignSelectedClient || assigning}
                sx={{ bgcolor: '#9C27B0', '&:hover': { bgcolor: '#7B1FA2' } }}
              >
                {assigning ? <CircularProgress size={18} color="inherit" /> : 'Asignar cliente'}
              </Button>
            </DialogActions>
          </Dialog>

          {/* ── Modal: Detalle de paquete sin identificar ── */}
          <Dialog open={!!pkgDetail || pkgDetailLoading} onClose={() => { setPkgDetail(null); }} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography fontWeight={700}>{pkgDetail?.tracking_internal || 'Detalle del paquete'}</Typography>
              <IconButton size="small" onClick={() => setPkgDetail(null)}><CloseIcon fontSize="small" /></IconButton>
            </DialogTitle>
            <DialogContent dividers>
              {pkgDetailLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
              ) : pkgDetail ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {/* Foto */}
                  {pkgDetail.image_url ? (
                    <Box component="img" src={pkgDetail.image_url} alt="Foto de recepción"
                      onClick={() => window.open(pkgDetail.image_url!, '_blank')}
                      sx={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 2, border: '1px solid', borderColor: 'divider', cursor: 'pointer' }} />
                  ) : (
                    <Box sx={{ bgcolor: 'grey.100', borderRadius: 2, p: 3, textAlign: 'center', color: 'text.secondary' }}>
                      <Typography variant="body2">Sin foto de recepción</Typography>
                    </Box>
                  )}

                  {/* Guías */}
                  <Box>
                    <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Guías</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 0.5 }}>
                      <Box><Typography variant="caption" color="text.secondary">Guía Interna</Typography>
                        <Typography variant="body2" fontWeight={600} fontFamily="monospace">{pkgDetail.tracking_internal || '—'}</Typography></Box>
                      <Box><Typography variant="caption" color="text.secondary">Guía Proveedor/Origen</Typography>
                        <Typography variant="body2" fontWeight={600} fontFamily="monospace">{pkgDetail.tracking_provider || '—'}</Typography></Box>
                      {pkgDetail.origin_carrier && (
                        <Box><Typography variant="caption" color="text.secondary">Transportista</Typography>
                          <Typography variant="body2" fontWeight={600}>{pkgDetail.origin_carrier}</Typography></Box>
                      )}
                    </Box>
                  </Box>

                  {/* Detalles */}
                  <Box>
                    <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Detalles del paquete</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 0.5 }}>
                      {pkgDetail.weight && <Box><Typography variant="caption" color="text.secondary">Peso</Typography>
                        <Typography variant="body2" fontWeight={600}>{pkgDetail.weight} kg</Typography></Box>}
                      {pkgDetail.length_cm && pkgDetail.width_cm && pkgDetail.height_cm && (
                        <Box><Typography variant="caption" color="text.secondary">Dimensiones</Typography>
                          <Typography variant="body2" fontWeight={600}>{pkgDetail.length_cm} × {pkgDetail.width_cm} × {pkgDetail.height_cm} cm</Typography></Box>
                      )}
                      {pkgDetail.warehouse_location && <Box><Typography variant="caption" color="text.secondary">Ubicación en bodega</Typography>
                        <Typography variant="body2" fontWeight={600}>{pkgDetail.warehouse_location}</Typography></Box>}
                      {pkgDetail.description && <Box sx={{ gridColumn: '1 / -1' }}><Typography variant="caption" color="text.secondary">Descripción</Typography>
                        <Typography variant="body2">{pkgDetail.description}</Typography></Box>}
                    </Box>
                  </Box>
                </Box>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => { setPkgDetail(null); }} sx={{ color: '#666' }}>Cerrar</Button>
              {pkgDetail && (
                <Button
                  variant="contained" startIcon={<AssignIcon />}
                  onClick={() => {
                    const uid = pkgDetail.uid;
                    const matchPkg = unidentifiedPkgs.find(p => (p.uid || `PKG-${p.id}`) === uid);
                    if (matchPkg) { setAssignTarget(matchPkg); setAssignSearch(''); setAssignSelectedClient(null); }
                    setPkgDetail(null);
                  }}
                  sx={{ bgcolor: '#9C27B0', '&:hover': { bgcolor: '#7B1FA2' } }}
                >
                  Asignar cliente
                </Button>
              )}
            </DialogActions>
          </Dialog>
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
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
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
                  <Button
                    variant="outlined" size="small" fullWidth
                    onClick={() => handleOpenShipInstr(c)}
                    startIcon={<SendInstrIcon />}
                    sx={{ textTransform: 'none', fontSize: '0.75rem', borderColor: '#1976d2', color: '#1976d2', '&:hover': { bgcolor: '#e3f2fd' } }}
                  >
                    Instrucciones
                  </Button>
                  <Button
                    variant="outlined" size="small" fullWidth
                    onClick={() => setCsfClient({ id: c.id, name: c.fullName })}
                    startIcon={<InvoiceIcon />}
                    sx={{ textTransform: 'none', fontSize: '0.75rem', borderColor: '#2e7d32', color: '#2e7d32', '&:hover': { bgcolor: '#e8f5e9' } }}
                  >
                    CSF
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
                  <TableCell align="center">Sin Instr.</TableCell>
                  <TableCell align="center">{t('advisor.inTransitShort')}</TableCell>
                  <TableCell align="center">Pdte. Pago</TableCell>
                  <TableCell align="right">Saldo Pdte.</TableCell>
                  <TableCell>{t('advisor.lastShipment')}</TableCell>
                  <TableCell align="center">Direcciones</TableCell>
                  <TableCell align="center">Datos Fiscales</TableCell>
                  <TableCell align="center">CSF</TableCell>
                  <TableCell align="center">Cartera</TableCell>
                  <TableCell align="center">Instrucciones</TableCell>
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
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                          <Typography variant="body2" fontWeight={600}>{c.fullName}</Typography>
                          <Chip label={c.boxId || '—'} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }} />
                        </Box>
                        <Typography variant="caption" color="text.secondary">{c.email}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                          {c.phone && (
                            <>
                              <Tooltip title={t('advisor.callClient')}>
                                <IconButton size="small" href={`tel:${c.phone}`}
                                  sx={{ bgcolor: '#FFF1EC', color: '#F05A28', '&:hover': { bgcolor: '#F05A28', color: '#fff' }, width: 28, height: 28 }}>
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
                            </>
                          )}
                          {getVerificationChip(c.identityVerified, c.verificationStatus)}
                        </Box>
                      </Box>
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
                      <Tooltip title="Ver y administrar direcciones">
                        <Button variant="outlined" size="small"
                          onClick={() => handleViewAddresses(c.id, c.fullName)}
                          startIcon={<LocationIcon />}
                          sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 700, py: 0.5, px: 1.5, borderRadius: 2, borderWidth: 1.5, minWidth: 92, color: '#1A1A1A', borderColor: '#1A1A1A', bgcolor: '#fff', '&:hover': { borderWidth: 1.5, bgcolor: '#1A1A1A', color: '#fff', borderColor: '#1A1A1A' } }}>
                          Dirs
                        </Button>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Ver y agregar datos fiscales (CFDI)">
                        <Button variant="outlined" size="small"
                          onClick={() => openFiscalManager({ id: c.id, name: c.fullName })}
                          startIcon={<InvoiceIcon />}
                          sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 700, py: 0.5, px: 1.5, borderRadius: 2, borderWidth: 1.5, minWidth: 92, color: '#F05A28', borderColor: '#F05A28', bgcolor: '#fff', '&:hover': { borderWidth: 1.5, bgcolor: '#F05A28', color: '#fff', borderColor: '#F05A28' } }}>
                          Fiscal
                        </Button>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Constancia de Situación Fiscal del cliente">
                        <Button variant="outlined" size="small"
                          onClick={() => setCsfClient({ id: c.id, name: c.fullName })}
                          startIcon={<InvoiceIcon />}
                          sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 700, py: 0.5, px: 1.5, borderRadius: 2, borderWidth: 1.5, minWidth: 92, color: '#2e7d32', borderColor: '#2e7d32', bgcolor: '#fff', '&:hover': { borderWidth: 1.5, bgcolor: '#2e7d32', color: '#fff', borderColor: '#2e7d32' } }}>
                          CSF
                        </Button>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Ver Cartera">
                        <Button variant="contained" size="small" disableElevation
                          onClick={() => handleViewWallet(c.id)}
                          startIcon={<WalletIcon />}
                          sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 700, py: 0.5, px: 1.5, borderRadius: 2, minWidth: 92, color: '#fff', background: 'linear-gradient(135deg, #F05A28 0%, #C62828 100%)', boxShadow: '0 2px 6px rgba(240,90,40,0.35)', '&:hover': { background: 'linear-gradient(135deg, #D94D1F 0%, #A01E1E 100%)', boxShadow: '0 3px 8px rgba(198,40,40,0.4)' } }}>
                          Ver
                        </Button>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Enviar instrucciones de envío">
                        <Button variant="outlined" size="small"
                          onClick={() => handleOpenShipInstr(c)}
                          startIcon={<SendInstrIcon />}
                          sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 700, py: 0.5, px: 1.5, borderRadius: 2, borderWidth: 1.5, minWidth: 92, color: '#C62828', borderColor: '#C62828', bgcolor: '#fff', '&:hover': { borderWidth: 1.5, bgcolor: '#C62828', color: '#fff', borderColor: '#C62828' } }}>
                          Enviar
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

        {/* ── Dialog: Datos fiscales del cliente ── */}
        <Dialog
          open={fiscalClient !== null}
          onClose={() => { if (!fiscalSaving) setFiscalClient(null); }}
          maxWidth="sm"
          fullWidth
          PaperProps={{ sx: { borderRadius: 3 } }}
        >
          <DialogTitle sx={{ fontWeight: 700, pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <InvoiceIcon sx={{ color: '#7B1FA2' }} /> Datos fiscales — {fiscalClient?.name}
          </DialogTitle>
          <DialogContent dividers>
            {fiscalLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
            ) : fiscalAdding ? (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>
                  {fiscalProfiles.length > 0 ? 'Nuevos datos fiscales' : 'Datos fiscales del cliente'}
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                  <TextField size="small" label="Razón social" value={fiscalForm.razon_social} sx={{ gridColumn: '1 / -1' }}
                    onChange={(e) => setFiscalForm(p => ({ ...p, razon_social: e.target.value }))} />
                  <TextField size="small" label="RFC" value={fiscalForm.rfc}
                    onChange={(e) => setFiscalForm(p => ({ ...p, rfc: e.target.value.toUpperCase() }))} />
                  <TextField size="small" label="Código postal" value={fiscalForm.codigo_postal}
                    onChange={(e) => setFiscalForm(p => ({ ...p, codigo_postal: e.target.value }))} />
                  <TextField select size="small" label="Régimen fiscal" value={fiscalForm.regimen_fiscal}
                    onChange={(e) => setFiscalForm(p => ({ ...p, regimen_fiscal: e.target.value }))}>
                    {satRegimenes.map(r => <MenuItem key={r.clave} value={r.clave}>{r.clave} — {r.descripcion}</MenuItem>)}
                  </TextField>
                  <TextField select size="small" label="Uso CFDI" value={fiscalForm.uso_cfdi}
                    onChange={(e) => setFiscalForm(p => ({ ...p, uso_cfdi: e.target.value }))}>
                    {satUsos.map(u => <MenuItem key={u.clave} value={u.clave}>{u.clave} — {u.descripcion}</MenuItem>)}
                  </TextField>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
                  <Button size="small" variant="contained"
                    onClick={saveClientFiscalProfile}
                    disabled={fiscalSaving || !fiscalForm.razon_social || !fiscalForm.rfc || !fiscalForm.codigo_postal || !fiscalForm.regimen_fiscal}
                    startIcon={fiscalSaving ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
                    sx={{ bgcolor: '#7B1FA2', '&:hover': { bgcolor: '#6A1B9A' } }}>
                    {fiscalSaving ? 'Guardando…' : 'Guardar'}
                  </Button>
                  {fiscalProfiles.length > 0 && (
                    <Button size="small" onClick={() => setFiscalAdding(false)} disabled={fiscalSaving}>Cancelar</Button>
                  )}
                </Box>
              </>
            ) : (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Datos fiscales registrados
                  </Typography>
                  <Button size="small" startIcon={<AddIcon />} sx={{ color: '#7B1FA2' }}
                    onClick={() => { setFiscalForm(emptyFiscal); setFiscalAdding(true); }}>
                    Agregar
                  </Button>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {fiscalProfiles.map((p) => (
                    <Box key={p.id}
                      sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 2, border: '1px solid #E0E0E0' }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={700} noWrap>{p.razon_social}</Typography>
                        <Typography variant="caption" color="text.secondary">{p.rfc} · CP {p.codigo_postal} · Rég. {p.regimen_fiscal} · {p.uso_cfdi}</Typography>
                      </Box>
                      <Tooltip title="Eliminar">
                        <IconButton size="small" onClick={() => deleteClientFiscalProfile(p.id)}>
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ))}
                </Box>
              </>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setFiscalClient(null)} disabled={fiscalSaving}>Cerrar</Button>
          </DialogActions>
        </Dialog>

        {/* ── Dialog: CSF (Constancia de Situación Fiscal) del cliente ── */}
        <Dialog
          open={csfClient !== null}
          onClose={() => setCsfClient(null)}
          maxWidth="sm"
          fullWidth
          PaperProps={{ sx: { borderRadius: 3 } }}
        >
          <DialogTitle sx={{ fontWeight: 700, pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <InvoiceIcon sx={{ color: '#2e7d32' }} /> Constancia de Situación Fiscal — {csfClient?.name}
          </DialogTitle>
          <DialogContent dividers>
            {csfClient && (
              <CsfPanel
                mode="for-client"
                clientUserId={csfClient.id}
                title="Constancia de Situación Fiscal (CSF)"
              />
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setCsfClient(null)}>Cerrar</Button>
          </DialogActions>
        </Dialog>
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

  // ── Nueva Orden: servicio bloqueado según primer paquete seleccionado ──────
  const newOrderLockServiceType = useMemo(
    () => newOrderSelectedUids.size > 0
      ? (newOrderShipments.find(s => newOrderSelectedUids.has(s.uid))?.serviceType ?? null)
      : null,
    [newOrderSelectedUids, newOrderShipments]
  );
  const serviceTypeToFilterKey = (st: string | null): string => {
    if (!st) return 'all';
    if (/tdi.?express/i.test(st) || st === 'TDI_EXPRESS') return 'tdi_express';
    if (/dhl/i.test(st) || st === 'AA_DHL') return 'dhl';
    if (/air_chn/i.test(st) || st === 'AIR_CHN_MX') return 'air';
    if (/sea_chn/i.test(st) || st === 'SEA_CHN_MX') return 'sea';
    if (/pobox/i.test(st) || st === 'POBOX_USA') return 'pobox';
    return 'all';
  };
  // Filtro efectivo: usa el lock si hay selección, si no el manual
  const newOrderEffectiveFilter = newOrderLockServiceType
    ? serviceTypeToFilterKey(newOrderLockServiceType)
    : newOrderServiceFilter;
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
              <MenuItem value="AA_DHL">📦 DHL MTY</MenuItem>
              <MenuItem value="POBOX_USA">📮 PO Box USA</MenuItem>
              <MenuItem value="TDI_EXPRESS">🚚 TDI Express</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Status filter */}
        <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Estado:</Typography>
          {[
            { key: 'all',               label: 'Todos' },
            { key: 'in_transit',        label: '✈️ En Tránsito' },
            { key: 'ready_pickup',      label: '📦 Listo para recoger' },
            { key: 'delivered',         label: '✅ Entregados' },
          ].map(opt => (
            <Chip
              key={opt.key}
              label={opt.label}
              size="small"
              onClick={() => { setShipmentFilter(opt.key); setShipmentPage(0); }}
              variant={shipmentFilter === opt.key ? 'filled' : 'outlined'}
              color={shipmentFilter === opt.key ? 'primary' : 'default'}
              sx={{ cursor: 'pointer' }}
            />
          ))}
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
          <Table size="small" sx={{
            '& .MuiTableCell-root': { px: 0.75, py: 0.5 },
            '& .MuiTableCell-head': { fontSize: '0.72rem', fontWeight: 700, lineHeight: 1.15, whiteSpace: 'nowrap' },
            '& .MuiChip-root': { height: 22, fontSize: '0.68rem' },
            '& .MuiChip-label': { px: 0.75 },
          }}>
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
                <TableCell align="center">
                  <Tooltip title="Pago / Instrucciones / GEX / Cargos Extra">
                    <span>P · I · G · E</span>
                  </Tooltip>
                </TableCell>
                <TableCell align="center">Paquetería</TableCell>
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
                    {(() => {
                      const guiaOrigen = s.serviceType !== 'AA_DHL' ? String(s.internationalTracking || '').trim() : '';
                      // Subtítulo: si hay guía origen registrada, se muestra ésta;
                      // si no, la guía secundaria propia del servicio.
                      let subtitle = '';
                      if (s.serviceType === 'AA_DHL') {
                        subtitle = (s.internationalTracking && s.tracking && s.tracking !== s.internationalTracking) ? s.tracking : '';
                      } else if (guiaOrigen) {
                        subtitle = guiaOrigen;
                      } else if (s.serviceType === 'AIR_CHN_MX') {
                        subtitle = String(s.childNo || s.tracking || '').replace(/-\d+$/, '');
                      } else if (s.childNo) {
                        subtitle = s.childNo;
                      }
                      return (
                        <>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="body2" fontWeight={600}>
                              {s.serviceType === 'AA_DHL'
                                ? (s.internationalTracking || s.tracking || `#${s.id}`)
                                : s.serviceType === 'AIR_CHN_MX'
                                ? (s.childNo || s.internationalTracking || s.tracking || `#${s.id}`)
                                : (s.tracking || s.internationalTracking || `#${s.id}`)}
                            </Typography>
                            {s.isMaster && s.childrenCount > 0 && (
                              <Chip label={`${s.childrenCount} guías`} size="small" color="info" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} icon={<UnfoldMoreIcon sx={{ fontSize: 14 }} />} />
                            )}
                            {s.serviceType === 'SEA_CHN_MX' && (s.boxesCount || 0) > 0 && (
                              <Chip label={`${s.boxesCount} ${s.boxesCount === 1 ? 'caja' : 'cajas'}`} size="small" color="info" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} icon={<InventoryIcon sx={{ fontSize: 13 }} />} />
                            )}
                          </Box>
                          {subtitle && (
                            <Typography variant="caption" color="text.secondary" fontFamily="monospace">{subtitle}</Typography>
                          )}
                        </>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600} fontFamily="monospace">{s.clientBoxId || s.clientName}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    {getStatusLabel(s.status)}
                  </TableCell>
                  <TableCell>
                    <Chip 
                      size="small" 
                      variant="outlined"
                      label={
                        s.serviceType === 'AIR_CHN_MX' || s.serviceType === 'china_air' ? '✈️ TDI Aéreo' :
                        s.serviceType === 'SEA_CHN_MX' || s.serviceType === 'china_sea' ? '🚢 Marítimo' :
                        s.serviceType === 'AA_DHL' ? '📦 DHL' :
                        s.serviceType === 'POBOX_USA' ? '📮 POBox' :
                        s.serviceType === 'tdi_express' || s.serviceType === 'TDI_EXPRESS' ? '✈️ TDI DHL' :
                        s.serviceType || '—'
                      }
                      color={
                        s.serviceType === 'AIR_CHN_MX' || s.serviceType === 'china_air' ? 'primary' :
                        s.serviceType === 'SEA_CHN_MX' || s.serviceType === 'china_sea' ? 'info' :
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
                  {/* Columna combinada: Pago · Instrucciones · GEX · Cargos extra */}
                  <TableCell align="center">
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
                      {/* Pago */}
                      <Tooltip title={s.clientPaid ? 'Pagado' : s.amount > 0 ? 'Pago pendiente' : 'Sin cargo'}>
                        <Box sx={{ cursor: 'default', display: 'flex' }}>
                          {s.clientPaid ? (
                            <GppGoodIcon sx={{ fontSize: 20, color: '#2E7D32' }} />
                          ) : s.amount > 0 ? (
                            <GppBadIcon sx={{ fontSize: 20, color: '#C62828' }} />
                          ) : (
                            <GppGoodIcon sx={{ fontSize: 20, color: '#bbb' }} />
                          )}
                        </Box>
                      </Tooltip>
                      {/* Instrucciones */}
                      <Tooltip title={s.hasInstructions ? 'Instrucciones de entrega configuradas' : 'Sin instrucciones de entrega'}>
                        <Box sx={{ cursor: 'default', display: 'flex' }}>
                          {s.hasInstructions ? (
                            <CheckCircleIcon sx={{ fontSize: 20, color: '#2E7D32' }} />
                          ) : (
                            <WarningIcon sx={{ fontSize: 20, color: '#E65100' }} />
                          )}
                        </Box>
                      </Tooltip>
                      {/* GEX */}
                      <Tooltip title={s.hasGex ? 'Garantía Extendida (GEX) activa' : 'Sin Garantía Extendida'}>
                        <Box sx={{ cursor: 'default', display: 'flex', position: 'relative' }}>
                          <SecurityIcon sx={{ fontSize: 20, color: s.hasGex ? '#2E7D32' : '#bbb' }} />
                          {!s.hasGex && (
                            <Box sx={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, bgcolor: '#bbb', transform: 'rotate(-45deg)', borderRadius: 1 }} />
                          )}
                        </Box>
                      </Tooltip>
                      {/* Cargos extra */}
                      {(s.extraChargesTotal || 0) !== 0 && (
                        <Tooltip title={`Cargos extra: ${formatMXN(s.extraChargesTotal)}${s.extraChargesDesc ? ` — ${s.extraChargesDesc}` : ''}`}>
                          <Box sx={{ cursor: 'default', display: 'flex' }}>
                            <ExtraChargeIcon sx={{ fontSize: 20, color: '#C2410C' }} />
                          </Box>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    {s.deliveryCarrierName ? (
                      <Typography variant="caption" fontWeight={600} sx={{ fontSize: '0.7rem' }}>
                        {/^entregax\s+local/i.test(s.deliveryCarrierName) ? 'EntregaX' : s.deliveryCarrierName}
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{formatDate(s.createdAt)}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                    {advisorInstructionsEnabled && (
                      <Tooltip title={s.labelPrinted ? 'Etiqueta ya impresa — no se pueden modificar instrucciones' : 'Asignar instrucciones de entrega'}>
                        <span>
                          <IconButton
                            size="small"
                            disabled={s.labelPrinted}
                            onClick={() => handleOpenInstrDialog(s)}
                            sx={{ color: s.labelPrinted ? '#bdbdbd' : s.hasInstructions ? '#2E7D32' : '#E65100' }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </span>
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
                    {(s.serviceType === 'POBOX_USA' || s.serviceType === 'tdi_express' || s.serviceType === 'TDI_EXPRESS' || s.serviceType === 'AIR_CHN_MX' || s.serviceType === 'SEA_CHN_MX' || s.serviceType === 'AA_DHL' || s.serviceType === 'china_sea' || s.serviceType === 'china_air') && (
                      <Tooltip title="Subir guía(s) de paquetería nacional">
                        <IconButton
                          size="small"
                          onClick={() => { setNationalGuideShipment(s); setNationalGuideFiles([]); }}
                          sx={{ color: '#1A1A1A' }}
                        >
                          <UploadFileIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
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
          rowsPerPage={50}
          rowsPerPageOptions={[50]}
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
        />
      </Box>
    </Fade>
  );

  // ════════════════════════════════════
  // TAB 3: ORDEN DE PAGO
  // ════════════════════════════════════
  const STATUS_OP: Record<string, { label: string; color: 'default'|'warning'|'success'|'error'|'info' }> = {
    pendiente:          { label: 'Pendiente',    color: 'warning' },
    en_proceso:         { label: 'En proceso',   color: 'info'    },
    pagado:             { label: 'Pagado',       color: 'success' },
    cancelado:          { label: 'Cancelado',    color: 'error'   },
    pending:            { label: 'Pendiente',    color: 'warning' },
    pending_payment:    { label: 'Pendiente',    color: 'warning' },
    vouchers_submitted: { label: 'Comprobante',  color: 'info'    },
    vouchers_partial:   { label: 'Parcial',      color: 'info'    },
    completed:          { label: 'Pagado',       color: 'success' },
    paid:               { label: 'Pagado',       color: 'success' },
    expired:            { label: 'Expirado',     color: 'error'   },
  };

  const renderXpay = () => {
    const XO = '#FF6600';
    return (
    <Fade in timeout={400}>
      <Box>
        {/* ── HERO X-Pay (negro + naranja) ─────────────────────────── */}
        <Box sx={{
          position: 'relative', overflow: 'hidden', borderRadius: 3, mb: 2.5,
          background: 'linear-gradient(135deg, #08080a 0%, #15100c 55%, #1f0d00 100%)',
          border: '1px solid #2a2a2a',
          px: { xs: 2.5, md: 4 }, py: { xs: 2.5, md: 3.25 },
        }}>
          {/* glow naranja */}
          <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 55% 90% at 88% 50%, rgba(255,102,0,0.20) 0%, transparent 70%)' }} />
          {/* textura de rejilla */}
          <Box sx={{ position: 'absolute', inset: 0, opacity: 0.05, pointerEvents: 'none',
            backgroundImage: 'repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 38px),repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px 38px)' }} />

          <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap' }}>
            {xpayLogoWhiteUrl
              ? <Box component="img" src={xpayLogoWhiteUrl} alt="X-Pay" sx={{ height: { xs: 34, md: 44 }, objectFit: 'contain', filter: 'drop-shadow(0 6px 18px rgba(255,102,0,0.25))' }} />
              : <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: '1.7rem', letterSpacing: 1 }}>X-Pay</Typography>}
            <Box sx={{ flex: 1, minWidth: 220 }}>
              <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: { xs: '1.02rem', md: '1.18rem' }, lineHeight: 1.25 }}>
                Crea operaciones a nombre de tus clientes
              </Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.82rem', mt: 0.5 }}>
                El cliente da seguimiento al pago desde su X-Pay. Envíos de dinero seguros a China y Estados Unidos.
              </Typography>
            </Box>
          </Box>

          <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 1, mt: 2, flexWrap: 'wrap' }}>
            <Box sx={{ width: 34, height: 3, bgcolor: XO, borderRadius: 2 }} />
            <Box sx={{ width: 16, height: 3, bgcolor: '#C62828', borderRadius: 2, mr: 0.5 }} />
            {['CFDI 4.0', 'SWIFT/BIC', 'AES-256', 'PCI-DSS'].map((x) => (
              <Box key={x} sx={{ px: 1, py: 0.35, borderRadius: 1, border: '1px solid rgba(255,102,0,0.35)', bgcolor: 'rgba(255,102,0,0.08)' }}>
                <Typography sx={{ color: XO, fontWeight: 700, fontSize: '0.6rem', letterSpacing: 0.5 }}>{x}</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* ── Paso 1: seleccionar cliente (resaltado) ─────────────── */}
        {!xpayClient && (
          <Paper elevation={0} sx={{
            borderRadius: 3, mb: 2, overflow: 'hidden',
            border: `2px solid ${XO}`,
            boxShadow: '0 12px 34px rgba(255,102,0,0.14)',
          }}>
            <Box sx={{ bgcolor: '#08080a', px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ width: 26, height: 26, borderRadius: '50%', bgcolor: XO, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Typography sx={{ color: '#000', fontWeight: 900, fontSize: '0.85rem' }}>1</Typography>
              </Box>
              <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '0.96rem' }}>Selecciona el cliente</Typography>
            </Box>
            <Box sx={{ p: 2.5, bgcolor: '#fff' }}>
              <Autocomplete
                options={xpayClientOptions}
                loading={xpayClientsLoading}
                value={xpayClient}
                onChange={(_e, v) => setXpayClient(v)}
                getOptionLabel={(o) => `${o.box_id || '—'} · ${o.full_name || ''}`}
                isOptionEqualToValue={(o, v) => o.id === v.id}
                onInputChange={(_e, val, reason) => { if (reason === 'input') fetchXpayClients(val); }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Número de cliente o nombre"
                    placeholder="Ej. S1, S78, nombre…"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                        '& fieldset': { borderColor: 'rgba(0,0,0,0.18)' },
                        '&:hover fieldset': { borderColor: XO },
                        '&.Mui-focused fieldset': { borderColor: XO, borderWidth: 2 },
                      },
                      '& label.Mui-focused': { color: XO },
                    }}
                  />
                )}
                sx={{ maxWidth: 520 }}
              />
              <Typography sx={{ mt: 1.5, color: 'text.secondary', fontSize: '0.78rem' }}>
                Solo aparecen tus clientes asignados. Al elegirlo se abre el formulario de la operación X-Pay.
              </Typography>
            </Box>
          </Paper>
        )}

        {/* ── Paso 2: formulario de operación a nombre del cliente ── */}
        {xpayClient && (
          <Box>
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, px: 2, py: 1.25,
              borderRadius: 2, background: 'linear-gradient(135deg,#08080a 0%,#1a0f06 100%)',
              border: `1px solid ${XO}33`,
            }}>
              <Chip label={xpayClient.box_id || '—'} size="small" sx={{ bgcolor: XO, color: '#000', fontWeight: 800 }} />
              <Typography sx={{ color: '#fff', fontWeight: 700, flex: 1 }}>{xpayClient.full_name}</Typography>
              <Button size="small" onClick={() => setXpayClient(null)} sx={{ color: XO, textTransform: 'none', fontWeight: 700 }}>
                Cambiar cliente
              </Button>
            </Box>
            <EntangledPaymentRequest hideHeader lightTheme advisorClientId={xpayClient.id} key={xpayClient.id} />
          </Box>
        )}
      </Box>
    </Fade>
    );
  };

  const renderOrdenDePago = () => (
    <Fade in timeout={400}>
      <Box>
        {/* Header row */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box>
            <Typography variant="h6" fontWeight={800}>Órdenes de Pago</Typography>
            <Typography variant="caption" color="text.secondary">
              Gestiona las órdenes de pago de tus clientes para servicio de paquetería
            </Typography>
          </Box>
          {advisorPaymentOrderEnabled && (
            <Button
              variant="contained"
              startIcon={<span>💳</span>}
              onClick={() => { setNewOrderOpen(true); setNewOrderClientId(''); setNewOrderServiceFilter('all'); setNewOrderSearch(''); setNewOrderSelectedUids(new Set()); setNewOrderShipments([]); }}
              sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#C94A1E' }, fontWeight: 700, borderRadius: 2 }}
            >
              Nueva Orden CTZ
            </Button>
          )}
        </Box>

        {paymentOrdersLoading && <LinearProgress sx={{ mb: 1 }} />}

        {/* Orders table */}
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#111' }}>
                <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Referencia</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Cliente</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Guías</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 700 }} align="right">Monto</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 700 }} align="center">Estado</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 700 }} align="center">Origen</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Fecha</TableCell>
                <TableCell sx={{ color: '#fff', fontWeight: 700 }} align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paymentOrders.length === 0 && !paymentOrdersLoading && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                      <Typography fontSize="2rem">💳</Typography>
                      <Typography variant="body2">No hay órdenes de pago aún</Typography>
                      <Typography variant="caption">Haz clic en "Nueva Orden de Pago" para crear una</Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              )}
              {paymentOrders.map((op) => {
                const trackings: string[] = op.trackings || [];
                const uids: string[] = op.package_uids || [];
                const guideList = trackings.length > 0 ? trackings : uids;
                const rowKey = `${op.created_by}-${op.id}`;
                const isExpanded = expandedOrderIds.has(rowKey);
                const st = STATUS_OP[op.status] ?? { label: op.status, color: 'default' as const };
                const isClientCreated = op.created_by === 'client';
                const isPending = op.status === 'pendiente' || op.status === 'pending' || op.status === 'pending_payment';
                const ref = op.payment_reference || `#${op.id}`;
                // Solicitar factura: pagada y dentro de los 3 días posteriores al pago.
                const isPaidStatus = op.status === 'pagado' || op.status === 'completed' || op.status === 'paid';
                const yaFacturada = !!op.facturada;
                const facturaPendiente = !!op.requiere_factura && !yaFacturada; // ya solicitada (cliente o asesor), en pendientes por timbrar
                const canInvoice = isPaidStatus && !!op.paid_at &&
                  (Date.now() - new Date(op.paid_at).getTime()) <= 3 * 24 * 60 * 60 * 1000 &&
                  !yaFacturada && !facturaPendiente;

                const downloadPDF = async () => {
                  // Detalle de la orden (master + guías hijas + desglose). Usa el
                  // MISMO endpoint que la app del asesor para que el PDF se vea igual
                  // en todos los puntos de descarga.
                  let items: any[] = [];
                  let cb: any = {};
                  try {
                    const res = await api.get(`/advisor/payment-orders/${op.id}/detail`, { params: { source: op.created_by } });
                    items = Array.isArray(res.data?.items) ? res.data.items : [];
                    cb = res.data?.cost_breakdown || {};
                  } catch { /* fallback a solo trackings */ }

                  const fmt = (n: number) => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
                  const today = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
                  const bi = op.bank_info || {};
                  const banco = bi.banco || op.bank_name || '';
                  const clabe = bi.clabe || op.bank_clabe || '';
                  const beneficiario = bi.beneficiario || op.beneficiario || '';
                  const totalAmt = op.total_mxn ? Number(op.total_mxn) : 0;

                  const rows = items.length > 0 ? items : guideList.map((g) => ({ tracking: g, weight: 0, lengthCm: 0, widthCm: 0, heightCm: 0, tipo: '', total_boxes: 0, venta_mxn: 0, children: [] }));
                  let pkgRows = '';
                  rows.forEach((it: any, idx: number) => {
                    const dims = (it.lengthCm > 0 || it.widthCm > 0 || it.heightCm > 0) ? `${it.lengthCm}×${it.widthCm}×${it.heightCm} cm` : '—';
                    const tipo = it.total_boxes ? `${it.tipo} (${it.total_boxes} cajas)` : (it.tipo || '—');
                    pkgRows += `<tr>
                      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px">${idx + 1}</td>
                      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;font-weight:600">${it.tracking || guideList[idx] || '—'}</td>
                      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;text-align:center">${it.weight > 0 ? `${Number(it.weight).toFixed(1)} kg` : '—'}</td>
                      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;text-align:center">${dims}</td>
                      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;text-align:center">${tipo}</td>
                      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;text-align:right;font-weight:600">${fmt(it.venta_mxn)}</td>
                    </tr>`;
                    (it.children || []).forEach((c: any, ci: number) => {
                      const cdims = (c.lengthCm > 0 || c.widthCm > 0 || c.heightCm > 0) ? `${c.lengthCm}×${c.widthCm}×${c.heightCm} cm` : '—';
                      const nivel = c.n_level ? `<span style="background:#FEE2E2;color:#B91C1C;font-size:9px;padding:1px 5px;border-radius:3px;font-weight:700">${c.n_level}</span>` : '';
                      pkgRows += `<tr style="background:#FFF8F0">
                        <td style="padding:4px 8px;border-bottom:1px solid #F5E6D0;font-size:10px;color:#000">&nbsp;↳ ${ci + 1}</td>
                        <td style="padding:4px 8px;border-bottom:1px solid #F5E6D0;font-size:10px;font-family:monospace">${c.tracking || '—'} ${nivel}</td>
                        <td style="padding:4px 8px;border-bottom:1px solid #F5E6D0;font-size:10px;text-align:center">${c.weight > 0 ? `${Number(c.weight).toFixed(1)} kg` : '—'}</td>
                        <td style="padding:4px 8px;border-bottom:1px solid #F5E6D0;font-size:10px;text-align:center">${cdims}</td>
                        <td style="padding:4px 8px;border-bottom:1px solid #F5E6D0;font-size:10px;text-align:center">—</td>
                        <td style="padding:4px 8px;border-bottom:1px solid #F5E6D0;font-size:10px;text-align:right">${fmt(c.venta_mxn)}</td>
                      </tr>`;
                    });
                  });

                  // Filas de desglose dentro de la tabla (mismo formato que el PDF
                  // del cliente). PO Box queda en las filas por guía; estas tres + el
                  // PO Box reconcilian con el TOTAL.
                  const brkRow = (label: string, val: number, color?: string) => Number(val) !== 0 ? `<tr><td style="border-bottom:1px solid #f0f0f0"></td><td colspan="4" style="padding:5px 8px;border-bottom:1px solid #f0f0f0;font-size:11px;color:${color || '#000'}">${label}</td><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;font-size:11px;text-align:right;font-weight:600;color:${color || '#000'}">${fmt(val)}</td></tr>` : '';
                  const breakdownRows = brkRow('🚚 Paquetería (Envío Nacional)', Number(cb.paqueteria) || 0)
                    + brkRow('🛡️ GEX — Garantía Extendida', Number(cb.gex) || 0, '#2E7D32')
                    + brkRow('➕ Cargos Extra', Number(cb.extra) || 0, '#C2410C');

                  const CSS = `@page{margin:30px 40px;size:A4}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#000;font-size:12px;line-height:1.5}.header{display:flex;justify-content:space-between;align-items:center;padding-bottom:15px;border-bottom:3px solid #FF6B00;margin-bottom:20px}.logo-text{font-size:26px;font-weight:900;color:#FF6B00;letter-spacing:1px;line-height:1}.logo-sub{font-size:11px;color:#000;margin-top:3px}.company-info{text-align:right;font-size:10px;color:#000}.company-info strong{color:#000;font-size:11px}.title-bar{background:linear-gradient(135deg,#FF6B00,#E55A00);color:white;padding:12px 20px;border-radius:6px;margin-bottom:20px}.title-bar h1{font-size:16px;font-weight:700}.title-bar .ref{font-size:11px;opacity:.9;margin-top:2px}.section{margin-bottom:16px}.section-title{font-size:12px;font-weight:700;color:#FF6B00;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #FFE0C0}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px}.info-row{display:flex;gap:8px}.info-label{color:#000;font-size:11px;min-width:120px}.info-value{font-weight:600;font-size:11px;color:#000}table{width:100%;border-collapse:collapse;margin-top:6px}th{background:#F8F8F8;padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:#000;text-transform:uppercase;border-bottom:2px solid #FF6B00}th:last-child{text-align:right}.total-row td{padding:10px;font-weight:700;font-size:13px;border-top:2px solid #FF6B00;background:#FFF8F0}.payment-box{background:#F9FBF5;border:1px solid #C8E6C9;border-radius:8px;padding:16px;margin-top:8px}.bank-row{margin-bottom:4px;font-size:11px}.bank-label{color:#000;display:inline-block;min-width:100px}.bank-value{font-weight:700;color:#000}.warning-box{background:#FFF3E0;border-left:4px solid #FF9800;padding:10px 14px;margin-top:12px;border-radius:0 6px 6px 0;font-size:10px;color:#E65100}.instructions-box{background:#F3F8FF;border:1px solid #BBDEFB;border-radius:8px;padding:14px;margin-top:12px}.instructions-box h3{font-size:11px;color:#1565C0;margin-bottom:8px}.instructions-box ol{padding-left:18px;font-size:10px;color:#000}.instructions-box ol li{margin-bottom:4px}.footer{margin-top:24px;padding-top:12px;border-top:1px solid #ddd;font-size:9px;color:#000;text-align:center}.terms{margin-top:16px;padding:12px;background:#FAFAFA;border-radius:6px;font-size:8.5px;color:#000;line-height:1.6}.terms strong{color:#000}`;

                  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
                    <div class="header">
                      <div><div class="logo-text">EntregaX</div><div class="logo-sub">Paquetería Internacional</div></div>
                      <div class="company-info"><strong>ENTREGAX</strong><br>📍 Monterrey, Nuevo León, México<br>📧 contacto@entregax.com<br>🌐 www.entregax.com</div>
                    </div>
                    <div class="title-bar">
                      <h1>COTIZACIÓN DE SERVICIOS LOGÍSTICOS</h1>
                      <div class="ref">Folio de Referencia: <strong>${ref}</strong> &nbsp;|&nbsp; Fecha de Emisión: ${today}</div>
                    </div>
                    <div class="section">
                      <div class="section-title">1. Datos del Cliente</div>
                      <div class="info-grid">
                        <div class="info-row"><span class="info-label">Nombre / Razón Social:</span><span class="info-value">${op.client_name || '—'}</span></div>
                        <div class="info-row"><span class="info-label">Casillero:</span><span class="info-value">${op.client_box_id || '—'}</span></div>
                      </div>
                    </div>
                    <div class="section">
                      <div class="section-title">2. Detalle del Embarque</div>
                      <div class="info-grid">
                        <div class="info-row"><span class="info-label">Servicio:</span><span class="info-value">PO Box USA - Carga Aérea</span></div>
                        <div class="info-row"><span class="info-label">Origen:</span><span class="info-value">Estados Unidos</span></div>
                        <div class="info-row"><span class="info-label">Destino:</span><span class="info-value">Monterrey, N.L., México</span></div>
                        <div class="info-row"><span class="info-label">Paquetes:</span><span class="info-value">${rows.length} paquete(s)</span></div>
                      </div>
                    </div>
                    <div class="section">
                      <div class="section-title">3. Desglose de Costos (MXN)</div>
                      <table>
                        <thead><tr>
                          <th style="width:30px">#</th>
                          <th>Guía / Tracking</th>
                          <th style="text-align:center">Peso</th>
                          <th style="text-align:center">Medidas</th>
                          <th style="text-align:center">Paquetería</th>
                          <th style="text-align:right">Monto (MXN)</th>
                        </tr></thead>
                        <tbody>
                          ${pkgRows}
                          ${breakdownRows}
                          <tr class="total-row">
                            <td colspan="5" style="text-align:right;padding-right:10px">TOTAL A PAGAR:</td>
                            <td style="text-align:right;color:#E65100;font-size:14px">${fmt(totalAmt)} MXN</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    ${banco || clabe ? `
                    <div class="section">
                      <div class="section-title">💳 Instrucciones de Pago</div>
                      <p style="font-size:11px;color:#000;margin-bottom:8px">Para garantizar el despacho de su mercancía, le solicitamos realizar el pago correspondiente:</p>
                      <div class="payment-box">
                        <div class="bank-row"><span class="bank-label">Banco:</span> <span class="bank-value">${banco}</span></div>
                        <div class="bank-row"><span class="bank-label">Beneficiario:</span> <span class="bank-value">${beneficiario}</span></div>
                        <div class="bank-row"><span class="bank-label">CLABE:</span> <span class="bank-value">${clabe}</span></div>
                        <div class="bank-row"><span class="bank-label">Concepto / Referencia:</span> <span class="bank-value" style="color:#E65100;font-size:13px">${ref}</span></div>
                      </div>
                      <div class="warning-box">⚠️ Favor de realizar depósitos de no más de $90,000 pesos por depósito.</div>
                      <div style="background:#D32F2F;color:#fff;padding:14px 18px;margin-top:12px;border-radius:6px;text-align:center;font-size:12px;font-weight:700;letter-spacing:.3px">🚨 IMPORTANTE: Debe incluir el número de referencia <span style="background:#fff;color:#D32F2F;padding:2px 8px;border-radius:4px;font-size:14px">${ref}</span> en el concepto de pago. Sin esta referencia, su pago NO podrá ser acreditado.</div>
                    </div>` : ''}
                    <div class="section">
                      <div class="instructions-box">
                        <h3>📧 Confirmación de Pago</h3>
                        <ol>
                          <li>Una vez realizado el pago, ingrese a su portal en <strong>www.entregax.app</strong></li>
                          <li>Diríjase a la sección <strong>"Mis Cuentas por Pagar"</strong></li>
                          <li>Seleccione la opción <strong>"Órdenes de Pago"</strong></li>
                          <li>Envíe el comprobante de pago en formato PDF o JPG</li>
                          <li>Para depósitos en efectivo, puede tardar de <strong>24 a 48 horas</strong> en verse reflejado</li>
                        </ol>
                      </div>
                    </div>
                    <div class="terms"><strong>Términos y Condiciones:</strong><br>Los tiempos de tránsito son estimados y están sujetos a revisiones aduanales, clima y disponibilidad de espacio en aerolíneas/navieras. Los costos aduanales pueden variar según el dictamen final de la autoridad. Esta cotización no incluye almacenajes prolongados en destino ni maniobras especiales. Los precios están expresados en Moneda Nacional (MXN) y son válidos al momento de la emisión de este documento.</div>
                    <div class="footer">ENTREGAX &nbsp;|&nbsp; 📍 Monterrey, N.L., México &nbsp;|&nbsp; 📧 contacto@entregax.com &nbsp;|&nbsp; 🌐 www.entregax.com<br>Documento generado el ${today}. Este documento es una cotización informativa y no representa un comprobante fiscal.</div>
                  </body></html>`;

                  const printWindow = window.open('', '_blank');
                  if (printWindow) {
                    printWindow.document.write(html);
                    printWindow.document.close();
                    setTimeout(() => { printWindow.print(); }, 400);
                  }
                };

                return (
                  <>
                    <TableRow key={rowKey} hover sx={{ '& td': { borderBottom: isExpanded ? 'none' : undefined } }}>
                      <TableCell>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.82rem', color: '#F05A28' }}>
                          CTZ: {ref}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{op.client_name || '—'}</Typography>
                        <Typography variant="caption" color="text.secondary">{op.client_box_id}</Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            {guideList.length} guía{guideList.length !== 1 ? 's' : ''}
                          </Typography>
                          {guideList.length > 0 && (
                            <IconButton size="small" onClick={() => {
                              const willExpand = !expandedOrderIds.has(rowKey);
                              if (willExpand && !orderDetails[rowKey]) loadOrderDetail(op, rowKey);
                              setExpandedOrderIds(prev => {
                                const next = new Set(prev);
                                next.has(rowKey) ? next.delete(rowKey) : next.add(rowKey);
                                return next;
                              });
                            }}>
                              {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                            </IconButton>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        {op.total_mxn
                          ? <Typography fontWeight={700} color="warning.main">${Number(op.total_mxn).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Typography>
                          : <Typography color="text.disabled">—</Typography>}
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={st.label} color={st.color as any} size="small" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={isClientCreated ? 'Cliente' : 'Asesor'}
                          size="small" variant="outlined"
                          sx={{ fontSize: '0.65rem', borderColor: isClientCreated ? '#0288d1' : '#F05A28', color: isClientCreated ? '#0288d1' : '#F05A28' }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(op.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          <Tooltip title="Compartir por WhatsApp">
                            <IconButton size="small" sx={{ color: '#25D366' }} onClick={() => {
                              const ref   = op.payment_reference || op.folio || '—';
                              const name  = (op.client_name || '').split(' ')[0];
                              const mxn   = Number(op.total_mxn).toLocaleString('es-MX', { minimumFractionDigits: 2 });
                              const lines = [
                                `Hola ${name}! 👋`,
                                '',
                                `Tienes una orden de pago pendiente en *EntregaX*.`,
                                '',
                                `💰 Monto: *$${mxn} MXN*`,
                                `📋 Referencia: *${ref}*`,
                                '',
                                `Abre la app EntregaX → *Mis Pagos* para ver el desglose y realizar tu pago. 💳`,
                                '',
                                `📱 Si no tienes la app descárgala aquí:`,
                                `iOS → https://apps.apple.com/mx/app/entregax/id6443608707`,
                                `Android → https://play.google.com/store/apps/details?id=com.entregax.mobile`,
                              ];
                              window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
                            }}>
                              <WhatsAppIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Descargar orden PDF">
                            <IconButton size="small" onClick={downloadPDF}>
                              <DownloadIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {canInvoice && (
                            <Tooltip title="Solicitar factura">
                              <IconButton size="small" sx={{ color: '#7B1FA2' }} onClick={() => openInvoiceDialog(op)}>
                                <InvoiceIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {yaFacturada && op.factura_pdf && (
                            <Tooltip title="Descargar factura (PDF)">
                              <IconButton size="small" sx={{ color: '#C62828' }} onClick={() => window.open(op.factura_pdf, '_blank')}>
                                <InvoiceIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {yaFacturada && op.factura_xml && (
                            <Tooltip title="Descargar factura (XML)">
                              <IconButton size="small" sx={{ color: '#2E7D32' }} onClick={() => window.open(op.factura_xml, '_blank')}>
                                <DownloadIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Subir comprobante de pago">
                            <IconButton size="small" sx={{ color: '#0288d1' }} onClick={() => openProofModal(op)}>
                              <AttachFileIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {isPending && !isClientCreated && (
                            <Tooltip title="Cancelar orden">
                              <IconButton size="small" color="error" onClick={() => setCancelConfirmOrderId(op.id)}>
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (() => {
                      const detail = orderDetails[rowKey];
                      const items = detail?.items || [];
                      const fmtDims = (l: number, w: number, h: number) =>
                        (Number(l) > 0 || Number(w) > 0 || Number(h) > 0) ? `${l}×${w}×${h} cm` : '—';
                      // Aplanar: cada item; si tiene hijas, mostrar las hijas con peso/medidas
                      const rows: { tracking: string; weight: number; dims: string; nivel?: string | null; child?: boolean }[] = [];
                      for (const it of items) {
                        const kids = Array.isArray(it.children) ? it.children : [];
                        if (kids.length > 0) {
                          rows.push({ tracking: it.tracking, weight: Number(it.weight) || 0, dims: fmtDims(it.lengthCm, it.widthCm, it.heightCm) });
                          for (const c of kids) {
                            rows.push({ tracking: c.tracking, weight: Number(c.weight) || 0, dims: fmtDims(c.lengthCm, c.widthCm, c.heightCm), nivel: c.n_level, child: true });
                          }
                        } else {
                          rows.push({ tracking: it.tracking, weight: Number(it.weight) || 0, dims: fmtDims(it.lengthCm, it.widthCm, it.heightCm) });
                        }
                      }
                      return (
                        <TableRow key={`${rowKey}-exp`}>
                          <TableCell colSpan={8} sx={{ pt: 0, pb: 1, bgcolor: '#FAFAFA' }}>
                            <Box sx={{ px: 2, pb: 1 }}>
                              <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
                                Guías en esta orden:
                              </Typography>
                              {detail?.loading ? (
                                <Typography variant="caption" color="text.secondary">Cargando detalle…</Typography>
                              ) : rows.length > 0 ? (
                                <Table size="small" sx={{ '& td, & th': { py: 0.25, fontSize: '0.7rem', borderBottom: '1px solid #EEE' } }}>
                                  <TableHead>
                                    <TableRow>
                                      <TableCell>Guía / Tracking</TableCell>
                                      <TableCell align="center">Peso</TableCell>
                                      <TableCell align="center">Medidas</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {rows.map((r, i) => (
                                      <TableRow key={i} sx={r.child ? { bgcolor: '#FFF8F0' } : undefined}>
                                        <TableCell sx={{ fontFamily: 'monospace', pl: r.child ? 3 : 1 }}>
                                          {r.child ? '↳ ' : ''}{r.tracking}
                                          {r.nivel ? <Chip label={r.nivel} size="small" sx={{ ml: 0.5, height: 16, fontSize: '0.6rem', bgcolor: '#FEE2E2', color: '#B91C1C' }} /> : null}
                                        </TableCell>
                                        <TableCell align="center">{r.weight > 0 ? `${r.weight.toFixed(1)} kg` : '—'}</TableCell>
                                        <TableCell align="center">{r.dims}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              ) : (
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                  {guideList.map((g, i) => (
                                    <Chip key={i} label={g} size="small" sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }} />
                                  ))}
                                </Box>
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })()}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        {/* ── Dialog: Comprobante de Pago ── */}
        {(() => {
          const existingProof = proofModalItems[0] ?? null;
          const closeProofModal = () => { setProofModalOpen(false); setProofUploadFile(null); setProofDeclaredAmount(''); };
          const reloadProofs = async (orderId: number) => {
            const res = await api.get(`/advisor/payment-orders/${orderId}/proofs`);
            const items = Array.isArray(res.data?.proofs) ? res.data.proofs : [];
            setProofModalItems(items);
            if (items.length > 0 && items[0].declared_amount != null) setProofDeclaredAmount(String(items[0].declared_amount));
            else setProofDeclaredAmount('');
          };
          const handleDelete = async () => {
            if (!existingProof || !proofModalOrder) return;
            setProofModalLoading(true);
            try {
              const poboxId = proofModalOrder.pobox_payment_id || proofModalOrder.id;
              await api.delete(`/advisor/payment-orders/${poboxId}/proof/${existingProof.id}`);
              setProofModalItems([]);
              setProofDeclaredAmount('');
              setProofUploadFile(null);
              fetchPaymentOrders();
            } catch (e: any) {
              setSnackbar({ open: true, message: e?.response?.data?.error || 'No se pudo eliminar el comprobante', severity: 'error' });
            } finally {
              setProofModalLoading(false);
            }
          };
          const handleSave = async () => {
            if (!proofModalOrder || !proofDeclaredAmount) return;
            const orderId = proofModalOrder.pobox_payment_id || proofModalOrder.id;
            setProofModalLoading(true);
            try {
              if (proofUploadFile) {
                // Replace: delete old (if exists) then upload new
                if (existingProof) {
                  await api.delete(`/advisor/payment-orders/${orderId}/proof/${existingProof.id}`);
                }
                const formData = new FormData();
                formData.append('proof', proofUploadFile);
                formData.append('declared_amount', proofDeclaredAmount);
                await api.post(`/advisor/payment-orders/${orderId}/proof`, formData, {
                  headers: { 'Content-Type': 'multipart/form-data' },
                });
                setProofUploadFile(null);
                fetchPaymentOrders();
                closeProofModal();
                setSnackbar({ open: true, message: '✅ Comprobante subido correctamente', severity: 'success' });
                return;
              } else if (existingProof) {
                // Only update amount
                await api.patch(`/advisor/payment-orders/${orderId}/proof/${existingProof.id}`, {
                  declared_amount: proofDeclaredAmount,
                });
                await reloadProofs(orderId);
                fetchPaymentOrders();
                setSnackbar({ open: true, message: '✅ Monto actualizado', severity: 'success' });
              }
            } catch (error: any) {
              setSnackbar({ open: true, message: error?.response?.data?.error || 'No se pudo guardar el comprobante', severity: 'error' });
            } finally {
              setProofModalLoading(false);
            }
          };
          const canSave = !!(proofDeclaredAmount && (proofUploadFile || existingProof) && !proofModalLoading);
          return (
            <Dialog open={proofModalOpen} onClose={closeProofModal} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
              <DialogTitle sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                📎 Comprobante de Pago
                <IconButton size="small" onClick={closeProofModal}><CloseIcon /></IconButton>
              </DialogTitle>
              <DialogContent sx={{ pt: 1 }}>
                {proofModalOrder && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Orden: <strong>{proofModalOrder.payment_reference || `#${proofModalOrder.id}`}</strong> · {proofModalOrder.client_name}
                  </Typography>
                )}
                {proofModalLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={28} /></Box>
                ) : existingProof ? (
                  /* ── Comprobante existente ── */
                  <Box sx={{ border: '1px solid #e3f2fd', borderRadius: 2, p: 1.5, mb: 2, bgcolor: '#f0f8ff' }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>Comprobante actual:</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AttachFileIcon fontSize="small" sx={{ color: '#0288d1', flexShrink: 0 }} />
                      <Typography
                        variant="body2"
                        component="a"
                        href={existingProof.url || existingProof.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ color: '#0288d1', textDecoration: 'none', flexGrow: 1, '&:hover': { textDecoration: 'underline' } }}
                      >
                        {existingProof.filename || existingProof.file_name || 'Comprobante'}
                      </Typography>
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        onClick={handleDelete}
                        disabled={proofModalLoading}
                        sx={{ flexShrink: 0, fontSize: '0.7rem', py: 0.25 }}
                      >
                        Borrar
                      </Button>
                    </Box>
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Sin comprobante aún.</Typography>
                )}
                {/* Monto declarado */}
                <TextField
                  label="Monto declarado *"
                  type="number"
                  size="small"
                  fullWidth
                  sx={{ mb: 2 }}
                  value={proofDeclaredAmount}
                  onChange={e => setProofDeclaredAmount(e.target.value)}
                  InputProps={{ startAdornment: <Typography sx={{ mr: 0.5, color: 'text.secondary' }}>$</Typography> }}
                  placeholder="0.00"
                />
                {/* Upload area */}
                <Box sx={{ border: `1px dashed ${proofUploadFile ? '#F05A28' : '#ccc'}`, borderRadius: 2, p: 2, textAlign: 'center', bgcolor: '#FAFAFA' }}>
                  <input
                    id="proof-upload-input"
                    type="file"
                    accept="image/*,application/pdf"
                    style={{ display: 'none' }}
                    onChange={e => setProofUploadFile(e.target.files?.[0] ?? null)}
                  />
                  <label htmlFor="proof-upload-input" style={{ cursor: 'pointer' }}>
                    <UploadFileIcon sx={{ color: proofUploadFile ? '#F05A28' : '#0288d1', fontSize: 32, mb: 0.5 }} />
                    <Typography variant="body2" color="text.secondary">
                      {proofUploadFile
                        ? proofUploadFile.name
                        : existingProof
                          ? 'Haz clic para reemplazar el comprobante'
                          : 'Haz clic para seleccionar imagen o PDF'}
                    </Typography>
                  </label>
                </Box>
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={closeProofModal} color="inherit">Cerrar</Button>
                {!existingProof ? (
                  <Button
                    variant="contained"
                    disabled={!proofUploadFile || !proofDeclaredAmount || proofModalLoading}
                    sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#D94E20' } }}
                    onClick={handleSave}
                  >
                    Subir Comprobante
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    disabled={!canSave}
                    sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#D94E20' } }}
                    onClick={handleSave}
                  >
                    {proofUploadFile ? 'Reemplazar Comprobante' : 'Actualizar Monto'}
                  </Button>
                )}
              </DialogActions>
            </Dialog>
          );
        })()}

        {/* ── Dialog: Nueva Orden de Pago ── */}
        <Dialog open={newOrderOpen} onClose={() => setNewOrderOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
          <DialogTitle sx={{ bgcolor: '#F05A28', color: '#fff', fontWeight: 800 }}>
            💳 Nueva Orden CTZ
          </DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            {/* Filtros: cliente + servicio */}
            <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5, mt: 1 }}>
              <Autocomplete
                size="small"
                sx={{ flex: 2 }}
                options={clients}
                value={clients.find(c => String(c.id) === String(newOrderClientId)) || null}
                onChange={(_, v) => {
                  const id = v ? String(v.id) : '';
                  setNewOrderClientId(id);
                  setNewOrderSelectedUids(new Set());
                  if (id) fetchNewOrderShipments(id);
                  else setNewOrderShipments([]);
                }}
                getOptionLabel={(c) => c ? `${c.fullName} (${c.boxId})` : ''}
                isOptionEqualToValue={(o, v) => String(o.id) === String(v.id)}
                filterOptions={(opts, state) => {
                  const q = state.inputValue.trim().toLowerCase();
                  if (!q) return opts;
                  return opts.filter(c =>
                    (c.fullName || '').toLowerCase().includes(q) ||
                    (c.boxId || '').toLowerCase().includes(q) ||
                    (c.email || '').toLowerCase().includes(q)
                  );
                }}
                renderOption={(props, c) => (
                  <li {...props} key={c.id}>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{c.fullName}</Typography>
                      <Typography variant="caption" color="text.secondary">{c.boxId}{c.email ? ` · ${c.email}` : ''}</Typography>
                    </Box>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField {...params} label="Seleccionar cliente *" placeholder="Escribe nombre, casillero o email…" required />
                )}
                noOptionsText="Sin coincidencias"
              />
              <FormControl size="small" sx={{ flex: 1 }} disabled={!!newOrderLockServiceType}>
                <InputLabel>Servicio</InputLabel>
                <Select
                  value={newOrderEffectiveFilter}
                  label="Servicio"
                  onChange={(e) => {
                    setNewOrderServiceFilter(e.target.value);
                    setNewOrderSelectedUids(new Set());
                  }}
                  renderValue={(v) => {
                    if (newOrderLockServiceType) {
                      const labels: Record<string, string> = {
                        tdi_express: '🔒 TDX / TDI Express',
                        dhl:         '🔒 DHL',
                        air:         '🔒 TDI Aéreo',
                        sea:         '🔒 Marítimo',
                        pobox:       '🔒 PO Box USA',
                      };
                      return labels[v as string] ?? `🔒 ${v}`;
                    }
                    const labels: Record<string, string> = {
                      all: 'Todos', tdi_express: 'TDX / TDI Express',
                      dhl: 'DHL', air: 'TDI Aéreo', sea: 'Marítimo', pobox: 'PO Box USA',
                    };
                    return labels[v as string] ?? v;
                  }}
                >
                  <MenuItem value="all">Todos</MenuItem>
                  {entregaxPaymentsByService.pobox    && <MenuItem value="pobox">PO Box USA</MenuItem>}
                  {entregaxPaymentsByService.aereo    && <MenuItem value="tdi_express">TDX / TDI Express</MenuItem>}
                  {entregaxPaymentsByService.aereo    && <MenuItem value="air">TDI Aéreo</MenuItem>}
                  {entregaxPaymentsByService.maritimo && <MenuItem value="sea">Marítimo</MenuItem>}
                  {entregaxPaymentsByService.dhl      && <MenuItem value="dhl">DHL</MenuItem>}
                </Select>
              </FormControl>
            </Box>

            <TextField
              size="small" fullWidth placeholder="Buscar por número de guía..."
              value={newOrderSearch}
              onChange={e => setNewOrderSearch(e.target.value)}
              sx={{ mb: 1 }}
              InputProps={{ startAdornment: <span style={{ marginRight: 6, color: '#888' }}>🔍</span> }}
            />

            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Guías en tránsito del cliente. Solo se pueden seleccionar las que tienen instrucciones asignadas (✅). Deben ser del mismo servicio.
            </Typography>

            {!newOrderClientId ? (
              <Box sx={{ py: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, border: '1px dashed #E0E0E0', borderRadius: 2 }}>
                <Typography fontSize="2rem">👤</Typography>
                <Typography variant="body2" color="text.secondary">Selecciona un cliente para ver sus guías</Typography>
              </Box>
            ) : newOrderShipmentsLoading ? (
              <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress size={28} /></Box>
            ) : (() => {
              const SERVICE_MATCH: Record<string, (st: string) => boolean> = {
                tdi_express: st => /tdi.?express/i.test(st) || st === 'tdi_express',
                dhl:         st => /dhl/i.test(st) || st === 'AA_DHL',
                air:         st => /air_chn/i.test(st) || st === 'AIR_CHN_MX',
                sea:         st => /sea_chn/i.test(st) || st === 'SEA_CHN_MX',
                pobox:       st => /pobox/i.test(st) || st === 'POBOX_USA',
              };
              const searchTerm = newOrderSearch.trim().toLowerCase();
              const filteredShipments = newOrderShipments
                .filter(s => {
                  if (s.clientPaid) return false; // exclude already-paid
                  // Exclude services with payments disabled
                  const payKey = mapServiceKey(s.serviceType);
                  if (payKey && !entregaxPaymentsByService[payKey]) return false;
                  if (newOrderEffectiveFilter !== 'all' && !(SERVICE_MATCH[newOrderEffectiveFilter]?.(s.serviceType || '') ?? true)) return false;
                  if (searchTerm && !(
                    (s.tracking || '').toLowerCase().includes(searchTerm) ||
                    (s.internationalTracking || '').toLowerCase().includes(searchTerm)
                  )) return false;
                  return true;
                })
                .sort((a, b) => {
                  const rank = (s: typeof a) => {
                    if (s.inPaymentOrderRef) return 5;                                      // ya en orden → bottom
                    if ((s.amount || 0) === 0 && s.serviceType === 'SEA_CHN_MX') return 4; // pdte clasificación
                    if ((s.amount || 0) === 0) return 3;                                    // no monto
                    if (!s.hasInstructions) return 2;                                       // sin instrucciones
                    return 0;                                                               // selectable → top
                  };
                  return rank(a) - rank(b);
                });

              const lockedFirst = newOrderSelectedUids.size > 0
                ? newOrderShipments.find(x => newOrderSelectedUids.has(x.uid))
                : null;
              const lockClientId  = lockedFirst?.clientId ?? null;
              const lockServiceType = lockedFirst?.serviceType ?? null;

              const serviceLabel = (st: string) =>
                /tdi.?express/i.test(st) || st === 'tdi_express' ? '🚚 TDX'
                : /dhl/i.test(st) || st === 'AA_DHL'             ? '📦 DHL'
                : /air_chn/i.test(st) || st === 'AIR_CHN_MX'    ? '✈️ TDI Aéreo'
                : /sea_chn/i.test(st) || st === 'SEA_CHN_MX'    ? '🚢 Mar.'
                : /pobox/i.test(st)   || st === 'POBOX_USA'      ? '📮 POBox'
                : st;

              return (
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, maxHeight: 340, overflow: 'auto' }}>
                  <Table size="small" stickyHeader sx={{ '& td, & th': { px: 0.75, py: 0.5, fontSize: '0.72rem', whiteSpace: 'nowrap' } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">
                          <Checkbox size="small"
                            indeterminate={newOrderSelectedUids.size > 0 && filteredShipments.some(s => (s.amount || 0) > 0 && s.hasInstructions && !newOrderSelectedUids.has(s.uid))}
                            checked={filteredShipments.some(s => (s.amount || 0) > 0 && s.hasInstructions) && filteredShipments.filter(s => (s.amount || 0) > 0 && s.hasInstructions).every(s => newOrderSelectedUids.has(s.uid))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const first = filteredShipments.find(s => (s.amount || 0) > 0 && s.hasInstructions);
                                const toSel = filteredShipments.filter(s =>
                                  (s.amount || 0) > 0 && s.hasInstructions &&
                                  ((lockClientId == null || s.clientId === lockClientId) &&
                                   (lockServiceType == null || s.serviceType === lockServiceType) ||
                                   (s.clientId === first?.clientId && s.serviceType === first?.serviceType))
                                );
                                setNewOrderSelectedUids(new Set(toSel.map(s => s.uid)));
                              } else setNewOrderSelectedUids(new Set());
                            }}
                          />
                        </TableCell>
                        <TableCell>Tracking</TableCell>
                        <TableCell>Cliente</TableCell>
                        <TableCell>Serv.</TableCell>
                        <TableCell align="right">Caja</TableCell>
                        <TableCell align="right">Paq.</TableCell>
                        <TableCell align="right">GEX</TableCell>
                        <TableCell align="right">Extra</TableCell>
                        <TableCell align="right">Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredShipments.length === 0 && (
                        <TableRow><TableCell colSpan={9} align="center" sx={{ py: 3 }}>
                          <Typography color="text.secondary" variant="caption">No hay guías en tránsito para este cliente</Typography>
                        </TableCell></TableRow>
                      )}
                      {filteredShipments.map(s => {
                        const hasInstr    = !!s.hasInstructions;
                        const hasAmount   = (s.amount || 0) > 0;
                        const isPdteClasif = !hasAmount && s.serviceType === 'SEA_CHN_MX';
                        const sameClient  = lockClientId == null || s.clientId === lockClientId;
                        const sameService = lockServiceType == null || s.serviceType === lockServiceType;
                        const inOrder     = !!s.inPaymentOrderRef;
                        const canSelect   = !inOrder && hasInstr && hasAmount && sameClient && sameService;
                        const disabledReason = inOrder
                          ? `Ya incluida en orden ${s.inPaymentOrderRef}`
                          : isPdteClasif
                          ? 'Pdte. de clasificación — sin monto asignado'
                          : !hasAmount
                          ? 'Sin monto registrado — no seleccionable'
                          : !hasInstr
                          ? '⚠️ Asigna instrucciones de entrega primero'
                          : !sameClient ? 'Solo guías del mismo cliente'
                          : !sameService ? 'No se pueden mezclar servicios diferentes'
                          : '';
                        return (
                          <TableRow key={s.uid} hover={canSelect} selected={newOrderSelectedUids.has(s.uid)}
                            sx={{
                              bgcolor: inOrder ? '#FFF3E0' : isPdteClasif ? '#F5F0FF' : !hasInstr ? '#FFFBF2' : undefined,
                              opacity: (sameClient && sameService) ? 1 : 0.35,
                              cursor: canSelect ? 'pointer' : 'default',
                            }}
                            onClick={() => {
                              if (!canSelect) return;
                              setNewOrderSelectedUids(prev => {
                                const next = new Set(prev);
                                if (next.has(s.uid)) next.delete(s.uid); else next.add(s.uid);
                                return next;
                              });
                            }}
                          >
                            <TableCell padding="checkbox">
                              <Tooltip title={disabledReason}>
                                <span><Checkbox size="small" checked={newOrderSelectedUids.has(s.uid)} disabled={!canSelect} /></span>
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600 }}>
                                {s.serviceType === 'AA_DHL'
                                  ? (s.internationalTracking || s.tracking || s.uid)
                                  : (s.tracking || s.internationalTracking || s.uid)}
                              </Typography>
                              {s.serviceType === 'AA_DHL' && s.internationalTracking && s.tracking && s.tracking !== s.internationalTracking && (
                                <Typography variant="caption" color="text.secondary" fontFamily="monospace">{s.tracking}</Typography>
                              )}
                              {inOrder && (
                                <Typography variant="caption" sx={{ color: '#E65100', fontWeight: 700 }}>
                                  🔒 En orden: {s.inPaymentOrderRef}
                                </Typography>
                              )}
                              {!inOrder && isPdteClasif && (
                                <Typography variant="caption" sx={{ color: '#6A1B9A', fontWeight: 600 }}>
                                  ⏳ Pdte. de clasificación
                                </Typography>
                              )}
                              {!inOrder && !isPdteClasif && !hasAmount && (
                                <Typography variant="caption" sx={{ color: '#888', fontWeight: 600 }}>
                                  Sin monto — no seleccionable
                                </Typography>
                              )}
                              {!inOrder && hasAmount && !hasInstr && (
                                <Typography variant="caption" sx={{ color: '#E65100', fontWeight: 600 }}>
                                  ⚠️ Sin instrucciones
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell sx={{ maxWidth: 130 }}>
                              <Typography variant="caption" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }} title={s.clientName}>{s.clientName}</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem' }}>{s.clientBoxId}</Typography>
                            </TableCell>
                            <TableCell><Chip label={serviceLabel(s.serviceType || '')} size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 20 }} /></TableCell>
                            <TableCell align="right">
                              {(s.amount || 0) > 0
                                ? <Typography variant="body2" sx={{ fontSize: '0.78rem' }} color="text.secondary">${(s.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Typography>
                                : <Typography color="text.disabled" variant="body2">—</Typography>
                              }
                            </TableCell>
                            <TableCell align="right">
                              {(s.nationalShippingCost || 0) > 0
                                ? <Typography variant="body2" sx={{ fontSize: '0.78rem' }} color="text.secondary">${(s.nationalShippingCost || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Typography>
                                : <Typography color="text.disabled" variant="body2">—</Typography>
                              }
                            </TableCell>
                            <TableCell align="right">
                              {(s.gexCost || 0) > 0
                                ? <Typography variant="body2" sx={{ fontSize: '0.78rem' }} color="text.secondary">${(s.gexCost || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Typography>
                                : <Typography color="text.disabled" variant="body2">—</Typography>
                              }
                            </TableCell>
                            <TableCell align="right">
                              {(s.extraChargesTotal || 0) !== 0
                                ? <Typography variant="body2" sx={{ fontSize: '0.78rem' }} color="text.secondary">${(s.extraChargesTotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Typography>
                                : <Typography color="text.disabled" variant="body2">—</Typography>
                              }
                            </TableCell>
                            <TableCell align="right">
                              {hasAmount
                                ? (() => {
                                    const rowTotal = (s.amount || 0) + (s.nationalShippingCost || 0) + (s.serviceType === 'AA_DHL' ? 0 : (s.gexCost || 0)) + (s.extraChargesTotal || 0);
                                    return <Typography variant="body2" fontWeight={700} color="warning.main">${rowTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Typography>;
                                  })()
                                : isPdteClasif
                                  ? <Chip label="Pdte. Clasif." size="small" sx={{ fontSize: '0.6rem', bgcolor: '#EDE7F6', color: '#6A1B9A', fontWeight: 700 }} />
                                  : <Typography color="text.disabled">—</Typography>
                              }
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              );
            })()}

            {newOrderSelectedUids.size > 0 && (() => {
              const autoTotal = newOrderShipments.filter(s => newOrderSelectedUids.has(s.uid)).reduce((sum, s) =>
                sum + (s.amount || 0) + (s.nationalShippingCost || 0) + (s.serviceType === 'AA_DHL' ? 0 : (s.gexCost || 0)) + (s.extraChargesTotal || 0), 0);
              const manualVal = parseFloat(newOrderManualTotal) || 0;
              const displayTotal = autoTotal > 0 ? autoTotal : manualVal;
              return (
                <Paper sx={{ mt: 1.5, p: 1.5, bgcolor: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: 2 }}>
                  <Typography variant="body2" fontWeight={700} color="#C2410C">
                    {newOrderSelectedUids.size} guía{newOrderSelectedUids.size !== 1 ? 's' : ''} seleccionada{newOrderSelectedUids.size !== 1 ? 's' : ''}
                    {displayTotal > 0 && ` · Total: $${displayTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`}
                  </Typography>
                  {autoTotal === 0 && (
                    <TextField
                      label="Monto total a cobrar (MXN) *"
                      size="small" fullWidth type="number"
                      value={newOrderManualTotal}
                      onChange={e => setNewOrderManualTotal(e.target.value)}
                      sx={{ mt: 1 }}
                      placeholder="Ej. 5000.00"
                      helperText="Las guías no tienen monto registrado — ingresa el total a cobrar"
                      inputProps={{ min: 0.01, step: '0.01' }}
                    />
                  )}
                </Paper>
              );
            })()}

            <TextField
              label="Notas (opcional)"
              size="small" fullWidth multiline rows={2}
              value={newOrderNotes}
              onChange={e => setNewOrderNotes(e.target.value)}
              sx={{ mt: 2 }}
              placeholder="Instrucciones especiales, referencia, etc."
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button onClick={() => setNewOrderOpen(false)} variant="outlined" sx={{ borderRadius: 2 }}>Cancelar</Button>
            <Button
              variant="contained" disabled={newOrderSelectedUids.size === 0 || newOrderSaving}
              onClick={handleCreatePaymentOrder}
              sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#C94A1E' }, fontWeight: 700, borderRadius: 2, minWidth: 160 }}
            >
              {newOrderSaving ? <CircularProgress size={18} color="inherit" /> : `Crear Orden (${newOrderSelectedUids.size} guías)`}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Dialog: Orden Creada Exitosamente ── */}
        <Dialog open={!!successOrderData} onClose={() => setSuccessOrderData(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
          <DialogTitle sx={{ bgcolor: '#2e7d32', color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            ✅ Orden de Pago Creada
          </DialogTitle>
          {successOrderData && (
            <DialogContent sx={{ pt: 2.5 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ bgcolor: '#F3F4F6', borderRadius: 2, p: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>Referencia de pago</Typography>
                  <Typography fontWeight={700} sx={{ fontFamily: 'monospace', color: '#F05A28', fontSize: '0.95rem' }}>
                    {successOrderData.payment_reference}
                  </Typography>
                </Box>

                <Box sx={{ bgcolor: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 2, p: 2 }}>
                  <Typography variant="body2" fontWeight={700} color="#1D4ED8" gutterBottom>Datos bancarios para el cliente</Typography>
                  {successOrderData.bank_info ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption" color="text.secondary">Banco</Typography>
                        <Typography variant="body2" fontWeight={600}>{successOrderData.bank_info.banco}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption" color="text.secondary">CLABE</Typography>
                        <Typography variant="body2" fontWeight={700} sx={{ fontFamily: 'monospace' }}>{successOrderData.bank_info.clabe}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption" color="text.secondary">Beneficiario</Typography>
                        <Typography variant="body2" fontWeight={600}>{successOrderData.bank_info.beneficiario}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption" color="text.secondary">Concepto</Typography>
                        <Typography variant="body2" fontWeight={700} color="#F05A28" sx={{ fontFamily: 'monospace' }}>{successOrderData.bank_info.concepto}</Typography>
                      </Box>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">Sin información bancaria configurada</Typography>
                  )}
                </Box>

                <Box sx={{ bgcolor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 2, p: 2 }}>
                  <Typography variant="body2" fontWeight={700} color="#166534" gutterBottom>Resumen</Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">Cliente</Typography>
                    <Typography variant="body2" fontWeight={600}>{successOrderData.client_name}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">Monto total</Typography>
                    <Typography variant="body2" fontWeight={800} color="success.main">
                      ${Number(successOrderData.total_mxn).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                    </Typography>
                  </Box>
                </Box>

                <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
                  Esta orden ya aparece en la app del cliente en "Mis Cuentas por Pagar".
                </Typography>
              </Box>
            </DialogContent>
          )}
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              variant="contained"
              onClick={() => setSuccessOrderData(null)}
              sx={{ bgcolor: '#2e7d32', '&:hover': { bgcolor: '#1b5e20' }, fontWeight: 700, borderRadius: 2 }}
            >
              Entendido
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Dialog: Solicitar factura ── */}
        <Dialog
          open={invoiceOrder !== null}
          onClose={() => { if (!invoiceSubmitting) setInvoiceOrder(null); }}
          maxWidth="sm"
          fullWidth
          PaperProps={{ sx: { borderRadius: 3 } }}
        >
          <DialogTitle sx={{ fontWeight: 700, pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <InvoiceIcon sx={{ color: '#7B1FA2' }} /> Solicitar factura
          </DialogTitle>
          <DialogContent dividers>
            {invoiceLoading || !invoiceInfo ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
            ) : (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">Monto a facturar</Typography>
                  <Typography variant="body1" fontWeight={700} sx={{ color: '#E65100' }}>
                    ${Number(invoiceInfo.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                  <Typography variant="body2" color="text.secondary">Empresa emisora</Typography>
                  <Typography variant="body2" fontWeight={700}>
                    {invoiceInfo.company ? (invoiceInfo.company.legal_name || invoiceInfo.company.alias) : '— sin emisor configurado —'}
                  </Typography>
                </Box>
                <Divider sx={{ mb: 1.5 }} />

                {invoiceResult ? (
                  <Box sx={{ bgcolor: '#E8F5E9', borderRadius: 2, p: 2, textAlign: 'center' }}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#2E7D32', mb: 0.5 }}>
                      ✅ Factura emitida
                    </Typography>
                    {invoiceResult.uuid && (
                      <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', mb: 1, wordBreak: 'break-all' }}>
                        UUID: {invoiceResult.uuid}
                      </Typography>
                    )}
                    {invoiceResult.pdfUrl && (
                      <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={() => window.open(invoiceResult.pdfUrl, '_blank')}>
                        Ver PDF
                      </Button>
                    )}
                  </Box>
                ) : (
                  <>
                    {invoiceAddingProfile ? (
                      <>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>
                          {invoiceProfiles.length > 0 ? 'Nuevos datos fiscales del cliente' : 'Datos fiscales del cliente'}
                        </Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                          <TextField size="small" label="Razón social" value={invoiceFiscal.razon_social} sx={{ gridColumn: '1 / -1' }}
                            onChange={(e) => setInvoiceFiscal(p => ({ ...p, razon_social: e.target.value }))} />
                          <TextField size="small" label="RFC" value={invoiceFiscal.rfc}
                            onChange={(e) => setInvoiceFiscal(p => ({ ...p, rfc: e.target.value.toUpperCase() }))} />
                          <TextField size="small" label="Código postal" value={invoiceFiscal.codigo_postal}
                            onChange={(e) => setInvoiceFiscal(p => ({ ...p, codigo_postal: e.target.value }))} />
                          <TextField select size="small" label="Régimen fiscal" value={invoiceFiscal.regimen_fiscal}
                            onChange={(e) => setInvoiceFiscal(p => ({ ...p, regimen_fiscal: e.target.value }))}>
                            {satRegimenes.map(r => <MenuItem key={r.clave} value={r.clave}>{r.clave} — {r.descripcion}</MenuItem>)}
                          </TextField>
                          <TextField select size="small" label="Uso CFDI" value={invoiceFiscal.uso_cfdi}
                            onChange={(e) => setInvoiceFiscal(p => ({ ...p, uso_cfdi: e.target.value }))}>
                            {satUsos.map(u => <MenuItem key={u.clave} value={u.clave}>{u.clave} — {u.descripcion}</MenuItem>)}
                          </TextField>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
                          <Button size="small" variant="contained"
                            onClick={saveFiscalProfile}
                            disabled={invoiceSavingProfile || !invoiceFiscal.razon_social || !invoiceFiscal.rfc || !invoiceFiscal.codigo_postal || !invoiceFiscal.regimen_fiscal}
                            startIcon={invoiceSavingProfile ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
                            sx={{ bgcolor: '#7B1FA2', '&:hover': { bgcolor: '#6A1B9A' } }}>
                            {invoiceSavingProfile ? 'Guardando…' : 'Guardar datos fiscales'}
                          </Button>
                          {invoiceProfiles.length > 0 && (
                            <Button size="small" onClick={() => setInvoiceAddingProfile(false)} disabled={invoiceSavingProfile}>Cancelar</Button>
                          )}
                        </Box>
                      </>
                    ) : (
                      <>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                            Datos fiscales del cliente
                          </Typography>
                          <Button size="small" startIcon={<AddIcon />} sx={{ color: '#7B1FA2' }}
                            onClick={() => { setInvoiceProfileId(null); setInvoiceFiscal(emptyFiscal); setInvoiceAddingProfile(true); }}>
                            Agregar
                          </Button>
                        </Box>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {invoiceProfiles.map((p) => (
                            <Box key={p.id} onClick={() => selectInvoiceProfile(p)}
                              sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 2, cursor: 'pointer',
                                    border: invoiceProfileId === p.id ? '2px solid #7B1FA2' : '1px solid #E0E0E0',
                                    bgcolor: invoiceProfileId === p.id ? '#F3E5F5' : '#fff' }}>
                              <Radio checked={invoiceProfileId === p.id} size="small" sx={{ p: 0.5, color: '#7B1FA2', '&.Mui-checked': { color: '#7B1FA2' } }} />
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" fontWeight={700} noWrap>{p.razon_social}</Typography>
                                <Typography variant="caption" color="text.secondary">{p.rfc} · CP {p.codigo_postal} · Rég. {p.regimen_fiscal} · {p.uso_cfdi}</Typography>
                              </Box>
                              <Tooltip title="Eliminar">
                                <IconButton size="small" onClick={(e) => { e.stopPropagation(); deleteFiscalProfile(p.id); }}>
                                  <CloseIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          ))}
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                          Se generará un CFDI (factura fiscal) por el monto indicado, con el RFC seleccionado. Esta acción no se puede deshacer.
                        </Typography>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setInvoiceOrder(null)} disabled={invoiceSubmitting}>Cerrar</Button>
            {invoiceInfo && !invoiceResult && (
              <Button
                variant="contained"
                onClick={submitInvoice}
                disabled={invoiceSubmitting || invoiceAddingProfile || !invoiceProfileId || !invoiceInfo.company}
                startIcon={invoiceSubmitting ? <CircularProgress size={16} color="inherit" /> : <InvoiceIcon />}
                sx={{ bgcolor: '#7B1FA2', '&:hover': { bgcolor: '#6A1B9A' } }}
              >
                {invoiceSubmitting ? 'Generando…' : 'Generar factura'}
              </Button>
            )}
          </DialogActions>
        </Dialog>

        {/* ── Dialog: Confirmar cancelación ── */}
        <Dialog
          open={cancelConfirmOrderId !== null}
          onClose={() => setCancelConfirmOrderId(null)}
          maxWidth="xs"
          fullWidth
          PaperProps={{ sx: { borderRadius: 3 } }}
        >
          <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
            Cancelar orden de pago
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary">
              ¿Estás seguro de que deseas cancelar esta orden? Esta acción no se puede deshacer y el cliente dejará de ver la orden en su app.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button
              variant="outlined"
              onClick={() => setCancelConfirmOrderId(null)}
              sx={{ borderRadius: 2, textTransform: 'none' }}
            >
              No, conservar
            </Button>
            <Button
              variant="contained"
              color="error"
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
              onClick={async () => {
                const id = cancelConfirmOrderId;
                setCancelConfirmOrderId(null);
                await api.delete(`/advisor/payment-orders/${id}`);
                fetchPaymentOrders();
              }}
            >
              Sí, cancelar
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Fade>
  );

  // ════════════════════════════════════
  // TAB 4: MIS COMISIONES
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
                    {advisorTickets.filter(t => t.category !== 'quote' && t.category !== 'quote_request').map((ticket, idx, arr) => (
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
                              {ticket.source === 'assigned' && (
                                <Chip size="small" label="Asignado" color="warning" sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />
                              )}
                            </Box>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                              {ticket.source === 'assigned' && ticket.client_name
                                ? `${ticket.client_name}${ticket.client_box_id ? ` · Box ${ticket.client_box_id}` : ''}`
                                : ticket.ticket_folio}
                            </Typography>
                            {ticket.client_number && (
                              <Typography variant="caption" sx={{ display: 'block', color: '#F05A28', fontWeight: 700 }}>
                                👤 Cliente: {ticket.client_number}
                              </Typography>
                            )}
                            <Typography variant="caption" color="text.secondary">
                              {ticket.ticket_folio} · {formatDate(ticket.created_at)}
                            </Typography>
                          </Box>
                        </ListItem>
                        {idx < arr.length - 1 && <Divider />}
                      </Box>
                    ))}
                  </List>
                )}
              </Paper>
            </Grid>
          </Grid>

          {/* Dialog conversación de ticket (movido a top-level) */}
          {false && (
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
                        alignSelf: (msg.sender_type === 'employee' || msg.sender_type === 'agent') ? 'flex-end' : 'flex-start',
                        maxWidth: '80%',
                        bgcolor: (msg.sender_type === 'employee' || msg.sender_type === 'agent') ? '#F05A28' : '#f5f5f5',
                        color: (msg.sender_type === 'employee' || msg.sender_type === 'agent') ? '#fff' : '#111',
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
          )}
        </Box>
      </Fade>
    );
  };

  // ════════════════════════════════════
  // TAB 6: COTIZACIONES (pendientes + generador formal)
  // ════════════════════════════════════
  const fetchFormalQuotesList = useCallback(async () => {
    try {
      const r = await api.get('/advisor/formal-quotes');
      setFormalQuotesList(r.data || []);
    } catch { /* noop */ }
  }, []);

  const openFormalQuoteDialog = useCallback(async (preTicket?: any) => {
    // Cargar clientes una sola vez
    if (formalQuoteClients.length === 0) {
      try {
        const r = await api.get('/advisor/clients?limit=500');
        const data = r.data?.clients || r.data || [];
        setFormalQuoteClients(Array.isArray(data) ? data : []);
      } catch { /* noop */ }
    }
    if (preTicket) {
      // Prellenar desde un ticket de cotización
      setFormalQuoteClient({
        id: preTicket.user_id,
        full_name: preTicket.client_name,
        box_id: preTicket.client_box_id,
        email: preTicket.client_email,
        phone: preTicket.client_phone,
      });
      setFormalQuoteTicketId(preTicket.id);

      // Prefill desde metadata estructurada del ticket
      let meta: any = preTicket.metadata;
      if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = null; } }
      if (meta && typeof meta === 'object') {
        const svc = String(meta.servicio || '').toLowerCase();
        if (['maritimo', 'aereo', 'pobox', 'dhl'].includes(svc)) {
          setFormalQuoteServicio(svc as any);
        }
        // Subservicio: si trae cbm y es marítimo sin subservicio explícito → por_volumen
        let sub = meta.subservicio || '';
        if (!sub && svc === 'maritimo' && (meta.cbm || meta.CBM)) sub = 'por_volumen';
        setFormalQuoteSubservicio(sub || '');
        if (meta.categoria) setFormalQuoteCategoria(String(meta.categoria));
        setFormalQuoteLargo(meta.largo ? String(meta.largo) : '');
        setFormalQuoteAncho(meta.ancho ? String(meta.ancho) : '');
        setFormalQuoteAlto(meta.alto ? String(meta.alto) : '');
        setFormalQuotePeso(meta.peso ? String(meta.peso) : '');
        setFormalQuoteCbm(meta.cbm ? String(meta.cbm) : '');
        setFormalQuoteCantidad(meta.cantidad ? String(meta.cantidad) : '1');
        setFormalQuoteDescripcion(meta.descripcion_producto || '');
        // Prefill GEX: valor declarado del ticket (USD → MXN con TC del ticket)
        const valUsd = Number(meta.valor_declarado_usd || 0);
        const tc = Number(meta.tipo_cambio || 0);
        if (valUsd > 0 && tc > 0) {
          setFormalQuoteGexEnabled(true);
          setFormalQuoteGexCurrency('MXN');
          setFormalQuoteGexValor((valUsd * tc).toFixed(2));
        } else {
          setFormalQuoteGexEnabled(false);
          setFormalQuoteGexValor('');
        }
      }
    } else {
      setFormalQuoteTicketId(null);
    }
    // Cargar TC GEX como fallback para conversión USD→MXN cuando aún no hay cálculo
    if (!formalQuoteGexFallbackTc) {
      api.get('/gex/exchange-rate')
        .then((r: any) => {
          const rate = Number(r?.data?.rate) || 0;
          if (rate > 0) setFormalQuoteGexFallbackTc(rate);
        })
        .catch(() => { /* noop */ });
    }
    setFormalQuoteDialogOpen(true);
  }, [formalQuoteClients.length, formalQuoteGexFallbackTc]);

  const handleCalculateFormalQuote = async () => {
    setFormalQuoteCalculating(true);
    setFormalQuoteCalcResult(null);
    try {
      const body: any = {
        servicio: formalQuoteServicio,
        cantidad: Number(formalQuoteCantidad) || 1,
        categoria: formalQuoteCategoria,
      };
      if (formalQuoteSubservicio) body.subservicio = formalQuoteSubservicio;
      if (formalQuoteLargo) body.largo = Number(formalQuoteLargo);
      if (formalQuoteAncho) body.ancho = Number(formalQuoteAncho);
      if (formalQuoteAlto) body.alto = Number(formalQuoteAlto);
      if (formalQuotePeso) body.peso = Number(formalQuotePeso);
      if (formalQuoteCbm) body.cbm = Number(formalQuoteCbm);
      const r = await api.post('/public/quote', body);
      setFormalQuoteCalcResult(r.data);
    } catch (err: any) {
      setSnackbar({ open: true, message: err?.response?.data?.error || 'Error calculando', severity: 'error' });
    } finally {
      setFormalQuoteCalculating(false);
    }
  };

  const handleGenerateFormalQuotePdf = async () => {
    if (!formalQuoteCalcResult) {
      setSnackbar({ open: true, message: 'Primero calcula la cotización', severity: 'warning' });
      return;
    }
    setFormalQuoteGenerating(true);
    try {
      // Calcular prima GEX: 5% del valor declarado + costo fijo de póliza $625 MXN
      const GEX_FIXED_FEE_MXN = 625;
      const gexTcForCalc = Number(formalQuoteCalcResult?.tipo_cambio) || formalQuoteGexFallbackTc || 0;
      const gexValorRaw = formalQuoteGexEnabled ? Number(formalQuoteGexValor) || 0 : 0;
      const gexValor = formalQuoteGexCurrency === 'USD' ? gexValorRaw * gexTcForCalc : gexValorRaw;
      const gexVariable = gexValor > 0 ? Math.round(gexValor * 0.05 * 100) / 100 : 0;
      const gexPrima = formalQuoteGexEnabled
        ? Math.round((gexVariable + GEX_FIXED_FEE_MXN) * 100) / 100
        : 0;
      const body: any = {
        clientId: formalQuoteClient?.id || null,
        clientName: formalQuoteClient?.full_name || formalQuoteClient?.name,
        clientBoxId: formalQuoteClient?.box_id,
        clientEmail: formalQuoteClient?.email,
        clientPhone: formalQuoteClient?.phone,
        servicio: formalQuoteServicio,
        subservicio: formalQuoteSubservicio || undefined,
        categoria: formalQuoteCategoria,
        details: {
          largo: formalQuoteLargo, ancho: formalQuoteAncho, alto: formalQuoteAlto,
          peso: formalQuotePeso, cbm: formalQuoteCbm, cantidad: formalQuoteCantidad,
          peso_cobrable: formalQuoteCalcResult?.peso_cobrable,
          tiempo_estimado: formalQuoteCalcResult?.tiempo_estimado,
          descripcion: formalQuoteDescripcion,
        },
        precio_usd: formalQuoteCalcResult?.precio_usd,
        precio_mxn: formalQuoteCalcResult?.precio_mxn,
        tipo_cambio: formalQuoteCalcResult?.tipo_cambio,
        gex_enabled: formalQuoteGexEnabled,
        gex_valor_declarado_mxn: gexValor || undefined,
        gex_prima_mxn: gexPrima || undefined,
        validityDays: 7,
        ticketId: formalQuoteTicketId || undefined,
      };
      const r = await api.post('/advisor/formal-quotes', body);
      setSnackbar({ open: true, message: `Cotización ${r.data?.folio} generada`, severity: 'success' });
      // Reset
      setFormalQuoteDialogOpen(false);
      setFormalQuoteClient(null);
      setFormalQuoteServicio('maritimo'); setFormalQuoteSubservicio('');
      setFormalQuoteCategoria('Generico');
      setFormalQuoteLargo(''); setFormalQuoteAncho(''); setFormalQuoteAlto('');
      setFormalQuotePeso(''); setFormalQuoteCbm(''); setFormalQuoteCantidad('1');
      setFormalQuoteDescripcion('');
      setFormalQuoteCalcResult(null);
      setFormalQuoteGexEnabled(true); setFormalQuoteGexValor(''); setFormalQuoteGexCurrency('MXN');
      setFormalQuoteTicketId(null);
      fetchFormalQuotesList();
      if (r.data?.quoteId) {
        try {
          const u = await api.get(`/advisor/formal-quotes/${r.data.quoteId}/pdf`);
          const url = u?.data?.pdfUrl || r.data?.pdfUrl;
          if (url) window.open(url, '_blank');
        } catch {
          if (r.data?.pdfUrl) window.open(r.data.pdfUrl, '_blank');
        }
      } else if (r.data?.pdfUrl) window.open(r.data.pdfUrl, '_blank');
    } catch (err: any) {
      setSnackbar({ open: true, message: err?.response?.data?.error || 'Error generando PDF', severity: 'error' });
    } finally {
      setFormalQuoteGenerating(false);
    }
  };

  const renderQuotes = () => {
    const quoteTickets = advisorTickets.filter(t =>
      (t.category === 'quote' || t.category === 'quote_request') &&
      t.status !== 'resolved' && t.status !== 'closed'
    );
    const formatDate = (d: string) => {
      if (!d) return '';
      // El backend devuelve TIMESTAMP WITHOUT TZ como string sin 'Z' (UTC).
      // Forzamos a tratarlo como UTC para que toLocaleString lo convierta a la zona local del navegador.
      const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(d) ? d : (d.includes('T') ? `${d}Z` : `${d.replace(' ', 'T')}Z`);
      return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    };
    const getTicketStatusLabel = (status: string) => {
      const map: Record<string, { label: string; color: 'default' | 'warning' | 'info' | 'error' | 'success' }> = {
        open_ai: { label: 'En revisión', color: 'info' },
        escalated_human: { label: 'Pendiente', color: 'warning' },
        waiting_client: { label: 'Esperando cliente', color: 'default' },
        waiting_agent: { label: 'En espera', color: 'default' },
        resolved: { label: 'Cotizada', color: 'success' },
        closed: { label: 'Cerrada', color: 'default' },
      };
      const s = map[status] || { label: status, color: 'default' as const };
      return <Chip label={s.label} color={s.color} size="small" sx={{ fontWeight: 700 }} />;
    };

    return (
      <Fade in timeout={400}>
        <Box>
          <Grid container spacing={3}>
            {/* Pendientes */}
            <Grid size={{ xs: 12, md: 7 }}>
              <Paper sx={{ p: 3, borderRadius: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Box>
                    <Typography variant="h6" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <QuoteIcon sx={{ color: '#FF9800' }} /> Cotizaciones Pendientes
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Solicitudes de cotización de tus clientes que requieren tu respuesta.
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={fetchAdvisorTickets}><RefreshIcon /></IconButton>
                </Box>

                {advisorTicketsLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress size={32} />
                  </Box>
                ) : quoteTickets.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 6 }}>
                    <QuoteIcon sx={{ fontSize: 60, color: '#ddd', mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Aún no tienes solicitudes de cotización asignadas.
                    </Typography>
                  </Box>
                ) : (
                  <List disablePadding>
                    {quoteTickets.map((ticket, idx, arr) => (
                      <Box key={ticket.id}>
                        <Box sx={{
                          px: 1.5, py: 1.5, borderRadius: 2,
                          border: '1px solid #FFE0B2', mb: 1, bgcolor: '#FFF8E1',
                          display: 'flex', flexDirection: 'column', gap: 1,
                        }}>
                          {/* Info row */}
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', cursor: 'pointer' }}
                            onClick={() => { setSelectedAdvisorTicket(ticket); fetchTicketMessages(ticket.id); }}>
                            <Avatar sx={{ bgcolor: alpha('#FF9800', 0.15), color: '#FF9800', width: 36, height: 36, flexShrink: 0 }}>
                              <QuoteIcon fontSize="small" />
                            </Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.3 }}>
                                <Typography variant="subtitle2" fontWeight={700} sx={{ wordBreak: 'break-word' }}>
                                  {ticket.subject || 'Cotización formal'}
                                </Typography>
                                {getTicketStatusLabel(ticket.status)}
                              </Box>
                              <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: '#5D4037' }}>
                                {ticket.client_name || 'Cliente'}{ticket.client_box_id ? ` · Box ${ticket.client_box_id}` : ''}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {ticket.ticket_folio} · {formatDate(ticket.created_at)}
                              </Typography>
                            </Box>
                          </Box>
                          {/* Botones en fila responsiva */}
                          <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap' }}>
                            <Button size="small" variant="outlined"
                              startIcon={<VisibilityIcon sx={{ fontSize: 14 }} />}
                              sx={{ borderColor: '#FF9800', color: '#E65100', textTransform: 'none', fontWeight: 700, fontSize: 12, flex: '1 1 auto', '&:hover': { bgcolor: '#FFF3E0' } }}
                              onClick={() => { setSelectedAdvisorTicket(ticket); fetchTicketMessages(ticket.id); }}>
                              Ver ticket
                            </Button>
                            <Button size="small" variant="contained"
                              sx={{ bgcolor: '#FF9800', '&:hover': { bgcolor: '#F57C00' }, textTransform: 'none', fontWeight: 700, fontSize: 12, flex: '1 1 auto' }}
                              onClick={() => openFormalQuoteDialog(ticket)}>
                              Cotizar
                            </Button>
                            <Button size="small" variant="outlined"
                              sx={{ borderColor: '#9E9E9E', color: '#616161', textTransform: 'none', fontWeight: 700, fontSize: 12, flex: '1 1 auto', '&:hover': { bgcolor: '#F5F5F5' } }}
                              onClick={async () => {
                                if (!window.confirm(`¿Archivar ticket ${ticket.ticket_folio}?`)) return;
                                try {
                                  await api.put(`/admin/support/ticket/${ticket.id}/resolve`);
                                  setSnackbar({ open: true, message: 'Ticket archivado', severity: 'success' });
                                  fetchAdvisorTickets();
                                } catch (e: any) {
                                  setSnackbar({ open: true, message: e?.response?.data?.error || 'No se pudo archivar', severity: 'error' });
                                }
                              }}>
                              Archivar
                            </Button>
                          </Box>
                        </Box>
                        {idx < arr.length - 1 && <Divider sx={{ my: 0.5 }} />}
                      </Box>
                    ))}
                  </List>
                )}
              </Paper>
            </Grid>

            {/* Acciones + Historial */}
            <Grid size={{ xs: 12, md: 5 }}>
              <Paper sx={{ p: 3, borderRadius: 2, mb: 2, background: 'linear-gradient(135deg, #FF9800 0%, #F05A28 100%)', color: '#fff' }}>
                <Typography variant="h6" fontWeight={700} gutterBottom>
                  📄 Generar Cotización Formal
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.9, mb: 2 }}>
                  Crea un PDF profesional con vigencia de 7 días para tus clientes.
                </Typography>
                <Button
                  fullWidth variant="contained"
                  sx={{ bgcolor: '#1A1A1A', color: '#fff', fontWeight: 700, textTransform: 'none', '&:hover': { bgcolor: '#000' } }}
                  startIcon={<QuoteIcon />}
                  onClick={() => openFormalQuoteDialog()}
                >
                  Nueva Cotización Formal
                </Button>
              </Paper>

              <Paper sx={{ p: 3, borderRadius: 2, mb: 2, border: '2px solid #F05A28' }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
                  📋 Solicitud de Cotización Especializada
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  Para casos con detalles específicos: marca, dimensiones, proveedor, adjuntos.
                </Typography>
                <Button
                  fullWidth variant="contained"
                  sx={{ bgcolor: '#F05A28', color: '#fff', fontWeight: 700, textTransform: 'none', '&:hover': { bgcolor: '#d44d20' } }}
                  startIcon={<span>📤</span>}
                  onClick={() => setQuoteRequestOpen(true)}
                >
                  Solicitar Cotización Especializada
                </Button>
              </Paper>

              <Paper sx={{ p: 3, borderRadius: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Typography variant="subtitle1" fontWeight={700}>
                    Mis Cotizaciones Generadas
                  </Typography>
                  <IconButton size="small" onClick={fetchFormalQuotesList}><RefreshIcon /></IconButton>
                </Box>
                {formalQuotesList.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    Aún no has generado cotizaciones formales.
                  </Typography>
                ) : (
                  <List dense disablePadding sx={{ maxHeight: 360, overflowY: 'auto' }}>
                    {formalQuotesList.map(q => {
                      const expired = q.valid_until && new Date(q.valid_until) < new Date();
                      return (
                        <ListItem
                          key={q.id}
                          sx={{ px: 1, py: 0.8, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' }, mb: 0.3 }}
                          secondaryAction={
                            q.pdf_url && (
                              <IconButton size="small" onClick={async () => {
                                try {
                                  const u = await api.get(`/advisor/formal-quotes/${q.id}/pdf`);
                                  window.open(u?.data?.pdfUrl || q.pdf_url, '_blank');
                                } catch {
                                  window.open(q.pdf_url, '_blank');
                                }
                              }}>
                                <PdfIcon sx={{ color: '#C62828' }} />
                              </IconButton>
                            )
                          }
                        >
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.2, flexWrap: 'wrap' }}>
                              <Typography variant="body2" fontWeight={700} noWrap>{q.folio}</Typography>
                              {expired ? <Chip label="Vencida" size="small" color="error" sx={{ height: 18, fontSize: 10 }} /> : <Chip label="Vigente" size="small" color="success" sx={{ height: 18, fontSize: 10 }} />}
                              {q.gex_enabled && <Chip label="GEX" size="small" sx={{ height: 18, fontSize: 10, bgcolor: '#9C27B0', color: '#fff' }} />}
                              {q.ticket_folio && <Chip label={q.ticket_folio} size="small" sx={{ height: 18, fontSize: 10, bgcolor: '#FFF3E0', color: '#E65100', fontWeight: 700 }} />}
                            </Box>
                            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }} noWrap>
                              {q.client_name || '—'} · {formatDate(q.created_at)} · ${Number(q.total_mxn || 0).toLocaleString('es-MX')}
                            </Typography>
                          </Box>
                        </ListItem>
                      );
                    })}
                  </List>
                )}
              </Paper>
            </Grid>
          </Grid>
        </Box>
      </Fade>
    );
  };



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
            const tid = tabConfig[activeTab]?.id;
            fetchDashboard();
            if (tid === 'clients') fetchClients();
            if (tid === 'instructions' || tid === 'payment_order') fetchShipments();
            if (tid === 'commissions') fetchCommissions();
            if (tid === 'tickets' || tid === 'quotes') fetchAdvisorTickets();
            if (tid === 'team') fetchTeam();
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
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              minHeight: 48,
              // Compacto: que quepan todas las pestañas en una sola línea sin scroll
              '& .MuiTabs-flexContainer': { gap: 0 },
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.8rem',
                minHeight: 48,
                minWidth: 0,
                px: 1.25,
                py: 1,
              },
              '& .MuiTab-iconWrapper': {
                fontSize: '1.1rem',
                marginRight: '6px',
                marginBottom: '0 !important',
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
      {(() => {
        const tid = tabConfig[activeTab]?.id;
        return (
          <Box sx={{ minHeight: isMobile ? 'calc(100vh - 180px)' : 'auto' }}>
            {tid === 'dashboard'    && renderDashboard()}
            {tid === 'clients'     && renderClients()}
            {tid === 'instructions'&& renderShipments()}
            {tid === 'payment_order'&&renderOrdenDePago()}
            {tid === 'xpay'        && renderXpay()}
            {tid === 'commissions' && renderCommissions()}
            {tid === 'tools'       && renderTools()}
            {tid === 'tickets'     && renderTickets()}
            {tid === 'quotes'      && renderQuotes()}
            {tid === 'team'        && renderTeam()}
          </Box>
        );
      })()}

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
      {/* Subir guía(s) de paquetería nacional */}
      <Dialog
        open={!!nationalGuideShipment}
        onClose={() => { if (!nationalGuideUploading) setNationalGuideShipment(null); }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Subir guías de paquetería nacional</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Sube 1 o más archivos (PDF, JPG o PNG). Se unirán en un solo PDF disponible para imprimir la etiqueta de paquetería{nationalGuideShipment?.isMaster ? ' desde la guía maestra y todas sus hijas' : ''}.
          </Typography>
          {nationalGuideShipment && (
            <Typography variant="caption" sx={{ display: 'block', mb: 1.5, color: '#1A1A1A', fontWeight: 600 }}>
              Guía: {nationalGuideShipment.tracking}
            </Typography>
          )}
          <Button
            component="label"
            variant="outlined"
            startIcon={<UploadFileIcon />}
            sx={{ color: '#1A1A1A', borderColor: '#1A1A1A', '&:hover': { borderColor: '#1A1A1A', bgcolor: 'rgba(0,0,0,0.04)' } }}
          >
            Seleccionar archivos
            <input
              type="file"
              hidden
              multiple
              accept="application/pdf,image/png,image/jpeg"
              onChange={(e) => setNationalGuideFiles(Array.from(e.target.files || []))}
            />
          </Button>
          {nationalGuideFiles.length > 0 && (
            <Box sx={{ mt: 2 }}>
              {nationalGuideFiles.map((f, i) => (
                <Typography key={i} variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                  • {f.name}
                </Typography>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setNationalGuideShipment(null)} disabled={nationalGuideUploading} sx={{ color: '#1A1A1A' }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={submitNationalGuide}
            disabled={nationalGuideUploading || nationalGuideFiles.length === 0}
            sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#C62828' } }}
          >
            {nationalGuideUploading ? 'Subiendo…' : 'Subir'}
          </Button>
        </DialogActions>
      </Dialog>

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
                      <Typography variant="caption" color="text.secondary">Tracking interno</Typography>
                      <Typography variant="body2" fontWeight={600} fontFamily="monospace">{s.tracking || '—'}</Typography>
                    </Grid>
                    {s.internationalTracking && (
                      <Grid size={{ xs: 12 }}>
                        <Typography variant="caption" color="text.secondary">Guía de origen / proveedor</Typography>
                        <Typography variant="body2" fontWeight={600} fontFamily="monospace" color="primary.main">{s.internationalTracking}</Typography>
                      </Grid>
                    )}
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
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Guía Origen</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Peso / Medidas</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Estado</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Monto</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {repackChildren.map((child: any) => (
                              <TableRow key={child.id} hover>
                                <TableCell>
                                  <Typography variant="body2" fontWeight={600} fontSize="0.8rem" fontFamily="monospace">{child.tracking}</Typography>
                                  {child.description && <Typography variant="caption" color="text.secondary" display="block">{child.description}</Typography>}
                                </TableCell>
                                <TableCell>
                                  <Typography variant="body2" fontSize="0.8rem" fontFamily="monospace" color={child.internationalTracking ? 'primary.main' : 'text.disabled'}>
                                    {child.internationalTracking || '—'}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Box>
                                    {child.weight
                                      ? <Typography variant="body2" fontSize="0.8rem" fontWeight={600}>⚖️ {child.weight} kg</Typography>
                                      : <Typography variant="body2" color="text.disabled" fontSize="0.8rem">—</Typography>}
                                    {child.lengthCm && child.widthCm && child.heightCm && (
                                      <Typography variant="caption" color="text.secondary" display="block">📐 {child.lengthCm}×{child.widthCm}×{child.heightCm} cm</Typography>
                                    )}
                                    {child.tarifaNivel != null && (
                                      <Chip label={`N${child.tarifaNivel}`} size="small" color="info" variant="outlined" sx={{ fontSize: '0.65rem', height: 18, mt: 0.5 }} />
                                    )}
                                  </Box>
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

      {/* Modal: Instrucciones de Envío */}
      <Dialog open={shipInstrOpen} onClose={() => setShipInstrOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#1976d2', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SendInstrIcon />
            <span>Instrucciones de Envío</span>
          </Box>
          <IconButton size="small" onClick={() => setShipInstrOpen(false)} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2, pb: 1 }}>
          {shipInstrClient && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Cliente: <strong>{shipInstrClient.name}</strong> · Casillero: <strong>{shipInstrClient.boxId}</strong>
            </Typography>
          )}

          {/* Selector de servicio */}
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
            Tipo de servicio
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 0.5, mb: 2.5, flexWrap: 'wrap' }}>
            {SHIP_INSTR_SERVICES.map((s) => (
              <Button
                key={s.type}
                variant={shipInstrServiceType === s.type ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setShipInstrServiceType(s.type)}
                sx={{
                  textTransform: 'none',
                  ...(shipInstrServiceType === s.type
                    ? { bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }
                    : { borderColor: '#90caf9', color: '#1976d2' }),
                }}
              >
                {s.label}
              </Button>
            ))}
          </Box>

          {/* Contenido del servicio seleccionado */}
          {shipInstrLoading ? (
            <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress size={28} /></Box>
          ) : shipInstrServiceType && (() => {
            const address = shipInstrAddresses[shipInstrServiceType];
            const suite = shipInstrClient?.boxId || 'S-XXX';
            const clientName = shipInstrClient?.name?.toUpperCase() || '';

            const renderAddress = () => {
              if (!address) return <Typography variant="body2" color="text.secondary">No hay dirección configurada para este servicio.</Typography>;
              if (shipInstrServiceType === 'usa_pobox') {
                const line = (address.address_line1 || '').replace(/\(S-Numero de Cliente\)/gi, suite);
                return (
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', lineHeight: 1.8 }}>
                    <strong>{clientName}</strong><br />
                    {line}<br />
                    {address.city}, {address.state} {address.zip_code}<br />
                    <span style={{ color: '#1976d2' }}>USA</span>
                  </Typography>
                );
              } else if (shipInstrServiceType === 'china_air' || shipInstrServiceType === 'china_sea') {
                return (
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', lineHeight: 1.8 }}>
                    {address.address_line1}<br />
                    {address.address_line2 && <>{address.address_line2}<br /></>}
                    <strong style={{ color: '#F05A28' }}>📦 Shipping Mark: {suite}</strong><br />
                    👤 {address.contact_name || ''}<br />
                    📞 {address.contact_phone || ''}
                  </Typography>
                );
              } else {
                return (
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', lineHeight: 1.8 }}>
                    {address.address_line1}<br />
                    {address.city}, {address.state} {address.zip_code}<br />
                    México<br />
                    <strong style={{ color: '#F05A28' }}>📦 A nombre de: {clientName} ({suite})</strong>
                  </Typography>
                );
              }
            };

            const instrMap: Record<string, { packaging: string; howTo: string }> = {
              china_air: {
                packaging: 'Embalaje: Tamaño unilateral no más de 1.2 metros. Peso: no más de 60 kg por caja.\n\nES IMPORTANTE PONER ETIQUETA EN CADA CAJA/PAQUETE CON LA LEYENDA (S-Número de cliente) IMPRESA O MARCADA.',
                howTo: `Envía tus paquetes a la dirección de arriba. Incluye siempre el Shipping Mark: ${suite} en cada caja. No se aceptan paquetes sin etiqueta. Tiempo estimado: 10-15 días hábiles.`,
              },
              china_sea: {
                packaging: 'Embalaje: Tamaño unilateral no más de 1.2 metros. Peso: no más de 60 kg por caja.\n\nES IMPORTANTE PONER ETIQUETA EN CADA CAJA/PAQUETE CON LA LEYENDA (S-Número de cliente) IMPRESA O MARCADA.',
                howTo: `Envía tus paquetes a la dirección de arriba. Incluye siempre el Shipping Mark: ${suite} en cada caja. No se aceptan paquetes sin etiqueta. Tiempo estimado: 30-45 días.`,
              },
              usa_pobox: {
                packaging: 'Indica la dirección del PO Box USA como destino en tus compras online. El nombre debe coincidir exactamente con el registrado.',
                howTo: `Usa la dirección de arriba como dirección de entrega en tus tiendas en línea. Incluye siempre tu número de casillero ${suite} en el campo "Suite/Apt". Tiempo estimado: 5-7 días hábiles.`,
              },
              mx_cedis: {
                packaging: 'Paquetes enviados directamente al CEDIS en Monterrey. Incluye nombre del destinatario y número de casillero.',
                howTo: `Envía a la dirección del CEDIS MTY. Incluye en el destinatario: ${clientName} (${suite}). Tiempo estimado: 2-3 días hábiles.`,
              },
            };

            const instr = instrMap[shipInstrServiceType];

            return (
              <Box>
                {/* Dirección */}
                <Box sx={{ bgcolor: '#e3f2fd', borderRadius: 2, p: 2, mb: 2, border: '1px solid #90caf9' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>DIRECCIÓN DE ENVÍO</Typography>
                  <Box sx={{ mt: 0.5 }}>{renderAddress()}</Box>
                </Box>

                {/* Instrucciones de empaque */}
                {instr && (
                  <>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                      Instrucciones de empaque
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5, mb: 2, whiteSpace: 'pre-line', color: 'text.secondary', fontSize: '0.8rem' }}>
                      {instr.packaging}
                    </Typography>

                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                      Cómo enviar
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-line', color: 'text.secondary', fontSize: '0.8rem' }}>
                      {instr.howTo}
                    </Typography>
                  </>
                )}
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setShipInstrOpen(false)} variant="outlined" size="small">Cerrar</Button>
          {shipInstrServiceType && shipInstrAddresses[shipInstrServiceType] && (
            <Button
              variant="contained"
              size="small"
              startIcon={<CopyIcon />}
              onClick={() => {
                const addr = shipInstrAddresses[shipInstrServiceType];
                const text = formatShipInstrText(shipInstrServiceType, addr, shipInstrClient?.name || '', shipInstrClient?.boxId || '');
                navigator.clipboard.writeText(text);
                setSnackbar({ open: true, message: 'Dirección copiada al portapapeles', severity: 'success' });
              }}
              sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}
            >
              Copiar dirección
            </Button>
          )}
          {shipInstrClient?.boxId && (
            <Button
              variant="contained"
              size="small"
              startIcon={<WhatsAppIcon />}
              onClick={() => {
                const addr = shipInstrAddresses[shipInstrServiceType];
                const svcLabel = SHIP_INSTR_SERVICES.find(s => s.type === shipInstrServiceType)?.label || '';
                const addrText = addr ? formatShipInstrText(shipInstrServiceType, addr, shipInstrClient?.name || '', shipInstrClient?.boxId || '') : '(dirección no disponible)';
                const msg = encodeURIComponent(`Hola ${shipInstrClient.name}, aquí están tus instrucciones de envío para *${svcLabel}*:\n\n📍 *Dirección de envío:*\n${addrText}\n\nRecuerda incluir siempre tu número de casillero *${shipInstrClient.boxId}* en cada paquete.`);
                window.open(`https://wa.me/?text=${msg}`, '_blank');
              }}
              sx={{ bgcolor: '#25D366', '&:hover': { bgcolor: '#1da851' } }}
            >
              Enviar WhatsApp
            </Button>
          )}
        </DialogActions>
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
                    const isPqtxIncluded = carrier.carrier_key === 'paquete_express' && isPqtxIncludedService(instrShipment?.serviceType);
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
                        {carrier.price_label && !isPqtxIncluded && (
                          <Typography variant="caption" color={carrier.allows_collect ? 'warning.main' : 'text.secondary'} align="center" sx={{ fontSize: '0.65rem', fontWeight: carrier.allows_collect ? 700 : 400 }}>
                            {carrier.price_label}
                          </Typography>
                        )}
                        {isPqtxIncluded && (
                          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.2 }}>
                            <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled', textDecoration: 'line-through', lineHeight: 1 }}>
                              $400
                            </Typography>
                            <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#2E7D32' }}>
                              INCLUIDO
                            </Typography>
                          </Box>
                        )}
                      </Paper>
                    );
                  })}
                </Box>
              )}

              {/* ── Estimado de costo / Aviso "Incluido" para TDI ── */}
              {instrCarrierKey === 'paquete_express' && isPqtxIncludedService(instrShipment?.serviceType) ? (
                <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: '#E8F5E9', border: '1px solid #A5D6A7', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Typography sx={{ fontSize: 22 }}>✅</Typography>
                  <Box>
                    <Typography variant="body2" fontWeight={700} sx={{ color: '#2E7D32' }}>
                      Costo:{' '}
                      <Typography component="span" sx={{ textDecoration: 'line-through', color: 'text.disabled', fontWeight: 500, mr: 0.5 }}>
                        $400.00 MXN
                      </Typography>
                      INCLUIDO
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#E65100', fontWeight: 600 }}>
                      ⚠️ Asegúrese de no exceder las dimensiones de esta cuota
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <Collapse in={!!instrCarrierKey && (instrPriceLoading || !!instrPriceEstimate)}>
                  <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {instrPriceLoading ? (
                      <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#F3F8FF', border: '1px solid #BBDEFB', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <CircularProgress size={18} sx={{ color: '#1976D2' }} />
                        <Typography variant="body2" color="text.secondary">Verificando cobertura y calculando costo…</Typography>
                      </Box>
                    ) : instrPriceEstimate?.noCoverage ? (
                      <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#FFF3E0', border: '1px solid #FFCC02', display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <Typography sx={{ fontSize: 20, mt: 0.1 }}>⚠️</Typography>
                        <Box>
                          <Typography variant="body2" fontWeight={700} sx={{ color: '#E65100' }}>
                            Sin cobertura PQTX para este código postal
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            No hay servicio domicilio ni sucursal Ocurre cercana. Selecciona otra paquetería.
                          </Typography>
                        </Box>
                      </Box>
                    ) : instrPriceEstimate?.type === 'ocurre' ? (
                      <>
                        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#E3F2FD', border: '1px solid #90CAF9', display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                          <Typography sx={{ fontSize: 20, mt: 0.1 }}>🏪</Typography>
                          <Box>
                            <Typography variant="body2" fontWeight={700} sx={{ color: '#1565C0' }}>
                              Entrega en sucursal Ocurre — C.P. {instrPriceEstimate.usedZip}
                            </Typography>
                            {instrPriceEstimate.nearestBranch && (
                              <Typography variant="caption" sx={{ color: '#E65100', fontWeight: 600, display: 'block' }}>
                                ⚠️ Sin cobertura domicilio. Se usará la sucursal más cercana (CP {instrPriceEstimate.usedZip}).
                              </Typography>
                            )}
                            {instrPriceEstimate.branch?.name && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                Sucursal: {instrPriceEstimate.branch.name}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#F3F8FF', border: '1px solid #BBDEFB', display: 'flex', alignItems: 'center', gap: 1.5 }}>
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
                        </Box>
                      </>
                    ) : instrPriceEstimate ? (
                      <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#F3F8FF', border: '1px solid #BBDEFB', display: 'flex', alignItems: 'center', gap: 1.5 }}>
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
                      </Box>
                    ) : null}
                  </Box>
                </Collapse>
              )}

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
        onClose={() => { setAddressesModalOpen(false); setEditingAddress(null); setDeleteAddressConfirm(null); }}
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
                        <Box sx={{ display: 'flex', gap: 0.5, ml: 1 }}>
                          {advisorInstructionsEnabled && (
                            <Button
                              size="small"
                              variant={isEditing ? 'contained' : 'outlined'}
                              onClick={() => isEditing ? setEditingAddress(null) : handleEditAddress(addr)}
                              sx={{ textTransform: 'none', fontSize: '0.7rem',
                                ...(isEditing ? { bgcolor: '#7B1FA2', '&:hover': { bgcolor: '#6a1b9a' } } : { borderColor: '#7B1FA2', color: '#7B1FA2' })
                              }}
                            >
                              {isEditing ? 'Cancelar' : 'Editar'}
                            </Button>
                          )}
                          {(addr.created_by_advisor_id === null || addr.created_by_advisor_id === undefined || Number(addr.created_by_advisor_id) === Number(dashboardData?.advisor?.id)) && (
                            deleteAddressConfirm === addr.id ? (
                              <Box sx={{ display: 'flex', gap: 0.5 }}>
                                <Button size="small" variant="contained" color="error" onClick={() => handleDeleteAddress(addr.id)}
                                  sx={{ textTransform: 'none', fontSize: '0.7rem' }}>
                                  Confirmar
                                </Button>
                                <Button size="small" variant="outlined" onClick={() => setDeleteAddressConfirm(null)}
                                  sx={{ textTransform: 'none', fontSize: '0.7rem' }}>
                                  No
                                </Button>
                              </Box>
                            ) : (
                              <Button size="small" variant="outlined" color="error" onClick={() => setDeleteAddressConfirm(addr.id)}
                                sx={{ textTransform: 'none', fontSize: '0.7rem' }}>
                                Eliminar
                              </Button>
                            )
                          )}
                        </Box>
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
            <TextField
              label="C.P. *" size="small" value={newAddrForm.zipCode}
              onChange={e => handleZipCodeChange(e.target.value)}
              inputProps={{ maxLength: 5 }}
              InputProps={{ endAdornment: newAddrZipLoading ? <CircularProgress size={16} /> : null }}
            />
            <TextField label="Colonia" size="small" value={newAddrForm.neighborhood} onChange={e => setNewAddrForm(p => ({ ...p, neighborhood: e.target.value }))} />
            <TextField label="Ciudad *" size="small" value={newAddrForm.city} onChange={e => setNewAddrForm(p => ({ ...p, city: e.target.value }))} />
            <TextField label="Estado *" size="small" value={newAddrForm.state} onChange={e => setNewAddrForm(p => ({ ...p, state: e.target.value }))} />
            <TextField label="Teléfono de contacto" size="small" value={newAddrForm.phone} onChange={e => setNewAddrForm(p => ({ ...p, phone: e.target.value }))} />
            <TextField label="Referencias" size="small" value={newAddrForm.reference} onChange={e => setNewAddrForm(p => ({ ...p, reference: e.target.value }))} />
            <TextField label="Horario de entrega" size="small" placeholder="Ej. Lun-Vie 9am-6pm" value={newAddrForm.receptionHours} onChange={e => setNewAddrForm(p => ({ ...p, receptionHours: e.target.value }))} sx={{ gridColumn: '1 / -1' }} />
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

      {/* ═════════ Dialog: Conversación de ticket (asesor, global) ═════════ */}
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
                <Typography variant="caption" sx={{ opacity: 0.85, display: 'block' }}>
                  {selectedAdvisorTicket.ticket_folio}
                  {selectedAdvisorTicket.client_name ? ` · ${selectedAdvisorTicket.client_name}` : ''}
                  {selectedAdvisorTicket.client_box_id ? ` · Box ${selectedAdvisorTicket.client_box_id}` : ''}
                </Typography>
                {selectedAdvisorTicket.client_number && (
                  <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                    👤 Cliente: {selectedAdvisorTicket.client_number}
                  </Typography>
                )}
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
                    alignSelf: (msg.sender_type === 'employee' || msg.sender_type === 'agent') ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    bgcolor: (msg.sender_type === 'employee' || msg.sender_type === 'agent') ? '#F05A28' : '#f5f5f5',
                    color: (msg.sender_type === 'employee' || msg.sender_type === 'agent') ? '#fff' : '#111',
                    borderRadius: 2, px: 1.5, py: 1,
                  }}>
                    {msg.message && (
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{msg.message}</Typography>
                    )}
                    {attUrls.length > 0 && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: msg.message ? 0.75 : 0 }}>
                        {attUrls.map((u, i) => {
                          const clean = u.split('?')[0].toLowerCase();
                          const isPdf = clean.endsWith('.pdf') || clean.includes('/pdf');
                          const isImg = /\.(png|jpe?g|gif|webp|heic|heif|bmp|svg)$/i.test(clean);
                          const fileName = u.split('?')[0].split('/').pop() || `adjunto-${i + 1}`;
                          if (isImg) {
                            return (
                              <a key={i} href={u} target="_blank" rel="noreferrer" download={fileName}>
                                <Box component="img" src={u} alt={fileName}
                                  sx={{ width: 110, height: 110, objectFit: 'cover', borderRadius: 1, border: '1px solid rgba(0,0,0,0.1)' }}
                                />
                              </a>
                            );
                          }
                          return (
                            <a key={i} href={u} target="_blank" rel="noreferrer" download={fileName}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '6px 10px', borderRadius: 6, textDecoration: 'none',
                                background: (msg.sender_type === 'employee' || msg.sender_type === 'agent') ? 'rgba(255,255,255,0.2)' : '#fff',
                                color: (msg.sender_type === 'employee' || msg.sender_type === 'agent') ? '#fff' : (isPdf ? '#c62828' : '#2E7D32'),
                                border: (msg.sender_type === 'employee' || msg.sender_type === 'agent') ? 'none' : '1px solid #ddd',
                                maxWidth: 220,
                              }}>
                              {isPdf ? <PdfIcon sx={{ fontSize: 18 }} /> : <FileIcon sx={{ fontSize: 18 }} />}
                              <Typography variant="caption" fontWeight={600} noWrap sx={{ maxWidth: 170 }}>
                                {fileName}
                              </Typography>
                            </a>
                          );
                        })}
                      </Box>
                    )}
                    <Typography variant="caption" sx={{ opacity: 0.7, display: 'block', textAlign: 'right', mt: 0.3 }}>
                      {new Date(msg.created_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
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
                      hidden type="file" accept="image/*" multiple
                      onChange={(e) => { const fs = Array.from(e.target.files || []); setTicketReplyFiles(prev => [...prev, ...fs]); e.target.value = ''; }}
                    />
                  </IconButton>
                  <IconButton component="label" sx={{ color: '#F05A28' }} title="Adjuntar PDF o Excel">
                    <AttachFileIcon />
                    <input
                      hidden type="file"
                      accept="application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                      multiple
                      onChange={(e) => { const fs = Array.from(e.target.files || []); setTicketReplyFiles(prev => [...prev, ...fs]); e.target.value = ''; }}
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

      {/* ═════════ Dialog: Generador de Cotización Formal ═════════ */}
      <Dialog open={formalQuoteDialogOpen} onClose={() => setFormalQuoteDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: '#FF9800', color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <QuoteIcon /> Nueva Cotización Formal (vigencia 7 días)
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 2 }}>
          <Grid container spacing={2}>
            {/* Cliente */}
            <Grid size={12}>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom sx={{ color: '#F05A28' }}>1. Cliente</Typography>
              <Autocomplete
                options={formalQuoteClients}
                value={formalQuoteClient}
                onChange={(_, v) => setFormalQuoteClient(v)}
                onInputChange={async (_, val, reason) => {
                  if (reason !== 'input') return;
                  const q = (val || '').trim();
                  if (q.length < 1) return;
                  try {
                    const r = await api.get(`/advisor/clients?search=${encodeURIComponent(q)}&limit=30`);
                    const data = r.data?.clients || r.data || [];
                    if (Array.isArray(data)) setFormalQuoteClients(data);
                  } catch { /* noop */ }
                }}
                filterOptions={(x) => x}
                noOptionsText="Sin resultados"
                getOptionLabel={(o: any) => o ? `${o.full_name || o.name || '—'}${o.box_id ? ` · Box ${o.box_id}` : ''}${o.email ? ` · ${o.email}` : ''}` : ''}
                isOptionEqualToValue={(a: any, b: any) => a?.id === b?.id}
                renderInput={(params) => <TextField {...params} size="small" label="Buscar cliente por nombre / box / email" />}
              />
            </Grid>

            {/* Servicio */}
            <Grid size={12}>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom sx={{ color: '#F05A28', mt: 1 }}>2. Servicio</Typography>
              <Grid container spacing={1}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Servicio</InputLabel>
                    <Select
                      value={formalQuoteServicio}
                      label="Servicio"
                      onChange={(e) => { setFormalQuoteServicio(e.target.value as any); setFormalQuoteSubservicio(''); setFormalQuoteCalcResult(null); }}
                    >
                      <MenuItem value="maritimo">🚢 Marítimo China</MenuItem>
                      <MenuItem value="aereo">✈️ Aéreo China</MenuItem>
                      <MenuItem value="pobox">📦 PO Box USA</MenuItem>
                      <MenuItem value="dhl">🚚 DHL Nacional</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Subservicio</InputLabel>
                    <Select
                      value={formalQuoteSubservicio}
                      label="Subservicio"
                      onChange={(e) => setFormalQuoteSubservicio(e.target.value)}
                    >
                      <MenuItem value="">— Default —</MenuItem>
                      {formalQuoteServicio === 'maritimo' && [
                        <MenuItem key="vol" value="por_volumen">Marítimo por volumen (LCL)</MenuItem>,
                        <MenuItem key="fcl" value="fcl_40">FCL 40 pies</MenuItem>,
                      ]}
                      {formalQuoteServicio === 'aereo' && [
                        <MenuItem key="tdi" value="tdi_aereo">TDI Aéreo</MenuItem>,
                        <MenuItem key="exp" value="tdi_express">Aéreo Express</MenuItem>,
                      ]}
                    </Select>
                  </FormControl>
                </Grid>
                {formalQuoteServicio === 'maritimo' && (
                  <Grid size={12}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Categoría</InputLabel>
                      <Select value={formalQuoteCategoria} label="Categoría" onChange={(e) => setFormalQuoteCategoria(e.target.value)}>
                        <MenuItem value="Generico">Genérico</MenuItem>
                        <MenuItem value="StartUp">StartUp</MenuItem>
                        <MenuItem value="Sensible">Sensible</MenuItem>
                        <MenuItem value="Logotipo">Logotipo / Marca</MenuItem>
                        <MenuItem value="FCL40">FCL 40 pies</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                )}
              </Grid>
            </Grid>

            {/* Dimensiones */}
            <Grid size={12}>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom sx={{ color: '#F05A28', mt: 1 }}>3. Dimensiones y peso</Typography>
              <Grid container spacing={1}>
                <Grid size={{ xs: 4, sm: 2 }}><TextField size="small" fullWidth label="Largo (cm)" type="number" value={formalQuoteLargo} onChange={e => setFormalQuoteLargo(e.target.value)} /></Grid>
                <Grid size={{ xs: 4, sm: 2 }}><TextField size="small" fullWidth label="Ancho (cm)" type="number" value={formalQuoteAncho} onChange={e => setFormalQuoteAncho(e.target.value)} /></Grid>
                <Grid size={{ xs: 4, sm: 2 }}><TextField size="small" fullWidth label="Alto (cm)" type="number" value={formalQuoteAlto} onChange={e => setFormalQuoteAlto(e.target.value)} /></Grid>
                <Grid size={{ xs: 6, sm: 2 }}><TextField size="small" fullWidth label="Peso (kg)" type="number" value={formalQuotePeso} onChange={e => setFormalQuotePeso(e.target.value)} /></Grid>
                <Grid size={{ xs: 6, sm: 2 }}><TextField size="small" fullWidth label="CBM" type="number" value={formalQuoteCbm} onChange={e => setFormalQuoteCbm(e.target.value)} /></Grid>
                <Grid size={{ xs: 12, sm: 2 }}><TextField size="small" fullWidth label="Cantidad" type="number" value={formalQuoteCantidad} onChange={e => setFormalQuoteCantidad(e.target.value)} /></Grid>
                <Grid size={12}>
                  <TextField size="small" fullWidth multiline minRows={2} label="Descripción de mercancía (opcional)" value={formalQuoteDescripcion} onChange={e => setFormalQuoteDescripcion(e.target.value)} />
                </Grid>
              </Grid>
              <Box sx={{ mt: 1.5, display: 'flex', gap: 1, alignItems: 'stretch', flexWrap: 'wrap' }}>
                <Button variant="outlined" onClick={handleCalculateFormalQuote} disabled={formalQuoteCalculating} sx={{ textTransform: 'none' }}>
                  {formalQuoteCalculating ? <CircularProgress size={18} /> : 'Calcular precio'}
                </Button>
                {formalQuoteCalcResult && (
                  <Box
                    sx={{
                      flex: 1,
                      minWidth: 260,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      bgcolor: '#FFF3E0',
                      border: '1px solid #FFB74D',
                      borderRadius: 1.5,
                      px: 1.5,
                      py: 1,
                    }}
                  >
                    <Typography variant="body2" fontWeight={700} sx={{ color: '#E65100' }}>
                      Precio del Servicio
                    </Typography>
                    <Typography variant="body2" fontWeight={800} sx={{ color: '#E65100' }}>
                      ${Number(formalQuoteCalcResult.precio_mxn).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                      <Box component="span" sx={{ color: '#A0522D', fontWeight: 600, ml: 1 }}>
                        · USD ${Number(formalQuoteCalcResult.precio_usd).toFixed(2)}
                      </Box>
                    </Typography>
                  </Box>
                )}
              </Box>
            </Grid>

            {/* GEX */}
            <Grid size={12}>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom sx={{ color: '#F05A28', mt: 1 }}>4. Garantía Extendida (GEX)</Typography>
              <FormControlLabel
                control={<Switch checked={formalQuoteGexEnabled} onChange={(e) => setFormalQuoteGexEnabled(e.target.checked)} color="warning" />}
                label="🛡️ Agregar Garantía Extendida (GEX) — prima 5% del valor declarado"
              />
              {formalQuoteGexEnabled && (() => {
                const gexTc = Number(formalQuoteCalcResult?.tipo_cambio) || formalQuoteGexFallbackTc || 0;
                const rawVal = Number(formalQuoteGexValor) || 0;
                const valMxn = formalQuoteGexCurrency === 'USD' ? rawVal * gexTc : rawVal;
                const valUsd = formalQuoteGexCurrency === 'MXN' && gexTc > 0 ? rawVal / gexTc : (formalQuoteGexCurrency === 'USD' ? rawVal : 0);
                const variable5 = Math.round(valMxn * 0.05 * 100) / 100;
                const totalPrima = Math.round((variable5 + 625) * 100) / 100;
                return (
                <Grid container spacing={1} sx={{ mt: 0.5 }}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      size="small" fullWidth
                      label={`Valor declarado (${formalQuoteGexCurrency})`}
                      type="number"
                      value={formalQuoteGexValor}
                      onChange={e => setFormalQuoteGexValor(e.target.value)}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <Select
                              value={formalQuoteGexCurrency}
                              onChange={e => setFormalQuoteGexCurrency(e.target.value as 'MXN' | 'USD')}
                              variant="standard"
                              disableUnderline
                              sx={{ fontSize: 13, fontWeight: 700, color: '#F05A28', '& .MuiSelect-select': { py: 0, pr: '20px !important' } }}
                            >
                              <MenuItem value="MXN">MXN</MenuItem>
                              <MenuItem value="USD">USD</MenuItem>
                            </Select>
                          </InputAdornment>
                        )
                      }}
                      helperText={(() => {
                        if (rawVal > 0 && gexTc > 0) {
                          if (formalQuoteGexCurrency === 'USD') {
                            return `≈ $${valMxn.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN (TC ${gexTc.toFixed(2)})`;
                          }
                          return `≈ USD $${valUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (TC ${gexTc.toFixed(2)})${formalQuoteTicketId ? ' · Autocompletado del ticket' : ''}`;
                        }
                        if (rawVal > 0 && gexTc === 0) return 'Calcula el precio para obtener TC de conversión';
                        return formalQuoteTicketId ? 'Autocompletado del ticket' : ' ';
                      })()}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <Box sx={{ bgcolor: '#FAFAFA', border: '1px solid #EEE', borderRadius: 1.5, px: 1.5, py: 1, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="caption" sx={{ color: '#888', fontWeight: 600 }}>Variable (5%)</Typography>
                      <Typography variant="body2" fontWeight={700} sx={{ color: '#333' }}>
                        ${variable5.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: '#999', display: 'block', mt: 0.25, ml: 0.5 }}>Calculado automáticamente</Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <Box sx={{ bgcolor: '#FAFAFA', border: '1px solid #EEE', borderRadius: 1.5, px: 1.5, py: 1, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="caption" sx={{ color: '#888', fontWeight: 600 }}>Fijo Póliza</Typography>
                      <Typography variant="body2" fontWeight={700} sx={{ color: '#333' }}>$625.00</Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: '#999', display: 'block', mt: 0.25, ml: 0.5 }}>Costo fijo MXN</Typography>
                  </Grid>
                  <Grid size={12}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 1.5, px: 1.5, py: 1 }}>
                      <Typography variant="body2" fontWeight={700} sx={{ color: '#E65100' }}>Total Prima GEX</Typography>
                      <Typography variant="body2" fontWeight={800} sx={{ color: '#E65100' }}>
                        ${totalPrima.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
                );
              })()}
            </Grid>

            {/* Resumen */}
            {formalQuoteCalcResult && (() => {
              const resumenTc = Number(formalQuoteCalcResult?.tipo_cambio) || formalQuoteGexFallbackTc || 0;
              const resumenRaw = Number(formalQuoteGexValor) || 0;
              const resumenValMxn = formalQuoteGexCurrency === 'USD' ? resumenRaw * resumenTc : resumenRaw;
              return (
              <Grid size={12}>
                <Paper variant="outlined" sx={{ p: 2, bgcolor: '#FFF8E1', borderColor: '#FFB74D' }}>
                  <Typography variant="subtitle2" fontWeight={700} gutterBottom>Resumen</Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2">Servicio</Typography>
                    <Typography variant="body2" fontWeight={700}>${Number(formalQuoteCalcResult.precio_mxn).toLocaleString('es-MX')} MXN</Typography>
                  </Box>
                  {formalQuoteGexEnabled && (
                    <>
                      {resumenValMxn > 0 && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2">GEX Variable (5% de ${resumenValMxn.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</Typography>
                          <Typography variant="body2" fontWeight={700}>${(resumenValMxn * 0.05).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</Typography>
                        </Box>
                      )}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2">Fijo Póliza</Typography>
                        <Typography variant="body2" fontWeight={700}>$625.00 MXN</Typography>
                      </Box>
                    </>
                  )}
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="subtitle1" fontWeight={700}>TOTAL</Typography>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#F05A28' }}>
                      ${(Number(formalQuoteCalcResult.precio_mxn) + (formalQuoteGexEnabled ? (resumenValMxn * 0.05 + 625) : 0)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    Vigencia: 7 días naturales desde hoy. TC: ${Number(formalQuoteCalcResult.tipo_cambio).toFixed(2)}
                  </Typography>
                </Paper>
              </Grid>
              );
            })()}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormalQuoteDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleGenerateFormalQuotePdf}
            disabled={formalQuoteGenerating || !formalQuoteCalcResult || !formalQuoteClient}
            startIcon={formalQuoteGenerating ? <CircularProgress size={16} color="inherit" /> : <PdfIcon />}
            sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#C44114' }, fontWeight: 700, textTransform: 'none' }}
          >
            Generar PDF
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

      <AdvisorQuoteRequestModal
        open={quoteRequestOpen}
        onClose={() => setQuoteRequestOpen(false)}
        onSuccess={() => {
          setQuoteRequestOpen(false);
          setSnackbar({ open: true, message: '✅ Solicitud enviada. El equipo la revisará pronto.', severity: 'success' });
          fetchAdvisorTickets();
        }}
      />
    </Box>
  );
}
