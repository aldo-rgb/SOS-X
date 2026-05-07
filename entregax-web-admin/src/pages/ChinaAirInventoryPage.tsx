// ============================================
// INVENTARIO AÉREO CHINA
// Lista paquetes service_type=AIR_CHN_MX con filtros
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

interface InvPackage {
    id: number;
    tracking_internal: string;
    international_tracking: string | null;
    awb_number: string | null;
    awb_id: number | null;
    status: string;
    description: string | null;
    weight: string | number | null;
    dimensions: string | null;
    received_at: string | null;
    missing_on_arrival: boolean;
    user_box_id: string | null;
    user_name: string | null;
}

interface Stats {
    total: number;
    in_warehouse: number;
    waiting_customs_gz: number;
    received_china: number;
    in_transit: number;
    missing: number;
}

interface Props {
    onBack: () => void;
}

const ORANGE = '#FF6B35';
const BLACK = '#1A1A1A';
const RED = '#E53935';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    received_china: { label: 'Recibido en China', color: '#1976D2' },
    in_transit: { label: 'En tránsito', color: ORANGE },
    in_customs_gz: { label: 'En aduana GZ', color: '#7B1FA2' },
    received_mty: { label: 'En bodega MTY', color: '#2E7D32' },
    customs_clearance: { label: 'Aduana', color: '#7B1FA2' },
    in_warehouse: { label: 'En bodega', color: '#2E7D32' },
    delivered: { label: 'Entregado', color: '#424242' },
};

export default function ChinaAirInventoryPage({ onBack }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [packages, setPackages] = useState<InvPackage[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [total, setTotal] = useState(0);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [awbFilter, setAwbFilter] = useState<string>('');
    const [dayFilter, setDayFilter] = useState<string>('');
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, string | number> = {
                limit: pageSize,
                offset: page * pageSize,
            };
            if (search.trim()) params.search = search.trim();
            if (statusFilter !== 'all') params.status = statusFilter;
            if (awbFilter.trim()) params.awb = awbFilter.trim();
            if (dayFilter.trim()) params.day = dayFilter.trim();

            const res = await api.get('/admin/china-air/inventory', { params });
            setPackages(res.data.packages || []);
            setTotal(res.data.total || 0);
            setStats(res.data.stats || null);
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } }; message?: string };
            setError(err.response?.data?.error || err.message || 'Error');
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, statusFilter, awbFilter, search, dayFilter]);

    useEffect(() => {
        const t = setTimeout(load, 350);
        return () => clearTimeout(t);
    }, [load]);

    return (
        <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <IconButton onClick={onBack} size="small">
                    <ArrowBackIcon />
                </IconButton>
                <InventoryIcon sx={{ color: ORANGE }} />
                <Typography variant="h5" sx={{ fontWeight: 700, color: ORANGE, flex: 1 }}>
                    Inventario · TDI Aéreo China
                </Typography>
                <IconButton onClick={load} size="small">
                    <RefreshIcon />
                </IconButton>
            </Stack>

            {/* Stats: layout simétrico en grid con colores oficiales (naranja/negro/blanco/rojo) */}
            {stats && (
                <Box sx={{ mb: 2 }}>
                    {/* Fila principal: 2 cards grandes simétricos */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2 }}>
                        <BigStatCard
                            label="Guías en Bodega"
                            sublabel="Escaneadas en recepción manual"
                            value={stats.in_warehouse}
                            variant="black"
                            active={statusFilter === 'in_warehouse'}
                            onClick={() => { setStatusFilter(statusFilter === 'in_warehouse' ? 'all' : 'in_warehouse'); setPage(0); }}
                        />
                        <BigStatCard
                            label="Guías en Espera"
                            sublabel="Status Por llegar a CEDIS"
                            value={stats.waiting_customs_gz}
                            variant="orange"
                            active={statusFilter === 'waiting_customs_gz'}
                            onClick={() => { setStatusFilter(statusFilter === 'waiting_customs_gz' ? 'all' : 'waiting_customs_gz'); setPage(0); }}
                        />
                    </Box>
                    {/* Fila secundaria: 3 cards simétricos */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
                        <MiniStatCard label="En China" value={stats.received_china} color={BLACK}
                            active={statusFilter === 'received_china'}
                            onClick={() => { setStatusFilter(statusFilter === 'received_china' ? 'all' : 'received_china'); setPage(0); }} />
                        <MiniStatCard label="En tránsito" value={stats.in_transit} color={ORANGE}
                            active={statusFilter === 'in_transit'}
                            onClick={() => { setStatusFilter(statusFilter === 'in_transit' ? 'all' : 'in_transit'); setPage(0); }} />
                        <MiniStatCard label="Faltantes" value={stats.missing} color={RED}
                            active={statusFilter === 'missing'}
                            onClick={() => { setStatusFilter(statusFilter === 'missing' ? 'all' : 'missing'); setPage(0); }} />
                    </Box>
                </Box>
            )}

            {/* Filters */}
            <Paper sx={{ p: 2, mb: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <TextField
                        size="small"
                        label="Buscar (tracking, descripción, cliente)"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                        sx={{ flex: 2 }}
                    />
                    <TextField
                        size="small"
                        label="Filtrar por AWB"
                        value={awbFilter}
                        onChange={(e) => { setAwbFilter(e.target.value); setPage(0); }}
                        sx={{ flex: 1 }}
                    />
                    <TextField
                        size="small"
                        label="Día"
                        type="date"
                        value={dayFilter}
                        onChange={(e) => { setDayFilter(e.target.value); setPage(0); }}
                        InputLabelProps={{ shrink: true }}
                        sx={{ minWidth: 160 }}
                    />
                    <FormControl size="small" sx={{ minWidth: 220 }}>
                        <InputLabel>Estado</InputLabel>
                        <Select
                            label="Estado"
                            value={statusFilter}
                            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
                        >
                            <MenuItem value="all">Todos</MenuItem>
                            <MenuItem value="in_warehouse">📦 Guías en Bodega</MenuItem>
                            <MenuItem value="waiting_customs_gz">⏳ Guías en Espera (IN_CUSTOMS_GZ)</MenuItem>
                            <MenuItem value="received_china">Recibido en China</MenuItem>
                            <MenuItem value="in_transit">En tránsito</MenuItem>
                            <MenuItem value="missing">Solo faltantes</MenuItem>
                        </Select>
                    </FormControl>
                </Stack>
            </Paper>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

            <Paper>
                {loading && (
                    <Box sx={{ textAlign: 'center', py: 3 }}>
                        <CircularProgress sx={{ color: ORANGE }} />
                    </Box>
                )}
                {!loading && (
                    <TableContainer>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Tracking</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>AWB</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Cliente</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Descripción</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }} align="right">Peso (kg)</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Estado</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Recibido CEDIS</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {packages.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4 }}>
                                            <Typography color="text.secondary">Sin resultados</Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : packages.map((p) => {
                                    const meta = STATUS_LABELS[p.status] || { label: p.status, color: '#757575' };
                                    return (
                                        <TableRow key={p.id} hover>
                                            <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                                {p.tracking_internal}
                                                {p.missing_on_arrival && (
                                                    <Tooltip title="Marcado como faltante/retrasado en recepción">
                                                        <WarningIcon sx={{ color: RED, fontSize: 16, ml: 0.5, verticalAlign: 'middle' }} />
                                                    </Tooltip>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {p.awb_number ? (
                                                    <Chip
                                                        label={p.awb_number}
                                                        size="small"
                                                        variant="outlined"
                                                        sx={{ fontFamily: 'monospace' }}
                                                    />
                                                ) : '—'}
                                            </TableCell>
                                            <TableCell>
                                                {p.user_box_id && (
                                                    <Chip label={p.user_box_id} size="small" sx={{ bgcolor: BLACK, color: '#FFF', mr: 0.5 }} />
                                                )}
                                                <Typography variant="caption">{p.user_name || '—'}</Typography>
                                            </TableCell>
                                            <TableCell>{p.description || '—'}</TableCell>
                                            <TableCell align="right">{Number(p.weight || 0).toFixed(2)}</TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={meta.label}
                                                    size="small"
                                                    sx={{ bgcolor: meta.color, color: '#FFF', fontWeight: 600 }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                {p.received_at
                                                    ? new Date(p.received_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
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

function MiniStatCard({ label, value, color, active, onClick }: { label: string; value: number; color: string; active?: boolean; onClick?: () => void }) {
    return (
        <Paper
            elevation={0}
            onClick={onClick}
            sx={{
                p: 2,
                border: `1px solid ${active ? color : '#E0E0E0'}`,
                borderRadius: 2,
                bgcolor: active ? `${color}12` : '#FFFFFF',
                position: 'relative',
                overflow: 'hidden',
                cursor: onClick ? 'pointer' : 'default',
                transition: 'all 0.15s',
                '&:hover': onClick ? { transform: 'translateY(-1px)', boxShadow: 3, bgcolor: `${color}18` } : {},
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: active ? 6 : 4,
                    bgcolor: color,
                },
            }}
        >
            <Typography
                variant="caption"
                sx={{ display: 'block', textTransform: 'uppercase', fontWeight: 700, color: '#757575', letterSpacing: 1, mb: 0.5 }}
            >
                {label}
            </Typography>
            <Typography sx={{ color, fontWeight: 800, fontSize: 28, lineHeight: 1 }}>
                {value.toLocaleString()}
            </Typography>
        </Paper>
    );
}

function BigStatCard({
    label,
    sublabel,
    value,
    variant,
    active,
    onClick,
}: {
    label: string;
    sublabel: string;
    value: number;
    variant: 'black' | 'orange';
    active: boolean;
    onClick: () => void;
}) {
    const accent = variant === 'black' ? BLACK : ORANGE;
    return (
        <Paper
            onClick={onClick}
            elevation={0}
            sx={{
                p: 3,
                cursor: 'pointer',
                borderRadius: 2,
                border: `2px solid ${accent}`,
                background: active ? accent : '#FFFFFF',
                color: active ? '#FFFFFF' : BLACK,
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                minHeight: 140,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: `0 8px 24px ${accent}33`,
                },
            }}
        >
            <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography
                    variant="overline"
                    sx={{
                        fontWeight: 800,
                        color: active ? '#FFFFFF' : accent,
                        letterSpacing: 1.5,
                        fontSize: 12,
                    }}
                >
                    {label}
                </Typography>
                {active && (
                    <Box sx={{
                        px: 1, py: 0.25, bgcolor: '#FFFFFF', color: accent,
                        borderRadius: 1, fontSize: 10, fontWeight: 700, letterSpacing: 1,
                    }}>
                        FILTRADO
                    </Box>
                )}
            </Stack>
            <Typography
                sx={{
                    fontWeight: 900,
                    fontSize: 56,
                    lineHeight: 1,
                    color: active ? '#FFFFFF' : accent,
                    my: 1,
                }}
            >
                {value.toLocaleString()}
            </Typography>
            <Typography
                variant="caption"
                sx={{
                    color: active ? 'rgba(255,255,255,0.85)' : '#757575',
                    fontWeight: 500,
                }}
            >
                {sublabel}
            </Typography>
        </Paper>
    );
}
