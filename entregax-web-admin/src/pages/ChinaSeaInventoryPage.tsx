// ============================================
// INVENTARIO MARÍTIMO CHINA
// Lista maritime_orders con filtros (contenedor/BL/referencia)
// ============================================

import { useState, useEffect, useCallback } from 'react';
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
    Tooltip,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    Refresh as RefreshIcon,
    Inventory2 as InventoryIcon,
    Warning as WarningIcon,
} from '@mui/icons-material';
import api from '../services/api';

interface InvOrder {
    id: number;
    ordersn: string;
    shipping_mark: string | null;
    goods_name: string | null;
    goods_num: number | null;
    summary_boxes: number | null;
    weight: string | number | null;
    volume: string | number | null;
    status: string;
    container_id: number | null;
    container_number: string | null;
    bl_number: string | null;
    reference_code: string | null;
    container_received_at: string | null;
    order_received_at: string | null;
    missing_on_arrival: boolean;
    user_box_id: string | null;
    user_name: string | null;
    created_at: string | null;
    updated_at: string | null;
    delivered_at: string | null;
}

interface Stats {
    total: number;
    received_china: number;
    in_transit: number;
    received_cdmx: number;
    received_cedis?: number;
    customs: number;
    delivered: number;
    missing: number;
}

interface Props {
    onBack: () => void;
}

const TEAL = '#0097A7';
const BLACK = '#1A1A1A';
const RED = '#E53935';
const ORANGE = '#FF6B35';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    pending_api: { label: 'Pendiente API', color: '#9E9E9E' },
    received_china: { label: 'Recibido en China', color: '#1976D2' },
    in_transit: { label: 'En tránsito', color: ORANGE },
    customs_cleared: { label: 'Aduana liberada', color: '#7B1FA2' },
    customs_mx: { label: 'Aduana MX', color: '#7B1FA2' },
    received_cdmx: { label: 'Recibido en CDMX', color: '#2E7D32' },
    delivered: { label: 'Entregado', color: '#424242' },
};

export default function ChinaSeaInventoryPage({ onBack }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [orders, setOrders] = useState<InvOrder[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [total, setTotal] = useState(0);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [containerFilter, setContainerFilter] = useState<string>('');
    const [dayFilter, setDayFilter] = useState<string>('');
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const params: Record<string, string | number> = { limit: pageSize, offset: page * pageSize };
            if (search.trim()) params.search = search.trim();
            if (statusFilter !== 'all') params.status = statusFilter;
            if (containerFilter.trim()) params.container = containerFilter.trim();
            if (dayFilter) params.day = dayFilter;

            const res = await api.get('/admin/china-sea/inventory', { params });
            setOrders(res.data.orders || []);
            setTotal(res.data.total || 0);
            setStats(res.data.stats || null);
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } }; message?: string };
            setError(err.response?.data?.error || err.message || 'Error');
        } finally { setLoading(false); }
    }, [page, pageSize, statusFilter, containerFilter, dayFilter, search]);

    useEffect(() => {
        const t = setTimeout(load, 350);
        return () => clearTimeout(t);
    }, [load]);

    return (
        <Box sx={{ p: 3, maxWidth: 1500, mx: 'auto' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <IconButton onClick={onBack} size="small"><ArrowBackIcon /></IconButton>
                <InventoryIcon sx={{ color: TEAL }} />
                <Typography variant="h5" sx={{ fontWeight: 700, color: TEAL, flex: 1 }}>
                    Inventario · TDI Marítimo China
                </Typography>
                <IconButton onClick={load} size="small"><RefreshIcon /></IconButton>
            </Stack>

            {stats && (
                <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }}>
                    <StatCard label="En China" value={stats.received_china} color="#1976D2"
                        active={statusFilter === 'received_china'}
                        onClick={() => { setStatusFilter(statusFilter === 'received_china' ? 'all' : 'received_china'); setPage(0); }} />
                    <StatCard label="En tránsito" value={stats.in_transit} color={ORANGE}
                        active={statusFilter === 'in_transit'}
                        onClick={() => { setStatusFilter(statusFilter === 'in_transit' ? 'all' : 'in_transit'); setPage(0); }} />
                    <StatCard label="Aduana" value={stats.customs} color="#7B1FA2"
                        active={statusFilter === 'customs_cleared'}
                        onClick={() => { setStatusFilter(statusFilter === 'customs_cleared' ? 'all' : 'customs_cleared'); setPage(0); }} />
                    <StatCard
                        label="Recibidos CEDIS"
                        value={Number(stats.received_cedis || 0) || Number(stats.received_cdmx || 0)}
                        color="#2E7D32"
                        active={statusFilter === 'received_cdmx'}
                        onClick={() => { setStatusFilter(statusFilter === 'received_cdmx' ? 'all' : 'received_cdmx'); setPage(0); }}
                    />
                    <StatCard label="Entregados" value={stats.delivered} color="#424242"
                        active={statusFilter === 'delivered'}
                        onClick={() => { setStatusFilter(statusFilter === 'delivered' ? 'all' : 'delivered'); setPage(0); }} />
                    <StatCard label="Faltantes" value={stats.missing} color={RED}
                        active={statusFilter === 'missing'}
                        onClick={() => { setStatusFilter(statusFilter === 'missing' ? 'all' : 'missing'); setPage(0); }} />
                </Stack>
            )}

            <Paper sx={{ p: 2, mb: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <TextField
                        size="small"
                        label="Buscar (orden, shipping mark, mercancía, cliente)"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                        sx={{ flex: 2 }}
                    />
                    <TextField
                        size="small"
                        label="Filtrar por contenedor / BL / referencia"
                        value={containerFilter}
                        onChange={(e) => { setContainerFilter(e.target.value); setPage(0); }}
                        sx={{ flex: 1 }}
                    />
                    <TextField
                        size="small"
                        label="Día"
                        type="date"
                        value={dayFilter}
                        onChange={(e) => { setDayFilter(e.target.value); setPage(0); }}
                        InputLabelProps={{ shrink: true }}
                        sx={{ minWidth: 170 }}
                    />
                    <FormControl size="small" sx={{ minWidth: 220 }}>
                        <InputLabel>Estado</InputLabel>
                        <Select label="Estado" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
                            <MenuItem value="all">Todos</MenuItem>
                            <MenuItem value="received_china">Recibido en China</MenuItem>
                            <MenuItem value="in_transit">En tránsito</MenuItem>
                            <MenuItem value="customs_cleared">Aduana liberada</MenuItem>
                            <MenuItem value="customs_mx">Aduana MX</MenuItem>
                            <MenuItem value="received_cdmx">Recibido en CDMX</MenuItem>
                            <MenuItem value="delivered">Entregado</MenuItem>
                            <MenuItem value="missing">Solo faltantes</MenuItem>
                        </Select>
                    </FormControl>
                </Stack>
            </Paper>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

            <Paper>
                {loading && (
                    <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress sx={{ color: TEAL }} /></Box>
                )}
                {!loading && (
                    <TableContainer>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Orden</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Referencia / BL</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Contenedor</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Cliente</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }} align="center">Cajas por log</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }} align="right">Peso (kg)</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }} align="right">CBM</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Estado</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Recibido CEDIS</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {orders.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} sx={{ textAlign: 'center', py: 4 }}>
                                            <Typography color="text.secondary">Sin resultados</Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : orders.map((o) => {
                                    const meta = STATUS_LABELS[o.status] || { label: o.status, color: '#757575' };
                                    return (
                                        <TableRow key={o.id} hover>
                                            <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                                {o.ordersn}
                                                {o.missing_on_arrival && (
                                                    <Tooltip title="Marcada como faltante/retrasada en recepción">
                                                        <WarningIcon sx={{ color: RED, fontSize: 16, ml: 0.5, verticalAlign: 'middle' }} />
                                                    </Tooltip>
                                                )}
                                                {o.shipping_mark && (
                                                    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                                                        SM: {o.shipping_mark}
                                                    </Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {o.reference_code && (
                                                    <Chip label={o.reference_code} size="small" sx={{ bgcolor: TEAL, color: '#FFF', fontFamily: 'monospace', mb: 0.3 }} />
                                                )}
                                                {o.bl_number && (
                                                    <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace' }}>
                                                        BL {o.bl_number}
                                                    </Typography>
                                                )}
                                            </TableCell>
                                            <TableCell sx={{ fontFamily: 'monospace' }}>
                                                {o.container_number || '—'}
                                            </TableCell>
                                            <TableCell>
                                                {o.user_box_id && (
                                                    <Chip label={o.user_box_id} size="small" sx={{ bgcolor: BLACK, color: '#FFF', mr: 0.5 }} />
                                                )}
                                                <Typography variant="caption">{o.user_name || '—'}</Typography>
                                            </TableCell>
                                            <TableCell align="center" sx={{ fontWeight: 700 }}>
                                                {Number(o.summary_boxes || o.goods_num || 0) || 0}
                                            </TableCell>
                                            <TableCell align="right">{Number(o.weight || 0).toFixed(2)}</TableCell>
                                            <TableCell align="right">{Number(o.volume || 0).toFixed(3)}</TableCell>
                                            <TableCell>
                                                <Chip label={meta.label} size="small" sx={{ bgcolor: meta.color, color: '#FFF', fontWeight: 600 }} />
                                            </TableCell>
                                            <TableCell>
                                                {(o.order_received_at || o.container_received_at)
                                                    ? new Date(o.order_received_at || o.container_received_at || '').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
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
                    count={total}
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

function StatCard({ label, value, color, active, onClick }: { label: string; value: number; color: string; active?: boolean; onClick?: () => void }) {
    return (
        <Paper
            onClick={onClick}
            sx={{
                p: 2, minWidth: 130, borderLeft: `4px solid ${color}`, flex: 1,
                cursor: onClick ? 'pointer' : 'default',
                bgcolor: active ? `${color}18` : 'background.paper',
                outline: active ? `2px solid ${color}` : 'none',
                transition: 'all 0.15s',
                '&:hover': onClick ? { bgcolor: `${color}12`, transform: 'translateY(-1px)', boxShadow: 3 } : {},
            }}
        >
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
                {label}
            </Typography>
            <Typography variant="h5" sx={{ color, fontWeight: 700 }}>
                {value.toLocaleString()}
            </Typography>
        </Paper>
    );
}
