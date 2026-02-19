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
    const [tabValue, setTabValue] = useState(1); // Tab 1 = Depósitos (Bolsas) preseleccionado
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
        fecha_pago: new Date().toISOString().split('T')[0],
        tipo_pago: 'transferencia' as 'transferencia' | 'efectivo',
        numero_operacion: '',
        banco_origen: '',
        notas: '',
        referenciasText: '' // Texto pegado con referencias
    });
    const [parsedReferencias, setParsedReferencias] = useState<{ referencia: string; monto: number }[]>([]);
    const [referenciasValidas, setReferenciasValidas] = useState<{ reference_code: string; container_number: string }[]>([]);
    const [referenciasValidacion, setReferenciasValidacion] = useState<{ [key: string]: { valida: boolean; container_number?: string; duplicada?: boolean } }>({});
    const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
    
    // Asignaciones
    const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
    const [expandedBolsa, setExpandedBolsa] = useState<number | null>(null);
    
    // UI
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'info' | 'warning' });
    const [saving, setSaving] = useState(false);

    const getToken = () => localStorage.getItem('token');

    // Cargar referencias válidas del sistema
    const fetchReferenciasValidas = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/anticipos/referencias/validas`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setReferenciasValidas(res.data);
        } catch (error) {
            console.error('Error fetching referencias válidas:', error);
        }
    }, []);

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
            await Promise.all([fetchStats(), fetchProveedores(), fetchBolsas(), fetchReferenciasValidas()]);
            setLoading(false);
        };
        loadData();
    }, [fetchStats, fetchProveedores, fetchBolsas, fetchReferenciasValidas]);

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

    // Parsear texto de referencias (formato: JSM26-0023 $50,000)
    const parseReferencias = (text: string) => {
        const lines = text.split('\n').filter(line => line.trim());
        const refs: { referencia: string; monto: number }[] = [];
        
        for (const line of lines) {
            // Expresión regular para capturar referencia y monto
            // Soporta formatos: "JSM26-0023 $50,000" o "JSM26-0023 50000" o "JSM26-0023 $50000.00"
            const match = line.match(/^([A-Za-z0-9\-_]+)\s+\$?([\d,]+(?:\.\d{2})?)/);
            if (match) {
                const referencia = match[1].trim();
                const montoStr = match[2].replace(/,/g, ''); // Remover comas
                const monto = parseFloat(montoStr);
                if (referencia && !isNaN(monto) && monto > 0) {
                    refs.push({ referencia, monto });
                }
            }
        }
        
        return refs;
    };

    // Manejar cambio en texto de referencias
    const handleReferenciasChange = (text: string) => {
        setNewBolsa({ ...newBolsa, referenciasText: text });
        const parsed = parseReferencias(text);
        setParsedReferencias(parsed);
        
        // Detectar referencias duplicadas
        const conteoReferencias: { [key: string]: number } = {};
        parsed.forEach(ref => {
            conteoReferencias[ref.referencia] = (conteoReferencias[ref.referencia] || 0) + 1;
        });
        
        // Validar referencias contra el catálogo de referencias válidas y detectar duplicados
        const validacion: { [key: string]: { valida: boolean; container_number?: string; duplicada?: boolean } } = {};
        parsed.forEach(ref => {
            const encontrada = referenciasValidas.find(rv => rv.reference_code === ref.referencia);
            const esDuplicada = conteoReferencias[ref.referencia] > 1;
            if (encontrada) {
                validacion[ref.referencia] = { valida: true, container_number: encontrada.container_number, duplicada: esDuplicada };
            } else {
                validacion[ref.referencia] = { valida: false, duplicada: esDuplicada };
            }
        });
        setReferenciasValidacion(validacion);
    };

    // Verificar si hay referencias inválidas
    const tieneReferenciasInvalidas = () => {
        return parsedReferencias.some(ref => !referenciasValidacion[ref.referencia]?.valida);
    };

    // Verificar si hay referencias duplicadas
    const tieneReferenciasDuplicadas = () => {
        return parsedReferencias.some(ref => referenciasValidacion[ref.referencia]?.duplicada);
    };

    // Calcular total de referencias
    const getTotalReferencias = () => {
        return parsedReferencias.reduce((sum, ref) => sum + ref.monto, 0);
    };

    // Crear bolsa de anticipo con referencias
    const handleCreateBolsa = async () => {
        if (!newBolsa.proveedor_id) {
            setSnackbar({ open: true, message: '⚠️ Debes seleccionar un proveedor', severity: 'error' });
            return;
        }
        if (!newBolsa.fecha_pago) {
            setSnackbar({ open: true, message: '⚠️ Debes seleccionar la fecha de pago', severity: 'error' });
            return;
        }
        if (parsedReferencias.length === 0) {
            setSnackbar({ open: true, message: '⚠️ Debes agregar al menos una referencia con monto', severity: 'error' });
            return;
        }
        // Validar duplicados
        if (tieneReferenciasDuplicadas()) {
            setSnackbar({ open: true, message: '⚠️ No se pueden duplicar referencias en un mismo depósito', severity: 'error' });
            return;
        }
        // Validar que todas las referencias existan en el sistema
        if (tieneReferenciasInvalidas()) {
            const invalidas = parsedReferencias.filter(ref => !referenciasValidacion[ref.referencia]?.valida).map(ref => ref.referencia);
            setSnackbar({ open: true, message: `⚠️ Las siguientes referencias no existen en el sistema: ${invalidas.join(', ')}`, severity: 'error' });
            return;
        }
        if (newBolsa.tipo_pago === 'transferencia' && (!newBolsa.numero_operacion || !newBolsa.banco_origen)) {
            setSnackbar({ open: true, message: '⚠️ Para transferencia, el número de operación y banco son requeridos', severity: 'error' });
            return;
        }
        // Validar comprobante obligatorio
        if (!comprobanteFile) {
            setSnackbar({ open: true, message: '⚠️ Debes subir el comprobante de pago', severity: 'error' });
            return;
        }
        
        setSaving(true);
        try {
            const formData = new FormData();
            formData.append('proveedor_id', String(newBolsa.proveedor_id));
            formData.append('fecha_pago', newBolsa.fecha_pago);
            formData.append('tipo_pago', newBolsa.tipo_pago);
            formData.append('numero_operacion', newBolsa.tipo_pago === 'transferencia' ? newBolsa.numero_operacion : '');
            formData.append('banco_origen', newBolsa.tipo_pago === 'transferencia' ? newBolsa.banco_origen : '');
            formData.append('notas', newBolsa.notas);
            formData.append('referencias', JSON.stringify(parsedReferencias));
            formData.append('comprobante', comprobanteFile);

            await axios.post(`${API_URL}/api/anticipos/bolsas`, formData, {
                headers: { 
                    Authorization: `Bearer ${getToken()}`,
                    'Content-Type': 'multipart/form-data'
                }
            });
            setSnackbar({ open: true, message: `✅ Depósito de $${formatCurrency(getTotalReferencias())} registrado con ${parsedReferencias.length} referencia(s)`, severity: 'success' });
            setBolsaDialog(false);
            setNewBolsa({
                proveedor_id: 0,
                fecha_pago: new Date().toISOString().split('T')[0],
                tipo_pago: 'transferencia',
                numero_operacion: '',
                banco_origen: '',
                notas: '',
                referenciasText: ''
            });
            setParsedReferencias([]);
            setComprobanteFile(null);
            fetchBolsas();
            fetchProveedores();
            fetchStats();
        } catch (error: any) {
            const errorMsg = error.response?.data?.error || 'Error al registrar depósito';
            setSnackbar({ open: true, message: errorMsg, severity: 'error' });
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
                        💡 Pega las referencias y montos (una por línea). El sistema calculará automáticamente el monto total del depósito.
                    </Alert>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        {/* Proveedor */}
                        <Grid size={{ xs: 12, md: 6 }}>
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

                        {/* Fecha de Pago */}
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

                        {/* Tipo de Pago */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormControl fullWidth required>
                                <InputLabel>Tipo de Pago *</InputLabel>
                                <Select
                                    value={newBolsa.tipo_pago}
                                    label="Tipo de Pago *"
                                    onChange={(e) => setNewBolsa({ ...newBolsa, tipo_pago: e.target.value as 'transferencia' | 'efectivo' })}
                                >
                                    <MenuItem value="transferencia">💳 Transferencia Bancaria</MenuItem>
                                    <MenuItem value="efectivo">💵 Efectivo</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>

                        {/* Monto Total (SOLO LECTURA) */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                label="Monto Total del Depósito"
                                value={`$${formatCurrency(getTotalReferencias())}`}
                                InputProps={{
                                    readOnly: true,
                                    sx: { 
                                        bgcolor: '#E8F5E9', 
                                        fontWeight: 'bold',
                                        fontSize: '1.1rem',
                                        color: getTotalReferencias() > 0 ? '#2E7D32' : '#666'
                                    }
                                }}
                                helperText={parsedReferencias.length > 0 ? `${parsedReferencias.length} referencia(s) detectadas` : 'Calculado automáticamente'}
                            />
                        </Grid>

                        {/* Campos de Transferencia (condicionales) */}
                        {newBolsa.tipo_pago === 'transferencia' && (
                            <>
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <TextField
                                        fullWidth
                                        required
                                        label="No. Operación Bancaria *"
                                        value={newBolsa.numero_operacion}
                                        onChange={(e) => setNewBolsa({ ...newBolsa, numero_operacion: e.target.value })}
                                        placeholder="Ej: 123456789"
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <TextField
                                        fullWidth
                                        required
                                        label="Banco Origen *"
                                        value={newBolsa.banco_origen}
                                        onChange={(e) => setNewBolsa({ ...newBolsa, banco_origen: e.target.value })}
                                        placeholder="Ej: BBVA, Banorte, Santander..."
                                    />
                                </Grid>
                            </>
                        )}

                        {/* Comprobante */}
                        <Grid size={{ xs: 12, md: newBolsa.tipo_pago === 'efectivo' ? 12 : 6 }}>
                            <Button
                                variant="outlined"
                                component="label"
                                fullWidth
                                startIcon={<UploadIcon />}
                                color={comprobanteFile ? 'success' : 'primary'}
                                sx={{ height: 56 }}
                            >
                                {comprobanteFile ? `✅ ${comprobanteFile.name}` : 'Subir Comprobante'}
                                <input
                                    type="file"
                                    hidden
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) => setComprobanteFile(e.target.files?.[0] || null)}
                                />
                            </Button>
                        </Grid>

                        {/* Area de Referencias */}
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                fullWidth
                                multiline
                                rows={5}
                                label="Referencias y Montos *"
                                placeholder={`Pega las referencias (una por línea):\nJSM26-0023 $50,000\nJSM26-0026 $34,000\nJSM26-0027 $20,000`}
                                value={newBolsa.referenciasText}
                                onChange={(e) => handleReferenciasChange(e.target.value)}
                                error={newBolsa.referenciasText.length > 0 && parsedReferencias.length === 0}
                                helperText={
                                    newBolsa.referenciasText.length > 0 && parsedReferencias.length === 0 
                                        ? 'Formato incorrecto. Usa: REFERENCIA $MONTO (ej: JSM26-0023 $50,000)' 
                                        : 'Formato: REFERENCIA $MONTO (una por línea)'
                                }
                                sx={{
                                    '& .MuiInputBase-root': {
                                        fontFamily: 'monospace'
                                    }
                                }}
                            />
                        </Grid>

                        {/* Preview de referencias parseadas */}
                        {parsedReferencias.length > 0 && (
                            <Grid size={{ xs: 12 }}>
                                <Paper variant="outlined" sx={{ p: 2, bgcolor: '#FAFAFA' }}>
                                    <Typography variant="subtitle2" color="primary" gutterBottom>
                                        📋 Referencias detectadas ({parsedReferencias.length}):
                                        {tieneReferenciasDuplicadas() && (
                                            <Chip 
                                                label="🔁 Referencias duplicadas" 
                                                size="small" 
                                                color="warning" 
                                                sx={{ ml: 1 }} 
                                            />
                                        )}
                                        {tieneReferenciasInvalidas() && (
                                            <Chip 
                                                label="⚠️ Algunas referencias no existen" 
                                                size="small" 
                                                color="error" 
                                                sx={{ ml: 1 }} 
                                            />
                                        )}
                                    </Typography>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Estado</TableCell>
                                                <TableCell>Referencia</TableCell>
                                                <TableCell>Contenedor</TableCell>
                                                <TableCell align="right">Monto</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {parsedReferencias.map((ref, idx) => {
                                                const validacion = referenciasValidacion[ref.referencia];
                                                const esValida = validacion?.valida;
                                                const esDuplicada = validacion?.duplicada;
                                                return (
                                                    <TableRow key={idx} sx={{ bgcolor: esDuplicada ? '#FFF3E0' : (esValida ? 'inherit' : '#FFEBEE') }}>
                                                        <TableCell>
                                                            {esDuplicada ? (
                                                                <Tooltip title="Esta referencia está duplicada en el mismo depósito">
                                                                    <Chip label="🔁" size="small" color="warning" sx={{ minWidth: 32 }} />
                                                                </Tooltip>
                                                            ) : esValida ? (
                                                                <Chip label="✓" size="small" color="success" sx={{ minWidth: 32 }} />
                                                            ) : (
                                                                <Tooltip title="Esta referencia no existe en el sistema">
                                                                    <Chip label="✗" size="small" color="error" sx={{ minWidth: 32 }} />
                                                                </Tooltip>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Chip 
                                                                label={ref.referencia} 
                                                                size="small" 
                                                                color={esDuplicada ? "warning" : (esValida ? "primary" : "error")}
                                                                variant="outlined" 
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            {esDuplicada ? (
                                                                <Typography variant="body2" color="warning.main">
                                                                    ⚠️ Duplicada
                                                                </Typography>
                                                            ) : esValida ? (
                                                                <Typography variant="body2" color="text.secondary">
                                                                    {validacion.container_number || '-'}
                                                                </Typography>
                                                            ) : (
                                                                <Typography variant="body2" color="error">
                                                                    No encontrado
                                                                </Typography>
                                                            )}
                                                        </TableCell>
                                                        <TableCell align="right">${formatCurrency(ref.monto)}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                            <TableRow sx={{ bgcolor: (tieneReferenciasInvalidas() || tieneReferenciasDuplicadas()) ? '#FFCDD2' : '#E8F5E9' }}>
                                                <TableCell colSpan={3}><strong>TOTAL</strong></TableCell>
                                                <TableCell align="right">
                                                    <strong style={{ color: (tieneReferenciasInvalidas() || tieneReferenciasDuplicadas()) ? '#C62828' : '#2E7D32' }}>
                                                        ${formatCurrency(getTotalReferencias())}
                                                    </strong>
                                                </TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </Paper>
                            </Grid>
                        )}

                        {/* Notas */}
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                fullWidth
                                multiline
                                rows={2}
                                label="Notas (opcional)"
                                value={newBolsa.notas}
                                onChange={(e) => setNewBolsa({ ...newBolsa, notas: e.target.value })}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
                    <Typography variant="body2" color={(tieneReferenciasInvalidas() || tieneReferenciasDuplicadas() || !comprobanteFile) ? 'error' : 'text.secondary'}>
                        {!newBolsa.proveedor_id 
                            ? '⚠️ Selecciona un proveedor'
                            : !comprobanteFile
                                ? '📎 Sube el comprobante de pago'
                                : parsedReferencias.length === 0
                                    ? '📝 Ingresa al menos una referencia'
                                    : tieneReferenciasDuplicadas()
                                        ? `🔁 No se pueden duplicar referencias en un mismo depósito`
                                        : tieneReferenciasInvalidas()
                                            ? `⚠️ ${parsedReferencias.filter(ref => !referenciasValidacion[ref.referencia]?.valida).length} referencia(s) no válida(s)`
                                            : newBolsa.tipo_pago === 'transferencia' && (!newBolsa.numero_operacion || !newBolsa.banco_origen)
                                                ? '🏦 Completa los datos bancarios'
                                                : `💰 Total: $${formatCurrency(getTotalReferencias())} MXN`
                        }
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button onClick={() => setBolsaDialog(false)}>Cancelar</Button>
                        <Button 
                            variant="contained" 
                            onClick={handleCreateBolsa}
                            disabled={
                                saving || 
                                !newBolsa.proveedor_id || 
                                !comprobanteFile || 
                                parsedReferencias.length === 0 || 
                                tieneReferenciasInvalidas() || 
                                tieneReferenciasDuplicadas() ||
                                (newBolsa.tipo_pago === 'transferencia' && (!newBolsa.numero_operacion || !newBolsa.banco_origen))
                            }
                            sx={{ bgcolor: (tieneReferenciasInvalidas() || tieneReferenciasDuplicadas() || !comprobanteFile) ? '#9E9E9E' : THEME_COLOR }}
                        >
                            {saving ? <CircularProgress size={20} /> : `Registrar Depósito ($${formatCurrency(getTotalReferencias())})`}
                        </Button>
                    </Box>
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
