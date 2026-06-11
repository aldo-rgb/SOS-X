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
    Collapse,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
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
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    Warning as WarningIcon,
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

interface NoInstructionsGuide {
    tracking: string;
    box_id: string | null;
    client_name: string | null;
    status: string;
    created_at: string;
    is_legacy?: boolean;
}

interface ServiceSection {
    serviceType: string;
    label: string;
    guides: NoInstructionsGuide[];
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
    received_china: '#5C6BC0',
    in_warehouse: '#00897B',
    pending_payment: '#E65100',
    paid: '#2E7D32',
};

const SERVICE_ICONS: Record<string, string> = {
    POBOX_USA: '📮',
    TDI_EXPRESS: '✈️',
    AIR_CHN_MX: '✈️',
    SEA_CHN_MX: '🚢',
    AA_DHL: '📦',
    FCL_CHN_MX: '🏗️',
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

// ─── Section: Guías sin instrucciones ───────────────────────────────────────

function NoInstructionsSection({ section }: { section: ServiceSection }) {
    const [open, setOpen] = useState(true);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return section.guides;
        return section.guides.filter(g => {
            const hay = [g.tracking, g.box_id, g.client_name].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(term);
        });
    }, [section.guides, search]);

    const icon = SERVICE_ICONS[section.serviceType] || '📋';
    const hasGuides = section.guides.length > 0;

    return (
        <Paper sx={{ mb: 2 }}>
            <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ px: 2, py: 1.5, cursor: 'pointer', borderBottom: open ? '1px solid #eee' : 'none' }}
                onClick={() => setOpen(o => !o)}
            >
                <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
                    {icon} {section.label}
                </Typography>
                <Chip
                    label={hasGuides ? `${section.guides.length} sin instrucciones` : 'Al día ✓'}
                    size="small"
                    icon={hasGuides ? <WarningIcon /> : undefined}
                    sx={{
                        bgcolor: hasGuides ? '#FFF3E0' : '#E8F5E9',
                        color: hasGuides ? ORANGE : '#2E7D32',
                        fontWeight: 700,
                        border: `1px solid ${hasGuides ? ORANGE : '#2E7D32'}`,
                    }}
                />
                {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </Stack>
            <Collapse in={open}>
                {section.guides.length === 0 ? (
                    <Box sx={{ py: 2, textAlign: 'center' }}>
                        <Typography color="text.secondary">🎉 Todas las guías tienen instrucciones</Typography>
                    </Box>
                ) : (
                    <>
                        <Box sx={{ px: 2, py: 1 }}>
                            <TextField
                                size="small"
                                fullWidth
                                placeholder="Buscar por guía, casillero o cliente…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
                                }}
                            />
                        </Box>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 700, bgcolor: '#F5F5F5' }}>Guía / Tracking</TableCell>
                                        <TableCell sx={{ fontWeight: 700, bgcolor: '#F5F5F5' }}>Casillero</TableCell>
                                        <TableCell sx={{ fontWeight: 700, bgcolor: '#F5F5F5' }}>Cliente</TableCell>
                                        <TableCell sx={{ fontWeight: 700, bgcolor: '#F5F5F5' }}>Estado</TableCell>
                                        <TableCell sx={{ fontWeight: 700, bgcolor: '#F5F5F5' }}>Creado</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filtered.slice(0, 100).map((g, idx) => {
                                        const stColor = STATUS_COLORS[g.status] || '#757575';
                                        return (
                                            <TableRow key={idx} hover>
                                                <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, color: ORANGE, fontSize: '0.8rem' }}>
                                                    {g.tracking || '—'}
                                                </TableCell>
                                                <TableCell>
                                                    {g.box_id ? (
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                            <Chip label={g.box_id} size="small" sx={{ bgcolor: BLACK, color: '#FFF', fontWeight: 700, fontSize: '0.75rem' }} />
                                                            {g.is_legacy && (
                                                                <Chip label="Sin alta" size="small" sx={{ bgcolor: '#E65100', color: '#FFF', fontWeight: 600, fontSize: '0.65rem' }} />
                                                            )}
                                                        </Box>
                                                    ) : <Typography variant="caption" color="text.disabled">—</Typography>}
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                                        {g.client_name || <span style={{ color: '#999' }}>Sin asignar</span>}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Chip label={g.status} size="small" sx={{ bgcolor: stColor, color: '#FFF', fontWeight: 600, fontSize: '0.7rem' }} />
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="caption">{formatDate(g.created_at)}</Typography>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {filtered.length > 100 && (
                                        <TableRow>
                                            <TableCell colSpan={5} sx={{ textAlign: 'center', color: 'text.secondary', py: 1 }}>
                                                … y {filtered.length - 100} más
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </>
                )}
            </Collapse>
        </Paper>
    );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AssignClientPage({ onBack }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [packages, setPackages] = useState<UnassignedPackage[]>([]);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);

    const [noInstructionsServices, setNoInstructionsServices] = useState<ServiceSection[]>([]);
    const [loadingInstructions, setLoadingInstructions] = useState(false);

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

    const loadNoInstructions = useCallback(async () => {
        setLoadingInstructions(true);
        try {
            const res = await axios.get(`${API_URL}/api/cs/no-instructions`, { headers: authHeaders() });
            setNoInstructionsServices(res.data.services || []);
        } catch (e) {
            console.error('Error loading no-instructions:', e);
        } finally { setLoadingInstructions(false); }
    }, []);

    useEffect(() => { load(); loadNoInstructions(); }, [load, loadNoInstructions]);

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
            setPackages((prev) => prev.filter((p) => p.id !== assignTarget.id));
            setTimeout(closeAssign, 800);
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } }; message?: string };
            setAssignError(err?.response?.data?.error || err?.message || 'Error al asignar cliente');
        } finally { setAssigning(false); }
    };

    // Stats — solo cuentan los que realmente necesitan asignación (sin boxId ni legacyMatch)
    const stats = useMemo(() => {
        const needsAssignment = packages.filter(p => !p.currentBoxId && !p.legacyMatch);
        const total = needsAssignment.length;
        let urgent = 0, mid = 0, recent = 0;
        for (const p of needsAssignment) {
            if (p.daysInWarehouse >= 14) urgent++;
            else if (p.daysInWarehouse >= 7) mid++;
            else recent++;
        }
        return { total, urgent, mid, recent };
    }, [packages]);

    const handleRefreshAll = () => { load(); loadNoInstructions(); };

    return (
        <Box sx={{ p: 3, maxWidth: 1500, mx: 'auto' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
                <IconButton onClick={onBack} size="small"><ArrowBackIcon /></IconButton>
                <AssignmentIcon sx={{ color: ORANGE }} />
                <Typography variant="h5" sx={{ fontWeight: 700, color: ORANGE, flex: 1 }}>
                    Asignar Cliente · Centro de Soporte
                </Typography>
                <IconButton onClick={handleRefreshAll} size="small"><RefreshIcon /></IconButton>
            </Stack>

            {/* ─── Sección 1: Paquetes sin asignar ─────────────────────────── */}
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: BLACK }}>
                📦 Paquetes sin asignar
            </Typography>

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

            <Paper sx={{ mb: 4 }}>
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
                                                {!p.currentBoxId && !p.legacyMatch ? (
                                                    <Button
                                                        variant="contained"
                                                        size="small"
                                                        startIcon={<PersonIcon />}
                                                        onClick={() => openAssign(p)}
                                                        sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#C1272D' } }}
                                                    >
                                                        Asignar
                                                    </Button>
                                                ) : (
                                                    <Typography variant="caption" color="text.disabled">—</Typography>
                                                )}
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

            {/* ─── Sección 2+: Guías sin instrucciones por servicio ─────────── */}
            <Divider sx={{ mb: 3 }} />
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: BLACK, flex: 1 }}>
                    🗺️ Guías sin instrucciones de entrega por servicio
                </Typography>
                {loadingInstructions && <CircularProgress size={20} sx={{ color: ORANGE }} />}
            </Stack>

            {noInstructionsServices.map(section => (
                <NoInstructionsSection key={section.serviceType} section={section} />
            ))}

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
