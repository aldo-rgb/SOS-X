// ============================================
// PO BOX HUB PAGE
// Panel centralizado para todos los servicios de PO Box USA
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
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
    Warning as WarningIcon,
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
    { value: 'received', label: 'En Bodega', color: 'info' },
    { value: 'processing', label: 'Procesando', color: 'warning' },
    { value: 'in_transit', label: 'En Tránsito', color: 'primary' },
    { value: 'delivered', label: 'Entregado', color: 'success' },
];

// Paqueterías disponibles
const PAQUETERIAS = [
    { id: 1, nombre: 'Paquete Express', codigo: 'paquete_express', precio_base: 350, precio_kg_extra: 25, peso_incluido: 10 },
    { id: 2, nombre: 'Fedex Economy', codigo: 'fedex_economy', precio_base: 280, precio_kg_extra: 30, peso_incluido: 5 },
    { id: 3, nombre: 'Estafeta', codigo: 'estafeta', precio_base: 220, precio_kg_extra: 22, peso_incluido: 5 },
    { id: 4, nombre: 'DHL Express', codigo: 'dhl_express', precio_base: 450, precio_kg_extra: 45, peso_incluido: 10 },
];

const ORANGE = '#F05A28';

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
    
    // Estados para permisos de módulos
    const [allowedModules, setAllowedModules] = useState<string[]>([]);
    const [permissionsLoading, setPermissionsLoading] = useState(true);
    const [userRole, setUserRole] = useState<string>('');
    
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
    const [cameraOpen, setCameraOpen] = useState(false);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

    // =========== Estados para INVENTARIO ===========
    const [inventoryModalOpen, setInventoryModalOpen] = useState(false);
    const [inventoryPackages, setInventoryPackages] = useState<InventoryPackage[]>([]);
    const [inventoryLoading, setInventoryLoading] = useState(false);
    const [inventoryStatusFilter, setInventoryStatusFilter] = useState('all');
    const [inventorySearch, setInventorySearch] = useState('');
    const [inventoryPage, setInventoryPage] = useState(0);
    const [inventoryRowsPerPage, setInventoryRowsPerPage] = useState(10);

    const token = localStorage.getItem('token');

    // Cargar permisos de módulos al montar
    useEffect(() => {
        const loadModulePermissions = async () => {
            setPermissionsLoading(true);
            try {
                // Obtener rol del usuario
                const profileRes = await fetch(`${API_URL}/api/auth/profile`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                
                let role = '';
                if (profileRes.ok) {
                    const profileData = await profileRes.json();
                    role = profileData.user?.role || profileData.role || '';
                    setUserRole(role);
                }

                // Si es super_admin, tiene acceso a todo
                if (role === 'super_admin') {
                    setAllowedModules(POBOX_MENU_OPTIONS.map(opt => opt.id));
                    setPermissionsLoading(false);
                    return;
                }

                // Cargar permisos de módulos para ops_usa_pobox
                const modulesRes = await fetch(`${API_URL}/api/modules/ops_usa_pobox/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (modulesRes.ok) {
                    const modulesData = await modulesRes.json();
                    const allowed = (modulesData.modules || [])
                        .filter((m: { can_view: boolean }) => m.can_view)
                        .map((m: { module_key: string }) => m.module_key);
                    
                    console.log('📋 Módulos permitidos en PO Box:', allowed);
                    setAllowedModules(allowed);
                } else {
                    // Si no hay endpoint, mostrar todos por defecto
                    setAllowedModules(POBOX_MENU_OPTIONS.map(opt => opt.id));
                }
            } catch (err) {
                console.error('Error loading module permissions:', err);
                // En caso de error, mostrar todos
                setAllowedModules(POBOX_MENU_OPTIONS.map(opt => opt.id));
            } finally {
                setPermissionsLoading(false);
            }
        };

        loadModulePermissions();
    }, [token]);

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
    
    // Agregar caja al listado
    const handleAddBulkBox = () => {
        if (!bulkCurrentBox.weight || !bulkCurrentBox.length || !bulkCurrentBox.width || !bulkCurrentBox.height) {
            setBulkError('Completa peso y medidas de la caja');
            return;
        }
        setBulkBoxes(prev => [...prev, { ...bulkCurrentBox, id: Date.now() }]);
        setBulkCurrentBox({ weight: '', length: '', width: '', height: '', trackingCourier: '' });
        setBulkError('');
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

    // Guardar paquete y continuar con el siguiente
    const handleSaveBulkPackage = async () => {
        // boxId ya no es obligatorio - se puede crear sin cliente
        setBulkSubmitting(true);
        setBulkError('');

        try {
            const payload = {
                boxId: bulkBoxId || undefined, // Opcional - puede ser sin cliente
                description: `Paquete recibido: Hidalgo TX`,
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
            processing: 'warning',
            in_transit: 'primary',
            delivered: 'success',
            customs: 'error',
        };
        return colors[status] || 'default';
    };

    // Obtener label del status
    const getStatusLabel = (status: string): string => {
        const labels: Record<string, string> = {
            received: '📦 En Bodega',
            processing: '📋 Procesando',
            in_transit: '🚚 En Tránsito',
            delivered: '✅ Entregado',
            customs: '🛃 En Aduana',
        };
        return labels[status] || status;
    };

    // Cerrar modal de inventario
    const handleCloseInventory = () => {
        setInventoryModalOpen(false);
        setInventorySearch('');
        setInventoryStatusFilter('all');
        setInventoryPage(0);
    };

    // Handler para clic en opción
    const handleOptionClick = (optionId: string) => {
        if (optionId === 'quote') {
            setQuoteModalOpen(true);
        } else if (optionId === 'receive') {
            setBulkReceiveOpen(true);
        } else if (optionId === 'inventory') {
            setInventoryModalOpen(true);
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
                                        transition: 'all 0.3s ease',
                                        '&:hover': {
                                            transform: 'translateY(-8px)',
                                            boxShadow: 6,
                                        },
                                    }}
                                >
                                    <CardActionArea
                                        onClick={() => handleOptionClick(option.id)}
                                        sx={{ height: '100%' }}
                                    >
                                        <Box
                                            sx={{
                                                background: option.bgGradient,
                                                p: 3,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    width: 100,
                                                    height: 100,
                                                    borderRadius: '50%',
                                                    bgcolor: 'rgba(255,255,255,0.2)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                }}
                                            >
                                                <Box sx={{ color: 'white' }}>
                                                    {option.icon}
                                                </Box>
                                            </Box>
                                        </Box>
                                        <CardContent sx={{ textAlign: 'center' }}>
                                            <Typography variant="h6" fontWeight="bold" gutterBottom>
                                                {t(`pobox.hub.options.${option.id}.title`, getDefaultTitle(option.id))}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {t(`pobox.hub.options.${option.id}.description`, getDefaultDescription(option.id))}
                                            </Typography>
                                        </CardContent>
                                    </CardActionArea>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>

                    {/* Advertencia de cargo por almacenaje */}
                    <Box sx={{ mt: 4 }}>
                        <Alert 
                            severity="warning" 
                            icon={<WarningIcon />}
                            sx={{ 
                                borderRadius: 2,
                                border: '2px solid #ed6c02',
                                bgcolor: '#fff4e5',
                                '& .MuiAlert-icon': {
                                    fontSize: 28
                                }
                            }}
                        >
                            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 0.5 }}>
                                ⚠️ Aviso Importante - Cargo por Almacenaje
                            </Typography>
                            <Typography variant="body2">
                                Los paquetes que permanezcan en bodega <strong>más de 15 días</strong> a partir de su fecha de recepción 
                                generarán un cargo de <strong>$3.00 USD diarios por caja</strong>. 
                                Te recomendamos recoger o solicitar el envío de tus paquetes antes de este plazo para evitar cargos adicionales.
                            </Typography>
                        </Alert>
                    </Box>

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
                                    <Card sx={{ p: 2, mb: 2, border: `2px dashed ${ORANGE}` }}>
                                        <Grid container spacing={2} alignItems="center">
                                            {/* Guía del Proveedor */}
                                            <Grid size={{ xs: 12, sm: 6 }}>
                                                <TextField 
                                                    fullWidth 
                                                    label="📦 Guía del Proveedor (Amazon, UPS, etc.)" 
                                                    placeholder="Escanea o escribe la guía..."
                                                    value={bulkCurrentBox.trackingCourier} 
                                                    onChange={(e) => setBulkCurrentBox(p => ({ ...p, trackingCourier: e.target.value.toUpperCase() }))}
                                                    InputProps={{ startAdornment: <InputAdornment position="start"><QrCodeScannerIcon /></InputAdornment> }}
                                                    helperText="Guía individual de esta caja"
                                                />
                                            </Grid>
                                            <Grid size={{ xs: 12, sm: 6 }}></Grid>
                                            
                                            {/* Peso */}
                                            <Grid size={{ xs: 12, sm: 3 }}>
                                                <TextField 
                                                    fullWidth 
                                                    label="Peso (kg)" 
                                                    type="number"
                                                    value={bulkCurrentBox.weight} 
                                                    onChange={(e) => setBulkCurrentBox(p => ({ ...p, weight: e.target.value }))}
                                                    InputProps={{ 
                                                        startAdornment: <InputAdornment position="start"><ScaleIcon /></InputAdornment>,
                                                        endAdornment: <InputAdornment position="end">kg</InputAdornment> 
                                                    }}
                                                    inputProps={{ step: 0.01, min: 0.01 }}
                                                />
                                            </Grid>
                                            <Grid size={{ xs: 4, sm: 2 }}>
                                                <TextField 
                                                    fullWidth 
                                                    label="Largo" 
                                                    type="number" 
                                                    value={bulkCurrentBox.length}
                                                    onChange={(e) => setBulkCurrentBox(p => ({ ...p, length: e.target.value }))}
                                                    InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }}
                                                    inputProps={{ min: 1 }}
                                                />
                                            </Grid>
                                            <Grid size={{ xs: 4, sm: 2 }}>
                                                <TextField 
                                                    fullWidth 
                                                    label="Ancho" 
                                                    type="number" 
                                                    value={bulkCurrentBox.width}
                                                    onChange={(e) => setBulkCurrentBox(p => ({ ...p, width: e.target.value }))}
                                                    InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }}
                                                    inputProps={{ min: 1 }}
                                                />
                                            </Grid>
                                            <Grid size={{ xs: 4, sm: 2 }}>
                                                <TextField 
                                                    fullWidth 
                                                    label="Alto" 
                                                    type="number" 
                                                    value={bulkCurrentBox.height}
                                                    onChange={(e) => setBulkCurrentBox(p => ({ ...p, height: e.target.value }))}
                                                    InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }}
                                                    inputProps={{ min: 1 }}
                                                />
                                            </Grid>
                                            <Grid size={{ xs: 12, sm: 3 }}>
                                                <Button 
                                                    fullWidth 
                                                    variant="contained" 
                                                    startIcon={<AddIcon />} 
                                                    onClick={handleAddBulkBox}
                                                    sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)`, py: 1.5 }}
                                                >
                                                    Agregar Caja
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
        entry: 'Ver paquetes recibidos en bodega',
        exit: 'Procesar consolidaciones y despachos',
        collect: 'Gestionar cobros y pagos pendientes',
        quote: 'Calcular costos y generar cotizaciones',
        repack: 'Consolidar múltiples paquetes en una caja',
        inventory: 'Ver todos los paquetes PO Box',
    };
    return descriptions[id] || '';
}
