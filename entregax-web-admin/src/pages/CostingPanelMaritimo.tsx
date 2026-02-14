// ============================================
// PANEL DE COSTEO MARÍTIMO - Contenedores FCL/LCL
// Gestión de costos de contenedores marítimos
// ============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
    Divider,
    Tabs,
    Tab,
    LinearProgress,
    InputAdornment,
    Tooltip,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
} from '@mui/material';
import {
    DirectionsBoat as BoatIcon,
    Add as AddIcon,
    Save as SaveIcon,
    Calculate as CalculateIcon,
    AttachFile as AttachFileIcon,
    CheckCircle as CheckCircleIcon,
    Warning as WarningIcon,
    Search as SearchIcon,
    Refresh as RefreshIcon,
    LocalShipping as ShippingIcon,
    Receipt as ReceiptIcon,
    AccountBalance as AccountBalanceIcon,
    Description as DescriptionIcon,
    Timeline as TimelineIcon,
    SatelliteAlt as SatelliteIcon,
    Schedule as ScheduleIcon,
    LocationOn as LocationIcon,
    PlayArrow as PlayIcon,
    Visibility as VisibilityIcon,
    Edit as EditIcon,
    Download as DownloadIcon,
    Delete as DeleteIcon,
    Close as CloseIcon,
    OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Colores del tema marítimo
const SEA_COLOR = '#00BCD4';
const SEA_DARK = '#0097A7';

interface Container {
    id: number;
    container_number: string;
    bl_number: string;
    eta: string;
    status: string;
    total_weight_kg: number;
    total_cbm: number;
    total_packages: number;
    final_cost_mxn: number | null;
    shipment_count?: number;
    is_fully_costed?: boolean;
    calculated_release_cost?: number;
    notes?: string;
    created_at: string;
    route_id?: number;
    route_code?: string;
    route_name?: string;
    // BL Data extracted from documents
    shipper?: string;
    consignee?: string;
    so_number?: string;
    vessel_name?: string;
    voyage_number?: string;
    port_of_loading?: string;
    port_of_discharge?: string;
    place_of_delivery?: string;
    laden_on_board?: string;
    place_of_issue?: string;
    date_of_issue?: string;
    freight_terms?: string;
    carrier?: string;
    goods_description?: string;
    shipment_agent?: string;
    // Vizion tracking fields
    vizion_reference_id?: string;
    vizion_subscribed_at?: string;
    last_tracking_event?: string;
    last_tracking_date?: string;
    last_tracking_location?: string;
    carrier_code?: string;
    carrier_name?: string;
}

interface TrackingLog {
    id: number;
    event_code: string;
    event_description: string;
    event_date: string;
    location: string;
    vessel_name?: string;
    voyage_number?: string;
    is_manual: boolean;
    created_at: string;
}

interface MaritimeRoute {
    id: number;
    code: string;
    name: string;
    email: string | null;
    is_active: boolean;
}

interface ContainerCosts {
    id?: number;
    container_id: number;
    debit_note_amount: number;
    debit_note_pdf: string | null;
    demurrage_amount: number;
    demurrage_pdf: string | null;
    storage_amount: number;
    storage_pdf: string | null;
    maneuvers_amount: number;
    maneuvers_pdf: string | null;
    custody_amount: number;
    custody_pdf: string | null;
    advance_1_amount: number;
    advance_1_pdf: string | null;
    advance_2_amount: number;
    advance_2_pdf: string | null;
    advance_3_amount: number;
    advance_3_pdf: string | null;
    advance_4_amount: number;
    advance_4_pdf: string | null;
    transport_amount: number;
    transport_pdf: string | null;
    other_amount: number;
    other_pdf: string | null;
    other_description: string | null;
    telex_release_pdf: string | null;
    bl_document_pdf: string | null;
    calculated_aa_cost: number;
    calculated_release_cost: number;
    is_fully_costed: boolean;
}

interface MaritimeStats {
    containersByStatus: { status: string; count: string }[];
    shipmentsByStatus: { status: string; count: string }[];
    totals: {
        total_containers: string;
        in_transit_containers: string;
        total_shipments: string;
        unassigned_shipments: string;
        costed_containers: string;
    };
    totalCosts: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; labelEn: string; labelZh: string }> = {
    'received_origin': { label: 'Recibido China', labelEn: 'Received China', labelZh: '中国已收', color: '#9E9E9E' },
    'consolidated': { label: 'Consolidado', labelEn: 'Consolidated', labelZh: '已合并', color: '#FF9800' },
    'in_transit': { label: 'En Tránsito', labelEn: 'In Transit', labelZh: '运输中', color: '#2196F3' },
    'arrived_port': { label: 'En Puerto', labelEn: 'At Port', labelZh: '已到港', color: '#673AB7' },
    'customs_cleared': { label: 'Liberado', labelEn: 'Customs Cleared', labelZh: '已清关', color: '#4CAF50' },
    'received_cedis': { label: 'En CEDIS', labelEn: 'At CEDIS', labelZh: '已到仓库', color: '#00BCD4' },
};

const emptyCosts: ContainerCosts = {
    container_id: 0,
    debit_note_amount: 0,
    debit_note_pdf: null,
    demurrage_amount: 0,
    demurrage_pdf: null,
    storage_amount: 0,
    storage_pdf: null,
    maneuvers_amount: 0,
    maneuvers_pdf: null,
    custody_amount: 0,
    custody_pdf: null,
    advance_1_amount: 0,
    advance_1_pdf: null,
    advance_2_amount: 0,
    advance_2_pdf: null,
    advance_3_amount: 0,
    advance_3_pdf: null,
    advance_4_amount: 0,
    advance_4_pdf: null,
    transport_amount: 0,
    transport_pdf: null,
    other_amount: 0,
    other_pdf: null,
    other_description: null,
    telex_release_pdf: null,
    bl_document_pdf: null,
    calculated_aa_cost: 0,
    calculated_release_cost: 0,
    is_fully_costed: false,
};

// Función para formatear moneda MXN
const formatCurrency = (value: number | null | undefined): string => {
    if (value === null || value === undefined || isNaN(value)) return '0.00';
    return value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function CostingPanelMaritimo() {
    const { t, i18n } = useTranslation();
    const [containers, setContainers] = useState<Container[]>([]);
    const [routes, setRoutes] = useState<MaritimeRoute[]>([]);
    const [stats, setStats] = useState<MaritimeStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);
    const [costs, setCosts] = useState<ContainerCosts>(emptyCosts);
    const [costDialogOpen, setCostDialogOpen] = useState(false);
    const [newContainerDialog, setNewContainerDialog] = useState(false);
    const [newContainer, setNewContainer] = useState({ containerNumber: '', blNumber: '', eta: '', notes: '' });
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
    const [savingCosts, setSavingCosts] = useState(false);
    const [tabValue, setTabValue] = useState(0);
    const [trackingLogs, setTrackingLogs] = useState<TrackingLog[]>([]);
    const [loadingTracking, setLoadingTracking] = useState(false);
    const [subscribingVizion, setSubscribingVizion] = useState(false);
    const [uploadingField, setUploadingField] = useState<string | null>(null);
    
    // Estado para modal de gestión de archivos PDF
    const [fileModal, setFileModal] = useState<{
        open: boolean;
        url: string;
        fieldKey: keyof ContainerCosts | null;
        fieldLabel: string;
    }>({ open: false, url: '', fieldKey: null, fieldLabel: '' });

    // Estado para diálogo de confirmación
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({ open: false, title: '', message: '', onConfirm: () => {} });

    const getToken = () => localStorage.getItem('token');

    // Referencia al input de archivo oculto
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [currentUploadField, setCurrentUploadField] = useState<keyof ContainerCosts | null>(null);

    // Función para abrir el selector de archivos
    const openFileSelector = (pdfKey: keyof ContainerCosts) => {
        setCurrentUploadField(pdfKey);
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    // Manejar selección de archivo
    const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && currentUploadField) {
            handleFileUpload(file, currentUploadField);
        }
        // Limpiar el input para permitir seleccionar el mismo archivo nuevamente
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Función para subir archivo PDF
    const handleFileUpload = async (file: File, pdfKey: keyof ContainerCosts) => {
        if (!selectedContainer) return;
        
        setUploadingField(pdfKey);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('containerId', selectedContainer.id.toString());
            formData.append('fieldName', pdfKey);

            const res = await axios.post(`${API_URL}/api/maritime/containers/upload-cost-pdf`, formData, {
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'multipart/form-data'
                }
            });

            if (res.data.url) {
                setCosts(prev => ({ ...prev, [pdfKey]: res.data.url }));
                setSnackbar({ open: true, message: 'Archivo subido correctamente', severity: 'success' });
            }
        } catch (error: any) {
            console.error('Error subiendo archivo:', error);
            setSnackbar({ open: true, message: error.response?.data?.error || 'Error al subir archivo', severity: 'error' });
        } finally {
            setUploadingField(null);
        }
    };

    // Funciones para el modal de gestión de archivos PDF
    const openFileModal = (url: string, fieldKey: keyof ContainerCosts, label: string) => {
        setFileModal({ open: true, url, fieldKey, fieldLabel: label });
    };

    const closeFileModal = () => {
        setFileModal({ open: false, url: '', fieldKey: null, fieldLabel: '' });
    };

    const handleEditFileUrl = () => {
        const newUrl = prompt('Ingrese la nueva URL del archivo:', fileModal.url);
        if (newUrl && newUrl.trim() && fileModal.fieldKey) {
            setCosts(prev => ({ ...prev, [fileModal.fieldKey!]: newUrl.trim() }));
            setFileModal(prev => ({ ...prev, url: newUrl.trim() }));
            setSnackbar({ open: true, message: 'URL actualizada correctamente', severity: 'success' });
        }
    };

    const handleDeleteFile = () => {
        if (fileModal.fieldKey) {
            setConfirmDialog({
                open: true,
                title: '🗑️ Eliminar Archivo',
                message: `¿Está seguro de eliminar el archivo "${fileModal.fieldLabel}"? Esta acción no se puede deshacer.`,
                onConfirm: () => {
                    setCosts(prev => ({ ...prev, [fileModal.fieldKey!]: null }));
                    closeFileModal();
                    setConfirmDialog(prev => ({ ...prev, open: false }));
                    setSnackbar({ open: true, message: 'Archivo eliminado correctamente', severity: 'success' });
                }
            });
        }
    };

    const handleDownloadFile = () => {
        if (fileModal.url) {
            const link = document.createElement('a');
            link.href = fileModal.url;
            link.download = `${fileModal.fieldLabel.replace(/\s+/g, '_')}.pdf`;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    // Cargar rutas
    const fetchRoutes = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/maritime-api/routes`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setRoutes(res.data.routes || []);
        } catch (error) {
            console.error('Error fetching routes:', error);
        }
    }, []);

    // Cargar contenedores
    const fetchContainers = useCallback(async () => {
        try {
            setLoading(true);
            const params: Record<string, string> = {};
            if (statusFilter !== 'all') params.status = statusFilter;
            if (searchTerm) params.search = searchTerm;

            const [containersRes, statsRes] = await Promise.all([
                axios.get(`${API_URL}/api/maritime/containers`, {
                    headers: { Authorization: `Bearer ${getToken()}` },
                    params
                }),
                axios.get(`${API_URL}/api/maritime/stats`, {
                    headers: { Authorization: `Bearer ${getToken()}` }
                })
            ]);

            setContainers(containersRes.data);
            setStats(statsRes.data);
        } catch (error) {
            console.error('Error fetching containers:', error);
            setSnackbar({ open: true, message: t('maritime.errorLoading'), severity: 'error' });
        } finally {
            setLoading(false);
        }
    }, [statusFilter, searchTerm, t]);

    useEffect(() => {
        fetchContainers();
        fetchRoutes();
    }, [fetchContainers, fetchRoutes]);

    // Actualizar ruta del contenedor
    const updateContainerRoute = async (containerId: number, routeId: number | null) => {
        try {
            await axios.put(
                `${API_URL}/api/maritime/containers/${containerId}`,
                { routeId },
                { headers: { Authorization: `Bearer ${getToken()}` } }
            );
            setSnackbar({ open: true, message: t('maritime.routeUpdated'), severity: 'success' });
            fetchContainers();
        } catch (error) {
            console.error('Error updating route:', error);
            setSnackbar({ open: true, message: t('maritime.errorUpdatingRoute'), severity: 'error' });
        }
    };

    // Cargar costos de un contenedor
    const loadContainerCosts = async (container: Container) => {
        try {
            const res = await axios.get(`${API_URL}/api/maritime/containers/${container.id}/costs`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setCosts(res.data || { ...emptyCosts, container_id: container.id });
            setSelectedContainer(container);
            setCostDialogOpen(true);
        } catch (error) {
            console.error('Error loading costs:', error);
            setSnackbar({ open: true, message: t('maritime.errorLoadingCosts'), severity: 'error' });
        }
    };

    // Guardar costos
    const saveCosts = async () => {
        if (!selectedContainer) return;
        setSavingCosts(true);
        try {
            const res = await axios.put(
                `${API_URL}/api/maritime/containers/${selectedContainer.id}/costs`,
                { costs },
                { headers: { Authorization: `Bearer ${getToken()}` } }
            );
            setSnackbar({ open: true, message: res.data.message, severity: 'success' });
            setCostDialogOpen(false);
            fetchContainers();
        } catch (error) {
            console.error('Error saving costs:', error);
            setSnackbar({ open: true, message: t('maritime.errorSavingCosts'), severity: 'error' });
        } finally {
            setSavingCosts(false);
        }
    };

    // Crear contenedor
    const createContainer = async () => {
        try {
            await axios.post(`${API_URL}/api/maritime/containers`, newContainer, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setSnackbar({ open: true, message: t('maritime.containerCreated'), severity: 'success' });
            setNewContainerDialog(false);
            setNewContainer({ containerNumber: '', blNumber: '', eta: '', notes: '' });
            fetchContainers();
        } catch (error: unknown) {
            const axiosError = error as { response?: { data?: { error?: string } } };
            const msg = axiosError.response?.data?.error || t('maritime.errorCreating');
            setSnackbar({ open: true, message: msg, severity: 'error' });
        }
    };

    // Actualizar estado de contenedor
    const updateContainerStatus = async (containerId: number, newStatus: string) => {
        try {
            await axios.put(`${API_URL}/api/maritime/containers/${containerId}/status`, 
                { status: newStatus },
                { headers: { Authorization: `Bearer ${getToken()}` } }
            );
            setSnackbar({ open: true, message: t('maritime.statusUpdated'), severity: 'success' });
            fetchContainers();
        } catch {
            setSnackbar({ open: true, message: t('maritime.errorUpdatingStatus'), severity: 'error' });
        }
    };

    // Calcular totales en tiempo real
    const calculateTotals = () => {
        const aa = (costs.advance_1_amount || 0) + (costs.advance_2_amount || 0) + 
                   (costs.advance_3_amount || 0) + (costs.advance_4_amount || 0);
        const release = aa + (costs.debit_note_amount || 0) + (costs.demurrage_amount || 0) +
                       (costs.storage_amount || 0) + (costs.maneuvers_amount || 0) +
                       (costs.custody_amount || 0) + (costs.transport_amount || 0) +
                       (costs.other_amount || 0);
        return { aa, release };
    };

    const totals = calculateTotals();

    // Calcular porcentaje de completitud
    const calculateCompleteness = () => {
        let filled = 0;
        const total = 6; // Campos obligatorios mínimos
        if (costs.debit_note_amount > 0) filled++;
        if (costs.advance_1_amount > 0) filled++;
        if (costs.advance_2_amount > 0) filled++;
        if (costs.transport_amount > 0) filled++;
        if (costs.storage_amount > 0 || costs.demurrage_amount > 0) filled++;
        if (costs.maneuvers_amount > 0 || costs.custody_amount > 0) filled++;
        return Math.round((filled / total) * 100);
    };

    const getStatusLabel = (status: string) => {
        const config = STATUS_CONFIG[status];
        if (!config) return status;
        if (i18n.language === 'en') return config.labelEn;
        if (i18n.language === 'zh') return config.labelZh;
        return config.label;
    };

    // Cargar historial de tracking de un contenedor
    const loadTrackingHistory = async (containerId: number) => {
        setLoadingTracking(true);
        try {
            const res = await axios.get(`${API_URL}/api/admin/containers/${containerId}/tracking`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setTrackingLogs(res.data.tracking || []);
        } catch (error) {
            console.error('Error loading tracking:', error);
            setTrackingLogs([]);
        } finally {
            setLoadingTracking(false);
        }
    };

    // Suscribir contenedor a Vizion
    const subscribeToVizionTracking = async () => {
        if (!selectedContainer) return;
        setSubscribingVizion(true);
        try {
            const res = await axios.post(`${API_URL}/api/admin/vizion/subscribe`, {
                containerId: selectedContainer.id,
                containerNumber: selectedContainer.container_number,
                blNumber: selectedContainer.bl_number,
                carrierCode: selectedContainer.carrier_code || 'WHLC' // Default a Wan Hai
            }, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setSnackbar({ 
                open: true, 
                message: `🛰️ Tracking satelital activado: ${res.data.referenceId}`, 
                severity: 'success' 
            });
            // Recargar contenedor para ver el cambio
            fetchContainers();
            if (selectedContainer.id) {
                loadTrackingHistory(selectedContainer.id);
            }
        } catch (error: unknown) {
            const axiosError = error as { response?: { data?: { error?: string } } };
            setSnackbar({ 
                open: true, 
                message: axiosError.response?.data?.error || 'Error al suscribir a Vizion', 
                severity: 'error' 
            });
        } finally {
            setSubscribingVizion(false);
        }
    };

    // Agregar evento manual de tracking
    const addManualTrackingEvent = async (eventCode: string, eventDescription: string, location: string) => {
        if (!selectedContainer) return;
        try {
            await axios.post(`${API_URL}/api/admin/containers/${selectedContainer.id}/tracking/manual`, {
                eventCode,
                eventDescription,
                location
            }, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setSnackbar({ open: true, message: 'Evento de tracking agregado', severity: 'success' });
            loadTrackingHistory(selectedContainer.id);
        } catch {
            setSnackbar({ open: true, message: 'Error al agregar evento', severity: 'error' });
        }
    };

    // Sincronizar tracking desde la naviera (Wan Hai, etc.)
    const [syncingCarrier, setSyncingCarrier] = useState(false);
    const syncCarrierTracking = async () => {
        if (!selectedContainer) return;
        setSyncingCarrier(true);
        try {
            const response = await axios.post(`${API_URL}/api/admin/containers/${selectedContainer.id}/tracking/sync-carrier`, {}, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = response.data;
            if (data.success) {
                setSnackbar({ 
                    open: true, 
                    message: data.message || `Se sincronizaron ${data.events?.length || 0} eventos`, 
                    severity: 'success' 
                });
                loadTrackingHistory(selectedContainer.id);
            } else {
                setSnackbar({ open: true, message: data.error || 'Error al sincronizar', severity: 'error' });
            }
        } catch (error: any) {
            console.error('Error sincronizando tracking:', error);
            setSnackbar({ open: true, message: 'Error al sincronizar con la naviera', severity: 'error' });
        } finally {
            setSyncingCarrier(false);
        }
    };

    // Mapeo de eventos Vizion a íconos y colores
    const EVENT_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
        'VD': { icon: <BoatIcon />, color: '#2196F3', label: 'Vessel Departure' },
        'VA': { icon: <BoatIcon />, color: '#9C27B0', label: 'Vessel Arrival' },
        'DS': { icon: <ShippingIcon />, color: '#FF9800', label: 'Discharged' },
        'CR': { icon: <CheckCircleIcon />, color: '#4CAF50', label: 'Customs Released' },
        'GT': { icon: <ShippingIcon />, color: '#00BCD4', label: 'Gate Out' },
        'GI': { icon: <LocationIcon />, color: '#795548', label: 'Gate In' },
        'LO': { icon: <BoatIcon />, color: '#3F51B5', label: 'Loaded' },
        'AV': { icon: <BoatIcon />, color: '#E91E63', label: 'Arrived' },
        'DP': { icon: <PlayIcon />, color: '#009688', label: 'Departed' },
        'MANUAL': { icon: <ScheduleIcon />, color: '#607D8B', label: 'Manual Event' },
        'CARRIER': { icon: <BoatIcon />, color: '#1976D2', label: 'Carrier Event' },
        'WH': { icon: <BoatIcon />, color: '#E65100', label: 'Wan Hai' },
    };

    return (
        <Box sx={{ p: 3 }}>
            {/* Input oculto para subir archivos */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelected}
                accept=".pdf,.PDF"
                style={{ display: 'none' }}
            />
            
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <BoatIcon sx={{ fontSize: 40, color: SEA_COLOR }} />
                    <Box>
                        <Typography variant="h5" fontWeight="bold">
                            🚢 {t('maritime.costingTitle')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t('maritime.costingSubtitle')}
                        </Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={fetchContainers}
                    >
                        {t('common.refresh')}
                    </Button>
                </Box>
            </Box>

            {/* Stats Cards */}
            {stats && (
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <Card sx={{ bgcolor: '#E3F2FD' }}>
                            <CardContent>
                                <Typography color="text.secondary" variant="body2">
                                    {t('maritime.totalContainers')}
                                </Typography>
                                <Typography variant="h4" fontWeight="bold" color="#1976D2">
                                    {stats.totals.total_containers}
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <Card sx={{ bgcolor: '#FFF3E0' }}>
                            <CardContent>
                                <Typography color="text.secondary" variant="body2">
                                    {t('maritime.inTransit')}
                                </Typography>
                                <Typography variant="h4" fontWeight="bold" color="#F57C00">
                                    {stats.totals.in_transit_containers}
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <Card sx={{ bgcolor: '#E8F5E9' }}>
                            <CardContent>
                                <Typography color="text.secondary" variant="body2">
                                    {t('maritime.costed')}
                                </Typography>
                                <Typography variant="h4" fontWeight="bold" color="#388E3C">
                                    {stats.totals.costed_containers}
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <Card sx={{ bgcolor: '#F3E5F5' }}>
                            <CardContent>
                                <Typography color="text.secondary" variant="body2">
                                    {t('maritime.totalCosts')}
                                </Typography>
                                <Typography variant="h4" fontWeight="bold" color="#7B1FA2">
                                    ${parseFloat(stats.totalCosts || '0').toLocaleString()}
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            )}

            {/* Filtros */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        <TextField
                            size="small"
                            placeholder={t('maritime.searchPlaceholder')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            InputProps={{
                                startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
                            }}
                            sx={{ minWidth: 250 }}
                        />
                        <FormControl size="small" sx={{ minWidth: 180 }}>
                            <InputLabel>{t('maritime.status')}</InputLabel>
                            <Select
                                value={statusFilter}
                                label={t('maritime.status')}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <MenuItem value="all">{t('common.all')}</MenuItem>
                                {Object.keys(STATUS_CONFIG).map((key) => (
                                    <MenuItem key={key} value={key}>
                                        {getStatusLabel(key)}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                </CardContent>
            </Card>

            {/* Tabla de Contenedores */}
            <TableContainer component={Paper}>
                {loading && <LinearProgress />}
                <Table>
                    <TableHead sx={{ bgcolor: '#F5F5F5' }}>
                        <TableRow>
                            <TableCell><strong>{t('maritime.container')}</strong></TableCell>
                            <TableCell><strong>{t('maritime.blNumber')}</strong></TableCell>
                            <TableCell><strong>{t('maritime.route')}</strong></TableCell>
                            <TableCell><strong>{t('maritime.eta')}</strong></TableCell>
                            <TableCell><strong>{t('maritime.status')}</strong></TableCell>
                            <TableCell align="center"><strong>{t('maritime.packages')}</strong></TableCell>
                            <TableCell align="right"><strong>{t('maritime.weight')}</strong></TableCell>
                            <TableCell align="right"><strong>{t('maritime.cost')}</strong></TableCell>
                            <TableCell align="center"><strong>{t('common.actions')}</strong></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {containers.map((container) => (
                            <TableRow key={container.id} hover>
                                <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <BoatIcon sx={{ color: SEA_COLOR }} />
                                        <Typography fontWeight="bold">{container.container_number}</Typography>
                                    </Box>
                                </TableCell>
                                <TableCell>{container.bl_number || '-'}</TableCell>
                                <TableCell>
                                    <FormControl size="small" sx={{ minWidth: 140 }}>
                                        <Select
                                            value={container.route_id || ''}
                                            onChange={(e) => updateContainerRoute(container.id, e.target.value ? Number(e.target.value) : null)}
                                            displayEmpty
                                            sx={{ 
                                                bgcolor: container.route_code ? '#E3F2FD' : '#FFF3E0',
                                                '& .MuiSelect-select': { py: 0.5, fontFamily: 'monospace', fontWeight: 'bold', fontSize: '0.8rem' }
                                            }}
                                        >
                                            <MenuItem value="">
                                                <em>{t('maritime.noRoute')}</em>
                                            </MenuItem>
                                            {routes.filter(r => r.is_active).map((route) => (
                                                <MenuItem key={route.id} value={route.id}>
                                                    {route.code}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell>
                                    {container.eta ? new Date(container.eta).toLocaleDateString() : '-'}
                                </TableCell>
                                <TableCell>
                                    <FormControl size="small" sx={{ minWidth: 130 }}>
                                        <Select
                                            value={container.status}
                                            onChange={(e) => updateContainerStatus(container.id, e.target.value)}
                                            sx={{ 
                                                bgcolor: STATUS_CONFIG[container.status]?.color + '20',
                                                '& .MuiSelect-select': { py: 0.5 }
                                            }}
                                        >
                                            {Object.entries(STATUS_CONFIG).map(([key]) => (
                                                <MenuItem key={key} value={key}>
                                                    {getStatusLabel(key)}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell align="center">
                                    <Chip 
                                        label={container.shipment_count || container.total_packages || 0} 
                                        size="small" 
                                        color="primary" 
                                        variant="outlined"
                                    />
                                </TableCell>
                                <TableCell align="right">
                                    {container.total_weight_kg?.toLocaleString()} kg
                                </TableCell>
                                <TableCell align="right">
                                    {container.is_fully_costed ? (
                                        <Chip 
                                            icon={<CheckCircleIcon />}
                                            label={`$${container.calculated_release_cost?.toLocaleString() || container.final_cost_mxn?.toLocaleString()}`}
                                            color="success"
                                            size="small"
                                        />
                                    ) : (
                                        <Chip 
                                            icon={<WarningIcon />}
                                            label={t('maritime.pending')}
                                            color="warning"
                                            size="small"
                                        />
                                    )}
                                </TableCell>
                                <TableCell align="center">
                                    <Tooltip title={t('maritime.editCosts')}>
                                        <IconButton 
                                            color="primary"
                                            onClick={() => loadContainerCosts(container)}
                                        >
                                            <CalculateIcon />
                                        </IconButton>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        ))}
                        {containers.length === 0 && !loading && (
                            <TableRow>
                                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                                    <Typography color="text.secondary">
                                        {t('maritime.noContainers')}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Dialog: Nuevo Contenedor */}
            <Dialog open={newContainerDialog} onClose={() => setNewContainerDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ bgcolor: SEA_COLOR, color: 'white' }}>
                    🚢 {t('maritime.newContainer')}
                </DialogTitle>
                <DialogContent sx={{ mt: 2 }}>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                fullWidth
                                label={t('maritime.containerNumber')}
                                placeholder="MSKU1234567"
                                value={newContainer.containerNumber}
                                onChange={(e) => setNewContainer({ ...newContainer, containerNumber: e.target.value })}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                fullWidth
                                label={t('maritime.blNumber')}
                                placeholder="BL-2026-001"
                                value={newContainer.blNumber}
                                onChange={(e) => setNewContainer({ ...newContainer, blNumber: e.target.value })}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                fullWidth
                                type="date"
                                label={t('maritime.eta')}
                                value={newContainer.eta}
                                onChange={(e) => setNewContainer({ ...newContainer, eta: e.target.value })}
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                fullWidth
                                multiline
                                rows={2}
                                label={t('maritime.notes')}
                                value={newContainer.notes}
                                onChange={(e) => setNewContainer({ ...newContainer, notes: e.target.value })}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setNewContainerDialog(false)}>{t('common.cancel')}</Button>
                    <Button 
                        variant="contained" 
                        onClick={createContainer}
                        sx={{ bgcolor: SEA_COLOR }}
                        disabled={!newContainer.containerNumber}
                    >
                        {t('common.create')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog: Costeo de Contenedor */}
            <Dialog 
                open={costDialogOpen} 
                onClose={() => setCostDialogOpen(false)} 
                maxWidth="lg" 
                fullWidth
                PaperProps={{ sx: { maxHeight: '90vh' } }}
            >
                <DialogTitle sx={{ bgcolor: SEA_COLOR, color: 'white' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CalculateIcon />
                            <span>{t('maritime.costingContainer')}: {selectedContainer?.container_number}</span>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Chip 
                                label={`${calculateCompleteness()}% ${t('maritime.complete')}`}
                                color={calculateCompleteness() >= 80 ? 'success' : 'warning'}
                                sx={{ bgcolor: 'white' }}
                            />
                        </Box>
                    </Box>
                </DialogTitle>
                <DialogContent dividers>
                    <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                        <Tabs value={tabValue} onChange={(_, v) => {
                            setTabValue(v);
                            // Cargar tracking al cambiar a esa pestaña
                            if (v === 5 && selectedContainer) {
                                loadTrackingHistory(selectedContainer.id);
                            }
                        }}>
                            <Tab icon={<BoatIcon />} label={t('BL') || 'Datos BL'} />
                            <Tab icon={<ReceiptIcon />} label={t('maritime.navieraCosts')} />
                            <Tab icon={<AccountBalanceIcon />} label={t('maritime.customsCosts')} />
                            <Tab icon={<ShippingIcon />} label={t('maritime.logisticsCosts')} />
                            <Tab icon={<DescriptionIcon />} label={t('maritime.officialDocuments')} />
                            <Tab icon={<SatelliteIcon />} label="🛰️ Tracking" />
                        </Tabs>
                    </Box>

                    {/* Tab 0: Datos del BL */}
                    {tabValue === 0 && selectedContainer && (
                        <Grid container spacing={3}>
                            {/* Información Principal */}
                            <Grid size={{ xs: 12 }}>
                                <Alert severity="info" icon={<BoatIcon />}>
                                    📋 {t('Extraccion IA') || 'Información extraída automáticamente del Bill of Lading'}
                                </Alert>
                            </Grid>
                            
                            {/* Partes Involucradas */}
                            <Grid size={{ xs: 12, md: 6 }}>
                                <Card variant="outlined" sx={{ height: '100%' }}>
                                    <CardContent>
                                        <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ color: SEA_DARK }}>
                                            🏢 {t('Detalles') || 'Partes Involucradas'}
                                        </Typography>
                                        <Divider sx={{ mb: 2 }} />
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">SHIPPER</Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                    {selectedContainer.shipper || '-'}
                                                </Typography>
                                            </Box>
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">CONSIGNEE</Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                    {selectedContainer.consignee || '-'}
                                                </Typography>
                                            </Box>
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">CARRIER / NAVIERA</Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                    {selectedContainer.carrier || '-'}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>

                            {/* Números de Referencia */}
                            <Grid size={{ xs: 12, md: 6 }}>
                                <Card variant="outlined" sx={{ height: '100%' }}>
                                    <CardContent>
                                        <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ color: SEA_DARK }}>
                                            🔢 {t('References') || 'Referencias'}
                                        </Typography>
                                        <Divider sx={{ mb: 2 }} />
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">NO. B/L</Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 500, fontFamily: 'monospace' }}>
                                                    {selectedContainer.bl_number || '-'}
                                                </Typography>
                                            </Box>
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">NO. S/O</Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 500, fontFamily: 'monospace' }}>
                                                    {selectedContainer.so_number || '-'}
                                                </Typography>
                                            </Box>
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">NO. CONTENEDOR</Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 500, fontFamily: 'monospace' }}>
                                                    {selectedContainer.container_number || '-'}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>

                            {/* Detalles del Buque */}
                            <Grid size={{ xs: 12, md: 6 }}>
                                <Card variant="outlined" sx={{ height: '100%' }}>
                                    <CardContent>
                                        <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ color: SEA_DARK }}>
                                            🚢 {t('Vessel') || 'Detalles del Buque'}
                                        </Typography>
                                        <Divider sx={{ mb: 2 }} />
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">BUQUE</Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                    {selectedContainer.vessel_name || '-'}
                                                </Typography>
                                            </Box>
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">NO. VIAJE</Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                    {selectedContainer.voyage_number || '-'}
                                                </Typography>
                                            </Box>
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">FECHA EMBARQUE</Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                    {selectedContainer.laden_on_board || '-'}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>

                            {/* Puertos y Rutas */}
                            <Grid size={{ xs: 12, md: 6 }}>
                                <Card variant="outlined" sx={{ height: '100%' }}>
                                    <CardContent>
                                        <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ color: SEA_DARK }}>
                                            🌍 {t('Ruta de Puertos') || 'Puertos y Rutas'}
                                        </Typography>
                                        <Divider sx={{ mb: 2 }} />
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">PUERTO CARGA</Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                    {selectedContainer.port_of_loading || '-'}
                                                </Typography>
                                            </Box>
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">PUERTO DESCARGA</Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                    {selectedContainer.port_of_discharge || '-'}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>

                            {/* Resumen de Carga */}
                            <Grid size={{ xs: 12 }}>
                                <Card variant="outlined" sx={{ bgcolor: '#E3F2FD' }}>
                                    <CardContent>
                                        <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ color: SEA_DARK }}>
                                            📊 {t('Sumary') || 'Resumen de Carga'}
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">TOTAL BULTOS</Typography>
                                                <Typography variant="h6" fontWeight="bold">
                                                    {selectedContainer.total_packages || 0}
                                                </Typography>
                                            </Box>
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">PESO TOTAL (KG)</Typography>
                                                <Typography variant="h6" fontWeight="bold">
                                                    {formatCurrency(selectedContainer.total_weight_kg)} KGS
                                                </Typography>
                                            </Box>
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">VOLUMEN TOTAL</Typography>
                                                <Typography variant="h6" fontWeight="bold">
                                                    {formatCurrency(selectedContainer.total_cbm)} CBM
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    )}

                    {/* Tab 1: Gastos Naviera */}
                    {tabValue === 1 && (
                        <Grid container spacing={3}>
                            <Grid size={{ xs: 12, md: 6 }}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                                            <DescriptionIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                                            {t('maritime.debitNote')}
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
                                            <TextField
                                                label={t('maritime.debitNoteAmount')}
                                                type="number"
                                                size="small"
                                                value={costs.debit_note_amount || ''}
                                                onChange={(e) => setCosts(prev => ({ ...prev, debit_note_amount: parseFloat(e.target.value) || 0 }))}
                                                InputProps={{
                                                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                                }}
                                                sx={{ flex: 2 }}
                                            />
                                            <Tooltip title={costs.debit_note_pdf ? 'Gestionar archivo' : 'Adjuntar'}>
                                                <IconButton 
                                                    color={costs.debit_note_pdf ? 'success' : 'default'}
                                                    onClick={() => {
                                                        if (costs.debit_note_pdf) {
                                                            openFileModal(costs.debit_note_pdf, 'debit_note_pdf', 'Nota de Débito');
                                                        } else {
                                                            openFileSelector('debit_note_pdf');
                                                        }
                                                    }}
                                                >
                                                    {costs.debit_note_pdf ? <CheckCircleIcon /> : <AttachFileIcon />}
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                                            <TimelineIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                                            {t('maritime.demurrage')}
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
                                            <TextField
                                                label={t('maritime.demurrageAmount')}
                                                type="number"
                                                size="small"
                                                value={costs.demurrage_amount || ''}
                                                onChange={(e) => setCosts(prev => ({ ...prev, demurrage_amount: parseFloat(e.target.value) || 0 }))}
                                                InputProps={{
                                                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                                }}
                                                sx={{ flex: 2 }}
                                            />
                                            <Tooltip title={costs.demurrage_pdf ? 'Gestionar archivo' : 'Adjuntar'}>
                                                <IconButton 
                                                    color={costs.demurrage_pdf ? 'success' : 'default'}
                                                    onClick={() => {
                                                        if (costs.demurrage_pdf) {
                                                            openFileModal(costs.demurrage_pdf, 'demurrage_pdf', 'Demoras');
                                                        } else {
                                                            openFileSelector('demurrage_pdf');
                                                        }
                                                    }}
                                                >
                                                    {costs.demurrage_pdf ? <CheckCircleIcon /> : <AttachFileIcon />}
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    )}

                    {/* Tab 2: Gastos Aduanales (AA) */}
                    {tabValue === 2 && (
                        <Grid container spacing={3}>
                            <Grid size={{ xs: 12 }}>
                                <Alert severity="info" sx={{ mb: 2 }}>
                                    {t('maritime.customsInfo')}
                                </Alert>
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <Card variant="outlined" sx={{ borderColor: SEA_COLOR }}>
                                    <CardContent>
                                        <Typography variant="subtitle2" color="text.secondary">
                                            {t('maritime.advance')} 1
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                            <TextField
                                                label={t('maritime.amount')}
                                                type="number"
                                                size="small"
                                                value={costs.advance_1_amount || ''}
                                                onChange={(e) => setCosts(prev => ({ ...prev, advance_1_amount: parseFloat(e.target.value) || 0 }))}
                                                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                                sx={{ flex: 2 }}
                                            />
                                            <IconButton 
                                                color={costs.advance_1_pdf ? 'success' : 'default'}
                                                onClick={() => {
                                                    if (costs.advance_1_pdf) openFileModal(costs.advance_1_pdf, 'advance_1_pdf', 'Anticipo 1');
                                                    else openFileSelector('advance_1_pdf');
                                                }}
                                            >
                                                {costs.advance_1_pdf ? <CheckCircleIcon /> : <AttachFileIcon />}
                                            </IconButton>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <Card variant="outlined" sx={{ borderColor: SEA_COLOR }}>
                                    <CardContent>
                                        <Typography variant="subtitle2" color="text.secondary">
                                            {t('maritime.advance')} 2
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                            <TextField
                                                label={t('maritime.amount')}
                                                type="number"
                                                size="small"
                                                value={costs.advance_2_amount || ''}
                                                onChange={(e) => setCosts(prev => ({ ...prev, advance_2_amount: parseFloat(e.target.value) || 0 }))}
                                                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                                sx={{ flex: 2 }}
                                            />
                                            <IconButton 
                                                color={costs.advance_2_pdf ? 'success' : 'default'}
                                                onClick={() => {
                                                    if (costs.advance_2_pdf) openFileModal(costs.advance_2_pdf, 'advance_2_pdf', 'Anticipo 2');
                                                    else openFileSelector('advance_2_pdf');
                                                }}
                                            >
                                                {costs.advance_2_pdf ? <CheckCircleIcon /> : <AttachFileIcon />}
                                            </IconButton>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <Card variant="outlined" sx={{ borderColor: SEA_COLOR }}>
                                    <CardContent>
                                        <Typography variant="subtitle2" color="text.secondary">
                                            {t('maritime.advance')} 3
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                            <TextField
                                                label={t('maritime.amount')}
                                                type="number"
                                                size="small"
                                                value={costs.advance_3_amount || ''}
                                                onChange={(e) => setCosts(prev => ({ ...prev, advance_3_amount: parseFloat(e.target.value) || 0 }))}
                                                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                                sx={{ flex: 2 }}
                                            />
                                            <IconButton 
                                                color={costs.advance_3_pdf ? 'success' : 'default'}
                                                onClick={() => {
                                                    if (costs.advance_3_pdf) openFileModal(costs.advance_3_pdf, 'advance_3_pdf', 'Anticipo 3');
                                                    else openFileSelector('advance_3_pdf');
                                                }}
                                            >
                                                {costs.advance_3_pdf ? <CheckCircleIcon /> : <AttachFileIcon />}
                                            </IconButton>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <Card variant="outlined" sx={{ borderColor: SEA_COLOR }}>
                                    <CardContent>
                                        <Typography variant="subtitle2" color="text.secondary">
                                            {t('maritime.advance')} 4
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                            <TextField
                                                label={t('maritime.amount')}
                                                type="number"
                                                size="small"
                                                value={costs.advance_4_amount || ''}
                                                onChange={(e) => setCosts(prev => ({ ...prev, advance_4_amount: parseFloat(e.target.value) || 0 }))}
                                                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                                sx={{ flex: 2 }}
                                            />
                                            <IconButton 
                                                color={costs.advance_4_pdf ? 'success' : 'default'}
                                                onClick={() => {
                                                    if (costs.advance_4_pdf) openFileModal(costs.advance_4_pdf, 'advance_4_pdf', 'Anticipo 4');
                                                    else openFileSelector('advance_4_pdf');
                                                }}
                                            >
                                                {costs.advance_4_pdf ? <CheckCircleIcon /> : <AttachFileIcon />}
                                            </IconButton>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid size={{ xs: 12 }}>
                                <Card sx={{ bgcolor: '#E0F7FA' }}>
                                    <CardContent>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Typography variant="h6" fontWeight="bold">
                                                {t('maritime.totalAA')}
                                            </Typography>
                                            <Typography variant="h4" fontWeight="bold" color={SEA_DARK}>
                                                ${formatCurrency(totals.aa)}
                                            </Typography>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    )}

                    {/* Tab 3: Gastos Logísticos */}
                    {tabValue === 3 && (
                        <Grid container spacing={3}>
                            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                                            📦 {t('maritime.storage')}
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                            <TextField
                                                label={t('maritime.storageAmount')}
                                                type="number"
                                                size="small"
                                                value={costs.storage_amount || ''}
                                                onChange={(e) => setCosts(prev => ({ ...prev, storage_amount: parseFloat(e.target.value) || 0 }))}
                                                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                                sx={{ flex: 2 }}
                                            />
                                            <IconButton 
                                                color={costs.storage_pdf ? 'success' : 'default'}
                                                onClick={() => {
                                                    if (costs.storage_pdf) openFileModal(costs.storage_pdf, 'storage_pdf', 'Almacenaje');
                                                    else openFileSelector('storage_pdf');
                                                }}
                                            >
                                                {costs.storage_pdf ? <CheckCircleIcon /> : <AttachFileIcon />}
                                            </IconButton>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                                            🏗️ {t('maritime.maneuvers')}
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                            <TextField
                                                label={t('maritime.maneuversAmount')}
                                                type="number"
                                                size="small"
                                                value={costs.maneuvers_amount || ''}
                                                onChange={(e) => setCosts(prev => ({ ...prev, maneuvers_amount: parseFloat(e.target.value) || 0 }))}
                                                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                                sx={{ flex: 2 }}
                                            />
                                            <IconButton 
                                                color={costs.maneuvers_pdf ? 'success' : 'default'}
                                                onClick={() => {
                                                    if (costs.maneuvers_pdf) openFileModal(costs.maneuvers_pdf, 'maneuvers_pdf', 'Maniobras');
                                                    else openFileSelector('maneuvers_pdf');
                                                }}
                                            >
                                                {costs.maneuvers_pdf ? <CheckCircleIcon /> : <AttachFileIcon />}
                                            </IconButton>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                                            🔒 {t('maritime.custody')}
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                            <TextField
                                                label={t('maritime.custodyAmount')}
                                                type="number"
                                                size="small"
                                                value={costs.custody_amount || ''}
                                                onChange={(e) => setCosts(prev => ({ ...prev, custody_amount: parseFloat(e.target.value) || 0 }))}
                                                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                                sx={{ flex: 2 }}
                                            />
                                            <IconButton 
                                                color={costs.custody_pdf ? 'success' : 'default'}
                                                onClick={() => {
                                                    if (costs.custody_pdf) openFileModal(costs.custody_pdf, 'custody_pdf', 'Custodia');
                                                    else openFileSelector('custody_pdf');
                                                }}
                                            >
                                                {costs.custody_pdf ? <CheckCircleIcon /> : <AttachFileIcon />}
                                            </IconButton>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                                            🚚 {t('maritime.transport')}
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                            <TextField
                                                label={t('maritime.transportAmount')}
                                                type="number"
                                                size="small"
                                                value={costs.transport_amount || ''}
                                                onChange={(e) => setCosts(prev => ({ ...prev, transport_amount: parseFloat(e.target.value) || 0 }))}
                                                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                                sx={{ flex: 2 }}
                                            />
                                            <IconButton 
                                                color={costs.transport_pdf ? 'success' : 'default'}
                                                onClick={() => {
                                                    if (costs.transport_pdf) openFileModal(costs.transport_pdf, 'transport_pdf', 'Transporte');
                                                    else openFileSelector('transport_pdf');
                                                }}
                                            >
                                                {costs.transport_pdf ? <CheckCircleIcon /> : <AttachFileIcon />}
                                            </IconButton>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                                            📝 {t('maritime.other')}
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                                            <TextField
                                                label={t('maritime.otherAmount')}
                                                type="number"
                                                size="small"
                                                value={costs.other_amount || ''}
                                                onChange={(e) => setCosts(prev => ({ ...prev, other_amount: parseFloat(e.target.value) || 0 }))}
                                                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                                sx={{ flex: 2 }}
                                            />
                                            <IconButton 
                                                color={costs.other_pdf ? 'success' : 'default'}
                                                onClick={() => {
                                                    if (costs.other_pdf) openFileModal(costs.other_pdf, 'other_pdf', 'Otros Gastos');
                                                    else openFileSelector('other_pdf');
                                                }}
                                            >
                                                {costs.other_pdf ? <CheckCircleIcon /> : <AttachFileIcon />}
                                            </IconButton>
                                        </Box>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label={t('maritime.otherDescription')}
                                            value={costs.other_description || ''}
                                            onChange={(e) => setCosts(prev => ({ ...prev, other_description: e.target.value }))}
                                        />
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    )}

                    {/* Tab 4: Documentos Oficiales */}
                    {tabValue === 4 && (
                        <Grid container spacing={3}>
                            <Grid size={{ xs: 12 }}>
                                <Alert severity="info" sx={{ mb: 2 }}>
                                    📋 Suba los documentos oficiales del contenedor: TELEX RELEASE y Bill of Lading (BL)
                                </Alert>
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                                <Card variant="outlined" sx={{ borderColor: '#1976D2' }}>
                                    <CardContent>
                                        <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ color: '#1976D2' }}>
                                            📄 TELEX RELEASE
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                            Documento de liberación electrónica emitido por la naviera
                                        </Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                            {costs.telex_release_pdf ? (
                                                <>
                                                    <Button
                                                        variant="contained"
                                                        startIcon={<VisibilityIcon />}
                                                        sx={{ bgcolor: '#1976D2' }}
                                                        onClick={() => openFileModal(costs.telex_release_pdf!, 'telex_release_pdf', 'TELEX RELEASE')}
                                                    >
                                                        Ver Archivo
                                                    </Button>
                                                    <Chip
                                                        icon={<CheckCircleIcon />}
                                                        label="Subido"
                                                        color="success"
                                                        size="small"
                                                        onClick={() => openFileModal(costs.telex_release_pdf!, 'telex_release_pdf', 'TELEX RELEASE')}
                                                        onDelete={() => setCosts({ ...costs, telex_release_pdf: null })}
                                                    />
                                                </>
                                            ) : (
                                                <Button
                                                    variant="outlined"
                                                    startIcon={<AttachFileIcon />}
                                                    sx={{ borderColor: '#1976D2', color: '#1976D2' }}
                                                    onClick={() => openFileSelector('telex_release_pdf')}
                                                >
                                                    Adjuntar PDF
                                                </Button>
                                            )}
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                                <Card variant="outlined" sx={{ borderColor: '#2E7D32' }}>
                                    <CardContent>
                                        <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ color: '#2E7D32' }}>
                                            📜 BILL OF LADING (BL)
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                            Conocimiento de embarque original o copia oficial
                                        </Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                            {costs.bl_document_pdf ? (
                                                <>
                                                    <Button
                                                        variant="contained"
                                                        startIcon={<VisibilityIcon />}
                                                        sx={{ bgcolor: '#2E7D32' }}
                                                        onClick={() => openFileModal(costs.bl_document_pdf!, 'bl_document_pdf', 'Bill of Lading (BL)')}
                                                    >
                                                        Ver Archivo
                                                    </Button>
                                                    <Chip
                                                        icon={<CheckCircleIcon />}
                                                        label="Subido"
                                                        color="success"
                                                        size="small"
                                                        onClick={() => openFileModal(costs.bl_document_pdf!, 'bl_document_pdf', 'Bill of Lading (BL)')}
                                                        onDelete={() => setCosts({ ...costs, bl_document_pdf: null })}
                                                    />
                                                </>
                                            ) : (
                                                <Button
                                                    variant="outlined"
                                                    startIcon={<AttachFileIcon />}
                                                    sx={{ borderColor: '#2E7D32', color: '#2E7D32' }}
                                                    onClick={() => openFileSelector('bl_document_pdf')}
                                                >
                                                    Adjuntar PDF
                                                </Button>
                                            )}
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid size={{ xs: 12 }}>
                                <Card sx={{ bgcolor: '#FFF3E0', border: '1px solid #FF9800' }}>
                                    <CardContent>
                                        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <WarningIcon color="warning" />
                                            Estos documentos son requeridos para la liberación del contenedor. Asegúrese de subir los documentos correctos.
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    )}

                    {/* Tab 5: Tracking Satelital (Vizion) */}
                    {tabValue === 5 && selectedContainer && (
                        <Grid container spacing={3}>
                            <Grid size={{ xs: 12 }}>
                                <Alert 
                                    severity={selectedContainer.vizion_reference_id ? 'success' : 'info'} 
                                    icon={<SatelliteIcon />}
                                >
                                    {selectedContainer.vizion_reference_id 
                                        ? `🛰️ Tracking satelital activo - Ref: ${selectedContainer.vizion_reference_id}`
                                        : '🛰️ Activa el tracking satelital para recibir actualizaciones en tiempo real'
                                    }
                                </Alert>
                            </Grid>

                            {/* Botón de acceso directo al tracking de la naviera */}
                            {selectedContainer.bl_number && (
                                <Grid size={{ xs: 12 }}>
                                    <Card sx={{ bgcolor: '#E3F2FD', border: '1px solid #1976D2' }}>
                                        <CardContent>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                                                <Box>
                                                    <Typography variant="subtitle1" fontWeight="bold">
                                                        🌐 Tracking Directo de Naviera
                                                    </Typography>
                                                    <Typography variant="body2" color="text.secondary">
                                                        BL: <strong>{selectedContainer.bl_number}</strong> | Contenedor: <strong>{selectedContainer.container_number}</strong>
                                                    </Typography>
                                                </Box>
                                                <Button
                                                    variant="contained"
                                                    startIcon={<OpenInNewIcon />}
                                                    onClick={() => {
                                                        // Detectar naviera y abrir URL correspondiente
                                                        const blNumber = selectedContainer.bl_number;
                                                        const containerNumber = selectedContainer.container_number;
                                                        
                                                        // URLs de tracking por naviera (usando BL)
                                                        // Wan Hai usa BL number
                                                        if (containerNumber?.startsWith('WHSU') || selectedContainer.carrier_name?.toLowerCase().includes('wan hai')) {
                                                            window.open(`https://www.wanhai.com/views/cargoTrack/CargoTrack.xhtml?bno=${blNumber}`, '_blank');
                                                        }
                                                        // Evergreen
                                                        else if (containerNumber?.startsWith('EGLV') || selectedContainer.carrier_name?.toLowerCase().includes('evergreen')) {
                                                            window.open(`https://www.evergreen-line.com/eService/PublicFUN1_Tracking.html?SEARCH=${blNumber}`, '_blank');
                                                        }
                                                        // MSC
                                                        else if (containerNumber?.startsWith('MSCU') || selectedContainer.carrier_name?.toLowerCase().includes('msc')) {
                                                            window.open(`https://www.msc.com/track-a-shipment?agencyPath=mex&trackingNumber=${blNumber}`, '_blank');
                                                        }
                                                        // COSCO
                                                        else if (containerNumber?.startsWith('COSU') || selectedContainer.carrier_name?.toLowerCase().includes('cosco')) {
                                                            window.open(`https://elines.coscoshipping.com/ebtracking?trackingNumber=${blNumber}`, '_blank');
                                                        }
                                                        // CMA CGM
                                                        else if (containerNumber?.startsWith('CMAU') || selectedContainer.carrier_name?.toLowerCase().includes('cma')) {
                                                            window.open(`https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=BL&Reference=${blNumber}`, '_blank');
                                                        }
                                                        // Yang Ming
                                                        else if (containerNumber?.startsWith('YMLU') || selectedContainer.carrier_name?.toLowerCase().includes('yang ming')) {
                                                            window.open(`https://www.yangming.com/e-service/Track_Trace/track_trace_cargo_tracking.aspx?rdolType=BL&str=${blNumber}`, '_blank');
                                                        }
                                                        // Maersk
                                                        else if (containerNumber?.startsWith('MAEU') || selectedContainer.carrier_name?.toLowerCase().includes('maersk')) {
                                                            window.open(`https://www.maersk.com/tracking/${blNumber}`, '_blank');
                                                        }
                                                        // Default: Wan Hai (naviera más común en la ruta China-México)
                                                        else {
                                                            window.open(`https://www.wanhai.com/views/cargoTrack/CargoTrack.xhtml?bno=${blNumber}`, '_blank');
                                                        }
                                                    }}
                                                    sx={{ bgcolor: '#1976D2', '&:hover': { bgcolor: '#1565C0' } }}
                                                >
                                                    Abrir Tracking Naviera
                                                </Button>
                                            </Box>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            )}

                            {/* Botón para suscribir a Vizion */}
                            {!selectedContainer.vizion_reference_id && (
                                <Grid size={{ xs: 12 }}>
                                    <Card variant="outlined" sx={{ borderColor: '#00BCD4', bgcolor: '#E0F7FA' }}>
                                        <CardContent>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                                                <Box>
                                                    <Typography variant="subtitle1" fontWeight="bold">
                                                        Activar Tracking Satelital
                                                    </Typography>
                                                    <Typography variant="body2" color="text.secondary">
                                                        Recibe actualizaciones automáticas del contenedor vía Vizion API
                                                    </Typography>
                                                </Box>
                                                <Button
                                                    variant="contained"
                                                    startIcon={subscribingVizion ? <CircularProgress size={20} color="inherit" /> : <SatelliteIcon />}
                                                    onClick={subscribeToVizionTracking}
                                                    disabled={subscribingVizion || !selectedContainer.container_number}
                                                    sx={{ bgcolor: '#00BCD4', '&:hover': { bgcolor: '#0097A7' } }}
                                                >
                                                    {subscribingVizion ? 'Activando...' : 'Activar Tracking'}
                                                </Button>
                                            </Box>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            )}

                            {/* Último estado conocido */}
                            {selectedContainer.last_tracking_event && (
                                <Grid size={{ xs: 12 }}>
                                    <Card sx={{ bgcolor: '#E3F2FD' }}>
                                        <CardContent>
                                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                                ÚLTIMO EVENTO
                                            </Typography>
                                            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                                                <Box>
                                                    <Typography variant="h6" fontWeight="bold">
                                                        {selectedContainer.last_tracking_event}
                                                    </Typography>
                                                </Box>
                                                {selectedContainer.last_tracking_location && (
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                        <LocationIcon fontSize="small" color="action" />
                                                        <Typography variant="body2">
                                                            {selectedContainer.last_tracking_location}
                                                        </Typography>
                                                    </Box>
                                                )}
                                                {selectedContainer.last_tracking_date && (
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                        <ScheduleIcon fontSize="small" color="action" />
                                                        <Typography variant="body2">
                                                            {new Date(selectedContainer.last_tracking_date).toLocaleString()}
                                                        </Typography>
                                                    </Box>
                                                )}
                                            </Box>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            )}

                            {/* Timeline de eventos */}
                            <Grid size={{ xs: 12 }}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                                            <Typography variant="subtitle1" fontWeight="bold">
                                                <TimelineIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                                                Historial de Tracking
                                            </Typography>
                                            <Box sx={{ display: 'flex', gap: 1 }}>
                                                <Button
                                                    size="small"
                                                    variant="contained"
                                                    startIcon={syncingCarrier ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                                                    onClick={syncCarrierTracking}
                                                    disabled={syncingCarrier || !selectedContainer.bl_number}
                                                    sx={{ bgcolor: '#E65100', '&:hover': { bgcolor: '#BF360C' } }}
                                                >
                                                    {syncingCarrier ? 'Sincronizando...' : '🚢 Sincronizar Naviera'}
                                                </Button>
                                                <Button
                                                    size="small"
                                                    startIcon={<RefreshIcon />}
                                                    onClick={() => loadTrackingHistory(selectedContainer.id)}
                                                    disabled={loadingTracking}
                                                >
                                                    Actualizar
                                                </Button>
                                            </Box>
                                        </Box>
                                        
                                        {loadingTracking ? (
                                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                                <CircularProgress />
                                            </Box>
                                        ) : trackingLogs.length === 0 ? (
                                            <Box sx={{ textAlign: 'center', py: 4 }}>
                                                <SatelliteIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                                                <Typography color="text.secondary">
                                                    No hay eventos de tracking registrados
                                                </Typography>
                                            </Box>
                                        ) : (
                                            <Box sx={{ position: 'relative', pl: 3 }}>
                                                {/* Línea vertical */}
                                                <Box sx={{
                                                    position: 'absolute',
                                                    left: 12,
                                                    top: 0,
                                                    bottom: 0,
                                                    width: 2,
                                                    bgcolor: '#E0E0E0'
                                                }} />
                                                
                                                {trackingLogs.map((log, index) => {
                                                    const config = EVENT_CONFIG[log.event_code] || EVENT_CONFIG['MANUAL'];
                                                    return (
                                                        <Box 
                                                            key={log.id} 
                                                            sx={{ 
                                                                position: 'relative',
                                                                pb: index < trackingLogs.length - 1 ? 3 : 0,
                                                                pl: 3
                                                            }}
                                                        >
                                                            {/* Círculo del evento */}
                                                            <Box sx={{
                                                                position: 'absolute',
                                                                left: -3,
                                                                top: 4,
                                                                width: 28,
                                                                height: 28,
                                                                borderRadius: '50%',
                                                                bgcolor: config.color,
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                color: 'white',
                                                                fontSize: '0.9rem',
                                                                boxShadow: 2
                                                            }}>
                                                                {config.icon}
                                                            </Box>
                                                            
                                                            {/* Contenido del evento */}
                                                            <Card 
                                                                variant="outlined" 
                                                                sx={{ 
                                                                    borderLeft: `3px solid ${config.color}`,
                                                                    bgcolor: log.is_manual ? '#FFF8E1' : 'white'
                                                                }}
                                                            >
                                                                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
                                                                        <Box>
                                                                            <Typography variant="subtitle2" fontWeight="bold">
                                                                                {log.event_description || config.label}
                                                                                {log.is_manual && (
                                                                                    <Chip 
                                                                                        label="Manual" 
                                                                                        size="small" 
                                                                                        sx={{ ml: 1, height: 18, fontSize: '0.65rem' }} 
                                                                                    />
                                                                                )}
                                                                            </Typography>
                                                                            {log.location && (
                                                                                <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                                    <LocationIcon fontSize="small" />
                                                                                    {log.location}
                                                                                </Typography>
                                                                            )}
                                                                            {(log.vessel_name || log.voyage_number) && (
                                                                                <Typography variant="caption" color="text.secondary">
                                                                                    🚢 {log.vessel_name} {log.voyage_number && `V.${log.voyage_number}`}
                                                                                </Typography>
                                                                            )}
                                                                        </Box>
                                                                        <Typography variant="caption" color="text.secondary">
                                                                            {log.event_date ? new Date(log.event_date).toLocaleString() : '-'}
                                                                        </Typography>
                                                                    </Box>
                                                                </CardContent>
                                                            </Card>
                                                        </Box>
                                                    );
                                                })}
                                            </Box>
                                        )}
                                    </CardContent>
                                </Card>
                            </Grid>

                            {/* Agregar evento manual */}
                            <Grid size={{ xs: 12 }}>
                                <Card variant="outlined" sx={{ bgcolor: '#FAFAFA' }}>
                                    <CardContent>
                                        <Typography variant="subtitle2" gutterBottom>
                                            ✏️ Agregar Evento Manual
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                            <Button 
                                                size="small" 
                                                variant="outlined"
                                                onClick={() => addManualTrackingEvent('VD', 'Salida del Puerto Origen', selectedContainer.port_of_loading || '')}
                                            >
                                                🚢 Zarpe
                                            </Button>
                                            <Button 
                                                size="small" 
                                                variant="outlined"
                                                onClick={() => addManualTrackingEvent('VA', 'Llegada a Puerto Destino', selectedContainer.port_of_discharge || '')}
                                            >
                                                ⚓ Arribo
                                            </Button>
                                            <Button 
                                                size="small" 
                                                variant="outlined"
                                                onClick={() => addManualTrackingEvent('DS', 'Descarga del Buque', selectedContainer.port_of_discharge || '')}
                                            >
                                                📦 Descarga
                                            </Button>
                                            <Button 
                                                size="small" 
                                                variant="outlined"
                                                onClick={() => addManualTrackingEvent('CR', 'Liberado de Aduana', 'México')}
                                            >
                                                ✅ Liberado
                                            </Button>
                                            <Button 
                                                size="small" 
                                                variant="outlined"
                                                onClick={() => addManualTrackingEvent('GT', 'En Camino a CEDIS', 'México')}
                                            >
                                                🚚 En Tránsito Local
                                            </Button>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    )}

                    {/* Resumen Total */}
                    <Divider sx={{ my: 3 }} />
                    <Card sx={{ bgcolor: '#E8F5E9', border: '2px solid #4CAF50' }}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom textAlign="center">
                                {t('maritime.totalReleaseCost')}
                            </Typography>
                            <Typography variant="h3" fontWeight="bold" color="#2E7D32" textAlign="center">
                                ${formatCurrency(totals.release)} MXN
                            </Typography>
                            <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 1 }}>
                                {t('maritime.includesAll')}
                            </Typography>
                        </CardContent>
                    </Card>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setCostDialogOpen(false)}>
                        {t('common.cancel')}
                    </Button>
                    <Button 
                        variant="contained"
                        startIcon={savingCosts ? <CircularProgress size={20} /> : <SaveIcon />}
                        onClick={saveCosts}
                        disabled={savingCosts}
                        sx={{ bgcolor: SEA_COLOR, '&:hover': { bgcolor: SEA_DARK } }}
                    >
                        {savingCosts ? t('common.saving') : t('maritime.saveCosts')}
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

            {/* Modal de Gestión de Archivos PDF */}
            <Dialog 
                open={fileModal.open} 
                onClose={closeFileModal}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: SEA_COLOR, color: 'white' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <DescriptionIcon />
                        <Typography variant="h6">{fileModal.fieldLabel}</Typography>
                    </Box>
                    <IconButton onClick={closeFileModal} sx={{ color: 'white' }}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ p: 0 }}>
                    {/* Vista previa del PDF */}
                    {fileModal.url && (
                        <Box sx={{ width: '100%', height: '500px', bgcolor: '#f5f5f5' }}>
                            <iframe
                                src={fileModal.url}
                                style={{ width: '100%', height: '100%', border: 'none' }}
                                title={fileModal.fieldLabel}
                            />
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2, gap: 1, justifyContent: 'space-between' }}>
                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={handleDeleteFile}
                    >
                        Eliminar
                    </Button>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                            variant="outlined"
                            startIcon={<VisibilityIcon />}
                            onClick={() => window.open(fileModal.url, '_blank')}
                        >
                            Abrir en Nueva Pestaña
                        </Button>
                        <Button
                            variant="contained"
                            startIcon={<DownloadIcon />}
                            onClick={handleDownloadFile}
                            sx={{ bgcolor: SEA_COLOR, '&:hover': { bgcolor: SEA_DARK } }}
                        >
                            Descargar
                        </Button>
                    </Box>
                </DialogActions>
            </Dialog>

            {/* Diálogo de Confirmación Personalizado */}
            <Dialog
                open={confirmDialog.open}
                onClose={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
                maxWidth="xs"
                fullWidth
                PaperProps={{
                    sx: {
                        borderRadius: 3,
                        overflow: 'hidden'
                    }
                }}
            >
                <Box sx={{ 
                    bgcolor: '#FFF3E0', 
                    p: 3, 
                    textAlign: 'center',
                    borderBottom: '3px solid #FF9800'
                }}>
                    <Box sx={{ 
                        width: 70, 
                        height: 70, 
                        bgcolor: '#FF9800', 
                        borderRadius: '50%', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        margin: '0 auto 16px',
                        boxShadow: '0 4px 12px rgba(255,152,0,0.3)'
                    }}>
                        <WarningIcon sx={{ fontSize: 40, color: 'white' }} />
                    </Box>
                    <Typography variant="h5" fontWeight="bold" sx={{ color: '#E65100' }}>
                        {confirmDialog.title}
                    </Typography>
                </Box>
                <DialogContent sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                        {confirmDialog.message}
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2, gap: 1, justifyContent: 'center', bgcolor: '#fafafa' }}>
                    <Button
                        variant="outlined"
                        onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
                        sx={{ 
                            minWidth: 120,
                            borderRadius: 2,
                            textTransform: 'none',
                            fontWeight: 600
                        }}
                    >
                        Cancelar
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={confirmDialog.onConfirm}
                        startIcon={<DeleteIcon />}
                        sx={{ 
                            minWidth: 120,
                            borderRadius: 2,
                            textTransform: 'none',
                            fontWeight: 600,
                            boxShadow: '0 4px 12px rgba(244,67,54,0.3)'
                        }}
                    >
                        Sí, Eliminar
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
