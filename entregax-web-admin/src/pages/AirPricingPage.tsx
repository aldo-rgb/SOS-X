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
    Card,
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
    History as HistoryIcon,
    TrendingUp as TrendingUpIcon,
    RocketLaunch as RocketIcon,
} from '@mui/icons-material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const AIR_COLOR = '#E53935';

const TARIFF_TYPES = [
    { key: 'L', label: 'Logo', color: '#1565C0', bgColor: '#E3F2FD', description: 'Mercancía con logo/marca' },
    { key: 'G', label: 'Genérico', color: '#2E7D32', bgColor: '#E8F5E9', description: 'Mercancía genérica' },
    { key: 'S', label: 'Sensible', color: '#E65100', bgColor: '#FFF3E0', description: 'Mercancía sensible' },
    { key: 'F', label: 'Flat', color: '#6A1B9A', bgColor: '#F3E5F5', description: 'Tarifa plana' },
];

// Márgenes automáticos sobre Costo Ruta (null = manual). Default; el admin
// puede sobrescribirlos desde el panel y se persisten en localStorage.
const DEFAULT_TARIFF_MARKUPS: Record<string, number | null> = {
    L: 9,   // Logo = Costo Ruta + $9
    G: 8,   // Genérico = Costo Ruta + $8
    S: null, // Sensible = manual
    F: 7,   // Flat = Costo Ruta + $7
};
const MARKUPS_STORAGE_KEY = 'air_tariff_markups_v1';
const loadStoredMarkups = (): Record<string, number | null> => {
    try {
        const raw = localStorage.getItem(MARKUPS_STORAGE_KEY);
        if (!raw) return { ...DEFAULT_TARIFF_MARKUPS };
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_TARIFF_MARKUPS, ...parsed };
    } catch {
        return { ...DEFAULT_TARIFF_MARKUPS };
    }
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
    updated_at: string | null;
    is_active: boolean;
    tariffs: {
        L: { id: number | null; price_per_kg: number; is_active: boolean };
        G: { id: number | null; price_per_kg: number; is_active: boolean };
        S: { id: number | null; price_per_kg: number; is_active: boolean };
        F: { id: number | null; price_per_kg: number; is_active: boolean };
    };
    startup_tiers: { id: number; min_weight: number; max_weight: number; price_usd: number; is_active: boolean }[];
}

interface StartupTierRow {
    min_weight: string;
    max_weight: string;
    price_usd: string;
    is_active: boolean;
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

interface PriceHistoryItem {
    id: number;
    cost_per_kg_usd: number;
    changed_at: string;
    notes: string | null;
    changed_by_name: string | null;
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

    // Price history dialog state
    const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
    const [historyRoute, setHistoryRoute] = useState<RouteTariff | null>(null);
    const [priceHistory, setPriceHistory] = useState<PriceHistoryItem[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Startup tiers state
    const [startupTiers, setStartupTiers] = useState<Record<number, StartupTierRow[]>>({});
    const [startupSaving, setStartupSaving] = useState<number | null>(null);
    const [startupDirty, setStartupDirty] = useState<Record<number, boolean>>({});

    // ✏️ Markups editables (override sobre Costo Ruta)
    const [tariffMarkups, setTariffMarkups] = useState<Record<string, number | null>>(() => loadStoredMarkups());
    const [markupDialogOpen, setMarkupDialogOpen] = useState(false);
    const [markupDraft, setMarkupDraft] = useState<Record<string, string>>({ L: '', G: '', S: '', F: '' });

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

                // Initialize startup tiers
                const stMap: Record<number, StartupTierRow[]> = {};
                for (const r of data.routes || []) {
                    stMap[r.id] = (r.startup_tiers || []).map((t: any) => ({
                        min_weight: t.min_weight.toString(),
                        max_weight: t.max_weight.toString(),
                        price_usd: t.price_usd.toString(),
                        is_active: t.is_active,
                    }));
                }
                setStartupTiers(stMap);
                setStartupDirty({});
            }
        } catch (error) {
            console.error('Error cargando tarifas:', error);
            setSnackbar({ open: true, message: 'Error cargando tarifas', severity: 'error' });
        } finally {
            setLoading(false);
        }
    }, [token]);

    // ========== LOAD PRICE HISTORY ==========
    const loadPriceHistory = useCallback(async (routeId: number) => {
        try {
            setHistoryLoading(true);
            const res = await fetch(`${API_URL}/api/admin/air-tariffs/${routeId}/history`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) {
                setPriceHistory(data.history || []);
            }
        } catch (error) {
            console.error('Error cargando historial:', error);
        } finally {
            setHistoryLoading(false);
        }
    }, [token]);

    const openHistoryDialog = (route: RouteTariff) => {
        setHistoryRoute(route);
        setHistoryDialogOpen(true);
        loadPriceHistory(route.id);
    };

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
                    for (const [type, markup] of Object.entries(tariffMarkups)) {
                        if (markup !== null && !isNaN(markup)) {
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

    // ========== STARTUP TIER HANDLERS ==========
    const handleStartupChange = (routeId: number, index: number, field: keyof StartupTierRow, value: string | boolean) => {
        setStartupTiers(prev => {
            const tiers = [...(prev[routeId] || [])];
            tiers[index] = { ...tiers[index], [field]: value };
            return { ...prev, [routeId]: tiers };
        });
        setStartupDirty(prev => ({ ...prev, [routeId]: true }));
    };

    const handleAddStartupTier = (routeId: number) => {
        setStartupTiers(prev => {
            const tiers = [...(prev[routeId] || [])];
            const lastMax = tiers.length > 0 ? parseFloat(tiers[tiers.length - 1].max_weight) : 0;
            tiers.push({ min_weight: (lastMax + 0.01).toFixed(2), max_weight: (lastMax + 5).toFixed(0), price_usd: '0', is_active: true });
            return { ...prev, [routeId]: tiers };
        });
        setStartupDirty(prev => ({ ...prev, [routeId]: true }));
    };

    const handleRemoveStartupTier = (routeId: number, index: number) => {
        setStartupTiers(prev => {
            const tiers = [...(prev[routeId] || [])];
            tiers.splice(index, 1);
            return { ...prev, [routeId]: tiers };
        });
        setStartupDirty(prev => ({ ...prev, [routeId]: true }));
    };

    const handleSaveStartup = async (routeId: number) => {
        setStartupSaving(routeId);
        try {
            const tiers = startupTiers[routeId] || [];
            const res = await fetch(`${API_URL}/api/admin/air-startup-tiers`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ route_id: routeId, tiers }),
            });
            const data = await res.json();
            if (data.success) {
                setSnackbar({ open: true, message: 'Tarifas Start Up guardadas', severity: 'success' });
                setStartupDirty(prev => ({ ...prev, [routeId]: false }));
            } else {
                throw new Error(data.error);
            }
        } catch (error: unknown) {
            setSnackbar({ open: true, message: error instanceof Error ? error.message : 'Error', severity: 'error' });
        } finally {
            setStartupSaving(null);
        }
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
            <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                {TARIFF_TYPES.map((t) => {
                    const mk = tariffMarkups[t.key];
                    const suffix = mk === null ? ' (manual)' : ` (+$${mk})`;
                    return (
                        <Chip
                            key={t.key}
                            label={`${t.key} — ${t.label}${suffix}`}
                            sx={{
                                bgcolor: t.bgColor,
                                color: t.color,
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                border: `1px solid ${t.color}30`,
                            }}
                        />
                    );
                })}
                <Button
                    variant="outlined"
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => {
                        setMarkupDraft({
                            L: tariffMarkups.L === null ? '' : String(tariffMarkups.L),
                            G: tariffMarkups.G === null ? '' : String(tariffMarkups.G),
                            S: tariffMarkups.S === null ? '' : String(tariffMarkups.S),
                            F: tariffMarkups.F === null ? '' : String(tariffMarkups.F),
                        });
                        setMarkupDialogOpen(true);
                    }}
                    sx={{ ml: 'auto', borderColor: AIR_COLOR, color: AIR_COLOR, fontWeight: 600 }}
                >
                    Editar márgenes (override)
                </Button>
            </Box>

            <Alert severity="info" sx={{ mb: 3 }}>
                <strong>Costo Ruta:</strong> precio base/costo de la ruta (USD). Al modificarlo se calculan automáticamente:
                {' '}<strong>Logo (L):</strong> Costo {tariffMarkups.L === null ? '— manual' : `+ $${tariffMarkups.L}`} ·
                {' '}<strong>Genérico (G):</strong> Costo {tariffMarkups.G === null ? '— manual' : `+ $${tariffMarkups.G}`} ·
                {' '}<strong>Flat (F):</strong> Costo {tariffMarkups.F === null ? '— manual' : `+ $${tariffMarkups.F}`} ·
                {' '}<strong>Sensible (S):</strong> {tariffMarkups.S === null ? 'se configura manualmente' : `Costo + $${tariffMarkups.S}`}.
                {' '}Tarifas en USD. Costos proveedor (⚙️) en MXN.
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
                                    const markup = tariffMarkups[t.key];
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
                                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
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
                                                {route.updated_at && (
                                                    <Tooltip title="Última actualización — Click para ver historial">
                                                        <Box 
                                                            sx={{ 
                                                                display: 'flex', 
                                                                alignItems: 'center', 
                                                                gap: 0.5, 
                                                                cursor: 'pointer',
                                                                mt: 0.5,
                                                                px: 1,
                                                                py: 0.25,
                                                                borderRadius: 1,
                                                                bgcolor: '#E3F2FD',
                                                                '&:hover': { bgcolor: '#BBDEFB' }
                                                            }}
                                                            onClick={() => openHistoryDialog(route)}
                                                        >
                                                            <HistoryIcon sx={{ fontSize: 14, color: '#1565C0' }} />
                                                            <Typography variant="caption" sx={{ fontSize: '0.72rem', color: '#1565C0', fontWeight: 500 }}>
                                                                {new Date(route.updated_at).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' })} {new Date(route.updated_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                                            </Typography>
                                                        </Box>
                                                    </Tooltip>
                                                )}
                                            </Box>
                                        </TableCell>

                                        {/* Tariff type columns */}
                                        {TARIFF_TYPES.map((t) => {
                                            const val = row[t.key as keyof EditableRow] as string;
                                            const isZero = !val || parseFloat(val) === 0;
                                            const markup = tariffMarkups[t.key];
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
                                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', alignItems: 'center' }}>
                                                <Tooltip title="Ver historial de cambios de tarifa">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => openHistoryDialog(route)}
                                                        sx={{ color: '#1565C0', bgcolor: '#E3F2FD', '&:hover': { bgcolor: '#BBDEFB' } }}
                                                    >
                                                        <HistoryIcon sx={{ fontSize: 18 }} />
                                                    </IconButton>
                                                </Tooltip>
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
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* ========== STARTUP TIERS SECTION ========== */}
            {routes.filter(r => r.is_active).slice(0, 1).map(route => (
                <Paper key={`startup-${route.id}`} sx={{ mb: 3, p: 2.5, borderRadius: 2, border: '2px solid #FF6F00' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <RocketIcon sx={{ color: '#FF6F00', fontSize: 28 }} />
                            <Box>
                                <Typography variant="h6" fontWeight="bold" color="#FF6F00">
                                    TDI Start Up
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Tarifa plana por rango de peso (≤15 kg). Incluye flete internacional + aduanas + entrega a puerta. Aplica automáticamente antes que Logo/Genérico.
                                </Typography>
                            </Box>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<AddIcon />}
                                onClick={() => handleAddStartupTier(route.id)}
                                sx={{ textTransform: 'none', borderColor: '#FF6F00', color: '#FF6F00' }}
                            >
                                Agregar Rango
                            </Button>
                            {startupDirty[route.id] && (
                                <Button
                                    size="small"
                                    variant="contained"
                                    startIcon={startupSaving === route.id ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                                    onClick={() => handleSaveStartup(route.id)}
                                    disabled={startupSaving !== null}
                                    sx={{ textTransform: 'none', bgcolor: '#FF6F00', '&:hover': { bgcolor: '#E65100' } }}
                                >
                                    Guardar Start Up
                                </Button>
                            )}
                        </Box>
                    </Box>
                    {(startupTiers[route.id] || []).length === 0 ? (
                        <Alert severity="info" sx={{ borderRadius: 2 }}>
                            No hay rangos de Start Up configurados. Los paquetes ≤15 kg usarán la tarifa por kg normal.
                        </Alert>
                    ) : (
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 'bold', width: 180 }}>Peso Mínimo (kg)</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', width: 180 }}>Peso Máximo (kg)</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', width: 180 }}>Precio (USD)</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', width: 100 }}>Activo</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', width: 80 }}></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {(startupTiers[route.id] || []).map((tier, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell>
                                            <TextField
                                                size="small"
                                                type="number"
                                                value={tier.min_weight}
                                                onChange={(e) => handleStartupChange(route.id, idx, 'min_weight', e.target.value)}
                                                InputProps={{ endAdornment: <InputAdornment position="end">kg</InputAdornment> }}
                                                sx={{ width: 150 }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <TextField
                                                size="small"
                                                type="number"
                                                value={tier.max_weight}
                                                onChange={(e) => handleStartupChange(route.id, idx, 'max_weight', e.target.value)}
                                                InputProps={{ endAdornment: <InputAdornment position="end">kg</InputAdornment> }}
                                                sx={{ width: 150 }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <TextField
                                                size="small"
                                                type="number"
                                                value={tier.price_usd}
                                                onChange={(e) => handleStartupChange(route.id, idx, 'price_usd', e.target.value)}
                                                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment>, endAdornment: <InputAdornment position="end">USD</InputAdornment> }}
                                                sx={{ width: 160 }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={tier.is_active ? 'Sí' : 'No'}
                                                size="small"
                                                color={tier.is_active ? 'success' : 'default'}
                                                onClick={() => handleStartupChange(route.id, idx, 'is_active', !tier.is_active)}
                                                sx={{ cursor: 'pointer' }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <IconButton size="small" onClick={() => handleRemoveStartupTier(route.id, idx)} sx={{ color: '#C62828' }}>
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </Paper>
            ))}

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

            {/* ========== PRICE HISTORY DIALOG ========== */}
            <Dialog
                open={historyDialogOpen}
                onClose={() => setHistoryDialogOpen(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle sx={{ bgcolor: '#F5F5F5', borderBottom: '1px solid #ddd' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <HistoryIcon color="primary" />
                        <Typography variant="h6">
                            Historial de Precios - Ruta {historyRoute?.code}
                        </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                        {historyRoute?.origin_airport} → {historyRoute?.destination_airport}
                    </Typography>
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    {historyLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <CircularProgress />
                        </Box>
                    ) : priceHistory.length === 0 ? (
                        <Alert severity="info">No hay historial de cambios de precio registrado.</Alert>
                    ) : (
                        <Box>
                            {/* Mini gráfica de tendencia */}
                            <Card variant="outlined" sx={{ mb: 3, p: 2 }}>
                                <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <TrendingUpIcon color="primary" /> Tendencia de Precio
                                </Typography>
                                <Box sx={{ 
                                    display: 'flex', 
                                    alignItems: 'flex-end', 
                                    gap: 1, 
                                    height: 100, 
                                    mt: 2,
                                    borderBottom: '2px solid #e0e0e0',
                                    pb: 1
                                }}>
                                    {[...priceHistory].reverse().slice(-15).map((item, idx, arr) => {
                                        const maxPrice = Math.max(...arr.map(h => Number(h.cost_per_kg_usd)));
                                        const minPrice = Math.min(...arr.map(h => Number(h.cost_per_kg_usd)));
                                        const range = maxPrice - minPrice || 1;
                                        const height = ((Number(item.cost_per_kg_usd) - minPrice) / range * 70) + 20;
                                        const isLast = idx === arr.length - 1;
                                        return (
                                            <Tooltip key={item.id} title={`$${item.cost_per_kg_usd} - ${new Date(item.changed_at).toLocaleDateString('es-MX')}`}>
                                                <Box
                                                    sx={{
                                                        flex: 1,
                                                        height: `${height}%`,
                                                        bgcolor: isLast ? 'primary.main' : 'primary.light',
                                                        borderRadius: '4px 4px 0 0',
                                                        minWidth: 20,
                                                        transition: 'all 0.2s',
                                                        '&:hover': { 
                                                            bgcolor: 'primary.dark',
                                                            transform: 'scaleY(1.05)'
                                                        },
                                                        display: 'flex',
                                                        alignItems: 'flex-start',
                                                        justifyContent: 'center',
                                                        pt: 0.5
                                                    }}
                                                >
                                                    <Typography variant="caption" sx={{ color: 'white', fontWeight: 'bold', fontSize: '0.6rem' }}>
                                                        ${item.cost_per_kg_usd}
                                                    </Typography>
                                                </Box>
                                            </Tooltip>
                                        );
                                    })}
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                                    <Typography variant="caption" color="text.secondary">
                                        {priceHistory.length > 0 && new Date([...priceHistory].reverse()[0]?.changed_at).toLocaleDateString('es-MX')}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {priceHistory.length > 0 && new Date(priceHistory[0]?.changed_at).toLocaleDateString('es-MX')}
                                    </Typography>
                                </Box>
                            </Card>

                            {/* Tabla de historial */}
                            <Typography variant="subtitle2" gutterBottom>
                                Registro de Cambios ({priceHistory.length})
                            </Typography>
                            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                                <Table size="small" stickyHeader>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Fecha y Hora</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Precio (USD)</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Cambio</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Usuario</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {priceHistory.map((item, idx) => {
                                            const prevItem = priceHistory[idx + 1];
                                            const diff = prevItem ? Number(item.cost_per_kg_usd) - Number(prevItem.cost_per_kg_usd) : 0;
                                            return (
                                                <TableRow key={item.id} hover>
                                                    <TableCell>
                                                        <Typography variant="body2">
                                                            {new Date(item.changed_at).toLocaleDateString('es-MX', { 
                                                                day: '2-digit', month: 'short', year: 'numeric' 
                                                            })}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {new Date(item.changed_at).toLocaleTimeString('es-MX', { 
                                                                hour: '2-digit', minute: '2-digit' 
                                                            })}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Typography variant="body2" fontWeight="bold" color="primary">
                                                            ${Number(item.cost_per_kg_usd).toFixed(2)}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        {diff !== 0 && (
                                                            <Chip
                                                                size="small"
                                                                label={`${diff > 0 ? '+' : ''}$${diff.toFixed(2)}`}
                                                                color={diff > 0 ? 'error' : 'success'}
                                                                sx={{ fontSize: '0.7rem', height: 20 }}
                                                            />
                                                        )}
                                                        {idx === priceHistory.length - 1 && (
                                                            <Chip size="small" label="Inicial" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {item.changed_by_name || 'Sistema'}
                                                        </Typography>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setHistoryDialogOpen(false)}>Cerrar</Button>
                </DialogActions>
            </Dialog>

            {/* ✏️ Dialog: editar márgenes (override) */}
            <Dialog open={markupDialogOpen} onClose={() => setMarkupDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ bgcolor: AIR_COLOR, color: 'white', fontWeight: 700 }}>
                    Editar márgenes sobre Costo Ruta
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        Define el sobreprecio (USD) que se suma automáticamente al Costo Ruta para cada tarifa. Deja vacío para que la tarifa quede en modo manual.
                    </Alert>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {TARIFF_TYPES.map((t) => (
                            <TextField
                                key={t.key}
                                label={`${t.key} — ${t.label}`}
                                type="number"
                                value={markupDraft[t.key] ?? ''}
                                onChange={(e) => setMarkupDraft((prev) => ({ ...prev, [t.key]: e.target.value }))}
                                placeholder="Manual"
                                fullWidth
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">+ $</InputAdornment>,
                                }}
                                inputProps={{ step: '0.01' }}
                                helperText={markupDraft[t.key] === '' ? 'Vacío = manual' : `Precio = Costo Ruta + $${markupDraft[t.key]}`}
                                sx={{
                                    '& .MuiInputLabel-root': { color: t.color, fontWeight: 700 },
                                    '& .MuiOutlinedInput-root.Mui-focused fieldset': { borderColor: t.color },
                                }}
                            />
                        ))}
                    </Box>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button
                        onClick={() => {
                            setMarkupDraft({
                                L: String(DEFAULT_TARIFF_MARKUPS.L ?? ''),
                                G: String(DEFAULT_TARIFF_MARKUPS.G ?? ''),
                                S: DEFAULT_TARIFF_MARKUPS.S === null ? '' : String(DEFAULT_TARIFF_MARKUPS.S),
                                F: String(DEFAULT_TARIFF_MARKUPS.F ?? ''),
                            });
                        }}
                        color="inherit"
                    >
                        Restaurar defaults
                    </Button>
                    <Box sx={{ flex: 1 }} />
                    <Button onClick={() => setMarkupDialogOpen(false)}>Cancelar</Button>
                    <Button
                        variant="contained"
                        startIcon={<SaveIcon />}
                        sx={{ bgcolor: AIR_COLOR, '&:hover': { bgcolor: '#C62828' } }}
                        onClick={() => {
                            const next: Record<string, number | null> = {};
                            for (const t of TARIFF_TYPES) {
                                const raw = (markupDraft[t.key] ?? '').trim();
                                if (raw === '') {
                                    next[t.key] = null;
                                } else {
                                    const n = parseFloat(raw);
                                    next[t.key] = isNaN(n) ? null : n;
                                }
                            }
                            setTariffMarkups(next);
                            try { localStorage.setItem(MARKUPS_STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
                            setMarkupDialogOpen(false);
                            setSnackbar({ open: true, message: 'Márgenes actualizados. Edita Costo Ruta para recalcular.', severity: 'success' });
                        }}
                    >
                        Guardar
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
