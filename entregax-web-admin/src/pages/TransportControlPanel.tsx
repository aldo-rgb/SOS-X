// ============================================
// PANEL DE CONTROL DE TRANSPORTES
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Card, CardContent, Grid, TextField, Button, Chip,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Alert,
    Snackbar, CircularProgress, Tabs, Tab, Tooltip, FormControl, InputLabel,
    Select, MenuItem, Collapse,
} from '@mui/material';
import {
    LocalShipping as TruckIcon,
    Add as AddIcon,
    AttachMoney as MoneyIcon,
    Business as BusinessIcon,
    Receipt as ReceiptIcon,
    History as HistoryIcon,
    Visibility as VisibilityIcon,
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    CloudUpload as UploadIcon,
    Refresh as RefreshIcon,
    Delete as DeleteIcon,
    Description as FacturaIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const THEME_COLOR = '#FF6F00';

interface Proveedor {
    id: number;
    nombre: string;
    referencia: string | null;
    contacto_nombre: string | null;
    contacto_email: string | null;
    contacto_telefono: string | null;
    banco: string | null;
    cuenta_bancaria: string | null;
    clabe: string | null;
    notas: string | null;
    is_active: boolean;
    total_bolsas: number;
    total_depositado: number;
}

interface Bolsa {
    id: number;
    proveedor_id: number;
    proveedor_nombre: string;
    monto_original: number;
    fecha_pago: string;
    comprobante_url: string | null;
    factura_url: string | null;
    referencia_pago: string | null;
    numero_operacion: string | null;
    banco_origen: string | null;
    tipo_pago: string | null;
    notas: string | null;
    estado: string;
    total_referencias: number;
}

interface Referencia {
    id: number;
    referencia: string;
    monto: number;
    estado: string;
    created_at: string;
    container_number: string | null;
}

interface Stats {
    total_proveedores: number;
    bolsas_activas: number;
    total_depositado: number;
}

const formatCurrency = (value: number | string | null): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (num === null || num === undefined || isNaN(num)) return '0.00';
    return num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function TransportControlPanel() {
    const [tabValue, setTabValue] = useState(1);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<Stats | null>(null);

    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [selectedProveedor, setSelectedProveedor] = useState<Proveedor | null>(null);
    const [proveedorDialog, setProveedorDialog] = useState(false);
    const [newProveedor, setNewProveedor] = useState({ nombre: '', referencia: '' });

    const [bolsas, setBolsas] = useState<Bolsa[]>([]);
    const [bolsaDialog, setBolsaDialog] = useState(false);
    const [newBolsa, setNewBolsa] = useState({
        proveedor_id: 0,
        fecha_pago: new Date().toISOString().split('T')[0],
        tipo_pago: 'transferencia' as 'transferencia' | 'efectivo',
        numero_operacion: '',
        banco_origen: '',
        notas: '',
        referenciasText: '',
    });
    const [parsedReferencias, setParsedReferencias] = useState<{ referencia: string; monto: number }[]>([]);
    const [referenciasValidas, setReferenciasValidas] = useState<{ reference_code: string; container_number: string }[]>([]);
    const [referenciasValidacion, setReferenciasValidacion] = useState<{ [key: string]: { valida: boolean; container_number?: string; duplicada?: boolean } }>({});
    const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
    const [facturaFile, setFacturaFile] = useState<File | null>(null);

    const [referencias, setReferencias] = useState<Referencia[]>([]);
    const [expandedBolsa, setExpandedBolsa] = useState<number | null>(null);
    const [referenciaSearch, setReferenciaSearch] = useState('');

    const [deleteDialog, setDeleteDialog] = useState(false);
    const [bolsaToDelete, setBolsaToDelete] = useState<Bolsa | null>(null);
    const [deleting, setDeleting] = useState(false);

    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'info' | 'warning' });
    const [saving, setSaving] = useState(false);
    const [referenciasOmitidas, setReferenciasOmitidas] = useState(false);
    const [omitirConfirmDialog, setOmitirConfirmDialog] = useState(false);

    const getToken = () => localStorage.getItem('token');

    const fetchReferenciasValidas = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/transporte/referencias/validas`, { headers: { Authorization: `Bearer ${getToken()}` } });
            setReferenciasValidas(res.data);
        } catch { /* silenciar */ }
    }, []);

    const fetchStats = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/transporte/stats`, { headers: { Authorization: `Bearer ${getToken()}` } });
            setStats(res.data);
        } catch { /* silenciar */ }
    }, []);

    const fetchProveedores = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/transporte/proveedores`, { headers: { Authorization: `Bearer ${getToken()}` } });
            setProveedores(res.data);
        } catch { /* silenciar */ }
    }, []);

    const fetchBolsas = useCallback(async (proveedorId?: number) => {
        try {
            const url = proveedorId ? `${API_URL}/api/transporte/bolsas?proveedor_id=${proveedorId}` : `${API_URL}/api/transporte/bolsas`;
            const res = await axios.get(url, { headers: { Authorization: `Bearer ${getToken()}` } });
            setBolsas(res.data);
        } catch { /* silenciar */ }
    }, []);

    const fetchReferenciasBolsa = async (bolsaId: number) => {
        try {
            const res = await axios.get(`${API_URL}/api/transporte/bolsas/${bolsaId}/referencias`, { headers: { Authorization: `Bearer ${getToken()}` } });
            setReferencias(res.data);
        } catch { /* silenciar */ }
    };

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await Promise.all([fetchStats(), fetchProveedores(), fetchBolsas(), fetchReferenciasValidas()]);
            setLoading(false);
        };
        loadData();
    }, [fetchStats, fetchProveedores, fetchBolsas, fetchReferenciasValidas]);

    const handleCreateProveedor = async () => {
        if (!newProveedor.nombre.trim()) { setSnackbar({ open: true, message: 'El nombre es requerido', severity: 'error' }); return; }
        setSaving(true);
        try {
            await axios.post(`${API_URL}/api/transporte/proveedores`, newProveedor, { headers: { Authorization: `Bearer ${getToken()}` } });
            setSnackbar({ open: true, message: 'Proveedor creado exitosamente', severity: 'success' });
            setProveedorDialog(false);
            setNewProveedor({ nombre: '', referencia: '' });
            fetchProveedores(); fetchStats();
        } catch { setSnackbar({ open: true, message: 'Error al crear proveedor', severity: 'error' }); }
        finally { setSaving(false); }
    };

    const parseReferencias = (text: string) => {
        const lines = text.split('\n').filter(l => l.trim());
        const refs: { referencia: string; monto: number }[] = [];
        for (const line of lines) {
            const match = line.match(/^([A-Za-z0-9\-_]+)\s+\$?([\d,]+(?:\.\d{2})?)/);
            if (match) {
                const referencia = match[1].trim();
                const monto = parseFloat(match[2].replace(/,/g, ''));
                if (referencia && !isNaN(monto) && monto > 0) refs.push({ referencia, monto });
            }
        }
        return refs;
    };

    const handleReferenciasChange = (text: string) => {
        setReferenciasOmitidas(false);
        setNewBolsa({ ...newBolsa, referenciasText: text });
        const parsed = parseReferencias(text);
        setParsedReferencias(parsed);
        const conteo: { [k: string]: number } = {};
        parsed.forEach(r => { conteo[r.referencia] = (conteo[r.referencia] || 0) + 1; });
        const validacion: { [k: string]: { valida: boolean; container_number?: string; duplicada?: boolean } } = {};
        parsed.forEach(ref => {
            const enc = referenciasValidas.find(rv => rv.reference_code === ref.referencia);
            validacion[ref.referencia] = { valida: !!enc, container_number: enc?.container_number, duplicada: conteo[ref.referencia] > 1 };
        });
        setReferenciasValidacion(validacion);
    };

    const tieneReferenciasInvalidas = () => parsedReferencias.some(r => !referenciasValidacion[r.referencia]?.valida);
    const tieneReferenciasDuplicadas = () => parsedReferencias.some(r => referenciasValidacion[r.referencia]?.duplicada);
    const getTotalReferencias = () => parsedReferencias.reduce((s, r) => s + r.monto, 0);

    const handleCreateBolsa = async () => {
        if (!newBolsa.proveedor_id) { setSnackbar({ open: true, message: '⚠️ Selecciona un proveedor', severity: 'error' }); return; }
        if (!newBolsa.fecha_pago) { setSnackbar({ open: true, message: '⚠️ Selecciona la fecha de pago', severity: 'error' }); return; }
        if (parsedReferencias.length === 0) { setSnackbar({ open: true, message: '⚠️ Agrega al menos una referencia con monto', severity: 'error' }); return; }
        if (tieneReferenciasDuplicadas()) { setSnackbar({ open: true, message: '⚠️ No se pueden duplicar referencias en un mismo pago', severity: 'error' }); return; }
        if (tieneReferenciasInvalidas() && !referenciasOmitidas) {
            const inv = parsedReferencias.filter(r => !referenciasValidacion[r.referencia]?.valida).map(r => r.referencia);
            setSnackbar({ open: true, message: `⚠️ Referencias no encontradas: ${inv.join(', ')}`, severity: 'error' });
            return;
        }
        if (newBolsa.tipo_pago === 'transferencia' && (!newBolsa.numero_operacion || !newBolsa.banco_origen)) {
            setSnackbar({ open: true, message: '⚠️ Para transferencia, completa los datos bancarios', severity: 'error' }); return;
        }
        if (!comprobanteFile) { setSnackbar({ open: true, message: '⚠️ Sube el comprobante de pago', severity: 'error' }); return; }

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
            if (referenciasOmitidas) formData.append('omitir_invalidas', 'true');
            formData.append('comprobante', comprobanteFile);
            if (facturaFile) formData.append('factura', facturaFile);

            await axios.post(`${API_URL}/api/transporte/bolsas`, formData, { headers: { Authorization: `Bearer ${getToken()}` } });
            setSnackbar({ open: true, message: `✅ Pago de $${formatCurrency(getTotalReferencias())} registrado con ${parsedReferencias.length} referencia(s)`, severity: 'success' });
            setBolsaDialog(false);
            setNewBolsa({ proveedor_id: 0, fecha_pago: new Date().toISOString().split('T')[0], tipo_pago: 'transferencia', numero_operacion: '', banco_origen: '', notas: '', referenciasText: '' });
            setParsedReferencias([]); setReferenciasOmitidas(false); setComprobanteFile(null); setFacturaFile(null);
            fetchBolsas(); fetchProveedores(); fetchStats();
        } catch (error: any) {
            setSnackbar({ open: true, message: error.response?.data?.error || 'Error al registrar pago', severity: 'error' });
        } finally { setSaving(false); }
    };

    const toggleExpandBolsa = (bolsaId: number) => {
        if (expandedBolsa === bolsaId) { setExpandedBolsa(null); }
        else { setExpandedBolsa(bolsaId); fetchReferenciasBolsa(bolsaId); }
    };

    const handleDeleteBolsa = async () => {
        if (!bolsaToDelete) return;
        setDeleting(true);
        try {
            await axios.delete(`${API_URL}/api/transporte/bolsas/${bolsaToDelete.id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
            setSnackbar({ open: true, message: 'Pago eliminado correctamente', severity: 'success' });
            setDeleteDialog(false); setBolsaToDelete(null);
            fetchBolsas(); fetchStats();
        } catch (error: any) {
            setSnackbar({ open: true, message: error.response?.data?.error || 'Error al eliminar pago', severity: 'error' });
        } finally { setDeleting(false); }
    };

    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><CircularProgress /></Box>;
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                <Box>
                    <Typography variant="h4" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TruckIcon sx={{ color: THEME_COLOR }} />
                        Control de Transportes
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Gestión de pagos de transporte por referencia de contenedor
                    </Typography>
                </Box>
                <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => { fetchStats(); fetchProveedores(); fetchBolsas(); }}>
                    Actualizar
                </Button>
            </Box>

            {/* Stats */}
            {stats && (
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid size={{ xs: 12, sm: 4 }}>
                        <Card sx={{ bgcolor: '#FFF3E0', height: '100%' }}>
                            <CardContent sx={{ textAlign: 'center', py: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                <BusinessIcon sx={{ fontSize: 30, color: THEME_COLOR }} />
                                <Typography variant="h5" fontWeight="bold">{stats.total_proveedores}</Typography>
                                <Typography variant="caption">Proveedores</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                        <Card sx={{ bgcolor: '#FBE9E7', height: '100%' }}>
                            <CardContent sx={{ textAlign: 'center', py: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                <ReceiptIcon sx={{ fontSize: 30, color: '#D84315' }} />
                                <Typography variant="h5" fontWeight="bold">{stats.bolsas_activas}</Typography>
                                <Typography variant="caption">Pagos Activos</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                        <Card sx={{ bgcolor: '#E8F5E9', height: '100%' }}>
                            <CardContent sx={{ textAlign: 'center', py: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                <MoneyIcon sx={{ fontSize: 30, color: '#388E3C' }} />
                                <Typography variant="h5" fontWeight="bold">${formatCurrency(stats.total_depositado)}</Typography>
                                <Typography variant="caption">Total Pagado</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            )}

            {/* Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} textColor="inherit" TabIndicatorProps={{ style: { backgroundColor: THEME_COLOR } }}>
                    <Tab icon={<BusinessIcon />} label="Proveedores" />
                    <Tab icon={<ReceiptIcon />} label="Pagos" />
                </Tabs>
            </Box>

            {/* Tab 0: Proveedores */}
            {tabValue === 0 && (
                <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="h6">Proveedores de Transporte</Typography>
                        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setProveedorDialog(true)} sx={{ bgcolor: THEME_COLOR }}>
                            Nuevo Proveedor
                        </Button>
                    </Box>
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                    <TableCell><strong>Nombre</strong></TableCell>
                                    <TableCell><strong>Referencia</strong></TableCell>
                                    <TableCell align="center"><strong>Pagos</strong></TableCell>
                                    <TableCell align="right"><strong>Total Pagado</strong></TableCell>
                                    <TableCell align="center"><strong>Acciones</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {proveedores.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} align="center"><Typography color="text.secondary" sx={{ py: 3 }}>No hay proveedores. Crea el primero.</Typography></TableCell></TableRow>
                                ) : (
                                    proveedores.map((prov) => (
                                        <TableRow key={prov.id} hover>
                                            <TableCell><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><TruckIcon color="action" /><Typography fontWeight="bold">{prov.nombre}</Typography></Box></TableCell>
                                            <TableCell><Typography variant="body2" fontFamily="monospace">{prov.referencia || '-'}</Typography></TableCell>
                                            <TableCell align="center"><Chip label={prov.total_bolsas} size="small" /></TableCell>
                                            <TableCell align="right"><Typography fontWeight="bold">${formatCurrency(prov.total_depositado)}</Typography></TableCell>
                                            <TableCell align="center">
                                                <Tooltip title="Ver pagos">
                                                    <IconButton size="small" onClick={() => { setSelectedProveedor(prov); fetchBolsas(prov.id); setTabValue(1); }}>
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

            {/* Tab 1: Pagos */}
            {tabValue === 1 && (
                <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                        <Box>
                            <Typography variant="h6">Pagos de Transporte</Typography>
                            {selectedProveedor && (
                                <Chip label={`Filtrado: ${selectedProveedor.nombre}`} onDelete={() => { setSelectedProveedor(null); fetchBolsas(); }} color="primary" size="small" />
                            )}
                        </Box>
                        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setBolsaDialog(true)} sx={{ bgcolor: THEME_COLOR }}>
                            Registrar Pago
                        </Button>
                    </Box>

                    {bolsas.length === 0 ? (
                        <Alert severity="info">No hay pagos registrados.</Alert>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <TextField
                                size="small" fullWidth
                                placeholder="🔍 Buscar por referencia (ej. EPG26-0023)"
                                value={referenciaSearch}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setReferenciaSearch(v);
                                    const term = v.trim().toUpperCase();
                                    if (!term) return;
                                    const match = bolsas.find(b => (b.referencia_pago || '').toUpperCase().includes(term));
                                    if (match && expandedBolsa !== match.id) { setExpandedBolsa(match.id); fetchReferenciasBolsa(match.id); }
                                }}
                                InputProps={{ endAdornment: referenciaSearch ? <IconButton size="small" onClick={() => setReferenciaSearch('')}><Typography sx={{ fontSize: 16 }}>✕</Typography></IconButton> : null }}
                                sx={{ mb: 1 }}
                            />
                            {(() => {
                                const term = referenciaSearch.trim().toUpperCase();
                                const filtered = term ? bolsas.filter(b => (b.referencia_pago || '').toUpperCase().includes(term)) : bolsas;
                                if (term && filtered.length === 0) return <Alert severity="warning">No se encontró ningún pago con la referencia «{referenciaSearch}».</Alert>;
                                return filtered.map((bolsa) => (
                                    <Card key={bolsa.id} variant="outlined">
                                        <CardContent>
                                            <Grid container spacing={2} alignItems="center">
                                                <Grid size={{ xs: 12, md: 3 }}>
                                                    <Typography variant="subtitle2" color="text.secondary">Proveedor</Typography>
                                                    <Typography fontWeight="bold">{bolsa.proveedor_nombre}</Typography>
                                                    <Typography variant="caption" color="text.secondary">{bolsa.referencia_pago || 'Sin referencia'}</Typography>
                                                </Grid>
                                                <Grid size={{ xs: 6, md: 2 }}>
                                                    <Typography variant="subtitle2" color="text.secondary">Fecha Pago</Typography>
                                                    <Typography>{new Date(bolsa.fecha_pago).toLocaleDateString()}</Typography>
                                                </Grid>
                                                <Grid size={{ xs: 6, md: 3 }}>
                                                    <Typography variant="subtitle2" color="text.secondary">Monto Total</Typography>
                                                    <Typography fontWeight="bold" color="success.main">${formatCurrency(bolsa.monto_original)}</Typography>
                                                </Grid>
                                                <Grid size={{ xs: 12, md: 4 }}>
                                                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                                        <Tooltip title={bolsa.comprobante_url ? 'Ver comprobante' : 'Sin comprobante'}>
                                                            <span>
                                                                <IconButton size="small" disabled={!bolsa.comprobante_url} onClick={() => bolsa.comprobante_url && window.open(bolsa.comprobante_url, '_blank')}>
                                                                    <VisibilityIcon sx={{ opacity: bolsa.comprobante_url ? 1 : 0.3 }} />
                                                                </IconButton>
                                                            </span>
                                                        </Tooltip>
                                                        <Tooltip title={bolsa.factura_url ? 'Ver factura' : 'Sin factura fiscal'}>
                                                            <span>
                                                                <IconButton size="small" disabled={!bolsa.factura_url} onClick={() => bolsa.factura_url && window.open(bolsa.factura_url, '_blank')}>
                                                                    <FacturaIcon sx={{ opacity: bolsa.factura_url ? 1 : 0.3 }} />
                                                                </IconButton>
                                                            </span>
                                                        </Tooltip>
                                                        <Tooltip title={expandedBolsa === bolsa.id ? 'Ocultar historial' : 'Ver historial'}>
                                                            <IconButton size="small" onClick={() => toggleExpandBolsa(bolsa.id)}>
                                                                {expandedBolsa === bolsa.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Eliminar pago">
                                                            <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setBolsaToDelete(bolsa); setDeleteDialog(true); }}>
                                                                <DeleteIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </Box>
                                                </Grid>
                                            </Grid>
                                            <Collapse in={expandedBolsa === bolsa.id}>
                                                <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #eee' }}>
                                                    {bolsa.notas && (
                                                        <Box sx={{ mb: 2, p: 1.5, bgcolor: '#fff8e1', borderRadius: 1, border: '1px solid #ffe082' }}>
                                                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>📝 Notas:</Typography>
                                                            <Typography variant="body2">{bolsa.notas}</Typography>
                                                        </Box>
                                                    )}
                                                    <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <HistoryIcon fontSize="small" /> Referencias ({bolsa.total_referencias})
                                                    </Typography>
                                                    {referencias.length === 0 ? (
                                                        <Typography variant="body2" color="text.secondary">No hay referencias.</Typography>
                                                    ) : (
                                                        <TableContainer>
                                                            <Table size="small">
                                                                <TableHead>
                                                                    <TableRow>
                                                                        <TableCell>Referencia</TableCell>
                                                                        <TableCell>Contenedor</TableCell>
                                                                        <TableCell align="right">Monto</TableCell>
                                                                        <TableCell>Fecha</TableCell>
                                                                        <TableCell>Estado</TableCell>
                                                                    </TableRow>
                                                                </TableHead>
                                                                <TableBody>
                                                                    {referencias.map((ref) => {
                                                                        const noEnc = ref.estado === 'no_encontrada';
                                                                        return (
                                                                            <TableRow key={ref.id} sx={{ bgcolor: noEnc ? '#FFEBEE' : 'inherit' }}>
                                                                                <TableCell><Typography variant="body2" fontFamily="monospace" fontWeight="bold" color={noEnc ? 'error.main' : 'inherit'}>{ref.referencia}</Typography></TableCell>
                                                                                <TableCell><Typography variant="body2" fontFamily="monospace" color={noEnc ? 'error.main' : 'text.secondary'}>{noEnc ? '✗ Sin contenedor' : ref.container_number || '-'}</Typography></TableCell>
                                                                                <TableCell align="right"><Typography fontWeight="bold" color={noEnc ? 'error.main' : 'success.main'}>${formatCurrency(ref.monto)}</Typography></TableCell>
                                                                                <TableCell>{new Date(ref.created_at).toLocaleDateString()}</TableCell>
                                                                                <TableCell>
                                                                                    {noEnc ? <Chip label="✗ No encontrada" size="small" color="error" /> : <Chip label="✓ Aplicado" size="small" color="success" />}
                                                                                </TableCell>
                                                                            </TableRow>
                                                                        );
                                                                    })}
                                                                </TableBody>
                                                            </Table>
                                                        </TableContainer>
                                                    )}
                                                </Box>
                                            </Collapse>
                                        </CardContent>
                                    </Card>
                                ));
                            })()}
                        </Box>
                    )}
                </Box>
            )}

            {/* Dialog: Nuevo Proveedor */}
            <Dialog open={proveedorDialog} onClose={() => setProveedorDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ bgcolor: THEME_COLOR, color: 'white' }}><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><BusinessIcon />Nuevo Proveedor de Transporte</Box></DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid size={{ xs: 12 }}>
                            <TextField fullWidth label="Nombre del Proveedor *" value={newProveedor.nombre} onChange={(e) => setNewProveedor({ ...newProveedor, nombre: e.target.value })} placeholder="Ej: Transportes García" />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField fullWidth label="Referencia / RFC" value={newProveedor.referencia} onChange={(e) => setNewProveedor({ ...newProveedor, referencia: e.target.value })} placeholder="Ej: TG-MZT-001" />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setProveedorDialog(false)}>Cancelar</Button>
                    <Button variant="contained" onClick={handleCreateProveedor} disabled={saving} sx={{ bgcolor: THEME_COLOR }}>
                        {saving ? <CircularProgress size={20} /> : 'Guardar'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog: Registrar Pago */}
            <Dialog open={bolsaDialog} onClose={() => setBolsaDialog(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ bgcolor: THEME_COLOR, color: 'white' }}><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><MoneyIcon />Registrar Pago de Transporte</Box></DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        💡 Pega las referencias y montos (una por línea). El monto total se calcula automáticamente.
                    </Alert>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormControl fullWidth required>
                                <InputLabel>Proveedor *</InputLabel>
                                <Select value={newBolsa.proveedor_id} label="Proveedor *" onChange={(e) => setNewBolsa({ ...newBolsa, proveedor_id: Number(e.target.value) })}>
                                    {proveedores.map((prov) => <MenuItem key={prov.id} value={prov.id}>{prov.nombre} {prov.referencia && `(${prov.referencia})`}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField fullWidth required label="Fecha de Pago *" type="date" value={newBolsa.fecha_pago} onChange={(e) => setNewBolsa({ ...newBolsa, fecha_pago: e.target.value })} InputLabelProps={{ shrink: true }} />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormControl fullWidth required>
                                <InputLabel>Tipo de Pago *</InputLabel>
                                <Select value={newBolsa.tipo_pago} label="Tipo de Pago *" onChange={(e) => setNewBolsa({ ...newBolsa, tipo_pago: e.target.value as 'transferencia' | 'efectivo' })}>
                                    <MenuItem value="transferencia">💳 Transferencia Bancaria</MenuItem>
                                    <MenuItem value="efectivo">💵 Efectivo</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField fullWidth label="Monto Total" value={`$${formatCurrency(getTotalReferencias())}`}
                                InputProps={{ readOnly: true, sx: { bgcolor: '#E8F5E9', fontWeight: 'bold', fontSize: '1.1rem', color: getTotalReferencias() > 0 ? '#2E7D32' : '#666' } }}
                                helperText={parsedReferencias.length > 0 ? `${parsedReferencias.length} referencia(s)` : 'Calculado automáticamente'}
                            />
                        </Grid>
                        {newBolsa.tipo_pago === 'transferencia' && (
                            <>
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <TextField fullWidth required label="No. Operación Bancaria *" value={newBolsa.numero_operacion} onChange={(e) => setNewBolsa({ ...newBolsa, numero_operacion: e.target.value })} />
                                </Grid>
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <FormControl fullWidth required>
                                        <InputLabel>Banco Origen *</InputLabel>
                                        <Select value={newBolsa.banco_origen} label="Banco Origen *" onChange={(e) => setNewBolsa({ ...newBolsa, banco_origen: e.target.value })}>
                                            <MenuItem value="BANORTE">BANORTE</MenuItem>
                                            <MenuItem value="BBVA">BBVA</MenuItem>
                                            <MenuItem value="BANREGIO">BANREGIO</MenuItem>
                                            <MenuItem value="SANTANDER">SANTANDER</MenuItem>
                                            <MenuItem value="HSBC">HSBC</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                            </>
                        )}
                        {/* Comprobante */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <Button variant="outlined" component="label" fullWidth startIcon={<UploadIcon />} color={comprobanteFile ? 'success' : 'primary'} sx={{ height: 56 }}>
                                {comprobanteFile ? `✅ ${comprobanteFile.name}` : 'Comprobante de Pago *'}
                                <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setComprobanteFile(e.target.files?.[0] || null)} />
                            </Button>
                        </Grid>
                        {/* Factura */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <Button variant="outlined" component="label" fullWidth startIcon={<FacturaIcon />} color={facturaFile ? 'success' : 'inherit'} sx={{ height: 56 }}>
                                {facturaFile ? `✅ ${facturaFile.name}` : 'Factura Fiscal (opcional)'}
                                <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.xml" onChange={(e) => setFacturaFile(e.target.files?.[0] || null)} />
                            </Button>
                        </Grid>
                        {/* Referencias */}
                        <Grid size={{ xs: 12 }}>
                            <TextField fullWidth multiline rows={5} label="Referencias y Montos *"
                                placeholder={`Pega las referencias (una por línea):\nJSM26-0023 $50,000\nJSM26-0026 $34,000`}
                                value={newBolsa.referenciasText} onChange={(e) => handleReferenciasChange(e.target.value)}
                                error={newBolsa.referenciasText.length > 0 && parsedReferencias.length === 0}
                                helperText={newBolsa.referenciasText.length > 0 && parsedReferencias.length === 0 ? 'Formato incorrecto. Usa: REFERENCIA $MONTO' : 'Formato: REFERENCIA $MONTO (una por línea)'}
                                sx={{ '& .MuiInputBase-root': { fontFamily: 'monospace' } }}
                            />
                        </Grid>
                        {parsedReferencias.length > 0 && (
                            <Grid size={{ xs: 12 }}>
                                <Paper variant="outlined" sx={{ p: 2, bgcolor: '#FAFAFA' }}>
                                    <Typography variant="subtitle2" color="primary" gutterBottom>
                                        📋 Referencias detectadas ({parsedReferencias.length}):
                                        {tieneReferenciasDuplicadas() && <Chip label="🔁 Duplicadas" size="small" color="warning" sx={{ ml: 1 }} />}
                                        {tieneReferenciasInvalidas() && !referenciasOmitidas && (
                                            <>
                                                <Chip label="⚠️ Algunas no existen" size="small" color="error" sx={{ ml: 1 }} />
                                                <Button size="small" variant="outlined" color="warning" onClick={() => setOmitirConfirmDialog(true)} sx={{ ml: 1, textTransform: 'none', fontSize: '0.7rem', py: 0.25, px: 1 }}>Omitir no encontradas</Button>
                                            </>
                                        )}
                                        {referenciasOmitidas && <Chip label="✓ Inválidas omitidas" size="small" color="success" onDelete={() => setReferenciasOmitidas(false)} sx={{ ml: 1 }} />}
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
                                                const v = referenciasValidacion[ref.referencia];
                                                const esValida = v?.valida; const esDup = v?.duplicada;
                                                return (
                                                    <TableRow key={idx} sx={{ bgcolor: esDup ? '#FFF3E0' : esValida ? 'inherit' : '#FFEBEE' }}>
                                                        <TableCell>
                                                            {esDup ? <Tooltip title="Duplicada"><Chip label="🔁" size="small" color="warning" sx={{ minWidth: 32 }} /></Tooltip>
                                                                : esValida ? <Chip label="✓" size="small" color="success" sx={{ minWidth: 32 }} />
                                                                    : <Tooltip title="No existe en el sistema"><Chip label="✗" size="small" color="error" sx={{ minWidth: 32 }} /></Tooltip>}
                                                        </TableCell>
                                                        <TableCell><Chip label={ref.referencia} size="small" color={esDup ? 'warning' : esValida ? 'primary' : 'error'} variant="outlined" /></TableCell>
                                                        <TableCell><Typography variant="body2" color={esDup ? 'warning.main' : esValida ? 'text.secondary' : 'error'}>{esDup ? '⚠️ Duplicada' : esValida ? v.container_number || '-' : 'No encontrado'}</Typography></TableCell>
                                                        <TableCell align="right">${formatCurrency(ref.monto)}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                            <TableRow sx={{ bgcolor: (tieneReferenciasInvalidas() || tieneReferenciasDuplicadas()) ? '#FFCDD2' : '#E8F5E9' }}>
                                                <TableCell colSpan={3}><strong>TOTAL</strong></TableCell>
                                                <TableCell align="right"><strong style={{ color: (tieneReferenciasInvalidas() || tieneReferenciasDuplicadas()) ? '#C62828' : '#2E7D32' }}>${formatCurrency(getTotalReferencias())}</strong></TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </Paper>
                            </Grid>
                        )}
                        <Grid size={{ xs: 12 }}>
                            <TextField fullWidth multiline rows={2} label="Notas (opcional)" value={newBolsa.notas} onChange={(e) => setNewBolsa({ ...newBolsa, notas: e.target.value })} />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
                    <Typography variant="body2" color={(tieneReferenciasDuplicadas() || (tieneReferenciasInvalidas() && !referenciasOmitidas) || !comprobanteFile) ? 'error' : 'text.secondary'}>
                        {!newBolsa.proveedor_id ? '⚠️ Selecciona un proveedor'
                            : !comprobanteFile ? '📎 Sube el comprobante'
                                : parsedReferencias.length === 0 ? '📝 Ingresa al menos una referencia'
                                    : tieneReferenciasDuplicadas() ? '🔁 Referencias duplicadas'
                                        : tieneReferenciasInvalidas() && !referenciasOmitidas ? '⚠️ Usa "Omitir" para continuar'
                                            : `💰 Total: $${formatCurrency(getTotalReferencias())} MXN`}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button onClick={() => setBolsaDialog(false)}>Cancelar</Button>
                        <Button variant="contained" onClick={handleCreateBolsa} disabled={saving || !newBolsa.proveedor_id || !comprobanteFile || parsedReferencias.length === 0 || (tieneReferenciasInvalidas() && !referenciasOmitidas) || tieneReferenciasDuplicadas() || (newBolsa.tipo_pago === 'transferencia' && (!newBolsa.numero_operacion || !newBolsa.banco_origen))} sx={{ bgcolor: THEME_COLOR }}>
                            {saving ? <CircularProgress size={20} /> : `Registrar ($${formatCurrency(getTotalReferencias())})`}
                        </Button>
                    </Box>
                </DialogActions>
            </Dialog>

            {/* Dialog: Eliminar */}
            <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ color: 'error.main' }}>⚠️ Eliminar Pago</DialogTitle>
                <DialogContent>
                    {bolsaToDelete && (
                        <Box>
                            <Typography gutterBottom>¿Estás seguro de eliminar este pago? Se revertirá el monto de transporte en los costos del contenedor.</Typography>
                            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                                <Typography><strong>Proveedor:</strong> {bolsaToDelete.proveedor_nombre}</Typography>
                                <Typography><strong>Monto:</strong> ${formatCurrency(bolsaToDelete.monto_original)}</Typography>
                                <Typography><strong>Fecha:</strong> {new Date(bolsaToDelete.fecha_pago).toLocaleDateString()}</Typography>
                            </Box>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialog(false)} disabled={deleting}>Cancelar</Button>
                    <Button onClick={handleDeleteBolsa} color="error" variant="contained" disabled={deleting} startIcon={deleting ? <CircularProgress size={20} /> : <DeleteIcon />}>
                        {deleting ? 'Eliminando...' : 'Eliminar'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog: Omitir referencias */}
            <Dialog open={omitirConfirmDialog} onClose={() => setOmitirConfirmDialog(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ color: 'warning.dark' }}>⚠️ Omitir referencias no encontradas</DialogTitle>
                <DialogContent>
                    <Typography gutterBottom>Las siguientes referencias <strong>no existen en el sistema</strong>:</Typography>
                    <Box sx={{ mt: 1, mb: 2, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {parsedReferencias.filter(r => !referenciasValidacion[r.referencia]?.valida).map(r => (
                            <Chip key={r.referencia} label={`${r.referencia} ($${formatCurrency(r.monto)})`} color="error" size="small" />
                        ))}
                    </Box>
                    <Alert severity="warning">El pago se registrará con el monto total del comprobante (${formatCurrency(getTotalReferencias())} MXN). Las referencias no encontradas se guardarán en rojo.</Alert>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOmitirConfirmDialog(false)}>Cancelar</Button>
                    <Button variant="contained" color="warning" onClick={() => { setReferenciasOmitidas(true); setOmitirConfirmDialog(false); }}>Sí, omitir y continuar</Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar */}
            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>{snackbar.message}</Alert>
            </Snackbar>
        </Box>
    );
}
