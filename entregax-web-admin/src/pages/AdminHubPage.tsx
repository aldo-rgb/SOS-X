// ============================================
// HUB DE PANELES ADMINISTRATIVOS POR SERVICIO
// Vista para gestión administrativa de cada ruta/servicio
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Box,
    Typography,
    Card,
    CardContent,
    CardActionArea,
    Grid,
    Chip,
    CircularProgress,
    Alert,
    Paper,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
} from '@mui/material';
import {
    Flight as FlightIcon,
    DirectionsBoat as BoatIcon,
    LocalShipping as TruckIcon,
    Warehouse as WarehouseIcon,
    LocationOn as LocationIcon,
    Receipt as ReceiptIcon,
    VerifiedUser as VerifiedUserIcon,
    Sell as SellIcon,
    Assessment as AssessmentIcon,
    Inventory as InventoryIcon,
    Assignment as AssignmentIcon,
    Timeline as TimelineIcon,
    CheckCircle as CheckCircleIcon,
    Construction as ConstructionIcon,
    Calculate as CalculateIcon,
    Security as SecurityIcon,
    Payments as PaymentsIcon,
    Email as EmailIcon,
    Api as ApiIcon,
    Route as RouteIcon,
    Business as BranchIcon,
} from '@mui/icons-material';

// Importar paneles implementados
import CostingPanelChinaAir from './CostingPanelChinaAir';
import CostingPanelMaritimo from './CostingPanelMaritimo';
import MaritimeConsolidationsPage from './MaritimeConsolidationsPage';
import WarrantiesPage from './WarrantiesPage';
import ServiceInvoicingPanel from './ServiceInvoicingPanel';
import ServiceInstructionsPanel from './ServiceInstructionsPanel';
import InventoryPanel from './InventoryPanel';
import VerificationsPage from './VerificationsPage';
import SupplierPaymentsPage from './SupplierPaymentsPage';
import InboundEmailsPage from './InboundEmailsPage';
import InboundEmailsAirPage from './InboundEmailsAirPage';
import MaritimeApiPage from './MaritimeApiPage';
import AirApiPage from './AirApiPage';
import MaritimeRoutesPage from './MaritimeRoutesPage';
import AirRoutesPage from './AirRoutesPage';
import AirPricingPage from './AirPricingPage';
import LegacyClientsPage from './LegacyClientsPage';
// MaritimeRatesPage removido - se usa MaritimePricingEnginePage
import MaritimePricingEnginePage from './MaritimePricingEnginePage';
import FinancialManagementPage from './FinancialManagementPage';
// import PaymentInvoicesPage from './PaymentInvoicesPage'; // ELIMINADO
import NationalFreightRatesPage from './NationalFreightRatesPage';
import LastMilePage from './LastMilePage';
import PaqueteExpressPage from './PaqueteExpressPage';
import DhlRatesPage from './DhlRatesPage';
import DhlCostingPage from './DhlCostingPage';
import POBoxRatesPage from './POBoxRatesPage';
import POBoxCostingPage from './POBoxCostingPage';
import ExchangeRateConfigPage from './ExchangeRateConfigPage';
import BranchManagementPage from './BranchManagementPage';
import CarouselSlidesPage from './CarouselSlidesPage';
import AdvanceControlPanel from './AdvanceControlPanel';
import FCLManagementPage from './FCLManagementPage';
import AirManagementPage from './AirManagementPage';
import CajoManagementPage from './CajoManagementPage';
import {
    UploadFile as UploadIcon,
    AccountBalanceWallet as WalletIcon,
    LocalShipping as LocalShippingIcon,
    Badge as BadgeIcon,
    DirectionsCar as DirectionsCarIcon,
    Smartphone as SmartphoneIcon,
} from '@mui/icons-material';

// Importar páginas de HR y Fleet
import HRManagementPage from './HRManagementPage';
import FleetManagementPage from './FleetManagementPage';
import CajaChicaPage from './CajaChicaPage';
import FinanceDashboardPage from './FinanceDashboardPage';
import SuppliersPage from './SuppliersPage';
import CarrierServiceOptionsPage from './CarrierServiceOptionsPage';
import LocalAtmIcon from '@mui/icons-material/LocalAtm';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ============================================
// CONFIGURACIÓN DE PANELES POR SERVICIO
// Cada servicio tiene su panel administrativo dedicado
// ============================================

const SERVICE_ICONS = {
    china_air: <FlightIcon />,
    china_sea: <BoatIcon />,
    usa_pobox: <TruckIcon />,
    mx_cedis: <WarehouseIcon />,
    mx_national: <LocationIcon />,
};

const SERVICE_COLORS = {
    china_air: { color: '#F05A28', bgGradient: 'linear-gradient(135deg, #F05A28 0%, #FF8A65 100%)', flag: '🇨🇳' },
    china_sea: { color: '#F05A28', bgGradient: 'linear-gradient(135deg, #F05A28 0%, #FF8A65 100%)', flag: '🇨🇳' },
    usa_pobox: { color: '#F05A28', bgGradient: 'linear-gradient(135deg, #F05A28 0%, #FF8A65 100%)', flag: '🇺🇸' },
    mx_cedis: { color: '#F05A28', bgGradient: 'linear-gradient(135deg, #F05A28 0%, #FF8A65 100%)', flag: '🇲🇽' },
    mx_national: { color: '#F05A28', bgGradient: 'linear-gradient(135deg, #F05A28 0%, #FF8A65 100%)', flag: '🇲🇽' },
};

const MODULE_ICONS: Record<string, React.ReactElement> = {
    costing: <CalculateIcon />,
    pricing: <SellIcon />,
    pobox_rates: <SellIcon />,
    exchange_rates: <WalletIcon />,
    invoicing: <ReceiptIcon />,
    reports: <AssessmentIcon />,
    verifications: <VerifiedUserIcon />,
    consolidations: <InventoryIcon />,
    fcl_management: <BoatIcon />,
    customs: <AssignmentIcon />,
    coverage: <TimelineIcon />,
    instructions: <AssignmentIcon />,
    inventory: <InventoryIcon />,
    inbound_emails: <EmailIcon />,
    inbound_emails_air: <EmailIcon />,
    maritime_api: <ApiIcon />,
    air_api: <ApiIcon />,
    routes: <RouteIcon />,
    air_routes: <FlightIcon />,
    air_management: <FlightIcon />,
    cajo_management: <FlightIcon />,
    last_mile: <LocalShippingIcon />,
    paquete_express: <ApiIcon />,
    dhl_rates: <SellIcon />,
    anticipos: <WalletIcon />,
    suppliers: <BranchIcon />,
    carrier_options: <LocalShippingIcon />,
};

const SERVICE_MODULES: Record<string, { key: string; status: string }[]> = {
    china_air: [
        { key: 'costing', status: 'active' },
        { key: 'pricing', status: 'active' },
        { key: 'invoicing', status: 'active' },
        { key: 'instructions', status: 'active' },
        { key: 'carrier_options', status: 'active' },
        { key: 'inbound_emails_air', status: 'active' },
        { key: 'air_routes', status: 'active' },
        { key: 'air_api', status: 'active' },
        { key: 'air_management', status: 'active' },
        { key: 'cajo_management', status: 'active' },
        { key: 'reports', status: 'pending' },
    ],
    china_sea: [
        { key: 'costing', status: 'active' },
        { key: 'inventory', status: 'active' },
        { key: 'pricing', status: 'active' },
        { key: 'invoicing', status: 'active' },
        { key: 'instructions', status: 'active' },
        { key: 'carrier_options', status: 'active' },
        { key: 'routes', status: 'active' },
        { key: 'consolidations', status: 'active' },
        { key: 'fcl_management', status: 'active' },
        { key: 'inbound_emails', status: 'active' },
        { key: 'maritime_api', status: 'active' },
        { key: 'anticipos', status: 'active' },
        { key: 'reports', status: 'pending' },
    ],
    usa_pobox: [
        { key: 'pobox_rates', status: 'active' },
        { key: 'suppliers', status: 'active' },
        { key: 'invoicing', status: 'active' },
        { key: 'instructions', status: 'active' },
        { key: 'carrier_options', status: 'active' },
        { key: 'reports', status: 'pending' },
    ],
    mx_cedis: [
        { key: 'costing', status: 'active' },
        { key: 'dhl_rates', status: 'active' },
        { key: 'invoicing', status: 'active' },
        { key: 'instructions', status: 'active' },
        { key: 'carrier_options', status: 'active' },
    ],
    mx_national: [
        { key: 'inventory', status: 'active' },
        { key: 'pricing', status: 'active' },
        { key: 'last_mile', status: 'active' },
        { key: 'paquete_express', status: 'active' },
        { key: 'invoicing', status: 'active' },
        { key: 'instructions', status: 'active' },
        { key: 'carrier_options', status: 'active' },
        { key: 'coverage', status: 'pending' },
        { key: 'reports', status: 'pending' },
    ],
};

const SERVICE_TAGS: Record<string, string[]> = {
    china_air: ['TDI', 'Air', 'China'],
    china_sea: ['Maritime', 'FCL/LCL', 'China'],
    usa_pobox: ['PO Box', 'Miami', 'USA'],
    mx_cedis: ['DHL', 'AA', 'MTY'],
    mx_national: ['National', 'Last Mile', 'MX'],
};

interface Props {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    users?: any[];
    loading?: boolean;
    onRefresh?: () => void;
    // Permisos pasados desde App.tsx
    panelPermissions?: Record<string, boolean>;
    permissionsReady?: boolean;
}

// Mapeo de panel_key a código de servicio
const PANEL_TO_SERVICE: Record<string, string> = {
    'admin_china_air': 'china_air',
    'admin_china_sea': 'china_sea',
    'admin_usa_pobox': 'usa_pobox',
    'admin_mx_cedis': 'mx_cedis',
    'admin_mx_national': 'mx_national',
};

export default function AdminHubPage({ users = [], loading = false, onRefresh, panelPermissions = {}, permissionsReady = false }: Props) {
    const { t } = useTranslation();

    const getModuleLabel = (moduleKey: string, serviceKey?: string | null): string => {
        if (moduleKey === 'costing' && serviceKey === 'china_sea') return 'Costeo Marítimo';
        return t(`panels.modules.${moduleKey}`);
    };
    
    const [selectedService, setSelectedService] = useState<string | null>(null);
    const [selectedModule, setSelectedModule] = useState<string | null>(null);
    const [showGex, setShowGex] = useState(false);
    const [showVerifications, setShowVerifications] = useState(false);
    const [showSupplierPayments, setShowSupplierPayments] = useState(false);
    const [showLegacyClients, setShowLegacyClients] = useState(false);
    const [showFinancial, setShowFinancial] = useState(false);
    // const [showPaymentInvoices, setShowPaymentInvoices] = useState(false); // ELIMINADO
    const [showBranches, setShowBranches] = useState(false);
    const [showHR, setShowHR] = useState(false);
    const [showFleet, setShowFleet] = useState(false);
    const [showExchangeRates, setShowExchangeRates] = useState(false);
    const [showCarousel, setShowCarousel] = useState(false);
    const [showCajaChica, setShowCajaChica] = useState(false);
    const [showFinanceDashboard, setShowFinanceDashboard] = useState(false);
    
    // Escuchar evento global para abrir directamente verificaciones desde el dashboard
    useEffect(() => {
        const handler = () => {
            setShowVerifications(true);
            setSelectedService(null);
            setSelectedModule(null);
        };
        window.addEventListener('open-admin-verifications', handler);
        return () => window.removeEventListener('open-admin-verifications', handler);
    }, []);
    
    // Estado para permisos de módulos del servicio seleccionado
    const [modulePermissions, setModulePermissions] = useState<Record<string, boolean>>({});
    const [modulePermissionsLoading, setModulePermissionsLoading] = useState(false);
    // Lista estática de servicios - no depende de endpoint que requiere nivel DIRECTOR
    const SERVICES_LIST = [
        { code: 'china_air', name: 'China Air', services: ['AIR_CHN_MX'] },
        { code: 'china_sea', name: 'China Sea', services: ['SEA_CHN_MX'] },
        { code: 'usa_pobox', name: 'USA PO Box', services: ['POBOX_USA'] },
        { code: 'mx_cedis', name: 'MX CEDIS', services: ['AA_DHL'] },
        { code: 'mx_national', name: 'MX National', services: ['NATIONAL'] },
    ];

    const savedUser = localStorage.getItem('user');
    const currentUser = savedUser ? JSON.parse(savedUser) : null;
    const isSuperAdmin = currentUser?.role === 'super_admin';

    // Evitar warnings de variables no usadas
    console.debug('AdminHubPage props:', { users: users.length, loading, onRefresh: !!onRefresh });

    // Función para verificar si el usuario tiene permiso para un panel
    // Usa los permisos pasados desde App.tsx
    const hasPermission = (panelKey: string): boolean => {
        if (isSuperAdmin) return true;
        const result = panelPermissions[panelKey] === true;
        return result;
    };

    // Función para verificar si tiene permiso para un servicio (por código)
    const hasServicePermission = (serviceCode: string): boolean => {
        if (isSuperAdmin) return true;
        // Buscar el panel_key correspondiente al servicio
        const panelKey = Object.entries(PANEL_TO_SERVICE).find(([, code]) => code === serviceCode)?.[0];
        return panelKey ? hasPermission(panelKey) : false;
    };

    // Función para verificar si tiene permiso para un módulo específico
    const hasModulePermission = useCallback((moduleKey: string): boolean => {
        if (isSuperAdmin) return true;
        return modulePermissions[moduleKey] === true;
    }, [isSuperAdmin, modulePermissions]);

    // Cargar permisos de módulos cuando se selecciona un servicio
    useEffect(() => {
        const fetchModulePermissions = async () => {
            if (!selectedService || isSuperAdmin) {
                // Super admin tiene acceso a todo
                if (isSuperAdmin) {
                    setModulePermissions({});
                }
                return;
            }

            const panelKey = Object.entries(PANEL_TO_SERVICE)
                .find(([, code]) => code === selectedService)?.[0];
            
            if (!panelKey) return;

            setModulePermissionsLoading(true);
            try {
                const token = localStorage.getItem('token');
                const response = await fetch(`${API_URL}/api/modules/${panelKey}/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    
                    // Convertir array a objeto para acceso rápido
                    const permsObj: Record<string, boolean> = {};
                    data.modules?.forEach((m: { module_key: string; can_view: boolean }) => {
                        permsObj[m.module_key] = m.can_view === true;
                    });
                    setModulePermissions(permsObj);
                }
            } catch (error) {
                console.error('Error loading module permissions:', error);
            } finally {
                setModulePermissionsLoading(false);
            }
        };

        fetchModulePermissions();
    }, [selectedService, isSuperAdmin]);

    // ============================================
    // RENDER: Página de Garantía Extendida GEX
    // ============================================
    if (showGex) {
        return (
            <Box>
                <Box sx={{ mb: 2 }}>
                    <Chip
                        label={t('panels.backToAdmin')}
                        onClick={() => setShowGex(false)}
                        sx={{ cursor: 'pointer' }}
                    />
                </Box>
                <WarrantiesPage />
            </Box>
        );
    }

    // ============================================
    // RENDER: Página de Verificaciones KYC
    // ============================================
    if (showVerifications) {
        return (
            <Box>
                <Box sx={{ mb: 2 }}>
                    <Chip
                        label={t('panels.backToAdmin')}
                        onClick={() => setShowVerifications(false)}
                        sx={{ cursor: 'pointer' }}
                    />
                </Box>
                <VerificationsPage />
            </Box>
        );
    }

    // ============================================
    // RENDER: Gestión de Sucursales (CEDIS)
    // ============================================
    if (showBranches) {
        return (
            <Box>
                <Box sx={{ mb: 2 }}>
                    <Chip
                        label={t('panels.backToAdmin')}
                        onClick={() => setShowBranches(false)}
                        sx={{ cursor: 'pointer' }}
                    />
                </Box>
                <BranchManagementPage />
            </Box>
        );
    }

    // ============================================
    // RENDER: Recursos Humanos
    // ============================================
    if (showHR) {
        return (
            <Box>
                <Box sx={{ mb: 2 }}>
                    <Chip
                        label={t('panels.backToAdmin')}
                        onClick={() => setShowHR(false)}
                        sx={{ cursor: 'pointer' }}
                    />
                </Box>
                <HRManagementPage />
            </Box>
        );
    }

    // ============================================
    // RENDER: Gestión de Flotilla
    // ============================================
    if (showFleet) {
        return (
            <Box>
                <Box sx={{ mb: 2 }}>
                    <Chip
                        label={t('panels.backToAdmin')}
                        onClick={() => setShowFleet(false)}
                        sx={{ cursor: 'pointer' }}
                    />
                </Box>
                <FleetManagementPage />
            </Box>
        );
    }

    // ============================================
    // RENDER: Página de Pago a Proveedores
    // ============================================
    if (showSupplierPayments) {
        return (
            <Box>
                <Box sx={{ mb: 2 }}>
                    <Chip
                        label={t('panels.backToAdmin')}
                        onClick={() => setShowSupplierPayments(false)}
                        sx={{ cursor: 'pointer' }}
                    />
                </Box>
                <SupplierPaymentsPage />
            </Box>
        );
    }

    // ============================================
    // RENDER: Clientes Legacy (Migración)
    // ============================================
    if (showLegacyClients) {
        return (
            <Box>
                <Box sx={{ mb: 2 }}>
                    <Chip
                        label={t('panels.backToAdmin')}
                        onClick={() => setShowLegacyClients(false)}
                        sx={{ cursor: 'pointer' }}
                    />
                </Box>
                <LegacyClientsPage />
            </Box>
        );
    }

    // ============================================
    // RENDER: Gestión Financiera (Monedero + Crédito)
    // ============================================
    if (showFinancial) {
        return (
            <Box>
                <Box sx={{ mb: 2 }}>
                    <Chip
                        label={t('panels.backToAdmin')}
                        onClick={() => setShowFinancial(false)}
                        sx={{ cursor: 'pointer' }}
                    />
                </Box>
                <FinancialManagementPage />
            </Box>
        );
    }

    // ============================================
    // RENDER: Dashboard de Cobranza y Flujo de Efectivo
    // ============================================
    if (showFinanceDashboard) {
        return (
            <Box>
                <Box sx={{ mb: 2 }}>
                    <Chip
                        label={t('panels.backToAdmin')}
                        onClick={() => setShowFinanceDashboard(false)}
                        sx={{ cursor: 'pointer' }}
                    />
                </Box>
                <FinanceDashboardPage />
            </Box>
        );
    }

    // ELIMINADO: Panel de Cuentas por Cobrar

    // ============================================
    // RENDER: Configuración de Tipo de Cambio
    // ============================================
    if (showExchangeRates) {
        return (
            <Box>
                <Box sx={{ mb: 2 }}>
                    <Chip
                        label={t('panels.backToAdmin')}
                        onClick={() => setShowExchangeRates(false)}
                        sx={{ cursor: 'pointer' }}
                    />
                </Box>
                <ExchangeRateConfigPage />
            </Box>
        );
    }

    // ============================================
    // RENDER: Gestión del Carrusel de la App
    // ============================================
    if (showCarousel) {
        return (
            <Box>
                <Box sx={{ mb: 2 }}>
                    <Chip
                        label={t('panels.backToAdmin')}
                        onClick={() => setShowCarousel(false)}
                        sx={{ cursor: 'pointer' }}
                    />
                </Box>
                <CarouselSlidesPage />
            </Box>
        );
    }

    // ============================================
    // RENDER: Caja Chica (Petty Cash)
    // ============================================
    if (showCajaChica) {
        return (
            <Box>
                <Box sx={{ mb: 2 }}>
                    <Chip
                        label={t('panels.backToAdmin')}
                        onClick={() => setShowCajaChica(false)}
                        sx={{ cursor: 'pointer' }}
                    />
                </Box>
                <CajaChicaPage />
            </Box>
        );
    }

    // ============================================
    // RENDER: Módulo específico seleccionado
    // ============================================
    if (selectedService && selectedModule) {
        const serviceColors = SERVICE_COLORS[selectedService as keyof typeof SERVICE_COLORS];

        // Módulos activos implementados
        if (selectedModule === 'costing' && selectedService === 'china_air') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <CostingPanelChinaAir />
                </Box>
            );
        }

        // Panel Costeo Marítimo (china_sea) - solo costing
        if (selectedModule === 'costing' && selectedService === 'china_sea') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <CostingPanelMaritimo />
                </Box>
            );
        }

        // Panel Consolidaciones Marítimo (china_sea) - consolidations
        if (selectedModule === 'consolidations' && selectedService === 'china_sea') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <MaritimeConsolidationsPage />
                </Box>
            );
        }

        // Panel Correos Entrantes Marítimo (inbound_emails) - solo china_sea
        if (selectedModule === 'inbound_emails' && selectedService === 'china_sea') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <InboundEmailsPage />
                </Box>
            );
        }

        // Panel Correos Aéreos (inbound_emails_air) - solo china_air
        if (selectedModule === 'inbound_emails_air' && selectedService === 'china_air') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <InboundEmailsAirPage />
                </Box>
            );
        }

        // Panel API China Marítimo (maritime_api) - solo china_sea
        if (selectedModule === 'maritime_api' && selectedService === 'china_sea') {
            return (
                <MaritimeApiPage onBack={() => setSelectedModule(null)} />
            );
        }

        // Panel Gestión FCL (fcl_management) - solo china_sea
        if (selectedModule === 'fcl_management' && selectedService === 'china_sea') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <FCLManagementPage />
                </Box>
            );
        }

        // Panel Control de Anticipos (anticipos) - solo china_sea
        if (selectedModule === 'anticipos' && selectedService === 'china_sea') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <AdvanceControlPanel />
                </Box>
            );
        }

        // Panel Rutas Marítimas (routes) - solo china_sea
        if (selectedModule === 'routes' && selectedService === 'china_sea') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <MaritimeRoutesPage />
                </Box>
            );
        }

        // Panel Tarifas Aéreas (pricing) - solo china_air
        if (selectedModule === 'pricing' && selectedService === 'china_air') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <AirPricingPage />
                </Box>
            );
        }

        // Panel Tarifas Marítimas (pricing) - solo china_sea
        if (selectedModule === 'pricing' && selectedService === 'china_sea') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    {/* Motor de Tarifas Marítimo con categorías y VIP */}
                    <MaritimePricingEnginePage />
                </Box>
            );
        }

        // Panel Tarifas Flete Nacional (pricing) - solo mx_national
        if (selectedModule === 'pricing' && selectedService === 'mx_national') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    {/* Panel de Tarifas de Flete Nacional Terrestre */}
                    <NationalFreightRatesPage />
                </Box>
            );
        }

        // Panel Última Milla (last_mile) - solo mx_national
        if (selectedModule === 'last_mile' && selectedService === 'mx_national') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    {/* Panel de Última Milla - Skydropx */}
                    <LastMilePage />
                </Box>
            );
        }

        // Panel API Paquete Express - solo mx_national
        if (selectedModule === 'paquete_express' && selectedService === 'mx_national') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <PaqueteExpressPage />
                </Box>
            );
        }

        // Panel de Tarifas DHL (dhl_rates) - solo mx_cedis
        if (selectedModule === 'dhl_rates' && selectedService === 'mx_cedis') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <DhlRatesPage />
                </Box>
            );
        }

        // Panel de Costeo DHL (costing) - solo mx_cedis
        if (selectedModule === 'costing' && selectedService === 'mx_cedis') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <DhlCostingPage />
                </Box>
            );
        }

        // Panel de Costeo PO Box USA (costing) - solo usa_pobox
        if (selectedModule === 'costing' && selectedService === 'usa_pobox') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <POBoxCostingPage />
                </Box>
            );
        }

        // Panel de Tarifas PO Box USA (pobox_rates) - solo usa_pobox
        if (selectedModule === 'pobox_rates' && selectedService === 'usa_pobox') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <POBoxRatesPage />
                </Box>
            );
        }

        // Panel de Proveedores PO Box USA (suppliers) - solo usa_pobox
        if (selectedModule === 'suppliers' && selectedService === 'usa_pobox') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <SuppliersPage />
                </Box>
            );
        }

        // Panel API China Aéreo (air_api) - solo china_air
        if (selectedModule === 'air_api' && selectedService === 'china_air') {
            return (
                <AirApiPage onBack={() => setSelectedModule(null)} />
            );
        }

        // Panel Gestión Aérea - Guías EntregaX (air_management) - solo china_air
        if (selectedModule === 'air_management' && selectedService === 'china_air') {
            return (
                <AirManagementPage onBack={() => setSelectedModule(null)} />
            );
        }

        // Panel Gestión CAJO (cajo_management) - solo china_air
        if (selectedModule === 'cajo_management' && selectedService === 'china_air') {
            return (
                <CajoManagementPage onBack={() => setSelectedModule(null)} />
            );
        }

        // Panel Rutas Aéreas (air_routes) - solo china_air
        if (selectedModule === 'air_routes' && selectedService === 'china_air') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <AirRoutesPage />
                </Box>
            );
        }

        // Panel de Facturación - disponible para todos los servicios
        if (selectedModule === 'invoicing') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <ServiceInvoicingPanel 
                        serviceType={selectedService}
                        serviceName={t(`panels.services.${selectedService}.title`)}
                        serviceColor={serviceColors?.color || '#F05A28'}
                    />
                </Box>
            );
        }

        // Panel de Instrucciones y Direcciones - disponible para todos los servicios (excepto GEX)
        if (selectedModule === 'instructions') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <ServiceInstructionsPanel 
                        serviceType={selectedService}
                        serviceName={t(`panels.services.${selectedService}.title`)}
                        serviceColor={serviceColors?.color || '#F05A28'}
                    />
                </Box>
            );
        }

        // Panel de Opciones de Paquetería - disponible para todos los servicios
        if (selectedModule === 'carrier_options') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <CarrierServiceOptionsPage />
                </Box>
            );
        }

        // Panel de Inventario - disponible para todos los servicios (excepto GEX)
        if (selectedModule === 'inventory') {
            return (
                <Box>
                    {/* Breadcrumb */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Chip
                            label={t('panels.backToAdmin')}
                            onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                            sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                            label={`← ${t(`panels.services.${selectedService}.title`)}`}
                            onClick={() => setSelectedModule(null)}
                            sx={{ cursor: 'pointer' }}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                    <InventoryPanel 
                        serviceType={selectedService}
                        serviceName={t(`panels.services.${selectedService}.title`)}
                        serviceColor={serviceColors?.color || '#F05A28'}
                    />
                </Box>
            );
        }

        return (
            <Box>
                {/* Breadcrumb */}
                <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                    <Chip
                        label={t('panels.backToAdmin')}
                        onClick={() => { setSelectedService(null); setSelectedModule(null); }}
                        sx={{ cursor: 'pointer' }}
                    />
                    <Chip
                        label={`← ${t(`panels.services.${selectedService}.title`)}`}
                        onClick={() => setSelectedModule(null)}
                        sx={{ cursor: 'pointer' }}
                        color="primary"
                        variant="outlined"
                    />
                </Box>

                {/* Contenido del módulo (placeholder) */}
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <ConstructionIcon sx={{ fontSize: 80, color: 'warning.main', mb: 2 }} />
                    <Typography variant="h5" fontWeight="bold" gutterBottom>
                        {getModuleLabel(selectedModule, selectedService)} - {t(`panels.services.${selectedService}.title`)}
                    </Typography>
                    <Typography color="text.secondary" sx={{ mb: 3 }}>
                        {t('panels.developmentSoon')}
                    </Typography>
                    <Box sx={{ 
                        maxWidth: 400, 
                        mx: 'auto',
                        bgcolor: 'grey.100',
                        borderRadius: 2,
                        p: 2,
                    }}>
                        {selectedModule === 'clients' && (
                            <List dense>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.clients.viewClients')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.clients.assignToConsolidations')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.clients.shipmentHistory')} /></ListItem>
                            </List>
                        )}
                        {selectedModule === 'pricing' && (
                            <List dense>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.pricing.configureRates')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.pricing.defineZones')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.pricing.promotions')} /></ListItem>
                            </List>
                        )}
                        {selectedModule === 'invoicing' && (
                            <List dense>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.invoicing.generateCfdi')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.invoicing.creditNotes')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.invoicing.fiscalReports')} /></ListItem>
                            </List>
                        )}
                        {selectedModule === 'suppliers' && (
                            <List dense>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.suppliers.registerPayments')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.suppliers.reconciliation')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.suppliers.paymentHistory')} /></ListItem>
                            </List>
                        )}
                        {selectedModule === 'commissions' && (
                            <List dense>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.commissions.byAdvisor')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.commissions.bonuses')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.commissions.paymentReports')} /></ListItem>
                            </List>
                        )}
                        {selectedModule === 'reports' && (
                            <List dense>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.reports.dashboard')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.reports.export')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.reports.trends')} /></ListItem>
                            </List>
                        )}
                        {selectedModule === 'verifications' && (
                            <List dense>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.verifications.reviewKyc')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.verifications.approveReject')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.verifications.verificationHistory')} /></ListItem>
                            </List>
                        )}
                        {selectedModule === 'consolidations' && (
                            <List dense>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.consolidations.createMaritime')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.consolidations.assignContainers')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.consolidations.shipmentTracking')} /></ListItem>
                            </List>
                        )}
                        {selectedModule === 'customs' && (
                            <List dense>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.customs.pedimentos')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.customs.clearance')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.customs.aaDocumentation')} /></ListItem>
                            </List>
                        )}
                        {selectedModule === 'coverage' && (
                            <List dense>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.coverage.coverageZones')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.coverage.deliveryTimes')} /></ListItem>
                                <ListItem><ListItemIcon><CheckCircleIcon color="disabled" /></ListItemIcon><ListItemText primary={t('panels.moduleFeatures.coverage.zipRestrictions')} /></ListItem>
                            </List>
                        )}
                    </Box>
                    <Alert severity="info" sx={{ mt: 3, maxWidth: 500, mx: 'auto' }}>
                        {t('panels.developmentEstimate')}
                    </Alert>
                </Paper>
            </Box>
        );
    }

    // ============================================
    // RENDER: Módulos de un servicio seleccionado
    // ============================================
    if (selectedService) {
        const serviceColors = SERVICE_COLORS[selectedService as keyof typeof SERVICE_COLORS];
        const serviceIcon = SERVICE_ICONS[selectedService as keyof typeof SERVICE_ICONS];
        const modules = SERVICE_MODULES[selectedService as keyof typeof SERVICE_MODULES];
        if (!serviceColors || !modules) return null;

        return (
            <Box sx={{ p: 3, bgcolor: '#FAFAFA', minHeight: '100vh' }}>
                {/* Breadcrumb */}
                <Box sx={{ mb: 2 }}>
                    <Chip
                        label={t('panels.backToAdmin')}
                        onClick={() => setSelectedService(null)}
                        sx={{ cursor: 'pointer', bgcolor: '#FFFFFF', border: '1px solid #ECECEC' }}
                    />
                </Box>

                {/* Header del servicio - estilo SaaS limpio */}
                <Paper
                    sx={{
                        bgcolor: '#FFFFFF',
                        p: 3,
                        mb: 4,
                        borderRadius: 2,
                        border: '1px solid #ECECEC',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                        position: 'relative',
                        overflow: 'hidden',
                    }}
                >
                    {/* Acento naranja superior */}
                    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, bgcolor: '#F05A28' }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
                        <Box
                            sx={{
                                width: 56,
                                height: 56,
                                borderRadius: 2,
                                bgcolor: '#F05A2815',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#1A1A1A',
                                '& svg': { fontSize: 30 },
                            }}
                        >
                            {serviceIcon}
                        </Box>
                        <Box sx={{ flex: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="h5" sx={{ fontWeight: 700, color: '#1A1A1A' }}>
                                    {t(`panels.services.${selectedService}.title`)}
                                </Typography>
                                <Typography sx={{ fontSize: 24 }}>{serviceColors.flag}</Typography>
                            </Box>
                            <Typography variant="body2" sx={{ color: '#6B7280', mt: 0.25 }}>
                                {t(`panels.services.${selectedService}.subtitle`)}
                            </Typography>
                        </Box>
                    </Box>
                </Paper>

                {/* Grid de módulos */}
                <Typography sx={{ fontWeight: 700, fontSize: 17, color: '#1A1A1A', mb: 0.5 }}>
                    📋 {t('panels.adminModules')}
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B7280', mb: 3 }}>
                    {t('panels.selectModule')}
                </Typography>

                {modulePermissionsLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                <Grid container spacing={2}>
                    {modules
                        .filter((module) => {
                            // Super admin ve todo
                            if (isSuperAdmin) {
                                // Filtrar anticipos solo para roles específicos
                                if (module.key === 'anticipos') {
                                    return ['super_admin', 'admin', 'director'].includes(currentUser?.role);
                                }
                                return true;
                            }
                            
                            // Para otros usuarios, verificar permisos de módulo
                            return hasModulePermission(module.key);
                        })
                        .map((module) => {
                            const isPending = module.status === 'pending';
                            return (
                            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={module.key}>
                                <Card
                                    sx={{
                                        height: '100%',
                                        bgcolor: '#FFFFFF',
                                        borderRadius: 2,
                                        border: '1px solid #ECECEC',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                        overflow: 'hidden',
                                        transition: 'all 0.2s ease',
                                        opacity: isPending ? 0.85 : 1,
                                        '&:hover': {
                                            transform: 'translateY(-2px)',
                                            borderColor: '#F05A28',
                                            boxShadow: '0 8px 24px rgba(240,90,40,0.12)',
                                        },
                                    }}
                                >
                                    <CardActionArea
                                        onClick={() => setSelectedModule(module.key)}
                                        sx={{ height: '100%' }}
                                    >
                                        <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Box
                                                sx={{
                                                    width: 44,
                                                    height: 44,
                                                    borderRadius: 1.5,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    bgcolor: '#F05A2815',
                                                    color: '#1A1A1A',
                                                    flexShrink: 0,
                                                    '& svg': { fontSize: 22 },
                                                }}
                                            >
                                                {MODULE_ICONS[module.key]}
                                            </Box>
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <Typography sx={{ fontWeight: 700, fontSize: 15, color: '#1A1A1A', mb: 0.5 }}>
                                                    {getModuleLabel(module.key, selectedService)}
                                                </Typography>
                                                <Chip
                                                    label={isPending ? `🚧 ${t('panels.inDevelopment')}` : `✅ ${t('panels.active')}`}
                                                    size="small"
                                                    sx={{
                                                        fontSize: '0.65rem',
                                                        height: 20,
                                                        fontWeight: 600,
                                                        bgcolor: isPending ? '#FFF3E0' : '#E8F5E9',
                                                        color: isPending ? '#E65100' : '#2E7D32',
                                                        border: 'none',
                                                    }}
                                                />
                                            </Box>
                                        </Box>
                                    </CardActionArea>
                                </Card>
                            </Grid>
                        );
                    })}
                </Grid>
                )}

                {/* Info */}
                <Alert
                    severity="info"
                    sx={{
                        mt: 4,
                        bgcolor: '#FFFFFF',
                        border: '1px solid #ECECEC',
                        borderRadius: 2,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    }}
                >
                    {t('panels.tip', { service: t(`panels.services.${selectedService}.title`) })}
                </Alert>
            </Box>
        );
    }

    // ============================================
    // RENDER: Hub principal - Grid de servicios
    // ============================================
    // Mostrar loading mientras App.tsx carga los permisos
    if (!permissionsReady && !isSuperAdmin) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    // Filtrar servicios a los que el usuario tiene acceso
    const availableServices = SERVICES_LIST.filter(svc => {
        return hasServicePermission(svc.code);
    });
    
    console.log('🎯 availableServices:', availableServices.map(s => s.code));

    return (
        <Box sx={{ p: 3, bgcolor: '#FAFAFA', minHeight: '100vh' }}>
            {/* Header */}
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 700, color: '#1A1A1A', letterSpacing: -0.5 }}>
                    {t('panels.adminHub.title')}
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B7280', mt: 0.5 }}>
                    {t('panels.adminHub.subtitle')}
                </Typography>
            </Box>

            {/* Mensaje si no tiene acceso a ningún servicio */}
            {availableServices.length === 0 && (
                <Alert severity="info" sx={{ mb: 3 }}>
                    No tienes acceso a ningún servicio administrativo. Contacta a tu supervisor si necesitas permisos.
                </Alert>
            )}

            {/* Grid de servicios */}
            <Grid container spacing={3}>
                {availableServices.map((location) => {
                    const serviceColors = SERVICE_COLORS[location.code as keyof typeof SERVICE_COLORS];
                    const serviceIcon = SERVICE_ICONS[location.code as keyof typeof SERVICE_ICONS];
                    const modules = SERVICE_MODULES[location.code as keyof typeof SERVICE_MODULES];
                    if (!serviceColors || !modules) return null;

                    return (
                        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={location.code}>
                            <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid #ECECEC', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.2s ease', overflow: 'hidden', '&:hover': { borderColor: '#F05A28', boxShadow: '0 8px 24px rgba(240,90,40,0.12)', transform: 'translateY(-2px)' } }}>
                                <CardActionArea
                                    onClick={() => setSelectedService(location.code)}
                                    sx={{ height: '100%' }}
                                >
                                    <Box sx={{ height: 4, bgcolor: serviceColors.color }} />
                                    <Box sx={{ px: 3, pt: 2.5, pb: 0.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                        <Box sx={{
                                            width: 48,
                                            height: 48,
                                            borderRadius: 1.5,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            bgcolor: serviceColors.color + '15',
                                            color: '#1A1A1A',
                                            '& svg': { fontSize: 26 }
                                        }}>
                                            {serviceIcon}
                                        </Box>
                                        <Typography sx={{ fontSize: 28, lineHeight: 1, opacity: 0.85 }}>{serviceColors.flag}</Typography>
                                    </Box>
                                    <CardContent>
                                        <Typography sx={{ fontWeight: 700, fontSize: 17, color: '#1A1A1A', mb: 0.5 }}>
                                            {t(`panels.services.${location.code}.title`)}
                                        </Typography>
                                        <Typography sx={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.5 }}>
                                            {t(`panels.services.${location.code}.subtitle`)}
                                        </Typography>
                                    </CardContent>
                                </CardActionArea>
                            </Card>
                        </Grid>
                    );
                })}

                {/* Tarjeta especial: Verificaciones KYC - ROJO */}
                {hasPermission('admin_verifications') && (
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid #ECECEC', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.2s ease', overflow: 'hidden', '&:hover': { borderColor: '#F05A28', boxShadow: '0 8px 24px rgba(240,90,40,0.12)', transform: 'translateY(-2px)' } }}>
                        <CardActionArea
                            onClick={() => setShowVerifications(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box sx={{ height: 4, bgcolor: '#F05A28' }} />
                            <Box sx={{ px: 3, pt: 2.5, pb: 0.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <Box sx={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 1.5,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: '#F05A2815',
                                    color: '#1A1A1A',
                                    '& svg': { fontSize: 26 }
                                }}><VerifiedUserIcon /></Box>
                                <Typography sx={{ fontSize: 28, lineHeight: 1, opacity: 0.85 }}>✓</Typography>
                            </Box>
                            <CardContent>
                                <Typography sx={{ fontWeight: 700, fontSize: 17, color: '#1A1A1A', mb: 0.5 }}>
                                    Verificaciones
                                </Typography>
                                <Typography sx={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.5 }}>
                                    Revisión y aprobación de Usuario y/o Descuentos y ajustes financieros
                                </Typography>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>
                )}

                {/* Tarjeta especial: Pago a Proveedores - NARANJA */}
                {hasPermission('admin_supplier_payments') && (
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid #ECECEC', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.2s ease', overflow: 'hidden', '&:hover': { borderColor: '#F05A28', boxShadow: '0 8px 24px rgba(240,90,40,0.12)', transform: 'translateY(-2px)' } }}>
                        <CardActionArea
                            onClick={() => setShowSupplierPayments(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box sx={{ height: 4, bgcolor: '#F05A28' }} />
                            <Box sx={{ px: 3, pt: 2.5, pb: 0.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <Box sx={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 1.5,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: '#F05A2815',
                                    color: '#1A1A1A',
                                    '& svg': { fontSize: 26 }
                                }}><PaymentsIcon /></Box>
                                <Typography sx={{ fontSize: 28, lineHeight: 1, opacity: 0.85 }}>💰</Typography>
                            </Box>
                            <CardContent>
                                <Typography sx={{ fontWeight: 700, fontSize: 17, color: '#1A1A1A', mb: 0.5 }}>
                                    Pago a Proveedores
                                </Typography>
                                <Typography sx={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.5 }}>
                                    Gestión de pagos a proveedores internacionales
                                </Typography>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>
                )}

                {/* Tarjeta especial: Gestión Financiera - Ahora antes de Sucursales */}
                {hasPermission('admin_financial') && (
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid #ECECEC', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.2s ease', overflow: 'hidden', '&:hover': { borderColor: '#F05A28', boxShadow: '0 8px 24px rgba(240,90,40,0.12)', transform: 'translateY(-2px)' } }}>
                        <CardActionArea
                            onClick={() => setShowFinancial(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box sx={{ height: 4, bgcolor: '#F05A28' }} />
                            <Box sx={{ px: 3, pt: 2.5, pb: 0.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <Box sx={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 1.5,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: '#F05A2815',
                                    color: '#1A1A1A',
                                    '& svg': { fontSize: 26 }
                                }}><WalletIcon /></Box>
                                <Typography sx={{ fontSize: 28, lineHeight: 1, opacity: 0.85 }}>💳</Typography>
                            </Box>
                            <CardContent>
                                <Typography sx={{ fontWeight: 700, fontSize: 17, color: '#1A1A1A', mb: 0.5 }}>
                                    Gestión Financiera
                                </Typography>
                                <Typography sx={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.5 }}>
                                    Monederos de clientes, líneas de crédito B2B y transacciones
                                </Typography>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>
                )}

                {/* Tarjeta especial: Gestión de Sucursales - VERDE */}
                {isSuperAdmin && (
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid #ECECEC', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.2s ease', overflow: 'hidden', '&:hover': { borderColor: '#F05A28', boxShadow: '0 8px 24px rgba(240,90,40,0.12)', transform: 'translateY(-2px)' } }}>
                        <CardActionArea
                            onClick={() => setShowBranches(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box sx={{ height: 4, bgcolor: '#F05A28' }} />
                            <Box sx={{ px: 3, pt: 2.5, pb: 0.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <Box sx={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 1.5,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: '#F05A2815',
                                    color: '#1A1A1A',
                                    '& svg': { fontSize: 26 }
                                }}><BranchIcon /></Box>
                                <Typography sx={{ fontSize: 28, lineHeight: 1, opacity: 0.85 }}>🏢</Typography>
                            </Box>
                            <CardContent>
                                <Typography sx={{ fontWeight: 700, fontSize: 17, color: '#1A1A1A', mb: 0.5 }}>
                                    Gestión de Sucursales
                                </Typography>
                                <Typography sx={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.5 }}>
                                    Crear CEDIS y asignar empleados a cada ubicación
                                </Typography>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>
                )}

                {/* Tarjeta especial: Migración de Clientes - CIAN */}
                {isSuperAdmin && (
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid #ECECEC', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.2s ease', overflow: 'hidden', '&:hover': { borderColor: '#F05A28', boxShadow: '0 8px 24px rgba(240,90,40,0.12)', transform: 'translateY(-2px)' } }}>
                        <CardActionArea
                            onClick={() => setShowLegacyClients(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box sx={{ height: 4, bgcolor: '#F05A28' }} />
                            <Box sx={{ px: 3, pt: 2.5, pb: 0.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <Box sx={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 1.5,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: '#F05A2815',
                                    color: '#1A1A1A',
                                    '& svg': { fontSize: 26 }
                                }}><UploadIcon /></Box>
                                <Typography sx={{ fontSize: 28, lineHeight: 1, opacity: 0.85 }}>📦</Typography>
                            </Box>
                            <CardContent>
                                <Typography sx={{ fontWeight: 700, fontSize: 17, color: '#1A1A1A', mb: 0.5 }}>
                                    Migración de Clientes
                                </Typography>
                                <Typography sx={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.5 }}>
                                    Importar y gestionar clientes de la base de datos anterior
                                </Typography>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>
                )}

                {/* Tarjeta especial: Dashboard de Cobranza - NARANJA/NEGRO */}
                {hasPermission('admin_finance_dashboard') && (
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid #ECECEC', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.2s ease', overflow: 'hidden', '&:hover': { borderColor: '#F05A28', boxShadow: '0 8px 24px rgba(240,90,40,0.12)', transform: 'translateY(-2px)' } }}>
                        <CardActionArea
                            onClick={() => setShowFinanceDashboard(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box sx={{ height: 4, bgcolor: '#F05A28' }} />
                            <Box sx={{ px: 3, pt: 2.5, pb: 0.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <Box sx={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 1.5,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: '#F05A2815',
                                    color: '#1A1A1A',
                                    '& svg': { fontSize: 26 }
                                }}><TrendingUpIcon /></Box>
                                <Typography sx={{ fontSize: 28, lineHeight: 1, opacity: 0.85 }}>💰</Typography>
                            </Box>
                            <CardContent>
                                <Typography sx={{ fontWeight: 700, fontSize: 17, color: '#1A1A1A', mb: 0.5 }}>
                                    Dashboard de Cobranza
                                </Typography>
                                <Typography sx={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.5 }}>
                                    Flujo de efectivo: Caja CC + SPEI (Openpay)
                                </Typography>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>
                )}

                {/* ELIMINADO: Tarjeta de Cuentas por Cobrar */}

                {/* Tarjeta especial: Tipo de Cambio - VERDE ESMERALDA */}
                {hasPermission('admin_exchange_rates') && (
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid #ECECEC', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.2s ease', overflow: 'hidden', '&:hover': { borderColor: '#F05A28', boxShadow: '0 8px 24px rgba(240,90,40,0.12)', transform: 'translateY(-2px)' } }}>
                        <CardActionArea
                            onClick={() => setShowExchangeRates(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box sx={{ height: 4, bgcolor: '#F05A28' }} />
                            <Box sx={{ px: 3, pt: 2.5, pb: 0.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <Box sx={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 1.5,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: '#F05A2815',
                                    color: '#1A1A1A',
                                    '& svg': { fontSize: 26 }
                                }}><WalletIcon /></Box>
                                <Typography sx={{ fontSize: 28, lineHeight: 1, opacity: 0.85 }}>💱</Typography>
                            </Box>
                            <CardContent>
                                <Typography sx={{ fontWeight: 700, fontSize: 17, color: '#1A1A1A', mb: 0.5 }}>
                                    Tipo de Cambio
                                </Typography>
                                <Typography sx={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.5 }}>
                                    Configuración de tipo de cambio y sobreprecio por servicio
                                </Typography>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>
                )}

                {/* Tarjeta especial: Carrusel de la App - NARANJA */}
                {hasPermission('admin_carousel') && (
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid #ECECEC', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.2s ease', overflow: 'hidden', '&:hover': { borderColor: '#F05A28', boxShadow: '0 8px 24px rgba(240,90,40,0.12)', transform: 'translateY(-2px)' } }}>
                        <CardActionArea
                            onClick={() => setShowCarousel(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box sx={{ height: 4, bgcolor: '#F05A28' }} />
                            <Box sx={{ px: 3, pt: 2.5, pb: 0.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <Box sx={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 1.5,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: '#F05A2815',
                                    color: '#1A1A1A',
                                    '& svg': { fontSize: 26 }
                                }}><SmartphoneIcon /></Box>
                                <Typography sx={{ fontSize: 28, lineHeight: 1, opacity: 0.85 }}>📱</Typography>
                            </Box>
                            <CardContent>
                                <Typography sx={{ fontWeight: 700, fontSize: 17, color: '#1A1A1A', mb: 0.5 }}>
                                    Carrusel de la App
                                </Typography>
                                <Typography sx={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.5 }}>
                                    Gestión de slides promocionales en la app móvil
                                </Typography>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>
                )}

                {/* Tarjeta especial: Recursos Humanos - ROSA */}
                {hasPermission('admin_hr') && (
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid #ECECEC', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.2s ease', overflow: 'hidden', '&:hover': { borderColor: '#F05A28', boxShadow: '0 8px 24px rgba(240,90,40,0.12)', transform: 'translateY(-2px)' } }}>
                        <CardActionArea
                            onClick={() => setShowHR(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box sx={{ height: 4, bgcolor: '#F05A28' }} />
                            <Box sx={{ px: 3, pt: 2.5, pb: 0.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <Box sx={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 1.5,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: '#F05A2815',
                                    color: '#1A1A1A',
                                    '& svg': { fontSize: 26 }
                                }}><BadgeIcon /></Box>
                                <Typography sx={{ fontSize: 28, lineHeight: 1, opacity: 0.85 }}>👥</Typography>
                            </Box>
                            <CardContent>
                                <Typography sx={{ fontWeight: 700, fontSize: 17, color: '#1A1A1A', mb: 0.5 }}>
                                    Recursos Humanos
                                </Typography>
                                <Typography sx={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.5 }}>
                                    Gestión de empleados, checador y nómina
                                </Typography>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>
                )}

                {/* Tarjeta especial: Gestión de Flotilla - MARRÓN */}
                {hasPermission('admin_fleet') && (
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid #ECECEC', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.2s ease', overflow: 'hidden', '&:hover': { borderColor: '#F05A28', boxShadow: '0 8px 24px rgba(240,90,40,0.12)', transform: 'translateY(-2px)' } }}>
                        <CardActionArea
                            onClick={() => setShowFleet(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box sx={{ height: 4, bgcolor: '#F05A28' }} />
                            <Box sx={{ px: 3, pt: 2.5, pb: 0.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <Box sx={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 1.5,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: '#F05A2815',
                                    color: '#1A1A1A',
                                    '& svg': { fontSize: 26 }
                                }}><DirectionsCarIcon /></Box>
                                <Typography sx={{ fontSize: 28, lineHeight: 1, opacity: 0.85 }}>🚛</Typography>
                            </Box>
                            <CardContent>
                                <Typography sx={{ fontWeight: 700, fontSize: 17, color: '#1A1A1A', mb: 0.5 }}>
                                    Gestión de Flotilla
                                </Typography>
                                <Typography sx={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.5 }}>
                                    Vehículos, mantenimiento y combustible
                                </Typography>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>
                )}

                {/* Tarjeta especial: Caja Chica - NARANJA */}
                {isSuperAdmin && (
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid #ECECEC', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.2s ease', overflow: 'hidden', '&:hover': { borderColor: '#F05A28', boxShadow: '0 8px 24px rgba(240,90,40,0.12)', transform: 'translateY(-2px)' } }}>
                        <CardActionArea
                            onClick={() => setShowCajaChica(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box sx={{ height: 4, bgcolor: '#F05A28' }} />
                            <Box sx={{ px: 3, pt: 2.5, pb: 0.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <Box sx={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 1.5,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: '#F05A2815',
                                    color: '#1A1A1A',
                                    '& svg': { fontSize: 26 }
                                }}><LocalAtmIcon /></Box>
                                <Typography sx={{ fontSize: 28, lineHeight: 1, opacity: 0.85 }}>💵</Typography>
                            </Box>
                            <CardContent>
                                <Typography sx={{ fontWeight: 700, fontSize: 17, color: '#1A1A1A', mb: 0.5 }}>
                                    Caja CC
                                </Typography>
                                <Typography sx={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.5 }}>
                                    Control de efectivo, ingresos, egresos y cortes de caja
                                </Typography>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>
                )}

                {/* Tarjeta especial: Módulo GEX - VIOLETA */}
                {hasPermission('admin_gex') && (
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid #ECECEC', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.2s ease', overflow: 'hidden', '&:hover': { borderColor: '#F05A28', boxShadow: '0 8px 24px rgba(240,90,40,0.12)', transform: 'translateY(-2px)' } }}>
                        <CardActionArea
                            onClick={() => setShowGex(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box sx={{ height: 4, bgcolor: '#F05A28' }} />
                            <Box sx={{ px: 3, pt: 2.5, pb: 0.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <Box sx={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 1.5,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: '#F05A2815',
                                    color: '#1A1A1A',
                                    '& svg': { fontSize: 26 }
                                }}><SecurityIcon /></Box>
                                <Typography sx={{ fontSize: 28, lineHeight: 1, opacity: 0.85 }}>🛡️</Typography>
                            </Box>
                            <CardContent>
                                <Typography sx={{ fontWeight: 700, fontSize: 17, color: '#1A1A1A', mb: 0.5 }}>
                                    Módulo GEX
                                </Typography>
                                <Typography sx={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.5 }}>
                                    Garantía extendida y pólizas de seguro
                                </Typography>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>
                )}
            </Grid>

            {/* Tip */}
            <Box sx={{ mt: 4 }}>
                <Alert severity="info">
                    {t('panels.adminHub.tip')}
                </Alert>
            </Box>
        </Box>
    );
}
