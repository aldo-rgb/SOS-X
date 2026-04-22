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
    Print as PrintIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

// Importar los paneles específicos
import WarehouseReceptionPage from './WarehouseReceptionPage';
import ChinaReceptionPage from './ChinaReceptionPage';
import QuotesPage from './QuotesPage';
import MaritimeWarehousePage from './MaritimeWarehousePage';
import DhlOperationsPage from './DhlOperationsPage';
import UnifiedWarehousePanel from './UnifiedWarehousePanel';
import BranchInventoryPage from './BranchInventoryPage';
import POBoxHubPage from './POBoxHubPage';
import RelabelingModulePage from './RelabelingModulePage';

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
        icon: <PrintIcon sx={{ fontSize: 48 }} />,
        color: '#F05A28',
        bgGradient: 'linear-gradient(135deg, #F05A28 0%, #FF8A5B 100%)',
        flag: '🏷️',
        component: 'relabeling',
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
        { code: 'scanner_unificado', name: 'Scanner Unificado', services: ['scanner'] },
        { code: 'inventario_sucursal', name: 'Inventario Sucursal', services: ['inventory'] },
        { code: 'reetiquetado', name: 'Módulo de Reetiquetado', services: ['reprint'] },
    ];
    
    const [locations, setLocations] = useState<WarehouseLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPanel, setSelectedPanel] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<string>('');

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

                // Si solo tiene un panel, ir directo a él
                if (filteredLocations.length === 1) {
                    setSelectedPanel(filteredLocations[0].code);
                }
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
        // Para todos los paneles, ir directo a la página
        setSelectedPanel(locationCode);
    };

    // Handler para volver al hub
    const handleBackToHub = () => {
        console.log('⬅️ Volviendo al Hub');
        setSelectedPanel(null);
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
                    <ChinaReceptionPage />
                ) : selectedPanel === 'china_sea' ? (
                    <MaritimeWarehousePage />
                ) : selectedPanel === 'mx_national' ? (
                    <QuotesPage />
                ) : selectedPanel === 'mx_cedis' ? (
                    <DhlOperationsPage />
                ) : selectedPanel === 'scanner_unificado' ? (
                    <UnifiedWarehousePanel />
                ) : selectedPanel === 'inventario_sucursal' ? (
                    <BranchInventoryPage />
                ) : selectedPanel === 'reetiquetado' ? (
                    <RelabelingModulePage />
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
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" fontWeight="bold">
                    📦 {t('warehouse.hubTitle')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
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
                                    transition: 'all 0.3s ease',
                                    '&:hover': {
                                        transform: 'translateY(-8px)',
                                        boxShadow: 6,
                                    },
                                }}
                            >
                                <CardActionArea
                                    onClick={() => handlePanelClick(location.code)}
                                    sx={{ height: '100%' }}
                                >
                                    <Box
                                        sx={{
                                            background: panel.bgGradient,
                                            p: 3,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                        }}
                                    >
                                        <Box sx={{ color: 'white' }}>
                                            {panel.icon}
                                        </Box>
                                        <Typography variant="h2" sx={{ opacity: 0.3 }}>
                                            {panel.flag}
                                        </Typography>
                                    </Box>
                                    <CardContent>
                                        <Typography variant="h6" fontWeight="bold" gutterBottom>
                                            {t(`warehouse.locations.${location.code}.title`)}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                            {t(`warehouse.locations.${location.code}.subtitle`)}
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                            {location.services.map((service) => (
                                                <Chip
                                                    key={service}
                                                    label={service}
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
