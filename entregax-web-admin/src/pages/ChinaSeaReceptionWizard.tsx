// ============================================
// WIZARD DE RECEPCIÓN POR CONTENEDOR (TDI Marítimo China)
// Por contenedor / BL / referencia (JSM26-XXXX)
// ============================================

import { useState, useEffect, useRef } from 'react';
import {
    Box,
    Button,
    Typography,
    Paper,
    Stepper,
    Step,
    StepLabel,
    TextField,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    Chip,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    CircularProgress,
    IconButton,
    Divider,
    Stack,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    CheckCircle as CheckCircleIcon,
    RadioButtonUnchecked as UncheckedIcon,
    ErrorOutline as ErrorIcon,
    QrCodeScanner as ScannerIcon,
    Refresh as RefreshIcon,
    Warning as WarningIcon,
    DirectionsBoat as BoatIcon,
} from '@mui/icons-material';
import api from '../services/api';

interface Container {
    id: number;
    container_number: string | null;
    bl_number: string | null;
    reference_code: string | null;
    vessel_name: string | null;
    voyage_number: string | null;
    pol: string | null;
    pod: string | null;
    port_of_loading: string | null;
    port_of_discharge: string | null;
    eta: string | null;
    week_number: string | null;
    status: string;
    type: string | null;
    total_packages: number | null;
    total_weight_kg: string | number | null;
    total_cbm: string | number | null;
    created_at: string | null;
    received_at: string | null;
    route_code: string | null;
    total_orders: number;
    received_orders: number;
    missing_orders: number;
}

interface Order {
    id: number;
    ordersn: string;
    shipping_mark: string | null;
    goods_name: string | null;
    goods_num: number | null;
    weight: string | number | null;
    volume: string | number | null;
    status: string;
    last_tracking_status: string | null;
    bl_client_code: string | null;
    bl_client_name: string | null;
    summary_boxes: number | null;
    summary_weight: string | number | null;
    summary_volume: string | number | null;
    missing_on_arrival: boolean;
    user_box_id: string | null;
    user_name: string | null;
}

interface Props {
    onBack: () => void;
    mode?: 'LCL' | 'FCL';
}

const ORANGE = '#FF6B35';
const BLACK = '#1A1A1A';
const RED = '#E53935';
const TEAL = '#0097A7';

export default function ChinaSeaReceptionWizard({ onBack, mode = 'LCL' }: Props) {
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [containers, setContainers] = useState<Container[]>([]);
    const [selected, setSelected] = useState<Container | null>(null);

    const [orders, setOrders] = useState<Order[]>([]);
    const [scanInput, setScanInput] = useState('');
    const [scanFeedback, setScanFeedback] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const [confirmPartialOpen, setConfirmPartialOpen] = useState(false);
    const [result, setResult] = useState<{ new_status: string; received: number; missing: number; total: number } | null>(null);

    useEffect(() => { loadContainers(); }, []);
    useEffect(() => {
        if (step === 1 && inputRef.current) inputRef.current.focus();
    }, [step, orders.length]);

    const loadContainers = async () => {
        setLoading(true); setError(null);
        try {
            const res = await api.get('/admin/china-sea/containers/in-transit');
            const all: Container[] = res.data.containers || [];
            const filtered = all.filter((c) => {
                const week = (c.week_number || '').toString().trim();
                const hasWeek = /week/i.test(week);
                // Regla del negocio:
                //  - LCL (consolidado): tiene week_number "Week X-Y"
                //  - FCL (1 solo cliente): NO tiene week_number
                return mode === 'FCL' ? !hasWeek : hasWeek;
            });
            setContainers(filtered);
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } }; message?: string };
            setError(err.response?.data?.error || err.message || 'Error');
        } finally { setLoading(false); }
    };

    const openContainer = async (c: Container) => {
        setLoading(true); setError(null);
        try {
            const res = await api.get(`/admin/china-sea/containers/${c.id}/orders`);
            setOrders(res.data.orders || []);
            setSelected(c);
            setStep(1);
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } }; message?: string };
            setError(err.response?.data?.error || err.message || 'Error');
        } finally { setLoading(false); }
    };

    const refreshOrders = async () => {
        if (!selected) return;
        try {
            const res = await api.get(`/admin/china-sea/containers/${selected.id}/orders`);
            setOrders(res.data.orders || []);
        } catch { /* noop */ }
    };

    const handleScan = async (value: string) => {
        if (!selected) return;
        let reference = value.trim();
        if (!reference) return;

        // Limpieza básica
        reference = reference.replace(/[\s'_]/g, '').toUpperCase();
        // Si vino una URL, extraer último segmento alfanumérico
        const urlMatch = reference.match(/[A-Z]{2,}\d+[A-Z0-9-]*/);
        if (urlMatch) reference = urlMatch[0];

        try {
            const res = await api.post(`/admin/china-sea/containers/${selected.id}/scan`, { reference });
            if (res.data.already_received) {
                setScanFeedback({ type: 'info', msg: `Ya escaneado: ${res.data.order?.ordersn || reference}` });
            } else {
                setScanFeedback({ type: 'success', msg: `✓ ${res.data.order?.ordersn || reference}` });
            }
            await refreshOrders();
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } }; message?: string };
            setScanFeedback({ type: 'error', msg: err.response?.data?.error || err.message || 'Error' });
        }
        setScanInput('');
    };

    const finalize = async (forcePartial = false) => {
        if (!selected) return;
        const missingCount = orders.filter((o) => o.status !== 'received_mty').length;
        if (missingCount > 0 && !forcePartial) {
            setConfirmPartialOpen(true);
            return;
        }
        setLoading(true); setError(null);
        try {
            const res = await api.post(`/admin/china-sea/containers/${selected.id}/finalize`, { allow_partial: forcePartial });
            setResult({
                new_status: res.data.new_status,
                received: res.data.received,
                missing: res.data.missing,
                total: res.data.total,
            });
            setConfirmPartialOpen(false);
            setStep(2);
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } }; message?: string };
            setError(err.response?.data?.error || err.message || 'Error');
            setConfirmPartialOpen(false);
        } finally { setLoading(false); }
    };

    const resetWizard = () => {
        setStep(0); setSelected(null); setOrders([]); setScanInput('');
        setScanFeedback(null); setResult(null);
        loadContainers();
    };

    const receivedCount = orders.filter((o) => o.status === 'received_mty').length;
    const missingCount = orders.length - receivedCount;

    return (
        <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <IconButton onClick={onBack} size="small"><ArrowBackIcon /></IconButton>
                <BoatIcon sx={{ color: TEAL }} />
                <Typography variant="h5" sx={{ fontWeight: 700, color: TEAL, flex: 1 }}>
                    {mode === 'FCL' ? 'Actualizar Status Full Conteiner' : 'Recibir Contenedor'} · TDI Marítimo China
                </Typography>
                {step === 0 && <IconButton onClick={loadContainers} size="small"><RefreshIcon /></IconButton>}
            </Stack>

            <Stepper activeStep={step} sx={{ mb: 3 }}>
                <Step><StepLabel>Seleccionar contenedor</StepLabel></Step>
                <Step><StepLabel>Escanear órdenes</StepLabel></Step>
                <Step><StepLabel>Confirmar</StepLabel></Step>
            </Stepper>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

            {loading && step === 0 && (
                <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress sx={{ color: TEAL }} /></Box>
            )}

            {/* STEP 0 */}
            {step === 0 && !loading && (
                <Paper variant="outlined">
                    {containers.length === 0 ? (
                        <Box sx={{ p: 4, textAlign: 'center' }}>
                            <Typography color="text.secondary">No hay contenedores pendientes de recepción</Typography>
                        </Box>
                    ) : (
                        <List>
                            {containers.map((c) => {
                                const eta = c.eta;
                                const daysToEta = eta ? Math.floor((new Date(eta).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                                const arrived = daysToEta !== null && daysToEta <= 0;
                                const isPartial = Number(c.received_orders) > 0 && Number(c.received_orders) < Number(c.total_orders);
                                return (
                                    <ListItem
                                        key={c.id}
                                        onClick={() => openContainer(c)}
                                        secondaryAction={
                                            <Stack direction="column" spacing={0.5} alignItems="flex-end">
                                                <Chip
                                                    label={isPartial ? 'PARCIAL' : (arrived ? 'YA EN PUERTO' : 'EN TRÁNSITO')}
                                                    sx={{
                                                        bgcolor: isPartial ? ORANGE : (arrived ? '#2E7D32' : BLACK),
                                                        color: '#FFF',
                                                        fontWeight: 700,
                                                    }}
                                                    size="small"
                                                />
                                                {daysToEta !== null && (
                                                    <Chip
                                                        label={daysToEta > 0 ? `🟡 En ${daysToEta} día${daysToEta === 1 ? '' : 's'}` : daysToEta === 0 ? '🟢 ETA hoy' : `🟢 Llegó hace ${Math.abs(daysToEta)} día${Math.abs(daysToEta) === 1 ? '' : 's'}`}
                                                        size="small"
                                                        color={daysToEta <= 0 ? 'success' : 'warning'}
                                                        sx={{ fontWeight: 700 }}
                                                    />
                                                )}
                                            </Stack>
                                        }
                                        sx={{
                                            cursor: 'pointer',
                                            borderBottom: '1px solid #eee',
                                            py: 1.5,
                                            '&:hover': { bgcolor: '#E0F7FA' },
                                        }}
                                    >
                                        {(() => {
                                            const isFCL = (c.type || '').toUpperCase() === 'FCL';
                                            const count = isFCL ? 1 : Number(c.total_orders || 0);
                                            const label = isFCL ? 'CONTENEDOR' : (count === 1 ? 'LOG' : 'LOGS');
                                            return (
                                                <Box
                                                    sx={{
                                                        minWidth: 92,
                                                        px: 1.5,
                                                        py: 1,
                                                        mr: 2,
                                                        borderRadius: 2,
                                                        bgcolor: TEAL,
                                                        color: '#FFF',
                                                        textAlign: 'center',
                                                        boxShadow: 2,
                                                    }}
                                                >
                                                    <Typography sx={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>
                                                        {count}
                                                    </Typography>
                                                    <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>
                                                        {label}
                                                    </Typography>
                                                </Box>
                                            );
                                        })()}
                                        <ListItemText
                                            primary={
                                                <Typography sx={{ fontWeight: 800, color: TEAL, fontFamily: 'monospace', fontSize: 18 }}>
                                                    {c.reference_code || c.container_number || c.bl_number || '—'}
                                                </Typography>
                                            }
                                            secondary={
                                                Number(c.received_orders) > 0 ? (
                                                    <Chip
                                                        icon={<CheckCircleIcon />}
                                                        label={`${c.received_orders}/${c.total_orders} recibidos`}
                                                        size="small"
                                                        color="success"
                                                        sx={{ mt: 0.5 }}
                                                    />
                                                ) : null
                                            }
                                        />
                                    </ListItem>
                                );
                            })}
                        </List>
                    )}
                </Paper>
            )}

            {/* STEP 1 */}
            {step === 1 && selected && (
                <Box>
                    <Paper sx={{ p: 2, mb: 2, bgcolor: '#E0F7FA', border: `2px solid ${TEAL}` }}>
                        <Typography variant="subtitle2" color="text.secondary">
                            {selected.reference_code} · Contenedor {selected.container_number || '—'}
                            {selected.bl_number && ` · BL ${selected.bl_number}`}
                        </Typography>
                        <Typography variant="h6" sx={{ color: BLACK, fontWeight: 700 }}>
                            {selected.vessel_name || 'Buque sin asignar'}
                            {selected.voyage_number && ` · Viaje ${selected.voyage_number}`}
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                            <Chip label={`Total: ${orders.length}`} size="small" sx={{ bgcolor: BLACK, color: '#FFF', fontWeight: 700 }} />
                            <Chip icon={<CheckCircleIcon />} label={`Escaneadas: ${receivedCount}`} size="small" color="success" />
                            <Chip
                                icon={<ErrorIcon />}
                                label={`Faltantes: ${missingCount}`}
                                size="small"
                                sx={missingCount === 0 ? undefined : { bgcolor: RED, color: '#FFF', fontWeight: 700 }}
                            />
                            {selected.total_weight_kg && (
                                <Chip label={`${Number(selected.total_weight_kg).toFixed(2)} kg`} size="small" variant="outlined" />
                            )}
                            {selected.total_cbm && (
                                <Chip label={`${Number(selected.total_cbm).toFixed(2)} CBM`} size="small" variant="outlined" />
                            )}
                        </Stack>
                    </Paper>

                    <Paper sx={{ p: 2, mb: 2 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <ScannerIcon sx={{ color: TEAL }} />
                            <TextField
                                inputRef={inputRef}
                                fullWidth
                                size="medium"
                                placeholder="Escanear referencia (LOG26CNMX..., shipping mark)..."
                                value={scanInput}
                                onChange={(e) => setScanInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleScan(scanInput); }}
                                autoFocus
                            />
                            <Button
                                variant="contained"
                                onClick={() => handleScan(scanInput)}
                                disabled={!scanInput.trim()}
                                sx={{ bgcolor: TEAL, '&:hover': { bgcolor: '#00838F' } }}
                            >
                                Escanear
                            </Button>
                        </Stack>
                        {scanFeedback && (
                            <Alert severity={scanFeedback.type} sx={{ mt: 1 }} onClose={() => setScanFeedback(null)}>
                                {scanFeedback.msg}
                            </Alert>
                        )}
                    </Paper>

                    <Paper variant="outlined">
                        <List dense>
                            {orders.map((o) => {
                                const isReceived = o.status === 'received_mty';
                                const wasMissing = o.missing_on_arrival === true;
                                return (
                                    <ListItem
                                        key={o.id}
                                        sx={{
                                            bgcolor: isReceived ? '#E8F5E9' : (wasMissing ? '#FFF4E5' : 'transparent'),
                                            borderBottom: '1px solid #eee',
                                        }}
                                    >
                                        <ListItemIcon>
                                            {isReceived
                                                ? <CheckCircleIcon color="success" />
                                                : <UncheckedIcon color={wasMissing ? 'warning' : 'disabled'} />}
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={
                                                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                                    <Typography sx={{ fontWeight: 600, fontFamily: 'monospace' }}>{o.ordersn}</Typography>
                                                    {o.shipping_mark && <Chip label={o.shipping_mark} size="small" variant="outlined" />}
                                                    {o.user_box_id && <Chip label={o.user_box_id} size="small" sx={{ bgcolor: BLACK, color: '#FFF' }} />}
                                                    {isReceived && <Chip label="✓ RECIBIDO" size="small" color="success" />}
                                                    {wasMissing && !isReceived && <Chip label="⏳ ESPERANDO" size="small" color="warning" />}
                                                </Stack>
                                            }
                                            secondary={`${o.goods_num || o.summary_boxes || 0} caja(s) · ${Number(o.weight || 0).toFixed(2)} kg · ${Number(o.volume || 0).toFixed(3)} CBM · status: ${o.status}`}
                                        />
                                    </ListItem>
                                );
                            })}
                        </List>
                    </Paper>

                    <Stack direction="row" spacing={2} sx={{ mt: 3 }} justifyContent="flex-end">
                        <Button onClick={() => setStep(0)} disabled={loading} sx={{ color: BLACK }}>Cancelar</Button>
                        <Button
                            variant="contained"
                            onClick={() => finalize(false)}
                            disabled={loading || receivedCount === 0}
                            sx={{
                                bgcolor: missingCount === 0 ? '#2E7D32' : ORANGE,
                                '&:hover': { bgcolor: missingCount === 0 ? '#1B5E20' : '#E55A28' },
                            }}
                        >
                            {missingCount === 0 ? 'Finalizar recepción completa' : `Finalizar con ${missingCount} faltante(s)`}
                        </Button>
                    </Stack>
                </Box>
            )}

            {/* STEP 2 */}
            {step === 2 && result && (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <CheckCircleIcon sx={{ fontSize: 80, color: result.missing === 0 ? '#2E7D32' : ORANGE }} />
                    <Typography variant="h5" sx={{ mt: 2, fontWeight: 700, color: BLACK }}>
                        {result.missing === 0 ? 'Recepción completa' : 'Recepción parcial registrada'}
                    </Typography>
                    <Typography color="text.secondary" sx={{ mt: 1 }}>
                        {selected?.reference_code} · {selected?.container_number}
                    </Typography>
                    <Divider sx={{ my: 3 }} />
                    <Stack direction="row" spacing={4} justifyContent="center">
                        <Box>
                            <Typography variant="h4" sx={{ color: '#2E7D32' }}>{result.received}</Typography>
                            <Typography variant="caption" color="text.secondary">Recibidas en MTY</Typography>
                        </Box>
                        <Box>
                            <Typography variant="h4" sx={{ color: result.missing === 0 ? 'text.secondary' : RED }}>{result.missing}</Typography>
                            <Typography variant="caption" color="text.secondary">Faltantes</Typography>
                        </Box>
                        <Box>
                            <Typography variant="h4" sx={{ color: BLACK }}>{result.total}</Typography>
                            <Typography variant="caption" color="text.secondary">Total</Typography>
                        </Box>
                    </Stack>
                    {result.missing > 0 && (
                        <Alert severity="warning" sx={{ mt: 3, textAlign: 'left' }}>
                            Se marcaron {result.missing} orden(es) como faltantes. Aparecerán en inventario con la bandera de retraso.
                        </Alert>
                    )}
                    <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 3 }}>
                        <Button variant="outlined" onClick={onBack} sx={{ color: BLACK, borderColor: BLACK }}>Volver al menú</Button>
                        <Button variant="contained" onClick={resetWizard} sx={{ bgcolor: TEAL, '&:hover': { bgcolor: '#00838F' } }}>
                            Recibir otro contenedor
                        </Button>
                    </Stack>
                </Paper>
            )}

            <Dialog open={confirmPartialOpen} onClose={() => setConfirmPartialOpen(false)}>
                <DialogTitle>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <WarningIcon sx={{ color: ORANGE }} />
                        <span>Confirmar recepción parcial</span>
                    </Stack>
                </DialogTitle>
                <DialogContent>
                    <Typography>
                        Faltan <strong>{missingCount}</strong> de {orders.length} orden(es) por escanear.
                    </Typography>
                    <Typography sx={{ mt: 2 }} color="text.secondary">
                        Las órdenes escaneadas quedarán como <strong>recibidas en MTY</strong> y las faltantes se marcarán como <strong>retrasadas</strong>.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmPartialOpen(false)} sx={{ color: BLACK }}>Volver a escanear</Button>
                    <Button
                        variant="contained"
                        onClick={() => finalize(true)}
                        disabled={loading}
                        sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#E55A28' } }}
                    >
                        Confirmar recepción parcial
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
