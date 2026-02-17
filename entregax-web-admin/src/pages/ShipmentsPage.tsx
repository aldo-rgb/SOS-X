import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Chip, Avatar, IconButton, TextField, InputAdornment, Button, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, Divider, CircularProgress, Alert,
  MenuItem, Select, FormControl, InputLabel, type SelectChangeEvent, Snackbar, Stepper,
  Step, StepLabel, Card, CardContent, Grid, Fade, Badge, List, ListItem, ListItemText,
  ListItemSecondaryAction, ListItemIcon,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import InventoryIcon from '@mui/icons-material/Inventory';
import EditIcon from '@mui/icons-material/Edit';
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

// ============ CONSTANTES ============
const CARRIERS = ['FedEx', 'UPS', 'DHL', 'Estafeta', 'Redpack', 'Paquetexpress', 'JT Express', 'CEDIS MTY', 'Otro'];
const COUNTRIES_ES = ['México', 'Estados Unidos', 'Canadá', 'Guatemala', 'Colombia', 'España', 'Otro'];
const COUNTRIES_EN = ['Mexico', 'United States', 'Canada', 'Guatemala', 'Colombia', 'Spain', 'Other'];

// ============ TIPOS ============
type PackageStatus = 'received' | 'in_transit' | 'customs' | 'ready_pickup' | 'delivered';

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
  client: { id: number; name: string; email: string; boxId: string };
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
  defaultAddress?: ClientAddress | null;
}

interface ShipmentsPageProps {
  users: User[];
  warehouseLocation?: string; // Panel de bodega seleccionado
}

const API_URL = 'http://localhost:3001/api';
const ORANGE = '#F05A28';
const BLACK = '#111111';

const getStatusColor = (status: PackageStatus): "info" | "warning" | "success" | "error" | "default" => {
  const colors: Record<PackageStatus, "info" | "warning" | "success" | "error" | "default"> = {
    received: 'info', in_transit: 'warning', customs: 'error', ready_pickup: 'success', delivered: 'default'
  };
  return colors[status] || 'default';
};

const getStatusLabel = (status: PackageStatus): string => {
  const labels: Record<PackageStatus, string> = {
    received: 'En Bodega', in_transit: 'En Tránsito', customs: 'En Aduana',
    ready_pickup: 'Listo para Recoger', delivered: 'Entregado'
  };
  return labels[status] || status;
};

const getStatusIcon = (status: PackageStatus): string => {
  const icons: Record<PackageStatus, string> = {
    received: '📦', in_transit: '🚚', customs: '🛃', ready_pickup: '✅', delivered: '🎉'
  };
  return icons[status] || '📦';
};

export default function ShipmentsPage({ users, warehouseLocation }: ShipmentsPageProps) {
  const { t, i18n } = useTranslation();
  const COUNTRIES = i18n.language === 'es' ? COUNTRIES_ES : COUNTRIES_EN;
  
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [labelsToPrint, setLabelsToPrint] = useState<PackageLabel[]>([]);
  
  // Wizard state
  const [activeStep, setActiveStep] = useState(0);
  const [boxes, setBoxes] = useState<BoxItem[]>([{ id: 1, weight: '', length: '', width: '', height: '' }]);
  const [currentBox, setCurrentBox] = useState({ weight: '', length: '', width: '', height: '' });
  const [trackingProvider, setTrackingProvider] = useState('');
  const [declaredValue, setDeclaredValue] = useState('');
  const [carrier, setCarrier] = useState('');
  const [destination, setDestination] = useState({
    country: i18n.language === 'es' ? 'México' : 'Mexico',
    city: '',
    address: '',
    zip: '',
    phone: '',
    contact: ''
  });
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
  
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  const wizardSteps = [
    { label: i18n.language === 'es' ? 'Agregar Cajas' : 'Add Boxes', icon: <Inventory2Icon /> },
    { label: i18n.language === 'es' ? 'Tracking & Valor' : 'Tracking & Value', icon: <QrCodeScannerIcon /> },
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

  const filteredPackages = packages.filter(pkg => 
    pkg.tracking.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pkg.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pkg.client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pkg.client.boxId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (pkg.trackingProvider && pkg.trackingProvider.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // ============ WIZARD HANDLERS ============
  const handleOpenWizard = () => {
    setBoxes([]);
    setCurrentBox({ weight: '', length: '', width: '', height: '' });
    setTrackingProvider('');
    setDeclaredValue('');
    setCarrier('');
    setDestination({ country: 'México', city: '', address: '', zip: '', phone: '', contact: '' });
    setBoxId('');
    setDescription('');
    setNotes('');
    setPackageImage(null);
    setActiveStep(0);
    setFormError('');
    setCreatedShipment(null);
    setClientInstructions(null);
    setManualAddress(false);
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
          setDestination({
            country: 'México',
            city: addr.city,
            address: `${addr.street} ${addr.exteriorNumber || ''}${addr.interiorNumber ? ' Int. ' + addr.interiorNumber : ''}`,
            zip: addr.zipCode,
            phone: addr.phone || '',
            contact: addr.recipientName || ''
          });
          setManualAddress(false);
          
          // Si tiene carrier predeterminado, usarlo
          if (response.data.preferences?.carrier) {
            setCarrier(response.data.preferences.carrier);
          }
          
          const serviceLabel = addr.defaultForService 
            ? ` (predeterminada para: ${addr.defaultForService})`
            : ' (predeterminada)';
          setSnackbar({ open: true, message: `✅ Cliente encontrado con dirección${serviceLabel}`, severity: 'success' });
        } else {
          setManualAddress(true);
          setSnackbar({ open: true, message: '⚠️ Cliente encontrado pero sin dirección predeterminada. Configure el destino.', severity: 'warning' as 'success' | 'error' });
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

  const handleCloseWizard = () => {
    setWizardOpen(false);
    setActiveStep(0);
    closeCamera();
    setCreatedShipment(null);
    if (createdShipment) fetchPackages();
  };

  const handleReadScale = () => {
    const simulatedWeight = (Math.random() * 24.5 + 0.5).toFixed(2);
    setCurrentBox(prev => ({ ...prev, weight: simulatedWeight }));
    setSnackbar({ open: true, message: `⚖️ ${t('wizard.weightCaptured')}: ${simulatedWeight} kg`, severity: 'success' });
  };

  const handleAddBox = () => {
    if (!currentBox.weight || parseFloat(currentBox.weight) <= 0) {
      setFormError(t('errors.enterBoxWeight'));
      return;
    }
    if (!currentBox.length || !currentBox.width || !currentBox.height) {
      setFormError(t('errors.enterAllDimensions'));
      return;
    }
    
    setFormError('');
    const newBox: BoxItem = {
      id: Date.now(),
      weight: currentBox.weight,
      length: currentBox.length,
      width: currentBox.width,
      height: currentBox.height
    };
    setBoxes(prev => [...prev, newBox]);
    setCurrentBox({ weight: '', length: '', width: '', height: '' });
    setSnackbar({ open: true, message: `📦 ${t('wizard.boxAdded', { number: boxes.length + 1 })}`, severity: 'success' });
    setTimeout(() => weightInputRef.current?.focus(), 100);
  };

  const handleRemoveBox = (id: number) => {
    setBoxes(prev => prev.filter(b => b.id !== id));
  };

  const handleNextStep = () => {
    if (activeStep === 0 && boxes.length === 0) {
      setFormError(t('errors.addAtLeastOneBox'));
      return;
    }
    if (activeStep === 1 && !trackingProvider) {
      setFormError(t('errors.scanTracking'));
      return;
    }
    if (activeStep === 2) {
      // Validar que se haya buscado y encontrado un cliente
      if (!boxId || !clientInstructions?.found) {
        setFormError(i18n.language === 'es' ? 'Busca y selecciona un cliente válido' : 'Search and select a valid customer');
        return;
      }
      // Si el cliente no tiene instrucciones, validar que se llenó el destino
      if (!clientInstructions.hasInstructions || manualAddress) {
        if (!carrier) {
          setFormError(t('errors.selectCarrier'));
          return;
        }
        if (!destination.country || !destination.city || !destination.address) {
          setFormError(t('errors.completeDestination'));
          return;
        }
      }
    }
    if (activeStep === 3 && !description) {
      setFormError(i18n.language === 'es' ? 'Ingresa la descripción del contenido' : 'Enter content description');
      return;
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
      const payload = {
        boxId,
        description,
        boxes: boxes.map(b => ({
          weight: parseFloat(b.weight),
          length: parseFloat(b.length),
          width: parseFloat(b.width),
          height: parseFloat(b.height)
        })),
        trackingProvider: trackingProvider || undefined,
        declaredValue: parseFloat(declaredValue) || undefined,
        carrier,
        destination: {
          country: destination.country,
          city: destination.city,
          address: destination.address,
          zip: destination.zip || undefined,
          phone: destination.phone || undefined,
          contact: destination.contact || undefined
        },
        notes: notes || undefined,
        imageUrl: packageImage || undefined,
        warehouseLocation: warehouseLocation || undefined, // Ubicación del panel de bodega
      };

      const response = await axios.post(`${API_URL}/packages`, payload, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });

      setCreatedShipment({ labels: response.data.shipment.labels || [] });
      setSnackbar({ open: true, message: response.data.message, severity: 'success' });
      setActiveStep(4);  // Avanzar al paso de confirmación (ahora es 4)
    } catch (err) {
      const error = err as { response?: { data?: { error?: string; message?: string } } };
      setFormError(error.response?.data?.error || error.response?.data?.message || 'Error');
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
        
        @media print {
          body { margin: 0; }
          .label { border: 1px solid #000; }
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
    const vol = (parseFloat(b.length) || 0) * (parseFloat(b.width) || 0) * (parseFloat(b.height) || 0) / 1000;
    return sum + vol;
  }, 0);

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
          { label: t('status.inWarehouse', 'En Bodega'), status: 'received', color: '#2196f3', icon: '📦' },
          { label: t('status.inTransit'), status: 'in_transit', color: '#ff9800', icon: '🚚' },
          { label: t('status.customs'), status: 'customs', color: '#f44336', icon: '🛃' },
          { label: t('status.ready', 'Listos'), status: 'ready_pickup', color: '#4caf50', icon: '✅' },
          { label: t('status.delivered'), status: 'delivered', color: '#9e9e9e', icon: '🎉' },
        ].map((stat) => {
          const count = packages.filter(p => p.status === stat.status).length;
          return (
            <Grid size={{ xs: 6, sm: 2.4 }} key={stat.status}>
              <Paper sx={{ p: 2, textAlign: 'center', cursor: 'pointer',
                  border: statusFilter === stat.status ? `2px solid ${stat.color}` : '2px solid transparent',
                  '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 } }}
                onClick={() => setStatusFilter(statusFilter === stat.status ? 'all' : stat.status)}>
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
              <MenuItem value="received">📦 {t('status.inWarehouse', 'En Bodega')}</MenuItem>
              <MenuItem value="in_transit">🚚 {t('status.inTransit')}</MenuItem>
              <MenuItem value="customs">🛃 {t('status.customs')}</MenuItem>
              <MenuItem value="ready_pickup">✅ {t('status.ready', 'Listos')}</MenuItem>
              <MenuItem value="delivered">🎉 {t('status.delivered')}</MenuItem>
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
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>{t('common.description')}</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>{t('shipments.boxes')}</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>{t('shipments.weight')}</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>{t('common.status')}</TableCell>
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
                        <Avatar sx={{ bgcolor: ORANGE, width: 32, height: 32, fontSize: 14 }}>{pkg.client.name.charAt(0)}</Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight="500">{pkg.client.name}</Typography>
                          <Chip label={pkg.client.boxId} size="small" sx={{ fontSize: 10 }} />
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell><Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{pkg.description}</Typography></TableCell>
                    <TableCell>
                      <Badge badgeContent={pkg.totalBoxes || 1} color={pkg.isMaster ? 'warning' : 'primary'}><Inventory2Icon /></Badge>
                    </TableCell>
                    <TableCell>{pkg.weight ? `${pkg.weight} kg` : '-'}</TableCell>
                    <TableCell>
                      <Chip icon={<span>{getStatusIcon(pkg.status)}</span>} label={getStatusLabel(pkg.status)} color={getStatusColor(pkg.status)} size="small" />
                    </TableCell>
                    <TableCell><Typography variant="body2">{new Date(pkg.receivedAt).toLocaleDateString(i18n.language === 'es' ? 'es-MX' : 'en-US')}</Typography></TableCell>
                    <TableCell align="center">
                      <Tooltip title={t('clients.viewDetails')}><IconButton size="small" onClick={() => { setSelectedPackage(pkg); setDetailsOpen(true); }}><VisibilityIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title={t('shipments.changeStatus', 'Cambiar estado')}><IconButton size="small" onClick={() => { setSelectedPackage(pkg); setStatusDialogOpen(true); }}><EditIcon fontSize="small" /></IconButton></Tooltip>
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
                      <Grid size={{ xs: 12, sm: 3 }}>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <TextField inputRef={weightInputRef} fullWidth label={`${t('shipments.weight')} (kg)`} type="number"
                            value={currentBox.weight} onChange={(e) => setCurrentBox(p => ({ ...p, weight: e.target.value }))}
                            InputProps={{ startAdornment: <InputAdornment position="start"><ScaleIcon /></InputAdornment>, endAdornment: <InputAdornment position="end">kg</InputAdornment> }}
                            inputProps={{ step: 0.01 }} />
                        </Box>
                        <Button size="small" onClick={handleReadScale} sx={{ mt: 1, color: ORANGE }}>📡 {t('wizard.readScale')}</Button>
                      </Grid>
                      <Grid size={{ xs: 4, sm: 2 }}>
                        <TextField fullWidth label={t('shipments.length')} type="number" value={currentBox.length}
                          onChange={(e) => setCurrentBox(p => ({ ...p, length: e.target.value }))}
                          InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }} />
                      </Grid>
                      <Grid size={{ xs: 4, sm: 2 }}>
                        <TextField fullWidth label={t('shipments.width')} type="number" value={currentBox.width}
                          onChange={(e) => setCurrentBox(p => ({ ...p, width: e.target.value }))}
                          InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }} />
                      </Grid>
                      <Grid size={{ xs: 4, sm: 2 }}>
                        <TextField fullWidth label={t('shipments.height')} type="number" value={currentBox.height}
                          onChange={(e) => setCurrentBox(p => ({ ...p, height: e.target.value }))}
                          InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }} />
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
                              primary={`${box.weight} kg — ${box.length} × ${box.width} × ${box.height} cm`}
                              secondary={`${t('wizard.volume')}: ${((parseFloat(box.length) * parseFloat(box.width) * parseFloat(box.height)) / 1000).toFixed(2)} L`}
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
                        <Typography><strong>{t('shipments.totalVolume')}:</strong> {totalVolume.toFixed(2)} L</Typography>
                        {boxes.length > 1 && <Chip icon={<AccountTreeIcon />} label={t('wizard.willGenerateMasterChild')} color="warning" />}
                      </Box>
                    </Paper>
                  )}
                </Box>
              )}

              {/* PASO 1: TRACKING, FOTO & VALOR */}
              {activeStep === 1 && (
                <Card sx={{ p: 4 }}>
                  <CardContent>
                    <Box sx={{ textAlign: 'center', mb: 3 }}>
                      <QrCodeScannerIcon sx={{ fontSize: 60, color: ORANGE }} />
                      <Typography variant="h5">{t('shipments.trackingProvider')}</Typography>
                      <Typography color="text.secondary">{t('wizard.scanBarcode')}</Typography>
                    </Box>
                    <TextField inputRef={trackingInputRef} fullWidth label={t('shipments.trackingProvider')} placeholder={i18n.language === 'es' ? 'Escanea o escribe...' : 'Scan or type...'}
                      value={trackingProvider} onChange={(e) => setTrackingProvider(e.target.value.toUpperCase())}
                      InputProps={{ startAdornment: <InputAdornment position="start"><QrCodeScannerIcon /></InputAdornment> }}
                      sx={{ mb: 3 }} autoFocus />
                    
                    {/* 📸 SECCIÓN DE FOTO */}
                    <Divider sx={{ my: 3 }}><Chip label={i18n.language === 'es' ? '📸 Foto del Paquete' : '📸 Package Photo'} icon={<CameraAltIcon />} /></Divider>
                    
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
                          <Paper sx={{ p: 3, bgcolor: '#FFF8E1', border: '2px solid #FFC107' }}>
                            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                              <WarningIcon sx={{ color: '#FFC107' }} />
                              {i18n.language === 'es' ? 'Configurar Destino Manualmente' : 'Configure Destination Manually'}
                            </Typography>

                            {/* Paquetería */}
                            <FormControl fullWidth sx={{ mb: 3 }}>
                              <InputLabel>{t('shipments.carrierLabel')} *</InputLabel>
                              <Select value={carrier} label={`${t('shipments.carrierLabel')} *`} onChange={(e: SelectChangeEvent) => setCarrier(e.target.value)}>
                                {CARRIERS.map((c) => (
                                  <MenuItem key={c} value={c}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                      <LocalShippingIcon sx={{ color: ORANGE }} />
                                      <span>{c}</span>
                                    </Box>
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>

                            <Divider sx={{ my: 2 }}><Chip label={t('shipments.destinationAddress')} icon={<PlaceIcon />} size="small" /></Divider>

                            <Grid container spacing={2}>
                              <Grid size={{ xs: 12, sm: 6 }}>
                                <FormControl fullWidth>
                                  <InputLabel>{t('shipments.country')} *</InputLabel>
                                  <Select value={destination.country} label={`${t('shipments.country')} *`} 
                                    onChange={(e: SelectChangeEvent) => setDestination(prev => ({ ...prev, country: e.target.value }))}>
                                    {COUNTRIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                                  </Select>
                                </FormControl>
                              </Grid>
                              <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField fullWidth label={`${t('shipments.city')} *`} value={destination.city}
                                  onChange={(e) => setDestination(prev => ({ ...prev, city: e.target.value }))}
                                  placeholder={i18n.language === 'es' ? 'Ej: Ciudad de México' : 'E.g.: Mexico City'} />
                              </Grid>
                              <Grid size={12}>
                                <TextField fullWidth label={`${t('shipments.fullAddress')} *`} value={destination.address}
                                  onChange={(e) => setDestination(prev => ({ ...prev, address: e.target.value }))}
                                  placeholder={i18n.language === 'es' ? 'Calle, número, colonia...' : 'Street, number, neighborhood...'} multiline rows={2} />
                              </Grid>
                              <Grid size={{ xs: 12, sm: 4 }}>
                                <TextField fullWidth label={t('shipments.zipCode')} value={destination.zip}
                                  onChange={(e) => setDestination(prev => ({ ...prev, zip: e.target.value }))}
                                  placeholder="00000" />
                              </Grid>
                              <Grid size={{ xs: 12, sm: 4 }}>
                                <TextField fullWidth label={t('shipments.phone')} value={destination.phone}
                                  onChange={(e) => setDestination(prev => ({ ...prev, phone: e.target.value }))}
                                  placeholder="+52 55 1234 5678" />
                              </Grid>
                              <Grid size={{ xs: 12, sm: 4 }}>
                                <TextField fullWidth label={t('shipments.contact')} value={destination.contact}
                                  onChange={(e) => setDestination(prev => ({ ...prev, contact: e.target.value }))}
                                  placeholder={i18n.language === 'es' ? 'Nombre de quien recibe' : 'Recipient name'} />
                              </Grid>
                            </Grid>

                            {manualAddress && (
                              <Button 
                                variant="text" 
                                onClick={() => {
                                  setManualAddress(false);
                                  // Recargar datos originales
                                  if (clientInstructions?.defaultAddress) {
                                    const addr = clientInstructions.defaultAddress;
                                    setDestination({
                                      country: 'México',
                                      city: addr.city,
                                      address: `${addr.street} ${addr.exteriorNumber || ''}`,
                                      zip: addr.zipCode,
                                      phone: addr.phone || '',
                                      contact: addr.recipientName || ''
                                    });
                                  }
                                }}
                                sx={{ mt: 2 }}
                              >
                                {i18n.language === 'es' ? '↩️ Volver a usar instrucciones guardadas' : '↩️ Use saved instructions'}
                              </Button>
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
                    <TextField 
                      fullWidth 
                      label={t('shipments.contentDescription')} 
                      placeholder={i18n.language === 'es' ? 'Ej: Ropa, Zapatos, Electrónicos...' : 'E.g.: Clothes, Shoes, Electronics...'}
                      value={description} 
                      onChange={(e) => setDescription(e.target.value)} 
                      required 
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
                          <Typography variant="h6">🚚 {carrier}</Typography>
                        </Grid>
                        <Grid size={6}>
                          <Typography variant="body2" color="text.secondary">{t('shipments.destination')}</Typography>
                          <Typography variant="h6">📍 {destination.city}</Typography>
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
            {(['received', 'in_transit', 'customs', 'ready_pickup', 'delivered'] as PackageStatus[]).map((status) => (
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
                <Grid size={6}><Typography variant="body2" color="text.secondary">{t('clients.client')}</Typography><Typography fontWeight="bold">{selectedPackage.client.name}</Typography><Chip label={selectedPackage.client.boxId} size="small" sx={{ mt: 0.5 }} /></Grid>
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
