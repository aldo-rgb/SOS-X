// ============================================
// NACIONAL MÉXICO — Hub de envíos nacionales
// Tab 1: Cotizaciones
// Tab 2: Paqueterías de Entrega (selector del repartidor)
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Tabs,
    Tab,
    Typography,
    Card,
    CardContent,
    Chip,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Avatar,
    IconButton,
    Alert,
    CircularProgress,
    Stack,
    Switch,
    FormControlLabel,
    Tooltip,
} from '@mui/material';
import {
    LocalShipping as TruckIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    LocalShipping,
    InfoOutlined,
} from '@mui/icons-material';
import QuotesPage from './QuotesPage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Carrier {
    id: number;
    carrier_key: string;
    name: string;
    icon?: string;
    is_active: boolean;
    service_types: string[];
}

interface NewCarrierForm {
    carrier_key: string;
    name: string;
    icon: string;
}

const emptyForm: NewCarrierForm = { carrier_key: '', name: '', icon: '' };

export default function NacionalMexicoPage() {
    const [tab, setTab] = useState(0);
    const [carriers, setCarriers] = useState<Carrier[]>([]);
    const [loading, setLoading] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [form, setForm] = useState<NewCarrierForm>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [deleteId, setDeleteId] = useState<number | null>(null);

    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const fetchCarriers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/admin/carrier-options`, { headers });
            const data = await res.json();
            if (data.success) {
                setCarriers(data.data);
            }
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (tab === 1) fetchCarriers();
    }, [tab, fetchCarriers]);

    const nacionalCarriers = carriers.filter(c => c.service_types?.includes('mx_national'));
    const otherCarriers = carriers.filter(c => !c.service_types?.includes('mx_national'));

    const toggleNacional = async (carrier: Carrier, addToNacional: boolean) => {
        const current: string[] = carrier.service_types || [];
        const updated = addToNacional
            ? [...current, 'mx_national']
            : current.filter(s => s !== 'mx_national');

        try {
            const res = await fetch(`${API_URL}/api/admin/carrier-options/${carrier.id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    carrier_key: carrier.carrier_key,
                    name: carrier.name,
                    icon: carrier.icon,
                    is_active: carrier.is_active,
                    service_types: updated,
                    carrier_type: 'standard',
                }),
            });
            const data = await res.json();
            if (data.success) {
                setSuccess(addToNacional ? `${carrier.name} agregada al selector` : `${carrier.name} removida del selector`);
                fetchCarriers();
                setTimeout(() => setSuccess(''), 3000);
            } else {
                setError(data.error || 'Error al actualizar');
            }
        } catch {
            setError('Error de conexión');
        }
    };

    const handleCreate = async () => {
        if (!form.carrier_key.trim() || !form.name.trim()) {
            setError('Clave y nombre son obligatorios');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const res = await fetch(`${API_URL}/api/admin/carrier-options`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    carrier_key: form.carrier_key.toLowerCase().replace(/\s+/g, '_'),
                    name: form.name,
                    icon: form.icon || null,
                    service_types: ['mx_national'],
                    carrier_type: 'standard',
                    is_active: true,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setSuccess(`${form.name} creada y agregada al selector`);
                setDialogOpen(false);
                setForm(emptyForm);
                fetchCarriers();
                setTimeout(() => setSuccess(''), 3000);
            } else {
                setError(data.error || 'Error al crear paquetería');
            }
        } catch {
            setError('Error de conexión');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await fetch(`${API_URL}/api/admin/carrier-options/${id}`, {
                method: 'DELETE',
                headers,
            });
            fetchCarriers();
            setDeleteId(null);
        } catch {
            setError('Error al eliminar');
        }
    };

    return (
        <Box>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tab label="Cotizaciones" />
                <Tab label="Paqueterías de Entrega" />
            </Tabs>

            {tab === 0 && <QuotesPage />}

            {tab === 1 && (
                <Box sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                        <Box>
                            <Typography variant="h6" fontWeight="bold">
                                🚚 Paqueterías de Entrega
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Las paqueterías habilitadas aquí aparecen en el selector del repartidor al entregar en sucursal de paquetería.
                            </Typography>
                        </Box>
                        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setForm(emptyForm); setError(''); setDialogOpen(true); }}
                            sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#D44E20' } }}>
                            Nueva paquetería
                        </Button>
                    </Box>

                    {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
                    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

                    <Alert severity="info" icon={<InfoOutlined />} sx={{ mb: 3 }}>
                        El repartidor verá este selector cuando entregue un paquete BODEGA en sucursal de paquetería.
                        El status del paquete se marcará como <strong>Enviado</strong> (no Entregado).
                    </Alert>

                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <>
                            {/* Habilitadas para Nacional México */}
                            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                                Habilitadas ({nacionalCarriers.length})
                            </Typography>
                            {nacionalCarriers.length === 0 ? (
                                <Card variant="outlined" sx={{ mb: 3, bgcolor: '#fafafa' }}>
                                    <CardContent sx={{ textAlign: 'center', py: 4 }}>
                                        <LocalShipping sx={{ fontSize: 48, color: '#ccc', mb: 1 }} />
                                        <Typography color="text.secondary">
                                            No hay paqueterías configuradas. Agrega una o habilita una existente.
                                        </Typography>
                                    </CardContent>
                                </Card>
                            ) : (
                                <Stack spacing={1} sx={{ mb: 3 }}>
                                    {nacionalCarriers.map(c => (
                                        <Card key={c.id} variant="outlined" sx={{ borderColor: '#F05A28', bgcolor: '#FFF8F5' }}>
                                            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: '12px !important' }}>
                                                {c.icon ? (
                                                    <Avatar src={c.icon} sx={{ width: 36, height: 36 }} variant="rounded" />
                                                ) : (
                                                    <Avatar sx={{ width: 36, height: 36, bgcolor: '#F05A28' }} variant="rounded">
                                                        <TruckIcon fontSize="small" />
                                                    </Avatar>
                                                )}
                                                <Typography fontWeight="600" sx={{ flex: 1 }}>{c.name}</Typography>
                                                <Chip label="Habilitada" color="success" size="small" />
                                                <Tooltip title="Deshabilitar del selector">
                                                    <Switch
                                                        checked={true}
                                                        onChange={() => toggleNacional(c, false)}
                                                        color="warning"
                                                        size="small"
                                                    />
                                                </Tooltip>
                                                <Tooltip title="Eliminar paquetería">
                                                    <IconButton size="small" color="error" onClick={() => setDeleteId(c.id)}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </Stack>
                            )}

                            {/* Otras paqueterías no asignadas */}
                            {otherCarriers.length > 0 && (
                                <>
                                    <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                                        Otras paqueterías disponibles
                                    </Typography>
                                    <Stack spacing={1}>
                                        {otherCarriers.map(c => (
                                            <Card key={c.id} variant="outlined" sx={{ bgcolor: '#fafafa' }}>
                                                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: '12px !important' }}>
                                                    {c.icon ? (
                                                        <Avatar src={c.icon} sx={{ width: 36, height: 36 }} variant="rounded" />
                                                    ) : (
                                                        <Avatar sx={{ width: 36, height: 36, bgcolor: '#888' }} variant="rounded">
                                                            <TruckIcon fontSize="small" />
                                                        </Avatar>
                                                    )}
                                                    <Typography sx={{ flex: 1 }}>{c.name}</Typography>
                                                    <FormControlLabel
                                                        control={
                                                            <Switch
                                                                checked={false}
                                                                onChange={() => toggleNacional(c, true)}
                                                                size="small"
                                                            />
                                                        }
                                                        label="Habilitar"
                                                        labelPlacement="start"
                                                    />
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </Stack>
                                </>
                            )}
                        </>
                    )}
                </Box>
            )}

            {/* Dialog: Nueva paquetería */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Nueva Paquetería de Entrega</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        {error && <Alert severity="error">{error}</Alert>}
                        <TextField
                            label="Nombre"
                            value={form.name}
                            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                            fullWidth
                            placeholder="Ej: DHL, FedEx, Estafeta"
                        />
                        <TextField
                            label="Clave interna"
                            value={form.carrier_key}
                            onChange={e => setForm(p => ({ ...p, carrier_key: e.target.value }))}
                            fullWidth
                            placeholder="Ej: dhl, fedex, estafeta"
                            helperText="Sin espacios, en minúsculas"
                        />
                        <TextField
                            label="URL de ícono (opcional)"
                            value={form.icon}
                            onChange={e => setForm(p => ({ ...p, icon: e.target.value }))}
                            fullWidth
                            placeholder="https://..."
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
                    <Button variant="contained" onClick={handleCreate} disabled={saving}
                        sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#D44E20' } }}>
                        {saving ? <CircularProgress size={20} /> : 'Crear'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog: Confirmar eliminar */}
            <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)} maxWidth="xs">
                <DialogTitle>¿Eliminar paquetería?</DialogTitle>
                <DialogContent>
                    <Typography>Esta acción no se puede deshacer.</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteId(null)}>Cancelar</Button>
                    <Button color="error" variant="contained" onClick={() => deleteId && handleDelete(deleteId)}>
                        Eliminar
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
