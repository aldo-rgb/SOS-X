// ============================================
// DASHBOARD - CLIENTE
// Panel principal para Clientes con portal completo
// ============================================

import { useState, useEffect, useCallback } from 'react';
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
  Stepper,
  Step,
  StepLabel,
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
  ToggleButton,
  ToggleButtonGroup,
  Snackbar,
  Checkbox,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormControlLabel,
  Radio,
  RadioGroup,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
} from '@mui/material';
import {
  LocalShipping as ShippingIcon,
  Inventory as InventoryIcon,
  AttachMoney as MoneyIcon,
  Search as SearchIcon,
  CheckCircle as CheckCircleIcon,
  AccessTime as AccessTimeIcon,
  Flight as FlightIcon,
  DirectionsBoat as BoatIcon,
  LocalPostOffice as PostOfficeIcon,
  Home as HomeIcon,
  ContentCopy as CopyIcon,
  QrCode as QrCodeIcon,
  Calculate as CalculateIcon,
  AccountBalanceWallet as WalletIcon,
  Receipt as ReceiptIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  WhatsApp as WhatsAppIcon,
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
  ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';
import api from '../services/api';

const ORANGE = '#F05A28';
const GREEN = '#4CAF50';
const BLUE = '#2196F3';

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
  delivery_address_id?: number;
  assigned_address_id?: number;
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
  icon: React.ReactNode;
  gradient: string;
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
  { type: 'china_air', name: '✈️ Aéreo China', gradient: 'linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)', timeframe: '7-15 días', tutorial: 'Envía tus productos a nuestra bodega en Guangzhou. Incluye tu Shipping Mark en cada caja. Ideal para muestras y productos urgentes.' },
  { type: 'china_sea', name: '🚢 Marítimo China', gradient: 'linear-gradient(135deg, #00796B 0%, #26A69A 100%)', timeframe: '45-60 días', tutorial: 'Envía mercancía en volumen a nuestra bodega marítima. Incluye tu Shipping Mark. El mejor precio por CBM para inventario.' },
  { type: 'usa_pobox', name: '📦 PO Box USA', gradient: 'linear-gradient(135deg, #7B1FA2 0%, #BA68C8 100%)', timeframe: '5-7 días', tutorial: 'Usa esta dirección para compras en Amazon, eBay, Walmart USA. Tu Suite es tu identificador único. Consolidamos múltiples paquetes.' },
  { type: 'mx_cedis', name: '📍 DHL Monterrey', gradient: 'linear-gradient(135deg, #E65100 0%, #FFB74D 100%)', timeframe: '24-48 hrs', tutorial: 'Envía paquetes DHL a nuestro CEDIS en Monterrey. Incluye tu nombre y Suite. Liberación rápida sin trámites de importación.' },
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
  
  // Modal de tutorial de dirección
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialService, setTutorialService] = useState<typeof SERVICE_CONFIG[0] | null>(null);
  
  // Modal de soporte / chat
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportMessage, setSupportMessage] = useState('');
  
  // Snackbar para notificaciones
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'info' | 'warning' });

  // Selección de paquetes para consolidar/pagar
  const [selectedPackageIds, setSelectedPackageIds] = useState<number[]>([]);
  
  // Modal GEX (Garantía Extendida)
  const [gexModalOpen, setGexModalOpen] = useState(false);
  const [gexLoading, setGexLoading] = useState(false);
  
  // Modal Instrucciones de Entrega
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [deliveryAddresses, setDeliveryAddresses] = useState<DeliveryAddress[]>([]);
  const [selectedDeliveryAddress, setSelectedDeliveryAddress] = useState<number | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<'domicilio' | 'pickup'>('domicilio');
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  
  // Modal Historial de Paquetes
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyPackages, setHistoryPackages] = useState<PackageTracking[]>([]);
  
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
  
  // Carrusel de slides
  const [carouselSlides, setCarouselSlides] = useState<any[]>([]);
  
  // Wallet Status
  const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);

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
    loadData();
    loadServiceAddresses();
    loadDeliveryAddresses();
    loadPaymentMethods();
    loadWalletStatus();
    loadCarouselSlides();
    const user = localStorage.getItem('user');
    if (user) {
      const parsed = JSON.parse(user);
      setUserName(parsed.name?.split(' ')[0] || 'Cliente');
      setBoxId(parsed.boxId || parsed.box_id || 'N/A');
    }
  }, []);

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

  // Cargar direcciones de entrega del cliente
  const loadDeliveryAddresses = async () => {
    try {
      const response = await api.get('/addresses');
      if (response.data?.addresses) {
        setDeliveryAddresses(response.data.addresses);
      }
    } catch (error) {
      console.error('Error cargando direcciones:', error);
    }
  };

  // Cargar métodos de pago
  const loadPaymentMethods = async () => {
    try {
      const response = await api.get('/payment-methods');
      if (response.data?.paymentMethods) {
        setPaymentMethods(response.data.paymentMethods);
      }
    } catch (error) {
      console.error('Error cargando métodos de pago:', error);
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
              gradient: service.gradient,
              icon: null,
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
      const response = await api.get('/dashboard/client');
      if (response.data) {
        setStats(response.data.stats);
        setPackages(response.data.packages || []);
        setInvoices(response.data.invoices || []);
      }
    } catch (error) {
      console.error('Error cargando dashboard:', error);
      // Datos de ejemplo para desarrollo
      setStats({
        casillero: boxId || 'S1-1234',
        direccion_usa: {
          nombre: userName || 'Tu Nombre',
          direccion: `1234 Shipping Lane, Suite ${boxId || 'S1-1234'}`,
          ciudad: 'Laredo',
          estado: 'TX',
          zip: '78045',
        },
        paquetes: { en_transito: 3, en_bodega: 2, listos_recoger: 1, entregados_mes: 8 },
        financiero: { saldo_pendiente: 1250, saldo_favor: 0, credito_disponible: 5000, ultimo_pago: '2024-03-05' },
      });
      setPackages([
        { id: 1, tracking: 'US-ABC12345', descripcion: 'Amazon - Electronics', servicio: 'usa_pobox', status: 'in_transit', status_label: 'En Tránsito', fecha_estimada: 'Mar 15', monto: 450 },
        { id: 2, tracking: 'CH-XYZ78901', descripcion: 'AliExpress - Accesorios', servicio: 'china_air', status: 'in_warehouse', status_label: 'En Bodega', fecha_estimada: 'Listo', monto: 320 },
        { id: 3, tracking: 'US-DEF45678', descripcion: 'eBay - Ropa', servicio: 'usa_pobox', status: 'ready_pickup', status_label: 'Listo Recoger', fecha_estimada: 'Hoy', monto: 180 },
      ]);
      setInvoices([
        { id: 1, folio: 'A-12345', fecha: '2024-03-01', total: 1500, status: 'pagada' },
        { id: 2, folio: 'A-12340', fecha: '2024-02-15', total: 2300, status: 'pagada' },
      ]);
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
        if (serviceFilter === 'dhl') return type === 'dhl' || type === 'mx_cedis' || type === 'NATIONAL';
        return true;
      });
    }
    
    // Filtro por búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(pkg => 
        pkg.tracking.toLowerCase().includes(term) || 
        (pkg.descripcion || '').toLowerCase().includes(term)
      );
    }
    
    return filtered;
  }, [packages, serviceFilter, searchTerm]);

  // Abrir tutorial de dirección
  const handleOpenTutorial = (serviceType: string) => {
    const service = SERVICE_CONFIG.find(s => s.type === serviceType);
    if (service) {
      setTutorialService(service);
      setTutorialOpen(true);
    }
  };

  // Enviar mensaje de soporte
  const handleSendSupport = async () => {
    if (!supportMessage.trim()) return;
    
    try {
      await api.post('/support/message', {
        message: supportMessage,
        category: 'general',
      });
      setSnackbar({ open: true, message: '✅ Mensaje enviado. Te responderemos pronto.', severity: 'success' });
      setSupportMessage('');
      setSupportOpen(false);
    } catch (error) {
      setSnackbar({ open: true, message: '❌ Error al enviar mensaje', severity: 'error' });
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

    if (deliveryMethod === 'domicilio' && !selectedDeliveryAddress) {
      setSnackbar({ open: true, message: 'Selecciona una dirección de entrega', severity: 'warning' });
      return;
    }

    setDeliveryLoading(true);
    try {
      const response = await api.post('/packages/assign-delivery', {
        packageIds: selectedPackageIds,
        deliveryMethod,
        addressId: deliveryMethod === 'domicilio' ? selectedDeliveryAddress : null,
      });
      
      if (response.data.success) {
        setSnackbar({ open: true, message: `✅ Instrucciones asignadas a ${selected.length} paquete(s)`, severity: 'success' });
        setDeliveryModalOpen(false);
        setSelectedPackageIds([]);
        setSelectedDeliveryAddress(null);
        loadData(); // Recargar paquetes
      }
    } catch (error) {
      setSnackbar({ open: true, message: '❌ Error al asignar instrucciones', severity: 'error' });
    } finally {
      setDeliveryLoading(false);
    }
  };

  // Cargar historial de paquetes entregados
  const loadHistoryPackages = async () => {
    try {
      const response = await api.get('/packages/history');
      if (response.data?.packages) {
        setHistoryPackages(response.data.packages);
      }
    } catch (error) {
      // Usar paquetes actuales como fallback
      setHistoryPackages(packages.filter(p => p.status === 'delivered'));
    }
    setHistoryModalOpen(true);
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
      {/* Header de Bienvenida */}
      <Paper 
        sx={{ 
          p: 3, 
          mb: 3, 
          background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7043 100%)`,
          color: 'white',
          borderRadius: 3,
        }}
      >
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 8 }}>
            <Typography variant="h4" fontWeight="bold">
              ¡Hola, {userName}! 👋
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9, mt: 0.5 }}>
              Bienvenido a tu portal de cliente EntregaX
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.15)', borderRadius: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <QrCodeIcon />
                <Typography variant="subtitle2">Mi Suite / Casillero</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h5" fontWeight="bold">{stats?.casillero || boxId}</Typography>
                <Tooltip title="Copiar">
                  <IconButton size="small" sx={{ color: 'white' }} onClick={() => copyToClipboard(stats?.casillero || boxId)}>
                    <CopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Paper>

      {/* Carrusel de Promociones/Slides */}
      {carouselSlides.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1, scrollSnapType: 'x mandatory', '&::-webkit-scrollbar': { height: 6 }, '&::-webkit-scrollbar-thumb': { bgcolor: ORANGE, borderRadius: 3 } }}>
            {carouselSlides.map((slide) => (
              <Card 
                key={slide.id}
                sx={{ 
                  minWidth: 320,
                  maxWidth: 380,
                  flex: '0 0 auto',
                  cursor: 'pointer',
                  scrollSnapAlign: 'start',
                  borderRadius: 3,
                  overflow: 'hidden',
                  position: 'relative',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': { 
                    transform: 'translateY(-4px)', 
                    boxShadow: '0 12px 24px rgba(0,0,0,0.2)' 
                  },
                }}
              >
                {/* Imagen de fondo */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundImage: `url(${slide.imageUrl || slide.image_url})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
                {/* Overlay con gradiente */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: slide.gradientColors?.length 
                      ? `linear-gradient(135deg, ${slide.gradientColors[0]}CC 0%, ${slide.gradientColors[1] || slide.gradientColors[0]}99 100%)`
                      : 'linear-gradient(135deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 100%)',
                  }}
                />
                <CardContent sx={{ position: 'relative', zIndex: 1, p: 2.5, color: 'white', minHeight: 160 }}>
                  {slide.badge && (
                    <Chip 
                      label={slide.badge} 
                      size="small" 
                      sx={{ 
                        bgcolor: slide.badgeColor || ORANGE, 
                        color: 'white', 
                        fontWeight: 600, 
                        fontSize: '0.65rem', 
                        height: 20,
                        mb: 1,
                      }} 
                    />
                  )}
                  <Typography variant="h6" fontWeight="bold" sx={{ fontSize: '1.1rem', mb: 0.5, textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
                    {slide.title}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.95, mb: 2, lineHeight: 1.4, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
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
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.4)' },
                      }}
                    >
                      {slide.ctaText || slide.cta_text}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </Box>
        </Box>
      )}

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
                background: service.gradient,
                color: 'white',
                borderRadius: 3,
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': { 
                  transform: 'translateY(-4px)', 
                  boxShadow: '0 12px 24px rgba(0,0,0,0.15)' 
                },
              }}
            >
              <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    {service.name}
                  </Typography>
                  <Chip 
                    label={service.timeframe} 
                    size="small" 
                    sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600, fontSize: '0.65rem', height: 20 }} 
                  />
                </Box>
                <Typography variant="caption" sx={{ opacity: 0.9, display: 'block', mb: 1.5, lineHeight: 1.4 }}>
                  {service.tutorial.substring(0, 80)}...
                </Typography>
                <Button 
                  size="small" 
                  variant="contained"
                  fullWidth
                  sx={{ 
                    bgcolor: 'rgba(255,255,255,0.25)', 
                    color: 'white',
                    textTransform: 'none',
                    fontWeight: 600,
                    py: 0.5,
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.35)' },
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

              {/* Filtros por tipo de servicio */}
              <Box sx={{ mb: 3 }}>
                <ToggleButtonGroup
                  value={serviceFilter}
                  exclusive
                  onChange={(_, value) => value && setServiceFilter(value)}
                  size="small"
                  sx={{ flexWrap: 'wrap' }}
                >
                  <ToggleButton value="all" sx={{ px: 2 }}>
                    <ShippingIcon sx={{ mr: 0.5, fontSize: 18 }} /> Todos
                  </ToggleButton>
                  <ToggleButton value="usa_pobox" sx={{ px: 2 }}>
                    <PostOfficeIcon sx={{ mr: 0.5, fontSize: 18, color: '#9C27B0' }} /> PO Box USA
                  </ToggleButton>
                  <ToggleButton value="china_air" sx={{ px: 2 }}>
                    <FlightIcon sx={{ mr: 0.5, fontSize: 18, color: BLUE }} /> Aéreo China
                  </ToggleButton>
                  <ToggleButton value="china_sea" sx={{ px: 2 }}>
                    <BoatIcon sx={{ mr: 0.5, fontSize: 18, color: '#00796B' }} /> Marítimo
                  </ToggleButton>
                  <ToggleButton value="dhl" sx={{ px: 2 }}>
                    <TruckIcon sx={{ mr: 0.5, fontSize: 18, color: ORANGE }} /> DHL MTY
                  </ToggleButton>
                </ToggleButtonGroup>
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

              {/* Botones de acción para paquetes seleccionados */}
              {selectedPackageIds.length > 0 && (
                <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<SecurityIcon />}
                    onClick={() => setGexModalOpen(true)}
                  >
                    Contratar GEX
                  </Button>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<LocationOnIcon />}
                    onClick={() => setDeliveryModalOpen(true)}
                  >
                    Asignar Entrega
                  </Button>
                  <Button
                    variant="contained"
                    sx={{ bgcolor: ORANGE }}
                    startIcon={<MoneyIcon />}
                    onClick={() => {
                      const total = getSelectedPackages().reduce((sum, p) => sum + (p.monto || 0), 0);
                      setSnackbar({ open: true, message: `Total a pagar: ${formatCurrency(total)}`, severity: 'info' });
                    }}
                  >
                    Pagar ({getSelectedPackages().length})
                  </Button>
                </Box>
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

              {/* Lista de paquetes filtrados */}
              {getFilteredPackages().map((pkg) => {
                const isSelectable = !pkg.client_paid && pkg.status !== 'delivered';
                const isSelected = selectedPackageIds.includes(pkg.id);
                const hasDeliveryInstructions = !!(pkg.delivery_address_id || pkg.assigned_address_id);
                
                return (
                <Card 
                  key={pkg.id} 
                  sx={{ 
                    mb: 1.5, 
                    border: isSelected ? `2px solid ${ORANGE}` : pkg.status === 'ready_pickup' ? `2px solid ${GREEN}` : '1px solid #e0e0e0', 
                    borderRadius: 2,
                    cursor: isSelectable ? 'pointer' : 'default',
                    transition: 'all 0.2s',
                    '&:hover': isSelectable ? { boxShadow: 3 } : {},
                  }}
                  onClick={() => isSelectable && togglePackageSelection(pkg.id, pkg)}
                >
                  <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
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
                            {pkg.client_paid && <Chip label="Pagado" size="small" color="success" sx={{ height: 18, fontSize: '0.65rem' }} />}
                            {hasDeliveryInstructions && <Chip label="📍" size="small" color="primary" sx={{ height: 18, minWidth: 24 }} />}
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
                          color={pkg.status === 'ready_pickup' ? 'success' : pkg.status === 'in_transit' ? 'info' : 'default'}
                          size="small"
                          sx={{ height: 24 }}
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
                        ⏱ ETA: {pkg.fecha_estimada}
                      </Typography>
                      {pkg.status === 'ready_pickup' && (
                        <Button variant="contained" color="success" size="small" sx={{ py: 0.5, fontSize: '0.75rem' }}>
                          Ver Detalles
                        </Button>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              );
              })}

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
                    
                    <Grid container spacing={2}>
                      <Grid size={6}>
                        <Paper sx={{ p: 2, bgcolor: (walletStatus?.total_pending || stats?.financiero.saldo_pendiente) ? 'warning.light' : GREEN + '20', textAlign: 'center', borderRadius: 2 }}>
                          <Typography variant="caption" color="text.secondary">Por Pagar</Typography>
                          <Typography variant="h5" fontWeight="bold" color={(walletStatus?.total_pending || stats?.financiero.saldo_pendiente) ? 'warning.dark' : 'success.main'}>
                            {formatCurrency(walletStatus?.total_pending || stats?.financiero.saldo_pendiente || 0)}
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid size={6}>
                        <Paper sx={{ p: 2, bgcolor: GREEN + '20', textAlign: 'center', borderRadius: 2 }}>
                          <Typography variant="caption" color="text.secondary">Saldo a Favor</Typography>
                          <Typography variant="h5" fontWeight="bold" color="success.main">
                            {formatCurrency(walletStatus?.wallet_balance || stats?.financiero.saldo_favor || 0)}
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

                    {(walletStatus?.total_pending || stats?.financiero.saldo_pendiente) && (walletStatus?.total_pending || stats?.financiero.saldo_pendiente || 0) > 0 && (
                      <Button 
                        variant="contained" 
                        fullWidth 
                        sx={{ mt: 3, bgcolor: ORANGE }}
                        startIcon={<MoneyIcon />}
                      >
                        Pagar Ahora
                      </Button>
                    )}
                  </Paper>

                  {/* Último pago y crédito */}
                  <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1 }}>
                      <Typography variant="body2" color="text.secondary">Último Pago</Typography>
                      <Typography variant="body2" fontWeight="bold">{stats?.financiero.ultimo_pago || 'N/A'}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1 }}>
                      <Typography variant="body2" color="text.secondary">Crédito Disponible</Typography>
                      <Typography variant="body2" fontWeight="bold" color="success.main">
                        {formatCurrency(walletStatus?.available_credit || stats?.financiero.credito_disponible || 0)}
                      </Typography>
                    </Box>
                  </Paper>

                  {/* Mis Métodos de Pago */}
                  <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6" fontWeight="bold">
                        💳 Mis Métodos de Pago
                      </Typography>
                      <IconButton color="primary" onClick={() => setSnackbar({ open: true, message: 'Próximamente: Agregar métodos de pago', severity: 'info' })}>
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
                          onClick={() => setSnackbar({ open: true, message: 'Próximamente: Agregar métodos de pago', severity: 'info' })}
                        >
                          Agregar Método
                        </Button>
                      </Box>
                    ) : (
                      paymentMethods.map((pm) => (
                        <Box 
                          key={pm.id} 
                          sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            p: 1.5,
                            bgcolor: pm.is_default ? 'primary.light' : 'grey.50',
                            borderRadius: 1,
                            mb: 1,
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            {pm.type === 'card' && <CreditCardIcon color="primary" />}
                            {pm.type === 'bank_transfer' && <AccountBalanceIcon color="primary" />}
                            <Box>
                              <Typography variant="body2" fontWeight="bold">
                                {pm.alias}
                                {pm.is_default && <Chip label="Principal" size="small" sx={{ ml: 1, height: 18 }} />}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {pm.type === 'card' && `•••• ${pm.last_four}`}
                                {pm.type === 'bank_transfer' && `${pm.bank_name} •••• ${pm.clabe?.slice(-4)}`}
                              </Typography>
                            </Box>
                          </Box>
                        </Box>
                      ))
                    )}
                  </Paper>

                  {/* Contacto */}
                  <Paper sx={{ p: 3, borderRadius: 2 }}>
                    <Typography variant="h6" fontWeight="bold" gutterBottom>
                      📞 ¿Necesitas Ayuda?
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Estamos para servirte de Lunes a Viernes 9:00 - 18:00
                    </Typography>
                    <Button 
                      variant="contained" 
                      fullWidth 
                      sx={{ mt: 2, bgcolor: GREEN }}
                      startIcon={<WhatsAppIcon />}
                      href="https://wa.me/528112345678"
                      target="_blank"
                    >
                      Contactar por WhatsApp
                    </Button>
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
                            background: service.gradient, 
                            color: 'white', 
                            borderRadius: 2,
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                          }}
                        >
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                            <Box>
                              <Typography variant="subtitle1" fontWeight="bold">
                                {service.serviceName}
                              </Typography>
                              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                                {service.addresses[0]?.alias}
                              </Typography>
                            </Box>
                            <Tooltip title="¿Cómo enviar?">
                              <IconButton 
                                size="small" 
                                sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.2)', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}
                                onClick={() => handleOpenTutorial(service.serviceType)}
                              >
                                <HelpIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                          
                          <Box sx={{ bgcolor: 'rgba(255,255,255,0.15)', borderRadius: 2, p: 1.5, mb: 2, flex: 1 }}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.6 }}>
                              {service.addresses[0] && renderFormattedAddress(service.addresses[0], service.serviceType)}
                            </Typography>
                          </Box>
                          
                          <Button 
                            startIcon={<CopyIcon />} 
                            variant="outlined" 
                            size="small"
                            fullWidth
                            sx={{ 
                              borderColor: 'rgba(255,255,255,0.5)', 
                              color: 'white', 
                              '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' } 
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
        </Box>
      </Paper>

      {/* KPIs Cards - Resumen de Paquetes */}
      <Grid container spacing={2} sx={{ mt: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ borderRadius: 2, height: '100%' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Avatar sx={{ bgcolor: BLUE + '20', color: BLUE, mx: 'auto', mb: 1 }}>
                <FlightIcon />
              </Avatar>
              <Typography variant="h4" fontWeight="bold">{stats?.paquetes.en_transito || 0}</Typography>
              <Typography variant="caption" color="text.secondary">En Tránsito</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ borderRadius: 2, height: '100%' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Avatar sx={{ bgcolor: ORANGE + '20', color: ORANGE, mx: 'auto', mb: 1 }}>
                <InventoryIcon />
              </Avatar>
              <Typography variant="h4" fontWeight="bold">{stats?.paquetes.en_bodega || 0}</Typography>
              <Typography variant="caption" color="text.secondary">En Bodega</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ borderRadius: 2, height: '100%' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Avatar sx={{ bgcolor: GREEN + '20', color: GREEN, mx: 'auto', mb: 1 }}>
                <CheckCircleIcon />
              </Avatar>
              <Typography variant="h4" fontWeight="bold">{stats?.paquetes.listos_recoger || 0}</Typography>
              <Typography variant="caption" color="text.secondary">Listos Recoger</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ borderRadius: 2, height: '100%' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Avatar sx={{ bgcolor: '#9c27b0' + '20', color: '#9c27b0', mx: 'auto', mb: 1 }}>
                <HomeIcon />
              </Avatar>
              <Typography variant="h4" fontWeight="bold">{stats?.paquetes.entregados_mes || 0}</Typography>
              <Typography variant="caption" color="text.secondary">Entregados (Mes)</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Modal de Tutorial de Envío */}
      <Dialog 
        open={tutorialOpen} 
        onClose={() => setTutorialOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ 
          background: tutorialService?.gradient || ORANGE, 
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HelpIcon />
            <span>¿Cómo enviar? - {tutorialService?.name}</span>
          </Box>
          <IconButton size="small" onClick={() => setTutorialOpen(false)} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          {tutorialService && (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                <strong>Tiempo estimado de entrega:</strong> {tutorialService.timeframe}
              </Alert>
              
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                📋 Instrucciones:
              </Typography>
              <Typography variant="body2" paragraph>
                {tutorialService.tutorial}
              </Typography>

              <Divider sx={{ my: 2 }} />

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
                    <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary="Lo recibimos y liberamos sin trámites de importación" /></ListItem>
                    <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary="Te notificamos para coordinar la entrega final" /></ListItem>
                  </>
                )}
              </List>

              <Alert severity="warning" sx={{ mt: 2 }}>
                <strong>Importante:</strong> Siempre incluye tu Suite/Casillero <strong>{boxId}</strong> para identificar correctamente tu envío.
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTutorialOpen(false)}>Cerrar</Button>
          <Button 
            variant="contained" 
            sx={{ bgcolor: ORANGE }}
            onClick={() => {
              setTutorialOpen(false);
              setActiveTab(2); // Ir a Mi Cuenta para ver las direcciones
            }}
          >
            Ver Mis Direcciones
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal GEX (Garantía Extendida) */}
      <Dialog open={gexModalOpen} onClose={() => setGexModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: GREEN, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <SecurityIcon />
          Contratar Garantía Extendida (GEX)
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            La Garantía Extendida protege tus paquetes contra daños, pérdidas y robos durante el envío.
          </Alert>
          
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Paquetes Seleccionados ({selectedPackageIds.length}):
          </Typography>
          
          {getSelectedPackages().map((pkg) => (
            <Paper key={pkg.id} sx={{ p: 2, mb: 1, bgcolor: 'grey.50' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" fontWeight="bold">{pkg.tracking}</Typography>
                  <Typography variant="caption" color="text.secondary">{pkg.descripcion}</Typography>
                </Box>
                <Chip label="5% del valor" size="small" color="success" />
              </Box>
            </Paper>
          ))}

          <Divider sx={{ my: 2 }} />

          <Box sx={{ bgcolor: GREEN + '10', p: 2, borderRadius: 2 }}>
            <Typography variant="subtitle1" fontWeight="bold">✅ Cobertura GEX incluye:</Typography>
            <List dense>
              <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary="Daños durante el transporte" /></ListItem>
              <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary="Pérdida total del paquete" /></ListItem>
              <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary="Robo durante la entrega" /></ListItem>
              <ListItem><ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon><ListItemText primary="Reembolso hasta el 100% del valor declarado" /></ListItem>
            </List>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGexModalOpen(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            color="success"
            onClick={handleContractGEX}
            disabled={gexLoading}
            startIcon={gexLoading ? <CircularProgress size={20} /> : <SecurityIcon />}
          >
            {gexLoading ? 'Procesando...' : 'Contratar GEX'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal Instrucciones de Entrega */}
      <Dialog open={deliveryModalOpen} onClose={() => setDeliveryModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: BLUE, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <LocationOnIcon />
          Asignar Instrucciones de Entrega
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Paquetes Seleccionados ({selectedPackageIds.length}):
          </Typography>
          
          {getSelectedPackages().slice(0, 3).map((pkg) => (
            <Chip key={pkg.id} label={pkg.tracking} sx={{ mr: 0.5, mb: 0.5 }} size="small" />
          ))}
          {selectedPackageIds.length > 3 && (
            <Chip label={`+${selectedPackageIds.length - 3} más`} size="small" variant="outlined" />
          )}

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Método de Entrega:
          </Typography>
          
          <FormControl component="fieldset">
            <RadioGroup
              value={deliveryMethod}
              onChange={(e) => setDeliveryMethod(e.target.value as 'domicilio' | 'pickup')}
            >
              <FormControlLabel 
                value="domicilio" 
                control={<Radio color="primary" />} 
                label={
                  <Box>
                    <Typography variant="body1">🏠 Envío a Domicilio</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Recibe en tu dirección registrada
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel 
                value="pickup" 
                control={<Radio color="primary" />} 
                label={
                  <Box>
                    <Typography variant="body1">📍 Recoger en Sucursal</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Pasa a recoger sin costo de envío
                    </Typography>
                  </Box>
                }
              />
            </RadioGroup>
          </FormControl>

          {deliveryMethod === 'domicilio' && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>Selecciona Dirección:</Typography>
              
              {deliveryAddresses.length === 0 ? (
                <Alert severity="warning">
                  No tienes direcciones guardadas. 
                  <Button 
                    size="small" 
                    onClick={() => {
                      setDeliveryModalOpen(false);
                      setAddressModalOpen(true);
                    }}
                  >
                    Agregar Dirección
                  </Button>
                </Alert>
              ) : (
                <FormControl fullWidth size="small">
                  <InputLabel>Dirección de Entrega</InputLabel>
                  <Select
                    value={selectedDeliveryAddress || ''}
                    onChange={(e) => setSelectedDeliveryAddress(e.target.value as number)}
                    label="Dirección de Entrega"
                  >
                    {deliveryAddresses.map((addr) => (
                      <MenuItem key={addr.id} value={addr.id}>
                        <Box>
                          <Typography variant="body2">{addr.alias}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {addr.street} {addr.exterior_number}, {addr.city}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeliveryModalOpen(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            color="primary"
            onClick={handleAssignDelivery}
            disabled={deliveryLoading || (deliveryMethod === 'domicilio' && !selectedDeliveryAddress)}
            startIcon={deliveryLoading ? <CircularProgress size={20} /> : <LocationOnIcon />}
          >
            {deliveryLoading ? 'Procesando...' : 'Asignar Entrega'}
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

      {/* Modal de Soporte */}
      <Dialog open={supportOpen} onClose={() => setSupportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SupportIcon color="primary" />
          Contactar Soporte
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Escribe tu mensaje y te responderemos lo antes posible.
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            placeholder="Describe tu consulta o problema..."
            value={supportMessage}
            onChange={(e) => setSupportMessage(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSupportOpen(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            sx={{ bgcolor: GREEN }}
            onClick={handleSendSupport}
            disabled={!supportMessage.trim()}
          >
            Enviar Mensaje
          </Button>
        </DialogActions>
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
        <Tooltip title="Chat de Soporte" placement="left">
          <IconButton
            onClick={() => setSupportOpen(true)}
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
        <Tooltip title="WhatsApp" placement="left">
          <IconButton
            component="a"
            href="https://wa.me/528112345678"
            target="_blank"
            sx={{
              bgcolor: GREEN,
              color: 'white',
              width: 56,
              height: 56,
              boxShadow: 3,
              '&:hover': { bgcolor: '#388E3C' },
            }}
          >
            <WhatsAppIcon />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
