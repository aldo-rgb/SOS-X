import { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Paper,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Chip,
    Button,
    CircularProgress,
    Alert,
    Stack,
    TextField,
    InputAdornment,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    IconButton,
    Tooltip,
} from '@mui/material';
import {
    Search as SearchIcon,
    Refresh as RefreshIcon,
    CheckCircle as CheckCircleIcon,
    Warning as WarningIcon,
    Phone as PhoneIcon,
    Email as EmailIcon,
} from '@mui/icons-material';
import api from '../services/api';

interface DelayedPackage {
    id: number;
    tracking_internal: string;
    status: string;
    description: string | null;
    weight: string | number | null;
    consolidation_id: number | null;
    missing_reported_at: string | null;
    master_tracking: string | null;
    consolidation_dispatched_at: string | null;
    consolidation_received_at: string | null;
    user_id: number;
    user_name: string | null;
    user_email: string | null;
    user_phone: string | null;
    box_id: string | null;
    days_delayed: number | null;
}

export default function DelayedPackagesPage() {
    const [packages, setPackages] = useState<DelayedPackage[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [confirmFound, setConfirmFound] = useState<DelayedPackage | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/admin/customer-service/delayed-packages');
            setPackages(res.data.packages || []);
        } catch (e: any) {
            setError(e.response?.data?.error || e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const markFound = async (pkg: DelayedPackage) => {
        try {
            await api.post(`/admin/pobox/packages/${pkg.id}/mark-found`);
            setConfirmFound(null);
            load();
        } catch (e: any) {
            setError(e.response?.data?.error || e.message);
        }
    };

    const filtered = packages.filter((p) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            p.tracking_internal?.toLowerCase().includes(q) ||
            p.master_tracking?.toLowerCase().includes(q) ||
            p.user_name?.toLowerCase().includes(q) ||
            p.user_email?.toLowerCase().includes(q) ||
            p.box_id?.toLowerCase().includes(q)
        );
    });

    const severityFor = (days: number | null) => {
        if (days == null) return 'default';
        if (days >= 7) return 'error';
        if (days >= 3) return 'warning';
        return 'info';
    };

    return (
        <Box>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                <WarningIcon sx={{ color: '#F05A28' }} />
                <Box sx={{ flex: 1 }}>
                    <Typography variant="h6" fontWeight={700}>
                        Guías con Retraso
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Paquetes cuya consolidación llegó a MTY sin ellos
                    </Typography>
                </Box>
                <Chip label={`${filtered.length} paquete(s)`} color="warning" />
                <IconButton onClick={load}>
                    <RefreshIcon />
                </IconButton>
            </Stack>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

            <TextField
                fullWidth
                size="small"
                placeholder="Buscar por tracking, cliente, email o box..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ mb: 2 }}
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <SearchIcon fontSize="small" />
                        </InputAdornment>
                    ),
                }}
            />

            {loading ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                    <CircularProgress />
                </Box>
            ) : filtered.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <CheckCircleIcon sx={{ fontSize: 60, color: 'success.main' }} />
                    <Typography variant="h6" sx={{ mt: 2 }}>
                        No hay guías con retraso
                    </Typography>
                    <Typography color="text.secondary">
                        Todas las consolidaciones llegaron completas.
                    </Typography>
                </Paper>
            ) : (
                <Paper variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Tracking</TableCell>
                                <TableCell>Cliente</TableCell>
                                <TableCell>Consolidación</TableCell>
                                <TableCell>Reportado</TableCell>
                                <TableCell>Días de retraso</TableCell>
                                <TableCell>Contacto</TableCell>
                                <TableCell align="right">Acciones</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filtered.map((p) => {
                                const days = p.days_delayed != null ? Math.floor(Number(p.days_delayed)) : null;
                                return (
                                    <TableRow key={p.id} hover>
                                        <TableCell>
                                            <Typography sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                                {p.tracking_internal}
                                            </Typography>
                                            {p.description && (
                                                <Typography variant="caption" color="text.secondary">
                                                    {p.description}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Typography sx={{ fontWeight: 600 }}>{p.user_name || '—'}</Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                Box {p.box_id || 'N/A'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={`#${p.consolidation_id}`}
                                                size="small"
                                                variant="outlined"
                                            />
                                            {p.master_tracking && (
                                                <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace' }}>
                                                    {p.master_tracking}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {p.missing_reported_at
                                                ? new Date(p.missing_reported_at).toLocaleDateString()
                                                : '—'}
                                        </TableCell>
                                        <TableCell>
                                            {days != null ? (
                                                <Chip
                                                    label={`${days} día(s)`}
                                                    color={severityFor(days) as any}
                                                    size="small"
                                                />
                                            ) : '—'}
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={0.5}>
                                                {p.user_phone && (
                                                    <Tooltip title={p.user_phone}>
                                                        <IconButton size="small" href={`tel:${p.user_phone}`}>
                                                            <PhoneIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                {p.user_email && (
                                                    <Tooltip title={p.user_email}>
                                                        <IconButton size="small" href={`mailto:${p.user_email}`}>
                                                            <EmailIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                            </Stack>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                color="success"
                                                startIcon={<CheckCircleIcon />}
                                                onClick={() => setConfirmFound(p)}
                                            >
                                                Marcar encontrado
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </Paper>
            )}

            <Dialog open={!!confirmFound} onClose={() => setConfirmFound(null)}>
                <DialogTitle>Marcar paquete como encontrado</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        ¿Confirmas que el paquete <strong>{confirmFound?.tracking_internal}</strong> ya llegó a MTY?
                        Se marcará como recibido y se eliminará de esta lista.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmFound(null)}>Cancelar</Button>
                    <Button variant="contained" color="success" onClick={() => confirmFound && markFound(confirmFound)}>
                        Confirmar
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
