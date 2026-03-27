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
    Tooltip,
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
    profit: number;
    margin: string;
    packagesS: number;
    breakdown: {
        origin: number;
        release: number;
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

    // Form fields (editable costs)
    const [form, setForm] = useState({
        freight_cost: 0,
        freight_cost_pdf: '',
        origin_handling: 0,
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
    const calcTotalOrigin = (form.freight_cost || 0) + (form.origin_handling || 0);
    const calcTotalRelease = (form.customs_clearance || 0) + (form.custody_fee || 0) + (form.aa_expenses || 0) + (form.storage_fee || 0);
    const calcTotalLogistics = (form.transport_cost || 0) + (form.other_cost || 0);
    const calcGrandTotal = calcTotalOrigin + calcTotalRelease + calcTotalLogistics;
    const calcCostPerKg = form.gross_weight_kg > 0 ? (calcGrandTotal / form.gross_weight_kg) : 0;
    const completionPercent = [
        form.freight_cost > 0,
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

    // ===== Effects =====
    useEffect(() => {
        if (open && awbCostId) {
            setTabValue(0);
            setMessage(null);
            loadDetail();
        }
    }, [open, awbCostId, loadDetail]);

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
                body: JSON.stringify(form),
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

    // ===== Upload file handler =====
    const handleUploadFile = async (field: string, file: File) => {
        if (!awbCostId) return;
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('field', `${field}_pdf`);
        
        try {
            const res = await fetch(`${API_URL}/api/awb-costs/${awbCostId}/upload-document`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${getToken()}`,
                },
                body: formData,
            });
            const data = await res.json();
            if (data.success && data.url) {
                updateField(`${field}_pdf`, data.url);
                setMessage({ type: 'success', text: `✅ ${file.name} subido correctamente` });
            } else {
                setMessage({ type: 'error', text: data.error || 'Error subiendo archivo' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Error subiendo archivo' });
        }
    };

    // ===== Render cost field row =====
    const CostField = ({ label, field, icon }: { label: string; field: string; icon?: React.ReactNode }) => {
        const formRec = form as Record<string, string | number>;
        const pdfUrl = formRec[`${field}_pdf`] as string;
        
        return (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1.5 }}>
                {icon && <Box sx={{ color: 'text.secondary', display: 'flex' }}>{icon}</Box>}
                <TextField
                    fullWidth
                    label={label}
                    type="number"
                    value={formRec[field] || ''}
                    onChange={(e) => updateField(field, Number(e.target.value) || 0)}
                    size="small"
                    InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                    }}
                />
                {pdfUrl ? (
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Ver comprobante">
                            <IconButton 
                                size="small" 
                                color="primary"
                                onClick={() => window.open(pdfUrl.startsWith('http') ? pdfUrl : `${API_URL}${pdfUrl}`, '_blank')}
                            >
                                <OpenIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Eliminar comprobante">
                            <IconButton 
                                size="small" 
                                color="error"
                                onClick={() => updateField(`${field}_pdf`, '')}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                ) : (
                    <Tooltip title="Subir comprobante PDF/Imagen">
                        <Button
                            component="label"
                            variant="outlined"
                            size="small"
                            startIcon={<UploadIcon />}
                            sx={{ minWidth: 130, textTransform: 'none' }}
                        >
                            Subir PDF
                            <input
                                type="file"
                                hidden
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleUploadFile(field, file);
                                    e.target.value = '';
                                }}
                            />
                        </Button>
                    </Tooltip>
                )}
            </Box>
        );
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
                                                            <TextField fullWidth label="Origen" value={cost.origin_airport || '-'} disabled size="small" />
                                                        </Grid>
                                                        <Grid size={{ xs: 6 }}>
                                                            <TextField fullWidth label="Destino" value={cost.destination_airport || '-'} disabled size="small" />
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
                                        Costos de flete aéreo y manejo en origen (aeropuerto de salida)
                                    </Typography>

                                    <Card variant="outlined" sx={{ p: 2 }}>
                                        <CostField label="Flete Aéreo" field="freight_cost" icon={<FlightIcon fontSize="small" />} />
                                        <CostField label="Manejo en Origen" field="origin_handling" icon={<ShippingIcon fontSize="small" />} />
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
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                        Costos aduanales y de liberación en destino
                                    </Typography>

                                    <Card variant="outlined" sx={{ p: 2 }}>
                                        <CostField label="Despacho Aduanal" field="customs_clearance" icon={<GavelIcon fontSize="small" />} />
                                        <CostField label="Custodia" field="custody_fee" icon={<CostIcon fontSize="small" />} />
                                        <CostField label="Gastos AA (Agente Aduanal)" field="aa_expenses" icon={<DocIcon fontSize="small" />} />
                                        <CostField label="Almacenaje" field="storage_fee" icon={<BoxIcon fontSize="small" />} />
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

                                    <Card variant="outlined" sx={{ p: 2 }}>
                                        <CostField label="Transporte Terrestre" field="transport_cost" icon={<ShippingIcon fontSize="small" />} />
                                        <CostField label="Otros Gastos" field="other_cost" icon={<CostIcon fontSize="small" />} />
                                        <TextField
                                            fullWidth
                                            label="Descripción de otros gastos"
                                            value={form.other_cost_description}
                                            onChange={(e) => updateField('other_cost_description', e.target.value)}
                                            size="small"
                                            multiline
                                            rows={2}
                                            sx={{ mt: 1 }}
                                        />
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
                                                                onClick={() => window.open(`${API_URL}${cost.awb_pdf_url}`, '_blank')}
                                                                fullWidth
                                                                sx={{ mb: 1 }}
                                                            >
                                                                Ver AWB PDF
                                                            </Button>
                                                            <Typography variant="caption" color="text.secondary">
                                                                {cost.awb_pdf_url}
                                                            </Typography>
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
                                                                onClick={() => window.open(`${API_URL}${cost.packing_list_url}`, '_blank')}
                                                                fullWidth
                                                                sx={{ mb: 1 }}
                                                            >
                                                                Descargar Packing List
                                                            </Button>
                                                            <Typography variant="caption" color="text.secondary">
                                                                {cost.packing_list_url}
                                                            </Typography>
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

                                    {/* PDF comprobantes de costos */}
                                    <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                                        📎 Comprobantes de Costos
                                    </Typography>
                                    <Grid container spacing={1}>
                                        {[
                                            { label: 'Flete', url: form.freight_cost_pdf },
                                            { label: 'Manejo Origen', url: form.origin_handling_pdf },
                                            { label: 'Despacho', url: form.customs_clearance_pdf },
                                            { label: 'Custodia', url: form.custody_fee_pdf },
                                            { label: 'Gastos AA', url: form.aa_expenses_pdf },
                                            { label: 'Almacenaje', url: form.storage_fee_pdf },
                                            { label: 'Transporte', url: form.transport_cost_pdf },
                                            { label: 'Otros', url: form.other_cost_pdf },
                                        ].map(({ label, url }) => (
                                            <Grid size={{ xs: 6, md: 3 }} key={label}>
                                                <Chip
                                                    icon={url ? <CheckIcon /> : <WarningIcon />}
                                                    label={label}
                                                    color={url ? 'success' : 'default'}
                                                    variant={url ? 'filled' : 'outlined'}
                                                    onClick={url ? () => window.open(url, '_blank') : undefined}
                                                    sx={{ width: '100%', cursor: url ? 'pointer' : 'default' }}
                                                />
                                            </Grid>
                                        ))}
                                    </Grid>
                                </Box>
                            )}

                            {/* ============ TAB 5: UTILIDADES ============ */}
                            {tabValue === 5 && (
                                <Box>
                                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <ProfitIcon color="success" /> Utilidades y Rentabilidad
                                    </Typography>

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
                                                            <Typography variant="body2">Gastos Liberación:</Typography>
                                                            <Typography variant="body2" fontWeight="bold">{fmt(profitData.breakdown.release)}</Typography>
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

                                                        <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                                                            <Typography variant="body2">
                                                                Ingresos ({profitData.packagesS} paquetes S):
                                                            </Typography>
                                                            <Typography variant="body2" fontWeight="bold" color="primary.main">
                                                                {fmt(profitData.totalRevenue)}
                                                            </Typography>
                                                        </Box>

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
                                                            bgcolor: profitData.profit >= 0 ? '#e8f5e9' : '#ffebee',
                                                        }}>
                                                            <Box>
                                                                <Typography variant="caption" color="text.secondary">UTILIDAD</Typography>
                                                                <Typography variant="h4" fontWeight="bold" color={profitData.profit >= 0 ? 'success.main' : 'error.main'}>
                                                                    {profitData.profit >= 0 ? <UpIcon sx={{ verticalAlign: 'middle' }} /> : <DownIcon sx={{ verticalAlign: 'middle' }} />}
                                                                    {fmt(profitData.profit)}
                                                                </Typography>
                                                            </Box>
                                                            <Box sx={{ textAlign: 'right' }}>
                                                                <Typography variant="caption" color="text.secondary">MARGEN</Typography>
                                                                <Typography
                                                                    variant="h4"
                                                                    fontWeight="bold"
                                                                    color={Number(profitData.margin) >= 15 ? 'success.main' : Number(profitData.margin) >= 0 ? 'warning.main' : 'error.main'}
                                                                >
                                                                    {profitData.margin}%
                                                                </Typography>
                                                            </Box>
                                                        </Box>
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
