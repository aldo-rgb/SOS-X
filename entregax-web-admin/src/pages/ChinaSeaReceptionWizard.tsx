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
    Search as SearchIcon,
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
    const [searchQuery, setSearchQuery] = useState('');
    const [selected, setSelected] = useState<Container | null>(null);

    const [orders, setOrders] = useState<Order[]>([]);
    const [scanInput, setScanInput] = useState('');
    const [scanFeedback, setScanFeedback] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const [confirmPartialOpen, setConfirmPartialOpen] = useState(false);
    const [result, setResult] = useState<{ new_status: string; received: number; missing: number; total: number; partial_orders?: number; partial_boxes_missing?: number } | null>(null);

    // Impresión de etiquetas (1 por caja)
    const [labelsModalOpen, setLabelsModalOpen] = useState(false);
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
    // Cajas realmente recibidas por orden (orderId → cantidad). Default = total esperado.
    const [receivedByOrder, setReceivedByOrder] = useState<Record<number, number>>({});
    const [reportingPartial, setReportingPartial] = useState(false);

    const totalBoxesInContainer = orders.reduce((acc, o) => acc + (Number(o.summary_boxes) || Number(o.goods_num) || 0), 0);
    // Para impresión: usa la cantidad recibida (no el total esperado) si fue ajustada
    const selectedBoxesCount = orders
        .filter((o) => selectedOrderIds.has(o.id))
        .reduce((acc, o) => {
            const expected = Number(o.summary_boxes) || Number(o.goods_num) || 0;
            const received = receivedByOrder[o.id];
            return acc + (received !== undefined ? Math.min(received, expected) : expected);
        }, 0);
    // Total de cajas faltantes en las órdenes seleccionadas
    const partialMissingCount = orders
        .filter((o) => selectedOrderIds.has(o.id))
        .reduce((acc, o) => {
            const expected = Number(o.summary_boxes) || Number(o.goods_num) || 0;
            const received = receivedByOrder[o.id];
            if (received === undefined) return acc;
            return acc + Math.max(0, expected - Math.min(received, expected));
        }, 0);

    const openLabelsModal = () => {
        // Por defecto seleccionar todas las órdenes y resetear cantidades
        setSelectedOrderIds(new Set(orders.map((o) => o.id)));
        setReceivedByOrder({});
        setLabelsModalOpen(true);
    };

    const setReceivedForOrder = (orderId: number, value: number, expected: number) => {
        const safe = Math.max(0, Math.min(Math.floor(Number(value) || 0), expected));
        setReceivedByOrder((prev) => ({ ...prev, [orderId]: safe }));
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
            const expected = Number(o.summary_boxes) || Number(o.goods_num) || 1;
            const receivedOverride = receivedByOrder[o.id];
            const boxes = receivedOverride !== undefined ? Math.min(receivedOverride, expected) : expected;
            for (let i = 1; i <= boxes; i++) {
                labels.push({
                    tracking: `${o.ordersn}-${String(i).padStart(4, '0')}`,
                    ordersn: o.ordersn,
                    boxNumber: i,
                    totalBoxes: expected,
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
        }    };

    // Reporta cajas parciales (orden con menos cajas recibidas que esperadas)
    // y notifica a CEDIS / ops_china_sea / admins.
    const reportPartialBoxes = async () => {
        if (!selected) return;
        const payload = orders
            .filter((o) => selectedOrderIds.has(o.id))
            .filter((o) => receivedByOrder[o.id] !== undefined)
            .map((o) => {
                const expected = Number(o.summary_boxes) || Number(o.goods_num) || 0;
                return { order_id: o.id, received_boxes: Math.min(receivedByOrder[o.id], expected) };
            });
        if (payload.length === 0) {
            setScanFeedback({ type: 'info', msg: 'No hay órdenes con cajas faltantes para reportar' });
            return;
        }
        try {
            setReportingPartial(true);
            const res = await api.post(`/admin/china-sea/containers/${selected.id}/report-partial-boxes`, { orders: payload });
            const partialCount = res.data?.partial_orders_count || 0;
            const missingBoxes = res.data?.total_missing_boxes || 0;
            if (partialCount > 0) {
                setScanFeedback({ type: 'success', msg: `Reportado: ${partialCount} orden(es) con ${missingBoxes} caja(s) faltante(s). Notificación enviada.` });
                // Refrescar órdenes para reflejar missing_on_arrival
                await refreshOrders();
            } else {
                setScanFeedback({ type: 'info', msg: 'No hubo cambios — todas las órdenes están completas.' });
            }
        } catch (err) {
            console.error('Error reportando parcial:', err);
            setScanFeedback({ type: 'error', msg: 'Error al reportar cajas faltantes' });
        } finally {
            setReportingPartial(false);
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
        // Calcular cajas faltantes en logs ya escaneados (received_mty pero con receivedVal < expected)
        const partialBoxes = orders
            .filter((o) => receivedByOrder[o.id] !== undefined)
            .map((o) => {
                const expected = Number(o.summary_boxes) || Number(o.goods_num) || 0;
                const received = Math.min(receivedByOrder[o.id], expected);
                return { order_id: o.id, received_boxes: received, expected };
            })
            .filter((p) => p.received_boxes < p.expected);

        const fullyMissing = orders.filter((o) => o.status !== 'received_mty').length;
        const totalMissingBoxes = partialBoxes.reduce((s, p) => s + (p.expected - p.received_boxes), 0);
        const hasIncomplete = fullyMissing > 0 || totalMissingBoxes > 0;

        if (hasIncomplete && !forcePartial) {
            setConfirmPartialOpen(true);
            return;
        }
        setLoading(true); setError(null);
        try {
            // 1) Si hay logs con cajas parciales, reportarlas primero
            if (partialBoxes.length > 0) {
                await api.post(`/admin/china-sea/containers/${selected.id}/report-partial-boxes`, {
                    orders: partialBoxes.map((p) => ({ order_id: p.order_id, received_boxes: p.received_boxes })),
                });
            }
            // 2) Finalizar contenedor (logs sin escanear se marcan como missing_on_arrival)
            const res = await api.post(`/admin/china-sea/containers/${selected.id}/finalize`, { allow_partial: forcePartial });
            setResult({
                new_status: res.data.new_status,
                received: res.data.received,
                missing: res.data.missing,
                total: res.data.total,
                partial_orders: res.data.partial_orders || 0,
                partial_boxes_missing: res.data.partial_boxes_missing || 0,
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
            {step === 0 && !loading && (() => {
                const q = searchQuery.trim().toLowerCase();
                const filteredContainers = q
                    ? containers.filter((c) =>
                        (c.reference_code || '').toLowerCase().includes(q) ||
                        (c.week_number || '').toLowerCase().includes(q) ||
                        (c.container_number || '').toLowerCase().includes(q) ||
                        (c.vessel_name || '').toLowerCase().includes(q) ||
                        (c.voyage_number || '').toLowerCase().includes(q)
                    )
                    : containers;
                return (
                <>
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Buscar por referencia, week, contenedor, buque o viaje…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        InputProps={{ startAdornment: <SearchIcon sx={{ color: TEAL, mr: 1 }} /> }}
                        sx={{ mb: 2, bgcolor: '#FFF' }}
                    />
                    <Paper variant="outlined">
                    {filteredContainers.length === 0 ? (
                        <Box sx={{ p: 4, textAlign: 'center' }}>
                            <Typography color="text.secondary">
                                {containers.length === 0
                                    ? 'No hay contenedores pendientes de recepción'
                                    : 'Sin resultados para la búsqueda'}
                            </Typography>
                        </Box>
                    ) : (
                        <List>
                            {filteredContainers.map((c) => {
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
                                                    {c.reference_code || '—'}
                                                </Typography>
                                            }
                                            secondary={
                                                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                                                    <Chip
                                                        size="small"
                                                        variant="outlined"
                                                        label={`� ${c.week_number || 'Sin week'}`}
                                                        sx={{ fontFamily: 'monospace', fontWeight: 600 }}
                                                    />
                                                    <Chip
                                                        size="small"
                                                        variant="outlined"
                                                        label={`🚢 Contenedor: ${c.container_number || '—'}`}
                                                        sx={{ fontFamily: 'monospace', fontWeight: 600 }}
                                                    />
                                                    {Number(c.received_orders) > 0 && (
                                                        <Chip
                                                            icon={<CheckCircleIcon />}
                                                            label={`${c.received_orders}/${c.total_orders} recibidos`}
                                                            size="small"
                                                            color="success"
                                                        />
                                                    )}
                                                </Stack>
                                            }
                                            secondaryTypographyProps={{ component: 'div' }}
                                        />
                                    </ListItem>
                                );
                            })}
                        </List>
                    )}
                    </Paper>
                </>
                );
            })()}

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
                        <List dense disablePadding>
                            {orders.map((o) => {
                                const isReceived = o.status === 'received_mty';
                                const wasMissing = o.missing_on_arrival === true;
                                const expectedBoxes = Number(o.summary_boxes) || Number(o.goods_num) || 0;
                                const receivedVal = receivedByOrder[o.id] !== undefined
                                    ? receivedByOrder[o.id]
                                    : (wasMissing ? (Number((o as any).received_boxes) || 0) : expectedBoxes);
                                const isPartial = receivedVal < expectedBoxes;
                                return (
                                    <ListItem
                                        key={o.id}
                                        sx={{
                                            bgcolor: wasMissing
                                                ? '#FFEBEE'
                                                : isPartial
                                                ? '#FFF3E0'
                                                : isReceived
                                                ? '#E8F5E9'
                                                : 'transparent',
                                            borderBottom: '1px solid #eee',
                                            py: 1.2,
                                            display: 'grid',
                                            gridTemplateColumns: '40px 1fr auto',
                                            alignItems: 'center',
                                            gap: 1.5,
                                        }}
                                    >
                                        <Box>
                                            {isReceived
                                                ? <CheckCircleIcon color="success" />
                                                : <UncheckedIcon color={wasMissing ? 'error' : 'disabled'} />}
                                        </Box>
                                        <Box sx={{ minWidth: 0 }}>
                                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ rowGap: 0.5 }}>
                                                <Typography sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{o.ordersn}</Typography>
                                                {o.shipping_mark && <Chip label={o.shipping_mark} size="small" variant="outlined" />}
                                                {o.user_box_id && <Chip label={o.user_box_id} size="small" sx={{ bgcolor: BLACK, color: '#FFF' }} />}
                                                {isReceived && !wasMissing && !isPartial && <Chip label="✓ RECIBIDO" size="small" color="success" />}
                                                {wasMissing && (
                                                    <Chip
                                                        label={`⚠️ ${expectedBoxes - receivedVal} caja(s) faltantes`}
                                                        size="small"
                                                        sx={{ bgcolor: RED, color: '#FFF', fontWeight: 700 }}
                                                    />
                                                )}
                                                {isPartial && !wasMissing && (
                                                    <Chip
                                                        label={`Faltan ${expectedBoxes - receivedVal}`}
                                                        size="small"
                                                        sx={{ bgcolor: '#FF9800', color: '#FFF', fontWeight: 700 }}
                                                    />
                                                )}
                                            </Stack>
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.3 }}>
                                                {expectedBoxes} caja(s) · {Number(o.weight || 0).toFixed(2)} kg · {Number(o.volume || 0).toFixed(3)} CBM · {o.status}
                                            </Typography>
                                        </Box>
                                        {expectedBoxes > 0 && (
                                            <Stack
                                                direction="row"
                                                spacing={0.5}
                                                alignItems="center"
                                                sx={{
                                                    bgcolor: '#FFF',
                                                    border: '1px solid #ddd',
                                                    borderRadius: 1,
                                                    px: 0.5,
                                                    py: 0.25,
                                                }}
                                            >
                                                <Button
                                                    size="small"
                                                    onClick={() => setReceivedForOrder(o.id, receivedVal - 1, expectedBoxes)}
                                                    disabled={receivedVal <= 0}
                                                    sx={{ minWidth: 28, p: 0, color: BLACK }}
                                                >
                                                    −
                                                </Button>
                                                <TextField
                                                    size="small"
                                                    type="number"
                                                    value={receivedVal}
                                                    onChange={(e) => setReceivedForOrder(o.id, Number(e.target.value), expectedBoxes)}
                                                    onFocus={(e) => (e.target as HTMLInputElement).select()}
                                                    variant="standard"
                                                    InputProps={{ disableUnderline: true }}
                                                    inputProps={{
                                                        min: 0,
                                                        max: expectedBoxes,
                                                        style: { width: 36, textAlign: 'center', fontWeight: 700, fontSize: 16 },
                                                    }}
                                                />
                                                <Typography variant="caption" color="text.secondary" sx={{ pr: 0.5 }}>
                                                    / {expectedBoxes}
                                                </Typography>
                                                <Button
                                                    size="small"
                                                    onClick={() => setReceivedForOrder(o.id, receivedVal + 1, expectedBoxes)}
                                                    disabled={receivedVal >= expectedBoxes}
                                                    sx={{ minWidth: 28, p: 0, color: BLACK }}
                                                >
                                                    +
                                                </Button>
                                            </Stack>
                                        )}
                                    </ListItem>
                                );
                            })}
                        </List>
                    </Paper>

                    {/* Resumen informativo de cajas faltantes pendientes (se reportan al Finalizar) */}
                    {(() => {
                        const totalMissingBoxes = orders.reduce((acc, o) => {
                            const expected = Number(o.summary_boxes) || Number(o.goods_num) || 0;
                            const received = receivedByOrder[o.id];
                            if (received === undefined) return acc;
                            return acc + Math.max(0, expected - Math.min(received, expected));
                        }, 0);
                        const fullyMissing = orders.filter((o) => o.status !== 'received_mty').length;
                        if (totalMissingBoxes === 0 && fullyMissing === 0) return null;
                        return (
                            <Paper sx={{ p: 2, mt: 2, bgcolor: '#FFF8E1', border: `2px dashed ${ORANGE}` }}>
                                <Typography variant="body2" sx={{ fontWeight: 700, color: ORANGE }}>
                                    ⚠️ Pendientes a reportar al finalizar:
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                    {fullyMissing > 0 && <>• {fullyMissing} log(s) sin escanear (se marcan como completos faltantes)<br /></>}
                                    {totalMissingBoxes > 0 && <>• {totalMissingBoxes} caja(s) faltante(s) en logs específicos<br /></>}
                                    Al dar <strong>Finalizar</strong> se notificará a CEDIS CDMX y Administradores, y aparecerán en "Guías con Retraso".
                                </Typography>
                            </Paper>
                        );
                    })()}

                    <Stack direction="row" spacing={2} sx={{ mt: 3 }} justifyContent="flex-end">
                        <Button onClick={() => setStep(0)} disabled={loading} sx={{ color: BLACK }}>Cancelar</Button>
                        {(() => {
                            const partialBoxes = orders.reduce((acc, o) => {
                                const expected = Number(o.summary_boxes) || Number(o.goods_num) || 0;
                                const received = receivedByOrder[o.id];
                                if (received === undefined) return acc;
                                return acc + Math.max(0, expected - Math.min(received, expected));
                            }, 0);
                            const hasIncomplete = missingCount > 0 || partialBoxes > 0;
                            const label = !hasIncomplete
                                ? 'Finalizar recepción completa'
                                : `Finalizar con ${missingCount > 0 ? `${missingCount} log(s)` : ''}${missingCount > 0 && partialBoxes > 0 ? ' + ' : ''}${partialBoxes > 0 ? `${partialBoxes} caja(s)` : ''} faltante(s)`;
                            return (
                                <Button
                                    variant="contained"
                                    onClick={() => finalize(false)}
                                    disabled={loading || receivedCount === 0}
                                    sx={{
                                        bgcolor: !hasIncomplete ? '#2E7D32' : ORANGE,
                                        '&:hover': { bgcolor: !hasIncomplete ? '#1B5E20' : '#E55A28' },
                                    }}
                                >
                                    {label}
                                </Button>
                            );
                        })()}
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
                                                        {result.missing > 0 && <>Se marcaron <strong>{result.missing}</strong> log(s) como faltantes completos.<br /></>}
                            {(result.partial_boxes_missing || 0) > 0 && <>Se reportaron <strong>{result.partial_boxes_missing}</strong> caja(s) faltante(s) en <strong>{result.partial_orders}</strong> log(s) específico(s).<br /></>}
                            Notificación enviada a CEDIS CDMX y Administradores. Aparecerán en "Guías con Retraso".
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
                                <strong>{selectedOrderIds.size}</strong> de {orders.length} órden(es) · <strong>{selectedBoxesCount}</strong> etiqueta(s)
                                {partialMissingCount > 0 && (
                                    <> · <span style={{ color: RED, fontWeight: 700 }}>{partialMissingCount} caja(s) faltante(s)</span></>
                                )}
                            </Typography>
                            <Button size="small" variant="outlined" onClick={toggleAllOrdersForLabel} sx={{ color: BLACK, borderColor: BLACK }}>
                                {selectedOrderIds.size === orders.length ? 'Quitar todo' : 'Seleccionar todo'}
                            </Button>
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                            💡 Si un log llegó incompleto, ajusta las cajas recibidas. Al dar <strong>Reportar faltantes</strong> se marcarán como retraso y se notificará a CEDIS CDMX y Administradores.
                        </Typography>
                    </Box>
                    <Box sx={{ maxHeight: '60vh', overflow: 'auto' }}>
                        {orders.map((o) => {
                            const checked = selectedOrderIds.has(o.id);
                            const boxes = Number(o.summary_boxes) || Number(o.goods_num) || 1;
                            const receivedVal = receivedByOrder[o.id] !== undefined ? receivedByOrder[o.id] : boxes;
                            const isPartial = receivedVal < boxes;
                            const rowBg = isPartial ? '#FFEBEE' : (checked ? '#E8F5E9' : '#FFF');
                            const rowHover = isPartial ? '#FFCDD2' : (checked ? '#C8E6C9' : '#FAFAFA');
                            return (
                                <Box
                                    key={o.id}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1.5,
                                        px: 2,
                                        py: 1.5,
                                        borderBottom: '1px solid #f0f0f0',
                                        bgcolor: rowBg,
                                        transition: 'background-color 0.15s',
                                        '&:hover': { bgcolor: rowHover },
                                    }}
                                >
                                    {/* Checkbox */}
                                    <Box onClick={() => toggleOrderForLabel(o.id)} sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                        {checked
                                            ? <CheckCircleIcon sx={{ color: '#2E7D32', fontSize: 28 }} />
                                            : <UncheckedIcon sx={{ color: '#BDBDBD', fontSize: 28 }} />}
                                    </Box>

                                    {/* Info */}
                                    <Box onClick={() => toggleOrderForLabel(o.id)} sx={{ cursor: 'pointer', flex: 1, minWidth: 0 }}>
                                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
                                            <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14 }}>{o.ordersn}</Typography>
                                            {o.shipping_mark && <Chip label={o.shipping_mark} size="small" variant="outlined" sx={{ height: 22 }} />}
                                            <Chip
                                                label={isPartial ? `${receivedVal}/${boxes} · faltan ${boxes - receivedVal}` : `${boxes} caja(s)`}
                                                size="small"
                                                sx={{
                                                    height: 22,
                                                    fontWeight: 700,
                                                    bgcolor: isPartial ? RED : TEAL,
                                                    color: '#FFF',
                                                }}
                                            />
                                            {o.missing_on_arrival && <Chip label="⚠ Reportado" size="small" sx={{ height: 22, bgcolor: '#FF9800', color: '#FFF' }} />}
                                        </Stack>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
                                            {o.user_name || o.bl_client_name || '—'}
                                            {o.weight ? ` · ${Number(o.weight).toFixed(2)} kg` : ''}
                                            {o.volume ? ` · ${Number(o.volume).toFixed(3)} CBM` : ''}
                                            {o.goods_name ? ` · ${o.goods_name}` : ''}
                                        </Typography>
                                    </Box>

                                    {/* Stepper compacto */}
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: 0.25,
                                            flexShrink: 0,
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                border: `1.5px solid ${isPartial ? RED : '#CFD8DC'}`,
                                                borderRadius: 1.5,
                                                bgcolor: '#FFF',
                                                overflow: 'hidden',
                                            }}
                                        >
                                            <IconButton
                                                size="small"
                                                onClick={() => setReceivedForOrder(o.id, receivedVal - 1, boxes)}
                                                disabled={receivedVal <= 0}
                                                sx={{ borderRadius: 0, width: 32, height: 32, color: BLACK, fontWeight: 700 }}
                                            >
                                                −
                                            </IconButton>
                                            <TextField
                                                variant="standard"
                                                value={receivedVal}
                                                onChange={(e) => setReceivedForOrder(o.id, Number(e.target.value) || 0, boxes)}
                                                onFocus={(e) => (e.target as HTMLInputElement).select()}
                                                InputProps={{ disableUnderline: true, sx: { fontSize: 16, fontWeight: 700 } }}
                                                inputProps={{
                                                    min: 0,
                                                    max: boxes,
                                                    style: { width: 44, textAlign: 'center', padding: '4px 0', MozAppearance: 'textfield' },
                                                }}
                                                type="number"
                                                sx={{
                                                    '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                                                        WebkitAppearance: 'none',
                                                        margin: 0,
                                                    },
                                                }}
                                            />
                                            <IconButton
                                                size="small"
                                                onClick={() => setReceivedForOrder(o.id, receivedVal + 1, boxes)}
                                                disabled={receivedVal >= boxes}
                                                sx={{ borderRadius: 0, width: 32, height: 32, color: BLACK, fontWeight: 700 }}
                                            >
                                                +
                                            </IconButton>
                                        </Box>
                                        <Typography variant="caption" sx={{ fontSize: 10, color: isPartial ? RED : '#757575', fontWeight: isPartial ? 700 : 400 }}>
                                            de {boxes}
                                        </Typography>
                                    </Box>
                                </Box>
                            );
                        })}
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
                    <Button onClick={() => setLabelsModalOpen(false)} sx={{ color: BLACK }}>Cancelar</Button>
                    <Stack direction="row" spacing={1}>
                        {partialMissingCount > 0 && (
                            <Button
                                variant="contained"
                                onClick={reportPartialBoxes}
                                disabled={reportingPartial}
                                sx={{ bgcolor: RED, '&:hover': { bgcolor: '#B71C1C' } }}
                            >
                                {reportingPartial ? 'Reportando...' : `⚠️ Reportar ${partialMissingCount} caja(s) faltante(s)`}
                            </Button>
                        )}
                        <Button
                            variant="contained"
                            onClick={printContainerLabels}
                            disabled={selectedOrderIds.size === 0 || selectedBoxesCount === 0}
                            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#E64A19' } }}
                        >
                            🖨️ Imprimir {selectedBoxesCount} etiqueta(s)
                        </Button>
                    </Stack>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
