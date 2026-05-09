import { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Button,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Alert,
    Snackbar,
    Chip,
    InputAdornment,
    Tooltip,
    Card,
    CardContent,
    Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import CategoryIcon from '@mui/icons-material/Category';
import PercentIcon from '@mui/icons-material/Percent';
import PaymentIcon from '@mui/icons-material/Payment';
import { Switch, FormControlLabel, CircularProgress, Stack } from '@mui/material';
import { usePaymentStatus, toggleXPay, toggleEntregaxPayments, toggleGEX, invalidatePaymentStatusCache } from '../hooks/usePaymentStatus';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';

interface ServiceType {
    id: number;
    service_type: string;
    label: string;
    percentage: number;
    leader_override: number;
    fiscal_emitter_id: number | null;
    updated_at: string;
}

interface NewServiceType {
    service_type: string;
    label: string;
    percentage: number;
    leader_override: number;
}

export default function SettingsPage() {
    const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
    
    const [newService, setNewService] = useState<NewServiceType>({
        service_type: '',
        label: '',
        percentage: 5,
        leader_override: 10,
    });

    // Edición inline
    const [editValues, setEditValues] = useState<{ [key: number]: { percentage: number; leader_override: number } }>({});

    // Toggles del sistema de pagos (solo super_admin)
    const currentUser = (() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
    })();
    const isSuperAdmin = currentUser?.role === 'super_admin';
    const { xpayEnabled, entregaxPaymentsEnabled, gexEnabled, loading: paymentsStatusLoading } = usePaymentStatus();
    const [togglingXpay, setTogglingXpay] = useState(false);
    const [togglingEntregax, setTogglingEntregax] = useState(false);
    const [togglingGex, setTogglingGex] = useState(false);
    // Estado local optimista que se sincroniza con el hook al cargar.
    const [localXpay, setLocalXpay] = useState<boolean | null>(null);
    const [localEntregax, setLocalEntregax] = useState<boolean | null>(null);
    const [localGex, setLocalGex] = useState<boolean | null>(null);
    useEffect(() => {
        if (!paymentsStatusLoading) {
            setLocalXpay(xpayEnabled);
            setLocalEntregax(entregaxPaymentsEnabled);
            setLocalGex(gexEnabled);
        }
    }, [paymentsStatusLoading, xpayEnabled, entregaxPaymentsEnabled, gexEnabled]);

    const handleToggleXpay = async (checked: boolean) => {
        setTogglingXpay(true);
        const prev = localXpay;
        setLocalXpay(checked);
        try {
            await toggleXPay(checked);
            invalidatePaymentStatusCache();
            setSnackbar({ open: true, message: `X-Pay ${checked ? 'activado' : 'desactivado'} correctamente`, severity: 'success' });
        } catch (err: any) {
            setLocalXpay(prev);
            setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo cambiar X-Pay', severity: 'error' });
        } finally {
            setTogglingXpay(false);
        }
    };
    const handleToggleEntregax = async (checked: boolean) => {
        setTogglingEntregax(true);
        const prev = localEntregax;
        setLocalEntregax(checked);
        try {
            await toggleEntregaxPayments(checked);
            invalidatePaymentStatusCache();
            setSnackbar({ open: true, message: `Pagos EntregaX ${checked ? 'activados' : 'desactivados'} correctamente`, severity: 'success' });
        } catch (err: any) {
            setLocalEntregax(prev);
            setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo cambiar Pagos EntregaX', severity: 'error' });
        } finally {
            setTogglingEntregax(false);
        }
    };
    const handleToggleGex = async (checked: boolean) => {
        setTogglingGex(true);
        const prev = localGex;
        setLocalGex(checked);
        try {
            await toggleGEX(checked);
            invalidatePaymentStatusCache();
            setSnackbar({ open: true, message: `Garantía Extendida ${checked ? 'activada' : 'desactivada'} correctamente`, severity: 'success' });
        } catch (err: any) {
            setLocalGex(prev);
            setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo cambiar GEX', severity: 'error' });
        } finally {
            setTogglingGex(false);
        }
    };

    const getAuthHeaders = () => {
        const token = localStorage.getItem('token');
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    };

    const fetchServiceTypes = async () => {
        try {
            const response = await fetch(`${API_URL}/admin/commissions`, {
                headers: getAuthHeaders()
            });
            if (response.ok) {
                const data = await response.json();
                setServiceTypes(data);
                // Inicializar valores de edición
                const values: { [key: number]: { percentage: number; leader_override: number } } = {};
                data.forEach((st: ServiceType) => {
                    values[st.id] = { percentage: st.percentage, leader_override: st.leader_override };
                });
                setEditValues(values);
            }
        } catch (error) {
            console.error('Error fetching service types:', error);
            setSnackbar({ open: true, message: 'Error al cargar tipos de servicio', severity: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchServiceTypes();
    }, []);

    const handleCreateService = async () => {
        if (!newService.service_type || !newService.label) {
            setSnackbar({ open: true, message: 'Código y nombre son requeridos', severity: 'error' });
            return;
        }

        try {
            const response = await fetch(`${API_URL}/admin/service-types`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(newService)
            });

            if (response.ok) {
                setSnackbar({ open: true, message: 'Tipo de servicio creado correctamente', severity: 'success' });
                setDialogOpen(false);
                setNewService({ service_type: '', label: '', percentage: 5, leader_override: 10 });
                fetchServiceTypes();
            } else {
                const error = await response.json();
                setSnackbar({ open: true, message: error.error || 'Error al crear', severity: 'error' });
            }
        } catch (error) {
            console.error('Error creating service type:', error);
            setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
        }
    };

    const handleUpdateService = async (id: number) => {
        const values = editValues[id];
        if (!values) return;

        try {
            const response = await fetch(`${API_URL}/admin/commissions`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    id,
                    percentage: values.percentage,
                    leader_override: values.leader_override
                })
            });

            if (response.ok) {
                setSnackbar({ open: true, message: 'Tarifa actualizada', severity: 'success' });
                setEditingId(null);
                fetchServiceTypes();
            } else {
                const error = await response.json();
                setSnackbar({ open: true, message: error.error || 'Error al actualizar', severity: 'error' });
            }
        } catch (error) {
            console.error('Error updating service type:', error);
            setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
        }
    };

    const handleDeleteService = async (id: number) => {
        if (!confirm('¿Estás seguro de eliminar este tipo de servicio?')) return;

        try {
            const response = await fetch(`${API_URL}/admin/service-types/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });

            if (response.ok) {
                setSnackbar({ open: true, message: 'Tipo de servicio eliminado', severity: 'success' });
                fetchServiceTypes();
            } else {
                const error = await response.json();
                setSnackbar({ open: true, message: error.error || 'Error al eliminar', severity: 'error' });
            }
        } catch (error) {
            console.error('Error deleting service type:', error);
            setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
        }
    };

    const generateServiceCode = (label: string): string => {
        return label
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 30);
    };

    return (
        <Box>
            {/* Header */}
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h5" fontWeight={700} color="text.primary">
                        ⚙️ Configuración del Sistema
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Gestiona los tipos de servicio y tarifas de comisión
                    </Typography>
                </Box>
            </Box>

            {/* Sistema de Pagos — solo super_admin */}
            {isSuperAdmin && (
                <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, mb: 3 }}>
                    <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <PaymentIcon sx={{ color: '#F05A28' }} />
                            <Typography variant="h6" fontWeight={600}>
                                Sistema de Pagos
                            </Typography>
                            <Chip label="Super Admin" size="small" color="warning" sx={{ ml: 1 }} />
                        </Box>
                        <Alert severity="warning" sx={{ mb: 3 }}>
                            Estos toggles cierran o abren el flujo de cobro <strong>en producción</strong>. Apagarlos detiene
                            inmediatamente cualquier intento de pago de los clientes desde web y app móvil.
                        </Alert>

                        <Stack spacing={2}>
                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle1" fontWeight={600}>
                                        💳 X-Pay (x-pay.direct)
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Pasarela externa para tarjeta. Si está desactivada, el botón "X-Pay" no carga
                                        en el dashboard del cliente.
                                    </Typography>
                                </Box>
                                {paymentsStatusLoading || localXpay === null ? (
                                    <CircularProgress size={20} />
                                ) : (
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={!!localXpay}
                                                onChange={(e) => handleToggleXpay(e.target.checked)}
                                                disabled={togglingXpay}
                                                color="success"
                                            />
                                        }
                                        label={togglingXpay ? '...' : (localXpay ? 'Activado' : 'Desactivado')}
                                        labelPlacement="start"
                                        sx={{ m: 0 }}
                                    />
                                )}
                            </Paper>

                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle1" fontWeight={600}>
                                        🏦 Pagos EntregaX (Sucursal / Transferencia)
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Flujo nativo de pago en sucursal y SPEI. Si está desactivado, el botón "Pagar"
                                        en la lista de paquetes queda deshabilitado.
                                    </Typography>
                                </Box>
                                {paymentsStatusLoading || localEntregax === null ? (
                                    <CircularProgress size={20} />
                                ) : (
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={!!localEntregax}
                                                onChange={(e) => handleToggleEntregax(e.target.checked)}
                                                disabled={togglingEntregax}
                                                color="success"
                                            />
                                        }
                                        label={togglingEntregax ? '...' : (localEntregax ? 'Activado' : 'Desactivado')}
                                        labelPlacement="start"
                                        sx={{ m: 0 }}
                                    />
                                )}
                            </Paper>

                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle1" fontWeight={600}>
                                        🛡️ Garantía Extendida (GEX)
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Permite a los clientes contratar la Garantía Extendida de tiempo de entrega
                                        (90 días) sobre sus paquetes. Si se desactiva, el botón "Contratar GEX"
                                        deja de aparecer en la app móvil y en el portal web.
                                    </Typography>
                                </Box>
                                {paymentsStatusLoading || localGex === null ? (
                                    <CircularProgress size={20} />
                                ) : (
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={!!localGex}
                                                onChange={(e) => handleToggleGex(e.target.checked)}
                                                disabled={togglingGex}
                                                color="success"
                                            />
                                        }
                                        label={togglingGex ? '...' : (localGex ? 'Activado' : 'Desactivado')}
                                        labelPlacement="start"
                                        sx={{ m: 0 }}
                                    />
                                )}
                            </Paper>
                        </Stack>
                    </CardContent>
                </Card>
            )}

            {/* Tipos de Servicio */}
            <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3 }}>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CategoryIcon color="primary" />
                            <Typography variant="h6" fontWeight={600}>
                                Tipos de Servicio
                            </Typography>
                            <Chip label={serviceTypes.length} size="small" color="primary" />
                        </Box>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => setDialogOpen(true)}
                            sx={{ borderRadius: 2 }}
                        >
                            Nuevo Servicio
                        </Button>
                    </Box>

                    <Alert severity="info" sx={{ mb: 3 }}>
                        Los tipos de servicio definen las categorías de envío disponibles y sus comisiones asociadas para asesores.
                    </Alert>

                    <TableContainer component={Paper} elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'grey.50' }}>
                                    <TableCell sx={{ fontWeight: 600 }}>Código</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>Nombre del Servicio</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }} align="center">Comisión (%)</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }} align="center">Override Líder (%)</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }} align="center">Acciones</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                                            Cargando...
                                        </TableCell>
                                    </TableRow>
                                ) : serviceTypes.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                                            No hay tipos de servicio configurados
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    serviceTypes.map((st) => (
                                        <TableRow key={st.id} hover>
                                            <TableCell>
                                                <Chip 
                                                    label={st.service_type} 
                                                    size="small" 
                                                    variant="outlined"
                                                    sx={{ fontFamily: 'monospace' }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography fontWeight={500}>{st.label}</Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                                {editingId === st.id ? (
                                                    <TextField
                                                        size="small"
                                                        type="number"
                                                        value={editValues[st.id]?.percentage || 0}
                                                        onChange={(e) => setEditValues({
                                                            ...editValues,
                                                            [st.id]: { ...editValues[st.id], percentage: parseFloat(e.target.value) || 0 }
                                                        })}
                                                        InputProps={{
                                                            endAdornment: <InputAdornment position="end">%</InputAdornment>,
                                                        }}
                                                        sx={{ width: 100 }}
                                                    />
                                                ) : (
                                                    <Chip 
                                                        label={`${st.percentage}%`} 
                                                        color="success" 
                                                        size="small"
                                                        icon={<PercentIcon />}
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell align="center">
                                                {editingId === st.id ? (
                                                    <TextField
                                                        size="small"
                                                        type="number"
                                                        value={editValues[st.id]?.leader_override || 0}
                                                        onChange={(e) => setEditValues({
                                                            ...editValues,
                                                            [st.id]: { ...editValues[st.id], leader_override: parseFloat(e.target.value) || 0 }
                                                        })}
                                                        InputProps={{
                                                            endAdornment: <InputAdornment position="end">%</InputAdornment>,
                                                        }}
                                                        sx={{ width: 100 }}
                                                    />
                                                ) : (
                                                    <Chip 
                                                        label={`${st.leader_override}%`} 
                                                        color="warning" 
                                                        size="small"
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell align="center">
                                                {editingId === st.id ? (
                                                    <Button
                                                        size="small"
                                                        variant="contained"
                                                        color="success"
                                                        startIcon={<SaveIcon />}
                                                        onClick={() => handleUpdateService(st.id)}
                                                    >
                                                        Guardar
                                                    </Button>
                                                ) : (
                                                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                                                        <Tooltip title="Editar tarifas">
                                                            <IconButton 
                                                                size="small" 
                                                                color="primary"
                                                                onClick={() => setEditingId(st.id)}
                                                            >
                                                                <EditIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Eliminar servicio">
                                                            <IconButton 
                                                                size="small" 
                                                                color="error"
                                                                onClick={() => handleDeleteService(st.id)}
                                                            >
                                                                <DeleteIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </Box>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </CardContent>
            </Card>

            {/* Dialog para nuevo servicio */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AddIcon color="primary" />
                        Nuevo Tipo de Servicio
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        <TextField
                            label="Nombre del Servicio"
                            placeholder="Ej: Liberación AA DHL"
                            value={newService.label}
                            onChange={(e) => {
                                const label = e.target.value;
                                setNewService({
                                    ...newService,
                                    label,
                                    service_type: generateServiceCode(label)
                                });
                            }}
                            fullWidth
                            required
                        />
                        <TextField
                            label="Código del Servicio"
                            placeholder="Ej: liberacion_aa_dhl"
                            value={newService.service_type}
                            onChange={(e) => setNewService({ ...newService, service_type: e.target.value })}
                            fullWidth
                            required
                            helperText="Código único interno (sin espacios, minúsculas)"
                            InputProps={{
                                sx: { fontFamily: 'monospace' }
                            }}
                        />
                        <Divider sx={{ my: 1 }} />
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                label="Comisión Asesor"
                                type="number"
                                value={newService.percentage}
                                onChange={(e) => setNewService({ ...newService, percentage: parseFloat(e.target.value) || 0 })}
                                InputProps={{
                                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                                }}
                                sx={{ flex: 1 }}
                            />
                            <TextField
                                label="Override Líder"
                                type="number"
                                value={newService.leader_override}
                                onChange={(e) => setNewService({ ...newService, leader_override: parseFloat(e.target.value) || 0 })}
                                InputProps={{
                                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                                }}
                                sx={{ flex: 1 }}
                            />
                        </Box>
                        <Alert severity="info" sx={{ mt: 1 }}>
                            <strong>Comisión:</strong> % que gana el asesor sobre el valor del envío<br />
                            <strong>Override:</strong> % adicional que gana el líder sobre la comisión del asesor
                        </Alert>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
                    <Button 
                        variant="contained" 
                        onClick={handleCreateService}
                        startIcon={<AddIcon />}
                    >
                        Crear Servicio
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert severity={snackbar.severity} variant="filled">
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
