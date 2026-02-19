// ============================================
// PANEL DE CONTROL DE ANTICIPOS A PROVEEDORES
// Sistema Ledger - Gestión de saldos a favor
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
    Tabs,
    Tab,
    LinearProgress,
    InputAdornment,
    Tooltip,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Collapse,
} from '@mui/material';
import {
    AccountBalance as AccountBalanceIcon,
    Add as AddIcon,
    AttachMoney as MoneyIcon,
    Business as BusinessIcon,
    Receipt as ReceiptIcon,
    History as HistoryIcon,
    Visibility as VisibilityIcon,
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    CloudUpload as UploadIcon,
    TrendingUp as TrendingUpIcon,
    Refresh as RefreshIcon,
    Assignment as AssignmentIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Colores del tema
const THEME_COLOR = '#00BCD4';

// Interfaces
interface Proveedor {
    id: number;
    nombre: string;
    referencia: string | null;
    tipo: string;
    contacto_nombre: string | null;
    contacto_email: string | null;
    contacto_telefono: string | null;
    banco: string | null;
    cuenta_bancaria: string | null;
    clabe: string | null;
    notas: string | null;
    is_active: boolean;
    saldo_total_disponible: number;
    total_bolsas: number;
}

interface Bolsa {
    id: number;
    proveedor_id: number;
    proveedor_nombre: string;
    proveedor_tipo: string;
    monto_original: number;
    saldo_disponible: number;
    monto_utilizado: number;
    porcentaje_utilizado: number;
    fecha_pago: string;
    comprobante_url: string | null;
    referencia_pago: string | null;
    numero_operacion: string | null;
    estado: string;
    total_asignaciones: number;
}

interface Asignacion {
    id: number;
    bolsa_anticipo_id: number;
    bolsa_referencia: string;
    proveedor_nombre: string;
    container_id: number;
    container_number: string;
    campo_anticipo: string;
    monto_asignado: number;
    concepto: string | null;
    fecha_asignacion: string;
    asignado_por: string;
    is_active: boolean;
}

interface Stats {
    total_proveedores: number;
    bolsas_activas: number;
    saldo_total_disponible: number;
    total_depositado: number;
    total_asignaciones_activas: number;
    total_asignado: number;
}

// Formateo de moneda
const formatCurrency = (value: number | string | null): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (num === null || num === undefined || isNaN(num)) return '0.00';
    return num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function AdvanceControlPanel() {
    // Estados principales
    const [tabValue, setTabValue] = useState(0);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<Stats | null>(null);
    
    // Proveedores
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [selectedProveedor, setSelectedProveedor] = useState<Proveedor | null>(null);
    const [proveedorDialog, setProveedorDialog] = useState(false);
    const [newProveedor, setNewProveedor] = useState({ nombre: '', referencia: '', tipo: 'agente_aduanal' });
    
    // Bolsas
    const [bolsas, setBolsas] = useState<Bolsa[]>([]);
    const [bolsaDialog, setBolsaDialog] = useState(false);
    const [newBolsa, setNewBolsa] = useState({
        proveedor_id: 0,
        monto_original: '',
        fecha_pago: new Date().toISOString().split('T')[0],
        referencia_pago: '',
        numero_operacion: '',
        banco_origen: '',
        notas: ''
    });
    const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
    
    // Asignaciones
    const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
    const [expandedBolsa, setExpandedBolsa] = useState<number | null>(null);
    
    // UI
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'info' });
    const [saving, setSaving] = useState(false);

    const getToken = () => localStorage.getItem('token');

    // Cargar datos
    const fetchStats = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/anticipos/stats`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setStats(res.data);
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    }, []);

    const fetchProveedores = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/anticipos/proveedores`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setProveedores(res.data);
        } catch (error) {
            console.error('Error fetching proveedores:', error);
        }
    }, []);

    const fetchBolsas = useCallback(async (proveedorId?: number) => {
        try {
            const url = proveedorId 
                ? `${API_URL}/api/anticipos/bolsas?proveedor_id=${proveedorId}`
                : `${API_URL}/api/anticipos/bolsas`;
            const res = await axios.get(url, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setBolsas(res.data);
        } catch (error) {
            console.error('Error fetching bolsas:', error);
        }
    }, []);

    const fetchAsignacionesBolsa = async (bolsaId: number) => {
        try {
            const res = await axios.get(`${API_URL}/api/anticipos/bolsas/${bolsaId}/asignaciones`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setAsignaciones(res.data);
        } catch (error) {
            console.error('Error fetching asignaciones:', error);
        }
    };

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await Promise.all([fetchStats(), fetchProveedores(), fetchBolsas()]);
            setLoading(false);
        };
        loadData();
    }, [fetchStats, fetchProveedores, fetchBolsas]);

    // Crear proveedor
    const handleCreateProveedor = async () => {
        if (!newProveedor.nombre.trim()) {
            setSnackbar({ open: true, message: 'El nombre es requerido', severity: 'error' });
            return;
        }
        setSaving(true);
        try {
            await axios.post(`${API_URL}/api/anticipos/proveedores`, newProveedor, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setSnackbar({ open: true, message: 'Proveedor creado exitosamente', severity: 'success' });
            setProveedorDialog(false);
            setNewProveedor({ nombre: '', referencia: '', tipo: 'agente_aduanal' });
            fetchProveedores();
            fetchStats();
        } catch (error) {
            setSnackbar({ open: true, message: 'Error al crear proveedor', severity: 'error' });
        } finally {
            setSaving(false);
        }
    };

    // Crear bolsa de anticipo
    const handleCreateBolsa = async () => {
        if (!newBolsa.proveedor_id || !newBolsa.monto_original || !newBolsa.fecha_pago) {
            setSnackbar({ open: true, message: 'Proveedor, monto y fecha son requeridos', severity: 'error' });
            return;
        }
        setSaving(true);
        try {
            const formData = new FormData();
            formData.append('proveedor_id', String(newBolsa.proveedor_id));
            formData.append('monto_original', newBolsa.monto_original);
            formData.append('fecha_pago', newBolsa.fecha_pago);
            formData.append('referencia_pago', newBolsa.referencia_pago);
            formData.append('numero_operacion', newBolsa.numero_operacion);
            formData.append('banco_origen', newBolsa.banco_origen);
            formData.append('notas', newBolsa.notas);
            if (comprobanteFile) {
                formData.append('comprobante', comprobanteFile);
            }

            await axios.post(`${API_URL}/api/anticipos/bolsas`, formData, {
                headers: { 
                    Authorization: `Bearer ${getToken()}`,
                    'Content-Type': 'multipart/form-data'
                }
            });
            setSnackbar({ open: true, message: 'Depósito registrado exitosamente', severity: 'success' });
            setBolsaDialog(false);
            setNewBolsa({
                proveedor_id: 0,
                monto_original: '',
                fecha_pago: new Date().toISOString().split('T')[0],
                referencia_pago: '',
                numero_operacion: '',
                banco_origen: '',
                notas: ''
            });
            setComprobanteFile(null);
            fetchBolsas();
            fetchProveedores();
            fetchStats();
        } catch (error) {
            setSnackbar({ open: true, message: 'Error al registrar depósito', severity: 'error' });
        } finally {
            setSaving(false);
        }
    };

    // Toggle expandir bolsa para ver historial
    const toggleExpandBolsa = (bolsaId: number) => {
        if (expandedBolsa === bolsaId) {
            setExpandedBolsa(null);
        } else {
            setExpandedBolsa(bolsaId);
            fetchAsignacionesBolsa(bolsaId);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                <Box>
                    <Typography variant="h4" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AccountBalanceIcon sx={{ color: THEME_COLOR }} />
                        Control de Anticipos
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Sistema Ledger - Gestión de depósitos a proveedores
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={() => { fetchStats(); fetchProveedores(); fetchBolsas(); }}
                    >
                        Actualizar
                    </Button>
                </Box>
            </Box>

            {/* Estadísticas */}
            {stats && (
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid size={{ xs: 6, md: 2 }}>
                        <Card sx={{ bgcolor: '#E3F2FD' }}>
                            <CardContent sx={{ textAlign: 'center', py: 2 }}>
                                <BusinessIcon sx={{ fontSize: 30, color: '#1976D2' }} />
                                <Typography variant="h5" fontWeight="bold">{stats.total_proveedores}</Typography>
                                <Typography variant="caption">Proveedores</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 6, md: 2 }}>
                        <Card sx={{ bgcolor: '#E8F5E9' }}>
                            <CardContent sx={{ textAlign: 'center', py: 2 }}>
                                <ReceiptIcon sx={{ fontSize: 30, color: '#388E3C' }} />
                                <Typography variant="h5" fontWeight="bold">{stats.bolsas_activas}</Typography>
                                <Typography variant="caption">Bolsas Activas</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 6, md: 2 }}>
                        <Card sx={{ bgcolor: '#FFF3E0' }}>
                            <CardContent sx={{ textAlign: 'center', py: 2 }}>
                                <MoneyIcon sx={{ fontSize: 30, color: '#F57C00' }} />
                                <Typography variant="h6" fontWeight="bold">${formatCurrency(stats.total_depositado)}</Typography>
                                <Typography variant="caption">Total Depositado</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                        <Card sx={{ bgcolor: '#E8F5E9', border: '2px solid #4CAF50' }}>
                            <CardContent sx={{ textAlign: 'center', py: 2 }}>
                                <TrendingUpIcon sx={{ fontSize: 30, color: '#2E7D32' }} />
                                <Typography variant="h5" fontWeight="bold" color="success.main">
                                    ${formatCurrency(stats.saldo_total_disponible)}
                                </Typography>
                                <Typography variant="caption">Saldo Disponible</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 12, md: 3 }}>
                        <Card sx={{ bgcolor: '#FCE4EC' }}>
                            <CardContent sx={{ textAlign: 'center', py: 2 }}>
                                <AssignmentIcon sx={{ fontSize: 30, color: '#C2185B' }} />
                                <Typography variant="h6" fontWeight="bold">${formatCurrency(stats.total_asignado)}</Typography>
                                <Typography variant="caption">Asignado ({stats.total_asignaciones_activas} asign.)</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            )}

            {/* Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
                    <Tab icon={<BusinessIcon />} label="Proveedores" />
                    <Tab icon={<ReceiptIcon />} label="Depósitos (Bolsas)" />
                </Tabs>
            </Box>

            {/* Tab 0: Proveedores */}
            {tabValue === 0 && (
                <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="h6">Proveedores / Agentes</Typography>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => setProveedorDialog(true)}
                            sx={{ bgcolor: THEME_COLOR }}
                        >
                            Nuevo Proveedor
                        </Button>
                    </Box>

                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                    <TableCell><strong>Nombre</strong></TableCell>
                                    <TableCell><strong>Referencia</strong></TableCell>
                                    <TableCell><strong>Tipo</strong></TableCell>
                                    <TableCell align="center"><strong>Bolsas</strong></TableCell>
                                    <TableCell align="right"><strong>Saldo Disponible</strong></TableCell>
                                    <TableCell align="center"><strong>Acciones</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {proveedores.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center">
                                            <Typography color="text.secondary" sx={{ py: 3 }}>
                                                No hay proveedores registrados. Crea el primero.
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    proveedores.map((prov) => (
                                        <TableRow key={prov.id} hover>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <BusinessIcon color="action" />
                                                    <Typography fontWeight="bold">{prov.nombre}</Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontFamily="monospace">
                                                    {prov.referencia || '-'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={prov.tipo === 'agente_aduanal' ? 'Agente Aduanal' : prov.tipo}
                                                    size="small"
                                                    color={prov.tipo === 'agente_aduanal' ? 'primary' : 'default'}
                                                />
                                            </TableCell>
                                            <TableCell align="center">
                                                <Chip label={prov.total_bolsas} size="small" />
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography fontWeight="bold" color={parseFloat(String(prov.saldo_total_disponible)) > 0 ? 'success.main' : 'text.secondary'}>
                                                    ${formatCurrency(prov.saldo_total_disponible)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                                <Tooltip title="Ver bolsas">
                                                    <IconButton 
                                                        size="small"
                                                        onClick={() => {
                                                            setSelectedProveedor(prov);
                                                            fetchBolsas(prov.id);
                                                            setTabValue(1);
                                                        }}
                                                    >
                                                        <VisibilityIcon />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            )}

            {/* Tab 1: Bolsas de Anticipos */}
            {tabValue === 1 && (
                <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                        <Box>
                            <Typography variant="h6">Depósitos (Bolsas de Anticipo)</Typography>
                            {selectedProveedor && (
                                <Chip 
                                    label={`Filtrado: ${selectedProveedor.nombre}`}
                                    onDelete={() => { setSelectedProveedor(null); fetchBolsas(); }}
                                    color="primary"
                                    size="small"
                                />
                            )}
                        </Box>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => setBolsaDialog(true)}
                            sx={{ bgcolor: THEME_COLOR }}
                        >
                            Nuevo Depósito
                        </Button>
                    </Box>

                    {bolsas.length === 0 ? (
                        <Alert severity="info">
                            No hay depósitos registrados. Registra un depósito para comenzar a asignar anticipos.
                        </Alert>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {bolsas.map((bolsa) => (
                                <Card key={bolsa.id} variant="outlined">
                                    <CardContent>
                                        <Grid container spacing={2} alignItems="center">
                                            <Grid size={{ xs: 12, md: 3 }}>
                                                <Typography variant="subtitle2" color="text.secondary">Proveedor</Typography>
                                                <Typography fontWeight="bold">{bolsa.proveedor_nombre}</Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {bolsa.referencia_pago || 'Sin referencia'}
                                                </Typography>
                                            </Grid>
                                            <Grid size={{ xs: 6, md: 2 }}>
                                                <Typography variant="subtitle2" color="text.secondary">Fecha Pago</Typography>
                                                <Typography>{new Date(bolsa.fecha_pago).toLocaleDateString()}</Typography>
                                            </Grid>
                                            <Grid size={{ xs: 6, md: 2 }}>
                                                <Typography variant="subtitle2" color="text.secondary">Monto Original</Typography>
                                                <Typography fontWeight="bold">${formatCurrency(bolsa.monto_original)}</Typography>
                                            </Grid>
                                            <Grid size={{ xs: 6, md: 2 }}>
                                                <Typography variant="subtitle2" color="text.secondary">Saldo Disponible</Typography>
                                                <Typography fontWeight="bold" color={parseFloat(String(bolsa.saldo_disponible)) > 0 ? 'success.main' : 'error.main'}>
                                                    ${formatCurrency(bolsa.saldo_disponible)}
                                                </Typography>
                                            </Grid>
                                            <Grid size={{ xs: 6, md: 2 }}>
                                                <Typography variant="subtitle2" color="text.secondary">Utilizado</Typography>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <LinearProgress 
                                                        variant="determinate" 
                                                        value={Math.min(bolsa.porcentaje_utilizado, 100)} 
                                                        sx={{ flex: 1, height: 8, borderRadius: 4 }}
                                                        color={bolsa.porcentaje_utilizado >= 100 ? 'error' : 'primary'}
                                                    />
                                                    <Typography variant="caption">{bolsa.porcentaje_utilizado}%</Typography>
                                                </Box>
                                            </Grid>
                                            <Grid size={{ xs: 12, md: 1 }}>
                                                <Box sx={{ display: 'flex', gap: 1 }}>
                                                    {bolsa.comprobante_url && (
                                                        <Tooltip title="Ver comprobante">
                                                            <IconButton size="small" onClick={() => window.open(bolsa.comprobante_url!, '_blank')}>
                                                                <VisibilityIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                    <Tooltip title={expandedBolsa === bolsa.id ? 'Ocultar historial' : 'Ver historial'}>
                                                        <IconButton size="small" onClick={() => toggleExpandBolsa(bolsa.id)}>
                                                            {expandedBolsa === bolsa.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                                        </IconButton>
                                                    </Tooltip>
                                                </Box>
                                            </Grid>
                                        </Grid>

                                        {/* Historial de asignaciones */}
                                        <Collapse in={expandedBolsa === bolsa.id}>
                                            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #eee' }}>
                                                <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <HistoryIcon fontSize="small" /> Historial de Asignaciones ({bolsa.total_asignaciones})
                                                </Typography>
                                                {asignaciones.length === 0 ? (
                                                    <Typography variant="body2" color="text.secondary">
                                                        No hay asignaciones para esta bolsa.
                                                    </Typography>
                                                ) : (
                                                    <TableContainer>
                                                        <Table size="small">
                                                            <TableHead>
                                                                <TableRow>
                                                                    <TableCell>Contenedor</TableCell>
                                                                    <TableCell>Campo</TableCell>
                                                                    <TableCell align="right">Monto</TableCell>
                                                                    <TableCell>Fecha</TableCell>
                                                                    <TableCell>Estado</TableCell>
                                                                </TableRow>
                                                            </TableHead>
                                                            <TableBody>
                                                                {asignaciones.filter(a => a.bolsa_anticipo_id === bolsa.id).map((asig) => (
                                                                    <TableRow key={asig.id}>
                                                                        <TableCell>
                                                                            <Typography variant="body2" fontFamily="monospace">
                                                                                {asig.container_number}
                                                                            </Typography>
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            <Chip 
                                                                                label={asig.campo_anticipo.replace('advance_', 'Anticipo ')}
                                                                                size="small"
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell align="right">
                                                                            <Typography fontWeight="bold">
                                                                                ${formatCurrency(asig.monto_asignado)}
                                                                            </Typography>
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            {new Date(asig.fecha_asignacion).toLocaleDateString()}
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            {asig.is_active ? (
                                                                                <Chip label="Activo" size="small" color="success" />
                                                                            ) : (
                                                                                <Chip label="Revertido" size="small" color="error" />
                                                                            )}
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </TableContainer>
                                                )}
                                            </Box>
                                        </Collapse>
                                    </CardContent>
                                </Card>
                            ))}
                        </Box>
                    )}
                </Box>
            )}

            {/* Dialog: Nuevo Proveedor */}
            <Dialog open={proveedorDialog} onClose={() => setProveedorDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ bgcolor: THEME_COLOR, color: 'white' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BusinessIcon />
                        Nuevo Proveedor / Agente
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                fullWidth
                                label="Nombre del Proveedor *"
                                value={newProveedor.nombre}
                                onChange={(e) => setNewProveedor({ ...newProveedor, nombre: e.target.value })}
                                placeholder="Ej: Agente Aduanal Manzanillo"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                label="Referencia / RFC"
                                value={newProveedor.referencia}
                                onChange={(e) => setNewProveedor({ ...newProveedor, referencia: e.target.value })}
                                placeholder="Ej: AA-MZT-001"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormControl fullWidth>
                                <InputLabel>Tipo</InputLabel>
                                <Select
                                    value={newProveedor.tipo}
                                    label="Tipo"
                                    onChange={(e) => setNewProveedor({ ...newProveedor, tipo: e.target.value })}
                                >
                                    <MenuItem value="agente_aduanal">Agente Aduanal</MenuItem>
                                    <MenuItem value="proveedor_logistica">Proveedor Logística</MenuItem>
                                    <MenuItem value="naviera">Naviera</MenuItem>
                                    <MenuItem value="otro">Otro</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setProveedorDialog(false)}>Cancelar</Button>
                    <Button 
                        variant="contained" 
                        onClick={handleCreateProveedor}
                        disabled={saving}
                        sx={{ bgcolor: THEME_COLOR }}
                    >
                        {saving ? <CircularProgress size={20} /> : 'Guardar'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog: Nuevo Depósito */}
            <Dialog open={bolsaDialog} onClose={() => setBolsaDialog(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ bgcolor: THEME_COLOR, color: 'white' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <MoneyIcon />
                        Registrar Nuevo Depósito (Anticipo)
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        💡 Registra aquí los depósitos globales que realizas a proveedores. Luego podrás asignar montos específicos a cada contenedor.
                    </Alert>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid size={{ xs: 12 }}>
                            <FormControl fullWidth required>
                                <InputLabel>Proveedor *</InputLabel>
                                <Select
                                    value={newBolsa.proveedor_id}
                                    label="Proveedor *"
                                    onChange={(e) => setNewBolsa({ ...newBolsa, proveedor_id: Number(e.target.value) })}
                                >
                                    {proveedores.map((prov) => (
                                        <MenuItem key={prov.id} value={prov.id}>
                                            {prov.nombre} {prov.referencia && `(${prov.referencia})`}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                required
                                label="Monto del Depósito *"
                                type="number"
                                value={newBolsa.monto_original}
                                onChange={(e) => setNewBolsa({ ...newBolsa, monto_original: e.target.value })}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">$</InputAdornment>
                                }}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                required
                                label="Fecha de Pago *"
                                type="date"
                                value={newBolsa.fecha_pago}
                                onChange={(e) => setNewBolsa({ ...newBolsa, fecha_pago: e.target.value })}
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                label="Referencia / Concepto"
                                value={newBolsa.referencia_pago}
                                onChange={(e) => setNewBolsa({ ...newBolsa, referencia_pago: e.target.value })}
                                placeholder="Ej: Anticipo operaciones febrero"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                label="No. Operación Bancaria"
                                value={newBolsa.numero_operacion}
                                onChange={(e) => setNewBolsa({ ...newBolsa, numero_operacion: e.target.value })}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                label="Banco Origen"
                                value={newBolsa.banco_origen}
                                onChange={(e) => setNewBolsa({ ...newBolsa, banco_origen: e.target.value })}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <Button
                                variant="outlined"
                                component="label"
                                fullWidth
                                startIcon={<UploadIcon />}
                                sx={{ height: 56 }}
                            >
                                {comprobanteFile ? comprobanteFile.name : 'Subir Comprobante'}
                                <input
                                    type="file"
                                    hidden
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) => setComprobanteFile(e.target.files?.[0] || null)}
                                />
                            </Button>
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                fullWidth
                                multiline
                                rows={2}
                                label="Notas"
                                value={newBolsa.notas}
                                onChange={(e) => setNewBolsa({ ...newBolsa, notas: e.target.value })}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setBolsaDialog(false)}>Cancelar</Button>
                    <Button 
                        variant="contained" 
                        onClick={handleCreateBolsa}
                        disabled={saving}
                        sx={{ bgcolor: THEME_COLOR }}
                    >
                        {saving ? <CircularProgress size={20} /> : 'Registrar Depósito'}
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
