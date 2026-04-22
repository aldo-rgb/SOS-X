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
} from '@mui/icons-material';
import api from '../services/api';

interface Consolidation {
    id: number;
    status: string;
    master_tracking: string | null;
    total_weight: string | number;
    total_packages: number;
    missing_packages: number;
    dispatched_at: string | null;
    user_name: string | null;
    box_id: string | null;
}

interface Pkg {
    id: number;
    tracking_internal: string;
    status: string;
    description: string | null;
    weight: string | number | null;
    missing_on_arrival: boolean;
}

interface Props {
    onBack: () => void;
}

const ORANGE = '#F05A28';

export default function POBoxConsolidationReceptionWizard({ onBack }: Props) {
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Step 0: select consolidation
    const [consolidations, setConsolidations] = useState<Consolidation[]>([]);
    const [selected, setSelected] = useState<Consolidation | null>(null);

    // Step 1: scan
    const [packages, setPackages] = useState<Pkg[]>([]);
    const [scannedIds, setScannedIds] = useState<Set<number>>(new Set());
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
        loadConsolidations();
    }, []);

    useEffect(() => {
        if (step === 1 && inputRef.current) {
            inputRef.current.focus();
        }
    }, [step, scannedIds.size]);

    const loadConsolidations = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/admin/pobox/consolidations/in-transit');
            setConsolidations(res.data.consolidations || []);
        } catch (e: any) {
            setError(e.response?.data?.error || e.message);
        } finally {
            setLoading(false);
        }
    };

    const openConsolidation = async (c: Consolidation) => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get(`/admin/pobox/consolidations/${c.id}/packages`);
            setPackages(res.data.packages || []);
            // Pre-marcar los que ya fueron recibidos previamente (en consolidación parcial)
            const preScanned = new Set<number>(
                (res.data.packages || [])
                    .filter((p: Pkg) => !p.missing_on_arrival && (p.status === 'received' || p.status === 'ready_pickup' || p.status === 'delivered'))
                    .map((p: Pkg) => p.id)
            );
            setScannedIds(preScanned);
            setSelected(c);
            setStep(1);
        } catch (e: any) {
            setError(e.response?.data?.error || e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleScan = (value: string) => {
        let tracking = value.trim();
        if (!tracking) return;
        // Si escanean el QR (URL completa tipo https://app.entregax.com/track/US-XXXX), extraer solo el tracking
        const urlMatch = tracking.match(/\/track\/([^/?#\s]+)/i);
        if (urlMatch) {
            tracking = urlMatch[1];
        }
        const pkg = packages.find((p) => p.tracking_internal.toLowerCase() === tracking.toLowerCase());
        if (!pkg) {
            setScanFeedback({ type: 'error', msg: `Guía "${tracking}" no pertenece a esta consolidación` });
        } else if (scannedIds.has(pkg.id)) {
            setScanFeedback({ type: 'info', msg: `Ya escaneado: ${pkg.tracking_internal}` });
        } else {
            const next = new Set(scannedIds);
            next.add(pkg.id);
            setScannedIds(next);
            setScanFeedback({ type: 'success', msg: `✓ ${pkg.tracking_internal}` });
        }
        setScanInput('');
    };

    const toggleManual = (pid: number) => {
        const next = new Set(scannedIds);
        if (next.has(pid)) next.delete(pid);
        else next.add(pid);
        setScannedIds(next);
    };

    const finalize = async (forcePartial = false) => {
        if (!selected) return;
        const missingCount = packages.length - scannedIds.size;
        if (missingCount > 0 && !forcePartial) {
            setConfirmPartialOpen(true);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await api.post(`/admin/pobox/consolidations/${selected.id}/receive`, {
                scanned_package_ids: Array.from(scannedIds),
                force_partial: forcePartial,
            });
            setResult({
                new_status: res.data.new_status,
                scanned_count: res.data.scanned_count,
                missing_count: res.data.missing_count,
                total_count: res.data.total_count,
            });
            setConfirmPartialOpen(false);
            setStep(2);
        } catch (e: any) {
            setError(e.response?.data?.error || e.message);
            setConfirmPartialOpen(false);
        } finally {
            setLoading(false);
        }
    };

    const resetWizard = () => {
        setStep(0);
        setSelected(null);
        setPackages([]);
        setScannedIds(new Set());
        setScanInput('');
        setScanFeedback(null);
        setResult(null);
        loadConsolidations();
    };

    const missingCount = packages.length - scannedIds.size;

    return (
        <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <IconButton onClick={onBack} size="small">
                    <ArrowBackIcon />
                </IconButton>
                <Typography variant="h5" sx={{ fontWeight: 700, color: ORANGE, flex: 1 }}>
                    Recibir Consolidación en MTY
                </Typography>
                {step === 0 && (
                    <IconButton onClick={loadConsolidations} size="small">
                        <RefreshIcon />
                    </IconButton>
                )}
            </Stack>

            <Stepper activeStep={step} sx={{ mb: 3 }}>
                <Step><StepLabel>Seleccionar consolidación</StepLabel></Step>
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
                    <CircularProgress />
                </Box>
            )}

            {/* STEP 0: LIST */}
            {step === 0 && !loading && (
                <Paper variant="outlined">
                    {consolidations.length === 0 ? (
                        <Box sx={{ p: 4, textAlign: 'center' }}>
                            <Typography color="text.secondary">
                                No hay consolidaciones en tránsito
                            </Typography>
                        </Box>
                    ) : (
                        <List>
                            {consolidations.map((c) => (
                                <ListItem
                                    key={c.id}
                                    onClick={() => openConsolidation(c)}
                                    secondaryAction={
                                        <Chip
                                            label={c.status === 'received_partial' ? 'PARCIAL' : 'EN TRÁNSITO'}
                                            color={c.status === 'received_partial' ? 'warning' : 'primary'}
                                            size="small"
                                        />
                                    }
                                    sx={{
                                        cursor: 'pointer',
                                        borderBottom: '1px solid #eee',
                                        '&:hover': { bgcolor: '#fafafa' },
                                    }}
                                >
                                    <ListItemText
                                        primary={
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <Typography sx={{ fontWeight: 700 }}>
                                                    Consolidación #{c.id}
                                                </Typography>
                                                {c.master_tracking && (
                                                    <Chip label={c.master_tracking} size="small" variant="outlined" />
                                                )}
                                                {c.missing_packages > 0 && (
                                                    <Chip
                                                        icon={<WarningIcon />}
                                                        label={`${c.missing_packages} faltantes`}
                                                        size="small"
                                                        color="error"
                                                    />
                                                )}
                                            </Stack>
                                        }
                                        secondary={
                                            <>
                                                {c.user_name} · Box {c.box_id || 'N/A'} · {c.total_packages} paquete(s) · {Number(c.total_weight || 0).toFixed(2)} kg
                                                {c.dispatched_at && ` · Enviado: ${new Date(c.dispatched_at).toLocaleDateString()}`}
                                            </>
                                        }
                                    />
                                </ListItem>
                            ))}
                        </List>
                    )}
                </Paper>
            )}

            {/* STEP 1: SCAN */}
            {step === 1 && selected && (
                <Box>
                    <Paper sx={{ p: 2, mb: 2, bgcolor: '#fff8f3' }}>
                        <Typography variant="subtitle2" color="text.secondary">
                            Consolidación #{selected.id} · {selected.master_tracking || 's/master'}
                        </Typography>
                        <Typography variant="h6">
                            {selected.user_name} · Box {selected.box_id || 'N/A'}
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                            <Chip label={`Total: ${packages.length}`} size="small" />
                            <Chip
                                icon={<CheckCircleIcon />}
                                label={`Escaneados: ${scannedIds.size}`}
                                size="small"
                                color="success"
                            />
                            <Chip
                                icon={<ErrorIcon />}
                                label={`Faltantes: ${missingCount}`}
                                size="small"
                                color={missingCount === 0 ? 'default' : 'error'}
                            />
                        </Stack>
                    </Paper>

                    <Paper sx={{ p: 2, mb: 2 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <ScannerIcon color="action" />
                            <TextField
                                inputRef={inputRef}
                                fullWidth
                                size="medium"
                                placeholder="Escanear guía (tracking interno)..."
                                value={scanInput}
                                onChange={(e) => setScanInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleScan(scanInput);
                                }}
                                autoFocus
                            />
                            <Button variant="contained" onClick={() => handleScan(scanInput)} disabled={!scanInput.trim()}>
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
                                const isScanned = scannedIds.has(p.id);
                                return (
                                    <ListItem
                                        key={p.id}
                                        onClick={() => toggleManual(p.id)}
                                        sx={{
                                            cursor: 'pointer',
                                            bgcolor: isScanned ? '#e8f5e9' : 'transparent',
                                            borderBottom: '1px solid #eee',
                                        }}
                                    >
                                        <ListItemIcon>
                                            {isScanned ? (
                                                <CheckCircleIcon color="success" />
                                            ) : (
                                                <UncheckedIcon color="disabled" />
                                            )}
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                    <Typography sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                                                        {p.tracking_internal}
                                                    </Typography>
                                                    {p.missing_on_arrival && (
                                                        <Chip label="ANTES FALTANTE" size="small" color="warning" />
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
                        <Button onClick={() => setStep(0)} disabled={loading}>
                            Cancelar
                        </Button>
                        <Button
                            variant="contained"
                            color={missingCount === 0 ? 'success' : 'warning'}
                            onClick={() => finalize(false)}
                            disabled={loading || scannedIds.size === 0}
                            sx={{ bgcolor: missingCount === 0 ? undefined : ORANGE }}
                        >
                            {missingCount === 0 ? 'Finalizar recepción completa' : `Finalizar con ${missingCount} faltante(s)`}
                        </Button>
                    </Stack>
                </Box>
            )}

            {/* STEP 2: RESULT */}
            {step === 2 && result && (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <CheckCircleIcon sx={{ fontSize: 80, color: result.missing_count === 0 ? 'success.main' : 'warning.main' }} />
                    <Typography variant="h5" sx={{ mt: 2, fontWeight: 700 }}>
                        {result.missing_count === 0 ? 'Recepción completa' : 'Recepción parcial registrada'}
                    </Typography>
                    <Typography color="text.secondary" sx={{ mt: 1 }}>
                        Consolidación #{selected?.id}
                    </Typography>
                    <Divider sx={{ my: 3 }} />
                    <Stack direction="row" spacing={4} justifyContent="center">
                        <Box>
                            <Typography variant="h4" color="success.main">{result.scanned_count}</Typography>
                            <Typography variant="caption" color="text.secondary">Recibidos en MTY</Typography>
                        </Box>
                        <Box>
                            <Typography variant="h4" color={result.missing_count === 0 ? 'text.secondary' : 'error.main'}>
                                {result.missing_count}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">Faltantes</Typography>
                        </Box>
                        <Box>
                            <Typography variant="h4">{result.total_count}</Typography>
                            <Typography variant="caption" color="text.secondary">Total</Typography>
                        </Box>
                    </Stack>
                    {result.missing_count > 0 && (
                        <Alert severity="warning" sx={{ mt: 3, textAlign: 'left' }}>
                            Se notificó al equipo de PO Box USA sobre los paquetes faltantes. Aparecerán en el módulo <strong>Guías con Retraso</strong> de Servicio a Cliente.
                        </Alert>
                    )}
                    <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 3 }}>
                        <Button variant="outlined" onClick={onBack}>Volver al menú</Button>
                        <Button variant="contained" onClick={resetWizard} sx={{ bgcolor: ORANGE }}>
                            Recibir otra consolidación
                        </Button>
                    </Stack>
                </Paper>
            )}

            {/* Confirm partial dialog */}
            <Dialog open={confirmPartialOpen} onClose={() => setConfirmPartialOpen(false)}>
                <DialogTitle>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <WarningIcon color="warning" />
                        <span>Confirmar recepción parcial</span>
                    </Stack>
                </DialogTitle>
                <DialogContent>
                    <Typography>
                        Faltan <strong>{missingCount}</strong> de {packages.length} paquete(s) por escanear.
                    </Typography>
                    <Typography sx={{ mt: 2 }} color="text.secondary">
                        Se marcarán los escaneados como recibidos en MTY y los faltantes quedarán como <strong>retrasados</strong>. Se enviará una notificación al equipo de PO Box USA.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmPartialOpen(false)}>Volver a escanear</Button>
                    <Button
                        variant="contained"
                        color="warning"
                        onClick={() => finalize(true)}
                        disabled={loading}
                    >
                        Confirmar recepción parcial
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
