// ============================================
// PANEL DE BORRADORES DE CORREOS MARÍTIMOS
// Revisión y aprobación de LOG/BL extraídos automáticamente
// ============================================

import { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
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
    Autocomplete,
    Divider,
    Snackbar,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Checkbox,
} from '@mui/material';
import {
    Check as CheckIcon,
    Close as CloseIcon,
    Visibility as ViewIcon,
    Email as EmailIcon,
    Description as DocIcon,
    Refresh as RefreshIcon,
    LocalShipping as ShipIcon,
    Person as PersonIcon,
    PictureAsPdf as PdfIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    Help as HelpIcon,
    ContentCopy as CopyIcon,
    CloudUpload as UploadIcon,
    DirectionsBoat as BoatIcon,
    Inventory as InventoryIcon,
    Warning as WarningIcon,
    CheckCircle as CheckCircleIcon,
    TableChart as ExcelIcon,
    Edit as EditIcon,
} from '@mui/icons-material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Draft {
    id: number;
    document_type: 'LOG' | 'BL' | 'LCL' | 'FCL';
    extracted_data: any;
    confidence: string;
    pdf_url: string;
    pdf_filename: string;
    telex_pdf_url?: string;
    telex_pdf_filename?: string;
    summary_excel_url?: string;
    summary_excel_filename?: string;
    detected_client_code: string | null;
    matched_user_id: number | null;
    matched_client_name: string | null;
    matched_box_id: string | null;
    status: 'draft' | 'approved' | 'rejected';
    from_email: string;
    subject: string;
    received_at: string;
    created_at: string;
}

interface WhitelistEntry {
    id: number;
    email_pattern: string;
    description: string;
    is_active: boolean;
    created_at: string;
}

interface Client {
    id: number;
    full_name: string;
    box_id: string;
    email: string;
}

interface LegacyClient {
    id: number;
    box_id: string;
    full_name: string;
    email: string;
}

interface EditableLog {
    log: string;
    clientCode: string;
    clientName: string;
    legacyClientId: number | null;
    tipo: 'Sensible' | 'Logotipo' | 'Genérico';
    hasBattery: boolean;
    hasLiquid: boolean;
    isPickup: boolean;
    boxes: number | null;
    weight: number | null;
    volume: number | null;
    description: string;
}

interface EditableBL {
    blNumber: string;
    soNumber: string;
    shipper: string;
    consignee: string;
    vesselName: string;
    voyageNumber: string;
    containerNumber: string;
    portOfLoading: string;
    portOfDischarge: string;
    packages: string;
    weightKg: string;
    volumeCbm: string;
    carrier: string;
    ladenOnBoard: string;
    weekNumber: string;
    referenceCode: string;
    eta: string;
}

export default function InboundEmailsPage() {
    const [drafts, setDrafts] = useState<Draft[]>([]);
    const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [tabValue, setTabValue] = useState(0);
    const [statusFilter, setStatusFilter] = useState<'draft' | 'approved' | 'rejected' | 'all'>('draft');
    
    // Dialog states
    const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
    const [clientSearchOpen, setClientSearchOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    
    // Whitelist dialog
    const [whitelistDialogOpen, setWhitelistDialogOpen] = useState(false);
    const [newPattern, setNewPattern] = useState('');
    const [newDescription, setNewDescription] = useState('');
    
    // Instructions dialog
    const [instructionsOpen, setInstructionsOpen] = useState(false);
    
    // Upload dialogs
    const [uploadFCLOpen, setUploadFCLOpen] = useState(false);
    const [uploadLCLOpen, setUploadLCLOpen] = useState(false);
    const [uploadLoading, setUploadLoading] = useState(false);
    
    // Upload progress state
    const [uploadProgress, setUploadProgress] = useState<{
        step: number;
        totalSteps: number;
        currentFile: string;
        status: 'idle' | 'uploading' | 'processing' | 'done' | 'error';
        message: string;
    }>({ step: 0, totalSteps: 4, currentFile: '', status: 'idle', message: '' });
    
    // Re-extract loading
    const [extracting, setExtracting] = useState(false);
    
    // Approving state (prevent double click)
    const [isApproving, setIsApproving] = useState(false);
    
    // FCL files
    const [fclBlFile, setFclBlFile] = useState<File | null>(null);
    const [fclTelexFile, setFclTelexFile] = useState<File | null>(null);
    const [fclPackingFile, setFclPackingFile] = useState<File | null>(null);
    const [fclSubject, setFclSubject] = useState('');
    
    // LCL files
    const [lclBlFile, setLclBlFile] = useState<File | null>(null);
    const [lclTelexFile, setLclTelexFile] = useState<File | null>(null);
    const [lclSummaryFile, setLclSummaryFile] = useState<File | null>(null);
    const [lclSubject, setLclSubject] = useState('');
    const [lclWeek, setLclWeek] = useState('');
    const [lclRouteId, setLclRouteId] = useState<number | ''>('');
    
    // FCL route
    const [fclRouteId, setFclRouteId] = useState<number | ''>('');
    
    // Maritime routes
    const [routes, setRoutes] = useState<{id: number; code: string; name: string; is_active: boolean}[]>([]);
    
    // Snackbar
    const [snackbar, setSnackbar] = useState<{
        open: boolean;
        message: string;
        severity: 'success' | 'error' | 'info' | 'warning';
    }>({ open: false, message: '', severity: 'success' });
    
    // Confirm dialog for whitelist delete
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [whitelistToDelete, setWhitelistToDelete] = useState<number | null>(null);

    // Stats
    const [stats, setStats] = useState<any>(null);
    
    // User role for conditional rendering
    const [userRole, setUserRole] = useState<string>('');
    
    // Estados para edición de datos extraídos
    const [editableLogs, setEditableLogs] = useState<EditableLog[]>([]);
    const [editableBL, setEditableBL] = useState<EditableBL | null>(null);
    const [_isEditing, setIsEditing] = useState(false);
    
    // Búsqueda de clientes legacy
    const [legacyClients, setLegacyClients] = useState<LegacyClient[]>([]);
    const [searchingClient, setSearchingClient] = useState(false);
    const [editingLogIndex, setEditingLogIndex] = useState<number | null>(null);
    const [_clientSearchInput, setClientSearchInput] = useState('');

    const token = localStorage.getItem('token');

    // Cargar drafts
    const loadDrafts = async (filter?: string) => {
        const currentFilter = filter ?? statusFilter;
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/admin/maritime/drafts?status=${currentFilter}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = res.ok ? await res.json() : [];
            setDrafts(Array.isArray(data) ? data : []);
        } catch {
            setDrafts([]);
        }
        setLoading(false);
    };

    // Solo cargar drafts cuando cambie el filtro
    useEffect(() => {
        loadDrafts(statusFilter);
    }, [statusFilter]);

    // Cargar rol del usuario
    useEffect(() => {
        const savedUser = localStorage.getItem('user');
        if (savedUser) {
            try {
                const user = JSON.parse(savedUser);
                setUserRole(user.role || '');
            } catch (e) {
                console.error('Error parsing user:', e);
            }
        }
    }, []);

    // Cargar otros datos una sola vez
    useEffect(() => {
        loadWhitelist();
        loadStats();
        loadRoutes();
    }, []);

    // Cargar rutas marítimas
    const loadRoutes = async () => {
        try {
            const res = await fetch(`${API_URL}/api/maritime-api/routes`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setRoutes(data.routes || []);
            }
        } catch (error) {
            console.error('Error loading routes:', error);
        }
    };

    const loadWhitelist = async () => {
        try {
            const res = await fetch(`${API_URL}/api/admin/email/whitelist`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setWhitelist(await res.json());
            }
            // Silently ignore 403 errors - user may not have permission to view whitelist
        } catch (error) {
            // Only log non-permission errors
            if (!(error instanceof Error && error.message.includes('403'))) {
                console.error('Error loading whitelist:', error);
            }
        }
    };

    const loadStats = async () => {
        try {
            const res = await fetch(`${API_URL}/api/admin/email/stats`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setStats(await res.json());
            }
            // Silently ignore 403 errors
        } catch (error) {
            if (!(error instanceof Error && error.message.includes('403'))) {
                console.error('Error loading stats:', error);
            }
        }
    };

    // Abrir PDF con autenticación (descarga como blob y abre en nueva pestaña)
    const openPdfWithAuth = async (draftId: number, pdfType: 'bl' | 'telex' = 'bl') => {
        try {
            const res = await fetch(`${API_URL}/api/admin/email/draft/${draftId}/pdf/${pdfType}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (!res.ok) {
                setSnackbar({ open: true, message: 'Error al cargar el PDF', severity: 'error' });
                return;
            }
            
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            
            // Liberar memoria después de un tiempo
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (error) {
            console.error('Error opening PDF:', error);
            setSnackbar({ open: true, message: 'Error al abrir el PDF', severity: 'error' });
        }
    };

    // Buscar clientes en legacy_clients
    const searchLegacyClients = async (search: string) => {
        if (!search || search.length < 2) {
            setLegacyClients([]);
            return;
        }
        setSearchingClient(true);
        try {
            const res = await fetch(`${API_URL}/api/legacy/clients?search=${encodeURIComponent(search)}&limit=10`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setLegacyClients(data.clients || []);
            }
        } catch (error) {
            console.error('Error searching legacy clients:', error);
        } finally {
            setSearchingClient(false);
        }
    };

    // Inicializar datos editables al abrir modal
    const initEditableData = (draft: Draft) => {
        console.log('🔄 initEditableData called with draft:', draft.id);
        console.log('🔄 extracted_data:', draft.extracted_data);
        console.log('🔄 has logs:', draft.extracted_data?.logs?.length);
        
        // Inicializar LOGs editables (resetear siempre)
        if (draft.extracted_data?.logs && draft.extracted_data.logs.length > 0) {
            console.log('🔄 Setting editableLogs with', draft.extracted_data.logs.length, 'logs');
            setEditableLogs(draft.extracted_data.logs.map((log: any) => ({
                log: log.log || '',
                clientCode: log.clientCode || '',
                clientName: log.clientName || '',
                legacyClientId: log.legacyClientId || null,
                tipo: log.tipo || 'Genérico',
                hasBattery: log.hasBattery || false,
                hasLiquid: log.hasLiquid || false,
                isPickup: log.isPickup || false,
                boxes: log.boxes || null,
                weight: log.weight || null,
                volume: log.volume || null,
                description: log.description || ''
            })));
        } else {
            console.log('🔄 No logs found, resetting editableLogs');
            setEditableLogs([]);
        }
        
        // Inicializar BL editable
        const ed = draft.extracted_data || {};
        setEditableBL({
            blNumber: ed.blNumber || '',
            soNumber: ed.soNumber || '',
            shipper: ed.shipper || '',
            consignee: ed.consignee || '',
            vesselName: ed.vesselName || '',
            voyageNumber: ed.voyageNumber || '',
            containerNumber: ed.containerNumber || ed.marksAndNumbers || '',
            portOfLoading: ed.portOfLoading || ed.pol || '',
            portOfDischarge: ed.portOfDischarge || ed.pod || '',
            packages: ed.packages || '',
            weightKg: ed.weightKg || '',
            volumeCbm: ed.volumeCbm || '',
            carrier: ed.carrier || '',
            ladenOnBoard: ed.ladenOnBoard || '',
            weekNumber: ed.week_number || '',
            referenceCode: ed.reference_code || '',
            eta: ed.eta || ''
        });
        
        setIsEditing(false);
    };

    // Actualizar un LOG específico
    const updateLog = (index: number, field: keyof EditableLog, value: any) => {
        setEditableLogs(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    // Cambiar cliente de un LOG
    const handleClientChange = (index: number, client: LegacyClient | null) => {
        if (client) {
            setEditableLogs(prev => {
                const updated = [...prev];
                updated[index] = {
                    ...updated[index],
                    legacyClientId: client.id,
                    clientName: client.full_name,
                    clientCode: client.box_id
                };
                return updated;
            });
        }
        setEditingLogIndex(null);
        setClientSearchInput('');
        setLegacyClients([]);
    };

    // Abrir modal con datos editables
    const openDraftDetail = (draft: Draft) => {
        setSelectedDraft(draft);
        initEditableData(draft);
        setDetailOpen(true);
    };

    // Re-extraer datos del BL usando IA
    const handleReExtract = async () => {
        if (!selectedDraft) return;
        setExtracting(true);
        try {
            const res = await fetch(`${API_URL}/api/admin/email/draft/${selectedDraft.id}/reextract`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                console.log('🔄 Re-extracción respuesta:', data);
                setSelectedDraft(data.draft);
                // Re-inicializar los campos editables con los nuevos datos extraídos
                initEditableData(data.draft);
                
                // Mostrar mensaje según si hubo error en BL
                if (data.blExtractionError) {
                    setSnackbar({ 
                        open: true, 
                        message: `⚠️ LOGs extraídos, pero BL falló: ${data.blExtractionError}`, 
                        severity: 'warning' 
                    });
                } else {
                    setSnackbar({ open: true, message: 'Datos extraídos exitosamente', severity: 'success' });
                }
                loadDrafts();
            } else {
                const error = await res.json();
                setSnackbar({ open: true, message: error.error || 'Error al extraer datos', severity: 'error' });
            }
        } catch (error) {
            console.error('Error re-extracting:', error);
            setSnackbar({ open: true, message: 'Error al extraer datos del BL', severity: 'error' });
        } finally {
            setExtracting(false);
        }
    };

    // Aprobar borrador (usa datos editados)
    const handleApprove = async (draft: Draft) => {
        // Prevenir doble clic
        if (isApproving) return;
        
        // Validar campos críticos para LCL/FCL antes de aprobar
        if (draft.document_type === 'LCL' || draft.document_type === 'FCL' || draft.document_type === 'BL') {
            const packages = editableBL?.packages;
            const weight = editableBL?.weightKg;
            const volume = editableBL?.volumeCbm;
            
            const missingFields: string[] = [];
            if (!packages || packages === '0' || packages === '') missingFields.push('Packages');
            if (!weight || weight === '0' || weight === '') missingFields.push('Peso (KGS)');
            if (!volume || volume === '0' || volume === '') missingFields.push('Volumen (CBM)');
            
            if (missingFields.length > 0) {
                setSnackbar({ 
                    open: true, 
                    message: `⚠️ Campos requeridos vacíos: ${missingFields.join(', ')}. Por favor completa manualmente antes de aprobar.`, 
                    severity: 'warning' 
                });
                return;
            }
        }

        setIsApproving(true);
        try {
            const savedUser = localStorage.getItem('user');
            const userId = savedUser ? JSON.parse(savedUser).id : null;

            // Preparar datos editados para enviar
            const editedData = {
                logs: editableLogs,
                bl: editableBL
            };

            const res = await fetch(`${API_URL}/api/admin/maritime/drafts/${draft.id}/approve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ userId, editedData })
            });

            if (res.ok) {
                setSnackbar({ open: true, message: `${draft.document_type} aprobado y registrado exitosamente`, severity: 'success' });
                setDetailOpen(false);
                loadDrafts();
                loadStats();
            } else {
                const error = await res.json();
                // Mensaje específico para contenedor duplicado
                if (error.duplicateContainer) {
                    setSnackbar({ 
                        open: true, 
                        message: `⚠️ ${error.error}. ${error.details || 'El contenedor ya fue registrado previamente.'}`, 
                        severity: 'error' 
                    });
                } else {
                    setSnackbar({ open: true, message: error.error || 'Error al aprobar', severity: 'error' });
                }
            }
        } catch (error) {
            console.error('Error approving draft:', error);
            setSnackbar({ open: true, message: 'Error al aprobar el borrador', severity: 'error' });
        } finally {
            setIsApproving(false);
        }
    };

    // Rechazar borrador
    const handleReject = async () => {
        if (!selectedDraft) return;
        try {
            const savedUser = localStorage.getItem('user');
            const userId = savedUser ? JSON.parse(savedUser).id : null;

            const res = await fetch(`${API_URL}/api/admin/maritime/drafts/${selectedDraft.id}/reject`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ reason: rejectReason, userId })
            });

            if (res.ok) {
                setSnackbar({ open: true, message: 'Borrador rechazado correctamente', severity: 'warning' });
                setRejectDialogOpen(false);
                setDetailOpen(false);
                setRejectReason('');
                loadDrafts();
            } else {
                setSnackbar({ open: true, message: 'Error al rechazar borrador', severity: 'error' });
            }
        } catch (error) {
            console.error('Error rejecting draft:', error);
            setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
        }
    };

    // Asignar cliente legacy
    const handleAssignClient = async () => {
        if (!selectedDraft || !selectedClient) return;
        try {
            const res = await fetch(`${API_URL}/api/admin/maritime/drafts/${selectedDraft.id}/match-client`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ legacyClientId: selectedClient.id })
            });

            if (res.ok) {
                setSnackbar({ open: true, message: 'Cliente asignado correctamente', severity: 'success' });
                setClientSearchOpen(false);
                setSelectedClient(null);
                // Recargar el draft actual para mostrar el cliente asignado
                const detailRes = await fetch(`${API_URL}/api/admin/maritime/drafts/${selectedDraft.id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (detailRes.ok) {
                    const updatedDraft = await detailRes.json();
                    setSelectedDraft(updatedDraft);
                }
                loadDrafts();
            } else {
                const error = await res.json();
                setSnackbar({ open: true, message: error.error || 'Error al asignar cliente', severity: 'error' });
            }
        } catch (error) {
            console.error('Error assigning client:', error);
            setSnackbar({ open: true, message: 'Error al asignar cliente', severity: 'error' });
        }
    };

    // Agregar a whitelist
    const handleAddWhitelist = async () => {
        try {
            const res = await fetch(`${API_URL}/api/admin/email/whitelist`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ emailPattern: newPattern, description: newDescription })
            });

            if (res.ok) {
                setSnackbar({ open: true, message: 'Patrón agregado a whitelist', severity: 'success' });
                setWhitelistDialogOpen(false);
                setNewPattern('');
                setNewDescription('');
                loadWhitelist();
            } else {
                const error = await res.json();
                setSnackbar({ open: true, message: error.error || 'Error al agregar patrón', severity: 'error' });
            }
        } catch (error) {
            console.error('Error adding to whitelist:', error);
        }
    };

    // Eliminar de whitelist
    const handleRemoveWhitelist = async (id: number) => {
        setWhitelistToDelete(id);
        setDeleteConfirmOpen(true);
    };
    
    const confirmDeleteWhitelist = async () => {
        if (!whitelistToDelete) return;
        try {
            await fetch(`${API_URL}/api/admin/email/whitelist/${whitelistToDelete}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            setSnackbar({ open: true, message: 'Patrón eliminado de whitelist', severity: 'success' });
            loadWhitelist();
        } catch (error) {
            console.error('Error removing from whitelist:', error);
            setSnackbar({ open: true, message: 'Error al eliminar patrón', severity: 'error' });
        } finally {
            setDeleteConfirmOpen(false);
            setWhitelistToDelete(null);
        }
    };

    const getConfidenceColor = (confidence: string) => {
        switch (confidence) {
            case 'high': return 'success';
            case 'medium': return 'warning';
            case 'low': return 'error';
            default: return 'default';
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('es-MX', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h4" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <EmailIcon color="primary" />
                        Correos Entrantes - Marítimo
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Revisión de LOG y BL extraídos automáticamente de correos
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                        variant="contained"
                        color="primary"
                        startIcon={<BoatIcon />}
                        onClick={() => setUploadFCLOpen(true)}
                    >
                        Subir FCL
                    </Button>
                    <Button
                        variant="contained"
                        color="secondary"
                        startIcon={<InventoryIcon />}
                        onClick={() => {
                            loadRoutes();
                            setUploadLCLOpen(true);
                        }}
                    >
                        Subir LCL
                    </Button>
                    <Button
                        variant="outlined"
                        color="info"
                        startIcon={<HelpIcon />}
                        onClick={() => setInstructionsOpen(true)}
                    >
                        Instrucciones
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={() => { loadDrafts(); loadStats(); }}
                    >
                        Actualizar
                    </Button>
                </Box>
            </Box>

            {/* Tabs */}
            <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ mb: 2 }}>
                <Tab label="📥 Borradores" />
                <Tab label="✉️ Whitelist" />
            </Tabs>

            {/* Tab 0: Borradores */}
            {tabValue === 0 && (
                <>
                    {/* Filtros - Solo super_admin ve todos los filtros */}
                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        {(userRole === 'super_admin' 
                            ? ['draft', 'approved', 'rejected', 'all'] 
                            : ['draft']
                        ).map(s => (
                            <Chip
                                key={s}
                                label={s === 'draft' ? 'Pendientes' : s === 'approved' ? 'Aprobados' : s === 'rejected' ? 'Rechazados' : 'Todos'}
                                color={statusFilter === s ? 'primary' : 'default'}
                                onClick={() => setStatusFilter(s as typeof statusFilter)}
                            />
                        ))}
                    </Box>

                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <CircularProgress />
                        </Box>
                    ) : drafts.length === 0 ? (
                        <Alert severity="info">No hay borradores {statusFilter !== 'all' ? statusFilter : ''}</Alert>
                    ) : (
                        <TableContainer component={Paper}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                                        <TableCell>Tipo</TableCell>
                                        <TableCell>Referencia / BL</TableCell>
                                        <TableCell>Cliente</TableCell>
                                        <TableCell>De</TableCell>
                                        <TableCell>Recibido</TableCell>
                                        <TableCell>Confianza</TableCell>
                                        <TableCell>Estado</TableCell>
                                        <TableCell align="center">Acciones</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {drafts.map(draft => (
                                        <TableRow key={draft.id} hover>
                                            <TableCell>
                                                <Chip
                                                    icon={draft.document_type === 'LOG' ? <DocIcon /> : <ShipIcon />}
                                                    label={draft.document_type}
                                                    size="small"
                                                    color={draft.document_type === 'LOG' ? 'info' : 'warning'}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="bold">
                                                    {draft.extracted_data?.logNumber || draft.extracted_data?.blNumber || '-'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                {draft.matched_client_name ? (
                                                    <Box>
                                                        <Typography variant="body2">{draft.matched_client_name}</Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {draft.matched_box_id}
                                                        </Typography>
                                                    </Box>
                                                ) : draft.document_type === 'LOG' ? (
                                                    <Chip
                                                        label="Múltiples clientes"
                                                        size="small"
                                                        color="info"
                                                        icon={<ShipIcon sx={{ fontSize: 14 }} />}
                                                    />
                                                ) : (
                                                    <Chip
                                                        label={draft.detected_client_code || 'Sin asignar'}
                                                        size="small"
                                                        color={draft.detected_client_code ? 'warning' : 'default'}
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="caption">{draft.from_email}</Typography>
                                            </TableCell>
                                            <TableCell>{formatDate(draft.received_at || draft.created_at)}</TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={draft.confidence}
                                                    size="small"
                                                    color={getConfidenceColor(draft.confidence) as any}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={draft.status}
                                                    size="small"
                                                    color={draft.status === 'approved' ? 'success' : draft.status === 'rejected' ? 'error' : 'warning'}
                                                />
                                            </TableCell>
                                            <TableCell align="center">
                                                <Tooltip title="Ver detalle">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => openDraftDetail(draft)}
                                                    >
                                                        <ViewIcon />
                                                    </IconButton>
                                                </Tooltip>
                                                {draft.status === 'draft' && (
                                                    <>
                                                        <Tooltip title="Aprobar">
                                                            <IconButton
                                                                size="small"
                                                                color="success"
                                                                onClick={() => handleApprove(draft)}
                                                            >
                                                                <CheckIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Rechazar">
                                                            <IconButton
                                                                size="small"
                                                                color="error"
                                                                onClick={() => { setSelectedDraft(draft); setRejectDialogOpen(true); }}
                                                            >
                                                                <CloseIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </>
            )}

            {/* Tab 1: Whitelist */}
            {tabValue === 1 && (
                <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="h6">Remitentes Autorizados</Typography>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => setWhitelistDialogOpen(true)}
                        >
                            Agregar
                        </Button>
                    </Box>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        Solo los correos que coincidan con estos patrones serán procesados automáticamente.
                    </Alert>
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'grey.100' }}>
                                    <TableCell>Patrón de Email</TableCell>
                                    <TableCell>Descripción</TableCell>
                                    <TableCell>Fecha</TableCell>
                                    <TableCell align="center">Acciones</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {whitelist.map(entry => (
                                    <TableRow key={entry.id}>
                                        <TableCell>
                                            <Typography fontFamily="monospace">{entry.email_pattern}</Typography>
                                        </TableCell>
                                        <TableCell>{entry.description}</TableCell>
                                        <TableCell>{formatDate(entry.created_at)}</TableCell>
                                        <TableCell align="center">
                                            <IconButton
                                                color="error"
                                                onClick={() => handleRemoveWhitelist(entry.id)}
                                            >
                                                <DeleteIcon />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            )}

            {/* Dialog: Detalle del Borrador */}
            <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="lg" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {selectedDraft?.document_type === 'LOG' ? <DocIcon color="info" /> : <ShipIcon color="warning" />}
                        Detalle {selectedDraft?.document_type}
                        <Chip label={selectedDraft?.status} size="small" color={selectedDraft?.status === 'draft' ? 'warning' : selectedDraft?.status === 'approved' ? 'success' : 'error'} />
                    </Box>
                </DialogTitle>
                <DialogContent dividers>
                    {selectedDraft && (
                        <Grid container spacing={2}>
                            {/* Sección de LOGs para LOG, LCL y FCL */}
                            {(selectedDraft.document_type === 'LOG' || selectedDraft.document_type === 'LCL' || selectedDraft.document_type === 'FCL') && selectedDraft.extracted_data?.logs?.length > 0 && (
                                <Grid size={{ xs: 12 }}>
                                    <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                                        📦 LOGs Detectados ({selectedDraft.extracted_data.logs.length})
                                    </Typography>
                                    
                                    {/* Resumen */}
                                    {selectedDraft.extracted_data.summary && (
                                        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                                            <Chip 
                                                label={`${selectedDraft.extracted_data.summary.byType?.generico || 0} Genérico`} 
                                                color="success" 
                                                variant="outlined"
                                            />
                                            <Chip 
                                                label={`${selectedDraft.extracted_data.summary.byType?.sensible || 0} Sensible`} 
                                                color="default" 
                                                variant="outlined"
                                            />
                                            <Chip 
                                                label={`${selectedDraft.extracted_data.summary.byType?.logotipo || 0} Logotipo`} 
                                                color="primary" 
                                                variant="outlined"
                                            />
                                            {selectedDraft.extracted_data.summary.withBattery > 0 && (
                                                <Chip label={`🔋 ${selectedDraft.extracted_data.summary.withBattery} con Batería`} color="success" size="small" />
                                            )}
                                            {selectedDraft.extracted_data.summary.withLiquid > 0 && (
                                                <Chip label={`💧 ${selectedDraft.extracted_data.summary.withLiquid} con Líquido`} color="info" size="small" />
                                            )}
                                            {selectedDraft.extracted_data.summary.forPickup > 0 && (
                                                <Chip label={`🚚 ${selectedDraft.extracted_data.summary.forPickup} Pick Up`} color="success" size="small" />
                                            )}
                                        </Box>
                                    )}
                                    
                                    {/* Resumen de clientes vinculados */}
                                    {selectedDraft.extracted_data.logs && (
                                        <Alert 
                                            severity={selectedDraft.extracted_data.logs.filter((l: any) => l.legacyClientId).length === selectedDraft.extracted_data.logs.length ? 'success' : 'info'}
                                            sx={{ mb: 2 }}
                                            icon={<CheckCircleIcon />}
                                        >
                                            <strong>
                                                {selectedDraft.extracted_data.logs.filter((l: any) => l.legacyClientId).length} de {selectedDraft.extracted_data.logs.length}
                                            </strong> clientes vinculados a Legacy. 
                                            {selectedDraft.extracted_data.logs.filter((l: any) => !l.legacyClientId).length > 0 && (
                                                <Typography variant="caption" sx={{ ml: 1 }}>
                                                    ({selectedDraft.extracted_data.logs.filter((l: any) => !l.legacyClientId).length} pendientes de encontrar)
                                                </Typography>
                                            )}
                                        </Alert>
                                    )}
                                    
                                    {/* Tabla de LOGs - EDITABLE */}
                                    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 350 }}>
                                        <Table size="small" stickyHeader>
                                            <TableHead>
                                                <TableRow sx={{ bgcolor: 'grey.100' }}>
                                                    <TableCell><strong>LOG</strong></TableCell>
                                                    <TableCell sx={{ minWidth: 200 }}><strong>Cliente</strong></TableCell>
                                                    <TableCell sx={{ minWidth: 120 }}><strong>Tipo</strong></TableCell>
                                                    <TableCell align="center"><strong>🔋</strong></TableCell>
                                                    <TableCell align="center"><strong>💧</strong></TableCell>
                                                    <TableCell align="center"><strong>🚚</strong></TableCell>
                                                    <TableCell align="right"><strong>Cajas</strong></TableCell>
                                                    <TableCell align="right"><strong>Peso</strong></TableCell>
                                                    <TableCell align="right"><strong>CBM</strong></TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {editableLogs.map((log, idx) => (
                                                    <TableRow key={idx} hover sx={{ bgcolor: log.legacyClientId ? 'success.50' : 'inherit' }}>
                                                        <TableCell>
                                                            <Typography variant="body2" fontFamily="monospace" fontWeight="bold">
                                                                {log.log}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell>
                                                            {editingLogIndex === idx ? (
                                                                <Autocomplete
                                                                    size="small"
                                                                    options={legacyClients}
                                                                    loading={searchingClient}
                                                                    getOptionLabel={(option) => `${option.full_name} (${option.box_id})`}
                                                                    onInputChange={(_, value) => {
                                                                        setClientSearchInput(value);
                                                                        searchLegacyClients(value);
                                                                    }}
                                                                    onChange={(_, value) => handleClientChange(idx, value)}
                                                                    onBlur={() => {
                                                                        setTimeout(() => setEditingLogIndex(null), 200);
                                                                    }}
                                                                    renderInput={(params) => (
                                                                        <TextField
                                                                            {...params}
                                                                            placeholder="Buscar cliente..."
                                                                            autoFocus
                                                                            size="small"
                                                                        />
                                                                    )}
                                                                    sx={{ minWidth: 180 }}
                                                                />
                                                            ) : (
                                                                <Box 
                                                                    sx={{ 
                                                                        display: 'flex', 
                                                                        alignItems: 'center', 
                                                                        gap: 0.5,
                                                                        cursor: 'pointer',
                                                                        '&:hover': { bgcolor: 'action.hover', borderRadius: 1 },
                                                                        p: 0.5
                                                                    }}
                                                                    onClick={() => setEditingLogIndex(idx)}
                                                                >
                                                                    {log.legacyClientId ? (
                                                                        <>
                                                                            <CheckIcon fontSize="small" color="success" />
                                                                            <Box>
                                                                                <Typography variant="body2" fontWeight="medium">{log.clientName}</Typography>
                                                                                <Typography variant="caption" color="text.secondary">{log.clientCode}</Typography>
                                                                            </Box>
                                                                        </>
                                                                    ) : log.clientCode ? (
                                                                        <>
                                                                            <WarningIcon fontSize="small" color="warning" />
                                                                            <Typography variant="body2" color="text.secondary">
                                                                                {log.clientCode}
                                                                            </Typography>
                                                                        </>
                                                                    ) : (
                                                                        <Typography variant="body2" color="text.secondary">Click para asignar</Typography>
                                                                    )}
                                                                    <EditIcon fontSize="small" sx={{ ml: 'auto', opacity: 0.5 }} />
                                                                </Box>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Select
                                                                size="small"
                                                                value={log.tipo}
                                                                onChange={(e) => updateLog(idx, 'tipo', e.target.value)}
                                                                sx={{ minWidth: 100 }}
                                                            >
                                                                <MenuItem value="Genérico">
                                                                    <Chip label="Genérico" size="small" color="success" />
                                                                </MenuItem>
                                                                <MenuItem value="Logotipo">
                                                                    <Chip label="Logotipo" size="small" color="primary" />
                                                                </MenuItem>
                                                                <MenuItem value="Sensible">
                                                                    <Chip label="Sensible" size="small" color="default" />
                                                                </MenuItem>
                                                            </Select>
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <Checkbox
                                                                checked={log.hasBattery}
                                                                onChange={(e) => updateLog(idx, 'hasBattery', e.target.checked)}
                                                                size="small"
                                                            />
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <Checkbox
                                                                checked={log.hasLiquid}
                                                                onChange={(e) => updateLog(idx, 'hasLiquid', e.target.checked)}
                                                                size="small"
                                                            />
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <Checkbox
                                                                checked={log.isPickup}
                                                                onChange={(e) => updateLog(idx, 'isPickup', e.target.checked)}
                                                                size="small"
                                                            />
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            {log.boxes || '—'}
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            {log.weight ? `${log.weight} kg` : '—'}
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            {log.volume ? log.volume.toFixed(2) : '—'}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </Grid>
                            )}
                            
                            {/* Datos del BL - EDITABLE */}
                            <Grid size={{ xs: 12, md: 6 }}>
                                <Typography variant="subtitle2" color="text.secondary">
                                    Datos del Bill of Lading (BL)
                                </Typography>
                                <Paper variant="outlined" sx={{ p: 2, mt: 1 }}>
                                    {editableBL && (
                                    <Grid container spacing={1.5}>
                                        <Grid size={{ xs: 12 }}>
                                            <TextField
                                                label="B/L No."
                                                size="small"
                                                fullWidth
                                                value={editableBL.blNumber}
                                                onChange={(e) => setEditableBL({...editableBL, blNumber: e.target.value})}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 12 }}>
                                            <TextField
                                                label="Shipper (Embarcador)"
                                                size="small"
                                                fullWidth
                                                multiline
                                                rows={2}
                                                value={editableBL.shipper}
                                                onChange={(e) => setEditableBL({...editableBL, shipper: e.target.value})}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 12 }}>
                                            <TextField
                                                label="Consignee (Consignatario)"
                                                size="small"
                                                fullWidth
                                                multiline
                                                rows={2}
                                                value={editableBL.consignee}
                                                onChange={(e) => setEditableBL({...editableBL, consignee: e.target.value})}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <TextField
                                                label="Carrier / Naviera"
                                                size="small"
                                                fullWidth
                                                value={editableBL.carrier}
                                                onChange={(e) => setEditableBL({...editableBL, carrier: e.target.value})}
                                                placeholder="Ej: WAN HAI, COSCO, MSC..."
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <TextField
                                                label="Fecha Embarque"
                                                size="small"
                                                fullWidth
                                                type="date"
                                                value={editableBL.ladenOnBoard}
                                                onChange={(e) => setEditableBL({...editableBL, ladenOnBoard: e.target.value})}
                                                InputLabelProps={{ shrink: true }}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <TextField
                                                label="Vessel"
                                                size="small"
                                                fullWidth
                                                value={editableBL.vesselName}
                                                onChange={(e) => setEditableBL({...editableBL, vesselName: e.target.value})}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <TextField
                                                label="Voyage"
                                                size="small"
                                                fullWidth
                                                value={editableBL.voyageNumber}
                                                onChange={(e) => setEditableBL({...editableBL, voyageNumber: e.target.value})}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 12 }}>
                                            <TextField
                                                label="Container Number"
                                                size="small"
                                                fullWidth
                                                value={editableBL.containerNumber}
                                                onChange={(e) => setEditableBL({...editableBL, containerNumber: e.target.value})}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <TextField
                                                label="Puerto Carga (POL)"
                                                size="small"
                                                fullWidth
                                                value={editableBL.portOfLoading}
                                                onChange={(e) => setEditableBL({...editableBL, portOfLoading: e.target.value})}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <TextField
                                                label="Puerto Descarga (POD)"
                                                size="small"
                                                fullWidth
                                                value={editableBL.portOfDischarge}
                                                onChange={(e) => setEditableBL({...editableBL, portOfDischarge: e.target.value})}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 4 }}>
                                            <TextField
                                                label="Packages"
                                                size="small"
                                                fullWidth
                                                value={editableBL.packages}
                                                onChange={(e) => setEditableBL({...editableBL, packages: e.target.value})}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 4 }}>
                                            <TextField
                                                label="Peso (KGS)"
                                                size="small"
                                                fullWidth
                                                value={editableBL.weightKg}
                                                onChange={(e) => setEditableBL({...editableBL, weightKg: e.target.value})}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 4 }}>
                                            <TextField
                                                label="Volumen (CBM)"
                                                size="small"
                                                fullWidth
                                                value={editableBL.volumeCbm}
                                                onChange={(e) => setEditableBL({...editableBL, volumeCbm: e.target.value})}
                                            />
                                        </Grid>
                                    </Grid>
                                    )}
                                </Paper>
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                                <Typography variant="subtitle2" color="text.secondary">Información del Correo</Typography>
                                <Paper variant="outlined" sx={{ p: 2, mt: 1 }}>
                                    <Typography variant="body2"><strong>De:</strong> {selectedDraft.from_email}</Typography>
                                    <Typography variant="body2"><strong>Asunto:</strong> {selectedDraft.subject}</Typography>
                                    <Typography variant="body2"><strong>Recibido:</strong> {formatDate(selectedDraft.received_at || selectedDraft.created_at)}</Typography>
                                    <Divider sx={{ my: 1 }} />
                                    <Typography variant="body2">
                                        <strong>Confianza IA:</strong>{' '}
                                        <Chip label={selectedDraft.confidence} size="small" color={getConfidenceColor(selectedDraft.confidence) as any} />
                                    </Typography>
                                </Paper>

                                {/* Datos extraídos del correo */}
                                <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>Datos Extraídos del Correo</Typography>
                                <Paper variant="outlined" sx={{ p: 2, mt: 1, bgcolor: '#E8F5E9' }}>
                                    <Grid container spacing={2}>
                                        {/* Week solo para LCL/LOG, no para FCL/BL */}
                                        {selectedDraft.document_type !== 'BL' && selectedDraft.document_type !== 'FCL' && (
                                            <Grid size={{ xs: 4 }}>
                                                <TextField
                                                    label="Week"
                                                    size="small"
                                                    fullWidth
                                                    placeholder="Week 1.1"
                                                    value={editableBL?.weekNumber || ''}
                                                    onChange={(e) => editableBL && setEditableBL({...editableBL, weekNumber: e.target.value})}
                                                    slotProps={{
                                                        input: {
                                                            sx: { fontWeight: 600, color: '#2E7D32' }
                                                        }
                                                    }}
                                                />
                                            </Grid>
                                        )}
                                        <Grid size={{ xs: (selectedDraft.document_type === 'BL' || selectedDraft.document_type === 'FCL') ? 6 : 4 }}>
                                            <TextField
                                                label="Referencia (AAA00-0000)"
                                                size="small"
                                                fullWidth
                                                placeholder="JSM26-0030"
                                                value={editableBL?.referenceCode || ''}
                                                onChange={(e) => editableBL && setEditableBL({...editableBL, referenceCode: e.target.value.toUpperCase()})}
                                                slotProps={{
                                                    input: {
                                                        sx: { fontWeight: 600, fontFamily: 'monospace', color: '#1565C0' }
                                                    }
                                                }}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: (selectedDraft.document_type === 'BL' || selectedDraft.document_type === 'FCL') ? 6 : 4 }}>
                                            <TextField
                                                label="ETA"
                                                size="small"
                                                fullWidth
                                                type="date"
                                                value={editableBL?.eta || ''}
                                                onChange={(e) => editableBL && setEditableBL({...editableBL, eta: e.target.value})}
                                                slotProps={{
                                                    inputLabel: { shrink: true },
                                                    input: {
                                                        sx: { fontWeight: 600, color: '#E65100' }
                                                    }
                                                }}
                                            />
                                        </Grid>
                                    </Grid>
                                </Paper>

                                {/* Cliente Asignado - Solo para FCL/BL, no para LOG/LCL que tiene múltiples clientes */}
                                {selectedDraft.document_type !== 'LOG' && selectedDraft.document_type !== 'LCL' && (
                                    <>
                                        <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>Cliente Asignado</Typography>
                                        <Paper variant="outlined" sx={{ p: 2, mt: 1 }}>
                                            {selectedDraft.matched_client_name ? (
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <PersonIcon color="success" />
                                                    <Box>
                                                        <Typography>{selectedDraft.matched_client_name}</Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {selectedDraft.matched_box_id}
                                                        </Typography>
                                                    </Box>
                                                </Box>
                                            ) : (
                                                <Box>
                                                    <Alert severity="warning" sx={{ mb: 1 }}>
                                                        Cliente no identificado. Código detectado: {selectedDraft.detected_client_code || 'N/A'}
                                                    </Alert>
                                                    {selectedDraft.status === 'draft' && (
                                                        <Button
                                                            variant="outlined"
                                                            size="small"
                                                            startIcon={<PersonIcon />}
                                                            onClick={() => setClientSearchOpen(true)}
                                                        >
                                                            Asignar Cliente
                                                        </Button>
                                                    )}
                                                </Box>
                                            )}
                                        </Paper>
                                    </>
                                )}
                            </Grid>
                            
                            {/* Botones de documentos */}
                            <Grid size={{ xs: 12 }}>
                                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                    {selectedDraft.pdf_url && (
                                        <Button
                                            variant="outlined"
                                            startIcon={<PdfIcon />}
                                            onClick={() => openPdfWithAuth(selectedDraft.id, 'bl')}
                                        >
                                            Ver BL ({selectedDraft.pdf_filename})
                                        </Button>
                                    )}
                                    {selectedDraft.telex_pdf_url && (
                                        <Button
                                            variant="outlined"
                                            color="secondary"
                                            startIcon={<PdfIcon />}
                                            onClick={() => openPdfWithAuth(selectedDraft.id, 'telex')}
                                        >
                                            Ver TELEX ({selectedDraft.telex_pdf_filename})
                                        </Button>
                                    )}
                                    {(selectedDraft.summary_excel_url || selectedDraft.extracted_data?.summary_excel_url) && (
                                        <Button
                                            variant="outlined"
                                            color="success"
                                            startIcon={<ExcelIcon />}
                                            onClick={() => {
                                                const token = localStorage.getItem('token');
                                                window.open(
                                                    `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/admin/email/draft/${selectedDraft.id}/excel?token=${token}`,
                                                    '_blank'
                                                );
                                            }}
                                        >
                                            Descargar SUMMARY ({selectedDraft.summary_excel_filename || selectedDraft.extracted_data?.summary_excel_filename})
                                        </Button>
                                    )}
                                </Box>
                            </Grid>
                            
                            {/* Alerta de campos obligatorios faltantes */}
                            {(selectedDraft.document_type === 'FCL' || selectedDraft.document_type === 'BL' || selectedDraft.document_type === 'LCL') && (
                                (!editableBL?.blNumber?.trim() || !editableBL?.containerNumber?.trim() || !editableBL?.referenceCode?.trim()) && (
                                    <Grid size={{ xs: 12 }}>
                                        <Alert severity="error" sx={{ mt: 2 }}>
                                            <strong>Campos obligatorios para aprobar:</strong>
                                            <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                                                {!editableBL?.blNumber?.trim() && <li>B/L No. - Número de Bill of Lading</li>}
                                                {!editableBL?.containerNumber?.trim() && <li>Container Number - Número de contenedor</li>}
                                                {!editableBL?.referenceCode?.trim() && <li>Referencia - Código de referencia (AAA00-0000)</li>}
                                            </ul>
                                        </Alert>
                                    </Grid>
                                )
                            )}
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDetailOpen(false)}>Cerrar</Button>
                    {selectedDraft?.status === 'draft' && (
                        <>
                            <Button
                                color="error"
                                onClick={() => setRejectDialogOpen(true)}
                            >
                                Rechazar
                            </Button>
                            <Button
                                variant="outlined"
                                color="primary"
                                onClick={handleReExtract}
                                disabled={extracting || !selectedDraft.pdf_url}
                                startIcon={extracting ? <CircularProgress size={16} /> : <RefreshIcon />}
                            >
                                {extracting ? 'Extrayendo...' : 'Extraer Datos'}
                            </Button>
                            {/* Validar campos obligatorios para FCL/LCL: BL, Container, Referencia */}
                            {(() => {
                                const isFclOrLcl = selectedDraft.document_type === 'FCL' || selectedDraft.document_type === 'BL' || selectedDraft.document_type === 'LCL';
                                const missingFields: string[] = [];
                                if (isFclOrLcl) {
                                    if (!editableBL?.blNumber?.trim()) missingFields.push('B/L No.');
                                    if (!editableBL?.containerNumber?.trim()) missingFields.push('Container Number');
                                    if (!editableBL?.referenceCode?.trim()) missingFields.push('Referencia');
                                }
                                const canApprove = !isFclOrLcl || missingFields.length === 0;
                                
                                return (
                                    <Tooltip 
                                        title={!canApprove ? `Campos obligatorios faltantes: ${missingFields.join(', ')}` : ''}
                                        arrow
                                    >
                                        <span>
                                            <Button
                                                variant="contained"
                                                color="success"
                                                startIcon={isApproving ? <CircularProgress size={20} color="inherit" /> : <CheckIcon />}
                                                onClick={() => handleApprove(selectedDraft)}
                                                disabled={!canApprove || isApproving}
                                            >
                                                {isApproving ? 'Procesando...' : 'Aprobar y Registrar'}
                                            </Button>
                                        </span>
                                    </Tooltip>
                                );
                            })()}
                        </>
                    )}
                </DialogActions>
            </Dialog>

            {/* Dialog: Rechazar */}
            <Dialog open={rejectDialogOpen} onClose={() => setRejectDialogOpen(false)}>
                <DialogTitle>Rechazar Borrador</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        label="Motivo del rechazo"
                        multiline
                        rows={3}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        sx={{ mt: 1 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRejectDialogOpen(false)}>Cancelar</Button>
                    <Button color="error" variant="contained" onClick={handleReject}>
                        Rechazar
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog: Buscar Cliente */}
            <Dialog open={clientSearchOpen} onClose={() => setClientSearchOpen(false)}>
                <DialogTitle>Asignar Cliente</DialogTitle>
                <DialogContent sx={{ minWidth: 400 }}>
                    <Autocomplete
                        options={legacyClients}
                        getOptionLabel={(c: any) => `${c.full_name} (${c.box_id})`}
                        loading={searchingClient}
                        value={selectedClient}
                        onChange={(_, v) => setSelectedClient(v)}
                        onInputChange={(_, v) => searchLegacyClients(v)}
                        renderInput={(params) => (
                            <TextField {...params} label="Buscar cliente..." fullWidth sx={{ mt: 1 }} />
                        )}
                        noOptionsText="No se encontraron clientes"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setClientSearchOpen(false)}>Cancelar</Button>
                    <Button
                        variant="contained"
                        disabled={!selectedClient}
                        onClick={handleAssignClient}
                    >
                        Asignar
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog: Agregar Whitelist */}
            <Dialog open={whitelistDialogOpen} onClose={() => setWhitelistDialogOpen(false)}>
                <DialogTitle>Agregar a Whitelist</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        label="Patrón de Email"
                        placeholder="@dominio.com"
                        value={newPattern}
                        onChange={(e) => setNewPattern(e.target.value)}
                        sx={{ mt: 1, mb: 2 }}
                        helperText="Ej: @sanky-logistics.cn o usuario@empresa.com"
                    />
                    <TextField
                        fullWidth
                        label="Descripción"
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setWhitelistDialogOpen(false)}>Cancelar</Button>
                    <Button variant="contained" onClick={handleAddWhitelist} disabled={!newPattern}>
                        Agregar
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog: Instrucciones de Envío */}
            <Dialog 
                open={instructionsOpen} 
                onClose={() => setInstructionsOpen(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle sx={{ bgcolor: 'primary.main', color: 'white' }}>
                    📧 Instrucciones para Envío de Correos Marítimos
                </DialogTitle>
                <DialogContent sx={{ mt: 2 }}>
                    {/* FCL Section */}
                    <Box sx={{ mb: 4 }}>
                        <Typography variant="h6" fontWeight="bold" color="primary" gutterBottom>
                            🚢 Envíos FCL (Full Container Load)
                        </Typography>
                        <Alert severity="info" sx={{ mb: 2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <strong>Correo destino:</strong>
                                <code style={{ 
                                    backgroundColor: '#e3f2fd', 
                                    padding: '2px 8px', 
                                    borderRadius: '4px',
                                    fontWeight: 'bold'
                                }}>
                                    documentos@entregax.com
                                </code>
                                <Tooltip title="Copiar">
                                    <IconButton 
                                        size="small" 
                                        onClick={() => navigator.clipboard.writeText('documentos@entregax.com')}
                                    >
                                        <CopyIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        </Alert>
                        
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            📎 Archivos adjuntos requeridos:
                        </Typography>
                        <Box component="ul" sx={{ pl: 2 }}>
                            <li>
                                <Typography variant="body2">
                                    <strong>Bill of Lading (BL)</strong> - Archivo PDF
                                </Typography>
                            </li>
                            <li>
                                <Typography variant="body2">
                                    <strong>Telex Release</strong> - Archivo PDF o Imagen (JPG/PNG)
                                </Typography>
                            </li>
                            <li>
                                <Typography variant="body2">
                                    <strong>Packing List</strong> - Archivo Excel (.xlsx o .xls)
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 2 }}>
                                    Incluye: códigos de cliente (LOG), número de cajas, peso y descripción
                                </Typography>
                            </li>
                        </Box>

                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom sx={{ mt: 2 }}>
                            ✉️ Formato del asunto:
                        </Typography>
                        <Box sx={{ 
                            bgcolor: 'grey.100', 
                            p: 2, 
                            borderRadius: 1, 
                            fontFamily: 'monospace',
                            fontSize: '0.9rem'
                        }}>
                            [RUTA] / Week [NÚMERO] / [REFERENCIA]<br/>
                            <Typography variant="caption" color="text.secondary">
                                Ejemplo: CHN-LZC-MEX / Week 2-2 / JSM26-0002
                            </Typography>
                        </Box>
                        <Alert severity="success" sx={{ mt: 1 }} icon={false}>
                            <Typography variant="caption">
                                💡 <strong>Importante:</strong> La referencia (ej: JSM26-0002) identifica el contenedor/embarque.
                            </Typography>
                        </Alert>
                    </Box>

                    <Divider sx={{ my: 3 }} />

                    {/* LCL Section */}
                    <Box>
                        <Typography variant="h6" fontWeight="bold" color="secondary" gutterBottom>
                            📦 Envíos LCL (Less than Container Load)
                        </Typography>
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <strong>Correo destino:</strong>
                                <code style={{ 
                                    backgroundColor: '#fff3e0', 
                                    padding: '2px 8px', 
                                    borderRadius: '4px',
                                    fontWeight: 'bold'
                                }}>
                                    consolidacion@entregax.com
                                </code>
                                <Tooltip title="Copiar">
                                    <IconButton 
                                        size="small" 
                                        onClick={() => navigator.clipboard.writeText('consolidacion@entregax.com')}
                                    >
                                        <CopyIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        </Alert>

                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            📎 Archivos adjuntos requeridos:
                        </Typography>
                        <Box component="ul" sx={{ pl: 2 }}>
                            <li>
                                <Typography variant="body2">
                                    <strong>Bill of Lading (BL)</strong> - Archivo PDF
                                </Typography>
                            </li>
                            <li>
                                <Typography variant="body2">
                                    <strong>Telex Release</strong> - Archivo PDF o Imagen (JPG/PNG) - <em>Opcional</em>
                                </Typography>
                            </li>
                            <li>
                                <Typography variant="body2">
                                    <strong>SUMMARY</strong> - Archivo Excel (.xlsx o .xls)
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 2 }}>
                                    El nombre del archivo debe contener "SUMMARY". Incluye información de LOGs.
                                </Typography>
                            </li>
                        </Box>

                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom sx={{ mt: 2 }}>
                            📊 Columnas del SUMMARY Excel:
                        </Typography>
                        <Box sx={{ 
                            bgcolor: 'grey.100', 
                            p: 2, 
                            borderRadius: 1,
                            fontSize: '0.85rem'
                        }}>
                            <Box component="ul" sx={{ pl: 2, m: 0 }}>
                                <li><strong>Columna C:</strong> Número de LOG (para buscar en sistema)</li>
                                <li><strong>Columna D:</strong> Tipo de Mercancía
                                    <Box component="ul" sx={{ pl: 2, mt: 0.5 }}>
                                        <li><em>Vacío</em> = Genérico</li>
                                        <li><strong>S</strong> = Mercancía Sensible</li>
                                        <li><strong>B</strong> = Logotipo (Marcas Registradas)</li>
                                    </Box>
                                </li>
                                <li><strong>Columna M:</strong> 🔋 Battery (si aparece = Sí)</li>
                                <li><strong>Columna N:</strong> 💧 Liquid (si aparece = Sí)</li>
                                <li><strong>Columna Q:</strong> 🚚 Pick Up (si aparece = Sí)</li>
                            </Box>
                        </Box>

                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom sx={{ mt: 2 }}>
                            ✉️ Formato del asunto:
                        </Typography>
                        <Box sx={{ 
                            bgcolor: 'grey.100', 
                            p: 2, 
                            borderRadius: 1, 
                            fontFamily: 'monospace',
                            fontSize: '0.9rem'
                        }}>
                            [RUTA] / Week [NÚMERO] / [REFERENCIA]<br/>
                            <Typography variant="caption" color="text.secondary">
                                Ejemplo: CHN-LZC-MEX / Week 1-1 / JSM26-0002
                            </Typography>
                        </Box>
                        <Alert severity="success" sx={{ mt: 1 }} icon={false}>
                            <Typography variant="caption">
                                💡 <strong>Importante:</strong> La referencia (ej: JSM26-0002) identifica la consolidación.
                            </Typography>
                        </Alert>
                    </Box>

                    <Divider sx={{ my: 3 }} />

                    {/* Notes */}
                    <Alert severity="success">
                        <Typography variant="subtitle2" fontWeight="bold">
                            💡 Notas importantes:
                        </Typography>
                        <Box component="ul" sx={{ pl: 2, mb: 0 }}>
                            <li>
                                <Typography variant="body2">
                                    Solo se procesan correos de remitentes en la <strong>Whitelist</strong>
                                </Typography>
                            </li>
                            <li>
                                <Typography variant="body2">
                                    Los archivos se procesan automáticamente con IA para extraer datos
                                </Typography>
                            </li>
                            <li>
                                <Typography variant="body2">
                                    El Excel SUMMARY actualiza automáticamente tipo de mercancía y características especiales
                                </Typography>
                            </li>
                        </Box>
                    </Alert>
                </DialogContent>
                <DialogActions>
                    <Button 
                        variant="contained" 
                        onClick={() => setInstructionsOpen(false)}
                    >
                        Entendido
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog: Subir FCL */}
            <Dialog 
                open={uploadFCLOpen} 
                onClose={() => !uploadLoading && setUploadFCLOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle sx={{ bgcolor: 'primary.main', color: 'white' }}>
                    🚢 Subir Documentos FCL (Full Container Load)
                </DialogTitle>
                <DialogContent sx={{ mt: 2 }}>
                    <Alert severity="info" sx={{ mb: 3 }}>
                        Sube manualmente los documentos de un embarque FCL. Los archivos serán procesados con IA.
                    </Alert>

                    <FormControl fullWidth sx={{ mb: 3 }}>
                        <InputLabel>Ruta Marítima *</InputLabel>
                        <Select
                            value={fclRouteId}
                            label="Ruta Marítima *"
                            onChange={(e) => {
                                const routeId = e.target.value as number;
                                setFclRouteId(routeId);
                                // Auto-generar subject con el código de ruta
                                const selectedRoute = routes.find(r => r.id === routeId);
                                if (selectedRoute) {
                                    setFclSubject(`${selectedRoute.code} / AAA00-0000`);
                                }
                            }}
                        >
                            {routes.filter(r => r.is_active).map((route) => (
                                <MenuItem key={route.id} value={route.id}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <BoatIcon fontSize="small" color="primary" />
                                        <strong>{route.code}</strong>
                                        <Typography variant="body2" color="text.secondary">
                                            - {route.name}
                                        </Typography>
                                    </Box>
                                </MenuItem>
                            ))}
                        </Select>
                        {!fclRouteId && (
                            <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                                Debes seleccionar una ruta para continuar
                            </Typography>
                        )}
                    </FormControl>

                    <TextField
                        fullWidth
                        label="Referencia (obligatoria) *"
                        placeholder="Ruta / AAA00-0000"
                        value={fclSubject}
                        onChange={(e) => setFclSubject(e.target.value.toUpperCase())}
                        sx={{ mb: 3 }}
                        helperText="Ej: CHN-LZC-MXC / JSM25-0001"
                    />

                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                        📄 Bill of Lading (BL) - PDF *
                    </Typography>
                    <Box sx={{ mb: 2 }}>
                        <input
                            type="file"
                            accept=".pdf"
                            onChange={(e) => setFclBlFile(e.target.files?.[0] || null)}
                            style={{ marginBottom: 8 }}
                        />
                        {fclBlFile && (
                            <Chip 
                                label={fclBlFile.name} 
                                onDelete={() => setFclBlFile(null)} 
                                color="primary" 
                                size="small" 
                            />
                        )}
                    </Box>

                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                        📜 Telex Release / ISF - PDF o Imagen
                    </Typography>
                    <Box sx={{ mb: 2 }}>
                        <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => setFclTelexFile(e.target.files?.[0] || null)}
                            style={{ marginBottom: 8 }}
                        />
                        {fclTelexFile && (
                            <Chip 
                                label={fclTelexFile.name} 
                                onDelete={() => setFclTelexFile(null)} 
                                color="secondary" 
                                size="small" 
                            />
                        )}
                    </Box>

                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                        📊 Packing List - Excel
                    </Typography>
                    <Box sx={{ mb: 2 }}>
                        <input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={(e) => setFclPackingFile(e.target.files?.[0] || null)}
                            style={{ marginBottom: 8 }}
                        />
                        {fclPackingFile && (
                            <Chip 
                                label={fclPackingFile.name} 
                                onDelete={() => setFclPackingFile(null)} 
                                color="success" 
                                size="small" 
                            />
                        )}
                        <Typography variant="caption" color="text.secondary" display="block">
                            Debe incluir: códigos de cliente, número de cajas, peso y descripción
                        </Typography>
                    </Box>

                    {/* Indicador de progreso de subida */}
                    {uploadLoading && (
                        <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <CircularProgress size={20} sx={{ mr: 2 }} />
                                <Typography variant="body2" fontWeight="bold">
                                    {uploadProgress.message || 'Procesando...'}
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                {[1, 2, 3, 4].map((step) => (
                                    <Box
                                        key={step}
                                        sx={{
                                            width: 40,
                                            height: 8,
                                            borderRadius: 1,
                                            bgcolor: step <= uploadProgress.step ? 'primary.main' : 'grey.300',
                                            transition: 'background-color 0.3s'
                                        }}
                                    />
                                ))}
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                                Paso {uploadProgress.step} de {uploadProgress.totalSteps}: {uploadProgress.currentFile}
                            </Typography>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button 
                        onClick={() => {
                            setUploadFCLOpen(false);
                            setFclBlFile(null);
                            setFclTelexFile(null);
                            setFclPackingFile(null);
                            setFclSubject('');
                            setFclRouteId('');
                            setUploadProgress({ step: 0, totalSteps: 4, currentFile: '', status: 'idle', message: '' });
                        }}
                        disabled={uploadLoading}
                    >
                        Cancelar
                    </Button>
                    <Button 
                        variant="contained" 
                        disabled={!fclBlFile || !fclRouteId || uploadLoading}
                        startIcon={uploadLoading ? <CircularProgress size={20} /> : <UploadIcon />}
                        onClick={async () => {
                            if (!fclBlFile || !fclRouteId) return;
                            setUploadLoading(true);
                            
                            // Calcular total de archivos a subir
                            const totalFiles = 1 + (fclTelexFile ? 1 : 0) + (fclPackingFile ? 1 : 0);
                            let currentStep = 0;
                            
                            try {
                                // Paso 1: Preparando archivos
                                currentStep++;
                                setUploadProgress({
                                    step: currentStep,
                                    totalSteps: totalFiles + 1,
                                    currentFile: 'Bill of Lading (BL)',
                                    status: 'uploading',
                                    message: `Subiendo archivo ${currentStep} de ${totalFiles}...`
                                });
                                
                                const formData = new FormData();
                                formData.append('shipmentType', 'FCL');
                                formData.append('subject', fclSubject);
                                formData.append('routeId', String(fclRouteId));
                                formData.append('bl', fclBlFile);
                                
                                // Paso 2: Telex (si existe)
                                if (fclTelexFile) {
                                    currentStep++;
                                    setUploadProgress({
                                        step: currentStep,
                                        totalSteps: totalFiles + 1,
                                        currentFile: 'Telex Release',
                                        status: 'uploading',
                                        message: `Subiendo archivo ${currentStep} de ${totalFiles}...`
                                    });
                                    formData.append('telex', fclTelexFile);
                                }
                                
                                // Paso 3: Packing List (si existe)
                                if (fclPackingFile) {
                                    currentStep++;
                                    setUploadProgress({
                                        step: currentStep,
                                        totalSteps: totalFiles + 1,
                                        currentFile: 'Packing List',
                                        status: 'uploading',
                                        message: `Subiendo archivo ${currentStep} de ${totalFiles}...`
                                    });
                                    formData.append('packingList', fclPackingFile);
                                }
                                
                                // Paso final: Procesando con IA
                                setUploadProgress({
                                    step: totalFiles + 1,
                                    totalSteps: totalFiles + 1,
                                    currentFile: 'Procesando con IA...',
                                    status: 'processing',
                                    message: '🤖 Extrayendo datos del BL con IA...'
                                });

                                const res = await fetch(`${API_URL}/api/admin/maritime/upload-manual`, {
                                    method: 'POST',
                                    headers: { Authorization: `Bearer ${token}` },
                                    body: formData
                                });

                                if (res.ok) {
                                    setUploadProgress({
                                        step: totalFiles + 1,
                                        totalSteps: totalFiles + 1,
                                        currentFile: '',
                                        status: 'done',
                                        message: '✅ ¡Completado!'
                                    });
                                    
                                    setTimeout(() => {
                                        setUploadFCLOpen(false);
                                        setFclBlFile(null);
                                        setFclTelexFile(null);
                                        setFclPackingFile(null);
                                        setFclSubject('');
                                        setFclRouteId('');
                                        setUploadProgress({ step: 0, totalSteps: 4, currentFile: '', status: 'idle', message: '' });
                                        loadDrafts();
                                        loadStats();
                                        setSnackbar({ open: true, message: 'Documentos FCL subidos correctamente', severity: 'success' });
                                    }, 1000);
                                } else {
                                    const data = await res.json();
                                    setUploadProgress({
                                        step: 0,
                                        totalSteps: 4,
                                        currentFile: '',
                                        status: 'error',
                                        message: '❌ Error al subir'
                                    });
                                    setSnackbar({ open: true, message: data.error || 'Error al subir', severity: 'error' });
                                }
                            } catch (e: any) {
                                setUploadProgress({
                                    step: 0,
                                    totalSteps: 4,
                                    currentFile: '',
                                    status: 'error',
                                    message: '❌ Error de conexión'
                                });
                                setSnackbar({ open: true, message: e.message, severity: 'error' });
                            } finally {
                                setUploadLoading(false);
                            }
                        }}
                    >
                        Subir FCL
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog: Subir LCL */}
            <Dialog 
                open={uploadLCLOpen} 
                onClose={() => !uploadLoading && setUploadLCLOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle sx={{ bgcolor: 'secondary.main', color: 'white' }}>
                    📦 Subir Documentos LCL (Less than Container Load)
                </DialogTitle>
                <DialogContent sx={{ mt: 2 }}>
                    <Alert severity="warning" sx={{ mb: 3 }}>
                        Sube manualmente los documentos de un embarque LCL. El Excel SUMMARY actualizará los LOGs automáticamente.
                    </Alert>

                    <FormControl fullWidth sx={{ mb: 3 }} required error={!lclRouteId}>
                        <InputLabel>Ruta Marítima *</InputLabel>
                        <Select
                            value={lclRouteId}
                            label="Ruta Marítima *"
                            onChange={(e) => {
                                const routeId = e.target.value as number;
                                setLclRouteId(routeId);
                            }}
                        >
                            {routes.filter(r => r.is_active).map((route) => (
                                <MenuItem key={route.id} value={route.id}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <BoatIcon fontSize="small" color="primary" />
                                        <strong>{route.code}</strong>
                                        <Typography variant="body2" color="text.secondary">
                                            - {route.name}
                                        </Typography>
                                    </Box>
                                </MenuItem>
                            ))}
                        </Select>
                        {!lclRouteId && (
                            <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                                Debes seleccionar una ruta para continuar
                            </Typography>
                        )}
                    </FormControl>

                    <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                        <TextField
                            label="Week *"
                            placeholder="8-1"
                            value={lclWeek}
                            onChange={(e) => setLclWeek(e.target.value)}
                            sx={{ width: 120 }}
                            helperText="Ej: 8-1"
                        />
                        <TextField
                            fullWidth
                            label="Referencia (obligatoria) *"
                            placeholder="JSM25-0001"
                            value={lclSubject}
                            onChange={(e) => setLclSubject(e.target.value.toUpperCase())}
                            helperText="Ej: JSM25-0001"
                        />
                    </Box>

                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                        📄 Bill of Lading (BL) - PDF *
                    </Typography>
                    <Box sx={{ mb: 2 }}>
                        <input
                            type="file"
                            accept=".pdf"
                            onChange={(e) => setLclBlFile(e.target.files?.[0] || null)}
                            style={{ marginBottom: 8 }}
                        />
                        {lclBlFile && (
                            <Chip 
                                label={lclBlFile.name} 
                                onDelete={() => setLclBlFile(null)} 
                                color="primary" 
                                size="small" 
                            />
                        )}
                    </Box>

                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                        📜 TELEX o ISF
                    </Typography>
                    <Box sx={{ mb: 2 }}>
                        <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => setLclTelexFile(e.target.files?.[0] || null)}
                            style={{ marginBottom: 8 }}
                        />
                        {lclTelexFile && (
                            <Chip 
                                label={lclTelexFile.name} 
                                onDelete={() => setLclTelexFile(null)} 
                                color="secondary" 
                                size="small" 
                            />
                        )}
                    </Box>

                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                        📊 SUMMARY - Excel *
                    </Typography>
                    <Box sx={{ mb: 2 }}>
                        <input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={(e) => setLclSummaryFile(e.target.files?.[0] || null)}
                            style={{ marginBottom: 8 }}
                        />
                        {lclSummaryFile && (
                            <Chip 
                                label={lclSummaryFile.name} 
                                onDelete={() => setLclSummaryFile(null)} 
                                color="success" 
                                size="small" 
                            />
                        )}
                        <Typography variant="caption" color="text.secondary" display="block">
                            Columnas: C=LOG, D=Tipo Mercancía (S/B), M=Battery, N=Liquid, Q=Pick Up
                        </Typography>
                    </Box>

                    {/* Indicador de progreso de subida LCL */}
                    {uploadProgress.status !== 'idle' && (
                        <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                            <Typography variant="subtitle2" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {uploadProgress.status === 'uploading' && <CircularProgress size={16} />}
                                {uploadProgress.status === 'processing' && <CircularProgress size={16} color="secondary" />}
                                {uploadProgress.status === 'done' && '✅'}
                                {uploadProgress.status === 'error' && '❌'}
                                Progreso: {uploadProgress.step} / {uploadProgress.totalSteps}
                            </Typography>
                            <LinearProgress 
                                variant="determinate" 
                                value={(uploadProgress.step / uploadProgress.totalSteps) * 100}
                                sx={{ mb: 1, height: 8, borderRadius: 1 }}
                                color={uploadProgress.status === 'error' ? 'error' : uploadProgress.status === 'done' ? 'success' : 'primary'}
                            />
                            <Typography variant="body2" color="text.secondary">
                                {uploadProgress.message}
                            </Typography>
                            {uploadProgress.currentFile && (
                                <Chip 
                                    label={`📄 ${uploadProgress.currentFile}`}
                                    size="small"
                                    sx={{ mt: 1 }}
                                    color={uploadProgress.status === 'error' ? 'error' : 'primary'}
                                />
                            )}
                            {/* Barras de progreso visual */}
                            <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                                {[1, 2, 3, 4].map((step) => (
                                    <Box 
                                        key={step}
                                        sx={{ 
                                            flex: 1, 
                                            height: 4, 
                                            borderRadius: 1,
                                            bgcolor: step <= uploadProgress.step 
                                                ? (uploadProgress.status === 'error' ? 'error.main' : 'success.main')
                                                : 'grey.300',
                                            transition: 'background-color 0.3s ease'
                                        }}
                                    />
                                ))}
                            </Box>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1, p: 2 }}>
                    {/* Debug: mostrar estado de los campos */}
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center', mb: 1 }}>
                        <Chip 
                            label={`BL: ${lclBlFile ? '✓' : '✗'}`} 
                            color={lclBlFile ? 'success' : 'error'} 
                            size="small" 
                        />
                        <Chip 
                            label={`Ruta: ${lclRouteId ? '✓' : '✗'}`} 
                            color={lclRouteId ? 'success' : 'error'} 
                            size="small" 
                        />
                        <Chip 
                            label={`Week: ${lclWeek ? '✓' : '✗'}`} 
                            color={lclWeek ? 'success' : 'error'} 
                            size="small" 
                        />
                        <Chip 
                            label={`Ref: ${lclSubject ? '✓' : '✗'}`} 
                            color={lclSubject ? 'success' : 'error'} 
                            size="small" 
                        />
                        <Chip 
                            label={`Summary: ${lclSummaryFile ? '✓' : '✗'}`} 
                            color={lclSummaryFile ? 'success' : 'error'} 
                            size="small" 
                        />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                        <Button 
                            onClick={() => {
                                setUploadLCLOpen(false);
                                setLclBlFile(null);
                                setLclTelexFile(null);
                                setLclSummaryFile(null);
                                setLclSubject('');
                                setLclWeek('');
                                setLclRouteId('');
                            }}
                            disabled={uploadLoading}
                    >
                        Cancelar
                    </Button>
                    <Button 
                        variant="contained"
                        color="secondary"
                        disabled={!lclBlFile || !lclRouteId || !lclSubject || !lclWeek || !lclSummaryFile || uploadLoading}
                        startIcon={uploadLoading ? <CircularProgress size={20} /> : <UploadIcon />}
                        onClick={async () => {
                            if (!lclBlFile || !lclRouteId || !lclSubject || !lclWeek || !lclSummaryFile) return;
                            setUploadLoading(true);
                            
                            // Iniciar progreso
                            setUploadProgress({ step: 1, totalSteps: 4, currentFile: lclBlFile.name, status: 'uploading', message: 'Subiendo Bill of Lading (BL)...' });
                            
                            try {
                                const formData = new FormData();
                                formData.append('shipmentType', 'LCL');
                                formData.append('subject', lclSubject);
                                formData.append('weekNumber', lclWeek);
                                formData.append('routeId', String(lclRouteId));
                                
                                // Paso 1: BL
                                formData.append('bl', lclBlFile);
                                await new Promise(resolve => setTimeout(resolve, 300));
                                
                                // Paso 2: TELEX
                                if (lclTelexFile) {
                                    setUploadProgress({ step: 2, totalSteps: 4, currentFile: lclTelexFile.name, status: 'uploading', message: 'Subiendo TELEX/ISF...' });
                                    formData.append('telex', lclTelexFile);
                                    await new Promise(resolve => setTimeout(resolve, 300));
                                } else {
                                    setUploadProgress({ step: 2, totalSteps: 4, currentFile: '', status: 'uploading', message: 'Sin TELEX, continuando...' });
                                }
                                
                                // Paso 3: Summary
                                setUploadProgress({ step: 3, totalSteps: 4, currentFile: lclSummaryFile.name, status: 'uploading', message: 'Subiendo SUMMARY Excel...' });
                                formData.append('summary', lclSummaryFile);
                                await new Promise(resolve => setTimeout(resolve, 300));
                                
                                // Paso 4: Enviando al servidor
                                setUploadProgress({ step: 4, totalSteps: 4, currentFile: '', status: 'processing', message: 'Procesando documentos y extrayendo datos con IA...' });

                                const res = await fetch(`${API_URL}/api/admin/maritime/upload-manual`, {
                                    method: 'POST',
                                    headers: { Authorization: `Bearer ${token}` },
                                    body: formData
                                });

                                if (res.ok) {
                                    setUploadProgress({ step: 4, totalSteps: 4, currentFile: '', status: 'done', message: '¡Documentos LCL procesados exitosamente!' });
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                    setUploadLCLOpen(false);
                                    setLclBlFile(null);
                                    setLclTelexFile(null);
                                    setLclSummaryFile(null);
                                    setLclSubject('');
                                    setLclWeek('');
                                    setLclRouteId('');
                                    setUploadProgress({ step: 0, totalSteps: 4, currentFile: '', status: 'idle', message: '' });
                                    loadDrafts();
                                    loadStats();
                                    setSnackbar({ open: true, message: 'Documentos LCL subidos correctamente', severity: 'success' });
                                } else {
                                    const data = await res.json();
                                    setUploadProgress({ step: 4, totalSteps: 4, currentFile: '', status: 'error', message: data.error || 'Error al procesar' });
                                    setSnackbar({ open: true, message: data.error || 'Error al subir', severity: 'error' });
                                }
                            } catch (e: any) {
                                setUploadProgress({ step: uploadProgress.step, totalSteps: 4, currentFile: '', status: 'error', message: e.message });
                                setSnackbar({ open: true, message: e.message, severity: 'error' });
                            } finally {
                                setUploadLoading(false);
                            }
                        }}
                    >
                        Subir LCL
                    </Button>
                    </Box>
                </DialogActions>
            </Dialog>

            {/* Dialog de confirmación para eliminar whitelist */}
            <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningIcon color="warning" />
                    Confirmar eliminación
                </DialogTitle>
                <DialogContent>
                    <Typography>
                        ¿Está seguro que desea eliminar este patrón de la whitelist?
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteConfirmOpen(false)}>Cancelar</Button>
                    <Button onClick={confirmDeleteWhitelist} variant="contained" color="error">
                        Eliminar
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar de notificaciones */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert 
                    onClose={() => setSnackbar({ ...snackbar, open: false })} 
                    severity={snackbar.severity}
                    variant="filled"
                    sx={{ width: '100%' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
