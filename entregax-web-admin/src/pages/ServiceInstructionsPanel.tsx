// ============================================
// PANEL DE INSTRUCCIONES Y DIRECCIONES DE SERVICIO
// Configuración de instrucciones de empaque, envío y direcciones de bodega
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
    CircularProgress,
    Alert,
    Snackbar,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Tooltip,
    Avatar,
    Tabs,
    Tab,
    Divider,
    FormControlLabel,
    Switch,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
} from '@mui/material';
import {
    Info as InfoIcon,
    LocalShipping as ShippingIcon,
    Inventory as PackageIcon,
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Star as StarIcon,
    StarBorder as StarBorderIcon,
    Phone as PhoneIcon,
    Email as EmailIcon,
    WhatsApp as WhatsAppIcon,
    LocationOn as LocationIcon,
    Schedule as ScheduleIcon,
    Refresh as RefreshIcon,
    Save as SaveIcon,
    ContentCopy as CopyIcon,
    Home as HomeIcon,
} from '@mui/icons-material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ORANGE = '#F05A28';

interface ServiceInstructions {
    id: number;
    service_type: string;
    packaging_instructions: string;
    shipping_instructions: string;
    general_notes: string;
    is_active: boolean;
}

interface WarehouseAddress {
    id: number;
    service_type: string;
    alias: string;
    address_line1: string;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
    country: string;
    contact_name: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    contact_whatsapp: string | null;
    business_hours: string | null;
    special_instructions: string | null;
    is_primary: boolean;
    is_active: boolean;
    sort_order: number;
}

interface Props {
    serviceType: string;
    serviceName: string;
    serviceColor: string;
}

const emptyAddress: Omit<WarehouseAddress, 'id' | 'service_type'> = {
    alias: '',
    address_line1: '',
    address_line2: null,
    city: null,
    state: null,
    zip_code: null,
    country: 'México',
    contact_name: null,
    contact_phone: null,
    contact_email: null,
    contact_whatsapp: null,
    business_hours: null,
    special_instructions: null,
    is_primary: false,
    is_active: true,
    sort_order: 0,
};

export default function ServiceInstructionsPanel({ serviceType, serviceName, serviceColor }: Props) {
    useTranslation(); // Hook for future translations
    const [tabValue, setTabValue] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

    // Data states
    const [instructions, setInstructions] = useState<ServiceInstructions | null>(null);
    const [addresses, setAddresses] = useState<WarehouseAddress[]>([]);

    // Modal states
    const [openAddressModal, setOpenAddressModal] = useState(false);
    const [editingAddress, setEditingAddress] = useState<WarehouseAddress | null>(null);
    const [addressForm, setAddressForm] = useState(emptyAddress);

    const getToken = () => localStorage.getItem('token');

    // Load data
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [instructionsRes, addressesRes] = await Promise.all([
                axios.get(`${API_URL}/api/admin/service-instructions/${serviceType}`, {
                    headers: { Authorization: `Bearer ${getToken()}` }
                }),
                axios.get(`${API_URL}/api/admin/service-addresses/${serviceType}`, {
                    headers: { Authorization: `Bearer ${getToken()}` }
                })
            ]);

            setInstructions(instructionsRes.data);
            setAddresses(addressesRes.data);
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

    // Save instructions
    const handleSaveInstructions = async () => {
        if (!instructions) return;
        setSaving(true);
        try {
            await axios.put(`${API_URL}/api/admin/service-instructions/${serviceType}`, {
                packagingInstructions: instructions.packaging_instructions,
                shippingInstructions: instructions.shipping_instructions,
                generalNotes: instructions.general_notes,
                isActive: instructions.is_active
            }, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setSnackbar({ open: true, message: 'Instrucciones guardadas correctamente', severity: 'success' });
        } catch (error) {
            console.error('Error saving instructions:', error);
            setSnackbar({ open: true, message: 'Error al guardar instrucciones', severity: 'error' });
        } finally {
            setSaving(false);
        }
    };

    // Open address modal
    const handleOpenAddressModal = (address?: WarehouseAddress) => {
        if (address) {
            setEditingAddress(address);
            setAddressForm({
                alias: address.alias,
                address_line1: address.address_line1,
                address_line2: address.address_line2,
                city: address.city,
                state: address.state,
                zip_code: address.zip_code,
                country: address.country,
                contact_name: address.contact_name,
                contact_phone: address.contact_phone,
                contact_email: address.contact_email,
                contact_whatsapp: address.contact_whatsapp,
                business_hours: address.business_hours,
                special_instructions: address.special_instructions,
                is_primary: address.is_primary,
                is_active: address.is_active,
                sort_order: address.sort_order,
            });
        } else {
            setEditingAddress(null);
            setAddressForm({ ...emptyAddress });
        }
        setOpenAddressModal(true);
    };

    // Save address
    const handleSaveAddress = async () => {
        if (!addressForm.alias || !addressForm.address_line1) {
            setSnackbar({ open: true, message: 'Alias y dirección son requeridos', severity: 'error' });
            return;
        }
        setSaving(true);
        try {
            if (editingAddress) {
                await axios.put(`${API_URL}/api/admin/service-addresses/${editingAddress.id}`, {
                    alias: addressForm.alias,
                    addressLine1: addressForm.address_line1,
                    addressLine2: addressForm.address_line2,
                    city: addressForm.city,
                    state: addressForm.state,
                    zipCode: addressForm.zip_code,
                    country: addressForm.country,
                    contactName: addressForm.contact_name,
                    contactPhone: addressForm.contact_phone,
                    contactEmail: addressForm.contact_email,
                    contactWhatsapp: addressForm.contact_whatsapp,
                    businessHours: addressForm.business_hours,
                    specialInstructions: addressForm.special_instructions,
                    isPrimary: addressForm.is_primary,
                    isActive: addressForm.is_active,
                    sortOrder: addressForm.sort_order,
                }, {
                    headers: { Authorization: `Bearer ${getToken()}` }
                });
                setSnackbar({ open: true, message: 'Dirección actualizada', severity: 'success' });
            } else {
                await axios.post(`${API_URL}/api/admin/service-addresses`, {
                    serviceType,
                    alias: addressForm.alias,
                    addressLine1: addressForm.address_line1,
                    addressLine2: addressForm.address_line2,
                    city: addressForm.city,
                    state: addressForm.state,
                    zipCode: addressForm.zip_code,
                    country: addressForm.country,
                    contactName: addressForm.contact_name,
                    contactPhone: addressForm.contact_phone,
                    contactEmail: addressForm.contact_email,
                    contactWhatsapp: addressForm.contact_whatsapp,
                    businessHours: addressForm.business_hours,
                    specialInstructions: addressForm.special_instructions,
                    isPrimary: addressForm.is_primary,
                    sortOrder: addressForm.sort_order,
                }, {
                    headers: { Authorization: `Bearer ${getToken()}` }
                });
                setSnackbar({ open: true, message: 'Dirección creada', severity: 'success' });
            }
            setOpenAddressModal(false);
            loadData();
        } catch (error) {
            console.error('Error saving address:', error);
            setSnackbar({ open: true, message: 'Error al guardar dirección', severity: 'error' });
        } finally {
            setSaving(false);
        }
    };

    // Delete address
    const handleDeleteAddress = async (id: number) => {
        if (!window.confirm('¿Eliminar esta dirección?')) return;
        try {
            await axios.delete(`${API_URL}/api/admin/service-addresses/${id}`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setSnackbar({ open: true, message: 'Dirección eliminada', severity: 'success' });
            loadData();
        } catch (error) {
            console.error('Error deleting address:', error);
            setSnackbar({ open: true, message: 'Error al eliminar dirección', severity: 'error' });
        }
    };

    // Set primary address
    const handleSetPrimary = async (id: number) => {
        try {
            await axios.post(`${API_URL}/api/admin/service-addresses/${id}/set-primary`, {}, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setSnackbar({ open: true, message: 'Dirección establecida como principal', severity: 'success' });
            loadData();
        } catch (error) {
            console.error('Error setting primary:', error);
            setSnackbar({ open: true, message: 'Error al establecer principal', severity: 'error' });
        }
    };

    // Copy address to clipboard
    const copyToClipboard = (address: WarehouseAddress) => {
        const text = `${address.alias}
${address.address_line1}${address.address_line2 ? '\n' + address.address_line2 : ''}
${address.city ? address.city + ', ' : ''}${address.state || ''} ${address.zip_code || ''}
${address.country}
${address.contact_name ? '\nContacto: ' + address.contact_name : ''}${address.contact_phone ? '\nTel: ' + address.contact_phone : ''}${address.contact_whatsapp ? '\nWhatsApp: ' + address.contact_whatsapp : ''}`;
        
        navigator.clipboard.writeText(text);
        setSnackbar({ open: true, message: 'Dirección copiada al portapapeles', severity: 'success' });
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
                            <InfoIcon sx={{ fontSize: 32 }} />
                        </Avatar>
                        <Box>
                            <Typography variant="h5" fontWeight="bold">
                                Direcciones - {serviceName}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Configura las direcciones de bodega para este servicio
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
                    <Tab label="📋 Instrucciones" icon={<PackageIcon />} iconPosition="start" />
                    <Tab label={`📍 Direcciones (${addresses.length})`} icon={<LocationIcon />} iconPosition="start" />
                </Tabs>
            </Paper>

            {/* Tab 0: Instrucciones */}
            {tabValue === 0 && instructions && (
                <Box>
                    <Grid container spacing={3}>
                        {/* Instrucciones de Empaque */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <Card>
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                        <PackageIcon color="primary" />
                                        <Typography variant="h6" fontWeight="bold">
                                            Instrucciones de Empaque
                                        </Typography>
                                    </Box>
                                    <TextField
                                        fullWidth
                                        multiline
                                        rows={8}
                                        placeholder="Escribe aquí las instrucciones de empaque para los usuarios...

Ejemplo:
• Use cajas de cartón resistente
• Proteja los artículos frágiles con plástico burbuja
• No exceda 30kg por caja
• Selle bien las cajas con cinta adhesiva"
                                        value={instructions.packaging_instructions}
                                        onChange={(e) => setInstructions({ ...instructions, packaging_instructions: e.target.value })}
                                    />
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Instrucciones de Envío */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <Card>
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                        <ShippingIcon color="primary" />
                                        <Typography variant="h6" fontWeight="bold">
                                            Instrucciones de Envío
                                        </Typography>
                                    </Box>
                                    <TextField
                                        fullWidth
                                        multiline
                                        rows={8}
                                        placeholder="Escribe aquí las instrucciones de envío...

Ejemplo:
• Etiquete cada caja con su Box ID
• Incluya lista de contenido (packing list)
• Tome fotos de las cajas antes de enviar
• Guarde el comprobante de envío"
                                        value={instructions.shipping_instructions}
                                        onChange={(e) => setInstructions({ ...instructions, shipping_instructions: e.target.value })}
                                    />
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Notas Generales */}
                        <Grid size={{ xs: 12 }}>
                            <Card>
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                        <InfoIcon color="primary" />
                                        <Typography variant="h6" fontWeight="bold">
                                            Notas Generales
                                        </Typography>
                                    </Box>
                                    <TextField
                                        fullWidth
                                        multiline
                                        rows={4}
                                        placeholder="Notas adicionales, restricciones, horarios de recepción, etc."
                                        value={instructions.general_notes}
                                        onChange={(e) => setInstructions({ ...instructions, general_notes: e.target.value })}
                                    />
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>

                    {/* Save Button */}
                    <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                            variant="contained"
                            size="large"
                            startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                            onClick={handleSaveInstructions}
                            disabled={saving}
                            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d04a20' } }}
                        >
                            Guardar Instrucciones
                        </Button>
                    </Box>
                </Box>
            )}

            {/* Tab 1: Direcciones */}
            {tabValue === 1 && (
                <Box>
                    {/* Add button */}
                    <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => handleOpenAddressModal()}
                            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d04a20' } }}
                        >
                            Agregar Dirección
                        </Button>
                    </Box>

                    {addresses.length === 0 ? (
                        <Alert severity="info">
                            No hay direcciones configuradas para este servicio. Agrega una para que los usuarios sepan a dónde enviar sus paquetes.
                        </Alert>
                    ) : (
                        <Grid container spacing={2}>
                            {addresses.map((address) => (
                                <Grid size={{ xs: 12, md: 6 }} key={address.id}>
                                    <Card sx={{ 
                                        border: address.is_primary ? `2px solid ${ORANGE}` : '1px solid #e0e0e0',
                                        opacity: address.is_active ? 1 : 0.6,
                                        position: 'relative'
                                    }}>
                                        {address.is_primary && (
                                            <Chip 
                                                label="Principal" 
                                                size="small" 
                                                icon={<StarIcon />}
                                                sx={{ 
                                                    position: 'absolute', 
                                                    top: 8, 
                                                    right: 8,
                                                    bgcolor: ORANGE,
                                                    color: 'white',
                                                    '& .MuiChip-icon': { color: 'white' }
                                                }} 
                                            />
                                        )}
                                        {!address.is_active && (
                                            <Chip 
                                                label="Inactiva" 
                                                size="small" 
                                                color="default"
                                                sx={{ position: 'absolute', top: 8, right: address.is_primary ? 100 : 8 }} 
                                            />
                                        )}
                                        <CardContent>
                                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
                                                <Avatar sx={{ bgcolor: serviceColor }}>
                                                    <HomeIcon />
                                                </Avatar>
                                                <Box sx={{ flex: 1 }}>
                                                    <Typography variant="h6" fontWeight="bold">
                                                        {address.alias}
                                                    </Typography>
                                                    <Typography variant="body2" color="text.secondary">
                                                        {address.address_line1}
                                                    </Typography>
                                                    {address.address_line2 && (
                                                        <Typography variant="body2" color="text.secondary">
                                                            {address.address_line2}
                                                        </Typography>
                                                    )}
                                                    <Typography variant="body2" color="text.secondary">
                                                        {[address.city, address.state, address.zip_code].filter(Boolean).join(', ')}
                                                    </Typography>
                                                    <Typography variant="body2" color="text.secondary">
                                                        {address.country}
                                                    </Typography>
                                                </Box>
                                            </Box>

                                            <Divider sx={{ my: 2 }} />

                                            {/* Contact Info */}
                                            <List dense disablePadding>
                                                {address.contact_name && (
                                                    <ListItem disableGutters>
                                                        <ListItemIcon sx={{ minWidth: 32 }}>
                                                            <Avatar sx={{ width: 24, height: 24, bgcolor: 'grey.200' }}>
                                                                <InfoIcon sx={{ fontSize: 14 }} />
                                                            </Avatar>
                                                        </ListItemIcon>
                                                        <ListItemText 
                                                            primary={address.contact_name}
                                                            primaryTypographyProps={{ variant: 'body2' }}
                                                        />
                                                    </ListItem>
                                                )}
                                                {address.contact_phone && (
                                                    <ListItem disableGutters>
                                                        <ListItemIcon sx={{ minWidth: 32 }}>
                                                            <PhoneIcon sx={{ fontSize: 18 }} color="primary" />
                                                        </ListItemIcon>
                                                        <ListItemText 
                                                            primary={address.contact_phone}
                                                            primaryTypographyProps={{ variant: 'body2' }}
                                                        />
                                                    </ListItem>
                                                )}
                                                {address.contact_whatsapp && (
                                                    <ListItem disableGutters>
                                                        <ListItemIcon sx={{ minWidth: 32 }}>
                                                            <WhatsAppIcon sx={{ fontSize: 18, color: '#25D366' }} />
                                                        </ListItemIcon>
                                                        <ListItemText 
                                                            primary={address.contact_whatsapp}
                                                            primaryTypographyProps={{ variant: 'body2' }}
                                                        />
                                                    </ListItem>
                                                )}
                                                {address.contact_email && (
                                                    <ListItem disableGutters>
                                                        <ListItemIcon sx={{ minWidth: 32 }}>
                                                            <EmailIcon sx={{ fontSize: 18 }} color="primary" />
                                                        </ListItemIcon>
                                                        <ListItemText 
                                                            primary={address.contact_email}
                                                            primaryTypographyProps={{ variant: 'body2' }}
                                                        />
                                                    </ListItem>
                                                )}
                                                {address.business_hours && (
                                                    <ListItem disableGutters>
                                                        <ListItemIcon sx={{ minWidth: 32 }}>
                                                            <ScheduleIcon sx={{ fontSize: 18 }} color="action" />
                                                        </ListItemIcon>
                                                        <ListItemText 
                                                            primary={address.business_hours}
                                                            primaryTypographyProps={{ variant: 'body2' }}
                                                        />
                                                    </ListItem>
                                                )}
                                            </List>

                                            {address.special_instructions && (
                                                <Alert severity="info" sx={{ mt: 2, py: 0 }}>
                                                    <Typography variant="caption">{address.special_instructions}</Typography>
                                                </Alert>
                                            )}

                                            <Divider sx={{ my: 2 }} />

                                            {/* Actions */}
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Box>
                                                    <Tooltip title="Copiar dirección">
                                                        <IconButton size="small" onClick={() => copyToClipboard(address)}>
                                                            <CopyIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                    {!address.is_primary && (
                                                        <Tooltip title="Establecer como principal">
                                                            <IconButton size="small" onClick={() => handleSetPrimary(address.id)} color="warning">
                                                                <StarBorderIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                </Box>
                                                <Box>
                                                    <Tooltip title="Editar">
                                                        <IconButton size="small" onClick={() => handleOpenAddressModal(address)} color="primary">
                                                            <EditIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Eliminar">
                                                        <IconButton size="small" onClick={() => handleDeleteAddress(address.id)} color="error">
                                                            <DeleteIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Box>
                                            </Box>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            ))}
                        </Grid>
                    )}
                </Box>
            )}

            {/* Modal: Dirección */}
            <Dialog open={openAddressModal} onClose={() => setOpenAddressModal(false)} maxWidth="md" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LocationIcon color="primary" />
                        {editingAddress ? 'Editar Dirección' : 'Nueva Dirección de Bodega'}
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                label="Alias / Nombre"
                                fullWidth
                                required
                                value={addressForm.alias}
                                onChange={(e) => setAddressForm({ ...addressForm, alias: e.target.value })}
                                placeholder="Ej: Bodega Principal China"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                label="País"
                                fullWidth
                                value={addressForm.country}
                                onChange={(e) => setAddressForm({ ...addressForm, country: e.target.value })}
                            />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                label="Dirección (Línea 1)"
                                fullWidth
                                required
                                value={addressForm.address_line1}
                                onChange={(e) => setAddressForm({ ...addressForm, address_line1: e.target.value })}
                                placeholder="Calle, número, colonia..."
                            />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                label="Dirección (Línea 2)"
                                fullWidth
                                value={addressForm.address_line2 || ''}
                                onChange={(e) => setAddressForm({ ...addressForm, address_line2: e.target.value || null })}
                                placeholder="Edificio, piso, referencias..."
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                                label="Ciudad"
                                fullWidth
                                value={addressForm.city || ''}
                                onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value || null })}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                                label="Estado/Provincia"
                                fullWidth
                                value={addressForm.state || ''}
                                onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value || null })}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                                label="Código Postal"
                                fullWidth
                                value={addressForm.zip_code || ''}
                                onChange={(e) => setAddressForm({ ...addressForm, zip_code: e.target.value || null })}
                            />
                        </Grid>

                        <Grid size={{ xs: 12 }}>
                            <Divider><Chip label="Contacto" size="small" /></Divider>
                        </Grid>

                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                label="Nombre de Contacto"
                                fullWidth
                                value={addressForm.contact_name || ''}
                                onChange={(e) => setAddressForm({ ...addressForm, contact_name: e.target.value || null })}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                label="Teléfono"
                                fullWidth
                                value={addressForm.contact_phone || ''}
                                onChange={(e) => setAddressForm({ ...addressForm, contact_phone: e.target.value || null })}
                                placeholder="+52 55 1234 5678"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                label="WhatsApp"
                                fullWidth
                                value={addressForm.contact_whatsapp || ''}
                                onChange={(e) => setAddressForm({ ...addressForm, contact_whatsapp: e.target.value || null })}
                                placeholder="+52 55 1234 5678"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                label="Email"
                                fullWidth
                                type="email"
                                value={addressForm.contact_email || ''}
                                onChange={(e) => setAddressForm({ ...addressForm, contact_email: e.target.value || null })}
                            />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                label="Horario de Atención"
                                fullWidth
                                value={addressForm.business_hours || ''}
                                onChange={(e) => setAddressForm({ ...addressForm, business_hours: e.target.value || null })}
                                placeholder="Lun-Vie 9:00-18:00, Sáb 9:00-14:00"
                            />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                label="Instrucciones Especiales"
                                fullWidth
                                multiline
                                rows={2}
                                value={addressForm.special_instructions || ''}
                                onChange={(e) => setAddressForm({ ...addressForm, special_instructions: e.target.value || null })}
                                placeholder="Indicaciones adicionales para esta ubicación..."
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={addressForm.is_primary}
                                        onChange={(e) => setAddressForm({ ...addressForm, is_primary: e.target.checked })}
                                    />
                                }
                                label="Dirección Principal"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={addressForm.is_active}
                                        onChange={(e) => setAddressForm({ ...addressForm, is_active: e.target.checked })}
                                    />
                                }
                                label="Activa (visible para usuarios)"
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenAddressModal(false)}>Cancelar</Button>
                    <Button 
                        variant="contained" 
                        onClick={handleSaveAddress}
                        disabled={saving}
                        sx={{ bgcolor: ORANGE }}
                    >
                        {saving ? <CircularProgress size={20} /> : editingAddress ? 'Actualizar' : 'Crear'}
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
