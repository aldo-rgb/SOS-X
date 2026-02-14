// ============================================
// PANELES - HUB CENTRAL
// Vista principal para seleccionar tipo de paneles
// ============================================

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Box,
    Typography,
    Card,
    CardContent,
    CardActionArea,
    Grid,
    Chip,
} from '@mui/material';
import {
    Warehouse as WarehouseIcon,
    AdminPanelSettings as AdminIcon,
    SupportAgent as SupportAgentIcon,
} from '@mui/icons-material';

// Importar los hubs específicos
import WarehouseHubPage from './WarehouseHubPage';
import AdminHubPage from './AdminHubPage';
import CustomerServiceHubPage from './CustomerServiceHubPage';

interface Props {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    users?: any[];
    loading?: boolean;
    onRefresh?: () => void;
}

export default function PanelsHubPage({ users = [], loading = false, onRefresh }: Props) {
    const { t } = useTranslation();
    const [selectedType, setSelectedType] = useState<string | null>(null);

    // Configuración de los tipos de paneles
    const PANEL_TYPES = [
        {
            id: 'admin',
            title: t('panels.adminPanels.title'),
            subtitle: t('panels.adminPanels.subtitle'),
            icon: <AdminIcon sx={{ fontSize: 64 }} />,
            bgGradient: 'linear-gradient(135deg, #1565C0 0%, #42A5F5 100%)',
            emoji: '🛠️',
            description: t('panels.adminPanels.description'),
        },
        {
            id: 'warehouse',
            title: t('panels.warehousePanels.title'),
            subtitle: t('panels.warehousePanels.subtitle'),
            icon: <WarehouseIcon sx={{ fontSize: 64 }} />,
            bgGradient: 'linear-gradient(135deg, #E64A19 0%, #FF7043 100%)',
            emoji: '📦',
            description: t('panels.warehousePanels.description'),
        },
        {
            id: 'customerService',
            title: t('panels.customerServicePanels.title'),
            subtitle: t('panels.customerServicePanels.subtitle'),
            icon: <SupportAgentIcon sx={{ fontSize: 64 }} />,
            bgGradient: 'linear-gradient(135deg, #7B1FA2 0%, #AB47BC 100%)',
            emoji: '🎧',
            description: t('panels.customerServicePanels.description'),
        },
    ];

    // Si hay un tipo seleccionado, mostrar ese hub
    if (selectedType === 'warehouse') {
        return (
            <Box>
                <Box sx={{ mb: 2 }}>
                    <Chip
                        label={t('panels.backToPanels')}
                        onClick={() => setSelectedType(null)}
                        sx={{ cursor: 'pointer' }}
                    />
                </Box>
                <WarehouseHubPage users={users} />
            </Box>
        );
    }

    if (selectedType === 'admin') {
        return (
            <Box>
                <Box sx={{ mb: 2 }}>
                    <Chip
                        label={t('panels.backToPanels')}
                        onClick={() => setSelectedType(null)}
                        sx={{ cursor: 'pointer' }}
                    />
                </Box>
                <AdminHubPage users={users} loading={loading} onRefresh={onRefresh} />
            </Box>
        );
    }

    if (selectedType === 'customerService') {
        return (
            <Box>
                <Box sx={{ mb: 2 }}>
                    <Chip
                        label={t('panels.backToPanels')}
                        onClick={() => setSelectedType(null)}
                        sx={{ cursor: 'pointer' }}
                    />
                </Box>
                <CustomerServiceHubPage />
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" fontWeight="bold">
                    📋 {t('panels.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    {t('panels.subtitle')}
                </Typography>
            </Box>

            {/* Grid de tipos de paneles */}
            <Grid container spacing={4} justifyContent="center">
                {PANEL_TYPES.map((panel) => (
                    <Grid size={{ xs: 12, md: 6 }} key={panel.id}>
                        <Card
                            sx={{
                                height: '100%',
                                transition: 'all 0.3s ease',
                                '&:hover': {
                                    transform: 'translateY(-8px)',
                                    boxShadow: 8,
                                },
                            }}
                        >
                            <CardActionArea
                                onClick={() => setSelectedType(panel.id)}
                                sx={{ height: '100%' }}
                            >
                                <Box
                                    sx={{
                                        background: panel.bgGradient,
                                        p: 4,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        minHeight: 140,
                                    }}
                                >
                                    <Box sx={{ color: 'white' }}>
                                        {panel.icon}
                                    </Box>
                                    <Typography variant="h1" sx={{ opacity: 0.2, fontSize: '5rem' }}>
                                        {panel.emoji}
                                    </Typography>
                                </Box>
                                <CardContent sx={{ p: 3 }}>
                                    <Typography variant="h5" fontWeight="bold" gutterBottom>
                                        {panel.title}
                                    </Typography>
                                    <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                                        {panel.subtitle}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {panel.description}
                                    </Typography>
                                </CardContent>
                            </CardActionArea>
                        </Card>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
}