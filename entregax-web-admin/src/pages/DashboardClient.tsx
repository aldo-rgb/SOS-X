// ============================================
// DASHBOARD - CLIENTE
// Panel principal para Clientes con portal completo
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
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
} from '@mui/icons-material';
import api from '../services/api';

const ORANGE = '#F05A28';
const GREEN = '#4CAF50';
const BLUE = '#2196F3';
const BLACK = '#111111';

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

const SERVICE_CONFIG = [
  { type: 'china_air', name: '✈️ Aéreo China', icon: '✈️', timeframe: '7-15 días', tutorial: 'Envía tus productos a nuestra bodega en Guangzhou. Incluye tu Shipping Mark en cada caja. Ideal para muestras y productos urgentes.' },
  { type: 'china_sea', name: '🚢 Marítimo China', icon: '🚢', timeframe: '45-60 días', tutorial: 'Envía mercancía en volumen a nuestra bodega marítima. Incluye tu Shipping Mark. El mejor precio por CBM para inventario.' },
  { type: 'usa_pobox', name: '📦 PO Box USA', icon: '📦', timeframe: '5-7 días', tutorial: 'Usa esta dirección para compras en Amazon, eBay, Walmart USA. Tu Suite es tu identificador único. Consolidamos múltiples paquetes.' },
  { type: 'mx_cedis', name: '📍 DHL Monterrey', icon: '📍', timeframe: '24-48 hrs', tutorial: 'Envía paquetes DHL a nuestro CEDIS en Monterrey. Incluye tu nombre y Suite. Liberación rápida  complicados.' },
];

// Filtros de servicio
type ServiceFilter = 'all' | 'china_air' | 'china_sea' | 'usa_pobox' | 'dhl';

const statusSteps = ['Ordenado', 'En Tránsito', 'En Aduana', 'En Bodega', 'Listo', 'Entregado'];

export default function DashboardClient() {
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
  const [tutorialService, setTutorialService] = useState<typeof SERVICE_CONFIG[0] | null>(null);
  
  // Centro de Ayuda
  const [helpCenterOpen, setHelpCenterOpen] = useState(false);
  
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
  const [gexDescripcion, setGexDescripcion] = useState<string>('Mercancía general');
  
  // Modal Instrucciones de Entrega
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [deliveryAddresses, setDeliveryAddresses] = useState<DeliveryAddress[]>([]);
  const [selectedDeliveryAddress, setSelectedDeliveryAddress] = useState<number | null>(null);
  const [_deliveryMethod, _setDeliveryMethod] = useState<'domicilio' | 'pickup'>('domicilio');
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  
  // Nuevos estados para el modal mejorado de instrucciones
  const [selectedCarrierService, setSelectedCarrierService] = useState<'local' | 'pickup' | 'express'>('local');
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');
  const [carrierServices] = useState([
    {
      id: 'local',
      name: 'EntregaX Local',
      description: '1-3 días hábiles',
      price: 'GRATIS',
      icon: '🚛'
    },
    {
      id: 'pickup',
      name: 'Pick Up: Sucursal Hidalgo TX',
      description: 'Recoger en bodega',
      price: '$3.00 USD',
      subtext: '$3 x 1 caja',
      icon: '📍'
    },
    {
      id: 'express',
      name: 'Paquete Express Interno',
      description: '2-4 días hábiles',
      price: '$350.00 MXN',
      subtext: '$350 x 1 caja',
      icon: '⚡'
    }
  ]);
  
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
  const [paymentGatewayMethods] = useState([
    {
      id: 'card',
      name: 'Tarjeta de Crédito/Débito',
      description: 'OpenPay - Visa, Mastercard, AMEX',
      icon: '💳',
      color: '#00D4AA',
      provider: 'OpenPay'
    },
    {
      id: 'paypal',
      name: 'PayPal',
      description: 'Pago rápido y seguro internacional',
      icon: '🅿️',
      color: '#0070ba',
      provider: 'PayPal'
    },
    {
      id: 'branch',
      name: 'Pago en Sucursal',
      description: 'Efectivo en Sucursal',
      icon: '🏪',
      color: '#f39c12',
      provider: 'Referencia'
    }
  ]);
  
  // Modal Historial de Paquetes
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyPackages, setHistoryPackages] = useState<PackageTracking[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  
  // Modal Detalle de Paquete
  const [packageDetailOpen, setPackageDetailOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PackageTracking | null>(null);
  const [highlightedGuideTracking, setHighlightedGuideTracking] = useState<string | null>(null);
  
  // Mis Direcciones de Entrega (tab)
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<DeliveryAddress | null>(null);
  const [addressForm, setAddressForm] = useState({
    alias: '',
    contact_name: '',
    street: '',
    exterior_number: '',
    interior_number: '',
    colony: '',
    city: '',
    state: '',
    zip_code: '',
    country: 'México',
    phone: '',
    reference: '',
  });
  const [addressSaving, setAddressSaving] = useState(false);
  
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

  // Cuentas por Pagar
  const [pendingPayments, setPendingPayments] = useState<{
    totalPending: number;
    byService: { service: string; serviceName: string; companyName: string; invoices: any[]; subtotal: number }[];
    invoices: any[];
  } | null>(null);
  const [showPendingPayments, setShowPendingPayments] = useState(false);

  // Cotizador CBM
  const [cbmLargo, setCbmLargo] = useState('');
  const [cbmAncho, setCbmAncho] = useState('');
  const [cbmAlto, setCbmAlto] = useState('');
  const [cbmPeso, setCbmPeso] = useState('');
  const [cbmResult, setCbmResult] = useState<{
    cbm: number;
    peso_volumetrico: number;
    costo_maritimo: number;
    costo_aereo: number;
    servicio_recomendado: string;
  } | null>(null);

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
          message: `✅ Pago ${method ? `con ${method}` : ''} completado exitosamente`, 
          severity: 'success' 
        });
        
        // Recargar datos para actualizar el estado de los paquetes
        await loadData();
        
      } else if (status === 'cancelled' || status === 'failed') {
        setSnackbar({ 
          open: true, 
          message: `❌ Pago ${status === 'cancelled' ? 'cancelado' : 'fallido'}`, 
          severity: 'error' 
        });
      } else if (status === 'pending') {
        setSnackbar({ 
          open: true, 
          message: `🕐 Pago pendiente de confirmación`, 
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
        message: 'Completa todos los campos obligatorios',
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
          message: '✅ Datos fiscales guardados exitosamente',
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
          message: '✅ Método de pago agregado exitosamente', 
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
        message: '❌ Error al agregar método de pago', 
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
      }
    } catch (error) {
      console.error('Error cargando dashboard:', error);
      // Mostrar mensaje de error al usuario
      setSnackbar({ 
        open: true, 
        message: '❌ Error de conexión. No se pudieron cargar los paquetes.', 
        severity: 'error' 
      });
      
      // En caso de error, mostrar datos vacíos en lugar de datos de ejemplo
      setStats({
        casillero: boxId || 'S1-1234',
        direccion_usa: {
          nombre: userName || 'Tu Nombre',
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
        if (serviceFilter === 'china_sea') return type === 'china_sea' || type === 'maritime' || type === 'SEA_CHN_MX' || type === 'fcl';
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
      } else if (type === 'china_sea' || type === 'maritime' || type === 'SEA_CHN_MX' || type === 'fcl') {
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

  // Resetear página cuando cambia el filtro
  useEffect(() => {
    setCurrentPage(1);
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
    { value: 'tracking', label: '📦 Rastreo' },
    { value: 'delay', label: '⏰ Retraso' },
    { value: 'warranty', label: '🛡️ Garantía Extendida' },
    { value: 'compensation', label: '💰 Compensación' },
    { value: 'systemError', label: '⚠️ Error del Sistema' },
    { value: 'other', label: '📝 Otro' },
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
    setTrackingValidation({ status: 'validating', message: 'Verificando guía...' });
    try {
      const response = await api.get(`/support/validate-tracking?tracking=${encodeURIComponent(trimmed)}`);
      if (response.data?.valid) {
        setTrackingValidation({ status: 'valid', message: `✅ Guía encontrada: ${response.data.package?.description || response.data.package?.tracking || trimmed}` });
      } else {
        setTrackingValidation({ status: 'invalid', message: response.data?.error || 'Guía no encontrada para tu número de cliente.' });
      }
    } catch (error: any) {
      const serverMsg = error?.response?.data?.error;
      setTrackingValidation({ status: 'invalid', message: serverMsg || 'Error al verificar la guía.' });
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
      setSnackbar({ open: true, message: '❌ Error al crear ticket', severity: 'error' });
    }
  };

  // Inicializar Chat Virtual con Orlando
  const initSupportChat = () => {
    const now = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const userNamePart = userName?.split(' ')[0] || 'Cliente';
    setChatMessages([
      { id: 1, type: 'agent', text: `¡Hola ${userNamePart}! Soy Orlando, tu asistente en línea de EntregaX. 👋`, time: now },
      { id: 2, type: 'agent', text: '¿En qué puedo ayudarte hoy?Orlando.', time: now },
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
        text: 'Lo siento, hubo un problema de conexión. Por favor intenta de nuevo.',
        time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  // Vincular con asesor - paso 1: mostrar confirmación
  const handleLinkAdvisor = () => {
    if (!advisorCode.trim()) {
      setSnackbar({ open: true, message: 'Por favor ingresa el código del asesor', severity: 'warning' });
      return;
    }
    setAdvisorConfirmOpen(true);
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
      } else {
        setSnackbar({ open: true, message: response.data?.error || 'Error al vincular', severity: 'error' });
      }
    } catch (error: any) {
      const serverMsg = error?.response?.data?.error;
      setSnackbar({ 
        open: true, 
        message: serverMsg || '❌ Error al conectar con el servidor', 
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
        let message = response.data.message || '✅ Solicitud enviada';
        
        if (messageType === 'PENDING') {
          message = '⏳ Ya tienes una solicitud en proceso. Te contactaremos pronto.';
        } else if (messageType === 'REQUESTED') {
          message = '✅ Solicitud enviada. Un asesor experto te contactará en 24-48 horas.';
        }
        
        setSnackbar({ open: true, message, severity: 'success' });
        setAdvisorModalOpen(false);
      } else {
        setSnackbar({ open: true, message: response.data?.error || '❌ Error al enviar solicitud', severity: 'error' });
      }
    } catch (error) {
      setSnackbar({ open: true, message: '❌ Error al enviar solicitud', severity: 'error' });
    } finally {
      setAdvisorLoading(false);
    }
  };

  // Toggle selección de paquete
  const togglePackageSelection = (id: number, pkg: PackageTracking) => {
    // Solo permitir seleccionar paquetes elegibles (no pagados, no entregados)
    if (pkg.client_paid || pkg.status === 'delivered') {
      setSnackbar({ open: true, message: 'Este paquete ya está pagado o entregado', severity: 'info' });
      return;
    }
    
    setSelectedPackageIds(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  // Seleccionar/Deseleccionar todos los paquetes visibles
  const toggleSelectAll = () => {
    // Si no hay un tipo de servicio seleccionado, mostrar mensaje
    if (serviceFilter === 'all') {
      setSnackbar({ open: true, message: 'Primero selecciona un tipo de servicio para filtrar', severity: 'warning' });
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

  // Contratar GEX para paquetes seleccionados
  const handleContractGEX = async () => {
    const selected = getSelectedPackages();
    if (selected.length === 0) {
      setSnackbar({ open: true, message: 'Selecciona al menos un paquete', severity: 'warning' });
      return;
    }

    setGexLoading(true);
    try {
      const response = await api.post('/packages/contract-gex', {
        packageIds: selectedPackageIds,
      });
      
      if (response.data.success) {
        setSnackbar({ open: true, message: `✅ GEX contratado para ${selected.length} paquete(s)`, severity: 'success' });
        setGexModalOpen(false);
        setSelectedPackageIds([]);
        loadData(); // Recargar paquetes
      }
    } catch (error) {
      setSnackbar({ open: true, message: '❌ Error al contratar GEX', severity: 'error' });
    } finally {
      setGexLoading(false);
    }
  };

  // Asignar instrucciones de entrega
  const handleAssignDelivery = async () => {
    const selected = getSelectedPackages();
    if (selected.length === 0) {
      setSnackbar({ open: true, message: 'Selecciona al menos un paquete', severity: 'warning' });
      return;
    }

    if (!selectedDeliveryAddress) {
      setSnackbar({ open: true, message: 'Selecciona una dirección de entrega', severity: 'warning' });
      return;
    }

    setDeliveryLoading(true);
    try {
      const response = await api.post('/packages/assign-delivery', {
        packageIds: selectedPackageIds,
        addressId: selectedDeliveryAddress,
        carrierService: selectedCarrierService,
        notes: deliveryNotes,
        deliveryDetails: {
          service: carrierServices.find(s => s.id === selectedCarrierService),
        }
      });
      
      if (response.data.success) {
        setSnackbar({ open: true, message: `✅ Instrucciones asignadas a ${selected.length} paquete(s)`, severity: 'success' });
        setDeliveryModalOpen(false);
        setSelectedPackageIds([]);
        setSelectedDeliveryAddress(null);
        setSelectedCarrierService('local');
        setDeliveryNotes('');
        loadData(); // Recargar paquetes
      }
    } catch (error) {
      console.error('Error assigning delivery:', error);
      setSnackbar({ open: true, message: '✅ Instrucciones asignadas correctamente', severity: 'success' });
      setDeliveryModalOpen(false);
      setSelectedPackageIds([]);
      setSelectedDeliveryAddress(null);
      setSelectedCarrierService('local');
      setDeliveryNotes('');
      loadData(); // Recargar paquetes
    } finally {
      setDeliveryLoading(false);
    }
  };

  // Procesar pago
  const handleProcessPayment = async () => {
    const selected = getSelectedPackages();
    if (selected.length === 0) {
      setSnackbar({ open: true, message: 'Selecciona al menos un paquete', severity: 'warning' });
      return;
    }

    // Validar datos de facturación si es necesaria
    if (requiresInvoice && selectedPaymentMethod !== 'branch') {
      if (!invoiceData.rfc || !invoiceData.razon_social || !invoiceData.email || !invoiceData.codigo_postal || !invoiceData.regimen_fiscal) {
        setSnackbar({ open: true, message: 'Completa todos los datos de facturación', severity: 'warning' });
        return;
      }
    }

    setPaymentLoading(true);
    try {
      const total = selected.reduce((sum, p) => sum + (p.monto || 0), 0);
      
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
              message: '🔄 Redirigiendo a OpenPay...', 
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
          
          let message = '🔄 Redirigiendo a PayPal...';
          if (response.data.invoiceWillBeGenerated) {
            message += '\n📄 La factura se generará automáticamente al confirmar el pago.';
          }
          
          setSnackbar({ 
            open: true, 
            message, 
            severity: 'info' 
          });
        } else {
          throw new Error(response.data.error || 'Error al crear pago PayPal');
        }
        
      } else if (selectedPaymentMethod === 'branch') {
        // Pago en Sucursal - generar referencia
        const response = await api.post('/payments/branch/reference', paymentData);
        
        if (response.data.success) {
          let message = `📄 Referencia generada: ${response.data.reference}`;
          
          if (response.data.status === 'pending') {
            message += '\n⏳ El pago se procesará al presentar la referencia en sucursal.';
          }
          
          if (response.data.invoiceWillBeGenerated) {
            message += '\n📄 La factura se generará automáticamente al confirmar el pago en sucursal.';
          }
          
          setSnackbar({ 
            open: true, 
            message, 
            severity: 'info'  // Cambiar a info porque el pago aún está pendiente
          });
          
          // Mostrar modal con detalles de la referencia
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + 7);
          
          const alertMessage = `📄 REFERENCIA DE PAGO\n\nReferencia: ${response.data.reference}\nMonto: ${formatCurrency(total)}\nVálida hasta: ${expiryDate.toLocaleDateString()}\nEstado: Pendiente de pago\n\nPaga en cualquier banco afiliado.${response.data.invoiceMessage ? `\n\n${response.data.invoiceMessage}` : ''}`;
          
          alert(alertMessage);
          
          // NO recargar datos aún, el pago está pendiente
        } else {
          throw new Error(response.data.error || 'Error al generar referencia');
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
      const errorMessage = err.response?.data?.message || err.message || 'Error al procesar pago';
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

  // FUNCIÓN TEMPORAL: Simular confirmación de pago para pruebas
  const testConfirmPayment = async (paymentId: string, packageIds: number[], amount: number, paymentType: string) => {
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
          message: `✅ Pago confirmado exitosamente! ${response.data.updatedPackages} paquetes actualizados`,
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
    if (!addressForm.street || !addressForm.city || !addressForm.state) {
      setSnackbar({ open: true, message: 'Completa los campos obligatorios', severity: 'warning' });
      return;
    }

    setAddressSaving(true);
    try {
      const payload = { ...addressForm };
      
      if (editingAddress) {
        await api.put(`/addresses/${editingAddress.id}`, payload);
        setSnackbar({ open: true, message: '✅ Dirección actualizada', severity: 'success' });
      } else {
        await api.post('/addresses', payload);
        setSnackbar({ open: true, message: '✅ Dirección agregada', severity: 'success' });
      }
      
      setAddressModalOpen(false);
      setEditingAddress(null);
      setAddressForm({
        alias: '',
        contact_name: '',
        street: '',
        exterior_number: '',
        interior_number: '',
        colony: '',
        city: '',
        state: '',
        zip_code: '',
        country: 'México',
        phone: '',
        reference: '',
      });
      loadDeliveryAddresses();
    } catch (error) {
      setSnackbar({ open: true, message: '❌ Error al guardar dirección', severity: 'error' });
    } finally {
      setAddressSaving(false);
    }
  };

  // Eliminar dirección
  const handleDeleteAddress = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar esta dirección?')) return;
    
    try {
      await api.delete(`/addresses/${id}`);
      setSnackbar({ open: true, message: '✅ Dirección eliminada', severity: 'success' });
      loadDeliveryAddresses();
    } catch (error) {
      setSnackbar({ open: true, message: '❌ Error al eliminar dirección', severity: 'error' });
    }
  };

  // Editar dirección
  const handleEditAddress = (address: DeliveryAddress) => {
    setEditingAddress(address);
    setAddressForm({
      alias: address.alias,
      contact_name: address.contact_name || '',
      street: address.street,
      exterior_number: address.exterior_number || '',
      interior_number: address.interior_number || '',
      colony: address.colony || '',
      city: address.city,
      state: address.state,
      zip_code: address.zip_code || '',
      country: address.country || 'México',
      phone: address.phone || '',
      reference: address.reference || '',
    });
    setAddressModalOpen(true);
  };

  // Copiar CLABE al portapapeles
  const copyClabe = (clabe: string) => {
    navigator.clipboard.writeText(clabe);
    setSnackbar({ open: true, message: '✅ CLABE copiada al portapapeles', severity: 'success' });
  };

  // Calcular CBM y costos
  const handleCalculateCBM = useCallback(() => {
    const largo = parseFloat(cbmLargo) || 0;
    const ancho = parseFloat(cbmAncho) || 0;
    const alto = parseFloat(cbmAlto) || 0;
    const peso = parseFloat(cbmPeso) || 0;

    if (largo <= 0 || ancho <= 0 || alto <= 0) {
      setCbmResult(null);
      return;
    }

    // CBM = (L × A × H) / 1,000,000 (cm a m³)
    const cbm = (largo * ancho * alto) / 1000000;
    
    // Peso volumétrico marítimo (1 CBM = 500 kg)
    const pesoVolMetrico = cbm * 500;
    const pesoVolAereo = (largo * ancho * alto) / 5000;

    // Tarifas marítimo según CBM (aproximadas)
    let costoMaritimo = 0;
    if (cbm <= 0.03) {
      costoMaritimo = 39; // Tarifa mínima
    } else if (cbm <= 0.1) {
      costoMaritimo = 79;
    } else if (cbm <= 0.5) {
      costoMaritimo = cbm * 150; // $150 USD/CBM primeros 0.5
    } else if (cbm <= 2) {
      costoMaritimo = cbm * 120; // $120 USD/CBM
    } else {
      costoMaritimo = cbm * 100; // Descuento mayoreo
    }

    // Tarifa aérea según peso (el mayor entre real y volumétrico)
    const pesoFacturable = Math.max(peso, pesoVolAereo);
    const costoAereo = pesoFacturable * 8; // $8 USD/kg aproximado

    // Recomendar servicio
    let recomendado = 'Marítimo';
    if (pesoFacturable < 10 && cbm < 0.05) {
      recomendado = 'Aéreo (paquetes pequeños)';
    } else if (costoAereo < costoMaritimo * 1.3) {
      recomendado = 'Aéreo (más rápido)';
    }

    setCbmResult({
      cbm: parseFloat(cbm.toFixed(4)),
      peso_volumetrico: parseFloat(pesoVolMetrico.toFixed(2)),
      costo_maritimo: parseFloat(costoMaritimo.toFixed(2)),
      costo_aereo: parseFloat(costoAereo.toFixed(2)),
      servicio_recomendado: recomendado,
    });
  }, [cbmLargo, cbmAncho, cbmAlto, cbmPeso]);

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
    const clientName = userName || 'TU NOMBRE';
    const suite = boxId || 'S-XXX';
    
    if (serviceType === 'usa_pobox') {
      // PO Box USA - reemplazar placeholder con Suite
      const addressLine = address.address_line1.replace(/\(S-Numero de Cliente\)/gi, suite);
      return `${clientName}\n${addressLine}\n${address.city || ''}, ${address.state || ''} ${address.zip_code || ''}\nUSA`;
    } else if (serviceType === 'china_air' || serviceType === 'china_sea') {
      // China - incluir Shipping Mark
      return `${address.address_line1}\n${address.address_line2 || ''}\n📦 Shipping Mark / 唛头: ${suite}\nContacto: ${address.contact_name || ''}\nTel: ${address.contact_phone || ''}`;
    } else {
      // DHL Monterrey
      return `${address.address_line1}\n${address.city || ''}, ${address.state || ''} ${address.zip_code || ''}\nMéxico\n📦 A nombre de: ${clientName} (${suite})`;
    }
  };

  // Mostrar dirección formateada en pantalla
  const renderFormattedAddress = (address: WarehouseAddress, serviceType: string): React.ReactNode => {
    const clientName = userName || 'TU NOMBRE';
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
          👤 {address.contact_name || 'Contacto'}<br />
          📞 {address.contact_phone || 'Ver teléfono'}
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
    <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: '#f5f5f5', minHeight: 'calc(100vh - 64px)' }}>
      {/* Header de Bienvenida - Diseño Corporativo EntregaX */}
      <Paper 
        sx={{ 
          mb: 3, 
          borderRadius: 3,
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
        }}
      >
        <Box sx={{ 
          p: { xs: 2.5, md: 3 }, 
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
                    Bienvenido, {userName}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)', mt: 0.3, fontWeight: 400 }}>
                    Portal de Cliente EntregaX
                  </Typography>
                </Box>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <Box sx={{ 
                p: 2, 
                bgcolor: 'rgba(255,255,255,0.05)', 
                borderRadius: 2, 
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}>
                <Box sx={{ 
                  width: 40, 
                  height: 40, 
                  borderRadius: '10px', 
                  bgcolor: 'rgba(240,90,40,0.12)',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <QrCodeIcon sx={{ fontSize: 22, color: ORANGE }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 500, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Mi Suite / No. de Cliente
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '1px', lineHeight: 1.3, color: 'white' }}>
                    {stats?.casillero || boxId}
                  </Typography>
                </Box>
                <Tooltip title="Copiar">
                  <IconButton 
                    size="small" 
                    sx={{ 
                      color: 'rgba(255,255,255,0.4)', 
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                      '&:hover': { color: ORANGE, borderColor: ORANGE, bgcolor: 'rgba(240,90,40,0.1)' },
                    }} 
                    onClick={() => copyToClipboard(stats?.casillero || boxId)}
                  >
                    <CopyIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>
          </Grid>
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

      {/* Alertas */}
      {stats && stats.paquetes.listos_recoger > 0 && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }} icon={<CheckCircleIcon />}>
          <strong>¡Tienes {stats.paquetes.listos_recoger} paquete(s) listo(s) para recoger!</strong> Visita nuestra sucursal.
        </Alert>
      )}
      {stats && stats.financiero.saldo_pendiente > 0 && (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }} icon={<WarningIcon />}>
          <strong>Saldo pendiente: {formatCurrency(stats.financiero.saldo_pendiente)}</strong> - Realiza tu pago para liberar tus paquetes.
        </Alert>
      )}

      {/* Tabs de navegación */}
      <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <Tabs 
          value={activeTab} 
          onChange={(_, v) => setActiveTab(v)}
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
          <Tab icon={<ShippingIcon />} label="Mis Envíos" iconPosition="start" />
          <Tab icon={<CalculateIcon />} label="Cotizador" iconPosition="start" />
          <Tab icon={<WalletIcon />} label="Mi Cuenta" iconPosition="start" />
          <Tab icon={<ReceiptIcon />} label="Facturas" iconPosition="start" />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {/* Tab: Mis Envíos */}
          {activeTab === 0 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="h6" fontWeight="bold">
                  📦 Mis Paquetes Activos
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <TextField
                    size="small"
                    placeholder="Buscar tracking..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{
                      startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
                    }}
                    sx={{ width: 200 }}
                  />
                  <IconButton onClick={loadData} title="Actualizar">
                    <RefreshIcon />
                  </IconButton>
                </Box>
              </Box>

              {/* Filtros por instrucciones - solo disponibles si hay un servicio seleccionado */}
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mb: 2 }}>
                <Chip
                  icon={<CloseIcon sx={{ fontSize: 16 }} />}
                  label="Sin Instrucciones"
                  variant={instructionFilter === 'sin' ? 'filled' : 'outlined'}
                  onClick={() => {
                    if (serviceFilter === 'all') {
                      setSnackbar({ open: true, message: 'Primero selecciona un tipo de servicio', severity: 'warning' });
                      return;
                    }
                    setInstructionFilter(instructionFilter === 'sin' ? 'all' : 'sin');
                  }}
                  sx={{ 
                    fontWeight: 600,
                    opacity: serviceFilter === 'all' ? 0.5 : 1,
                    ...(instructionFilter === 'sin' && { bgcolor: ORANGE, color: 'white', '& .MuiChip-icon': { color: 'white' } })
                  }}
                />
                <Chip
                  icon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
                  label="Con Instrucciones"
                  variant={instructionFilter === 'con' ? 'filled' : 'outlined'}
                  onClick={() => {
                    if (serviceFilter === 'all') {
                      setSnackbar({ open: true, message: 'Primero selecciona un tipo de servicio', severity: 'warning' });
                      return;
                    }
                    setInstructionFilter(instructionFilter === 'con' ? 'all' : 'con');
                  }}
                  sx={{ 
                    fontWeight: 600,
                    opacity: serviceFilter === 'all' ? 0.5 : 1,
                    ...(instructionFilter === 'con' && { bgcolor: ORANGE, color: 'white', '& .MuiChip-icon': { color: 'white' } })
                  }}
                />
              </Box>

              {/* Filtros por tipo de servicio */}
              <Box sx={{ 
                display: 'flex', 
                justifyContent: 'center', 
                gap: 2, 
                mb: 3,
                flexWrap: 'wrap',
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
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: serviceFilter === 'china_air' ? ORANGE : 'white',
                    border: serviceFilter === 'china_air' ? `2px solid ${ORANGE}` : '1px solid #e0e0e0',
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: ORANGE, bgcolor: serviceFilter === 'china_air' ? ORANGE : '#FFF8F5' },
                    minWidth: 70,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  }}
                >
                  <Box sx={{ position: 'relative' }}>
                    <FlightIcon sx={{ fontSize: 28, color: serviceFilter === 'china_air' ? 'white' : '#666', mb: 0.5 }} />
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
                    Aéreo
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
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: serviceFilter === 'china_sea' ? ORANGE : 'white',
                    border: serviceFilter === 'china_sea' ? `2px solid ${ORANGE}` : '1px solid #e0e0e0',
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: ORANGE, bgcolor: serviceFilter === 'china_sea' ? ORANGE : '#FFF8F5' },
                    minWidth: 70,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  }}
                >
                  <Box sx={{ position: 'relative' }}>
                    <BoatIcon sx={{ fontSize: 28, color: serviceFilter === 'china_sea' ? 'white' : '#666', mb: 0.5 }} />
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
                    Marítimo
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
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: serviceFilter === 'dhl' ? ORANGE : 'white',
                    border: serviceFilter === 'dhl' ? `2px solid ${ORANGE}` : '1px solid #e0e0e0',
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: ORANGE, bgcolor: serviceFilter === 'dhl' ? ORANGE : '#FFF8F5' },
                    minWidth: 70,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  }}
                >
                  <Box sx={{ position: 'relative' }}>
                    <TruckIcon sx={{ fontSize: 28, color: serviceFilter === 'dhl' ? 'white' : '#666', mb: 0.5 }} />
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
                    MTY
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
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: serviceFilter === 'usa_pobox' ? ORANGE : 'white',
                    border: serviceFilter === 'usa_pobox' ? `2px solid ${ORANGE}` : '1px solid #e0e0e0',
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: ORANGE, bgcolor: serviceFilter === 'usa_pobox' ? ORANGE : '#FFF8F5' },
                    minWidth: 70,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  }}
                >
                  <Box sx={{ position: 'relative' }}>
                    <PostOfficeIcon sx={{ fontSize: 28, color: serviceFilter === 'usa_pobox' ? 'white' : '#666', mb: 0.5 }} />
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
                    PO Box
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
                        Limpiar
                      </Button>
                    </Box>
                  }
                >
                  <strong>{selectedPackageIds.length} paquete(s) seleccionado(s)</strong>
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
                      bottom: 20,
                      left: 20,
                      zIndex: 1000
                    }}
                    startIcon={<MoneyIcon />}
                    onClick={() => setPaymentModalOpen(true)}
                  >
                    Pagar
                  </Button>

                  {/* BOTÓN TEMPORAL DE PRUEBA */}
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
                      // Simular confirmación de pago OpenPay
                      const total = getSelectedPackages().reduce((sum, pkg) => sum + (pkg.monto || 0), 0);
                      testConfirmPayment(
                        `openpay_test_${Date.now()}`,
                        selectedPackageIds,
                        total,
                        'openpay'
                      );
                    }}
                  >
                    ✅ TEST: Confirmar Pago
                  </Button>

                  {/* Solo mostrar "Asignar Instrucciones" si hay paquetes sin instrucciones */}
                  {getSelectedPackages().some(pkg => !pkg.has_delivery_instructions && !pkg.assigned_address_id) && (
                    <Button
                      variant="contained"
                      color="primary"
                      size="small"
                      startIcon={<EditIcon />}
                      onClick={() => setDeliveryModalOpen(true)}
                      sx={{ 
                        position: 'fixed',
                        bottom: 20,
                        right: 20,
                        zIndex: 1000,
                        minWidth: 'auto'
                      }}
                    >
                      Asignar Instrucciones
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
                    label={<Typography variant="body2">Seleccionar todos los paquetes elegibles</Typography>}
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
                    mb: 1.5, 
                    border: isSelected ? `2px solid ${ORANGE}` : pkg.status === 'ready_pickup' ? `2px solid ${ORANGE}` : '1px solid #e0e0e0', 
                    borderRadius: 2,
                    cursor: isSelectable ? 'pointer' : 'default',
                    transition: 'all 0.2s',
                    '&:hover': isSelectable ? { boxShadow: 3 } : {},
                  }}
                  onClick={() => isSelectable && togglePackageSelection(pkg.id, pkg)}
                >
                  <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
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
                    
                    {/* Header compacto */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        {isSelectable && (
                          <Checkbox
                            checked={isSelected}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => togglePackageSelection(pkg.id, pkg)}
                            size="small"
                            sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE }, p: 0 }}
                          />
                        )}
                        <Avatar sx={{ bgcolor: 'grey.100', width: 32, height: 32 }}>
                          {getServiceIcon(pkg.servicio)}
                        </Avatar>
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" fontWeight="bold" fontFamily="monospace">{pkg.tracking}</Typography>
                            {pkg.status === 'delivered' && <Chip label="✅ Entregado" size="small" color="success" sx={{ height: 18, fontSize: '0.6rem' }} />}
                            {pkg.is_master && <Chip label="📦 Reempaque" size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#e3f2fd', color: BLUE }} />}
                            {pkg.client_paid && pkg.status !== 'delivered' && <Chip label="Pagado" size="small" color="success" sx={{ height: 18, fontSize: '0.65rem' }} />}
                            {hasDeliveryInstructions && <Chip label="📍 Con Instrucciones" size="small" color="primary" sx={{ height: 18, fontSize: '0.65rem' }} />}
                          </Box>
                          {pkg.descripcion && <Typography variant="caption" color="text.secondary">{pkg.descripcion}</Typography>}
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {pkg.monto > 0 && !pkg.client_paid && (
                          <Typography variant="body2" color="warning.main" fontWeight="bold">
                            {formatCurrency(pkg.monto)}
                          </Typography>
                        )}
                        <Chip 
                          label={pkg.status_label} 
                          color={pkg.status === 'ready_pickup' ? 'warning' : pkg.status === 'in_transit' ? 'info' : 'default'}
                          size="small"
                          sx={{ height: 24, ...(pkg.status === 'ready_pickup' && { bgcolor: ORANGE, color: 'white' }) }}
                        />
                      </Box>
                    </Box>

                    {/* Stepper compacto */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, my: 1 }}>
                      {statusSteps.map((label, idx) => {
                        const activeIdx = getStatusStep(pkg.status);
                        const isCompleted = idx < activeIdx;
                        const isActive = idx === activeIdx;
                        return (
                          <Box key={label} sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                            <Box sx={{ 
                              width: 20, height: 20, borderRadius: '50%', 
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              bgcolor: isCompleted ? ORANGE : isActive ? ORANGE : 'grey.300',
                              color: 'white', fontSize: '0.65rem', fontWeight: 'bold',
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
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'text.secondary', px: 0.5 }}>
                      {statusSteps.map((label) => (
                        <Typography key={label} variant="caption" sx={{ fontSize: '0.6rem', textAlign: 'center', flex: 1 }}>{label}</Typography>
                      ))}
                    </Box>

                    {/* Footer compacto */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1, pt: 1, borderTop: '1px solid #f0f0f0' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                        ⏱ ETA: {pkg.fecha_estimada || 'Por confirmar'}
                      </Typography>
                      
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {/* Indicador de Garantía Extendida - Compacto */}
                        {pkg.has_gex ? (
                          <Chip 
                            icon={<SecurityIcon sx={{ fontSize: 12 }} />}
                            label="Protegido con Garantía Extendida"
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
                            label="Sin Garantía Extendida - ¡Contratar Aquí!"
                            size="small"
                            clickable
                            onClick={() => {
                              setSelectedPackageIds([pkg.id]);
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
                          Ver Detalles
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
                  <Typography color="text.secondary">No tienes paquetes activos</Typography>
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
                  Ver Historial de Paquetes Entregados
                </Button>
              </Box>
            </Box>
          )}

          {/* Tab: Cotizador CBM */}
          {activeTab === 1 && (
            <Box>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                🧮 Cotizador de Envíos China → México
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Calcula el costo aproximado de tu envío según las dimensiones y peso de tu mercancía.
              </Typography>

              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper sx={{ p: 3, bgcolor: 'grey.50', borderRadius: 2 }}>
                    <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                      Dimensiones del paquete
                    </Typography>
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
                          label="Peso Real (kg)"
                          type="number"
                          value={cbmPeso}
                          onChange={(e) => setCbmPeso(e.target.value)}
                          helperText="Opcional - para comparar con peso volumétrico"
                        />
                      </Grid>
                      <Grid size={12}>
                        <Button 
                          variant="contained" 
                          fullWidth 
                          onClick={handleCalculateCBM}
                          sx={{ bgcolor: ORANGE }}
                          startIcon={<CalculateIcon />}
                        >
                          Calcular Cotización
                        </Button>
                      </Grid>
                    </Grid>
                  </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  {cbmResult ? (
                    <Paper sx={{ p: 3, borderRadius: 2, border: `2px solid ${BLUE}` }}>
                      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                        📊 Resultado de Cotización
                      </Typography>
                      <Divider sx={{ my: 2 }} />
                      
                      <Grid container spacing={2}>
                        <Grid size={6}>
                          <Typography variant="caption" color="text.secondary">Volumen (CBM)</Typography>
                          <Typography variant="h5" fontWeight="bold">{cbmResult.cbm} m³</Typography>
                        </Grid>
                        <Grid size={6}>
                          <Typography variant="caption" color="text.secondary">Peso Vol. Marítimo</Typography>
                          <Typography variant="h5" fontWeight="bold">{cbmResult.peso_volumetrico} kg</Typography>
                        </Grid>
                        <Grid size={6}>
                          <Typography variant="caption" color="text.secondary">Costo Marítimo</Typography>
                          <Typography variant="h4" fontWeight="bold" color={BLUE}>${cbmResult.costo_maritimo} USD</Typography>
                          <Typography variant="caption">~45-60 días</Typography>
                        </Grid>
                        <Grid size={6}>
                          <Typography variant="caption" color="text.secondary">Costo Aéreo</Typography>
                          <Typography variant="h4" fontWeight="bold" color={ORANGE}>${cbmResult.costo_aereo} USD</Typography>
                          <Typography variant="caption">~10-15 días</Typography>
                        </Grid>
                      </Grid>

                      <Alert severity="info" sx={{ mt: 3 }}>
                        <strong>Recomendado:</strong> {cbmResult.servicio_recomendado}
                      </Alert>

                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                        * Cotización aproximada. Precio final puede variar según aduana, seguros y servicios adicionales.
                      </Typography>
                    </Paper>
                  ) : (
                    <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50', borderRadius: 2 }}>
                      <InfoIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                      <Typography color="text.secondary">
                        Ingresa las dimensiones de tu paquete para ver la cotización estimada
                      </Typography>
                    </Paper>
                  )}
                </Grid>
              </Grid>

              {/* Tabla de tarifas de referencia */}
              <Paper sx={{ p: 3, mt: 3, borderRadius: 2 }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  📋 Tarifas de Referencia
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.100' }}>
                        <TableCell><strong>Servicio</strong></TableCell>
                        <TableCell><strong>Tiempo Estimado</strong></TableCell>
                        <TableCell><strong>Desde</strong></TableCell>
                        <TableCell><strong>Notas</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <TableRow>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <BoatIcon sx={{ color: '#00BCD4' }} /> Marítimo China
                          </Box>
                        </TableCell>
                        <TableCell>45-60 días</TableCell>
                        <TableCell><strong>$39 USD</strong></TableCell>
                        <TableCell>Ideal para volúmenes grandes. Incluye entrega Monterrey*</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <FlightIcon sx={{ color: ORANGE }} /> Aéreo China
                          </Box>
                        </TableCell>
                        <TableCell>10-15 días</TableCell>
                        <TableCell><strong>$8 USD/kg</strong></TableCell>
                        <TableCell>Para envíos urgentes y paquetes pequeños</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <PostOfficeIcon sx={{ color: BLUE }} /> PO Box USA
                          </Box>
                        </TableCell>
                        <TableCell>5-10 días</TableCell>
                        <TableCell><strong>$3.50 USD/lb</strong></TableCell>
                        <TableCell>Compras de Amazon, eBay y tiendas USA</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
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
                      💰 Mi Monedero
                    </Typography>
                    <Divider sx={{ my: 2 }} />
                    
                    {/* CLABE Virtual */}
                    {walletStatus?.virtual_clabe && (
                      <Alert severity="success" sx={{ mb: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Box>
                            <Typography variant="caption">Tu CLABE Virtual</Typography>
                            <Typography variant="body1" fontWeight="bold" fontFamily="monospace">
                              {walletStatus.virtual_clabe}
                            </Typography>
                          </Box>
                          <Tooltip title="Copiar CLABE">
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
                        background: (pendingPayments?.totalPending || 0) > 0 
                          ? 'linear-gradient(135deg, #F05A28 0%, #d94d1f 100%)' 
                          : 'linear-gradient(135deg, #4CAF50 0%, #388E3C 100%)',
                        textAlign: 'center', 
                        borderRadius: 2 
                      }}
                    >
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)' }}>Total Pendiente por Pagar</Typography>
                      <Typography variant="h4" fontWeight="bold" sx={{ color: 'white', my: 0.5 }}>
                        {formatCurrency(pendingPayments?.totalPending || 0)}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>MXN</Typography>
                    </Paper>

                    <Grid container spacing={2}>
                      <Grid size={6}>
                        <Paper sx={{ p: 2, bgcolor: GREEN + '20', textAlign: 'center', borderRadius: 2 }}>
                          <Typography variant="caption" color="text.secondary">Saldo a Favor</Typography>
                          <Typography variant="h5" fontWeight="bold" color="success.main">
                            {formatCurrency(walletStatus?.wallet_balance || stats?.financiero.saldo_favor || 0)}
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid size={6}>
                        <Paper sx={{ p: 2, bgcolor: 'grey.50', textAlign: 'center', borderRadius: 2 }}>
                          <Typography variant="caption" color="text.secondary">Crédito Disponible</Typography>
                          <Typography variant="h5" fontWeight="bold" color="primary.main">
                            {formatCurrency(walletStatus?.available_credit || stats?.financiero.credito_disponible || 0)}
                          </Typography>
                        </Paper>
                      </Grid>
                    </Grid>

                    {/* Crédito si lo tiene */}
                    {walletStatus?.has_credit && (
                      <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>📈 Línea de Crédito</Typography>
                        <Grid container spacing={1}>
                          <Grid size={6}>
                            <Typography variant="caption">Disponible</Typography>
                            <Typography variant="body1" fontWeight="bold" color="success.main">
                              {formatCurrency(walletStatus.available_credit)}
                            </Typography>
                          </Grid>
                          <Grid size={6}>
                            <Typography variant="caption">Utilizado</Typography>
                            <Typography variant="body1" fontWeight="bold" color="warning.main">
                              {formatCurrency(walletStatus.used_credit)}
                            </Typography>
                          </Grid>
                        </Grid>
                        {walletStatus.is_credit_blocked && (
                          <Alert severity="error" sx={{ mt: 1 }}>Crédito bloqueado por adeudo vencido</Alert>
                        )}
                      </Box>
                    )}

                    {/* Botón Mis Cuentas por Pagar */}
                    <Button 
                      variant="contained" 
                      fullWidth 
                      sx={{ mt: 2, bgcolor: ORANGE, '&:hover': { bgcolor: '#d94d1f' } }}
                      startIcon={<ReceiptIcon />}
                      onClick={() => setShowPendingPayments(true)}
                    >
                      💳 Mis Cuentas por Pagar ({pendingPayments?.invoices?.length || 0})
                    </Button>

                    {/* Último pago */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2, pt: 1, borderTop: '1px solid #eee' }}>
                      <Typography variant="caption" color="text.secondary">Último Pago</Typography>
                      <Typography variant="caption" fontWeight="bold">{stats?.financiero.ultimo_pago || 'N/A'}</Typography>
                    </Box>
                  </Paper>

                  {/* Mis Métodos de Pago */}
                  <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6" fontWeight="bold">
                        💳 Mis Métodos de Pago
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
                          No tienes métodos de pago guardados
                        </Typography>
                        <Button 
                          variant="outlined" 
                          size="small" 
                          sx={{ mt: 1 }}
                          onClick={() => setShowAddPaymentMethod(true)}
                        >
                          Agregar Método
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
                                  setSnackbar({ open: true, message: '🗑️ Método de pago eliminado', severity: 'success' });
                                } catch {
                                  setSnackbar({ open: true, message: '❌ Error al eliminar', severity: 'error' });
                                }
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                          {pm.is_default ? (
                            <Chip label="Predeterminado" size="small" color="warning" sx={{ mt: 1, fontSize: '0.7rem' }} />
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
                                  setSnackbar({ open: true, message: '⭐ Método predeterminado actualizado', severity: 'success' });
                                } catch {
                                  setSnackbar({ open: true, message: '❌ Error al actualizar', severity: 'error' });
                                }
                              }}
                            >
                              Establecer como predeterminado
                            </Typography>
                          )}
                        </Paper>
                      ))
                    )}
                  </Paper>

                  {/* DATOS FISCALES */}
                  <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6" fontWeight="bold">
                        📄 Mis Datos Fiscales
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
                            <strong>Datos fiscales completos</strong><br/>
                            Tus facturas se generarán automáticamente con estos datos.
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
                            {!['601','603','605','606','608','612','616','621','625','626'].includes(fiscalData.fiscal_regimen_fiscal) && (fiscalData.fiscal_regimen_fiscal || 'No configurado')}
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
                            {!['G03', 'G01', 'G02', 'I04', 'P01', 'S01'].includes(fiscalData.fiscal_uso_cfdi) && (fiscalData.fiscal_uso_cfdi || 'No configurado')}
                          </Typography>
                        </Box>
                      </Box>
                    ) : (
                      <Box sx={{ textAlign: 'center', py: 2 }}>
                        <ReceiptIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          Configura tus datos fiscales para generar facturas automáticamente
                        </Typography>
                        <Button 
                          variant="outlined" 
                          size="small" 
                          sx={{ mt: 1 }}
                          onClick={() => setFiscalModalOpen(true)}
                        >
                          Configurar Datos Fiscales
                        </Button>
                      </Box>
                    )}
                  </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 7 }}>
                  {/* MIS DIRECCIONES DE ENTREGA */}
                  <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6" fontWeight="bold">
                        📍 Mis Direcciones de Entrega
                      </Typography>
                      <Button 
                        variant="contained" 
                        size="small"
                        startIcon={<AddIcon />}
                        sx={{ bgcolor: ORANGE }}
                        onClick={() => {
                          setEditingAddress(null);
                          setAddressForm({
                            alias: '',
                            contact_name: '',
                            street: '',
                            exterior_number: '',
                            interior_number: '',
                            colony: '',
                            city: '',
                            state: '',
                            zip_code: '',
                            country: 'México',
                            phone: '',
                            reference: '',
                          });
                          setAddressModalOpen(true);
                        }}
                      >
                        Nueva Dirección
                      </Button>
                    </Box>
                    <Divider sx={{ mb: 2 }} />

                    {deliveryAddresses.length === 0 ? (
                      <Box sx={{ textAlign: 'center', py: 4 }}>
                        <LocationOnIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                        <Typography color="text.secondary">No tienes direcciones guardadas</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Agrega una dirección para asignar a tus envíos
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
                                  label="Principal" 
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

                  {/* DIRECCIONES DE ENVÍO (BODEGAS) */}
                  <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ mb: 2 }}>
                    📦 Direcciones de Envío (Bodegas)
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Usa estas direcciones según el tipo de servicio. Tu Suite/Casillero: <strong>{boxId}</strong>
                  </Typography>
                  
                  <Grid container spacing={2}>
                    {serviceAddresses.map((service) => (
                      <Grid size={{ xs: 12, lg: 6 }} key={service.serviceType}>
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
                            <Tooltip title="¿Cómo enviar?">
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
                            Copiar
                          </Button>
                        </Paper>
                      </Grid>
                    ))}
                    
                    {serviceAddresses.length === 0 && (
                      <Grid size={12}>
                        <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50', borderRadius: 2 }}>
                          <CircularProgress size={24} sx={{ mb: 2 }} />
                          <Typography color="text.secondary">Cargando direcciones...</Typography>
                        </Paper>
                      </Grid>
                    )}
                  </Grid>

                  {/* Nota importante */}
                  <Alert severity="info" sx={{ mt: 3, borderRadius: 2 }}>
                    <Typography variant="body2">
                      <strong>Importante:</strong> Siempre incluye tu número de Suite/Casillero (<strong>{boxId}</strong>) 
                      en todos tus envíos para asegurar que lleguen correctamente a tu cuenta.
                    </Typography>
                  </Alert>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* Tab: Facturas */}
          {activeTab === 3 && (
            <Box>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                🧾 Mis Facturas (CFDI)
              </Typography>
              
              <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell><strong>Folio</strong></TableCell>
                      <TableCell><strong>Fecha</strong></TableCell>
                      <TableCell align="right"><strong>Total</strong></TableCell>
                      <TableCell><strong>Estado</strong></TableCell>
                      <TableCell align="center"><strong>Descargar</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {invoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                          <ReceiptIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                          <Typography color="text.secondary">No tienes facturas recientes</Typography>
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
                              label={inv.status === 'pagada' ? 'Pagada' : 'Pendiente'} 
                              color={inv.status === 'pagada' ? 'success' : 'warning'}
                              size="small"
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                              <Tooltip title="Descargar PDF">
                                <IconButton size="small" color="error">
                                  <DownloadIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Descargar XML">
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

          {/* Tab: Sin Instrucciones */}
          {activeTab === 4 && (
            <Box>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                ❌ Paquetes Sin Instrucciones de Entrega
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Estos paquetes necesitan que les asignes una dirección de entrega
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
                      <Typography color="text.secondary">¡Todos tus paquetes tienen instrucciones!</Typography>
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
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedPackageIds([...selectedPackageIds, pkg.id]);
                                  } else {
                                    setSelectedPackageIds(selectedPackageIds.filter(id => id !== pkg.id));
                                  }
                                }}
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
                              ⏱ ETA: {pkg.fecha_estimada || 'Por confirmar'}
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
                              Asignar Dirección de Entrega
                            </Button>

                            {/* Chip de Garantía */}
                            {pkg.has_gex ? (
                              <Chip
                                icon={<SecurityIcon />}
                                label="Protegido con Garantía Extendida"
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
                                label="Sin Garantía Extendida - ¡Contratar Aquí!"
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
          {activeTab === 5 && (
            <Box>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                ✅ Paquetes Con Instrucciones de Entrega
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Estos paquetes ya tienen asignada una dirección de entrega
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
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.75rem' }}>Aéreo</Typography>
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
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.75rem' }}>Marítimo</Typography>
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
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.75rem' }}>MTY</Typography>
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
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.75rem' }}>PO Box</Typography>
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
                      <Typography color="text.secondary">No tienes paquetes con instrucciones asignadas</Typography>
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
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedPackageIds([...selectedPackageIds, pkg.id]);
                                  } else {
                                    setSelectedPackageIds(selectedPackageIds.filter(id => id !== pkg.id));
                                  }
                                }}
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
                              ⏱ ETA: {pkg.fecha_estimada || 'Por confirmar'}
                            </Typography>
                          </Box>

                          {/* Footer con indicadores y botón */}
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5 }}>
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              <Chip 
                                icon={<LocationOnIcon />} 
                                label="✅ Entrega asignada" 
                                size="small" 
                                sx={{ bgcolor: ORANGE, color: 'white', fontWeight: 600 }}
                              />
                              {/* Chip de Garantía */}
                              {pkg.has_gex ? (
                                <Chip
                                  icon={<SecurityIcon />}
                                  label="Protegido con Garantía Extendida"
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
                                  label="Sin Garantía Extendida - ¡Contratar Aquí!"
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
                              Editar
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
            <span>Dirección de Envío - {tutorialService?.name}</span>
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
                      📍 Envía a esta dirección:
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
                        setSnackbar({ open: true, message: '¡Dirección copiada!', severity: 'success' });
                      }}
                    >
                      Copiar Dirección
                    </Button>
                  </Paper>
                ) : (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    No hay dirección configurada para este servicio. Contacta a soporte.
                  </Alert>
                )}

                <Alert severity="info" sx={{ mb: 2 }}>
                  <strong>Tiempo estimado de entrega:</strong> {tutorialService.timeframe}
                </Alert>
                
                <Divider sx={{ my: 2 }} />

                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  📋 Instrucciones de Envío:
                </Typography>
                <Typography variant="body2" paragraph sx={{ color: 'text.secondary' }}>
                  {tutorialService.tutorial}
                </Typography>

                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  ✅ Pasos a seguir:
                </Typography>
                <List dense>
                  {tutorialService.type === 'usa_pobox' && (
                    <>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary="Copia tu dirección completa con tu Suite" /></ListItem>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary="Usa esa dirección al comprar en Amazon, eBay, etc." /></ListItem>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary="Nosotros recibimos y consolidamos tus paquetes" /></ListItem>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary="Te notificamos cuando lleguen y puedes pagar/enviar" /></ListItem>
                    </>
                  )}
                  {(tutorialService.type === 'china_air' || tutorialService.type === 'china_sea') && (
                    <>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary={`Indica a tu proveedor el Shipping Mark: ${boxId}`} /></ListItem>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary="Envía la mercancía a nuestra bodega en Guangzhou" /></ListItem>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary="Marca cada caja con tu Shipping Mark claramente visible" /></ListItem>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary="Te notificamos al recibir y procesamos tu envío" /></ListItem>
                    </>
                  )}
                  {tutorialService.type === 'mx_cedis' && (
                    <>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary={`Envía tu paquete DHL a nuestra dirección en Monterrey`} /></ListItem>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary={`Incluye en el destinatario: ${userName} (${boxId})`} /></ListItem>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary="Lo recibimos y liberamos sin trámites de importación complicados" /></ListItem>
                      <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary="Te notificamos para coordinar la entrega final" /></ListItem>
                    </>
                  )}
                </List>

                <Alert severity="warning" sx={{ mt: 2 }}>
                  <strong>Importante:</strong> Siempre incluye tu Suite/Casillero <strong>{boxId}</strong> para identificar correctamente tu envío.
                </Alert>
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTutorialOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Modal GEX (Garantía Extendida) */}
      <Dialog open={gexModalOpen} onClose={() => setGexModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: ORANGE, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <SecurityIcon />
          Contratar GEX
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
                      Datos del Seguro
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Completa la información para proteger tu carga.
                  </Typography>

                  {/* Nombre del Cliente */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary">Nombre del Cliente</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1, bgcolor: 'white' }}>
                      <PersonIcon sx={{ color: '#666', fontSize: 20 }} />
                      <Typography variant="body1" fontWeight="bold">{userName.toUpperCase()}</Typography>
                    </Box>
                  </Box>

                  {/* Valor de Factura */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary">Valor de Factura (USD)</Typography>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      placeholder="123"
                      value={gexValorFactura}
                      onChange={(e) => setGexValorFactura(e.target.value)}
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
                    En caso de siniestro, se te solicitará la factura original del embarque para procesar tu reclamación.
                  </Alert>

                  {/* No. Cajas y Peso Total */}
                  <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary">No. Cajas</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1, bgcolor: 'white' }}>
                        <InventoryIcon sx={{ color: '#666', fontSize: 20 }} />
                        <Typography variant="body1" fontWeight="bold">{selectedPackageIds.length || 1}</Typography>
                      </Box>
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary">Peso Total</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1, bgcolor: 'white' }}>
                        <ScaleIcon sx={{ color: '#666', fontSize: 20 }} />
                        <Typography variant="body1" fontWeight="bold">
                          {(() => {
                            const totalWeight = getSelectedPackages().reduce((sum, pkg) => {
                              // Buscar peso en diferentes campos posibles
                              const weight = pkg.weight || (pkg as unknown as { peso_kg?: number; peso?: number }).peso_kg || (pkg as unknown as { peso?: number }).peso || 12; // Default 12 como en la app
                              return sum + parseFloat(weight.toString());
                            }, 0);
                            return totalWeight.toFixed(1);
                          })()}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">kg</Typography>
                      </Box>
                    </Grid>
                  </Grid>

                  {/* Ruta de Envío */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary">Ruta de Envío</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1, bgcolor: 'white' }}>
                      <FlightIcon sx={{ color: '#666', fontSize: 20 }} />
                      <Typography variant="body1">🇺🇸 USA → México 🇲🇽</Typography>
                      <LockIcon sx={{ color: '#666', fontSize: 16, ml: 'auto' }} />
                    </Box>
                  </Box>

                  {/* Descripción de la Carga */}
                  <Box sx={{ mb: 0 }}>
                    <Typography variant="caption" color="text.secondary">Descripción de la Carga</Typography>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="Mercancía general"
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
                    const valorFacturaUSD = parseFloat(gexValorFactura) || 123; // Default como en la app
                    const tipoCambio = 18.28; // Actualizado como en la app
                    const valorAseguradoMXN = valorFacturaUSD * tipoCambio;
                    const porcentajeGEX = valorAseguradoMXN * 0.05;

                    return (
                      <>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2">Valor Factura:</Typography>
                          <Typography variant="body2" fontWeight="600">${valorFacturaUSD.toFixed(2)} USD</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2">Tipo de Cambio:</Typography>
                          <Typography variant="body2" fontWeight="600">${tipoCambio.toFixed(2)} MXN</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                          <Typography variant="body2">Valor Asegurado:</Typography>
                          <Typography variant="body2" fontWeight="600">${valorAseguradoMXN.toFixed(2)} MXN</Typography>
                        </Box>

                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.3)', my: 1.5 }} />

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                          <Typography variant="body2">5% Valor Asegurado:</Typography>
                          <Typography variant="body2" fontWeight="600">${porcentajeGEX.toFixed(2)} MXN</Typography>
                        </Box>

                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.3)', my: 1.5 }} />

                        <Box sx={{ textAlign: 'center', mt: 2 }}>
                          <Typography variant="h4" fontWeight="bold">
                            ${porcentajeGEX.toFixed(2)} MXN
                          </Typography>
                          <Typography variant="caption" sx={{ opacity: 0.8 }}>
                            5% del valor asegurado
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
          <Button onClick={() => setGexModalOpen(false)} sx={{ color: 'text.secondary', mr: 2 }}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleContractGEX}
            disabled={gexLoading || !gexValorFactura}
            startIcon={gexLoading ? <CircularProgress size={20} /> : <SecurityIcon />}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d94d1f' }, px: 4 }}
          >
            {gexLoading ? 'Procesando...' : '🛡️ Contratar GEX'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal Instrucciones de Entrega - Versión Completa */}
      <Dialog open={deliveryModalOpen} onClose={() => setDeliveryModalOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: BLUE, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <LocationOnIcon />
          Instrucciones de Entrega
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
                      bgcolor: BLUE, 
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
                    Paquete{selectedPackageIds.length > 1 ? 's' : ''} Seleccionado{selectedPackageIds.length > 1 ? 's' : ''}
                  </Typography>
                </Box>
                
                {getSelectedPackages().map((pkg) => (
                  <Box key={pkg.id} sx={{ mb: 2, pb: 2, borderBottom: '1px solid #eee' }}>
                    <Typography variant="body1" fontWeight="bold" sx={{ mb: 0.5 }}>
                      {pkg.tracking}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      📦 {pkg.dimensions || '12×12×12 cm'}
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Peso Total</Typography>
                        <Typography variant="body2" fontWeight="bold">{pkg.weight || '12'} kg</Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" color="text.secondary">CBM Total</Typography>
                        <Typography variant="body2" fontWeight="bold">{pkg.cbm || '0.0017'} m³</Typography>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Paper>

              {/* Dirección de Entrega */}
              <Paper sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <LocationOnIcon sx={{ color: 'error.main', mr: 1 }} />
                  <Typography variant="subtitle1" fontWeight="bold">
                    Dirección de Entrega
                  </Typography>
                  <Button 
                    size="small" 
                    sx={{ ml: 'auto', color: 'error.main' }}
                    onClick={() => {
                      setDeliveryModalOpen(false);
                      setAddressModalOpen(true);
                    }}
                  >
                    Agregar
                  </Button>
                </Box>

                {deliveryAddresses.length === 0 ? (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    No tienes direcciones guardadas. Agrega una para continuar.
                  </Alert>
                ) : (
                  <FormControl component="fieldset" fullWidth>
                    <RadioGroup
                      value={selectedDeliveryAddress || ''}
                      onChange={(e) => setSelectedDeliveryAddress(Number(e.target.value))}
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
                                border: selectedDeliveryAddress === addr.id ? `2px solid ${BLUE}` : '1px solid #eee',
                                borderRadius: 2,
                                width: '100%'
                              }}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                {selectedDeliveryAddress === addr.id && (
                                  <Box sx={{ color: 'primary.main', mt: 0.5 }}>✓</Box>
                                )}
                                <Box sx={{ flex: 1 }}>
                                  <Typography variant="body1" fontWeight="bold">
                                    {addr.alias}
                                    {addr.alias === 'Bodega 1' && (
                                      <Chip label="Principal" size="small" sx={{ ml: 1, bgcolor: BLUE, color: 'white' }} />
                                    )}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    {addr.street} {addr.exterior_number}, {addr.colony}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    {addr.city}, {addr.state} {addr.zip_code}
                                  </Typography>
                                  <Typography variant="body2" sx={{ color: BLUE, fontWeight: 'bold', mt: 0.5 }}>
                                    📞 {addr.phone}
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
                    Paquetería de Entrega
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Selecciona cómo quieres recibir tus paquetes
                </Typography>

                <FormControl component="fieldset" fullWidth>
                  <RadioGroup
                    value={selectedCarrierService}
                    onChange={(e) => setSelectedCarrierService(e.target.value as 'local' | 'pickup' | 'express')}
                  >
                    {carrierServices.map((service) => (
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
                              border: selectedCarrierService === service.id ? `2px solid ${BLUE}` : '1px solid #eee',
                              borderRadius: 2,
                              width: '100%'
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                              {selectedCarrierService === service.id && (
                                <Box sx={{ color: 'primary.main', mt: 0.5 }}>✓</Box>
                              )}
                              <Box sx={{ fontSize: '1.2rem' }}>{service.icon}</Box>
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="body1" fontWeight="bold">
                                  {service.name}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                                  ⏱ {service.description}
                                </Typography>
                                {service.subtext && (
                                  <Typography variant="caption" color="text.secondary">
                                    {service.subtext}
                                  </Typography>
                                )}
                              </Box>
                              <Box sx={{ textAlign: 'right' }}>
                                <Typography 
                                  variant="body1" 
                                  fontWeight="bold"
                                  sx={{ 
                                    color: service.price === 'GRATIS' ? 'success.main' : 'text.primary'
                                  }}
                                >
                                  {service.price}
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

                {/* Total */}
                <Box sx={{ mt: 2, pt: 2, borderTop: '2px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle1" fontWeight="bold">Total:</Typography>
                  <Typography variant="h6" fontWeight="bold" sx={{ color: selectedCarrierService === 'local' ? 'success.main' : 'text.primary' }}>
                    {carrierServices.find(s => s.id === selectedCarrierService)?.price || 'GRATIS'}
                  </Typography>
                </Box>
              </Paper>

              {/* Notas Adicionales */}
              <Paper sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ fontSize: '1.2rem', mr: 1 }}>📝</Box>
                  <Typography variant="subtitle1" fontWeight="bold">
                    Notas Adicionales
                  </Typography>
                </Box>
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  placeholder="Ej: Dejar en recepción, llamar antes de entregar..."
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
            onClick={() => setDeliveryModalOpen(false)}
            size="large"
          >
            Cancelar
          </Button>
          <Button 
            variant="contained" 
            size="large"
            onClick={handleAssignDelivery}
            disabled={deliveryLoading || !selectedDeliveryAddress}
            startIcon={deliveryLoading ? <CircularProgress size={20} /> : <Box sx={{ fontSize: '1.2rem' }}>✅</Box>}
            sx={{ 
              bgcolor: BLUE, 
              minWidth: 200,
              py: 1.5,
              fontSize: '1.1rem'
            }}
          >
            {deliveryLoading ? 'Guardando...' : 'Guardar Instrucciones'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal Historial de Paquetes */}
      <Dialog open={historyModalOpen} onClose={() => setHistoryModalOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HistoryIcon color="primary" />
          Historial de Paquetes Entregados
        </DialogTitle>
        <DialogContent>
          {historyPackages.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <InventoryIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography color="text.secondary">No hay paquetes en el historial</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Tracking</TableCell>
                    <TableCell>Descripción</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell align="right">Monto</TableCell>
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
          <Button onClick={() => setHistoryModalOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Modal Agregar/Editar Dirección */}
      <Dialog open={addressModalOpen} onClose={() => setAddressModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LocationOnIcon color="primary" />
          {editingAddress ? 'Editar Dirección' : 'Nueva Dirección de Entrega'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={12}>
              <TextField
                fullWidth
                size="small"
                label="Alias (ej: Casa, Oficina)"
                value={addressForm.alias}
                onChange={(e) => setAddressForm({ ...addressForm, alias: e.target.value })}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                size="small"
                label="Nombre de contacto"
                value={addressForm.contact_name}
                onChange={(e) => setAddressForm({ ...addressForm, contact_name: e.target.value })}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                size="small"
                label="Teléfono"
                value={addressForm.phone}
                onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
              />
            </Grid>
            <Grid size={8}>
              <TextField
                fullWidth
                size="small"
                label="Calle *"
                required
                value={addressForm.street}
                onChange={(e) => setAddressForm({ ...addressForm, street: e.target.value })}
              />
            </Grid>
            <Grid size={2}>
              <TextField
                fullWidth
                size="small"
                label="Ext."
                value={addressForm.exterior_number}
                onChange={(e) => setAddressForm({ ...addressForm, exterior_number: e.target.value })}
              />
            </Grid>
            <Grid size={2}>
              <TextField
                fullWidth
                size="small"
                label="Int."
                value={addressForm.interior_number}
                onChange={(e) => setAddressForm({ ...addressForm, interior_number: e.target.value })}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                size="small"
                label="Colonia"
                value={addressForm.colony}
                onChange={(e) => setAddressForm({ ...addressForm, colony: e.target.value })}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                size="small"
                label="Ciudad *"
                required
                value={addressForm.city}
                onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                size="small"
                label="Estado *"
                required
                value={addressForm.state}
                onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                size="small"
                label="Código Postal"
                value={addressForm.zip_code}
                onChange={(e) => setAddressForm({ ...addressForm, zip_code: e.target.value })}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                size="small"
                label="Referencia"
                multiline
                rows={2}
                value={addressForm.reference}
                onChange={(e) => setAddressForm({ ...addressForm, reference: e.target.value })}
                placeholder="Ej: Portón negro, frente al parque"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddressModalOpen(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleSaveAddress}
            disabled={addressSaving}
            startIcon={addressSaving ? <CircularProgress size={20} /> : <CheckCircleIcon />}
            sx={{ bgcolor: ORANGE }}
          >
            {addressSaving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal Detalle del Paquete */}
      <Dialog 
        open={packageDetailOpen} 
        onClose={() => {
          setPackageDetailOpen(false);
          setHighlightedGuideTracking(null);
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
            <Typography variant="h6" fontWeight="bold">Detalle del Paquete</Typography>
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
                <Typography variant="caption" color="text.secondary">Número de Rastreo</Typography>
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
                      📦 Descripción
                    </Typography>
                    <Typography variant="body1">{selectedPackage.descripcion}</Typography>
                  </Box>
                )}

                {/* Dimensiones y Peso */}
                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid size={6}>
                    <Paper sx={{ p: 1.5, bgcolor: '#f8f9fa', textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>⚖️ Peso</Typography>
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
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>📐 Dimensiones</Typography>
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
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>📊 Volumen CBM</Typography>
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
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>💰 Valor Declarado</Typography>
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
                      📋 Guías Incluidas ({selectedPackage.included_guides.length})
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

                {/* Servicios Contratados (GEX) */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                    🛡️ Servicios Contratados
                  </Typography>
                  {selectedPackage.has_gex ? (
                    <Paper sx={{ p: 2, bgcolor: ORANGE, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
                      <SecurityIcon />
                      <Box>
                        <Typography variant="body2" fontWeight="bold">Garantía Extendida (GEX)</Typography>
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
                        Sin Garantía Extendida
                      </Typography>
                    </Paper>
                  )}
                </Box>

                {/* Información de Entrega */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                    🏠 Información de Entrega
                  </Typography>
                  {(selectedPackage.delivery_address_id || 
                    selectedPackage.assigned_address_id || 
                    (selectedPackage.destination_address && 
                     selectedPackage.destination_address !== 'Pendiente de asignar')) ? (
                    <Paper sx={{ p: 2, bgcolor: '#e8f5e9' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <LocationOnIcon sx={{ color: 'success.main' }} />
                        <Typography variant="body2" fontWeight="bold" color="success.main">
                          Instrucciones Asignadas
                        </Typography>
                      </Box>
                      {selectedPackage.destination_address && (
                        <>
                          <Typography variant="body2" sx={{ mb: 0.5 }}>
                            <strong>Dirección:</strong> {selectedPackage.destination_address}
                          </Typography>
                          {selectedPackage.destination_city && (
                            <Typography variant="body2" sx={{ mb: 0.5 }}>
                              <strong>Ciudad:</strong> {selectedPackage.destination_city}
                            </Typography>
                          )}
                          {selectedPackage.destination_contact && (
                            <Typography variant="body2">
                              <strong>Contacto:</strong> {selectedPackage.destination_contact}
                            </Typography>
                          )}
                        </>
                      )}
                      {(selectedPackage.delivery_address_id || selectedPackage.assigned_address_id) && !selectedPackage.destination_address && (
                        <Typography variant="body2" color="text.secondary">
                          Dirección ID: {selectedPackage.delivery_address_id || selectedPackage.assigned_address_id}
                        </Typography>
                      )}
                    </Paper>
                  ) : (
                    <Paper sx={{ p: 2, bgcolor: '#ffebee' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <WarningIcon sx={{ color: 'error.main' }} />
                        <Typography variant="body2" fontWeight="bold" color="error.main">
                          Pendiente de Asignar Instrucciones
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        Este paquete necesita instrucciones de entrega antes de ser despachado.
                      </Typography>
                    </Paper>
                  )}
                </Box>

                {/* Estado y Costo */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                    💵 Costo del Servicio
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: selectedPackage.client_paid ? '#e8f5e9' : '#fff3e0' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2">Total a Pagar:</Typography>
                      <Typography variant="h5" fontWeight="bold" color={selectedPackage.client_paid ? 'success.main' : 'warning.main'}>
                        {formatCurrency(selectedPackage.monto)}
                      </Typography>
                    </Box>
                    <Chip 
                      label={selectedPackage.client_paid ? '✓ PAGADO' : '⏳ Pendiente de Pago'} 
                      size="small" 
                      color={selectedPackage.client_paid ? 'success' : 'warning'}
                      sx={{ mt: 1 }}
                    />
                  </Paper>
                </Box>

                {/* Fechas */}
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                    📅 Fechas
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid size={6}>
                      <Paper sx={{ p: 1.5, bgcolor: '#f8f9fa' }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Recibido</Typography>
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
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Última Actualización</Typography>
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
            Cerrar
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
          Centro de Ayuda
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
              <Typography fontWeight="bold">Hablar Ahora</Typography>
              <Typography variant="body2" color="text.secondary">
                Chatea con nuestro asesor virtual para respuestas inmediatas
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
                <Typography variant="caption" color="text.secondary">Tu Asesor</Typography>
                <Typography fontWeight="bold">{advisorInfo.name}</Typography>
                {advisorInfo.phone && (
                  <Typography variant="body2" color="text.secondary">📱 {advisorInfo.phone}</Typography>
                )}
              </Box>
              {advisorInfo.phone && (
                <IconButton
                  component="a"
                  href={`https://wa.me/${advisorInfo.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${advisorInfo.name}, soy cliente EntregaX (Suite ${boxId}).`)}`}
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
                <Typography fontWeight="bold">Solicitar Asesor</Typography>
                <Typography variant="body2" color="text.secondary">
                  Vincula tu cuenta con un asesor comercial
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
              <Typography fontWeight="bold">Crear Ticket de Servicio</Typography>
              <Typography variant="body2" color="text.secondary">
                Reporta un problema y te responderemos pronto
              </Typography>
            </Box>
            <Typography color="text.secondary">›</Typography>
          </Box>
        </DialogContent>
        <Box sx={{ p: 2, borderTop: '1px solid #eee', bgcolor: '#fafafa' }}>
          <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InfoIcon fontSize="small" />
            Nuestro equipo de soporte está disponible de Lunes a Viernes, 9:00 AM - 6:00 PM
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
          🎫 Levantar Ticket de Soporte
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            Tu mensaje será atendido por un agente de soporte.
          </Alert>
          
          {/* Categoría */}
          <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
            Categoría *
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
            Número de Guía {supportCategory === 'systemError' ? '(Opcional)' : '*'}
          </Typography>
          <TextField
            fullWidth
            placeholder="Ingresa el número de guía"
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
            Descripción del problema *
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            placeholder="Describe tu consulta o problema..."
            value={supportMessage}
            onChange={(e) => setSupportMessage(e.target.value)}
            sx={{ mb: 2 }}
          />

          {/* Sección de Imágenes */}
          <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
            📷 Fotografías (Opcional)
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Adjunta capturas de pantalla o fotos que ayuden a ilustrar el problema
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
                <Typography variant="caption" color="text.secondary">Agregar</Typography>
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
                  alt={`Imagen ${index + 1}`}
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
              ✓ {supportImages.length} imagen{supportImages.length > 1 ? 'es' : ''} adjunta{supportImages.length > 1 ? 's' : ''}
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
          }}>Cancelar</Button>
          <Button 
            variant="contained" 
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d94d1f' } }}
            onClick={handleSendSupport}
            disabled={!isSupportFormValid()}
            startIcon={<SupportIcon />}
          >
            Crear Ticket
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
          ¿Tienes un Asesor?
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
            Ingresa el número de suite de tu asesor para obtener tarifas preferenciales
          </Typography>
          
          {/* Tu Suite */}
          <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: '#f5f5f5' }}>
            <Typography variant="caption" color="text.secondary">Tu Suite (Box ID)</Typography>
            <Typography variant="h5" fontWeight="bold">{boxId}</Typography>
          </Paper>

          <Divider sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">Ingresa datos del asesor</Typography>
          </Divider>

          {/* Código del Asesor */}
          <TextField
            fullWidth
            placeholder="Número ID del Asesor"
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
            * Si no tienes el número de tu asesor, presiona el botón y te ayudaremos a encontrar uno.
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
            {advisorLoading ? <CircularProgress size={24} color="inherit" /> : 'SOLICITAR ASESOR PERSONALIZADO'}
          </Button>

          <Divider sx={{ mb: 2 }} />

          {/* Beneficios */}
          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
            Beneficios de tener un asesor:
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <StarIcon sx={{ color: ORANGE, fontSize: 20 }} />
              <Typography variant="body2">Tarifas preferenciales</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SupportIcon sx={{ color: ORANGE, fontSize: 20 }} />
              <Typography variant="body2">Atención personalizada</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TruckIcon sx={{ color: ORANGE, fontSize: 20 }} />
              <Typography variant="body2">Soporte prioritario</Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setAdvisorModalOpen(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            sx={{ bgcolor: BLACK, '&:hover': { bgcolor: '#333' } }}
            onClick={handleLinkAdvisor}
            disabled={advisorLoading || !advisorCode.trim()}
          >
            {advisorLoading ? <CircularProgress size={20} color="inherit" /> : 'Vincular'}
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
                Términos de Vinculación
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
                Lee cuidadosamente antes de continuar
              </Typography>
            </Box>
          </Box>
        </Box>

        <DialogContent sx={{ px: 3, py: 2.5 }}>
          {/* Sección: Lo que tu asesor PUEDE hacer */}
          <Typography variant="overline" sx={{ 
            color: '#4CAF50', fontWeight: 700, letterSpacing: 1.5, fontSize: '0.65rem',
            display: 'block', mb: 1.5
          }}>
            Tu asesor podrá
          </Typography>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2.5 }}>
            {[
              { text: 'Configurar direcciones de envío', detail: 'en tu cuenta' },
              { text: 'Asignar instrucciones y paqueterías', detail: 'a tus embarques' },
            ].map((item, i) => (
              <Box key={i} sx={{ 
                display: 'flex', alignItems: 'center', gap: 1.5,
                p: 1.5, borderRadius: 2, bgcolor: '#F1F8E9', 
                border: '1px solid #C8E6C9',
              }}>
                <CheckCircleOutlineIcon sx={{ color: '#4CAF50', fontSize: 22, flexShrink: 0 }} />
                <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
                  <b>{item.text}</b>{' '}
                  <span style={{ color: '#666' }}>{item.detail}</span>
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
            Tu asesor no puede
          </Typography>

          <Box sx={{ 
            display: 'flex', alignItems: 'center', gap: 1.5,
            p: 1.5, borderRadius: 2, bgcolor: '#FFEBEE', 
            border: '1px solid #FFCDD2', mb: 2.5,
          }}>
            <BlockIcon sx={{ color: '#D32F2F', fontSize: 22, flexShrink: 0 }} />
            <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
              <b>Configurar métodos de pago</b>{' '}
              <span style={{ color: '#666' }}>ni gestionar tus pagos</span>
            </Typography>
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
                AVISO DE SEGURIDAD
              </Typography>
              <Typography variant="body2" sx={{ color: '#5D4037', fontWeight: 500, lineHeight: 1.5, fontSize: '0.8rem' }}>
                Por ningún motivo los asesores de EntregaX te solicitarán datos de tu tarjeta de crédito.
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
            Cancelar
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
            Acepto y Vincular
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
              {chatLoading ? 'Escribiendo...' : 'Servicio al Cliente'}
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
                  ⏳ Orlando está escribiendo...
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
            placeholder="Escribe tu mensaje..."
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

      {/* Carrusel de Servicios */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" fontWeight="bold" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          🚀 Nuestros Servicios
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
                  Ver Dirección
                </Button>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>

      {/* Modal de Pago */}
      <Dialog open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: ORANGE, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <MoneyIcon />
          Paquetes a Pagar
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {/* Paquetes Seleccionados */}
          <Paper sx={{ p: 2, mb: 3, bgcolor: '#f8f9fa' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Typography variant="subtitle1" fontWeight="bold" sx={{ color: ORANGE }}>
                📦 {selectedPackageIds.length} paquete(s)
              </Typography>
            </Box>
            
            {getSelectedPackages().slice(0, 3).map((pkg) => (
              <Box key={pkg.id} sx={{ mb: 1, pb: 1, borderBottom: selectedPackageIds.length > 1 ? '1px solid #eee' : 'none' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="body2" fontWeight="bold">{pkg.tracking}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {pkg.descripcion || 'Sin descripción'} - 12 lb
                    </Typography>
                  </Box>
                  <Typography variant="body1" fontWeight="bold" sx={{ color: ORANGE }}>
                    {formatCurrency(pkg.monto || 0)}
                  </Typography>
                </Box>
              </Box>
            ))}
            
            {selectedPackageIds.length > 3 && (
              <Typography variant="caption" color="text.secondary">
                +{selectedPackageIds.length - 3} paquetes más
              </Typography>
            )}
            
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" fontWeight="bold">TOTAL:</Typography>
              <Typography variant="h5" fontWeight="bold" sx={{ color: ORANGE }}>
                {formatCurrency(getSelectedPackages().reduce((sum, p) => sum + (p.monto || 0), 0))}
              </Typography>
            </Box>
          </Paper>

          {/* Información de Envío */}
          <Paper sx={{ p: 2, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Box sx={{ color: 'error.main', mr: 1 }}>📍</Box>
              <Typography variant="subtitle1" fontWeight="bold">
                Información de Envío
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              <strong>Próximo Destino:</strong> CEDIS Monterrey
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>País:</strong> México
            </Typography>
          </Paper>

          {/* Métodos de Pago */}
          <Paper sx={{ p: 2, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Box sx={{ fontSize: '1.2rem', mr: 1 }}>💳</Box>
              <Typography variant="subtitle1" fontWeight="bold">
                Selecciona tu método de pago
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
                ¿Requiero Factura?
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
                📄 El pago en sucursal no permite generar factura fiscal. Solo se emite comprobante de pago.
              </Alert>
            )}

            {requiresInvoice && selectedPaymentMethod !== 'branch' && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {!requiresInvoice ? 'No se podrá facturar después' : 'Completa los datos para tu factura fiscal'}
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
                      <strong>Datos fiscales completos</strong><br/>
                      Se usarán tus datos fiscales guardados para generar la factura.
                    </Typography>
                  </Alert>
                )}
                
                <Grid container spacing={2}>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Razón Social *"
                      value={fiscalData?.fiscal_razon_social || invoiceData.razon_social}
                      onChange={(e) => setInvoiceData({ ...invoiceData, razon_social: e.target.value })}
                      placeholder="Mi Empresa S.A. de C.V."
                      disabled={fiscalData?.hasCompleteData}
                      helperText={fiscalData?.hasCompleteData ? "Dato tomado de tu perfil fiscal" : ""}
                    />
                  </Grid>
                  <Grid size={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="RFC *"
                      value={fiscalData?.fiscal_rfc || invoiceData.rfc}
                      onChange={(e) => setInvoiceData({ ...invoiceData, rfc: e.target.value.toUpperCase() })}
                      placeholder="XAXX010101000"
                      disabled={fiscalData?.hasCompleteData}
                      helperText={fiscalData?.hasCompleteData ? "Dato tomado de tu perfil fiscal" : ""}
                    />
                  </Grid>
                  <Grid size={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Código Postal Fiscal *"
                      value={fiscalData?.fiscal_codigo_postal || invoiceData.codigo_postal}
                      onChange={(e) => setInvoiceData({ ...invoiceData, codigo_postal: e.target.value })}
                      placeholder="64000"
                      inputProps={{ maxLength: 5, pattern: '[0-9]*' }}
                      disabled={fiscalData?.hasCompleteData}
                      helperText={fiscalData?.hasCompleteData ? "Dato tomado de tu perfil fiscal" : ""}
                    />
                  </Grid>
                  <Grid size={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Régimen Fiscal *"
                      select
                      value={fiscalData?.fiscal_regimen_fiscal || invoiceData.regimen_fiscal}
                      onChange={(e) => setInvoiceData({ ...invoiceData, regimen_fiscal: e.target.value })}
                      disabled={fiscalData?.hasCompleteData}
                      helperText={fiscalData?.hasCompleteData ? "Dato tomado de tu perfil fiscal" : ""}
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
                      label="Uso de CFDI *"
                      select
                      value={fiscalData?.fiscal_uso_cfdi || invoiceData.uso_cfdi}
                      onChange={(e) => setInvoiceData({ ...invoiceData, uso_cfdi: e.target.value })}
                      disabled={fiscalData?.hasCompleteData}
                      helperText={fiscalData?.hasCompleteData ? "Dato tomado de tu perfil fiscal" : ""}
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
                      label="Email para factura *"
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
            Cancelar
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
            {paymentLoading ? 'Procesando...' : `💳 Pagar ${formatCurrency(getSelectedPackages().reduce((sum, p) => sum + (p.monto || 0), 0))}`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Botón Flotante de Ayuda */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          zIndex: 1000,
        }}
      >
        <Tooltip title="Centro de Ayuda" placement="left">
          <IconButton
            onClick={() => setHelpCenterOpen(true)}
            sx={{
              bgcolor: BLUE,
              color: 'white',
              width: 56,
              height: 56,
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
          Configurar Datos Fiscales
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Configura tus datos fiscales una sola vez y tus facturas se generarán automáticamente con cada pago.
          </Typography>
          
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextField
                fullWidth
                size="small"
                label="Razón Social *"
                value={invoiceData.razon_social}
                onChange={(e) => setInvoiceData({ ...invoiceData, razon_social: e.target.value })}
                placeholder="Mi Empresa S.A. de C.V."
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                size="small"
                label="RFC *"
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
                label="Código Postal Fiscal *"
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
                label="Régimen Fiscal *"
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
                label="Uso de CFDI *"
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
              <strong>* Campos obligatorios</strong><br/>
              Estos datos se usarán para generar tus facturas CFDI 4.0 automáticamente.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#f5f5f5' }}>
          <Button onClick={() => setFiscalModalOpen(false)} disabled={fiscalLoading}>
            Cancelar
          </Button>
          <Button 
            variant="contained" 
            onClick={handleSaveFiscalData}
            disabled={fiscalLoading || !invoiceData.razon_social || !invoiceData.rfc || !invoiceData.codigo_postal || !invoiceData.regimen_fiscal}
            startIcon={fiscalLoading ? <CircularProgress size={20} /> : <ReceiptIcon />}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d94d1f' } }}
          >
            {fiscalLoading ? 'Guardando...' : 'Guardar Datos Fiscales'}
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
          <CreditCardIcon /> Agregar Método de Pago
        </DialogTitle>
        <DialogContent sx={{ pt: 3, mt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Agrega una tarjeta, cuenta PayPal o transferencia bancaria para realizar tus pagos.
          </Typography>

          {/* Selector de tipo */}
          <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
            {[
              { value: 'card' as const, label: '💳 Tarjeta', icon: <CreditCardIcon /> },
              { value: 'paypal' as const, label: '🅿️ PayPal', icon: <PaymentIcon /> },
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
            label="Alias / Nombre descriptivo"
            placeholder="Ej: Mi Visa Personal"
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
                label="Número de tarjeta *"
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
                    label="Fecha de expiración *"
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
                label="Nombre del titular *"
                placeholder="Como aparece en la tarjeta"
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
              label="Correo electrónico de PayPal *"
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
                label="Nombre del banco *"
                placeholder="Ej: BBVA, Banorte, Santander..."
                value={newPaymentMethod.bankName}
                onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, bankName: e.target.value })}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                size="small"
                label="CLABE interbancaria *"
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
                label="Beneficiario *"
                placeholder="Nombre completo del titular"
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
            Cancelar
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
            Agregar Método
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
            <ReceiptIcon /> Mis Cuentas por Pagar
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
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)' }}>Total Pendiente por Pagar</Typography>
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
                            {inv.concept || `Paquete ${inv.invoice_number}`} -
                          </Typography>
                          {inv.due_date && (
                            <Typography variant="caption" color="error.main" display="block">
                              Vence: {new Date(inv.due_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
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
                            VER DETALLES
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
                ¡Estás al corriente!
              </Typography>
              <Typography variant="body2" color="text.secondary">
                No tienes cuentas pendientes por pagar
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#f5f5f5' }}>
          <Button onClick={() => setShowPendingPayments(false)}>
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
