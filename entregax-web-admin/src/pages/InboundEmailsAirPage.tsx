// ============================================
// PANEL DE BORRADORES DE CORREOS AÉREOS
// Revisión y aprobación de AWB + Packing List Excel
// Extracción con IA (GPT-4o Vision) + xlsx parsing
// ============================================

import { useState, useEffect, useRef } from 'react';
import {
    Box,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    Chip,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Alert,
    Tabs,
    Tab,
    Grid,
    CircularProgress,
    LinearProgress,
    Tooltip,
    Divider,
    Snackbar,
    MenuItem,
    FormControl,
    InputLabel,
    Select,
} from '@mui/material';
import {
    Check as CheckIcon,
    Close as CloseIcon,
    Visibility as ViewIcon,
    Email as EmailIcon,
    Refresh as RefreshIcon,
    PictureAsPdf as PdfIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    Help as HelpIcon,
    ContentCopy as CopyIcon,
    CloudUpload as UploadIcon,
    Flight as FlightIcon,
    Warning as WarningIcon,
    CheckCircle as CheckCircleIcon,
    TableChart as ExcelIcon,
    FlightTakeoff as TakeoffIcon,
    FlightLand as LandIcon,
    Inventory as InventoryIcon,
} from '@mui/icons-material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const AIR_COLOR = '#E53935';
const AIR_BG = '#FFEBEE';

// ========== INTERFACES ==========
interface AirDraft {
    id: number;
    from_email: string;
    from_name: string;
    subject: string;
    document_type: string;
    confidence: string;
    reference?: string | null;
    awb_number: string | null;
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
    status: string;
    rejection_reason: string | null;
    reviewed_by: number | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
    has_awb_pdf: boolean;
    has_packing_list: boolean;
    packing_rows_count: string | null;
    total_cajas: string | null;
    total_kg: string | null;
    clientes_count: number;
    // Detail only
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extracted_data?: any;
    reviewer_name?: string;
    awb_pdf_url?: string;
    packing_list_excel_url?: string;
}

interface WhitelistEntry {
    id: number;
    email_pattern: string;
    description: string;
    is_active: boolean;
    created_at: string;
}

interface PackingRow {
    fecha: string | null;
    guiaAir: string | null;
    cliente: string | null;
    noCaja: string | null;
    pesoKg: number | null;
    largo: number | null;
    ancho: number | null;
    alto: number | null;
    volumen: number | null;
    tipo: string | null;
    tipoNorm: string | null;
    observa: string | null;
    noTarima: string | null;
    vuelo: string | null;
    guiaVuelo: string | null;
    paqueteria: string | null;
    guiaEntrega: string | null;
    // Campos de precio (vienen cuando AWB ya está aprobado)
    tariffType?: string;
    pricePerKg?: number;
    salePrice?: number;
    isCustomTariff?: boolean;
}

interface EditableAwb {
    mawb: string;
    shipperName: string;
    consignee: string;
    carrier: string;
    origin: string;
    destination: string;
    flightNumber: string;
    flightDate: string;
    pieces: number | string;
    grossWeightKg: number | string;
    totalCost: number | string;
    totalCostCurrency: string;
}

// ========== MAIN COMPONENT ==========
export default function InboundEmailsAirPage() {
    // Auth
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    // Tabs
    const [activeTab, setActiveTab] = useState(0);

    // Drafts
    const [drafts, setDrafts] = useState<AirDraft[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('draft');

    // Stats
    const [stats, setStats] = useState<{ pending: number; approved: number; rejected: number; total: number; last_24h: number; total_pieces_approved: number; total_kg_approved: number } | null>(null);

    // Detail dialog
    const [detailOpen, setDetailOpen] = useState(false);
    const [selectedDraft, setSelectedDraft] = useState<AirDraft | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // Editable AWB
    const [editableAwb, setEditableAwb] = useState<EditableAwb>({
        mawb: '', shipperName: '', consignee: '', carrier: '',
        origin: '', destination: '', flightNumber: '', flightDate: '',
        pieces: '', grossWeightKg: '', totalCost: '', totalCostCurrency: 'HKD',
    });

    // Editable packing rows (for type corrections)
    const [editableRows, setEditableRows] = useState<PackingRow[]>([]);

    // Processing
    const [processing, setProcessing] = useState(false);
    const [extracting, setExtracting] = useState(false);

    // Reject dialog
    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState('');

    // Upload dialog
    const [uploadOpen, setUploadOpen] = useState(false);
    const [uploadAwbFile, setUploadAwbFile] = useState<File | null>(null);
    const [uploadExcelFile, setUploadExcelFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({ step: 0, total: 4, status: '' });
    const [uploadRouteId, setUploadRouteId] = useState<number | ''>('');
    const [uploadReference, setUploadReference] = useState('');
    const [airRoutes, setAirRoutes] = useState<{ id: number; code: string; name: string; origin_airport: string; destination_airport: string }[]>([]);

    // Whitelist
    const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
    const [whitelistDialogOpen, setWhitelistDialogOpen] = useState(false);
    const [newWhitelistPattern, setNewWhitelistPattern] = useState('');
    const [newWhitelistDesc, setNewWhitelistDesc] = useState('');

    // Instructions dialog
    const [instructionsOpen, setInstructionsOpen] = useState(false);

    // Snackbar
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'warning' | 'info' });

    // Refs
    const awbInputRef = useRef<HTMLInputElement>(null);
    const excelInputRef = useRef<HTMLInputElement>(null);

    // ========== FETCH AIR ROUTES ==========
    const fetchAirRoutes = async () => {
        try {
            const res = await fetch(`${API_URL}/api/admin/air-routes`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) {
                setAirRoutes((data.routes || []).filter((r: { is_active: boolean }) => r.is_active));
            }
        } catch (err) {
            console.error('Error fetching air routes:', err);
        }
    };

    // ========== FETCH ==========
    const fetchDrafts = async () => {
        setLoading(true);
        try {
            const filter = statusFilter === 'all' ? '' : `?status=${statusFilter}`;
            const resp = await fetch(`${API_URL}/api/admin/air-email/drafts${filter}`, { headers });
            if (resp.ok) {
                setDrafts(await resp.json());
            }
        } catch (err) {
            console.error('Error fetching air drafts:', err);
        }
        setLoading(false);
    };

    const fetchStats = async () => {
        try {
            const resp = await fetch(`${API_URL}/api/admin/air-email/stats`, { headers });
            if (resp.ok) setStats(await resp.json());
        } catch { /* silent */ }
    };

    const fetchWhitelist = async () => {
        try {
            const resp = await fetch(`${API_URL}/api/admin/air-email/whitelist`, { headers });
            if (resp.ok) setWhitelist(await resp.json());
        } catch { /* silent */ }
    };

    useEffect(() => {
        const load = async () => { await fetchDrafts(); await fetchStats(); };
        load();
    }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (activeTab === 1) { const load = async () => { await fetchWhitelist(); }; load(); }
    }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

    // ========== OPEN DETAIL ==========
    const openDetail = async (draftId: number) => {
        setDetailLoading(true);
        setDetailOpen(true);
        try {
            const resp = await fetch(`${API_URL}/api/admin/air-email/drafts/${draftId}`, { headers });
            if (resp.ok) {
                const data = await resp.json();
                setSelectedDraft(data);
                initEditableData(data);
            }
        } catch (err) {
            console.error('Error:', err);
        }
        setDetailLoading(false);
    };

    const initEditableData = (draft: AirDraft) => {
        const awb = draft.extracted_data?.awb || {};
        setEditableAwb({
            mawb: draft.awb_number || awb.mawb || '',
            shipperName: draft.shipper_name || awb.shipperName || '',
            consignee: draft.consignee || awb.consignee || '',
            carrier: draft.carrier || awb.carrier || '',
            origin: draft.origin_airport || awb.origin || '',
            destination: draft.destination_airport || awb.destination || '',
            flightNumber: draft.flight_number || awb.flightNumber || '',
            flightDate: draft.flight_date ? draft.flight_date.substring(0, 10) : awb.flightDate || '',
            pieces: draft.pieces || awb.pieces || '',
            grossWeightKg: draft.gross_weight_kg || awb.grossWeightKg || '',
            totalCost: draft.total_cost_amount || awb.totalCost || '',
            totalCostCurrency: draft.total_cost_currency || awb.totalCostCurrency || 'HKD',
        });
        setEditableRows(draft.extracted_data?.packingList?.rows || []);
    };

    // ========== APPROVE ==========
    const guiaVueloExcel = selectedDraft?.extracted_data?.guiaVueloExcel
        || selectedDraft?.extracted_data?.packingList?.rows?.find((r: any) => r.guiaVuelo)?.guiaVuelo
        || null;
    const guiaVueloMismatch = !!(guiaVueloExcel && editableAwb.mawb && guiaVueloExcel !== editableAwb.mawb);

    // Detectar si ya existe otro borrador aprobado con el mismo MAWB
    const duplicateApproved = !!(selectedDraft && editableAwb.mawb &&
        drafts.some(d => d.id !== selectedDraft.id && d.status === 'approved' && d.awb_number === editableAwb.mawb)
    );

    const handleApprove = async () => {
        if (!selectedDraft || processing) return;
        setProcessing(true);

        // Validaciones
        if (!editableAwb.mawb) {
            setSnackbar({ open: true, message: 'El MAWB es obligatorio', severity: 'error' });
            setProcessing(false);
            return;
        }

        if (guiaVueloMismatch) {
            setSnackbar({
                open: true,
                message: `⚠️ No se puede aprobar: La guía de vuelo del Packing List (${guiaVueloExcel}) no coincide con el MAWB del AWB (${editableAwb.mawb}). Corrige el MAWB o sube el Packing List correcto.`,
                severity: 'error',
            });
            setProcessing(false);
            return;
        }

        if (duplicateApproved) {
            setSnackbar({
                open: true,
                message: `🚫 El MAWB ${editableAwb.mawb} ya fue aprobado en otro borrador. No se puede duplicar.`,
                severity: 'error',
            });
            setProcessing(false);
            return;
        }

        try {
            const resp = await fetch(`${API_URL}/api/admin/air-email/drafts/${selectedDraft.id}/approve`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    editedAwb: editableAwb,
                    editedPackingList: { rows: editableRows },
                }),
            });

            if (resp.ok) {
                const result = await resp.json();
                const sCount = result.packagesS || 0;
                const cajoCount = result.packagesCajo || 0;
                setSnackbar({
                    open: true,
                    message: `✅ Aprobado: ${sCount} guías → Gestión Aérea (S), ${cajoCount} guías → Gestión Cajo | Línea de costeo AWB creada`,
                    severity: 'success',
                });
                setDetailOpen(false);
                setSelectedDraft(null);
                fetchDrafts();
                fetchStats();
            } else {
                const err = await resp.json();
                setSnackbar({ open: true, message: `Error: ${err.error || 'No se pudo aprobar'}`, severity: 'error' });
            }
        } catch (err: unknown) {
            setSnackbar({ open: true, message: `Error: ${err instanceof Error ? err.message : 'desconocido'}`, severity: 'error' });
        }
        setProcessing(false);
    };

    // ========== REJECT ==========
    const handleReject = async () => {
        if (!selectedDraft || processing) return;
        setProcessing(true);

        try {
            const resp = await fetch(`${API_URL}/api/admin/air-email/drafts/${selectedDraft.id}/reject`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ reason: rejectReason, userId: null }),
            });

            if (resp.ok) {
                setSnackbar({ open: true, message: 'Borrador rechazado', severity: 'warning' });
                setRejectOpen(false);
                setRejectReason('');
                setDetailOpen(false);
                fetchDrafts();
                fetchStats();
            }
        } catch (err: unknown) {
            setSnackbar({ open: true, message: `Error: ${err instanceof Error ? err.message : 'desconocido'}`, severity: 'error' });
        }
        setProcessing(false);
    };

    // ========== RE-EXTRACT ==========
    const handleReextract = async () => {
        if (!selectedDraft) return;
        setExtracting(true);

        try {
            const resp = await fetch(`${API_URL}/api/admin/air-email/drafts/${selectedDraft.id}/reextract`, {
                method: 'POST',
                headers,
            });

            if (resp.ok) {
                const data = await resp.json();
                setSnackbar({ open: true, message: `Re-extracción completada (${data.confidence})`, severity: 'success' });
                // Reload detail
                openDetail(selectedDraft.id);
            } else {
                const err = await resp.json();
                setSnackbar({ open: true, message: `Error: ${err.error}${err.details ? ` — ${err.details}` : ''}`, severity: 'error' });
            }
        } catch (err: unknown) {
            setSnackbar({ open: true, message: `Error: ${err instanceof Error ? err.message : 'desconocido'}`, severity: 'error' });
        }
        setExtracting(false);
    };

    // ========== VIEW PDF ==========
    const viewAwbPdf = async (draftId: number) => {
        try {
            const resp = await fetch(`${API_URL}/api/admin/air-email/drafts/${draftId}/awb-pdf`, { headers });
            if (resp.ok) {
                const blob = await resp.blob();
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
                setTimeout(() => URL.revokeObjectURL(url), 60000);
            }
        } catch { /* silent */ }
    };

    const downloadExcel = (draftId: number) => {
        window.open(`${API_URL}/api/admin/air-email/drafts/${draftId}/excel?token=${token}`, '_blank');
    };

    // ========== UPLOAD ==========
    const handleUpload = async () => {
        if (!uploadAwbFile || uploading) return;
        setUploading(true);
        setUploadProgress({ step: 1, total: 4, status: 'Subiendo archivos...' });

        try {
            const formData = new FormData();
            formData.append('awb', uploadAwbFile);
            if (uploadExcelFile) formData.append('packingList', uploadExcelFile);
            if (uploadRouteId) formData.append('route_id', uploadRouteId.toString());
            if (uploadReference.trim()) formData.append('reference', uploadReference.trim());

            setUploadProgress({ step: 2, total: 4, status: 'Extrayendo datos del AWB con IA...' });

            const resp = await fetch(`${API_URL}/api/admin/air-email/upload-manual`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });

            setUploadProgress({ step: 3, total: 4, status: 'Procesando packing list...' });

            if (resp.ok) {
                const data = await resp.json();
                setUploadProgress({ step: 4, total: 4, status: '¡Completado!' });

                await new Promise(r => setTimeout(r, 800));

                setSnackbar({
                    open: true,
                    message: `✈️ MAWB: ${data.awb?.mawb || 'N/A'} — ${data.packingListRows} paquetes (${data.confidence})`,
                    severity: 'success',
                });
                setUploadOpen(false);
                setUploadAwbFile(null);
                setUploadExcelFile(null);
                setUploadRouteId('');
                setUploadReference('');
                fetchDrafts();
                fetchStats();
            } else {
                const err = await resp.json();
                setSnackbar({ open: true, message: `Error: ${err.error || err.details}`, severity: 'error' });
            }
        } catch (err: unknown) {
            setSnackbar({ open: true, message: `Error: ${err instanceof Error ? err.message : 'desconocido'}`, severity: 'error' });
        }

        setUploading(false);
        setUploadProgress({ step: 0, total: 4, status: '' });
    };

    // ========== WHITELIST ==========
    const addWhitelist = async () => {
        if (!newWhitelistPattern) return;
        try {
            const resp = await fetch(`${API_URL}/api/admin/air-email/whitelist`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ email_pattern: newWhitelistPattern, description: newWhitelistDesc }),
            });
            if (resp.ok) {
                setSnackbar({ open: true, message: 'Patrón agregado', severity: 'success' });
                setWhitelistDialogOpen(false);
                setNewWhitelistPattern('');
                setNewWhitelistDesc('');
                fetchWhitelist();
            }
        } catch { /* silent */ }
    };

    const removeWhitelist = async (id: number) => {
        try {
            await fetch(`${API_URL}/api/admin/air-email/whitelist/${id}`, { method: 'DELETE', headers });
            fetchWhitelist();
        } catch { /* silent */ }
    };

    // ========== FORMAT HELPERS ==========
    const formatDate = (d: string) => {
        if (!d) return '-';
        try {
            return new Date(d).toLocaleDateString('es-MX', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            });
        } catch { return d; }
    };

    const confidenceColor = (c: string) => c === 'high' ? 'success' : c === 'medium' ? 'warning' : 'error';
    const statusColor = (s: string) => s === 'approved' ? 'success' : s === 'rejected' ? 'error' : 'warning';

    const tipoColor = (t: string) => {
        if (t === 'Logo' || t?.includes('L')) return 'warning';
        if (t === 'Medical' || t?.includes('M')) return 'error';
        return 'success';
    };

    // ========== PACKING LIST ROW EDIT ==========
    const updateRow = (idx: number, field: string, value: string | number) => {
        const copy = [...editableRows];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (copy[idx] as any)[field] = value;
        setEditableRows(copy);
    };

    // Count unique clients
    const uniqueClients = [...new Set(editableRows.map(r => r.cliente).filter(Boolean))];
    const tipoCount = (tipo: string) => editableRows.filter(r => r.tipoNorm === tipo).length;

    // ========== RENDER ==========
    return (
        <Box>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Box>
                    <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700 }}>
                        <FlightIcon sx={{ color: AIR_COLOR }} />
                        Correos Entrantes - Aéreo
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Revisión de AWB y Packing List extraídos por IA
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                        variant="contained"
                        startIcon={<UploadIcon />}
                        onClick={() => { fetchAirRoutes(); setUploadOpen(true); }}
                        sx={{ bgcolor: AIR_COLOR, '&:hover': { bgcolor: '#C62828' }, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                    >
                        Subir AWB
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<HelpIcon />}
                        onClick={() => setInstructionsOpen(true)}
                        sx={{ borderColor: '#999', color: '#555', borderRadius: 2, textTransform: 'none' }}
                    >
                        Instrucciones
                    </Button>
                    <IconButton onClick={() => { fetchDrafts(); fetchStats(); }} sx={{ color: AIR_COLOR }}>
                        <RefreshIcon />
                    </IconButton>
                </Box>
            </Box>

            {/* Stats cards */}
            {stats && (
                <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                    <Paper sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#FFF3E0', borderRadius: 2, flex: '1 1 0' }}>
                        <Typography variant="h5" fontWeight={700} color="#E65100">{stats.pending || 0}</Typography>
                        <Typography variant="body2" color="text.secondary">Pendientes</Typography>
                    </Paper>
                    <Paper sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#E8F5E9', borderRadius: 2, flex: '1 1 0' }}>
                        <Typography variant="h5" fontWeight={700} color="#2E7D32">{stats.approved || 0}</Typography>
                        <Typography variant="body2" color="text.secondary">Aprobados</Typography>
                    </Paper>
                    <Paper sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#FFEBEE', borderRadius: 2, flex: '1 1 0' }}>
                        <Typography variant="h5" fontWeight={700} color="#C62828">{stats.rejected || 0}</Typography>
                        <Typography variant="body2" color="text.secondary">Rechazados</Typography>
                    </Paper>
                    <Paper sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#E3F2FD', borderRadius: 2, flex: '1 1 0' }}>
                        <Typography variant="h5" fontWeight={700} color="#1565C0">{stats.total_pieces_approved || 0}</Typography>
                        <Typography variant="body2" color="text.secondary">Piezas aprobadas</Typography>
                    </Paper>
                    <Paper sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#F3E5F5', borderRadius: 2, flex: '1 1 0' }}>
                        <Typography variant="h5" fontWeight={700} color="#7B1FA2">{Number(stats.total_kg_approved || 0).toLocaleString()} kg</Typography>
                        <Typography variant="body2" color="text.secondary">KG aprobados</Typography>
                    </Paper>
                </Box>
            )}

            {/* Tabs */}
            <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
                <Tab label="✈️ Borradores" />
                <Tab label="✉️ Whitelist" />
            </Tabs>

            {/* ====== TAB 0: BORRADORES ====== */}
            {activeTab === 0 && (
                <Box>
                    {/* Filter chips */}
                    <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                        {['draft', 'approved', 'rejected', 'all'].map(s => (
                            <Chip
                                key={s}
                                label={s === 'draft' ? 'Pendientes' : s === 'approved' ? 'Aprobados' : s === 'rejected' ? 'Rechazados' : 'Todos'}
                                color={statusFilter === s ? 'primary' : 'default'}
                                variant={statusFilter === s ? 'filled' : 'outlined'}
                                onClick={() => setStatusFilter(s)}
                                sx={{ cursor: 'pointer', fontWeight: statusFilter === s ? 700 : 400 }}
                            />
                        ))}
                    </Box>

                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress sx={{ color: AIR_COLOR }} /></Box>
                    ) : drafts.length === 0 ? (
                        <Alert severity="info" sx={{ borderRadius: 2 }}>
                            No hay borradores {statusFilter === 'draft' ? 'pendientes' : statusFilter}
                        </Alert>
                    ) : (
                        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#F5F5F5' }}>
                                        <TableCell sx={{ fontWeight: 700 }}>Referencia</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>MAWB</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Ruta</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Vuelo</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Piezas</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Peso</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Costo</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Clientes</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Confianza</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Recibido</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Estado</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Acciones</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {drafts.map(d => (
                                        <TableRow key={d.id} hover sx={{ '&:hover': { bgcolor: AIR_BG } }}>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                                    {d.reference || '—'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                                    {d.awb_number || '—'}
                                                </Typography>
                                                {d.carrier && (
                                                    <Typography variant="caption" color="text.secondary">{d.carrier}</Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {d.origin_airport && d.destination_airport ? (
                                                    <Chip
                                                        icon={<FlightIcon sx={{ fontSize: 14 }} />}
                                                        label={`${d.origin_airport} → ${d.destination_airport}`}
                                                        size="small"
                                                        sx={{ bgcolor: '#E3F2FD', fontWeight: 600 }}
                                                    />
                                                ) : '—'}
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">{d.flight_number || '—'}</Typography>
                                                {d.flight_date && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        {new Date(d.flight_date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}
                                                    </Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight={600}>{d.pieces || d.total_cajas || '—'}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">{d.gross_weight_kg ? `${Number(d.gross_weight_kg).toLocaleString()} kg` : d.total_kg ? `${Number(d.total_kg).toLocaleString()} kg` : '—'}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                {d.total_cost_amount ? (
                                                    <Typography variant="body2" fontWeight={600}>
                                                        {Number(d.total_cost_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} {d.total_cost_currency || ''}
                                                    </Typography>
                                                ) : '—'}
                                            </TableCell>
                                            <TableCell>
                                                {d.clientes_count > 0 ? (
                                                    <Chip label={`${d.clientes_count} clientes`} size="small" color="info" variant="outlined" />
                                                ) : '—'}
                                            </TableCell>
                                            <TableCell>
                                                <Chip label={d.confidence} size="small" color={confidenceColor(d.confidence)} variant="filled" />
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="caption">{formatDate(d.created_at)}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip label={d.status === 'draft' ? 'Pendiente' : d.status === 'approved' ? 'Aprobado' : 'Rechazado'} size="small" color={statusColor(d.status)} variant="filled" />
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', gap: 0.5 }}>
                                                    <Tooltip title="Ver detalle">
                                                        <IconButton size="small" onClick={() => openDetail(d.id)} sx={{ color: AIR_COLOR }}>
                                                            <ViewIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    {d.status === 'draft' && (
                                                        <>
                                                            <Tooltip title="Aprobar">
                                                                <IconButton size="small" color="success" onClick={() => openDetail(d.id)}>
                                                                    <CheckIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                            <Tooltip title="Rechazar">
                                                                <IconButton size="small" color="error" onClick={() => { setSelectedDraft(d as AirDraft); setRejectOpen(true); }}>
                                                                    <CloseIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        </>
                                                    )}
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Box>
            )}

            {/* ====== TAB 1: WHITELIST ====== */}
            {activeTab === 1 && (
                <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">Remitentes Autorizados</Typography>
                        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setWhitelistDialogOpen(true)}
                            sx={{ bgcolor: AIR_COLOR, '&:hover': { bgcolor: '#C62828' }, textTransform: 'none' }}>
                            Agregar
                        </Button>
                    </Box>
                    <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
                        Solo los correos que coincidan con estos patrones serán procesados automáticamente.
                    </Alert>
                    <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ bgcolor: '#F5F5F5' }}>
                                    <TableCell sx={{ fontWeight: 700 }}>Patrón de Email</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Descripción</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Fecha</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Acciones</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {whitelist.map(w => (
                                    <TableRow key={w.id}>
                                        <TableCell><Typography sx={{ fontFamily: 'monospace' }}>{w.email_pattern}</Typography></TableCell>
                                        <TableCell>{w.description || '—'}</TableCell>
                                        <TableCell>{formatDate(w.created_at)}</TableCell>
                                        <TableCell>
                                            <IconButton size="small" color="error" onClick={() => removeWhitelist(w.id)}>
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {whitelist.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} align="center">
                                            <Typography color="text.secondary">No hay patrones de whitelist</Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            )}

            {/* ====== DETAIL DIALOG ====== */}
            <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} fullWidth maxWidth="lg">
                <DialogTitle sx={{ bgcolor: AIR_COLOR, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FlightIcon />
                    Detalle AWB
                    {selectedDraft && (
                        <Chip label={selectedDraft.status} color={statusColor(selectedDraft.status)} size="small" sx={{ ml: 1, color: 'white' }} />
                    )}
                </DialogTitle>
                <DialogContent dividers sx={{ p: 0 }}>
                    {detailLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
                    ) : selectedDraft ? (
                        <Box sx={{ p: 2 }}>
                            {/* Alerta de MAWB duplicado */}
                            {duplicateApproved && selectedDraft.status !== 'approved' && (
                                <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} variant="filled">
                                    <strong>🚫 MAWB Duplicado:</strong> El MAWB <strong>{editableAwb.mawb}</strong> ya fue aprobado en otro borrador. 
                                    Este borrador no se puede aprobar. Rechácelo o corrija el MAWB.
                                </Alert>
                            )}
                            {/* Packing List Rows Table */}
                            {editableRows.length > 0 && (
                                <Box sx={{ mb: 3 }}>
                                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <InventoryIcon sx={{ color: AIR_COLOR }} /> Paquetes del Packing List ({editableRows.length})
                                    </Typography>

                                    {/* Summary chips */}
                                    <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                                        <Chip label={`${uniqueClients.length} clientes`} size="small" color="info" />
                                        {tipoCount('Logo') > 0 && <Chip label={`Logo: ${tipoCount('Logo')}`} size="small" color="warning" />}
                                        {tipoCount('Generico') > 0 && <Chip label={`Genérico: ${tipoCount('Generico')}`} size="small" color="success" />}
                                        {tipoCount('Medical') > 0 && <Chip label={`Medical: ${tipoCount('Medical')}`} size="small" color="error" />}
                                    </Box>

                                    <TableContainer sx={{ maxHeight: 350, overflow: 'auto' }}>
                                        <Table size="small" stickyHeader>
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell sx={{ fontWeight: 700, bgcolor: '#263238', color: 'white' }}>Guía AIR</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, bgcolor: '#263238', color: 'white' }}>Cliente</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, bgcolor: '#263238', color: 'white' }}>Tipo</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, bgcolor: '#263238', color: 'white' }} align="right">Peso KG</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, bgcolor: '#263238', color: 'white' }} align="right">Vol</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, bgcolor: '#263238', color: 'white' }}>L×W×H</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, bgcolor: '#263238', color: 'white' }}>Producto</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, bgcolor: '#263238', color: 'white' }}>Guía Vuelo</TableCell>
                                                    {selectedDraft?.status === 'approved' && (
                                                        <TableCell sx={{ fontWeight: 700, bgcolor: '#1B5E20', color: 'white' }} align="right">💰 Precio</TableCell>
                                                    )}
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {editableRows.map((row, idx) => (
                                                    <TableRow key={idx} hover>
                                                        <TableCell>
                                                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                                                {row.guiaAir || row.noCaja || '—'}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Typography variant="body2" fontWeight={600}>{row.cliente || '—'}</Typography>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Chip
                                                                label={row.tipoNorm || 'N/A'}
                                                                size="small"
                                                                color={tipoColor(row.tipoNorm || '')}
                                                                variant="filled"
                                                                onClick={() => {
                                                                    if (selectedDraft?.status === 'draft') {
                                                                        const types = ['Generico', 'Logo', 'Medical'];
                                                                        const nextIdx = (types.indexOf(row.tipoNorm || 'Generico') + 1) % types.length;
                                                                        updateRow(idx, 'tipoNorm', types[nextIdx]);
                                                                    }
                                                                }}
                                                                sx={{ cursor: selectedDraft?.status === 'draft' ? 'pointer' : 'default' }}
                                                            />
                                                        </TableCell>
                                                        <TableCell align="right">{row.pesoKg?.toFixed(1) || '—'}</TableCell>
                                                        <TableCell align="right">{row.volumen?.toFixed(2) || '—'}</TableCell>
                                                        <TableCell>
                                                            <Typography variant="caption" color="text.secondary">
                                                                {row.largo && row.ancho && row.alto ? `${row.largo}×${row.ancho}×${row.alto}` : '—'}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Typography variant="body2" sx={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {row.observa || '—'}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{row.guiaVuelo || '—'}</Typography>
                                                        </TableCell>
                                                        {selectedDraft?.status === 'approved' && (
                                                            <TableCell align="right">
                                                                {row.salePrice ? (
                                                                    <Box>
                                                                        <Typography variant="body2" fontWeight={700} color="success.main">
                                                                            ${row.salePrice.toFixed(2)}
                                                                        </Typography>
                                                                        <Typography variant="caption" color="text.secondary">
                                                                            ${row.pricePerKg?.toFixed(2)}/kg
                                                                            {row.isCustomTariff && <Chip label="⭐" size="small" sx={{ ml: 0.5, height: 16, fontSize: '0.6rem' }} />}
                                                                        </Typography>
                                                                    </Box>
                                                                ) : '—'}
                                                            </TableCell>
                                                        )}
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>

                                    {/* Excel summary */}
                                    {selectedDraft.extracted_data?.packingList?.summary?.length > 0 && (
                                        <Box sx={{ mt: 1, p: 1.5, bgcolor: '#E3F2FD', borderRadius: 2 }}>
                                            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>📊 Resumen del Excel</Typography>
                                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                                {selectedDraft.extracted_data.packingList.summary.map((s: { concepto: string; cajas: number; kg: number }, i: number) => (
                                                    <Chip
                                                        key={i}
                                                        label={`${s.concepto}: ${s.cajas} cajas / ${s.kg} kg`}
                                                        size="small"
                                                        sx={{
                                                            bgcolor: s.concepto === 'TOTAL' ? AIR_COLOR : '#FFF',
                                                            color: s.concepto === 'TOTAL' ? 'white' : 'inherit',
                                                            fontWeight: s.concepto === 'TOTAL' ? 700 : 400,
                                                        }}
                                                    />
                                                ))}
                                            </Box>

                                            {/* Guía de Vuelo del Packing List */}
                                            {(selectedDraft.extracted_data?.guiaVueloExcel || selectedDraft.extracted_data?.packingList?.rows?.find((r: any) => r.guiaVuelo)?.guiaVuelo) && (
                                                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Typography variant="body2" fontWeight={700} color="text.secondary">
                                                        ✈️ Guía de Vuelo (Packing List):
                                                    </Typography>
                                                    <Chip
                                                        label={selectedDraft.extracted_data?.guiaVueloExcel || selectedDraft.extracted_data?.packingList?.rows?.find((r: any) => r.guiaVuelo)?.guiaVuelo}
                                                        size="small"
                                                        sx={{
                                                            bgcolor: AIR_COLOR,
                                                            color: 'white',
                                                            fontWeight: 700,
                                                            fontFamily: 'monospace',
                                                            fontSize: '0.85rem',
                                                        }}
                                                    />
                                                    {selectedDraft.awb_number && selectedDraft.extracted_data?.guiaVueloExcel &&
                                                     selectedDraft.awb_number !== selectedDraft.extracted_data.guiaVueloExcel && (
                                                        <Chip
                                                            label="⚠️ No coincide con MAWB"
                                                            size="small"
                                                            color="warning"
                                                            sx={{ fontWeight: 600 }}
                                                        />
                                                    )}
                                                </Box>
                                            )}
                                        </Box>
                                    )}

                                    {/* Total de Venta cuando está aprobado */}
                                    {selectedDraft?.status === 'approved' && (
                                        <Box sx={{ mt: 1, p: 1.5, bgcolor: '#E8F5E9', borderRadius: 2, border: '2px solid #4CAF50' }}>
                                            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                💰 Total Precio de Venta
                                            </Typography>
                                            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                                <Typography variant="h5" fontWeight={700} color="success.main">
                                                    ${editableRows.reduce((sum, r) => sum + (r.salePrice || 0), 0).toFixed(2)} USD
                                                </Typography>
                                                <Chip
                                                    label={`${editableRows.filter(r => r.isCustomTariff).length} con tarifa especial`}
                                                    size="small"
                                                    color="warning"
                                                    sx={{ display: editableRows.some(r => r.isCustomTariff) ? 'inline-flex' : 'none' }}
                                                />
                                            </Box>
                                        </Box>
                                    )}
                                </Box>
                            )}

                            <Divider sx={{ my: 2 }} />

                            {/* AWB Data + Email Info */}
                            <Grid container spacing={3}>
                                {/* Left: AWB Data */}
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <PdfIcon sx={{ color: AIR_COLOR }} /> Datos de la Guía Aérea (AWB)
                                    </Typography>

                                    <Grid container spacing={1.5}>
                                        <Grid size={{ xs: 12 }}>
                                            <TextField fullWidth size="small" label="MAWB" value={editableAwb.mawb}
                                                onChange={e => setEditableAwb({ ...editableAwb, mawb: e.target.value })}
                                                disabled={selectedDraft.status !== 'draft'}
                                                sx={{ '& input': { fontFamily: 'monospace', fontWeight: 700 } }}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 12 }}>
                                            <TextField fullWidth size="small" label="Shipper (Embarcador)" value={editableAwb.shipperName}
                                                onChange={e => setEditableAwb({ ...editableAwb, shipperName: e.target.value })}
                                                disabled={selectedDraft.status !== 'draft'} multiline maxRows={2}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 12 }}>
                                            <TextField fullWidth size="small" label="Consignee (Consignatario)" value={editableAwb.consignee}
                                                onChange={e => setEditableAwb({ ...editableAwb, consignee: e.target.value })}
                                                disabled={selectedDraft.status !== 'draft'} multiline maxRows={2}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <TextField fullWidth size="small" label="Carrier / Aerolínea" value={editableAwb.carrier}
                                                onChange={e => setEditableAwb({ ...editableAwb, carrier: e.target.value })}
                                                disabled={selectedDraft.status !== 'draft'}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <TextField fullWidth size="small" label="Vuelo" value={editableAwb.flightNumber}
                                                onChange={e => setEditableAwb({ ...editableAwb, flightNumber: e.target.value })}
                                                disabled={selectedDraft.status !== 'draft'}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <TextField fullWidth size="small" label="Origen (IATA)" value={editableAwb.origin}
                                                onChange={e => setEditableAwb({ ...editableAwb, origin: e.target.value.toUpperCase() })}
                                                disabled={selectedDraft.status !== 'draft'}
                                                InputProps={{ startAdornment: <TakeoffIcon sx={{ mr: 0.5, fontSize: 18, color: '#999' }} /> }}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <TextField fullWidth size="small" label="Destino (IATA)" value={editableAwb.destination}
                                                onChange={e => setEditableAwb({ ...editableAwb, destination: e.target.value.toUpperCase() })}
                                                disabled={selectedDraft.status !== 'draft'}
                                                InputProps={{ startAdornment: <LandIcon sx={{ mr: 0.5, fontSize: 18, color: '#999' }} /> }}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <TextField fullWidth size="small" label="Fecha Vuelo" type="date" value={editableAwb.flightDate}
                                                onChange={e => setEditableAwb({ ...editableAwb, flightDate: e.target.value })}
                                                disabled={selectedDraft.status !== 'draft'}
                                                InputLabelProps={{ shrink: true }}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 3 }}>
                                            <TextField fullWidth size="small" label="Piezas" type="number" value={editableAwb.pieces}
                                                onChange={e => setEditableAwb({ ...editableAwb, pieces: e.target.value })}
                                                disabled={selectedDraft.status !== 'draft'}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 3 }}>
                                            <TextField fullWidth size="small" label="Peso KG" type="number" value={editableAwb.grossWeightKg}
                                                onChange={e => setEditableAwb({ ...editableAwb, grossWeightKg: e.target.value })}
                                                disabled={selectedDraft.status !== 'draft'}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <TextField fullWidth size="small" label="Costo Total" type="number" value={editableAwb.totalCost}
                                                onChange={e => setEditableAwb({ ...editableAwb, totalCost: e.target.value })}
                                                disabled={selectedDraft.status !== 'draft'}
                                                InputProps={{ startAdornment: <Typography sx={{ mr: 0.5, color: '#999' }}>$</Typography> }}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <TextField fullWidth size="small" label="Moneda" value={editableAwb.totalCostCurrency}
                                                onChange={e => setEditableAwb({ ...editableAwb, totalCostCurrency: e.target.value.toUpperCase() })}
                                                disabled={selectedDraft.status !== 'draft'}
                                            />
                                        </Grid>
                                    </Grid>
                                </Grid>

                                {/* Right: Email Info + Documents */}
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <EmailIcon sx={{ color: AIR_COLOR }} /> Información del Correo
                                    </Typography>

                                    <Paper sx={{ p: 2, bgcolor: '#FAFAFA', borderRadius: 2, mb: 2 }}>
                                        <Typography variant="body2"><strong>De:</strong> {selectedDraft.from_email}</Typography>
                                        <Typography variant="body2"><strong>Asunto:</strong> {selectedDraft.subject}</Typography>
                                        <Typography variant="body2"><strong>Recibido:</strong> {formatDate(selectedDraft.created_at)}</Typography>
                                        <Box sx={{ mt: 1 }}>
                                            <Typography variant="body2" component="span"><strong>Confianza IA:</strong> </Typography>
                                            <Chip label={selectedDraft.confidence} size="small" color={confidenceColor(selectedDraft.confidence)} />
                                        </Box>
                                        {selectedDraft.reviewer_name && (
                                            <Typography variant="body2" sx={{ mt: 1 }}>
                                                <strong>Revisado por:</strong> {selectedDraft.reviewer_name} ({formatDate(selectedDraft.reviewed_at || '')})
                                            </Typography>
                                        )}
                                        {selectedDraft.rejection_reason && (
                                            <Alert severity="error" sx={{ mt: 1 }}>
                                                <strong>Motivo rechazo:</strong> {selectedDraft.rejection_reason}
                                            </Alert>
                                        )}
                                    </Paper>

                                    {/* Documents */}
                                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>📎 Documentos</Typography>
                                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                        {selectedDraft.awb_pdf_url && (
                                            <Button
                                                variant="outlined"
                                                startIcon={<PdfIcon />}
                                                onClick={() => viewAwbPdf(selectedDraft.id)}
                                                sx={{ textTransform: 'none', borderColor: AIR_COLOR, color: AIR_COLOR }}
                                            >
                                                Ver AWB PDF
                                            </Button>
                                        )}
                                        {selectedDraft.packing_list_excel_url && (
                                            <Button
                                                variant="outlined"
                                                startIcon={<ExcelIcon />}
                                                onClick={() => downloadExcel(selectedDraft.id)}
                                                sx={{ textTransform: 'none', borderColor: '#2E7D32', color: '#2E7D32' }}
                                            >
                                                Descargar Packing List
                                            </Button>
                                        )}
                                    </Box>

                                    {/* Missing fields alert */}
                                    {selectedDraft.status === 'draft' && !editableAwb.mawb && (
                                        <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
                                            <strong>Campos obligatorios faltantes:</strong>
                                            <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                                                {!editableAwb.mawb && <li>MAWB</li>}
                                            </ul>
                                        </Alert>
                                    )}
                                </Grid>
                            </Grid>
                        </Box>
                    ) : null}
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2, bgcolor: '#FAFAFA' }}>
                    <Button onClick={() => setDetailOpen(false)} sx={{ textTransform: 'none' }}>
                        Cerrar
                    </Button>
                    {selectedDraft?.status === 'draft' && (
                        <>
                            <Button
                                color="error"
                                onClick={() => setRejectOpen(true)}
                                sx={{ textTransform: 'none' }}
                            >
                                Rechazar
                            </Button>
                            <Button
                                variant="outlined"
                                startIcon={extracting ? <CircularProgress size={16} /> : <RefreshIcon />}
                                onClick={handleReextract}
                                disabled={!selectedDraft.awb_pdf_url || extracting}
                                sx={{ textTransform: 'none', borderColor: AIR_COLOR, color: AIR_COLOR }}
                            >
                                Extraer Datos
                            </Button>
                            <Tooltip title={
                                !editableAwb.mawb ? 'Falta el MAWB'
                                : duplicateApproved ? `🚫 El MAWB ${editableAwb.mawb} ya fue aprobado en otro borrador`
                                : guiaVueloMismatch ? `⚠️ La guía de vuelo del Excel (${guiaVueloExcel}) no coincide con el MAWB (${editableAwb.mawb})`
                                : ''
                            }>
                                <span>
                                    <Button
                                        variant="contained"
                                        startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
                                        onClick={handleApprove}
                                        disabled={processing || !editableAwb.mawb || guiaVueloMismatch || duplicateApproved}
                                        sx={{
                                            bgcolor: (guiaVueloMismatch || duplicateApproved) ? '#C62828' : '#2E7D32',
                                            '&:hover': { bgcolor: (guiaVueloMismatch || duplicateApproved) ? '#B71C1C' : '#1B5E20' },
                                            textTransform: 'none',
                                            fontWeight: 600,
                                            whiteSpace: 'nowrap',
                                            '&.Mui-disabled': (guiaVueloMismatch || duplicateApproved)
                                                ? { bgcolor: '#C62828 !important', color: '#FFFFFF !important', opacity: 1 }
                                                : {},
                                        }}
                                    >
                                        {duplicateApproved ? '🚫 MAWB ya aprobado' : guiaVueloMismatch ? '⚠️ Guía no coincide' : 'Aprobar y Registrar'}
                                    </Button>
                                </span>
                            </Tooltip>
                        </>
                    )}
                </DialogActions>
            </Dialog>

            {/* ====== REJECT DIALOG ====== */}
            <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ color: '#C62828' }}>Rechazar Borrador</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        multiline
                        rows={3}
                        label="Motivo del rechazo"
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        sx={{ mt: 1 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRejectOpen(false)} sx={{ textTransform: 'none' }}>Cancelar</Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={handleReject}
                        disabled={processing}
                        sx={{ textTransform: 'none' }}
                    >
                        {processing ? <CircularProgress size={20} /> : 'Rechazar'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ====== UPLOAD AWB DIALOG ====== */}
            <Dialog open={uploadOpen} onClose={() => !uploading && setUploadOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ bgcolor: AIR_COLOR, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <UploadIcon /> Subir AWB (Guía Aérea)
                </DialogTitle>
                <DialogContent sx={{ mt: 2 }}>
                    <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
                        Sube la guía aérea (AWB) y opcionalmente el Packing List en Excel. La IA extraerá los datos automáticamente.
                    </Alert>

                    {/* Ruta Aérea */}
                    <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel id="upload-route-label">Ruta Aérea *</InputLabel>
                        <Select
                            labelId="upload-route-label"
                            value={uploadRouteId}
                            label="Ruta Aérea *"
                            onChange={(e) => setUploadRouteId(e.target.value as number | '')}
                        >
                            <MenuItem value="">
                                <em>— Seleccionar ruta —</em>
                            </MenuItem>
                            {airRoutes.map((route) => (
                                <MenuItem key={route.id} value={route.id}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <FlightIcon sx={{ fontSize: 16, color: AIR_COLOR }} />
                                        <Typography fontWeight={600} sx={{ fontFamily: 'monospace' }}>{route.code}</Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {route.origin_airport} → {route.destination_airport}
                                        </Typography>
                                    </Box>
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    {/* Referencia */}
                    <TextField
                        label="Referencia"
                        value={uploadReference}
                        onChange={(e) => setUploadReference(e.target.value)}
                        fullWidth
                        sx={{ mb: 2 }}
                        placeholder="Ej: REF-2026-001 (opcional)"
                        helperText="Referencia interna opcional"
                        size="small"
                    />

                    {/* AWB PDF */}
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
                        📄 Guía Aérea (AWB) - PDF *
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
                        <input
                            ref={awbInputRef}
                            type="file"
                            accept=".pdf,image/*"
                            style={{ display: 'none' }}
                            onChange={e => setUploadAwbFile(e.target.files?.[0] || null)}
                        />
                        <Button variant="outlined" size="small" onClick={() => awbInputRef.current?.click()}
                            sx={{ textTransform: 'none' }}>
                            Seleccionar archivo
                        </Button>
                        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {uploadAwbFile?.name || 'Sin archivos seleccionados'}
                        </Typography>
                        {uploadAwbFile && (
                            <Chip
                                label={uploadAwbFile.name}
                                size="small"
                                onDelete={() => setUploadAwbFile(null)}
                                sx={{ bgcolor: AIR_BG, color: AIR_COLOR, maxWidth: 200 }}
                            />
                        )}
                    </Box>

                    {/* Packing List Excel */}
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
                        📊 Packing List - Excel (opcional)
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
                        <input
                            ref={excelInputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            style={{ display: 'none' }}
                            onChange={e => setUploadExcelFile(e.target.files?.[0] || null)}
                        />
                        <Button variant="outlined" size="small" onClick={() => excelInputRef.current?.click()}
                            sx={{ textTransform: 'none' }}>
                            Seleccionar archivo
                        </Button>
                        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {uploadExcelFile?.name || 'Sin archivos seleccionados'}
                        </Typography>
                        {uploadExcelFile && (
                            <Chip
                                label={uploadExcelFile.name}
                                size="small"
                                onDelete={() => setUploadExcelFile(null)}
                                sx={{ bgcolor: '#E8F5E9', color: '#2E7D32', maxWidth: 200 }}
                            />
                        )}
                    </Box>

                    {/* Validation chips */}
                    <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                        <Chip
                            icon={uploadRouteId ? <CheckCircleIcon /> : <WarningIcon />}
                            label={`Ruta: ${uploadRouteId ? airRoutes.find(r => r.id === uploadRouteId)?.code || '✓' : '✗'}`}
                            size="small"
                            color={uploadRouteId ? 'success' : 'default'}
                        />
                        <Chip
                            icon={uploadAwbFile ? <CheckCircleIcon /> : <WarningIcon />}
                            label={`AWB: ${uploadAwbFile ? '✓' : '✗'}`}
                            size="small"
                            color={uploadAwbFile ? 'success' : 'default'}
                        />
                        <Chip
                            icon={uploadExcelFile ? <CheckCircleIcon /> : undefined}
                            label={`Packing List: ${uploadExcelFile ? '✓' : 'opcional'}`}
                            size="small"
                            color={uploadExcelFile ? 'success' : 'default'}
                            variant="outlined"
                        />
                        {uploadReference && (
                            <Chip
                                label={`Ref: ${uploadReference}`}
                                size="small"
                                variant="outlined"
                            />
                        )}
                    </Box>

                    {/* Upload progress */}
                    {uploading && (
                        <Box sx={{ mt: 2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <CircularProgress size={16} sx={{ color: AIR_COLOR }} />
                                <Typography variant="body2" fontWeight={600}>
                                    Progreso: {uploadProgress.step} / {uploadProgress.total}
                                </Typography>
                            </Box>
                            <LinearProgress
                                variant="determinate"
                                value={(uploadProgress.step / uploadProgress.total) * 100}
                                sx={{ height: 8, borderRadius: 4, bgcolor: AIR_BG, '& .MuiLinearProgress-bar': { bgcolor: AIR_COLOR } }}
                            />
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                {uploadProgress.status}
                            </Typography>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setUploadOpen(false)} disabled={uploading} sx={{ textTransform: 'none' }}>
                        Cancelar
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <UploadIcon />}
                        onClick={handleUpload}
                        disabled={!uploadAwbFile || !uploadRouteId || uploading}
                        sx={{ bgcolor: AIR_COLOR, '&:hover': { bgcolor: '#C62828' }, textTransform: 'none', fontWeight: 600 }}
                    >
                        {uploading ? 'Procesando...' : 'Subir AWB'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ====== INSTRUCTIONS DIALOG ====== */}
            <Dialog open={instructionsOpen} onClose={() => setInstructionsOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>📋 Instrucciones - Correos Aéreos</DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mb: 2, borderRadius: 2, '& .MuiAlert-message': { width: '100%' } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Typography variant="body2"><strong>Correo destino:</strong></Typography>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                aereo@entregax.com
                            </Typography>
                            <IconButton size="small" onClick={() => {
                                navigator.clipboard.writeText('aereo@entregax.com');
                                setSnackbar({ open: true, message: 'Copiado', severity: 'info' });
                            }}>
                                <CopyIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Box>
                    </Alert>

                    <Typography variant="subtitle2" fontWeight={700}>📎 Archivos adjuntos requeridos:</Typography>
                    <ul>
                        <li><strong>Guía Aérea (AWB)</strong> - Archivo PDF</li>
                        <li><strong>Packing List</strong> - Archivo Excel (.xlsx o .xls)
                            <Typography variant="caption" display="block" color="text.secondary" sx={{ ml: 2 }}>
                                Columnas: Fecha, Guía AIR, Cliente, No. Caja, Peso, L/W/H, Volumen, Tipo, Observa, Guía de Vuelo
                            </Typography>
                        </li>
                    </ul>

                    <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }}>✈️ Datos extraídos del AWB:</Typography>
                    <ul>
                        <li>Shipper Name (Embarcador)</li>
                        <li>Consignee (Consignatario)</li>
                        <li>MAWB (Guía Aérea Master)</li>
                        <li>Origen → Destino (IATA)</li>
                        <li>Vuelo y Fecha</li>
                        <li>Piezas y Peso Bruto</li>
                        <li>Costo Total + Moneda</li>
                    </ul>

                    <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }}>📊 Datos extraídos del Excel:</Typography>
                    <ul>
                        <li>Detalle por paquete: Guía AIR, Cliente, Dimensiones, Peso, Volumen</li>
                        <li>Tipo de mercancía: L (Logo), G (Genérico), M (Medical)</li>
                        <li>Resumen: TOTAL, operadores (CAJO, JUAN C...), categorías (ZAPATOS...)</li>
                    </ul>

                    <Alert severity="warning" sx={{ mt: 2, borderRadius: 2 }}>
                        <strong>Importante:</strong> La guía de vuelo en el Excel (ej: 272-75669230) debe coincidir con el MAWB del AWB.
                    </Alert>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setInstructionsOpen(false)} sx={{ textTransform: 'none' }}>Cerrar</Button>
                </DialogActions>
            </Dialog>

            {/* ====== WHITELIST ADD DIALOG ====== */}
            <Dialog open={whitelistDialogOpen} onClose={() => setWhitelistDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Agregar Remitente</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        label="Patrón de email"
                        placeholder="@dominio.com"
                        value={newWhitelistPattern}
                        onChange={e => setNewWhitelistPattern(e.target.value)}
                        helperText="Ej: @sanky-logistics.cn o usuario@empresa.com"
                        sx={{ mt: 1, mb: 2 }}
                    />
                    <TextField
                        fullWidth
                        label="Descripción"
                        value={newWhitelistDesc}
                        onChange={e => setNewWhitelistDesc(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setWhitelistDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancelar</Button>
                    <Button variant="contained" onClick={addWhitelist} disabled={!newWhitelistPattern}
                        sx={{ bgcolor: AIR_COLOR, '&:hover': { bgcolor: '#C62828' }, textTransform: 'none' }}>
                        Agregar
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ====== SNACKBAR ====== */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert severity={snackbar.severity} variant="filled" sx={{ borderRadius: 2 }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
