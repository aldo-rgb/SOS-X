// ============================================
// MÓDULO DE REETIQUETADO
// Permite buscar cualquier paquete (de cualquier servicio) por tracking
// y reimprimir su etiqueta
// ============================================

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScaleReader } from '../hooks/useScaleReader';
import {
    Box,
    Typography,
    Paper,
    TextField,
    Button,
    Alert,
    CircularProgress,
    Chip,
    Grid,
    Divider,
    IconButton,
    InputAdornment,
    Checkbox,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Stack,
} from '@mui/material';
import {
    Search as SearchIcon,
    Print as PrintIcon,
    QrCodeScanner as QrCodeScannerIcon,
    LocalShipping as LocalShippingIcon,
    Clear as ClearIcon,
    PrintOutlined as PrintOutlinedIcon,
    ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import api from '../services/api';

interface LabelData {
    boxNumber: number;
    totalBoxes: number;
    tracking: string;
    labelCode: string;
    masterTracking?: string;
    isMaster: boolean;
    weight: number;
    dimensions?: string;
    clientName: string;
    clientBoxId: string;
    description?: string;
    destinationCity?: string;
    destinationCountry?: string;
    destinationCode?: string;
    carrier?: string;
    receivedAt?: string;
}

interface ShipmentData {
    master: {
        id: number;
        tracking: string;
        trackingProvider?: string;
        description?: string;
        weight: number | null;
        isMaster: boolean;
        totalBoxes: number;
        status: string;
        statusLabel: string;
        receivedAt?: string;
        destinationCity?: string | null;
        destinationCountry?: string | null;
        destinationCode?: string | null;
        nationalCarrier?: string | null;
        nationalTracking?: string | null;
        nationalLabelUrl?: string | null;
        paymentStatus?: string | null;
        clientPaid?: boolean;
        clientPaidAt?: string | null;
        totalCost?: number | null;
        poboxCostUsd?: number | null;
        assignedAddress?: {
            id: number;
            alias?: string;
            recipientName?: string;
            street?: string;
            exterior?: string;
            interior?: string;
            neighborhood?: string;
            city?: string;
            state?: string;
            zip?: string;
            phone?: string;
            reference?: string;
            carrierConfig?: any;
        } | null;
        deliveryDocuments?: {
            factura?: { url: string; filename?: string | null; uploadedAt?: string | null } | null;
            constancia?: { url: string; filename?: string | null; uploadedAt?: string | null } | null;
            guiaExterna?: { url: string; filename?: string | null; uploadedAt?: string | null } | null;
        } | null;
    };
    children: Array<{
        id: number;
        tracking: string;
        boxNumber: number;
        weight: number;
        nationalTracking?: string | null;
        nationalLabelUrl?: string | null;
        nationalCarrier?: string | null;
    }>;
    labels: LabelData[];
    client: {
        id: number;
        name: string;
        email: string;
        boxId: string;
    };
}

// Normaliza el tracking escaneado desde QR (incluyendo layout de teclado ES roto)
const extractTracking = (raw: string): string => {
    const t = raw.trim();
    if (!t) return '';

    // Si parece guía directa (sin URL/espacios), conservar completa
    // Ejemplos: AIR2618261VyFJV-012, US-7358716247, MX123ABC-01
    const directToken = /^[A-Za-z0-9][A-Za-z0-9\-_']{5,}$/;
    if (directToken.test(t) && !t.includes('/') && !t.includes('http')) {
        return t.replace(/[_']/g, '-').toUpperCase();
    }

    // Si ya parece un tracking válido (XX-YYY[-ZZZ...]), devolverlo tal cual
    const cleanPattern = /^[A-Z]{2,}[-_'][A-Z0-9]{2,}(?:[-_'][A-Z0-9]{2,})*$/i;
    if (cleanPattern.test(t)) {
        return t.replace(/[_']/g, '-').toUpperCase();
    }
    // Después de "track" en URL
    const afterTrack = t.match(/track[^A-Za-z0-9]+([A-Za-z]{2,})[^A-Za-z0-9]?([A-Za-z0-9]{4,})/i);
    if (afterTrack) return `${afterTrack[1]}-${afterTrack[2]}`.toUpperCase();
    // Patrón XX-XXXX(-XXXX)* en texto (soporta múltiples guiones)
    const allMatches = t.match(/[A-Z]{2,}[-_'][A-Z0-9]{2,}(?:[-_'][A-Z0-9]{2,})*/gi) || [];
    let candidate = allMatches.find((m) => !/TREGAX/i.test(m));
    if (!candidate) {
        // Fallback: patrón sin guión
        const fallback = (t.match(/[A-Z]{2,}[A-Z0-9]{4,}/gi) || []).find((m) => !/TREGAX/i.test(m));
        candidate = fallback;
    }
    if (candidate) {
        let c = candidate.replace(/[_']/g, '-').toUpperCase();
        if (!c.includes('-') && c.length > 3) c = c.slice(0, 2) + '-' + c.slice(2);
        return c;
    }
    return t.toUpperCase();
};

// Detecta el tipo de servicio por el prefijo del tracking
const getServiceInfo = (tracking: string) => {
    const prefix = tracking.split('-')[0]?.toUpperCase() || '';
    switch (prefix) {
        case 'US':
            return { label: 'PO Box USA', color: '#2196F3', emoji: '🇺🇸' };
        case 'CN':
            return { label: 'China Aéreo (TDI)', color: '#FF5722', emoji: '✈️' };
        case 'LOG':
            return { label: 'China Marítimo', color: '#00BCD4', emoji: '🚢' };
        case 'AIR':
            return { label: 'Aéreo', color: '#FF5722', emoji: '✈️' };
        case 'DHL':
            return { label: 'DHL Monterrey', color: '#FFC107', emoji: '📮' };
        case 'MX':
            return { label: 'Nacional México', color: '#4CAF50', emoji: '🇲🇽' };
        default:
            return { label: prefix || 'Otro', color: '#666', emoji: '📦' };
    }
};

const normalizeCarrierText = (value: any): string => String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const CARRIER_DISPLAY_NAMES: Record<string, string> = {
    'paquete_express': 'Paquete Express',
    'paquete express': 'Paquete Express',
    'paquetexpress': 'Paquete Express',
    'pqtx': 'Paquete Express',
    'entregax_local': 'Entregax Local',
    'entregax local': 'Entregax Local',
    'entregax_local_cdmx': 'Entregax Local CDMX',
    'entregax local cdmx': 'Entregax Local CDMX',
    'fedex': 'FedEx',
    'estafeta': 'Estafeta',
    'dhl': 'DHL',
    'ups': 'UPS',
    'pickup_hidalgo': 'Recoger en Sucursal',
};

const prettifyCarrier = (raw: string): string => {
    const key = String(raw || '').toLowerCase().trim();
    if (CARRIER_DISPLAY_NAMES[key]) return CARRIER_DISPLAY_NAMES[key];
    const normalized = normalizeCarrierText(raw);
    if (CARRIER_DISPLAY_NAMES[normalized]) return CARRIER_DISPLAY_NAMES[normalized];
    return String(raw || '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, c => c.toUpperCase());
};

const getAssignedCarrier = (shipment: ShipmentData | null): { displayName: string; normalized: string } | null => {
    if (!shipment) return null;

    const byMaster = normalizeCarrierText(shipment.master.nationalCarrier);
    if (byMaster) {
        return {
            displayName: prettifyCarrier(String(shipment.master.nationalCarrier)),
            normalized: byMaster,
        };
    }

    const cfg = shipment.master.assignedAddress?.carrierConfig;
    if (!cfg || typeof cfg !== 'object') return null;

    const candidates = [
        (cfg as any).carrier,
        (cfg as any).carrier_name,
        (cfg as any).provider,
        (cfg as any).provider_name,
        (cfg as any).name,
        (cfg as any).slug,
        (cfg as any).code,
    ].filter(Boolean);

    if (!candidates.length) return null;
    const selected = String(candidates[0]).trim();
    return {
        displayName: prettifyCarrier(selected),
        normalized: normalizeCarrierText(selected),
    };
};

const isPaqueteExpressCarrier = (normalized: string): boolean => (
    normalized.includes('paquete express') ||
    normalized.includes('paquetexpress') ||
    normalized.includes('pqtx')
);

const isEntregaxLocalCarrier = (normalized: string): boolean => (
    normalized.includes('entregax local') ||
    normalized.includes('entregax_local') ||
    normalized === 'entregax' ||
    normalized.includes('local mty') ||
    normalized.includes('local cdmx')
);

const with4x6Format = (url: string): string => {
    if (!url) return url;
    if (/([?&])format=/.test(url)) return url;
    return `${url}${url.includes('?') ? '&' : '?'}format=4x6`;
};

export default function RelabelingModulePage({ onBack }: { onBack?: () => void } = {}) {
    const navigate = useNavigate();
    const [tracking, setTracking] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shipment, setShipment] = useState<ShipmentData | null>(null);

    // 🔄 Auto-print al re-escanear la misma guía
    const lastScannedRef = useRef<string | null>(null);
    const autoPrintPendingRef = useRef(false);
    const [generatingPqtx, setGeneratingPqtx] = useState(false);
    const [pqtxMsg, setPqtxMsg] = useState<string | null>(null);
    const [selectedPqtx, setSelectedPqtx] = useState<Set<string>>(new Set());
    // Reimpresión por rango de cajas (LOG marítimo y multi-caja)
    const [reprintOpen, setReprintOpen] = useState(false);
    const [reprintLabel, setReprintLabel] = useState<LabelData | null>(null);
    const [reprintFrom, setReprintFrom] = useState<number>(1);
    const [reprintTo, setReprintTo] = useState<number>(1);

    // Captura de medidas/peso por caja (solo LOG marítimo) antes de generar PQTX
    type DimsBox = {
        boxNumber: number;
        tracking: string;
        weight: number | null;
        length: number | null;
        width: number | null;
        height: number | null;
        captured: boolean;
    };
    const [dimsModalOpen, setDimsModalOpen] = useState(false);
    const [dimsBoxes, setDimsBoxes] = useState<DimsBox[]>([]);
    const [dimsLoading, setDimsLoading] = useState(false);
    const [dimsError, setDimsError] = useState<string | null>(null);
    const [dimsScan, setDimsScan] = useState('');
    const [dimsActiveBox, setDimsActiveBox] = useState<number | null>(null);
    const [dimsForm, setDimsForm] = useState({ weight: '', length: '', width: '', height: '' });
    const [dimsSaving, setDimsSaving] = useState(false);
    const dimsScanRef = useRef<HTMLInputElement | null>(null);
    const [scaleReading, setScaleReading] = useState(false);
    const [scaleLive, setScaleLive] = useState(false);
    const { readScale, liveWeight } = useScaleReader();
    // Selección múltiple para aplicar mismas medidas en lote
    const [dimsSelected, setDimsSelected] = useState<Set<number>>(new Set());
    const [dimsSelectMode, setDimsSelectMode] = useState(false);
    const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

    // Auto-actualiza peso de la caja activa cuando la báscula cambia
    useEffect(() => {
        if (!dimsModalOpen || !scaleLive) return;
        if (liveWeight === null || liveWeight <= 0) return;
        const w = liveWeight.toFixed(2);
        setDimsForm(prev => prev.weight === w ? prev : { ...prev, weight: w });
    }, [liveWeight, scaleLive, dimsModalOpen]);

    // Lectura manual de báscula (botón)
    const handleReadScaleForBox = async () => {
        setScaleReading(true);
        try {
            const r = await readScale();
            if (r.success && r.weight !== undefined) {
                const w = r.weight.toFixed(2);
                setDimsForm(prev => ({ ...prev, weight: w }));
                setScaleLive(true);
                setDimsError(r.stale ? `⚠️ Sin peso actualizado. Peso anterior: ${w} kg` : null);
            } else {
                setDimsError(r.error || 'Error leyendo báscula');
            }
        } finally {
            setScaleReading(false);
        }
    };

    // Al cambiar de caja activa (no capturada): leer báscula automáticamente si ya está conectada
    useEffect(() => {
        if (!dimsModalOpen || !dimsActiveBox) return;
        const active = dimsBoxes.find(b => b.boxNumber === dimsActiveBox);
        if (active?.captured) return; // editando una ya capturada: no sobrescribir
        if (!scaleLive) return; // solo si ya pidió permiso una vez
        (async () => {
            const r = await readScale(1500);
            if (r.success && r.weight !== undefined && r.weight > 0) {
                setDimsForm(prev => ({ ...prev, weight: r.weight!.toFixed(2) }));
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dimsActiveBox]);

    const isMaritimeLog = (tn?: string) => !!tn && /^LOG/i.test(tn);

    const loadDimsBoxes = async (orderId: string | number) => {
        setDimsLoading(true);
        setDimsError(null);
        try {
            const res = await api.get(`/admin/relabeling/maritime/${orderId}/boxes`);
            const boxes: DimsBox[] = res.data?.boxes || [];
            setDimsBoxes(boxes);
            const firstPending = boxes.find(b => !b.captured);
            setDimsActiveBox(firstPending ? firstPending.boxNumber : null);
            setDimsForm({ weight: '', length: '', width: '', height: '' });
            return res.data;
        } catch (e: any) {
            setDimsError(e.response?.data?.error || e.message || 'Error cargando cajas');
            return null;
        } finally {
            setDimsLoading(false);
        }
    };

    const openDimsModal = async () => {
        if (!shipment) return;
        setDimsModalOpen(true);
        setDimsScan('');
        await loadDimsBoxes(shipment.master.id);
        setTimeout(() => dimsScanRef.current?.focus(), 150);
    };
    void openDimsModal; // reservado para uso futuro

    const handleDimsScan = (raw: string) => {
        const v = (raw || '').trim();
        setDimsScan(v);
        if (!v) return;
        // Resolver SOLO formatos completos (no dígitos sueltos durante el typing del scanner)
        // 1) "...-NN" formato con dash
        const m = v.match(/-(\d+)\s*$/);
        let boxNumber: number | null = null;
        if (m && m[1]) boxNumber = parseInt(m[1], 10);
        // 2) Formato compacto: el scan empieza con el tracking master + sufijo numérico
        //    El sufijo SIEMPRE es de 4 dígitos (zero-padded), evitando matches prematuros
        //    mientras llega el escaneo carácter a carácter.
        if (!boxNumber && shipment?.master?.tracking && dimsBoxes.length > 0) {
            const masterCompact = shipment.master.tracking.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const scanCompact = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const expectedWidth = 4; // sufijo de caja siempre 4 dígitos (0001..9999)
            if (
                scanCompact.startsWith(masterCompact) &&
                scanCompact.length === masterCompact.length + expectedWidth
            ) {
                const suffix = scanCompact.slice(masterCompact.length);
                if (/^\d+$/.test(suffix)) {
                    const candidate = parseInt(suffix, 10);
                    if (candidate > 0 && dimsBoxes.find(b => b.boxNumber === candidate)) {
                        boxNumber = candidate;
                    }
                }
            }
        }
        if (boxNumber && dimsBoxes.find(b => b.boxNumber === boxNumber)) {
            setDimsActiveBox(boxNumber);
            const existing = dimsBoxes.find(b => b.boxNumber === boxNumber);
            if (existing && existing.captured) {
                setDimsForm({
                    weight: String(existing.weight ?? ''),
                    length: String(existing.length ?? ''),
                    width: String(existing.width ?? ''),
                    height: String(existing.height ?? ''),
                });
            } else {
                setDimsForm({ weight: '', length: '', width: '', height: '' });
            }
            setDimsScan('');
        }
    };

    // Manejar Enter manual: permite teclear solo "60" + Enter para saltar a caja 60
    const handleDimsScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') return;
        const v = dimsScan.trim();
        if (!v) return;
        if (/^\d+$/.test(v)) {
            const n = parseInt(v, 10);
            const existing = dimsBoxes.find(b => b.boxNumber === n);
            if (existing) {
                setDimsActiveBox(n);
                if (existing.captured) {
                    setDimsForm({
                        weight: String(existing.weight ?? ''),
                        length: String(existing.length ?? ''),
                        width: String(existing.width ?? ''),
                        height: String(existing.height ?? ''),
                    });
                } else {
                    setDimsForm({ weight: '', length: '', width: '', height: '' });
                }
                setDimsScan('');
                e.preventDefault();
            }
        }
    };

    const saveDimsBox = async () => {
        if (!shipment || !dimsActiveBox) return;
        const weight = parseFloat(dimsForm.weight);
        const length = parseFloat(dimsForm.length);
        const width = parseFloat(dimsForm.width);
        const height = parseFloat(dimsForm.height);
        if (![weight, length, width, height].every(n => !isNaN(n) && n > 0)) {
            setDimsError('Captura peso y medidas válidas (mayores a 0)');
            return;
        }
        setDimsSaving(true);
        setDimsError(null);
        try {
            await api.post(`/admin/relabeling/maritime/${shipment.master.id}/box`, {
                boxNumber: dimsActiveBox,
                weight, length, width, height,
            });
            const data = await loadDimsBoxes(shipment.master.id);
            // Limpiar caja activa y formulario; quedar listo para escanear la siguiente
            setDimsActiveBox(null);
            setDimsForm({ weight: '', length: '', width: '', height: '' });
            setDimsScan('');
            setTimeout(() => {
                if (dimsScanRef.current) {
                    dimsScanRef.current.value = '';
                    dimsScanRef.current.focus();
                }
            }, 100);
            // Si todas están capturadas, avisar
            const allCaptured = (data?.boxes || []).every((b: DimsBox) => b.captured);
            if (allCaptured && (data?.boxes || []).length > 0) {
                setDimsError(null);
            }
        } catch (e: any) {
            setDimsError(e.response?.data?.error || e.message || 'Error guardando caja');
        } finally {
            setDimsSaving(false);
        }
    };

    // Aplica los valores actuales del formulario a todas las cajas seleccionadas (o a todas si no hay selección)
    const applyDimsToSelection = async () => {
        if (!shipment) return;
        const weight = parseFloat(dimsForm.weight);
        const length = parseFloat(dimsForm.length);
        const width = parseFloat(dimsForm.width);
        const height = parseFloat(dimsForm.height);
        if (![weight, length, width, height].every(n => !isNaN(n) && n > 0)) {
            setDimsError('Captura peso y medidas válidas (mayores a 0) antes de aplicar en lote');
            return;
        }
        const targets = dimsSelected.size > 0
            ? Array.from(dimsSelected).sort((a, b) => a - b)
            : dimsBoxes.map(b => b.boxNumber);
        if (targets.length === 0) return;
        // Abrir diálogo de confirmación con diseño
        setBulkConfirmOpen(true);
    };

    const confirmBulkApply = async () => {
        if (!shipment) return;
        const weight = parseFloat(dimsForm.weight);
        const length = parseFloat(dimsForm.length);
        const width = parseFloat(dimsForm.width);
        const height = parseFloat(dimsForm.height);
        const targets = dimsSelected.size > 0
            ? Array.from(dimsSelected).sort((a, b) => a - b)
            : dimsBoxes.map(b => b.boxNumber);
        setBulkConfirmOpen(false);
        setDimsSaving(true);
        setDimsError(null);
        try {
            for (const boxNumber of targets) {
                await api.post(`/admin/relabeling/maritime/${shipment.master.id}/box`, {
                    boxNumber, weight, length, width, height,
                });
            }
            await loadDimsBoxes(shipment.master.id);
            setDimsSelected(new Set());
            setDimsSelectMode(false);
            setDimsActiveBox(null);
            setDimsForm({ weight: '', length: '', width: '', height: '' });
            setDimsScan('');
            setTimeout(() => dimsScanRef.current?.focus(), 100);
        } catch (e: any) {
            setDimsError(e.response?.data?.error || e.message || 'Error aplicando medidas en lote');
        } finally {
            setDimsSaving(false);
        }
    };

    const toggleDimsSelected = (boxNumber: number) => {
        setDimsSelected(prev => {
            const next = new Set(prev);
            if (next.has(boxNumber)) next.delete(boxNumber);
            else next.add(boxNumber);
            return next;
        });
    };

    const selectAllDimsBoxes = () => {
        setDimsSelected(new Set(dimsBoxes.map(b => b.boxNumber)));
        setDimsSelectMode(true);
    };

    const selectPendingDimsBoxes = () => {
        setDimsSelected(new Set(dimsBoxes.filter(b => !b.captured).map(b => b.boxNumber)));
        setDimsSelectMode(true);
    };

    const clearDimsSelection = () => {
        setDimsSelected(new Set());
    };

    const handleGenerateMaritimePqtx = async () => {
        if (!shipment) return;
        setGeneratingPqtx(true);
        setError(null);
        setPqtxMsg(null);
        try {
            const res = await api.post(`/admin/relabeling/maritime/${shipment.master.id}/generate-pqtx`, {});
            if (res.data?.success) {
                const tn = res.data.trackingNumber;
                setPqtxMsg(`✅ Guía PQTX generada: ${tn}`);
                setDimsModalOpen(false);
                const baseUrl = (api.defaults.baseURL || '').replace(/\/$/, '');
                window.open(`${baseUrl}/admin/paquete-express/label/pdf/${tn}`, '_blank');
                await handleSearch();
            } else {
                setError(res.data?.error || 'No se pudo generar la guía');
            }
        } catch (e: any) {
            const data = e.response?.data;
            if (data?.needsDimensions) {
                // Reabrir modal con cajas faltantes
                setDimsModalOpen(true);
                await loadDimsBoxes(shipment.master.id);
                setDimsError(`Faltan medidas en ${data.missing?.length || '?'} caja(s)`);
            } else {
                setError(data?.error || e.message || 'Error generando guía marítima');
            }
        } finally {
            setGeneratingPqtx(false);
        }
    };

    const handleGeneratePqtxLabel = async () => {
        if (!shipment) return;
        // Marítimo LOG: requiere captura previa de medidas por caja
        if (isMaritimeLog(shipment.master.tracking)) {
            setError(null);
            setPqtxMsg(null);
            const data = await loadDimsBoxes(shipment.master.id);
            if (!data) return;
            if (data.complete) {
                await handleGenerateMaritimePqtx();
            } else {
                setDimsModalOpen(true);
                setDimsScan('');
                setTimeout(() => dimsScanRef.current?.focus(), 150);
            }
            return;
        }
        setGeneratingPqtx(true);
        setError(null);
        setPqtxMsg(null);
        try {
            const res = await api.post('/admin/paquete-express/generate-for-package', {
                packageId: shipment.master.id,
            });
            if (res.data?.success) {
                const baseUrl = (api.defaults.baseURL || '').replace(/\/$/, '');
                const trackings: Array<{ tracking: string; labelUrl?: string; boxNumber?: number | null }> = Array.isArray(res.data.trackings) && res.data.trackings.length > 0
                    ? res.data.trackings
                    : [{ tracking: res.data.trackingNumber, labelUrl: res.data.labelUrl }];

                if (trackings.length > 1) {
                    setPqtxMsg(`✅ ${trackings.length} guías generadas: ${trackings.map(t => t.tracking).join(', ')}`);
                } else {
                    setPqtxMsg(`✅ Guía generada: ${trackings[0]?.tracking}`);
                }

                // Abrir todos los PDFs en pestañas (con un pequeño delay entre cada uno
                // para que el navegador no bloquee los pop-ups)
                trackings.forEach((t, idx) => {
                    const url = `${baseUrl}/admin/paquete-express/label/pdf/${t.tracking}`;
                    setTimeout(() => window.open(url, '_blank'), idx * 250);
                });

                if (Array.isArray(res.data.errors) && res.data.errors.length > 0) {
                    setError(`Algunas cajas fallaron: ${res.data.errors.map((e: any) => `Caja ${e.boxNumber || '?'}: ${e.error}`).join(' | ')}`);
                }

                // Refrescar shipment para que aparezca el tracking nacional
                await handleSearch();
            } else {
                setError(res.data?.error || 'No se pudo generar la guía');
            }
        } catch (e: any) {
            setError(e.response?.data?.error || e.message || 'Error generando guía Paquete Express');
        } finally {
            setGeneratingPqtx(false);
        }
    };

    const handlePrintLocalDelivery = () => {
        if (!shipment?.master.assignedAddress) return;
        const a = shipment.master.assignedAddress;
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (!printWindow) {
            setError('Permite ventanas emergentes para imprimir');
            return;
        }
        const recipient = (a.recipientName || shipment.client.name || 'CLIENTE').toUpperCase();
        const street = `${a.street || ''} ${a.exterior || ''}${a.interior ? ` Int. ${a.interior}` : ''}`.trim();
        const cityLine = `${a.city || ''}${a.state ? ', ' + a.state : ''}`.trim();
        const colZip = `${a.neighborhood ? 'Col. ' + a.neighborhood + ' · ' : ''}C.P. ${a.zip || '—'}`;
        const tn = shipment.master.tracking;
        // Versión "compacta" sin guiones/comillas para barcode y QR — evita que el lector
        // convierta '-' en otros caracteres por layout de teclado.
        const tnCompact = String(tn || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const trackingQr = `https://app.entregax.com/track/${tnCompact}`;
        const today = new Date().toLocaleDateString('es-MX');
        const svc = getServiceInfo(tn);

        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Entrega Local ${tn}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
<style>
  @page { size: 4in 6in; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; padding: 0.18in; width: 4in; height: 6in; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #F05A28; padding-bottom: 6px; margin-bottom: 6px; }
  .brand .logo { font-size: 22px; font-weight: 900; color: #F05A28; letter-spacing: 1px; font-family: 'Arial Black', sans-serif; }
  .brand .logo span { color: #111; }
  .brand .badge { background: #F05A28; color: #fff; padding: 4px 10px; font-size: 10px; font-weight: 800; border-radius: 4px; letter-spacing: 1px; }
  .tracking-row { display: flex; justify-content: space-between; align-items: center; margin: 4px 0; }
  .tracking-row .tn { font-family: 'Courier New', monospace; font-size: 16px; font-weight: 900; }
  .tracking-row .date { font-size: 10px; color: #555; }
  .barcode-box { text-align: center; margin: 4px 0; }
  .barcode-box svg { max-height: 65px; width: 100%; }
  .dest { border: 2px solid #000; padding: 8px; margin: 6px 0; }
  .dest .lbl { font-size: 9px; color: #666; font-weight: 800; letter-spacing: 1px; margin-bottom: 3px; }
  .dest .name { font-size: 14px; font-weight: 900; color: #111; margin-bottom: 4px; line-height: 1.1; }
  .dest .line { font-size: 12px; color: #222; line-height: 1.3; }
  .dest .city { font-size: 14px; font-weight: 900; color: #C1272D; margin-top: 4px; }
  .dest .phone { font-size: 11px; font-weight: 700; margin-top: 4px; }
  .dest-code { display: flex; align-items: center; justify-content: center; border: 3px solid #C1272D; border-radius: 8px; padding: 6px 4px; margin: 6px 0; background: #FFF3F0; }
  .dest-code .code { font-family: 'Arial Black', sans-serif; font-size: 56px; font-weight: 900; color: #C1272D; letter-spacing: 4px; line-height: 1; }
  .dest-code .lbl { font-size: 9px; color: #666; font-weight: 800; letter-spacing: 2px; margin-right: 10px; writing-mode: vertical-rl; transform: rotate(180deg); }
  .ref-box { font-size: 10px; color: #444; border: 1px dashed #999; padding: 4px 6px; margin-top: 4px; font-style: italic; }
  .pkg-info { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; font-size: 10px; margin: 4px 0; text-align: center; }
  .pkg-info .cell { border: 1px solid #ddd; padding: 4px; }
  .pkg-info .cell .lbl { font-size: 8px; color: #666; font-weight: 700; }
  .pkg-info .cell .val { font-size: 11px; font-weight: 800; }
  .footer { display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 6px; border-top: 1px dashed #999; }
  .footer .qr-box { text-align: center; }
  .footer .qr-box img { width: 90px !important; height: 90px !important; }
  .footer .qr-box .qr-label { font-size: 8px; color: #666; }
  .footer .signature { flex: 1; padding-left: 8px; }
  .footer .service-box { flex: 1; padding-left: 10px; text-align: center; }
  .footer .service-box .lbl { font-size: 9px; color: #666; font-weight: 800; letter-spacing: 1px; margin-bottom: 4px; }
  .footer .service-box .val { font-family: 'Arial Black', sans-serif; font-size: 22px; font-weight: 900; color: #F05A28; letter-spacing: 2px; line-height: 1.1; }
  .footer .service-box .sub { font-size: 9px; color: #444; margin-top: 2px; }
  .footer .signature .line { border-bottom: 1px solid #000; height: 30px; }
  .footer .signature .lbl { font-size: 8px; color: #666; margin-top: 2px; text-align: center; }
</style></head><body>
  <div class="brand">
    <div class="logo">Entrega<span>X</span></div>
    <div class="badge">📍 ENTREGA LOCAL</div>
  </div>

  <div class="tracking-row">
    <div class="tn">${tnCompact}</div>
    <div class="date">${today}</div>
  </div>

  <div class="barcode-box"><svg id="barcode"></svg></div>

  <div class="dest">
    <div class="lbl">ENTREGAR A</div>
    <div class="name">${recipient}</div>
    <div class="line">${street || '—'}</div>
    <div class="line">${colZip}</div>
    <div class="city">${cityLine}</div>
    ${a.phone ? `<div class="phone">📞 ${a.phone}</div>` : ''}
    ${a.reference ? `<div class="ref-box">Ref: ${a.reference}</div>` : ''}
  </div>

  <div class="dest-code">
    <div class="lbl">DESTINO</div>
    <div class="code">${shipment.master.destinationCode || '—'}</div>
  </div>

  <div class="pkg-info">
    <div class="cell"><div class="lbl">CLIENTE</div><div class="val">${shipment.client.boxId}</div></div>
    <div class="cell"><div class="lbl">PESO</div><div class="val">${shipment.master.weight ? Number(shipment.master.weight).toFixed(1) + ' kg' : '—'}</div></div>
    <div class="cell"><div class="lbl">CAJAS</div><div class="val">${shipment.master.totalBoxes || 1}</div></div>
  </div>

  <div class="footer">
    <div class="qr-box">
      <div id="qrcode"></div>
      <div class="qr-label">Tracking</div>
    </div>
    <div class="service-box">
      <div class="lbl">SERVICIO</div>
      <div class="val">${svc.emoji} ${svc.label.toUpperCase()}</div>
      <div class="sub">${shipment.master.statusLabel || ''}</div>
    </div>
  </div>

<script>
  window.addEventListener('load', function() {
    try {
      JsBarcode('#barcode', ${JSON.stringify(tnCompact)}, { format: 'CODE128', width: 2, height: 50, displayValue: false, margin: 0 });
    } catch(e) {}
    try {
      var qr = qrcode(0, 'M'); qr.addData(${JSON.stringify(trackingQr)}); qr.make();
      document.getElementById('qrcode').innerHTML = qr.createImgTag(3);
    } catch(e) {}
    setTimeout(function() { window.print(); }, 400);
  });
</script>
</body></html>`;
        printWindow.document.write(html);
        printWindow.document.close();
    };

    const handleSearch = async () => {
        const normalized = extractTracking(tracking);
        if (!normalized) {
            setError('Ingresa un tracking válido');
            return;
        }
        // Si es la misma guía escaneada anteriormente, marcar para auto-impresión
        const isRescan = lastScannedRef.current === normalized;
        setLoading(true);
        setError(null);
        setShipment(null);
        try {
            const res = await api.get(`/packages/track/${encodeURIComponent(normalized)}`);
            if (res.data?.success && res.data.shipment) {
                if (isRescan) autoPrintPendingRef.current = true;
                lastScannedRef.current = normalized;
                setShipment(res.data.shipment);
                setTracking(normalized);
            } else {
                setError('Paquete no encontrado');
            }
        } catch (e: any) {
            setError(e.response?.data?.error || e.message || 'Error al buscar paquete');
        } finally {
            setLoading(false);
        }
    };

    const handleClear = () => {
        setTracking('');
        setShipment(null);
        setError(null);
        lastScannedRef.current = null;
        autoPrintPendingRef.current = false;
    };

    const buildLabelHTML = (label: LabelData): string => {
        const serviceInfo = getServiceInfo(label.tracking);
        const weightStr = label.weight ? `${Number(label.weight).toFixed(2)} kg` : '—';
        const dimsStr = label.dimensions || '—';
        const recvDate = label.receivedAt ? new Date(label.receivedAt).toLocaleDateString() : '';
        const trackingQr = `https://app.entregax.com/track/${label.tracking}`;
        const safeId = `bc_${label.boxNumber}_${Math.random().toString(36).slice(2, 8)}`;
        const qrId = `qr_${label.boxNumber}_${Math.random().toString(36).slice(2, 8)}`;

        return `
  <div class="label-page">
  <div class="header">
    <div class="service">${serviceInfo.emoji} ${serviceInfo.label}</div>
  </div>

  <div class="tracking-big">${label.tracking}</div>

  <div class="barcode-box">
    <svg id="${safeId}" class="barcode"></svg>
  </div>

  <div class="client-box">
    <div class="box-id">Box: ${label.clientBoxId}</div>
  </div>

  ${label.destinationCode ? `<div class="dest-banner">
    <div class="code">${label.destinationCode}</div>
    <div class="meta">
      <div class="lbl">DESTINO</div>
      <div class="city">${label.destinationCity || ''}${label.destinationCountry ? ', ' + label.destinationCountry : ''}</div>
    </div>
  </div>` : ''}

  <div class="info-grid">
    <div><span class="label">Peso:</span> ${weightStr}</div>
    <div><span class="label">Dim:</span> ${dimsStr}</div>
    ${label.destinationCity ? `<div><span class="label">Destino:</span> ${label.destinationCity}${label.destinationCountry ? ', ' + label.destinationCountry : ''}</div>` : ''}
    ${label.carrier ? `<div><span class="label">Carrier:</span> ${label.carrier}</div>` : ''}
    ${recvDate ? `<div><span class="label">Recibido:</span> ${recvDate}</div>` : ''}
  </div>

  <div class="qr-footer">
    <div class="qr-box">
      <div id="${qrId}" class="qrcode"></div>
      <div class="qr-label">QR tracking</div>
    </div>
    <div class="box-count">
      ${label.totalBoxes > 1 ? `<div>Caja</div><div class="big">${label.boxNumber} / ${label.totalBoxes}</div>` : `<div class="big">1 / 1</div>`}
    </div>
  </div>
  </div>
  <script type="application/json" class="label-data" data-bc="${safeId}" data-qr="${qrId}" data-tracking="${encodeURIComponent(label.tracking)}" data-qrurl="${encodeURIComponent(trackingQr)}"></script>`;
    };

    const openPrintWindow = (labels: LabelData[]) => {
        const printWindow = window.open('', '_blank', 'width=420,height=640');
        if (!printWindow) {
            setError('Permite ventanas emergentes para imprimir');
            return;
        }

        // Si todas las etiquetas son LOG (marítimo), usar formato 2-up con corte central
        const isMaritime = labels.length > 0 && labels.every(l => /^LOG/i.test(l.tracking.split('-')[0] || ''));

        if (isMaritime) {
            // Etiqueta marítima: una etiqueta por hoja 4 × 2 in (formato físico
            // del adhesivo), con header MARÍTIMO + N/Total, tracking, barcode
            // y la marca de cliente (S1, S2, ...) en grande naranja.
            const pages: string[] = labels.map((label, idx) => {
                const safeBcId = `bc_${idx}_${Math.random().toString(36).slice(2, 8)}`;
                const cleanBarcode = label.tracking.replace(/[^A-Z0-9]/gi, '');
                const isLast = idx === labels.length - 1;
                return `
                <div class="label" data-bc="${safeBcId}" data-tracking="${cleanBarcode}" style="page-break-after: ${isLast ? 'auto' : 'always'};">
                    <div class="header">
                        <div class="service">MARÍTIMO</div>
                        <div class="date-badge">${label.boxNumber}/${label.totalBoxes}</div>
                    </div>
                    <div class="tracking-code">${label.tracking}</div>
                    <div class="barcode-section"><svg id="${safeBcId}"></svg></div>
                    <div class="client-mark">${label.clientBoxId || '—'}</div>
                </div>`;
            });

            const html = `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<title>Etiquetas Marítimo (${labels.length})</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Arial', sans-serif; }
    .label {
        width: 4in; height: 2in;
        padding: 0.08in 0.14in;
        display: flex; flex-direction: column; justify-content: space-between;
        overflow: hidden;
    }
    .header { display: flex; justify-content: space-between; align-items: center; }
    .service { color: #000; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; }
    .date-badge { color: #000; font-size: 14px; font-weight: 900; }
    .tracking-code { text-align: center; font-size: 12px; font-weight: bold; letter-spacing: 1px; font-family: 'Courier New', monospace; margin: 1px 0; }
    .barcode-section { text-align: center; }
    .barcode-section svg { width: 96%; height: 40px; }
    .client-mark { text-align: center; font-size: 24px; color: #FF6B35; font-weight: 900; letter-spacing: 2px; line-height: 1; margin: 1px 0; }
    @page { size: 4in 2in; margin: 0; }
    @media print { body { margin: 0; padding: 0; } .label { page-break-inside: avoid; overflow: hidden; } }
</style>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
</head><body>
${pages.join('')}
<script>
window.addEventListener('load', function() {
    document.querySelectorAll('.label[data-bc]').forEach(function(el) {
        var id = el.getAttribute('data-bc');
        var tracking = el.getAttribute('data-tracking') || '';
        try { JsBarcode('#' + id, tracking, { format: 'CODE128', width: 2, height: 40, displayValue: false, margin: 0 }); } catch(e) {}
    });
    setTimeout(function() { window.print(); }, 600);
});
<\/script>
</body></html>`;

            printWindow.document.write(html);
            printWindow.document.close();
            return;
        }

        // Formato estándar (PO Box, China Aéreo, DHL, Nacional)
        const body = labels.map(l => buildLabelHTML(l)).join('\n');

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Etiquetas (${labels.length})</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
<style>
  @page { size: 4in 6in; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { font-family: Arial, sans-serif; font-size: 10px; }
  .label-page { padding: 0.18in; width: 4in; height: 6in; display: flex; flex-direction: column; page-break-after: always; }
  .label-page:last-of-type { page-break-after: auto; }
  .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 6px; }
  .header .service { display: inline-block; padding: 6px 14px; border: 2px solid #000; color: #000; font-size: 16px; font-weight: 900; letter-spacing: 0.5px; border-radius: 4px; }
  .tracking-big { font-size: 18px; font-weight: 900; text-align: center; margin: 4px 0; font-family: 'Courier New', monospace; }
  .barcode-box { text-align: center; margin: 4px 0; }
  .barcode-box svg { max-height: 85px; width: 100%; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 6px; font-size: 10px; margin: 4px 0; }
  .info-grid .label { font-weight: 700; color: #555; }
  .client-box { border: 2px solid #000; padding: 6px; margin: 4px 0; text-align: center; }
  .client-box .box-id { font-size: 22px; font-weight: 900; color: #C1272D; letter-spacing: 1px; }
  .qr-footer { display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 4px; border-top: 1px dashed #999; }
  .qr-box { text-align: center; }
  .qrcode img { width: 120px !important; height: 120px !important; }
  .qr-box .qr-label { font-size: 8px; color: #666; margin-top: 2px; }
  .box-count { text-align: right; font-size: 11px; font-weight: 700; }
  .box-count .big { font-size: 20px; }
  .dest-banner { display: flex; align-items: center; justify-content: center; gap: 8px; border: 3px solid #000; padding: 6px 8px; margin: 4px 0; background: #FFF3E0; }
  .dest-banner .code { font-size: 44px; font-weight: 900; color: #C1272D; line-height: 1; font-family: 'Arial Black', sans-serif; letter-spacing: 2px; }
  .dest-banner .meta { text-align: left; }
  .dest-banner .meta .lbl { font-size: 9px; color: #666; font-weight: 700; letter-spacing: 1px; }
  .dest-banner .meta .city { font-size: 12px; font-weight: 700; color: #222; }
</style>
</head>
<body>
${body}
<script>
  window.addEventListener('load', function() {
    var datas = document.querySelectorAll('.label-data');
    datas.forEach(function(d) {
      var bcId = d.getAttribute('data-bc');
      var qrId = d.getAttribute('data-qr');
      var tracking = decodeURIComponent(d.getAttribute('data-tracking') || '');
      var qrurl = decodeURIComponent(d.getAttribute('data-qrurl') || '');
      try {
        JsBarcode('#' + bcId, tracking, { format: 'CODE128', width: 2, height: 60, displayValue: false, margin: 0 });
      } catch(e) { console.error('barcode', e); }
      try {
        var qr = qrcode(0, 'M');
        qr.addData(qrurl);
        qr.make();
        document.getElementById(qrId).innerHTML = qr.createImgTag(3);
      } catch(e) { console.error('qr', e); }
    });
    setTimeout(function() { window.print(); }, 600);
  });
</script>
</body>
</html>`;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    const handlePrintLabel = (label: LabelData) => {
        openPrintWindow([label]);
    };

    // Abre modal para reimprimir un rango de cajas (solo cuando totalBoxes > 1)
    const openReprintModal = (label: LabelData) => {
        setReprintLabel(label);
        setReprintFrom(1);
        setReprintTo(label.totalBoxes);
        setReprintOpen(true);
    };

    const handleConfirmReprintRange = () => {
        if (!reprintLabel) return;
        const total = reprintLabel.totalBoxes;
        const from = Math.max(1, Math.min(total, Math.floor(reprintFrom || 1)));
        const to = Math.max(from, Math.min(total, Math.floor(reprintTo || from)));
        const labels: LabelData[] = [];
        // El tracking original suele incluir el sufijo `-NN` correspondiente al boxNumber.
        // Quitamos el sufijo si existe para reconstruir cada caja del rango.
        const baseTracking = reprintLabel.tracking.replace(/-\d{1,4}$/, '');
        for (let i = from; i <= to; i++) {
            const suffix = String(i).padStart(2, '0');
            labels.push({
                ...reprintLabel,
                boxNumber: i,
                tracking: `${baseTracking}-${suffix}`,
            });
        }
        openPrintWindow(labels);
        setReprintOpen(false);
    };


    const assignedCarrier = getAssignedCarrier(shipment);
    const hasAssignedCarrier = Boolean(assignedCarrier);
    const isPaqueteExpressAssigned = Boolean(assignedCarrier && isPaqueteExpressCarrier(assignedCarrier.normalized));
    const isEntregaxLocalAssigned = Boolean(assignedCarrier && isEntregaxLocalCarrier(assignedCarrier.normalized));
    const carrierGuideTitle = assignedCarrier ? `Guía ${assignedCarrier.displayName}` : 'Guía de paquetería';

    const getAssignedCarrierGuideUrl = (opts?: { format4x6?: boolean }): string | null => {
        if (!shipment) return null;
        const baseUrl = (api.defaults.baseURL || '').replace(/\/$/, '');
        // baseUrl ya termina en /api → si raw también empieza con /api/ removerlo
        const baseEndsWithApi = /\/api$/.test(baseUrl);
        const raw = String(shipment.master.nationalLabelUrl || '').trim();

        const maybeFormat = (url: string) => (opts?.format4x6 ? with4x6Format(url) : url);

        if (raw) {
            if (/^https?:\/\//i.test(raw)) return maybeFormat(raw);
            const path = baseEndsWithApi && raw.startsWith('/api/') ? raw.slice(4) : raw;
            if (path.startsWith('/')) return maybeFormat(`${baseUrl}${path}`);
            return maybeFormat(`${baseUrl}/${path}`);
        }

        if (isPaqueteExpressAssigned && shipment.master.nationalTracking) {
            return maybeFormat(`${baseUrl}/admin/paquete-express/label/pdf/${shipment.master.nationalTracking}`);
        }

        return null;
    };

    const handlePrintAssignedCarrierGuide = (opts?: { format4x6?: boolean }) => {
        const guideUrl = getAssignedCarrierGuideUrl(opts);
        if (!guideUrl) {
            setError('No hay guía disponible para la paquetería asignada');
            return;
        }
        window.open(guideUrl, '_blank');
    };

    const getUploadedExternalGuideUrl = (): string | null => {
        if (!shipment) return null;
        const raw = String(shipment.master.deliveryDocuments?.guiaExterna?.url || '').trim();
        if (!raw) return null;

        if (/^https?:\/\//i.test(raw)) return raw;

        const baseUrl = (api.defaults.baseURL || '').replace(/\/$/, '');
        const baseEndsWithApi = /\/api$/.test(baseUrl);
        const path = baseEndsWithApi && raw.startsWith('/api/') ? raw.slice(4) : raw;

        if (path.startsWith('/')) return `${baseUrl}${path}`;
        return `${baseUrl}/${path}`;
    };

    // Construye URL de PDF para cualquier tracking PQTX (de hija o master)
    const buildPqtxLabelUrl = (tracking: string, opts?: { format4x6?: boolean }): string => {
        const baseUrl = (api.defaults.baseURL || '').replace(/\/$/, '');
        const url = `${baseUrl}/admin/paquete-express/label/pdf/${tracking}`;
        return opts?.format4x6 ? with4x6Format(url) : url;
    };

    // Una sola guía PQTX (multipieza). Si hay hijas comparten el mismo national_tracking.
    const pqtxGuides: Array<{ tracking: string; pieces: number; childId: number | null }> = (() => {
        if (!shipment) return [];
        const totalPieces = Math.max(1, shipment.master.totalBoxes || (shipment.children || []).length || 1);
        if (shipment.master.nationalTracking) {
            return [{ tracking: shipment.master.nationalTracking, pieces: totalPieces, childId: null }];
        }
        // Fallback: alguna hija con tracking (sistemas legacy con guías por caja antes del refactor)
        const firstChildWithTracking = (shipment.children || []).find(c => c.nationalTracking);
        if (firstChildWithTracking?.nationalTracking) {
            return [{ tracking: firstChildWithTracking.nationalTracking as string, pieces: totalPieces, childId: firstChildWithTracking.id }];
        }
        return [];
    })();

    const toggleSelectAllPqtx = () => {
        setSelectedPqtx(prev => {
            if (prev.size === pqtxGuides.length) return new Set();
            return new Set(pqtxGuides.map(g => g.tracking));
        });
    };

    const handlePrintAllPqtx = (trackings: string[], opts?: { format4x6?: boolean }) => {
        if (trackings.length === 0) {
            setError('Selecciona al menos una guía para imprimir');
            return;
        }
        trackings.forEach((t, idx) => {
            const url = buildPqtxLabelUrl(t, opts);
            setTimeout(() => window.open(url, '_blank'), idx * 250);
        });
    };

    // 🔄 Auto-impresión cuando se re-escanea la misma guía
    useEffect(() => {
        if (!shipment || !autoPrintPendingRef.current) return;
        autoPrintPendingRef.current = false;
        const ac = getAssignedCarrier(shipment);
        const isLocal = !!(ac && isEntregaxLocalCarrier(ac.normalized));
        const isPqtx = !!(ac && isPaqueteExpressCarrier(ac.normalized));
        const hasAddress = !!shipment.master.assignedAddress;
        // pequeño delay para que React termine de renderizar
        const t = setTimeout(() => {
            if (isPqtx && shipment.master.nationalTracking) {
                window.open(buildPqtxLabelUrl(shipment.master.nationalTracking, { format4x6: true }), '_blank');
                setPqtxMsg('🖨️ Auto-impresión: Etiqueta Paquete Express');
            } else if ((isLocal || !ac) && hasAddress) {
                handlePrintLocalDelivery();
                setPqtxMsg('🖨️ Auto-impresión: Etiqueta Local');
            } else {
                setPqtxMsg(null);
            }
        }, 200);
        return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shipment]);

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Button
                        variant="outlined"
                        startIcon={<ArrowBackIcon />}
                        onClick={() => onBack ? onBack() : navigate(-1)}
                        sx={{ borderColor: '#F05A28', color: '#F05A28', '&:hover': { borderColor: '#d44a1f', bgcolor: 'rgba(240,90,40,0.05)' } }}
                    >
                        Atrás
                    </Button>
                    <Box
                        sx={{
                            bgcolor: '#F05A28',
                            color: 'white',
                            width: 56,
                            height: 56,
                            borderRadius: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <PrintIcon sx={{ fontSize: 32 }} />
                    </Box>
                    <Box>
                        <Typography variant="h4" fontWeight={700}>
                            Módulo de etiquetado
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Reimprime etiquetas de cualquier paquete en el sistema (PO Box USA, China Aéreo, China Marítimo, DHL, Nacional)
                        </Typography>
                    </Box>
                </Box>
            </Box>

            {/* Search */}
            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                    🔍 Buscar paquete por tracking
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                        fullWidth
                        autoFocus
                        placeholder="Escanea o escribe el tracking (ej. US-00YB3779, CN-1234, LOG-5678)..."
                        value={tracking}
                        onChange={(e) => setTracking(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                        disabled={loading}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <QrCodeScannerIcon color="action" />
                                </InputAdornment>
                            ),
                            endAdornment: tracking && (
                                <InputAdornment position="end">
                                    <IconButton size="small" onClick={handleClear}>
                                        <ClearIcon fontSize="small" />
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                    />
                    <Button
                        variant="contained"
                        onClick={handleSearch}
                        disabled={loading || !tracking.trim()}
                        startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
                        sx={{ minWidth: 140, bgcolor: '#F05A28', '&:hover': { bgcolor: '#C1272D' } }}
                    >
                        {loading ? 'Buscando...' : 'Buscar'}
                    </Button>
                </Box>
            </Paper>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {/* Resultado */}
            {shipment && (
                <Paper sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, gap: 2 }}>
                        <Box sx={{ flex: 1 }}>
                            <Typography variant="h5" fontWeight={700} sx={{ fontFamily: 'monospace' }}>
                                {shipment.master.tracking}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                                {(() => {
                                    const s = getServiceInfo(shipment.master.tracking);
                                    return (
                                        <Chip
                                            label={`${s.emoji} ${s.label}`}
                                            sx={{ bgcolor: s.color, color: 'white', fontWeight: 600 }}
                                        />
                                    );
                                })()}
                                <Chip label={shipment.master.statusLabel} variant="outlined" />
                                {shipment.master.totalBoxes > 1 && (
                                    <Chip
                                        label={`${shipment.master.totalBoxes} cajas`}
                                        color="primary"
                                        variant="outlined"
                                    />
                                )}
                                {assignedCarrier && (
                                    <Chip
                                        label={`🚚 ${assignedCarrier.displayName}`}
                                        sx={{ bgcolor: '#1976d2', color: 'white', fontWeight: 700 }}
                                    />
                                )}
                                {(() => {
                                    const paid = shipment.master.clientPaid || shipment.master.paymentStatus === 'paid';
                                    return (
                                        <Chip
                                            label={paid ? '✅ PAGADO' : '⏳ POR PAGAR'}
                                            sx={{
                                                bgcolor: paid ? '#2E7D32' : '#D32F2F',
                                                color: 'white',
                                                fontWeight: 800,
                                                letterSpacing: 0.5,
                                            }}
                                        />
                                    );
                                })()}
                            </Box>
                        </Box>
                        {shipment.master.destinationCode && (
                            <Box
                                sx={{
                                    minWidth: 140,
                                    px: 2,
                                    py: 1.5,
                                    border: '3px solid #C1272D',
                                    borderRadius: 2,
                                    bgcolor: '#FFF3E0',
                                    textAlign: 'center',
                                    boxShadow: 2,
                                }}
                            >
                                <Typography variant="caption" sx={{ color: '#666', fontWeight: 700, letterSpacing: 1 }}>
                                    DESTINO
                                </Typography>
                                <Typography sx={{ fontSize: 44, fontWeight: 900, color: '#C1272D', lineHeight: 1, fontFamily: 'Arial Black, sans-serif' }}>
                                    {shipment.master.destinationCode}
                                </Typography>
                                {shipment.master.destinationCity && (
                                    <Typography variant="caption" sx={{ color: '#444', fontWeight: 600 }}>
                                        {shipment.master.destinationCity}
                                    </Typography>
                                )}
                            </Box>
                        )}
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Typography variant="caption" color="text.secondary">Cliente</Typography>
                            <Typography variant="body1" fontWeight={600}>{shipment.client.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                                Box: {shipment.client.boxId} · {shipment.client.email || '—'}
                            </Typography>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Typography variant="caption" color="text.secondary">Descripción</Typography>
                            <Typography variant="body2">{shipment.master.description || '—'}</Typography>
                            {shipment.master.receivedAt && (
                                <Typography variant="caption" color="text.secondary">
                                    Recibido: {new Date(shipment.master.receivedAt).toLocaleDateString()}
                                </Typography>
                            )}
                        </Grid>
                    </Grid>

                    {shipment.master.assignedAddress && (
                        <Box
                            sx={{
                                mt: 1,
                                mb: 2,
                                p: 2,
                                border: '2px dashed #F05A28',
                                borderRadius: 2,
                                bgcolor: '#FFF8F4',
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#C1272D' }}>
                                    📍 Dirección de Entrega
                                </Typography>
                                {assignedCarrier && (
                                    <Chip
                                        size="small"
                                        label={`🚚 ${assignedCarrier.displayName}`}
                                        sx={{ bgcolor: '#1976d2', color: 'white', fontWeight: 700 }}
                                    />
                                )}
                            </Box>
                            <Typography variant="body2" fontWeight={700}>
                                {shipment.master.assignedAddress.recipientName || shipment.client.name}
                            </Typography>
                            <Typography variant="body2">
                                {shipment.master.assignedAddress.street} {shipment.master.assignedAddress.exterior || ''}
                                {shipment.master.assignedAddress.interior ? ` Int. ${shipment.master.assignedAddress.interior}` : ''}
                            </Typography>
                            <Typography variant="body2">
                                {shipment.master.assignedAddress.neighborhood ? `Col. ${shipment.master.assignedAddress.neighborhood}, ` : ''}
                                C.P. {shipment.master.assignedAddress.zip || '—'}
                            </Typography>
                            <Typography variant="body2" fontWeight={600}>
                                {shipment.master.assignedAddress.city}
                                {shipment.master.assignedAddress.state ? `, ${shipment.master.assignedAddress.state}` : ''}
                            </Typography>
                            {shipment.master.assignedAddress.phone && (
                                <Typography variant="caption" color="text.secondary">
                                    📞 {shipment.master.assignedAddress.phone}
                                </Typography>
                            )}
                            {shipment.master.assignedAddress.reference && (
                                <Typography variant="caption" sx={{ display: 'block', color: '#666', fontStyle: 'italic' }}>
                                    Ref: {shipment.master.assignedAddress.reference}
                                </Typography>
                            )}
                        </Box>
                    )}

                    <Divider sx={{ my: 2 }} />

                    {(() => {
                        // Si existe un master multi-caja, solo mostramos el master (con botón de rango).
                        // Las hijas NO se muestran porque se imprimen desde el botón "Reimprimir rango" del master.
                        const masterMulti = shipment.labels.find(l => l.isMaster && l.totalBoxes > 1);
                        const visibleLabels = masterMulti
                            ? shipment.labels.filter(l => l.isMaster)
                            : shipment.labels;
                        return (
                            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                                🏷️ Etiquetas disponibles ({visibleLabels.length})
                            </Typography>
                        );
                    })()}

                    <Grid container spacing={2}>
                        {(() => {
                            const masterMulti = shipment.labels.find(l => l.isMaster && l.totalBoxes > 1);
                            const visibleLabels = masterMulti
                                ? shipment.labels.filter(l => l.isMaster)
                                : shipment.labels;
                            return visibleLabels.map((label, idx) => (
                            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={idx}>
                                <Paper
                                    variant="outlined"
                                    sx={{
                                        p: 2,
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        transition: 'all 0.2s',
                                        '&:hover': { borderColor: '#F05A28', boxShadow: 2 },
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                        <LocalShippingIcon sx={{ color: '#F05A28' }} />
                                        <Typography variant="body2" fontWeight={700}>
                                            {label.isMaster
                                                ? 'Master'
                                                : label.totalBoxes > 1
                                                    ? `Reimprimir Etiqueta Origen — Caja ${label.boxNumber} de ${label.totalBoxes}`
                                                    : 'Reimprimir Etiqueta Origen'}
                                        </Typography>
                                    </Box>
                                    <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13, mb: 1 }}>
                                        {label.tracking}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                                        {label.weight ? `${Number(label.weight).toFixed(2)} kg` : ''}
                                        {label.dimensions ? ` · ${label.dimensions}` : ''}
                                    </Typography>
                                    <Box sx={{ flex: 1 }} />
                                    {label.totalBoxes > 1 && !label.isMaster ? (
                                        /^LOG/i.test(label.tracking) ? (
                                            // LOG marítimo: solo botón "Reimprimir rango" en naranja sólido
                                            <Button
                                                fullWidth
                                                variant="contained"
                                                startIcon={<PrintIcon />}
                                                onClick={() => openReprintModal(label)}
                                                sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#C1272D' } }}
                                            >
                                                Reimprimir Etiquetas (1–{label.totalBoxes})
                                            </Button>
                                        ) : (
                                            <Stack spacing={1}>
                                                <Button
                                                    fullWidth
                                                    variant="contained"
                                                    startIcon={<PrintIcon />}
                                                    onClick={() => handlePrintLabel(label)}
                                                    sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#C1272D' } }}
                                                >
                                                    Imprimir caja {label.boxNumber}
                                                </Button>
                                                <Button
                                                    fullWidth
                                                    variant="outlined"
                                                    startIcon={<PrintOutlinedIcon />}
                                                    onClick={() => openReprintModal(label)}
                                                    sx={{ borderColor: '#F05A28', color: '#F05A28' }}
                                                >
                                                    Reimprimir rango (1–{label.totalBoxes})
                                                </Button>
                                            </Stack>
                                        )
                                    ) : label.isMaster && label.totalBoxes > 1 ? (
                                        <Stack spacing={1}>
                                            <Button
                                                fullWidth
                                                variant="contained"
                                                startIcon={<PrintIcon />}
                                                onClick={() => openReprintModal(label)}
                                                sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#C1272D' } }}
                                            >
                                                Reimprimir rango (1–{label.totalBoxes})
                                            </Button>
                                            <Button
                                                fullWidth
                                                variant="outlined"
                                                startIcon={<PrintOutlinedIcon />}
                                                onClick={() => handlePrintLabel(label)}
                                                sx={{ borderColor: '#F05A28', color: '#F05A28' }}
                                            >
                                                Imprimir solo Master
                                            </Button>
                                        </Stack>
                                    ) : (
                                        <Button
                                            fullWidth
                                            variant="contained"
                                            startIcon={<PrintIcon />}
                                            onClick={() => handlePrintLabel(label)}
                                            sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#C1272D' } }}
                                        >
                                            Imprimir
                                        </Button>
                                    )}
                                </Paper>
                            </Grid>
                        ));
                        })()}

                        {hasAssignedCarrier && isPaqueteExpressAssigned && pqtxGuides.length > 0 && (
                            <>
                                {pqtxGuides.length > 1 && (
                                    <Grid size={{ xs: 12 }}>
                                        <Paper
                                            variant="outlined"
                                            sx={{
                                                p: 1.5,
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                alignItems: 'center',
                                                gap: 1.5,
                                                borderColor: '#1976d2',
                                                bgcolor: '#E3F2FD',
                                            }}
                                        >
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <Checkbox
                                                    size="small"
                                                    checked={selectedPqtx.size === pqtxGuides.length && pqtxGuides.length > 0}
                                                    indeterminate={selectedPqtx.size > 0 && selectedPqtx.size < pqtxGuides.length}
                                                    onChange={toggleSelectAllPqtx}
                                                />
                                                <Typography variant="body2" fontWeight={700} sx={{ color: '#1976d2' }}>
                                                    {selectedPqtx.size === 0
                                                        ? 'Seleccionar todas'
                                                        : selectedPqtx.size === pqtxGuides.length
                                                            ? `Todas seleccionadas (${selectedPqtx.size})`
                                                            : `${selectedPqtx.size} de ${pqtxGuides.length} seleccionadas`}
                                                </Typography>
                                            </Box>
                                            <Box sx={{ flex: 1 }} />
                                            <Button
                                                size="small"
                                                variant="contained"
                                                startIcon={<PrintIcon />}
                                                onClick={() => handlePrintAllPqtx(pqtxGuides.map(g => g.tracking), { format4x6: true })}
                                                sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#0d47a1' } }}
                                            >
                                                Imprimir todas las etiquetas ({pqtxGuides.length})
                                            </Button>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                startIcon={<PrintOutlinedIcon />}
                                                disabled={selectedPqtx.size === 0}
                                                onClick={() => handlePrintAllPqtx(
                                                    pqtxGuides.filter(g => selectedPqtx.has(g.tracking)).map(g => g.tracking),
                                                    { format4x6: true }
                                                )}
                                                sx={{ borderColor: '#1976d2', color: '#1976d2' }}
                                            >
                                                Imprimir seleccionadas ({selectedPqtx.size})
                                            </Button>
                                        </Paper>
                                    </Grid>
                                )}
                                {pqtxGuides.map((g, idx) => (
                                    <Grid size={{ xs: 12, sm: 8, md: 6 }} key={`pqtx-${g.tracking}-${idx}`}>
                                        <Paper
                                            variant="outlined"
                                            sx={{
                                                p: 2,
                                                height: '100%',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                borderColor: '#1976d2',
                                                borderWidth: 1,
                                                bgcolor: '#F3F8FF',
                                            }}
                                        >
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                                <LocalShippingIcon sx={{ color: '#1976d2' }} />
                                                <Typography variant="body2" fontWeight={700} sx={{ color: '#1976d2' }}>
                                                    {g.pieces > 1
                                                        ? `Guía Paquete Express — Multipieza (${g.pieces} cajas)`
                                                        : carrierGuideTitle}
                                                </Typography>
                                            </Box>
                                            <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 14, mb: 1 }}>
                                                {g.tracking}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                                                {g.pieces > 1
                                                    ? `Una sola guía PQTX que ampara las ${g.pieces} cajas del envío`
                                                    : 'Imprime la guía de la paquetería asignada'}
                                            </Typography>
                                            <Box sx={{ flex: 1 }} />
                                            <Box sx={{ display: 'grid', gap: 1 }}>
                                                <Button
                                                    fullWidth
                                                    variant="contained"
                                                    startIcon={<PrintIcon />}
                                                    onClick={() => window.open(buildPqtxLabelUrl(g.tracking, { format4x6: true }), '_blank')}
                                                    sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#0d47a1' } }}
                                                >
                                                    Imprimir Etiqueta {g.pieces > 1 ? `(${g.pieces} cajas)` : ''}
                                                </Button>
                                                <Button
                                                    fullWidth
                                                    variant="outlined"
                                                    startIcon={<PrintIcon />}
                                                    onClick={() => window.open(buildPqtxLabelUrl(g.tracking), '_blank')}
                                                    sx={{ borderColor: '#1976d2', color: '#1976d2', '&:hover': { borderColor: '#0d47a1', color: '#0d47a1' } }}
                                                >
                                                    Imprimir guía
                                                </Button>
                                            </Box>
                                        </Paper>
                                    </Grid>
                                ))}
                                {pqtxMsg && (
                                    <Grid size={{ xs: 12 }}>
                                        <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
                                            {pqtxMsg}
                                        </Typography>
                                    </Grid>
                                )}
                            </>
                        )}

                        {hasAssignedCarrier && !isEntregaxLocalAssigned && !(isPaqueteExpressAssigned && pqtxGuides.length > 0) && (
                            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                                <Paper
                                    variant="outlined"
                                    sx={{
                                        p: 2,
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        borderColor: '#1976d2',
                                        bgcolor: '#F3F8FF',
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                        <LocalShippingIcon sx={{ color: '#1976d2' }} />
                                        <Typography variant="body2" fontWeight={700} sx={{ color: '#1976d2' }}>
                                            {carrierGuideTitle}
                                        </Typography>
                                    </Box>
                                    {getAssignedCarrierGuideUrl() ? (
                                        <>
                                            <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13, mb: 1 }}>
                                                {shipment.master.nationalTracking || 'Guía disponible'}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                                                Imprime la guía de la paquetería asignada
                                            </Typography>
                                            <Box sx={{ flex: 1 }} />
                                            <Button
                                                fullWidth
                                                variant="contained"
                                                startIcon={<PrintIcon />}
                                                onClick={() => handlePrintAssignedCarrierGuide()}
                                                sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#0d47a1' } }}
                                            >
                                                Imprimir guía asignada
                                            </Button>
                                        </>
                                    ) : isPaqueteExpressAssigned ? (
                                        <>
                                            <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                                                {(shipment.master.totalBoxes || 1) > 1
                                                    ? `Aún no generada. Se creará 1 guía multipieza para ${shipment.master.totalBoxes} cajas con la API de Paquete Express usando la dirección de entrega asignada.`
                                                    : 'Aún no generada. Se creará en línea con la API de Paquete Express usando la dirección de entrega asignada.'}
                                            </Typography>
                                            <Box sx={{ flex: 1 }} />
                                            <Button
                                                fullWidth
                                                variant="contained"
                                                startIcon={generatingPqtx ? <CircularProgress size={16} color="inherit" /> : <LocalShippingIcon />}
                                                onClick={handleGeneratePqtxLabel}
                                                disabled={generatingPqtx}
                                                sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#0d47a1' } }}
                                            >
                                                {generatingPqtx
                                                    ? 'Generando...'
                                                    : (shipment.master.totalBoxes || 1) > 1
                                                        ? `Generar guía PQTX (${shipment.master.totalBoxes} cajas)`
                                                        : 'Generar guía PQTX'}
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                                                Esta paquetería aún no tiene guía nacional disponible para impresión.
                                            </Typography>
                                            <Box sx={{ flex: 1 }} />
                                            {getUploadedExternalGuideUrl() ? (
                                                <Button
                                                    fullWidth
                                                    variant="contained"
                                                    startIcon={<PrintIcon />}
                                                    onClick={() => window.open(getUploadedExternalGuideUrl() as string, '_blank')}
                                                    sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#0d47a1' } }}
                                                >
                                                    Descargar guía subida por cliente
                                                </Button>
                                            ) : (
                                                <Button
                                                    fullWidth
                                                    variant="contained"
                                                    startIcon={<PrintIcon />}
                                                    disabled
                                                    sx={{ bgcolor: '#90A4AE', '&.Mui-disabled': { bgcolor: '#B0BEC5', color: '#ECEFF1' } }}
                                                >
                                                    Guía no disponible
                                                </Button>
                                            )}
                                        </>
                                    )}
                                    {pqtxMsg && (
                                        <Typography variant="caption" sx={{ mt: 1, color: 'success.main', fontWeight: 600 }}>
                                            {pqtxMsg}
                                        </Typography>
                                    )}
                                </Paper>
                            </Grid>
                        )}

                        {shipment.master.assignedAddress && (!hasAssignedCarrier || isEntregaxLocalAssigned) && (
                            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                                <Paper
                                    variant="outlined"
                                    sx={{
                                        p: 2,
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        borderColor: '#F05A28',
                                        bgcolor: '#FFF6F0',
                                        borderWidth: 2,
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                        <LocalShippingIcon sx={{ color: '#F05A28' }} />
                                        <Typography variant="body2" fontWeight={800} sx={{ color: '#F05A28' }}>
                                            Entrega Local EntregaX
                                        </Typography>
                                    </Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                                        Etiqueta con marca EntregaX para repartidor local.
                                    </Typography>
                                    <Typography variant="caption" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>
                                        🏠 {shipment.master.assignedAddress.alias || shipment.master.assignedAddress.recipientName}
                                        <br />
                                        📍 {shipment.master.assignedAddress.city}, CP {shipment.master.assignedAddress.zip}
                                    </Typography>
                                    <Box sx={{ flex: 1 }} />
                                    <Button
                                        fullWidth
                                        variant="contained"
                                        startIcon={<PrintIcon />}
                                        onClick={handlePrintLocalDelivery}
                                        sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#C1272D' } }}
                                    >
                                        Imprimir Etiqueta Local
                                    </Button>
                                </Paper>
                            </Grid>
                        )}
                    </Grid>
                </Paper>
            )}

            {!shipment && !loading && !error && (
                <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'grey.50' }}>
                    <QrCodeScannerIcon sx={{ fontSize: 64, color: 'grey.400' }} />
                    <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
                        Escanea el QR o escribe el tracking del paquete para reimprimir su etiqueta
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Soporta todos los servicios: PO Box USA · China Aéreo · China Marítimo · DHL · Nacional
                    </Typography>
                </Paper>
            )}

            {/* Modal de reimpresión por rango de cajas */}
            <Dialog open={reprintOpen} onClose={() => setReprintOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ bgcolor: '#F05A28', color: 'white', fontWeight: 700 }}>
                    🖨️ Reimprimir rango de cajas
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    {reprintLabel && (
                        <Stack spacing={2} sx={{ mt: 1 }}>
                            <Box>
                                <Typography variant="caption" color="text.secondary">Tracking base</Typography>
                                <Typography sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                    {reprintLabel.tracking.replace(/-\d{1,3}$/, '')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Total de cajas: <strong>{reprintLabel.totalBoxes}</strong>
                                </Typography>
                            </Box>

                            <Alert severity="info" sx={{ py: 0.5 }}>
                                Selecciona desde qué caja hasta qué caja quieres reimprimir.
                                Se generará una etiqueta por cada caja del rango.
                            </Alert>

                            <Box sx={{ display: 'flex', gap: 2 }}>
                                <TextField
                                    label="Desde"
                                    type="number"
                                    fullWidth
                                    value={reprintFrom}
                                    onChange={(e) => setReprintFrom(Number(e.target.value))}
                                    inputProps={{ min: 1, max: reprintLabel.totalBoxes }}
                                />
                                <TextField
                                    label="Hasta"
                                    type="number"
                                    fullWidth
                                    value={reprintTo}
                                    onChange={(e) => setReprintTo(Number(e.target.value))}
                                    inputProps={{ min: 1, max: reprintLabel.totalBoxes }}
                                />
                            </Box>

                            {/* Atajos rápidos */}
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => { setReprintFrom(1); setReprintTo(reprintLabel.totalBoxes); }}
                                >
                                    Todas (1–{reprintLabel.totalBoxes})
                                </Button>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => { setReprintFrom(reprintLabel.boxNumber); setReprintTo(reprintLabel.boxNumber); }}
                                >
                                    Solo caja {reprintLabel.boxNumber}
                                </Button>
                            </Box>

                            <Box sx={{ p: 1.5, bgcolor: '#FFF3E0', borderRadius: 1, border: '1px solid #FFB74D' }}>
                                <Typography variant="body2" fontWeight={600}>
                                    Se imprimirán <strong>
                                        {Math.max(0, Math.min(reprintLabel.totalBoxes, Math.floor(reprintTo || 0)) - Math.max(1, Math.floor(reprintFrom || 0)) + 1)}
                                    </strong> etiqueta(s)
                                </Typography>
                            </Box>
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setReprintOpen(false)}>Cancelar</Button>
                    <Button
                        variant="contained"
                        startIcon={<PrintIcon />}
                        onClick={handleConfirmReprintRange}
                        sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#C1272D' } }}
                    >
                        Imprimir
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Modal: captura de medidas por caja para LOG marítimo antes de generar PQTX */}
            <Dialog open={dimsModalOpen} onClose={() => setDimsModalOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ bgcolor: '#0277BD', color: 'white' }}>
                    Capturar medidas y peso por caja
                    {shipment && (
                        <Typography variant="body2" sx={{ opacity: 0.9 }}>
                            {shipment.master.tracking} · {dimsBoxes.filter(b => b.captured).length}/{dimsBoxes.length} cajas listas
                        </Typography>
                    )}
                </DialogTitle>
                <DialogContent sx={{ pt: 2 }}>
                    {dimsLoading ? (
                        <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
                    ) : (
                        <Stack spacing={2} sx={{ mt: 1 }}>
                            {dimsError && <Alert severity="warning" onClose={() => setDimsError(null)}>{dimsError}</Alert>}

                            <TextField
                                inputRef={dimsScanRef}
                                label="Escanear etiqueta de caja"
                                placeholder="Escanea el código (ej: LOG26CNMX00082-05) o teclea número"
                                value={dimsScan}
                                onChange={(e) => handleDimsScan(e.target.value)}
                                onKeyDown={handleDimsScanKeyDown}
                                fullWidth
                                autoFocus
                                size="medium"
                                sx={{ '& input': { fontSize: 18, fontFamily: 'monospace' } }}
                            />

                            {dimsActiveBox && (
                                <Box sx={{ p: 2, bgcolor: '#E1F5FE', borderRadius: 1, border: '2px solid #0277BD' }}>
                                    <Typography variant="h6" gutterBottom>
                                        Caja {dimsActiveBox} de {dimsBoxes.length}
                                        {dimsBoxes.find(b => b.boxNumber === dimsActiveBox)?.captured && (
                                            <Typography component="span" sx={{ ml: 1, color: 'success.main', fontSize: 14 }}>
                                                (ya capturada — editando)
                                            </Typography>
                                        )}
                                    </Typography>
                                    <Stack direction="row" spacing={1.5}>
                                        <TextField
                                            label="Peso (kg)"
                                            type="number"
                                            value={dimsForm.weight}
                                            onChange={(e) => setDimsForm({ ...dimsForm, weight: e.target.value })}
                                            inputProps={{ step: '0.01', min: '0' }}
                                            fullWidth
                                            InputProps={{
                                                endAdornment: (
                                                    <Button
                                                        size="small"
                                                        onClick={handleReadScaleForBox}
                                                        disabled={scaleReading}
                                                        sx={{ minWidth: 'auto', px: 1, fontSize: 11, fontWeight: 700, color: '#0277BD' }}
                                                        title="Leer peso desde báscula USB"
                                                    >
                                                        {scaleReading ? <CircularProgress size={14} /> : '⚖️ Báscula'}
                                                    </Button>
                                                ),
                                            }}
                                        />
                                        <TextField
                                            label="Largo (cm)"
                                            type="number"
                                            value={dimsForm.length}
                                            onChange={(e) => setDimsForm({ ...dimsForm, length: e.target.value })}
                                            inputProps={{ step: '0.1', min: '0' }}
                                            fullWidth
                                        />
                                        <TextField
                                            label="Ancho (cm)"
                                            type="number"
                                            value={dimsForm.width}
                                            onChange={(e) => setDimsForm({ ...dimsForm, width: e.target.value })}
                                            inputProps={{ step: '0.1', min: '0' }}
                                            fullWidth
                                        />
                                        <TextField
                                            label="Alto (cm)"
                                            type="number"
                                            value={dimsForm.height}
                                            onChange={(e) => setDimsForm({ ...dimsForm, height: e.target.value })}
                                            inputProps={{ step: '0.1', min: '0' }}
                                            fullWidth
                                        />
                                    </Stack>
                                    {scaleLive && liveWeight !== null && liveWeight > 0 && (
                                        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#0277BD', fontWeight: 700 }}>
                                            ⚖️ Báscula en vivo: {liveWeight.toFixed(2)} kg
                                        </Typography>
                                    )}
                                    <Button
                                        variant="contained"
                                        onClick={saveDimsBox}
                                        disabled={dimsSaving}
                                        startIcon={dimsSaving ? <CircularProgress size={18} /> : null}
                                        sx={{ mt: 1.5, bgcolor: '#0277BD' }}
                                        fullWidth
                                    >
                                        {dimsSaving ? 'Guardando...' : `Guardar caja ${dimsActiveBox}`}
                                    </Button>
                                </Box>
                            )}

                            {!dimsActiveBox && dimsBoxes.length > 0 && dimsBoxes.every(b => b.captured) && (
                                <Alert severity="success">
                                    ✅ Todas las cajas tienen medidas capturadas. Ya puedes generar la guía.
                                </Alert>
                            )}

                            <Box>
                                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, flexWrap: 'wrap', gap: 1 }}>
                                    <Typography variant="subtitle2">
                                        Cajas ({dimsBoxes.filter(b => b.captured).length}/{dimsBoxes.length})
                                        {dimsSelected.size > 0 && (
                                            <Chip
                                                label={`${dimsSelected.size} seleccionada(s)`}
                                                size="small"
                                                color="primary"
                                                sx={{ ml: 1 }}
                                            />
                                        )}
                                    </Typography>
                                    <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                        <Button
                                            size="small"
                                            variant={dimsSelectMode ? 'contained' : 'outlined'}
                                            onClick={() => {
                                                setDimsSelectMode(!dimsSelectMode);
                                                if (dimsSelectMode) setDimsSelected(new Set());
                                            }}
                                            sx={{ fontSize: 11 }}
                                        >
                                            {dimsSelectMode ? '✕ Salir selección' : '☑️ Seleccionar'}
                                        </Button>
                                        {dimsSelectMode && (
                                            <>
                                                <Button size="small" variant="outlined" onClick={selectAllDimsBoxes} sx={{ fontSize: 11 }}>
                                                    Todas
                                                </Button>
                                                <Button size="small" variant="outlined" onClick={selectPendingDimsBoxes} sx={{ fontSize: 11 }}>
                                                    Pendientes
                                                </Button>
                                                <Button size="small" variant="outlined" onClick={clearDimsSelection} sx={{ fontSize: 11 }}>
                                                    Limpiar
                                                </Button>
                                                <Button
                                                    size="small"
                                                    variant="contained"
                                                    color="success"
                                                    onClick={applyDimsToSelection}
                                                    disabled={dimsSaving || dimsSelected.size === 0}
                                                    sx={{ fontSize: 11 }}
                                                >
                                                    {dimsSaving ? <CircularProgress size={14} /> : `Aplicar a ${dimsSelected.size}`}
                                                </Button>
                                            </>
                                        )}
                                    </Stack>
                                </Stack>
                                {dimsSelectMode && (
                                    <Alert severity="info" sx={{ mb: 1, py: 0.5 }}>
                                        Captura peso y medidas arriba, luego haz clic en las cajas a aplicar y presiona <strong>"Aplicar a N"</strong>.
                                    </Alert>
                                )}
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: 0.75, maxHeight: 220, overflowY: 'auto', p: 1, border: '1px solid #ddd', borderRadius: 1 }}>
                                    {dimsBoxes.map(b => {
                                        const isSelected = dimsSelected.has(b.boxNumber);
                                        return (
                                        <Box
                                            key={b.boxNumber}
                                            onClick={() => {
                                                if (dimsSelectMode) {
                                                    toggleDimsSelected(b.boxNumber);
                                                    return;
                                                }
                                                setDimsActiveBox(b.boxNumber);
                                                if (b.captured) {
                                                    setDimsForm({
                                                        weight: String(b.weight ?? ''),
                                                        length: String(b.length ?? ''),
                                                        width: String(b.width ?? ''),
                                                        height: String(b.height ?? ''),
                                                    });
                                                } else {
                                                    setDimsForm({ weight: '', length: '', width: '', height: '' });
                                                }
                                            }}
                                            sx={{
                                                p: 0.75,
                                                textAlign: 'center',
                                                borderRadius: 1,
                                                cursor: 'pointer',
                                                bgcolor: isSelected ? '#1976D2' : (b.captured ? '#C8E6C9' : '#FFCDD2'),
                                                color: isSelected ? '#FFF' : 'inherit',
                                                border: !dimsSelectMode && dimsActiveBox === b.boxNumber ? '2px solid #0277BD' : '1px solid transparent',
                                                fontWeight: 600,
                                                fontSize: 13,
                                            }}
                                        >
                                            {isSelected ? '☑ ' : (b.captured ? '✓ ' : '')}{b.boxNumber}
                                        </Box>
                                        );
                                    })}
                                </Box>
                            </Box>
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setDimsModalOpen(false)}>Cerrar</Button>
                    <Button
                        variant="contained"
                        onClick={handleGenerateMaritimePqtx}
                        disabled={generatingPqtx || dimsBoxes.length === 0 || dimsBoxes.some(b => !b.captured)}
                        startIcon={generatingPqtx ? <CircularProgress size={18} /> : null}
                        sx={{ bgcolor: '#2E7D32', '&:hover': { bgcolor: '#1B5E20' } }}
                    >
                        {generatingPqtx ? 'Generando...' : 'Generar guía PQTX'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Confirmación de aplicación masiva de medidas */}
            <Dialog
                open={bulkConfirmOpen}
                onClose={() => setBulkConfirmOpen(false)}
                maxWidth="xs"
                fullWidth
                PaperProps={{ sx: { borderRadius: 2, overflow: 'hidden' } }}
            >
                <Box sx={{ background: 'linear-gradient(135deg, #C1272D 0%, #F05A28 100%)', color: '#FFF', p: 2.5, textAlign: 'center' }}>
                    <Typography variant="h2" sx={{ fontSize: 48, lineHeight: 1, mb: 1 }}>📦</Typography>
                    <Typography variant="h6" fontWeight={700}>
                        Aplicar medidas en lote
                    </Typography>
                </Box>
                <DialogContent sx={{ p: 3 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: 'center' }}>
                        Se aplicarán los siguientes valores a
                        {' '}
                        <Box component="span" sx={{ color: '#F05A28', fontWeight: 800, fontSize: 18 }}>
                            {dimsSelected.size > 0 ? dimsSelected.size : dimsBoxes.length} caja(s)
                        </Box>
                        :
                    </Typography>
                    <Box sx={{ bgcolor: '#FAFAFA', borderRadius: 2, p: 2, border: '1px solid #E0E0E0' }}>
                        <Stack spacing={1.2}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Typography variant="body2" color="text.secondary">⚖️ Peso</Typography>
                                <Typography variant="body1" fontWeight={700}>{dimsForm.weight} kg</Typography>
                            </Stack>
                            <Divider />
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Typography variant="body2" color="text.secondary">📏 Largo</Typography>
                                <Typography variant="body1" fontWeight={700}>{dimsForm.length} cm</Typography>
                            </Stack>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Typography variant="body2" color="text.secondary">📐 Ancho</Typography>
                                <Typography variant="body1" fontWeight={700}>{dimsForm.width} cm</Typography>
                            </Stack>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Typography variant="body2" color="text.secondary">📏 Alto</Typography>
                                <Typography variant="body1" fontWeight={700}>{dimsForm.height} cm</Typography>
                            </Stack>
                        </Stack>
                    </Box>
                    {dimsSelected.size > 0 && dimsSelected.size <= 20 && (
                        <Box sx={{ mt: 2 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                Cajas afectadas:
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                {Array.from(dimsSelected).sort((a, b) => a - b).map(n => (
                                    <Chip key={n} label={n} size="small" sx={{ bgcolor: '#1976D2', color: '#FFF', fontWeight: 700 }} />
                                ))}
                            </Box>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0, gap: 1 }}>
                    <Button onClick={() => setBulkConfirmOpen(false)} variant="outlined" fullWidth>
                        Cancelar
                    </Button>
                    <Button
                        onClick={confirmBulkApply}
                        variant="contained"
                        fullWidth
                        sx={{ bgcolor: '#2E7D32', '&:hover': { bgcolor: '#1B5E20' } }}
                    >
                        ✓ Aplicar
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
