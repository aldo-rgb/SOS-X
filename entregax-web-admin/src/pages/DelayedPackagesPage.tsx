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
} from '@mui/material';
import {
    Search as SearchIcon,
    Refresh as RefreshIcon,
    CheckCircle as CheckCircleIcon,
    Warning as WarningIcon,
    ReportProblem as ReportProblemIcon,
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
    const [lostTarget, setLostTarget] = useState<DelayedPackage | null>(null);
    const [lostReason, setLostReason] = useState('');
    const [lostPassword, setLostPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

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

    const openLostModal = (pkg: DelayedPackage) => {
        setLostTarget(pkg);
        setLostReason('');
        setLostPassword('');
        setError(null);
    };

    const closeLostModal = () => {
        if (submitting) return;
        setLostTarget(null);
        setLostReason('');
        setLostPassword('');
    };

    const confirmMarkLost = async () => {
        if (!lostTarget) return;
        if (!lostReason.trim() || !lostPassword) {
            setError('Debes escribir los detalles del incidente y tu contraseña');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const res = await api.post(`/admin/pobox/packages/${lostTarget.id}/mark-lost`, {
                reason: lostReason.trim(),
                password: lostPassword,
            });
            setSuccessMsg(
                `Paquete ${res.data.tracking || lostTarget.tracking_internal} marcado como perdido por ${res.data.marked_by || 'el usuario'}`
            );
            setLostTarget(null);
            setLostReason('');
            setLostPassword('');
            load();
        } catch (e: any) {
            setError(e.response?.data?.error || e.message || 'Error al marcar como perdido');
        } finally {
            setSubmitting(false);
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
                <Chip
                    label={
                        search.trim() && filtered.length !== packages.length
                            ? `${filtered.length} de ${packages.length} paquete(s)`
                            : `${filtered.length} paquete(s)`
                    }
                    color="warning"
                />
                <IconButton onClick={load}>
                    <RefreshIcon />
                </IconButton>
            </Stack>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
            {successMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMsg(null)}>{successMsg}</Alert>}

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
                    {search.trim() && packages.length > 0 ? (
                        <>
                            <SearchIcon sx={{ fontSize: 60, color: 'warning.main' }} />
                            <Typography variant="h6" sx={{ mt: 2 }}>
                                Ningún resultado para "{search}"
                            </Typography>
                            <Typography color="text.secondary" sx={{ mb: 2 }}>
                                Hay {packages.length} paquete(s) con retraso pero no coinciden con tu búsqueda.
                            </Typography>
                            <Button variant="outlined" onClick={() => setSearch('')} startIcon={<RefreshIcon />}>
                                Limpiar búsqueda
                            </Button>
                        </>
                    ) : (
                        <>
                            <CheckCircleIcon sx={{ fontSize: 60, color: 'success.main' }} />
                            <Typography variant="h6" sx={{ mt: 2 }}>
                                No hay guías con retraso
                            </Typography>
                            <Typography color="text.secondary">
                                Todas las consolidaciones llegaron completas.
                            </Typography>
                        </>
                    )}
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
                                        <TableCell align="right">
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                color="error"
                                                startIcon={<ReportProblemIcon />}
                                                onClick={() => openLostModal(p)}
                                            >
                                                Marcar como perdido
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </Paper>
            )}

            {/* Modal: Marcar como perdido */}
            <Dialog open={!!lostTarget} onClose={closeLostModal} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ bgcolor: '#C62828', color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ReportProblemIcon />
                    Marcar paquete como PERDIDO
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <DialogContentText sx={{ mb: 2 }}>
                        Estás por marcar el paquete <strong>{lostTarget?.tracking_internal}</strong>
                        {lostTarget?.user_name && <> del cliente <strong>{lostTarget.user_name}</strong></>} como <strong style={{ color: '#C62828' }}>PERDIDO</strong>.
                        Esta acción quedará registrada con tu usuario.
                    </DialogContentText>

                    <TextField
                        fullWidth
                        multiline
                        rows={3}
                        label="Detalles del incidente *"
                        placeholder="Describe qué pasó, qué investigación se hizo, etc."
                        value={lostReason}
                        onChange={(e) => setLostReason(e.target.value)}
                        sx={{ mb: 2 }}
                        disabled={submitting}
                    />

                    <TextField
                        fullWidth
                        type="password"
                        label="Tu contraseña de usuario *"
                        placeholder="Ingresa tu contraseña para confirmar"
                        value={lostPassword}
                        onChange={(e) => setLostPassword(e.target.value)}
                        disabled={submitting}
                        autoComplete="current-password"
                    />

                    {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

                    <Alert severity="warning" sx={{ mt: 2 }}>
                        Solo usuarios con permisos de Servicio a Cliente (o superior) pueden realizar esta acción.
                    </Alert>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeLostModal} disabled={submitting}>Cancelar</Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={confirmMarkLost}
                        disabled={submitting || !lostReason.trim() || !lostPassword}
                        startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <ReportProblemIcon />}
                    >
                        {submitting ? 'Registrando...' : 'Confirmar como perdido'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
