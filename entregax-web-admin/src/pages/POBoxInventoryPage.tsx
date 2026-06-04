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
    /** Fecha en la que el paquete entró en su estado actual (CEDIS MTY,
     *  En Ruta, Entregado, etc.). Backend la calcula desde package_history. */
    statusDate?: string;
    deliveredAt?: string;
    consolidationId?: number;
    isMaster?: boolean;
    totalBoxes?: number;
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
    hasInstructions?: boolean;
    driverName?: string | null;
    vehicleNumber?: string | null;
    vehiclePlates?: string | null;
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

// Estados editables manualmente desde el inventario (solo super_admin).
// Coinciden con los aceptados por PATCH /api/packages/:id/status.
const EDITABLE_STATUSES: { value: string; label: string }[] = [
    { value: 'received', label: 'Recibido CEDIS HIDALGO TX' },
    { value: 'processing', label: 'Procesando' },
    { value: 'in_transit', label: 'En tránsito a MTY' },
    { value: 'received_mty', label: 'Recibido CEDIS MTY' },
    { value: 'ready_pickup', label: 'En Ruta' },
    { value: 'out_for_delivery', label: 'En reparto' },
    { value: 'returned_to_warehouse', label: 'Regresado a almacén' },
    { value: 'delivered', label: 'Entregado' },
];

export default function POBoxInventoryPage({ onBack }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [packages, setPackages] = useState<InventoryPackage[]>([]);
    const [savingId, setSavingId] = useState<number | null>(null);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [dateFilter, setDateFilter] = useState<string>(''); // YYYY-MM-DD
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);

    // Solo super_admin puede cambiar el estado desde aquí.
    const isSuperAdmin = useMemo(() => {
        try {
            const userStr = localStorage.getItem('user');
            if (!userStr) return false;
            const u = JSON.parse(userStr);
            const role = String(u.role || '').toLowerCase().replace(/\s+/g, '_');
            return role === 'super_admin';
        } catch {
            return false;
        }
    }, []);

    const handleChangeStatus = async (pkg: InventoryPackage, newStatus: string) => {
        if (!isSuperAdmin || newStatus === pkg.status) return;
        const label = EDITABLE_STATUSES.find(s => s.value === newStatus)?.label || newStatus;
        if (!window.confirm(
            `¿Cambiar el estado de ${pkg.tracking} a "${label}"?\n\n` +
            (pkg.isMaster && (pkg.totalBoxes || 0) > 1
                ? `Esto también actualizará las ${pkg.totalBoxes} cajas hijas.\n\n`
                : '') +
            `Esta acción queda registrada en el historial.`
        )) return;
        setSavingId(pkg.id);
        try {
            const token = localStorage.getItem('token') || '';
            await axios.patch(
                `${API_URL}/api/packages/${pkg.id}/status`,
                { status: newStatus, notes: 'Cambio manual desde Inventario PO Box (super admin)' },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            // Actualizar localmente sin recargar todo
            setPackages(prev => prev.map(p =>
                p.id === pkg.id || (pkg.isMaster && p.consolidationId === pkg.consolidationId && pkg.id === p.id)
                    ? { ...p, status: newStatus }
                    : p
            ));
            // Recargar para traer statusDate/labels actualizados
            load();
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } }; message?: string };
            setError(err.response?.data?.error || err.message || 'No se pudo actualizar el estado');
        } finally {
            setSavingId(null);
        }
    };

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

    // Stats globales — suma cajas (totalBoxes) no guías
    const stats = useMemo(() => {
        const s = { total: 0, received: 0, in_transit: 0, received_mty: 0, ready_pickup: 0, delivered: 0 };
        for (const p of packages) {
            const boxes = (p.isMaster && p.totalBoxes && p.totalBoxes > 1) ? p.totalBoxes : 1;
            s.total += boxes;
            switch (p.status) {
                case 'received':     s.received     += boxes; break;
                case 'in_transit':   s.in_transit   += boxes; break;
                case 'received_mty': s.received_mty += boxes; break;
                case 'ready_pickup': s.ready_pickup  += boxes; break;
                case 'delivered':    s.delivered    += boxes; break;
            }
        }
        return s;
    }, [packages]);

    // Cuántas cajas/paquetes agrupa cada master (consolidación)
    const consolidationCounts = useMemo(() => {
        const m: Record<number, number> = {};
        for (const p of packages) {
            if (p.consolidationId) m[p.consolidationId] = (m[p.consolidationId] || 0) + 1;
        }
        return m;
    }, [packages]);

    // Filtrado client-side
    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return packages.filter((p) => {
            if (statusFilter !== 'all' && p.status !== statusFilter) return false;
            if (dateFilter) {
                // Usamos statusDate (fecha en la que entró al estado actual)
                // si el backend la provee — refleja la recepción real en el
                // almacén/etapa actual (p.ej. CEDIS MTY). Fallback a receivedAt.
                const raw = p.statusDate || p.receivedAt;
                const d = raw ? new Date(raw) : null;
                if (!d || isNaN(d.getTime())) return false;
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                if (`${y}-${m}-${day}` !== dateFilter) return false;
            }
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
    }, [packages, statusFilter, search, dateFilter]);

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
                <StatCard label="Total" value={stats.total} color={BLACK} active={statusFilter === 'all'} onClick={() => { setStatusFilter('all'); setPage(0); }} />
                <StatCard label="Recibido HIDALGO" value={stats.received} color="#1976D2" active={statusFilter === 'received'} onClick={() => { setStatusFilter('received'); setPage(0); }} />
                <StatCard label="En tránsito" value={stats.in_transit} color={ORANGE} active={statusFilter === 'in_transit'} onClick={() => { setStatusFilter('in_transit'); setPage(0); }} />
                <StatCard label="Recibido CEDIS MTY" value={stats.received_mty} color="#2E7D32" active={statusFilter === 'received_mty'} onClick={() => { setStatusFilter('received_mty'); setPage(0); }} />
                <StatCard label="En Ruta" value={stats.ready_pickup} color="#0097A7" active={statusFilter === 'ready_pickup'} onClick={() => { setStatusFilter('ready_pickup'); setPage(0); }} />
                <StatCard label="Entregados" value={stats.delivered} color="#424242" active={statusFilter === 'delivered'} onClick={() => { setStatusFilter('delivered'); setPage(0); }} />
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
                    <TextField
                        size="small"
                        type="date"
                        label={statusFilter === 'all' ? 'Día (estado actual)' : `Día · ${STATUS_LABELS[statusFilter]?.label || statusFilter}`}
                        InputLabelProps={{ shrink: true }}
                        value={dateFilter}
                        onChange={(e) => { setDateFilter(e.target.value); setPage(0); }}
                        sx={{ minWidth: 220 }}
                    />
                    {dateFilter && (
                        <Chip
                            label={`Limpiar fecha`}
                            onDelete={() => { setDateFilter(''); setPage(0); }}
                            size="small"
                            sx={{ alignSelf: 'center' }}
                        />
                    )}
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
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Instrucciones</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Chofer</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: BLACK, color: '#FFF' }}>Unidad</TableCell>
                                    {isSuperAdmin && (
                                        <TableCell sx={{ fontWeight: 700, bgcolor: '#C1272D', color: '#FFF' }}>Cambiar estado</TableCell>
                                    )}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {paged.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={isSuperAdmin ? 12 : 11} sx={{ textAlign: 'center', py: 4 }}>
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
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                    {p.tracking}
                                                    {p.isMaster && p.totalBoxes && p.totalBoxes > 1 && (
                                                        <Chip
                                                            label={`${p.totalBoxes} cajas`}
                                                            size="small"
                                                            sx={{ bgcolor: BLACK, color: '#FFF', fontWeight: 700, fontSize: 11, height: 20 }}
                                                        />
                                                    )}
                                                </Box>
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
                                                    <Box>
                                                        <Chip label={`#${p.consolidationId}`} size="small" variant="outlined" sx={{ borderColor: ORANGE, color: ORANGE, fontWeight: 700 }} />
                                                        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.3 }}>
                                                            {(() => {
                                                                const n = consolidationCounts[p.consolidationId] || 1;
                                                                return `${n} ${n === 1 ? 'caja' : 'cajas'}`;
                                                            })()}
                                                        </Typography>
                                                    </Box>
                                                ) : '—'}
                                            </TableCell>
                                            <TableCell>
                                                {(() => {
                                                    const raw = p.statusDate || p.receivedAt;
                                                    if (!raw) return '—';
                                                    const d = new Date(raw);
                                                    const fecha = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
                                                    const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
                                                    return (
                                                        <Box>
                                                            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>{fecha}</Typography>
                                                            <Typography variant="caption" sx={{ color: '#666', fontFamily: 'monospace' }}>{hora} hrs</Typography>
                                                        </Box>
                                                    );
                                                })()}
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={p.hasInstructions ? 'Con instrucciones' : 'Sin instrucciones'}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: p.hasInstructions ? '#E8F5E9' : '#FFF3E0',
                                                        color: p.hasInstructions ? '#2E7D32' : '#E65100',
                                                        fontWeight: 700,
                                                        fontSize: '0.7rem',
                                                        border: `1px solid ${p.hasInstructions ? '#A5D6A7' : '#FFCC80'}`,
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                {p.driverName
                                                    ? <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.driverName}</Typography>
                                                    : <Typography variant="caption" color="text.secondary">—</Typography>}
                                            </TableCell>
                                            <TableCell>
                                                {(p.vehicleNumber || p.vehiclePlates)
                                                    ? <Box>
                                                        {p.vehicleNumber && <Typography variant="body2" sx={{ fontWeight: 700 }}>{p.vehicleNumber}</Typography>}
                                                        {p.vehiclePlates && <Typography variant="caption" color="text.secondary">{p.vehiclePlates}</Typography>}
                                                      </Box>
                                                    : <Typography variant="caption" color="text.secondary">—</Typography>}
                                            </TableCell>
                                            {isSuperAdmin && (
                                                <TableCell sx={{ minWidth: 200 }}>
                                                    <FormControl size="small" fullWidth disabled={savingId === p.id}>
                                                        <Select
                                                            value={EDITABLE_STATUSES.some(s => s.value === p.status) ? p.status : ''}
                                                            displayEmpty
                                                            onChange={(e) => handleChangeStatus(p, String(e.target.value))}
                                                            sx={{
                                                                fontSize: '0.8rem',
                                                                bgcolor: '#FFF8F0',
                                                                '& .MuiSelect-select': { py: 0.6 },
                                                            }}
                                                        >
                                                            <MenuItem value="" disabled>
                                                                <em>Seleccionar…</em>
                                                            </MenuItem>
                                                            {EDITABLE_STATUSES.map(s => (
                                                                <MenuItem
                                                                    key={s.value}
                                                                    value={s.value}
                                                                    disabled={s.value === p.status}
                                                                >
                                                                    {s.label}
                                                                </MenuItem>
                                                            ))}
                                                        </Select>
                                                        {savingId === p.id && (
                                                            <Typography variant="caption" sx={{ color: ORANGE, mt: 0.3 }}>
                                                                Guardando…
                                                            </Typography>
                                                        )}
                                                    </FormControl>
                                                </TableCell>
                                            )}
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

function StatCard({ label, value, color, active, onClick }: { label: string; value: number; color: string; active?: boolean; onClick?: () => void }) {
    return (
        <Paper
            onClick={onClick}
            sx={{
                p: 2,
                minWidth: 130,
                borderLeft: `4px solid ${color}`,
                flex: 1,
                cursor: onClick ? 'pointer' : 'default',
                userSelect: 'none',
                transition: 'all 0.15s ease',
                bgcolor: active ? color : '#FFF',
                boxShadow: active ? 4 : 1,
                transform: active ? 'translateY(-2px)' : 'none',
                '&:hover': onClick ? {
                    boxShadow: 4,
                    transform: 'translateY(-2px)',
                    bgcolor: active ? color : `${color}15`,
                } : {},
            }}
        >
            <Typography variant="caption" sx={{ display: 'block', textTransform: 'uppercase', fontWeight: 700, color: active ? '#FFF' : 'text.secondary' }}>
                {label}
            </Typography>
            <Typography variant="h5" sx={{ color: active ? '#FFF' : color, fontWeight: 700 }}>
                {value.toLocaleString()}
            </Typography>
        </Paper>
    );
}
