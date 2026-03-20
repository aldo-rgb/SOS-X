// ============================================
// PANEL DE TARIFAS AÉREAS
// Tarifas por ruta: Logo (L), Genérico (G), Sensible (S), Flat (F)
// ============================================

import { useState, useEffect, useCallback } from 'react';
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
    TextField,
    Button,
    Alert,
    Snackbar,
    Chip,
    CircularProgress,
    Tooltip,
    InputAdornment,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Tabs,
    Tab,
    Divider,
    List,
    ListItem,
    ListItemText,
} from '@mui/material';
import {
    Flight as FlightIcon,
    FlightTakeoff as TakeoffIcon,
    FlightLand as LandIcon,
    Save as SaveIcon,
    AttachMoney as MoneyIcon,
    Sell as SellIcon,
    Refresh as RefreshIcon,
    BlockOutlined as BlockIcon,
    Settings as SettingsIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    LocalShipping as SupplierIcon,
    Person as PersonIcon,
    Search as SearchIcon,
    Edit as EditIcon,
} from '@mui/icons-material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const AIR_COLOR = '#E53935';

const TARIFF_TYPES = [
    { key: 'L', label: 'Logo', color: '#1565C0', bgColor: '#E3F2FD', description: 'Mercancía con logo/marca' },
    { key: 'G', label: 'Genérico', color: '#2E7D32', bgColor: '#E8F5E9', description: 'Mercancía genérica' },
    { key: 'S', label: 'Sensible', color: '#E65100', bgColor: '#FFF3E0', description: 'Mercancía sensible' },
    { key: 'F', label: 'Flat', color: '#6A1B9A', bgColor: '#F3E5F5', description: 'Tarifa plana' },
];

// Márgenes automáticos sobre Costo Ruta (null = manual)
const TARIFF_MARKUPS: Record<string, number | null> = {
    L: 9,   // Logo = Costo Ruta + $9
    G: 8,   // Genérico = Costo Ruta + $8
    S: null, // Sensible = manual
    F: 7,   // Flat = Costo Ruta + $7
};

// Brackets default (kg)
const DEFAULT_BRACKETS_KG = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000];

interface CostBracket {
    min_kg: string;
    cost_per_kg: string;
}

interface RouteTariff {
    id: number;
    code: string;
    name: string;
    origin_airport: string;
    origin_city: string;
    destination_airport: string;
    destination_city: string;
    cost_per_kg_usd: number | null;
    is_active: boolean;
    tariffs: {
        L: { id: number | null; price_per_kg: number; is_active: boolean };
        G: { id: number | null; price_per_kg: number; is_active: boolean };
        S: { id: number | null; price_per_kg: number; is_active: boolean };
        F: { id: number | null; price_per_kg: number; is_active: boolean };
    };
}

interface EditableRow {
    routeId: number;
    costPerKg: string;
    L: string;
    G: string;
    S: string;
    F: string;
    dirty: boolean;
}

interface ClientOption {
    source: 'user' | 'legacy';
    id: number;
    name: string;
    box_id: string;
    email: string;
}

interface ClientTariff {
    id: number;
    route_id: number;
    tariff_type: string;
    price_per_kg: number;
    is_active: boolean;
    notes: string | null;
    route_code: string;
    route_name: string;
    origin_airport: string;
    destination_airport: string;
    default_price: number;
}

interface ClientWithTariffs {
    user_id: number;
    legacy_client_id: number;
    name: string;
    box_id: string;
    email: string;
    source: 'user' | 'legacy';
    tariffs_count: number;
    routes: string;
}

export default function AirPricingPage() {
    const [routes, setRoutes] = useState<RouteTariff[]>([]);
    const [editableRows, setEditableRows] = useState<Record<number, EditableRow>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<number | null>(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

    // Cost brackets dialog state
    const [costDialogOpen, setCostDialogOpen] = useState(false);
    const [costDialogRoute, setCostDialogRoute] = useState<RouteTariff | null>(null);
    const [costTab, setCostTab] = useState(0); // 0=G (Amazon), 1=L (Marca), 2=S, 3=F
    const [costBrackets, setCostBrackets] = useState<Record<string, CostBracket[]>>({ L: [], G: [], S: [], F: [] });
    const [costLoading, setCostLoading] = useState(false);
    const [costSaving, setCostSaving] = useState(false);

    // Client tariffs dialog state
    const [clientDialogOpen, setClientDialogOpen] = useState(false);
    const [clientSearch, setClientSearch] = useState('');
    const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
    const [clientSearching, setClientSearching] = useState(false);
    const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
    const [clientTariffs, setClientTariffs] = useState<ClientTariff[]>([]);
    const [clientTariffsLoading, setClientTariffsLoading] = useState(false);
    const [clientTariffsSaving, setClientTariffsSaving] = useState(false);
    const [clientsWithTariffs, setClientsWithTariffs] = useState<ClientWithTariffs[]>([]);
    const [editingClientTariffs, setEditingClientTariffs] = useState<Record<string, string>>({});
    const [clientTab, setClientTab] = useState(0); // 0 = buscar, 1 = ver clientes con tarifas

    const token = localStorage.getItem('token');

    // ========== LOAD DATA ==========
    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_URL}/api/admin/air-tariffs`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) {
                setRoutes(data.routes || []);
                // Initialize editable rows
                const rows: Record<number, EditableRow> = {};
                for (const r of data.routes || []) {
                    rows[r.id] = {
                        routeId: r.id,
                        costPerKg: r.cost_per_kg_usd?.toString() || '',
                        L: r.tariffs.L.price_per_kg?.toString() || '0',
                        G: r.tariffs.G.price_per_kg?.toString() || '0',
                        S: r.tariffs.S.price_per_kg?.toString() || '0',
                        F: r.tariffs.F.price_per_kg?.toString() || '0',
                        dirty: false,
                    };
                }
                setEditableRows(rows);
            }
        } catch (error) {
            console.error('Error cargando tarifas:', error);
            setSnackbar({ open: true, message: 'Error cargando tarifas', severity: 'error' });
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // ========== UPDATE FIELD ==========
    const handleFieldChange = (routeId: number, field: string, value: string) => {
        setEditableRows((prev) => {
            const current = prev[routeId];
            if (!current) return prev;

            const updated = { ...current, [field]: value, dirty: true };

            // Si cambió el Costo Ruta, auto-calcular tarifas con markup
            if (field === 'costPerKg') {
                const cost = parseFloat(value);
                if (!isNaN(cost) && cost > 0) {
                    for (const [type, markup] of Object.entries(TARIFF_MARKUPS)) {
                        if (markup !== null) {
                            updated[type as keyof EditableRow] = (cost + markup).toFixed(2).replace(/\.00$/, '') as never;
                        }
                    }
                }
            }

            return { ...prev, [routeId]: updated };
        });
    };

    // ========== SAVE ROUTE TARIFFS ==========
    const handleSaveRoute = async (routeId: number) => {
        const row = editableRows[routeId];
        if (!row) return;

        setSaving(routeId);
        try {
            const res = await fetch(`${API_URL}/api/admin/air-tariffs`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    route_id: routeId,
                    cost_per_kg_usd: row.costPerKg ? parseFloat(row.costPerKg) : null,
                    tariffs: {
                        L: parseFloat(row.L) || 0,
                        G: parseFloat(row.G) || 0,
                        S: parseFloat(row.S) || 0,
                        F: parseFloat(row.F) || 0,
                    },
                }),
            });

            const data = await res.json();
            if (data.success) {
                setSnackbar({ open: true, message: `Tarifas guardadas para ruta ${routes.find(r => r.id === routeId)?.code}`, severity: 'success' });
                setEditableRows((prev) => ({
                    ...prev,
                    [routeId]: { ...prev[routeId], dirty: false },
                }));
                loadData();
            } else {
                throw new Error(data.error);
            }
        } catch (error: unknown) {
            setSnackbar({ open: true, message: error instanceof Error ? error.message : 'Error guardando', severity: 'error' });
        } finally {
            setSaving(null);
        }
    };

    // ========== SAVE ALL DIRTY ==========
    const handleSaveAll = async () => {
        const dirtyIds = Object.keys(editableRows)
            .map(Number)
            .filter((id) => editableRows[id].dirty);

        if (dirtyIds.length === 0) {
            setSnackbar({ open: true, message: 'No hay cambios pendientes', severity: 'error' });
            return;
        }

        for (const id of dirtyIds) {
            await handleSaveRoute(id);
        }
    };

    const dirtyCount = Object.values(editableRows).filter((r) => r.dirty).length;

    // ========== COST BRACKETS DIALOG ==========
    const openCostDialog = async (route: RouteTariff) => {
        setCostDialogRoute(route);
        setCostDialogOpen(true);
        setCostTab(0); // Start on Amazon (G)
        setCostLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/admin/air-cost-brackets/${route.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) {
                const loaded: Record<string, CostBracket[]> = { L: [], G: [], S: [], F: [] };
                for (const type of ['L', 'G', 'S', 'F']) {
                    if (data.brackets[type] && data.brackets[type].length > 0) {
                        loaded[type] = data.brackets[type].map((b: { min_kg: number; cost_per_kg: number }) => ({
                            min_kg: b.min_kg.toString(),
                            cost_per_kg: b.cost_per_kg.toString(),
                        }));
                    } else {
                        // Initialize with default brackets
                        loaded[type] = DEFAULT_BRACKETS_KG.map((kg) => ({
                            min_kg: kg.toString(),
                            cost_per_kg: '',
                        }));
                    }
                }
                setCostBrackets(loaded);
            }
        } catch (error) {
            console.error('Error cargando brackets de costo:', error);
            // Initialize empty
            const empty: Record<string, CostBracket[]> = {};
            for (const type of ['L', 'G', 'S', 'F']) {
                empty[type] = DEFAULT_BRACKETS_KG.map((kg) => ({
                    min_kg: kg.toString(),
                    cost_per_kg: '',
                }));
            }
            setCostBrackets(empty);
        } finally {
            setCostLoading(false);
        }
    };

    const handleCostBracketChange = (type: string, index: number, field: 'min_kg' | 'cost_per_kg', value: string) => {
        setCostBrackets((prev) => {
            const updated = { ...prev };
            updated[type] = [...(prev[type] || [])];
            updated[type][index] = { ...updated[type][index], [field]: value };
            return updated;
        });
    };

    const addCostBracket = (type: string) => {
        setCostBrackets((prev) => {
            const updated = { ...prev };
            const existing = prev[type] || [];
            const lastKg = existing.length > 0 ? parseFloat(existing[existing.length - 1].min_kg) || 0 : 0;
            updated[type] = [...existing, { min_kg: (lastKg + 500).toString(), cost_per_kg: '' }];
            return updated;
        });
    };

    const removeCostBracket = (type: string, index: number) => {
        setCostBrackets((prev) => {
            const updated = { ...prev };
            updated[type] = prev[type].filter((_, i) => i !== index);
            return updated;
        });
    };

    const saveCostBrackets = async () => {
        if (!costDialogRoute) return;
        setCostSaving(true);
        try {
            // Convert to number arrays, filter valid entries
            const payload: Record<string, { min_kg: number; cost_per_kg: number }[]> = {};
            for (const type of ['L', 'G', 'S', 'F']) {
                payload[type] = (costBrackets[type] || [])
                    .filter((b) => b.min_kg && b.cost_per_kg && parseFloat(b.min_kg) > 0 && parseFloat(b.cost_per_kg) > 0)
                    .map((b) => ({
                        min_kg: parseFloat(b.min_kg),
                        cost_per_kg: parseFloat(b.cost_per_kg),
                    }));
            }

            const res = await fetch(`${API_URL}/api/admin/air-cost-brackets/${costDialogRoute.id}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ brackets: payload }),
            });
            const data = await res.json();
            if (data.success) {
                setSnackbar({ open: true, message: `Costos proveedor guardados (${data.count} brackets)`, severity: 'success' });
                setCostDialogOpen(false);
            } else {
                throw new Error(data.error);
            }
        } catch (error: unknown) {
            setSnackbar({ open: true, message: error instanceof Error ? error.message : 'Error guardando costos', severity: 'error' });
        } finally {
            setCostSaving(false);
        }
    };

    const COST_TABS = [
        { key: 'G', label: 'Amazon (Genérico)', color: '#2E7D32' },
        { key: 'L', label: 'Marca (Logo)', color: '#1565C0' },
    ];

    // ========== CLIENT TARIFFS FUNCTIONS ==========
    const searchClients = async (term: string) => {
        if (term.length < 2) {
            setClientOptions([]);
            return;
        }
        setClientSearching(true);
        try {
            const res = await fetch(`${API_URL}/api/admin/air-client-tariffs/search-clients?search=${encodeURIComponent(term)}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) {
                setClientOptions(data.clients || []);
            }
        } catch (error) {
            console.error('Error buscando clientes:', error);
        } finally {
            setClientSearching(false);
        }
    };

    const loadClientsWithTariffs = async () => {
        try {
            const res = await fetch(`${API_URL}/api/admin/air-client-tariffs/clients`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) {
                setClientsWithTariffs(data.clients || []);
            }
        } catch (error) {
            console.error('Error cargando clientes:', error);
        }
    };

    const loadClientTariffs = async (client: ClientOption) => {
        setClientTariffsLoading(true);
        try {
            const param = client.source === 'user' ? `userId=${client.id}` : `legacyId=${client.id}`;
            const res = await fetch(`${API_URL}/api/admin/air-client-tariffs?${param}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) {
                setClientTariffs(data.tariffs || []);
                // Initialize editing values
                const editValues: Record<string, string> = {};
                for (const t of data.tariffs || []) {
                    editValues[`${t.route_id}_${t.tariff_type}`] = t.price_per_kg?.toString() || '';
                }
                // Also add default prices for routes not yet configured
                for (const route of routes) {
                    for (const type of ['L', 'G', 'S', 'F']) {
                        const key = `${route.id}_${type}`;
                        if (!editValues[key]) {
                            editValues[key] = '';
                        }
                    }
                }
                setEditingClientTariffs(editValues);
            }
        } catch (error) {
            console.error('Error cargando tarifas del cliente:', error);
        } finally {
            setClientTariffsLoading(false);
        }
    };

    const selectClient = (client: ClientOption | null) => {
        setSelectedClient(client);
        if (client) {
            loadClientTariffs(client);
        } else {
            setClientTariffs([]);
            setEditingClientTariffs({});
        }
    };

    const handleClientTariffChange = (routeId: number, tariffType: string, value: string) => {
        setEditingClientTariffs((prev) => ({
            ...prev,
            [`${routeId}_${tariffType}`]: value,
        }));
    };

    const saveClientTariffs = async () => {
        if (!selectedClient) return;
        setClientTariffsSaving(true);
        try {
            // Build array of tariffs to save
            const tariffsToSave: { route_id: number; tariff_type: string; price_per_kg: number }[] = [];
            for (const [key, value] of Object.entries(editingClientTariffs)) {
                const [routeId, tariffType] = key.split('_');
                const price = parseFloat(value);
                if (!isNaN(price) && price > 0) {
                    tariffsToSave.push({
                        route_id: parseInt(routeId),
                        tariff_type: tariffType,
                        price_per_kg: price,
                    });
                }
            }

            if (tariffsToSave.length === 0) {
                setSnackbar({ open: true, message: 'No hay tarifas para guardar', severity: 'error' });
                setClientTariffsSaving(false);
                return;
            }

            const payload: { user_id?: number; legacy_client_id?: number; tariffs: typeof tariffsToSave } = {
                tariffs: tariffsToSave,
            };
            if (selectedClient.source === 'user') {
                payload.user_id = selectedClient.id;
            } else {
                payload.legacy_client_id = selectedClient.id;
            }

            const res = await fetch(`${API_URL}/api/admin/air-client-tariffs/bulk`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) {
                setSnackbar({ open: true, message: `✅ ${data.count} tarifas guardadas para ${selectedClient.name}`, severity: 'success' });
                loadClientTariffs(selectedClient);
                loadClientsWithTariffs();
            } else {
                throw new Error(data.error);
            }
        } catch (error: unknown) {
            setSnackbar({ open: true, message: error instanceof Error ? error.message : 'Error guardando', severity: 'error' });
        } finally {
            setClientTariffsSaving(false);
        }
    };

    const deleteClientTariff = async (tariffId: number) => {
        if (!confirm('¿Eliminar esta tarifa personalizada?')) return;
        try {
            const res = await fetch(`${API_URL}/api/admin/air-client-tariffs/${tariffId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                setSnackbar({ open: true, message: 'Tarifa eliminada', severity: 'success' });
                if (selectedClient) loadClientTariffs(selectedClient);
                loadClientsWithTariffs();
            }
        } catch (error) {
            setSnackbar({ open: true, message: 'Error eliminando tarifa', severity: 'error' });
        }
    };

    const openClientDialog = () => {
        setClientDialogOpen(true);
        setClientTab(0);
        setSelectedClient(null);
        setClientTariffs([]);
        setEditingClientTariffs({});
        setClientSearch('');
        setClientOptions([]);
        loadClientsWithTariffs();
    };

    // ========== RENDER ==========
    return (
        <Box>
            {/* Header */}
            <Paper
                sx={{
                    background: `linear-gradient(135deg, ${AIR_COLOR} 0%, #FF7043 100%)`,
                    p: 3,
                    mb: 3,
                    borderRadius: 2,
                    color: 'white',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <SellIcon sx={{ fontSize: 40 }} />
                        <Box>
                            <Typography variant="h5" fontWeight="bold">
                                Tarifas Aéreas por Ruta
                            </Typography>
                            <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                Configura precios por KG para cada tipo de mercancía
                            </Typography>
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="Precios por Cliente">
                            <Button
                                variant="contained"
                                startIcon={<PersonIcon />}
                                onClick={openClientDialog}
                                sx={{
                                    bgcolor: 'white',
                                    color: '#7B1FA2',
                                    '&:hover': { bgcolor: '#F3E5F5' },
                                    textTransform: 'none',
                                    fontWeight: 600,
                                }}
                            >
                                Precios por Cliente
                            </Button>
                        </Tooltip>
                        <Tooltip title="Recargar">
                            <IconButton onClick={loadData} sx={{ color: 'white' }}>
                                <RefreshIcon />
                            </IconButton>
                        </Tooltip>
                        {dirtyCount > 0 && (
                            <Button
                                variant="contained"
                                startIcon={<SaveIcon />}
                                onClick={handleSaveAll}
                                sx={{
                                    bgcolor: 'white',
                                    color: AIR_COLOR,
                                    '&:hover': { bgcolor: '#FFEBEE' },
                                }}
                            >
                                Guardar Todo ({dirtyCount})
                            </Button>
                        )}
                    </Box>
                </Box>
            </Paper>

            {/* Leyenda tariff types */}
            <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
                {TARIFF_TYPES.map((t) => (
                    <Chip
                        key={t.key}
                        label={`${t.key} — ${t.label}`}
                        sx={{
                            bgcolor: t.bgColor,
                            color: t.color,
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            border: `1px solid ${t.color}30`,
                        }}
                    />
                ))}
            </Box>

            <Alert severity="info" sx={{ mb: 3 }}>
                <strong>Costo Ruta:</strong> precio base/costo de la ruta (USD). Al modificarlo se calculan automáticamente: <strong>Logo (L):</strong> Costo + $9 · <strong>Genérico (G):</strong> Costo + $8 · <strong>Flat (F):</strong> Costo + $7 · <strong>Sensible (S):</strong> se configura manualmente. Tarifas en USD. Costos proveedor (⚙️) en MXN.
            </Alert>

            {/* Tabla */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                    <CircularProgress sx={{ color: AIR_COLOR }} />
                </Box>
            ) : routes.length === 0 ? (
                <Alert severity="warning">
                    No hay rutas aéreas registradas. Crea rutas primero desde el módulo "Rutas Aéreas".
                </Alert>
            ) : (
                <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#263238' }}>
                                <TableCell sx={{ color: 'white', fontWeight: 700, minWidth: 120 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <FlightIcon sx={{ fontSize: 18 }} /> Ruta
                                    </Box>
                                </TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 700, minWidth: 150 }}>
                                    Origen → Destino
                                </TableCell>
                                <TableCell align="center" sx={{ color: 'white', fontWeight: 700, minWidth: 120, bgcolor: '#37474F' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                                        <MoneyIcon sx={{ fontSize: 16 }} /> Costo Ruta
                                    </Box>
                                </TableCell>
                                {TARIFF_TYPES.map((t) => {
                                    const markup = TARIFF_MARKUPS[t.key];
                                    return (
                                        <TableCell
                                            key={t.key}
                                            align="center"
                                            sx={{
                                                fontWeight: 700,
                                                minWidth: 110,
                                                bgcolor: t.color,
                                                color: 'white',
                                            }}
                                        >
                                            <Box>
                                                {t.key} — {t.label}
                                                {markup !== null && (
                                                    <Typography variant="caption" sx={{ display: 'block', opacity: 0.85, fontSize: '0.65rem' }}>
                                                        (Costo + ${markup})
                                                    </Typography>
                                                )}
                                                {markup === null && (
                                                    <Typography variant="caption" sx={{ display: 'block', opacity: 0.85, fontSize: '0.65rem' }}>
                                                        (manual)
                                                    </Typography>
                                                )}
                                            </Box>
                                        </TableCell>
                                    );
                                })}
                                <TableCell align="center" sx={{ color: 'white', fontWeight: 700, bgcolor: '#263238' }}>
                                    Acciones
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {routes.map((route) => {
                                const row = editableRows[route.id];
                                if (!row) return null;
                                return (
                                    <TableRow
                                        key={route.id}
                                        sx={{
                                            opacity: route.is_active ? 1 : 0.5,
                                            bgcolor: row.dirty ? '#FFF8E1' : 'inherit',
                                            '&:hover': { bgcolor: row.dirty ? '#FFF3C4' : '#F5F5F5' },
                                        }}
                                    >
                                        {/* Código Ruta */}
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <FlightIcon sx={{ color: AIR_COLOR, fontSize: 18 }} />
                                                <Typography fontWeight="bold" sx={{ fontFamily: 'monospace' }}>
                                                    {route.code}
                                                </Typography>
                                                <Tooltip title="Configurar costos proveedor">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => openCostDialog(route)}
                                                        sx={{
                                                            ml: 0.5,
                                                            bgcolor: '#FFF3E0',
                                                            '&:hover': { bgcolor: '#FFE0B2' },
                                                            width: 28,
                                                            height: 28,
                                                        }}
                                                    >
                                                        <SettingsIcon sx={{ fontSize: 16, color: '#E65100' }} />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        </TableCell>

                                        {/* Origen → Destino */}
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <TakeoffIcon sx={{ fontSize: 14, color: '#666' }} />
                                                <Typography variant="body2" fontWeight={600}>{route.origin_airport}</Typography>
                                                <Typography variant="body2">→</Typography>
                                                <LandIcon sx={{ fontSize: 14, color: '#666' }} />
                                                <Typography variant="body2" fontWeight={600}>{route.destination_airport}</Typography>
                                            </Box>
                                            {(route.origin_city || route.destination_city) && (
                                                <Typography variant="caption" color="text.secondary">
                                                    {route.origin_city} → {route.destination_city}
                                                </Typography>
                                            )}
                                        </TableCell>

                                        {/* Costo Ruta (price from air_routes) */}
                                        <TableCell align="center" sx={{ bgcolor: '#F5F5F5' }}>
                                            <TextField
                                                value={row.costPerKg}
                                                onChange={(e) => handleFieldChange(route.id, 'costPerKg', e.target.value)}
                                                type="number"
                                                size="small"
                                                sx={{
                                                    width: 100,
                                                    '& .MuiOutlinedInput-root': {
                                                        bgcolor: 'white',
                                                    },
                                                }}
                                                InputProps={{
                                                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                                }}
                                                inputProps={{ style: { textAlign: 'right', fontWeight: 'bold' }, step: '0.01' }}
                                            />
                                        </TableCell>

                                        {/* Tariff type columns */}
                                        {TARIFF_TYPES.map((t) => {
                                            const val = row[t.key as keyof EditableRow] as string;
                                            const isZero = !val || parseFloat(val) === 0;
                                            const markup = TARIFF_MARKUPS[t.key];
                                            const isAuto = markup !== null;
                                            return (
                                                <TableCell key={t.key} align="center" sx={{ bgcolor: isZero ? '#F5F5F5' : `${t.bgColor}80`, position: 'relative' }}>
                                                    <TextField
                                                        value={val}
                                                        onChange={(e) => handleFieldChange(route.id, t.key, e.target.value)}
                                                        type="number"
                                                        size="small"
                                                        disabled={isAuto}
                                                        sx={{
                                                            width: 100,
                                                            '& .MuiOutlinedInput-root': {
                                                                bgcolor: isZero ? '#FAFAFA' : (isAuto ? '#F5F5F5' : 'white'),
                                                                ...(isZero ? { opacity: 0.5 } : {}),
                                                            },
                                                            '& .Mui-disabled': {
                                                                WebkitTextFillColor: isZero ? undefined : t.color,
                                                                fontWeight: 700,
                                                            },
                                                        }}
                                                        InputProps={{
                                                            startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                                        }}
                                                        inputProps={{ style: { textAlign: 'right', fontWeight: 600 }, step: '0.01' }}
                                                    />
                                                    {isZero && (
                                                        <Chip
                                                            icon={<BlockIcon sx={{ fontSize: 12 }} />}
                                                            label="No disponible"
                                                            size="small"
                                                            sx={{
                                                                mt: 0.5,
                                                                height: 20,
                                                                fontSize: '0.65rem',
                                                                bgcolor: '#FFCDD2',
                                                                color: '#C62828',
                                                                '& .MuiChip-icon': { color: '#C62828' },
                                                            }}
                                                        />
                                                    )}
                                                    {isAuto && !isZero && (
                                                        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontSize: '0.6rem', mt: 0.3 }}>
                                                            auto +${markup}
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                            );
                                        })}

                                        {/* Actions */}
                                        <TableCell align="center">
                                            <Tooltip title={row.dirty ? 'Guardar cambios' : 'Sin cambios'}>
                                                <span>
                                                    <Button
                                                        size="small"
                                                        variant={row.dirty ? 'contained' : 'outlined'}
                                                        startIcon={saving === route.id ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                                                        onClick={() => handleSaveRoute(route.id)}
                                                        disabled={!row.dirty || saving !== null}
                                                        sx={{
                                                            textTransform: 'none',
                                                            minWidth: 90,
                                                            ...(row.dirty
                                                                ? { bgcolor: AIR_COLOR, '&:hover': { bgcolor: '#C62828' } }
                                                                : {}),
                                                        }}
                                                    >
                                                        {saving === route.id ? '...' : 'Guardar'}
                                                    </Button>
                                                </span>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* ========== COST BRACKETS DIALOG ========== */}
            <Dialog
                open={costDialogOpen}
                onClose={() => setCostDialogOpen(false)}
                maxWidth="md"
                fullWidth
                PaperProps={{ sx: { borderRadius: 3 } }}
            >
                <DialogTitle sx={{ bgcolor: '#263238', color: 'white', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <SupplierIcon />
                    <Box>
                        <Typography variant="h6" fontWeight="bold">
                            Costos Proveedor — {costDialogRoute?.code}
                        </Typography>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>
                            {costDialogRoute?.origin_airport} → {costDialogRoute?.destination_airport} · Lo que nos cobran por KG según peso total
                        </Typography>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ p: 0 }}>
                    {costLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                            <CircularProgress sx={{ color: AIR_COLOR }} />
                        </Box>
                    ) : (
                        <>
                            <Tabs
                                value={costTab}
                                onChange={(_, v) => setCostTab(v)}
                                variant="fullWidth"
                                sx={{
                                    borderBottom: 1,
                                    borderColor: 'divider',
                                    '& .MuiTab-root': { fontWeight: 700, textTransform: 'none' },
                                }}
                            >
                                {COST_TABS.map((ct, i) => (
                                    <Tab
                                        key={ct.key}
                                        label={ct.label}
                                        sx={{
                                            color: costTab === i ? ct.color : 'text.secondary',
                                            '&.Mui-selected': { color: ct.color },
                                        }}
                                    />
                                ))}
                            </Tabs>

                            {COST_TABS.map((ct, tabIndex) => (
                                <Box
                                    key={ct.key}
                                    role="tabpanel"
                                    hidden={costTab !== tabIndex}
                                    sx={{ p: 2 }}
                                >
                                    {costTab === tabIndex && (
                                        <>
                                            <Alert severity="info" sx={{ mb: 2 }}>
                                                <strong>{ct.label}:</strong> Configura el costo por KG que cobra el proveedor según el peso total del envío. A más kilos, menor costo.
                                            </Alert>

                                            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                                                <Table size="small">
                                                    <TableHead>
                                                        <TableRow sx={{ bgcolor: ct.color }}>
                                                            <TableCell sx={{ color: 'white', fontWeight: 700, width: '40%' }}>
                                                                Kilos (mínimo)
                                                            </TableCell>
                                                            <TableCell sx={{ color: 'white', fontWeight: 700, width: '40%' }}>
                                                                Costo por Kilo (MXN)
                                                            </TableCell>
                                                            <TableCell align="center" sx={{ color: 'white', fontWeight: 700, width: '20%' }}>
                                                                Acción
                                                            </TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {(costBrackets[ct.key] || []).map((bracket, idx) => (
                                                            <TableRow
                                                                key={idx}
                                                                sx={{ '&:hover': { bgcolor: '#F5F5F5' } }}
                                                            >
                                                                <TableCell>
                                                                    <TextField
                                                                        value={bracket.min_kg}
                                                                        onChange={(e) => handleCostBracketChange(ct.key, idx, 'min_kg', e.target.value)}
                                                                        type="number"
                                                                        size="small"
                                                                        fullWidth
                                                                        InputProps={{
                                                                            endAdornment: <InputAdornment position="end">kg</InputAdornment>,
                                                                        }}
                                                                        inputProps={{ style: { fontWeight: 600 }, step: '100' }}
                                                                    />
                                                                </TableCell>
                                                                <TableCell>
                                                                    <TextField
                                                                        value={bracket.cost_per_kg}
                                                                        onChange={(e) => handleCostBracketChange(ct.key, idx, 'cost_per_kg', e.target.value)}
                                                                        type="number"
                                                                        size="small"
                                                                        fullWidth
                                                                        InputProps={{
                                                                            startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                                                        }}
                                                                        inputProps={{ style: { fontWeight: 600 }, step: '0.01' }}
                                                                        placeholder="0.00"
                                                                    />
                                                                </TableCell>
                                                                <TableCell align="center">
                                                                    <IconButton
                                                                        size="small"
                                                                        onClick={() => removeCostBracket(ct.key, idx)}
                                                                        sx={{ color: '#C62828' }}
                                                                    >
                                                                        <DeleteIcon fontSize="small" />
                                                                    </IconButton>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                        {(costBrackets[ct.key] || []).length === 0 && (
                                                            <TableRow>
                                                                <TableCell colSpan={3} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                                                                    No hay brackets configurados. Agrega uno con el botón de abajo.
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </TableContainer>

                                            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1.5 }}>
                                                <Button
                                                    size="small"
                                                    startIcon={<AddIcon />}
                                                    onClick={() => addCostBracket(ct.key)}
                                                    sx={{ textTransform: 'none', color: ct.color }}
                                                >
                                                    Agregar bracket
                                                </Button>
                                            </Box>
                                        </>
                                    )}
                                </Box>
                            ))}
                        </>
                    )}
                </DialogContent>
                <Divider />
                <DialogActions sx={{ p: 2, gap: 1 }}>
                    <Button
                        onClick={() => setCostDialogOpen(false)}
                        sx={{ textTransform: 'none' }}
                    >
                        Cancelar
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={costSaving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                        onClick={saveCostBrackets}
                        disabled={costSaving}
                        sx={{
                            textTransform: 'none',
                            bgcolor: AIR_COLOR,
                            '&:hover': { bgcolor: '#C62828' },
                        }}
                    >
                        {costSaving ? 'Guardando...' : 'Guardar Costos'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ========== DIALOG: PRECIOS POR CLIENTE ========== */}
            <Dialog
                open={clientDialogOpen}
                onClose={() => setClientDialogOpen(false)}
                maxWidth="lg"
                fullWidth
            >
                <DialogTitle sx={{ bgcolor: '#7B1FA2', color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PersonIcon />
                    <Box sx={{ flex: 1 }}>
                        Tarifas Personalizadas por Cliente
                        <Typography variant="body2" sx={{ opacity: 0.9, fontWeight: 400 }}>
                            Configura precios especiales para clientes específicos
                        </Typography>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ p: 0 }}>
                    <Tabs
                        value={clientTab}
                        onChange={(_, v) => setClientTab(v)}
                        sx={{ borderBottom: 1, borderColor: 'divider', px: 2, bgcolor: '#F5F5F5' }}
                    >
                        <Tab label="🔍 Buscar Cliente" sx={{ textTransform: 'none', fontWeight: 600 }} />
                        <Tab label={`👥 Clientes con Tarifas (${clientsWithTariffs.length})`} sx={{ textTransform: 'none', fontWeight: 600 }} />
                    </Tabs>

                    {/* TAB 0: Buscar y configurar cliente */}
                    {clientTab === 0 && (
                        <Box sx={{ p: 3 }}>
                            <TextField
                                fullWidth
                                placeholder="Buscar por nombre, casillero (S###) o email..."
                                value={clientSearch}
                                onChange={(e) => {
                                    setClientSearch(e.target.value);
                                    searchClients(e.target.value);
                                }}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon />
                                        </InputAdornment>
                                    ),
                                    endAdornment: clientSearching ? <CircularProgress size={20} /> : null,
                                }}
                                sx={{ mb: 2 }}
                            />

                            {/* Search results */}
                            {clientOptions.length > 0 && !selectedClient && (
                                <Paper sx={{ mb: 2, maxHeight: 200, overflow: 'auto' }}>
                                    <List dense>
                                        {clientOptions.map((c) => (
                                            <ListItem
                                                key={`${c.source}-${c.id}`}
                                                onClick={() => selectClient(c)}
                                                sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#F3E5F5' } }}
                                            >
                                                <ListItemText
                                                    primary={
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                            <Chip
                                                                label={c.box_id}
                                                                size="small"
                                                                sx={{ bgcolor: '#7B1FA2', color: 'white', fontWeight: 700 }}
                                                            />
                                                            <Typography fontWeight={600}>{c.name}</Typography>
                                                        </Box>
                                                    }
                                                    secondary={c.email}
                                                />
                                            </ListItem>
                                        ))}
                                    </List>
                                </Paper>
                            )}

                            {/* Selected client */}
                            {selectedClient && (
                                <>
                                    <Paper sx={{ p: 2, mb: 3, bgcolor: '#F3E5F5', display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Chip
                                            label={selectedClient.box_id}
                                            sx={{ bgcolor: '#7B1FA2', color: 'white', fontWeight: 700, fontSize: '1rem' }}
                                        />
                                        <Box sx={{ flex: 1 }}>
                                            <Typography fontWeight={700}>{selectedClient.name}</Typography>
                                            <Typography variant="caption" color="text.secondary">{selectedClient.email}</Typography>
                                        </Box>
                                        <Button
                                            size="small"
                                            onClick={() => selectClient(null)}
                                            sx={{ textTransform: 'none' }}
                                        >
                                            Cambiar
                                        </Button>
                                    </Paper>

                                    {/* Tariffs table */}
                                    {clientTariffsLoading ? (
                                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                            <CircularProgress sx={{ color: '#7B1FA2' }} />
                                        </Box>
                                    ) : (
                                        <>
                                            <Alert severity="info" sx={{ mb: 2 }}>
                                                Configura el precio por KG para cada ruta y tipo. Deja vacío para usar la tarifa estándar.
                                            </Alert>
                                            <TableContainer component={Paper}>
                                                <Table size="small">
                                                    <TableHead>
                                                        <TableRow sx={{ bgcolor: '#263238' }}>
                                                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Ruta</TableCell>
                                                            <TableCell align="center" sx={{ color: 'white', fontWeight: 700, bgcolor: '#1565C0' }}>
                                                                L (Logo)
                                                            </TableCell>
                                                            <TableCell align="center" sx={{ color: 'white', fontWeight: 700, bgcolor: '#2E7D32' }}>
                                                                G (Genérico)
                                                            </TableCell>
                                                            <TableCell align="center" sx={{ color: 'white', fontWeight: 700, bgcolor: '#E65100' }}>
                                                                S (Sensible)
                                                            </TableCell>
                                                            <TableCell align="center" sx={{ color: 'white', fontWeight: 700, bgcolor: '#6A1B9A' }}>
                                                                F (Flat)
                                                            </TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {routes.map((route) => (
                                                            <TableRow key={route.id} hover>
                                                                <TableCell>
                                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                        <FlightIcon sx={{ color: AIR_COLOR, fontSize: 18 }} />
                                                                        <Box>
                                                                            <Typography fontWeight={700} sx={{ fontFamily: 'monospace' }}>
                                                                                {route.code}
                                                                            </Typography>
                                                                            <Typography variant="caption" color="text.secondary">
                                                                                {route.origin_airport} → {route.destination_airport}
                                                                            </Typography>
                                                                        </Box>
                                                                    </Box>
                                                                </TableCell>
                                                                {['L', 'G', 'S', 'F'].map((type) => {
                                                                    const key = `${route.id}_${type}`;
                                                                    const defaultPrice = route.tariffs[type as keyof typeof route.tariffs]?.price_per_kg || 0;
                                                                    const currentTariff = clientTariffs.find(t => t.route_id === route.id && t.tariff_type === type);
                                                                    return (
                                                                        <TableCell key={type} align="center">
                                                                            <TextField
                                                                                value={editingClientTariffs[key] || ''}
                                                                                onChange={(e) => handleClientTariffChange(route.id, type, e.target.value)}
                                                                                type="number"
                                                                                size="small"
                                                                                placeholder={defaultPrice ? `$${defaultPrice}` : '-'}
                                                                                sx={{
                                                                                    width: 90,
                                                                                    '& .MuiOutlinedInput-root': {
                                                                                        bgcolor: currentTariff ? '#F3E5F5' : 'white',
                                                                                    },
                                                                                }}
                                                                                InputProps={{
                                                                                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                                                                    inputProps: { step: '0.01', style: { textAlign: 'center', fontWeight: 600 } },
                                                                                }}
                                                                            />
                                                                            {currentTariff && (
                                                                                <IconButton
                                                                                    size="small"
                                                                                    onClick={() => deleteClientTariff(currentTariff.id)}
                                                                                    sx={{ ml: 0.5, color: '#C62828' }}
                                                                                >
                                                                                    <DeleteIcon sx={{ fontSize: 16 }} />
                                                                                </IconButton>
                                                                            )}
                                                                        </TableCell>
                                                                    );
                                                                })}
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </TableContainer>
                                        </>
                                    )}
                                </>
                            )}

                            {!selectedClient && clientOptions.length === 0 && clientSearch.length >= 2 && !clientSearching && (
                                <Alert severity="warning">No se encontraron clientes con "{clientSearch}"</Alert>
                            )}
                        </Box>
                    )}

                    {/* TAB 1: Lista de clientes con tarifas */}
                    {clientTab === 1 && (
                        <Box sx={{ p: 3 }}>
                            {clientsWithTariffs.length === 0 ? (
                                <Alert severity="info">No hay clientes con tarifas personalizadas configuradas</Alert>
                            ) : (
                                <TableContainer component={Paper}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow sx={{ bgcolor: '#7B1FA2' }}>
                                                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Casillero</TableCell>
                                                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Nombre</TableCell>
                                                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Email</TableCell>
                                                <TableCell align="center" sx={{ color: 'white', fontWeight: 700 }}>Tarifas</TableCell>
                                                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Rutas</TableCell>
                                                <TableCell align="center" sx={{ color: 'white', fontWeight: 700 }}>Acción</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {clientsWithTariffs.map((client) => (
                                                <TableRow key={`${client.source}-${client.user_id || client.legacy_client_id}`} hover>
                                                    <TableCell>
                                                        <Chip
                                                            label={client.box_id}
                                                            size="small"
                                                            sx={{ bgcolor: '#7B1FA2', color: 'white', fontWeight: 700 }}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography fontWeight={600}>{client.name}</Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2" color="text.secondary">{client.email}</Typography>
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Chip label={client.tariffs_count} size="small" color="primary" />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                                            {client.routes}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Tooltip title="Editar tarifas">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => {
                                                                    setClientTab(0);
                                                                    selectClient({
                                                                        source: client.source,
                                                                        id: client.user_id || client.legacy_client_id,
                                                                        name: client.name,
                                                                        box_id: client.box_id,
                                                                        email: client.email,
                                                                    });
                                                                }}
                                                                sx={{ color: '#7B1FA2' }}
                                                            >
                                                                <EditIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <Divider />
                <DialogActions sx={{ p: 2, gap: 1 }}>
                    <Button onClick={() => setClientDialogOpen(false)} sx={{ textTransform: 'none' }}>
                        Cerrar
                    </Button>
                    {clientTab === 0 && selectedClient && (
                        <Button
                            variant="contained"
                            startIcon={clientTariffsSaving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                            onClick={saveClientTariffs}
                            disabled={clientTariffsSaving}
                            sx={{
                                textTransform: 'none',
                                bgcolor: '#7B1FA2',
                                '&:hover': { bgcolor: '#6A1B9A' },
                            }}
                        >
                            {clientTariffsSaving ? 'Guardando...' : 'Guardar Tarifas'}
                        </Button>
                    )}
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
