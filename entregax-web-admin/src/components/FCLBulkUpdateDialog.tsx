// ────────────────────────────────────────────────────────────────────────────────
// FCLBulkUpdateDialog · Actualización en serie de contenedores FCL
// Componente reutilizable. Acepta una lista de contenedores y aplica un nuevo
// status a múltiples contenedores pegando sus identificadores (número de
// contenedor, BL o referencia JSM/EPG).
// ────────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Box,
    Button,
    Typography,
    TextField,
    Stack,
    Chip,
    Alert,
    Paper,
    List,
    ListItem,
    ListItemText,
    FormControl,
    FormLabel,
    RadioGroup,
    FormControlLabel,
    Radio,
    CircularProgress,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import UncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import api from '../services/api';

const TEAL = '#00ACC1';
const BLACK = '#1E1E1E';
const ORANGE = '#FF6F35';
const RED = '#D32F2F';

export interface BulkContainerLike {
    id: number;
    container_number?: string;
    bl_number?: string;
    reference_code?: string;
    status?: string;
}

const FCL_STATUSES: { value: string; label: string; icon: string }[] = [
    { value: 'received_origin', label: 'Recibido en origen (China)', icon: '📦' },
    { value: 'consolidated', label: 'Consolidado', icon: '🧱' },
    { value: 'in_transit', label: 'En tránsito (zarpado)', icon: '🚢' },
    { value: 'arrived_port', label: 'Llegó al puerto destino', icon: '⚓' },
    { value: 'customs_cleared', label: 'Liberado de aduana', icon: '🛃' },
    { value: 'in_transit_clientfinal', label: 'En tránsito a destino', icon: '🚛' },
    { value: 'delivered', label: 'Entregado', icon: '✅' },
];

interface Props {
    open: boolean;
    onClose: () => void;
    containers: BulkContainerLike[];
    onUpdated?: (successIds: number[], newStatus: string) => void;
    /** Status no seleccionables en bulk (por defecto: received_origin y consolidated) */
    hiddenStatuses?: string[];
}

export default function FCLBulkUpdateDialog({
    open,
    onClose,
    containers,
    onUpdated,
    hiddenStatuses = ['received_origin', 'consolidated'],
}: Props) {
    const [bulkInput, setBulkInput] = useState('');
    const [bulkStatus, setBulkStatus] = useState('customs_cleared');
    const [bulkRunning, setBulkRunning] = useState(false);
    const [bulkResults, setBulkResults] = useState<{
        matched: BulkContainerLike[];
        notFound: string[];
        successes: number[];
        failures: { id: number; ref: string; error: string }[];
    } | null>(null);

    const parseBulkTokens = (raw: string): string[] => {
        const tokens = raw
            .split(/[\s,;\r\n\t]+/)
            .map((t) => t.trim())
            .filter((t) => t.length >= 4);
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
        const matched: BulkContainerLike[] = [];
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
        const updatedMatched = bulkResults.matched.map((c) =>
            successes.includes(c.id) ? { ...c, status: bulkStatus } : c
        );
        setBulkResults({ ...bulkResults, matched: updatedMatched, successes, failures });
        setBulkRunning(false);
        if (onUpdated) onUpdated(successes, bulkStatus);
    };

    const resetAndClose = () => {
        setBulkInput('');
        setBulkStatus('customs_cleared');
        setBulkResults(null);
        setBulkRunning(false);
        onClose();
    };

    return (
        <Dialog open={open} onClose={() => !bulkRunning && resetAndClose()} maxWidth="md" fullWidth>
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
                            Detectados: <strong>{parseBulkTokens(bulkInput).length}</strong> identificador(es) · Lista disponible: <strong>{containers.length}</strong>
                        </Typography>
                    </>
                )}

                {bulkResults && (
                    <Box>
                        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
                            <Chip label={`✓ Encontrados: ${bulkResults.matched.length}`} sx={{ bgcolor: '#2E7D32', color: '#FFF', fontWeight: 700 }} />
                            {bulkResults.notFound.length > 0 && (
                                <Chip label={`✗ No encontrados: ${bulkResults.notFound.length}`} sx={{ bgcolor: RED, color: '#FFF', fontWeight: 700 }} />
                            )}
                            {bulkResults.successes.length > 0 && (
                                <Chip label={`✅ Actualizados: ${bulkResults.successes.length}`} sx={{ bgcolor: '#1B5E20', color: '#FFF', fontWeight: 700 }} />
                            )}
                            {bulkResults.failures.length > 0 && (
                                <Chip label={`❌ Fallidos: ${bulkResults.failures.length}`} sx={{ bgcolor: '#B71C1C', color: '#FFF', fontWeight: 700 }} />
                            )}
                        </Stack>

                        {bulkResults.notFound.length > 0 && (
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                                    Los siguientes identificadores no se encontraron:
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
                                                            <Chip size="small" label={c.status || '—'} sx={{ height: 20, bgcolor: BLACK, color: '#FFF' }} />
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
                                        .filter((s) => !hiddenStatuses.includes(s.value))
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
                <Button onClick={resetAndClose} disabled={bulkRunning} sx={{ color: BLACK }}>
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
                        <Button onClick={() => setBulkResults(null)} disabled={bulkRunning} sx={{ color: TEAL }}>
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
    );
}
