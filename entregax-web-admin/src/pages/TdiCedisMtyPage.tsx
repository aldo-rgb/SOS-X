// Panel de recepción TDI Express en CEDIS Monterrey
// Escanea guía TDX → cambia status received_china → received_mty

import { useState, useRef, useEffect } from 'react';
import {
    Box, Typography, TextField, Paper, Stack, IconButton,
    Chip, Alert, Divider, CircularProgress,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    LocalShipping as TruckIcon,
    CheckCircle as CheckIcon,
    ErrorOutline as ErrorIcon,
    QrCodeScanner as ScannerIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ORANGE = '#FF6B35';

interface ReceivedEntry {
    id: number;
    tracking: string;
    client_name: string;
    client_box_id: string;
    is_master: boolean;
    children_count: number;
    timestamp: string;
}

interface Props {
    onBack: () => void;
}

export default function TdiCedisMtyPage({ onBack }: Props) {
    const [scanInput, setScanInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [lastError, setLastError] = useState<string | null>(null);
    const [lastSuccess, setLastSuccess] = useState<ReceivedEntry | null>(null);
    const [received, setReceived] = useState<ReceivedEntry[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleScan = async (raw: string) => {
        const tracking = raw.trim().toUpperCase();
        if (!tracking) return;
        setScanInput('');
        setLastError(null);
        setLastSuccess(null);
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(
                `${API_URL}/api/tdi-express/receive-cedis-mty`,
                { tracking },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const entry: ReceivedEntry = {
                id: res.data.id,
                tracking: res.data.tracking,
                client_name: res.data.client_name,
                client_box_id: res.data.client_box_id,
                is_master: res.data.is_master,
                children_count: res.data.children_count,
                timestamp: new Date().toLocaleTimeString('es-MX'),
            };
            setLastSuccess(entry);
            setReceived(prev => [entry, ...prev]);
        } catch (err: any) {
            const msg = err.response?.data?.error || 'Error al procesar guía';
            setLastError(msg);
        } finally {
            setLoading(false);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    };

    return (
        <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
            {/* Header */}
            <Paper sx={{ p: 3, mb: 3, background: 'linear-gradient(135deg, #1A1A1A 0%, #2A2A2A 100%)', color: '#FFF' }}>
                <Stack direction="row" alignItems="center" spacing={2}>
                    <IconButton onClick={onBack} sx={{ color: '#FFF' }}>
                        <ArrowBackIcon />
                    </IconButton>
                    <TruckIcon sx={{ fontSize: 36, color: '#FFCC00' }} />
                    <Box>
                        <Typography variant="overline" sx={{ color: '#FFCC00', fontWeight: 700, letterSpacing: 2 }}>
                            TDI EXPRESS · CEDIS MTY
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 800 }}>
                            Recepción en CEDIS Monterrey
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#BDBDBD', mt: 0.5 }}>
                            Escanea las guías TDX para marcarlas como Recibido en CEDIS MTY
                        </Typography>
                    </Box>
                    <Box sx={{ ml: 'auto', textAlign: 'right' }}>
                        <Typography variant="h4" sx={{ fontWeight: 800, color: '#FFCC00' }}>{received.length}</Typography>
                        <Typography variant="caption" sx={{ color: '#BDBDBD' }}>recibidas</Typography>
                    </Box>
                </Stack>
            </Paper>

            {/* Scanner input */}
            <Paper sx={{ p: 3, mb: 3, border: '2px solid', borderColor: loading ? ORANGE : '#E0E0E0', borderRadius: 2 }}>
                <Stack direction="row" alignItems="center" spacing={2} mb={1}>
                    <ScannerIcon sx={{ color: ORANGE }} />
                    <Typography fontWeight={700}>Escanear Guía TDX</Typography>
                    {loading && <CircularProgress size={18} sx={{ color: ORANGE }} />}
                </Stack>
                <TextField
                    inputRef={inputRef}
                    fullWidth
                    value={scanInput}
                    onChange={e => setScanInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleScan(scanInput); }}
                    placeholder="TDX-XXXXXXXXX — Enter para confirmar"
                    disabled={loading}
                    autoFocus
                    inputProps={{ style: { fontFamily: 'monospace', fontSize: 18, fontWeight: 700 } }}
                    sx={{ '& .MuiOutlinedInput-root': { '&.Mui-focused fieldset': { borderColor: ORANGE } } }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Compatible con escáner físico (Enter automático) o entrada manual
                </Typography>
            </Paper>

            {/* Feedback último scan */}
            {lastError && (
                <Alert severity="error" icon={<ErrorIcon />} sx={{ mb: 2 }} onClose={() => setLastError(null)}>
                    {lastError}
                </Alert>
            )}
            {lastSuccess && (
                <Alert severity="success" icon={<CheckIcon />} sx={{ mb: 2 }}>
                    <strong>{lastSuccess.tracking}</strong> — {lastSuccess.client_name} ({lastSuccess.client_box_id})
                    {lastSuccess.is_master && lastSuccess.children_count > 0 && (
                        <Chip label={`${lastSuccess.children_count + 1} cajas actualizadas`} size="small" color="success" sx={{ ml: 1 }} />
                    )}
                </Alert>
            )}

            {/* Lista recibidos en sesión */}
            {received.length > 0 && (
                <Paper sx={{ p: 2, borderRadius: 2 }}>
                    <Typography variant="subtitle2" fontWeight={700} mb={1.5} color="text.secondary">
                        RECIBIDAS EN ESTA SESIÓN ({received.length})
                    </Typography>
                    <Stack divider={<Divider />} spacing={0}>
                        {received.map((r, i) => (
                            <Box key={i} sx={{ py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography fontWeight={700} fontFamily="monospace">{r.tracking}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {r.client_name} · {r.client_box_id}
                                        {r.is_master && r.children_count > 0 && ` · ${r.children_count + 1} cajas`}
                                    </Typography>
                                </Box>
                                <Box sx={{ textAlign: 'right' }}>
                                    <Chip label="Recibido MTY" size="small" color="success" />
                                    <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                                        {r.timestamp}
                                    </Typography>
                                </Box>
                            </Box>
                        ))}
                    </Stack>
                </Paper>
            )}

            {received.length === 0 && !lastError && (
                <Box sx={{ textAlign: 'center', py: 6, color: '#BDBDBD' }}>
                    <ScannerIcon sx={{ fontSize: 64, mb: 2, opacity: 0.3 }} />
                    <Typography>Escanea la primera guía para comenzar</Typography>
                </Box>
            )}
        </Box>
    );
}
