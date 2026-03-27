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
    Tabs,
    Tab,
    Tooltip,
} from '@mui/material';
import {
    Search as SearchIcon,
    Flight as FlightIcon,
    Refresh as RefreshIcon,
    CheckCircle as CheckIcon,
    Warning as WarningIcon,
    TrendingUp as TrendingUpIcon,
    Inventory as BoxIcon,
    Receipt as ReceiptIcon,
    OpenInNew as OpenCostIcon,
} from '@mui/icons-material';
import AwbCostingDialog from './AwbCostingDialog';

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
    client_name?: string;
    client_box_id?: string;
}

interface AwbCostListItem {
    id: number;
    awb_number: string;
    carrier: string | null;
    origin_airport: string | null;
    destination_airport: string | null;
    route_code: string | null;
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
    const [, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

    // Datos de la guía actual
    const [data,] = useState<MasterAwbData>({
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

    const [, setResults] = useState<CalculatedResults>({
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

    // Filtros Tab 1 - Guías Registradas
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [filterClient, setFilterClient] = useState('');

    // Modal de detalles de guía
    const [detailDialog, setDetailDialog] = useState<{
        open: boolean;
        guide: MasterAwbListItem | null;
        packages: any[];
        loading: boolean;
    }>({ open: false, guide: null, packages: [], loading: false });

    const token = localStorage.getItem('token');
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

    // Función para cargar detalles de la guía y sus paquetes hijos
    const loadGuideDetails = async (guide: MasterAwbListItem) => {
        setDetailDialog({ open: true, guide, packages: [], loading: true });
        try {
            const res = await fetch(`${API_URL}/api/master-cost/china-receipts/${guide.id}/packages`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const json = await res.json();
                setDetailDialog(prev => ({ ...prev, packages: json.data || [], loading: false }));
            } else {
                setDetailDialog(prev => ({ ...prev, loading: false }));
            }
        } catch (err) {
            console.error('Error loading packages:', err);
            setDetailDialog(prev => ({ ...prev, loading: false }));
        }
    };

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
            // Construir query params con filtros
            const params = new URLSearchParams({ limit: '200' });
            if (filterDateFrom) params.append('dateFrom', filterDateFrom);
            if (filterDateTo) params.append('dateTo', filterDateTo);
            if (filterClient) params.append('client', filterClient);
            
            // Cargar guías de china_receipts (TDI Aéreo China)
            const res = await fetch(`${API_URL}/api/master-cost/china-receipts?${params.toString()}`, {
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
    }, [token, filterDateFrom, filterDateTo, filterClient]);

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
                    <Tab
                        icon={<ReceiptIcon />}
                        label={`Costeo AWB (${awbCostList.length})`}
                    />
                    <Tab icon={<BoxIcon />} label={t('costing.tabs.registered')} />
                    <Tab icon={<TrendingUpIcon />} label={t('costing.tabs.profit')} />
                </Tabs>
            </Box>

            {/* TAB 1: GUÍAS REGISTRADAS */}
            {tabValue === 1 && (
                <Box>
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6">{t('costing.registeredGuides')}</Typography>
                        <Button startIcon={<RefreshIcon />} onClick={loadMasterList}>
                            {t('costing.refresh')}
                        </Button>
                    </Box>

                    {/* Filtros */}
                    <Paper sx={{ p: 2, mb: 2 }}>
                        <Grid container spacing={2} alignItems="center">
                            <Grid size={{ xs: 12, sm: 3 }}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Fecha Desde"
                                    type="date"
                                    value={filterDateFrom}
                                    onChange={(e) => setFilterDateFrom(e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 3 }}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Fecha Hasta"
                                    type="date"
                                    value={filterDateTo}
                                    onChange={(e) => setFilterDateTo(e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 3 }}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="# Cliente / Marca"
                                    placeholder="Ej: S-123, MARCA..."
                                    value={filterClient}
                                    onChange={(e) => setFilterClient(e.target.value)}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 3 }}>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Button
                                        variant="contained"
                                        onClick={loadMasterList}
                                        startIcon={<SearchIcon />}
                                    >
                                        Buscar
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        onClick={() => {
                                            setFilterDateFrom('');
                                            setFilterDateTo('');
                                            setFilterClient('');
                                        }}
                                    >
                                        Limpiar
                                    </Button>
                                </Box>
                            </Grid>
                        </Grid>
                    </Paper>

                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'grey.100' }}>
                                    <TableCell>{t('costing.guideAwb')}</TableCell>
                                    <TableCell>Cliente</TableCell>
                                    <TableCell>{t('costing.date')}</TableCell>
                                    <TableCell align="right">{t('costing.boxes')}</TableCell>
                                    <TableCell align="right">{t('costing.weight')} (kg)</TableCell>
                                    <TableCell align="right">{t('costing.grandTotal')} (USD)</TableCell>
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
                                            <Tooltip title="Ver Detalles">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => loadGuideDetails(item)}
                                                >
                                                    <SearchIcon fontSize="small" />
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

                    {/* Totales del reporte */}
                    {profitReport.length > 0 && (
                        <Grid container spacing={2} sx={{ mb: 2 }}>
                            <Grid size={{ xs: 6, sm: 3 }}>
                                <Card sx={{ bgcolor: '#E3F2FD' }}>
                                    <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                                        <Typography variant="h5" fontWeight="bold" color="primary">
                                            {profitReport.length}
                                        </Typography>
                                        <Typography variant="caption">Guías</Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid size={{ xs: 6, sm: 3 }}>
                                <Card sx={{ bgcolor: '#FFF3E0' }}>
                                    <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                                        <Typography variant="h6" fontWeight="bold" color="warning.main">
                                            ${profitReport.reduce((acc, r) => acc + Number(r.costo_total_operativo || 0), 0).toLocaleString()}
                                        </Typography>
                                        <Typography variant="caption">Costo Total</Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid size={{ xs: 6, sm: 3 }}>
                                <Card sx={{ bgcolor: '#E8F5E9' }}>
                                    <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                                        <Typography variant="h6" fontWeight="bold" color="success.main">
                                            ${profitReport.reduce((acc, r) => acc + Number(r.venta_total || 0), 0).toLocaleString()}
                                        </Typography>
                                        <Typography variant="caption">Venta Total</Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid size={{ xs: 6, sm: 3 }}>
                                <Card sx={{ bgcolor: '#F3E5F5' }}>
                                    <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                                        <Typography variant="h6" fontWeight="bold" color={profitReport.reduce((acc, r) => acc + Number(r.utilidad_mxn || 0), 0) >= 0 ? 'success.main' : 'error.main'}>
                                            ${profitReport.reduce((acc, r) => acc + Number(r.utilidad_mxn || 0), 0).toLocaleString()}
                                        </Typography>
                                        <Typography variant="caption">Utilidad Total</Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    )}

                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'grey.100' }}>
                                    <TableCell>{t('costing.guideAwb')}</TableCell>
                                    <TableCell>Cliente</TableCell>
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
                                        <TableCell>
                                            <Typography variant="body2">{item.client_name || '-'}</Typography>
                                            <Typography variant="caption" color="primary">{item.client_box_id}</Typography>
                                        </TableCell>
                                        <TableCell>{item.creation_date ? new Date(item.creation_date).toLocaleDateString() : '-'}</TableCell>
                                        <TableCell align="right">{item.total_boxes}</TableCell>
                                        <TableCell align="right">{Number(item.total_weight_kg || 0).toFixed(2)}</TableCell>
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
                                        <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
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

            {/* Dialog de detalles de guía */}
            <Dialog 
                open={detailDialog.open} 
                onClose={() => setDetailDialog({ open: false, guide: null, packages: [], loading: false })}
                maxWidth="lg"
                fullWidth
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        📦 Detalles de Guía: {detailDialog.guide?.master_awb_number}
                        <Typography variant="body2" color="text.secondary">
                            {detailDialog.guide?.client_name || '-'} • {detailDialog.guide?.client_box_id}
                        </Typography>
                    </Box>
                    <IconButton onClick={() => setDetailDialog({ open: false, guide: null, packages: [], loading: false })}>
                        ✕
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {/* Resumen de la guía */}
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid size={{ xs: 6, sm: 3 }}>
                            <Card sx={{ bgcolor: '#E3F2FD' }}>
                                <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                                    <Typography variant="h5" fontWeight="bold" color="primary">
                                        {detailDialog.guide?.total_boxes || 0}
                                    </Typography>
                                    <Typography variant="caption">Cajas</Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        <Grid size={{ xs: 6, sm: 3 }}>
                            <Card sx={{ bgcolor: '#E8F5E9' }}>
                                <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                                    <Typography variant="h5" fontWeight="bold" color="success.main">
                                        {Number(detailDialog.guide?.total_weight_kg || 0).toFixed(2)} kg
                                    </Typography>
                                    <Typography variant="caption">Peso Total</Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        <Grid size={{ xs: 6, sm: 3 }}>
                            <Card sx={{ bgcolor: '#FFF3E0' }}>
                                <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                                    <Typography variant="h5" fontWeight="bold" color="warning.main">
                                        ${Number(detailDialog.guide?.calc_grand_total || 0).toFixed(2)}
                                    </Typography>
                                    <Typography variant="caption">Costo Total</Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        <Grid size={{ xs: 6, sm: 3 }}>
                            <Card sx={{ bgcolor: '#F3E5F5' }}>
                                <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                                    <Typography variant="h5" fontWeight="bold" color="secondary">
                                        {detailDialog.packages.length}
                                    </Typography>
                                    <Typography variant="caption">Guías Hijas</Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>

                    {/* Tabla de guías hijas */}
                    <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                        📋 Guías Hijas (Paquetes)
                    </Typography>
                    
                    {detailDialog.loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                            <Table size="small" stickyHeader>
                                <TableHead>
                                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                                        <TableCell>#</TableCell>
                                        <TableCell>AIR Tracking</TableCell>
                                        <TableCell>Cliente</TableCell>
                                        <TableCell align="right">Peso (kg)</TableCell>
                                        <TableCell align="right">Precio Venta</TableCell>
                                        <TableCell>Estado</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {detailDialog.packages.map((pkg, idx) => (
                                        <TableRow key={pkg.id} hover>
                                            <TableCell>{idx + 1}</TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="bold" color="primary">
                                                    {pkg.air_tracking || pkg.tracking_internal}
                                                </Typography>
                                                {pkg.child_no && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        Caja #{pkg.child_no}
                                                    </Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">{pkg.client_name || '-'}</Typography>
                                                <Typography variant="caption" color="primary">{pkg.box_id}</Typography>
                                            </TableCell>
                                            <TableCell align="right">{Number(pkg.weight || 0).toFixed(2)}</TableCell>
                                            <TableCell align="right">
                                                <Typography 
                                                    variant="body2" 
                                                    fontWeight="bold"
                                                    color={Number(pkg.air_sale_price || pkg.assigned_cost_mxn || 0) > 0 ? 'success.main' : 'text.secondary'}
                                                >
                                                    ${Number(pkg.air_sale_price || pkg.assigned_cost_mxn || 0).toFixed(2)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip 
                                                    size="small" 
                                                    label={pkg.status || 'pending'} 
                                                    color={pkg.status === 'delivered' ? 'success' : 'default'}
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {detailDialog.packages.length === 0 && !detailDialog.loading && (
                                        <TableRow>
                                            <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                                <Typography color="text.secondary">
                                                    No hay guías hijas registradas
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDetailDialog({ open: false, guide: null, packages: [], loading: false })}>
                        Cerrar
                    </Button>
                </DialogActions>
            </Dialog>

            {/* TAB 0: COSTEO AWB (estilo marítimo) */}
            {tabValue === 0 && (
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
                                    <TableCell>Aeropuerto</TableCell>
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
                                        <TableCell>
                                            <Chip size="small" label={item.route_code || 'N/A'} color="error" sx={{ fontWeight: 'bold' }} />
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
