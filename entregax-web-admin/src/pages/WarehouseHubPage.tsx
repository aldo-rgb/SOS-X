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
    Dialog,
    DialogTitle,
    DialogContent,
    Button,
} from '@mui/material';
import {
    Flight as FlightIcon,
    DirectionsBoat as BoatIcon,
    LocalShipping as TruckIcon,
    Warehouse as WarehouseIcon,
    LocationOn as LocationIcon,
    CallReceived as EntryIcon,
    CallMade as ExitIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

// Importar los paneles específicos
import ShipmentsPage from './ShipmentsPage';
import WarehouseReceptionPage from './WarehouseReceptionPage';
import ChinaReceptionPage from './ChinaReceptionPage';
import ConsolidationsPage from './ConsolidationsPage';
import QuotesPage from './QuotesPage';
import MaritimeWarehousePage from './MaritimeWarehousePage';

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
};

interface Props {
    users?: any[];
}

export default function WarehouseHubPage({ users = [] }: Props) {
    const { t } = useTranslation();
    const [locations, setLocations] = useState<WarehouseLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPanel, setSelectedPanel] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<string>('');
    const [showPOBoxModal, setShowPOBoxModal] = useState(false);
    const [poboxMode, setPoboxMode] = useState<'entry' | 'exit' | null>(null);

    const token = localStorage.getItem('token');

    useEffect(() => {
        checkUserAccess();
        fetchLocations();
    }, []);

    const checkUserAccess = async () => {
        try {
            const res = await fetch(`${API_URL}/api/auth/profile`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setUserRole(data.user.role);
                // Si el usuario tiene ubicación asignada, ir directamente a su panel
                if (data.user.warehouse_location && data.user.role !== 'super_admin') {
                    setSelectedPanel(data.user.warehouse_location);
                }
            }
        } catch (err) {
            console.error('Error checking user access:', err);
        }
    };

    const fetchLocations = async () => {
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
            setLoading(false);
        }
    };

    // Handler para seleccionar un panel
    const handlePanelClick = (locationCode: string) => {
        if (locationCode === 'usa_pobox') {
            // Para PO Box USA, mostrar modal de entrada/salida
            setShowPOBoxModal(true);
        } else {
            // Para otros paneles, ir directo
            setSelectedPanel(locationCode);
        }
    };

    // Handler para selección de entrada/salida en PO Box
    const handlePOBoxSelection = (mode: 'entry' | 'exit') => {
        setPoboxMode(mode);
        setShowPOBoxModal(false);
        setSelectedPanel('usa_pobox');
    };

    // Handler para volver al hub
    const handleBackToHub = () => {
        setSelectedPanel(null);
        setPoboxMode(null);
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
                        {selectedPanel === 'usa_pobox' && poboxMode && (
                            <Chip
                                label={t('warehouse.backToAllPanels')}
                                onClick={handleBackToHub}
                                sx={{ cursor: 'pointer', ml: 1 }}
                                color="primary"
                                variant="outlined"
                            />
                        )}
                    </Box>
                )}
                
                {/* Mostrar el panel correspondiente */}
                {selectedPanel === 'usa_pobox' ? (
                    poboxMode === 'exit' ? (
                        <ConsolidationsPage />
                    ) : (
                        <ShipmentsPage users={users} warehouseLocation={selectedPanel} />
                    )
                ) : selectedPanel === 'china_air' ? (
                    <ChinaReceptionPage />
                ) : selectedPanel === 'china_sea' ? (
                    <MaritimeWarehousePage />
                ) : selectedPanel === 'mx_national' ? (
                    <QuotesPage />
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

            {/* Modal de Entrada/Salida para PO Box USA */}
            <Dialog 
                open={showPOBoxModal} 
                onClose={() => setShowPOBoxModal(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle sx={{ textAlign: 'center', pb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                        <TruckIcon sx={{ color: '#2196F3' }} />
                        <Typography variant="h6" fontWeight="bold">
                            🇺🇸 {t('warehouse.poboxModal.title')}
                        </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                        {t('warehouse.poboxModal.subtitle')}
                    </Typography>
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', gap: 2, p: 2 }}>
                        {/* Botón Entrada */}
                        <Card 
                            sx={{ 
                                flex: 1, 
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                '&:hover': { transform: 'scale(1.02)', boxShadow: 4 }
                            }}
                            onClick={() => handlePOBoxSelection('entry')}
                        >
                            <CardContent sx={{ textAlign: 'center', py: 4 }}>
                                <Box 
                                    sx={{ 
                                        width: 80, 
                                        height: 80, 
                                        borderRadius: '50%', 
                                        bgcolor: '#e8f5e9', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        mx: 'auto',
                                        mb: 2
                                    }}
                                >
                                    <EntryIcon sx={{ fontSize: 40, color: '#4CAF50' }} />
                                </Box>
                                <Typography variant="h6" fontWeight="bold" color="#4CAF50">
                                    {t('warehouse.poboxModal.entry')}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {t('warehouse.poboxModal.entryDesc')}
                                </Typography>
                            </CardContent>
                        </Card>

                        {/* Botón Salida */}
                        <Card 
                            sx={{ 
                                flex: 1, 
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                '&:hover': { transform: 'scale(1.02)', boxShadow: 4 }
                            }}
                            onClick={() => handlePOBoxSelection('exit')}
                        >
                            <CardContent sx={{ textAlign: 'center', py: 4 }}>
                                <Box 
                                    sx={{ 
                                        width: 80, 
                                        height: 80, 
                                        borderRadius: '50%', 
                                        bgcolor: '#fff3e0', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        mx: 'auto',
                                        mb: 2
                                    }}
                                >
                                    <ExitIcon sx={{ fontSize: 40, color: '#F05A28' }} />
                                </Box>
                                <Typography variant="h6" fontWeight="bold" color="#F05A28">
                                    {t('warehouse.poboxModal.exit')}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {t('warehouse.poboxModal.exitDesc')}
                                </Typography>
                            </CardContent>
                        </Card>
                    </Box>
                    <Box sx={{ textAlign: 'center', mt: 1 }}>
                        <Button onClick={() => setShowPOBoxModal(false)} color="inherit">
                            {t('common.cancel')}
                        </Button>
                    </Box>
                </DialogContent>
            </Dialog>
        </Box>
    );
}
