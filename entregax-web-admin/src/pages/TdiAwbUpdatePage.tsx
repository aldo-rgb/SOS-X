// ============================================
// ACTUALIZAR GUÍA AWB DHL
// Lista las cajas TDX (DHL Express) en tránsito y permite asignarles el AWB
// (se guarda en international_tracking → aparece en el Inventario TDX).
// ============================================
import { useState, useEffect, useCallback } from 'react';
import {
    Box, Paper, Typography, IconButton, Stack, TextField, Button, Chip,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    CircularProgress, Snackbar, Alert, InputAdornment,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    FlightTakeoff as FlightTakeoffIcon,
    Refresh as RefreshIcon,
    Save as SaveIcon,
    QrCode2 as QrCodeIcon,
    Inbox as InboxIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ORANGE = '#FF6B35';
const BLACK = '#1A1A1A';
const DHL_YELLOW = '#FFCC00';

interface InTransitBox {
    id: number;
    tracking_internal: string;
    tracking_provider: string | null;
    box_id: string | null;
    weight: string | number | null;
    air_chargeable_weight: string | number | null;
    dimensions: string | null;
    description: string | null;
    awb: string | null;
    client_name: string | null;
}

interface Props { onBack: () => void; }

export default function TdiAwbUpdatePage({ onBack }: Props) {
    const token = localStorage.getItem('token');
    const authHeaders = { Authorization: `Bearer ${token}` };

    const [loading, setLoading] = useState(false);
    const [boxes, setBoxes] = useState<InTransitBox[]>([]);
    const [search, setSearch] = useState('');
    const [drafts, setDrafts] = useState<Record<number, string>>({});
    const [savingId, setSavingId] = useState<number | null>(null);
    const [snack, setSnack] = useState<{ sev: 'success' | 'error'; msg: string } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/tdi-express/in-transit`, {
                headers: authHeaders, params: { search: search || undefined },
            });
            const rows: InTransitBox[] = res.data.boxes || [];
            setBoxes(rows);
            // Inicializar drafts con el AWB actual
            const init: Record<number, string> = {};
            rows.forEach((b) => { init[b.id] = b.awb || ''; });
            setDrafts(init);
        } catch {
            setSnack({ sev: 'error', msg: 'Error al cargar cajas en tránsito' });
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    useEffect(() => { load(); }, [load]);

    const saveAwb = async (id: number) => {
        const awb = (drafts[id] || '').trim().toUpperCase();
        setSavingId(id);
        try {
            await axios.patch(`${API_URL}/api/tdi-express/${id}/awb`, { awb }, { headers: authHeaders });
            setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, awb: awb || null } : b)));
            setSnack({ sev: 'success', msg: awb ? `AWB asignado a la caja` : 'AWB removido' });
        } catch (e: any) {
            setSnack({ sev: 'error', msg: e?.response?.data?.error || 'Error al guardar AWB' });
        } finally {
            setSavingId(null);
        }
    };

    const fmtDims = (b: InTransitBox) => (b.dimensions ? String(b.dimensions).replace(/\.00/g, '').replace(/—/g, '').trim() : '—');

    return (
        <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
            {/* Header */}
            <Paper sx={{ p: 3, mb: 3, background: `linear-gradient(135deg, ${BLACK} 0%, #2A2A2A 100%)`, color: '#FFF', position: 'relative', overflow: 'hidden' }}>
                <Stack direction="row" alignItems="center" spacing={2}>
                    <IconButton onClick={onBack} sx={{ color: '#FFF' }}><ArrowBackIcon /></IconButton>
                    <FlightTakeoffIcon sx={{ fontSize: 40, color: DHL_YELLOW }} />
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="overline" sx={{ color: DHL_YELLOW, fontWeight: 700, letterSpacing: 2 }}>
                            DHL EXPRESS
                        </Typography>
                        <Typography variant="h4" sx={{ fontWeight: 800 }}>Actualizar Guía AWB DHL</Typography>
                        <Typography variant="body2" sx={{ color: '#BDBDBD', mt: 0.5 }}>
                            Asigna el AWB a las cajas TDX en tránsito para que aparezcan en el Inventario TDX.
                        </Typography>
                    </Box>
                    <IconButton onClick={load} sx={{ color: '#FFF' }} disabled={loading}>
                        {loading ? <CircularProgress size={22} sx={{ color: '#FFF' }} /> : <RefreshIcon />}
                    </IconButton>
                </Stack>
            </Paper>

            {/* Búsqueda */}
            <TextField
                fullWidth size="small" placeholder="Buscar por guía, AWB, cliente o casillero..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                sx={{ mb: 2, maxWidth: 480 }}
                InputProps={{ startAdornment: <InputAdornment position="start"><QrCodeIcon color="action" /></InputAdornment> }}
            />

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress sx={{ color: ORANGE }} /></Box>
            ) : (
                <TableContainer component={Paper} elevation={2} sx={{ borderRadius: 2 }}>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#1a1a2e' }}>
                                <TableCell sx={{ color: 'white', fontWeight: 600 }}>GUÍA</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 600 }}>CLIENTE</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 600 }}>MEDIDAS</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 600 }}>PESO</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 600, minWidth: 300 }}>AWB</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {boxes.map((b) => {
                                const draft = drafts[b.id] ?? '';
                                const dirty = (draft || '').trim().toUpperCase() !== (b.awb || '').toUpperCase();
                                return (
                                    <TableRow key={b.id} hover>
                                        <TableCell>
                                            <Typography fontWeight={600} color="primary">{b.tracking_internal}</Typography>
                                            {b.tracking_provider && (
                                                <Typography variant="caption" color="text.secondary">Origen: {b.tracking_provider}</Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Chip label={b.box_id || '—'} size="small" sx={{ fontWeight: 600, bgcolor: '#f5f5f5' }} />
                                            {b.client_name && (
                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{b.client_name}</Typography>
                                            )}
                                        </TableCell>
                                        <TableCell><Typography variant="body2">{fmtDims(b)}</Typography></TableCell>
                                        <TableCell><Typography fontWeight={500}>{Number(b.air_chargeable_weight || b.weight || 0).toFixed(1)} kg</Typography></TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <TextField
                                                    size="small" placeholder="Número de AWB" value={draft}
                                                    onChange={(e) => setDrafts((d) => ({ ...d, [b.id]: e.target.value.toUpperCase() }))}
                                                    onKeyDown={(e) => { if (e.key === 'Enter' && dirty) saveAwb(b.id); }}
                                                    sx={{ flex: 1 }}
                                                    InputProps={{ sx: { fontFamily: 'monospace' } }}
                                                />
                                                <Button
                                                    variant="contained" size="small" disabled={!dirty || savingId === b.id}
                                                    onClick={() => saveAwb(b.id)}
                                                    startIcon={savingId === b.id ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                                                    sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#E55A28' }, minWidth: 100 }}
                                                >
                                                    Guardar
                                                </Button>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {boxes.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                                        <InboxIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                                        <Typography color="text.secondary">No hay cajas TDX en tránsito</Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
                {snack ? <Alert severity={snack.sev} onClose={() => setSnack(null)}>{snack.msg}</Alert> : undefined}
            </Snackbar>
        </Box>
    );
}
