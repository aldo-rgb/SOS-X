// ============================================
// INVENTARIO PO BOX USA
// Lista paquetes PO Box con filtros y stats
// Paleta: naranja, negro, blanco, rojo
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box,
    Typography,
    Paper,
    TextField,
    Stack,
    Chip,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    TableContainer,
    TablePagination,
    MenuItem,
    Select,
    FormControl,
    InputLabel,
    IconButton,
    CircularProgress,
    Alert,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    Refresh as RefreshIcon,
    Inventory2 as InventoryIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const ORANGE = '#F05A28';
const BLACK = '#1A1A1A';

interface InventoryPackage {
    id: number;
    tracking: string;
    description: string;
    weight?: number;
    status: string;
    statusLabel?: string;
    receivedAt: string;
    deliveredAt?: string;
    consolidationId?: number;
    client: {
        id: number;
        name: string;
        email: string;
        boxId: string;
    };
    dimensions?: {
        length: number | null;
        width: number | null;
        height: number | null;
    };
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    received: { label: 'Recibido CEDIS HIDALGO TX', color: '#1976D2' },
    processing: { label: 'Procesando', color: '#F9A825' },
    in_transit: { label: 'En tránsito a MTY', color: ORANGE },
    received_mty: { label: 'Recibido CEDIS MTY', color: '#2E7D32' },
    ready_pickup: { label: 'En Ruta', color: '#0097A7' },
    shipped: { label: 'Enviado', color: '#7B1FA2' },
    delivered: { label: 'Entregado', color: '#424242' },
};

interface Props {
    onBack: () => void;
}

export default function POBoxInventoryPage({ onBack }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [packages, setPackages] = useState<InventoryPackage[]>([]);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const token = localStorage.getItem('token') || '';
            const params = new URLSearchParams();
            params.append('limit', '1000');
            const res = await axios.get(`${API_URL}/api/packages?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setPackages(res.data.packages || []);
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } }; message?: string };
            setError(err.response?.data?.error || err.message || 'Error');
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Stats globales (sobre el set completo, ignoran filtros)
    const stats = useMemo(() => {
        const s = {
            total: packages.length,
            received: 0,
            in_transit: 0,
            received_mty: 0,
            ready_pickup: 0,
            delivered: 0,
        };
        for (const p of packages) {
            switch (p.status) {
                case 'received': s.received++; break;
                case 'in_transit': s.in_transit++; break;
                case 'received_mty': s.received_mty++; break;
                case 'ready_pickup': s.ready_pickup++; break;
                case 'delivered': s.delivered++; break;
            }
        }
        return s;
    }, [packages]);

    // Filtrado client-side
    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return packages.filter((p) => {
            if (statusFilter !== 'all' && p.status !== statusFilter) return false;
            if (!term) return true;
            const hay = [
                p.tracking,
                p.description,
                p.client?.name,
                p.client?.email,
                p.client?.boxId,
            ].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(term);
        });
    }, [packages, statusFilter, search]);

    const paged = filtered.slice(page * pageSize, page * pageSize + pageSize);

    return (
        <Box sx={{ p: 3, maxWidth: 1500, mx: 'auto' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <IconButton onClick={onBack} size="small"><ArrowBackIcon /></IconButton>
                <InventoryIcon sx={{ color: ORANGE }} />
                <Typography variant="h5" sx={{ fontWeight: 700, color: ORANGE, flex: 1 }}>
                    Inventario · PO Box USA
                </Typography>
                <IconButton onClick={load} size="small"><RefreshIcon /></IconButton>
            </Stack>

            <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }}>
                <StatCard label="Total" value={stats.total} color={BLACK} />
                <StatCard label="Recibido HIDALGO" value={stats.received} color="#1976D2" />
                <StatCard label="En tránsito" value={stats.in_transit} color={ORANGE} />
                <StatCard label="Recibido CEDIS MTY" value={stats.received_mty} color="#2E7D32" />
                <StatCard label="En Ruta" value={stats.ready_pickup} color="#0097A7" />
                <StatCard label="Entregados" value={stats.delivered} color="#424242" />
            </Stack>

            <Paper sx={{ p: 2, mb: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <TextField
                        size="small"
                        label="Buscar (tracking, cliente, casillero, descripción)"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                        sx={{ flex: 2 }}
                    />
                    <FormControl size="small" sx={{ minWidth: 240 }}>
                        <InputLabel>Estado</InputLabel>
                        <Select label="Estado" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
                            <MenuItem value="all">Todos</MenuItem>
                            <MenuItem value="received">Recibido CEDIS HIDALGO TX</MenuItem>
                            <MenuItem value="processing">Procesando</MenuItem>
                            <MenuItem value="in_transit">En tránsito a MTY</MenuItem>
                            <MenuItem value="received_mty">Recibido CEDIS MTY</MenuItem>
                            <MenuItem value="ready_pickup">En Ruta</MenuItem>
                            <MenuItem value="shipped">Enviado</MenuItem>
                            <MenuItem value="delivered">Entregado</MenuItem>
                        </Select>
                    </FormControl>
                </Stack>
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
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Cliente</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Casillero</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }} align="right">Peso (kg)</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Dimensiones</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Estado</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Consolidación</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Recibido</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {paged.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} sx={{ textAlign: 'center', py: 4 }}>
                                            <Typography color="text.secondary">Sin resultados</Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : paged.map((p) => {
                                    const meta = STATUS_LABELS[p.status] || { label: p.statusLabel || p.status, color: '#757575' };
                                    const dim = p.dimensions;
                                    const dimStr = dim?.length && dim?.width && dim?.height
                                        ? `${dim.length}×${dim.width}×${dim.height} cm`
                                        : '—';
                                    return (
                                        <TableRow key={p.id} hover>
                                            <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, color: ORANGE }}>
                                                {p.tracking}
                                                {p.description && (
                                                    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontFamily: 'inherit' }}>
                                                        {p.description}
                                                    </Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.client?.name || '—'}</Typography>
                                                <Typography variant="caption" color="text.secondary">{p.client?.email}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                {p.client?.boxId ? (
                                                    <Chip label={p.client.boxId} size="small" sx={{ bgcolor: BLACK, color: '#FFF', fontWeight: 700 }} />
                                                ) : '—'}
                                            </TableCell>
                                            <TableCell align="right">{p.weight ? Number(p.weight).toFixed(2) : '—'}</TableCell>
                                            <TableCell>{dimStr}</TableCell>
                                            <TableCell>
                                                <Chip label={meta.label} size="small" sx={{ bgcolor: meta.color, color: '#FFF', fontWeight: 600 }} />
                                            </TableCell>
                                            <TableCell>
                                                {p.consolidationId ? (
                                                    <Chip label={`#${p.consolidationId}`} size="small" variant="outlined" sx={{ borderColor: ORANGE, color: ORANGE, fontWeight: 700 }} />
                                                ) : '—'}
                                            </TableCell>
                                            <TableCell>
                                                {p.receivedAt
                                                    ? new Date(p.receivedAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
                                                    : '—'}
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
        </Box>
    );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <Paper sx={{ p: 2, minWidth: 130, borderLeft: `4px solid ${color}`, flex: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
                {label}
            </Typography>
            <Typography variant="h5" sx={{ color, fontWeight: 700 }}>
                {value.toLocaleString()}
            </Typography>
        </Paper>
    );
}
