// ============================================
// PÁGINA DE GESTIÓN DE RUTAS AÉREAS
// Administrar rutas de carga aérea China
// ============================================

import { useState, useEffect, useCallback } from 'react';
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
    InputAdornment,
    Grid,
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Flight as FlightIcon,
    FlightTakeoff as TakeoffIcon,
    FlightLand as LandIcon,
    CheckCircle as CheckCircleIcon,
    Cancel as CancelIcon,
    AttachMoney as MoneyIcon,
    AirplanemodeActive as AirplaneIcon,
} from '@mui/icons-material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const AIR_COLOR = '#E53935';

interface AirRoute {
    id: number;
    code: string;
    name: string;
    origin_airport: string;
    origin_city: string;
    destination_airport: string;
    destination_city: string;
    carrier: string;
    flight_prefix: string;
    estimated_days: number;
    cost_per_kg_usd: number | null;
    email: string | null;
    notes: string;
    is_active: boolean;
    drafts_count: number;
    approved_count: number;
    created_at: string;
    updated_at: string;
}

interface RouteDialogData {
    open: boolean;
    mode: 'create' | 'edit';
    id?: number;
    code: string;
    name: string;
    originAirport: string;
    originCity: string;
    destinationAirport: string;
    destinationCity: string;
    costPerKgUsd: string;
    notes: string;
    isActive: boolean;
}

const emptyDialog: RouteDialogData = {
    open: false,
    mode: 'create',
    code: '',
    name: '',
    originAirport: '',
    originCity: '',
    destinationAirport: '',
    destinationCity: '',
    costPerKgUsd: '',
    notes: '',
    isActive: true,
};

export default function AirRoutesPage() {
    const [routes, setRoutes] = useState<AirRoute[]>([]);
    const [loading, setLoading] = useState(true);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'warning' });
    const [dialogData, setDialogData] = useState<RouteDialogData>({ ...emptyDialog });
    const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; route: AirRoute | null }>({ open: false, route: null });

    const token = localStorage.getItem('token');

    // ========== LOAD ROUTES ==========
    const loadRoutes = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_URL}/api/admin/air-routes`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) {
                setRoutes(data.routes || []);
            }
        } catch (error) {
            console.error('Error cargando rutas:', error);
            setSnackbar({ open: true, message: 'Error cargando rutas aéreas', severity: 'error' });
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        loadRoutes();
    }, [loadRoutes]);

    // ========== OPEN CREATE ==========
    const handleOpenCreate = () => {
        setDialogData({ ...emptyDialog, open: true, mode: 'create' });
    };

    // ========== OPEN EDIT ==========
    const handleOpenEdit = (route: AirRoute) => {
        setDialogData({
            open: true,
            mode: 'edit',
            id: route.id,
            code: route.code,
            name: route.name,
            originAirport: route.origin_airport,
            originCity: route.origin_city || '',
            destinationAirport: route.destination_airport,
            destinationCity: route.destination_city || '',
            costPerKgUsd: route.cost_per_kg_usd?.toString() || '',
            notes: route.notes || '',
            isActive: route.is_active,
        });
    };

    // ========== SAVE ROUTE ==========
    const handleSaveRoute = async () => {
        if (!dialogData.code.trim()) {
            setSnackbar({ open: true, message: 'El código de ruta es requerido', severity: 'error' });
            return;
        }
        if (!dialogData.originAirport.trim() || !dialogData.destinationAirport.trim()) {
            setSnackbar({ open: true, message: 'Aeropuerto origen y destino son requeridos', severity: 'error' });
            return;
        }

        try {
            const url = dialogData.mode === 'create'
                ? `${API_URL}/api/admin/air-routes`
                : `${API_URL}/api/admin/air-routes/${dialogData.id}`;

            const method = dialogData.mode === 'create' ? 'POST' : 'PUT';

            const body = {
                code: dialogData.code.toUpperCase(),
                name: dialogData.name || dialogData.code.toUpperCase(),
                origin_airport: dialogData.originAirport.toUpperCase(),
                origin_city: dialogData.originCity,
                destination_airport: dialogData.destinationAirport.toUpperCase(),
                destination_city: dialogData.destinationCity,
                cost_per_kg_usd: dialogData.costPerKgUsd ? parseFloat(dialogData.costPerKgUsd) : null,
                notes: dialogData.notes,
                ...(dialogData.mode === 'edit' ? { is_active: dialogData.isActive } : {}),
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
                    message: dialogData.mode === 'create' ? `Ruta ${body.code} creada` : `Ruta ${body.code} actualizada`,
                    severity: 'success',
                });
                setDialogData({ ...emptyDialog });
                loadRoutes();
            } else {
                throw new Error(data.error || 'Error al guardar');
            }
        } catch (error: unknown) {
            setSnackbar({ open: true, message: error instanceof Error ? error.message : 'Error desconocido', severity: 'error' });
        }
    };

    // ========== DELETE ROUTE ==========
    const handleDeleteRoute = async () => {
        if (!deleteDialog.route) return;

        try {
            const res = await fetch(`${API_URL}/api/admin/air-routes/${deleteDialog.route.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });

            const data = await res.json();

            if (data.success) {
                setSnackbar({ open: true, message: `Ruta ${deleteDialog.route.code} eliminada`, severity: 'success' });
                setDeleteDialog({ open: false, route: null });
                loadRoutes();
            } else {
                throw new Error(data.error || 'Error al eliminar');
            }
        } catch (error: unknown) {
            setSnackbar({ open: true, message: error instanceof Error ? error.message : 'Error', severity: 'error' });
        }
    };

    // ========== TOGGLE ACTIVE ==========
    const handleToggleActive = async (route: AirRoute) => {
        try {
            const res = await fetch(`${API_URL}/api/admin/air-routes/${route.id}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ is_active: !route.is_active }),
            });

            const data = await res.json();

            if (data.success) {
                setSnackbar({
                    open: true,
                    message: route.is_active ? `Ruta ${route.code} desactivada` : `Ruta ${route.code} activada`,
                    severity: 'success',
                });
                loadRoutes();
            }
        } catch (error: unknown) {
            setSnackbar({ open: true, message: error instanceof Error ? error.message : 'Error', severity: 'error' });
        }
    };

    // ========== RENDER ==========
    return (
        <Box>
            {/* Header */}
            <Paper
                sx={{
                    background: `linear-gradient(135deg, ${AIR_COLOR} 0%, #FF7043 100%)`,
                    p: 3,
                    mb: 3,
                    borderRadius: 2,
                    color: 'white',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <FlightIcon sx={{ fontSize: 40 }} />
                        <Box>
                            <Typography variant="h5" fontWeight="bold">
                                Rutas Aéreas de Carga
                            </Typography>
                            <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                Administrar rutas de envío aéreo desde China
                            </Typography>
                        </Box>
                    </Box>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={handleOpenCreate}
                        sx={{
                            bgcolor: 'white',
                            color: AIR_COLOR,
                            '&:hover': { bgcolor: '#FFEBEE' },
                        }}
                    >
                        Nueva Ruta
                    </Button>
                </Box>
            </Paper>

            {/* Info */}
            <Alert severity="info" sx={{ mb: 3 }}>
                Cada ruta define un corredor aéreo de carga desde China. El código identifica la ruta (ej: HKG-MEX) y los aeropuertos de origen y destino.
            </Alert>

            {/* Tabla */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                    <CircularProgress sx={{ color: AIR_COLOR }} />
                </Box>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#FFEBEE' }}>
                                <TableCell><Typography fontWeight="bold">Código Ruta</Typography></TableCell>
                                <TableCell><Typography fontWeight="bold">Origen → Destino</Typography></TableCell>
                                <TableCell><Typography fontWeight="bold">Costo/KG (USD)</Typography></TableCell>
                                <TableCell align="center"><Typography fontWeight="bold">Envíos</Typography></TableCell>
                                <TableCell align="center"><Typography fontWeight="bold">Estado</Typography></TableCell>
                                <TableCell align="center"><Typography fontWeight="bold">Acciones</Typography></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {routes.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                        <AirplaneIcon sx={{ fontSize: 48, color: '#ccc', mb: 1 }} />
                                        <Typography color="text.secondary">
                                            No hay rutas aéreas registradas. Crea la primera con "Nueva Ruta".
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                routes.map((route) => (
                                    <TableRow key={route.id} hover sx={{ opacity: route.is_active ? 1 : 0.5 }}>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <FlightIcon sx={{ color: AIR_COLOR, fontSize: 20 }} />
                                                <Typography fontWeight="bold" sx={{ fontFamily: 'monospace', fontSize: '1rem' }}>
                                                    {route.code}
                                                </Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <TakeoffIcon sx={{ fontSize: 16, color: '#666' }} />
                                                <Typography variant="body2" fontWeight={600}>
                                                    {route.origin_airport}
                                                </Typography>
                                                {route.origin_city && (
                                                    <Typography variant="caption" color="text.secondary">({route.origin_city})</Typography>
                                                )}
                                                <Typography sx={{ mx: 0.5 }}>→</Typography>
                                                <LandIcon sx={{ fontSize: 16, color: '#666' }} />
                                                <Typography variant="body2" fontWeight={600}>
                                                    {route.destination_airport}
                                                </Typography>
                                                {route.destination_city && (
                                                    <Typography variant="caption" color="text.secondary">({route.destination_city})</Typography>
                                                )}
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            {route.cost_per_kg_usd ? (
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <MoneyIcon fontSize="small" sx={{ color: '#2E7D32' }} />
                                                    <Typography fontWeight="bold" color="#2E7D32">
                                                        ${Number(route.cost_per_kg_usd).toFixed(2)}
                                                    </Typography>
                                                </Box>
                                            ) : (
                                                <Typography color="text.secondary">—</Typography>
                                            )}
                                        </TableCell>
                                        <TableCell align="center">
                                            <Tooltip title={`${route.approved_count} aprobados de ${route.drafts_count} total`}>
                                                <Chip
                                                    label={`${route.approved_count}/${route.drafts_count}`}
                                                    size="small"
                                                    variant="outlined"
                                                    color={Number(route.drafts_count) > 0 ? 'primary' : 'default'}
                                                />
                                            </Tooltip>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Chip
                                                icon={route.is_active ? <CheckCircleIcon /> : <CancelIcon />}
                                                label={route.is_active ? 'Activa' : 'Inactiva'}
                                                color={route.is_active ? 'success' : 'default'}
                                                size="small"
                                                onClick={() => handleToggleActive(route)}
                                                sx={{ cursor: 'pointer' }}
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Tooltip title="Editar">
                                                <IconButton size="small" color="primary" onClick={() => handleOpenEdit(route)}>
                                                    <EditIcon />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Eliminar">
                                                <IconButton size="small" color="error" onClick={() => setDeleteDialog({ open: true, route })}>
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

            {/* Dialog crear/editar */}
            <Dialog open={dialogData.open} onClose={() => setDialogData({ ...emptyDialog })} maxWidth="md" fullWidth>
                <DialogTitle sx={{ bgcolor: '#FFEBEE', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FlightIcon sx={{ color: AIR_COLOR }} />
                    {dialogData.mode === 'create' ? 'Nueva Ruta Aérea' : 'Editar Ruta Aérea'}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 2 }}>
                        <Grid container spacing={2}>
                            {/* Row 1: Código + Nombre */}
                            <Grid size={{ xs: 12, sm: 4 }}>
                                <TextField
                                    label="Código de Ruta *"
                                    value={dialogData.code}
                                    onChange={(e) => setDialogData({ ...dialogData, code: e.target.value.toUpperCase() })}
                                    fullWidth
                                    required
                                    placeholder="HKG-MEX"
                                    helperText="Identificador único (ej: HKG-MEX)"
                                    inputProps={{ style: { fontFamily: 'monospace', fontWeight: 'bold' } }}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 8 }}>
                                <TextField
                                    label="Nombre descriptivo"
                                    value={dialogData.name}
                                    onChange={(e) => setDialogData({ ...dialogData, name: e.target.value })}
                                    fullWidth
                                    placeholder="Hong Kong → Ciudad de México"
                                    helperText="Opcional, si vacío se usa el código"
                                />
                            </Grid>

                            {/* Row 2: Origen */}
                            <Grid size={{ xs: 12, sm: 3 }}>
                                <TextField
                                    label="Aeropuerto Origen *"
                                    value={dialogData.originAirport}
                                    onChange={(e) => setDialogData({ ...dialogData, originAirport: e.target.value.toUpperCase() })}
                                    fullWidth
                                    required
                                    placeholder="HKG"
                                    helperText="Código IATA"
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start"><TakeoffIcon sx={{ fontSize: 18 }} /></InputAdornment>,
                                    }}
                                    inputProps={{ maxLength: 5 }}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 3 }}>
                                <TextField
                                    label="Ciudad Origen"
                                    value={dialogData.originCity}
                                    onChange={(e) => setDialogData({ ...dialogData, originCity: e.target.value })}
                                    fullWidth
                                    placeholder="Hong Kong"
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 3 }}>
                                <TextField
                                    label="Aeropuerto Destino *"
                                    value={dialogData.destinationAirport}
                                    onChange={(e) => setDialogData({ ...dialogData, destinationAirport: e.target.value.toUpperCase() })}
                                    fullWidth
                                    required
                                    placeholder="MEX"
                                    helperText="Código IATA"
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start"><LandIcon sx={{ fontSize: 18 }} /></InputAdornment>,
                                    }}
                                    inputProps={{ maxLength: 5 }}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 3 }}>
                                <TextField
                                    label="Ciudad Destino"
                                    value={dialogData.destinationCity}
                                    onChange={(e) => setDialogData({ ...dialogData, destinationCity: e.target.value })}
                                    fullWidth
                                    placeholder="CDMX"
                                />
                            </Grid>

                            {/* Costo por KG */}
                            <Grid size={{ xs: 12, sm: 4 }}>
                                <TextField
                                    label="Costo por KG (USD)"
                                    value={dialogData.costPerKgUsd}
                                    onChange={(e) => setDialogData({ ...dialogData, costPerKgUsd: e.target.value })}
                                    fullWidth
                                    type="number"
                                    placeholder="3.50"
                                    helperText="Precio base de la ruta"
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                    }}
                                />
                            </Grid>

                            {/* Notas */}
                            <Grid size={{ xs: 12 }}>
                                <TextField
                                    label="Notas"
                                    value={dialogData.notes}
                                    onChange={(e) => setDialogData({ ...dialogData, notes: e.target.value })}
                                    fullWidth
                                    multiline
                                    rows={2}
                                    placeholder="Notas adicionales sobre la ruta..."
                                />
                            </Grid>

                            {/* Active toggle (edit only) */}
                            {dialogData.mode === 'edit' && (
                                <Grid size={{ xs: 12 }}>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={dialogData.isActive}
                                                onChange={(e) => setDialogData({ ...dialogData, isActive: e.target.checked })}
                                            />
                                        }
                                        label="Ruta activa"
                                    />
                                </Grid>
                            )}
                        </Grid>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setDialogData({ ...emptyDialog })}>
                        Cancelar
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleSaveRoute}
                        sx={{ bgcolor: AIR_COLOR, '&:hover': { bgcolor: '#C62828' } }}
                    >
                        {dialogData.mode === 'create' ? 'Crear Ruta' : 'Guardar Cambios'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog confirmar eliminar */}
            <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, route: null })}>
                <DialogTitle>⚠️ Confirmar Eliminación</DialogTitle>
                <DialogContent>
                    <Typography>
                        ¿Estás seguro de eliminar la ruta <strong>{deleteDialog.route?.code}</strong>?
                    </Typography>
                    {deleteDialog.route && Number(deleteDialog.route.drafts_count) > 0 && (
                        <Alert severity="warning" sx={{ mt: 2 }}>
                            Esta ruta tiene {deleteDialog.route.drafts_count} borradores asociados. No podrá ser eliminada.
                        </Alert>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialog({ open: false, route: null })}>
                        Cancelar
                    </Button>
                    <Button variant="contained" color="error" onClick={handleDeleteRoute}>
                        Eliminar
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
