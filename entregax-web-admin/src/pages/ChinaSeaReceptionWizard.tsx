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
    FormControl,
    FormLabel,
    RadioGroup,
    FormControlLabel,
    Radio,
    Select,
    MenuItem,
    InputLabel,
    Grid,
    ToggleButton,
    ToggleButtonGroup,
    Autocomplete,
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

const isReceivedInCedis = (status: string | null | undefined) =>
    status === 'received_mty' || status === 'received_cdmx';

const ORANGE = '#FF6B35';
const BLACK = '#1A1A1A';
const RED = '#E53935';
const TEAL = '#0097A7';

export default function ChinaSeaReceptionWizard({ onBack, mode = 'LCL' }: Props) {
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 🔊 Sonidos de feedback (Web Audio API — sin archivos externos)
    const audioCtxRef = useRef<AudioContext | null>(null);
    const playBeep = (kind: 'success' | 'error' | 'info' | 'complete') => {
        try {
            if (!audioCtxRef.current) {
                const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
                if (!Ctx) return;
                audioCtxRef.current = new Ctx();
            }
            const ctx = audioCtxRef.current;
            if (!ctx) return;
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});

            const playTone = (freq: number, durationMs: number, startOffset: number, gain = 0.18, type: OscillatorType = 'sine') => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = type;
                osc.frequency.value = freq;
                const start = ctx.currentTime + startOffset;
                g.gain.setValueAtTime(0.0001, start);
                g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
                g.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);
                osc.connect(g).connect(ctx.destination);
                osc.start(start);
                osc.stop(start + durationMs / 1000 + 0.02);
            };

            if (kind === 'success') {
                // beep agudo corto (ítem escaneado OK)
                playTone(1200, 90, 0, 0.2, 'sine');
            } else if (kind === 'complete') {
                // dos beeps ascendentes (log completo)
                playTone(1000, 80, 0, 0.2, 'sine');
                playTone(1500, 120, 0.09, 0.2, 'sine');
            } else if (kind === 'info') {
                // beep medio (ya escaneado)
                playTone(700, 120, 0, 0.16, 'sine');
            } else {
                // error: buzz grave doble
                playTone(220, 140, 0, 0.25, 'square');
                playTone(180, 200, 0.15, 0.25, 'square');
            }
        } catch { /* noop */ }
    };

    const [containers, setContainers] = useState<Container[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [selected, setSelected] = useState<Container | null>(null);

    const [orders, setOrders] = useState<Order[]>([]);
    const [scanInput, setScanInput] = useState('');
    const [scanFeedback, setScanFeedback] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const [confirmPartialOpen, setConfirmPartialOpen] = useState(false);
    const [result, setResult] = useState<{ new_status: string; received: number; missing: number; total: number; partial_orders?: number; partial_boxes_missing?: number } | null>(null);

    // FCL: status seleccionado para actualizar el contenedor completo (sin escaneo de cajas)
    const [fclStatus, setFclStatus] = useState<string>('');
    const [fclSaving, setFclSaving] = useState(false);

    // FCL: info de la ruta (operador, placas, teléfono) — se guarda al actualizar status
    const [driverName, setDriverName] = useState('');
    const [driverPlates, setDriverPlates] = useState('');
    const [driverPhone, setDriverPhone] = useState('');
    const [driverCompany, setDriverCompany] = useState('');
    const [driverNotes, setDriverNotes] = useState('');
    // Cuando un contenedor ya tiene ruta asignada (placas / operador / empresa),
    // mostramos un resumen de "ya asignado" y solo entramos en modo edición
    // cuando el usuario explicitamente pulsa "Editar / Reasignar".
    const [editingRoute, setEditingRoute] = useState(false);

    // Historial de cambios de status
    type HistoryEntry = {
        id: number;
        previous_status: string | null;
        new_status: string;
        driver_name: string | null;
        driver_plates: string | null;
        driver_phone: string | null;
        driver_company: string | null;
        notes: string | null;
        changed_by_name: string | null;
        changed_at: string;
    };
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    // Modo de viaje: 'sencillo' (1 contenedor) o 'full' (2 contenedores con mismo operador)
    const [truckMode, setTruckMode] = useState<'sencillo' | 'full'>('sencillo');
    const [secondContainerId, setSecondContainerId] = useState<number | null>(null);

    const loadHistory = async (containerId: number) => {
        setLoadingHistory(true);
        try {
            const r = await api.get(`/maritime/containers/${containerId}/status-history`);
            setHistory(r.data?.history || []);
        } catch {
            setHistory([]);
        } finally {
            setLoadingHistory(false);
        }
    };

    // Catálogo de status válidos para contenedores FCL (debe coincidir con maritimeController.updateContainerStatus)
    const FCL_STATUSES: { value: string; label: string; description: string; icon: string }[] = [
        { value: 'received_origin', label: 'Recibido en origen (China)', description: 'La mercancía fue recibida en bodega de China', icon: '📦' },
        { value: 'consolidated', label: 'Consolidado', description: 'Carga consolidada en el contenedor, lista para embarque', icon: '🧱' },
        { value: 'in_transit', label: 'En tránsito (zarpado)', description: 'El buque ya zarpó hacia México', icon: '🚢' },
        { value: 'arrived_port', label: 'Llegó al puerto destino', description: 'El contenedor ya arribó al puerto en México', icon: '⚓' },
        { value: 'customs_cleared', label: 'Liberado de aduana', description: 'Despacho aduanal completado, listo para movilizar', icon: '🛃' },
        { value: 'in_transit_clientfinal', label: 'En tránsito a destino', description: 'El contenedor va en tránsito hacia el destino del cliente final', icon: '🚛' },
        { value: 'delivered', label: 'Entregado', description: 'Contenedor entregado al cliente final', icon: '✅' },
    ];

    const updateFCLContainerStatus = async () => {
        if (!selected || !fclStatus) return;
        setFclSaving(true);
        setError(null);
        try {
            const payload = {
                status: fclStatus,
                driver_name: driverName.trim() || undefined,
                driver_plates: driverPlates.trim() || undefined,
                driver_phone: driverPhone.trim() || undefined,
                driver_company: driverCompany.trim() || undefined,
                notes: driverNotes.trim() || undefined,
            };
            await api.put(`/maritime/containers/${selected.id}/status`, payload);
            // Si es viaje FULL y hay un segundo contenedor, replicar la misma actualización
            if (truckMode === 'full' && secondContainerId) {
                await api.put(`/maritime/containers/${secondContainerId}/status`, payload);
            }
            setResult({
                new_status: fclStatus,
                received: orders.length,
                missing: 0,
                total: orders.length,
            });
            setStep(2);
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } }; message?: string };
            setError(err.response?.data?.error || err.message || 'Error al actualizar status');
        } finally {
            setFclSaving(false);
        }
    };

    // ─────────── BULK UPDATE FCL (pegar lista de contenedores) ───────────
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkInput, setBulkInput] = useState('');
    const [bulkStatus, setBulkStatus] = useState<string>('');
    const [bulkRunning, setBulkRunning] = useState(false);
    const [bulkResults, setBulkResults] = useState<{
        matched: Container[];
        notFound: string[];
        successes: number[];
        failures: { id: number; ref: string; error: string }[];
    } | null>(null);

    const parseBulkTokens = (raw: string): string[] => {
        // Separa por saltos de línea, comas, punto y coma, tabs, espacios
        const tokens = raw
            .split(/[\s,;\r\n\t]+/)
            .map((t) => t.trim())
            .filter((t) => t.length >= 4); // mínimo 4 chars para evitar basura
        // Deduplicar manteniendo orden
        const seen = new Set<string>();
        const out: string[] = [];
        for (const t of tokens) {
            const key = t.toUpperCase();
            if (!seen.has(key)) { seen.add(key); out.push(t); }
        }
        return out;
    };

    const previewBulk = () => {
        const tokens = parseBulkTokens(bulkInput);
        const matched: Container[] = [];
        const notFound: string[] = [];
        const matchedIds = new Set<number>();
        for (const tk of tokens) {
            const tkU = tk.toUpperCase();
            const hit = containers.find((c) => {
                if (matchedIds.has(c.id)) return false;
                return (
                    (c.container_number || '').toUpperCase() === tkU ||
                    (c.bl_number || '').toUpperCase() === tkU ||
                    (c.reference_code || '').toUpperCase() === tkU
                );
            });
            if (hit) {
                matchedIds.add(hit.id);
                matched.push(hit);
            } else {
                notFound.push(tk);
            }
        }
        setBulkResults({ matched, notFound, successes: [], failures: [] });
    };

    const runBulkUpdate = async () => {
        if (!bulkResults || !bulkStatus || bulkResults.matched.length === 0) return;
        setBulkRunning(true);
        setError(null);
        const successes: number[] = [];
        const failures: { id: number; ref: string; error: string }[] = [];
        for (const c of bulkResults.matched) {
            try {
                await api.put(`/maritime/containers/${c.id}/status`, { status: bulkStatus });
                successes.push(c.id);
            } catch (e) {
                const err = e as { response?: { data?: { error?: string } }; message?: string };
                failures.push({
                    id: c.id,
                    ref: c.reference_code || c.container_number || `#${c.id}`,
                    error: err.response?.data?.error || err.message || 'Error',
                });
            }
        }
        // Actualizar el status local en los matched para reflejar el nuevo valor en la UI
        const updatedMatched = bulkResults.matched.map((c) =>
            successes.includes(c.id) ? { ...c, status: bulkStatus } : c
        );
        setBulkResults({ ...bulkResults, matched: updatedMatched, successes, failures });
        // También mutar la lista principal para que los chips reflejen el nuevo status sin esperar al refetch
        setContainers((prev) => prev.map((c) => (successes.includes(c.id) ? { ...c, status: bulkStatus } : c)));
        setBulkRunning(false);
        // Recargar lista al terminar (autoritativa desde backend)
        await loadContainers();
    };

    const resetBulk = () => {
        setBulkOpen(false);
        setBulkInput('');
        setBulkStatus('');
        setBulkResults(null);
        setBulkRunning(false);
    };

    // Tracking de cajas escaneadas por orden (orderId -> Set de números de caja en formato '0001')
    const [scannedBoxesByOrder, setScannedBoxesByOrder] = useState<Record<number, Set<string>>>({});
    // Orden actualmente expandida (la última escaneada)
    const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

    // Impresión de etiquetas (1 por caja)
    const [labelsModalOpen, setLabelsModalOpen] = useState(false);
    const [labelFormat, setLabelFormat] = useState<'4x6' | '4x2'>('4x2');
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
        // Por defecto seleccionar solo órdenes PENDIENTES.
        // Las ya recibidas en CEDIS deben aparecer deseleccionadas.
        const pendingIds = orders
            .filter((o) => !isReceivedInCedis(o.status))
            .map((o) => o.id);
        setSelectedOrderIds(new Set(pendingIds));
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
        const pendingIds = orders
            .filter((o) => !isReceivedInCedis(o.status))
            .map((o) => o.id);

        const allPendingSelected = pendingIds.length > 0 && pendingIds.every((id) => selectedOrderIds.has(id));

        if (allPendingSelected) {
            setSelectedOrderIds(new Set());
        } else {
            setSelectedOrderIds(new Set(pendingIds));
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
            referenceDigits: string;
            weight: string;
            volume: string;
        };

        const labels: Label[] = [];
        const getReferenceDigits = (value: string | null | undefined) => {
            const digits = String(value || '').match(/\d+/g)?.join('') || '';
            return digits || '0000';
        };
        ordersToPrint.forEach((o) => {
            const expected = Number(o.summary_boxes) || Number(o.goods_num) || 1;
            const receivedOverride = receivedByOrder[o.id];
            const boxes = receivedOverride !== undefined ? Math.min(receivedOverride, expected) : expected;
            const shippingMark = o.shipping_mark || o.bl_client_code || o.user_box_id || '—';
            for (let i = 1; i <= boxes; i++) {
                labels.push({
                    tracking: `${o.ordersn}-${String(i).padStart(4, '0')}`,
                    ordersn: o.ordersn,
                    boxNumber: i,
                    totalBoxes: expected,
                    shippingMark,
                    referenceDigits: getReferenceDigits(shippingMark),
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

        // ───────── Layout 4×6 (2 etiquetas por hoja) ─────────
        const renderHalf = (label: Label, idx: number, position: 'top' | 'bottom') => `
            <div class="half ${position}">
                <div class="header">
                    <div class="service-block">
                        <div class="service">MARÍTIMO</div>
                        <div class="service-ref">${label.referenceDigits}</div>
                    </div>
                    <div class="date-badge">${label.boxNumber}/${label.totalBoxes}</div>
                </div>
                <div class="tracking-code">${label.tracking}</div>
                <div class="barcode-section"><svg id="barcode-${idx}"></svg></div>
                <div class="client-mark">${label.shippingMark}</div>
                <div class="details">
                    ${label.volume ? `<span class="detail-item">📐 ${label.volume}</span>` : ''}
                </div>
            </div>`;

        // ───────── Layout 4×2 (1 etiqueta compacta por hoja) ─────────
        const renderSingle4x2 = (label: Label, idx: number) => `
            <div class="page-4x2" style="page-break-after: ${idx === labels.length - 1 ? 'auto' : 'always'};">
                <div class="row-top">
                    <span class="svc">MARÍTIMO <span class="svc-ref">${label.referenceDigits}</span></span>
                    <span class="box-n">${label.boxNumber}/${label.totalBoxes}</span>
                </div>
                <div class="mark">${label.shippingMark}</div>
                <div class="barcode-wrap"><svg id="barcode-${idx}"></svg></div>
                <div class="trk">${label.tracking}</div>
            </div>`;

        let pagesHtml = '';
        let pageCount = 0;
        let pageStyle = '';

        if (labelFormat === '4x2') {
            pagesHtml = labels.map((l, i) => renderSingle4x2(l, i)).join('');
            pageCount = labels.length;
            // Página 4in × 2in (landscape) — tú configuras la impresora a 4×2 horizontal
            pageStyle = `
                @page { size: 4in 2in; margin: 0; }
                .page-4x2 {
                    width: 4in; height: 2in;
                    padding: 0.08in 0.12in;
                    display: flex; flex-direction: column; justify-content: space-between;
                    overflow: hidden; box-sizing: border-box;
                }
                .row-top { display: flex; justify-content: space-between; align-items: center; }
                .svc { font-size: 10px; font-weight: 700; letter-spacing: 0.5px; display: flex; align-items: baseline; gap: 6px; }
                .svc-ref { font-size: 24px; font-weight: 900; color: #FF6B35; letter-spacing: 1px; line-height: 1; }
                .box-n { font-size: 18px; font-weight: 900; }
                .mark { text-align: center; font-size: 32px; color: #FF6B35; font-weight: 900; letter-spacing: 1px; line-height: 1; margin: 0.04in 0; }
                .barcode-wrap { text-align: center; }
                .barcode-wrap svg { width: 95%; height: 0.55in; }
                .trk { text-align: center; font-size: 12px; font-weight: bold; font-family: 'Courier New', monospace; letter-spacing: 0.5px; line-height: 1; }
            `;
        } else {
            // Empareja etiquetas de a 2 por página 4×6
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
            pagesHtml = pages.join('');
            pageCount = Math.ceil(labels.length / 2);
            pageStyle = `
                @page { size: 4in 6in; margin: 0; }
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
                .service-block { display: flex; align-items: baseline; gap: 8px; }
                .service { color: #000; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; }
                .service-ref { color: #FF6B35; font-size: 30px; font-weight: 900; letter-spacing: 1px; line-height: 1; }
                .date-badge { color: #000; font-size: 22px; font-weight: 900; }
                .tracking-code { text-align: center; font-size: 18px; font-weight: bold; letter-spacing: 1px; font-family: 'Courier New', monospace; margin: 2px 0; }
                .barcode-section { text-align: center; }
                .barcode-section svg { width: 92%; height: 50px; }
                .client-mark { text-align: center; font-size: 38px; color: #FF6B35; font-weight: 900; letter-spacing: 2px; line-height: 1; margin: 2px 0; }
                .details { text-align: center; font-size: 12px; font-weight: 600; display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
                .detail-item { background: #f5f5f5; padding: 2px 8px; border-radius: 4px; }
            `;
        }

        const barcodeHeight = labelFormat === '4x2' ? 36 : 50;
        const barcodeWidth = labelFormat === '4x2' ? 1.6 : 2;

        try {
            printWindow.document.write(`<!DOCTYPE html><html><head>
                <title>Etiquetas Marítimo - ${selected.reference_code || selected.container_number || ''}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Arial', sans-serif; }
                    ${pageStyle}
                    @media print {
                        body { margin: 0; padding: 0; }
                        .page, .page-4x2 { page-break-inside: avoid; overflow: hidden; }
                    }
                </style>
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
            </head><body>${pagesHtml}
            <script>
                ${labels.map((label, i) => `try { JsBarcode("#barcode-${i}", "${label.tracking.replace(/[^A-Z0-9]/gi, '')}", { format: "CODE128", width: ${barcodeWidth}, height: ${barcodeHeight}, displayValue: false, margin: 0 }); } catch(e) {}`).join('\n')}
                window.onload = function() { setTimeout(function() { window.print(); }, 600); };
            <\/script></body></html>`);
            printWindow.document.close();
            setLabelsModalOpen(false);
            setScanFeedback({ type: 'success', msg: `${labels.length} etiqueta(s) en ${pageCount} hoja(s) ${labelFormat === '4x2' ? '4×2' : '4×6'}` });
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
            setScannedBoxesByOrder({});
            setExpandedOrderId(null);
            setReceivedByOrder({});
            // Pre-cargar info de ruta (si existe en el contenedor)
            setDriverName((c as any).driver_name || '');
            setDriverPlates((c as any).driver_plates || '');
            setDriverPhone((c as any).driver_phone || '');
            setDriverCompany((c as any).driver_company || '');
            setDriverNotes('');
            setEditingRoute(false);
            setTruckMode('sencillo');
            setSecondContainerId(null);
            // Preseleccionar "En tránsito a destino" por ser el flujo más común
            setFclStatus('in_transit_clientfinal');
            // Cargar historial en paralelo
            loadHistory(c.id);
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
        // Si vino una URL, extraer último segmento alfanumérico (con posible -NNNN)
        const urlMatch = reference.match(/[A-Z]{2,}\d+[A-Z0-9-]*/);
        if (urlMatch) reference = urlMatch[0];

        // Detectar patrón LOG...-NNNN (caja individual con guión)
        const boxMatch = reference.match(/^(.+?)-(\d{1,4})$/);
        let parentRef = boxMatch ? boxMatch[1] : reference;
        let boxNumber = boxMatch ? boxMatch[2].padStart(4, '0') : null;

        // 🔍 Si NO trae guión pero parece un LOG, intentar detectar el sufijo de caja compacto
        // probando recortar 1, 2, 3 o 4 dígitos finales y ver si el prefijo coincide con algún
        // ordersn de la lista local. Esto evita que el barcode "LOG26CNMX021420001" (sin guión)
        // sea tratado como un escaneo de master y marque el log completo de un solo escaneo.
        if (!boxMatch && /^LOG/i.test(reference)) {
            for (const len of [4, 3, 2, 1]) {
                if (reference.length <= len + 6) continue; // necesita un prefijo razonable
                const candidateMaster = reference.slice(0, -len);
                const candidateBox = reference.slice(-len);
                const found = orders.find(
                    (o) => (o.ordersn || '').toUpperCase() === candidateMaster.toUpperCase()
                );
                if (found) {
                    parentRef = candidateMaster;
                    boxNumber = candidateBox.padStart(4, '0');
                    break;
                }
            }
        }

        // Buscar orden localmente por ordersn
        const matchedOrder = orders.find((o) => (o.ordersn || '').toUpperCase() === parentRef.toUpperCase());

        // 🔒 Si el escaneo trae número de caja (-NNNN) FORZAR tracking por caja.
        // Nunca caer al fallback que marca el log entero como recibido.
        if (boxNumber) {
            if (!matchedOrder) {
                playBeep('error');
                setScanFeedback({ type: 'error', msg: `❌ Log ${parentRef} no pertenece a este contenedor` });
                setScanInput('');
                return;
            }
            // Escaneo por caja: tracking local
            const expected = Number(matchedOrder.summary_boxes) || Number(matchedOrder.goods_num) || 0;
            const boxNum = parseInt(boxNumber, 10);
            if (expected > 0 && boxNum > expected) {
                playBeep('error');
                setScanFeedback({ type: 'error', msg: `⚠️ Caja ${boxNum} fuera de rango (${matchedOrder.ordersn} solo tiene ${expected} caja(s))` });
                setScanInput('');
                return;
            }
            // Si el log ya estaba marcado como recibido en backend, sembrar el set con todas las cajas previas (excepto las pendientes de re-escanear)
            const prevSet = scannedBoxesByOrder[matchedOrder.id] || new Set<string>();
            if (prevSet.has(boxNumber)) {
                playBeep('info');
                setScanFeedback({ type: 'info', msg: `ℹ️ Caja ${boxNum} de ${matchedOrder.ordersn} ya escaneada` });
                setExpandedOrderId(matchedOrder.id);
                setScanInput('');
                return;
            }
            const nextSet = new Set(prevSet);
            nextSet.add(boxNumber);
            setScannedBoxesByOrder((prev) => ({ ...prev, [matchedOrder.id]: nextSet }));
            setReceivedByOrder((prev) => ({ ...prev, [matchedOrder.id]: nextSet.size }));
            setExpandedOrderId(matchedOrder.id);

            const remaining = expected - nextSet.size;
            if (expected > 0 && remaining === 0) {
                // Todas las cajas escaneadas → marcar como recibido en backend (usando ordersn limpio, sin sufijo)
                try {
                    await api.post(`/admin/china-sea/containers/${selected.id}/scan`, { reference: matchedOrder.ordersn });
                    playBeep('complete');
                    setScanFeedback({ type: 'success', msg: `✅ ${matchedOrder.ordersn} completo (${nextSet.size}/${expected})` });
                    await refreshOrders();
                } catch (e) {
                    const err = e as { response?: { data?: { error?: string } }; message?: string };
                    playBeep('error');
                    setScanFeedback({ type: 'error', msg: err.response?.data?.error || err.message || 'Error al marcar como recibido' });
                }
            } else {
                playBeep('success');
                setScanFeedback({ type: 'success', msg: `✓ Caja ${boxNum} de ${matchedOrder.ordersn} · ${nextSet.size}/${expected} (faltan ${remaining})` });
            }
            setScanInput('');
            return;
        }

        // Sin número de caja: requerir confirmación explícita para marcar log completo de un solo escaneo.
        // Si la orden existe en la lista local y tiene > 1 caja, NO permitir marcado completo: forzar escaneo por caja.
        if (matchedOrder) {
            const expected = Number(matchedOrder.summary_boxes) || Number(matchedOrder.goods_num) || 0;
            if (expected !== 1) {
                playBeep('error');
                const expectedLabel = expected > 1 ? `${expected} cajas` : 'múltiples cajas (cantidad no definida)';
                const rangeHint = expected > 1
                    ? `Escanea cada caja individualmente (${matchedOrder.ordersn}-0001 ... ${matchedOrder.ordersn}-${String(expected).padStart(4, '0')})`
                    : `Escanea cada guía hija individualmente (${matchedOrder.ordersn}-0001, ${matchedOrder.ordersn}-0002, ...)`;
                setScanFeedback({
                    type: 'error',
                    msg: `⚠️ ${matchedOrder.ordersn} tiene ${expectedLabel}. ${rangeHint}`,
                });
                setExpandedOrderId(matchedOrder.id);
                setScanInput('');
                return;
            }
            // expected === 1 → se permite marcar como recibido directo (un solo box)
        }

        // Sin número de caja y log de 1 sola caja (o no encontrado localmente): flujo legado contra backend
        try {
            const res = await api.post(`/admin/china-sea/containers/${selected.id}/scan`, { reference: parentRef });
            const orderData = res.data.order;
            if (orderData) {
                // Solo si existe localmente y tiene <= 1 caja, sembrar el set como completo.
                const localOrder = orders.find((o) => o.id === orderData.id || (o.ordersn || '').toUpperCase() === (orderData.ordersn || '').toUpperCase());
                if (localOrder) {
                    const expected = Number(localOrder.summary_boxes) || Number(localOrder.goods_num) || 1;
                    if (expected <= 1) {
                        const allBoxes = new Set<string>();
                        for (let i = 1; i <= expected; i++) allBoxes.add(String(i).padStart(4, '0'));
                        setScannedBoxesByOrder((prev) => ({ ...prev, [localOrder.id]: allBoxes }));
                        setReceivedByOrder((prev) => ({ ...prev, [localOrder.id]: expected }));
                    }
                    setExpandedOrderId(localOrder.id);
                }
            }
            if (res.data.already_received) {
                playBeep('info');
                setScanFeedback({ type: 'info', msg: `Ya escaneado: ${orderData?.ordersn || reference}` });
            } else {
                playBeep('complete');
                setScanFeedback({ type: 'success', msg: `✓ ${orderData?.ordersn || reference}` });
            }
            await refreshOrders();
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } }; message?: string };
            playBeep('error');
            setScanFeedback({ type: 'error', msg: err.response?.data?.error || err.message || 'Error' });
        }
        setScanInput('');
    };

    const finalize = async (forcePartial = false) => {
        if (!selected) return;
        // Calcular cajas faltantes en logs ya escaneados (recibidos en CEDIS pero con receivedVal < expected)
        const partialBoxes = orders
            .filter((o) => receivedByOrder[o.id] !== undefined)
            .map((o) => {
                const expected = Number(o.summary_boxes) || Number(o.goods_num) || 0;
                const received = Math.min(receivedByOrder[o.id], expected);
                return { order_id: o.id, received_boxes: received, expected };
            })
            .filter((p) => p.received_boxes < p.expected);

        const fullyMissing = orders.filter((o) => !isReceivedInCedis(o.status)).length;
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

    const receivedCount = orders.filter((o) => isReceivedInCedis(o.status)).length;
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
                const byStatus = statusFilter === 'all'
                    ? containers
                    : containers.filter((c) => (c.status || '') === statusFilter);
                const filteredContainers = q
                    ? byStatus.filter((c) =>
                        (c.reference_code || '').toLowerCase().includes(q) ||
                        (c.week_number || '').toLowerCase().includes(q) ||
                        (c.container_number || '').toLowerCase().includes(q) ||
                        (c.vessel_name || '').toLowerCase().includes(q) ||
                        (c.voyage_number || '').toLowerCase().includes(q)
                    )
                    : byStatus;
                // Conteo por status sobre el universo completo (sin texto, sin filtro)
                const statusCounts: Record<string, number> = containers.reduce((acc, c) => {
                    const k = c.status || 'unknown';
                    acc[k] = (acc[k] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>);
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
                    <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
                        <Chip
                            label={`Todos (${containers.length})`}
                            onClick={() => setStatusFilter('all')}
                            sx={{
                                fontWeight: 700,
                                bgcolor: statusFilter === 'all' ? TEAL : '#ECEFF1',
                                color: statusFilter === 'all' ? '#FFF' : BLACK,
                                '&:hover': { bgcolor: statusFilter === 'all' ? '#00838F' : '#CFD8DC' },
                            }}
                        />
                        {FCL_STATUSES.map((s) => {
                            const count = statusCounts[s.value] || 0;
                            const isActive = statusFilter === s.value;
                            return (
                                <Chip
                                    key={s.value}
                                    label={`${s.icon} ${s.label} (${count})`}
                                    onClick={() => setStatusFilter(s.value)}
                                    disabled={count === 0}
                                    sx={{
                                        fontWeight: 700,
                                        bgcolor: isActive ? ORANGE : '#FFF',
                                        color: isActive ? '#FFF' : BLACK,
                                        border: `1px solid ${isActive ? ORANGE : '#CFD8DC'}`,
                                        '&:hover': { bgcolor: isActive ? '#E64A19' : '#FFF3E0' },
                                    }}
                                />
                            );
                        })}
                    </Stack>
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
                                const isPartial = Number(c.received_orders) > 0 && Number(c.received_orders) < Number(c.total_orders);

                                // Etiqueta y color basados en el status real del contenedor
                                const statusBadgeMap: Record<string, { label: string; bg: string }> = {
                                    received_origin: { label: 'EN ORIGEN', bg: '#546E7A' },
                                    consolidated: { label: 'CONSOLIDADO', bg: '#37474F' },
                                    in_transit: { label: 'EN TRÁNSITO', bg: BLACK },
                                    arrived_port: { label: 'YA EN PUERTO', bg: '#2E7D32' },
                                    customs_cleared: { label: 'LIBERADO ADUANA', bg: '#1565C0' },
                                    in_transit_clientfinal: { label: 'EN TRÁNSITO A DESTINO', bg: '#E65100' },
                                    delivered: { label: 'ENTREGADO', bg: '#1B5E20' },
                                };
                                const statusBadge = statusBadgeMap[c.status] || { label: (c.status || 'SIN STATUS').toUpperCase(), bg: BLACK };
                                return (
                                    <ListItem
                                        key={c.id}
                                        onClick={() => openContainer(c)}
                                        secondaryAction={
                                            <Stack direction="column" spacing={0.5} alignItems="flex-end">
                                                <Chip
                                                    label={isPartial ? 'PARCIAL' : statusBadge.label}
                                                    sx={{
                                                        bgcolor: isPartial ? ORANGE : statusBadge.bg,
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
            {step === 1 && selected && mode === 'FCL' && (
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
                            <Chip label={`Status actual: ${FCL_STATUSES.find((s) => s.value === selected.status)?.label || selected.status || '—'}`} size="small" sx={{ bgcolor: BLACK, color: '#FFF', fontWeight: 700 }} />
                            {selected.total_weight_kg && (
                                <Chip label={`${Number(selected.total_weight_kg).toFixed(2)} kg`} size="small" variant="outlined" />
                            )}
                            {selected.total_cbm && (
                                <Chip label={`${Number(selected.total_cbm).toFixed(2)} CBM`} size="small" variant="outlined" />
                            )}
                        </Stack>
                    </Paper>

                    <Paper sx={{ p: 3, mb: 2 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: TEAL, mb: 0.5 }}>
                            Selecciona el nuevo status del contenedor
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Al actualizar, se notificará al cliente final y se sincronizarán todos los envíos asociados al contenedor.
                        </Typography>

                        <FormControl fullWidth size="medium" sx={{ mb: 2 }}>
                            <InputLabel id="fcl-status-select-label">Status del contenedor</InputLabel>
                            <Select
                                labelId="fcl-status-select-label"
                                value={fclStatus}
                                label="Status del contenedor"
                                onChange={(e) => setFclStatus(e.target.value as string)}
                            >
                                {FCL_STATUSES.map((s) => {
                                    const isCurrent = selected.status === s.value;
                                    return (
                                        <MenuItem key={s.value} value={s.value}>
                                            <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                                                <Typography sx={{ fontWeight: 600 }}>
                                                    {s.icon} {s.label}
                                                </Typography>
                                                {isCurrent && (
                                                    <Chip label="actual" size="small" sx={{ bgcolor: '#9E9E9E', color: '#FFF', height: 18, fontSize: 10 }} />
                                                )}
                                            </Stack>
                                        </MenuItem>
                                    );
                                })}
                            </Select>
                        </FormControl>

                        {fclStatus && (
                            <Alert severity="info" sx={{ mb: 2 }}>
                                {FCL_STATUSES.find((s) => s.value === fclStatus)?.description}
                            </Alert>
                        )}

                        {/* Info de la ruta hacia destino (operador / placas / teléfono) */}
                        {(() => {
                            const hasAssignedRoute = !!((driverName && driverName.trim()) || (driverPlates && driverPlates.trim()) || (driverPhone && driverPhone.trim()) || (driverCompany && driverCompany.trim()));
                            if (hasAssignedRoute && !editingRoute) {
                                return (
                                    <Box sx={{ mt: 2, p: 2, bgcolor: '#E8F5E9', borderRadius: 2, border: `1px solid #4CAF50` }}>
                                        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 1, flexWrap: 'wrap' }}>
                                            <Typography sx={{ fontWeight: 700, color: '#2E7D32' }}>
                                                ✅ Ruta ya asignada
                                            </Typography>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                onClick={() => setEditingRoute(true)}
                                                sx={{ borderColor: ORANGE, color: ORANGE, fontWeight: 700, '&:hover': { borderColor: '#E64A19', bgcolor: '#FFF3E0' } }}
                                            >
                                                ✏️ Editar / Reasignar
                                            </Button>
                                        </Stack>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                                            Este contenedor ya cuenta con datos de operador y unidad. Si necesitas cambiarlos, pulsa "Editar / Reasignar".
                                        </Typography>
                                        <Grid container spacing={1.5}>
                                            {driverCompany && (
                                                <Grid size={{ xs: 12 }}>
                                                    <Typography variant="caption" color="text.secondary">Empresa transportista</Typography>
                                                    <Typography sx={{ fontWeight: 700 }}>{driverCompany}</Typography>
                                                </Grid>
                                            )}
                                            {driverName && (
                                                <Grid size={{ xs: 12, sm: 6 }}>
                                                    <Typography variant="caption" color="text.secondary">Operador</Typography>
                                                    <Typography sx={{ fontWeight: 700 }}>{driverName}</Typography>
                                                </Grid>
                                            )}
                                            {driverPlates && (
                                                <Grid size={{ xs: 12, sm: 6 }}>
                                                    <Typography variant="caption" color="text.secondary">Placas</Typography>
                                                    <Typography sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{driverPlates}</Typography>
                                                </Grid>
                                            )}
                                            {driverPhone && (
                                                <Grid size={{ xs: 12, sm: 6 }}>
                                                    <Typography variant="caption" color="text.secondary">Teléfono</Typography>
                                                    <Typography sx={{ fontWeight: 700 }}>{driverPhone}</Typography>
                                                </Grid>
                                            )}
                                        </Grid>
                                    </Box>
                                );
                            }
                            return (
                        <Box sx={{ mt: 2, p: 2, bgcolor: '#FFF8E1', borderRadius: 2, border: `1px dashed ${ORANGE}` }}>
                            <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 1, flexWrap: 'wrap' }}>
                                <Typography sx={{ fontWeight: 700, color: ORANGE }}>
                                    🚛 Información de ruta hacia destino
                                </Typography>
                                <ToggleButtonGroup
                                    value={truckMode}
                                    exclusive
                                    size="small"
                                    onChange={(_, v) => { if (v) { setTruckMode(v); if (v === 'sencillo') setSecondContainerId(null); } }}
                                >
                                    <ToggleButton value="sencillo" sx={{ fontWeight: 700, '&.Mui-selected': { bgcolor: TEAL, color: '#FFF', '&:hover': { bgcolor: '#00838F' } } }}>
                                        🚚 Sencillo
                                    </ToggleButton>
                                    <ToggleButton value="full" sx={{ fontWeight: 700, '&.Mui-selected': { bgcolor: ORANGE, color: '#FFF', '&:hover': { bgcolor: '#E64A19' } } }}>
                                        🚛 Full (2 contenedores)
                                    </ToggleButton>
                                </ToggleButtonGroup>
                            </Stack>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                                Captura los datos del operador y la unidad. Quedan registrados en el historial del contenedor para consulta posterior.
                                {truckMode === 'full' && ' En modo Full la misma actualización se aplica a ambos contenedores.'}
                            </Typography>

                            {truckMode === 'full' && (
                                <Box sx={{ mb: 2, p: 1.5, bgcolor: '#FFF', borderRadius: 1, border: `1px solid ${ORANGE}` }}>
                                    <Typography variant="caption" sx={{ fontWeight: 700, color: ORANGE, display: 'block', mb: 1 }}>
                                        Segundo contenedor en la misma unidad (solo "Liberado de aduana"):
                                    </Typography>
                                    {(() => {
                                        const opts = containers.filter((c) => c.status === 'customs_cleared' && c.id !== selected.id);
                                        const value = opts.find((c) => c.id === secondContainerId) || null;
                                        return (
                                            <Autocomplete
                                                size="small"
                                                options={opts}
                                                value={value}
                                                onChange={(_, v) => setSecondContainerId(v?.id || null)}
                                                getOptionLabel={(o) => `${o.reference_code || '—'} · ${o.container_number || '—'}${o.bl_number ? ` · BL ${o.bl_number}` : ''}`}
                                                isOptionEqualToValue={(a, b) => a.id === b.id}
                                                renderInput={(params) => (
                                                    <TextField {...params} label="Buscar contenedor (ref / número / BL)" placeholder="Ej. WHSU8715901" />
                                                )}
                                                noOptionsText={opts.length === 0 ? 'No hay contenedores con status "Liberado de aduana"' : 'Sin coincidencias'}
                                            />
                                        );
                                    })()}
                                </Box>
                            )}

                            <Grid container spacing={2}>
                                <Grid size={{ xs: 12 }}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Empresa transportista"
                                        value={driverCompany}
                                        onChange={(e) => setDriverCompany(e.target.value)}
                                        placeholder="Ej. Transportes del Norte S.A. de C.V."
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Nombre del operador"
                                        value={driverName}
                                        onChange={(e) => setDriverName(e.target.value)}
                                        placeholder="Ej. Juan Pérez"
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Placas de la unidad"
                                        value={driverPlates}
                                        onChange={(e) => setDriverPlates(e.target.value.toUpperCase())}
                                        placeholder="Ej. ABC-1234"
                                        InputProps={{ sx: { fontFamily: 'monospace' } }}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Teléfono (opcional)"
                                        value={driverPhone}
                                        onChange={(e) => setDriverPhone(e.target.value)}
                                        placeholder="55 1234 5678"
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Notas (opcional)"
                                        value={driverNotes}
                                        onChange={(e) => setDriverNotes(e.target.value)}
                                        placeholder="Observaciones del despacho…"
                                    />
                                </Grid>
                            </Grid>
                        </Box>
                            );
                        })()}

                        {/* Historial de cambios */}
                        <Box sx={{ mt: 3 }}>
                            <Typography sx={{ fontWeight: 700, color: BLACK, mb: 1 }}>
                                📜 Historial de cambios ({history.length})
                            </Typography>
                            {loadingHistory ? (
                                <Box sx={{ textAlign: 'center', py: 2 }}><CircularProgress size={20} sx={{ color: TEAL }} /></Box>
                            ) : history.length === 0 ? (
                                <Typography variant="caption" color="text.secondary">
                                    Sin movimientos registrados todavía.
                                </Typography>
                            ) : (
                                <Paper variant="outlined" sx={{ maxHeight: 220, overflow: 'auto' }}>
                                    <List dense disablePadding>
                                        {history.map((h) => {
                                            const meta = FCL_STATUSES.find((s) => s.value === h.new_status);
                                            return (
                                                <ListItem key={h.id} sx={{ borderBottom: '1px solid #eee', alignItems: 'flex-start' }}>
                                                    <ListItemText
                                                        primary={
                                                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                                                <Typography sx={{ fontWeight: 700 }}>
                                                                    {meta?.icon || '·'} {meta?.label || h.new_status}
                                                                </Typography>
                                                                <Chip
                                                                    label={new Date(h.changed_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                                                                    size="small"
                                                                    variant="outlined"
                                                                    sx={{ height: 20, fontSize: 11 }}
                                                                />
                                                                {h.changed_by_name && (
                                                                    <Chip label={`por ${h.changed_by_name}`} size="small" sx={{ height: 20, bgcolor: BLACK, color: '#FFF', fontSize: 11 }} />
                                                                )}
                                                            </Stack>
                                                        }
                                                        secondary={
                                                            <Box component="span" sx={{ display: 'block', fontSize: 12, color: '#555', mt: 0.5 }}>
                                                                {(h.driver_name || h.driver_plates || h.driver_phone) && (
                                                                    <span>
                                                                        🚛 {h.driver_name || '—'}
                                                                        {h.driver_plates ? ` · ${h.driver_plates}` : ''}
                                                                        {h.driver_phone ? ` · ${h.driver_phone}` : ''}
                                                                    </span>
                                                                )}
                                                                {h.notes && <span style={{ display: 'block' }}>📝 {h.notes}</span>}
                                                                {h.previous_status && (
                                                                    <span style={{ display: 'block', color: '#999' }}>(anterior: {h.previous_status})</span>
                                                                )}
                                                            </Box>
                                                        }
                                                    />
                                                </ListItem>
                                            );
                                        })}
                                    </List>
                                </Paper>
                            )}
                        </Box>
                    </Paper>

                    <Stack direction="row" spacing={2} sx={{ mt: 3 }} justifyContent="flex-end">
                        <Button onClick={() => { setStep(0); setFclStatus('in_transit_clientfinal'); }} disabled={fclSaving} sx={{ color: BLACK }}>
                            Cancelar
                        </Button>
                        <Button
                            variant="contained"
                            onClick={updateFCLContainerStatus}
                            disabled={!fclStatus || fclSaving || fclStatus === selected.status}
                            sx={{ bgcolor: TEAL, '&:hover': { bgcolor: '#00838F' }, minWidth: 200 }}
                        >
                            {fclSaving ? <CircularProgress size={20} sx={{ color: '#FFF' }} /> : 'Actualizar status del contenedor'}
                        </Button>
                    </Stack>
                </Box>
            )}

            {/* STEP 1 (LCL - escaneo de cajas) */}
            {step === 1 && selected && mode !== 'FCL' && (
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
                                placeholder="Escanear caja (LOG26CNMX...-0001) o log completo (LOG26CNMX...)"
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
                                const isReceived = isReceivedInCedis(o.status);
                                const wasMissing = o.missing_on_arrival === true;
                                const expectedBoxes = Number(o.summary_boxes) || Number(o.goods_num) || 0;
                                const scannedSet = scannedBoxesByOrder[o.id];
                                const scannedCount = scannedSet ? scannedSet.size : 0;
                                // Si ya viene como recibido del backend (o sin tracking local), tomar receivedByOrder o expected
                                const receivedVal = scannedSet
                                    ? scannedCount
                                    : receivedByOrder[o.id] !== undefined
                                        ? receivedByOrder[o.id]
                                        : (wasMissing ? (Number((o as any).received_boxes) || 0) : (isReceived ? expectedBoxes : 0));
                                const isPartial = receivedVal > 0 && receivedVal < expectedBoxes;
                                const remaining = Math.max(0, expectedBoxes - receivedVal);
                                const isExpanded = expandedOrderId === o.id;
                                const isComplete = receivedVal >= expectedBoxes && expectedBoxes > 0;
                                return (
                                    <Box
                                        key={o.id}
                                        sx={{
                                            bgcolor: wasMissing
                                                ? '#FFEBEE'
                                                : isComplete
                                                ? '#E8F5E9'
                                                : isPartial
                                                ? '#FFF3E0'
                                                : 'transparent',
                                            borderBottom: '1px solid #eee',
                                            borderLeft: isExpanded ? `4px solid ${TEAL}` : '4px solid transparent',
                                            transition: 'border-left-color 0.2s',
                                        }}
                                    >
                                        <Box
                                            onClick={() => setExpandedOrderId(isExpanded ? null : o.id)}
                                            sx={{
                                                cursor: 'pointer',
                                                py: 1.2,
                                                px: 2,
                                                display: 'grid',
                                                gridTemplateColumns: '40px 1fr auto',
                                                alignItems: 'center',
                                                gap: 1.5,
                                                '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' },
                                            }}
                                        >
                                            <Box>
                                                {isComplete
                                                    ? <CheckCircleIcon color="success" />
                                                    : <UncheckedIcon color={wasMissing ? 'error' : (isPartial ? 'warning' : 'disabled')} />}
                                            </Box>
                                            <Box sx={{ minWidth: 0 }}>
                                                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ rowGap: 0.5 }}>
                                                    <Typography sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{o.ordersn}</Typography>
                                                    {o.shipping_mark && <Chip label={o.shipping_mark} size="small" variant="outlined" />}
                                                    {o.user_box_id && <Chip label={o.user_box_id} size="small" sx={{ bgcolor: BLACK, color: '#FFF' }} />}
                                                    {isComplete && !wasMissing && <Chip label="✓ RECIBIDO" size="small" color="success" />}
                                                    {wasMissing && (
                                                        <Chip
                                                            label={`⚠️ ${expectedBoxes - receivedVal} caja(s) faltantes`}
                                                            size="small"
                                                            sx={{ bgcolor: RED, color: '#FFF', fontWeight: 700 }}
                                                        />
                                                    )}
                                                    {isPartial && !wasMissing && !isComplete && (
                                                        <Chip
                                                            label={`Faltan ${remaining}`}
                                                            size="small"
                                                            sx={{ bgcolor: '#FF9800', color: '#FFF', fontWeight: 700 }}
                                                        />
                                                    )}
                                                </Stack>
                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.3 }}>
                                                    {Number(o.weight || 0).toFixed(2)} kg · {Number(o.volume || 0).toFixed(3)} CBM · {o.status}
                                                </Typography>
                                            </Box>
                                            {expectedBoxes > 0 && (
                                                <Chip
                                                    label={`${receivedVal} / ${expectedBoxes} cajas`}
                                                    size="medium"
                                                    sx={{
                                                        fontWeight: 800,
                                                        fontSize: 14,
                                                        bgcolor: isComplete ? '#2E7D32' : (isPartial || wasMissing) ? '#FF9800' : '#E0E0E0',
                                                        color: isComplete || isPartial || wasMissing ? '#FFF' : '#666',
                                                        minWidth: 110,
                                                    }}
                                                />
                                            )}
                                        </Box>
                                        {/* Panel expandido: cajas escaneadas + faltantes */}
                                        {isExpanded && expectedBoxes > 0 && (
                                            <Box sx={{ px: 3, pb: 1.5, pt: 0.5, bgcolor: 'rgba(0,151,167,0.04)' }}>
                                                {/* Si el log fue recibido en sesión previa SIN tracking por caja, no mostramos chips de cajas */}
                                                {!scannedSet && isReceived ? (
                                                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#2E7D32', display: 'block' }}>
                                                        ✓ Log recibido previamente · {expectedBoxes} caja(s) marcadas como recibidas en sesión anterior
                                                    </Typography>
                                                ) : (
                                                    <>
                                                        <Typography variant="caption" sx={{ fontWeight: 700, color: TEAL, display: 'block', mb: 0.5 }}>
                                                            📦 Cajas del log (escanea cada caja: {o.ordersn}-0001 ... {o.ordersn}-{String(expectedBoxes).padStart(4, '0')})
                                                        </Typography>
                                                        <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ gap: 0.5 }}>
                                                            {Array.from({ length: expectedBoxes }, (_, i) => {
                                                                const num = String(i + 1).padStart(4, '0');
                                                                // SOLO verde si está realmente en el set escaneado de esta sesión
                                                                const scanned = scannedSet ? scannedSet.has(num) : false;
                                                                return (
                                                                    <Chip
                                                                        key={num}
                                                                        size="small"
                                                                        label={`${i + 1}`}
                                                                        sx={{
                                                                            minWidth: 32,
                                                                            fontWeight: 700,
                                                                            bgcolor: scanned ? '#2E7D32' : '#FFF',
                                                                            color: scanned ? '#FFF' : '#999',
                                                                            border: scanned ? 'none' : '1px dashed #BBB',
                                                                        }}
                                                                    />
                                                                );
                                                            })}
                                                        </Stack>
                                                        {remaining > 0 && (
                                                            <Typography variant="caption" sx={{ color: ORANGE, fontWeight: 700, display: 'block', mt: 0.5 }}>
                                                                ⚠️ Faltan {remaining} caja(s) por escanear
                                                            </Typography>
                                                        )}
                                                    </>
                                                )}
                                            </Box>
                                        )}
                                    </Box>
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
                        const fullyMissing = orders.filter((o) => !isReceivedInCedis(o.status)).length;
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
                        {mode === 'FCL' ? 'Status actualizado' : (result.missing === 0 ? 'Recepción completa' : 'Recepción parcial registrada')}
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
                                {(() => {
                                    const pendingIds = orders
                                        .filter((o) => !isReceivedInCedis(o.status))
                                        .map((o) => o.id);
                                    const allPendingSelected = pendingIds.length > 0 && pendingIds.every((id) => selectedOrderIds.has(id));
                                    return allPendingSelected ? 'Quitar todo' : 'Seleccionar pendientes';
                                })()}
                            </Button>
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            Los logs ya recibidos en CEDIS (CDMX/MTY) aparecen deseleccionados por defecto.
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                            💡 Si un log llegó incompleto, ajusta las cajas recibidas. Al dar <strong>Reportar faltantes</strong> se marcarán como retraso y se notificará a CEDIS CDMX y Administradores.
                        </Typography>
                        <FormControl sx={{ mt: 1.5 }}>
                            <FormLabel sx={{ fontSize: 12, fontWeight: 700, color: BLACK, '&.Mui-focused': { color: BLACK } }}>
                                Formato de impresión
                            </FormLabel>
                            <RadioGroup
                                row
                                value={labelFormat}
                                onChange={(e) => setLabelFormat(e.target.value as '4x6' | '4x2')}
                            >
                                <FormControlLabel
                                    value="4x6"
                                    control={<Radio size="small" sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }} />}
                                    label={<Typography variant="body2"><strong>📄 4×6 in</strong> · 2 etiquetas por hoja (láser/A4)</Typography>}
                                />
                                <FormControlLabel
                                    value="4x2"
                                    control={<Radio size="small" sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }} />}
                                    label={<Typography variant="body2"><strong>🏷️ 4×2 in</strong> · 1 etiqueta compacta (térmica Zebra/Brother)</Typography>}
                                />
                            </RadioGroup>
                        </FormControl>
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

            {/* ─────────── DIALOG: ACTUALIZACIÓN EN SERIE FCL ─────────── */}
            <Dialog open={bulkOpen} onClose={() => !bulkRunning && resetBulk()} maxWidth="md" fullWidth>
                <DialogTitle sx={{ bgcolor: TEAL, color: '#FFF', fontWeight: 700 }}>
                    🚀 Actualización en serie · Contenedores FCL
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    {!bulkResults && (
                        <>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                Pega el listado de contenedores (uno por línea, o separados por comas/espacios).
                                Se buscarán por <strong>número de contenedor</strong>, <strong>BL</strong> o <strong>referencia (JSM/EPG)</strong>.
                            </Typography>
                            <TextField
                                fullWidth
                                multiline
                                minRows={6}
                                maxRows={14}
                                placeholder={'WHSU8715901\nONEU6808395\nNYKU5152448\n...'}
                                value={bulkInput}
                                onChange={(e) => setBulkInput(e.target.value)}
                                sx={{ mb: 2, fontFamily: 'monospace' }}
                                InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }}
                            />
                            <Typography variant="caption" color="text.secondary">
                                Detectados: <strong>{parseBulkTokens(bulkInput).length}</strong> identificador(es)
                            </Typography>
                        </>
                    )}

                    {bulkResults && (
                        <Box>
                            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
                                <Chip
                                    label={`✓ Encontrados: ${bulkResults.matched.length}`}
                                    sx={{ bgcolor: '#2E7D32', color: '#FFF', fontWeight: 700 }}
                                />
                                {bulkResults.notFound.length > 0 && (
                                    <Chip
                                        label={`✗ No encontrados: ${bulkResults.notFound.length}`}
                                        sx={{ bgcolor: RED, color: '#FFF', fontWeight: 700 }}
                                    />
                                )}
                                {bulkResults.successes.length > 0 && (
                                    <Chip
                                        label={`✅ Actualizados: ${bulkResults.successes.length}`}
                                        sx={{ bgcolor: '#1B5E20', color: '#FFF', fontWeight: 700 }}
                                    />
                                )}
                                {bulkResults.failures.length > 0 && (
                                    <Chip
                                        label={`❌ Fallidos: ${bulkResults.failures.length}`}
                                        sx={{ bgcolor: '#B71C1C', color: '#FFF', fontWeight: 700 }}
                                    />
                                )}
                            </Stack>

                            {bulkResults.notFound.length > 0 && (
                                <Alert severity="warning" sx={{ mb: 2 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                                        Los siguientes identificadores no se encontraron en la lista de contenedores pendientes:
                                    </Typography>
                                    <Box sx={{ fontFamily: 'monospace', fontSize: 12, color: '#B71C1C' }}>
                                        {bulkResults.notFound.join(', ')}
                                    </Box>
                                </Alert>
                            )}

                            {bulkResults.matched.length > 0 && (
                                <Paper variant="outlined" sx={{ mb: 2, maxHeight: 220, overflow: 'auto' }}>
                                    <List dense disablePadding>
                                        {bulkResults.matched.map((c) => {
                                            const ok = bulkResults.successes.includes(c.id);
                                            const failed = bulkResults.failures.find((f) => f.id === c.id);
                                            return (
                                                <ListItem
                                                    key={c.id}
                                                    sx={{
                                                        borderBottom: '1px solid #eee',
                                                        bgcolor: ok ? '#E8F5E9' : failed ? '#FFEBEE' : 'transparent',
                                                    }}
                                                >
                                                    <Box sx={{ mr: 1 }}>
                                                        {ok && <CheckCircleIcon sx={{ color: '#2E7D32' }} />}
                                                        {failed && <ErrorIcon sx={{ color: RED }} />}
                                                        {!ok && !failed && <UncheckedIcon sx={{ color: '#BDBDBD' }} />}
                                                    </Box>
                                                    <ListItemText
                                                        primary={
                                                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                                                <Typography sx={{ fontWeight: 700, fontFamily: 'monospace', color: TEAL }}>
                                                                    {c.reference_code || '—'}
                                                                </Typography>
                                                                {c.container_number && (
                                                                    <Chip size="small" label={c.container_number} variant="outlined" sx={{ height: 20, fontFamily: 'monospace', fontSize: 11 }} />
                                                                )}
                                                                {c.bl_number && (
                                                                    <Chip size="small" label={`BL ${c.bl_number}`} variant="outlined" sx={{ height: 20, fontFamily: 'monospace', fontSize: 11 }} />
                                                                )}
                                                                <Chip size="small" label={c.status} sx={{ height: 20, bgcolor: BLACK, color: '#FFF' }} />
                                                            </Stack>
                                                        }
                                                        secondary={failed?.error}
                                                    />
                                                </ListItem>
                                            );
                                        })}
                                    </List>
                                </Paper>
                            )}

                            {bulkResults.successes.length === 0 && bulkResults.failures.length === 0 && bulkResults.matched.length > 0 && (
                                <FormControl fullWidth sx={{ mb: 1 }}>
                                    <FormLabel sx={{ mb: 1, fontWeight: 700, color: BLACK }}>
                                        Status a aplicar a los {bulkResults.matched.length} contenedor(es):
                                    </FormLabel>
                                    <RadioGroup value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
                                        {FCL_STATUSES
                                            .filter((s) => !['received_origin', 'consolidated'].includes(s.value))
                                            .map((s) => (
                                            <FormControlLabel
                                                key={s.value}
                                                value={s.value}
                                                control={<Radio sx={{ color: TEAL, '&.Mui-checked': { color: TEAL } }} />}
                                                label={<Typography sx={{ fontWeight: 600 }}>{s.icon} {s.label}</Typography>}
                                            />
                                        ))}
                                    </RadioGroup>
                                </FormControl>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={resetBulk} disabled={bulkRunning} sx={{ color: BLACK }}>
                        {bulkResults && bulkResults.successes.length > 0 ? 'Cerrar' : 'Cancelar'}
                    </Button>
                    {!bulkResults && (
                        <Button
                            variant="contained"
                            onClick={previewBulk}
                            disabled={parseBulkTokens(bulkInput).length === 0}
                            sx={{ bgcolor: TEAL, '&:hover': { bgcolor: '#00838F' } }}
                        >
                            Verificar ({parseBulkTokens(bulkInput).length})
                        </Button>
                    )}
                    {bulkResults && bulkResults.successes.length === 0 && bulkResults.failures.length === 0 && (
                        <>
                            <Button
                                onClick={() => setBulkResults(null)}
                                disabled={bulkRunning}
                                sx={{ color: TEAL }}
                            >
                                ← Editar lista
                            </Button>
                            <Button
                                variant="contained"
                                onClick={runBulkUpdate}
                                disabled={!bulkStatus || bulkResults.matched.length === 0 || bulkRunning}
                                sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#E64A19' }, minWidth: 220 }}
                            >
                                {bulkRunning
                                    ? <CircularProgress size={20} sx={{ color: '#FFF' }} />
                                    : `Aplicar a ${bulkResults.matched.length} contenedor(es)`}
                            </Button>
                        </>
                    )}
                </DialogActions>
            </Dialog>
        </Box>
    );
}
