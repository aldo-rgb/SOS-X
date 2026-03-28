// ============================================
// MODAL DE COSTEO AWB (estilo marítimo)
// Dialog con 6 tabs: Datos AWB, Origen, Liberación, Logística, Documentos, Utilidades
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Typography,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Grid,
    Tabs,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    Divider,
    Alert,
    CircularProgress,
    Card,
    CardContent,
    IconButton,
    InputAdornment,
    LinearProgress,
} from '@mui/material';
import {
    Flight as FlightIcon,
    LocalShipping as ShippingIcon,
    Gavel as GavelIcon,
    LocalAtm as CostIcon,
    Description as DocIcon,
    TrendingUp as ProfitIcon,
    Save as SaveIcon,
    Close as CloseIcon,
    AttachFile as AttachIcon,
    CheckCircle as CheckIcon,
    Warning as WarningIcon,
    Inventory as BoxIcon,
    PictureAsPdf as PdfIcon,
    OpenInNew as OpenIcon,
    ArrowUpward as UpIcon,
    ArrowDownward as DownIcon,
    CloudUpload as UploadIcon,
    Delete as DeleteIcon,
} from '@mui/icons-material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ===== Interfaces =====
interface AwbCostData {
    id: number;
    awb_number: string;
    awb_draft_id: number | null;
    shipper_name: string | null;
    consignee: string | null;
    carrier: string | null;
    origin_airport: string | null;
    destination_airport: string | null;
    route_code: string | null;
    flight_number: string | null;
    flight_date: string | null;
    pieces: number | null;
    gross_weight_kg: number | null;
    total_cost_amount: number | null;
    total_cost_currency: string | null;
    freight_cost: number;
    freight_cost_pdf: string | null;
    origin_handling: number;
    origin_handling_pdf: string | null;
    customs_clearance: number;
    customs_clearance_pdf: string | null;
    custody_fee: number;
    custody_fee_pdf: string | null;
    aa_expenses: number;
    aa_expenses_pdf: string | null;
    storage_fee: number;
    storage_fee_pdf: string | null;
    transport_cost: number;
    transport_cost_pdf: string | null;
    other_cost: number;
    other_cost_pdf: string | null;
    other_cost_description: string | null;
    awb_pdf_url: string | null;
    packing_list_url: string | null;
    calc_total_origin: number;
    calc_total_release: number;
    calc_total_logistics: number;
    calc_grand_total: number;
    calc_cost_per_kg: number;
    is_fully_costed: boolean;
    status: string;
    notes: string | null;
    total_packages_s: number;
    total_packages_cajo: number;
    created_at: string;
    updated_at: string;
}

interface PackageS {
    id: number;
    tracking_internal: string;
    weight: number | null;
    description: string | null;
    user_id: number | null;
    assigned_cost_mxn: number | null;
    status: string | null;
    child_no: string | null;
    international_tracking: string | null;
    air_sale_price: number | null;
    air_price_per_kg: number | null;
    air_tariff_type: string | null;
    cajo_tariff_type: string | null;
    user_box_id: string | null;
    user_name: string | null;
}

interface CajoGuide {
    id: number;
    guia_air: string | null;
    cliente: string | null;
    no_caja: string | null;
    peso_kg: number | null;
    tipo: string | null;
    status: string | null;
    mawb: string | null;
}

interface ProfitData {
    totalCost: number;
    totalRevenue: number;
    totalRevenueUSD: number;
    totalRevenueMXN: number;
    exchangeRate: number;
    weightS: number;
    profit: number;
    margin: string;
    packagesS: number;
    breakdown: {
        origin: number;
        release: number;
        custodyAndRelease: number;
        logistics: number;
    };
}

interface AwbCostingDialogProps {
    open: boolean;
    onClose: () => void;
    awbCostId: number | null;
    onSaved?: () => void;
}

// ===== Helper: format currency =====
const fmt = (val: number | null | undefined): string => {
    const n = Number(val) || 0;
    return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
};
const fmtUSD = (val: number | null | undefined): string => {
    const n = Number(val) || 0;
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
};

// ===== Component =====
export default function AwbCostingDialog({ open, onClose, awbCostId, onSaved }: AwbCostingDialogProps) {
    const [tabValue, setTabValue] = useState(0);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

    // Data
    const [cost, setCost] = useState<AwbCostData | null>(null);
    const [packagesS, setPackagesS] = useState<PackageS[]>([]);
    const [cajoGuides, setCajoGuides] = useState<CajoGuide[]>([]);
    const [profitData, setProfitData] = useState<ProfitData | null>(null);
    
    // Cálculo automático de gastos de liberación
    const [releaseCalc, setReleaseCalc] = useState<{
        peso_s: number;
        peso_s_logo: number;
        peso_s_generico: number;
        peso_cajo: number;
        peso_total: number;
        tipo_predominante: string;
        tarifa_proveedor_per_kg: number;
        overfee_cajo_per_kg: number;
        gastos_liberacion_s: number;
        gastos_liberacion_cajo: number;
        gastos_liberacion_total: number;
        count_packages_s: number;
        count_cajo_guides: number;
    } | null>(null);
    const [loadingRelease, setLoadingRelease] = useState(false);

    // Otros gastos múltiples
    interface OtherCostItem {
        id?: number;
        description: string;
        amount: number;
    }
    const [otherCostsList, setOtherCostsList] = useState<OtherCostItem[]>([]);

    // Form fields (editable costs)
    const [form, setForm] = useState({
        origin_cost_per_kg: 0,  // Nuevo campo simplificado para costo por kg en origen
        freight_cost: 0,       // Legacy, se calcula automáticamente
        freight_cost_pdf: '',
        origin_handling: 0,    // Legacy, ya no se usa
        origin_handling_pdf: '',
        customs_clearance: 0,
        customs_clearance_pdf: '',
        custody_fee: 0,
        custody_fee_pdf: '',
        aa_expenses: 0,
        aa_expenses_pdf: '',
        storage_fee: 0,
        storage_fee_pdf: '',
        transport_cost: 0,
        transport_cost_pdf: '',
        other_cost: 0,
        other_cost_pdf: '',
        other_cost_description: '',
        notes: '',
        gross_weight_kg: 0,
    });

    // ===== Calculated totals (live) =====
    // Gastos Origen = costo_por_kg * peso_bruto
    const calcTotalOrigin = (form.origin_cost_per_kg || 0) * (form.gross_weight_kg || 0);
    const calcTotalRelease = (form.customs_clearance || 0) + (form.custody_fee || 0) + (form.aa_expenses || 0) + (form.storage_fee || 0);
    // Incluir suma de otros gastos múltiples
    const totalOtherCosts = otherCostsList.reduce((sum, item) => sum + (item.amount || 0), 0);
    const calcTotalLogistics = (form.transport_cost || 0) + totalOtherCosts;
    const calcGrandTotal = calcTotalOrigin + calcTotalRelease + calcTotalLogistics;
    const calcCostPerKg = form.gross_weight_kg > 0 ? (calcGrandTotal / form.gross_weight_kg) : 0;
    const completionPercent = [
        form.origin_cost_per_kg > 0,
        form.customs_clearance > 0,
        form.gross_weight_kg > 0,
    ].filter(Boolean).length / 3 * 100;

    // ===== Token from localStorage =====
    const getToken = () => localStorage.getItem('token') || '';

    // ===== Load detail =====
    const loadDetail = useCallback(async () => {
        if (!awbCostId) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/awb-costs/${awbCostId}`, {
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            const data = await res.json();
            if (data.success) {
                const c = data.cost;
                setCost(c);
                setPackagesS(data.packagesS || []);
                setCajoGuides(data.cajoGuides || []);
                setForm({
                    origin_cost_per_kg: Number(c.origin_cost_per_kg) || 0,
                    freight_cost: Number(c.freight_cost) || 0,
                    freight_cost_pdf: c.freight_cost_pdf || '',
                    origin_handling: Number(c.origin_handling) || 0,
                    origin_handling_pdf: c.origin_handling_pdf || '',
                    customs_clearance: Number(c.customs_clearance) || 0,
                    customs_clearance_pdf: c.customs_clearance_pdf || '',
                    custody_fee: Number(c.custody_fee) || 0,
                    custody_fee_pdf: c.custody_fee_pdf || '',
                    aa_expenses: Number(c.aa_expenses) || 0,
                    aa_expenses_pdf: c.aa_expenses_pdf || '',
                    storage_fee: Number(c.storage_fee) || 0,
                    storage_fee_pdf: c.storage_fee_pdf || '',
                    transport_cost: Number(c.transport_cost) || 0,
                    transport_cost_pdf: c.transport_cost_pdf || '',
                    other_cost: Number(c.other_cost) || 0,
                    other_cost_pdf: c.other_cost_pdf || '',
                    other_cost_description: c.other_cost_description || '',
                    notes: c.notes || '',
                    gross_weight_kg: Number(c.gross_weight_kg) || 0,
                });
                // Cargar otros gastos múltiples
                if (data.otherCosts && data.otherCosts.length > 0) {
                    setOtherCostsList(data.otherCosts.map((oc: { id: number; description: string; amount: number }) => ({
                        id: oc.id,
                        description: oc.description,
                        amount: Number(oc.amount) || 0,
                    })));
                } else {
                    setOtherCostsList([]);
                }
            }
        } catch (err: unknown) {
            setMessage({ type: 'error', text: 'Error cargando detalle: ' + (err instanceof Error ? err.message : String(err)) });
        } finally {
            setLoading(false);
        }
    }, [awbCostId]);

    // ===== Load profit =====
    const loadProfit = useCallback(async () => {
        if (!awbCostId) return;
        try {
            const res = await fetch(`${API_URL}/api/awb-costs/${awbCostId}/profit`, {
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            const data = await res.json();
            if (data.success) setProfitData(data.profit);
        } catch (err) {
            console.error('Error loading profit:', err);
        }
    }, [awbCostId]);

    // ===== Load release costs calculation =====
    const loadReleaseCosts = useCallback(async () => {
        if (!awbCostId) return;
        setLoadingRelease(true);
        try {
            const res = await fetch(`${API_URL}/api/awb-costs/${awbCostId}/calc-release-costs`, {
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            const data = await res.json();
            if (data.success && data.calculation) {
                setReleaseCalc(data.calculation);
            }
        } catch (err) {
            console.error('Error loading release costs:', err);
        } finally {
            setLoadingRelease(false);
        }
    }, [awbCostId]);

    // ===== Effects =====
    useEffect(() => {
        if (open && awbCostId) {
            setTabValue(0);
            setMessage(null);
            loadDetail();
            loadReleaseCosts();
        }
    }, [open, awbCostId, loadDetail, loadReleaseCosts]);

    // Aplicar automáticamente el cálculo cuando releaseCalc cambia
    useEffect(() => {
        if (releaseCalc && releaseCalc.gastos_liberacion_total > 0) {
            setForm(prev => ({
                ...prev,
                customs_clearance: releaseCalc.gastos_liberacion_total,
            }));
        }
    }, [releaseCalc]);

    useEffect(() => {
        if (open && tabValue === 5) {
            loadProfit();
        }
    }, [open, tabValue, loadProfit]);

    // ===== Save =====
    const handleSave = async () => {
        if (!awbCostId) return;
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`${API_URL}/api/awb-costs/${awbCostId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${getToken()}`,
                },
                body: JSON.stringify({
                    ...form,
                    otherCosts: otherCostsList.filter(oc => oc.description && oc.amount > 0),
                }),
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: 'success', text: data.message || '✅ Costos guardados correctamente' });
                setCost(data.cost);
                onSaved?.();
            } else {
                setMessage({ type: 'error', text: data.error || 'Error guardando' });
            }
        } catch (err: unknown) {
            setMessage({ type: 'error', text: 'Error: ' + (err instanceof Error ? err.message : String(err)) });
        } finally {
            setSaving(false);
        }
    };

    // ===== Field updater =====
    const updateField = (field: string, value: number | string) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    if (!open) return null;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="lg"
            fullWidth
            PaperProps={{ sx: { minHeight: '80vh', maxHeight: '90vh' } }}
        >
            <DialogTitle sx={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                bgcolor: '#111', color: 'white', py: 1.5,
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FlightIcon />
                    <Typography variant="h6">
                        Costeo AWB: {cost?.awb_number || '...'}
                    </Typography>
                    {cost && (
                        <Chip
                            size="small"
                            icon={cost.is_fully_costed ? <CheckIcon /> : <WarningIcon />}
                            label={cost.is_fully_costed ? 'Costeado' : 'Pendiente'}
                            color={cost.is_fully_costed ? 'success' : 'warning'}
                            sx={{ ml: 1 }}
                        />
                    )}
                </Box>
                <IconButton onClick={onClose} sx={{ color: 'white' }}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent dividers sx={{ p: 0 }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <>
                        {/* Progress bar */}
                        <Box sx={{ px: 3, pt: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="caption" color="text.secondary">
                                    Progreso de costeo
                                </Typography>
                                <Typography variant="caption" fontWeight="bold">
                                    {Math.round(completionPercent)}%
                                </Typography>
                            </Box>
                            <LinearProgress
                                variant="determinate"
                                value={completionPercent}
                                sx={{ height: 6, borderRadius: 3 }}
                                color={completionPercent === 100 ? 'success' : 'primary'}
                            />
                        </Box>

                        {/* Message */}
                        {message && (
                            <Box sx={{ px: 3, pt: 1 }}>
                                <Alert severity={message.type} onClose={() => setMessage(null)}>
                                    {message.text}
                                </Alert>
                            </Box>
                        )}

                        {/* Totals summary strip */}
                        <Box sx={{ px: 3, py: 1.5, display: 'flex', gap: 2, flexWrap: 'wrap', bgcolor: '#f5f5f5', mt: 1 }}>
                            <Chip label={`Origen: ${fmt(calcTotalOrigin)}`} color="primary" variant="outlined" size="small" />
                            <Chip label={`Liberación: ${fmt(calcTotalRelease)}`} color="secondary" variant="outlined" size="small" />
                            <Chip label={`Logística: ${fmt(calcTotalLogistics)}`} color="info" variant="outlined" size="small" />
                            <Chip
                                label={`TOTAL: ${fmt(calcGrandTotal)}`}
                                color="success"
                                size="small"
                                sx={{ fontWeight: 'bold' }}
                            />
                            <Chip
                                label={`$/kg: $${calcCostPerKg.toFixed(2)}`}
                                color="warning"
                                size="small"
                            />
                        </Box>

                        {/* Tabs */}
                        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                            <Tabs
                                value={tabValue}
                                onChange={(_, v) => setTabValue(v)}
                                variant="scrollable"
                                scrollButtons="auto"
                            >
                                <Tab icon={<FlightIcon />} iconPosition="start" label="Datos AWB" sx={{ minHeight: 48 }} />
                                <Tab icon={<ShippingIcon />} iconPosition="start" label="Gastos Origen" sx={{ minHeight: 48 }} />
                                <Tab icon={<GavelIcon />} iconPosition="start" label="Liberación" sx={{ minHeight: 48 }} />
                                <Tab icon={<CostIcon />} iconPosition="start" label="Logística" sx={{ minHeight: 48 }} />
                                <Tab icon={<DocIcon />} iconPosition="start" label="Documentos" sx={{ minHeight: 48 }} />
                                <Tab icon={<ProfitIcon />} iconPosition="start" label="Utilidades" sx={{ minHeight: 48 }} />
                            </Tabs>
                        </Box>

                        {/* Tab content */}
                        <Box sx={{ p: 3 }}>

                            {/* ============ TAB 0: DATOS AWB ============ */}
                            {tabValue === 0 && cost && (
                                <Box>
                                    <Grid container spacing={3}>
                                        {/* Left: AWB Info */}
                                        <Grid size={{ xs: 12, md: 6 }}>
                                            <Card variant="outlined">
                                                <CardContent>
                                                    <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <FlightIcon fontSize="small" color="primary" /> Información del Air Waybill
                                                    </Typography>
                                                    <Grid container spacing={1.5}>
                                                        <Grid size={{ xs: 12 }}>
                                                            <TextField fullWidth label="AWB Number" value={cost.awb_number} disabled size="small" />
                                                        </Grid>
                                                        <Grid size={{ xs: 6 }}>
                                                            <TextField fullWidth label="Shipper" value={cost.shipper_name || '-'} disabled size="small" />
                                                        </Grid>
                                                        <Grid size={{ xs: 6 }}>
                                                            <TextField fullWidth label="Consignee" value={cost.consignee || '-'} disabled size="small" />
                                                        </Grid>
                                                        <Grid size={{ xs: 6 }}>
                                                            <TextField fullWidth label="Carrier" value={cost.carrier || '-'} disabled size="small" />
                                                        </Grid>
                                                        <Grid size={{ xs: 6 }}>
                                                            <TextField fullWidth label="Vuelo" value={cost.flight_number || '-'} disabled size="small" />
                                                        </Grid>
                                                        <Grid size={{ xs: 6 }}>
                                                            <TextField fullWidth label="Ruta" value={`${cost.origin_airport || '?'} → ${cost.destination_airport || '?'}`} disabled size="small" />
                                                        </Grid>
                                                        <Grid size={{ xs: 6 }}>
                                                            <TextField 
                                                                fullWidth 
                                                                label="Aeropuerto" 
                                                                value={cost.route_code || 'N/A'} 
                                                                disabled 
                                                                size="small"
                                                                InputProps={{
                                                                    sx: { fontWeight: 'bold', color: 'error.main' }
                                                                }}
                                                            />
                                                        </Grid>
                                                        <Grid size={{ xs: 4 }}>
                                                            <TextField fullWidth label="Fecha Vuelo" value={cost.flight_date ? new Date(cost.flight_date).toLocaleDateString() : '-'} disabled size="small" />
                                                        </Grid>
                                                        <Grid size={{ xs: 4 }}>
                                                            <TextField fullWidth label="Piezas" value={cost.pieces || 0} disabled size="small" />
                                                        </Grid>
                                                        <Grid size={{ xs: 4 }}>
                                                            <TextField
                                                                fullWidth
                                                                label="Peso Bruto (kg)"
                                                                type="number"
                                                                value={form.gross_weight_kg || ''}
                                                                onChange={(e) => updateField('gross_weight_kg', Number(e.target.value) || 0)}
                                                                size="small"
                                                                InputProps={{ endAdornment: <InputAdornment position="end">kg</InputAdornment> }}
                                                            />
                                                        </Grid>
                                                    </Grid>
                                                    {cost.total_cost_amount && (
                                                        <Box sx={{ mt: 1, p: 1, bgcolor: '#fff3e0', borderRadius: 1 }}>
                                                            <Typography variant="caption" color="text.secondary">
                                                                Costo declarado AWB: {cost.total_cost_currency} {Number(cost.total_cost_amount).toLocaleString()}
                                                            </Typography>
                                                        </Box>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        </Grid>

                                        {/* Right: Linked items */}
                                        <Grid size={{ xs: 12, md: 6 }}>
                                            {/* Packages S */}
                                            <Card variant="outlined" sx={{ mb: 2 }}>
                                                <CardContent>
                                                    <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                        <BoxIcon fontSize="small" color="primary" />
                                                        Paquetes Gestión Aérea (S) ({packagesS.length}) 
                                                        <Chip 
                                                            size="small" 
                                                            label={`${((packagesS.length / (packagesS.length + cajoGuides.length)) * 100 || 0).toFixed(0)}%`}
                                                            color="primary"
                                                            sx={{ ml: 1, fontSize: '0.7rem', height: 20 }}
                                                        />
                                                        <Chip 
                                                            size="small" 
                                                            label={`${packagesS.reduce((sum, p) => sum + (Number(p.weight) || 0), 0).toFixed(2)} kg`}
                                                            variant="outlined"
                                                            sx={{ fontSize: '0.7rem', height: 20 }}
                                                        />
                                                    </Typography>
                                                    {packagesS.length > 0 ? (
                                                        <TableContainer sx={{ maxHeight: 200 }}>
                                                            <Table size="small" stickyHeader>
                                                                <TableHead>
                                                                    <TableRow>
                                                                        <TableCell>Tracking</TableCell>
                                                                        <TableCell align="right">Peso</TableCell>
                                                                        <TableCell align="right">Costo Asignado</TableCell>
                                                                        <TableCell>Status</TableCell>
                                                                    </TableRow>
                                                                </TableHead>
                                                                <TableBody>
                                                                    {packagesS.map((pkg) => (
                                                                        <TableRow key={pkg.id}>
                                                                            <TableCell sx={{ fontSize: '0.75rem' }}>{pkg.tracking_internal}</TableCell>
                                                                            <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{pkg.weight ? `${pkg.weight} kg` : '-'}</TableCell>
                                                                            <TableCell align="right" sx={{ fontSize: '0.75rem' }}>
                                                                                {pkg.assigned_cost_mxn ? fmt(pkg.assigned_cost_mxn) : '-'}
                                                                            </TableCell>
                                                                            <TableCell>
                                                                                <Chip size="small" label={pkg.status || 'N/A'} variant="outlined" sx={{ fontSize: '0.65rem' }} />
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </TableContainer>
                                                    ) : (
                                                        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                                                            Sin paquetes S vinculados
                                                        </Typography>
                                                    )}
                                                </CardContent>
                                            </Card>

                                            {/* CAJO Guides */}
                                            <Card variant="outlined">
                                                <CardContent>
                                                    <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                        <BoxIcon fontSize="small" color="warning" />
                                                        Guías CAJO ({cajoGuides.length})
                                                        <Chip 
                                                            size="small" 
                                                            label={`${((cajoGuides.length / (packagesS.length + cajoGuides.length)) * 100 || 0).toFixed(0)}%`}
                                                            color="warning"
                                                            sx={{ ml: 1, fontSize: '0.7rem', height: 20 }}
                                                        />
                                                        <Chip 
                                                            size="small" 
                                                            label={`${cajoGuides.reduce((sum, g) => sum + (Number(g.peso_kg) || 0), 0).toFixed(2)} kg`}
                                                            variant="outlined"
                                                            sx={{ fontSize: '0.7rem', height: 20 }}
                                                        />
                                                    </Typography>
                                                    {cajoGuides.length > 0 ? (
                                                        <TableContainer sx={{ maxHeight: 200 }}>
                                                            <Table size="small" stickyHeader>
                                                                <TableHead>
                                                                    <TableRow>
                                                                        <TableCell>Guía Aérea</TableCell>
                                                                        <TableCell>Cliente</TableCell>
                                                                        <TableCell align="right">Peso</TableCell>
                                                                        <TableCell>Tipo</TableCell>
                                                                    </TableRow>
                                                                </TableHead>
                                                                <TableBody>
                                                                    {cajoGuides.map((g) => (
                                                                        <TableRow key={g.id}>
                                                                            <TableCell sx={{ fontSize: '0.75rem' }}>{g.guia_air || '-'}</TableCell>
                                                                            <TableCell sx={{ fontSize: '0.75rem' }}>{g.cliente || '-'}</TableCell>
                                                                            <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{g.peso_kg ? `${g.peso_kg} kg` : '-'}</TableCell>
                                                                            <TableCell>
                                                                                <Chip
                                                                                    size="small"
                                                                                    label={g.tipo || 'N/A'}
                                                                                    color={g.tipo === 'Logo' ? 'primary' : g.tipo === 'Medical' ? 'error' : 'default'}
                                                                                    variant="outlined"
                                                                                    sx={{ fontSize: '0.65rem' }}
                                                                                />
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </TableContainer>
                                                    ) : (
                                                        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                                                            Sin guías CAJO vinculadas
                                                        </Typography>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        </Grid>
                                    </Grid>

                                    {/* Notes */}
                                    <TextField
                                        fullWidth
                                        label="Notas"
                                        multiline
                                        rows={2}
                                        value={form.notes}
                                        onChange={(e) => updateField('notes', e.target.value)}
                                        size="small"
                                        sx={{ mt: 2 }}
                                    />
                                </Box>
                            )}

                            {/* ============ TAB 1: GASTOS EN ORIGEN ============ */}
                            {tabValue === 1 && (
                                <Box>
                                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <ShippingIcon color="primary" /> Gastos en Origen
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                        Costo por kilogramo del flete aéreo en origen (MXN)
                                    </Typography>

                                    {/* Peso de paquetes S */}
                                    <Card variant="outlined" sx={{ mb: 2, p: 2, bgcolor: '#f5f5f5' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <FlightIcon color="primary" />
                                                <Typography variant="subtitle2" color="text.secondary">Peso Paquetes S ({packagesS.length}):</Typography>
                                            </Box>
                                            <Typography variant="h5" fontWeight="bold" color="primary.main">
                                                {packagesS.length > 0 ? `${packagesS.reduce((sum, p) => sum + (Number(p.weight) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} kg` : '— Sin paquetes S'}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
                                            <Typography variant="caption" color="text.secondary">Peso Bruto Guía (AWB):</Typography>
                                            <Typography variant="caption" color="text.secondary">{form.gross_weight_kg > 0 ? `${form.gross_weight_kg.toLocaleString('en-US', { minimumFractionDigits: 2 })} kg` : '—'}</Typography>
                                        </Box>
                                    </Card>

                                    <Card variant="outlined" sx={{ p: 3 }}>
                                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                            <FlightIcon color="primary" />
                                            <TextField
                                                fullWidth
                                                label="Costo por KG (MXN)"
                                                type="number"
                                                value={form.origin_cost_per_kg || ''}
                                                onChange={(e) => updateField('origin_cost_per_kg', parseFloat(e.target.value) || 0)}
                                                InputProps={{
                                                    startAdornment: <Box sx={{ color: 'text.secondary', mr: 1 }}>$</Box>,
                                                    endAdornment: <Box sx={{ color: 'text.secondary', ml: 1 }}>MXN/kg</Box>,
                                                }}
                                                sx={{ maxWidth: 300 }}
                                            />
                                        </Box>
                                        
                                        {packagesS.length > 0 && (() => {
                                            const weightSLocal = packagesS.reduce((sum, p) => sum + (Number(p.weight) || 0), 0);
                                            const totalOriginCalc = (form.origin_cost_per_kg || 0) * weightSLocal;
                                            return (
                                                <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                                                    <Typography variant="body2" color="text.secondary">
                                                        ${(form.origin_cost_per_kg || 0).toFixed(2)} MXN/kg × {weightSLocal.toFixed(2)} kg (S) = <strong>{fmt(totalOriginCalc)}</strong>
                                                    </Typography>
                                                </Box>
                                            );
                                        })()}
                                    </Card>

                                    <Card sx={{ mt: 2, bgcolor: '#e3f2fd', p: 2 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Typography variant="subtitle1" fontWeight="bold">
                                                Total Gastos Origen:
                                            </Typography>
                                            <Typography variant="h5" fontWeight="bold" color="primary.main">
                                                {fmt(calcTotalOrigin)}
                                            </Typography>
                                        </Box>
                                    </Card>
                                </Box>
                            )}

                            {/* ============ TAB 2: GASTOS DE LIBERACIÓN ============ */}
                            {tabValue === 2 && (
                                <Box>
                                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <GavelIcon color="secondary" /> Gastos de Liberación
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                        Costos aduanales y de liberación en destino
                                    </Typography>

                                    {/* Despacho Aduanal - Cálculo Automático */}
                                    <Card variant="outlined" sx={{ mb: 3, p: 2 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                            <Typography variant="subtitle1" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <GavelIcon fontSize="small" color="secondary" /> Despacho Aduanal
                                            </Typography>
                                            {loadingRelease && <CircularProgress size={20} />}
                                        </Box>

                                        {releaseCalc ? (
                                            <Box>
                                                {/* Desglose del cálculo */}
                                                <Grid container spacing={2} sx={{ mb: 2 }}>
                                                    <Grid size={{ xs: 12, md: 6 }}>
                                                        <Card variant="outlined" sx={{ p: 1.5, bgcolor: 'primary.50' }}>
                                                            <Typography variant="subtitle2" fontWeight="bold" color="primary.main" gutterBottom>
                                                                📦 Paquetes S ({releaseCalc.count_packages_s})
                                                            </Typography>
                                                            <Typography variant="body2">
                                                                {releaseCalc.peso_s.toFixed(2)} kg × ${releaseCalc.tarifa_proveedor_per_kg.toFixed(2)}/kg
                                                            </Typography>
                                                            <Typography variant="body1" fontWeight="bold" color="primary.main">
                                                                = ${releaseCalc.gastos_liberacion_s.toLocaleString('en-US', { minimumFractionDigits: 2 })} MXN
                                                            </Typography>
                                                        </Card>
                                                    </Grid>
                                                    <Grid size={{ xs: 12, md: 6 }}>
                                                        <Card variant="outlined" sx={{ p: 1.5, bgcolor: 'warning.50' }}>
                                                            <Typography variant="subtitle2" fontWeight="bold" color="warning.main" gutterBottom>
                                                                📦 Guías CAJO ({releaseCalc.count_cajo_guides})
                                                            </Typography>
                                                            <Typography variant="body2">
                                                                {releaseCalc.peso_cajo.toFixed(2)} kg × ${(releaseCalc.tarifa_proveedor_per_kg + releaseCalc.overfee_cajo_per_kg).toFixed(2)}/kg
                                                            </Typography>
                                                            <Typography variant="body1" fontWeight="bold" color="warning.main">
                                                                = ${releaseCalc.gastos_liberacion_cajo.toLocaleString('en-US', { minimumFractionDigits: 2 })} MXN
                                                            </Typography>
                                                        </Card>
                                                    </Grid>
                                                </Grid>

                                                {/* Total calculado - Se aplica automáticamente */}
                                                <Card sx={{ p: 2, bgcolor: '#e8f5e9' }}>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <Box>
                                                            <Typography variant="body2" color="text.secondary">
                                                                Cálculo automático (tarifas proveedor) - Aplicado ✓
                                                            </Typography>
                                                            <Typography variant="h5" fontWeight="bold" color="success.main">
                                                                ${releaseCalc.gastos_liberacion_total.toLocaleString('en-US', { minimumFractionDigits: 2 })} MXN
                                                            </Typography>
                                                        </Box>
                                                        <Chip label="Auto" color="success" size="small" />
                                                    </Box>
                                                </Card>
                                            </Box>
                                        ) : (
                                            <Box>
                                                <Alert severity="info" sx={{ mb: 2 }}>
                                                    No hay paquetes vinculados para calcular automáticamente.
                                                </Alert>
                                                <TextField
                                                    fullWidth
                                                    label="Despacho Aduanal"
                                                    type="number"
                                                    value={form.customs_clearance || ''}
                                                    onChange={(e) => updateField('customs_clearance', parseFloat(e.target.value) || 0)}
                                                    InputProps={{
                                                        startAdornment: <Box sx={{ color: 'text.secondary', mr: 1 }}>$</Box>,
                                                    }}
                                                    size="small"
                                                />
                                            </Box>
                                        )}
                                    </Card>

                                    {/* Otros gastos - Captura manual sin botones PDF */}
                                    <Card variant="outlined" sx={{ p: 2 }}>
                                        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                                            Otros gastos (captura manual)
                                        </Typography>
                                        <Grid container spacing={2}>
                                            <Grid size={{ xs: 12, sm: 4 }}>
                                                <TextField
                                                    fullWidth
                                                    label="Custodia"
                                                    type="number"
                                                    value={form.custody_fee || ''}
                                                    onChange={(e) => updateField('custody_fee', parseFloat(e.target.value) || 0)}
                                                    InputProps={{
                                                        startAdornment: <Box sx={{ color: 'text.secondary', mr: 1 }}>$</Box>,
                                                    }}
                                                    size="small"
                                                />
                                            </Grid>
                                            <Grid size={{ xs: 12, sm: 4 }}>
                                                <TextField
                                                    fullWidth
                                                    label="Gastos AA"
                                                    type="number"
                                                    value={form.aa_expenses || ''}
                                                    onChange={(e) => updateField('aa_expenses', parseFloat(e.target.value) || 0)}
                                                    InputProps={{
                                                        startAdornment: <Box sx={{ color: 'text.secondary', mr: 1 }}>$</Box>,
                                                    }}
                                                    size="small"
                                                />
                                            </Grid>
                                            <Grid size={{ xs: 12, sm: 4 }}>
                                                <TextField
                                                    fullWidth
                                                    label="Almacenaje"
                                                    type="number"
                                                    value={form.storage_fee || ''}
                                                    onChange={(e) => updateField('storage_fee', parseFloat(e.target.value) || 0)}
                                                    InputProps={{
                                                        startAdornment: <Box sx={{ color: 'text.secondary', mr: 1 }}>$</Box>,
                                                    }}
                                                    size="small"
                                                />
                                            </Grid>
                                        </Grid>

                                        {/* Subtotal Custodia y Liberación */}
                                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 2, mt: 2, borderTop: '1px solid #eee' }}>
                                            <Typography variant="body2" fontWeight="bold">
                                                Subtotal Custodia y Liberación: {fmt((form.custody_fee || 0) + (form.aa_expenses || 0) + (form.storage_fee || 0))}
                                            </Typography>
                                        </Box>
                                    </Card>

                                    <Card sx={{ mt: 2, bgcolor: '#f3e5f5', p: 2 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Typography variant="subtitle1" fontWeight="bold">
                                                Total Gastos Liberación:
                                            </Typography>
                                            <Typography variant="h5" fontWeight="bold" color="secondary.main">
                                                {fmt(calcTotalRelease)}
                                            </Typography>
                                        </Box>
                                    </Card>
                                </Box>
                            )}

                            {/* ============ TAB 3: GASTOS LOGÍSTICOS ============ */}
                            {tabValue === 3 && (
                                <Box>
                                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <CostIcon color="info" /> Gastos Logísticos
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                        Transporte terrestre y otros gastos operativos
                                    </Typography>

                                    {/* Transporte Terrestre */}
                                    <Card variant="outlined" sx={{ p: 2, mb: 2 }}>
                                        <TextField
                                            fullWidth
                                            label="Transporte Terrestre"
                                            type="number"
                                            value={form.transport_cost || ''}
                                            onChange={(e) => updateField('transport_cost', parseFloat(e.target.value) || 0)}
                                            InputProps={{
                                                startAdornment: <Box sx={{ color: 'text.secondary', mr: 1 }}>$</Box>,
                                            }}
                                            size="small"
                                        />
                                    </Card>

                                    {/* Otros Gastos Múltiples */}
                                    <Card variant="outlined" sx={{ p: 2, mb: 2 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                            <Typography variant="subtitle2" fontWeight="bold">
                                                Otros Gastos
                                            </Typography>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                startIcon={<UploadIcon />}
                                                onClick={() => setOtherCostsList([...otherCostsList, { description: '', amount: 0 }])}
                                            >
                                                Agregar Gasto
                                            </Button>
                                        </Box>

                                        {otherCostsList.length === 0 ? (
                                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                                                No hay otros gastos. Haz clic en "Agregar Gasto" para añadir uno.
                                            </Typography>
                                        ) : (
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                {otherCostsList.map((item, index) => (
                                                    <Box key={index} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                                                        <TextField
                                                            label="Descripción"
                                                            value={item.description}
                                                            onChange={(e) => {
                                                                const newList = [...otherCostsList];
                                                                newList[index].description = e.target.value;
                                                                setOtherCostsList(newList);
                                                            }}
                                                            size="small"
                                                            sx={{ flex: 2 }}
                                                        />
                                                        <TextField
                                                            label="Monto"
                                                            type="number"
                                                            value={item.amount || ''}
                                                            onChange={(e) => {
                                                                const newList = [...otherCostsList];
                                                                newList[index].amount = parseFloat(e.target.value) || 0;
                                                                setOtherCostsList(newList);
                                                            }}
                                                            InputProps={{
                                                                startAdornment: <Box sx={{ color: 'text.secondary', mr: 1 }}>$</Box>,
                                                            }}
                                                            size="small"
                                                            sx={{ flex: 1 }}
                                                        />
                                                        <IconButton
                                                            color="error"
                                                            onClick={() => {
                                                                const newList = otherCostsList.filter((_, i) => i !== index);
                                                                setOtherCostsList(newList);
                                                            }}
                                                            size="small"
                                                        >
                                                            <DeleteIcon />
                                                        </IconButton>
                                                    </Box>
                                                ))}
                                                {otherCostsList.length > 0 && (
                                                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1, borderTop: '1px solid #eee' }}>
                                                        <Typography variant="body2" fontWeight="bold">
                                                            Subtotal Otros: {fmt(totalOtherCosts)}
                                                        </Typography>
                                                    </Box>
                                                )}
                                            </Box>
                                        )}
                                    </Card>

                                    <Card sx={{ mt: 2, bgcolor: '#e0f7fa', p: 2 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Typography variant="subtitle1" fontWeight="bold">
                                                Total Gastos Logísticos:
                                            </Typography>
                                            <Typography variant="h5" fontWeight="bold" color="info.main">
                                                {fmt(calcTotalLogistics)}
                                            </Typography>
                                        </Box>
                                    </Card>
                                </Box>
                            )}

                            {/* ============ TAB 4: DOCUMENTOS ============ */}
                            {tabValue === 4 && (
                                <Box>
                                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <DocIcon color="action" /> Documentos
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                        Air Waybill PDF y Packing List del embarque
                                    </Typography>

                                    <Grid container spacing={2}>
                                        {/* AWB PDF */}
                                        <Grid size={{ xs: 12, md: 6 }}>
                                            <Card variant="outlined" sx={{ height: '100%' }}>
                                                <CardContent>
                                                    <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <PdfIcon color="error" /> Air Waybill (PDF)
                                                    </Typography>
                                                    {cost?.awb_pdf_url ? (
                                                        <Box>
                                                            <Button
                                                                variant="contained"
                                                                startIcon={<OpenIcon />}
                                                                onClick={() => { const url = cost.awb_pdf_url!; window.open(url.startsWith('http') ? url : `${API_URL}${url}`, '_blank'); }}
                                                                fullWidth
                                                                sx={{ mb: 1 }}
                                                            >
                                                                Ver AWB PDF
                                                            </Button>
                                                        </Box>
                                                    ) : (
                                                        <Box sx={{ py: 4, textAlign: 'center' }}>
                                                            <AttachIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
                                                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                                                Sin documento AWB
                                                            </Typography>
                                                        </Box>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        </Grid>

                                        {/* Packing List */}
                                        <Grid size={{ xs: 12, md: 6 }}>
                                            <Card variant="outlined" sx={{ height: '100%' }}>
                                                <CardContent>
                                                    <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <DocIcon color="primary" /> Packing List (Excel)
                                                    </Typography>
                                                    {cost?.packing_list_url ? (
                                                        <Box>
                                                            <Button
                                                                variant="contained"
                                                                color="success"
                                                                startIcon={<OpenIcon />}
                                                                onClick={() => { const url = cost.packing_list_url!; window.open(url.startsWith('http') ? url : `${API_URL}${url}`, '_blank'); }}
                                                                fullWidth
                                                                sx={{ mb: 1 }}
                                                            >
                                                                Descargar Packing List
                                                            </Button>
                                                        </Box>
                                                    ) : (
                                                        <Box sx={{ py: 4, textAlign: 'center' }}>
                                                            <AttachIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
                                                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                                                Sin Packing List
                                                            </Typography>
                                                        </Box>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        </Grid>
                                    </Grid>


                                </Box>
                            )}

                            {/* ============ TAB 5: UTILIDADES ============ */}
                            {tabValue === 5 && (
                                <Box>
                                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <ProfitIcon color="success" /> Utilidades y Rentabilidad
                                    </Typography>

                                    {/* Desglose de Cajas */}
                                    <Card variant="outlined" sx={{ mb: 3, bgcolor: '#fafafa' }}>
                                        <CardContent sx={{ py: 2 }}>
                                            <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                📦 Composición del AWB
                                            </Typography>
                                            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mt: 1 }}>
                                                {/* Paquetes S */}
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                    <Box sx={{ 
                                                        width: 40, height: 40, borderRadius: 2, 
                                                        bgcolor: 'primary.main', color: 'white',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontWeight: 'bold', fontSize: 18
                                                    }}>
                                                        S
                                                    </Box>
                                                    <Box>
                                                        <Typography variant="h5" fontWeight="bold" color="primary.main">
                                                            {packagesS.length}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            Gestión Aérea
                                                        </Typography>
                                                    </Box>
                                                    <Chip 
                                                        size="small" 
                                                        label={`${((packagesS.length / (packagesS.length + cajoGuides.length)) * 100 || 0).toFixed(0)}%`}
                                                        color="primary"
                                                        sx={{ fontWeight: 'bold' }}
                                                    />
                                                    <Chip 
                                                        size="small" 
                                                        variant="outlined"
                                                        label={`${packagesS.reduce((sum, p) => sum + (Number(p.weight) || 0), 0).toFixed(2)} kg`}
                                                    />
                                                    {profitData && (() => {
                                                        const total = packagesS.length + cajoGuides.length;
                                                        const pctS = total > 0 ? packagesS.length / total : 0;
                                                        const sharedCost = (profitData.breakdown.custodyAndRelease || 0) + profitData.breakdown.logistics;
                                                        return (
                                                            <Chip 
                                                                size="small" 
                                                                label={`Pago: ${fmt(pctS * sharedCost)}`}
                                                                sx={{ fontWeight: 'bold', bgcolor: '#e3f2fd', color: 'primary.main' }}
                                                            />
                                                        );
                                                    })()}
                                                </Box>

                                                {/* Separador */}
                                                <Divider orientation="vertical" flexItem />

                                                {/* Guías CAJO */}
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                    <Box sx={{ 
                                                        width: 40, height: 40, borderRadius: 2, 
                                                        bgcolor: 'warning.main', color: 'white',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontWeight: 'bold', fontSize: 14
                                                    }}>
                                                        CAJO
                                                    </Box>
                                                    <Box>
                                                        <Typography variant="h5" fontWeight="bold" color="warning.main">
                                                            {cajoGuides.length}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            Guías CAJO
                                                        </Typography>
                                                    </Box>
                                                    <Chip 
                                                        size="small" 
                                                        label={`${((cajoGuides.length / (packagesS.length + cajoGuides.length)) * 100 || 0).toFixed(0)}%`}
                                                        color="warning"
                                                        sx={{ fontWeight: 'bold' }}
                                                    />
                                                    <Chip 
                                                        size="small" 
                                                        variant="outlined"
                                                        label={`${cajoGuides.reduce((sum, g) => sum + (Number(g.peso_kg) || 0), 0).toFixed(2)} kg`}
                                                    />
                                                    {profitData && (() => {
                                                        const total = packagesS.length + cajoGuides.length;
                                                        const pctCajo = total > 0 ? cajoGuides.length / total : 0;
                                                        const sharedCost = (profitData.breakdown.custodyAndRelease || 0) + profitData.breakdown.logistics;
                                                        return (
                                                            <Chip 
                                                                size="small" 
                                                                label={`Pago: ${fmt(pctCajo * sharedCost)}`}
                                                                sx={{ fontWeight: 'bold', bgcolor: '#fff3e0', color: 'warning.dark' }}
                                                            />
                                                        );
                                                    })()}
                                                </Box>

                                                {/* Separador */}
                                                <Divider orientation="vertical" flexItem />

                                                {/* Total */}
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                    <Box sx={{ 
                                                        width: 40, height: 40, borderRadius: 2, 
                                                        bgcolor: 'grey.700', color: 'white',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontWeight: 'bold', fontSize: 16
                                                    }}>
                                                        Σ
                                                    </Box>
                                                    <Box>
                                                        <Typography variant="h5" fontWeight="bold">
                                                            {packagesS.length + cajoGuides.length}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            Total Cajas
                                                        </Typography>
                                                    </Box>
                                                    <Chip 
                                                        size="small" 
                                                        variant="outlined"
                                                        label={`${(packagesS.reduce((sum, p) => sum + (Number(p.weight) || 0), 0) + cajoGuides.reduce((sum, g) => sum + (Number(g.peso_kg) || 0), 0)).toFixed(2)} kg`}
                                                    />
                                                    {profitData && (
                                                        <Chip 
                                                            size="small" 
                                                            variant="outlined"
                                                            label={`Base: ${fmt((profitData.breakdown.custodyAndRelease || 0) + profitData.breakdown.logistics)}`}
                                                            sx={{ fontWeight: 'bold' }}
                                                        />
                                                    )}
                                                </Box>
                                            </Box>
                                            {profitData && (
                                                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                                    * El monto a pagar se calcula proporcionalmente sobre Custodia y Almacenaje ({fmt(profitData.breakdown.custodyAndRelease || 0)}) + Gastos Logísticos ({fmt(profitData.breakdown.logistics)})
                                                </Typography>
                                            )}
                                        </CardContent>
                                    </Card>

                                    {profitData ? (
                                        <Grid container spacing={3}>
                                            {/* Cost breakdown */}
                                            <Grid size={{ xs: 12, md: 6 }}>
                                                <Card variant="outlined">
                                                    <CardContent>
                                                        <Typography variant="subtitle2" gutterBottom>📊 Desglose de Costos</Typography>

                                                        <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                                                            <Typography variant="body2">Gastos Origen:</Typography>
                                                            <Typography variant="body2" fontWeight="bold">{fmt(profitData.breakdown.origin)}</Typography>
                                                        </Box>
                                                        <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                                                            <Typography variant="body2">Despacho Aduanal:</Typography>
                                                            <Typography variant="body2" fontWeight="bold">{fmt(profitData.breakdown.release)}</Typography>
                                                        </Box>
                                                        <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                                                            <Typography variant="body2">Custodia y Almacenaje:</Typography>
                                                            <Typography variant="body2" fontWeight="bold">{fmt(profitData.breakdown.custodyAndRelease || 0)}</Typography>
                                                        </Box>
                                                        <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                                                            <Typography variant="body2">Gastos Logísticos:</Typography>
                                                            <Typography variant="body2" fontWeight="bold">{fmt(profitData.breakdown.logistics)}</Typography>
                                                        </Box>
                                                        <Divider sx={{ my: 1 }} />
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                            <Typography variant="subtitle1" fontWeight="bold">Costo Total:</Typography>
                                                            <Typography variant="subtitle1" fontWeight="bold" color="error.main">
                                                                {fmt(profitData.totalCost)}
                                                            </Typography>
                                                        </Box>

                                                        <Box sx={{ mt: 2, p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                                                            <Typography variant="caption" color="text.secondary">
                                                                Peso: {form.gross_weight_kg} kg | Costo/kg: ${calcCostPerKg.toFixed(2)}
                                                            </Typography>
                                                        </Box>
                                                    </CardContent>
                                                </Card>
                                            </Grid>

                                            {/* Revenue & Profit */}
                                            <Grid size={{ xs: 12, md: 6 }}>
                                                <Card variant="outlined">
                                                    <CardContent>
                                                        <Typography variant="subtitle2" gutterBottom>💰 Ingresos y Utilidad</Typography>

                                                        {(() => {
                                                            const totalGuias = packagesS.length + cajoGuides.length;
                                                            const pctCajo = totalGuias > 0 ? cajoGuides.length / totalGuias : 0;
                                                            const sharedCost = (profitData.breakdown.custodyAndRelease || 0) + profitData.breakdown.logistics;
                                                            const pagoCajo = pctCajo * sharedCost;
                                                            const overfeeCajoPerKg = releaseCalc?.overfee_cajo_per_kg || 0;
                                                            const pesoCajo = releaseCalc?.peso_cajo || cajoGuides.reduce((sum, g) => sum + (Number(g.peso_kg) || 0), 0);
                                                            const overfeeTotal = overfeeCajoPerKg * pesoCajo;
                                                            const ingresosMXN = (profitData.totalRevenueMXN || profitData.totalRevenue) + pagoCajo + overfeeTotal;
                                                            const utilidad = ingresosMXN - profitData.totalCost;
                                                            const margen = profitData.totalCost > 0 ? ((utilidad / profitData.totalCost) * 100) : 0;

                                                            return (
                                                                <>
                                                                    <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                                                                        <Typography variant="body2">
                                                                            Ingresos ({profitData.packagesS} paquetes S):
                                                                        </Typography>
                                                                        <Typography variant="body2" fontWeight="bold" color="info.main">
                                                                            {fmtUSD(profitData.totalRevenueUSD || 0)} USD
                                                                        </Typography>
                                                                    </Box>

                                                                    <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', bgcolor: '#f5f5f5', p: 0.5, borderRadius: 1 }}>
                                                                        <Typography variant="caption" color="text.secondary">
                                                                            Tipo de Cambio (TDI):
                                                                        </Typography>
                                                                        <Typography variant="caption" fontWeight="bold">
                                                                            ${(profitData.exchangeRate || 0).toFixed(4)} MXN/USD
                                                                        </Typography>
                                                                    </Box>

                                                                    <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                                                                        <Typography variant="body2">
                                                                            Ingresos MXN:
                                                                        </Typography>
                                                                        <Typography variant="body2" fontWeight="bold" color="primary.main">
                                                                            {fmt(profitData.totalRevenueMXN || profitData.totalRevenue)}
                                                                        </Typography>
                                                                    </Box>

                                                                    {/* Pago Maniobra CAJO proporcional */}
                                                                    {cajoGuides.length > 0 && (
                                                                        <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', bgcolor: '#FFF3E0', p: 0.75, borderRadius: 1 }}>
                                                                            <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                                Pago Maniobra CAJO ({(pctCajo * 100).toFixed(0)}%):
                                                                            </Typography>
                                                                            <Typography variant="body2" fontWeight="bold" color="warning.dark">
                                                                                + {fmt(pagoCajo)}
                                                                            </Typography>
                                                                        </Box>
                                                                    )}

                                                                    {/* Overfee CAJO */}
                                                                    {cajoGuides.length > 0 && overfeeTotal > 0 && (
                                                                        <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', bgcolor: '#FFF3E0', p: 0.75, borderRadius: 1 }}>
                                                                            <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                                Overfee CAJO (${overfeeCajoPerKg.toFixed(2)} MXN/kg × {pesoCajo.toFixed(2)} kg):
                                                                            </Typography>
                                                                            <Typography variant="body2" fontWeight="bold" color="warning.dark">
                                                                                + {fmt(overfeeTotal)}
                                                                            </Typography>
                                                                        </Box>
                                                                    )}

                                                                    {/* Total Ingresos (con CAJO sumado) */}
                                                                    {cajoGuides.length > 0 && (
                                                                        <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', bgcolor: '#E8F5E9', p: 0.75, borderRadius: 1 }}>
                                                                            <Typography variant="body2" fontWeight="bold">
                                                                                Total Ingresos:
                                                                            </Typography>
                                                                            <Typography variant="body2" fontWeight="bold" color="success.main">
                                                                                {fmt(ingresosMXN)}
                                                                            </Typography>
                                                                        </Box>
                                                                    )}

                                                                    <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                                                                        <Typography variant="body2">Costo Total:</Typography>
                                                                        <Typography variant="body2" fontWeight="bold" color="error.main">
                                                                            {fmt(profitData.totalCost)}
                                                                        </Typography>
                                                                    </Box>

                                                                    <Divider sx={{ my: 1.5 }} />

                                                                    <Box sx={{
                                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                                        p: 2, borderRadius: 2,
                                                                        bgcolor: utilidad >= 0 ? '#e8f5e9' : '#ffebee',
                                                                    }}>
                                                                        <Box>
                                                                            <Typography variant="caption" color="text.secondary">UTILIDAD</Typography>
                                                                            <Typography variant="h4" fontWeight="bold" color={utilidad >= 0 ? 'success.main' : 'error.main'}>
                                                                                {utilidad >= 0 ? <UpIcon sx={{ verticalAlign: 'middle' }} /> : <DownIcon sx={{ verticalAlign: 'middle' }} />}
                                                                                {fmt(utilidad)}
                                                                            </Typography>
                                                                        </Box>
                                                                        <Box sx={{ textAlign: 'right' }}>
                                                                            <Typography variant="caption" color="text.secondary">MARGEN</Typography>
                                                                            <Typography
                                                                                variant="h4"
                                                                                fontWeight="bold"
                                                                                color={margen >= 15 ? 'success.main' : margen >= 0 ? 'warning.main' : 'error.main'}
                                                                            >
                                                                                {margen.toFixed(2)}%
                                                                            </Typography>
                                                                        </Box>
                                                                    </Box>
                                                                </>
                                                            );
                                                        })()}
                                                    </CardContent>
                                                </Card>
                                            </Grid>
                                        </Grid>
                                    ) : (
                                        <Box sx={{ py: 4, textAlign: 'center' }}>
                                            <CircularProgress size={24} sx={{ mr: 1 }} />
                                            <Typography variant="body2" color="text.secondary">Cargando datos de utilidad...</Typography>
                                        </Box>
                                    )}

                                    {/* Listado de Guías S con costos a cobrar */}
                                    {packagesS.length > 0 && (
                                        <Card variant="outlined" sx={{ mt: 3 }}>
                                            <CardContent sx={{ py: 2 }}>
                                                <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    ✈️ Detalle de Guías Gestión Aérea (S) — Costos a Cobrar
                                                    <Chip size="small" label={`${packagesS.length} guías`} color="primary" sx={{ fontWeight: 'bold' }} />
                                                    <Chip 
                                                        size="small" 
                                                        variant="outlined" 
                                                        color="info"
                                                        label={`Total: ${fmtUSD(packagesS.reduce((sum, p) => sum + (Number(p.air_sale_price) || 0), 0))} USD`}
                                                        sx={{ fontWeight: 'bold' }}
                                                    />
                                                </Typography>
                                                <TableContainer sx={{ maxHeight: 400 }}>
                                                    <Table size="small" stickyHeader>
                                                        <TableHead>
                                                            <TableRow sx={{ '& th': { bgcolor: '#e3f2fd', fontWeight: 'bold', fontSize: '0.75rem' } }}>
                                                                <TableCell>#</TableCell>
                                                                <TableCell>Tracking</TableCell>
                                                                <TableCell>Casillero</TableCell>
                                                                <TableCell align="right">Peso (kg)</TableCell>
                                                                <TableCell align="center">Tarifa</TableCell>
                                                                <TableCell align="right">$/kg (USD)</TableCell>
                                                                <TableCell align="right">Precio (USD)</TableCell>
                                                                <TableCell>Status</TableCell>
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            {packagesS.map((pkg, idx) => {
                                                                const tariffLabel = pkg.air_tariff_type === 'L' ? 'Logo' : pkg.air_tariff_type === 'G' ? 'Genérico' : pkg.air_tariff_type === 'S' ? 'Sensible' : pkg.air_tariff_type === 'F' ? 'Flat' : pkg.air_tariff_type || '-';
                                                                const tariffColor = pkg.air_tariff_type === 'L' ? '#1565C0' : pkg.air_tariff_type === 'G' ? '#2E7D32' : pkg.air_tariff_type === 'S' ? '#C62828' : pkg.air_tariff_type === 'F' ? '#6A1B9A' : '#757575';
                                                                return (
                                                                    <TableRow key={pkg.id} sx={{ '&:nth-of-type(odd)': { bgcolor: '#fafafa' } }}>
                                                                        <TableCell sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{idx + 1}</TableCell>
                                                                        <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>{pkg.tracking_internal}</TableCell>
                                                                        <TableCell sx={{ fontSize: '0.75rem' }}>
                                                                            {pkg.user_box_id ? (
                                                                                <Chip size="small" label={pkg.user_box_id} variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
                                                                            ) : '-'}
                                                                        </TableCell>
                                                                        <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                                            {pkg.weight ? `${Number(pkg.weight).toFixed(2)}` : '-'}
                                                                        </TableCell>
                                                                        <TableCell align="center">
                                                                            <Chip 
                                                                                size="small" 
                                                                                label={tariffLabel}
                                                                                sx={{ 
                                                                                    fontSize: '0.65rem', height: 20, fontWeight: 'bold',
                                                                                    bgcolor: `${tariffColor}15`, color: tariffColor, border: `1px solid ${tariffColor}40`
                                                                                }}
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell align="right" sx={{ fontSize: '0.75rem' }}>
                                                                            {pkg.air_price_per_kg ? `$${Number(pkg.air_price_per_kg).toFixed(2)}` : '-'}
                                                                        </TableCell>
                                                                        <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 'bold', color: Number(pkg.air_sale_price) > 0 ? '#1565C0' : 'text.secondary' }}>
                                                                            {pkg.air_sale_price ? fmtUSD(pkg.air_sale_price) : '$0.00'}
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            <Chip 
                                                                                size="small" 
                                                                                label={pkg.status || 'N/A'} 
                                                                                variant="outlined" 
                                                                                sx={{ fontSize: '0.6rem', height: 18 }} 
                                                                            />
                                                                        </TableCell>
                                                                    </TableRow>
                                                                );
                                                            })}
                                                            {/* Fila de totales */}
                                                            <TableRow sx={{ bgcolor: '#e3f2fd', '& td': { fontWeight: 'bold', fontSize: '0.8rem' } }}>
                                                                <TableCell colSpan={3} align="right">TOTALES:</TableCell>
                                                                <TableCell align="right">
                                                                    {packagesS.reduce((sum, p) => sum + (Number(p.weight) || 0), 0).toFixed(2)} kg
                                                                </TableCell>
                                                                <TableCell />
                                                                <TableCell />
                                                                <TableCell align="right" sx={{ color: '#1565C0' }}>
                                                                    {fmtUSD(packagesS.reduce((sum, p) => sum + (Number(p.air_sale_price) || 0), 0))}
                                                                </TableCell>
                                                                <TableCell />
                                                            </TableRow>
                                                        </TableBody>
                                                    </Table>
                                                </TableContainer>
                                                {packagesS.some(p => !p.air_sale_price || Number(p.air_sale_price) === 0) && (
                                                    <Alert severity="warning" sx={{ mt: 1, py: 0 }}>
                                                        <Typography variant="caption">
                                                            ⚠️ {packagesS.filter(p => !p.air_sale_price || Number(p.air_sale_price) === 0).length} paquete(s) sin precio asignado
                                                        </Typography>
                                                    </Alert>
                                                )}
                                            </CardContent>
                                        </Card>
                                    )}
                                </Box>
                            )}
                        </Box>
                    </>
                )}
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2, bgcolor: '#fafafa', justifyContent: 'space-between' }}>
                <Box>
                    <Typography variant="caption" color="text.secondary">
                        {cost ? `Creado: ${new Date(cost.created_at).toLocaleString()} | Actualizado: ${new Date(cost.updated_at).toLocaleString()}` : ''}
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button onClick={onClose} color="inherit">
                        Cerrar
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleSave}
                        disabled={saving}
                        startIcon={saving ? <CircularProgress size={18} /> : <SaveIcon />}
                        sx={{ bgcolor: '#111', '&:hover': { bgcolor: '#333' } }}
                    >
                        {saving ? 'Guardando...' : 'Guardar Costos'}
                    </Button>
                </Box>
            </DialogActions>
        </Dialog>
    );
}
