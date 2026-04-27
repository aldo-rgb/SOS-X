// ============================================
// HUB TDI MARÍTIMO CHINA
// Menú con 2 accesos: Recibir Contenedor + Inventario
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
    DirectionsBoat as BoatIcon,
    QrCodeScanner as ScannerIcon,
    Inventory2 as InventoryIcon,
    ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import ChinaSeaReceptionWizard from './ChinaSeaReceptionWizard';
import ChinaSeaInventoryPage from './ChinaSeaInventoryPage';

interface Props {
    onBack: () => void;
}

type Panel = 'menu' | 'reception' | 'reception_fcl' | 'inventory';

const TEAL = '#0097A7';
const ORANGE = '#F05A28';
const BLACK = '#1A1A1A';

const OPTIONS = [
    {
        key: 'reception' as const,
        title: 'Recibir Contenedor',
        description: 'Recepción de carga consolidada (LCL). Escanea las órdenes por referencia (JSM26-XXXX), BL o número de contenedor',
        icon: <ScannerIcon sx={{ fontSize: 56, color: '#FFF' }} />,
        bgGradient: 'linear-gradient(135deg, #F05A28 0%, #FF8A65 100%)',
    },
    {
        key: 'reception_fcl' as const,
        title: 'Actualizar Status Full Conteiner',
        description: 'Actualiza el status de los contenedores FCL (un solo cliente). Confirma la llegada del contenedor a CEDIS',
        icon: <ScannerIcon sx={{ fontSize: 56, color: '#FFF' }} />,
        bgGradient: 'linear-gradient(135deg, #FF6B35 0%, #FF8A65 100%)',
    },
    {
        key: 'inventory' as const,
        title: 'Inventario',
        description: 'Consulta las órdenes marítimas en bodega, su contenedor y estado',
        icon: <InventoryIcon sx={{ fontSize: 56, color: '#FFF' }} />,
        bgGradient: 'linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)',
    },
];

export default function ChinaSeaHubPage({ onBack }: Props) {
    const [panel, setPanel] = useState<Panel>('menu');

    if (panel === 'reception') {
        return <ChinaSeaReceptionWizard onBack={() => setPanel('menu')} mode="LCL" />;
    }
    if (panel === 'reception_fcl') {
        return <ChinaSeaReceptionWizard onBack={() => setPanel('menu')} mode="FCL" />;
    }
    if (panel === 'inventory') {
        return <ChinaSeaInventoryPage onBack={() => setPanel('menu')} />;
    }

    return (
        <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
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
                <Box sx={{ position: 'absolute', right: -40, top: -40, opacity: 0.07, fontSize: 240, lineHeight: 1 }}>
                    🚢
                </Box>
                <Stack direction="row" alignItems="center" spacing={2}>
                    <IconButton onClick={onBack} sx={{ color: '#FFF' }}><ArrowBackIcon /></IconButton>
                    <BoatIcon sx={{ fontSize: 40, color: ORANGE }} />
                    <Box>
                        <Typography variant="overline" sx={{ color: ORANGE, fontWeight: 700, letterSpacing: 2 }}>
                            TDI · ENTREGAX
                        </Typography>
                        <Typography variant="h4" sx={{ fontWeight: 800, color: '#FFF' }}>
                            Marítimo China
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#BDBDBD', mt: 0.5 }}>
                            Recepción por contenedor / BL / referencia y control de inventario marítimo China → México
                        </Typography>
                    </Box>
                </Stack>
            </Paper>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3 }}>
                {OPTIONS.map((opt) => (
                    <Card
                        key={opt.key}
                        elevation={3}
                        sx={{
                            borderRadius: 3,
                            overflow: 'hidden',
                            transition: 'transform 0.2s, box-shadow 0.2s',
                            '&:hover': { transform: 'translateY(-4px)', boxShadow: 8 },
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
                                    borderTopLeftRadius: 3,
                                    borderTopRightRadius: 3,
                                }}
                            >
                                {opt.icon}
                            </Box>
                            <CardContent sx={{ p: 3 }}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between">
                                    <Box>
                                        <Typography variant="h5" sx={{ fontWeight: 700, color: BLACK }}>{opt.title}</Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{opt.description}</Typography>
                                    </Box>
                                    <ChevronRightIcon sx={{ color: TEAL, fontSize: 32 }} />
                                </Stack>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                ))}
            </Box>
        </Box>
    );
}
