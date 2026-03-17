// ============================================
// PANEL DE GESTIÓN FCL - Contenedores Dedicados
// Gestión de contenedores FCL con gastos extras
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    Grid,
    TextField,
    Button,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    IconButton,
    Alert,
    Snackbar,
    CircularProgress,
    Divider,
    InputAdornment,
    Tooltip,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
} from '@mui/material';
import {
    DirectionsBoat as BoatIcon,
    Add as AddIcon,
    Save as SaveIcon,
    Search as SearchIcon,
    Refresh as RefreshIcon,
    Visibility as VisibilityIcon,
    Delete as DeleteIcon,
    Close as CloseIcon,
    LocalShipping as ShippingIcon,
    AttachMoney as MoneyIcon,
    Inventory as InventoryIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Colores del tema FCL
const FCL_COLOR = '#FF5722';
const FCL_DARK = '#E64A19';

interface FCLContainer {
    id: number;
    container_number: string;
    bl_number: string;
    reference_code: string;
    eta: string;
    status: string;
    total_weight_kg: number;
    total_cbm: number;
    total_packages: number;
    final_cost_mxn: number | null;
    notes: string;
    created_at: string;
    route_code: string;
    route_name: string;
    week_number: string;
    client_name: string;
    client_box_id: string;
    legacy_client_id: number | null;
    // Gastos extras
    extra_costs?: ExtraCost[];
    total_extra_costs?: number;
}

interface ExtraCost {
    id: number;
    container_id: number;
    concept: string;
    amount: number;
    currency: string;
    notes: string;
    created_at: string;
    created_by_name?: string;
}

interface FCLStats {
    total_fcl: number;
    en_transito: number;
    en_bodega: number;
    entregados: number;
    total_extra_costs: number;
}

// Función para formatear moneda
const formatCurrency = (value: number | string | null | undefined): string => {
    if (value === null || value === undefined) return '0.00';
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return '0.00';
    return numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Función para formatear fecha
const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
};

const getToken = () => localStorage.getItem('token');

export default function FCLManagementPage() {
    const [containers, setContainers] = useState<FCLContainer[]>([]);
    const [stats, setStats] = useState<FCLStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [selectedContainer, setSelectedContainer] = useState<FCLContainer | null>(null);
    const [detailDialogOpen, setDetailDialogOpen] = useState(false);
    const [extraCostDialogOpen, setExtraCostDialogOpen] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });
    
    // Estado para nuevo gasto extra
    const [newExtraCost, setNewExtraCost] = useState({
        concept: '',
        amount: '',
        currency: 'MXN',
        notes: ''
    });

    // Cargar contenedores FCL
    const fetchContainers = useCallback(async () => {
        try {
            setLoading(true);
            const params: Record<string, string> = { type: 'fcl' };
            if (statusFilter !== 'all') params.status = statusFilter;
            if (searchTerm) params.search = searchTerm;

            const [containersRes, statsRes] = await Promise.all([
                axios.get(`${API_URL}/api/maritime/fcl/containers`, {
                    headers: { Authorization: `Bearer ${getToken()}` },
                    params
                }),
                axios.get(`${API_URL}/api/maritime/fcl/stats`, {
                    headers: { Authorization: `Bearer ${getToken()}` }
                })
            ]);

            setContainers(containersRes.data);
            setStats(statsRes.data);
        } catch (error) {
            console.error('Error fetching FCL containers:', error);
            setSnackbar({ open: true, message: 'Error al cargar contenedores FCL', severity: 'error' });
        } finally {
            setLoading(false);
        }
    }, [statusFilter, searchTerm]);

    useEffect(() => {
        fetchContainers();
    }, [fetchContainers]);

    // Abrir detalle del contenedor
    const handleOpenDetail = async (container: FCLContainer) => {
        try {
            // Cargar gastos extras del contenedor
            const res = await axios.get(`${API_URL}/api/maritime/fcl/containers/${container.id}/extra-costs`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setSelectedContainer({
                ...container,
                extra_costs: res.data.costs,
                total_extra_costs: res.data.total
            });
            setDetailDialogOpen(true);
        } catch (error) {
            console.error('Error loading container details:', error);
            setSelectedContainer(container);
            setDetailDialogOpen(true);
        }
    };

    // Agregar gasto extra
    const handleAddExtraCost = async () => {
        if (!selectedContainer || !newExtraCost.concept || !newExtraCost.amount) {
            setSnackbar({ open: true, message: 'Completa todos los campos requeridos', severity: 'error' });
            return;
        }

        try {
            await axios.post(`${API_URL}/api/maritime/fcl/containers/${selectedContainer.id}/extra-costs`, {
                concept: newExtraCost.concept,
                amount: parseFloat(newExtraCost.amount),
                currency: newExtraCost.currency,
                notes: newExtraCost.notes
            }, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });

            setSnackbar({ open: true, message: 'Gasto extra agregado correctamente', severity: 'success' });
            setExtraCostDialogOpen(false);
            setNewExtraCost({ concept: '', amount: '', currency: 'MXN', notes: '' });
            
            // Recargar detalles
            handleOpenDetail(selectedContainer);
            fetchContainers();
        } catch (error) {
            console.error('Error adding extra cost:', error);
            setSnackbar({ open: true, message: 'Error al agregar gasto extra', severity: 'error' });
        }
    };

    // Eliminar gasto extra
    const handleDeleteExtraCost = async (costId: number) => {
        if (!selectedContainer) return;
        
        if (!confirm('¿Estás seguro de eliminar este gasto?')) return;

        try {
            await axios.delete(`${API_URL}/api/maritime/fcl/containers/${selectedContainer.id}/extra-costs/${costId}`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });

            setSnackbar({ open: true, message: 'Gasto eliminado correctamente', severity: 'success' });
            handleOpenDetail(selectedContainer);
            fetchContainers();
        } catch (error) {
            console.error('Error deleting extra cost:', error);
            setSnackbar({ open: true, message: 'Error al eliminar gasto', severity: 'error' });
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'in_transit': return 'info';
            case 'at_port': return 'warning';
            case 'in_warehouse': return 'secondary';
            case 'delivered': return 'success';
            case 'cancelled': return 'error';
            default: return 'default';
        }
    };

    const getStatusLabel = (status: string) => {
        const labels: Record<string, string> = {
            'pending': 'Pendiente',
            'in_transit': 'En Tránsito',
            'at_port': 'En Puerto',
            'in_warehouse': 'En Bodega',
            'delivered': 'Entregado',
            'cancelled': 'Cancelado'
        };
        return labels[status] || status;
    };

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <BoatIcon sx={{ fontSize: 40, color: FCL_COLOR }} />
                    <Box>
                        <Typography variant="h4" fontWeight="bold">
                            🚢 Gestión FCL - Dedicados
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Administración de contenedores FCL y gastos extras
                        </Typography>
                    </Box>
                </Box>
                <Button
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    onClick={fetchContainers}
                    sx={{ borderColor: FCL_COLOR, color: FCL_COLOR }}
                >
                    Actualizar
                </Button>
            </Box>

            {/* Stats Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <Card sx={{ bgcolor: '#FFF3E0' }}>
                        <CardContent>
                            <Typography variant="h3" fontWeight="bold" color={FCL_COLOR}>
                                {stats?.total_fcl || 0}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                📦 Total FCL
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <Card sx={{ bgcolor: '#E3F2FD' }}>
                        <CardContent>
                            <Typography variant="h3" fontWeight="bold" color="#1976D2">
                                {stats?.en_transito || 0}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                🚢 En Tránsito
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <Card sx={{ bgcolor: '#E8F5E9' }}>
                        <CardContent>
                            <Typography variant="h3" fontWeight="bold" color="#388E3C">
                                {stats?.en_bodega || 0}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                🏭 En Bodega
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <Card sx={{ bgcolor: '#FCE4EC' }}>
                        <CardContent>
                            <Typography variant="h3" fontWeight="bold" color="#C2185B">
                                ${formatCurrency(stats?.total_extra_costs || 0)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                💰 Total Gastos Extras
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Filtros */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Grid container spacing={2} sx={{ alignItems: 'center' }}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                            fullWidth
                            placeholder="Buscar por contenedor, BL, referencia, cliente..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon />
                                    </InputAdornment>
                                ),
                            }}
                            size="small"
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            {['all', 'in_transit', 'in_warehouse', 'delivered'].map((status) => (
                                <Chip
                                    key={status}
                                    label={status === 'all' ? 'Todos' : getStatusLabel(status)}
                                    onClick={() => setStatusFilter(status)}
                                    color={statusFilter === status ? 'primary' : 'default'}
                                    variant={statusFilter === status ? 'filled' : 'outlined'}
                                />
                            ))}
                        </Box>
                    </Grid>
                </Grid>
            </Paper>

            {/* Tabla de Contenedores */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                    <CircularProgress />
                </Box>
            ) : containers.length === 0 ? (
                <Paper sx={{ p: 5, textAlign: 'center' }}>
                    <BoatIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">
                        No hay contenedores FCL registrados
                    </Typography>
                </Paper>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ bgcolor: FCL_COLOR }}>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Referencia</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Contenedor</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>BL</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Cliente</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Ruta</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>ETA</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Estado</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Gastos Extras</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Acciones</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {containers.map((container) => (
                                <TableRow key={container.id} hover>
                                    <TableCell>
                                        <Typography fontWeight="bold" color={FCL_DARK}>
                                            {container.reference_code || '-'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography fontFamily="monospace">
                                            {container.container_number}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>{container.bl_number || '-'}</TableCell>
                                    <TableCell>
                                        <Box>
                                            <Typography variant="body2" fontWeight="bold">
                                                {container.client_name || 'Sin asignar'}
                                            </Typography>
                                            {container.client_box_id && (
                                                <Typography variant="caption" color="text.secondary">
                                                    {container.client_box_id}
                                                </Typography>
                                            )}
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        {container.route_code && (
                                            <Chip size="small" label={container.route_code} />
                                        )}
                                    </TableCell>
                                    <TableCell>{formatDate(container.eta)}</TableCell>
                                    <TableCell>
                                        <Chip 
                                            size="small" 
                                            label={getStatusLabel(container.status)}
                                            color={getStatusColor(container.status) as any}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Typography fontWeight="bold" color={container.total_extra_costs ? FCL_COLOR : 'text.secondary'}>
                                            ${formatCurrency(container.total_extra_costs || 0)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                                            <Tooltip title="Ver detalles">
                                                <IconButton 
                                                    size="small" 
                                                    onClick={() => handleOpenDetail(container)}
                                                    sx={{ color: FCL_COLOR }}
                                                >
                                                    <VisibilityIcon />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Agregar gasto">
                                                <IconButton 
                                                    size="small" 
                                                    onClick={() => {
                                                        setSelectedContainer(container);
                                                        setExtraCostDialogOpen(true);
                                                    }}
                                                    color="success"
                                                >
                                                    <AddIcon />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Dialog de Detalles */}
            <Dialog 
                open={detailDialogOpen} 
                onClose={() => setDetailDialogOpen(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle sx={{ bgcolor: FCL_COLOR, color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BoatIcon />
                        <span>Detalle FCL: {selectedContainer?.container_number}</span>
                    </Box>
                    <IconButton onClick={() => setDetailDialogOpen(false)} sx={{ color: 'white' }}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {selectedContainer && (
                        <Grid container spacing={3}>
                            {/* Información General */}
                            <Grid size={{ xs: 12 }}>
                                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <InventoryIcon /> Información del Contenedor
                                </Typography>
                                <Grid container spacing={2}>
                                    <Grid size={{ xs: 6, sm: 3 }}>
                                        <Typography variant="caption" color="text.secondary">Referencia</Typography>
                                        <Typography fontWeight="bold">{selectedContainer.reference_code || '-'}</Typography>
                                    </Grid>
                                    <Grid size={{ xs: 6, sm: 3 }}>
                                        <Typography variant="caption" color="text.secondary">Contenedor</Typography>
                                        <Typography fontFamily="monospace">{selectedContainer.container_number}</Typography>
                                    </Grid>
                                    <Grid size={{ xs: 6, sm: 3 }}>
                                        <Typography variant="caption" color="text.secondary">BL</Typography>
                                        <Typography>{selectedContainer.bl_number || '-'}</Typography>
                                    </Grid>
                                    <Grid size={{ xs: 6, sm: 3 }}>
                                        <Typography variant="caption" color="text.secondary">Estado</Typography>
                                        <Chip size="small" label={getStatusLabel(selectedContainer.status)} color={getStatusColor(selectedContainer.status) as any} />
                                    </Grid>
                                    <Grid size={{ xs: 6, sm: 3 }}>
                                        <Typography variant="caption" color="text.secondary">Cliente</Typography>
                                        <Typography fontWeight="bold">{selectedContainer.client_name || 'Sin asignar'}</Typography>
                                    </Grid>
                                    <Grid size={{ xs: 6, sm: 3 }}>
                                        <Typography variant="caption" color="text.secondary">Ruta</Typography>
                                        <Typography>{selectedContainer.route_code} - {selectedContainer.route_name}</Typography>
                                    </Grid>
                                    <Grid size={{ xs: 6, sm: 3 }}>
                                        <Typography variant="caption" color="text.secondary">Semana</Typography>
                                        <Typography>{selectedContainer.week_number || '-'}</Typography>
                                    </Grid>
                                    <Grid size={{ xs: 6, sm: 3 }}>
                                        <Typography variant="caption" color="text.secondary">ETA</Typography>
                                        <Typography>{formatDate(selectedContainer.eta)}</Typography>
                                    </Grid>
                                </Grid>
                            </Grid>

                            <Grid size={{ xs: 12 }}>
                                <Divider />
                            </Grid>

                            {/* Medidas */}
                            <Grid size={{ xs: 12 }}>
                                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <ShippingIcon /> Medidas
                                </Typography>
                                <Grid container spacing={2}>
                                    <Grid size={{ xs: 4 }}>
                                        <Card variant="outlined">
                                            <CardContent sx={{ textAlign: 'center' }}>
                                                <Typography variant="h5" fontWeight="bold">{formatCurrency(selectedContainer.total_weight_kg)} kg</Typography>
                                                <Typography variant="caption" color="text.secondary">Peso Total</Typography>
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                    <Grid size={{ xs: 4 }}>
                                        <Card variant="outlined">
                                            <CardContent sx={{ textAlign: 'center' }}>
                                                <Typography variant="h5" fontWeight="bold">{formatCurrency(selectedContainer.total_cbm)} m³</Typography>
                                                <Typography variant="caption" color="text.secondary">CBM Total</Typography>
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                    <Grid size={{ xs: 4 }}>
                                        <Card variant="outlined">
                                            <CardContent sx={{ textAlign: 'center' }}>
                                                <Typography variant="h5" fontWeight="bold">{selectedContainer.total_packages || 0}</Typography>
                                                <Typography variant="caption" color="text.secondary">Bultos</Typography>
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                </Grid>
                            </Grid>

                            <Grid size={{ xs: 12 }}>
                                <Divider />
                            </Grid>

                            {/* Gastos Extras */}
                            <Grid size={{ xs: 12 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <MoneyIcon /> Gastos Extras
                                    </Typography>
                                    <Button
                                        variant="contained"
                                        size="small"
                                        startIcon={<AddIcon />}
                                        onClick={() => setExtraCostDialogOpen(true)}
                                        sx={{ bgcolor: FCL_COLOR }}
                                    >
                                        Agregar Gasto
                                    </Button>
                                </Box>

                                {selectedContainer.extra_costs && selectedContainer.extra_costs.length > 0 ? (
                                    <TableContainer component={Paper} variant="outlined">
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                                    <TableCell>Concepto</TableCell>
                                                    <TableCell align="right">Monto</TableCell>
                                                    <TableCell>Notas</TableCell>
                                                    <TableCell>Fecha</TableCell>
                                                    <TableCell align="center">Acciones</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {selectedContainer.extra_costs.map((cost) => (
                                                    <TableRow key={cost.id}>
                                                        <TableCell>{cost.concept}</TableCell>
                                                        <TableCell align="right">
                                                            <Typography fontWeight="bold">
                                                                ${formatCurrency(cost.amount)} {cost.currency}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell>{cost.notes || '-'}</TableCell>
                                                        <TableCell>{formatDate(cost.created_at)}</TableCell>
                                                        <TableCell align="center">
                                                            <IconButton 
                                                                size="small" 
                                                                color="error"
                                                                onClick={() => handleDeleteExtraCost(cost.id)}
                                                            >
                                                                <DeleteIcon fontSize="small" />
                                                            </IconButton>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                                <TableRow sx={{ bgcolor: '#E8F5E9' }}>
                                                    <TableCell colSpan={1}>
                                                        <Typography fontWeight="bold">TOTAL</Typography>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Typography variant="h6" fontWeight="bold" color={FCL_COLOR}>
                                                            ${formatCurrency(selectedContainer.total_extra_costs || 0)}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell colSpan={3}></TableCell>
                                                </TableRow>
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                ) : (
                                    <Paper sx={{ p: 3, textAlign: 'center', bgcolor: '#f5f5f5' }}>
                                        <Typography color="text.secondary">
                                            No hay gastos extras registrados para este contenedor
                                        </Typography>
                                    </Paper>
                                )}
                            </Grid>

                            {/* Notas */}
                            {selectedContainer.notes && (
                                <Grid size={{ xs: 12 }}>
                                    <Typography variant="h6" gutterBottom>📝 Notas</Typography>
                                    <Paper sx={{ p: 2, bgcolor: '#FFF8E1' }}>
                                        <Typography>{selectedContainer.notes}</Typography>
                                    </Paper>
                                </Grid>
                            )}
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDetailDialogOpen(false)}>Cerrar</Button>
                </DialogActions>
            </Dialog>

            {/* Dialog para agregar gasto extra */}
            <Dialog
                open={extraCostDialogOpen}
                onClose={() => setExtraCostDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle sx={{ bgcolor: FCL_COLOR, color: 'white' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AddIcon />
                        <span>Agregar Gasto Extra</span>
                    </Box>
                </DialogTitle>
                <DialogContent dividers>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid size={{ xs: 12 }}>
                            <FormControl fullWidth>
                                <InputLabel>Concepto</InputLabel>
                                <Select
                                    value={newExtraCost.concept}
                                    label="Concepto"
                                    onChange={(e) => setNewExtraCost({ ...newExtraCost, concept: e.target.value })}
                                >
                                    <MenuItem value="almacenaje">Almacenaje</MenuItem>
                                    <MenuItem value="maniobras">Maniobras</MenuItem>
                                    <MenuItem value="demoras">Demoras</MenuItem>
                                    <MenuItem value="fumigacion">Fumigación</MenuItem>
                                    <MenuItem value="inspeccion">Inspección</MenuItem>
                                    <MenuItem value="transporte_local">Transporte Local</MenuItem>
                                    <MenuItem value="custodia">Custodia</MenuItem>
                                    <MenuItem value="seguro">Seguro</MenuItem>
                                    <MenuItem value="documentacion">Documentación</MenuItem>
                                    <MenuItem value="otro">Otro</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={{ xs: 8 }}>
                            <TextField
                                fullWidth
                                label="Monto"
                                type="number"
                                value={newExtraCost.amount}
                                onChange={(e) => setNewExtraCost({ ...newExtraCost, amount: e.target.value })}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">$</InputAdornment>
                                }}
                            />
                        </Grid>
                        <Grid size={{ xs: 4 }}>
                            <FormControl fullWidth>
                                <InputLabel>Moneda</InputLabel>
                                <Select
                                    value={newExtraCost.currency}
                                    label="Moneda"
                                    onChange={(e) => setNewExtraCost({ ...newExtraCost, currency: e.target.value })}
                                >
                                    <MenuItem value="MXN">MXN</MenuItem>
                                    <MenuItem value="USD">USD</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                fullWidth
                                label="Notas (opcional)"
                                multiline
                                rows={2}
                                value={newExtraCost.notes}
                                onChange={(e) => setNewExtraCost({ ...newExtraCost, notes: e.target.value })}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setExtraCostDialogOpen(false)}>Cancelar</Button>
                    <Button 
                        variant="contained" 
                        onClick={handleAddExtraCost}
                        sx={{ bgcolor: FCL_COLOR }}
                        startIcon={<SaveIcon />}
                    >
                        Guardar
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
