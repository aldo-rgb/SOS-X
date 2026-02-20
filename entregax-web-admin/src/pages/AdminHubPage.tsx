// ============================================
// HUB DE PANELES ADMINISTRATIVOS POR SERVICIO
// Vista para gestión administrativa de cada ruta/servicio
// ============================================

import { useState, useEffect } from 'react';
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
    Divider,
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
import MaritimeApiPage from './MaritimeApiPage';
import AirApiPage from './AirApiPage';
import MaritimeRoutesPage from './MaritimeRoutesPage';
import LegacyClientsPage from './LegacyClientsPage';
// MaritimeRatesPage removido - se usa MaritimePricingEnginePage
import MaritimePricingEnginePage from './MaritimePricingEnginePage';
import FinancialManagementPage from './FinancialManagementPage';
import PaymentInvoicesPage from './PaymentInvoicesPage';
import NationalFreightRatesPage from './NationalFreightRatesPage';
import LastMilePage from './LastMilePage';
import DhlRatesPage from './DhlRatesPage';
import POBoxRatesPage from './POBoxRatesPage';
import POBoxCostingPage from './POBoxCostingPage';
import ExchangeRateConfigPage from './ExchangeRateConfigPage';
import BranchManagementPage from './BranchManagementPage';
import CarouselSlidesPage from './CarouselSlidesPage';
import AdvanceControlPanel from './AdvanceControlPanel';
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
import LocalAtmIcon from '@mui/icons-material/LocalAtm';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ============================================
// CONFIGURACIÓN DE PANELES POR SERVICIO
// Cada servicio tiene su panel administrativo dedicado
// ============================================

const SERVICE_ICONS = {
    china_air: <FlightIcon sx={{ fontSize: 48 }} />,
    china_sea: <BoatIcon sx={{ fontSize: 48 }} />,
    usa_pobox: <TruckIcon sx={{ fontSize: 48 }} />,
    mx_cedis: <WarehouseIcon sx={{ fontSize: 48 }} />,
    mx_national: <LocationIcon sx={{ fontSize: 48 }} />,
};

const SERVICE_COLORS = {
    china_air: { color: '#E53935', bgGradient: 'linear-gradient(135deg, #C62828 0%, #EF5350 100%)', flag: '🇨🇳' },
    china_sea: { color: '#0288D1', bgGradient: 'linear-gradient(135deg, #01579B 0%, #29B6F6 100%)', flag: '🇨🇳' },
    usa_pobox: { color: '#5E35B1', bgGradient: 'linear-gradient(135deg, #4527A0 0%, #7E57C2 100%)', flag: '🇺🇸' },
    mx_cedis: { color: '#43A047', bgGradient: 'linear-gradient(135deg, #2E7D32 0%, #66BB6A 100%)', flag: '🇲🇽' },
    mx_national: { color: '#8E24AA', bgGradient: 'linear-gradient(135deg, #6A1B9A 0%, #AB47BC 100%)', flag: '🇲🇽' },
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
    customs: <AssignmentIcon />,
    coverage: <TimelineIcon />,
    instructions: <AssignmentIcon />,
    inventory: <InventoryIcon />,
    inbound_emails: <EmailIcon />,
    maritime_api: <ApiIcon />,
    air_api: <ApiIcon />,
    routes: <RouteIcon />,
    last_mile: <LocalShippingIcon />,
    dhl_rates: <SellIcon />,
    anticipos: <WalletIcon />,
};

const SERVICE_MODULES: Record<string, { key: string; status: string }[]> = {
    china_air: [
        { key: 'costing', status: 'active' },
        { key: 'inventory', status: 'active' },
        { key: 'pricing', status: 'pending' },
        { key: 'invoicing', status: 'active' },
        { key: 'instructions', status: 'active' },
        { key: 'air_api', status: 'active' },
        { key: 'reports', status: 'pending' },
    ],
    china_sea: [
        { key: 'costing', status: 'active' },
        { key: 'inventory', status: 'active' },
        { key: 'pricing', status: 'active' },
        { key: 'invoicing', status: 'active' },
        { key: 'instructions', status: 'active' },
        { key: 'routes', status: 'active' },
        { key: 'consolidations', status: 'active' },
        { key: 'inbound_emails', status: 'active' },
        { key: 'maritime_api', status: 'active' },
        { key: 'anticipos', status: 'active' },
        { key: 'reports', status: 'pending' },
    ],
    usa_pobox: [
        { key: 'costing', status: 'active' },
        { key: 'inventory', status: 'active' },
        { key: 'pobox_rates', status: 'active' },
        { key: 'invoicing', status: 'active' },
        { key: 'instructions', status: 'active' },
        { key: 'verifications', status: 'pending' },
        { key: 'reports', status: 'pending' },
    ],
    mx_cedis: [
        { key: 'dhl_rates', status: 'active' },
        { key: 'inventory', status: 'active' },
        { key: 'pricing', status: 'pending' },
        { key: 'invoicing', status: 'active' },
        { key: 'instructions', status: 'active' },
        { key: 'customs', status: 'pending' },
        { key: 'reports', status: 'pending' },
    ],
    mx_national: [
        { key: 'inventory', status: 'active' },
        { key: 'pricing', status: 'active' },
        { key: 'last_mile', status: 'active' },
        { key: 'invoicing', status: 'active' },
        { key: 'instructions', status: 'active' },
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
}

interface WarehouseLocation {
    code: string;
    name: string;
    services: string[];
}

export default function AdminHubPage({ users = [], loading = false, onRefresh }: Props) {
    const { t } = useTranslation();
    const [selectedService, setSelectedService] = useState<string | null>(null);
    const [selectedModule, setSelectedModule] = useState<string | null>(null);
    const [showGex, setShowGex] = useState(false);
    const [showVerifications, setShowVerifications] = useState(false);
    const [showSupplierPayments, setShowSupplierPayments] = useState(false);
    const [showLegacyClients, setShowLegacyClients] = useState(false);
    const [showFinancial, setShowFinancial] = useState(false);
    const [showPaymentInvoices, setShowPaymentInvoices] = useState(false);
    const [showBranches, setShowBranches] = useState(false);
    const [showHR, setShowHR] = useState(false);
    const [showFleet, setShowFleet] = useState(false);
    const [showExchangeRates, setShowExchangeRates] = useState(false);
    const [showCarousel, setShowCarousel] = useState(false);
    const [showCajaChica, setShowCajaChica] = useState(false);
    const [locations, setLocations] = useState<WarehouseLocation[]>([]);
    const [loadingLocations, setLoadingLocations] = useState(true);

    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    const currentUser = savedUser ? JSON.parse(savedUser) : null;
    const isSuperAdmin = currentUser?.role === 'super_admin';

    // Evitar warnings de variables no usadas
    console.debug('AdminHubPage props:', { users: users.length, loading, onRefresh: !!onRefresh });

    // IMPORTANTE: useEffect DEBE estar ANTES de cualquier return condicional
    useEffect(() => {
        const loadLocations = async () => {
            try {
                const res = await fetch(`${API_URL}/api/admin/warehouse-locations`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    setLocations(data.locations || []);
                }
            } catch (err) {
                console.error('Error fetching locations:', err);
            } finally {
                setLoadingLocations(false);
            }
        };
        loadLocations();
    }, [token]);

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
    // RENDER: Cuentas por Cobrar (Multi-RFC)
    // ============================================
    if (showPaymentInvoices) {
        return (
            <Box>
                <Box sx={{ mb: 2 }}>
                    <Chip
                        label={t('panels.backToAdmin')}
                        onClick={() => setShowPaymentInvoices(false)}
                        sx={{ cursor: 'pointer' }}
                    />
                </Box>
                <PaymentInvoicesPage />
            </Box>
        );
    }

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

        // Panel API China Marítimo (maritime_api) - solo china_sea
        if (selectedModule === 'maritime_api' && selectedService === 'china_sea') {
            return (
                <MaritimeApiPage onBack={() => setSelectedModule(null)} />
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

        // Panel API China Aéreo (air_api) - solo china_air
        if (selectedModule === 'air_api' && selectedService === 'china_air') {
            return (
                <AirApiPage onBack={() => setSelectedModule(null)} />
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
                        {t(`panels.modules.${selectedModule}`)} - {t(`panels.services.${selectedService}.title`)}
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
            <Box>
                {/* Breadcrumb */}
                <Box sx={{ mb: 2 }}>
                    <Chip
                        label={t('panels.backToAdmin')}
                        onClick={() => setSelectedService(null)}
                        sx={{ cursor: 'pointer' }}
                    />
                </Box>

                {/* Header del servicio */}
                <Paper
                    sx={{
                        background: serviceColors.bgGradient,
                        p: 3,
                        mb: 3,
                        borderRadius: 2,
                        color: 'white',
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {serviceIcon}
                        <Box>
                            <Typography variant="h5" fontWeight="bold">
                                {serviceColors.flag} {t(`panels.services.${selectedService}.title`)}
                            </Typography>
                            <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                {t(`panels.services.${selectedService}.subtitle`)}
                            </Typography>
                        </Box>
                    </Box>
                </Paper>

                {/* Grid de módulos */}
                <Typography variant="h6" fontWeight="bold" gutterBottom>
                    📋 {t('panels.adminModules')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    {t('panels.selectModule')}
                </Typography>

                <Grid container spacing={2}>
                    {modules
                        .filter((module) => {
                            // Filtrar módulos por rol
                            const userRole = currentUser?.role;
                            if (module.key === 'anticipos') {
                                // anticipos solo visible para super_admin, admin, director
                                return ['super_admin', 'admin', 'director'].includes(userRole);
                            }
                            return true; // Otros módulos visibles para todos
                        })
                        .map((module) => (
                        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={module.key}>
                            <Card
                                sx={{
                                    transition: 'all 0.2s ease',
                                    opacity: module.status === 'pending' ? 0.7 : 1,
                                    '&:hover': {
                                        transform: 'translateY(-4px)',
                                        boxShadow: 4,
                                        opacity: 1,
                                    },
                                }}
                            >
                                <CardActionArea
                                    onClick={() => setSelectedModule(module.key)}
                                    sx={{ p: 2 }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Box
                                            sx={{
                                                width: 50,
                                                height: 50,
                                                borderRadius: 2,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                bgcolor: serviceColors.color + '20',
                                                color: serviceColors.color,
                                            }}
                                        >
                                            {MODULE_ICONS[module.key]}
                                        </Box>
                                        <Box sx={{ flex: 1 }}>
                                            <Typography variant="subtitle1" fontWeight="bold">
                                                {t(`panels.modules.${module.key}`)}
                                            </Typography>
                                            <Chip
                                                label={module.status === 'pending' ? `🚧 ${t('panels.inDevelopment')}` : `✅ ${t('panels.active')}`}
                                                size="small"
                                                color={module.status === 'pending' ? 'warning' : 'success'}
                                                variant="outlined"
                                                sx={{ fontSize: '0.65rem', height: 20 }}
                                            />
                                        </Box>
                                    </Box>
                                </CardActionArea>
                            </Card>
                        </Grid>
                    ))}
                </Grid>

                {/* Info */}
                <Alert severity="info" sx={{ mt: 4 }}>
                    {t('panels.tip', { service: t(`panels.services.${selectedService}.title`) })}
                </Alert>
            </Box>
        );
    }

    // ============================================
    // RENDER: Hub principal - Grid de servicios
    // ============================================
    if (loadingLocations) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" fontWeight="bold">
                    🛠️ {t('panels.adminHub.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    {t('panels.adminHub.subtitle')}
                </Typography>
            </Box>

            {/* Grid de servicios */}
            <Grid container spacing={3}>
                {locations.map((location) => {
                    const serviceColors = SERVICE_COLORS[location.code as keyof typeof SERVICE_COLORS];
                    const serviceIcon = SERVICE_ICONS[location.code as keyof typeof SERVICE_ICONS];
                    const modules = SERVICE_MODULES[location.code as keyof typeof SERVICE_MODULES];
                    if (!serviceColors || !modules) return null;

                    const tags = SERVICE_TAGS[location.code] || location.services;

                    return (
                        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={location.code}>
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
                                    onClick={() => setSelectedService(location.code)}
                                    sx={{ height: '100%' }}
                                >
                                    <Box
                                        sx={{
                                            background: serviceColors.bgGradient,
                                            p: 3,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                        }}
                                    >
                                        <Box sx={{ color: 'white' }}>
                                            {serviceIcon}
                                        </Box>
                                        <Typography variant="h2" sx={{ opacity: 0.3 }}>
                                            {serviceColors.flag}
                                        </Typography>
                                    </Box>
                                    <CardContent>
                                        <Typography variant="h6" fontWeight="bold" gutterBottom>
                                            {t(`panels.services.${location.code}.title`)}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                            {t(`panels.services.${location.code}.subtitle`)}
                                        </Typography>
                                        <Divider sx={{ my: 1 }} />
                                        <Typography variant="caption" color="text.secondary">
                                            {modules.length} {t('panels.modulesAvailable')}
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                                            {tags.slice(0, 3).map((tag) => (
                                                <Chip
                                                    key={tag}
                                                    label={tag}
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{ fontSize: '0.7rem' }}
                                                />
                                            ))}
                                        </Box>
                                    </CardContent>
                                </CardActionArea>
                            </Card>
                        </Grid>
                    );
                })}

                {/* Tarjeta especial: Verificaciones KYC - ROJO */}
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
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
                            onClick={() => setShowVerifications(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box
                                sx={{
                                    background: 'linear-gradient(135deg, #C62828 0%, #EF5350 100%)',
                                    p: 3,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <Box sx={{ color: 'white' }}>
                                    <VerifiedUserIcon sx={{ fontSize: 48 }} />
                                </Box>
                                <Typography variant="h2" sx={{ opacity: 0.3 }}>
                                    ✓
                                </Typography>
                            </Box>
                            <CardContent>
                                <Typography variant="h6" fontWeight="bold" gutterBottom>
                                    Verificaciones de Identidad
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Revisión y aprobación de documentos KYC de usuarios
                                </Typography>
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="caption" color="text.secondary">
                                    3 módulos disponibles
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                                    <Chip label="KYC" size="small" sx={{ bgcolor: '#C62828', color: 'white', fontSize: '0.7rem' }} />
                                    <Chip label="INE/Pasaporte" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                    <Chip label="Revisión" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                </Box>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>

                {/* Tarjeta especial: Pago a Proveedores - NARANJA */}
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
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
                            onClick={() => setShowSupplierPayments(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box
                                sx={{
                                    background: 'linear-gradient(135deg, #E65100 0%, #FF9800 100%)',
                                    p: 3,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <Box sx={{ color: 'white' }}>
                                    <PaymentsIcon sx={{ fontSize: 48 }} />
                                </Box>
                                <Typography variant="h2" sx={{ opacity: 0.3 }}>
                                    💰
                                </Typography>
                            </Box>
                            <CardContent>
                                <Typography variant="h6" fontWeight="bold" gutterBottom>
                                    Pago a Proveedores
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Gestión de pagos a proveedores internacionales
                                </Typography>
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="caption" color="text.secondary">
                                    En desarrollo
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                                    <Chip label="Pagos" size="small" sx={{ bgcolor: '#E65100', color: 'white', fontSize: '0.7rem' }} />
                                    <Chip label="Proveedores" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                    <Chip label="China" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                </Box>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>

                {/* Tarjeta especial: Gestión de Sucursales - VERDE */}
                {isSuperAdmin && (
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
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
                            onClick={() => setShowBranches(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box
                                sx={{
                                    background: 'linear-gradient(135deg, #2E7D32 0%, #66BB6A 100%)',
                                    p: 3,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <Box sx={{ color: 'white' }}>
                                    <BranchIcon sx={{ fontSize: 48 }} />
                                </Box>
                                <Typography variant="h2" sx={{ opacity: 0.3 }}>
                                    🏢
                                </Typography>
                            </Box>
                            <CardContent>
                                <Typography variant="h6" fontWeight="bold" gutterBottom>
                                    Gestión de Sucursales
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Crear CEDIS y asignar empleados a cada ubicación
                                </Typography>
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="caption" color="text.secondary">
                                    Solo Super Admin
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                                    <Chip label="CEDIS" size="small" sx={{ bgcolor: '#2E7D32', color: 'white', fontSize: '0.7rem' }} />
                                    <Chip label="Empleados" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                    <Chip label="Servicios" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                </Box>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>
                )}

                {/* Tarjeta especial: Migración de Clientes - CIAN */}
                {isSuperAdmin && (
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
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
                            onClick={() => setShowLegacyClients(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box
                                sx={{
                                    background: 'linear-gradient(135deg, #0097A7 0%, #4DD0E1 100%)',
                                    p: 3,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <Box sx={{ color: 'white' }}>
                                    <UploadIcon sx={{ fontSize: 48 }} />
                                </Box>
                                <Typography variant="h2" sx={{ opacity: 0.3 }}>
                                    📦
                                </Typography>
                            </Box>
                            <CardContent>
                                <Typography variant="h6" fontWeight="bold" gutterBottom>
                                    Migración de Clientes
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Importar y gestionar clientes de la base de datos anterior
                                </Typography>
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="caption" color="text.secondary">
                                    Solo Super Admin
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                                    <Chip label="Migración" size="small" sx={{ bgcolor: '#0097A7', color: 'white', fontSize: '0.7rem' }} />
                                    <Chip label="Legacy" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                    <Chip label="Importar" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                </Box>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>
                )}

                {/* Tarjeta especial: Gestión Financiera - AZUL */}
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
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
                            onClick={() => setShowFinancial(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box
                                sx={{
                                    background: 'linear-gradient(135deg, #1565C0 0%, #42A5F5 100%)',
                                    p: 3,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <Box sx={{ color: 'white' }}>
                                    <WalletIcon sx={{ fontSize: 48 }} />
                                </Box>
                                <Typography variant="h2" sx={{ opacity: 0.3 }}>
                                    💳
                                </Typography>
                            </Box>
                            <CardContent>
                                <Typography variant="h6" fontWeight="bold" gutterBottom>
                                    Gestión Financiera
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Monederos de clientes, líneas de crédito B2B y transacciones
                                </Typography>
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="caption" color="text.secondary">
                                    Admin / Super Admin
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                                    <Chip label="Monedero" size="small" sx={{ bgcolor: '#1565C0', color: 'white', fontSize: '0.7rem' }} />
                                    <Chip label="Crédito" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                    <Chip label="SPEI" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                </Box>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>

                {/* Tarjeta especial: Cuentas por Cobrar - ÍNDIGO */}
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
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
                            onClick={() => setShowPaymentInvoices(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box
                                sx={{
                                    background: 'linear-gradient(135deg, #303F9F 0%, #7986CB 100%)',
                                    p: 3,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <Box sx={{ color: 'white' }}>
                                    <ReceiptIcon sx={{ fontSize: 48 }} />
                                </Box>
                                <Typography variant="h2" sx={{ opacity: 0.3 }}>
                                    📋
                                </Typography>
                            </Box>
                            <CardContent>
                                <Typography variant="h6" fontWeight="bold" gutterBottom>
                                    Cuentas por Cobrar
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Facturas de cobro por servicio (Multi-RFC)
                                </Typography>
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="caption" color="text.secondary">
                                    Admin / Super Admin
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                                    <Chip label="Facturas" size="small" sx={{ bgcolor: '#303F9F', color: 'white', fontSize: '0.7rem' }} />
                                    <Chip label="Multi-RFC" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                    <Chip label="SPEI" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                </Box>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>

                {/* Tarjeta especial: Tipo de Cambio - VERDE ESMERALDA */}
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
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
                            onClick={() => setShowExchangeRates(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box
                                sx={{
                                    background: 'linear-gradient(135deg, #00695C 0%, #4DB6AC 100%)',
                                    p: 3,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <Box sx={{ color: 'white' }}>
                                    <WalletIcon sx={{ fontSize: 48 }} />
                                </Box>
                                <Typography variant="h2" sx={{ opacity: 0.3 }}>
                                    💱
                                </Typography>
                            </Box>
                            <CardContent>
                                <Typography variant="h6" fontWeight="bold" gutterBottom>
                                    Tipo de Cambio
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Configuración de tipo de cambio y sobreprecio por servicio
                                </Typography>
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="caption" color="text.secondary">
                                    Solo Super Admin
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                                    <Chip label="Banxico" size="small" sx={{ bgcolor: '#00695C', color: 'white', fontSize: '0.7rem' }} />
                                    <Chip label="Sobreprecio" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                    <Chip label="USD/MXN" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                </Box>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>

                {/* Tarjeta especial: Carrusel de la App - NARANJA */}
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
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
                            onClick={() => setShowCarousel(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box
                                sx={{
                                    background: 'linear-gradient(135deg, #E64A19 0%, #FF7043 100%)',
                                    p: 3,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <Box sx={{ color: 'white' }}>
                                    <SmartphoneIcon sx={{ fontSize: 48 }} />
                                </Box>
                                <Typography variant="h2" sx={{ opacity: 0.3 }}>
                                    📱
                                </Typography>
                            </Box>
                            <CardContent>
                                <Typography variant="h6" fontWeight="bold" gutterBottom>
                                    Carrusel de la App
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Gestión de slides promocionales en la app móvil
                                </Typography>
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="caption" color="text.secondary">
                                    Solo Super Admin
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                                    <Chip label="Slides" size="small" sx={{ bgcolor: '#E64A19', color: 'white', fontSize: '0.7rem' }} />
                                    <Chip label="Promos" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                    <Chip label="CTR" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                </Box>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>

                {/* Tarjeta especial: Recursos Humanos - ROSA */}
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
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
                            onClick={() => setShowHR(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box
                                sx={{
                                    background: 'linear-gradient(135deg, #AD1457 0%, #F06292 100%)',
                                    p: 3,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <Box sx={{ color: 'white' }}>
                                    <BadgeIcon sx={{ fontSize: 48 }} />
                                </Box>
                                <Typography variant="h2" sx={{ opacity: 0.3 }}>
                                    👥
                                </Typography>
                            </Box>
                            <CardContent>
                                <Typography variant="h6" fontWeight="bold" gutterBottom>
                                    Recursos Humanos
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Gestión de empleados, checador y nómina
                                </Typography>
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="caption" color="text.secondary">
                                    Admin / Super Admin
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                                    <Chip label="Empleados" size="small" sx={{ bgcolor: '#AD1457', color: 'white', fontSize: '0.7rem' }} />
                                    <Chip label="Checador" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                    <Chip label="Nómina" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                </Box>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>

                {/* Tarjeta especial: Gestión de Flotilla - MARRÓN */}
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
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
                            onClick={() => setShowFleet(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box
                                sx={{
                                    background: 'linear-gradient(135deg, #5D4037 0%, #8D6E63 100%)',
                                    p: 3,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <Box sx={{ color: 'white' }}>
                                    <DirectionsCarIcon sx={{ fontSize: 48 }} />
                                </Box>
                                <Typography variant="h2" sx={{ opacity: 0.3 }}>
                                    🚛
                                </Typography>
                            </Box>
                            <CardContent>
                                <Typography variant="h6" fontWeight="bold" gutterBottom>
                                    Gestión de Flotilla
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Vehículos, mantenimiento y combustible
                                </Typography>
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="caption" color="text.secondary">
                                    Admin / Super Admin
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                                    <Chip label="Vehículos" size="small" sx={{ bgcolor: '#5D4037', color: 'white', fontSize: '0.7rem' }} />
                                    <Chip label="Gasolina" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                    <Chip label="Servicios" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                </Box>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>

                {/* Tarjeta especial: Caja Chica - NARANJA */}
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
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
                            onClick={() => setShowCajaChica(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box
                                sx={{
                                    background: 'linear-gradient(135deg, #E65100 0%, #FF9800 100%)',
                                    p: 3,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <Box sx={{ color: 'white' }}>
                                    <LocalAtmIcon sx={{ fontSize: 48 }} />
                                </Box>
                                <Typography variant="h2" sx={{ opacity: 0.3 }}>
                                    💵
                                </Typography>
                            </Box>
                            <CardContent>
                                <Typography variant="h6" fontWeight="bold" gutterBottom>
                                    Caja Chica
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Control de efectivo, ingresos, egresos y cortes de caja
                                </Typography>
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="caption" color="text.secondary">
                                    Sucursal / Admin
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                                    <Chip label="Efectivo" size="small" sx={{ bgcolor: '#E65100', color: 'white', fontSize: '0.7rem' }} />
                                    <Chip label="Cobros" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                    <Chip label="Cortes" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                </Box>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>

                {/* Tarjeta especial: Módulo GEX - VIOLETA */}
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
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
                            onClick={() => setShowGex(true)}
                            sx={{ height: '100%' }}
                        >
                            <Box
                                sx={{
                                    background: 'linear-gradient(135deg, #7B1FA2 0%, #BA68C8 100%)',
                                    p: 3,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <Box sx={{ color: 'white' }}>
                                    <SecurityIcon sx={{ fontSize: 48 }} />
                                </Box>
                                <Typography variant="h2" sx={{ opacity: 0.3 }}>
                                    🛡️
                                </Typography>
                            </Box>
                            <CardContent>
                                <Typography variant="h6" fontWeight="bold" gutterBottom>
                                    Módulo GEX
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Garantía extendida y pólizas de seguro
                                </Typography>
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="caption" color="text.secondary">
                                    5 módulos disponibles
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                                    <Chip label="GEX" size="small" sx={{ bgcolor: '#7B1FA2', color: 'white', fontSize: '0.7rem' }} />
                                    <Chip label="Pólizas" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                    <Chip label="Seguros" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                                </Box>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>
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
