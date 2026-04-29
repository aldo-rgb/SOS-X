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

    // Impresión de etiquetas (1 por caja)
    const [labelsModalOpen, setLabelsModalOpen] = useState(false);
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());

    const totalBoxesInContainer = orders.reduce((acc, o) => acc + (Number(o.summary_boxes) || Number(o.goods_num) || 0), 0);
    const selectedBoxesCount = orders
        .filter((o) => selectedOrderIds.has(o.id))
        .reduce((acc, o) => acc + (Number(o.summary_boxes) || Number(o.goods_num) || 0), 0);

    const openLabelsModal = () => {
        // Por defecto seleccionar todas las órdenes
        setSelectedOrderIds(new Set(orders.map((o) => o.id)));
        setLabelsModalOpen(true);
    };

    const toggleOrderForLabel = (id: number) => {
        setSelectedOrderIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleAllOrdersForLabel = () => {
        if (selectedOrderIds.size === orders.length) {
            setSelectedOrderIds(new Set());
        } else {
            setSelectedOrderIds(new Set(orders.map((o) => o.id)));
        }
    };

    const printContainerLabels = () => {
        if (!selected) return;
        const ordersToPrint = orders.filter((o) => selectedOrderIds.has(o.id));
        if (ordersToPrint.length === 0) {
            setScanFeedback({ type: 'error', msg: 'Selecciona al menos una orden' });
            return;
        }

        // Generar 1 etiqueta por caja
        type Label = {
            tracking: string;
            ordersn: string;
            boxNumber: number;
            totalBoxes: number;
            shippingMark: string;
            weight: string;
            volume: string;
        };

        const labels: Label[] = [];
        ordersToPrint.forEach((o) => {
            const boxes = Number(o.summary_boxes) || Number(o.goods_num) || 1;
            for (let i = 1; i <= boxes; i++) {
                labels.push({
                    tracking: `${o.ordersn}-${String(i).padStart(4, '0')}`,
                    ordersn: o.ordersn,
                    boxNumber: i,
                    totalBoxes: boxes,
                    shippingMark: o.shipping_mark || o.bl_client_code || o.user_box_id || '—',
                    weight: o.weight ? `${Number(o.weight).toFixed(2)} kg` : '',
                    volume: o.volume ? `${Number(o.volume).toFixed(3)} CBM` : '',
                });
            }
        });

        if (labels.length === 0) {
            setScanFeedback({ type: 'error', msg: 'No hay cajas para imprimir' });
            return;
        }

        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) {
            setScanFeedback({ type: 'error', msg: 'Popup bloqueado. Permite popups para imprimir etiquetas.' });
            return;
        }

        // Renderiza una mini-etiqueta (4in × 3in) — caben exactamente 2 por página 4×6
        const renderHalf = (label: Label, idx: number, position: 'top' | 'bottom') => `
            <div class="half ${position}">
                <div class="header">
                    <div class="service">MARÍTIMO</div>
                    <div class="date-badge">${label.boxNumber}/${label.totalBoxes}</div>
                </div>
                <div class="tracking-code">${label.tracking}</div>
                <div class="barcode-section"><svg id="barcode-${idx}"></svg></div>
                <div class="client-mark">${label.shippingMark}</div>
                <div class="details">
                    ${label.volume ? `<span class="detail-item">📐 ${label.volume}</span>` : ''}
                </div>
            </div>`;

        // Empareja etiquetas de a 2 por página (corte exacto a la mitad: 3in)
        const pages: string[] = [];
        for (let i = 0; i < labels.length; i += 2) {
            const top = labels[i];
            const bottom = labels[i + 1];
            const isLast = i + 2 >= labels.length;
            pages.push(`
                <div class="page" style="page-break-after: ${isLast ? 'auto' : 'always'};">
                    ${renderHalf(top, i, 'top')}
                    <div class="cut-line"><span>✂  cortar aquí  ✂</span></div>
                    ${bottom ? renderHalf(bottom, i + 1, 'bottom') : '<div class="half bottom empty"></div>'}
                </div>`);
        }

        try {
            printWindow.document.write(`<!DOCTYPE html><html><head>
                <title>Etiquetas Marítimo - ${selected.reference_code || selected.container_number || ''}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Arial', sans-serif; }
                    .page {
                        width: 4in; height: 6in;
                        margin: 0 auto; position: relative; overflow: hidden;
                    }
                    .half {
                        position: absolute;
                        left: 0; right: 0;
                        padding: 0.18in 0.18in 0.14in 0.18in;
                        display: flex; flex-direction: column; justify-content: space-between;
                        overflow: hidden;
                    }
                    .half.top { top: 0; height: calc(3in + 1cm); }
                    .half.bottom { bottom: 0; height: calc(3in - 1cm); padding-top: 0.45in; }
                    .half.empty { background: transparent; }
                    .cut-line { display: none; }
                    .header { display: flex; justify-content: space-between; align-items: center; }
                    .service { color: #000; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; }
                    .date-badge { color: #000; font-size: 22px; font-weight: 900; }
                    .tracking-code { text-align: center; font-size: 18px; font-weight: bold; letter-spacing: 1px; font-family: 'Courier New', monospace; margin: 2px 0; }
                    .barcode-section { text-align: center; }
                    .barcode-section svg { width: 92%; height: 50px; }
                    .client-mark { text-align: center; font-size: 38px; color: #FF6B35; font-weight: 900; letter-spacing: 2px; line-height: 1; margin: 2px 0; }
                    .details { text-align: center; font-size: 12px; font-weight: 600; display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
                    .detail-item { background: #f5f5f5; padding: 2px 8px; border-radius: 4px; }
                    @page { size: 4in 6in; margin: 0; }
                    @media print {
                        body { margin: 0; padding: 0; }
                        .page { page-break-inside: avoid; overflow: hidden; }
                    }
                </style>
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
            </head><body>${pages.join('')}
            <script>
                ${labels.map((label, i) => `try { JsBarcode("#barcode-${i}", "${label.tracking.replace(/[^A-Z0-9]/gi, '')}", { format: "CODE128", width: 2, height: 50, displayValue: false, margin: 0 }); } catch(e) {}`).join('\n')}
                window.onload = function() { setTimeout(function() { window.print(); }, 600); };
            <\/script></body></html>`);
            printWindow.document.close();
            setLabelsModalOpen(false);
            const pageCount = Math.ceil(labels.length / 2);
            setScanFeedback({ type: 'success', msg: `${labels.length} etiqueta(s) en ${pageCount} hoja(s) 4×6` });
        } catch (err) {
            console.error('Error generando etiquetas:', err);
            setScanFeedback({ type: 'error', msg: 'Error generando etiquetas' });
        }
    };

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
                            <Box sx={{ flex: 1 }} />
                            <Button
                                variant="contained"
                                size="small"
                                onClick={openLabelsModal}
                                disabled={orders.length === 0}
                                sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#E64A19' } }}
                            >
                                🖨️ Imprimir Etiquetas ({totalBoxesInContainer} cajas)
                            </Button>
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
                                            secondary={`${o.summary_boxes || o.goods_num || 0} caja(s) · ${Number(o.weight || 0).toFixed(2)} kg · ${Number(o.volume || 0).toFixed(3)} CBM · status: ${o.status}`}
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

            {/* Modal: Selección de etiquetas para imprimir */}
            <Dialog open={labelsModalOpen} onClose={() => setLabelsModalOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ bgcolor: ORANGE, color: '#FFF', display: 'flex', alignItems: 'center', gap: 1 }}>
                    🖨️ Imprimir Etiquetas · {selected?.reference_code || selected?.container_number || ''}
                </DialogTitle>
                <DialogContent dividers sx={{ p: 0 }}>
                    <Box sx={{ p: 2, bgcolor: '#FFF8E1', borderBottom: '1px solid #FFE082' }}>
                        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" flexWrap="wrap">
                            <Typography variant="body2">
                                <strong>{selectedOrderIds.size}</strong> de {orders.length} órden(es) · <strong>{selectedBoxesCount}</strong> etiqueta(s) a imprimir (1 por caja)
                            </Typography>
                            <Button size="small" variant="outlined" onClick={toggleAllOrdersForLabel} sx={{ color: BLACK, borderColor: BLACK }}>
                                {selectedOrderIds.size === orders.length ? 'Quitar todo' : 'Seleccionar todo'}
                            </Button>
                        </Stack>
                    </Box>
                    <List dense sx={{ maxHeight: '60vh', overflow: 'auto' }}>
                        {orders.map((o) => {
                            const checked = selectedOrderIds.has(o.id);
                            const boxes = Number(o.summary_boxes) || Number(o.goods_num) || 1;
                            return (
                                <ListItem
                                    key={o.id}
                                    onClick={() => toggleOrderForLabel(o.id)}
                                    sx={{
                                        cursor: 'pointer',
                                        borderBottom: '1px solid #f0f0f0',
                                        bgcolor: checked ? '#E8F5E9' : 'transparent',
                                        '&:hover': { bgcolor: checked ? '#C8E6C9' : '#FAFAFA' },
                                    }}
                                >
                                    <ListItemIcon>
                                        {checked
                                            ? <CheckCircleIcon sx={{ color: '#2E7D32' }} />
                                            : <UncheckedIcon sx={{ color: '#999' }} />}
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <Typography sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{o.ordersn}</Typography>
                                                {o.shipping_mark && <Chip label={o.shipping_mark} size="small" variant="outlined" />}
                                                <Chip label={`${boxes} caja(s)`} size="small" sx={{ bgcolor: TEAL, color: '#FFF', fontWeight: 700 }} />
                                            </Stack>
                                        }
                                        secondary={
                                            <Typography variant="caption" color="text.secondary">
                                                {o.user_name || o.bl_client_name || '—'} · {o.weight ? `${Number(o.weight).toFixed(2)} kg` : ''} {o.volume ? `· ${Number(o.volume).toFixed(3)} CBM` : ''}
                                                {o.goods_name ? ` · ${o.goods_name}` : ''}
                                            </Typography>
                                        }
                                    />
                                </ListItem>
                            );
                        })}
                    </List>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setLabelsModalOpen(false)} sx={{ color: BLACK }}>Cancelar</Button>
                    <Button
                        variant="contained"
                        onClick={printContainerLabels}
                        disabled={selectedOrderIds.size === 0 || selectedBoxesCount === 0}
                        sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#E64A19' } }}
                    >
                        🖨️ Imprimir {selectedBoxesCount} etiqueta(s)
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
