import { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    Tabs,
    Tab,
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
    Card,
    CardContent,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Tooltip,
    Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import ListAltIcon from '@mui/icons-material/ListAlt';
import CategoryIcon from '@mui/icons-material/Category';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import ScaleIcon from '@mui/icons-material/Scale';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import StarIcon from '@mui/icons-material/Star';

const API_URL = 'http://localhost:3001/api';

interface LogisticsService {
    id: number;
    code: string;
    name: string;
    calculation_type: string;
    requires_dimensions: boolean;
    is_active: boolean;
}

interface PriceList {
    id: number;
    name: string;
    description: string;
    is_default: boolean;
    is_active: boolean;
    rules_count: number;
    clients_count: number;
}

interface PricingRule {
    id: number;
    price_list_id: number;
    service_id: number;
    service_code: string;
    service_name: string;
    calculation_type: string;
    min_unit: number;
    max_unit: number;
    unit_cost: number;
    fixed_fee: number;
    currency: string;
    item_type: string | null;
}

export default function PricingPage() {
    const [tabIndex, setTabIndex] = useState(0);
    const [services, setServices] = useState<LogisticsService[]>([]);
    const [priceLists, setPriceLists] = useState<PriceList[]>([]);
    const [selectedPriceList, setSelectedPriceList] = useState<number | null>(null);
    const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
    const [, setLoading] = useState(true);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

    // Dialogs
    const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
    const [priceListDialogOpen, setPriceListDialogOpen] = useState(false);
    const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<PricingRule | null>(null);

    // Form states
    const [newService, setNewService] = useState({ code: '', name: '', calculation_type: 'per_unit', requires_dimensions: false });
    const [newPriceList, setNewPriceList] = useState({ name: '', description: '', is_default: false });
    const [newRule, setNewRule] = useState({ service_id: 0, min_unit: 0, max_unit: 999999, unit_cost: 0, fixed_fee: 0 });

    const getAuthHeaders = () => {
        const token = localStorage.getItem('token');
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    };

    // Fetch data
    const fetchServices = async () => {
        try {
            const res = await fetch(`${API_URL}/logistics/services`);
            if (res.ok) setServices(await res.json());
        } catch (error) {
            console.error('Error fetching services:', error);
        }
    };

    const fetchPriceLists = async () => {
        try {
            const res = await fetch(`${API_URL}/admin/price-lists`, { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setPriceLists(data);
                if (data.length > 0 && !selectedPriceList) {
                    setSelectedPriceList(data.find((p: PriceList) => p.is_default)?.id || data[0].id);
                }
            }
        } catch (error) {
            console.error('Error fetching price lists:', error);
        }
    };

    const fetchPricingRules = async (priceListId: number) => {
        try {
            const res = await fetch(`${API_URL}/admin/pricing-rules/${priceListId}`, { headers: getAuthHeaders() });
            if (res.ok) setPricingRules(await res.json());
        } catch (error) {
            console.error('Error fetching pricing rules:', error);
        }
    };

    useEffect(() => {
        Promise.all([fetchServices(), fetchPriceLists()]).then(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (selectedPriceList) {
            fetchPricingRules(selectedPriceList);
        }
    }, [selectedPriceList]);

    // Handlers
    const handleCreateService = async () => {
        try {
            const res = await fetch(`${API_URL}/admin/logistics-services`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(newService)
            });
            if (res.ok) {
                setSnackbar({ open: true, message: 'Servicio creado', severity: 'success' });
                setServiceDialogOpen(false);
                setNewService({ code: '', name: '', calculation_type: 'per_unit', requires_dimensions: false });
                fetchServices();
            } else {
                const err = await res.json();
                setSnackbar({ open: true, message: err.error, severity: 'error' });
            }
        } catch (error) {
            setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
        }
    };

    const handleCreatePriceList = async () => {
        try {
            const res = await fetch(`${API_URL}/admin/price-lists`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(newPriceList)
            });
            if (res.ok) {
                setSnackbar({ open: true, message: 'Lista creada', severity: 'success' });
                setPriceListDialogOpen(false);
                setNewPriceList({ name: '', description: '', is_default: false });
                fetchPriceLists();
            } else {
                const err = await res.json();
                setSnackbar({ open: true, message: err.error, severity: 'error' });
            }
        } catch (error) {
            setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
        }
    };

    const handleDeletePriceList = async (id: number) => {
        if (!confirm('¿Eliminar esta lista de precios?')) return;
        try {
            const res = await fetch(`${API_URL}/admin/price-lists/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                setSnackbar({ open: true, message: 'Lista eliminada', severity: 'success' });
                fetchPriceLists();
            } else {
                const err = await res.json();
                setSnackbar({ open: true, message: err.error, severity: 'error' });
            }
        } catch (error) {
            setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
        }
    };

    const handleSaveRule = async () => {
        try {
            const url = editingRule 
                ? `${API_URL}/admin/pricing-rules/${editingRule.id}`
                : `${API_URL}/admin/pricing-rules`;
            
            const body = editingRule 
                ? { min_unit: newRule.min_unit, max_unit: newRule.max_unit, unit_cost: newRule.unit_cost, fixed_fee: newRule.fixed_fee }
                : { ...newRule, price_list_id: selectedPriceList };

            const res = await fetch(url, {
                method: editingRule ? 'PUT' : 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(body)
            });

            if (res.ok) {
                setSnackbar({ open: true, message: editingRule ? 'Regla actualizada' : 'Regla creada', severity: 'success' });
                setRuleDialogOpen(false);
                setEditingRule(null);
                setNewRule({ service_id: 0, min_unit: 0, max_unit: 999999, unit_cost: 0, fixed_fee: 0 });
                if (selectedPriceList) fetchPricingRules(selectedPriceList);
            } else {
                const err = await res.json();
                setSnackbar({ open: true, message: err.error, severity: 'error' });
            }
        } catch (error) {
            setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
        }
    };

    const handleDeleteRule = async (id: number) => {
        if (!confirm('¿Eliminar esta regla de precio?')) return;
        try {
            await fetch(`${API_URL}/admin/pricing-rules/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            setSnackbar({ open: true, message: 'Regla eliminada', severity: 'success' });
            if (selectedPriceList) fetchPricingRules(selectedPriceList);
        } catch (error) {
            setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
        }
    };

    const openEditRule = (rule: PricingRule) => {
        setEditingRule(rule);
        setNewRule({
            service_id: rule.service_id,
            min_unit: rule.min_unit,
            max_unit: rule.max_unit,
            unit_cost: rule.unit_cost,
            fixed_fee: rule.fixed_fee
        });
        setRuleDialogOpen(true);
    };

    const getCalculationTypeLabel = (type: string) => {
        switch (type) {
            case 'weight_vol': return { label: 'Peso/Vol', color: 'primary' as const, icon: <ScaleIcon fontSize="small" /> };
            case 'cbm': return { label: 'CBM (m³)', color: 'info' as const, icon: <Inventory2Icon fontSize="small" /> };
            case 'per_unit': return { label: 'Por Bulto', color: 'success' as const, icon: <LocalShippingIcon fontSize="small" /> };
            case 'per_pallet': return { label: 'Por Tarima', color: 'warning' as const, icon: <Inventory2Icon fontSize="small" /> };
            default: return { label: type, color: 'default' as const, icon: null };
        }
    };

    const getUnitLabel = (type: string) => {
        switch (type) {
            case 'weight_vol': return 'kg';
            case 'cbm': return 'm³';
            case 'per_unit': return 'bultos';
            case 'per_pallet': return 'tarimas';
            default: return 'unidades';
        }
    };

    // Group rules by service
    const groupedRules = pricingRules.reduce((acc, rule) => {
        if (!acc[rule.service_id]) {
            acc[rule.service_id] = { service: { id: rule.service_id, code: rule.service_code, name: rule.service_name, type: rule.calculation_type }, rules: [] };
        }
        acc[rule.service_id].rules.push(rule);
        return acc;
    }, {} as { [key: number]: { service: { id: number; code: string; name: string; type: string }; rules: PricingRule[] } });

    return (
        <Box>
            {/* Header */}
            <Box sx={{ mb: 3 }}>
                <Typography variant="h5" fontWeight={700}>
                    💰 Motor de Precios
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Configura servicios logísticos, listas de precios y tarifas escalonadas
                </Typography>
            </Box>

            <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} sx={{ mb: 3 }}>
                <Tab icon={<CategoryIcon />} label="Servicios" iconPosition="start" />
                <Tab icon={<ListAltIcon />} label="Listas de Precios" iconPosition="start" />
                <Tab icon={<AttachMoneyIcon />} label="Configurar Tarifas" iconPosition="start" />
            </Tabs>

            {/* TAB 0: Servicios Logísticos */}
            {tabIndex === 0 && (
                <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3 }}>
                    <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                            <Typography variant="h6">Catálogo de Servicios</Typography>
                            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setServiceDialogOpen(true)}>
                                Nuevo Servicio
                            </Button>
                        </Box>
                        <Alert severity="info" sx={{ mb: 2 }}>
                            El <strong>Tipo de Cálculo</strong> define qué datos se solicitan al cliente: 
                            <strong> Peso/Vol</strong> pide dimensiones, <strong>Por Bulto</strong> solo cantidad.
                        </Alert>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                                        <TableCell>Código</TableCell>
                                        <TableCell>Nombre</TableCell>
                                        <TableCell>Tipo de Cálculo</TableCell>
                                        <TableCell align="center">Estado</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {services.map(s => {
                                        const calc = getCalculationTypeLabel(s.calculation_type);
                                        return (
                                            <TableRow key={s.id} hover>
                                                <TableCell>
                                                    <Chip label={s.code} size="small" variant="outlined" sx={{ fontFamily: 'monospace' }} />
                                                </TableCell>
                                                <TableCell><Typography fontWeight={500}>{s.name}</Typography></TableCell>
                                                <TableCell>
                                                    <Chip icon={calc.icon || undefined} label={calc.label} size="small" color={calc.color} />
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Chip label={s.is_active ? 'Activo' : 'Inactivo'} size="small" color={s.is_active ? 'success' : 'default'} />
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </CardContent>
                </Card>
            )}

            {/* TAB 1: Listas de Precios */}
            {tabIndex === 1 && (
                <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3 }}>
                    <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                            <Typography variant="h6">Listas de Precios</Typography>
                            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setPriceListDialogOpen(true)}>
                                Nueva Lista
                            </Button>
                        </Box>
                        <Alert severity="info" sx={{ mb: 2 }}>
                            Crea listas diferenciadas para distintos tipos de clientes (Público, VIP, Distribuidores).
                            Asigna una lista a cada cliente desde su perfil.
                        </Alert>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
                            {priceLists.map(pl => (
                                <Card variant="outlined" sx={{ position: 'relative' }} key={pl.id}>
                                    {pl.is_default && (
                                        <Chip 
                                            icon={<StarIcon />} 
                                            label="Default" 
                                            size="small" 
                                            color="warning" 
                                            sx={{ position: 'absolute', top: 8, right: 8 }}
                                        />
                                    )}
                                    <CardContent>
                                        <Typography variant="h6" fontWeight={600}>{pl.name}</Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                            {pl.description || 'Sin descripción'}
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                                            <Chip label={`${pl.rules_count} reglas`} size="small" />
                                            <Chip label={`${pl.clients_count} clientes`} size="small" color="primary" />
                                        </Box>
                                        {!pl.is_default && (
                                            <Button 
                                                size="small" 
                                                color="error" 
                                                startIcon={<DeleteIcon />}
                                                onClick={() => handleDeletePriceList(pl.id)}
                                            >
                                                Eliminar
                                            </Button>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </Box>
                    </CardContent>
                </Card>
            )}

            {/* TAB 2: Configurar Tarifas */}
            {tabIndex === 2 && (
                <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3 }}>
                    <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                            <FormControl sx={{ minWidth: 250 }}>
                                <InputLabel>Lista de Precios</InputLabel>
                                <Select
                                    value={selectedPriceList || ''}
                                    onChange={(e) => setSelectedPriceList(e.target.value as number)}
                                    label="Lista de Precios"
                                >
                                    {priceLists.map(pl => (
                                        <MenuItem key={pl.id} value={pl.id}>
                                            {pl.name} {pl.is_default && '⭐'}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <Button 
                                variant="contained" 
                                startIcon={<AddIcon />}
                                onClick={() => {
                                    setEditingRule(null);
                                    setNewRule({ service_id: services[0]?.id || 0, min_unit: 0, max_unit: 999999, unit_cost: 0, fixed_fee: 0 });
                                    setRuleDialogOpen(true);
                                }}
                                disabled={!selectedPriceList}
                            >
                                Nueva Regla
                            </Button>
                        </Box>

                        {Object.values(groupedRules).length === 0 ? (
                            <Alert severity="warning">No hay reglas configuradas para esta lista. Agrega reglas para cada servicio.</Alert>
                        ) : (
                            Object.values(groupedRules).map(({ service, rules }) => {
                                const calc = getCalculationTypeLabel(service.type);
                                const unit = getUnitLabel(service.type);
                                return (
                                    <Box key={service.id} sx={{ mb: 3 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                            <Typography variant="subtitle1" fontWeight={600}>{service.name}</Typography>
                                            <Chip icon={calc.icon || undefined} label={calc.label} size="small" color={calc.color} />
                                        </Box>
                                        <TableContainer component={Paper} variant="outlined">
                                            <Table size="small">
                                                <TableHead>
                                                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                                                        <TableCell>Rango ({unit})</TableCell>
                                                        <TableCell align="right">Costo Unitario</TableCell>
                                                        <TableCell align="right">Tarifa Base</TableCell>
                                                        <TableCell align="center">Acciones</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {rules.map(rule => (
                                                        <TableRow key={rule.id} hover>
                                                            <TableCell>
                                                                {rule.min_unit} - {rule.max_unit >= 999999 ? '∞' : rule.max_unit}
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                <Typography fontWeight={600} color="success.main">
                                                                    ${rule.unit_cost} USD/{unit === 'kg' ? 'kg' : unit === 'm³' ? 'm³' : 'u'}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                ${rule.fixed_fee} USD
                                                            </TableCell>
                                                            <TableCell align="center">
                                                                <Tooltip title="Editar">
                                                                    <IconButton size="small" onClick={() => openEditRule(rule)}>
                                                                        <EditIcon fontSize="small" />
                                                                    </IconButton>
                                                                </Tooltip>
                                                                <Tooltip title="Eliminar">
                                                                    <IconButton size="small" color="error" onClick={() => handleDeleteRule(rule.id)}>
                                                                        <DeleteIcon fontSize="small" />
                                                                    </IconButton>
                                                                </Tooltip>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    </Box>
                                );
                            })
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Dialog: Nuevo Servicio */}
            <Dialog open={serviceDialogOpen} onClose={() => setServiceDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Nuevo Servicio Logístico</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        <TextField
                            label="Nombre del Servicio"
                            value={newService.name}
                            onChange={(e) => {
                                const name = e.target.value;
                                const code = name.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 20);
                                setNewService({ ...newService, name, code });
                            }}
                            fullWidth
                        />
                        <TextField
                            label="Código"
                            value={newService.code}
                            onChange={(e) => setNewService({ ...newService, code: e.target.value.toUpperCase() })}
                            fullWidth
                            helperText="Identificador único (ej: AIR_CHN_MX)"
                        />
                        <FormControl fullWidth>
                            <InputLabel>Tipo de Cálculo</InputLabel>
                            <Select
                                value={newService.calculation_type}
                                onChange={(e) => setNewService({ 
                                    ...newService, 
                                    calculation_type: e.target.value,
                                    requires_dimensions: e.target.value === 'weight_vol' || e.target.value === 'cbm'
                                })}
                                label="Tipo de Cálculo"
                            >
                                <MenuItem value="per_unit">Por Bulto (solo cantidad)</MenuItem>
                                <MenuItem value="weight_vol">Peso/Volumétrico (pide dimensiones)</MenuItem>
                                <MenuItem value="cbm">CBM - Metros Cúbicos (pide dimensiones)</MenuItem>
                                <MenuItem value="per_pallet">Por Tarima (solo cantidad)</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setServiceDialogOpen(false)}>Cancelar</Button>
                    <Button variant="contained" onClick={handleCreateService}>Crear</Button>
                </DialogActions>
            </Dialog>

            {/* Dialog: Nueva Lista de Precios */}
            <Dialog open={priceListDialogOpen} onClose={() => setPriceListDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Nueva Lista de Precios</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        <TextField
                            label="Nombre"
                            value={newPriceList.name}
                            onChange={(e) => setNewPriceList({ ...newPriceList, name: e.target.value })}
                            fullWidth
                            placeholder="Ej: Tarifa VIP Gold"
                        />
                        <TextField
                            label="Descripción"
                            value={newPriceList.description}
                            onChange={(e) => setNewPriceList({ ...newPriceList, description: e.target.value })}
                            fullWidth
                            multiline
                            rows={2}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPriceListDialogOpen(false)}>Cancelar</Button>
                    <Button variant="contained" onClick={handleCreatePriceList}>Crear</Button>
                </DialogActions>
            </Dialog>

            {/* Dialog: Nueva/Editar Regla */}
            <Dialog open={ruleDialogOpen} onClose={() => { setRuleDialogOpen(false); setEditingRule(null); }} maxWidth="sm" fullWidth>
                <DialogTitle>{editingRule ? 'Editar Regla' : 'Nueva Regla de Precio'}</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        {!editingRule && (
                            <FormControl fullWidth>
                                <InputLabel>Servicio</InputLabel>
                                <Select
                                    value={newRule.service_id}
                                    onChange={(e) => setNewRule({ ...newRule, service_id: e.target.value as number })}
                                    label="Servicio"
                                >
                                    {services.map(s => (
                                        <MenuItem key={s.id} value={s.id}>
                                            {s.name} ({getCalculationTypeLabel(s.calculation_type).label})
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                        <Divider>Rango</Divider>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                label="Desde"
                                type="number"
                                value={newRule.min_unit}
                                onChange={(e) => setNewRule({ ...newRule, min_unit: parseFloat(e.target.value) || 0 })}
                                fullWidth
                            />
                            <TextField
                                label="Hasta"
                                type="number"
                                value={newRule.max_unit}
                                onChange={(e) => setNewRule({ ...newRule, max_unit: parseFloat(e.target.value) || 999999 })}
                                fullWidth
                                helperText="999999 = Infinito"
                            />
                        </Box>
                        <Divider>Costos</Divider>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                label="Costo Unitario"
                                type="number"
                                value={newRule.unit_cost}
                                onChange={(e) => setNewRule({ ...newRule, unit_cost: parseFloat(e.target.value) || 0 })}
                                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                fullWidth
                            />
                            <TextField
                                label="Tarifa Base (Banderazo)"
                                type="number"
                                value={newRule.fixed_fee}
                                onChange={(e) => setNewRule({ ...newRule, fixed_fee: parseFloat(e.target.value) || 0 })}
                                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                fullWidth
                            />
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => { setRuleDialogOpen(false); setEditingRule(null); }}>Cancelar</Button>
                    <Button variant="contained" onClick={handleSaveRule} startIcon={<SaveIcon />}>
                        {editingRule ? 'Guardar' : 'Crear'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
            >
                <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
            </Snackbar>
        </Box>
    );
}
