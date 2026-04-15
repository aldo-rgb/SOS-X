// ============================================
// DASHBOARD - CLIENTE
// Panel principal para Clientes con portal completo
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Avatar,
  Chip,
  TextField,
  InputAdornment,
  Button,
  Alert,
  Tabs,
  Tab,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Checkbox,
  MenuItem,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Switch,
  Pagination,
  useTheme,
  useMediaQuery,
  BottomNavigation,
  BottomNavigationAction,
  Select,
  InputLabel,
  Autocomplete,
  FormGroup,
} from '@mui/material';
import {
  LocalShipping as ShippingIcon,
  Inventory as InventoryIcon,
  AttachMoney as MoneyIcon,
  Search as SearchIcon,
  CheckCircle as CheckCircleIcon,
  Flight as FlightIcon,
  DirectionsBoat as BoatIcon,
  LocalPostOffice as PostOfficeIcon,
  ContentCopy as CopyIcon,
  QrCode as QrCodeIcon,
  Calculate as CalculateIcon,
  AccountBalanceWallet as WalletIcon,
  Receipt as ReceiptIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  HelpOutline as HelpIcon,
  LocalShipping as TruckIcon,
  SupportAgent as SupportIcon,
  Close as CloseIcon,
  Security as SecurityIcon,
  LocationOn as LocationOnIcon,
  History as HistoryIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  CreditCard as CreditCardIcon,
  AccountBalance as AccountBalanceIcon,
  Star as StarIcon,
  ChatBubble as ChatBubbleIcon,
  Person as PersonIcon,
  ConfirmationNumber,
  Scale as ScaleIcon,
  Lock as LockIcon,
  Payment as PaymentIcon,
  AddPhotoAlternate as AddPhotoIcon,
  Send as SendIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  Block as BlockIcon,
  WarningAmber as WarningAmberIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
  ChevronRight as ChevronRightIcon,
  Share as ShareIcon,
  CardGiftcard as GiftIcon,
  People as PeopleIcon,
  Home as HomeIcon,
  Payments as PaymentsIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { Collapse } from '@mui/material';
import api from '../services/api';

const ORANGE = '#F05A28';
const GREEN = '#4CAF50';
const BLUE = '#2196F3';
const BLACK = '#111111';
const SHOW_TEST_BUTTON = false; // Cambiar a true para mostrar botón TEST: Confirmar Pago

interface ClientStats {
  casillero: string;
  direccion_usa: {
    nombre: string;
    direccion: string;
    ciudad: string;
    estado: string;
    zip: string;
  };
  paquetes: {
    en_transito: number;
    en_bodega: number;
    listos_recoger: number;
    entregados_mes: number;
  };
  financiero: {
    saldo_pendiente: number;
    saldo_por_servicio?: Array<{
      servicio: string;
      monto: number;
      moneda: string;
      icono: string;
    }>;
    saldo_favor: number;
    credito_disponible: number;
    ultimo_pago: string;
  };
}

interface PackageTracking {
  id: number;
  tracking: string;
  descripcion: string;
  servicio: string;
  shipment_type?: string;
  status: string;
  status_label: string;
  fecha_estimada: string;
  monto: number;
  client_paid?: boolean;
  assigned_address_id?: number;
  delivery_address_id?: number;
  has_delivery_instructions?: boolean;
  needs_instructions?: boolean;
  has_gex?: boolean;
  gex_folio?: string;
  // Campos adicionales para detalle
  weight?: number;
  dimensions?: string;
  cbm?: number;
  declared_value?: number;
  created_at?: string;
  updated_at?: string;
  is_master?: boolean;
  total_boxes?: number;
  included_guides?: IncludedGuide[];
  tracking_provider?: string;
  image_url?: string;
  destination_address?: string;
  destination_city?: string;
  destination_contact?: string;
  // Campos de precio aéreo China
  air_sale_price?: number;
  air_price_per_kg?: number;
  air_tariff_type?: string;
  pro_name?: string;
  // Campos DHL
  product_type?: string;
  monto_currency?: string;
  dhl_sale_price_usd?: number;
  // Campos marítimo
  maritime_sale_price_usd?: number;
  merchandise_type?: string;
  // PO Box
  pobox_venta_usd?: number;
  // TC registrado al asignar costo
  registered_exchange_rate?: number;
}

interface IncludedGuide {
  id: number;
  tracking: string;
  tracking_provider?: string;
  description?: string;
  weight?: number;
  dimensions?: string;
  cbm?: number;
  declared_value?: number;
  box_number?: number;
  status?: string;
}

interface Invoice {
  id: number;
  folio: string;
  fecha: string;
  total: number;
  status: string;
  pdf_url?: string;
  xml_url?: string;
}

// Interfaces para direcciones de bodega
interface WarehouseAddress {
  alias: string;
  address_line1: string;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string;
  contact_name: string | null;
  contact_phone: string | null;
  is_primary: boolean;
}

interface ServiceAddresses {
  serviceType: string;
  serviceName: string;
  icon: string;
  addresses: WarehouseAddress[];
}

// Direcciones de entrega del cliente
interface DeliveryAddress {
  id: number;
  alias: string;
  contact_name: string;
  street: string;
  exterior_number: string;
  interior_number?: string;
  colony?: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  phone?: string;
  reference?: string;
  is_default: boolean;
  default_for_service?: string;
  carrier_config?: Record<string, string>;
}

// Métodos de pago del cliente
interface PaymentMethod {
  id: number;
  type: 'card' | 'paypal' | 'bank_transfer';
  last_four?: string;
  card_brand?: string;
  paypal_email?: string;
  bank_name?: string;
  clabe?: string;
  alias: string;
  is_default: boolean;
}

// Wallet/Monedero
interface WalletStatus {
  wallet_balance: number;
  virtual_clabe: string | null;
  has_credit: boolean;
  credit_limit: number;
  used_credit: number;
  available_credit: number;
  credit_days: number;
  is_credit_blocked: boolean;
  pending_invoices: CreditInvoice[];
  total_pending: number;
}

interface CreditInvoice {
  id: number;
  invoice_number: string;
  amount: number;
  amount_paid: number;
  pending_amount: number;
  due_date: string;
  status: string;
  is_overdue: boolean;
}

interface ServiceConfigItem {
  type: string;
  name: string;
  icon: string;
  timeframe: string;
  tutorial: string;
}

// Filtros de servicio
type ServiceFilter = 'all' | 'china_air' | 'china_sea' | 'usa_pobox' | 'dhl';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function DashboardClient() {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const SERVICE_CONFIG = useMemo<ServiceConfigItem[]>(() => [
    { type: 'china_air', name: t('cd.services.china_air'), icon: '✈️', timeframe: t('cd.services.china_air_time'), tutorial: t('cd.services.china_air_tutorial') },
    { type: 'china_sea', name: t('cd.services.china_sea'), icon: '🚢', timeframe: t('cd.services.china_sea_time'), tutorial: t('cd.services.china_sea_tutorial') },
    { type: 'usa_pobox', name: t('cd.services.usa_pobox'), icon: '📦', timeframe: t('cd.services.usa_pobox_time'), tutorial: t('cd.services.usa_pobox_tutorial') },
    { type: 'mx_cedis', name: t('cd.services.mx_cedis'), icon: '📍', timeframe: t('cd.services.mx_cedis_time'), tutorial: t('cd.services.mx_cedis_tutorial') },
  ], [t]);

  const statusSteps = useMemo(() => [
    t('cd.steps.ordered'), t('cd.steps.inTransit'), t('cd.steps.customs'),
    t('cd.steps.warehouse'), t('cd.steps.ready'), t('cd.steps.delivered')
  ], [t]);

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [packages, setPackages] = useState<PackageTracking[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [userName, setUserName] = useState('');
  const [boxId, setBoxId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  
  // Direcciones de envío por servicio
  const [serviceAddresses, setServiceAddresses] = useState<ServiceAddresses[]>([]);
  
  // Filtro de servicio para Mis Envíos
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all');
  const [instructionFilter, setInstructionFilter] = useState<'all' | 'sin' | 'con'>('all');
  
  // Modal de tutorial de dirección
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialService, setTutorialService] = useState<ServiceConfigItem | null>(null);
  
  // Centro de Ayuda
  const [helpCenterOpen, setHelpCenterOpen] = useState(false);
  
  // Tipos de cambio USD → MXN por servicio
  const [tipoCambioPorServicio, setTipoCambioPorServicio] = useState<Record<string, number>>({});
  const [tipoCambioBase, setTipoCambioBase] = useState<number>(18.00);
  
  // Helper: obtener TC Final según tipo de servicio del paquete
  const getTipoCambio = (servicio?: string, shipmentType?: string): number => {
    if (shipmentType === 'maritime' || servicio === 'SEA_CHN_MX' || servicio === 'FCL_CHN_MX') {
      return tipoCambioPorServicio['maritimo'] || tipoCambioBase;
    }
    if (shipmentType === 'china_air' || servicio === 'AIR_CHN_MX') {
      return tipoCambioPorServicio['tdi'] || tipoCambioBase;
    }
    if (servicio === 'POBOX_USA' || shipmentType === 'air') {
      return tipoCambioPorServicio['pobox_usa'] || tipoCambioBase;
    }
    if (shipmentType === 'dhl' || servicio === 'AA_DHL' || servicio === 'DHL_MTY') {
      return tipoCambioPorServicio['dhl_monterrey'] || tipoCambioBase;
    }
    return tipoCambioBase;
  };
  
  // Info del asesor asignado
  const [advisorInfo, setAdvisorInfo] = useState<{
    id: number;
    name: string;
    phone: string;
    email: string;
    photo?: string;
  } | null>(null);
  
  // Modal Vincular Asesor
  const [advisorModalOpen, setAdvisorModalOpen] = useState(false);
  const [advisorCode, setAdvisorCode] = useState('');
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advisorConfirmOpen, setAdvisorConfirmOpen] = useState(false);
  const [advisorLookupName, setAdvisorLookupName] = useState('');
  
  // Modal de soporte / chat
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportMessage, setSupportMessage] = useState('');
  const [supportCategory, setSupportCategory] = useState('');
  const [supportTracking, setSupportTracking] = useState('');
  const [supportImages, setSupportImages] = useState<{ file: File; preview: string }[]>([]);
  const [trackingValidation, setTrackingValidation] = useState<{ status: 'idle' | 'validating' | 'valid' | 'invalid'; message: string }>({ status: 'idle', message: '' });
  
  // Chat Virtual con Orlando (asesor IA)
  const [supportChatOpen, setSupportChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ id: number; type: 'user' | 'agent'; text: string; time: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatTicketId, setChatTicketId] = useState<number | null>(null);
  
  // Snackbar para notificaciones
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'info' | 'warning' });

  // Selección de paquetes para consolidar/pagar
  const [selectedPackageIds, setSelectedPackageIds] = useState<number[]>([]);
  
  // Paginación de paquetes
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 25;
  
  // Modal GEX (Garantía Extendida)
  const [gexModalOpen, setGexModalOpen] = useState(false);
  const [gexLoading, setGexLoading] = useState(false);
  const [gexTargetPackages, setGexTargetPackages] = useState<PackageTracking[]>([]);
  
  // Datos fiscales para facturación
  const [fiscalData, setFiscalData] = useState<{
    fiscal_razon_social: string;
    fiscal_rfc: string;
    fiscal_codigo_postal: string;
    fiscal_regimen_fiscal: string;
    fiscal_uso_cfdi: string;
    hasCompleteData: boolean;
  } | null>(null);
  
  // Modal de configuración fiscal
  const [fiscalModalOpen, setFiscalModalOpen] = useState(false);
  const [fiscalLoading, setFiscalLoading] = useState(false);
  
  const [gexValorFactura, setGexValorFactura] = useState<string>('');
  const [gexDescripcion, setGexDescripcion] = useState<string>('');
  const [gexQuote, setGexQuote] = useState<{
    exchangeRate: number;
    insuredValueMxn: number;
    variableFeeMxn: number;
    fixedFeeMxn: number;
    totalCostMxn: number;
  } | null>(null);
  const [gexQuoteLoading, setGexQuoteLoading] = useState(false);
  
  // Modal Instrucciones de Entrega
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [deliveryAddresses, setDeliveryAddresses] = useState<DeliveryAddress[]>([]);
  const [selectedDeliveryAddress, setSelectedDeliveryAddress] = useState<number | null>(null);
  const [_deliveryMethod, _setDeliveryMethod] = useState<'domicilio' | 'pickup'>('domicilio');
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  
  // Nuevos estados para el modal mejorado de instrucciones
  const [selectedCarrierService, setSelectedCarrierService] = useState<string>('local');
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');
  const [applyToFullShipment, setApplyToFullShipment] = useState<boolean>(true);
  const [pqtxQuoteLoading, setPqtxQuoteLoading] = useState<boolean>(false);
  const [boxBreakdownOpen, setBoxBreakdownOpen] = useState<Record<number, boolean>>({});
  // Por cobrar (collect) carrier states
  const [selectedCollectCarrier, setSelectedCollectCarrier] = useState<string>('');
  const [collectDocsExpanded, setCollectDocsExpanded] = useState<boolean>(false);
  const [facturaFile, setFacturaFile] = useState<File | null>(null);
  const [constanciaFile, setConstanciaFile] = useState<File | null>(null);
  const [guiaExternaFile, setGuiaExternaFile] = useState<File | null>(null);
  const [saveConstancia, setSaveConstancia] = useState<boolean>(false);
  const [wantsFacturaPaqueteria, setWantsFacturaPaqueteria] = useState<boolean>(false);
  const [savedConstanciaUrl, setSavedConstanciaUrl] = useState<string | null>(null);
  const [savedConstanciaName, setSavedConstanciaName] = useState<string | null>(null);
  
  // Load saved constancia when delivery modal opens
  useEffect(() => {
    if (!deliveryModalOpen) return;
    const loadSavedConstancia = async () => {
      try {
        const res = await api.get('/packages/saved-constancia');
        if (res.data.success && res.data.saved) {
          setSavedConstanciaUrl(res.data.file_url);
          setSavedConstanciaName(res.data.original_filename);
        }
      } catch { /* ignore */ }
    };
    loadSavedConstancia();
  }, [deliveryModalOpen]);

  // Reset applyToFullShipment and auto-select default address/carrier when modal opens
  useEffect(() => {
    if (deliveryModalOpen) {
      setApplyToFullShipment(true);
      // Auto-seleccionar dirección default para este servicio si no hay una seleccionada
      if (!selectedDeliveryAddress && deliveryAddresses.length > 0) {
        const svcKeyMap: Record<string, string> = {
          china_air: 'air', china_sea: 'maritime', usa_pobox: 'usa', dhl: 'dhl'
        };
        const svcKey = svcKeyMap[selectedServiceType] || '';
        // Buscar dirección con este servicio asignado
        const defaultAddr = deliveryAddresses.find(a => 
          a.default_for_service?.split(',').map(s => s.trim()).includes(svcKey)
        ) || deliveryAddresses.find(a => a.is_default) || deliveryAddresses[0];
        if (defaultAddr) {
          setSelectedDeliveryAddress(defaultAddr.id);
          // Auto-seleccionar carrier de carrier_config
          const carrierKey = defaultAddr.carrier_config?.[svcKey];
          if (carrierKey) {
            setSelectedCarrierService(carrierKey);
          }
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryModalOpen]);
  
  // Determinar el tipo de servicio de los paquetes seleccionados
  const selectedServiceType = useMemo(() => {
    const selected = packages.filter(p => selectedPackageIds.includes(p.id));
    if (selected.length === 0) return 'china_air';
    const raw = selected[0]?.shipment_type || selected[0]?.servicio || 'china_air';
    // Mapear los valores internos del DB a los identificadores del carrier system
    const serviceMap: Record<string, string> = {
      'AIR_CHN_MX': 'china_air', 'china_air': 'china_air', 'TDI_AEREO': 'china_air',
      'SEA_CHN_MX': 'china_sea', 'china_sea': 'china_sea', 'maritime': 'china_sea', 'MAR_CHN_MX': 'china_sea', 'fcl': 'china_sea', 'FCL_CHN_MX': 'china_sea',
      'POBOX_USA': 'usa_pobox', 'usa_pobox': 'usa_pobox', 'air': 'usa_pobox',
      'NATIONAL': 'dhl', 'dhl': 'dhl', 'mx_cedis': 'dhl', 'AA_DHL': 'dhl', 'DHL_MTY': 'dhl',
    };
    return serviceMap[raw] || 'china_air';
  }, [packages, selectedPackageIds]);

  // Total de cajas del embarque para los paquetes seleccionados
  const shipmentTotalBoxes = useMemo(() => {
    const selected = packages.filter(p => selectedPackageIds.includes(p.id));
    return selected.reduce((sum, p) => sum + (p.total_boxes && p.total_boxes > 1 ? p.total_boxes : 1), 0);
  }, [packages, selectedPackageIds]);

  // Siempre aplica a todo el embarque (preseleccionado)
  // const hasMultiBoxShipment = useMemo(() => {
  //   const selected = packages.filter(p => selectedPackageIds.includes(p.id));
  //   return selected.some(p => p.total_boxes && p.total_boxes > 1);
  // }, [packages, selectedPackageIds]);

  // Opciones de paquetería dinámicas desde la API
  const [carrierServices, setCarrierServices] = useState<{ id: string; name: string; description: string; price: string; subtext?: string; icon: string; allowsCollect?: boolean; isDynamic?: boolean; isTotalPrice?: boolean; isCollect?: boolean }[]>([]);
  // Cache de carriers por tipo de servicio para el formulario de direcciones
  const [carriersPerService, setCarriersPerService] = useState<Record<string, { id: string; name: string; icon: string }[]>>({});
  const fetchCarriersForService = async (serviceType: string) => {
    if (carriersPerService[serviceType]) return carriersPerService[serviceType];
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/carrier-options/by-service/${serviceType}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.data) {
        const mapped = data.data.filter((c: any) => c.carrier_type !== 'collect').map((c: any) => ({
          id: c.carrier_key,
          name: c.name,
          icon: (c.icon && !c.icon.startsWith('http') && !c.icon.startsWith('/')) ? c.icon : '🚛',
        }));
        setCarriersPerService(prev => ({ ...prev, [serviceType]: mapped }));
        return mapped;
      }
    } catch (err) { console.warn('Error fetching carriers for', serviceType); }
    return [];
  };
  useEffect(() => {
    const fetchCarrierOptions = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/carrier-options/by-service/${selectedServiceType}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success && data.data) {
          setCarrierServices(data.data.map((c: { carrier_key: string; name: string; description: string; price_label: string; subtext: string; icon: string; allows_collect: boolean; carrier_type: string }) => ({
            id: c.carrier_key,
            name: c.name,
            description: c.description || '',
            price: c.price_label || '',
            subtext: c.subtext || undefined,
            icon: c.icon || '🚛',
            allowsCollect: c.allows_collect || false,
            isDynamic: c.price_label === 'API',
            isTotalPrice: false,
            isCollect: c.carrier_type === 'collect' || c.allows_collect,
          })));
        }
      } catch (err) {
        // Fallback a opciones hardcoded si la API falla
        console.warn('Carrier options API failed, using defaults', err);
        const allServices = [
          { id: 'local', name: t('cd.carriers.local'), description: t('cd.carriers.localTime'), price: t('cd.carriers.localPrice'), icon: '🚛', forServices: ['china_air', 'china_sea', 'usa_pobox', 'dhl'] },
          { id: 'nacional', name: t('cd.carriers.nacional'), description: t('cd.carriers.nacionalTime'), price: t('cd.carriers.nacionalPrice'), subtext: t('cd.carriers.nacionalSubtext'), icon: '🚚', forServices: ['china_air', 'china_sea'] },
          { id: 'pickup', name: t('cd.carriers.pickup'), description: t('cd.carriers.pickupDesc'), price: t('cd.carriers.pickupPrice'), subtext: '$3 x 1 caja', icon: '📍', forServices: ['usa_pobox'] },
          { id: 'express', name: t('cd.carriers.express'), description: t('cd.carriers.expressTime'), price: t('cd.carriers.expressPrice'), subtext: '$350 x 1 caja', icon: '⚡', forServices: ['china_air', 'china_sea', 'usa_pobox', 'dhl'] },
        ];
        setCarrierServices(allServices.filter(s => s.forServices.includes(selectedServiceType)));
      }
    };
    fetchCarrierOptions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServiceType]);

  // Cotizar dinámicamente Paquete Express cuando hay carrier con price='API'
  useEffect(() => {
    const hasDynamicCarrier = carrierServices.some(s => s.isDynamic);
    if (!hasDynamicCarrier || !selectedDeliveryAddress || !deliveryModalOpen) return;

    const addr = deliveryAddresses.find(a => a.id === selectedDeliveryAddress);
    if (!addr?.zip_code) return;

    const selected = packages.filter(p => selectedPackageIds.includes(p.id));
    if (selected.length === 0) return;

    // Calcular dimensiones promedio y peso total
    let totalWeight = 0;
    let sumLength = 0, sumWidth = 0, sumHeight = 0;
    let parsedCount = 0;
    selected.forEach(pkg => {
      totalWeight += Number(pkg.weight) || 1;
      if (pkg.dimensions) {
        const parts = pkg.dimensions.replace(/cm/gi, '').split(/[×x]/i).map((s: string) => parseFloat(s.trim()));
        if (parts.length >= 3 && parts.every((n: number) => !isNaN(n) && n > 0)) {
          sumLength += parts[0]; sumWidth += parts[1]; sumHeight += parts[2];
          parsedCount++;
        }
      }
    });
    const avgLength = parsedCount > 0 ? Math.round(sumLength / parsedCount) : 30;
    const avgWidth = parsedCount > 0 ? Math.round(sumWidth / parsedCount) : 30;
    const avgHeight = parsedCount > 0 ? Math.round(sumHeight / parsedCount) : 30;

    const packageCount = selected.reduce((sum, p) => sum + (p.total_boxes && p.total_boxes > 1 ? p.total_boxes : 1), 0);

    const fetchPqtxQuote = async () => {
      // Reset price to loading state
      setCarrierServices(prev => prev.map(s =>
        s.isDynamic ? { ...s, price: 'API' } : s
      ));
      setPqtxQuoteLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/shipping/pqtx-quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            destZipCode: addr.zip_code,
            packageCount,
            weight: totalWeight > 0 ? Math.ceil(totalWeight / packageCount) : 1,
            length: avgLength,
            width: avgWidth,
            height: avgHeight,
          }),
        });
        const data = await res.json();
        if (data.success && (data.pricePerBox || data.clientPrice)) {
          const perBox = data.pricePerBox || data.clientPrice;
          setCarrierServices(prev => prev.map(s =>
            s.isDynamic
              ? { ...s, price: `$${perBox.toLocaleString('es-MX')}`, subtext: data.estimatedDays || s.subtext, isTotalPrice: false }
              : s
          ));
        } else {
          // Fallback: mostrar "Cotizar"
          setCarrierServices(prev => prev.map(s =>
            s.isDynamic && s.price === 'API' ? { ...s, price: 'Cotizar' } : s
          ));
        }
      } catch (err) {
        console.warn('Error cotizando Paquete Express:', err);
        setCarrierServices(prev => prev.map(s =>
          s.isDynamic && s.price === 'API' ? { ...s, price: 'Cotizar' } : s
        ));
      } finally {
        setPqtxQuoteLoading(false);
      }
    };
    fetchPqtxQuote();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrierServices.length, selectedDeliveryAddress, deliveryModalOpen, selectedPackageIds]);

  // Re-fetch carrier options cuando cambia el servicio (reset de precio API)
  // (ya se maneja en el useEffect anterior de fetchCarrierOptions)
  
  // Modal de Pago
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'card' | 'paypal' | 'branch'>('card');
  const [requiresInvoice, setRequiresInvoice] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [invoiceData, setInvoiceData] = useState({
    rfc: '',
    razon_social: '',
    email: '',
    uso_cfdi: 'G03',
    codigo_postal: '',
    regimen_fiscal: '601'
  });
  const paymentGatewayMethods = useMemo(() => [
    { id: 'card', name: t('cd.payment.card'), description: t('cd.payment.cardDesc'), icon: '💳', color: '#00D4AA', provider: 'OpenPay' },
    { id: 'paypal', name: 'PayPal', description: t('cd.payment.paypalDesc'), icon: '🅿️', color: '#0070ba', provider: 'PayPal' },
    { id: 'branch', name: t('cd.payment.branch'), description: t('cd.payment.branchDesc'), icon: '🏪', color: '#f39c12', provider: 'Referencia' },
  ], [t]);
  
  // Modal Historial de Paquetes
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyPackages, setHistoryPackages] = useState<PackageTracking[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  
  // Modal Detalle de Paquete
  const [packageDetailOpen, setPackageDetailOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PackageTracking | null>(null);
  const [highlightedGuideTracking, setHighlightedGuideTracking] = useState<string | null>(null);
  const [boxListExpanded, setBoxListExpanded] = useState(false);
  
  // Mis Direcciones de Entrega (tab)
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<DeliveryAddress | null>(null);
  const [addressForm, setAddressForm] = useState({
    alias: '',
    first_name: '',
    last_name: '',
    street: '',
    exterior_number: '',
    interior_number: '',
    colony: '',
    city: '',
    state: '',
    zip_code: '',
    country: 'México',
    country_code: '+52',
    phone: '',
    reference: '',
    service_types: [] as string[],
    carrier_config: {} as Record<string, string>,
  });
  const [addressSaving, setAddressSaving] = useState(false);
  const [colonyOptions, setColonyOptions] = useState<string[]>([]);
  const [zipLookupLoading, setZipLookupLoading] = useState(false);
  
  // Mis Métodos de Pago
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [showAddPaymentMethod, setShowAddPaymentMethod] = useState(false);
  const [newPaymentMethod, setNewPaymentMethod] = useState({
    type: 'card' as 'card' | 'paypal' | 'bank_transfer',
    alias: '',
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    holderName: '',
    paypalEmail: '',
    bankName: '',
    clabe: '',
    beneficiary: '',
  });
  
  // Carrusel de slides
  const [carouselSlides, setCarouselSlides] = useState<any[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  
  // Wallet Status
  const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);

  // Referidos / Invita y Gana
  const [referralCode, setReferralCode] = useState<string>('');
  const [myReferrals, setMyReferrals] = useState<any[]>([]);
  const [referralStats, setReferralStats] = useState<{ total: number; validated: number; pending: number; earnings: number }>({ total: 0, validated: 0, pending: 0, earnings: 0 });

  // Cuentas por Pagar
  const [pendingPayments, setPendingPayments] = useState<{
    totalPending: number;
    byService: { service: string; serviceName: string; companyName: string; invoices: any[]; subtotal: number }[];
    invoices: any[];
  } | null>(null);
  const [showPendingPayments, setShowPendingPayments] = useState(false);

  // Cotizador Universal
  const [quoteService, setQuoteService] = useState<string>('');
  const [cbmLargo, setCbmLargo] = useState('');
  const [cbmAncho, setCbmAncho] = useState('');
  const [cbmAlto, setCbmAlto] = useState('');
  const [cbmPeso, setCbmPeso] = useState('');
  const [quoteCantidad, setQuoteCantidad] = useState('1');
  const [quoteCategoria, setQuoteCategoria] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteResult, setQuoteResult] = useState<any>(null);
  const [publicRates, setPublicRates] = useState<any>(null);
  const [ratesLoading, setRatesLoading] = useState(false);

  useEffect(() => {
    // Limpiar datos en caché al montar el componente
    localStorage.removeItem('dashboard_data');
    localStorage.removeItem('packages_data');
    sessionStorage.clear();
    
    loadData();
    loadServiceAddresses();
    loadDeliveryAddresses();
    loadPaymentMethods();
    loadWalletStatus();
    loadReferralData();
    loadPendingPayments();
    loadCarouselSlides();
    loadAdvisorInfo();
    loadFiscalData();
    
    const user = localStorage.getItem('user');
    if (user) {
      const parsed = JSON.parse(user);
      setUserName(parsed.name?.split(' ')[0] || 'Cliente');
      setBoxId(parsed.boxId || parsed.box_id || 'N/A');
    }

    // Verificar callbacks de pago en la URL
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment_status');
    const paymentId = urlParams.get('payment_id');
    const paymentMethod = urlParams.get('method');

    if (paymentStatus && paymentId) {
      handlePaymentCallback(paymentStatus, paymentId, paymentMethod);
      // Limpiar URL después de procesar
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Manejar callbacks de las pasarelas de pago
  const handlePaymentCallback = async (status: string, paymentId: string, method: string | null) => {
    try {
      if (status === 'success' || status === 'completed') {
        setSnackbar({ 
          open: true, 
          message: `✅ ${t('cd.alerts.paymentSuccess', { method: method || '' })}`, 
          severity: 'success' 
        });
        
        // Recargar datos para actualizar el estado de los paquetes
        await loadData();
        
      } else if (status === 'cancelled' || status === 'failed') {
        setSnackbar({ 
          open: true, 
          message: status === 'cancelled' ? t('cd.alerts.paymentCancelled') : t('cd.alerts.paymentFailed'), 
          severity: 'error' 
        });
      } else if (status === 'pending') {
        setSnackbar({ 
          open: true, 
          message: t('cd.alerts.paymentPending'), 
          severity: 'info' 
        });
      }
      
      // Verificar estado del pago en el backend
      const response = await api.get(`/payments/status/${paymentId}`);
      if (response.data) {
        console.log('Payment status from backend:', response.data);
      }
      
    } catch (error) {
      console.error('Error handling payment callback:', error);
      setSnackbar({ 
        open: true, 
        message: `⚠️ Error verificando estado del pago`, 
        severity: 'warning' 
      });
    }
  };

  // Cargar información del asesor asignado
  const loadAdvisorInfo = async () => {
    try {
      const response = await api.get('/auth/profile');
      if (response.data?.advisor_id && response.data?.advisor_name) {
        setAdvisorInfo({
          id: response.data.advisor_id,
          name: response.data.advisor_name,
          phone: response.data.advisor_phone || '',
          email: response.data.advisor_email || '',
          photo: response.data.advisor_photo || undefined,
        });
      }
    } catch (error) {
      console.error('Error cargando info del asesor:', error);
    }
  };

  // Cargar slides del carrusel
  const loadCarouselSlides = async () => {
    try {
      const response = await api.get('/carousel/slides');
      if (response.data?.slides) {
        setCarouselSlides(response.data.slides);
      }
    } catch (error) {
      console.error('Error cargando carrusel:', error);
    }
  };

  // Cargar datos fiscales del usuario
  const loadFiscalData = async () => {
    try {
      const response = await api.get('/fiscal/data');
      console.log('📄 Datos fiscales recibidos:', response.data);
      if (response.data) {
        // El backend retorna { success, hasCompleteData, fiscal: { razon_social, rfc, ... } }
        const fiscal = response.data.fiscal || response.data;
        setFiscalData({
          fiscal_razon_social: fiscal.razon_social || fiscal.fiscal_razon_social || '',
          fiscal_rfc: fiscal.rfc || fiscal.fiscal_rfc || '',
          fiscal_codigo_postal: fiscal.codigo_postal || fiscal.fiscal_codigo_postal || '',
          fiscal_regimen_fiscal: fiscal.regimen_fiscal || fiscal.fiscal_regimen_fiscal || '',
          fiscal_uso_cfdi: fiscal.uso_cfdi || fiscal.fiscal_uso_cfdi || 'G03',
          hasCompleteData: response.data.hasCompleteData || false,
        });
      }
    } catch (error) {
      console.error('Error cargando datos fiscales:', error);
    }
  };

  // Guardar datos fiscales del usuario
  const handleSaveFiscalData = async () => {
    if (!invoiceData.razon_social || !invoiceData.rfc || !invoiceData.codigo_postal || !invoiceData.regimen_fiscal) {
      setSnackbar({
        open: true,
        message: t('cd.snackbar.fiscalRequired'),
        severity: 'warning'
      });
      return;
    }

    setFiscalLoading(true);
    try {
      const response = await api.put('/fiscal/data', {
        razon_social: invoiceData.razon_social,
        rfc: invoiceData.rfc.toUpperCase(),
        codigo_postal: invoiceData.codigo_postal,
        regimen_fiscal: invoiceData.regimen_fiscal,
        uso_cfdi: invoiceData.uso_cfdi || 'G03'
      });

      if (response.data.success) {
        setSnackbar({
          open: true,
          message: t('cd.snackbar.fiscalSaved'),
          severity: 'success'
        });
        
        // Recargar datos fiscales
        await loadFiscalData();
        setFiscalModalOpen(false);
        
        // Limpiar formulario
        setInvoiceData({
          razon_social: '',
          rfc: '',
          codigo_postal: '',
          regimen_fiscal: '',
          uso_cfdi: 'G03',
          email: ''
        });
      } else {
        throw new Error(response.data.error || 'Error guardando datos');
      }
    } catch (error: any) {
      console.error('Error guardando datos fiscales:', error);
      setSnackbar({
        open: true,
        message: `❌ Error: ${error.response?.data?.error || error.message}`,
        severity: 'error'
      });
    } finally {
      setFiscalLoading(false);
    }
  };

  // Cargar historial de forma silenciosa para búsquedas
  const loadHistoryForSearch = async () => {
    if (historyLoaded) return; // Ya fue cargado
    try {
      const response = await api.get('/packages/history');
      if (response.data?.packages) {
        setHistoryPackages(response.data.packages);
        setHistoryLoaded(true);
      }
    } catch (error) {
      console.error('Error cargando historial para búsqueda:', error);
    }
  };

  // Cargar historial cuando se detecta una búsqueda
  useEffect(() => {
    if (searchTerm && searchTerm.length >= 3 && !historyLoaded) {
      loadHistoryForSearch();
    }
  }, [searchTerm, historyLoaded]);

  // Auto-scroll del carrusel
  useEffect(() => {
    if (carouselSlides.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % carouselSlides.length);
    }, 4000); // Cambiar cada 4 segundos
    
    return () => clearInterval(interval);
  }, [carouselSlides.length]);

  // Cargar direcciones de entrega del cliente
  const loadDeliveryAddresses = async () => {
    try {
      const response = await api.get('/addresses');
      if (response.data?.addresses) {
        setDeliveryAddresses(response.data.addresses);
      } else {
        // Direcciones de ejemplo si no hay ninguna
        setDeliveryAddresses([
          {
            id: 1,
            alias: 'Bodega 1',
            contact_name: 'Revolución Sur 2851 Nte. B1',
            street: 'Revolución Sur',
            exterior_number: '2851 Nte. B1',
            interior_number: '',
            colony: 'Monterrey',
            city: 'Nuevo León',
            state: 'Nuevo León',
            zip_code: '64860',
            country: 'México',
            phone: '8119411741',
            reference: 'Bodega principal',
            is_default: true
          },
          {
            id: 2,
            alias: 'Bioma 120',
            contact_name: 'Bioma 1234 Int. A1',
            street: 'Bioma',
            exterior_number: '1234',
            interior_number: 'Int. A1',
            colony: 'Jardín',
            city: 'Nájiri',
            state: 'C.P.',
            zip_code: '6000',
            country: 'México',
            phone: '3000000',
            reference: 'Ubicación secundaria',
            is_default: false
          }
        ]);
      }
    } catch (error) {
      console.error('Error cargando direcciones:', error);
      // Direcciones de ejemplo como fallback
      setDeliveryAddresses([
        {
          id: 1,
          alias: 'Bodega 1',
          contact_name: 'Revolución Sur 2851 Nte. B1',
          street: 'Revolución Sur',
          exterior_number: '2851 Nte. B1',
          interior_number: '',
          colony: 'Monterrey',
          city: 'Nuevo León',
          state: 'Nuevo León',
          zip_code: '64860',
          country: 'México',
          phone: '8119411741',
          reference: 'Bodega principal',
          is_default: true
        },
        {
          id: 2,
          alias: 'Bioma 120',
          contact_name: 'Bioma 1234 Int. A1',
          street: 'Bioma',
          exterior_number: '1234',
          interior_number: 'Int. A1',
          colony: 'Jardín',
          city: 'Nájiri',
          state: 'C.P.',
          zip_code: '6000',
          country: 'México',
          phone: '3000000',
          reference: 'Ubicación secundaria',
          is_default: false
        }
      ]);
    }
  };

  // Cargar métodos de pago
  const loadPaymentMethods = async () => {
    try {
      const response = await api.get('/payment-methods');
      console.log('📳 Response métodos de pago:', response.data);
      if (response.data?.paymentMethods) {
        setPaymentMethods(response.data.paymentMethods);
      } else {
        // Datos de prueba mientras resolvemos el backend
        console.log('🔧 Usando datos de prueba para métodos de pago');
        const testMethods: PaymentMethod[] = [
          {
            id: 1,
            type: 'paypal',
            alias: 'Buyer - password123',
            paypal_email: 'buyer@example.com',
            is_default: false,
          },
          {
            id: 2,
            type: 'card',
            alias: 'Sandbox Openpay',
            last_four: '1111',
            card_brand: 'Visa',
            is_default: true,
          },
          {
            id: 3,
            type: 'card',
            alias: 'Sandbox Paypal',
            last_four: '4444',
            card_brand: 'MasterCard',
            is_default: false,
          }
        ];
        setPaymentMethods(testMethods);
      }
    } catch (error) {
      console.error('Error cargando métodos de pago:', error);
      // En caso de error, mostrar datos de prueba
      console.log('🔧 Error en backend, usando datos de prueba');
      const testMethods: PaymentMethod[] = [
        {
          id: 1,
          type: 'paypal',
          alias: 'Buyer - password123',
          paypal_email: 'buyer@example.com',
          is_default: false,
        },
        {
          id: 2,
          type: 'card',
          alias: 'Sandbox Openpay',
          last_four: '1111',
          card_brand: 'Visa',
          is_default: true,
        },
        {
          id: 3,
          type: 'card',
          alias: 'Sandbox Paypal',
          last_four: '4444',
          card_brand: 'MasterCard',
          is_default: false,
        }
      ];
      setPaymentMethods(testMethods);
    }
  };

  // Agregar método de pago
  const handleAddPaymentMethod = async () => {
    try {
      const paymentData: any = {
        type: newPaymentMethod.type,
        alias: newPaymentMethod.alias,
      };

      if (newPaymentMethod.type === 'card') {
        paymentData.last_four = newPaymentMethod.cardNumber.slice(-4);
        paymentData.card_brand = 'Visa'; // Determinar por el número
        paymentData.holder_name = newPaymentMethod.holderName;
      } else if (newPaymentMethod.type === 'paypal') {
        paymentData.paypal_email = newPaymentMethod.paypalEmail;
      } else if (newPaymentMethod.type === 'bank_transfer') {
        paymentData.bank_name = newPaymentMethod.bankName;
        paymentData.clabe = newPaymentMethod.clabe;
        paymentData.beneficiary = newPaymentMethod.beneficiary;
      }

      const response = await api.post('/payment-methods', paymentData);
      if (response.data) {
        setSnackbar({ 
          open: true, 
          message: t('cd.snackbar.paymentMethodAdded'), 
          severity: 'success' 
        });
        loadPaymentMethods(); // Recargar lista
        setShowAddPaymentMethod(false);
        // Limpiar formulario
        setNewPaymentMethod({
          type: 'card',
          alias: '',
          cardNumber: '',
          expiryDate: '',
          cvv: '',
          holderName: '',
          paypalEmail: '',
          bankName: '',
          clabe: '',
          beneficiary: '',
        });
      }
    } catch (error) {
      console.error('Error agregando método de pago:', error);
      setSnackbar({ 
        open: true, 
        message: t('cd.snackbar.paymentMethodError'), 
        severity: 'error' 
      });
    }
  };

  // Cargar estado del monedero
  const loadWalletStatus = async () => {
    try {
      const response = await api.get('/wallet/status');
      if (response.data) {
        setWalletStatus(response.data);
      }
    } catch (error) {
      console.error('Error cargando monedero:', error);
    }
  };

  // Cargar datos de referidos
  const loadReferralData = async () => {
    try {
      const [codeRes, referralsRes] = await Promise.all([
        api.get('/referidos/mi-codigo').catch(() => null),
        api.get('/referidos/mis-referidos').catch(() => null),
      ]);
      // El backend retorna { success: true, data: { codigo: "XXX", ... } }
      if (codeRes?.data?.data?.codigo) {
        setReferralCode(codeRes.data.data.codigo);
      } else if (codeRes?.data?.codigo) {
        setReferralCode(codeRes.data.codigo);
      }
      if (referralsRes?.data) {
        setMyReferrals(referralsRes.data.referrals || referralsRes.data.data?.referrals || []);
        setReferralStats(referralsRes.data.stats || referralsRes.data.data?.stats || { total: 0, validated: 0, pending: 0, earnings: 0 });
      }
    } catch (err) {
      console.error('Error cargando referidos:', err);
    }
  };

  // Cargar cuentas por pagar (pagos pendientes reales)
  const loadPendingPayments = async () => {
    try {
      const response = await api.get('/payments/pending');
      if (response.data?.success) {
        setPendingPayments(response.data);
        console.log('💸 Cuentas por pagar:', response.data.totalPending);
      }
    } catch (error) {
      console.error('Error cargando cuentas por pagar:', error);
    }
  };

  // Cargar direcciones de envío de cada servicio
  const loadServiceAddresses = async () => {
    try {
      const addresses: ServiceAddresses[] = [];
      for (const service of SERVICE_CONFIG) {
        try {
          const response = await api.get(`/services/${service.type}/info`);
          if (response.data?.addresses?.length > 0) {
            addresses.push({
              serviceType: service.type,
              serviceName: service.name,
              icon: service.icon,
              addresses: response.data.addresses,
            });
          }
        } catch (err) {
          console.log(`No hay direcciones para ${service.type}`);
        }
      }
      setServiceAddresses(addresses);
    } catch (error) {
      console.error('Error cargando direcciones:', error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Limpiar todos los datos anteriores
      setPackages([]);
      setHistoryPackages([]);
      setInvoices([]);
      
      const response = await api.get('/dashboard/client');
      if (response.data) {
        setStats(response.data.stats);
        // Debug: ver qué paquetes llegan del backend
        console.log('📦 Paquetes recibidos del backend:', response.data.packages?.length || 0);
        response.data.packages?.forEach((pkg: PackageTracking) => {
          console.log(`- ${pkg.tracking}: has_delivery_instructions=${pkg.has_delivery_instructions}, delivery_address_id=${pkg.delivery_address_id}, needs_instructions=${pkg.needs_instructions}, destination_address=${pkg.destination_address}`);
        });
        
        // Filtrar solo paquetes que existan realmente en la base de datos
        const validPackages = (response.data.packages || []).filter((pkg: PackageTracking) => 
          pkg.tracking && 
          pkg.tracking !== 'US-IBZ57499' && 
          pkg.tracking !== 'US-H6QN3188' && 
          pkg.tracking !== 'US-YVYC5519'
        );
        setPackages(validPackages);
        setInvoices(response.data.invoices || []);
        if (response.data.tipo_cambio_por_servicio) {
          setTipoCambioPorServicio(response.data.tipo_cambio_por_servicio);
        }
        if (response.data.tipo_cambio_base) {
          setTipoCambioBase(parseFloat(response.data.tipo_cambio_base));
        }
      }
    } catch (error) {
      console.error('Error cargando dashboard:', error);
      // Mostrar mensaje de error al usuario
      setSnackbar({ 
        open: true, 
        message: t('cd.snackbar.connectionError'), 
        severity: 'error' 
      });
      
      // En caso de error, mostrar datos vacíos en lugar de datos de ejemplo
      setStats({
        casillero: boxId || 'S1-1234',
        direccion_usa: {
          nombre: userName || t('cd.address.yourName'),
          direccion: `1234 Shipping Lane, Suite ${boxId || 'S1-1234'}`,
          ciudad: 'Laredo',
          estado: 'TX',
          zip: '78045',
        },
        paquetes: { en_transito: 0, en_bodega: 0, listos_recoger: 0, entregados_mes: 0 },
        financiero: { saldo_pendiente: 0, saldo_favor: 0, credito_disponible: 0, ultimo_pago: '' },
      });
      setPackages([]); // No mostrar paquetes falsos
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  // Filtrar paquetes por tipo de servicio
  const getFilteredPackages = useCallback(() => {
    let filtered = packages;
    
    // Filtro por tipo de servicio
    if (serviceFilter !== 'all') {
      filtered = filtered.filter(pkg => {
        const type = pkg.shipment_type || pkg.servicio;
        if (serviceFilter === 'china_air') return type === 'china_air' || type === 'TDI_AEREO' || type === 'AIR_CHN_MX';
        if (serviceFilter === 'china_sea') return type === 'china_sea' || type === 'maritime' || type === 'SEA_CHN_MX' || type === 'fcl' || type === 'FCL_CHN_MX';
        if (serviceFilter === 'usa_pobox') return type === 'usa_pobox' || type === 'POBOX_USA' || type === 'air' || !type;
        if (serviceFilter === 'dhl') return type === 'dhl' || type === 'mx_cedis' || type === 'NATIONAL' || type === 'AA_DHL' || type === 'DHL_MTY';
        return true;
      });
    }
    
    // Filtro por instrucciones
    if (instructionFilter === 'sin') {
      filtered = filtered.filter(pkg => !pkg.has_delivery_instructions && !pkg.delivery_address_id);
    } else if (instructionFilter === 'con') {
      filtered = filtered.filter(pkg => pkg.has_delivery_instructions || pkg.delivery_address_id);
    }

    // Filtro por búsqueda - también busca en guías incluidas (repack/consolidaciones)
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      
      // Si hay término de búsqueda, combinar paquetes activos + historial
      const allPackages = [...filtered, ...historyPackages.filter(hp => 
        // Evitar duplicados
        !filtered.some(p => p.id === hp.id)
      )];
      
      filtered = allPackages.filter(pkg => {
        // Buscar en tracking y descripción del paquete principal
        const matchesPrimary = pkg.tracking.toLowerCase().includes(term) || 
          (pkg.descripcion || '').toLowerCase().includes(term);
        
        // Si es un master/repack, buscar también en las guías incluidas
        if (pkg.included_guides && pkg.included_guides.length > 0) {
          const matchesChild = pkg.included_guides.some(guide => 
            guide.tracking.toLowerCase().includes(term) ||
            (guide.description || '').toLowerCase().includes(term)
          );
          return matchesPrimary || matchesChild;
        }
        
        return matchesPrimary;
      });
    }
    
    return filtered;
  }, [packages, serviceFilter, searchTerm, historyPackages, instructionFilter]);

  // Contadores por tipo de servicio (para badges en botones de filtro)
  const serviceCounts = useMemo(() => {
    const counts = {
      china_air: 0,
      china_sea: 0,
      usa_pobox: 0,
      dhl: 0,
      total: packages.length
    };
    
    packages.forEach(pkg => {
      const type = pkg.shipment_type || pkg.servicio;
      if (type === 'china_air' || type === 'TDI_AEREO' || type === 'AIR_CHN_MX') {
        counts.china_air++;
      } else if (type === 'china_sea' || type === 'maritime' || type === 'SEA_CHN_MX' || type === 'fcl' || type === 'FCL_CHN_MX') {
        counts.china_sea++;
      } else if (type === 'usa_pobox' || type === 'POBOX_USA' || type === 'air' || !type) {
        counts.usa_pobox++;
      } else if (type === 'dhl' || type === 'mx_cedis' || type === 'NATIONAL' || type === 'AA_DHL' || type === 'DHL_MTY') {
        counts.dhl++;
      }
    });
    
    return counts;
  }, [packages]);

  // Paquetes paginados (25 por página)
  const paginatedPackages = useMemo(() => {
    const filtered = getFilteredPackages();
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filtered.slice(startIndex, endIndex);
  }, [getFilteredPackages, currentPage]);

  const totalPages = useMemo(() => {
    return Math.ceil(getFilteredPackages().length / ITEMS_PER_PAGE);
  }, [getFilteredPackages]);

  // Resetear página y selección cuando cambia el filtro de servicio
  useEffect(() => {
    setCurrentPage(1);
    setSelectedPackageIds([]);
  }, [serviceFilter, instructionFilter, searchTerm]);

  // Abrir tutorial de dirección
  const handleOpenTutorial = (serviceType: string) => {
    const service = SERVICE_CONFIG.find(s => s.type === serviceType);
    if (service) {
      setTutorialService(service);
      setTutorialOpen(true);
    }
  };

  // Categorías de soporte
  const supportCategories = [
    { value: 'tracking', label: t('cd.support.categories.tracking') },
    { value: 'delay', label: t('cd.support.categories.delay') },
    { value: 'warranty', label: t('cd.support.categories.warranty') },
    { value: 'compensation', label: t('cd.support.categories.compensation') },
    { value: 'systemError', label: t('cd.support.categories.systemError') },
    { value: 'other', label: t('cd.support.categories.other') },
  ];

  // Validar formulario de soporte
  const isSupportFormValid = () => {
    if (!supportCategory) return false;
    if (!supportMessage.trim()) return false;
    // Tracking obligatorio excepto para Error del Sistema
    if (supportCategory !== 'systemError' && !supportTracking.trim()) return false;
    // Si hay tracking, debe estar validado
    if (supportTracking.trim() && trackingValidation.status !== 'valid') return false;
    return true;
  };

  // Validar guía contra el backend
  const validateTrackingNumber = async (tracking: string) => {
    const trimmed = tracking.trim();
    if (!trimmed) {
      setTrackingValidation({ status: 'idle', message: '' });
      return;
    }
    setTrackingValidation({ status: 'validating', message: t('cd.support.validatingTracking') });
    try {
      const response = await api.get(`/support/validate-tracking?tracking=${encodeURIComponent(trimmed)}`);
      if (response.data?.valid) {
        setTrackingValidation({ status: 'valid', message: `✅ ${t('cd.support.trackingFound')}: ${response.data.package?.description || response.data.package?.tracking || trimmed}` });
      } else {
        setTrackingValidation({ status: 'invalid', message: response.data?.error || t('cd.support.trackingNotFound') });
      }
    } catch (error: any) {
      const serverMsg = error?.response?.data?.error;
      setTrackingValidation({ status: 'invalid', message: serverMsg || t('cd.support.trackingVerifyError') });
    }
  };

  // Enviar mensaje de soporte - Crea ticket directamente en Atención Humana
  const handleSendSupport = async () => {
    if (!isSupportFormValid()) return;
    
    try {
      // Construir mensaje con tracking si aplica
      const fullMessage = supportTracking.trim() 
        ? `[Tracking: ${supportTracking}]\n\n${supportMessage}`
        : supportMessage;

      // Usar FormData para enviar imágenes
      const formData = new FormData();
      formData.append('message', fullMessage);
      formData.append('category', supportCategory);
      if (supportTracking.trim()) {
        formData.append('trackingNumber', supportTracking.trim());
      }
      formData.append('escalateDirectly', 'true');
      
      // Agregar imágenes
      supportImages.forEach((img, index) => {
        formData.append('images', img.file, `support_image_${index}.${img.file.name.split('.').pop()}`);
      });

      const response = await api.post('/support/message', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const ticketFolio = response.data?.ticketFolio || '';
      setSnackbar({ 
        open: true, 
        message: `✅ Ticket ${ticketFolio} creado. Un agente te atenderá pronto.`, 
        severity: 'success' 
      });
      setSupportMessage('');
      setSupportCategory('');
      setSupportTracking('');
      setSupportImages([]);
      setTrackingValidation({ status: 'idle', message: '' });
      setSupportOpen(false);
    } catch (error) {
      setSnackbar({ open: true, message: t('cd.snackbar.ticketError'), severity: 'error' });
    }
  };

  // Inicializar Chat Virtual con Orlando
  const initSupportChat = () => {
    const now = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const userNamePart = userName?.split(' ')[0] || t('cd.chat.clientFallback');
    setChatMessages([
      { id: 1, type: 'agent', text: t('cd.chat.greeting', { name: userNamePart }), time: now },
      { id: 2, type: 'agent', text: t('cd.chat.howCanIHelp'), time: now },
    ]);
    setChatTicketId(null);
    setChatInput('');
    setSupportChatOpen(true);
    setHelpCenterOpen(false);
  };

  // Enviar mensaje al chat virtual
  const handleSendChatMessage = async () => {
    if (!chatInput.trim()) return;
    
    const userMessage = chatInput.trim();
    const now = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    
    // Agregar mensaje del usuario inmediatamente
    const userMsg = { id: Date.now(), type: 'user' as const, text: userMessage, time: now };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);
    
    try {
      const response = await api.post('/support/message', {
        message: userMessage,
        ticketId: chatTicketId,
        category: 'other',
        language: 'es',
      });
      
      if (response.data?.ticketId) {
        setChatTicketId(response.data.ticketId);
      }
      
      // Simular tiempo de escritura (1-2 segundos)
      await new Promise(resolve => setTimeout(resolve, 1200 + Math.random() * 800));
      
      // Agregar respuesta del agente
      if (response.data?.response) {
        const agentMsg = {
          id: Date.now() + 1,
          type: 'agent' as const,
          text: response.data.response,
          time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        };
        setChatMessages(prev => [...prev, agentMsg]);
      }
    } catch (error) {
      const errorMsg = {
        id: Date.now() + 1,
        type: 'agent' as const,
        text: t('cd.chat.connectionError'),
        time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  // Vincular con asesor - paso 1: buscar asesor y mostrar confirmación con nombre
  const handleLinkAdvisor = async () => {
    if (!advisorCode.trim()) {
      setSnackbar({ open: true, message: t('cd.snackbar.advisorCodeRequired'), severity: 'warning' });
      return;
    }
    setAdvisorLoading(true);
    try {
      const response = await api.get(`/advisor/lookup/${encodeURIComponent(advisorCode.trim())}`);
      if (response.data?.success && response.data.advisor) {
        setAdvisorLookupName(response.data.advisor.name);
        setAdvisorConfirmOpen(true);
      } else {
        setSnackbar({ open: true, message: 'Código de asesor no válido', severity: 'error' });
      }
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Código de asesor no válido. Verifica e intenta de nuevo.';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setAdvisorLoading(false);
    }
  };

  // Vincular con asesor - paso 2: confirmar y enviar
  const handleConfirmLinkAdvisor = async () => {
    setAdvisorConfirmOpen(false);
    setAdvisorLoading(true);
    try {
      const response = await api.post('/advisor/request', {
        advisorCodeInput: advisorCode.trim(),
      });
      
      if (response.data?.success) {
        if (response.data.type === 'LINKED') {
          setSnackbar({ 
            open: true, 
            message: `✅ ${response.data.message}`, 
            severity: 'success' 
          });
        } else {
          setSnackbar({ 
            open: true, 
            message: `📨 ${response.data.message}`, 
            severity: 'info' 
          });
        }
        setAdvisorCode('');
        setAdvisorModalOpen(false);
        // Recargar info del asesor para actualizar la UI
        await loadAdvisorInfo();
      } else {
        setSnackbar({ open: true, message: response.data?.error || t('cd.snackbar.linkError'), severity: 'error' });
      }
    } catch (error: any) {
      const serverMsg = error?.response?.data?.error;
      setSnackbar({ 
        open: true, 
        message: serverMsg || t('cd.snackbar.serverConnectionError'), 
        severity: 'error' 
      });
    } finally {
      setAdvisorLoading(false);
    }
  };

  // Solicitar ayuda para encontrar asesor
  const handleNeedHelp = async () => {
    setAdvisorLoading(true);
    try {
      // Usar el endpoint correcto de CRM para solicitar asesor
      const response = await api.post('/advisor/request', {});
      
      if (response.data?.success) {
        const messageType = response.data.type;
        let message = response.data.message || t('cd.snackbar.requestSent');
        
        if (messageType === 'PENDING') {
          message = t('cd.snackbar.requestPending');
        } else if (messageType === 'REQUESTED') {
          message = t('cd.snackbar.requestSentAdvisor');
        }
        
        setSnackbar({ open: true, message, severity: 'success' });
        setAdvisorModalOpen(false);
      } else {
        setSnackbar({ open: true, message: response.data?.error || t('cd.snackbar.sendRequestError'), severity: 'error' });
      }
    } catch (error) {
      setSnackbar({ open: true, message: t('cd.snackbar.requestError'), severity: 'error' });
    } finally {
      setAdvisorLoading(false);
    }
  };

  // Toggle selección de paquete
  const togglePackageSelection = (id: number, pkg: PackageTracking) => {
    // Solo permitir seleccionar paquetes elegibles (no pagados, no entregados)
    if (pkg.client_paid || pkg.status === 'delivered') {
      setSnackbar({ open: true, message: t('cd.snackbar.alreadyPaid'), severity: 'info' });
      return;
    }
    
    // Si ya hay paquetes seleccionados, validar que sean del mismo tipo de servicio
    if (selectedPackageIds.length > 0 && !selectedPackageIds.includes(id)) {
      const currentSelected = packages.find(p => p.id === selectedPackageIds[0]);
      if (currentSelected && currentSelected.servicio !== pkg.servicio) {
        setSnackbar({ open: true, message: t('cd.snackbar.cannotMixServices'), severity: 'warning' });
        return;
      }
    }
    
    setSelectedPackageIds(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  // Seleccionar/Deseleccionar todos los paquetes visibles
  const toggleSelectAll = () => {
    // Si no hay un tipo de servicio seleccionado, mostrar mensaje
    if (serviceFilter === 'all') {
      setSnackbar({ open: true, message: t('cd.snackbar.selectServiceFilter'), severity: 'warning' });
      return;
    }
    
    const filtered = getFilteredPackages();
    const selectablePackages = filtered.filter(pkg => !pkg.client_paid && pkg.status !== 'delivered');
    const selectableIds = selectablePackages.map(p => p.id);
    
    const allSelected = selectableIds.every(id => selectedPackageIds.includes(id));
    
    if (allSelected) {
      setSelectedPackageIds(prev => prev.filter(id => !selectableIds.includes(id)));
    } else {
      setSelectedPackageIds(prev => [...new Set([...prev, ...selectableIds])]);
    }
  };

  // Obtener paquetes seleccionados
  const getSelectedPackages = useCallback(() => {
    return packages.filter(p => selectedPackageIds.includes(p.id));
  }, [packages, selectedPackageIds]);

  // Cotizar GEX dinámicamente al cambiar valor de factura
  const fetchGexQuote = async (valorUSD: number) => {
    if (!valorUSD || valorUSD <= 0) { setGexQuote(null); return; }
    setGexQuoteLoading(true);
    try {
      const res = await api.post('/gex/quote', { invoiceValueUsd: valorUSD });
      setGexQuote(res.data);
    } catch {
      setGexQuote(null);
    } finally {
      setGexQuoteLoading(false);
    }
  };

  // Contratar GEX para paquetes seleccionados
  const handleContractGEX = async () => {
    if (gexTargetPackages.length === 0) {
      setSnackbar({ open: true, message: t('cd.snackbar.selectPackage'), severity: 'warning' });
      return;
    }
    const valorUSD = parseFloat(gexValorFactura);
    if (!valorUSD || valorUSD <= 0) {
      setSnackbar({ open: true, message: 'Ingresa el valor de factura', severity: 'warning' });
      return;
    }
    if (!gexDescripcion.trim()) {
      setSnackbar({ open: true, message: 'Ingresa la descripción de la carga', severity: 'warning' });
      return;
    }

    setGexLoading(true);
    try {
      const firstPkg = gexTargetPackages[0];
      const isChina = firstPkg?.servicio === 'SEA_CHN_MX' || firstPkg?.servicio === 'AIR_CHN_MX' || firstPkg?.shipment_type === 'maritime' || firstPkg?.shipment_type === 'china_air';
      const isMaritime = firstPkg?.servicio === 'SEA_CHN_MX' || firstPkg?.shipment_type === 'maritime';
      const route = isMaritime ? 'Marítimo China-México' : isChina ? 'Aéreo China-México' : 'USA-México';

      const response = await api.post('/gex/warranties/self', {
        packageId: firstPkg.id,
        serviceType: firstPkg.servicio || firstPkg.shipment_type,
        boxCount: gexTargetPackages.reduce((sum, pkg) => sum + (Number(pkg.total_boxes) || 1), 0),
        weight: gexTargetPackages.reduce((sum, pkg) => sum + (Number(pkg.weight) || 0), 0),
        invoiceValueUSD: valorUSD,
        route,
        description: gexDescripcion.trim(),
        signature: 'web-contract', // Firma digital desde web
        paymentOption: 'add_to_balance', // Añadir al saldo pendiente
      });
      
      if (response.data.success) {
        const folio = response.data.warranty?.folio || '';
        const total = response.data.warranty?.totalCost || 0;
        setSnackbar({ open: true, message: `🛡️ Póliza GEX ${folio} contratada por $${total.toFixed(2)} MXN`, severity: 'success' });
        setGexModalOpen(false);
        setGexValorFactura('');
        setGexDescripcion('');
        setGexQuote(null);
        setSelectedPackageIds([]);
        loadData(); // Recargar paquetes
      }
    } catch (error) {
      setSnackbar({ open: true, message: t('cd.snackbar.gexError'), severity: 'error' });
    } finally {
      setGexLoading(false);
    }
  };

  // Asignar instrucciones de entrega
  const handleAssignDelivery = async () => {
    const selected = getSelectedPackages();
    if (selected.length === 0) {
      setSnackbar({ open: true, message: t('cd.snackbar.selectPackage'), severity: 'warning' });
      return;
    }

    if (!selectedDeliveryAddress) {
      setSnackbar({ open: true, message: t('cd.snackbar.selectAddress'), severity: 'warning' });
      return;
    }

    setDeliveryLoading(true);
    try {
      const totalBoxes = applyToFullShipment ? shipmentTotalBoxes : selectedPackageIds.length;

      // If "por_cobrar" is selected, use the actual collect carrier key
      if (selectedCarrierService === 'por_cobrar' && !selectedCollectCarrier) {
        setSnackbar({ open: true, message: 'Selecciona una paquetería para envío por cobrar', severity: 'warning' });
        setDeliveryLoading(false);
        return;
      }
      const actualCarrier = selectedCarrierService === 'por_cobrar' ? selectedCollectCarrier : selectedCarrierService;

      // Use FormData to send files along with data
      const formData = new FormData();
      formData.append('packageIds', JSON.stringify(selectedPackageIds));
      formData.append('addressId', String(selectedDeliveryAddress));
      formData.append('carrierService', actualCarrier);
      formData.append('notes', deliveryNotes);
      formData.append('applyToFullShipment', String(applyToFullShipment));
      formData.append('totalBoxes', String(totalBoxes));
      formData.append('isCollect', String(selectedCarrierService === 'por_cobrar'));
      formData.append('wantsFacturaPaqueteria', String(wantsFacturaPaqueteria));
      formData.append('saveConstancia', String(saveConstancia));

      // Attach files if present
      if (facturaFile) formData.append('factura', facturaFile);
      if (constanciaFile) formData.append('constancia', constanciaFile);
      if (guiaExternaFile) formData.append('guiaExterna', guiaExternaFile);

      const response = await api.post('/packages/assign-delivery', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      if (response.data.success) {
        setSnackbar({ open: true, message: `📍 Instrucciones asignadas exitosamente para ${applyToFullShipment ? totalBoxes : selected.length} paquete(s)`, severity: 'success' });
        setDeliveryModalOpen(false);
        setSelectedPackageIds([]);
        setSelectedDeliveryAddress(null);
        setSelectedCarrierService('local');
        setDeliveryNotes('');
        setApplyToFullShipment(false);
        setSelectedCollectCarrier(''); setCollectDocsExpanded(false); setFacturaFile(null); setConstanciaFile(null); setGuiaExternaFile(null); setSaveConstancia(false); setWantsFacturaPaqueteria(false);
        loadData(); // Recargar paquetes
      }
    } catch (error) {
      console.error('Error assigning delivery:', error);
      setSnackbar({ open: true, message: 'Error al guardar instrucciones de entrega', severity: 'error' });
      setDeliveryModalOpen(false);
      setSelectedPackageIds([]);
      setSelectedDeliveryAddress(null);
      setSelectedCarrierService('local');
      setDeliveryNotes('');
      setApplyToFullShipment(false);
      setSelectedCollectCarrier(''); setCollectDocsExpanded(false); setFacturaFile(null); setConstanciaFile(null); setGuiaExternaFile(null); setSaveConstancia(false); setWantsFacturaPaqueteria(false);
      loadData(); // Recargar paquetes
    } finally {
      setDeliveryLoading(false);
    }
  };

  // Procesar pago
  const handleProcessPayment = async () => {
    const selected = getSelectedPackages();
    if (selected.length === 0) {
      setSnackbar({ open: true, message: t('cd.snackbar.selectPackage'), severity: 'warning' });
      return;
    }

    // Validar datos de facturación si es necesaria
    if (requiresInvoice && selectedPaymentMethod !== 'branch') {
      if (!invoiceData.rfc || !invoiceData.razon_social || !invoiceData.email || !invoiceData.codigo_postal || !invoiceData.regimen_fiscal) {
        setSnackbar({ open: true, message: t('cd.snackbar.completeBilling'), severity: 'warning' });
        return;
      }
    }

    setPaymentLoading(true);
    try {
      const total = selected.reduce((sum, p) => sum + (Number(p.monto) || 0), 0);
      
      // Determinar la empresa emisora según el tipo de servicio predominante
      const serviceTypes = selected.map(p => p.servicio || 'china_air');
      const predominantService = serviceTypes.reduce((a, b, _, arr) => 
        arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b
      );
      
      // Configuración de empresa por servicio
      const companyConfig: Record<string, { company: string; rfc: string }> = {
        'china_air': { company: 'EntregaX Aéreo', rfc: 'EAE123456789' },
        'china_sea': { company: 'EntregaX Marítimo', rfc: 'EMA123456789' },
        'usa_pobox': { company: 'EntregaX USA', rfc: 'EUS123456789' },
        'dhl': { company: 'EntregaX Express', rfc: 'EEX123456789' }
      };
      
      const paymentData = {
        packageIds: selectedPackageIds,
        paymentMethod: selectedPaymentMethod,
        total: total,
        currency: 'MXN',
        invoiceRequired: requiresInvoice && selectedPaymentMethod !== 'branch',
        invoiceData: (requiresInvoice && selectedPaymentMethod !== 'branch') ? invoiceData : null,
        company: companyConfig[predominantService] || companyConfig['china_air'],
        returnUrl: `${window.location.origin}/payment-callback`,
        cancelUrl: `${window.location.origin}/payment-cancelled`
      };

      // Integración con pasarelas específicas
      if (selectedPaymentMethod === 'card') {
        // OpenPay - Tarjeta de Crédito/Débito
        const response = await api.post('/payments/openpay/card', paymentData);
        
        if (response.data.success) {
          if (response.data.requiresRedirection && response.data.paymentUrl) {
            // Redirigir a OpenPay para procesar el pago real
            setSnackbar({ 
              open: true, 
              message: t('cd.snackbar.redirectingOpenPay'), 
              severity: 'info' 
            });
            
            // Esperar un momento antes de redirigir
            setTimeout(() => {
              window.location.href = response.data.paymentUrl;
            }, 1500);
          } else if (response.data.status === 'completed') {
            // Pago completado exitosamente
            let message = '✅ Pago procesado con tarjeta exitosamente';
            
            // Si se generó factura, agregar enlaces
            if (response.data.invoice) {
              message += `\n\n📄 Factura generada:\nUUID: ${response.data.invoice.uuid}`;
              if (response.data.invoice.pdfUrl) {
                message += `\n📄 PDF: ${response.data.invoice.pdfUrl}`;
              }
            }
            
            // Si hubo error en la factura pero el pago fue exitoso
            if (response.data.invoiceError) {
              message += `\n\n⚠️ Error en factura: ${response.data.invoiceError}`;
            }
            
            setSnackbar({ 
              open: true, 
              message, 
              severity: 'success' 
            });
            
            // Si hay factura, abrir en nueva pestaña
            if (response.data.invoice?.pdfUrl) {
              setTimeout(() => {
                window.open(response.data.invoice.pdfUrl, '_blank');
              }, 1000);
            }
            
            // Recargar datos para mostrar el estado actualizado
            setTimeout(() => {
              loadData();
            }, 2000);
          } else {
            // Pago pendiente de confirmación
            setSnackbar({ 
              open: true, 
              message: `🔄 ${response.data.message}`, 
              severity: 'info' 
            });
          }
        } else {
          throw new Error(response.data.error || 'Error en el procesamiento con tarjeta');
        }
        
      } else if (selectedPaymentMethod === 'paypal') {
        // PayPal Integration
        const response = await api.post('/payments/paypal/create', paymentData);
        
        if (response.data.success && response.data.approvalUrl) {
          // Abrir PayPal en nueva ventana
          const paypalWindow = window.open(response.data.approvalUrl, '_blank', 'width=600,height=700');
          
          // Monitorear el cierre de la ventana
          const checkClosed = setInterval(() => {
            if (paypalWindow?.closed) {
              clearInterval(checkClosed);
              // Verificar el estado del pago
              setTimeout(() => {
                loadData(); // Recargar datos para ver si el pago se completó
              }, 2000);
            }
          }, 1000);
          
          let message = t('cd.snackbar.redirectingPayPal');
          if (response.data.invoiceWillBeGenerated) {
            message += '\n📄 ' + t('cd.payment.invoiceAutoGenerated');
          }
          
          setSnackbar({ 
            open: true, 
            message, 
            severity: 'info' 
          });
        } else {
          throw new Error(response.data.error || t('cd.snackbar.paypalCreateError'));
        }
        
      } else if (selectedPaymentMethod === 'branch') {
        // Pago en Sucursal - generar referencia
        const response = await api.post('/payments/branch/reference', paymentData);
        
        if (response.data.success) {
          let message = `📄 ${t('cd.payment.referenceGenerated')}: ${response.data.reference}`;
          
          if (response.data.status === 'pending') {
            message += '\n⏳ ' + t('cd.payment.branchProcessInfo');
          }
          
          if (response.data.invoiceWillBeGenerated) {
            message += '\n📄 ' + t('cd.payment.invoiceAutoGeneratedBranch');
          }
          
          setSnackbar({ 
            open: true, 
            message, 
            severity: 'info'  // Cambiar a info porque el pago aún está pendiente
          });
          
          // Mostrar modal con detalles de la referencia
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + 7);
          
          const alertMessage = `📄 ${t('cd.payment.branchAlertTitle')}\n\n${t('cd.payment.reference')}: ${response.data.reference}\n${t('cd.payment.amount')}: ${formatCurrency(total)}\n${t('cd.payment.validUntil')}: ${expiryDate.toLocaleDateString()}\n${t('cd.payment.status')}: ${t('cd.payment.pendingPayment')}\n\n${t('cd.payment.payAtBank')}${response.data.invoiceMessage ? `\n\n${response.data.invoiceMessage}` : ''}`;
          
          alert(alertMessage);
          
          // NO recargar datos aún, el pago está pendiente
        } else {
          throw new Error(response.data.error || t('cd.snackbar.referenceError'));
        }
      }

      // Limpiar formulario solo si el pago fue exitoso
      setPaymentModalOpen(false);
      setSelectedPackageIds([]);
      setRequiresInvoice(false);
      setInvoiceData({
        rfc: '',
        razon_social: '',
        email: '',
        uso_cfdi: 'G03',
        codigo_postal: '',
        regimen_fiscal: '601'
      });
      
    } catch (error) {
      console.error('Error processing payment:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const errorMessage = err.response?.data?.message || err.message || t('cd.snackbar.paymentProcessError');
      setSnackbar({ 
        open: true, 
        message: `❌ ${errorMessage}`, 
        severity: 'error' 
      });
    } finally {
      setPaymentLoading(false);
    }
  };

  // Cargar historial de paquetes entregados
  const loadHistoryPackages = async () => {
    try {
      const response = await api.get('/packages/history');
      if (response.data?.packages) {
        setHistoryPackages(response.data.packages);
        setHistoryLoaded(true);
      }
    } catch (error) {
      // Usar paquetes actuales como fallback
      setHistoryPackages(packages.filter(p => p.status === 'delivered'));
    }
    setHistoryModalOpen(true);
  };

  // FUNCIÓN TEMPORAL: Simular confirmación de pago para pruebas (oculto con SHOW_TEST_BUTTON)
  const _testConfirmPayment = async (paymentId: string, packageIds: number[], amount: number, paymentType: string) => {
    try {
      console.log('🧪 Testing payment confirmation:', { paymentId, packageIds, amount, paymentType });
      
      const response = await api.post('/payments/test/confirm', {
        paymentId,
        packageIds,
        amount,
        paymentType
      });

      if (response.data.success) {
        setSnackbar({
          open: true,
          message: t('cd.snackbar.paymentConfirmed', { count: response.data.updatedPackages }),
          severity: 'success'
        });
        
        // Recargar datos para mostrar el estado actualizado
        setTimeout(() => {
          loadData();
        }, 1000);
      } else {
        throw new Error(response.data.error || 'Error confirmando pago');
      }
    } catch (error: any) {
      console.error('Error confirmando pago de prueba:', error);
      setSnackbar({
        open: true,
        message: `❌ Error confirmando pago: ${error.response?.data?.error || error.message}`,
        severity: 'error'
      });
    }
  };

  // Guardar dirección de entrega
  const handleSaveAddress = async () => {
    if (!addressForm.first_name || !addressForm.last_name) {
      setSnackbar({ open: true, message: 'Nombre y Apellido son requeridos', severity: 'warning' });
      return;
    }
    if (!addressForm.street || !addressForm.city || !addressForm.state || !addressForm.colony) {
      setSnackbar({ open: true, message: t('cd.snackbar.addressRequired'), severity: 'warning' });
      return;
    }

    setAddressSaving(true);
    try {
      // Combinar nombre y apellido como contact_name
      const contact_name = `${addressForm.first_name.trim()} ${addressForm.last_name.trim()}`;
      // Combinar código de país + teléfono
      const phone = addressForm.phone ? `${addressForm.country_code}${addressForm.phone.replace(/\D/g, '')}` : '';
      
      const payload = {
        alias: addressForm.alias,
        contact_name,
        street: addressForm.street,
        exterior_number: addressForm.exterior_number,
        interior_number: addressForm.interior_number,
        colony: addressForm.colony,
        city: addressForm.city,
        state: addressForm.state,
        zip_code: addressForm.zip_code,
        country: addressForm.country,
        phone,
        reference: addressForm.reference,
        default_for_service: addressForm.service_types.length > 0 ? addressForm.service_types.join(',') : null,
      };
      
      let savedAddressId: number | null = null;
      
      if (editingAddress) {
        const res = await api.put(`/addresses/${editingAddress.id}`, payload);
        savedAddressId = editingAddress.id;
        void res; // used for potential future error handling
        setSnackbar({ open: true, message: t('cd.snackbar.addressUpdated'), severity: 'success' });
        // Actualizar asignación de servicios si hay cambios
        if (addressForm.service_types.length > 0) {
          try {
            // Filtrar carrier_config solo para servicios seleccionados
            const filteredCarrier: Record<string, string> = {};
            for (const svc of addressForm.service_types) {
              if (addressForm.carrier_config[svc]) filteredCarrier[svc] = addressForm.carrier_config[svc];
            }
            await api.put(`/addresses/${savedAddressId}/default-for-service`, {
              services: addressForm.service_types,
              carrier_config: Object.keys(filteredCarrier).length > 0 ? filteredCarrier : undefined,
            });
          } catch (svcErr) {
            console.error('Error asignando servicios:', svcErr);
          }
        }
      } else {
        const res = await api.post('/addresses', payload);
        savedAddressId = res.data?.address?.id;
        setSnackbar({ open: true, message: t('cd.snackbar.addressAdded'), severity: 'success' });
        // Asignar servicios a la dirección recién creada
        if (savedAddressId && addressForm.service_types.length > 0) {
          try {
            const filteredCarrier: Record<string, string> = {};
            for (const svc of addressForm.service_types) {
              if (addressForm.carrier_config[svc]) filteredCarrier[svc] = addressForm.carrier_config[svc];
            }
            await api.put(`/addresses/${savedAddressId}/default-for-service`, {
              services: addressForm.service_types,
              carrier_config: Object.keys(filteredCarrier).length > 0 ? filteredCarrier : undefined,
            });
          } catch (svcErr) {
            console.error('Error asignando servicios:', svcErr);
          }
        }
      }
      
      setAddressModalOpen(false);
      setEditingAddress(null);
      setColonyOptions([]);
      setAddressForm({
        alias: '',
        first_name: '',
        last_name: '',
        street: '',
        exterior_number: '',
        interior_number: '',
        colony: '',
        city: '',
        state: '',
        zip_code: '',
        country: 'México',
        country_code: '+52',
        phone: '',
        reference: '',
        service_types: [],
        carrier_config: {},
      });
      loadDeliveryAddresses();
    } catch (error) {
      setSnackbar({ open: true, message: t('cd.snackbar.addressSaveError'), severity: 'error' });
    } finally {
      setAddressSaving(false);
    }
  };

  // Buscar código postal
  const handleZipCodeLookup = async (cp: string) => {
    if (!/^\d{5}$/.test(cp)) return;
    setZipLookupLoading(true);
    try {
      const res = await api.get(`/zipcode/${cp}`);
      if (res.data) {
        const { city, state, colonies } = res.data;
        setColonyOptions(colonies || []);
        setAddressForm(prev => ({
          ...prev,
          city: city || prev.city,
          state: state || prev.state,
          colony: colonies?.length === 1 ? colonies[0] : prev.colony,
        }));
      }
    } catch (error) {
      console.log('CP no encontrado');
      setColonyOptions([]);
    } finally {
      setZipLookupLoading(false);
    }
  };

  // Eliminar dirección
  const handleDeleteAddress = async (id: number) => {
    if (!window.confirm(t('cd.address.confirmDelete'))) return;
    
    try {
      await api.delete(`/addresses/${id}`);
      setSnackbar({ open: true, message: t('cd.snackbar.addressDeleted'), severity: 'success' });
      loadDeliveryAddresses();
    } catch (error) {
      setSnackbar({ open: true, message: t('cd.snackbar.addressDeleteError'), severity: 'error' });
    }
  };

  // Editar dirección
  const handleEditAddress = (address: DeliveryAddress) => {
    setEditingAddress(address);
    // Separar nombre en first_name / last_name
    const nameParts = (address.contact_name || '').trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    // Separar código de país del teléfono
    let countryCode = '+52';
    let phone = address.phone || '';
    if (phone.startsWith('+')) {
      // Detectar código de país conocido
      if (phone.startsWith('+52')) {
        countryCode = '+52';
        phone = phone.substring(3);
      } else if (phone.startsWith('+1')) {
        countryCode = '+1';
        phone = phone.substring(2);
      } else if (phone.startsWith('+86')) {
        countryCode = '+86';
        phone = phone.substring(3);
      } else {
        // Tomar primeros 3 chars como código
        countryCode = phone.substring(0, 3);
        phone = phone.substring(3);
      }
    }
    // Parsear servicios asignados
    const serviceTypes = address.default_for_service 
      ? address.default_for_service.split(',').map(s => s.trim()).filter(Boolean) 
      : [];
    
    setAddressForm({
      alias: address.alias,
      first_name: firstName,
      last_name: lastName,
      street: address.street,
      exterior_number: address.exterior_number || '',
      interior_number: address.interior_number || '',
      colony: address.colony || '',
      city: address.city,
      state: address.state,
      zip_code: address.zip_code || '',
      country: address.country || 'México',
      country_code: countryCode,
      phone: phone,
      reference: address.reference || '',
      service_types: serviceTypes,
      carrier_config: address.carrier_config || {},
    });
    // Si tiene CP, cargar opciones de colonias
    if (address.zip_code && /^\d{5}$/.test(address.zip_code)) {
      handleZipCodeLookup(address.zip_code);
    }
    setAddressModalOpen(true);
  };

  // Copiar CLABE al portapapeles
  const copyClabe = (clabe: string) => {
    navigator.clipboard.writeText(clabe);
    setSnackbar({ open: true, message: t('cd.snackbar.clabeCopied'), severity: 'success' });
  };

  // Cargar tarifas de referencia
  const loadPublicRates = useCallback(async () => {
    try {
      setRatesLoading(true);
      const res = await api.get('/public/rates');
      setPublicRates(res.data);
    } catch (err) {
      console.error('Error cargando tarifas:', err);
    } finally {
      setRatesLoading(false);
    }
  }, []);

  // Cargar tarifas cuando se selecciona el tab de cotizador
  useEffect(() => {
    if (activeTab === 1 && !publicRates) {
      loadPublicRates();
    }
  }, [activeTab, publicRates, loadPublicRates]);

  // Calcular cotización usando la API
  const handleCalculateQuote = useCallback(async () => {
    if (!quoteService) {
      setSnackbar({ open: true, message: 'Selecciona un tipo de servicio', severity: 'warning' });
      return;
    }

    const largo = parseFloat(cbmLargo) || 0;
    const ancho = parseFloat(cbmAncho) || 0;
    const alto = parseFloat(cbmAlto) || 0;
    const peso = parseFloat(cbmPeso) || 0;
    const cantidad = parseInt(quoteCantidad) || 1;

    // Validaciones según servicio
    if (quoteService === 'pobox') {
      // PO Box requiere dimensiones
      if (largo <= 0 || ancho <= 0 || alto <= 0) {
        setSnackbar({ open: true, message: 'Ingresa las dimensiones del paquete (largo, ancho, alto)', severity: 'warning' });
        return;
      }
    } else if (quoteService === 'dhl') {
      // DHL requiere peso y dimensiones, máximo 40 kg
      if (largo <= 0 || ancho <= 0 || alto <= 0) {
        setSnackbar({ open: true, message: 'Ingresa las dimensiones del paquete (largo, ancho, alto)', severity: 'warning' });
        return;
      }
      if (peso <= 0) {
        setSnackbar({ open: true, message: 'Ingresa el peso del paquete en kg', severity: 'warning' });
        return;
      }
      if (peso > 40) {
        setSnackbar({ open: true, message: '⚠️ El peso excede 40 kg. Este embarque no puede enviarse por DHL. Te recomendamos usar el servicio Aéreo desde China.', severity: 'error' });
        return;
      }
    } else if (largo <= 0 || ancho <= 0 || alto <= 0) {
      setSnackbar({ open: true, message: 'Ingresa las dimensiones del paquete', severity: 'warning' });
      return;
    }

    try {
      setQuoteLoading(true);
      const res = await api.post('/public/quote', {
        servicio: quoteService,
        largo,
        ancho,
        alto,
        peso,
        cantidad,
        categoria: quoteCategoria || undefined,
      });
      setQuoteResult(res.data);
    } catch (err: unknown) {
      console.error('Error calculando cotización:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error al calcular cotización';
      const axiosError = err as { response?: { data?: { error?: string } } };
      setSnackbar({ 
        open: true, 
        message: axiosError.response?.data?.error || errorMessage, 
        severity: 'error' 
      });
    } finally {
      setQuoteLoading(false);
    }
  }, [quoteService, cbmLargo, cbmAncho, cbmAlto, cbmPeso, quoteCantidad, quoteCategoria]);

  // Reset cotizador al cambiar servicio
  const handleServiceChange = useCallback((service: string) => {
    setQuoteService(service);
    setQuoteResult(null);
    setCbmLargo('');
    setCbmAncho('');
    setCbmAlto('');
    setCbmPeso('');
    setQuoteCantidad('1');
    setQuoteCategoria('');
  }, []);

  const getStatusStep = (status: string): number => {
    switch (status) {
      case 'ordered': return 0;
      case 'in_transit': return 1;
      case 'customs': return 2;
      case 'in_warehouse': return 3;
      case 'ready_pickup': return 4;
      case 'delivered': return 5;
      default: return 1;
    }
  };

  const getServiceIcon = (servicio: string) => {
    switch (servicio) {
      case 'usa_pobox': return <PostOfficeIcon sx={{ color: BLUE }} />;
      case 'china_air': return <FlightIcon sx={{ color: ORANGE }} />;
      case 'china_sea': return <BoatIcon sx={{ color: '#00BCD4' }} />;
      default: return <ShippingIcon />;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Formatear dirección personalizada con Suite del cliente
  const formatAddressForCopy = (address: WarehouseAddress, serviceType: string): string => {
    const clientName = userName || t('cd.address.yourNameUpper');
    const suite = boxId || 'S-XXX';
    
    if (serviceType === 'usa_pobox') {
      // PO Box USA - reemplazar placeholder con Suite
      const addressLine = address.address_line1.replace(/\(S-Numero de Cliente\)/gi, suite);
      return `${clientName}\n${addressLine}\n${address.city || ''}, ${address.state || ''} ${address.zip_code || ''}\nUSA`;
    } else if (serviceType === 'china_air' || serviceType === 'china_sea') {
      // China - incluir Shipping Mark
      return `${address.address_line1}\n${address.address_line2 || ''}\n📦 Shipping Mark / 唛头: ${suite}\n${t('cd.address.contact')}: ${address.contact_name || ''}\nTel: ${address.contact_phone || ''}`;
    } else {
      // DHL Monterrey
      return `${address.address_line1}\n${address.city || ''}, ${address.state || ''} ${address.zip_code || ''}\nMéxico\n📦 ${t('cd.address.onBehalfOf')}: ${clientName} (${suite})`;
    }
  };

  // Mostrar dirección formateada en pantalla
  const renderFormattedAddress = (address: WarehouseAddress, serviceType: string): React.ReactNode => {
    const clientName = userName || t('cd.address.yourNameUpper');
    const suite = boxId || 'S-XXX';
    
    if (serviceType === 'usa_pobox') {
      const addressLine = address.address_line1.replace(/\(S-Numero de Cliente\)/gi, suite);
      return (
        <>
          <strong>{clientName}</strong><br />
          {addressLine}<br />
          {address.city}, {address.state} {address.zip_code}<br />
          <span style={{ color: '#90CAF9' }}>USA</span>
        </>
      );
    } else if (serviceType === 'china_air' || serviceType === 'china_sea') {
      return (
        <>
          {address.address_line1}<br />
          {address.address_line2 && <>{address.address_line2}<br /></>}
          <strong style={{ color: '#FFD54F' }}>📦 Shipping Mark: {suite}</strong><br />
          👤 {address.contact_name || t('cd.address.contact')}<br />
          📞 {address.contact_phone || t('cd.address.viewPhone')}
        </>
      );
    } else {
      return (
        <>
          {address.address_line1}<br />
          {address.city}, {address.state} {address.zip_code}<br />
          México<br />
          <strong style={{ color: '#FFD54F' }}>📦 {clientName} ({suite})</strong>
        </>
      );
    }
  };

  const formatCurrency = (amount: number, currency = 'MXN') => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress sx={{ color: ORANGE }} />
      </Box>
    );
  }

  return (
    <Box sx={{ 
      p: { xs: 1.5, md: 4 }, 
      bgcolor: '#f5f5f5', 
      minHeight: 'calc(100vh - 64px)',
      pb: isMobile ? 10 : 4, // Space for bottom nav
    }}>
      {/* Header de Bienvenida - Mobile optimized */}
      <Paper 
        sx={{ 
          mb: isMobile ? 2 : 3, 
          borderRadius: isMobile ? 2 : 3,
          overflow: 'hidden',
          boxShadow: isMobile ? '0 2px 8px rgba(0,0,0,0.1)' : '0 4px 20px rgba(0,0,0,0.12)',
        }}
      >
        <Box sx={{ 
          p: { xs: 2, md: 3 }, 
          background: 'linear-gradient(135deg, #111111 0%, #1a1a1a 40%, #222222 100%)',
          color: 'white',
          position: 'relative',
          borderBottom: `3px solid ${ORANGE}`,
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            right: 0,
            width: '40%',
            height: '100%',
            background: `linear-gradient(135deg, transparent 0%, rgba(240,90,40,0.06) 100%)`,
            pointerEvents: 'none',
          },
        }}>
          {isMobile ? (
            /* Mobile Header - Compact */
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ 
                  width: 40, 
                  height: 40, 
                  borderRadius: '12px', 
                  background: `linear-gradient(135deg, ${ORANGE}, #ff7043)`,
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  boxShadow: '0 3px 10px rgba(240,90,40,0.3)',
                }}>
                  <PersonIcon sx={{ fontSize: 22, color: 'white' }} />
                </Box>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2, color: 'white' }}>
                    {t('cd.header.welcome')} {userName?.split(' ')[0]}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>
                    {t('cd.header.portal')}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'flex-end' }}>
                {/* Casillero */}
                <Box sx={{ 
                  px: 1.5, 
                  py: 0.5, 
                  bgcolor: 'rgba(255,255,255,0.08)', 
                  borderRadius: 1.5, 
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  cursor: 'pointer',
                }}
                onClick={() => setActiveTab(4)}
                >
                  <QrCodeIcon sx={{ fontSize: 14, color: ORANGE }} />
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'white' }}>
                    {stats?.casillero || boxId}
                  </Typography>
                  <ChevronRightIcon sx={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }} />
                </Box>
                {/* Código de referido */}
                <Box sx={{ 
                  px: 1.5, 
                  py: 0.5, 
                  bgcolor: 'rgba(240,90,40,0.15)', 
                  borderRadius: 1.5, 
                  border: '1px dashed rgba(240,90,40,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.8,
                }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: ORANGE, fontFamily: 'monospace', letterSpacing: 1 }}>
                    {referralCode || '---'}
                  </Typography>
                  <IconButton 
                    size="small" 
                    sx={{ color: ORANGE, p: 0.2 }} 
                    onClick={() => {
                      if (referralCode) {
                        navigator.clipboard.writeText(referralCode);
                        setSnackbar({ open: true, message: '✅ Código copiado', severity: 'success' });
                      }
                    }}
                  >
                    <CopyIcon sx={{ fontSize: 12 }} />
                  </IconButton>
                  <IconButton 
                    size="small" 
                    sx={{ color: '#25D366', p: 0.2 }} 
                    onClick={() => {
                      const baseUrl = window.location.origin;
                      const shareUrl = `${baseUrl}/?ref=${encodeURIComponent(referralCode)}`;
                      const msg = `🎁 ¡Te invito a EntregaX! Regístrate con mi código *${referralCode}* para que yo gane *$500 MXN* de saldo cuando hagas tu primer envío.\n\n📦 Los mejores precios en envíos desde USA, China y más.\n\n👉 ${shareUrl}`;
                      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                    }}
                    disabled={!referralCode}
                  >
                    <Box component="img" src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" sx={{ width: 12, height: 12 }} />
                  </IconButton>
                </Box>
              </Box>
            </Box>
          ) : (
            /* Desktop Header */
            <Grid container spacing={2} alignItems="center" sx={{ position: 'relative', zIndex: 1 }}>
              <Grid size={{ xs: 12, md: 7 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ 
                    width: 50, 
                    height: 50, 
                    borderRadius: '14px', 
                    background: `linear-gradient(135deg, ${ORANGE}, #ff7043)`,
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    boxShadow: '0 4px 14px rgba(240,90,40,0.35)',
                    flexShrink: 0,
                  }}>
                    <PersonIcon sx={{ fontSize: 28, color: 'white' }} />
                  </Box>
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.3px', lineHeight: 1.2, color: 'white' }}>
                      {t('cd.header.welcome')} {userName}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)', mt: 0.3, fontWeight: 400 }}>
                      {t('cd.header.portal')}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
              <Grid size={{ xs: 12, md: 5 }}>
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  {/* Casillero */}
                  <Box 
                    onClick={() => setActiveTab(4)}
                    sx={{ 
                      flex: 1,
                      p: 1.5, 
                      bgcolor: 'rgba(255,255,255,0.05)', 
                      borderRadius: 2, 
                      border: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.08)', borderColor: ORANGE },
                    }}
                  >
                    <Box sx={{ 
                      width: 36, 
                      height: 36, 
                      borderRadius: '10px', 
                      bgcolor: 'rgba(240,90,40,0.12)',
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <QrCodeIcon sx={{ fontSize: 20, color: ORANGE }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 500, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {t('cd.header.suiteLabel')}
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700, letterSpacing: '1px', lineHeight: 1.2, color: 'white' }}>
                        {stats?.casillero || boxId}
                      </Typography>
                    </Box>
                    <ChevronRightIcon sx={{ fontSize: 18, color: 'rgba(255,255,255,0.3)' }} />
                  </Box>
                  {/* Código de referido */}
                  <Box sx={{ 
                    flex: 1,
                    p: 1.5, 
                    bgcolor: 'rgba(255,255,255,0.05)', 
                    borderRadius: 2, 
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                  }}>
                    <Box sx={{ 
                      width: 36, 
                      height: 36, 
                      borderRadius: '10px', 
                      bgcolor: 'rgba(240,90,40,0.12)',
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <GiftIcon sx={{ fontSize: 20, color: ORANGE }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 500, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Tu código de referido
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700, letterSpacing: '1px', lineHeight: 1.2, color: 'white' }}>
                        {referralCode || '---'}
                      </Typography>
                    </Box>
                    <Tooltip title="Copiar código">
                      <IconButton 
                        size="small" 
                        sx={{ 
                          color: 'rgba(255,255,255,0.4)', 
                          '&:hover': { color: ORANGE },
                        }} 
                        onClick={() => {
                          if (referralCode) {
                            navigator.clipboard.writeText(referralCode);
                            setSnackbar({ open: true, message: '✅ Código copiado', severity: 'success' });
                          }
                        }}
                      >
                        <CopyIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Compartir por WhatsApp">
                      <IconButton 
                        size="small" 
                        sx={{ 
                          color: '#25D366', 
                          '&:hover': { bgcolor: 'rgba(37,211,102,0.15)' },
                        }} 
                        onClick={() => {
                          const baseUrl = window.location.origin;
                          const shareUrl = `${baseUrl}/?ref=${encodeURIComponent(referralCode)}`;
                          const msg = `🎁 ¡Te invito a EntregaX! Regístrate con mi código *${referralCode}* para que yo gane *$500 MXN* de saldo cuando hagas tu primer envío.\n\n📦 Los mejores precios en envíos desde USA, China y más.\n\n👉 ${shareUrl}`;
                          window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                        }}
                        disabled={!referralCode}
                      >
                        <Box component="img" src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" sx={{ width: 14, height: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </Grid>
            </Grid>
          )}
        </Box>
      </Paper>

      {/* Carrusel de Promociones/Slides - Efecto 3D Cards */}
      {carouselSlides.length > 0 && (
        <Box sx={{ mb: 3, position: 'relative' }}>
          {/* Container del carrusel con overflow visible para ver tarjetas laterales */}
          <Box sx={{ 
            overflow: 'hidden', 
            py: 2,
            px: { xs: 2, md: 4 },
          }}>
            <Box 
              sx={{ 
                display: 'flex', 
                alignItems: 'center',
                justifyContent: 'center',
                gap: { xs: 1, md: 2 },
                transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {carouselSlides.map((slide, index) => {
                const hasImage = slide.imageUrl || slide.image_url;
                const ctaUrl = slide.ctaUrl || slide.cta_url;
                const isActive = index === currentSlide;
                const isPrev = index === (currentSlide - 1 + carouselSlides.length) % carouselSlides.length;
                const isNext = index === (currentSlide + 1) % carouselSlides.length;
                const isVisible = isActive || isPrev || isNext;
                
                const handleSlideClick = () => {
                  if (isActive && ctaUrl) {
                    if (ctaUrl.startsWith('http')) {
                      window.open(ctaUrl, '_blank');
                    } else {
                      window.location.href = ctaUrl;
                    }
                  } else if (!isActive) {
                    setCurrentSlide(index);
                  }
                };
                
                // Calcular posición y escala
                let translateX = 0;
                let scale = 0.75;
                let opacity = 0;
                let zIndex = 0;
                
                if (isActive) {
                  translateX = 0;
                  scale = 1;
                  opacity = 1;
                  zIndex = 10;
                } else if (isPrev) {
                  translateX = -85;
                  scale = 0.8;
                  opacity = 0.6;
                  zIndex = 5;
                } else if (isNext) {
                  translateX = 85;
                  scale = 0.8;
                  opacity = 0.6;
                  zIndex = 5;
                }
                
                if (!isVisible && carouselSlides.length > 3) return null;
                
                return (
                  <Box 
                    key={slide.id}
                    onClick={handleSlideClick}
                    sx={{ 
                      position: isActive ? 'relative' : 'absolute',
                      width: { xs: '85%', sm: '75%', md: '65%' },
                      maxWidth: 800,
                      cursor: 'pointer',
                      transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                      transform: `translateX(${translateX}%) scale(${scale})`,
                      opacity,
                      zIndex,
                      filter: isActive ? 'none' : 'brightness(0.7)',
                      '&:hover': {
                        transform: isActive 
                          ? `translateX(${translateX}%) scale(1.02)` 
                          : `translateX(${translateX}%) scale(${scale + 0.03})`,
                        filter: isActive ? 'none' : 'brightness(0.8)',
                      },
                    }}
                  >
                    <Box
                      sx={{
                        borderRadius: 3,
                        overflow: 'hidden',
                        boxShadow: isActive 
                          ? '0 20px 60px rgba(0,0,0,0.3)' 
                          : '0 10px 30px rgba(0,0,0,0.2)',
                        transition: 'box-shadow 0.3s ease',
                      }}
                    >
                      {hasImage ? (
                        /* Si hay imagen, mostrar imagen */
                        <Box
                          component="img"
                          src={slide.imageUrl || slide.image_url}
                          alt={slide.title || 'Promoción'}
                          sx={{
                            width: '100%',
                            height: { xs: 180, sm: 220, md: 280 },
                            objectFit: 'cover',
                            display: 'block',
                          }}
                        />
                      ) : (
                        /* Si NO hay imagen, mostrar contenido con gradiente */
                        <Box
                          sx={{
                            width: '100%',
                            height: { xs: 180, sm: 220, md: 280 },
                            background: slide.gradientColors?.length 
                              ? `linear-gradient(135deg, ${slide.gradientColors[0]}CC 0%, ${slide.gradientColors[1] || slide.gradientColors[0]}99 100%)`
                              : `linear-gradient(135deg, ${ORANGE} 0%, #E64A19 100%)`,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            p: 3,
                          }}
                        >
                          {slide.badge && (
                            <Chip 
                              label={slide.badge} 
                              size="small" 
                              sx={{ 
                                bgcolor: 'rgba(255,255,255,0.25)', 
                                color: 'white', 
                                fontWeight: 600, 
                                fontSize: '0.7rem', 
                                height: 22,
                                mb: 1,
                                alignSelf: 'flex-start',
                              }} 
                            />
                          )}
                          <Typography variant="h5" fontWeight="bold" sx={{ color: 'white', mb: 0.5, textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
                            {slide.title}
                          </Typography>
                          <Typography variant="body1" sx={{ color: 'white', opacity: 0.95, mb: 2, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                            {slide.subtitle}
                          </Typography>
                          {(slide.ctaText || slide.cta_text) && (
                            <Button 
                              size="small" 
                              variant="contained"
                              sx={{ 
                                bgcolor: 'rgba(255,255,255,0.25)', 
                                color: 'white',
                                textTransform: 'none',
                                fontWeight: 600,
                                backdropFilter: 'blur(4px)',
                                alignSelf: 'flex-start',
                                '&:hover': { bgcolor: 'rgba(255,255,255,0.4)' },
                              }}
                            >
                              {slide.ctaText || slide.cta_text}
                            </Button>
                          )}
                        </Box>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
          
          {/* Botones de navegación */}
          {carouselSlides.length > 1 && (
            <>
              <IconButton
                onClick={() => setCurrentSlide((currentSlide - 1 + carouselSlides.length) % carouselSlides.length)}
                sx={{
                  position: 'absolute',
                  left: { xs: 0, md: 8 },
                  top: '50%',
                  transform: 'translateY(-50%)',
                  bgcolor: 'rgba(255,255,255,0.9)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  zIndex: 20,
                  '&:hover': { bgcolor: 'white' },
                }}
              >
                <CloseIcon sx={{ transform: 'rotate(45deg)' }} />
              </IconButton>
              <IconButton
                onClick={() => setCurrentSlide((currentSlide + 1) % carouselSlides.length)}
                sx={{
                  position: 'absolute',
                  right: { xs: 0, md: 8 },
                  top: '50%',
                  transform: 'translateY(-50%)',
                  bgcolor: 'rgba(255,255,255,0.9)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  zIndex: 20,
                  '&:hover': { bgcolor: 'white' },
                }}
              >
                <CloseIcon sx={{ transform: 'rotate(-135deg)' }} />
              </IconButton>
            </>
          )}
          
          {/* Indicadores de posición */}
          {carouselSlides.length > 1 && (
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'center', 
              gap: 1, 
              mt: 2,
            }}>
              {carouselSlides.map((_, index) => (
                <Box
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  sx={{
                    width: currentSlide === index ? 24 : 8,
                    height: 8,
                    borderRadius: 4,
                    bgcolor: currentSlide === index ? ORANGE : 'grey.300',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    '&:hover': { bgcolor: currentSlide === index ? ORANGE : 'grey.400' },
                  }}
                />
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Tabs de navegación - Desktop only */}
      {!isMobile && (
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <Tabs 
            value={(() => {
              // Mapear activeTab a índice de Tab visual
              // activeTab: 0=Envíos, 1=Cotizador, 2=MiCuenta, 3=Facturas, 4=Direcciones
              // Tabs: 0=Envíos, 1=Pagos, 2=Cotizador, 3=MiCuenta, 4=Facturas, 5=Direcciones
              const reverseMapping: {[key: number]: number} = {
                0: 0,  // Envíos → Envíos
                1: 2,  // Cotizador → Cotizador
                2: 3,  // Mi Cuenta → Mi Cuenta
                3: 4,  // Facturas → Facturas
                4: 5,  // Direcciones → Direcciones
              };
              return reverseMapping[activeTab] ?? 0;
            })()}
            onChange={(_, v) => {
              // Tab 1 es "Pago a Proveedores" - mostrar en construcción
              if (v === 1) {
                setSnackbar({ open: true, message: '🚧 Pago a Proveedores: Próximamente disponible', severity: 'info' });
                return;
              }
              // Ajustar índice para los demás tabs
              const tabMapping: {[key: number]: number} = {
                0: 0,  // Mis Envíos
                2: 1,  // Cotizador
                3: 2,  // Mi Cuenta
                4: 3,  // Facturas
                5: 4,  // Direcciones
              };
              setActiveTab(tabMapping[v] ?? 0);
            }}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ 
              borderBottom: 1, 
              borderColor: 'divider',
              '& .MuiTab-root': { fontWeight: 600 },
              '& .Mui-selected': { color: ORANGE },
              '& .MuiTabs-indicator': { bgcolor: ORANGE },
            }}
          >
            <Tab icon={<ShippingIcon />} label={t('cd.tabs.shipments')} iconPosition="start" />
            <Tab icon={<PaymentsIcon />} label="Pago Proveedores" iconPosition="start" />
            <Tab icon={<CalculateIcon />} label={t('cd.tabs.quoter')} iconPosition="start" />
            <Tab icon={<WalletIcon />} label="Mi Cuenta" iconPosition="start" />
            <Tab icon={<ReceiptIcon />} label={t('cd.tabs.invoices')} iconPosition="start" />
            <Tab icon={<HomeIcon />} label="Direcciones de Envío" iconPosition="start" />
          </Tabs>
        </Paper>
      )}

      {/* Content area */}
      <Paper sx={{ borderRadius: isMobile ? 2 : 3, overflow: 'hidden', mt: isMobile ? 0 : 0 }}>
        <Box sx={{ p: isMobile ? 1 : 3 }}>
          {/* Tab: Mis Envíos */}
          {activeTab === 0 && (
            <Box>
              {/* Header y búsqueda - Mobile optimized */}
              <Box sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                mb: isMobile ? 1.5 : 2, 
                flexWrap: 'wrap', 
                gap: 1 
              }}>
                <Typography variant={isMobile ? 'subtitle1' : 'h6'} fontWeight="bold">
                  {isMobile ? '📦 Mis Paquetes Activos' : t('cd.packages.title')}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                  <TextField
                    size="small"
                    placeholder={isMobile ? 'Buscar...' : t('cd.packages.searchPlaceholder')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{
                      startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: isMobile ? 18 : 24 }} /></InputAdornment>,
                    }}
                    sx={{ width: isMobile ? 140 : 200 }}
                  />
                  <IconButton onClick={loadData} title="Actualizar" size={isMobile ? 'small' : 'medium'}>
                    <RefreshIcon />
                  </IconButton>
                </Box>
              </Box>

              {/* Filtros por instrucciones - solo disponibles si hay un servicio seleccionado */}
              {!isMobile && (
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mb: 2 }}>
                <Chip
                  icon={<CloseIcon sx={{ fontSize: 16 }} />}
                  label={t('cd.packages.noInstructions')}
                  variant={instructionFilter === 'sin' ? 'filled' : 'outlined'}
                  onClick={() => {
                    if (serviceFilter === 'all') {
                      setSnackbar({ open: true, message: t('cd.snackbar.selectServiceFirst'), severity: 'warning' });
                      return;
                    }
                    const newFilter = instructionFilter === 'sin' ? 'all' : 'sin';
                    setInstructionFilter(newFilter);
                    // Auto-seleccionar todos los paquetes filtrados
                    if (newFilter !== 'all') {
                      const filtered = packages.filter(pkg => {
                        const type = pkg.shipment_type || pkg.servicio;
                        let matchesService = true;
                        if (serviceFilter === 'china_air') matchesService = type === 'china_air' || type === 'TDI_AEREO' || type === 'AIR_CHN_MX';
                        else if (serviceFilter === 'china_sea') matchesService = type === 'china_sea' || type === 'maritime' || type === 'SEA_CHN_MX' || type === 'fcl' || type === 'FCL_CHN_MX';
                        else if (serviceFilter === 'usa_pobox') matchesService = type === 'usa_pobox' || type === 'POBOX_USA' || type === 'air' || !type;
                        else if (serviceFilter === 'dhl') matchesService = type === 'dhl' || type === 'mx_cedis' || type === 'NATIONAL' || type === 'AA_DHL' || type === 'DHL_MTY';
                        return matchesService && !pkg.has_delivery_instructions && !pkg.delivery_address_id;
                      }).filter(pkg => !pkg.client_paid && pkg.status !== 'delivered');
                      setSelectedPackageIds(filtered.map(p => p.id));
                    } else {
                      setSelectedPackageIds([]);
                    }
                  }}
                  sx={{ 
                    fontWeight: 600,
                    opacity: serviceFilter === 'all' ? 0.5 : 1,
                    ...(instructionFilter === 'sin' && { bgcolor: ORANGE, color: 'white', '& .MuiChip-icon': { color: 'white' } })
                  }}
                />
                <Chip
                  icon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
                  label={t('cd.packages.withInstructions')}
                  variant={instructionFilter === 'con' ? 'filled' : 'outlined'}
                  onClick={() => {
                    if (serviceFilter === 'all') {
                      setSnackbar({ open: true, message: t('cd.snackbar.selectServiceFirst'), severity: 'warning' });
                      return;
                    }
                    const newFilter = instructionFilter === 'con' ? 'all' : 'con';
                    setInstructionFilter(newFilter);
                    // Auto-seleccionar todos los paquetes filtrados
                    if (newFilter !== 'all') {
                      const filtered = packages.filter(pkg => {
                        const type = pkg.shipment_type || pkg.servicio;
                        let matchesService = true;
                        if (serviceFilter === 'china_air') matchesService = type === 'china_air' || type === 'TDI_AEREO' || type === 'AIR_CHN_MX';
                        else if (serviceFilter === 'china_sea') matchesService = type === 'china_sea' || type === 'maritime' || type === 'SEA_CHN_MX' || type === 'fcl';
                        else if (serviceFilter === 'usa_pobox') matchesService = type === 'usa_pobox' || type === 'POBOX_USA' || type === 'air' || !type;
                        else if (serviceFilter === 'dhl') matchesService = type === 'dhl' || type === 'mx_cedis' || type === 'NATIONAL' || type === 'AA_DHL' || type === 'DHL_MTY';
                        return matchesService && (pkg.has_delivery_instructions || pkg.delivery_address_id);
                      }).filter(pkg => !pkg.client_paid && pkg.status !== 'delivered');
                      setSelectedPackageIds(filtered.map(p => p.id));
                    } else {
                      setSelectedPackageIds([]);
                    }
                  }}
                  sx={{ 
                    fontWeight: 600,
                    opacity: serviceFilter === 'all' ? 0.5 : 1,
                    ...(instructionFilter === 'con' && { bgcolor: ORANGE, color: 'white', '& .MuiChip-icon': { color: 'white' } })
                  }}
                />
              </Box>
              )}

              {/* Filtros por tipo de servicio - Horizontal scroll en mobile */}
              <Box sx={{ 
                display: 'flex', 
                justifyContent: isMobile ? 'flex-start' : 'center', 
                gap: isMobile ? 1 : 2, 
                mb: isMobile ? 2 : 3,
                flexWrap: isMobile ? 'nowrap' : 'wrap',
                overflowX: isMobile ? 'auto' : 'visible',
                pb: isMobile ? 1 : 0,
                mx: isMobile ? -1 : 0,
                px: isMobile ? 1 : 0,
                '&::-webkit-scrollbar': { display: 'none' },
              }}>
                <Box 
                  onClick={() => {
                    if (serviceFilter === 'china_air') {
                      setServiceFilter('all');
                      setInstructionFilter('all');
                    } else {
                      setServiceFilter('china_air');
                    }
                  }}
                  sx={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    p: isMobile ? 1 : 1.5,
                    borderRadius: 2,
                    bgcolor: serviceFilter === 'china_air' ? ORANGE : 'white',
                    border: serviceFilter === 'china_air' ? `2px solid ${ORANGE}` : '1px solid #e0e0e0',
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: ORANGE, bgcolor: serviceFilter === 'china_air' ? ORANGE : '#FFF8F5' },
                    minWidth: isMobile ? 60 : 70,
                    flexShrink: 0,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  }}
                >
                  <Box sx={{ position: 'relative' }}>
                    <FlightIcon sx={{ fontSize: isMobile ? 22 : 28, color: serviceFilter === 'china_air' ? 'white' : '#666', mb: 0.5 }} />
                    {serviceCounts.china_air > 0 && (
                      <Box sx={{
                        position: 'absolute',
                        top: -8,
                        right: -12,
                        bgcolor: serviceFilter === 'china_air' ? 'white' : ORANGE,
                        color: serviceFilter === 'china_air' ? ORANGE : 'white',
                        borderRadius: '50%',
                        minWidth: 20,
                        height: 20,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                      }}>
                        {serviceCounts.china_air}
                      </Box>
                    )}
                  </Box>
                  <Typography variant="caption" sx={{ 
                    color: serviceFilter === 'china_air' ? 'white' : '#666', 
                    fontWeight: 600, 
                    fontSize: '0.7rem' 
                  }}>
                    {t('cd.packages.air')}
                  </Typography>
                </Box>

                <Box 
                  onClick={() => {
                    if (serviceFilter === 'china_sea') {
                      setServiceFilter('all');
                      setInstructionFilter('all');
                    } else {
                      setServiceFilter('china_sea');
                    }
                  }}
                  sx={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    p: isMobile ? 1 : 1.5,
                    borderRadius: 2,
                    bgcolor: serviceFilter === 'china_sea' ? ORANGE : 'white',
                    border: serviceFilter === 'china_sea' ? `2px solid ${ORANGE}` : '1px solid #e0e0e0',
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: ORANGE, bgcolor: serviceFilter === 'china_sea' ? ORANGE : '#FFF8F5' },
                    minWidth: isMobile ? 60 : 70,
                    flexShrink: 0,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  }}
                >
                  <Box sx={{ position: 'relative' }}>
                    <BoatIcon sx={{ fontSize: isMobile ? 22 : 28, color: serviceFilter === 'china_sea' ? 'white' : '#666', mb: 0.5 }} />
                    {serviceCounts.china_sea > 0 && (
                      <Box sx={{
                        position: 'absolute',
                        top: -8,
                        right: -12,
                        bgcolor: serviceFilter === 'china_sea' ? 'white' : ORANGE,
                        color: serviceFilter === 'china_sea' ? ORANGE : 'white',
                        borderRadius: '50%',
                        minWidth: 20,
                        height: 20,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                      }}>
                        {serviceCounts.china_sea}
                      </Box>
                    )}
                  </Box>
                  <Typography variant="caption" sx={{ 
                    color: serviceFilter === 'china_sea' ? 'white' : '#666', 
                    fontWeight: 600, 
                    fontSize: '0.7rem' 
                  }}>
                    {t('cd.packages.sea')}
                  </Typography>
                </Box>

                <Box 
                  onClick={() => {
                    if (serviceFilter === 'dhl') {
                      setServiceFilter('all');
                      setInstructionFilter('all');
                    } else {
                      setServiceFilter('dhl');
                    }
                  }}
                  sx={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    p: isMobile ? 1 : 1.5,
                    borderRadius: 2,
                    bgcolor: serviceFilter === 'dhl' ? ORANGE : 'white',
                    border: serviceFilter === 'dhl' ? `2px solid ${ORANGE}` : '1px solid #e0e0e0',
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: ORANGE, bgcolor: serviceFilter === 'dhl' ? ORANGE : '#FFF8F5' },
                    minWidth: isMobile ? 60 : 70,
                    flexShrink: 0,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  }}
                >
                  <Box sx={{ position: 'relative' }}>
                    <TruckIcon sx={{ fontSize: isMobile ? 22 : 28, color: serviceFilter === 'dhl' ? 'white' : '#666', mb: 0.5 }} />
                    {serviceCounts.dhl > 0 && (
                      <Box sx={{
                        position: 'absolute',
                        top: -8,
                        right: -12,
                        bgcolor: serviceFilter === 'dhl' ? 'white' : ORANGE,
                        color: serviceFilter === 'dhl' ? ORANGE : 'white',
                        borderRadius: '50%',
                        minWidth: 20,
                        height: 20,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                      }}>
                        {serviceCounts.dhl}
                      </Box>
                    )}
                  </Box>
                  <Typography variant="caption" sx={{ 
                    color: serviceFilter === 'dhl' ? 'white' : '#666', 
                    fontWeight: 600, 
                    fontSize: '0.7rem' 
                  }}>
                    {t('cd.packages.mty')}
                  </Typography>
                </Box>

                <Box 
                  onClick={() => {
                    if (serviceFilter === 'usa_pobox') {
                      setServiceFilter('all');
                      setInstructionFilter('all');
                    } else {
                      setServiceFilter('usa_pobox');
                    }
                  }}
                  sx={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    p: isMobile ? 1 : 1.5,
                    borderRadius: 2,
                    bgcolor: serviceFilter === 'usa_pobox' ? ORANGE : 'white',
                    border: serviceFilter === 'usa_pobox' ? `2px solid ${ORANGE}` : '1px solid #e0e0e0',
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: ORANGE, bgcolor: serviceFilter === 'usa_pobox' ? ORANGE : '#FFF8F5' },
                    minWidth: isMobile ? 60 : 70,
                    flexShrink: 0,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  }}
                >
                  <Box sx={{ position: 'relative' }}>
                    <PostOfficeIcon sx={{ fontSize: isMobile ? 22 : 28, color: serviceFilter === 'usa_pobox' ? 'white' : '#666', mb: 0.5 }} />
                    {serviceCounts.usa_pobox > 0 && (
                      <Box sx={{
                        position: 'absolute',
                        top: -8,
                        right: -12,
                        bgcolor: serviceFilter === 'usa_pobox' ? 'white' : ORANGE,
                        color: serviceFilter === 'usa_pobox' ? ORANGE : 'white',
                        borderRadius: '50%',
                        minWidth: 20,
                        height: 20,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                      }}>
                        {serviceCounts.usa_pobox}
                      </Box>
                    )}
                  </Box>
                  <Typography variant="caption" sx={{ 
                    color: serviceFilter === 'usa_pobox' ? 'white' : '#666', 
                    fontWeight: 600, 
                    fontSize: '0.7rem' 
                  }}>
                    {t('cd.packages.pobox')}
                  </Typography>
                </Box>
              </Box>

              {/* Barra de acciones cuando hay paquetes seleccionados */}
              {selectedPackageIds.length > 0 && (
                <Alert 
                  severity="info" 
                  sx={{ mb: 2, borderRadius: 2 }}
                  action={
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button size="small" color="inherit" onClick={() => setSelectedPackageIds([])}>
                        {t('cd.packages.clear')}
                      </Button>
                    </Box>
                  }
                >
                  <strong>{t('cd.packages.selectedCount', { count: selectedPackageIds.length })}</strong>
                </Alert>
              )}

              {/* Botones de acción flotantes para paquetes seleccionados */}
              {selectedPackageIds.length > 0 && (
                <>
                  <Button
                    variant="contained"
                    size="small"
                    sx={{ 
                      bgcolor: ORANGE, 
                      minWidth: 'auto',
                      position: 'fixed',
                      bottom: isMobile ? 70 : 20,
                      left: isMobile ? 10 : 20,
                      zIndex: 1000,
                      fontSize: isMobile ? '0.7rem' : '0.8rem',
                      px: isMobile ? 1.5 : 2,
                    }}
                    startIcon={<MoneyIcon sx={{ fontSize: isMobile ? 16 : 20 }} />}
                    onClick={() => setPaymentModalOpen(true)}
                  >
                    {isMobile ? 'Pagar' : t('cd.packages.pay')}
                  </Button>

                  {/* BOTÓN TEMPORAL DE PRUEBA - Oculto (cambiar SHOW_TEST_BUTTON a true para mostrar) */}
                  {SHOW_TEST_BUTTON && !isMobile && (
                  <Button
                    variant="contained"
                    size="small"
                    sx={{ 
                      bgcolor: GREEN, 
                      minWidth: 'auto',
                      position: 'fixed',
                      bottom: 20,
                      left: 120,
                      zIndex: 1000
                    }}
                    startIcon={<CheckCircleIcon />}
                    onClick={() => {
                      const total = getSelectedPackages().reduce((sum, pkg) => sum + (Number(pkg.monto) || 0), 0);
                      _testConfirmPayment(
                        `openpay_test_${Date.now()}`,
                        selectedPackageIds,
                        total,
                        'openpay'
                      );
                    }}
                  >
                    {t('cd.packages.testConfirmPayment')}
                  </Button>
                  )}

                  {/* Solo mostrar "Asignar Instrucciones" si hay paquetes sin instrucciones */}
                  {getSelectedPackages().some(pkg => !pkg.has_delivery_instructions && !pkg.assigned_address_id) && (
                    <Button
                      variant="contained"
                      color="primary"
                      size="small"
                      startIcon={<EditIcon sx={{ fontSize: isMobile ? 16 : 20 }} />}
                      onClick={() => setDeliveryModalOpen(true)}
                      sx={{ 
                        position: 'fixed',
                        bottom: isMobile ? 70 : 90,
                        right: isMobile ? 10 : 20,
                        zIndex: 1000,
                        minWidth: 'auto',
                        fontSize: isMobile ? '0.7rem' : '0.8rem',
                        px: isMobile ? 1.5 : 2,
                      }}
                    >
                      {isMobile ? '📍 Dirección' : t('cd.packages.assignInstructions')}
                    </Button>
                  )}
                </>
              )}

              {/* Checkbox para seleccionar todos */}
              {getFilteredPackages().filter(p => !p.client_paid && p.status !== 'delivered').length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={getFilteredPackages().filter(p => !p.client_paid && p.status !== 'delivered').every(p => selectedPackageIds.includes(p.id))}
                        indeterminate={
                          selectedPackageIds.length > 0 && 
                          !getFilteredPackages().filter(p => !p.client_paid && p.status !== 'delivered').every(p => selectedPackageIds.includes(p.id))
                        }
                        onChange={toggleSelectAll}
                        sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }}
                      />
                    }
                    label={<Typography variant="body2">{t('cd.packages.selectAll')}</Typography>}
                  />
                </Box>
              )}

              {/* Lista de paquetes paginados */}
              {paginatedPackages.map((pkg) => {
                const isSelectable = !pkg.client_paid && pkg.status !== 'delivered';
                const isSelected = selectedPackageIds.includes(pkg.id);
                const hasDeliveryInstructions = pkg.has_delivery_instructions || !!(
                  pkg.delivery_address_id || 
                  pkg.assigned_address_id ||
                  (pkg.destination_address && 
                   pkg.destination_address !== 'Pendiente de asignar' && 
                   pkg.destination_contact)
                );
                
                // Verificar si la búsqueda coincide con una guía hija
                const matchedChildGuide = searchTerm 
                  ? pkg.included_guides?.find(guide => 
                      guide.tracking.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                  : undefined;
                
                return (
                <Card 
                  key={pkg.id} 
                  sx={{ 
                    mb: isMobile ? 1 : 1.5, 
                    border: isSelected ? `2px solid ${ORANGE}` : pkg.status === 'ready_pickup' ? `2px solid ${ORANGE}` : '1px solid #e0e0e0', 
                    borderRadius: 2,
                    cursor: isSelectable ? 'pointer' : 'default',
                    transition: 'all 0.2s',
                    '&:hover': isSelectable ? { boxShadow: 3 } : {},
                  }}
                  onClick={() => isSelectable && togglePackageSelection(pkg.id, pkg)}
                >
                  <CardContent sx={{ py: isMobile ? 1 : 1.5, px: isMobile ? 1.5 : 2, '&:last-child': { pb: isMobile ? 1 : 1.5 } }}>
                    {/* Indicador de guía encontrada dentro del repack */}
                    {matchedChildGuide && (
                      <Alert 
                        severity="info" 
                        sx={{ mb: 1.5, py: 0.5 }}
                        icon={<SearchIcon fontSize="small" />}
                      >
                        <Typography variant="caption">
                          Tu guía <strong>{matchedChildGuide.tracking}</strong> está dentro de este reempaque
                        </Typography>
                      </Alert>
                    )}
                    
                    {/* Header compacto - Mobile optimized */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: isMobile ? 1 : 1.5, flex: 1, minWidth: 0 }}>
                        {isSelectable && (
                          <Checkbox
                            checked={isSelected}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => togglePackageSelection(pkg.id, pkg)}
                            size="small"
                            sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE }, p: 0, mt: 0.5 }}
                          />
                        )}
                        {!isMobile && (
                        <Avatar sx={{ bgcolor: 'grey.100', width: 32, height: 32 }}>
                          {getServiceIcon(pkg.servicio)}
                        </Avatar>
                        )}
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                            <Typography variant={isMobile ? 'caption' : 'body2'} fontWeight="bold" fontFamily="monospace" noWrap>{pkg.tracking}</Typography>
                            {pkg.status === 'delivered' && <Chip label={t('cd.packages.deliveredChip')} size="small" color="success" sx={{ height: 16, fontSize: '0.55rem' }} />}
                            {pkg.is_master && <Chip label="📦" size="small" sx={{ height: 16, fontSize: '0.55rem', bgcolor: '#e3f2fd', color: BLUE, minWidth: 'auto' }} />}
                            {pkg.client_paid && pkg.status !== 'delivered' && <Chip label="✓" size="small" color="success" sx={{ height: 16, fontSize: '0.55rem', minWidth: 'auto' }} />}
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                            {pkg.descripcion && <Typography variant="caption" color="text.secondary" sx={{ fontSize: isMobile ? '0.65rem' : '0.75rem' }} noWrap>{pkg.descripcion}</Typography>}
                            {pkg.total_boxes && pkg.total_boxes > 0 && (
                              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold', fontSize: isMobile ? '0.6rem' : '0.7rem' }}>
                                • 📦{pkg.total_boxes}
                              </Typography>
                            )}
                            {pkg.weight && Number(pkg.weight) > 0 && (
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: isMobile ? '0.6rem' : '0.7rem' }}>
                                • {Number(pkg.weight).toLocaleString()}kg
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                        {(() => {
                          const pkgMonto = Number(pkg.monto) || 0;
                          const isDhl = pkg.shipment_type === 'dhl' || pkg.servicio === 'AA_DHL' || pkg.servicio === 'DHL_MTY';
                          const isMaritime = pkg.shipment_type === 'maritime' || pkg.servicio === 'SEA_CHN_MX' || pkg.servicio === 'FCL_CHN_MX';
                          const currency = pkg.monto_currency || (isDhl ? 'USD' : 'MXN');
                          // Mostrar precio asignado o estimado
                          if (pkgMonto > 0 && !pkg.client_paid) {
                            // Para marítimo/FCL, mostrar precio con label de tipo
                            if (isMaritime && pkgMonto > 0) {
                              const merchLabel = pkg.merchandise_type === 'sensitive' ? 'Sensible' 
                                : pkg.merchandise_type === 'logo' ? 'Logotipo' 
                                : pkg.merchandise_type === 'startup' ? 'StartUp'
                                : pkg.merchandise_type === 'FCL' ? 'FCL'
                                : 'Genérico';
                              return (
                                <Box sx={{ textAlign: 'right' }}>
                                  <Typography variant="body2" color="warning.main" fontWeight="bold">
                                    {currency === 'USD' ? `$${pkgMonto.toFixed(2)} USD` : formatCurrency(pkgMonto)}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                    {merchLabel}
                                  </Typography>
                                </Box>
                              );
                            }
                            return (
                              <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="body2" color="warning.main" fontWeight="bold">
                                  {currency === 'USD' ? `$${pkgMonto.toFixed(2)} USD` : formatCurrency(pkgMonto)}
                                </Typography>
                                {isDhl && pkg.product_type && (
                                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                    {pkg.product_type === 'high_value' ? 'Sensible' : 'Accesorios/Mixto'}
                                  </Typography>
                                )}
                              </Box>
                            );
                          }
                          // Para marítimo sin precio asignado, mostrar estimado por CBM
                          if (pkgMonto === 0 && !pkg.client_paid && pkg.cbm && Number(pkg.cbm) > 0 &&
                              (pkg.shipment_type === 'maritime' || pkg.servicio === 'SEA_CHN_MX')) {
                            const cbm = Number(pkg.cbm);
                            let estUSD = 0;
                            if (cbm <= 0.03) estUSD = 39;
                            else if (cbm <= 0.1) estUSD = 79;
                            else if (cbm <= 0.5) estUSD = cbm * 150;
                            else if (cbm <= 2) estUSD = cbm * 120;
                            else estUSD = cbm * 100;
                            return (
                              <Typography variant="body2" color="warning.main" fontWeight="bold" sx={{ fontSize: '0.8rem' }}>
                                ${estUSD.toFixed(2)} USD
                              </Typography>
                            );
                          }
                          // Para aéreo China: usar precio congelado del backend si existe, sino estimado
                          if (pkgMonto === 0 && !pkg.client_paid &&
                              (pkg.shipment_type === 'china_air' || pkg.servicio === 'AIR_CHN_MX')) {
                            const airSalePrice = pkg.air_sale_price ? Number(pkg.air_sale_price) : 0;
                            if (airSalePrice > 0) {
                              // Precio congelado desde backend (tarifa asignada al llegar a gestión aérea)
                              const tariffLabel = pkg.air_tariff_type === 'L' ? 'Logo' : pkg.air_tariff_type === 'G' ? 'Genérico' : pkg.air_tariff_type || '';
                              return (
                                <Box sx={{ textAlign: 'right' }}>
                                  <Typography variant="body2" color="warning.main" fontWeight="bold" sx={{ fontSize: '0.8rem' }}>
                                    ${airSalePrice.toFixed(2)} USD
                                  </Typography>
                                  {tariffLabel && (
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                      {tariffLabel}
                                    </Typography>
                                  )}
                                </Box>
                              );
                            }
                            // Sin precio congelado → mostrar estimado si hay peso
                            if (pkg.weight && Number(pkg.weight) > 0) {
                              const weightKg = Number(pkg.weight);
                              const estUSD = weightKg * 21;
                              return (
                                <Typography variant="body2" color="text.secondary" fontWeight="bold" sx={{ fontSize: '0.8rem', fontStyle: 'italic' }}>
                                  ~${estUSD.toFixed(2)} USD
                                </Typography>
                              );
                            }
                          }
                          if (pkg.client_paid) {
                            return (
                              <Typography variant="body2" color="success.main" fontWeight="bold" sx={{ fontSize: isMobile ? '0.65rem' : '0.75rem' }}>
                                ✅ {isMobile ? '' : 'Pagado'}
                              </Typography>
                            );
                          }
                          return null;
                        })()}
                        <Chip 
                          label={isMobile ? (pkg.status === 'ready_pickup' ? '🟠' : pkg.status === 'in_transit' ? '🔵' : pkg.status === 'delivered' ? '✅' : '⚪') : pkg.status_label} 
                          color={pkg.status === 'ready_pickup' ? 'warning' : pkg.status === 'in_transit' ? 'info' : 'default'}
                          size="small"
                          sx={{ height: isMobile ? 20 : 24, fontSize: isMobile ? '0.65rem' : '0.8rem', ...(pkg.status === 'ready_pickup' && { bgcolor: ORANGE, color: 'white' }) }}
                        />
                      </Box>
                    </Box>

                    {/* Stepper compacto - Mobile optimized */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, my: isMobile ? 0.5 : 1 }}>
                      {statusSteps.map((label, idx) => {
                        const activeIdx = getStatusStep(pkg.status);
                        const isCompleted = idx < activeIdx;
                        const isActive = idx === activeIdx;
                        return (
                          <Box key={label} sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                            <Box sx={{ 
                              width: isMobile ? 16 : 20, height: isMobile ? 16 : 20, borderRadius: '50%', 
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              bgcolor: isCompleted ? ORANGE : isActive ? ORANGE : 'grey.300',
                              color: 'white', fontSize: isMobile ? '0.55rem' : '0.65rem', fontWeight: 'bold',
                            }}>
                              {isCompleted ? '✓' : idx + 1}
                            </Box>
                            {idx < statusSteps.length - 1 && (
                              <Box sx={{ flex: 1, height: 2, bgcolor: isCompleted ? ORANGE : 'grey.300', mx: 0.5 }} />
                            )}
                          </Box>
                        );
                      })}
                    </Box>
                    {!isMobile && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'text.secondary', px: 0.5 }}>
                      {statusSteps.map((label) => (
                        <Typography key={label} variant="caption" sx={{ fontSize: '0.6rem', textAlign: 'center', flex: 1 }}>{label}</Typography>
                      ))}
                    </Box>
                    )}

                    {/* Footer compacto - Mobile optimized */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: isMobile ? 0.5 : 1, pt: isMobile ? 0.5 : 1, borderTop: '1px solid #f0f0f0', flexWrap: isMobile ? 'wrap' : 'nowrap', gap: isMobile ? 0.5 : 0 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: isMobile ? '0.6rem' : '0.7rem' }}>
                        ⏱ {pkg.fecha_estimada ? (isMobile ? pkg.fecha_estimada : t('cd.packages.eta') + ': ' + pkg.fecha_estimada) : t('cd.packages.etaPending')}
                      </Typography>
                      
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {/* Indicador de Instrucciones de Entrega */}
                        {hasDeliveryInstructions ? (
                          <Chip 
                            icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                            label="Con Instrucciones"
                            size="small"
                            sx={{ 
                              bgcolor: ORANGE, 
                              color: 'white',
                              fontSize: '0.65rem',
                              fontWeight: 'bold',
                              height: 22,
                              '& .MuiChip-icon': { color: 'white' },
                              '& .MuiChip-label': { px: 0.5 }
                            }}
                          />
                        ) : (
                          <Chip 
                            icon={<CancelIcon sx={{ fontSize: 14 }} />}
                            label="Sin Instrucciones"
                            size="small"
                            sx={{ 
                              bgcolor: '#D32F2F', 
                              color: 'white',
                              fontSize: '0.65rem',
                              fontWeight: 'bold',
                              height: 22,
                              '& .MuiChip-icon': { color: 'white' },
                              '& .MuiChip-label': { px: 0.5 }
                            }}
                          />
                        )}
                        {/* Indicador de Garantía Extendida - Compacto */}
                        {pkg.has_gex ? (
                          <Chip 
                            icon={<SecurityIcon sx={{ fontSize: 12 }} />}
                            label={t('cd.packages.gexProtected')}
                            size="small"
                            sx={{ 
                              bgcolor: ORANGE, 
                              color: 'white',
                              fontSize: '0.65rem',
                              height: 20,
                              '& .MuiChip-icon': { color: 'white' },
                              '& .MuiChip-label': { px: 0.5 }
                            }}
                          />
                        ) : (
                          <Chip 
                            icon={
                              <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16 }}>
                                <SecurityIcon sx={{ fontSize: 12, color: 'white' }} />
                                <Box sx={{ position: 'absolute', width: '120%', height: 2, bgcolor: 'white', transform: 'rotate(-45deg)', borderRadius: 1 }} />
                              </Box>
                            }
                            label={t('cd.packages.noGex')}
                            size="small"
                            clickable
                            onClick={() => {
                              setSelectedPackageIds([pkg.id]);
                              setGexTargetPackages([pkg]);
                              setGexValorFactura(''); setGexDescripcion(''); setGexQuote(null);
                              setGexModalOpen(true);
                            }}
                            sx={{ 
                              bgcolor: '#D32F2F', 
                              color: 'white',
                              fontSize: '0.65rem',
                              height: 20,
                              cursor: 'pointer',
                              '&:hover': { bgcolor: '#C62828' },
                              '& .MuiChip-icon': { color: 'white' },
                              '& .MuiChip-label': { px: 0.5 }
                            }}
                          />
                        )}
                        
                        <Button 
                          variant={pkg.status === 'ready_pickup' ? 'contained' : 'outlined'}
                          size="small" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPackage(pkg);
                            // Si la búsqueda coincide con una guía hija, resaltarla
                            setHighlightedGuideTracking(matchedChildGuide?.tracking || null);
                            setPackageDetailOpen(true);
                          }}
                          sx={{ 
                            py: 0.5, 
                            fontSize: '0.75rem', 
                            bgcolor: pkg.status === 'ready_pickup' ? ORANGE : 'transparent',
                            borderColor: ORANGE,
                            color: pkg.status === 'ready_pickup' ? 'white' : ORANGE,
                            '&:hover': {
                              bgcolor: pkg.status === 'ready_pickup' ? '#d65f00' : 'rgba(255,119,0,0.1)'
                            }
                          }}
                        >
                          {t('cd.packages.viewDetails')}
                        </Button>
                      </Box>
                    </Box>

                  </CardContent>
                </Card>
              );
              })}

              {/* Paginación */}
              {totalPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 3, mb: 2 }}>
                  <Pagination 
                    count={totalPages} 
                    page={currentPage} 
                    onChange={(_, page) => setCurrentPage(page)}
                    color="primary"
                    size="large"
                    showFirstButton
                    showLastButton
                    sx={{
                      '& .MuiPaginationItem-root': {
                        color: ORANGE,
                      },
                      '& .Mui-selected': {
                        bgcolor: `${ORANGE} !important`,
                        color: 'white !important',
                      },
                    }}
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                    Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, getFilteredPackages().length)} de {getFilteredPackages().length}
                  </Typography>
                </Box>
              )}

              {packages.length === 0 && (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                  <InventoryIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                  <Typography color="text.secondary">{t('cd.packages.noPackages')}</Typography>
                </Box>
              )}

              {/* Botón para ver historial */}
              <Box sx={{ mt: 3, textAlign: 'center' }}>
                <Button
                  variant="outlined"
                  startIcon={<HistoryIcon />}
                  onClick={loadHistoryPackages}
                  sx={{ borderColor: ORANGE, color: ORANGE }}
                >
                  {t('cd.packages.viewHistory')}
                </Button>
              </Box>
            </Box>
          )}

          {/* Tab: Cotizador Universal */}
          {activeTab === 1 && (
            <Box>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                🧮 Cotizador de Envíos
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Selecciona el tipo de servicio y calcula el costo estimado de tu envío
              </Typography>

              {/* Selector de Servicio */}
              <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  1️⃣ Selecciona el Tipo de Servicio
                </Typography>
                <Grid container spacing={2}>
                  {[
                    { id: 'maritimo', icono: '🚢', nombre: 'Marítimo China', desc: '45-60 días', color: '#00BCD4' },
                    { id: 'aereo', icono: '✈️', nombre: 'Aéreo China', desc: '10-15 días', color: ORANGE },
                    { id: 'pobox', icono: '📦', nombre: 'PO Box USA', desc: '5-10 días', color: BLUE },
                    { id: 'dhl', icono: '📮', nombre: 'DHL Nacional', desc: '1-3 días', color: '#FFCC00' },
                  ].map((svc) => (
                    <Grid size={{ xs: 6, md: 3 }} key={svc.id}>
                      <Paper 
                        sx={{ 
                          p: 2, 
                          textAlign: 'center', 
                          cursor: 'pointer',
                          border: quoteService === svc.id ? `3px solid ${svc.color}` : '1px solid #ddd',
                          bgcolor: quoteService === svc.id ? `${svc.color}10` : 'white',
                          transition: 'all 0.2s',
                          '&:hover': { borderColor: svc.color, transform: 'scale(1.02)' },
                        }}
                        onClick={() => handleServiceChange(svc.id)}
                      >
                        <Typography sx={{ fontSize: '2rem' }}>{svc.icono}</Typography>
                        <Typography variant="subtitle2" fontWeight="bold">{svc.nombre}</Typography>
                        <Typography variant="caption" color="text.secondary">{svc.desc}</Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </Paper>

              {/* Formulario de Dimensiones */}
              {quoteService && (
                <Grid container spacing={3}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Paper sx={{ p: 3, bgcolor: 'grey.50', borderRadius: 2 }}>
                      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                        2️⃣ {quoteService === 'dhl' ? 'Selecciona el Tipo de Paquete' : 'Ingresa las Dimensiones'}
                      </Typography>
                      
                      {quoteService === 'dhl' ? (
                        // Para DHL: peso y dimensiones con límite de 40 kg
                        <Box>
                          <Alert severity="info" sx={{ mb: 2 }}>
                            <Typography variant="body2">
                              📦 <strong>Límite DHL:</strong> Máximo 40 kg por caja. Para embarques mayores, usa Aéreo China.
                            </Typography>
                          </Alert>
                          <FormControl fullWidth sx={{ mb: 2 }}>
                            <InputLabel>Tipo de Paquete</InputLabel>
                            <Select
                              value={quoteCategoria}
                              label="Tipo de Paquete"
                              onChange={(e) => setQuoteCategoria(e.target.value)}
                            >
                              <MenuItem value="STANDARD">Standard (Accesorios/Mixtos)</MenuItem>
                              <MenuItem value="HIGH_VALUE">High Value (Refacciones)</MenuItem>
                            </Select>
                          </FormControl>
                          <Grid container spacing={2}>
                            <Grid size={4}>
                              <TextField
                                fullWidth
                                size="small"
                                label="Largo (cm)"
                                type="number"
                                value={cbmLargo}
                                onChange={(e) => setCbmLargo(e.target.value)}
                              />
                            </Grid>
                            <Grid size={4}>
                              <TextField
                                fullWidth
                                size="small"
                                label="Ancho (cm)"
                                type="number"
                                value={cbmAncho}
                                onChange={(e) => setCbmAncho(e.target.value)}
                              />
                            </Grid>
                            <Grid size={4}>
                              <TextField
                                fullWidth
                                size="small"
                                label="Alto (cm)"
                                type="number"
                                value={cbmAlto}
                                onChange={(e) => setCbmAlto(e.target.value)}
                              />
                            </Grid>
                            <Grid size={6}>
                              <TextField
                                fullWidth
                                size="small"
                                label="Peso (kg)"
                                type="number"
                                value={cbmPeso}
                                onChange={(e) => setCbmPeso(e.target.value)}
                                error={parseFloat(cbmPeso) > 40}
                                helperText={parseFloat(cbmPeso) > 40 ? '⚠️ Excede 40 kg. Usa Aéreo China.' : 'Máximo 40 kg por caja'}
                              />
                            </Grid>
                            <Grid size={6}>
                              <TextField
                                fullWidth
                                size="small"
                                label="Cantidad de cajas"
                                type="number"
                                value={quoteCantidad}
                                onChange={(e) => setQuoteCantidad(e.target.value)}
                              />
                            </Grid>
                          </Grid>
                        </Box>
                      ) : quoteService === 'pobox' ? (
                        // Para PO Box: dimensiones (se cotiza por volumen)
                        <Box>
                          <Alert severity="info" sx={{ mb: 2 }}>
                            <Typography variant="body2">
                              📦 PO Box se cotiza por dimensiones. Ingresa las medidas de tu paquete.
                            </Typography>
                          </Alert>
                          <Grid container spacing={2}>
                            <Grid size={4}>
                              <TextField
                                fullWidth
                                size="small"
                                label="Largo (cm)"
                                type="number"
                                value={cbmLargo}
                                onChange={(e) => setCbmLargo(e.target.value)}
                              />
                            </Grid>
                            <Grid size={4}>
                              <TextField
                                fullWidth
                                size="small"
                                label="Ancho (cm)"
                                type="number"
                                value={cbmAncho}
                                onChange={(e) => setCbmAncho(e.target.value)}
                              />
                            </Grid>
                            <Grid size={4}>
                              <TextField
                                fullWidth
                                size="small"
                                label="Alto (cm)"
                                type="number"
                                value={cbmAlto}
                                onChange={(e) => setCbmAlto(e.target.value)}
                              />
                            </Grid>
                            <Grid size={12}>
                              <TextField
                                fullWidth
                                size="small"
                                label="Cantidad de paquetes"
                                type="number"
                                value={quoteCantidad}
                                onChange={(e) => setQuoteCantidad(e.target.value)}
                              />
                            </Grid>
                          </Grid>
                        </Box>
                      ) : (
                        // Para otros servicios, dimensiones
                        <Grid container spacing={2}>
                          <Grid size={4}>
                            <TextField
                              fullWidth
                              size="small"
                              label="Largo (cm)"
                              type="number"
                              value={cbmLargo}
                              onChange={(e) => setCbmLargo(e.target.value)}
                            />
                          </Grid>
                          <Grid size={4}>
                            <TextField
                              fullWidth
                              size="small"
                              label="Ancho (cm)"
                              type="number"
                              value={cbmAncho}
                              onChange={(e) => setCbmAncho(e.target.value)}
                            />
                          </Grid>
                          <Grid size={4}>
                            <TextField
                              fullWidth
                              size="small"
                              label="Alto (cm)"
                              type="number"
                              value={cbmAlto}
                              onChange={(e) => setCbmAlto(e.target.value)}
                            />
                          </Grid>
                          {(quoteService === 'aereo') && (
                            <Grid size={12}>
                              <TextField
                                fullWidth
                                size="small"
                                label="Peso Real (kg)"
                                type="number"
                                value={cbmPeso}
                                onChange={(e) => setCbmPeso(e.target.value)}
                                helperText="Se usará el mayor entre peso real y volumétrico"
                              />
                            </Grid>
                          )}
                          {quoteService === 'aereo' && (
                            <Grid size={12}>
                              <FormControl fullWidth size="small">
                                <InputLabel>Tipo de Mercancía</InputLabel>
                                <Select
                                  value={quoteCategoria}
                                  label="Tipo de Mercancía"
                                  onChange={(e) => setQuoteCategoria(e.target.value)}
                                >
                                  <MenuItem value="G">Genérico</MenuItem>
                                  <MenuItem value="L">Logotipo (+$9/kg)</MenuItem>
                                  <MenuItem value="S">Sensible (precio especial)</MenuItem>
                                  <MenuItem value="F">Flat (+$7/kg)</MenuItem>
                                </Select>
                              </FormControl>
                            </Grid>
                          )}
                          {quoteService === 'maritimo' && (
                            <Grid size={12}>
                              <FormControl fullWidth size="small">
                                <InputLabel>Categoría de Mercancía</InputLabel>
                                <Select
                                  value={quoteCategoria}
                                  label="Categoría de Mercancía"
                                  onChange={(e) => setQuoteCategoria(e.target.value)}
                                >
                                  <MenuItem value="Generico">Genérico</MenuItem>
                                  <MenuItem value="Sensible">Sensible</MenuItem>
                                  <MenuItem value="Logotipo">Logotipo</MenuItem>
                                  <MenuItem value="StartUp">StartUp (≤0.75 CBM)</MenuItem>
                                </Select>
                              </FormControl>
                            </Grid>
                          )}
                          <Grid size={12}>
                            <TextField
                              fullWidth
                              size="small"
                              label="Cantidad"
                              type="number"
                              value={quoteCantidad}
                              onChange={(e) => setQuoteCantidad(e.target.value)}
                            />
                          </Grid>
                        </Grid>
                      )}
                      
                      <Button 
                        variant="contained" 
                        fullWidth 
                        onClick={handleCalculateQuote}
                        disabled={quoteLoading}
                        sx={{ bgcolor: ORANGE, mt: 2 }}
                        startIcon={quoteLoading ? <CircularProgress size={20} color="inherit" /> : <CalculateIcon />}
                      >
                        {quoteLoading ? 'Calculando...' : 'Calcular Cotización'}
                      </Button>
                    </Paper>
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    {quoteResult ? (
                      <Paper sx={{ p: 3, borderRadius: 2, border: `2px solid ${ORANGE}` }}>
                        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                          ✅ Cotización Estimada
                        </Typography>
                        <Divider sx={{ my: 2 }} />
                        
                        {/* Precio Principal */}
                        <Box sx={{ textAlign: 'center', mb: 3 }}>
                          <Typography variant="caption" color="text.secondary">Costo Estimado</Typography>
                          <Typography variant="h3" fontWeight="bold" color={ORANGE}>
                            ${quoteResult.precio_usd} USD
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            ≈ ${quoteResult.precio_mxn} MXN
                          </Typography>
                        </Box>

                        {/* Detalles según servicio */}
                        <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 2, mb: 2 }}>
                          {quoteResult.cbm_cobrable && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                              <Typography variant="body2">Volumen (CBM):</Typography>
                              <Typography variant="body2" fontWeight="bold">{quoteResult.cbm_cobrable} m³</Typography>
                            </Box>
                          )}
                          {quoteResult.peso_cobrable && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                              <Typography variant="body2">Peso Cobrable:</Typography>
                              <Typography variant="body2" fontWeight="bold">{quoteResult.peso_cobrable} kg</Typography>
                            </Box>
                          )}
                          {quoteResult.precio_por_kg && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                              <Typography variant="body2">Tarifa por kg:</Typography>
                              <Typography variant="body2" fontWeight="bold">${quoteResult.precio_por_kg} USD/kg</Typography>
                            </Box>
                          )}
                          {quoteResult.categoria && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                              <Typography variant="body2">Categoría:</Typography>
                              <Chip label={quoteResult.categoria} size="small" />
                            </Box>
                          )}
                          {quoteResult.tiempo_estimado && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Typography variant="body2">Tiempo Estimado:</Typography>
                              <Typography variant="body2" fontWeight="bold">{quoteResult.tiempo_estimado}</Typography>
                            </Box>
                          )}
                        </Box>

                        <Alert severity="info" sx={{ mt: 2 }}>
                          <Typography variant="caption">
                            * Precio de referencia. El costo final puede variar según dimensiones exactas, peso real y tipo de mercancía.
                            Tipo de cambio: ${quoteResult.tipo_cambio} MXN/USD
                          </Typography>
                        </Alert>
                      </Paper>
                    ) : (
                      <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50', borderRadius: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <InfoIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                        <Typography color="text.secondary">
                          Ingresa las dimensiones para ver la cotización estimada
                        </Typography>
                      </Paper>
                    )}
                  </Grid>
                </Grid>
              )}

              {/* Tabla de tarifas de referencia */}
              <Paper sx={{ p: 3, mt: 3, borderRadius: 2 }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  📋 Tarifas de Referencia
                </Typography>
                {ratesLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress />
                  </Box>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: 'grey.900' }}>
                          <TableCell sx={{ color: 'white' }}><strong>SERVICIO</strong></TableCell>
                          <TableCell sx={{ color: 'white' }}><strong>TIEMPO ESTIMADO</strong></TableCell>
                          <TableCell sx={{ color: 'white' }}><strong>PRECIO</strong></TableCell>
                          <TableCell sx={{ color: 'white' }}><strong>NOTAS</strong></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {publicRates?.servicios?.map((svc: { id: string; nombre: string; icono: string; tiempo_estimado: string; precio_base_usd: number; precio_base_mxn: number; unidad: string; notas: string }) => (
                          <TableRow hover key={svc.id}>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography sx={{ fontSize: '1.2rem' }}>{svc.icono}</Typography>
                                <Typography fontWeight="bold">{svc.nombre}</Typography>
                              </Box>
                            </TableCell>
                            <TableCell>{svc.tiempo_estimado}</TableCell>
                            <TableCell>
                              <Typography fontWeight="bold" color="primary.main">
                                ${svc.precio_base_usd.toFixed(2)} USD/{svc.unidad}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                ≈ ${svc.precio_base_mxn.toFixed(2)} MXN/{svc.unidad}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">
                                {svc.notas}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )) || (
                          <>
                            <TableRow hover>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <BoatIcon sx={{ color: '#00BCD4' }} /> Marítimo China
                                </Box>
                              </TableCell>
                              <TableCell>45-60 días</TableCell>
                              <TableCell>
                                <Typography fontWeight="bold" color="primary.main">Desde $39 USD/CBM</Typography>
                              </TableCell>
                              <TableCell>Ideal para volúmenes grandes</TableCell>
                            </TableRow>
                            <TableRow hover>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <FlightIcon sx={{ color: ORANGE }} /> Aéreo China
                                </Box>
                              </TableCell>
                              <TableCell>10-15 días</TableCell>
                              <TableCell>
                                <Typography fontWeight="bold" color="primary.main">Desde $8 USD/kg</Typography>
                              </TableCell>
                              <TableCell>Para envíos urgentes</TableCell>
                            </TableRow>
                            <TableRow hover>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <PostOfficeIcon sx={{ color: BLUE }} /> PO Box USA
                                </Box>
                              </TableCell>
                              <TableCell>5-10 días</TableCell>
                              <TableCell>
                                <Typography fontWeight="bold" color="primary.main">Desde $3.50 USD/lb</Typography>
                              </TableCell>
                              <TableCell>Compras Amazon, eBay</TableCell>
                            </TableRow>
                            <TableRow hover>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <TruckIcon sx={{ color: '#FFCC00' }} /> DHL Nacional
                                </Box>
                              </TableCell>
                              <TableCell>1-3 días</TableCell>
                              <TableCell>
                                <Typography fontWeight="bold" color="primary.main">Desde $145 USD</Typography>
                              </TableCell>
                              <TableCell>Liberación en Monterrey</TableCell>
                            </TableRow>
                          </>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  * Precios de referencia. Tipo de cambio: ${publicRates?.tipo_cambio || '20.00'} MXN/USD. Consulta cotización exacta.
                </Typography>
              </Paper>
            </Box>
          )}

          {/* Tab: Mi Cuenta */}
          {activeTab === 2 && (
            <Box>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 5 }}>
                  {/* Wallet / Monedero */}
                  <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                    <Typography variant="h6" fontWeight="bold" gutterBottom>
                      {t('cd.account.walletTitle')}
                    </Typography>
                    <Divider sx={{ my: 2 }} />
                    
                    {/* CLABE Virtual */}
                    {walletStatus?.virtual_clabe && (
                      <Alert severity="success" sx={{ mb: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Box>
                            <Typography variant="caption">{t('cd.account.virtualClabe')}</Typography>
                            <Typography variant="body1" fontWeight="bold" fontFamily="monospace">
                              {walletStatus.virtual_clabe}
                            </Typography>
                          </Box>
                          <Tooltip title={t('cd.account.copyClabe')}>
                            <IconButton size="small" onClick={() => copyClabe(walletStatus.virtual_clabe!)}>
                              <CopyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Alert>
                    )}
                    
                    {/* Total Pendiente por Pagar - Grande como en la app */}
                    <Paper 
                      sx={{ 
                        p: 2.5, 
                        mb: 2, 
                        background: (stats?.financiero?.saldo_pendiente || 0) > 0 
                          ? 'linear-gradient(135deg, #F05A28 0%, #d94d1f 100%)' 
                          : 'linear-gradient(135deg, #4CAF50 0%, #388E3C 100%)',
                        textAlign: 'center', 
                        borderRadius: 2 
                      }}
                    >
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)' }}>Total Pendiente por Pagar</Typography>
                      <Typography variant="h4" fontWeight="bold" sx={{ color: 'white', my: 0.5 }}>
                        {formatCurrency(stats?.financiero?.saldo_pendiente || 0)}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>MXN</Typography>
                    </Paper>

                    {/* Desglose por Tipo de Servicio */}
                    {stats?.financiero?.saldo_por_servicio && stats.financiero.saldo_por_servicio.length > 0 && (
                      <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom sx={{ color: 'text.secondary' }}>
                          📊 Pendiente por Tipo de Servicio
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {stats.financiero.saldo_por_servicio.map((item, index) => (
                            <Box 
                              key={index}
                              sx={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                p: 1.5,
                                bgcolor: 'white',
                                borderRadius: 1,
                                border: '1px solid #e0e0e0'
                              }}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography fontSize="1.2rem">{item.icono}</Typography>
                                <Typography variant="body2" fontWeight="medium">{item.servicio}</Typography>
                              </Box>
                              <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="body2" fontWeight="bold" color="error.main">
                                  ${item.monto.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">{item.moneda || 'MXN'}</Typography>
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      </Paper>
                    )}

                    {/* Cotizaciones Pendientes de Pago */}
                    {(pendingPayments?.totalPending || 0) > 0 && (
                      <Paper 
                        sx={{ 
                          p: 2, 
                          mb: 2, 
                          bgcolor: '#FFF3E0', 
                          border: '1px solid #FFE0B2',
                          borderRadius: 2 
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              📋 Cotizaciones Generadas Pdte. de Pago
                            </Typography>
                            <Typography variant="h6" fontWeight="bold" color="warning.dark">
                              {formatCurrency(pendingPayments?.totalPending || 0)}
                            </Typography>
                          </Box>
                          <Button 
                            size="small"
                            variant="outlined"
                            color="warning"
                            onClick={() => setShowPendingPayments(true)}
                          >
                            Ver ({pendingPayments?.invoices?.length || 0})
                          </Button>
                        </Box>
                      </Paper>
                    )}

                    <Grid container spacing={2}>
                      <Grid size={6}>
                        <Paper sx={{ p: 2, bgcolor: GREEN + '20', textAlign: 'center', borderRadius: 2 }}>
                          <Typography variant="caption" color="text.secondary">{t('cd.account.balanceFavor')}</Typography>
                          <Typography variant="h5" fontWeight="bold" color="success.main">
                            {formatCurrency(walletStatus?.wallet_balance || stats?.financiero.saldo_favor || 0)}
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid size={6}>
                        <Paper sx={{ p: 2, bgcolor: 'grey.50', textAlign: 'center', borderRadius: 2 }}>
                          <Typography variant="caption" color="text.secondary">{t('cd.account.creditAvailable')}</Typography>
                          <Typography variant="h5" fontWeight="bold" color="primary.main">
                            {formatCurrency(walletStatus?.available_credit || stats?.financiero.credito_disponible || 0)}
                          </Typography>
                        </Paper>
                      </Grid>
                    </Grid>

                    {/* Crédito si lo tiene */}
                    {walletStatus?.has_credit && (
                      <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>📈 {t('cd.account.creditLine')}</Typography>
                        <Grid container spacing={1}>
                          <Grid size={6}>
                            <Typography variant="caption">{t('cd.account.available')}</Typography>
                            <Typography variant="body1" fontWeight="bold" color="success.main">
                              {formatCurrency(walletStatus.available_credit)}
                            </Typography>
                          </Grid>
                          <Grid size={6}>
                            <Typography variant="caption">{t('cd.account.used')}</Typography>
                            <Typography variant="body1" fontWeight="bold" color="warning.main">
                              {formatCurrency(walletStatus.used_credit)}
                            </Typography>
                          </Grid>
                        </Grid>
                        {walletStatus.is_credit_blocked && (
                          <Alert severity="error" sx={{ mt: 1 }}>{t('cd.account.creditBlocked')}</Alert>
                        )}
                      </Box>
                    )}

                    {/* Último pago */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2, pt: 1, borderTop: '1px solid #eee' }}>
                      <Typography variant="caption" color="text.secondary">{t('cd.account.lastPayment')}</Typography>
                      <Typography variant="caption" fontWeight="bold">{stats?.financiero.ultimo_pago || 'N/A'}</Typography>
                    </Box>
                  </Paper>

                  {/* 🎁 Invita y Gana $500 */}
                  <Paper sx={{ p: 3, mb: 3, borderRadius: 2, background: 'linear-gradient(135deg, #FFF8E1 0%, #FFF3E0 100%)', border: '1px solid #FFE0B2' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <GiftIcon sx={{ color: ORANGE, fontSize: 28 }} />
                      <Box>
                        <Typography variant="h6" fontWeight="bold" sx={{ color: '#E65100' }}>
                          ¡Invita y Gana $500!
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Por cada amigo que haga su primer envío, tú ganas $500 MXN
                        </Typography>
                      </Box>
                    </Box>
                    <Divider sx={{ mb: 2 }} />

                    {/* Código de referido */}
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                        Tu código de referido
                      </Typography>
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 1.5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          bgcolor: 'white',
                          borderRadius: 2,
                          border: '2px dashed',
                          borderColor: ORANGE,
                        }}
                      >
                        <Typography variant="h5" fontWeight="bold" fontFamily="monospace" sx={{ color: ORANGE, letterSpacing: 2 }}>
                          {referralCode || '---'}
                        </Typography>
                        <Tooltip title="Copiar código">
                          <IconButton
                            size="small"
                            onClick={() => {
                              if (referralCode) {
                                navigator.clipboard.writeText(referralCode);
                                setSnackbar({ open: true, message: '✅ Código copiado', severity: 'success' });
                              }
                            }}
                          >
                            <CopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Paper>
                    </Box>

                    {/* Botón WhatsApp */}
                    <Button
                      variant="contained"
                      fullWidth
                      size="large"
                      onClick={() => {
                        const baseUrl = window.location.origin;
                        const shareUrl = `${baseUrl}/?ref=${encodeURIComponent(referralCode)}`;
                        const msg = `🎁 ¡Te invito a EntregaX! Regístrate con mi código *${referralCode}* para que yo gane *$500 MXN* de saldo cuando hagas tu primer envío.\n\n📦 Los mejores precios en envíos desde USA, China y más.\n\n👉 ${shareUrl}`;
                        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                      }}
                      disabled={!referralCode}
                      sx={{
                        mb: 1.5,
                        background: '#25D366',
                        '&:hover': { background: '#1EBE5A' },
                        fontWeight: 'bold',
                        fontSize: '0.95rem',
                        borderRadius: 2,
                        textTransform: 'none',
                      }}
                      startIcon={
                        <Box component="img" src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" sx={{ width: 22, height: 22 }} />
                      }
                    >
                      Compartir por WhatsApp
                    </Button>

                    {/* Botón copiar link */}
                    <Button
                      variant="outlined"
                      fullWidth
                      size="small"
                      onClick={() => {
                        const baseUrl = window.location.origin;
                        const shareUrl = `${baseUrl}/?ref=${encodeURIComponent(referralCode)}`;
                        navigator.clipboard.writeText(shareUrl);
                        setSnackbar({ open: true, message: '✅ Link de invitación copiado', severity: 'success' });
                      }}
                      disabled={!referralCode}
                      startIcon={<ShareIcon />}
                      sx={{ mb: 2, textTransform: 'none' }}
                    >
                      Copiar link de invitación
                    </Button>

                    {/* Stats mini */}
                    <Grid container spacing={1} sx={{ mb: 1 }}>
                      <Grid size={4}>
                        <Paper sx={{ p: 1, textAlign: 'center', bgcolor: 'white', borderRadius: 1.5 }}>
                          <PeopleIcon sx={{ color: ORANGE, fontSize: 20 }} />
                          <Typography variant="h6" fontWeight="bold">{referralStats.total}</Typography>
                          <Typography variant="caption" color="text.secondary">Invitados</Typography>
                        </Paper>
                      </Grid>
                      <Grid size={4}>
                        <Paper sx={{ p: 1, textAlign: 'center', bgcolor: 'white', borderRadius: 1.5 }}>
                          <CheckCircleIcon sx={{ color: GREEN, fontSize: 20 }} />
                          <Typography variant="h6" fontWeight="bold" color="success.main">{referralStats.validated}</Typography>
                          <Typography variant="caption" color="text.secondary">Validados</Typography>
                        </Paper>
                      </Grid>
                      <Grid size={4}>
                        <Paper sx={{ p: 1, textAlign: 'center', bgcolor: 'white', borderRadius: 1.5 }}>
                          <MoneyIcon sx={{ color: GREEN, fontSize: 20 }} />
                          <Typography variant="h6" fontWeight="bold" color="success.main">
                            {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(referralStats.earnings)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">Ganado</Typography>
                        </Paper>
                      </Grid>
                    </Grid>

                    {/* Lista de referidos */}
                    {myReferrals.length > 0 && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>Mis Referidos</Typography>
                        {myReferrals.slice(0, 5).map((ref: any, idx: number) => (
                          <Box
                            key={idx}
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              py: 0.8,
                              borderBottom: idx < Math.min(myReferrals.length, 5) - 1 ? '1px solid #eee' : 'none',
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <PersonIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                              <Typography variant="body2">{ref.nombre || ref.name || 'Usuario'}</Typography>
                            </Box>
                            <Chip
                              label={ref.estado === 'validado' ? '✅ Validado' : ref.estado === 'registrado' ? '⏳ Pendiente' : ref.estado}
                              size="small"
                              color={ref.estado === 'validado' ? 'success' : 'warning'}
                              variant="filled"
                              sx={{ fontSize: '0.7rem' }}
                            />
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Paper>

                  {/* Mis Métodos de Pago */}
                  <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6" fontWeight="bold">
                        {t('cd.account.paymentMethodsTitle')}
                      </Typography>
                      <IconButton color="primary" onClick={() => setShowAddPaymentMethod(true)}>
                        <AddIcon />
                      </IconButton>
                    </Box>
                    <Divider sx={{ mb: 2 }} />
                    
                    {paymentMethods.length === 0 ? (
                      <Box sx={{ textAlign: 'center', py: 2 }}>
                        <CreditCardIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                        <Typography variant="body2" color="text.secondary">
                          {t('cd.account.noPaymentMethods')}
                        </Typography>
                        <Button 
                          variant="outlined" 
                          size="small" 
                          sx={{ mt: 1 }}
                          onClick={() => setShowAddPaymentMethod(true)}
                        >
                          {t('cd.account.addMethod')}
                        </Button>
                      </Box>
                    ) : (
                      paymentMethods.map((pm) => (
                        <Paper
                          key={pm.id} 
                          variant="outlined"
                          sx={{ 
                            p: 2,
                            mb: 1.5,
                            borderRadius: 2,
                            border: pm.is_default ? '2px solid' : '1px solid',
                            borderColor: pm.is_default ? 'primary.main' : 'divider',
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <Avatar sx={{ bgcolor: pm.type === 'paypal' ? '#003087' : pm.type === 'card' ? '#1976d2' : '#4caf50', width: 40, height: 40 }}>
                                {pm.type === 'card' && <CreditCardIcon />}
                                {pm.type === 'paypal' && <PaymentIcon />}
                                {pm.type === 'bank_transfer' && <AccountBalanceIcon />}
                              </Avatar>
                              <Box>
                                <Typography variant="body2" fontWeight="bold">
                                  {pm.alias}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {pm.type === 'card' && `•••• •••• •••• ${pm.last_four}`}
                                  {pm.type === 'paypal' && pm.paypal_email}
                                  {pm.type === 'bank_transfer' && `${pm.bank_name} •••• ${pm.clabe?.slice(-4)}`}
                                </Typography>
                              </Box>
                            </Box>
                            <IconButton 
                              size="small" 
                              color="error"
                              onClick={async () => {
                                try {
                                  await api.delete(`/payment-methods/${pm.id}`);
                                  setPaymentMethods(prev => prev.filter(p => p.id !== pm.id));
                                  setSnackbar({ open: true, message: t('cd.snackbar.paymentMethodDeleted'), severity: 'success' });
                                } catch {
                                  setSnackbar({ open: true, message: t('cd.snackbar.deleteError'), severity: 'error' });
                                }
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                          {pm.is_default ? (
                            <Chip label={t('cd.account.defaultLabel')} size="small" color="warning" sx={{ mt: 1, fontSize: '0.7rem' }} />
                          ) : (
                            <Typography 
                              variant="caption" 
                              color="primary" 
                              sx={{ mt: 0.5, display: 'block', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                              onClick={async () => {
                                try {
                                  await api.put(`/payment-methods/${pm.id}/default`);
                                  setPaymentMethods(prev => prev.map(p => ({
                                    ...p,
                                    is_default: p.id === pm.id
                                  })));
                                  setSnackbar({ open: true, message: t('cd.snackbar.defaultMethodUpdated'), severity: 'success' });
                                } catch {
                                  setSnackbar({ open: true, message: t('cd.snackbar.updateError'), severity: 'error' });
                                }
                              }}
                            >
                              {t('cd.account.setDefault')}
                            </Typography>
                          )}
                        </Paper>
                      ))
                    )}
                  </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 7 }}>
                  {/* MIS DIRECCIONES DE ENTREGA */}
                  <Paper id="addresses-section" sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6" fontWeight="bold">
                        {t('cd.account.addressesTitle')}
                      </Typography>
                      <Button 
                        variant="contained" 
                        size="small"
                        startIcon={<AddIcon />}
                        sx={{ bgcolor: ORANGE }}
                        onClick={() => {
                          setEditingAddress(null);
                          setColonyOptions([]);
                          setAddressForm({
                            alias: '',
                            first_name: '',
                            last_name: '',
                            street: '',
                            exterior_number: '',
                            interior_number: '',
                            colony: '',
                            city: '',
                            state: '',
                            zip_code: '',
                            country: 'México',
                            country_code: '+52',
                            phone: '',
                            reference: '',
                            service_types: [],
                            carrier_config: {} as Record<string, string>,
                          });
                          setAddressModalOpen(true);
                        }}
                      >
                        {t('cd.account.newAddress')}
                      </Button>
                    </Box>
                    <Divider sx={{ mb: 2 }} />

                    {deliveryAddresses.length === 0 ? (
                      <Box sx={{ textAlign: 'center', py: 4 }}>
                        <LocationOnIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                        <Typography color="text.secondary">{t('cd.account.noAddresses')}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {t('cd.account.addAddressPrompt')}
                        </Typography>
                      </Box>
                    ) : (
                      <Grid container spacing={2}>
                        {deliveryAddresses.map((addr) => (
                          <Grid size={{ xs: 12, sm: 6 }} key={addr.id}>
                            <Card 
                              variant="outlined" 
                              sx={{ 
                                borderColor: addr.is_default ? ORANGE : 'divider',
                                position: 'relative',
                              }}
                            >
                              {addr.is_default && (
                                <Chip 
                                  icon={<StarIcon />}
                                  label={t('cd.account.mainChip')} 
                                  size="small" 
                                  color="warning"
                                  sx={{ position: 'absolute', top: 8, right: 8 }}
                                />
                              )}
                              <CardContent>
                                <Typography variant="subtitle1" fontWeight="bold">{addr.alias}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {addr.contact_name && `${addr.contact_name} • `}{addr.phone}
                                </Typography>
                                <Typography variant="body2" sx={{ mt: 1 }}>
                                  {addr.street} {addr.exterior_number}
                                  {addr.interior_number && ` Int. ${addr.interior_number}`}
                                </Typography>
                                <Typography variant="body2">
                                  {addr.colony && `${addr.colony}, `}
                                  {addr.city}, {addr.state} {addr.zip_code}
                                </Typography>
                                {addr.reference && (
                                  <Typography variant="caption" color="text.secondary">
                                    Ref: {addr.reference}
                                  </Typography>
                                )}
                                {/* Servicios asignados con paquetería */}
                                {addr.default_for_service && (
                                  <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                                    {addr.default_for_service.split(',').map(svc => {
                                      const svcMap: Record<string, { label: string; color: string }> = {
                                        air: { label: '✈️ Aéreo', color: '#2196F3' },
                                        maritime: { label: '🚢 Marítimo', color: '#00897B' },
                                        dhl: { label: '📮 Lib. MTY', color: '#D32F2F' },
                                        usa: { label: '📦 PO Box', color: '#F05A28' },
                                        all: { label: '🌐 Todos', color: '#333' },
                                      };
                                      const trimmed = svc.trim();
                                      const info = svcMap[trimmed] || { label: trimmed, color: '#666' };
                                      // Show carrier name if configured
                                      const carrierKey = addr.carrier_config?.[trimmed];
                                      const carrierLabel = carrierKey ? ` → ${carrierKey}` : '';
                                      return (
                                        <Chip
                                          key={svc}
                                          label={`${info.label}${carrierLabel}`}
                                          size="small"
                                          sx={{ bgcolor: info.color, color: 'white', fontSize: '0.7rem', height: 22 }}
                                        />
                                      );
                                    })}
                                  </Box>
                                )}
                                <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                                  <IconButton size="small" onClick={() => handleEditAddress(addr)}>
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                  <IconButton size="small" color="error" onClick={() => handleDeleteAddress(addr.id)}>
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Box>
                              </CardContent>
                            </Card>
                          </Grid>
                        ))}
                      </Grid>
                    )}
                  </Paper>

                  {/* DATOS FISCALES */}
                  <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6" fontWeight="bold">
                        📄 {t('cd.account.fiscalTitle')}
                      </Typography>
                      <IconButton 
                        color="primary" 
                        onClick={() => {
                          // Pre-llenar datos existentes si los hay
                          if (fiscalData) {
                            setInvoiceData({
                              razon_social: fiscalData.fiscal_razon_social || '',
                              rfc: fiscalData.fiscal_rfc || '',
                              codigo_postal: fiscalData.fiscal_codigo_postal || '',
                              regimen_fiscal: fiscalData.fiscal_regimen_fiscal || '',
                              uso_cfdi: fiscalData.fiscal_uso_cfdi || '',
                              email: '' // Se tomará del usuario actual
                            });
                          }
                          setFiscalModalOpen(true);
                        }}
                      >
                        <EditIcon />
                      </IconButton>
                    </Box>
                    <Divider sx={{ mb: 2 }} />
                    
                    {fiscalData && fiscalData.hasCompleteData ? (
                      <Box>
                        <Alert severity="success" sx={{ mb: 2 }}>
                          <Typography variant="body2">
                            <strong>{t('cd.account.fiscalComplete')}</strong><br/>
                            {t('cd.account.fiscalAutoInvoice')}
                          </Typography>
                        </Alert>
                        
                        <Box sx={{ mb: 1.5 }}>
                          <Typography variant="caption" color="text.secondary">Razón Social</Typography>
                          <Typography variant="body2" fontWeight="bold">
                            {fiscalData.fiscal_razon_social}
                          </Typography>
                        </Box>
                        
                        <Grid container spacing={2}>
                          <Grid size={6}>
                            <Typography variant="caption" color="text.secondary">RFC</Typography>
                            <Typography variant="body2" fontWeight="bold" fontFamily="monospace">
                              {fiscalData.fiscal_rfc}
                            </Typography>
                          </Grid>
                          <Grid size={6}>
                            <Typography variant="caption" color="text.secondary">Código Postal</Typography>
                            <Typography variant="body2" fontWeight="bold">
                              {fiscalData.fiscal_codigo_postal}
                            </Typography>
                          </Grid>
                        </Grid>
                        
                        <Box sx={{ mt: 1.5 }}>
                          <Typography variant="caption" color="text.secondary">Régimen Fiscal</Typography>
                          <Typography variant="body2" fontWeight="bold">
                            {fiscalData.fiscal_regimen_fiscal === '601' && '601 - General de Ley Personas Morales'}
                            {fiscalData.fiscal_regimen_fiscal === '603' && '603 - Personas Morales con Fines no Lucrativos'}
                            {fiscalData.fiscal_regimen_fiscal === '605' && '605 - Sueldos y Salarios'}
                            {fiscalData.fiscal_regimen_fiscal === '606' && '606 - Arrendamiento'}
                            {fiscalData.fiscal_regimen_fiscal === '608' && '608 - Demás ingresos'}
                            {fiscalData.fiscal_regimen_fiscal === '612' && '612 - Personas Físicas con Actividades Empresariales'}
                            {fiscalData.fiscal_regimen_fiscal === '616' && '616 - Sin obligaciones fiscales'}
                            {fiscalData.fiscal_regimen_fiscal === '621' && '621 - Incorporación Fiscal'}
                            {fiscalData.fiscal_regimen_fiscal === '625' && '625 - Régimen de Actividades Agrícolas'}
                            {fiscalData.fiscal_regimen_fiscal === '626' && '626 - Régimen Simplificado de Confianza'}
                            {!['601','603','605','606','608','612','616','621','625','626'].includes(fiscalData.fiscal_regimen_fiscal) && (fiscalData.fiscal_regimen_fiscal || t('cd.account.notConfigured'))}
                          </Typography>
                        </Box>
                        
                        <Box sx={{ mt: 1.5 }}>
                          <Typography variant="caption" color="text.secondary">Uso de CFDI</Typography>
                          <Typography variant="body2" fontWeight="bold">
                            {fiscalData.fiscal_uso_cfdi === 'G03' && 'G03 - Gastos en general'}
                            {fiscalData.fiscal_uso_cfdi === 'G01' && 'G01 - Adquisición de mercancías'}
                            {fiscalData.fiscal_uso_cfdi === 'G02' && 'G02 - Devoluciones, descuentos o bonificaciones'}
                            {fiscalData.fiscal_uso_cfdi === 'I04' && 'I04 - Compra de divisas'}
                            {fiscalData.fiscal_uso_cfdi === 'P01' && 'P01 - Por definir'}
                            {fiscalData.fiscal_uso_cfdi === 'S01' && 'S01 - Sin efectos fiscales'}
                            {!['G03', 'G01', 'G02', 'I04', 'P01', 'S01'].includes(fiscalData.fiscal_uso_cfdi) && (fiscalData.fiscal_uso_cfdi || t('cd.account.notConfigured'))}
                          </Typography>
                        </Box>
                      </Box>
                    ) : (
                      <Box sx={{ textAlign: 'center', py: 2 }}>
                        <ReceiptIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          {t('cd.account.fiscalConfigure')}
                        </Typography>
                        <Button 
                          variant="outlined" 
                          size="small" 
                          sx={{ mt: 1 }}
                          onClick={() => setFiscalModalOpen(true)}
                        >
                          {t('cd.account.configureFiscal')}
                        </Button>
                      </Box>
                    )}
                  </Paper>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* Tab: Facturas */}
          {activeTab === 3 && (
            <Box>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                {t('cd.invoicesTab.title')}
              </Typography>
              
              <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell><strong>{t('cd.invoicesTab.folio')}</strong></TableCell>
                      <TableCell><strong>{t('cd.invoicesTab.date')}</strong></TableCell>
                      <TableCell align="right"><strong>{t('cd.invoicesTab.total')}</strong></TableCell>
                      <TableCell><strong>{t('cd.invoicesTab.status')}</strong></TableCell>
                      <TableCell align="center"><strong>{t('cd.invoicesTab.download')}</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {invoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                          <ReceiptIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                          <Typography color="text.secondary">{t('cd.invoicesTab.noInvoices')}</Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      invoices.map((inv) => (
                        <TableRow key={inv.id} hover>
                          <TableCell>
                            <Typography fontFamily="monospace" fontWeight="bold">{inv.folio}</Typography>
                          </TableCell>
                          <TableCell>{new Date(inv.fecha).toLocaleDateString('es-MX')}</TableCell>
                          <TableCell align="right">
                            <Typography fontWeight="bold">{formatCurrency(inv.total)}</Typography>
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={inv.status === 'pagada' ? t('cd.invoicesTab.paid') : t('cd.invoicesTab.pending')} 
                              color={inv.status === 'pagada' ? 'success' : 'warning'}
                              size="small"
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                              <Tooltip title={t('cd.invoicesTab.downloadPdf')}>
                                <IconButton size="small" color="error">
                                  <DownloadIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title={t('cd.invoicesTab.downloadXml')}>
                                <IconButton size="small" color="primary">
                                  <DownloadIcon fontSize="small" />
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
            </Box>
          )}

          {/* Tab: Direcciones de Envío (Bodegas) */}
          {activeTab === 4 && (
            <Box id="shipping-addresses-section">
              <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ mb: 1 }}>
                📦 {t('cd.account.warehouseTitle')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {t('cd.account.warehouseSubtitle')} <strong>{boxId}</strong>
              </Typography>
              
              <Grid container spacing={2}>
                {serviceAddresses.map((service) => (
                  <Grid size={{ xs: 12, md: 6 }} key={service.serviceType}>
                    <Paper 
                      sx={{ 
                        p: 2.5, 
                        background: '#fff', 
                        border: '1px solid #e0e0e0',
                        borderRadius: 2,
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                        '&:hover': {
                          borderColor: ORANGE,
                          boxShadow: '0 4px 12px rgba(240,90,40,0.15)',
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                        <Box>
                          <Typography variant="subtitle1" fontWeight="bold" sx={{ color: '#333' }}>
                            {service.serviceName}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#666' }}>
                            {service.addresses[0]?.alias}
                          </Typography>
                        </Box>
                        <Tooltip title={t('cd.account.howToShip')}>
                          <IconButton 
                            size="small" 
                            sx={{ color: ORANGE, bgcolor: '#fff3e0', '&:hover': { bgcolor: '#ffe0b2' } }}
                            onClick={() => handleOpenTutorial(service.serviceType)}
                          >
                            <HelpIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                      
                      <Box sx={{ bgcolor: '#f5f5f5', borderRadius: 2, p: 1.5, mb: 2, flex: 1, border: '1px solid #e0e0e0' }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.6, color: '#333' }}>
                          {service.addresses[0] && renderFormattedAddress(service.addresses[0], service.serviceType)}
                        </Typography>
                      </Box>
                      
                      <Button 
                        startIcon={<CopyIcon />} 
                        variant="contained" 
                        size="small"
                        fullWidth
                        sx={{ 
                          bgcolor: ORANGE, 
                          color: 'white', 
                          '&:hover': { bgcolor: '#d94d1f' } 
                        }}
                        onClick={() => service.addresses[0] && copyToClipboard(formatAddressForCopy(service.addresses[0], service.serviceType))}
                      >
                        {t('cd.warehouse.copy')}
                      </Button>
                    </Paper>
                  </Grid>
                ))}
                
                {serviceAddresses.length === 0 && (
                  <Grid size={12}>
                    <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50', borderRadius: 2 }}>
                      <CircularProgress size={24} sx={{ mb: 2 }} />
                      <Typography color="text.secondary">{t('cd.account.loadingAddresses')}</Typography>
                    </Paper>
                  </Grid>
                )}
              </Grid>

              {/* Nota importante */}
              <Alert severity="info" sx={{ mt: 3, borderRadius: 2 }}>
                <Typography variant="body2">
                  <strong>{t('cd.account.suiteReminder', { boxId })}</strong>
                </Typography>
              </Alert>
            </Box>
          )}

          {/* Tab: Sin Instrucciones */}
          {activeTab === 5 && (
            <Box>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                ❌ {t('cd.noInstructions.title')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {t('cd.noInstructions.subtitle')}
              </Typography>

              {/* Selector de servicio obligatorio - Diseño Corporativo */}
              {serviceFilter === 'all' ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <InventoryIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Selecciona un servicio
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Primero selecciona un tipo de servicio para filtrar
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <Box 
                      onClick={() => setServiceFilter('china_air')}
                      sx={{ 
                        display: 'flex', flexDirection: 'column', alignItems: 'center', 
                        cursor: 'pointer', p: 1.5, borderRadius: 2, bgcolor: 'white',
                        border: '1px solid #e0e0e0', transition: 'all 0.2s',
                        '&:hover': { borderColor: ORANGE, bgcolor: '#FFF8F5' },
                        minWidth: 70, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                    >
                      <FlightIcon sx={{ fontSize: 28, color: '#666', mb: 0.5 }} />
                      <Typography variant="caption" sx={{ color: '#666', fontWeight: 600, fontSize: '0.7rem' }}>Aéreo</Typography>
                    </Box>
                    <Box 
                      onClick={() => setServiceFilter('china_sea')}
                      sx={{ 
                        display: 'flex', flexDirection: 'column', alignItems: 'center', 
                        cursor: 'pointer', p: 1.5, borderRadius: 2, bgcolor: 'white',
                        border: '1px solid #e0e0e0', transition: 'all 0.2s',
                        '&:hover': { borderColor: ORANGE, bgcolor: '#FFF8F5' },
                        minWidth: 70, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                    >
                      <BoatIcon sx={{ fontSize: 28, color: '#666', mb: 0.5 }} />
                      <Typography variant="caption" sx={{ color: '#666', fontWeight: 600, fontSize: '0.7rem' }}>Marítimo</Typography>
                    </Box>
                    <Box 
                      onClick={() => setServiceFilter('dhl')}
                      sx={{ 
                        display: 'flex', flexDirection: 'column', alignItems: 'center', 
                        cursor: 'pointer', p: 1.5, borderRadius: 2, bgcolor: 'white',
                        border: '1px solid #e0e0e0', transition: 'all 0.2s',
                        '&:hover': { borderColor: ORANGE, bgcolor: '#FFF8F5' },
                        minWidth: 70, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                    >
                      <TruckIcon sx={{ fontSize: 28, color: '#666', mb: 0.5 }} />
                      <Typography variant="caption" sx={{ color: '#666', fontWeight: 600, fontSize: '0.7rem' }}>MTY</Typography>
                    </Box>
                    <Box 
                      onClick={() => setServiceFilter('usa_pobox')}
                      sx={{ 
                        display: 'flex', flexDirection: 'column', alignItems: 'center', 
                        cursor: 'pointer', p: 1.5, borderRadius: 2, bgcolor: 'white',
                        border: '1px solid #e0e0e0', transition: 'all 0.2s',
                        '&:hover': { borderColor: ORANGE, bgcolor: '#FFF8F5' },
                        minWidth: 70, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                    >
                      <PostOfficeIcon sx={{ fontSize: 28, color: '#666', mb: 0.5 }} />
                      <Typography variant="caption" sx={{ color: '#666', fontWeight: 600, fontSize: '0.7rem' }}>PO Box</Typography>
                    </Box>
                  </Box>
                </Box>
              ) : (
                <>
                  {/* Chip del servicio seleccionado */}
                  <Box sx={{ mb: 2 }}>
                    <Chip 
                      label={serviceFilter === 'china_air' ? '✈️ Aéreo' : serviceFilter === 'china_sea' ? '🚢 Marítimo' : serviceFilter === 'dhl' ? '🚚 MTY' : '📮 PO Box'}
                      onDelete={() => setServiceFilter('all')}
                      color="warning"
                      sx={{ fontWeight: 600, bgcolor: ORANGE, color: 'white' }}
                    />
                  </Box>
                  {getFilteredPackages().filter(p => !p.has_delivery_instructions && !p.delivery_address_id && !p.assigned_address_id && (!p.destination_address || p.destination_address === 'Pendiente de asignar') && p.status !== 'delivered').length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                      <CheckCircleIcon sx={{ fontSize: 64, color: GREEN, mb: 2 }} />
                      <Typography color="text.secondary">{t('cd.instructions.allAssigned')}</Typography>
                    </Box>
                  ) : (
                    getFilteredPackages().filter(p => !p.has_delivery_instructions && !p.delivery_address_id && !p.assigned_address_id && (!p.destination_address || p.destination_address === 'Pendiente de asignar') && p.status !== 'delivered').map((pkg) => (
                      <Card key={pkg.id} sx={{ mb: 2, border: `2px solid ${ORANGE}`, borderRadius: 3, overflow: 'hidden' }}>
                        <CardContent sx={{ p: 2 }}>
                          {/* Header con tracking y status */}
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Checkbox
                                size="small"
                                checked={selectedPackageIds.includes(pkg.id)}
                                onChange={() => togglePackageSelection(pkg.id, pkg)}
                              />
                              <Box>
                                <Typography variant="body1" fontWeight="bold">{pkg.tracking}</Typography>
                                <Typography variant="body2" color="text.secondary">{pkg.descripcion}</Typography>
                              </Box>
                            </Box>
                            <Chip 
                              label={pkg.status_label} 
                              size="small" 
                              sx={{ 
                                bgcolor: pkg.status === 'ready_pickup' ? ORANGE : pkg.status === 'in_transit' ? BLUE : ORANGE,
                                color: 'white',
                                fontWeight: 600,
                              }} 
                            />
                          </Box>

                          {/* Stepper de estados */}
                          <Box sx={{ mt: 2, mb: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              {statusSteps.map((label, idx) => {
                                const activeIdx = getStatusStep(pkg.status);
                                const isCompleted = idx < activeIdx;
                                const isActive = idx === activeIdx;
                                return (
                                  <Box key={label} sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                    <Box sx={{ 
                                      width: 24, height: 24, borderRadius: '50%', 
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      bgcolor: isCompleted ? ORANGE : isActive ? ORANGE : 'grey.300',
                                      color: 'white', fontSize: '0.7rem', fontWeight: 'bold',
                                      border: isActive ? `2px solid ${ORANGE}` : 'none',
                                    }}>
                                      {isCompleted ? '✓' : idx + 1}
                                    </Box>
                                    {idx < statusSteps.length - 1 && (
                                      <Box sx={{ flex: 1, height: 3, bgcolor: isCompleted ? ORANGE : 'grey.300', mx: 0.25, borderRadius: 1 }} />
                                    )}
                                  </Box>
                                );
                              })}
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                              {statusSteps.map((label) => (
                                <Typography key={label} variant="caption" sx={{ fontSize: '0.55rem', textAlign: 'center', flex: 1, color: 'text.secondary' }}>
                                  {label}
                                </Typography>
                              ))}
                            </Box>
                          </Box>

                          {/* ETA */}
                          <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid #eee' }}>
                            <Typography variant="caption" color="text.secondary">
                              ⏱ ETA: {pkg.fecha_estimada || t('cd.packages.etaPending')}
                            </Typography>
                          </Box>

                          {/* Footer con botón y garantía */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                            {/* Botón Asignar */}
                            <Button 
                              variant="contained" 
                              fullWidth
                              startIcon={<LocationOnIcon />}
                              sx={{ bgcolor: ORANGE, borderRadius: 2 }}
                              onClick={() => {
                                setSelectedPackageIds([pkg.id]);
                                setDeliveryModalOpen(true);
                              }}
                            >
                              {t('cd.noInstructions.assignAddress')}
                            </Button>

                            {/* Chip de Garantía */}
                            {pkg.has_gex ? (
                              <Chip
                                icon={<SecurityIcon />}
                                label={t('cd.gex.protectedChip')}
                                size="small"
                                sx={{
                                  bgcolor: ORANGE,
                                  color: 'white',
                                  height: 20,
                                  fontSize: '0.65rem',
                                  '& .MuiChip-icon': {
                                    fontSize: 14,
                                    color: 'white'
                                  }
                                }}
                              />
                            ) : (
                              <Chip
                                icon={
                                  <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16 }}>
                                    <SecurityIcon sx={{ fontSize: 14, color: 'white' }} />
                                    <Box sx={{ position: 'absolute', width: '120%', height: 2, bgcolor: 'white', transform: 'rotate(-45deg)', borderRadius: 1 }} />
                                  </Box>
                                }
                                label={t('cd.gex.noGexChip')}
                                size="small"
                                sx={{
                                  bgcolor: '#D32F2F',
                                  color: 'white',
                                  height: 20,
                                  fontSize: '0.65rem',
                                  cursor: 'pointer',
                                  '&:hover': { bgcolor: '#C62828' }
                                }}
                                onClick={() => {
                                  setSelectedPackageIds([pkg.id]);
                                  setGexTargetPackages([pkg]);
                                  setGexValorFactura(''); setGexDescripcion(''); setGexQuote(null);
                                  setGexModalOpen(true);
                                }}
                              />
                            )}
                          </Box>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </>
              )}
            </Box>
          )}

          {/* Tab: Con Instrucciones */}
          {activeTab === 6 && (
            <Box>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                ✅ {t('cd.withInstructionsTab.title')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {t('cd.withInstructionsTab.subtitle')}
              </Typography>

              {/* Selector de servicio obligatorio */}
              {serviceFilter === 'all' ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <InventoryIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Selecciona un servicio
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Primero selecciona un tipo de servicio para filtrar
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <Box 
                      onClick={() => setServiceFilter('china_air')}
                      sx={{ 
                        display: 'flex', flexDirection: 'column', alignItems: 'center', 
                        cursor: 'pointer', p: 2, borderRadius: 3, bgcolor: '#f5f5f5',
                        border: '2px solid #e0e0e0', transition: 'all 0.2s',
                        '&:hover': { bgcolor: '#eeeeee', borderColor: ORANGE, transform: 'scale(1.02)' },
                        minWidth: 80,
                      }}
                    >
                      <FlightIcon sx={{ fontSize: 32, color: BLUE, mb: 0.5 }} />
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.75rem' }}>{t('cd.serviceFilter.air')}</Typography>
                    </Box>
                    <Box 
                      onClick={() => setServiceFilter('china_sea')}
                      sx={{ 
                        display: 'flex', flexDirection: 'column', alignItems: 'center', 
                        cursor: 'pointer', p: 2, borderRadius: 3, bgcolor: '#f5f5f5',
                        border: '2px solid #e0e0e0', transition: 'all 0.2s',
                        '&:hover': { bgcolor: '#eeeeee', borderColor: ORANGE, transform: 'scale(1.02)' },
                        minWidth: 80,
                      }}
                    >
                      <BoatIcon sx={{ fontSize: 32, color: '#00796B', mb: 0.5 }} />
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.75rem' }}>{t('cd.serviceFilter.sea')}</Typography>
                    </Box>
                    <Box 
                      onClick={() => setServiceFilter('dhl')}
                      sx={{ 
                        display: 'flex', flexDirection: 'column', alignItems: 'center', 
                        cursor: 'pointer', p: 2, borderRadius: 3, bgcolor: '#f5f5f5',
                        border: '2px solid #e0e0e0', transition: 'all 0.2s',
                        '&:hover': { bgcolor: '#eeeeee', borderColor: ORANGE, transform: 'scale(1.02)' },
                        minWidth: 80,
                      }}
                    >
                      <TruckIcon sx={{ fontSize: 32, color: ORANGE, mb: 0.5 }} />
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.75rem' }}>{t('cd.serviceFilter.mty')}</Typography>
                    </Box>
                    <Box 
                      onClick={() => setServiceFilter('usa_pobox')}
                      sx={{ 
                        display: 'flex', flexDirection: 'column', alignItems: 'center', 
                        cursor: 'pointer', p: 2, borderRadius: 3, bgcolor: '#f5f5f5',
                        border: '2px solid #e0e0e0', transition: 'all 0.2s',
                        '&:hover': { bgcolor: '#eeeeee', borderColor: ORANGE, transform: 'scale(1.02)' },
                        minWidth: 80,
                      }}
                    >
                      <PostOfficeIcon sx={{ fontSize: 32, color: '#E91E63', mb: 0.5 }} />
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.75rem' }}>{t('cd.serviceFilter.pobox')}</Typography>
                    </Box>
                  </Box>
                </Box>
              ) : (
                <>
                  {/* Chip del servicio seleccionado */}
                  <Box sx={{ mb: 2 }}>
                    <Chip 
                      label={serviceFilter === 'china_air' ? '✈️ Aéreo' : serviceFilter === 'china_sea' ? '🚢 Marítimo' : serviceFilter === 'dhl' ? '🚚 MTY' : '📮 PO Box'}
                      onDelete={() => setServiceFilter('all')}
                      color="warning"
                      sx={{ fontWeight: 600, bgcolor: ORANGE, color: 'white' }}
                    />
                  </Box>
                  {getFilteredPackages().filter(p => (p.has_delivery_instructions || p.delivery_address_id || p.assigned_address_id || (p.destination_address && p.destination_address !== 'Pendiente de asignar' && p.destination_contact)) && p.status !== 'delivered').length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                      <WarningIcon sx={{ fontSize: 64, color: ORANGE, mb: 2 }} />
                      <Typography color="text.secondary">{t('cd.withInstructionsTab.noPackages')}</Typography>
                    </Box>
                  ) : (
                    getFilteredPackages().filter(p => (p.has_delivery_instructions || p.delivery_address_id || p.assigned_address_id || (p.destination_address && p.destination_address !== 'Pendiente de asignar' && p.destination_contact)) && p.status !== 'delivered').map((pkg) => (
                      <Card key={pkg.id} sx={{ mb: 2, border: `2px solid ${ORANGE}`, borderRadius: 3, overflow: 'hidden' }}>
                        <CardContent sx={{ p: 2 }}>
                          {/* Header con tracking, checkbox y status */}
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Checkbox
                                size="small"
                                checked={selectedPackageIds.includes(pkg.id)}
                                onChange={() => togglePackageSelection(pkg.id, pkg)}
                              />
                              <Box>
                                <Typography variant="body1" fontWeight="bold">{pkg.tracking}</Typography>
                                <Typography variant="body2" color="text.secondary">{pkg.descripcion}</Typography>
                              </Box>
                            </Box>
                            <Chip 
                              label={pkg.status_label} 
                              size="small" 
                              sx={{ 
                                bgcolor: pkg.status === 'ready_pickup' ? ORANGE : pkg.status === 'in_transit' ? BLUE : ORANGE,
                                color: 'white',
                                fontWeight: 600,
                              }} 
                            />
                          </Box>

                          {/* Stepper de estados */}
                          <Box sx={{ mt: 2, mb: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              {statusSteps.map((label, idx) => {
                                const activeIdx = getStatusStep(pkg.status);
                                const isCompleted = idx < activeIdx;
                                const isActive = idx === activeIdx;
                                return (
                                  <Box key={label} sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                    <Box sx={{ 
                                      width: 24, height: 24, borderRadius: '50%', 
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      bgcolor: isCompleted ? ORANGE : isActive ? ORANGE : 'grey.300',
                                      color: 'white', fontSize: '0.7rem', fontWeight: 'bold',
                                      border: isActive ? `2px solid ${ORANGE}` : 'none',
                                    }}>
                                      {isCompleted ? '✓' : idx + 1}
                                    </Box>
                                    {idx < statusSteps.length - 1 && (
                                      <Box sx={{ flex: 1, height: 3, bgcolor: isCompleted ? ORANGE : 'grey.300', mx: 0.25, borderRadius: 1 }} />
                                    )}
                                  </Box>
                                );
                              })}
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                              {statusSteps.map((label) => (
                                <Typography key={label} variant="caption" sx={{ fontSize: '0.55rem', textAlign: 'center', flex: 1, color: 'text.secondary' }}>
                                  {label}
                                </Typography>
                              ))}
                            </Box>
                          </Box>

                          {/* ETA */}
                          <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid #eee' }}>
                            <Typography variant="caption" color="text.secondary">
                              ⏱ ETA: {pkg.fecha_estimada || t('cd.packages.etaPending')}
                            </Typography>
                          </Box>

                          {/* Footer con indicadores y botón */}
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5 }}>
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              <Chip 
                                icon={<LocationOnIcon />} 
                                label={t('cd.withInstructionsTab.deliveryAssigned')} 
                                size="small" 
                                sx={{ bgcolor: ORANGE, color: 'white', fontWeight: 600 }}
                              />
                              {/* Chip de Garantía */}
                              {pkg.has_gex ? (
                                <Chip
                                  icon={<SecurityIcon />}
                                  label={t('cd.gex.protectedChip')}
                                  size="small"
                                  sx={{
                                    bgcolor: ORANGE,
                                    color: 'white',
                                    height: 20,
                                    fontSize: '0.65rem',
                                    '& .MuiChip-icon': {
                                      fontSize: 14,
                                      color: 'white'
                                    }
                                  }}
                                />
                              ) : (
                                <Chip
                                  icon={
                                    <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16 }}>
                                      <SecurityIcon sx={{ fontSize: 14, color: 'white' }} />
                                      <Box sx={{ position: 'absolute', width: '120%', height: 2, bgcolor: 'white', transform: 'rotate(-45deg)', borderRadius: 1 }} />
                                    </Box>
                                  }
                                  label={t('cd.gex.noGexChip')}
                                  size="small"
                                  sx={{
                                    bgcolor: '#D32F2F',
                                    color: 'white',
                                    height: 20,
                                    fontSize: '0.65rem',
                                    cursor: 'pointer',
                                    '&:hover': { bgcolor: '#C62828' }
                                  }}
                                  onClick={() => {
                                    setSelectedPackageIds([pkg.id]);
                                    setGexTargetPackages([pkg]);
                                    setGexValorFactura(''); setGexDescripcion(''); setGexQuote(null);
                                    setGexModalOpen(true);
                                  }}
                                />
                              )}
                            </Box>
                            <Button 
                              variant="outlined"
                              size="small"
                              startIcon={<EditIcon />}
                              onClick={() => {
                                setSelectedPackageIds([pkg.id]);
                                setDeliveryModalOpen(true);
                              }}
                            >
                              {t('common.edit')}
                            </Button>
                          </Box>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </>
              )}
            </Box>
          )}

        </Box>
      </Paper>

      {/* Modal de Tutorial de Envío */}
      <Dialog 
        open={tutorialOpen} 
        onClose={() => setTutorialOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ 
          background: ORANGE, 
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LocationOnIcon />
            <span>{t('cd.tutorial.title')} - {tutorialService?.name}</span>
          </Box>
          <IconButton size="small" onClick={() => setTutorialOpen(false)} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          {tutorialService && (() => {
            // Buscar la dirección para este servicio
            const serviceAddr = serviceAddresses.find(s => s.serviceType === tutorialService.type);
            const address = serviceAddr?.addresses?.[0];
            
            return (
              <Box>
                {/* Dirección Principal */}
                {address ? (
                  <Paper 
                    elevation={0} 
                    sx={{ 
                      p: 2.5, 
                      mb: 2, 
                      background: ORANGE,
                      color: 'white',
                      borderRadius: 2,
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ opacity: 0.9, mb: 1 }}>
                      {t('cd.tutorial.sendToAddress')}
                    </Typography>
                    <Typography variant="body1" sx={{ fontFamily: 'monospace', lineHeight: 1.8 }}>
                      {renderFormattedAddress(address, tutorialService.type)}
                    </Typography>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<CopyIcon />}
                      sx={{ 
                        mt: 2, 
                        bgcolor: 'rgba(255,255,255,0.25)', 
                        color: 'white',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.4)' }
                      }}
                      onClick={() => {
                        navigator.clipboard.writeText(formatAddressForCopy(address, tutorialService.type));
                        setSnackbar({ open: true, message: t('cd.tutorial.addressCopied'), severity: 'success' });
                      }}
                    >
                      {t('cd.tutorial.copyAddress')}
                    </Button>
                  </Paper>
                ) : (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    {t('cd.tutorial.noAddress')}
                  </Alert>
                )}

                <Alert severity="info" sx={{ mb: 2 }}>
                  <strong>{t('cd.tutorial.estimatedTime')}</strong> {tutorialService.timeframe}
                </Alert>
                
                <Divider sx={{ my: 2 }} />

                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  {t('cd.tutorial.shippingInstructions')}
                </Typography>
                <Typography variant="body2" paragraph sx={{ color: 'text.secondary' }}>
                  {tutorialService.tutorial}
                </Typography>

                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  ✅ {t('cd.tutorial.stepsToFollow')}
                </Typography>
                <List dense>
                  {tutorialService.type === 'usa_pobox' && (
                    <>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary={t('cd.tutorial.pobox.step1')} /></ListItem>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary={t('cd.tutorial.pobox.step2')} /></ListItem>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary={t('cd.tutorial.pobox.step3')} /></ListItem>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary={t('cd.tutorial.pobox.step4')} /></ListItem>
                    </>
                  )}
                  {(tutorialService.type === 'china_air' || tutorialService.type === 'china_sea') && (
                    <>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary={t('cd.tutorial.china.step1', { boxId })} /></ListItem>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary={t('cd.tutorial.china.step2')} /></ListItem>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary={t('cd.tutorial.china.step3')} /></ListItem>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary={t('cd.tutorial.china.step4')} /></ListItem>
                    </>
                  )}
                  {tutorialService.type === 'mx_cedis' && (
                    <>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary={t('cd.tutorial.mty.step1')} /></ListItem>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary={t('cd.tutorial.mty.step2', { userName, boxId })} /></ListItem>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary={t('cd.tutorial.mty.step3')} /></ListItem>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary={t('cd.tutorial.mty.step4')} /></ListItem>
                    </>
                  )}
                </List>

                <Alert severity="warning" sx={{ mt: 2 }}>
                  <strong>{t('cd.tutorial.important')}</strong> {t('cd.tutorial.alwaysIncludeSuite', { boxId })}
                </Alert>
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTutorialOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      {/* Modal GEX (Garantía Extendida) */}
      <Dialog open={gexModalOpen} onClose={() => setGexModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: ORANGE, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <SecurityIcon />
          {t('cd.gex.title')}
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {(() => {
            // Obtener nombre del usuario para mostrar en el seguro
            const userName = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!).name || 'NOMBRE DEL CLIENTE' : 'NOMBRE DEL CLIENTE';
            
            return (
              <>
                {/* Sección de Datos del Seguro */}
                <Box sx={{ p: 2.5, bgcolor: '#f8f9fa' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <SecurityIcon sx={{ color: ORANGE }} />
                    <Typography variant="subtitle1" fontWeight="bold" sx={{ color: ORANGE }}>
                      {t('cd.gex.insuranceData')}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {t('cd.gex.completeInfo')}
                  </Typography>

                  {/* Nombre del Cliente */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary">{t('cd.gex.clientName')}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1, bgcolor: 'white' }}>
                      <PersonIcon sx={{ color: '#666', fontSize: 20 }} />
                      <Typography variant="body1" fontWeight="bold">{userName.toUpperCase()}</Typography>
                    </Box>
                  </Box>

                  {/* Valor de Factura */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary">{t('cd.gex.invoiceValue')}</Typography>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      placeholder="123"
                      value={gexValorFactura}
                      onChange={(e) => {
                        setGexValorFactura(e.target.value);
                        const val = parseFloat(e.target.value);
                        if (val > 0) fetchGexQuote(val);
                        else setGexQuote(null);
                      }}
                      sx={{ mt: 0.5 }}
                      slotProps={{
                        input: {
                          startAdornment: <InputAdornment position="start">$</InputAdornment>,
                          endAdornment: <InputAdornment position="end" sx={{ color: ORANGE, fontWeight: 600 }}>USD</InputAdornment>,
                        }
                      }}
                    />
                  </Box>

                  {/* Alert informativo */}
                  <Alert 
                    severity="warning" 
                    sx={{ mb: 2.5, bgcolor: '#fff3e0', border: `1px solid ${ORANGE}` }}
                    icon={<WarningIcon />}
                  >
                    {t('cd.gex.claimAlert')}
                  </Alert>

                  {/* No. Cajas y Peso Total */}
                  <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary">{t('cd.gex.numBoxes')}</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1, bgcolor: 'white' }}>
                        <InventoryIcon sx={{ color: '#666', fontSize: 20 }} />
                        <Typography variant="body1" fontWeight="bold">
                          {gexTargetPackages.reduce((sum, pkg) => sum + (Number(pkg.total_boxes) || 1), 0)}
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary">{t('cd.gex.totalWeight')}</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1, bgcolor: 'white' }}>
                        <ScaleIcon sx={{ color: '#666', fontSize: 20 }} />
                        <Typography variant="body1" fontWeight="bold">
                          {gexTargetPackages.reduce((sum, pkg) => sum + (Number(pkg.weight) || 0), 0).toFixed(1)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">kg</Typography>
                      </Box>
                    </Grid>
                  </Grid>

                  {/* Ruta de Envío */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary">{t('cd.gex.shippingRoute')}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1, bgcolor: 'white' }}>
                      {(() => {
                        const firstPkg = gexTargetPackages[0];
                        const isChina = firstPkg?.servicio === 'SEA_CHN_MX' || firstPkg?.servicio === 'AIR_CHN_MX' || firstPkg?.shipment_type === 'maritime' || firstPkg?.shipment_type === 'china_air';
                        const isMaritime = firstPkg?.servicio === 'SEA_CHN_MX' || firstPkg?.shipment_type === 'maritime';
                        return (
                          <>
                            {isMaritime ? (
                              <BoatIcon sx={{ color: '#666', fontSize: 20 }} />
                            ) : (
                              <FlightIcon sx={{ color: '#666', fontSize: 20 }} />
                            )}
                            <Typography variant="body1">
                              {isChina ? '🇨🇳 China → México 🇲🇽' : '🇺🇸 USA → México 🇲🇽'}
                            </Typography>
                          </>
                        );
                      })()}
                      <LockIcon sx={{ color: '#666', fontSize: 16, ml: 'auto' }} />
                    </Box>
                  </Box>

                  {/* Descripción de la Carga */}
                  <Box sx={{ mb: 0 }}>
                    <Typography variant="caption" color="text.secondary">{t('cd.gex.cargoDescription')} *</Typography>
                    <TextField
                      fullWidth
                      size="small"
                      required
                      error={gexDescripcion.trim() === ''}
                      helperText={gexDescripcion.trim() === '' ? 'Describe el contenido de tu carga (obligatorio)' : ''}
                      placeholder={t('cd.gex.cargoPlaceholder')}
                      value={gexDescripcion}
                      onChange={(e) => setGexDescripcion(e.target.value)}
                      sx={{ mt: 0.5 }}
                    />
                  </Box>
                </Box>

                {/* Sección de Costos - Fondo naranja corporativo */}
                <Box sx={{ bgcolor: ORANGE, p: 2.5, color: 'white' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <ReceiptIcon sx={{ fontSize: 20 }} />
                    <Typography variant="subtitle1" fontWeight="bold">Costo de tu Póliza GEX</Typography>
                  </Box>

                  {(() => {
                    const valorFacturaUSD = parseFloat(gexValorFactura) || 0;
                    
                    if (gexQuoteLoading) {
                      return (
                        <Box sx={{ textAlign: 'center', py: 3 }}>
                          <CircularProgress size={30} sx={{ color: 'white' }} />
                          <Typography variant="body2" sx={{ mt: 1, opacity: 0.8 }}>Calculando...</Typography>
                        </Box>
                      );
                    }
                    
                    if (!gexQuote || valorFacturaUSD <= 0) {
                      return (
                        <Box sx={{ textAlign: 'center', py: 3 }}>
                          <Typography variant="body2" sx={{ opacity: 0.8 }}>Ingresa el valor de factura para ver el costo</Typography>
                        </Box>
                      );
                    }

                    return (
                      <>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2">Valor Factura:</Typography>
                          <Typography variant="body2" fontWeight="600">${valorFacturaUSD.toFixed(2)} USD</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2">Tipo de Cambio:</Typography>
                          <Typography variant="body2" fontWeight="600">${gexQuote.exchangeRate.toFixed(2)} MXN</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                          <Typography variant="body2">Valor Asegurado:</Typography>
                          <Typography variant="body2" fontWeight="600">${gexQuote.insuredValueMxn.toFixed(2)} MXN</Typography>
                        </Box>

                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.3)', my: 1.5 }} />

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2">Seguro (5%):</Typography>
                          <Typography variant="body2" fontWeight="600">${gexQuote.variableFeeMxn.toFixed(2)} MXN</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                          <Typography variant="body2">Cuota fija:</Typography>
                          <Typography variant="body2" fontWeight="600">${gexQuote.fixedFeeMxn.toFixed(2)} MXN</Typography>
                        </Box>

                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.3)', my: 1.5 }} />

                        <Box sx={{ textAlign: 'center', mt: 2 }}>
                          <Typography variant="h4" fontWeight="bold">
                            ${gexQuote.totalCostMxn.toFixed(2)} MXN
                          </Typography>
                          <Typography variant="caption" sx={{ opacity: 0.8 }}>
                            Costo total de tu póliza GEX
                          </Typography>
                        </Box>
                      </>
                    );
                  })()}
                </Box>
              </>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#f5f5f5', justifyContent: 'center' }}>
          <Button onClick={() => setGexModalOpen(false)} sx={{ color: 'text.secondary', mr: 2 }}>{t('common.cancel')}</Button>
          <Button 
            variant="contained" 
            onClick={handleContractGEX}
            disabled={gexLoading || !gexValorFactura || !gexDescripcion.trim() || !gexQuote || gexQuoteLoading}
            startIcon={gexLoading ? <CircularProgress size={20} /> : <SecurityIcon />}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d94d1f' }, px: 4 }}
          >
            {gexLoading ? t('common.processing') : t('cd.gex.contractButton')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal Instrucciones de Entrega - Versión Completa */}
      <Dialog open={deliveryModalOpen} onClose={() => { setDeliveryModalOpen(false); setApplyToFullShipment(false); }} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: ORANGE, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <LocationOnIcon />
          {t('cd.delivery.title')}
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Grid container spacing={3}>
            {/* Columna Izquierda - Paquetes y Dirección */}
            <Grid size={{ xs: 12, md: 6 }}>
              {/* Paquetes Seleccionados */}
              <Paper sx={{ p: 2, mb: 3, bgcolor: '#f8f9fa' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Box 
                    sx={{ 
                      bgcolor: ORANGE, 
                      color: 'white', 
                      width: 24, 
                      height: 24, 
                      borderRadius: '50%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      fontSize: '0.8rem',
                      mr: 1
                    }}
                  >
                    {selectedPackageIds.length}
                  </Box>
                  <Typography variant="subtitle1" fontWeight="bold">
                    {t('cd.delivery.selectedPackages', { count: selectedPackageIds.length })}
                  </Typography>
                </Box>
                
                {getSelectedPackages().map((pkg) => (
                  <Box key={pkg.id} sx={{ mb: 2, pb: 2, borderBottom: '1px solid #eee' }}>
                    <Typography variant="body1" fontWeight="bold" sx={{ mb: 0.5 }}>
                      {pkg.tracking}
                    </Typography>
                    {pkg.dimensions && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        📦 {pkg.dimensions}
                      </Typography>
                    )}
                    {(pkg.total_boxes && pkg.total_boxes > 1) && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        📦 {pkg.total_boxes} {t('cd.delivery.boxes')}
                      </Typography>
                    )}
                    {(pkg.weight || pkg.cbm) && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {pkg.weight && (
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Peso Total
                            </Typography>
                            <Typography variant="body2" fontWeight="bold">{Number(pkg.weight).toFixed(2)} kg</Typography>
                          </Box>
                        )}
                        {pkg.cbm && (
                          <Box sx={{ textAlign: 'right' }}>
                            <Typography variant="caption" color="text.secondary">
                              CBM Total
                            </Typography>
                            <Typography variant="body2" fontWeight="bold">{Number(pkg.cbm).toFixed(4)} m³</Typography>
                          </Box>
                        )}
                      </Box>
                    )}

                    {/* Botón para desglosar cajas */}
                    {((pkg.included_guides && pkg.included_guides.length > 0) || (pkg.total_boxes && pkg.total_boxes > 1)) && (
                      <Box sx={{ mt: 1 }}>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => setBoxBreakdownOpen(prev => ({ ...prev, [pkg.id]: !prev[pkg.id] }))}
                          endIcon={boxBreakdownOpen[pkg.id] ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                          sx={{ fontSize: '0.75rem', textTransform: 'none', color: ORANGE, p: 0 }}
                        >
                          📋 Ver desglose de {pkg.included_guides?.length || pkg.total_boxes} cajas
                        </Button>
                        <Collapse in={boxBreakdownOpen[pkg.id]} timeout="auto">
                          <Box sx={{ mt: 1, bgcolor: 'white', borderRadius: 1, border: '1px solid #e0e0e0', overflow: 'hidden' }}>
                            <Box sx={{ display: 'grid', gridTemplateColumns: '50px 1fr 1fr 1fr', bgcolor: '#f5f5f5', px: 1, py: 0.5 }}>
                              <Typography variant="caption" fontWeight="bold">#</Typography>
                              <Typography variant="caption" fontWeight="bold">Peso</Typography>
                              <Typography variant="caption" fontWeight="bold">Medidas</Typography>
                              <Typography variant="caption" fontWeight="bold">CBM</Typography>
                            </Box>
                            {pkg.included_guides && pkg.included_guides.length > 0 ? (
                              pkg.included_guides.map((guide, idx) => (
                                <Box 
                                  key={guide.id} 
                                  sx={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: '50px 1fr 1fr 1fr', 
                                    px: 1, 
                                    py: 0.5,
                                    borderTop: '1px solid #f0f0f0',
                                    bgcolor: idx % 2 === 0 ? 'white' : '#fafafa',
                                  }}
                                >
                                  <Typography variant="caption" color="text.secondary">
                                    {guide.box_number || idx + 1}
                                  </Typography>
                                  <Typography variant="caption">
                                    {guide.weight ? `${Number(guide.weight).toFixed(2)} kg` : '—'}
                                  </Typography>
                                  <Typography variant="caption">
                                    {guide.dimensions || '—'}
                                  </Typography>
                                  <Typography variant="caption">
                                    {guide.cbm ? `${Number(guide.cbm).toFixed(4)}` : '—'}
                                  </Typography>
                                </Box>
                              ))
                            ) : (
                              /* Generar filas estimadas cuando no hay guías individuales pero sí total_boxes */
                              Array.from({ length: pkg.total_boxes || 0 }, (_, idx) => {
                                const avgWeight = pkg.weight ? Number(pkg.weight) / (pkg.total_boxes || 1) : null;
                                const avgCbm = pkg.cbm ? Number(pkg.cbm) / (pkg.total_boxes || 1) : null;
                                return (
                                  <Box 
                                    key={idx} 
                                    sx={{ 
                                      display: 'grid', 
                                      gridTemplateColumns: '50px 1fr 1fr 1fr', 
                                      px: 1, 
                                      py: 0.5,
                                      borderTop: '1px solid #f0f0f0',
                                      bgcolor: idx % 2 === 0 ? 'white' : '#fafafa',
                                    }}
                                  >
                                    <Typography variant="caption" color="text.secondary">
                                      {idx + 1}
                                    </Typography>
                                    <Typography variant="caption">
                                      {avgWeight ? `~${avgWeight.toFixed(2)} kg` : '—'}
                                    </Typography>
                                    <Typography variant="caption">
                                      {pkg.dimensions || '—'}
                                    </Typography>
                                    <Typography variant="caption">
                                      {avgCbm ? `~${avgCbm.toFixed(4)}` : '—'}
                                    </Typography>
                                  </Box>
                                );
                              })
                            )}
                          </Box>
                          {!(pkg.included_guides && pkg.included_guides.length > 0) && pkg.total_boxes && pkg.total_boxes > 1 && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', fontStyle: 'italic' }}>
                              * Peso y volumen estimado (promedio por caja)
                            </Typography>
                          )}
                        </Collapse>
                      </Box>
                    )}
                  </Box>
                ))}

                {/* Siempre aplica a todo el embarque (oculto, preseleccionado) */}
              </Paper>

              {/* Dirección de Entrega */}
              <Paper sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <LocationOnIcon sx={{ color: 'error.main', mr: 1 }} />
                  <Typography variant="subtitle1" fontWeight="bold">
                    {t('cd.delivery.deliveryAddress')}
                  </Typography>
                  <Button 
                    size="small" 
                    sx={{ ml: 'auto', color: 'error.main' }}
                    onClick={() => {
                      setDeliveryModalOpen(false);
                      setAddressModalOpen(true);
                    }}
                  >
                    {t('cd.delivery.addNew')}
                  </Button>
                </Box>

                {deliveryAddresses.length === 0 ? (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    {t('cd.delivery.noAddresses')}
                  </Alert>
                ) : (
                  <FormControl component="fieldset" fullWidth>
                    <RadioGroup
                      value={selectedDeliveryAddress || ''}
                      onChange={(e) => {
                        const addrId = Number(e.target.value);
                        setSelectedDeliveryAddress(addrId);
                        // Auto-seleccionar paquetería según carrier_config de la dirección
                        const addr = deliveryAddresses.find(a => a.id === addrId);
                        if (addr?.carrier_config) {
                          // Mapear selectedServiceType a la clave de carrier_config
                          const svcKeyMap: Record<string, string> = {
                            china_air: 'air', china_sea: 'maritime', usa_pobox: 'usa', dhl: 'dhl'
                          };
                          const configKey = svcKeyMap[selectedServiceType] || selectedServiceType;
                          const defaultCarrier = addr.carrier_config[configKey];
                          if (defaultCarrier && carrierServices.some(c => c.id === defaultCarrier)) {
                            setSelectedCarrierService(defaultCarrier);
                          }
                        }
                      }}
                    >
                      {deliveryAddresses.map((addr) => (
                        <FormControlLabel
                          key={addr.id}
                          value={addr.id}
                          control={<Radio color="primary" />}
                          label={
                            <Paper 
                              elevation={selectedDeliveryAddress === addr.id ? 2 : 0}
                              sx={{ 
                                p: 2, 
                                bgcolor: selectedDeliveryAddress === addr.id ? 'primary.50' : 'transparent',
                                border: selectedDeliveryAddress === addr.id ? `2px solid ${ORANGE}` : '1px solid #eee',
                                borderRadius: 2,
                                width: '100%',
                                minHeight: 90,
                              }}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                {selectedDeliveryAddress === addr.id && (
                                  <Box sx={{ color: 'primary.main', mt: 0.5 }}>✓</Box>
                                )}
                                <Box sx={{ flex: 1 }}>
                                  <Typography variant="body1" fontWeight="bold">
                                    {addr.alias}
                                    {addr.is_default && (
                                      <Chip label={t('cd.address.primary')} size="small" sx={{ ml: 1, bgcolor: ORANGE, color: 'white' }} />
                                    )}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    {addr.street} {addr.exterior_number}, {addr.colony}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    {addr.city}, {addr.state} {addr.zip_code}
                                  </Typography>
                                  <Typography variant="body2" sx={{ color: ORANGE, fontWeight: 'bold', mt: 0.5 }}>
                                    📞 {addr.phone}
                                  </Typography>
                                </Box>
                              </Box>
                            </Paper>
                          }
                          sx={{ 
                            m: 0, 
                            mb: 1, 
                            alignItems: 'flex-start',
                            width: '100%',
                            '& .MuiFormControlLabel-label': { width: '100%' },
                          }}
                        />
                      ))}
                    </RadioGroup>
                  </FormControl>
                )}
              </Paper>
            </Grid>

            {/* Columna Derecha - Paquetería y Notas */}
            <Grid size={{ xs: 12, md: 6 }}>
              {/* Paquetería de Entrega */}
              <Paper sx={{ p: 2, mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ fontSize: '1.5rem', mr: 1 }}>🚛</Box>
                  <Typography variant="subtitle1" fontWeight="bold">
                    {t('cd.delivery.carrierService')}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {t('cd.delivery.selectCarrier')}
                </Typography>

                {(() => {
                  const standardCarriers = carrierServices.filter(s => !s.isCollect);
                  const collectCarriers = carrierServices.filter(s => s.isCollect);
                  return (
                <FormControl component="fieldset" fullWidth>
                  <RadioGroup
                    value={selectedCarrierService}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedCarrierService(val);
                      if (val !== 'por_cobrar') {
                        setSelectedCollectCarrier('');
                        setCollectDocsExpanded(false);
                      }
                    }}
                  >
                    {/* Standard carriers (Gratis, PQTX, etc.) */}
                    {standardCarriers.map((service) => (
                      <FormControlLabel
                        key={service.id}
                        value={service.id}
                        control={<Radio color="primary" />}
                        label={
                          <Paper 
                            elevation={selectedCarrierService === service.id ? 2 : 0}
                            sx={{ 
                              p: 2, 
                              bgcolor: selectedCarrierService === service.id ? 'primary.50' : 'transparent',
                              border: selectedCarrierService === service.id ? `2px solid ${ORANGE}` : '1px solid #eee',
                              borderRadius: 2,
                              width: '100%',
                              minHeight: 90,
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 100, flexShrink: 0 }}>
                                {service.icon && (service.icon.startsWith('http') || service.icon.startsWith('/uploads')) ? (
                                  <Box component="img" src={service.icon} alt={service.name} sx={{ width: 100, height: 60, objectFit: 'contain' }} />
                                ) : (
                                  <Box sx={{ fontSize: '2.5rem' }}>{service.icon}</Box>
                                )}
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, textAlign: 'center', lineHeight: 1.2 }}>
                                  ⏱ {service.description}
                                </Typography>
                              </Box>
                              <Box sx={{ flex: 1 }} />
                              <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="body1" fontWeight="bold" sx={{ color: service.price === 'GRATIS' ? 'success.main' : (service.isDynamic && pqtxQuoteLoading) ? 'text.secondary' : 'text.primary' }}>
                                  {service.isDynamic && pqtxQuoteLoading ? 'Cotizando...' : service.price === 'API' ? 'Cotizar' : service.price}
                                  {service.price !== 'GRATIS' && service.price !== 'API' && service.price !== 'Cotizar' && !service.isTotalPrice && !(service.isDynamic && pqtxQuoteLoading) && (
                                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.3 }}>/caja</Typography>
                                  )}
                                </Typography>
                                {applyToFullShipment && shipmentTotalBoxes > 1 && service.price !== 'GRATIS' && !service.isTotalPrice && (() => {
                                  const priceMatch = service.price.match(/[\d,.]+/);
                                  if (!priceMatch) return null;
                                  const unitPrice = parseFloat(priceMatch[0].replace(',', ''));
                                  const total = unitPrice * shipmentTotalBoxes;
                                  return (
                                    <Typography variant="caption" color="primary.main" fontWeight="bold">
                                      {shipmentTotalBoxes} cajas = ${total.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
                                    </Typography>
                                  );
                                })()}
                                {service.isTotalPrice && shipmentTotalBoxes > 1 && (
                                  <Typography variant="caption" color="text.secondary">
                                    {shipmentTotalBoxes} {t('cd.delivery.boxes')} incluidas
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                          </Paper>
                        }
                        sx={{ m: 0, mb: 1, alignItems: 'flex-start', width: '100%', '& .MuiFormControlLabel-label': { width: '100%' } }}
                      />
                    ))}

                    {/* Grouped "Por cobrar" card */}
                    {collectCarriers.length > 0 && (
                      <FormControlLabel
                        value="por_cobrar"
                        control={<Radio color="primary" />}
                        label={
                          <Paper 
                            elevation={selectedCarrierService === 'por_cobrar' ? 2 : 0}
                            sx={{ 
                              p: 2, 
                              bgcolor: selectedCarrierService === 'por_cobrar' ? 'primary.50' : 'transparent',
                              border: selectedCarrierService === 'por_cobrar' ? `2px solid ${ORANGE}` : '1px solid #eee',
                              borderRadius: 2,
                              width: '100%',
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 100, flexShrink: 0 }}>
                                <Box sx={{ fontSize: '2.5rem' }}>🚚</Box>
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, textAlign: 'center', lineHeight: 1.2 }}>
                                  Otra paquetería
                                </Typography>
                              </Box>
                              <Box sx={{ flex: 1 }} />
                              <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="body1" fontWeight="bold">Por cobrar</Typography>
                                {applyToFullShipment && shipmentTotalBoxes > 1 && (
                                  <Typography variant="caption" color="primary.main" fontWeight="bold">
                                    × {shipmentTotalBoxes} {t('cd.delivery.boxes')}
                                  </Typography>
                                )}
                              </Box>
                            </Box>

                            {/* Expandable collect carrier sub-options */}
                            <Collapse in={selectedCarrierService === 'por_cobrar'} timeout="auto">
                              <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #e0e0e0' }}>
                                <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>Selecciona paquetería:</Typography>
                                {collectCarriers.map((cc) => (
                                  <Paper
                                    key={cc.id}
                                    onClick={() => { setSelectedCollectCarrier(cc.id); setCollectDocsExpanded(true); }}
                                    sx={{
                                      p: 1.5, mb: 1, cursor: 'pointer',
                                      border: selectedCollectCarrier === cc.id ? `2px solid ${ORANGE}` : '1px solid #e0e0e0',
                                      bgcolor: selectedCollectCarrier === cc.id ? '#FFF3EE' : 'white',
                                      borderRadius: 1.5,
                                      display: 'flex', alignItems: 'center', gap: 1.5,
                                      '&:hover': { bgcolor: '#f5f5f5' },
                                    }}
                                  >
                                    {cc.icon && (cc.icon.startsWith('http') || cc.icon.startsWith('/uploads')) ? (
                                      <Box component="img" src={cc.icon} alt={cc.name} sx={{ width: 70, height: 40, objectFit: 'contain' }} />
                                    ) : (
                                      <Box sx={{ fontSize: '1.5rem' }}>{cc.icon}</Box>
                                    )}
                                    <Box sx={{ flex: 1 }}>
                                      <Typography variant="body2" fontWeight="bold">{cc.name}</Typography>
                                      <Typography variant="caption" color="text.secondary">{cc.description}</Typography>
                                    </Box>
                                    {selectedCollectCarrier === cc.id && (
                                      <Box sx={{ color: ORANGE, fontWeight: 'bold' }}>✓</Box>
                                    )}
                                  </Paper>
                                ))}

                                {/* Document uploads - shown after selecting a collect carrier */}
                                <Collapse in={collectDocsExpanded && !!selectedCollectCarrier} timeout="auto">
                                  <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed #ccc' }}>
                                    <Typography variant="body2" fontWeight="bold" sx={{ mb: 1.5, color: ORANGE }}>📄 Documentos requeridos</Typography>

                                    {/* 1. Factura del embarque */}
                                    <Box sx={{ mb: 2 }}>
                                      <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>Factura del embarque</Typography>
                                      <Button
                                        variant="outlined"
                                        component="label"
                                        size="small"
                                        fullWidth
                                        startIcon={<AddPhotoIcon />}
                                        sx={{ justifyContent: 'flex-start', textTransform: 'none', borderColor: facturaFile ? GREEN : '#ccc', color: facturaFile ? GREEN : 'text.secondary' }}
                                      >
                                        {facturaFile ? `✓ ${facturaFile.name}` : 'Subir factura (PDF o imagen)'}
                                        <input type="file" hidden accept="image/*,.pdf" onChange={(e) => setFacturaFile(e.target.files?.[0] || null)} />
                                      </Button>
                                    </Box>

                                    {/* 2. Factura de paquetería + constancia */}
                                    <Box sx={{ mb: 2 }}>
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                        <Typography variant="body2" fontWeight="bold">¿Requiere factura de la paquetería?</Typography>
                                      </Box>
                                      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                                        <Button size="small" variant={wantsFacturaPaqueteria ? 'contained' : 'outlined'} onClick={() => setWantsFacturaPaqueteria(true)} sx={wantsFacturaPaqueteria ? { bgcolor: ORANGE, '&:hover': { bgcolor: '#E04A18' } } : {}}>Sí</Button>
                                        <Button size="small" variant={!wantsFacturaPaqueteria ? 'contained' : 'outlined'} onClick={() => { setWantsFacturaPaqueteria(false); setConstanciaFile(null); setSaveConstancia(false); }} sx={!wantsFacturaPaqueteria ? { bgcolor: '#666', '&:hover': { bgcolor: '#555' } } : {}}>No</Button>
                                      </Box>
                                      <Collapse in={wantsFacturaPaqueteria}>
                                        <Box sx={{ pl: 1, borderLeft: `3px solid ${ORANGE}` }}>
                                          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                                            Adjunta tu Constancia de Situación Fiscal
                                          </Typography>
                                          {/* Show saved constancia option if available */}
                                          {savedConstanciaUrl && !constanciaFile && (
                                            <Box sx={{ mb: 1, p: 1, bgcolor: '#f0faf0', borderRadius: 1, border: `1px solid ${GREEN}` }}>
                                              <Typography variant="caption" color="success.main" fontWeight="bold" sx={{ display: 'block', mb: 0.5 }}>
                                                💾 Constancia guardada: {savedConstanciaName}
                                              </Typography>
                                              <Typography variant="caption" color="text.secondary">
                                                Se usará automáticamente. O sube una nueva para reemplazarla.
                                              </Typography>
                                            </Box>
                                          )}
                                          <Button
                                            variant="outlined"
                                            component="label"
                                            size="small"
                                            fullWidth
                                            startIcon={<AddPhotoIcon />}
                                            sx={{ justifyContent: 'flex-start', textTransform: 'none', mb: 1, borderColor: (constanciaFile || savedConstanciaUrl) ? GREEN : '#ccc', color: (constanciaFile || savedConstanciaUrl) ? GREEN : 'text.secondary' }}
                                          >
                                            {constanciaFile ? `✓ ${constanciaFile.name}` : savedConstanciaUrl ? 'Cambiar constancia' : 'Subir constancia (PDF o imagen)'}
                                            <input type="file" hidden accept="image/*,.pdf" onChange={(e) => setConstanciaFile(e.target.files?.[0] || null)} />
                                          </Button>
                                          {constanciaFile && (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                              <input type="checkbox" checked={saveConstancia} onChange={(e) => setSaveConstancia(e.target.checked)} id="save-constancia" />
                                              <label htmlFor="save-constancia" style={{ fontSize: '0.75rem', color: '#666' }}>Guardar para futuros envíos</label>
                                            </Box>
                                          )}
                                        </Box>
                                      </Collapse>
                                    </Box>

                                    {/* 3. Guía de otra paquetería */}
                                    <Box sx={{ mb: 1 }}>
                                      <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>Guía de paquetería (opcional)</Typography>
                                      <Button
                                        variant="outlined"
                                        component="label"
                                        size="small"
                                        fullWidth
                                        startIcon={<AddPhotoIcon />}
                                        sx={{ justifyContent: 'flex-start', textTransform: 'none', borderColor: guiaExternaFile ? GREEN : '#ccc', color: guiaExternaFile ? GREEN : 'text.secondary' }}
                                      >
                                        {guiaExternaFile ? `✓ ${guiaExternaFile.name}` : 'Subir guía (PDF o imagen)'}
                                        <input type="file" hidden accept="image/*,.pdf" onChange={(e) => setGuiaExternaFile(e.target.files?.[0] || null)} />
                                      </Button>
                                    </Box>
                                  </Box>
                                </Collapse>
                              </Box>
                            </Collapse>
                          </Paper>
                        }
                        sx={{ m: 0, mb: 1, alignItems: 'flex-start', width: '100%', '& .MuiFormControlLabel-label': { width: '100%' } }}
                      />
                    )}
                  </RadioGroup>
                </FormControl>
                  );
                })()}

                {/* Total */}
                <Box sx={{ mt: 2, pt: 2, borderTop: '2px solid #eee' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle1" fontWeight="bold">{t('cd.delivery.total')}</Typography>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="h6" fontWeight="bold" sx={{ color: (selectedCarrierService === 'local' || carrierServices.find(s => s.id === selectedCarrierService)?.price === 'GRATIS') ? 'success.main' : 'text.primary' }}>
                        {(() => {
                          if (selectedCarrierService === 'por_cobrar') return 'Por cobrar';
                          const selectedService = carrierServices.find(s => s.id === selectedCarrierService);
                          if (!selectedService) return 'GRATIS';
                          if (selectedService.price === 'GRATIS') return 'GRATIS';
                          if (selectedService.isDynamic && pqtxQuoteLoading) return 'Cotizando...';
                          if (selectedService.price === 'API') return 'Selecciona dirección';
                          if (selectedService.price === 'Cotizar') return 'Cotizar';
                          // If isTotalPrice, the price already includes all boxes
                          if (selectedService.isTotalPrice) return selectedService.price;
                          if (applyToFullShipment && shipmentTotalBoxes > 1) {
                            const priceMatch = selectedService.price.match(/[\d,.]+/);
                            if (priceMatch) {
                              const unitPrice = parseFloat(priceMatch[0].replace(',', ''));
                              const total = unitPrice * shipmentTotalBoxes;
                              return `$${total.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`;
                            }
                          }
                          return selectedService.price;
                        })()}
                      </Typography>
                      {selectedCarrierService !== 'por_cobrar' && applyToFullShipment && shipmentTotalBoxes > 1 && (() => {
                        const svc = carrierServices.find(s => s.id === selectedCarrierService);
                        if (!svc || svc.price === 'GRATIS') return null;
                        if (svc.isTotalPrice) return <Typography variant="caption" color="text.secondary">{shipmentTotalBoxes} cajas incluidas</Typography>;
                        return <Typography variant="caption" color="text.secondary">{svc.price}/caja × {shipmentTotalBoxes} {t('cd.delivery.boxes')}</Typography>;
                      })()}
                    </Box>
                  </Box>
                </Box>
              </Paper>

              {/* Notas Adicionales */}
              <Paper sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ fontSize: '1.2rem', mr: 1 }}>📝</Box>
                  <Typography variant="subtitle1" fontWeight="bold">
                    {t('cd.delivery.additionalNotes')}
                  </Typography>
                </Box>
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  placeholder={t('cd.delivery.notesPlaceholder')}
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  size="small"
                  sx={{ mt: 1 }}
                />
              </Paper>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3, bgcolor: '#f8f9fa' }}>
          <Button 
            onClick={() => { setDeliveryModalOpen(false); setApplyToFullShipment(false); }}
            size="large"
          >
            {t('common.cancel')}
          </Button>
          <Button 
            variant="contained" 
            size="large"
            onClick={handleAssignDelivery}
            disabled={deliveryLoading || !selectedDeliveryAddress || (selectedCarrierService === 'por_cobrar' && !selectedCollectCarrier)}
            startIcon={deliveryLoading ? <CircularProgress size={20} /> : <Box sx={{ fontSize: '1.2rem' }}>✅</Box>}
            sx={{ 
              bgcolor: ORANGE, 
              minWidth: 200,
              py: 1.5,
              fontSize: '1.1rem',
              '&:hover': { bgcolor: '#E04A18' }
            }}
          >
            {deliveryLoading ? t('common.saving') : t('cd.delivery.saveInstructions')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal Historial de Paquetes */}
      <Dialog open={historyModalOpen} onClose={() => setHistoryModalOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HistoryIcon color="primary" />
          {t('cd.history.title')}
        </DialogTitle>
        <DialogContent>
          {historyPackages.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <InventoryIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography color="text.secondary">{t('cd.history.noHistory')}</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('cd.history.tracking')}</TableCell>
                    <TableCell>{t('cd.history.description')}</TableCell>
                    <TableCell>{t('cd.history.status')}</TableCell>
                    <TableCell align="right">{t('cd.history.amount')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historyPackages.map((pkg) => (
                    <TableRow key={pkg.id}>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">{pkg.tracking}</Typography>
                      </TableCell>
                      <TableCell>{pkg.descripcion}</TableCell>
                      <TableCell>
                        <Chip label={pkg.status_label} size="small" color="success" />
                      </TableCell>
                      <TableCell align="right">{formatCurrency(pkg.monto)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryModalOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      {/* Modal Agregar/Editar Dirección */}
      <Dialog open={addressModalOpen} onClose={() => { setAddressModalOpen(false); setColonyOptions([]); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: ORANGE, color: 'white' }}>
          <LocationOnIcon />
          {editingAddress ? t('cd.addressModal.editTitle') : t('cd.addressModal.newTitle')}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* Alias */}
            <Grid size={12}>
              <TextField
                fullWidth
                size="small"
                label={t('cd.addressModal.alias')}
                value={addressForm.alias}
                onChange={(e) => setAddressForm({ ...addressForm, alias: e.target.value })}
                placeholder="Ej: Casa, Oficina, Bodega..."
              />
            </Grid>

            {/* Nombre/s y Apellido/s */}
            <Grid size={6}>
              <TextField
                fullWidth
                size="small"
                label="Nombre(s) *"
                value={addressForm.first_name}
                onChange={(e) => setAddressForm({ ...addressForm, first_name: e.target.value })}
                required
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                size="small"
                label="Apellido(s) *"
                value={addressForm.last_name}
                onChange={(e) => setAddressForm({ ...addressForm, last_name: e.target.value })}
                required
              />
            </Grid>

            {/* Código de País + Teléfono */}
            <Grid size={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Clave País</InputLabel>
                <Select
                  value={addressForm.country_code}
                  label="Clave País"
                  onChange={(e) => setAddressForm({ ...addressForm, country_code: e.target.value as string })}
                >
                  <MenuItem value="+52">🇲🇽 +52</MenuItem>
                  <MenuItem value="+1">🇺🇸 +1</MenuItem>
                  <MenuItem value="+86">🇨🇳 +86</MenuItem>
                  <MenuItem value="+57">🇨🇴 +57</MenuItem>
                  <MenuItem value="+34">🇪🇸 +34</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={8}>
              <TextField
                fullWidth
                size="small"
                label="Teléfono"
                value={addressForm.phone}
                onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value.replace(/\D/g, '') })}
                placeholder="10 dígitos"
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">📱</InputAdornment>
                    ),
                  }
                }}
              />
            </Grid>

            {/* Divider: Dirección */}
            <Grid size={12}>
              <Divider sx={{ my: 0.5 }}>
                <Chip label="📍 Dirección" size="small" />
              </Divider>
            </Grid>

            {/* Código Postal (primero para auto-fill) */}
            <Grid size={4}>
              <TextField
                fullWidth
                size="small"
                label="Código Postal *"
                value={addressForm.zip_code}
                onChange={(e) => {
                  const cp = e.target.value.replace(/\D/g, '').substring(0, 5);
                  setAddressForm({ ...addressForm, zip_code: cp });
                  if (cp.length === 5) {
                    handleZipCodeLookup(cp);
                  }
                }}
                placeholder="5 dígitos"
                slotProps={{
                  input: {
                    endAdornment: zipLookupLoading ? (
                      <InputAdornment position="end">
                        <CircularProgress size={18} />
                      </InputAdornment>
                    ) : null,
                  }
                }}
              />
            </Grid>
            <Grid size={4}>
              <TextField
                fullWidth
                size="small"
                label="Ciudad *"
                required
                value={addressForm.city}
                onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                slotProps={{
                  input: {
                    readOnly: !!addressForm.city && colonyOptions.length > 0,
                  }
                }}
                sx={addressForm.city && colonyOptions.length > 0 ? { '& .MuiInputBase-root': { bgcolor: '#f5f5f5' } } : {}}
              />
            </Grid>
            <Grid size={4}>
              <TextField
                fullWidth
                size="small"
                label="Estado *"
                required
                value={addressForm.state}
                onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                slotProps={{
                  input: {
                    readOnly: !!addressForm.state && colonyOptions.length > 0,
                  }
                }}
                sx={addressForm.state && colonyOptions.length > 0 ? { '& .MuiInputBase-root': { bgcolor: '#f5f5f5' } } : {}}
              />
            </Grid>

            {/* Colonia (Autocomplete si hay opciones) */}
            <Grid size={12}>
              {colonyOptions.length > 0 ? (
                <Autocomplete
                  freeSolo
                  size="small"
                  options={colonyOptions}
                  value={addressForm.colony}
                  onChange={(_e, newValue) => setAddressForm({ ...addressForm, colony: newValue || '' })}
                  onInputChange={(_e, newInput) => setAddressForm({ ...addressForm, colony: newInput })}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Colonia *"
                      required
                      placeholder="Selecciona o escribe la colonia"
                    />
                  )}
                />
              ) : (
                <TextField
                  fullWidth
                  size="small"
                  label="Colonia *"
                  value={addressForm.colony}
                  onChange={(e) => setAddressForm({ ...addressForm, colony: e.target.value })}
                  placeholder="Ingresa el C.P. para ver opciones"
                />
              )}
            </Grid>

            {/* Calle + Número Ext + Int */}
            <Grid size={6}>
              <TextField
                fullWidth
                size="small"
                label={t('cd.addressModal.street') + ' *'}
                required
                value={addressForm.street}
                onChange={(e) => setAddressForm({ ...addressForm, street: e.target.value })}
              />
            </Grid>
            <Grid size={3}>
              <TextField
                fullWidth
                size="small"
                label={t('cd.addressModal.ext')}
                value={addressForm.exterior_number}
                onChange={(e) => setAddressForm({ ...addressForm, exterior_number: e.target.value })}
              />
            </Grid>
            <Grid size={3}>
              <TextField
                fullWidth
                size="small"
                label={t('cd.addressModal.int')}
                value={addressForm.interior_number}
                onChange={(e) => setAddressForm({ ...addressForm, interior_number: e.target.value })}
              />
            </Grid>

            {/* Referencia */}
            <Grid size={12}>
              <TextField
                fullWidth
                size="small"
                label={t('cd.addressModal.reference')}
                multiline
                rows={2}
                value={addressForm.reference}
                onChange={(e) => setAddressForm({ ...addressForm, reference: e.target.value })}
                placeholder={t('cd.addressModal.referencePlaceholder')}
              />
            </Grid>

            {/* Divider: Asignar Servicios */}
            <Grid size={12}>
              <Divider sx={{ my: 0.5 }}>
                <Chip label="📦 Asignar a Servicios" size="small" />
              </Divider>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, mb: 0.5 }}>
                Selecciona los servicios donde esta dirección será la predeterminada:
              </Typography>
            </Grid>
            <Grid size={12}>
              <FormGroup>
                {[
                  { value: 'air', label: '✈️ Aéreo China', color: '#2196F3', serviceType: 'china_air' },
                  { value: 'maritime', label: '🚢 Marítimo China', color: '#00897B', serviceType: 'china_sea' },
                  { value: 'dhl', label: '📮 Liberación MTY', color: '#D32F2F', serviceType: 'dhl' },
                  { value: 'usa', label: '📦 PO Box USA', color: '#F05A28', serviceType: 'usa_pobox' },
                ].map(svc => {
                  const isChecked = addressForm.service_types.includes(svc.value);
                  const currentCarrier = addressForm.carrier_config[svc.value] || '';
                  // Fetch carriers for this specific service type
                  const availableCarriers = carriersPerService[svc.serviceType] || [
                        { id: 'local', name: 'EntregaX Local MTY', icon: '🚛' },
                        { id: 'express', name: 'Paquete Express', icon: '⚡' },
                      ] as any[];
                  // Trigger fetch if not cached yet
                  if (!carriersPerService[svc.serviceType]) {
                    fetchCarriersForService(svc.serviceType);
                  }
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
                                setAddressForm(prev => ({
                                  ...prev,
                                  service_types: checked
                                    ? [...prev.service_types, svc.value]
                                    : prev.service_types.filter(s => s !== svc.value),
                                  // Limpiar carrier si se deselecciona el servicio
                                  carrier_config: checked ? prev.carrier_config : (() => {
                                    const cc = { ...prev.carrier_config };
                                    delete cc[svc.value];
                                    return cc;
                                  })(),
                                }));
                              }}
                              sx={{ color: svc.color, '&.Mui-checked': { color: svc.color } }}
                            />
                          }
                          label={<Typography variant="body2">{svc.label}</Typography>}
                          sx={{ mr: 0, minWidth: 170 }}
                        />
                        {isChecked && (
                          <TextField
                            select
                            size="small"
                            value={currentCarrier}
                            onChange={(e) => {
                              setAddressForm(prev => ({
                                ...prev,
                                carrier_config: { ...prev.carrier_config, [svc.value]: e.target.value },
                              }));
                            }}
                            sx={{ minWidth: 180, flex: 1 }}
                            SelectProps={{ 
                              displayEmpty: true,
                              renderValue: (val: unknown) => {
                                if (!val) return <Typography variant="body2" color="text.secondary">Sin paquetería default</Typography>;
                                const found = availableCarriers.find((c: any) => c.id === val);
                                return <Typography variant="body2">{found ? `${found.icon || '🚛'} ${found.name}` : String(val)}</Typography>;
                              },
                            }}
                          >
                            <MenuItem value="">
                              <Typography variant="body2" color="text.secondary">Sin paquetería default</Typography>
                            </MenuItem>
                            {availableCarriers.map((c: any) => (
                              <MenuItem key={c.id} value={c.id}>
                                <Typography variant="body2">{(c.icon && !c.icon.startsWith('http') && !c.icon.startsWith('/')) ? c.icon : '🚛'} {c.name}</Typography>
                              </MenuItem>
                            ))}
                          </TextField>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </FormGroup>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAddressModalOpen(false); setColonyOptions([]); }}>{t('common.cancel')}</Button>
          <Button 
            variant="contained" 
            onClick={handleSaveAddress}
            disabled={addressSaving}
            startIcon={addressSaving ? <CircularProgress size={20} /> : <CheckCircleIcon />}
            sx={{ bgcolor: ORANGE }}
          >
            {addressSaving ? t('common.saving') : t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal Detalle del Paquete */}
      <Dialog 
        open={packageDetailOpen} 
        onClose={() => {
          setPackageDetailOpen(false);
          setHighlightedGuideTracking(null);
          setBoxListExpanded(false);
        }} 
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          bgcolor: ORANGE,
          color: 'white',
          py: 2
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InventoryIcon />
            <Typography variant="h6" fontWeight="bold">{t('cd.detail.title')}</Typography>
          </Box>
          <IconButton onClick={() => {
            setPackageDetailOpen(false);
            setHighlightedGuideTracking(null);
          }} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {selectedPackage && (
            <Box>
              {/* Header con Tracking */}
              <Box sx={{ bgcolor: '#f8f9fa', p: 2, borderBottom: '1px solid #e0e0e0' }}>
                <Typography variant="caption" color="text.secondary">{t('cd.detail.trackingNumber')}</Typography>
                <Typography variant="h5" fontFamily="monospace" fontWeight="bold" sx={{ color: ORANGE }}>
                  {selectedPackage.tracking}
                </Typography>
                {selectedPackage.tracking_provider && (
                  <Typography variant="caption" color="text.secondary">
                    Carrier: {selectedPackage.tracking_provider}
                  </Typography>
                )}
              </Box>

              {/* Info General */}
              <Box sx={{ p: 2 }}>
                {/* Descripción */}
                {selectedPackage.descripcion && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      {t('cd.detail.description')}
                    </Typography>
                    <Typography variant="body1">{selectedPackage.descripcion}</Typography>
                  </Box>
                )}

                {/* Dimensiones y Peso */}
                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid size={6}>
                    <Paper sx={{ p: 1.5, bgcolor: '#f8f9fa', textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>⚖️ {t('cd.detail.weight')}</Typography>
                      <Typography variant="h6" fontWeight="bold">
                        {(() => {
                          // Para masters, usar el peso del reempaque o calcular si no existe
                          if (selectedPackage.is_master) {
                            const masterWeight = typeof selectedPackage.weight === 'string' 
                              ? parseFloat(selectedPackage.weight) 
                              : selectedPackage.weight;
                            
                            if (masterWeight) {
                              return `${masterWeight.toFixed(2)} kg`;
                            }
                            
                            // Fallback: calcular de las guías incluidas si no hay peso del master
                            if (selectedPackage.included_guides?.length) {
                              const totalWeight = selectedPackage.included_guides.reduce(
                                (sum, g) => sum + (g.weight || 0), 0
                              );
                              return totalWeight > 0 ? `${totalWeight.toFixed(2)} kg` : '--';
                            }
                          }
                          
                          // Para paquetes normales
                          const weight = typeof selectedPackage.weight === 'string' 
                            ? parseFloat(selectedPackage.weight) 
                            : selectedPackage.weight;
                          return weight ? `${weight.toFixed(2)} kg` : '--';
                        })()}
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid size={6}>
                    <Paper sx={{ p: 1.5, bgcolor: '#f8f9fa', textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>📐 {t('cd.detail.dimensions')}</Typography>
                      <Typography variant="h6" fontWeight="bold" sx={{ fontSize: '0.9rem' }}>
                        {(() => {
                          // Para masters, usar las dimensiones del reempaque (caja final)
                          if (selectedPackage.is_master) {
                            return selectedPackage.dimensions || `${selectedPackage.included_guides?.length || 0} bultos`;
                          }
                          return selectedPackage.dimensions || '--';
                        })()}
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid size={6}>
                    <Paper sx={{ p: 1.5, bgcolor: '#f8f9fa', textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{t('cd.detail.volumeCBM')}</Typography>
                      <Typography variant="h6" fontWeight="bold">
                        {(() => {
                          // Para masters, usar el CBM de la caja final del reempaque
                          const cbm = typeof selectedPackage.cbm === 'string' 
                            ? parseFloat(selectedPackage.cbm) 
                            : selectedPackage.cbm;
                          return cbm ? `${cbm.toFixed(4)} m³` : '--';
                        })()}
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid size={6}>
                    <Paper sx={{ p: 1.5, bgcolor: '#f8f9fa', textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{t('cd.detail.declaredValue')}</Typography>
                      <Typography variant="h6" fontWeight="bold">
                        {(() => {
                          // Para masters, usar el valor declarado total del reempaque
                          const value = typeof selectedPackage.declared_value === 'string' 
                            ? parseFloat(selectedPackage.declared_value) 
                            : selectedPackage.declared_value;
                          return value ? `$${value.toLocaleString()} USD` : '--';
                        })()}
                      </Typography>
                    </Paper>
                  </Grid>
                </Grid>

                {/* Guías Incluidas (para consolidaciones) */}
                {selectedPackage.is_master && selectedPackage.included_guides && selectedPackage.included_guides.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      📋 {t('cd.detail.includedGuides')} ({selectedPackage.included_guides.length})
                    </Typography>
                    <Paper sx={{ bgcolor: '#f8f9fa' }}>
                      {selectedPackage.included_guides.map((guide, idx) => {
                        const isHighlighted = highlightedGuideTracking === guide.tracking;
                        return (
                        <Box 
                          key={guide.id} 
                          sx={{ 
                            p: 1.5, 
                            borderBottom: idx < (selectedPackage.included_guides?.length || 0) - 1 ? '1px solid #e0e0e0' : 'none',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            bgcolor: isHighlighted ? '#fff3e0' : 'transparent',
                            borderLeft: isHighlighted ? `4px solid ${ORANGE}` : 'none',
                            transition: 'all 0.3s'
                          }}
                        >
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" fontFamily="monospace" fontWeight="bold">{guide.tracking}</Typography>
                              {isHighlighted && (
                                <Chip 
                                  label="🔍 Buscado" 
                                  size="small" 
                                  sx={{ height: 18, fontSize: '0.65rem', bgcolor: ORANGE, color: 'white' }}
                                />
                              )}
                            </Box>
                            {guide.description && (
                              <Typography variant="caption" color="text.secondary">{guide.description}</Typography>
                            )}
                          </Box>
                          <Box sx={{ textAlign: 'right' }}>
                            {guide.weight && (
                              <Typography variant="caption" sx={{ display: 'block' }}>{guide.weight} kg</Typography>
                            )}
                            {guide.dimensions && (
                              <Typography variant="caption" color="text.secondary">{guide.dimensions}</Typography>
                            )}
                          </Box>
                        </Box>
                      )})}
                    </Paper>
                  </Box>
                )}

                {/* Desglose de Cajas (para órdenes marítimas con total_boxes) */}
                {selectedPackage.total_boxes && selectedPackage.total_boxes > 0 && (selectedPackage.shipment_type === 'maritime' || selectedPackage.servicio === 'SEA_CHN_MX') && (
                  <Box sx={{ mb: 2 }}>
                    <Button
                      fullWidth
                      variant="outlined"
                      onClick={() => setBoxListExpanded(!boxListExpanded)}
                      endIcon={boxListExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                      sx={{
                        justifyContent: 'space-between',
                        borderColor: '#e0e0e0',
                        color: 'text.primary',
                        textTransform: 'none',
                        fontWeight: 'bold',
                        py: 1.2,
                        bgcolor: boxListExpanded ? '#f5f5f5' : 'transparent',
                        '&:hover': { bgcolor: '#f5f5f5', borderColor: ORANGE }
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        📦 Desglose de Cajas ({selectedPackage.total_boxes})
                      </Box>
                    </Button>
                    <Collapse in={boxListExpanded} timeout="auto">
                      <Paper sx={{ bgcolor: '#fafafa', mt: 0.5, maxHeight: 300, overflow: 'auto', border: '1px solid #e0e0e0' }}>
                        {/* Header de la tabla */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 2, py: 1, bgcolor: '#f0f0f0', borderBottom: '1px solid #e0e0e0', position: 'sticky', top: 0, zIndex: 1 }}>
                          <Typography variant="caption" fontWeight="bold" color="text.secondary">Caja #</Typography>
                          <Typography variant="caption" fontWeight="bold" color="text.secondary">Peso Est.</Typography>
                        </Box>
                        {Array.from({ length: selectedPackage.total_boxes ?? 0 }, (_, i) => {
                          const totalBoxes = selectedPackage.total_boxes ?? 0;
                          const pesoPerBox = selectedPackage.weight ? (Number(selectedPackage.weight) / totalBoxes) : 0;
                          return (
                            <Box
                              key={i}
                              sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                px: 2,
                                py: 0.8,
                                borderBottom: i < totalBoxes - 1 ? '1px solid #f0f0f0' : 'none',
                                '&:hover': { bgcolor: '#fff3e0' }
                              }}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box sx={{
                                  width: 24, height: 24, borderRadius: '50%',
                                  bgcolor: ORANGE, color: 'white',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '0.7rem', fontWeight: 'bold'
                                }}>
                                  {i + 1}
                                </Box>
                                <Typography variant="body2">
                                  Caja {i + 1} de {totalBoxes}
                                </Typography>
                              </Box>
                              <Typography variant="caption" color="text.secondary">
                                {pesoPerBox > 0 ? `~${pesoPerBox.toFixed(1)} kg` : '--'}
                              </Typography>
                            </Box>
                          );
                        })}
                        {/* Totales */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 2, py: 1.2, bgcolor: '#e8f5e9', borderTop: '2px solid #c8e6c9', position: 'sticky', bottom: 0 }}>
                          <Typography variant="body2" fontWeight="bold">
                            📊 Total: {selectedPackage.total_boxes ?? 0} cajas
                          </Typography>
                          <Typography variant="body2" fontWeight="bold">
                            {selectedPackage.weight ? `${Number(selectedPackage.weight).toLocaleString()} kg` : '--'}
                          </Typography>
                        </Box>
                      </Paper>
                    </Collapse>
                  </Box>
                )}

                {/* Servicios Contratados (GEX) */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                    {t('cd.detail.contractedServices')}
                  </Typography>
                  {selectedPackage.has_gex ? (
                    <Paper sx={{ p: 2, bgcolor: ORANGE, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
                      <SecurityIcon />
                      <Box>
                        <Typography variant="body2" fontWeight="bold">{t('cd.detail.gexActive')}</Typography>
                        {selectedPackage.gex_folio && (
                          <Typography variant="caption">Folio: {selectedPackage.gex_folio}</Typography>
                        )}
                      </Box>
                    </Paper>
                  ) : (
                    <Paper sx={{ p: 2, bgcolor: '#ffebee', display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <SecurityIcon sx={{ color: '#D32F2F' }} />
                        <Box sx={{ position: 'absolute', width: '100%', height: 2, bgcolor: '#D32F2F', transform: 'rotate(-45deg)' }} />
                      </Box>
                      <Typography variant="body2" color="error.main">
                        {t('cd.detail.noGex')}
                      </Typography>
                    </Paper>
                  )}
                </Box>

                {/* Información de Entrega */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                    {t('cd.detail.deliveryInfo')}
                  </Typography>
                  {(selectedPackage.delivery_address_id || 
                    selectedPackage.assigned_address_id || 
                    (selectedPackage.destination_address && 
                     selectedPackage.destination_address !== 'Pendiente de asignar')) ? (
                    <Paper sx={{ p: 2, bgcolor: '#e8f5e9' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <LocationOnIcon sx={{ color: 'success.main' }} />
                        <Typography variant="body2" fontWeight="bold" color="success.main">
                          {t('cd.detail.instructionsAssigned')}
                        </Typography>
                      </Box>
                      {(() => {
                        // Resolver dirección completa desde deliveryAddresses
                        const addrId = selectedPackage.delivery_address_id || selectedPackage.assigned_address_id;
                        const resolvedAddr = addrId ? deliveryAddresses.find(a => a.id === addrId) : null;
                        
                        if (resolvedAddr) {
                          return (
                            <>
                              {resolvedAddr.alias && (
                                <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
                                  📍 {resolvedAddr.alias}
                                </Typography>
                              )}
                              <Typography variant="body2" sx={{ mb: 0.3, color: 'text.secondary' }}>
                                {resolvedAddr.street} {resolvedAddr.exterior_number}{resolvedAddr.interior_number ? `, Int. ${resolvedAddr.interior_number}` : ''}
                              </Typography>
                              {resolvedAddr.colony && (
                                <Typography variant="body2" sx={{ mb: 0.3, color: 'text.secondary' }}>
                                  Col. {resolvedAddr.colony}
                                </Typography>
                              )}
                              <Typography variant="body2" sx={{ mb: 0.3, color: 'text.secondary' }}>
                                {resolvedAddr.city}, {resolvedAddr.state} C.P. {resolvedAddr.zip_code}
                              </Typography>
                              {resolvedAddr.contact_name && (
                                <Typography variant="body2" sx={{ mb: 0.3, color: 'text.secondary' }}>
                                  👤 {resolvedAddr.contact_name}
                                </Typography>
                              )}
                              {resolvedAddr.phone && (
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                  📞 {resolvedAddr.phone}
                                </Typography>
                              )}
                              {resolvedAddr.reference && (
                                <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic', color: 'text.secondary', fontSize: '0.75rem' }}>
                                  Ref: {resolvedAddr.reference}
                                </Typography>
                              )}
                            </>
                          );
                        }
                        
                        // Fallback: mostrar destination_address del paquete
                        if (selectedPackage.destination_address) {
                          return (
                            <>
                              <Typography variant="body2" sx={{ mb: 0.5 }}>
                                {selectedPackage.destination_address}
                              </Typography>
                              {selectedPackage.destination_city && (
                                <Typography variant="body2" sx={{ mb: 0.5, color: 'text.secondary' }}>
                                  {selectedPackage.destination_city}
                                </Typography>
                              )}
                              {selectedPackage.destination_contact && (
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                  👤 {selectedPackage.destination_contact}
                                </Typography>
                              )}
                            </>
                          );
                        }
                        
                        return (
                          <Typography variant="body2" color="text.secondary">
                            Dirección asignada (ID: {addrId})
                          </Typography>
                        );
                      })()}
                    </Paper>
                  ) : (
                    <Paper sx={{ p: 2, bgcolor: '#ffebee' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <WarningIcon sx={{ color: 'error.main' }} />
                        <Typography variant="body2" fontWeight="bold" color="error.main">
                          {t('cd.detail.pendingAssignment')}
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {t('cd.detail.needsInstructions')}
                      </Typography>
                    </Paper>
                  )}
                </Box>

                {/* Estado y Costo */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                    💰 {t('cd.detail.serviceCost')}
                  </Typography>
                  {(() => {
                    const displayMonto = Number(selectedPackage.monto) || 0;
                    const isDhl = selectedPackage.shipment_type === 'dhl' || selectedPackage.servicio === 'AA_DHL' || selectedPackage.servicio === 'DHL_MTY';
                    const isMaritime = selectedPackage.shipment_type === 'maritime' || selectedPackage.servicio === 'SEA_CHN_MX' || selectedPackage.servicio === 'FCL_CHN_MX';
                    const isAirChina = selectedPackage.shipment_type === 'china_air' || selectedPackage.servicio === 'AIR_CHN_MX';
                    const isPobox = selectedPackage.servicio === 'POBOX_USA';
                    let isEstimated = false;
                    let costoUSD = 0;
                    let montoMXN = 0;
                    let detailLine = '';
                    let tcToShow = 0; // TC que se muestra al cliente

                    const isFCL = selectedPackage.servicio === 'FCL_CHN_MX' || selectedPackage.merchandise_type === 'FCL';

                    // TC específico por servicio (desde exchange_rate_config)
                    const tcConfig = getTipoCambio(selectedPackage.servicio, selectedPackage.shipment_type);
                    tcToShow = tcConfig; // Por defecto usar el TC de configuración

                    // Determinar labels
                    const merchLabel = selectedPackage.merchandise_type === 'sensitive' ? 'Sensible' 
                      : selectedPackage.merchandise_type === 'logo' ? 'Logotipo' 
                      : selectedPackage.merchandise_type === 'startup' ? 'StartUp'
                      : selectedPackage.merchandise_type === 'FCL' ? 'FCL'
                      : 'Genérico';
                    const airPricePerKg = selectedPackage.air_price_per_kg ? Number(selectedPackage.air_price_per_kg) : 0;
                    const airTariffType = selectedPackage.air_tariff_type || '';
                    const tariffLabel = airTariffType === 'L' ? 'Logo' : airTariffType === 'G' ? 'Genérico' : airTariffType === 'S' ? 'Sensible' : airTariffType === 'F' ? 'Flat' : '';
                    const hasAirFrozenPrice = selectedPackage.air_sale_price && Number(selectedPackage.air_sale_price) > 0;
                    const dhlTypeLabel = selectedPackage.product_type === 'high_value' ? 'Sensible' : 'Accesorios/Mixto';

                    // ========================
                    // LÓGICA POR TIPO DE SERVICIO
                    // ========================
                    
                    if (isMaritime && displayMonto > 0) {
                      // MARÍTIMO: monto = assigned_cost_mxn (YA es MXN)
                      // maritime_sale_price_usd = assigned_cost_usd (USD)
                      montoMXN = displayMonto;
                      if (selectedPackage.maritime_sale_price_usd && Number(selectedPackage.maritime_sale_price_usd) > 0) {
                        costoUSD = Number(selectedPackage.maritime_sale_price_usd);
                        // TC real = MXN / USD (el que se usó al asignar)
                        tcToShow = costoUSD > 0 ? montoMXN / costoUSD : tcConfig;
                      } else {
                        costoUSD = tcConfig > 0 ? displayMonto / tcConfig : 0;
                        tcToShow = tcConfig;
                      }
                      detailLine = isFCL 
                        ? `Contenedor completo · ${merchLabel}`
                        : `${Number(selectedPackage.cbm || 0).toFixed(3)} m³ · ${merchLabel}`;
                    } else if (isPobox && selectedPackage.pobox_venta_usd && Number(selectedPackage.pobox_venta_usd) > 0) {
                      // PO BOX: pobox_venta_usd es el precio USD del cliente
                      // assigned_cost_mxn es costo interno, NO el precio al cliente
                      costoUSD = Number(selectedPackage.pobox_venta_usd);
                      montoMXN = costoUSD * tcConfig;
                      tcToShow = tcConfig;
                      detailLine = 'PO Box USA';
                    } else if (isDhl && selectedPackage.monto_currency === 'USD' && displayMonto > 0) {
                      // AA DHL: monto = import_cost_usd (es USD)
                      costoUSD = displayMonto;
                      montoMXN = costoUSD * tcConfig;
                      tcToShow = tcConfig;
                      if (selectedPackage.product_type) detailLine = dhlTypeLabel;
                    } else if (hasAirFrozenPrice) {
                      // AÉREO CHINA: air_sale_price es USD
                      costoUSD = Number(selectedPackage.air_sale_price);
                      montoMXN = costoUSD * tcConfig;
                      tcToShow = tcConfig;
                      detailLine = `${Number(selectedPackage.weight || 0).toFixed(1)} kg × $${airPricePerKg.toFixed(0)} USD/kg (${tariffLabel})`;
                    } else if (isAirChina && selectedPackage.weight && Number(selectedPackage.weight) > 0) {
                      // AÉREO CHINA estimado
                      costoUSD = Number(selectedPackage.weight) * 21;
                      montoMXN = costoUSD * tcConfig;
                      tcToShow = tcConfig;
                      detailLine = `${Number(selectedPackage.weight).toFixed(1)} kg × $21 USD/kg (estimado)`;
                      isEstimated = true;
                    } else if (isMaritime && !isFCL && selectedPackage.cbm && Number(selectedPackage.cbm) > 0) {
                      // MARÍTIMO estimado por CBM
                      const cbm = Number(selectedPackage.cbm);
                      if (cbm <= 0.03) costoUSD = 39;
                      else if (cbm <= 0.1) costoUSD = 79;
                      else if (cbm <= 0.5) costoUSD = cbm * 150;
                      else if (cbm <= 2) costoUSD = cbm * 120;
                      else costoUSD = cbm * 100;
                      montoMXN = costoUSD * tcConfig;
                      tcToShow = tcConfig;
                      detailLine = `${cbm.toFixed(4)} m³ · ${merchLabel} (estimado)`;
                      isEstimated = true;
                    } else if (isDhl && displayMonto > 0) {
                      // DHL MTY: monto es MXN
                      montoMXN = displayMonto;
                      costoUSD = tcConfig > 0 ? displayMonto / tcConfig : 0;
                      tcToShow = tcConfig;
                      if (selectedPackage.product_type) detailLine = dhlTypeLabel;
                    } else if (displayMonto > 0) {
                      // Otros con monto: verificar moneda
                      if (selectedPackage.monto_currency === 'USD') {
                        costoUSD = displayMonto;
                        montoMXN = costoUSD * tcConfig;
                      } else {
                        montoMXN = displayMonto;
                        costoUSD = tcConfig > 0 ? displayMonto / tcConfig : 0;
                      }
                      tcToShow = tcConfig;
                    }

                    const isPaid = selectedPackage.client_paid;
                    const accentColor = isPaid ? 'success.main' : 'warning.main';

                    return (
                      <Paper sx={{ p: 2, bgcolor: isPaid ? '#e8f5e9' : '#fff3e0' }}>
                        {/* Costo de Envío en USD */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Typography variant="body2" color="text.secondary">📦 Costo de envío:</Typography>
                          <Typography variant="body1" fontWeight="bold" color={accentColor}>
                            {isEstimated ? '~' : ''}${costoUSD.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                          </Typography>
                        </Box>
                        
                        {/* Detalle de cálculo */}
                        {detailLine && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, textAlign: 'right' }}>
                            {detailLine}
                          </Typography>
                        )}

                        <Divider sx={{ my: 1 }} />

                        {/* Tipo de cambio */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Typography variant="body2" color="text.secondary">💱 Tipo de cambio:</Typography>
                          <Typography variant="body2" fontWeight="medium">
                            $1 USD = ${tcToShow.toFixed(2)} MXN
                          </Typography>
                        </Box>

                        <Divider sx={{ my: 1 }} />

                        {/* Total en pesos */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="body2" fontWeight="bold">🇲🇽 Total en pesos:</Typography>
                          <Typography variant="h5" fontWeight="bold" color={accentColor}>
                            {isEstimated ? '~' : ''}${montoMXN.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                          </Typography>
                        </Box>

                        <Chip 
                          label={isPaid ? t('cd.detail.paid') : isEstimated ? 'Pendiente de Cotización' : t('cd.detail.pendingPayment')} 
                          size="small" 
                          color={isPaid ? 'success' : 'warning'}
                          sx={{ mt: 1.5 }}
                        />
                      </Paper>
                    );
                  })()}
                </Box>

                {/* Fechas */}
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                    {t('cd.detail.dates')}
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid size={6}>
                      <Paper sx={{ p: 1.5, bgcolor: '#f8f9fa' }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{t('cd.detail.received')}</Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {selectedPackage.created_at ? new Date(selectedPackage.created_at).toLocaleDateString('es-MX', { 
                            day: '2-digit', 
                            month: 'short', 
                            year: 'numeric' 
                          }) : '--'}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid size={6}>
                      <Paper sx={{ p: 1.5, bgcolor: '#f8f9fa' }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{t('cd.detail.lastUpdated')}</Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {selectedPackage.updated_at ? new Date(selectedPackage.updated_at).toLocaleDateString('es-MX', { 
                            day: '2-digit', 
                            month: 'short', 
                            year: 'numeric' 
                          }) : '--'}
                        </Typography>
                      </Paper>
                    </Grid>
                  </Grid>
                </Box>

                {/* Estado actual */}
                <Box sx={{ mt: 2, textAlign: 'center' }}>
                  <Chip 
                    label={selectedPackage.status_label} 
                    size="medium"
                    sx={{ 
                      fontSize: '1rem', 
                      py: 2.5,
                      ...(selectedPackage.status === 'ready_pickup' && { bgcolor: ORANGE, color: 'white' }) 
                    }}
                    color={selectedPackage.status === 'ready_pickup' ? 'warning' : selectedPackage.status === 'in_transit' ? 'info' : 'default'}
                  />
                </Box>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button 
            fullWidth 
            variant="contained" 
            onClick={() => {
              setPackageDetailOpen(false);
              setHighlightedGuideTracking(null);
            }}
            sx={{ bgcolor: ORANGE }}
          >
            {t('common.close')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal Centro de Ayuda - Opciones de soporte */}
      <Dialog open={helpCenterOpen} onClose={() => setHelpCenterOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ 
          bgcolor: '#2196F3', 
          color: 'white', 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1 
        }}>
          <SupportIcon />
          {t('cd.help.title')}
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {/* Opción 1: Hablar Ahora */}
          <Box
            onClick={() => initSupportChat()}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              p: 2,
              cursor: 'pointer',
              borderBottom: '1px solid #eee',
              '&:hover': { bgcolor: '#f5f5f5' }
            }}
          >
            <Box sx={{ 
              bgcolor: '#2196F3', 
              borderRadius: '50%', 
              width: 48, 
              height: 48, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              <ChatBubbleIcon sx={{ color: 'white' }} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography fontWeight="bold">{t('cd.help.talkNow')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('cd.help.talkNowDesc')}
              </Typography>
            </Box>
            <Typography color="text.secondary">›</Typography>
          </Box>

          {/* Opción 2: Solicitar Asesor */}
          {/* Opción 2: Asesor (muestra info si tiene, o botón para vincular) */}
          {advisorInfo ? (
            // Ya tiene asesor asignado - mostrar info
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                p: 2,
                borderBottom: '1px solid #eee',
                bgcolor: '#f8fff8'
              }}
            >
              <Avatar 
                src={advisorInfo.photo}
                sx={{ 
                  bgcolor: GREEN, 
                  width: 48, 
                  height: 48,
                }}
              >
                {advisorInfo.name?.charAt(0) || 'A'}
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary">{t('cd.help.yourAdvisor')}</Typography>
                <Typography fontWeight="bold">{advisorInfo.name}</Typography>
                {advisorInfo.phone && (
                  <Typography variant="body2" color="text.secondary">📱 {advisorInfo.phone}</Typography>
                )}
              </Box>
              {advisorInfo.phone && (
                <IconButton
                  component="a"
                  href={`https://wa.me/${advisorInfo.phone.replace(/\D/g, '')}?text=${encodeURIComponent(t('cd.chat.whatsappGreeting', { name: advisorInfo.name, suite: boxId }))}`}
                  target="_blank"
                  sx={{
                    bgcolor: '#25D366',
                    color: 'white',
                    '&:hover': { bgcolor: '#1da851' }
                  }}
                >
                  <ChatBubbleIcon />
                </IconButton>
              )}
            </Box>
          ) : (
            // No tiene asesor - mostrar botón para vincular
            <Box
              onClick={() => {
                setHelpCenterOpen(false);
                setAdvisorModalOpen(true);
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                p: 2,
                cursor: 'pointer',
                borderBottom: '1px solid #eee',
                '&:hover': { bgcolor: '#f5f5f5' }
              }}
            >
              <Box sx={{ 
                bgcolor: '#4CAF50', 
                borderRadius: '50%', 
                width: 48, 
                height: 48, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <PersonIcon sx={{ color: 'white' }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography fontWeight="bold">{t('cd.help.requestAdvisor')}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('cd.help.requestAdvisorDesc')}
                </Typography>
              </Box>
              <Typography color="text.secondary">›</Typography>
            </Box>
          )}

          {/* Opción 3: Crear Ticket */}
          <Box
            onClick={() => {
              setHelpCenterOpen(false);
              setSupportOpen(true);
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              p: 2,
              cursor: 'pointer',
              '&:hover': { bgcolor: '#f5f5f5' }
            }}
          >
            <Box sx={{ 
              bgcolor: ORANGE, 
              borderRadius: '50%', 
              width: 48, 
              height: 48, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              <ConfirmationNumber sx={{ color: 'white' }} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography fontWeight="bold">{t('cd.help.createTicket')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('cd.help.createTicketDesc')}
              </Typography>
            </Box>
            <Typography color="text.secondary">›</Typography>
          </Box>
        </DialogContent>
        <Box sx={{ p: 2, borderTop: '1px solid #eee', bgcolor: '#fafafa' }}>
          <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InfoIcon fontSize="small" />
            {t('cd.help.supportHours')}
          </Typography>
        </Box>
      </Dialog>

      {/* Modal de Soporte - Crea ticket para Atención Humana */}
      <Dialog open={supportOpen} onClose={() => setSupportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ 
          bgcolor: ORANGE, 
          color: 'white', 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1 
        }}>
          <SupportIcon />
          🎫 {t('cd.support.title')}
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            {t('cd.support.info')}
          </Alert>
          
          {/* Categoría */}
          <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
            {t('cd.support.category')}
          </Typography>
          <TextField
            select
            fullWidth
            value={supportCategory}
            onChange={(e) => setSupportCategory(e.target.value)}
            sx={{ mb: 2 }}
            placeholder="Selecciona una categoría"
          >
            {supportCategories.map((cat) => (
              <MenuItem key={cat.value} value={cat.value}>
                {cat.label}
              </MenuItem>
            ))}
          </TextField>

          {/* Número de Guía */}
          <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
            {t('cd.support.tracking')} {supportCategory === 'systemError' ? `(${t('cd.support.optional')})` : '*'}
          </Typography>
          <TextField
            fullWidth
            placeholder={t('cd.support.trackingPlaceholder')}
            value={supportTracking}
            onChange={(e) => {
              setSupportTracking(e.target.value);
              if (trackingValidation.status !== 'idle') {
                setTrackingValidation({ status: 'idle', message: '' });
              }
            }}
            onBlur={() => {
              if (supportTracking.trim()) {
                validateTrackingNumber(supportTracking);
              }
            }}
            error={trackingValidation.status === 'invalid'}
            helperText={
              trackingValidation.status === 'validating' ? '⏳ Verificando guía...' :
              trackingValidation.status === 'valid' ? trackingValidation.message :
              trackingValidation.status === 'invalid' ? trackingValidation.message : ''
            }
            FormHelperTextProps={{
              sx: {
                color: trackingValidation.status === 'valid' ? '#4CAF50' : 
                       trackingValidation.status === 'invalid' ? '#D32F2F' : '#666',
                fontWeight: trackingValidation.status !== 'idle' ? 600 : 400,
              }
            }}
            sx={{ mb: 2 }}
          />

          {/* Descripción */}
          <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
            {t('cd.support.description')}
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            placeholder={t('cd.support.descriptionPlaceholder')}
            value={supportMessage}
            onChange={(e) => setSupportMessage(e.target.value)}
            sx={{ mb: 2 }}
          />

          {/* Sección de Imágenes */}
          <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
            📷 {t('cd.support.photos')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {t('cd.support.photosDesc')}
          </Typography>
          
          {/* Input oculto para seleccionar archivos */}
          <input
            type="file"
            accept="image/*"
            multiple
            id="support-image-upload"
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              const newImages = files.map(file => ({
                file,
                preview: URL.createObjectURL(file)
              }));
              setSupportImages(prev => [...prev, ...newImages]);
              e.target.value = ''; // Reset para permitir seleccionar el mismo archivo
            }}
          />
          
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            {/* Botón para agregar imágenes */}
            <label htmlFor="support-image-upload">
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  border: '2px dashed #ccc',
                  borderRadius: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  '&:hover': { borderColor: ORANGE, bgcolor: 'rgba(240,90,40,0.05)' }
                }}
              >
                <AddPhotoIcon sx={{ color: '#999', fontSize: 28 }} />
                <Typography variant="caption" color="text.secondary">{t('cd.support.addPhoto')}</Typography>
              </Box>
            </label>
            
            {/* Preview de imágenes */}
            {supportImages.map((img, index) => (
              <Box
                key={index}
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: 2,
                  overflow: 'hidden',
                  position: 'relative',
                  border: '1px solid #eee',
                }}
              >
                <img
                  src={img.preview}
                  alt={t('cd.support.imageAlt', { number: index + 1 })}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <IconButton
                  size="small"
                  onClick={() => {
                    URL.revokeObjectURL(img.preview);
                    setSupportImages(prev => prev.filter((_, i) => i !== index));
                  }}
                  sx={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    bgcolor: 'rgba(0,0,0,0.6)',
                    color: 'white',
                    p: 0.3,
                    '&:hover': { bgcolor: 'rgba(220,53,69,0.9)' }
                  }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            ))}
          </Box>
          
          {supportImages.length > 0 && (
            <Typography variant="caption" color="success.main" sx={{ display: 'block', mb: 1 }}>
              {t('cd.support.imagesAttached', { count: supportImages.length })}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => {
            setSupportOpen(false);
            setSupportCategory('');
            setSupportTracking('');
            setSupportMessage('');
            // Limpiar previews de imágenes
            supportImages.forEach(img => URL.revokeObjectURL(img.preview));
            setSupportImages([]);
          }}>{ t('common.cancel')}</Button>
          <Button 
            variant="contained" 
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d94d1f' } }}
            onClick={handleSendSupport}
            disabled={!isSupportFormValid()}
            startIcon={<SupportIcon />}
          >
            {t('cd.support.createTicket')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal Vincular Asesor */}
      <Dialog open={advisorModalOpen} onClose={() => setAdvisorModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ 
          bgcolor: BLACK, 
          color: 'white', 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1 
        }}>
          <PersonIcon />
          {t('cd.advisor.title')}
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
            {t('cd.advisor.description')}
          </Typography>
          
          {/* Tu Suite */}
          <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: '#f5f5f5' }}>
            <Typography variant="caption" color="text.secondary">{t('cd.advisor.yourSuite')}</Typography>
            <Typography variant="h5" fontWeight="bold">{boxId}</Typography>
          </Paper>

          <Divider sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">{t('cd.advisor.enterAdvisorData')}</Typography>
          </Divider>

          {/* Código del Asesor */}
          <TextField
            fullWidth
            placeholder={t('cd.advisor.advisorIdPlaceholder')}
            value={advisorCode}
            onChange={(e) => setAdvisorCode(e.target.value)}
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <PersonIcon color="action" />
                </InputAdornment>
              ),
            }}
          />

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            * {t('cd.advisor.noAdvisorHelp')}
          </Typography>

          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={handleNeedHelp}
            disabled={advisorLoading || !!advisorCode.trim()}
            sx={{ 
              bgcolor: ORANGE, 
              '&:hover': { bgcolor: '#d94d1f' },
              '&.Mui-disabled': { bgcolor: '#ccc', color: '#999' },
              py: 1.5,
              mb: 3
            }}
          >
            {advisorLoading ? <CircularProgress size={24} color="inherit" /> : t('cd.advisor.requestPersonalAdvisor')}
          </Button>

          <Divider sx={{ mb: 2 }} />

          {/* Beneficios */}
          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
            {t('cd.advisor.benefits')}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <StarIcon sx={{ color: ORANGE, fontSize: 20 }} />
              <Typography variant="body2">{t('cd.advisor.benefit1')}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SupportIcon sx={{ color: ORANGE, fontSize: 20 }} />
              <Typography variant="body2">{t('cd.advisor.benefit2')}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TruckIcon sx={{ color: ORANGE, fontSize: 20 }} />
              <Typography variant="body2">{t('cd.advisor.benefit3')}</Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setAdvisorModalOpen(false)}>{t('common.cancel')}</Button>
          <Button 
            variant="contained" 
            sx={{ bgcolor: BLACK, '&:hover': { bgcolor: '#333' } }}
            onClick={handleLinkAdvisor}
            disabled={advisorLoading || !advisorCode.trim()}
          >
            {advisorLoading ? <CircularProgress size={20} color="inherit" /> : t('cd.advisor.link')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal Confirmación Vincular Asesor */}
      <Dialog 
        open={advisorConfirmOpen} 
        onClose={() => setAdvisorConfirmOpen(false)} 
        maxWidth="xs" 
        fullWidth
        PaperProps={{
          sx: { 
            borderRadius: 4, 
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }
        }}
      >
        {/* Header con gradiente */}
        <Box sx={{ 
          background: `linear-gradient(135deg, ${BLACK} 0%, #2a2a2a 100%)`,
          px: 3, 
          py: 3,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Decoración de fondo */}
          <Box sx={{ 
            position: 'absolute', top: -20, right: -20, width: 100, height: 100, 
            borderRadius: '50%', bgcolor: 'rgba(240,90,40,0.15)' 
          }} />
          <Box sx={{ 
            position: 'absolute', bottom: -30, right: 40, width: 60, height: 60, 
            borderRadius: '50%', bgcolor: 'rgba(240,90,40,0.1)' 
          }} />
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, position: 'relative', zIndex: 1 }}>
            <Box sx={{ 
              width: 44, height: 44, borderRadius: 2, 
              bgcolor: ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(240,90,40,0.4)',
            }}>
              <SecurityIcon sx={{ color: 'white', fontSize: 24 }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.3px' }}>
                {t('cd.advisorConfirm.title')}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
                {t('cd.advisorConfirm.subtitle')}
              </Typography>
            </Box>
          </Box>
        </Box>

        <DialogContent sx={{ px: 3, py: 2.5 }}>
          {/* Nombre del asesor */}
          {advisorLookupName && (
            <Box sx={{ 
              textAlign: 'center', mb: 2.5, p: 2, 
              bgcolor: '#E8F5E9', borderRadius: 2, border: '1px solid #C8E6C9',
            }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Tu asesor será:
              </Typography>
              <Typography variant="h6" fontWeight="bold" color="#2E7D32">
                {advisorLookupName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Código: {advisorCode.toUpperCase()}
              </Typography>
            </Box>
          )}

          {/* Sección: Lo que tu asesor PUEDE hacer */}
          <Typography variant="overline" sx={{ 
            color: '#4CAF50', fontWeight: 700, letterSpacing: 1.5, fontSize: '0.65rem',
            display: 'block', mb: 1.5
          }}>
            {t('cd.advisorConfirm.advisorCan')}
          </Typography>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2.5 }}>
            {[
              { text: t('cd.advisorConfirm.canDo1'), detail: t('cd.advisorConfirm.canDo1Detail') },
              { text: t('cd.advisorConfirm.canDo2'), detail: t('cd.advisorConfirm.canDo2Detail') },
              { text: t('cd.advisorConfirm.canDo3'), detail: t('cd.advisorConfirm.canDo3Detail') },
            ].map((item, i) => (
              <Box key={i} sx={{ 
                display: 'flex', alignItems: 'center', gap: 1.5,
                p: 1.5, borderRadius: 2, bgcolor: '#F1F8E9', 
                border: '1px solid #C8E6C9',
              }}>
                <CheckCircleOutlineIcon sx={{ color: '#4CAF50', fontSize: 22, flexShrink: 0 }} />
                <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
                  <b>{item.text}</b>{item.detail ? ' ' : ''}
                  {item.detail && <span style={{ color: '#666' }}>{item.detail}</span>}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* Separador */}
          <Divider sx={{ mb: 2.5 }} />

          {/* Sección: Lo que tu asesor NO puede hacer */}
          <Typography variant="overline" sx={{ 
            color: '#D32F2F', fontWeight: 700, letterSpacing: 1.5, fontSize: '0.65rem',
            display: 'block', mb: 1.5
          }}>
            {t('cd.advisorConfirm.advisorCannot')}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2.5 }}>
            {[
              { text: t('cd.advisorConfirm.cannotDo1'), detail: t('cd.advisorConfirm.cannotDo1Detail') },
              { text: t('cd.advisorConfirm.cannotDo2'), detail: t('cd.advisorConfirm.cannotDo2Detail') },
              { text: t('cd.advisorConfirm.cannotDo3'), detail: t('cd.advisorConfirm.cannotDo3Detail') },
            ].map((item, i) => (
              <Box key={i} sx={{ 
                display: 'flex', alignItems: 'center', gap: 1.5,
                p: 1.5, borderRadius: 2, bgcolor: '#FFEBEE', 
                border: '1px solid #FFCDD2',
              }}>
                <BlockIcon sx={{ color: '#D32F2F', fontSize: 22, flexShrink: 0 }} />
                <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
                  <b>{item.text}</b>{' '}
                  <span style={{ color: '#666' }}>{item.detail}</span>
                </Typography>
              </Box>
            ))}
          </Box>

          {/* Alerta de seguridad */}
          <Box sx={{ 
            p: 2, 
            borderRadius: 2.5,
            background: `linear-gradient(135deg, #FFF8E1 0%, #FFF3E0 100%)`,
            border: `2px solid ${ORANGE}30`,
            display: 'flex',
            gap: 1.5,
            alignItems: 'flex-start',
          }}>
            <Box sx={{ 
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              bgcolor: `${ORANGE}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <WarningAmberIcon sx={{ color: ORANGE, fontSize: 20 }} />
            </Box>
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 800, color: ORANGE, letterSpacing: 0.5, display: 'block', mb: 0.3 }}>
                {t('cd.advisorConfirm.securityNotice')}
              </Typography>
              <Typography variant="body2" sx={{ color: '#5D4037', fontWeight: 500, lineHeight: 1.5, fontSize: '0.8rem' }}>
                {t('cd.advisorConfirm.securityNoticeText')}
              </Typography>
            </Box>
          </Box>
        </DialogContent>

        <Box sx={{ px: 3, pb: 3, pt: 1, display: 'flex', gap: 1.5 }}>
          <Button 
            fullWidth
            onClick={() => setAdvisorConfirmOpen(false)}
            sx={{ 
              color: '#666', border: '1.5px solid #ddd', borderRadius: 2.5, py: 1.2,
              fontWeight: 600, textTransform: 'none', fontSize: '0.9rem',
              '&:hover': { bgcolor: '#f5f5f5', borderColor: '#bbb' },
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button 
            fullWidth
            variant="contained" 
            onClick={handleConfirmLinkAdvisor}
            sx={{ 
              bgcolor: ORANGE, 
              borderRadius: 2.5, py: 1.2,
              fontWeight: 700, textTransform: 'none', fontSize: '0.9rem',
              boxShadow: `0 4px 14px ${ORANGE}50`,
              '&:hover': { bgcolor: '#d94d1f', boxShadow: `0 6px 20px ${ORANGE}60` },
            }}
          >
            {t('cd.advisorConfirm.acceptAndLink')}
          </Button>
        </Box>
      </Dialog>

      {/* Modal Chat Virtual con Orlando */}
      <Dialog 
        open={supportChatOpen} 
        onClose={() => setSupportChatOpen(false)} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{
          sx: { 
            height: '80vh', 
            maxHeight: 600,
            display: 'flex',
            flexDirection: 'column'
          }
        }}
      >
        {/* Header del chat */}
        <DialogTitle sx={{ 
          bgcolor: '#2196F3', 
          color: 'white', 
          display: 'flex', 
          alignItems: 'center', 
          gap: 2,
          p: 1.5,
          flexShrink: 0
        }}>
          <Avatar 
            src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face"
            sx={{ width: 40, height: 40 }}
          />
          <Box sx={{ flex: 1 }}>
            <Typography fontWeight="bold"></Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              {chatLoading ? t('cd.chat.typing') : t('cd.chat.customerService')}
            </Typography>
          </Box>
          <IconButton 
            onClick={() => setSupportChatOpen(false)} 
            sx={{ color: 'white' }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        {/* Área de mensajes */}
        <DialogContent sx={{ 
          flex: 1, 
          bgcolor: '#ECE5DD', 
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          overflowY: 'auto'
        }}>
          {chatMessages.map((msg) => (
            <Box
              key={msg.id}
              sx={{
                display: 'flex',
                justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start',
                mb: 0.5
              }}
            >
              <Box
                sx={{
                  maxWidth: '80%',
                  bgcolor: msg.type === 'user' ? '#DCF8C6' : 'white',
                  borderRadius: 2,
                  px: 2,
                  py: 1,
                  boxShadow: 1
                }}
              >
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {msg.text}
                </Typography>
                <Typography 
                  variant="caption" 
                  sx={{ 
                    display: 'block', 
                    textAlign: 'right', 
                    color: 'text.secondary',
                    mt: 0.5
                  }}
                >
                  {msg.time}
                </Typography>
              </Box>
            </Box>
          ))}
          {chatLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
              <Box sx={{ bgcolor: 'white', borderRadius: 2, px: 2, py: 1, boxShadow: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  ⏳ {t('cd.chat.isTyping')}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>

        {/* Input de mensaje */}
        <Box sx={{ 
          p: 1.5, 
          bgcolor: '#f0f0f0', 
          display: 'flex', 
          gap: 1,
          alignItems: 'center',
          flexShrink: 0
        }}>
          <TextField
            fullWidth
            placeholder={t('cd.chat.placeholder')}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendChatMessage();
              }
            }}
            disabled={chatLoading}
            size="small"
            sx={{ 
              bgcolor: 'white', 
              borderRadius: 3,
              '& .MuiOutlinedInput-root': {
                borderRadius: 3
              }
            }}
          />
          <IconButton 
            onClick={handleSendChatMessage}
            disabled={!chatInput.trim() || chatLoading}
            sx={{ 
              bgcolor: '#2196F3', 
              color: 'white',
              '&:hover': { bgcolor: '#1976D2' },
              '&:disabled': { bgcolor: '#ccc' }
            }}
          >
            <SendIcon />
          </IconButton>
        </Box>
      </Dialog>

      {/* Snackbar para notificaciones */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Carrusel de Servicios - Solo en tab Envíos */}
      {activeTab === 0 && (
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" fontWeight="bold" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          {t('cd.servicesCarousel.title')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1, scrollSnapType: 'x mandatory', '&::-webkit-scrollbar': { height: 6 }, '&::-webkit-scrollbar-thumb': { bgcolor: ORANGE, borderRadius: 3 } }}>
          {SERVICE_CONFIG.map((service) => (
            <Card 
              key={service.type}
              onClick={() => {
                setTutorialService(service);
                setTutorialOpen(true);
              }}
              sx={{ 
                minWidth: 240,
                maxWidth: 280,
                flex: '0 0 auto',
                cursor: 'pointer',
                scrollSnapAlign: 'start',
                background: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: 3,
                transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
                '&:hover': { 
                  transform: 'translateY(-4px)', 
                  boxShadow: '0 12px 24px rgba(240,90,40,0.15)',
                  borderColor: ORANGE,
                },
              }}
            >
              <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ color: '#333' }}>
                    {service.name}
                  </Typography>
                  <Chip 
                    label={service.timeframe} 
                    size="small" 
                    sx={{ bgcolor: '#fff3e0', color: ORANGE, fontWeight: 600, fontSize: '0.65rem', height: 20, border: `1px solid ${ORANGE}` }} 
                  />
                </Box>
                <Typography variant="caption" sx={{ color: '#666', display: 'block', mb: 1.5, lineHeight: 1.4 }}>
                  {service.tutorial.substring(0, 80)}...
                </Typography>
                <Button 
                  size="small" 
                  variant="contained"
                  fullWidth
                  sx={{ 
                    bgcolor: ORANGE, 
                    color: 'white',
                    textTransform: 'none',
                    fontWeight: 600,
                    py: 0.5,
                    '&:hover': { bgcolor: '#d94d1f' },
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTutorialService(service);
                    setTutorialOpen(true);
                  }}
                >
                  {t('cd.servicesCarousel.viewAddress')}
                </Button>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>
      )}

      {/* Modal de Pago */}
      <Dialog open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: ORANGE, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <MoneyIcon />
          {t('cd.payment.title')}
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {/* Paquetes Seleccionados */}
          <Paper sx={{ p: 2, mb: 3, bgcolor: '#f8f9fa' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Typography variant="subtitle1" fontWeight="bold" sx={{ color: ORANGE }}>
                📦 {t('cd.payment.packagesCount', { count: selectedPackageIds.length })}
              </Typography>
            </Box>
            
            <Box sx={{ maxHeight: 260, overflowY: 'auto', pr: 1 }}>
              {getSelectedPackages().map((pkg) => (
                <Box key={pkg.id} sx={{ mb: 1, pb: 1, borderBottom: '1px solid #eee' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="body2" fontWeight="bold">{pkg.tracking}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {pkg.descripcion || t('cd.payment.noDescription')}{pkg.weight ? ` - ${Number(pkg.weight).toFixed(1)} kg` : ''}
                      </Typography>
                    </Box>
                    <Typography variant="body1" fontWeight="bold" sx={{ color: ORANGE }}>
                      {formatCurrency(Number(pkg.monto) || 0)}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
            
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" fontWeight="bold">TOTAL:</Typography>
              <Typography variant="h5" fontWeight="bold" sx={{ color: ORANGE }}>
                {formatCurrency(getSelectedPackages().reduce((sum, p) => sum + (Number(p.monto) || 0), 0))}
              </Typography>
            </Box>
          </Paper>

          {/* Información de Envío */}
          <Paper sx={{ p: 2, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Box sx={{ color: 'error.main', mr: 1 }}>📍</Box>
              <Typography variant="subtitle1" fontWeight="bold">
                {t('cd.payment.shippingInfo')}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              <strong>{t('cd.payment.nextDestination')}:</strong> CEDIS Monterrey
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>{t('cd.payment.country')}:</strong> México
            </Typography>
          </Paper>

          {/* Métodos de Pago */}
          <Paper sx={{ p: 2, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Box sx={{ fontSize: '1.2rem', mr: 1 }}>💳</Box>
              <Typography variant="subtitle1" fontWeight="bold">
                {t('cd.payment.selectMethod')}
              </Typography>
            </Box>

            <FormControl component="fieldset" fullWidth>
              <RadioGroup
                value={selectedPaymentMethod}
                onChange={(e) => {
                  const newMethod = e.target.value as 'card' | 'paypal' | 'branch';
                  setSelectedPaymentMethod(newMethod);
                  // Si selecciona pago en sucursal, desactivar facturación
                  if (newMethod === 'branch') {
                    setRequiresInvoice(false);
                  }
                }}
              >
                {paymentGatewayMethods.map((method) => (
                  <FormControlLabel
                    key={method.id}
                    value={method.id}
                    control={<Radio color="primary" />}
                    label={
                      <Paper 
                        elevation={selectedPaymentMethod === method.id ? 2 : 0}
                        sx={{ 
                          p: 2, 
                          bgcolor: selectedPaymentMethod === method.id ? '#fff3e0' : 'transparent',
                          border: selectedPaymentMethod === method.id ? `2px solid ${method.color}` : '1px solid #eee',
                          borderRadius: 2,
                          width: '100%'
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          {selectedPaymentMethod === method.id && (
                            <Box sx={{ color: method.color, fontSize: '1.2rem' }}>✓</Box>
                          )}
                          <Box sx={{ fontSize: '1.5rem' }}>{method.icon}</Box>
                          <Box>
                            <Typography variant="body1" fontWeight="bold">
                              {method.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {method.description}
                            </Typography>
                          </Box>
                        </Box>
                      </Paper>
                    }
                    sx={{ m: 0, mb: 1, alignItems: 'flex-start' }}
                  />
                ))}
              </RadioGroup>
            </FormControl>
          </Paper>

          {/* Facturación */}
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Box sx={{ fontSize: '1.2rem', mr: 1 }}>🧾</Box>
              <Typography variant="subtitle1" fontWeight="bold">
                {t('cd.payment.requireInvoice')}
              </Typography>
              <Switch
                checked={requiresInvoice}
                onChange={(e) => setRequiresInvoice(e.target.checked)}
                disabled={selectedPaymentMethod === 'branch'}
                sx={{ ml: 'auto' }}
              />
            </Box>

            {selectedPaymentMethod === 'branch' && (
              <Alert severity="info" sx={{ mb: 2 }}>
                📄 {t('cd.payment.branchNoInvoice')}
              </Alert>
            )}

            {requiresInvoice && selectedPaymentMethod !== 'branch' && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {!requiresInvoice ? t('cd.payment.noInvoiceLater') : t('cd.payment.completeInvoiceData')}
                </Typography>

                {/* Alert si faltan datos fiscales */}
                {requiresInvoice && fiscalData && !fiscalData.hasCompleteData && (
                  <Alert severity="warning" sx={{ mb: 2 }} icon={<WarningIcon />}>
                    <Typography variant="body2">
                      <strong>Datos fiscales incompletos</strong><br/>
                      Para generar la factura necesitas completar tus datos fiscales en tu perfil.
                      <Button 
                        variant="text" 
                        size="small" 
                        sx={{ color: ORANGE, mt: 0.5 }}
                        onClick={() => {
                          // TODO: Abrir modal de datos fiscales o redirigir
                          setSnackbar({ 
                            open: true, 
                            message: 'Funcionalidad de edición de datos fiscales próximamente', 
                            severity: 'info' 
                          });
                        }}
                      >
                        Actualizar datos fiscales
                      </Button>
                    </Typography>
                  </Alert>
                )}

                {/* Alert si hay datos fiscales completos */}
                {requiresInvoice && fiscalData && fiscalData.hasCompleteData && (
                  <Alert severity="success" sx={{ mb: 2 }} icon={<CheckCircleIcon />}>
                    <Typography variant="body2">
                      <strong>{t('cd.payment.fiscalComplete')}</strong><br/>
                      {t('cd.payment.fiscalCompleteDesc')}
                    </Typography>
                  </Alert>
                )}
                
                <Grid container spacing={2}>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      size="small"
                      label={`${t('cd.fiscal.razonSocial')} *`}
                      value={fiscalData?.fiscal_razon_social || invoiceData.razon_social}
                      onChange={(e) => setInvoiceData({ ...invoiceData, razon_social: e.target.value })}
                      placeholder="Mi Empresa S.A. de C.V."
                      disabled={fiscalData?.hasCompleteData}
                      helperText={fiscalData?.hasCompleteData ? t('cd.payment.fromFiscalProfile') : ""}
                    />
                  </Grid>
                  <Grid size={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label={`${t('cd.fiscal.rfc')} *`}
                      value={fiscalData?.fiscal_rfc || invoiceData.rfc}
                      onChange={(e) => setInvoiceData({ ...invoiceData, rfc: e.target.value.toUpperCase() })}
                      placeholder="XAXX010101000"
                      disabled={fiscalData?.hasCompleteData}
                      helperText={fiscalData?.hasCompleteData ? t('cd.payment.fromFiscalProfile') : ""}
                    />
                  </Grid>
                  <Grid size={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label={`${t('cd.fiscal.zipCode')} *`}
                      value={fiscalData?.fiscal_codigo_postal || invoiceData.codigo_postal}
                      onChange={(e) => setInvoiceData({ ...invoiceData, codigo_postal: e.target.value })}
                      placeholder="64000"
                      inputProps={{ maxLength: 5, pattern: '[0-9]*' }}
                      disabled={fiscalData?.hasCompleteData}
                      helperText={fiscalData?.hasCompleteData ? t('cd.payment.fromFiscalProfile') : ""}
                    />
                  </Grid>
                  <Grid size={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label={`${t('cd.fiscal.regimenFiscal')} *`}
                      select
                      value={fiscalData?.fiscal_regimen_fiscal || invoiceData.regimen_fiscal}
                      onChange={(e) => setInvoiceData({ ...invoiceData, regimen_fiscal: e.target.value })}
                      disabled={fiscalData?.hasCompleteData}
                      helperText={fiscalData?.hasCompleteData ? t('cd.payment.fromFiscalProfile') : ""}
                    >
                      <MenuItem value="601">General de Ley Personas Morales</MenuItem>
                      <MenuItem value="603">Personas Morales con Fines no Lucrativos</MenuItem>
                      <MenuItem value="605">Sueldos y Salarios e Ingresos Asimilados a Salarios</MenuItem>
                      <MenuItem value="606">Arrendamiento</MenuItem>
                      <MenuItem value="608">Demás ingresos</MenuItem>
                      <MenuItem value="610">Residentes en el Extranjero sin Establecimiento Permanente en México</MenuItem>
                      <MenuItem value="611">Ingresos por Dividendos (socios y accionistas)</MenuItem>
                      <MenuItem value="612">Personas Físicas con Actividades Empresariales y Profesionales</MenuItem>
                      <MenuItem value="614">Ingresos por intereses</MenuItem>
                      <MenuItem value="616">Sin obligaciones fiscales</MenuItem>
                      <MenuItem value="621">Incorporación Fiscal</MenuItem>
                      <MenuItem value="622">Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras</MenuItem>
                      <MenuItem value="623">Opcional para Grupos de Sociedades</MenuItem>
                      <MenuItem value="624">Coordinados</MenuItem>
                      <MenuItem value="628">Hidrocarburos</MenuItem>
                      <MenuItem value="629">De los Regímenes Fiscales Preferentes y de las Empresas Multinacionales</MenuItem>
                      <MenuItem value="630">Enajenación de acciones en bolsa de valores</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid size={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label={`${t('cd.fiscal.usoCfdi')} *`}
                      select
                      value={fiscalData?.fiscal_uso_cfdi || invoiceData.uso_cfdi}
                      onChange={(e) => setInvoiceData({ ...invoiceData, uso_cfdi: e.target.value })}
                      disabled={fiscalData?.hasCompleteData}
                      helperText={fiscalData?.hasCompleteData ? t('cd.payment.fromFiscalProfile') : ""}
                    >
                      <MenuItem value="G03">Gastos en general</MenuItem>
                      <MenuItem value="G01">Adquisición de mercancías</MenuItem>
                      <MenuItem value="G02">Devoluciones, descuentos o bonificaciones</MenuItem>
                      <MenuItem value="I04">Compra de divisas</MenuItem>
                      <MenuItem value="I05">Construcciones</MenuItem>
                      <MenuItem value="I06">Mobiliario y equipo de oficina por inversiones</MenuItem>
                      <MenuItem value="I07">Equipo de transporte</MenuItem>
                      <MenuItem value="I08">Equipo de cómputo y accesorios</MenuItem>
                      <MenuItem value="D01">Honorarios médicos y dentales</MenuItem>
                      <MenuItem value="D02">Gastos médicos por incapacidad</MenuItem>
                      <MenuItem value="D03">Gastos funerales</MenuItem>
                      <MenuItem value="D04">Donativos</MenuItem>
                      <MenuItem value="D05">Intereses reales efectivamente pagados por créditos hipotecarios</MenuItem>
                      <MenuItem value="D06">Aportaciones voluntarias al SAR</MenuItem>
                      <MenuItem value="D07">Primas por seguros de gastos médicos</MenuItem>
                      <MenuItem value="D08">Gastos de transportación escolar obligatoria</MenuItem>
                      <MenuItem value="D09">Depósitos en cuentas para el ahorro</MenuItem>
                      <MenuItem value="D10">Pagos por servicios educativos</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      size="small"
                      label={`${t('cd.fiscal.emailInvoice')} *`}
                      type="email"
                      value={invoiceData.email}
                      onChange={(e) => setInvoiceData({ ...invoiceData, email: e.target.value })}
                      placeholder="facturacion@miempresa.com"
                    />
                  </Grid>
                </Grid>
              </Box>
            )}
          </Paper>
        </DialogContent>
        <DialogActions sx={{ p: 3, bgcolor: '#f8f9fa' }}>
          <Button 
            onClick={() => setPaymentModalOpen(false)}
            size="large"
          >
            {t('common.cancel')}
          </Button>
          <Button 
            variant="contained" 
            size="large"
            onClick={handleProcessPayment}
            disabled={paymentLoading}
            startIcon={paymentLoading ? <CircularProgress size={20} /> : <MoneyIcon />}
            sx={{ 
              bgcolor: ORANGE, 
              minWidth: 200,
              py: 1.5,
              fontSize: '1.1rem'
            }}
          >
            {paymentLoading ? t('common.processing') : `💳 ${t('cd.payment.payButton', { amount: formatCurrency(getSelectedPackages().reduce((sum, p) => sum + (Number(p.monto) || 0), 0)) })}`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Botón Flotante de Ayuda */}
      <Box
        sx={{
          position: 'fixed',
          bottom: isMobile ? 80 : 24,
          right: isMobile ? 16 : 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          zIndex: 1000,
        }}
      >
        <Tooltip title={t('cd.help.title')} placement="left">
          <IconButton
            onClick={() => setHelpCenterOpen(true)}
            sx={{
              bgcolor: BLUE,
              color: 'white',
              width: isMobile ? 48 : 56,
              height: isMobile ? 48 : 56,
              boxShadow: 3,
              '&:hover': { bgcolor: '#1565C0' },
            }}
          >
            <SupportIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Modal de Configuración de Datos Fiscales */}
      <Dialog open={fiscalModalOpen} onClose={() => setFiscalModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: ORANGE, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <ReceiptIcon />
          {t('cd.fiscal.title')}
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {t('cd.fiscal.description')}
          </Typography>
          
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextField
                fullWidth
                size="small"
                label={`${t('cd.fiscal.razonSocial')} *`}
                value={invoiceData.razon_social}
                onChange={(e) => setInvoiceData({ ...invoiceData, razon_social: e.target.value })}
                placeholder="Mi Empresa S.A. de C.V."
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                size="small"
                label={`${t('cd.fiscal.rfc')} *`}
                value={invoiceData.rfc}
                onChange={(e) => setInvoiceData({ ...invoiceData, rfc: e.target.value.toUpperCase() })}
                placeholder="XAXX010101000"
                inputProps={{ maxLength: 13 }}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                size="small"
                label={`${t('cd.fiscal.zipCode')} *`}
                value={invoiceData.codigo_postal}
                onChange={(e) => setInvoiceData({ ...invoiceData, codigo_postal: e.target.value })}
                placeholder="64000"
                inputProps={{ maxLength: 5, pattern: '[0-9]*' }}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                size="small"
                label={`${t('cd.fiscal.regimenFiscal')} *`}
                select
                value={invoiceData.regimen_fiscal}
                onChange={(e) => setInvoiceData({ ...invoiceData, regimen_fiscal: e.target.value })}
              >
                <MenuItem value="601">601 - General de Ley Personas Morales</MenuItem>
                <MenuItem value="603">603 - Personas Morales con Fines no Lucrativos</MenuItem>
                <MenuItem value="605">605 - Sueldos y Salarios e Ingresos Asimilados</MenuItem>
                <MenuItem value="606">606 - Arrendamiento</MenuItem>
                <MenuItem value="608">608 - Demás ingresos</MenuItem>
                <MenuItem value="612">612 - Personas Físicas con Actividades Empresariales y Profesionales</MenuItem>
                <MenuItem value="614">614 - Ingresos por intereses</MenuItem>
                <MenuItem value="616">616 - Sin obligaciones fiscales</MenuItem>
                <MenuItem value="621">621 - Incorporación Fiscal</MenuItem>
                <MenuItem value="622">622 - Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras</MenuItem>
              </TextField>
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                size="small"
                label={`${t('cd.fiscal.usoCfdi')} *`}
                select
                value={invoiceData.uso_cfdi}
                onChange={(e) => setInvoiceData({ ...invoiceData, uso_cfdi: e.target.value })}
              >
                <MenuItem value="G03">G03 - Gastos en general</MenuItem>
                <MenuItem value="G01">G01 - Adquisición de mercancías</MenuItem>
                <MenuItem value="G02">G02 - Devoluciones, descuentos o bonificaciones</MenuItem>
                <MenuItem value="I04">I04 - Compra de divisas</MenuItem>
                <MenuItem value="I05">I05 - Construcciones</MenuItem>
                <MenuItem value="I06">I06 - Mobiliario y equipo de oficina por inversiones</MenuItem>
                <MenuItem value="I07">I07 - Equipo de transporte</MenuItem>
                <MenuItem value="I08">I08 - Equipo de cómputo y accesorios</MenuItem>
                <MenuItem value="D01">D01 - Honorarios médicos y dentales</MenuItem>
                <MenuItem value="D02">D02 - Gastos médicos por incapacidad</MenuItem>
                <MenuItem value="D03">D03 - Gastos funerales</MenuItem>
                <MenuItem value="D04">D04 - Donativos</MenuItem>
                <MenuItem value="D05">D05 - Intereses reales efectivamente pagados por créditos hipotecarios</MenuItem>
              </TextField>
            </Grid>
          </Grid>

          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>{t('cd.fiscal.requiredFields')}</strong><br/>
              {t('cd.fiscal.cfdiNote')}
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#f5f5f5' }}>
          <Button onClick={() => setFiscalModalOpen(false)} disabled={fiscalLoading}>
            {t('common.cancel')}
          </Button>
          <Button 
            variant="contained" 
            onClick={handleSaveFiscalData}
            disabled={fiscalLoading || !invoiceData.razon_social || !invoiceData.rfc || !invoiceData.codigo_postal || !invoiceData.regimen_fiscal}
            startIcon={fiscalLoading ? <CircularProgress size={20} /> : <ReceiptIcon />}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d94d1f' } }}
          >
            {fiscalLoading ? t('common.saving') : t('cd.fiscal.saveButton')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* =============== DIALOG: AGREGAR MÉTODO DE PAGO =============== */}
      <Dialog 
        open={showAddPaymentMethod} 
        onClose={() => setShowAddPaymentMethod(false)}
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: ORANGE, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <CreditCardIcon /> {t('cd.addPayment.title')}
        </DialogTitle>
        <DialogContent sx={{ pt: 3, mt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {t('cd.addPayment.description')}
          </Typography>

          {/* Selector de tipo */}
          <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
            {[
              { value: 'card' as const, label: `💳 ${t('cd.addPayment.card')}`, icon: <CreditCardIcon /> },
              { value: 'paypal' as const, label: `🅿️ ${t('cd.addPayment.paypal')}`, icon: <PaymentIcon /> },
            ].map((opt) => (
              <Button
                key={opt.value}
                variant={newPaymentMethod.type === opt.value ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setNewPaymentMethod({ ...newPaymentMethod, type: opt.value })}
                sx={{ 
                  flex: 1, 
                  textTransform: 'none',
                  ...(newPaymentMethod.type === opt.value && { bgcolor: ORANGE, '&:hover': { bgcolor: '#d94d1f' } })
                }}
              >
                {opt.label}
              </Button>
            ))}
          </Box>

          {/* Alias */}
          <TextField
            fullWidth
            size="small"
            label={t('cd.addPayment.aliasLabel')}
            placeholder={t('cd.addPayment.aliasPlaceholder')}
            value={newPaymentMethod.alias}
            onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, alias: e.target.value })}
            sx={{ mb: 2 }}
          />

          {/* Campos para TARJETA */}
          {newPaymentMethod.type === 'card' && (
            <>
              <TextField
                fullWidth
                size="small"
                label={t('cd.addPayment.cardNumber')}
                placeholder="4111 1111 1111 1111"
                value={newPaymentMethod.cardNumber}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 16);
                  setNewPaymentMethod({ ...newPaymentMethod, cardNumber: val });
                }}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><CreditCardIcon fontSize="small" /></InputAdornment>,
                }}
                sx={{ mb: 2 }}
              />
              <Grid container spacing={2}>
                <Grid size={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label={t('cd.addPayment.expiryDate')}
                    placeholder="MM/AA"
                    value={newPaymentMethod.expiryDate}
                    onChange={(e) => {
                      let val = e.target.value.replace(/\D/g, '').slice(0, 4);
                      if (val.length > 2) val = val.slice(0, 2) + '/' + val.slice(2);
                      setNewPaymentMethod({ ...newPaymentMethod, expiryDate: val });
                    }}
                  />
                </Grid>
                <Grid size={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="CVV *"
                    placeholder="123"
                    type="password"
                    value={newPaymentMethod.cvv}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setNewPaymentMethod({ ...newPaymentMethod, cvv: val });
                    }}
                    InputProps={{
                      startAdornment: <InputAdornment position="start"><LockIcon fontSize="small" /></InputAdornment>,
                    }}
                  />
                </Grid>
              </Grid>
              <TextField
                fullWidth
                size="small"
                label={t('cd.addPayment.holderName')}
                placeholder={t('cd.addPayment.holderPlaceholder')}
                value={newPaymentMethod.holderName}
                onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, holderName: e.target.value })}
                sx={{ mt: 2 }}
              />
            </>
          )}

          {/* Campos para PAYPAL */}
          {newPaymentMethod.type === 'paypal' && (
            <TextField
              fullWidth
              size="small"
              label={t('cd.addPayment.paypalEmail')}
              placeholder="correo@paypal.com"
              type="email"
              value={newPaymentMethod.paypalEmail}
              onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, paypalEmail: e.target.value })}
              InputProps={{
                startAdornment: <InputAdornment position="start"><PaymentIcon fontSize="small" /></InputAdornment>,
              }}
            />
          )}

          {/* Campos para TRANSFERENCIA */}
          {newPaymentMethod.type === 'bank_transfer' && (
            <>
              <TextField
                fullWidth
                size="small"
                label={t('cd.addPayment.bankName')}
                placeholder={t('cd.addPayment.bankPlaceholder')}
                value={newPaymentMethod.bankName}
                onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, bankName: e.target.value })}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                size="small"
                label={t('cd.addPayment.clabe')}
                placeholder="18 dígitos"
                value={newPaymentMethod.clabe}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 18);
                  setNewPaymentMethod({ ...newPaymentMethod, clabe: val });
                }}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><AccountBalanceIcon fontSize="small" /></InputAdornment>,
                }}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                size="small"
                label={t('cd.addPayment.beneficiary')}
                placeholder={t('cd.addPayment.beneficiaryPlaceholder')}
                value={newPaymentMethod.beneficiary}
                onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, beneficiary: e.target.value })}
              />
            </>
          )}

          <Alert severity="info" sx={{ mt: 3 }}>
            <Typography variant="caption">
              🔒 Tus datos están protegidos con encriptación. Solo se guardan los últimos 4 dígitos de la tarjeta.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#f5f5f5' }}>
          <Button onClick={() => {
            setShowAddPaymentMethod(false);
            setNewPaymentMethod({
              type: 'card', alias: '', cardNumber: '', expiryDate: '', cvv: '',
              holderName: '', paypalEmail: '', bankName: '', clabe: '', beneficiary: '',
            });
          }}>  
            {t('common.cancel')}
          </Button>
          <Button 
            variant="contained" 
            onClick={handleAddPaymentMethod}
            disabled={
              !newPaymentMethod.alias ||
              (newPaymentMethod.type === 'card' && (!newPaymentMethod.cardNumber || newPaymentMethod.cardNumber.length < 15 || !newPaymentMethod.holderName)) ||
              (newPaymentMethod.type === 'paypal' && !newPaymentMethod.paypalEmail) ||
              (newPaymentMethod.type === 'bank_transfer' && (!newPaymentMethod.bankName || !newPaymentMethod.clabe || newPaymentMethod.clabe.length < 18))
            }
            startIcon={<AddIcon />}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d94d1f' } }}
          >
            {t('cd.addPayment.addMethod')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* =============== DIALOG: CUENTAS POR PAGAR =============== */}
      <Dialog 
        open={showPendingPayments} 
        onClose={() => setShowPendingPayments(false)}
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: ORANGE, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ReceiptIcon /> {t('cd.pending.title')}
          </Box>
          <IconButton onClick={() => setShowPendingPayments(false)} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {/* Total Banner */}
          <Paper 
            sx={{ 
              p: 3, 
              background: 'linear-gradient(135deg, #F05A28 0%, #d94d1f 100%)',
              textAlign: 'center', 
              borderRadius: 0 
            }}
          >
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)' }}>{t('cd.pending.totalPending')}</Typography>
            <Typography variant="h3" fontWeight="bold" sx={{ color: 'white', my: 0.5 }}>
              {formatCurrency(pendingPayments?.totalPending || 0)}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>MXN</Typography>
          </Paper>

          {/* Listado por servicio */}
          {pendingPayments?.byService && pendingPayments.byService.length > 0 ? (
            pendingPayments.byService.map((group) => (
              <Box key={group.service} sx={{ mb: 0 }}>
                {/* Header del servicio */}
                <Box sx={{ 
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  p: 2, bgcolor: '#f8f8f8', borderBottom: '1px solid #eee'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {group.service === 'POBOX_USA' || group.service === 'po_box' ? '📦' : 
                       group.service === 'AIR_CHN_MX' || group.service === 'aereo' ? '✈️' :
                       group.service === 'SEA_CHN_MX' || group.service === 'maritimo' ? '🚢' :
                       group.service === 'AA_DHL' ? '🚛' : '📋'}
                      {' '}{group.serviceName}
                    </Typography>
                  </Box>
                  <Typography variant="subtitle1" fontWeight="bold" color="error.main">
                    {formatCurrency(group.subtotal)}
                  </Typography>
                </Box>

                {/* Facturas/Paquetes del servicio */}
                <Table size="small">
                  <TableBody>
                    {group.invoices.map((inv: any, idx: number) => (
                      <TableRow key={`${group.service}-${idx}`} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight="bold">
                            {inv.invoice_number || inv.tracking_internal}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {inv.concept || t('cd.invoices.packageFallback', { number: inv.invoice_number })} -
                          </Typography>
                          {inv.due_date && (
                            <Typography variant="caption" color="error.main" display="block">
                              {t('cd.invoices.dueDate')}: {new Date(inv.due_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body1" fontWeight="bold">
                            {formatCurrency(inv.balance_due || inv.amount || 0)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ width: 120 }}>
                          <Button 
                            variant="outlined" 
                            size="small" 
                            sx={{ borderColor: ORANGE, color: ORANGE, fontSize: '0.7rem', '&:hover': { bgcolor: ORANGE + '10' } }}
                          >
                            {t('cd.pending.viewDetails')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            ))
          ) : (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <CheckCircleIcon sx={{ fontSize: 60, color: GREEN, mb: 2 }} />
              <Typography variant="h6" color="success.main" fontWeight="bold">
                {t('cd.pending.upToDate')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('cd.pending.noPending')}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#f5f5f5' }}>
          <Button onClick={() => setShowPendingPayments(false)}>
            {t('common.close')}
          </Button>
        </DialogActions>
      </Dialog>

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
            value={(() => {
              // Mapear activeTab a índice de BottomNav
              // activeTab: 0=Envíos, 1=Cotizador, 2=MiCuenta, 3=Facturas, 4=Direcciones
              // BottomNav: 0=Envíos, 1=Pagos, 2=Cotizar, 3=Direcciones, 4=Facturas, 5=Cuenta
              const reverseMapping: {[key: number]: number} = {
                0: 0,  // Envíos → Envíos
                1: 2,  // Cotizador → Cotizar
                2: 5,  // Mi Cuenta → Cuenta
                3: 4,  // Facturas → Facturas
                4: 3,  // Direcciones → Direcciones
              };
              return reverseMapping[activeTab] ?? 0;
            })()}
            onChange={(_, newValue) => {
              // newValue 1 es "Pago a proveedores" - mostrar en construcción
              if (newValue === 1) {
                setSnackbar({ open: true, message: '🚧 Pago a Proveedores: Próximamente disponible', severity: 'info' });
                return;
              }
              // Mapear índices: 0=envíos, 2=cotizador, 3=direcciones, 4=facturas, 5=cuenta
              const tabMapping: {[key: number]: number} = {
                0: 0,  // Mis Envíos
                2: 1,  // Cotizador
                3: 4,  // Direcciones de Envío
                4: 3,  // Facturas
                5: 2,  // Mi Cuenta
              };
              setActiveTab(tabMapping[newValue] ?? 0);
            }}
            showLabels
            sx={{
              height: 64,
              '& .MuiBottomNavigationAction-root': {
                minWidth: 'auto',
                px: 0.5,
                py: 0.5,
                '&.Mui-selected': {
                  color: ORANGE,
                },
              },
              '& .MuiBottomNavigationAction-label': {
                fontSize: '0.55rem',
                mt: 0.25,
                '&.Mui-selected': {
                  fontSize: '0.6rem',
                },
              },
            }}
          >
            <BottomNavigationAction label="Envíos" icon={<ShippingIcon sx={{ fontSize: 22 }} />} />
            <BottomNavigationAction label="Pagos" icon={<PaymentsIcon sx={{ fontSize: 22 }} />} />
            <BottomNavigationAction label="Cotizar" icon={<CalculateIcon sx={{ fontSize: 22 }} />} />
            <BottomNavigationAction label="Direcciones" icon={<HomeIcon sx={{ fontSize: 22 }} />} />
            <BottomNavigationAction label="Facturas" icon={<ReceiptIcon sx={{ fontSize: 22 }} />} />
            <BottomNavigationAction label="Cuenta" icon={<PersonIcon sx={{ fontSize: 22 }} />} />
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  );
}
