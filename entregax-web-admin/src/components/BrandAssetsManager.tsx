// ============================================
// BRAND ASSETS MANAGER
// Permite subir y gestionar los logos corporativos
// (EntregaX y X-Pay, en blanco/negro/solo X) y mantener
// un historial reutilizable.
// ============================================

import { useEffect, useRef, useState } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Button,
    IconButton,
    Chip,
    Alert,
    Stack,
    CircularProgress,
    Tooltip,
    Snackbar,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import HistoryIcon from '@mui/icons-material/History';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import ImageIcon from '@mui/icons-material/Image';
import api from '../services/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface BrandAsset {
    id: number;
    slot: string;
    filename: string;
    url: string;
    storage_key?: string;
    mime_type?: string;
    size_bytes?: number;
    is_active: boolean;
    uploaded_by?: number;
    notes?: string;
    created_at: string;
}

interface SlotGroup {
    slot: string;
    label: string;
    active: BrandAsset | null;
    history: BrandAsset[];
}

const SLOT_META: Record<string, { previewBg: string; group: 'entregax' | 'xpay' }> = {
    entregax_full_white: { previewBg: '#0a0a0c', group: 'entregax' },
    entregax_full_black: { previewBg: '#ffffff', group: 'entregax' },
    entregax_x_only:     { previewBg: '#0a0a0c', group: 'entregax' },
    xpay_full_white:     { previewBg: '#0a0a0c', group: 'xpay' },
    xpay_full_black:     { previewBg: '#ffffff', group: 'xpay' },
    xpay_only:           { previewBg: '#0a0a0c', group: 'xpay' },
};

// Convierte una URL relativa (/uploads/...) a absoluta apuntando al backend
const resolveUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/uploads/')) return `${API_BASE}${url}`;
    return url;
};

const formatBytes = (n?: number) => {
    if (!n) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

const formatDate = (iso?: string) => {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return iso;
    }
};

export default function BrandAssetsManager() {
    const [slots, setSlots] = useState<SlotGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
    const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
        open: false, message: '', severity: 'success',
    });
    const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});

    const loadData = async () => {
        try {
            setLoading(true);
            const { data } = await api.get('/admin/brand-assets');
            setSlots(data?.slots || []);
        } catch {
            setSnackbar({ open: true, message: 'Error al cargar logos', severity: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const handlePick = (slot: string) => {
        fileInputsRef.current[slot]?.click();
    };

    const handleUpload = async (slot: string, file: File) => {
        try {
            setUploadingSlot(slot);
            const fd = new FormData();
            fd.append('file', file);
            fd.append('slot', slot);
            fd.append('set_active', 'true');
            await api.post('/admin/brand-assets/upload', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setSnackbar({ open: true, message: 'Logo subido correctamente', severity: 'success' });
            await loadData();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error al subir logo';
            setSnackbar({ open: true, message: msg, severity: 'error' });
        } finally {
            setUploadingSlot(null);
        }
    };

    const handleActivate = async (asset: BrandAsset) => {
        try {
            await api.post(`/admin/brand-assets/${asset.id}/activate`);
            setSnackbar({ open: true, message: 'Logo marcado como activo', severity: 'success' });
            await loadData();
        } catch {
            setSnackbar({ open: true, message: 'Error al activar logo', severity: 'error' });
        }
    };

    const handleDelete = async (asset: BrandAsset) => {
        if (!confirm(`¿Eliminar "${asset.filename}" del historial? No se borrará del almacenamiento.`)) return;
        try {
            await api.delete(`/admin/brand-assets/${asset.id}`);
            setSnackbar({ open: true, message: 'Eliminado del historial', severity: 'success' });
            await loadData();
        } catch {
            setSnackbar({ open: true, message: 'Error al eliminar', severity: 'error' });
        }
    };

    const renderSlotCard = (slot: SlotGroup) => {
        const meta = SLOT_META[slot.slot] || { previewBg: '#f5f5f5', group: 'entregax' };
        const isExpanded = !!expandedHistory[slot.slot];
        const historyCount = slot.history.length;
        const inactiveHistory = slot.history.filter(h => !h.is_active);

        return (
            <Card
                key={slot.slot}
                elevation={0}
                sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                }}
            >
                <Box
                    sx={{
                        bgcolor: meta.previewBg,
                        height: 130,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        borderTopLeftRadius: 8,
                        borderTopRightRadius: 8,
                        overflow: 'hidden',
                        backgroundImage: !slot.active
                            ? 'repeating-linear-gradient(45deg, rgba(0,0,0,0.04) 0 10px, transparent 10px 20px)'
                            : undefined,
                    }}
                >
                    {slot.active ? (
                        <img
                            src={resolveUrl(slot.active.url)}
                            alt={slot.label}
                            style={{ maxHeight: '78%', maxWidth: '78%', objectFit: 'contain' }}
                        />
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: meta.previewBg === '#0a0a0c' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)' }}>
                            <ImageIcon sx={{ fontSize: 36, mb: 0.5 }} />
                            <Typography variant="caption">Sin logo</Typography>
                        </Box>
                    )}
                    {slot.active && (
                        <Chip
                            icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                            label="ACTIVO"
                            size="small"
                            sx={{
                                position: 'absolute',
                                top: 8,
                                right: 8,
                                bgcolor: '#F05A28',
                                color: '#fff',
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: 1,
                                '& .MuiChip-icon': { color: '#fff' },
                            }}
                        />
                    )}
                </Box>

                <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#F05A28', letterSpacing: 1, textTransform: 'uppercase', fontSize: 10 }}>
                        ID · {slot.active?.id || '—'}
                    </Typography>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 0.25, lineHeight: 1.3 }}>
                        {slot.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                        Slot: <code>{slot.slot}</code>
                    </Typography>

                    {slot.active && (
                        <Box sx={{ mt: 1, fontSize: 12, color: 'text.secondary' }}>
                            <Box>📄 {slot.active.filename}</Box>
                            <Box>⚖️ {formatBytes(slot.active.size_bytes)} · 🕒 {formatDate(slot.active.created_at)}</Box>
                        </Box>
                    )}

                    <Stack direction="row" spacing={1} sx={{ mt: 'auto', pt: 2 }}>
                        <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                            hidden
                            ref={(el) => { fileInputsRef.current[slot.slot] = el; }}
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleUpload(slot.slot, f);
                                e.target.value = '';
                            }}
                        />
                        <Button
                            variant="contained"
                            size="small"
                            disabled={uploadingSlot === slot.slot}
                            startIcon={uploadingSlot === slot.slot
                                ? <CircularProgress size={14} sx={{ color: '#fff' }} />
                                : <CloudUploadIcon sx={{ fontSize: 16 }} />}
                            onClick={() => handlePick(slot.slot)}
                            sx={{
                                bgcolor: '#F05A28',
                                textTransform: 'none',
                                fontWeight: 700,
                                fontSize: 12,
                                flex: 1,
                                '&:hover': { bgcolor: '#d94d1f' },
                            }}
                        >
                            {slot.active ? 'Reemplazar' : 'Subir logo'}
                        </Button>
                        {historyCount > 0 && (
                            <Tooltip title={`Historial (${historyCount})`}>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<HistoryIcon sx={{ fontSize: 16 }} />}
                                    onClick={() => setExpandedHistory(s => ({ ...s, [slot.slot]: !s[slot.slot] }))}
                                    sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12 }}
                                >
                                    {historyCount}
                                </Button>
                            </Tooltip>
                        )}
                    </Stack>

                    {isExpanded && (
                        <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed', borderColor: 'divider' }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 1, textTransform: 'uppercase', display: 'block', mb: 1 }}>
                                Historial · {historyCount}
                            </Typography>
                            <Stack spacing={1}>
                                {slot.history.map(h => (
                                    <Box
                                        key={h.id}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 1,
                                            p: 1,
                                            border: 1,
                                            borderColor: h.is_active ? '#F05A28' : 'divider',
                                            bgcolor: h.is_active ? 'rgba(240,90,40,0.06)' : 'transparent',
                                            borderRadius: 1,
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                width: 40, height: 40, borderRadius: 1,
                                                bgcolor: meta.previewBg,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                overflow: 'hidden', flexShrink: 0,
                                            }}
                                        >
                                            <img src={resolveUrl(h.url)} alt={h.filename}
                                                style={{ maxWidth: '85%', maxHeight: '85%', objectFit: 'contain' }} />
                                        </Box>
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography variant="caption" sx={{ fontWeight: 700, color: '#F05A28', fontSize: 10 }}>
                                                ID {h.id}
                                            </Typography>
                                            <Typography variant="body2" sx={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {h.filename}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                                                {formatBytes(h.size_bytes)} · {formatDate(h.created_at)}
                                            </Typography>
                                        </Box>
                                        {!h.is_active && (
                                            <Tooltip title="Activar este logo">
                                                <IconButton size="small" onClick={() => handleActivate(h)}>
                                                    <CheckCircleIcon sx={{ fontSize: 18, color: '#4CAF50' }} />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                        <Tooltip title="Eliminar del historial">
                                            <IconButton size="small" onClick={() => handleDelete(h)}>
                                                <DeleteIcon sx={{ fontSize: 18, color: '#d32f2f' }} />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                ))}
                                {inactiveHistory.length === 0 && slot.active && (
                                    <Typography variant="caption" color="text.secondary">
                                        Aún no hay versiones anteriores.
                                    </Typography>
                                )}
                            </Stack>
                        </Box>
                    )}
                </CardContent>
            </Card>
        );
    };

    const entregaxSlots = slots.filter(s => SLOT_META[s.slot]?.group === 'entregax');
    const xpaySlots = slots.filter(s => SLOT_META[s.slot]?.group === 'xpay');

    return (
        <>
            <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, mb: 3 }}>
                <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <ImageIcon sx={{ color: '#F05A28' }} />
                        <Typography variant="h6" fontWeight={600}>
                            Identidad Visual / Logos
                        </Typography>
                        <Chip label="Super Admin" size="small" color="warning" sx={{ ml: 1 }} />
                    </Box>
                    <Alert severity="info" sx={{ mb: 3 }}>
                        Sube y administra los logos oficiales de <strong>EntregaX</strong> y <strong>X-Pay</strong>.
                        El logo marcado como <strong>ACTIVO</strong> en cada slot es el que se utilizará en la web y la app.
                        Cada subida queda guardada en un historial reutilizable con su propio <strong>ID</strong>.
                    </Alert>

                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <>
                            {/* EntregaX */}
                            <Typography variant="overline" sx={{ color: '#F05A28', fontWeight: 800, letterSpacing: 1.5 }}>
                                EntregaX
                            </Typography>
                            <Box
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
                                    gap: 2,
                                    mt: 1,
                                    mb: 4,
                                }}
                            >
                                {entregaxSlots.map(renderSlotCard)}
                            </Box>

                            {/* X-Pay */}
                            <Typography variant="overline" sx={{ color: '#F05A28', fontWeight: 800, letterSpacing: 1.5 }}>
                                X-Pay
                            </Typography>
                            <Box
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
                                    gap: 2,
                                    mt: 1,
                                }}
                            >
                                {xpaySlots.map(renderSlotCard)}
                            </Box>
                        </>
                    )}
                </CardContent>
            </Card>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar(s => ({ ...s, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </>
    );
}
