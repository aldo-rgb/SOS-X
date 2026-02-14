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

const API_URL = 'http://localhost:3001/api';

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
