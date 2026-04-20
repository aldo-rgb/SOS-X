import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Chip, Avatar, IconButton, TextField, InputAdornment, Button, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, Divider, CircularProgress, Alert,
  MenuItem, Select, FormControl, InputLabel, type SelectChangeEvent, Snackbar, Stepper,
  Step, StepLabel, Card, CardContent, Grid, Fade, Badge, List, ListItem, ListItemText,
  ListItemSecondaryAction, ListItemIcon, Checkbox, Autocomplete,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import InventoryIcon from '@mui/icons-material/Inventory';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CloseIcon from '@mui/icons-material/Close';
import ScaleIcon from '@mui/icons-material/Scale';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PrintIcon from '@mui/icons-material/Print';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PlaceIcon from '@mui/icons-material/Place';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import PersonIcon from '@mui/icons-material/Person';
import HomeIcon from '@mui/icons-material/Home';
import WarningIcon from '@mui/icons-material/Warning';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import VideocamIcon from '@mui/icons-material/Videocam';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';

// ============ CONSTANTES ============
const COUNTRIES_ES = ['México', 'Estados Unidos', 'Canadá', 'Guatemala', 'Colombia', 'España', 'Otro'];
const COUNTRIES_EN = ['Mexico', 'United States', 'Canada', 'Guatemala', 'Colombia', 'Spain', 'Other'];

// ============ TIPOS ============
type PackageStatus = 'received' | 'received_mty' | 'in_transit' | 'customs' | 'processing' | 'ready_pickup' | 'out_for_delivery' | 'delivered' | 'shipped';

interface PackageDimensions {
  length: number | null;
  width: number | null;
  height: number | null;
  formatted: string | null;
}

interface Package {
  id: number;
  tracking: string;
  trackingProvider?: string;
  description: string;
  weight?: number;
  dimensions?: PackageDimensions;
  isMaster?: boolean;
  totalBoxes?: number;
  declaredValue?: number;
  status: PackageStatus;
  statusLabel: string;
  receivedAt: string;
  deliveredAt?: string;
  consolidationId?: number;
  client: { id: number; name: string; email: string; boxId: string } | null;
}

interface PackageLabel {
  boxNumber: number;
  totalBoxes: number;
  tracking: string;
  labelCode: string;
  masterTracking?: string;
  isMaster: boolean;
  weight: number;
  dimensions?: string;
  clientName: string;
  clientBoxId: string;
  description: string;
  destinationCity?: string;
  destinationCountry?: string;
  carrier?: string;
  receivedAt?: string;
}

interface User {
  id: number;
  full_name: string;
  email: string;
  box_id: string;
  role: string;
}

interface BoxItem {
  id: number;
  weight: string;
  length: string;
  width: string;
  height: string;
  trackingCourier?: string; // Guía del proveedor (Amazon, UPS, etc.)
}

interface ClientAddress {
  id: number;
  alias: string;
  recipientName?: string;
  street: string;
  exteriorNumber?: string;
  interiorNumber?: string;
  neighborhood?: string;
  city: string;
  state: string;
  zipCode: string;
  phone?: string;
  reference?: string;
  formatted: string;
}

interface POBoxRatesInfo {
  tipoCambio: {
    valor: number;
    apiRate: number | null;
    sobreprecio: number;
    ultimaActualizacion: string | null;
  };
  tarifasVolumen: Array<{
    nivel: number;
    cbmMin: number;
    cbmMax: number | null;
    costoUsd: number;
    tipoCobro: string;
    descripcion: string;
  }>;
  tarifasExtras: Array<{
    servicio: string;
    descripcion: string;
    costoMxn: number;
  }>;
  formula: {
    cbm: string;
    cbmMinimo: number;
    nota: string;
  };
}

interface ClientInstructions {
  found: boolean;
  hasInstructions: boolean;
  client?: {
    id: number;
    name: string;
    email: string;
    boxId: string;
  };
  preferences?: {
    transport: string | null;
    carrier: string | null;
  };
  addresses?: ClientAddress[];
  usaAssignedAddressCount?: number;
  totalAddressCount?: number;
  defaultAddress?: ClientAddress | null;
  poboxRatesInfo?: POBoxRatesInfo | null;
}

interface ShipmentsPageProps {
  users: User[];
  warehouseLocation?: string; // Panel de bodega seleccionado
  openWizardOnMount?: boolean; // Abrir wizard automáticamente al montar
}

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const ORANGE = '#F05A28';
const BLACK = '#111111';

const getStatusColor = (status: PackageStatus): "info" | "warning" | "success" | "error" | "default" => {
  const colors: Record<PackageStatus, "info" | "warning" | "success" | "error" | "default"> = {
    received: 'info',
    received_mty: 'info',
    in_transit: 'warning',
    customs: 'error',
    processing: 'error',
    ready_pickup: 'success',
    out_for_delivery: 'success',
    delivered: 'default',
    shipped: 'default',
  };
  return colors[status] || 'default';
};

const getStatusLabel = (status: PackageStatus): string => {
  const labels: Record<PackageStatus, string> = {
    received: 'RECIBIDO CEDIS',
    received_mty: 'RECIBIDO EN CEDIS MTY',
    in_transit: 'EN TRÁNSITO A MTY, N.L.',
    customs: 'Procesando - Guía impresa',
    processing: 'Procesando - Guía impresa',
    ready_pickup: 'EN RUTA',
    out_for_delivery: 'EN RUTA',
    delivered: 'ENTREGADO',
    shipped: 'ENVIADO',
  };
  return labels[status] || status;
};

const getStatusIcon = (status: PackageStatus): string => {
  const icons: Record<PackageStatus, string> = {
    received: '📦',
    received_mty: '🏢',
    in_transit: '🚚',
    customs: '⚙️',
    processing: '⚙️',
    ready_pickup: '🛣️',
    out_for_delivery: '🛣️',
    delivered: '✅',
    shipped: '📤',
  };
  return icons[status] || '📦';
};

export default function ShipmentsPage({ users, warehouseLocation, openWizardOnMount }: ShipmentsPageProps) {
  const { t, i18n } = useTranslation();
  const COUNTRIES = i18n.language === 'es' ? COUNTRIES_ES : COUNTRIES_EN;
  
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  const [wizardOpen, setWizardOpen] = useState(openWizardOnMount || false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [editingClient, setEditingClient] = useState(false);
  const [editClientBoxId, setEditClientBoxId] = useState('');
  const [savingClient, setSavingClient] = useState(false);
  const [labelsToPrint, setLabelsToPrint] = useState<PackageLabel[]>([]);
  
  // Wizard state
  const [activeStep, setActiveStep] = useState(0);
  const [boxes, setBoxes] = useState<BoxItem[]>([]);
  const [currentBox, setCurrentBox] = useState({ weight: '', length: '', width: '', height: '', trackingCourier: '' });
  const [trackingProvider, setTrackingProvider] = useState('');
  const [declaredValue, setDeclaredValue] = useState('');
  const [carrier, setCarrier] = useState('');
  const [destination, setDestination] = useState({
    country: i18n.language === 'es' ? 'México' : 'Mexico',
    city: '',
    state: '',
    colony: '',
    address: '',
    zip: '',
    phoneCode: '+52',
    phone: '',
    firstName: '',
    lastName: '',
    contact: ''
  });
  const [colonyOptions, setColonyOptions] = useState<string[]>([]);
  const [loadingZipcode, setLoadingZipcode] = useState(false);
  const [boxId, setBoxId] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [packageImage, setPackageImage] = useState<string | null>(null); // URL o base64 de la foto
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdShipment, setCreatedShipment] = useState<{ labels: PackageLabel[] } | null>(null);
  
  const trackingInputRef = useRef<HTMLInputElement>(null);
  const weightInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Estados para cámara
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  
  // Estados para cliente e instrucciones
  const [clientInstructions, setClientInstructions] = useState<ClientInstructions | null>(null);
  const [loadingClient, setLoadingClient] = useState(false);
  const [manualAddress, setManualAddress] = useState(false);
  
  // Estados para cotización Skydropx
  const [shippingRates, setShippingRates] = useState<any[]>([]);
  const [loadingRates, setLoadingRates] = useState(false);
  const [selectedRate, setSelectedRate] = useState<any | null>(null);
  const [shipmentId, setShipmentId] = useState<string | null>(null);
  
  // Estados para GEX (Garantía Extendida)
  const [includeGex, setIncludeGex] = useState(false);
  const [gexQuote, setGexQuote] = useState<{ invoiceValueUsd: number; exchangeRate: number; insuredValueMxn: number; variableFeeMxn: number; fixedFeeMxn: number; totalCostMxn: number } | null>(null);
  const [loadingGex, setLoadingGex] = useState(false);
  
  // Estado para opción de pago
  const [paymentOption, setPaymentOption] = useState<'now' | 'later' | null>(null);
  
  // Estado para dejar paquete en bodega (PO Box sin dirección)
  const [leaveInWarehouse, setLeaveInWarehouse] = useState(false);
  
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'info' });

  const wizardSteps = [
    { label: i18n.language === 'es' ? 'Agregar Cajas' : 'Add Boxes', icon: <Inventory2Icon /> },
    { label: i18n.language === 'es' ? 'Foto & Valor' : 'Photo & Value', icon: <CameraAltIcon /> },
    { label: i18n.language === 'es' ? 'Destino & Paquetería' : 'Destination & Carrier', icon: <LocalShippingIcon /> },
    { label: i18n.language === 'es' ? 'Confirmar' : 'Confirm', icon: <CheckCircleIcon /> }
  ];

  const getToken = () => localStorage.getItem('token') || '';

  const fetchPackages = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/packages`, {
        headers: { Authorization: `Bearer ${getToken()}` },
        params: statusFilter !== 'all' ? { status: statusFilter } : {}
      });
      setPackages(response.data.packages || []);
    } catch {
      setSnackbar({ open: true, message: t('errors.loadPackages'), severity: 'error' });
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => { fetchPackages(); }, [fetchPackages]);

  const filteredPackages = packages.filter(pkg => {
    const search = searchTerm.toLowerCase();
    return (
      (pkg.tracking || '').toLowerCase().includes(search) ||
      (pkg.description || '').toLowerCase().includes(search) ||
      (pkg.client?.name || '').toLowerCase().includes(search) ||
      (pkg.client?.boxId || '').toLowerCase().includes(search) ||
      (pkg.trackingProvider && pkg.trackingProvider.toLowerCase().includes(search))
    );
  });

  // ============ WIZARD HANDLERS ============
  const handleOpenWizard = () => {
    setBoxes([]);
    setCurrentBox({ weight: '', length: '', width: '', height: '', trackingCourier: '' });
    setTrackingProvider('');
    setDeclaredValue('');
    setCarrier('');
    setDestination({ country: 'México', city: '', state: '', colony: '', address: '', zip: '', phoneCode: '+52', phone: '', firstName: '', lastName: '', contact: '' });
    setColonyOptions([]);
    setBoxId('');
    setDescription('');
    setNotes('');
    setPackageImage(null);
    setActiveStep(0);
    setFormError('');
    setCreatedShipment(null);
    setClientInstructions(null);
    setManualAddress(false);
    // Limpiar cotizaciones Skydropx
    setShippingRates([]);
    setSelectedRate(null);
    setShipmentId(null);
    // Limpiar GEX y opción de pago
    setIncludeGex(false);
    setGexQuote(null);
    setPaymentOption(null);
    setLeaveInWarehouse(false); // Reset opción dejar en bodega
    setWizardOpen(true);
    setTimeout(() => weightInputRef.current?.focus(), 300);
  };

  // ============ FUNCIONES DE CÁMARA WEB ============
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      setCameraStream(stream);
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch (err) {
      console.error('Error al acceder a la cámara:', err);
      setSnackbar({ open: true, message: 'No se pudo acceder a la cámara. Verifica los permisos.', severity: 'error' });
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        setPackageImage(imageData);
        closeCamera();
        setSnackbar({ open: true, message: '📸 Foto capturada exitosamente', severity: 'success' });
      }
    }
  };

  const closeCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setCameraOpen(false);
  };

  // Mapear carrier a tipo de servicio para buscar dirección predeterminada
  const getServiceTypeFromCarrier = (selectedCarrier: string): string => {
    // CEDIS MTY = USA, otros carriers típicos de USA
    const usaCarriers = ['CEDIS MTY', 'FedEx', 'UPS', 'DHL'];
    if (usaCarriers.includes(selectedCarrier)) return 'usa';
    return 'air'; // Por defecto aéreo si no es USA
  };

  // ============ BUSCAR CLIENTE E INSTRUCCIONES ============
  const searchClientByBoxId = async (searchBoxId: string, selectedCarrier?: string) => {
    if (!searchBoxId || searchBoxId.length < 2) {
      setClientInstructions(null);
      return;
    }

    setLoadingClient(true);
    try {
      // Determinar el tipo de servicio basado en el carrier seleccionado
      const serviceType = selectedCarrier ? getServiceTypeFromCarrier(selectedCarrier) : 'usa';
      
      const response = await axios.get(`${API_URL}/client/instructions/${searchBoxId}?serviceType=${serviceType}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      
      setClientInstructions(response.data);
      
      if (response.data.found) {
        if (response.data.defaultAddress) {
          // Auto-llenar con la dirección del cliente
          const addr = response.data.defaultAddress;
          // Separar nombre y apellido del recipientName si es posible
          const nameParts = (addr.recipientName || '').split(' ');
          const fName = nameParts[0] || '';
          const lName = nameParts.slice(1).join(' ') || '';
          // Extraer lada del teléfono si viene con formato internacional
          const rawPhone = addr.phone || '';
          const phoneMatch = rawPhone.match(/^(\+\d{1,3})[\s-]?(.+)$/);
          const pCode = phoneMatch ? phoneMatch[1] : '+52';
          const pNumber = phoneMatch ? phoneMatch[2].replace(/[^\d]/g, '') : rawPhone.replace(/[^\d]/g, '');
          setDestination({
            country: 'México',
            city: addr.city,
            state: addr.state || '',
            colony: addr.neighborhood || '',
            address: `${addr.street} ${addr.exteriorNumber || ''}${addr.interiorNumber ? ' Int. ' + addr.interiorNumber : ''}`,
            zip: addr.zipCode,
            phoneCode: pCode,
            phone: pNumber,
            firstName: fName,
            lastName: lName,
            contact: addr.recipientName || ''
          });
          // Buscar colonias para el CP
          if (addr.zipCode && /^\d{5}$/.test(addr.zipCode)) {
            handleZipCodeLookup(addr.zipCode, false);
          }
          setManualAddress(false);
          
          // Si tiene carrier predeterminado, usarlo
          if (response.data.preferences?.carrier) {
            setCarrier(response.data.preferences.carrier);
          }
          
          const serviceLabel = addr.defaultForService 
            ? ` (predeterminada para: ${addr.defaultForService})`
            : ' (predeterminada)';
          setSnackbar({ open: true, message: `✅ Cliente encontrado con dirección${serviceLabel}. Cotizando paqueterías...`, severity: 'success' });
          
          // 🚚 Auto-cotizar con Skydropx usando la dirección predeterminada
          setTimeout(() => {
            fetchShippingRatesWithAddress({
              city: addr.city,
              address: `${addr.street} ${addr.exteriorNumber || ''}${addr.interiorNumber ? ' Int. ' + addr.interiorNumber : ''}`,
              zip: addr.zipCode,
              phone: addr.phone || '',
              contact: addr.recipientName || '',
              clientName: response.data.client?.name || 'Cliente'
            });
          }, 100);
        } else {
          setManualAddress(true);
          // Mensaje específico si tiene direcciones pero ninguna asignada a USA
          const isPOBox = response.data.poboxRatesInfo != null;
          const hasAddresses = (response.data.totalAddressCount || 0) > 0;
          const usaCount = response.data.usaAssignedAddressCount || 0;
          
          // 📦 Si es PO Box y no tiene dirección, preseleccionar "Dejar en Bodega"
          if (isPOBox) {
            setLeaveInWarehouse(true);
          }
          
          if (isPOBox && hasAddresses && usaCount === 0) {
            setSnackbar({ 
              open: true, 
              message: '⚠️ Cliente tiene direcciones pero ninguna asignada al servicio USA. Se dejará en bodega.', 
              severity: 'warning' as 'success' | 'error' 
            });
          } else {
            setSnackbar({ 
              open: true, 
              message: isPOBox 
                ? '📦 Cliente sin dirección predeterminada. Se dejará en bodega (puede configurar destino manualmente).' 
                : '⚠️ Cliente encontrado pero sin dirección predeterminada. Configure el destino.', 
              severity: 'warning' as 'success' | 'error' 
            });
          }
        }
      }
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number } };
      if (axiosError.response?.status === 404) {
        setClientInstructions({ found: false, hasInstructions: false });
        setSnackbar({ open: true, message: '❌ No se encontró cliente con ese casillero', severity: 'error' });
      }
    } finally {
      setLoadingClient(false);
    }
  };

  // ============ BUSCAR COLONIAS POR CÓDIGO POSTAL (SEPOMEX) ============
  const handleZipCodeLookup = async (cp: string, autoFillCity = true) => {
    if (!/^\d{5}$/.test(cp)) return;
    setLoadingZipcode(true);
    try {
      const res = await axios.get(`${API_URL}/zipcode/${cp}`);
      const { city, state, colonies } = res.data;
      setColonyOptions(colonies || []);
      if (autoFillCity) {
        setDestination(prev => ({
          ...prev,
          city: city || prev.city,
          state: state || prev.state,
          colony: colonies?.length === 1 ? colonies[0] : prev.colony,
        }));
      } else {
        // Solo llenar colonias sin sobrescribir ciudad si ya viene
        if (colonies?.length === 1) {
          setDestination(prev => ({ ...prev, colony: colonies[0], state: state || prev.state }));
        }
      }
    } catch (err) {
      console.error('Error buscando CP:', err);
      setColonyOptions([]);
    } finally {
      setLoadingZipcode(false);
    }
  };

  // ============ COTIZAR OPCIONES DE ENVÍO ============
  // Cotizar con dirección específica (para auto-cotización)
  const fetchShippingRatesWithAddress = async (addr: { city: string; address: string; zip: string; phone: string; contact: string; clientName: string }) => {
    if (!addr.city || !addr.zip) return;
    
    setLoadingRates(true);
    setShippingRates([]);
    setSelectedRate(null);

    try {
      // 🏙️ Detectar si es zona metropolitana de Monterrey
      const isMonterreyArea = /^(64|65|66|67)\d{3}$/.test(addr.zip) || 
        ['monterrey', 'san pedro', 'san pedro garza garcia', 'san pedro garza garcía', 
         'santa catarina', 'guadalupe', 'apodaca', 'escobedo', 'garcia', 'garcía',
         'san nicolas', 'san nicolás', 'juarez', 'juárez', 'santiago', 'cadereyta',
         'general escobedo', 'pesquería', 'pesqueria', 'cienega de flores', 'ciénega de flores',
         'salinas victoria', 'el carmen'].some(city => 
          addr.city.toLowerCase().includes(city)
        );
      
      // Calcular número de cajas y dimensiones promedio
      const numCajas = boxes.length > 0 ? boxes.length : 1;
      const avgWeight = boxes.length > 0 ? boxes.reduce((s, b) => s + (parseFloat(b.weight) || 1), 0) / boxes.length : 1;
      const avgLength = boxes.length > 0 ? boxes.reduce((s, b) => s + (parseFloat(b.length) || 30), 0) / boxes.length : 30;
      const avgWidth = boxes.length > 0 ? boxes.reduce((s, b) => s + (parseFloat(b.width) || 30), 0) / boxes.length : 30;
      const avgHeight = boxes.length > 0 ? boxes.reduce((s, b) => s + (parseFloat(b.height) || 30), 0) / boxes.length : 30;

      let rates: any[] = [];

      // CEDIS MTY solo para zona Monterrey
      if (isMonterreyArea) {
        rates.push({
          rateId: 'cedis-mty-local',
          provider: 'CEDIS MTY',
          carrierName: 'CEDIS MTY',
          serviceName: '🏠 Entrega Local Monterrey',
          totalPrice: 0,
          currency: 'MXN',
          deliveryDays: '1-2 días',
          isLocal: true
        });
      }

      // 🚚 Cotizar Paquete Express via API real
      try {
        const pqtxRes = await axios.post(`${API_URL}/shipping/pqtx-quote`, {
          destZipCode: addr.zip,
          packageCount: numCajas,
          weight: Math.round(avgWeight),
          length: Math.round(avgLength),
          width: Math.round(avgWidth),
          height: Math.round(avgHeight),
        }, { headers: { Authorization: `Bearer ${getToken()}` } });

        if (pqtxRes.data?.success) {
          rates.push({
            rateId: 'paquete-express-real',
            provider: 'Paquete Express',
            carrierName: 'Paquete Express',
            serviceName: `📦 Envío Nacional (${numCajas} ${numCajas === 1 ? 'caja' : 'cajas'})`,
            totalPrice: pqtxRes.data.clientPrice,
            currency: 'MXN',
            deliveryDays: pqtxRes.data.estimatedDays || '3-5 días',
            isInternal: true,
            pqtxQuote: pqtxRes.data.pqtxQuote,
            rule: pqtxRes.data.rule,
          });
        }
      } catch (pqtxErr) {
        console.error('Error cotizando PQTX:', pqtxErr);
        // Fallback: agregar con precio fallback de la API
        rates.push({
          rateId: 'paquete-express-fallback',
          provider: 'Paquete Express',
          carrierName: 'Paquete Express',
          serviceName: `📦 Envío Nacional (${numCajas} ${numCajas === 1 ? 'caja' : 'cajas'})`,
          totalPrice: 400 * numCajas,
          currency: 'MXN',
          deliveryDays: '3-5 días',
          isInternal: true,
          rule: 'frontend_fallback',
        });
      }
      
      setShippingRates(rates);
      
      // Auto-seleccionar según preferencia del cliente, o la primera disponible
      const clientPreferredCarrier = clientInstructions?.preferences?.carrier?.toLowerCase().replace(/[_\s-]/g, '');
      let selectedRateToUse = null;
      
      if (clientPreferredCarrier) {
        selectedRateToUse = rates.find(r => {
          const providerNorm = r.provider?.toLowerCase().replace(/[_\s-]/g, '') || '';
          const carrierNorm = r.carrierName?.toLowerCase().replace(/[_\s-]/g, '') || '';
          return providerNorm.includes(clientPreferredCarrier) || carrierNorm.includes(clientPreferredCarrier);
        });
      }
      
      if (!selectedRateToUse && rates.length > 0) {
        selectedRateToUse = rates[0];
      }
      
      if (selectedRateToUse) {
        setSelectedRate(selectedRateToUse);
      }
      
      if (rates.length > 0) {
        setSnackbar({ open: true, message: `✅ ${rates.length} opciones de envío disponibles`, severity: 'success' });
      }
    } catch (error: any) {
      console.error('Error cotizando:', error);
    } finally {
      setLoadingRates(false);
    }
  };

  const fetchShippingRates = async () => {
    if (!destination.city || !destination.zip) {
      setSnackbar({ open: true, message: '⚠️ Ingresa ciudad y código postal para cotizar', severity: 'error' });
      return;
    }

    setLoadingRates(true);
    setShippingRates([]);
    setSelectedRate(null);

    try {
      // 🏙️ Detectar si es zona metropolitana de Monterrey (CPs: 64xxx, 65xxx, 66xxx, 67xxx)
      const isMonterreyArea = /^(64|65|66|67)\d{3}$/.test(destination.zip) || 
        ['monterrey', 'san pedro', 'san pedro garza garcia', 'san pedro garza garcía', 
         'santa catarina', 'guadalupe', 'apodaca', 'escobedo', 'garcia', 'garcía',
         'san nicolas', 'san nicolás', 'juarez', 'juárez', 'santiago', 'cadereyta',
         'general escobedo', 'pesquería', 'pesqueria', 'cienega de flores', 'ciénega de flores',
         'salinas victoria', 'el carmen'].some(city => 
          destination.city.toLowerCase().includes(city)
        );
      
      // Calcular número de cajas y dimensiones promedio
      const numCajas = boxes.length > 0 ? boxes.length : 1;
      const avgWeight = boxes.length > 0 ? boxes.reduce((s, b) => s + (parseFloat(b.weight) || 1), 0) / boxes.length : 1;
      const avgLength = boxes.length > 0 ? boxes.reduce((s, b) => s + (parseFloat(b.length) || 30), 0) / boxes.length : 30;
      const avgWidth = boxes.length > 0 ? boxes.reduce((s, b) => s + (parseFloat(b.width) || 30), 0) / boxes.length : 30;
      const avgHeight = boxes.length > 0 ? boxes.reduce((s, b) => s + (parseFloat(b.height) || 30), 0) / boxes.length : 30;

      let rates: any[] = [];

      // CEDIS MTY solo para zona Monterrey
      if (isMonterreyArea) {
        rates.push({
          rateId: 'cedis-mty-local',
          provider: 'CEDIS MTY',
          carrierName: 'CEDIS MTY',
          serviceName: '🏠 Entrega Local Monterrey',
          totalPrice: 0,
          currency: 'MXN',
          deliveryDays: '1-2 días',
          isLocal: true
        });
      }

      // 🚚 Cotizar Paquete Express via API real
      try {
        const pqtxRes = await axios.post(`${API_URL}/shipping/pqtx-quote`, {
          destZipCode: destination.zip,
          packageCount: numCajas,
          weight: Math.round(avgWeight),
          length: Math.round(avgLength),
          width: Math.round(avgWidth),
          height: Math.round(avgHeight),
        }, { headers: { Authorization: `Bearer ${getToken()}` } });

        if (pqtxRes.data?.success) {
          rates.push({
            rateId: 'paquete-express-real',
            provider: 'Paquete Express',
            carrierName: 'Paquete Express',
            serviceName: `📦 Envío Nacional (${numCajas} ${numCajas === 1 ? 'caja' : 'cajas'})`,
            totalPrice: pqtxRes.data.clientPrice,
            currency: 'MXN',
            deliveryDays: pqtxRes.data.estimatedDays || '3-5 días',
            isInternal: true,
            pqtxQuote: pqtxRes.data.pqtxQuote,
            rule: pqtxRes.data.rule,
          });
        }
      } catch (pqtxErr) {
        console.error('Error cotizando PQTX:', pqtxErr);
        rates.push({
          rateId: 'paquete-express-fallback',
          provider: 'Paquete Express',
          carrierName: 'Paquete Express',
          serviceName: `📦 Envío Nacional (${numCajas} ${numCajas === 1 ? 'caja' : 'cajas'})`,
          totalPrice: 400 * numCajas,
          currency: 'MXN',
          deliveryDays: '3-5 días',
          isInternal: true,
          rule: 'frontend_fallback',
        });
      }
      
      setShippingRates(rates);
      
      // Auto-seleccionar según preferencia del cliente, o la primera disponible
      const clientPreferredCarrier = clientInstructions?.preferences?.carrier?.toLowerCase().replace(/[_\s-]/g, '');
      let selectedRateToUse = null;
      
      if (clientPreferredCarrier) {
        selectedRateToUse = rates.find(r => {
          const providerNorm = r.provider?.toLowerCase().replace(/[_\s-]/g, '') || '';
          const carrierNorm = r.carrierName?.toLowerCase().replace(/[_\s-]/g, '') || '';
          return providerNorm.includes(clientPreferredCarrier) || carrierNorm.includes(clientPreferredCarrier);
        });
      }
      
      // Si no hay preferencia o no se encontró, usar la primera
      if (!selectedRateToUse && rates.length > 0) {
        selectedRateToUse = rates[0];
      }
      
      if (selectedRateToUse) {
        setSelectedRate(selectedRateToUse);
      }
      
      if (rates.length > 0) {
        const localMsg = isMonterreyArea ? ' (incluye entrega local)' : '';
        setSnackbar({ open: true, message: `✅ ${rates.length} opciones de envío encontradas${localMsg}`, severity: 'success' });
      } else {
        setSnackbar({ open: true, message: '⚠️ No hay tarifas disponibles para este destino', severity: 'warning' as 'success' | 'error' });
      }
    } catch (error: any) {
      console.error('Error cotizando:', error);
      setSnackbar({ open: true, message: 'Error al cotizar envío', severity: 'error' });
    } finally {
      setLoadingRates(false);
    }
  };

  const handleSelectRate = (rate: any) => {
    setSelectedRate(rate);
    setCarrier(rate.carrierName || rate.provider);
    setSnackbar({ open: true, message: `🚚 ${rate.carrierName || rate.provider} - $${rate.totalPrice.toFixed(2)} MXN seleccionado`, severity: 'success' });
  };

  // ============ COTIZAR GEX (GARANTÍA EXTENDIDA) ============
  const fetchGexQuote = async (valueUsd: number) => {
    if (!valueUsd || valueUsd <= 0) {
      setGexQuote(null);
      return;
    }
    
    setLoadingGex(true);
    try {
      const response = await axios.post(`${API_URL}/gex/quote`, {
        invoiceValueUsd: valueUsd
      }, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      
      setGexQuote(response.data);
    } catch (error) {
      console.error('Error cotizando GEX:', error);
      setGexQuote(null);
    } finally {
      setLoadingGex(false);
    }
  };

  // Auto-cotizar GEX cuando cambia el valor declarado
  useEffect(() => {
    if (declaredValue && parseFloat(declaredValue) > 0) {
      const timer = setTimeout(() => fetchGexQuote(parseFloat(declaredValue)), 500);
      return () => clearTimeout(timer);
    } else {
      setGexQuote(null);
    }
  }, [declaredValue]);

  const handleCloseWizard = () => {
    setWizardOpen(false);
    setActiveStep(0);
    closeCamera();
    setCreatedShipment(null);
    // Reset GEX states
    setIncludeGex(false);
    setGexQuote(null);
    if (createdShipment) fetchPackages();
  };

  const handleReadScale = () => {
    const simulatedWeight = (Math.random() * 24.5 + 0.5).toFixed(2);
    setCurrentBox(prev => ({ ...prev, weight: simulatedWeight }));
    setSnackbar({ open: true, message: `⚖️ ${t('wizard.weightCaptured')}: ${simulatedWeight} kg`, severity: 'success' });
  };

  const handleAddBox = () => {
    const weight = parseFloat(currentBox.weight);
    const length = parseFloat(currentBox.length);
    const width = parseFloat(currentBox.width);
    const height = parseFloat(currentBox.height);
    
    if (!currentBox.weight || weight <= 0) {
      setFormError(t('errors.enterBoxWeight'));
      setSnackbar({ open: true, message: '⚠️ El peso debe ser mayor a 0', severity: 'error' });
      return;
    }
    if (!currentBox.length || !currentBox.width || !currentBox.height) {
      setFormError(t('errors.enterAllDimensions'));
      setSnackbar({ open: true, message: '⚠️ Ingresa todas las dimensiones', severity: 'error' });
      return;
    }
    if (length <= 0 || width <= 0 || height <= 0) {
      setFormError('Las dimensiones deben ser mayores a 0');
      setSnackbar({ open: true, message: '⚠️ Las dimensiones deben ser mayores a 0', severity: 'error' });
      return;
    }
    
    setFormError('');
    const newBox: BoxItem = {
      id: Date.now(),
      weight: currentBox.weight,
      length: currentBox.length,
      width: currentBox.width,
      height: currentBox.height,
      trackingCourier: currentBox.trackingCourier || ''
    };
    setBoxes(prev => [...prev, newBox]);
    setCurrentBox({ weight: '', length: '', width: '', height: '', trackingCourier: '' });
    setSnackbar({ open: true, message: `📦 ${t('wizard.boxAdded', { number: boxes.length + 1 })}`, severity: 'success' });
    setTimeout(() => weightInputRef.current?.focus(), 100);
  };

  const handleRemoveBox = (id: number) => {
    setBoxes(prev => prev.filter(b => b.id !== id));
  };

  const handleNextStep = () => {
    if (activeStep === 0 && boxes.length === 0) {
      setFormError(t('errors.addAtLeastOneBox'));
      setSnackbar({ open: true, message: t('errors.addAtLeastOneBox'), severity: 'error' });
      return;
    }
    // Paso 1 (Foto & Valor) - No hay validaciones obligatorias, foto y valor son opcionales
    if (activeStep === 2) {
      // Validar que se haya buscado y encontrado un cliente
      if (!boxId || !clientInstructions?.found) {
        const msg = i18n.language === 'es' ? 'Busca y selecciona un cliente válido' : 'Search and select a valid customer';
        setFormError(msg);
        setSnackbar({ open: true, message: msg, severity: 'error' });
        return;
      }
      
      // Si es PO Box y elige dejar en bodega, no validar dirección ni paquetería
      const isPOBox = !!clientInstructions.poboxRatesInfo;
      if (isPOBox && leaveInWarehouse) {
        // OK - dejar en bodega sin dirección
      } else {
        // Si el cliente no tiene instrucciones, validar que se llenó el destino
        if (!clientInstructions.hasInstructions || manualAddress) {
          if (!destination.country || !destination.city || !destination.address) {
            setFormError(t('errors.completeDestination'));
            setSnackbar({ open: true, message: t('errors.completeDestination'), severity: 'error' });
            return;
          }
          if (!destination.zip) {
            const msg = i18n.language === 'es' ? 'Ingresa el código postal para cotizar' : 'Enter zip code to quote';
            setFormError(msg);
            setSnackbar({ open: true, message: msg, severity: 'error' });
            return;
          }
        }
        // SIEMPRE validar que se seleccionó paquetería (con o sin instrucciones previas)
        if (!selectedRate) {
          const msg = i18n.language === 'es' ? '⚠️ Cotiza y selecciona una paquetería antes de continuar' : '⚠️ Quote and select a carrier before continuing';
          setFormError(msg);
          setSnackbar({ open: true, message: msg, severity: 'error' });
          return;
        }
      }
    }
    
    // Validar que se seleccionó paquetería (excepto si es PO Box dejado en bodega o si es PO Box con cobro después)
    const isPOBoxInWarehouse = !!clientInstructions?.poboxRatesInfo && leaveInWarehouse;
    const isPOBoxWithLaterPayment = !!clientInstructions?.poboxRatesInfo && paymentOption === 'later';
    if (activeStep === 3 && !carrier && !isPOBoxInWarehouse && !isPOBoxWithLaterPayment) {
      const msg = i18n.language === 'es' ? '⚠️ Selecciona la paquetería de envío' : '⚠️ Select the shipping carrier';
      setFormError(msg);
      setSnackbar({ open: true, message: msg, severity: 'error' });
      return;
    }
    
    // Validar que se seleccionó opción de pago si hay costos de PO Box o GEX (excepto si se deja en bodega sin costos asignados)
    if (activeStep === 3 && !isPOBoxInWarehouse) {
      const hasCosts = (costoPOBox?.totalMxn || 0) + (includeGex && gexQuote ? gexQuote.totalCostMxn : 0) > 0;
      if (hasCosts && !paymentOption) {
        const msg = i18n.language === 'es' ? '⚠️ Selecciona una opción de cobro: Pagar Ahora o Cobrar Después' : '⚠️ Select a payment option: Pay Now or Pay Later';
        setFormError(msg);
        setSnackbar({ open: true, message: msg, severity: 'error' });
        return;
      }
    }

    setFormError('');
    
    if (activeStep === 3) {
      handleCreateShipment();
    } else {
      setActiveStep(prev => prev + 1);
      if (activeStep === 0) setTimeout(() => trackingInputRef.current?.focus(), 300);
    }
  };

  const handleBackStep = () => {
    setFormError('');
    setActiveStep(prev => prev - 1);
  };

  const handleCreateShipment = async () => {
    setSubmitting(true);
    setFormError('');
    
    try {
      // Si es PO Box y se deja en bodega o se cobra después sin envío nacional, no enviar dirección ni cotización
      const isPOBoxInWarehouse = !!clientInstructions?.poboxRatesInfo && leaveInWarehouse;
      const isPOBoxWithLaterPayment = !!clientInstructions?.poboxRatesInfo && paymentOption === 'later' && !carrier;
      const skipShipping = isPOBoxInWarehouse || isPOBoxWithLaterPayment;
      
      const payload = {
        boxId,
        description,
        boxes: boxes.map(b => ({
          weight: parseFloat(b.weight),
          length: parseFloat(b.length),
          width: parseFloat(b.width),
          height: parseFloat(b.height),
          trackingCourier: b.trackingCourier || undefined // Guía del proveedor de esta caja
        })),
        trackingProvider: trackingProvider || undefined,
        declaredValue: parseFloat(declaredValue) || undefined,
        carrier: skipShipping ? undefined : carrier,
        destination: skipShipping ? undefined : {
          country: destination.country,
          city: destination.city,
          state: destination.state || undefined,
          colony: destination.colony || undefined,
          address: destination.address,
          zip: destination.zip || undefined,
          phone: destination.phone ? `${destination.phoneCode}${destination.phone}` : undefined,
          contact: destination.contact || `${destination.firstName} ${destination.lastName}`.trim() || undefined,
          firstName: destination.firstName || undefined,
          lastName: destination.lastName || undefined,
        },
        notes: notes || undefined,
        imageUrl: packageImage || undefined,
        warehouseLocation: warehouseLocation || undefined, // Ubicación del panel de bodega
        leaveInWarehouse: skipShipping || undefined, // Indicar que se deja en bodega o pendiente de envío
        // Información de cotización Skydropx
        skydropxQuote: (!skipShipping && selectedRate) ? {
          shipmentId,
          rateId: selectedRate.rateId,
          provider: selectedRate.provider,
          serviceName: selectedRate.serviceName,
          totalPrice: selectedRate.totalPrice,
          currency: selectedRate.currency || 'MXN',
          deliveryDays: selectedRate.deliveryDays,
          pqtxQuote: selectedRate.pqtxQuote || null,
          rule: selectedRate.rule || null,
        } : undefined,
        // 🛡️ Información de GEX (Garantía Extendida)
        gex: includeGex && gexQuote ? {
          included: true,
          invoiceValueUsd: gexQuote.invoiceValueUsd,
          exchangeRate: gexQuote.exchangeRate,
          insuredValueMxn: gexQuote.insuredValueMxn,
          costMxn: gexQuote.totalCostMxn
        } : undefined,
        // 💰 Opción de pago
        paymentOption: paymentOption || undefined,
        // 📦 Costo PO Box (para registrar saldo pendiente)
        poboxCost: clientInstructions?.poboxRatesInfo ? {
          totalMxn: costoPOBox?.totalMxn || 0,
          totalUsd: costoPOBox?.totalUsd || 0,
          cbmTotal: costoPOBox?.cbmTotal || 0
        } : undefined
      };

      const response = await axios.post(`${API_URL}/packages`, payload, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });

      setCreatedShipment({ labels: response.data.shipment.labels || [] });
      setSnackbar({ open: true, message: response.data.message, severity: 'success' });
      setActiveStep(4);  // Avanzar al paso de confirmación (ahora es 4)
    } catch (err) {
      const error = err as { response?: { data?: { error?: string; message?: string; requiresVerification?: boolean; verificationStatus?: string } } };
      const errorData = error.response?.data;
      
      // Si es error de verificación, mostrar mensaje más detallado
      if (errorData?.requiresVerification) {
        const statusMsg = errorData.verificationStatus === 'pending_review' 
          ? '⏳ El perfil del cliente está en revisión.'
          : errorData.verificationStatus === 'rejected'
            ? '❌ El perfil del cliente fue rechazado.'
            : '⚠️ El cliente no ha completado su verificación.';
        setFormError(`🚫 CLIENTE NO VERIFICADO: ${statusMsg} No puede recibir paquetes hasta que sea aprobado.`);
        setSnackbar({ 
          open: true, 
          message: `Cliente ${boxId} no verificado - ${statusMsg}`, 
          severity: 'error' 
        });
      } else {
        setFormError(errorData?.error || errorData?.message || 'Error al crear el envío');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintLabels = (labels: PackageLabel[]) => {
    setLabelsToPrint(labels);
    setPrintDialogOpen(true);
  };

  const executePrint = () => {
    console.log('executePrint called, labels:', labelsToPrint.length);
    
    if (labelsToPrint.length === 0) {
      setSnackbar({ open: true, message: 'No hay etiquetas para imprimir', severity: 'error' });
      return;
    }
    
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      setSnackbar({ open: true, message: 'Popup bloqueado. Por favor permite popups para este sitio.', severity: 'error' });
      return;
    }

    try {
    // Mapeo de ciudades a códigos cortos para mostrar grande
    const getCityCode = (city?: string): string => {
      if (!city) return '';
      const cityMap: Record<string, string> = {
        'monterrey': 'MTY', 'mty': 'MTY',
        'guadalajara': 'GDL', 'gdl': 'GDL',
        'ciudad de mexico': 'CDMX', 'cdmx': 'CDMX', 'mexico city': 'CDMX',
        'tijuana': 'TIJ', 'tij': 'TIJ',
        'cancun': 'CUN', 'cancún': 'CUN',
        'merida': 'MID', 'mérida': 'MID',
        'queretaro': 'QRO', 'querétaro': 'QRO',
        'puebla': 'PUE',
        'leon': 'LEO', 'león': 'LEO',
        'chihuahua': 'CUU',
        'hermosillo': 'HMO',
        'culiacan': 'CUL', 'culiacán': 'CUL',
        'mazatlan': 'MZT', 'mazatlán': 'MZT',
        'veracruz': 'VER',
        'tampico': 'TAM',
        'san luis potosi': 'SLP', 'san luis potosí': 'SLP',
        'aguascalientes': 'AGS',
        'morelia': 'MLM',
        'saltillo': 'SLW',
        'torreon': 'TRC', 'torreón': 'TRC',
        'reynosa': 'REX',
        'laredo': 'LRD',
        'mcallen': 'MCA', 'mc allen': 'MCA',
      };
      const normalized = city.toLowerCase().trim();
      return cityMap[normalized] || city.substring(0, 3).toUpperCase();
    };

    const formatDate = (dateStr?: string): string => {
      if (!dateStr) return new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).toUpperCase();
      const date = new Date(dateStr);
      return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).toUpperCase();
    };

    const labelsHTML = labelsToPrint.map((label, index) => {
      const cityCode = getCityCode(label.destinationCity);
      const receivedDate = formatDate(label.receivedAt);
      
      return `
      <div class="label" style="page-break-after: ${index < labelsToPrint.length - 1 ? 'always' : 'auto'};">
        <!-- Header con logo y fecha -->
        <div class="header">
          <div class="logo">🚚 EntregaX</div>
          <div class="date-badge">${receivedDate}</div>
        </div>
        
        ${label.isMaster ? '<div class="master-badge">GUÍA MASTER</div>' : ''}
        
        <!-- Destino Grande -->
        ${cityCode ? `<div class="destination-big">${cityCode}</div>` : ''}
        
        <!-- Tracking principal -->
        <div class="tracking-main">
          <div class="tracking-code">${label.tracking}</div>
          ${!label.isMaster ? `<div class="box-indicator">${label.boxNumber} de ${label.totalBoxes}</div>` : 
            `<div class="box-indicator">${label.totalBoxes} bultos</div>`}
        </div>
        ${label.masterTracking ? `<div class="master-ref">Master: ${label.masterTracking}</div>` : ''}
        
        <!-- CÓDIGOS: Barcode + QR lado a lado -->
        <div class="codes-container">
          <div class="barcode-section">
            <svg id="barcode-${index}"></svg>
          </div>
          <div class="qr-section">
            <div id="qr-${index}"></div>
          </div>
        </div>
        
        <div class="divider"></div>
        
        <!-- Cliente destacado -->
        <div class="client-info">
          <div class="client-box">${label.clientBoxId}</div>
          <div class="client-name">${label.clientName}</div>
        </div>
        
        <!-- Detalles -->
        <div class="details">
          ${label.weight ? `<span class="detail-item">⚖️ ${label.weight} kg</span>` : ''}
          ${label.dimensions ? `<span class="detail-item">📐 ${label.dimensions}</span>` : ''}
          ${label.carrier ? `<span class="detail-item">🚚 ${label.carrier}</span>` : ''}
        </div>
        
        <div class="description">${label.description || ''}</div>
        
        <div class="footer">
          <small>Impreso: ${new Date().toLocaleString('es-MX')} | Escanea el QR para rastrear</small>
        </div>
      </div>
    `}).join('');

    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>Etiquetas - ${labelsToPrint[0]?.tracking || 'Paquete'}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Arial', sans-serif; }
        .label { 
          width: 4in; 
          height: 6in; 
          padding: 0.25in; 
          border: 2px solid #000; 
          display: flex; 
          flex-direction: column; 
          margin: 0 auto; 
          position: relative;
        }
        .header { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          margin-bottom: 8px;
        }
        .logo { font-size: 20px; font-weight: bold; color: #F05A28; }
        .date-badge { 
          background: #111; 
          color: white; 
          padding: 4px 10px; 
          font-size: 12px; 
          font-weight: bold; 
          border-radius: 4px;
        }
        .master-badge { 
          background: #F05A28; 
          color: white; 
          text-align: center; 
          padding: 5px; 
          font-weight: bold; 
          font-size: 14px;
          margin-bottom: 8px; 
        }
        .destination-big {
          text-align: center;
          font-size: 48px;
          font-weight: 900;
          color: #111;
          letter-spacing: 4px;
          background: #f0f0f0;
          padding: 8px;
          margin-bottom: 10px;
          border: 3px solid #111;
        }
        .tracking-main { text-align: center; margin: 8px 0; }
        .tracking-code { font-size: 22px; font-weight: bold; letter-spacing: 1px; }
        .box-indicator { 
          font-size: 16px; 
          background: #111; 
          color: white; 
          padding: 4px 12px; 
          border-radius: 15px; 
          display: inline-block; 
          margin-top: 6px; 
        }
        .master-ref { text-align: center; font-size: 11px; color: #666; margin: 4px 0; }
        
        /* CONTENEDOR DE CÓDIGOS */
        .codes-container {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 15px;
          margin: 12px 0;
          padding: 10px;
          background: #fafafa;
          border-radius: 8px;
        }
        .barcode-section { 
          flex: 1;
          text-align: center;
        }
        .barcode-section svg { max-width: 100%; height: 45px; }
        .qr-section { 
          width: 70px;
          height: 70px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .qr-section svg { width: 70px; height: 70px; }
        
        .divider { border-top: 2px dashed #ccc; margin: 10px 0; }
        
        .client-info { text-align: center; margin: 8px 0; }
        .client-box { 
          font-size: 28px; 
          color: #F05A28; 
          font-weight: 900; 
          letter-spacing: 2px;
        }
        .client-name { font-size: 16px; font-weight: bold; margin-top: 4px; }
        
        .details { 
          text-align: center; 
          font-size: 13px; 
          margin: 8px 0; 
          display: flex; 
          justify-content: center; 
          gap: 15px;
          flex-wrap: wrap;
        }
        .detail-item {
          background: #f5f5f5;
          padding: 3px 8px;
          border-radius: 4px;
        }
        .description { 
          text-align: center; 
          font-size: 12px; 
          color: #666; 
          flex-grow: 1;
          margin-top: 5px;
        }
        .footer { 
          text-align: center; 
          font-size: 9px; 
          color: #999; 
          border-top: 1px solid #eee; 
          padding-top: 5px;
          margin-top: auto;
        }
        
        @page { size: 4in 6in; margin: 0; }
        @media print {
          body { margin: 0; padding: 0; }
          .label { border: none; page-break-inside: avoid; }
        }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
      </head><body>${labelsHTML}
      <script>
        // Generar códigos de barras
        ${labelsToPrint.map((label, i) => `JsBarcode("#barcode-${i}", "${label.tracking.replace(/-/g, '')}", { format: "CODE128", width: 1.8, height: 45, displayValue: false });`).join('')}
        
        // Generar códigos QR
        ${labelsToPrint.map((label, i) => `
          (function() {
            var qr = qrcode(0, 'M');
            qr.addData('https://app.entregax.com/track/${label.tracking}');
            qr.make();
            document.getElementById('qr-${i}').innerHTML = qr.createSvgTag({ cellSize: 2, margin: 0 });
          })();
        `).join('')}
        
        window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 600); };
      </script></body></html>
    `);
    printWindow.document.close();
    setPrintDialogOpen(false);
    console.log('Print window opened successfully');
  } catch (error) {
    console.error('Error in executePrint:', error);
    setSnackbar({ open: true, message: 'Error al generar etiquetas', severity: 'error' });
  }
  };

  const handleStatusChange = async (newStatus: PackageStatus) => {
    if (!selectedPackage) return;
    try {
      await axios.patch(`${API_URL}/packages/${selectedPackage.id}/status`, { status: newStatus },
        { headers: { Authorization: `Bearer ${getToken()}` } });
      setSnackbar({ open: true, message: t('shipments.statusUpdated'), severity: 'success' });
      setStatusDialogOpen(false);
      fetchPackages();
    } catch {
      setSnackbar({ open: true, message: t('errors.updateError'), severity: 'error' });
    }
  };

  const clients = users.filter(u => u.role === 'client');
  void clients; // Available for future use
  const totalWeight = boxes.reduce((sum, b) => sum + (parseFloat(b.weight) || 0), 0);
  const totalVolume = boxes.reduce((sum, b) => {
    const vol = (parseFloat(b.length) || 0) * (parseFloat(b.width) || 0) * (parseFloat(b.height) || 0) / 1000000; // CBM
    return sum + vol;
  }, 0);

  // ============ CALCULAR COSTO ESTIMADO PO BOX ============
  // Cada caja se cotiza individualmente según su volumen
  const calcularCostoPOBox = (): { totalUsd: number; totalMxn: number; cbmTotal: number; nivel: number; desglosePorCaja: { cbm: number; costoUsd: number; nivel: number }[] } | null => {
    if (!clientInstructions?.poboxRatesInfo || boxes.length === 0) return null;
    
    const { tipoCambio, tarifasVolumen } = clientInstructions.poboxRatesInfo;
    
    let totalUsd = 0;
    let cbmTotal = 0;
    let nivelMasAlto = 0;
    const desglosePorCaja: { cbm: number; costoUsd: number; nivel: number }[] = [];
    
    // Calcular costo POR CADA CAJA individualmente
    for (const box of boxes) {
      const largo = parseFloat(box.length) || 0;
      const alto = parseFloat(box.height) || 0;
      const ancho = parseFloat(box.width) || 0;
      let cbmCaja = (largo * alto * ancho) / 1000000;
      
      // Aplicar mínimo cobrable por caja
      if (cbmCaja < 0.010) cbmCaja = 0.010;
      
      cbmTotal += cbmCaja;
      
      // Encontrar tarifa aplicable para ESTA caja
      let costoUsdCaja = 0;
      let nivelCaja = 0;
      
      for (const tarifa of tarifasVolumen) {
        const cbmMax = tarifa.cbmMax ?? Infinity;
        if (cbmCaja >= tarifa.cbmMin && cbmCaja <= cbmMax) {
          nivelCaja = tarifa.nivel;
          if (tarifa.tipoCobro === 'fijo') {
            costoUsdCaja = tarifa.costoUsd;
          } else {
            costoUsdCaja = cbmCaja * tarifa.costoUsd;
            // Protección de precio mínimo
            const nivelAnterior = tarifasVolumen.find(t => t.nivel === tarifa.nivel - 1);
            if (nivelAnterior && costoUsdCaja < nivelAnterior.costoUsd) {
              costoUsdCaja = nivelAnterior.costoUsd;
            }
          }
          break;
        }
      }
      
      totalUsd += costoUsdCaja;
      if (nivelCaja > nivelMasAlto) nivelMasAlto = nivelCaja;
      
      desglosePorCaja.push({ cbm: cbmCaja, costoUsd: costoUsdCaja, nivel: nivelCaja });
    }
    
    const totalMxn = totalUsd * tipoCambio.valor;
    
    return { totalUsd, totalMxn, cbmTotal, nivel: nivelMasAlto, desglosePorCaja };
  };

  const costoPOBox = calcularCostoPOBox();

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: BLACK }}>📦 {t('shipments.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('shipments.masterChildSystem', 'Sistema de guías Master + Hijas')}</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddCircleIcon />} onClick={handleOpenWizard}
          sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)`, px: 3, py: 1.5, borderRadius: 2, fontWeight: 'bold' }}>
          {t('shipments.receivePackage')}
        </Button>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'RECIBIDO CEDIS', statuses: ['received'], color: '#2196f3', icon: '📦' },
          { label: 'RECIBIDO EN CEDIS MTY', statuses: ['received_mty'], color: '#00acc1', icon: '🏢' },
          { label: 'EN TRÁNSITO A MTY, N.L.', statuses: ['in_transit'], color: '#ff9800', icon: '🚚' },
          { label: 'Procesando - Guía impresa', statuses: ['customs', 'processing'], color: '#f44336', icon: '⚙️' },
          { label: 'EN RUTA', statuses: ['ready_pickup', 'out_for_delivery'], color: '#4caf50', icon: '🛣️' },
          { label: 'ENTREGADO', statuses: ['delivered'], color: '#9e9e9e', icon: '✅' },
          { label: 'ENVIADO', statuses: ['shipped'], color: '#607d8b', icon: '📤' },
        ].map((stat) => {
          const count = packages.filter(p => stat.statuses.includes(p.status as PackageStatus)).length;
          return (
            <Grid size={{ xs: 6, sm: 2, md: 12 / 7 }} key={stat.label}>
              <Paper sx={{ p: 2, textAlign: 'center', cursor: 'pointer',
                  border: stat.statuses.includes(statusFilter as PackageStatus) ? `2px solid ${stat.color}` : '2px solid transparent',
                  '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 } }}
                onClick={() => setStatusFilter(stat.statuses.includes(statusFilter as PackageStatus) ? 'all' : stat.statuses[0])}>
                <Typography variant="h3" sx={{ color: stat.color }}>{stat.icon}</Typography>
                <Typography variant="h4" fontWeight="bold">{count}</Typography>
                <Typography variant="body2" color="text.secondary">{stat.label}</Typography>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {/* Search */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField placeholder={t('common.search') + '...'} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            sx={{ flexGrow: 1, minWidth: 300 }} />
          <FormControl sx={{ minWidth: 180 }}>
            <InputLabel>{t('common.status')}</InputLabel>
            <Select value={statusFilter} label={t('common.status')} onChange={(e: SelectChangeEvent) => setStatusFilter(e.target.value)}>
              <MenuItem value="all">{t('common.all')}</MenuItem>
              <MenuItem value="received">📦 RECIBIDO CEDIS</MenuItem>
              <MenuItem value="received_mty">🏢 RECIBIDO EN CEDIS MTY</MenuItem>
              <MenuItem value="in_transit">🚚 EN TRÁNSITO A MTY, N.L.</MenuItem>
              <MenuItem value="processing">⚙️ Procesando - Guía impresa</MenuItem>
              <MenuItem value="ready_pickup">🛣️ EN RUTA</MenuItem>
              <MenuItem value="delivered">✅ ENTREGADO</MenuItem>
              <MenuItem value="shipped">📤 ENVIADO</MenuItem>
            </Select>
          </FormControl>
          <IconButton onClick={fetchPackages} color="primary"><RefreshIcon /></IconButton>
        </Box>
      </Paper>

      {/* Table */}
      <TableContainer component={Paper} elevation={2}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress sx={{ color: ORANGE }} /></Box>
        ) : (
          <>
            <Table>
              <TableHead sx={{ bgcolor: BLACK }}>
                <TableRow>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Tracking</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>{t('clients.client')}</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>{t('shipments.boxes')}</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>{t('shipments.weight')}</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>{t('common.status')}</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Consolidación</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>{t('status.received')}</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="center">{t('common.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredPackages.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((pkg) => (
                  <TableRow key={pkg.id} hover>
                    <TableCell>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {pkg.isMaster && <Tooltip title={t('shipments.masterTracking')}><AccountTreeIcon sx={{ color: ORANGE, fontSize: 18 }} /></Tooltip>}
                          <Typography fontWeight="bold" sx={{ color: ORANGE }}>{pkg.tracking}</Typography>
                        </Box>
                        {pkg.trackingProvider && <Typography variant="caption" color="text.secondary">{pkg.trackingProvider}</Typography>}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ bgcolor: ORANGE, width: 32, height: 32, fontSize: 14 }}>{(pkg.client?.name || '?').charAt(0)}</Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight="500">{pkg.client?.name || 'Sin Cliente'}</Typography>
                          <Chip label={pkg.client?.boxId || 'N/A'} size="small" sx={{ fontSize: 10 }} />
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Badge badgeContent={pkg.totalBoxes || 1} color={pkg.isMaster ? 'warning' : 'primary'}><Inventory2Icon /></Badge>
                    </TableCell>
                    <TableCell>{pkg.weight ? `${pkg.weight} kg` : '-'}</TableCell>
                    <TableCell>
                      <Chip icon={<span>{getStatusIcon(pkg.status)}</span>} label={getStatusLabel(pkg.status)} color={getStatusColor(pkg.status)} size="small" />
                    </TableCell>
                    <TableCell>
                      {pkg.consolidationId ? (
                        <Chip label={`#${pkg.consolidationId}`} size="small" variant="outlined" sx={{ fontWeight: 'bold', borderColor: '#1976d2', color: '#1976d2' }} />
                      ) : '-'}
                    </TableCell>
                    <TableCell><Typography variant="body2">{new Date(pkg.receivedAt).toLocaleDateString(i18n.language === 'es' ? 'es-MX' : 'en-US')}</Typography></TableCell>
                    <TableCell align="center">
                      <Tooltip title={t('clients.viewDetails')}><IconButton size="small" onClick={() => { setSelectedPackage(pkg); setDetailsOpen(true); setEditingClient(false); }}><VisibilityIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title={t('shipments.printLabels')}><IconButton size="small" onClick={async () => {
                        try {
                          const response = await axios.get(`${API_URL}/packages/${pkg.id}/labels`, { headers: { Authorization: `Bearer ${getToken()}` } });
                          handlePrintLabels(response.data.labels);
                        } catch { setSnackbar({ open: true, message: t('common.error'), severity: 'error' }); }
                      }}><PrintIcon fontSize="small" /></IconButton></Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination component="div" count={filteredPackages.length} page={page}
              onPageChange={(_, newPage) => setPage(newPage)} rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
              rowsPerPageOptions={[10, 25, 50]} labelRowsPerPage="Por página:" />
          </>
        )}
      </TableContainer>

      {/* ============ WIZARD DIALOG ============ */}
      <Dialog open={wizardOpen} onClose={handleCloseWizard} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ bgcolor: BLACK, color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <InventoryIcon sx={{ color: ORANGE }} />
            <Typography variant="h6">Recibir Envío {boxes.length > 1 ? '(Multi-caja)' : ''}</Typography>
          </Box>
          <IconButton onClick={handleCloseWizard} sx={{ color: 'white' }}><CloseIcon /></IconButton>
        </DialogTitle>

        <DialogContent sx={{ pt: 3 }}>
          <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
            {wizardSteps.map((step, index) => (
              <Step key={step.label} completed={activeStep > index}>
                <StepLabel StepIconComponent={() => (
                  <Avatar sx={{ bgcolor: activeStep >= index ? ORANGE : 'grey.300', width: 40, height: 40 }}>
                    {activeStep > index ? <CheckCircleIcon /> : step.icon}
                  </Avatar>
                )}>{step.label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}

          <Fade in={true} key={activeStep}>
            <Box>
              {/* PASO 0: AGREGAR CAJAS */}
              {activeStep === 0 && (
                <Box>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Inventory2Icon sx={{ color: ORANGE }} /> {t('wizard.addBoxes')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {t('wizard.addBoxesDesc')}
                  </Typography>

                  {/* Formulario de caja actual */}
                  <Card sx={{ p: 2, mb: 2, border: `2px dashed ${ORANGE}` }}>
                    <Grid container spacing={2} alignItems="center">
                      {/* Guía del Proveedor */}
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField 
                          fullWidth 
                          label={i18n.language === 'es' ? '📦 Guía del Proveedor (Amazon, UPS, etc.)' : '📦 Supplier Tracking'} 
                          placeholder={i18n.language === 'es' ? 'Escanea o escribe la guía...' : 'Scan or type tracking...'}
                          value={currentBox.trackingCourier} 
                          onChange={(e) => setCurrentBox(p => ({ ...p, trackingCourier: e.target.value.toUpperCase() }))}
                          InputProps={{ startAdornment: <InputAdornment position="start"><QrCodeScannerIcon /></InputAdornment> }}
                          helperText={i18n.language === 'es' ? 'Guía individual de esta caja' : 'Individual tracking for this box'}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}></Grid>
                      
                      {/* Peso */}
                      <Grid size={{ xs: 12, sm: 3 }}>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <TextField inputRef={weightInputRef} fullWidth label={`${t('shipments.weight')} (kg)`} type="number"
                            value={currentBox.weight} onChange={(e) => setCurrentBox(p => ({ ...p, weight: e.target.value }))}
                            InputProps={{ startAdornment: <InputAdornment position="start"><ScaleIcon /></InputAdornment>, endAdornment: <InputAdornment position="end">kg</InputAdornment> }}
                            inputProps={{ step: 0.01, min: 0.01 }} />
                        </Box>
                        <Button size="small" onClick={handleReadScale} sx={{ mt: 1, color: ORANGE }}>📡 {t('wizard.readScale')}</Button>
                      </Grid>
                      <Grid size={{ xs: 4, sm: 2 }}>
                        <TextField fullWidth label={t('shipments.length')} type="number" value={currentBox.length}
                          onChange={(e) => setCurrentBox(p => ({ ...p, length: e.target.value }))}
                          InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }}
                          inputProps={{ min: 1 }} />
                      </Grid>
                      <Grid size={{ xs: 4, sm: 2 }}>
                        <TextField fullWidth label={t('shipments.width')} type="number" value={currentBox.width}
                          onChange={(e) => setCurrentBox(p => ({ ...p, width: e.target.value }))}
                          InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }}
                          inputProps={{ min: 1 }} />
                      </Grid>
                      <Grid size={{ xs: 4, sm: 2 }}>
                        <TextField fullWidth label={t('shipments.height')} type="number" value={currentBox.height}
                          onChange={(e) => setCurrentBox(p => ({ ...p, height: e.target.value }))}
                          InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }}
                          inputProps={{ min: 1 }} />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 3 }}>
                        <Button fullWidth variant="contained" startIcon={<AddIcon />} onClick={handleAddBox}
                          sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)`, py: 1.5 }}>
                          {t('shipments.addBox')}
                        </Button>
                      </Grid>
                    </Grid>
                  </Card>

                  {/* Lista de cajas agregadas */}
                  {boxes.length > 0 && (
                    <Paper sx={{ p: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>📦 {t('wizard.boxesAdded')} ({boxes.length}):</Typography>
                      <List dense>
                        {boxes.map((box, idx) => (
                          <ListItem key={box.id} sx={{ bgcolor: idx % 2 === 0 ? 'grey.50' : 'white', borderRadius: 1 }}>
                            <ListItemIcon><Chip label={idx + 1} size="small" sx={{ bgcolor: ORANGE, color: 'white' }} /></ListItemIcon>
                            <ListItemText
                              primary={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <span>{box.weight} kg — {box.length} × {box.width} × {box.height} cm</span>
                                  {box.trackingCourier && (
                                    <Chip 
                                      size="small" 
                                      icon={<QrCodeScannerIcon sx={{ fontSize: 14 }} />} 
                                      label={box.trackingCourier} 
                                      variant="outlined" 
                                      sx={{ borderColor: ORANGE, color: ORANGE }}
                                    />
                                  )}
                                </Box>
                              }
                              secondary={`${t('wizard.volume')}: ${((parseFloat(box.length) * parseFloat(box.width) * parseFloat(box.height)) / 1000000).toFixed(4)} CBM`}
                            />
                            <ListItemSecondaryAction>
                              <IconButton edge="end" onClick={() => handleRemoveBox(box.id)}><DeleteIcon color="error" /></IconButton>
                            </ListItemSecondaryAction>
                          </ListItem>
                        ))}
                      </List>
                      <Divider sx={{ my: 2 }} />
                      <Box sx={{ display: 'flex', justifyContent: 'space-around' }}>
                        <Typography><strong>{t('shipments.totalWeight')}:</strong> {totalWeight.toFixed(2)} kg</Typography>
                        <Typography><strong>{t('shipments.totalVolume')}:</strong> {totalVolume.toFixed(4)} CBM</Typography>
                        {boxes.length > 1 && <Chip icon={<AccountTreeIcon />} label={t('wizard.willGenerateMasterChild')} color="warning" />}
                      </Box>
                    </Paper>
                  )}
                </Box>
              )}

              {/* PASO 1: FOTO & VALOR */}
              {activeStep === 1 && (
                <Card sx={{ p: 4 }}>
                  <CardContent>
                    {/* 📸 SECCIÓN DE FOTO */}
                    <Box sx={{ textAlign: 'center', mb: 3 }}>
                      <CameraAltIcon sx={{ fontSize: 60, color: ORANGE }} />
                      <Typography variant="h5">{i18n.language === 'es' ? 'Foto y Valor Declarado' : 'Photo & Declared Value'}</Typography>
                      <Typography color="text.secondary">{i18n.language === 'es' ? 'Opcional: Adjunta evidencia del paquete' : 'Optional: Attach package evidence'}</Typography>
                    </Box>
                    
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      {packageImage ? (
                        <Box sx={{ position: 'relative' }}>
                          <img 
                            src={packageImage} 
                            alt="Paquete" 
                            style={{ 
                              maxWidth: '100%', 
                              maxHeight: 200, 
                              borderRadius: 12,
                              border: `3px solid ${ORANGE}`,
                              objectFit: 'cover'
                            }} 
                          />
                          <IconButton 
                            size="small"
                            onClick={() => setPackageImage(null)}
                            sx={{ 
                              position: 'absolute', 
                              top: -10, 
                              right: -10, 
                              bgcolor: 'error.main',
                              color: 'white',
                              '&:hover': { bgcolor: 'error.dark' }
                            }}
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      ) : (
                        <Box sx={{ display: 'flex', gap: 2 }}>
                          {/* Botón para abrir cámara */}
                          <Button
                            variant="contained"
                            startIcon={<VideocamIcon />}
                            onClick={openCamera}
                            sx={{ 
                              py: 2,
                              px: 4,
                              background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)`
                            }}
                          >
                            {i18n.language === 'es' ? 'Abrir Cámara' : 'Open Camera'}
                          </Button>
                          
                          {/* Botón para subir archivo */}
                          <Button
                            variant="outlined"
                            component="label"
                            startIcon={<CameraAltIcon />}
                            sx={{ 
                              borderStyle: 'dashed', 
                              borderWidth: 2,
                              py: 2,
                              px: 4,
                              borderColor: ORANGE,
                              color: ORANGE,
                              '&:hover': { borderColor: ORANGE, bgcolor: `${ORANGE}10` }
                            }}
                          >
                            {i18n.language === 'es' ? 'Subir Foto' : 'Upload Photo'}
                            <input
                              type="file"
                              hidden
                              accept="image/*"
                              capture="environment"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    setPackageImage(reader.result as string);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </Button>
                        </Box>
                      )}
                      <Typography variant="caption" color="text.secondary">
                        {i18n.language === 'es' 
                          ? 'Opcional: Usa la cámara web o sube una foto del paquete' 
                          : 'Optional: Use webcam or upload a package photo'}
                      </Typography>
                    </Box>

                    {/* Canvas oculto para captura de cámara */}
                    <canvas ref={canvasRef} style={{ display: 'none' }} />

                    <Divider sx={{ my: 3 }} />
                    <TextField fullWidth label={`${t('shipments.declaredValue')} (USD)`} type="number" value={declaredValue}
                      onChange={(e) => setDeclaredValue(e.target.value)}
                      InputProps={{ startAdornment: <InputAdornment position="start"><AttachMoneyIcon /></InputAdornment> }}
                      helperText={t('wizard.optionalCustoms')} />
                  </CardContent>
                </Card>
              )}

              {/* PASO 2: CASILLERO + DESTINO & PAQUETERÍA (Inteligente) */}
              {activeStep === 2 && (
                <Card sx={{ p: 4 }}>
                  <CardContent>
                    {/* Búsqueda de Casillero */}
                    <Box sx={{ textAlign: 'center', mb: 3 }}>
                      <PersonIcon sx={{ fontSize: 60, color: ORANGE }} />
                      <Typography variant="h5">{i18n.language === 'es' ? 'Casillero del Cliente' : 'Customer Box ID'}</Typography>
                      <Typography color="text.secondary">
                        {i18n.language === 'es' ? 'Busca el casillero para cargar instrucciones automáticamente' : 'Search box ID to auto-load shipping preferences'}
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                      <TextField 
                        fullWidth 
                        label={i18n.language === 'es' ? 'Casillero (Box ID)' : 'Box ID'} 
                        placeholder="S2, ETX-1295..."
                        value={boxId} 
                        onChange={(e) => setBoxId(e.target.value.toUpperCase())}
                        InputProps={{ 
                          startAdornment: <InputAdornment position="start"><QrCodeScannerIcon /></InputAdornment>,
                          endAdornment: loadingClient && <CircularProgress size={20} />
                        }}
                        autoFocus
                      />
                      <Button 
                        variant="contained" 
                        onClick={() => searchClientByBoxId(boxId, carrier)}
                        disabled={!boxId || loadingClient}
                        sx={{ px: 4, background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` }}
                      >
                        {i18n.language === 'es' ? 'Buscar' : 'Search'}
                      </Button>
                    </Box>

                    {/* Resultado de búsqueda */}
                    {clientInstructions && (
                      <Box sx={{ mb: 3 }}>
                        {clientInstructions.found ? (
                          <Alert 
                            severity={clientInstructions.hasInstructions ? 'success' : 'warning'}
                            icon={clientInstructions.hasInstructions ? <AutoAwesomeIcon /> : <WarningIcon />}
                            sx={{ mb: 2 }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Avatar sx={{ bgcolor: ORANGE }}>{clientInstructions.client?.name.charAt(0)}</Avatar>
                              <Box>
                                <Typography fontWeight="bold">{clientInstructions.client?.name}</Typography>
                                <Typography variant="body2">{clientInstructions.client?.email}</Typography>
                              </Box>
                              <Chip label={clientInstructions.client?.boxId} size="small" sx={{ ml: 'auto' }} />
                            </Box>
                          </Alert>
                        ) : (
                          <Alert severity="error">
                            {i18n.language === 'es' ? 'No se encontró cliente con ese casillero' : 'No customer found with that box ID'}
                          </Alert>
                        )}

                        {/* 💰 TIPO DE CAMBIO Y COSTO ESTIMADO PO BOX */}
                        {clientInstructions.found && clientInstructions.poboxRatesInfo && (
                          <Paper sx={{ p: 2, mb: 2, bgcolor: '#FFF3E0', border: '2px solid #FF9800' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                              <AttachMoneyIcon sx={{ color: '#FF9800' }} />
                              <Typography variant="h6" fontWeight="bold" sx={{ color: '#E65100' }}>
                                {i18n.language === 'es' ? 'Tarifas PO Box USA' : 'PO Box USA Rates'}
                              </Typography>
                            </Box>
                            
                            <Grid container spacing={2}>
                              {/* Tipo de Cambio */}
                              <Grid size={4}>
                                <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'white' }}>
                                  <Typography variant="body2" color="text.secondary">
                                    {i18n.language === 'es' ? 'Tipo de Cambio' : 'Exchange Rate'}
                                  </Typography>
                                  <Typography variant="h4" fontWeight="bold" sx={{ color: ORANGE }}>
                                    ${clientInstructions.poboxRatesInfo.tipoCambio.valor.toFixed(2)}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    MXN/USD
                                  </Typography>
                                </Paper>
                              </Grid>
                              
                              {/* CBM Calculado */}
                              <Grid size={4}>
                                <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'white' }}>
                                  <Typography variant="body2" color="text.secondary">
                                    {i18n.language === 'es' ? 'Volumen (CBM)' : 'Volume (CBM)'}
                                  </Typography>
                                  <Typography variant="h4" fontWeight="bold" sx={{ color: '#1976D2' }}>
                                    {costoPOBox ? costoPOBox.cbmTotal.toFixed(4) : '0.0000'}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    m³ {costoPOBox?.nivel ? `(Nivel ${costoPOBox.nivel})` : ''}
                                  </Typography>
                                </Paper>
                              </Grid>
                              
                              {/* Costo Estimado */}
                              <Grid size={4}>
                                <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#E8F5E9' }}>
                                  <Typography variant="body2" color="text.secondary">
                                    {i18n.language === 'es' ? 'Costo Estimado' : 'Estimated Cost'}
                                  </Typography>
                                  {costoPOBox ? (
                                    <>
                                      <Typography variant="h4" fontWeight="bold" sx={{ color: '#2E7D32' }}>
                                        ${costoPOBox.totalMxn.toFixed(2)}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        MXN (${costoPOBox.totalUsd.toFixed(2)} USD)
                                      </Typography>
                                    </>
                                  ) : (
                                    <Typography variant="h5" color="text.secondary">
                                      {i18n.language === 'es' ? 'Agregar cajas' : 'Add boxes'}
                                    </Typography>
                                  )}
                                </Paper>
                              </Grid>
                            </Grid>

                            {/* Tabla de Tarifas */}
                            <Box sx={{ mt: 2 }}>
                              <Typography variant="body2" fontWeight="bold" gutterBottom>
                                📋 {i18n.language === 'es' ? 'Tarifas por Volumen:' : 'Volume Rates:'}
                              </Typography>
                              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                {clientInstructions.poboxRatesInfo.tarifasVolumen.map((tarifa, idx) => (
                                  <Chip 
                                    key={idx}
                                    label={tarifa.descripcion}
                                    size="small"
                                    sx={{ 
                                      bgcolor: costoPOBox?.desglosePorCaja?.some(c => c.nivel === tarifa.nivel) ? '#4CAF50' : 'white',
                                      color: costoPOBox?.desglosePorCaja?.some(c => c.nivel === tarifa.nivel) ? 'white' : 'text.primary',
                                      fontWeight: costoPOBox?.desglosePorCaja?.some(c => c.nivel === tarifa.nivel) ? 'bold' : 'normal'
                                    }}
                                  />
                                ))}
                              </Box>
                            </Box>

                            {/* Desglose por Caja (cuando hay múltiples) */}
                            {costoPOBox && boxes.length > 1 && (
                              <Box sx={{ mt: 2, p: 2, bgcolor: 'white', borderRadius: 1, border: '1px dashed #ccc' }}>
                                <Typography variant="body2" fontWeight="bold" gutterBottom sx={{ color: ORANGE }}>
                                  📦 {i18n.language === 'es' ? 'Desglose por Caja (cada caja se cotiza individualmente):' : 'Per-box Breakdown:'}
                                </Typography>
                                {costoPOBox.desglosePorCaja.map((caja, idx) => (
                                  <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5, borderBottom: idx < costoPOBox.desglosePorCaja.length - 1 ? '1px solid #eee' : 'none' }}>
                                    <Typography variant="body2">
                                      Caja {idx + 1}: {caja.cbm.toFixed(4)} m³ (Nivel {caja.nivel})
                                    </Typography>
                                    <Typography variant="body2" fontWeight="bold" sx={{ color: '#2E7D32' }}>
                                      ${caja.costoUsd.toFixed(2)} USD
                                    </Typography>
                                  </Box>
                                ))}
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 1, mt: 1, borderTop: '2px solid #E65100' }}>
                                  <Typography variant="body2" fontWeight="bold" sx={{ color: '#E65100' }}>
                                    TOTAL ({boxes.length} cajas)
                                  </Typography>
                                  <Typography variant="body1" fontWeight="bold" sx={{ color: '#2E7D32' }}>
                                    ${costoPOBox.totalUsd.toFixed(2)} USD = ${costoPOBox.totalMxn.toFixed(2)} MXN
                                  </Typography>
                                </Box>
                              </Box>
                            )}
                          </Paper>
                        )}
                      </Box>
                    )}

                    {/* Instrucciones Pre-cargadas o Formulario Manual */}
                    {clientInstructions?.found && (
                      <>
                        {clientInstructions.hasInstructions && !manualAddress ? (
                          // ✅ INSTRUCCIONES PRE-CARGADAS
                          <Paper sx={{ p: 3, bgcolor: '#E8F5E9', border: '2px solid #4CAF50' }}>
                            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                              <AutoAwesomeIcon sx={{ color: '#4CAF50' }} />
                              {i18n.language === 'es' ? 'Configuración Automática Detectada' : 'Auto-Configuration Detected'}
                            </Typography>
                            
                            <Grid container spacing={2}>
                              {/* Solo mostrar Paquetería/Método para envíos NO PO Box */}
                              {!clientInstructions.poboxRatesInfo && (
                                <>
                                  <Grid size={6}>
                                    <Typography variant="body2" color="text.secondary">{t('shipments.carrierLabel')}</Typography>
                                    <Chip 
                                      icon={<LocalShippingIcon />} 
                                      label={clientInstructions.preferences?.carrier || carrier || 'No especificado'} 
                                      color="primary" 
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <Typography variant="body2" color="text.secondary">{i18n.language === 'es' ? 'Método de Envío' : 'Shipping Method'}</Typography>
                                    <Chip 
                                      label={clientInstructions.preferences?.transport === 'aereo' ? '✈️ Aéreo' : 
                                             clientInstructions.preferences?.transport === 'maritimo' ? '🚢 Marítimo' : 
                                             clientInstructions.preferences?.transport || 'Estándar'} 
                                      color="secondary" 
                                    />
                                  </Grid>
                                </>
                              )}
                              <Grid size={12}>
                                <Typography variant="body2" color="text.secondary">{t('shipments.destinationAddress')}</Typography>
                                <Paper sx={{ p: 2, mt: 1, bgcolor: 'white' }}>
                                  <Box sx={{ display: 'flex', gap: 1 }}>
                                    <HomeIcon sx={{ color: ORANGE }} />
                                    <Box>
                                      <Typography fontWeight="bold">{clientInstructions.defaultAddress?.alias}</Typography>
                                      <Typography variant="body2">{clientInstructions.defaultAddress?.formatted}</Typography>
                                      {clientInstructions.defaultAddress?.phone && (
                                        <Typography variant="body2" color="text.secondary">📞 {clientInstructions.defaultAddress.phone}</Typography>
                                      )}
                                    </Box>
                                  </Box>
                                </Paper>
                              </Grid>
                            </Grid>

                            {/* 🚚 SELECCIÓN DE PAQUETERÍA SKYDROPX */}
                            <Divider sx={{ my: 3 }}>
                              <Chip label="Seleccionar Paquetería" icon={<LocalShippingIcon />} size="small" />
                            </Divider>

                            {loadingRates ? (
                              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                                <CircularProgress />
                                <Typography sx={{ ml: 2 }}>Cotizando paqueterías...</Typography>
                              </Box>
                            ) : shippingRates.length > 0 ? (
                              <>
                                {selectedRate && (
                                  <Paper sx={{ p: 2, mb: 2, bgcolor: '#C8E6C9', border: '2px solid #2E7D32' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                      <LocalShippingIcon sx={{ color: '#2E7D32', fontSize: 28 }} />
                                      <Box sx={{ flex: 1 }}>
                                        <Typography fontWeight="bold">{selectedRate.carrierName || selectedRate.provider}</Typography>
                                        <Typography variant="body2">{selectedRate.serviceName}</Typography>
                                      </Box>
                                      <Typography variant="h6" color="success.dark" fontWeight="bold">
                                        ${selectedRate.totalPrice.toFixed(2)} MXN
                                      </Typography>
                                    </Box>
                                  </Paper>
                                )}
                                <Grid container spacing={1}>
                                  {shippingRates.slice(0, 8).map((rate: any, idx: number) => (
                                    <Grid size={{ xs: 12, sm: rate.isLocal ? 12 : 6 }} key={idx}>
                                      <Paper
                                        sx={{
                                          p: rate.isLocal ? 2 : 1.5,
                                          cursor: 'pointer',
                                          border: selectedRate?.rateId === rate.rateId 
                                            ? '2px solid #2E7D32' 
                                            : rate.isLocal 
                                              ? '2px solid #F05A28'
                                              : '1px solid #ddd',
                                          bgcolor: selectedRate?.rateId === rate.rateId 
                                            ? '#E8F5E9' 
                                            : rate.isLocal 
                                              ? '#FFF3E0'
                                              : 'white',
                                          '&:hover': { bgcolor: rate.isLocal ? '#FFE0B2' : '#F5F5F5', borderColor: ORANGE }
                                        }}
                                        onClick={() => handleSelectRate(rate)}
                                      >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                          {rate.isLocal ? (
                                            <HomeIcon sx={{ color: '#F05A28', fontSize: 28 }} />
                                          ) : (
                                            <LocalShippingIcon sx={{ color: selectedRate?.rateId === rate.rateId ? '#2E7D32' : '#666', fontSize: 20 }} />
                                          )}
                                          <Box sx={{ flex: 1 }}>
                                            <Typography variant={rate.isLocal ? 'subtitle1' : 'body2'} fontWeight="bold">
                                              {rate.carrierName || rate.provider}
                                              {rate.isLocal && <Chip label="RECOMENDADO" size="small" color="warning" sx={{ ml: 1, height: 20 }} />}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">{rate.serviceName}</Typography>
                                          </Box>
                                          <Typography variant={rate.isLocal ? 'h6' : 'body2'} fontWeight="bold" color={rate.isLocal ? 'warning.main' : 'primary'}>
                                            {rate.totalPrice === 0 ? 'GRATIS' : `$${rate.totalPrice.toFixed(2)}`}
                                          </Typography>
                                        </Box>
                                      </Paper>
                                    </Grid>
                                  ))}
                                </Grid>
                              </>
                            ) : (
                              <Box sx={{ textAlign: 'center', py: 2 }}>
                                <Button
                                  variant="outlined"
                                  onClick={fetchShippingRates}
                                  startIcon={<LocalShippingIcon />}
                                  sx={{ borderColor: ORANGE, color: ORANGE }}
                                >
                                  Cotizar Paqueterías
                                </Button>
                              </Box>
                            )}

                            <Button 
                              variant="text" 
                              onClick={() => setManualAddress(true)}
                              sx={{ mt: 2, color: ORANGE }}
                            >
                              {i18n.language === 'es' ? '✏️ Modificar dirección para este envío' : '✏️ Modify address for this shipment'}
                            </Button>
                          </Paper>
                        ) : (
                          // ⚠️ FORMULARIO MANUAL (cliente sin instrucciones o editando)
                          <Paper sx={{ p: 3, bgcolor: leaveInWarehouse ? '#E3F2FD' : '#FFF8E1', border: leaveInWarehouse ? '2px solid #1976D2' : '2px solid #FFC107' }}>
                            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                              <WarningIcon sx={{ color: leaveInWarehouse ? '#1976D2' : '#FFC107' }} />
                              {i18n.language === 'es' ? 'Configurar Destino Manualmente' : 'Configure Destination Manually'}
                            </Typography>

                            {/* 📦 OPCIÓN: DEJAR EN BODEGA (solo para PO Box) */}
                            {clientInstructions?.poboxRatesInfo && (
                              <Paper 
                                onClick={() => {
                                  setLeaveInWarehouse(!leaveInWarehouse);
                                  if (!leaveInWarehouse) {
                                    setSelectedRate(null);
                                    setShippingRates([]);
                                  }
                                }}
                                sx={{ 
                                  p: 2, 
                                  mb: 3, 
                                  cursor: 'pointer',
                                  bgcolor: leaveInWarehouse ? '#1976D2' : 'white',
                                  border: leaveInWarehouse ? '2px solid #1565C0' : '2px dashed #1976D2',
                                  '&:hover': { bgcolor: leaveInWarehouse ? '#1565C0' : '#E3F2FD' }
                                }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <Inventory2Icon sx={{ color: leaveInWarehouse ? 'white' : '#1976D2', fontSize: 32 }} />
                                  <Box sx={{ flex: 1 }}>
                                    <Typography variant="subtitle1" fontWeight="bold" color={leaveInWarehouse ? 'white' : '#1976D2'}>
                                      📦 {i18n.language === 'es' ? 'Dejar en Bodega' : 'Leave in Warehouse'}
                                    </Typography>
                                    <Typography variant="body2" color={leaveInWarehouse ? 'rgba(255,255,255,0.8)' : 'text.secondary'}>
                                      {i18n.language === 'es' 
                                        ? 'El cliente configurará la dirección y paquetería desde la app'
                                        : 'Customer will configure address and shipping from the app'}
                                    </Typography>
                                  </Box>
                                  {leaveInWarehouse && <CheckCircleIcon sx={{ color: 'white', fontSize: 28 }} />}
                                </Box>
                              </Paper>
                            )}

                            {/* Info: Seleccionar paquetería después de cotizar */}
                            {!selectedRate && !leaveInWarehouse && (
                              <Alert severity="info" sx={{ mb: 3 }}>
                                {i18n.language === 'es' 
                                  ? '💡 Llena la dirección de destino y presiona "Cotizar Envío Nacional" para ver las opciones de paquetería y precios.'
                                  : '💡 Fill in the destination address and press "Quote National Shipping" to see carrier options and prices.'}
                              </Alert>
                            )}

                            {/* Paquetería seleccionada (si hay) */}
                            {selectedRate && !leaveInWarehouse && (
                              <Paper sx={{ p: 2, mb: 3, bgcolor: '#E8F5E9', border: '2px solid #4CAF50' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <LocalShippingIcon sx={{ color: '#4CAF50', fontSize: 32 }} />
                                  <Box sx={{ flex: 1 }}>
                                    <Typography variant="subtitle1" fontWeight="bold">
                                      {selectedRate.carrierName || selectedRate.provider}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      {selectedRate.serviceName}
                                    </Typography>
                                  </Box>
                                  <Typography variant="h5" color="success.main" fontWeight="bold">
                                    ${selectedRate.totalPrice.toFixed(2)} MXN
                                  </Typography>
                                </Box>
                              </Paper>
                            )}

                            {/* Solo mostrar formulario si NO está en modo "Dejar en Bodega" */}
                            {!leaveInWarehouse && (
                              <>
                            <Divider sx={{ my: 2 }}><Chip label={i18n.language === 'es' ? '👤 Datos del Destinatario' : '👤 Recipient Info'} icon={<PersonIcon />} size="small" /></Divider>

                            <Grid container spacing={2}>
                              <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField fullWidth label={i18n.language === 'es' ? 'Nombre *' : 'First Name *'} value={destination.firstName}
                                  onChange={(e) => setDestination(prev => ({ ...prev, firstName: e.target.value, contact: `${e.target.value} ${prev.lastName}`.trim() }))}
                                  placeholder={i18n.language === 'es' ? 'Ej: Juan' : 'E.g.: John'} />
                              </Grid>
                              <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField fullWidth label={i18n.language === 'es' ? 'Apellido *' : 'Last Name *'} value={destination.lastName}
                                  onChange={(e) => setDestination(prev => ({ ...prev, lastName: e.target.value, contact: `${prev.firstName} ${e.target.value}`.trim() }))}
                                  placeholder={i18n.language === 'es' ? 'Ej: Pérez' : 'E.g.: Smith'} />
                              </Grid>
                              <Grid size={{ xs: 4, sm: 2 }}>
                                <FormControl fullWidth>
                                  <InputLabel>{i18n.language === 'es' ? 'Lada' : 'Code'}</InputLabel>
                                  <Select value={destination.phoneCode} label={i18n.language === 'es' ? 'Lada' : 'Code'}
                                    onChange={(e: SelectChangeEvent) => setDestination(prev => ({ ...prev, phoneCode: e.target.value }))}>
                                    <MenuItem value="+52">🇲🇽 +52</MenuItem>
                                    <MenuItem value="+1">🇺🇸 +1</MenuItem>
                                    <MenuItem value="+86">🇨🇳 +86</MenuItem>
                                    <MenuItem value="+57">🇨🇴 +57</MenuItem>
                                    <MenuItem value="+502">🇬🇹 +502</MenuItem>
                                    <MenuItem value="+34">🇪🇸 +34</MenuItem>
                                  </Select>
                                </FormControl>
                              </Grid>
                              <Grid size={{ xs: 8, sm: 4 }}>
                                <TextField fullWidth label={t('shipments.phone')} value={destination.phone}
                                  onChange={(e) => setDestination(prev => ({ ...prev, phone: e.target.value.replace(/[^\d]/g, '') }))}
                                  placeholder="81 1234 5678" />
                              </Grid>
                              <Grid size={{ xs: 12, sm: 6 }}>
                                <FormControl fullWidth>
                                  <InputLabel>{t('shipments.country')} *</InputLabel>
                                  <Select value={destination.country} label={`${t('shipments.country')} *`} 
                                    onChange={(e: SelectChangeEvent) => setDestination(prev => ({ ...prev, country: e.target.value }))}>
                                    {COUNTRIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                                  </Select>
                                </FormControl>
                              </Grid>
                            </Grid>

                            <Divider sx={{ my: 2 }}><Chip label={t('shipments.destinationAddress')} icon={<PlaceIcon />} size="small" /></Divider>

                            <Grid container spacing={2}>
                              <Grid size={{ xs: 12, sm: 4 }}>
                                <TextField fullWidth label={`${t('shipments.zipCode')} *`} value={destination.zip}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, '').slice(0, 5);
                                    setDestination(prev => ({ ...prev, zip: val }));
                                    if (val.length === 5) {
                                      handleZipCodeLookup(val);
                                    } else {
                                      setColonyOptions([]);
                                    }
                                  }}
                                  placeholder="00000"
                                  slotProps={{ input: { endAdornment: loadingZipcode ? <CircularProgress size={18} /> : null } }} />
                              </Grid>
                              <Grid size={{ xs: 12, sm: 4 }}>
                                <TextField fullWidth label={`${i18n.language === 'es' ? 'Ciudad' : 'City'} *`} value={destination.city}
                                  onChange={(e) => setDestination(prev => ({ ...prev, city: e.target.value }))}
                                  placeholder={i18n.language === 'es' ? 'Ej: Monterrey' : 'E.g.: Monterrey'}
                                  slotProps={{ input: { readOnly: !!destination.city && colonyOptions.length > 0 } }}
                                  sx={{ '& .MuiInputBase-input': { bgcolor: destination.city && colonyOptions.length > 0 ? '#f5f5f5' : 'inherit' } }} />
                              </Grid>
                              <Grid size={{ xs: 12, sm: 4 }}>
                                <TextField fullWidth label={i18n.language === 'es' ? 'Estado' : 'State'} value={destination.state}
                                  onChange={(e) => setDestination(prev => ({ ...prev, state: e.target.value }))}
                                  placeholder={i18n.language === 'es' ? 'Ej: Nuevo León' : 'E.g.: Nuevo León'}
                                  slotProps={{ input: { readOnly: !!destination.state && colonyOptions.length > 0 } }}
                                  sx={{ '& .MuiInputBase-input': { bgcolor: destination.state && colonyOptions.length > 0 ? '#f5f5f5' : 'inherit' } }} />
                              </Grid>
                              <Grid size={{ xs: 12, sm: 6 }}>
                                <Autocomplete
                                  freeSolo
                                  options={colonyOptions}
                                  value={destination.colony}
                                  onChange={(_e, val) => setDestination(prev => ({ ...prev, colony: val || '' }))}
                                  onInputChange={(_e, val) => setDestination(prev => ({ ...prev, colony: val || '' }))}
                                  renderInput={(params) => (
                                    <TextField {...params} label={`${i18n.language === 'es' ? 'Colonia' : 'Neighborhood'} *`}
                                      placeholder={colonyOptions.length > 0 ? (i18n.language === 'es' ? 'Selecciona colonia...' : 'Select neighborhood...') : (i18n.language === 'es' ? 'Ingresa CP para cargar colonias' : 'Enter zip to load neighborhoods')} />
                                  )}
                                  noOptionsText={i18n.language === 'es' ? 'Ingresa el CP primero' : 'Enter zip code first'}
                                />
                              </Grid>
                              <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField fullWidth label={`${i18n.language === 'es' ? 'Calle y Número' : 'Street & Number'} *`} value={destination.address}
                                  onChange={(e) => setDestination(prev => ({ ...prev, address: e.target.value }))}
                                  placeholder={i18n.language === 'es' ? 'Ej: Av. Revolución 123' : 'E.g.: 123 Main St'} />
                              </Grid>
                            </Grid>

                            {/* 🚚 BOTÓN COTIZAR CON SKYDROPX */}
                            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
                              <Button
                                variant="contained"
                                onClick={fetchShippingRates}
                                disabled={!destination.city || !destination.zip || loadingRates}
                                startIcon={loadingRates ? <CircularProgress size={20} color="inherit" /> : <LocalShippingIcon />}
                                sx={{ 
                                  px: 4, 
                                  py: 1.5,
                                  background: `linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)`,
                                  '&:hover': { background: `linear-gradient(135deg, #1565c0 0%, #1976d2 100%)` }
                                }}
                              >
                                {loadingRates 
                                  ? (i18n.language === 'es' ? 'Cotizando...' : 'Quoting...') 
                                  : (i18n.language === 'es' ? '🚚 Cotizar Envío Nacional' : '🚚 Quote National Shipping')}
                              </Button>
                            </Box>

                            {/* 📋 LISTA DE TARIFAS SKYDROPX */}
                            {shippingRates.length > 0 && (
                              <Box sx={{ mt: 3 }}>
                                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <LocalShippingIcon sx={{ color: '#1976d2' }} />
                                  {i18n.language === 'es' ? 'Opciones de Envío Disponibles' : 'Available Shipping Options'}
                                </Typography>
                                <Grid container spacing={2}>
                                  {shippingRates.map((rate, index) => (
                                    <Grid size={{ xs: 12, sm: 6, md: 4 }} key={rate.rateId || index}>
                                      <Paper
                                        onClick={() => handleSelectRate(rate)}
                                        sx={{
                                          p: 2,
                                          cursor: 'pointer',
                                          border: selectedRate?.rateId === rate.rateId ? `3px solid ${ORANGE}` : '1px solid #ddd',
                                          bgcolor: selectedRate?.rateId === rate.rateId ? '#FFF3E0' : 'white',
                                          transition: 'all 0.2s',
                                          '&:hover': { 
                                            boxShadow: 3,
                                            borderColor: ORANGE
                                          }
                                        }}
                                      >
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                          <Typography variant="subtitle1" fontWeight="bold" sx={{ textTransform: 'capitalize' }}>
                                            {rate.carrierName || rate.provider}
                                          </Typography>
                                          {selectedRate?.rateId === rate.rateId && (
                                            <CheckCircleIcon sx={{ color: ORANGE }} />
                                          )}
                                        </Box>
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                          {rate.serviceName}
                                        </Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                                          <Typography variant="h5" color="primary" fontWeight="bold">
                                            ${rate.totalPrice.toFixed(2)}
                                          </Typography>
                                          <Typography variant="body2" color="text.secondary">MXN</Typography>
                                        </Box>
                                        {rate.deliveryDays > 0 && (
                                          <Chip 
                                            label={`${rate.deliveryDays} ${rate.deliveryDays === 1 ? 'día' : 'días'}`}
                                            size="small"
                                            sx={{ mt: 1 }}
                                            color="info"
                                          />
                                        )}
                                      </Paper>
                                    </Grid>
                                  ))}
                                </Grid>

                                {selectedRate && (
                                  <Alert severity="success" sx={{ mt: 2 }}>
                                    <strong>{i18n.language === 'es' ? 'Seleccionado:' : 'Selected:'}</strong> {selectedRate.carrierName || selectedRate.provider} - ${selectedRate.totalPrice.toFixed(2)} MXN
                                  </Alert>
                                )}
                              </Box>
                            )}

                            {manualAddress && !leaveInWarehouse && (
                              <Button 
                                variant="text" 
                                onClick={() => {
                                  setManualAddress(false);
                                  // Recargar datos originales
                                  if (clientInstructions?.defaultAddress) {
                                    const addr = clientInstructions.defaultAddress;
                                    const nameParts = (addr.recipientName || '').split(' ');
                                    const rawPh = addr.phone || '';
                                    const phMatch = rawPh.match(/^(\+\d{1,3})[\s-]?(.+)$/);
                                    setDestination({
                                      country: 'México',
                                      city: addr.city,
                                      state: addr.state || '',
                                      colony: addr.neighborhood || '',
                                      address: `${addr.street} ${addr.exteriorNumber || ''}`,
                                      zip: addr.zipCode,
                                      phoneCode: phMatch ? phMatch[1] : '+52',
                                      phone: phMatch ? phMatch[2].replace(/[^\d]/g, '') : rawPh.replace(/[^\d]/g, ''),
                                      firstName: nameParts[0] || '',
                                      lastName: nameParts.slice(1).join(' ') || '',
                                      contact: addr.recipientName || ''
                                    });
                                    if (addr.zipCode && /^\d{5}$/.test(addr.zipCode)) {
                                      handleZipCodeLookup(addr.zipCode, false);
                                    }
                                  }
                                }}
                                sx={{ mt: 2 }}
                              >
                                {i18n.language === 'es' ? '↩️ Volver a usar instrucciones guardadas' : '↩️ Use saved instructions'}
                              </Button>
                            )}
                              </>
                            )}
                          </Paper>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* PASO 3: CONFIRMACIÓN FINAL Y DESCRIPCIÓN */}
              {activeStep === 3 && (
                <Card sx={{ p: 4 }}>
                  <CardContent>
                    <Box sx={{ textAlign: 'center', mb: 3 }}>
                      <CheckCircleIcon sx={{ fontSize: 60, color: ORANGE }} />
                      <Typography variant="h5">{i18n.language === 'es' ? 'Confirmar y Registrar' : 'Confirm & Register'}</Typography>
                    </Box>

                    {/* Info del Cliente */}
                    {clientInstructions?.client && (
                      <Paper sx={{ p: 2, mb: 3, bgcolor: '#E3F2FD', border: '2px solid #2196F3' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Avatar sx={{ bgcolor: ORANGE, width: 48, height: 48 }}>
                            {clientInstructions.client.name.charAt(0)}
                          </Avatar>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="h6">{clientInstructions.client.name}</Typography>
                            <Typography variant="body2" color="text.secondary">{clientInstructions.client.email}</Typography>
                          </Box>
                          <Chip label={clientInstructions.client.boxId} color="primary" size="medium" />
                        </Box>
                      </Paper>
                    )}

                    {/* Descripción del contenido */}
                    {formError && (
                      <Alert severity="error" sx={{ mb: 2 }}>
                        {formError}
                      </Alert>
                    )}
                    <TextField 
                      fullWidth 
                      label={t('shipments.contentDescription')} 
                      placeholder={i18n.language === 'es' ? 'Ej: Ropa, Zapatos, Electrónicos...' : 'E.g.: Clothes, Shoes, Electronics...'}
                      value={description} 
                      onChange={(e) => setDescription(e.target.value)} 
                      sx={{ mb: 3 }} 
                    />
                    
                    <TextField 
                      fullWidth 
                      label={t('shipments.additionalNotes')} 
                      placeholder={i18n.language === 'es' ? 'Observaciones...' : 'Observations...'}
                      value={notes} 
                      onChange={(e) => setNotes(e.target.value)} 
                      multiline 
                      rows={2}
                      sx={{ mb: 3 }}
                    />
                    
                    {/* Resumen del Envío */}
                    <Paper sx={{ p: 3, bgcolor: 'grey.50', border: '1px solid #E0E0E0' }}>
                      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        📋 {i18n.language === 'es' ? 'Resumen del Envío' : 'Shipment Summary'}
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid size={6}>
                          <Typography variant="body2" color="text.secondary">{t('shipments.boxes')}</Typography>
                          <Typography variant="h6">📦 {boxes.length} {boxes.length > 1 ? 'cajas' : 'caja'}</Typography>
                        </Grid>
                        <Grid size={6}>
                          <Typography variant="body2" color="text.secondary">{t('shipments.totalWeight')}</Typography>
                          <Typography variant="h6">⚖️ {totalWeight.toFixed(2)} kg</Typography>
                        </Grid>
                        <Grid size={6}>
                          <Typography variant="body2" color="text.secondary">{t('shipments.carrier')}</Typography>
                          <Typography variant="h6">
                            {leaveInWarehouse ? '📦 En Bodega (cliente asignará)' : `🚚 ${carrier || 'No seleccionado'}`}
                          </Typography>
                        </Grid>
                        <Grid size={6}>
                          <Typography variant="body2" color="text.secondary">{t('shipments.destination')}</Typography>
                          <Typography variant="h6">
                            {leaveInWarehouse ? '⏳ Pendiente (cliente asignará)' : `📍 ${destination.city || 'No definido'}`}
                          </Typography>
                        </Grid>
                        {trackingProvider && (
                          <Grid size={12}>
                            <Typography variant="body2" color="text.secondary">Tracking USA</Typography>
                            <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>📦 {trackingProvider}</Typography>
                          </Grid>
                        )}
                        {declaredValue && (
                          <Grid size={6}>
                            <Typography variant="body2" color="text.secondary">{t('shipments.declaredValue')}</Typography>
                            <Typography variant="h6">💰 ${declaredValue} USD</Typography>
                          </Grid>
                        )}
                      </Grid>

                      {/* 🛡️ SECCIÓN GEX - GARANTÍA EXTENDIDA */}
                      {declaredValue && parseFloat(declaredValue) > 0 && (
                        <Paper sx={{ p: 2, mt: 3, bgcolor: includeGex ? '#E8F5E9' : '#FFF8E1', border: `2px solid ${includeGex ? '#4CAF50' : '#FFC107'}` }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="h6">🛡️ Garantía Extendida GEX</Typography>
                              {loadingGex && <CircularProgress size={20} />}
                            </Box>
                            <Chip 
                              label={includeGex ? '✅ Incluida' : 'Opcional'} 
                              color={includeGex ? 'success' : 'warning'} 
                              size="small" 
                            />
                          </Box>
                          
                          {gexQuote ? (
                            <>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Protege tu envío contra pérdida o daño. En caso de siniestro, se requiere factura original.
                              </Typography>
                              
                              <Grid container spacing={1} sx={{ mb: 2 }}>
                                <Grid size={6}>
                                  <Typography variant="caption" color="text.secondary">Valor Asegurado</Typography>
                                  <Typography fontWeight="bold">${gexQuote.insuredValueMxn.toFixed(2)} MXN</Typography>
                                </Grid>
                                <Grid size={6}>
                                  <Typography variant="caption" color="text.secondary">Tipo de Cambio</Typography>
                                  <Typography fontWeight="bold">${gexQuote.exchangeRate.toFixed(2)}</Typography>
                                </Grid>
                                <Grid size={6}>
                                  <Typography variant="caption" color="text.secondary">5% Valor Asegurado</Typography>
                                  <Typography>${gexQuote.variableFeeMxn.toFixed(2)} MXN</Typography>
                                </Grid>
                                <Grid size={6}>
                                  <Typography variant="caption" color="text.secondary">Cargo Fijo GEX</Typography>
                                  <Typography>${gexQuote.fixedFeeMxn.toFixed(2)} MXN</Typography>
                                </Grid>
                              </Grid>
                              
                              <Divider sx={{ my: 2 }} />
                              
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Checkbox 
                                    checked={includeGex}
                                    onChange={(e) => setIncludeGex(e.target.checked)}
                                    sx={{ color: ORANGE, '&.Mui-checked': { color: '#4CAF50' } }}
                                  />
                                  <Typography fontWeight="bold">
                                    {includeGex ? '✅ GEX Activada' : 'Agregar Protección GEX'}
                                  </Typography>
                                </Box>
                                <Typography variant="h5" color={includeGex ? 'success.main' : 'text.primary'} fontWeight="bold">
                                  ${gexQuote.totalCostMxn.toFixed(2)} MXN
                                </Typography>
                              </Box>
                            </>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              Cotizando protección GEX...
                            </Typography>
                          )}
                        </Paper>
                      )}

                      {/* RESUMEN TOTAL DE COSTOS - Mostrar cuando hay paquetería O costo PO Box */}
                      {(selectedRate || costoPOBox) && (
                        <Paper sx={{ p: 2, mt: 2, bgcolor: '#E3F2FD', border: '2px solid #2196F3' }}>
                          <Typography variant="h6" gutterBottom>💵 Resumen de Costos</Typography>
                          <Grid container spacing={1}>
                            {/* Costo de Envío Nacional (paquetería) */}
                            {selectedRate && (
                              <>
                                <Grid size={8}>
                                  <Typography>Envío Nacional ({selectedRate.carrierName || carrier})</Typography>
                                </Grid>
                                <Grid size={4}>
                                  <Typography textAlign="right" fontWeight="bold">${selectedRate.totalPrice.toFixed(2)} MXN</Typography>
                                </Grid>
                              </>
                            )}
                            
                            {/* Costo de Servicio PO Box USA */}
                            {costoPOBox && (
                              <>
                                <Grid size={8}>
                                  <Typography>📦 Servicio PO Box USA ({costoPOBox.cbmTotal.toFixed(4)} m³)</Typography>
                                </Grid>
                                <Grid size={4}>
                                  <Typography textAlign="right" fontWeight="bold">${costoPOBox.totalMxn.toFixed(2)} MXN</Typography>
                                </Grid>
                              </>
                            )}
                            
                            {/* Costo de Garantía GEX */}
                            {includeGex && gexQuote && (
                              <>
                                <Grid size={8}>
                                  <Typography>🛡️ Garantía GEX</Typography>
                                </Grid>
                                <Grid size={4}>
                                  <Typography textAlign="right" fontWeight="bold">${gexQuote.totalCostMxn.toFixed(2)} MXN</Typography>
                                </Grid>
                              </>
                            )}
                            
                            <Grid size={12}><Divider sx={{ my: 1 }} /></Grid>
                            
                            {/* TOTAL A COBRAR */}
                            <Grid size={8}>
                              <Typography variant="h6">TOTAL A COBRAR</Typography>
                            </Grid>
                            <Grid size={4}>
                              <Typography variant="h6" textAlign="right" color="primary" fontWeight="bold">
                                ${(
                                  (selectedRate?.totalPrice || 0) + 
                                  (costoPOBox?.totalMxn || 0) + 
                                  (includeGex && gexQuote ? gexQuote.totalCostMxn : 0)
                                ).toFixed(2)} MXN
                              </Typography>
                            </Grid>
                          </Grid>
                          
                          {/* OPCIONES DE PAGO */}
                          {((costoPOBox?.totalMxn || 0) + (includeGex && gexQuote ? gexQuote.totalCostMxn : 0)) > 0 && (
                            <Box sx={{ mt: 3, pt: 2, borderTop: '1px dashed #ccc' }}>
                              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                Seleccionar opción de cobro: {!paymentOption && <span style={{ color: '#f44336' }}>*</span>}
                              </Typography>
                              <Grid container spacing={2}>
                                <Grid size={6}>
                                  <Button
                                    variant={paymentOption === 'now' ? 'contained' : 'outlined'}
                                    fullWidth
                                    size="large"
                                    onClick={() => {
                                      setPaymentOption('now');
                                      // TODO: Navegar a pasarela de pago cuando esté implementada
                                      setSnackbar({ open: true, message: '💳 Opción "Pagar Ahora" seleccionada. La pasarela de pago aún no está implementada.', severity: 'info' });
                                    }}
                                    sx={{ 
                                      py: 1.5,
                                      bgcolor: paymentOption === 'now' ? '#4CAF50' : 'transparent',
                                      borderColor: '#4CAF50',
                                      color: paymentOption === 'now' ? 'white' : '#4CAF50',
                                      '&:hover': { bgcolor: paymentOption === 'now' ? '#388E3C' : '#4CAF5010', borderColor: '#4CAF50' }
                                    }}
                                    startIcon={<AttachMoneyIcon />}
                                  >
                                    💳 Pagar Ahora
                                  </Button>
                                </Grid>
                                <Grid size={6}>
                                  <Button
                                    variant={paymentOption === 'later' ? 'contained' : 'outlined'}
                                    fullWidth
                                    size="large"
                                    onClick={() => setPaymentOption('later')}
                                    sx={{ 
                                      py: 1.5,
                                      bgcolor: paymentOption === 'later' ? ORANGE : 'transparent',
                                      borderColor: ORANGE,
                                      color: paymentOption === 'later' ? 'white' : ORANGE,
                                      '&:hover': { bgcolor: paymentOption === 'later' ? '#ff7849' : `${ORANGE}10`, borderColor: ORANGE }
                                    }}
                                  >
                                    📝 Cobrar Después
                                  </Button>
                                </Grid>
                              </Grid>
                              {paymentOption === 'later' && (
                                <Alert severity="info" sx={{ mt: 2 }}>
                                  ✅ Podrás registrar el envío. El cobro quedará pendiente en la cuenta del cliente.
                                </Alert>
                              )}
                              {paymentOption === 'now' && (
                                <Alert severity="warning" sx={{ mt: 2 }}>
                                  ⚠️ La pasarela de pago aún no está implementada. Por ahora selecciona "Cobrar Después" para continuar.
                                </Alert>
                              )}
                              {!paymentOption && (
                                <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
                                  ⚠️ Debes seleccionar una opción de cobro para registrar el envío
                                </Typography>
                              )}
                            </Box>
                          )}
                        </Paper>
                      )}

                      {boxes.length > 1 && (
                        <Alert severity="info" sx={{ mt: 2 }} icon={<AccountTreeIcon />}>
                          {i18n.language === 'es' 
                            ? `Se generará una guía MASTER + ${boxes.length} guías hijas` 
                            : `Will generate a MASTER label + ${boxes.length} child labels`}
                        </Alert>
                      )}

                      {clientInstructions?.hasInstructions && !manualAddress && (
                        <Alert severity="success" sx={{ mt: 2 }} icon={<AutoAwesomeIcon />}>
                          {i18n.language === 'es' 
                            ? '✅ Instrucciones de envío pre-configuradas aplicadas' 
                            : '✅ Pre-configured shipping instructions applied'}
                        </Alert>
                      )}
                    </Paper>
                  </CardContent>
                </Card>
              )}

              {/* PASO 4: CONFIRMACIÓN */}
              {activeStep === 4 && createdShipment && (
                <Card sx={{ p: 4, textAlign: 'center', border: `3px solid ${ORANGE}` }}>
                  <CardContent>
                    <CheckCircleIcon sx={{ fontSize: 100, color: '#4caf50', mb: 2 }} />
                    <Typography variant="h4" gutterBottom>{t('shipments.shipmentRegistered')}!</Typography>
                    
                    <Typography variant="h3" sx={{ color: ORANGE, fontWeight: 'bold', my: 2 }}>
                      {createdShipment.labels[0]?.tracking}
                    </Typography>

                    {createdShipment.labels.length > 1 && (
                      <Box sx={{ mb: 2 }}>
                        <Chip icon={<AccountTreeIcon />} label={t('shipments.masterTracking').toUpperCase()} color="warning" sx={{ mb: 1 }} />
                        <Typography variant="body2" color="text.secondary">
                          + {createdShipment.labels.length - 1} {t('shipments.childTrackings')}
                        </Typography>
                      </Box>
                    )}

                    <Divider sx={{ my: 3 }} />

                    <Button variant="contained" size="large" startIcon={<PrintIcon />}
                      onClick={() => handlePrintLabels(createdShipment.labels)}
                      sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)`, px: 4, py: 1.5, fontSize: 18 }}>
                      {t('shipments.printLabels')} ({createdShipment.labels.length})
                    </Button>

                    <Box sx={{ mt: 3 }}>
                      <Button onClick={handleOpenWizard} sx={{ mr: 2 }}>+ {t('wizard.receiveAnother')}</Button>
                      <Button onClick={handleCloseWizard} variant="outlined">{t('common.close')}</Button>
                    </Box>
                  </CardContent>
                </Card>
              )}
            </Box>
          </Fade>
        </DialogContent>

        {activeStep < 4 && (
          <DialogActions sx={{ p: 3, borderTop: '1px solid #eee' }}>
            <Button onClick={handleBackStep} disabled={activeStep === 0} startIcon={<ArrowBackIcon />}>{t('common.back')}</Button>
            <Box sx={{ flex: 1 }} />
            <Button variant="contained" onClick={handleNextStep} disabled={submitting}
              endIcon={activeStep === 3 ? <CheckCircleIcon /> : <ArrowForwardIcon />}
              sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)`, px: 4 }}>
              {submitting ? <CircularProgress size={24} /> : (activeStep === 3 ? t('shipments.registerShipment') : t('common.next'))}
            </Button>
          </DialogActions>
        )}
      </Dialog>

      {/* Camera Dialog */}
      <Dialog open={cameraOpen} onClose={closeCamera} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: BLACK, color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <VideocamIcon sx={{ color: ORANGE }} />
            <Typography variant="h6">{i18n.language === 'es' ? 'Capturar Foto' : 'Capture Photo'}</Typography>
          </Box>
          <IconButton onClick={closeCamera} sx={{ color: 'white' }}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', bgcolor: 'black' }}>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline
            style={{ 
              width: '100%', 
              maxHeight: '60vh',
              objectFit: 'contain'
            }} 
          />
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', p: 3 }}>
          <Button 
            variant="contained" 
            size="large"
            onClick={capturePhoto}
            startIcon={<CameraAltIcon />}
            sx={{ 
              background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)`,
              px: 6,
              py: 2,
              fontSize: 18
            }}
          >
            {i18n.language === 'es' ? '📸 Capturar' : '📸 Capture'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Print Dialog */}
      <Dialog open={printDialogOpen} onClose={() => setPrintDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle><Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}><PrintIcon sx={{ color: ORANGE }} />{t('shipments.printLabels')}</Box></DialogTitle>
        <DialogContent>
          <Typography gutterBottom>{t('shipments.printLabelsCount', { count: labelsToPrint.length })}</Typography>
          <Box sx={{ bgcolor: 'grey.100', p: 2, borderRadius: 2, mt: 2 }}>
            {labelsToPrint.map((label) => (
              <Chip key={label.labelCode} icon={label.isMaster ? <AccountTreeIcon /> : undefined}
                label={`${label.isMaster ? `🏷️ MASTER: ` : `📦 ${label.boxNumber}/${label.totalBoxes}: `}${label.tracking}`}
                sx={{ m: 0.5 }} color={label.isMaster ? 'warning' : 'default'} />
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrintDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" startIcon={<PrintIcon />} onClick={executePrint}
            sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` }}>{t('shipments.print')}</Button>
        </DialogActions>
      </Dialog>

      {/* Status Dialog */}
      <Dialog open={statusDialogOpen} onClose={() => setStatusDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('shipments.changeStatus')}</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>{t('shipments.package')}: <strong>{selectedPackage?.tracking}</strong></Typography>
          {selectedPackage?.isMaster && <Alert severity="info" sx={{ mb: 2 }}>{t('shipments.masterWillUpdateChildren')}</Alert>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 2 }}>
            {(['received', 'received_mty', 'in_transit', 'processing', 'ready_pickup', 'delivered', 'shipped'] as PackageStatus[]).map((status) => (
              <Button key={status} variant={selectedPackage?.status === status ? 'contained' : 'outlined'}
                onClick={() => handleStatusChange(status)} startIcon={<span>{getStatusIcon(status)}</span>}
                disabled={selectedPackage?.status === status} fullWidth
                sx={{ justifyContent: 'flex-start', ...(selectedPackage?.status === status && { background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` }) }}>
                {getStatusLabel(status)}
              </Button>
            ))}
          </Box>
        </DialogContent>
        <DialogActions><Button onClick={() => setStatusDialogOpen(false)}>{t('common.close')}</Button></DialogActions>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: BLACK, color: 'white' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">📦 {t('shipments.shipmentDetails')}</Typography>
            <IconButton onClick={() => setDetailsOpen(false)} sx={{ color: 'white' }}><CloseIcon /></IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {selectedPackage && (
            <Box>
              <Box sx={{ textAlign: 'center', mb: 3 }}>
                {selectedPackage.isMaster && <Chip icon={<AccountTreeIcon />} label={t('shipments.masterTracking').toUpperCase()} color="warning" sx={{ mb: 1 }} />}
                <Typography variant="h4" sx={{ color: ORANGE, fontWeight: 'bold' }}>{selectedPackage.tracking}</Typography>
              </Box>
              <Grid container spacing={2}>
                <Grid size={6}><Typography variant="body2" color="text.secondary">{t('clients.client')}</Typography>
                  {editingClient ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                      <TextField
                        size="small"
                        value={editClientBoxId}
                        onChange={(e) => setEditClientBoxId(e.target.value.toUpperCase())}
                        placeholder="Ej: S1234"
                        autoFocus
                        disabled={savingClient}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (async () => {
                              if (!selectedPackage) return;
                              setSavingClient(true);
                              try {
                                const resp = await axios.patch(`${API_URL}/packages/${selectedPackage.id}/client`, { boxId: editClientBoxId.trim() }, { headers: { Authorization: `Bearer ${getToken()}` } });
                                setSelectedPackage({ ...selectedPackage, client: resp.data.client });
                                setPackages(prev => prev.map(p => p.id === selectedPackage.id ? { ...p, client: resp.data.client } : p));
                                setEditingClient(false);
                                setSnackbar({ open: true, message: resp.data.message, severity: 'success' });
                              } catch (err: any) {
                                setSnackbar({ open: true, message: err.response?.data?.error || 'Error al asignar cliente', severity: 'error' });
                              } finally { setSavingClient(false); }
                            })();
                          }
                          if (e.key === 'Escape') { setEditingClient(false); }
                        }}
                        sx={{ width: 100, '& .MuiInputBase-input': { py: 0.5, px: 1, fontSize: 14 } }}
                      />
                      <IconButton size="small" color="primary" disabled={savingClient} onClick={async () => {
                        if (!selectedPackage) return;
                        setSavingClient(true);
                        try {
                          const resp = await axios.patch(`${API_URL}/packages/${selectedPackage.id}/client`, { boxId: editClientBoxId.trim() }, { headers: { Authorization: `Bearer ${getToken()}` } });
                          setSelectedPackage({ ...selectedPackage, client: resp.data.client });
                          setPackages(prev => prev.map(p => p.id === selectedPackage.id ? { ...p, client: resp.data.client } : p));
                          setEditingClient(false);
                          setSnackbar({ open: true, message: resp.data.message, severity: 'success' });
                        } catch (err: any) {
                          setSnackbar({ open: true, message: err.response?.data?.error || 'Error al asignar cliente', severity: 'error' });
                        } finally { setSavingClient(false); }
                      }}>
                        {savingClient ? <CircularProgress size={16} /> : <SaveIcon sx={{ fontSize: 18 }} />}
                      </IconButton>
                      <IconButton size="small" onClick={() => setEditingClient(false)} disabled={savingClient}>
                        <CloseIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box>
                        <Typography fontWeight="bold">{selectedPackage.client?.name || 'Sin Cliente'}</Typography>
                        <Chip label={selectedPackage.client?.boxId || 'N/A'} size="small" sx={{ mt: 0.5 }} />
                      </Box>
                      <IconButton size="small" onClick={() => { setEditClientBoxId(selectedPackage.client?.boxId || ''); setEditingClient(true); }} sx={{ ml: 0.5 }}>
                        <EditIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                      </IconButton>
                    </Box>
                  )}
                </Grid>
                <Grid size={6}><Typography variant="body2" color="text.secondary">{t('common.status')}</Typography><Chip icon={<span>{getStatusIcon(selectedPackage.status)}</span>} label={getStatusLabel(selectedPackage.status)} color={getStatusColor(selectedPackage.status)} /></Grid>
                <Grid size={6}><Typography variant="body2" color="text.secondary">{t('shipments.totalWeight')}</Typography><Typography>{selectedPackage.weight ? `${selectedPackage.weight} kg` : '-'}</Typography></Grid>
                <Grid size={6}><Typography variant="body2" color="text.secondary">{t('shipments.boxes')}</Typography><Typography>{selectedPackage.totalBoxes || 1}</Typography></Grid>
                <Grid size={12}><Typography variant="body2" color="text.secondary">{t('common.description')}</Typography><Typography>{selectedPackage.description}</Typography></Grid>
                {selectedPackage.trackingProvider && <Grid size={12}><Typography variant="body2" color="text.secondary">{t('shipments.trackingProvider')}</Typography><Typography fontFamily="monospace">{selectedPackage.trackingProvider}</Typography></Grid>}
                <Grid size={12}><Typography variant="body2" color="text.secondary">{t('shipments.receivedAt')}</Typography><Typography>{new Date(selectedPackage.receivedAt).toLocaleString(i18n.language === 'es' ? 'es-MX' : 'en-US')}</Typography></Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button startIcon={<PrintIcon />} onClick={async () => {
            if (selectedPackage) {
              const response = await axios.get(`${API_URL}/packages/${selectedPackage.id}/labels`, { headers: { Authorization: `Bearer ${getToken()}` } });
              handlePrintLabels(response.data.labels);
            }
          }}>{t('shipments.printLabels')}</Button>
          <Button onClick={() => setDetailsOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(prev => ({ ...prev, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={() => setSnackbar(prev => ({ ...prev, open: false }))} severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
