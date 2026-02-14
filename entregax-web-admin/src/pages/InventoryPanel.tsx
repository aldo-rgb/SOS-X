// ============================================
// PANEL DE INVENTARIO POR SERVICIO
// Gestión de stock, items y movimientos
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Button,
    TextField,
    IconButton,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Grid,
    Card,
    CardContent,
    Alert,
    CircularProgress,
    Tabs,
    Tab,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    InputAdornment,
    Tooltip,
    Badge,
    LinearProgress,
    Snackbar,
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Search as SearchIcon,
    Inventory as InventoryIcon,
    Warning as WarningIcon,
    TrendingUp as TrendingUpIcon,
    TrendingDown as TrendingDownIcon,
    SwapHoriz as SwapIcon,
    History as HistoryIcon,
    Refresh as RefreshIcon,
    QrCodeScanner as BarcodeIcon,
    LocalShipping as ShippingIcon,
    Warehouse as WarehouseIcon,
} from '@mui/icons-material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Tipos
interface InventoryItemForm extends Partial<InventoryItem> {
    initial_stock?: number;
}

// Tipos
interface InventoryItem {
    id: number;
    service_type: string;
    sku: string;
    name: string;
    description?: string;
    category?: string;
    unit: string;
    min_stock: number;
    max_stock: number;
    current_stock: number;
    reserved_stock: number;
    available_stock: number;
    cost_price: number;
    sale_price: number;
    location?: string;
    barcode?: string;
    is_active: boolean;
    notes?: string;
    stock_status: 'low' | 'normal' | 'excess';
    movement_count: number;
    created_at: string;
    updated_at: string;
}

interface InventoryMovement {
    id: number;
    item_id: number;
    sku: string;
    item_name: string;
    movement_type: string;
    quantity: number;
    previous_stock: number;
    new_stock: number;
    notes?: string;
    created_by_name?: string;
    created_at: string;
}

interface InventoryStats {
    general: {
        total_items: number;
        active_items: number;
        low_stock_items: number;
        excess_stock_items: number;
        total_units: number;
        reserved_units: number;
        inventory_cost_value: number;
        inventory_sale_value: number;
    };
    byCategory: { category: string; item_count: number; total_stock: number; category_value: number }[];
    lowStockAlerts: InventoryItem[];
}

interface Props {
    serviceType: string;
    serviceName: string;
    serviceColor: string;
}

const MOVEMENT_TYPES = [
    { value: 'entry', label: 'Entrada', icon: <TrendingUpIcon />, color: 'success' },
    { value: 'exit', label: 'Salida', icon: <TrendingDownIcon />, color: 'error' },
    { value: 'adjustment', label: 'Ajuste', icon: <SwapIcon />, color: 'warning' },
    { value: 'reserve', label: 'Reserva', icon: <ShippingIcon />, color: 'info' },
    { value: 'unreserve', label: 'Liberar Reserva', icon: <ShippingIcon />, color: 'secondary' },
    { value: 'damage', label: 'Merma', icon: <WarningIcon />, color: 'error' },
    { value: 'return', label: 'Devolución', icon: <TrendingUpIcon />, color: 'success' },
];

const CATEGORIES = [
    { value: 'empaques', label: 'Empaques' },
    { value: 'insumos', label: 'Insumos' },
    { value: 'etiquetas', label: 'Etiquetas' },
    { value: 'documentos', label: 'Documentos' },
    { value: 'equipo', label: 'Equipo' },
    { value: 'otros', label: 'Otros' },
];

export default function InventoryPanel({ serviceType, serviceName, serviceColor }: Props) {
    const { t } = useTranslation();
    const [tabValue, setTabValue] = useState(0);
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [movements, setMovements] = useState<InventoryMovement[]>([]);
    const [stats, setStats] = useState<InventoryStats | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [showLowStock, setShowLowStock] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });

    // Dialogs
    const [itemDialog, setItemDialog] = useState<{ open: boolean; item: InventoryItemForm | null; mode: 'create' | 'edit' }>({ open: false, item: null, mode: 'create' });
    const [movementDialog, setMovementDialog] = useState<{ open: boolean; item: InventoryItem | null }>({ open: false, item: null });
    const [movementForm, setMovementForm] = useState({ movement_type: 'entry', quantity: 1, notes: '' });

    const token = localStorage.getItem('token');

    // Fetch data
    const fetchItems = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (searchTerm) params.append('search', searchTerm);
            if (categoryFilter) params.append('category', categoryFilter);
            if (showLowStock) params.append('low_stock', 'true');

            const res = await fetch(`${API_URL}/api/inventory/${serviceType}/items?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setItems(data.items || []);
            }
        } catch (err) {
            console.error('Error fetching items:', err);
        }
    }, [serviceType, token, searchTerm, categoryFilter, showLowStock]);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/api/inventory/${serviceType}/stats`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch (err) {
            console.error('Error fetching stats:', err);
        }
    }, [serviceType, token]);

    const fetchMovements = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/api/inventory/${serviceType}/movements?limit=100`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setMovements(data);
            }
        } catch (err) {
            console.error('Error fetching movements:', err);
        }
    }, [serviceType, token]);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await Promise.all([fetchItems(), fetchStats(), fetchMovements()]);
            setLoading(false);
        };
        loadData();
    }, [fetchItems, fetchStats, fetchMovements]);

    // Handlers
    const handleSaveItem = async () => {
        const { item, mode } = itemDialog;
        if (!item) return;

        try {
            const url = mode === 'create'
                ? `${API_URL}/api/inventory/${serviceType}/items`
                : `${API_URL}/api/inventory/${serviceType}/items/${item.id}`;

            const method = mode === 'create' ? 'POST' : 'PUT';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(item),
            });

            if (res.ok) {
                setSnackbar({ open: true, message: mode === 'create' ? 'Item creado' : 'Item actualizado', severity: 'success' });
                setItemDialog({ open: false, item: null, mode: 'create' });
                fetchItems();
                fetchStats();
            } else {
                const err = await res.json();
                setSnackbar({ open: true, message: err.error || 'Error al guardar', severity: 'error' });
            }
        } catch {
            setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
        }
    };

    const handleDeleteItem = async (id: number) => {
        if (!confirm('¿Desactivar este item de inventario?')) return;

        try {
            const res = await fetch(`${API_URL}/api/inventory/${serviceType}/items/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.ok) {
                setSnackbar({ open: true, message: 'Item desactivado', severity: 'success' });
                fetchItems();
                fetchStats();
            }
        } catch {
            setSnackbar({ open: true, message: 'Error al desactivar', severity: 'error' });
        }
    };

    const handleRegisterMovement = async () => {
        const { item } = movementDialog;
        if (!item) return;

        try {
            const res = await fetch(`${API_URL}/api/inventory/${serviceType}/movement`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    item_id: item.id,
                    ...movementForm,
                }),
            });

            if (res.ok) {
                setSnackbar({ open: true, message: 'Movimiento registrado', severity: 'success' });
                setMovementDialog({ open: false, item: null });
                setMovementForm({ movement_type: 'entry', quantity: 1, notes: '' });
                fetchItems();
                fetchStats();
                fetchMovements();
            } else {
                const err = await res.json();
                setSnackbar({ open: true, message: err.error || 'Error en movimiento', severity: 'error' });
            }
        } catch {
            setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
        }
    };

    const getStockStatusColor = (status: string) => {
        switch (status) {
            case 'low': return 'error';
            case 'excess': return 'warning';
            default: return 'success';
        }
    };

    const getStockPercentage = (current: number, max: number) => {
        return Math.min(100, (current / max) * 100);
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value || 0);
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box>
            {/* Header */}
            <Paper sx={{ p: 3, mb: 3, background: `linear-gradient(135deg, ${serviceColor}15 0%, ${serviceColor}05 100%)` }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <InventoryIcon sx={{ fontSize: 40, color: serviceColor }} />
                        <Box>
                            <Typography variant="h5" fontWeight="bold">
                                {t('inventory.title', 'Inventario')} - {serviceName}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {t('inventory.subtitle', 'Gestión de stock, insumos y materiales')}
                            </Typography>
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                            startIcon={<RefreshIcon />}
                            onClick={() => { fetchItems(); fetchStats(); fetchMovements(); }}
                        >
                            {t('common.refresh', 'Actualizar')}
                        </Button>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => setItemDialog({ open: true, item: { unit: 'pza', min_stock: 0, max_stock: 999, initial_stock: 0 }, mode: 'create' })}
                            sx={{ bgcolor: serviceColor }}
                        >
                            {t('inventory.addItem', 'Nuevo Item')}
                        </Button>
                    </Box>
                </Box>
            </Paper>

            {/* Stats Cards */}
            {stats && (
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid size={{ xs: 6, md: 3 }}>
                        <Card>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <WarehouseIcon sx={{ fontSize: 32, color: serviceColor, mb: 1 }} />
                                <Typography variant="h4" fontWeight="bold">
                                    {stats.general.active_items || 0}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {t('inventory.stats.totalItems', 'Items Activos')}
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                        <Card>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <Badge badgeContent={stats.general.low_stock_items || 0} color="error">
                                    <WarningIcon sx={{ fontSize: 32, color: 'warning.main', mb: 1 }} />
                                </Badge>
                                <Typography variant="h4" fontWeight="bold" color="error.main">
                                    {stats.general.low_stock_items || 0}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {t('inventory.stats.lowStock', 'Stock Bajo')}
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                        <Card>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <TrendingUpIcon sx={{ fontSize: 32, color: 'success.main', mb: 1 }} />
                                <Typography variant="h4" fontWeight="bold">
                                    {stats.general.total_units || 0}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {t('inventory.stats.totalUnits', 'Unidades en Stock')}
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                        <Card>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <InventoryIcon sx={{ fontSize: 32, color: 'info.main', mb: 1 }} />
                                <Typography variant="h5" fontWeight="bold">
                                    {formatCurrency(Number(stats.general.inventory_cost_value) || 0)}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {t('inventory.stats.inventoryValue', 'Valor Inventario')}
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            )}

            {/* Alertas de Stock Bajo */}
            {stats && stats.lowStockAlerts && stats.lowStockAlerts.length > 0 && (
                <Alert severity="warning" sx={{ mb: 3 }}>
                    <Typography fontWeight="bold" gutterBottom>
                        ⚠️ {t('inventory.alerts.lowStockWarning', 'Items con stock bajo que requieren reabastecimiento:')}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                        {stats.lowStockAlerts.slice(0, 5).map(item => (
                            <Chip
                                key={item.id}
                                label={`${item.sku}: ${item.current_stock}/${item.min_stock}`}
                                color="error"
                                variant="outlined"
                                size="small"
                            />
                        ))}
                        {stats.lowStockAlerts.length > 5 && (
                            <Chip label={`+${stats.lowStockAlerts.length - 5} más`} size="small" />
                        )}
                    </Box>
                </Alert>
            )}

            {/* Tabs */}
            <Paper sx={{ mb: 3 }}>
                <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
                    <Tab icon={<InventoryIcon />} label={t('inventory.tabs.items', 'Inventario')} />
                    <Tab icon={<HistoryIcon />} label={t('inventory.tabs.movements', 'Movimientos')} />
                </Tabs>
            </Paper>

            {/* Tab: Inventario */}
            {tabValue === 0 && (
                <Paper sx={{ p: 2 }}>
                    {/* Filtros */}
                    <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                        <TextField
                            placeholder={t('inventory.search', 'Buscar por SKU, nombre...')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon />
                                    </InputAdornment>
                                ),
                            }}
                            sx={{ minWidth: 250 }}
                        />
                        <FormControl sx={{ minWidth: 150 }}>
                            <InputLabel>{t('inventory.category', 'Categoría')}</InputLabel>
                            <Select
                                value={categoryFilter}
                                label={t('inventory.category', 'Categoría')}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                            >
                                <MenuItem value="">{t('common.all', 'Todas')}</MenuItem>
                                {CATEGORIES.map(cat => (
                                    <MenuItem key={cat.value} value={cat.value}>{cat.label}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <Button
                            variant={showLowStock ? 'contained' : 'outlined'}
                            color="warning"
                            startIcon={<WarningIcon />}
                            onClick={() => setShowLowStock(!showLowStock)}
                        >
                            {t('inventory.lowStockOnly', 'Solo Stock Bajo')}
                        </Button>
                    </Box>

                    {/* Tabla de Items */}
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'grey.100' }}>
                                    <TableCell>{t('inventory.table.sku', 'SKU')}</TableCell>
                                    <TableCell>{t('inventory.table.name', 'Nombre')}</TableCell>
                                    <TableCell>{t('inventory.table.category', 'Categoría')}</TableCell>
                                    <TableCell align="center">{t('inventory.table.stock', 'Stock')}</TableCell>
                                    <TableCell align="center">{t('inventory.table.available', 'Disponible')}</TableCell>
                                    <TableCell>{t('inventory.table.location', 'Ubicación')}</TableCell>
                                    <TableCell align="right">{t('inventory.table.cost', 'Costo')}</TableCell>
                                    <TableCell align="center">{t('inventory.table.actions', 'Acciones')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {items.map((item) => (
                                    <TableRow key={item.id} hover>
                                        <TableCell>
                                            <Typography fontWeight="bold" sx={{ fontFamily: 'monospace' }}>
                                                {item.sku}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Box>
                                                <Typography>{item.name}</Typography>
                                                {item.description && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        {item.description.substring(0, 50)}...
                                                    </Typography>
                                                )}
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={CATEGORIES.find(c => c.value === item.category)?.label || item.category}
                                                size="small"
                                                variant="outlined"
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Box sx={{ minWidth: 120 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                                                    <Chip
                                                        label={`${item.current_stock} ${item.unit}`}
                                                        color={getStockStatusColor(item.stock_status) as any}
                                                        size="small"
                                                    />
                                                </Box>
                                                <LinearProgress
                                                    variant="determinate"
                                                    value={getStockPercentage(item.current_stock, item.max_stock)}
                                                    color={getStockStatusColor(item.stock_status) as any}
                                                    sx={{ mt: 0.5, height: 4, borderRadius: 2 }}
                                                />
                                                <Typography variant="caption" color="text.secondary">
                                                    Min: {item.min_stock} / Max: {item.max_stock}
                                                </Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Typography fontWeight="bold" color={item.available_stock > 0 ? 'success.main' : 'error.main'}>
                                                {item.available_stock} {item.unit}
                                            </Typography>
                                            {item.reserved_stock > 0 && (
                                                <Typography variant="caption" color="warning.main">
                                                    ({item.reserved_stock} reservado)
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>{item.location || '-'}</TableCell>
                                        <TableCell align="right">
                                            {formatCurrency(item.cost_price)}
                                        </TableCell>
                                        <TableCell align="center">
                                            <Tooltip title={t('inventory.registerMovement', 'Registrar movimiento')}>
                                                <IconButton
                                                    color="primary"
                                                    onClick={() => {
                                                        setMovementDialog({ open: true, item });
                                                        setMovementForm({ movement_type: 'entry', quantity: 1, notes: '' });
                                                    }}
                                                >
                                                    <SwapIcon />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title={t('common.edit', 'Editar')}>
                                                <IconButton
                                                    onClick={() => setItemDialog({ open: true, item, mode: 'edit' })}
                                                >
                                                    <EditIcon />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title={t('common.delete', 'Desactivar')}>
                                                <IconButton
                                                    color="error"
                                                    onClick={() => handleDeleteItem(item.id)}
                                                >
                                                    <DeleteIcon />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {items.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                                            <InventoryIcon sx={{ fontSize: 48, color: 'grey.400', mb: 1 }} />
                                            <Typography color="text.secondary">
                                                {t('inventory.noItems', 'No hay items de inventario')}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            {/* Tab: Movimientos */}
            {tabValue === 1 && (
                <Paper sx={{ p: 2 }}>
                    <Typography variant="h6" gutterBottom>
                        <HistoryIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                        {t('inventory.recentMovements', 'Movimientos Recientes')}
                    </Typography>

                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'grey.100' }}>
                                    <TableCell>{t('inventory.movements.date', 'Fecha')}</TableCell>
                                    <TableCell>{t('inventory.movements.type', 'Tipo')}</TableCell>
                                    <TableCell>{t('inventory.movements.item', 'Item')}</TableCell>
                                    <TableCell align="center">{t('inventory.movements.quantity', 'Cantidad')}</TableCell>
                                    <TableCell align="center">{t('inventory.movements.stock', 'Stock')}</TableCell>
                                    <TableCell>{t('inventory.movements.notes', 'Notas')}</TableCell>
                                    <TableCell>{t('inventory.movements.user', 'Usuario')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {movements.map((mov) => {
                                    const movType = MOVEMENT_TYPES.find(m => m.value === mov.movement_type);
                                    return (
                                        <TableRow key={mov.id} hover>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {new Date(mov.created_at).toLocaleDateString('es-MX')}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {new Date(mov.created_at).toLocaleTimeString('es-MX')}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    icon={movType?.icon}
                                                    label={movType?.label || mov.movement_type}
                                                    color={movType?.color as any || 'default'}
                                                    size="small"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography fontWeight="bold" sx={{ fontFamily: 'monospace' }}>
                                                    {mov.sku}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {mov.item_name}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                                <Typography
                                                    fontWeight="bold"
                                                    color={mov.quantity > 0 ? 'success.main' : 'error.main'}
                                                >
                                                    {mov.quantity > 0 ? '+' : ''}{mov.quantity}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                                <Typography variant="body2">
                                                    {mov.previous_stock} → {mov.new_stock}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" color="text.secondary">
                                                    {mov.notes || '-'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {mov.created_by_name || '-'}
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {movements.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                                            <HistoryIcon sx={{ fontSize: 48, color: 'grey.400', mb: 1 }} />
                                            <Typography color="text.secondary">
                                                {t('inventory.noMovements', 'No hay movimientos registrados')}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            {/* Dialog: Crear/Editar Item */}
            <Dialog open={itemDialog.open} onClose={() => setItemDialog({ open: false, item: null, mode: 'create' })} maxWidth="md" fullWidth>
                <DialogTitle>
                    {itemDialog.mode === 'create' ? t('inventory.dialog.createTitle', 'Nuevo Item de Inventario') : t('inventory.dialog.editTitle', 'Editar Item')}
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <TextField
                                fullWidth
                                label="SKU *"
                                value={itemDialog.item?.sku || ''}
                                onChange={(e) => setItemDialog({ ...itemDialog, item: { ...itemDialog.item, sku: e.target.value.toUpperCase() } })}
                                disabled={itemDialog.mode === 'edit'}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 8 }}>
                            <TextField
                                fullWidth
                                label="Nombre *"
                                value={itemDialog.item?.name || ''}
                                onChange={(e) => setItemDialog({ ...itemDialog, item: { ...itemDialog.item, name: e.target.value } })}
                            />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                fullWidth
                                multiline
                                rows={2}
                                label="Descripción"
                                value={itemDialog.item?.description || ''}
                                onChange={(e) => setItemDialog({ ...itemDialog, item: { ...itemDialog.item, description: e.target.value } })}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <FormControl fullWidth>
                                <InputLabel>Categoría</InputLabel>
                                <Select
                                    value={itemDialog.item?.category || ''}
                                    label="Categoría"
                                    onChange={(e) => setItemDialog({ ...itemDialog, item: { ...itemDialog.item, category: e.target.value } })}
                                >
                                    {CATEGORIES.map(cat => (
                                        <MenuItem key={cat.value} value={cat.value}>{cat.label}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <TextField
                                fullWidth
                                label="Unidad"
                                value={itemDialog.item?.unit || 'pza'}
                                onChange={(e) => setItemDialog({ ...itemDialog, item: { ...itemDialog.item, unit: e.target.value } })}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <TextField
                                fullWidth
                                label="Ubicación"
                                value={itemDialog.item?.location || ''}
                                onChange={(e) => setItemDialog({ ...itemDialog, item: { ...itemDialog.item, location: e.target.value } })}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 3 }}>
                            <TextField
                                fullWidth
                                type="number"
                                label="Stock Mínimo"
                                value={itemDialog.item?.min_stock || 0}
                                onChange={(e) => setItemDialog({ ...itemDialog, item: { ...itemDialog.item, min_stock: parseInt(e.target.value) } })}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 3 }}>
                            <TextField
                                fullWidth
                                type="number"
                                label="Stock Máximo"
                                value={itemDialog.item?.max_stock || 999}
                                onChange={(e) => setItemDialog({ ...itemDialog, item: { ...itemDialog.item, max_stock: parseInt(e.target.value) } })}
                            />
                        </Grid>
                        {itemDialog.mode === 'create' && (
                            <Grid size={{ xs: 12, md: 3 }}>
                                <TextField
                                    fullWidth
                                    type="number"
                                    label="Stock Inicial"
                                    value={(itemDialog.item as any)?.initial_stock || 0}
                                    onChange={(e) => setItemDialog({ ...itemDialog, item: { ...itemDialog.item, initial_stock: parseInt(e.target.value) } as any })}
                                />
                            </Grid>
                        )}
                        <Grid size={{ xs: 12, md: 3 }}>
                            <TextField
                                fullWidth
                                type="number"
                                label="Costo Unitario"
                                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                value={itemDialog.item?.cost_price || 0}
                                onChange={(e) => setItemDialog({ ...itemDialog, item: { ...itemDialog.item, cost_price: parseFloat(e.target.value) } })}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 3 }}>
                            <TextField
                                fullWidth
                                type="number"
                                label="Precio Venta"
                                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                value={itemDialog.item?.sale_price || 0}
                                onChange={(e) => setItemDialog({ ...itemDialog, item: { ...itemDialog.item, sale_price: parseFloat(e.target.value) } })}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <TextField
                                fullWidth
                                label="Código de Barras"
                                value={itemDialog.item?.barcode || ''}
                                onChange={(e) => setItemDialog({ ...itemDialog, item: { ...itemDialog.item, barcode: e.target.value } })}
                                InputProps={{ startAdornment: <InputAdornment position="start"><BarcodeIcon /></InputAdornment> }}
                            />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                fullWidth
                                multiline
                                rows={2}
                                label="Notas"
                                value={itemDialog.item?.notes || ''}
                                onChange={(e) => setItemDialog({ ...itemDialog, item: { ...itemDialog.item, notes: e.target.value } })}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setItemDialog({ open: false, item: null, mode: 'create' })}>
                        {t('common.cancel', 'Cancelar')}
                    </Button>
                    <Button variant="contained" onClick={handleSaveItem} sx={{ bgcolor: serviceColor }}>
                        {itemDialog.mode === 'create' ? t('common.create', 'Crear') : t('common.save', 'Guardar')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog: Registrar Movimiento */}
            <Dialog open={movementDialog.open} onClose={() => setMovementDialog({ open: false, item: null })} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <SwapIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                    {t('inventory.dialog.movementTitle', 'Registrar Movimiento')}
                </DialogTitle>
                <DialogContent>
                    {movementDialog.item && (
                        <Box sx={{ mt: 2 }}>
                            <Alert severity="info" sx={{ mb: 2 }}>
                                <Typography fontWeight="bold">{movementDialog.item.sku}</Typography>
                                <Typography variant="body2">{movementDialog.item.name}</Typography>
                                <Typography variant="body2">
                                    Stock actual: <strong>{movementDialog.item.current_stock} {movementDialog.item.unit}</strong>
                                    {movementDialog.item.reserved_stock > 0 && (
                                        <span> ({movementDialog.item.reserved_stock} reservado)</span>
                                    )}
                                </Typography>
                            </Alert>

                            <Grid container spacing={2}>
                                <Grid size={{ xs: 12 }}>
                                    <FormControl fullWidth>
                                        <InputLabel>Tipo de Movimiento</InputLabel>
                                        <Select
                                            value={movementForm.movement_type}
                                            label="Tipo de Movimiento"
                                            onChange={(e) => setMovementForm({ ...movementForm, movement_type: e.target.value })}
                                        >
                                            {MOVEMENT_TYPES.map(type => (
                                                <MenuItem key={type.value} value={type.value}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        {type.icon}
                                                        {type.label}
                                                    </Box>
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid size={{ xs: 12 }}>
                                    <TextField
                                        fullWidth
                                        type="number"
                                        label={movementForm.movement_type === 'adjustment' ? 'Nuevo Stock' : 'Cantidad'}
                                        value={movementForm.quantity}
                                        onChange={(e) => setMovementForm({ ...movementForm, quantity: parseInt(e.target.value) || 0 })}
                                        inputProps={{ min: 1 }}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12 }}>
                                    <TextField
                                        fullWidth
                                        multiline
                                        rows={2}
                                        label="Notas"
                                        value={movementForm.notes}
                                        onChange={(e) => setMovementForm({ ...movementForm, notes: e.target.value })}
                                        placeholder="Ej: Compra proveedor X, Pedido #1234..."
                                    />
                                </Grid>
                            </Grid>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setMovementDialog({ open: false, item: null })}>
                        {t('common.cancel', 'Cancelar')}
                    </Button>
                    <Button variant="contained" onClick={handleRegisterMovement} sx={{ bgcolor: serviceColor }}>
                        {t('inventory.dialog.registerMovement', 'Registrar')}
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
