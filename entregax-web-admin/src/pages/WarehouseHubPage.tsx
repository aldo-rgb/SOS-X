// ============================================
// HUB DE PANELES DE BODEGA
// Vista para administradores con acceso a todos los paneles
// ============================================

import { useState, useEffect } from 'react';
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
} from '@mui/material';
import {
    Flight as FlightIcon,
    DirectionsBoat as BoatIcon,
    LocalShipping as TruckIcon,
    Warehouse as WarehouseIcon,
    LocationOn as LocationIcon,
    Inventory as InventoryIcon,
    LocalOffer as LabelIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

// Importar los paneles específicos
import WarehouseReceptionPage from './WarehouseReceptionPage';
import NacionalMexicoPage from './NacionalMexicoPage';
import MaritimeWarehousePage from './MaritimeWarehousePage';
import DhlOperationsPage from './DhlOperationsPage';
import UnifiedWarehousePanel from './UnifiedWarehousePanel';
import BranchInventoryPage from './BranchInventoryPage';
import POBoxHubPage from './POBoxHubPage';
import RelabelingModulePage from './RelabelingModulePage';
import ServiceInventoryPage from './ServiceInventoryPage';
import ChinaAirHubPage from './ChinaAirHubPage';
import ChinaSeaHubPage from './ChinaSeaHubPage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface WarehouseLocation {
    code: string;
    name: string;
    services: string[];
}

// Configuración de cada panel (sin textos - usarán traducciones)
const WAREHOUSE_PANELS = {
    usa_pobox: {
        icon: <TruckIcon sx={{ fontSize: 48 }} />,
        color: '#2196F3',
        bgGradient: 'linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)',
        flag: '🇺🇸',
        component: 'shipmentsPage',
    },
    china_air: {
        icon: <FlightIcon sx={{ fontSize: 48 }} />,
        color: '#FF5722',
        bgGradient: 'linear-gradient(135deg, #E64A19 0%, #FF7043 100%)',
        flag: '🇨🇳',
        component: 'chinaReception',
    },
    china_sea: {
        icon: <BoatIcon sx={{ fontSize: 48 }} />,
        color: '#00BCD4',
        bgGradient: 'linear-gradient(135deg, #0097A7 0%, #26C6DA 100%)',
        flag: '🇨🇳',
        component: 'warehouseReception',
    },
    mx_cedis: {
        icon: <WarehouseIcon sx={{ fontSize: 48 }} />,
        color: '#4CAF50',
        bgGradient: 'linear-gradient(135deg, #388E3C 0%, #66BB6A 100%)',
        flag: '🇲🇽',
        component: 'warehouseReception',
    },
    mx_national: {
        icon: <LocationIcon sx={{ fontSize: 48 }} />,
        color: '#9C27B0',
        bgGradient: 'linear-gradient(135deg, #7B1FA2 0%, #BA68C8 100%)',
        flag: '🇲🇽',
        component: 'quotesPage',
    },
    scanner_unificado: {
        icon: <WarehouseIcon sx={{ fontSize: 48 }} />,
        color: '#F05A28',
        bgGradient: 'linear-gradient(135deg, #C1272D 0%, #F05A28 100%)',
        flag: '📱',
        component: 'unifiedScanner',
    },
    inventario_sucursal: {
        icon: <InventoryIcon sx={{ fontSize: 48 }} />,
        color: '#667eea',
        bgGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        flag: '📦',
        component: 'branchInventory',
    },
    reetiquetado: {
        icon: <LabelIcon sx={{ fontSize: 48 }} />,
        color: '#F05A28',
        bgGradient: 'linear-gradient(135deg, #F05A28 0%, #FF8A5B 100%)',
        flag: '🏷️',
        component: 'relabeling',
    },
    service_inventory: {
        icon: <InventoryIcon sx={{ fontSize: 48 }} />,
        color: '#0288D1',
        bgGradient: 'linear-gradient(135deg, #01579B 0%, #0288D1 100%)',
        flag: '📋',
        component: 'serviceInventory',
    },
};

interface Props {
    users?: any[];
}

// Mapeo de panel_key a location_code
const PANEL_TO_LOCATION: Record<string, string> = {
    'ops_usa_pobox': 'usa_pobox',
    'ops_china_air': 'china_air',
    'ops_china_sea': 'china_sea',
    'ops_mx_cedis': 'mx_cedis',
    'ops_mx_national': 'mx_national',
    'ops_scanner': 'scanner_unificado',
    'ops_inventory': 'inventario_sucursal',
    'ops_relabeling': 'reetiquetado',
    'ops_service_inventory': 'service_inventory',
};

export default function WarehouseHubPage({ users = [] }: Props) {
    const { t } = useTranslation();
    // Todas las ubicaciones disponibles (orden: TDI Aéreo, Marítimo, PO Box)
    const ALL_LOCATIONS: WarehouseLocation[] = [
        { code: 'china_air', name: 'China Aéreo', services: ['reception'] },
        { code: 'china_sea', name: 'China Marítimo', services: ['reception'] },
        { code: 'usa_pobox', name: 'POBOX USA', services: ['reception', 'shipping'] },
        { code: 'mx_national', name: 'Nacional MX', services: ['quotes'] },
        { code: 'mx_cedis', name: 'CEDIS MX', services: ['inventory'] },
        { code: 'scanner_unificado', name: 'Escáner Multi-Sucursal', services: ['scanner'] },
        { code: 'inventario_sucursal', name: 'Inventario Sucursal', services: ['inventory'] },
        { code: 'reetiquetado', name: 'Módulo de Reetiquetado', services: ['reprint'] },
        { code: 'service_inventory', name: 'Inventario por Servicio', services: ['inventory'] },
    ];
    
    const [locations, setLocations] = useState<WarehouseLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPanel, setSelectedPanel] = useState<string | null>(null);
    const [mtySubTool, setMtySubTool] = useState<'dhl_recibir' | 'inventario' | null>(null);
    const [userRole, setUserRole] = useState<string>('');
    const [inventoryBranchId, setInventoryBranchId] = useState<number | undefined>(undefined);
    const [lockInventoryBranch, setLockInventoryBranch] = useState<boolean>(false);

    const token = localStorage.getItem('token');

    // Log cuando cambia selectedPanel
    useEffect(() => {
        console.log('🎯 selectedPanel cambió a:', selectedPanel);
    }, [selectedPanel]);

    useEffect(() => {
        console.log('🟢 WarehouseHubPage MOUNTED');
        loadUserPermissions();
        return () => {
            console.log('🔴 WarehouseHubPage UNMOUNTED');
        };
    }, []);

    const loadMyBranchId = async (): Promise<number | undefined> => {
        try {
            const res = await fetch(`${API_URL}/api/warehouse/branch-info`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return undefined;
            const data = await res.json();
            const id = Number(data?.branch_id);
            return Number.isFinite(id) ? id : undefined;
        } catch {
            return undefined;
        }
    };

    useEffect(() => {
        const openPanelHandler = async (rawEvent: Event) => {
            const event = rawEvent as CustomEvent<{ panelCode?: string; lockToMyBranch?: boolean }>;
            const panelCode = event.detail?.panelCode;
            if (!panelCode) return;

            if (panelCode === 'inventario_sucursal' && event.detail?.lockToMyBranch) {
                const myBranchId = await loadMyBranchId();
                setInventoryBranchId(myBranchId);
                setLockInventoryBranch(true);
            } else {
                setInventoryBranchId(undefined);
                setLockInventoryBranch(false);
            }

            setSelectedPanel(panelCode);
        };

        window.addEventListener('open-operations-panel', openPanelHandler as EventListener);
        return () => window.removeEventListener('open-operations-panel', openPanelHandler as EventListener);
    }, [token]);

    const loadUserPermissions = async () => {
        setLoading(true);
        try {
            // Cargar perfil del usuario
            const profileRes = await fetch(`${API_URL}/api/auth/profile`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            
            let role = '';
            if (profileRes.ok) {
                const profileData = await profileRes.json();
                role = profileData.user?.role || profileData.role || '';
                setUserRole(role);
            }

            // Si es super_admin, mostrar todos los paneles
            if (role === 'super_admin') {
                setLocations(ALL_LOCATIONS);
                setLoading(false);
                return;
            }

            // El resto de roles (incluido counter_staff) se filtra por permisos reales
            // asignados desde el módulo de Permisos (tabla panels_admin / api/panels/me)

            // Cargar permisos del usuario
            const permissionsRes = await fetch(`${API_URL}/api/panels/me`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (permissionsRes.ok) {
                const permData = await permissionsRes.json();
                const userPanels = (permData.panels || [])
                    .filter((p: { can_view: boolean }) => p.can_view)
                    .map((p: { panel_key: string }) => p.panel_key);

                console.log('📋 Permisos de operaciones del usuario:', userPanels);

                // Filtrar ubicaciones según permisos
                const allowedLocationCodes = userPanels
                    .map((panelKey: string) => PANEL_TO_LOCATION[panelKey])
                    .filter(Boolean);

                const filteredLocations = ALL_LOCATIONS.filter(loc => 
                    allowedLocationCodes.includes(loc.code)
                );

                console.log('📍 Ubicaciones permitidas:', filteredLocations.map(l => l.code));
                setLocations(filteredLocations);
            } else {
                // Sin permisos específicos, no mostrar nada
                setLocations([]);
            }
        } catch (err) {
            console.error('Error loading user permissions:', err);
            setLocations([]);
        } finally {
            setLoading(false);
        }
    };

    // Handler para seleccionar un panel
    const handlePanelClick = (locationCode: string) => {
        console.log('📦 Panel seleccionado:', locationCode);
        // Navegación manual: liberar filtros de inventario rápido
        setInventoryBranchId(undefined);
        setLockInventoryBranch(false);
        setSelectedPanel(locationCode);
    };

    // Handler para volver al hub
    const handleBackToHub = () => {
        console.log('⬅️ Volviendo al Hub');
        setSelectedPanel(null);
        setMtySubTool(null);
        setInventoryBranchId(undefined);
        setLockInventoryBranch(false);
    };

    const handleBackToMtyHub = () => {
        setMtySubTool(null);
    };

    // Si hay un panel seleccionado, mostrar ese panel
    if (selectedPanel) {
        return (
            <Box>
                {/* Breadcrumb para volver */}
                {userRole === 'super_admin' && (
                    <Box sx={{ mb: 2 }}>
                        <Chip
                            label={t('warehouse.backToPanels')}
                            onClick={handleBackToHub}
                            sx={{ cursor: 'pointer' }}
                        />
                    </Box>
                )}
                
                {/* Mostrar el panel correspondiente */}
                {selectedPanel === 'usa_pobox' ? (
                    <POBoxHubPage users={users} onBack={handleBackToHub} />
                ) : selectedPanel === 'china_air' ? (
                    <ChinaAirHubPage onBack={handleBackToHub} />
                ) : selectedPanel === 'china_sea' ? (
                    <ChinaSeaHubPage onBack={handleBackToHub} />
                ) : selectedPanel === 'china_sea_legacy' ? (
                    <MaritimeWarehousePage />
                ) : selectedPanel === 'mx_national' ? (
                    <NacionalMexicoPage />
                ) : selectedPanel === 'mx_cedis' ? (
                    mtySubTool === 'dhl_recibir' ? (
                        <DhlOperationsPage onBack={handleBackToMtyHub} autoOpenRecibir={true} />
                    ) : mtySubTool === 'inventario' ? (
                        <DhlOperationsPage onBack={handleBackToMtyHub} />
                    ) : (
                        <Box sx={{ p: 3, bgcolor: '#FAFAFA', minHeight: '100vh' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 4, cursor: 'pointer' }} onClick={handleBackToHub}>
                                <Typography sx={{ color: '#F05A28', fontWeight: 600, fontSize: 14 }}>← Operaciones</Typography>
                            </Box>
                            <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>DHL Monterrey</Typography>
                            <Typography variant="body2" sx={{ color: '#6B7280', mb: 4 }}>Selecciona una opción</Typography>
                            <Grid container spacing={3}>
                                {/* TDI Express - Por desarrollar */}
                                <Grid size={{ xs: 12, sm: 4 }}>
                                    <Card sx={{ borderRadius: 2, border: '1px solid #E0E0E0', opacity: 0.5 }}>
                                        <CardActionArea disabled sx={{ height: '100%' }}>
                                            <Box sx={{ height: 4, bgcolor: '#9E9E9E' }} />
                                            <Box sx={{ px: 3, pt: 2.5, pb: 0.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                                <Box sx={{ width: 48, height: 48, borderRadius: 1.5, bgcolor: '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <TruckIcon sx={{ fontSize: 26, color: '#9E9E9E' }} />
                                                </Box>
                                                <Typography sx={{ fontSize: 22 }}>🚚</Typography>
                                            </Box>
                                            <CardContent>
                                                <Typography sx={{ fontWeight: 700, fontSize: 16, color: '#9E9E9E', mb: 0.5 }}>TDI Express</Typography>
                                                <Typography sx={{ fontSize: 13, color: '#BDBDBD' }}>Por desarrollar</Typography>
                                            </CardContent>
                                        </CardActionArea>
                                    </Card>
                                </Grid>
                                {/* DHL Monterrey - Recibir paquete */}
                                <Grid size={{ xs: 12, sm: 4 }}>
                                    <Card sx={{ borderRadius: 2, border: '1px solid #ECECEC', transition: 'all 0.2s', '&:hover': { borderColor: '#F05A28', boxShadow: '0 8px 24px rgba(240,90,40,0.12)', transform: 'translateY(-2px)' } }}>
                                        <CardActionArea onClick={() => setMtySubTool('dhl_recibir')}>
                                            <Box sx={{ height: 4, bgcolor: '#F05A28' }} />
                                            <Box sx={{ px: 3, pt: 2.5, pb: 0.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                                <Box sx={{ width: 48, height: 48, borderRadius: 1.5, bgcolor: '#F05A2815', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <TruckIcon sx={{ fontSize: 26, color: '#F05A28' }} />
                                                </Box>
                                                <Typography sx={{ fontSize: 22 }}>📮</Typography>
                                            </Box>
                                            <CardContent>
                                                <Typography sx={{ fontWeight: 700, fontSize: 16, color: '#1A1A1A', mb: 0.5 }}>DHL Monterrey</Typography>
                                                <Typography sx={{ fontSize: 13, color: '#6B7280' }}>Acceso directo a recibir paquete</Typography>
                                            </CardContent>
                                        </CardActionArea>
                                    </Card>
                                </Grid>
                                {/* Inventario DHL */}
                                <Grid size={{ xs: 12, sm: 4 }}>
                                    <Card sx={{ borderRadius: 2, border: '1px solid #ECECEC', transition: 'all 0.2s', '&:hover': { borderColor: '#1565C0', boxShadow: '0 8px 24px rgba(21,101,192,0.12)', transform: 'translateY(-2px)' } }}>
                                        <CardActionArea onClick={() => setMtySubTool('inventario')}>
                                            <Box sx={{ height: 4, bgcolor: '#1565C0' }} />
                                            <Box sx={{ px: 3, pt: 2.5, pb: 0.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                                <Box sx={{ width: 48, height: 48, borderRadius: 1.5, bgcolor: '#1565C015', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <InventoryIcon sx={{ fontSize: 26, color: '#1565C0' }} />
                                                </Box>
                                                <Typography sx={{ fontSize: 22 }}>📦</Typography>
                                            </Box>
                                            <CardContent>
                                                <Typography sx={{ fontWeight: 700, fontSize: 16, color: '#1A1A1A', mb: 0.5 }}>Inventario</Typography>
                                                <Typography sx={{ fontSize: 13, color: '#6B7280' }}>Operaciones DHL Monterrey</Typography>
                                            </CardContent>
                                        </CardActionArea>
                                    </Card>
                                </Grid>
                            </Grid>
                        </Box>
                    )
                ) : selectedPanel === 'scanner_unificado' ? (
                    <UnifiedWarehousePanel onBack={handleBackToHub} />
                ) : selectedPanel === 'inventario_sucursal' ? (
                    <BranchInventoryPage
                        branchId={inventoryBranchId}
                        showBranchSelector={!lockInventoryBranch}
                    />
                ) : selectedPanel === 'service_inventory' ? (
                    <ServiceInventoryPage />
                ) : selectedPanel === 'reetiquetado' ? (
                    <RelabelingModulePage onBack={handleBackToHub} />
                ) : (
                    <WarehouseReceptionPage warehouseLocation={selectedPanel} />
                )}
            </Box>
        );
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    // Si no tiene permisos, mostrar mensaje
    if (locations.length === 0) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="warning">
                    No tienes permisos asignados para paneles de operaciones. Contacta al administrador.
                </Alert>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3, bgcolor: '#FAFAFA', minHeight: '100vh' }}>
            {/* Header */}
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 700, color: '#1A1A1A', letterSpacing: -0.5 }}>
                    {t('warehouse.hubTitle')}
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B7280', mt: 0.5 }}>
                    {t('warehouse.hubSubtitle')}
                </Typography>
            </Box>

            {/* Grid de paneles */}
            <Grid container spacing={3}>
                {locations.map((location) => {
                    const panel = WAREHOUSE_PANELS[location.code as keyof typeof WAREHOUSE_PANELS];
                    if (!panel) return null;

                    return (
                        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={location.code}>
                            <Card
                                sx={{
                                    height: '100%',
                                    borderRadius: 2,
                                    border: '1px solid #ECECEC',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                    transition: 'all 0.2s ease',
                                    overflow: 'hidden',
                                    '&:hover': {
                                        borderColor: '#F05A28',
                                        boxShadow: '0 8px 24px rgba(240,90,40,0.12)',
                                        transform: 'translateY(-2px)',
                                    },
                                }}
                            >
                                <CardActionArea
                                    onClick={() => handlePanelClick(location.code)}
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
                                            '& svg': { fontSize: 26 },
                                        }}>
                                            {panel.icon}
                                        </Box>
                                        <Typography sx={{ fontSize: 28, lineHeight: 1, opacity: 0.85 }}>
                                            {panel.flag}
                                        </Typography>
                                    </Box>
                                    <CardContent>
                                        <Typography sx={{ fontWeight: 700, fontSize: 17, color: '#1A1A1A', mb: 0.5 }}>
                                            {t(`warehouse.locations.${location.code}.title`)}
                                        </Typography>
                                        <Typography sx={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.5 }}>
                                            {t(`warehouse.locations.${location.code}.subtitle`)}
                                        </Typography>
                                    </CardContent>
                                </CardActionArea>
                            </Card>
                        </Grid>
                    );
                })}
            </Grid>

            {/* Estadísticas rápidas (opcional) */}
            <Box sx={{ mt: 4 }}>
                <Alert severity="info">
                    {t('warehouse.hubTip')}
                </Alert>
            </Box>
        </Box>
    );
}
