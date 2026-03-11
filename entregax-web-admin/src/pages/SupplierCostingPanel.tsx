// ============================================
// SUPPLIER COSTING PANEL
// Panel de costeo por proveedor PO Box USA
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Typography,
    Paper,
    Grid,
    TextField,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Card,
    CardContent,
    Chip,
    Alert,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Tabs,
    Tab,
    Checkbox,
    Snackbar,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    IconButton,
} from '@mui/material';
import {
    Refresh as RefreshIcon,
    ArrowBack as ArrowBackIcon,
    Inventory as InventoryIcon,
    AttachMoney as MoneyIcon,
    Payment as PaymentIcon,
    CheckCircle as CheckCircleIcon,
    FilterList as FilterIcon,
    Business as BusinessIcon,
    TrendingUp as TrendingUpIcon,
    Info as InfoIcon,
    History as HistoryIcon,
    LocalShipping as ShippingIcon,
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    Edit as EditIcon,
} from '@mui/icons-material';
import api from '../services/api';

// Tipos
interface Supplier {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
    active: boolean;
}

interface CostingConfig {
    conversion_factor: number;
    dimensional_divisor: number;
    base_rate: number;
    min_cost: number;
    currency: string;
    is_active: boolean;
}

interface PackageCosting {
    id: number;
    tracking: string;
    pkg_length: number;
    pkg_width: number;
    pkg_height: number;
    weight: number;
    volume_raw: number;
    volume_adjusted: number;
    calculated_cost: number;
    cost_usd: number;
    status: string;
    received_at: string;
    created_at: string;
    user_name?: string;
    costing_paid?: boolean;
    costing_paid_at?: string;
    pobox_service_cost?: number;
    pobox_cost_usd?: number;
    registered_exchange_rate?: number;
    tc_registro?: number;
    // Campos para utilidades
    gex_total?: number;
    gex_insurance?: number;
    gex_fixed?: number;
    national_shipping?: number;
    sale_price?: number;
    client_name?: string;
    client_box_id?: string;
    client_paid?: boolean;
}

interface Consolidation {
    id: number;
    status: string;
    total_weight: number;
    package_count: number;
    created_at: string;
    packages?: PackageCosting[];
}

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

interface SupplierCostingPanelProps {
    supplier: Supplier;
    onBack: () => void;
}

function TabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`supplier-costing-tabpanel-${index}`}
            aria-labelledby={`supplier-costing-tab-${index}`}
            {...other}
        >
            {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
        </div>
    );
}

export default function SupplierCostingPanel({ supplier, onBack }: SupplierCostingPanelProps) {
    const [activeTab, setActiveTab] = useState(0);
    const [loading, setLoading] = useState(false);
    const [packages, setPackages] = useState<PackageCosting[]>([]);
    const [config, setConfig] = useState<CostingConfig>({
        conversion_factor: 2.54,
        dimensional_divisor: 10780,
        base_rate: 75,
        min_cost: 50,
        currency: 'MXN',
        is_active: true,
    });
    const [tcApi, setTcApi] = useState<number>(17.65);

    // Filtros
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const [showPaidFilter, setShowPaidFilter] = useState<'all' | 'paid' | 'unpaid'>('unpaid');

    // Selección para pago
    const [selectedPackages, setSelectedPackages] = useState<number[]>([]);
    const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
    const [paymentReference, setPaymentReference] = useState('');
    const [processingPayment, setProcessingPayment] = useState(false);
    const [snackbar, setSnackbar] = useState<{open: boolean; message: string; severity: 'success' | 'error'}>({
        open: false, message: '', severity: 'success'
    });

    // Utilidades
    const getUserRole = (): string => {
        try {
            const userStr = localStorage.getItem('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                return user.role || '';
            }
        } catch { return ''; }
        return '';
    };
    const userRole = getUserRole();
    const normalizedRole = userRole.toLowerCase().replace(/\s+/g, '_');
    const canViewUtilidades = ['admin', 'super_admin'].includes(normalizedRole);

    const [utilidadesDateFrom, setUtilidadesDateFrom] = useState<string>('');
    const [utilidadesDateTo, setUtilidadesDateTo] = useState<string>('');
    const [utilidadesPaymentFilter, setUtilidadesPaymentFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
    const [utilidadesPackages, setUtilidadesPackages] = useState<PackageCosting[]>([]);
    const [loadingUtilidades, setLoadingUtilidades] = useState(false);

    // Consolidaciones
    const [consolidations, setConsolidations] = useState<Consolidation[]>([]);
    const [loadingConsolidations, setLoadingConsolidations] = useState(false);
    const [expandedConsolidation, setExpandedConsolidation] = useState<number | null>(null);
    const [statusDialogOpen, setStatusDialogOpen] = useState(false);
    const [selectedConsolidation, setSelectedConsolidation] = useState<Consolidation | null>(null);
    const [updatingStatus, setUpdatingStatus] = useState(false);

    // Opciones de estado para consolidaciones
    const consolidationStatusOptions = [
        { value: 'received', label: 'En Bodega', icon: '📦', color: '#9e9e9e' },
        { value: 'in_transit', label: 'En Tránsito', icon: '🚚', color: '#2196f3' },
        { value: 'customs', label: 'En Aduana', icon: '🏛️', color: '#ff9800' },
        { value: 'ready_pickup', label: 'Listo para Recoger', icon: '✅', color: '#4caf50' },
        { value: 'delivered', label: 'Entregado', icon: '🎉', color: '#8bc34a' },
    ];

    // Cálculo
    const calculateCost = useCallback((largo_cm: number, ancho_cm: number, alto_cm: number) => {
        const volume_raw = largo_cm * ancho_cm * alto_cm;
        const largo_pulg = largo_cm / 2.54;
        const ancho_pulg = ancho_cm / 2.54;
        const alto_pulg = alto_cm / 2.54;
        const volume_adjusted = largo_pulg * ancho_pulg * alto_pulg;
        const pie3 = volume_adjusted / config.dimensional_divisor;
        const cost_usd = pie3 * config.base_rate;
        let cost = cost_usd * tcApi;
        if (cost < config.min_cost) cost = config.min_cost;
        return { volume_raw, volume_adjusted, cost, cost_usd };
    }, [config.dimensional_divisor, config.base_rate, config.min_cost, tcApi]);

    // Carga
    const loadConfig = async () => {
        try {
            const response = await api.get('/pobox/costing/config');
            if (response.data?.config) setConfig(response.data.config);
        } catch { /* usar default */ }
    };

    const loadTcApi = async () => {
        try {
            const response = await api.get('/admin/exchange-rate/config');
            if (response.data?.configs) {
                const poboxConfig = response.data.configs.find((c: { servicio: string }) => c.servicio === 'pobox_usa');
                if (poboxConfig?.ultimo_tc_api) setTcApi(parseFloat(poboxConfig.ultimo_tc_api));
            }
        } catch { /* usar default */ }
    };

    const loadPackages = useCallback(async () => {
        setLoading(true);
        setSelectedPackages([]);
        try {
            const params = new URLSearchParams();
            params.append('supplier_id', String(supplier.id));
            if (dateFrom) params.append('date_from', dateFrom);
            if (dateTo) params.append('date_to', dateTo);
            if (showPaidFilter === 'paid') params.append('paid', 'true');
            if (showPaidFilter === 'unpaid') params.append('paid', 'false');
            
            const response = await api.get(`/pobox/costing/packages?${params.toString()}`);
            if (response.data?.packages) {
                const packagesWithCosts = response.data.packages.map((pkg: PackageCosting) => {
                    const length = parseFloat(String(pkg.pkg_length)) || 0;
                    const width = parseFloat(String(pkg.pkg_width)) || 0;
                    const height = parseFloat(String(pkg.pkg_height)) || 0;
                    const savedCost = parseFloat(String(pkg.pobox_service_cost)) || 0;
                    const savedCostUsd = parseFloat(String(pkg.pobox_cost_usd)) || 0;
                    const savedTc = parseFloat(String(pkg.registered_exchange_rate)) || 0;
                    let finalCost = savedCost;
                    let costUsd = savedCostUsd;
                    let tcUsado = savedTc || tcApi;
                    if (savedCost === 0 && length > 0 && width > 0 && height > 0) {
                        const { cost, cost_usd } = calculateCost(length, width, height);
                        finalCost = cost;
                        costUsd = cost_usd;
                        tcUsado = tcApi;
                    }
                    const { volume_raw, volume_adjusted } = calculateCost(length, width, height);
                    return { ...pkg, pkg_length: length, pkg_width: width, pkg_height: height,
                        volume_raw, volume_adjusted, calculated_cost: finalCost, cost_usd: costUsd, tc_registro: tcUsado };
                });
                setPackages(packagesWithCosts);
            }
        } catch (error) {
            console.error('Error cargando paquetes:', error);
        } finally {
            setLoading(false);
        }
    }, [supplier.id, dateFrom, dateTo, showPaidFilter, tcApi, calculateCost]);

    // Selección y pago
    const handleSelectPackage = (pkgId: number) => {
        setSelectedPackages(prev => prev.includes(pkgId) ? prev.filter(id => id !== pkgId) : [...prev, pkgId]);
    };

    const handleSelectAll = () => {
        const pkgs = packages || [];
        const unpaidPkgs = pkgs.filter(p => !p.costing_paid);
        setSelectedPackages(selectedPackages.length === unpaidPkgs.length ? [] : unpaidPkgs.map(p => p.id));
    };

    const getSelectedTotal = () => {
        const pkgs = packages || [];
        return pkgs.filter(p => selectedPackages.includes(p.id)).reduce((sum, p) => sum + (p.calculated_cost || 0), 0) || 0;
    };

    const handleMarkAsPaid = async () => {
        if (selectedPackages.length === 0) return;
        setProcessingPayment(true);
        try {
            const totalCost = getSelectedTotal();
            await api.post('/pobox/costing/mark-paid', {
                package_ids: selectedPackages, total_cost: totalCost, payment_reference: paymentReference, supplier_id: supplier.id
            });
            setSnackbar({ open: true, message: `✅ ${selectedPackages.length} paquetes marcados como pagados - Total: $${totalCost.toFixed(2)}`, severity: 'success' });
            setPaymentDialogOpen(false);
            setPaymentReference('');
            setSelectedPackages([]);
            loadPackages();
        } catch (error) {
            console.error('Error:', error);
            setSnackbar({ open: true, message: '❌ Error al procesar el pago', severity: 'error' });
        } finally { setProcessingPayment(false); }
    };

    // Utilidades
    const loadUtilidades = useCallback(async () => {
        setLoadingUtilidades(true);
        try {
            const params = new URLSearchParams();
            params.append('supplier_id', String(supplier.id));
            if (utilidadesDateFrom) params.append('date_from', utilidadesDateFrom);
            if (utilidadesDateTo) params.append('date_to', utilidadesDateTo);
            if (utilidadesPaymentFilter === 'paid') params.append('paid', 'true');
            if (utilidadesPaymentFilter === 'unpaid') params.append('paid', 'false');
            const response = await api.get(`/pobox/costing/utilidades?${params.toString()}`);
            if (response.data?.packages) setUtilidadesPackages(response.data.packages);
        } catch (error) { console.error('Error:', error); }
        finally { setLoadingUtilidades(false); }
    }, [supplier.id, utilidadesDateFrom, utilidadesDateTo, utilidadesPaymentFilter]);

    const calcularUtilidades = () => {
        const totalCostoProveedor = utilidadesPackages.reduce((sum, pkg) => 
            sum + ((pkg.pobox_cost_usd || 0) * ((pkg.registered_exchange_rate || 0) || tcApi)), 0);
        const totalCobradoCliente = utilidadesPackages.reduce((sum, pkg) => sum + (pkg.pobox_service_cost || 0), 0);
        const utilidadBruta = totalCobradoCliente - totalCostoProveedor;
        const margen = totalCobradoCliente > 0 ? (utilidadBruta / totalCobradoCliente) * 100 : 0;
        return { totalPaquetes: utilidadesPackages.length, totalCostoProveedor, totalCobradoCliente, utilidadBruta, margen };
    };

    // Consolidaciones
    const loadConsolidations = useCallback(async () => {
        setLoadingConsolidations(true);
        try {
            const response = await api.get(`/suppliers/${supplier.id}/consolidations`);
            if (response.data?.consolidations) setConsolidations(response.data.consolidations);
        } catch (error) { console.error('Error cargando consolidaciones:', error); }
        finally { setLoadingConsolidations(false); }
    }, [supplier.id]);

    const toggleConsolidationDetails = (consolidationId: number) => {
        setExpandedConsolidation(expandedConsolidation === consolidationId ? null : consolidationId);
    };

    // Abrir diálogo para cambiar estado de consolidación
    const handleOpenStatusDialog = (cons: Consolidation, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedConsolidation(cons);
        setStatusDialogOpen(true);
    };

    // Actualizar estado de consolidación y sus paquetes
    const handleUpdateConsolidationStatus = async (newStatus: string) => {
        if (!selectedConsolidation) return;
        setUpdatingStatus(true);
        try {
            await api.put(`/suppliers/consolidations/${selectedConsolidation.id}/status`, { status: newStatus });
            setSnackbar({ 
                open: true, 
                message: `✅ Estado actualizado a "${consolidationStatusOptions.find(o => o.value === newStatus)?.label}" - ${selectedConsolidation.package_count} paquetes actualizados`, 
                severity: 'success' 
            });
            setStatusDialogOpen(false);
            loadConsolidations(); // Recargar consolidaciones
            loadPackages(); // Recargar paquetes también
        } catch (error) {
            console.error('Error actualizando estado:', error);
            setSnackbar({ open: true, message: '❌ Error al actualizar el estado', severity: 'error' });
        } finally {
            setUpdatingStatus(false);
        }
    };

    useEffect(() => { loadConfig(); loadTcApi(); }, []);
    useEffect(() => { loadPackages(); }, [loadPackages]);
    useEffect(() => { if (activeTab === 2 && canViewUtilidades) loadUtilidades(); }, [activeTab, canViewUtilidades, loadUtilidades]);
    useEffect(() => { if (activeTab === 3) loadConsolidations(); }, [activeTab, loadConsolidations]);

    const getTotals = () => {
        const pkgs = packages || [];
        const totalCost = pkgs.reduce((sum, pkg) => sum + (pkg.calculated_cost || 0), 0);
        const totalCostUsd = pkgs.reduce((sum, pkg) => sum + (pkg.cost_usd || 0), 0);
        const paidCount = pkgs.filter(p => p.costing_paid).length;
        const unpaidCount = pkgs.filter(p => !p.costing_paid).length;
        const unpaidTotal = pkgs.filter(p => !p.costing_paid).reduce((sum, p) => sum + (p.calculated_cost || 0), 0);
        return { totalCost: totalCost || 0, totalCostUsd: totalCostUsd || 0, paidCount, unpaidCount, unpaidTotal: unpaidTotal || 0 };
    };

    const { totalCost, totalCostUsd, paidCount, unpaidCount, unpaidTotal } = getTotals();

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <IconButton onClick={onBack} sx={{ bgcolor: 'action.hover' }}>
                    <ArrowBackIcon />
                </IconButton>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                    <BusinessIcon sx={{ fontSize: 32, color: 'secondary.main' }} />
                    <Box>
                        <Typography variant="h5" fontWeight="bold">Costeo - {supplier.name}</Typography>
                        <Typography variant="body2" color="text.secondary">Panel de costeo internacional PO Box USA</Typography>
                    </Box>
                </Box>
                <Button variant="contained" startIcon={<RefreshIcon />} onClick={loadPackages} disabled={loading}>
                    Actualizar
                </Button>
            </Box>

            {/* Fórmula Info Card */}
            <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 3 }}>
                <Typography variant="subtitle2" fontWeight="bold">Fórmula de Costeo:</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                    1. cm → pulgadas (÷ 2.54) → L × A × H (pulg) ÷ {Number(config.dimensional_divisor || 10780).toLocaleString()} = Pie³
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    2. Pie³ × ${Number(config.base_rate || 75).toFixed(2)} USD × TC API ${Number(tcApi || 17.65).toFixed(2)} = Costo MXN
                </Typography>
            </Alert>

            {/* Stats */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card sx={{ bgcolor: 'primary.main', color: 'white' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <InventoryIcon />
                                <Typography variant="h4" fontWeight="bold">{packages.length}</Typography>
                            </Box>
                            <Typography variant="body2">Total Paquetes</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card sx={{ bgcolor: 'success.main', color: 'white' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CheckCircleIcon />
                                <Typography variant="h4" fontWeight="bold">{paidCount}</Typography>
                            </Box>
                            <Typography variant="body2">Pagados</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card sx={{ bgcolor: 'warning.main', color: 'white' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <PaymentIcon />
                                <Typography variant="h4" fontWeight="bold">{unpaidCount}</Typography>
                            </Box>
                            <Typography variant="body2">Pendientes</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card sx={{ bgcolor: 'error.main', color: 'white' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <MoneyIcon />
                                <Typography variant="h4" fontWeight="bold">${Number(unpaidTotal || 0).toFixed(0)}</Typography>
                            </Box>
                            <Typography variant="body2">Por Cobrar MXN</Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Tabs */}
            <Paper sx={{ mb: 2 }}>
                <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
                    <Tab icon={<InventoryIcon />} label={`📦 Paquetes (${unpaidCount} pendientes)`} />
                    <Tab icon={<HistoryIcon />} label="📊 Historial" />
                    {canViewUtilidades && <Tab icon={<TrendingUpIcon />} label="💵 Utilidades" />}
                    <Tab icon={<ShippingIcon />} label={`🚚 Consolidaciones (${consolidations.length})`} />
                </Tabs>
            </Paper>

            {/* Tab 0: Paquetes */}
            <TabPanel value={activeTab} index={0}>
                {/* Filtros */}
                <Paper sx={{ p: 2, mb: 2 }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid size={{ xs: 12, sm: 3 }}>
                            <TextField label="Desde" type="date" fullWidth size="small" value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 3 }}>
                            <TextField label="Hasta" type="date" fullWidth size="small" value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 3 }}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Estado</InputLabel>
                                <Select value={showPaidFilter} label="Estado" onChange={(e) => setShowPaidFilter(e.target.value as 'all' | 'paid' | 'unpaid')}>
                                    <MenuItem value="all">Todos</MenuItem>
                                    <MenuItem value="unpaid">Pendientes</MenuItem>
                                    <MenuItem value="paid">Pagados</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 3 }}>
                            <Button variant="contained" fullWidth startIcon={<FilterIcon />} onClick={loadPackages}>Filtrar</Button>
                        </Grid>
                    </Grid>
                </Paper>

                {/* Barra de acciones */}
                {selectedPackages.length > 0 && (
                    <Paper sx={{ p: 2, mb: 2, bgcolor: 'warning.light' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography fontWeight="bold">
                                {selectedPackages.length} paquete(s) - Total: ${Number(getSelectedTotal()).toFixed(2)} MXN
                            </Typography>
                            <Button variant="contained" color="success" startIcon={<PaymentIcon />} onClick={() => setPaymentDialogOpen(true)}>
                                Marcar como Pagado
                            </Button>
                        </Box>
                    </Paper>
                )}

                {/* Tabla */}
                <TableContainer component={Paper}>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
                    ) : packages.length === 0 ? (
                        <Box sx={{ p: 4, textAlign: 'center' }}>
                            <InventoryIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                            <Typography color="text.secondary">No hay paquetes para este proveedor</Typography>
                        </Box>
                    ) : (
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'grey.100' }}>
                                    <TableCell padding="checkbox">
                                        <Checkbox checked={selectedPackages.length === packages.filter(p => !p.costing_paid).length && packages.filter(p => !p.costing_paid).length > 0}
                                            indeterminate={selectedPackages.length > 0 && selectedPackages.length < packages.filter(p => !p.costing_paid).length}
                                            onChange={handleSelectAll} />
                                    </TableCell>
                                    <TableCell><strong>Tracking</strong></TableCell>
                                    <TableCell align="center"><strong>Dimensiones</strong></TableCell>
                                    <TableCell align="right"><strong>Pie³</strong></TableCell>
                                    <TableCell align="right"><strong>USD</strong></TableCell>
                                    <TableCell align="right"><strong>MXN</strong></TableCell>
                                    <TableCell align="center"><strong>Status</strong></TableCell>
                                    <TableCell align="center"><strong>Pago Proveedor</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {packages.map((pkg) => (
                                    <TableRow key={pkg.id} hover sx={{ bgcolor: pkg.costing_paid ? 'success.50' : 'inherit' }}>
                                        <TableCell padding="checkbox">
                                            <Checkbox checked={selectedPackages.includes(pkg.id)} onChange={() => handleSelectPackage(pkg.id)} disabled={pkg.costing_paid} />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight="medium">{pkg.tracking}</Typography>
                                            {pkg.user_name && <Typography variant="caption" color="text.secondary">{pkg.user_name}</Typography>}
                                        </TableCell>
                                        <TableCell align="center">
                                            {pkg.pkg_length > 0 && pkg.pkg_width > 0 && pkg.pkg_height > 0 ? (
                                                <Typography variant="caption">{pkg.pkg_length}×{pkg.pkg_width}×{pkg.pkg_height} cm</Typography>
                                            ) : (
                                                <Typography variant="caption" color="error">Sin medidas</Typography>
                                            )}
                                        </TableCell>
                                        <TableCell align="right">{pkg.volume_adjusted && pkg.volume_adjusted > 0 ? Number(pkg.volume_adjusted / config.dimensional_divisor).toFixed(4) : '-'}</TableCell>
                                        <TableCell align="right"><Typography fontWeight="medium" color="primary">${pkg.cost_usd ? Number(pkg.cost_usd).toFixed(2) : '-'}</Typography></TableCell>
                                        <TableCell align="right"><Typography fontWeight="bold" color="success.main">${pkg.calculated_cost ? Number(pkg.calculated_cost).toFixed(2) : '-'}</Typography></TableCell>
                                        <TableCell align="center">
                                            <Chip 
                                                label={pkg.status === 'in_transit' ? 'En Tránsito' : pkg.status === 'received' ? 'Recibido' : pkg.status === 'dispatched' ? 'Despachado' : pkg.status || 'N/A'} 
                                                size="small" 
                                                color={pkg.status === 'in_transit' ? 'info' : pkg.status === 'received' ? 'default' : 'primary'} 
                                                variant="outlined"
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            {pkg.costing_paid ? <Chip icon={<CheckCircleIcon />} label="Pagado" size="small" color="success" /> : <Chip label="Pendiente" size="small" color="warning" variant="outlined" />}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </TableContainer>

                {/* Totales */}
                <Paper sx={{ p: 2, mt: 2, bgcolor: 'grey.100' }}>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 6, sm: 3 }}>
                            <Typography variant="body2" color="text.secondary">Total Paquetes</Typography>
                            <Typography variant="h6" fontWeight="bold">{packages.length}</Typography>
                        </Grid>
                        <Grid size={{ xs: 6, sm: 3 }}>
                            <Typography variant="body2" color="text.secondary">Total USD</Typography>
                            <Typography variant="h6" fontWeight="bold" color="primary">${Number(totalCostUsd || 0).toFixed(2)}</Typography>
                        </Grid>
                        <Grid size={{ xs: 6, sm: 3 }}>
                            <Typography variant="body2" color="text.secondary">Total MXN</Typography>
                            <Typography variant="h6" fontWeight="bold" color="success.main">${Number(totalCost || 0).toFixed(2)}</Typography>
                        </Grid>
                        <Grid size={{ xs: 6, sm: 3 }}>
                            <Typography variant="body2" color="text.secondary">Por Cobrar MXN</Typography>
                            <Typography variant="h6" fontWeight="bold" color="error">${Number(unpaidTotal || 0).toFixed(2)}</Typography>
                        </Grid>
                    </Grid>
                </Paper>
            </TabPanel>

            {/* Tab 1: Historial */}
            <TabPanel value={activeTab} index={1}>
                <Paper sx={{ p: 3, textAlign: 'center' }}>
                    <HistoryIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">
                        📊 Historial de costeos - Próximamente
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Aquí podrás ver el historial de todos los pagos realizados al proveedor {supplier.name}
                    </Typography>
                </Paper>
            </TabPanel>

            {/* Tab 2: Utilidades (solo admin/super_admin) */}
            {canViewUtilidades && (
                <TabPanel value={activeTab} index={2}>
                    {/* Filtros */}
                    <Paper sx={{ p: 2, mb: 2 }}>
                        <Grid container spacing={2} alignItems="center">
                            <Grid size={{ xs: 12, sm: 3 }}>
                                <TextField label="Fecha Desde" type="date" fullWidth size="small" value={utilidadesDateFrom}
                                    onChange={(e) => setUtilidadesDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 3 }}>
                                <TextField label="Fecha Hasta" type="date" fullWidth size="small" value={utilidadesDateTo}
                                    onChange={(e) => setUtilidadesDateTo(e.target.value)} InputLabelProps={{ shrink: true }} />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 3 }}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Estado de Pago</InputLabel>
                                    <Select value={utilidadesPaymentFilter} label="Estado de Pago" onChange={(e) => setUtilidadesPaymentFilter(e.target.value as 'all' | 'paid' | 'unpaid')}>
                                        <MenuItem value="all">Todos</MenuItem>
                                        <MenuItem value="paid">Pagados</MenuItem>
                                        <MenuItem value="unpaid">Sin Pagar</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid size={{ xs: 12, sm: 3 }}>
                                <Button variant="contained" fullWidth startIcon={<FilterIcon />} onClick={loadUtilidades}>Filtrar</Button>
                            </Grid>
                        </Grid>
                    </Paper>

                    {/* Cards de Resumen */}
                    {(() => {
                        const stats = calcularUtilidades();
                        return (
                            <Grid container spacing={2} sx={{ mb: 3 }}>
                                <Grid size={{ xs: 12, sm: 4 }}>
                                    <Card sx={{ bgcolor: 'error.light', color: 'error.contrastText' }}>
                                        <CardContent>
                                            <Typography variant="subtitle2">Total Costo</Typography>
                                            <Typography variant="h4" fontWeight="bold">${stats.totalCostoProveedor.toFixed(2)}</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid size={{ xs: 12, sm: 4 }}>
                                    <Card sx={{ bgcolor: 'primary.light', color: 'primary.contrastText' }}>
                                        <CardContent>
                                            <Typography variant="subtitle2">Total Venta</Typography>
                                            <Typography variant="h4" fontWeight="bold">${stats.totalCobradoCliente.toFixed(2)}</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid size={{ xs: 12, sm: 4 }}>
                                    <Card sx={{ bgcolor: 'success.light', color: 'success.contrastText' }}>
                                        <CardContent>
                                            <Typography variant="subtitle2">Utilidad Total ({stats.margen.toFixed(1)}%)</Typography>
                                            <Typography variant="h4" fontWeight="bold">${stats.utilidadBruta.toFixed(2)}</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            </Grid>
                        );
                    })()}

                    {/* Tabla de Utilidades */}
                    <TableContainer component={Paper}>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'primary.main' }}>
                                    <TableCell sx={{ color: 'white' }}>Guía</TableCell>
                                    <TableCell sx={{ color: 'white' }}>Cliente</TableCell>
                                    <TableCell sx={{ color: 'white' }} align="right">Costo</TableCell>
                                    <TableCell sx={{ color: 'white' }} align="right">PO Box</TableCell>
                                    <TableCell sx={{ color: 'white' }} align="right">GEX</TableCell>
                                    <TableCell sx={{ color: 'white' }} align="right">Costo de Venta</TableCell>
                                    <TableCell sx={{ color: 'white' }} align="right">Utilidad</TableCell>
                                    <TableCell sx={{ color: 'white' }} align="center">Estado</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loadingUtilidades ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                                            <CircularProgress />
                                        </TableCell>
                                    </TableRow>
                                ) : utilidadesPackages.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                                            <Typography color="text.secondary">
                                                Presiona "Filtrar" para cargar los datos
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    utilidadesPackages.map((pkg) => {
                                        // COSTO = lo que nos cuesta (calculated_cost)
                                        const costo = parseFloat(String(pkg.calculated_cost)) || 0;
                                        // GEX = costo adicional de garantía
                                        const gexTotal = parseFloat(String(pkg.gex_total)) || 0;
                                        // Envío nacional (paquetería) - NO se incluye en utilidad
                                        const envioNacional = parseFloat(String(pkg.national_shipping)) || 0;
                                        // Total cobrado al cliente (incluye envío)
                                        const totalCobrado = parseFloat(String(pkg.sale_price)) || 0;
                                        // COSTO DE VENTA = Total - Envío Nacional (solo PO Box + GEX)
                                        const costoVenta = totalCobrado - envioNacional;
                                        // PO BOX = Costo de venta SIN GEX (precio PO Box puro)
                                        const pobox = costoVenta - gexTotal;
                                        // UTILIDAD = Costo de venta - Costo (sin contar envío nacional)
                                        const utilidad = costoVenta - costo;
                                        
                                        return (
                                            <TableRow key={pkg.id} hover>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="medium">{pkg.tracking}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2">{pkg.client_name || pkg.user_name || '-'}</Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" color="error.main" fontWeight="medium">${costo.toFixed(2)}</Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" color="text.secondary">${pobox.toFixed(2)}</Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" color={gexTotal > 0 ? 'info.main' : 'text.disabled'}>${gexTotal.toFixed(2)}</Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" color="primary.main" fontWeight="medium">${costoVenta.toFixed(2)}</Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Chip label={`$${utilidad.toFixed(2)}`} color={utilidad >= 0 ? 'success' : 'error'} size="small" />
                                                </TableCell>
                                                <TableCell align="center">
                                                    {pkg.client_paid ? (
                                                        <Chip icon={<CheckCircleIcon />} label="Cobrado" color="success" size="small" />
                                                    ) : (
                                                        <Chip label="Por Cobrar" color="error" size="small" />
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </TabPanel>
            )}

            {/* Tab 3: Consolidaciones */}
            <TabPanel value={activeTab} index={canViewUtilidades ? 3 : 2}>
                <Paper sx={{ p: 2, mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <ShippingIcon color="primary" /> Consolidaciones del Proveedor
                        </Typography>
                        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadConsolidations} disabled={loadingConsolidations}>
                            Actualizar
                        </Button>
                    </Box>

                    {loadingConsolidations ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <CircularProgress />
                        </Box>
                    ) : consolidations.length === 0 ? (
                        <Alert severity="info">No hay consolidaciones asignadas a este proveedor</Alert>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {consolidations.map((cons) => (
                                <Card key={cons.id} variant="outlined" sx={{ overflow: 'visible' }}>
                                    <CardContent sx={{ pb: 1 }}>
                                        <Box 
                                            sx={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'space-between',
                                                cursor: 'pointer',
                                                '&:hover': { bgcolor: 'action.hover' },
                                                borderRadius: 1,
                                                p: 1,
                                                m: -1
                                            }}
                                            onClick={() => toggleConsolidationDetails(cons.id)}
                                        >
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                <Chip 
                                                    label={`#${cons.id}`} 
                                                    color="primary" 
                                                    sx={{ fontWeight: 'bold', fontSize: '1rem' }}
                                                />
                                                <Box>
                                                    <Typography variant="body1" fontWeight="medium">
                                                        {cons.package_count} paquete(s)
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {new Date(cons.created_at).toLocaleDateString('es-MX', {
                                                            day: '2-digit',
                                                            month: 'short',
                                                            year: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                <Chip 
                                                    label={consolidationStatusOptions.find(o => o.value === cons.status)?.label || cons.status} 
                                                    sx={{ 
                                                        bgcolor: consolidationStatusOptions.find(o => o.value === cons.status)?.color || '#9e9e9e',
                                                        color: 'white',
                                                        fontWeight: 'medium'
                                                    }}
                                                    size="small"
                                                />
                                                {/* Status de Pago a Proveedor */}
                                                {cons.packages && cons.packages.length > 0 && (
                                                    (() => {
                                                        const totalPkgs = cons.packages.length;
                                                        const paidPkgs = cons.packages.filter((p: any) => p.costing_paid).length;
                                                        const allPaid = paidPkgs === totalPkgs;
                                                        const partialPaid = paidPkgs > 0 && paidPkgs < totalPkgs;
                                                        return (
                                                            <Chip 
                                                                icon={allPaid ? <CheckCircleIcon /> : undefined}
                                                                label={allPaid ? 'Pagado' : partialPaid ? `${paidPkgs}/${totalPkgs} Pagados` : 'Pago Pendiente'}
                                                                color={allPaid ? 'success' : partialPaid ? 'info' : 'warning'}
                                                                variant={allPaid ? 'filled' : 'outlined'}
                                                                size="small"
                                                            />
                                                        );
                                                    })()
                                                )}
                                                <IconButton 
                                                    size="small" 
                                                    onClick={(e) => handleOpenStatusDialog(cons, e)}
                                                    sx={{ 
                                                        bgcolor: 'grey.200', 
                                                        '&:hover': { bgcolor: 'grey.300' },
                                                        width: 28,
                                                        height: 28
                                                    }}
                                                >
                                                    <EditIcon sx={{ fontSize: 16 }} />
                                                </IconButton>
                                                <Typography variant="body2" color="text.secondary">
                                                    {Number(cons.total_weight || 0).toFixed(1)} kg
                                                </Typography>
                                                <IconButton size="small">
                                                    {expandedConsolidation === cons.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                                </IconButton>
                                            </Box>
                                        </Box>
                                    </CardContent>

                                    {/* Detalle expandido */}
                                    {expandedConsolidation === cons.id && (
                                        <Box sx={{ bgcolor: 'grey.50', p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                                            <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <InventoryIcon fontSize="small" /> Guías en esta consolidación:
                                            </Typography>
                                            {cons.packages && cons.packages.length > 0 ? (
                                                <TableContainer component={Paper} variant="outlined">
                                                    <Table size="small">
                                                        <TableHead>
                                                            <TableRow sx={{ bgcolor: 'grey.100' }}>
                                                                <TableCell><strong>Tracking</strong></TableCell>
                                                                <TableCell><strong>Cliente</strong></TableCell>
                                                                <TableCell align="center"><strong>Dimensiones</strong></TableCell>
                                                                <TableCell align="right"><strong>Peso</strong></TableCell>
                                                                <TableCell align="right"><strong>Costo USD</strong></TableCell>
                                                                <TableCell align="center"><strong>Pago Proveedor</strong></TableCell>
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            {cons.packages.map((pkg) => (
                                                                <TableRow key={pkg.id} hover>
                                                                    <TableCell>
                                                                        <Typography variant="body2" fontWeight="medium" color="primary">
                                                                            {pkg.tracking}
                                                                        </Typography>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Typography variant="body2">{pkg.client_name || '-'}</Typography>
                                                                        {pkg.client_box_id && <Typography variant="caption" color="text.secondary">{pkg.client_box_id}</Typography>}
                                                                    </TableCell>
                                                                    <TableCell align="center">
                                                                        <Typography variant="caption">
                                                                            {pkg.pkg_length}×{pkg.pkg_width}×{pkg.pkg_height} cm
                                                                        </Typography>
                                                                    </TableCell>
                                                                    <TableCell align="right">{Number(pkg.weight || 0).toFixed(1)} kg</TableCell>
                                                                    <TableCell align="right">
                                                                        <Typography color="primary.main" fontWeight="medium">
                                                                            ${Number(pkg.cost_usd || pkg.pobox_cost_usd || 0).toFixed(2)}
                                                                        </Typography>
                                                                    </TableCell>
                                                                    <TableCell align="center">
                                                                        {pkg.costing_paid ? (
                                                                            <Chip icon={<CheckCircleIcon />} label="Pagado" size="small" color="success" />
                                                                        ) : (
                                                                            <Chip label="Pendiente" size="small" color="warning" variant="outlined" />
                                                                        )}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </TableContainer>
                                            ) : (
                                                <Alert severity="info" sx={{ mt: 1 }}>Cargando detalles...</Alert>
                                            )}
                                        </Box>
                                    )}
                                </Card>
                            ))}
                        </Box>
                    )}
                </Paper>
            </TabPanel>

            {/* Dialog de Pago */}
            <Dialog open={paymentDialogOpen} onClose={() => setPaymentDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle><PaymentIcon sx={{ mr: 1, verticalAlign: 'middle' }} /> Confirmar Pago - {supplier.name}</DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 2 }}>
                        <Alert severity="info" sx={{ mb: 2 }}><strong>{selectedPackages.length}</strong> paquete(s) seleccionado(s)</Alert>
                        <Typography variant="h4" align="center" color="success.main" fontWeight="bold" sx={{ my: 2 }}>
                            Total: ${Number(getSelectedTotal()).toFixed(2)} MXN
                        </Typography>
                        <TextField label="Referencia de Pago (opcional)" fullWidth value={paymentReference}
                            onChange={(e) => setPaymentReference(e.target.value)} placeholder="Ej: Transferencia #12345" />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setPaymentDialogOpen(false)} disabled={processingPayment}>Cancelar</Button>
                    <Button variant="contained" color="success" onClick={handleMarkAsPaid} disabled={processingPayment}
                        startIcon={processingPayment ? <CircularProgress size={20} /> : <CheckCircleIcon />}>
                        {processingPayment ? 'Procesando...' : 'Confirmar Pago'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog de Cambio de Estado de Consolidación */}
            <Dialog open={statusDialogOpen} onClose={() => setStatusDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ pb: 1 }}>
                    Cambiar estado
                    {selectedConsolidation && (
                        <Typography variant="body2" color="text.secondary">
                            Consolidación #{selectedConsolidation.id} - {selectedConsolidation.package_count} paquete(s)
                        </Typography>
                    )}
                </DialogTitle>
                <DialogContent sx={{ pt: 1 }}>
                    <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 2 }}>
                        Se actualizará el estado de todas las guías del embarque
                    </Alert>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {consolidationStatusOptions.map((option) => (
                            <Button
                                key={option.value}
                                fullWidth
                                variant={selectedConsolidation?.status === option.value ? 'contained' : 'outlined'}
                                onClick={() => handleUpdateConsolidationStatus(option.value)}
                                disabled={updatingStatus || selectedConsolidation?.status === option.value}
                                sx={{
                                    justifyContent: 'flex-start',
                                    py: 1.5,
                                    bgcolor: selectedConsolidation?.status === option.value ? option.color : 'transparent',
                                    borderColor: option.color,
                                    color: selectedConsolidation?.status === option.value ? 'white' : option.color,
                                    '&:hover': {
                                        bgcolor: selectedConsolidation?.status === option.value ? option.color : `${option.color}20`,
                                        borderColor: option.color,
                                    }
                                }}
                                startIcon={<span style={{ fontSize: '1.2rem' }}>{option.icon}</span>}
                            >
                                {option.label}
                                {updatingStatus && selectedConsolidation?.status !== option.value && (
                                    <CircularProgress size={16} sx={{ ml: 'auto' }} />
                                )}
                            </Button>
                        ))}
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setStatusDialogOpen(false)} color="inherit">
                        Cerrar
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar */}
            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({...snackbar, open: false})}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
                <Alert severity={snackbar.severity} onClose={() => setSnackbar({...snackbar, open: false})}>{snackbar.message}</Alert>
            </Snackbar>
        </Box>
    );
}
