import { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Button,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Alert,
    Snackbar,
    Chip,
    InputAdornment,
    Tooltip,
    Card,
    CardContent,
    Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import CategoryIcon from '@mui/icons-material/Category';
import PercentIcon from '@mui/icons-material/Percent';
import PaymentIcon from '@mui/icons-material/Payment';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import SyncIcon from '@mui/icons-material/Sync';
import { Switch, FormControlLabel, CircularProgress, Stack } from '@mui/material';
import { usePaymentStatus, toggleXPay, toggleEntregaxPayments, toggleFacturas, toggleGEX, toggleAdvisorInstructions, toggleAdvisorPaymentOrder, toggleAdvisorXpay, toggleRequirePaymentToLoad, toggleRequireLabelToLoad, toggleRequireInstructionsToLoadPobox, toggleExternalSync, toggleEntregaxPaymentQuery, toggleCajito, toggleMaintenanceMode, invalidatePaymentStatusCache } from '../hooks/usePaymentStatus';
import BrandAssetsManager from '../components/BrandAssetsManager';
import CommissionRatesTable from '../components/CommissionRatesTable';
import CajitoAuditDialog from '../components/CajitoAuditDialog';
import HistoryIcon from '@mui/icons-material/History';
import BuildIcon from '@mui/icons-material/Build';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';

interface ServiceType {
    id: number;
    service_type: string;
    label: string;
    percentage: number;
    leader_override: number;
    fiscal_emitter_id: number | null;
    updated_at: string;
}

interface NewServiceType {
    service_type: string;
    label: string;
    percentage: number;
    leader_override: number;
}

export default function SettingsPage() {
    const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'warning' });
    
    const [newService, setNewService] = useState<NewServiceType>({
        service_type: '',
        label: '',
        percentage: 5,
        leader_override: 10,
    });

    // Edición inline
    const [editValues, setEditValues] = useState<{ [key: number]: { percentage: number; leader_override: number } }>({});

    // Toggles del sistema de pagos (solo super_admin)
    const currentUser = (() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
    })();
    const isSuperAdmin = currentUser?.role === 'super_admin';
    const { xpayEnabled, entregaxPaymentsEnabled, entregaxPaymentsByService, gexEnabled, facturasEnabled, facturasByService, advisorInstructionsEnabled, advisorPaymentOrderEnabled, advisorXpayEnabled, requirePaymentToLoad, requireLabelToLoad, requireInstructionsToLoadPobox, externalSyncEnabled, entregaxPaymentQueryEnabled, cajitoEnabled, maintenanceMode, loading: paymentsStatusLoading } = usePaymentStatus();
    const [togglingXpay, setTogglingXpay] = useState(false);
    const [togglingEntregax, setTogglingEntregax] = useState(false);
    const [localFacturas, setLocalFacturas] = useState<boolean | null>(null);
    const [localFacturasByService, setLocalFacturasByService] = useState<{ pobox: boolean; maritimo: boolean; aereo: boolean; dhl: boolean } | null>(null);
    const [togglingFacturas, setTogglingFacturas] = useState(false);
    const [togglingFacturasService, setTogglingFacturasService] = useState<string | null>(null);
    const [togglingGex, setTogglingGex] = useState(false);
    const [togglingAdvisorInstr, setTogglingAdvisorInstr] = useState(false);
    const [togglingAdvisorPaymentOrder, setTogglingAdvisorPaymentOrder] = useState(false);
    const [togglingAdvisorXpay, setTogglingAdvisorXpay] = useState(false);
    const [togglingReqPayment, setTogglingReqPayment] = useState(false);
    const [togglingReqLabel, setTogglingReqLabel] = useState(false);
    const [togglingReqInstrPobox, setTogglingReqInstrPobox] = useState(false);
    // Estado local optimista que se sincroniza con el hook al cargar.
    const [localXpay, setLocalXpay] = useState<boolean | null>(null);
    const [localEntregax, setLocalEntregax] = useState<boolean | null>(null);
    const [localEntregaxByService, setLocalEntregaxByService] = useState<{ pobox: boolean; maritimo: boolean; aereo: boolean; dhl: boolean } | null>(null);
    const [togglingEntregaxService, setTogglingEntregaxService] = useState<string | null>(null);
    const [localGex, setLocalGex] = useState<boolean | null>(null);
    const [localAdvisorInstr, setLocalAdvisorInstr] = useState<boolean | null>(null);
    const [localAdvisorPaymentOrder, setLocalAdvisorPaymentOrder] = useState<boolean | null>(null);
    const [localAdvisorXpay, setLocalAdvisorXpay] = useState<boolean | null>(null);
    const [localReqPayment, setLocalReqPayment] = useState<boolean | null>(null);
    const [localReqLabel, setLocalReqLabel] = useState<boolean | null>(null);
    const [localReqInstrPobox, setLocalReqInstrPobox] = useState<boolean | null>(null);
    const [togglingExternalSync, setTogglingExternalSync] = useState(false);
    const [localExternalSync, setLocalExternalSync] = useState<boolean | null>(null);
    const [togglingPaymentQuery, setTogglingPaymentQuery] = useState(false);
    const [localPaymentQuery, setLocalPaymentQuery] = useState<boolean | null>(null);
    const [togglingCajito, setTogglingCajito] = useState(false);
    const [cajitoAuditOpen, setCajitoAuditOpen] = useState(false);
    const [localCajito, setLocalCajito] = useState<boolean | null>(null);
    const [togglingMaintenance, setTogglingMaintenance] = useState(false);
    const [localMaintenance, setLocalMaintenance] = useState<boolean | null>(null);
    const [externalSyncKey, setExternalSyncKey] = useState<string | null>(null);
    const [externalSyncKeyVisible, setExternalSyncKeyVisible] = useState(false);
    const [loadingKey, setLoadingKey] = useState(false);
    const [regeneratingKey, setRegeneratingKey] = useState(false);

    useEffect(() => {
        if (!paymentsStatusLoading) {
            setLocalXpay(xpayEnabled);
            setLocalEntregax(entregaxPaymentsEnabled);
            setLocalEntregaxByService(entregaxPaymentsByService);
            setLocalFacturas(facturasEnabled);
            setLocalFacturasByService(facturasByService);
            setLocalGex(gexEnabled);
            setLocalAdvisorInstr(advisorInstructionsEnabled);
            setLocalAdvisorPaymentOrder(advisorPaymentOrderEnabled);
            setLocalAdvisorXpay(advisorXpayEnabled);
            setLocalReqPayment(requirePaymentToLoad);
            setLocalReqLabel(requireLabelToLoad);
            setLocalReqInstrPobox(requireInstructionsToLoadPobox);
            setLocalExternalSync(externalSyncEnabled);
            setLocalPaymentQuery(entregaxPaymentQueryEnabled);
            setLocalCajito(cajitoEnabled);
            setLocalMaintenance(maintenanceMode);
        }
    }, [paymentsStatusLoading, xpayEnabled, entregaxPaymentsEnabled, entregaxPaymentsByService, gexEnabled, facturasEnabled, facturasByService, advisorInstructionsEnabled, advisorPaymentOrderEnabled, advisorXpayEnabled, requirePaymentToLoad, requireLabelToLoad, requireInstructionsToLoadPobox, externalSyncEnabled, cajitoEnabled, maintenanceMode]);

    const handleToggleXpay = async (checked: boolean) => {
        setTogglingXpay(true);
        const prev = localXpay;
        setLocalXpay(checked);
        try {
            await toggleXPay(checked);
            invalidatePaymentStatusCache();
            setSnackbar({ open: true, message: `X-Pay ${checked ? 'activado' : 'desactivado'} correctamente`, severity: 'success' });
        } catch (err: any) {
            setLocalXpay(prev);
            setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo cambiar X-Pay', severity: 'error' });
        } finally {
            setTogglingXpay(false);
        }
    };
    const handleToggleEntregax = async (checked: boolean) => {
        setTogglingEntregax(true);
        const prev = localEntregax;
        setLocalEntregax(checked);
        try {
            await toggleEntregaxPayments({ enabled: checked });
            invalidatePaymentStatusCache();
            setSnackbar({ open: true, message: `Pagos EntregaX ${checked ? 'activados' : 'desactivados'} correctamente`, severity: 'success' });
        } catch (err: any) {
            setLocalEntregax(prev);
            setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo cambiar Pagos EntregaX', severity: 'error' });
        } finally {
            setTogglingEntregax(false);
        }
    };
    const handleToggleEntregaxService = async (key: 'pobox' | 'maritimo' | 'aereo' | 'dhl', checked: boolean) => {
        setTogglingEntregaxService(key);
        const prev = localEntregaxByService;
        setLocalEntregaxByService(prev ? { ...prev, [key]: checked } : null);
        try {
            await toggleEntregaxPayments({ by_service: { [key]: checked } });
            invalidatePaymentStatusCache();
            const labelMap: Record<string, string> = { pobox: 'PO Box USA', maritimo: 'Marítimo China', aereo: 'Aéreo China', dhl: 'DHL Nacional' };
            setSnackbar({ open: true, message: `${labelMap[key]}: pagos ${checked ? 'activados' : 'desactivados'}`, severity: 'success' });
        } catch (err: any) {
            setLocalEntregaxByService(prev);
            setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo cambiar el servicio', severity: 'error' });
        } finally {
            setTogglingEntregaxService(null);
        }
    };
    const handleToggleFacturas = async (checked: boolean) => {
        setTogglingFacturas(true);
        const prev = localFacturas;
        setLocalFacturas(checked);
        try {
            await toggleFacturas({ enabled: checked });
            invalidatePaymentStatusCache();
            setSnackbar({ open: true, message: `Facturación automática ${checked ? 'activada' : 'desactivada'}`, severity: 'success' });
        } catch (err: any) {
            setLocalFacturas(prev);
            setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo cambiar Facturas EntregaX', severity: 'error' });
        } finally {
            setTogglingFacturas(false);
        }
    };
    const handleToggleFacturasService = async (key: 'pobox' | 'maritimo' | 'aereo' | 'dhl', checked: boolean) => {
        setTogglingFacturasService(key);
        const prev = localFacturasByService;
        setLocalFacturasByService(prev ? { ...prev, [key]: checked } : null);
        try {
            await toggleFacturas({ by_service: { [key]: checked } });
            invalidatePaymentStatusCache();
            const labelMap: Record<string, string> = { pobox: 'PO Box USA', maritimo: 'Marítimo China', aereo: 'Aéreo China', dhl: 'DHL Nacional' };
            setSnackbar({ open: true, message: `${labelMap[key]}: facturación automática ${checked ? 'activada' : 'desactivada'}`, severity: 'success' });
        } catch (err: any) {
            setLocalFacturasByService(prev);
            setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo cambiar el servicio', severity: 'error' });
        } finally {
            setTogglingFacturasService(null);
        }
    };
    const handleToggleGex = async (checked: boolean) => {
        setTogglingGex(true);
        const prev = localGex;
        setLocalGex(checked);
        try {
            await toggleGEX(checked);
            invalidatePaymentStatusCache();
            setSnackbar({ open: true, message: `Garantía Extendida ${checked ? 'activada' : 'desactivada'} correctamente`, severity: 'success' });
        } catch (err: any) {
            setLocalGex(prev);
            setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo cambiar GEX', severity: 'error' });
        } finally {
            setTogglingGex(false);
        }
    };
    const handleToggleAdvisorInstr = async (checked: boolean) => {
        setTogglingAdvisorInstr(true);
        const prev = localAdvisorInstr;
        setLocalAdvisorInstr(checked);
        try {
            await toggleAdvisorInstructions(checked);
            invalidatePaymentStatusCache();
            setSnackbar({ open: true, message: `Instrucciones de asesores ${checked ? 'activadas' : 'desactivadas'} correctamente`, severity: 'success' });
        } catch (err: any) {
            setLocalAdvisorInstr(prev);
            setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo cambiar', severity: 'error' });
        } finally {
            setTogglingAdvisorInstr(false);
        }
    };
    const handleToggleAdvisorPaymentOrder = async (checked: boolean) => {
        setTogglingAdvisorPaymentOrder(true);
        const prev = localAdvisorPaymentOrder;
        setLocalAdvisorPaymentOrder(checked);
        try {
            await toggleAdvisorPaymentOrder(checked);
            invalidatePaymentStatusCache();
            setSnackbar({ open: true, message: `Orden de Pago ${checked ? 'activada' : 'desactivada'} correctamente`, severity: 'success' });
        } catch (err: any) {
            setLocalAdvisorPaymentOrder(prev);
            setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo cambiar', severity: 'error' });
        } finally {
            setTogglingAdvisorPaymentOrder(false);
        }
    };
    const handleToggleAdvisorXpay = async (checked: boolean) => {
        setTogglingAdvisorXpay(true);
        const prev = localAdvisorXpay;
        setLocalAdvisorXpay(checked);
        try {
            await toggleAdvisorXpay(checked);
            invalidatePaymentStatusCache();
            setSnackbar({ open: true, message: `Xpay Asesor ${checked ? 'activado' : 'desactivado'} correctamente`, severity: 'success' });
        } catch (err: any) {
            setLocalAdvisorXpay(prev);
            setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo cambiar', severity: 'error' });
        } finally {
            setTogglingAdvisorXpay(false);
        }
    };
    const handleToggleReqPayment = async (checked: boolean) => {
        setTogglingReqPayment(true);
        const prev = localReqPayment;
        setLocalReqPayment(checked);
        try {
            await toggleRequirePaymentToLoad(checked);
            invalidatePaymentStatusCache();
            setSnackbar({ open: true, message: `Requisito de pago para carga ${checked ? 'activado' : 'desactivado'} correctamente`, severity: 'success' });
        } catch (err: any) {
            setLocalReqPayment(prev);
            setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo cambiar', severity: 'error' });
        } finally {
            setTogglingReqPayment(false);
        }
    };
    const handleToggleReqLabel = async (checked: boolean) => {
        setTogglingReqLabel(true);
        const prev = localReqLabel;
        setLocalReqLabel(checked);
        try {
            await toggleRequireLabelToLoad(checked);
            invalidatePaymentStatusCache();
            setSnackbar({ open: true, message: `Requisito de etiqueta para carga ${checked ? 'activado' : 'desactivado'} correctamente`, severity: 'success' });
        } catch (err: any) {
            setLocalReqLabel(prev);
            setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo cambiar', severity: 'error' });
        } finally {
            setTogglingReqLabel(false);
        }
    };
    const handleToggleReqInstrPobox = async (checked: boolean) => {
        setTogglingReqInstrPobox(true);
        const prev = localReqInstrPobox;
        setLocalReqInstrPobox(checked);
        try {
            await toggleRequireInstructionsToLoadPobox(checked);
            invalidatePaymentStatusCache();
            setSnackbar({ open: true, message: `Requisito de instrucciones PO Box ${checked ? 'activado' : 'desactivado'} correctamente`, severity: 'success' });
        } catch (err: any) {
            setLocalReqInstrPobox(prev);
            setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo cambiar', severity: 'error' });
        } finally {
            setTogglingReqInstrPobox(false);
        }
    };

    const handleToggleExternalSync = async (checked: boolean) => {
        setTogglingExternalSync(true);
        const prev = localExternalSync;
        setLocalExternalSync(checked);
        try {
            await toggleExternalSync(checked);
            invalidatePaymentStatusCache();
            setSnackbar({ open: true, message: `Sincronización EX ${checked ? 'activada' : 'desactivada'} correctamente`, severity: 'success' });
        } catch (err: any) {
            setLocalExternalSync(prev);
            setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo cambiar el estado de sincronización', severity: 'error' });
        } finally {
            setTogglingExternalSync(false);
        }
    };

    const handleTogglePaymentQuery = async (checked: boolean) => {
        setTogglingPaymentQuery(true);
        const prev = localPaymentQuery;
        setLocalPaymentQuery(checked);
        try {
            await toggleEntregaxPaymentQuery(checked);
            invalidatePaymentStatusCache();
            setSnackbar({ open: true, message: `Consulta de pagos ${checked ? 'activada' : 'desactivada'} correctamente`, severity: 'success' });
        } catch (err: any) {
            setLocalPaymentQuery(prev);
            setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo cambiar el estado', severity: 'error' });
        } finally {
            setTogglingPaymentQuery(false);
        }
    };

    const handleToggleCajito = async (checked: boolean) => {
        setTogglingCajito(true);
        const prev = localCajito;
        setLocalCajito(checked);
        try {
            await toggleCajito(checked);
            invalidatePaymentStatusCache();
            setSnackbar({ open: true, message: `Cajito (IA) ${checked ? 'activado' : 'desactivado'} correctamente`, severity: 'success' });
        } catch (err: any) {
            setLocalCajito(prev);
            setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo cambiar el estado de Cajito', severity: 'error' });
        } finally {
            setTogglingCajito(false);
        }
    };

    const handleToggleMaintenance = async (checked: boolean) => {
        setTogglingMaintenance(true);
        const prev = localMaintenance;
        setLocalMaintenance(checked);
        try {
            await toggleMaintenanceMode(checked);
            invalidatePaymentStatusCache();
            setSnackbar({ open: true, message: `Modo mantenimiento ${checked ? 'activado' : 'desactivado'}`, severity: checked ? 'warning' : 'success' });
        } catch (err: any) {
            setLocalMaintenance(prev);
            setSnackbar({ open: true, message: err?.response?.data?.error || 'No se pudo cambiar el modo de mantenimiento', severity: 'error' });
        } finally {
            setTogglingMaintenance(false);
        }
    };

    const fetchExternalSyncKey = async () => {
        setLoadingKey(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/admin/system/external-sync-key`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setExternalSyncKey(data.key || null);
            setExternalSyncKeyVisible(true);
        } catch {
            setSnackbar({ open: true, message: 'No se pudo obtener la API key', severity: 'error' });
        } finally {
            setLoadingKey(false);
        }
    };

    const handleRegenerateKey = async () => {
        setRegeneratingKey(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/admin/system/external-sync-key/regenerate`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setExternalSyncKey(data.key);
                setExternalSyncKeyVisible(true);
                setSnackbar({ open: true, message: 'API Key regenerada. Compártela con el equipo de sistemas.', severity: 'success' });
            }
        } catch {
            setSnackbar({ open: true, message: 'No se pudo regenerar la API key', severity: 'error' });
        } finally {
            setRegeneratingKey(false);
        }
    };

    const getAuthHeaders = () => {
        const token = localStorage.getItem('token');
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    };

    const fetchServiceTypes = async () => {
        try {
            const response = await fetch(`${API_URL}/admin/commissions`, {
                headers: getAuthHeaders()
            });
            if (response.ok) {
                const data = await response.json();
                setServiceTypes(data);
                // Inicializar valores de edición
                const values: { [key: number]: { percentage: number; leader_override: number } } = {};
                data.forEach((st: ServiceType) => {
                    values[st.id] = { percentage: st.percentage, leader_override: st.leader_override };
                });
                setEditValues(values);
            }
        } catch (error) {
            console.error('Error fetching service types:', error);
            setSnackbar({ open: true, message: 'Error al cargar tipos de servicio', severity: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchServiceTypes();
    }, []);

    const handleCreateService = async () => {
        if (!newService.service_type || !newService.label) {
            setSnackbar({ open: true, message: 'Código y nombre son requeridos', severity: 'error' });
            return;
        }

        try {
            const response = await fetch(`${API_URL}/admin/service-types`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(newService)
            });

            if (response.ok) {
                setSnackbar({ open: true, message: 'Tipo de servicio creado correctamente', severity: 'success' });
                setDialogOpen(false);
                setNewService({ service_type: '', label: '', percentage: 5, leader_override: 10 });
                fetchServiceTypes();
            } else {
                const error = await response.json();
                setSnackbar({ open: true, message: error.error || 'Error al crear', severity: 'error' });
            }
        } catch (error) {
            console.error('Error creating service type:', error);
            setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
        }
    };

    const handleUpdateService = async (id: number) => {
        const values = editValues[id];
        if (!values) return;

        try {
            const response = await fetch(`${API_URL}/admin/commissions`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    id,
                    percentage: values.percentage,
                    leader_override: values.leader_override
                })
            });

            if (response.ok) {
                setSnackbar({ open: true, message: 'Tarifa actualizada', severity: 'success' });
                setEditingId(null);
                fetchServiceTypes();
            } else {
                const error = await response.json();
                setSnackbar({ open: true, message: error.error || 'Error al actualizar', severity: 'error' });
            }
        } catch (error) {
            console.error('Error updating service type:', error);
            setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
        }
    };

    const handleDeleteService = async (id: number) => {
        if (!confirm('¿Estás seguro de eliminar este tipo de servicio?')) return;

        try {
            const response = await fetch(`${API_URL}/admin/service-types/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });

            if (response.ok) {
                setSnackbar({ open: true, message: 'Tipo de servicio eliminado', severity: 'success' });
                fetchServiceTypes();
            } else {
                const error = await response.json();
                setSnackbar({ open: true, message: error.error || 'Error al eliminar', severity: 'error' });
            }
        } catch (error) {
            console.error('Error deleting service type:', error);
            setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
        }
    };

    const generateServiceCode = (label: string): string => {
        return label
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 30);
    };

    return (
        <Box>
            {/* Header */}
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h5" fontWeight={700} color="text.primary">
                        ⚙️ Configuración del Sistema
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Gestiona los tipos de servicio y tarifas de comisión
                    </Typography>
                </Box>
            </Box>

            {/* Modo Mantenimiento — solo super_admin */}
            {isSuperAdmin && (
                <Card elevation={0} sx={{ border: 2, borderColor: localMaintenance ? 'error.main' : 'divider', borderRadius: 3, mb: 3 }}>
                    <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <BuildIcon sx={{ color: localMaintenance ? '#d32f2f' : 'text.secondary' }} />
                            <Typography variant="h6" fontWeight={600}>
                                Modo Mantenimiento
                            </Typography>
                            <Chip label="Super Admin" size="small" color="warning" sx={{ ml: 1 }} />
                            {localMaintenance && <Chip label="ACTIVO" size="small" color="error" sx={{ ml: 0.5 }} />}
                        </Box>
                        <Alert severity="error" sx={{ mb: 2 }}>
                            Al activar, <strong>todos los usuarios no administradores</strong> (web, app móvil y API externa) recibirán un error 503. Úsalo antes de mover o restaurar la base de datos.
                        </Alert>
                        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, borderColor: localMaintenance ? 'error.light' : undefined }}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="subtitle1" fontWeight={600}>
                                    🔧 Sistema en Mantenimiento
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Bloquea todas las peticiones de clientes y usuarios no admin. Los administradores pueden seguir operando con normalidad.
                                </Typography>
                            </Box>
                            {paymentsStatusLoading || localMaintenance === null ? (
                                <CircularProgress size={20} />
                            ) : (
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={!!localMaintenance}
                                            onChange={(e) => handleToggleMaintenance(e.target.checked)}
                                            disabled={togglingMaintenance}
                                            color="error"
                                        />
                                    }
                                    label={togglingMaintenance ? '...' : (localMaintenance ? 'Activado' : 'Desactivado')}
                                    labelPlacement="start"
                                    sx={{ m: 0 }}
                                />
                            )}
                        </Paper>
                    </CardContent>
                </Card>
            )}

            {/* Sistema de Pagos — solo super_admin */}
            {isSuperAdmin && (
                <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, mb: 3 }}>
                    <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <PaymentIcon sx={{ color: '#F05A28' }} />
                            <Typography variant="h6" fontWeight={600}>
                                Sistema de Pagos
                            </Typography>
                            <Chip label="Super Admin" size="small" color="warning" sx={{ ml: 1 }} />
                        </Box>
                        <Alert severity="warning" sx={{ mb: 3 }}>
                            Estos toggles cierran o abren el flujo de cobro <strong>en producción</strong>. Apagarlos detiene
                            inmediatamente cualquier intento de pago de los clientes desde web y app móvil.
                        </Alert>

                        <Stack spacing={2}>
                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle1" fontWeight={600}>
                                        💳 X-Pay (x-pay.direct)
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Pasarela externa para tarjeta. Si está desactivada, el botón "X-Pay" no carga
                                        en el dashboard del cliente.
                                    </Typography>
                                </Box>
                                {paymentsStatusLoading || localXpay === null ? (
                                    <CircularProgress size={20} />
                                ) : (
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={!!localXpay}
                                                onChange={(e) => handleToggleXpay(e.target.checked)}
                                                disabled={togglingXpay}
                                                color="success"
                                            />
                                        }
                                        label={togglingXpay ? '...' : (localXpay ? 'Activado' : 'Desactivado')}
                                        labelPlacement="start"
                                        sx={{ m: 0 }}
                                    />
                                )}
                            </Paper>

                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography variant="subtitle1" fontWeight={600}>
                                            🏦 Pagos EntregaX (Sucursal / Transferencia)
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Flujo nativo de pago en sucursal y SPEI. Si está desactivado, el botón "Pagar"
                                            en la lista de paquetes queda deshabilitado.
                                        </Typography>
                                    </Box>
                                    {paymentsStatusLoading || localEntregax === null ? (
                                        <CircularProgress size={20} />
                                    ) : (
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    checked={!!localEntregax}
                                                    onChange={(e) => handleToggleEntregax(e.target.checked)}
                                                    disabled={togglingEntregax}
                                                    color="success"
                                                />
                                            }
                                            label={togglingEntregax ? '...' : (localEntregax ? 'Activado' : 'Desactivado')}
                                            labelPlacement="start"
                                            sx={{ m: 0 }}
                                        />
                                    )}
                                </Box>

                                {/* Sub-toggles por servicio */}
                                {!paymentsStatusLoading && localEntregaxByService && (
                                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed', borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                                            Habilitar pagos EntregaX por tipo de servicio (master debe estar activado):
                                        </Typography>
                                        {([
                                            { key: 'pobox',    label: '📦 PO Box USA',        desc: 'Cliente puede pagar paquetes PO Box USA con sucursal / SPEI.' },
                                            { key: 'maritimo', label: '🚢 Marítimo China',   desc: 'Cliente puede pagar embarques marítimos consolidados.' },
                                            { key: 'aereo',    label: '✈️ Aéreo China',       desc: 'Cliente puede pagar envíos aéreos (TDI / Express).' },
                                            { key: 'dhl',      label: '🚚 DHL Nacional',      desc: 'Cliente puede pagar guías DHL nacionales.' },
                                        ] as const).map(svc => (
                                            <Box key={svc.key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, pl: 1 }}>
                                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                                    <Typography variant="body2" fontWeight={600}>{svc.label}</Typography>
                                                    <Typography variant="caption" color="text.secondary">{svc.desc}</Typography>
                                                </Box>
                                                <FormControlLabel
                                                    control={
                                                        <Switch
                                                            size="small"
                                                            checked={!!localEntregaxByService[svc.key]}
                                                            onChange={(e) => handleToggleEntregaxService(svc.key, e.target.checked)}
                                                            disabled={togglingEntregaxService === svc.key || !localEntregax}
                                                            color="success"
                                                        />
                                                    }
                                                    label={togglingEntregaxService === svc.key ? '...' : (localEntregaxByService[svc.key] ? 'On' : 'Off')}
                                                    labelPlacement="start"
                                                    sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 12, color: 'text.secondary', minWidth: 28 } }}
                                                />
                                            </Box>
                                        ))}
                                        {!localEntregax && (
                                            <Typography variant="caption" color="warning.main" sx={{ mt: 0.5 }}>
                                                ⚠️ El master switch está desactivado: ningún servicio acepta pagos EntregaX aunque su sub-toggle esté en On.
                                            </Typography>
                                        )}
                                    </Box>
                                )}
                            </Paper>

                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography variant="subtitle1" fontWeight={600}>
                                            🧾 Facturas EntregaX
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Facturación automática (timbrado inmediato). Si está desactivado, las
                                            solicitudes de factura (cliente y asesor, app y web) van a "Pendientes por
                                            Timbrar" en Contabilidad para emitirse manualmente.
                                        </Typography>
                                    </Box>
                                    {paymentsStatusLoading || localFacturas === null ? (
                                        <CircularProgress size={20} />
                                    ) : (
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    checked={!!localFacturas}
                                                    onChange={(e) => handleToggleFacturas(e.target.checked)}
                                                    disabled={togglingFacturas}
                                                    color="success"
                                                />
                                            }
                                            label={togglingFacturas ? '...' : (localFacturas ? 'Activado' : 'Desactivado')}
                                            labelPlacement="start"
                                            sx={{ m: 0 }}
                                        />
                                    )}
                                </Box>

                                {/* Sub-toggles por servicio */}
                                {!paymentsStatusLoading && localFacturasByService && (
                                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed', borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                                            Facturación automática por tipo de servicio (master debe estar activado):
                                        </Typography>
                                        {([
                                            { key: 'pobox',    label: '📦 PO Box USA',      desc: 'Timbrado automático para paquetes PO Box USA.' },
                                            { key: 'maritimo', label: '🚢 Marítimo China',  desc: 'Timbrado automático para embarques marítimos.' },
                                            { key: 'aereo',    label: '✈️ Aéreo China',      desc: 'Timbrado automático para envíos aéreos (TDI / Express).' },
                                            { key: 'dhl',      label: '🚚 DHL Nacional',     desc: 'Timbrado automático para guías DHL nacionales.' },
                                        ] as const).map(svc => (
                                            <Box key={svc.key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, pl: 1 }}>
                                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                                    <Typography variant="body2" fontWeight={600}>{svc.label}</Typography>
                                                    <Typography variant="caption" color="text.secondary">{svc.desc}</Typography>
                                                </Box>
                                                <FormControlLabel
                                                    control={
                                                        <Switch
                                                            size="small"
                                                            checked={!!localFacturasByService[svc.key]}
                                                            onChange={(e) => handleToggleFacturasService(svc.key, e.target.checked)}
                                                            disabled={togglingFacturasService === svc.key || !localFacturas}
                                                            color="success"
                                                        />
                                                    }
                                                    label={togglingFacturasService === svc.key ? '...' : (localFacturasByService[svc.key] ? 'On' : 'Off')}
                                                    labelPlacement="start"
                                                    sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 12, color: 'text.secondary', minWidth: 28 } }}
                                                />
                                            </Box>
                                        ))}
                                        {!localFacturas && (
                                            <Typography variant="caption" color="warning.main" sx={{ mt: 0.5 }}>
                                                ⚠️ Master desactivado: todas las solicitudes de factura van a Pendientes por Timbrar, sin importar los sub-toggles.
                                            </Typography>
                                        )}
                                    </Box>
                                )}
                            </Paper>

                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle1" fontWeight={600}>
                                        🛡️ Garantía Extendida (GEX)
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Permite a los clientes contratar la Garantía Extendida de tiempo de entrega
                                        (90 días) sobre sus paquetes. Si se desactiva, el botón "Contratar GEX"
                                        deja de aparecer en la app móvil y en el portal web.
                                    </Typography>
                                </Box>
                                {paymentsStatusLoading || localGex === null ? (
                                    <CircularProgress size={20} />
                                ) : (
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={!!localGex}
                                                onChange={(e) => handleToggleGex(e.target.checked)}
                                                disabled={togglingGex}
                                                color="success"
                                            />
                                        }
                                        label={togglingGex ? '...' : (localGex ? 'Activado' : 'Desactivado')}
                                        labelPlacement="start"
                                        sx={{ m: 0 }}
                                    />
                                )}
                            </Paper>

                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle1" fontWeight={600}>
                                        📋 Instrucciones y Direcciones (Panel Asesor)
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Controla si los asesores pueden asignar instrucciones de entrega a envíos, editar direcciones de clientes y agregar nuevas direcciones. Si se desactiva, estos botones desaparecen del panel del asesor.
                                    </Typography>
                                </Box>
                                {paymentsStatusLoading || localAdvisorInstr === null ? (
                                    <CircularProgress size={20} />
                                ) : (
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={!!localAdvisorInstr}
                                                onChange={(e) => handleToggleAdvisorInstr(e.target.checked)}
                                                disabled={togglingAdvisorInstr}
                                                color="success"
                                            />
                                        }
                                        label={togglingAdvisorInstr ? '...' : (localAdvisorInstr ? 'Activado' : 'Desactivado')}
                                        labelPlacement="start"
                                        sx={{ m: 0 }}
                                    />
                                )}
                            </Paper>

                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography variant="subtitle1" fontWeight={600}>
                                            💳 Orden de Pago (Panel Asesor)
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Controla si los asesores pueden generar órdenes de pago. Si se desactiva, el botón "Generar Orden de Pago" desaparece en la app móvil y el tab "Orden de Pago" se oculta en el panel web.
                                        </Typography>
                                    </Box>
                                    {paymentsStatusLoading || localAdvisorPaymentOrder === null ? (
                                        <CircularProgress size={20} />
                                    ) : (
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    checked={!!localAdvisorPaymentOrder}
                                                    onChange={(e) => handleToggleAdvisorPaymentOrder(e.target.checked)}
                                                    disabled={togglingAdvisorPaymentOrder}
                                                    color="success"
                                                />
                                            }
                                            label={togglingAdvisorPaymentOrder ? '...' : (localAdvisorPaymentOrder ? 'Activado' : 'Desactivado')}
                                            labelPlacement="start"
                                            sx={{ m: 0 }}
                                        />
                                    )}
                                </Box>

                                {/* Sub-toggles por servicio — mismos que Pagos EntregaX */}
                                {!paymentsStatusLoading && localEntregaxByService && (
                                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed', borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                                            Habilitar órdenes de pago por tipo de servicio (master debe estar activado):
                                        </Typography>
                                        {([
                                            { key: 'pobox',    label: '📮 PO Box USA',       desc: 'Asesor puede generar órdenes de pago para paquetes PO Box USA.' },
                                            { key: 'maritimo', label: '🚢 Marítimo China',   desc: 'Asesor puede generar órdenes para embarques marítimos consolidados.' },
                                            { key: 'aereo',    label: '✈️ Aéreo China',      desc: 'Asesor puede generar órdenes para envíos aéreos (TDI / Express).' },
                                            { key: 'dhl',      label: '📦 DHL Monterrey',    desc: 'Asesor puede generar órdenes para guías DHL nacionales.' },
                                        ] as const).map(svc => (
                                            <Box key={svc.key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, pl: 1 }}>
                                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                                    <Typography variant="body2" fontWeight={600}>{svc.label}</Typography>
                                                    <Typography variant="caption" color="text.secondary">{svc.desc}</Typography>
                                                </Box>
                                                <FormControlLabel
                                                    control={
                                                        <Switch
                                                            size="small"
                                                            checked={!!localEntregaxByService[svc.key]}
                                                            onChange={(e) => handleToggleEntregaxService(svc.key, e.target.checked)}
                                                            disabled={togglingEntregaxService === svc.key || !localAdvisorPaymentOrder}
                                                            color="success"
                                                        />
                                                    }
                                                    label={togglingEntregaxService === svc.key ? '...' : (localEntregaxByService[svc.key] ? 'On' : 'Off')}
                                                    labelPlacement="start"
                                                    sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 12, color: 'text.secondary', minWidth: 28 } }}
                                                />
                                            </Box>
                                        ))}
                                        {!localAdvisorPaymentOrder && (
                                            <Typography variant="caption" color="warning.main" sx={{ mt: 0.5 }}>
                                                ⚠️ El master switch está desactivado: los asesores no pueden generar órdenes de pago.
                                            </Typography>
                                        )}
                                    </Box>
                                )}
                            </Paper>

                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography variant="subtitle1" fontWeight={600}>
                                            🅧 Xpay (Panel Asesor)
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Controla si los asesores pueden crear operaciones Xpay a nombre de sus clientes asignados. Si se desactiva, el tab "Xpay" desaparece del panel del asesor.
                                        </Typography>
                                    </Box>
                                    {paymentsStatusLoading || localAdvisorXpay === null ? (
                                        <CircularProgress size={20} />
                                    ) : (
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    checked={!!localAdvisorXpay}
                                                    onChange={(e) => handleToggleAdvisorXpay(e.target.checked)}
                                                    disabled={togglingAdvisorXpay}
                                                    color="success"
                                                />
                                            }
                                            label={togglingAdvisorXpay ? '...' : (localAdvisorXpay ? 'Activado' : 'Desactivado')}
                                            labelPlacement="start"
                                            sx={{ m: 0 }}
                                        />
                                    )}
                                </Box>
                            </Paper>
                        </Stack>
                    </CardContent>
                </Card>
            )}

            {/* Operaciones de Despacho — solo super_admin */}
            {isSuperAdmin && (
                <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, mb: 3 }}>
                    <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <Typography variant="h6" fontWeight={600}>🚚 Operaciones de Despacho</Typography>
                            <Chip label="Super Admin" size="small" color="warning" sx={{ ml: 1 }} />
                        </Box>
                        <Alert severity="info" sx={{ mb: 3 }}>
                            Controlan los requisitos que debe cumplir una guía para que el chofer pueda cargarla a su unidad.
                            Desactivar un requisito aplica inmediatamente en la app del repartidor.
                        </Alert>
                        <Stack spacing={2}>
                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle1" fontWeight={600}>
                                        💵 Requerir Pago para Cargar
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Si está activado, el chofer solo puede cargar guías cuyo cliente ya pagó. Si se desactiva,
                                        se permite cargar guías con pago pendiente.
                                    </Typography>
                                </Box>
                                {paymentsStatusLoading || localReqPayment === null ? (
                                    <CircularProgress size={20} />
                                ) : (
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={!!localReqPayment}
                                                onChange={(e) => handleToggleReqPayment(e.target.checked)}
                                                disabled={togglingReqPayment}
                                                color="success"
                                            />
                                        }
                                        label={togglingReqPayment ? '...' : (localReqPayment ? 'Activado' : 'Desactivado')}
                                        labelPlacement="start"
                                        sx={{ m: 0 }}
                                    />
                                )}
                            </Paper>
                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle1" fontWeight={600}>
                                        🏷️ Requerir Etiqueta Impresa para Cargar
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Si está activado, el chofer solo puede cargar guías que ya tienen etiqueta de paquetería
                                        generada (guía nacional, Skydropx, DHL, etc.). Si se desactiva, se permite cargar sin etiqueta.
                                    </Typography>
                                </Box>
                                {paymentsStatusLoading || localReqLabel === null ? (
                                    <CircularProgress size={20} />
                                ) : (
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={!!localReqLabel}
                                                onChange={(e) => handleToggleReqLabel(e.target.checked)}
                                                disabled={togglingReqLabel}
                                                color="success"
                                            />
                                        }
                                        label={togglingReqLabel ? '...' : (localReqLabel ? 'Activado' : 'Desactivado')}
                                        labelPlacement="start"
                                        sx={{ m: 0 }}
                                    />
                                )}
                            </Paper>
                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, borderColor: '#F05A28', borderStyle: 'dashed' }}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle1" fontWeight={600}>
                                        📋 Requerir Instrucciones Asignadas (solo PO Box)
                                        <Chip label="Solo PO Box" size="small" sx={{ ml: 1, bgcolor: '#F05A28', color: 'white', fontWeight: 600 }} />
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Si está activado, las guías PO Box (US-) no aparecen en <strong>Control de Salidas</strong> hasta que
                                        el cliente asigne dirección o instrucciones de entrega desde la app. No aplica a otros servicios
                                        (China, DHL, etc.).
                                    </Typography>
                                </Box>
                                {paymentsStatusLoading || localReqInstrPobox === null ? (
                                    <CircularProgress size={20} />
                                ) : (
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={!!localReqInstrPobox}
                                                onChange={(e) => handleToggleReqInstrPobox(e.target.checked)}
                                                disabled={togglingReqInstrPobox}
                                                color="success"
                                            />
                                        }
                                        label={togglingReqInstrPobox ? '...' : (localReqInstrPobox ? 'Activado' : 'Desactivado')}
                                        labelPlacement="start"
                                        sx={{ m: 0 }}
                                    />
                                )}
                            </Paper>
                        </Stack>
                    </CardContent>
                </Card>
            )}

            {/* Identidad Visual / Logos (solo super_admin) */}
            {isSuperAdmin && <BrandAssetsManager />}

            {/* Integraciones Externas — solo super_admin */}
            {isSuperAdmin && (
                <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, mb: 3 }}>
                    <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <SyncIcon sx={{ color: 'text.secondary' }} />
                            <Typography variant="h6" fontWeight={600}>Integraciones Externas</Typography>
                            <Chip label="Super Admin" size="small" color="warning" sx={{ ml: 1 }} />
                        </Box>
                        <Alert severity="warning" sx={{ mb: 3 }}>
                            Controla el flujo de datos hacia sistemas externos. Al desactivar, el endpoint de sincronización
                            deja de responder inmediatamente y ningún sistema externo puede consultar clientes.
                        </Alert>
                        <Stack spacing={2}>
                            {/* Toggle habilitado/deshabilitado */}
                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle1" fontWeight={600}>
                                        🔌 Sincronización con Sistema EX
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Permite que el Sistema EX consulte la lista de clientes vía{' '}
                                        <code style={{ background: '#f0f0f0', padding: '1px 6px', borderRadius: 4 }}>GET /api/external/customers</code>.
                                        Al desactivar se bloquea inmediatamente.
                                    </Typography>
                                </Box>
                                {paymentsStatusLoading || localExternalSync === null ? (
                                    <CircularProgress size={20} />
                                ) : (
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={!!localExternalSync}
                                                onChange={(e) => handleToggleExternalSync(e.target.checked)}
                                                disabled={togglingExternalSync}
                                                color="success"
                                            />
                                        }
                                        label={togglingExternalSync ? '...' : (localExternalSync ? 'Activado' : 'Desactivado')}
                                        labelPlacement="start"
                                        sx={{ m: 0 }}
                                    />
                                )}
                            </Paper>

                            {/* Toggle Consulta Pagos sistemaentregax.com */}
                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle1" fontWeight={600}>
                                        💳 Consulta de Pagos — sistemaentregax.com
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Habilita el módulo "Consulta Pagos" en el panel Nacional México.
                                        Permite consultar pagos e historial de movimientos por cotización o guía.
                                    </Typography>
                                </Box>
                                {paymentsStatusLoading || localPaymentQuery === null ? (
                                    <CircularProgress size={20} />
                                ) : (
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={!!localPaymentQuery}
                                                onChange={(e) => handleTogglePaymentQuery(e.target.checked)}
                                                disabled={togglingPaymentQuery}
                                                color="success"
                                            />
                                        }
                                        label={togglingPaymentQuery ? '...' : (localPaymentQuery ? 'Activado' : 'Desactivado')}
                                        labelPlacement="start"
                                        sx={{ m: 0 }}
                                    />
                                )}
                            </Paper>

                            {/* Gestión de API Key */}
                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                                    🔑 API Key de acceso
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    El Sistema EX debe enviar esta clave en el header{' '}
                                    <code style={{ background: '#f0f0f0', padding: '1px 6px', borderRadius: 4 }}>x-api-key</code>{' '}
                                    o como parámetro{' '}
                                    <code style={{ background: '#f0f0f0', padding: '1px 6px', borderRadius: 4 }}>?api_key=</code>.
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                    {externalSyncKey && externalSyncKeyVisible ? (
                                        <TextField
                                            value={externalSyncKey}
                                            size="small"
                                            InputProps={{
                                                readOnly: true,
                                                sx: { fontFamily: 'monospace', fontSize: '0.85rem' },
                                                endAdornment: (
                                                    <InputAdornment position="end">
                                                        <Tooltip title="Copiar">
                                                            <IconButton size="small" onClick={() => {
                                                                navigator.clipboard.writeText(externalSyncKey);
                                                                setSnackbar({ open: true, message: 'API Key copiada', severity: 'success' });
                                                            }}>
                                                                <ContentCopyIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Ocultar">
                                                            <IconButton size="small" onClick={() => setExternalSyncKeyVisible(false)}>
                                                                <VisibilityOffIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </InputAdornment>
                                                ),
                                            }}
                                            sx={{ flex: 1, minWidth: 260 }}
                                        />
                                    ) : (
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            startIcon={loadingKey ? <CircularProgress size={16} /> : <VisibilityIcon />}
                                            onClick={fetchExternalSyncKey}
                                            disabled={loadingKey}
                                            sx={{ textTransform: 'none' }}
                                        >
                                            Ver API Key
                                        </Button>
                                    )}
                                    <Button
                                        variant="contained"
                                        size="small"
                                        color="warning"
                                        startIcon={regeneratingKey ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                                        onClick={handleRegenerateKey}
                                        disabled={regeneratingKey}
                                        sx={{ textTransform: 'none', fontWeight: 600 }}
                                    >
                                        {externalSyncKey ? 'Regenerar Key' : 'Generar Key'}
                                    </Button>
                                </Box>
                                {externalSyncKey === null && !loadingKey && (
                                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                        No hay API key configurada. Haz clic en "Generar Key" para crear una.
                                    </Typography>
                                )}
                            </Paper>
                        </Stack>
                    </CardContent>
                </Card>
            )}

            {/* Cajito — Asistente IA (solo super_admin) */}
            {isSuperAdmin && (
                <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, mb: 3, background: 'linear-gradient(135deg, #faf5ff 0%, #ffffff 60%)' }}>
                    <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <Box sx={{ fontSize: '1.6rem', lineHeight: 1 }}>🤖</Box>
                            <Typography variant="h6" fontWeight={600}>Cajito — Asistente IA</Typography>
                            <Chip label="Claude 3.5 Sonnet" size="small" color="secondary" sx={{ ml: 1 }} />
                            <Chip label="Super Admin" size="small" color="warning" />
                        </Box>
                        <Alert severity="warning" sx={{ mb: 3 }}>
                            <strong>Riesgo elevado.</strong> Cajito puede leer información del sistema y, según los permisos
                            por usuario, ejecutar acciones (notificar clientes, modificar paquetes, aprobar pagos…).
                            Al desactivar el interruptor general, ningún usuario podrá invocar a Cajito aunque tenga
                            capacidades concedidas. Recomendado iniciar en modo <em>solo lectura</em>.
                        </Alert>
                        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="subtitle1" fontWeight={600}>
                                    🤖 Habilitar Cajito (interruptor general)
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Controla globalmente si el asistente IA está disponible. Los permisos finos por
                                    usuario se configuran en <strong>Permisos &gt; Cajito</strong>.
                                </Typography>
                            </Box>
                            {paymentsStatusLoading || localCajito === null ? (
                                <CircularProgress size={20} />
                            ) : (
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={!!localCajito}
                                            onChange={(e) => handleToggleCajito(e.target.checked)}
                                            disabled={togglingCajito}
                                            color="secondary"
                                        />
                                    }
                                    label={togglingCajito ? '...' : (localCajito ? 'Activado' : 'Desactivado')}
                                    labelPlacement="start"
                                    sx={{ m: 0 }}
                                />
                            )}
                        </Paper>
                        <Paper variant="outlined" sx={{ p: 2, mt: 2, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="subtitle1" fontWeight={600}>
                                    📜 Historial y auditoría de Cajito
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Consulta tus propias conversaciones o, como super admin, revisa la auditoría completa
                                    de todas las interacciones (mensajes, herramientas invocadas y tokens consumidos).
                                </Typography>
                            </Box>
                            <Button
                                variant="outlined"
                                color="secondary"
                                startIcon={<HistoryIcon />}
                                onClick={() => setCajitoAuditOpen(true)}
                                sx={{ borderRadius: 2, whiteSpace: 'nowrap' }}
                            >
                                Ver historial
                            </Button>
                        </Paper>
                    </CardContent>
                </Card>
            )}
            <CajitoAuditDialog
                open={cajitoAuditOpen}
                onClose={() => setCajitoAuditOpen(false)}
                isSuperAdmin={!!isSuperAdmin}
            />

            {/* Tarifas de Comisión por Servicio (incluye GEX con comisión fija) */}
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={() => setDialogOpen(true)}
                    sx={{ borderRadius: 2 }}
                >
                    Nuevo Tipo de Servicio
                </Button>
            </Box>
            <CommissionRatesTable />

            {/* Bloque legacy oculto — preservado para evitar romper estado */}
            {false && (
            <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3 }}>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CategoryIcon color="primary" />
                            <Typography variant="h6" fontWeight={600}>
                                Tipos de Servicio
                            </Typography>
                            <Chip label={serviceTypes.length} size="small" color="primary" />
                        </Box>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => setDialogOpen(true)}
                            sx={{ borderRadius: 2 }}
                        >
                            Nuevo Servicio
                        </Button>
                    </Box>

                    <Alert severity="info" sx={{ mb: 3 }}>
                        Los tipos de servicio definen las categorías de envío disponibles y sus comisiones asociadas para asesores.
                    </Alert>

                    <TableContainer component={Paper} elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'grey.50' }}>
                                    <TableCell sx={{ fontWeight: 600 }}>Código</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>Nombre del Servicio</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }} align="center">Comisión (%)</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }} align="center">Override Líder (%)</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }} align="center">Acciones</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                                            Cargando...
                                        </TableCell>
                                    </TableRow>
                                ) : serviceTypes.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                                            No hay tipos de servicio configurados
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    serviceTypes.map((st) => (
                                        <TableRow key={st.id} hover>
                                            <TableCell>
                                                <Chip 
                                                    label={st.service_type} 
                                                    size="small" 
                                                    variant="outlined"
                                                    sx={{ fontFamily: 'monospace' }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography fontWeight={500}>{st.label}</Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                                {editingId === st.id ? (
                                                    <TextField
                                                        size="small"
                                                        type="number"
                                                        value={editValues[st.id]?.percentage || 0}
                                                        onChange={(e) => setEditValues({
                                                            ...editValues,
                                                            [st.id]: { ...editValues[st.id], percentage: parseFloat(e.target.value) || 0 }
                                                        })}
                                                        InputProps={{
                                                            endAdornment: <InputAdornment position="end">%</InputAdornment>,
                                                        }}
                                                        sx={{ width: 100 }}
                                                    />
                                                ) : (
                                                    <Chip 
                                                        label={`${st.percentage}%`} 
                                                        color="success" 
                                                        size="small"
                                                        icon={<PercentIcon />}
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell align="center">
                                                {editingId === st.id ? (
                                                    <TextField
                                                        size="small"
                                                        type="number"
                                                        value={editValues[st.id]?.leader_override || 0}
                                                        onChange={(e) => setEditValues({
                                                            ...editValues,
                                                            [st.id]: { ...editValues[st.id], leader_override: parseFloat(e.target.value) || 0 }
                                                        })}
                                                        InputProps={{
                                                            endAdornment: <InputAdornment position="end">%</InputAdornment>,
                                                        }}
                                                        sx={{ width: 100 }}
                                                    />
                                                ) : (
                                                    <Chip 
                                                        label={`${st.leader_override}%`} 
                                                        color="warning" 
                                                        size="small"
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell align="center">
                                                {editingId === st.id ? (
                                                    <Button
                                                        size="small"
                                                        variant="contained"
                                                        color="success"
                                                        startIcon={<SaveIcon />}
                                                        onClick={() => handleUpdateService(st.id)}
                                                    >
                                                        Guardar
                                                    </Button>
                                                ) : (
                                                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                                                        <Tooltip title="Editar tarifas">
                                                            <IconButton 
                                                                size="small" 
                                                                color="primary"
                                                                onClick={() => setEditingId(st.id)}
                                                            >
                                                                <EditIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Eliminar servicio">
                                                            <IconButton 
                                                                size="small" 
                                                                color="error"
                                                                onClick={() => handleDeleteService(st.id)}
                                                            >
                                                                <DeleteIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </Box>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </CardContent>
            </Card>
            )}

            {/* Dialog para nuevo servicio */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AddIcon color="primary" />
                        Nuevo Tipo de Servicio
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        <TextField
                            label="Nombre del Servicio"
                            placeholder="Ej: Liberación AA DHL"
                            value={newService.label}
                            onChange={(e) => {
                                const label = e.target.value;
                                setNewService({
                                    ...newService,
                                    label,
                                    service_type: generateServiceCode(label)
                                });
                            }}
                            fullWidth
                            required
                        />
                        <TextField
                            label="Código del Servicio"
                            placeholder="Ej: liberacion_aa_dhl"
                            value={newService.service_type}
                            onChange={(e) => setNewService({ ...newService, service_type: e.target.value })}
                            fullWidth
                            required
                            helperText="Código único interno (sin espacios, minúsculas)"
                            InputProps={{
                                sx: { fontFamily: 'monospace' }
                            }}
                        />
                        <Divider sx={{ my: 1 }} />
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                label="Comisión Asesor"
                                type="number"
                                value={newService.percentage}
                                onChange={(e) => setNewService({ ...newService, percentage: parseFloat(e.target.value) || 0 })}
                                InputProps={{
                                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                                }}
                                sx={{ flex: 1 }}
                            />
                            <TextField
                                label="Override Líder"
                                type="number"
                                value={newService.leader_override}
                                onChange={(e) => setNewService({ ...newService, leader_override: parseFloat(e.target.value) || 0 })}
                                InputProps={{
                                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                                }}
                                sx={{ flex: 1 }}
                            />
                        </Box>
                        <Alert severity="info" sx={{ mt: 1 }}>
                            <strong>Comisión:</strong> % que gana el asesor sobre el valor del envío<br />
                            <strong>Override:</strong> % adicional que gana el líder sobre la comisión del asesor
                        </Alert>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
                    <Button 
                        variant="contained" 
                        onClick={handleCreateService}
                        startIcon={<AddIcon />}
                    >
                        Crear Servicio
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert severity={snackbar.severity} variant="filled">
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
