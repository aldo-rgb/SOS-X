// ============================================
// PANEL DE COSTEO TDI AÉREO CHINA
// Captura y cálculo de costos por guía master
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Box,
    Typography,
    Card,
    CardContent,
    TextField,
    Button,
    Grid,
    Divider,
    Alert,
    CircularProgress,
    Paper,
    Chip,
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
    LinearProgress,
    InputAdornment,
    Tabs,
    Tab,
    Tooltip,
} from '@mui/material';
import {
    Search as SearchIcon,
    Save as SaveIcon,
    Flight as FlightIcon,
    AttachMoney as MoneyIcon,
    Calculate as CalculateIcon,
    Description as PdfIcon,
    Delete as DeleteIcon,
    Refresh as RefreshIcon,
    CheckCircle as CheckIcon,
    Warning as WarningIcon,
    TrendingUp as TrendingUpIcon,
    Inventory as BoxIcon,
    Receipt as ReceiptIcon,
    OpenInNew as OpenCostIcon,
} from '@mui/icons-material';
import AwbCostingDialog from './AwbCostingDialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface MasterAwbData {
    id?: number;
    master_awb_number: string;
    airline: string;
    creation_date: string;
    origin: string;
    destination: string;
    total_boxes: number;
    total_weight_kg: number;
    freight_price_per_kg: number | null;
    clearance_cost_base: number | null;
    custody_fee: number | null;
    aa_expenses_fee: number | null;
    additional_expenses: number | null;
    calc_clearance_total_per_kg?: number;
    calc_final_price_per_kg?: number;
    calc_grand_total?: number;
    pdf_awb_url: string | null;
    pdf_aa_expenses_url: string | null;
    pdf_custody_url: string | null;
    is_fully_costed: boolean;
    status: string;
}

interface LinkedPackage {
    id: number;
    tracking_internal: string;
    weight: number;
    international_tracking: string;
    description: string;
    user_id: number;
    assigned_cost_mxn: number | null;
    shipping_cost: number | null;
}

interface CalculatedResults {
    clearanceTotalPerKg: number;
    finalPricePerKg: number;
    grandTotal: number;
}

interface MasterAwbListItem extends MasterAwbData {
    package_count: number;
    client_name?: string;
    client_box_id?: string;
    shipping_mark?: string;
}

interface ProfitReportItem {
    id: number;
    master_awb_number: string;
    creation_date: string;
    airline: string;
    total_boxes: number;
    total_weight_kg: number;
    costo_total_operativo: number;
    venta_total: number;
    utilidad_mxn: number;
    margen_porcentaje: number;
    packages_linked: number;
}

interface AwbCostListItem {
    id: number;
    awb_number: string;
    carrier: string | null;
    origin_airport: string | null;
    destination_airport: string | null;
    flight_number: string | null;
    flight_date: string | null;
    pieces: number | null;
    gross_weight_kg: number | null;
    calc_grand_total: number;
    calc_cost_per_kg: number;
    is_fully_costed: boolean;
    status: string;
    total_packages_s: number;
    total_packages_cajo: number;
    packages_s_count: number;
    packages_cajo_count: number;
    created_at: string;
}

export default function CostingPanelChinaAir() {
    const { t } = useTranslation();
    const [tabValue, setTabValue] = useState(0);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [awbSearch, setAwbSearch] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

    // Datos de la guía actual
    const [data, setData] = useState<MasterAwbData>({
        master_awb_number: '',
        airline: '',
        creation_date: new Date().toISOString().split('T')[0],
        origin: 'China',
        destination: 'México',
        total_boxes: 0,
        total_weight_kg: 0,
        freight_price_per_kg: null,
        clearance_cost_base: null,
        custody_fee: null,
        aa_expenses_fee: null,
        additional_expenses: null,
        pdf_awb_url: null,
        pdf_aa_expenses_url: null,
        pdf_custody_url: null,
        is_fully_costed: false,
        status: 'pending_cost',
    });

    const [linkedPackages, setLinkedPackages] = useState<LinkedPackage[]>([]);
    const [results, setResults] = useState<CalculatedResults>({
        clearanceTotalPerKg: 0,
        finalPricePerKg: 0,
        grandTotal: 0,
    });

    // Lista de guías y reportes
    const [masterList, setMasterList] = useState<MasterAwbListItem[]>([]);
    const [profitReport, setProfitReport] = useState<ProfitReportItem[]>([]);
    const [stats, setStats] = useState({
        total_guides: 0,
        pending_count: 0,
        completed_count: 0,
        total_cost: 0,
        total_weight: 0,
    });

    const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: number | null }>({ open: false, id: null });

    // AWB Costing (Tab 3)
    const [awbCostList, setAwbCostList] = useState<AwbCostListItem[]>([]);
    const [awbCostDialog, setAwbCostDialog] = useState<{ open: boolean; id: number | null }>({ open: false, id: null });
    const [awbCostStats, setAwbCostStats] = useState({
        total: 0, pending: 0, costed: 0, total_cost: 0, total_weight: 0,
        total_pieces: 0, total_s_packages: 0, total_cajo_packages: 0,
    });

    const token = localStorage.getItem('token');

    // ============================================
    // CALCULADORA EN VIVO
    // ============================================
    useEffect(() => {
        const kg = parseFloat(String(data.total_weight_kg)) || 0;
        const freight = parseFloat(String(data.freight_price_per_kg)) || 0;
        const clearanceBase = parseFloat(String(data.clearance_cost_base)) || 0;
        const custody = parseFloat(String(data.custody_fee)) || 0;
        const aa = parseFloat(String(data.aa_expenses_fee)) || 0;
        const add = parseFloat(String(data.additional_expenses)) || 0;

        // Fórmulas
        const clearanceTotalOp = (kg * clearanceBase) + custody + aa + add;
        const clearanceTotalPerKg = kg > 0 ? (clearanceTotalOp / kg) : 0;
        const finalPricePerKg = freight + clearanceTotalPerKg;
        const grandTotal = kg * finalPricePerKg;

        setResults({
            clearanceTotalPerKg,
            finalPricePerKg,
            grandTotal,
        });
    }, [data]);

    // ============================================
    // CARGAR DATOS INICIALES
    // ============================================
    const loadStats = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/api/master-cost/stats`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const json = await res.json();
                setStats(json.stats);
            }
        } catch (err) {
            console.error('Error loading stats:', err);
        }
    }, [token]);

    const loadMasterList = useCallback(async () => {
        try {
            // Cargar guías de china_receipts (TDI Aéreo China)
            const res = await fetch(`${API_URL}/api/master-cost/china-receipts?limit=50`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const json = await res.json();
                // Mapear datos de china_receipts al formato esperado
                const mappedData = (json.data || []).map((item: any) => ({
                    id: item.id,
                    master_awb_number: item.tracking,
                    airline: 'TDI Aéreo',
                    creation_date: item.created_at,
                    total_boxes: item.total_boxes || 0,
                    total_weight_kg: item.total_weight_kg || 0,
                    status: item.status === 'received_origin' ? 'pending_cost' : item.status,
                    is_fully_costed: item.assigned_cost_mxn > 0,
                    calc_grand_total: item.assigned_cost_mxn || 0,
                    package_count: item.total_boxes || 1,
                    client_name: item.client_name,
                    client_box_id: item.client_box_id,
                    shipping_mark: item.shipping_mark
                }));
                setMasterList(mappedData);
            }
        } catch (err) {
            console.error('Error loading list:', err);
        }
    }, [token]);

    const loadProfitReport = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/api/master-cost/profit-report`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const json = await res.json();
                setProfitReport(json.data);
            }
        } catch (err) {
            console.error('Error loading profit report:', err);
        }
    }, [token]);

    // Cargar lista de costos AWB (Tab 3)
    const loadAwbCostList = useCallback(async () => {
        try {
            const [listRes, statsRes] = await Promise.all([
                fetch(`${API_URL}/api/awb-costs?limit=100`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch(`${API_URL}/api/awb-costs/stats`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ]);
            if (listRes.ok) {
                const json = await listRes.json();
                setAwbCostList(json.data || []);
            }
            if (statsRes.ok) {
                const json = await statsRes.json();
                setAwbCostStats(json.stats || awbCostStats);
            }
        } catch (err) {
            console.error('Error loading AWB costs:', err);
        }
    }, [token]);

    useEffect(() => {
        loadStats();
        loadMasterList();
        loadProfitReport();
        loadAwbCostList();
    }, [loadStats, loadMasterList, loadProfitReport, loadAwbCostList]);

    // ============================================
    // BUSCAR GUÍA
    // ============================================
    const handleSearch = async () => {
        if (!awbSearch.trim()) {
            setMessage({ type: 'error', text: 'Ingresa un número de guía' });
            return;
        }

        setLoading(true);
        setMessage(null);
        try {
            const res = await fetch(`${API_URL}/api/master-cost/${encodeURIComponent(awbSearch)}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.ok) {
                const json = await res.json();
                setData({
                    ...data,
                    ...json.data,
                    freight_price_per_kg: json.data.freight_price_per_kg ?? null,
                    clearance_cost_base: json.data.clearance_cost_base ?? null,
                    custody_fee: json.data.custody_fee ?? null,
                    aa_expenses_fee: json.data.aa_expenses_fee ?? null,
                    additional_expenses: json.data.additional_expenses ?? null,
                });
                setLinkedPackages(json.linkedPackages || []);
                setMessage({
                    type: json.exists ? 'info' : 'success',
                    text: json.exists
                        ? `Guía encontrada - ${json.linkedPackages?.length || 0} paquetes vinculados`
                        : `Nueva guía - ${json.linkedPackages?.length || 0} paquetes encontrados`,
                });
            } else {
                setMessage({ type: 'error', text: 'Error al buscar la guía' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Error de conexión' });
        } finally {
            setLoading(false);
        }
    };

    // ============================================
    // GUARDAR COSTOS
    // ============================================
    const handleSave = async () => {
        if (!data.master_awb_number) {
            setMessage({ type: 'error', text: 'Primero busca una guía' });
            return;
        }

        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`${API_URL}/api/master-cost`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    ...data,
                    ...results,
                }),
            });

            if (res.ok) {
                const json = await res.json();
                setMessage({ type: 'success', text: json.message });
                // Recargar datos
                loadStats();
                loadMasterList();
                loadProfitReport();
            } else {
                setMessage({ type: 'error', text: 'Error al guardar' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Error de conexión' });
        } finally {
            setSaving(false);
        }
    };

    // ============================================
    // ELIMINAR GUÍA
    // ============================================
    const handleDelete = async () => {
        if (!deleteDialog.id) return;

        try {
            const res = await fetch(`${API_URL}/api/master-cost/${deleteDialog.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'Guía eliminada correctamente' });
                loadMasterList();
                loadStats();
            } else {
                setMessage({ type: 'error', text: 'Error al eliminar' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Error de conexión' });
        } finally {
            setDeleteDialog({ open: false, id: null });
        }
    };

    // ============================================
    // CALCULAR PROGRESO
    // ============================================
    const calculateProgress = () => {
        const fields = [
            data.freight_price_per_kg,
            data.clearance_cost_base,
            data.total_weight_kg,
        ];
        const filled = fields.filter((f) => f && Number(f) > 0).length;
        return (filled / fields.length) * 100;
    };

    // ============================================
    // RENDER
    // ============================================
    return (
        <Box>
            {/* Header */}
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h5" fontWeight="bold">
                        ✈️ {t('costing.title')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {t('costing.subtitle')}
                    </Typography>
                </Box>
                <Chip
                    icon={<FlightIcon />}
                    label={t('costing.route')}
                    color="primary"
                    variant="outlined"
                />
            </Box>

            {/* Stats Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <Card sx={{ bgcolor: '#E3F2FD' }}>
                        <CardContent sx={{ py: 1.5 }}>
                            <Typography variant="h4" fontWeight="bold" color="primary">
                                {stats.total_guides}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {t('costing.stats.totalGuides')}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <Card sx={{ bgcolor: '#FFF3E0' }}>
                        <CardContent sx={{ py: 1.5 }}>
                            <Typography variant="h4" fontWeight="bold" color="warning.main">
                                {stats.pending_count}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {t('costing.stats.pending')}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <Card sx={{ bgcolor: '#E8F5E9' }}>
                        <CardContent sx={{ py: 1.5 }}>
                            <Typography variant="h4" fontWeight="bold" color="success.main">
                                {stats.completed_count}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {t('costing.stats.completed')}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <Card sx={{ bgcolor: '#F3E5F5' }}>
                        <CardContent sx={{ py: 1.5 }}>
                            <Typography variant="h4" fontWeight="bold" color="secondary">
                                ${Number(stats.total_cost).toLocaleString()}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {t('costing.stats.totalCost')}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} variant="scrollable" scrollButtons="auto">
                    <Tab icon={<CalculateIcon />} label={t('costing.tabs.capture')} />
                    <Tab icon={<BoxIcon />} label={t('costing.tabs.registered')} />
                    <Tab icon={<TrendingUpIcon />} label={t('costing.tabs.profit')} />
                    <Tab
                        icon={<ReceiptIcon />}
                        label={`Costeo AWB (${awbCostList.length})`}
                    />
                </Tabs>
            </Box>

            {/* TAB 0: CAPTURA DE COSTOS */}
            {tabValue === 0 && (
                <Box>
                    {/* Mensaje */}
                    {message && (
                        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
                            {message.text}
                        </Alert>
                    )}

                    {/* Buscador */}
                    <Card sx={{ mb: 3 }}>
                        <CardContent>
                            <Typography variant="subtitle2" gutterBottom>
                                🔍 {t('costing.searchOrCreate')}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 2 }}>
                                <TextField
                                    fullWidth
                                    placeholder={t('costing.searchPlaceholder')}
                                    value={awbSearch}
                                    onChange={(e) => setAwbSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <FlightIcon color="action" />
                                            </InputAdornment>
                                        ),
                                    }}
                                    size="small"
                                />
                                <Button
                                    variant="contained"
                                    onClick={handleSearch}
                                    disabled={loading}
                                    startIcon={loading ? <CircularProgress size={20} /> : <SearchIcon />}
                                    sx={{ minWidth: 150 }}
                                >
                                    {t('costing.searchCreate')}
                                </Button>
                            </Box>
                        </CardContent>
                    </Card>

                    {/* Contenido principal - Solo si hay guía cargada */}
                    {data.master_awb_number && (
                        <>
                            {/* Progreso */}
                            <Box sx={{ mb: 2 }}>
                                <Typography variant="body2" color="text.secondary" gutterBottom>
                                    {t('costing.captureProgress')}: {Math.round(calculateProgress())}%
                                </Typography>
                                <LinearProgress
                                    variant="determinate"
                                    value={calculateProgress()}
                                    sx={{ height: 8, borderRadius: 4 }}
                                    color={calculateProgress() === 100 ? 'success' : 'primary'}
                                />
                            </Box>

                            <Grid container spacing={3}>
                                {/* Columna izquierda - Datos generales */}
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <Card sx={{ mb: 2 }}>
                                        <CardContent>
                                            <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <FlightIcon fontSize="small" /> {t('costing.generalData')}
                                            </Typography>
                                            <Grid container spacing={2}>
                                                <Grid size={{ xs: 12 }}>
                                                    <TextField
                                                        fullWidth
                                                        label={t('costing.guideNumber')}
                                                        value={data.master_awb_number}
                                                        disabled
                                                        size="small"
                                                    />
                                                </Grid>
                                                <Grid size={{ xs: 6 }}>
                                                    <TextField
                                                        fullWidth
                                                        label={t('costing.airline')}
                                                        value={data.airline}
                                                        onChange={(e) => setData({ ...data, airline: e.target.value })}
                                                        size="small"
                                                    />
                                                </Grid>
                                                <Grid size={{ xs: 6 }}>
                                                    <TextField
                                                        fullWidth
                                                        label={t('costing.date')}
                                                        type="date"
                                                        value={data.creation_date}
                                                        onChange={(e) => setData({ ...data, creation_date: e.target.value })}
                                                        size="small"
                                                        InputLabelProps={{ shrink: true }}
                                                    />
                                                </Grid>
                                                <Grid size={{ xs: 6 }}>
                                                    <TextField
                                                        fullWidth
                                                        label={t('costing.origin')}
                                                        value="China"
                                                        disabled
                                                        size="small"
                                                    />
                                                </Grid>
                                                <Grid size={{ xs: 6 }}>
                                                    <TextField
                                                        fullWidth
                                                        label={t('costing.destination')}
                                                        value={data.destination}
                                                        onChange={(e) => setData({ ...data, destination: e.target.value })}
                                                        size="small"
                                                    />
                                                </Grid>
                                                <Grid size={{ xs: 6 }}>
                                                    <TextField
                                                        fullWidth
                                                        label={t('costing.totalBoxes')}
                                                        type="number"
                                                        value={data.total_boxes}
                                                        onChange={(e) => setData({ ...data, total_boxes: Number(e.target.value) })}
                                                        size="small"
                                                    />
                                                </Grid>
                                                <Grid size={{ xs: 6 }}>
                                                    <TextField
                                                        fullWidth
                                                        label={t('costing.totalWeight')}
                                                        type="number"
                                                        value={data.total_weight_kg}
                                                        onChange={(e) => setData({ ...data, total_weight_kg: Number(e.target.value) })}
                                                        size="small"
                                                        InputProps={{
                                                            endAdornment: <InputAdornment position="end">kg</InputAdornment>,
                                                        }}
                                                    />
                                                </Grid>
                                            </Grid>
                                        </CardContent>
                                    </Card>

                                    {/* Paquetes vinculados */}
                                    {linkedPackages.length > 0 && (
                                        <Card>
                                            <CardContent>
                                                <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <BoxIcon fontSize="small" /> {t('costing.linkedPackages')} ({linkedPackages.length})
                                                </Typography>
                                                <TableContainer sx={{ maxHeight: 200 }}>
                                                    <Table size="small" stickyHeader>
                                                        <TableHead>
                                                            <TableRow>
                                                                <TableCell>{t('costing.tracking')}</TableCell>
                                                                <TableCell align="right">{t('costing.weight')}</TableCell>
                                                                <TableCell align="right">{t('costing.assignedCost')}</TableCell>
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            {linkedPackages.map((pkg) => (
                                                                <TableRow key={pkg.id}>
                                                                    <TableCell>{pkg.tracking_internal}</TableCell>
                                                                    <TableCell align="right">{pkg.weight} kg</TableCell>
                                                                    <TableCell align="right">
                                                                        {pkg.assigned_cost_mxn
                                                                            ? `$${Number(pkg.assigned_cost_mxn).toFixed(2)}`
                                                                            : '-'}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </TableContainer>
                                            </CardContent>
                                        </Card>
                                    )}
                                </Grid>

                                {/* Columna derecha - Costos y Resultados */}
                                <Grid size={{ xs: 12, md: 6 }}>
                                    {/* Captura de costos */}
                                    <Card sx={{ mb: 2, borderLeft: 4, borderColor: 'warning.main' }}>
                                        <CardContent>
                                            <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <MoneyIcon fontSize="small" color="warning" /> {t('costing.operationalCosts')}
                                            </Typography>
                                            <Grid container spacing={2}>
                                                <Grid size={{ xs: 6 }}>
                                                    <TextField
                                                        fullWidth
                                                        label={t('costing.freightPerKg')}
                                                        type="number"
                                                        value={data.freight_price_per_kg ?? ''}
                                                        onChange={(e) => setData({ ...data, freight_price_per_kg: Number(e.target.value) || null })}
                                                        size="small"
                                                        InputProps={{
                                                            startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                                        }}
                                                    />
                                                </Grid>
                                                <Grid size={{ xs: 6 }}>
                                                    <TextField
                                                        fullWidth
                                                        label={t('costing.clearanceBase')}
                                                        type="number"
                                                        value={data.clearance_cost_base ?? ''}
                                                        onChange={(e) => setData({ ...data, clearance_cost_base: Number(e.target.value) || null })}
                                                        size="small"
                                                        InputProps={{
                                                            startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                                        }}
                                                    />
                                                </Grid>
                                            </Grid>

                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, mb: 1 }}>
                                                {t('costing.flatFees')}
                                            </Typography>
                                            <Grid container spacing={2}>
                                                <Grid size={{ xs: 4 }}>
                                                    <TextField
                                                        fullWidth
                                                        label={t('costing.custodyFee')}
                                                        type="number"
                                                        value={data.custody_fee ?? ''}
                                                        onChange={(e) => setData({ ...data, custody_fee: Number(e.target.value) || null })}
                                                        size="small"
                                                        InputProps={{
                                                            startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                                        }}
                                                    />
                                                </Grid>
                                                <Grid size={{ xs: 4 }}>
                                                    <TextField
                                                        fullWidth
                                                        label={t('costing.aaExpenses')}
                                                        type="number"
                                                        value={data.aa_expenses_fee ?? ''}
                                                        onChange={(e) => setData({ ...data, aa_expenses_fee: Number(e.target.value) || null })}
                                                        size="small"
                                                        InputProps={{
                                                            startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                                        }}
                                                    />
                                                </Grid>
                                                <Grid size={{ xs: 4 }}>
                                                    <TextField
                                                        fullWidth
                                                        label={t('costing.additionalExpenses')}
                                                        type="number"
                                                        value={data.additional_expenses ?? ''}
                                                        onChange={(e) => setData({ ...data, additional_expenses: Number(e.target.value) || null })}
                                                        size="small"
                                                        InputProps={{
                                                            startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                                        }}
                                                    />
                                                </Grid>
                                            </Grid>

                                            {/* Botones de PDF */}
                                            <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
                                                <Button
                                                    size="small"
                                                    startIcon={<PdfIcon />}
                                                    variant={data.pdf_awb_url ? 'contained' : 'outlined'}
                                                    color={data.pdf_awb_url ? 'success' : 'inherit'}
                                                >
                                                    {t('costing.pdfGuide')}
                                                </Button>
                                                <Button
                                                    size="small"
                                                    startIcon={<PdfIcon />}
                                                    variant={data.pdf_aa_expenses_url ? 'contained' : 'outlined'}
                                                    color={data.pdf_aa_expenses_url ? 'success' : 'inherit'}
                                                >
                                                    {t('costing.pdfAA')}
                                                </Button>
                                                <Button
                                                    size="small"
                                                    startIcon={<PdfIcon />}
                                                    variant={data.pdf_custody_url ? 'contained' : 'outlined'}
                                                    color={data.pdf_custody_url ? 'success' : 'inherit'}
                                                >
                                                    {t('costing.pdfCustody')}
                                                </Button>
                                            </Box>
                                        </CardContent>
                                    </Card>

                                    {/* Resultados calculados */}
                                    <Card sx={{ bgcolor: '#FFFDE7' }}>
                                        <CardContent>
                                            <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <CalculateIcon fontSize="small" /> {t('costing.autoResults')}
                                            </Typography>

                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                <Typography variant="body2">{t('costing.totalWeightGuide')}:</Typography>
                                                <Typography variant="body2" fontWeight="bold">
                                                    {data.total_weight_kg} kg
                                                </Typography>
                                            </Box>
                                            <Divider sx={{ my: 1 }} />

                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                <Typography variant="body2">{t('costing.clearanceTotalPerKg')}:</Typography>
                                                <Typography variant="body2" fontWeight="bold" color="warning.main">
                                                    ${results.clearanceTotalPerKg.toFixed(2)}
                                                </Typography>
                                            </Box>

                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                <Typography variant="body2">{t('costing.finalPricePerKg')}:</Typography>
                                                <Typography variant="body1" fontWeight="bold">
                                                    ${results.finalPricePerKg.toFixed(2)}
                                                </Typography>
                                            </Box>

                                            <Divider sx={{ my: 1 }} />
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Typography variant="subtitle1" fontWeight="bold">
                                                    {t('costing.grandTotal').toUpperCase()}:
                                                </Typography>
                                                <Typography variant="h5" fontWeight="bold" color="success.main">
                                                    ${results.grandTotal.toFixed(2)}
                                                </Typography>
                                            </Box>
                                        </CardContent>
                                    </Card>

                                    {/* Botón guardar */}
                                    <Button
                                        fullWidth
                                        variant="contained"
                                        size="large"
                                        onClick={handleSave}
                                        disabled={saving || !data.master_awb_number}
                                        startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
                                        sx={{ mt: 2, py: 1.5, bgcolor: '#111', '&:hover': { bgcolor: '#333' } }}
                                    >
                                        {saving ? t('costing.saving') : t('costing.save').toUpperCase()}
                                    </Button>
                                </Grid>
                            </Grid>
                        </>
                    )}
                </Box>
            )}

            {/* TAB 1: GUÍAS REGISTRADAS */}
            {tabValue === 1 && (
                <Box>
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6">{t('costing.registeredGuides')}</Typography>
                        <Button startIcon={<RefreshIcon />} onClick={loadMasterList}>
                            {t('costing.refresh')}
                        </Button>
                    </Box>

                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'grey.100' }}>
                                    <TableCell>{t('costing.guideAwb')}</TableCell>
                                    <TableCell>Cliente</TableCell>
                                    <TableCell>{t('costing.date')}</TableCell>
                                    <TableCell align="right">{t('costing.boxes')}</TableCell>
                                    <TableCell align="right">{t('costing.weight')} (kg)</TableCell>
                                    <TableCell align="right">{t('costing.grandTotal')}</TableCell>
                                    <TableCell align="center">{t('costing.status')}</TableCell>
                                    <TableCell align="center">{t('costing.actions')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {masterList.map((item) => (
                                    <TableRow key={item.id} hover>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight="bold">
                                                {item.master_awb_number}
                                            </Typography>
                                            {item.shipping_mark && (
                                                <Typography variant="caption" color="text.secondary">
                                                    {item.shipping_mark}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2">{item.client_name || '-'}</Typography>
                                            {item.client_box_id && (
                                                <Typography variant="caption" color="primary">
                                                    {item.client_box_id}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>{item.creation_date ? new Date(item.creation_date).toLocaleDateString() : '-'}</TableCell>
                                        <TableCell align="right">{item.total_boxes}</TableCell>
                                        <TableCell align="right">{Number(item.total_weight_kg || 0).toFixed(2)}</TableCell>
                                        <TableCell align="right">
                                            ${Number(item.calc_grand_total || 0).toFixed(2)}
                                        </TableCell>
                                        <TableCell align="center">
                                            <Chip
                                                size="small"
                                                icon={item.is_fully_costed ? <CheckIcon /> : <WarningIcon />}
                                                label={item.is_fully_costed ? t('costing.completed') : t('costing.pending')}
                                                color={item.is_fully_costed ? 'success' : 'warning'}
                                                variant="outlined"
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Tooltip title="Editar">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => {
                                                        setAwbSearch(item.master_awb_number);
                                                        setTabValue(0);
                                                        handleSearch();
                                                    }}
                                                >
                                                    <SearchIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Eliminar">
                                                <IconButton
                                                    size="small"
                                                    color="error"
                                                    onClick={() => setDeleteDialog({ open: true, id: item.id! })}
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {masterList.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                                            <Typography color="text.secondary">{t('costing.noGuides')}</Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            )}

            {/* TAB 2: REPORTE DE UTILIDAD */}
            {tabValue === 2 && (
                <Box>
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6">📊 {t('costing.profitReport.title')}</Typography>
                        <Button startIcon={<RefreshIcon />} onClick={loadProfitReport}>
                            {t('costing.refresh')}
                        </Button>
                    </Box>

                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'grey.100' }}>
                                    <TableCell>{t('costing.guideAwb')}</TableCell>
                                    <TableCell>{t('costing.date')}</TableCell>
                                    <TableCell align="right">{t('costing.boxes')}</TableCell>
                                    <TableCell align="right">{t('costing.weight')} (kg)</TableCell>
                                    <TableCell align="right">{t('costing.profitReport.operationalCost')}</TableCell>
                                    <TableCell align="right">{t('costing.profitReport.totalSales')}</TableCell>
                                    <TableCell align="right">{t('costing.profitReport.profit')}</TableCell>
                                    <TableCell align="right">{t('costing.profitReport.margin')} %</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {profitReport.map((item) => (
                                    <TableRow key={item.id} hover>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight="bold">
                                                {item.master_awb_number}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>{item.creation_date}</TableCell>
                                        <TableCell align="right">{item.total_boxes}</TableCell>
                                        <TableCell align="right">{item.total_weight_kg}</TableCell>
                                        <TableCell align="right">
                                            ${Number(item.costo_total_operativo || 0).toFixed(2)}
                                        </TableCell>
                                        <TableCell align="right">
                                            ${Number(item.venta_total || 0).toFixed(2)}
                                        </TableCell>
                                        <TableCell align="right">
                                            <Typography
                                                fontWeight="bold"
                                                color={Number(item.utilidad_mxn) >= 0 ? 'success.main' : 'error.main'}
                                            >
                                                ${Number(item.utilidad_mxn || 0).toFixed(2)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Chip
                                                size="small"
                                                label={`${item.margen_porcentaje}%`}
                                                color={Number(item.margen_porcentaje) >= 15 ? 'success' : Number(item.margen_porcentaje) >= 0 ? 'warning' : 'error'}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {profitReport.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                                            <Typography color="text.secondary">
                                                {t('costing.noGuides')}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            )}

            {/* Dialog de confirmación de eliminación */}
            <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, id: null })}>
                <DialogTitle>⚠️ {t('costing.deleteGuide')}</DialogTitle>
                <DialogContent>
                    <Typography>
                        {t('costing.confirmDelete', { guide: '' })}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialog({ open: false, id: null })}>{t('costing.cancel')}</Button>
                    <Button onClick={handleDelete} color="error" variant="contained">
                        {t('costing.delete')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* TAB 3: COSTEO AWB (estilo marítimo) */}
            {tabValue === 3 && (
                <Box>
                    {/* Stats cards */}
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        {[
                            { label: 'Total AWBs', value: awbCostStats.total, color: '#1976d2', icon: '✈️' },
                            { label: 'Pendientes', value: awbCostStats.pending, color: '#ed6c02', icon: '⏳' },
                            { label: 'Costeados', value: awbCostStats.costed, color: '#2e7d32', icon: '✅' },
                            { label: 'Costo Total', value: `$${Number(awbCostStats.total_cost || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, color: '#9c27b0', icon: '💰' },
                            { label: 'Peso Total', value: `${Number(awbCostStats.total_weight || 0).toLocaleString()} kg`, color: '#0288d1', icon: '⚖️' },
                            { label: 'Paquetes S', value: awbCostStats.total_s_packages, color: '#388e3c', icon: '📦' },
                        ].map(({ label, value, color, icon }) => (
                            <Grid size={{ xs: 6, md: 2 }} key={label}>
                                <Card sx={{ borderLeft: 4, borderColor: color }}>
                                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                        <Typography variant="caption" color="text.secondary">{icon} {label}</Typography>
                                        <Typography variant="h6" fontWeight="bold">{value}</Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>

                    {/* Header */}
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6">📋 Líneas de Costeo AWB</Typography>
                        <Button startIcon={<RefreshIcon />} onClick={loadAwbCostList}>
                            Actualizar
                        </Button>
                    </Box>

                    {/* Table */}
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'grey.100' }}>
                                    <TableCell>AWB Number</TableCell>
                                    <TableCell>Carrier</TableCell>
                                    <TableCell>Ruta</TableCell>
                                    <TableCell>Vuelo</TableCell>
                                    <TableCell align="right">Piezas</TableCell>
                                    <TableCell align="right">Peso (kg)</TableCell>
                                    <TableCell align="right">Pkgs S</TableCell>
                                    <TableCell align="right">CAJO</TableCell>
                                    <TableCell align="right">Costo Total</TableCell>
                                    <TableCell align="right">$/kg</TableCell>
                                    <TableCell align="center">Estado</TableCell>
                                    <TableCell align="center">Acciones</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {awbCostList.map((item) => (
                                    <TableRow
                                        key={item.id}
                                        hover
                                        sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#f0f7ff' } }}
                                        onClick={() => setAwbCostDialog({ open: true, id: item.id })}
                                    >
                                        <TableCell>
                                            <Typography variant="body2" fontWeight="bold" color="primary">
                                                {item.awb_number}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>{item.carrier || '-'}</TableCell>
                                        <TableCell>
                                            <Typography variant="body2">
                                                {item.origin_airport || '?'} → {item.destination_airport || '?'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>{item.flight_number || '-'}</TableCell>
                                        <TableCell align="right">{item.pieces || 0}</TableCell>
                                        <TableCell align="right">{Number(item.gross_weight_kg || 0).toFixed(1)}</TableCell>
                                        <TableCell align="right">
                                            <Chip size="small" label={item.packages_s_count || 0} color="primary" variant="outlined" />
                                        </TableCell>
                                        <TableCell align="right">
                                            <Chip size="small" label={item.packages_cajo_count || 0} color="warning" variant="outlined" />
                                        </TableCell>
                                        <TableCell align="right">
                                            <Typography fontWeight="bold">
                                                ${Number(item.calc_grand_total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            ${Number(item.calc_cost_per_kg || 0).toFixed(2)}
                                        </TableCell>
                                        <TableCell align="center">
                                            <Chip
                                                size="small"
                                                icon={item.is_fully_costed ? <CheckIcon /> : <WarningIcon />}
                                                label={item.is_fully_costed ? 'Costeado' : 'Pendiente'}
                                                color={item.is_fully_costed ? 'success' : 'warning'}
                                                variant="outlined"
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Tooltip title="Abrir modal de costeo">
                                                <IconButton
                                                    size="small"
                                                    color="primary"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setAwbCostDialog({ open: true, id: item.id });
                                                    }}
                                                >
                                                    <OpenCostIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {awbCostList.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={12} align="center" sx={{ py: 6 }}>
                                            <FlightIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                                            <Typography color="text.secondary">
                                                No hay líneas de costeo AWB registradas.
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                Las líneas se crean automáticamente al aprobar borradores en Correos Entrantes Aéreo.
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            )}

            {/* AWB Costing Dialog (modal estilo marítimo) */}
            <AwbCostingDialog
                open={awbCostDialog.open}
                onClose={() => setAwbCostDialog({ open: false, id: null })}
                awbCostId={awbCostDialog.id}
                onSaved={() => {
                    loadAwbCostList();
                    loadStats();
                }}
            />
        </Box>
    );
}
