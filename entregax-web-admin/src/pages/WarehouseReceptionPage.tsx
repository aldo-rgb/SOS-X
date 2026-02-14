// ============================================
// PÁGINA DE RECEPCIÓN DE BODEGA
// Panel para registro de paquetes según ubicación
// ============================================

import { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Paper,
    Grid,
    TextField,
    Button,
    Card,
    CardContent,
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
    Alert,
    InputAdornment,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    CircularProgress,
    Divider,
    Tooltip,
    Badge,
} from '@mui/material';
import {
    Add as AddIcon,
    Search as SearchIcon,
    QrCodeScanner as ScanIcon,
    Edit as EditIcon,
    LocalShipping as ShippingIcon,
    Inventory as InventoryIcon,
    CheckCircle as CheckIcon,
    Pending as PendingIcon,
    Person as PersonIcon,
    Refresh as RefreshIcon,
    Today as TodayIcon,
    AttachMoney as MoneyIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Service {
    id: number;
    code: string;
    name: string;
    calculation_type: string;
    requires_dimensions: boolean;
}

interface Receipt {
    id: number;
    tracking_number: string;
    service_code: string;
    service_name: string;
    user_id: number;
    client_name: string;
    box_id: string;
    weight_kg: number;
    length_cm: number;
    width_cm: number;
    height_cm: number;
    quantity: number;
    quoted_usd: number;
    quoted_mxn: number;
    status: string;
    payment_status: string;
    received_by_name: string;
    warehouse_location: string;
    notes: string;
    created_at: string;
}

interface Stats {
    total_today: number;
    pending: number;
    in_transit: number;
    delivered: number;
    pending_payment: number;
    total_usd_today: number;
}

interface ClientInfo {
    id: number;
    full_name: string;
    email: string;
    box_id: string;
    phone: string;
    price_list: string;
}

interface NewReceipt {
    tracking_number: string;
    service_code: string;
    box_id: string;
    weight_kg: string;
    length_cm: string;
    width_cm: string;
    height_cm: string;
    quantity: string;
    notes: string;
}

const initialReceipt: NewReceipt = {
    tracking_number: '',
    service_code: '',
    box_id: '',
    weight_kg: '',
    length_cm: '',
    width_cm: '',
    height_cm: '',
    quantity: '1',
    notes: '',
};

interface Props {
    warehouseLocation?: string;
}

export default function WarehouseReceptionPage({ warehouseLocation: _warehouseLocation }: Props) {
    const { t } = useTranslation();
    const [services, setServices] = useState<Service[]>([]);
    const [receipts, setReceipts] = useState<Receipt[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [formOpen, setFormOpen] = useState(false);
    const [formData, setFormData] = useState<NewReceipt>(initialReceipt);
    const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
    const [searchingClient, setSearchingClient] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [lastQuote, setLastQuote] = useState<{ usd: number; mxn: number } | null>(null);

    const token = localStorage.getItem('token');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [servicesRes, receiptsRes, statsRes] = await Promise.all([
                fetch(`${API_URL}/api/warehouse/services`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch(`${API_URL}/api/warehouse/receipts`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch(`${API_URL}/api/warehouse/stats`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ]);

            if (servicesRes.ok) {
                const data = await servicesRes.json();
                setServices(data);
                if (data.length > 0) {
                    setFormData((prev) => ({ ...prev, service_code: data[0].code }));
                }
            }
            if (receiptsRes.ok) {
                setReceipts(await receiptsRes.json());
            }
            if (statsRes.ok) {
                const statsData = await statsRes.json();
                setStats(statsData.stats);
            }
        } catch (err) {
            console.error('Error loading data:', err);
        } finally {
            setLoading(false);
        }
    };

    const searchClient = async (boxId: string) => {
        if (!boxId || boxId.length < 3) {
            setClientInfo(null);
            return;
        }
        setSearchingClient(true);
        try {
            const res = await fetch(`${API_URL}/api/warehouse/client/${boxId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                setClientInfo(await res.json());
            } else {
                setClientInfo(null);
            }
        } catch (err) {
            setClientInfo(null);
        } finally {
            setSearchingClient(false);
        }
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        setError('');
        setSuccess('');
        setLastQuote(null);

        try {
            const res = await fetch(`${API_URL}/api/warehouse/receipts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(formData),
            });

            if (res.ok) {
                const data = await res.json();
                setSuccess(`✅ Paquete registrado: ${formData.tracking_number}`);
                if (data.quote) {
                    setLastQuote(data.quote);
                }
                setFormData({ ...initialReceipt, service_code: formData.service_code });
                setClientInfo(null);
                setFormOpen(false);
                loadData();
            } else {
                const err = await res.json();
                setError(err.error || 'Error al registrar');
            }
        } catch (err) {
            setError('Error de conexión');
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'received':
                return 'info';
            case 'in_transit':
                return 'warning';
            case 'delivered':
                return 'success';
            case 'cancelled':
                return 'error';
            default:
                return 'default';
        }
    };

    const getPaymentColor = (status: string) => {
        switch (status) {
            case 'paid':
                return 'success';
            case 'pending':
                return 'warning';
            case 'cancelled':
                return 'error';
            default:
                return 'default';
        }
    };

    const currentService = services.find((s) => s.code === formData.service_code);
    const requiresDimensions = currentService?.requires_dimensions ?? true;

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h4" fontWeight="bold">
                        📦 {t('warehouse.title', 'Recepción de Bodega')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {t('warehouse.subtitle', 'Registro de paquetes entrantes')}
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadData}>
                        {t('common.refresh', 'Actualizar')}
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setFormOpen(true)}
                        disabled={services.length === 0}
                    >
                        {t('warehouse.newPackage', 'Nuevo Paquete')}
                    </Button>
                </Box>
            </Box>

            {/* Alertas */}
            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}
            {success && (
                <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
                    {success}
                    {lastQuote && (
                        <Box sx={{ mt: 1 }}>
                            <strong>Cotización:</strong> ${Number(lastQuote.usd || 0).toFixed(2)} USD / ${Number(lastQuote.mxn || 0).toFixed(2)} MXN
                        </Box>
                    )}
                </Alert>
            )}

            {services.length === 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    {t('warehouse.noServices', 'No tienes servicios asignados a tu ubicación de bodega')}
                </Alert>
            )}

            {/* Stats Cards */}
            {stats && (
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid size={{ xs: 6, md: 2 }}>
                        <Card>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <TodayIcon color="primary" sx={{ fontSize: 40 }} />
                                <Typography variant="h4">{stats.total_today}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Hoy
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 6, md: 2 }}>
                        <Card>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <Badge badgeContent={stats.pending} color="warning">
                                    <PendingIcon color="warning" sx={{ fontSize: 40 }} />
                                </Badge>
                                <Typography variant="h4">{stats.pending}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Pendientes
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 6, md: 2 }}>
                        <Card>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <ShippingIcon color="info" sx={{ fontSize: 40 }} />
                                <Typography variant="h4">{stats.in_transit}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    En Tránsito
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 6, md: 2 }}>
                        <Card>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <CheckIcon color="success" sx={{ fontSize: 40 }} />
                                <Typography variant="h4">{stats.delivered}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Entregados
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 6, md: 2 }}>
                        <Card>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <MoneyIcon color="error" sx={{ fontSize: 40 }} />
                                <Typography variant="h4">{stats.pending_payment}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Sin Pagar
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 6, md: 2 }}>
                        <Card sx={{ bgcolor: 'primary.light', color: 'primary.contrastText' }}>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <Typography variant="h5">${Number(stats.total_usd_today || 0).toFixed(0)}</Typography>
                                <Typography variant="body2">USD Hoy</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            )}

            {/* Servicios disponibles */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                    Servicios disponibles en tu ubicación:
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {services.map((service) => (
                        <Chip
                            key={service.id}
                            icon={<InventoryIcon />}
                            label={service.name}
                            color="primary"
                            variant="outlined"
                        />
                    ))}
                </Box>
            </Paper>

            {/* Tabla de recepciones */}
            <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                    {t('warehouse.recentReceipts', 'Recepciones Recientes')}
                </Typography>
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Tracking</TableCell>
                                <TableCell>Servicio</TableCell>
                                <TableCell>Cliente</TableCell>
                                <TableCell>Peso/Dim</TableCell>
                                <TableCell>Cotización</TableCell>
                                <TableCell>Estado</TableCell>
                                <TableCell>Pago</TableCell>
                                <TableCell>Fecha</TableCell>
                                <TableCell>Acciones</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {receipts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} align="center">
                                        <Typography color="text.secondary">
                                            No hay recepciones registradas
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                receipts.map((receipt) => (
                                    <TableRow key={receipt.id}>
                                        <TableCell>
                                            <Typography variant="body2" fontFamily="monospace">
                                                {receipt.tracking_number}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip label={receipt.service_name || receipt.service_code} size="small" />
                                        </TableCell>
                                        <TableCell>
                                            <Box>
                                                <Typography variant="body2">
                                                    {receipt.client_name || 'Sin asignar'}
                                                </Typography>
                                                {receipt.box_id && (
                                                    <Typography variant="caption" color="primary">
                                                        {receipt.box_id}
                                                    </Typography>
                                                )}
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            {receipt.weight_kg && `${receipt.weight_kg}kg`}
                                            {receipt.length_cm && (
                                                <Typography variant="caption" display="block">
                                                    {receipt.length_cm}×{receipt.width_cm}×{receipt.height_cm}cm
                                                </Typography>
                                            )}
                                            {receipt.quantity > 1 && (
                                                <Chip label={`×${receipt.quantity}`} size="small" color="secondary" />
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {receipt.quoted_usd ? (
                                                <Box>
                                                    <Typography variant="body2" fontWeight="bold" color="success.main">
                                                        ${Number(receipt.quoted_usd).toFixed(2)} USD
                                                    </Typography>
                                                    <Typography variant="caption">
                                                        ${Number(receipt.quoted_mxn || 0).toFixed(2)} MXN
                                                    </Typography>
                                                </Box>
                                            ) : (
                                                <Typography variant="caption" color="text.secondary">
                                                    Pendiente
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={receipt.status}
                                                color={getStatusColor(receipt.status)}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={receipt.payment_status}
                                                color={getPaymentColor(receipt.payment_status)}
                                                size="small"
                                                variant="outlined"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="caption">
                                                {new Date(receipt.created_at).toLocaleDateString()}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Tooltip title="Editar">
                                                <IconButton size="small">
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            {/* Dialog para nuevo paquete */}
            <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ScanIcon color="primary" />
                        {t('warehouse.registerPackage', 'Registrar Paquete')}
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        {/* Servicio */}
                        <Grid size={12}>
                            <FormControl fullWidth>
                                <InputLabel>Servicio</InputLabel>
                                <Select
                                    value={formData.service_code}
                                    onChange={(e) =>
                                        setFormData({ ...formData, service_code: e.target.value })
                                    }
                                    label="Servicio"
                                >
                                    {services.map((s) => (
                                        <MenuItem key={s.code} value={s.code}>
                                            {s.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>

                        {/* Tracking */}
                        <Grid size={12}>
                            <TextField
                                fullWidth
                                label="Número de Tracking"
                                value={formData.tracking_number}
                                onChange={(e) =>
                                    setFormData({ ...formData, tracking_number: e.target.value.toUpperCase() })
                                }
                                placeholder="Escanear o ingresar"
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <ScanIcon color="action" />
                                        </InputAdornment>
                                    ),
                                }}
                                autoFocus
                            />
                        </Grid>

                        {/* Box ID */}
                        <Grid size={12}>
                            <TextField
                                fullWidth
                                label="Box ID del Cliente"
                                value={formData.box_id}
                                onChange={(e) => {
                                    const val = e.target.value.toUpperCase();
                                    setFormData({ ...formData, box_id: val });
                                    if (val.length >= 3) {
                                        searchClient(val);
                                    }
                                }}
                                placeholder="Ej: EX-A1234"
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            {searchingClient ? (
                                                <CircularProgress size={20} />
                                            ) : (
                                                <SearchIcon color="action" />
                                            )}
                                        </InputAdornment>
                                    ),
                                }}
                            />
                            {clientInfo && (
                                <Alert severity="success" sx={{ mt: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <PersonIcon fontSize="small" />
                                        <Box>
                                            <strong>{clientInfo.full_name}</strong>
                                            <Typography variant="caption" display="block">
                                                {clientInfo.email} | {clientInfo.price_list || 'Lista General'}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Alert>
                            )}
                        </Grid>

                        <Grid size={12}>
                            <Divider />
                        </Grid>

                        {/* Dimensiones (si aplica) */}
                        {requiresDimensions && (
                            <>
                                <Grid size={12}>
                                    <TextField
                                        fullWidth
                                        label="Peso (kg)"
                                        type="number"
                                        value={formData.weight_kg}
                                        onChange={(e) =>
                                            setFormData({ ...formData, weight_kg: e.target.value })
                                        }
                                        InputProps={{
                                            endAdornment: <InputAdornment position="end">kg</InputAdornment>,
                                        }}
                                    />
                                </Grid>
                                <Grid size={4}>
                                    <TextField
                                        fullWidth
                                        label="Largo"
                                        type="number"
                                        value={formData.length_cm}
                                        onChange={(e) =>
                                            setFormData({ ...formData, length_cm: e.target.value })
                                        }
                                        InputProps={{
                                            endAdornment: <InputAdornment position="end">cm</InputAdornment>,
                                        }}
                                    />
                                </Grid>
                                <Grid size={4}>
                                    <TextField
                                        fullWidth
                                        label="Ancho"
                                        type="number"
                                        value={formData.width_cm}
                                        onChange={(e) =>
                                            setFormData({ ...formData, width_cm: e.target.value })
                                        }
                                        InputProps={{
                                            endAdornment: <InputAdornment position="end">cm</InputAdornment>,
                                        }}
                                    />
                                </Grid>
                                <Grid size={4}>
                                    <TextField
                                        fullWidth
                                        label="Alto"
                                        type="number"
                                        value={formData.height_cm}
                                        onChange={(e) =>
                                            setFormData({ ...formData, height_cm: e.target.value })
                                        }
                                        InputProps={{
                                            endAdornment: <InputAdornment position="end">cm</InputAdornment>,
                                        }}
                                    />
                                </Grid>
                            </>
                        )}

                        {/* Cantidad (siempre) */}
                        <Grid size={6}>
                            <TextField
                                fullWidth
                                label="Cantidad de Bultos"
                                type="number"
                                value={formData.quantity}
                                onChange={(e) =>
                                    setFormData({ ...formData, quantity: e.target.value })
                                }
                                inputProps={{ min: 1 }}
                            />
                        </Grid>

                        {/* Notas */}
                        <Grid size={12}>
                            <TextField
                                fullWidth
                                label="Notas"
                                multiline
                                rows={2}
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                placeholder="Observaciones del paquete..."
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setFormOpen(false)}>Cancelar</Button>
                    <Button
                        variant="contained"
                        onClick={handleSubmit}
                        disabled={!formData.tracking_number || !formData.service_code || submitting}
                        startIcon={submitting ? <CircularProgress size={20} /> : <CheckIcon />}
                    >
                        {submitting ? 'Registrando...' : 'Registrar'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
