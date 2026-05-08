// ============================================
// WIZARD DE RECEPCIÓN POR AWB (TDI Aéreo China)
// Estilo similar a POBoxConsolidationReceptionWizard
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
    Flight as FlightIcon,
    Print as PrintIcon,
} from '@mui/icons-material';
import api from '../services/api';
import { printLabelsZPL, type LabelData } from '../utils/zplPrint';

interface Awb {
    id: number;
    awb_number: string;
    carrier: string | null;
    flight_number: string | null;
    flight_date: string | null;
    origin_airport: string | null;
    destination_airport: string | null;
    pieces: number | null;
    gross_weight_kg: string | number | null;
    status: string;
    received_at: string | null;
    created_at: string | null;
    route_code: string | null;
    total_packages: number;
    received_packages: number;
    missing_packages: number;
}

interface Pkg {
    id: number;
    tracking_internal: string;
    status: string;
    description: string | null;
    weight: string | number | null;
    missing_on_arrival: boolean;
    user_box_id: string | null;
    user_name: string | null;
}

interface Props {
    onBack: () => void;
}

const ORANGE = '#FF6B35';
const BLACK = '#1A1A1A';
const RED = '#E53935';

export default function ChinaAirReceptionWizard({ onBack }: Props) {
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Step 0: select AWB
    const [awbs, setAwbs] = useState<Awb[]>([]);
    const [selected, setSelected] = useState<Awb | null>(null);

    // Step 1: scan
    const [packages, setPackages] = useState<Pkg[]>([]);
    const [userBranch, setUserBranch] = useState<{ id: number | null; code: string | null; name: string | null }>({ id: null, code: null, name: null });
    const [scanInput, setScanInput] = useState('');
    const [scanFeedback, setScanFeedback] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    // Step 2: confirm / result
    const [confirmPartialOpen, setConfirmPartialOpen] = useState(false);
    const [result, setResult] = useState<{
        new_status: string;
        scanned_count: number;
        missing_count: number;
        total_count: number;
    } | null>(null);

    useEffect(() => {
        loadAwbs();
    }, []);

    useEffect(() => {
        if (step === 1 && inputRef.current) {
            inputRef.current.focus();
        }
    }, [step, packages.length]);

    const loadAwbs = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/admin/china-air/awbs/in-transit');
            setAwbs(res.data.awbs || []);
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } }; message?: string };
            setError(err.response?.data?.error || err.message || 'Error');
        } finally {
            setLoading(false);
        }
    };

    const openAwb = async (awb: Awb) => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get(`/admin/china-air/awbs/${awb.id}/packages`);
            setPackages(res.data.packages || []);
            if (res.data.user_branch) setUserBranch(res.data.user_branch);
            setSelected(awb);
            setStep(1);
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } }; message?: string };
            setError(err.response?.data?.error || err.message || 'Error');
        } finally {
            setLoading(false);
        }
    };

    const refreshPackages = async () => {
        if (!selected) return;
        try {
            const res = await api.get(`/admin/china-air/awbs/${selected.id}/packages`);
            setPackages(res.data.packages || []);
            if (res.data.user_branch) setUserBranch(res.data.user_branch);
        } catch {
            /* noop */
        }
    };

    const handleScan = async (value: string) => {
        if (!selected) return;
        // Normalizamos separadores: la pistola lectora a veces convierte el `-`
        // en `'`, `’`, `‘`, `,` o `_` según el layout del teclado. Mapeamos
        // todos esos a `-` antes de extraer el tracking.
        let tracking = value
            .trim()
            .replace(/[’‘'`,_]/g, '-')
            .replace(/-{2,}/g, '-');
        if (!tracking) return;

        // 1) Si viene un código tipo AIR2609096hyXgs-001 (formato China Air),
        //    respetarlo tal cual (sólo upper) — incluye guion final del child_no.
        const airMatch = tracking.match(/AIR[A-Z0-9]+-?\d+/i);
        if (airMatch) {
            tracking = airMatch[0].toUpperCase();
            // Si vino sin guion (la pistola se lo comió o el operador no lo
            // tipeó), insertamos `-` justo antes del run final de dígitos —
            // que es el child_no del paquete dentro del AWB.
            if (!tracking.includes('-')) {
                const splitMatch = tracking.match(/^(AIR.+?[A-Z])(\d+)$/i);
                if (splitMatch) {
                    tracking = `${splitMatch[1]}-${splitMatch[2]}`;
                }
            }
        } else {
            // 2) Limpieza para PO Box / CN / US (prefijo 2 letras)
            const afterTrack = tracking.match(/track[^A-Za-z0-9]+([A-Za-z]{2})[^A-Za-z0-9]?([A-Za-z0-9]{4,})/i);
            if (afterTrack) {
                tracking = `${afterTrack[1]}-${afterTrack[2]}`.toUpperCase();
            } else {
                const allMatches = tracking.match(/[A-Z]{2}[-_']?[A-Z0-9]{4,}/gi) || [];
                const candidate = allMatches.find((m) => !/TREGAX/i.test(m));
                if (candidate) {
                    tracking = candidate.replace(/[_']/g, '-').toUpperCase();
                    if (!tracking.includes('-') && tracking.length > 2) {
                        tracking = tracking.slice(0, 2) + '-' + tracking.slice(2);
                    }
                }
            }
        }

        try {
            const res = await api.post(`/admin/china-air/awbs/${selected.id}/scan`, {
                tracking,
            });
            if (res.data.already_received) {
                setScanFeedback({ type: 'info', msg: `Ya escaneado: ${res.data.package?.tracking_internal || tracking}` });
            } else {
                setScanFeedback({ type: 'success', msg: `✓ ${res.data.package?.tracking_internal || tracking}` });
            }
            await refreshPackages();
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } }; message?: string };
            const msg = err.response?.data?.error || err.message || 'Error';
            setScanFeedback({ type: 'error', msg });
        }
        setScanInput('');
    };

    const isReceivedMx = (status?: string) => {
        if (!status) return false;
        if (!status.startsWith('received_')) return false;
        if (status.startsWith('received_china')) return false;
        if (status === 'received_origin') return false;
        return true;
    };

    const finalize = async (forcePartial = false) => {
        if (!selected) return;
        const missingCount = packages.filter((p) => !isReceivedMx(p.status)).length;
        if (missingCount > 0 && !forcePartial) {
            setConfirmPartialOpen(true);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await api.post(`/admin/china-air/awbs/${selected.id}/finalize`, {
                allow_partial: forcePartial,
            });
            setResult({
                new_status: res.data.new_status,
                scanned_count: res.data.received,
                missing_count: res.data.missing,
                total_count: res.data.total,
            });
            setConfirmPartialOpen(false);
            setStep(2);
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } }; message?: string };
            setError(err.response?.data?.error || err.message || 'Error');
            setConfirmPartialOpen(false);
        } finally {
            setLoading(false);
        }
    };

    const resetWizard = () => {
        setStep(0);
        setSelected(null);
        setPackages([]);
        setScanInput('');
        setScanFeedback(null);
        setResult(null);
        loadAwbs();
    };

    // Impresión masiva de etiquetas para todos los paquetes del AWB.
    // Intenta primero ZPL contra Zebra Browser Print (etiquetas 4x6).
    // Si no hay impresora Zebra disponible, abre una ventana con todas las
    // etiquetas en HTML listas para imprimir desde el navegador.
    const [printingLabels, setPrintingLabels] = useState(false);
    const handlePrintAllLabels = async () => {
        if (!selected || packages.length === 0) return;
        setPrintingLabels(true);
        try {
            const labels: LabelData[] = packages.map((p) => ({
                tracking: p.tracking_internal,
                clientBoxId: p.user_box_id || undefined,
                weight: p.weight ? Number(p.weight).toFixed(2) : undefined,
                description: p.description || undefined,
                receivedAt: selected.flight_date || undefined,
            }));

            // 1) Intenta ZPL contra Zebra Browser Print
            const zplOk = await printLabelsZPL(labels);
            if (zplOk) {
                setScanFeedback({
                    type: 'success',
                    msg: `${labels.length} etiqueta(s) enviadas a la impresora Zebra.`,
                });
                return;
            }

            // 2) Fallback: ventana imprimible con todas las etiquetas 4x6 (una por página)
            const printWindow = window.open('', '_blank', 'width=480,height=720');
            if (!printWindow) {
                setScanFeedback({ type: 'error', msg: 'Permite ventanas emergentes para imprimir.' });
                return;
            }
            const today = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
            const awbInfo = `AWB ${selected.awb_number}${selected.carrier ? ` · ${selected.carrier}` : ''}${selected.flight_number ? ` · Vuelo ${selected.flight_number}` : ''}`;
            const route = `${selected.origin_airport || '?'} → ${selected.destination_airport || '?'}`;
            const escape = (s: string) => String(s || '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] as string));
            const labelsHtml = labels
                .map((l, i) => {
                    const tn = String(l.tracking || '').toUpperCase();
                    const tnCompact = tn.replace(/[^A-Za-z0-9]/g, '');
                    const trackingQr = `https://app.entregax.com/track/${tnCompact}`;
                    const desc = l.description ? escape(l.description) : '';
                    const weight = l.weight ? `${l.weight} kg` : '—';
                    const clientBox = l.clientBoxId ? escape(l.clientBoxId) : '—';
                    return `
<div class="label" data-idx="${i}">
  <div class="brand">
    <div class="logo">Entrega<span>X</span></div>
    <div class="badge">✈ AÉREO CHINA</div>
  </div>
  <div class="awb-line">${escape(awbInfo)}</div>
  <div class="route">${escape(route)}</div>
  <div class="tracking-row">
    <div class="tn">${escape(tn)}</div>
    <div class="date">${today}</div>
  </div>
  <div class="barcode-box"><svg class="barcode" data-tn="${tnCompact}"></svg></div>
  <div class="boxid">${clientBox}</div>
  <div class="boxid-lbl">PO BOX</div>
  <div class="meta">
    <div class="cell"><div class="lbl">PESO</div><div class="val">${escape(weight)}</div></div>
    <div class="cell"><div class="lbl">DESCRIPCIÓN</div><div class="val small">${desc || '—'}</div></div>
  </div>
  <div class="footer">
    <div class="qr-box"><div class="qrcode" data-url="${escape(trackingQr)}"></div></div>
    <div class="counter">${i + 1} / ${labels.length}</div>
  </div>
</div>`;
                })
                .join('');

            const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Etiquetas AWB ${escape(selected.awb_number)}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
<style>
  @page { size: 4in 6in; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; }
  .label { width: 4in; height: 6in; padding: 0.18in; display: flex; flex-direction: column; page-break-after: always; }
  .label:last-child { page-break-after: auto; }
  .brand { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #F05A28; padding-bottom: 6px; margin-bottom: 6px; }
  .brand .logo { font-size: 22px; font-weight: 900; color: #F05A28; letter-spacing: 1px; font-family: 'Arial Black', sans-serif; }
  .brand .logo span { color: #111; }
  .brand .badge { background: #F05A28; color: #fff; padding: 4px 10px; font-size: 10px; font-weight: 800; border-radius: 4px; letter-spacing: 1px; }
  .awb-line { font-size: 10px; color: #444; font-weight: 700; }
  .route { font-size: 18px; font-weight: 900; color: #111; margin: 2px 0 6px; }
  .tracking-row { display: flex; justify-content: space-between; align-items: center; }
  .tracking-row .tn { font-family: 'Courier New', monospace; font-size: 14px; font-weight: 900; }
  .tracking-row .date { font-size: 10px; color: #555; }
  .barcode-box { text-align: center; margin: 6px 0; }
  .barcode-box svg { max-height: 60px; width: 100%; }
  .boxid-lbl { font-size: 9px; color: #666; font-weight: 800; letter-spacing: 2px; text-align: center; margin-top: 2px; }
  .boxid { text-align: center; font-family: 'Arial Black', sans-serif; font-size: 64px; font-weight: 900; color: #111; letter-spacing: 4px; line-height: 1; margin-top: 8px; }
  .meta { display: grid; grid-template-columns: 1fr 2fr; gap: 4px; margin: 8px 0; }
  .meta .cell { border: 1px solid #ddd; padding: 4px 6px; }
  .meta .cell .lbl { font-size: 8px; color: #666; font-weight: 800; letter-spacing: 1px; }
  .meta .cell .val { font-size: 14px; font-weight: 800; color: #111; }
  .meta .cell .val.small { font-size: 11px; font-weight: 700; }
  .footer { display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 6px; border-top: 1px dashed #999; }
  .footer .qr-box img { width: 80px !important; height: 80px !important; }
  .footer .counter { font-family: 'Arial Black', sans-serif; font-size: 14px; color: #444; font-weight: 900; }
</style></head><body>
${labelsHtml}
<script>
  window.addEventListener('load', function() {
    document.querySelectorAll('svg.barcode').forEach(function(svg){
      try { JsBarcode(svg, svg.getAttribute('data-tn'), { format: 'CODE128', width: 2, height: 50, displayValue: false, margin: 0 }); } catch(e) {}
    });
    document.querySelectorAll('.qrcode').forEach(function(div){
      try {
        var qr = qrcode(0, 'M'); qr.addData(div.getAttribute('data-url')); qr.make();
        div.innerHTML = qr.createImgTag(2);
      } catch(e) {}
    });
    setTimeout(function(){ window.print(); }, 500);
  });
</script>
</body></html>`;
            printWindow.document.write(html);
            printWindow.document.close();
            setScanFeedback({
                type: 'info',
                msg: `${labels.length} etiqueta(s) preparadas — usa el diálogo de impresión.`,
            });
        } catch (e) {
            const err = e as { message?: string };
            setScanFeedback({ type: 'error', msg: err.message || 'Error imprimiendo etiquetas' });
        } finally {
            setPrintingLabels(false);
        }
    };

    const receivedCount = packages.filter((p) => isReceivedMx(p.status)).length;
    const missingCount = packages.length - receivedCount;

    return (
        <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <IconButton onClick={onBack} size="small">
                    <ArrowBackIcon />
                </IconButton>
                <FlightIcon sx={{ color: ORANGE }} />
                <Typography variant="h5" sx={{ fontWeight: 700, color: ORANGE, flex: 1 }}>
                    Recibir AWB · TDI Aéreo China
                </Typography>
                {step === 0 && (
                    <IconButton onClick={loadAwbs} size="small">
                        <RefreshIcon />
                    </IconButton>
                )}
            </Stack>

            <Stepper activeStep={step} sx={{ mb: 3 }}>
                <Step><StepLabel>Seleccionar AWB</StepLabel></Step>
                <Step><StepLabel>Escanear guías</StepLabel></Step>
                <Step><StepLabel>Confirmar</StepLabel></Step>
            </Stepper>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {loading && step === 0 && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                    <CircularProgress sx={{ color: ORANGE }} />
                </Box>
            )}

            {/* STEP 0: LIST AWBs */}
            {step === 0 && !loading && (
                <Paper variant="outlined">
                    {awbs.length === 0 ? (
                        <Box sx={{ p: 4, textAlign: 'center' }}>
                            <Typography color="text.secondary">
                                No hay AWBs pendientes de recepción
                            </Typography>
                        </Box>
                    ) : (
                        <List>
                            {awbs.map((awb) => {
                                const startDate = awb.flight_date || awb.created_at;
                                const days = startDate
                                    ? Math.floor((Date.now() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))
                                    : null;
                                const semaforoColor: 'success' | 'warning' | 'error' | 'default' =
                                    days === null ? 'default'
                                    : days <= 2 ? 'success'
                                    : days <= 5 ? 'warning'
                                    : 'error';
                                const semaforoEmoji =
                                    days === null ? '⚪'
                                    : days <= 2 ? '🟢'
                                    : days <= 5 ? '🟡'
                                    : '🔴';
                                const isPartial = Number(awb.received_packages) > 0 && Number(awb.received_packages) < Number(awb.total_packages);
                                return (
                                    <ListItem
                                        key={awb.id}
                                        onClick={() => openAwb(awb)}
                                        secondaryAction={
                                            <Stack direction="column" spacing={0.5} alignItems="flex-end">
                                                <Chip
                                                    label={isPartial ? 'PARCIAL' : 'PENDIENTE'}
                                                    sx={{
                                                        bgcolor: isPartial ? ORANGE : BLACK,
                                                        color: '#FFFFFF',
                                                        fontWeight: 700
                                                    }}
                                                    size="small"
                                                />
                                                {days !== null && (
                                                    <Chip
                                                        label={`${semaforoEmoji} ${days} día${days === 1 ? '' : 's'}`}
                                                        color={semaforoColor}
                                                        size="small"
                                                        variant="filled"
                                                        sx={{ fontWeight: 700 }}
                                                    />
                                                )}
                                            </Stack>
                                        }
                                        sx={{
                                            cursor: 'pointer',
                                            borderBottom: '1px solid #eee',
                                            py: 2,
                                            '&:hover': { bgcolor: '#FFF5F0' },
                                        }}
                                    >
                                        {/* Chip grande con número de paquetes */}
                                        <Box
                                            sx={{
                                                minWidth: 92,
                                                mr: 2,
                                                px: 1.5,
                                                py: 1,
                                                borderRadius: 2,
                                                bgcolor: ORANGE,
                                                color: '#FFF',
                                                textAlign: 'center',
                                                boxShadow: 2,
                                            }}
                                        >
                                            <Typography sx={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>
                                                {awb.total_packages}
                                            </Typography>
                                            <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', mt: 0.3 }}>
                                                {Number(awb.total_packages) === 1 ? 'paquete' : 'paquetes'}
                                            </Typography>
                                        </Box>

                                        <ListItemText
                                            primary={
                                                <Typography sx={{ fontWeight: 700, color: ORANGE, fontSize: 18 }}>
                                                    AWB {awb.awb_number}
                                                </Typography>
                                            }
                                            secondary={
                                                Number(awb.received_packages) > 0 ? (
                                                    <Chip
                                                        icon={<CheckCircleIcon />}
                                                        label={`${awb.received_packages}/${awb.total_packages} recibidos`}
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

            {/* STEP 1: SCAN */}
            {step === 1 && selected && (
                <Box>
                    <Paper sx={{ p: 2, mb: 2, bgcolor: '#FFF5F0', border: `2px solid ${ORANGE}` }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="subtitle2" color="text.secondary">
                                    AWB {selected.awb_number}
                                    {selected.carrier && ` · ${selected.carrier}`}
                                    {selected.flight_number && ` · Vuelo ${selected.flight_number}`}
                                </Typography>
                                <Typography variant="h6" sx={{ color: BLACK, fontWeight: 700 }}>
                                    {selected.origin_airport || '?'} → {selected.destination_airport || '?'}
                                    {selected.gross_weight_kg && ` · ${Number(selected.gross_weight_kg).toFixed(2)} kg`}
                                </Typography>
                            </Box>
                            <Button
                                variant="contained"
                                startIcon={printingLabels ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <PrintIcon />}
                                onClick={handlePrintAllLabels}
                                disabled={printingLabels || packages.length === 0}
                                sx={{
                                    bgcolor: BLACK,
                                    color: '#FFF',
                                    fontWeight: 700,
                                    textTransform: 'none',
                                    px: 1.6,
                                    py: 0.7,
                                    whiteSpace: 'nowrap',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                                    '&:hover': { bgcolor: '#000' },
                                }}
                            >
                                {printingLabels ? 'Imprimiendo…' : `Imprimir etiquetas (${packages.length})`}
                            </Button>
                        </Box>
                        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                            <Chip label={`Total: ${packages.length}`} size="small" sx={{ bgcolor: BLACK, color: '#FFF', fontWeight: 700 }} />
                            <Chip
                                icon={<CheckCircleIcon />}
                                label={`Escaneados: ${receivedCount}`}
                                size="small"
                                color="success"
                            />
                            <Chip
                                icon={<ErrorIcon />}
                                label={`Faltantes: ${missingCount}`}
                                size="small"
                                sx={missingCount === 0 ? undefined : { bgcolor: RED, color: '#FFF', fontWeight: 700 }}
                            />
                        </Stack>
                    </Paper>

                    <Paper sx={{ p: 2, mb: 2 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <ScannerIcon sx={{ color: ORANGE }} />
                            <TextField
                                inputRef={inputRef}
                                fullWidth
                                size="medium"
                                placeholder="Escanear guía (tracking interno: US-XXXXX)..."
                                value={scanInput}
                                onChange={(e) => setScanInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleScan(scanInput);
                                }}
                                autoFocus
                            />
                            <Button
                                variant="contained"
                                onClick={() => handleScan(scanInput)}
                                disabled={!scanInput.trim()}
                                sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#E55A28' } }}
                            >
                                Escanear
                            </Button>
                        </Stack>
                        {scanFeedback && (
                            <Alert
                                severity={scanFeedback.type}
                                sx={{ mt: 1 }}
                                onClose={() => setScanFeedback(null)}
                            >
                                {scanFeedback.msg}
                            </Alert>
                        )}
                    </Paper>

                    <Paper variant="outlined">
                        <List dense>
                            {packages.map((p) => {
                                const isReceived = isReceivedMx(p.status);
                                const wasPreviouslyMissing = p.missing_on_arrival === true;
                                return (
                                    <ListItem
                                        key={p.id}
                                        sx={{
                                            bgcolor: isReceived
                                                ? '#E8F5E9'
                                                : wasPreviouslyMissing
                                                    ? '#FFF4E5'
                                                    : 'transparent',
                                            borderBottom: '1px solid #eee',
                                        }}
                                    >
                                        <ListItemIcon>
                                            {isReceived ? (
                                                <CheckCircleIcon color="success" />
                                            ) : (
                                                <UncheckedIcon color={wasPreviouslyMissing ? 'warning' : 'disabled'} />
                                            )}
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={
                                                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                                    <Typography sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                                                        {p.tracking_internal}
                                                    </Typography>
                                                    {p.user_box_id && (
                                                        <Chip
                                                            label={p.user_box_id}
                                                            size="small"
                                                            sx={{ bgcolor: BLACK, color: '#FFF' }}
                                                        />
                                                    )}
                                                    {isReceived && (
                                                        <Chip label="✓ RECIBIDO" size="small" color="success" />
                                                    )}
                                                    {wasPreviouslyMissing && !isReceived && (
                                                        <Chip label="⏳ ESPERANDO ESCANEO" size="small" color="warning" />
                                                    )}
                                                </Stack>
                                            }
                                            secondary={`${p.description || 'Sin descripción'} · ${Number(p.weight || 0).toFixed(2)} kg · status: ${p.status}`}
                                        />
                                    </ListItem>
                                );
                            })}
                        </List>
                    </Paper>

                    <Stack direction="row" spacing={2} sx={{ mt: 3 }} justifyContent="flex-end">
                        <Button onClick={() => setStep(0)} disabled={loading} sx={{ color: BLACK }}>
                            Cancelar
                        </Button>
                        <Button
                            variant="contained"
                            onClick={() => finalize(false)}
                            disabled={loading || receivedCount === 0}
                            sx={{
                                bgcolor: missingCount === 0 ? '#2E7D32' : ORANGE,
                                '&:hover': { bgcolor: missingCount === 0 ? '#1B5E20' : '#E55A28' }
                            }}
                        >
                            {missingCount === 0 ? 'Finalizar recepción completa' : `Finalizar con ${missingCount} faltante(s)`}
                        </Button>
                    </Stack>
                </Box>
            )}

            {/* STEP 2: RESULT */}
            {step === 2 && result && (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <CheckCircleIcon sx={{ fontSize: 80, color: result.missing_count === 0 ? '#2E7D32' : ORANGE }} />
                    <Typography variant="h5" sx={{ mt: 2, fontWeight: 700, color: BLACK }}>
                        {result.missing_count === 0 ? 'Recepción completa' : 'Recepción parcial registrada'}
                    </Typography>
                    <Typography color="text.secondary" sx={{ mt: 1 }}>
                        AWB {selected?.awb_number}
                    </Typography>
                    <Divider sx={{ my: 3 }} />
                    <Stack direction="row" spacing={4} justifyContent="center">
                        <Box>
                            <Typography variant="h4" sx={{ color: '#2E7D32' }}>{result.scanned_count}</Typography>
                            <Typography variant="caption" color="text.secondary">Recibidos en {userBranch.name || userBranch.code || 'CEDIS'}</Typography>
                        </Box>
                        <Box>
                            <Typography variant="h4" sx={{ color: result.missing_count === 0 ? 'text.secondary' : RED }}>
                                {result.missing_count}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">Faltantes</Typography>
                        </Box>
                        <Box>
                            <Typography variant="h4" sx={{ color: BLACK }}>{result.total_count}</Typography>
                            <Typography variant="caption" color="text.secondary">Total</Typography>
                        </Box>
                    </Stack>
                    {result.missing_count > 0 && (
                        <Alert severity="warning" sx={{ mt: 3, textAlign: 'left' }}>
                            Se marcaron {result.missing_count} guía(s) como faltantes. Aparecerán en la sección de inventario con la bandera de retraso.
                        </Alert>
                    )}
                    <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 3 }}>
                        <Button variant="outlined" onClick={onBack} sx={{ color: BLACK, borderColor: BLACK }}>
                            Volver al menú
                        </Button>
                        <Button
                            variant="contained"
                            onClick={resetWizard}
                            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#E55A28' } }}
                        >
                            Recibir otra AWB
                        </Button>
                    </Stack>
                </Paper>
            )}

            {/* Confirm partial dialog */}
            <Dialog open={confirmPartialOpen} onClose={() => setConfirmPartialOpen(false)}>
                <DialogTitle>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <WarningIcon sx={{ color: ORANGE }} />
                        <span>Confirmar recepción parcial</span>
                    </Stack>
                </DialogTitle>
                <DialogContent>
                    <Typography>
                        Faltan <strong>{missingCount}</strong> de {packages.length} paquete(s) por escanear.
                    </Typography>
                    <Typography sx={{ mt: 2 }} color="text.secondary">
                        Los paquetes escaneados quedarán como <strong>recibidos en {userBranch.name || userBranch.code || 'tu CEDIS'}</strong> y los faltantes se marcarán como <strong>retrasados</strong>.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmPartialOpen(false)} sx={{ color: BLACK }}>
                        Volver a escanear
                    </Button>
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
