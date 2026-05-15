// ============================================
// HUB TDI AÉREO CHINA
// Menú con 2 accesos: Recibir AWB + Inventario
// ============================================

import { useState } from 'react';
import {
    Box,
    Typography,
    Paper,
    Stack,
    IconButton,
    Card,
    CardActionArea,
    CardContent,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    Flight as FlightIcon,
    QrCodeScanner as ScannerIcon,
    Inventory2 as InventoryIcon,
    ChevronRight as ChevronRightIcon,
    LocalShipping as ShippingIcon,
} from '@mui/icons-material';
import ChinaAirReceptionWizard from './ChinaAirReceptionWizard';
import ChinaAirInventoryPage from './ChinaAirInventoryPage';
import TdiExpressShipmentsPage from './TdiExpressShipmentsPage';

interface Props {
    onBack: () => void;
}

type Panel = 'menu' | 'reception' | 'inventory' | 'tdi_express';

const ORANGE = '#FF6B35';
const BLACK = '#1A1A1A';

const OPTIONS = [
    {
        key: 'reception' as const,
        title: 'Recibir AWB',
        description: 'Escanea las guías que llegaron en una AWB y registra la recepción en MTY',
        icon: <ScannerIcon sx={{ fontSize: 56, color: '#FFF' }} />,
        bgGradient: 'linear-gradient(135deg, #D84315 0%, #FF7043 100%)',
    },
    {
        key: 'inventory' as const,
        title: 'Inventario',
        description: 'Consulta los paquetes del servicio aéreo en bodega y su estado',
        icon: <InventoryIcon sx={{ fontSize: 56, color: '#FFF' }} />,
        bgGradient: 'linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)',
    },
    {
        key: 'tdi_express' as const,
        title: 'Recibir TDI Express',
        description: 'Captura en serie de envíos de la ruta TDI Express China → Monterrey',
        icon: <ShippingIcon sx={{ fontSize: 56, color: '#FFF' }} />,
        bgGradient: 'linear-gradient(135deg, #1A1A1A 0%, #424242 100%)',
    },
];

export default function ChinaAirHubPage({ onBack }: Props) {
    const [panel, setPanel] = useState<Panel>('menu');

    if (panel === 'reception') {
        return <ChinaAirReceptionWizard onBack={() => setPanel('menu')} />;
    }
    if (panel === 'inventory') {
        return <ChinaAirInventoryPage onBack={() => setPanel('menu')} />;
    }
    if (panel === 'tdi_express') {
        return <TdiExpressShipmentsPage onBack={() => setPanel('menu')} />;
    }

    return (
        <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
            {/* Header */}
            <Paper
                sx={{
                    p: 3,
                    mb: 3,
                    background: `linear-gradient(135deg, ${BLACK} 0%, #2A2A2A 100%)`,
                    color: '#FFF',
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                <Box
                    sx={{
                        position: 'absolute',
                        right: -40,
                        top: -40,
                        opacity: 0.07,
                        fontSize: 240,
                        lineHeight: 1,
                    }}
                >
                    ✈️
                </Box>
                <Stack direction="row" alignItems="center" spacing={2}>
                    <IconButton onClick={onBack} sx={{ color: '#FFF' }}>
                        <ArrowBackIcon />
                    </IconButton>
                    <FlightIcon sx={{ fontSize: 40, color: ORANGE }} />
                    <Box>
                        <Typography variant="overline" sx={{ color: ORANGE, fontWeight: 700, letterSpacing: 2 }}>
                            TDI · ENTREGAX
                        </Typography>
                        <Typography variant="h4" sx={{ fontWeight: 800, color: '#FFF' }}>
                            Aéreo China
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#BDBDBD', mt: 0.5 }}>
                            Recepción y control de inventario del servicio aéreo China → México
                        </Typography>
                    </Box>
                </Stack>
            </Paper>

            {/* Cards */}
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                    gap: 3,
                }}
            >
                {OPTIONS.map((opt) => (
                    <Card
                        key={opt.key}
                        elevation={3}
                        sx={{
                            borderRadius: 3,
                            overflow: 'hidden',
                            transition: 'transform 0.2s, box-shadow 0.2s',
                            '&:hover': {
                                transform: 'translateY(-4px)',
                                boxShadow: 8,
                            },
                        }}
                    >
                        <CardActionArea onClick={() => setPanel(opt.key)} sx={{ height: '100%' }}>
                            <Box
                                sx={{
                                    background: opt.bgGradient,
                                    p: 4,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    minHeight: 180,
                                }}
                            >
                                {opt.icon}
                            </Box>
                            <CardContent sx={{ p: 3 }}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between">
                                    <Box>
                                        <Typography variant="h5" sx={{ fontWeight: 700, color: BLACK }}>
                                            {opt.title}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                            {opt.description}
                                        </Typography>
                                    </Box>
                                    <ChevronRightIcon sx={{ color: ORANGE, fontSize: 32 }} />
                                </Stack>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                ))}
            </Box>
        </Box>
    );
}
