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
};

interface Props {
    users?: any[];
}

export default function WarehouseHubPage({ users = [] }: Props) {
    const { t } = useTranslation();
    // Inicializar con ubicaciones predeterminadas para evitar loading infinito
    const [locations, _setLocations] = useState<WarehouseLocation[]>([
        { code: 'usa_pobox', name: 'POBOX USA', services: ['reception', 'shipping'] },
        { code: 'china_air', name: 'China Aéreo', services: ['reception'] },
        { code: 'china_sea', name: 'China Marítimo', services: ['reception'] },
        { code: 'mx_national', name: 'Nacional MX', services: ['quotes'] },
        { code: 'mx_cedis', name: 'CEDIS MX', services: ['inventory'] },
        { code: 'scanner_unificado', name: 'Scanner Unificado', services: ['scanner'] },
        { code: 'inventario_sucursal', name: 'Inventario Sucursal', services: ['inventory'] },
    ]);
    const [_loading, _setLoading] = useState(false); // Cambiar a false para mostrar UI inmediatamente
    const [selectedPanel, setSelectedPanel] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<string>('super_admin');

    const token = localStorage.getItem('token');

    // Log cuando cambia selectedPanel
    useEffect(() => {
        console.log('🎯 selectedPanel cambió a:', selectedPanel);
    }, [selectedPanel]);

    useEffect(() => {
        console.log('🟢 WarehouseHubPage MOUNTED');
        // Cargar rol del usuario en background sin afectar UI
        loadUserRole();
        return () => {
            console.log('🔴 WarehouseHubPage UNMOUNTED');
        };
    }, []);

    const loadUserRole = async () => {
        try {
            const res = await fetch(`${API_URL}/api/auth/profile`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                const role = data.user?.role || data.role || 'super_admin';
                setUserRole(role);
            }
        } catch (err) {
            console.error('Error loading user role:', err);
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
                ) : (
                    <WarehouseReceptionPage warehouseLocation={selectedPanel} />
                )}
            </Box>
        );
    }

    if (_loading) {
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
