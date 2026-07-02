// ============================================
// ACTUALIZAR GUÍA AWB DHL
// Lista los envíos TDX (DHL Express) en tránsito — master con sus cajas hijas
// anidadas — y permite asignar el AWB al master (se propaga a todas sus cajas y
// aparece en el Inventario TDX).
// ============================================
import { useState, useEffect, useCallback } from 'react';
import {
    Box, Paper, Typography, IconButton, Stack, TextField, Button, Chip,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    CircularProgress, Snackbar, Alert, InputAdornment, Collapse,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    FlightTakeoff as FlightTakeoffIcon,
    Refresh as RefreshIcon,
    Save as SaveIcon,
    QrCode2 as QrCodeIcon,
    Inbox as InboxIcon,
    KeyboardArrowDown as ArrowDownIcon,
    KeyboardArrowUp as ArrowUpIcon,
    Inventory2 as BoxIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ORANGE = '#FF6B35';
const BLACK = '#1A1A1A';
const DHL_YELLOW = '#FFCC00';

interface Child {
    id: number;
    tracking_internal: string;
    box_number: number;
    weight: string | number | null;
    air_chargeable_weight: string | number | null;
    dimensions: string | null;
    awb: string | null;
}
interface InTransitMaster {
    id: number;
    tracking_internal: string;
    box_id: string | null;
    total_boxes: number | null;
    weight: string | number | null;
    air_chargeable_weight: string | number | null;
    description: string | null;
    awb: string | null;
    client_name: string | null;
    children: Child[];
}

interface Props { onBack: () => void; }

export default function TdiAwbUpdatePage({ onBack }: Props) {
    const token = localStorage.getItem('token');
    const authHeaders = { Authorization: `Bearer ${token}` };

    const [loading, setLoading] = useState(false);
    const [masters, setMasters] = useState<InTransitMaster[]>([]);
    const [search, setSearch] = useState('');
    const [drafts, setDrafts] = useState<Record<number, string>>({});
    const [expanded, setExpanded] = useState<Record<number, boolean>>({});
    const [savingId, setSavingId] = useState<number | null>(null);
    const [snack, setSnack] = useState<{ sev: 'success' | 'error'; msg: string } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/tdi-express/in-transit`, {
                headers: authHeaders, params: { search: search || undefined },
            });
            const rows: InTransitMaster[] = res.data.masters || [];
            setMasters(rows);
            const init: Record<number, string> = {};
            rows.forEach((m) => { init[m.id] = m.awb || ''; });
            setDrafts(init);
        } catch {
            setSnack({ sev: 'error', msg: 'Error al cargar envíos en tránsito' });
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    useEffect(() => { load(); }, [load]);

    const saveAwb = async (masterId: number) => {
        const awb = (drafts[masterId] || '').trim().toUpperCase();
        setSavingId(masterId);
        try {
            await axios.patch(`${API_URL}/api/tdi-express/${masterId}/awb`, { awb }, { headers: authHeaders });
            setMasters((prev) => prev.map((m) => (m.id === masterId
                ? { ...m, awb: awb || null, children: m.children.map((c) => ({ ...c, awb: awb || null })) }
                : m)));
            setSnack({ sev: 'success', msg: awb ? `AWB asignado a todas las cajas del envío` : 'AWB removido' });
        } catch (e: any) {
            setSnack({ sev: 'error', msg: e?.response?.data?.error || 'Error al guardar AWB' });
        } finally {
            setSavingId(null);
        }
    };

    const fmtDims = (d?: string | null) => (d ? String(d).replace(/\.00/g, '').replace(/—/g, '').trim() : '—');

    return (
        <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
            {/* Header */}
            <Paper sx={{ p: 3, mb: 3, background: `linear-gradient(135deg, ${BLACK} 0%, #2A2A2A 100%)`, color: '#FFF' }}>
                <Stack direction="row" alignItems="center" spacing={2}>
                    <IconButton onClick={onBack} sx={{ color: '#FFF' }}><ArrowBackIcon /></IconButton>
                    <FlightTakeoffIcon sx={{ fontSize: 40, color: DHL_YELLOW }} />
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="overline" sx={{ color: DHL_YELLOW, fontWeight: 700, letterSpacing: 2 }}>DHL EXPRESS</Typography>
                        <Typography variant="h4" sx={{ fontWeight: 800 }}>Actualizar Guía AWB DHL</Typography>
                        <Typography variant="body2" sx={{ color: '#BDBDBD', mt: 0.5 }}>
                            Asigna el AWB a cada envío TDX en tránsito. Se aplica a todas las cajas del envío y aparece en el Inventario TDX.
                        </Typography>
                    </Box>
                    <IconButton onClick={load} sx={{ color: '#FFF' }} disabled={loading}>
                        {loading ? <CircularProgress size={22} sx={{ color: '#FFF' }} /> : <RefreshIcon />}
                    </IconButton>
                </Stack>
            </Paper>

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
                                <TableCell sx={{ color: 'white', fontWeight: 600, width: 40 }} />
                                <TableCell sx={{ color: 'white', fontWeight: 600 }}>ENVÍO (MASTER)</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 600 }}>CLIENTE</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 600 }}>CAJAS</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 600 }}>PESO</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 600, minWidth: 300 }}>AWB (aplica a todas)</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {masters.map((m) => {
                                const draft = drafts[m.id] ?? '';
                                const dirty = (draft || '').trim().toUpperCase() !== (m.awb || '').toUpperCase();
                                const open = !!expanded[m.id];
                                return [
                                    <TableRow key={`m-${m.id}`} hover sx={{ '& td': { borderBottom: open ? 'none' : undefined } }}>
                                        <TableCell>
                                            <IconButton size="small" onClick={() => setExpanded((e) => ({ ...e, [m.id]: !e[m.id] }))}>
                                                {open ? <ArrowUpIcon /> : <ArrowDownIcon />}
                                            </IconButton>
                                        </TableCell>
                                        <TableCell>
                                            <Typography fontWeight={700} color="primary">{m.tracking_internal}</Typography>
                                            {m.description && <Typography variant="caption" color="text.secondary">{m.description}</Typography>}
                                        </TableCell>
                                        <TableCell>
                                            <Chip label={m.box_id || '—'} size="small" sx={{ fontWeight: 600, bgcolor: '#f5f5f5' }} />
                                            {m.client_name && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{m.client_name}</Typography>}
                                        </TableCell>
                                        <TableCell><Chip icon={<BoxIcon sx={{ fontSize: 16 }} />} label={m.children.length} size="small" color="info" variant="outlined" /></TableCell>
                                        <TableCell><Typography fontWeight={500}>{Number(m.air_chargeable_weight || m.weight || 0).toFixed(1)} kg</Typography></TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <TextField
                                                    size="small" placeholder="Número de AWB" value={draft}
                                                    onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: e.target.value.toUpperCase() }))}
                                                    onKeyDown={(e) => { if (e.key === 'Enter' && dirty) saveAwb(m.id); }}
                                                    sx={{ flex: 1 }} InputProps={{ sx: { fontFamily: 'monospace' } }}
                                                />
                                                <Button variant="contained" size="small" disabled={!dirty || savingId === m.id} onClick={() => saveAwb(m.id)}
                                                    startIcon={savingId === m.id ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                                                    sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#E55A28' }, minWidth: 100 }}>Guardar</Button>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>,
                                    <TableRow key={`c-${m.id}`}>
                                        <TableCell colSpan={6} sx={{ py: 0, borderBottom: open ? undefined : 'none' }}>
                                            <Collapse in={open} timeout="auto" unmountOnExit>
                                                <Box sx={{ py: 1, pl: 4, bgcolor: '#fafafa' }}>
                                                    <Table size="small">
                                                        <TableHead>
                                                            <TableRow>
                                                                <TableCell sx={{ fontWeight: 700 }}>Caja</TableCell>
                                                                <TableCell sx={{ fontWeight: 700 }}>Guía</TableCell>
                                                                <TableCell sx={{ fontWeight: 700 }}>Medidas</TableCell>
                                                                <TableCell sx={{ fontWeight: 700 }}>Peso</TableCell>
                                                                <TableCell sx={{ fontWeight: 700 }}>AWB</TableCell>
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            {m.children.map((c) => (
                                                                <TableRow key={c.id}>
                                                                    <TableCell>{c.box_number}</TableCell>
                                                                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 13 }}>{c.tracking_internal}</TableCell>
                                                                    <TableCell>{fmtDims(c.dimensions)}</TableCell>
                                                                    <TableCell>{Number(c.air_chargeable_weight || c.weight || 0).toFixed(1)} kg</TableCell>
                                                                    <TableCell>
                                                                        {c.awb
                                                                            ? <Chip label={c.awb} size="small" color="success" variant="outlined" sx={{ fontFamily: 'monospace' }} />
                                                                            : <Typography variant="caption" color="text.secondary">—</Typography>}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </Box>
                                            </Collapse>
                                        </TableCell>
                                    </TableRow>,
                                ];
                            })}
                            {masters.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                                        <InboxIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                                        <Typography color="text.secondary">No hay envíos TDX en tránsito</Typography>
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
