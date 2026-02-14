// ============================================
// PÁGINA DE GESTIÓN DE RUTAS MARÍTIMAS
// Administrar rutas de envío como CHN-LAX-ELP-MEX
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Box,
    Typography,
    Paper,
    Button,
    TextField,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Alert,
    Snackbar,
    Chip,
    CircularProgress,
    Tooltip,
    Switch,
    FormControlLabel,
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Route as RouteIcon,
    Email as EmailIcon,
    CheckCircle as CheckCircleIcon,
    Cancel as CancelIcon,
} from '@mui/icons-material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface MaritimeRoute {
    id: number;
    name: string;
    code: string;
    email: string | null;
    origin: string;
    destination: string;
    estimated_days: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface RouteDialogData {
    open: boolean;
    mode: 'create' | 'edit';
    id?: number;
    code: string;
    email: string;
    isActive: boolean;
}

export default function MaritimeRoutesPage() {
    const { t } = useTranslation();
    const [routes, setRoutes] = useState<MaritimeRoute[]>([]);
    const [loading, setLoading] = useState(true);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
    const [dialogData, setDialogData] = useState<RouteDialogData>({
        open: false,
        mode: 'create',
        code: '',
        email: '',
        isActive: true,
    });
    const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; route: MaritimeRoute | null }>({
        open: false,
        route: null,
    });

    const token = localStorage.getItem('token');

    // Cargar rutas
    const loadRoutes = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_URL}/api/maritime-api/routes`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) {
                setRoutes(data.routes || []);
            }
        } catch (error) {
            console.error('Error cargando rutas:', error);
            setSnackbar({ open: true, message: t('routes.errorLoading'), severity: 'error' });
        } finally {
            setLoading(false);
        }
    }, [token, t]);

    useEffect(() => {
        loadRoutes();
    }, [loadRoutes]);

    // Abrir dialog para crear nueva ruta
    const handleOpenCreate = () => {
        setDialogData({
            open: true,
            mode: 'create',
            code: '',
            email: '',
            isActive: true,
        });
    };

    // Abrir dialog para editar ruta
    const handleOpenEdit = (route: MaritimeRoute) => {
        setDialogData({
            open: true,
            mode: 'edit',
            id: route.id,
            code: route.code,
            email: route.email || '',
            isActive: route.is_active,
        });
    };

    // Guardar ruta (crear o editar)
    const handleSaveRoute = async () => {
        if (!dialogData.code.trim()) {
            setSnackbar({ open: true, message: t('routes.codeRequired'), severity: 'error' });
            return;
        }

        try {
            const url = dialogData.mode === 'create'
                ? `${API_URL}/api/maritime-api/routes`
                : `${API_URL}/api/maritime-api/routes/${dialogData.id}`;

            const method = dialogData.mode === 'create' ? 'POST' : 'PUT';

            // Para crear, usamos el código como nombre también
            const body = dialogData.mode === 'create'
                ? {
                    name: dialogData.code.toUpperCase(),
                    code: dialogData.code.toUpperCase(),
                    email: dialogData.email.trim() || null,
                    destination: 'México', // Default
                }
                : {
                    code: dialogData.code.toUpperCase(),
                    name: dialogData.code.toUpperCase(),
                    email: dialogData.email.trim() || null,
                    isActive: dialogData.isActive,
                };

            const res = await fetch(url, {
                method,
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (data.success) {
                setSnackbar({
                    open: true,
                    message: dialogData.mode === 'create' ? t('routes.created') : t('routes.updated'),
                    severity: 'success',
                });
                setDialogData({ ...dialogData, open: false });
                loadRoutes();
            } else {
                throw new Error(data.error || 'Error al guardar');
            }
        } catch (error: any) {
            setSnackbar({ open: true, message: error.message, severity: 'error' });
        }
    };

    // Eliminar ruta
    const handleDeleteRoute = async () => {
        if (!deleteDialog.route) return;

        try {
            const res = await fetch(`${API_URL}/api/maritime-api/routes/${deleteDialog.route.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });

            const data = await res.json();

            if (data.success) {
                setSnackbar({ open: true, message: t('routes.deleted'), severity: 'success' });
                setDeleteDialog({ open: false, route: null });
                loadRoutes();
            } else {
                throw new Error(data.error || 'Error al eliminar');
            }
        } catch (error: any) {
            setSnackbar({ open: true, message: error.message, severity: 'error' });
        }
    };

    // Toggle estado activo/inactivo
    const handleToggleActive = async (route: MaritimeRoute) => {
        try {
            const res = await fetch(`${API_URL}/api/maritime-api/routes/${route.id}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ isActive: !route.is_active }),
            });

            const data = await res.json();

            if (data.success) {
                setSnackbar({
                    open: true,
                    message: route.is_active ? t('routes.deactivated') : t('routes.activated'),
                    severity: 'success',
                });
                loadRoutes();
            } else {
                throw new Error(data.error || 'Error');
            }
        } catch (error: any) {
            setSnackbar({ open: true, message: error.message, severity: 'error' });
        }
    };

    return (
        <Box>
            {/* Header */}
            <Paper
                sx={{
                    background: 'linear-gradient(135deg, #01579B 0%, #29B6F6 100%)',
                    p: 3,
                    mb: 3,
                    borderRadius: 2,
                    color: 'white',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <RouteIcon sx={{ fontSize: 40 }} />
                        <Box>
                            <Typography variant="h5" fontWeight="bold">
                                {t('routes.title')}
                            </Typography>
                            <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                {t('routes.subtitle')}
                            </Typography>
                        </Box>
                    </Box>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={handleOpenCreate}
                        sx={{
                            bgcolor: 'white',
                            color: '#01579B',
                            '&:hover': { bgcolor: '#E3F2FD' },
                        }}
                    >
                        {t('routes.addRoute')}
                    </Button>
                </Box>
            </Paper>

            {/* Info */}
            <Alert severity="info" sx={{ mb: 3 }}>
                {t('routes.info')}
            </Alert>

            {/* Tabla de rutas */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'grey.100' }}>
                                <TableCell>
                                    <Typography fontWeight="bold">{t('routes.routeCode')}</Typography>
                                </TableCell>
                                <TableCell>
                                    <Typography fontWeight="bold">{t('routes.email')}</Typography>
                                </TableCell>
                                <TableCell align="center">
                                    <Typography fontWeight="bold">{t('routes.status')}</Typography>
                                </TableCell>
                                <TableCell align="center">
                                    <Typography fontWeight="bold">{t('routes.actions')}</Typography>
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {routes.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                                        <Typography color="text.secondary">
                                            {t('routes.noRoutes')}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                routes.map((route) => (
                                    <TableRow key={route.id} hover>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <RouteIcon color="primary" />
                                                <Typography fontWeight="bold" sx={{ fontFamily: 'monospace', fontSize: '1rem' }}>
                                                    {route.code}
                                                </Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            {route.email ? (
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <EmailIcon fontSize="small" color="action" />
                                                    <Typography>{route.email}</Typography>
                                                </Box>
                                            ) : (
                                                <Typography color="text.secondary" fontStyle="italic">
                                                    {t('routes.noEmail')}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell align="center">
                                            <Chip
                                                icon={route.is_active ? <CheckCircleIcon /> : <CancelIcon />}
                                                label={route.is_active ? t('routes.active') : t('routes.inactive')}
                                                color={route.is_active ? 'success' : 'default'}
                                                size="small"
                                                onClick={() => handleToggleActive(route)}
                                                sx={{ cursor: 'pointer' }}
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Tooltip title={t('routes.edit')}>
                                                <IconButton
                                                    size="small"
                                                    color="primary"
                                                    onClick={() => handleOpenEdit(route)}
                                                >
                                                    <EditIcon />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title={t('routes.delete')}>
                                                <IconButton
                                                    size="small"
                                                    color="error"
                                                    onClick={() => setDeleteDialog({ open: true, route })}
                                                >
                                                    <DeleteIcon />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Dialog para crear/editar ruta */}
            <Dialog open={dialogData.open} onClose={() => setDialogData({ ...dialogData, open: false })} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {dialogData.mode === 'create' ? t('routes.newRoute') : t('routes.editRoute')}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <TextField
                            label={t('routes.routeCode')}
                            value={dialogData.code}
                            onChange={(e) => setDialogData({ ...dialogData, code: e.target.value.toUpperCase() })}
                            fullWidth
                            required
                            placeholder="CHN-LAX-ELP-MEX"
                            helperText={t('routes.codeHelp')}
                            inputProps={{ style: { fontFamily: 'monospace', fontWeight: 'bold' } }}
                        />
                        <TextField
                            label={t('routes.email')}
                            value={dialogData.email}
                            onChange={(e) => setDialogData({ ...dialogData, email: e.target.value })}
                            fullWidth
                            type="email"
                            placeholder="ejemplo@proveedor.com"
                            helperText={t('routes.emailHelp')}
                        />
                        {dialogData.mode === 'edit' && (
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={dialogData.isActive}
                                        onChange={(e) => setDialogData({ ...dialogData, isActive: e.target.checked })}
                                    />
                                }
                                label={t('routes.routeActive')}
                            />
                        )}
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setDialogData({ ...dialogData, open: false })}>
                        {t('common.cancel')}
                    </Button>
                    <Button variant="contained" onClick={handleSaveRoute}>
                        {dialogData.mode === 'create' ? t('routes.create') : t('routes.save')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog de confirmación para eliminar */}
            <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, route: null })}>
                <DialogTitle>{t('routes.confirmDelete')}</DialogTitle>
                <DialogContent>
                    <Typography>
                        {t('routes.deleteWarning', { code: deleteDialog.route?.code })}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialog({ open: false, route: null })}>
                        {t('common.cancel')}
                    </Button>
                    <Button variant="contained" color="error" onClick={handleDeleteRoute}>
                        {t('routes.delete')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
            >
                <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
