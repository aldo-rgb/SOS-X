// ============================================
// PANEL DE FACTURACIÓN POR SERVICIO
// Asignación de razones sociales y control de facturación
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
    Box,
    Typography,
    Paper,
    Card,
    CardContent,
    Grid,
    Button,
    IconButton,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    CircularProgress,
    Alert,
    Snackbar,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Tooltip,
    Avatar,
    Tabs,
    Tab,
    Divider,
    FormControlLabel,
    Switch,
} from '@mui/material';
import {
    Business as BusinessIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    Star as StarIcon,
    StarBorder as StarBorderIcon,
    Receipt as ReceiptIcon,
    CheckCircle as CheckCircleIcon,
    Pending as PendingIcon,
    Cancel as CancelIcon,
    Download as DownloadIcon,
    Refresh as RefreshIcon,
    AttachMoney as MoneyIcon,
} from '@mui/icons-material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ORANGE = '#F05A28';

interface FiscalEmitter {
    id: number;
    alias: string;
    rfc: string;
    business_name: string;
    is_active: boolean;
}

interface ServiceFiscalConfig {
    id: number;
    service_type: string;
    fiscal_emitter_id: number;
    is_default: boolean;
    alias: string;
    rfc: string;
    business_name: string;
    emitter_active: boolean;
}

interface ServiceInvoice {
    id: number;
    service_type: string;
    fiscal_emitter_id: number;
    invoice_uuid: string | null;
    invoice_folio: string | null;
    amount: string;
    currency: string;
    receiver_rfc: string;
    receiver_name: string;
    concept: string | null;
    status: string;
    pdf_url: string | null;
    xml_url: string | null;
    notes: string | null;
    created_at: string;
    timbrado_at: string | null;
    emitter_alias: string;
    emitter_rfc: string;
    emitter_name: string;
}

interface ServiceInvoicesTotals {
    total: string;
    timbradas: string;
    pendientes: string;
    canceladas: string;
    total_facturado: string;
}

interface Props {
    serviceType: string;
    serviceName: string;
    serviceColor: string;
}

export default function ServiceInvoicingPanel({ serviceType, serviceName, serviceColor }: Props) {
    const { t } = useTranslation();
    const [tabValue, setTabValue] = useState(0);
    const [loading, setLoading] = useState(true);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

    // Data states
    const [assignedEmitters, setAssignedEmitters] = useState<ServiceFiscalConfig[]>([]);
    const [allEmitters, setAllEmitters] = useState<FiscalEmitter[]>([]);
    const [invoices, setInvoices] = useState<ServiceInvoice[]>([]);
    const [totals, setTotals] = useState<ServiceInvoicesTotals | null>(null);

    // Modal states
    const [openAssignModal, setOpenAssignModal] = useState(false);
    const [openInvoiceModal, setOpenInvoiceModal] = useState(false);
    const [selectedEmitterId, setSelectedEmitterId] = useState<number | null>(null);
    const [isDefault, setIsDefault] = useState(false);
    const [saving, setSaving] = useState(false);

    // New invoice form
    const [invoiceForm, setInvoiceForm] = useState({
        fiscalEmitterId: '',
        receiverRfc: '',
        receiverName: '',
        amount: '',
        concept: '',
        notes: ''
    });

    const getToken = () => localStorage.getItem('token');

    // Load assigned emitters and all emitters
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [configRes, emittersRes, invoicesRes] = await Promise.all([
                axios.get(`${API_URL}/api/admin/service-fiscal/${serviceType}`, {
                    headers: { Authorization: `Bearer ${getToken()}` }
                }),
                axios.get(`${API_URL}/api/admin/fiscal/emitters`, {
                    headers: { Authorization: `Bearer ${getToken()}` }
                }),
                axios.get(`${API_URL}/api/admin/service-invoices/${serviceType}?limit=100`, {
                    headers: { Authorization: `Bearer ${getToken()}` }
                })
            ]);

            setAssignedEmitters(configRes.data);
            setAllEmitters(emittersRes.data);
            setInvoices(invoicesRes.data.invoices || []);
            setTotals(invoicesRes.data.totals || null);
        } catch (error) {
            console.error('Error loading data:', error);
            setSnackbar({ open: true, message: 'Error al cargar datos', severity: 'error' });
        } finally {
            setLoading(false);
        }
    }, [serviceType]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Assign emitter to service
    const handleAssignEmitter = async () => {
        if (!selectedEmitterId) return;
        setSaving(true);
        try {
            await axios.post(`${API_URL}/api/admin/service-fiscal/assign`, {
                serviceType,
                fiscalEmitterId: selectedEmitterId,
                isDefault
            }, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setSnackbar({ open: true, message: 'Razón social asignada correctamente', severity: 'success' });
            setOpenAssignModal(false);
            setSelectedEmitterId(null);
            setIsDefault(false);
            loadData();
        } catch (error) {
            console.error('Error assigning emitter:', error);
            setSnackbar({ open: true, message: 'Error al asignar razón social', severity: 'error' });
        } finally {
            setSaving(false);
        }
    };

    // Remove emitter from service
    const handleRemoveEmitter = async (emitterId: number) => {
        if (!window.confirm('¿Estás seguro de remover esta razón social del servicio?')) return;
        try {
            await axios.post(`${API_URL}/api/admin/service-fiscal/remove`, {
                serviceType,
                fiscalEmitterId: emitterId
            }, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setSnackbar({ open: true, message: 'Razón social removida', severity: 'success' });
            loadData();
        } catch (error) {
            console.error('Error removing emitter:', error);
            setSnackbar({ open: true, message: 'Error al remover razón social', severity: 'error' });
        }
    };

    // Set default emitter
    const handleSetDefault = async (emitterId: number) => {
        try {
            await axios.post(`${API_URL}/api/admin/service-fiscal/set-default`, {
                serviceType,
                fiscalEmitterId: emitterId
            }, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setSnackbar({ open: true, message: 'Razón social establecida como predeterminada', severity: 'success' });
            loadData();
        } catch (error) {
            console.error('Error setting default:', error);
            setSnackbar({ open: true, message: 'Error al establecer predeterminada', severity: 'error' });
        }
    };

    // Create invoice
    const handleCreateInvoice = async () => {
        if (!invoiceForm.fiscalEmitterId || !invoiceForm.receiverRfc || !invoiceForm.amount) {
            setSnackbar({ open: true, message: 'Completa los campos requeridos', severity: 'error' });
            return;
        }
        setSaving(true);
        try {
            await axios.post(`${API_URL}/api/admin/service-invoices`, {
                serviceType,
                fiscalEmitterId: parseInt(invoiceForm.fiscalEmitterId),
                receiverRfc: invoiceForm.receiverRfc,
                receiverName: invoiceForm.receiverName,
                amount: parseFloat(invoiceForm.amount),
                concept: invoiceForm.concept,
                notes: invoiceForm.notes
            }, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setSnackbar({ open: true, message: 'Factura creada correctamente', severity: 'success' });
            setOpenInvoiceModal(false);
            setInvoiceForm({ fiscalEmitterId: '', receiverRfc: '', receiverName: '', amount: '', concept: '', notes: '' });
            loadData();
        } catch (error) {
            console.error('Error creating invoice:', error);
            setSnackbar({ open: true, message: 'Error al crear factura', severity: 'error' });
        } finally {
            setSaving(false);
        }
    };

    // Stamp invoice
    const handleStampInvoice = async (invoiceId: number) => {
        if (!window.confirm('¿Timbrar esta factura? Esta acción no se puede deshacer.')) return;
        try {
            await axios.post(`${API_URL}/api/admin/service-invoices/${invoiceId}/stamp`, {}, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setSnackbar({ open: true, message: 'Factura timbrada exitosamente', severity: 'success' });
            loadData();
        } catch (error: any) {
            console.error('Error stamping invoice:', error);
            setSnackbar({ 
                open: true, 
                message: error.response?.data?.error || 'Error al timbrar factura', 
                severity: 'error' 
            });
        }
    };

    // Get available emitters (not yet assigned)
    const availableEmitters = allEmitters.filter(
        e => e.is_active && !assignedEmitters.find(ae => ae.fiscal_emitter_id === e.id)
    );

    const formatCurrency = (value: string | number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value));
    };

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString('es-MX', { 
            day: '2-digit', 
            month: 'short', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box>
            {/* Header */}
            <Paper sx={{ p: 3, mb: 3, background: `linear-gradient(135deg, ${serviceColor}20 0%, ${serviceColor}05 100%)` }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Avatar sx={{ bgcolor: serviceColor, width: 56, height: 56 }}>
                            <ReceiptIcon sx={{ fontSize: 32 }} />
                        </Avatar>
                        <Box>
                            <Typography variant="h5" fontWeight="bold">
                                {t('.invoicing')} - {serviceName}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Gestión de facturación y razones sociales asignadas
                            </Typography>
                        </Box>
                    </Box>
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={loadData}
                    >
                        Actualizar
                    </Button>
                </Box>
            </Paper>

            {/* Tabs */}
            <Paper sx={{ mb: 3 }}>
                <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
                    <Tab label={`Razones Sociales (${assignedEmitters.length})`} icon={<BusinessIcon />} iconPosition="start" />
                    <Tab label={`Facturas (${totals?.total || 0})`} icon={<ReceiptIcon />} iconPosition="start" />
                </Tabs>
            </Paper>

            {/* Tab 0: Razones Sociales */}
            {tabValue === 0 && (
                <Box>
                    {/* Stats Cards */}
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                            <Card>
                                <CardContent>
                                    <Typography color="text.secondary" variant="caption">
                                        Razones Sociales
                                    </Typography>
                                    <Typography variant="h4" fontWeight="bold" color={serviceColor}>
                                        {assignedEmitters.length}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                            <Card>
                                <CardContent>
                                    <Typography color="text.secondary" variant="caption">
                                        Total Facturado
                                    </Typography>
                                    <Typography variant="h4" fontWeight="bold" color="success.main">
                                        {formatCurrency(totals?.total_facturado || 0)}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                            <Card>
                                <CardContent>
                                    <Typography color="text.secondary" variant="caption">
                                        Facturas Timbradas
                                    </Typography>
                                    <Typography variant="h4" fontWeight="bold" color="info.main">
                                        {totals?.timbradas || 0}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                            <Card>
                                <CardContent>
                                    <Typography color="text.secondary" variant="caption">
                                        Pendientes
                                    </Typography>
                                    <Typography variant="h4" fontWeight="bold" color="warning.main">
                                        {totals?.pendientes || 0}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>

                    {/* Add button */}
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => setOpenAssignModal(true)}
                            disabled={availableEmitters.length === 0}
                            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d04a20' } }}
                        >
                            Asignar Razón Social
                        </Button>
                    </Box>

                    {/* Assigned Emitters Grid */}
                    {assignedEmitters.length === 0 ? (
                        <Alert severity="info">
                            No hay razones sociales asignadas a este servicio. Asigna una para comenzar a facturar.
                        </Alert>
                    ) : (
                        <Grid container spacing={2}>
                            {assignedEmitters.map((config) => (
                                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={config.id}>
                                    <Card sx={{ 
                                        border: config.is_default ? `2px solid ${ORANGE}` : '1px solid #e0e0e0',
                                        position: 'relative'
                                    }}>
                                        {config.is_default && (
                                            <Chip 
                                                label="Predeterminada" 
                                                size="small" 
                                                sx={{ 
                                                    position: 'absolute', 
                                                    top: 8, 
                                                    right: 8,
                                                    bgcolor: ORANGE,
                                                    color: 'white'
                                                }} 
                                            />
                                        )}
                                        <CardContent>
                                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                                                <Avatar sx={{ bgcolor: config.emitter_active ? 'success.main' : 'grey.400' }}>
                                                    <BusinessIcon />
                                                </Avatar>
                                                <Box sx={{ flex: 1 }}>
                                                    <Typography variant="subtitle1" fontWeight="bold" noWrap>
                                                        {config.alias || config.business_name}
                                                    </Typography>
                                                    <Typography variant="body2" color="text.secondary" noWrap>
                                                        {config.business_name}
                                                    </Typography>
                                                    <Chip 
                                                        label={config.rfc} 
                                                        size="small" 
                                                        variant="outlined"
                                                        sx={{ mt: 1 }}
                                                    />
                                                </Box>
                                            </Box>
                                            <Divider sx={{ my: 2 }} />
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Tooltip title={config.is_default ? "Ya es predeterminada" : "Establecer como predeterminada"}>
                                                    <span>
                                                        <IconButton 
                                                            onClick={() => handleSetDefault(config.fiscal_emitter_id)}
                                                            disabled={config.is_default}
                                                            color="warning"
                                                        >
                                                            {config.is_default ? <StarIcon /> : <StarBorderIcon />}
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                                <Tooltip title="Remover del servicio">
                                                    <IconButton 
                                                        onClick={() => handleRemoveEmitter(config.fiscal_emitter_id)}
                                                        color="error"
                                                    >
                                                        <DeleteIcon />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            ))}
                        </Grid>
                    )}
                </Box>
            )}

            {/* Tab 1: Facturas */}
            {tabValue === 1 && (
                <Box>
                    {/* Create Invoice Button */}
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => setOpenInvoiceModal(true)}
                            disabled={assignedEmitters.length === 0}
                            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d04a20' } }}
                        >
                            Nueva Factura
                        </Button>
                    </Box>

                    {invoices.length === 0 ? (
                        <Alert severity="info">
                            No hay facturas registradas para este servicio.
                        </Alert>
                    ) : (
                        <TableContainer component={Paper}>
                            <Table>
                                <TableHead>
                                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                                        <TableCell>Fecha</TableCell>
                                        <TableCell>Emisor</TableCell>
                                        <TableCell>Receptor</TableCell>
                                        <TableCell align="right">Monto</TableCell>
                                        <TableCell>Estado</TableCell>
                                        <TableCell>UUID/Folio</TableCell>
                                        <TableCell align="center">Acciones</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {invoices.map((invoice) => (
                                        <TableRow key={invoice.id} hover>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {formatDate(invoice.created_at)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="bold">
                                                    {invoice.emitter_alias}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {invoice.emitter_rfc}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {invoice.receiver_name || '—'}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {invoice.receiver_rfc}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography variant="body2" fontWeight="bold">
                                                    {formatCurrency(invoice.amount)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    icon={
                                                        invoice.status === 'timbrada' ? <CheckCircleIcon /> :
                                                        invoice.status === 'pending' ? <PendingIcon /> :
                                                        <CancelIcon />
                                                    }
                                                    label={
                                                        invoice.status === 'timbrada' ? 'Timbrada' :
                                                        invoice.status === 'pending' ? 'Pendiente' :
                                                        invoice.status === 'cancelled' ? 'Cancelada' :
                                                        invoice.status
                                                    }
                                                    size="small"
                                                    color={
                                                        invoice.status === 'timbrada' ? 'success' :
                                                        invoice.status === 'pending' ? 'warning' :
                                                        'error'
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell>
                                                {invoice.invoice_uuid ? (
                                                    <Box>
                                                        <Typography variant="caption" fontWeight="bold">
                                                            {invoice.invoice_folio}
                                                        </Typography>
                                                        <Typography variant="caption" display="block" sx={{ fontSize: '0.65rem' }}>
                                                            {invoice.invoice_uuid?.substring(0, 8)}...
                                                        </Typography>
                                                    </Box>
                                                ) : (
                                                    <Typography variant="caption" color="text.secondary">—</Typography>
                                                )}
                                            </TableCell>
                                            <TableCell align="center">
                                                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                                    {invoice.status === 'pending' && (
                                                        <Tooltip title="Timbrar factura">
                                                            <IconButton 
                                                                size="small" 
                                                                color="primary"
                                                                onClick={() => handleStampInvoice(invoice.id)}
                                                            >
                                                                <MoneyIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                    {invoice.pdf_url && (
                                                        <Tooltip title="Descargar PDF">
                                                            <IconButton 
                                                                size="small" 
                                                                color="error"
                                                                href={invoice.pdf_url}
                                                                target="_blank"
                                                            >
                                                                <DownloadIcon />
                                                            </IconButton>
                                                        </Tooltip>
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

            {/* Modal: Asignar Razón Social */}
            <Dialog open={openAssignModal} onClose={() => setOpenAssignModal(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BusinessIcon color="primary" />
                        Asignar Razón Social a {serviceName}
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {availableEmitters.length === 0 ? (
                        <Alert severity="warning" sx={{ mt: 2 }}>
                            No hay razones sociales disponibles para asignar. Todas ya están asignadas a este servicio.
                        </Alert>
                    ) : (
                        <Box sx={{ mt: 2 }}>
                            <FormControl fullWidth sx={{ mb: 2 }}>
                                <InputLabel>Razón Social</InputLabel>
                                <Select
                                    value={selectedEmitterId || ''}
                                    onChange={(e) => setSelectedEmitterId(e.target.value as number)}
                                    label="Razón Social"
                                >
                                    {availableEmitters.map((emitter) => (
                                        <MenuItem key={emitter.id} value={emitter.id}>
                                            <Box>
                                                <Typography variant="body2" fontWeight="bold">
                                                    {emitter.alias || emitter.business_name}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {emitter.rfc} - {emitter.business_name}
                                                </Typography>
                                            </Box>
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControlLabel
                                control={
                                    <Switch 
                                        checked={isDefault} 
                                        onChange={(e) => setIsDefault(e.target.checked)} 
                                    />
                                }
                                label="Establecer como predeterminada para este servicio"
                            />
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenAssignModal(false)}>Cancelar</Button>
                    <Button 
                        variant="contained" 
                        onClick={handleAssignEmitter}
                        disabled={!selectedEmitterId || saving}
                        sx={{ bgcolor: ORANGE }}
                    >
                        {saving ? <CircularProgress size={20} /> : 'Asignar'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Modal: Nueva Factura */}
            <Dialog open={openInvoiceModal} onClose={() => setOpenInvoiceModal(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ReceiptIcon color="primary" />
                        Nueva Factura para {serviceName}
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <FormControl fullWidth required>
                            <InputLabel>Emisor (Razón Social)</InputLabel>
                            <Select
                                value={invoiceForm.fiscalEmitterId}
                                onChange={(e) => setInvoiceForm({ ...invoiceForm, fiscalEmitterId: e.target.value as string })}
                                label="Emisor (Razón Social)"
                            >
                                {assignedEmitters.map((config) => (
                                    <MenuItem key={config.fiscal_emitter_id} value={config.fiscal_emitter_id}>
                                        {config.alias || config.business_name} ({config.rfc})
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField
                            label="RFC del Receptor"
                            value={invoiceForm.receiverRfc}
                            onChange={(e) => setInvoiceForm({ ...invoiceForm, receiverRfc: e.target.value.toUpperCase() })}
                            fullWidth
                            required
                            inputProps={{ maxLength: 13 }}
                        />
                        <TextField
                            label="Nombre del Receptor"
                            value={invoiceForm.receiverName}
                            onChange={(e) => setInvoiceForm({ ...invoiceForm, receiverName: e.target.value })}
                            fullWidth
                        />
                        <TextField
                            label="Monto (MXN)"
                            value={invoiceForm.amount}
                            onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })}
                            fullWidth
                            required
                            type="number"
                            inputProps={{ min: 0, step: 0.01 }}
                        />
                        <TextField
                            label="Concepto"
                            value={invoiceForm.concept}
                            onChange={(e) => setInvoiceForm({ ...invoiceForm, concept: e.target.value })}
                            fullWidth
                            multiline
                            rows={2}
                        />
                        <TextField
                            label="Notas internas"
                            value={invoiceForm.notes}
                            onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
                            fullWidth
                            multiline
                            rows={2}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenInvoiceModal(false)}>Cancelar</Button>
                    <Button 
                        variant="contained" 
                        onClick={handleCreateInvoice}
                        disabled={saving}
                        sx={{ bgcolor: ORANGE }}
                    >
                        {saving ? <CircularProgress size={20} /> : 'Crear Factura'}
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
        </Box>
    );
}
