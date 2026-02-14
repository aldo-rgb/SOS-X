// ============================================
// PANEL DE RECEPCIÓN CHINA - TDI AÉREO
// Visualización de recepciones y cajas desde China
// ============================================

import { useState, useEffect, Fragment } from 'react';
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
    Chip,
    IconButton,
    Collapse,
    CircularProgress,
    Alert,
    Button,
    TextField,
    InputAdornment,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Card,
    CardContent,
    Tooltip,
    Avatar,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
    KeyboardArrowDown as ExpandIcon,
    KeyboardArrowUp as CollapseIcon,
    Search as SearchIcon,
    Refresh as RefreshIcon,
    LocalShipping as ShippingIcon,
    Inventory as InventoryIcon,
    Warning as WarningIcon,
    FlightTakeoff as FlightIcon,
    Photo as PhotoIcon,
    Assignment as AssignIcon,
    Add as AddIcon,
} from '@mui/icons-material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ChinaReceipt {
    id: number;
    fno: string;
    user_id: number | null;
    shipping_mark: string;
    total_qty: number;
    total_weight: number;
    total_volume: number;
    total_cbm: number;
    evidence_urls: string[];
    international_tracking: string | null;
    status: string;
    notes: string | null;
    created_at: string;
    client_name: string | null;
    client_box_id: string | null;
    package_count: number;
}

interface ChinaPackage {
    id: number;
    tracking_internal: string;
    child_no: string;
    weight: number;
    dimensions: string;
    pro_name: string;
    customs_bno: string;
    trajectory_name: string;
    international_tracking: string | null;
    etd: string | null;
    eta: string | null;
    status: string;
}

interface Stats {
    byStatus: { status: string; count: string }[];
    todayPackages: number;
    unassignedReceipts: number;
    pendingBillNo: number;
}

// Componente de fila expandible
function ReceiptRow({ 
    receipt, 
    onAssignClient, 
    onUpdateStatus 
}: { 
    receipt: ChinaReceipt; 
    onAssignClient: (id: number) => void;
    onUpdateStatus: (id: number, status: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [packages, setPackages] = useState<ChinaPackage[]>([]);
    const [loading, setLoading] = useState(false);

    const loadPackages = async () => {
        if (packages.length > 0) return; // Ya cargados
        
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/china/receipts/${receipt.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setPackages(data.packages || []);
            }
        } catch (err) {
            console.error('Error loading packages:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleExpand = () => {
        if (!open) loadPackages();
        setOpen(!open);
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'received_origin': return 'info';
            case 'in_transit': return 'warning';
            case 'arrived_mx': return 'success';
            case 'delivered': return 'default';
            default: return 'default';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'received_origin': return 'En Origen';
            case 'in_transit': return 'En Tránsito';
            case 'arrived_mx': return 'Llegó MX';
            case 'delivered': return 'Entregado';
            default: return status;
        }
    };

    return (
        <Fragment>
            {/* Fila principal */}
            <TableRow sx={{ '& > *': { borderBottom: 'unset' }, bgcolor: !receipt.user_id ? 'rgba(255,152,0,0.05)' : 'inherit' }}>
                <TableCell>
                    <IconButton size="small" onClick={handleExpand}>
                        {open ? <CollapseIcon /> : <ExpandIcon />}
                    </IconButton>
                </TableCell>
                <TableCell>
                    <Typography fontWeight="bold" sx={{ fontFamily: 'monospace' }}>
                        {receipt.fno}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {new Date(receipt.created_at).toLocaleDateString()}
                    </Typography>
                </TableCell>
                <TableCell>
                    {receipt.user_id ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar sx={{ width: 28, height: 28, bgcolor: '#F05A28', fontSize: 12 }}>
                                {receipt.client_name?.charAt(0) || '?'}
                            </Avatar>
                            <Box>
                                <Typography variant="body2" fontWeight={500}>
                                    {receipt.client_name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {receipt.shipping_mark}
                                </Typography>
                            </Box>
                        </Box>
                    ) : (
                        <Tooltip title="Click para asignar cliente">
                            <Chip
                                icon={<WarningIcon />}
                                label={receipt.shipping_mark || 'Sin asignar'}
                                color="warning"
                                size="small"
                                onClick={() => onAssignClient(receipt.id)}
                                sx={{ cursor: 'pointer' }}
                            />
                        </Tooltip>
                    )}
                </TableCell>
                <TableCell align="center">
                    <Typography fontWeight="bold">{receipt.total_qty}</Typography>
                    <Typography variant="caption" color="text.secondary">cajas</Typography>
                </TableCell>
                <TableCell align="right">
                    <Typography>{Number(receipt.total_weight || 0).toFixed(2)} kg</Typography>
                </TableCell>
                <TableCell align="right">
                    <Typography>{Number(receipt.total_cbm || 0).toFixed(4)} m³</Typography>
                </TableCell>
                <TableCell>
                    {receipt.international_tracking ? (
                        <Chip 
                            icon={<FlightIcon />}
                            label={receipt.international_tracking} 
                            color="primary" 
                            size="small" 
                        />
                    ) : (
                        <Typography variant="caption" color="text.secondary">
                            Pendiente...
                        </Typography>
                    )}
                </TableCell>
                <TableCell>
                    <Chip 
                        label={getStatusLabel(receipt.status)} 
                        color={getStatusColor(receipt.status) as 'default' | 'info' | 'warning' | 'success'}
                        size="small"
                    />
                </TableCell>
                <TableCell>
                    {receipt.evidence_urls && receipt.evidence_urls.length > 0 && (
                        <Tooltip title="Ver evidencias">
                            <IconButton 
                                size="small" 
                                onClick={() => window.open(receipt.evidence_urls[0], '_blank')}
                            >
                                <PhotoIcon />
                            </IconButton>
                        </Tooltip>
                    )}
                </TableCell>
            </TableRow>

            {/* Fila de detalle expandible */}
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={9}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="h6" component="div">
                                    📦 Detalle de Cajas ({packages.length})
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        onClick={() => onUpdateStatus(receipt.id, 'in_transit')}
                                        disabled={receipt.status !== 'received_origin'}
                                    >
                                        Marcar En Tránsito
                                    </Button>
                                </Box>
                            </Box>

                            {loading ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                                    <CircularProgress size={24} />
                                </Box>
                            ) : (
                                <Table size="small">
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: 'rgba(0,0,0,0.04)' }}>
                                            <TableCell>Child No</TableCell>
                                            <TableCell>Tracking Interno</TableCell>
                                            <TableCell>Producto</TableCell>
                                            <TableCell>Código Aduanal</TableCell>
                                            <TableCell align="right">Peso</TableCell>
                                            <TableCell>Dimensiones</TableCell>
                                            <TableCell>Bill No (AWB)</TableCell>
                                            <TableCell>Estado</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {packages.map((pkg) => (
                                            <TableRow key={pkg.id} hover>
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                                        {pkg.child_no}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Chip label={pkg.tracking_internal} size="small" variant="outlined" />
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2">{pkg.pro_name}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Chip label={pkg.customs_bno} size="small" color="default" />
                                                </TableCell>
                                                <TableCell align="right">{pkg.weight} kg</TableCell>
                                                <TableCell>{pkg.dimensions}</TableCell>
                                                <TableCell>
                                                    {pkg.international_tracking ? (
                                                        <Chip label={pkg.international_tracking} size="small" color="primary" />
                                                    ) : (
                                                        <Typography variant="caption" color="text.secondary">-</Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Chip 
                                                        label={getStatusLabel(pkg.status)} 
                                                        size="small"
                                                        color={getStatusColor(pkg.status) as 'default' | 'info' | 'warning' | 'success'}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </Fragment>
    );
}

// Componente principal
export default function ChinaReceptionPage() {
    const [receipts, setReceipts] = useState<ChinaReceipt[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    
    // Dialog de asignación
    const [assignDialog, setAssignDialog] = useState(false);
    const [selectedReceiptId, setSelectedReceiptId] = useState<number | null>(null);
    const [clients, setClients] = useState<{id: number; full_name: string; box_id: string; email?: string}[]>([]);
    const [selectedClient, setSelectedClient] = useState('');

    // Dialog de captura manual
    const [manualDialog, setManualDialog] = useState(false);
    const [manualForm, setManualForm] = useState({
        fno: '',
        shipping_mark: '',
        total_qty: 1,
        total_weight: 0,
        total_cbm: 0,
        notes: ''
    });
    const [saving, setSaving] = useState(false);

    const token = localStorage.getItem('token');

    // Cargar datos al montar y cuando cambia el filtro
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                let url = `${API_URL}/api/china/receipts?limit=100`;
                if (statusFilter) url += `&status=${statusFilter}`;

                const [receiptsRes, statsRes] = await Promise.all([
                    fetch(url, { headers: { Authorization: `Bearer ${token}` } }),
                    fetch(`${API_URL}/api/china/stats`, { headers: { Authorization: `Bearer ${token}` } })
                ]);

                if (receiptsRes.ok) {
                    const data = await receiptsRes.json();
                    setReceipts(data.receipts || []);
                }
                if (statsRes.ok) {
                    const data = await statsRes.json();
                    setStats(data.stats);
                }
            } catch (err) {
                console.error('Error loading data:', err);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [statusFilter, token]);

    const fetchReceipts = async () => {
        setLoading(true);
        try {
            let url = `${API_URL}/api/china/receipts?limit=100`;
            if (statusFilter) url += `&status=${statusFilter}`;

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setReceipts(data.receipts || []);
            }
        } catch (err) {
            console.error('Error fetching receipts:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const res = await fetch(`${API_URL}/api/china/stats`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setStats(data.stats);
            }
        } catch (err) {
            console.error('Error fetching stats:', err);
        }
    };

    const fetchClients = async () => {
        try {
            const res = await fetch(`${API_URL}/api/gex/clients?q=`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setClients(data.clients || []);
            }
        } catch (err) {
            console.error('Error fetching clients:', err);
        }
    };

    const handleAssignClient = (receiptId: number) => {
        setSelectedReceiptId(receiptId);
        fetchClients();
        setAssignDialog(true);
    };

    const confirmAssignment = async () => {
        if (!selectedReceiptId || !selectedClient) return;

        try {
            const res = await fetch(`${API_URL}/api/china/receipts/${selectedReceiptId}/assign`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ userId: parseInt(selectedClient) })
            });

            if (res.ok) {
                fetchReceipts();
                setAssignDialog(false);
                setSelectedClient('');
            }
        } catch (err) {
            console.error('Error assigning client:', err);
        }
    };

    const handleUpdateStatus = async (receiptId: number, status: string) => {
        try {
            const res = await fetch(`${API_URL}/api/china/receipts/${receiptId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ status })
            });

            if (res.ok) {
                fetchReceipts();
                fetchStats();
            }
        } catch (err) {
            console.error('Error updating status:', err);
        }
    };

    // Captura manual de recepción
    const handleManualCapture = async () => {
        if (!manualForm.fno || !manualForm.shipping_mark) return;
        
        setSaving(true);
        try {
            const res = await fetch(`${API_URL}/api/china/receipts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    fno: manualForm.fno,
                    shipping_mark: manualForm.shipping_mark,
                    total_qty: manualForm.total_qty,
                    total_weight: manualForm.total_weight,
                    total_cbm: manualForm.total_cbm,
                    notes: manualForm.notes || 'Captura manual desde panel admin'
                })
            });

            if (res.ok) {
                fetchReceipts();
                fetchStats();
                setManualDialog(false);
                setManualForm({ fno: '', shipping_mark: '', total_qty: 1, total_weight: 0, total_cbm: 0, notes: '' });
            } else {
                const error = await res.json();
                alert(error.error || 'Error al guardar la recepción');
            }
        } catch (err) {
            console.error('Error creating receipt:', err);
            alert('Error de conexión al crear la recepción');
        } finally {
            setSaving(false);
        }
    };

    // Filtrar por búsqueda
    const filteredReceipts = receipts.filter(r => 
        r.fno.toLowerCase().includes(search.toLowerCase()) ||
        r.shipping_mark?.toLowerCase().includes(search.toLowerCase()) ||
        r.client_name?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h4" fontWeight="bold">
                        🇨🇳 Recepción TDI Aéreo China
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Gestión de recepciones y cajas desde origen
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setManualDialog(true)}
                        sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#d94d1f' } }}
                    >
                        Captura Manual
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={() => { fetchReceipts(); fetchStats(); }}
                    >
                        Actualizar
                    </Button>
                </Box>
            </Box>

            {/* Stats Cards */}
            {stats && (
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <Card>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Avatar sx={{ bgcolor: '#F05A28' }}>
                                        <InventoryIcon />
                                    </Avatar>
                                    <Box>
                                        <Typography variant="h4" fontWeight="bold">
                                            {stats.todayPackages}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Cajas Hoy
                                        </Typography>
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <Card>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Avatar sx={{ bgcolor: '#FF9800' }}>
                                        <WarningIcon />
                                    </Avatar>
                                    <Box>
                                        <Typography variant="h4" fontWeight="bold">
                                            {stats.unassignedReceipts}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Sin Asignar
                                        </Typography>
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <Card>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Avatar sx={{ bgcolor: '#2196F3' }}>
                                        <FlightIcon />
                                    </Avatar>
                                    <Box>
                                        <Typography variant="h4" fontWeight="bold">
                                            {stats.pendingBillNo}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Sin Guía Aérea
                                        </Typography>
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <Card>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Avatar sx={{ bgcolor: '#4CAF50' }}>
                                        <ShippingIcon />
                                    </Avatar>
                                    <Box>
                                        <Typography variant="h4" fontWeight="bold">
                                            {receipts.length}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Total Recepciones
                                        </Typography>
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            )}

            {/* Filtros */}
            <Paper sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <TextField
                        size="small"
                        placeholder="Buscar FNO, Mark, Cliente..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon />
                                </InputAdornment>
                            ),
                        }}
                        sx={{ minWidth: 250 }}
                    />
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                        <InputLabel>Estado</InputLabel>
                        <Select
                            value={statusFilter}
                            label="Estado"
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <MenuItem value="">Todos</MenuItem>
                            <MenuItem value="received_origin">En Origen</MenuItem>
                            <MenuItem value="in_transit">En Tránsito</MenuItem>
                            <MenuItem value="arrived_mx">Llegó MX</MenuItem>
                        </Select>
                    </FormControl>
                </Box>
            </Paper>

            {/* Tabla de Recepciones */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                    <CircularProgress />
                </Box>
            ) : filteredReceipts.length === 0 ? (
                <Alert severity="info">
                    No hay recepciones registradas. Los datos llegarán automáticamente del sistema chino.
                </Alert>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead sx={{ bgcolor: '#F05A28' }}>
                            <TableRow>
                                <TableCell sx={{ color: 'white', width: 50 }} />
                                <TableCell sx={{ color: 'white' }}>FNO (Master)</TableCell>
                                <TableCell sx={{ color: 'white' }}>Cliente / Mark</TableCell>
                                <TableCell sx={{ color: 'white' }} align="center">Cantidad</TableCell>
                                <TableCell sx={{ color: 'white' }} align="right">Peso</TableCell>
                                <TableCell sx={{ color: 'white' }} align="right">CBM</TableCell>
                                <TableCell sx={{ color: 'white' }}>Guía Aérea</TableCell>
                                <TableCell sx={{ color: 'white' }}>Estado</TableCell>
                                <TableCell sx={{ color: 'white' }}>Acciones</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredReceipts.map((receipt) => (
                                <ReceiptRow
                                    key={receipt.id}
                                    receipt={receipt}
                                    onAssignClient={handleAssignClient}
                                    onUpdateStatus={handleUpdateStatus}
                                />
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Dialog de Asignación de Cliente */}
            <Dialog open={assignDialog} onClose={() => setAssignDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AssignIcon />
                        Asignar Cliente al Recibo
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Selecciona el cliente al que pertenece esta recepción.
                    </Typography>
                    <FormControl fullWidth>
                        <InputLabel>Cliente</InputLabel>
                        <Select
                            value={selectedClient}
                            label="Cliente"
                            onChange={(e) => setSelectedClient(e.target.value)}
                        >
                            {clients.map((client) => (
                                <MenuItem key={client.id} value={client.id}>
                                    {client.full_name} ({client.box_id || client.email})
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAssignDialog(false)}>Cancelar</Button>
                    <Button 
                        variant="contained" 
                        onClick={confirmAssignment}
                        disabled={!selectedClient}
                    >
                        Asignar
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog de Captura Manual */}
            <Dialog open={manualDialog} onClose={() => setManualDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AddIcon />
                        Captura Manual de Recepción
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Registra una recepción manualmente cuando no llegue del sistema automático.
                    </Typography>
                    
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        <TextField
                            label="FNO (Folio)"
                            value={manualForm.fno}
                            onChange={(e) => setManualForm({...manualForm, fno: e.target.value.toUpperCase()})}
                            placeholder="Ej: AIR2609001234"
                            fullWidth
                            required
                        />
                        
                        <TextField
                            label="Shipping Mark (Box ID)"
                            value={manualForm.shipping_mark}
                            onChange={(e) => setManualForm({...manualForm, shipping_mark: e.target.value.toUpperCase()})}
                            placeholder="Ej: S1234 o ETX-1234"
                            fullWidth
                            required
                        />
                        
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                label="Cantidad de Cajas"
                                type="number"
                                value={manualForm.total_qty}
                                onChange={(e) => setManualForm({...manualForm, total_qty: parseInt(e.target.value) || 1})}
                                inputProps={{ min: 1 }}
                                fullWidth
                            />
                            <TextField
                                label="Peso Total (kg)"
                                type="number"
                                value={manualForm.total_weight}
                                onChange={(e) => setManualForm({...manualForm, total_weight: parseFloat(e.target.value) || 0})}
                                inputProps={{ min: 0, step: 0.1 }}
                                fullWidth
                            />
                        </Box>
                        
                        <TextField
                            label="CBM (Volumen)"
                            type="number"
                            value={manualForm.total_cbm}
                            onChange={(e) => setManualForm({...manualForm, total_cbm: parseFloat(e.target.value) || 0})}
                            inputProps={{ min: 0, step: 0.0001 }}
                            fullWidth
                        />
                        
                        <TextField
                            label="Notas (opcional)"
                            value={manualForm.notes}
                            onChange={(e) => setManualForm({...manualForm, notes: e.target.value})}
                            placeholder="Observaciones adicionales..."
                            multiline
                            rows={2}
                            fullWidth
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => {
                        setManualDialog(false);
                        setManualForm({ fno: '', shipping_mark: '', total_qty: 1, total_weight: 0, total_cbm: 0, notes: '' });
                    }}>
                        Cancelar
                    </Button>
                    <Button 
                        variant="contained" 
                        onClick={handleManualCapture}
                        disabled={saving || !manualForm.fno || !manualForm.shipping_mark}
                        sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#d94d1f' } }}
                    >
                        {saving ? <CircularProgress size={20} /> : 'Guardar Recepción'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
