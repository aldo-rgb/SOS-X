// ============================================
// ASIGNACIÓN DE CLIENTE A PAQUETES SIN CLIENTE
// Lista paquetes PO Box sin cliente y permite asignar
// buscando en users + legacy_clients por nombre/email/casillero.
// Paleta: naranja, negro, blanco
// ============================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    InputAdornment,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    Assignment as AssignmentIcon,
    Refresh as RefreshIcon,
    Search as SearchIcon,
    Person as PersonIcon,
    Close as CloseIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ORANGE = '#F05A28';
const BLACK = '#1A1A1A';
const RED = '#D32F2F';

interface UnassignedPackage {
    id: number;
    tracking: string;
    description?: string;
    weight?: number | null;
    status: string;
    statusLabel?: string;
    arrivalDate: string;
    daysInWarehouse: number;
    currentBoxId?: string | null;
    legacyMatch?: { name: string; boxId: string } | null;
}

interface ClientResult {
    source: 'users' | 'legacy';
    id: number;
    fullName: string;
    email: string | null;
    boxId: string;
    phone: string | null;
}

interface Props {
    onBack: () => void;
}

const STATUS_COLORS: Record<string, string> = {
    received: '#1976D2',
    processing: '#F9A825',
    in_transit: ORANGE,
    received_mty: '#2E7D32',
    ready_pickup: '#0097A7',
    shipped: '#7B1FA2',
};

function authHeaders() {
    const token = localStorage.getItem('token') || '';
    return { Authorization: `Bearer ${token}` };
}

function formatDate(iso: string): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('es-MX', {
            day: '2-digit', month: 'short', year: 'numeric',
        });
    } catch {
        return iso;
    }
}

function daysColor(days: number): string {
    if (days >= 14) return RED;
    if (days >= 7) return ORANGE;
    if (days >= 3) return '#F9A825';
    return '#2E7D32';
}

export default function AssignClientPage({ onBack }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [packages, setPackages] = useState<UnassignedPackage[]>([]);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);

    // Dialog asignación
    const [assignTarget, setAssignTarget] = useState<UnassignedPackage | null>(null);
    const [clientQuery, setClientQuery] = useState('');
    const [clientResults, setClientResults] = useState<ClientResult[]>([]);
    const [searchingClients, setSearchingClients] = useState(false);
    const [assigning, setAssigning] = useState(false);
    const [assignError, setAssignError] = useState<string | null>(null);
    const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await axios.get(`${API_URL}/api/packages/unassigned`, { headers: authHeaders() });
            setPackages(res.data.packages || []);
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } }; message?: string };
            setError(err?.response?.data?.error || err?.message || 'Error al cargar paquetes');
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return packages;
        return packages.filter((p) => {
            const hay = [p.tracking, p.description, p.currentBoxId, p.legacyMatch?.name]
                .filter(Boolean).join(' ').toLowerCase();
            return hay.includes(term);
        });
    }, [packages, search]);

    const paged = filtered.slice(page * pageSize, page * pageSize + pageSize);

    // Buscar clientes con debounce
    useEffect(() => {
        if (!assignTarget) return;
        const q = clientQuery.trim();
        if (q.length < 2) { setClientResults([]); return; }
        setSearchingClients(true);
        const t = setTimeout(async () => {
            try {
                const res = await axios.get(`${API_URL}/api/packages/search-clients`, {
                    params: { q },
                    headers: authHeaders(),
                });
                setClientResults(res.data.results || []);
            } catch {
                setClientResults([]);
            } finally {
                setSearchingClients(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [clientQuery, assignTarget]);

    const openAssign = (pkg: UnassignedPackage) => {
        setAssignTarget(pkg);
        setAssignError(null);
        setAssignSuccess(null);
        setClientResults([]);
        setClientQuery(pkg.legacyMatch?.boxId || pkg.currentBoxId || '');
    };

    const closeAssign = () => {
        setAssignTarget(null);
        setClientQuery('');
        setClientResults([]);
        setAssignError(null);
    };

    const doAssign = async (client: ClientResult) => {
        if (!assignTarget) return;
        setAssigning(true); setAssignError(null);
        try {
            const res = await axios.patch(
                `${API_URL}/api/packages/${assignTarget.id}/client`,
                { boxId: client.boxId },
                { headers: authHeaders() }
            );
            setAssignSuccess(res.data?.message || `Cliente asignado: ${client.fullName}`);
            // Quitar el paquete de la lista local
            setPackages((prev) => prev.filter((p) => p.id !== assignTarget.id));
            setTimeout(closeAssign, 800);
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } }; message?: string };
            setAssignError(err?.response?.data?.error || err?.message || 'Error al asignar cliente');
        } finally { setAssigning(false); }
    };

    // Stats
    const stats = useMemo(() => {
        const total = packages.length;
        let urgent = 0, mid = 0, recent = 0;
        for (const p of packages) {
            if (p.daysInWarehouse >= 14) urgent++;
            else if (p.daysInWarehouse >= 7) mid++;
            else recent++;
        }
        return { total, urgent, mid, recent };
    }, [packages]);

    return (
        <Box sx={{ p: 3, maxWidth: 1500, mx: 'auto' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <IconButton onClick={onBack} size="small"><ArrowBackIcon /></IconButton>
                <AssignmentIcon sx={{ color: ORANGE }} />
                <Typography variant="h5" sx={{ fontWeight: 700, color: ORANGE, flex: 1 }}>
                    Asignar Cliente · Paquetes sin asignar
                </Typography>
                <IconButton onClick={load} size="small"><RefreshIcon /></IconButton>
            </Stack>

            <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }}>
                <StatCard label="Total sin cliente" value={stats.total} color={BLACK} />
                <StatCard label="≥ 14 días (urgente)" value={stats.urgent} color={RED} />
                <StatCard label="7-13 días" value={stats.mid} color={ORANGE} />
                <StatCard label="< 7 días" value={stats.recent} color="#2E7D32" />
            </Stack>

            <Paper sx={{ p: 2, mb: 2 }}>
                <TextField
                    size="small"
                    fullWidth
                    placeholder="Buscar por tracking, descripción, casillero…"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                    InputProps={{
                        startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
                    }}
                />
            </Paper>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

            <Paper>
                {loading && (
                    <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress sx={{ color: ORANGE }} /></Box>
                )}
                {!loading && (
                    <TableContainer>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Tracking</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Descripción</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }} align="right">Peso (kg)</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Estado</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Casillero</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Llegada bodega</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }} align="center">Días</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }} align="center">Acción</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {paged.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} sx={{ textAlign: 'center', py: 4 }}>
                                            <Typography color="text.secondary">
                                                {packages.length === 0 ? '🎉 No hay paquetes sin cliente' : 'Sin resultados'}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : paged.map((p) => {
                                    const stColor = STATUS_COLORS[p.status] || '#757575';
                                    return (
                                        <TableRow key={p.id} hover>
                                            <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, color: ORANGE }}>
                                                {p.tracking}
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ maxWidth: 280 }} noWrap>
                                                    {p.description || '—'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                {p.weight ? Number(p.weight).toFixed(2) : '—'}
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={p.statusLabel || p.status}
                                                    size="small"
                                                    sx={{ bgcolor: stColor, color: '#FFF', fontWeight: 600 }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                {p.currentBoxId ? (
                                                    <Chip
                                                        label={p.currentBoxId}
                                                        size="small"
                                                        sx={{ bgcolor: BLACK, color: '#FFF', fontWeight: 700 }}
                                                    />
                                                ) : '—'}
                                                {p.legacyMatch && (
                                                    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                                                        Sin Usuario: {p.legacyMatch.name}
                                                    </Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>{formatDate(p.arrivalDate)}</TableCell>
                                            <TableCell align="center">
                                                <Chip
                                                    label={`${p.daysInWarehouse} d`}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: daysColor(p.daysInWarehouse),
                                                        color: '#FFF',
                                                        fontWeight: 700,
                                                        minWidth: 50,
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell align="center">
                                                <Button
                                                    variant="contained"
                                                    size="small"
                                                    startIcon={<PersonIcon />}
                                                    onClick={() => openAssign(p)}
                                                    sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#C1272D' } }}
                                                >
                                                    Asignar
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
                <TablePagination
                    component="div"
                    count={filtered.length}
                    page={page}
                    onPageChange={(_, p) => setPage(p)}
                    rowsPerPage={pageSize}
                    onRowsPerPageChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}
                    rowsPerPageOptions={[25, 50, 100, 200]}
                    labelRowsPerPage="Filas por página"
                />
            </Paper>

            {/* Dialog asignación */}
            <Dialog open={!!assignTarget} onClose={closeAssign} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ bgcolor: ORANGE, color: '#FFF', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PersonIcon /> Asignar cliente a paquete
                    <Box sx={{ flex: 1 }} />
                    <IconButton size="small" onClick={closeAssign} sx={{ color: '#FFF' }}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ pt: 2 }}>
                    {assignTarget && (
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="caption" color="text.secondary">Tracking</Typography>
                            <Typography variant="h6" sx={{ fontFamily: 'monospace', color: ORANGE, fontWeight: 700 }}>
                                {assignTarget.tracking}
                            </Typography>
                            {assignTarget.description && (
                                <Typography variant="body2" color="text.secondary">
                                    {assignTarget.description}
                                </Typography>
                            )}
                            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                <Chip
                                    size="small"
                                    label={`${assignTarget.daysInWarehouse} días en bodega`}
                                    sx={{ bgcolor: daysColor(assignTarget.daysInWarehouse), color: '#FFF', fontWeight: 700 }}
                                />
                                <Chip size="small" label={`Recibido ${formatDate(assignTarget.arrivalDate)}`} variant="outlined" />
                            </Stack>
                        </Box>
                    )}

                    <TextField
                        autoFocus
                        fullWidth
                        size="small"
                        label="Buscar cliente (nombre, email o casillero)"
                        value={clientQuery}
                        onChange={(e) => setClientQuery(e.target.value)}
                        placeholder="Ej: S2, juan@example.com, Juan Segura"
                        InputProps={{
                            startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
                            endAdornment: searchingClients
                                ? <InputAdornment position="end"><CircularProgress size={16} /></InputAdornment>
                                : null,
                        }}
                    />

                    {assignError && <Alert severity="error" sx={{ mt: 2 }}>{assignError}</Alert>}
                    {assignSuccess && <Alert severity="success" sx={{ mt: 2 }}>{assignSuccess}</Alert>}

                    <Box sx={{ mt: 2, maxHeight: 360, overflow: 'auto' }}>
                        {clientResults.length === 0 && clientQuery.trim().length >= 2 && !searchingClients && (
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                                Sin coincidencias
                            </Typography>
                        )}
                        <Stack spacing={1}>
                            {clientResults.map((c) => (
                                <Paper
                                    key={`${c.source}-${c.id}`}
                                    variant="outlined"
                                    sx={{
                                        p: 1.5,
                                        cursor: 'pointer',
                                        '&:hover': { borderColor: ORANGE, bgcolor: '#FFF3E0' },
                                    }}
                                    onClick={() => !assigning && doAssign(c)}
                                >
                                    <Stack direction="row" alignItems="center" spacing={2}>
                                        <Box sx={{ flex: 1 }}>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <Typography variant="body1" fontWeight={600}>
                                                    {c.fullName}
                                                </Typography>
                                                <Chip
                                                    size="small"
                                                    label={c.source === 'users' ? 'Cliente' : 'Legacy'}
                                                    color={c.source === 'users' ? 'primary' : 'default'}
                                                />
                                            </Stack>
                                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                                                <Chip
                                                    size="small"
                                                    label={c.boxId}
                                                    sx={{ bgcolor: BLACK, color: '#FFF', fontWeight: 700 }}
                                                />
                                                {c.email && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        {c.email}
                                                    </Typography>
                                                )}
                                                {c.phone && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        · {c.phone}
                                                    </Typography>
                                                )}
                                            </Stack>
                                        </Box>
                                        <Button
                                            variant="contained"
                                            size="small"
                                            disabled={assigning}
                                            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#C1272D' } }}
                                        >
                                            {assigning ? <CircularProgress size={16} sx={{ color: '#FFF' }} /> : 'Asignar'}
                                        </Button>
                                    </Stack>
                                </Paper>
                            ))}
                        </Stack>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeAssign}>Cerrar</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <Paper sx={{ p: 2, minWidth: 150, borderLeft: `4px solid ${color}`, flex: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
                {label}
            </Typography>
            <Typography variant="h4" sx={{ color, fontWeight: 700 }}>
                {value.toLocaleString()}
            </Typography>
        </Paper>
    );
}
