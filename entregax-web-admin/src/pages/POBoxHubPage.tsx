// ============================================
// PO BOX HUB PAGE
// Panel centralizado para todos los servicios de PO Box USA
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import useModulePermissions from '../hooks/useModulePermissions';
import { useScaleReader } from '../hooks/useScaleReader';
import MultiBoxScanDialog from '../components/MultiBoxScanDialog';
import {
    Box,
    Typography,
    Card,
    CardContent,
    CardActionArea,
    Grid,
    Chip,
    Button,
    Fade,
    Paper,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    InputAdornment,
    CircularProgress,
    Alert,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Divider,
    IconButton,
    Stepper,
    Step,
    StepLabel,
    Avatar,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    ListItemSecondaryAction,
    Snackbar,
    Badge,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TablePagination,
    Tooltip,
} from '@mui/material';
import {
    CallReceived as EntryIcon,
    CallMade as ExitIcon,
    Inventory as InventoryIcon,
    AttachMoney as MoneyIcon,
    Calculate as CalculateIcon,
    ArrowBack as BackIcon,
    LocalShipping as ShippingIcon,
    Close as CloseIcon,
    Scale as ScaleIcon,
    Straighten as RulerIcon,
    Place as PlaceIcon,
    CameraAlt as CameraAltIcon,
    Videocam as VideocamIcon,
    CheckCircle as CheckCircleIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    Inventory2 as Inventory2Icon,
    Search as SearchIcon,
    Refresh as RefreshIcon,
    Visibility as VisibilityIcon,
    QrCodeScanner as QrCodeScannerIcon,
    Person as PersonIcon,
    ArrowForward as ArrowForwardIcon,
    AllInbox as AllInboxIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import axios from 'axios';

// Importar los componentes de cada sección
import ShipmentsPage from './ShipmentsPage';
import OutboundControlPage from './OutboundControlPage';
import POBoxCajaPage from './POBoxCajaPage';
import POBoxQuoterPage from './POBoxQuoterPage';
import RepackPage from './RepackPage';
import POBoxInventoryPage from './POBoxInventoryPage';
import POBoxConsolidationReceptionWizard from './POBoxConsolidationReceptionWizard';

// Interfaces para cotización
interface CotizacionResultado {
    volumen_cbm: number;
    nivel_aplicado: number;
    costo_pobox_usd: number;
    tipo_cambio: number;
    costo_pobox_mxn: number;
    paqueteria_nombre?: string;
    costo_paqueteria_mxn: number;
    peso_kg: number;
    total_mxn: number;
}

interface TarifaVolumen {
    id: number;
    nivel: number;
    cbm_min: number;
    cbm_max: number | null;
    costo: number;
    tipo_cobro: 'fijo' | 'por_unidad';
    moneda: string;
    estado: boolean;
}

interface BoxItem {
    id: number;
    weight: string;
    length: string;
    width: string;
    height: string;
    trackingCourier?: string;
}

interface PaqueteRegistrado {
    tracking: string;
    boxId: string;
    peso: number;
    medidas: string;
}

// Interface para paquetes del inventario
interface InventoryPackage {
    id: number;
    tracking: string;
    description: string;
    weight?: number;
    status: string;
    statusLabel: string;
    receivedAt: string;
    deliveredAt?: string;
    consolidationId?: number;
    supplierId?: number;
    client: {
        id: number;
        name: string;
        email: string;
        boxId: string;
    };
    dimensions?: {
        length: number | null;
        width: number | null;
        height: number | null;
    };
}

// Status disponibles para filtro
const STATUS_OPTIONS = [
    { value: 'all', label: 'Todos', color: 'default' },
    { value: 'received', label: 'Recibido CEDIS HIDALGO TX', color: 'info' },
    { value: 'received_mty', label: 'RECIBIDO EN CEDIS MTY', color: 'info' },
    { value: 'processing', label: 'Procesando', color: 'warning' },
    { value: 'in_transit', label: 'EN TRANSITO A MTY NL', color: 'primary' },
    { value: 'ready_pickup', label: 'En Ruta', color: 'success' },
    { value: 'shipped', label: 'ENVIADO', color: 'default' },
    { value: 'delivered', label: 'ENTREGADO', color: 'success' },
];

// Paqueterías disponibles
const PAQUETERIAS = [
    { id: 1, nombre: 'Paquete Express', codigo: 'paquete_express', precio_base: 350, precio_kg_extra: 25, peso_incluido: 10 },
    { id: 2, nombre: 'Fedex Economy', codigo: 'fedex_economy', precio_base: 280, precio_kg_extra: 30, peso_incluido: 5 },
    { id: 3, nombre: 'Estafeta', codigo: 'estafeta', precio_base: 220, precio_kg_extra: 22, peso_incluido: 5 },
    { id: 4, nombre: 'DHL Express', codigo: 'dhl_express', precio_base: 450, precio_kg_extra: 45, peso_incluido: 10 },
];

const ORANGE = '#F05A28';

const POBOX_MODULES = ['receive', 'receive_consolidation', 'entry', 'exit', 'collect', 'quote', 'repack', 'inventory'];

// Definición de las opciones del menú - ORDEN: Recibir, Entrada, Salida, Cobrar, Cotizar, Reempaque, Inventario
const POBOX_MENU_OPTIONS = [
    {
        id: 'receive',
        icon: <InventoryIcon sx={{ fontSize: 48 }} />,
        color: '#4CAF50',
        bgGradient: 'linear-gradient(135deg, #388E3C 0%, #66BB6A 100%)',
        bgColor: '#e8f5e9',
        iconColor: '#4CAF50',
    },
    {
        id: 'receive_consolidation',
        icon: <AllInboxIcon sx={{ fontSize: 48 }} />,
        color: '#F05A28',
        bgGradient: 'linear-gradient(135deg, #D84315 0%, #FF7043 100%)',
        bgColor: '#fff3e0',
        iconColor: '#F05A28',
    },
    {
        id: 'entry',
        icon: <EntryIcon sx={{ fontSize: 48 }} />,
        color: '#2196F3',
        bgGradient: 'linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)',
        bgColor: '#e3f2fd',
        iconColor: '#2196F3',
    },
    {
        id: 'exit',
        icon: <ExitIcon sx={{ fontSize: 48 }} />,
        color: '#FF9800',
        bgGradient: 'linear-gradient(135deg, #F57C00 0%, #FFB74D 100%)',
        bgColor: '#fff3e0',
        iconColor: '#FF9800',
    },
    {
        id: 'collect',
        icon: <MoneyIcon sx={{ fontSize: 48 }} />,
        color: '#9C27B0',
        bgGradient: 'linear-gradient(135deg, #7B1FA2 0%, #BA68C8 100%)',
        bgColor: '#f3e5f5',
        iconColor: '#9C27B0',
    },
    {
        id: 'quote',
        icon: <CalculateIcon sx={{ fontSize: 48 }} />,
        color: '#00BCD4',
        bgGradient: 'linear-gradient(135deg, #0097A7 0%, #26C6DA 100%)',
        bgColor: '#e0f7fa',
        iconColor: '#00BCD4',
    },
    {
        id: 'repack',
        icon: <AllInboxIcon sx={{ fontSize: 48 }} />,
        color: '#E91E63',
        bgGradient: 'linear-gradient(135deg, #C2185B 0%, #F06292 100%)',
        bgColor: '#fce4ec',
        iconColor: '#E91E63',
    },
    {
        id: 'inventory',
        icon: <Inventory2Icon sx={{ fontSize: 48 }} />,
        color: '#607D8B',
        bgGradient: 'linear-gradient(135deg, #455A64 0%, #78909C 100%)',
        bgColor: '#eceff1',
        iconColor: '#607D8B',
    },
];

interface Props {
    users?: Array<{ id: number; full_name: string; email: string; box_id: string; role: string }>;
    onBack?: () => void;
    openBulkReceiveOnMount?: boolean; // Abrir wizard de recepción en serie automáticamente
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function POBoxHubPage({ users = [], onBack, openBulkReceiveOnMount = false }: Props) {
    const { t } = useTranslation();
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    
    // Permisos de módulos (hook compartido)
    const { allowedModules, loading: permissionsLoading } = useModulePermissions('ops_usa_pobox', POBOX_MODULES);
    
    // Estados para modal de cotización
    const [quoteModalOpen, setQuoteModalOpen] = useState(false);
    const [peso, setPeso] = useState('');
    const [medidas, setMedidas] = useState({ largo: '', ancho: '', alto: '' });
    const [ciudadDestino, setCiudadDestino] = useState('');
    const [paqueteria, setPaqueteria] = useState('paquete_express');
    const [cotizacion, setCotizacion] = useState<CotizacionResultado | null>(null);
    const [calculando, setCalculando] = useState(false);
    const [tarifas, setTarifas] = useState<TarifaVolumen[]>([]);
    const [tipoCambio, setTipoCambio] = useState(18.25);
    const [loadingTarifas, setLoadingTarifas] = useState(false);

    // =========== Estados para modal de RECEPCIÓN EN SERIE ===========
    const [bulkReceiveOpen, setBulkReceiveOpen] = useState(openBulkReceiveOnMount);
    // Autofocus guía al abrir modal
    useEffect(() => {
        if (bulkReceiveOpen) {
            setTimeout(() => bulkGuideInputRef.current?.focus(), 300);
        }
    }, [bulkReceiveOpen]);
    const [bulkStep, setBulkStep] = useState(0); // 0 = Cajas, 1 = Foto & Cliente
    const [bulkBoxes, setBulkBoxes] = useState<BoxItem[]>([]);
    const [bulkCurrentBox, setBulkCurrentBox] = useState({ weight: '', length: '', width: '', height: '', trackingCourier: '' });
    const [bulkBoxId, setBulkBoxId] = useState(''); // Número de casillero del cliente
    const [bulkImage, setBulkImage] = useState<string | null>(null);
    const [bulkSubmitting, setBulkSubmitting] = useState(false);
    const [bulkError, setBulkError] = useState('');
    const [paquetesRegistrados, setPaquetesRegistrados] = useState<PaqueteRegistrado[]>([]);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'info' });
    
    // Refs para cámara
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const bulkGuideInputRef = useRef<HTMLInputElement>(null);
    const bulkLengthInputRef = useRef<HTMLInputElement>(null);
    const bulkWeightInputRef = useRef<HTMLInputElement>(null);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

    // =========== Estados para INVENTARIO ===========
    const [inventoryModalOpen, setInventoryModalOpen] = useState(false);
    const [inventoryPackages, setInventoryPackages] = useState<InventoryPackage[]>([]);
    const [inventoryLoading, setInventoryLoading] = useState(false);
    const [inventoryStatusFilter, setInventoryStatusFilter] = useState('received');
    const [inventorySearch, setInventorySearch] = useState('');
    const [inventoryPage, setInventoryPage] = useState(0);
    const [inventoryRowsPerPage, setInventoryRowsPerPage] = useState(10);

    // Filtrar opciones según permisos
    const filteredMenuOptions = POBOX_MENU_OPTIONS.filter(opt => 
        allowedModules.includes(opt.id)
    );

    // Cargar tarifas cuando se abre el modal
    const fetchTarifas = useCallback(async () => {
        setLoadingTarifas(true);
        try {
            const tarifasRes = await api.get('/admin/pobox/tarifas-volumen');
            if (tarifasRes.data?.tarifas) {
                setTarifas(tarifasRes.data.tarifas.filter((t: TarifaVolumen) => t.estado));
            }
            try {
                const tcRes = await api.get('/exchange-rate');
                if (tcRes.data?.rate) {
                    setTipoCambio(parseFloat(tcRes.data.rate));
                }
            } catch {
                console.log('Usando TC por defecto');
            }
        } catch {
            // Usar tarifas por defecto
            setTarifas([
                { id: 1, nivel: 1, cbm_min: 0.01, cbm_max: 0.05, costo: 39, tipo_cobro: 'fijo', moneda: 'USD', estado: true },
                { id: 2, nivel: 2, cbm_min: 0.051, cbm_max: 0.099, costo: 79, tipo_cobro: 'fijo', moneda: 'USD', estado: true },
                { id: 3, nivel: 3, cbm_min: 0.1, cbm_max: null, costo: 750, tipo_cobro: 'por_unidad', moneda: 'USD', estado: true },
            ]);
        } finally {
            setLoadingTarifas(false);
        }
    }, []);

    useEffect(() => {
        if (quoteModalOpen && tarifas.length === 0) {
            fetchTarifas();
        }
    }, [quoteModalOpen, tarifas.length, fetchTarifas]);

    // Calcular cotización
    const calcularCotizacion = () => {
        const largo = parseFloat(medidas.largo);
        const ancho = parseFloat(medidas.ancho);
        const alto = parseFloat(medidas.alto);
        const pesoKg = parseFloat(peso) || 0;

        if (!largo || !ancho || !alto || largo <= 0 || ancho <= 0 || alto <= 0) {
            return;
        }

        setCalculando(true);

        const volumenCBM = (largo * ancho * alto) / 1000000;
        const volumenRedondeado = Math.max(0.01, parseFloat(volumenCBM.toFixed(4)));

        let tarifaAplicable = tarifas.find(t => {
            const min = parseFloat(String(t.cbm_min));
            const max = t.cbm_max ? parseFloat(String(t.cbm_max)) : Infinity;
            return volumenRedondeado >= min && volumenRedondeado <= max;
        });

        if (!tarifaAplicable && tarifas.length > 0) {
            tarifaAplicable = tarifas[tarifas.length - 1];
        }

        if (!tarifaAplicable) {
            setCalculando(false);
            return;
        }

        let costoPOBoxUSD = 0;
        if (tarifaAplicable.tipo_cobro === 'fijo') {
            costoPOBoxUSD = parseFloat(String(tarifaAplicable.costo));
        } else {
            costoPOBoxUSD = volumenRedondeado * parseFloat(String(tarifaAplicable.costo));
        }

        const costoPOBoxMXN = costoPOBoxUSD * tipoCambio;

        let costoPaqueteriaMXN = 0;
        let paqueteriaNombre = '';
        const paqSeleccionada = PAQUETERIAS.find(p => p.codigo === paqueteria);
        if (paqSeleccionada) {
            paqueteriaNombre = paqSeleccionada.nombre;
            costoPaqueteriaMXN = paqSeleccionada.precio_base;
            if (pesoKg > paqSeleccionada.peso_incluido) {
                const kgExtra = pesoKg - paqSeleccionada.peso_incluido;
                costoPaqueteriaMXN += kgExtra * paqSeleccionada.precio_kg_extra;
            }
        }

        const totalMXN = costoPOBoxMXN + costoPaqueteriaMXN;

        setTimeout(() => {
            setCotizacion({
                volumen_cbm: volumenRedondeado,
                nivel_aplicado: tarifaAplicable!.nivel,
                costo_pobox_usd: costoPOBoxUSD,
                tipo_cambio: tipoCambio,
                costo_pobox_mxn: costoPOBoxMXN,
                paqueteria_nombre: paqueteriaNombre || undefined,
                costo_paqueteria_mxn: costoPaqueteriaMXN,
                peso_kg: pesoKg,
                total_mxn: totalMXN,
            });
            setCalculando(false);
        }, 300);
    };

    // Limpiar modal
    const handleCloseQuoteModal = () => {
        setQuoteModalOpen(false);
        setPeso('');
        setMedidas({ largo: '', ancho: '', alto: '' });
        setCiudadDestino('');
        setPaqueteria('paquete_express');
        setCotizacion(null);
    };

    // Formatear moneda
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
    };

    // =========== LÓGICA PARA RECEPCIÓN EN SERIE ===========
    const { readScale: readBulkScale, liveWeight: bulkLiveWeight } = useScaleReader();
    const [bulkScaleLive, setBulkScaleLive] = useState(false);
    const [bulkBoxQuantity, setBulkBoxQuantity] = useState('1');
    const [bulkMultiScanOpen, setBulkMultiScanOpen] = useState(false);

    // Normaliza la guía: si es FedEx de 34 dígitos puros, extrae últimos 12
    const normalizeCarrierGuide = (raw: string): string => {
        const v = (raw || '').toUpperCase().trim();
        if (/^\d{34}$/.test(v)) return v.slice(-12);
        return v;
    };

    // Al escanear guía (Enter): leer báscula y saltar a Largo (o Peso si falla)
    const handleBulkGuideScanned = async () => {
        const normalized = normalizeCarrierGuide(bulkCurrentBox.trackingCourier);
        if (!normalized) return;
        if (normalized !== bulkCurrentBox.trackingCourier) {
            setBulkCurrentBox(p => ({ ...p, trackingCourier: normalized }));
        }
        const r = await readBulkScale();
        if (r.success && r.weight !== undefined) {
            const w = r.weight.toFixed(2);
            setBulkCurrentBox(p => ({ ...p, weight: w }));
            setBulkScaleLive(true);
            if (r.stale) {
                setSnackbar({ open: true, message: `⚠️ Sin peso actualizado. Peso anterior: ${w} kg`, severity: 'info' });
            } else {
                setSnackbar({ open: true, message: `⚖️ Peso capturado: ${w} kg`, severity: 'success' });
            }
            setTimeout(() => bulkLengthInputRef.current?.focus(), 50);
        } else {
            setSnackbar({ open: true, message: `⚠️ ${r.error || 'Error leyendo báscula'} — Escribe el peso manualmente.`, severity: 'info' });
            setTimeout(() => bulkWeightInputRef.current?.focus(), 50);
        }
    };

    const handleReadBulkScale = async () => {
        const r = await readBulkScale();
        if (r.success && r.weight !== undefined) {
            const w = r.weight.toFixed(2);
            setBulkCurrentBox(p => ({ ...p, weight: w }));
            setBulkScaleLive(true);
            if (r.stale) {
                setSnackbar({ open: true, message: `⚠️ Sin peso actualizado. Peso anterior: ${w} kg`, severity: 'info' });
            } else {
                setSnackbar({ open: true, message: `⚖️ Peso capturado: ${w} kg`, severity: 'success' });
            }
        } else {
            setSnackbar({ open: true, message: `⚠️ ${r.error || 'Error leyendo báscula'}`, severity: 'error' });
        }
    };

    // Auto-actualiza peso cuando la báscula cambia (tras primera conexión)
    useEffect(() => {
        if (!bulkScaleLive) return;
        if (bulkLiveWeight === null || bulkLiveWeight <= 0) return;
        const w = bulkLiveWeight.toFixed(2);
        setBulkCurrentBox(p => (p.weight === w ? p : { ...p, weight: w }));
    }, [bulkLiveWeight, bulkScaleLive]);
    
    // Agregar caja al listado
    const handleAddBulkBox = () => {
        if (!bulkCurrentBox.weight || !bulkCurrentBox.length || !bulkCurrentBox.width || !bulkCurrentBox.height) {
            setBulkError('Completa peso y medidas de la caja');
            return;
        }
        const qty = Math.max(1, parseInt(bulkBoxQuantity) || 1);
        if (qty > 1) {
            setBulkMultiScanOpen(true);
            return;
        }
        const normalizedTracking = normalizeCarrierGuide(bulkCurrentBox.trackingCourier);
        setBulkBoxes(prev => [...prev, { ...bulkCurrentBox, trackingCourier: normalizedTracking, id: Date.now() }]);
        setBulkCurrentBox({ weight: '', length: '', width: '', height: '', trackingCourier: '' });
        setBulkBoxQuantity('1');
        setBulkError('');
        setTimeout(() => bulkGuideInputRef.current?.focus(), 50);
    };

    const handleBulkMultiScanComplete = (guides: string[]) => {
        const baseId = Date.now();
        const newBoxes = guides.map((g, i) => ({
            ...bulkCurrentBox,
            id: baseId + i,
            trackingCourier: normalizeCarrierGuide(g || ''),
        }));
        setBulkBoxes(prev => [...prev, ...newBoxes]);
        setBulkCurrentBox({ weight: '', length: '', width: '', height: '', trackingCourier: '' });
        setBulkBoxQuantity('1');
        setBulkMultiScanOpen(false);
        setBulkError('');
        setSnackbar({ open: true, message: `📦 ${newBoxes.length} cajas agregadas`, severity: 'success' });
        setTimeout(() => bulkGuideInputRef.current?.focus(), 50);
    };

    // Eliminar caja
    const handleRemoveBulkBox = (id: number) => {
        setBulkBoxes(prev => prev.filter(b => b.id !== id));
    };

    // Calcular totales de cajas
    const bulkTotalWeight = bulkBoxes.reduce((sum, b) => sum + (parseFloat(b.weight) || 0), 0);
    const bulkTotalVolume = bulkBoxes.reduce((sum, b) => {
        const l = parseFloat(b.length) || 0;
        const w = parseFloat(b.width) || 0;
        const h = parseFloat(b.height) || 0;
        return sum + (l * w * h / 1000000); // CBM
    }, 0);

    // Abrir cámara
    const openBulkCamera = async () => {
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
            console.error('Error abriendo cámara:', err);
            setBulkError('No se pudo acceder a la cámara');
        }
    };

    // Capturar foto
    const captureBulkPhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(video, 0, 0);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                setBulkImage(dataUrl);
                closeBulkCamera();
            }
        }
    };

    // Cerrar cámara
    const closeBulkCamera = () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
        setCameraOpen(false);
    };

    // Siguiente paso del wizard
    const handleBulkNextStep = () => {
        if (bulkStep === 0) {
            if (bulkBoxes.length === 0) {
                setBulkError('Agrega al menos una caja');
                return;
            }
            setBulkError('');
            setBulkStep(1);
        }
    };

    // Paso anterior
    const handleBulkPrevStep = () => {
        setBulkError('');
        setBulkStep(prev => Math.max(0, prev - 1));
    };

    // =========== S ===========
    const printShipmentLabels = (labels: any[]) => {
        if (!labels || labels.length === 0) return;

        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) {
            setSnackbar({ open: true, message: 'Popup bloqueado. Permite popups para imprimir etiquetas.', severity: 'error' });
            return;
        }

        const formatDate = (dateStr?: string): string => {
            if (!dateStr) return new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).toUpperCase();
            const date = new Date(dateStr);
            return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).toUpperCase();
        };

        const labelsHTML = labels.map((label: any, index: number) => {
            const receivedDate = formatDate(label.receivedAt);
            return `
            <div class="label" style="page-break-after: ${index < labels.length - 1 ? 'always' : 'auto'};">
                <div class="header">
                    <div class="date-badge">${receivedDate}</div>
                </div>
                ${label.isMaster ? '<div class="master-badge">GUÍA MASTER</div>' : ''}
                <div class="tracking-main">
                    <div class="tracking-code">${label.tracking}</div>
                    ${!label.isMaster 
                        ? `<div class="box-indicator">${label.boxNumber} de ${label.totalBoxes}</div>` 
                        : `<div class="box-indicator">${label.totalBoxes} bultos</div>`}
                </div>
                ${label.masterTracking ? `<div class="master-ref">Master: ${label.masterTracking}</div>` : ''}
                <div class="qr-section"><div id="qr-${index}"></div></div>
                <div class="barcode-section"><svg id="barcode-${index}"></svg></div>
                <div class="divider"></div>
                <div class="client-info">
                    <div class="client-box">📦 ${label.clientBoxId || 'PENDIENTE'}</div>
                </div>
                <div class="details">
                    ${label.weight ? `<span class="detail-item">⚖️ ${label.weight} kg</span>` : ''}
                    ${label.dimensions ? `<span class="detail-item">📐 ${label.dimensions}</span>` : ''}
                    ${label.totalBoxes > 1 && label.isMaster ? `<span class="detail-item">📦 ${label.totalBoxes} bultos</span>` : ''}
                </div>
                <div class="description">Hidalgo TX</div>
            </div>`;
        }).join('');

        try {
            printWindow.document.write(`<!DOCTYPE html><html><head>
                <title>Etiquetas - ${labels[0]?.tracking || 'Paquete'}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Arial', sans-serif; }
                    .label {
                        width: 4in; height: 6in; padding: 0.2in;
                        border: 2px solid #000; display: flex; flex-direction: column;
                        margin: 0 auto; position: relative; overflow: hidden;
                    }
                    .header { display: flex; justify-content: flex-end; align-items: center; margin-bottom: 2px; }
                    .date-badge { background: #111; color: white; padding: 3px 8px; font-size: 11px; font-weight: bold; border-radius: 4px; }
                    .master-badge { background: #F05A28; color: white; text-align: center; padding: 4px; font-weight: bold; font-size: 13px; margin-bottom: 4px; }
                    .tracking-main { text-align: center; margin: 2px 0; }
                    .tracking-code { font-size: 20px; font-weight: bold; letter-spacing: 1px; }
                    .box-indicator { font-size: 13px; color: #333; font-weight: 600; display: inline-block; margin-top: 1px; }
                    .master-ref { text-align: center; font-size: 10px; color: #666; margin: 1px 0; }
                    .qr-section { text-align: center; margin: 3px 0; }
                    .qr-section svg, .qr-section img { width: 120px !important; height: 120px !important; }
                    .barcode-section { text-align: center; margin: 4px 0; }
                    .barcode-section svg { width: 85%; height: 85px; }
                    .divider { border-top: 2px dashed #ccc; margin: 5px 0; }
                    .client-info { text-align: center; margin: 4px 0; }
                    .client-box { font-size: 52px; color: #F05A28; font-weight: 900; letter-spacing: 3px; line-height: 1; }
                    .details { text-align: center; font-size: 15px; font-weight: 600; margin: 4px 0; display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }
                    .detail-item { background: #f5f5f5; padding: 2px 8px; border-radius: 4px; }
                    .description { text-align: center; font-size: 10px; color: #666; margin-top: 2px; }
                    .footer { text-align: center; font-size: 7px; color: #999; border-top: 1px solid #eee; padding-top: 2px; margin-top: auto; }
                    @page { size: 4in 6in; margin: 0; }
                    @media print { body { margin: 0; padding: 0; } .label { border: none; page-break-inside: avoid; overflow: hidden; } }
                </style>
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
                <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
            </head><body>${labelsHTML}
            <script>
                ${labels.map((label: any, i: number) => `try { JsBarcode("#barcode-${i}", "${label.tracking.replace(/-/g, '')}", { format: "CODE128", width: 2.2, height: 70, displayValue: false, margin: 0 }); } catch(e) {}`).join('\n')}
                ${labels.map((label: any, i: number) => `
                    (function() {
                        try {
                            var qr = qrcode(0, 'M');
                            qr.addData('https://app.entregax.com/track/${label.tracking}');
                            qr.make();
                            document.getElementById('qr-${i}').innerHTML = qr.createSvgTag({ cellSize: 3, margin: 0 });
                        } catch(e) {}
                    })();
                `).join('')}
                window.onload = function() { setTimeout(function() { window.print(); }, 600); };
            <\/script></body></html>`);
            printWindow.document.close();
        } catch (err) {
            console.error('Error generando etiquetas:', err);
        }
    };

    // Guardar paquete y continuar con el siguiente
    const handleSaveBulkPackage = async () => {
        // boxId ya no es obligatorio - se puede crear sin cliente
        setBulkSubmitting(true);
        setBulkError('');

        try {
            const payload = {
                boxId: bulkBoxId || undefined, // Opcional - puede ser sin cliente
                description: `Hidalgo TX`,
                boxes: bulkBoxes.map(b => ({
                    weight: parseFloat(b.weight),
                    length: parseFloat(b.length),
                    width: parseFloat(b.width),
                    height: parseFloat(b.height),
                    trackingCourier: b.trackingCourier || undefined
                })),
                imageUrl: bulkImage || undefined,
                warehouseLocation: 'usa_pobox',
                leaveInWarehouse: true, // Siempre en bodega Hidalgo TX
                notes: bulkBoxId ? 'Recibido en bodega Hidalgo TX - Recepción en serie' : 'Paquete sin cliente asignado - Recibido en bodega Hidalgo TX'
            };

            const token = localStorage.getItem('token') || '';
            const response = await axios.post(`${API_URL}/api/packages`, payload, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // Agregar a la lista de paquetes registrados
            const tracking = response.data.shipment?.labels?.[0]?.tracking || `PKG-${Date.now()}`;
            setPaquetesRegistrados(prev => [...prev, {
                tracking,
                boxId: bulkBoxId || 'SIN CLIENTE',
                peso: bulkTotalWeight,
                medidas: `${bulkBoxes.length} caja(s)`
            }]);

            // 🖨️ Imprimir etiquetas automáticamente
            const labels = response.data.shipment?.labels;
            if (labels && labels.length > 0) {
                printShipmentLabels(labels);
            }

            setSnackbar({ 
                open: true, 
                message: bulkBoxId 
                    ? `✅ Paquete registrado para casillero ${bulkBoxId}` 
                    : `✅ Paquete registrado sin cliente asignado`, 
                severity: 'success' 
            });

            // Resetear para siguiente paquete
            setBulkBoxes([]);
            setBulkBoxId('');
            setBulkImage(null);
            setBulkStep(0);
            setBulkCurrentBox({ weight: '', length: '', width: '', height: '', trackingCourier: '' });
        } catch (err: any) {
            setBulkError(err.response?.data?.error || err.response?.data?.message || 'Error al registrar paquete');
        } finally {
            setBulkSubmitting(false);
        }
    };

    // Cerrar modal de recepción en serie
    const handleCloseBulkReceive = () => {
        closeBulkCamera();
        setBulkReceiveOpen(false);
        setBulkStep(0);
        setBulkBoxes([]);
        setBulkCurrentBox({ weight: '', length: '', width: '', height: '', trackingCourier: '' });
        setBulkBoxId('');
        setBulkImage(null);
        setBulkError('');
    };

    // =========== LÓGICA PARA INVENTARIO ===========
    
    // Cargar paquetes del inventario
    const fetchInventoryPackages = useCallback(async () => {
        setInventoryLoading(true);
        try {
            const token = localStorage.getItem('token') || '';
            const params = new URLSearchParams();
            if (inventoryStatusFilter !== 'all') {
                params.append('status', inventoryStatusFilter);
            }
            // El endpoint /packages ya filtra solo paquetes PO Box (excluye fcl, maritime, china_air, dhl)
            params.append('limit', '200');
            
            const response = await axios.get(`${API_URL}/packages?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setInventoryPackages(response.data.packages || []);
        } catch (error) {
            console.error('Error cargando inventario:', error);
            setSnackbar({ open: true, message: 'Error al cargar inventario', severity: 'error' });
        } finally {
            setInventoryLoading(false);
        }
    }, [inventoryStatusFilter]);

    // Cargar inventario cuando se abre el modal
    useEffect(() => {
        if (inventoryModalOpen) {
            fetchInventoryPackages();
        }
    }, [inventoryModalOpen, fetchInventoryPackages]);

    // Filtrar paquetes por búsqueda
    const filteredInventoryPackages = inventoryPackages.filter(pkg => {
        if (!inventorySearch) return true;
        const search = inventorySearch.toLowerCase();
        return (
            pkg.tracking?.toLowerCase().includes(search) ||
            pkg.client?.name?.toLowerCase().includes(search) ||
            pkg.client?.boxId?.toLowerCase().includes(search) ||
            pkg.description?.toLowerCase().includes(search)
        );
    });

    // Obtener color del status
    const getStatusColor = (status: string): 'default' | 'info' | 'warning' | 'primary' | 'success' | 'error' => {
        const colors: Record<string, 'default' | 'info' | 'warning' | 'primary' | 'success' | 'error'> = {
            received: 'info',
            received_mty: 'info',
            processing: 'warning',
            in_transit: 'primary',
            ready_pickup: 'success',
            shipped: 'default',
            delivered: 'success',
            customs: 'error',
        };
        return colors[status] || 'default';
    };

    // Obtener label del status
    const getStatusLabel = (status: string): string => {
        const labels: Record<string, string> = {
            received: '📦 Recibido CEDIS HIDALGO TX',
            received_mty: '🏢 RECIBIDO EN CEDIS MTY',
            processing: '📋 Procesando',
            in_transit: '🚚 EN TRANSITO A MTY NL',
            ready_pickup: '🛣️ En Ruta',
            shipped: '📤 ENVIADO',
            delivered: '✅ ENTREGADO',
            customs: '🛃 En Aduana',
        };
        return labels[status] || status;
    };

    // Cerrar modal de inventario
    const handleCloseInventory = () => {
        setInventoryModalOpen(false);
        setInventorySearch('');
        setInventoryStatusFilter('received');
        setInventoryPage(0);
    };

    // Handler para clic en opción
    const handleOptionClick = (optionId: string) => {
        if (optionId === 'quote') {
            setQuoteModalOpen(true);
        } else if (optionId === 'receive') {
            setBulkReceiveOpen(true);
        } else {
            setSelectedOption(optionId);
        }
    };

    // Handler para volver al menú principal de PO Box
    const handleBackToMenu = () => {
        setSelectedOption(null);
    };

    // Handler para volver al hub de warehouse
    const handleBackToWarehouse = () => {
        if (onBack) {
            onBack();
        }
    };

    // Renderizar el componente correspondiente según la opción seleccionada
    const renderSelectedComponent = () => {
        switch (selectedOption) {
            case 'receive':
                // Recibir paquetería - Wizard de recepción
                return <ShipmentsPage users={users} warehouseLocation="usa_pobox" />;
            case 'receive_consolidation':
                // Recepción de consolidaciones en MTY (escaneo y validación de faltantes)
                return <POBoxConsolidationReceptionWizard onBack={handleBackToMenu} />;
            case 'entry':
                // Entrada - Abre directamente el wizard de recepción
                return <ShipmentsPage users={users} warehouseLocation="usa_pobox" openWizardOnMount={true} />;
            case 'exit':
                // Salida - Control de salidas con wizard de escaneo
                return <OutboundControlPage />;
            case 'collect':
                // Cobrar - Panel de caja con búsqueda por referencia
                return <POBoxCajaPage />;
            case 'quote':
                // Cotizar - Cotizador especializado para PO Box
                return <POBoxQuoterPage />;
            case 'repack':
                // Reempaque - Consolidar múltiples paquetes en una caja
                return <RepackPage />;
            case 'inventory':
                // Inventario PO Box USA - página completa con stats y filtros
                return <POBoxInventoryPage onBack={handleBackToMenu} />;
            default:
                return null;
        }
    };

    // Si hay una opción seleccionada, mostrar ese componente
    if (selectedOption) {
        return (
            <Box>
                {/* Breadcrumb para volver */}
                <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                        icon={<BackIcon />}
                        label={t('pobox.hub.backToMenu', 'Volver al menú PO Box')}
                        onClick={handleBackToMenu}
                        sx={{ cursor: 'pointer' }}
                        color="primary"
                        variant="outlined"
                    />
                    {onBack && (
                        <Chip
                            label={t('warehouse.backToPanels', 'Volver a paneles')}
                            onClick={handleBackToWarehouse}
                            sx={{ cursor: 'pointer' }}
                        />
                    )}
                </Box>

                {/* Componente seleccionado */}
                <Fade in={true} timeout={300}>
                    <Box>{renderSelectedComponent()}</Box>
                </Fade>
            </Box>
        );
    }

    // Vista principal del Hub de PO Box
    return (
        <Box sx={{ p: 3 }}>
            {/* Header con botón de volver */}
            <Box sx={{ mb: 4 }}>
                {onBack && (
                    <Button
                        startIcon={<BackIcon />}
                        onClick={handleBackToWarehouse}
                        sx={{ mb: 2 }}
                        color="inherit"
                    >
                        {t('warehouse.backToPanels', 'Volver a paneles')}
                    </Button>
                )}
                
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box
                        sx={{
                            width: 60,
                            height: 60,
                            borderRadius: 2,
                            background: 'linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <ShippingIcon sx={{ fontSize: 32, color: 'white' }} />
                    </Box>
                    <Box>
                        <Typography variant="h4" fontWeight="bold">
                            🇺🇸 {t('pobox.hub.title', 'PO Box USA')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t('pobox.hub.subtitle', 'Panel de gestión de paquetería PO Box')}
                        </Typography>
                    </Box>
                </Box>
            </Box>

            {/* Loading de permisos */}
            {permissionsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : filteredMenuOptions.length === 0 ? (
                <Alert severity="warning" sx={{ mb: 3 }}>
                    No tienes permisos para ningún módulo de PO Box. Contacta a tu supervisor.
                </Alert>
            ) : (
                <>
                    {/* Grid de opciones */}
                    <Grid container spacing={3}>
                        {filteredMenuOptions.map((option) => (
                            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={option.id}>
                                <Card
                                    sx={{
                                        height: '100%',
                                        borderRadius: 2,
                                        border: '1px solid #ECECEC',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                        bgcolor: '#FFFFFF',
                                        overflow: 'hidden',
                                        transition: 'all 0.2s ease',
                                        '&:hover': {
                                            transform: 'translateY(-2px)',
                                            borderColor: '#F05A28',
                                            boxShadow: '0 8px 24px rgba(240,90,40,0.12)',
                                        },
                                    }}
                                >
                                    <CardActionArea
                                        onClick={() => handleOptionClick(option.id)}
                                        sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
                                    >
                                        {/* Acento naranja superior */}
                                        <Box sx={{ height: 4, bgcolor: '#F05A28' }} />
                                        <CardContent sx={{ p: 2.5, width: '100%' }}>
                                            <Box
                                                sx={{
                                                    width: 48,
                                                    height: 48,
                                                    borderRadius: 1.5,
                                                    bgcolor: '#F05A2815',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: '#1A1A1A',
                                                    mb: 1.5,
                                                    '& svg': { fontSize: 26 },
                                                }}
                                            >
                                                {option.icon}
                                            </Box>
                                            <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#1A1A1A', mb: 0.5 }}>
                                                {t(`pobox.hub.options.${option.id}.title`, getDefaultTitle(option.id))}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: '#6B7280', lineHeight: 1.4 }}>
                                                {t(`pobox.hub.options.${option.id}.description`, getDefaultDescription(option.id))}
                                            </Typography>
                                        </CardContent>
                                    </CardActionArea>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>

                    {/* Estadísticas rápidas */}
                    <Box sx={{ mt: 3 }}>
                        <Paper sx={{ p: 3, bgcolor: '#f5f5f5' }}>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                💡 {t('pobox.hub.tip', 'Consejo')}
                            </Typography>
                            <Typography variant="body2">
                                {t('pobox.hub.tipText', 'Usa "Recibir Paquetería" para escanear nuevos paquetes, "Cobrar" para gestionar pagos pendientes, y "Cotizar" para calcular costos antes de recibir.')}
                            </Typography>
                        </Paper>
                    </Box>
                </>
            )}

            {/* Modal de Cotización Rápida */}
            <Dialog 
                open={quoteModalOpen} 
                onClose={handleCloseQuoteModal} 
                maxWidth="sm" 
                fullWidth
                PaperProps={{ sx: { borderRadius: 3 } }}
            >
                <DialogTitle sx={{ 
                    background: 'linear-gradient(135deg, #0097A7 0%, #26C6DA 100%)', 
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CalculateIcon />
                        Cotizar Envío
                    </Box>
                    <IconButton onClick={handleCloseQuoteModal} sx={{ color: 'white' }}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                
                <DialogContent sx={{ pt: 3 }}>
                    {loadingTarifas ? (
                        <Box display="flex" justifyContent="center" py={4}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {/* Peso */}
                            <Box>
                                <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <ScaleIcon fontSize="small" color="primary" /> Peso (kg)
                                </Typography>
                                <TextField
                                    fullWidth
                                    type="number"
                                    placeholder="Ej: 12"
                                    value={peso}
                                    onChange={(e) => setPeso(e.target.value)}
                                    InputProps={{
                                        endAdornment: <InputAdornment position="end">kg</InputAdornment>,
                                    }}
                                    size="small"
                                />
                            </Box>

                            {/* Medidas */}
                            <Box>
                                <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <RulerIcon fontSize="small" color="primary" /> Medidas (cm)
                                </Typography>
                                <Grid container spacing={2}>
                                    <Grid size={{ xs: 4 }}>
                                        <TextField
                                            fullWidth
                                            type="number"
                                            label="Largo"
                                            placeholder="cm"
                                            value={medidas.largo}
                                            onChange={(e) => setMedidas({ ...medidas, largo: e.target.value })}
                                            InputProps={{
                                                endAdornment: <InputAdornment position="end">cm</InputAdornment>,
                                            }}
                                            size="small"
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 4 }}>
                                        <TextField
                                            fullWidth
                                            type="number"
                                            label="Ancho"
                                            placeholder="cm"
                                            value={medidas.ancho}
                                            onChange={(e) => setMedidas({ ...medidas, ancho: e.target.value })}
                                            InputProps={{
                                                endAdornment: <InputAdornment position="end">cm</InputAdornment>,
                                            }}
                                            size="small"
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 4 }}>
                                        <TextField
                                            fullWidth
                                            type="number"
                                            label="Alto"
                                            placeholder="cm"
                                            value={medidas.alto}
                                            onChange={(e) => setMedidas({ ...medidas, alto: e.target.value })}
                                            InputProps={{
                                                endAdornment: <InputAdornment position="end">cm</InputAdornment>,
                                            }}
                                            size="small"
                                        />
                                    </Grid>
                                </Grid>
                            </Box>

                            {/* Ciudad de Destino */}
                            <Box>
                                <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <PlaceIcon fontSize="small" color="primary" /> Ciudad de Envío
                                </Typography>
                                <TextField
                                    fullWidth
                                    placeholder="Ej: Monterrey, NL"
                                    value={ciudadDestino}
                                    onChange={(e) => setCiudadDestino(e.target.value)}
                                    size="small"
                                />
                            </Box>

                            {/* Paquetería */}
                            <Box>
                                <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <ShippingIcon fontSize="small" color="primary" /> Paquetería de Envío
                                </Typography>
                                <FormControl fullWidth size="small">
                                    <Select
                                        value={paqueteria}
                                        onChange={(e) => setPaqueteria(e.target.value)}
                                    >
                                        {PAQUETERIAS.map((paq) => (
                                            <MenuItem key={paq.codigo} value={paq.codigo}>
                                                {paq.nombre}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Box>

                            {/* Resultado de Cotización */}
                            {cotizacion && (
                                <Fade in={true}>
                                    <Paper sx={{ p: 2, bgcolor: '#e8f5e9', border: '2px solid #4CAF50' }}>
                                        <Typography variant="h6" gutterBottom sx={{ color: '#2E7D32', display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <CalculateIcon /> Estimado de Precio
                                        </Typography>
                                        <Divider sx={{ mb: 2 }} />
                                        
                                        <Grid container spacing={1}>
                                            <Grid size={{ xs: 7 }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    Volumen (CBM):
                                                </Typography>
                                            </Grid>
                                            <Grid size={{ xs: 5 }}>
                                                <Typography variant="body2" fontWeight="bold" textAlign="right">
                                                    {cotizacion.volumen_cbm.toFixed(4)} m³
                                                </Typography>
                                            </Grid>
                                            
                                            <Grid size={{ xs: 7 }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    Servicio PO Box (USD):
                                                </Typography>
                                            </Grid>
                                            <Grid size={{ xs: 5 }}>
                                                <Typography variant="body2" fontWeight="bold" textAlign="right">
                                                    ${cotizacion.costo_pobox_usd.toFixed(2)} USD
                                                </Typography>
                                            </Grid>
                                            
                                            <Grid size={{ xs: 7 }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    Servicio PO Box (MXN):
                                                </Typography>
                                            </Grid>
                                            <Grid size={{ xs: 5 }}>
                                                <Typography variant="body2" fontWeight="bold" textAlign="right">
                                                    {formatCurrency(cotizacion.costo_pobox_mxn)}
                                                </Typography>
                                            </Grid>
                                            
                                            <Grid size={{ xs: 7 }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    Paquetería Nacional ({cotizacion.paqueteria_nombre}):
                                                </Typography>
                                            </Grid>
                                            <Grid size={{ xs: 5 }}>
                                                <Typography variant="body2" fontWeight="bold" textAlign="right">
                                                    {formatCurrency(cotizacion.costo_paqueteria_mxn)}
                                                </Typography>
                                            </Grid>
                                            
                                            <Grid size={{ xs: 12 }}>
                                                <Divider sx={{ my: 1 }} />
                                            </Grid>
                                            
                                            <Grid size={{ xs: 7 }}>
                                                <Typography variant="subtitle1" fontWeight="bold" sx={{ color: '#2E7D32' }}>
                                                    TOTAL ESTIMADO:
                                                </Typography>
                                            </Grid>
                                            <Grid size={{ xs: 5 }}>
                                                <Typography variant="h5" fontWeight="bold" textAlign="right" sx={{ color: '#2E7D32' }}>
                                                    {formatCurrency(cotizacion.total_mxn)}
                                                </Typography>
                                            </Grid>
                                        </Grid>

                                        <Alert severity="info" sx={{ mt: 2 }}>
                                            <Typography variant="caption">
                                                TC: ${tipoCambio.toFixed(2)} MXN/USD • Cotización válida por 24 horas
                                            </Typography>
                                        </Alert>
                                    </Paper>
                                </Fade>
                            )}
                        </Box>
                    )}
                </DialogContent>

                <DialogActions sx={{ p: 2, gap: 1 }}>
                    <Button onClick={handleCloseQuoteModal} color="inherit">
                        Cerrar
                    </Button>
                    <Button
                        variant="contained"
                        onClick={calcularCotizacion}
                        disabled={calculando || !medidas.largo || !medidas.ancho || !medidas.alto}
                        startIcon={calculando ? <CircularProgress size={20} color="inherit" /> : <CalculateIcon />}
                        sx={{ 
                            bgcolor: '#00BCD4', 
                            '&:hover': { bgcolor: '#0097A7' } 
                        }}
                    >
                        {calculando ? 'Calculando...' : 'Calcular Cotización'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* =========== MODAL DE RECEPCIÓN EN SERIE =========== */}
            <Dialog 
                open={bulkReceiveOpen} 
                onClose={handleCloseBulkReceive} 
                maxWidth="md" 
                fullWidth
                PaperProps={{ sx: { borderRadius: 3 } }}
            >
                <DialogTitle sx={{ 
                    bgcolor: '#111', 
                    color: 'white', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center' 
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <InventoryIcon sx={{ color: ORANGE }} />
                        <Box>
                            <Typography variant="h6">Recibir Paquetería en Serie</Typography>
                            <Typography variant="caption" sx={{ color: 'grey.400' }}>
                                📍 Bodega Hidalgo, TX
                            </Typography>
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {paquetesRegistrados.length > 0 && (
                            <Badge badgeContent={paquetesRegistrados.length} color="success">
                                <Chip 
                                    label={`${paquetesRegistrados.length} registrado(s)`} 
                                    size="small" 
                                    sx={{ bgcolor: '#4CAF50', color: 'white' }} 
                                />
                            </Badge>
                        )}
                        <IconButton onClick={handleCloseBulkReceive} sx={{ color: 'white' }}>
                            <CloseIcon />
                        </IconButton>
                    </Box>
                </DialogTitle>

                <DialogContent sx={{ pt: 3 }}>
                    {/* Stepper de 2 pasos */}
                    <Stepper activeStep={bulkStep} alternativeLabel sx={{ mb: 4 }}>
                        <Step completed={bulkStep > 0}>
                            <StepLabel StepIconComponent={() => (
                                <Avatar sx={{ bgcolor: bulkStep >= 0 ? ORANGE : 'grey.300', width: 40, height: 40 }}>
                                    {bulkStep > 0 ? <CheckCircleIcon /> : <InventoryIcon />}
                                </Avatar>
                            )}>Agregar Cajas</StepLabel>
                        </Step>
                        <Step completed={bulkStep > 1}>
                            <StepLabel StepIconComponent={() => (
                                <Avatar sx={{ bgcolor: bulkStep >= 1 ? ORANGE : 'grey.300', width: 40, height: 40 }}>
                                    {bulkStep > 1 ? <CheckCircleIcon /> : <CameraAltIcon />}
                                </Avatar>
                            )}>Foto & Cliente</StepLabel>
                        </Step>
                    </Stepper>

                    {bulkError && <Alert severity="error" sx={{ mb: 2 }}>{bulkError}</Alert>}

                    <Fade in={true} key={bulkStep}>
                        <Box>
                            {/* PASO 0: AGREGAR CAJAS */}
                            {bulkStep === 0 && (
                                <Box>
                                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <InventoryIcon sx={{ color: ORANGE }} /> Agregar Cajas
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                        Pesa y mide cada caja. Puedes agregar las que necesites.
                                    </Typography>

                                    {/* Formulario de caja */}
                                    <Card
                                        elevation={0}
                                        sx={{
                                            p: 3,
                                            mb: 2,
                                            borderRadius: 3,
                                            border: `2px dashed ${ORANGE}`,
                                            background: 'linear-gradient(180deg, #FFF8F5 0%, #FFFFFF 100%)',
                                        }}
                                    >
                                        {/* Sección 1: Guía del proveedor */}
                                        <Typography variant="overline" sx={{ color: ORANGE, fontWeight: 700, letterSpacing: 1 }}>
                                            1 · Guía del Proveedor
                                        </Typography>
                                        <TextField
                                            fullWidth
                                            autoFocus
                                            inputRef={bulkGuideInputRef}
                                            placeholder="Escanea o escribe la guía (Amazon, UPS, etc.)..."
                                            value={bulkCurrentBox.trackingCourier}
                                            onChange={(e) => setBulkCurrentBox(p => ({ ...p, trackingCourier: e.target.value.toUpperCase() }))}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleBulkGuideScanned();
                                                }
                                            }}
                                            InputProps={{
                                                startAdornment: <InputAdornment position="start"><QrCodeScannerIcon sx={{ color: ORANGE }} /></InputAdornment>,
                                                sx: { bgcolor: 'white', borderRadius: 2 },
                                            }}
                                            sx={{ mt: 1, mb: 2 }}
                                        />

                                        <Divider sx={{ my: 2 }} />

                                        {/* Sección 2: Peso y medidas */}
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography variant="overline" sx={{ color: ORANGE, fontWeight: 700, letterSpacing: 1 }}>
                                                2 · Peso y Medidas
                                            </Typography>
                                            <Button
                                                size="small"
                                                startIcon={<ScaleIcon />}
                                                onClick={handleReadBulkScale}
                                                sx={{
                                                    color: ORANGE,
                                                    borderColor: ORANGE,
                                                    textTransform: 'none',
                                                    fontWeight: 600,
                                                    '&:hover': { bgcolor: '#FFF0EA' },
                                                }}
                                                variant="outlined"
                                            >
                                                Actualizar desde báscula
                                            </Button>
                                        </Box>

                                        <Grid container spacing={1.5}>
                                            <Grid size={{ xs: 6, sm: 3 }}>
                                                <TextField
                                                    fullWidth
                                                    inputRef={bulkWeightInputRef}
                                                    label="Peso"
                                                    type="number"
                                                    value={bulkCurrentBox.weight}
                                                    onChange={(e) => setBulkCurrentBox(p => ({ ...p, weight: e.target.value }))}
                                                    InputProps={{
                                                        endAdornment: <InputAdornment position="end">kg</InputAdornment>,
                                                        sx: { bgcolor: 'white', borderRadius: 2 },
                                                    }}
                                                    inputProps={{ step: 0.01, min: 0.01 }}
                                                />
                                            </Grid>
                                            <Grid size={{ xs: 6, sm: 3 }}>
                                                <TextField
                                                    fullWidth
                                                    inputRef={bulkLengthInputRef}
                                                    label="Largo"
                                                    type="number"
                                                    value={bulkCurrentBox.length}
                                                    onChange={(e) => setBulkCurrentBox(p => ({ ...p, length: e.target.value }))}
                                                    InputProps={{
                                                        endAdornment: <InputAdornment position="end">cm</InputAdornment>,
                                                        sx: { bgcolor: 'white', borderRadius: 2 },
                                                    }}
                                                    inputProps={{ min: 1 }}
                                                />
                                            </Grid>
                                            <Grid size={{ xs: 6, sm: 3 }}>
                                                <TextField
                                                    fullWidth
                                                    label="Ancho"
                                                    type="number"
                                                    value={bulkCurrentBox.width}
                                                    onChange={(e) => setBulkCurrentBox(p => ({ ...p, width: e.target.value }))}
                                                    InputProps={{
                                                        endAdornment: <InputAdornment position="end">cm</InputAdornment>,
                                                        sx: { bgcolor: 'white', borderRadius: 2 },
                                                    }}
                                                    inputProps={{ min: 1 }}
                                                />
                                            </Grid>
                                            <Grid size={{ xs: 6, sm: 3 }}>
                                                <TextField
                                                    fullWidth
                                                    label="Alto"
                                                    type="number"
                                                    value={bulkCurrentBox.height}
                                                    onChange={(e) => setBulkCurrentBox(p => ({ ...p, height: e.target.value }))}
                                                    InputProps={{
                                                        endAdornment: <InputAdornment position="end">cm</InputAdornment>,
                                                        sx: { bgcolor: 'white', borderRadius: 2 },
                                                    }}
                                                    inputProps={{ min: 1 }}
                                                />
                                            </Grid>
                                        </Grid>

                                        <Divider sx={{ my: 2 }} />

                                        {/* Sección 3: Cantidad + acciones */}
                                        <Typography variant="overline" sx={{ color: ORANGE, fontWeight: 700, letterSpacing: 1 }}>
                                            3 · Cantidad y Agregar
                                        </Typography>
                                        <Grid container spacing={1.5} alignItems="stretch" sx={{ mt: 0.5 }}>
                                            <Grid size={{ xs: 12, sm: 3 }}>
                                                <TextField
                                                    fullWidth
                                                    label="Cantidad"
                                                    type="number"
                                                    value={bulkBoxQuantity}
                                                    onChange={(e) => setBulkBoxQuantity(e.target.value)}
                                                    inputProps={{ min: 1, max: 99, step: 1 }}
                                                    InputProps={{ sx: { bgcolor: 'white', borderRadius: 2 } }}
                                                    helperText={parseInt(bulkBoxQuantity) > 1 ? '⚠️ Pedirá guías al agregar' : ' '}
                                                />
                                            </Grid>
                                            <Grid size={{ xs: 12, sm: 6 }}>
                                                <Button
                                                    fullWidth
                                                    variant="contained"
                                                    size="large"
                                                    startIcon={<AddIcon />}
                                                    onClick={handleAddBulkBox}
                                                    sx={{
                                                        height: 56,
                                                        borderRadius: 2,
                                                        background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)`,
                                                        textTransform: 'none',
                                                        fontSize: '1rem',
                                                        fontWeight: 700,
                                                        boxShadow: '0 4px 12px rgba(240,90,40,0.25)',
                                                        '&:hover': { boxShadow: '0 6px 18px rgba(240,90,40,0.35)' },
                                                    }}
                                                >
                                                    {parseInt(bulkBoxQuantity) > 1 ? `Agregar ${bulkBoxQuantity} cajas` : 'Agregar Caja'}
                                                </Button>
                                            </Grid>
                                            <Grid size={{ xs: 12, sm: 3 }}>
                                                <Button
                                                    fullWidth
                                                    variant="outlined"
                                                    size="large"
                                                    disabled={bulkBoxes.length === 0}
                                                    onClick={() => {
                                                        const last = bulkBoxes[bulkBoxes.length - 1];
                                                        if (last) setBulkCurrentBox(p => ({ ...p, weight: last.weight, length: last.length, width: last.width, height: last.height }));
                                                    }}
                                                    sx={{
                                                        height: 56,
                                                        borderRadius: 2,
                                                        borderColor: '#9C27B0',
                                                        color: '#9C27B0',
                                                        textTransform: 'none',
                                                        fontWeight: 600,
                                                        '&:hover': { bgcolor: '#F3E5F5', borderColor: '#7B1FA2' },
                                                    }}
                                                >
                                                    📋 Copiar anterior
                                                </Button>
                                            </Grid>
                                        </Grid>
                                    </Card>

                                    {/* Lista de cajas agregadas */}
                                    {bulkBoxes.length > 0 && (
                                        <Paper sx={{ p: 2 }}>
                                            <Typography variant="subtitle2" gutterBottom>📦 Cajas agregadas ({bulkBoxes.length}):</Typography>
                                            <List dense>
                                                {bulkBoxes.map((box, idx) => (
                                                    <ListItem key={box.id} sx={{ bgcolor: idx % 2 === 0 ? 'grey.50' : 'white', borderRadius: 1 }}>
                                                        <ListItemIcon>
                                                            <Chip label={idx + 1} size="small" sx={{ bgcolor: ORANGE, color: 'white' }} />
                                                        </ListItemIcon>
                                                        <ListItemText
                                                            primary={
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                    <span>{box.weight} kg — {box.length} × {box.width} × {box.height} cm</span>
                                                                    <Chip
                                                                        size="small"
                                                                        icon={<QrCodeScannerIcon sx={{ fontSize: 14 }} />}
                                                                        label={box.trackingCourier || 'Sin guía — clic para agregar'}
                                                                        variant="outlined"
                                                                        clickable
                                                                        onClick={() => {
                                                                            const next = window.prompt(`Guía del proveedor (caja ${idx + 1}):`, box.trackingCourier || '');
                                                                            if (next !== null) {
                                                                                const v = next.trim().toUpperCase();
                                                                                setBulkBoxes(prev => prev.map(b => b.id === box.id ? { ...b, trackingCourier: v } : b));
                                                                            }
                                                                        }}
                                                                        sx={{ borderColor: ORANGE, color: box.trackingCourier ? ORANGE : 'grey.500', cursor: 'pointer' }}
                                                                    />
                                                                </Box>
                                                            }
                                                            secondary={`Volumen: ${((parseFloat(box.length) * parseFloat(box.width) * parseFloat(box.height)) / 1000000).toFixed(4)} CBM`}
                                                        />
                                                        <ListItemSecondaryAction>
                                                            <IconButton edge="end" onClick={() => handleRemoveBulkBox(box.id)}>
                                                                <DeleteIcon color="error" />
                                                            </IconButton>
                                                        </ListItemSecondaryAction>
                                                    </ListItem>
                                                ))}
                                            </List>
                                            <Divider sx={{ my: 2 }} />
                                            <Box sx={{ display: 'flex', justifyContent: 'space-around' }}>
                                                <Typography><strong>Peso Total:</strong> {bulkTotalWeight.toFixed(2)} kg</Typography>
                                                <Typography><strong>Volumen Total:</strong> {bulkTotalVolume.toFixed(4)} CBM</Typography>
                                            </Box>
                                        </Paper>
                                    )}
                                </Box>
                            )}

                            {/* PASO 1: FOTO & CLIENTE */}
                            {bulkStep === 1 && (
                                <Box>
                                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <CameraAltIcon sx={{ color: ORANGE }} /> Foto y Número de Cliente
                                    </Typography>

                                    <Grid container spacing={3}>
                                        {/* Sección de Foto */}
                                        <Grid size={{ xs: 12, md: 6 }}>
                                            <Card sx={{ p: 2, height: '100%' }}>
                                                <Typography variant="subtitle2" gutterBottom>📸 Foto del Paquete (Opcional)</Typography>
                                                
                                                {bulkImage ? (
                                                    <Box sx={{ position: 'relative', textAlign: 'center' }}>
                                                        <img 
                                                            src={bulkImage} 
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
                                                            onClick={() => setBulkImage(null)}
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
                                                ) : cameraOpen ? (
                                                    <Box sx={{ position: 'relative', textAlign: 'center' }}>
                                                        <video 
                                                            ref={videoRef} 
                                                            autoPlay 
                                                            playsInline 
                                                            style={{ 
                                                                width: '100%', 
                                                                maxHeight: 200, 
                                                                borderRadius: 12,
                                                                border: `3px solid ${ORANGE}`
                                                            }} 
                                                        />
                                                        <canvas ref={canvasRef} style={{ display: 'none' }} />
                                                        <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'center' }}>
                                                            <Button 
                                                                variant="contained" 
                                                                onClick={captureBulkPhoto}
                                                                sx={{ bgcolor: ORANGE }}
                                                            >
                                                                📷 Capturar
                                                            </Button>
                                                            <Button variant="outlined" onClick={closeBulkCamera}>
                                                                Cancelar
                                                            </Button>
                                                        </Box>
                                                    </Box>
                                                ) : (
                                                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                                                        <Button
                                                            variant="contained"
                                                            startIcon={<VideocamIcon />}
                                                            onClick={openBulkCamera}
                                                            sx={{ bgcolor: ORANGE }}
                                                        >
                                                            Abrir Cámara
                                                        </Button>
                                                        <Button
                                                            variant="outlined"
                                                            component="label"
                                                            startIcon={<CameraAltIcon />}
                                                        >
                                                            Subir Foto
                                                            <input
                                                                type="file"
                                                                hidden
                                                                accept="image/*"
                                                                onChange={(e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (file) {
                                                                        const reader = new FileReader();
                                                                        reader.onload = (ev) => {
                                                                            setBulkImage(ev.target?.result as string);
                                                                        };
                                                                        reader.readAsDataURL(file);
                                                                    }
                                                                }}
                                                            />
                                                        </Button>
                                                    </Box>
                                                )}
                                            </Card>
                                        </Grid>

                                        {/* Sección de Cliente */}
                                        <Grid size={{ xs: 12, md: 6 }}>
                                            <Card sx={{ p: 2, height: '100%' }}>
                                                <Typography variant="subtitle2" gutterBottom>
                                                    <PersonIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                                                    Número de Casillero del Cliente (Opcional)
                                                </Typography>
                                                <TextField
                                                    fullWidth
                                                    placeholder="Ej: S-001 (dejar vacío si no se conoce)"
                                                    value={bulkBoxId}
                                                    onChange={(e) => setBulkBoxId(e.target.value.toUpperCase())}
                                                    InputProps={{
                                                        startAdornment: <InputAdornment position="start"><QrCodeScannerIcon /></InputAdornment>,
                                                    }}
                                                    sx={{ mb: 2 }}
                                                />
                                                
                                                {!bulkBoxId && (
                                                    <Alert severity="warning" sx={{ mb: 2 }}>
                                                        <Typography variant="caption">
                                                            ⚠️ Sin casillero: El paquete se guardará como "Sin Cliente" y podrá asignarse después
                                                        </Typography>
                                                    </Alert>
                                                )}
                                                
                                                <Alert severity="info" sx={{ mb: 2 }}>
                                                    <Typography variant="caption">
                                                        📍 Este paquete se registrará en <strong>Bodega Hidalgo, TX</strong> con estado "En Bodega"
                                                    </Typography>
                                                </Alert>

                                                {/* Resumen del paquete */}
                                                <Paper sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                                                    <Typography variant="subtitle2" gutterBottom>📦 Resumen:</Typography>
                                                    <Typography variant="body2">• Cajas: {bulkBoxes.length}</Typography>
                                                    <Typography variant="body2">• Peso total: {bulkTotalWeight.toFixed(2)} kg</Typography>
                                                    <Typography variant="body2">• Volumen total: {bulkTotalVolume.toFixed(4)} CBM</Typography>
                                                </Paper>
                                            </Card>
                                        </Grid>
                                    </Grid>
                                </Box>
                            )}
                        </Box>
                    </Fade>
                </DialogContent>

                <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
                    <Box>
                        {bulkStep > 0 && (
                            <Button onClick={handleBulkPrevStep} startIcon={<BackIcon />}>
                                Atrás
                            </Button>
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button onClick={handleCloseBulkReceive} color="inherit">
                            Cerrar
                        </Button>
                        {bulkStep === 0 ? (
                            <Button
                                variant="contained"
                                onClick={handleBulkNextStep}
                                disabled={bulkBoxes.length === 0}
                                endIcon={<ArrowForwardIcon />}
                                sx={{ bgcolor: ORANGE }}
                            >
                                Siguiente
                            </Button>
                        ) : (
                            <Button
                                variant="contained"
                                onClick={handleSaveBulkPackage}
                                disabled={bulkSubmitting}
                                startIcon={bulkSubmitting ? <CircularProgress size={20} color="inherit" /> : <CheckCircleIcon />}
                                sx={{ bgcolor: '#4CAF50', '&:hover': { bgcolor: '#388E3C' } }}
                            >
                                {bulkSubmitting ? 'Guardando...' : 'Guardar y Siguiente Paquete'}
                            </Button>
                        )}
                    </Box>
                </DialogActions>
            </Dialog>

            {/* Multi-box scan dialog (N guías) */}
            <MultiBoxScanDialog
                open={bulkMultiScanOpen}
                quantity={Math.max(1, parseInt(bulkBoxQuantity) || 1)}
                initialGuide={bulkCurrentBox.trackingCourier}
                onClose={() => setBulkMultiScanOpen(false)}
                onComplete={handleBulkMultiScanComplete}
            />

            {/* =========== MODAL DE INVENTARIO =========== */}
            <Dialog 
                open={inventoryModalOpen} 
                onClose={handleCloseInventory} 
                maxWidth="lg" 
                fullWidth
                PaperProps={{ sx: { borderRadius: 3, minHeight: '70vh' } }}
            >
                <DialogTitle sx={{ 
                    bgcolor: '#455A64', 
                    color: 'white', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center' 
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Inventory2Icon />
                        <Box>
                            <Typography variant="h6">Inventario PO Box USA</Typography>
                            <Typography variant="caption" sx={{ color: 'grey.300' }}>
                                {filteredInventoryPackages.length} paquete(s) encontrado(s)
                            </Typography>
                        </Box>
                    </Box>
                    <IconButton onClick={handleCloseInventory} sx={{ color: 'white' }}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>

                <DialogContent sx={{ pt: 3 }}>
                    {/* Filtros */}
                    <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                        <TextField
                            placeholder="Buscar por tracking, cliente, casillero..."
                            value={inventorySearch}
                            onChange={(e) => setInventorySearch(e.target.value)}
                            InputProps={{
                                startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
                            }}
                            size="small"
                            sx={{ minWidth: 300 }}
                        />
                        <FormControl size="small" sx={{ minWidth: 180 }}>
                            <InputLabel>Estado</InputLabel>
                            <Select
                                value={inventoryStatusFilter}
                                label="Estado"
                                onChange={(e) => setInventoryStatusFilter(e.target.value)}
                            >
                                {STATUS_OPTIONS.map(opt => (
                                    <MenuItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <Button
                            variant="outlined"
                            startIcon={<RefreshIcon />}
                            onClick={fetchInventoryPackages}
                            disabled={inventoryLoading}
                        >
                            Actualizar
                        </Button>
                    </Box>

                    {/* Tabla de paquetes */}
                    {inventoryLoading ? (
                        <Box display="flex" justifyContent="center" py={6}>
                            <CircularProgress />
                        </Box>
                    ) : filteredInventoryPackages.length === 0 ? (
                        <Alert severity="info" sx={{ mt: 2 }}>
                            No se encontraron paquetes con los filtros seleccionados
                        </Alert>
                    ) : (
                        <>
                            <TableContainer component={Paper} sx={{ maxHeight: '50vh' }}>
                                <Table stickyHeader size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Tracking</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Cliente</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Casillero</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Peso</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Dimensiones</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Estado</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Consolidación</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Recibido</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }} align="center">Acciones</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {filteredInventoryPackages
                                            .slice(inventoryPage * inventoryRowsPerPage, inventoryPage * inventoryRowsPerPage + inventoryRowsPerPage)
                                            .map((pkg) => (
                                                <TableRow key={pkg.id} hover>
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight="bold" sx={{ color: ORANGE }}>
                                                            {pkg.tracking}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2">{pkg.client?.name || '-'}</Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {pkg.client?.email}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip 
                                                            label={pkg.client?.boxId || '-'} 
                                                            size="small" 
                                                            sx={{ bgcolor: '#e3f2fd', fontWeight: 'bold' }}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        {pkg.weight ? `${pkg.weight} kg` : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        {pkg.dimensions?.length && pkg.dimensions?.width && pkg.dimensions?.height
                                                            ? `${pkg.dimensions.length}×${pkg.dimensions.width}×${pkg.dimensions.height} cm`
                                                            : '-'
                                                        }
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip 
                                                            label={getStatusLabel(pkg.status)} 
                                                            size="small" 
                                                            color={getStatusColor(pkg.status)}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        {pkg.consolidationId ? (
                                                            <Chip 
                                                                label={`#${pkg.consolidationId}`} 
                                                                size="small" 
                                                                variant="outlined"
                                                                sx={{ fontWeight: 'bold', borderColor: '#1976d2', color: '#1976d2' }}
                                                            />
                                                        ) : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2">
                                                            {new Date(pkg.receivedAt).toLocaleDateString('es-MX', {
                                                                day: '2-digit',
                                                                month: 'short',
                                                                year: 'numeric'
                                                            })}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Tooltip title="Ver detalles">
                                                            <IconButton size="small" color="primary">
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
                                count={filteredInventoryPackages.length}
                                page={inventoryPage}
                                onPageChange={(_, newPage) => setInventoryPage(newPage)}
                                rowsPerPage={inventoryRowsPerPage}
                                onRowsPerPageChange={(e) => {
                                    setInventoryRowsPerPage(parseInt(e.target.value, 10));
                                    setInventoryPage(0);
                                }}
                                labelRowsPerPage="Filas por página:"
                                labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
                            />
                        </>
                    )}
                </DialogContent>

                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={handleCloseInventory} color="inherit">
                        Cerrar
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar de notificaciones */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert 
                    onClose={() => setSnackbar({ ...snackbar, open: false })} 
                    severity={snackbar.severity}
                    sx={{ width: '100%' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}

// Funciones auxiliares para títulos y descripciones por defecto
function getDefaultTitle(id: string): string {
    const titles: Record<string, string> = {
        receive: 'Recibir Paquetería',
        receive_consolidation: 'Recibir Consolidación',
        entry: 'Entrada',
        exit: 'Salida',
        collect: 'Cobrar',
        quote: 'Cotizar',
        repack: 'Reempaque',
        inventory: 'Inventario',
    };
    return titles[id] || id;
}

function getDefaultDescription(id: string): string {
    const descriptions: Record<string, string> = {
        receive: 'Recepción en serie - Bodega Hidalgo TX',
        receive_consolidation: 'Escanear y validar consolidaciones que llegan a MTY',
        entry: 'Ver paquetes recibidos en bodega',
        exit: 'Procesar consolidaciones y despachos',
        collect: 'Gestionar cobros y pagos pendientes',
        quote: 'Calcular costos y generar cotizaciones',
        repack: 'Consolidar múltiples paquetes en una caja',
        inventory: 'Ver todos los paquetes PO Box',
    };
    return descriptions[id] || '';
}
